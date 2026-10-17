import { WalletType } from "../constants/WalletType.js";
/**
 * Controls initial connection to the wallet, and instantiates the
 * various `ConnectedWallet` instances.
 */
export class WalletController {
    constructor(id) {
        this.id = id;
        this.connectedWallets = new Map();
        this.onDisconnectCbs = new Set();
        this.onAccountChangeCbs = new Set();
        this.isWcOnDisconnectRegistered = false;
    }
    /**
     * Connects to the wallet and returns a map of `ConnectedWallet` instances.
     * The keys of the map are the chain IDs.
     */
    async connect(type, chains) {
        if (chains.length === 0) {
            return new Map();
        }
        let connectedWallets;
        if (type === WalletType.EXTENSION) {
            connectedWallets = await this.connectExtension(chains);
        }
        else {
            const { wallets, wc } = await this.connectWalletConnect(chains);
            if (!this.isWcOnDisconnectRegistered) {
                // On WalletConnect session disconnect, remove all WalletConnect wallets
                this.isWcOnDisconnectRegistered = true;
                wc.onDisconnect(() => {
                    this.disconnect(Array.from(this.connectedWallets.keys()).filter((id) => this.connectedWallets.get(id)?.type === WalletType.WALLETCONNECT));
                });
            }
            connectedWallets = wallets;
        }
        for (const [key, value] of connectedWallets) {
            this.connectedWallets.set(key, value);
        }
        return connectedWallets;
    }
    /**
     * Disconnects the wallet connected to the given `chainIds`.
     */
    disconnect(chainIds) {
        const callbackIds = chainIds.filter((id) => this.connectedWallets.has(id));
        if (callbackIds.length === 0) {
            return;
        }
        const disconnectedWallets = [];
        for (const id of callbackIds) {
            const wallet = this.connectedWallets.get(id);
            if (wallet) {
                disconnectedWallets.push(wallet);
                this.connectedWallets.delete(id);
            }
        }
        for (const cb of this.onDisconnectCbs) {
            cb(disconnectedWallets);
        }
    }
    /**
     * Should be called when any account changes are detected. This will disconnect
     * from all chains that were connected via the given `walletType`, and emit the
     * `onAccountChange` event.
     */
    changeAccount(walletType) {
        // Ignore if controller does not have any connected wallets
        if (this.connectedWallets.size === 0) {
            return;
        }
        // Find all wallets that were connected via the given `walletType`
        const wallets = [...this.connectedWallets.values()].filter((wallet) => wallet.type === walletType);
        // Disconnect from those chains
        const chainIds = wallets.map((wallet) => wallet.chainId);
        this.disconnect(chainIds);
        // Fire the account change callbacks
        for (const cb of this.onAccountChangeCbs) {
            cb(wallets);
        }
    }
    /**
     * Registers a callback that is called when the wallet is disconnected.
     * Returns an `unsubscribe` function that should be called after the
     * callback is no longer needed.
     *
     * ```ts
     * const unsubscribe = walletController.onDisconnect((wallets) => {
     *   // do something with the wallets that were disconnected
     *   console.log(wallets);
     *   // unsubscribe from this callback (if necessary)
     *   unsubsribe();
     * });
     * ```
     */
    onDisconnect(cb) {
        this.onDisconnectCbs.add(cb);
        return () => this.onDisconnectCbs.delete(cb);
    }
    /**
     * Registers a callback that is called when the wallet's account is changed after
     * the initial connection. When the account changes, the `onDisconnect` event
     * will also be fired before this `onAccountChange` event. Returns an `unsubscribe`
     * function that should be called after the callback is no longer needed.
     *
     * ```ts
     * const unsubscribe = walletController.onAccountChange((wallets) => {
     *   // do something with the wallets that were affected
     *   console.log(wallets);
     *   // unsubscribe from this callback (if necessary)
     *   unsubsribe();
     * });
     * ```
     */
    onAccountChange(cb) {
        this.onAccountChangeCbs.add(cb);
        return () => this.onAccountChangeCbs.delete(cb);
    }
}