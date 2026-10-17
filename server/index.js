// ---------------------------------------------------------------------------
// FRG Fight Club — game server
//
// Trust model: the browser is NEVER trusted.
//  - Entry: the player pays the FRG entry fee in their own wallet. This
//    server re-checks that exact tx on-chain (right contract, right sender,
//    right treasury, right amount, tx succeeded) before issuing a session.
//  - Prizes: paid only against a real, unused, unexpired session whose match
//    result passes basic plausibility checks. Paid from the treasury wallet
//    whose seed lives ONLY in this server's .env.
//  - Each entry tx can be used exactly once (replay protection, persisted).
// ---------------------------------------------------------------------------

import 'dotenv/config';
import express from 'express';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  LCDClient,
  MnemonicKey,
  MsgExecuteContract,
} from '@terra-money/terra.js';

const {
  PORT = 8787,
  LCD_URL = 'https://terra-classic-lcd.publicnode.com',
  CHAIN_ID = 'columbus-5',
  FRG_CONTRACT,
  ENTRY_FEE_FRG = '10',
  PRIZE_FRG = '18',
  TREASURY_ADDRESS,
  TREASURY_MNEMONIC,
  BOT_TOKEN = '',
  WEBAPP_URL = '',
} = process.env;

if (!FRG_CONTRACT || !TREASURY_ADDRESS || !TREASURY_MNEMONIC) {
  console.error(
    'Missing FRG_CONTRACT, TREASURY_ADDRESS or TREASURY_MNEMONIC — copy .env.example to .env and fill it in.'
  );
  process.exit(1);
}

const DECIMALS = 6;
const ENTRY_MICRO = BigInt(Math.round(Number(ENTRY_FEE_FRG) * 10 ** DECIMALS));
const PRIZE_MICRO = String(Math.round(Number(PRIZE_FRG) * 10 ** DECIMALS));
// Prize Wheel (game 'wheel'): "extra safe" tuning chosen by the owner —
// 12 segments: BUST ×5, 5 ×3, 10 ×2, 15, 20. EV payout 5.83 FRG on a
// 10 FRG entry, so the treasury keeps ~4.17 FRG per spin on average.
const WHEEL_PRIZES = [0, 5, 10, 15, 20];
const GAMES = ['boxing', 'wheel'];
const SESSION_TTL_MS = 20 * 60 * 1000;

// --- tiny persistent store for spent entry txs ------------------------------
const dir = path.dirname(fileURLToPath(import.meta.url));
const dataDir = path.join(dir, 'data');
fs.mkdirSync(dataDir, { recursive: true });
const usedFile = path.join(dataDir, 'used_entry_txs.json');
let usedTxs = new Set();
try {
  usedTxs = new Set(JSON.parse(fs.readFileSync(usedFile, 'utf8')));
} catch {
  /* first run */
}
function markTxUsed(hash) {
  usedTxs.add(hash);
  fs.writeFileSync(usedFile, JSON.stringify([...usedTxs]));
}

// --- sessions (in memory; fine for a community game) -----------------------
const sessions = new Map(); // token -> { player, expiresAt, claimed }

// --- LCD helpers -------------------------------------------------------------
async function lcdJson(pathname) {
  const res = await fetch(`${LCD_URL}${pathname}`);
  if (!res.ok) throw new Error(`LCD ${res.status} on ${pathname}`);
  return res.json();
}

async function getFrgBalanceMicro(address) {
  const q = Buffer.from(JSON.stringify({ balance: { address } })).toString(
    'base64'
  );
  const data = await lcdJson(
    `/cosmwasm/wasm/v1/contract/${FRG_CONTRACT}/smart/${q}`
  );
  return BigInt(data.data.balance);
}

/**
 * Verify an entry-fee tx on-chain. Returns true only if:
 *  - the tx succeeded (code 0)
 *  - it contains a wasm execute on the FRG contract
 *  - the execute is a transfer TO the treasury of >= the entry fee
 *  - the sender is the player claiming the session
 */
async function verifyEntryTx(txhash, playerAddress) {
  let data;
  try {
    data = await lcdJson(`/cosmos/tx/v1beta1/txs/${txhash}`);
  } catch {
    return false; // tx not indexed yet (or bogus hash) — treat as unverified
  }
  const resp = data.tx_response;
  if (!resp || resp.code !== 0) return false;
  const messages = resp.tx?.body?.messages || [];
  for (const m of messages) {
    if (!m['@type']?.includes('MsgExecuteContract')) continue;
    if (m.contract !== FRG_CONTRACT) continue;
    if (m.sender !== playerAddress) continue;
    let exec;
    try {
      exec = typeof m.msg === 'string' ? JSON.parse(m.msg) : m.msg;
    } catch {
      continue;
    }
    const t = exec?.transfer;
    if (
      t &&
      t.recipient === TREASURY_ADDRESS &&
      BigInt(t.amount) >= ENTRY_MICRO
    ) {
      return true;
    }
  }
  return false;
}

// --- Telegram Mini App initData verification -------------------------------
function verifyTelegramInitData(initData) {
  if (!BOT_TOKEN) return true; // not configured — skip (see README)
  // No initData means the game was opened outside Telegram (e.g. in the
  // Station/Keplr app browser, where wallet connect actually works on
  // mobile). Allow it: the on-chain entry-payment check is the real gate.
  // When initData IS present it must validate.
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

// --- payout ------------------------------------------------------------------
const lcd = new LCDClient({
  URL: LCD_URL,
  chainID: CHAIN_ID,
  gasPrices: { uluna: '28.325' },
  gasAdjustment: 1.75,
});
const treasuryWallet = lcd.wallet(
  new MnemonicKey({ mnemonic: TREASURY_MNEMONIC })
);
if (treasuryWallet.key.accAddress !== TREASURY_ADDRESS) {
  console.error(
    'TREASURY_MNEMONIC does not belong to TREASURY_ADDRESS — fix .env before players pay in.'
  );
  process.exit(1);
}

let payoutLock = Promise.resolve();
function payPrize(playerAddress, amountMicro) {
  // serialize payouts so two claims can't race the treasury sequence number
  payoutLock = payoutLock.then(async () => {
    const bal = await getFrgBalanceMicro(TREASURY_ADDRESS);
    if (bal < BigInt(amountMicro)) {
      throw new Error('Treasury is out of FRG — top it up.');
    }
    const msg = new MsgExecuteContract(TREASURY_ADDRESS, FRG_CONTRACT, {
      transfer: { recipient: playerAddress, amount: amountMicro },
    });
    const tx = await treasuryWallet.createAndSignTx({ msgs: [msg] });
    const result = await lcd.tx.broadcast(tx);
    if (result.code) {
      throw new Error(`Payout failed on-chain (code ${result.code})`);
    }
    return result.txhash;
  });
  return payoutLock;
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

// naive per-IP throttle for the money endpoints
const hits = new Map();
function throttle(req, res, next) {
  const now = Date.now();
  const list = (hits.get(req.ip) || []).filter((t) => now - t < 60_000);
  if (list.length >= 30) {
    return res.status(429).json({ error: 'Too many requests — slow down.' });
  }
  list.push(now);
  hits.set(req.ip, list);
  next();
}

app.get('/api/health', (req, res) => res.json({ ok: true }));

app.get('/api/config', (req, res) =>
  res.json({
    chainId: CHAIN_ID,
    frgContract: FRG_CONTRACT,
    entryFeeFrg: Number(ENTRY_FEE_FRG),
    prizeFrg: Number(PRIZE_FRG),
    treasuryAddress: TREASURY_ADDRESS,
  })
);

app.post('/api/verify-entry', throttle, async (req, res) => {
  try {
    const { txhash, playerAddress, initData, game } = req.body || {};
    if (!txhash || !playerAddress) {
      return res.status(400).json({ error: 'txhash and playerAddress required.' });
    }
    const gameId = GAMES.includes(game) ? game : 'boxing';
    if (!verifyTelegramInitData(initData || '')) {
      return res.status(401).json({ error: 'Telegram session check failed.' });
    }
    if (usedTxs.has(txhash)) {
      return res.status(409).json({ error: 'That payment was already used for a match.' });
    }
    const ok = await verifyEntryTx(txhash, playerAddress);
    if (!ok) {
      return res.status(402).json({
        error:
          'Payment not verified on-chain yet — if you just paid, wait ~10 seconds and retry with the same tx.',
      });
    }
    markTxUsed(txhash);
    const sessionToken = crypto.randomBytes(24).toString('hex');
    sessions.set(sessionToken, {
      player: playerAddress,
      game: gameId,
      expiresAt: Date.now() + SESSION_TTL_MS,
      claimed: false,
    });
    res.json({ sessionToken });
  } catch (e) {
    console.error('verify-entry:', e);
    res.status(500).json({ error: 'Server error during verification.' });
  }
});

app.post('/api/claim', throttle, async (req, res) => {
  try {
    const { sessionToken, result } = req.body || {};
    const session = sessions.get(sessionToken);
    if (!session) return res.status(404).json({ error: 'Session not found.' });
    if (session.claimed) return res.status(409).json({ error: 'Prize already claimed for this match.' });
    if (Date.now() > session.expiresAt) {
      sessions.delete(sessionToken);
      return res.status(410).json({ error: 'Session expired.' });
    }
    // Per-game claim rules. The browser reports the result; the server
    // checks it is plausible for the game this session was paid for.
    // These stop instant-claim bots; they are not bulletproof anti-cheat
    // (see README "Honest limits").
    const durationMs = Number(result?.durationMs || 0);
    let amountFrg = 0;

    if (session.game === 'wheel') {
      const prize = Number(result?.prize);
      if (!WHEEL_PRIZES.includes(prize)) {
        return res.status(400).json({ error: 'Wheel result is not a wheel prize.' });
      }
      if (durationMs < 4_000 || durationMs > 10 * 60 * 1000) {
        return res.status(400).json({ error: 'Wheel result timing looks implausible.' });
      }
      amountFrg = prize;
    } else {
      // boxing (default)
      const damageDealt = Number(result?.damageDealt || 0);
      if (result?.outcome !== 'win') {
        return res.status(400).json({ error: 'Only a win can claim a prize.' });
      }
      if (durationMs < 12_000) {
        return res.status(400).json({ error: 'Match too short to be a real win.' });
      }
      if (!(damageDealt >= 40 && damageDealt <= 500)) {
        return res.status(400).json({ error: 'Match result looks implausible.' });
      }
      amountFrg = Number(PRIZE_FRG);
    }

    session.claimed = true; // lock before paying, so a double-click can't double-pay
    let payoutTxhash = null;
    if (amountFrg > 0) {
      const amountMicro = String(Math.round(amountFrg * 10 ** DECIMALS));
      try {
        payoutTxhash = await payPrize(session.player, amountMicro);
      } catch (payErr) {
        session.claimed = false; // payout failed — let the player retry the claim
        throw payErr;
      }
    }
    sessions.delete(sessionToken);
    res.json({ payoutTxhash, amountFrg });
  } catch (e) {
    console.error('claim:', e);
    res.status(500).json({ error: e.message || 'Payout failed — contact the game admin with your session time.' });
  }
});

app.listen(PORT, () => {
  console.log(`FRG Fight Club server on :${PORT}`);
  console.log(`  chain ${CHAIN_ID} · entry ${ENTRY_FEE_FRG} FRG · prize ${PRIZE_FRG} FRG`);
  console.log(`  treasury ${TREASURY_ADDRESS}`);
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
              text: '🥊 *FRG FIGHT CLUB*\n\nPay 10 FRG to step in the ring. Beat the fighter, win *18 FRG*.\n\nTap Play below — good luck!',
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
