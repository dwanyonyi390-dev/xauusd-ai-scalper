'use strict';

/**
 * Per-position profit-taking engine (§8).
 *
 * Pure functions. The MT5 EA enforces exits locally; this module provides
 * the *decision rule* used by the EA (via settings payload) and by any
 * cloud-side simulation/backtest.
 *
 * Exit rule priority (highest first):
 *   1. STOP_LOSS        — broker-side protective SL hit
 *   2. EMERGENCY        — emergency stop engaged
 *   3. MAX_HOLD         — holding time exceeded
 *   4. MOMENTUM_FADE    — momentum collapsed against position
 *   5. REVERSAL         — reversal pattern against position
 *   6. TRAILING         — trailing stop hit
 *   7. PROFIT_TARGET    — net profit >= configured target
 */

/**
 * @param {object} params
 * @param {object} params.trade       { direction, entryPrice, lotSize, stopLoss, takeProfit }
 * @param {object} params.market      { bid, ask, spread }
 * @param {object} params.account     { commissionPerLot=0, swapUSD=0 }
 * @param {object} params.settings    { defaultProfitTarget, maxHoldSeconds, trailingStartUSD, trailingLockUSD }
 * @param {object} params.snapshot    indicator snapshot (for momentum/reversal)
 * @param {object} params.tradeState  { openedAt (ms), trailHigh, trailLow }
 * @returns {{ exit: boolean, reason: string|null, netProfit: number, diagnostics: object }}
 */
function evaluateExit({ trade, market, account, settings, snapshot, tradeState }) {
  const now = Date.now();
  const dir = trade.direction;
  const closePrice = dir === 'BUY' ? market.bid : market.ask;
  const openPrice = trade.entryPrice;

  // Net profit calc (XAUUSD: 1 lot = 100 oz)
  const CONTRACT_OZ = 100;
  const grossUSD =
    (dir === 'BUY' ? closePrice - openPrice : openPrice - closePrice) *
    trade.lotSize * CONTRACT_OZ;
  const commission = (account.commissionPerLot || 0) * trade.lotSize;
  const swap = account.swapUSD || 0;
  const netProfit = grossUSD - Math.abs(commission) - swap;

  const diagnostics = {
    closePrice,
    grossUSD: Number(grossUSD.toFixed(2)),
    commission: Number(commission.toFixed(2)),
    swap: Number(swap.toFixed(2)),
    netProfit: Number(netProfit.toFixed(2)),
    holdSeconds: tradeState.openedAt ? Math.floor((now - tradeState.openedAt) / 1000) : null,
  };

  // 1. STOP LOSS
  if (trade.stopLoss != null) {
    const hitSL =
      (dir === 'BUY' && closePrice <= trade.stopLoss) ||
      (dir === 'SELL' && closePrice >= trade.stopLoss);
    if (hitSL) return { exit: true, reason: 'STOP_LOSS', netProfit, diagnostics };
  }

  // 2. EMERGENCY (caller sets settings.emergency)
  if (settings.emergency) return { exit: true, reason: 'EMERGENCY', netProfit, diagnostics };

  // 3. MAX HOLD
  if (diagnostics.holdSeconds != null && settings.maxHoldSeconds > 0) {
    if (diagnostics.holdSeconds >= settings.maxHoldSeconds) {
      return { exit: true, reason: 'MAX_HOLD', netProfit, diagnostics };
    }
  }

  // 4. MOMENTUM FADE
  const velocity = snapshot?.velocity;
  if (Number.isFinite(velocity)) {
    const adverse = (dir === 'BUY' && velocity < 0) || (dir === 'SELL' && velocity > 0);
    if (adverse && netProfit > 0 && Math.abs(velocity) > (snapshot.atr14 || 0) * 0.1) {
      return { exit: true, reason: 'MOMENTUM_FADE', netProfit, diagnostics };
    }
  }

  // 5. TRAILING — track from tradeState.trailHigh / trailLow
  if (Number.isFinite(settings.trailingStartUSD) && tradeState.trailHigh != null) {
    const bestProfit =
      (dir === 'BUY'
        ? (tradeState.trailHigh - openPrice)
        : (openPrice - tradeState.trailLow)) * trade.lotSize * CONTRACT_OZ;
    if (bestProfit >= settings.trailingStartUSD) {
      const locked =
        (dir === 'BUY'
          ? (closePrice - (tradeState.trailHigh - settings.trailingLockUSD / (trade.lotSize * CONTRACT_OZ)))
          : ((tradeState.trailLow + settings.trailingLockUSD / (trade.lotSize * CONTRACT_OZ)) - closePrice))
        * trade.lotSize * CONTRACT_OZ;
      if (locked <= 0 && netProfit > 0) {
        return { exit: true, reason: 'TRAILING', netProfit, diagnostics };
      }
    }
  }

  // 6. PROFIT TARGET — must use net profit, NOT gross
  if (Number.isFinite(settings.defaultProfitTarget) && netProfit >= settings.defaultProfitTarget) {
    return { exit: true, reason: 'PROFIT_TARGET', netProfit, diagnostics };
  }

  return { exit: false, reason: null, netProfit, diagnostics };
}

/**
 * Update the trailing high/low trackers.
 */
function updateTrail(trade, market, tradeState) {
  const bid = market.bid, ask = market.ask;
  if (trade.direction === 'BUY') {
    tradeState.trailHigh = Math.max(tradeState.trailHigh ?? bid, bid);
  } else {
    tradeState.trailLow = Math.min(tradeState.trailLow ?? ask, ask);
  }
  return tradeState;
}

module.exports = { evaluateExit, updateTrail };