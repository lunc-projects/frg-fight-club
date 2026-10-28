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
  ogprix: { prefix: 'ogprix', maxScore: 100000, minSec: 40, maxSec: 3600, rateMul: 200, rateBase: 2000, levels: 6 },
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
    const out = await upstashPipeline([
      ['ZADD', `${cfg.prefix}:all`, 'GT', score, playerId],
      ['ZADD', wk, 'GT', score, playerId],
      ['HSET', `${cfg.prefix}:names`, playerId, name],
      ['EXPIRE', wk, 60 * 60 * 24 * 40],
      ['ZREVRANK', `${cfg.prefix}:all`, playerId],
    ]);
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
    if (ids.length) {
      const nOut = await upstashPipeline([['HMGET', `${cfg.prefix}:names`, ...ids]]);
      const vals = (nOut[0] && nOut[0].result) || [];
      ids.forEach((id, i) => { names[id] = vals[i] || 'Player'; });
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
        out.push({ name, score: p.score });
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

export default async function handler(req, res) {
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
