/**
 * Test 15-minute intraday data fetch for MAYBANK (1155.KL)
 * Yahoo Finance limits: 15m interval → max ~60 days per request
 * Strategy: chunk into 60-day windows, walk back 365 days
 */

const SYMBOL = '1155.KL';

const YF_HEADERS = {
  'User-Agent':      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
  'Accept':          'application/json',
  'Accept-Language': 'en-US,en;q=0.9',
};

const sleep = (ms) => new Promise(r => setTimeout(r, ms));

async function yfChartRaw(symbol, period1, period2, interval = '15m') {
  const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}` +
    `?interval=${interval}&period1=${period1}&period2=${period2}`;

  const res = await fetch(url, { headers: YF_HEADERS });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const json = await res.json();
  if (json.chart?.error) throw new Error(json.chart.error.description);
  return json.chart?.result?.[0] ?? null;
}

function parseBars(result) {
  if (!result) return [];
  const ts   = result.timestamp ?? [];
  const bars = result.indicators?.quote?.[0] ?? {};
  return ts.map((t, i) => ({
    ts:     new Date(t * 1000).toISOString(),
    open:   bars.open?.[i]   ?? null,
    high:   bars.high?.[i]   ?? null,
    low:    bars.low?.[i]    ?? null,
    close:  bars.close?.[i]  ?? null,
    volume: bars.volume?.[i] ?? null,
  })).filter(r => r.close != null);
}

// --- Test 1: Check how far back 15m data goes ---
console.log('=== Test 1: Single 15m request (last 60 days) ===');
try {
  const now    = Math.floor(Date.now() / 1000);
  const ago60  = now - 60 * 24 * 3600;
  const result = await yfChartRaw(SYMBOL, ago60, now, '15m');
  const bars   = parseBars(result);
  console.log(`✅ 15m bars (60-day window): ${bars.length} bars`);
  if (bars.length) {
    console.log(`   First: ${bars[0].ts}  close=${bars[0].close}`);
    console.log(`   Last:  ${bars[bars.length-1].ts}  close=${bars[bars.length-1].close}`);
  }
} catch (e) {
  console.error('❌ 15m fetch failed:', e.message);
}

await sleep(500);

// --- Test 2: Walk back 365 days in 60-day chunks ---
console.log('\n=== Test 2: Chunked 365-day fetch (60d per chunk) ===');

const allBars = [];
const now     = Math.floor(Date.now() / 1000);
const CHUNK   = 55 * 24 * 3600; // 55 days per chunk (safe margin)
const TOTAL   = 365 * 24 * 3600;

let chunkEnd   = now;
let chunkStart = chunkEnd - CHUNK;
const oldest   = now - TOTAL;
let chunkNum   = 0;
let errors     = 0;

while (chunkEnd > oldest) {
  chunkStart = Math.max(chunkStart, oldest);
  chunkNum++;
  process.stdout.write(`  Chunk ${chunkNum}: ${new Date(chunkStart*1000).toISOString().slice(0,10)} → ${new Date(chunkEnd*1000).toISOString().slice(0,10)} ... `);

  try {
    const result = await yfChartRaw(SYMBOL, chunkStart, chunkEnd, '15m');
    const bars   = parseBars(result);
    // deduplicate by ts
    const newBars = bars.filter(b => !allBars.some(x => x.ts === b.ts));
    allBars.push(...newBars);
    console.log(`${bars.length} bars (+${newBars.length} new) — total: ${allBars.length}`);
  } catch (e) {
    errors++;
    console.log(`❌ ${e.message}`);
  }

  chunkEnd   -= CHUNK;
  chunkStart -= CHUNK;
  await sleep(400); // rate-limit courtesy
}

allBars.sort((a, b) => a.ts.localeCompare(b.ts));

console.log(`\n=== Results ===`);
console.log(`Total 15m bars fetched: ${allBars.length}`);
console.log(`Chunks: ${chunkNum} (${errors} errors)`);
if (allBars.length) {
  console.log(`Date range: ${allBars[0].ts} → ${allBars[allBars.length-1].ts}`);
  console.log(`Sample (first 3):`, allBars.slice(0, 3));
  console.log(`Sample (last 3): `, allBars.slice(-3));

  // Trading days covered
  const days = new Set(allBars.map(b => b.ts.slice(0, 10))).size;
  console.log(`Trading days covered: ${days}`);
  console.log(`Avg bars per day: ${(allBars.length / days).toFixed(1)}`);
}
