import Database from 'better-sqlite3';
import { DB_PATH } from '../config.js';
import { BURSA_STOCKS } from '../data/bursaStocks.js';

const db = new Database(DB_PATH);
db.pragma('foreign_keys = ON');

const insert = db.prepare(`
  INSERT OR IGNORE INTO stocks (symbol, name, sector)
  VALUES (?, ?, ?)
`);

// Deduplicate by symbol before inserting
const seen = new Set();
const unique = BURSA_STOCKS.filter(([sym]) => {
  if (seen.has(sym)) return false;
  seen.add(sym);
  return true;
});

const insertAll = db.transaction(() => {
  for (const [symbol, name, sector] of unique) {
    insert.run(symbol, name, sector);
  }
});

insertAll();
console.log(`Seeded ${unique.length} stocks.`);
db.close();
