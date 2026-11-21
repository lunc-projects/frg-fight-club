// LUNA GAMES — shared leaderboard endpoint for Penalty Kick, Darts,
// Luna Blocks, Luna Rider, Luna Pool, Zombie Defense and Luna Breakout
// (one serverless function for all of them; the frg-fight-club Vercel
// project is on the Hobby plan, which caps a deployment at 12
// serverless functions, so newer games share this router instead of each
// getting a score+board pair).
//   POST /api/luna-games?game=penalty|darts|blocks|rider|pool|zombie|breakout  {name, score, seconds, initData?}
//   GET  /api/luna-games?game=penalty|darts|blocks|rider|pool|zombie|breakout  -> {all, week}
// LUNC Grand Prix ("gprix") is a multi-board game: it must pass
// &level=<1..6> and gets a separate board per level, stored under the
// prefix gprix<level>: (e.g. gprix3:all). A missing or out-of-range
// level is rejected with 400 — there is no default board to leak into.
// Orbit Grand Prix ("ogprix") is the OrbitWire edition of the same
// racer: same per-level scheme under ogprix<level>:, fully separate
// boards from gprix. Like Orbit Defender it is hosted off-origin by
// the OrbitWire team, so its board is CORS-open too (see below).
// Orbit Defender's NFT board ("orbitn") is the second Defender board:
// runs flown in an NFT fighter post here instead of "orbit", under
// the prefix orbitn:. Same caps and rate window as "orbit", same
// off-origin CORS exception.
// Wallet Scope usage counter: this router also serves the Scope page's
// privacy-first counter (counts of visits + wallet lookups only — no
// addresses or user data) behind ?scope=1; vercel.json rewrites the
// public /api/scope-count URL to /api/luna-games?scope=1 because the
// Hobby plan's 12-function cap leaves no room for a separate function.
// Wallet Scope Solana relay: this router also relays the Scope page's
// read-only Solana JSON-RPC calls behind ?solrpc=1 (vercel.json
// rewrites /api/solana-rpc here) — the public Solana RPC cluster
// refuses browser-Origin requests, so the page cannot call it directly
// (see the solana-rpc block below for the full note).
// Garuda Dash payout admin: this router also serves the payout
// worksheet behind ?garudaadmin=1 (vercel.json rewrites
// /api/garuda-admin here — see the garuda-admin block below). It reads
// the gd:* wallet/date maps that garuda-score.js writes and returns
// them ONLY to an authenticated admin: either the holder of the
// GARUDA_ADMIN_KEY (fallback, only when set) or an authorised wallet
// signing in by signing a one-time login message (ADR-36) — no shared
// secret to share or leak. v5: TWO TIERS — the OWNER wallet
// (GARUDA_OWNER_WALLET env, Tom) always signs in and alone manages
// the team admin list (stored server-side, gd:admin:list, with the
// GARUDA_ADMIN_WALLET env as bootstrap/fallback) from the panel, so
// handing the team their admin never costs Tom control.
// Worksheet only: it never pays anyone and holds no keys beyond the
// read-only gate.
// v2: the admin handler also records hand-made payouts (POST) and the
// burn-wallet setting; a key-free ?garudapublic=1 route serves only
// the public strip's display data (payout name/amount/token/date/tx +
// the burn wallet address) — never a winner wallet.
// v4: the admin handler also carries the Timer Payouts (gd:paytimer
// setting + gd:payrun:<period> runs built by the ?garudatick=1 cron
// route below; the admin releases a run himself — one press, then the
// page signs each send from his own wallet) and the leaderboard
// RESTART (clears a board into a timestamped gd:archive:* copy;
// payout records and winner wallet maps are never touched).
// Pinball Token Slot: this router also keeps the slot's VERIFIED burn
// records behind ?tokenslot=1 (see the token-slot block below). The
// handler re-verifies every payment on the public LCD itself before
// recording it; the burn counter only ever shows verified totals.
// Kava Admin Panel access code: this router also holds the panel's
// access-code hash server-side behind ?kavacode=1 (see the kava-code
// block below), so the owner can change the code from inside the
// panel and the code itself never passes through chat or any person.
// Stores each player's BEST score in Upstash Redis sorted sets (all-time +
// current ISO week) plus a name map, per game prefix. Telegram WebApp
// initData is verified against the LUNC Assistant Bot token when present
// (verified players get a stable tg:<id> identity and their Telegram first
// name); otherwise the player is a guest keyed by a slug of their typed name.
// Env (Vercel project settings): NEONRUSH_UPSTASH_URL, NEONRUSH_UPSTASH_TOKEN,
// LUNC_BOT_TOKEN (for initData verification).
import crypto from 'node:crypto';

const GAMES = {
  penalty: { prefix: 'pen', maxScore: 800, minSec: 10, maxSec: 900, rateMul: 30, rateBase: 150 },
  darts: { prefix: 'darts', maxScore: 500, minSec: 10, maxSec: 900, rateMul: 30, rateBase: 150 },
  blocks: { prefix: 'blocks', maxScore: 12000, minSec: 20, maxSec: 14400, rateMul: 12, rateBase: 300 },
  rider: { prefix: 'moto', maxScore: 24000, minSec: 10, maxSec: 1800, rateMul: 180, rateBase: 2500 },
  pool: { prefix: 'pool', maxScore: 1050, minSec: 20, maxSec: 1800, rateMul: 0, rateBase: 1050 },
  zombie: { prefix: 'zom', maxScore: 12000, minSec: 5, maxSec: 1800, rateMul: 45, rateBase: 1500 },
  breakout: { prefix: 'brk', maxScore: 40000, minSec: 10, maxSec: 3600, rateMul: 30, rateBase: 1000 },
  golf: { prefix: 'golf', maxScore: 2925, minSec: 30, maxSec: 3600, rateMul: 40, rateBase: 800 },
  defender: { prefix: 'def', maxScore: 60000, minSec: 5, maxSec: 3600, rateMul: 45, rateBase: 1000 },
  /* Air Force Lunc 2.0 preview (client/public/afl-2-preview/): vertical
     shooter — score = kills + coin/token pickups + boss/level bonuses.
     A strong multi-level run lands ~30–120k; rails sized generously so a
     real run is never rejected. */
  afl2: { prefix: 'afl2', maxScore: 500000, minSec: 10, maxSec: 3600, rateMul: 300, rateBase: 2000 },
  /* LUNC Slugger (client/public/lunc-slugger/): 3D home-run challenge —
     score = hits 150 + HR 400 + walk 25 + level bonus 200+50xlevel.
     A long multi-level run lands ~5–40k; rails sized generously so a
     real run is never rejected. */
  slugger: { prefix: 'slug', maxScore: 200000, minSec: 10, maxSec: 3600, rateMul: 150, rateBase: 1500 },
  tower: { prefix: 'twr', maxScore: 100000, minSec: 10, maxSec: 3600, rateMul: 90, rateBase: 2000 },
  snake: { prefix: 'snake', maxScore: 20000, minSec: 5, maxSec: 3600, rateMul: 25, rateBase: 300 },
  flap: { prefix: 'flap', maxScore: 30000, minSec: 3, maxSec: 3600, rateMul: 16, rateBase: 150 },
  // pinball rebuilt Nov 7 with classic pinball scoring (missions up to a 250k super
  // jackpot); a strong 3-ball game lands ~200k-2M, so caps were rescaled like chain-tycoon's.
  pinball: { prefix: 'pinball', maxScore: 25000000, minSec: 10, maxSec: 3600, rateMul: 20000, rateBase: 250000 },
  racer: { prefix: 'racer', maxScore: 30000, minSec: 5, maxSec: 3600, rateMul: 45, rateBase: 300 },
  cannon: { prefix: 'cannon', maxScore: 1540, minSec: 20, maxSec: 3600, rateMul: 40, rateBase: 600 },
  whack: { prefix: 'whack', maxScore: 3000, minSec: 55, maxSec: 65, rateMul: 50, rateBase: 0 },
  merge: { prefix: 'merge', maxScore: 50000, minSec: 10, maxSec: 3600, rateMul: 30, rateBase: 500 },
  hop: { prefix: 'hop', maxScore: 30000, minSec: 10, maxSec: 3600, rateMul: 30, rateBase: 300 },
  match: { prefix: 'match', maxScore: 100000, minSec: 10, maxSec: 3600, rateMul: 300, rateBase: 2000 },
  slice: { prefix: 'slice', maxScore: 50000, minSec: 10, maxSec: 3600, rateMul: 300, rateBase: 2000 },
  bubble: { prefix: 'bub', maxScore: 60000, minSec: 10, maxSec: 3600, rateMul: 60, rateBase: 1000 },
  climb: { prefix: 'climb', maxScore: 40000, minSec: 10, maxSec: 3600, rateMul: 45, rateBase: 1500 },
  /* Candle Chaos (Nov 7 rebuild): endless 3D chart-runner. Score =
     distance (~speed/s) + green-landing streak points + pickups
     (crescent 50 / star 150); a strong minute is ~3–5k, a long
     multi-minute run can pass 20k. Rails sized generously so a real
     run is never rejected. */
  candle: { prefix: 'candle', maxScore: 500000, minSec: 5, maxSec: 3600, rateMul: 160, rateBase: 3000 },   
    'barrel-tower': { prefix: 'btwr', maxScore: 500000, minSec: 10, maxSec: 7200, rateMul: 300, rateBase: 5000, withLevel: true },
  blaster: { prefix: 'blaster', maxScore: 100000, minSec: 10, maxSec: 3600, rateMul: 300, rateBase: 2000 },
  orbit: { prefix: 'orbit', maxScore: 500000, minSec: 5, maxSec: 7200, rateMul: 300, rateBase: 2500 },
  orbitn: { prefix: 'orbitn', maxScore: 500000, minSec: 5, maxSec: 7200, rateMul: 300, rateBase: 2500 },
  /* levels: N marks a per-level game — the handler requires ?level=1..N
     and rewrites the storage prefix to prefix+level ("gprix3"). */
  gprix: { prefix: 'gprix', maxScore: 100000, minSec: 40, maxSec: 3600, rateMul: 200, rateBase: 2000, levels: 6 },
  /* LUNC Grand Prix's NFT board: runs driven in an NFT car or with any
     paid part equipped post here instead of "gprix", under the prefix
     gprixn<level>: — same per-level scheme, caps and rate window as
     gprix, fully separate boards. Same-origin like gprix (no CORS). */
  gprixn: { prefix: 'gprixn', maxScore: 100000, minSec: 40, maxSec: 3600, rateMul: 200, rateBase: 2000, levels: 6 },
  ogprix: { prefix: 'ogprix', maxScore: 100000, minSec: 40, maxSec: 3600, rateMul: 200, rateBase: 2000, levels: 6 },
  /* LUNC Dev Studio preview games (game-previews/<slug>/): web builds,
     one board each under their slug. Caps are generous first-pass rails
     sized from each game's scoring code — never reject a real run. */
  'abyssal-vault': { prefix: 'abyss', maxScore: 500000, minSec: 10, maxSec: 7200, rateMul: 300, rateBase: 2500 },
  'slashline-ronin': { prefix: 'ronin', maxScore: 200000, minSec: 5, maxSec: 3600, rateMul: 2000, rateBase: 2000 },
  flipfall: { prefix: 'flip', maxScore: 200000, minSec: 5, maxSec: 3600, rateMul: 200, rateBase: 1000 },
  'vaultbreaker-manor': { prefix: 'vmanor', maxScore: 100000, minSec: 10, maxSec: 7200, rateMul: 200, rateBase: 1000 },
  'starforge-siege': { prefix: 'sforge', maxScore: 500000, minSec: 10, maxSec: 7200, rateMul: 200, rateBase: 2000 },
  broadsides: { prefix: 'broad', maxScore: 500000, minSec: 10, maxSec: 7200, rateMul: 200, rateBase: 2000 },
  'chain-tycoon': { prefix: 'tycoon', maxScore: 10000000, minSec: 30, maxSec: 14400, rateMul: 10000, rateBase: 100000 },
  'neon-strikers': { prefix: 'neons', maxScore: 100000, minSec: 10, maxSec: 7200, rateMul: 100, rateBase: 1000 },
  voidclash: { prefix: 'vclash', maxScore: 200000, minSec: 5, maxSec: 3600, rateMul: 300, rateBase: 1000 },
  'moonfelt-poker': { prefix: 'mpoker', maxScore: 10000000, minSec: 10, maxSec: 14400, rateMul: 10000, rateBase: 100000 },
  'comet-rush': { prefix: 'comet', maxScore: 200000, minSec: 5, maxSec: 7200, rateMul: 200, rateBase: 2000 },
  /* Kava Pets (Kava Launchpad catch game, client/public/kava-pets/,
     board read by @KavaLaunchpadbot /top): pets score 100/150/500 x a
     combo multiplier up to x5, so the rails are sized from that —
     never reject a real run. */
  'kava-pets': { prefix: 'kavapets', maxScore: 500000, minSec: 5, maxSec: 3600, rateMul: 1600, rateBase: 3000 },
  /* Kava Gem Breaker (Kava Launchpad brick-breaker, client/public/
     kava-breaker/, board read by @KavaLaunchpadbot /top): blocks score
     50–250 x a combo multiplier up to x5, plus wall-clear bonuses and
     bonus gems — rails sized from that, never reject a real run. */
  'kava-breaker': { prefix: 'kavabrk', maxScore: 500000, minSec: 5, maxSec: 3600, rateMul: 1600, rateBase: 3000 },
  /* Kava Crystal Rush (Kava Launchpad endless climber,
     client/public/kava-rush/, board read by @KavaLaunchpadbot /top
     once it is registered there): score = climbed px / 10 (climb
     speed ramps 260 -> 600 px/s, so 26 -> 60 pts/s) + gems x 50
     (~1 gem per ~340px climbed). The fastest honest sustained rate
     is ~160 pts/s, so the rails below stay generous per the house
     rule — never reject a real run. */
  'kava-rush': { prefix: 'kavarush', maxScore: 500000, minSec: 5, maxSec: 3600, rateMul: 400, rateBase: 2000 },
  /* LUNC Moon Rush (the LUNC sibling of Kava Crystal Rush — same
     endless-climber engine and scoring: climbed px / 10 + coins x 50,
     speed ramps 260 -> 1000 px/s across 11 levels; client/public/
     lunc-moon-rush/). The key is 'luncrush' because 'lunc-rush' is the
     existing speed-platformer above. Same rails as kava-rush — the
     fastest honest sustained rate is ~160 pts/s, never reject a run. */
  'luncrush': { prefix: 'luncrush', maxScore: 500000, minSec: 5, maxSec: 3600, rateMul: 400, rateBase: 2000 },
  /* LUNC Frog Hop (client/public/lunc-frog-hop/): score = forward progress
     + pad fills (base + time bonus) + near-miss bonuses + level bonuses;
     a strong multi-level run lands in the low thousands — rails generous. */
  luncfrog: { prefix: 'luncfrog', maxScore: 100000, minSec: 10, maxSec: 3600, rateMul: 300, rateBase: 2000 },
  /* Frog Fight 1v1 (client/public/frog-fight/): score = damage dealt x10
     + round wins 300 + KO bonus (in damage) + match wins 1000 + ladder
     stage x500 + remaining-HP bonus + 5000 champion bonus; a full ladder
     clear lands ~30-60k — rails generous per the house rule. */
  frogfight: { prefix: 'frogfight', maxScore: 500000, minSec: 10, maxSec: 3600, rateMul: 300, rateBase: 2000 },
  /* Frog Arena (client/public/frog-arena/): MK-style 1v1 — score =
     damage dealt x10 (accumulates across the whole ladder run) + match
     win 1000 + stage x500 + remaining-HP bonus (<=300) + 5000 champion;
     a full ladder clear lands ~35-65k — rails generous per house rule. */
  frogarena: { prefix: 'frogarena', maxScore: 500000, minSec: 10, maxSec: 3600, rateMul: 300, rateBase: 2000 },
  /* Frog Clash (client/public/frog-clash/): Arena Clash 3D engine with
     NFT frog billboards — score = damage dealt x10 (accumulates across
     the whole ladder run) + match win 1000 + stage x500 + remaining-HP
     bonus (<=300) + 5000 champion; a full ladder clear lands ~35-65k —
     rails generous per the house rule. */
  frogclash: { prefix: 'frogclash', maxScore: 500000, minSec: 10, maxSec: 3600, rateMul: 300, rateBase: 2000 },
  /* Frog Arena 2 (client/public/frog-arena-2/): the colorful 3D
     rebuild on the same engine — score = ladder run total: per level
     cleared 1000 + 500 x level + remaining-HP bonus (<=300) + 5000
     champion; a full 10-level clear lands ~40k — rails generous per
     the house rule. Board key 'frogarena2', fresh (the original
     Frog Arena's 'frogarena' board above is a different game). */
  frogarena2: { prefix: 'frogarena2', maxScore: 500000, minSec: 10, maxSec: 3600, rateMul: 300, rateBase: 2000 },
  /* Frog Cards (Frogztrik NFT card battles, client/public/frog-cards/):
     score = ladder run total — 400 x rival level per win + surviving
     hero life x5; a five-rival run lands ~4-8k, endless rematches at the
     top can push higher. Rails generous so a real run is never rejected. */
  frogcards: { prefix: 'frogcards', maxScore: 50000, minSec: 10, maxSec: 3600, rateMul: 300, rateBase: 2000 },
  /* LUNC Vice (original 80s neon-city driving game, client/public/
     lunc-vice/): score comes from mission modes only — Neon Run
     checkpoints (1000 + time bonus each, 1500 finish bonus ≈ 15k max),
     Pickup Run chains (750 + combo bonus, ~2 min ceiling ≈ 25k) and
     Stunt Run air time/drift (≈ 30k on a huge run). Rails sized
     generously per the house rule — never reject a real run. */
  'luncvice': { prefix: 'luncvice', maxScore: 200000, minSec: 10, maxSec: 3600, rateMul: 300, rateBase: 2500 },
  /* Cookie Sniper (the DO community game): score comes from crumbles,
     combos, boss and clear bonuses across up to 10 levels — a perfect
     full run lands around ~90k, so the cap stays generous per the
     house rule (never reject a real run). withLevel boards also store
     the level of each player's best run (prefix:levels) and show it
     next to the score; every other game is untouched by that flag. */
  'cookie-sniper': { prefix: 'cookie', maxScore: 150000, minSec: 10, maxSec: 3600, rateMul: 300, rateBase: 2500, withLevel: true },
  /* Cookie Dash (the Garuda Dash reskin): folded into this router on
     2026-11-05 — its standalone api/cookie-dash-{board,score}.js pair
     pushed the project to 14 serverless functions, over the Hobby
     plan's 12-function cap, and Vercel rejected EVERY deployment
     from that commit on. Same 'cd' Redis prefix as the pair used, so
     storage is unchanged. The pair's plausibility rule was
     score <= seconds*60 + levels*2600 + 4000 (levels 1..10); the
     levels term folds into rateBase at its max (2600*10 + 4000 =
     30000) so no run the pair accepted is rejected here. withLevel
     stores the best run's level from body.level, like Cookie
     Sniper; the game still sends its levels field too. */
  'cookie-dash': { prefix: 'cd', maxScore: 400000, minSec: 3, maxSec: 7200, rateMul: 60, rateBase: 30000, withLevel: true },
  /* Pipe Hero (bagpipe rhythm): score is PERFECT 100 / GOOD 40 times a
     combo multiplier up to x8; the hardest chart (~175 notes) played
     perfectly tops out around ~112k, so the cap stays generous per
     the house rule. rateMul is sized from that same ceiling: a 36s
     perfect run must fit seconds*rateMul + rateBase. */
  'pipe-hero': { prefix: 'pipe', maxScore: 250000, minSec: 5, maxSec: 3600, rateMul: 4000, rateBase: 5000 },
  /* Sniper Shot 3D (the rooftop city rebuild of Sniper Shot): score =
     target base (50–150) + distance bonus (~30–160) times a combo
     multiplier up to x2.75, in 60s waves, minus fouls; runs end on the
     3rd foul, so length varies a lot. Caps stay generous per the house
     rule: a strong 10-minute run lands around ~60–80k. The original
     /sniper-shot/ never had a board; the 3D build introduces the
     'sniper-shot' key fresh (prefix 'snip'). */
  'sniper-shot': { prefix: 'snip', maxScore: 500000, minSec: 10, maxSec: 3600, rateMul: 400, rateBase: 3000 },
  /* LUNC Rush (momentum speed-platformer): score = LUNC coins x10 +
     USTC stars x50 + bot smashes x100 + per-zone time bonuses
     (<= par*15 x3). Zones doubled in length (Nov 5): 323 coins,
     18 stars, 30 bots, pars 135/155/175 -> theoretical max ~14.1k.
     A perfect run can finish in ~90s, so the rate envelope was
     raised with the content (60->120/s, base 5000->8000) to keep
     every real run inside it; caps stay generous per the house rule
     so no real run is ever rejected. (Coin census: 328 total.) */
  'lunc-rush': { prefix: 'lrush', maxScore: 60000, minSec: 20, maxSec: 3600, rateMul: 120, rateBase: 8000 },
  /* LUNC Rush 3D (behind-view endless runner): score = distance in
     metres x1 + LUNC coins x25 + USTC stars x250. A long survival run
     (~10 min at full speed) covers ~11km + ~600 coins + ~10 stars =
     ~29k, so the cap stays generous per the house rule; rateMul is
     sized from the same ceiling (~85/s at max speed incl. pickups). */
  'lunc-rush-3d': { prefix: 'lr3d', maxScore: 500000, minSec: 10, maxSec: 7200, rateMul: 120, rateBase: 5000 },
  /* LUNC Moto Speed (client/public/lunc-moto-speed/): the motorcycle
     sibling of LUNC High Speed — same infinity-speed scoring (distance
     x1.6 at speed + near-miss bonuses + wheelie bonuses). The page board
     stays local like High Speed's; this key reserves the shared board
     under 'luncmoto'. A long run at ~600 km/h scores ~270/s, so the
     rails stay generous per the house rule. */
  luncmoto: { prefix: 'luncmoto', maxScore: 2000000, minSec: 5, maxSec: 7200, rateMul: 400, rateBase: 5000 },
};

function weekKey(d = new Date()) {
  const date = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
  const day = (date.getUTCDay() + 6) % 7;
  date.setUTCDate(date.getUTCDate() - day + 3); // Thursday of this week
  const firstThu = new Date(Date.UTC(date.getUTCFullYear(), 0, 4));
  const fday = (firstThu.getUTCDay() + 6) % 7;
  firstThu.setUTCDate(firstThu.getUTCDate() - fday + 3);
  const week = 1 + Math.round((date - firstThu) / (7 * 24 * 3600 * 1000));
  return `${date.getUTCFullYear()}-W${String(week).padStart(2, '0')}`;
}

function verifyInitData(initData, botToken) {
  try {
    const params = new URLSearchParams(initData);
    const hash = params.get('hash');
    if (!hash) return null;
    params.delete('hash');
    const dcs = [...params.entries()]
      .sort((a, b) => (a[0] < b[0] ? -1 : 1))
      .map(([k, v]) => `${k}=${v}`)
      .join('\n');
    const secret = crypto.createHmac('sha256', 'WebAppData').update(botToken).digest();
    const calc = crypto.createHmac('sha256', secret).update(dcs).digest('hex');
    if (calc !== hash) return null;
    const auth = +params.get('auth_date');
    if (!auth || Date.now() / 1000 - auth > 86400) return null;
    const user = JSON.parse(params.get('user') || 'null');
    return user && user.id ? user : null;
  } catch {
    return null;
  }
}

async function upstashPipeline(cmds) {
  const r = await fetch(`${process.env.NEONRUSH_UPSTASH_URL}/pipeline`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${process.env.NEONRUSH_UPSTASH_TOKEN}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(cmds),
  });
  if (!r.ok) throw new Error(`upstash ${r.status}`);
  return r.json();
}

function pairs(flat) {
  const out = [];
  if (Array.isArray(flat)) {
    for (let i = 0; i + 1 < flat.length; i += 2) out.push({ id: flat[i], score: +flat[i + 1] });
  }
  return out;
}

async function submit(cfg, req, res) {
  let body = req.body;
  if (typeof body === 'string') {
    try { body = JSON.parse(body); } catch { body = {}; }
  }
  body = body || {};
  const score = Math.floor(+body.score);
  const seconds = Math.floor(+body.seconds);
  if (!Number.isFinite(score) || score < 0 || score > cfg.maxScore) {
    return res.status(400).json({ error: 'bad score' });
  }
  if (!Number.isFinite(seconds) || seconds < cfg.minSec || seconds > cfg.maxSec) {
    return res.status(400).json({ error: 'bad run time' });
  }
  // Plausibility cap: even a perfect run cannot outscore this per second.
  if (score > seconds * cfg.rateMul + cfg.rateBase) {
    return res.status(400).json({ error: 'score too high for run time' });
  }

  let playerId = null;
  let name = null;
  if (body.initData && process.env.LUNC_BOT_TOKEN) {
    const u = verifyInitData(String(body.initData), process.env.LUNC_BOT_TOKEN);
    if (u) {
      playerId = `tg:${u.id}`;
      name = String(u.first_name || 'Player');
    }
  }
  if (!name) name = String(body.name || '');
  name = name.trim().replace(/[<>/\\]/g, '').slice(0, 20);
  if (name.length < 2) return res.status(400).json({ error: 'name too short' });
  if (!playerId) {
    const slug = name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 24) || 'guest';
    playerId = `guest:${slug}`;
  }

  const wk = `${cfg.prefix}:week:${weekKey()}`;
  try {
    const cmds = [
      ['ZADD', `${cfg.prefix}:all`, 'GT', score, playerId],
      ['ZADD', wk, 'GT', score, playerId],
      ['HSET', `${cfg.prefix}:names`, playerId, name],
      ['EXPIRE', wk, 60 * 60 * 24 * 40],
      ['ZREVRANK', `${cfg.prefix}:all`, playerId],
    ];
    if (cfg.withLevel) {
      // Record the level of the player's BEST run: only when this
      // score actually beats (or sets) their stored best. One extra
      // read, withLevel games only.
      const lvl = Math.floor(+body.level);
      if (Number.isInteger(lvl) && lvl >= 1 && lvl <= 10) {
        const cur = await upstashPipeline([['ZSCORE', `${cfg.prefix}:all`, playerId]]);
        const curScore = cur[0] && cur[0].result != null ? +cur[0].result : null;
        if (curScore === null || score > curScore) {
          cmds.push(['HSET', `${cfg.prefix}:levels`, playerId, lvl]);
        }
      }
    }
    const out = await upstashPipeline(cmds);
    const rank = out[4] && typeof out[4].result === 'number' ? out[4].result + 1 : null;
    return res.status(200).json({ ok: true, name, rank });
  } catch (e) {
    console.error('luna-games submit failed', e && e.message);
    return res.status(502).json({ error: 'leaderboard unavailable' });
  }
}

async function board(cfg, res) {
  const wk = `${cfg.prefix}:week:${weekKey()}`;
  try {
    const out = await upstashPipeline([
      ['ZREVRANGE', `${cfg.prefix}:all`, 0, 49, 'WITHSCORES'],
      ['ZREVRANGE', wk, 0, 49, 'WITHSCORES'],
    ]);
    const all = pairs(out[0] && out[0].result);
    const week = pairs(out[1] && out[1].result);
    const ids = [...new Set([...all, ...week].map((p) => p.id))];
    let names = {};
    let levels = {};
    if (ids.length) {
      const nOut = await upstashPipeline([['HMGET', `${cfg.prefix}:names`, ...ids]]);
      const vals = (nOut[0] && nOut[0].result) || [];
      ids.forEach((id, i) => { names[id] = vals[i] || 'Player'; });
      if (cfg.withLevel) {
        const lOut = await upstashPipeline([['HMGET', `${cfg.prefix}:levels`, ...ids]]);
        const lvals = (lOut[0] && lOut[0].result) || [];
        ids.forEach((id, i) => { const n = parseInt(lvals[i], 10); levels[id] = Number.isNaN(n) ? null : n; });
      }
    }
    // One row per display name: a player can hold both a name-based guest
    // entry and a Telegram-verified entry. Rows arrive best-first, so the
    // first (highest) row per name wins and later duplicates are hidden.
    const shape = (rows) => {
      const seen = new Set();
      const out = [];
      for (const p of rows) {
        const name = names[p.id] || 'Player';
        const key = name.toLowerCase();
        if (seen.has(key)) continue;
        seen.add(key);
        const row = { name, score: p.score };
        if (cfg.withLevel) row.level = levels[p.id] ?? null;
        out.push(row);
        if (out.length >= 20) break;
      }
      return out;
    };
    res.setHeader('Cache-Control', 's-maxage=15, stale-while-revalidate=30');
    return res.status(200).json({ all: shape(all), week: shape(week) });
  } catch (e) {
    console.error('luna-games board failed', e && e.message);
    return res.status(502).json({ error: 'leaderboard unavailable' });
  }
}

/* wallet-scope:start — Wallet Scope usage counter, folded into this
   router (see the header note). Reached via ?scope=1; vercel.json
   rewrites /api/scope-count here. Counts ONLY page visits and wallet
   lookups, as totals and per-day numbers in this function's Upstash
   store (NEONRUSH_* env, shared pipeline helper above). Keys:
   scope:total:visits, scope:total:lookups,
   scope:day:<YYYY-MM-DD>:visits, scope:day:<YYYY-MM-DD>:lookups
   (day = America/New_York calendar date), incremented atomically
   (INCR). No addresses, no IPs, no user data are ever read or
   stored — the page sends nothing but {"type":"visit"|"lookup"},
   and the handler ignores any other body fields. GET returns the
   totals, today's numbers, and the last 7 days. No auth: the counts
   are public-safe aggregate numbers, nothing else is exposed. */
const SCOPE_TOTAL_VISITS = 'scope:total:visits';
const SCOPE_TOTAL_LOOKUPS = 'scope:total:lookups';

// YYYY-MM-DD in America/New_York, offset by whole days from today.
// Day arithmetic is done in UTC on the NY calendar date, so DST never
// shifts the result.
function scopeNyDate(offsetDays = 0) {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/New_York', year: 'numeric', month: '2-digit', day: '2-digit',
  }).formatToParts(new Date());
  const part = (t) => Number(parts.find((p) => p.type === t).value);
  const d = new Date(Date.UTC(part('year'), part('month') - 1, part('day') + offsetDays));
  return d.toISOString().slice(0, 10);
}

function scopeDayKeys(date) {
  return { visits: `scope:day:${date}:visits`, lookups: `scope:day:${date}:lookups` };
}

// Stored counters as numbers; missing/corrupt reads count as 0.
async function scopeReadCounts(keys) {
  const out = await upstashPipeline(keys.map((k) => ['GET', k]));
  return out.map((r) => {
    const n = parseInt(r && r.result, 10);
    return Number.isNaN(n) ? 0 : n;
  });
}

export async function scopeCountHandler(req, res) {
  if (req.method !== 'GET' && req.method !== 'POST') {
    return res.status(405).json({ ok: false, error: 'method not allowed' });
  }
  if (!process.env.NEONRUSH_UPSTASH_URL || !process.env.NEONRUSH_UPSTASH_TOKEN) {
    return res.status(500).json({ ok: false, error: 'storage not configured' });
  }

  if (req.method === 'POST') {
    let body = req.body;
    if (typeof body === 'string') {
      try { body = JSON.parse(body); } catch { body = null; }
    }
    const type = body && body.type;
    if (type !== 'visit' && type !== 'lookup') {
      return res.status(400).json({ ok: false, error: 'unknown type' });
    }
    const day = scopeDayKeys(scopeNyDate(0));
    try {
      await upstashPipeline([
        ['INCR', type === 'visit' ? SCOPE_TOTAL_VISITS : SCOPE_TOTAL_LOOKUPS],
        ['INCR', type === 'visit' ? day.visits : day.lookups],
      ]);
    } catch (e) {
      console.error('scope counter write failed', e && e.message);
      return res.status(500).json({ ok: false, error: 'storage write failed' });
    }
    return res.status(200).json({ ok: true });
  }

  // GET: totals + today + the last 7 days (oldest -> newest).
  try {
    const dates = [];
    for (let back = 6; back >= 0; back--) dates.push(scopeNyDate(-back));
    const keys = [SCOPE_TOTAL_VISITS, SCOPE_TOTAL_LOOKUPS];
    for (const date of dates) {
      const k = scopeDayKeys(date);
      keys.push(k.visits, k.lookups);
    }
    const vals = await scopeReadCounts(keys);
    const week = dates.map((date, i) => ({
      date, visits: vals[2 + i * 2], lookups: vals[3 + i * 2],
    }));
    const today = week[week.length - 1];
    return res.status(200).json({
      totalVisits: vals[0], totalLookups: vals[1], today, week,
    });
  } catch (e) {
    console.error('scope counter read failed', e && e.message);
    return res.status(500).json({ ok: false, error: 'storage read failed' });
  }
}
/* wallet-scope:end */

/* solana-rpc:start — Wallet Scope Solana relay, folded into this router
   for the same 12-function-cap reason as the Scope counter above.
   Reached via ?solrpc=1; vercel.json rewrites /api/solana-rpc here.
   Why a relay at all: the public Solana RPC cluster refuses requests
   that carry a browser Origin header (api.mainnet-beta.solana.com
   answers HTTP 403 "Access forbidden" to any Origin, verified
   2026-11-06; the other keyless endpoints either block token-account
   reads from browsers or require a personal token for
   getProgramAccounts), so the Scope page cannot read Solana directly
   from a browser. This relay forwards a small allowlist of READ-ONLY
   JSON-RPC methods from the server side (no Origin header) to the
   public RPC upstreams and returns the upstream JSON untouched. It
   holds no keys, signs nothing, stores nothing, and never logs the
   request body. Allowlist: getBalance, getAccountInfo,
   getTokenAccountsByOwner (the two SPL token programs only),
   getProgramAccounts (the Stake program only — the Scope page's
   staking check). Anything else is refused with 400. */
const SOLRPC_UPSTREAMS = ['https://api.mainnet-beta.solana.com', 'https://solana-rpc.publicnode.com'];
const SOLRPC_METHODS = { getBalance: 1, getAccountInfo: 1, getTokenAccountsByOwner: 1, getProgramAccounts: 1 };
const SOLRPC_TOKEN_PROGRAMS = { TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA: 1, TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb: 1 };
const SOLRPC_STAKE_PROGRAM = 'Stake11111111111111111111111111111111111111';

export async function solanaRpcHandler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'method not allowed' });
  let body = req.body;
  if (typeof body === 'string') { try { body = JSON.parse(body); } catch (e) { body = null; } }
  if (!body || typeof body !== 'object') return res.status(400).json({ error: 'bad request' });
  if (JSON.stringify(body).length > 16384) return res.status(413).json({ error: 'request too large' });
  const method = String(body.method || '');
  if (!SOLRPC_METHODS[method]) return res.status(400).json({ error: 'method not allowed' });
  const params = Array.isArray(body.params) ? body.params : [];
  if (method === 'getTokenAccountsByOwner') {
    const prog = params[1] && params[1].programId;
    if (!SOLRPC_TOKEN_PROGRAMS[prog]) return res.status(400).json({ error: 'program not allowed' });
  }
  if (method === 'getProgramAccounts' && params[0] !== SOLRPC_STAKE_PROGRAM) {
    return res.status(400).json({ error: 'program not allowed' });
  }
  const payload = JSON.stringify({ jsonrpc: '2.0', id: body.id == null ? 1 : body.id, method, params });
  let lastErr = null;
  for (const up of SOLRPC_UPSTREAMS) {
    try {
      const ctl = new AbortController();
      const t = setTimeout(() => ctl.abort(), 9000);
      const r = await fetch(up, { method: 'POST', headers: { 'content-type': 'application/json' }, body: payload, signal: ctl.signal });
      clearTimeout(t);
      const text = await r.text();
      let j = null;
      try { j = JSON.parse(text); } catch (e) { /* not JSON — treat as upstream failure */ }
      if (r.ok && j && !j.error) {
        res.setHeader('Cache-Control', 'no-store');
        res.setHeader('Content-Type', 'application/json');
        return res.status(200).send(text);
      }
      lastErr = (j && j.error && j.error.message) || ('HTTP ' + r.status);
    } catch (e) { lastErr = (e && e.message) || 'fetch failed'; }
  }
  return res.status(502).json({ jsonrpc: '2.0', id: body.id == null ? 1 : body.id, error: { code: -32000, message: 'upstream unavailable: ' + (lastErr || 'unknown') } });
}
/* solana-rpc:end */

/* ethereum-rpc:start — Wallet Scope Ethereum relay, folded into this
   router for the same 12-function-cap reason as the Solana relay
   above. Reached via ?ethrpc=1; vercel.json rewrites /api/ethereum-rpc
   here. Why: the Scope page's Ethereum section issues many small
   read calls (balances, balanceOf/allowance sweeps, Approval log
   scans); keyless public nodes throttle bursts unevenly by origin,
   so the page sends them here and this relay forwards them server-
   side (no Origin header) across several public upstreams. It holds
   no keys, signs nothing, stores nothing, and never logs the request
   body. Allowlist: eth_blockNumber, eth_getBalance, eth_getCode,
   eth_call (view calls only — balanceOf/allowance/name/symbol/
   decimals and the Permit2 allowance selector), eth_getLogs (only
   Approval-topic queries for one owner). Anything else: 400. */
const ETHRPC_UPSTREAMS = ['https://ethereum-rpc.publicnode.com', 'https://eth.drpc.org', 'https://1rpc.io/eth', 'https://rpc.mevblocker.io'];
const ETHRPC_METHODS = { eth_blockNumber: 1, eth_getBalance: 1, eth_getCode: 1, eth_call: 1, eth_getLogs: 1 };
const ETHRPC_CALL_SELECTORS = { '0x70a08231': 1, '0xdd62ed3e': 1, '0x06fdde03': 1, '0x95d89b41': 1, '0x313ce567': 1, '0x927da105': 1 };
const ETHRPC_APPROVAL_TOPIC = '0x8c5be1e5ebec7d5bd14f71427d1e84f3dd0314c0f7b2291e5b200ac8c7c3b925';

export async function ethereumRpcHandler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'method not allowed' });
  let body = req.body;
  if (typeof body === 'string') { try { body = JSON.parse(body); } catch (e) { body = null; } }
  if (!body || typeof body !== 'object') return res.status(400).json({ error: 'bad request' });
  if (JSON.stringify(body).length > 16384) return res.status(413).json({ error: 'request too large' });
  const method = String(body.method || '');
  if (!ETHRPC_METHODS[method]) return res.status(400).json({ error: 'method not allowed' });
  const params = Array.isArray(body.params) ? body.params : [];
  if (method === 'eth_call') {
    const data = String((params[0] && params[0].data) || '').toLowerCase();
    if (!ETHRPC_CALL_SELECTORS[data.slice(0, 10)]) return res.status(400).json({ error: 'call not allowed' });
  }
  if (method === 'eth_getLogs') {
    const f = params[0] || {};
    const topics = Array.isArray(f.topics) ? f.topics : [];
    if (!f.address || topics[0] !== ETHRPC_APPROVAL_TOPIC ||
        typeof topics[1] !== 'string' || !/^0x0{24}[0-9a-f]{40}$/.test(topics[1]))
      return res.status(400).json({ error: 'log query not allowed' });
  }
  const payload = JSON.stringify({ jsonrpc: '2.0', id: body.id == null ? 1 : body.id, method, params });
  let lastErr = null;
  for (const up of ETHRPC_UPSTREAMS) {
    try {
      const ctl = new AbortController();
      const t = setTimeout(() => ctl.abort(), 9000);
      const r = await fetch(up, { method: 'POST', headers: { 'content-type': 'application/json' }, body: payload, signal: ctl.signal });
      clearTimeout(t);
      const text = await r.text();
      let j = null;
      try { j = JSON.parse(text); } catch (e) { /* not JSON — upstream failure */ }
      if (r.ok && j) {
        res.setHeader('Cache-Control', 'no-store');
        res.setHeader('Content-Type', 'application/json');
        return res.status(200).send(text);
      }
      lastErr = 'HTTP ' + r.status;
    } catch (e) { lastErr = (e && e.message) || 'fetch failed'; }
  }
  return res.status(502).json({ jsonrpc: '2.0', id: body.id == null ? 1 : body.id, error: { code: -32000, message: 'upstream unavailable: ' + (lastErr || 'unknown') } });
}
/* ethereum-rpc:end */

/* garuda-admin:start — Garuda Dash payout worksheet, folded into this
   router for the same 12-function-cap reason as the blocks below.
   Reached via ?garudaadmin=1; vercel.json rewrites /api/garuda-admin
   here. Returns the Garuda Dash leaderboard WITH wallet addresses +
   best-score dates so the Garuda team can pay winners BY HAND from
   their own wallet. Key-gated server-side (Bearer, timing-safe compare
   against the GARUDA_ADMIN_KEY env var). The PUBLIC board
   (garuda-board.js) never returns wallets — this handler is the only
   place they are exposed, and only behind the key.
   v2 additions (payout records + burn wallet): POST with the same key
   records a payout the team made BY HAND ({name, wallet, amount,
   token, txHash, note?}) or sets the burn wallet ({action:
   "setBurnWallet", burnWallet}); GET also returns `payouts` + the
   burn-wallet setting. Payout PUBLIC display data (name/amount/
   token/date/tx) is served key-free via ?garudapublic=1 (see that
   block below) — never any winner wallet. The burn TOTAL itself is
   read live from the chain by the page; only the wallet address is
   stored here (gd:burnwallet).
   v3 additions (wallet-signature admin sign-in): the payout panel
   also opens for the Garuda team admin wallet named by the
   GARUDA_ADMIN_WALLET env var. POST {action:"challenge", address}
   issues a one-time login message (single-use nonce, 5-minute TTL,
   stored as gd:adminchal:<address>) — and only for that one address;
   any other address gets a generic refusal that never reveals the
   expected one. POST {action:"verify", address, nonce, pubKey,
   signature} verifies the ADR-36 (Keplr signArbitrary) signature
   over the STORED message: the challenge is burned on ANY verify
   attempt, the address derived from the pubkey must equal both the
   claimed address and the authorised wallet it signed in as, and on
   success a random session token (stored hashed, gd:adminsess:<sha256>,
   4-hour TTL) becomes the Bearer credential for the existing
   GET/POST actions.
   The GARUDA_ADMIN_KEY check stays as a fallback for when a key is
   set (it currently is not). All crypto is node:crypto built-ins —
   no new dependency joins this shared router.
   v5 additions (two-tier admin — OWNER above the team ADMIN; Tom's
   order Nov 11: handing the admin to the Garuda team must never cost
   him control, and the team needs us for full maintenance):
   - The OWNER wallet comes from the GARUDA_OWNER_WALLET env var ONLY.
     Nothing stored in the database can create, change or remove the
     owner, and the owner is checked FIRST: an owner sign-in always
     works, no matter what the stored admin list says.
   - The team ADMIN list lives server-side in the same store
     (gd:admin:list — a JSON array of terra1 addresses, managed from
     the owner's panel) so Tom can replace / add / remove the team
     admin from the panel with NO Vercel redeploy. The env
     GARUDA_ADMIN_WALLET is the bootstrap + fallback entry: it counts
     as an admin whenever it is set, and whenever the stored record is
     missing, corrupt or not a JSON array at all the effective admin
     set is exactly {GARUDA_ADMIN_WALLET} — i.e. behaviour identical
     to v3/v4. (A stored EMPTY array is different: it is a real
     record — the owner removed the last panel admin — and only the
     env entry remains, which is that same set.) Store READ errors
     are likewise treated as "no stored list" (fail closed toward
     the env wallet), never as a lockout.
   - A sign-in is authorised when the address is the owner OR is in
     the effective admin set. The session record stores {addr, role}
     (older plain-address records still parse as role "admin"). The
     role is re-resolved LIVE on every gated call (gdAdminResolveRole):
     the owner env wallet is always "owner"; any other session wallet
     is "admin" only while it is still in the effective admin set —
     so removing an admin in the panel kills that admin's live
     sessions immediately, and rotating the env wallet keeps its old
     kill-everything meaning for non-owner sessions.
   - Admin-management actions (POST action "adminAccess" with
     op "get" | "add" | "remove", plus the read-only fields the admin
     GET now returns) are OWNER-ONLY, enforced server-side on every
     call: the shared key and team-admin sessions get 403. "add" with
     replace:true swaps the single team admin; without it, it appends
     (max 5 stored admins). The owner address can never enter the
     stored list, and removing the env wallet from the panel is a
     no-op it reports honestly (the env entry only changes in Vercel).
   - Every admin-list change is appended to an audit list in the same
     store (gd:admin:audit, newest first, capped at 50): {at, by,
     action, addr, old, new} — shown only in the owner's panel.
   v6 additions (GAME SETTINGS — Nov 13): the GET also returns
   `gameSettings` (effective map + defaults + ranges), and POST
   actions "setGameSettings" / "resetGameSettings" write the game's
   tuning overrides (gd:gamesettings) — allowed for owner AND team
   admin sessions (unlike admin management above); the game reads
   the merged map key-free via ?garudasettings=1. See the
   garuda-settings block below for the full contract. */
const GD_TXHASH_RE = /^[0-9A-Fa-f]{64}$/;
const GD_ADDR_RE = /^terra1[0-9a-z]{38}$/;
/* ---- v5: two-tier admin (owner + team admins) ----
   gdAdminOwner(): the owner wallet, from the GARUDA_OWNER_WALLET env
   var ONLY — never read from the store, never writable through any
   endpoint. gdAdminStoredList(): the owner-managed team admin list
   (gd:admin:list); null means "no usable stored record" (missing,
   corrupt JSON, not an array, empty after filtering, or the store
   read failed) and the caller falls back to the env wallet alone.
   gdAdminEffectiveAdmins(): the set of team-admin wallets right now —
   stored list when usable, PLUS the env GARUDA_ADMIN_WALLET whenever
   it is set (bootstrap/fallback), MINUS the owner (the owner is a
   tier above the list, never an entry in it). */
const GD_ADMIN_LIST_KEY = 'gd:admin:list';
const GD_ADMIN_AUDIT_KEY = 'gd:admin:audit';
const GD_ADMIN_MAX_ADMINS = 5;
const GD_ADMIN_AUDIT_MAX = 50;
function gdAdminOwner() {
  const o = process.env.GARUDA_OWNER_WALLET || '';
  return GD_ADDR_RE.test(o) ? o : '';
}
async function gdAdminStoredList() {
  try {
    const out = await upstashPipeline([['GET', GD_ADMIN_LIST_KEY]]);
    const raw = (out && out[0] && out[0].result) || null;
    if (!raw) return null;
    let arr = null;
    try { arr = JSON.parse(raw); } catch (e) { return null; }
    if (!Array.isArray(arr)) return null;
    /* A stored array is authoritative even when empty (owner removed
       the last panel admin — distinct from "no record"): filter to
       valid addresses and return as-is, [] included. */
    return [...new Set(arr.map((a) => String(a || '')).filter((a) => GD_ADDR_RE.test(a)))];
  } catch (e) { return null; }
}
async function gdAdminEffectiveAdmins() {
  const owner = gdAdminOwner();
  const stored = await gdAdminStoredList();
  const set = new Set(stored || []);
  const envAdmin = process.env.GARUDA_ADMIN_WALLET || '';
  if (GD_ADDR_RE.test(envAdmin)) set.add(envAdmin);
  if (owner) set.delete(owner);
  return set;
}
/* Is this address allowed to sign in at all (either tier)? */
async function gdAdminAuthorized(address) {
  if (!GD_ADDR_RE.test(address)) return null;
  if (address === gdAdminOwner()) return 'owner';
  const admins = await gdAdminEffectiveAdmins();
  return admins.has(address) ? 'admin' : null;
}
/* Append one entry to the owner-visible audit list (newest first).
   Best-effort: a failed audit write never blocks the change itself,
   which has already been stored — but it is logged server-side. */
async function gdAdminAudit(entry) {
  try {
    const out = await upstashPipeline([['GET', GD_ADMIN_AUDIT_KEY]]);
    let arr = [];
    try { arr = JSON.parse((out && out[0] && out[0].result) || '[]'); } catch (e) { arr = []; }
    if (!Array.isArray(arr)) arr = [];
    arr.unshift(entry);
    await upstashPipeline([['SET', GD_ADMIN_AUDIT_KEY, JSON.stringify(arr.slice(0, GD_ADMIN_AUDIT_MAX))]]);
  } catch (e) { console.error('garuda admin audit write failed', e && e.message); }
}
async function gdAdminAuditRead() {
  try {
    const out = await upstashPipeline([['GET', GD_ADMIN_AUDIT_KEY]]);
    const arr = JSON.parse((out && out[0] && out[0].result) || '[]');
    return Array.isArray(arr) ? arr.slice(0, GD_ADMIN_AUDIT_MAX) : [];
  } catch (e) { return []; }
}
/* ---- v3: wallet-signature admin sign-in helpers (ADR-36) ----
   Keplr's signArbitrary signs an amino sign doc whose single message
   is sign/MsgSignData {signer, data: base64(message)}. The signature
   is secp256k1 over sha256 of the amino-serialised doc (keys sorted,
   <>& escaped — the @cosmjs/amino serializeSignDoc rules). Everything
   below is node:crypto built-ins plus a small bech32 encoder, so this
   shared router gains no new dependency. */
const GD_ADMIN_CHAL_TTL_SEC = 300;          /* login challenge: 5 minutes */
const GD_ADMIN_SESS_TTL_SEC = 4 * 3600;     /* admin session: 4 hours */
const GD_BECH32_CHARS = 'qpzry9x8gf2tvdw0s3jn54khce6mua7l';
function gdBech32Polymod(vals) {
  const GEN = [0x3b6a57b2, 0x26508e6d, 0x1ea119fa, 0x3d4233dd, 0x2a1462b3];
  let chk = 1;
  for (const v of vals) {
    const top = chk >>> 25;
    chk = ((chk & 0x1ffffff) << 5) ^ v;
    for (let i = 0; i < 5; i++) if ((top >>> i) & 1) chk ^= GEN[i];
  }
  return chk;
}
function gdConvertBits(data, from, to, pad) {
  let acc = 0, bits = 0;
  const out = [];
  const maxv = (1 << to) - 1;
  for (const v of data) {
    acc = (acc << from) | v;
    bits += from;
    while (bits >= to) { bits -= to; out.push((acc >>> bits) & maxv); }
  }
  if (pad) { if (bits) out.push((acc << (to - bits)) & maxv); }
  else if (bits >= from || ((acc << (to - bits)) & maxv)) return null;
  return out;
}
function gdBech32Encode(hrp, dataBytes) {
  const data = gdConvertBits([...dataBytes], 8, 5, true);
  const vals = [];
  for (const c of hrp) vals.push(c.charCodeAt(0) >>> 5);
  vals.push(0);
  for (const c of hrp) vals.push(c.charCodeAt(0) & 31);
  const pm = gdBech32Polymod([...vals, ...data, 0, 0, 0, 0, 0, 0]) ^ 1;
  let out = hrp + '1';
  for (const d of data) out += GD_BECH32_CHARS[d];
  for (let i = 0; i < 6; i++) out += GD_BECH32_CHARS[(pm >>> (5 * (5 - i))) & 31];
  return out;
}
/* Terra Classic address for a 33-byte compressed secp256k1 pubkey:
   bech32(ripemd160(sha256(pubkey))) with the "terra" hrp. */
function gdAddressFromPubKey(pub) {
  const sha = crypto.createHash('sha256').update(pub).digest();
  const ripe = crypto.createHash('ripemd160').update(sha).digest();
  return gdBech32Encode('terra', ripe);
}
/* Decompress a secp256k1 point (for the JWK Node's verifier needs):
   y = (x^3+7)^((p+1)/4) mod p, choosing the root matching the
   compressed key's parity byte. BigInt only — constant shape, no
   secret input (the pubkey is public). */
function gdDecompressPubKey(pub) {
  const p = (1n << 256n) - (1n << 32n) - 977n;
  const x = BigInt('0x' + pub.subarray(1, 33).toString('hex'));
  if (x >= p) return null;
  let y = (x * x * x + 7n) % p;
  let e = (p + 1n) / 4n, base = y, acc = 1n;
  while (e > 0n) { if (e & 1n) acc = (acc * base) % p; base = (base * base) % p; e >>= 1n; }
  y = acc;
  if ((y * y) % p !== (x * x * x + 7n) % p) return null;   /* not on curve */
  const wantOdd = (pub[0] & 1) === 1;
  if (((y & 1n) === 1n) !== wantOdd) y = p - y;
  const xb = Buffer.alloc(32); const yb = Buffer.alloc(32);
  let t = x; for (let i = 31; i >= 0; i--) { xb[i] = Number(t & 255n); t >>= 8n; }
  t = y; for (let i = 31; i >= 0; i--) { yb[i] = Number(t & 255n); t >>= 8n; }
  return { x: xb, y: yb };
}
function gdSortJson(v) {
  if (Array.isArray(v)) return v.map(gdSortJson);
  if (v && typeof v === 'object') {
    const o = {};
    for (const k of Object.keys(v).sort()) o[k] = gdSortJson(v[k]);
    return o;
  }
  return v;
}
/* The exact bytes Keplr signs for signArbitrary (ADR-36 amino doc). */
function gdAdr36SignBytes(message, signer) {
  const doc = {
    account_number: '0',
    chain_id: '',
    fee: { amount: [], gas: '0' },
    memo: '',
    msgs: [{ type: 'sign/MsgSignData', value: { data: Buffer.from(message, 'utf8').toString('base64'), signer } }],
    sequence: '0',
  };
  const json = JSON.stringify(gdSortJson(doc))
    .replace(/&/g, '\\u0026').replace(/</g, '\\u003c').replace(/>/g, '\\u003e');
  return Buffer.from(json, 'utf8');
}
function gdVerifyAdr36(message, signer, pub, sig) {
  try {
    if (!Buffer.isBuffer(pub) || pub.length !== 33 || (pub[0] !== 2 && pub[0] !== 3)) return false;
    if (!Buffer.isBuffer(sig) || sig.length !== 64) return false;
    const pt = gdDecompressPubKey(pub);
    if (!pt) return false;
    const key = crypto.createPublicKey({
      format: 'jwk',
      key: { kty: 'EC', crv: 'secp256k1', x: pt.x.toString('base64url'), y: pt.y.toString('base64url') },
    });
    return crypto.verify('sha256', gdAdr36SignBytes(message, signer), { key, dsaEncoding: 'ieee-p1363' }, sig);
  } catch (e) { return false; }
}
/* Challenge step: only an authorised wallet (the owner, or a wallet
   in the effective team-admin set) may even request a login message.
   Every other address — malformed, well-formed, or the store being
   unconfigured for sign-in — gets the same generic refusal, so the
   endpoint never reveals which addresses are expected. */
async function gdAdminChallenge(req, res, body) {
  const address = String(body.address || '');
  if (!(await gdAdminAuthorized(address))) {
    return res.status(403).json({ ok: false, error: 'not authorized' });
  }
  const nonce = crypto.randomBytes(16).toString('hex');   /* 128-bit */
  const issued = new Date().toISOString();
  const message = [
    'Garuda Dash — admin sign-in',
    '',
    'Sign this message to open the Garuda Dash payout admin panel.',
    'This is a login signature only — not a transaction. It cannot',
    'move funds, costs no fee, and this login request expires in',
    '5 minutes.',
    '',
    'Wallet: ' + address,
    'Nonce: ' + nonce,
    'Issued: ' + issued,
  ].join('\n');
  const rec = JSON.stringify({ nonce, message, exp: Date.now() + GD_ADMIN_CHAL_TTL_SEC * 1000 });
  try {
    await upstashPipeline([['SET', 'gd:adminchal:' + address, rec, 'EX', String(GD_ADMIN_CHAL_TTL_SEC)]]);
  } catch (e) {
    console.error('garuda admin challenge save failed', e && e.message);
    return res.status(502).json({ error: 'store unavailable' });
  }
  res.setHeader('Cache-Control', 'no-store');
  return res.status(200).json({ ok: true, message, nonce, expiresIn: GD_ADMIN_CHAL_TTL_SEC });
}
/* Verify step: the stored challenge is burned on ANY attempt (GETDEL
   first, judge after), so a nonce can never be replayed — not even
   after a failed try. The signature must be a valid ADR-36 signature
   over the STORED message, and the address derived from the supplied
   pubkey must equal the claimed address, which must be authorised
   (owner or effective team admin) at verify time. On success the
   session record stores {addr, role} so the panel knows its tier. */
async function gdAdminVerify(req, res, body) {
  const fail = () => res.status(401).json({ ok: false, error: 'sign-in failed' });
  const address = String(body.address || '');
  const role = await gdAdminAuthorized(address);
  if (!role) return fail();
  let stored = null;
  try {
    const out = await upstashPipeline([['GETDEL', 'gd:adminchal:' + address]]);
    stored = (out && out[0] && out[0].result) || null;
  } catch (e) {
    console.error('garuda admin challenge read failed', e && e.message);
    return res.status(502).json({ error: 'store unavailable' });
  }
  if (!stored) return fail();
  let chal = null;
  try { chal = JSON.parse(stored); } catch (e) { /* corrupt record */ }
  if (!chal || !chal.nonce || !chal.message || !(chal.exp > Date.now())) return fail();
  if (String(body.nonce || '') !== chal.nonce) return fail();
  /* Accept the signature either flat ({pubKey, signature} base64
     strings) or as the StdSignature object Keplr returns
     ({pub_key:{value}, signature}). */
  let pubB64 = String(body.pubKey || '');
  let sigB64 = String(body.signature || '');
  if (body.signature && typeof body.signature === 'object') {
    sigB64 = String(body.signature.signature || '');
    if (body.signature.pub_key) pubB64 = String(body.signature.pub_key.value || '');
  }
  let pub, sig;
  try {
    pub = Buffer.from(pubB64, 'base64');
    sig = Buffer.from(sigB64, 'base64');
  } catch (e) { return fail(); }
  if (gdAddressFromPubKey(pub) !== address) return fail();
  if (!gdVerifyAdr36(chal.message, address, pub, sig)) return fail();
  const token = crypto.randomBytes(32).toString('base64url');
  const tokenKey = 'gd:adminsess:' + crypto.createHash('sha256').update(token).digest('hex');
  try {
    await upstashPipeline([['SET', tokenKey, JSON.stringify({ addr: address, role }), 'EX', String(GD_ADMIN_SESS_TTL_SEC)]]);
  } catch (e) {
    console.error('garuda admin session save failed', e && e.message);
    return res.status(502).json({ error: 'store unavailable' });
  }
  res.setHeader('Cache-Control', 'no-store');
  return res.status(200).json({ ok: true, token, role, expiresIn: GD_ADMIN_SESS_TTL_SEC });
}
/* A Bearer credential that is not the shared key may be a wallet
   sign-in session token. The stored record is {addr, role} (v5);
   older records are the bare address string and parse as role
   "admin". The role is RE-RESOLVED LIVE on every call:
   - the env GARUDA_OWNER_WALLET is always "owner" — the stored list
     can never remove, demote or override the owner;
   - any other wallet is "admin" only while it is still in the
     effective admin set (stored list ∪ env GARUDA_ADMIN_WALLET), so
     removing an admin in the panel — or rotating the env wallet —
     kills that admin's live sessions immediately, exactly as
     rotating the env var killed every session before v5.
   Returns 'owner' | 'admin' | null. */
async function gdAdminResolveSession(token) {
  try {
    if (!token) return null;
    const key = 'gd:adminsess:' + crypto.createHash('sha256').update(token).digest('hex');
    const out = await upstashPipeline([['GET', key]]);
    const raw = (out && out[0] && out[0].result) || null;
    if (!raw) return null;
    let addr = raw;
    try {
      const rec = JSON.parse(raw);
      if (rec && typeof rec === 'object' && typeof rec.addr === 'string') addr = rec.addr;
    } catch (e) { /* pre-v5 bare-address record */ }
    if (!GD_ADDR_RE.test(addr)) return null;
    if (addr === gdAdminOwner()) return { addr, role: 'owner' };
    const admins = await gdAdminEffectiveAdmins();
    return admins.has(addr) ? { addr, role: 'admin' } : null;
  } catch (e) { return null; }
}
async function gdAdminResolveRole(token) {
  const sess = await gdAdminResolveSession(token);
  return sess ? sess.role : null;
}
async function gdAdminSessionOk(token) {
  return !!(await gdAdminResolveRole(token));
}
async function garudaAdminHandler(req, res) {
  if (req.method !== 'GET' && req.method !== 'POST') return res.status(405).json({ error: 'method not allowed' });
  const storeOk = !!(process.env.NEONRUSH_UPSTASH_URL && process.env.NEONRUSH_UPSTASH_TOKEN);
  /* Parse the POST body up front: the wallet sign-in actions are
     handled BEFORE the gate (they are how an admin authenticates);
     every other action stays behind it, unchanged. */
  let body = null;
  if (req.method === 'POST') {
    body = req.body;
    if (typeof body === 'string') {
      try { body = JSON.parse(body); } catch { body = {}; }
    }
    body = body || {};
  }
  if (body && (body.action === 'challenge' || body.action === 'verify')) {
    if (!storeOk) return res.status(503).json({ error: 'store not configured' });
    return body.action === 'challenge'
      ? gdAdminChallenge(req, res, body)
      : gdAdminVerify(req, res, body);
  }
  const want = process.env.GARUDA_ADMIN_KEY || '';
  const auth = (req.headers && req.headers.authorization) || '';
  const got = auth.startsWith('Bearer ') ? auth.slice(7) : '';
  let keyOk = false;
  if (want && got) {
    const a = Buffer.from(got);
    const b = Buffer.from(want);
    keyOk = a.length === b.length && crypto.timingSafeEqual(a, b);
  }
  /* Wallet sign-in session token: tried only when the shared key did
     not match, so the key fallback behaves exactly as before. The
     caller's role is resolved LIVE (v5): 'owner' | 'admin' | null.
     Key callers keep role null — the key is a break-glass credential
     for the ordinary panel actions, never for admin management. */
  let sessRole = null;
  let sessAddr = '';
  if (!keyOk && got && storeOk) {
    const sess = await gdAdminResolveSession(got);
    sessRole = sess && sess.role;
    sessAddr = (sess && sess.addr) || '';
    keyOk = !!sessRole;
  }
  if (!keyOk) return res.status(401).json({ ok: false, error: 'unauthorized' });
  if (!storeOk) {
    return res.status(503).json({ error: 'leaderboard not configured' });
  }
  if (req.method === 'POST') {
    /* v5: admin-access management — OWNER session only, enforced here
       on every call (the page merely hides the section from admins).
       A team-admin session, or the shared key, gets a plain 403. */
    if (body.action === 'adminAccess') {
      if (sessRole !== 'owner') {
        return res.status(403).json({ ok: false, error: 'owner only' });
      }
      try {
        return await gdAdminAccessAction(req, res, body);
      } catch (e) {
        console.error('garuda admin access failed', e && e.message);
        return res.status(502).json({ error: 'store unavailable' });
      }
    }
    /* Game Settings writes (see the garuda-settings block): owner
       AND team-admin sessions may tune the game — the same gate as
       the timer actions below. Only admin-LIST management (above)
       is owner-only. */
    if (body.action === 'setGameSettings' || body.action === 'resetGameSettings') {
      try {
        return await gdSettingsAction(req, res, body, sessAddr || 'key');
      } catch (e) {
        console.error('garuda settings action failed', e && e.message);
        return res.status(502).json({ error: 'store unavailable' });
      }
    }
    /* v4: Timer Payouts + leaderboard restart actions — same gate as
       every other admin action (wallet sign-in session or key). */
    if (body.action === 'setPayTimer' || body.action === 'stopPayTimer' ||
        body.action === 'cancelPayRun' || body.action === 'recordRunPayout' ||
        body.action === 'restartLeaderboard') {
      try {
        return await gdAdminTimerAction(req, res, body, sessAddr);
      } catch (e) {
        console.error('garuda timer action failed', e && e.message);
        return res.status(502).json({ error: 'store unavailable' });
      }
    }
    /* Burn-wallet setting: the wallet whose GDEX balance the game page
       reads live from the chain and shows as the burned total. Only
       the address is stored — never a typed-in total. */
    if (body.action === 'setBurnWallet') {
      const bw = String(body.burnWallet || '');
      if (bw && !GD_ADDR_RE.test(bw)) {
        return res.status(400).json({ ok: false, error: 'bad burn wallet address' });
      }
      try {
        await upstashPipeline([['SET', 'gd:burnwallet', bw]]);
        return res.status(200).json({ ok: true, burnWallet: bw || null });
      } catch (e) {
        console.error('garuda burn wallet save failed', e && e.message);
        return res.status(502).json({ error: 'store unavailable' });
      }
    }
    /* Payout record: one hand-made payout, keyed by its tx hash so the
       same payout can never be recorded twice. */
    const name = String(body.name || '').trim().replace(/[<>/\\]/g, '').slice(0, 40);
    const wallet = String(body.wallet || '');
    const amount = String(body.amount || '').trim().slice(0, 24);
    const token = String(body.token || '').trim().replace(/[<>/\\]/g, '').slice(0, 12);
    const txHash = String(body.txHash || '').trim().toUpperCase();
    const note = String(body.note || '').trim().replace(/[<>/\\]/g, '').slice(0, 120);
    if (name.length < 1) return res.status(400).json({ ok: false, error: 'bad name' });
    if (!GD_ADDR_RE.test(wallet)) return res.status(400).json({ ok: false, error: 'bad wallet' });
    if (!/^[0-9]+(\.[0-9]+)?$/.test(amount)) return res.status(400).json({ ok: false, error: 'bad amount' });
    if (token.length < 1) return res.status(400).json({ ok: false, error: 'bad token' });
    if (!GD_TXHASH_RE.test(txHash)) return res.status(400).json({ ok: false, error: 'bad tx hash' });
    const rec = JSON.stringify({
      name, wallet, amount, token, txHash,
      note: note || null,
      date: new Date().toISOString().slice(0, 10),
    });
    try {
      const out = await upstashPipeline([['HSETNX', 'gd:payouts', txHash, rec]]);
      if (!out[0] || out[0].result !== 1) {
        return res.status(409).json({ ok: false, error: 'payout already recorded' });
      }
      return res.status(200).json({ ok: true, txHash });
    } catch (e) {
      console.error('garuda payout save failed', e && e.message);
      return res.status(502).json({ error: 'store unavailable' });
    }
  }
  const wk = `gd:week:${weekKey()}`;
  try {
    const out = await upstashPipeline([
      ['ZREVRANGE', 'gd:all', 0, 49, 'WITHSCORES'],
      ['ZREVRANGE', wk, 0, 49, 'WITHSCORES'],
    ]);
    const all = pairs(out[0] && out[0].result);
    const week = pairs(out[1] && out[1].result);
    const ids = [...new Set([...all, ...week].map((p) => p.id))];
    let names = {}, wallets = {}, dates = {};
    if (ids.length) {
      const mOut = await upstashPipeline([
        ['HMGET', 'gd:names', ...ids],
        ['HMGET', 'gd:wallets', ...ids],
        ['HMGET', 'gd:dates', ...ids],
      ]);
      const pick = (r) => {
        const vals = (r && r.result) || [];
        const o = {};
        ids.forEach((id, i) => { o[id] = vals[i] || null; });
        return o;
      };
      names = pick(mOut[0]);
      wallets = pick(mOut[1]);
      dates = pick(mOut[2]);
    }
    /* Admin rows are NOT name-deduped (unlike the public board): every
       stored identity is a potential payee row. wallet is null for
       players who never played on a connected wallet — the panel marks
       those "no wallet — can't pay". */
    const shape = (rows) => rows.slice(0, 50).map((p) => ({
      name: names[p.id] || 'Player',
      wallet: wallets[p.id] || null,
      score: p.score,
      date: dates[p.id] || null,
    }));
    /* v2: payout records (full rows incl. winner wallet — admin only)
       + the burn-wallet setting, for the admin panel's payout/burn
       sections. */
    const pOut = await upstashPipeline([
      ['HGETALL', 'gd:payouts'],
      ['GET', 'gd:burnwallet'],
    ]);
    const pFlat = (pOut[0] && pOut[0].result) || [];
    const payouts = [];
    for (let i = 0; i + 1 < pFlat.length; i += 2) {
      try {
        const rec = JSON.parse(pFlat[i + 1]);
        if (rec && rec.txHash) payouts.push(rec);
      } catch (e) { /* skip corrupt record */ }
    }
    payouts.sort((a, b) => String(b.date || '').localeCompare(String(a.date || '')));
    const burnWallet = (pOut[1] && pOut[1].result) || null;
    /* v4: the timer setting + any waiting payout run ride along so
       the panel can draw the Timer Payouts box in the same load. */
    const tState = await gdTimerState();
    /* Game Settings ride along too, for every gated caller (the
       panel's GAME SETTINGS section renders from this). */
    const gsState = await gdSettingsEffective();
    /* v5: who is asking + (owner only) the admin-access state. Admin
       sessions and the key get role only — the admin list and audit
       trail are never served to a non-owner. */
    const ownerWallet = gdAdminOwner();
    let adminAccess = null;
    if (sessRole === 'owner') {
      const storedList = await gdAdminStoredList();
      adminAccess = {
        envAdmin: (process.env.GARUDA_ADMIN_WALLET || '') || null,
        storedList,
        audit: await gdAdminAuditRead(),
      };
    }
    res.setHeader('Cache-Control', 'no-store');
    return res.status(200).json({
      all: shape(all), week: shape(week), payouts, burnWallet,
      payTimer: tState.payTimer, payRun: tState.payRun,
      gameSettings: gdSettingsPayload(gsState.effective),
      role: sessRole || (keyOk ? 'key' : null),
      ownerWallet: ownerWallet || null,
      adminAccess,
    });
  } catch (e) {
    console.error('garuda admin failed', e && e.message);
    return res.status(502).json({ error: 'leaderboard unavailable' });
  }
}
/* v5: owner-only admin-access management. Dispatched from
   garudaAdminHandler AFTER the gate, with sessRole === 'owner'
   already enforced there; `by` for the audit trail is the owner
   wallet itself. op "get" re-reads the state (the panel uses it to
   refresh after a change); "add" appends one admin — or, with
   replace:true, makes the stored list exactly that one wallet (the
   panel's REPLACE THE TEAM ADMIN); "remove" takes one wallet out of
   the stored list. Removing can never touch the owner (rejected) and
   removing the env wallet reports the truth (env entries change only
   in Vercel) instead of pretending. Every real change is stored and
   audited with before/after lists. */
async function gdAdminAccessAction(req, res, body) {
  const by = gdAdminOwner();
  const envAdmin = process.env.GARUDA_ADMIN_WALLET || '';
  const state = async () => {
    const storedList = await gdAdminStoredList();
    return {
      ok: true,
      ownerWallet: by,
      envAdmin: envAdmin || null,
      storedList,
      admins: [...(await gdAdminEffectiveAdmins())],
      audit: await gdAdminAuditRead(),
    };
  };
  const op = String(body.op || 'get');
  if (op === 'get') return res.status(200).json(await state());
  const addr = String(body.address || '');
  if (op !== 'add' && op !== 'remove') {
    return res.status(400).json({ ok: false, error: 'unknown op' });
  }
  if (!GD_ADDR_RE.test(addr)) {
    return res.status(400).json({ ok: false, error: 'bad wallet address' });
  }
  if (addr === by) {
    return res.status(400).json({ ok: false, error: 'the owner wallet cannot be added to or removed from the admin list' });
  }
  const stored = (await gdAdminStoredList()) || [];
  const now = new Date().toISOString();
  if (op === 'add') {
    const replace = body.replace === true;
    if (!replace && stored.includes(addr)) {
      return res.status(409).json({ ok: false, error: 'that wallet is already a team admin' });
    }
    const next = replace ? [addr] : [...stored, addr];
    if (next.length > GD_ADMIN_MAX_ADMINS) {
      return res.status(400).json({ ok: false, error: 'too many team admins (max ' + GD_ADMIN_MAX_ADMINS + ')' });
    }
    await upstashPipeline([['SET', GD_ADMIN_LIST_KEY, JSON.stringify(next)]]);
    await gdAdminAudit({ at: now, by, action: replace ? 'replace-admin' : 'add-admin', addr, old: stored, new: next });
    return res.status(200).json(await state());
  }
  /* op === 'remove' */
  if (!stored.includes(addr)) {
    if (addr === envAdmin) {
      return res.status(400).json({ ok: false, error: 'that wallet comes from the server settings (GARUDA_ADMIN_WALLET) — it can only be changed there, not from this panel' });
    }
    return res.status(404).json({ ok: false, error: 'that wallet is not in the stored admin list' });
  }
  const next = stored.filter((a) => a !== addr);
  await upstashPipeline([['SET', GD_ADMIN_LIST_KEY, JSON.stringify(next)]]);
  await gdAdminAudit({ at: now, by, action: 'remove-admin', addr, old: stored, new: next });
  return res.status(200).json(await state());
}
/* garuda-admin:end */

/* garuda-settings:start — Garuda Dash GAME SETTINGS (Nov 13, Tom's
   order: the Garuda admin must be able to adjust the whole game with
   easy one-step click directions). The owner or a team admin tunes
   the game's difficulty / economy numbers from the panel's GAME
   SETTINGS section; the values live server-side in the same store
   (gd:gamesettings — a JSON map of OVERRIDES only; an absent key
   means "the game's built-in default"). The public game reads the
   merged effective map at load via ?garudasettings=1 and applies it
   over its identical built-in defaults; if the fetch fails, the
   defaults stand, so the game can never break because settings are
   unreachable. Settings apply on game LOAD only — a run already in
   progress never changes mid-game.
   Writes ride the garuda-admin gate (owner session, team-admin
   session, or the break-glass key — the same callers the Timer
   Payouts actions accept). Admin-LIST management stays owner-only
   and is untouched by this block. Every change is audited through
   gdAdminAudit (the gd:admin:audit list, shown in the owner's
   panel) with the full old -> new effective maps.
   The defaults below are the game's shipped tuning (Nov 12 build):
   foe hits = min(8, ceil(level/5)), brutes +1; boss HP from
   gdMakeBoss (table + cycle bonus); boss throws follow the level
   formula unless a per-minute rate is set; shurikens start 5,
   +1 per finished level, +1 per pickup, carry cap 12; lives start
   3, cap 5; post-hit invulnerability 1.6s; enemy speed 100%. */
const GD_SET_KEY = 'gd:gamesettings';
const GD_SET_DEFS = [
  { key: 'shuStart',         def: 5,   min: 0,   max: 20,  step: 1 },
  { key: 'shuPerLevel',      def: 1,   min: 0,   max: 5,   step: 1 },
  { key: 'shuPickup',        def: 1,   min: 1,   max: 5,   step: 1 },
  { key: 'shuMax',           def: 12,  min: 1,   max: 30,  step: 1 },
  { key: 'livesStart',       def: 3,   min: 1,   max: 9,   step: 1 },
  { key: 'livesMax',         def: 5,   min: 1,   max: 9,   step: 1 },
  { key: 'foeHitsCap',       def: 8,   min: 1,   max: 12,  step: 1 },
  { key: 'foeHitsStep',      def: 5,   min: 1,   max: 10,  step: 1 },
  { key: 'bruteBonus',       def: 1,   min: 0,   max: 5,   step: 1 },
  { key: 'bossHpBonus',      def: 0,   min: -6,  max: 20,  step: 1 },
  { key: 'bossThrowsPerMin', def: 0,   min: 0,   max: 60,  step: 1 },
  { key: 'foeSpeedPct',      def: 100, min: 50,  max: 200, step: 5 },
  { key: 'hurtGraceSec',     def: 1.6, min: 0.5, max: 3,   step: 0.1 },
];
function gdSetDefaults() {
  const o = {};
  for (const d of GD_SET_DEFS) o[d.key] = d.def;
  return o;
}
function gdSetRound(d, v) {
  const r = Math.round(v / d.step) * d.step;
  return Math.round(r * 1000) / 1000;
}
/* Validate a settings map. On WRITE (strict) any unknown key,
   non-number or out-of-range value rejects the whole write (null);
   on READ of the stored map the same problems are ignored per key,
   so a corrupt or future record can never poison the game. */
function gdSetValidate(input, strict) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) return null;
  const clean = {};
  for (const k of Object.keys(input)) {
    const d = GD_SET_DEFS.find((x) => x.key === k);
    if (!d) { if (strict) return null; continue; }
    const v = Number(input[k]);
    if (!Number.isFinite(v)) { if (strict) return null; continue; }
    const r = gdSetRound(d, v);
    if (r < d.min || r > d.max) { if (strict) return null; continue; }
    clean[k] = r;
  }
  return clean;
}
async function gdSettingsStored() {
  try {
    const out = await upstashPipeline([['GET', GD_SET_KEY]]);
    const raw = (out && out[0] && out[0].result) || null;
    if (!raw) return {};
    let parsed = null;
    try { parsed = JSON.parse(raw); } catch (e) { return {}; }
    return gdSetValidate(parsed, false) || {};
  } catch (e) { return {}; }
}
async function gdSettingsEffective() {
  const stored = await gdSettingsStored();
  return { stored, effective: { ...gdSetDefaults(), ...stored } };
}
function gdSettingsPayload(effective) {
  return {
    settings: effective,
    defaults: gdSetDefaults(),
    defs: GD_SET_DEFS.map((d) => ({ key: d.key, min: d.min, max: d.max, step: d.step })),
  };
}
/* Public read for the game page: the merged effective settings and
   nothing else (no admin data rides this route). Store unconfigured
   or unreadable -> the built-in defaults, so the answer is always a
   complete, valid map. */
async function garudaSettingsHandler(req, res) {
  if (req.method !== 'GET') return res.status(405).json({ error: 'method not allowed' });
  let effective = gdSetDefaults();
  if (process.env.NEONRUSH_UPSTASH_URL && process.env.NEONRUSH_UPSTASH_TOKEN) {
    try { effective = (await gdSettingsEffective()).effective; } catch (e) { /* defaults stand */ }
  }
  res.setHeader('Cache-Control', 's-maxage=30, stale-while-revalidate=60');
  return res.status(200).json({ ok: true, settings: effective });
}
/* Admin writes, dispatched from garudaAdminHandler AFTER its gate;
   `by` is the caller's sign-in wallet, or 'key' for the break-glass
   key. Reset deletes the overrides record entirely, returning the
   game to its exact shipped tuning. Both actions answer with the
   panel payload so the section re-renders from server truth. */
async function gdSettingsAction(req, res, body, by) {
  const now = new Date().toISOString();
  const defaults = gdSetDefaults();
  if (body.action === 'resetGameSettings') {
    const prev = (await gdSettingsEffective()).effective;
    await upstashPipeline([['DEL', GD_SET_KEY]]);
    await gdAdminAudit({ at: now, by, action: 'game-settings-reset', addr: by, old: prev, new: defaults });
    return res.status(200).json({ ok: true, gameSettings: gdSettingsPayload(defaults) });
  }
  /* action === 'setGameSettings' */
  const clean = gdSetValidate(body.settings, true);
  if (!clean || !Object.keys(clean).length) {
    return res.status(400).json({ ok: false, error: 'bad settings' });
  }
  const { stored, effective: prev } = await gdSettingsEffective();
  const merged = { ...stored, ...clean };
  const overrides = {};
  for (const k of Object.keys(merged)) if (merged[k] !== defaults[k]) overrides[k] = merged[k];
  if (Object.keys(overrides).length) {
    await upstashPipeline([['SET', GD_SET_KEY, JSON.stringify(overrides)]]);
  } else {
    await upstashPipeline([['DEL', GD_SET_KEY]]);
  }
  const next = { ...defaults, ...overrides };
  await gdAdminAudit({ at: now, by, action: 'game-settings', addr: by, old: prev, new: next });
  return res.status(200).json({ ok: true, gameSettings: gdSettingsPayload(next) });
}
/* garuda-settings:end */

/* frog-admin:start — LUNC Frog Hop ADMIN + GAME SETTINGS (Nov 17,
   Tom's order: set the frog game up like Garuda Dash, with an admin
   panel for adjustments). A direct mirror of the garuda-admin /
   garuda-settings pattern above, with frog-owned keys and env:
   - Reached via ?frogadmin=1 (panel data + writes) and
     ?frogsettings=1 (public read of the merged effective settings —
     the game fetches it at load; defaults stand if it fails).
   - Wallet-signature sign-in ONLY (ADR-36 / Keplr signArbitrary):
     POST {action:"challenge", address} issues a one-time login
     message (single-use nonce, 5-minute TTL, frog:adminchal:<addr>)
     and only to an authorised wallet; POST {action:"verify", ...}
     deletes the challenge only after a SUCCESSFUL verify (a failed
     attempt keeps it, inside the same 5-minute TTL), verifies the
     signature with the gd* ADR-36 helpers the Garuda sign-in uses
     PLUS the Keplr-mobile chain-id variant (see frogAdminVerifyAdr36
     below). The address derived from the pubkey must equal the
     claimed address, and on
     success issues a random session token (stored hashed,
     frog:adminsess:<sha256>, 4-hour TTL). Nothing here holds a key
     or signs a transaction — it is a login signature only.
   - TWO TIERS, exactly like Garuda v5: the OWNER wallet comes from
     the FROG_OWNER_WALLET env var ONLY (falling back to
     GARUDA_OWNER_WALLET so one Vercel setting can cover Tom's games;
     nothing stored can create, change or remove the owner, and the
     owner is checked FIRST). The team ADMIN list lives server-side
     (frog:admin:list, JSON array, max 5) and is managed from the
     owner's panel; roles are re-resolved LIVE on every gated call,
     so removing an admin kills their live sessions immediately.
     Admin-list changes are audited (frog:admin:audit, newest first,
     capped at 50) and shown only to the owner.
   - GAME SETTINGS: overrides only at frog:gamesettings; writes are
     owner OR team-admin (admin-LIST management stays owner-only).
     The panel payload also carries a board summary read from the
     luncfrog sorted sets (players on the board + top 10) — real
     router data only, nothing invented. */
const FROG_SET_KEY = 'frog:gamesettings';
const FROG_ADMIN_LIST_KEY = 'frog:admin:list';
const FROG_ADMIN_AUDIT_KEY = 'frog:admin:audit';
const FROG_ADMIN_MAX_ADMINS = 5;
const FROG_ADMIN_AUDIT_MAX = 50;
const FROG_ADMIN_CHAL_TTL_SEC = 300;
const FROG_ADMIN_SESS_TTL_SEC = 4 * 3600;
const FROG_SET_DEFS = [
  { key: 'trafficSpeedPct',   def: 100, min: 50, max: 200, step: 5 },
  { key: 'trafficDensityPct', def: 100, min: 60, max: 160, step: 5 },
  { key: 'riverSpeedPct',     def: 100, min: 50, max: 200, step: 5 },
  { key: 'livesStart',        def: 3,   min: 1,  max: 9,   step: 1 },
  { key: 'timerSec',          def: 60,  min: 30, max: 90,  step: 5 },
  { key: 'padScore',          def: 50,  min: 0,  max: 500, step: 10 },
  { key: 'nearMissScore',     def: 15,  min: 0,  max: 100, step: 5 },
  { key: 'progressScore',     def: 10,  min: 0,  max: 50,  step: 5 },
  { key: 'paceRampPct',       def: 100, min: 50, max: 200, step: 5 },
];
function frogSetDefaults() {
  const o = {};
  for (const d of FROG_SET_DEFS) o[d.key] = d.def;
  return o;
}
function frogSetRound(d, v) {
  const r = Math.round(v / d.step) * d.step;
  return Math.round(r * 1000) / 1000;
}
function frogSetValidate(input, strict) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) return null;
  const clean = {};
  for (const k of Object.keys(input)) {
    const d = FROG_SET_DEFS.find((x) => x.key === k);
    if (!d) { if (strict) return null; continue; }
    const v = Number(input[k]);
    if (!Number.isFinite(v)) { if (strict) return null; continue; }
    const r = frogSetRound(d, v);
    if (r < d.min || r > d.max) { if (strict) return null; continue; }
    clean[k] = r;
  }
  return clean;
}
async function frogSettingsStored() {
  try {
    const out = await upstashPipeline([['GET', FROG_SET_KEY]]);
    const raw = (out && out[0] && out[0].result) || null;
    if (!raw) return {};
    let parsed = null;
    try { parsed = JSON.parse(raw); } catch (e) { return {}; }
    return frogSetValidate(parsed, false) || {};
  } catch (e) { return {}; }
}
async function frogSettingsEffective() {
  const stored = await frogSettingsStored();
  return { stored, effective: { ...frogSetDefaults(), ...stored } };
}
function frogSettingsPayload(effective) {
  return {
    settings: effective,
    defaults: frogSetDefaults(),
    defs: FROG_SET_DEFS.map((d) => ({ key: d.key, min: d.min, max: d.max, step: d.step })),
  };
}
async function frogSettingsHandler(req, res) {
  if (req.method !== 'GET') return res.status(405).json({ error: 'method not allowed' });
  let effective = frogSetDefaults();
  if (process.env.NEONRUSH_UPSTASH_URL && process.env.NEONRUSH_UPSTASH_TOKEN) {
    try { effective = (await frogSettingsEffective()).effective; } catch (e) { /* defaults stand */ }
  }
  res.setHeader('Cache-Control', 's-maxage=30, stale-while-revalidate=60');
  return res.status(200).json({ ok: true, settings: effective });
}
/* ---- two-tier access ---- */
function frogAdminOwner() {
  const o = process.env.FROG_OWNER_WALLET || '';
  if (GD_ADDR_RE.test(o)) return o;
  const g = process.env.GARUDA_OWNER_WALLET || '';
  return GD_ADDR_RE.test(g) ? g : '';
}
async function frogAdminStoredList() {
  try {
    const out = await upstashPipeline([['GET', FROG_ADMIN_LIST_KEY]]);
    const raw = (out && out[0] && out[0].result) || null;
    if (!raw) return null;
    let arr = null;
    try { arr = JSON.parse(raw); } catch (e) { return null; }
    if (!Array.isArray(arr)) return null;
    return [...new Set(arr.map((a) => String(a || '')).filter((a) => GD_ADDR_RE.test(a)))];
  } catch (e) { return null; }
}
async function frogAdminEffectiveAdmins() {
  const owner = frogAdminOwner();
  const stored = await frogAdminStoredList();
  const set = new Set(stored || []);
  if (owner) set.delete(owner);
  return set;
}
async function frogAdminAuthorized(address) {
  if (!GD_ADDR_RE.test(address)) return null;
  if (address === frogAdminOwner()) return 'owner';
  const admins = await frogAdminEffectiveAdmins();
  return admins.has(address) ? 'admin' : null;
}
async function frogAdminAudit(entry) {
  try {
    const out = await upstashPipeline([['GET', FROG_ADMIN_AUDIT_KEY]]);
    let arr = [];
    try { arr = JSON.parse((out && out[0] && out[0].result) || '[]'); } catch (e) { arr = []; }
    if (!Array.isArray(arr)) arr = [];
    arr.unshift(entry);
    await upstashPipeline([['SET', FROG_ADMIN_AUDIT_KEY, JSON.stringify(arr.slice(0, FROG_ADMIN_AUDIT_MAX))]]);
  } catch (e) { console.error('frog admin audit write failed', e && e.message); }
}
async function frogAdminAuditRead() {
  try {
    const out = await upstashPipeline([['GET', FROG_ADMIN_AUDIT_KEY]]);
    const arr = JSON.parse((out && out[0] && out[0].result) || '[]');
    return Array.isArray(arr) ? arr.slice(0, FROG_ADMIN_AUDIT_MAX) : [];
  } catch (e) { return []; }
}
/* ---- wallet-signature sign-in (ADR-36 via the gd* helpers) ---- */
async function frogAdminChallenge(req, res, body) {
  const address = String(body.address || '');
  if (!(await frogAdminAuthorized(address))) {
    return res.status(403).json({ ok: false, error: 'not authorized' });
  }
  const nonce = crypto.randomBytes(16).toString('hex');
  const issued = new Date().toISOString();
  const message = [
    'LUNC Frog Hop — admin sign-in',
    '',
    'Sign this message to open the LUNC Frog Hop admin panel.',
    'This is a login signature only — not a transaction. It cannot',
    'move funds, costs no fee, and this login request expires in',
    '5 minutes.',
    '',
    'Wallet: ' + address,
    'Nonce: ' + nonce,
    'Issued: ' + issued,
  ].join('\n');
  const rec = JSON.stringify({ nonce, message, exp: Date.now() + FROG_ADMIN_CHAL_TTL_SEC * 1000 });
  try {
    await upstashPipeline([['SET', 'frog:adminchal:' + address, rec, 'EX', String(FROG_ADMIN_CHAL_TTL_SEC)]]);
  } catch (e) {
    console.error('frog admin challenge save failed', e && e.message);
    return res.status(502).json({ error: 'store unavailable' });
  }
  res.setHeader('Cache-Control', 'no-store');
  return res.status(200).json({ ok: true, message, nonce, expiresIn: FROG_ADMIN_CHAL_TTL_SEC });
}
/* Keplr MOBILE's signArbitrary has historically signed the same
   ADR-36 amino doc as the extension but with the real chain_id
   ('columbus-5') where the extension puts ''. Both docs carry the
   same message and the same signer, so accepting either costs no
   security: the signature must still verify against the pubkey
   whose derived address equals the claimed (authorised) wallet.
   gdAdr36SignBytes hardcodes chain_id '', so the variant doc is
   built here with the chain id as a parameter. */
function frogAdminAdr36SignBytes(message, signer, chainId) {
  const doc = {
    account_number: '0',
    chain_id: chainId,
    fee: { amount: [], gas: '0' },
    memo: '',
    msgs: [{ type: 'sign/MsgSignData', value: { data: Buffer.from(message, 'utf8').toString('base64'), signer } }],
    sequence: '0',
  };
  const json = JSON.stringify(gdSortJson(doc))
    .replace(/&/g, '\\u0026').replace(/</g, '\\u003c').replace(/>/g, '\\u003e');
  return Buffer.from(json, 'utf8');
}
function frogAdminVerifyAdr36(message, signer, pub, sig) {
  if (gdVerifyAdr36(message, signer, pub, sig)) return true;   /* extension doc (chain_id '') */
  try {
    if (!Buffer.isBuffer(pub) || pub.length !== 33 || (pub[0] !== 2 && pub[0] !== 3)) return false;
    if (!Buffer.isBuffer(sig) || sig.length !== 64) return false;
    const pt = gdDecompressPubKey(pub);
    if (!pt) return false;
    const key = crypto.createPublicKey({
      format: 'jwk',
      key: { kty: 'EC', crv: 'secp256k1', x: pt.x.toString('base64url'), y: pt.y.toString('base64url') },
    });
    return crypto.verify('sha256', frogAdminAdr36SignBytes(message, signer, 'columbus-5'), { key, dsaEncoding: 'ieee-p1363' }, sig);
  } catch (e) { return false; }
}
async function frogAdminVerify(req, res, body) {
  const fail = () => res.status(401).json({ ok: false, error: 'sign-in failed' });
  const address = String(body.address || '');
  const role = await frogAdminAuthorized(address);
  if (!role) return fail();
  let stored = null;
  try {
    const out = await upstashPipeline([['GET', 'frog:adminchal:' + address]]);
    stored = (out && out[0] && out[0].result) || null;
  } catch (e) {
    console.error('frog admin challenge read failed', e && e.message);
    return res.status(502).json({ error: 'store unavailable' });
  }
  if (!stored) return fail();
  let chal = null;
  try { chal = JSON.parse(stored); } catch (e) { /* corrupt record */ }
  if (!chal || !chal.nonce || !chal.message || !(chal.exp > Date.now())) return fail();
  if (String(body.nonce || '') !== chal.nonce) return fail();
  let pubB64 = String(body.pubKey || '');
  let sigB64 = String(body.signature || '');
  if (body.signature && typeof body.signature === 'object') {
    sigB64 = String(body.signature.signature || '');
    if (body.signature.pub_key) pubB64 = String(body.signature.pub_key.value || '');
  }
  let pub, sig;
  try {
    pub = Buffer.from(pubB64, 'base64');
    sig = Buffer.from(sigB64, 'base64');
  } catch (e) { return fail(); }
  if (gdAddressFromPubKey(pub) !== address) return fail();
  if (!frogAdminVerifyAdr36(chal.message, address, pub, sig)) return fail();
  /* Signature proven — burn the challenge NOW so it stays
     single-success. A failed attempt never reaches this delete,
     so a legitimate retry inside the TTL (slow app-switch, a
     double-tap, one rejected signature variant) still works. */
  try {
    await upstashPipeline([['DEL', 'frog:adminchal:' + address]]);
  } catch (e) { console.error('frog admin challenge delete failed', e && e.message); }
  const token = crypto.randomBytes(32).toString('base64url');
  const tokenKey = 'frog:adminsess:' + crypto.createHash('sha256').update(token).digest('hex');
  try {
    await upstashPipeline([['SET', tokenKey, JSON.stringify({ addr: address, role }), 'EX', String(FROG_ADMIN_SESS_TTL_SEC)]]);
  } catch (e) {
    console.error('frog admin session save failed', e && e.message);
    return res.status(502).json({ error: 'store unavailable' });
  }
  res.setHeader('Cache-Control', 'no-store');
  return res.status(200).json({ ok: true, token, role, expiresIn: FROG_ADMIN_SESS_TTL_SEC });
}
async function frogAdminResolveSession(token) {
  try {
    if (!token) return null;
    const key = 'frog:adminsess:' + crypto.createHash('sha256').update(token).digest('hex');
    const out = await upstashPipeline([['GET', key]]);
    const raw = (out && out[0] && out[0].result) || null;
    if (!raw) return null;
    let addr = raw;
    try {
      const rec = JSON.parse(raw);
      if (rec && typeof rec === 'object' && typeof rec.addr === 'string') addr = rec.addr;
    } catch (e) { /* bare-address record */ }
    if (!GD_ADDR_RE.test(addr)) return null;
    if (addr === frogAdminOwner()) return { addr, role: 'owner' };
    const admins = await frogAdminEffectiveAdmins();
    return admins.has(addr) ? { addr, role: 'admin' } : null;
  } catch (e) { return null; }
}
/* ---- settings writes (owner + team admin) ---- */
async function frogSettingsAction(req, res, body, by) {
  const now = new Date().toISOString();
  const defaults = frogSetDefaults();
  if (body.action === 'resetGameSettings') {
    const prev = (await frogSettingsEffective()).effective;
    await upstashPipeline([['DEL', FROG_SET_KEY]]);
    await frogAdminAudit({ at: now, by, action: 'game-settings-reset', addr: by, old: prev, new: defaults });
    return res.status(200).json({ ok: true, gameSettings: frogSettingsPayload(defaults) });
  }
  const clean = frogSetValidate(body.settings, true);
  if (!clean || !Object.keys(clean).length) {
    return res.status(400).json({ ok: false, error: 'bad settings' });
  }
  const { stored, effective: prev } = await frogSettingsEffective();
  const merged = { ...stored, ...clean };
  const overrides = {};
  for (const k of Object.keys(merged)) if (merged[k] !== defaults[k]) overrides[k] = merged[k];
  if (Object.keys(overrides).length) {
    await upstashPipeline([['SET', FROG_SET_KEY, JSON.stringify(overrides)]]);
  } else {
    await upstashPipeline([['DEL', FROG_SET_KEY]]);
  }
  const next = { ...defaults, ...overrides };
  await frogAdminAudit({ at: now, by, action: 'game-settings', addr: by, old: prev, new: next });
  return res.status(200).json({ ok: true, gameSettings: frogSettingsPayload(next) });
}
/* ---- admin-list management (owner only) ---- */
async function frogAdminAccessAction(req, res, body) {
  const by = frogAdminOwner();
  const state = async () => ({
    ok: true,
    ownerWallet: by,
    storedList: await frogAdminStoredList(),
    admins: [...(await frogAdminEffectiveAdmins())],
    audit: await frogAdminAuditRead(),
  });
  const op = String(body.op || 'get');
  if (op === 'get') return res.status(200).json(await state());
  const addr = String(body.address || '');
  if (op !== 'add' && op !== 'remove') {
    return res.status(400).json({ ok: false, error: 'unknown op' });
  }
  if (!GD_ADDR_RE.test(addr)) {
    return res.status(400).json({ ok: false, error: 'bad wallet address' });
  }
  if (addr === by) {
    return res.status(400).json({ ok: false, error: 'the owner wallet cannot be added to or removed from the admin list' });
  }
  const stored = (await frogAdminStoredList()) || [];
  const now = new Date().toISOString();
  if (op === 'add') {
    const replace = body.replace === true;
    if (!replace && stored.includes(addr)) {
      return res.status(409).json({ ok: false, error: 'that wallet is already a team admin' });
    }
    const next = replace ? [addr] : [...stored, addr];
    if (next.length > FROG_ADMIN_MAX_ADMINS) {
      return res.status(400).json({ ok: false, error: 'too many team admins (max ' + FROG_ADMIN_MAX_ADMINS + ')' });
    }
    await upstashPipeline([['SET', FROG_ADMIN_LIST_KEY, JSON.stringify(next)]]);
    await frogAdminAudit({ at: now, by, action: replace ? 'replace-admin' : 'add-admin', addr, old: stored, new: next });
    return res.status(200).json(await state());
  }
  if (!stored.includes(addr)) {
    return res.status(404).json({ ok: false, error: 'that wallet is not in the stored admin list' });
  }
  const next = stored.filter((a) => a !== addr);
  await upstashPipeline([['SET', FROG_ADMIN_LIST_KEY, JSON.stringify(next)]]);
  await frogAdminAudit({ at: now, by, action: 'remove-admin', addr, old: stored, new: next });
  return res.status(200).json(await state());
}
/* ---- board summary (real router data only) ---- */
async function frogBoardSummary() {
  try {
    const out = await upstashPipeline([
      ['ZCARD', 'luncfrog:all'],
      ['ZREVRANGE', 'luncfrog:all', '0', '9', 'WITHSCORES'],
    ]);
    const players = (out[0] && out[0].result) || 0;
    const rows = pairs((out[1] && out[1].result) || []);
    let names = {};
    if (rows.length) {
      const ids = rows.map((p) => p.id);
      const nOut = await upstashPipeline([['HMGET', 'luncfrog:names', ...ids]]);
      const vals = (nOut[0] && nOut[0].result) || [];
      ids.forEach((id, i) => { names[id] = vals[i] || null; });
    }
    return {
      players,
      top: rows.map((p) => ({ name: names[p.id] || 'Player', score: p.score })),
    };
  } catch (e) { return { players: 0, top: [] }; }
}
/* ---- the panel handler ---- */
async function frogAdminHandler(req, res) {
  if (req.method !== 'GET' && req.method !== 'POST') return res.status(405).json({ error: 'method not allowed' });
  const storeOk = !!(process.env.NEONRUSH_UPSTASH_URL && process.env.NEONRUSH_UPSTASH_TOKEN);
  let body = null;
  if (req.method === 'POST') {
    body = req.body;
    if (typeof body === 'string') {
      try { body = JSON.parse(body); } catch { body = {}; }
    }
    body = body || {};
  }
  if (body && (body.action === 'challenge' || body.action === 'verify')) {
    if (!storeOk) return res.status(503).json({ error: 'store not configured' });
    return body.action === 'challenge'
      ? frogAdminChallenge(req, res, body)
      : frogAdminVerify(req, res, body);
  }
  if (!storeOk) return res.status(503).json({ error: 'store not configured' });
  const auth = (req.headers && req.headers.authorization) || '';
  const got = auth.startsWith('Bearer ') ? auth.slice(7) : '';
  const sess = got ? await frogAdminResolveSession(got) : null;
  if (!sess) return res.status(401).json({ ok: false, error: 'unauthorized' });
  if (req.method === 'POST') {
    if (body.action === 'adminAccess') {
      if (sess.role !== 'owner') {
        return res.status(403).json({ ok: false, error: 'owner only' });
      }
      try {
        return await frogAdminAccessAction(req, res, body);
      } catch (e) {
        console.error('frog admin access failed', e && e.message);
        return res.status(502).json({ error: 'store unavailable' });
      }
    }
    if (body.action === 'setGameSettings' || body.action === 'resetGameSettings') {
      try {
        return await frogSettingsAction(req, res, body, sess.addr);
      } catch (e) {
        console.error('frog settings action failed', e && e.message);
        return res.status(502).json({ error: 'store unavailable' });
      }
    }
    return res.status(400).json({ ok: false, error: 'unknown action' });
  }
  /* GET: panel data */
  try {
    const gsState = await frogSettingsEffective();
    let adminAccess = null;
    if (sess.role === 'owner') {
      adminAccess = {
        storedList: await frogAdminStoredList(),
        audit: await frogAdminAuditRead(),
      };
    }
    res.setHeader('Cache-Control', 'no-store');
    return res.status(200).json({
      ok: true,
      role: sess.role,
      wallet: sess.addr,
      ownerWallet: frogAdminOwner() || null,
      gameSettings: frogSettingsPayload(gsState.effective),
      board: await frogBoardSummary(),
      adminAccess,
    });
  } catch (e) {
    console.error('frog admin failed', e && e.message);
    return res.status(502).json({ error: 'admin unavailable' });
  }
}
/* frog-admin:end */


/* garuda-timer:start — v4: Timer Payouts + leaderboard restart.
   The ADMIN sets a timer once (gd:paytimer); a Vercel cron calls
   ?garudatick=1 every 15 minutes (CRON_SECRET-gated, same pattern as
   kickback-cron) and, when a payout comes due, builds the winner list
   as a READY run (gd:payrun:<periodKey>, created with SET NX — one
   run per period, never two). NOTHING is sent by the server: the
   admin presses RELEASE in the panel and the PAGE signs each send
   from his own wallet (default: the signed-in admin wallet), then
   records each confirmed send back here (recordRunPayout), which
   writes the normal gd:payouts record (HSETNX by tx hash — same
   duplicate protection) and marks the run row sent in the same call.
   Fully automatic server sending is deliberately NOT built: no
   machine holds a payout key (Tom's standing rule).
   Tokens: GRDX (CW20 — contract address below) or LUNC (native
   uluna). Weekly timers pay the This Week board (gd:week:<key>);
   daily timers pay the All-Time board (gd:all) — spec §1 default.
   RESTART LEADERBOARD archives the chosen board to a timestamped
   gd:archive:* key before clearing it; payout records (gd:payouts),
   the winner maps (gd:names / gd:wallets / gd:dates) and any waiting
   payout run are NEVER touched by a restart. */
/* GRDX = "GARUDAX TOKEN" — verified on-chain via token_info Nov 8
   (the terra16hzl7… address is GDEX / "Garuda DEX" — a different
   token; do not use it for GRDX payouts). */
const GD_GRDX_CONTRACT = 'terra12f3f5fzfzxckc0qlv3rmwwkjfhzevpwmx77345n0zuu2678vxf0sm6vvcw';
const GD_PAY_TOKENS = {
  GRDX: { contract: GD_GRDX_CONTRACT, decimals: 6 },
  LUNC: { denom: 'uluna', decimals: 6 },
};
const GD_RUN_TTL_DAYS = 7;               /* a READY run waits 7 days, then expires */
function gdParseJson(s) { try { return s ? JSON.parse(s) : null; } catch (e) { return null; } }
/* Next due instant (ms epoch) STRICTLY AFTER `fromMs`, for a wall
   time "HH:MM" on weekdayIdx (0=Mon..6=Sun, weekly only) in IANA tz.
   Converges via Intl offset round-trips; falls back to UTC math if
   the tz name is somehow invalid. Step 1: get the wall-clock parts
   of `fromMs` in tz; step 2: shift the wall date forward to the
   target day; step 3: convert that wall time back to an instant by
   guessing UTC and correcting with the tz offset (two passes). */
function gdTzOffsetMs(tz, utcMs) {
  try {
    const parts = new Intl.DateTimeFormat('en-US', {
      timeZone: tz, hourCycle: 'h23',
      year: 'numeric', month: '2-digit', day: '2-digit',
      hour: '2-digit', minute: '2-digit', second: '2-digit',
    }).formatToParts(new Date(utcMs));
    const p = {};
    for (const x of parts) p[x.type] = +x.value;
    return Date.UTC(p.year, p.month - 1, p.day, p.hour % 24, p.minute, p.second) - Math.floor(utcMs / 1000) * 1000;
  } catch (e) { return 0; }
}
function gdWallParts(tz, utcMs) {
  try {
    const parts = new Intl.DateTimeFormat('en-US', {
      timeZone: tz, weekday: 'short',
      year: 'numeric', month: '2-digit', day: '2-digit',
    }).formatToParts(new Date(utcMs));
    const p = {};
    for (const x of parts) p[x.type] = x.value;
    const wd = { Mon: 0, Tue: 1, Wed: 2, Thu: 3, Fri: 4, Sat: 5, Sun: 6 }[p.weekday];
    return { y: +p.year, m: +p.month, d: +p.day, wd: wd === undefined ? 0 : wd };
  } catch (e) {
    const d = new Date(utcMs);
    return { y: d.getUTCFullYear(), m: d.getUTCMonth() + 1, d: d.getUTCDate(), wd: (d.getUTCDay() + 6) % 7 };
  }
}
function gdNextDueUtc(every, weekdayIdx, timeLocal, tz, fromMs) {
  const [hh, mm] = String(timeLocal || '09:00').split(':').map((n) => parseInt(n, 10) || 0);
  const w = gdWallParts(tz, fromMs);
  let addDays = 0;
  if (every === 'weekly') {
    addDays = (((weekdayIdx - w.wd) % 7) + 7) % 7;
  }
  for (let tries = 0; tries < 8; tries++) {
    const dayMs = Date.UTC(w.y, w.m - 1, w.d + addDays);
    const dd = new Date(dayMs);
    let guess = Date.UTC(dd.getUTCFullYear(), dd.getUTCMonth(), dd.getUTCDate(), hh, mm);
    for (let i = 0; i < 3; i++) guess = Date.UTC(dd.getUTCFullYear(), dd.getUTCMonth(), dd.getUTCDate(), hh, mm) - gdTzOffsetMs(tz, guess);
    if (guess > fromMs) return guess;
    addDays += every === 'weekly' ? 7 : 1;
  }
  return fromMs + 24 * 3600 * 1000;
}
/* Build the winner rows for a run from a board key. Shared shape with
   the admin GET's rows: name / wallet|null / score / date. Rows carry
   the configured amount + token; a null wallet is the skip case. */
async function gdBoardRows(boardKey, topN, amount, token) {
  const out = await upstashPipeline([['ZREVRANGE', boardKey, 0, Math.max(topN - 1, 0), 'WITHSCORES']]);
  const top = pairs(out[0] && out[0].result).slice(0, topN);
  if (!top.length) return [];
  const ids = top.map((p) => p.id);
  const mOut = await upstashPipeline([
    ['HMGET', 'gd:names', ...ids],
    ['HMGET', 'gd:wallets', ...ids],
  ]);
  const pick = (r) => {
    const vals = (r && r.result) || [];
    const o = {};
    ids.forEach((id, i) => { o[id] = vals[i] || null; });
    return o;
  };
  const names = pick(mOut[0]);
  const wallets = pick(mOut[1]);
  return top.map((p) => ({
    name: names[p.id] || 'Player',
    wallet: wallets[p.id] || null,
    amount, token,
    state: wallets[p.id] ? 'waiting' : 'skipped',
    txHash: null,
  }));
}
/* Load the current waiting run (pointer -> record), or null. */
async function gdLoadCurrentRun() {
  const pOut = await upstashPipeline([['GET', 'gd:payrun:current']]);
  const pk = (pOut[0] && pOut[0].result) || null;
  if (!pk) return null;
  const rOut = await upstashPipeline([['GET', 'gd:payrun:' + pk]]);
  const run = gdParseJson(rOut[0] && rOut[0].result);
  if (!run) return null;
  run.periodKey = pk;
  return run;
}
/* Persist a run record + keep the pointer honest: the pointer only
   ever names a run that is ready or paying. */
async function gdSaveRun(run) {
  const cmds = [['SET', 'gd:payrun:' + run.periodKey, JSON.stringify(run)]];
  if (run.status === 'ready' || run.status === 'paying') {
    cmds.push(['SET', 'gd:payrun:current', run.periodKey]);
  } else {
    const pOut = await upstashPipeline([['GET', 'gd:payrun:current']]);
    if (pOut[0] && pOut[0].result === run.periodKey) cmds.push(['DEL', 'gd:payrun:current']);
  }
  await upstashPipeline(cmds);
}
async function gdTimerState() {
  const out = await upstashPipeline([
    ['GET', 'gd:paytimer'],
    ['GET', 'gd:payrun:current'],
  ]);
  const cfg = gdParseJson(out[0] && out[0].result);
  let run = null;
  const pk = (out[1] && out[1].result) || null;
  if (pk) {
    const rOut = await upstashPipeline([['GET', 'gd:payrun:' + pk]]);
    run = gdParseJson(rOut[0] && rOut[0].result);
    if (run) run.periodKey = pk;
  }
  return { payTimer: cfg, payRun: run };
}
/* One timer tick: fail-safe at every step (see header comment).
   Returns a plain result object; the HTTP wrapper adds auth. */
async function gdTickRun(nowMs) {
  const out = await upstashPipeline([['GET', 'gd:paytimer']]);
  const cfg = gdParseJson(out[0] && out[0].result);
  if (!cfg || cfg.on !== true) return { ok: true, did: 'off' };
  const dueMs = Date.parse(cfg.nextDueUtc || '');
  if (!isFinite(dueMs) || dueMs > nowMs) return { ok: true, did: 'not-due' };
  let run = await gdLoadCurrentRun();
  if (run) {
    const createdMs = Date.parse(run.createdAt || '') || dueMs;
    if (nowMs - createdMs > GD_RUN_TTL_DAYS * 24 * 3600 * 1000) {
      run.status = 'expired';
      await gdSaveRun(run);
      cfg.nextDueUtc = new Date(gdNextDueUtc(cfg.every, cfg.weekday, cfg.timeLocal, cfg.tz, nowMs)).toISOString();
      await upstashPipeline([['SET', 'gd:paytimer', JSON.stringify(cfg)]]);
      return { ok: true, did: 'expired-old-run' };
    }
    return { ok: true, did: 'waiting' };
  }
  const periodKey = cfg.every === 'weekly' ? weekKey(new Date(dueMs)) : new Date(dueMs).toISOString().slice(0, 10);
  const boardKey = cfg.every === 'weekly' ? `gd:week:${weekKey(new Date(dueMs))}` : 'gd:all';
  const rows = await gdBoardRows(boardKey, cfg.topN, cfg.amount, cfg.token);
  cfg.nextDueUtc = new Date(gdNextDueUtc(cfg.every, cfg.weekday, cfg.timeLocal, cfg.tz, nowMs)).toISOString();
  if (!rows.length) {
    await upstashPipeline([['SET', 'gd:paytimer', JSON.stringify(cfg)]]);
    return { ok: true, did: 'empty-board', periodKey };
  }
  const newRun = {
    status: 'ready', every: cfg.every, periodKey,
    dueUtc: new Date(dueMs).toISOString(), createdAt: new Date(nowMs).toISOString(),
    rows, releasedBy: null, releasedAt: null,
  };
  const setOut = await upstashPipeline([
    ['SET', 'gd:payrun:' + periodKey, JSON.stringify(newRun), 'NX'],
    ['SET', 'gd:paytimer', JSON.stringify(cfg)],
  ]);
  if (!setOut[0] || setOut[0].result !== 'OK') return { ok: true, did: 'already-exists', periodKey };
  await upstashPipeline([['SET', 'gd:payrun:current', periodKey]]);
  return { ok: true, did: 'built', periodKey, rows: rows.length };
}
/* The cron entry point: Vercel Cron sends Authorization: Bearer
   <CRON_SECRET> automatically (same pattern as kickback-cron.js). */
async function garudaTickHandler(req, res) {
  const secret = process.env.CRON_SECRET || '';
  const auth = (req.headers && req.headers.authorization) || '';
  const got = auth.startsWith('Bearer ') ? auth.slice(7) : '';
  let ok = false;
  if (secret && got) {
    const a = Buffer.from(got);
    const b = Buffer.from(secret);
    ok = a.length === b.length && crypto.timingSafeEqual(a, b);
  }
  if (!ok) return res.status(401).json({ ok: false, error: 'unauthorized' });
  if (!process.env.NEONRUSH_UPSTASH_URL || !process.env.NEONRUSH_UPSTASH_TOKEN) {
    return res.status(503).json({ error: 'store not configured' });
  }
  try {
    const r = await gdTickRun(Date.now());
    res.setHeader('Cache-Control', 'no-store');
    return res.status(200).json(r);
  } catch (e) {
    console.error('garuda tick failed', e && e.message);
    return res.status(502).json({ error: 'tick failed' });
  }
}
/* The v4 admin actions, behind the same gate as everything else in
   garudaAdminHandler (dispatched from its POST branch). */
async function gdAdminTimerAction(req, res, body, actor) {
  /* `who` stamped on timer/run records: the caller's session wallet
     when known (v5 passes it), else the env admin wallet as before. */
  const who = actor || (process.env.GARUDA_ADMIN_WALLET || '') || 'key-admin';
  if (body.action === 'setPayTimer') {
    const every = body.every === 'daily' ? 'daily' : 'weekly';
    const weekday = Math.max(0, Math.min(6, parseInt(body.weekday, 10) || 0));
    const timeLocal = /^\d{2}:\d{2}$/.test(String(body.timeLocal || '')) ? String(body.timeLocal) : '09:00';
    const tz = String(body.tz || 'UTC').slice(0, 64) || 'UTC';
    const amount = String(body.amount || '').trim().slice(0, 24);
    const token = String(body.token || '').toUpperCase();
    const topN = Math.max(1, Math.min(50, parseInt(body.topN, 10) || 0));
    if (!/^[0-9]+(\.[0-9]+)?$/.test(amount) || !(+amount > 0)) {
      return res.status(400).json({ ok: false, error: 'bad amount' });
    }
    if (!GD_PAY_TOKENS[token]) return res.status(400).json({ ok: false, error: 'bad token' });
    if (!topN) return res.status(400).json({ ok: false, error: 'bad player count' });
    const cfg = {
      on: true, every, weekday, timeLocal, tz, amount, token, topN,
      nextDueUtc: new Date(gdNextDueUtc(every, weekday, timeLocal, tz, Date.now())).toISOString(),
      updatedBy: who, updatedAt: new Date().toISOString(),
    };
    await upstashPipeline([['SET', 'gd:paytimer', JSON.stringify(cfg)]]);
    const st = await gdTimerState();
    return res.status(200).json({ ok: true, payTimer: st.payTimer, payRun: st.payRun });
  }
  if (body.action === 'stopPayTimer') {
    const out = await upstashPipeline([['GET', 'gd:paytimer']]);
    const cfg = gdParseJson(out[0] && out[0].result) || {};
    cfg.on = false;
    cfg.updatedBy = who;
    cfg.updatedAt = new Date().toISOString();
    await upstashPipeline([['SET', 'gd:paytimer', JSON.stringify(cfg)]]);
    const run = await gdLoadCurrentRun();
    if (run && run.status === 'ready') {
      run.status = 'cancelled';
      await gdSaveRun(run);
    }
    const st = await gdTimerState();
    return res.status(200).json({ ok: true, payTimer: st.payTimer, payRun: st.payRun });
  }
  if (body.action === 'cancelPayRun') {
    const run = await gdLoadCurrentRun();
    if (!run) return res.status(404).json({ ok: false, error: 'no payout waiting' });
    if (run.status !== 'ready') {
      return res.status(409).json({ ok: false, error: 'this payout is already being paid — it cannot be cancelled now' });
    }
    run.status = 'cancelled';
    await gdSaveRun(run);
    const st = await gdTimerState();
    return res.status(200).json({ ok: true, payTimer: st.payTimer, payRun: st.payRun });
  }
  if (body.action === 'recordRunPayout') {
    const periodKey = String(body.periodKey || '');
    const rowWallet = String(body.wallet || '');
    const name = String(body.name || '').trim().replace(/[<>/\\]/g, '').slice(0, 40);
    const amount = String(body.amount || '').trim().slice(0, 24);
    const token = String(body.token || '').trim().replace(/[<>/\\]/g, '').slice(0, 12);
    const txHash = String(body.txHash || '').trim().toUpperCase();
    if (!periodKey) return res.status(400).json({ ok: false, error: 'bad payout run' });
    if (name.length < 1) return res.status(400).json({ ok: false, error: 'bad name' });
    if (!GD_ADDR_RE.test(rowWallet)) return res.status(400).json({ ok: false, error: 'bad wallet' });
    if (!/^[0-9]+(\.[0-9]+)?$/.test(amount)) return res.status(400).json({ ok: false, error: 'bad amount' });
    if (token.length < 1) return res.status(400).json({ ok: false, error: 'bad token' });
    if (!GD_TXHASH_RE.test(txHash)) return res.status(400).json({ ok: false, error: 'bad tx hash' });
    const rOut = await upstashPipeline([['GET', 'gd:payrun:' + periodKey]]);
    const run = gdParseJson(rOut[0] && rOut[0].result);
    if (!run) return res.status(404).json({ ok: false, error: 'payout run not found' });
    run.periodKey = periodKey;
    const row = (run.rows || []).find((r) => r.wallet === rowWallet);
    if (!row) return res.status(400).json({ ok: false, error: 'winner not in this payout' });
    if (row.state === 'sent') {
      /* Already recorded — idempotent: never a double record. */
      return res.status(200).json({ ok: true, alreadyRecorded: true, payRun: run });
    }
    if (row.state !== 'waiting') return res.status(409).json({ ok: false, error: 'this winner cannot be paid from this list' });
    if (String(row.amount) !== amount || String(row.token) !== token) {
      return res.status(400).json({ ok: false, error: 'amount or token does not match the payout list' });
    }
    const rec = JSON.stringify({
      name, wallet: rowWallet, amount, token, txHash,
      note: 'Timer payout ' + periodKey,
      date: new Date().toISOString().slice(0, 10),
    });
    const hOut = await upstashPipeline([['HSETNX', 'gd:payouts', txHash, rec]]);
    if (!hOut[0] || hOut[0].result !== 1) {
      return res.status(409).json({ ok: false, error: 'payout already recorded' });
    }
    row.state = 'sent';
    row.txHash = txHash;
    if (!run.releasedBy) { run.releasedBy = who; run.releasedAt = new Date().toISOString(); }
    const payable = (run.rows || []).filter((r) => r.state !== 'skipped');
    run.status = payable.every((r) => r.state === 'sent') ? 'paid' : 'paying';
    await gdSaveRun(run);
    return res.status(200).json({ ok: true, payRun: run });
  }
  if (body.action === 'restartLeaderboard') {
    const board = body.board === 'all' ? 'all' : 'week';
    const wk = weekKey();
    const boardKey = board === 'all' ? 'gd:all' : `gd:week:${wk}`;
    const stamp = new Date().toISOString().replace(/[:.]/g, '-');
    const archiveKey = board === 'all'
      ? `gd:archive:all:${stamp}`
      : `gd:archive:week:${wk}:${stamp}`;
    const zOut = await upstashPipeline([['ZREVRANGE', boardKey, 0, -1, 'WITHSCORES']]);
    const flat = (zOut[0] && zOut[0].result) || [];
    const rows = pairs(flat);
    const ids = rows.map((r) => r.id);
    let names = {};
    if (ids.length) {
      const nOut = await upstashPipeline([['HMGET', 'gd:names', ...ids]]);
      const vals = (nOut[0] && nOut[0].result) || [];
      ids.forEach((id, i) => { names[id] = vals[i] || null; });
    }
    const archive = {
      board, boardKey, archivedAt: new Date().toISOString(), by: who,
      rows: rows.map((r) => ({ id: r.id, name: names[r.id] || 'Player', score: r.score })),
    };
    const cmds = [['SET', archiveKey, JSON.stringify(archive)]];
    if (ids.length) cmds.push(['ZREM', boardKey, ...ids]);
    await upstashPipeline(cmds);
    return res.status(200).json({ ok: true, board, cleared: rows.length, archiveKey });
  }
  return res.status(400).json({ ok: false, error: 'unknown action' });
}
/* garuda-timer:end */

/* garuda-public:start — Garuda Dash PUBLIC payouts & burns data, folded
   into this router for the same 12-function-cap reason. Reached via
   ?garudapublic=1 (the game page calls /api/luna-games?garudapublic=1
   directly — no vercel.json rewrite needed, same as ?tokenslot=1).
   Serves ONLY what the public strip may show: payout display rows
   (name, amount, token, date, tx hash for the finder link — NEVER a
   winner wallet address) and the burn-wallet address (the page reads
   that wallet's GDEX balance live from the LCD itself; no total is
   stored or served here). No key: nothing sensitive is exposed. */
async function garudaPublicHandler(req, res) {
  if (req.method !== 'GET') return res.status(405).json({ error: 'method not allowed' });
  if (!process.env.NEONRUSH_UPSTASH_URL || !process.env.NEONRUSH_UPSTASH_TOKEN) {
    return res.status(503).json({ error: 'store not configured' });
  }
  try {
    const out = await upstashPipeline([
      ['HGETALL', 'gd:payouts'],
      ['GET', 'gd:burnwallet'],
    ]);
    const flat = (out[0] && out[0].result) || [];
    const payouts = [];
    for (let i = 0; i + 1 < flat.length; i += 2) {
      try {
        const rec = JSON.parse(flat[i + 1]);
        if (rec && rec.txHash) {
          payouts.push({
            name: rec.name, amount: rec.amount, token: rec.token,
            date: rec.date, txHash: rec.txHash,
          });
        }
      } catch (e) { /* skip corrupt record */ }
    }
    payouts.sort((a, b) => String(b.date || '').localeCompare(String(a.date || '')));
    res.setHeader('Cache-Control', 's-maxage=30, stale-while-revalidate=60');
    return res.status(200).json({
      payouts: payouts.slice(0, 20),
      burnWallet: (out[1] && out[1].result) || null,
    });
  } catch (e) {
    console.error('garuda public failed', e && e.message);
    return res.status(502).json({ error: 'store unavailable' });
  }
}
/* garuda-public:end */

/* garuda-edit:start — Garuda Dash LEVEL EDITOR data, folded into this
   router for the same 12-function-cap reason as the blocks above.
   Reached via ?garudaedit=1 (the pages call /api/luna-games?garudaedit=1
   directly — no vercel.json rewrite needed, same as ?garudapublic=1).
   Tom's order (Nov 10): the Garuda team gets the FULL edit — a visual
   level editor in their private admin panel. What is stored here is
   level DATA only (platforms / grounds / patrol enemies / boss numbers
   for the tower levels the game builds in buildLegacy) — never code.
   Per level n (1..40), three records in the same Upstash store:
     gd:edit:pub:<n>   the PUBLISHED override the public game loads
     gd:edit:bak:<n>   the previous published record (one-tap rollback;
                       {data:null} means "previous state was default")
     gd:edit:draft:<n> the admin's saved draft (never served publicly)
   READS of published data are public and read-only. EVERY write — and
   every draft read — requires the same admin credential as the payout
   admin: the GARUDA_ADMIN_KEY fallback or a wallet sign-in session
   token (gdAdminSessionOk — v5: the session's wallet must still be
   the owner or in the effective admin set, re-resolved live; see the
   garuda-admin block). Rotating the env wallet therefore locks the
   editor for that wallet too, exactly like the panel. */
const GD_EDIT_MAX_LEVEL = 40;
function gdEditKey(kind, n) { return 'gd:edit:' + kind + ':' + n; }
function gdEditParseLevel(v) {
  const n = Number(v);
  return Number.isInteger(n) && n >= 1 && n <= GD_EDIT_MAX_LEVEL ? n : null;
}
/* Strict shape check + normalisation for one level's editor data.
   Returns a clean copy, or null when anything is off — a bad record
   can never reach the game (which ALSO sanitises before applying). */
function gdEditValidate(d) {
  if (!d || typeof d !== 'object' || Array.isArray(d)) return null;
  const int = (v, lo, hi) => {
    const x = Math.round(Number(v));
    return Number.isFinite(x) && x >= lo && x <= hi ? x : null;
  };
  const triple = (a, xLo, xHi, yLo, yHi, wLo, wHi) => {
    if (!Array.isArray(a) || a.length !== 3) return null;
    const x = int(a[0], xLo, xHi), y = int(a[1], yLo, yHi), w = int(a[2], wLo, wHi);
    return (x === null || y === null || w === null) ? null : [x, y, w];
  };
  if (!Array.isArray(d.grounds) || d.grounds.length < 1 || d.grounds.length > 64) return null;
  const grounds = [];
  for (const g of d.grounds) {
    const t = triple(g, -600, 2600, -2800, 800, 16, 1400);
    if (!t) return null;
    grounds.push(t);
  }
  if (!Array.isArray(d.platforms) || d.platforms.length > 80) return null;
  const platforms = [];
  for (const p of d.platforms) {
    const t = triple(p, -600, 2600, -2800, 800, 16, 600);
    if (!t) return null;
    platforms.push(t);
  }
  if (!Array.isArray(d.walkers) || d.walkers.length > 40) return null;
  const walkers = [];
  for (const w of d.walkers) {
    if (!w || typeof w !== 'object') return null;
    const minX = int(w.minX, -600, 2600), maxX = int(w.maxX, -600, 2600);
    const y = int(w.y, -2800, 800), speed = int(w.speed, 0, 240);
    if (minX === null || maxX === null || y === null || speed === null || maxX <= minX) return null;
    if (w.kind !== 'tiki' && w.kind !== 'brute') return null;
    walkers.push({ minX, maxX, y, speed, kind: w.kind });
  }
  const bossHp = int(d.bossHp, 1, 99);
  const bossSpeed = int(d.bossSpeed, 0, 120);
  if (bossHp === null || bossSpeed === null) return null;
  return { v: 1, grounds, platforms, walkers, bossHp, bossSpeed };
}
async function gdEditAuthorized(req) {
  const auth = (req.headers && req.headers.authorization) || '';
  const got = auth.startsWith('Bearer ') ? auth.slice(7) : '';
  if (!got) return false;
  const want = process.env.GARUDA_ADMIN_KEY || '';
  if (want) {
    const a = Buffer.from(got), b = Buffer.from(want);
    if (a.length === b.length && crypto.timingSafeEqual(a, b)) return true;
  }
  return gdAdminSessionOk(got);
}
async function gdEditGet(kind, n) {
  const out = await upstashPipeline([['GET', gdEditKey(kind, n)]]);
  const raw = (out && out[0] && out[0].result) || null;
  if (!raw) return null;
  try {
    const rec = JSON.parse(raw);
    if (!rec || typeof rec !== 'object') return null;
    if (rec.data === null) return { data: null, at: rec.at || null };
    const data = gdEditValidate(rec.data);
    return data ? { data, at: rec.at || null } : null;
  } catch (e) { return null; }
}
async function garudaEditHandler(req, res) {
  if (req.method !== 'GET' && req.method !== 'POST') return res.status(405).json({ error: 'method not allowed' });
  if (!process.env.NEONRUSH_UPSTASH_URL || !process.env.NEONRUSH_UPSTASH_TOKEN) {
    return res.status(503).json({ error: 'store not configured' });
  }
  res.setHeader('Cache-Control', 'no-store');
  if (req.method === 'GET') {
    const lvl = gdEditParseLevel(req.query && req.query.level);
    /* Admin state (published + draft + backup flag): gated. */
    if (req.query && req.query.admin !== undefined) {
      if (!(await gdEditAuthorized(req))) return res.status(401).json({ ok: false, error: 'unauthorized' });
      if (!lvl) return res.status(400).json({ ok: false, error: 'bad level' });
      try {
        const [pub, draft, bak] = await Promise.all([
          gdEditGet('pub', lvl), gdEditGet('draft', lvl), gdEditGet('bak', lvl),
        ]);
        return res.status(200).json({
          ok: true, level: lvl,
          published: pub ? pub.data : null, publishedAt: pub ? pub.at : null,
          draft: draft ? draft.data : null, draftAt: draft ? draft.at : null,
          hasBackup: !!bak,
        });
      } catch (e) {
        console.error('garuda edit admin read failed', e && e.message);
        return res.status(502).json({ error: 'store unavailable' });
      }
    }
    try {
      if (lvl) {
        const pub = await gdEditGet('pub', lvl);
        return res.status(200).json({ ok: true, level: lvl, published: pub ? pub.data : null });
      }
      /* No level: the whole published map in one pipeline (game load). */
      const cmds = [];
      for (let n = 1; n <= GD_EDIT_MAX_LEVEL; n++) cmds.push(['GET', gdEditKey('pub', n)]);
      const out = await upstashPipeline(cmds);
      const published = {};
      for (let n = 1; n <= GD_EDIT_MAX_LEVEL; n++) {
        const raw = (out && out[n - 1] && out[n - 1].result) || null;
        if (!raw) continue;
        try {
          const rec = JSON.parse(raw);
          const data = rec && gdEditValidate(rec.data);
          if (data) published[n] = data;
        } catch (e) { /* skip corrupt record — the game uses its default */ }
      }
      return res.status(200).json({ ok: true, published });
    } catch (e) {
      console.error('garuda edit public read failed', e && e.message);
      return res.status(502).json({ error: 'store unavailable' });
    }
  }
  /* POST: every action is an admin write — session/key gate first. */
  let body = req.body;
  if (typeof body === 'string') { try { body = JSON.parse(body); } catch { body = {}; } }
  body = body || {};
  if (!(await gdEditAuthorized(req))) return res.status(401).json({ ok: false, error: 'unauthorized' });
  const lvl = gdEditParseLevel(body.level);
  if (!lvl) return res.status(400).json({ ok: false, error: 'bad level' });
  const now = new Date().toISOString();
  try {
    if (body.action === 'saveDraft') {
      const data = gdEditValidate(body.data);
      if (!data) return res.status(400).json({ ok: false, error: 'bad level data' });
      await upstashPipeline([['SET', gdEditKey('draft', lvl), JSON.stringify({ data, at: now })]]);
      return res.status(200).json({ ok: true, level: lvl, draftAt: now });
    }
    if (body.action === 'publish') {
      const draft = await gdEditGet('draft', lvl);
      if (!draft || !draft.data) return res.status(400).json({ ok: false, error: 'no draft to publish' });
      const cur = await gdEditGet('pub', lvl);
      await upstashPipeline([
        ['SET', gdEditKey('bak', lvl), JSON.stringify({ data: cur ? cur.data : null, at: now })],
        ['SET', gdEditKey('pub', lvl), JSON.stringify({ data: draft.data, at: now })],
        ['DEL', gdEditKey('draft', lvl)],
      ]);
      return res.status(200).json({ ok: true, level: lvl, publishedAt: now });
    }
    if (body.action === 'rollback') {
      const bak = await gdEditGet('bak', lvl);
      if (!bak) return res.status(400).json({ ok: false, error: 'no backup to roll back to' });
      const cmds = [['DEL', gdEditKey('bak', lvl)], ['DEL', gdEditKey('draft', lvl)]];
      if (bak.data) cmds.push(['SET', gdEditKey('pub', lvl), JSON.stringify({ data: bak.data, at: now })]);
      else cmds.push(['DEL', gdEditKey('pub', lvl)]);
      await upstashPipeline(cmds);
      return res.status(200).json({ ok: true, level: lvl, restoredDefault: !bak.data });
    }
    if (body.action === 'reset') {
      const cur = await gdEditGet('pub', lvl);
      await upstashPipeline([
        ['SET', gdEditKey('bak', lvl), JSON.stringify({ data: cur ? cur.data : null, at: now })],
        ['DEL', gdEditKey('pub', lvl)],
        ['DEL', gdEditKey('draft', lvl)],
      ]);
      return res.status(200).json({ ok: true, level: lvl });
    }
    if (body.action === 'discardDraft') {
      await upstashPipeline([['DEL', gdEditKey('draft', lvl)]]);
      return res.status(200).json({ ok: true, level: lvl });
    }
    return res.status(400).json({ ok: false, error: 'unknown action' });
  } catch (e) {
    console.error('garuda edit write failed', e && e.message);
    return res.status(502).json({ error: 'store unavailable' });
  }
}
/* garuda-edit:end */

/* fx-signal:start — Forex Signal Bot candle relay, folded into this
   router for the same 12-function-cap reason as the relays above.
   Reached via ?fxpair=EURGBP (the bot page calls
   /api/luna-games?fxpair=<PAIR> directly — no vercel.json rewrite
   needed, same as ?tokenslot=1). Why: the bot page
   (client/public/fx-signal-7k9x/) needs 1-minute Forex candles from
   Yahoo Finance, which sends no CORS header; the free CORS proxies
   the page first shipped with failed live (2026-11-08: allOrigins
   "Failed to fetch", every pair stuck UNAVAILABLE, no prices at
   all). This relay fetches Yahoo SERVER-side (no CORS problem) and
   returns trimmed candles only — timestamps plus OHLC, null closes
   dropped, exactly the shape the page's engine consumes.
   Allowlist: the 14 pairs the bot scans — anything else is a 400,
   so the relay can never be used as an open Yahoo proxy. It holds
   no keys, signs nothing, stores nothing, and never logs the
   request. KES/USD passes the allowlist on purpose: its Yahoo feed
   carries only ~20 usable candles/day, and the PAGE's own
   MIN_CANDLES rule marks it unavailable — the relay serves the real
   thin data rather than hiding it. */
const FX_PAIRS = { EURGBP: 1, EURUSD: 1, GBPUSD: 1, USDJPY: 1, AUDCAD: 1, AUDCHF: 1, AUDUSD: 1, CADCHF: 1, CADJPY: 1, CHFJPY: 1, EURTRY: 1, GBPJPY: 1, NZDJPY: 1, KESUSD: 1 };
const FX_UPSTREAM = 'https://query1.finance.yahoo.com/v8/finance/chart/';

export async function fxPairHandler(req, res) {
  if (req.method !== 'GET') return res.status(405).json({ error: 'method not allowed' });
  const pair = String((req.query && req.query.fxpair) || '').toUpperCase();
  if (!FX_PAIRS[pair]) return res.status(400).json({ error: 'pair not allowed' });
  const url = FX_UPSTREAM + encodeURIComponent(pair + '=X') + '?interval=1m&range=1d';
  try {
    const ctl = new AbortController();
    const t = setTimeout(() => ctl.abort(), 12000);
    const r = await fetch(url, {
      headers: { 'user-agent': 'Mozilla/5.0 (compatible; fx-signal-relay)' },
      signal: ctl.signal,
    });
    clearTimeout(t);
    if (!r.ok) return res.status(502).json({ error: 'price source unavailable (HTTP ' + r.status + ')' });
    const data = await r.json();
    const result = data && data.chart && Array.isArray(data.chart.result) ? data.chart.result[0] : null;
    const q = result && result.indicators && Array.isArray(result.indicators.quote) ? result.indicators.quote[0] : null;
    if (!result || !Array.isArray(result.timestamp) || !q || !Array.isArray(q.close)) {
      return res.status(502).json({ error: 'price source returned no candle data' });
    }
    const candles = [];
    for (let i = 0; i < result.timestamp.length; i++) {
      const c = q.close[i];
      if (c === null || c === undefined) continue;
      candles.push({
        t: result.timestamp[i],
        o: (q.open && q.open[i] != null) ? q.open[i] : c,
        h: (q.high && q.high[i] != null) ? q.high[i] : c,
        l: (q.low && q.low[i] != null) ? q.low[i] : c,
        c,
      });
    }
    if (!candles.length) return res.status(502).json({ error: 'price source returned no candles' });
    res.setHeader('Cache-Control', 's-maxage=30, stale-while-revalidate=30');
    return res.status(200).json({
      ok: true,
      pair,
      symbol: pair + '=X',
      source: 'Yahoo Finance (site server)',
      fetchedAt: Date.now(),
      regularMarketTime: (result.meta && result.meta.regularMarketTime) || null,
      candles,
    });
  } catch (e) {
    console.error('fx relay failed', pair, e && e.message);
    return res.status(502).json({ error: 'price source unavailable' });
  }
}
/* fx-signal:end */

/* token-slot:start — Pinball Token Slot burn records, folded into this
   router for the same 12-function-cap reason as the Scope counter and
   the RPC relays above. Reached via ?tokenslot=1 (the page calls
   /api/luna-games?tokenslot=1 directly, same-origin — no vercel.json
   rewrite is needed because dispatch here is by query param).
   What this stores: VERIFIED burn payments for the Pinball Token Slot
   (client/public/pinball-token-edition/). A record is written ONLY
   after this handler independently re-verifies the transaction on the
   public Terra Classic LCD — it never trusts the page's word:
     1. tx fetched by hash from the LCD, and tx.code === 0 checked
        FIRST (a failed tx returns events that look like success);
     2. a bank "transfer" event with recipient == the LUNC burn
        address and sender == the claimed wallet;
     3. amount == exactly 100 tokens of the claimed denom
        (100000000 uluna or 100000000 uusd);
     4. the tx memo == a session code this handler issued for that
        wallet+denom within the last 30 minutes (one-time codes, kept
        in tokenslot:session:<code>);
     5. the hash is not already in the used-hash register
        (tokenslot:used) — one hash = one credit, ever.
   Keys (NEONRUSH_* Upstash store, shared pipeline helper above):
     tokenslot:session:<code>  -> JSON {wallet, denom, exp} (30 min)
     tokenslot:used            -> hash field: tx hash -> 1
     tokenslot:burns           -> hash field: tx hash -> JSON record
     tokenslot:total:uluna     -> integer micro-units burned (INCRBY)
     tokenslot:total:uusd      -> integer micro-units burned (INCRBY)
   GET returns the two totals plus the newest burn records (hash,
   wallet, denom, amount, time — every entry carries its own finder
   proof link inputs). The page's burn counter renders ONLY these
   server-verified numbers; nothing unverified is ever displayed.
   POST actions: "session" issues a one-time memo code; "verify"
   submits {hash, wallet, denom} for independent verification.
   This handler holds no keys, signs nothing, and moves no funds —
   it only reads the chain and records what the chain proves. */
const TS_BURN_ADDR = 'terra1sk06e3dyexuq4shw77x3dsv480xv42mq7982q7';
const TS_LCD = 'https://terra-classic-lcd.publicnode.com';
const TS_DENOMS = { uluna: '100000000', uusd: '100000000' };
const TS_MEMO_PREFIX = 'LUNC-DEV-STUDIO-PINBALL-SLOT-';
const TS_SESSION_TTL_SEC = 30 * 60;

function tsNowSec() { return Math.floor(Date.now() / 1000); }

// The full on-chain verification, exported so the QA harness exercises
// the exact code the endpoint runs. Pure with respect to its inputs:
// (txJson from the LCD, {wallet, denom, memo}) -> verdict object.
export function tsVerifyTx(tx, want) {
  if (!tx || typeof tx !== 'object' || !tx.tx_response) {
    return { ok: false, reason: 'tx not found on chain yet' };
  }
  const r = tx.tx_response;
  // code FIRST, always — a failed tx's events look like success.
  if (typeof r.code !== 'number') return { ok: false, reason: 'tx has no code field' };
  if (r.code !== 0) return { ok: false, reason: 'tx failed on chain (code ' + r.code + ')' };
  const body = (tx.tx && tx.tx.body) || {};
  if (body.memo !== want.memo) return { ok: false, reason: 'memo does not match the session code' };
  const msgs = Array.isArray(body.messages) ? body.messages : [];
  const send = msgs.find((m) => m && m['@type'] === '/cosmos.bank.v1beta1.MsgSend');
  if (!send) return { ok: false, reason: 'tx carries no bank send' };
  if (send.from_address !== want.wallet) return { ok: false, reason: 'sender is not the connected wallet' };
  if (send.to_address !== TS_BURN_ADDR) return { ok: false, reason: 'recipient is not the burn address' };
  const amt = (Array.isArray(send.amount) ? send.amount : [])
    .find((a) => a && a.denom === want.denom);
  if (!amt || String(amt.amount) !== TS_DENOMS[want.denom]) {
    return { ok: false, reason: 'amount is not exactly 100 ' + want.denom };
  }
  // The transfer EVENT is the ground truth of what actually moved —
  // check it too, so a crafted message shape can never fake a burn.
  const events = Array.isArray(r.events) ? r.events : [];
  let moved = false;
  for (const ev of events) {
    if (!ev || ev.type !== 'transfer' || !Array.isArray(ev.attributes)) continue;
    const at = {};
    for (const a of ev.attributes) if (a && a.key) at[a.key] = a.value;
    if (at.recipient === TS_BURN_ADDR && at.sender === want.wallet &&
        typeof at.amount === 'string' &&
        at.amount.split(',').some((p) => p === TS_DENOMS[want.denom] + want.denom)) {
      moved = true; break;
    }
  }
  if (!moved) return { ok: false, reason: 'no matching transfer event on chain' };
  return { ok: true, height: r.height || null, timestamp: r.timestamp || null };
}

async function tsFetchTx(hash) {
  const ctl = new AbortController();
  const t = setTimeout(() => ctl.abort(), 9000);
  try {
    const r = await fetch(TS_LCD + '/cosmos/tx/v1beta1/txs/' + encodeURIComponent(hash), { signal: ctl.signal });
    if (r.status === 404) return null;
    if (!r.ok) throw new Error('LCD ' + r.status);
    return await r.json();
  } finally { clearTimeout(t); }
}

export async function tokenSlotHandler(req, res) {
  if (req.method !== 'GET' && req.method !== 'POST') {
    return res.status(405).json({ ok: false, error: 'method not allowed' });
  }
  if (!process.env.NEONRUSH_UPSTASH_URL || !process.env.NEONRUSH_UPSTASH_TOKEN) {
    return res.status(500).json({ ok: false, error: 'storage not configured' });
  }
  res.setHeader('Cache-Control', 'no-store');

  if (req.method === 'GET') {
    try {
      const out = await upstashPipeline([
        ['GET', 'tokenslot:total:uluna'],
        ['GET', 'tokenslot:total:uusd'],
        ['HGETALL', 'tokenslot:burns'],
      ]);
      const micro = (v) => { const n = parseInt(v, 10); return Number.isNaN(n) ? 0 : n; };
      const flat = (out[2] && out[2].result) || [];
      const burns = [];
      for (let i = 0; i + 1 < flat.length; i += 2) {
        try { const rec = JSON.parse(flat[i + 1]); if (rec && rec.hash) burns.push(rec); } catch (e) { /* skip corrupt */ }
      }
      burns.sort((a, b) => (b.ts || 0) - (a.ts || 0));
      return res.status(200).json({
        ok: true,
        totals: { uluna: micro(out[0] && out[0].result), uusd: micro(out[1] && out[1].result) },
        burns: burns.slice(0, 20),
      });
    } catch (e) {
      console.error('token-slot totals read failed', e && e.message);
      return res.status(500).json({ ok: false, error: 'counter unavailable' });
    }
  }

  // POST
  let body = req.body;
  if (typeof body === 'string') { try { body = JSON.parse(body); } catch (e) { body = null; } }
  if (!body || typeof body !== 'object') return res.status(400).json({ ok: false, error: 'bad request' });
  const action = String(body.action || '');

  if (action === 'session') {
    const wallet = String(body.wallet || '');
    const denom = String(body.denom || '');
    if (!/^terra1[a-z0-9]{38}$/.test(wallet)) return res.status(400).json({ ok: false, error: 'bad wallet' });
    if (!TS_DENOMS[denom]) return res.status(400).json({ ok: false, error: 'bad denom' });
    const code = TS_MEMO_PREFIX + crypto.randomBytes(9).toString('hex').toUpperCase();
    const rec = JSON.stringify({ wallet, denom, exp: tsNowSec() + TS_SESSION_TTL_SEC });
    try {
      await upstashPipeline([['SET', 'tokenslot:session:' + code, rec, 'EX', TS_SESSION_TTL_SEC]]);
    } catch (e) {
      console.error('token-slot session write failed', e && e.message);
      return res.status(500).json({ ok: false, error: 'session unavailable' });
    }
    return res.status(200).json({ ok: true, memo: code });
  }

  if (action === 'verify') {
    const hash = String(body.hash || '').toUpperCase();
    const wallet = String(body.wallet || '');
    const denom = String(body.denom || '');
    if (!/^[0-9A-F]{64}$/.test(hash)) return res.status(400).json({ ok: false, error: 'bad hash' });
    if (!/^terra1[a-z0-9]{38}$/.test(wallet)) return res.status(400).json({ ok: false, error: 'bad wallet' });
    if (!TS_DENOMS[denom]) return res.status(400).json({ ok: false, error: 'bad denom' });
    let tx = null;
    try { tx = await tsFetchTx(hash); } catch (e) { /* treated as not-yet below */ }
    if (!tx) return res.status(200).json({ ok: false, pending: true, error: 'tx not on chain yet — still confirming' });
    const memo = (((tx.tx || {}).body || {}).memo) || '';
    // The memo binds this hash to a session THIS handler issued for
    // this wallet+denom. Unknown/expired/replayed codes never credit.
    let sess = null;
    try {
      const sOut = await upstashPipeline([['GET', 'tokenslot:session:' + memo]]);
      if (sOut[0] && sOut[0].result) sess = JSON.parse(sOut[0].result);
    } catch (e) { /* sess stays null */ }
    if (!sess || sess.wallet !== wallet || sess.denom !== denom || !memo.startsWith(TS_MEMO_PREFIX)) {
      return res.status(200).json({ ok: false, error: 'session code not recognised for this payment' });
    }
    const verdict = tsVerifyTx(tx, { wallet, denom, memo });
    if (!verdict.ok) return res.status(200).json({ ok: false, error: verdict.reason });
    const record = JSON.stringify({
      hash, wallet, denom, amount: TS_DENOMS[denom], ts: tsNowSec(),
      height: verdict.height, chainTime: verdict.timestamp,
    });
    try {
      const claim = await upstashPipeline([['HSETNX', 'tokenslot:used', hash, '1']]);
      if (!claim[0] || claim[0].result !== 1) {
        return res.status(200).json({ ok: false, error: 'this payment was already credited' });
      }
      await upstashPipeline([
        ['HSET', 'tokenslot:burns', hash, record],
        ['INCRBY', 'tokenslot:total:' + denom, TS_DENOMS[denom]],
        ['DEL', 'tokenslot:session:' + memo],
      ]);
    } catch (e) {
      console.error('token-slot record write failed', e && e.message);
      return res.status(500).json({ ok: false, error: 'could not record the burn — your burn is on chain; contact the Studio with your tx hash' });
    }
    return res.status(200).json({ ok: true, hash });
  }

  return res.status(400).json({ ok: false, error: 'unknown action' });
}
/* token-slot:end */

/* kava-code:start — KAVA ADMIN PANEL access code, server-side hash.
   The panel (client/public/kava-books-k7x9/) used to carry its access
   code's SHA-256 baked into the page, so changing the code meant a
   redeploy and the code passing through whoever edited the file. Now
   the code's hash lives HERE, in Upstash key kbk:codehash, and the
   owner changes it from inside the unlocked panel — the code itself
   never leaves his browser; only SHA-256 hashes (of the code, trimmed
   + upper-cased — the normalisation the page has always used) travel.
   Reached via /api/luna-games?kavacode=1 directly (no vercel.json
   rewrite needed, same as ?garudasettings=). The stored hash is
   NEVER returned: GET answers only {set: bool} and POST
   kavaCodeCheck only {ok: bool}.
   Bootstrap: while kbk:codehash is unset, KBK_BOOTSTRAP_HASH below —
   the hash that shipped baked into the page — is the valid code, so
   the panel keeps working until the owner's first in-panel change.
   After that first set the stored hash alone rules and the bootstrap
   stops working.
   Brute-force rail: failed code attempts are counted per client IP
   (the IP is itself hashed into the counter key name, so no raw IPs
   are stored); 8 failures inside a 15-minute window lock that IP out
   of BOTH actions for 15 minutes, and any success clears its
   counter. It holds no keys, signs nothing, moves no funds. */
const KBK_CODE_KEY = 'kbk:codehash';
const KBK_BOOTSTRAP_HASH = 'bf8015e0382709b50393a46ad4b6feb150b192bdb26684f7f42a8edc015035a5';
const KBK_MAX_FAILS = 8;
const KBK_FAIL_WINDOW_SEC = 15 * 60;
const KBK_LOCKOUT_SEC = 15 * 60;

function kbkIsHash(v) { return typeof v === 'string' && /^[0-9a-f]{64}$/.test(v); }

function kbkHashEq(a, b) {
  const ba = Buffer.from(String(a)), bb = Buffer.from(String(b));
  return ba.length === bb.length && crypto.timingSafeEqual(ba, bb);
}

function kbkIpTag(req) {
  const xff = String((req.headers && req.headers['x-forwarded-for']) || '');
  const ip = xff.split(',')[0].trim() || (req.socket && req.socket.remoteAddress) || 'unknown';
  return crypto.createHash('sha256').update(ip).digest('hex').slice(0, 16);
}

async function kbkEffectiveHash() {
  const out = await upstashPipeline([['GET', KBK_CODE_KEY]]);
  const v = out[0] && out[0].result;
  return kbkIsHash(v) ? v : KBK_BOOTSTRAP_HASH;
}

async function kbkLockState(tag) {
  const out = await upstashPipeline([['GET', 'kbk:lock:' + tag], ['TTL', 'kbk:lock:' + tag]]);
  const locked = !!(out[0] && out[0].result);
  const ttl = out[1] && typeof out[1].result === 'number' && out[1].result > 0 ? out[1].result : KBK_LOCKOUT_SEC;
  return { locked, retryAfterSec: locked ? ttl : 0 };
}

/* Record one failed attempt; returns true when this failure tripped
   the lockout. */
async function kbkRecordFail(tag) {
  const out = await upstashPipeline([['INCR', 'kbk:fail:' + tag]]);
  const n = (out[0] && out[0].result) || 0;
  if (n === 1) {
    try { await upstashPipeline([['EXPIRE', 'kbk:fail:' + tag, KBK_FAIL_WINDOW_SEC]]); } catch (e) { /* window is best-effort */ }
  }
  if (n >= KBK_MAX_FAILS) {
    await upstashPipeline([['SET', 'kbk:lock:' + tag, '1', 'EX', KBK_LOCKOUT_SEC], ['DEL', 'kbk:fail:' + tag]]);
    return true;
  }
  return false;
}

async function kbkClearFails(tag) {
  try { await upstashPipeline([['DEL', 'kbk:fail:' + tag]]); } catch (e) { /* best-effort */ }
}

export async function kavaCodeHandler(req, res) {
  if (req.method !== 'GET' && req.method !== 'POST') {
    return res.status(405).json({ ok: false, error: 'method not allowed' });
  }
  if (!process.env.NEONRUSH_UPSTASH_URL || !process.env.NEONRUSH_UPSTASH_TOKEN) {
    return res.status(500).json({ ok: false, unavailable: true, error: 'storage not configured' });
  }
  res.setHeader('Cache-Control', 'no-store');

  if (req.method === 'GET') {
    try {
      const out = await upstashPipeline([['GET', KBK_CODE_KEY]]);
      return res.status(200).json({ ok: true, set: kbkIsHash(out[0] && out[0].result) });
    } catch (e) {
      console.error('kava code state read failed', e && e.message);
      return res.status(500).json({ ok: false, unavailable: true, error: 'code service unavailable' });
    }
  }

  // POST
  let body = req.body;
  if (typeof body === 'string') { try { body = JSON.parse(body); } catch (e) { body = null; } }
  if (!body || typeof body !== 'object') return res.status(400).json({ ok: false, error: 'bad request' });
  const action = String(body.action || '');
  const tag = kbkIpTag(req);

  if (action === 'kavaCodeCheck') {
    const hash = String(body.hash || '').toLowerCase();
    if (!kbkIsHash(hash)) return res.status(400).json({ ok: false, error: 'bad hash' });
    try {
      const lock = await kbkLockState(tag);
      if (lock.locked) return res.status(200).json({ ok: false, locked: true, retryAfterSec: lock.retryAfterSec, error: 'too many tries — locked for a bit' });
      const effective = await kbkEffectiveHash();
      if (kbkHashEq(hash, effective)) {
        await kbkClearFails(tag);
        return res.status(200).json({ ok: true });
      }
      const tripped = await kbkRecordFail(tag);
      return res.status(200).json({ ok: false, locked: tripped, error: 'code not right' });
    } catch (e) {
      console.error('kava code check failed', e && e.message);
      return res.status(500).json({ ok: false, unavailable: true, error: 'code service unavailable' });
    }
  }

  if (action === 'kavaCodeSet') {
    const currentHash = String(body.currentHash || '').toLowerCase();
    const newHash = String(body.newHash || '').toLowerCase();
    if (!kbkIsHash(currentHash) || !kbkIsHash(newHash)) {
      return res.status(400).json({ ok: false, error: 'bad hash' });
    }
    try {
      const lock = await kbkLockState(tag);
      if (lock.locked) return res.status(200).json({ ok: false, locked: true, retryAfterSec: lock.retryAfterSec, error: 'too many tries — locked for a bit' });
      const effective = await kbkEffectiveHash();
      if (!kbkHashEq(currentHash, effective)) {
        const tripped = await kbkRecordFail(tag);
        return res.status(200).json({ ok: false, locked: tripped, error: 'current code is not right' });
      }
      await upstashPipeline([['SET', KBK_CODE_KEY, newHash]]);
      await kbkClearFails(tag);
      return res.status(200).json({ ok: true, set: true });
    } catch (e) {
      console.error('kava code set failed', e && e.message);
      return res.status(500).json({ ok: false, unavailable: true, error: 'code service unavailable' });
    }
  }

  return res.status(400).json({ ok: false, error: 'unknown action' });
}
/* kava-code:end */

/* toms-dev:start — TOM'S DEV private workspace (client/public/
   toms-dev/). A full development app: users ("seats") chat with
   "Tom's Dev" — their messages are build requests stored
   server-side, the owner's replies land back in the thread — and
   work from live read-only Launchpad sections (builds, the fee
   wallet, build-tool guides, a Launchpad snapshot). The page
   holds no keys, signs nothing, moves no funds; chain reads are
   public eth_call/eth_getLogs reads.
   Storage: Upstash — request rows are hashes tda:req:<id>
   (fields: id, seatId, text, status, result, created, updated),
   tda:reqs is the newest-first id list, seats are hashes
   tda:seat:<id> (fields: id, name, codehash, tokens, reqs,
   active, created) with tda:seats the newest-first seat list and
   tda:seatbycode:<sha256> mapping a seat's code hash to its seat.
   Access (v2): TWO TIERS. The owner code's SHA-256 lives in
   tda:ownercode; each seat has its OWN code (hash stored on the
   seat row). Only hashes travel (trim + upper-case normalisation,
   same as the panels); stored hashes are NEVER returned: GET
   answers only {ownerSet: bool, partnerSet: bool} (partnerSet =
   at least one active seat exists).
   Tiers: tdaList/tdaNew accept the owner or the seat that owns
   the thread — A SEAT SEES ONLY ITS OWN ROWS; the owner sees all.
   tdaStatus/tdaDone, every code change (tdaCodeSet / tdaRotate)
   and every seat action (tdaSeat*) are OWNER ONLY: a seat code
   presented for an owner action gets a plain "owner code
   required", never data. Rows written before seats existed have
   no seatId and belong to the owner view only.
   Setup order is enforced server-side: the owner code must be
   SET before any seat can be created (the bootstrap seat alone
   cannot create seats).
   Bootstrap: while NO owner code is stored, TDA_BOOTSTRAP_HASH
   below — the SHA-256 of the starter code — counts
   as the owner seat, so the owner can open the page and set the
   real owner code. The moment an owner code is set, the bootstrap
   is dead everywhere. Migration: the v1 single code lived in
   tda:codehash; if set and tda:ownercode is not, that hash IS the
   owner hash (rotating the owner code deletes the legacy key).
   TOKENS: building runs on tokens. Each seat carries a token
   balance set by the owner (create / top-up / adjust). A seat at
   0 cannot post (tdaNew refuses server-side). When the owner
   completes a job via tdaDone with a `tokens` amount, that
   amount is decremented from the seat's balance (clamped at 0) —
   that is the only place usage is recorded, and it is recorded
   by the owner side, by design. (v3: the builder runner
   completes rows through the same tdaFinishRow path — see
   LIVE BUILDER below — so charging stays one code path with
   one idempotency story.)
   REFILL METHODS (Nov 14): a refill is $5 paid in LUNC
   (denom uluna) or in USTC (denom uusd — Terra Classic's
   native stablecoin) to the SAME receiving wallet through
   the SAME wallet stack and the SAME verification: the
   submit names its method, the legs summed are that
   method's denom from the tx's actual sender, and the value
   is read at that token's live price (USTC: CoinPaprika
   ust-terrausd + CoinGecko terrausd, the same cross-check
   discipline as LUNC). The claim key is the tx hash for
   both, so a payment can never credit twice in any mix.
   OWNER-ADDED PROJECTS: the owner can drop a project straight
   into a seat's board (tdaNew with seatId + addProject, owner
   tier only). The row is flagged ownerAdded and titled exactly
   what the owner typed. It is a TRACKING entry: tdaDone on it
   records 0 tokens used and never moves the seat's balance —
   normal seat-posted projects charge as above.
   ENTRY CODES: the owner can also create a seat with ONE PRESS
   (tdaSeatQuickCreate): the SERVER generates a strong code
   (TD-XXXXXX-XXXXXX from an unambiguous alphabet, rejection-
   sampled crypto randomness), stores only its hash, and returns
   the plain code exactly once, in that response — it is never
   retrievable afterwards. A new seat's starting balance is the
   TOKENS PER SEAT setting (tda:settings seatTokens,
   120,000,000 by default). Rotating a
   seat's code can generate a fresh code the same way
   (tdaSeatCode with generate: true).
   SEAT REFILLS (Nov 13 — replaces the earlier per-1,000-LUNC
   top-up rate idea and the short-lived $5/week clock): a
   refill costs $5, paid in LUNC (tdaRenewSubmit). The seat connects a wallet
   on the card and presses one Pay button: the page signs a
   plain bank send from the connected wallet and hands the
   server the resulting hash (the wallet it connected as
   the claimed sender). The server reads the tx itself
   (by-hash on the house Terra Classic LCD — the house FCD
   host's single-tx path 404s, probed 2026-11-13; the
   parser also accepts the FCD amino shape) and requires:
   the tx succeeded, it carries a bank send TO the owner's
   receiving wallet (tda:settings renewWallet), the send's
   ACTUAL sender (read from the tx, never just the claim)
   matches the seat's wallet, and the hash was never
   credited before (tda:renew:used:<txhash>, claimed with
   SET NX only AFTER every check passes, so a refused attempt
   never burns a hash). The LUNC sent is valued at the LIVE
   price at verification time — CoinPaprika primary,
   CoinGecko fallback, the Wallet Scope pair; when both
   answer they must agree within 25% or the check refuses —
   and must be worth at least 95% of the refill price
   (renewPriceUsd, default $5 → $4.75 floor) to absorb price
   wiggle between send and check. A verified payment tops
   the token balance UP TO the seat's share allowance (the
   pool share above) — never above it, never down. Refill
   records live in tda:renew:<id> hashes with tda:renews the
   newest-first list, for the owner's reconciliation list
   (tdaRenewList) — the refill history.
   NO WEEKLY CLOCK (owner ruling, Nov 13): a seat is ACTIVE
   while its token balance is above 0 — dates gate nothing.
   At 0 the seat can still unlock and READ everything, but
   tdaNew refuses server-side ({noTokens: true}) and a
   refill is the way back. The paidThrough field still
   written on seat rows is legacy data from the weekly
   model; nothing reads it.
   WALLET BINDING (anti-race): payments are public on-chain,
   so a hash alone proves nothing about WHICH seat paid. A
   seat's sending wallet is therefore bound to the seat —
   set by the owner (tdaSeatWallet) or by the seat's first
   successful renewal — and afterwards only that wallet's
   sends can renew the seat; a wallet bound to one active
   seat can never renew another.
   NO MEMO (owner order, Nov 13 evening): the paste-a-memo
   card was too confusing, so the payment carries NO memo
   and attribution is the tx's actual sender + the wallet
   binding — the connected wallet pays, its address is what
   the chain shows as the sender, and that is what binds.
   A payment that still carries THIS seat's TD- memo (sent
   the old way) passes as before; a payment carrying a
   DIFFERENT seat's TD- memo can never credit this seat.
   FRESHNESS (review hardening, Nov 13): the payment's
   block time must be within the last 7 days, so a cheap
   payment can't be warehoused against a later price rise.
   Prices are valued at the LOWER of the two house feeds
   when both answer; submits are throttled per seat and
   serialised per seat (a short lock) so concurrent credits
   can't collapse; settings and binding are re-validated on
   fresh reads after the claim, before any credit lands.
   EVERY gated action re-verifies the presented hash server-side;
   there is no session to ride. Brute-force rail mirrors the
   panels': failed attempts counted per client IP (IP hashed into
   the counter key); 8 failures inside 15 minutes lock that IP
   out of ALL tda actions for 15 minutes; any success clears the
   counter. A valid seat code refused at an owner-only action is
   NOT counted as a failure — it is not a guess. */
const TDA_OWNER_KEY = 'tda:ownercode';
const TDA_LEGACY_KEY = 'tda:codehash';
const TDA_BOOTSTRAP_HASH = '133c984e1122da6dc2c291e088d843a06968f9f14b34de5e0f8b99eb876db145';
const TDA_MAX_FAILS = 8;
const TDA_FAIL_WINDOW_SEC = 15 * 60;
const TDA_LOCKOUT_SEC = 15 * 60;
const TDA_LIST_CAP = 50;
const TDA_SEAT_OPEN_CAP = 25;
const TDA_TEXT_MAX = 2000;
const TDA_RESULT_MAX = 4000;
const TDA_NAME_MAX = 40;
/* Token-amount ceiling for parse/validation. Must stay ABOVE
   the tokens-per-seat size (120,000,000 default): at 100,000,000
   the owner's Set exact refused the standard seat size itself
   with 'bad token amount' (audit 2026-11-14). 1e12 leaves the
   full seat range open while still refusing absurd input; it is
   far inside both JS safe integers and Redis HINCRBY range. */
const TDA_TOKENS_MAX = 1000000000000;
const TDA_RENEW_PERIOD_MS = 7 * 24 * 3600 * 1000;
const TDA_RENEW_DEFAULT_USD = 5;
const TDA_RENEW_TOLERANCE = 0.95;
const TDA_RENEW_MAX_AGE_MS = 7 * 24 * 3600 * 1000;
const TDA_RENEW_TRY_MAX = 30;
const TDA_RENEW_TRY_WINDOW_SEC = 10 * 60;
const TDA_PRICE_CACHE_MS = 30 * 1000;
const TDA_TX_LOOKUP = 'https://terra-classic-lcd.publicnode.com/cosmos/tx/v1beta1/txs/';
const TDA_PAPRIKA_LUNC = 'https://api.coinpaprika.com/v1/tickers/luna-terra';
const TDA_GECKO_LUNC = 'https://api.coingecko.com/api/v3/simple/price?ids=terra-luna&vs_currencies=usd';
const TDA_PAPRIKA_USTC = 'https://api.coinpaprika.com/v1/tickers/ust-terrausd';
const TDA_GECKO_USTC = 'https://api.coingecko.com/api/v3/simple/price?ids=terrausd&vs_currencies=usd';
/* LIVE BUILDER (v3, owner ruling Nov 14): a request posted from
   the v3 page (liveBuilder flag) is builder-managed — it flips
   to Building at once with an instant builder reply in the
   thread, and the VM-side builder runner claims it, posts
   progress lines (the row's `plog`, a JSON trail of
   {t, k, m} entries: k = builder | step | reply | note),
   builds web builds, walks guided steps for the rest, and
   completes through the SAME finish path as a human reply
   (tdaFinishRow — idempotent delta charging). Rows posted
   without the flag (the live page) keep the v2 queue
   behaviour exactly. The runner authenticates with its own
   secret: only its SHA-256 lives server-side (tda:buildersecret),
   set while unset (bootstrap) and afterwards only by the
   owner or by presenting the current builder hash (rotation).
   Claims are a lock key (tda:claim:<id>, 15 min, refreshed by
   progress posts) plus a claim-token hash on the row, so a
   crashed runner's work is recoverable, never stuck, and a
   stale runner can never write over a live claim.
   OWNER-ENGLISH (Nov 18 late, owner order): the owner's
   Chat view reads every thread in English. Each row stores
   English renderings beside the seat's own words — textEn
   (the ask), resultEn (the reply), and an `e` on each plog
   trail entry. Writers store the rendering when they write
   the message (runner/server template strings come from the
   same language tables, so they are exact); free seat text
   and rows written before renderings existed are covered by
   the runner's translation sweep (tdaEnSweep / tdaSetEn —
   builder-gated, fill-empty-only, never touches text,
   status or tokens). The seat's own view is unchanged. */
const TDA_CLAIM_TTL_SEC = 15 * 60;
const TDA_CLAIM_STALE_MS = 15 * 60 * 1000;
const TDA_PLOG_CAP = 40;
const TDA_PLOG_MSG_MAX = 300;
const TDA_STEP_MAX = 600;
const TDA_GUIDE_STEPS_MAX = 12;

function tdaIsHash(v) { return typeof v === 'string' && /^[0-9a-f]{64}$/.test(v); }

function tdaHashEq(a, b) {
  const ba = Buffer.from(String(a)), bb = Buffer.from(String(b));
  return ba.length === bb.length && crypto.timingSafeEqual(ba, bb);
}

function tdaIpTag(req) {
  /* The lockout key must not be spoofable: the FIRST
     x-forwarded-for entry is whatever the client claims, so we
     key on the LAST entry — the one the platform edge appended
     for the actual connection — falling back to the socket. */
  const xff = String((req.headers && req.headers['x-forwarded-for']) || '');
  const parts = xff.split(',').map(s => s.trim()).filter(Boolean);
  const ip = parts[parts.length - 1] || (req.socket && req.socket.remoteAddress) || 'unknown';
  return crypto.createHash('sha256').update(ip).digest('hex').slice(0, 16);
}

function tdaHashToObj(flat) {
  const o = {};
  if (Array.isArray(flat)) for (let i = 0; i + 1 < flat.length; i += 2) o[flat[i]] = flat[i + 1];
  return o;
}

/* The stored owner hash: tda:ownercode, falling back to the v1
   legacy key (which counts as the owner seat until rotated).
   Only ever compared, never returned. */
async function tdaStoredOwner() {
  const out = await upstashPipeline([['GET', TDA_OWNER_KEY], ['GET', TDA_LEGACY_KEY]]);
  const own = out[0] && out[0].result;
  const leg = out[1] && out[1].result;
  const ownerHash = tdaIsHash(own) ? own : (tdaIsHash(leg) ? leg : null);
  return { ownerHash, ownerSet: !!ownerHash };
}

/* Generated entry codes: TD-XXXXXX-XXXXXX from an unambiguous
   alphabet (no I, L, O, 0 or 1 — 31 symbols). Bytes are
   rejection-sampled (>= 248 discarded) so every symbol is
   equally likely; crypto.randomBytes is the only source. The
   plain code is returned exactly once, by the action that
   generated it; only its SHA-256 is ever stored. */
const TDA_CODE_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
const TDA_SEAT_TOKENS_DEFAULT = 120000000;

function tdaGenCodePlain() {
  let s = '';
  while (s.length < 12) {
    const bytes = crypto.randomBytes(24);
    for (const b of bytes) {
      if (b >= 248) continue;
      s += TDA_CODE_ALPHABET[b % 31];
      if (s.length === 12) break;
    }
  }
  return 'TD-' + s.slice(0, 6) + '-' + s.slice(6);
}

function tdaCodeHash(plain) {
  return crypto.createHash('sha256').update(String(plain).trim().toUpperCase()).digest('hex');
}

/* Generate a code whose hash collides with nothing live: not
   the owner hash, not the bootstrap, not any seat's code. */
async function tdaFreshGenCode(ownerHash) {
  for (let i = 0; i < 10; i++) {
    const plain = tdaGenCodePlain();
    const hash = tdaCodeHash(plain);
    if (ownerHash && tdaHashEq(hash, ownerHash)) continue;
    if (tdaHashEq(hash, TDA_BOOTSTRAP_HASH)) continue;
    const clash = await upstashPipeline([['GET', 'tda:seatbycode:' + hash]]);
    if (clash[0] && clash[0].result) continue;
    return { plain, hash };
  }
  return null;
}

/* Owner settings (tda:settings hash). TOKEN RULE (owner,
   Nov 13, final): TOKENS PER SEAT is one direct number —
   120,000,000 by default, owner-editable in the panel
   (tdaSettingsSet seatTokens). New seats start at it; a
   verified refill tops a seat UP TO it. No pool, no
   percentages. The owner can still top up / set any seat's
   exact balance afterwards. */
async function tdaGetSettings() {
  const out = await upstashPipeline([['HGETALL', 'tda:settings']]);
  const o = tdaHashToObj(out[0] && out[0].result);
  const rawT = o.seatTokens;
  const parsedT = (rawT === undefined || rawT === '') ? null : tdaParseTokens(rawT, null);
  const seatTokens = (parsedT !== null && parsedT > 0) ? parsedT : TDA_SEAT_TOKENS_DEFAULT;
  const renewWallet = tdaTerraAddr(o.renewWallet || '') ? String(o.renewWallet).trim().toLowerCase() : null;
  const priceRaw = Number(o.renewPriceUsd);
  const renewPriceUsd = (Number.isFinite(priceRaw) && priceRaw > 0 && priceRaw <= 1000) ? priceRaw : TDA_RENEW_DEFAULT_USD;
  return {
    seatTokens,
    renewWallet,
    renewPriceUsd,
    renewSet: !!renewWallet,
  };
}

function tdaTerraAddr(v) {
  return /^terra1[a-z0-9]{38}$/.test(String(v || '').trim().toLowerCase());
}

/* Strict form for OWNER-ENTERED wallets: the shape check plus
   the bech32 checksum (BIP-173 polymod). A bad-checksum wallet
   saved into the settings would silently brick every renewal
   (no real payment can ever match it), so owner entries must
   be real addresses. The seat's pasted SENDER keeps the shape
   check only — there the exact on-chain leg match is the real
   gate, and on-chain addresses are valid by construction. */
const TDA_BECH32 = 'qpzry9x8gf2tvdw0s3jn54khce6mua7l';
function tdaBech32Polymod(values) {
  const GEN = [0x3b6a57b2, 0x26508e6d, 0x1ea119fa, 0x3d4233dd, 0x2a1462b3];
  let chk = 1;
  for (const v of values) {
    const top = chk >> 25;
    chk = ((chk & 0x1ffffff) << 5) ^ v;
    for (let i = 0; i < 5; i++) if ((top >> i) & 1) chk ^= GEN[i];
  }
  return chk;
}
function tdaTerraAddrStrict(v) {
  const a = String(v || '').trim().toLowerCase();
  if (!tdaTerraAddr(a)) return false;
  const pos = a.lastIndexOf('1');
  const hrp = a.slice(0, pos), data = a.slice(pos + 1);
  if (hrp !== 'terra' || data.length < 6) return false;
  const vals = [];
  for (let i = 0; i < hrp.length; i++) vals.push(hrp.charCodeAt(i) >> 5);
  vals.push(0);
  for (let i = 0; i < hrp.length; i++) vals.push(hrp.charCodeAt(i) & 31);
  for (const c of data) {
    const idx = TDA_BECH32.indexOf(c);
    if (idx < 0) return false;
    vals.push(idx);
  }
  return tdaBech32Polymod(vals) === 1;
}

/* A seat's renewal memo (TD-<seatId>). No longer required
   on a payment — attribution is the tx's actual sender plus
   the wallet binding — but it still names its seat: a
   payment carrying one seat's memo can never credit
   another, and tdaRenewInfo still hands it out for anyone
   sending the old way. */
function tdaRenewMemo(seatId) {
  return 'TD-' + String(seatId || '').toUpperCase();
}

/* LEGACY (weekly model, retired Nov 13): a seat's
   paid-through instant. Nothing gates on it any more —
   seats are active while their balance is above 0. Kept
   only because seat rows still carry the stored field. */
function tdaSeatPaidThrough(o) {
  const pt = Number(o && o.paidThrough);
  if (Number.isFinite(pt) && pt > 0) return pt;
  const created = Number(o && o.created) || 0;
  return created + TDA_RENEW_PERIOD_MS;
}

function tdaParseUsd(v) {
  const n = Number(v);
  if (!Number.isFinite(n) || n <= 0 || n > 1000) return null;
  return Math.round(n * 100) / 100;
}

/* Which active seat owns this Terra wallet (binding), or null. */
async function tdaWalletOwnerSeat(wallet) {
  const out = await upstashPipeline([['LRANGE', 'tda:seats', 0, -1]]);
  const ids = (out[0] && out[0].result) || [];
  if (!ids.length) return null;
  const rows = await upstashPipeline(ids.map(id => ['HGETALL', 'tda:seat:' + id]));
  for (const r of rows) {
    const o = tdaHashToObj(r && r.result);
    if (o.id && String(o.active) === '1' && String(o.wallet || '') === wallet) return String(o.id);
  }
  return null;
}

async function tdaFetchJson(url, timeoutMs) {
  const ctl = new AbortController();
  const t = setTimeout(() => ctl.abort(), timeoutMs || 10000);
  try {
    const r = await fetch(url, { signal: ctl.signal, headers: { 'User-Agent': 'toms-dev' } });
    if (!r || !r.ok) throw new Error('http ' + (r ? r.status : 'none'));
    return await r.json();
  } finally { clearTimeout(t); }
}

/* The LIVE LUNC/USD price at verification time — the house
   path Wallet Scope uses: CoinPaprika primary, CoinGecko
   fallback. Both are read when both answer, and they must
   agree within 25%: a wild disagreement means a feed is
   broken or manipulated, and the honest move is to refuse
   the check (the seat's payment is untouched and can be
   re-checked), never to credit off a bad price. When both
   answer, payments are valued at the LOWER of the two — the
   conservative side for accepting money — so a feed quoting
   high can never inflate a payment past the floor. A
   successful read is cached for 30 s (the renewal submit
   path is also throttled per seat), so seat traffic can't
   burn the price APIs' quota. Returns {usd, source} or null
   when no trustworthy price exists. */
let tdaPriceCache = null;
async function tdaLuncPrice() {
  if (tdaPriceCache && (Date.now() - tdaPriceCache.at) < TDA_PRICE_CACHE_MS) return tdaPriceCache.val;
  const read = async (url, pick) => {
    try { const v = pick(await tdaFetchJson(url, 8000)); return (Number.isFinite(v) && v > 0) ? v : null; }
    catch (e) { return null; }
  };
  const [p, g] = await Promise.all([
    read(TDA_PAPRIKA_LUNC, j => j && j.quotes && j.quotes.USD && Number(j.quotes.USD.price)),
    read(TDA_GECKO_LUNC, j => j && j['terra-luna'] && Number(j['terra-luna'].usd)),
  ]);
  let val = null;
  if (p && g) {
    if (Math.abs(p - g) / Math.min(p, g) > 0.25) return null;
    val = { usd: Math.min(p, g), source: 'cross-checked' };
  }
  else if (p) val = { usd: p, source: 'coinpaprika' };
  else if (g) val = { usd: g, source: 'coingecko' };
  if (val) tdaPriceCache = { at: Date.now(), val };
  return val;
}

/* The LIVE USTC/USD price — the same cross-checked route as
   LUNC (CoinPaprika primary, CoinGecko fallback, 25%
   agreement rule, lower-of-two valuation, 30 s cache), so a
   USTC refill is worth what it claims to be worth before it
   credits anyone. */
let tdaUstcPriceCache = null;
async function tdaUstcPrice() {
  if (tdaUstcPriceCache && (Date.now() - tdaUstcPriceCache.at) < TDA_PRICE_CACHE_MS) return tdaUstcPriceCache.val;
  const read = async (url, pick) => {
    try { const v = pick(await tdaFetchJson(url, 8000)); return (Number.isFinite(v) && v > 0) ? v : null; }
    catch (e) { return null; }
  };
  const [p, g] = await Promise.all([
    read(TDA_PAPRIKA_USTC, j => j && j.quotes && j.quotes.USD && Number(j.quotes.USD.price)),
    read(TDA_GECKO_USTC, j => j && j['terrausd'] && Number(j['terrausd'].usd)),
  ]);
  let val = null;
  if (p && g) {
    if (Math.abs(p - g) / Math.min(p, g) > 0.25) return null;
    val = { usd: Math.min(p, g), source: 'cross-checked' };
  }
  else if (p) val = { usd: p, source: 'coinpaprika' };
  else if (g) val = { usd: g, source: 'coingecko' };
  if (val) tdaUstcPriceCache = { at: Date.now(), val };
  return val;
}

/* Read one transaction by hash from the house LCD and reduce
   it to the facts a renewal needs: did it succeed, and its
   bank-send legs (from, to, uluna + uusd as BigInt — amounts
   exceed float precision at the top end; both refill denoms
   are collected so one read serves either method). The FCD
   amino shape is accepted too, in case the lookup host ever
   serves it. Returns {found:false} for a hash the chain
   doesn't know (or an unreachable reader — the seat is told
   to retry, and nothing is claimed or credited either way). */
async function tdaLookupTx(txhash) {
  let j = null;
  try { j = await tdaFetchJson(TDA_TX_LOOKUP + txhash, 10000); }
  catch (e) { return { found: false }; }
  const sends = [];
  const pushLegs = (msgs, typeOf, valOf) => {
    for (const m of msgs || []) {
      if (!m || !String(typeOf(m)).endsWith('MsgSend')) continue;
      const v = valOf(m) || {};
      let tot = 0n, totU = 0n;
      for (const c of (v.amount || [])) {
        if (c && c.denom === 'uluna') { try { tot += BigInt(String(c.amount)); } catch (e) { /* skip bad leg */ } }
        if (c && c.denom === 'uusd') { try { totU += BigInt(String(c.amount)); } catch (e) { /* skip bad leg */ } }
      }
      sends.push({ from: String(v.from_address || ''), to: String(v.to_address || ''), uluna: tot, uusd: totU });
    }
  };
  if (j && j.tx_response) {
    const tr = j.tx_response;
    const code = tr.code === undefined || tr.code === null ? 0 : Number(tr.code);
    pushLegs(((tr.tx || {}).body || {}).messages, m => m['@type'], m => m);
    return { found: true, success: code === 0, sends, timestamp: String(tr.timestamp || ''), memo: String(((tr.tx || {}).body || {}).memo || '') };
  }
  if (j && j.tx && j.tx.value && Array.isArray(j.tx.value.msg)) {
    const code = j.code === undefined || j.code === null ? 0 : Number(j.code);
    pushLegs(j.tx.value.msg, m => m.type, m => m.value);
    return { found: true, success: code === 0, sends, timestamp: String(j.timestamp || ''), memo: String(j.tx.value.memo || '') };
  }
  return { found: false };
}

function tdaPublicSeat(o) {
  return {
    id: String(o.id || ''),
    name: String(o.name || ''),
    tokens: Math.max(0, parseInt(o.tokens, 10) || 0),
    used: Math.max(0, parseInt(o.used, 10) || 0),
    reqs: Math.max(0, parseInt(o.reqs, 10) || 0),
    active: String(o.active) === '1',
    created: Number(o.created) || 0,
    wallet: String(o.wallet || ''),
    lang: String(o.lang || ''),
  };
}

async function tdaGetSeat(seatId) {
  if (!/^s[a-z0-9]{6,24}$/.test(String(seatId || ''))) return null;
  const out = await upstashPipeline([['HGETALL', 'tda:seat:' + seatId]]);
  const o = tdaHashToObj(out[0] && out[0].result);
  return o.id ? o : null;
}

/* Resolve a presented code hash to its seat, or null. A seat
   resolves only while active, and the mapping must agree with
   the hash stored on the seat row itself (a stale mapping left
   by a rotation or removal never resolves). */
async function tdaResolveSeat(hash) {
  const out = await upstashPipeline([['GET', 'tda:seatbycode:' + hash]]);
  const seatId = out[0] && out[0].result;
  if (!seatId) return null;
  const o = await tdaGetSeat(String(seatId));
  if (!o || String(o.active) !== '1') return null;
  if (!tdaHashEq(String(o.codehash || ''), hash)) return null;
  return o;
}

/* Atomically claim a code hash for a seat (SET NX): true when
   the mapping now points at seatId (fresh claim or already
   ours), false when another seat holds it. Closes the
   check-then-write gap where two creates with the same code
   could both pass the clash check. */
async function tdaClaimCode(hash, seatId) {
  const out = await upstashPipeline([['SET', 'tda:seatbycode:' + hash, seatId, 'NX']]);
  if (out[0] && out[0].result) return true;
  const cur = await upstashPipeline([['GET', 'tda:seatbycode:' + hash]]);
  return !!(cur[0] && cur[0].result === seatId);
}

async function tdaAnyActiveSeat() {
  const out = await upstashPipeline([['LRANGE', 'tda:seats', 0, -1]]);
  const ids = (out[0] && out[0].result) || [];
  if (!ids.length) return false;
  const rows = await upstashPipeline(ids.map(id => ['HGETALL', 'tda:seat:' + id]));
  return rows.some(r => {
    const o = tdaHashToObj(r && r.result);
    return o.id && String(o.active) === '1';
  });
}

async function tdaLockState(tag) {
  const out = await upstashPipeline([['GET', 'tda:lock:' + tag], ['TTL', 'tda:lock:' + tag]]);
  const locked = !!(out[0] && out[0].result);
  const ttl = out[1] && typeof out[1].result === 'number' && out[1].result > 0 ? out[1].result : TDA_LOCKOUT_SEC;
  return { locked, retryAfterSec: locked ? ttl : 0 };
}

/* Record one failed attempt; returns true when this failure tripped
   the lockout. */
async function tdaRecordFail(tag) {
  const out = await upstashPipeline([['INCR', 'tda:fail:' + tag]]);
  const n = (out[0] && out[0].result) || 0;
  if (n === 1) {
    try { await upstashPipeline([['EXPIRE', 'tda:fail:' + tag, TDA_FAIL_WINDOW_SEC]]); } catch (e) { /* window is best-effort */ }
  }
  if (n >= TDA_MAX_FAILS) {
    await upstashPipeline([['SET', 'tda:lock:' + tag, '1', 'EX', TDA_LOCKOUT_SEC], ['DEL', 'tda:fail:' + tag]]);
    return true;
  }
  return false;
}

async function tdaClearFails(tag) {
  try { await upstashPipeline([['DEL', 'tda:fail:' + tag]]); } catch (e) { /* best-effort */ }
}

/* Verify a presented code hash for an action. need is 'any'
   (owner or the seat itself) or 'owner'. On success returns
   {tier:'owner'} or {tier:'seat', seat} and clears the fail
   counter. On failure this WRITES the response and returns null:
   a bad hash counts toward the lockout; a REAL seat code at an
   owner-only action is refused plainly ({ownerRequired: true}),
   is NOT counted, and never returns data. */
async function tdaAuthTier(req, res, tag, hash, need) {
  if (!tdaIsHash(hash)) { res.status(400).json({ ok: false, error: 'bad hash' }); return null; }
  const lock = await tdaLockState(tag);
  if (lock.locked) {
    res.status(200).json({ ok: false, locked: true, retryAfterSec: lock.retryAfterSec, error: 'too many tries — locked for a bit' });
    return null;
  }
  const stored = await tdaStoredOwner();
  const isOwner = (stored.ownerHash && tdaHashEq(hash, stored.ownerHash)) ||
    (!stored.ownerHash && tdaHashEq(hash, TDA_BOOTSTRAP_HASH));
  if (isOwner) { await tdaClearFails(tag); return { tier: 'owner' }; }
  const seat = await tdaResolveSeat(hash);
  if (seat) {
    if (need === 'owner') {
      res.status(200).json({ ok: false, ownerRequired: true, error: 'owner code required' });
      return null;
    }
    /* A seat success does NOT clear the fail counter: if it
       did, a seat holder could interleave one valid call every
       few guesses and brute-force the owner code forever
       without ever tripping the lockout. Only the owner's own
       success clears it. A seat's valid calls still WORK while
       its counter is below the lock threshold — the counter
       only bites when it trips. */
    return { tier: 'seat', seat };
  }
  const tripped = await tdaRecordFail(tag);
  res.status(200).json({ ok: false, locked: tripped, error: 'code not right' });
  return null;
}

function tdaPublicReq(o, seatName) {
  const out = {
    id: String(o.id || ''),
    seatId: String(o.seatId || 'owner'),
    seatName: seatName || '',
    text: String(o.text || ''),
    status: ['received', 'building', 'done', 'closed'].includes(o.status) ? o.status : 'received',
    ownerAdded: String(o.ownerAdded || '') === '1',
    closedBy: String(o.closedBy || ''),
    deletedAt: Number(o.deletedAt) || 0,
    result: String(o.result || ''),
    tokensUsed: Math.max(0, parseInt(o.tokensUsed, 10) || 0),
    created: Number(o.created) || 0,
    updated: Number(o.updated) || 0,
  };
  /* Owner-English renderings: stored next to the seat's own
     words (textEn for the ask, resultEn for the reply, `en`
     on each trail entry). The page's owner view prefers
     them; the seat's own view ignores them completely. */
  /* The seat's chosen language, stored on the row at post
     time: the builder runner takes its session language
     from here whenever the row carries one. */
  if (String(o.lang || '')) out.lang = String(o.lang);
  if (String(o.textEn || '')) out.textEn = String(o.textEn);
  if (String(o.resultEn || '')) out.resultEn = String(o.resultEn);
  /* v3 builder trail: only present on builder-managed rows,
     so v2 payloads (and the live page) are untouched. */
  const bs = String(o.buildState || '');
  if (bs) {
    out.buildState = bs;
    out.progress = tdaParsePlog(o.plog).map(e => {
      const p = { t: e.t, kind: e.k, msg: e.m };
      if (e.e) p.en = e.e;
      return p;
    });
    if (String(o.flagged || '') === '1') out.flagged = true;
  }
  return out;
}

/* The progress trail on a builder-managed row: a JSON array
   of {t, k, m} entries (k: builder | step | reply | note),
   newest last, capped so a chatty build can't bloat the row.
   Parsing is defensive — a corrupt trail reads as empty,
   never as a crash. */
function tdaParsePlog(raw) {
  /* Storage shape {t, k, m} — kept identical on the way out
     so a parse + rewrite round-trip never loses entries. */
  try {
    const a = JSON.parse(String(raw || ''));
    if (!Array.isArray(a)) return [];
    return a.filter(e => e && typeof e === 'object' && typeof e.m === 'string')
      .map(e => {
        const o = { t: Number(e.t) || 0, k: ['builder', 'step', 'reply', 'note'].includes(e.k) ? e.k : 'builder', m: e.m };
        /* Owner-English rendering of this entry, when one is
           stored — the owner's view reads it, the seat's view
           never does. */
        if (typeof e.e === 'string' && e.e) o.e = e.e.slice(0, TDA_STEP_MAX);
        return o;
      });
  } catch (e) { return []; }
}
function tdaPlogJson(existingRaw, entries) {
  const a = tdaParsePlog(existingRaw);
  for (const e of entries) {
    const cap = e.k === 'step' ? TDA_STEP_MAX : TDA_PLOG_MSG_MAX;
    const ent = { t: Date.now(), k: e.k, m: String(e.m || '').slice(0, cap) };
    if (typeof e.e === 'string' && e.e) ent.e = e.e.slice(0, cap);
    a.push(ent);
  }
  while (a.length > TDA_PLOG_CAP) a.shift();
  return JSON.stringify(a);
}
/* Set English renderings on EXISTING trail entries (by
   parsed index) without touching their text — the runner's
   owner-English sweep/backfill path. Only empty slots are
   filled: the first rendering stored wins, so a re-run can
   never rewrite what the owner already read. */
function tdaPlogSetEn(raw, plogEn) {
  const a = tdaParsePlog(raw);
  let n = 0;
  for (const p of (Array.isArray(plogEn) ? plogEn : [])) {
    const i = Number(p && p.i);
    const e = String((p && p.e) || '').trim();
    if (!Number.isInteger(i) || i < 0 || i >= a.length || !e) continue;
    if (a[i].e) continue;
    a[i].e = e.slice(0, a[i].k === 'step' ? TDA_STEP_MAX : TDA_PLOG_MSG_MAX);
    n++;
  }
  return { json: JSON.stringify(a.slice(-TDA_PLOG_CAP)), set: n };
}

/* Complete a request row: write the reply + the charged
   figure, then settle the seat's balance by the DELTA
   between the new figure and what the row already charged —
   so completing twice (double-tap, client retry, a runner
   re-finishing after a crash) charges exactly once, and
   editing a done row's figure settles the difference either
   way. A positive delta deducts at most the actual balance
   (the lifetime `used` counter rises by what was REALLY
   deducted); a negative delta refunds at most what the seat
   has ever used. Owner-added tracking rows never charge.
   Shared by tdaDone (owner) and tdaBuildDone (the runner) so
   there is exactly one charging code path. Returns the
   seat's balance after, or null for the owner's own rows. */
async function tdaFinishRow(existing, result, used, resultEn) {
  if (String(existing.ownerAdded || '') === '1') used = 0;
  const id = String(existing.id);
  const now = String(Date.now());
  const seatId = String(existing.seatId || 'owner');
  const prevCharged = parseInt(existing.tokensUsed, 10) || 0;
  const delta = used - prevCharged;
  let tokensLeft = null;
  let applied = 0;
  let seat = null;
  if (seatId !== 'owner') {
    seat = await tdaGetSeat(seatId);
    if (seat) {
      const bal = Math.max(0, parseInt(seat.tokens, 10) || 0);
      const usedBefore = Math.max(0, parseInt(seat.used, 10) || 0);
      if (delta > 0) applied = Math.min(delta, bal);
      else if (delta < 0) applied = -Math.min(-delta, usedBefore);
      tokensLeft = bal - applied;
    }
  }
  /* The row records what the seat was ACTUALLY charged for
     it in total (previous charge + the applied delta, after
     the balance clamp) — so the thread's "used X tokens" is
     always the truth, never a list price the seat didn't pay. */
  const chargedTotal = prevCharged + applied;
  const finishSet = ['HSET', 'tda:req:' + id, 'status', 'done', 'result', result, 'tokensUsed', String(chargedTotal), 'updated', now];
  /* The English rendering of the reply rides along when the
     caller composed one (template strings are exact from the
     language tables; free text is swept in later). */
  if (typeof resultEn === 'string' && resultEn) finishSet.push('resultEn', resultEn.slice(0, TDA_RESULT_MAX));
  const cmds = [finishSet];
  if (seat && applied !== 0) {
    const usedBefore = Math.max(0, parseInt(seat.used, 10) || 0);
    cmds.push(['HSET', 'tda:seat:' + seatId, 'tokens', String(tokensLeft), 'used', String(usedBefore + applied)]);
  }
  await upstashPipeline(cmds);
  return tokensLeft;
}

/* Builder-runner gate: the presented hash must be the SHA-256
   of the runner secret whose hash is stored server-side.
   Failures ride the same per-IP brute-force rail as code
   guesses. Returns true when the caller is the runner. */
async function tdaBuilderGate(req, res, tag, body) {
  const lock = await tdaLockState(tag);
  if (lock.locked) {
    res.status(200).json({ ok: false, locked: true, retryAfterSec: lock.retryAfterSec, error: 'too many tries — locked for a bit' });
    return false;
  }
  const out = await upstashPipeline([['GET', 'tda:buildersecret']]);
  const stored = out[0] && out[0].result;
  const bhash = String(body.bhash || '').toLowerCase();
  if (!tdaIsHash(stored || '') || !tdaIsHash(bhash) || !tdaHashEq(bhash, stored)) {
    const tripped = await tdaRecordFail(tag);
    res.status(200).json({ ok: false, locked: tripped, error: 'builder not authorized' });
    return false;
  }
  return true;
}

/* Verify a runner's claim on a row: the claim lock must still
   hold the presented token AND the row must carry that
   token's hash (so a lock that expired and was re-taken by
   another runner can never be written through by the stale
   holder). Returns the row object, or null. */
async function tdaClaimCheck(id, claimToken) {
  if (!/^[0-9a-f]{48}$/.test(String(claimToken || ''))) return null;
  const out = await upstashPipeline([['GET', 'tda:claim:' + id], ['HGETALL', 'tda:req:' + id]]);
  const lockTok = out[0] && out[0].result;
  const row = tdaHashToObj(out[1] && out[1].result);
  if (!row.id || lockTok !== claimToken) return null;
  const want = crypto.createHash('sha256').update(String(claimToken)).digest('hex');
  if (!row.claimHash || !tdaHashEq(row.claimHash, want)) return null;
  if (String(row.deletedAt || '')) return null;
  return row;
}

/* Find a seat's open guided-steps row (the builder walked
   the seat into a flow and is waiting for their reply), or
   null. Guided rows are status 'building', buildState
   'guided', and are NOT claim-held while they wait. */
async function tdaFindGuided(seatId) {
  const idsOut = await upstashPipeline([['LRANGE', 'tda:reqs', 0, 199]]);
  const ids = (idsOut[0] && idsOut[0].result) || [];
  if (!ids.length) return null;
  const rows = await upstashPipeline(ids.map(x => ['HGETALL', 'tda:req:' + x]));
  for (const rw of rows) {
    const o = tdaHashToObj(rw && rw.result);
    if (o.id && String(o.seatId || '') === seatId && o.status === 'building' && String(o.buildState || '') === 'guided' && !String(o.deletedAt || '')) return o;
  }
  return null;
}


/* ---------- Tom's Dev i18n (2026-11-19 language fix) ----------
   The agent answers in the language the seat writes in. The
   server owns a few strings of its own — the instant ack on a
   new row, the guide step prefixes / stop / nudge / all-done
   lines, the refuse result — localized here for the app's 18
   shipped languages, from the same tables the builder runner
   uses (builder-runner/lang.mjs). Detection runs on the
   request text itself; the request's language wins. */
const TDA_I18N = {
 "en": {
  "gotIt": "Got it — one moment. I'll post the answer here as soon as it's ready.",
  "stepOf": "Step {n} of {m}",
  "guideIntro": "This one needs a few steps only you can do — I'll walk you through them, one at a time.",
  "guideStop": "No problem — we've stopped there, and nothing was charged for the guide. If you want to pick it up again, just ask and we'll restart the steps.",
  "guideNudge": "No rush — take your time with that step. When it's done, just say \"done\". If you want to stop, say \"stop\".",
  "guideAllDone": "All steps done — nice work, you are set up.",
  "refuseResult": "I can't build that one. Tom's Dev is for clean builds only — no scams, no copycat sites, nothing that impersonates anyone or takes people's keys or money under false pretenses. Nothing was charged. If I've misunderstood your idea, reword it and ask again."
 },
 "es": {
  "gotIt": "Recibido — un momento. Publicaré la respuesta aquí en cuanto esté lista.",
  "stepOf": "Paso {n} de {m}",
  "guideIntro": "Esto necesita unos pasos que solo tú puedes hacer — te guiaré por ellos, uno a la vez.",
  "guideStop": "Sin problema — paramos ahí y no se cobró nada por la guía. Si quieres retomarla, solo pídelo y reiniciamos los pasos.",
  "guideNudge": "Sin prisa — tómate tu tiempo con ese paso. Cuando esté listo, solo di «listo». Si quieres parar, di «alto».",
  "guideAllDone": "Todos los pasos están hechos — buen trabajo, ya quedó configurado.",
  "refuseResult": "No puedo construir eso. Tom's Dev es solo para creaciones limpias: nada de estafas, sitios copia, nada que suplante a nadie ni que tome las claves o el dinero de la gente con engaños. No se cobró nada. Si entendí mal tu idea, dilo de otra manera y pide de nuevo."
 },
 "fr": {
  "gotIt": "Bien reçu — un instant. Je publierai la réponse ici dès qu'elle sera prête.",
  "stepOf": "Étape {n} sur {m}",
  "guideIntro": "Ceci demande quelques étapes que vous seul pouvez faire — je vais vous guider, une à la fois.",
  "guideStop": "Pas de problème — on s'arrête là, et rien n'a été facturé pour le guide. Si vous voulez reprendre, demandez et on recommencera les étapes.",
  "guideNudge": "Pas de précipitation — prenez votre temps pour cette étape. Quand c'est fait, dites simplement «terminé». Pour arrêter, dites «stop».",
  "guideAllDone": "Toutes les étapes sont faites — beau travail, tout est en place.",
  "refuseResult": "Je ne peux pas construire ça. Tom's Dev est réservé aux créations propres — pas d'arnaques, pas de sites copiés, rien qui usurpe l'identité de quelqu'un ou prenne les clés ou l'argent des gens sous de faux prétextes. Rien n'a été facturé. Si j'ai mal compris votre idée, reformulez-la et redemandez."
 },
 "de": {
  "gotIt": "Verstanden — einen Moment. Ich poste die Antwort hier, sobald sie fertig ist.",
  "stepOf": "Schritt {n} von {m}",
  "guideIntro": "Dafür sind ein paar Schritte nötig, die nur du tun kannst — ich führe dich einen nach dem anderen hindurch.",
  "guideStop": "Kein Problem — wir hören hier auf, und für die Anleitung wurde nichts berechnet. Wenn du weitermachen willst, frag einfach, und wir starten die Schritte neu.",
  "guideNudge": "Keine Eile — lass dir für diesen Schritt Zeit. Wenn er fertig ist, sag einfach „fertig“. Wenn du aufhören willst, sag „stopp“.",
  "guideAllDone": "Alle Schritte sind erledigt — gut gemacht, alles ist eingerichtet.",
  "refuseResult": "Das kann ich nicht bauen. Tom's Dev ist nur für saubere Builds — keine Betrügereien, keine kopierten Seiten, nichts, was sich als jemand anderes ausgibt oder unter falschen Versprechen an Schlüssel oder Geld der Leute will. Es wurde nichts berechnet. Wenn ich Ihre Idee falsch verstanden habe, formulieren Sie sie anders und fragen Sie erneut."
 },
 "pt": {
  "gotIt": "Recebido — um momento. Publico a resposta aqui assim que estiver pronta.",
  "stepOf": "Passo {n} de {m}",
  "guideIntro": "Isso precisa de alguns passos que só você pode fazer — vou te guiar por eles, um de cada vez.",
  "guideStop": "Sem problema — paramos aqui e nada foi cobrado pelo guia. Se quiser retomar, é só pedir e reiniciamos os passos.",
  "guideNudge": "Sem pressa — leve o seu tempo nesse passo. Quando terminar, diga apenas «pronto». Se quiser parar, diga «para».",
  "guideAllDone": "Todos os passos foram feitos — bom trabalho, está tudo configurado.",
  "refuseResult": "Não posso construir isso. O Tom's Dev é só para criações limpas — nada de golpes, sites copiados, nada que se passe por outra pessoa ou pegue chaves ou dinheiro das pessoas com falsos pretextos. Nada foi cobrado. Se entendi mal a sua ideia, diga de outra forma e peça de novo."
 },
 "it": {
  "gotIt": "Ricevuto — un momento. Pubblicherò la risposta qui appena sarà pronta.",
  "stepOf": "Passo {n} di {m}",
  "guideIntro": "Servono alcuni passi che puoi fare solo tu — ti guiderò uno alla volta.",
  "guideStop": "Nessun problema — ci fermiamo qui e niente è stato addebitato per la guida. Se vuoi riprendere, basta chiedere e ricominciamo i passi.",
  "guideNudge": "Nessuna fretta — prenditi il tuo tempo per questo passo. Quando è fatto, di' semplicemente «fatto». Se vuoi fermarti, di' «stop».",
  "guideAllDone": "Tutti i passi sono fatti — ottimo lavoro, è tutto configurato.",
  "refuseResult": "Non posso costruirlo. Tom's Dev è solo per creazioni pulite — niente truffe, siti copiati, niente che impersoni qualcuno o prenda chiavi o soldi delle persone con falsi pretesti. Non è stato addebitato nulla. Se ho frainteso la tua idea, riformulala e chiedi di nuovo."
 },
 "nl": {
  "gotIt": "Begrepen — een moment. Ik plaats het antwoord hier zodra het klaar is.",
  "stepOf": "Stap {n} van {m}",
  "guideIntro": "Hiervoor zijn een paar stappen nodig die alleen jij kunt doen — ik begeleid je er één voor één doorheen.",
  "guideStop": "Geen probleem — we stoppen hier, en er is niets in rekening gebracht voor de gids. Als je verder wilt, vraag het gewoon en we herstarten de stappen.",
  "guideNudge": "Geen haast — neem je tijd voor die stap. Als hij klaar is, zeg je gewoon \"klaar\". Wil je stoppen, zeg dan \"stop\".",
  "guideAllDone": "Alle stappen zijn gedaan — goed werk, alles is ingesteld.",
  "refuseResult": "Dat kan ik niet bouwen. Tom's Dev is alleen voor schone builds — geen oplichting, geen gekopieerde sites, niets dat zich voordoet als iemand anders of onder valse voorwendselen aan sleutels of geld van mensen komt. Er is niets in rekening gebracht. Als ik je idee verkeerd heb begrepen, verwoord het anders en vraag het opnieuw."
 },
 "ru": {
  "gotIt": "Понял — минутку. Опубликую ответ здесь, как только он будет готов.",
  "stepOf": "Шаг {n} из {m}",
  "guideIntro": "Для этого нужно несколько шагов, которые можете сделать только вы, — я проведу вас по ним по одному.",
  "guideStop": "Без проблем — остановимся здесь, и за руководство ничего не списано. Если захотите продолжить, просто попросите — и мы начнём шаги заново.",
  "guideNudge": "Не спешите — не торопитесь с этим шагом. Когда будет готово, просто напишите «готово». Если хотите остановиться, напишите «стоп».",
  "guideAllDone": "Все шаги выполнены — отличная работа, всё настроено.",
  "refuseResult": "Я не могу это построить. Tom's Dev — только для чистых сборок: никакого мошенничества, скопированных сайтов, ничего, что выдаёт себя за кого-то другого или под ложным предлогом забирает ключи или деньги людей. Ничего не списано. Если я неправильно понял вашу идею, переформулируйте её и попросите снова."
 },
 "uk": {
  "gotIt": "Зрозумів — хвилинку. Опублікую відповідь тут, щойно вона буде готова.",
  "stepOf": "Крок {n} з {m}",
  "guideIntro": "Для цього потрібно кілька кроків, які можете зробити лише ви, — я проведу вас ними по одному.",
  "guideStop": "Без проблем — зупинимося тут, і за посібник нічого не списано. Якщо захочете продовжити, просто попросіть — і ми почнемо кроки заново.",
  "guideNudge": "Не поспішайте — не кваптеся з цим кроком. Коли буде готово, просто напишіть «готово». Якщо хочете зупинитися, напишіть «стоп».",
  "guideAllDone": "Усі кроки виконано — чудова робота, все налаштовано.",
  "refuseResult": "Я не можу це побудувати. Tom's Dev — лише для чистих збірок: жодного шахрайства, скопійованих сайтів, нічого, що видає себе за когось іншого або під хибним приводом забирає ключі чи гроші людей. Нічого не списано. Якщо я неправильно зрозумів вашу ідею, переформулюйте її та попросіть знову."
 },
 "tr": {
  "gotIt": "Anlaşıldı — bir dakika. Cevap hazır olur olmaz buraya yazacağım.",
  "stepOf": "{m} adımdan {n}. adım",
  "guideIntro": "Bunun için yalnızca sizin yapabileceğiniz birkaç adım gerekiyor — sizi tek tek yönlendireceğim.",
  "guideStop": "Sorun değil — burada durduk ve rehber için ücret alınmadı. Devam etmek isterseniz söylemeniz yeterli, adımları baştan başlatırız.",
  "guideNudge": "Acele yok — o adım için acele etmeyin. Bitince sadece \"tamam\" yazın. Durmak isterseniz \"dur\" yazın.",
  "guideAllDone": "Tüm adımlar bitti — güzel iş, her şey kuruldu.",
  "refuseResult": "Bunu inşa edemem. Tom's Dev yalnızca temiz işler içindir — dolandırıcılık yok, kopya siteler yok, kimseyi taklit eden ya da sahte bahanelerle insanların anahtarlarını veya parasını alan hiçbir şey yok. Hiçbir ücret alınmadı. Fikrinizi yanlış anladıysam başka şekilde anlatıp tekrar isteyin."
 },
 "id": {
  "gotIt": "Siap — sebentar. Saya akan memposting jawabannya di sini begitu siap.",
  "stepOf": "Langkah {n} dari {m}",
  "guideIntro": "Ini butuh beberapa langkah yang hanya bisa Anda lakukan — saya akan memandu Anda satu per satu.",
  "guideStop": "Tidak masalah — kita berhenti di sini, dan tidak ada biaya untuk panduan ini. Jika ingin melanjutkannya lagi, cukup minta dan kita mulai ulang langkahnya.",
  "guideNudge": "Tidak usah buru-buru — luangkan waktu untuk langkah itu. Jika sudah selesai, cukup katakan \"selesai\". Jika ingin berhenti, katakan \"berhenti\".",
  "guideAllDone": "Semua langkah selesai — kerja bagus, semuanya sudah siap.",
  "refuseResult": "Saya tidak bisa membuat yang itu. Tom's Dev hanya untuk karya yang bersih — tanpa penipuan, tanpa situs tiruan, tanpa apa pun yang menyamar sebagai orang lain atau mengambil kunci atau uang orang dengan dalih palsu. Tidak ada biaya yang dikenakan. Jika saya salah paham dengan ide Anda, sampaikan dengan cara lain dan minta lagi."
 },
 "vi": {
  "gotIt": "Đã nhận — một lát. Tôi sẽ đăng câu trả lời ở đây ngay khi sẵn sàng.",
  "stepOf": "Bước {n} trên {m}",
  "guideIntro": "Việc này cần vài bước chỉ bạn mới làm được — tôi sẽ hướng dẫn bạn từng bước một.",
  "guideStop": "Không sao — chúng ta dừng ở đây, và hướng dẫn này không bị tính phí. Nếu bạn muốn tiếp tục lại, chỉ cần yêu cầu và chúng ta sẽ bắt đầu lại các bước.",
  "guideNudge": "Đừng vội — cứ từ từ với bước đó. Khi xong, chỉ cần nói \"xong\". Nếu muốn dừng, hãy nói \"dừng\".",
  "guideAllDone": "Tất cả các bước đã xong — làm tốt lắm, mọi thứ đã được cài đặt.",
  "refuseResult": "Tôi không thể xây dựng cái đó. Tom's Dev chỉ dành cho các bản dựng sạch — không lừa đảo, không trang sao chép, không giả mạo ai hoặc lấy khóa hay tiền của mọi người với lý do giả dối. Không tính phí gì cả. Nếu tôi hiểu sai ý tưởng của bạn, hãy diễn đạt lại và yêu cầu lại."
 },
 "th": {
  "gotIt": "รับทราบ — สักครู่ ฉันจะโพสต์คำตอบที่นี่ทันทีที่พร้อม",
  "stepOf": "ขั้นตอน {n} จาก {m}",
  "guideIntro": "งานนี้ต้องใช้ขั้นตอนบางอย่างที่มีเพียงคุณเท่านั้นที่ทำได้ — ฉันจะแนะนำคุณทีละขั้นตอน",
  "guideStop": "ไม่เป็นไร — เราหยุดตรงนี้ และไม่มีการคิดค่าใช้จ่ายสำหรับคำแนะนำนี้ หากคุณอยากทำต่อ แค่บอกมา แล้วเราจะเริ่มขั้นตอนใหม่",
  "guideNudge": "ไม่ต้องรีบ — ใช้เวลากับขั้นตอนนั้นได้เลย เมื่อเสร็จแล้ว พิมพ์ \"เสร็จแล้ว\" หากต้องการหยุด พิมพ์ \"หยุด\"",
  "guideAllDone": "ทุกขั้นตอนเสร็จแล้ว — ทำได้ดีมาก ทุกอย่างตั้งค่าเรียบร้อย",
  "refuseResult": "ฉันสร้างอันนั้นให้ไม่ได้ Tom's Dev สำหรับงานที่สะอาดเท่านั้น — ไม่มีการหลอกลวง ไม่ทำเว็บเลียนแบบ ไม่แอบอ้างเป็นผู้อื่นหรือหลอกเอาคีย์หรือเงินของใคร ไม่มีการคิดค่าบริการ หากฉันเข้าใจไอเดียของคุณผิด โปรดอธิบายใหม่แล้วขออีกครั้ง"
 },
 "ar": {
  "gotIt": "تم الاستلام — لحظة واحدة. سأنشر الإجابة هنا فور جاهزيتها.",
  "stepOf": "الخطوة {n} من {m}",
  "guideIntro": "هذا يحتاج إلى بعض الخطوات التي لا يمكن لأحد أن يقوم بها سواك — سأرشدك خلالها خطوة بخطوة.",
  "guideStop": "لا مشكلة — توقفنا هنا، ولم يُخصم شيء مقابل الدليل. إذا أردت المتابعة لاحقًا، فقط اطلب وسنعيد بدء الخطوات.",
  "guideNudge": "لا تستعجل — خذ وقتك في تلك الخطوة. عندما تنتهي، اكتب «تم» فقط. وإذا أردت التوقف، اكتب «توقف».",
  "guideAllDone": "اكتملت جميع الخطوات — أحسنت، كل شيء جاهز.",
  "refuseResult": "لا أستطيع بناء ذلك. Tom's Dev مخصص للأعمال النظيفة فقط — لا احتيال، لا مواقع مقلدة، لا شيء ينتحل شخصية أحد أو يأخذ مفاتيح الناس أو أموالهم بذرائع كاذبة. لم يتم خصم أي شيء. إذا أسأت فهم فكرتك، أعد صياغتها واطلب من جديد."
 },
 "hi": {
  "gotIt": "मिल गया — एक क्षण। उत्तर तैयार होते ही मैं उसे यहाँ पोस्ट करूँगा।",
  "stepOf": "{m} में से चरण {n}",
  "guideIntro": "इसके लिए कुछ चरण चाहिए जो केवल आप ही कर सकते हैं — मैं आपको एक-एक करके उनके माध्यम से ले चलूँगा।",
  "guideStop": "कोई बात नहीं — हम यहीं रुक गए, और गाइड के लिए कुछ भी शुल्क नहीं लिया गया। यदि आप फिर से शुरू करना चाहें, तो बस कहें और हम चरण फिर से शुरू कर देंगे।",
  "guideNudge": "कोई जल्दी नहीं — उस चरण के लिए समय लें। जब हो जाए, तो बस \"हो गया\" लिखें। यदि रुकना चाहते हैं, तो \"रुको\" लिखें।",
  "guideAllDone": "सभी चरण पूरे हो गए — बहुत बढ़िया, सब कुछ सेट हो गया है।",
  "refuseResult": "मैं वह नहीं बना सकता। Tom's Dev केवल साफ़ कामों के लिए है — कोई धोखाधड़ी नहीं, कोई नकली साइट नहीं, ऐसा कुछ नहीं जो किसी और का रूप धरे या झूठे बहाने से लोगों की चाबियाँ या पैसे ले। कुछ भी शुल्क नहीं लिया गया। यदि मैं आपका विचार गलत समझा हूँ, तो उसे दूसरे शब्दों में कहकर फिर से पूछें।"
 },
 "zh": {
  "gotIt": "收到——稍等片刻。答案一准备好，我就会发在这里。",
  "stepOf": "第 {n} 步，共 {m} 步",
  "guideIntro": "这件事需要几个只能由您亲自完成的步骤 — 我会一步一步带您完成。",
  "guideStop": "没问题 — 我们就停在这里，本指南不收费。如果您想再继续，只需说一声，我们会重新开始这些步骤。",
  "guideNudge": "不用急——这一步慢慢来。完成时只需说“好了”。如果想停下来，就说“停”。",
  "guideAllDone": "所有步骤都完成了 — 做得好，一切就绪。",
  "refuseResult": "这个我不能建。Tom's Dev 只做干净的构建——不做诈骗、不做仿冒网站、不冒充任何人、不以虚假借口获取他人的密钥或钱财。没有收取任何费用。如果我误解了您的想法，请换个说法再问一次。"
 },
 "ja": {
  "gotIt": "承知しました——少々お待ちください。回答の準備ができ次第、ここに投稿します。",
  "stepOf": "ステップ {n} / {m}",
  "guideIntro": "これにはあなたにしかできないステップがいくつか必要です — 一つずつ案内します。",
  "guideStop": "問題ありません — ここで止めます。ガイドの料金はかかっていません。また続けたいときは声をかけてください。ステップを最初からやり直します。",
  "guideNudge": "急がなくて大丈夫です——そのステップはゆっくりどうぞ。終わったら「できました」とだけ言ってください。やめたい場合は「やめる」と言ってください。",
  "guideAllDone": "すべてのステップが完了しました — お疲れさまでした。セットアップ完了です。",
  "refuseResult": "それは作れません。Tom's Dev はクリーンなビルド専用です——詐欺、コピーサイト、他人になりすますもの、虚偽の口実で人のキーやお金を取るものは作りません。料金は発生していません。私があなたのアイデアを誤解していたら、言い方を変えてもう一度お尋ねください。"
 },
 "ko": {
  "gotIt": "접수했습니다 — 잠시만요. 답변이 준비되는 대로 여기에 올리겠습니다.",
  "stepOf": "{m}단계 중 {n}단계",
  "guideIntro": "이 작업에는 회원님만 할 수 있는 단계가 몇 가지 필요합니다 — 하나씩 안내해 드리겠습니다.",
  "guideStop": "괜찮습니다 — 여기서 멈추며, 가이드 요금은 부과되지 않았습니다. 다시 이어서 하고 싶으시면 말씀만 하세요. 단계를 다시 시작하겠습니다.",
  "guideNudge": "서두르지 마세요 — 그 단계는 천천히 하세요. 끝나면 \"완료\"라고만 하세요. 중단하려면 \"중단\"이라고 하세요.",
  "guideAllDone": "모든 단계가 끝났습니다 — 수고하셨습니다. 모두 설정되었습니다.",
  "refuseResult": "그건 만들 수 없습니다. Tom's Dev는 깨끗한 빌드 전용입니다 — 사기, 모방 사이트, 다른 사람을 사칭하거나 거짓된 구실로 사람들의 키나 돈을 가져가는 것은 만들지 않습니다. 청구된 것은 없습니다. 제가 아이디어를 오해했다면 다르게 표현해서 다시 요청해 주세요."
 }
};
const TDA_GUIDE_WORDS = {
 "es": {
  "done": [
   "listo",
   "hecho",
   "hecha",
   "ya",
   "terminé",
   "termine",
   "siguiente",
   "vale",
   "ok",
   "sí",
   "si",
   "he terminado"
  ],
  "stop": [
   "alto",
   "parar",
   "cancelar",
   "detener",
   "basta",
   "olvídalo",
   "olvidalo"
  ]
 },
 "fr": {
  "done": [
   "terminé",
   "termine",
   "fini",
   "prêt",
   "pret",
   "suivant",
   "fait",
   "ok",
   "oui"
  ],
  "stop": [
   "stop",
   "arrête",
   "arrete",
   "annuler",
   "quitter"
  ]
 },
 "de": {
  "done": [
   "fertig",
   "erledigt",
   "weiter",
   "gemacht",
   "ok",
   "ja"
  ],
  "stop": [
   "stopp",
   "stop",
   "abbrechen",
   "beenden",
   "aufhören",
   "aufhoren"
  ]
 },
 "pt": {
  "done": [
   "pronto",
   "feito",
   "terminei",
   "seguinte",
   "concluído",
   "concluido",
   "ok",
   "sim"
  ],
  "stop": [
   "parar",
   "cancelar",
   "sair",
   "chega"
  ]
 },
 "it": {
  "done": [
   "fatto",
   "finito",
   "pronto",
   "avanti",
   "ok",
   "sì",
   "si"
  ],
  "stop": [
   "stop",
   "ferma",
   "fermati",
   "annulla",
   "basta",
   "esci"
  ]
 },
 "nl": {
  "done": [
   "klaar",
   "gedaan",
   "volgende",
   "af",
   "ok",
   "ja"
  ],
  "stop": [
   "stop",
   "stoppen",
   "annuleren",
   "ophouden"
  ]
 },
 "ru": {
  "done": [
   "готово",
   "сделал",
   "сделала",
   "дальше",
   "ок",
   "окей",
   "да"
  ],
  "stop": [
   "стоп",
   "отмена",
   "хватит",
   "выйти",
   "отбой"
  ]
 },
 "uk": {
  "done": [
   "готово",
   "зробив",
   "зробила",
   "далі",
   "ок",
   "окей",
   "так"
  ],
  "stop": [
   "стоп",
   "скасувати",
   "досить",
   "вийти"
  ]
 },
 "tr": {
  "done": [
   "tamam",
   "bitti",
   "hazır",
   "sonraki",
   "yaptım",
   "evet"
  ],
  "stop": [
   "dur",
   "iptal",
   "bırak",
   "vazgeç",
   "durun"
  ]
 },
 "id": {
  "done": [
   "selesai",
   "sudah",
   "berikutnya",
   "siap",
   "oke",
   "ya"
  ],
  "stop": [
   "berhenti",
   "batal",
   "stop",
   "cukup",
   "hentikan"
  ]
 },
 "vi": {
  "done": [
   "xong",
   "xong rồi",
   "rồi",
   "tiếp theo",
   "ok",
   "sẵn sàng"
  ],
  "stop": [
   "dừng",
   "dừng lại",
   "hủy",
   "thôi"
  ]
 },
 "th": {
  "done": [
   "เสร็จแล้ว",
   "เสร็จ",
   "ต่อไป",
   "ตกลง",
   "พร้อม"
  ],
  "stop": [
   "หยุด",
   "ยกเลิก",
   "พอ"
  ]
 },
 "ar": {
  "done": [
   "تم",
   "انتهيت",
   "التالي",
   "جاهز",
   "نعم",
   "حسنًا"
  ],
  "stop": [
   "توقف",
   "إلغاء",
   "قف",
   "إيقاف",
   "كفى"
  ]
 },
 "hi": {
  "done": [
   "हो गया",
   "हो गया है",
   "अगला",
   "ठीक है",
   "तैयार"
  ],
  "stop": [
   "रुको",
   "रद्द करो",
   "बंद करो",
   "रुक जाओ"
  ]
 },
 "zh": {
  "done": [
   "好了",
   "完成了",
   "下一步",
   "好的",
   "完成"
  ],
  "stop": [
   "停",
   "取消",
   "停止",
   "不要了"
  ]
 },
 "ja": {
  "done": [
   "できました",
   "完了",
   "次へ",
   "はい",
   "終わりました",
   "おわりました"
  ],
  "stop": [
   "やめる",
   "キャンセル",
   "中止",
   "ストップ",
   "やめて"
  ]
 },
 "ko": {
  "done": [
   "완료",
   "다 했어요",
   "다음",
   "네",
   "끝났어요",
   "했어요"
  ],
  "stop": [
   "중단",
   "취소",
   "그만",
   "멈춰",
   "중지"
  ]
 }
};
const TDA_STOPWORDS = {
  es: ['el','la','los','las','un','una','de','del','que','quiero','para','por','con','una','mi','mis','me','te','se','en','es','son','hacer','haz','este','esta','esto','gracias','favor','necesito','puedes','página','pagina','juego','hola'],
  fr: ['le','la','les','un','une','des','de','du','que','je','veux','pour','avec','mon','ma','mes','est','sont','faire','merci','vous','nous','une','page','jeu','bonjour','sil'],
  de: ['der','die','das','ein','eine','und','ich','möchte','mochte','für','fur','mit','mein','meine','ist','sind','machen','bitte','danke','haben','werden','seite','spiel','hallo'],
  pt: ['o','a','os','as','um','uma','de','do','da','que','eu','quero','para','com','meu','minha','é','são','fazer','obrigado','obrigada','por','página','pagina','jogo','olá','ola'],
  it: ['il','lo','la','i','le','un','una','di','che','io','voglio','per','con','mio','mia','è','sono','fare','grazie','prego','pagina','gioco','ciao'],
  nl: ['de','het','een','ik','wil','voor','met','mijn','is','zijn','maken','dank','alsjeblieft','pagina','spel','hallo','graag'],
  ru: ['я','хочу','мне','для','мой','моя','моё','это','что','сделать','сделай','пожалуйста','спасибо','страницу','страница','игру','привет','нужна','нужен'],
  uk: ['я','хочу','мені','для','мій','моя','моє','це','що','зроби','зробити','будь','ласка','дякую','сторінку','сторінка','гру','привіт','потрібна','потрібен'],
  tr: ['bir','ben','için','icin','istiyorum','benim','bu','ne','yap','yapar','misin','lütfen','lutfen','teşekkürler','tesekkurler','sayfa','oyun','merhaba'],
  id: ['saya','aku','ingin','mau','untuk','saya','ini','itu','yang','dan','buat','buatkan','tolong','terima','kasih','halaman','halaman','permainan','halo'],
  vi: ['tôi','toi','muốn','muon','cho','của','cua','một','mot','này','trang','trò','tro','chơi','choi','cảm','cam','ơn','on','xin','chào','chao','làm','lam'],
  th: [], ar: [], hi: [], zh: [], ja: [], ko: [],
};
function tdaDetectLang(text) {
  const t = String(text || '');
  if (!t.trim()) return 'en';
  if (/[぀-ヿ]/.test(t)) return 'ja';
  if (/[가-힯]/.test(t)) return 'ko';
  if (/[฀-๿]/.test(t)) return 'th';
  if (/[ऀ-ॿ]/.test(t)) return 'hi';
  if (/[؀-ۿ]/.test(t)) return 'ar';
  if (/[Ѐ-ӿ]/.test(t)) return /[іїєґІЇЄҐ]/.test(t) ? 'uk' : 'ru';
  if (/[一-鿿]/.test(t)) return 'zh';
  const words = t.toLowerCase().replace(/[^\p{L}\s']/gu, ' ').split(/\s+/).filter(Boolean);
  const set = new Set(words);
  let best = 'en', bestN = 0, secondN = 0;
  for (const lang of Object.keys(TDA_STOPWORDS)) {
    const list = TDA_STOPWORDS[lang];
    if (!list.length) continue;
    let n = 0;
    for (const w of list) if (set.has(w)) n++;
    if (n > bestN) { secondN = bestN; bestN = n; best = lang; }
    else if (n > secondN) secondN = n;
  }
  if (bestN >= 2 && bestN > secondN) return best;
  if (/[ñ¿¡]/.test(t)) return 'es';
  if (/[ãõ]/.test(t)) return 'pt';
  if (/ß/.test(t)) return 'de';
  if (/[ğışİ]/.test(t)) return 'tr';
  if (/[đơư]/.test(t)) return 'vi';
  if (bestN >= 2) return best;
  return 'en';
}
/* The seat's CHOSEN language (the top selector in the app):
   a submitted value counts only when it names a real string
   table; anything else is no choice at all. */
function tdaChosenLang(v) {
  const l = String(v || '').trim().toLowerCase();
  return Object.prototype.hasOwnProperty.call(TDA_I18N, l) ? l : '';
}
function TDA_S(lang) {
  const base = TDA_I18N.en;
  const t = TDA_I18N[lang] || {};
  const out = {};
  for (const k of Object.keys(base)) out[k] = (typeof t[k] === 'string' && t[k]) ? t[k] : base[k];
  return out;
}
function tdaFill(tpl, vars) {
  return String(tpl || '').replace(/\{(\w+)\}/g, (m, k) => (vars && vars[k] !== undefined ? String(vars[k]) : m));
}
function tdaWordsHit(low, words) {
  if (!words || !words.length) return false;
  const toks = low.split(/[^\p{L}\p{N}]+/u).filter(Boolean);
  for (const w of words) {
    if (toks.indexOf(w) >= 0) return true;
    if ((w.indexOf(' ') >= 0 || /[぀-ヿ가-힯฀-๿一-鿿]/.test(w)) && low.indexOf(w) >= 0) return true;
  }
  return false;
}

/* Advance a guided-steps conversation by one seat reply.
   The reply always lands in the trail. "done" (or ok / yes /
   ready / finished) moves to the next step; the last step
   completes the row through the shared finish path at the
   guide's agreed charge. "stop" / "cancel" ends the guide
   with no charge. Anything else gets ONE gentle nudge per
   step — the seat may be mid-step or asking a question, and
   the builder never spams. Returns {finished}. */
async function tdaGuideAdvance(row, text) {
  let steps = [];
  try { const a = JSON.parse(String(row.guideSteps || '')); if (Array.isArray(a)) steps = a.map(s => String(s)); } catch (e) { /* no steps = finish below */ }
  /* The English twin of the steps, stored when the guide was
     created — owner-view renderings for the step entries
     this function appends. Absent on older guides; the
     runner's sweep covers those by translation instead. */
  let stepsEn = [];
  try { const a = JSON.parse(String(row.guideStepsEn || '')); if (Array.isArray(a)) stepsEn = a.map(s => String(s)); } catch (e) { /* no English steps */ }
  const idx = Math.max(0, parseInt(row.guideIdx, 10) || 0);
  const entries = [{ k: 'reply', m: text }];
  const low = text.trim().toLowerCase();
  const now = String(Date.now());
  /* The guide speaks the language the seat started it in
     (stored on the row when the guide was created; rows from
     before the fix fall back to detecting it from the
     original request). Done/stop words work in that language
     AND in English. */
  const glang = String(row.guideLang || '') || tdaDetectLang(row.text || '');
  const gs = TDA_S(glang);
  const gwords = TDA_GUIDE_WORDS[glang] || {};
  if (/\b(stop|cancel|quit)\b/.test(low) || tdaWordsHit(low, gwords.stop)) {
    const result = gs.guideStop;
    await upstashPipeline([['HSET', 'tda:req:' + row.id, 'plog', tdaPlogJson(row.plog, entries), 'buildState', 'done', 'updated', now]]);
    await tdaFinishRow(row, result, 0, glang !== 'en' ? TDA_S('en').guideStop : undefined);
    return { finished: true };
  }
  const doneLike = /^(done|ok|okay|yes|ready|finished|did it|next)[.! ]*$/.test(low) || /\bdone\b/.test(low) || tdaWordsHit(low, gwords.done);
  if (doneLike) {
    const nidx = idx + 1;
    if (nidx >= steps.length) {
      const charge = Math.max(0, parseInt(row.guideCharge, 10) || 0);
      const result = String(row.guideDone || '') || gs.guideAllDone;
      const resultEn = String(row.guideDoneEn || '') || (glang !== 'en' ? TDA_S('en').guideAllDone : '');
      await upstashPipeline([['HSET', 'tda:req:' + row.id, 'plog', tdaPlogJson(row.plog, entries), 'buildState', 'done', 'updated', now]]);
      await tdaFinishRow(row, result, charge, resultEn || undefined);
      return { finished: true };
    }
    const stepEnt = { k: 'step', m: tdaFill(gs.stepOf, { n: nidx + 1, m: steps.length }) + ': ' + steps[nidx] };
    if (stepsEn[nidx]) stepEnt.e = tdaFill(TDA_S('en').stepOf, { n: nidx + 1, m: steps.length }) + ': ' + stepsEn[nidx];
    entries.push(stepEnt);
    await upstashPipeline([['HSET', 'tda:req:' + row.id, 'plog', tdaPlogJson(row.plog, entries), 'guideIdx', String(nidx), 'guideNudged', '', 'updated', now]]);
    return { finished: false };
  }
  if (String(row.guideNudged || '') !== String(idx)) {
    const nudgeEnt = { k: 'builder', m: gs.guideNudge };
    if (glang !== 'en') nudgeEnt.e = TDA_S('en').guideNudge;
    entries.push(nudgeEnt);
    await upstashPipeline([['HSET', 'tda:req:' + row.id, 'plog', tdaPlogJson(row.plog, entries), 'guideNudged', String(idx), 'updated', now]]);
  } else {
    await upstashPipeline([['HSET', 'tda:req:' + row.id, 'plog', tdaPlogJson(row.plog, entries), 'updated', now]]);
  }
  return { finished: false };
}

/* ================= FROG ARENA 2 — NFT SHOP ORDERS =================
   The game page calls /api/luna-games?fa2=1 directly. The shop sells
   Frog Arena Warriors (FAW) NFTs: the buyer picks a warrior + price
   tier in the page, registers an order here (fa2Order — public,
   grants NOTHING), pays LUNC to Goliath's wallet from their own
   wallet with memo `FA2-BUY <ref>`, and reports the tx hash
   (fa2OrderPaid — a claim only). The mint service (builder-runner
   fa2-mint.mjs) verifies every order against the chain itself —
   the tdaRenewSubmit discipline: tx success, bank-send legs read
   from the tx, recipient = Goliath, sender = the order's buyer,
   amount >= the tier, memo exact, <= 7 days old, ref single-use —
   and only then mints. Order state lives at fa2:order:<ref> (JSON),
   newest-first refs at fa2:orders, shop state at fa2:settings
   ({paused, contract}). The pause flag is the shop's Emergency
   Stop: the page checks it on load and before every buy, the mint
   service checks it every pass; unset settings = PAUSED (fail
   closed). Service actions ride the builder-runner gate
   (tdaBuilderGate, body.bhash — the runner's own secret). The endpoint holds no keys and signs
   nothing. */
const FA2_WARRIORS = ['king', 'queen', 'princess', 'ember', 'shadow', 'captain', 'nightblade', 'soldier', 'starknight', 'brawler'];
const FA2_SETTINGS_KEY = 'fa2:settings';
const FA2_ORDER_TTL_SEC = 30 * 24 * 3600;

async function fa2GetSettings() {
  const out = await upstashPipeline([['GET', FA2_SETTINGS_KEY]]);
  let s = null;
  try { s = JSON.parse((out[0] && out[0].result) || 'null'); } catch (e) { s = null; }
  if (!s || typeof s !== 'object') s = {};
  return { paused: s.paused !== false, contract: String(s.contract || '') };
}
async function fa2GetOrder(ref) {
  const out = await upstashPipeline([['GET', 'fa2:order:' + ref]]);
  try { return JSON.parse((out[0] && out[0].result) || 'null'); } catch (e) { return null; }
}
async function fa2SaveOrder(o) {
  await upstashPipeline([['SET', 'fa2:order:' + o.ref, JSON.stringify(o), 'EX', FA2_ORDER_TTL_SEC]]);
}
function fa2PublicOrder(o) {
  if (!o) return null;
  return { ref: o.ref, status: o.status, warrior: o.warrior, tierLunc: Math.round((+o.tierUluna || 0) / 1e6),
    payTx: o.payTx || '', tokenId: o.tokenId || '', mintTx: o.mintTx || '', error: o.error || '' };
}

export async function frogArena2Handler(req, res) {
  if (req.method !== 'GET' && req.method !== 'POST') {
    return res.status(405).json({ ok: false, error: 'method not allowed' });
  }
  if (!process.env.NEONRUSH_UPSTASH_URL || !process.env.NEONRUSH_UPSTASH_TOKEN) {
    return res.status(500).json({ ok: false, unavailable: true, error: 'storage not configured' });
  }
  res.setHeader('Cache-Control', 'no-store');
  let body = req.body;
  if (typeof body === 'string') { try { body = JSON.parse(body); } catch (e) { body = null; } }
  if (req.method === 'GET' || !body || typeof body !== 'object') body = {};
  const action = String(body.action || (req.method === 'GET' ? 'fa2ShopState' : ''));
  try {
    if (action === 'fa2ShopState') {
      const s = await fa2GetSettings();
      return res.status(200).json({ ok: true, paused: s.paused, contract: s.contract });
    }
    if (action === 'fa2ShopSet') {
      if (!(await tdaBuilderGate(req, res, 'fa2shop', body))) return undefined;
      const s = await fa2GetSettings();
      if (body.paused !== undefined) s.paused = !!body.paused;
      if (body.contract !== undefined) {
        const c = String(body.contract || '').trim().toLowerCase();
        if (c && !/^terra1[a-z0-9]{38}([a-z0-9]{20})?$/.test(c)) return res.status(400).json({ ok: false, error: 'bad contract address' });
        s.contract = c;
      }
      await upstashPipeline([['SET', FA2_SETTINGS_KEY, JSON.stringify(s)]]);
      return res.status(200).json({ ok: true, paused: s.paused, contract: s.contract });
    }
    if (action === 'fa2Order') {
      const ref = String(body.ref || '').trim().toLowerCase();
      const buyer = String(body.buyer || '').trim().toLowerCase();
      const warrior = String(body.warrior || '').trim().toLowerCase();
      const tierLunc = Number(body.tierLunc);
      if (!/^[a-z0-9][a-z0-9-]{7,47}$/.test(ref)) return res.status(400).json({ ok: false, error: 'bad order ref' });
      if (!tdaTerraAddr(buyer)) return res.status(400).json({ ok: false, error: 'bad buyer wallet' });
      if (!FA2_WARRIORS.includes(warrior)) return res.status(400).json({ ok: false, error: 'unknown warrior' });
      if (!Number.isInteger(tierLunc) || tierLunc < 1 || tierLunc > 1000000) return res.status(400).json({ ok: false, error: 'bad tier' });
      const existing = await fa2GetOrder(ref);
      if (existing) {
        if (existing.buyer === buyer && existing.warrior === warrior && +existing.tierUluna === tierLunc * 1000000) {
          return res.status(200).json({ ok: true, order: fa2PublicOrder(existing) });
        }
        return res.status(409).json({ ok: false, error: 'that order ref is already used for a different order' });
      }
      const o = { ref, buyer, warrior, tierUluna: tierLunc * 1000000, status: 'awaiting', payTx: '', tokenId: '', mintTx: '', error: '', created: Date.now() };
      await fa2SaveOrder(o);
      await upstashPipeline([['LPUSH', 'fa2:orders', ref], ['LTRIM', 'fa2:orders', 0, 499]]);
      return res.status(200).json({ ok: true, order: fa2PublicOrder(o) });
    }
    if (action === 'fa2OrderPaid') {
      const ref = String(body.ref || '').trim().toLowerCase();
      const txhash = String(body.txHash || '').trim().toUpperCase();
      if (!/^[0-9A-F]{64}$/.test(txhash)) return res.status(400).json({ ok: false, error: 'bad tx hash' });
      const o = await fa2GetOrder(ref);
      if (!o) return res.status(404).json({ ok: false, error: 'order not found' });
      if (o.status === 'awaiting' || o.status === 'paid-claimed') {
        /* the hash is a claim only — the mint service verifies the
           payment from the chain itself, so letting the buyer correct
           a mistyped hash before any mint is safe. */
        o.payTx = txhash; o.status = 'paid-claimed';
        await fa2SaveOrder(o);
      }
      return res.status(200).json({ ok: true, order: fa2PublicOrder(o) });
    }
    if (action === 'fa2OrderStatus') {
      const ref = String(body.ref || '').trim().toLowerCase();
      const o = await fa2GetOrder(ref);
      if (!o) return res.status(404).json({ ok: false, error: 'order not found' });
      return res.status(200).json({ ok: true, order: fa2PublicOrder(o) });
    }
    if (action === 'fa2Orders') {
      if (!(await tdaBuilderGate(req, res, 'fa2shop', body))) return undefined;
      const listOut = await upstashPipeline([['LRANGE', 'fa2:orders', 0, 99]]);
      const refs = (listOut[0] && listOut[0].result) || [];
      const orders = [];
      for (const ref of refs) {
        const o = await fa2GetOrder(ref);
        if (o) orders.push(o);
      }
      return res.status(200).json({ ok: true, orders });
    }
    if (action === 'fa2OrderDone') {
      if (!(await tdaBuilderGate(req, res, 'fa2shop', body))) return undefined;
      const ref = String(body.ref || '').trim().toLowerCase();
      const o = await fa2GetOrder(ref);
      if (!o) return res.status(404).json({ ok: false, error: 'order not found' });
      o.status = 'done'; o.tokenId = String(body.tokenId || ''); o.mintTx = String(body.mintTx || '').toUpperCase(); o.doneAt = Date.now();
      await fa2SaveOrder(o);
      return res.status(200).json({ ok: true, order: fa2PublicOrder(o) });
    }
    if (action === 'fa2OrderFail') {
      if (!(await tdaBuilderGate(req, res, 'fa2shop', body))) return undefined;
      const ref = String(body.ref || '').trim().toLowerCase();
      const o = await fa2GetOrder(ref);
      if (!o) return res.status(404).json({ ok: false, error: 'order not found' });
      if (o.status !== 'done') {
        o.status = 'failed'; o.error = String(body.error || 'payment could not be verified').slice(0, 140);
        await fa2SaveOrder(o);
      }
      return res.status(200).json({ ok: true, order: fa2PublicOrder(o) });
    }
    return res.status(400).json({ ok: false, error: 'unknown action' });
  } catch (e) {
    console.error('fa2 handler failed', e && e.message);
    return res.status(500).json({ ok: false, unavailable: true, error: 'service unavailable' });
  }
}

/* Parse an optional token amount (create / adjust / usage).
   Returns a non-negative integer, or null when malformed. */
function tdaParseTokens(v, fallback) {
  if (v === undefined || v === null || v === '') return fallback;
  const n = Number(v);
  if (!Number.isFinite(n) || Math.floor(n) !== n || n < 0 || n > TDA_TOKENS_MAX) return null;
  return n;
}

export async function tdaHandler(req, res) {
  if (req.method !== 'GET' && req.method !== 'POST') {
    return res.status(405).json({ ok: false, error: 'method not allowed' });
  }
  if (!process.env.NEONRUSH_UPSTASH_URL || !process.env.NEONRUSH_UPSTASH_TOKEN) {
    return res.status(500).json({ ok: false, unavailable: true, error: 'storage not configured' });
  }
  res.setHeader('Cache-Control', 'no-store');

  if (req.method === 'GET') {
    try {
      const stored = await tdaStoredOwner();
      const partnerSet = await tdaAnyActiveSeat();
      return res.status(200).json({ ok: true, ownerSet: stored.ownerSet, partnerSet });
    } catch (e) {
      console.error('tda state read failed', e && e.message);
      return res.status(500).json({ ok: false, unavailable: true, error: 'service unavailable' });
    }
  }

  // POST
  let body = req.body;
  if (typeof body === 'string') { try { body = JSON.parse(body); } catch (e) { body = null; } }
  if (!body || typeof body !== 'object') return res.status(400).json({ ok: false, error: 'bad request' });
  const action = String(body.action || '');
  const tag = tdaIpTag(req);

  try {
    if (action === 'tdaCodeCheck') {
      const auth = await tdaAuthTier(req, res, tag, String(body.hash || '').toLowerCase(), 'any');
      if (!auth) return undefined;
      if (auth.tier === 'owner') return res.status(200).json({ ok: true, tier: 'owner' });
      const s = tdaPublicSeat(auth.seat);
      return res.status(200).json({ ok: true, tier: 'seat', seat: { id: s.id, name: s.name, tokens: s.tokens, used: s.used, wallet: s.wallet } });
    }

    /* Owner-code changes — owner only. tdaCodeSet and tdaRotate
       both rotate the OWNER code (seat codes live on the seats
       and are managed with tdaSeatCode). Rotating deletes the v1
       legacy key so only tda:ownercode rules afterwards. */
    if (action === 'tdaCodeSet' || action === 'tdaRotate') {
      const currentHash = String(body.currentHash || '').toLowerCase();
      const newHash = String(body.newHash || '').toLowerCase();
      if (!tdaIsHash(newHash)) return res.status(400).json({ ok: false, error: 'bad hash' });
      const auth = await tdaAuthTier(req, res, tag, currentHash, 'owner');
      if (!auth) return undefined;
      /* Collision guard (same as every seat-code path): the
         owner code must never BE a seat's code — that would
         silently promote the seat to owner — and never the
         bootstrap hash, which is a publicly known starter. */
      if (tdaHashEq(newHash, TDA_BOOTSTRAP_HASH)) {
        return res.status(200).json({ ok: false, error: 'that code is already in use' });
      }
      const clash = await upstashPipeline([['GET', 'tda:seatbycode:' + newHash]]);
      if (clash[0] && clash[0].result) {
        return res.status(200).json({ ok: false, error: 'that code is already in use' });
      }
      await upstashPipeline([['SET', TDA_OWNER_KEY, newHash], ['DEL', TDA_LEGACY_KEY]]);
      return res.status(200).json({ ok: true, set: true, ownerSet: true });
    }

    if (action === 'tdaSeatCreate') {
      const auth = await tdaAuthTier(req, res, tag, String(body.hash || '').toLowerCase(), 'owner');
      if (!auth) return undefined;
      const stored = await tdaStoredOwner();
      if (!stored.ownerSet) {
        return res.status(200).json({ ok: false, error: 'set the owner code first' });
      }
      const name = String(body.name || '').trim().slice(0, TDA_NAME_MAX);
      if (!name) return res.status(400).json({ ok: false, error: 'seat needs a name' });
      const newHash = String(body.newHash || '').toLowerCase();
      if (!tdaIsHash(newHash)) return res.status(400).json({ ok: false, error: 'bad hash' });
      if (tdaHashEq(newHash, stored.ownerHash) || tdaHashEq(newHash, TDA_BOOTSTRAP_HASH)) {
        return res.status(200).json({ ok: false, error: 'that code is already in use' });
      }
      const clash = await upstashPipeline([['GET', 'tda:seatbycode:' + newHash]]);
      if (clash[0] && clash[0].result) {
        return res.status(200).json({ ok: false, error: 'that code is already in use' });
      }
      /* Starting balance = the pool share (25% of the monthly
         pool, or the 100,000 default) — the owner adjusts the
         balance afterwards with tdaSeatTokens. */
      const settings = await tdaGetSettings();
      const tokens = settings.seatTokens;
      const now = Date.now();
      const id = 's' + now.toString(36) + crypto.randomBytes(4).toString('hex');
      if (!(await tdaClaimCode(newHash, id))) {
        return res.status(200).json({ ok: false, error: 'that code is already in use' });
      }
      await upstashPipeline([
        ['HSET', 'tda:seat:' + id, 'id', id, 'name', name, 'codehash', newHash, 'tokens', String(tokens), 'used', '0', 'reqs', '0', 'active', '1', 'created', String(now), 'paidThrough', String(now + TDA_RENEW_PERIOD_MS)],
        ['LPUSH', 'tda:seats', id],
      ]);
      const seat = tdaPublicSeat({ id, name, tokens: String(tokens), used: '0', reqs: '0', active: '1', created: String(now), paidThrough: String(now + TDA_RENEW_PERIOD_MS) });
      return res.status(200).json({ ok: true, seat });
    }

    /* ONE PRESS: create the next seat with a server-generated
       entry code. The plain code rides back in THIS response
       only — afterwards only its hash exists anywhere. */
    if (action === 'tdaSeatQuickCreate') {
      const auth = await tdaAuthTier(req, res, tag, String(body.hash || '').toLowerCase(), 'owner');
      if (!auth) return undefined;
      const stored = await tdaStoredOwner();
      if (!stored.ownerSet) {
        return res.status(200).json({ ok: false, error: 'set the owner code first' });
      }
      const name = String(body.name || '').trim().slice(0, TDA_NAME_MAX);
      const gen = await tdaFreshGenCode(stored.ownerHash);
      if (!gen) return res.status(500).json({ ok: false, error: 'could not generate a code — try again' });
      const settings = await tdaGetSettings();
      const tokens = settings.seatTokens;
      const now = Date.now();
      const id = 's' + now.toString(36) + crypto.randomBytes(4).toString('hex');
      if (!(await tdaClaimCode(gen.hash, id))) {
        return res.status(500).json({ ok: false, error: 'could not generate a code — try again' });
      }
      await upstashPipeline([
        ['HSET', 'tda:seat:' + id, 'id', id, 'name', name, 'codehash', gen.hash, 'tokens', String(tokens), 'used', '0', 'reqs', '0', 'active', '1', 'created', String(now), 'paidThrough', String(now + TDA_RENEW_PERIOD_MS)],
        ['LPUSH', 'tda:seats', id],
      ]);
      const seat = tdaPublicSeat({ id, name, tokens: String(tokens), used: '0', reqs: '0', active: '1', created: String(now), paidThrough: String(now + TDA_RENEW_PERIOD_MS) });
      return res.status(200).json({ ok: true, seat, code: gen.plain, shownOnce: true });
    }

    /* Owner settings: TOKENS PER SEAT. An empty value clears
       the setting (back to the 120,000,000 default). */
    if (action === 'tdaSettingsSet') {
      const auth = await tdaAuthTier(req, res, tag, String(body.hash || '').toLowerCase(), 'owner');
      if (!auth) return undefined;
      const raw = body.seatTokens;
      if (raw === '' || raw === null || raw === undefined) {
        await upstashPipeline([['HSET', 'tda:settings', 'seatTokens', '']]);
      } else {
        const n = tdaParseTokens(raw, null);
        if (n === null || n <= 0) return res.status(400).json({ ok: false, error: 'bad token amount' });
        await upstashPipeline([['HSET', 'tda:settings', 'seatTokens', String(n)]]);
      }
      const settings = await tdaGetSettings();
      return res.status(200).json({ ok: true, settings });
    }

    if (action === 'tdaSeatList') {
      const auth = await tdaAuthTier(req, res, tag, String(body.hash || '').toLowerCase(), 'owner');
      if (!auth) return undefined;
      const settings = await tdaGetSettings();
      const out = await upstashPipeline([['LRANGE', 'tda:seats', 0, -1]]);
      const ids = (out[0] && out[0].result) || [];
      if (!ids.length) return res.status(200).json({ ok: true, seats: [], settings, ownerSeen: 0 });
      const rows = await upstashPipeline(ids.map(id => ['HGETALL', 'tda:seat:' + id]));
      const seats = rows.map(r => tdaPublicSeat(tdaHashToObj(r && r.result))).filter(s => s.id);
      /* Owner people-list (Nov 18): per-seat last-seen stamps so
         the owner's Chat opens as a by-person inbox with a NEW
         marker per person. Stamps live at tda:ownerseen:<seatId>
         ('owner' covers the owner's own rows); written only by
         tdaSeenMark, owner tier only. */
      const seenRows = await upstashPipeline(seats.map(s => ['GET', 'tda:ownerseen:' + s.id]).concat([['GET', 'tda:ownerseen:owner']]));
      seats.forEach((s, i) => { s.seen = Number((seenRows[i] && seenRows[i].result) || 0) || 0; });
      const ownerSeen = Number((seenRows[seats.length] && seenRows[seats.length].result) || 0) || 0;
      /* Owner people-list (Nov 20): per-seat last activity from the
         request index, so the Chat people list can sort by it and
         show it even for a seat whose rows sit outside the thread
         payload window. Read-only — no seat data is written. */
      const lastBySeat = {};
      const idxOut = await upstashPipeline([['LRANGE', 'tda:reqs', 0, 199]]);
      const idxIds = (idxOut[0] && idxOut[0].result) || [];
      if (idxIds.length) {
        const idxRows = await upstashPipeline(idxIds.map(id => ['HGETALL', 'tda:req:' + id]));
        for (const r of idxRows) {
          const o = tdaHashToObj(r && r.result);
          if (!o.id) continue;
          const sid = String(o.seatId || 'owner');
          const ts = Math.max(Number(o.updated) || 0, Number(o.created) || 0);
          if (ts > (lastBySeat[sid] || 0)) lastBySeat[sid] = ts;
        }
      }
      seats.forEach(s => { s.lastActive = lastBySeat[s.id] || 0; });
      return res.status(200).json({ ok: true, seats, settings, ownerSeen, ownerLast: lastBySeat.owner || 0 });
    }

    if (action === 'tdaSeenMark') {
      const auth = await tdaAuthTier(req, res, tag, String(body.hash || '').toLowerCase(), 'owner');
      if (!auth) return undefined;
      const seatId = String(body.seatId || '');
      if (seatId !== 'owner' && !/^s[a-z0-9]{6,24}$/.test(seatId)) return res.status(400).json({ ok: false, error: 'bad seat' });
      const seen = Date.now();
      await upstashPipeline([['SET', 'tda:ownerseen:' + seatId, String(seen)]]);
      return res.status(200).json({ ok: true, seen });
    }

    if (action === 'tdaSeatCode' || action === 'tdaSeatTokens' || action === 'tdaSeatRemove' || action === 'tdaSeatName' || action === 'tdaSeatWallet') {
      const auth = await tdaAuthTier(req, res, tag, String(body.hash || '').toLowerCase(), 'owner');
      if (!auth) return undefined;
      const seatId = String(body.seatId || '');
      const seat = await tdaGetSeat(seatId);
      if (!seat) return res.status(404).json({ ok: false, error: 'no such seat' });

      if (action === 'tdaSeatRemove') {
        /* Archive, never delete: the seat row and its thread stay
           on record; the code stops resolving at once. */
        await upstashPipeline([
          ['HSET', 'tda:seat:' + seatId, 'active', '0'],
          ['DEL', 'tda:seatbycode:' + String(seat.codehash || '')],
        ]);
        return res.status(200).json({ ok: true, seat: tdaPublicSeat({ ...seat, active: '0' }) });
      }

      if (action === 'tdaSeatName') {
        const name = String(body.name || '').trim().slice(0, TDA_NAME_MAX);
        if (!name) return res.status(400).json({ ok: false, error: 'seat needs a name' });
        await upstashPipeline([['HSET', 'tda:seat:' + seatId, 'name', name]]);
        return res.status(200).json({ ok: true, seat: tdaPublicSeat({ ...seat, name }) });
      }

      if (action === 'tdaSeatWallet') {
        /* The owner binds (or clears) the seat's Terra wallet —
           the only wallet whose sends can renew this seat. An
           empty value clears the binding; the seat's first
           successful renewal binds its wallet again. */
        const wallet = String(body.wallet || '').trim().toLowerCase();
        if (wallet !== '' && !tdaTerraAddrStrict(wallet)) {
          return res.status(400).json({ ok: false, error: 'that wallet address does not look right — check it character by character' });
        }
        if (wallet !== '') {
          const ownerSeat = await tdaWalletOwnerSeat(wallet);
          if (ownerSeat && ownerSeat !== seatId) {
            return res.status(200).json({ ok: false, error: 'that wallet is already on another seat' });
          }
        }
        await upstashPipeline([['HSET', 'tda:seat:' + seatId, 'wallet', wallet]]);
        return res.status(200).json({ ok: true, seat: tdaPublicSeat({ ...seat, wallet }) });
      }

      if (action === 'tdaSeatCode') {
        /* generate: true — the server makes a fresh code and
           returns the plain code ONCE, like quick-create. A
           typed rotation (newHash) never returns a plain code. */
        if (body.generate === true) {
          const stored = await tdaStoredOwner();
          const gen = await tdaFreshGenCode(stored.ownerHash);
          if (!gen) return res.status(500).json({ ok: false, error: 'could not generate a code — try again' });
          if (!(await tdaClaimCode(gen.hash, seatId))) {
            return res.status(500).json({ ok: false, error: 'could not generate a code — try again' });
          }
          await upstashPipeline([
            ['DEL', 'tda:seatbycode:' + String(seat.codehash || '')],
            ['HSET', 'tda:seat:' + seatId, 'codehash', gen.hash],
          ]);
          return res.status(200).json({ ok: true, seat: tdaPublicSeat(seat), code: gen.plain, shownOnce: true });
        }
        const newHash = String(body.newHash || '').toLowerCase();
        if (!tdaIsHash(newHash)) return res.status(400).json({ ok: false, error: 'bad hash' });
        const stored = await tdaStoredOwner();
        if ((stored.ownerHash && tdaHashEq(newHash, stored.ownerHash)) || tdaHashEq(newHash, TDA_BOOTSTRAP_HASH)) {
          return res.status(200).json({ ok: false, error: 'that code is already in use' });
        }
        const clash = await upstashPipeline([['GET', 'tda:seatbycode:' + newHash]]);
        if (clash[0] && clash[0].result && clash[0].result !== seatId) {
          return res.status(200).json({ ok: false, error: 'that code is already in use' });
        }
        if (!(await tdaClaimCode(newHash, seatId))) {
          return res.status(200).json({ ok: false, error: 'that code is already in use' });
        }
        await upstashPipeline([
          ['DEL', 'tda:seatbycode:' + String(seat.codehash || '')],
          ['HSET', 'tda:seat:' + seatId, 'codehash', newHash],
        ]);
        return res.status(200).json({ ok: true, seat: tdaPublicSeat(seat) });
      }

      /* tdaSeatTokens: mode 'set' (exact balance) or 'add'
         (top-up / adjust by a signed amount). Result clamps at 0. */
      const mode = body.mode === 'add' ? 'add' : 'set';
      const amount = tdaParseTokens(body.amount, null);
      if (amount === null && mode === 'set') return res.status(400).json({ ok: false, error: 'bad token amount' });
      if (mode === 'add') {
        const delta = Number(body.amount);
        if (!Number.isFinite(delta) || Math.floor(delta) !== delta || Math.abs(delta) > TDA_TOKENS_MAX) {
          return res.status(400).json({ ok: false, error: 'bad token amount' });
        }
        const out = await upstashPipeline([['HINCRBY', 'tda:seat:' + seatId, 'tokens', delta]]);
        let bal = (out[0] && out[0].result) || 0;
        if (bal < 0) { await upstashPipeline([['HSET', 'tda:seat:' + seatId, 'tokens', '0']]); bal = 0; }
        return res.status(200).json({ ok: true, seat: tdaPublicSeat({ ...seat, tokens: String(bal) }) });
      }
      await upstashPipeline([['HSET', 'tda:seat:' + seatId, 'tokens', String(amount)]]);
      return res.status(200).json({ ok: true, seat: tdaPublicSeat({ ...seat, tokens: String(amount) }) });
    }

    if (action === 'tdaNew') {
      const auth = await tdaAuthTier(req, res, tag, String(body.hash || '').toLowerCase(), 'any');
      if (!auth) return undefined;
      const text = String(body.text || '').trim().slice(0, TDA_TEXT_MAX);
      if (!text) return res.status(400).json({ ok: false, error: 'empty message' });
      /* v3 live builder: only posts carrying the flag (the
         preview page) are builder-managed; everything else
         keeps the exact v2 queue behaviour. */
      const wantBuilder = body.liveBuilder === true;
      /* The language the seat picked in the app's top
         selector, carried on the submission: it governs
         everything the seat sees back (the ack, the
         questionnaire, the replies, the build). Invalid
         values are ignored, never stored. */
      const submittedLang = tdaChosenLang(body.lang);
      /* Send idempotency: the page tags each composed message
         with a client key and reuses it across retries, so a
         flaky network can never post the same message twice
         (no double rows, no double guide advances). */
      const clientKey = (typeof body.clientKey === 'string' && /^[A-Za-z0-9:_-]{8,80}$/.test(body.clientKey)) ? body.clientKey : '';
      const ckSeat = auth.tier === 'seat' ? String(auth.seat.id) : String(body.seatId || 'owner');
      const ckKey = (wantBuilder && clientKey)
        ? 'tda:ck:' + crypto.createHash('sha256').update(ckSeat + '|' + clientKey).digest('hex')
        : '';
      if (ckKey) {
        const seen = await upstashPipeline([['GET', ckKey]]);
        if (seen[0] && seen[0].result) {
          return res.status(200).json({ ok: true, id: String(seen[0].result), deduped: true });
        }
      }
      let seatId = 'owner';
      let ownerAdded = false;
      if (auth.tier === 'seat') {
        /* Add-project is an owner-side control: a seat aiming
           the flag at ANOTHER seat is refused outright. (A
           seat's own posts always land in its own thread —
           the seatId field is ignored for seats below.) */
        if (body.addProject === true && body.seatId && String(body.seatId) !== String(auth.seat.id)) {
          return res.status(200).json({ ok: false, error: 'not your seat — a seat can only add projects to itself' });
        }
        /* No weekly clock: the balance is the only gate.
           At 0 the seat can read everything but cannot post —
           a refill is the way back in. */
        const bal = parseInt(auth.seat.tokens, 10) || 0;
        if (bal <= 0) {
          return res.status(200).json({ ok: false, noTokens: true, error: 'out of tokens — refill to keep building' });
        }
        seatId = String(auth.seat.id);
        /* Guided-steps continuation: if this seat has an open
           guided row, this message is their reply to the
           current step — it advances that conversation and
           never becomes a new request. */
        if (wantBuilder && body.addProject !== true) {
          const grow = await tdaFindGuided(seatId);
          if (grow) {
            if (ckKey) { try { await upstashPipeline([['SET', ckKey, String(grow.id), 'NX', 'EX', 3600]]); } catch (e) { /* best-effort */ } }
            if (submittedLang) { try { await upstashPipeline([['HSET', 'tda:seat:' + seatId, 'lang', submittedLang]]); } catch (e) { /* best-effort */ } }
            const adv = await tdaGuideAdvance(grow, text);
            return res.status(200).json({ ok: true, guided: String(grow.id), finished: adv.finished });
          }
        }
        /* Flood rail: the queue is one shared list, trimmed to
           the newest 200 — a seat that could post without limit
           could push everyone else's rows out of it. A seat may
           hold at most TDA_SEAT_OPEN_CAP unfinished requests;
           finishing jobs (owner-side) frees slots again. */
        const idsOut = await upstashPipeline([['LRANGE', 'tda:reqs', 0, 199]]);
        const ids = (idsOut[0] && idsOut[0].result) || [];
        if (ids.length) {
          const rows = await upstashPipeline(ids.map(x => ['HGETALL', 'tda:req:' + x]));
          let open = 0;
          for (const rw of rows) {
            const o = tdaHashToObj(rw && rw.result);
            /* Open = still in play. Done and seat-finished
               (closed) projects no longer hold a slot. */
            if (o.id && String(o.seatId || '') === seatId && o.status !== 'done' && o.status !== 'closed') open++;
          }
          if (open >= TDA_SEAT_OPEN_CAP) {
            return res.status(200).json({ ok: false, error: 'too many open requests — Tom is working through them; post again once some are done' });
          }
        }
      } else if (body.seatId) {
        /* The owner may post into a seat's thread (or leave the
           seat off for the owner's own thread). With addProject
           the post is a PROJECT on that seat's board, titled
           exactly what the owner typed and flagged ownerAdded —
           a tracking entry that never charges (see tdaDone). */
        const target = await tdaGetSeat(String(body.seatId));
        if (target) {
          seatId = String(target.id);
          if (body.addProject === true) ownerAdded = true;
        }
      }
      /* The owner's own thread can hold a guided conversation
         too (the owner testing a flow); an owner posting into
         a SEAT's thread is talking to that seat, never a guide
         reply. */
      if (wantBuilder && !ownerAdded && auth.tier === 'owner' && !body.seatId) {
        const grow = await tdaFindGuided('owner');
        if (grow) {
          if (ckKey) { try { await upstashPipeline([['SET', ckKey, String(grow.id), 'NX', 'EX', 3600]]); } catch (e) { /* best-effort */ } }
          const adv = await tdaGuideAdvance(grow, text);
          return res.status(200).json({ ok: true, guided: String(grow.id), finished: adv.finished });
        }
      }
      /* One language rule (Tom, Nov 20): the seat's chosen
         language wins — this submission's choice first,
         then the seat's stored choice. Detecting a language
         from the message text is only the fallback for rows
         that carry neither. */
      let chosenLang = submittedLang;
      if (!chosenLang && auth.tier === 'seat') chosenLang = tdaChosenLang(auth.seat.lang);
      if (!chosenLang && seatId !== 'owner') {
        const tgt = await tdaGetSeat(seatId);
        if (tgt) chosenLang = tdaChosenLang(tgt.lang);
      }
      const now = Date.now();
      const id = 'r' + now.toString(36) + crypto.randomBytes(4).toString('hex');
      /* Builder-managed rows are born Building with the
         instant builder reply already in the trail — the seat
         sees the builder answer in the same beat they post,
         before any runner or human touches anything. Tracking
         entries (ownerAdded) are never builder-managed. */
      const builderRow = wantBuilder && !ownerAdded;
      const rowCmd = ['HSET', 'tda:req:' + id, 'id', id, 'seatId', seatId, 'text', text, 'status', builderRow ? 'building' : 'received', 'result', '', 'tokensUsed', '0', 'created', String(now), 'updated', String(now)];
      if (ownerAdded) rowCmd.push('ownerAdded', '1');
      if (chosenLang) rowCmd.push('lang', chosenLang);
      if (builderRow) {
        rowCmd.push('buildState', 'queued');
        /* The instant ack must never claim "building": at post
           time the server cannot know the kind — a plain question
           or check-in lands here too, and the runner's real,
           kind-specific answer follows. Neutral wording only. */
        const ackLang = chosenLang || tdaDetectLang(text);
        const ackEntry = { k: 'builder', m: TDA_S(ackLang).gotIt };
        if (ackLang !== 'en') ackEntry.e = TDA_S('en').gotIt;
        rowCmd.push('plog', tdaPlogJson('', [ackEntry]));
      }
      const cmds = [
        rowCmd,
        ['LPUSH', 'tda:reqs', id],
        ['LTRIM', 'tda:reqs', 0, 199],
      ];
      if (auth.tier === 'seat') cmds.push(['HINCRBY', 'tda:seat:' + seatId, 'reqs', 1]);
      if (auth.tier === 'seat' && submittedLang) cmds.push(['HSET', 'tda:seat:' + seatId, 'lang', submittedLang]);
      await upstashPipeline(cmds);
      if (ckKey) { try { await upstashPipeline([['SET', ckKey, id, 'NX', 'EX', 3600]]); } catch (e) { /* best-effort */ } }
      return res.status(200).json({ ok: true, id });
    }

    if (action === 'tdaList') {
      const auth = await tdaAuthTier(req, res, tag, String(body.hash || '').toLowerCase(), 'any');
      if (!auth) return undefined;
      const idsOut = await upstashPipeline([['LRANGE', 'tda:reqs', 0, 199]]);
      const ids = (idsOut[0] && idsOut[0].result) || [];
      if (!ids.length) {
        const base = { ok: true, reqs: [] };
        if (auth.tier === 'seat') { const s = tdaPublicSeat(auth.seat); base.seat = { id: s.id, name: s.name, tokens: s.tokens, used: s.used }; }
        return res.status(200).json(base);
      }
      const rows = await upstashPipeline(ids.map(id => ['HGETALL', 'tda:req:' + id]));
      let objs = rows.map(r => tdaHashToObj(r && r.result)).filter(o => o.id);
      /* Seat isolation: a seat's list is filtered to its own rows
         server-side — other seats' rows never leave this function. */
      if (auth.tier === 'seat') objs = objs.filter(o => String(o.seatId || '') === String(auth.seat.id));
      /* The 50-row cap is a per-seat payload limit. The owner tier
         gets the full request index (at most 200 rows — the index's
         own storage cap): capping the owner at 50 let the busiest
         seat's newest rows crowd every other seat out of the owner's
         Chat people list and thread view (Nov 20 fix). */
      if (auth.tier !== 'owner') objs = objs.slice(0, TDA_LIST_CAP);
      /* Resolve seat names for owner labels (few seats; archived
         seats keep their names so old threads stay attributed). */
      const seatIds = [...new Set(objs.map(o => String(o.seatId || 'owner')))];
      const names = {};
      for (const sid of seatIds) {
        if (sid === 'owner') { names[sid] = 'Owner'; continue; }
        const s = await tdaGetSeat(sid);
        names[sid] = s ? String(s.name || '') : '';
      }
      const reqs = objs.map(o => tdaPublicReq(o, names[String(o.seatId || 'owner')]));
      const out = { ok: true, reqs };
      if (auth.tier === 'seat') { const s = tdaPublicSeat(auth.seat); out.seat = { id: s.id, name: s.name, tokens: s.tokens, used: s.used }; }
      return res.status(200).json(out);
    }

    if (action === 'tdaStatus' || action === 'tdaDone') {
      const auth = await tdaAuthTier(req, res, tag, String(body.hash || '').toLowerCase(), 'owner');
      if (!auth) return undefined;
      const id = String(body.id || '');
      if (!/^r[a-z0-9]{6,24}$/.test(id)) return res.status(400).json({ ok: false, error: 'bad id' });
      const cur = await upstashPipeline([['HGETALL', 'tda:req:' + id]]);
      const existing = tdaHashToObj(cur[0] && cur[0].result);
      if (!existing.id) return res.status(404).json({ ok: false, error: 'no such request' });
      /* A project sitting in the delete backup is out of play:
         it cannot be statused or completed until restored. */
      if (String(existing.deletedAt || '')) return res.status(404).json({ ok: false, error: 'no such request' });
      const now = String(Date.now());
      if (action === 'tdaStatus') {
        const status = String(body.status || '');
        if (status !== 'building' && status !== 'received') {
          return res.status(400).json({ ok: false, error: 'bad status' });
        }
        if (existing.status === 'done') return res.status(200).json({ ok: false, error: 'already done' });
        await upstashPipeline([['HSET', 'tda:req:' + id, 'status', status, 'updated', now]]);
        return res.status(200).json({ ok: true, id, status });
      }
      const result = String(body.result || '').trim().slice(0, TDA_RESULT_MAX);
      if (!result) return res.status(400).json({ ok: false, error: 'empty reply' });
      let used = tdaParseTokens(body.tokens, 0);
      if (used === null) return res.status(400).json({ ok: false, error: 'bad token amount' });
      /* Owner-added projects are TRACKING entries: completing
         one never charges the seat, whatever figure the caller
         sent — tdaFinishRow records 0 used for them and the
         balance does not move. Charging itself is the shared
         idempotent delta path (see tdaFinishRow). */
      const tokensLeft = await tdaFinishRow(existing, result, used);
      return res.status(200).json({ ok: true, id, status: 'done', tokensLeft });
    }

    /* ---- LIVE BUILDER (v3): the runner's own actions ----
       Authenticated by the builder hash (tdaBuilderGate),
       never by a seat or owner code. The runner claims work
       atomically, narrates into the thread trail, and either
       builds (web), guides (steps only the seat can do), or
       refuses (safety) — completing through tdaFinishRow so
       charging is the same idempotent path as a human reply. */

    if (action === 'tdaBuilderSecretSet') {
      const newHash = String(body.bhash || '').toLowerCase();
      if (!tdaIsHash(newHash)) return res.status(400).json({ ok: false, error: 'bad hash' });
      const cur = await upstashPipeline([['GET', 'tda:buildersecret']]);
      const stored = cur[0] && cur[0].result;
      if (!tdaIsHash(stored || '')) {
        /* Bootstrap: while no builder secret exists, the
           first hash presented claims the slot (the runner
           does this in the same minute it first runs; the
           window is the unlisted action name + the race-safe
           NX write). After that, rotation rules below apply. */
        const set = await upstashPipeline([['SET', 'tda:buildersecret', newHash, 'NX']]);
        if (!set[0] || !set[0].result) return res.status(200).json({ ok: false, error: 'builder secret was just set by someone else' });
        return res.status(200).json({ ok: true, set: true, bootstrapped: true });
      }
      /* Rotation: the current builder hash OR the owner. */
      const curB = String(body.currentBhash || '').toLowerCase();
      if (tdaIsHash(curB) && tdaHashEq(curB, stored)) {
        await upstashPipeline([['SET', 'tda:buildersecret', newHash]]);
        return res.status(200).json({ ok: true, set: true });
      }
      const auth = await tdaAuthTier(req, res, tag, String(body.hash || '').toLowerCase(), 'owner');
      if (!auth) return undefined;
      await upstashPipeline([['SET', 'tda:buildersecret', newHash]]);
      return res.status(200).json({ ok: true, set: true });
    }

    if (action === 'tdaBuildQueue') {
      if (!(await tdaBuilderGate(req, res, tag, body))) return undefined;
      const idsOut = await upstashPipeline([['LRANGE', 'tda:reqs', 0, 199]]);
      const ids = (idsOut[0] && idsOut[0].result) || [];
      if (!ids.length) return res.status(200).json({ ok: true, queue: [] });
      const rows = await upstashPipeline(ids.map(x => ['HGETALL', 'tda:req:' + x]));
      const nowMs = Date.now();
      const objs = rows.map(r => tdaHashToObj(r && r.result)).filter(o => {
        if (!o.id || String(o.deletedAt || '') || o.status !== 'building') return false;
        const bs = String(o.buildState || '');
        if (bs === 'queued') return true;
        /* A claim whose holder has gone quiet past the stale
           window is offered again — claiming it IS the
           recovery path (the old lock has expired by then,
           or the claim write simply refuses). */
        if (bs === 'claimed' && (nowMs - (Number(o.claimAt) || 0)) > TDA_CLAIM_STALE_MS) return true;
        return false;
      }).slice(0, 20);
      const seatIds = [...new Set(objs.map(o => String(o.seatId || 'owner')))];
      const names = {};
      for (const sid of seatIds) {
        if (sid === 'owner') { names[sid] = 'Owner'; continue; }
        const s = await tdaGetSeat(sid);
        names[sid] = s ? String(s.name || '') : '';
      }
      return res.status(200).json({ ok: true, queue: objs.map(o => tdaPublicReq(o, names[String(o.seatId || 'owner')])) });
    }

    if (action === 'tdaBuildClaim') {
      if (!(await tdaBuilderGate(req, res, tag, body))) return undefined;
      const id = String(body.id || '');
      if (!/^r[a-z0-9]{6,24}$/.test(id)) return res.status(400).json({ ok: false, error: 'bad id' });
      const cur = await upstashPipeline([['HGETALL', 'tda:req:' + id]]);
      const row = tdaHashToObj(cur[0] && cur[0].result);
      if (!row.id || String(row.deletedAt || '')) return res.status(404).json({ ok: false, error: 'no such request' });
      const bs = String(row.buildState || '');
      if (row.status !== 'building' || (bs !== 'queued' && bs !== 'claimed')) {
        return res.status(200).json({ ok: false, error: 'not claimable' });
      }
      const claimToken = crypto.randomBytes(24).toString('hex');
      const got = await upstashPipeline([['SET', 'tda:claim:' + id, claimToken, 'NX', 'EX', TDA_CLAIM_TTL_SEC]]);
      if (!got[0] || !got[0].result) return res.status(200).json({ ok: false, error: 'already claimed' });
      const claimHash = crypto.createHash('sha256').update(claimToken).digest('hex');
      const runner = String(body.runner || 'runner').slice(0, 40);
      await upstashPipeline([['HSET', 'tda:req:' + id,
        'buildState', 'claimed', 'claimHash', claimHash, 'claimAt', String(Date.now()), 'claimBy', runner,
        'buildKind', String(body.buildKind || row.buildKind || '').slice(0, 20), 'updated', String(Date.now())]]);
      const fresh = await upstashPipeline([['HGETALL', 'tda:req:' + id]]);
      const fo = tdaHashToObj(fresh[0] && fresh[0].result);
      return res.status(200).json({ ok: true, id, claimToken, recovered: bs === 'claimed', row: tdaPublicReq(fo, '') });
    }

    if (action === 'tdaBuildProgress') {
      if (!(await tdaBuilderGate(req, res, tag, body))) return undefined;
      const id = String(body.id || '');
      if (!/^r[a-z0-9]{6,24}$/.test(id)) return res.status(400).json({ ok: false, error: 'bad id' });
      const row = await tdaClaimCheck(id, String(body.claimToken || ''));
      if (!row) return res.status(200).json({ ok: false, error: 'claim not held' });
      const msg = String(body.msg || '').trim();
      if (!msg) return res.status(400).json({ ok: false, error: 'empty progress' });
      const kind = body.kind === 'note' ? 'note' : 'builder';
      const ent = { k: kind, m: msg };
      const msgEn = String(body.msgEn || '').trim();
      if (msgEn) ent.e = msgEn;
      await upstashPipeline([
        ['HSET', 'tda:req:' + id, 'plog', tdaPlogJson(row.plog, [ent]), 'updated', String(Date.now())],
        ['EXPIRE', 'tda:claim:' + id, TDA_CLAIM_TTL_SEC],
      ]);
      return res.status(200).json({ ok: true, id });
    }

    if (action === 'tdaBuildGuide') {
      if (!(await tdaBuilderGate(req, res, tag, body))) return undefined;
      const id = String(body.id || '');
      if (!/^r[a-z0-9]{6,24}$/.test(id)) return res.status(400).json({ ok: false, error: 'bad id' });
      const row = await tdaClaimCheck(id, String(body.claimToken || ''));
      if (!row) return res.status(200).json({ ok: false, error: 'claim not held' });
      const stepsIn = Array.isArray(body.steps) ? body.steps : [];
      const steps = stepsIn.map(s => String(s || '').trim().slice(0, TDA_STEP_MAX)).filter(Boolean).slice(0, TDA_GUIDE_STEPS_MAX);
      if (!steps.length) return res.status(400).json({ ok: false, error: 'no steps' });
      let charge = tdaParseTokens(body.tokens, 0);
      if (charge === null) return res.status(400).json({ ok: false, error: 'bad token amount' });
      const rowLang = tdaChosenLang(row.lang) || tdaDetectLang(row.text || '');
      const gs = TDA_S(rowLang);
      const intro = String(body.intro || '').trim().slice(0, TDA_PLOG_MSG_MAX)
        || gs.guideIntro;
      const doneText = String(body.doneText || '').trim().slice(0, TDA_RESULT_MAX)
        || gs.guideAllDone;
      /* English twins (owner view): the runner composes both
         languages from the same tables, so these are exact. */
      const stepsEn = (Array.isArray(body.stepsEn) ? body.stepsEn : [])
        .map(s => String(s || '').trim().slice(0, TDA_STEP_MAX)).slice(0, TDA_GUIDE_STEPS_MAX);
      const introEn = String(body.introEn || '').trim().slice(0, TDA_PLOG_MSG_MAX)
        || (rowLang !== 'en' ? TDA_S('en').guideIntro : '');
      const doneTextEn = String(body.doneTextEn || '').trim().slice(0, TDA_RESULT_MAX);
      const introEnt = { k: 'builder', m: intro };
      if (introEn) introEnt.e = introEn;
      const stepEnt = { k: 'step', m: tdaFill(gs.stepOf, { n: 1, m: steps.length }) + ': ' + steps[0] };
      if (stepsEn[0]) stepEnt.e = tdaFill(TDA_S('en').stepOf, { n: 1, m: steps.length }) + ': ' + stepsEn[0];
      const plog = tdaPlogJson(row.plog, [introEnt, stepEnt]);
      await upstashPipeline([
        ['HSET', 'tda:req:' + id, 'buildState', 'guided', 'guideSteps', JSON.stringify(steps),
          'guideStepsEn', JSON.stringify(stepsEn), 'guideDoneEn', doneTextEn,
          'guideIdx', '0', 'guideCharge', String(charge), 'guideDone', doneText, 'guideNudged', '', 'guideLang', rowLang,
          'plog', plog, 'updated', String(Date.now())],
        ['DEL', 'tda:claim:' + id],
      ]);
      return res.status(200).json({ ok: true, id, guided: true, steps: steps.length });
    }

    if (action === 'tdaBuildRefuse') {
      if (!(await tdaBuilderGate(req, res, tag, body))) return undefined;
      const id = String(body.id || '');
      if (!/^r[a-z0-9]{6,24}$/.test(id)) return res.status(400).json({ ok: false, error: 'bad id' });
      const row = await tdaClaimCheck(id, String(body.claimToken || ''));
      if (!row) return res.status(200).json({ ok: false, error: 'claim not held' });
      const note = String(body.msg || '').trim().slice(0, TDA_PLOG_MSG_MAX)
        || 'Flagged by the builder\'s safety check.';
      const rowLang = tdaChosenLang(row.lang) || tdaDetectLang(row.text || '');
      const result = TDA_S(rowLang).refuseResult;
      const noteEnt = { k: 'builder', m: note };
      const noteEn = String(body.msgEn || '').trim();
      if (noteEn) noteEnt.e = noteEn;
      await upstashPipeline([['HSET', 'tda:req:' + id,
        'plog', tdaPlogJson(row.plog, [noteEnt]),
        'buildState', 'refused', 'flagged', '1', 'updated', String(Date.now())]]);
      const tokensLeft = await tdaFinishRow(row, result, 0, rowLang !== 'en' ? TDA_S('en').refuseResult : undefined);
      await upstashPipeline([['DEL', 'tda:claim:' + id]]);
      return res.status(200).json({ ok: true, id, refused: true, tokensLeft });
    }

    if (action === 'tdaBuildDone') {
      if (!(await tdaBuilderGate(req, res, tag, body))) return undefined;
      const id = String(body.id || '');
      if (!/^r[a-z0-9]{6,24}$/.test(id)) return res.status(400).json({ ok: false, error: 'bad id' });
      const row = await tdaClaimCheck(id, String(body.claimToken || ''));
      if (!row) return res.status(200).json({ ok: false, error: 'claim not held' });
      const result = String(body.result || '').trim().slice(0, TDA_RESULT_MAX);
      if (!result) return res.status(400).json({ ok: false, error: 'empty reply' });
      let used = tdaParseTokens(body.tokens, 0);
      if (used === null) return res.status(400).json({ ok: false, error: 'bad token amount' });
      const resultEn = String(body.resultEn || '').trim().slice(0, TDA_RESULT_MAX);
      const tokensLeft = await tdaFinishRow(row, result, used, resultEn || undefined);
      await upstashPipeline([
        ['HSET', 'tda:req:' + id, 'buildState', 'done', 'updated', String(Date.now())],
        ['DEL', 'tda:claim:' + id],
      ]);
      return res.status(200).json({ ok: true, id, status: 'done', tokensLeft });
    }

    /* ---- OWNER-ENGLISH (Nov 18 late): the owner's Chat view
       reads every thread in English. Renderings are STORED
       next to the seat's own words — textEn on the row, `e`
       on each trail entry, resultEn on the reply — written
       when the message is written (template strings are
       exact from the language tables) or by the runner's
       translation sweep for free seat text and legacy rows.
       The seat's own view is never touched. ---- */

    if (action === 'tdaSetEn') {
      if (!(await tdaBuilderGate(req, res, tag, body))) return undefined;
      const id = String(body.id || '');
      if (!/^r[a-z0-9]{6,24}$/.test(id)) return res.status(400).json({ ok: false, error: 'bad id' });
      const cur = await upstashPipeline([['HGETALL', 'tda:req:' + id]]);
      const row = tdaHashToObj(cur[0] && cur[0].result);
      if (!row.id || String(row.deletedAt || '')) return res.status(404).json({ ok: false, error: 'no such request' });
      /* Renderings ONLY: this action can never touch the
         row's text, status, result or tokens, and it only
         fills EMPTY rendering slots — the first rendering
         stored wins, so a re-run can never rewrite what the
         owner already read. `updated` is deliberately left
         alone: a backfill must not make old threads look
         newly active. */
      const set = {};
      const hset = ['HSET', 'tda:req:' + id];
      const textEn = String(body.textEn || '').trim().slice(0, TDA_TEXT_MAX);
      if (textEn && !String(row.textEn || '')) { hset.push('textEn', textEn); set.textEn = true; }
      const resultEn = String(body.resultEn || '').trim().slice(0, TDA_RESULT_MAX);
      if (resultEn && !String(row.resultEn || '')) { hset.push('resultEn', resultEn); set.resultEn = true; }
      if (Array.isArray(body.plogEn) && body.plogEn.length) {
        const r = tdaPlogSetEn(row.plog, body.plogEn);
        if (r.set) { hset.push('plog', r.json); set.plogEn = r.set; }
      }
      if (hset.length > 2) await upstashPipeline([hset]);
      return res.status(200).json({ ok: true, id, set });
    }

    if (action === 'tdaEnSweep') {
      if (!(await tdaBuilderGate(req, res, tag, body))) return undefined;
      /* Rows whose stored English renderings are incomplete.
         Detection is PER PIECE, never row-gated: a guide
         thread opened in English can still hold the seat's
         Spanish replies, and a Spanish thread can hold an
         English reply — each piece is judged by its own
         words. Every piece carries its own detected language
         so the runner translates it from the right source.
         Newest first; the runner stores via tdaSetEn. */
      const limit = Math.max(1, Math.min(10, parseInt(body.limit, 10) || 3));
      const idsOut = await upstashPipeline([['LRANGE', 'tda:reqs', 0, 199]]);
      const ids = (idsOut[0] && idsOut[0].result) || [];
      const out = [];
      if (ids.length) {
        const rows = await upstashPipeline(ids.map(x => ['HGETALL', 'tda:req:' + x]));
        for (const rw of rows) {
          if (out.length >= limit) break;
          const o = tdaHashToObj(rw && rw.result);
          if (!o.id || String(o.deletedAt || '')) continue;
          const need = { id: String(o.id), seatId: String(o.seatId || 'owner') };
          const textLang = tdaDetectLang(o.text || '');
          if (String(o.text || '') && !String(o.textEn || '') && textLang !== 'en') need.text = { v: String(o.text), lang: textLang };
          const resultLang = tdaDetectLang(o.result || '');
          if (String(o.result || '') && !String(o.resultEn || '') && resultLang !== 'en') need.result = { v: String(o.result), lang: resultLang };
          const missing = [];
          tdaParsePlog(o.plog).forEach((e, i) => {
            const el = tdaDetectLang(e.m);
            if (!e.e && el !== 'en') missing.push({ i, t: e.t, kind: e.k, msg: e.m, lang: el });
          });
          if (missing.length) need.progress = missing;
          if (!need.text && !need.result && !need.progress) continue;
          out.push(need);
        }
      }
      return res.status(200).json({ ok: true, rows: out });
    }

    if (action === 'tdaThreadDump') {
      if (!(await tdaBuilderGate(req, res, tag, body))) return undefined;
      /* One seat's thread in the exact public shape the page
         renders (renderings included) — the runner's support
         and verification read. Builder-gated like the queue:
         the runner already sees every row's text there. */
      const seatId = String(body.seatId || '');
      if (!seatId) return res.status(400).json({ ok: false, error: 'seatId required' });
      const idsOut = await upstashPipeline([['LRANGE', 'tda:reqs', 0, 199]]);
      const ids = (idsOut[0] && idsOut[0].result) || [];
      let objs = [];
      if (ids.length) {
        const rows = await upstashPipeline(ids.map(x => ['HGETALL', 'tda:req:' + x]));
        objs = rows.map(r => tdaHashToObj(r && r.result))
          .filter(o => o.id && !String(o.deletedAt || '') && String(o.seatId || '') === seatId);
      }
      const seat = seatId === 'owner' ? null : await tdaGetSeat(seatId);
      const name = seatId === 'owner' ? 'Owner' : (seat ? String(seat.name || '') : '');
      const out = { ok: true, reqs: objs.slice(0, TDA_LIST_CAP).map(o => tdaPublicReq(o, name)) };
      if (seat) { const s = tdaPublicSeat(seat); out.seat = { id: s.id, name: s.name, tokens: s.tokens, used: s.used }; }
      return res.status(200).json(out);
    }

    if (action === 'tdaClose' || action === 'tdaDelete') {
      const auth = await tdaAuthTier(req, res, tag, String(body.hash || '').toLowerCase(), 'any');
      if (!auth) return undefined;
      const id = String(body.id || '');
      if (!/^r[a-z0-9]{6,24}$/.test(id)) return res.status(400).json({ ok: false, error: 'bad id' });
      const cur = await upstashPipeline([['HGETALL', 'tda:req:' + id]]);
      const existing = tdaHashToObj(cur[0] && cur[0].result);
      if (!existing.id) return res.status(404).json({ ok: false, error: 'no such request' });
      /* Already in the backup = already deleted: a second
         close/delete 404s like the project was never there. */
      if (String(existing.deletedAt || '')) return res.status(404).json({ ok: false, error: 'no such request' });
      /* A seat touches only its OWN projects; the owner any. */
      if (auth.tier === 'seat' && String(existing.seatId || '') !== String(auth.seat.id)) {
        return res.status(200).json({ ok: false, error: 'not your project' });
      }
      if (action === 'tdaClose') {
        /* Finish (Projects board): a STATUS only. Token charging
           stays exactly as today — owner-side at delivery
           (tdaDone) — closing never charges or refunds. closedBy
           records who closed it so the owner's views can show
           "closed by user". A closed project leaves the active
           list and frees its open-cap slot (see tdaNew). */
        if (existing.status !== 'closed') {
          await upstashPipeline([['HSET', 'tda:req:' + id, 'status', 'closed', 'closedBy', auth.tier, 'updated', String(Date.now())]]);
        }
        return res.status(200).json({ ok: true, id, status: 'closed' });
      }
      /* tdaDelete: the project leaves the board and every list
         at once (board stays lean, the open-cap slot frees),
         but the record is NOT destroyed — it moves to the
         OWNER-ONLY backup (tda:trash, newest first, capped at
         100) so an accidental delete can be restored from the
         owner's Progress panel. Backups pushed past the cap
         lose their row for real — that, and the owner's Delete
         forever (tdaTrashDelete), is where the memory is
         actually saved. */
      const nowD = String(Date.now());
      const tr = await upstashPipeline([['LRANGE', 'tda:trash', 0, -1]]);
      const oldTrash = (tr[0] && tr[0].result) || [];
      const dropped = oldTrash.slice(99);
      const cmds = [
        ['HSET', 'tda:req:' + id, 'deletedAt', nowD, 'updated', nowD],
        ['LREM', 'tda:reqs', 0, id],
        ['LPUSH', 'tda:trash', id],
        ['LTRIM', 'tda:trash', 0, 99],
      ];
      for (const d of dropped) if (d !== id) cmds.push(['DEL', 'tda:req:' + d]);
      await upstashPipeline(cmds);
      return res.status(200).json({ ok: true, id, deleted: true });
    }

    if (action === 'tdaTrashList' || action === 'tdaRestore' || action === 'tdaTrashDelete') {
      /* The delete backup is OWNER-ONLY end to end: seats never
         see it, and a seat calling any of these is refused by
         the owner tier check itself. */
      const auth = await tdaAuthTier(req, res, tag, String(body.hash || '').toLowerCase(), 'owner');
      if (!auth) return undefined;
      if (action === 'tdaTrashList') {
        const idsOut = await upstashPipeline([['LRANGE', 'tda:trash', 0, -1]]);
        const ids = (idsOut[0] && idsOut[0].result) || [];
        if (!ids.length) return res.status(200).json({ ok: true, trash: [] });
        const rows = await upstashPipeline(ids.map(x => ['HGETALL', 'tda:req:' + x]));
        const objs = rows.map(r => tdaHashToObj(r && r.result)).filter(o => o.id);
        const seatIds = [...new Set(objs.map(o => String(o.seatId || 'owner')))];
        const names = {};
        for (const sid of seatIds) {
          if (sid === 'owner') { names[sid] = 'Owner'; continue; }
          const s = await tdaGetSeat(sid);
          names[sid] = s ? String(s.name || '') : '';
        }
        return res.status(200).json({ ok: true, trash: objs.map(o => tdaPublicReq(o, names[String(o.seatId || 'owner')])) });
      }
      const id = String(body.id || '');
      if (!/^r[a-z0-9]{6,24}$/.test(id)) return res.status(400).json({ ok: false, error: 'bad id' });
      const cur = await upstashPipeline([['HGETALL', 'tda:req:' + id]]);
      const existing = tdaHashToObj(cur[0] && cur[0].result);
      if (!existing.id || !String(existing.deletedAt || '')) {
        return res.status(404).json({ ok: false, error: 'not in the backup' });
      }
      if (action === 'tdaTrashDelete') {
        /* Delete forever: the backup copy is destroyed too —
           the row hash is DELeted and the id pulled from the
           backup list. The one delete that cannot be undone. */
        await upstashPipeline([['DEL', 'tda:req:' + id], ['LREM', 'tda:trash', 0, id]]);
        return res.status(200).json({ ok: true, id, deletedForever: true });
      }
      /* tdaRestore: the project returns to its seat's board
         with its prior status untouched; the backup entry and
         the deletedAt flag clear. */
      await upstashPipeline([
        ['HSET', 'tda:req:' + id, 'deletedAt', '', 'updated', String(Date.now())],
        ['LREM', 'tda:trash', 0, id],
        ['LPUSH', 'tda:reqs', id],
        ['LTRIM', 'tda:reqs', 0, 199],
      ]);
      return res.status(200).json({ ok: true, id, restored: true });
    }

    /* ---- Seat refills ($5 in LUNC, wallet-connect one-button) ---- */

    if (action === 'tdaRenewInfo') {
      const auth = await tdaAuthTier(req, res, tag, String(body.hash || '').toLowerCase(), 'any');
      if (!auth) return undefined;
      const s = await tdaGetSettings();
      const base = { ok: true, priceUsd: s.renewPriceUsd, tolerance: TDA_RENEW_TOLERANCE, refillTokens: s.seatTokens };
      if (auth.tier === 'seat') {
        const ps = tdaPublicSeat(auth.seat);
        /* The seat's own refill count, counted from the refill
           records themselves. The page's 🎁 starter line trusts
           THIS — not a per-device flag — so it is true on any
           device the seat signs in from (audit 2026-11-14). */
        let refills = 0;
        const rOut = await upstashPipeline([['LRANGE', 'tda:renews', 0, 199]]);
        const rIds = (rOut[0] && rOut[0].result) || [];
        if (rIds.length) {
          const rRows = await upstashPipeline(rIds.map(id => ['HGETALL', 'tda:renew:' + id]));
          for (const r of rRows) {
            const o = tdaHashToObj(r && r.result);
            if (o.id && String(o.seatId || '') === String(auth.seat.id)) refills++;
          }
        }
        base.seat = { tokens: ps.tokens, wallet: ps.wallet, refills };
        base.memo = tdaRenewMemo(String(auth.seat.id));
      }
      if (!s.renewSet) return res.status(200).json({ ...base, enabled: false });
      const price = await tdaLuncPrice();
      if (!price) return res.status(200).json({ ...base, enabled: true, wallet: s.renewWallet, priceOk: false });
      const out = {
        ...base, enabled: true, wallet: s.renewWallet, priceOk: true,
        luncUsd: price.usd, priceSource: price.source,
        luncAmount: Math.ceil(s.renewPriceUsd / price.usd),
        minUsd: Math.round(s.renewPriceUsd * TDA_RENEW_TOLERANCE * 100) / 100,
      };
      /* Second method: USTC (native uusd) to the same wallet.
         Its price is read on its own cross-checked route; if
         that read fails, USTC simply shows as unavailable on
         the card — LUNC is unaffected. */
      const up = await tdaUstcPrice();
      if (up) {
        out.ustcOk = true;
        out.ustcUsd = up.usd;
        out.ustcSource = up.source;
        out.ustcAmount = Math.ceil(s.renewPriceUsd / up.usd);
      } else {
        out.ustcOk = false;
      }
      return res.status(200).json(out);
    }

    if (action === 'tdaRenewSubmit') {
      const auth = await tdaAuthTier(req, res, tag, String(body.hash || '').toLowerCase(), 'any');
      if (!auth) return undefined;
      if (auth.tier !== 'seat') {
        return res.status(200).json({ ok: false, error: 'Refills credit a seat — open the page with a seat code.' });
      }
      const seatId = String(auth.seat.id);
      /* The claimed sender: the wallet the seat connected on
         the card. It is a claim only — attribution below is
         derived from the transaction itself, and the two
         must agree. It may be omitted, in which case the tx
         must name exactly one sender. */
      const claimedSender = String(body.sender || '').trim().toLowerCase();
      const txhash = String(body.txHash || '').trim().toUpperCase();
      if (claimedSender && !tdaTerraAddr(claimedSender)) return res.status(400).json({ ok: false, error: 'That wallet address does not look right.' });
      if (!/^[0-9A-F]{64}$/.test(txhash)) return res.status(400).json({ ok: false, error: 'That transaction hash does not look right — it is 64 characters, letters and numbers.' });
      const s = await tdaGetSettings();
      if (!s.renewSet) {
        return res.status(200).json({ ok: false, notSetup: true, error: 'Renewals open soon — Tom is setting this up.' });
      }
      /* Refill method: LUNC (uluna) or USTC (uusd), both to
         the same receiving wallet, both verified by the same
         discipline below — only the denom summed and the
         price route differ. Anything unnamed is LUNC, so the
         shipped card's submits keep working untouched. */
      const method = body.method === 'USTC' ? 'USTC' : 'LUNC';
      const DENOM = method === 'USTC' ? 'uusd' : 'uluna';
      const legAmt = l => (DENOM === 'uusd' ? l.uusd : l.uluna);
      const priceFor = () => (method === 'USTC' ? tdaUstcPrice() : tdaLuncPrice());
      /* Throttle BEFORE the binding checks and any external
         fetch: a seat gets at most TDA_RENEW_TRY_MAX payment
         checks per window, so one seat can't burn the chain
         reader's or the price APIs' quota for everyone — and
         can't probe other seats' wallet bindings at speed
         either. The window is self-healing: any attempt that
         finds the counter without a TTL re-arms the expiry,
         so a single lost EXPIRE can never lock a seat out
         for good. */
      const tryKey = 'tda:renew:try:' + seatId;
      const tryOut = await upstashPipeline([['INCR', tryKey], ['TTL', tryKey]]);
      const tries = (tryOut[0] && tryOut[0].result) || 0;
      const tryTtl = tryOut[1] && tryOut[1].result;
      if (tryTtl === -1) {
        try { await upstashPipeline([['EXPIRE', tryKey, TDA_RENEW_TRY_WINDOW_SEC]]); } catch (e) { /* best-effort */ }
      }
      if (tries > TDA_RENEW_TRY_MAX) {
        return res.status(200).json({ ok: false, error: 'Too many payment checks — wait a few minutes and try again.' });
      }
      const tx = await tdaLookupTx(txhash);
      if (!tx.found) {
        return res.status(200).json({ ok: false, notFound: true, error: 'Payment not found yet — if you just sent it, wait a minute and try again.' });
      }
      if (!tx.success) {
        return res.status(200).json({ ok: false, error: 'That transaction failed on-chain, so it cannot be used.' });
      }
      /* Attribution (no-memo flow): the payment's sender is
         read from the transaction itself — the bank-send
         legs that actually reached the renewal wallet. The
         seat's claimed (connected) wallet must be the
         wallet those legs came from; amounts are summed
         over THAT sender's legs only, so a send bundled
         with someone else's money never inflates this
         seat's payment. With no claim, the tx must name
         exactly one sender. */
      const legsTo = tx.sends.filter(l => l.to === s.renewWallet && legAmt(l) > 0n);
      if (!legsTo.length) {
        return res.status(200).json({ ok: false, error: 'That payment did not go to the renewal wallet.' });
      }
      let sender = '', toWallet = 0n;
      if (claimedSender) {
        for (const leg of legsTo) if (leg.from === claimedSender) toWallet += legAmt(leg);
        if (toWallet === 0n) {
          return res.status(200).json({ ok: false, error: 'That payment came from a different wallet than the one you connected.' });
        }
        sender = claimedSender;
      } else {
        const froms = [...new Set(legsTo.map(l => l.from))];
        if (froms.length !== 1) {
          return res.status(200).json({ ok: false, error: 'That payment came from more than one wallet, so it cannot be matched to this seat.' });
        }
        sender = froms[0];
        for (const leg of legsTo) toWallet += legAmt(leg);
      }
      /* No memo is required any more (owner order — the
         memo card was too confusing). Two memo cases still
         matter: a payment carrying THIS seat's TD- memo
         (sent the old way) passes as before, and a payment
         carrying a DIFFERENT seat's TD- memo was addressed
         to that seat and can never credit this one. Any
         other memo text is ignored. */
      const memoSeen = String(tx.memo || '').trim();
      const memoWant = tdaRenewMemo(seatId);
      if (memoSeen && memoSeen !== memoWant && /^TD-/i.test(memoSeen)) {
        return res.status(200).json({ ok: false, error: "That payment carries a different seat's renewal memo, so it can't renew this seat." });
      }
      /* Wallet binding: only the seat's own wallet can renew
         it. An unbound seat binds the wallet of its first
         successful renewal — but never a wallet another
         active seat already owns. */
      const bound = String(auth.seat.wallet || '');
      if (bound && bound !== sender) {
        return res.status(200).json({ ok: false, error: 'That payment came from a different wallet than the one on this seat.' });
      }
      if (!bound) {
        const ownerSeat = await tdaWalletOwnerSeat(sender);
        if (ownerSeat && ownerSeat !== seatId) {
          return res.status(200).json({ ok: false, error: 'That wallet is already on another seat — ask Tom to sort it out.' });
        }
      }
      const usedOut = await upstashPipeline([['GET', 'tda:renew:used:' + txhash]]);
      if (usedOut[0] && usedOut[0].result) {
        return res.status(200).json({ ok: false, alreadyUsed: true, error: 'That payment was already used.' });
      }
      /* Freshness: the payment must be recent (block time
         from the chain, not the client's clock), so a seat
         can't warehouse a cheap payment and cash it in on a
         later price rise. */
      const txTime = Date.parse(tx.timestamp || '');
      if (!Number.isFinite(txTime)) {
        return res.status(200).json({ ok: false, error: "Couldn't confirm when that payment was made — send a fresh payment and check it right away." });
      }
      if (Date.now() - txTime > TDA_RENEW_MAX_AGE_MS) {
        return res.status(200).json({ ok: false, error: 'That payment is too old — a refill needs a payment from the last 7 days.' });
      }
      if (txTime - Date.now() > 3600000) {
        return res.status(200).json({ ok: false, error: "That payment's time looks wrong — try again in a few minutes." });
      }
      /* Value the payment at the LIVE price read now (the
         method's own cross-checked route). Nothing is claimed
         or credited before this point, so every refusal above
         leaves the hash usable and the seat untouched. */
      const price = await priceFor();
      if (!price) {
        return res.status(200).json({ ok: false, priceDown: true, error: "Couldn't read the " + method + " price just now — wait a moment and try again. Your payment is safe; nothing was used." });
      }
      const lunc = Number(toWallet) / 1e6;
      const usd = lunc * price.usd;
      const minUsd = s.renewPriceUsd * TDA_RENEW_TOLERANCE;
      if (usd < minUsd) {
        return res.status(200).json({ ok: false, tooSmall: true, usd: Math.round(usd * 100) / 100, error: 'That payment is worth about $' + usd.toFixed(2) + ' right now — a refill needs $' + s.renewPriceUsd.toFixed(2) + ' (we accept $' + minUsd.toFixed(2) + ' or more, to allow for price wiggles).' });
      }
      /* One renewal at a time per seat: the lock (30 s,
         self-expiring) keeps two concurrent submits from
         both computing off the same seat snapshot and
         collapsing two payments into one extension. The
         lock is taken BEFORE the claim, so a refused submit
         never burns the payment. */
      const lockToken = crypto.randomBytes(8).toString('hex');
      const lockOut = await upstashPipeline([['SET', 'tda:renew:lock:' + seatId, lockToken, 'NX', 'EX', 30]]);
      if (!lockOut[0] || !lockOut[0].result) {
        return res.status(200).json({ ok: false, error: 'Another refill for this seat is being checked right now — wait a few seconds, then check your balance before trying again.' });
      }
      try {
        /* Claim the hash atomically — from here the payment
           is spent, even if two submits race. */
        const now = Date.now();
        const recId = 'n' + now.toString(36) + crypto.randomBytes(4).toString('hex');
        const claim = await upstashPipeline([['SET', 'tda:renew:used:' + txhash, recId, 'NX']]);
        if (!claim[0] || !claim[0].result) {
          return res.status(200).json({ ok: false, alreadyUsed: true, error: 'That payment was already used.' });
        }
        const releaseClaim = async () => { try { await upstashPipeline([['DEL', 'tda:renew:used:' + txhash]]); } catch (e) { /* best-effort */ } };
        /* From the claim until the credit lands, ANY failure
           releases the claim: no credit can have been applied
           yet, so releasing is provably safe and the seat can
           retry the same payment. The one exception is an
           ambiguous pipeline failure whose read-back ALSO
           fails — there the claim is kept (never risk a
           double credit) and the owner reconciles by hand. */
        let keepClaim = false;
        try {
          const fresh = await tdaGetSeat(seatId);
          if (!fresh || String(fresh.active) !== '1') {
            await releaseClaim();
            return res.status(200).json({ ok: false, error: 'This seat is not active.' });
          }
          /* Re-validate against FRESH state — the settings
             and the binding may have changed while the
             (slow) chain and price reads were in flight,
             and nothing decided from the stale snapshot
             may overwrite them. */
          const s2 = await tdaGetSettings();
          if (!s2.renewSet || s2.renewWallet !== s.renewWallet || s2.renewPriceUsd !== s.renewPriceUsd) {
            await releaseClaim();
            return res.status(200).json({ ok: false, error: 'Refill settings changed while your payment was being checked — nothing was used. Try again.' });
          }
          const boundF = String(fresh.wallet || '');
          if (boundF && boundF !== sender) {
            await releaseClaim();
            return res.status(200).json({ ok: false, error: 'That payment came from a different wallet than the one on this seat.' });
          }
          if (!boundF) {
            const ownerNow = await tdaWalletOwnerSeat(sender);
            if (ownerNow && ownerNow !== seatId) {
              await releaseClaim();
              return res.status(200).json({ ok: false, error: 'That wallet is already on another seat — ask Tom to sort it out.' });
            }
          }
          const newBal = Math.max(Math.max(0, parseInt(fresh.tokens, 10) || 0), s2.seatTokens);
          try {
            await upstashPipeline([
              ['HSET', 'tda:seat:' + seatId, 'tokens', String(newBal), 'wallet', sender],
              ['HSET', 'tda:renew:' + recId, 'id', recId, 'seatId', seatId, 'seatName', String(fresh.name || ''), 'sender', sender, 'txhash', txhash, 'method', method, 'uluna', DENOM === 'uluna' ? toWallet.toString() : '0', 'uusd', DENOM === 'uusd' ? toWallet.toString() : '0', 'usd', usd.toFixed(2), 'luncPrice', String(price.usd), 'priceUsd', String(s2.renewPriceUsd), 'tokens', String(newBal), 'created', String(now)],
              ['LPUSH', 'tda:renews', recId],
              ['LTRIM', 'tda:renews', 0, 199],
            ]);
          } catch (e) {
            /* Ambiguous write: verify before deciding. If
               the refill landed (the seat already shows the
               intended balance + wallet — the credit is
               idempotent in effect), this is a success; if
               it provably didn't, the outer catch releases
               the claim so the seat can retry; if the
               read-back itself fails, keep the claim. */
            let applied = false, readable = false;
            try {
              const chk = await tdaGetSeat(seatId);
              if (chk) { readable = true; applied = (parseInt(chk.tokens, 10) || 0) === newBal && String(chk.wallet || '') === sender; }
            } catch (e2) { /* unreadable */ }
            if (applied) {
              return res.status(200).json({ ok: true, tokens: newBal, lunc, amount: lunc, symbol: method, usd: Math.round(usd * 100) / 100 });
            }
            if (!readable) keepClaim = true;
            throw e;
          }
          return res.status(200).json({ ok: true, tokens: newBal, lunc, amount: lunc, symbol: method, usd: Math.round(usd * 100) / 100 });
        } catch (e) {
          if (!keepClaim) await releaseClaim();
          throw e;
        }
      } finally {
        /* Release only OUR lock: if it expired mid-flight
           and a successor took it, their lock is theirs. */
        try {
          const cur = await upstashPipeline([['GET', 'tda:renew:lock:' + seatId]]);
          if (cur[0] && cur[0].result === lockToken) {
            await upstashPipeline([['DEL', 'tda:renew:lock:' + seatId]]);
          }
        } catch (e) { /* expires on its own */ }
      }
    }

    if (action === 'tdaRenewSettingsSet') {
      const auth = await tdaAuthTier(req, res, tag, String(body.hash || '').toLowerCase(), 'owner');
      if (!auth) return undefined;
      const wallet = String(body.wallet === undefined || body.wallet === null ? '' : body.wallet).trim().toLowerCase();
      if (wallet !== '' && !tdaTerraAddrStrict(wallet)) {
        return res.status(400).json({ ok: false, error: 'that wallet address does not look right — check it character by character' });
      }
      const cmds = [['HSET', 'tda:settings', 'renewWallet', wallet]];
      if (body.priceUsd !== undefined && body.priceUsd !== null && body.priceUsd !== '') {
        const p = tdaParseUsd(body.priceUsd);
        if (p === null) return res.status(400).json({ ok: false, error: 'bad price' });
        cmds.push(['HSET', 'tda:settings', 'renewPriceUsd', String(p)]);
      }
      await upstashPipeline(cmds);
      const s = await tdaGetSettings();
      return res.status(200).json({ ok: true, settings: s });
    }

    if (action === 'tdaRenewList') {
      const auth = await tdaAuthTier(req, res, tag, String(body.hash || '').toLowerCase(), 'owner');
      if (!auth) return undefined;
      const s = await tdaGetSettings();
      const settings = { renewWallet: s.renewWallet, renewPriceUsd: s.renewPriceUsd, renewSet: s.renewSet };
      const out = await upstashPipeline([['LRANGE', 'tda:renews', 0, 199]]);
      const ids = (out[0] && out[0].result) || [];
      if (!ids.length) return res.status(200).json({ ok: true, renewals: [], settings });
      const rows = await upstashPipeline(ids.map(id => ['HGETALL', 'tda:renew:' + id]));
      const renewals = rows.map(r => {
        const o = tdaHashToObj(r && r.result);
        return {
          id: String(o.id || ''),
          seatId: String(o.seatId || ''),
          seatName: String(o.seatName || ''),
          sender: String(o.sender || ''),
          txhash: String(o.txhash || ''),
          lunc: (Number(o.uluna) || 0) / 1e6,
          method: String(o.method || 'LUNC'),
          amount: ((Number(o.uusd) || 0) > 0 ? (Number(o.uusd) || 0) : (Number(o.uluna) || 0)) / 1e6,
          usd: Number(o.usd) || 0,
          tokens: Number(o.tokens) || 0,
          created: Number(o.created) || 0,
        };
      }).filter(x => x.id).slice(0, TDA_LIST_CAP);
      return res.status(200).json({ ok: true, renewals, settings });
    }

    return res.status(400).json({ ok: false, error: 'unknown action' });
  } catch (e) {
    console.error('tda action failed', action, e && e.message);
    return res.status(500).json({ ok: false, unavailable: true, error: 'service unavailable' });
  }
}
/* toms-dev:end */

/* studio-community:start — STUDIO COMMUNITY (client/public/toms-dev/,
   the Community tab). Tom's direction (2026-11-18): our OWN messaging
   system inside the Tom's Dev app, so the community comes to us instead
   of Telegram. Reached via /api/luna-games?tdc=1 (folded into this
   router for the same 12-function-cap reason as every block above).
   PUBLIC CHAT, deliberately separate from the tda seat-code gate:
   anyone joins with a display name only — NO wallet, NO password, NO
   seed words, ever, and the page says so in a pinned safety note.
   Identity: a guest is a random per-device id (tdc gid, generated by
   the page, kept in its localStorage) + the display name. If the
   visitor is unlocked in the app, the page ALSO sends its code hash
   and the tier resolves with the very same tda helpers (owner hash /
   seat row): the server then FORCES the display name (the seat's own
   name, or "Tom" for the owner) and stamps the badge (OWNER /
   BUILDER), so badges can never be faked by a guest typing a name.
   Guest names are screened against a reserved list (tom, owner,
   admin, support, mod, system, lunc dev…) for the same reason.
   Storage (Upstash): tdc:msgs:<room> is a newest-first list of JSON
   messages capped at TDC_MSG_CAP; tdc:frozen is '1' while the owner
   has the chat frozen; tdc:bans is a JSON array of {uid, name, ts}
   the owner manages; tdc:rate:<uid> is the per-identity post pace.
   Rooms: 'main' (Main Hall) and 'games' (Games Lobby) — anything
   else is a 400.
   SAFETY (server-side, every post): a scam filter blocks seed-phrase /
   private-key / password / verification-code ASKS, impersonation
   ("support will refund…", "admin here…"), giveaway-drain bait
   ("double your…", "claim your airdrop…", "validate/sync/rectify
   your wallet") — the message is NOT stored and the poster is told
   why. LINK RULE: only our own hosts post cleanly (the vercel host
   and our domains, subdomains included); any other URL — scheme or
   bare t.me/bit.ly style — HOLDS the message (not stored, poster
   warned). A light profanity mask (*** ) keeps it friendly. Rate:
   one post per TDC_RATE_MS per identity (SET NX PX), so a script
   can't flood; reads are unmetered but page-sized.
   MODERATION is owner-tier only, re-verified from the code hash on
   every call (the tdaAuthTier lockout is NOT reused here — a mod
   call with a bad hash is simply refused, never data): delete one
   message, ban/unban by identity (the ban sticks to the device id
   AND the name), clear a room, freeze/unfreeze the whole chat
   (frozen = read-only for everyone except the owner). This block
   holds no keys, signs nothing and moves no funds. */
const TDC_ROOMS = { main: 1, games: 1 };
const TDC_MSG_CAP = 200;
const TDC_PAGE = 50;
const TDC_TEXT_MAX = 500;
const TDC_NAME_MAX = 24;
const TDC_RATE_MS = 1500;
const TDC_BANS_CAP = 200;
const TDC_OWN_HOSTS = [
  'frg-fight-club.vercel.app',
  'luncgames.com', 'luncdevstudio.com', 'luncscope.com', 'kavalaunchpad.com',
];
const TDC_RESERVED_NAME = /^(tom|toms dev|tom's dev|owner|admin|administrator|support|moderator|mod|system|lunc dev|lunc dev studio|dev studio|official|team)$/i;

function tdcCleanName(v) {
  const s = String(v == null ? '' : v).replace(/[\u0000-\u001f\u007f]/g, ' ').replace(/\s+/g, ' ').trim();
  return s.slice(0, TDC_NAME_MAX);
}

/* Scam screen: true = block the post outright. Sensitive-term asks
   need an ask verb nearby; the bait phrases are blocks on their own. */
function tdcScamHit(text) {
  const t = ' ' + String(text || '').toLowerCase().replace(/\s+/g, ' ') + ' ';
  /* First-person asks block unconditionally — no warning wording
     launders "send me your seed phrase". */
  const directAsk = ['send me your', 'give me your', 'dm me your', 'message me your', 'tell me your', 'send your seed to me', 'share your seed with me'];
  for (const p of directAsk) if (t.includes(p)) return true;
  const bait = [
    'double your', 'send me your seed', 'send your seed', 'share your seed',
    'give me your seed', 'enter your seed', 'type your seed', 'verify your seed',
    'share your private key', 'send your private key', 'give me your private key',
    'share your recovery phrase', 'send your recovery phrase', 'share your mnemonic',
    'send your mnemonic', 'share your password', 'send your password',
    'give me your password', 'your verification code', 'claim your airdrop',
    'free giveaway', 'giveaway claim', 'validate your wallet', 'sync your wallet',
    'rectify your wallet', 'connect your wallet to claim', 'support will refund',
    'refund support', 'admin will never', 'i am support', 'im support',
    'official support here', 'dm me your', 'message me your seed',
  ];
  /* A safety WARNING ("never share your seed phrase") is not an
     ask — a clear negation exempts the rest of the screen. */
  const warning = /(never\s+(share|send|give|enter|type|tell)|don'?t\s+(share|send|give|enter|type)|do not\s+(share|send|give|enter|type)|nobody\s+(from|will)|no one\s+(from|will)|will never ask|never asks? for)/.test(t);
  if (warning) return false;
  for (const p of bait) if (t.includes(p)) return true;
  const sensitive = ['seed phrase', 'seed words', 'recovery phrase', 'mnemonic', 'private key', 'passphrase'];
  const asks = ['send', 'give', 'share', 'enter', 'type', 'tell', 'dm', 'drop', 'post your', 'need your'];
  for (const s of sensitive) {
    if (!t.includes(s)) continue;
    for (const a of asks) if (t.includes(a)) return true;
  }
  if (/\b(password|passcode|otp|2fa code|verification code)\b/.test(t)) {
    for (const a of asks) if (t.includes(a)) return true;
  }
  return false;
}

/* Link screen: returns the first non-own URL found, or null. */
function tdcForeignLink(text) {
  const t = String(text || '');
  const re = /(https?:\/\/[^\s<>"']+|www\.[^\s<>"']+|\b(?:t\.me|bit\.ly|tinyurl\.com|goo\.gl|rb\.gy|shorturl\.at)\/[^\s<>"']*)/gi;
  let m;
  while ((m = re.exec(t)) !== null) {
    let host = '';
    try {
      const u = new URL(m[0].startsWith('http') ? m[0] : 'https://' + m[0]);
      host = u.hostname.toLowerCase().replace(/^www\./, '');
    } catch (e) { return m[0]; }
    const own = TDC_OWN_HOSTS.some(h => host === h || host.endsWith('.' + h));
    if (!own) return m[0];
  }
  return null;
}

const TDC_PROFANITY = ['fuck', 'shit', 'bitch', 'asshole', 'bastard', 'whore', 'slut', 'nigger', 'nigga', 'faggot', 'retard', 'cunt', 'dickhead', 'motherfucker'];
function tdcMaskProfanity(text) {
  let out = String(text || '');
  for (const w of TDC_PROFANITY) {
    out = out.replace(new RegExp('\\b' + w + '\\b', 'gi'), '***');
  }
  return out;
}

async function tdcGetBans() {
  const out = await upstashPipeline([['GET', 'tdc:bans']]);
  try {
    const arr = JSON.parse((out[0] && out[0].result) || '[]');
    return Array.isArray(arr) ? arr : [];
  } catch (e) { return []; }
}

async function tdcGetFrozen() {
  const out = await upstashPipeline([['GET', 'tdc:frozen']]);
  return String((out[0] && out[0].result) || '') === '1';
}

/* Who is posting/reading. A valid code hash wins over the guest
   identity and FORCES name + badge; otherwise a well-formed guest
   id + a non-reserved name is required. Returns null when neither
   holds — callers answer a plain refusal. */
async function tdcIdentity(body) {
  const hash = String(body.hash || '').toLowerCase();
  if (tdaIsHash(hash)) {
    const stored = await tdaStoredOwner();
    const isOwner = (stored.ownerHash && tdaHashEq(hash, stored.ownerHash)) ||
      (!stored.ownerHash && tdaHashEq(hash, TDA_BOOTSTRAP_HASH));
    if (isOwner) return { kind: 'owner', badge: 'owner', name: 'Tom', uid: 'owner' };
    const seat = await tdaResolveSeat(hash);
    if (seat) return { kind: 'seat', badge: 'builder', name: tdcCleanName(seat.name) || 'Builder', uid: 'seat:' + String(seat.id || '') };
  }
  const gid = String(body.gid || '');
  const name = tdcCleanName(body.name);
  if (!/^[a-z0-9-]{8,64}$/i.test(gid) || !name) return null;
  if (TDC_RESERVED_NAME.test(name)) return { kind: 'reserved' };
  return { kind: 'guest', badge: '', name, uid: 'guest:' + gid };
}

function tdcPublicMsg(o) {
  return {
    id: String(o.id || ''),
    ts: Number(o.ts) || 0,
    name: String(o.name || ''),
    badge: ['owner', 'builder'].includes(o.badge) ? o.badge : '',
    text: String(o.text || ''),
  };
}

export async function tdcHandler(req, res) {
  if (req.method !== 'GET' && req.method !== 'POST') {
    return res.status(405).json({ ok: false, error: 'method not allowed' });
  }
  if (!process.env.NEONRUSH_UPSTASH_URL || !process.env.NEONRUSH_UPSTASH_TOKEN) {
    return res.status(500).json({ ok: false, unavailable: true, error: 'storage not configured' });
  }
  res.setHeader('Cache-Control', 'no-store');

  if (req.method === 'GET') {
    try {
      const frozen = await tdcGetFrozen();
      return res.status(200).json({ ok: true, frozen });
    } catch (e) {
      return res.status(500).json({ ok: false, unavailable: true, error: 'service unavailable' });
    }
  }

  let body = req.body;
  if (typeof body === 'string') { try { body = JSON.parse(body); } catch (e) { body = null; } }
  if (!body || typeof body !== 'object') return res.status(400).json({ ok: false, error: 'bad request' });
  const action = String(body.action || '');
  const room = String(body.room || 'main');
  if (!TDC_ROOMS[room]) return res.status(400).json({ ok: false, error: 'unknown room' });

  try {
    const me = await tdcIdentity(body);
    if (!me) return res.status(200).json({ ok: false, error: 'join first — pick a display name' });
    if (me.kind === 'reserved') return res.status(200).json({ ok: false, reserved: true, error: 'that name is reserved — pick another' });

    const bans = await tdcGetBans();
    const banned = bans.some(b => b.uid === me.uid || String(b.name || '').toLowerCase() === me.name.toLowerCase());
    const frozen = await tdcGetFrozen();

    if (action === 'tdcList') {
      if (banned) return res.status(200).json({ ok: false, banned: true, error: 'you are banned from the chat' });
      const out = await upstashPipeline([['LRANGE', 'tdc:msgs:' + room, 0, TDC_PAGE - 1]]);
      const raw = (out[0] && out[0].result) || [];
      const msgs = [];
      for (const s of raw) { try { msgs.push(tdcPublicMsg(JSON.parse(s))); } catch (e) { /* skip corrupt row */ } }
      msgs.reverse();
      return res.status(200).json({ ok: true, room, frozen, you: { name: me.name, badge: me.badge }, msgs });
    }

    if (action === 'tdcPost') {
      if (banned) return res.status(200).json({ ok: false, banned: true, error: 'you are banned from the chat' });
      if (frozen && me.kind !== 'owner') return res.status(200).json({ ok: false, frozen: true, error: 'chat is paused by the owner right now' });
      const text = String(body.text || '').replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g, ' ').trim().slice(0, TDC_TEXT_MAX);
      if (!text) return res.status(200).json({ ok: false, error: 'empty message' });
      if (tdcScamHit(text)) {
        return res.status(200).json({ ok: false, blocked: 'scam', error: 'blocked — that looks like a scam ask. Nobody from Tom\u2019s Dev will ever ask for seed words, keys, passwords or codes.' });
      }
      const foreign = tdcForeignLink(text);
      if (foreign) {
        return res.status(200).json({ ok: false, held: 'link', error: 'outside links are held here — only our own game and site links post. An owner can share more in the app.' });
      }
      const pace = await upstashPipeline([['SET', 'tdc:rate:' + me.uid, '1', 'PX', String(TDC_RATE_MS), 'NX']]);
      if (!pace[0] || !pace[0].result) return res.status(200).json({ ok: false, slow: true, error: 'slow down a touch — one message at a time' });
      const msg = {
        id: Date.now().toString(36) + Math.random().toString(36).slice(2, 8),
        ts: Date.now(),
        name: me.name,
        badge: me.badge,
        uid: me.uid,
        text: tdcMaskProfanity(text),
      };
      await upstashPipeline([
        ['LPUSH', 'tdc:msgs:' + room, JSON.stringify(msg)],
        ['LTRIM', 'tdc:msgs:' + room, 0, TDC_MSG_CAP - 1],
      ]);
      return res.status(200).json({ ok: true, msg: tdcPublicMsg(msg) });
    }

    if (action === 'tdcMod') {
      if (me.kind !== 'owner') return res.status(200).json({ ok: false, ownerRequired: true, error: 'owner code required' });
      const op = String(body.op || '');
      if (op === 'state') {
        return res.status(200).json({ ok: true, frozen, bans: bans.map(b => ({ uid: String(b.uid || ''), name: String(b.name || ''), ts: Number(b.ts) || 0 })) });
      }
      if (op === 'freeze') {
        const on = body.on ? '1' : '0';
        await upstashPipeline([['SET', 'tdc:frozen', on]]);
        return res.status(200).json({ ok: true, frozen: on === '1' });
      }
      if (op === 'clear') {
        await upstashPipeline([['DEL', 'tdc:msgs:' + room]]);
        return res.status(200).json({ ok: true, cleared: room });
      }
      if (op === 'delete' || op === 'ban') {
        const mid = String(body.mid || '');
        if (!mid) return res.status(400).json({ ok: false, error: 'bad request' });
        const out = await upstashPipeline([['LRANGE', 'tdc:msgs:' + room, 0, TDC_MSG_CAP - 1]]);
        const raw = (out[0] && out[0].result) || [];
        const rows = [];
        let target = null;
        for (const s of raw) {
          try { const o = JSON.parse(s); rows.push({ raw: s, o }); if (String(o.id) === mid) target = o; } catch (e) { /* skip */ }
        }
        if (!target) return res.status(200).json({ ok: false, error: 'message not found' });
        if (op === 'ban') {
          if (target.uid === 'owner') return res.status(200).json({ ok: false, error: 'cannot ban the owner' });
          const next = bans.filter(b => b.uid !== target.uid);
          next.push({ uid: String(target.uid || ''), name: String(target.name || ''), ts: Date.now() });
          await upstashPipeline([['SET', 'tdc:bans', JSON.stringify(next.slice(-TDC_BANS_CAP))]]);
        }
        const keep = rows.filter(r => String(r.o.id) !== mid).map(r => r.raw);
        const cmds = [['DEL', 'tdc:msgs:' + room]];
        for (let i = keep.length - 1; i >= 0; i--) cmds.push(['LPUSH', 'tdc:msgs:' + room, keep[i]]);
        await upstashPipeline(cmds);
        return res.status(200).json({ ok: true, removed: mid, banned: op === 'ban' ? String(target.name || '') : undefined });
      }
      if (op === 'unban') {
        const name = String(body.name || '').toLowerCase();
        const uid = String(body.uid || '');
        const next = bans.filter(b => String(b.name || '').toLowerCase() !== name && b.uid !== uid);
        await upstashPipeline([['SET', 'tdc:bans', JSON.stringify(next)]]);
        return res.status(200).json({ ok: true, bans: next.length });
      }
      return res.status(400).json({ ok: false, error: 'unknown op' });
    }

    return res.status(400).json({ ok: false, error: 'unknown action' });
  } catch (e) {
    console.error('tdc action failed', action, e && e.message);
    return res.status(500).json({ ok: false, unavailable: true, error: 'service unavailable' });
  }
}
/* studio-community:end */
/* safe-chat:start — SAFE CHAT (client/public/safe-chat/). Tom's order
   (2026-11-18): a SEPARATE, standalone encrypted messaging app —
   "something like Telegram", basic platform first, kept apart from
   Tom's Dev and every other page (nothing links to it; it links
   nowhere). Reached via /api/luna-games?chatx=1 (folded into this
   router for the same 12-function-cap reason as every block above).
   REAL END-TO-END ENCRYPTION, honestly built: the room key is a
   256-bit AES-GCM key generated IN THE BROWSER when a room is
   created and travels ONLY in the invite link's URL fragment
   (#r=…&k=…&n=…) — fragments are never sent to a server. Every
   message payload {name, text, ts} is encrypted on the sender's
   device; this handler stores ONLY {ct, iv, ts} rows (ciphertext +
   IV + server timestamp) in chatx:msgs:<roomId>, capped at
   CHATX_CAP newest. The server never sees keys, names, room names
   or plaintext, and cannot read anything it stores. Anyone holding
   a room link can join and read that room — the page says so in
   plain words ("share the link like a key"). No accounts, no
   passwords, no wallets, no seeds: join = open the link, type a
   display name (kept on the device only). Validation here is shape
   only: room id charset/length, IV must be base64 of 12 bytes,
   ciphertext base64 within a size cap that matches the client's
   1000-char plaintext cap. Reads are page-sized and unmetered;
   there is deliberately NO identity server-side to rate-limit by —
   the client's own 1.5s pace + the ciphertext size cap are the
   flood brakes, and a room's worst case is 100 stored rows. This
   block holds no keys, signs nothing and moves no funds. */
const CHATX_CAP = 100;
const CHATX_CT_MAX = 8192;
const CHATX_ROOM_RE = /^[A-Za-z0-9_-]{10,64}$/;
const CHATX_B64_RE = /^[A-Za-z0-9+/]+={0,2}$/;

export async function chatxHandler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ ok: false, error: 'method not allowed' });
  }
  if (!process.env.NEONRUSH_UPSTASH_URL || !process.env.NEONRUSH_UPSTASH_TOKEN) {
    return res.status(500).json({ ok: false, unavailable: true, error: 'storage not configured' });
  }
  res.setHeader('Cache-Control', 'no-store');

  let body = req.body;
  if (typeof body === 'string') { try { body = JSON.parse(body); } catch (e) { body = null; } }
  if (!body || typeof body !== 'object') return res.status(400).json({ ok: false, error: 'bad request' });
  const action = String(body.action || '');
  const room = String(body.room || '');
  if (!CHATX_ROOM_RE.test(room)) return res.status(400).json({ ok: false, error: 'unknown room' });

  try {
    if (action === 'chatxList') {
      const out = await upstashPipeline([['LRANGE', 'chatx:msgs:' + room, 0, CHATX_CAP - 1]]);
      const raw = (out[0] && out[0].result) || [];
      const msgs = [];
      for (const s of raw) {
        try {
          const o = JSON.parse(s);
          if (o && typeof o.ct === 'string' && typeof o.iv === 'string') msgs.push({ ct: o.ct, iv: o.iv, ts: Number(o.ts) || 0 });
        } catch (e) { /* skip corrupt row */ }
      }
      msgs.reverse();
      return res.status(200).json({ ok: true, msgs });
    }

    if (action === 'chatxPost') {
      const ct = String(body.ct || '');
      const iv = String(body.iv || '');
      if (!ct || ct.length > CHATX_CT_MAX || !CHATX_B64_RE.test(ct)) {
        return res.status(200).json({ ok: false, error: 'bad message' });
      }
      if (!CHATX_B64_RE.test(iv)) return res.status(200).json({ ok: false, error: 'bad message' });
      let ivLen = -1;
      try { ivLen = Buffer.from(iv, 'base64').length; } catch (e) { /* stays -1 */ }
      if (ivLen !== 12) return res.status(200).json({ ok: false, error: 'bad message' });
      const row = { ct, iv, ts: Date.now() };
      await upstashPipeline([
        ['LPUSH', 'chatx:msgs:' + room, JSON.stringify(row)],
        ['LTRIM', 'chatx:msgs:' + room, 0, CHATX_CAP - 1],
      ]);
      return res.status(200).json({ ok: true, ts: row.ts });
    }

    return res.status(400).json({ ok: false, error: 'unknown action' });
  } catch (e) {
    console.error('chatx action failed', action, e && e.message);
    return res.status(500).json({ ok: false, unavailable: true, error: 'service unavailable' });
  }
}
/* safe-chat:end */




/* hussy-signals:start — DEV STUDIO SIGNALS chain-token candle relay,
   folded into this router for the same 12-function-cap reason as the
   fx-signal relay above. Reached via ?hsig=<TOKEN> (the signals page
   calls /api/luna-games?hsig=<TOKEN> directly — no vercel.json
   rewrite needed, same as ?fxpair=). Why: the DEV STUDIO SIGNALS page
   (client/public/fx-signals-h7q2/) needs 1-minute candles for chain
   tokens from Yahoo Finance, which sends no CORS header, so the page
   cannot read Yahoo from a browser. This relay fetches Yahoo
   SERVER-side and returns trimmed candles only — timestamps plus
   OHLC, null closes dropped, exactly the shape the page's engine
   consumes (same MACD 12,26,9 + DeMarker 7 engine as the Forex bot).
   Allowlist: ONLY the tokens below, each verified server-side on
   2026-11-08 to serve real 1-minute Yahoo candles (token -> Yahoo
   symbol). Anything else is a 400, so the relay can never be used
   as an open Yahoo proxy. Terra Classic CW20s (FRG, GDEX, ...) have
   NO Yahoo feed and are NOT in this allowlist — the page lists them
   UNAVAILABLE rather than guessing. It holds no keys, signs
   nothing, stores nothing, and never logs the request. */
const HSIG_SYMBOLS = {
  /* Luna Classic (Terra Classic) */
  LUNC: 'LUNC-USD', USTC: 'USTC-USD',
  /* Ethereum */
  ETH: 'ETH-USD', LINK: 'LINK-USD', UNI: 'UNI7083-USD', AAVE: 'AAVE-USD',
  SHIB: 'SHIB-USD', PEPE: 'PEPE24478-USD', CRV: 'CRV-USD', LDO: 'LDO-USD',
  /* Solana */
  SOL: 'SOL-USD', RAY: 'RAY-USD', BONK: 'BONK-USD', WIF: 'WIF-USD',
  JTO: 'JTO-USD', ORCA: 'ORCA-USD', PYTH: 'PYTH-USD',
  /* BNB Chain */
  BNB: 'BNB-USD', CAKE: 'CAKE-USD', TWT: 'TWT-USD', XVS: 'XVS-USD',
  /* Cosmos */
  ATOM: 'ATOM-USD', OSMO: 'OSMO-USD', INJ: 'INJ-USD', TIA: 'TIA-USD',
  SEI: 'SEI-USD', KUJI: 'KUJI-USD', AKT: 'AKT-USD',
  /* Kava */
  KAVA: 'KAVA-USD',
  /* Majors + top-50 — Victor crypto best-buy page (2026-11-20) */
  BTC: 'BTC-USD', XRP: 'XRP-USD', DOGE: 'DOGE-USD', ADA: 'ADA-USD',
  TRX: 'TRX-USD', XLM: 'XLM-USD', AVAX: 'AVAX-USD', HBAR: 'HBAR-USD',
  BCH: 'BCH-USD', DOT: 'DOT-USD', LTC: 'LTC-USD', NEAR: 'NEAR-USD',
  APT: 'APT-USD', ICP: 'ICP-USD', ETC: 'ETC-USD', POL: 'POL-USD',
  VET: 'VET-USD', ALGO: 'ALGO-USD', FIL: 'FIL-USD', ARB: 'ARB-USD',
  OP: 'OP-USD', SUI: 'SUI-USD', ONDO: 'ONDO-USD', FET: 'FET-USD',
  STX: 'STX-USD', IMX: 'IMX-USD',
};
const HSIG_UPSTREAM = 'https://query1.finance.yahoo.com/v8/finance/chart/';

export async function hsPairHandler(req, res) {
  if (req.method !== 'GET') return res.status(405).json({ error: 'method not allowed' });
  const token = String((req.query && req.query.hsig) || '').toUpperCase();
  const symbol = HSIG_SYMBOLS[token];
  if (!symbol) return res.status(400).json({ error: 'token not allowed' });
  const url = HSIG_UPSTREAM + encodeURIComponent(symbol) + '?interval=1m&range=1d';
  try {
    const ctl = new AbortController();
    const t = setTimeout(() => ctl.abort(), 12000);
    const r = await fetch(url, {
      headers: { 'user-agent': 'Mozilla/5.0 (compatible; dev-studio-signals-relay)' },
      signal: ctl.signal,
    });
    clearTimeout(t);
    if (!r.ok) return res.status(502).json({ error: 'price source unavailable (HTTP ' + r.status + ')' });
    const data = await r.json();
    const result = data && data.chart && Array.isArray(data.chart.result) ? data.chart.result[0] : null;
    const q = result && result.indicators && Array.isArray(result.indicators.quote) ? result.indicators.quote[0] : null;
    if (!result || !Array.isArray(result.timestamp) || !q || !Array.isArray(q.close)) {
      return res.status(502).json({ error: 'price source returned no candle data' });
    }
    const candles = [];
    for (let i = 0; i < result.timestamp.length; i++) {
      const c = q.close[i];
      if (c === null || c === undefined) continue;
      candles.push({
        t: result.timestamp[i],
        o: (q.open && q.open[i] != null) ? q.open[i] : c,
        h: (q.high && q.high[i] != null) ? q.high[i] : c,
        l: (q.low && q.low[i] != null) ? q.low[i] : c,
        c,
      });
    }
    if (!candles.length) return res.status(502).json({ error: 'price source returned no candles' });
    res.setHeader('Cache-Control', 's-maxage=30, stale-while-revalidate=30');
    return res.status(200).json({
      ok: true,
      token,
      symbol,
      source: 'Yahoo Finance (site server)',
      fetchedAt: Date.now(),
      regularMarketTime: (result.meta && result.meta.regularMarketTime) || null,
      candles,
    });
  } catch (e) {
    console.error('hsig relay failed', token, e && e.message);
    return res.status(502).json({ error: 'price source unavailable' });
  }
}
/* hussy-signals:end */

/* hussy-bot:start — HUSSY TRADING BOT control link (client/public/
   hussy-bot/). One seat, one human: Hussy. The page is his control
   link for the trading bot Tom's Dev built him — settings he can
   change any time (pot, leverage, stop-loss, take-profit, risk,
   pairs, Paper/Live, PAUSE), the bot's live status, and the wallet
   connect + agent approval for live trading on Hyperliquid.
   Reached via /api/luna-games?hussybot=1 directly.
   Storage: Upstash keys hb:* —
     hb:codehash   SHA-256 of his page access code (the page sends
                   only the hash; the plain code never travels and
                   is never stored). While unset, HB_BOOTSTRAP_HASH
                   below — the hash of the first code Tom hands him —
                   is the valid code (kava-code bootstrap pattern).
     hb:botsecret  SHA-256 of the bot's file-only shared secret.
                   While unset, HB_BOT_BOOTSTRAP_HASH is accepted
                   once and the bot registers its hash (tda
                   builder-secret pattern); after that the stored
                   hash alone rules.
     hb:settings   his settings JSON (validated server-side).
     hb:status:paper / hb:status:live — status JSON the two bot
                   processes post each tick; display only.
     hb:agent      {address, network, registeredAt} — the bot's
                   Hyperliquid agent (API) wallet address, posted by
                   the bot. The agent KEY never leaves the bot host.
     hb:master     {address, savedAt} — Hussy's own wallet address,
                   saved by the page after he connects. Public data.
     hb:approvelog — a capped LIST (newest first, max 20 entries) of
                   approve-signing attempt logs the page posts after
                   every approveAgent signature chain (action
                   hbApproveLog): which eth_signTypedData_v4 parameter
                   shapes were tried, in order, and the exact error
                   each one drew from his wallet. Diagnostic only —
                   no signatures, no keys. Read back by the bot side
                   (action hbBotApproveLogs).
   This endpoint holds no keys, signs nothing, moves no funds. The
   page talks to Hyperliquid directly for the approveAgent
   signature; the bot signs orders with the agent key on its own
   host. Brute-force rail copied from kava-code: failed code
   attempts counted per hashed IP; 8 in 15 min locks that IP out
   of the code actions for 15 min; any success clears it. */
const HB_CODE_KEY = 'hb:codehash';
const HB_BOOTSTRAP_HASH = '0e00d51bdffdd8f63648479525057e5218272390ba6026ccdda6b7304031bef8';
const HB_BOTSECRET_KEY = 'hb:botsecret';
const HB_BOT_BOOTSTRAP_HASH = 'e97ad23a1490005242c5e1e441ac687ba01229f0696c800e4945551e215050e7';
const HB_SETTINGS_KEY = 'hb:settings';
const HB_STATUS_PAPER_KEY = 'hb:status:paper';
const HB_STATUS_LIVE_KEY = 'hb:status:live';
const HB_AGENT_KEY = 'hb:agent';
const HB_MASTER_KEY = 'hb:master';
const HB_APPROVELOG_KEY = 'hb:approvelog';
const HB_APPROVELOG_CAP = 20;
const HB_MAX_FAILS = 8;
const HB_FAIL_WINDOW_SEC = 15 * 60;
const HB_LOCKOUT_SEC = 15 * 60;

const HB_DEFAULT_SETTINGS = {
  potCapitalUsdt: 400,
  leverage: 3,
  stopLossPct: 2,
  takeProfitPct: 4,
  riskPerTradePct: 2,
  pairs: { BTC: true, ETH: true, BNB: true, XRP: true, SOL: true, DOGE: true },
  mode: 'paper',
  paused: false,
  closeAllRequestAt: null,
  updatedAt: null,
};

function hbIsHash(v) { return typeof v === 'string' && /^[0-9a-f]{64}$/.test(v); }

function hbHashEq(a, b) {
  const ba = Buffer.from(String(a)), bb = Buffer.from(String(b));
  return ba.length === bb.length && crypto.timingSafeEqual(ba, bb);
}

function hbIpTag(req) {
  const xff = String((req.headers && req.headers['x-forwarded-for']) || '');
  const ip = xff.split(',')[0].trim() || (req.socket && req.socket.remoteAddress) || 'unknown';
  return crypto.createHash('sha256').update(ip).digest('hex').slice(0, 16);
}

async function hbGetJson(key) {
  const out = await upstashPipeline([['GET', key]]);
  const v = out[0] && out[0].result;
  if (!v) return null;
  try { return JSON.parse(v); } catch (e) { return null; }
}

async function hbEffectiveCodeHash() {
  const out = await upstashPipeline([['GET', HB_CODE_KEY]]);
  const v = out[0] && out[0].result;
  return hbIsHash(v) ? v : HB_BOOTSTRAP_HASH;
}

async function hbBotHashOk(bhash) {
  if (!hbIsHash(bhash)) return false;
  const out = await upstashPipeline([['GET', HB_BOTSECRET_KEY]]);
  const v = out[0] && out[0].result;
  const effective = hbIsHash(v) ? v : HB_BOT_BOOTSTRAP_HASH;
  return hbHashEq(bhash, effective);
}

async function hbLockState(tag) {
  const out = await upstashPipeline([['GET', 'hb:lock:' + tag], ['TTL', 'hb:lock:' + tag]]);
  const locked = !!(out[0] && out[0].result);
  const ttl = out[1] && typeof out[1].result === 'number' && out[1].result > 0 ? out[1].result : HB_LOCKOUT_SEC;
  return { locked, retryAfterSec: locked ? ttl : 0 };
}

async function hbRecordFail(tag) {
  const out = await upstashPipeline([['INCR', 'hb:fail:' + tag]]);
  const n = (out[0] && out[0].result) || 0;
  if (n === 1) {
    try { await upstashPipeline([['EXPIRE', 'hb:fail:' + tag, HB_FAIL_WINDOW_SEC]]); } catch (e) { /* best-effort */ }
  }
  if (n >= HB_MAX_FAILS) {
    await upstashPipeline([['SET', 'hb:lock:' + tag, '1', 'EX', HB_LOCKOUT_SEC], ['DEL', 'hb:fail:' + tag]]);
    return true;
  }
  return false;
}

async function hbClearFails(tag) {
  try { await upstashPipeline([['DEL', 'hb:fail:' + tag]]); } catch (e) { /* best-effort */ }
}

/* Validate + normalise a settings object from the page. Returns a
   clean settings object, or null when anything is out of range —
   the bot clamps again on its side, this is the first gate. */
function hbValidateSettings(input) {
  if (!input || typeof input !== 'object') return null;
  const num = (v, lo, hi) => {
    const n = Number(v);
    return Number.isFinite(n) && n >= lo && n <= hi ? n : null;
  };
  const pot = num(input.potCapitalUsdt, 10, 1000000);
  const levRaw = Number(input.leverage);
  const lev = Number.isInteger(levRaw) && levRaw >= 1 && levRaw <= 10 ? levRaw : null;
  const sl = num(input.stopLossPct, 0.5, 10);
  const tp = num(input.takeProfitPct, 0.5, 20);
  const risk = num(input.riskPerTradePct, 0.25, 5);
  if (pot === null || lev === null || sl === null || tp === null || risk === null) return null;
  const pairsIn = input.pairs && typeof input.pairs === 'object' ? input.pairs : {};
  const mode = input.mode === 'live' ? 'live' : 'paper';
  return {
    potCapitalUsdt: pot,
    leverage: lev,
    stopLossPct: sl,
    takeProfitPct: tp,
    riskPerTradePct: risk,
    pairs: { BTC: pairsIn.BTC !== false, ETH: pairsIn.ETH !== false, BNB: pairsIn.BNB !== false, XRP: pairsIn.XRP !== false, SOL: pairsIn.SOL !== false, DOGE: pairsIn.DOGE !== false },
    mode,
    paused: input.paused === true,
    closeAllRequestAt: typeof input.closeAllRequestAt === 'string' && input.closeAllRequestAt.length <= 40
      ? input.closeAllRequestAt : null,
    updatedAt: new Date().toISOString(),
  };
}

/* Sanitise one approve-attempt log from the page. Every field is
   length-capped and the attempts list is bounded; anything malformed
   drops the whole log (returns null). The stored record gains a
   server receive timestamp. */
function hbSanitizeApproveLog(log) {
  if (!log || typeof log !== 'object') return null;
  const str = (v, n) => String(v === null || v === undefined ? '' : v).slice(0, n);
  const addr = (v) => (/^0x[0-9a-fA-F]{40}$/.test(String(v || '')) ? String(v) : '');
  const attemptsIn = Array.isArray(log.attempts) ? log.attempts.slice(0, 16) : [];
  if (!attemptsIn.length) return null;
  const attempts = attemptsIn.map((a) => {
    const rec = a && typeof a === 'object' ? a : {};
    return {
      shape: str(rec.shape, 40),
      pass: (rec.pass === 1 || rec.pass === 2) ? rec.pass : null,
      sentAddress: addr(rec.sentAddress),
      at: str(rec.at, 40),
      ok: rec.ok === true,
      code: (typeof rec.code === 'number' || typeof rec.code === 'string') ? String(rec.code).slice(0, 20) : null,
      errorName: str(rec.errorName, 80),
      errorMessage: str(rec.errorMessage, 300),
      scopeErr: rec.scopeErr === true,
    };
  });
  /* Round 4: the sign-time context the page captured from the
     wallet itself — fresh accounts from the pre-signing
     eth_requestAccounts, provider.selectedAddress, the wallet's
     chainId at sign time. Public addresses only; strictly shaped. */
  let context = null;
  if (log.context && typeof log.context === 'object') {
    const c = log.context;
    context = {
      freshAccounts: Array.isArray(c.freshAccounts) ? c.freshAccounts.slice(0, 4).map(addr).filter(Boolean) : [],
      selectedAddress: addr(c.selectedAddress),
      chainIdAtSign: str(c.chainIdAtSign, 20),
      refreshed: c.refreshed === true,
      escalated: c.escalated === true,
      refreshError: str(c.refreshError, 200),
    };
  }
  return {
    receivedAt: new Date().toISOString(),
    at: str(log.at, 40),
    account: addr(log.account),
    ua: str(log.ua, 200),
    outcome: str(log.outcome, 40),
    context,
    attempts,
  };
}

export async function hussyBotHandler(req, res) {
  if (req.method !== 'GET' && req.method !== 'POST') {
    return res.status(405).json({ ok: false, error: 'method not allowed' });
  }
  if (!process.env.NEONRUSH_UPSTASH_URL || !process.env.NEONRUSH_UPSTASH_TOKEN) {
    return res.status(500).json({ ok: false, unavailable: true, error: 'storage not configured' });
  }
  res.setHeader('Cache-Control', 'no-store');

  if (req.method === 'GET') {
    try {
      const out = await upstashPipeline([['GET', HB_CODE_KEY]]);
      return res.status(200).json({ ok: true, set: hbIsHash(out[0] && out[0].result) });
    } catch (e) {
      return res.status(500).json({ ok: false, unavailable: true, error: 'service unavailable' });
    }
  }

  let body = req.body;
  if (typeof body === 'string') { try { body = JSON.parse(body); } catch (e) { body = null; } }
  if (!body || typeof body !== 'object') return res.status(400).json({ ok: false, error: 'bad request' });
  const action = String(body.action || '');
  const tag = hbIpTag(req);

  /* ---- bot-authenticated actions (hash of the file-only secret) ---- */
  if (action === 'hbBotRegister' || action === 'hbBotGet' || action === 'hbBotStatus' || action === 'hbBotAgent' || action === 'hbBotApproveLogs') {
    const bhash = String(body.bhash || '').toLowerCase();
    if (!hbIsHash(bhash)) return res.status(400).json({ ok: false, error: 'bad hash' });
    try {
      if (action === 'hbBotRegister') {
        const out = await upstashPipeline([['GET', HB_BOTSECRET_KEY]]);
        const stored = out[0] && out[0].result;
        if (hbIsHash(stored)) return res.status(200).json({ ok: hbHashEq(bhash, stored), registered: true });
        if (!hbHashEq(bhash, HB_BOT_BOOTSTRAP_HASH)) return res.status(200).json({ ok: false, error: 'bootstrap mismatch' });
        await upstashPipeline([['SET', HB_BOTSECRET_KEY, bhash]]);
        return res.status(200).json({ ok: true, registered: true });
      }
      if (!(await hbBotHashOk(bhash))) return res.status(200).json({ ok: false, error: 'bot auth failed' });
      if (action === 'hbBotGet') {
        const [settings, master, agent] = await Promise.all([
          hbGetJson(HB_SETTINGS_KEY), hbGetJson(HB_MASTER_KEY), hbGetJson(HB_AGENT_KEY),
        ]);
        return res.status(200).json({ ok: true, settings: settings || HB_DEFAULT_SETTINGS, master, agent });
      }
      if (action === 'hbBotApproveLogs') {
        const out = await upstashPipeline([['LRANGE', HB_APPROVELOG_KEY, 0, HB_APPROVELOG_CAP - 1]]);
        const raw = (out[0] && out[0].result) || [];
        const logs = raw.map((v) => { try { return JSON.parse(v); } catch (e) { return null; } }).filter(Boolean);
        return res.status(200).json({ ok: true, logs });
      }
      if (action === 'hbBotStatus') {
        const kind = body.kind === 'live' ? 'live' : 'paper';
        const status = body.status && typeof body.status === 'object' ? body.status : null;
        if (!status) return res.status(400).json({ ok: false, error: 'bad status' });
        const raw = JSON.stringify(status);
        if (raw.length > 20000) return res.status(400).json({ ok: false, error: 'status too large' });
        await upstashPipeline([['SET', kind === 'live' ? HB_STATUS_LIVE_KEY : HB_STATUS_PAPER_KEY, raw]]);
        return res.status(200).json({ ok: true });
      }
      // hbBotAgent
      const addr = String((body.agent && body.agent.address) || '');
      if (!/^0x[0-9a-fA-F]{40}$/.test(addr)) return res.status(400).json({ ok: false, error: 'bad agent address' });
      const rec = { address: addr, network: 'mainnet', registeredAt: new Date().toISOString() };
      await upstashPipeline([['SET', HB_AGENT_KEY, JSON.stringify(rec)]]);
      return res.status(200).json({ ok: true, agent: rec });
    } catch (e) {
      console.error('hussy bot action failed', action, e && e.message);
      return res.status(500).json({ ok: false, unavailable: true, error: 'service unavailable' });
    }
  }

  /* ---- code-authenticated actions (Hussy's page) ---- */
  const hash = String(body.hash || '').toLowerCase();
  if (!hbIsHash(hash)) return res.status(400).json({ ok: false, error: 'bad hash' });
  try {
    const lock = await hbLockState(tag);
    if (lock.locked) return res.status(200).json({ ok: false, locked: true, retryAfterSec: lock.retryAfterSec, error: 'too many tries — locked for a bit' });
    const effective = await hbEffectiveCodeHash();
    if (!hbHashEq(hash, effective)) {
      const tripped = await hbRecordFail(tag);
      return res.status(200).json({ ok: false, locked: tripped, error: 'code not right' });
    }
    await hbClearFails(tag);

    if (action === 'hbCheck') return res.status(200).json({ ok: true });

    if (action === 'hbApproveLog') {
      const rec = hbSanitizeApproveLog(body.log);
      if (!rec) return res.status(200).json({ ok: false, error: 'bad log' });
      await upstashPipeline([
        ['LPUSH', HB_APPROVELOG_KEY, JSON.stringify(rec)],
        ['LTRIM', HB_APPROVELOG_KEY, 0, HB_APPROVELOG_CAP - 1],
      ]);
      return res.status(200).json({ ok: true, stored: true });
    }

    if (action === 'hbGet') {
      const [settings, statusPaper, statusLive, agent, master] = await Promise.all([
        hbGetJson(HB_SETTINGS_KEY), hbGetJson(HB_STATUS_PAPER_KEY), hbGetJson(HB_STATUS_LIVE_KEY),
        hbGetJson(HB_AGENT_KEY), hbGetJson(HB_MASTER_KEY),
      ]);
      return res.status(200).json({
        ok: true,
        settings: settings || HB_DEFAULT_SETTINGS,
        status: { paper: statusPaper, live: statusLive },
        agent, master,
      });
    }

    if (action === 'hbSaveSettings') {
      const clean = hbValidateSettings(body.settings);
      if (!clean) return res.status(200).json({ ok: false, error: 'a setting is out of range' });
      await upstashPipeline([['SET', HB_SETTINGS_KEY, JSON.stringify(clean)]]);
      return res.status(200).json({ ok: true, settings: clean });
    }

    if (action === 'hbSaveMaster') {
      const addr = String((body.master && body.master.address) || '');
      if (!/^0x[0-9a-fA-F]{40}$/.test(addr)) return res.status(200).json({ ok: false, error: 'bad wallet address' });
      const rec = { address: addr, savedAt: new Date().toISOString() };
      await upstashPipeline([['SET', HB_MASTER_KEY, JSON.stringify(rec)]]);
      return res.status(200).json({ ok: true, master: rec });
    }

    if (action === 'hbCodeSet') {
      const newHash = String(body.newHash || '').toLowerCase();
      if (!hbIsHash(newHash)) return res.status(400).json({ ok: false, error: 'bad hash' });
      await upstashPipeline([['SET', HB_CODE_KEY, newHash]]);
      return res.status(200).json({ ok: true, set: true });
    }

    return res.status(400).json({ ok: false, error: 'unknown action' });
  } catch (e) {
    console.error('hussy page action failed', action, e && e.message);
    return res.status(500).json({ ok: false, unavailable: true, error: 'service unavailable' });
  }
}
/* hussy-bot:end */

/* hussy-ladder:start
   HUSSY'S LADDER BOT — the game screen for the $1 -> $10,000
   pump.fun ladder challenge (the RGK format, recreated for Hussy
   by Tom's Dev, Nov 18, 2026). Reached via ?hussyladder=1.
   The bot (its own host) posts its status here, authenticated by
   the SHA-256 of a file-only secret (hlBotRegister / hlBotStatus —
   the tda/hb bootstrap pattern: HL_BOT_BOOTSTRAP_HASH is accepted
   until the bot registers, then the stored hash alone rules).
   Storage: Upstash keys hl:* —
     hl:botsecret  SHA-256 of the ladder bot's file-only secret.
     hl:status     the status JSON the bot posts each cycle
                   (level, pot, progress, trades, positions —
                   display only).
   The page reads with Hussy's SAME access code as his trading-bot
   page: hlCheck / hlGet verify against the hb effective code hash
   and share its per-IP brute-force lockout rails. This endpoint
   holds no keys, signs nothing, moves no funds. */
const HL_STATUS_KEY = 'hl:status';
const HL_BOTSECRET_KEY = 'hl:botsecret';
const HL_BOT_BOOTSTRAP_HASH = '41d7fa09cf49544606b428939a7c91d2f57e3740d821f2247dc9925ce8461a79';

async function hlBotHashOk(bhash) {
  if (!hbIsHash(bhash)) return false;
  const out = await upstashPipeline([['GET', HL_BOTSECRET_KEY]]);
  const v = out[0] && out[0].result;
  const effective = hbIsHash(v) ? v : HL_BOT_BOOTSTRAP_HASH;
  return hbHashEq(bhash, effective);
}

export async function hussyLadderHandler(req, res) {
  if (req.method !== 'GET' && req.method !== 'POST') {
    return res.status(405).json({ ok: false, error: 'method not allowed' });
  }
  if (!process.env.NEONRUSH_UPSTASH_URL || !process.env.NEONRUSH_UPSTASH_TOKEN) {
    return res.status(500).json({ ok: false, unavailable: true, error: 'storage not configured' });
  }
  res.setHeader('Cache-Control', 'no-store');

  if (req.method === 'GET') {
    try {
      const out = await upstashPipeline([['GET', HL_STATUS_KEY]]);
      return res.status(200).json({ ok: true, set: !!(out[0] && out[0].result) });
    } catch (e) {
      return res.status(500).json({ ok: false, unavailable: true, error: 'service unavailable' });
    }
  }

  let body = req.body;
  if (typeof body === 'string') { try { body = JSON.parse(body); } catch (e) { body = null; } }
  if (!body || typeof body !== 'object') return res.status(400).json({ ok: false, error: 'bad request' });
  const action = String(body.action || '');
  const tag = hbIpTag(req);

  /* ---- bot-authenticated actions (hash of the file-only secret) ---- */
  if (action === 'hlBotRegister' || action === 'hlBotStatus') {
    const bhash = String(body.bhash || '').toLowerCase();
    if (!hbIsHash(bhash)) return res.status(400).json({ ok: false, error: 'bad hash' });
    try {
      if (action === 'hlBotRegister') {
        const out = await upstashPipeline([['GET', HL_BOTSECRET_KEY]]);
        const stored = out[0] && out[0].result;
        if (hbIsHash(stored)) return res.status(200).json({ ok: hbHashEq(bhash, stored), registered: true });
        if (!hbHashEq(bhash, HL_BOT_BOOTSTRAP_HASH)) return res.status(200).json({ ok: false, error: 'bootstrap mismatch' });
        await upstashPipeline([['SET', HL_BOTSECRET_KEY, bhash]]);
        return res.status(200).json({ ok: true, registered: true });
      }
      if (!(await hlBotHashOk(bhash))) return res.status(200).json({ ok: false, error: 'bot auth failed' });
      const statusIn = body.status && typeof body.status === 'object' ? body.status : null;
      if (!statusIn) return res.status(400).json({ ok: false, error: 'bad status' });
      const raw = JSON.stringify(statusIn);
      if (raw.length > 20000) return res.status(400).json({ ok: false, error: 'status too large' });
      await upstashPipeline([['SET', HL_STATUS_KEY, raw]]);
      return res.status(200).json({ ok: true });
    } catch (e) {
      console.error('hussy ladder bot action failed', action, e && e.message);
      return res.status(500).json({ ok: false, unavailable: true, error: 'service unavailable' });
    }
  }

  /* ---- page actions (Hussy's access code — the same one as his
     trading-bot page; the hash check and lockout rails are hb's) ---- */
  const hash = String(body.hash || '').toLowerCase();
  if (!hbIsHash(hash)) return res.status(400).json({ ok: false, error: 'bad hash' });
  try {
    const lock = await hbLockState(tag);
    if (lock.locked) return res.status(200).json({ ok: false, locked: true, retryAfterSec: lock.retryAfterSec, error: 'too many tries — locked for a bit' });
    const effective = await hbEffectiveCodeHash();
    if (!hbHashEq(hash, effective)) {
      const tripped = await hbRecordFail(tag);
      return res.status(200).json({ ok: false, locked: tripped, error: 'code not right' });
    }
    await hbClearFails(tag);
    if (action === 'hlCheck') return res.status(200).json({ ok: true });
    if (action === 'hlGet') {
      const ladderStatus = await hbGetJson(HL_STATUS_KEY);
      return res.status(200).json({ ok: true, status: ladderStatus });
    }
    return res.status(400).json({ ok: false, error: 'unknown action' });
  } catch (e) {
    console.error('hussy ladder page action failed', action, e && e.message);
    return res.status(500).json({ ok: false, unavailable: true, error: 'service unavailable' });
  }
}
/* hussy-ladder:end */

/* =====================================================================
   JOB SITE ANALYZER — router block for client/api/luna-games.js
   DEPLOY STEPS (2 edits, no new api files):
   1. Paste this whole block into luna-games.js just BEFORE the
      "export default async function handler" line.
   2. In the default handler, after the ?hsig dispatch line, add:
        if (req.query && req.query.jsa !== undefined) return jsaHandler(req, res);
   ===================================================================== */

/* jobsite-analyzer:start — Job Site Analyzer (Tom's own work tool):
   /api/luna-games?jsa=1. Photo-analysis jobs + job diary storage.
   The page holds no keys and calls no AI itself: an analyze request
   is stored as a job in Upstash; the shop runner (the local machine
   that holds the Groq credential route) claims it, reads the photo
   with the vision model (qwen/qwen3.8-27b — proven 2026-11-20), and
   posts the answer back here. The runner proves itself with the
   SHA-256 of its file-only secret — only the hash ever leaves that
   machine, and the first claim registers it while the slot is unset
   (same pattern as the tda builder runner). The diary is keyed by
   the job name Tom types; entries live under jsa:diary:<slug>. */
const JSA_PHOTO_MAX = 520000;       /* base64 chars, analyzer photo */
const JSA_DIARY_PHOTO_MAX = 280000; /* base64 chars, diary photo */
const JSA_JOB_TTL = 3600;

function jsaSlug(name) {
  return String(name || '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 40);
}
async function jsaRunnerOk(bhash) {
  if (!/^[a-f0-9]{64}$/.test(String(bhash || ''))) return false;
  const out = await upstashPipeline([['GET', 'jsa:runnerhash']]);
  const stored = out && out[0] && out[0].result;
  if (!stored) {
    await upstashPipeline([['SET', 'jsa:runnerhash', String(bhash)]]);
    return true;
  }
  return stored === String(bhash);
}
async function jsaGetJob(id) {
  const out = await upstashPipeline([['GET', 'jsa:job:' + id]]);
  const raw = out && out[0] && out[0].result;
  if (!raw) return null;
  try { return JSON.parse(raw); } catch (e) { return null; }
}

export async function jsaHandler(req, res) {
  if (req.method !== 'GET' && req.method !== 'POST') {
    return res.status(405).json({ ok: false, error: 'method not allowed' });
  }
  if (!process.env.NEONRUSH_UPSTASH_URL || !process.env.NEONRUSH_UPSTASH_TOKEN) {
    return res.status(500).json({ ok: false, unavailable: true, error: 'storage not configured' });
  }
  res.setHeader('Cache-Control', 'no-store');
  if (req.method === 'GET') {
    try {
      const out = await upstashPipeline([['SMEMBERS', 'jsa:jobs']]);
      return res.status(200).json({ ok: true, jobs: (out && out[0] && out[0].result) || [] });
    } catch (e) {
      return res.status(500).json({ ok: false, unavailable: true, error: 'service unavailable' });
    }
  }
  let body = req.body;
  if (typeof body === 'string') { try { body = JSON.parse(body); } catch (e) { body = null; } }
  if (!body || typeof body !== 'object') return res.status(400).json({ ok: false, error: 'bad request' });
  const action = String(body.action || '');
  try {
    if (action === 'jsaAnalyze') {
      const mode = body.mode === 'any' ? 'any' : 'site';
      const question = String(body.question || '').slice(0, 300);
      const photo = String(body.photo || '');
      if (!/^data:image\/jpeg;base64,/.test(photo) || photo.length > JSA_PHOTO_MAX) {
        return res.status(400).json({ ok: false, error: 'photo missing or too big' });
      }
      const id = 'j' + Date.now().toString(36) + crypto.randomBytes(4).toString('hex');
      const job = { status: 'wait', mode, question, photo, ts: Date.now() };
      await upstashPipeline([
        ['SET', 'jsa:job:' + id, JSON.stringify(job), 'EX', String(JSA_JOB_TTL)],
        ['LPUSH', 'jsa:queue', id],
        ['LTRIM', 'jsa:queue', '0', '49'],
      ]);
      return res.status(200).json({ ok: true, id });
    }
    if (action === 'jsaPoll') {
      const id = String(body.id || '');
      if (!/^j[a-z0-9]+$/.test(id)) return res.status(400).json({ ok: false, error: 'bad id' });
      const job = await jsaGetJob(id);
      if (!job) return res.status(200).json({ ok: true, status: 'gone' });
      if (job.status === 'done') return res.status(200).json({ ok: true, status: 'done', answer: job.answer || '' });
      if (job.status === 'error') return res.status(200).json({ ok: true, status: 'error', error: job.error || 'analysis failed' });
      return res.status(200).json({ ok: true, status: job.status });
    }
    if (action === 'jsaDiaryAdd') {
      const slug = jsaSlug(body.job);
      if (!slug) return res.status(400).json({ ok: false, error: 'job name needed' });
      const note = String(body.note || '').slice(0, 600);
      const photo = String(body.photo || '');
      if (photo && (!/^data:image\/jpeg;base64,/.test(photo) || photo.length > JSA_DIARY_PHOTO_MAX)) {
        return res.status(400).json({ ok: false, error: 'photo too big' });
      }
      if (!note && !photo) return res.status(400).json({ ok: false, error: 'nothing to save' });
      const entry = { note, photo, ts: Date.now() };
      await upstashPipeline([
        ['LPUSH', 'jsa:diary:' + slug, JSON.stringify(entry)],
        ['LTRIM', 'jsa:diary:' + slug, '0', '99'],
        ['SADD', 'jsa:jobs', slug],
      ]);
      return res.status(200).json({ ok: true });
    }
    if (action === 'jsaDiaryList') {
      const slug = jsaSlug(body.job);
      if (!slug) return res.status(400).json({ ok: false, error: 'job name needed' });
      const out = await upstashPipeline([['LRANGE', 'jsa:diary:' + slug, '0', '99']]);
      const rows = (out && out[0] && out[0].result) || [];
      const entries = rows.map((r) => { try { return JSON.parse(r); } catch (e) { return null; } }).filter(Boolean);
      return res.status(200).json({ ok: true, entries });
    }
    if (action === 'jsaClaim') {
      if (!(await jsaRunnerOk(body.bhash))) return res.status(403).json({ ok: false, error: 'runner not accepted' });
      const out = await upstashPipeline([['RPOP', 'jsa:queue']]);
      const id = out && out[0] && out[0].result;
      if (!id) return res.status(200).json({ ok: true, job: null });
      const job = await jsaGetJob(id);
      if (!job) return res.status(200).json({ ok: true, job: null });
      job.status = 'working';
      await upstashPipeline([['SET', 'jsa:job:' + id, JSON.stringify(job), 'EX', String(JSA_JOB_TTL)]]);
      return res.status(200).json({ ok: true, job: { id, mode: job.mode, question: job.question, photo: job.photo } });
    }
    if (action === 'jsaAnswer') {
      if (!(await jsaRunnerOk(body.bhash))) return res.status(403).json({ ok: false, error: 'runner not accepted' });
      const id = String(body.id || '');
      if (!/^j[a-z0-9]+$/.test(id)) return res.status(400).json({ ok: false, error: 'bad id' });
      const job = await jsaGetJob(id);
      if (!job) return res.status(200).json({ ok: false, error: 'job gone' });
      delete job.photo;
      if (body.error) {
        job.status = 'error';
        job.error = String(body.error).slice(0, 200);
      } else {
        job.status = 'done';
        job.answer = String(body.answer || '').slice(0, 6000);
      }
      await upstashPipeline([['SET', 'jsa:job:' + id, JSON.stringify(job), 'EX', String(JSA_JOB_TTL)]]);
      return res.status(200).json({ ok: true });
    }
    return res.status(400).json({ ok: false, error: 'unknown action' });
  } catch (e) {
    console.error('jsa action failed', action, e && e.message);
    return res.status(500).json({ ok: false, unavailable: true, error: 'service unavailable' });
  }
}
/* jobsite-analyzer:end */

export default async function handler(req, res) {
  /* Wallet Scope counter: /api/scope-count is rewritten to
     /api/luna-games?scope=1 (see the wallet-scope block above). Runs
     before game dispatch; game requests never carry ?scope. */
  if (req.query && req.query.scope !== undefined) return scopeCountHandler(req, res);
  /* Wallet Scope Solana relay: /api/solana-rpc is rewritten to
     /api/luna-games?solrpc=1 (see the solana-rpc block above). */
  if (req.query && req.query.solrpc !== undefined) return solanaRpcHandler(req, res);
  /* Wallet Scope Ethereum relay: /api/ethereum-rpc is rewritten to
     /api/luna-games?ethrpc=1 (see the ethereum-rpc block above). */
  if (req.query && req.query.ethrpc !== undefined) return ethereumRpcHandler(req, res);
  /* Pinball Token Slot burn records: /api/luna-games?tokenslot=1 (see
     the token-slot block above). Runs before game dispatch; game
     requests never carry ?tokenslot. */
  if (req.query && req.query.tokenslot !== undefined) return tokenSlotHandler(req, res);
  /* Kava Admin Panel access code: the panel calls
     /api/luna-games?kavacode=1 directly (see the kava-code block
     above). Server-side code hash; the stored hash itself is never
     returned — only {set} and {ok} booleans. */
  if (req.query && req.query.kavacode !== undefined) return kavaCodeHandler(req, res);
  /* Tom's Dev private chat queue: the page calls
     /api/luna-games?tda=1 directly (see the toms-dev block above).
     Dedicated code hash in tda:codehash — NOT the panel's kbk key;
     every queue action re-verifies the hash server-side. */
  if (req.query && req.query.tda !== undefined) return tdaHandler(req, res);
  /* Studio Community chat: the Community tab calls
     /api/luna-games?tdc=1 directly (see the studio-community block
     above). Public name-only chat — deliberately NOT behind the
     tda seat-code gate; owner moderation re-verifies the owner
     code hash server-side on every call. */
  if (req.query && req.query.tdc !== undefined) return tdcHandler(req, res);
  if (req.query && req.query.chatx !== undefined) return chatxHandler(req, res);
  /* Hussy Trading Bot control link: the page calls
     /api/luna-games?hussybot=1 directly (see the hussy-bot block
     above). Code hash + bot-secret hash live server-side; the
     endpoint holds no keys and signs nothing. */
  if (req.query && req.query.hussybot !== undefined) return hussyBotHandler(req, res);
  /* Hussy's Ladder Bot game screen: /api/luna-games?hussyladder=1
     (see the hussy-ladder block above). Bot posts status with its
     secret hash; the page reads with Hussy's trading-bot code. */
  if (req.query && req.query.hussyladder !== undefined) return hussyLadderHandler(req, res);
  /* Garuda Dash payout admin: /api/garuda-admin is rewritten to
     /api/luna-games?garudaadmin=1 (see the garuda-admin block above). */
  if (req.query && req.query.garudaadmin !== undefined) return garudaAdminHandler(req, res);
  /* Garuda Dash Timer Payout tick: Vercel Cron calls
     /api/luna-games?garudatick=1 every 15 min (see the garuda-timer
     block above). CRON_SECRET-gated; builds at most one READY payout
     run per period and never sends anything itself. */
  if (req.query && req.query.garudatick !== undefined) return garudaTickHandler(req, res);
  /* Garuda Dash PUBLIC payouts & burns data: the game page calls
     ?garudapublic=1 directly (see the garuda-public block above).
     Display data only — never a winner wallet. */
  if (req.query && req.query.garudapublic !== undefined) return garudaPublicHandler(req, res);
  /* Garuda Dash GAME SETTINGS: the game page calls
     ?garudasettings=1 directly (see the garuda-settings block below).
     Public read of the merged effective settings; writes ride the
     garuda-admin gate, never this route. */
  if (req.query && req.query.garudasettings !== undefined) return garudaSettingsHandler(req, res);
  /* Frog Arena 2 NFT shop orders: the game page calls
     /api/luna-games?fa2=1 directly (see the frog-arena-2 block
     above). Public order registration + status; minting is done by
     the builder-runner mint service after its own on-chain
     verification — this endpoint holds no keys and signs nothing. */
  if (req.query && req.query.fa2 !== undefined) return frogArena2Handler(req, res);
  if (req.query && req.query.frogadmin !== undefined) return frogAdminHandler(req, res);
  if (req.query && req.query.frogsettings !== undefined) return frogSettingsHandler(req, res);
  /* Garuda Dash LEVEL EDITOR data: ?garudaedit=1 (see the garuda-edit
     block above). Published reads are public; writes are admin-gated. */
  if (req.query && req.query.garudaedit !== undefined) return garudaEditHandler(req, res);
  /* Forex Signal Bot candle relay: the bot page calls
     ?fxpair=<PAIR> directly (see the fx-signal block above). Runs
     before game dispatch; game requests never carry ?fxpair. */
  if (req.query && req.query.fxpair !== undefined) return fxPairHandler(req, res);
  /* DEV STUDIO SIGNALS chain-token candle relay: the signals page
     calls ?hsig=<TOKEN> directly (see the hussy-signals block above).
     Runs before game dispatch; game requests never carry ?hsig. */
  if (req.query && req.query.hsig !== undefined) return hsPairHandler(req, res);
  if (req.query && req.query.jsa !== undefined) return jsaHandler(req, res);
  const game = String((req.query && req.query.game) || '');
  let cfg = GAMES[game];
  if (!cfg) return res.status(400).json({ error: 'unknown game' });
  if (cfg.levels) {
    const lvl = Number((req.query && req.query.level) || '');
    if (!Number.isInteger(lvl) || lvl < 1 || lvl > cfg.levels) {
      return res.status(400).json({ error: 'bad level' });
    }
    cfg = { ...cfg, prefix: cfg.prefix + lvl };
  }
  /* orbit-cors:start — Orbit Defender is hosted OFF-origin by the
     OrbitWire team (their own site), so orbit's board is CORS-open.
     Orbit Grand Prix (ogprix) is hosted by the same team the same
     way, so it shares the exception, as does Orbit Defender's NFT
     board (orbitn). Every other game is same-origin
     with this endpoint or runs inside Telegram and keeps the router's
     default behaviour: no CORS headers at all. */
  if (game === 'orbit' || game === 'ogprix' || game === 'orbitn') {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
    if (req.method === 'OPTIONS') return res.status(204).end();
  }
  /* orbit-cors:end */
  if (!process.env.NEONRUSH_UPSTASH_URL || !process.env.NEONRUSH_UPSTASH_TOKEN) {
    return res.status(503).json({ error: 'leaderboard not configured' });
  }
  if (req.method === 'POST') return submit(cfg, req, res);
  if (req.method === 'GET') return board(cfg, res);
  return res.status(405).json({ error: 'method not allowed' });
}
