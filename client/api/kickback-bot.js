// LUNC Kickback bot — Telegram webhook handler (Vercel serverless function).
// Telegram POSTs each update here; we answer /start in private chats with the
// welcome message + Open App button. One owner-only admin command,
// /delegations, replies (to the owner only) with the delegation difference
// since the daily cron's stored baseline; everyone else is ignored.
// Env (Vercel project settings): KICKBACK_BOT_TOKEN, KICKBACK_WEBHOOK_SECRET,
// KICKBACK_OWNER_CHAT_ID, KICKBACK_UPSTASH_URL, KICKBACK_UPSTASH_TOKEN.
const APP_URL = process.env.KICKBACK_APP_URL || 'https://frg-fight-club.vercel.app/kickback/';

const LCD_BASE = 'https://terra-classic-lcd.publicnode.com';
const VALIDATOR_OPER = 'terravaloper13gwu230jrnvalsu3w2cfu5syt4w5rwuca6nhj7';
const VALIDATOR_URL = `${LCD_BASE}/cosmos/staking/v1beta1/validators/${VALIDATOR_OPER}`;
const DELEGATIONS_URL = `${VALIDATOR_URL}/delegations?pagination.count_total=true`;
const BASELINE_KEY = 'kickback:baseline';
const SITE_URL = 'https://www.luncback.com';

// ---------- formatting (same report format as the daily cron DM) ----------

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

// "last 24h" once the baseline is ~a day old, otherwise the real elapsed span.
function elapsedLabel(ts) {
  const ms = Date.now() - Number(ts);
  if (ms >= 23 * 3600 * 1000) return 'last 24h';
  const totalMin = Math.max(0, Math.floor(ms / 60000));
  return `last ${Math.floor(totalMin / 60)}h ${totalMin % 60}m`;
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

// ---------- baseline storage (Upstash Redis REST, read-only here:
// only the daily cron advances the baseline) ----------

function upstashConfigured() {
  return !!(process.env.KICKBACK_UPSTASH_URL && process.env.KICKBACK_UPSTASH_TOKEN);
}

async function readBaseline() {
  const r = await fetch(`${process.env.KICKBACK_UPSTASH_URL}/get/${encodeURIComponent(BASELINE_KEY)}`, {
    headers: { Authorization: `Bearer ${process.env.KICKBACK_UPSTASH_TOKEN}` },
  });
  if (!r.ok) throw new Error(`upstash get HTTP ${r.status}`);
  const j = await r.json();
  if (!j.result) return null;
  try {
    const b = JSON.parse(j.result);
    if (b && b.bonded_uluna != null && b.delegators != null && b.ts) return b;
  } catch (e) { /* fall through: corrupt baseline behaves like none */ }
  return null;
}

// ---------- telegram ----------

async function sendText(token, chatId, text) {
  await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ chat_id: chatId, text }),
  });
}

// Owner-only: anyone else gets silence, exactly as if the command didn't exist.
async function handleDelegations(token, msg) {
  const owner = process.env.KICKBACK_OWNER_CHAT_ID;
  if (!owner || String(msg.chat.id) !== String(owner)) return;
  if (!upstashConfigured()) {
    await sendText(token, msg.chat.id, 'storage not configured yet');
    return;
  }
  let base;
  try {
    base = await readBaseline();
  } catch (e) {
    await sendText(token, msg.chat.id, 'Could not read the stored baseline right now — try again in a bit.');
    return;
  }
  if (!base) {
    await sendText(token, msg.chat.id, "Delegation tracking hasn't started yet — the daily check seeds the baseline on its first run, then I can show differences.");
    return;
  }
  let now;
  try {
    now = await fetchValidatorState();
  } catch (e) {
    await sendText(token, msg.chat.id, "Couldn't reach the chain (LCD) right now — try again in a few minutes.");
    return;
  }
  await sendText(token, msg.chat.id, buildDiffText(elapsedLabel(base.ts), base, now));
}

export default async function handler(req, res) {
  if (req.method !== 'POST') { res.status(405).json({ ok: false }); return; }
  const secret = req.headers['x-telegram-bot-api-secret-token'];
  if (!process.env.KICKBACK_WEBHOOK_SECRET || secret !== process.env.KICKBACK_WEBHOOK_SECRET) {
    res.status(403).json({ ok: false });
    return;
  }
  const token = process.env.KICKBACK_BOT_TOKEN;
  if (!token) { res.status(200).json({ ok: true }); return; }

  const update = req.body || {};
  const msg = update.message;
  if (msg && typeof msg.text === 'string' && msg.chat) {
    if (msg.text.startsWith('/start') && msg.chat.type === 'private') {
      try {
        await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({
            chat_id: msg.chat.id,
            text:
              '🥇 LUNC Kickback\n\nStake LUNC with the validator that shares its commission back. ' +
              'Check the live reward pool, see the top delegators, and find your kickback share.',
            reply_markup: { inline_keyboard: [[{ text: 'Open App', web_app: { url: APP_URL } }]] },
          }),
        });
      } catch (e) {
        // Never fail the webhook on a send error — Telegram would retry-storm.
        console.error('sendMessage failed', e && e.message);
      }
    } else if (msg.text.startsWith('/delegations')) {
      try {
        await handleDelegations(token, msg);
      } catch (e) {
        console.error('delegations failed', e && e.message);
      }
    }
  }
  res.status(200).json({ ok: true });
}
