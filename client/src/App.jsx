import { Component, useCallback, useEffect, useRef, useState } from 'react';
import Boxing from './games/Boxing.jsx';
import PrizeWheel from './games/PrizeWheel.jsx';
import RocketCrash from './games/RocketCrash.jsx';
import BalloonDarts from './games/BalloonDarts.jsx';
import DragRacing from './games/DragRacing.jsx';
import Mines from './games/Mines.jsx';
import Pinball from './games/Pinball.jsx';
import Breakout from './games/Breakout.jsx';
import Flight from './games/Flight.jsx';
import Tower from './games/Tower.jsx';
import Slice from './games/Slice.jsx';
import Putt from './games/Putt.jsx';
import Snake from './games/Snake.jsx';
import Memory from './games/Memory.jsx';
import Crossing from './games/Crossing.jsx';
import Highway from './games/Highway.jsx';
import { GAMES } from './config.js';
import {
  startGame,
  submitResult,
  getLeaderboard,
  getMe,
  telegramUser,
  guestIdentity,
  setGuestName,
} from './api.js';

const GAME_COMPONENTS = {
  boxing: Boxing,
  wheel: PrizeWheel,
  crash: RocketCrash,
  darts: BalloonDarts,
  racing: DragRacing,
  mines: Mines,
  pinball: Pinball,
  breakout: Breakout,
  flight: Flight,
  tower: Tower,
  slice: Slice,
  putt: Putt,
  snake: Snake,
  memory: Memory,
  crossing: Crossing,
  highway: Highway,
};

// Per-game result presentation. `won` here means "scored points".
function resultView(game, r) {
  if (!r) return { emoji: '🎮', title: 'Game over', lines: [], won: false };
  switch (game) {
    case 'wheel':
      return r.prize > 0
        ? { emoji: '🎡', title: 'The wheel paid out!', lines: [`You landed ${r.prize} PTS.`], won: true }
        : { emoji: '🎡', title: 'BUST — the wheel takes this one.', lines: ['No points this spin. Every spin is a fresh spin.'], won: false };
    case 'crash':
      return r.outcome === 'win'
        ? { emoji: '🚀', title: 'You bailed in time!', lines: [`Cashed out at ${r.multiplier?.toFixed(2)}×.`], won: true }
        : { emoji: '💥', title: `The rocket blew at ${r.multiplier?.toFixed(2)}×.`, lines: ['Rode it too long this time. Every launch is a fresh launch.'], won: false };
    case 'darts':
      if (r.outcome === 'win')
        return { emoji: '🎈', title: 'Pot banked!', lines: [`You walked away with ${r.amount} PTS.`], won: true };
      return r.burst
        ? { emoji: '💥', title: 'BURST! The 💥 balloon ate your pot.', lines: ['Greed is a balloon animal — it pops.'], won: false }
        : { emoji: '💥', title: 'Out of darts — pot came up empty.', lines: ['Three balloons, no prizes inside.'], won: false };
    case 'racing': {
      const line = `Your ET ${(r.etMs / 1000).toFixed(2)}s vs rival ${(r.rivalEtMs / 1000).toFixed(2)}s · ⚡ Perfect shifts: ${r.perfectShifts}/4`;
      if (r.outcome === 'win') return { emoji: '🏁', title: 'You outran him!', lines: [line], won: true };
      if (r.outcome === 'foul') return { emoji: '🚨', title: 'RED LIGHT! You jumped the tree.', lines: ['Foul start — no time recorded.'], won: false };
      return { emoji: '🏎️', title: 'Outrun this time.', lines: [line], won: false };
    }
    case 'mines':
      return r.outcome === 'win'
        ? { emoji: '💎', title: 'You banked the gems!', lines: [`Dug up ${r.picks} gem${r.picks > 1 ? 's' : ''} and walked away clean.`], won: true }
        : { emoji: '💣', title: 'BOOM. The mine took it.', lines: [`You had ${r.picks ?? 0} gem${r.picks === 1 ? '' : 's'} dug when it blew.`], won: false };
    case 'pinball':
    case 'breakout':
    case 'flight':
    case 'tower':
    case 'slice':
    case 'highway': {
      const emoji = { pinball: '👾', breakout: '🧱', flight: '🚀', tower: '🏗️', slice: '⚔️', highway: '🏎️' }[game];
      const firstTier = { pinball: 1500, breakout: 600, flight: 500, tower: 800, slice: 600, highway: 300 }[game];
      const extra =
        game === 'flight' ? `${r.gates} gates flown. ` : game === 'tower' ? `${r.blocks} blocks stacked. ` : game === 'slice' ? `${r.sliced} items sliced. ` : game === 'highway' ? `${r.distance}m driven · ${r.coins} coins · ${r.nearMisses} near misses. ` : '';
      return r.amount > 0
        ? { emoji, title: `${r.score?.toLocaleString()} points!`, lines: [`${extra}That score earns ${r.amount} PTS.`], won: true }
        : { emoji, title: `${r.score?.toLocaleString()} points — just short.`, lines: [`The first points tier starts at ${firstTier.toLocaleString()} points.`], won: false };
    }
    case 'putt':
      return r.amount > 0
        ? { emoji: '🏌️', title: `Round complete — ${r.score} points!`, lines: [`Strokes by hole: ${r.strokesPerHole?.join(' · ')}. That earns ${r.amount} PTS.`], won: true }
        : { emoji: '🏌️', title: `Round complete — ${r.score} points.`, lines: ['The first points tier starts at 120 — sink a couple more to get on the board.'], won: false };
    case 'snake':
      return r.amount > 0
        ? { emoji: '🐍', title: `${r.score} points!`, lines: [`${r.orbs} orbs eaten (${r.golden} golden). That earns ${r.amount} PTS.`], won: true }
        : { emoji: '🐍', title: `${r.score} points — snake down.`, lines: ['The first points tier starts at 150 — six orbs gets you there.'], won: false };
    case 'memory':
      return r.amount > 0
        ? { emoji: '🧠', title: `${r.rounds} rounds deep!`, lines: [`${r.score} points — that earns ${r.amount} PTS.`], won: true }
        : { emoji: '🧠', title: `${r.rounds} round${r.rounds === 1 ? '' : 's'} completed.`, lines: ['Finish 2 rounds to reach the first points tier.'], won: false };
    case 'crossing':
      return r.amount > 0
        ? { emoji: '🚦', title: `${r.crossings} crossing${r.crossings === 1 ? '' : 's'}!`, lines: [`${r.score} points — that earns ${r.amount} PTS.`], won: true }
        : { emoji: '🚦', title: 'Caught in traffic.', lines: ['One clean crossing gets you on the board at 150 points.'], won: false };
    default: // boxing
      return r.outcome === 'win'
        ? { emoji: '🏆', title: 'You win!', lines: [`⭐ Points: ${r.points ?? 0} · Damage dealt: ${r.damageDealt} · Rounds ${r.rounds}`], won: true }
        : { emoji: '🥴', title: 'The Champ keeps the belt.', lines: [`⭐ Points: ${r.points ?? 0} · Damage dealt: ${r.damageDealt} · Rounds ${r.rounds}. Every match is a fresh match.`], won: false };
  }
}

function Board({ title, rows, highlight }) {
  return (
    <div className={`board ${highlight ? 'board-skill' : ''}`}>
      <h3>{title}</h3>
      {rows && rows.length > 0 ? (
        <ol className="board-rows">
          {rows.map((row, i) => (
            <li key={i} className="board-row">
              <span className="board-rank">#{i + 1}</span>
              <span className="board-name">{row.name}</span>
              <span className="board-pts">{row.points} PTS</span>
              <span className="board-games">{row.games} played</span>
            </li>
          ))}
        </ol>
      ) : (
        <p className="board-empty">No scores yet — be the first on the board.</p>
      )}
    </div>
  );
}

// A game that throws must never take the whole club down with it:
// catch the error, show a way back to the lobby instead of a black screen.
class GameBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { failed: false };
  }
  static getDerivedStateFromError() {
    return { failed: true };
  }
  componentDidCatch(err) {
    console.error('Game crashed:', err);
  }
  render() {
    if (this.state.failed) {
      return (
        <div className="game-crash">
          <p>😵 This game hit a snag and couldn't load.</p>
          <button className="btn btn-big" onClick={this.props.onBack}>
            ← Back to the lobby
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}

export default function App() {
  const [screen, setScreen] = useState('lobby');
  const [game, setGame] = useState('boxing');
  const [session, setSession] = useState(null);
  const [result, setResult] = useState(null);
  const [submit, setSubmit] = useState(null); // {status, points, skill, totals, error}
  const [boards, setBoards] = useState(null);
  const [me, setMe] = useState(null);
  const [error, setError] = useState('');
  const [nameDraft, setNameDraft] = useState(() => guestIdentity().guestName || '');
  const submittedFor = useRef(null);

  const tgUser = telegramUser();
  const season = boards?.season;

  const refreshLobby = useCallback(async () => {
    try {
      const [b, m] = await Promise.all([getLeaderboard(), getMe()]);
      setBoards(b);
      setMe(m);
    } catch {
      /* boards are decoration — the games work without them */
    }
  }, []);

  useEffect(() => {
    if (screen === 'lobby') refreshLobby();
  }, [screen, refreshLobby]);

  const enterGame = useCallback(async (gameId) => {
    setError('');
    setGame(gameId);
    setScreen('starting');
    try {
      const { sessionToken } = await startGame(gameId);
      setSession(sessionToken);
      setResult(null);
      setSubmit(null);
      submittedFor.current = null;
      setScreen('playing');
    } catch (e) {
      setScreen('lobby');
      setError(e.message || 'Could not start the game.');
    }
  }, []);

  const onFinish = useCallback((r) => {
    setResult(r);
    setScreen('done');
  }, []);

  // Record the result exactly once per session.
  useEffect(() => {
    if (screen !== 'done' || !result || !session) return;
    if (submittedFor.current === session) return;
    submittedFor.current = session;
    setSubmit({ status: 'pending' });
    submitResult(session, result)
      .then((data) => setSubmit({ status: 'ok', ...data }))
      .catch((e) => setSubmit({ status: 'error', error: e.message || 'Score not recorded.' }));
  }, [screen, result, session]);

  const toLobby = () => {
    setSession(null);
    setResult(null);
    setSubmit(null);
    setError('');
    setScreen('lobby');
  };

  const GameComp = GAME_COMPONENTS[game];
  const view = screen === 'done' ? resultView(game, result) : null;
  const gameMeta = GAMES.find((g) => g && g.id === game);

  return (
    <div className="app">
      <header>
        <h1>🥊 FRG FIGHT CLUB</h1>
        <p className="tag">Free to play. Climb the board. 🏆</p>
      </header>

      {error && <div className="error">⚠️ {error}</div>}

      {screen === 'lobby' && (
        <main>
          {season && (
            <div className="season-banner">
              🏆 <b>{season.name}</b> is live — the skill titles feed the
              season leaderboard below. Every game is free.
              {season.endsAt
                ? ` Season ends ${new Date(season.endsAt).toLocaleDateString()}.`
                : ''}
            </div>
          )}

          <div className="me-strip">
            {tgUser ? (
              <span>
                Playing as <b>{me?.name || tgUser.first_name}</b>
              </span>
            ) : (
              <span className="guest-name">
                Player name:{' '}
                <input
                  value={nameDraft}
                  maxLength={24}
                  placeholder="Your name for the board"
                  onChange={(e) => {
                    setNameDraft(e.target.value);
                    setGuestName(e.target.value);
                  }}
                  onBlur={refreshLobby}
                />
              </span>
            )}
            {me && me.games > 0 && (
              <span className="me-stats">
                🏆 Skill: <b>{me.skill} PTS</b>
                {me.skillRank ? ` (#${me.skillRank})` : ''} · All games: <b>{me.glory} PTS</b> ·{' '}
                {me.games} played
              </span>
            )}
          </div>

          <h2 className="section">Pick your game</h2>
          <div className="cards">
            {GAMES.map((g, i) => (
              <div key={g.id} className={`card ${g.live ? '' : 'soon'}`} style={{ animationDelay: `${Math.min(i, 10) * 45}ms` }}>
                {g.cover ? (
                  <img className="card-cover" src={g.cover} alt="" loading="lazy" />
                ) : (
                  <div className="card-emoji">{g.emoji}</div>
                )}
                <div className="card-name">{g.name}</div>
                <div className="card-tag">{g.tagline}</div>
                {g.live ? (
                  <>
                    <div className="card-terms">{g.terms}</div>
                    {g.skill && <div className="skill-chip">🏆 Skill title — counts on the season board</div>}
                    <button className="btn btn-big" onClick={() => enterGame(g.id)}>
                      {g.playLabel}
                    </button>
                  </>
                ) : (
                  <div className="soon-badge">COMING SOON</div>
                )}
              </div>
            ))}
          </div>

          <h2 className="section">Leaderboards</h2>
          <div className="boards">
            <Board title="🏆 Skill board — Season leaderboard" rows={boards?.skill} highlight />
            <Board title="🎮 All-games board" rows={boards?.glory} />
          </div>

          <p className="fineprint">
            Every game is free — no wallet, no payments, nothing to buy.
            Points are leaderboard credit only: they are never sold, and
            they can't be bought, exchanged, or cashed out.
          </p>
        </main>
      )}

      {screen === 'starting' && (
        <main className="center">
          <div className="spinner" />
          <p>Setting up your game…</p>
        </main>
      )}

      {screen === 'playing' && GameComp && (
        <GameBoundary key={game} onBack={toLobby}>
          <GameComp onFinish={onFinish} />
        </GameBoundary>
      )}

      {screen === 'done' && view && (
        <main className="center">
          <div className="result-emoji">{view.emoji}</div>
          <h2>{view.title}</h2>
          {view.lines.map((line, i) => (
            <p key={i}>{line}</p>
          ))}
          {submit?.status === 'pending' && <p className="record-line">Recording your score…</p>}
          {submit?.status === 'ok' && (
            <p className="record-line">
              ✅ <b>+{submit.points} PTS</b> recorded
              {submit.skill ? ' on the 🏆 skill board' : ' on the all-games board'}. Season totals —
              Skill: <b>{submit.totals.skill}</b> · All games: <b>{submit.totals.glory}</b>
            </p>
          )}
          {submit?.status === 'error' && (
            <p className="record-line">⚠️ Score couldn't be recorded ({submit.error})</p>
          )}
          <button className="btn btn-big" onClick={() => enterGame(game)}>
            Play again — {gameMeta?.name}
          </button>
          <button className="btn btn-ghost" onClick={toLobby}>
            Back to lobby
          </button>
        </main>
      )}
    </div>
  );
}
