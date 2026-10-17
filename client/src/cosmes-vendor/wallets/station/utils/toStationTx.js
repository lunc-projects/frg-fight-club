/**
 * Translates the given args to a tx that can be sent to either
 * the Station extension wallet or WalletConnect wallet.
 */
export function toStationTx(chainId, fee, msgs, memo) {
    return {
        chainID: chainId,
        fee: toStationFee(fee),
        msgs: msgs.map(toStationMsg),
        memo: memo,
    };
}
function toStationFee({ amount, gasLimit }) {
    return JSON.stringify({
        amount,
        gas_limit: gasLimit.toString(),
    });
}
function toStationMsg(msg) {
    const { value } = msg.toAmino();
    return JSON.stringify({
        "@type": "/" + msg.toProto().getType().typeName,
        ...value,
    });
}