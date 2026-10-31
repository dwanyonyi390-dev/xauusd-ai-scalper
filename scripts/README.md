# XAUUSD-AI-SCALPER

**Status: Phase 1 complete — scaffold, config, logging, health endpoint.**

AI-assisted XAUUSD scalping system. Node.js backend on Render + native MQL5
Expert Advisor on a Windows VPS. **No profit guarantee. No martingale. Demo
first. Live only after explicit authorization and demo validation.**

## Reality check (read this)

- This repository will not make money by itself. Scalping gold at sub-minute
  horizons is highly sensitive to spread, commission, slippage and broker
  execution quality.
- The first demo results should be expected to be **negative or break-even**.
  That is normal and is exactly why Phase 12 (demo forward test) exists.
- No code here promises zero drawdown or guaranteed profit.

## Phase roadmap (see master prompt §22)

| Phase | Deliverable | Status |
|-------|-------------|--------|
| 1 | Scaffold, config, logging, health endpoint | ✅ done |
| 2 | Express API, MongoDB models | ⏳ next |
| 3 | Telegram bot + commands | ⏳ |
| 4 | MT5 agent auth + HMAC | ⏳ |
| 5 | MQL5 EA + tick collection | ⏳ |
| 6 | Technical analysis + strategy | ⏳ |
| 7 | AI + news integration | ⏳ |
| 8 | Position / profit / basket mgmt | ⏳ |
| 9 | Risk engine + emergency | ⏳ |
| 10 | Backtesting + tests | ⏳ |
| 11 | Render deploy + MT5 VPS install | ⏳ |
| 12 | Demo forward test | ⏳ (gate) |
| 13 | Production review + live auth | ⏳ (user only) |

## Quick start (Phase 1)

```bash
npm install
cp .env.example .env      # or: npm run setup
# edit .env with real values
npm run validate:env
npm run dev
curl http://localhost:10000/health