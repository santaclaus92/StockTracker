import { yfQuote, yfHistory } from './src/services/fetcher.js';

async function test() {
  console.log('Testing Yahoo Finance v8 chart API...\n');

  // Test 1: real-time quote - Maybank
  try {
    const q = await yfQuote('1155.KL');
    console.log('✅ yfQuote(1155.KL - Maybank):', q);
  } catch (e) {
    console.error('❌ yfQuote(1155.KL) FAILED:', e.message);
  }

  // Test 2: Tenaga
  try {
    const q = await yfQuote('5099.KL');
    console.log('\n✅ yfQuote(5099.KL - Tenaga):', q);
  } catch (e) {
    console.error('\n❌ yfQuote(5099.KL) FAILED:', e.message);
  }

  // Test 3: historical
  try {
    const rows = await yfHistory('1155.KL', '2024-01-01', '2024-01-15');
    console.log('\n✅ yfHistory(1155.KL):', rows.length, 'rows');
    console.log('  first:', rows[0]);
    console.log('  last: ', rows[rows.length - 1]);
  } catch (e) {
    console.error('\n❌ yfHistory FAILED:', e.message);
  }
}

test();
