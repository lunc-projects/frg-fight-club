// LUNC Kickback bot — daily delegation-difference cron (Vercel Cron Jobs).
// vercel.json schedules a daily GET here. Vercel attaches
// "Authorization: Bearer <CRON_SECRET>" automatically when the CRON_SECRET
// env var is set on the project; anything else is rejected.
// Flow: read the stored baseline from Upstash, fetch the validator's live
// bonded stake + delegator count from the Terra Classic LCD, DM the owner
// the difference, then advance the baseline. If the owner has registered a
// group with /updates (handled by the webhook bot), the same report is
// posted there too; a failed group post only earns the owner a warning DM
// and never blocks the baseline advance. The first ever run just seeds
// the baseline and says so — there is no yesterday to compare against yet.
// If the LCD is unreachable the baseline is left untouched and nothing is
// sent, so a chain/node hiccup never corrupts the comparison.
// Env (Vercel project settings): CRON_SECRET, KICKBACK_BOT_TOKEN,
// KICKBACK_OWNER_CHAT_ID, KICKBACK_UPSTASH_URL, KICKBACK_UPSTASH_TOKEN.

const LCD_BASE = 'https://terra-classic-lcd.publicnode.com';
const VALIDATOR_OPER = 'terravaloper13gwu230jrnvalsu3w2cfu5syt4w5rwuca6nhj7';
const VALIDATOR_URL = `${LCD_BASE}/cosmos/staking/v1beta1/validators/${VALIDATOR_OPER}`;
const DELEGATIONS_URL = `${VALIDATOR_URL}/delegations?pagination.count_total=true`;
const BASELINE_KEY = 'kickback:baseline';
const UPDATES_CHAT_KEY = 'kb:updates_chat';
const SITE_URL = 'https://www.luncback.com';

// ---------- formatting ----------

// uluna string -> whole LUNC (BigInt, rounded to nearest), thousands separators.
function fmtLunc(uluna) {
  const u = BigInt(uluna);
  const neg = u < 0n;
  const a = neg ? -u : u;
  const q = a / 1000000n + (a % 1000000n >= 500000n ? 1n : 0n);
  return (neg && q !== 0n ? '-' : '') + q.toLocaleString('en-US');
}

// Signed LUNC delta from a uluna delta (BigInt): "+12,000,000" / "-5,000" / "0".
function fmtSignedLunc(deltaUluna) {
  if (deltaUluna === 0n) return '0';
  const sign = deltaUluna > 0n ? '+' : '-';
  const a = deltaUluna > 0n ? deltaUluna : -deltaUluna;
  const q = a / 1000000n + (a % 1000000n >= 500000n ? 1n : 0n);
  return sign + q.toLocaleString('en-US');
}

// Signed percent of delta vs baseline, 2 decimals. Zero baseline -> "n/a".
function fmtPct(deltaUluna, baseUluna) {
  const base = Number(baseUluna);
  if (!base) return 'n/a';
  const pct = (Number(deltaUluna) / base) * 100;
  if (pct === 0) return '0.00%';
  return (pct > 0 ? '+' : '-') + Math.abs(pct).toFixed(2) + '%';
}

function fmtSignedInt(n) {
  return n > 0 ? `+${n}` : `${n}`;
}

// The one report format, shared by the daily cron DM and /delegations.
function buildDiffText(label, base, now) {
  const dBonded = BigInt(now.bonded_uluna) - BigInt(base.bonded_uluna);
  const dDeleg = now.delegators - base.delegators;
  return [
    `📊 LUNC Kickback — ${label}`,
    `Bonded: ${fmtLunc(now.bonded_uluna)} LUNC (${fmtSignedLunc(dBonded)} / ${fmtPct(dBonded, base.bonded_uluna)})`,
    `Delegators: ${Number(now.delegators).toLocaleString('en-US')} (${fmtSignedInt(dDeleg)})`,
    SITE_URL,
  ].join('\n');
}

// ---------- chain (LCD, one retry) ----------

async function fetchJson(url) {
  let lastErr;
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const r = await fetch(url);
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      return await r.json();
    } catch (e) {
      lastErr = e;
    }
  }
  throw lastErr;
}

async function fetchValidatorState() {
  const [v, d] = await Promise.all([fetchJson(VALIDATOR_URL), fetchJson(DELEGATIONS_URL)]);
  const tokens = v && v.validator && v.validator.tokens;
  const total = d && d.pagination && d.pagination.total;
  if (tokens == null || total == null || Number.isNaN(parseInt(total, 10))) {
    throw new Error('unexpected LCD response shape');
  }
  return { bonded_uluna: String(tokens), delegators: parseInt(total, 10) };
}

// ---------- baseline storage (Upstash Redis REST) ----------

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

async function upstashSet(key, value) {
  const r = await fetch(`${process.env.KICKBACK_UPSTASH_URL}/set/${encodeURIComponent(key)}`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${process.env.KICKBACK_UPSTASH_TOKEN}` },
    body: value,
  });
  if (!r.ok) throw new Error(`upstash set HTTP ${r.status}`);
}

async function readBaseline() {
  const raw = await upstashGet(BASELINE_KEY);
  if (!raw) return null;
  try {
    const b = JSON.parse(raw);
    if (b && b.bonded_uluna != null && b.delegators != null && b.ts) return b;
  } catch (e) { /* fall through: corrupt baseline behaves like none */ }
  return null;
}

async function writeBaseline(state) {
  await upstashSet(BASELINE_KEY, JSON.stringify({
    bonded_uluna: state.bonded_uluna,
    delegators: state.delegators,
    ts: Date.now(),
  }));
}

// The group the owner registered with /updates (webhook bot), if any.
async function readUpdatesChat() {
  const raw = await upstashGet(UPDATES_CHAT_KEY);
  if (!raw) return null;
  try {
    const u = JSON.parse(raw);
    if (u && u.chat_id != null) return u;
  } catch (e) { /* fall through: corrupt registration behaves like none */ }
  return null;
}

// ---------- telegram ----------

async function sendDm(text) {
  const token = process.env.KICKBACK_BOT_TOKEN;
  const owner = process.env.KICKBACK_OWNER_CHAT_ID;
  if (!token || !owner) return false;
  try {
    const r = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ chat_id: owner, text }),
    });
    return r.ok;
  } catch (e) {
    console.error('sendMessage failed', e && e.message);
    return false;
  }
}

// Post to the registered updates group. Unlike sendDm this reports its
// outcome: the handler needs to know a group post failed so it can warn the
// owner (the bot may have been removed from the group).
async function sendToChat(chatId, text) {
  const token = process.env.KICKBACK_BOT_TOKEN;
  if (!token) return false;
  try {
    const r = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ chat_id: chatId, text }),
    });
    return r.ok;
  } catch (e) {
    console.error('group sendMessage failed', e && e.message);
    return false;
  }
}

// ---------- handler ----------

export default async function handler(req, res) {
  const secret = process.env.CRON_SECRET;
  if (!secret || !req.headers || req.headers.authorization !== `Bearer ${secret}`) {
    res.status(401).json({ ok: false });
    return;
  }
  if (!upstashConfigured()) {
    res.status(500).json({ ok: false, error: 'storage not configured' });
    return;
  }

  let now;
  try {
    now = await fetchValidatorState();
  } catch (e) {
    // No fresh chain data: send nothing, keep the old baseline, fail loudly.
    console.error('LCD fetch failed', e && e.message);
    res.status(500).json({ ok: false, error: 'lcd unavailable' });
    return;
  }

  let base;
  try {
    base = await readBaseline();
  } catch (e) {
    console.error('baseline read failed', e && e.message);
    res.status(500).json({ ok: false, error: 'storage read failed' });
    return;
  }

  if (!base) {
    try {
      await writeBaseline(now);
    } catch (e) {
      console.error('baseline write failed', e && e.message);
      res.status(500).json({ ok: false, error: 'storage write failed' });
      return;
    }
    await sendDm(
      '📊 LUNC Kickback delegation tracking started. ' +
      `Baseline: ${fmtLunc(now.bonded_uluna)} LUNC bonded, ${Number(now.delegators).toLocaleString('en-US')} delegators. ` +
      'Your first 24h difference lands tomorrow.'
    );
    res.status(200).json({ ok: true, seeded: true });
    return;
  }

  const report = buildDiffText('last 24h', base, now);
  await sendDm(report);
  // Mirror the report to the registered updates group, if one exists. Any
  // failure here — unreadable registration, bot removed from the group —
  // must not fail the cron or block the baseline advance below; a failed
  // post only earns the owner a warning DM.
  let updatesChat = null;
  try {
    updatesChat = await readUpdatesChat();
  } catch (e) {
    console.error('updates group read failed', e && e.message);
  }
  if (updatesChat) {
    const posted = await sendToChat(updatesChat.chat_id, report);
    if (!posted) {
      await sendDm('⚠️ Couldn\u2019t post the update to the registered group (the bot may have been removed).');
    }
  }
  try {
    await writeBaseline(now);
  } catch (e) {
    console.error('baseline write failed', e && e.message);
    res.status(500).json({ ok: false, error: 'storage write failed' });
    return;
  }
  res.status(200).json({ ok: true, reported: true });
}
