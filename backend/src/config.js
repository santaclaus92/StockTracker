import 'dotenv/config';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export const PORT                   = process.env.PORT || 8000;
export const DB_PATH                = process.env.DB_PATH || path.join(__dirname, '../../bursa.db');
export const TURSO_URL              = process.env.TURSO_URL || '';
export const TURSO_TOKEN            = process.env.TURSO_TOKEN || '';
export const FETCH_INTERVAL_MINUTES = parseInt(process.env.FETCH_INTERVAL_MINUTES || '15', 10);
export const CRON_SECRET            = process.env.CRON_SECRET || '';

export const SMTP = {
  host: process.env.SMTP_HOST || 'smtp.gmail.com',
  port: parseInt(process.env.SMTP_PORT || '587', 10),
  user: process.env.SMTP_USER || '',
  pass: process.env.SMTP_PASS || '',
  to:   process.env.ALERT_EMAIL_TO || '',
};

export const TELEGRAM = {
  token:  process.env.TELEGRAM_BOT_TOKEN || '',
  chatId: process.env.TELEGRAM_CHAT_ID   || '',
};
