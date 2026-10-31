'use strict';

class AppError extends Error {
  constructor(message, { code = 'APP_ERROR', statusCode = 500, retryable = false, meta = {} } = {}) {
    super(message);
    this.name = this.constructor.name;
    this.code = code;
    this.statusCode = statusCode;
    this.retryable = retryable;
    this.meta = meta;
    Error.captureStackTrace?.(this, this.constructor);
  }
}

class ValidationError extends AppError {
  constructor(message, meta) {
    super(message, { code: 'VALIDATION_ERROR', statusCode: 400, meta });
  }
}

class AuthError extends AppError {
  constructor(message = 'Unauthorized', meta) {
    super(message, { code: 'AUTH_ERROR', statusCode: 401, meta });
  }
}

class RiskHaltError extends AppError {
  constructor(message, meta) {
    super(message, { code: 'RISK_HALT', statusCode: 409, meta });
  }
}

class BrokerError extends AppError {
  constructor(message, meta) {
    super(message, { code: 'BROKER_ERROR', statusCode: 502, retryable: true, meta });
  }
}

module.exports = { AppError, ValidationError, AuthError, RiskHaltError, BrokerError };