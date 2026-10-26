// LUNA GAMES — shared leaderboard endpoint for Penalty Kick, Darts and
// Luna Blocks (one serverless function for all three; the frg-fight-club
// Vercel project is on the Hobby plan, which caps a deployment at 12
// serverless functions, so newer games share this router instead of each
// getting a score+board pair).
//   POST /api/luna-games?game=penalty|darts|blocks|rider  {name, score, seconds, initData?}
//   GET  /api/luna-games?game=penalty|darts|blocks|rider  -> {all, week}
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
  const cfg = GAMES[game];
  if (!cfg) return res.status(400).json({ error: 'unknown game' });
  if (!process.env.NEONRUSH_UPSTASH_URL || !process.env.NEONRUSH_UPSTASH_TOKEN) {
    return res.status(503).json({ error: 'leaderboard not configured' });
  }
  if (req.method === 'POST') return submit(cfg, req, res);
  if (req.method === 'GET') return board(cfg, res);
  return res.status(405).json({ error: 'method not allowed' });
}
