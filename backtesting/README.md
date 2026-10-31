# Backtesting

`backtest.js <file.jsonl>` — replays ticks through the strategy and profit manager.
Each line: `{"time":<epochMs>,"bid":<num>,"ask":<num>}`.

Rules:
- Never claim profitability from a single backtest.
- Report sample size, commission, spread, and slippage assumptions.
- Use walk-forward (`walkForward.js`) to detect overfitting.