import { Secp256k1PubKey, getAccount, toBaseAccount } from "cosmes/client";
import { ethhex, recoverPubKeyFromEthSignature, translateEthToBech32Address, utf8, } from "cosmes/codec";
import { CosmosCryptoSecp256k1PubKey } from "cosmes/protobufs";
import { WalletName } from "../../constants/WalletName.js";
import { WalletType } from "../../constants/WalletType.js";
import { WalletController } from "../WalletController.js";
import { WalletError } from "../WalletError.js";
import { MetamaskInjectiveExtension } from "./MetamaskInjectiveExtension.js";
export class MetamaskInjectiveController extends WalletController {
    constructor() {
        super(WalletName.METAMASK_INJECTIVE);
        this.registerAccountChangeHandlers();
    }
    async isInstalled(type) {
        return type === WalletType.EXTENSION ? "ethereum" in window : false;
    }
    async connectWalletConnect(_chains) {
        // TODO: check if walletconnect can be supported
        throw new Error("WalletConnect not supported");
    }
    async connectExtension(chains) {
        if (chains.length !== 1) {
            throw new Error("Exactly one chain information for Injective is required");
        }
        const ext = window.ethereum;
        if (!ext) {
            throw new Error("MetaMask extension is not installed");
        }
        const ethAddresses = await WalletError.wrap(ext.request({
            method: "eth_requestAccounts",
        }));
        const ethAddress = ethAddresses?.[0];
        if (!ethAddress) {
            throw new Error("Failed to connect to MetaMask");
        }
        const injAddress = translateEthToBech32Address(ethAddress, "inj");
        const [chain] = chains;
        const pubKey = await WalletError.wrap(this.getPubKey(ext, chain.chainId, chain.rpc, ethAddress, injAddress));
        const wallets = new Map();
        wallets.set(chain.chainId, new MetamaskInjectiveExtension(this.id, undefined, ext, chain.chainId, pubKey, ethAddress, injAddress, chain.rpc, chain.gasPrice));
        return wallets;
    }
    registerAccountChangeHandlers() {
        if (typeof window !== "undefined" && window.ethereum) {
            window.ethereum.on("accountsChanged", () => this.changeAccount(WalletType.EXTENSION));
        }
    }
    async getPubKey(ext, chainId, rpc, ethAddress, injAddress) {
        // Try to get public key from RPC, but ignore any errors that occur
        const account = await getAccount(rpc, { address: injAddress }).catch(console.warn);
        if (account) {
            const { pubKey } = toBaseAccount(account);
            if (pubKey) {
                return new Secp256k1PubKey({
                    chainId,
                    key: CosmosCryptoSecp256k1PubKey.fromBinary(pubKey.value).key,
                });
            }
        }
        // Fallback to recovering pub key from a `personal_sign` signature
        // TODO: This may not be desirable behaviour as querying RPC will always
        // TODO: fail if the user's account has not been initialised, thereby making
        // TODO: the user sign this message every time they reconnect to the wallet
        const message = utf8.decode("Sign to allow retrieval of your public key");
        const signature = await ext.request({
            method: "personal_sign",
            params: [ethhex.encode(message), ethAddress],
        });
        if (!signature) {
            throw new Error("Failed to retrieve pubic key");
        }
        return new Secp256k1PubKey({
            chainId,
            key: recoverPubKeyFromEthSignature(message, ethhex.decode(signature)),
        });
    }
}