/**
 * Imports all Bursa Malaysia stocks using Yahoo Finance spark endpoint.
 * Strategy: send batches of 20 symbols (Yahoo drops non-existent ones silently).
 * Keeps batches small so valid symbols aren't lost in URL-length truncation.
 *
 * Run: node src/db/fetchAllBursa.js
 */

import db from '../db/database.js';
import { BURSA_STOCKS } from '../data/bursaStocks.js';

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const YF_HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  'Accept':     'application/json',
};

async function fetchSpark(symbols) {
  const url = `https://query1.finance.yahoo.com/v7/finance/spark?symbols=${symbols.join(',')}&range=1d&interval=1d`;
  try {
    const res  = await fetch(url, { headers: YF_HEADERS });
    if (!res.ok) return [];
    const json = await res.json();
    return json?.spark?.result ?? [];
  } catch { return []; }
}

function isBursa(ex) { return ex === 'KLS' || ex === 'KLX'; }

function toRow(item) {
  const meta = item.response?.[0]?.meta ?? {};
  return {
    symbol: item.symbol,
    name:   meta.longName || meta.shortName || item.symbol,
    sector: null,
    market: meta.exchangeName === 'KLX' ? 'ACE' : 'MAIN',
  };
}

async function upsertAll(stocks) {
  const rows  = [...stocks.values()];
  const CHUNK = 100;
  for (let i = 0; i < rows.length; i += CHUNK) {
    await db.batch(
      rows.slice(i, i + CHUNK).map((r) => ({
        sql: `INSERT INTO stocks (symbol, name, sector, market)
              VALUES (?, ?, ?, ?)
              ON CONFLICT(symbol) DO UPDATE SET
                name   = CASE WHEN excluded.name != '' THEN excluded.name ELSE stocks.name END,
                sector = CASE WHEN excluded.sector IS NOT NULL THEN excluded.sector ELSE stocks.sector END,
                market = CASE WHEN excluded.market IS NOT NULL THEN excluded.market ELSE stocks.market END`,
        args: [r.symbol, r.name, r.sector, r.market],
      })),
      'write'
    );
    process.stdout.write(`\r  Saved ${Math.min(i + CHUNK, rows.length)}/${rows.length}…`);
  }
  console.log('');
}

async function main() {
  console.log('\n=== Bursa Malaysia → Turso (spark scan) ===\n');

  // Generate all 4-digit candidates
  const allSymbols = [];
  for (let i = 1; i <= 9999; i++) allSymbols.push(String(i).padStart(4, '0') + '.KL');

  // Small batches — Yahoo silently drops invalid symbols, large batches may get truncated
  const BATCH      = 20;
  const discovered = new Map();
  const total      = allSymbols.length;

  console.log(`Scanning ${total} candidates in batches of ${BATCH}…\n`);

  for (let i = 0; i < total; i += BATCH) {
    const batch   = allSymbols.slice(i, i + BATCH);
    const results = await fetchSpark(batch);

    for (const item of results) {
      const meta = item.response?.[0]?.meta ?? {};
      if (isBursa(meta.exchangeName) && !discovered.has(item.symbol)) {
        discovered.set(item.symbol, toRow(item));
      }
    }

    const pct = Math.min(100, ((i + BATCH) / total * 100)).toFixed(0);
    process.stdout.write(`\r  [${pct}%] scanned ${Math.min(i + BATCH, total)}/${total} — found ${discovered.size} stocks`);

    await sleep(150);
  }

  console.log(`\n\nDiscovered ${discovered.size} valid Bursa stocks.\n`);

  // Merge static list — fills in sector info + catches anything spark missed
  let added = 0;
  for (const [symbol, name, sector] of BURSA_STOCKS) {
    if (!discovered.has(symbol)) {
      discovered.set(symbol, { symbol, name, sector: sector || null, market: 'MAIN' });
      added++;
    } else {
      discovered.get(symbol).sector = sector || null;
    }
  }
  if (added) console.log(`Added ${added} from static list.`);

  console.log(`Upserting ${discovered.size} stocks into Turso…`);
  await upsertAll(discovered);

  const { rows } = await db.execute('SELECT COUNT(*) AS n FROM stocks');
  console.log(`\nDone ✓  Total stocks in Turso: ${rows[0].n}`);
}

main().catch((err) => { console.error(err); process.exit(1); });
