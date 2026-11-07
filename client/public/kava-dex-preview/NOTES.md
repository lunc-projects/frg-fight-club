# Kava Dev DEX — Preview · Notes

A presentation preview built by LUNC Dev Studio for community feedback.

- **Everything on this page is original code and original design**, written for
  this preview. No assets, art, code, or copy were taken from any other DEX.
- Reference DEXs are named in research only, for facts: Kava Swap (Kava's
  native AMM — its 0.15% swap-fee convention is used for the demo quote math),
  SushiSwap and WAGMI (DEXs deployed on Kava EVM), Curve (deployed via
  Kava Rise). Kava chain facts used: EVM chain ID 2222, Cosmos chain-id
  kava_2222-10, native denom ukava, native USD₮ and USDX, IBC connectivity.
- **Honesty rules baked into the page:** a persistent PREVIEW ribbon on every
  view; demo-data tags wherever numbers appear; wallet connect is simulated
  in-page only (no real wallet opens, nothing is signed, no keys requested);
  all balances, pools, prices and "transactions" are simulated client-side.
  The footer states the page is an independent preview, not affiliated with
  Kava Labs.
- The "Create your own chain" guide states the verified truth: Kava has no
  official L2/rollup product; a "chain on Kava" is a sovereign Cosmos SDK
  appchain (e.g. scaffolded with Ignite CLI) connected to Kava over IBC,
  with its own validators and security.
- Static only: one self-contained `index.html` (inline CSS/JS, system font
  stack, zero external requests, zero API files).
