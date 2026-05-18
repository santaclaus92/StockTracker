/**
 * Fetches the complete list of Bursa Malaysia listed stocks.
 *
 * Run once:  node src/db/fetchAllBursa.js
 *
 * Strategy:
 *  1. Yahoo Finance custom screener filtered to exchange=KLS (Bursa Main + ACE),
 *     paginated 250 at a time until exhausted
 *  2. Validate + upsert all .KL / .KLS symbols into the stocks table
 */

import yahooFinance from 'yahoo-finance2';
import Database from 'better-sqlite3';
import { DB_PATH } from '../config.js';

const db = new Database(DB_PATH);
db.pragma('foreign_keys = ON');

const upsert = db.prepare(`
  INSERT INTO stocks (symbol, name, sector, market)
  VALUES (@symbol, @name, @sector, @market)
  ON CONFLICT(symbol) DO UPDATE SET
    name   = CASE WHEN excluded.name != '' THEN excluded.name ELSE stocks.name END,
    sector = CASE WHEN excluded.sector IS NOT NULL THEN excluded.sector ELSE stocks.sector END,
    market = CASE WHEN excluded.market IS NOT NULL THEN excluded.market ELSE stocks.market END
`);

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function isKLSymbol(s) {
  return typeof s === 'string' && (s.endsWith('.KL') || s.endsWith('.KLS'));
}

function toRow(q) {
  return {
    symbol: q.symbol,
    name:   q.longName || q.shortName || q.symbol,
    sector: q.sector   || q.industry  || null,
    market: q.exchange === 'KLS' ? 'ACE' : 'MAIN',
  };
}

// Fetch one page of Bursa stocks via the custom screener query
async function fetchPage(offset, count = 250) {
  try {
    const result = await yahooFinance.screener(
      {
        query: {
          operator: 'or',
          operands: [
            { operator: 'eq', operands: ['exchange', 'KLS'] },
            { operator: 'eq', operands: ['exchange', 'KLX'] },
          ],
        },
        region:       'MY',
        lang:         'en-US',
        count,
        offset,
        sortField:    'intradaymarketcap',
        sortType:     'DESC',
        corsDomain:   'finance.yahoo.com',
        formatted:    false,
      },
      { validateResult: false }
    );
    return result?.quotes ?? [];
  } catch (err) {
    console.warn(`  [page offset=${offset}] error:`, err.message);
    return [];
  }
}

async function main() {
  const discovered = new Map();

  console.log('Fetching all Bursa Malaysia stocks from Yahoo Finance screener…\n');

  let offset = 0;
  const PAGE  = 250;

  while (true) {
    process.stdout.write(`  offset=${offset} … `);
    const quotes = await fetchPage(offset, PAGE);

    const klQuotes = quotes.filter((q) => isKLSymbol(q.symbol));
    for (const q of klQuotes) {
      if (!discovered.has(q.symbol)) discovered.set(q.symbol, toRow(q));
    }

    console.log(`got ${quotes.length} (${klQuotes.length} Bursa) — total: ${discovered.size}`);

    // Stop when Yahoo returns fewer than a full page
    if (quotes.length < PAGE) break;
    offset += PAGE;
    await sleep(600);
  }

  if (discovered.size === 0) {
    console.log('\nScreener returned 0 Bursa stocks — Yahoo Finance may have changed the API.');
    console.log('Falling back to seed list only. Run: npm run seed');
    db.close();
    return;
  }

  console.log(`\nUpserting ${discovered.size} stocks…`);
  db.transaction(() => {
    for (const row of discovered.values()) upsert.run(row);
  })();

  const total = db.prepare('SELECT COUNT(*) as n FROM stocks').get().n;
  console.log(`Done. Total stocks in DB: ${total}`);
  db.close();
}

main().catch((err) => { console.error(err); process.exit(1); });
