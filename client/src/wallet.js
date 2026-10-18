import { useEffect, useReducer } from 'react';
import { WalletType } from './cosmes-vendor/index.js';
import {
  GalaxyStationController,
  KeplrHttpsController,
} from './cosmes-extra.js';
import { WC_PROJECT_ID } from './config.js';

// Wallet layer: cosmes — the same Terra-native wallet kit luncback.com
// runs. One controller per wallet; each knows how to reach its app
// (extension injection in wallet browsers, WalletConnect v2 with app
// links for Keplr/Galaxy/Cosmostation, the legacy Terra bridge for
// Station and LUNC Dash).

// iOS leaves wallet apps with no back arrow after an approval, so the
// UI shows iPhone players the way home before they leave (their game
// session and any in-flight payment persist and resume on return).
export const IS_IOS =
  /iphone|ipad|ipod/i.test(
    typeof navigator !== 'undefined' ? navigator.userAgent || '' : ''
  ) ||
  (typeof window !== 'undefined' &&
    window.Telegram?.WebApp?.platform === 'ios');

// iPhone INSIDE Telegram specifically: Galaxy Station cannot be
// reached from there at all (web link opens its empty website; the
// app-scheme link is swallowed even when tapped — both tested
// 2026-10-17). In Safari the same links behave, so the picker only
// changes inside Telegram.
export const IN_TG_IOS =
  IS_IOS &&
  typeof window !== 'undefined' &&
  window.Telegram?.WebApp?.platform === 'ios';

export const CHAIN_INFO = {
  chainId: 'columbus-5',
  rpc: 'https://terra-classic-rpc.publicnode.com',
  gasPrice: { amount: '28.325', denom: 'uluna' },
};

export const WALLET_DEFS = [
  { id: 'galaxystation', label: 'Galaxy Station 📱', hint: '⭐ auto-connects inside Telegram — tap and approve in the app' },
  { id: 'keplr', label: 'Keplr', hint: 'Keplr app browser, extension, or paste the pairing link in the Keplr app' },
];

export const CONTROLLERS = {
  galaxystation: new GalaxyStationController(WC_PROJECT_ID),
  keplr: new KeplrHttpsController(WC_PROJECT_ID),
};

// Minimal shared store for the connected wallet (replaces the old
// Cosmos Kit context). Shape: { walletId, wallet } | null.
let current = null;
const listeners = new Set();

export function setCurrentWallet(v) {
  current = v;
  listeners.forEach((f) => f());
}

export function useConnectedWallet() {
  const [, force] = useReducer((x) => x + 1, 0);
  useEffect(() => {
    listeners.add(force);
    return () => listeners.delete(force);
  }, []);
  return current;
}

export async function connectWallet(walletId) {
  const controller = CONTROLLERS[walletId];
  if (!controller) throw new Error(`Unknown wallet: ${walletId}`);
  let type = WalletType.WALLETCONNECT;
  try {
    if (await controller.isInstalled(WalletType.EXTENSION)) {
      type = WalletType.EXTENSION;
    }
  } catch {
    // fall through to WalletConnect
  }
  const res = await controller.connect(type, [CHAIN_INFO]);
  const wallet = res.get(CHAIN_INFO.chainId);
  if (!wallet) throw new Error('That wallet did not return a Terra Classic account.');
  const entry = { walletId, wallet };
  setCurrentWallet(entry);
  return entry;
}

export function disconnectWallet() {
  if (!current) return;
  try {
    CONTROLLERS[current.walletId].disconnect([CHAIN_INFO.chainId]);
  } catch {
    // best effort — local state clears regardless
  }
  setCurrentWallet(null);
}
