// ---------------------------------------------------------------------------
// FRG Fight Club — game server (FREE-PLAY edition, converted 2026-10-18)
//
// The club no longer takes entry fees or pays prizes. Every game is free
// to play and awards POINTS. Points are leaderboard credit only: they are
// never sold, never bought, and cannot be exchanged for anything inside
// the app. The six skill titles (boxing, racing, flight, tower, breakout,
// slice) feed the SEASON leaderboard; at season's end the host pays a
// fixed, pre-announced FRG prize pool to the top finishers out of his own
// wallet, manually, outside this app (a sponsored contest — the server
// never touches funds, so it needs no wallet seed at all).
//
// Trust model: results are still client-reported, but every submission
// passes the same per-game plausibility checks the paid version used
// (exact tier re-derivation, timing bands, consistency rules). That is
// proportionate now: the worst a cheater can steal is leaderboard glory.
// ---------------------------------------------------------------------------

import 'dotenv/config';
import express from 'express';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const {
  PORT = 8787,
  BOT_TOKEN = '',
  WEBAPP_URL = '',
  SEASON_NAME = 'Season 1',
  SEASON_ENDS_AT = '', // ISO date, e.g. 2026-11-30T23:59:59Z (display only)
  PRIZE_POOL_FRG = '', // announced pool, e.g. '1000' (display only)
} = process.env;

const GAMES = ['boxing', 'wheel', 'crash', 'darts', 'racing', 'mines', 'pinball', 'breakout', 'flight', 'tower', 'slice', 'putt', 'snake', 'memory', 'crossing'];
// Skill titles feed the prize leaderboard. The rest are glory-only.
const SKILL_GAMES = ['boxing', 'racing', 'flight', 'tower', 'breakout', 'slice', 'putt', 'snake', 'memory', 'crossing'];
const SESSION_TTL_MS = 20 * 60 * 1000;

// Points tables — IDENTICAL numbers to the old FRG payouts, renamed.
// The per-game validation below re-derives every one of them exactly.
const BOXING_WIN_POINTS = 18;
const RACING_WIN_POINTS = 18;
const CRASH_POINTS_BASE = 10; // points = floor(10 * cashed multiplier)
const WHEEL_PRIZES = [0, 5, 10, 15, 20];

function seasonInfo() {
  // NOTE: the FRG season prize is deliberately NOT exposed to the client.
  // The app contains no crypto and no prize promises at all (Telegram's
  // mini-app rules restrict non-TON crypto promotion and regulated
  // services) — the host announces and pays the season pool entirely
  // off-app, from his own channels and wallet.
  return {
    name: SEASON_NAME,
    endsAt: SEASON_ENDS_AT || null,
    skillGames: SKILL_GAMES,
  };
}

// --- tiny persistent store for score events ---------------------------------
const dir = path.dirname(fileURLToPath(import.meta.url));
const dataDir = path.join(dir, 'data');
fs.mkdirSync(dataDir, { recursive: true });
const scoresFile = path.join(dataDir, 'scores.json');
let scoreEvents = [];
try {
  const parsed = JSON.parse(fs.readFileSync(scoresFile, 'utf8'));
  if (Array.isArray(parsed)) scoreEvents = parsed;
} catch {
  /* first run */
}
function recordScore(ev) {
  scoreEvents.push(ev);
  try {
    fs.writeFileSync(scoresFile, JSON.stringify(scoreEvents));
  } catch (e) {
    console.error('scores persist failed:', e.message);
  }
}

function aggregate(skillOnly) {
  const by = new Map();
  for (const ev of scoreEvents) {
    if (skillOnly && !ev.skill) continue;
    const row = by.get(ev.k) || { name: ev.name, points: 0, games: 0 };
    row.points += ev.pts;
    row.games += 1;
    row.name = ev.name; // latest display name wins
    by.set(ev.k, row);
  }
  return [...by.values()].sort((a, b) => b.points - a.points);
}
function board(skillOnly, limit = 10) {
  return aggregate(skillOnly).slice(0, limit);
}
function totalsFor(key) {
  let skill = 0;
  let glory = 0;
  let games = 0;
  for (const ev of scoreEvents) {
    if (ev.k !== key) continue;
    glory += ev.pts;
    if (ev.skill) skill += ev.pts;
    games += 1;
  }
  // rank = position of this key in each aggregate board (1-based)
  const rankOf = (skillOnly) => {
    const rows = aggregate(skillOnly);
    // aggregate rows don't carry the key; recompute with keys
    const by = new Map();
    for (const ev of scoreEvents) {
      if (skillOnly && !ev.skill) continue;
      const row = by.get(ev.k) || { points: 0 };
      row.points += ev.pts;
      by.set(ev.k, row);
    }
    const sorted = [...by.entries()].sort((a, b) => b[1].points - a[1].points);
    const idx = sorted.findIndex(([k]) => k === key);
    return idx >= 0 ? idx + 1 : null;
  };
  return { skill, glory, games, skillRank: rankOf(true), gloryRank: rankOf(false) };
}

// --- sessions (in memory) -----------------------------------------------------
const sessions = new Map(); // token -> { key, name, game, expiresAt, submitted }

// --- Telegram Mini App initData verification ---------------------------------
function verifyTelegramInitData(initData) {
  if (!BOT_TOKEN) return true; // not configured — dev mode (see README)
  // No initData means the game was opened outside Telegram (plain
  // browser). Allowed in free play: identity then falls back to a guest
  // handle. When initData IS present it must validate.
  if (!initData) return true;
  const params = new URLSearchParams(initData);
  const hash = params.get('hash');
  if (!hash) return false;
  params.delete('hash');
  const checkString = [...params.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([k, v]) => `${k}=${v}`)
    .join('\n');
  const secret = crypto
    .createHmac('sha256', 'WebAppData')
    .update(BOT_TOKEN)
    .digest();
  const computed = crypto
    .createHmac('sha256', secret)
    .update(checkString)
    .digest('hex');
  const authDate = Number(params.get('auth_date') || 0);
  const fresh = Date.now() / 1000 - authDate < 24 * 3600;
  return (
    computed === hash &&
    fresh &&
    crypto.timingSafeEqual(Buffer.from(computed), Buffer.from(hash))
  );
}

function parseTelegramUser(initData) {
  try {
    const params = new URLSearchParams(initData);
    const u = JSON.parse(params.get('user') || 'null');
    return u && u.id ? u : null;
  } catch {
    return null;
  }
}

// Who is playing? Telegram identity when inside Telegram (validated),
// otherwise a guest identity the client persists on the device.
function resolveIdentity(body) {
  const initData = body?.initData || '';
  if (initData) {
    if (!verifyTelegramInitData(initData)) {
      return { status: 401, error: 'Telegram session check failed.' };
    }
    const u = parseTelegramUser(initData);
    if (!u) return { status: 401, error: 'Telegram user missing.' };
    const name = u.first_name
      ? u.username
        ? `${u.first_name} (@${u.username})`
        : u.first_name
      : `Player ${u.id}`;
    return { key: `tg:${u.id}`, name };
  }
  const guestId = String(body?.guestId || '')
    .replace(/[^a-zA-Z0-9_-]/g, '')
    .slice(0, 40);
  const guestName = String(body?.guestName || '').trim().slice(0, 24);
  if (guestId) return { key: `guest:${guestId}`, name: guestName || 'Guest' };
  return { status: 400, error: 'No player identity — open from Telegram or set a player name.' };
}

// --- per-game result validation (carried over from the paid edition) --------
// Returns { points } or { error }. The browser reports the result; the
// server checks it is plausible for the game the session was started for.
function computePoints(game, result) {
  const durationMs = Number(result?.durationMs || 0);
  const bad = (error) => ({ error });

  if (game === 'wheel') {
    const prize = Number(result?.prize);
    if (!WHEEL_PRIZES.includes(prize)) return bad('Wheel result is not a wheel prize.');
    if (durationMs < 4_000 || durationMs > 10 * 60 * 1000) return bad('Wheel result timing looks implausible.');
    return { points: prize };
  }
  if (game === 'crash') {
    const mult = Number(result?.multiplier);
    if (result?.outcome === 'win') {
      if (!(mult >= 1.1 && mult <= 5.0)) return bad('Crash multiplier out of range.');
      const minMs = Math.max(1_000, (Math.log(mult) / 0.14) * 1000 * 0.7);
      if (durationMs < minMs || durationMs > 10 * 60 * 1000) return bad('Crash result timing looks implausible.');
      return { points: Math.floor(CRASH_POINTS_BASE * mult) };
    }
    if (result?.outcome === 'crash') return { points: 0 };
    return bad('Crash result outcome invalid.');
  }
  if (game === 'darts') {
    const amount = Number(result?.amount);
    const dartsUsed = Number(result?.dartsUsed);
    if (result?.outcome === 'win') {
      if (!(Number.isInteger(amount) && amount >= 1 && amount <= 27)) return bad('Darts pot out of range.');
      if (!(dartsUsed >= 1 && dartsUsed <= 3)) return bad('Darts count implausible.');
      if (durationMs < dartsUsed * 500 || durationMs > 10 * 60 * 1000) return bad('Darts result timing looks implausible.');
      return { points: amount };
    }
    if (result?.outcome === 'bust') return { points: 0 };
    return bad('Darts result outcome invalid.');
  }
  if (game === 'racing') {
    const et = Number(result?.etMs);
    const rival = Number(result?.rivalEtMs);
    if (result?.outcome === 'win') {
      if (!(et >= 8_500 && et <= 25_000)) return bad('Race ET implausible.');
      if (!(rival >= 9_500 && rival <= 11_100)) return bad('Rival ET out of range.');
      if (!(et < rival)) return bad('Win requires beating the rival.');
      if (durationMs < et || durationMs > 10 * 60 * 1000) return bad('Race timing looks implausible.');
      return { points: RACING_WIN_POINTS };
    }
    if (result?.outcome === 'lose' || result?.outcome === 'foul') return { points: 0 };
    return bad('Race result outcome invalid.');
  }
  if (game === 'mines') {
    const MINES_PAYOUTS = { 1: 8, 2: 10, 3: 12, 4: 16, 5: 22, 6: 30, 7: 43 };
    const picks = Number(result?.picks);
    const amount = Number(result?.amount);
    if (result?.outcome === 'win') {
      if (!(Number.isInteger(picks) && picks >= 1 && picks <= 7)) return bad('Mines pick count out of range.');
      if (amount !== MINES_PAYOUTS[picks]) return bad('Mines payout does not match the table.');
      if (durationMs < picks * 400 || durationMs > 10 * 60 * 1000) return bad('Mines result timing looks implausible.');
      return { points: amount };
    }
    if (result?.outcome === 'bust') return { points: 0 };
    return bad('Mines result outcome invalid.');
  }
  if (game === 'pinball') {
    const PINBALL_TIERS = [
      { min: 25000, amount: 45 },
      { min: 16000, amount: 32 },
      { min: 11000, amount: 22 },
      { min: 7000, amount: 15 },
      { min: 4000, amount: 10 },
      { min: 1500, amount: 5 },
    ];
    const score = Number(result?.score);
    const amount = Number(result?.amount);
    const tier = PINBALL_TIERS.find((t) => score >= t.min);
    const expected = tier ? tier.amount : 0;
    if (!(Number.isInteger(score) && score >= 0 && score <= 150000)) return bad('Pinball score out of range.');
    if (result?.outcome === 'win') {
      if (expected === 0 || amount !== expected) return bad('Pinball payout does not match the tier table.');
      if (Number(result?.ballsUsed) !== 3) return bad('Pinball game must use all 3 balls.');
      if (durationMs < 12_000 || durationMs > 10 * 60 * 1000) return bad('Pinball result timing looks implausible.');
      return { points: amount };
    }
    if (result?.outcome === 'lose') {
      if (expected !== 0 || amount !== 0) return bad('Pinball loss cannot carry a payout.');
      return { points: 0 };
    }
    return bad('Pinball result outcome invalid.');
  }
  if (game === 'breakout') {
    const BREAKOUT_TIERS = [
      { min: 5500, amount: 45 },
      { min: 4000, amount: 32 },
      { min: 2900, amount: 22 },
      { min: 2000, amount: 15 },
      { min: 1300, amount: 10 },
      { min: 600, amount: 5 },
    ];
    const score = Number(result?.score);
    const amount = Number(result?.amount);
    const tier = BREAKOUT_TIERS.find((t) => score >= t.min);
    const expected = tier ? tier.amount : 0;
    if (!(Number.isInteger(score) && score >= 0 && score <= 100000)) return bad('Breakout score out of range.');
    if (Number(result?.ballsUsed) !== 3) return bad('Breakout game must use all 3 balls.');
    if (durationMs < 15_000 || durationMs > 10 * 60 * 1000) return bad('Breakout result timing looks implausible.');
    if (result?.outcome === 'win') {
      if (expected === 0 || amount !== expected) return bad('Breakout payout does not match the tier table.');
      return { points: amount };
    }
    if (result?.outcome === 'lose') {
      if (expected !== 0 || amount !== 0) return bad('Breakout loss cannot carry a payout.');
      return { points: 0 };
    }
    return bad('Breakout result outcome invalid.');
  }
  if (game === 'flight') {
    const FLIGHT_TIERS = [
      { min: 3800, amount: 45 },
      { min: 2700, amount: 32 },
      { min: 2000, amount: 22 },
      { min: 1400, amount: 15 },
      { min: 900, amount: 10 },
      { min: 500, amount: 5 },
    ];
    const score = Number(result?.score);
    const amount = Number(result?.amount);
    const tier = FLIGHT_TIERS.find((t) => score >= t.min);
    const expected = tier ? tier.amount : 0;
    if (!(Number.isInteger(score) && score >= 0 && score <= 150000)) return bad('Flight score out of range.');
    const gates = Number(result?.gates);
    if (!(Number.isInteger(gates) && gates >= 0 && gates <= 1000)) return bad('Flight gate count out of range.');
    if (score % 25 !== 0 || score < gates * 100 || score > (gates + 1) * 125) return bad('Flight score inconsistent with gates.');
    if (durationMs < Math.max(6_000, gates * 800) || durationMs > 10 * 60 * 1000) return bad('Flight result timing looks implausible.');
    if (result?.outcome === 'win') {
      if (expected === 0 || amount !== expected) return bad('Flight payout does not match the tier table.');
      return { points: amount };
    }
    if (result?.outcome === 'lose') {
      if (expected !== 0 || amount !== 0) return bad('Flight loss cannot carry a payout.');
      return { points: 0 };
    }
    return bad('Flight result outcome invalid.');
  }
  if (game === 'tower') {
    const TOWER_TIERS = [
      { min: 4000, amount: 45 },
      { min: 3000, amount: 32 },
      { min: 2300, amount: 22 },
      { min: 1700, amount: 15 },
      { min: 1200, amount: 10 },
      { min: 800, amount: 5 },
    ];
    const score = Number(result?.score);
    const amount = Number(result?.amount);
    const tier = TOWER_TIERS.find((t) => score >= t.min);
    const expected = tier ? tier.amount : 0;
    if (!(Number.isInteger(score) && score >= 0 && score <= 100000)) return bad('Tower score out of range.');
    const blocks = Number(result?.blocks);
    if (!(Number.isInteger(blocks) && blocks >= 0 && blocks <= 500)) return bad('Tower block count out of range.');
    if (score < blocks * 100 || score > blocks * 150 || (score - blocks * 100) % 50 !== 0) return bad('Tower score inconsistent with blocks.');
    if (durationMs < Math.max(5_000, blocks * 400) || durationMs > 10 * 60 * 1000) return bad('Tower result timing looks implausible.');
    if (result?.outcome === 'win') {
      if (expected === 0 || amount !== expected) return bad('Tower payout does not match the tier table.');
      return { points: amount };
    }
    if (result?.outcome === 'lose') {
      if (expected !== 0 || amount !== 0) return bad('Tower loss cannot carry a payout.');
      return { points: 0 };
    }
    return bad('Tower result outcome invalid.');
  }
  if (game === 'slice') {
    const SLICE_TIERS = [
      { min: 5000, amount: 45 },
      { min: 3500, amount: 32 },
      { min: 2500, amount: 22 },
      { min: 1700, amount: 15 },
      { min: 1100, amount: 10 },
      { min: 600, amount: 5 },
    ];
    const score = Number(result?.score);
    const amount = Number(result?.amount);
    const tier = SLICE_TIERS.find((t) => score >= t.min);
    const expected = tier ? tier.amount : 0;
    if (!(Number.isInteger(score) && score >= 0 && score <= 150000)) return bad('Slice score out of range.');
    const sliced = Number(result?.sliced);
    if (!(Number.isInteger(sliced) && sliced >= 0 && sliced <= 2000)) return bad('Slice count out of range.');
    if (durationMs < 10_000 || durationMs > 10 * 60 * 1000) return bad('Slice result timing looks implausible.');
    if (result?.outcome === 'win') {
      if (expected === 0 || amount !== expected) return bad('Slice payout does not match the tier table.');
      return { points: amount };
    }
    if (result?.outcome === 'lose') {
      if (expected !== 0 || amount !== 0) return bad('Slice loss cannot carry a payout.');
      return { points: 0 };
    }
    return bad('Slice result outcome invalid.');
  }

  if (game === 'putt') {
    // Mini Putt: hole pays (7 - strokes) * 40, picked up at 7 = 0.
    // Server re-derives the score EXACTLY from the stroke counts.
    const PUTT_TIERS = [
      { min: 680, amount: 45 },
      { min: 560, amount: 32 },
      { min: 440, amount: 22 },
      { min: 320, amount: 15 },
      { min: 220, amount: 10 },
      { min: 120, amount: 5 },
    ];
    const sph = result?.strokesPerHole;
    if (!Array.isArray(sph) || sph.length !== 3 || !sph.every((n) => Number.isInteger(n) && n >= 1 && n <= 7)) {
      return bad('Putt stroke counts out of range.');
    }
    const score = sph.reduce((sum, n) => sum + (n >= 7 ? 0 : (7 - n) * 40), 0);
    if (Number(result?.score) !== score) return bad('Putt score does not match the stroke counts.');
    const tier = PUTT_TIERS.find((t) => score >= t.min);
    const expected = tier ? tier.amount : 0;
    const amount = Number(result?.amount);
    if (durationMs < 5_000 || durationMs > 10 * 60 * 1000) return bad('Putt timing looks implausible.');
    if (result?.outcome === 'win') {
      if (expected === 0 || amount !== expected) return bad('Putt payout does not match the tier table.');
      return { points: amount };
    }
    if (result?.outcome === 'lose') {
      if (expected !== 0 || amount !== 0) return bad('Putt loss cannot carry a payout.');
      return { points: 0 };
    }
    return bad('Putt result outcome invalid.');
  }
  if (game === 'snake') {
    // Snake: orbs pay 25, every 5th is golden (60) — golden count is
    // forced to floor(total/5) and the score is re-derived exactly.
    const SNAKE_TIERS = [
      { min: 1400, amount: 45 },
      { min: 1050, amount: 32 },
      { min: 750, amount: 22 },
      { min: 500, amount: 15 },
      { min: 300, amount: 10 },
      { min: 150, amount: 5 },
    ];
    const total = Number(result?.orbs);
    const golden = Number(result?.golden);
    const score = Number(result?.score);
    const amount = Number(result?.amount);
    if (!(Number.isInteger(total) && total >= 0 && total <= 300)) return bad('Snake orb count out of range.');
    if (golden !== Math.floor(total / 5)) return bad('Snake golden count inconsistent.');
    if (score !== 25 * (total - golden) + 60 * golden) return bad('Snake score does not match the orb counts.');
    const tier = SNAKE_TIERS.find((t) => score >= t.min);
    const expected = tier ? tier.amount : 0;
    if (durationMs < Math.max(1_500, total * 300) || durationMs > 15 * 60 * 1000) return bad('Snake timing looks implausible.');
    if (result?.outcome === 'win') {
      if (expected === 0 || amount !== expected) return bad('Snake payout does not match the tier table.');
      return { points: amount };
    }
    if (result?.outcome === 'lose') {
      if (expected !== 0 || amount !== 0) return bad('Snake loss cannot carry a payout.');
      return { points: 0 };
    }
    return bad('Snake result outcome invalid.');
  }
  if (game === 'memory') {
    // Memory: score = 100R + 25 * R(R+1)/2 for R completed rounds —
    // re-derived exactly from the round count.
    const MEMORY_TIERS = [
      { min: 3000, amount: 45 },
      { min: 2100, amount: 32 },
      { min: 1400, amount: 22 },
      { min: 875, amount: 15 },
      { min: 450, amount: 10 },
      { min: 150, amount: 5 },
    ];
    const rounds = Number(result?.rounds);
    const score = Number(result?.score);
    const amount = Number(result?.amount);
    if (!(Number.isInteger(rounds) && rounds >= 0 && rounds <= 30)) return bad('Memory round count out of range.');
    if (score !== 100 * rounds + 25 * ((rounds * (rounds + 1)) / 2)) return bad('Memory score does not match the round count.');
    const tier = MEMORY_TIERS.find((t) => score >= t.min);
    const expected = tier ? tier.amount : 0;
    if (durationMs < Math.max(2_000, rounds * 1_500) || durationMs > 15 * 60 * 1000) return bad('Memory timing looks implausible.');
    if (result?.outcome === 'win') {
      if (expected === 0 || amount !== expected) return bad('Memory payout does not match the tier table.');
      return { points: amount };
    }
    if (result?.outcome === 'lose') {
      if (expected !== 0 || amount !== 0) return bad('Memory loss cannot carry a payout.');
      return { points: 0 };
    }
    return bad('Memory result outcome invalid.');
  }
  if (game === 'crossing') {
    // Crossing: every crossing pays exactly 150 — score is re-derived
    // from the crossing count alone.
    const CROSSING_TIERS = [
      { min: 1200, amount: 45 },
      { min: 900, amount: 32 },
      { min: 600, amount: 22 },
      { min: 450, amount: 15 },
      { min: 300, amount: 10 },
      { min: 150, amount: 5 },
    ];
    const crossings = Number(result?.crossings);
    const score = Number(result?.score);
    const amount = Number(result?.amount);
    if (!(Number.isInteger(crossings) && crossings >= 0 && crossings <= 40)) return bad('Crossing count out of range.');
    if (score !== crossings * 150) return bad('Crossing score does not match the crossing count.');
    const tier = CROSSING_TIERS.find((t) => score >= t.min);
    const expected = tier ? tier.amount : 0;
    if (durationMs < Math.max(2_000, crossings * 3_000) || durationMs > 15 * 60 * 1000) return bad('Crossing timing looks implausible.');
    if (result?.outcome === 'win') {
      if (expected === 0 || amount !== expected) return bad('Crossing payout does not match the tier table.');
      return { points: amount };
    }
    if (result?.outcome === 'lose') {
      if (expected !== 0 || amount !== 0) return bad('Crossing loss cannot carry a payout.');
      return { points: 0 };
    }
    return bad('Crossing result outcome invalid.');
  }
  // boxing (default)
  const damageDealt = Number(result?.damageDealt || 0);
  if (result?.outcome === 'win') {
    if (durationMs < 12_000 || durationMs > 10 * 60 * 1000) return bad('Match timing looks implausible.');
    if (!(damageDealt >= 40 && damageDealt <= 500)) return bad('Match result looks implausible.');
    return { points: BOXING_WIN_POINTS };
  }
  if (result?.outcome === 'lose') {
    if (durationMs > 10 * 60 * 1000) return bad('Match timing looks implausible.');
    return { points: 0 };
  }
  return bad('Boxing result outcome invalid.');
}

// --- HTTP API ------------------------------------------------------------------
const app = express();
app.use(express.json());
app.use((req, res, next) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,OPTIONS');
  if (req.method === 'OPTIONS') return res.sendStatus(204);
  next();
});

// naive per-IP throttle
const hits = new Map();
function throttle(req, res, next) {
  const now = Date.now();
  const list = (hits.get(req.ip) || []).filter((t) => now - t < 60_000);
  if (list.length >= 60) {
    return res.status(429).json({ error: 'Too many requests — slow down.' });
  }
  list.push(now);
  hits.set(req.ip, list);
  next();
}

app.get('/api/health', (req, res) => res.json({ ok: true }));

app.get('/api/config', (req, res) => res.json({ season: seasonInfo(), games: GAMES }));

app.get('/api/leaderboard', (req, res) =>
  res.json({ season: seasonInfo(), skill: board(true), glory: board(false) })
);

app.post('/api/me', (req, res) => {
  const id = resolveIdentity(req.body || {});
  if (id.error) return res.status(id.status).json({ error: id.error });
  res.json({ name: id.name, ...totalsFor(id.key) });
});

app.post('/api/start', throttle, (req, res) => {
  const { game } = req.body || {};
  if (!GAMES.includes(game)) return res.status(400).json({ error: 'Unknown game.' });
  const id = resolveIdentity(req.body || {});
  if (id.error) return res.status(id.status).json({ error: id.error });
  const sessionToken = crypto.randomBytes(24).toString('hex');
  sessions.set(sessionToken, {
    key: id.key,
    name: id.name,
    game,
    expiresAt: Date.now() + SESSION_TTL_MS,
    submitted: false,
  });
  res.json({ sessionToken, playerName: id.name, season: seasonInfo() });
});

app.post('/api/submit', throttle, (req, res) => {
  const { sessionToken, result } = req.body || {};
  const session = sessions.get(sessionToken);
  if (!session) return res.status(404).json({ error: 'Session not found.' });
  if (session.submitted) return res.status(409).json({ error: 'Result already recorded for this game.' });
  if (Date.now() > session.expiresAt) {
    sessions.delete(sessionToken);
    return res.status(410).json({ error: 'Session expired — start a new game.' });
  }
  const verdict = computePoints(session.game, result || {});
  if (verdict.error) return res.status(400).json({ error: verdict.error });
  session.submitted = true;
  const skill = SKILL_GAMES.includes(session.game);
  recordScore({
    k: session.key,
    name: session.name,
    game: session.game,
    pts: verdict.points,
    skill,
    ts: Date.now(),
  });
  sessions.delete(sessionToken);
  res.json({
    points: verdict.points,
    skill,
    totals: totalsFor(session.key),
  });
});

app.listen(PORT, () => {
  console.log(`FRG Fight Club server (free play) on :${PORT}`);
  console.log(`  season: ${SEASON_NAME} · skill games: ${SKILL_GAMES.join(', ')} · scores on file: ${scoreEvents.length}`);
  if (!BOT_TOKEN) console.log('  WARNING: BOT_TOKEN not set — Telegram initData is NOT being verified.');
  startBot();
});

// --- Telegram bot (integrated): sets the menu button and answers /start ---
async function tg(method, body) {
  const r = await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/${method}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
  return r.json().catch(() => ({}));
}

async function startBot() {
  if (!BOT_TOKEN || !WEBAPP_URL) {
    console.log('  bot: skipped (BOT_TOKEN / WEBAPP_URL not set)');
    return;
  }
  try {
    // The bot's public description/about are set from here (Bot API
    // setMyDescription / setMyShortDescription) so the owner never has
    // to fight BotFather menus. Free-arcade wording only — no prizes,
    // no crypto (see the conversion note at the top of this file).
    const d1 = await tg('setMyDescription', {
      description:
        '🥊 FRG FIGHT CLUB — a free arcade in Telegram.\n\n11 games: boxing, drag racing, pinball, breakout, flight, tower, slice, and more. Every game is free to play — no wallet, no payments, nothing to buy. Climb the Season 1 leaderboard on the skill titles!',
    });
    const d2 = await tg('setMyShortDescription', {
      short_description: '🥊 Free arcade — 11 games, season leaderboard. No wallet needed.',
    });
    console.log('  bot: description set:', d1.ok === true && d2.ok === true ? 'ok' : JSON.stringify({ d1, d2 }).slice(0, 200));
    await tg('setChatMenuButton', {
      menu_button: { type: 'web_app', text: '🥊 Play FRG Fight Club', web_app: { url: WEBAPP_URL } },
    });
    await tg('setMyCommands', { commands: [{ command: 'start', description: 'Open FRG Fight Club' }] });
    console.log('  bot: menu button set, polling /start');
    let offset = 0;
    for (;;) {
      try {
        const res = await tg('getUpdates', { offset, timeout: 25, allowed_updates: ['message'] });
        for (const u of res.result || []) {
          offset = u.update_id + 1;
          const msg = u.message;
          if (msg?.text?.startsWith('/start')) {
            await tg('sendMessage', {
              chat_id: msg.chat.id,
              text: '🥊 *FRG FIGHT CLUB*\n\nFree to play — all 11 games, no wallet needed, nothing to buy. Climb the season leaderboard on the six skill titles.\n\nTap Play below — good luck!',
              parse_mode: 'Markdown',
              reply_markup: {
                inline_keyboard: [[{ text: '🥊 Play FRG Fight Club', web_app: { url: WEBAPP_URL } }]],
              },
            });
          }
        }
      } catch {
        await new Promise((r) => setTimeout(r, 5000));
      }
    }
  } catch (e) {
    console.error('bot:', e.message);
  }
}
