// Chain reads go straight to the LCD with plain fetch — no SDK needed,
// nothing to break. Writes (the entry-fee transfer) are signed by the
// player's own wallet through Cosmos Kit (see WalletBar's payEntry).
import { FRG_CONTRACT, LCD_URL, TREASURY_ADDRESS, ENTRY_FEE_FRG } from './config.js';

function b64(obj) {
  return btoa(JSON.stringify(obj));
}

/** FRG balance of an address, in whole FRG (e.g. 123.45). */
export async function getFrgBalance(address) {
  const q = b64({ balance: { address } });
  const res = await fetch(
    `${LCD_URL}/cosmwasm/wasm/v1/contract/${FRG_CONTRACT}/smart/${q}`
  );
  if (!res.ok) throw new Error(`LCD balance query failed (${res.status})`);
  const data = await res.json();
  return Number(data.data.balance) / 1_000_000;
}

export function finderTxUrl(txhash) {
  return `https://finder.terra-classic.io/columbus-5/tx/${txhash}`;
}

/**
 * Find this player's recent entry-fee transfers to the treasury
 * (newest first) — used to recover a payment whose wallet round-trip
 * froze inside Telegram. Returns txhashes; the server decides which
 * ones are still unused.
 */
export async function findRecentEntries(address) {
  const q = encodeURIComponent(`message.sender='${address}'`);
  const res = await fetch(
    `${LCD_URL}/cosmos/tx/v1beta1/txs?query=${q}&pagination.limit=12&order_by=ORDER_BY_DESC`
  );
  if (!res.ok) throw new Error(`LCD tx search failed (${res.status})`);
  const data = await res.json();
  const minMicro = ENTRY_FEE_FRG * 1_000_000;
  const cutoff = Date.now() - 60 * 60 * 1000;
  const hashes = [];
  for (const t of data.tx_responses || []) {
    if (t.code !== 0) continue;
    if (new Date(t.timestamp).getTime() < cutoff) continue;
    let ok = false;
    for (const log of t.logs || []) {
      for (const e of log.events || []) {
        if (e.type !== 'wasm') continue;
        const a = Object.fromEntries(e.attributes.map((x) => [x.key, x.value]));
        if (
          a.action === 'transfer' &&
          a._contract_address === FRG_CONTRACT &&
          a.to === TREASURY_ADDRESS &&
          Number(a.amount) >= minMicro
        ) {
          ok = true;
        }
      }
    }
    if (ok) hashes.push(t.txhash);
  }
  return hashes;
}
