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
export const TREASURY_ADDRESS = 'terra1kur3cr4vask4lgs3tr4gww7lr0zvc944gjfcqc';

// Backend base URL. In local dev the Vite proxy forwards /api to the server,
// so leave it empty. In production set VITE_API_URL to your server's URL.
export const API_BASE = import.meta.env.VITE_API_URL || '';

// Game registry — the lobby renders one card per entry. To add a game:
// build its component under src/games/, then add a line here.
export const GAMES = [
  {
    id: 'boxing',
    name: 'FRG Fight Club',
    emoji: '🥊',
    tagline: 'Arcade boxing — tells, stars, knockdowns.',
    live: true,
  },
  {
    id: 'racing',
    name: 'Lily Pad Racing',
    emoji: '🏎️',
    tagline: 'Coming soon.',
    live: false,
  },
  {
    id: 'slots',
    name: 'Ribbit Slots',
    emoji: '🎰',
    tagline: 'Coming soon.',
    live: false,
  },
];

export function toMicro(frg) {
  return String(Math.round(Number(frg) * 10 ** FRG_DECIMALS));
}

export function fromMicro(micro) {
  return Number(micro) / 10 ** FRG_DECIMALS;
}
