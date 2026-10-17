import { useCallback, useState } from 'react';
import WalletBar, { usePlayer } from './WalletBar.jsx';
import Boxing from './games/Boxing.jsx';
import PrizeWheel from './games/PrizeWheel.jsx';
import { ENTRY_FEE_FRG, PRIZE_FRG, GAMES } from './config.js';
import { finderTxUrl, findRecentEntries } from './chain.js';
import { verifyEntry, claimPrize } from './api.js';

// Screen flow: lobby → paying (wallet) → verifying (server) → playing →
// won (claim) / lost → lobby
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
          setTimeout(() => reject(new Error('__pay_timeout__')), 90_000)
        ),
      ]);
      if (!txhash) throw new Error('Wallet did not return a tx hash.');

      setBusyText('Verifying your payment on-chain…');
      const { sessionToken } = await verifyEntry(txhash, address, gameId);
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
          'The wallet approval did not come back — Telegram may have frozen the game while you were in the wallet. If you approved, your payment may already be on-chain: use "Check for my payment" below.'
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
      const { sessionToken } = await verifyEntry(pendingTx, address, game);
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

  const onFinish = useCallback((r) => {
    setResult(r);
    if (game === 'wheel') {
      setScreen(r.prize > 0 ? 'won' : 'lost');
    } else {
      setScreen(r.outcome === 'win' ? 'won' : 'lost');
    }
  }, [game]);

  const winAmount = game === 'wheel' ? (result?.prize ?? 0) : PRIZE_FRG;

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
        </main>
      )}

      {screen === 'playing' && game === 'boxing' && <Boxing onFinish={onFinish} />}
      {screen === 'playing' && game === 'wheel' && <PrizeWheel onFinish={onFinish} />}

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

      {screen === 'won' && game !== 'wheel' && (
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

      {screen === 'lost' && game !== 'wheel' && (
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
