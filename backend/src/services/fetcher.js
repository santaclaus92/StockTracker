/**
 * Fetcher service — uses Yahoo Finance v8 chart API directly.
 *
 * No crumb needed, no third-party library quirks.
 * Endpoint: https://query1.finance.yahoo.com/v8/finance/chart/{symbol}
 */

import db from '../db/database.js';

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const YF_HEADERS = {
  'User-Agent':      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
  'Accept':          'application/json',
  'Accept-Language': 'en-US,en;q=0.9',
};

// ── Yahoo Finance v8 helpers ───────────────────────────────────────────────

async function yfChart(symbol, params = {}) {
  const qs = new URLSearchParams({ interval: '1d', range: '5d', ...params }).toString();
  const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?${qs}`;

  const res = await fetch(url, { headers: YF_HEADERS });
  if (!res.ok) throw new Error(`HTTP ${res.status} for ${symbol}`);

  const json = await res.json();
  if (json.chart?.error) throw new Error(json.chart.error.description ?? 'Yahoo error');

  return json.chart?.result?.[0] ?? null;
}

// Real-time quote — returns latest bar + meta
export async function yfQuote(symbol) {
  const result = await yfChart(symbol, { interval: '1d', range: '5d' });
  if (!result) throw new Error(`No data for ${symbol}`);

  const meta = result.meta;
  const bars  = result.indicators?.quote?.[0] ?? {};
  const ts    = result.timestamp ?? [];
  const last  = ts.length - 1;

  // Prefer the last completed bar for OHLCV
  const open   = bars.open?.[last]   ?? null;
  const high   = bars.high?.[last]   ?? null;
  const low    = bars.low?.[last]    ?? null;
  const close  = bars.close?.[last]  ?? meta.regularMarketPrice ?? null;
  const volume = bars.volume?.[last] ?? meta.regularMarketVolume ?? null;

  const prev      = meta.chartPreviousClose ?? null;
  const pctChange = (close && prev) ? ((close - prev) / prev) * 100 : null;

  return {
    symbol,
    name:        meta.longName ?? meta.shortName ?? symbol,
    price:       close,
    open,
    high,
    low,
    volume,
    pct_change:  pctChange,
    week52_high: meta.fiftyTwoWeekHigh ?? null,
    week52_low:  meta.fiftyTwoWeekLow  ?? null,
    prev_close:  prev,
    currency:    meta.currency ?? 'MYR',
    updated_at:  new Date().toISOString(),
  };
}

// Historical OHLCV — uses period1/period2 Unix timestamps
export async function yfHistory(symbol, from, to = new Date()) {
  const period1 = Math.floor(new Date(from).getTime() / 1000);
  const period2 = Math.floor(new Date(to).getTime()  / 1000);

  const result = await yfChart(symbol, { interval: '1d', period1, period2 });
  if (!result) return [];

  const ts   = result.timestamp ?? [];
  const bars = result.indicators?.quote?.[0] ?? {};

  return ts.map((t, i) => ({
    date:   new Date(t * 1000).toISOString(),
    open:   bars.open?.[i]   ?? null,
    high:   bars.high?.[i]   ?? null,
    low:    bars.low?.[i]    ?? null,
    close:  bars.close?.[i]  ?? null,
    volume: bars.volume?.[i] ?? null,
  })).filter((r) => r.close != null);
}

// ── Public API ─────────────────────────────────────────────────────────────

export async function fetchStock(symbol, stockId) {
  try {
    const q = await yfQuote(symbol);

    await db.execute({
      sql: `INSERT INTO latest_price (stock_id, price, open, high, low, week52_high, week52_low, volume, pct_change, updated_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            ON CONFLICT(stock_id) DO UPDATE SET
              price=excluded.price, open=excluded.open, high=excluded.high, low=excluded.low,
              week52_high=COALESCE(excluded.week52_high, latest_price.week52_high),
              week52_low=COALESCE(excluded.week52_low, latest_price.week52_low),
              volume=excluded.volume, pct_change=excluded.pct_change, updated_at=excluded.updated_at`,
      args: [stockId, q.price, q.open, q.high, q.low, q.week52_high, q.week52_low, q.volume, q.pct_change, q.updated_at],
    });

    if (q.price) {
      await db.execute({
        sql: 'INSERT OR IGNORE INTO price_history (stock_id, ts, open, high, low, close, volume) VALUES (?, ?, ?, ?, ?, ?, ?)',
        args: [stockId, q.updated_at, q.open, q.high, q.low, q.price, q.volume],
      });
    }

    // Update stock name if we got a better one
    if (q.name && q.name !== symbol) {
      await db.execute({
        sql: 'UPDATE stocks SET name = ? WHERE id = ? AND name = ?',
        args: [q.name, stockId, symbol],
      });
    }

    return q;
  } catch (err) {
    console.warn(`[fetcher] ${symbol}: ${err.message}`);
    return null;
  }
}

export async function fetchHistory(symbol, stockId, from, to = new Date()) {
  try {
    const rows = await yfHistory(symbol, from, to);
    if (!rows.length) return 0;

    await db.batch(
      rows.map((r) => ({
        sql: 'INSERT OR IGNORE INTO price_history (stock_id, ts, open, high, low, close, volume) VALUES (?, ?, ?, ?, ?, ?, ?)',
        args: [stockId, r.date, r.open, r.high, r.low, r.close, r.volume],
      })),
      'write'
    );

    // Recompute 52w high/low from stored history
    const { rows: w52 } = await db.execute({
      sql: `SELECT MAX(high) AS h52, MIN(low) AS l52 FROM price_history
            WHERE stock_id = ? AND ts >= date('now', '-1 year') AND high IS NOT NULL`,
      args: [stockId],
    });

    if (w52[0]?.h52) {
      await db.execute({
        sql: 'UPDATE latest_price SET week52_high = ?, week52_low = ? WHERE stock_id = ?',
        args: [w52[0].h52, w52[0].l52, stockId],
      });
    }

    return rows.length;
  } catch (err) {
    console.warn(`[history] ${symbol}: ${err.message}`);
    return 0;
  }
}

export async function fetchFavourites() {
  const { rows: favs } = await db.execute({
    sql: 'SELECT s.id, s.symbol FROM stocks s JOIN favourites f ON f.stock_id = s.id',
    args: [],
  });

  let ok = 0;
  for (const { id, symbol } of favs) {
    const r = await fetchStock(symbol, id);
    if (r?.price) ok++;
    await sleep(250);
  }
  console.log(`[fetcher] refreshed ${ok}/${favs.length} favourites`);
}

export async function fetchAll() {
  const { rows: stocks } = await db.execute({
    sql: 'SELECT id, symbol FROM stocks',
    args: [],
  });
  let ok = 0;
  for (const { id, symbol } of stocks) {
    const r = await fetchStock(symbol, id);
    if (r?.price) ok++;
    await sleep(250);
  }
  console.log(`[fetcher] refreshed ${ok}/${stocks.length} stocks`);
}
