// ---------------------------------------------------------------------------
// FRG Fight Club — public game configuration
// Safe to ship in the frontend. Secrets (treasury seed, bot token) live ONLY
// on the server — never put them here.
// ---------------------------------------------------------------------------

export const CHAIN_ID = 'columbus-5'; // Terra Classic mainnet
export const LCD_URL = 'https://terra-classic-lcd.publicnode.com';

// FRG — "FRG Universe" CW20. Verified on-chain (token_info): decimals 6.
export const FRG_CONTRACT =
  'terra14rfnhc2aru7jp304lht3yf903necsnrt4cxd464cftsfcksw0rtsgundnt';
export const FRG_DECIMALS = 6;
export const FRG_SYMBOL = 'FRG';

// Game economy — keep these in sync with the server's .env (the server is
// the source of truth and re-checks every amount on-chain).
export const ENTRY_FEE_FRG = 10; // FRG to enter one match
export const PRIZE_FRG = 18; // FRG paid to the winner

// Your game treasury wallet (the "bank"). Create it in Station / Keplr /
// LuncDash, fund it with a little LUNC for gas + FRG for prizes, and put the
// SAME address in the server .env. This is a public address — safe here.
export const TREASURY_ADDRESS = 'terra1mymhewn5pp2aqy8ld6828md24sfecn05zdztg7';

// Backend base URL. In local dev the Vite proxy forwards /api to the server,
// so leave it empty. In production set VITE_API_URL to your server's URL.
export const API_BASE = import.meta.env.VITE_API_URL || '';

// WalletConnect (Reown) project ID — a public identifier, safe to ship.
// Required for the app-based wallets (Keplr Mobile, Galaxy Station,
// LuncDash) to pair from Telegram / mobile browsers.
export const WC_PROJECT_ID = '7e363f1ed5d676ecc4ae2d40c5b83fbf';

// Game registry — the lobby renders one card per entry. To add a game:
// build its component under src/games/, then add a line here.
export const GAMES = [
  {
    id: 'boxing',
    name: 'FRG Fight Club',
    emoji: '🥊',
    tagline: 'Arcade boxing — tells, stars, knockdowns.',
    terms: 'Entry 10 FRG · Win 18 FRG',
    playLabel: 'Pay 10 FRG & Fight',
    live: true,
  },
  {
    id: 'wheel',
    name: 'FRG Prize Wheel',
    emoji: '🎡',
    tagline: 'One spin. Top prize 20 FRG.',
    terms: 'Entry 10 FRG · Top prize 20 FRG',
    playLabel: 'Pay 10 FRG & Spin',
    live: true,
  },
  {
    id: 'crash',
    name: 'Rocket Crash',
    emoji: '🚀',
    tagline: 'Ride the multiplier — bail before it blows.',
    terms: 'Entry 10 FRG · Max win 50 FRG',
    playLabel: 'Pay 10 FRG & Launch',
    live: true,
  },
  {
    id: 'darts',
    name: 'Balloon Darts',
    emoji: '🎈',
    tagline: 'Pop balloons, build a pot — dodge the two 💥.',
    terms: 'Entry 10 FRG · Max pot 27 FRG',
    playLabel: 'Pay 10 FRG & Throw',
    live: true,
  },
  {
    id: 'racing',
    name: 'FRG Drag Racing',
    emoji: '🏎️',
    tagline: 'Beat the tree, nail the shifts, outrun the rival.',
    terms: 'Entry 10 FRG · Win 18 FRG',
    playLabel: 'Pay 10 FRG & Race',
    live: true,
  },
  {
    id: 'mines',
    name: 'FRG Mines',
    emoji: '💣',
    tagline: 'Every gem raises the prize — one mine takes it all.',
    terms: 'Entry 10 FRG · Max win 43 FRG',
    playLabel: 'Pay 10 FRG & Dig',
    live: true,
  },
  {
    id: 'breakout',
    name: 'FRG Breakout',
    emoji: '🧱',
    tagline: 'Smash the wall, keep the ball alive.',
    terms: 'Entry 10 FRG · Max win 45 FRG',
    playLabel: 'Pay 10 FRG & Play',
    live: true,
  },
  {
    id: 'flight',
    name: 'FRG Flight',
    emoji: '🚀',
    tagline: 'One tap to flap. Thread the gates.',
    terms: 'Entry 10 FRG · Max win 45 FRG',
    playLabel: 'Pay 10 FRG & Play',
    live: true,
  },
  {
    id: 'tower',
    name: 'FRG Tower',
    emoji: '🏗️',
    tagline: 'Drop the block. Mind the slice.',
    terms: 'Entry 10 FRG · Max win 45 FRG',
    playLabel: 'Pay 10 FRG & Play',
    live: true,
  },
  {
    id: 'slice',
    name: 'FRG Slice',
    emoji: '⚔️',
    tagline: 'Swipe the gems. Dodge the bombs.',
    terms: 'Entry 10 FRG · Max win 45 FRG',
    playLabel: 'Pay 10 FRG & Play',
    live: true,
  },
  {
    id: 'pinball',
    name: 'FRG Pinball',
    emoji: '👾',
    tagline: 'Three balls. Light F-R-G. Chase the high score.',
    terms: 'Entry 10 FRG · Max win 45 FRG',
    playLabel: 'Pay 10 FRG & Play',
    live: true,
  },
];

export function toMicro(frg) {
  return String(Math.round(Number(frg) * 10 ** FRG_DECIMALS));
}

export function fromMicro(micro) {
  return Number(micro) / 10 ** FRG_DECIMALS;
}
