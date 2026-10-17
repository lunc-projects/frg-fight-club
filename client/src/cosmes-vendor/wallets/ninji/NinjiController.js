import { Secp256k1PubKey } from "cosmes/client";
import { WalletName } from "../../constants/WalletName.js";
import { WalletType } from "../../constants/WalletType.js";
import { WalletController } from "../WalletController.js";
import { WalletError } from "../WalletError.js";
import { NinjiExtension } from "./NinjiExtension.js";
export class NinjiController extends WalletController {
    constructor() {
        super(WalletName.NINJI);
        this.registerAccountChangeHandlers();
    }
    async isInstalled(type) {
        return type === WalletType.EXTENSION ? "ninji" in window : false;
    }
    async connectWalletConnect(_chains) {
        // Ninji does not support WC yet
        throw new Error("WalletConnect not supported");
    }
    async connectExtension(chains) {
        const wallets = new Map();
        const ext = window.ninji;
        if (!ext) {
            throw new Error("Ninji extension is not installed");
        }
        await WalletError.wrap(ext.enable(chains.map(({ chainId }) => chainId)));
        for (const { chainId, rpc, gasPrice } of Object.values(chains)) {
            const { name, bech32Address, pubKey, isNanoLedger } = await WalletError.wrap(ext.getKey(chainId));
            const key = new Secp256k1PubKey({
                chainId,
                key: pubKey,
            });
            wallets.set(chainId, new NinjiExtension(this.id, name, ext, chainId, key, bech32Address, rpc, gasPrice, isNanoLedger));
        }
        return wallets;
    }
    registerAccountChangeHandlers() {
        /**
         * ! IMPORTANT !
         *
         * Since Leap also uses the same event key, this causes issues when a user
         * has both leap and ninji wallets connected simultaneously. For example,
         * a change in Leap's keystore will trigger Ninji to emit this event as
         * well, leading to a race condition when `changeAccount` is called.
         *
         * The Ninji team has been notified to possibly change this event emitted
         * to `accountsChanged` instead.
         */
        if (typeof window !== "undefined" && window.ninji) {
            window.ninji.on("accountsChanged", () => this.changeAccount(WalletType.EXTENSION));
        }
    }
}