import { useEffect, useState } from 'react';
import { useWallet, useConnectedWallet, WalletStatus } from '@terra-money/wallet-kit';
import { CHAIN_ID } from './config.js';
import { getFrgBalance } from './chain.js';

export function usePlayer() {
  const connectedWallet = useConnectedWallet();
  const address =
    connectedWallet?.addresses?.[CHAIN_ID] ||
    (connectedWallet?.addresses
      ? Object.values(connectedWallet.addresses)[0]
      : undefined);
  return { connectedWallet, address };
}

export default function WalletBar({ balance, setBalance }) {
  const { status, availableWallets, connect, disconnect } = useWallet();
  const { address } = usePlayer();
  const [busy, setBusy] = useState(false);

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

  if (status === WalletStatus.INITIALIZING) {
    return <div className="walletbar">Loading wallets…</div>;
  }

  if (status !== WalletStatus.WALLET_CONNECTED || !address) {
    return (
      <div className="walletbar">
        <div className="walletbar-label">Connect a wallet to play</div>
        <div className="wallet-buttons">
          {availableWallets.map((w) => (
            <button
              key={w.id}
              className="btn btn-wallet"
              disabled={busy}
              onClick={async () => {
                setBusy(true);
                try {
                  await connect(w.id);
                } finally {
                  setBusy(false);
                }
              }}
            >
              {w.icon && <img src={w.icon} alt="" width="18" height="18" />}
              {w.name}
              {w.isInstalled === false ? ' (install)' : ''}
            </button>
          ))}
        </div>
        <div className="walletbar-hint">
          On mobile, open this page inside your wallet app's browser
          (Station, Keplr or LuncDash) — Telegram's built-in browser can't
          connect a wallet. On desktop, use the Station extension.
        </div>
      </div>
    );
  }

  return (
    <div className="walletbar connected">
      <div>
        <div className="addr">
          {address.slice(0, 10)}…{address.slice(-6)}
        </div>
        <div className="bal">
          {balance === null ? '—' : balance.toLocaleString(undefined, {
            maximumFractionDigits: 2,
          })}{' '}
          FRG
        </div>
      </div>
      <button className="btn btn-ghost" onClick={() => disconnect()}>
        Disconnect
      </button>
    </div>
  );
}
