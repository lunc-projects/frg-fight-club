import React from 'react';
import { createRoot } from 'react-dom/client';
import { WalletProvider } from '@terra-money/wallet-kit';
import App from './App.jsx';
import './styles.css';

// Networks the wallet modal offers. Terra Classic (columbus-5) is the game
// chain; phoenix-1 (Terra 2.0) is included so Station doesn't complain when
// a user has it selected — the game itself only uses columbus-5.
const defaultNetworks = {
  'columbus-5': {
    chainID: 'columbus-5',
    lcd: 'https://terra-classic-lcd.publicnode.com',
    gasAdjustment: 1.75,
    gasPrices: { uluna: 28.325 },
    prefix: 'terra',
  },
  'phoenix-1': {
    chainID: 'phoenix-1',
    lcd: 'https://phoenix-lcd.terra.dev',
    gasAdjustment: 1.75,
    gasPrices: { uluna: 0.15 },
    prefix: 'terra',
  },
};

// Telegram Mini App: tell Telegram we're ready and use the full height.
if (window.Telegram?.WebApp) {
  window.Telegram.WebApp.ready();
  window.Telegram.WebApp.expand();
}

createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <WalletProvider defaultNetworks={defaultNetworks}>
      <App />
    </WalletProvider>
  </React.StrictMode>
);
