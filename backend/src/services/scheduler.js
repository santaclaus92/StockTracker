import cron from 'node-cron';
import { FETCH_INTERVAL_MINUTES } from '../config.js';
import { fetchFavourites } from './fetcher.js';
import { evaluateAllConditions } from './alertService.js';

// Build cron expression from interval (1–59 min supported)
function buildCron(minutes) {
  if (minutes <= 0 || minutes >= 60) return `*/${15} * * * *`;
  return `*/${minutes} * * * *`;
}

export function startScheduler() {
  const expr = buildCron(FETCH_INTERVAL_MINUTES);
  console.log(`[scheduler] fetch every ${FETCH_INTERVAL_MINUTES} min (${expr})`);

  cron.schedule(expr, async () => {
    console.log('[scheduler] tick —', new Date().toISOString());
    await fetchFavourites();
    await evaluateAllConditions();
  });
}
