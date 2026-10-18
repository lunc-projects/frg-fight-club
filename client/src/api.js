// Calls to the game server (server/ folder). Free-play edition: no
// wallet, no payments — the server issues a one-time session per game
// and records the validated result as leaderboard points.
import { API_BASE } from './config.js';

function telegramInitData() {
  return window.Telegram?.WebApp?.initData || '';
}

export function hasTelegramData() {
  return telegramInitData().length > 0;
}

export function telegramUser() {
  try {
    return window.Telegram?.WebApp?.initDataUnsafe?.user || null;
  } catch {
    return null;
  }
}

// Guest identity for plain-browser play (inside Telegram the validated
// initData identity is used instead). Persisted on this device only.
export function guestIdentity() {
  let id = '';
  let name = '';
  try {
    id = localStorage.getItem('frg.guestId') || '';
    if (!id) {
      id = Math.random().toString(36).slice(2, 10) + Date.now().toString(36);
      localStorage.setItem('frg.guestId', id);
    }
    name = localStorage.getItem('frg.guestName') || '';
  } catch {
    id = 'guest';
  }
  return { guestId: id, guestName: name };
}

export function setGuestName(name) {
  try {
    localStorage.setItem('frg.guestName', name);
  } catch {
    /* private mode */
  }
}

function identityBody() {
  const initData = telegramInitData();
  if (initData) return { initData };
  return guestIdentity();
}

async function postJson(path, body) {
  const res = await fetch(`${API_BASE}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || `Server error (${res.status})`);
  return data;
}

async function getJson(path) {
  const res = await fetch(`${API_BASE}${path}`);
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || `Server error (${res.status})`);
  return data;
}

/** Open a free session for one game. Returns { sessionToken, playerName, season }. */
export function startGame(game) {
  return postJson('/api/start', { game, ...identityBody() });
}

/** Record a finished game's result. Returns { points, skill, totals }. */
export function submitResult(sessionToken, result) {
  return postJson('/api/submit', { sessionToken, result });
}

/** Both leaderboards + season info. */
export function getLeaderboard() {
  return getJson('/api/leaderboard');
}

/** The current player's totals and ranks. */
export function getMe() {
  return postJson('/api/me', identityBody());
}
