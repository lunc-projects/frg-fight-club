import { useEffect, useRef, useState } from 'react';
import Matter from 'matter-js';

// FRG Pinball — a real physics table (matter-js) in a REAL 3D
// cabinet (Three.js): 3 balls, 3 pop
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
  const mountRef = useRef(null);
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
      popups: [],
      rings: [],
      trail: [],
      callout: null,
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

    function addScore(kind, label, pos) {
      S.score += PTS[kind];
      if (pos) {
        S.popups.push({ x: pos.x, y: pos.y - 14, text: `+${PTS[kind]}`, life: 1, color: kind === 'target' ? '#ffd94d' : '#ffffff', size: kind === 'target' ? 17 : 14 });
        if (kind === 'bumper') S.rings.push({ x: pos.x, y: pos.y, at: Date.now() });
      }
      if (kind === 'bumper') S.msg = `💥 Bumper +${PTS.bumper}!`;
      if (kind === 'sling') S.msg = `⚡ Slingshot +${PTS.sling}!`;
      if (kind === 'lane') S.msg = `⭐ Rollover +${PTS.lane}!`;
      if (kind === 'target') {
        S.targets[label] = true;
        if (S.targets.F && S.targets.R && S.targets.G) {
          S.score += PTS.bonus;
          S.callout = { text: '🎉 F-R-G COMPLETE! +1000', at: Date.now() };
          if (pos) S.popups.push({ x: pos.x, y: pos.y - 34, text: `+${PTS.bonus}`, life: 1.2, color: '#ffd94d', size: 19 });
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
          addScore('bumper', null, other.position);
          S.bumperFlash[other.id] = Date.now();
          // Kick the ball away from the bumper center
          const d = Vector.sub(ball.position, other.position);
          const n = Vector.normalise(d);
          const sp = Math.max(Vector.magnitude(ball.velocity), 10);
          Body.setVelocity(ball, Vector.mult(n, sp));
          haptic('light');
        } else if (other.label === 'sling') {
          addScore('sling', null, other.position);
        } else if (other.label.startsWith('target:')) {
          addScore('target', other.label.split(':')[1], other.position);
          haptic('light');
        } else if (other.label.startsWith('lane:')) {
          const now = Date.now();
          if (!S.laneCooldown[other.label] || now - S.laneCooldown[other.label] > 1200) {
            S.laneCooldown[other.label] = now;
            addScore('lane', null, other.position);
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
              ? `🏁 Game over — ${S.score.toLocaleString()} pts pays ${amount} PTS!`
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

      S.trail.push({ x: ball.position.x, y: ball.position.y });
      if (S.trail.length > 9) S.trail.shift();
      const dtS = Math.min(0.033, dt / 1000);
      for (const pu of S.popups) { pu.y -= 26 * dtS; pu.life -= dtS * 1.05; }
      S.popups = S.popups.filter((pu) => pu.life > 0);
      S.rings = S.rings.filter((r) => Date.now() - r.at < 230);
      if (S.callout && Date.now() - S.callout.at > 1250) S.callout = null;

      draw();
    };

    // --- 3D rendering (Three.js) -----------------------------------------
    // The matter-js physics above is untouched; this block only READS
    // body positions and draws the table as a real 3D cabinet: raised
    // rails, a dome arc, chrome ball, glowing bumpers. Letters, stars,
    // popups and the callout stay on a 2D overlay in game coordinates.
    const overlay = canvasRef.current;
    const octx = overlay.getContext('2d');
    let T3 = null;
    let dispose3d = () => {};

    (async () => {
      const THREE = await import('three');
      const mount = mountRef.current;
      if (!mount) return;
      const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
      renderer.setPixelRatio(Math.min(2, window.devicePixelRatio || 1));
      renderer.setSize(W, H, false);
      renderer.domElement.style.cssText = 'position:absolute;inset:0;width:100%;height:100%;display:block;';
      mount.appendChild(renderer.domElement);

      const scene = new THREE.Scene();
      scene.background = new THREE.Color(0x0a1230);
      scene.fog = new THREE.Fog(0x0a1230, 1400, 3000);
      const camera = new THREE.PerspectiveCamera(50, W / H, 1, 4000);
      camera.position.set(200, 330, 712);
      camera.lookAt(200, 284, 0);

      scene.add(new THREE.HemisphereLight(0xcfe2ff, 0x16224a, 1.5));
      const sun = new THREE.DirectionalLight(0xfff3d6, 1.9);
      sun.position.set(140, 380, 560);
      scene.add(sun);
      const fill = new THREE.DirectionalLight(0x7fb2ff, 0.55);
      fill.position.set(-260, 120, 300);
      scene.add(fill);

      const wy = (gy) => H - gy;
      const railMat = new THREE.MeshStandardMaterial({ color: 0x27406e, roughness: 0.5, metalness: 0.35 });
      const railMat2 = new THREE.MeshStandardMaterial({ color: 0x2c4a7c, roughness: 0.5, metalness: 0.35 });
      function rail(x, gy, w, h, angle, mat) {
        const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, 15), mat || railMat);
        m.position.set(x, wy(gy), 6);
        if (angle) m.rotation.z = -angle;
        scene.add(m);
        return m;
      }
      // cabinet slab + playfield art
      {
        const slab = new THREE.Mesh(
          new THREE.BoxGeometry(W + 26, H + 26, 18),
          new THREE.MeshStandardMaterial({ color: 0x1b2a4d, roughness: 0.6 })
        );
        slab.position.set(W / 2, H / 2, -11);
        scene.add(slab);
        const tex = new THREE.TextureLoader().load('/art/pinball-bg.webp', (t) => {
          t.colorSpace = THREE.SRGBColorSpace;
        });
        const top = new THREE.Mesh(
          new THREE.PlaneGeometry(W, H),
          new THREE.MeshBasicMaterial({ map: tex, color: 0xaab4cc })
        );
        top.position.set(W / 2, H / 2, -1.5);
        scene.add(top);
        const laneShade = new THREE.Mesh(
          new THREE.PlaneGeometry(32, H - 40),
          new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.05 })
        );
        laneShade.position.set(378, H / 2, -1);
        scene.add(laneShade);
      }
      rail(10, 390, 20, 420);
      rail(394, 330, 14, 520);
      rail(375, 576, 36, 12);
      rail(356, 420, 12, 330);
      rail(352, 208, 30, 8, -0.55);
      rail(84, 516, 140, 12, 0.42, railMat2);
      rail(282, 516, 140, 12, -0.42, railMat2);
      // dome arc
      {
        const dome = new THREE.Mesh(
          new THREE.TorusGeometry(188, 7.5, 10, 44, Math.PI),
          new THREE.MeshStandardMaterial({ color: 0x3b82f6, roughness: 0.3, metalness: 0.4, emissive: 0x3b82f6, emissiveIntensity: 0.35 })
        );
        dome.position.set(196, wy(196), 6);
        scene.add(dome);
      }
      // lane posts
      for (const [px, py] of [[66, 472], [300, 472]]) {
        const post = new THREE.Mesh(new THREE.CylinderGeometry(6, 6, 15, 12), railMat2);
        post.rotation.x = Math.PI / 2;
        post.position.set(px, wy(py), 6);
        scene.add(post);
      }
      // slingshots
      rail(108, 448, 66, 10, 0.85, railMat2);
      rail(258, 448, 66, 10, -0.85, railMat2);
      // rollover lane discs
      for (const l of lanes) {
        const disc = new THREE.Mesh(
          new THREE.CircleGeometry(10, 20),
          new THREE.MeshBasicMaterial({ color: 0xf7b733, transparent: true, opacity: 0.3 })
        );
        disc.position.set(l.position.x, wy(l.position.y), 1.5);
        scene.add(disc);
      }
      // bumpers
      const bumperMeshes = bumpers.map((bp) => {
        const g = new THREE.Group();
        const base = new THREE.Mesh(
          new THREE.CylinderGeometry(17, 18.5, 13, 22),
          new THREE.MeshStandardMaterial({ color: 0xd97706, roughness: 0.3, metalness: 0.4, emissive: 0xffd166, emissiveIntensity: 0.25 })
        );
        base.rotation.x = Math.PI / 2;
        g.add(base);
        const cap = new THREE.Mesh(
          new THREE.SphereGeometry(12.5, 16, 10),
          new THREE.MeshStandardMaterial({ color: 0xffd166, roughness: 0.2, metalness: 0.3, emissive: 0xffd166, emissiveIntensity: 0.4 })
        );
        cap.scale.z = 0.45;
        cap.position.z = 7;
        g.add(cap);
        g.position.set(bp.position.x, wy(bp.position.y), 6);
        scene.add(g);
        return { g, base, cap, id: bp.id };
      });
      // F-R-G targets
      const targetMeshes = targets.map((t) => {
        const letter = t.label.split(':')[1];
        const w = letter === 'G' ? 34 : 10;
        const h = letter === 'G' ? 10 : 46;
        const m = new THREE.Mesh(
          new THREE.BoxGeometry(w, h, 14),
          new THREE.MeshStandardMaterial({ color: 0x475569, roughness: 0.45, metalness: 0.3 })
        );
        m.position.set(t.position.x, wy(t.position.y), 6);
        m.rotation.z = -t.angle;
        scene.add(m);
        return { m, letter };
      });
      // flippers + pivots
      const flipMeshes = [flipL, flipR].map((f) => {
        const m = new THREE.Mesh(
          new THREE.BoxGeometry(58, 15, 12),
          new THREE.MeshStandardMaterial({ color: 0xdc2626, roughness: 0.35, metalness: 0.2, emissive: 0xdc2626, emissiveIntensity: 0.15 })
        );
        scene.add(m);
        const pivot = new THREE.Mesh(
          new THREE.CylinderGeometry(5, 5, 14, 12),
          new THREE.MeshStandardMaterial({ color: 0xf8fafc, roughness: 0.3 })
        );
        pivot.rotation.x = Math.PI / 2;
        pivot.position.set(f.pivotX, wy(548), 7);
        scene.add(pivot);
        return { m, body: f.body };
      });
      // plunger
      const plungerBase = new THREE.Mesh(new THREE.BoxGeometry(14, 22, 10), new THREE.MeshStandardMaterial({ color: 0x64748b, roughness: 0.5 }));
      plungerBase.position.set(375, wy(563), 5);
      scene.add(plungerBase);
      const plungerFill = new THREE.Mesh(new THREE.BoxGeometry(14, 22, 11), new THREE.MeshBasicMaterial({ color: 0xf7b733 }));
      plungerFill.position.set(375, wy(563), 5);
      scene.add(plungerFill);
      // chrome ball + glow + trail
      const ballMesh = new THREE.Mesh(
        new THREE.SphereGeometry(9, 18, 12),
        new THREE.MeshStandardMaterial({ color: 0xf2f6ff, roughness: 0.12, metalness: 0.9 })
      );
      scene.add(ballMesh);
      const ballLight = new THREE.PointLight(0xaad7ff, 42, 130);
      scene.add(ballLight);
      let trailPts;
      {
        const g = new THREE.BufferGeometry();
        g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(9 * 3), 3));
        trailPts = new THREE.Points(g, new THREE.PointsMaterial({ color: 0xcfe6ff, size: 5.5, sizeAttenuation: false, transparent: true, opacity: 0.35 }));
        trailPts.frustumCulled = false;
        scene.add(trailPts);
      }
      // bumper shockwave rings
      const ringMeshes = [];
      for (let i = 0; i < 4; i++) {
        const r = new THREE.Mesh(
          new THREE.RingGeometry(0.92, 1, 26),
          new THREE.MeshBasicMaterial({ color: 0xffd76e, transparent: true, opacity: 0, side: THREE.DoubleSide })
        );
        r.visible = false;
        scene.add(r);
        ringMeshes.push(r);
      }

      T3 = {
        sync() {
          for (const bm of bumperMeshes) {
            const flash = S.bumperFlash[bm.id] && Date.now() - S.bumperFlash[bm.id] < 130;
            const sc = flash ? 20 / 17 : 1;
            bm.g.scale.set(sc, sc, 1);
            bm.base.material.emissiveIntensity = flash ? 0.95 : 0.25;
            bm.cap.material.emissiveIntensity = flash ? 1.2 : 0.4;
          }
          for (const tm of targetMeshes) {
            const lit = S.targets[tm.letter];
            tm.m.material.color.set(lit ? 0xf7b733 : 0x475569);
            tm.m.material.emissive = tm.m.material.emissive || new THREE.Color(0);
            tm.m.material.emissive.set(lit ? 0xf7b733 : 0x000000);
            tm.m.material.emissiveIntensity = lit ? 0.55 : 0;
          }
          for (const fm of flipMeshes) {
            fm.m.position.set(fm.body.position.x, wy(fm.body.position.y), 7);
            fm.m.rotation.z = -fm.body.angle;
          }
          plungerFill.visible = S.ballInLane;
          plungerBase.visible = S.ballInLane;
          if (S.ballInLane) {
            const h = Math.max(0.5, (S.power / 100) * 22);
            plungerFill.scale.y = h / 22;
            plungerFill.position.y = wy(574) + h / 2;
          }
          ballMesh.position.set(ball.position.x, wy(ball.position.y), 9);
          ballMesh.rotation.z = -ball.angle;
          ballLight.position.set(ball.position.x, wy(ball.position.y), 26);
          {
            const arr = trailPts.geometry.getAttribute('position');
            for (let i = 0; i < 9; i++) {
              const tp = S.trail[i];
              if (!tp) { arr.setXYZ(i, -100, -100, -100); continue; }
              arr.setXYZ(i, tp.x, wy(tp.y), 5);
            }
            arr.needsUpdate = true;
          }
          S.rings.forEach((r, i) => {
            const mesh = ringMeshes[i % ringMeshes.length];
            const age = (Date.now() - r.at) / 230;
            mesh.visible = true;
            mesh.position.set(r.x, wy(r.y), 13);
            const rad = 17 + age * 17;
            mesh.scale.set(rad, rad, 1);
            mesh.material.opacity = 0.75 * (1 - age);
          });
          for (let i = S.rings.length; i < ringMeshes.length; i++) ringMeshes[i].visible = false;
        },
        render() {
          renderer.render(scene, camera);
        },
      };
      dispose3d = () => {
        renderer.dispose();
        if (renderer.domElement.parentNode) renderer.domElement.parentNode.removeChild(renderer.domElement);
        T3 = null;
      };
    })();

    function draw() {
      if (T3) {
        T3.sync();
        T3.render();
      }
      // overlay: lane stars + target letters + popups + callout
      octx.clearRect(0, 0, W, H);
      for (const l of lanes) {
        octx.fillStyle = '#f7b733';
        octx.font = '11px sans-serif';
        octx.textAlign = 'center';
        octx.fillText('★', l.position.x, l.position.y + 4);
      }
      for (const t of targets) {
        const letter = t.label.split(':')[1];
        const lit = S.targets[letter];
        octx.fillStyle = lit ? '#231a00' : '#cbd5e1';
        octx.font = 'bold 10px sans-serif';
        octx.textAlign = 'center';
        octx.fillText(letter, t.position.x, t.position.y + (letter === 'G' ? -8 : 3));
      }
      for (const pu of S.popups) {
        octx.globalAlpha = Math.max(0, Math.min(1, pu.life));
        octx.font = `900 ${pu.size}px system-ui`;
        octx.textAlign = 'center';
        octx.strokeStyle = 'rgba(4,6,20,0.85)';
        octx.lineWidth = 3.5;
        octx.strokeText(pu.text, pu.x, pu.y);
        octx.fillStyle = pu.color;
        octx.fillText(pu.text, pu.x, pu.y);
      }
      octx.globalAlpha = 1;
      if (S.callout) {
        const age = Date.now() - S.callout.at;
        const sc2 = age < 200 ? 0.6 + (age / 200) * 0.5 : 1.1;
        octx.save();
        octx.translate(W / 2, 300);
        octx.scale(sc2, sc2);
        octx.globalAlpha = age > 950 ? Math.max(0, 1 - (age - 950) / 300) : 1;
        octx.font = '900 24px system-ui';
        octx.textAlign = 'center';
        octx.strokeStyle = 'rgba(4,6,20,0.9)';
        octx.lineWidth = 6;
        octx.strokeText(S.callout.text, 0, 0);
        octx.fillStyle = '#ffd94d';
        octx.fillText(S.callout.text, 0, 0);
        octx.restore();
        octx.globalAlpha = 1;
      }
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
      dispose3d();
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
      <h2 className="pinball-title">👾 FRG PINBALL 3D</h2>
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
            return next ? `NEXT: ${next.amount} PTS @ ${next.min.toLocaleString()}` : 'MAX TIER!';
          })()}
        </span>
      </div>

      <div className="pinball-cab" ref={wrapRef}>
        <div ref={mountRef} className="pinball-3d-mount" />
        <canvas ref={canvasRef} width={W} height={H} className="pinball-overlay" />
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
        Bumpers 150 · rollovers 150 · light F-R-G for a 1,000 bonus. Points:
        1,500→5 · 4,000→10 · 7,000→15 · 11,000→22 · 16,000→32 · 25,000→45
        PTS. Three balls — make them count.
      </p>
    </main>
  );
}
