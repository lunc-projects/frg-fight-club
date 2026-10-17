// Calls to the game server (server/ folder). The server — never the
// browser — verifies payments on-chain and pays prizes from the treasury.
import { API_BASE } from './config.js';

function telegramInitData() {
  return window.Telegram?.WebApp?.initData || '';
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

/**
 * After the player pays the entry fee in their wallet, hand the txhash to
 * the server. It verifies the transfer on-chain and returns a one-time
 * session token that unlocks exactly one match.
 */
export function verifyEntry(txhash, playerAddress) {
  return postJson('/api/verify-entry', {
    txhash,
    playerAddress,
    initData: telegramInitData(),
  });
}

/**
 * After a win, claim the prize. The server checks the session is real,
 * unused and plausible, then pays from the treasury.
 * Returns { payoutTxhash }.
 */
export function claimPrize(sessionToken, matchResult) {
  return postJson('/api/claim', { sessionToken, result: matchResult });
}
