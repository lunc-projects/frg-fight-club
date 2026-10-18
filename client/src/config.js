// ---------------------------------------------------------------------------
// FRG Fight Club — public game configuration (free-play edition)
// No crypto lives in this app: no wallets, no payments, no contract
// addresses. Points are leaderboard credit only.
// ---------------------------------------------------------------------------

// Backend base URL. In local dev the Vite proxy forwards /api to the server,
// so leave it empty. In production set VITE_API_URL to your server's URL.
export const API_BASE = import.meta.env.VITE_API_URL || '';

// Game registry — the lobby renders one card per entry. `skill: true`
// marks the six skill titles that feed the season leaderboard; the rest
// are glory-only. To add a game: build its component under src/games/,
// then add a line here.
export const GAMES = [
  {
    id: 'boxing',
    name: 'FRG Fight Club',
    emoji: '🥊',
    tagline: 'Arcade boxing — tells, stars, knockdowns.',
    terms: 'Free play · Win = 18 PTS',
    playLabel: '▶ Play — free',
    skill: true,
    live: true,
  },
  {
    id: 'wheel',
    name: 'FRG Prize Wheel',
    emoji: '🎡',
    tagline: 'One spin. Top prize 20 PTS.',
    terms: 'Free play · Top prize 20 PTS',
    playLabel: '▶ Play — free',
    live: true,
  },
  {
    id: 'crash',
    name: 'Rocket Crash',
    emoji: '🚀',
    tagline: 'Ride the multiplier — bail before it blows.',
    terms: 'Free play · Max 50 PTS',
    playLabel: '▶ Play — free',
    live: true,
  },
  {
    id: 'darts',
    name: 'Balloon Darts',
    emoji: '🎈',
    tagline: 'Pop balloons, build a pot — dodge the two 💥.',
    terms: 'Free play · Max pot 27 PTS',
    playLabel: '▶ Play — free',
    live: true,
  },
  {
    id: 'racing',
    name: 'FRG Drag Racing',
    emoji: '🏎️',
    tagline: 'Beat the tree, nail the shifts, outrun the rival.',
    terms: 'Free play · Win = 18 PTS',
    playLabel: '▶ Play — free',
    skill: true,
    live: true,
  },
  {
    id: 'mines',
    name: 'FRG Mines',
    emoji: '💣',
    tagline: 'Every gem raises the prize — one mine takes it all.',
    terms: 'Free play · Max 43 PTS',
    playLabel: '▶ Play — free',
    live: true,
  },
  {
    id: 'breakout',
    name: 'FRG Breakout',
    emoji: '🧱',
    tagline: 'Smash the wall, keep the ball alive.',
    terms: 'Free play · Max 45 PTS',
    playLabel: '▶ Play — free',
    skill: true,
    live: true,
  },
  {
    id: 'flight',
    name: 'FRG Flight',
    emoji: '🚀',
    tagline: 'One tap to flap. Thread the gates.',
    terms: 'Free play · Max 45 PTS',
    playLabel: '▶ Play — free',
    skill: true,
    live: true,
  },
  {
    id: 'tower',
    name: 'FRG Tower',
    emoji: '🏗️',
    tagline: 'Drop the block. Mind the slice.',
    terms: 'Free play · Max 45 PTS',
    playLabel: '▶ Play — free',
    skill: true,
    live: true,
  },
  {
    id: 'slice',
    name: 'FRG Slice',
    emoji: '⚔️',
    tagline: 'Swipe the gems. Dodge the bombs.',
    terms: 'Free play · Max 45 PTS',
    playLabel: '▶ Play — free',
    skill: true,
    live: true,
  },
  {
    id: 'pinball',
    name: 'FRG Pinball',
    emoji: '👾',
    tagline: 'Three balls. Light F-R-G. Chase the high score.',
    terms: 'Free play · Max 45 PTS',
    playLabel: '▶ Play — free',
    live: true,
  },
];
