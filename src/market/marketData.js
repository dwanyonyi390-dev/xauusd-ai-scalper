'use strict';

/**
 * Market data aggregation and rolling-window storage.
 *
 * The MT5 EA sends tick summaries; the backend aggregates into 1-second and
 * 1-minute buckets and maintains in-memory ring buffers for the latest
 * windows used by the strategy and AI modules.
 *
 * IMPORTANT: In-memory buffers reset on restart. Persistent history lives in
 * MongoDB via MarketTickSummary / MarketAnalysis models.
 */

const logger = require('../utils/logger');

const MAX_TICKS = 3600; // 1 hour of ticks at 1/sec minimum
const MAX_SECONDS = 3600;
const MAX_MINUTES = 500;

class RingBuffer {
  constructor(capacity) {
    this.capacity = capacity;
    this.items = [];
  }
  push(item) {
    this.items.push(item);
    if (this.items.length > this.capacity) this.items.shift();
  }
  toArray() {
    return this.items.slice();
  }
  last(n) {
    return this.items.slice(-n);
  }
  get length() {
    return this.items.length;
  }
}

class MarketDataStore {
  constructor(symbol) {
    this.symbol = symbol;
    this.ticks = new RingBuffer(MAX_TICKS);
    this.secondBuckets = new RingBuffer(MAX_SECONDS);
    this.minuteBuckets = new RingBuffer(MAX_MINUTES);
    this._currentSecond = null;
    this._currentMinute = null;
    this._lastTickTime = null;
    this._lastBid = null;
    this._lastAsk = null;
  }

  /**
   * Ingest a raw tick. Called by the API route when the EA reports ticks,
   * or by the agent polling loop when it fetches tick batches.
   */
  ingestTick({ time, bid, ask }) {
    if (!Number.isFinite(bid) || !Number.isFinite(ask)) {
      logger.warn({ bid, ask }, 'marketdata_invalid_tick');
      return;
    }
    if (bid <= 0 || ask <= 0 || ask < bid) {
      logger.warn({ bid, ask }, 'marketdata_inconsistent_tick');
      return;
    }

    const tsMs = typeof time === 'number' ? time : Date.parse(time);
    if (!Number.isFinite(tsMs)) {
      logger.warn({ time }, 'marketdata_invalid_timestamp');
      return;
    }

    // Ignore stale ticks (older than previous)
    if (this._lastTickTime && tsMs < this._lastTickTime) return;

    const spread = ask - bid;
    const tick = { time: tsMs, bid, ask, spread, mid: (bid + ask) / 2 };
    this.ticks.push(tick);
    this._lastTickTime = tsMs;
    this._lastBid = bid;
    this._lastAsk = ask;

    this._aggregateSecond(tick);
    this._aggregateMinute(tick);
  }

  _aggregateSecond(tick) {
    const secKey = Math.floor(tick.time / 1000);
    if (!this._currentSecond || this._currentSecond.secKey !== secKey) {
      if (this._currentSecond) {
        this._currentSecond.closeSecond();
        this.secondBuckets.push(this._currentSecond.toJSON());
      }
      this._currentSecond = new SecondBucket(secKey, tick);
    } else {
      this._currentSecond.add(tick);
    }
  }

  _aggregateMinute(tick) {
    const minKey = Math.floor(tick.time / 60000);
    if (!this._currentMinute || this._currentMinute.minKey !== minKey) {
      if (this._currentMinute) {
        this._currentMinute.closeMinute();
        this.minuteBuckets.push(this._currentMinute.toJSON());
      }
      this._currentMinute = new MinuteBucket(minKey, tick);
    } else {
      this._currentMinute.add(tick);
    }
  }

  getLatestTick() {
    return this.ticks.items[this.ticks.length - 1] || null;
  }

  getSpread() {
    if (this._lastBid == null || this._lastAsk == null) return null;
    return this._lastAsk - this._lastBid;
  }

  getSeconds(n = 60) {
    return this.secondBuckets.last(n);
  }

  getMinutes(n = 5) {
    return this.minuteBuckets.last(n);
  }

  /**
   * Return arrays suitable for indicator functions.
   */
  getSeries(n = 60) {
    const secs = this.getSeconds(n);
    return {
      closes: secs.map((b) => b.bidClose ?? b.askClose ?? 0).filter((v) => v > 0),
      highs: secs.map((b) => b.bidHigh ?? b.askHigh ?? 0).filter((v) => v > 0),
      lows: secs.map((b) => b.bidLow ?? b.askLow ?? 0).filter((v) => v > 0),
      opens: secs.map((b) => b.bidOpen ?? b.askOpen ?? 0).filter((v) => v > 0),
      timestampsMs: secs.map((b) => b.bucketStart),
      volumes: secs.map((b) => b.tickCount || 0),
    };
  }

  isStale(maxAgeMs = 5000) {
    if (!this._lastTickTime) return true;
    return Date.now() - this._lastTickTime > maxAgeMs;
  }
}

class SecondBucket {
  constructor(secKey, tick) {
    this.secKey = secKey;
    this.bucketStart = secKey * 1000;
    this.bidOpen = tick.bid;
    this.bidHigh = tick.bid;
    this.bidLow = tick.bid;
    this.bidClose = tick.bid;
    this.askOpen = tick.ask;
    this.askHigh = tick.ask;
    this.askLow = tick.ask;
    this.askClose = tick.ask;
    this.tickCount = 1;
    this.spreadSum = tick.spread;
    this.spreadMax = tick.spread;
  }
  add(tick) {
    this.bidHigh = Math.max(this.bidHigh, tick.bid);
    this.bidLow = Math.min(this.bidLow, tick.bid);
    this.bidClose = tick.bid;
    this.askHigh = Math.max(this.askHigh, tick.ask);
    this.askLow = Math.min(this.askLow, tick.ask);
    this.askClose = tick.ask;
    this.tickCount += 1;
    this.spreadSum += tick.spread;
    this.spreadMax = Math.max(this.spreadMax, tick.spread);
  }
  closeSecond() {}
  toJSON() {
    return {
      bucketStart: this.bucketStart,
      bucketMs: 1000,
      bidOpen: this.bidOpen,
      bidHigh: this.bidHigh,
      bidLow: this.bidLow,
      bidClose: this.bidClose,
      askOpen: this.askOpen,
      askHigh: this.askHigh,
      askLow: this.askLow,
      askClose: this.askClose,
      tickCount: this.tickCount,
      avgSpread: this.spreadSum / this.tickCount,
      maxSpread: this.spreadMax,
    };
  }
}

class MinuteBucket {
  constructor(minKey, tick) {
    this.minKey = minKey;
    this.bucketStart = minKey * 60000;
    this.bidOpen = tick.bid;
    this.bidHigh = tick.bid;
    this.bidLow = tick.bid;
    this.bidClose = tick.bid;
    this.askOpen = tick.ask;
    this.askHigh = tick.ask;
    this.askLow = tick.ask;
    this.askClose = tick.ask;
    this.tickCount = 1;
    this.spreadSum = tick.spread;
    this.spreadMax = tick.spread;
  }
  add(tick) {
    this.bidHigh = Math.max(this.bidHigh, tick.bid);
    this.bidLow = Math.min(this.bidLow, tick.bid);
    this.bidClose = tick.bid;
    this.askHigh = Math.max(this.askHigh, tick.ask);
    this.askLow = Math.min(this.askLow, tick.ask);
    this.askClose = tick.ask;
    this.tickCount += 1;
    this.spreadSum += tick.spread;
    this.spreadMax = Math.max(this.spreadMax, tick.spread);
  }
  closeMinute() {}
  toJSON() {
    return {
      bucketStart: this.bucketStart,
      bucketMs: 60000,
      bidOpen: this.bidOpen,
      bidHigh: this.bidHigh,
      bidLow: this.bidLow,
      bidClose: this.bidClose,
      askOpen: this.askOpen,
      askHigh: this.askHigh,
      askLow: this.askLow,
      askClose: this.askClose,
      tickCount: this.tickCount,
      avgSpread: this.spreadSum / this.tickCount,
      maxSpread: this.spreadMax,
    };
  }
}

// Singleton per symbol
const stores = new Map();

function getStore(symbol) {
  if (!stores.has(symbol)) stores.set(symbol, new MarketDataStore(symbol));
  return stores.get(symbol);
}

module.exports = { getStore, MarketDataStore };