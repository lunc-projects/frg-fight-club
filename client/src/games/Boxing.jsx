import { useEffect, useRef, useState } from 'react';

// ---------------------------------------------------------------------------
// FRG Boxing — retro arcade-style fighting game (Punch-Out-inspired).
//
// - Pick 1 of 3 opponents (rookie → contender → champion).
// - The opponent GLOWS (tell) right before swinging: jab him in that
//   instant to earn a STAR and leave him dizzy.
// - STAR PUNCH spends a star on a huge uppercut. Getting hit loses all stars.
// - Dodging a hook restores a HEART and leaves him wide open.
// - Getting hit or punching his guard costs a heart; at 0 hearts you're
//   gassed (no punches) until you dodge.
// - Knockdowns: 3 in a round = TKO; if YOU go down, mash JAB to beat the
//   10-count. Points for everything. 3 rounds, then the judges decide.
// ---------------------------------------------------------------------------

const ROUND_SECONDS = 60;
const ROUNDS = 3;
const MAX_HP = 100;

export const OPPONENTS = [
  {
    id: 'gus',
    name: 'GLASS-JAW GUS',
    cls: 'ROOKIE',
    desc: 'All heart, no chin. Slow, obvious wind-ups.',
    hp: 150,
    tell: [450, 585],
    hook: [15, 20],
    guard: 0.32,
    pace: [670, 1065],
    feint: 0.14,
    combo: 0.17,
    scale: 0.94,
  },
  {
    id: 'champ',
    name: 'THE CHAMP',
    cls: 'CHAMPION',
    desc: 'The final boss. Blink and you are on the canvas.',
    hp: 245,
    tell: [250, 355],
    hook: [25, 32],
    guard: 0.48,
    pace: [400, 710],
    feint: 0.24,
    combo: 0.28,
    scale: 1.1,
  },
];

const rnd = (a, b) => a + Math.random() * (b - a);
const irnd = (a, b) => Math.floor(rnd(a, b + 1));
const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
const ENEMY_FRAME = {
  idle: 'idle',
  taunt: 'taunt',
  tell: 'tell',
  attack: 'attack',
  stunned: 'dizzy',
  recover: 'idle',
  down: 'down',
};

const fmtClock = (s) => {
  const t = Math.max(0, Math.ceil(s));
  return `${Math.floor(t / 60)}:${String(t % 60).padStart(2, '0')}`;
};

function freshState(opp) {
  return {
    phase: 'select', // select | fight | roundEnd | edown | pdown | done
    opp,
    round: 1,
    timeLeft: ROUND_SECONDS,
    pHp: MAX_HP,
    eHp: opp.hp,
    eMax: opp.hp,
    hearts: 9,
    stars: 0,
    points: 0,
    pDown: 0,
    eDown: 0,
    pDownRound: 0,
    eDownRound: 0,
    pRounds: 0,
    eRounds: 0,
    enemy: 'idle',
    eTimer: 1100,
    count: 0,
    countTimer: 0,
    getUpAt: 6,
    mash: 0,
    dodging: 0,
    dodgeDir: 0,
    blocking: false,
    tired: false,
    stunImmune: 0,
    stunHits: 0,
    feint: false,
    msg: 'Touch gloves!',
    damageDealt: 0,
    taken: 0,
    sway: 0,
    dmgNums: [],
    shake: false,
    punch: '',
    punchUntil: 0,
  };
}

export default function Boxing({ onFinish }) {
  const state = useRef(freshState(OPPONENTS[1]));
  const [, setUi] = useState(0);
  const startedAt = useRef(null);
  const finished = useRef(false);
  const dmgId = useRef(0);

  const render = () => setUi((n) => n + 1);
  const S = state.current;

  const haptic = (style) => {
    try {
      window.Telegram?.WebApp?.HapticFeedback?.impactOccurred(style);
    } catch {
      /* not in Telegram */
    }
  };

  function shake() {
    S.shake = true;
    setTimeout(() => {
      S.shake = false;
      render();
    }, 320);
  }

  function dmgNum(txt, hurt) {
    const id = ++dmgId.current;
    S.dmgNums = [...S.dmgNums.slice(-5), { id, txt, hurt }];
    setTimeout(() => {
      S.dmgNums = S.dmgNums.filter((d) => d.id !== id);
      render();
    }, 820);
  }

  // ---- match flow ----------------------------------------------------------
  function endMatch(outcome, how) {
    if (finished.current) return;
    finished.current = true;
    if (outcome === 'win') {
      S.points += how.includes('decision') ? 500 : 1000;
    }
    S.phase = 'done';
    render();
    const durationMs = startedAt.current ? Date.now() - startedAt.current : 0;
    setTimeout(
      () =>
        onFinish({
          outcome,
          how,
          opponent: S.opp.name,
          points: S.points,
          durationMs,
          damageDealt: Math.round(S.damageDealt),
          rounds: `${S.pRounds}-${S.eRounds}`,
        }),
      1400
    );
  }

  function enemyDown() {
    S.eDown += 1;
    S.eDownRound += 1;
    S.points += 300;
    if (S.eDownRound >= 3) {
      endMatch('win', 'TKO — three knockdowns in one round');
      return;
    }
    S.enemy = 'down';
    S.phase = 'edown';
    S.count = 0;
    S.countTimer = 0;
    S.getUpAt = irnd(4, 7);
    S.msg = '💥 DOWN HE GOES! +300 pts. The ref is counting…';
    haptic('heavy');
    shake();
    render();
  }

  function playerDown() {
    S.pDown += 1;
    S.pDownRound += 1;
    S.phase = 'pdown';
    S.count = 0;
    S.countTimer = 0;
    S.mash = 0;
    S.msg = "😖 You're down! Mash JAB to get up before 10!";
    haptic('heavy');
    shake();
    render();
  }

  function endRound() {
    const pWon = S.pHp >= S.eHp;
    if (pWon) {
      S.pRounds += 1;
      S.points += 100;
    } else {
      S.eRounds += 1;
    }
    if (S.round >= ROUNDS) {
      const win =
        S.pRounds > S.eRounds ||
        (S.pRounds === S.eRounds && S.pHp >= S.eHp);
      endMatch(win ? 'win' : 'loss', "Judges' decision");
      return;
    }
    S.phase = 'roundEnd';
    S.msg = pWon
      ? `🔔 Round ${S.round} is yours (+100 pts). Corner rest: +20 HP, hearts back.`
      : `🔔 Round ${S.round} to ${S.opp.name}. Corner rest: +20 HP, hearts back.`;
    render();
    setTimeout(() => {
      S.round += 1;
      S.timeLeft = ROUND_SECONDS;
      S.pHp = clamp(S.pHp + 10, 1, MAX_HP);
      S.eHp = clamp(S.eHp + 20, 1, S.eMax);
      S.hearts = Math.max(S.hearts, 8);
      S.tired = S.hearts <= 0;
      S.pDownRound = 0;
      S.eDownRound = 0;
      S.enemy = 'idle';
      S.eTimer = 1300;
      S.phase = 'fight';
      S.msg = `Round ${S.round} — fight!`;
      render();
    }, 2800);
  }

  // ---- combat ---------------------------------------------------------------
  function hurtPlayer(dmg, why) {
    S.pHp -= dmg;
    S.taken += dmg;
    if (S.stars > 0) {
      S.stars = 0;
      S.msg = `💥 ${why} You lost your stars!`;
    } else {
      S.msg = `💥 ${why}`;
    }
    S.hearts = Math.max(0, S.hearts - 1);
    if (S.hearts <= 0) S.tired = true;
    dmgNum(`-${Math.round(dmg)}`, true);
    haptic('heavy');
    shake();
    if (S.pHp <= 0) playerDown();
  }

  function hurtEnemy(dmg, label) {
    S.eHp -= dmg;
    S.damageDealt += dmg;
    dmgNum(`-${Math.round(dmg)}`, false);
    if (label) S.msg = label;
    if (S.eHp <= 0) enemyDown();
  }

  function flashGlove() {
    S.punch = S.punch === 'jabL' ? 'jabR' : 'jabL';
    S.punchUntil = Date.now() + 130;
  }

  function jab() {
    if (S.phase === 'pdown') {
      S.mash += 1;
      return;
    }
    // Punch recovery: mashing the button faster than a real arm throws
    // does nothing. Timing beats tapping.
    const nowMs = Date.now();
    if (nowMs - (S.lastJab || 0) < 170) return;
    S.lastJab = nowMs;
    if (S.phase !== 'fight' || S.dodging > 0) return;
    flashGlove();
    if (S.tired) {
      S.msg = "😮‍💨 You're gassed — no hearts! Dodge a punch to get one back.";
      render();
      return;
    }
    if (S.enemy === 'tell') {
      if (S.feint) {
        // You bit on the fake — eat the counter.
        S.feint = false;
        S.enemy = 'recover';
        S.eTimer = rnd(600, 900);
        hurtPlayer(
          rnd(S.opp.hook[0], S.opp.hook[1]) + 3,
          'FAKE-OUT! He counters your jab!'
        );
        render();
        return;
      }
      if (S.stunImmune > 0) {
        // You caught the flash — star's yours — but he's fighting
        // wary now: no stun, and his punch is still coming.
        if (S.stars < 3) S.stars += 1;
        S.points += 50;
        S.msg = "⭐ STAR EARNED — but he's wary, no stun! Dodge what's coming!";
        S.eTimer = 130;
        hurtEnemy(rnd(3, 5));
        haptic('medium');
        render();
        return;
      }
      if (S.stars < 3) {
        S.stars += 1;
        S.msg = "⭐ STAR EARNED! +50 pts. He's dizzy — pound him!";
      } else {
        S.msg = "Caught him flush! +50 pts. He's dizzy — pound him!";
      }
      S.points += 50;
      S.enemy = 'stunned';
      S.stunHits = 0;
      S.eTimer = rnd(900, 1200);
      hurtEnemy(rnd(3, 5));
      haptic('medium');
      render();
      return;
    }
    if (S.enemy === 'attack') {
      hurtPlayer(rnd(S.opp.hook[0], S.opp.hook[1]), 'His hook lands first!');
      render();
      return;
    }
    if (S.enemy === 'stunned') {
      S.points += 10;
      S.stunHits += 1;
      hurtEnemy(rnd(3, 4), "Hammering him while he's dizzy! 👊");
      if (S.stunHits >= 4 && S.phase === 'fight') {
        // Four free ones is all you get — he fights his way out of it.
        S.enemy = 'recover';
        S.eTimer = rnd(500, 800);
        S.stunImmune = 2600;
        S.msg = "He shakes it off early — and he's wary now!";
      }
      haptic('light');
      render();
      return;
    }
    if (S.enemy === 'down') return;
    if (Math.random() < S.opp.guard) {
      S.hearts = Math.max(0, S.hearts - 1);
      if (S.hearts <= 0) S.tired = true;
      S.msg = '🛡️ Blocked! Punching his guard costs a heart.';
      haptic('light');
      render();
      return;
    }
    if (S.enemy === 'taunt') {
      S.points += 20;
      hurtEnemy(rnd(3, 4), 'Caught him showing off! +20 pts 👊');
    } else {
      S.points += 10;
      hurtEnemy(rnd(3, 4), 'Jab lands. +10 pts 👊');
    }
    haptic('light');
    render();
  }

  function starPunch() {
    if (S.phase !== 'fight') return;
    if (S.stars <= 0) {
      S.msg = 'No stars yet — jab him during his flash ⚠️ to earn one.';
      render();
      return;
    }
    if (S.enemy === 'attack') {
      hurtPlayer(
        rnd(S.opp.hook[0], S.opp.hook[1]),
        'Star punch too slow — his hook lands!'
      );
      render();
      return;
    }
    if (S.enemy === 'tell' && S.feint) {
      S.feint = false;
      S.enemy = 'recover';
      S.eTimer = rnd(600, 900);
      hurtPlayer(
        rnd(S.opp.hook[0], S.opp.hook[1]) + 3,
        'FAKE-OUT! He counters your star punch!'
      );
      render();
      return;
    }
    S.stars -= 1;
    S.points += 150;
    flashGlove();
    hurtEnemy(rnd(13, 18), '🌟 STAR UPPERCUT! +150 pts!');
    if (S.enemy !== 'down' && S.phase === 'fight' && S.stunImmune <= 0) {
      S.enemy = 'stunned';
      S.stunHits = 0;
      S.eTimer = rnd(1000, 1400);
    }
    haptic('heavy');
    render();
  }

  function dodge(dir) {
    if (S.phase !== 'fight') return;
    S.dodging = 260;
    S.dodgeDir = dir;
    render();
  }

  function setBlocking(on) {
    if (S.phase !== 'fight') return;
    S.blocking = on;
    render();
  }

  function startFight(opp) {
    state.current = freshState(opp);
    state.current.phase = 'fight';
    state.current.msg = 'Round 1 — fight! Watch for his flash ⚠️';
    finished.current = false;
    startedAt.current = Date.now();
    render();
  }

  // ---- main loop --------------------------------------------------------------
  useEffect(() => {
    const iv = setInterval(() => {
      const st = state.current;

      if (st.phase === 'fight' && (st.enemy === 'idle' || st.enemy === 'taunt')) {
        st.sway += 0.05;
      }
      if (st.dodging > 0) st.dodging -= 50;
      if (st.punch && Date.now() > st.punchUntil) st.punch = '';

      if (st.phase === 'edown' || st.phase === 'pdown') {
        st.countTimer += 50;
        if (st.countTimer >= 620) {
          st.countTimer = 0;
          st.count += 1;
        }
        if (st.phase === 'pdown' && st.mash >= 9) {
          st.phase = 'fight';
          st.pHp = 28;
          st.hearts = Math.max(st.hearts, 4);
          st.tired = false;
          st.enemy = 'idle';
          st.eTimer = 1500;
          st.msg = '⬆️ You beat the count! Back in it with 28 HP.';
          haptic('heavy');
        } else if (st.phase === 'edown' && st.count >= st.getUpAt) {
          st.phase = 'fight';
          st.eHp = Math.round(st.eMax * 0.32);
          st.enemy = 'idle';
          st.stunImmune = 2600;
          st.eTimer = 1500;
          st.msg = `He's up at ${st.count}! Wobbly — finish him this round.`;
        }
        if (st.count >= 10) {
          if (st.phase === 'pdown') {
            endMatch('loss', 'Knockout — you stayed down for 10');
          } else {
            endMatch('win', 'KNOCKOUT — he stayed down for 10');
          }
        }
        render();
        return;
      }

      if (st.phase !== 'fight') return;

      st.timeLeft -= 0.05;
      st.eTimer -= 50;
      if (st.stunImmune > 0) st.stunImmune -= 50;

      if (st.enemy === 'idle' && st.eTimer <= 0) {
        if (Math.random() < 0.15) {
          st.enemy = 'taunt';
          st.eTimer = rnd(800, 1200);
          st.msg = `😜 ${st.opp.name} is showing off…`;
        } else if (Math.random() < st.opp.feint) {
          // FAKE wind-up: looks exactly like a tell, but jabbing it
          // eats a counter and it converts to a fast attack.
          st.enemy = 'tell';
          st.feint = true;
          st.eTimer = rnd(170, 250);
          st.msg = "⚠️ He's winding up — jab NOW for a ⭐, or dodge!";
        } else {
          st.enemy = 'tell';
          st.feint = false;
          st.eTimer = rnd(st.opp.tell[0], st.opp.tell[1]) - (st.round - 1) * 40;
          st.msg = "⚠️ He's winding up — jab NOW for a ⭐, or dodge!";
        }
      } else if (st.enemy === 'taunt' && st.eTimer <= 0) {
        st.enemy = 'idle';
        st.eTimer = rnd(st.opp.pace[0], st.opp.pace[1]);
      } else if (st.enemy === 'tell' && st.eTimer <= 0) {
        st.enemy = 'attack';
        if (st.feint) {
          st.feint = false;
          st.eTimer = 180;
          st.msg = '😱 It was a FAKE — here it comes, fast!';
        } else {
          st.eTimer = 230;
        }
      } else if (st.enemy === 'attack' && st.eTimer <= 0) {
        if (st.dodging > 0) {
          st.hearts = clamp(st.hearts + 1, 0, 20);
          st.tired = false;
          st.points += 20;
          if (Math.random() < st.opp.combo) {
            // No rest for the slick: he chains a second hook.
            st.enemy = 'attack';
            st.eTimer = 230;
            st.msg = "💨 You dodged — but he comes RIGHT back with another!";
          } else if (st.stunImmune > 0) {
            // Clean dodge still pays a heart + points, but a wary
            // opponent doesn't hand you a free stun window.
            st.enemy = 'recover';
            st.eTimer = rnd(500, 800);
            st.msg = "💨 Clean dodge! +1 ❤️ +20 pts — but he's wary, no free shots!";
          } else {
            st.enemy = 'stunned';
            st.stunHits = 0;
            st.eTimer = rnd(800, 1100);
            st.msg = "💨 Clean dodge! +1 ❤️ +20 pts — and he's wide open!";
          }
          haptic('medium');
        } else if (st.blocking) {
          st.pHp -= rnd(2, 4);
          st.taken += 3;
          st.msg = '🛡️ Blocked his hook — chip damage only.';
          st.enemy = 'recover';
          st.eTimer = rnd(500, 800);
          if (st.pHp <= 0) playerDown();
          else if (Math.random() < st.opp.combo / 2) {
            st.enemy = 'attack';
            st.eTimer = 230;
            st.msg = '🛡️ Blocked — but he shrugs it off and swings AGAIN!';
          }
        } else {
          hurtPlayer(
            rnd(st.opp.hook[0], st.opp.hook[1]) + (st.round - 1) * 2,
            'His hook connects!'
          );
          if (st.phase === 'fight') {
            st.enemy = 'recover';
            st.eTimer = rnd(600, 900);
          }
        }
      } else if (st.enemy === 'stunned' && st.eTimer <= 0) {
        st.enemy = 'idle';
        st.stunImmune = 2600;
        st.eTimer = rnd(st.opp.pace[0], st.opp.pace[1]);
        st.msg = 'He shakes it off — and he\'s wary now.';
      } else if (st.enemy === 'recover' && st.eTimer <= 0) {
        st.enemy = 'idle';
        st.eTimer = rnd(st.opp.pace[0], st.opp.pace[1]);
      }

      if (st.phase === 'fight' && st.timeLeft <= 0) {
        endRound();
        return;
      }
      render();
    }, 50);
    return () => clearInterval(iv);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // keyboard for desktop testing
  useEffect(() => {
    const down = (e) => {
      if (e.code === 'Space') {
        e.preventDefault();
        jab();
      }
      if (e.code === 'ArrowLeft') dodge(-1);
      if (e.code === 'ArrowRight') dodge(1);
      if (e.code === 'ArrowUp') {
        e.preventDefault();
        starPunch();
      }
      if (e.code === 'ShiftLeft' || e.code === 'KeyB') setBlocking(true);
    };
    const up = (e) => {
      if (e.code === 'ShiftLeft' || e.code === 'KeyB') setBlocking(false);
    };
    window.addEventListener('keydown', down);
    window.addEventListener('keyup', up);
    return () => {
      window.removeEventListener('keydown', down);
      window.removeEventListener('keyup', up);
    };
  });

  // ---- render: opponent select ------------------------------------------------
  if (S.phase === 'select') {
    return (
      <div className="game">
        <h2>🥊 FRG Boxing</h2>
        <p className="select-sub">Choose your opponent</p>
        <div className="opp-cards">
          {OPPONENTS.map((o) => (
            <button key={o.id} className="opp-card" onClick={() => startFight(o)}>
              <img className="opp-thumb" src={`/sprites/${o.id}-idle.webp`} alt="" />
              <div className="opp-info">
                <div className="opp-name">{o.name}</div>
                <div className="opp-class">{o.cls}</div>
                <div className="opp-desc">{o.desc}</div>
              </div>
              <div className="opp-stats">
                HP {o.hp}
                <br />
                Hooks {o.hook[0]}–{o.hook[1]}
              </div>
            </button>
          ))}
        </div>
        <div className="rules">
          <p>✨ <b>Watch for the flash.</b> Your opponent glows right before he
            swings. Jab him in that instant: ⭐ <b>star</b> earned, and he's dizzy.</p>
          <p>😱 <b>Beware the fake.</b> Some flashes are feints — jab one and
            you'll eat a counter. A real flash lasts; a fake is gone in a blink.
            And dodge one hook, he may throw another right behind it.</p>
          <p>🌟 <b>Star Punch</b> spends a star on a huge uppercut. Get hit and
            you lose ALL your stars.</p>
          <p>↔️ <b>Dodge</b> his hooks to win back ❤️ hearts and leave him open.
            Getting hit or punching his guard costs hearts — at 0 you're gassed.</p>
          <p>💥 3 knockdowns in a round = TKO. If YOU go down, mash JAB to beat
            the 10-count. 3 rounds, then the judges decide.</p>
        </div>
      </div>
    );
  }

  // ---- render: fight ------------------------------------------------------------
  const enemyStateLabel =
    {
      idle: 'circling…',
      taunt: 'taunting!',
      tell: "⚠️ HE'S OPEN!",
      attack: 'SWINGING!',
      stunned: 'DIZZY — POUND HIM!',
      recover: 'recovering',
      down: 'DOWN!',
    }[S.enemy] || '';
  const playerFrame =
    S.phase === 'pdown'
      ? 'down'
      : S.punch
        ? S.punch
        : S.dodging > 0
          ? S.dodgeDir < 0
            ? 'dodgeL'
            : 'dodgeR'
          : 'idle';
  const swayPct =
    S.phase === 'fight' && (S.enemy === 'idle' || S.enemy === 'taunt')
      ? 50 + Math.sin(S.sway) * 7
      : 50;

  return (
    <div className="game">
      <div className="scoreboard">
        <div className="sb-cell">
          ⭐<span>{S.stars}</span> ❤️<span>{S.hearts}</span>
        </div>
        <div className="sb-cell sb-points">POINTS: {S.points}</div>
        <div className="sb-cell sb-time">
          <span>{fmtClock(S.timeLeft)}</span>
          <span className="rnd">ROUND {S.round}</span>
        </div>
      </div>
      <div className="hp-row">
        <div className="hp-col">
          <div className="hp-label">YOU{S.pDown ? ` · down ×${S.pDown}` : ''}</div>
          <div className="hpbar">
            <div className="hpfill pfill" style={{ width: `${clamp(S.pHp, 0, 100)}%` }} />
          </div>
        </div>
        <div className="hp-col right">
          <div className="hp-label">
            {enemyStateLabel} · {S.opp.name}
            {S.eDown ? ` · down ×${S.eDown}` : ''}
          </div>
          <div className="hpbar">
            <div
              className="hpfill efill"
              style={{ width: `${clamp((S.eHp / S.eMax) * 100, 0, 100)}%` }}
            />
          </div>
        </div>
      </div>

      <div className={`ring ${S.shake ? 'shake' : ''}`} style={{ backgroundImage: 'url(/sprites/ring-bg.webp)' }}>
        <div className="ropes" />
        <div
          className={`enemy ${S.enemy === 'tell' ? 'flash' : ''} ${S.enemy === 'attack' ? 'lunge' : ''} ${S.enemy === 'stunned' ? 'stunned' : ''} ${S.enemy === 'down' ? 'down' : ''} ${S.enemy === 'idle' || S.enemy === 'taunt' ? 'bob' : ''}`}
          style={{ left: `${swayPct}%` }}
        >
          <img
            src={`/sprites/${S.opp.id}-${ENEMY_FRAME[S.enemy] || 'idle'}.webp`}
            alt="Opponent boxer"
            style={{ height: `${Math.round((S.enemy === 'down' ? 120 : 262) * (S.opp.scale || 1))}px` }}
          />
        </div>
        {(S.phase === 'edown' || S.phase === 'pdown') && S.count > 0 && (
          <div className="countLbl">{S.count}</div>
        )}
        {S.dmgNums.map((d) => (
          <div key={d.id} className={`dmgnum ${d.hurt ? 'hurt' : ''}`}>
            {d.txt}
          </div>
        ))}
        <div
          className={`player ${S.dodging > 0 ? (S.dodgeDir < 0 ? 'dodgeL' : 'dodgeR') : ''} ${S.tired ? 'tired' : ''} ${S.phase === 'pdown' ? 'down' : ''}`}
        >
          <img src={`/sprites/player-${playerFrame}.webp`} alt="Your boxer" />
        </div>
      </div>

      <div className="msg">{S.msg}</div>
      {S.phase === 'pdown' && (
        <div className="mash">⬆️ GET UP! MASH 👊 JAB! ⬆️</div>
      )}

      <div className="controls-arcade">
        <button
          className="cbtn b-dodge"
          onPointerDown={(e) => {
            e.preventDefault();
            dodge(-1);
          }}
        >
          ◀ DODGE
        </button>
        <button
          className="cbtn b-jab"
          onPointerDown={(e) => {
            e.preventDefault();
            jab();
          }}
        >
          👊 JAB
        </button>
        <button
          className="cbtn b-dodge"
          onPointerDown={(e) => {
            e.preventDefault();
            dodge(1);
          }}
        >
          DODGE ▶
        </button>
      </div>
      <div className="controls-arcade2">
        <button
          className={`cbtn b-star ${S.stars > 0 ? 'ready' : ''}`}
          onPointerDown={(e) => {
            e.preventDefault();
            starPunch();
          }}
        >
          ⭐ STAR PUNCH
        </button>
        <button
          className={`cbtn b-block ${S.blocking ? 'active' : ''}`}
          onPointerDown={(e) => {
            e.preventDefault();
            setBlocking(true);
          }}
          onPointerUp={() => setBlocking(false)}
          onPointerLeave={() => setBlocking(false)}
          onPointerCancel={() => setBlocking(false)}
        >
          🛡️ BLOCK (hold)
        </button>
      </div>
      <div className="hint">Desktop: ←/→ dodge · Space jab · ↑ star punch · Shift block</div>
    </div>
  );
}
