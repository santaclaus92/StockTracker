import { RSI, MACD, BollingerBands, SMA, EMA } from 'technicalindicators';

// ── Series helpers (return full array aligned to bars) ──────────────────────
function align(bars, values) {
  const offset = bars.length - values.length;
  return values.map((v, i) => ({ time: bars[offset + i].time, ...v }));
}

export function seriesRSI(bars, period = 14) {
  const vals = RSI.calculate({ values: bars.map((b) => b.close), period });
  return align(bars, vals.map((v) => ({ value: v })));
}

export function seriesMACD(bars, fast = 12, slow = 26, signal = 9) {
  const vals = MACD.calculate({
    values: bars.map((b) => b.close),
    fastPeriod: fast, slowPeriod: slow, signalPeriod: signal,
    SimpleMAOscillator: false, SimpleMASignal: false,
  });
  return align(bars, vals.map((v) => ({
    macd:      v.MACD      ?? 0,
    signal:    v.signal    ?? 0,
    histogram: v.histogram ?? 0,
  })));
}

export function seriesBB(bars, period = 20, stdDev = 2) {
  const vals = BollingerBands.calculate({ values: bars.map((b) => b.close), period, stdDev });
  return align(bars, vals.map((v) => ({ upper: v.upper, middle: v.middle, lower: v.lower })));
}

export function seriesSMA(bars, period = 20) {
  const vals = SMA.calculate({ values: bars.map((b) => b.close), period });
  return align(bars, vals.map((v) => ({ value: v })));
}

export function seriesEMA(bars, period = 20) {
  const vals = EMA.calculate({ values: bars.map((b) => b.close), period });
  return align(bars, vals.map((v) => ({ value: v })));
}

export function computeRSI(closes, period = 14) {
  const result = RSI.calculate({ values: closes, period });
  return result.length ? result[result.length - 1] : null;
}

export function computeMACD(closes, { fast = 12, slow = 26, signal = 9 } = {}) {
  const result = MACD.calculate({
    values:              closes,
    fastPeriod:          fast,
    slowPeriod:          slow,
    signalPeriod:        signal,
    SimpleMAOscillator:  false,
    SimpleMASignal:      false,
  });
  return result.length ? result[result.length - 1] : null;
}

export function computeBB(closes, period = 20, stdDev = 2) {
  const result = BollingerBands.calculate({ values: closes, period, stdDev });
  return result.length ? result[result.length - 1] : null;
}

export function computeSMA(closes, period = 20) {
  const result = SMA.calculate({ values: closes, period });
  return result.length ? result[result.length - 1] : null;
}

export function computeEMA(closes, period = 20) {
  const result = EMA.calculate({ values: closes, period });
  return result.length ? result[result.length - 1] : null;
}

// Evaluate a single condition object against current quote + indicator values
// Returns { triggered: bool, message: string }
export function evaluateCondition(condition, quote, closes = []) {
  const { type, threshold } = condition;
  const price = quote.price ?? quote.close;

  switch (type) {
    case 'price_above':
      return check(price > threshold, `Price ${price} > ${threshold}`);
    case 'price_below':
      return check(price < threshold, `Price ${price} < ${threshold}`);
    case 'pct_change_above':
      return check(quote.pct_change > threshold, `Change ${pct(quote.pct_change)} > ${threshold}%`);
    case 'pct_change_below':
      return check(quote.pct_change < threshold, `Change ${pct(quote.pct_change)} < ${threshold}%`);
    case 'volume_spike': {
      // threshold = multiplier vs 20-day avg volume (stored in db or computed)
      return check(false, 'volume_spike requires avg volume context');
    }
    case 'rsi_above': {
      const rsi = computeRSI(closes);
      return check(rsi !== null && rsi > threshold, `RSI ${r(rsi)} > ${threshold}`);
    }
    case 'rsi_below': {
      const rsi = computeRSI(closes);
      return check(rsi !== null && rsi < threshold, `RSI ${r(rsi)} < ${threshold}`);
    }
    case 'macd_crossover': {
      const macd = computeMACD(closes);
      return check(macd !== null && macd.MACD > macd.signal, `MACD crossover (${r(macd?.MACD)} > ${r(macd?.signal)})`);
    }
    case 'macd_crossunder': {
      const macd = computeMACD(closes);
      return check(macd !== null && macd.MACD < macd.signal, `MACD crossunder (${r(macd?.MACD)} < ${r(macd?.signal)})`);
    }
    case '52w_high':
      return check(price >= quote.week52_high, `Price at 52w high (${price})`);
    case '52w_low':
      return check(price <= quote.week52_low, `Price at 52w low (${price})`);
    default:
      return check(false, `Unknown condition type: ${type}`);
  }
}

const check = (triggered, message) => ({ triggered, message });
const pct = (v) => v != null ? v.toFixed(2) : 'N/A';
const r   = (v) => v != null ? Number(v).toFixed(4) : 'N/A';
