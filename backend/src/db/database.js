import { createClient } from '@libsql/client';
import { TURSO_URL, TURSO_TOKEN, DB_PATH } from '../config.js';

// Use Turso in production, local SQLite file in dev (fallback)
const db = createClient(
  TURSO_URL
    ? { url: TURSO_URL, authToken: TURSO_TOKEN }
    : { url: `file:${DB_PATH}` }
);

export default db;
