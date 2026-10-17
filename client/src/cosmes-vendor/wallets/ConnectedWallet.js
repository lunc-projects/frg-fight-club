import { Tx, calculateFee, getAccount, pollTx, simulateTx, toBaseAccount, } from "cosmes/client";
import { CosmosBaseV1beta1Coin as Coin, } from "cosmes/protobufs";
import { extractExpectedAccountSequence } from "../utils/sequence.js";
/**
 * Represents a connected wallet that is ready to sign transactions.
 * Use `WalletController` to create an instance of this class.
 */
export class ConnectedWallet {
    constructor(id, type, label, chainId, pubKey, address, rpc, gasPrice) {
        this.id = id;
        this.type = type;
        this.label = label;
        this.chainId = chainId;
        this.pubKey = pubKey;
        this.address = address;
        this.rpc = rpc;
        this.gasPrice = new Coin(gasPrice);
    }
    /**
     * Returns the account number and sequence for the connected address. If `fromCache`
     * is true, the cached values (if they are available) will be returned instead of
     * querying the auth module.
     *
     * @throws if the account does not exist in the auth module.
     */
    async getAuthInfo(fromCache = false) {
        if (!this.accountNumber || !this.sequence || !fromCache) {
            const account = await getAccount(this.rpc, { address: this.address });
            const { accountNumber, sequence } = toBaseAccount(account);
            this.accountNumber = accountNumber;
            this.sequence = sequence;
        }
        return {
            accountNumber: this.accountNumber,
            sequence: this.sequence,
        };
    }
    /**
     * Simulates the tx and returns an estimate of the gas fees required.
     *
     * @throws if the tx fails to simulate.
     */
    async estimateFee({ msgs, memo }, feeMultiplier = 1.4) {
        const estimate = async () => {
            const { sequence } = await this.getAuthInfo(true);
            const { gasInfo } = await simulateTx(this.rpc, {
                sequence,
                memo,
                tx: new Tx({ chainId: this.chainId, pubKey: this.pubKey, msgs: msgs }),
            });
            if (!gasInfo) {
                throw new Error("Unable to estimate fee");
            }
            return calculateFee(gasInfo, this.gasPrice, feeMultiplier);
        };
        // If we encounter an account sequence mismatch error, we retry exactly once
        // by parsing the error for the correct sequence to use
        try {
            return await estimate();
        }
        catch (err) {
            if (!(err instanceof Error)) {
                // Rethrow non-errors
                throw err;
            }
            const expectedSequence = extractExpectedAccountSequence(err);
            if (!expectedSequence) {
                // Rethrow errors not related to account sequence mismatch
                throw err;
            }
            // Set the cached sequence to the one from the error message
            this.sequence = expectedSequence;
            return estimate();
        }
    }
    /**
     * Signs and broadcasts the given `unsignedTx`, returning the tx hash if successful.
     * The `fee` parameter can (and should) be obtained by running `estimateFee` on
     * the `unsignedTx` prior to calling this method.
     *
     * **Important**: successful execution of this method does not guarantee that the
     * tx was successfully included in a block. Use `pollTx` to poll for the result of
     * the tx.
     *
     * @throws if the user denies the signing of the tx.
     * @throws if the tx fails to broadcast.
     */
    async broadcastTx(unsignedTx, fee) {
        const { accountNumber, sequence } = await this.getAuthInfo(true);
        const hash = await this.signAndBroadcastTx(unsignedTx, fee, accountNumber, sequence);
        // Greedily increment the sequence for the next tx. This may result in the wrong
        // sequence, but if `estimateFee` was called prior to this, it will be corrected
        this.sequence = sequence + 1n;
        return hash;
    }
    /**
     * Polls for the tx matching the given `txHash` every `intervalSeconds` until it is
     * included in a block or when `maxAttempts` is reached (default: 2s, 64 attempts).
     *
     * @throws if the tx is not included in a block after the given `maxAttempts`.
     */
    async pollTx(txHash, { maxAttempts, intervalSeconds } = {}) {
        return pollTx(this.rpc, {
            hash: txHash,
            maxAttempts,
            intervalSeconds,
        });
    }
    /**
     * Executes `broadcastTx` and `pollTx` sequentially, returning the result of the
     * tx. If `feeOrFeeMultiplier` is `undefined` or a number, an additional call to
     * `estimateFee` will be made. Use this if there is no need to independently
     * execute the three methods.
     */
    async broadcastTxSync(unsignedTx, feeOrFeeMultiplier = 1.4, pollOpts = {}) {
        const fee = typeof feeOrFeeMultiplier === "number"
            ? await this.estimateFee(unsignedTx, feeOrFeeMultiplier)
            : feeOrFeeMultiplier;
        const txHash = await this.broadcastTx(unsignedTx, fee);
        return this.pollTx(txHash, pollOpts);
    }
}