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
  tower: { prefix: 'twr', maxScore: 100000, minSec: 10, maxSec: 3600, rateMul: 90, rateBase: 2000 },
  snake: { prefix: 'snake', maxScore: 20000, minSec: 5, maxSec: 3600, rateMul: 25, rateBase: 300 },
  flap: { prefix: 'flap', maxScore: 30000, minSec: 3, maxSec: 3600, rateMul: 16, rateBase: 150 },
  pinball: { prefix: 'pinball', maxScore: 50000, minSec: 10, maxSec: 3600, rateMul: 30, rateBase: 500 },
  racer: { prefix: 'racer', maxScore: 30000, minSec: 5, maxSec: 3600, rateMul: 45, rateBase: 300 },
  cannon: { prefix: 'cannon', maxScore: 1540, minSec: 20, maxSec: 3600, rateMul: 40, rateBase: 600 },
  whack: { prefix: 'whack', maxScore: 3000, minSec: 55, maxSec: 65, rateMul: 50, rateBase: 0 },
  merge: { prefix: 'merge', maxScore: 50000, minSec: 10, maxSec: 3600, rateMul: 30, rateBase: 500 },
  hop: { prefix: 'hop', maxScore: 30000, minSec: 10, maxSec: 3600, rateMul: 30, rateBase: 300 },
  match: { prefix: 'match', maxScore: 100000, minSec: 10, maxSec: 3600, rateMul: 300, rateBase: 2000 },
  slice: { prefix: 'slice', maxScore: 50000, minSec: 10, maxSec: 3600, rateMul: 300, rateBase: 2000 },
  bubble: { prefix: 'bub', maxScore: 60000, minSec: 10, maxSec: 3600, rateMul: 60, rateBase: 1000 },
  climb: { prefix: 'climb', maxScore: 40000, minSec: 10, maxSec: 3600, rateMul: 45, rateBase: 1500 },
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
