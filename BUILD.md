# How to Build This Entire Project From Zero

This document explains every step needed to recreate the **Game Boy Collection Tracker** — a Telegram bot + web app that share a Supabase database — starting from nothing. No step is skipped. No prior knowledge assumed beyond basic terminal usage.

---

## What You're Building

```
You (Telegram) ──→ Cloudflare Worker ──→ Supabase (PostgreSQL)
You (Browser)  ──→ GitHub Pages SPA ──→ Supabase (REST API)
```

- **Telegram bot** (`@gb_collection_bot`): search games, check ownership, add/remove from collection, stats
- **Web app** (`hunter-digi-ace.github.io/gameboy-collection-tracker`): browseable table with filters, checkboxes, detail modals, auth-protected
- **Database**: 3,647 licensed Game Boy / GBC / GBA games + 136 bootlegs

Total cost: **$0/month**. No credit card needed for any service.

---

## Prerequisites

### Accounts You Need to Create

| Service | URL | What it's for |
|---------|-----|---------------|
| **Supabase** | [supabase.com](https://supabase.com) | PostgreSQL database + Auth + REST API |
| **Cloudflare** | [dash.cloudflare.com/sign-up](https://dash.cloudflare.com/sign-up) | Hosts the Telegram bot (Workers) |
| **GitHub** | [github.com/signup](https://github.com/signup) | Hosts the web app (Pages) + code repository |
| **Telegram** | Already have it | Where the bot lives |

### Software Installed on Your Computer

| Tool | How to install | Check it works |
|------|---------------|----------------|
| **Python 3** | [python.org/downloads](https://python.org/downloads) | `python --version` |
| **Node.js 22+** | [nodejs.org](https://nodejs.org) | `node --version` |
| **Git** | [git-scm.com/downloads](https://git-scm.com/downloads) | `git --version` |

### Files You Need (the Game Catalog)

You need CSV files with the game database. This project expects 5 specific CSV files in a known location:

```
your-catalog-folder/
├── 01_gameboy_dmg_COMPLETE.csv          (1,167 rows)
├── 02a_gameboy_color_BLACK_cartridge.csv (308 rows)
├── 02b_gameboy_color_CLEAR_cartridge.csv (624 rows)
├── 03_gameboy_advance_COMPLETE.csv       (1,548 rows)
└── 05_bootleg_unlicensed_catalog.csv     (136 rows)
```

Each licensed-game CSV has these columns (17 total):
`id, title_en, title_original, title_romanji, platform, cartridge_type, release_year, release_jp, release_na, release_eu, release_au, regions, developer, publisher, genre, languages, notes`

The bootleg CSV has 14 columns (slightly different — no cartridge_type, regions, or languages; adds origin_country, type, base_game, original_game).

The ID format is: `GB-XXXX` (Game Boy), `GBCB-XXXX` (GBC black cart), `GBCC-XXXX` (GBC clear cart), `GBA-XXXX` (Game Boy Advance), `BOOT-XXXX` (bootleg/unlicensed).

---

## Step 1: Supabase — Create the Database

### 1.1 Sign Up and Create Project

1. Go to **[supabase.com](https://supabase.com)** and click **Start your project**
2. Sign up with GitHub (recommended) or email
3. After login, you'll see the dashboard at **[supabase.com/dashboard](https://app.supabase.com)**
4. Click the green **New project** button
5. Fill in:
   - **Name**: `gb-collection` (or whatever you want)
   - **Database Password**: generate one and **save it** (you'll need it if you ever connect directly)
   - **Region**: pick the one closest to you (e.g., `West Europe (London)`)
   - **Pricing Plan**: Free
6. Click **Create project** — wait ~2 minutes while it provisions

### 1.2 Get Your API Keys

1. In the left sidebar, click **Project Settings** (gear icon ⚙️ at the bottom)
2. Click **API** in the submenu
3. You'll see two boxes:
   - **Project URL**: `https://xxxxxxxxxxxx.supabase.co` ← Copy this
   - **anon public**: The safe-for-browser key ← Copy this too
   - **service_role secret**: The admin key (kept private) ← Copy this too

Save all three values. You'll use them throughout.

### 1.3 Run the Schema

1. In the left sidebar, click **SQL Editor** (database icon with a play button)
2. Click **New query**
3. Open the file `supabase/migrations/001_schema.sql` from this repo
4. Copy the entire contents and paste into the SQL Editor
5. Click the green **Run** button (or Ctrl+Enter)
6. It should say `Success. No rows returned` — this is correct. Tables are created but don't return data.

What this creates:
- `games` table (main catalog with full-text search)
- `bootlegs` table (unlicensed games)
- `collection` table (your owned games)
- Indexes and search helper functions

### 1.4 Import the Game Data

Now you need to run a Python script that reads the CSV files and uploads them to your Supabase database.

```bash
# Navigate to the scripts folder
cd supabase/scripts

# Install Python dependencies
pip install pandas requests python-dotenv

# Create the .env file with your Supabase credentials
# On Windows PowerShell:
@"
SUPABASE_URL=https://xxxxxxxxxxxx.supabase.co
SUPABASE_SERVICE_KEY=your-service-role-key-here
"@ | Out-File -FilePath .env -Encoding utf8

# On Mac/Linux:
echo 'SUPABASE_URL=https://xxxxxxxxxxxx.supabase.co' > .env
echo 'SUPABASE_SERVICE_KEY=your-service-role-key-here' >> .env
```

> **Important:** The `SUPABASE_URL` must NOT have `/rest/v1` at the end. Just the base URL: `https://xxxxxxxxxxxx.supabase.co`

```bash
# Run the import
python import_data.py
```

Expected output:
```
Game Boy Catalog Importer
============================================================
─ Importing licensed games ─
  Reading: 01_gameboy_dmg_COMPLETE.csv (118,320 bytes)
    → 1167 rows, 17 columns
    ✓ Inserted 1167 rows (3/3 batches)
  ... (more files)
  Total games imported: 3644
─ Importing bootlegs ─
  Total bootlegs imported: 136

Import complete: 3644 games + 136 bootlegs
```

> **Why 3,644 and not 3,647?** Three rows (`GBA-0001`, `GBA-0002`, `GBA-0003`) are region headers in the CSV, not real games. The script filters them out intentionally.

### 1.5 Verify the Import

1. Go back to Supabase dashboard → **Table Editor** (left sidebar)
2. Select the `games` table — you should see 3,644 rows
3. Go to **SQL Editor** and run:
   ```sql
   SELECT * FROM search_games('zelda');
   ```
4. You should see Zelda games in the results. If yes, the import is working.

### 1.6 Set Up Authentication

1. In the left sidebar, click **SQL Editor**
2. Open `supabase/migrations/002_auth.sql` from this repo
3. Paste into SQL Editor and **Run**
4. Should say `Success. No rows returned`

This creates:
- `app_user` table (links your login to the collection)
- Row-Level Security policies (only you can see your collection)
- Helper functions for linking users and Telegram

5. In the left sidebar, click **Authentication** → **Providers**
6. Find the **Email** provider row and flip the toggle ON
7. Uncheck **Confirm email** (for now — you can enable it later)
8. In the left sidebar, click **Authentication** → **URL Configuration**
9. Set **Site URL** to your future GitHub Pages URL. If you don't know it yet, use `http://localhost:5173` (you'll change it later after deploying the web app). The format will be `https://YOUR-GITHUB-USERNAME.github.io/YOUR-REPO-NAME`

---

## Step 2: Telegram — Create the Bot

### 2.1 Get a Bot Token from BotFather

1. Open Telegram on your phone or desktop
2. Search for **[@BotFather](https://t.me/BotFather)** — this is Telegram's official bot-creation bot. It has a blue verified checkmark.
3. Start a chat and send: `/newbot`
4. BotFather asks: *"Alright, a new bot. How are we going to call it?"*
   - Enter a display name, e.g.: `GB Collection Tracker`
5. BotFather asks: *"Good. Now let's choose a username for your bot."*
   - Enter a username ending in `bot`, e.g.: `gb_collection_bot`
   - This must be unique across all of Telegram
6. BotFather replies with a success message containing your **token**:
   ```
   Done! Congratulations on your new bot.

   Use this token to access the HTTP API:
   1234567890:AAFjJq...abcxyz
   ```
7. **Copy this token and save it.** You'll need it in Step 3.

### 2.2 Get Your Telegram User ID

1. On Telegram, search for **[@userinfobot](https://t.me/userinfobot)**
2. Start the chat (or send `/start`)
3. It replies with something like:
   ```
   @yourusername
   Id: 123456789
   ```
4. **Save the numeric ID** (e.g., `123456789`). This is your Telegram user ID.

---

## Step 3: Cloudflare Workers — Deploy the Bot

### 3.1 Set Up Wrangler (Cloudflare CLI)

```bash
# Install Wrangler globally
npm install -g wrangler

# Log in to your Cloudflare account
wrangler login
```

A browser window opens. Click **Allow** to authorize Wrangler.

### 3.2 Install Dependencies and Deploy

```bash
# Navigate to the worker directory
cd cloudflare-worker

# Install bot dependencies (grammy framework)
npm install

# Set secrets (sensitive values stored encrypted on Cloudflare)
# You'll be prompted to enter each value:
npx wrangler secret put SUPABASE_URL
# Paste: https://xxxxxxxxxxxx.supabase.co

npx wrangler secret put SUPABASE_SERVICE_KEY
# Paste: your-service-role-key (the secret one, starts with eyJ...)

npx wrangler secret put TELEGRAM_BOT_TOKEN
# Paste: the token BotFather gave you (1234567890:AAFjJq...)

npx wrangler secret put AUTHORIZED_USERS
# Paste: your numeric Telegram user ID (e.g., 123456789)
```

> **Why `AUTHORIZED_USERS`?** This is a security measure. The bot only responds to messages from these Telegram user IDs. Anyone else who finds your bot gets "⛔ Unauthorized."

### 3.3 Register a Workers.dev Subdomain (first time only)

```bash
npx wrangler deploy
```

If this is your first time using Cloudflare Workers, Wrangler will ask:

```
Would you like to register a workers.dev subdomain now? [y/n]
```
Type `y` and press Enter.

```
What would you like your workers.dev subdomain to be?
```
Type a name, e.g., `gb-collection-bot`. This becomes `https://gb-collection-bot.your-name.workers.dev`.

Confirm the prompt. DNS takes a few minutes to propagate.

### 3.4 Deploy the Worker

```bash
npx wrangler deploy
```

Expected output:
```
Deployed gb-collection-bot triggers
https://gb-collection-bot.your-name.workers.dev
```

**Save this URL.** It's your worker's public address.

### 3.5 Connect Telegram to the Worker (Set Webhook)

Telegram needs to know where to send messages. You tell it by setting a webhook:

**Option A — Using curl (Mac/Linux/Git Bash):**
```bash
curl -F "url=https://gb-collection-bot.YOUR-NAME.workers.dev/telegram" \
     "https://api.telegram.org/botYOUR-BOT-TOKEN/setWebhook"
```

**Option B — Using the browser (any OS):**
Open this URL in your browser (replace the two values):
```
https://api.telegram.org/botYOUR-BOT-TOKEN/setWebhook?url=https://gb-collection-bot.YOUR-NAME.workers.dev/telegram
```

Expected response: `{"ok":true,"result":true,"description":"Webhook was set"}`

### 3.6 Test the Bot

1. Open Telegram
2. Search for your bot's username (e.g., `@gb_collection_bot`)
3. Send `/start`
4. The bot should reply with a welcome message and a keyboard

If you get an error or no response, go to Step 3.8 to debug.

### 3.7 Link Your Telegram Account to the Database

The bot uses Supabase's `service_role` key (admin access) to write to the database. It needs to know which Supabase auth user "owns" the collection so the web app's Row-Level Security works properly.

First, create yourself as a Supabase auth user:

1. Go to Supabase dashboard → **Authentication** → **Users**
2. Click **Add user** → **Create new user**
3. Enter:
   - **Email**: your email address
   - **Password**: anything (you won't use it — login is via magic link)
4. Check **Auto Confirm User**
5. Click **Create user**
6. Copy the **User UID** that appears (a UUID like `123e4567-e89b-12d3-a456-426614174000`)

Now link everything together. Run this SQL in Supabase's SQL Editor:

```sql
UPDATE app_user
SET supabase_user_id = 'PASTE-YOUR-USER-UID-HERE',
    telegram_user_id = PASTE_YOUR_TELEGRAM_ID_HERE
WHERE id = 1;
```

Example with real values:
```sql
UPDATE app_user
SET supabase_user_id = '123e4567-e89b-12d3-a456-426614174000',
    telegram_user_id = 123456789
WHERE id = 1;
```

### 3.8 Debugging the Bot

If the bot doesn't respond:

```bash
cd cloudflare-worker

# Check webhook status
curl "https://api.telegram.org/botYOUR-TOKEN/getWebhookInfo"

# Watch live logs (then send a message to the bot in Telegram)
npx wrangler tail

# Re-deploy after making fixes
npx wrangler deploy
```

Common issues:
- **"Wrong response from the webhook: 500"** → Missing secrets. Check `npx wrangler secret list`
- **Bot ignores you** → Your Telegram ID isn't in `AUTHORIZED_USERS`. Check the secret value
- **"Supabase error"** → Wrong URL or key in secrets

---

## Step 4: GitHub — Deploy the Web App

### 4.1 Create a GitHub Repository

1. Go to **[github.com/new](https://github.com/new)**
2. Fill in:
   - **Repository name**: `gameboy-collection-tracker` (or any name)
   - **Description**: optional
   - **Public** ← Must be public for free GitHub Pages
   - Do NOT check "Add a README" (we already have files)
3. Click **Create repository**

### 4.2 Configure the Web App for Your Repo

Before pushing, update `vite.config.js` to match your repository name:

```js
export default defineConfig({
  plugins: [preact()],
  base: "/gameboy-collection-tracker/",  // ← CHANGE THIS to "/YOUR-REPO-NAME/"
  // ...
});
```

### 4.3 Push the Code

```bash
# Initialize git and push
git init
git add .
git commit -m "Game Boy Collection Tracker"
git branch -M main
git remote add origin https://github.com/YOUR-USERNAME/gameboy-collection-tracker.git
git push -u origin main
```

### 4.4 Add GitHub Secrets

The web app needs to know your Supabase URL and anon key at build time. These are injected via GitHub Actions secrets:

1. Go to your repo on GitHub → **Settings** tab
2. Left sidebar → **Secrets and variables** → **Actions**
3. Click **New repository secret**
4. Add these two secrets:

   | Name | Value |
   |------|-------|
   | `VITE_SUPABASE_URL` | `https://xxxxxxxxxxxx.supabase.co` |
   | `VITE_SUPABASE_ANON_KEY` | The **anon public** key from Supabase (NOT the service_role) |

   > **Why the anon key is safe here:** The anon key is designed to be public. Security is enforced by Row-Level Security policies in the database, not by keeping the key secret.

### 4.5 Enable GitHub Pages

1. Go to your repo → **Settings** → **Pages** (left sidebar, under "Code and automation")
2. Under **Source**, select **GitHub Actions**
3. The deployment should start automatically because you already pushed the code

### 4.6 Check Deployment Status

1. Go to your repo → **Actions** tab
2. You should see a workflow running called "Deploy to GitHub Pages"
3. Wait for it to complete (green checkmark)
4. Your site is now live at: `https://YOUR-USERNAME.github.io/gameboy-collection-tracker/`

### 4.7 Update Supabase Site URL

Go back to Supabase → **Authentication** → **URL Configuration** and update:
- **Site URL**: `https://YOUR-USERNAME.github.io/gameboy-collection-tracker/`

This ensures the magic link email redirects you back to the correct site.

### 4.8 Debugging the Web App

If the deploy fails:
1. Go to the **Actions** tab → click the failed run
2. Expand the **Build** step to see the error
3. Common issues:
   - **Missing secrets** → `VITE_SUPABASE_URL is undefined` → Add the secrets in Settings
   - **Build error** → Run `npm run build` locally to see errors
   - **White page** → Check browser console (F12) for Supabase connection errors

---

## Step 5: First Login and Testing

### 5.1 Log In to the Web App

1. Open your GitHub Pages URL
2. You should see a login page: "Game Boy Collection — Sign in to access your collection tracker"
3. Enter your email → click **Send Magic Link ✉️**
4. Check your inbox (and spam folder) for an email from Supabase
5. Click the link in the email
6. You're redirected back to the web app, now showing the game table with 3,644 games

> **What just happened:** Clicking the magic link created a session. The app called `link_supabase_user()` which updated the `app_user` table with your auth UUID. Now the Row-Level Security policies match your identity → you can see your collection (which is empty).

### 5.2 Test Both Interfaces Together

This is the key test — adding a game via Telegram and seeing it appear on the web:

1. **In Telegram**: send `/add GB-0001` to your bot
   - Bot replies: "✅ Added! 3 Choume no Tama..."
2. **Refresh the web app** — scroll to row GB-0001 or search "Tama"
   - The checkbox should be checked
3. **In Telegram**: send `/stats`
   - Shows "Total owned: 1 of 3,783 (0.0%)"
4. **In the web app**: click the checkbox on GB-0001 to uncheck it
   - It unchecks
5. **In Telegram**: send `/check GB-0001`
   - Shows "❌ Not owned"

If both directions work, the system is fully functional.

---

## Step 6: Production Hardening

### 6.1 Enable Email Confirmation (Recommended)

1. Supabase → **Authentication** → **Providers** → Email
2. Check **Confirm email**
3. Now magic links only work after the email is verified

### 6.2 Keep Supabase Active

Free Supabase projects **pause after 7 days of inactivity** (no database queries). To prevent this:

**Option A:** The web app and bot naturally query the database whenever you use them, so regular use keeps it alive.

**Option B:** Set up a cron job to ping the database daily. In Cloudflare Workers dashboard:
1. Go to **Workers & Pages** → `gb-collection-bot`
2. **Triggers** → **Add Cron Trigger**
3. Set pattern: `0 9 * * *` (daily at 9am)
4. The health check endpoint `/` gets called, which doesn't use Supabase, so this only keeps the Worker warm — not the database. For Supabase, simply opening the web app or using the bot once every 7 days is enough.

### 6.3 Backup Your Collection

Currently there's no automated backup. To export your collection as a safety measure, run this in Supabase SQL Editor and copy the results:

```sql
SELECT c.*, g.title_en, g.platform, g.release_year
FROM collection c
LEFT JOIN games g ON c.game_id = g.id
WHERE c.owned = true;
```

---

## Files in This Repository

```
gameboy-collection-tracker/
│
├── index.html                     ← Web app entry point (Preact SPA)
├── package.json                   ← Web app dependencies (preact, vite, supabase-js)
├── vite.config.js                 ← Vite build config (base path)
├── package-lock.json              ← Locked dependency versions
│
├── .github/workflows/deploy.yml   ← GitHub Actions: builds and deploys to Pages
├── .gitignore                     ← Prevents node_modules, .env, dist from being committed
│
├── src/                           ← Web app source code
│   ├── main.jsx                   ← React entry point
│   ├── App.jsx                    ← Main app: auth state, filters, routing
│   ├── supabaseClient.js          ← Supabase client + auth helpers
│   ├── api.js                     ← Database query functions
│   └── components/
│       ├── Login.jsx              ← Magic link login page
│       ├── Header.jsx             ← Top bar with logout
│       ├── FilterBar.jsx          ← Platform/genre/search filters
│       ├── StatsCards.jsx         ← Collection stats cards
│       ├── GameTable.jsx          ← Sortable game table
│       └── GameDetail.jsx         ← Modal: game info + price/notes
│
├── public/
│   ├── 404.html                   ← SPA redirect for GitHub Pages
│   └── manifest.json              ← PWA manifest
│
├── cloudflare-worker/             ← Telegram bot (deployed to Cloudflare Workers)
│   ├── wrangler.toml              ← Cloudflare Worker config
│   ├── package.json               ← Bot dependencies (grammy)
│   └── src/
│       ├── index.js               ← Worker entry point: webhook router
│       ├── bot.js                  ← grammY bot: commands + middleware
│       ├── handlers.js            ← Command handlers: /search, /add, /list, etc.
│       ├── keyboards.js           ← Inline keyboard builders
│       └── supabase.js            ← Supabase client (service role) for the bot
│
├── supabase/                      ← Database schema + import tools
│   ├── migrations/
│   │   ├── 001_schema.sql         ← Creates games, bootlegs, collection tables
│   │   └── 002_auth.sql           ← Auth: app_user table, RLS policies
│   └── scripts/
│       ├── import_data.py         ← Python script: CSV → Supabase
│       ├── requirements.txt       ← Python dependencies
│       └── .env.example           ← Template for credentials
│
├── README.md                      ← Project overview + command reference
└── BUILD.md                       ← This file: complete build guide
```

---

## Tech Stack Summary

| Layer | Technology | Why |
|-------|-----------|-----|
| **Database** | Supabase (PostgreSQL) | Free 500MB, built-in Auth, auto-generated REST API |
| **Search** | PostgreSQL full-text search (`tsvector`) | Fast, free, built into the DB — no separate search service |
| **Bot runtime** | Cloudflare Workers | 100K requests/day free, global edge network, 0ms cold start |
| **Bot framework** | grammY | Type-safe, supports Cloudflare Workers natively |
| **Web framework** | Preact + Vite | Lightweight React alternative (3KB), fast builds |
| **Web hosting** | GitHub Pages | Free, auto-deploys from git, 100GB/month bandwidth |
| **Auth** | Supabase Auth (Magic Link) | Passwordless, free for 50K monthly users |
| **Security** | Row-Level Security (RLS) | Database-enforced; not just app-level |
| **Photos** (Phase 2) | Cloudflare R2 | 10GB free, no egress fees |

---

## Potential Future Enhancements

Not yet implemented — documented so you or someone else can add them:

1. **Cartridge photos**: Upload photos via bot or web app, stored in Cloudflare R2
2. **Best-version data**: Import `collection_guide/best_versions/*.csv` to show price estimates and regional recommendations
3. **Box art display**: Serve box art images from R2 in the web app
4. **CSV export**: Button to download your collection as CSV
5. **Offline mode**: PWA service worker to cache the catalog for offline browsing
6. **Multi-user**: Currently single-user by design; can be extended with proper profile management
7. **Inline Telegram queries**: Type `@gb_collection_bot zelda` in any chat to search without switching conversations
