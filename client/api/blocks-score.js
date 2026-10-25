// LUNA BLOCKS — leaderboard score submit (Vercel serverless function).
// Stores each player's BEST score in Upstash Redis sorted sets (all-time +
// current ISO week) plus a name map. Telegram WebApp initData is verified
// against the LUNC Assistant Bot token when present (verified players get a
// stable tg:<id> identity and their Telegram first name); otherwise the
// player is a guest keyed by a slug of their typed name.
// Env (Vercel project settings): NEONRUSH_UPSTASH_URL, NEONRUSH_UPSTASH_TOKEN,
// LUNC_BOT_TOKEN (for initData verification).
import crypto from 'node:crypto';

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

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'method not allowed' });
  if (!process.env.NEONRUSH_UPSTASH_URL || !process.env.NEONRUSH_UPSTASH_TOKEN) {
    return res.status(503).json({ error: 'leaderboard not configured' });
  }
  let body = req.body;
  if (typeof body === 'string') {
    try { body = JSON.parse(body); } catch { body = {}; }
  }
  body = body || {};
  const score = Math.floor(+body.score);
  const seconds = Math.floor(+body.seconds);
  if (!Number.isFinite(score) || score < 0 || score > 12000) {
    return res.status(400).json({ error: 'bad score' });
  }
  if (!Number.isFinite(seconds) || seconds < 20 || seconds > 14400) {
    return res.status(400).json({ error: 'bad run time' });
  }
  // Plausibility cap: even a perfect run cannot outscore this per second.
  if (score > seconds * 12 + 300) {
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

  const wk = `blocks:week:${weekKey()}`;
  try {
    const out = await upstashPipeline([
      ['ZADD', 'blocks:all', 'GT', score, playerId],
      ['ZADD', wk, 'GT', score, playerId],
      ['HSET', 'blocks:names', playerId, name],
      ['EXPIRE', wk, 60 * 60 * 24 * 40],
      ['ZREVRANK', 'blocks:all', playerId],
    ]);
    const rank = out[4] && typeof out[4].result === 'number' ? out[4].result + 1 : null;
    return res.status(200).json({ ok: true, name, rank });
  } catch (e) {
    console.error('blocks submit failed', e && e.message);
    return res.status(502).json({ error: 'leaderboard unavailable' });
  }
}
