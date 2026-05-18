import db from './database.js';

await db.batch([
  { sql: `CREATE TABLE IF NOT EXISTS stocks (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    symbol     TEXT NOT NULL UNIQUE,
    name       TEXT NOT NULL,
    sector     TEXT,
    market     TEXT DEFAULT 'MAIN',
    created_at TEXT DEFAULT (datetime('now'))
  )`, args: [] },
  { sql: `CREATE TABLE IF NOT EXISTS price_history (
    id        INTEGER PRIMARY KEY AUTOINCREMENT,
    stock_id  INTEGER NOT NULL REFERENCES stocks(id) ON DELETE CASCADE,
    ts        TEXT NOT NULL,
    open      REAL, high REAL, low REAL, close REAL, volume INTEGER,
    UNIQUE(stock_id, ts)
  )`, args: [] },
  { sql: `CREATE INDEX IF NOT EXISTS idx_price_stock_ts ON price_history(stock_id, ts DESC)`, args: [] },
  { sql: `CREATE TABLE IF NOT EXISTS latest_price (
    stock_id    INTEGER PRIMARY KEY REFERENCES stocks(id) ON DELETE CASCADE,
    price REAL, open REAL, high REAL, low REAL,
    week52_high REAL, week52_low REAL, volume INTEGER, pct_change REAL, updated_at TEXT
  )`, args: [] },
  { sql: `CREATE TABLE IF NOT EXISTS favourites (
    stock_id INTEGER PRIMARY KEY REFERENCES stocks(id) ON DELETE CASCADE,
    added_at TEXT DEFAULT (datetime('now'))
  )`, args: [] },
  { sql: `CREATE TABLE IF NOT EXISTS conditions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    stock_id INTEGER NOT NULL REFERENCES stocks(id) ON DELETE CASCADE,
    label TEXT, type TEXT NOT NULL, threshold REAL,
    logic TEXT DEFAULT 'AND', channel TEXT DEFAULT 'dashboard',
    active INTEGER DEFAULT 1, created_at TEXT DEFAULT (datetime('now'))
  )`, args: [] },
  { sql: `CREATE TABLE IF NOT EXISTS alerts_log (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    condition_id INTEGER REFERENCES conditions(id) ON DELETE SET NULL,
    stock_id INTEGER REFERENCES stocks(id) ON DELETE CASCADE,
    message TEXT, price_at REAL, dismissed INTEGER DEFAULT 0,
    triggered_at TEXT DEFAULT (datetime('now'))
  )`, args: [] },
], 'write');

console.log('Migration complete — Turso');
