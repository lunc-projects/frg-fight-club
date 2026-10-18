import { useEffect, useState } from 'react';
import { MsgExecuteContract } from 'cosmes/client';
import { FRG_CONTRACT, TREASURY_ADDRESS, ENTRY_FEE_FRG, toMicro } from './config.js';
import { getFrgBalance } from './chain.js';
import {
  WALLET_DEFS,
  IS_IOS,
  IN_TG_IOS,
  connectWallet,
  disconnectWallet,
  useConnectedWallet,
} from './wallet.js';

/**
 * Player wallet access (cosmes).
 * Returns the connected address and a payEntry() that signs the FRG
 * entry-fee transfer with the connected wallet and returns the txhash.
 */
export function usePlayer() {
  const current = useConnectedWallet();
  const address = current?.wallet.address;

  const payEntry = async () => {
    if (!current) throw new Error('Connect your wallet first.');
    const wallet = current.wallet;
    const tx = {
      msgs: [
        new MsgExecuteContract({
          sender: wallet.address,
          contract: FRG_CONTRACT,
          msg: {
            transfer: { recipient: TREASURY_ADDRESS, amount: toMicro(ENTRY_FEE_FRG) },
          },
          funds: [],
        }),
      ],
    };
    const fee = await wallet.estimateFee(tx);
    return wallet.broadcastTx(tx, fee);
  };

  return { address, payEntry };
}

export default function WalletBar({ balance, setBalance }) {
  const current = useConnectedWallet();
  const address = current?.wallet.address;
  const [open, setOpen] = useState(false);
  const [busyId, setBusyId] = useState('');
  const [err, setErr] = useState('');
  const [keplrUri, setKeplrUri] = useState(null);
  const [copiedK, setCopiedK] = useState(false);
  const [galaxyUri, setGalaxyUri] = useState(null);
  const [copiedG, setCopiedG] = useState(false);

  useEffect(() => {
    // cosmes' WC modal hands Keplr pairing URIs here (see QRCodeModal patch)
    window.__frgInterceptUri = (uri) => setKeplrUri(uri);
    // ...and Galaxy-on-iOS pairing URIs here (scheme-button + copy UI)
    window.__frgGalaxyUri = (uri) => setGalaxyUri(uri);
    return () => {
      delete window.__frgInterceptUri;
      delete window.__frgGalaxyUri;
    };
  }, []);

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

  const onConnect = async (id) => {
    setBusyId(id);
    setErr('');
    setCopiedK(false);
    if (id === 'keplr') setKeplrUri(null);
    if (id === 'galaxystation') {
      setGalaxyUri(null);
      setCopiedG(false);
    }
    try {
      await connectWallet(id);
      setOpen(false);
    } catch (e) {
      setErr(e?.message ? String(e.message).slice(0, 180) : 'Connection failed.');
    } finally {
      setBusyId('');
    }
  };

  if (!address) {
    // Inside Telegram on iPhone, Keplr is the route that works, so it
    // goes first; everywhere else Galaxy keeps its proven top spot.
    const defs = IN_TG_IOS
      ? [...WALLET_DEFS].sort((a) => (a.id === 'keplr' ? -1 : 1))
      : WALLET_DEFS;
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
            {defs.map((def) => (
              <div className="wallet-option-wrap" key={def.id}>
                <button
                  className="btn btn-wallet-option"
                  disabled={!!busyId}
                  onClick={() => onConnect(def.id)}
                >
                  <span className="wo-label">{def.label}</span>
                  <span className="wo-hint">
                    {busyId === def.id
                      ? 'Connecting — check your wallet app…'
                      : def.id === 'galaxystation' && IN_TG_IOS
                        ? "⛔ Can't open from Telegram on iPhone — use Keplr, or open the game in Safari"
                        : def.id === 'galaxystation' && IS_IOS
                          ? 'iPhone: tap, then hit the 🚀 Open Galaxy Station app button that appears below'
                          : def.hint}
                  </span>
                </button>
                {def.id === 'galaxystation' && galaxyUri && IN_TG_IOS && (
                  <>
                    <div className="wo-ios-note">
                      ⛔ Galaxy's app can't be opened from Telegram on
                      iPhone (tested — the link is swallowed). If Galaxy
                      Station lets you paste a WalletConnect link, it's
                      below; otherwise use <b>Keplr</b> above, or open{' '}
                      <b>frg-fight-club.vercel.app</b> in Safari, where
                      Galaxy opens normally.
                    </div>
                    <button
                      className="btn btn-ghost wo-copy"
                      onClick={async () => {
                        try {
                          await navigator.clipboard.writeText(galaxyUri);
                          setCopiedG(true);
                        } catch {}
                      }}
                    >
                      {copiedG ? '✓ Copied' : '📋 Copy the pairing link'}
                    </button>
                    <input className="wo-uri" readOnly value={galaxyUri} onFocus={(e) => e.target.select()} />
                  </>
                )}
                {def.id === 'galaxystation' && galaxyUri && !IN_TG_IOS && (
                  <>
                    <a
                      className="btn btn-wallet-option wo-open-app"
                      href={`galaxystation://wcV2?${encodeURIComponent(galaxyUri)}`}
                    >
                      <span className="wo-label">🚀 Open Galaxy Station app</span>
                      <span className="wo-hint">Tap to jump to the app and approve</span>
                    </a>
                    <button
                      className="btn btn-ghost wo-copy"
                      onClick={async () => {
                        try {
                          await navigator.clipboard.writeText(galaxyUri);
                          setCopiedG(true);
                        } catch {}
                      }}
                    >
                      {copiedG ? '✓ Copied — paste it in Galaxy Station’s WalletConnect screen' : '📋 Or copy the pairing link and paste it in Galaxy Station'}
                    </button>
                    <input className="wo-uri" readOnly value={galaxyUri} onFocus={(e) => e.target.select()} />
                  </>
                )}
                {def.id === 'keplr' && keplrUri && (
                  <>
                    <button
                      className="btn btn-ghost wo-copy"
                      onClick={async () => {
                        try {
                          await navigator.clipboard.writeText(keplrUri);
                          setCopiedK(true);
                        } catch {}
                      }}
                    >
                      {copiedK ? '✓ Copied — now paste it in the Keplr app' : '📋 Copy pairing link — paste it in the Keplr app’s WalletConnect screen'}
                    </button>
                    <input className="wo-uri" readOnly value={keplrUri} onFocus={(e) => e.target.select()} />
                  </>
                )}
              </div>
            ))}
            {err && <div className="wo-error">{err}</div>}
            {IS_IOS && IN_TG_IOS && (
              <div className="wo-ios-note">
                🍎 <b>iPhone in Telegram:</b> use <b>Keplr</b> — tap it,
                copy the pairing link, and paste it in the Keplr app's
                WalletConnect screen. Galaxy Station can't be opened
                from here (Apple/Telegram block the handoff — tested),
                but Galaxy works if you open{' '}
                <b>frg-fight-club.vercel.app</b> in Safari instead.
                After approving in the wallet, swipe back to Telegram —
                your session reconnects by itself.
              </div>
            )}
            {IS_IOS && !IN_TG_IOS && (
              <div className="wo-ios-note">
                🍎 <b>iPhone:</b> tap Galaxy Station, then the{' '}
                <b>🚀 Open Galaxy Station app</b> button that appears —
                that's what carries you to the real app (the plain web
                link only opens Galaxy's empty website). If the app
                still doesn't open, Keplr below with its copy-paste
                pairing link is the fallback that always works. After
                approving in any wallet, swipe back to Telegram — your
                session reconnects by itself.
              </div>
            )}
            <button className="btn btn-ghost" onClick={() => setOpen(false)}>
              Cancel
            </button>
          </div>
        )}
        <div className="walletbar-hint">
          Inside a wallet app's browser, pick that wallet — it connects
          directly. From Telegram or a normal browser, pick your wallet and
          approve in its app when it opens.
        </div>
      </div>
    );
  }

  return (
    <div className="walletbar connected">
      <div>
        <div className="addr">
          {address.slice(0, 10)}…{address.slice(-6)}
          {current.wallet.label ? ` · ${current.wallet.label}` : ''}
        </div>
        <div className="bal">
          {balance === null
            ? '—'
            : balance.toLocaleString(undefined, { maximumFractionDigits: 2 })}{' '}
          FRG
        </div>
      </div>
      <button className="btn btn-ghost" onClick={() => disconnectWallet()}>
        Disconnect
      </button>
    </div>
  );
}
