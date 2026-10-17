import { useEffect, useRef, useState } from 'react';
import { useChain, useChainWallet } from '@cosmos-kit/react';
import { CHAIN_NAME } from './chainDef.js';
import { FRG_CONTRACT, TREASURY_ADDRESS, ENTRY_FEE_FRG, toMicro } from './config.js';
import { getFrgBalance } from './chain.js';

/**
 * Player wallet access via Cosmos Kit.
 * Returns the connected address and a payEntry() that signs the FRG
 * entry-fee transfer with whatever wallet the player connected
 * and returns the txhash.
 */
export function usePlayer() {
  const chain = useChain(CHAIN_NAME);
  const address = chain.address || undefined;

  const payEntry = async () => {
    if (!address) throw new Error('Connect your wallet first.');
    const client = await chain.getSigningCosmWasmClient();
    const res = await client.execute(
      address,
      FRG_CONTRACT,
      { transfer: { recipient: TREASURY_ADDRESS, amount: toMicro(ENTRY_FEE_FRG) } },
      'auto'
    );
    return res.transactionHash;
  };

  return { address, status: chain.status, payEntry };
}

// Our own wallet picker — the Cosmos Kit stock modal renders broken
// (unstyled, giant icons) inside Telegram's webview, so the game draws
// its own list with plain buttons and connects each wallet directly.
const WALLET_OPTIONS = [
  { id: 'keplr-extension', label: 'Keplr', hint: 'In the Keplr app browser, or desktop extension' },
  { id: 'station-extension', label: 'Station', hint: 'In the Station app browser, or desktop extension' },
  { id: 'keplr-mobile', label: 'Keplr Mobile 📱', hint: 'Pair via the Keplr app (pairing link)' },
  { id: 'galaxy-station', label: 'Galaxy Station 📱', hint: 'Opens the Galaxy Station app to approve' },
  { id: 'luncdash', label: 'LuncDash 📱', hint: 'Opens the LuncDash app to approve' },
];

function WalletOption({ opt, onDone }) {
  const w = useChainWallet(CHAIN_NAME, opt.id);
  const wRef = useRef(w);
  wRef.current = w;
  const notExist = w.isWalletNotExist || w.status === 'NotExist';
  const [phase, setPhase] = useState('idle'); // idle | starting | waiting | error
  const [uri, setUri] = useState(null);
  const [errMsg, setErrMsg] = useState('');
  const [copied, setCopied] = useState(false);
  const pollRef = useRef(null);

  const stopPoll = () => {
    if (pollRef.current) clearInterval(pollRef.current);
    pollRef.current = null;
  };
  useEffect(() => stopPoll, []);

  const startConnect = () => {
    setPhase('starting');
    setErrMsg('');
    setUri(null);
    setCopied(false);
    const startedAt = Date.now();
    stopPoll();
    pollRef.current = setInterval(() => {
      const data = wRef.current?.qrUrl?.data;
      if (data) {
        setUri(data);
        setPhase('waiting');
        stopPoll();
      } else if (Date.now() - startedAt > 25000) {
        stopPoll();
        setPhase('error');
        setErrMsg(
          'No pairing link came back — the WalletConnect relay may be unreachable from this browser. Try again, or open the game in Chrome / inside your wallet app’s browser instead.'
        );
      }
    }, 400);
    wRef.current
      .connect()
      .then(() => {
        stopPoll();
        setPhase('idle');
        onDone?.();
      })
      .catch((e) => {
        stopPoll();
        if (!wRef.current?.qrUrl?.data) {
          setPhase('error');
          setErrMsg(e?.message ? String(e.message).slice(0, 160) : 'Connection failed.');
        }
      });
  };

  const busy = phase === 'starting' || phase === 'waiting';
  return (
    <div className="wallet-option-wrap">
      <button className="btn btn-wallet-option" disabled={busy} onClick={startConnect}>
        <span className="wo-label">{opt.label}</span>
        <span className="wo-hint">
          {phase === 'starting'
            ? 'Contacting WalletConnect…'
            : phase === 'waiting'
              ? 'Pairing link ready — paste it in the app, then approve'
              : phase === 'error'
                ? 'Tap to try again'
                : notExist
                  ? 'Not found in this browser — use the app option or open the game inside the wallet app'
                  : opt.hint}
        </span>
      </button>
      {uri && (
        <>
          <button
            className="btn btn-ghost wo-copy"
            onClick={async () => {
              try {
                await navigator.clipboard.writeText(uri);
                setCopied(true);
              } catch {}
            }}
          >
            {copied ? '✓ Copied — now paste it in your wallet app' : '📋 Copy pairing link — paste it in your wallet app’s WalletConnect screen'}
          </button>
          <input className="wo-uri" readOnly value={uri} onFocus={(e) => e.target.select()} />
        </>
      )}
      {phase === 'error' && errMsg && <div className="wo-error">{errMsg}</div>}
    </div>
  );
}

export default function WalletBar({ balance, setBalance }) {
  const { address, disconnect, username } = useChain(CHAIN_NAME);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    let live = true;
    if (address) {
      getFrgBalance(address)
        .then((b) => live && setBalance(b))
        .catch(() => live && setBalance(null));
    } else {
      setBalance(null);
    }
    return () => {
      live = false;
    };
  }, [address, setBalance]);

  if (!address) {
    return (
      <div className="walletbar">
        <div className="walletbar-label">Connect a wallet to play</div>
        {!open ? (
          <div className="wallet-buttons">
            <button className="btn btn-wallet" onClick={() => setOpen(true)}>
              🔗 Connect Wallet
            </button>
          </div>
        ) : (
          <div className="wallet-options">
            {WALLET_OPTIONS.map((o) => (
              <WalletOption key={o.id} opt={o} onDone={() => setOpen(false)} />
            ))}
            <button className="btn btn-ghost" onClick={() => setOpen(false)}>
              Cancel
            </button>
          </div>
        )}
        <div className="walletbar-hint">
          Inside the Keplr or Station app browser, the plain Keplr / Station
          options connect directly. From Telegram or a normal browser, tap a
          📱 app option, then tap the pairing-link button that appears and
          paste the link into that wallet app's WalletConnect screen.
        </div>
      </div>
    );
  }

  return (
    <div className="walletbar connected">
      <div>
        <div className="addr">
          {address.slice(0, 10)}…{address.slice(-6)}
          {username ? ` · ${username}` : ''}
        </div>
        <div className="bal">
          {balance === null
            ? '—'
            : balance.toLocaleString(undefined, { maximumFractionDigits: 2 })}{' '}
          FRG
        </div>
      </div>
      <button className="btn btn-ghost" onClick={() => disconnect()}>
        Disconnect
      </button>
    </div>
  );
}
