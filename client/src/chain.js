// Chain reads go straight to the LCD with plain fetch — no SDK needed,
// nothing to break. Writes (the entry-fee transfer) are signed by the
// player's own wallet through Cosmos Kit (see WalletBar's payEntry).
import { FRG_CONTRACT, LCD_URL } from './config.js';

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
