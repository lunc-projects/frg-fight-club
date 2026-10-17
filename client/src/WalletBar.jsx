import { useEffect, useState } from 'react';
import { useChain } from '@cosmos-kit/react';
import { CHAIN_NAME } from './chainDef.js';
import { FRG_CONTRACT, TREASURY_ADDRESS, ENTRY_FEE_FRG, toMicro } from './config.js';
import { getFrgBalance } from './chain.js';

/**
 * Player wallet access via Cosmos Kit.
 * Returns the connected address and a payEntry() that signs the FRG
 * entry-fee transfer with whatever wallet the player connected
 * (Keplr extension / Keplr mobile / Station) and returns the txhash.
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

export default function WalletBar({ balance, setBalance }) {
  const { status, address, connect, disconnect, username } = useChain(CHAIN_NAME);
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

  if (!address) {
    return (
      <div className="walletbar">
        <div className="walletbar-label">Connect a wallet to play</div>
        <div className="wallet-buttons">
          <button
            className="btn btn-wallet"
            disabled={busy || status === 'Connecting'}
            onClick={async () => {
              setBusy(true);
              try {
                await connect();
              } catch {
                // user closed the modal or rejected — stay in lobby
              } finally {
                setBusy(false);
              }
            }}
          >
            🔗 {status === 'Connecting' ? 'Connecting…' : 'Connect Wallet'}
          </button>
        </div>
        <div className="walletbar-hint">
          Keplr or Station — pick your wallet in the list. Inside the Keplr
          app browser it connects directly; from Telegram, choose Keplr
          Mobile.
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
