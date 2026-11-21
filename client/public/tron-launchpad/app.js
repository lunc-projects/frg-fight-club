/* LUNC Dev Studio Launchpad — TRON (Nile testnet build)
   TronLink connect, factory wiring (create / list / trade panel / owner
   controls), wallet checker via the public TronGrid API, pace chart, logo
   preview. FACTORY_ADDRESS is empty until the factory is deployed on Nile;
   the page is honest about that and disables create while it is empty. */
"use strict";

/* ---------- Network + factory config ---------- */
const NETWORKS = {
  nile:    { host: "https://nile.trongrid.io", label: "TRON Nile testnet" },
  mainnet: { host: "https://api.trongrid.io",  label: "TRON mainnet" },
};
const NETWORK = "nile";                 // test build; mainnet at launch
const API_HOST = NETWORKS[NETWORK].host;
const FACTORY_ADDRESS = "TQxJVN3jNCY5WyQQPSLQnQr3red23h7SRf";             // filled in after the Nile deploy
const DEC = 6;                          // LaunchToken decimals (fixed)

/* LANG_NAMES + RTL_LANGS are declared in i18n.js (loaded before this file). */

/* ---------- State ---------- */
let tronWeb = null;         // from TronLink when available
let account = "";           // connected wallet (base58)
let lang = "en";
let selected = null;        // currently open launch state (trade panel)
let logoDataUrl = "";

/* ---------- i18n ---------- */
const $ = (id) => document.getElementById(id);
function t(key) {
  const tbl = I18N[lang] || I18N.en;
  return tbl[key] !== undefined ? tbl[key] : (I18N.en[key] || key);
}
function applyLang() {
  document.documentElement.lang = lang;
  document.documentElement.dir = (lang === "ar") ? "rtl" : "ltr";
  document.querySelectorAll("[data-i18n]").forEach((el) => { el.textContent = t(el.getAttribute("data-i18n")); });
  $("langSel").value = lang;
  updateWalletUi();
  updatePace();
  renderPreview();
  if (selected) renderTradePanel();
}
$("langSel").addEventListener("change", (e) => { lang = e.target.value; applyLang(); });

/* ---------- Tabs ---------- */
document.querySelectorAll(".tab").forEach((btn) => {
  btn.addEventListener("click", () => {
    document.querySelectorAll(".tab").forEach((b) => b.classList.toggle("active", b === btn));
    document.querySelectorAll(".view").forEach((v) => v.classList.toggle("active", v.id === "view-" + btn.dataset.view));
    if (btn.dataset.view === "launches") refreshLaunches();
  });
});

/* ---------- Wallet (TronLink) ---------- */
function shortAddr(a) { return a ? a.slice(0, 6) + "…" + a.slice(-4) : ""; }
function updateWalletUi() {
  if (account) {
    $("connectBtn").textContent = shortAddr(account);
    $("walletLine").textContent = t("connectedAs") + ": " + account + " · " + NETWORKS[NETWORK].label;
  } else {
    $("connectBtn").textContent = t("connect");
    $("walletLine").textContent = "";
  }
}
async function connectWallet() {
  if (!window.tronLink) { $("walletLine").textContent = t("needTronLink"); return; }
  try {
    const res = await window.tronLink.request({ method: "tron_requestAccounts" });
    if (res && res.code === 200 && window.tronWeb) {
      tronWeb = window.tronWeb;
      account = tronWeb.defaultAddress.base58 || "";
      updateWalletUi();
      refreshLaunches();
    }
  } catch (e) { /* user rejected */ }
}
$("connectBtn").addEventListener("click", connectWallet);
window.addEventListener("load", () => {
  if (window.tronWeb && window.tronWeb.defaultAddress && window.tronWeb.defaultAddress.base58) {
    tronWeb = window.tronWeb;
    account = tronWeb.defaultAddress.base58;
    updateWalletUi();
  }
});

/* ---------- Helpers ---------- */
function toSun(trx) { return Math.round(Number(trx) * 1e6); }
function fromSun(sun) { return Number(sun) / 1e6; }
function wholeToBase(whole) { return (BigInt(Math.round(Number(whole))) * (10n ** BigInt(DEC))).toString(); }
function baseToWhole(base) { return Number(BigInt(base)) / 10 ** DEC; }
function fmt(n, maxFrac) { return Number(n).toLocaleString(undefined, { maximumFractionDigits: maxFrac === undefined ? 6 : maxFrac }); }
function esc(s) { return String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c])); }
function statusKey(c) {
  if (c.shutdown) return "statusShutdown";
  if (c.graduated) return "statusGraduated";
  if (c.paused) return "statusPaused";
  if (c.canGrad) return "statusGraduating";
  return "statusActive";
}
function errMsg(e) {
  const m = (e && (e.message || e.error || String(e))) || "";
  const mm = String(m).match(/revert[: ]+(.+)/i);
  return mm ? mm[1] : String(m).slice(0, 180);
}
function factory() { return tronWeb.contract(FACTORY_ABI, FACTORY_ADDRESS); }
function curveAt(addr) { return tronWeb.contract(CURVE_ABI, addr); }
function tokenAt(addr) { return tronWeb.contract(TOKEN_ABI, addr); }

/* ---------- Create: pace chart + preview ---------- */
function paceInfo() {
  const v = Number($("inPace").value);                    // 0..100
  const key = v < 34 ? "paceSlow" : (v < 67 ? "paceMed" : "paceSteep");
  const depthMult = Math.max(2, Math.round(8 - (v / 100) * 6));  // CP depth 8 (slow) .. 2 (steep)
  return { v, key, depthMult };
}
function paceRatio(kind, u, depthMult) {
  if (kind === 1) return 1 + 60 * u * u - 40 * u * u * u;         // sigmoid: 1x -> 21x
  const D = depthMult, x = u * 0.8;                               // CP, sale = 80% of curve tokens
  return ((D) / (D - x)) ** 2;
}
function drawChart() {
  const cv = $("curveChart"); if (!cv) return;
  const ctx = cv.getContext("2d");
  const W = cv.width, H = cv.height;
  ctx.clearRect(0, 0, W, H);
  const kind = Number($("inCurve").value);
  const { depthMult } = paceInfo();
  let maxR = 1;
  for (let i = 0; i <= 100; i++) maxR = Math.max(maxR, paceRatio(kind, i / 100, depthMult));
  ctx.strokeStyle = "rgba(232,184,75,.22)"; ctx.lineWidth = 1;
  for (let g = 0; g <= 4; g++) { const y = H - 10 - (H - 24) * g / 4; ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(W, y); ctx.stroke(); }
  ctx.strokeStyle = "#e8b84b"; ctx.lineWidth = 2.5; ctx.beginPath();
  for (let i = 0; i <= 100; i++) {
    const u = i / 100, r = paceRatio(kind, u, depthMult);
    const x = (W - 6) * u + 3, y = H - 10 - (H - 24) * (r / maxR);
    i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
  }
  ctx.stroke();
}
function updatePace() { $("paceLabel").textContent = t(paceInfo().key); drawChart(); }
function renderPreview() {
  $("pvName").textContent = $("inName").value.trim() || "—";
  $("pvSym").textContent = $("inSymbol").value.trim() || "—";
  $("pvSupply").textContent = $("inSupply").value ? fmt($("inSupply").value, 0) : "—";
  $("pvPrice").textContent = $("inPrice").value ? $("inPrice").value + " TRX" : "—";
  $("pvCurve").textContent = t(Number($("inCurve").value) === 1 ? "curveSig" : "curveCP");
  if (logoDataUrl) { $("logoPreview").src = logoDataUrl; $("logoPreview").classList.remove("hidden"); $("logoPlaceholder").classList.add("hidden"); }
  else { $("logoPreview").classList.add("hidden"); $("logoPlaceholder").classList.remove("hidden"); }
}
["inName", "inSymbol", "inSupply", "inPrice", "inCurve"].forEach((id) => $(id).addEventListener("input", renderPreview));
$("inCurve").addEventListener("change", drawChart);
$("inPace").addEventListener("input", updatePace);
$("inGrad").addEventListener("change", () => { $("targetWrap").classList.toggle("hidden", $("inGrad").value !== "dex"); });
$("inLogo").addEventListener("change", (e) => {
  const f = e.target.files && e.target.files[0];
  if (!f) { logoDataUrl = ""; renderPreview(); return; }
  const r = new FileReader();
  r.onload = () => { logoDataUrl = String(r.result); renderPreview(); };
  r.readAsDataURL(f);
});

/* ---------- Create submit ---------- */
$("createForm").addEventListener("submit", async (ev) => {
  ev.preventDefault();
  const out = $("createMsg");
  if (!FACTORY_ADDRESS) { out.textContent = t("createNeedFactory"); return; }
  if (!tronWeb || !account) { await connectWallet(); if (!account) return; }
  const name = $("inName").value.trim(), sym = $("inSymbol").value.trim();
  const supply = Number($("inSupply").value), price = Number($("inPrice").value);
  if (!name || !sym || !supply || !price) { out.textContent = t("fillFields"); return; }
  const preMintWhole = Number($("inPreMint").value || 0);
  let preMintWallet = $("inPreMintWallet").value.trim();
  if (preMintWhole > 0 && !preMintWallet) preMintWallet = account;
  const gradDex = $("inGrad").value === "dex";
  const args = [
    name, sym,
    wholeToBase(supply),
    wholeToBase(preMintWhole),
    preMintWallet ? tronWeb.address.toHex(preMintWallet) : "0x0000000000000000000000000000000000000000",
    String(toSun(price)),
    Number($("inCurve").value),
    String(paceInfo().depthMult),
    String(Number($("inFee").value)),
    gradDex ? String(toSun($("inTarget").value || 0)) : "0",
    String(Number($("inSnipeWin").value || 0)),
    String(toSun($("inSnipeCap").value || 0)),
    String(toSun($("inMaxBuy").value || 0)),
    wholeToBase(Number($("inSellLimit").value || 0)),
    String(Number($("inCooldown").value || 3)),
  ];
  out.textContent = t("creating");
  try {
    const listingFee = await factory().listingFee().call();
    const tx = await factory().createLaunch(args).send({ callValue: Number(listingFee || 0), feeLimit: 300_000_000 });
    out.textContent = t("createdOk") + " tx: " + tx;
    if (logoDataUrl) {
      setTimeout(async () => {
        try {
          const n = Number(await factory().launchCount().call());
          const l = await factory().getLaunch(n - 1).call();
          localStorage.setItem("lp-logo-" + tronWeb.address.fromHex(l.token), logoDataUrl);
        } catch (e) { /* logo is cosmetic */ }
      }, 4000);
    }
    refreshLaunches();
  } catch (e) { out.textContent = t("createFailed") + ": " + errMsg(e); }
});

/* ---------- Launches list + trade panel ---------- */
async function readCurveState(curveAddr, tokenAddr) {
  const c = curveAt(curveAddr), tk = tokenAt(tokenAddr);
  const [owner, paused, graduated, shutdown, price, sold, saleSupply, reserve, gradTarget] =
    await Promise.all([
      c.owner().call(), c.paused().call(), c.graduated().call(), c.shutdown().call(),
      c.currentPriceSun().call(), c.tokensSold().call(), c.saleSupply().call(),
      c.realReserveSun().call(), c.gradTargetSun().call(),
    ]);
  const [name, symbol] = await Promise.all([tk.name().call(), tk.symbol().call()]);
  return {
    curve: curveAddr, token: tokenAddr, name, symbol,
    owner: tronWeb.address.fromHex(owner),
    paused: !!paused, graduated: !!graduated, shutdown: !!shutdown,
    priceSun: Number(price), sold: baseToWhole(sold), saleSupply: baseToWhole(saleSupply),
    reserveTrx: fromSun(reserve), gradTargetTrx: fromSun(gradTarget),
    canGrad: !graduated && !shutdown && Number(gradTarget) > 0 && Number(reserve) >= Number(gradTarget),
  };
}
async function refreshLaunches() {
  const wrap = $("launchList");
  if (!FACTORY_ADDRESS || !tronWeb) { $("noFactory").style.display = ""; wrap.innerHTML = ""; return; }
  $("noFactory").style.display = "none";
  try {
    const n = Number(await factory().launchCount().call());
    wrap.innerHTML = "";
    if (n === 0) { wrap.innerHTML = '<p class="note">' + esc(t("noLaunches")) + '</p>'; return; }
    for (let i = n - 1; i >= 0; i--) {
      const l = await factory().getLaunch(i).call();
      const st = await readCurveState(tronWeb.address.fromHex(l.curve), tronWeb.address.fromHex(l.token));
      const logo = localStorage.getItem("lp-logo-" + st.token) || "";
      const pct = st.saleSupply > 0 ? Math.min(100, (st.sold / st.saleSupply) * 100) : 0;
      const el = document.createElement("button");
      el.className = "launchRow";
      el.innerHTML = (logo ? '<img class="coinSm" alt="" src="' + logo + '">' : '<span class="coinSm ph">☾</span>') +
        '<span class="lrMain"><b>' + esc(st.name) + '</b> <span class="tcSym">' + esc(st.symbol) + '</span><br>' +
        '<span class="note">' + fmt(fromSun(st.priceSun)) + ' TRX · ' + pct.toFixed(1) + '% ' + esc(t("soldOf")) + '</span></span>' +
        '<span class="badge">' + esc(t(statusKey(st))) + '</span>';
      el.addEventListener("click", () => { selected = st; renderTradePanel(); $("tradePanel").scrollIntoView({ behavior: "smooth" }); });
      wrap.appendChild(el);
    }
  } catch (e) { /* leave the list as-is on read errors */ }
}
function renderTradePanel() {
  if (!selected) { $("tradePanel").classList.add("hidden"); return; }
  const c = selected;
  $("tradePanel").classList.remove("hidden");
  $("tpName").textContent = c.name;
  $("tpSym").textContent = c.symbol;
  $("tpPrice").textContent = fmt(fromSun(c.priceSun));
  $("tpSold").textContent = fmt(c.sold, 0) + " / " + fmt(c.saleSupply, 0);
  $("tpStatus").textContent = t(statusKey(c));
  $("tpGrad").textContent = c.gradTargetTrx > 0 ? Math.min(100, (c.reserveTrx / c.gradTargetTrx) * 100).toFixed(1) + "%" : t("gradNone");
  $("ownerPanel").classList.toggle("hidden", !(account && account === c.owner));
  quoteBuy(); quoteSell();
}
async function quoteBuy() {
  if (!selected || !tronWeb) return;
  try {
    const amt = Number($("buyAmt").value || 0);
    if (!amt) { $("buyQuote").textContent = "—"; return; }
    const q = await curveAt(selected.curve).quoteBuy(toSun(amt)).call();
    $("buyQuote").textContent = fmt(baseToWhole(q)) + " " + selected.symbol;
  } catch (e) { $("buyQuote").textContent = "—"; }
}
async function quoteSell() {
  if (!selected || !tronWeb) return;
  try {
    const amt = Number($("sellAmt").value || 0);
    if (!amt) { $("sellQuote").textContent = "—"; return; }
    const q = await curveAt(selected.curve).quoteSell(wholeToBase(amt)).call();
    $("sellQuote").textContent = fmt(fromSun(q)) + " TRX";
  } catch (e) { $("sellQuote").textContent = "—"; }
}
$("buyAmt").addEventListener("input", quoteBuy);
$("sellAmt").addEventListener("input", quoteSell);
$("buyBtn").addEventListener("click", async () => {
  if (!selected) return;
  try {
    const amt = Number($("buyAmt").value || 0);
    const cc = curveAt(selected.curve);
    const q = await cc.quoteBuy(toSun(amt)).call();
    const minOut = (BigInt(q) * 99n / 100n).toString();      // 1% slippage guard
    await cc.buy(minOut).send({ callValue: toSun(amt), feeLimit: 100_000_000 });
    selected = await readCurveState(selected.curve, selected.token);
    renderTradePanel(); refreshLaunches();
  } catch (e) { $("tradeMsg").textContent = t("txFailed") + ": " + errMsg(e); }
});
$("sellBtn").addEventListener("click", async () => {
  if (!selected) return;
  try {
    const amt = Number($("sellAmt").value || 0);
    const base = wholeToBase(amt);
    const tk = tokenAt(selected.token), cc = curveAt(selected.curve);
    const allow = await tk.allowance(account, selected.curve).call();
    if (BigInt(allow) < BigInt(base)) await tk.approve(selected.curve, base).send({ feeLimit: 50_000_000 });
    const q = await cc.quoteSell(base).call();
    const minOut = Math.floor(Number(q) * 0.99);
    await cc.sell(base, minOut).send({ feeLimit: 100_000_000 });
    selected = await readCurveState(selected.curve, selected.token);
    renderTradePanel(); refreshLaunches();
  } catch (e) { $("tradeMsg").textContent = t("txFailed") + ": " + errMsg(e); }
});

/* ---------- Owner controls ---------- */
function ownerBind(id, fn) {
  $(id).addEventListener("click", async () => {
    if (!selected) return;
    try { await fn(curveAt(selected.curve)); selected = await readCurveState(selected.curve, selected.token); renderTradePanel(); refreshLaunches(); }
    catch (e) { $("ownerMsg").textContent = t("txFailed") + ": " + errMsg(e); }
  });
}
ownerBind("pauseBtn", (cc) => cc.pause().send({ feeLimit: 50_000_000 }));
ownerBind("unpauseBtn", (cc) => cc.unpause().send({ feeLimit: 50_000_000 }));
ownerBind("claimBtn", (cc) => cc.claimCreatorFees().send({ feeLimit: 50_000_000 }));
ownerBind("graduateBtn", () => factory().graduate(selected.curve).send({ feeLimit: 300_000_000 }));
ownerBind("recallBtn", async (cc) => { if (!window.confirm(t("recallConfirm"))) throw new Error("cancelled"); await cc.emergencyRecall().send({ feeLimit: 100_000_000 }); });
ownerBind("blAddBtn", (cc) => cc.setBlacklist(tronWeb.address.toHex($("blInput").value.trim()), true).send({ feeLimit: 50_000_000 }));
ownerBind("blRemoveBtn", (cc) => cc.setBlacklist(tronWeb.address.toHex($("blInput").value.trim()), false).send({ feeLimit: 50_000_000 }));
ownerBind("cdBtn", (cc) => cc.setCooldown(Number($("cdInput").value || 0)).send({ feeLimit: 50_000_000 }));
ownerBind("slBtn", (cc) => cc.setSellLimit(wholeToBase(Number($("slInput").value || 0))).send({ feeLimit: 50_000_000 }));

/* ---------- Wallet checker (paste-only, TronGrid public API) ---------- */
function isTronAddress(a) { return /^T[1-9A-HJ-NP-Za-km-z]{33}$/.test(a); }
async function decodeSymbol(contract, ownerAddr) {
  try {
    const cr = await fetch(API_HOST + "/wallet/triggersmartcontract", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ contract_address: contract, function_selector: "symbol()", visible: true, owner_address: ownerAddr }),
    });
    const cj = await cr.json();
    const hex = cj && cj.constant_result && cj.constant_result[0];
    if (!hex) return null;
    const bytes = [];
    for (let i = 8; i + 1 < hex.length; i += 2) bytes.push(parseInt(hex.substr(i, 2), 16));
    return new TextDecoder().decode(new Uint8Array(bytes)).replace(/\0+$/, "") || null;
  } catch (e) { return null; }
}
$("checkBtn").addEventListener("click", async () => {
  const addr = $("checkInput").value.trim();
  const msg = $("checkMsg"), res = $("checkResult");
  if (!isTronAddress(addr)) { msg.textContent = t("checkerInvalid"); res.classList.add("hidden"); return; }
  msg.textContent = t("checkerLoading");
  try {
    const r = await fetch(API_HOST + "/v1/accounts/" + addr);
    if (!r.ok) throw new Error("http " + r.status);
    const j = await r.json();
    const acct = (j.data && j.data[0]) || null;
    $("checkTrx").textContent = fmt(acct ? fromSun(acct.balance || 0) : 0) + " TRX";
    const toks = acct && acct.trc20 ? acct.trc20 : [];
    const box = $("checkTokens");
    box.innerHTML = "";
    if (!toks.length) box.innerHTML = '<p class="note">' + esc(t("checkerNone")) + '</p>';
    for (const entry of toks) {
      for (const contract of Object.keys(entry)) {
        const sym = (await decodeSymbol(contract, addr)) || (contract.slice(0, 6) + "…");
        const row = document.createElement("div");
        row.className = "tokRow";
        row.innerHTML = "<span>" + esc(sym) + "</span><b>" + fmt(Number(entry[contract]) / 1e6) + '</b><span class="note">' + esc(contract) + "</span>";
        box.appendChild(row);
      }
    }
    msg.textContent = "";
    res.classList.remove("hidden");
  } catch (e) { msg.textContent = t("checkerFailed"); res.classList.add("hidden"); }
});

/* ---------- Init ---------- */
(function init() {
  const sel = $("langSel");
  for (const code of Object.keys(LANG_NAMES)) {
    const o = document.createElement("option");
    o.value = code; o.textContent = LANG_NAMES[code];
    sel.appendChild(o);
  }
  if (!FACTORY_ADDRESS) {
    $("createBtn").disabled = true;
    $("createMsg").textContent = t("createNeedFactory");
  }
  applyLang();
  refreshLaunches();
})();
