// backtesting/performanceMetrics.js
'use strict';
function profitFactor(trades) {
  const grossWin = trades.filter((t) => t.net > 0).reduce((a, t) => a + t.net, 0);
  const grossLoss = Math.abs(trades.filter((t) => t.net < 0).reduce((a, t) => a + t.net, 0));
  return grossLoss > 0 ? grossWin / grossLoss : null;
}
function expectancy(trades) {
  if (!trades.length) return null;
  return trades.reduce((a, t) => a + t.net, 0) / trades.length;
}
function maxDrawdown(trades) {
  let eq = 0, peak = 0, dd = 0;
  for (const t of trades) { eq += t.net; peak = Math.max(peak, eq); dd = Math.max(dd, peak - eq); }
  return dd;
}
module.exports = { profitFactor, expectancy, maxDrawdown };