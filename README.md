# Game Boy Collection Tracker

🎮 Track your Game Boy cartridge collection from anywhere.

**Two interfaces, one database:**
- 📱 **Telegram Bot** — quick search & add from your phone while shopping
- 💻 **Web App** — rich browsing with filters, stats, and photos on PC

## Commands

### Telegram Bot

| Command | Alias | What it does |
|---------|-------|-------------|
| `/start` | `/help` | Welcome message + keyboard shortcuts |
| `/search zelda` | `/s zelda` | Search games by name or ID. Shows ✅/❌ inline |
| `/check zelda` | `/c zelda` | Quick check: do you own this game? Shows price too |
| `/add GB-0123` | `/a GB-0123` | Add game to your collection |
| `/remove GB-0123` | `/rm GB-0123` | Remove from collection (with confirmation) |
| `/price GB-0123 25` | — | Set price paid |
| `/list` | `/l` | View your collection grouped by platform |
| `/list GB` | — | Filter collection by platform |
| `/stats` | — | Stats with bars per platform + total spent |

You can also just **type any game name** and it'll search automatically.

### Web App

- 🔍 Full-text search + filters (platform, genre)
- ✅ One-click ownership toggle (checkbox)
- 📊 Stats cards per platform with mini progress bars
- 🔐 Magic link login (no password) — private collection
- 📱 Mobile-responsive dark theme

## Architecture

```
CSV catalog → Supabase (PostgreSQL) ← Telegram Bot (Cloudflare Worker)
                    ↑                      ↑
                    └── Web App (GitHub Pages / Preact)
```

- **Supabase** — PostgreSQL + Auth (magic link) + REST API
- **Cloudflare Workers** — Telegram bot webhook (grammY)
- **GitHub Pages** — Static web app (Preact + Vite)

All free. No credit card required.

## Setup

### 1. Supabase

1. Create account at [supabase.com](https://supabase.com) → new project
2. **SQL Editor** → run [`supabase/migrations/001_schema.sql`](supabase/migrations/001_schema.sql)
3. **SQL Editor** → run [`supabase/migrations/002_auth.sql`](supabase/migrations/002_auth.sql)
4. **Authentication → Providers** → enable "Email" provider (disable "Confirm email" for now if testing)
5. **Authentication → URL Configuration** → set Site URL to your GitHub Pages URL (e.g., `https://username.github.io/gameboy-collection-tracker`)
6. **Project Settings → API** → copy:
   - `Project URL` → `SUPABASE_URL`
   - `service_role` key → `SUPABASE_SERVICE_KEY`
   - `anon` key → `VITE_SUPABASE_ANON_KEY`

### 2. Import Game Catalog

```bash
cd supabase/scripts
cp .env.example .env
# Edit .env with SUPABASE_URL + SUPABASE_SERVICE_KEY
pip install -r requirements.txt
python import_data.py
```

Expected: **3,647 games + 136 bootlegs**

### 3. Telegram Bot

1. Create bot with [@BotFather](https://t.me/BotFather) → get token
2. Get your Telegram user ID from [@userinfobot](https://t.me/userinfobot)
3. Deploy:

```bash
cd cloudflare-worker
npm install
npx wrangler login

# Set secrets:
npx wrangler secret put SUPABASE_URL
npx wrangler secret put SUPABASE_SERVICE_KEY
npx wrangler secret put TELEGRAM_BOT_TOKEN
npx wrangler secret put AUTHORIZED_USERS    # e.g., "123456789"

npx wrangler deploy
```

4. Set webhook:

```bash
curl -F "url=https://gb-collection-bot.YOUR-SUBDOMAIN.workers.dev/telegram" \
     https://api.telegram.org/bot<TOKEN>/setWebhook
```

5. Link your Telegram user to the collection:
   - First, log in to the web app (step 4) to create your auth user
   - Run this in Supabase SQL Editor:
   ```sql
   SELECT link_telegram_user(YOUR_TELEGRAM_USER_ID);
   ```

### 4. Web App (GitHub Pages)

1. Create a new GitHub repo (e.g., `gameboy-collection-tracker`)
2. Copy `web-app/` contents to the repo root
3. **Settings → Secrets and variables → Actions** → add:
   - `VITE_SUPABASE_URL`
   - `VITE_SUPABASE_ANON_KEY`
4. **Settings → Pages** → source = "GitHub Actions"
5. Edit `vite.config.js` → change `base` to `"/your-repo-name/"`
6. Push to `main` → deploys automatically

### 5. First Login

1. Open the GitHub Pages URL
2. Enter your email → click "Send Magic Link"
3. Check inbox → click the link
4. You're in! Your collection is now private and linked to your account
5. Run the SQL to link Telegram (step 3.5 above)

## Security

- **Web app**: Row-Level Security ensures only your authenticated account sees your collection
- **Telegram bot**: `AUTHORIZED_USERS` list limits to your Telegram ID
- **Database**: `service_role` key never leaves the bot worker (stored in Cloudflare secrets)
- **Catalog tables**: Public read (game metadata isn't private)

## Free Tier Limits

| Service | Limit | Usage |
|---------|-------|-------|
| Supabase DB | 500 MB | ~5 MB (game metadata) |
| Supabase Auth | 50K MAUs | 1 user |
| Supabase Storage | 1 GB | Phase 2 photos |
| Cloudflare Workers | 100K req/day | Bot messages |
| Cloudflare R2 | 10 GB | Phase 2 photos |
| GitHub Pages | 100 GB/month | Web app |
