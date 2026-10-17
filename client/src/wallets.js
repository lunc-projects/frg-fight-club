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
    encoding: 'base64',
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
  new GenericWCWallet(keplrMobileInfo),
  new GenericWCWallet(galaxyStationInfo),
  new GenericWCWallet(luncDashInfo),
];
