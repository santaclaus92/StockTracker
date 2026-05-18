import yahooFinance from 'yahoo-finance2';
import db from '../db/database.js';

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// yahoo-finance2 v2.14+ requires instantiation
const yf = new yahooFinance();

const YF_HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  'Accept': 'application/json',
};

// Fetch OHLCV history via Yahoo Finance chart API (replaces yahooFinance.historical)
async function yfChartHistory(symbol, period1, period2, interval = '1d') {
  const p1 = Math.floor(new Date(period1).getTime() / 1000);
  const p2 = Math.floor(new Date(period2).getTime() / 1000);
  const url = `https://query1.finance.yahoo.com/v8/finance/chart/${symbol}?period1=${p1}&period2=${p2}&interval=${interval}&events=history`;
  try {
    const res  = await fetch(url, { headers: YF_HEADERS });
    if (!res.ok) { console.warn(`[history] ${symbol}: HTTP ${res.status}`); return []; }
    const json = await res.json();
    const result = json?.chart?.result?.[0];
    if (!result) return [];
    const timestamps = result.timestamp ?? [];
    const q = result.indicators?.quote?.[0] ?? {};
    return timestamps.map((ts, i) => ({
      date:   new Date(ts * 1000),
      open:   q.open?.[i]   ?? null,
      high:   q.high?.[i]   ?? null,
      low:    q.low?.[i]    ?? null,
      close:  q.close?.[i]  ?? null,
      volume: q.volume?.[i] ?? null,
    })).filter((r) => r.close != null);
  } catch (err) {
    console.warn(`[history] ${symbol}:`, err.message);
    return [];
  }
}

async function upsertLatest(stockId, quote) {
  const now = new Date().toISOString();
  await db.execute({
    sql: `INSERT INTO latest_price (stock_id, price, open, high, low, week52_high, week52_low, volume, pct_change, updated_at)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
          ON CONFLICT(stock_id) DO UPDATE SET
            price=excluded.price, open=excluded.open, high=excluded.high, low=excluded.low,
            week52_high=excluded.week52_high, week52_low=excluded.week52_low,
            volume=excluded.volume, pct_change=excluded.pct_change, updated_at=excluded.updated_at`,
    args: [
      stockId,
      quote.regularMarketPrice         ?? null,
      quote.regularMarketOpen          ?? null,
      quote.regularMarketDayHigh       ?? null,
      quote.regularMarketDayLow        ?? null,
      quote.fiftyTwoWeekHigh           ?? null,
      quote.fiftyTwoWeekLow            ?? null,
      quote.regularMarketVolume        ?? null,
      quote.regularMarketChangePercent ?? null,
      now,
    ],
  });

  await db.execute({
    sql: `INSERT OR IGNORE INTO price_history (stock_id, ts, interval, open, high, low, close, volume)
          VALUES (?, ?, '1d', ?, ?, ?, ?, ?)`,
    args: [
      stockId, now,
      quote.regularMarketOpen    ?? null,
      quote.regularMarketDayHigh ?? null,
      quote.regularMarketDayLow  ?? null,
      quote.regularMarketPrice   ?? null,
      quote.regularMarketVolume  ?? null,
    ],
  });
}

export async function fetchStock(symbol, stockId) {
  try {
    const quote = await yf.quote(symbol, {}, { validateResult: false });
    await upsertLatest(stockId, quote);
    return quote;
  } catch (err) {
    console.warn(`[fetcher] ${symbol}:`, err.message);
    return null;
  }
}

export async function fetchHistory(symbol, stockId, period1, period2 = new Date(), interval = '1d') {
  const safeInterval = ['1d', '1wk', '1mo', '1h', '15m'].includes(interval) ? interval : '1d';
  try {
    const rows = await yfChartHistory(symbol, period1, period2, safeInterval);
    for (const r of rows) {
      await db.execute({
        sql:  `INSERT OR REPLACE INTO price_history (stock_id, ts, interval, open, high, low, close, volume)
               VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        args: [stockId, r.date.toISOString(), safeInterval, r.open, r.high, r.low, r.close, r.volume],
      });
    }
    return rows.length;
  } catch (err) {
    console.warn(`[history] ${symbol}:`, err.message);
    return 0;
  }
}

export async function fetchFavourites() {
  const result = await db.execute(`
    SELECT s.id, s.symbol FROM stocks s
    JOIN favourites f ON f.stock_id = s.id
  `);
  const favs = result.rows;
  for (const { id, symbol } of favs) {
    await fetchStock(symbol, id);
  }
  console.log(`[fetcher] refreshed ${favs.length} favourites`);
}

export async function fetchAll() {
  const result = await db.execute('SELECT id, symbol FROM stocks');
  const stocks = result.rows;
  let ok = 0;
  for (const { id, symbol } of stocks) {
    const res = await fetchStock(symbol, id);
    if (res) ok++;
    await sleep(100);
  }
  console.log(`[fetcher] refreshed ${ok}/${stocks.length} stocks`);
}
