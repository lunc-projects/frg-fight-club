import { isAndroid, isMobile } from "../utils/os.js";
import { qrcodegen } from "./qrcodegen.js";
export class QRCodeModal {
    constructor(details) {
        this.id = "wc-modal-" + Date.now();
        this.details = details;
    }
    open(uri) {
        const overlay = document.createElement("div");
        overlay.style.cssText = [
            "background-color: rgba(0, 0, 0, 0.5)",
            "backdrop-filter: blur(4px)",
            "z-index: 10000",
            "height: 100vh",
            "width: 100vw",
            "position: fixed",
            "top: 0",
            "left: 0",
            "display: flex",
            "align-items: center",
            "justify-content: center",
            "pointer-events: auto",
        ].join(";");
        overlay.onclick = (e) => {
            e.stopPropagation();
            if (e.target === overlay) {
                this.close();
            }
        };
        const modal = document.createElement("div");
        modal.style.cssText = [
            "background-color: #f4f4f5",
            "padding: 1rem",
            "border-radius: 0.5rem",
        ].join(";");
        // FRG patch: for Keplr, hand the pairing URI to the game's own
        // picker UI (copy/paste backup) AND, inside Telegram, open Keplr
        // via its HTTPS app link through Telegram's openLink — the route
        // that keeps the game page (and the WC session) alive, proven
        // with Galaxy Station.
        if (typeof window !== "undefined" && window.__frgInterceptUri && this.details.name === "Keplr") {
            window.__frgInterceptUri(uri);
            const tgK = window.Telegram?.WebApp;
            if (tgK?.openLink) {
                tgK.openLink(`https://deeplink.keplr.app/wcV2?${encodeURIComponent(uri)}`);
            }
            return;
        }
        const schemeUri = this.details.isStation
            ? `https://terrastation.page.link/?link=https://terra.money?${encodeURIComponent(`action=wallet_connect&payload=${encodeURIComponent(uri)}`)}&apn=money.terra.station&ibi=money.terra.station&isi=1548434735`
            : uri;
        const qr = qrcodegen.QrCode.encodeText(schemeUri, qrcodegen.QrCode.Ecc.MEDIUM);
        const canvas = document.createElement("canvas");
        const scale = this.details.isStation ? 3.7 : 5;
        canvas.width = qr.size * scale;
        canvas.height = canvas.width;
        const ctx = canvas.getContext("2d");
        if (!ctx) {
            console.error("Failed to get canvas context");
            return;
        }
        for (let y = 0; y < qr.size; y++) {
            for (let x = 0; x < qr.size; x++) {
                ctx.fillStyle = qr.getModule(x, y) ? "#18181b" : "#f4f4f5";
                ctx.fillRect(x * scale, y * scale, scale, scale);
            }
        }
        if (isMobile()) {
            // FRG patch (Galaxy Station in Telegram): a location.href
            // navigation REPLACES the game page, killing the WalletConnect
            // session before the app can approve it (the app then opens
            // empty, "not connected"). Telegram's openLink hands the app
            // link to the system WITHOUT leaving the game page, so the
            // session stays alive for the approval.
            const tg = typeof window !== "undefined" ? window.Telegram?.WebApp : null;
            if (tg?.openLink && isAndroid()) {
                // Station's handoff is already an HTTPS Firebase link —
                // same openLink route as Galaxy.
                if (this.details.isStation) {
                    tg.openLink(schemeUri);
                    return;
                }
                if (this.details.name === "Galaxy Station") {
                    const base = this.details.android.split("#")[0];
                    tg.openLink(`${base}?${encodeURIComponent(uri)}`);
                    return;
                }
            }
            // On mobile, redirect to mobile app
            window.location.href = this.details.isStation
                ? schemeUri
                : isAndroid()
                    ? this.generateAndroidIntent(uri)
                    : this.generateIosIntent(uri);
            // TODO: render button to open mobile app
        }
        else {
            // On desktop, show help message to scan the QR code
            const msg = document.createElement("div");
            msg.textContent = `Scan via ${this.details.name} mobile app`;
            msg.style.cssText = [
                "margin-bottom: 0.5rem",
                "font-size: 1rem",
                "text-align: center",
                "color: #18181b",
            ].join(";");
            modal.appendChild(msg);
        }
        const rootDiv = document.createElement("div");
        rootDiv.id = this.id;
        const shadowRoot = rootDiv.attachShadow({ mode: "open" });
        modal.appendChild(canvas);
        overlay.appendChild(modal);
        shadowRoot.appendChild(overlay);
        document.body.appendChild(rootDiv);
    }
    close() {
        const rootDiv = document.getElementById(this.id);
        if (rootDiv) {
            document.body.removeChild(rootDiv);
        }
    }
    generateAndroidIntent(uri) {
        const hashIndex = this.details.android.indexOf("#");
        return (this.details.android.slice(0, hashIndex) +
            "?" +
            encodeURIComponent(uri) +
            this.details.android.slice(hashIndex));
    }
    generateIosIntent(uri) {
        return this.details.ios + "?" + encodeURIComponent(uri);
    }
}