# Bursa Monitor

Real-time Bursa Malaysia stock dashboard with alerts and backtesting.

## Stack

| Layer     | Tech                    |
|-----------|-------------------------|
| Backend   | Node.js + Express       |
| Database  | SQLite (better-sqlite3) |
| Scheduler | node-cron               |
| Frontend  | React + Vite + Tailwind |
| Charts    | Recharts                |
| Alerts    | Nodemailer + Telegram   |
| Data      | yahoo-finance2          |

---

## Quick Start

### 1 — Backend

```bash
cd backend
npm install
cp .env.example .env   # then edit .env with your settings
npm run migrate        # creates bursa.db with all tables
npm run seed           # loads ~150 Bursa stocks
npm run dev            # starts server on :8000
```

### 2 — Frontend

```bash
cd frontend
npm install
npm run dev            # starts on :3000, proxies /api to :8000
```

---

## Telegram Bot Setup

1. Message **@BotFather** on Telegram → `/newbot` → follow prompts → get **token**
2. Start a chat with your bot, then visit:
   ```
   https://api.telegram.org/bot<TOKEN>/getUpdates
   ```
3. Find `"chat":{"id": 123456789}` — that is your **chat ID**
4. Set in `.env`:
   ```
   TELEGRAM_BOT_TOKEN=...
   TELEGRAM_CHAT_ID=...
   ```

---

## Email Alerts (Gmail)

1. Google Account → Security → **App Passwords** → generate one for Mail
2. Set in `.env`:
   ```
   SMTP_USER=you@gmail.com
   SMTP_PASS=xxxx xxxx xxxx xxxx   # 16-char app password
   ALERT_EMAIL_TO=you@gmail.com
   ```

---

## How it works

- Scheduler fetches **favourited stocks** every 15 min (set `FETCH_INTERVAL_MINUTES` in `.env`)
- Click **Refresh All** in the navbar to do a one-time full fetch of all ~150 stocks
- Historical data for backtesting is fetched from Yahoo Finance on demand and cached in SQLite
- Conditions are evaluated after every fetch tick; alerts fire to dashboard / email / Telegram

---

## Production (VPS + nginx)

```bash
cd frontend && npm run build   # outputs to frontend/dist

# nginx config
location /api/ { proxy_pass http://127.0.0.1:8000; }
location /     { root /path/to/frontend/dist; try_files $uri /index.html; }

# run backend with pm2
pm2 start backend/src/index.js --name bursa-monitor && pm2 save
```
# StockTracker
