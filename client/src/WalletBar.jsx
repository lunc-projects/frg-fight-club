import { useEffect, useState } from 'react';
import { MsgExecuteContract } from 'cosmes/client';
import { FRG_CONTRACT, TREASURY_ADDRESS, ENTRY_FEE_FRG, toMicro } from './config.js';
import { getFrgBalance } from './chain.js';
import {
  WALLET_DEFS,
  connectWallet,
  disconnectWallet,
  useConnectedWallet,
} from './wallet.js';
import { setLuncDashUriHandler } from './cosmes-extra.js';

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
  const [luncUri, setLuncUri] = useState(null);
  const [copied, setCopied] = useState(false);

  useEffect(() => setLuncDashUriHandler((uri) => setLuncUri(uri)), []);

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
    setCopied(false);
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
            {WALLET_DEFS.map((def) => (
              <div className="wallet-option-wrap" key={def.id}>
                <button
                  className="btn btn-wallet-option"
                  disabled={!!busyId}
                  onClick={() => onConnect(def.id)}
                >
                  <span className="wo-label">{def.label}</span>
                  <span className="wo-hint">
                    {busyId === def.id ? 'Connecting — check your wallet app…' : def.hint}
                  </span>
                </button>
                {def.id === 'luncdash' && luncUri && (
                  <>
                    <a
                      className="btn btn-wallet wo-copy"
                      href={`luncdash://wallet_connect?${encodeURIComponent(`payload=${encodeURIComponent(luncUri)}`)}`}
                    >
                      🚀 Open LUNC Dash app
                    </a>
                    <button
                      className="btn btn-ghost wo-copy"
                      onClick={async () => {
                        try {
                          await navigator.clipboard.writeText(luncUri);
                          setCopied(true);
                        } catch {}
                      }}
                    >
                      {copied ? '✓ Copied — now paste it in the LUNC Dash app' : '📋 Copy pairing link — paste it in the LUNC Dash app'}
                    </button>
                    <input className="wo-uri" readOnly value={luncUri} onFocus={(e) => e.target.select()} />
                  </>
                )}
              </div>
            ))}
            {err && <div className="wo-error">{err}</div>}
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
