import { Secp256k1PubKey } from "cosmes/client";
import { WalletName } from "../../constants/WalletName.js";
import { WalletType } from "../../constants/WalletType.js";
import { onWindowEvent } from "../../utils/window.js";
import { WalletController } from "../WalletController.js";
import { WalletError } from "../WalletError.js";
import { OWalletExtension } from "./OWalletExtension.js";
export class OWalletController extends WalletController {
    constructor() {
        super(WalletName.OWALLET);
        this.registerAccountChangeHandlers();
    }
    async isInstalled(type) {
        return type === WalletType.EXTENSION ? "owallet" in window : false;
    }
    async connectWalletConnect(_chains) {
        // OWallet does not support WC yet
        throw new Error("WalletConnect not supported");
    }
    async connectExtension(chains) {
        const wallets = new Map();
        const ext = window.owallet;
        if (!ext) {
            throw new Error("OWallet extension is not installed");
        }
        await WalletError.wrap(ext.enable(chains.map(({ chainId }) => chainId)));
        for (const { chainId, rpc, gasPrice } of Object.values(chains)) {
            const { name, bech32Address, pubKey, isNanoLedger } = await WalletError.wrap(ext.getKey(chainId));
            const key = new Secp256k1PubKey({
                chainId,
                key: pubKey,
            });
            wallets.set(chainId, new OWalletExtension(this.id, name, ext, chainId, key, bech32Address, rpc, gasPrice, isNanoLedger));
        }
        return wallets;
    }
    registerAccountChangeHandlers() {
        /**
         * ! IMPORTANT !
         *
         * Since Keplr also uses the same event key, this causes issues when a user
         * has both Keplr and OWallet wallets connected simultaneously. For example,
         * a change in Keplr's keystore will trigger OWallet to emit this event as
         * well, leading to a race condition when `changeAccount` is called.
         *
         * The OWallet team has been notified to possibly change this event emitted
         * to `owallet_keystorechange` instead.
         */
        onWindowEvent("keplr_keystorechange", () => this.changeAccount(WalletType.EXTENSION));
    }
}