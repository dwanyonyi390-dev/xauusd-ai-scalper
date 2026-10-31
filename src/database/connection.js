'use strict';

const mongoose = require('mongoose');
const env = require('../config/env');
const logger = require('../utils/logger');

let isConnected = false;
let retryTimer = null;

const OPTIONS = {
  serverSelectionTimeoutMS: 10_000,
  socketTimeoutMS: 45_000,
  maxPoolSize: 10,
  autoIndex: env.NODE_ENV !== 'production', // build indexes explicitly in prod
};

async function connect() {
  if (isConnected) return mongoose.connection;

  if (!env.MONGODB_URI) {
    throw new Error('[db] MONGODB_URI is not set — cannot connect.');
  }

  mongoose.connection.on('disconnected', () => {
    isConnected = false;
    logger.warn('[db] disconnected');
    scheduleRetry();
  });

  mongoose.connection.on('reconnected', () => {
    isConnected = true;
    logger.info('[db] reconnected');
  });

  mongoose.connection.on('error', (err) => {
    logger.error({ err: err.message }, '[db] connection error');
  });

  try {
    await mongoose.connect(env.MONGODB_URI, OPTIONS);
    isConnected = true;
    logger.info('[db] connected');
    return mongoose.connection;
  } catch (err) {
    logger.error({ err: err.message }, '[db] initial connect failed');
    scheduleRetry();
    throw err;
  }
}

function scheduleRetry() {
  if (retryTimer) return;
  retryTimer = setTimeout(async () => {
    retryTimer = null;
    try {
      await connect();
    } catch {
      scheduleRetry();
    }
  }, 5_000);
  retryTimer.unref?.();
}

async function disconnect() {
  if (retryTimer) {
    clearTimeout(retryTimer);
    retryTimer = null;
  }
  if (isConnected) {
    await mongoose.disconnect();
    isConnected = false;
    logger.info('[db] disconnected cleanly');
  }
}

function status() {
  return {
    connected: isConnected,
    readyState: mongoose.connection.readyState,
    name: mongoose.connection.name || null,
  };
}

module.exports = { connect, disconnect, status, mongoose };