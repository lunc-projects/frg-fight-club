import { WCWallet, ChainWC, WCClient } from '@cosmos-kit/walletconnect';

// Generic WalletConnect wallets for Terra-ecosystem mobile apps that have
// no browser extension (the owner asked for Galaxy Station and LuncDash).
// These mirror how @cosmos-kit/keplr-mobile is built, but use the standard
// Cosmos WalletConnect namespaces (cosmos_signDirect / cosmos_signAmino).
// Deep links: when walletconnect.projectId holds the wallet's WalletConnect
// explorer listing id, the WC client fetches the app's official mobile
// links from the explorer and opens the app automatically on connect.
// The explorer ids below are filled from the explorer API; if a lookup
// fails the connect still creates a pairing the apps can scan/paste.

class GenericWCWallet extends WCWallet {
  constructor(walletInfo) {
    super(walletInfo, ChainWC, WCClient);
  }
}

// Keplr's WalletConnect listing forces a native app scheme
// (keplrwallet://) that crashes Telegram's webview. This client keeps
// the listing (needed for the client to resolve app links at all) but
// suppresses the native URL, so the handoff always uses Keplr's HTTPS
// universal link instead.
class HttpsOnlyWCClient extends WCClient {
  get nativeUrl() {
    return undefined;
  }
}

class KeplrMobileWallet extends WCWallet {
  constructor(walletInfo) {
    super(walletInfo, ChainWC, HttpsOnlyWCClient);
  }
}

const base = {
  mode: 'wallet-connect',
  mobileDisabled: false,
  rejectMessage: { source: 'Request rejected' },
  supportedChains: ['terraclassic'],
};

export const keplrMobileInfo = {
  ...base,
  name: 'keplr-mobile',
  prettyName: 'Keplr Mobile',
  walletconnect: {
    name: 'Keplr',
    projectId: '6adb6082c909901b9e7189af3a4a0223102cd6f8d5c39e39f3d49acb92b578bb',
    encoding: 'base64',
    // Auto-open via Keplr's HTTPS universal link. Deliberately NO native
    // scheme here: keplrwallet:// crashes Telegram's webview
    // (ERR_UNKNOWN_URL_SCHEME); the https deeplink hands off cleanly.
    mobile: { universal: 'https://deeplink.keplr.app/' },
    requiredNamespaces: {
      methods: ['cosmos_signDirect', 'cosmos_signAmino', 'cosmos_getAccounts'],
      events: [],
    },
  },
};

export const galaxyStationInfo = {
  ...base,
  name: 'galaxy-station',
  prettyName: 'Galaxy Station',
  walletconnect: {
    name: 'Galaxy Station',
    encoding: 'hex',
    requiredNamespaces: {
      methods: ['cosmos_signDirect', 'cosmos_signAmino'],
      events: [],
    },
  },
};

export const luncDashInfo = {
  ...base,
  name: 'luncdash',
  prettyName: 'LuncDash',
  walletconnect: {
    name: 'LuncDash',
    encoding: 'hex',
    requiredNamespaces: {
      methods: ['cosmos_signDirect', 'cosmos_signAmino'],
      events: [],
    },
  },
};

export const extraWallets = [
  new KeplrMobileWallet(keplrMobileInfo),
  new GenericWCWallet(galaxyStationInfo),
  new GenericWCWallet(luncDashInfo),
];
