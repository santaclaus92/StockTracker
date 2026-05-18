import nodemailer from 'nodemailer';
import TelegramBot from 'node-telegram-bot-api';
import db from '../db/database.js';
import { SMTP, TELEGRAM } from '../config.js';
import { evaluateCondition, computeRSI } from './indicators.js';

let mailer = null;
let tgBot  = null;

if (SMTP.user && SMTP.pass) {
  mailer = nodemailer.createTransport({
    host: SMTP.host, port: SMTP.port,
    auth: { user: SMTP.user, pass: SMTP.pass },
  });
}

if (TELEGRAM.token) {
  tgBot = new TelegramBot(TELEGRAM.token, { polling: false });
}

async function sendEmail(subject, text) {
  if (!mailer || !SMTP.to) return;
  await mailer.sendMail({ from: SMTP.user, to: SMTP.to, subject, text });
}

async function sendTelegram(text) {
  if (!tgBot || !TELEGRAM.chatId) return;
  await tgBot.sendMessage(TELEGRAM.chatId, text);
}

const logAlert = db.prepare(`
  INSERT INTO alerts_log (condition_id, stock_id, message, price_at)
  VALUES (@condition_id, @stock_id, @message, @price_at)
`);

export async function evaluateAllConditions() {
  const favs = db.prepare(`
    SELECT s.id, s.symbol, s.name,
           lp.price, lp.pct_change, lp.week52_high, lp.week52_low
    FROM stocks s
    JOIN favourites f ON f.stock_id = s.id
    LEFT JOIN latest_price lp ON lp.stock_id = s.id
    WHERE lp.price IS NOT NULL
  `).all();

  for (const stock of favs) {
    const conditions = db.prepare(
      'SELECT * FROM conditions WHERE stock_id = ? AND active = 1'
    ).all(stock.id);

    if (!conditions.length) continue;

    // Pull closes for indicator calculations (last 60 bars)
    const closes = db.prepare(`
      SELECT close FROM price_history
      WHERE stock_id = ? AND close IS NOT NULL
      ORDER BY ts DESC LIMIT 60
    `).all(stock.id).map((r) => r.close).reverse();

    for (const cond of conditions) {
      const { triggered, message } = evaluateCondition(cond, stock, closes);
      if (!triggered) continue;

      const msg = `[${stock.symbol}] ${stock.name}: ${message}`;

      logAlert.run({
        condition_id: cond.id,
        stock_id:     stock.id,
        message:      msg,
        price_at:     stock.price,
      });

      if (cond.channel === 'email' || cond.channel === 'both') {
        await sendEmail(`Bursa Alert: ${stock.symbol}`, msg).catch(console.error);
      }
      if (cond.channel === 'telegram' || cond.channel === 'both') {
        await sendTelegram(msg).catch(console.error);
      }
    }
  }
}
