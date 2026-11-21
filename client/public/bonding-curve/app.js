/* LUNC Dev Studio — Bonding Curve Launchpad (front-end)
 *
 * TEST / UNRELEASED build. This page is the front-end for the bonding
 * curve factory system in ../contracts. It ships inside the deployment
 * package and goes live only after the governance code-upload proposal
 * passes and the factory is instantiated. FACTORY_ADDRESS below stays
 * empty until launch day (see ../docs/DEPLOY.md).
 *
 * The pure parts of this file (curve math + message builders + the
 * pre-sign guard) are shared with the node test-suite in ./test.
 */
"use strict";

/* ============================== CONFIG ============================== */

const CONFIG = {
  TEST_MODE: true,
  CHAIN_ID: "columbus-5",
  LCD: "https://terra-classic-lcd.publicnode.com",
  FCD: "https://terra-classic-fcd.publicnode.com",
  FACTORY_ADDRESS: "", // set on launch day (docs/DEPLOY.md step 4)
  WC_PROJECT_ID: "", // WalletConnect project id — set to enable LUNCDash
  DENOM: "uluna",
  TOKEN_DECIMALS: 6,
  FINDER: "https://finder.terraclassic.community/columbus-5",
};

/* ============================ CURVE MATH ============================
 * BigInt mirror of contracts/curve/src/math.rs. Used ONLY for instant
 * previews (create-form chart, slider feedback). Every number that is
 * actually traded on comes from the curve contract's own quote queries
 * — the contract is the source of truth, this is a sketchpad.
 */

const SCALE = 10n ** 18n;

function cpCost(V, S, x) {
  // V, S, x: BigInt base units. C(x) = V*x/(S-x)
  if (x >= S) throw new Error("sold out");
  return (V * x) / (S - x);
}
function cpSpot(V, S, x) {
  // uluna per token base unit, scaled by 1e18
  if (x >= S) throw new Error("sold out");
  const rem = S - x;
  return (V * S * SCALE) / (rem * rem);
}
function sigmoidA(targetTotal, S) {
  // A scaled by 1e18: A = target * 20 / (S * 11)
  return (targetTotal * SCALE * 20n) / (S * 11n);
}
function sigmoidG(U) {
  // U = u * SCALE. G = U/20 + U^3/SCALE^2 - U^4/(2 SCALE^3)
  const u2 = (U * U) / SCALE;
  const u3 = (u2 * U) / SCALE;
  const u4half = (u3 * U) / SCALE / 2n;
  return U / 20n + u3 - u4half;
}
function sigmoidCost(A, S, x) {
  const U = (x * SCALE) / S;
  return (A * S * sigmoidG(U)) / (SCALE * SCALE);
}
function sigmoidSpot(A, S, x) {
  const U = (x * SCALE) / S;
  const u2 = (U * U) / SCALE;
  const u3 = (u2 * U) / SCALE;
  const F = 3n * u2 - 2n * u3; // smoothstep * SCALE
  const c = SCALE / 20n;
  return (A * (c + F)) / SCALE;
}

/** Build the math context the previews need for one launch shape. */
function makeCurveMath({ curveType, pace, saleSupply, cpBaseVirtualReserve, sigmoidBaseTotalCost }) {
  const mult = PACE_MULTIPLIERS[pace]; // [num, den] BigInt
  const S = BigInt(saleSupply);
  if (curveType === "constant_product") {
    const V = (BigInt(cpBaseVirtualReserve) * mult[0]) / mult[1];
    return {
      cost: (x) => cpCost(V, S, x),
      spot: (x) => cpSpot(V, S, x),
      saleSupply: S,
    };
  }
  const target = (BigInt(sigmoidBaseTotalCost) * mult[0]) / mult[1];
  const A = sigmoidA(target, S);
  return {
    cost: (x) => sigmoidCost(A, S, x),
    spot: (x) => sigmoidSpot(A, S, x),
    saleSupply: S,
  };
}

/* ===================== PACE SLIDER -> TIER SNAP =====================
 * The create form's climb slider is continuous (0..100) so launchers
 * can feel the shape, but the CONTRACT takes one of three tiers. The
 * slider maps to a capacity multiplier (0.5x .. 2x, log scale) and the
 * tier snaps from the position: <0.75x Steep, 0.75–1.5x Medium, >1.5x
 * Slow. The chart always redraws with the SNAPPED tier, never the raw
 * slider value — what you see is what the contract will run.
 */

const PACE_MULTIPLIERS = {
  slow: [2n, 1n],
  medium: [1n, 1n],
  steep: [1n, 2n],
};

function sliderToMultiplier(v) {
  // v: 0..100 -> 0.5 .. 2.0 (geometric)
  return 0.5 * Math.pow(4, v / 100);
}
function paceFromSlider(v) {
  const m = sliderToMultiplier(v);
  if (m < 0.75) return "steep";
  if (m > 1.5) return "slow";
  return "medium";
}

/* ========================= MESSAGE BUILDERS =========================
 * Exact JSON shapes for the contracts (snake_case, matching the Rust
 * serde output). The pre-sign guard re-derives these from the user's
 * intent and refuses to open the wallet if they differ.
 */

function buildCreateLaunchMsg(p) {
  return {
    create_launch: {
      params: {
        name: p.name,
        symbol: p.symbol,
        total_supply: p.totalSupply, // base units, string
        curve_type: p.curveType, // "constant_product" | "sigmoid"
        climb_pace: p.climbPace, // "slow" | "medium" | "steep"
        fee_bps: p.feeBps,
        graduation: p.graduation, // "none" | { dex_target: { target_reserve } }
        max_buy_uluna: p.maxBuyUluna ?? null,
        creator_allocation_bps: p.creatorAllocationBps,
        creator_vesting_seconds: p.creatorVestingSeconds,
        snipe_window_blocks: p.snipeWindowBlocks ?? null,
        snipe_max_buy_uluna: p.snipeMaxBuyUluna ?? null,
      },
    },
  };
}

function buildBuyMsg(minReceive) {
  return { buy: { min_receive: minReceive ?? null } };
}
function buildBuyExactOutMsg(tokensOut) {
  return { buy_exact_out: { tokens_out: tokensOut } };
}
function buildSellMsg(curveAddr, amount, minReceive) {
  const hook = { min_receive: minReceive ?? null };
  const hookB64 = base64EncodeJson(hook);
  return {
    send: { contract: curveAddr, amount: amount, msg: hookB64 },
  };
}
function buildClaimCreatorFeesMsg() {
  return { claim_creator_fees: {} };
}
function buildClaimCreatorAllocationMsg() {
  return { claim_creator_allocation: {} };
}
function buildFactoryPauseCurveMsg(launchId) {
  return { pause_curve: { launch_id: launchId } };
}
function buildFactoryRecallCurveMsg(launchId) {
  return { recall_curve: { launch_id: launchId } };
}
function buildFactoryEmergencyStopMsg(startAfter, limit) {
  return {
    emergency_stop_all: {
      start_after: startAfter ?? null,
      limit: limit ?? null,
    },
  };
}

function base64EncodeJson(obj) {
  const s = JSON.stringify(obj);
  if (typeof Buffer !== "undefined") return Buffer.from(s, "utf8").toString("base64");
  return btoa(unescape(encodeURIComponent(s)));
}
function base64DecodeJson(b64) {
  let s;
  if (typeof Buffer !== "undefined") s = Buffer.from(b64, "base64").toString("utf8");
  else s = decodeURIComponent(escape(atob(b64)));
  return JSON.parse(s);
}

/* ========================== PRE-SIGN GUARD ==========================
 * Every send goes: intent -> builder -> guard -> wallet. The guard
 * re-builds the expected message from the intent independently and
 * deep-compares, then produces the human-readable summary the user
 * confirms. A mismatch means the page state was tampered with or a
 * builder drifted — sending stops, the wallet never opens.
 */

function deepEqual(a, b) {
  if (a === b) return true;
  if (typeof a !== "object" || typeof b !== "object" || !a || !b) return false;
  const ka = Object.keys(a);
  const kb = Object.keys(b);
  if (ka.length !== kb.length) return false;
  return ka.every((k) => deepEqual(a[k], b[k]));
}

const MSG_BUILDERS = {
  create_launch: (intent) => buildCreateLaunchMsg(intent.params),
  buy: (intent) => buildBuyMsg(intent.minReceive),
  buy_exact_out: (intent) => buildBuyExactOutMsg(intent.tokensOut),
  sell: (intent) => buildSellMsg(intent.curve, intent.amount, intent.minReceive),
  claim_creator_fees: () => buildClaimCreatorFeesMsg(),
  claim_creator_allocation: () => buildClaimCreatorAllocationMsg(),
};

function guardCheck(intent, msgJson) {
  const builder = MSG_BUILDERS[intent.kind];
  if (!builder) return { ok: false, reason: "unknown intent kind" };
  const expected = builder(intent);
  if (!deepEqual(expected, msgJson)) {
    return { ok: false, reason: "message does not match the confirmed intent" };
  }
  return { ok: true, summary: describeIntent(intent) };
}

function describeIntent(intent) {
  switch (intent.kind) {
    case "buy":
      return `Buy on curve ${shortAddr(intent.curve)} paying ${fmtLunc(intent.payUluna)} LUNC (min receive ${intent.minReceive ?? "not set"} tokens)`;
    case "buy_exact_out":
      return `Buy exactly ${intent.tokensOut} tokens on curve ${shortAddr(intent.curve)}`;
    case "sell":
      return `Sell ${intent.amount} tokens on curve ${shortAddr(intent.curve)} (min receive ${intent.minReceive ?? "not set"} uluna)`;
    case "create_launch":
      return `Create launch ${intent.params.symbol} — supply ${intent.params.totalSupply}, curve ${intent.params.curveType}, pace ${intent.params.climbPace}, fee ${intent.params.feeBps} bps`;
    case "claim_creator_fees":
      return `Claim accrued creator fees from curve ${shortAddr(intent.curve)}`;
    case "claim_creator_allocation":
      return `Claim vested creator allocation from curve ${shortAddr(intent.curve)}`;
    default:
      return intent.kind;
  }
}

function shortAddr(a) {
  if (!a || a.length < 16) return a || "";
  return a.slice(0, 10) + "…" + a.slice(-6);
}
function fmtLunc(uluna) {
  const v = Number(BigInt(uluna)) / 1e6;
  return v.toLocaleString("en-US", { maximumFractionDigits: 6 });
}

/* ------------------------- exports for tests ------------------------ */
const API = {
  CONFIG,
  SCALE,
  cpCost,
  cpSpot,
  sigmoidA,
  sigmoidCost,
  sigmoidSpot,
  makeCurveMath,
  PACE_MULTIPLIERS,
  sliderToMultiplier,
  paceFromSlider,
  buildCreateLaunchMsg,
  buildBuyMsg,
  buildBuyExactOutMsg,
  buildSellMsg,
  buildClaimCreatorFeesMsg,
  buildClaimCreatorAllocationMsg,
  buildFactoryPauseCurveMsg,
  buildFactoryRecallCurveMsg,
  buildFactoryEmergencyStopMsg,
  base64DecodeJson,
  deepEqual,
  guardCheck,
  describeIntent,
};
if (typeof module !== "undefined" && module.exports) module.exports = API;
if (typeof window !== "undefined") window.Launchpad = API;
