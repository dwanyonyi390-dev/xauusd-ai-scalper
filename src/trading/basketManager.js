// src/trading/basketManager.js
'use strict';

/**
 * Basket profit management (§8).
 *
 * When several positions are open on the same symbol, the basket may be
 * closed once the *combined* net profit meets a target — even if individual
 * positions haven't hit their own targets.
 *
 * Rules:
 *   - Basket profit is computed on NET (after commission+swap).
 *   - Basket target must be positive.
 *   - We never force-close a losing basket to "reset".
 *   - Individual positions with a hard SL hit are excluded from the basket
 *     decision (they've already been closed).
 */

const CONTRACT_OZ = 100;

function _positionNetPnl(trade, market) {
  const dir = trade.direction;
  const closePrice = dir === 'BUY' ? market.bid : market.ask;
  const grossUSD =
    (dir === 'BUY'
      ? closePrice - trade.entryPrice
      : trade.entryPrice - closePrice) * trade.lotSize * CONTRACT_OZ;
  const commission = Math.abs(trade.commissionPerLot || 0) * trade.lotSize;
  const swap = trade.swapUSD || 0;
  return grossUSD - commission - swap;
}

/**
 * Evaluate the basket.
 *
 * @param {object} params
 * @param {Array<object>} params.trades  open trades for this symbol
 * @param {object} params.market         { bid, ask }
 * @param {object} params.settings       { basketProfitTargetUSD, maxBasketRiskUSD }
 * @returns {{ action:'HOLD'|'CLOSE_ALL', netProfit:number, grossUSD:number, costs:number, perTrade:Array }}
 */
function evaluateBasket({ trades, market, settings }) {
  const perTrade = [];
  let netProfit = 0;
  let grossUSD = 0;
  let costs = 0;

  for (const t of trades) {
    const dir = t.direction;
    const closePrice = dir === 'BUY' ? market.bid : market.ask;
    const gross =
      (dir === 'BUY'
        ? closePrice - t.entryPrice
        : t.entryPrice - closePrice) * t.lotSize * CONTRACT_OZ;
    const commission = Math.abs(t.commissionPerLot || 0) * t.lotSize;
    const swap = t.swapUSD || 0;
    const net = gross - commission - swap;

    grossUSD += gross;
    costs += commission + swap;
    netProfit += net;

    perTrade.push({
      tradeId: t.tradeId,
      direction: dir,
      lotSize: t.lotSize,
      entryPrice: t.entryPrice,
      closePrice,
      grossUSD: Number(gross.toFixed(2)),
      commission: Number(commission.toFixed(2)),
      swap: Number(swap.toFixed(2)),
      netProfit: Number(net.toFixed(2)),
    });
  }

  const target = settings.basketProfitTargetUSD;
  const maxRisk = settings.maxBasketRiskUSD;

  let action = 'HOLD';
  if (Number.isFinite(target) && target > 0 && netProfit >= target) {
    action = 'CLOSE_ALL';
  } else if (Number.isFinite(maxRisk) && maxRisk > 0 && netProfit <= -Math.abs(maxRisk)) {
    // Basket stop-loss — closes the basket when aggregate risk is breached.
    action = 'CLOSE_ALL';
  }

  return {
    action,
    netProfit: Number(netProfit.toFixed(2)),
    grossUSD: Number(grossUSD.toFixed(2)),
    costs: Number(costs.toFixed(2)),
    perTrade,
  };
}

module.exports = { evaluateBasket, CONTRACT_OZ };