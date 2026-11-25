/* =====================================================================
   FROG FIGHT — boost wallet layer (ffwallet.js)
   The three-wallet connect is the PROVEN Garuda Dash implementation
   copied verbatim (Keplr + Galaxy Station + LUNCDash — the same code
   Tom phone-verified on Garuda Dash and the Garuda DEX): do not
   hand-edit the connect machinery. FFB-specific parts: the boost
   collection reads (FFB + FFBP owned boosts), the panel rendering,
   and fa2SendLunc (the Garuda DEX send pattern: direct signer for
   Keplr/Galaxy, terra_signAmino for LUNCDash).
   ===================================================================== */
const FFB_NFT_CONTRACT = 'terra18jjj7jrcmmkfe5w3kcuz4w3z8sfzxwm5hf7585qvqepvm4usgmcqku72ve';
const FFBP_NFT_CONTRACT = 'terra147epfc4npavqmtdkcuuynsaajgfyn2v0llcryq9pjtxg6essfvdsznlfj3';
const FA2_NFT_CONTRACT = FFB_NFT_CONTRACT; /* default contract for gdSmart */
const FA2_GOLIATH = 'terra183yjyennklj77uc47txds9mmpu6vlaecaxk66g';
const GD_RPC = 'https://terra-classic-rpc.publicnode.com';
let fa2DashWc = null;   /* retained LUNCDash WC connector (the DEX keeps the same handle for its amino sign path) */
/* (FA2_NFT_CONTRACT is declared in the header above) */
/* LCD base: publicnode. A localStorage override exists ONLY so sandboxed
   QA (no direct browser egress) can relay the same endpoint — production
   players always read the real LCD directly. */
const GD_LCD = (() => { try { return localStorage.getItem('garudaDashLcdOverride') || 'https://terra-classic-lcd.publicnode.com'; } catch (e) { return 'https://terra-classic-lcd.publicnode.com'; } })();
const GD_CHAIN_ID = 'columbus-5';
let gdWallet = '';            /* address whose Garudas are loaded */
let gdWalletConnected = false;/* true ONLY for a live Keplr connect this session */
let gdWalletVia = '';         /* which connect route set gdWallet: 'keplr' | 'galaxy' | 'station' | '' (paste) */
let gdChar = null;            /* FA2: unused legacy slot (owned-fighter selection lives in the game glue) */
let gdOwned = [];             /* verified tokens of gdWallet */

function gdShortAddr(a){ return a && a.length > 20 ? a.slice(0, 10) + '…' + a.slice(-6) : (a || ''); }

async function gdSmartC(contract, queryObj){
  const b64 = btoa(unescape(encodeURIComponent(JSON.stringify(queryObj))));
  const r = await fetch(GD_LCD + '/cosmwasm/wasm/v1/contract/' + contract + '/smart/' + encodeURIComponent(b64));
  if (!r.ok) throw new Error('chain ' + r.status);
  const j = await r.json();
  return j.data;
}
async function gdSmart(queryObj){ return gdSmartC(FA2_NFT_CONTRACT, queryObj); }
/* One token's own nft_info, shaped for the panel / hero. */

/* ================= FA2 owned fighters =================
   Reads the connected wallet's Frog Arena Warriors from the FAW
   collection (tokens-by-owner, paginated at the LCD's 50 cap),
   then each token's nft_info. The Miata extension carries the
   traits the mint service wrote: Fighter / Tier / Power / Ref. */
function fa2Trait(ext, key) {
  const attrs = (ext && ext.attributes) || [];
  for (const a of attrs) if (a && a.trait_type === key) return String(a.value == null ? '' : a.value);
  return '';
}
async function ffbLoadBoosts(owner) {
  const out = [];
  const colls = [['ffb', FFB_NFT_CONTRACT], ['ffbp', FFBP_NFT_CONTRACT]];
  for (const [tag, contract] of colls) {
    const ids = [];
    let startAfter = undefined;
    for (let page = 0; page < 4; page++) {
      const q = { tokens: { owner, limit: 50 } };
      if (startAfter) q.tokens.start_after = startAfter;
      const t = await gdSmartC(contract, q);
      const batch = (t && t.tokens) || [];
      for (const id of batch) ids.push(id);
      if (batch.length < 50) break;
      startAfter = batch[batch.length - 1];
    }
    for (const id of ids.slice(0, 200)) {
      try {
        const info = await gdSmartC(contract, { nft_info: { token_id: id } });
        const ext = (info && info.extension) || {};
        out.push({
          key: contract + '|' + id, contract, coll: tag, tokenId: id,
          name: ext.name || ('Boost ' + id),
          image: ext.image || '',
          kind: fa2Trait(ext, 'Kind'),
          finish: fa2Trait(ext, 'Finish'),
          atk: parseInt(fa2Trait(ext, 'ATK'), 10) || 0,
          def: parseInt(fa2Trait(ext, 'DEF'), 10) || 0,
          agi: parseInt(fa2Trait(ext, 'AGI'), 10) || 0,
          spc: parseInt(fa2Trait(ext, 'SPC'), 10) || 0,
        });
      } catch (e) { /* one unreadable token never blocks the rest */ }
    }
  }
  out.sort((a, b) => (b.atk + b.def + b.agi + b.spc) - (a.atk + a.def + a.agi + a.spc) || (a.tokenId < b.tokenId ? -1 : 1));
  return out;
}
function gdRenderPanel(msg) {
  const st = $('nftStatus');
  if (st && msg) st.textContent = msg;
  const grid = $('ffbOwnedGrid');
  if (grid) {
    grid.innerHTML = '';
    for (const g of gdOwned) {
      const card = document.createElement('div');
      card.className = 'ffbown';
      const img = document.createElement('img');
      img.src = g.image; img.alt = g.name; img.loading = 'lazy';
      const nm = document.createElement('span'); nm.className = 'on'; nm.textContent = g.name;
      const pw = document.createElement('span'); pw.className = 'op';
      const fx = [];
      if (g.atk) fx.push('ATK +' + g.atk);
      if (g.def) fx.push('DEF +' + g.def);
      if (g.agi) fx.push('AGI +' + g.agi);
      if (g.spc) fx.push('SPC +' + g.spc);
      pw.textContent = fx.join(' · ') + (g.finish ? ' · ' + g.finish : '');
      const equipped = !!(window.__ffbEquipState && window.__ffbEquipState(g.key));
      const btn = document.createElement('button');
      btn.className = 'ffbequip' + (equipped ? ' on' : ''); btn.type = 'button';
      btn.textContent = equipped ? '✅ EQUIPPED' : '⚡ EQUIP';
      btn.onclick = () => { if (window.__ffbToggleEquip) window.__ffbToggleEquip(g.key); };
      card.append(img, nm, pw, btn);
      grid.appendChild(card);
    }
    grid.style.display = gdOwned.length ? 'flex' : 'none';
  }
  const cb = $('nftConnectBtn');
  if (cb) cb.textContent = (gdWalletConnected && gdWalletVia === 'keplr') ? ('✅ ' + gdShortAddr(gdWallet)) : '🔗 CONNECT KEPLR';
  const gb = $('nftGalaxyBtn');
  if (gb) gb.textContent = (gdWalletConnected && gdWalletVia === 'galaxy') ? ('✅ ' + gdShortAddr(gdWallet)) : '🌌 CONNECT GALAXY STATION';
  const db = $('nftDashRowBtn');
  if (db) db.textContent = (gdWalletConnected && (gdWalletVia === 'station' || gdWalletVia === 'luncdash')) ? ('✅ ' + gdShortAddr(gdWallet)) : '🚀 CONNECT LUNCDASH';
}
async function gdApplyWallet(addr, connected, via) {
  gdWallet = addr; gdWalletConnected = !!connected; gdWalletVia = connected ? (via || 'keplr') : '';
  gdOwned = [];
  gdRenderPanel('Reading the chain for ' + gdShortAddr(addr) + '…');
  try {
    gdOwned = await ffbLoadBoosts(addr);
    if (!gdOwned.length) {
      gdRenderPanel('No Frog Fight Boosts found for ' + gdShortAddr(addr) + ' yet — buy one in the boost shop below and it lands in this wallet.');
    } else {
      gdRenderPanel(gdOwned.length + ' Frog Fight Boost' + (gdOwned.length > 1 ? 's' : '') + ' found for ' + gdShortAddr(addr)
        + (connected ? ' — equip up to 3 under YOUR BOOSTS and they power up your frog in the fight!' : ' — 👀 VIEW ONLY: connect this wallet to equip and buy.'));
    }
  } catch (e) {
    gdRenderPanel('Chain read failed — check your connection and try again.');
  }
  if (window.__ffbOnWallet) window.__ffbOnWallet({ addr, connected: gdWalletConnected, via: gdWalletVia, owned: gdOwned });
}
const gdIsMobileUA = /Android|webOS|iPhone|iPad|iPod/i.test(navigator.userAgent);
function gdDeepLinkKeplrMobile(){
  window.location.href = 'keplrwallet://web-browser?url=' + encodeURIComponent(window.location.href);
}
async function gdWaitForKeplr(timeoutMs){
  const t0 = Date.now();
  while (Date.now() - t0 < timeoutMs){
    if (window.keplr) return window.keplr;
    await new Promise(r => setTimeout(r, 120));
  }
  return null;
}
async function gdConnectKeplr(){
  $('nftStatus').textContent = 'Opening Keplr…';
  let provider = await gdWaitForKeplr(gdIsMobileUA ? 2500 : 1200);
  if (!provider || !window.keplr){
    if (gdIsMobileUA){ $('nftStatus').textContent = 'Keplr not found — opening the Keplr app…'; gdDeepLinkKeplrMobile(); return; }
    provider = await gdWaitForKeplr(4000);
    if (!window.keplr){ $('nftStatus').textContent = 'Keplr not found. On a phone, open this page inside the Keplr app browser. On a computer, install the Keplr extension.'; return; }
  }
  try {
    await window.keplr.enable(GD_CHAIN_ID);
    const key = await window.keplr.getKey(GD_CHAIN_ID);
    if (!key || !key.bech32Address) throw new Error('no key');
    await gdApplyWallet(key.bech32Address, true);
  } catch (e) {
    $('nftStatus').textContent = 'Keplr connection was declined or failed — nothing connected.';
  }
}
/* ---- power-dive shockwave: nearby GROUND walkers/bats in radius ---- */
function gdValidAddr(a){ return /^terra1[02-9ac-hj-np-z]{38}$/.test(String(a || '')); }
/* the connected CosmosKit chain wallet + its registry/pretty names
   (Grand Prix declares these beside setWalletAddress, which Garuda
   does not port — gdApplyWallet is its loader instead) */
let kitChainWallet = null;
let kitWalletName = '';      /* 'keplr-extension' | 'keplr-mobile' | 'station-extension' | 'station-mobile' | 'galaxy-station' */
let kitPrettyName = '';      /* its pretty name ('Galaxy Station', 'Station', …) */
function gdKitHint(msg){ const st = $('nftStatus'); if (st) st.textContent = msg; }
function gdShowPairFail(msg){
  const b = $('nftPairBox'); if (b) b.classList.remove('on');
  const inp = $('nftPairUri'); if (inp) inp.value = '';
  gdPairExtras(false);
  gdKitHint(msg);
}
/* the ported core calls showPairBox/hidePairBox for the raw wc:
   pairing link — here they drive MY GARUDA's own pair box. */
function showPairBox(uri){
  const inp = $('nftPairUri');
  if (inp) inp.value = uri;
  const b = $('nftPairBox');
  if (b) b.classList.add('on');
}
function hidePairBox(){
  const b = $('nftPairBox');
  if (b) b.classList.remove('on');
  const inp = $('nftPairUri');
  if (inp) inp.value = '';
  gdPairExtras(false);
}
/* A finished connect lands in the SAME loader the Keplr row uses —
   owned + staked Garudas, stolen #115 excluded by the on-chain
   cross-checks inside gdLoadGarudas, exactly as before. */
function gdKitApplyAddress(addr, via){
  hidePairBox();
  if (!gdValidAddr(addr)){
    gdShowPairFail('That wallet returned an address this chain cannot read — nothing connected. Paste an address above just to look (read-only).');
    return Promise.resolve(false);
  }
  return Promise.resolve(gdApplyWallet(addr, true, via)).then(() => true);
}
/* normalizeKitLibs lives in the ported core but ends by calling
   gdKitAdopt() — a name the core's mount path also uses. Declared
   here (hoisted) so the core can stay byte-close to Grand Prix. */
function gdKitAdopt(){ return kitScanAdopt(); }
/* raw esm.sh modules -> the shape normalizeKitLibs returns, with
   the extra decode error GP's hook path never produced: the WC
   bundle imports @walletconnect/* submodules that carry their own
   copies of @cosmjs packages, and mixing the two copies makes the
   chain-wallet constructors throw Realm-brand errors ("Expected a
   Uint8Array" / "not a valid instance"). When that shape appears,
   drop the WC bundle's own Galaxy factory and pass its base
   classes through — same classes GP's full-bundle hook used. */
function normalizeGdKitLibs(raw){
  try { return normalizeKitLibs(raw); }
  catch (e) {
    const msg = String((e && e.message) || e);
    if (!/Uint8Array|valid instance|Realm|instanceof/.test(msg)) throw e;
    const cleaned = Object.assign({}, raw);
    try {
      const wc = Object.assign({}, raw.walletconnect);
      delete wc.GalaxyClient; delete wc.ChainGalaxyStation; delete wc.GalaxyStationWallet;
      cleaned.walletconnect = wc;
    } catch (e2) {}
    return normalizeKitLibs(cleaned);
  }
}
/* button wiring — the rows themselves (no picker modal in Garuda) */
$('nftGalaxyBtn').onclick = () => { gdShowPairFail(''); kitConnect('galaxy'); };
$('nftDashRowBtn').onclick = () => { gdShowPairFail(''); kitConnect('station'); };
/* COPY LINK on the LUNCDash pairing sheet: copies the raw wc: URI
   so it can be pasted into the LUNCDash app's WalletConnect
   scanner. (The OPEN LUNCDASH anchor's href is set per-pairing by
   gdPairExtras — the app's own luncdash:// deep link, wrapped in
   a package-pinned Android intent on Android.) */
const gdPairCopyBtn = $('nftPairCopy');
if (gdPairCopyBtn) gdPairCopyBtn.onclick = () => {
  const inp = $('nftPairUri');
  const uri = inp ? inp.value : '';
  if (!uri) return;
  const copied = () => gdKitHint('Pairing link copied — open LUNCDash, paste it into its WalletConnect scanner, and approve. Your Garudas then load here.');
  if (navigator.clipboard && navigator.clipboard.writeText)
    navigator.clipboard.writeText(uri).then(copied).catch(() => { try { inp.select(); document.execCommand('copy'); copied(); } catch (e) {} });
  else { try { inp.select(); document.execCommand('copy'); copied(); } catch (e) {} }
};
/* OPEN LUNCDASH watchdog: the button hands the pairing link
   straight to the app (package-pinned intent on Android, the
   app's luncdash:// scheme elsewhere) — never a website. If this
   page is still in front a few seconds later, the app didn't
   take it: say so plainly (not installed / didn't answer) and
   point at COPY LINK / paste-view instead. Leaving the page (the
   app opening) or a landed session keeps the warning quiet. */
const gdPairOpenBtn = $('nftPairOpen');
if (gdPairOpenBtn) gdPairOpenBtn.onclick = () => {
  if (!gdPairOpenBtn.href || gdPairOpenBtn.href.endsWith('#')) return;
  setTimeout(() => {
    if (!document.hidden && !(typeof gdWalletVia !== 'undefined' && gdWalletVia))
      gdKitHint('Still here? If the LUNCDash app didn\u2019t open, it may not be installed on this phone. Tap COPY LINK, open LUNCDash yourself, and paste the link into its WalletConnect scanner \u2014 or paste an address above just to look (read-only).');
  }, 2500);
};
/* returning from the wallet app: the core re-checks for a landed
   session on pageshow / visibility (registered by the core). The
   boot restore runs once here — with no stored WC/cosmos-kit state
   it returns immediately and never loads the stack. */

/* ---- LUNCDash row: legacy WalletConnect v1 to the LUNC Dash
   app's OWN bridge. LUNC Dash is a standalone wallet app (Android
   package com.luncdash.wallet) holding its own keys \u2014 NOT a
   Station front-end (Tom's correction, Nov 10: "Not Station.").
   It does not speak WalletConnect v2; it speaks legacy WC v1 over
   its own bridge, https://walletconnect.luncdash.com \u2014 the exact
   stack luncback.com's wallet layer runs (the cosmes-based
   LuncDashController vendored in this project's FRG app): bridge
   session cached under cosmes' own LUNC Dash key, pairing URI
   handed to this page's pair box instead of a navigation. The
   client library is @walletconnect/legacy-client from esm.sh,
   loaded lazily on first use. Phone handoff follows the pairing-
   sheet pattern the CL8Y ecosystem documents for LUNC Dash
   ("Open {wallet}" + "Copy pairing link"): the pair box carries
   the raw wc: URI, a QR of it, an OPEN LUNCDASH button and a
   COPY LINK button for the app's own WalletConnect scanner. The
   OPEN button hands the URI DIRECTLY to the app — the cosmes
   luncdash://wallet_connect deep-link scheme, package-pinned to
   com.luncdash.wallet via an Android intent:// on Android
   (Tom, Nov 10: "It has to open directly to the app wallet not
   the web page" — an earlier build opened the luncdash.com
   walletconnect web route, a dead page; that route is gone).
   Read-only: only the session's accounts are read \u2014 no request
   is ever sent to the wallet. */
const GD_DASH_WC_KEY = 'cosmes.wallet.luncdash.wcSession';
let gdDashWcPromise = null;
function gdDashLoadLegacyClient(){
  if (!gdDashWcPromise){
    gdDashWcPromise = import('https://esm.sh/@walletconnect/client@1.8.0?bundle')
      .then(m => m.default || m.WalletConnect || m)
      .catch(err => { gdDashWcPromise = null; throw err; });
  }
  return gdDashWcPromise;
}
/* pair-box extras used ONLY by the LUNCDash pairing sheet (QR +
   OPEN/COPY actions). Galaxy's showPairBox never reveals them and
   every hide path turns them back off. */
let gdDashQrPromise = null;
function gdDashRenderQr(uri){
  const cv = $('nftPairQr');
  if (!cv) return;
  if (!gdDashQrPromise){
    gdDashQrPromise = import('https://esm.sh/qrcode@1.5.4?bundle')
      .then(m => m.default || m)
      .catch(err => { gdDashQrPromise = null; throw err; });
  }
  gdDashQrPromise.then(QR => {
    if (!QR || typeof QR.toCanvas !== 'function') return;
    QR.toCanvas(cv, uri, { width: 180, margin: 1 }, err => { if (!err) cv.style.display = 'block'; });
  }).catch(() => { /* QR is a bonus \u2014 the raw link + COPY LINK still work */ });
}
/* The LUNCDash app's own deep link — the cosmes LUNC Dash scheme
   (CL8Y's production Terra Classic apps ship this exact builder,
   walletConnectPairing.ts: "Cosmes LUNC Dash scheme — do not
   invent a second one"):
     luncdash://wallet_connect?payload%3D<uri-encoded wc: URI>
   On Android the OPEN button wraps the same link in a
   package-pinned intent:// so Chrome hands it to
   com.luncdash.wallet itself and can never fall back to a
   browser or a website; everywhere else the raw scheme link is
   used. No luncdash.com route anywhere in this row. */
function gdLuncDashDeepLink(uri){
  return 'luncdash://wallet_connect?' + encodeURIComponent('payload=' + encodeURIComponent(uri));
}
function gdLuncDashOpenHref(uri){
  if (typeof gdIsMobileUA !== 'undefined' && gdIsMobileUA && /Android/i.test(navigator.userAgent || ''))
    return 'intent://wallet_connect?' + encodeURIComponent('payload=' + encodeURIComponent(uri)) + '#Intent;scheme=luncdash;package=com.luncdash.wallet;end;';
  return gdLuncDashDeepLink(uri);
}
function gdPairExtras(on, uri){
  const acts = $('nftPairActs');
  if (acts) acts.style.display = on ? 'flex' : 'none';
  const cv = $('nftPairQr');
  if (cv && !on) cv.style.display = 'none';
  if (on && uri){
    const a = $('nftPairOpen');
    if (a) a.href = gdLuncDashOpenHref(uri);
    gdDashRenderQr(uri);
  }
}
function showDashPairBox(uri){
  showPairBox(uri);
  gdPairExtras(true, uri);
}
let gdDashBusy = false;
function gdLuncDashConnect(){
  if (gdDashBusy) return Promise.resolve(false);
  gdDashBusy = true;
  gdKitHint('Opening LUNCDash\u2026 getting a pairing link from the LUNCDash WalletConnect bridge.');
  return gdDashLoadLegacyClient().then(WC => {
    let cached = null;
    try { cached = JSON.parse(localStorage.getItem(GD_DASH_WC_KEY) || 'null'); } catch (e) {}
    const wc = new WC({ bridge: 'https://walletconnect.luncdash.com', qrcode: false, session: cached || undefined });
    fa2DashWc = wc;
    return new Promise((resolve) => {
      let settled = false;
      const done = (ok, val) => { if (!settled){ settled = true; gdDashBusy = false; resolve(ok ? val : false); } };
      wc.on('session_update', (_err, payload) => {
        const acc = payload && payload.params && payload.params[0] && payload.params[0].accounts;
        if (acc && acc[0]){
          try { localStorage.setItem(GD_DASH_WC_KEY, JSON.stringify(wc.session)); } catch (e) {}
          done(true, acc[0]);
        }
      });
      wc.on('disconnect', () => {
        try { localStorage.removeItem(GD_DASH_WC_KEY); } catch (e) {}
        gdShowPairFail('LUNCDash closed the WalletConnect session before an address came back \u2014 nothing connected. Tap CONNECT LUNCDASH to try again, or paste an address above just to look (read-only).');
        done(false);
      });
      if (wc.connected && cached && cached.accounts && cached.accounts[0]){
        try { localStorage.setItem(GD_DASH_WC_KEY, JSON.stringify(wc.session)); } catch (e) {}
        done(true, cached.accounts[0]);
        return;
      }
      if (wc.connected){ try { wc.killSession(); } catch (e) {} }
      wc.createSession().then(() => {
        const uri = wc.uri;
        if (!uri) throw new Error('no pairing URI');
        showDashPairBox(uri);
        gdKitHint(gdIsMobileUA
          ? 'Tap OPEN LUNCDASH below \u2014 the LUNCDash app opens with this connection; approve it there. If the app doesn\u2019t open, tap COPY LINK and paste it into LUNCDash\u2019s WalletConnect scanner.'
          : 'Scan the QR code with the LUNCDash app\u2019s WalletConnect scanner \u2014 or copy the pairing link into it. Approve in the app and your warriors load here.');
        wc.on('connect', (err, payload) => {
          if (err){ gdShowPairFail('LUNCDash declined the connection \u2014 nothing connected. Tap CONNECT LUNCDASH to try again, or paste an address above just to look (read-only).'); done(false); return; }
          const acc = (payload && payload.params && payload.params[0] && payload.params[0].accounts) || wc.accounts || [];
          if (!acc[0]){ gdShowPairFail('LUNCDash connected but returned no Terra Classic address \u2014 nothing connected. Paste an address above just to look (read-only).'); done(false); return; }
          try { localStorage.setItem(GD_DASH_WC_KEY, JSON.stringify(wc.session)); } catch (e) {}
          done(true, acc[0]);
        });
      }).catch(err => {
        gdShowPairFail("The LUNCDash WalletConnect bridge didn\u2019t answer" + (err && err.message ? ': ' + String(err.message).slice(0, 90) : '') + ' \u2014 nothing connected. Tap CONNECT LUNCDASH to try again, or paste an address above just to look (read-only).');
        done(false);
      });
    }).then(addr => addr ? gdKitApplyAddress(addr, 'luncdash') : false);
  }).catch(err => {
    gdDashBusy = false;
    gdShowPairFail("The WalletConnect library couldn\u2019t load" + (err && err.message ? ': ' + String(err.message).slice(0, 90) : '') + ' \u2014 nothing connected. Tap CONNECT LUNCDASH to try again, or paste an address above just to look (read-only).');
    return false;
  });
}
/* returning visit: if a LUNCDash session was approved earlier and
   is still cached, adopt its address quietly (the cosmes restore
   pattern \u2014 nothing loads when no session is cached). */
function gdLuncDashRestore(){
  if (typeof gdWalletVia !== 'undefined' && gdWalletVia) return;
  let cached = null;
  try { cached = JSON.parse(localStorage.getItem(GD_DASH_WC_KEY) || 'null'); } catch (e) {}
  if (!cached || !cached.accounts || !cached.accounts[0]) return;
  gdDashLoadLegacyClient().then(WC => {
    if (gdWalletVia) return;
    const wc = new WC({ bridge: 'https://walletconnect.luncdash.com', qrcode: false, session: cached });
    fa2DashWc = wc;
    if (wc.connected && wc.accounts && wc.accounts[0]) gdKitApplyAddress(wc.accounts[0], 'luncdash');
  }).catch(() => { /* a stale session restores nothing; the row still works */ });
}
/* ---- the chain definition: the LNC app's chainDef.js, verbatim
   (LCD/RPC inlined from its config.js — the publicnode endpoints).
   Columbus-5 is not in the upstream chain-registry package
   CosmosKit consumes, so the app ships its own Chain + AssetList.
   (Ported from LUNC Grand Prix, which ported it from the LNC app.) */
const TERRA_CLASSIC_CHAIN = {
  $schema: '../chain.schema.json',
  chain_name: 'terraclassic',
  status: 'live',
  network_type: 'mainnet',
  pretty_name: 'Terra Classic',
  chain_id: 'columbus-5',
  bech32_prefix: 'terra',
  daemon_name: 'terrad',
  node_home: '$HOME/.terra',
  slip44: 330,
  fees: {
    fee_tokens: [
      { denom: 'uluna', fixed_min_gas_price: 0.15, low_gas_price: 0.15, average_gas_price: 0.15, high_gas_price: 0.15 },
    ],
  },
  staking: { staking_tokens: [{ denom: 'uluna' }] },
  codebase: { git_repo: 'https://github.com/classic-terra/core', recommended_version: 'v4.1.1', compatible_versions: ['v4.1.1'] },
  apis: {
    rpc: [{ address: 'https://terra-classic-rpc.publicnode.com', provider: 'PublicNode' }],
    rest: [{ address: 'https://terra-classic-lcd.publicnode.com', provider: 'PublicNode' }],
    grpc: [],
  },
  explorers: [{ kind: 'Terra Finder', url: 'https://finder.terraclassic.community/mainnet', tx_page: 'https://finder.terraclassic.community/mainnet/tx/${txHash}' }],
};
const TERRA_CLASSIC_ASSETS = {
  $schema: '../assetlist.schema.json',
  chain_name: 'terraclassic',
  assets: [
    {
      description: 'The native staking and gas token of Terra Classic.',
      denom_units: [
        { denom: 'uluna', exponent: 0 },
        { denom: 'luna', exponent: 6 },
      ],
      base: 'uluna',
      name: 'Terra Luna Classic',
      display: 'luna',
      symbol: 'LUNC',
      logo_URIs: { png: 'https://raw.githubusercontent.com/cosmos/chain-registry/master/terraclassic/images/lunc.png' },
      coingecko_id: 'terra-luna',
    },
  ],
};

/* ---- the custom Galaxy Station WalletConnect wallet: the LNC
   app's wallets.js, ported near-verbatim (the base classes arrive
   with the lazily loaded @cosmos-kit/walletconnect bundle, so the
   classes are built by this factory at load time). Galaxy Station
   is not listed in the WalletConnect explorer registry, so no
   upstream CosmosKit package exists for it; in its in-app browser
   it injects window.station, covered by the Station entry — this
   entry adds the standard pairing flow for other browsers. */
/* Galaxy Station's genuine logo — the favicon its own site
   serves; the wallet info below carries it, and the wallet-select
   modal's Galaxy row shows the same art. */
const GALAXY_STATION_LOGO = 'https://station.terraclassic.community/favicon.svg';
function galaxyKitFrom(wc){
  /* Galaxy Station has no WalletConnect Explorer listing (no
     listing ID), so WCClient's Explorer lookup leaves wcCloudInfo
     undefined and initAppUrl() throws before it can fall back to
     the registry `mobile` links below — leaving redirect
     permanently false and the modal stuck on the QR view. Seed an
     empty wcCloudInfo so the fallback is reached (the same
     pattern @cosmos-kit/keplr-mobile uses). */
  class GalaxyClient extends wc.WCClient {
    async initWCCloudInfo() {
      this.wcCloudInfo = { mobile: {} };
    }
  }
  const galaxyStationInfo = {
    name: 'galaxy-station',
    prettyName: 'Galaxy Station',
    logo: GALAXY_STATION_LOGO,
    mode: 'wallet-connect',
    mobileDisabled: false,
    rejectMessage: {
      source: 'Request rejected',
    },
    downloads: [
      {
        link: 'https://station.terraclassic.community',
      },
    ],
    supportedChains: ['terraclassic'],
    walletconnect: {
      name: 'Galaxy Station',
      /* Galaxy Station returns base64-encoded pubkeys; with the
         client default ('hex') account decoding after approval
         would be wrong. */
      encoding: 'base64',
      mobile: {
        /* Real app links, proven in the FRG app — NOT the project
           website. Android goes through the Hexxagon intent link;
           iOS only answers to its native scheme (the HTTPS site
           just loads the web dashboard and strands the user). */
        native: {
          ios: 'galaxystation:',
          android: 'https://station.hexxagon.io/wcV2',
        },
      },
      /* Composes the pairing deep link from the native app URL +
         the WalletConnect URI, modeled on @cosmos-kit/keplr-mobile:
           iOS:     galaxystation://wcV2?<encoded wc uri>
           Android: https://station.hexxagon.io/wcV2?<encoded wc uri>
                    #Intent;package=io.hexxagon.station;scheme=galaxystation;end; */
      formatNativeUrl: (appUrl, wcUri, os, _name) => {
        const encodedWcUrl = encodeURIComponent(wcUri);
        switch (os) {
          case 'ios':
            return `galaxystation://wcV2?${encodedWcUrl}`;
          case 'android':
            return `${appUrl}?${encodedWcUrl}#Intent;package=io.hexxagon.station;scheme=galaxystation;end;`;
          default:
            return `galaxystation://wcV2?${encodedWcUrl}`;
        }
      },
    },
  };
  class ChainGalaxyStation extends wc.ChainWC {
    constructor(walletInfo, chainInfo) {
      super(walletInfo, chainInfo, GalaxyClient);
    }
  }
  class GalaxyStationWallet extends wc.WCWallet {
    constructor(walletInfo) {
      super(walletInfo, ChainGalaxyStation, GalaxyClient);
    }
  }
  return { GalaxyClient, ChainGalaxyStation, GalaxyStationWallet, galaxyStationInfo };
}

/* ---- the CosmosKit libraries, loaded lazily as ES modules from
   esm.sh (plain, non-bundled entry points — the ?bundle build of
   @cosmos-kit/keplr fails to resolve on esm.sh; the plain entries
   resolve their own dependency graph and were smoke-verified on
   2026-10-28). Nothing is fetched until a connect or a restore
   actually needs the stack, and a load failure is said out loud
   with the paste fallback left standing. The Buffer shim comes
   first (the LNC app's polyfills.js does the same): WCClient
   decodes account pubkeys with the global Buffer. */
const KIT_PROJECT_ID = '7e363f1ed5d676ecc4ae2d40c5b83fbf';   /* the Reown project id the owner's other apps use */
const KIT_CHAIN_NAME = 'terraclassic';   /* CosmosKit lookup key (chainDef chain_name) */
const GD_GAS_PRICE = 28.325;   /* uluna per gas unit (manager signer options only — this page never signs) */
const KIT_APP_URL = 'https://frg-fight-club.vercel.app/frog-fight/';
const KIT_URLS = {
  buffer: 'https://esm.sh/buffer@6.0.3?bundle',
  core: 'https://esm.sh/@cosmos-kit/core@2.18.1',
  keplr: 'https://esm.sh/@cosmos-kit/keplr@2.17.1',
  station: 'https://esm.sh/@cosmos-kit/station@2.15.1',
  walletconnect: 'https://esm.sh/@cosmos-kit/walletconnect@2.15.1',
  stargate: 'https://esm.sh/@cosmjs/stargate@0.33.1?bundle',
};
let kitTestHook = null;   /* headless hook only — { manager } or { libs } (or the libs themselves); never set in play */
let kitLibsCache = null;
let kitLibsPromise = null;
function kitHook(){
  if (kitTestHook) return kitTestHook;
  return null;
}
function normalizeKitLibs(libs){
  if (!libs || !libs.core || !libs.core.WalletManager || !libs.keplr || !libs.station || !libs.walletconnect)
    throw new Error('the CosmosKit libraries loaded incomplete');
  if (!libs.cosmjs || !libs.cosmjs.SigningStargateClient || !libs.cosmjs.GasPrice)
    throw new Error('the signing library loaded incomplete');
  const out = {
    core: libs.core, keplr: libs.keplr, station: libs.station, walletconnect: libs.walletconnect,
    cosmjs: libs.cosmjs, galaxy: galaxyKitFrom(libs.walletconnect),
    chain: TERRA_CLASSIC_CHAIN, assets: TERRA_CLASSIC_ASSETS,
  };
  kitLibsCache = out;
  return out;
}
function loadKitLibs(){
  if (kitLibsCache) return Promise.resolve(kitLibsCache);
  const hook = kitHook();
  const hookLibs = hook && (hook.libs || (hook.core ? hook : null));
  if (hookLibs)
    return Promise.resolve().then(() => (typeof hookLibs === 'function' ? hookLibs() : hookLibs))
      .then(raw => (raw && raw.galaxy) ? raw : normalizeGdKitLibs(raw));
  if (!kitLibsPromise){
    kitLibsPromise = Promise.resolve()
      .then(() => import(KIT_URLS.buffer))
      .then(bm => {
        if (typeof globalThis !== 'undefined' && !globalThis.Buffer && bm && bm.Buffer) globalThis.Buffer = bm.Buffer;
        if (typeof window !== 'undefined' && !window.global) window.global = window;
      })
      .then(() => Promise.all([import(KIT_URLS.core), import(KIT_URLS.keplr), import(KIT_URLS.station), import(KIT_URLS.walletconnect), import(KIT_URLS.stargate)]))
      .then(([core, keplr, station, walletconnect, stargate]) => normalizeKitLibs({
        core, keplr, station, walletconnect,
        cosmjs: { SigningStargateClient: stargate && stargate.SigningStargateClient, GasPrice: stargate && stargate.GasPrice },
      }))
      .catch(err => { kitLibsPromise = null; throw err; });
  }
  return kitLibsPromise;
}

/* ---- the WalletManager: the LNC app's ChainProvider wiring
   (wallets = keplr group + station group + the custom Galaxy
   wallet; the same sign-client options, with this game's name
   and URL; signer gas price at the game's buy rate — the
   reference sets signingCosmwasm only, the game adds
   signingStargate at the same price because its one signature is
   a stargate MsgSend). onMounted runs un-awaited: it initializes
   every WalletConnect client (network work) before it restores
   stored accounts, and a connect must not queue behind that — a
   chain wallet's own connect() initializes its client itself.
   The restore path awaits it under a ceiling instead. */
let kitManager = null;
let kitMountedPromise = null;
function kitNoopActions(){
  return { viewOpen(){}, viewWalletRepo(){}, data(){}, state(){}, message(){}, clientState(){}, clientMessage(){}, render(){} };
}
function ensureKitManager(){
  if (kitManager) return Promise.resolve(kitManager);
  const hook = kitHook();
  if (hook && hook.manager){
    kitManager = hook.manager;
    kitMountedPromise = Promise.resolve().then(() => (kitManager.onMounted ? kitManager.onMounted() : undefined)).catch(() => {});
    kitMountedPromise.then(() => { gdKitAdopt(); });
    return Promise.resolve(kitManager);
  }
  return loadKitLibs().then(kit => {
    const wallets = [...kit.keplr.wallets, ...kit.station.wallets,
      new kit.galaxy.GalaxyStationWallet(kit.galaxy.galaxyStationInfo)];
    const wm = new kit.core.WalletManager(
      [kit.chain], wallets, new kit.core.Logger('WARN'), false, true, undefined,
      [kit.assets], 'icns',
      { signClient: { projectId: KIT_PROJECT_ID, metadata: {
          name: 'Frog Fight', description: 'Frog Fight — boost wallet connect (buy + equip Frog Fight Boosts)', url: KIT_APP_URL, icons: [],
          redirect: { native: KIT_APP_URL, universal: KIT_APP_URL } } } },
      { signingCosmwasm: () => ({ gasPrice: kit.cosmjs.GasPrice.fromString(GD_GAS_PRICE + 'uluna') }),
        signingStargate: () => ({ gasPrice: kit.cosmjs.GasPrice.fromString(GD_GAS_PRICE + 'uluna') }) },
      undefined, undefined);
    try {
      const acts = kitNoopActions();
      wm.setActions(acts);
      (wm.walletRepos || []).forEach(repo => {
        if (repo.setActions) repo.setActions(acts);
        (repo.wallets || []).forEach(w => { if (w.setActions) w.setActions(acts); });
      });
      (wm.mainWallets || []).forEach(w => { if (w.setActions) w.setActions(acts); });
    } catch (e) {}
    kitManager = wm;
    kitMountedPromise = Promise.resolve().then(() => wm.onMounted()).catch(() => {});
    /* backstop: when the mount (and its stored-account restore)
       finishes — whenever that is — adopt whatever it found */
    kitMountedPromise.then(() => { gdKitAdopt(); });
    return wm;
  });
}

/* while a WalletConnect pairing waits, the client holds the
   pairing URI (client.qrUrl). On a phone the client redirects
   into the wallet app itself (client.redirect) and no box is
   needed; anywhere else the box offers the raw link for the
   wallet's own WalletConnect scanner — the honest desktop path
   now that the generic modal is gone. */
function watchPairing(cw, pretty){
  let stopped = false, timer = null;
  const tick = () => {
    if (stopped) return;
    try {
      const client = cw.client;
      const uri = client && client.qrUrl && client.qrUrl.data;
      if (uri && !(client && client.redirect)){
        showPairBox(uri);
        gdKitHint('Approve the connection in ' + pretty + ' — or paste the pairing link shown in MY GARUDA into its WalletConnect scanner.');
      }
    } catch (e) {}
    if (!stopped) timer = setTimeout(tick, 500);
  };
  timer = setTimeout(tick, 600);
  return { stop(){ stopped = true; if (timer) clearTimeout(timer); } };
}

/* ---- connect ---- */
function injectedKeplr(){ try { return (typeof window !== 'undefined' && window.keplr) || null; } catch (e) { return null; } }
function injectedStation(){ try { return (typeof window !== 'undefined' && window.station) || null; } catch (e) { return null; } }
const KIT_ENTRIES = [
  { id: 'keplr', label: 'Keplr', resolve(){ return injectedKeplr() ? 'keplr-extension' : 'keplr-mobile'; } },
  { id: 'galaxy', label: 'Galaxy Station', resolve(){ return 'galaxy-station'; } },
  { id: 'station', label: 'LUNCDash', resolve(){ return injectedStation() ? 'station-extension' : null; } },
];
function kitEntry(id){ for (const e of KIT_ENTRIES) if (e.id === id) return e; return null; }
function kitFailLine(cw, pretty){
  if (cw && cw.isWalletNotExist)
    return pretty + " isn't available in this browser — open this page inside the " + pretty + ' app, or pick another wallet. You can also paste an address above just to look (read-only).';
  if (cw && cw.isWalletRejected)
    return 'Connection rejected in ' + pretty + ' — nothing connected. Tap its connect button to try again, or paste an address above just to look (read-only).';
  const msg = cw && cw.message ? String(cw.message) : '';
  return pretty + " couldn't connect" + (msg ? ': ' + msg.slice(0, 90) : '') + ' — nothing connected. Tap its connect button to try again, or paste an address above just to look (read-only).';
}
let kitConnecting = '';
function kitConnect(entryId, opts){
  const quiet = !!(opts && opts.quiet);
  const entry = kitEntry(entryId);
  if (!entry || kitConnecting) return Promise.resolve(false);
  const walletName = entry.resolve();
  if (!walletName){
    if (entryId === 'station' && !quiet && typeof gdLuncDashConnect === 'function')
      return gdLuncDashConnect();
    if (!quiet)
      gdShowPairFail(entry.label + ' only connects inside the ' + entry.label + " app's own browser — open this page there, or pick another wallet. You can also paste an address above just to look (read-only).");
    return Promise.resolve(false);
  }
  kitConnecting = entryId;
  /* (no wallet-picker modal in Garuda Dash 2014 the panel rows ARE the picker) */
  if (!quiet) gdKitHint('Opening ' + entry.label + '…');
  return ensureKitManager()
    .then(wm => {
      const cw = wm.getChainWallet(KIT_CHAIN_NAME, walletName);
      if (!cw) throw new Error('the ' + entry.label + ' wallet is not registered');
      const pretty = cw.walletPrettyName || entry.label;
      if (!quiet) gdKitHint('Approve the connection in ' + pretty + ' — then come back to the game…');
      const watch = watchPairing(cw, pretty);
      return Promise.resolve().then(() => cw.connect())
        .then(() => { watch.stop(); return { cw, pretty }; })
        .catch(err => { watch.stop(); throw err; });
    })
    .then(({ cw, pretty }) => {
      kitConnecting = '';
      hidePairBox();
      if (cw.isWalletConnected && cw.address){
        kitChainWallet = cw; kitWalletName = walletName; kitPrettyName = pretty;
        return gdKitApplyAddress(cw.address, entryId);
      }
      if (!quiet) gdShowPairFail(kitFailLine(cw, pretty));
      return false;
    })
    .catch(err => {
      kitConnecting = '';
      hidePairBox();
      console.log('[gd-nft] ' + entry.label + ' connect failed: ' + (err && err.message));
      if (!quiet)
        gdShowPairFail(entry.label + " couldn't connect" + (err && err.message ? ': ' + String(err.message).slice(0, 90) : '') + ' — nothing connected. Tap its connect button to try again, or paste an address above just to look (read-only).');
      return false;
    });
}
/* DISCONNECT tears the CosmosKit session down too (best effort —
   exported for the page glue; the panel itself has no disconnect
   button, matching the Keplr row's behavior). */
function kitDisconnect(){
  const cw = kitChainWallet;
  kitChainWallet = null; kitWalletName = ''; kitPrettyName = '';
  if (cw && typeof cw.disconnect === 'function')
    return Promise.resolve().then(() => cw.disconnect()).catch(() => {});
  return Promise.resolve();
}

/* ---- session restore: on load and on pageshow, adopt a live
   CosmosKit session silently. Detection first: CosmosKit keeps
   the current wallet under its own localStorage key (and the WC
   sign clients theirs under wc@2:*) — with neither present and
   no test hook injected there is nothing to restore and the
   stack is not even loaded. */
const KIT_WALLET_NAMES = ['keplr-extension', 'keplr-mobile', 'station-extension', 'galaxy-station'];
function kitHasStoredState(){
  try {
    if (localStorage.getItem('cosmos-kit@2:core//current-wallet')) return true;
  } catch (e) {}
  try {
    if (typeof localStorage.key === 'function' && typeof localStorage.length === 'number'){
      for (let i = 0; i < localStorage.length; i++){
        const k = localStorage.key(i);
        if (k && (k.indexOf('wc@2:') === 0 || k.indexOf('cosmos-kit@2:') === 0)) return true;
      }
    }
  } catch (e) {}
  return false;
}
function kitScanAdopt(){
  if (!kitManager || gdWalletVia) return false;
  for (const name of KIT_WALLET_NAMES){
    let cw = null;
    try { cw = kitManager.getChainWallet(KIT_CHAIN_NAME, name); } catch (e) {}
    if (cw && cw.isWalletConnected && cw.address && gdValidAddr(cw.address)){
      kitChainWallet = cw; kitWalletName = name; kitPrettyName = cw.walletPrettyName || name;
      gdKitApplyAddress(cw.address, name === 'galaxy-station' ? 'galaxy' : 'station');
      return true;
    }
  }
  return false;
}
let kitAdopting = false;
function kitRestoreSession(){
  if (kitAdopting) return Promise.resolve(false);
  if (gdWalletVia) return Promise.resolve(true);
  if (!kitHook() && !kitHasStoredState()) return Promise.resolve(false);
  kitAdopting = true;
  return ensureKitManager()
    .then(() => Promise.race([kitMountedPromise || Promise.resolve(), new Promise(r => setTimeout(r, 6000))]))
    .then(() => kitScanAdopt())
    .catch(err => { console.log('[gd-nft] CosmosKit restore skipped: ' + (err && err.message)); return false; })
    .then(ok => { kitAdopting = false; return ok; });
}
/* boot: restore first; with a stored address inside a wallet's own
   browser, quietly upgrade the read-only restore to a live session
   with that wallet (the behavior the injected-Keplr boot had). */
function kitBootFlow(){
  return kitRestoreSession().then(() => {
    if (gdWalletVia || !gdWallet || gdWalletConnected) return;
    if (injectedStation()) kitConnect('station', { quiet: true });
  });
}
/* coming back to the page re-runs the stored-session check — the
   return path matters: approving in the wallet app backgrounds
   this page, and the session can land in CosmosKit's store while
   this page's own connect promise never resolves */
if (typeof window !== 'undefined' && typeof window.addEventListener === 'function')
  window.addEventListener('pageshow', () => { kitRestoreSession(); });
if (typeof document !== 'undefined' && typeof document.addEventListener === 'function')
  document.addEventListener('visibilitychange', () => {
    const vis = document.visibilityState ? document.visibilityState === 'visible' : !document.hidden;
    if (vis) kitRestoreSession();
  });


/* boot the stored-session restore for the two new rows (no-op
   without stored WC state — see kitRestoreSession). */
try { kitBootFlow(); } catch (e) {}
try { gdLuncDashRestore(); } catch (e) {}


/* ================= FA2 — LUNC send (Garuda DEX pattern) =================
   Keplr / Galaxy: the chain wallet's offline signer +
   SigningStargateClient with the house gas price and an 'auto'
   fee (the factory-proven combination — simulation on Terra
   Classic accounts for the burn tax). LUNCDash: an amino signer
   over the retained WalletConnect connector (terra_signAmino),
   an explicit fee of gas + the LCD-read burn tax, then broadcast
   — the DEX's __dexDashSign flow. */
async function fa2TaxUluna(amountUluna) {
  try {
    const [rateJ, capJ] = await Promise.all([
      fetch(GD_LCD + '/terra/treasury/v1beta1/tax_rate').then(r => r.json()),
      fetch(GD_LCD + '/terra/treasury/v1beta1/tax_caps/uluna').then(r => r.json()),
    ]);
    const rate = parseFloat(rateJ && rateJ.tax_rate) || 0;
    const cap = BigInt(String((capJ && capJ.tax_cap) || '0'));
    let tax = BigInt(Math.ceil(Number(amountUluna) * rate));
    if (cap > 0n && tax > cap) tax = cap;
    return tax;
  } catch (e) { return 0n; }
}
async function fa2SendLunc(toAddress, ulunaAmount, memo) {
  if (!gdWalletConnected || !gdWallet) throw new Error('Connect your wallet first.');
  const libs = await loadKitLibs();
  const gasPrice = libs.cosmjs.GasPrice.fromString(GD_GAS_PRICE + 'uluna');
  const coins = [{ denom: 'uluna', amount: String(ulunaAmount) }];
  if (gdWalletVia === 'luncdash' || gdWalletVia === 'station' && !kitChainWallet) {
    const wc = fa2DashWc;
    if (!wc || !wc.connected) throw new Error('LUNCDash session is not live — tap CONNECT LUNCDASH again.');
    const accJ = await fetch(GD_LCD + '/cosmos/auth/v1beta1/accounts/' + gdWallet).then(r => r.json()).catch(() => null);
    const pubKey = accJ && accJ.account && accJ.account.pub_key;
    if (!pubKey || !pubKey.key) throw new Error('This wallet has no on-chain account yet — it needs a first transaction before it can pay.');
    const dashSigner = {
      getAccounts: async () => [{ address: gdWallet, algo: 'secp256k1', pubkey: Uint8Array.from(atob(pubKey.key), c => c.charCodeAt(0)) }],
      signAmino: async (signerAddress, signDoc) => {
        if (signerAddress !== gdWallet) throw new Error('LUNCDash signer address mismatch.');
        if (/Android|iPhone|iPad/i.test(navigator.userAgent)) { try { window.location.href = gdLuncDashOpenHref(); } catch (e) {} }
        const res = await Promise.race([
          wc.sendCustomRequest({ id: Math.floor(Math.random() * 1e9), jsonrpc: '2.0', method: 'terra_signAmino', params: [signDoc] }),
          new Promise((_, rej) => setTimeout(() => rej(new Error('LUNCDash sign timed out after 120 seconds — nothing was sent.')), 120000)),
        ]);
        const r0 = Array.isArray(res) ? res[0] : res;
        if (!r0 || !r0.signed || !r0.signature) throw new Error('LUNCDash did not return a signature — nothing was sent.');
        return { signed: r0.signed, signature: r0.signature };
      },
    };
    const tax = await fa2TaxUluna(BigInt(ulunaAmount));
    const gasFee = BigInt(Math.ceil(400000 * GD_GAS_PRICE));
    const fee = { amount: [{ denom: 'uluna', amount: (gasFee + tax).toString() }], gas: '400000' };
    const msg = { typeUrl: '/cosmos.bank.v1beta1.MsgSend', value: { fromAddress: gdWallet, toAddress, amount: coins } };
    const signing = await libs.cosmjs.SigningStargateClient.connectWithSigner(GD_RPC, dashSigner, { gasPrice });
    const delivered = await signing.signAndBroadcast(gdWallet, [msg], fee, memo || '');
    if (delivered.code) throw new Error('Payment failed on-chain (code ' + delivered.code + ').');
    return { transactionHash: delivered.transactionHash };
  }
  let signer = null;
  if (gdWalletVia === 'keplr') {
    if (!window.keplr) throw new Error('Keplr is not available in this browser.');
    await window.keplr.enable(GD_CHAIN_ID);
    signer = window.keplr.getOfflineSigner(GD_CHAIN_ID);
  } else if (kitChainWallet) {
    const cw = kitChainWallet;
    if (typeof cw.initOfflineSigner === 'function') { try { await cw.initOfflineSigner('direct'); } catch (e) {} }
    signer = cw.offlineSigner || (cw.client && typeof cw.client.getOfflineSigner === 'function' ? await cw.client.getOfflineSigner(GD_CHAIN_ID) : null);
    if (!signer) throw new Error('This wallet cannot sign here — try Keplr or LUNCDash.');
  }
  if (!signer) throw new Error('No signer available — connect Keplr, Galaxy Station or LUNCDash.');
  const client = await libs.cosmjs.SigningStargateClient.connectWithSigner(GD_RPC, signer, { gasPrice });
  const result = await client.sendTokens(gdWallet, toAddress, coins, 'auto', memo || '');
  if (result.code) throw new Error('Payment failed on-chain (code ' + result.code + ').');
  return { transactionHash: result.transactionHash };
}

/* ---- panel wiring (FFB boost panel ids) ---- */
$('nftConnectBtn').onclick = gdConnectKeplr;
{ const gb = $('nftGalaxyBtn'); if (gb) gb.onclick = () => kitConnect('galaxy'); }
{ const db = $('nftDashRowBtn'); if (db) db.onclick = () => gdLuncDashConnect(); }
$('nftViewBtn').onclick = () => {
  const a = $('nftAddrInput').value.trim();
  if (!/^terra1[0-9a-z]{38}$/.test(a)) { $('nftStatus').textContent = 'That does not look like a Terra Classic address (terra1…).'; return; }
  try { localStorage.setItem('frogFightViewAddr', a); } catch (e) {}
  gdApplyWallet(a, false);
};
try {
  const savedAddr = localStorage.getItem('frogFightViewAddr');
  if (savedAddr && /^terra1[0-9a-z]{38}$/.test(savedAddr)) {
    $('nftAddrInput').value = savedAddr;
    gdApplyWallet(savedAddr, false);
  }
} catch (e) {}

/* bridge for the game glue (blk2 boot): wallet state + send +
   owned fighters, without the glue touching the copied stack. */
window.__ffwallet = {
  contracts: { ffb: FFB_NFT_CONTRACT, ffbp: FFBP_NFT_CONTRACT },
  goliath: FA2_GOLIATH,
  state: () => ({ addr: gdWallet, connected: gdWalletConnected, via: gdWalletVia, owned: gdOwned }),
  sendLunc: fa2SendLunc,
  refresh: () => { if (gdWallet) return gdApplyWallet(gdWallet, gdWalletConnected, gdWalletVia); },
  renderGrid: () => gdRenderPanel(),
};
