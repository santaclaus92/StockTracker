import { Router } from 'express';
import { RSI, MACD, BollingerBands, SMA, EMA } from 'technicalindicators';

const router = Router();

const YF_HEADERS = {
  'User-Agent':      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
  'Accept':          'application/json',
  'Accept-Language': 'en-US,en;q=0.9',
};

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// ── Yahoo Finance v8 chart fetch ───────────────────────────────────────────

async function yfChartRaw(symbol, period1, period2, interval = '1h') {
  const url =
    `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}` +
    `?interval=${interval}&period1=${period1}&period2=${period2}`;

  const res = await fetch(url, { headers: YF_HEADERS });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const json = await res.json();
  if (json.chart?.error) throw new Error(json.chart.error.description ?? 'Yahoo error');
  return json.chart?.result?.[0] ?? null;
}

function parseBars(result) {
  if (!result) return [];
  const ts   = result.timestamp ?? [];
  const q    = result.indicators?.quote?.[0] ?? {};
  return ts
    .map((t, i) => ({
      time:   t,                         // Unix seconds
      open:   q.open?.[i]   ?? null,
      high:   q.high?.[i]   ?? null,
      low:    q.low?.[i]    ?? null,
      close:  q.close?.[i]  ?? null,
      volume: q.volume?.[i] ?? null,
    }))
    .filter((b) => b.close != null && b.open != null);
}

// Chunked fetch for 1h (55-day windows) or 1d (single call)
async function fetchBars(symbol, days, interval) {
  const now    = Math.floor(Date.now() / 1000);
  const oldest = now - days * 24 * 3600;

  if (interval === '1d') {
    // Daily bars — single call handles years
    const result = await yfChartRaw(symbol, oldest, now, '1d');
    return parseBars(result);
  }

  // Intraday (1h) — chunk into 55-day windows
  const CHUNK   = 55 * 24 * 3600;
  const barMap  = new Map();
  let   chunkEnd = now;

  while (chunkEnd > oldest) {
    const chunkStart = Math.max(chunkEnd - CHUNK, oldest);
    try {
      const result = await yfChartRaw(symbol, chunkStart, chunkEnd, interval);
      for (const b of parseBars(result)) {
        barMap.set(b.time, b); // deduplicate by timestamp
      }
    } catch {
      /* skip bad chunk */
    }
    chunkEnd -= CHUNK;
    await sleep(300);
  }

  return [...barMap.values()].sort((a, b) => a.time - b.time);
}

// ── Indicator computation ──────────────────────────────────────────────────

function rightAlign(values, timestamps) {
  const offset = timestamps.length - values.length;
  return values.map((v, i) => ({ time: timestamps[i + offset], value: v }));
}

function rightAlignObj(values, timestamps) {
  const offset = timestamps.length - values.length;
  return values.map((v, i) => ({ time: timestamps[i + offset], ...v }));
}

function computeIndicators(bars) {
  const closes  = bars.map((b) => b.close);
  const highs   = bars.map((b) => b.high);
  const lows    = bars.map((b) => b.low);
  const ts      = bars.map((b) => b.time);

  // RSI 14
  const rsiRaw = RSI.calculate({ values: closes, period: 14 });
  const rsi    = rightAlign(rsiRaw, ts);

  // MACD 12/26/9
  const macdRaw = MACD.calculate({
    values: closes, fastPeriod: 12, slowPeriod: 26, signalPeriod: 9,
    SimpleMAOscillator: false, SimpleMASignal: false,
  });
  const macd = rightAlignObj(
    macdRaw.map((m) => ({ macd: m.MACD ?? 0, signal: m.signal ?? 0, histogram: m.histogram ?? 0 })),
    ts
  );

  // Bollinger Bands 20/2
  const bbRaw = BollingerBands.calculate({ values: closes, period: 20, stdDev: 2 });
  const bb    = rightAlignObj(
    bbRaw.map((b) => ({ upper: b.upper, middle: b.middle, lower: b.lower })),
    ts
  );

  // SMA 20 & 50
  const sma20Raw = SMA.calculate({ values: closes, period: 20 });
  const sma50Raw = SMA.calculate({ values: closes, period: 50 });
  const sma20    = rightAlign(sma20Raw, ts);
  const sma50    = rightAlign(sma50Raw, ts);

  // EMA 20
  const ema20Raw = EMA.calculate({ values: closes, period: 20 });
  const ema20    = rightAlign(ema20Raw, ts);

  return { rsi, macd, bb, sma20, sma50, ema20 };
}

// ── Route ──────────────────────────────────────────────────────────────────

// GET /api/chart/:symbol?interval=1h&days=730
router.get('/:symbol', async (req, res) => {
  const symbol   = req.params.symbol.toUpperCase();
  const interval = ['1h', '1d'].includes(req.query.interval) ? req.query.interval : '1h';
  const days     = Math.min(730, Math.max(7, parseInt(req.query.days || '730', 10)));

  try {
    const bars = await fetchBars(symbol, days, interval);

    if (!bars.length) {
      return res.status(404).json({ error: 'No data returned for this symbol/range.' });
    }

    const indicators = computeIndicators(bars);

    // Summary stats
    const last    = bars[bars.length - 1];
    const prev    = bars[bars.length - 2];
    const pctChg  = prev ? ((last.close - prev.close) / prev.close) * 100 : null;
    const allH    = bars.map((b) => b.high);
    const allL    = bars.map((b) => b.low);

    res.json({
      symbol,
      interval,
      days,
      totalBars: bars.length,
      from: new Date(bars[0].time    * 1000).toISOString(),
      to:   new Date(last.time       * 1000).toISOString(),
      summary: {
        lastClose:   last.close,
        lastVolume:  last.volume,
        pctChange:   pctChg,
        periodHigh:  Math.max(...allH),
        periodLow:   Math.min(...allL),
      },
      ohlcv:       bars,
      indicators,
    });
  } catch (err) {
    console.error('[chart]', symbol, err.message);
    res.status(500).json({ error: err.message });
  }
});

export default router;
