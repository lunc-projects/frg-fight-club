# 🐸 FRG Fight Club — Telegram Mini App game template

A multi-game Telegram Mini App for Terra Classic, paid in **FRG (CW20)**.
First game is live: **FRG Boxing**, a timing-based fighting game. The lobby
is built for more games — two "coming soon" slots are already in place.

Players connect **Galaxy Station, Keplr or LuncDash**, pay an FRG entry fee
to your treasury, play, and winners are paid FRG from the treasury by the
server — after the server verifies everything on-chain itself.

## One correction to the tutorial going around

Feather.js is **not** a wallet-connect modal — it's the chain SDK (the
successor to terra.js). The connect modal that lists Station / Keplr /
LuncDash is **@terra-money/wallet-kit** (Station's official kit). This
template uses wallet-kit for connecting and Feather.js for building the
CW20 transfer message. Chain reads (balances, tx checks) use plain LCD
calls, so there's less to break.

## Already wired for you

- **FRG contract** (verified on-chain via `token_info`, Oct 17 2026):
  `terra14rfnhc2aru7jp304lht3yf903necsnrt4cxd464cftsfcksw0rtsgundnt`
  — "FRG Universe", symbol FRG, **decimals 6**
- **LCD**: `https://terra-classic-lcd.publicnode.com` (columbus-5)
- **Economy defaults**: entry **10 FRG**, prize **18 FRG** (change in
  `client/src/config.js` **and** `server/.env` — the server re-checks
  amounts on-chain, so they must match)

## How the money flows (and why it's safe)

1. Player taps **Pay & Fight** → their wallet signs a CW20 transfer of the
   entry fee to the treasury.
2. The app sends the txhash to the server → the server fetches the tx from
   the LCD and checks: succeeded, correct FRG contract, sender = player,
   recipient = treasury, amount ≥ entry fee. Only then does it issue a
   one-time session token. Each payment tx can be used **once, ever**
   (persisted in `server/data/`).
3. Player plays one match against that session.
4. On a win, the app asks the server to pay → the server checks the session
   is real, unclaimed, unexpired, and the result is plausible (match length,
   damage bounds), then pays the prize from the treasury and burns the
   session.
5. If verification glitches after a payment landed, the app offers
   **Retry verification** with the same tx — the player never has to pay
   twice for one match.

## Setup — step by step

### 1. Create the treasury wallet (your game bank)

In Station, Keplr or LuncDash, create a **new** wallet just for the game.
Save the seed phrase somewhere safe and offline. Fund it with:

- a little **LUNC** (gas for prize payouts — a few hundred is plenty to start)
- **FRG** for prizes (start small while testing, e.g. 500 FRG)

This wallet's address goes in two places (they must match):
`client/src/config.js` → `TREASURY_ADDRESS`, and `server/.env` →
`TREASURY_ADDRESS` + `TREASURY_MNEMONIC`. The mnemonic goes **only** in the
server `.env` — never in the client, never in git, never in chat.

### 2. Create the Telegram bot

Talk to [@BotFather](https://t.me/BotFather): `/newbot`, pick a name and
username, save the **bot token**. (You'll set the Play button in step 5.)

### 3. Run the server

```bash
cd server
cp .env.example .env   # fill in treasury address + mnemonic + bot token
npm install
npm start              # http://localhost:8787
```

For production, run it anywhere Node runs (a small VPS, Render, Railway…).
It must be reachable over **HTTPS** from players' phones — put it behind
the platform's HTTPS or a reverse proxy. Keep the `.env` on the server only.

### 4. Build & host the game (client)

```bash
cd client
# edit src/config.js → TREASURY_ADDRESS (same as the server's)
npm install
VITE_API_URL=https://your-server-url npm run build
```

Deploy the `dist/` folder to [Vercel](https://vercel.com/new) (or Netlify /
Cloudflare Pages). The URL you get is your game URL — must be HTTPS,
Telegram requires it.

### 5. Point the bot at the game

```bash
BOT_TOKEN=your-bot-token WEBAPP_URL=https://your-game-url node bot/bot.js
```

This sets the bot's menu button to open the game and answers `/start` with
a Play button. Leave it running (same host as the server is fine), or set
the menu button once by hand in BotFather with `/setmenubutton`.

### 6. Test like you mean it

1. Open your bot → **Play**. Connect a test wallet holding a little FRG.
2. Enter a match (10 FRG), play, win or lose on purpose.
3. Win once and claim — check the prize lands and the Finder link works:
   `https://finder.terra-classic.io/columbus-5/tx/<txhash>`
4. Only then announce it.

## Local development

Two terminals: `cd server && npm start`, and `cd client && npm run dev`.
The Vite dev server proxies `/api` to the local server automatically.
Open the client in a browser with a Station/Keplr extension to test the
full flow without Telegram.

## Adding the next game

1. Build the component under `client/src/games/` — it receives
   `onFinish(result)` and reports `{ outcome, durationMs, damageDealt, ... }`.
2. Register it in `client/src/config.js` → `GAMES` (flip `live: true`).
3. Reuse the same entry/session/claim flow — it isn't boxing-specific.
   Adjust the server's plausibility bounds in `server/index.js` if your
   game's matches are much shorter or longer.

## Honest limits — read this part

- **A determined cheater can fake a client-side win.** The server checks
  plausibility (a "win" in 3 seconds with impossible damage is rejected),
  but the match itself runs in the player's browser. For community-sized
  FRG amounts this is the normal trade-off; if real money ever rides on it,
  the game logic has to move server-side.
- **The treasury is a hot wallet.** Its seed lives on the server. Keep only
  what the game needs in it and top it up as it drains — never your main
  holdings.
- Sessions live in server memory — restarting the server expires unpaid
  sessions (players keep their FRG; only the in-flight match is lost).
- The bot token in `bot/bot.js`'s env and the server `.env` are secrets.
  If either leaks, rotate them (BotFather `/revoke` for the token; move the
  treasury funds to a fresh wallet for the seed).

## Layout

```
client/   Vite + React Mini App (lobby, wallet-kit connect, games)
server/   Express API: entry verification + treasury payouts
bot/      Dependency-free bot script (menu button + /start)
```
