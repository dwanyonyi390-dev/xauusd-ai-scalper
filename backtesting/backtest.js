// backtesting/backtest.js
'use strict';

/**
 * Offline backtest harness (§19).
 *
 * Feed: JSON lines or array of { time, bid, ask }.
 * Uses the SAME profitManager / riskManager / strategy the live system uses.
 *
 * NOT a profitability guarantee. Results must be reviewed with sample size
 * and slippage assumptions.
 */

const fs = require('fs');
const path = require('path');
const { MarketDataStore } = require('../src/market/marketData');
const { evaluate } = require('../src/trading/strategy');
const { validate } = require('../src/trading/signalValidator');
const profitManager = require('../src/trading/profitManager');
const riskManager = require('../src/trading/riskManager');

function loadTicks(file) {
  const raw = fs.readFileSync(file, 'utf8');
  return raw
    .split(/\r?\n/)
    .filter(Boolean)
    .map((l) => JSON.parse(l));
}

function runBacktest({ ticks, settings, startingEquity = 10_000 }) {
  const store = new MarketDataStore(settings.symbol || 'XAUUSD');
  const trades = [];
  let equity = startingEquity;
  let openTrade = null;
  let openState = null;

  for (const t of ticks) {
    store.ingestTick(t);

    if (openTrade) {
      const exit = profitManager.evaluateExit({
        trade: openTrade,
        market: { bid: t.bid, ask: t.ask, spread: t.ask - t.bid },
        account: { commissionPerLot: 7, swapUSD: 0 },
        settings,
        snapshot: {},
        tradeState: openState,
      });
      if (exit.exit) {
        equity += exit.netProfit;
        trades.push({
          direction: openTrade.direction,
          entry: openTrade.entryPrice,
          exit: exit.diagnostics.closePrice,
          net: exit.netProfit,
          reason: exit.reason,
        });
        openTrade = null;
        openState = null;
      }
      continue;
    }

    const sig = evaluate(store, settings, {
      spread: t.ask - t.bid,
      spreadAvg: t.ask - t.bid,
    });
    const v = validate(sig, settings);
    if (!v.ok || v.signal.direction === 'NO_TRADE') continue;

    openTrade = {
      direction: v.signal.direction,
      entryPrice: v.signal.entryPrice,
      lotSize: settings.defaultLotSize,
      stopLoss: v.signal.stopLoss,
      takeProfit: v.signal.takeProfit,
    };
    openState = { openedAt: t.time };
  }

  const wins = trades.filter((x) => x.net > 0).length;
  const losses = trades.filter((x) => x.net < 0).length;
  return {
    startingEquity,
    endingEquity: equity,
    trades: trades.length,
    wins,
    losses,
    winRate: wins + losses > 0 ? wins / (wins + losses) : 0,
    netPnl: equity - startingEquity,
    tradeLog: trades,
  };
}

if (require.main === module) {
  const file = process.argv[2];
  if (!file) {
    console.error('Usage: node backtesting/backtest.js <ticks.jsonl>');
    process.exit(1);
  }
  const settings = {
    symbol: 'XAUUSD',
    defaultLotSize: 0.01,
    defaultProfitTarget: 0.5,
    maxHoldSeconds: 60,
    riskPercent: 0.5,
    maxSpread: 100,
    maxPositions: 4,
    maxDailyLossPercent: 2,
    maxConsecutiveLosses: 3,
    maxAccountExposurePercent: 20,
    minSignalQuality: 40,
    tradingEnabled: true,
    paused: false,
    emergency: false,
  };
  const ticks = loadTicks(path.resolve(file));
  const result = runBacktest({ ticks, settings });
  console.log(JSON.stringify(result, null, 2));
}

module.exports = { runBacktest, loadTicks };