import { RpcClient, Secp256k1PubKey, Tx } from "cosmes/client";
import { base64, resolveBech32Address, resolveKeyPair, signAmino, signDirect, utf8, } from "cosmes/codec";
import { ConnectedWallet, } from "../ConnectedWallet.js";
/**
 * This wallet accepts a mnemonic (aka seed phrase) and is able to directly sign
 * and broadcast transactions to the chain without relying on an external wallet
 * like Keplr or Station. Use this if you want to programmatically broadcast
 * transactions. Unlike the other wallets, there is no Controller class and this
 * object must be instantiated directly.
 *
 * ```ts
 * // Example usage for Osmosis chain
 * const wallet = new MnemonicWallet({
 *   mnemonic: "REPLACE WITH 12-24 WORDS SEED PHRASE", // TODO
 *   bech32Prefix: "osmo",
 *   chainId: "osmosis-1",
 *   rpc: "https://rpc.osmosis.zone",
 *   gasPrice: {
 *     amount: "0.0025",
 *     denom: "uosmo",
 *   },
 *   coinType: 118, // optional (default: 118)
 *   index: 0, // optional (default: 0)
 * });
 * console.log("Address:", wallet.address); // prints the bech32 address
 *
 * // Sign an arbitrary message
 * const { signature } = await wallet.signArbitrary("Hello from CosmES!");
 * console.log("Signature:", signature);
 *
 * // Sign and broadcast a tx
 * const res = await wallet.broadcastTxSync( ... ); // TODO
 * console.log("Tx result:", res);
 * ```
 */
export class MnemonicWallet extends ConnectedWallet {
    constructor({ mnemonic, bech32Prefix, coinType, index, chainId, gasPrice, rpc, }) {
        const { publicKey, privateKey } = resolveKeyPair(mnemonic, {
            coinType,
            index,
        });
        const keyType = chainId.startsWith("injective") || chainId.startsWith("dymension")
            ? "ethsecp256k1"
            : "secp256k1";
        const address = resolveBech32Address(publicKey, bech32Prefix, keyType);
        super(
        // We typecast here instead of adding "mnemonic" to `WalletName` and
        // `WalletType` as this wallet is considered a special wallet that is
        // unlikely to be used by most consumers of CosmES.
        "mnemonic", "mnemonic", undefined, chainId, new Secp256k1PubKey({
            chainId,
            key: publicKey,
        }), address, rpc, gasPrice);
        this.publicKey = base64.encode(publicKey);
        this.privateKey = privateKey;
        this.keyType = keyType;
    }
    async signArbitrary(data) {
        // This sign doc follows ADR 036 specs.
        // See: https://github.com/cosmos/cosmos-sdk/blob/main/docs/architecture/adr-036-arbitrary-signature.md
        const doc = {
            chain_id: "",
            account_number: "0",
            sequence: "0",
            fee: {
                gas: "0",
                amount: [],
            },
            msgs: [
                {
                    type: "sign/MsgSignData",
                    value: {
                        signer: this.address,
                        data: base64.encode(utf8.decode(data)),
                    },
                },
            ],
            memo: "",
        };
        const signature = signAmino(doc, this.privateKey, this.keyType);
        return {
            data,
            pubKey: this.publicKey,
            signature: base64.encode(signature),
        };
    }
    async signAndBroadcastTx({ msgs, memo, timeoutHeight }, fee, accountNumber, sequence) {
        const tx = new Tx({
            chainId: this.chainId,
            pubKey: this.pubKey,
            msgs: msgs,
        });
        const doc = tx.toSignDoc({
            accountNumber,
            sequence,
            fee,
            memo,
            timeoutHeight,
        });
        const signature = signDirect(doc, this.privateKey, this.keyType);
        return RpcClient.broadcastTx(this.rpc, tx.toSignedDirect(doc, signature));
    }
}