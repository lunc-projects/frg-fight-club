import { RpcClient, Tx, } from "cosmes/client";
import { WalletType } from "../../constants/WalletType.js";
import { ConnectedWallet, } from "../ConnectedWallet.js";
import { WalletError } from "../WalletError.js";
export class KeplrExtension extends ConnectedWallet {
    constructor(walletName, label, ext, chainId, pubKey, address, rpc, gasPrice, useAmino) {
        super(walletName, WalletType.EXTENSION, label, chainId, pubKey, address, rpc, gasPrice);
        this.ext = ext;
        this.ext.defaultOptions = {
            sign: {
                preferNoSetFee: true,
                preferNoSetMemo: true,
            },
        };
        this.useAmino = useAmino;
    }
    async signArbitrary(data) {
        const res = await WalletError.wrap(this.ext.signArbitrary(this.chainId, this.address, data));
        return {
            data,
            pubKey: res.pub_key.value,
            signature: res.signature,
        };
    }
    async signAndBroadcastTx({ msgs, memo, timeoutHeight }, fee, accountNumber, sequence) {
        const tx = new Tx({
            chainId: this.chainId,
            pubKey: this.pubKey,
            msgs: msgs,
        });
        const params = {
            accountNumber,
            sequence,
            fee,
            memo,
            timeoutHeight,
        };
        let txRaw;
        if (this.useAmino) {
            const { signed, signature } = await WalletError.wrap(this.ext.signAmino(this.chainId, this.address, tx.toStdSignDoc(params)));
            txRaw = tx.toSignedAmino(signed, signature.signature);
        }
        else {
            const { signed, signature } = await WalletError.wrap(this.ext.signDirect(this.chainId, this.address, tx.toSignDoc(params)));
            txRaw = tx.toSignedDirect(signed, signature.signature);
        }
        return RpcClient.broadcastTx(this.rpc, txRaw);
    }
}