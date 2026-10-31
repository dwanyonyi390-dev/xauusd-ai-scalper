# MT5 Agent API — XAUUSD-AI-SCALPER

Base URL (dev): `http://<your-host>:10000`
Base URL (Render): `https://<your-api>.onrender.com`

All endpoints require HMAC authentication.

## Authentication

Every request must include these headers:

| Header | Value |
|---|---|
| `x-agent-id` | value of `MT5_AGENT_ID` in env |
| `x-timestamp` | milliseconds since epoch, decimal string |
| `x-nonce` | hex string, ≥ 32 chars (16 random bytes) |
| `x-signature` | HMAC-SHA256 hex of the canonical string |

### Canonical string (byte-for-byte)
