import WalletConnect from "@walletconnect/legacy-client";
import { QRCodeModal } from "./QRCodeModal.js";
export class WalletConnectV1 {
    constructor(sessionStorageKey, mobileAppDetails, connectOpts) {
        this.sessionStorageKey = sessionStorageKey;
        this.mobileAppDetails = mobileAppDetails;
        this.connectOpts = connectOpts;
        this.onDisconnectCbs = new Set();
    }
    /**
     * Returns the current session if it exists, else, creates a new session.
     */
    async connect() {
        // Get cached session in local storage
        const cachedSession = localStorage.getItem(this.sessionStorageKey);
        const session = cachedSession
            ? JSON.parse(cachedSession)
            : undefined;
        // Create a new WalletConnect instance
        const wc = new WalletConnect({
            ...this.connectOpts,
            qrcodeModal: new QRCodeModal(this.mobileAppDetails),
            session,
        });
        wc.on("disconnect", () => {
            localStorage.removeItem(this.sessionStorageKey);
            for (const cb of this.onDisconnectCbs) {
                cb();
            }
        });
        // If a previous session exists, return the WalletConnect instance
        if (session && wc.connected) {
            return wc;
        }
        // Else, if no previous session exists, create a new session
        if (wc.connected) {
            await wc.killSession();
        }
        await wc.createSession();
        // Return the WalletConnect instance once connected
        return new Promise((resolve, reject) => {
            wc.on("connect", (error, _payload) => {
                // Do NOT cache the session here as the user may not have approved the connection
                error ? reject(error) : resolve(wc);
            });
        });
    }
    onDisconnect(cb) {
        this.onDisconnectCbs.add(cb);
        return () => this.onDisconnectCbs.delete(cb);
    }
    /**
     * Saves the session to local storage. Should only be called once the user actually
     * approves the connection to the chain.
     */
    cacheSession(wc) {
        if (!wc.connected) {
            return;
        }
        localStorage.setItem(this.sessionStorageKey, JSON.stringify(wc.session));
    }
}