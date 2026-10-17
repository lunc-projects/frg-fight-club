import { useCallback, useState } from 'react';
import WalletBar, { usePlayer } from './WalletBar.jsx';
import Boxing from './games/Boxing.jsx';
import { ENTRY_FEE_FRG, PRIZE_FRG, GAMES } from './config.js';
import { finderTxUrl } from './chain.js';
import { verifyEntry, claimPrize } from './api.js';

// Screen flow: lobby → paying (wallet) → verifying (server) → playing →
// won (claim) / lost → lobby
export default function App() {
  const { address, payEntry } = usePlayer();
  const [balance, setBalance] = useState(null);
  const [screen, setScreen] = useState('lobby');
  const [session, setSession] = useState(null);
  const [pendingTx, setPendingTx] = useState(null);
  const [result, setResult] = useState(null);
  const [payout, setPayout] = useState(null);
  const [error, setError] = useState('');
  const [busyText, setBusyText] = useState('');

  const connected = !!address;

  const enterBoxing = useCallback(async () => {
    setError('');
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
      txhash = await payEntry();
      if (!txhash) throw new Error('Wallet did not return a tx hash.');

      setBusyText('Verifying your payment on-chain…');
      const { sessionToken } = await verifyEntry(txhash, address);
      setSession(sessionToken);
      setPendingTx(null);
      setResult(null);
      setPayout(null);
      setScreen('playing');
    } catch (e) {
      setScreen('lobby');
      if (txhash) {
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
      const { sessionToken } = await verifyEntry(pendingTx, address);
      setSession(sessionToken);
      setPendingTx(null);
      setResult(null);
      setPayout(null);
      setScreen('playing');
    } catch (e) {
      setScreen('lobby');
      setError(
        'Still not verified — the chain may need a few more seconds. Wait a moment and retry; your payment is not lost.'
      );
    }
  }, [pendingTx, address]);

  const onFinish = useCallback((matchResult) => {
    setResult(matchResult);
    setScreen(matchResult.outcome === 'win' ? 'won' : 'lost');
  }, []);

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
                    <div className="card-terms">
                      Entry {ENTRY_FEE_FRG} FRG · Win {PRIZE_FRG} FRG
                    </div>
                    <button
                      className="btn btn-big"
                      disabled={!connected}
                      onClick={enterBoxing}
                    >
                      {connected
                        ? `Pay ${ENTRY_FEE_FRG} FRG & Fight`
                        : 'Connect wallet to play'}
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

      {screen === 'playing' && <Boxing onFinish={onFinish} />}

      {screen === 'won' && (
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
            {PRIZE_FRG} FRG is on its way to your wallet.
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

      {screen === 'lost' && (
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
