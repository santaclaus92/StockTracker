/**
 * Import Bursa counters from a text/CSV file.
 *
 * Accepts any of these formats (auto-detected):
 *   1. Plain list — one symbol per line:          1155.KL
 *   2. Plain codes — no suffix, auto-appends .KL: 1155
 *   3. CSV with header:                           symbol,name,sector
 *
 * Usage:
 *   node src/db/importCounters.js counters.txt
 *   node src/db/importCounters.js counters.csv
 */

import fs from 'fs';
import path from 'path';
import Database from 'better-sqlite3';
import { DB_PATH } from '../config.js';

const file = process.argv[2];
if (!file) {
  console.error('Usage: node src/db/importCounters.js <file>');
  process.exit(1);
}

const raw = fs.readFileSync(path.resolve(file), 'utf8');
const lines = raw.split(/\r?\n/).map(l => l.trim()).filter(Boolean);

if (!lines.length) {
  console.error('File is empty');
  process.exit(1);
}

// Detect format
const isCSV = lines[0].toLowerCase().includes('symbol') || lines[0].includes(',');

const rows = [];

if (isCSV) {
  // Parse CSV — header row first
  const headers = lines[0].split(',').map(h => h.trim().toLowerCase());
  const symIdx    = headers.findIndex(h => h === 'symbol' || h === 'code' || h === 'ticker');
  const nameIdx   = headers.findIndex(h => h === 'name'   || h === 'company');
  const sectorIdx = headers.findIndex(h => h === 'sector' || h === 'industry');

  for (const line of lines.slice(1)) {
    const cols   = line.split(',').map(c => c.trim());
    let symbol   = symIdx  >= 0 ? cols[symIdx]    : cols[0];
    const name   = nameIdx >= 0 ? cols[nameIdx]   : '';
    const sector = sectorIdx >= 0 ? cols[sectorIdx] : null;

    if (!symbol) continue;
    if (!symbol.includes('.')) symbol = symbol + '.KL';
    symbol = symbol.toUpperCase();

    rows.push({ symbol, name: name || symbol, sector: sector || null });
  }
} else {
  // Plain list — one symbol/code per line
  for (const line of lines) {
    // Skip comment lines
    if (line.startsWith('#') || line.startsWith('//')) continue;

    let symbol = line.split(/[\s,\t]/)[0].trim(); // take first token
    if (!symbol) continue;
    if (!symbol.includes('.')) symbol = symbol + '.KL';
    symbol = symbol.toUpperCase();

    rows.push({ symbol, name: symbol, sector: null });
  }
}

if (!rows.length) {
  console.error('No valid rows parsed');
  process.exit(1);
}

// Deduplicate
const seen = new Set();
const unique = rows.filter(r => {
  if (seen.has(r.symbol)) return false;
  seen.add(r.symbol);
  return true;
});

// Insert into DB
const db = new Database(DB_PATH);
db.pragma('foreign_keys = ON');

const upsert = db.prepare(`
  INSERT INTO stocks (symbol, name, sector)
  VALUES (@symbol, @name, @sector)
  ON CONFLICT(symbol) DO UPDATE SET
    name   = CASE WHEN excluded.name != excluded.symbol THEN excluded.name ELSE stocks.name END,
    sector = CASE WHEN excluded.sector IS NOT NULL THEN excluded.sector ELSE stocks.sector END
`);

const insertAll = db.transaction(() => {
  for (const row of unique) upsert.run(row);
});
insertAll();

const total = db.prepare('SELECT COUNT(*) as n FROM stocks').get().n;
console.log(`Imported ${unique.length} counters. Total in DB: ${total}`);
db.close();
