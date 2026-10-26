// NEON RUSH — leaderboard read (Vercel serverless function).
// Returns the top 20 of the all-time and current-week sorted sets with
// display names. Env: NEONRUSH_UPSTASH_URL, NEONRUSH_UPSTASH_TOKEN.
function weekKey(d = new Date()) {
  const date = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
  const day = (date.getUTCDay() + 6) % 7;
  date.setUTCDate(date.getUTCDate() - day + 3);
  const firstThu = new Date(Date.UTC(date.getUTCFullYear(), 0, 4));
  const fday = (firstThu.getUTCDay() + 6) % 7;
  firstThu.setUTCDate(firstThu.getUTCDate() - fday + 3);
  const week = 1 + Math.round((date - firstThu) / (7 * 24 * 3600 * 1000));
  return `${date.getUTCFullYear()}-W${String(week).padStart(2, '0')}`;
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

export default async function handler(req, res) {
  if (req.method !== 'GET') return res.status(405).json({ error: 'method not allowed' });
  if (!process.env.NEONRUSH_UPSTASH_URL || !process.env.NEONRUSH_UPSTASH_TOKEN) {
    return res.status(503).json({ error: 'leaderboard not configured' });
  }
  const wk = `nr:week:${weekKey()}`;
  try {
    const out = await upstashPipeline([
      ['ZREVRANGE', 'nr:all', 0, 49, 'WITHSCORES'],
      ['ZREVRANGE', wk, 0, 49, 'WITHSCORES'],
    ]);
    const all = pairs(out[0] && out[0].result);
    const week = pairs(out[1] && out[1].result);
    const ids = [...new Set([...all, ...week].map((p) => p.id))];
    let names = {};
    if (ids.length) {
      const nOut = await upstashPipeline([['HMGET', 'nr:names', ...ids]]);
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
    console.error('neon-rush board failed', e && e.message);
    return res.status(502).json({ error: 'leaderboard unavailable' });
  }
}
