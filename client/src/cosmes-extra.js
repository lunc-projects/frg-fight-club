// Galaxy Station + LUNC Dash controllers, built on cosmes internals.
//
// The published cosmes package (what luncback.com's wallet layer is based
// on) ships controllers for Keplr / Station / Cosmostation, but not for
// Galaxy Station or LUNC Dash — luncback's build adds its own. These two
// mirror theirs, using cosmes' own WalletConnect clients via deep imports
// (the package's public exports don't expose the WC client classes).
//
// Galaxy Station speaks WalletConnect v2 with Keplr-style methods and has
// a real app link (station.hexxagon.io). LUNC Dash does NOT speak WC v2 —
// it uses the legacy Terra bridge protocol at walletconnect.luncdash.com,
// same as Station's bridge flow.

import { Secp256k1PubKey, getAccount, toBaseAccount } from 'cosmes/client';
import { base64 } from 'cosmes/codec';
import { CosmosCryptoSecp256k1PubKey } from 'cosmes/protobufs';
import { WalletController, WalletError, WalletType } from './cosmes-vendor/index.js';
import { KeplrController } from './cosmes-vendor/index.js';
import WalletConnect from '@walletconnect/legacy-client';
import { WalletConnectV2 } from './cosmes-vendor/walletconnect/WalletConnectV2.js';
import { WalletConnectV1 } from './cosmes-vendor/walletconnect/WalletConnectV1.js';
import { KeplrExtension } from './cosmes-vendor/wallets/keplr/KeplrExtension.js';
import { KeplrWalletConnectV2 } from './cosmes-vendor/wallets/keplr/KeplrWalletConnectV2.js';
import { StationWalletConnectV1 } from './cosmes-vendor/wallets/station/StationWalletConnectV1.js';

/* ---------------- Keplr (HTTPS app-link variant) ---------------- */

// Stock cosmes Keplr hands off on Android via an intent:// URL, which
// Telegram's webview refuses to load (ERR_UNKNOWN_URL_SCHEME — the user
// hit the same crash as the old keplrwallet:// flow). Galaxy Station
// works in Telegram because its link is HTTPS. Keplr has a verified
// HTTPS app-link domain too (deeplink.keplr.app), so swap the WC
// client's link set for the Galaxy-style construction.
export class KeplrHttpsController extends KeplrController {
  constructor(wcProjectId) {
    super(wcProjectId);
    this.wc = new WalletConnectV2(wcProjectId, {
      name: 'Keplr',
      android:
        'intent://wcV2#Intent;package=com.chainapsis.keplr;scheme=keplrwallet;end;',
      ios: 'keplrwallet://wcV2',
    });
  }
}

/* ---------------- Galaxy Station ---------------- */

const GALAXY_LINKS = {
  name: 'Galaxy Station',
  android:
    'https://station.hexxagon.io/wcV2#Intent;package=io.hexxagon.station;scheme=galaxystation;end;',
  // iOS gets the app's native scheme, NOT the HTTPS link: inside
  // Telegram's iOS webview the HTTPS link just loads Galaxy's web
  // dashboard in place (empty web wallet, no way back — observed
  // 2026-10-17). The scheme is the only route that can reach the app.
  ios: 'galaxystation://wcV2',
};

export class GalaxyStationController extends WalletController {
  constructor(wcProjectId) {
    super('galaxystation');
    this.wc = new WalletConnectV2(wcProjectId, GALAXY_LINKS);
    this.wc.onAccountChange(() => this.changeAccount(WalletType.WALLETCONNECT));
  }

  async isInstalled(type) {
    return type === WalletType.EXTENSION ? 'galaxyStation' in window : true;
  }

  async connectWalletConnect(chains) {
    const wallets = new Map();
    await WalletError.wrap(this.wc.connect(chains.map(({ chainId }) => chainId)));
    for (const { chainId, rpc, gasPrice } of chains) {
      const { name, pubkey, address } = await WalletError.wrap(this.wc.getAccount(chainId));
      const key = new Secp256k1PubKey({ key: base64.decode(pubkey), chainId });
      wallets.set(
        chainId,
        new KeplrWalletConnectV2(this.id, name, this.wc, chainId, key, address, rpc, gasPrice, true)
      );
    }
    return { wallets, wc: this.wc };
  }

  async connectExtension(chains) {
    const wallets = new Map();
    const ext = window.galaxyStation?.keplr;
    if (!ext) throw new Error('Galaxy Station extension is not installed');
    await WalletError.wrap(ext.enable(chains.map(({ chainId }) => chainId)));
    for (const { chainId, rpc, gasPrice } of chains) {
      const { name, bech32Address, pubKey, isNanoLedger } = await WalletError.wrap(ext.getKey(chainId));
      const key = new Secp256k1PubKey({ key: pubKey, chainId });
      wallets.set(
        chainId,
        new KeplrExtension(this.id, name, ext, chainId, key, bech32Address, rpc, gasPrice, isNanoLedger)
      );
    }
    return wallets;
  }

  disconnect(chainIds) {
    super.disconnect(chainIds);
    if (this.connectedWallets.size === 0) this.wc.disconnect?.();
  }
}

/* ---------------- LUNC Dash ---------------- */

// The legacy WalletConnect client wants a QR modal object. Instead of
// cosmes' modal (which would try to redirect this webview to a raw wc:
// scheme and crash Telegram), hand the pairing URI to the game's own UI,
// which shows it as a copyable link — same pattern as the other wallets.
let luncDashUriHandler = null;
export function setLuncDashUriHandler(fn) {
  luncDashUriHandler = fn;
}

class InlineUriModal {
  open(uri) {
    luncDashUriHandler?.(uri);
  }
  close() {
    luncDashUriHandler?.(null);
  }
}

class LuncDashWalletConnectV1 extends WalletConnectV1 {
  async connect() {
    const cachedSession = localStorage.getItem(this.sessionStorageKey);
    const session = cachedSession ? JSON.parse(cachedSession) : undefined;
    const wc = new WalletConnect({
      ...this.connectOpts,
      qrcodeModal: new InlineUriModal(),
      session,
    });
    wc.on('disconnect', () => {
      localStorage.removeItem(this.sessionStorageKey);
      for (const cb of this.onDisconnectCbs) cb();
    });
    if (session && wc.connected) return wc;
    if (wc.connected) await wc.killSession();
    await wc.createSession();
    return new Promise((resolve, reject) => {
      wc.on('connect', (error) => (error ? reject(error) : resolve(wc)));
    });
  }
}

class LuncDashConnectedWallet extends StationWalletConnectV1 {
  constructor(...args) {
    super(...args);
    this.id = 'luncdash';
  }
}

export class LuncDashController extends WalletController {
  constructor() {
    super('luncdash');
    this.wc = new LuncDashWalletConnectV1(
      'cosmes.wallet.luncdash.wcSession',
      { name: 'LUNC Dash', android: '', ios: '', isStation: true },
      { bridge: 'https://walletconnect.luncdash.com', signingMethods: [] }
    );
  }

  async isInstalled(type) {
    // LUNC Dash has no browser extension — WalletConnect (bridge) only.
    return type === WalletType.WALLETCONNECT;
  }

  async connectExtension() {
    throw new Error('LUNC Dash has no browser extension — use WalletConnect.');
  }

  async connectWalletConnect(chains) {
    const wallets = new Map();
    const wc = await WalletError.wrap(this.wc.connect());
    const address = wc.accounts[0];
    for (const { chainId, rpc, gasPrice } of chains) {
      try {
        const key = await WalletError.wrap(this.getPubKey(chainId, rpc, address));
        wallets.set(chainId, new LuncDashConnectedWallet(undefined, wc, chainId, key, address, rpc, gasPrice));
      } catch (err) {
        console.warn(err);
      }
    }
    this.wc.cacheSession(wc);
    return { wallets, wc: this.wc };
  }

  async getPubKey(chainId, rpc, address) {
    const account = await getAccount(rpc, { address });
    const { pubKey } = toBaseAccount(account);
    if (!pubKey) throw new Error('Unable to get pub key');
    return new Secp256k1PubKey({
      chainId,
      key: CosmosCryptoSecp256k1PubKey.fromBinary(pubKey.value).key,
    });
  }
}
