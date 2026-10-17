import './polyfills.js';
import React from 'react';
import { createRoot } from 'react-dom/client';
import { ChainProvider } from '@cosmos-kit/react';
import { wallets as keplrWallets } from '@cosmos-kit/keplr';
import { wallets as stationWallets } from '@cosmos-kit/station';
import { GasPrice } from '@cosmjs/stargate';
import { terraClassicChain, terraClassicAssets } from './chainDef.js';
import App from './App.jsx';
import './styles.css';

// Wallet connect is Cosmos Kit: Keplr (extension + mobile), Station.
// This replaces @terra-money/wallet-kit, which only ever talked to the
// Station extension and left Keplr users with a dead connect button.
const gasPrice = () => ({ gasPrice: GasPrice.fromString('28.325uluna') });

// Telegram Mini App: tell Telegram we're ready and use the full height.
if (window.Telegram?.WebApp) {
  window.Telegram.WebApp.ready();
  window.Telegram.WebApp.expand();
}

createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <ChainProvider
      chains={[terraClassicChain]}
      assetLists={[terraClassicAssets]}
      wallets={[...keplrWallets, ...stationWallets]}
      signerOptions={{ signingStargate: gasPrice, signingCosmwasm: gasPrice }}
    >
      <App />
    </ChainProvider>
  </React.StrictMode>
);
