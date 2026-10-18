import { useEffect, useRef, useState } from 'react';
import Matter from 'matter-js';

// FRG Pinball — a real physics table (matter-js): 3 balls, 3 pop
// bumpers, slingshots, F-R-G standup targets (light all three for
// the bonus), rollover lanes, and a charged plunger launch. Score
// converts to FRG by tiers — the table is in PINBALL_TIERS below
// and the server re-derives it exactly (keep the two in sync).
export const PINBALL_TIERS = [
  { min: 25000, amount: 45 },
  { min: 16000, amount: 32 },
  { min: 11000, amount: 22 },
  { min: 7000, amount: 15 },
  { min: 4000, amount: 10 },
  { min: 1500, amount: 5 },
];
export function pinballAmount(score) {
  for (const t of PINBALL_TIERS) if (score >= t.min) return t.amount;
  return 0;
}
const PTS = { bumper: 150, sling: 50, target: 250, bonus: 1000, lane: 150 };
const W = 400;
const H = 580;

export default function Pinball({ onFinish }) {
  const canvasRef = useRef(null);
  const wrapRef = useRef(null);
  const [hud, setHud] = useState({ score: 0, ball: 1, msg: 'Charge the plunger — tap LAUNCH to fire!', power: 0, waiting: true });
  const G = useRef(null);

  useEffect(() => {
    const { Engine, Bodies, Body, Composite, Constraint, Events, Vector } = Matter;
    const engine = Engine.create({ positionIterations: 8, velocityIterations: 6 });
    engine.gravity.y = 1.12;
    const world = engine.world;

    const S = {
      score: 0,
      ballsLeft: 3,
      ballInLane: true,
      launched: false,
      over: false,
      targets: { F: false, R: false, G: false },
      power: 0,
      powerDir: 1,
      charging: true,
      laneCooldown: {},
      bumperFlash: {},
      msg: 'Charge the plunger — tap LAUNCH to fire!',
      flipL: false,
      flipR: false,
      stuckSince: null,
      returnSince: null,
      mountedAt: Date.now(),
    };
    G.current = S;

    const wallOpts = { isStatic: true, restitution: 0.3, friction: 0.05, render: { visible: false } };
    const add = (b) => Composite.add(world, b);

    // --- Table furniture -------------------------------------------------
    add(Bodies.rectangle(10, 390, 20, 420, wallOpts)); // left wall
    add(Bodies.rectangle(394, 330, 14, 520, wallOpts)); // outer right (lane)
    add(Bodies.rectangle(375, 576, 36, 12, wallOpts)); // launch-lane floor
    add(Bodies.rectangle(356, 420, 12, 330, wallOpts)); // lane divider
    add(Bodies.rectangle(352, 208, 30, 8, { ...wallOpts, angle: -0.55 })); // lane deflector
    // Dome: arc of segments across the top
    for (let i = 0; i <= 10; i++) {
      const a = Math.PI + (i / 10) * Math.PI; // 180..360
      const cx = 196 + Math.cos(a) * 188;
      const cy = 196 + Math.sin(a) * 188;
      add(Bodies.rectangle(cx, cy, 64, 14, { ...wallOpts, angle: a + Math.PI / 2 }));
    }
    // Funnels to the flippers
    add(Bodies.rectangle(84, 516, 140, 12, { ...wallOpts, angle: 0.42 }));
    add(Bodies.rectangle(282, 516, 140, 12, { ...wallOpts, angle: -0.42 }));
    // Lane posts
    add(Bodies.circle(66, 472, 6, wallOpts));
    add(Bodies.circle(300, 472, 6, wallOpts));
    // Slingshots
    const slingL = Bodies.rectangle(108, 448, 66, 10, { ...wallOpts, angle: 0.85, label: 'sling' });
    const slingR = Bodies.rectangle(258, 448, 66, 10, { ...wallOpts, angle: -0.85, label: 'sling' });
    add(slingL); add(slingR);
    // Pop bumpers
    const bumpers = [
      Bodies.circle(118, 158, 17, { isStatic: true, restitution: 1.7, label: 'bumper', friction: 0 }),
      Bodies.circle(204, 108, 17, { isStatic: true, restitution: 1.7, label: 'bumper', friction: 0 }),
      Bodies.circle(288, 162, 17, { isStatic: true, restitution: 1.7, label: 'bumper', friction: 0 }),
    ];
    bumpers.forEach(add);
    // F-R-G standup targets
    const targets = [
      Bodies.rectangle(30, 300, 10, 46, { isStatic: true, label: 'target:F', restitution: 0.4 }),
      Bodies.rectangle(336, 300, 10, 46, { isStatic: true, label: 'target:R', restitution: 0.4 }),
      Bodies.rectangle(204, 216, 34, 10, { isStatic: true, label: 'target:G', restitution: 0.4 }),
    ];
    targets.forEach(add);
    // Rollover lane sensors under the dome
    const lanes = [
      Bodies.circle(108, 92, 10, { isStatic: true, isSensor: true, label: 'lane:0' }),
      Bodies.circle(200, 74, 10, { isStatic: true, isSensor: true, label: 'lane:1' }),
      Bodies.circle(292, 92, 10, { isStatic: true, isSensor: true, label: 'lane:2' }),
    ];
    lanes.forEach(add);

    // --- Flippers ---------------------------------------------------------
    function makeFlipper(pivotX, side) {
      const len = 58;
      const dir = side === 'left' ? 1 : -1;
      const rest = dir * 0.47; // ~27 deg down
      const body = Bodies.rectangle(0, 0, len, 15, {
        density: 0.3,
        friction: 0.1,
        restitution: 0.25,
        chamfer: { radius: 7 },
        label: 'flipper',
      });
      Body.setAngle(body, rest);
      // Place the body so the pivot end lands exactly on (pivotX, 548)
      // with the rest angle already applied.
      const pivotLocal = { x: -dir * (len / 2 - 4), y: 0 };
      const rotated = Matter.Vector.rotate(pivotLocal, rest);
      Body.setPosition(body, { x: pivotX - rotated.x, y: 548 - rotated.y });
      const pin = Constraint.create({
        pointA: { x: pivotX, y: 548 },
        bodyB: body,
        pointB: pivotLocal,
        stiffness: 1,
        length: 0,
      });
      Composite.add(world, [body, pin]);
      return { body, rest, up: dir * -0.5, dir, pivotX };
    }
    const flipL = makeFlipper(140, 'left');
    const flipR = makeFlipper(260, 'right');
    S.flippers = { flipL, flipR };

    // --- Ball ---------------------------------------------------------------
    const ball = Bodies.circle(375, 536, 9, {
      restitution: 0.35,
      friction: 0.05,
      frictionAir: 0.008,
      density: 0.0018,
      label: 'ball',
    });
    add(ball);
    S.ball = ball;

    const syncHud = () =>
      setHud({
        score: S.score,
        ball: Math.min(3, 4 - S.ballsLeft),
        msg: S.msg,
        power: Math.round(S.power),
        waiting: S.ballInLane,
      });
    S.syncHud = syncHud;
    syncHud();

    function addScore(kind, label) {
      S.score += PTS[kind];
      if (kind === 'bumper') S.msg = `💥 Bumper +${PTS.bumper}!`;
      if (kind === 'sling') S.msg = `⚡ Slingshot +${PTS.sling}!`;
      if (kind === 'lane') S.msg = `⭐ Rollover +${PTS.lane}!`;
      if (kind === 'target') {
        S.targets[label] = true;
        if (S.targets.F && S.targets.R && S.targets.G) {
          S.score += PTS.bonus;
          S.targets = { F: false, R: false, G: false };
          S.msg = `🎉 F-R-G COMPLETE! Bonus +${PTS.bonus}!`;
          haptic('medium');
        } else {
          S.msg = `🎯 Target ${label} lit! +${PTS.target}`;
        }
      }
      syncHud();
    }

    Events.on(engine, 'collisionStart', (ev) => {
      for (const pair of ev.pairs) {
        const labels = [pair.bodyA.label, pair.bodyB.label];
        const other = pair.bodyA.label === 'ball' ? pair.bodyB : pair.bodyA;
        if (!labels.includes('ball')) continue;
        if (other.label === 'bumper') {
          addScore('bumper');
          S.bumperFlash[other.id] = Date.now();
          // Kick the ball away from the bumper center
          const d = Vector.sub(ball.position, other.position);
          const n = Vector.normalise(d);
          const sp = Math.max(Vector.magnitude(ball.velocity), 10);
          Body.setVelocity(ball, Vector.mult(n, sp));
          haptic('light');
        } else if (other.label === 'sling') {
          addScore('sling');
        } else if (other.label.startsWith('target:')) {
          addScore('target', other.label.split(':')[1]);
          haptic('light');
        } else if (other.label.startsWith('lane:')) {
          const now = Date.now();
          if (!S.laneCooldown[other.label] || now - S.laneCooldown[other.label] > 1200) {
            S.laneCooldown[other.label] = now;
            addScore('lane');
          }
        }
      }
    });

    function resetBall() {
      Body.setPosition(ball, { x: 375, y: 552 });
      Body.setVelocity(ball, { x: 0, y: 0 });
      Body.setAngularVelocity(ball, 0);
      S.ballInLane = true;
      S.launched = false;
      S.returnSince = null;
      S.charging = true;
      S.power = 0;
      S.msg = `Ball ${4 - S.ballsLeft} — charge and launch!`;
      syncHud();
    }

    S.launch = (powerOverride) => {
      if (!S.ballInLane || S.over) return;
      const p = powerOverride != null ? powerOverride : S.power;
      S.ballInLane = false;
      S.launched = true;
      S.charging = false;
      Body.setVelocity(ball, { x: 0, y: -(17 + p * 0.11) });
      S.msg = 'Away! Keep it alive with the flippers!';
      haptic('medium');
      syncHud();
    };

    // --- Main loop ------------------------------------------------------------
    let raf;
    let last = performance.now();
    const step = (now) => {
      raf = requestAnimationFrame(step);
      const dt = Math.min(33, now - last);
      last = now;

      // Plunger charge meter sweeps while the ball waits
      if (S.ballInLane && S.charging) {
        S.power += S.powerDir * dt * 0.09;
        if (S.power >= 100) { S.power = 100; S.powerDir = -1; }
        if (S.power <= 0) { S.power = 0; S.powerDir = 1; }
        syncHud();
      }

      // Flipper control: drive angular velocity toward the target angle
      for (const [flip, pressed] of [[flipL, S.flipL], [flipR, S.flipR]]) {
        const target = pressed ? flip.up : flip.rest;
        let diff = target - flip.body.angle;
        // Angles wrap; keep diff in [-pi, pi]
        while (diff > Math.PI) diff -= 2 * Math.PI;
        while (diff < -Math.PI) diff += 2 * Math.PI;
        const w = Math.max(-0.85, Math.min(0.85, diff * 2.2));
        Body.setAngularVelocity(flip.body, w);
        if (Math.abs(diff) < 0.02) Body.setAngle(flip.body, target);
      }

      // Cap ball speed (anti-tunneling)
      const v = ball.velocity;
      const sp = Math.hypot(v.x, v.y);
      if (sp > 30) Body.setVelocity(ball, { x: (v.x / sp) * 30, y: (v.y / sp) * 30 });

      Engine.update(engine, 1000 / 60);

      // Weak-launch fallback: the ball rolled back down the launch
      // lane and settled on the lane floor. It is not in play there —
      // it can never drain and the flippers can't reach it, and the
      // launch button only exists while ballInLane is set, so without
      // this hand-back the game soft-locks (observed live 2026-10-17:
      // ball parked in the lane, "Ball nudged loose!" firing forever).
      // Give it back to the plunger.
      if (S.launched && !S.over && ball.position.x > 352 && ball.position.y > 400 && sp < 0.6) {
        if (!S.returnSince) S.returnSince = now;
        if (now - S.returnSince > 500) {
          Body.setPosition(ball, { x: 375, y: 552 });
          Body.setVelocity(ball, { x: 0, y: 0 });
          Body.setAngularVelocity(ball, 0);
          S.ballInLane = true;
          S.launched = false;
          S.charging = true;
          S.power = 0;
          S.powerDir = 1;
          S.returnSince = null;
          S.stuckSince = null;
          S.msg = 'Weak launch — the ball rolled back. Fire again!';
          syncHud();
        }
      } else {
        S.returnSince = null;
      }

      // Stuck-ball nudge (not in the launch lane)
      if (!S.ballInLane && !S.over) {
        if (sp < 0.08) {
          if (!S.stuckSince) S.stuckSince = now;
          if (now - S.stuckSince > 3200) {
            Body.setVelocity(ball, { x: (Math.random() - 0.5) * 2, y: -3.5 });
            S.stuckSince = null;
            S.msg = 'Ball nudged loose!';
            syncHud();
          }
        } else S.stuckSince = null;
      }

      // Drain (only a launched ball can drain — the waiting ball
      // rests on the lane floor)
      if (ball.position.y > H + 24 && !S.over && S.launched) {
        S.ballsLeft -= 1;
        haptic('heavy');
        if (S.ballsLeft > 0) {
          resetBall();
        } else {
          S.over = true;
          const amount = pinballAmount(S.score);
          S.msg =
            amount > 0
              ? `🏁 Game over — ${S.score.toLocaleString()} pts pays ${amount} FRG!`
              : `🏁 Game over — ${S.score.toLocaleString()} pts. Needed 1,500 for the first payout.`;
          syncHud();
          setTimeout(() => {
            onFinish({
              outcome: amount > 0 ? 'win' : 'lose',
              score: S.score,
              amount,
              ballsUsed: 3,
              durationMs: Date.now() - S.mountedAt,
            });
          }, 1500);
        }
      }

      draw();
    };

    // --- Canvas rendering -------------------------------------------------------
    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d');
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    canvas.width = W * dpr;
    canvas.height = H * dpr;

    function draw() {
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      // Felt
      const g = ctx.createLinearGradient(0, 0, 0, H);
      g.addColorStop(0, '#12234d');
      g.addColorStop(1, '#0a1230');
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, W, H);
      // Launch lane shading
      ctx.fillStyle = 'rgba(255,255,255,0.05)';
      ctx.fillRect(362, 40, 32, H - 40);
      // Dome
      ctx.strokeStyle = '#3b82f6';
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.arc(196, 196, 186, Math.PI, 2 * Math.PI);
      ctx.stroke();
      // Walls/dividers
      ctx.fillStyle = '#27406e';
      ctx.fillRect(0, 180, 12, 400);
      ctx.fillRect(350, 255, 12, 330);
      // Funnels + slingshots
      ctx.fillStyle = '#2c4a7c';
      for (const [x, y, a, len] of [
        [84, 516, 0.42, 140],
        [282, 516, -0.42, 140],
        [108, 448, 0.85, 66],
        [258, 448, -0.85, 66],
      ]) {
        ctx.save();
        ctx.translate(x, y);
        ctx.rotate(a);
        ctx.fillRect(-len / 2, -5, len, 10);
        ctx.restore();
      }
      // Rollover lanes
      for (const l of lanes) {
        ctx.beginPath();
        ctx.arc(l.position.x, l.position.y, 10, 0, 2 * Math.PI);
        ctx.fillStyle = 'rgba(247,183,51,0.25)';
        ctx.fill();
        ctx.fillStyle = '#f7b733';
        ctx.font = '11px sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText('★', l.position.x, l.position.y + 4);
      }
      // Targets
      for (const t of targets) {
        const letter = t.label.split(':')[1];
        const lit = S.targets[letter];
        ctx.save();
        ctx.translate(t.position.x, t.position.y);
        ctx.rotate(t.angle);
        ctx.fillStyle = lit ? '#f7b733' : '#475569';
        const wdt = letter === 'G' ? 34 : 10;
        const hgt = letter === 'G' ? 10 : 46;
        ctx.fillRect(-wdt / 2, -hgt / 2, wdt, hgt);
        ctx.restore();
        ctx.fillStyle = lit ? '#231a00' : '#94a3b8';
        ctx.font = 'bold 10px sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText(letter, t.position.x, t.position.y + (letter === 'G' ? -8 : 3));
      }
      // Bumpers
      for (const bp of bumpers) {
        const flash = S.bumperFlash[bp.id] && Date.now() - S.bumperFlash[bp.id] < 130;
        const r = flash ? 20 : 17;
        const bg = ctx.createRadialGradient(bp.position.x - 5, bp.position.y - 5, 2, bp.position.x, bp.position.y, r);
        bg.addColorStop(0, flash ? '#fff7cc' : '#ffd166');
        bg.addColorStop(1, flash ? '#f59e0b' : '#d97706');
        ctx.beginPath();
        ctx.arc(bp.position.x, bp.position.y, r, 0, 2 * Math.PI);
        ctx.fillStyle = bg;
        ctx.fill();
        ctx.strokeStyle = '#92400e';
        ctx.lineWidth = 2;
        ctx.stroke();
        ctx.fillStyle = '#451a03';
        ctx.font = 'bold 10px sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText('150', bp.position.x, bp.position.y + 3);
      }
      // Flippers
      for (const f of [flipL, flipR]) {
        ctx.save();
        ctx.translate(f.body.position.x, f.body.position.y);
        ctx.rotate(f.body.angle);
        ctx.fillStyle = '#dc2626';
        ctx.beginPath();
        ctx.roundRect(-29, -7.5, 58, 15, 7);
        ctx.fill();
        ctx.restore();
        ctx.beginPath();
        ctx.arc(f.pivotX, 548, 5, 0, 2 * Math.PI);
        ctx.fillStyle = '#f8fafc';
        ctx.fill();
      }
      // Plunger
      if (S.ballInLane) {
        ctx.fillStyle = '#64748b';
        ctx.fillRect(368, 552, 14, 22);
        ctx.fillStyle = '#f7b733';
        ctx.fillRect(368, 552 + (100 - S.power) * 0.2, 14, 22 - (100 - S.power) * 0.2);
      }
      // Ball
      const p = ball.position;
      const bgr = ctx.createRadialGradient(p.x - 3, p.y - 3, 1, p.x, p.y, 9);
      bgr.addColorStop(0, '#ffffff');
      bgr.addColorStop(1, '#94a3b8');
      ctx.beginPath();
      ctx.arc(p.x, p.y, 9, 0, 2 * Math.PI);
      ctx.fillStyle = bgr;
      ctx.fill();
    }

    raf = requestAnimationFrame(step);

    // Harness / test hook (also handy for debugging): read state and
    // drive the flippers/launch programmatically.
    window.__frgPinball = {
      state: () => ({
        score: S.score,
        ballsLeft: S.ballsLeft,
        ballInLane: S.ballInLane,
        over: S.over,
        ball: { x: Math.round(ball.position.x), y: Math.round(ball.position.y) },
        vy: Math.round(ball.velocity.y * 10) / 10,
      }),
      setFlipper: (side, on) => { if (side === 'left') S.flipL = on; else S.flipR = on; },
      launch: (p) => S.launch(p),
    };

    return () => {
      cancelAnimationFrame(raf);
      Events.off(engine);
      Composite.clear(world, false);
      Engine.clear(engine);
      delete window.__frgPinball;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const haptic = (style) => {
    try {
      window.Telegram?.WebApp?.HapticFeedback?.impactOccurred(style);
    } catch {
      /* not in Telegram */
    }
  };

  const setFlip = (side, on) => {
    const S = G.current;
    if (!S) return;
    if (side === 'left') S.flipL = on;
    else S.flipR = on;
  };

  useEffect(() => {
    const down = (e) => {
      if (e.key === 'ArrowLeft') setFlip('left', true);
      if (e.key === 'ArrowRight') setFlip('right', true);
      if ((e.key === ' ' || e.key === 'ArrowDown') && G.current?.ballInLane) G.current.launch();
    };
    const up = (e) => {
      if (e.key === 'ArrowLeft') setFlip('left', false);
      if (e.key === 'ArrowRight') setFlip('right', false);
    };
    window.addEventListener('keydown', down);
    window.addEventListener('keyup', up);
    return () => {
      window.removeEventListener('keydown', down);
      window.removeEventListener('keyup', up);
    };
  }, []);

  return (
    <main className="pinball-wrap">
      <h2 className="pinball-title">👾 FRG PINBALL</h2>
      <div className="pinball-hud">
        <span>
          SCORE <b>{hud.score.toLocaleString()}</b>
        </span>
        <span>
          BALL <b>{hud.ball}/3</b>
        </span>
        <span className="pinball-next">
          {(() => {
            const next = [...PINBALL_TIERS].reverse().find((t) => hud.score < t.min);
            return next ? `NEXT: ${next.amount} FRG @ ${next.min.toLocaleString()}` : 'MAX TIER!';
          })()}
        </span>
      </div>

      <div className="pinball-cab" ref={wrapRef}>
        <canvas ref={canvasRef} style={{ width: '100%', display: 'block', borderRadius: 12 }} />
      </div>

      <p className="pinball-msg">{hud.msg}</p>

      {hud.waiting ? (
        <div className="pinball-launch">
          <div className="power-track">
            <div className="power-fill" style={{ width: `${hud.power}%` }} />
          </div>
          <button className="btn btn-big btn-launch" onClick={() => G.current?.launch()}>
            🚀 LAUNCH — {hud.power}%
          </button>
        </div>
      ) : (
        <div className="pinball-flippers">
          <button
            className="btn btn-flip"
            onPointerDown={(e) => { e.preventDefault(); setFlip('left', true); }}
            onPointerUp={() => setFlip('left', false)}
            onPointerLeave={() => setFlip('left', false)}
            onContextMenu={(e) => e.preventDefault()}
          >
            ◀ LEFT
          </button>
          <button
            className="btn btn-flip"
            onPointerDown={(e) => { e.preventDefault(); setFlip('right', true); }}
            onPointerUp={() => setFlip('right', false)}
            onPointerLeave={() => setFlip('right', false)}
            onContextMenu={(e) => e.preventDefault()}
          >
            RIGHT ▶
          </button>
        </div>
      )}
      <p className="pinball-note">
        Bumpers 150 · rollovers 150 · light F-R-G for a 1,000 bonus. Payouts:
        1,500→5 · 4,000→10 · 7,000→15 · 11,000→22 · 16,000→32 · 25,000→45
        FRG. Three balls — make them count.
      </p>
    </main>
  );
}
