// Chain reads go straight to the LCD with plain fetch — no SDK needed,
// nothing to break. Writes (the entry-fee transfer) go through the
// connected wallet via wallet-kit.
import { MsgExecuteContract } from '@terra-money/feather.js';
import { FRG_CONTRACT, LCD_URL, TREASURY_ADDRESS, toMicro } from './config.js';

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

/** Build the CW20 transfer that pays the entry fee to the treasury. */
export function buildEntryFeeMsg(senderAddress, entryFeeFrg) {
  return new MsgExecuteContract(senderAddress, FRG_CONTRACT, {
    transfer: { recipient: TREASURY_ADDRESS, amount: toMicro(entryFeeFrg) },
  });
}

/** Extract a txhash from whatever shape the wallet's post() returns. */
export function extractTxHash(postResult) {
  return (
    postResult?.result?.txhash ||
    postResult?.result?.result?.txhash ||
    postResult?.txhash ||
    null
  );
}

export function finderTxUrl(txhash) {
  return `https://finder.terra-classic.io/columbus-5/tx/${txhash}`;
}
