import { useEffect, useState } from 'react';
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
  { id: 'keplr-mobile', label: 'Keplr Mobile 📱', hint: 'Opens the Keplr app to approve' },
  { id: 'galaxy-station', label: 'Galaxy Station 📱', hint: 'Opens the Galaxy Station app to approve' },
  { id: 'luncdash', label: 'LuncDash 📱', hint: 'Opens the LuncDash app to approve' },
];

function WalletOption({ opt, onDone }) {
  const w = useChainWallet(CHAIN_NAME, opt.id);
  const connecting = w.status === 'Connecting';
  const notExist = w.isWalletNotExist || w.status === 'NotExist';
  const [copied, setCopied] = useState(false);
  // WalletConnect pairing URI, present while a mobile-wallet connect is
  // pending. Apps with official deep links (Keplr) open automatically;
  // Galaxy Station / LuncDash are not in WalletConnect's registry, so
  // their users paste this link into the app's WalletConnect screen.
  const pairingUri = w.qrUrl?.data || null;
  return (
    <div className="wallet-option-wrap">
      <button
        className="btn btn-wallet-option"
        disabled={connecting}
        onClick={async () => {
          try {
            await w.connect();
            onDone?.();
          } catch {
            // rejected or app didn't answer — stay on the picker
          }
        }}
      >
        <span className="wo-label">{opt.label}</span>
        <span className="wo-hint">
          {connecting ? 'Connecting — check your wallet app…' : notExist ? 'Not found in this browser — use the app option or open the game inside the wallet app' : opt.hint}
        </span>
      </button>
      {connecting && pairingUri && (
        <button
          className="btn btn-ghost wo-copy"
          onClick={async () => {
            try {
              await navigator.clipboard.writeText(pairingUri);
              setCopied(true);
            } catch {}
          }}
        >
          {copied ? '✓ Copied — paste it in your wallet app' : '📋 Copy pairing link (for Galaxy / LuncDash: paste in the app’s WalletConnect screen)'}
        </button>
      )}
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
          From Telegram or a normal browser, tap your wallet's app option —
          it opens the app to approve, then brings you back. Inside the
          Keplr or Station app browser, the plain Keplr / Station options
          connect directly.
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
