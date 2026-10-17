import './polyfills.js';
import React from 'react';
import { createRoot } from 'react-dom/client';
import App from './App.jsx';
import './styles.css';

// Wallet connect is cosmes (the Terra-native kit luncback.com runs):
// Keplr, Terra Station, Galaxy Station, LUNC Dash, Cosmostation —
// see src/wallet.js and src/cosmes-extra.js.

// Telegram Mini App: tell Telegram we're ready and use the full height.
if (window.Telegram?.WebApp) {
  window.Telegram.WebApp.ready();
  window.Telegram.WebApp.expand();
}

createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
