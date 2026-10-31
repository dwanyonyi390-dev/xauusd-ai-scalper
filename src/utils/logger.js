'use strict';

const pino = require('pino');
const env = require('../config/env');

const REDACT_PATHS = [
  'req.headers.authorization',
  'req.headers["x-signature"]',
  '*.password',
  '*.apiKey',
  '*.token',
  '*.secret',
  'OPENAI_API_KEY',
  'TELEGRAM_BOT_TOKEN',
  'MONGODB_URI',
  'MT5_AGENT_SECRET',
  'MT5_API_SECRET',
];

const transport =
  env.NODE_ENV === 'development'
    ? { target: 'pino-pretty', options: { colorize: true, translateTime: 'SYS:standard' } }
    : undefined;

const logger = pino({
  level: env.LOG_LEVEL,
  redact: { paths: REDACT_PATHS, censor: '[REDACTED]' },
  base: { service: 'xauusd-ai-scalper', env: env.NODE_ENV },
  transport,
});

module.exports = logger;