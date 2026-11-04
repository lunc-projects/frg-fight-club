// LUNC Dev Wallet Scope — privacy-first usage counter (Vercel serverless).
// Counts ONLY: page visits and wallet lookups, as totals and per-day
// numbers. No addresses, no IPs, no user data are ever read or stored —
// the page sends nothing but {"type":"visit"|"lookup"}, and this handler
// ignores any other fields a client might include.
// Storage: the same Upstash instance the Kickback bot uses on this
// project (KICKBACK_UPSTASH_URL / KICKBACK_UPSTASH_TOKEN), REST style.
// Keys: scope:total:visits, scope:total:lookups,
//       scope:day:<YYYY-MM-DD>:visits, scope:day:<YYYY-MM-DD>:lookups
// (day = America/New_York calendar date), incremented atomically (INCR).
// GET returns the totals, today's numbers, and the last 7 days. No auth:
// the counts are public-safe aggregate numbers, nothing else is exposed.

const TOTAL_VISITS = 'scope:total:visits';
const TOTAL_LOOKUPS = 'scope:total:lookups';

// ---------- dates (America/New_York) ----------

// YYYY-MM-DD in America/New_York, offset by whole days from today.
// Day arithmetic is done in UTC on the NY calendar date, so DST never
// shifts the result.
function nyDate(offsetDays = 0) {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/New_York', year: 'numeric', month: '2-digit', day: '2-digit',
  }).formatToParts(new Date());
  const part = (t) => Number(parts.find((p) => p.type === t).value);
  const d = new Date(Date.UTC(part('year'), part('month') - 1, part('day') + offsetDays));
  return d.toISOString().slice(0, 10);
}

function dayKeys(date) {
  return { visits: `scope:day:${date}:visits`, lookups: `scope:day:${date}:lookups` };
}

// ---------- storage (Upstash Redis REST, same pattern as kickback-cron) ----------

function upstashConfigured() {
  return !!(process.env.KICKBACK_UPSTASH_URL && process.env.KICKBACK_UPSTASH_TOKEN);
}

async function upstashGet(key) {
  const r = await fetch(`${process.env.KICKBACK_UPSTASH_URL}/get/${encodeURIComponent(key)}`, {
    headers: { Authorization: `Bearer ${process.env.KICKBACK_UPSTASH_TOKEN}` },
  });
  if (!r.ok) throw new Error(`upstash get HTTP ${r.status}`);
  const j = await r.json();
  return j.result; // string or null
}

async function upstashIncr(key) {
  const r = await fetch(`${process.env.KICKBACK_UPSTASH_URL}/incr/${encodeURIComponent(key)}`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${process.env.KICKBACK_UPSTASH_TOKEN}` },
  });
  if (!r.ok) throw new Error(`upstash incr HTTP ${r.status}`);
  const j = await r.json();
  return j.result;
}

// A stored counter as a number; missing/corrupt reads count as 0.
async function readCount(key) {
  const n = parseInt(await upstashGet(key), 10);
  return Number.isNaN(n) ? 0 : n;
}

// ---------- handler ----------

export default async function handler(req, res) {
  if (req.method !== 'GET' && req.method !== 'POST') {
    res.status(405).json({ ok: false, error: 'method not allowed' });
    return;
  }
  if (!upstashConfigured()) {
    res.status(500).json({ ok: false, error: 'storage not configured' });
    return;
  }

  if (req.method === 'POST') {
    let body = req.body;
    if (typeof body === 'string') {
      try { body = JSON.parse(body); } catch (e) { body = null; }
    }
    const type = body && body.type;
    if (type !== 'visit' && type !== 'lookup') {
      res.status(400).json({ ok: false, error: 'unknown type' });
      return;
    }
    const day = dayKeys(nyDate(0));
    try {
      await upstashIncr(type === 'visit' ? TOTAL_VISITS : TOTAL_LOOKUPS);
      await upstashIncr(type === 'visit' ? day.visits : day.lookups);
    } catch (e) {
      console.error('counter write failed', e && e.message);
      res.status(500).json({ ok: false, error: 'storage write failed' });
      return;
    }
    res.status(200).json({ ok: true });
    return;
  }

  // GET: totals + today + the last 7 days (oldest -> newest).
  try {
    const dates = [];
    for (let back = 6; back >= 0; back--) dates.push(nyDate(-back));
    const totalVisits = await readCount(TOTAL_VISITS);
    const totalLookups = await readCount(TOTAL_LOOKUPS);
    const week = [];
    for (const date of dates) {
      const k = dayKeys(date);
      week.push({ date, visits: await readCount(k.visits), lookups: await readCount(k.lookups) });
    }
    const today = week[week.length - 1];
    res.status(200).json({ totalVisits, totalLookups, today, week });
  } catch (e) {
    console.error('counter read failed', e && e.message);
    res.status(500).json({ ok: false, error: 'storage read failed' });
  }
}
