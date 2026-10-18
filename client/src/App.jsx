import { useCallback, useEffect, useRef, useState } from 'react';
import WalletBar, { usePlayer } from './WalletBar.jsx';
import { IS_IOS } from './wallet.js';
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
import { ENTRY_FEE_FRG, PRIZE_FRG, GAMES } from './config.js';
import { finderTxUrl, findRecentEntries } from './chain.js';
import { verifyEntry, claimPrize } from './api.js';

// Poll the server until the entry tx is visible on-chain and verified.
// A fresh broadcast usually needs a few seconds (sometimes ~a minute)
// before the LCD can see it — one shot is not enough, and the player
// should never have to babysit a retry button for the normal case.
async function verifyPolling(txhash, address, gameId, tries = 22, delayMs = 4000) {
  let lastErr;
  for (let i = 0; i < tries; i++) {
    try {
      return await verifyEntry(txhash, address, gameId);
    } catch (e) {
      lastErr = e;
      if (/already|used|replay/i.test(e.message || '')) break;
      await new Promise((r) => setTimeout(r, delayMs));
    }
  }
  throw lastErr || new Error('Verification timed out.');
}
export default function App() {
  const { address, payEntry } = usePlayer();
  const [balance, setBalance] = useState(null);
  const [game, setGame] = useState('boxing');
  const [screen, setScreen] = useState('lobby');
  const [session, setSession] = useState(null);
  const [pendingTx, setPendingTx] = useState(null);
  const [payStuck, setPayStuck] = useState(false);
  const [result, setResult] = useState(null);
  const [payout, setPayout] = useState(null);
  const [error, setError] = useState('');
  const [busyText, setBusyText] = useState('');

  const connected = !!address;

  const enterGame = useCallback(async (gameId) => {
    setError('');
    setGame(gameId);
    if (!connected) {
      setError('Connect your wallet first.');
      return;
    }
    if (balance !== null && balance < ENTRY_FEE_FRG) {
      setError(
        `You need at least ${ENTRY_FEE_FRG} FRG to enter (plus a little LUNC for gas).`
      );
      return;
    }
    let txhash = null;
    try {
      setScreen('paying');
      setBusyText('Approve the entry fee in your wallet…');
      // Telegram can freeze this page while the wallet app is in front;
      // a signing promise can then never come back even though the
      // wallet approved. Cap the wait — the chain-scan recovery below
      // picks up any payment that actually landed.
      txhash = await Promise.race([
        payEntry(),
        new Promise((_, reject) =>
          setTimeout(() => reject(new Error('__pay_timeout__')), 45_000)
        ),
      ]);
      if (!txhash) throw new Error('Wallet did not return a tx hash.');

      setBusyText('Verifying your payment on-chain…');
      const { sessionToken } = await verifyPolling(txhash, address, gameId);
      setSession(sessionToken);
      setPendingTx(null);
      setPayStuck(false);
      setResult(null);
      setPayout(null);
      setScreen('playing');
    } catch (e) {
      setScreen('lobby');
      if (e.message === '__pay_timeout__') {
        setPayStuck(true);
        setError(
          'The signed approval did not make it back from the wallet in time. Checking the chain automatically — if your payment landed we pick it up here; if nothing landed, nothing was charged and paying again is safe.'
        );
      } else if (txhash) {
        // The payment may have landed even though verification hiccuped.
        // Keep the txhash so the player can retry verification WITHOUT
        // paying again — the server only burns a tx once it verifies.
        setPendingTx(txhash);
        setError(
          'Your payment went out but verification did not finish. Use "Retry verification" below — do not pay again.'
        );
      } else {
        setError(e.message || 'Entry failed.');
      }
    }
  }, [connected, balance, payEntry, address]);

  const retryVerify = useCallback(async () => {
    if (!pendingTx) return;
    setError('');
    try {
      setScreen('paying');
      setBusyText('Verifying your payment on-chain…');
      const { sessionToken } = await verifyPolling(pendingTx, address, game);
      setSession(sessionToken);
      setPendingTx(null);
      setPayStuck(false);
      setResult(null);
      setPayout(null);
      setScreen('playing');
    } catch (e) {
      setScreen('lobby');
      setError(
        'Still not verified — the chain may need a few more seconds. Wait a moment and retry; your payment is not lost.'
      );
    }
  }, [pendingTx, address, game]);

  // Recovery for a payment whose wallet round-trip froze: scan the
  // chain for this player's recent entry transfers to the treasury and
  // try to verify each (the server rejects already-used ones) until one
  // opens a session for the chosen game.
  const recoverByScan = useCallback(async () => {
    setError('');
    try {
      setScreen('paying');
      setBusyText('Checking the chain for your payment…');
      const candidates = await findRecentEntries(address);
      for (const hash of candidates) {
        try {
          const { sessionToken } = await verifyEntry(hash, address, game);
          setSession(sessionToken);
          setPendingTx(null);
          setPayStuck(false);
          setResult(null);
          setPayout(null);
          setScreen('playing');
          return;
        } catch {
          // not usable (wrong game / already used) — try the next one
        }
      }
      setScreen('lobby');
      setError(
        'No unused payment found on-chain. If you never approved in the wallet, nothing was charged and paying again is safe.'
      );
    } catch (e) {
      setScreen('lobby');
      setError('Chain check failed — try again in a moment.');
    }
  }, [address, game]);

  // --- Automatic recovery: a pending entry should finish itself. ---
  // Persist the pending state so even a full reopen of the game picks
  // it back up, and auto-run verification / the chain scan when the
  // lobby is showing with a wallet connected. The buttons stay as a
  // manual fallback only.
  useEffect(() => {
    try {
      if (pendingTx) {
        localStorage.setItem('frg.pendingEntry', JSON.stringify({ txhash: pendingTx, game }));
      } else if (payStuck) {
        localStorage.setItem('frg.pendingEntry', JSON.stringify({ stuck: true, game }));
      } else {
        localStorage.removeItem('frg.pendingEntry');
      }
    } catch {}
  }, [pendingTx, payStuck, game]);

  const resumedRef = useRef(false);
  useEffect(() => {
    if (!address || resumedRef.current) return;
    resumedRef.current = true;
    try {
      const saved = JSON.parse(localStorage.getItem('frg.pendingEntry') || 'null');
      if (saved?.txhash) {
        setGame(saved.game || 'boxing');
        setPendingTx(saved.txhash);
      } else if (saved?.stuck) {
        setGame(saved.game || 'boxing');
        setPayStuck(true);
      }
    } catch {}
  }, [address]);

  const autoTriedRef = useRef('');
  useEffect(() => {
    if (screen !== 'lobby' || !address) return;
    if (pendingTx && autoTriedRef.current !== pendingTx) {
      autoTriedRef.current = pendingTx;
      retryVerify();
    } else if (payStuck && autoTriedRef.current !== 'scan') {
      autoTriedRef.current = 'scan';
      recoverByScan();
    }
  }, [screen, address, pendingTx, payStuck, retryVerify, recoverByScan]);

  const onFinish = useCallback((r) => {
    setResult(r);
    if (game === 'wheel') {
      setScreen(r.prize > 0 ? 'won' : 'lost');
    } else {
      setScreen(r.outcome === 'win' ? 'won' : 'lost');
    }
  }, [game]);

  const winAmount =
    game === 'wheel'
      ? (result?.prize ?? 0)
      : game === 'crash'
        ? Math.floor(ENTRY_FEE_FRG * (result?.multiplier ?? 0))
        : game === 'darts'
          ? (result?.amount ?? 0)
          : game === 'mines'
            ? (result?.amount ?? 0)
            : game === 'pinball'
              ? (result?.amount ?? 0)
              : ['breakout', 'flight', 'tower', 'slice'].includes(game)
                ? (result?.amount ?? 0)
                : PRIZE_FRG;

  const claim = useCallback(async () => {
    setError('');
    try {
      setBusyText('Paying your prize from the treasury…');
      setScreen('claiming');
      const { payoutTxhash } = await claimPrize(session, result);
      setPayout(payoutTxhash);
      setScreen('claimed');
    } catch (e) {
      setScreen('won');
      setError(e.message || 'Claim failed — your session is still valid, try again.');
    }
  }, [session, result]);

  const toLobby = () => {
    setSession(null);
    setResult(null);
    setPayout(null);
    setError('');
    setScreen('lobby');
  };

  return (
    <div className="app">
      <header>
        <h1>🥊 FRG FIGHT CLUB</h1>
        <p className="tag">Play. Win. Get paid in FRG.</p>
      </header>

      <WalletBar balance={balance} setBalance={setBalance} />

      {error && <div className="error">⚠️ {error}</div>}

      {pendingTx && screen === 'lobby' && (
        <div className="error">
          ⏳ Entry payment pending verification.
          <button className="btn btn-big" onClick={retryVerify}>
            Retry verification (don’t pay again)
          </button>
        </div>
      )}

      {payStuck && screen === 'lobby' && (
        <div className="error">
          ⏳ Wallet approval got stuck coming back. If you approved in
          your wallet, your entry may already be on-chain.
          <button className="btn btn-big" onClick={recoverByScan}>
            Check for my payment (don’t pay again)
          </button>
        </div>
      )}

      {screen === 'lobby' && (
        <main>
          <h2 className="section">Pick your game</h2>
          <div className="cards">
            {GAMES.map((g) => (
              <div key={g.id} className={`card ${g.live ? '' : 'soon'}`}>
                <div className="card-emoji">{g.emoji}</div>
                <div className="card-name">{g.name}</div>
                <div className="card-tag">{g.tagline}</div>
                {g.live ? (
                  <>
                    <div className="card-terms">{g.terms}</div>
                    <button
                      className="btn btn-big"
                      disabled={!connected}
                      onClick={() => enterGame(g.id)}
                    >
                      {connected ? g.playLabel : 'Connect wallet to play'}
                    </button>
                  </>
                ) : (
                  <div className="soon-badge">COMING SOON</div>
                )}
              </div>
            ))}
          </div>
          <p className="fineprint">
            Entry fees go to the game treasury. Winners are paid from the
            treasury after the server verifies the match. One entry = one
            match.
          </p>
        </main>
      )}

      {(screen === 'paying' || screen === 'claiming') && (
        <main className="center">
          <div className="spinner" />
          <p>{busyText}</p>
          {IS_IOS && screen === 'paying' && (
            <p className="ios-note">
              🍎 iPhone: after approving in your wallet, swipe up and
              return to Telegram (or this tab) — your payment is saved
              and the game resumes on its own.
            </p>
          )}
        </main>
      )}

      {screen === 'playing' && game === 'boxing' && <Boxing onFinish={onFinish} />}
      {screen === 'playing' && game === 'wheel' && <PrizeWheel onFinish={onFinish} />}
      {screen === 'playing' && game === 'crash' && <RocketCrash onFinish={onFinish} />}
      {screen === 'playing' && game === 'darts' && <BalloonDarts onFinish={onFinish} />}
      {screen === 'playing' && game === 'racing' && <DragRacing onFinish={onFinish} />}
      {screen === 'playing' && game === 'mines' && <Mines onFinish={onFinish} />}
      {screen === 'playing' && game === 'pinball' && <Pinball onFinish={onFinish} />}
      {screen === 'playing' && game === 'breakout' && <Breakout onFinish={onFinish} />}
      {screen === 'playing' && game === 'flight' && <Flight onFinish={onFinish} />}
      {screen === 'playing' && game === 'tower' && <Tower onFinish={onFinish} />}
      {screen === 'playing' && game === 'slice' && <Slice onFinish={onFinish} />}

      {screen === 'won' && game === 'pinball' && (
        <main className="center">
          <div className="result-emoji">👾</div>
          <h2>{result?.score?.toLocaleString()} points!</h2>
          <p>
            That score pays <b>{result?.amount} FRG</b>. Claim it to your
            wallet.
          </p>
          <button className="btn btn-big" onClick={claim}>
            Claim {winAmount} FRG
          </button>
          <button className="btn btn-ghost" onClick={toLobby}>
            Back to lobby
          </button>
        </main>
      )}
      {screen === 'won' && game === 'breakout' && (
        <main className="center">
          <div className="result-emoji">🧱</div>
          <h2>{result?.score?.toLocaleString()} points!</h2>
          <p>
             That score pays <b>{result?.amount} FRG</b>. Claim it to
            your wallet.
          </p>
          <button className="btn btn-big" onClick={claim}>
            Claim {winAmount} FRG
          </button>
          <button className="btn btn-ghost" onClick={toLobby}>
            Back to lobby
          </button>
        </main>
      )}
      {screen === 'won' && game === 'flight' && (
        <main className="center">
          <div className="result-emoji">🚀</div>
          <h2>{result?.score?.toLocaleString()} points!</h2>
          <p>
            {result?.gates} gates flown. That score pays <b>{result?.amount} FRG</b>. Claim it to
            your wallet.
          </p>
          <button className="btn btn-big" onClick={claim}>
            Claim {winAmount} FRG
          </button>
          <button className="btn btn-ghost" onClick={toLobby}>
            Back to lobby
          </button>
        </main>
      )}
      {screen === 'won' && game === 'tower' && (
        <main className="center">
          <div className="result-emoji">🏗️</div>
          <h2>{result?.score?.toLocaleString()} points!</h2>
          <p>
            {result?.blocks} blocks stacked. That score pays <b>{result?.amount} FRG</b>. Claim it to
            your wallet.
          </p>
          <button className="btn btn-big" onClick={claim}>
            Claim {winAmount} FRG
          </button>
          <button className="btn btn-ghost" onClick={toLobby}>
            Back to lobby
          </button>
        </main>
      )}
      {screen === 'won' && game === 'slice' && (
        <main className="center">
          <div className="result-emoji">⚔️</div>
          <h2>{result?.score?.toLocaleString()} points!</h2>
          <p>
            {result?.sliced} items sliced. That score pays <b>{result?.amount} FRG</b>. Claim it to
            your wallet.
          </p>
          <button className="btn btn-big" onClick={claim}>
            Claim {winAmount} FRG
          </button>
          <button className="btn btn-ghost" onClick={toLobby}>
            Back to lobby
          </button>
        </main>
      )}

      {screen === 'won' && game === 'mines' && (
        <main className="center">
          <div className="result-emoji">💎</div>
          <h2>You banked the gems!</h2>
          <p>
            Dug up <b>{result?.picks} gem{result?.picks > 1 ? 's' : ''}</b> and
            walked away clean. Claim your FRG.
          </p>
          <button className="btn btn-big" onClick={claim}>
            Claim {winAmount} FRG
          </button>
          <button className="btn btn-ghost" onClick={toLobby}>
            Back to lobby
          </button>
        </main>
      )}

      {screen === 'won' && game === 'racing' && (
        <main className="center">
          <div className="result-emoji">🏁</div>
          <h2>You outran him!</h2>
          <p>
            Your ET <b>{(result?.etMs / 1000).toFixed(2)}s</b> vs rival{' '}
            {(result?.rivalEtMs / 1000).toFixed(2)}s · ⚡ Perfect shifts:{' '}
            {result?.perfectShifts}/4
          </p>
          <button className="btn btn-big" onClick={claim}>
            Claim {PRIZE_FRG} FRG
          </button>
          <button className="btn btn-ghost" onClick={toLobby}>
            Back to lobby
          </button>
        </main>
      )}

      {screen === 'won' && game === 'darts' && (
        <main className="center">
          <div className="result-emoji">🎈</div>
          <h2>Pot banked!</h2>
          <p>
            You walked away with <b>{result?.amount} FRG</b>. Claim it to
            your wallet.
          </p>
          <button className="btn btn-big" onClick={claim}>
            Claim {winAmount} FRG
          </button>
          <button className="btn btn-ghost" onClick={toLobby}>
            Back to lobby
          </button>
        </main>
      )}

      {screen === 'won' && game === 'crash' && (
        <main className="center">
          <div className="result-emoji">🚀</div>
          <h2>You bailed in time!</h2>
          <p>
            Cashed out at <b>{result?.multiplier?.toFixed(2)}×</b> — claim
            your FRG.
          </p>
          <button className="btn btn-big" onClick={claim}>
            Claim {winAmount} FRG
          </button>
          <button className="btn btn-ghost" onClick={toLobby}>
            Back to lobby
          </button>
        </main>
      )}

      {screen === 'won' && game === 'wheel' && (
        <main className="center">
          <div className="result-emoji">🎡</div>
          <h2>The wheel paid out!</h2>
          <p>
            You landed <b>{result?.prize} FRG</b>. Claim it to your wallet.
          </p>
          <button className="btn btn-big" onClick={claim}>
            Claim {winAmount} FRG
          </button>
          <button className="btn btn-ghost" onClick={toLobby}>
            Back to lobby
          </button>
        </main>
      )}

      {screen === 'won' && game === 'boxing' && (
        <main className="center">
          <div className="result-emoji">🏆</div>
          <h2>You win!</h2>
          <p>
            ⭐ Points: <b>{result?.points ?? 0}</b> · Damage dealt:{' '}
            {result?.damageDealt} · Rounds {result?.rounds}
          </p>
          <button className="btn btn-big" onClick={claim}>
            Claim {PRIZE_FRG} FRG
          </button>
          <button className="btn btn-ghost" onClick={toLobby}>
            Back to lobby
          </button>
        </main>
      )}

      {screen === 'claimed' && (
        <main className="center">
          <div className="result-emoji">💸</div>
          <h2>Prize sent!</h2>
          <p>
            {winAmount} FRG is on its way to your wallet.
            {payout && (
              <>
                {' '}
                <a href={finderTxUrl(payout)} target="_blank" rel="noreferrer">
                  View on Finder
                </a>
              </>
            )}
          </p>
          <button className="btn btn-big" onClick={toLobby}>
            Back to lobby
          </button>
        </main>
      )}

      {screen === 'lost' && game === 'wheel' && (
        <main className="center">
          <div className="result-emoji">🎡</div>
          <h2>BUST. The wheel takes this one.</h2>
          <p>No prize this spin — every entry is a fresh spin.</p>
          <button className="btn btn-big" onClick={toLobby}>
            Back to lobby
          </button>
        </main>
      )}

      {screen === 'lost' && game === 'crash' && (
        <main className="center">
          <div className="result-emoji">💥</div>
          <h2>The rocket blew at {result?.multiplier?.toFixed(2)}×.</h2>
          <p>Rode it too long this time — every entry is a fresh launch.</p>
          <button className="btn btn-big" onClick={toLobby}>
            Back to lobby
          </button>
        </main>
      )}

      {screen === 'lost' && game === 'darts' && (
        <main className="center">
          <div className="result-emoji">💥</div>
          {result?.burst ? (
            <>
              <h2>BURST! The 💥 balloon ate your pot.</h2>
              <p>Greed is a balloon animal — it pops. Every entry is a fresh wall.</p>
            </>
          ) : (
            <>
              <h2>Out of darts — pot came up empty.</h2>
              <p>Three balloons, no prizes inside. Every entry is a fresh wall.</p>
            </>
          )}
          <button className="btn btn-big" onClick={toLobby}>
            Back to lobby
          </button>
        </main>
      )}

      {screen === 'lost' && game === 'racing' && (
        <main className="center">
          <div className="result-emoji">{result?.outcome === 'foul' ? '🚨' : '🏎️'}</div>
          {result?.outcome === 'foul' ? (
            <>
              <h2>RED LIGHT! You jumped the tree.</h2>
              <p>Foul start — no time recorded. Every entry is a fresh race.</p>
            </>
          ) : (
            <>
              <h2>Outrun this time.</h2>
              <p>
                Your ET <b>{(result?.etMs / 1000).toFixed(2)}s</b> vs rival{' '}
                {(result?.rivalEtMs / 1000).toFixed(2)}s · ⚡ Perfect shifts:{' '}
                {result?.perfectShifts}/4. Every entry is a fresh race.
              </p>
            </>
          )}
          <button className="btn btn-big" onClick={toLobby}>
            Back to lobby
          </button>
        </main>
      )}

      {screen === 'lost' && game === 'mines' && (
        <main className="center">
          <div className="result-emoji">💣</div>
          <h2>BOOM. The mine took it.</h2>
          <p>
            You had {result?.picks ?? 0} gem{result?.picks === 1 ? '' : 's'} dug
            when it blew. Every entry is a fresh board.
          </p>
          <button className="btn btn-big" onClick={toLobby}>
            Back to lobby
          </button>
        </main>
      )}

      {screen === 'lost' && game === 'pinball' && (
        <main className="center">
          <div className="result-emoji">👾</div>
          <h2>{result?.score?.toLocaleString()} points — just short.</h2>
          <p>
            The first payout tier starts at 1,500 points. Every entry is a
            fresh table.
          </p>
          <button className="btn btn-big" onClick={toLobby}>
            Back to lobby
          </button>
        </main>
      )}
      {screen === 'lost' && game === 'breakout' && (
        <main className="center">
          <div className="result-emoji">🧱</div>
          <h2>{result?.score?.toLocaleString()} points — just short.</h2>
          <p>
            The first payout tier starts at 600 points. Every entry is a fresh wall.
          </p>
          <button className="btn btn-big" onClick={toLobby}>
            Back to lobby
          </button>
        </main>
      )}
      {screen === 'lost' && game === 'flight' && (
        <main className="center">
          <div className="result-emoji">🚀</div>
          <h2>{result?.score?.toLocaleString()} points — just short.</h2>
          <p>
            The first payout tier starts at 500 points. Every entry is a fresh flight.
          </p>
          <button className="btn btn-big" onClick={toLobby}>
            Back to lobby
          </button>
        </main>
      )}
      {screen === 'lost' && game === 'tower' && (
        <main className="center">
          <div className="result-emoji">🏗️</div>
          <h2>{result?.score?.toLocaleString()} points — just short.</h2>
          <p>
            The first payout tier starts at 800 points. Every entry is a fresh tower.
          </p>
          <button className="btn btn-big" onClick={toLobby}>
            Back to lobby
          </button>
        </main>
      )}
      {screen === 'lost' && game === 'slice' && (
        <main className="center">
          <div className="result-emoji">⚔️</div>
          <h2>{result?.score?.toLocaleString()} points — just short.</h2>
          <p>
            The first payout tier starts at 600 points. Every entry is a fresh round.
          </p>
          <button className="btn btn-big" onClick={toLobby}>
            Back to lobby
          </button>
        </main>
      )}

      {screen === 'lost' && game === 'boxing' && (
        <main className="center">
          <div className="result-emoji">🥴</div>
          <h2>The Champ keeps the belt.</h2>
          <p>
            ⭐ Points: {result?.points ?? 0} · Damage dealt:{' '}
            {result?.damageDealt} · Rounds {result?.rounds}.
            Every entry is a fresh match.
          </p>
          <button className="btn btn-big" onClick={toLobby}>
            Back to lobby
          </button>
        </main>
      )}
    </div>
  );
}
