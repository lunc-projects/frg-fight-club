/**
 * Custom error class which wraps around an error thrown by a wallet.
 */
export class WalletError extends Error {
    constructor(message, raw) {
        super(message);
        this.name = "WalletError";
        this.raw = raw;
    }
    /**
     * Returns the result of the `promise` if it resolves successfully, normalising
     * any errors thrown into a `WalletError` instance.
     *
     * It is best to wrap all wallet API calls with this function as some wallets
     * throw other data types other than actual `Error` instances.
     */
    static async wrap(promise) {
        try {
            return await promise;
        }
        catch (err) {
            if (typeof err === "string") {
                throw new WalletError(err, err);
            }
            if (this.isRecord(err)) {
                // Takes into account normal error instances and objects with the 'error' key
                throw new WalletError(err.message ?? err.error ?? "unknown error", err);
            }
            throw new WalletError("unknown error", err);
        }
    }
    static isRecord(value) {
        return typeof value === "object" && value != null;
    }
}