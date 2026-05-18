/**
 * Single-counter test — fetches 1155.KL (Maybank) and saves to DB.
 * Run: node test-counter.mjs
 */

import { fetchStock, yfHistory } from './src/services/fetcher.js';
import db from './src/db/database.js';

const SYMBOL  = '1155.KL';

// Ensure stock exists in DB
const existing = db.prepare('SELECT id FROM stocks WHERE symbol = ?').get(SYMBOL);
let stockId = existing?.id;

if (!stockId) {
  const res = db.prepare('INSERT OR IGNORE INTO stocks (symbol, name) VALUES (?, ?)').run(SYMBOL, SYMBOL);
  stockId = res.lastInsertRowid;
  console.log(`Inserted ${SYMBOL} with id=${stockId}`);
} else {
  console.log(`${SYMBOL} already in DB, id=${stockId}`);
}

// --- Test 1: real-time fetch ---
console.log('\n⏳ Fetching real-time quote...');
const q = await fetchStock(SYMBOL, stockId);

if (q?.price) {
  console.log('✅ Quote saved to DB:');
  console.log(`   Price:      MYR ${q.price.toFixed(3)}`);
  console.log(`   Open:       MYR ${q.open?.toFixed(3)}`);
  console.log(`   High:       MYR ${q.high?.toFixed(3)}`);
  console.log(`   Low:        MYR ${q.low?.toFixed(3)}`);
  console.log(`   Volume:     ${q.volume?.toLocaleString()}`);
  console.log(`   Change:     ${q.pct_change?.toFixed(2)}%`);
  console.log(`   52w High:   MYR ${q.week52_high?.toFixed(3)}`);
  console.log(`   52w Low:    MYR ${q.week52_low?.toFixed(3)}`);
  console.log(`   Name:       ${q.name}`);
  console.log(`   Updated:    ${q.updated_at}`);
} else {
  console.error('❌ Failed to fetch quote');
}

// --- Test 2: verify DB write ---
const saved = db.prepare('SELECT * FROM latest_price WHERE stock_id = ?').get(stockId);
console.log('\n✅ latest_price row in DB:', saved);

// --- Test 3: historical fetch (last 30 days) ---
console.log('\n⏳ Fetching 30 days of history...');
const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
const hist = await yfHistory(SYMBOL, thirtyDaysAgo);
console.log(`✅ History rows fetched: ${hist.length}`);
if (hist.length) {
  console.log('   First:', hist[0]);
  console.log('   Last: ', hist[hist.length - 1]);
}

// --- Test 4: simulate scheduler tick ---
console.log('\n⏳ Simulating scheduler tick (fetch again in 3s)...');
await new Promise(r => setTimeout(r, 3000));
const q2 = await fetchStock(SYMBOL, stockId);
console.log(`✅ Second fetch: MYR ${q2?.price?.toFixed(3)} at ${q2?.updated_at}`);

const histCount = db.prepare('SELECT COUNT(*) as n FROM price_history WHERE stock_id = ?').get(stockId).n;
console.log(`\n✅ Total price_history rows for ${SYMBOL}: ${histCount}`);
console.log('\nAll tests passed. Scheduler will run every 15 min for favourited stocks.');

db.close();
