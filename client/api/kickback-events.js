// LUNC Dev Studio bot — LIVE delegation-event posts (Vercel serverless function).
// Polls the chain for staking events touching the LUNC Dev Studio validator
// and posts each NEW one to the registered updates group (the same group the
// daily cron mirrors its report to, registered with /updates — see
// kickback-bot.js). No owner DM here: the owner asked for group posts; the
// daily report DM stays as it is.
// Trigger: an external timer (parent wires a 5-minute caller) with
// "Authorization: Bearer <CRON_SECRET>" or "Bearer <KICKBACK_EVENTS_SECRET>".
// Each event post is a PHOTO post: the LUNC Dev Studio logo (served from
// this same deployment at /kickback-logo.png) with the event text as the
// caption. If the photo send fails for any reason, the plain text post is
// sent instead so no event is ever lost.
//
// Detection sources (union, deduped by txhash):
// 1. FCD account history for the validator OPERATOR account. The operator
//    account is terra1a6t063l4858ezr8c82yffx7j0c690v8rwtgc52 — the valoper
//    payload with the "terra" prefix checksum (the valoper string itself
//    with its prefix swapped is NOT a valid address). Verified live
//    2026-11-03: FCD only indexes the operator's OWN txs here (its
//    create-validator + funding), never other delegators' staking txs, so
//    this source alone would miss every community delegation.
// 2. LCD tx_search event queries (delegate.validator,
//    redelegate.destination_validator, redelegate.source_validator,
//    unbond.validator) — verified live 2026-11-03: these DO surface every
//    delegator's staking txs for this validator (15 redelegate-IN txs at
//    first check). If FCD errors, these carry the run; if the LCD errors,
//    FCD still covers operator events. Only if BOTH fail does the run 500
//    (loud failure, checkpoint untouched).
// Failed txs (code != 0) never post. Amounts/addresses are parsed from the
// tx messages (authoritative), not from events.
//
// Checkpoint (Upstash): kb:events_seen = JSON array of recent txhashes
// (cap 100), kb:events_seeded = "1" once seeded. The FIRST run only records
// the currently visible txs as seen and posts nothing — no history flood.
// A txhash is marked seen only once all its events were posted (or covered
// by the overflow summary); a failed group send leaves it unseen so the
// next run retries. Posts are capped at 10 per run; further new events get
// a single "+N more delegation events" summary line.
// Env (Vercel project settings): CRON_SECRET, KICKBACK_EVENTS_SECRET,
// KICKBACK_BOT_TOKEN, KICKBACK_UPSTASH_URL, KICKBACK_UPSTASH_TOKEN.

const LCD_BASE = 'https://terra-classic-lcd.publicnode.com';
const FCD_BASE = 'https://terra-classic-fcd.publicnode.com';
const VALIDATOR_OPER = 'terravaloper1a6t063l4858ezr8c82yffx7j0c690v8rwyy9ye';
const OPERATOR_ACCOUNT = 'terra1a6t063l4858ezr8c82yffx7j0c690v8rwtgc52';
const SEEN_KEY = 'kb:events_seen';
const SEEDED_KEY = 'kb:events_seeded';
const UPDATES_CHAT_KEY = 'kb:updates_chat';
const SEEN_CAP = 100;
const POST_CAP = 10;
const FINDER_TX = 'https://finder.terraclassic.community/mainnet/tx/';
const VALIDATOR_PAGE = 'https://validator.info/terra-classic/terravaloper1a6t063l4858ezr8c82yffx7j0c690v8rwyy9ye';
const LOGO_URL = 'https://frg-fight-club.vercel.app/kickback-logo.png';

// ---------- formatting ----------

// uluna string -> whole LUNC (BigInt, rounded to nearest), thousands separators.
// Same house format as the daily report (kickback-cron.js).
function fmtLunc(uluna) {
  const u = BigInt(uluna);
  const neg = u < 0n;
  const a = neg ? -u : u;
  const q = a / 1000000n + (a % 1000000n >= 500000n ? 1n : 0n);
  return (neg && q !== 0n ? '-' : '') + q.toLocaleString('en-US');
}

// ---------- chain (one retry, same pattern as kickback-cron.js) ----------

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

// One normalized event shape out of both source formats:
// { kind: 'delegate'|'redelegate_in'|'redelegate_out'|'undelegate',
//   delegator, amountUluna, otherValidator (valoper or null),
//   txhash, timestamp, height, msgIndex }

// FCD (classic amino) message -> event, or null.
function eventFromFcdMsg(msg, meta, msgIndex) {
  if (!msg || !msg.value) return null;
  const v = msg.value;
  const amt = v.amount && v.amount.denom === 'uluna' ? String(v.amount.amount) : null;
  if (amt == null || !v.delegator_address) return null;
  const base = { delegator: v.delegator_address, amountUluna: amt, ...meta, msgIndex };
  if (msg.type === 'staking/MsgDelegate' && v.validator_address === VALIDATOR_OPER) {
    return { ...base, kind: 'delegate', otherValidator: null };
  }
  if (msg.type === 'staking/MsgUndelegate' && v.validator_address === VALIDATOR_OPER) {
    return { ...base, kind: 'undelegate', otherValidator: null };
  }
  if (msg.type === 'staking/MsgBeginRedelegate') {
    if (v.validator_dst_address === VALIDATOR_OPER) {
      return { ...base, kind: 'redelegate_in', otherValidator: v.validator_src_address || null };
    }
    if (v.validator_src_address === VALIDATOR_OPER) {
      return { ...base, kind: 'redelegate_out', otherValidator: v.validator_dst_address || null };
    }
  }
  return null;
}

// LCD (proto JSON) message -> event, or null.
function eventFromLcdMsg(msg, meta, msgIndex) {
  if (!msg) return null;
  const amt = msg.amount && msg.amount.denom === 'uluna' ? String(msg.amount.amount) : null;
  if (amt == null || !msg.delegator_address) return null;
  const t = msg['@type'] || '';
  const base = { delegator: msg.delegator_address, amountUluna: amt, ...meta, msgIndex };
  if (t.endsWith('.MsgDelegate') && msg.validator_address === VALIDATOR_OPER) {
    return { ...base, kind: 'delegate', otherValidator: null };
  }
  if (t.endsWith('.MsgUndelegate') && msg.validator_address === VALIDATOR_OPER) {
    return { ...base, kind: 'undelegate', otherValidator: null };
  }
  if (t.endsWith('.MsgBeginRedelegate')) {
    if (msg.validator_dst_address === VALIDATOR_OPER) {
      return { ...base, kind: 'redelegate_in', otherValidator: msg.validator_src_address || null };
    }
    if (msg.validator_src_address === VALIDATOR_OPER) {
      return { ...base, kind: 'redelegate_out', otherValidator: msg.validator_dst_address || null };
    }
  }
  return null;
}

async function fetchFcdEvents() {
  const j = await fetchJson(`${FCD_BASE}/v1/txs?account=${OPERATOR_ACCOUNT}&limit=10`);
  const events = [];
  for (const t of (j && j.txs) || []) {
    try {
      if (!t || !t.txhash || (t.code != null && Number(t.code) !== 0)) continue;
      const msgs = (t.tx && t.tx.value && t.tx.value.msg) || [];
      const meta = { txhash: t.txhash, timestamp: t.timestamp || '', height: Number(t.height) || 0 };
      msgs.forEach((m, i) => {
        const ev = eventFromFcdMsg(m, meta, i);
        if (ev) events.push(ev);
      });
    } catch (e) { /* one bad tx never fails the run */ }
  }
  return events;
}

const LCD_EVENT_QUERIES = [
  `delegate.validator='${VALIDATOR_OPER}'`,
  `redelegate.destination_validator='${VALIDATOR_OPER}'`,
  `redelegate.source_validator='${VALIDATOR_OPER}'`,
  `unbond.validator='${VALIDATOR_OPER}'`,
];

async function fetchLcdEvents() {
  const byHash = new Map(); // txhash -> events (a tx can match two queries)
  for (const q of LCD_EVENT_QUERIES) {
    const url = `${LCD_BASE}/cosmos/tx/v1beta1/txs?query=${encodeURIComponent(q)}&order_by=ORDER_BY_DESC`;
    const j = await fetchJson(url);
    for (const r of (j && j.tx_responses) || []) {
      try {
        if (!r || !r.txhash || (r.code != null && Number(r.code) !== 0)) continue;
        if (byHash.has(r.txhash)) continue;
        const msgs = (r.tx && r.tx.body && r.tx.body.messages) || [];
        const meta = { txhash: r.txhash, timestamp: r.timestamp || '', height: Number(r.height) || 0 };
        const evs = [];
        msgs.forEach((m, i) => {
          const ev = eventFromLcdMsg(m, meta, i);
          if (ev) evs.push(ev);
        });
        if (evs.length) byHash.set(r.txhash, evs);
      } catch (e) { /* one bad tx never fails the run */ }
    }
  }
  return [...byHash.values()].flat();
}

// Moniker for a valoper, best effort: any failure just yields the address.
const monikerCache = new Map();
async function validatorLabel(valoper) {
  if (!valoper) return null;
  if (monikerCache.has(valoper)) return monikerCache.get(valoper);
  let label = valoper;
  try {
    const j = await fetchJson(`${LCD_BASE}/cosmos/staking/v1beta1/validators/${valoper}`);
    const moniker = j && j.validator && j.validator.description && j.validator.description.moniker;
    if (moniker && moniker.trim()) label = moniker.trim();
  } catch (e) { /* fall back to the full address */ }
  monikerCache.set(valoper, label);
  return label;
}

async function buildEventText(ev) {
  const amount = fmtLunc(ev.amountUluna);
  const link = `${FINDER_TX}${ev.txhash}`;
  if (ev.kind === 'delegate') {
    return `🟢 New delegation\n${amount} LUNC → LUNC Dev Studio\nFrom: ${ev.delegator}\n${link}\nValidator: ${VALIDATOR_PAGE}`;
  }
  if (ev.kind === 'redelegate_in') {
    const was = await validatorLabel(ev.otherValidator);
    return `🔁 Redelegated IN\n${amount} LUNC → LUNC Dev Studio\nFrom: ${ev.delegator} (was: ${was})\n${link}\nValidator: ${VALIDATOR_PAGE}`;
  }
  if (ev.kind === 'redelegate_out') {
    const dest = await validatorLabel(ev.otherValidator);
    return `🟠 Redelegated OUT\n${amount} LUNC left LUNC Dev Studio\nFrom: ${ev.delegator} → ${dest}\n${link}\nValidator: ${VALIDATOR_PAGE}`;
  }
  return `🔴 Undelegated\n${amount} LUNC from LUNC Dev Studio\nFrom: ${ev.delegator}\n${link}\nValidator: ${VALIDATOR_PAGE}`;
}

// ---------- storage (Upstash Redis REST, same pattern as kickback-cron.js) ----------

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

async function readSeen() {
  const raw = await upstashGet(SEEN_KEY);
  if (!raw) return [];
  try {
    const a = JSON.parse(raw);
    if (Array.isArray(a)) return a.filter((h) => typeof h === 'string');
  } catch (e) { /* corrupt seen-set behaves like empty */ }
  return [];
}

async function readSeeded() {
  const raw = await upstashGet(SEEDED_KEY);
  return raw === '1';
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

// ---------- telegram (same sendToChat pattern as kickback-cron.js) ----------

async function sendToChat(chatId, text, threadId) {
  const token = process.env.KICKBACK_BOT_TOKEN;
  if (!token) return false;
  const body = { chat_id: chatId, text };
  if (threadId != null) body.message_thread_id = threadId;
  try {
    const r = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
    });
    return r.ok;
  } catch (e) {
    console.error('group sendMessage failed', e && e.message);
    return false;
  }
}

// Photo post: the studio logo with the event text as caption.
async function sendPhotoToChat(chatId, text, threadId) {
  const token = process.env.KICKBACK_BOT_TOKEN;
  if (!token) return false;
  const body = { chat_id: chatId, photo: LOGO_URL, caption: text };
  if (threadId != null) body.message_thread_id = threadId;
  try {
    const r = await fetch(`https://api.telegram.org/bot${token}/sendPhoto`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
    });
    return r.ok;
  } catch (e) {
    console.error('group sendPhoto failed', e && e.message);
    return false;
  }
}

// An event counts as posted if EITHER the photo post or the plain-text
// fallback landed.
async function sendEventPost(chatId, text, threadId) {
  if (await sendPhotoToChat(chatId, text, threadId)) return true;
  return sendToChat(chatId, text, threadId);
}

// ---------- handler ----------

export default async function handler(req, res) {
  const cronSecret = process.env.CRON_SECRET;
  const eventsSecret = process.env.KICKBACK_EVENTS_SECRET;
  const auth = req.headers && req.headers.authorization;
  const authorized = !!auth &&
    ((!!cronSecret && auth === `Bearer ${cronSecret}`) ||
     (!!eventsSecret && auth === `Bearer ${eventsSecret}`));
  if (!authorized) {
    res.status(401).json({ ok: false });
    return;
  }
  if (!upstashConfigured()) {
    res.status(500).json({ ok: false, error: 'storage not configured' });
    return;
  }

  // Fetch from both sources; either one alone keeps the run alive.
  let fcdEvents = null;
  let lcdEvents = null;
  let fcdErr = null;
  let lcdErr = null;
  try { fcdEvents = await fetchFcdEvents(); } catch (e) { fcdErr = e; }
  try { lcdEvents = await fetchLcdEvents(); } catch (e) { lcdErr = e; }
  if (fcdEvents === null && lcdEvents === null) {
    console.error('all event sources failed', fcdErr && fcdErr.message, lcdErr && lcdErr.message);
    res.status(500).json({ ok: false, error: 'chain unavailable' });
    return;
  }
  // Union, deduped per (txhash, msgIndex) — FCD first so identical events
  // keep one copy.
  const eventByKey = new Map();
  for (const ev of [...(fcdEvents || []), ...(lcdEvents || [])]) {
    const key = `${ev.txhash}:${ev.msgIndex}`;
    if (!eventByKey.has(key)) eventByKey.set(key, ev);
  }
  const allEvents = [...eventByKey.values()];
  const visibleHashes = [...new Set(allEvents.map((e) => e.txhash))];

  let seen;
  let seeded;
  let updatesChat;
  try {
    seen = await readSeen();
    seeded = await readSeeded();
    updatesChat = await readUpdatesChat();
  } catch (e) {
    console.error('storage read failed', e && e.message);
    res.status(500).json({ ok: false, error: 'storage read failed' });
    return;
  }
  const seenSet = new Set(seen);

  const persistSeen = async (extraHashes) => {
    const merged = [...seen];
    for (const h of extraHashes) if (!merged.includes(h)) merged.push(h);
    await upstashSet(SEEN_KEY, JSON.stringify(merged.slice(-SEEN_CAP)));
  };

  // First ever run: record what's visible, post nothing (no history flood).
  if (!seeded) {
    try {
      await persistSeen(visibleHashes);
      await upstashSet(SEEDED_KEY, '1');
    } catch (e) {
      console.error('seed write failed', e && e.message);
      res.status(500).json({ ok: false, error: 'storage write failed' });
      return;
    }
    res.status(200).json({ ok: true, seeded: true, posted: 0 });
    return;
  }

  // New events only, oldest first.
  const fresh = allEvents
    .filter((e) => !seenSet.has(e.txhash))
    .sort((a, b) => (a.timestamp < b.timestamp ? -1 : a.timestamp > b.timestamp ? 1 :
      (a.height - b.height) || (a.msgIndex - b.msgIndex)));

  if (!fresh.length) {
    res.status(200).json({ ok: true, posted: 0 });
    return;
  }

  // No group registered: nothing can be posted. Advance the checkpoint
  // silently so a later registration doesn't flood the group with history.
  if (!updatesChat) {
    try {
      await persistSeen(visibleHashes);
    } catch (e) {
      console.error('checkpoint write failed', e && e.message);
      res.status(500).json({ ok: false, error: 'storage write failed' });
      return;
    }
    res.status(200).json({ ok: true, posted: 0, reason: 'no updates group registered' });
    return;
  }

  const threadId = updatesChat.thread_id != null ? updatesChat.thread_id : null;
  const toPost = fresh.slice(0, POST_CAP);
  const overflow = fresh.slice(POST_CAP);
  const postedHashes = [];
  let posted = 0;
  let sendFailed = false;

  for (const ev of toPost) {
    const text = await buildEventText(ev);
    const okSend = await sendEventPost(updatesChat.chat_id, text, threadId);
    if (!okSend) { sendFailed = true; break; }
    posted++;
    if (!postedHashes.includes(ev.txhash)) postedHashes.push(ev.txhash);
  }

  // Overflow gets one summary line — only when the first POST_CAP all
  // landed; the summarized txs then count as covered and are marked seen.
  if (!sendFailed && overflow.length) {
    const okSend = await sendToChat(updatesChat.chat_id,
      `+${overflow.length} more delegation events`, threadId);
    if (okSend) {
      for (const ev of overflow) {
        if (!postedHashes.includes(ev.txhash)) postedHashes.push(ev.txhash);
      }
    } else {
      sendFailed = true;
    }
  }

  if (postedHashes.length) {
    try {
      await persistSeen(postedHashes);
    } catch (e) {
      console.error('checkpoint write failed', e && e.message);
      res.status(500).json({ ok: false, error: 'storage write failed' });
      return;
    }
  }
  res.status(200).json({ ok: true, posted, ...(sendFailed ? { sendFailed: true } : {}) });
}
