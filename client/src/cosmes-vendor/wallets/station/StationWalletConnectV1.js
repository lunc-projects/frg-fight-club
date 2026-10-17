import { base64, utf8 } from "cosmes/codec";
import { WalletName } from "../../constants/WalletName.js";
import { WalletType } from "../../constants/WalletType.js";
import { isMobile } from "../../utils/os.js";
import { ConnectedWallet, } from "../ConnectedWallet.js";
import { WalletError } from "../WalletError.js";
import { toStationTx } from "./utils/toStationTx.js";
export class StationWalletConnectV1 extends ConnectedWallet {
    constructor(label, wc, chainId, pubKey, address, rpc, gasPrice) {
        super(WalletName.STATION, WalletType.WALLETCONNECT, label, chainId, pubKey, address, rpc, gasPrice);
        this.wc = wc;
    }
    async signArbitrary(data) {
        const res = await this.sendRequest("signBytes", base64.encode(utf8.decode(data)));
        return {
            data,
            pubKey: res.public_key,
            signature: res.signature,
        };
    }
    async signAndBroadcastTx({ msgs, memo }, fee) {
        // Signing a tx without posting it isn't supported
        // See: https://github.com/terra-money/wallet-kit/blob/79600bb096d64754160909871dfdf89944120ce8/src/%40terra-money/terra-station-mobile/index.ts#L304
        const { txhash } = await this.sendRequest("post", toStationTx(this.chainId, fee, msgs, memo));
        return txhash;
    }
    async sendRequest(method, params) {
        // https://github.com/terra-money/wallet-provider/blob/interchain-wallet-provider/packages/src/%40terra-money/wallet-controller/modules/walletconnect/connect.ts#L327-L352
        const id = Date.now();
        if (isMobile()) {
            const payload = base64.encode(utf8.decode(JSON.stringify({
                id,
                handshakeTopic: this.wc.handshakeTopic,
                method,
                params,
            })));
            window.location.href = `terrastation://walletconnect_confirm/?action=walletconnect_confirm&payload=${payload}`;
        }
        try {
            return await this.wc.sendCustomRequest({
                id,
                method,
                params: [params],
            });
        }
        catch (err) {
            if (err instanceof Error) {
                // Error messages are JSON stringified (eg. '{"code":1,"message":"Denied by user"}')
                const { message } = JSON.parse(err.message);
                throw new WalletError(message, err);
            }
            throw new WalletError("unknown error", err);
        }
    }
}