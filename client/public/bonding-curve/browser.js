/* Browser layer for the launchpad. Loaded after app.js. All pure logic
 * (math, builders, guard) lives in app.js / window.Launchpad; this file
 * is chain IO + DOM only.
 */
(function () {
  "use strict";
  const L = window.Launchpad;
  const CFG = L.CONFIG;
  const $ = (id) => document.getElementById(id);
  const state = {
    address: null,
    signingClient: null,
    factoryCfg: null,
    launches: [], // enriched launch records
    token: null, // current token view record
    tradeSide: "buy",
  };

  /* ----------------------------- LCD reads ----------------------------- */
  async function lcd(path) {
    const r = await fetch(CFG.LCD + path);
    if (!r.ok) throw new Error("LCD " + r.status);
    return r.json();
  }
  async function queryContract(addr, msg) {
    const b64 = L ? btoa(JSON.stringify(msg)) : "";
    const j = await lcd(
      `/cosmwasm/wasm/v1/contract/${addr}/smart/${encodeURIComponent(b64)}`
    );
    return j.data;
  }
  async function bankBalance(addr, denom) {
    try {
      const j = await lcd(
        `/cosmos/bank/v1beta1/balances/${addr}/by_denom?denom=${denom}`
      );
      return BigInt(j.balance?.amount ?? "0");
    } catch {
      return 0n;
    }
  }
  const fmtTok = (base, dec = 6) =>
    (Number(BigInt(base)) / 10 ** dec).toLocaleString("en-US", {
      maximumFractionDigits: 4,
    });
  const fmtPrice = (scaled) => {
    // scaled = uluna per token base unit * 1e18. LUNC per whole token
    // equals uluna per base unit (the 1e6 factors cancel), so this is
    // just scaled / 1e18.
    return (Number(BigInt(scaled)) / 1e18).toFixed(8);
  };

  /* ----------------------------- Wallet ----------------------------- */
  async function connectKeplr() {
    if (!window.keplr) throw new Error("Keplr not found in this browser.");
    await window.keplr.enable(CFG.CHAIN_ID);
    const key = await window.keplr.getKey(CFG.CHAIN_ID);
    state.address = key.bech32Address;
    const [{ SigningCosmWasmClient }, { GasPrice }] = await Promise.all([
      import("https://esm.sh/@cosmjs/cosmwasm-stargate@0.33.0"),
      import("https://esm.sh/@cosmjs/stargate@0.33.0"),
    ]);
    const signer = window.getOfflineSigner(CFG.CHAIN_ID);
    state.signingClient = await SigningCosmWasmClient.connectWithSigner(
      "https://terra-classic-rpc.publicnode.com",
      signer,
      { gasPrice: GasPrice.fromString("0.015uluna") }
    );
    onWalletChanged();
  }

  function onWalletChanged() {
    $("walletBtn").textContent = state.address
      ? state.address.slice(0, 10) + "…" + state.address.slice(-4)
      : "Connect wallet";
    refreshVisible();
  }

  /** Guard + confirm + sign. intent.kind must be a guard kind. */
  async function guardedSend(contractAddr, msgJson, funds, intent) {
    const check = L.guardCheck(intent, msgJson);
    if (!check.ok) {
      alert("Pre-sign guard blocked this transaction: " + check.reason);
      return null;
    }
    const ok = await confirmModal(check.summary, msgJson, funds);
    if (!ok) return null;
    if (!state.signingClient) throw new Error("Connect a wallet first.");
    const res = await state.signingClient.execute(
      state.address,
      contractAddr,
      msgJson,
      "auto",
      "",
      (funds || []).map((f) => ({ denom: f.denom, amount: String(f.amount) }))
    );
    if (res.code !== 0) throw new Error("tx failed: " + (res.rawLog || res.code));
    return res.transactionHash;
  }

  function confirmModal(summary, msgJson, funds) {
    return new Promise((resolve) => {
      $("modalSummary").textContent = summary;
      $("modalMsg").textContent =
        JSON.stringify(msgJson, null, 2) +
        (funds && funds.length
          ? `\n\nFunds: ${funds.map((f) => `${f.amount} ${f.denom}`).join(", ")}`
          : "\n\nFunds: none");
      $("modal").classList.remove("hidden");
      $("modalCancel").onclick = () => {
        $("modal").classList.add("hidden");
        resolve(false);
      };
      $("modalOk").onclick = () => {
        $("modal").classList.add("hidden");
        resolve(true);
      };
    });
  }

  /* ----------------------------- Views ----------------------------- */
  function showView(name) {
    for (const v of ["launches", "create", "token"]) {
      $("view-" + v).classList.toggle("hidden", v !== name);
      $("tab-" + v).classList.toggle("active", v !== name);
    }
    if (name === "launches") loadLaunches();
    if (name === "token" && state.token) renderToken();
  }
  function refreshVisible() {
    if (!$("view-token").classList.contains("hidden") && state.token) renderToken();
  }

  async function loadFactoryCfg() {
    if (!CFG.FACTORY_ADDRESS) return null;
    state.factoryCfg = await queryContract(CFG.FACTORY_ADDRESS, { config: {} });
    return state.factoryCfg;
  }

  async function loadLaunches() {
    const list = $("launchList");
    if (!CFG.FACTORY_ADDRESS) {
      list.innerHTML =
        '<p class="note">TEST / UNRELEASED — factory not deployed yet. Set FACTORY_ADDRESS in app.js config on launch day.</p>';
      return;
    }
    await loadFactoryCfg();
    const res = await queryContract(CFG.FACTORY_ADDRESS, {
      launches: { start_after: null, limit: 30 },
    });
    const enriched = [];
    for (const l of res.launches) {
      // The factory nests the launch's selections under `params`; flatten
      // them onto the record so every view can read name/symbol/curve
      // fields directly.
      const flat = { ...l, ...(l.params || {}) };
      try {
        const [st, info] = await Promise.all([
          queryContract(l.curve, { state: {} }),
          queryContract(l.token, { token_info: {} }),
        ]);
        enriched.push({ ...flat, state: st, info });
      } catch {
        enriched.push({ ...flat, state: null, info: null });
      }
    }
    state.launches = enriched;
    renderLaunches();
  }

  // The curve state carries graduation as a selection object
  // ({ dex_target: { target_reserve } } or { none: {} }), not a flat
  // field — derive the target (uluna string) or null.
  // Quote responses carry fee_total / fee_platform / fee_creator; the
  // share that stays in the reserve is the remainder — there is no
  // fee_treasury field in the contract's response.
  function feeTreasury(q) {
    return (
      BigInt(q.fee_total) - BigInt(q.fee_platform) - BigInt(q.fee_creator)
    ).toString();
  }

  function gradTarget(st) {
    return st?.graduation?.dex_target?.target_reserve ?? null;
  }

  function renderLaunches() {
    const q = $("searchBox").value.trim().toLowerCase();
    const sort = $("sortSel").value;
    const fType = $("filterType").value;
    const fPace = $("filterPace").value;
    let rows = state.launches.filter((l) => {
      if (q && !(l.name.toLowerCase().includes(q) || l.symbol.toLowerCase().includes(q)))
        return false;
      if (fType && l.curve_type !== fType) return false;
      if (fPace && l.climb_pace !== fPace) return false;
      return true;
    });
    rows.sort((a, b) => {
      if (sort === "newest") return b.id - a.id;
      if (sort === "climbing")
        return (b.state?.progress_bps ?? 0) - (a.state?.progress_bps ?? 0);
      if (sort === "nearest") {
        const dist = (l) => {
          const t = gradTarget(l.state);
          if (!t) return Number.MAX_SAFE_INTEGER;
          return Number(BigInt(t) - BigInt(l.state.reserve));
        };
        return dist(a) - dist(b);
      }
      return 0;
    });
    if (!rows.length) {
      $("launchList").innerHTML = state.launches.length
        ? `<div class="empty"><b>No launches match.</b><br/>Try a different search, or clear the curve / pace filters.</div>`
        : `<div class="empty"><b>No launches yet.</b><br/>Be the first — tap <b>Create</b> above to launch a token on a curve.</div>`;
      return;
    }
    $("launchList").innerHTML = rows
      .map((l) => {
        const st = l.state;
        const pct = st ? (st.progress_bps / 100).toFixed(1) : "—";
        const target = gradTarget(st);
        return `<article class="card launch-card" data-curve="${l.curve}">
          <h3>${escapeHtml(l.name)} <span class="sym">$${escapeHtml(l.symbol)}</span></h3>
          <div class="badges">
            <span class="badge">${l.curve_type === "sigmoid" ? "Sigmoid" : "Constant product"}</span>
            <span class="badge">${l.climb_pace}</span>
            <span class="badge">fee ${(l.fee_bps / 100).toFixed(2)}%</span>
            ${l.creator_allocation_bps > 0 ? `<span class="badge warn">creator ${l.creator_allocation_bps / 100}% (vested)</span>` : `<span class="badge ok">fair launch</span>`}
            <span class="badge">${l.status}</span>
          </div>
          ${st ? `<div class="progress"><div style="width:${pct}%"></div></div>
          <p class="note">${pct}% sold · reserve ${fmtTok(st.reserve)} LUNC${target ? ` · target ${fmtTok(target)} LUNC` : ""}</p>` : ""}
          <button class="openBtn">Open</button>
        </article>`;
      })
      .join("");
    document.querySelectorAll(".launch-card .openBtn").forEach((btn) => {
      btn.onclick = () => {
        const curve = btn.closest(".launch-card").dataset.curve;
        const rec = state.launches.find((x) => x.curve === curve);
        state.token = rec;
        showView("token");
      };
    });
  }

  /* --------------------------- Create form --------------------------- */
  function readCreateForm() {
    const supplyWhole = $("cSupply").value.replace(/[^0-9.]/g, "");
    const gradSel = document.querySelector('input[name="grad"]:checked').value;
    const target = $("cGradTarget").value;
    const allocBps = Math.round(parseFloat($("cAlloc").value) * 100);
    const snipeCap = $("cSnipeCap").value;
    return {
      name: $("cName").value.trim(),
      symbol: $("cSymbol").value.trim().toUpperCase(),
      totalSupply: (
        BigInt(Math.round(parseFloat(supplyWhole || "0") * 1e6)) * 1n
      ).toString(),
      curveType: document.querySelector('input[name="ctype"]:checked').value,
      climbPace: L.paceFromSlider(parseInt($("cPace").value, 10)),
      feeBps: parseInt($("cFee").value, 10),
      graduation:
        gradSel === "dex"
          ? {
              dex_target: {
                target_reserve: (
                  BigInt(Math.round(parseFloat(target || "0") * 1e6))
                ).toString(),
              },
            }
          : "none",
      maxBuyUluna: $("cMaxBuy").value
        ? BigInt(Math.round(parseFloat($("cMaxBuy").value) * 1e6)).toString()
        : null,
      creatorAllocationBps: allocBps,
      creatorVestingSeconds: allocBps > 0 ? parseInt($("cVesting").value, 10) * 86400 : 0,
      snipeWindowBlocks: $("cSnipeBlocks").value
        ? parseInt($("cSnipeBlocks").value, 10)
        : null,
      snipeMaxBuyUluna: snipeCap
        ? BigInt(Math.round(parseFloat(snipeCap) * 1e6)).toString()
        : null,
    };
  }

  function drawCreateChart() {
    const f = readCreateForm();
    const cfg = state.factoryCfg;
    const saleSupply = (
      (BigInt(f.totalSupply || "0") * 80n) / 100n
    ).toString();
    let math;
    try {
      math = L.makeCurveMath({
        curveType: f.curveType,
        pace: f.climbPace,
        saleSupply,
        cpBaseVirtualReserve: cfg?.cp_base_virtual_reserve ?? "30000000000",
        sigmoidBaseTotalCost: cfg?.sigmoid_base_total_cost ?? "400000000000",
      });
    } catch {
      return;
    }
    $("paceLabel").textContent =
      f.climbPace.toUpperCase() +
      " tier (slider " +
      $("cPace").value +
      ", capacity ×" +
      L.sliderToMultiplier(parseInt($("cPace").value, 10)).toFixed(2) +
      " → snapped)";
    $("allocLabel").textContent =
      $("cAlloc").value + "% creator allocation" +
      (parseFloat($("cAlloc").value) > 0 ? " — time-locked in the contract" : " — fair launch");
    $("createChart").innerHTML = chartSvg(math, null);
  }

  function chartSvg(math, markerX) {
    const W = 320, H = 160, PAD = 8;
    const pts = [];
    let maxY = 0n;
    const spots = [];
    for (let i = 0; i <= 40; i++) {
      const x = (math.saleSupply * BigInt(i)) / 40n;
      let y;
      try {
        y = math.spot(x);
      } catch {
        y = spots.length ? spots[spots.length - 1] * 2n : 1n;
      }
      spots.push(y);
      if (y > maxY) maxY = y;
    }
    for (let i = 0; i <= 40; i++) {
      const px = PAD + (i / 40) * (W - 2 * PAD);
      const py = H - PAD - Number((spots[i] * 10000n) / (maxY || 1n)) / 10000 * (H - 2 * PAD);
      pts.push(`${px.toFixed(1)},${py.toFixed(1)}`);
    }
    let marker = "";
    if (markerX !== null && markerX !== undefined) {
      const mx = PAD + (Number(markerX) / 100) * (W - 2 * PAD);
      marker = `<line x1="${mx}" y1="${PAD}" x2="${mx}" y2="${H - PAD}" stroke="#f5b942" stroke-width="2"/>`;
    }
    return `<svg viewBox="0 0 ${W} ${H}" class="chart"><polyline points="${pts.join(" ")}" fill="none" stroke="#37d67a" stroke-width="2"/>${marker}</svg>`;
  }

  async function submitCreate() {
    if (!state.address) return alert("Connect a wallet first.");
    const f = readCreateForm();
    if (!f.name || !f.symbol || f.totalSupply === "0")
      return alert("Name, symbol and supply are required.");
    const msg = L.buildCreateLaunchMsg(f);
    const fee = state.factoryCfg?.listing_fee_uluna ?? "0";
    const hash = await guardedSend(
      CFG.FACTORY_ADDRESS,
      msg,
      fee !== "0" ? [{ denom: "uluna", amount: fee }] : [],
      { kind: "create_launch", params: f }
    );
    if (hash) {
      $("createResult").innerHTML =
        `Launch created. <a href="${CFG.FINDER}/tx/${hash}" target="_blank" rel="noopener">View tx</a>`;
      loadLaunches();
    }
  }

  /* ---------------------------- Token view ---------------------------- */
  async function renderToken() {
    const rec = state.token;
    if (!rec) return;
    const st = await queryContract(rec.curve, { state: {} }).catch(() => rec.state);
    const cfg = await queryContract(rec.curve, { config: {} }).catch(() => null);
    rec.state = st;
    rec.config = cfg;
    $("tTitle").textContent = `${rec.name} ($${rec.symbol})`;
    $("tStatus").textContent = st ? st.status : "";
    if (!st) return;
    const pct = st.progress_bps / 100;
    $("tProgress").style.width = pct + "%";
    const target = gradTarget(st);
    $("tProgressText").textContent = target
      ? `Graduation: ${fmtTok(st.reserve)} / ${fmtTok(target)} LUNC (${pct.toFixed(1)}% sold)`
      : `${pct.toFixed(1)}% of the curve sold · reserve ${fmtTok(st.reserve)} LUNC`;
    $("tPrice").textContent = `Price now: ${fmtPrice(st.spot_price_scaled)} LUNC`;
    $("tCreatorFees").textContent = `Creator fees earned (all time): ${fmtTok(st.creator_fees_earned_total)} LUNC · unclaimed: ${fmtTok(st.creator_fees_accrued)} LUNC`;
    $("tAlloc").textContent =
      BigInt(st.creator_alloc_remaining) > 0n
        ? `Creator allocation locked: ${fmtTok(st.creator_alloc_remaining)} ${rec.symbol} — vests ${new Date(st.creator_vesting_time).toLocaleString()}`
        : st.creator_fees_earned_total !== undefined && rec.creator_allocation_bps > 0
          ? "Creator allocation fully claimed."
          : "Fair launch — no creator allocation.";
    // Chart with landing marker from current slider position.
    await drawTokenChart(rec, st);
    await refreshQuote(rec, st);
    loadHolders(rec);
    loadTrades(rec);
    renderRolePanels(rec, st, cfg);
  }

  function tokenMath(rec, st) {
    // Preview math anchored on the curve's own live state: use the
    // contract's spot + shape constants from config when present.
    const cfg = state.factoryCfg;
    return L.makeCurveMath({
      curveType: rec.curve_type,
      pace: rec.climb_pace,
      saleSupply: st.sale_supply,
      cpBaseVirtualReserve: cfg?.cp_base_virtual_reserve ?? "30000000000",
      sigmoidBaseTotalCost: cfg?.sigmoid_base_total_cost ?? "400000000000",
    });
  }

  async function drawTokenChart(rec, st) {
    const math = tokenMath(rec, st);
    const soldPct = Number(
      (BigInt(st.sold) * 100n) / (BigInt(st.sale_supply) || 1n)
    );
    const sliderPct = parseInt($("amtSlider").value, 10);
    // Landing marker: sold fraction after the previewed trade.
    let marker = soldPct;
    if (state.preview) {
      const delta =
        state.tradeSide === "buy"
          ? Number((BigInt(state.preview.tokens || "0") * 100n) / BigInt(st.sale_supply))
          : -Number((BigInt(state.preview.sellTokens || "0") * 100n) / BigInt(st.sale_supply));
      marker = Math.max(0, Math.min(100, soldPct + delta));
    }
    void sliderPct;
    $("tChart").innerHTML = chartSvg(math, marker);
  }

  async function refreshQuote(rec, st) {
    if (!state.address && state.tradeSide === "sell") {
      $("bagQuote").textContent = "Connect a wallet to see your position.";
    }
    const pct = parseInt($("amtSlider").value, 10);
    $("amtPct").textContent = pct + "%";
    try {
      if (state.tradeSide === "buy") {
        const bal = state.address ? await bankBalance(state.address, "uluna") : 0n;
        const spend = (bal * BigInt(pct)) / 100n;
        $("amtReadout").textContent = `Spending ${fmtTok(spend.toString())} LUNC`;
        if (spend === 0n) return void (state.preview = null);
        const q = await queryContract(rec.curve, {
          quote_buy: { gross_in: spend.toString() },
        });
        state.preview = { tokens: q.tokens_out, quote: q, spend };
        const spot = BigInt(st.spot_price_scaled);
        const avg = (BigInt(q.net_in) * L.SCALE) / BigInt(q.tokens_out || "1");
        const impact = spot > 0n ? Number(((avg - spot) * 10000n) / spot) / 100 : 0;
        $("quoteBox").innerHTML =
          `You receive ≈ <b>${fmtTok(q.tokens_out)} ${rec.symbol}</b><br>` +
          `Fee ${fmtTok(q.fee_total)} LUNC — platform ${fmtTok(q.fee_platform)} · creator ${fmtTok(q.fee_creator)} · stays in reserve ${fmtTok(feeTreasury(q))}<br>` +
          `Avg price ${fmtPrice(avg.toString())} LUNC · price impact ${impact.toFixed(2)}%`;
      } else {
        const bal = state.address
          ? BigInt(
              (
                await queryContract(rec.token, {
                  balance: { address: state.address },
                })
              ).balance
            )
          : 0n;
        const sellAmt = (bal * BigInt(pct)) / 100n;
        $("amtReadout").textContent = `Selling ${fmtTok(sellAmt.toString())} ${rec.symbol}`;
        $("bagQuote").textContent =
          bal > 0n
            ? await bagLine(rec, bal)
            : "You hold none of this token.";
        if (sellAmt === 0n) return void (state.preview = null);
        const q = await queryContract(rec.curve, {
          quote_sell: { tokens_in: sellAmt.toString() },
        });
        state.preview = { sellTokens: sellAmt.toString(), quote: q };
        const spot = BigInt(st.spot_price_scaled);
        const avg = (BigInt(q.gross_out) * L.SCALE) / sellAmt;
        const impact = spot > 0n ? Number(((spot - avg) * 10000n) / spot) / 100 : 0;
        $("quoteBox").innerHTML =
          `You receive ≈ <b>${fmtTok(q.amount_out)} LUNC</b><br>` +
          `Fee ${fmtTok(q.fee_total)} LUNC — platform ${fmtTok(q.fee_platform)} · creator ${fmtTok(q.fee_creator)} · stays in reserve ${fmtTok(feeTreasury(q))}<br>` +
          `Avg price ${fmtPrice(avg.toString())} LUNC · price impact ${impact.toFixed(2)}%`;
      }
    } catch (e) {
      $("quoteBox").textContent = "Quote unavailable: " + e.message;
      state.preview = null;
    }
    drawTokenChart(rec, st);
  }

  async function bagLine(rec, bal) {
    try {
      const q = await queryContract(rec.curve, {
        quote_sell: { tokens_in: bal.toString() },
      });
      return `Your bag (${fmtTok(bal.toString())} ${rec.symbol}) sells for ${fmtTok(q.amount_out)} LUNC right now — live quote from the curve, it moves as others trade.`;
    } catch {
      return "Your bag's sell quote is unavailable right now.";
    }
  }

  async function executeTrade() {
    const rec = state.token;
    const st = rec.state;
    if (!state.address) return alert("Connect a wallet first.");
    if (!state.preview) return alert("No valid quote yet.");
    if (state.tradeSide === "buy") {
      const spend = state.preview.spend;
      const minReceive = (
        (BigInt(state.preview.tokens) * 99n) / 100n
      ).toString();
      const msg = L.buildBuyMsg(minReceive);
      const hash = await guardedSend(
        rec.curve,
        msg,
        [{ denom: "uluna", amount: spend.toString() }],
        { kind: "buy", curve: rec.curve, payUluna: spend.toString(), minReceive }
      );
      if (hash) afterTx(hash);
    } else {
      const amt = state.preview.sellTokens;
      const minReceive = (
        (BigInt(state.preview.quote.amount_out) * 99n) / 100n
      ).toString();
      const msg = L.buildSellMsg(rec.curve, amt, minReceive);
      const hash = await guardedSend(
        rec.token,
        msg,
        [],
        { kind: "sell", curve: rec.curve, amount: amt, minReceive }
      );
      if (hash) afterTx(hash);
    }
    void st;
  }

  function afterTx(hash) {
    $("tradeResult").innerHTML =
      `Done. <a href="${CFG.FINDER}/tx/${hash}" target="_blank" rel="noopener">View tx</a>`;
    setTimeout(() => renderToken(), 1500);
  }

  /* ------------------------- Holders + trades ------------------------- */
  async function loadHolders(rec) {
    try {
      const acc = await queryContract(rec.token, {
        all_accounts: { start_after: null, limit: 30 },
      });
      const rows = [];
      for (const a of acc.accounts) {
        const b = await queryContract(rec.token, { balance: { address: a } });
        if (BigInt(b.balance) > 0n) rows.push([a, BigInt(b.balance)]);
      }
      rows.sort((x, y) => (y[1] > x[1] ? 1 : -1));
      $("holdersBox").innerHTML =
        `<p class="note">Holders shown: ${rows.length}${acc.accounts.length >= 30 ? " (first page — count is a lower bound)" : ""}</p>` +
        (rows.length
          ? ""
          : `<p class="note">No holders yet — be the first buyer.</p>`) +
        rows
          .slice(0, 10)
          .map(
            ([a, b]) =>
              `<div class="row"><span>${a.slice(0, 12)}…${a.slice(-4)}</span><b>${fmtTok(b.toString())}</b></div>`
          )
          .join("");
    } catch {
      $("holdersBox").textContent = "Holder list unavailable.";
    }
  }

  async function loadTrades(rec) {
    try {
      const j = await fetch(
        `${CFG.FCD}/v1/txs?account=${rec.curve}&limit=100`
      ).then((r) => r.json());
      const trades = [];
      for (const tx of j.txs || []) {
        const height = tx.height;
        for (const m of tx.tx?.value?.msg || tx.tx?.body?.messages || []) {
          const v = m.value || m;
          if (v.contract === rec.curve && v.msg && (v.msg.buy || v.msg.buy_exact_out)) {
            const paid = (v.funds || []).reduce(
              (s, c) => s + (c.denom === "uluna" ? BigInt(c.amount) : 0n),
              0n
            );
            trades.push({ height, kind: "buy", paid });
          }
        }
      }
      $("tradesBox").innerHTML = trades.length
        ? trades
            .slice(0, 12)
            .map(
              (t) =>
                `<div class="row"><span>#${t.height} ${t.kind}</span><b>${fmtTok(t.paid.toString())} LUNC</b></div>`
            )
            .join("")
        : '<p class="note">No trades indexed yet.</p>';
      // ATH/ATL from indexed trades uses paid amounts as a volume proxy;
      // the per-token price series needs an indexer — labelled honestly.
      $("athBox").textContent = trades.length
        ? `Indexed buys: ${trades.length} · largest ${fmtTok(
            trades.reduce((m, t) => (t.paid > m ? t.paid : m), 0n).toString()
          )} LUNC. Full ATH/ATL price series arrives with the Phase-2 indexer.`
        : "";
    } catch {
      $("tradesBox").textContent = "Trade feed unavailable.";
    }
  }

  /* --------------------------- Role panels ---------------------------- */
  function renderRolePanels(rec, st, cfg) {
    const me = state.address;
    const creatorPanel = $("creatorPanel");
    const ownerPanel = $("ownerPanel");
    creatorPanel.classList.toggle("hidden", !(me && cfg && me === cfg.creator));
    ownerPanel.classList.toggle(
      "hidden",
      !(me && state.factoryCfg && me === state.factoryCfg.owner)
    );
    if (me && cfg && me === cfg.creator) {
      $("claimFeesBtn").onclick = async () => {
        const msg = L.buildClaimCreatorFeesMsg();
        const hash = await guardedSend(rec.curve, msg, [], {
          kind: "claim_creator_fees",
          curve: rec.curve,
        });
        if (hash) afterTx(hash);
      };
      $("claimAllocBtn").onclick = async () => {
        const msg = L.buildClaimCreatorAllocationMsg();
        const hash = await guardedSend(rec.curve, msg, [], {
          kind: "claim_creator_allocation",
          curve: rec.curve,
        });
        if (hash) afterTx(hash);
      };
    }
    if (me && state.factoryCfg && me === state.factoryCfg.owner) {
      $("pauseBtn").onclick = async () => {
        const msg = st.paused
          ? { unpause_curve: { launch_id: rec.id } }
          : L.buildFactoryPauseCurveMsg(rec.id);
        // Owner override actions are not in the guard's user kinds;
        // route them through the confirm modal with explicit text.
        const ok = await confirmModal(
          `${st.paused ? "Unpause" : "Pause"} trading on launch #${rec.id}`,
          msg,
          []
        );
        if (ok && state.signingClient) {
          await state.signingClient.execute(
            state.address,
            CFG.FACTORY_ADDRESS,
            msg,
            "auto"
          );
          renderToken();
        }
      };
      $("recallBtn").onclick = async () => {
        const msg = L.buildFactoryRecallCurveMsg(rec.id);
        const ok = await confirmModal(
          `EMERGENCY RECALL launch #${rec.id}: sweeps the curve's LUNC and unsold tokens to the SAFE WALLET and shuts the launch down. This cannot be undone.`,
          msg,
          []
        );
        if (ok && state.signingClient) {
          await state.signingClient.execute(
            state.address,
            CFG.FACTORY_ADDRESS,
            msg,
            "auto"
          );
          renderToken();
        }
      };
      $("stopAllBtn").onclick = async () => {
        const msg = L.buildFactoryEmergencyStopMsg(null, 30);
        const ok = await confirmModal(
          "FACTORY-WIDE EMERGENCY STOP: pauses trading on up to 30 launches and blocks new launches.",
          msg,
          []
        );
        if (ok && state.signingClient) {
          await state.signingClient.execute(
            state.address,
            CFG.FACTORY_ADDRESS,
            msg,
            "auto"
          );
        }
      };
    }
  }

  /* ------------------------------ Wiring ------------------------------ */
  function escapeHtml(s) {
    return String(s).replace(/[&<>"']/g, (c) => ({
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      '"': "&quot;",
      "'": "&#39;",
    })[c]);
  }

  document.addEventListener("DOMContentLoaded", () => {
    if (CFG.TEST_MODE) $("testBanner").classList.remove("hidden");
    $("walletBtn").onclick = () =>
      connectKeplr().catch((e) => alert(e.message));
    $("wcBtn").onclick = () =>
      alert(
        CFG.WC_PROJECT_ID
          ? "WalletConnect: pick LUNCDash in the wallet modal (wired at launch)."
          : "WalletConnect is configured on launch day (project id not set in this TEST build)."
      );
    for (const v of ["launches", "create", "token"]) {
      $("tab-" + v).onclick = () => showView(v);
    }
    ["searchBox", "sortSel", "filterType", "filterPace"].forEach((id) =>
      $(id).addEventListener("input", renderLaunches)
    );
    ["cName", "cSymbol", "cSupply", "cGradTarget", "cMaxBuy", "cSnipeBlocks", "cSnipeCap"].forEach(
      (id) => $(id).addEventListener("input", drawCreateChart)
    );
    $("cPace").addEventListener("input", drawCreateChart);
    $("cAlloc").addEventListener("input", drawCreateChart);
    document
      .querySelectorAll('input[name="ctype"], input[name="grad"]')
      .forEach((el) => el.addEventListener("change", drawCreateChart));
    $("createBtn").onclick = () => submitCreate().catch((e) => alert(e.message));
    $("sideBuy").onclick = () => {
      state.tradeSide = "buy";
      $("sideBuy").classList.add("active");
      $("sideSell").classList.remove("active");
      if (state.token) renderToken();
    };
    $("sideSell").onclick = () => {
      state.tradeSide = "sell";
      $("sideSell").classList.add("active");
      $("sideBuy").classList.remove("active");
      if (state.token) renderToken();
    };
    let quoteTimer = null;
    $("amtSlider").addEventListener("input", () => {
      clearTimeout(quoteTimer);
      quoteTimer = setTimeout(() => {
        if (state.token) refreshQuote(state.token, state.token.state);
      }, 180);
    });
    document.querySelectorAll(".chip").forEach((chip) => {
      chip.onclick = () => {
        $("amtSlider").value = chip.dataset.pct;
        if (state.token) refreshQuote(state.token, state.token.state);
      };
    });
    $("tradeBtn").onclick = () => executeTrade().catch((e) => alert(e.message));
    drawCreateChart();
    loadLaunches();
  });
})();
