import { useEffect, useRef } from 'react';

// FRG Breakout — paddle & bricks, now in REAL 3D (Three.js). The ball
// physics are the original game verbatim — same paddle bounce, brick
// scoring, wall bonus, speed-ups, tiers and result contract (the
// server re-derives them exactly). Only the renderer changed: glossy
// 3D bricks on a tilted neon court, a gold 3D paddle, and a glowing
// sphere for the ball with a light trail.
export const BREAKOUT_TIERS = [
  { min: 5500, amount: 45 },
  { min: 4000, amount: 32 },
  { min: 2900, amount: 22 },
  { min: 2000, amount: 15 },
  { min: 1300, amount: 10 },
  { min: 600, amount: 5 },
];
export function breakoutAmount(score) {
  const t = BREAKOUT_TIERS.find((x) => score >= x.min);
  return t ? t.amount : 0;
}

const W = 400;
const H = 520;
const COLS = 8;
const ROWS = 6;
const ROW_PTS = [60, 50, 40, 30, 20, 10];
const ROW_COLORS = ['#f5c542', '#e5534b', '#f0883e', '#4f8ff7', '#7d8590', '#57606a'];
const WALL_BONUS = 400;
const PADDLE_W = 78;
const PADDLE_Y = H - 38;

export default function Breakout({ onFinish }) {
  const mountRef = useRef(null);
  const overlayRef = useRef(null);
  const doneRef = useRef(false);

  useEffect(() => {
    const start = Date.now();
    let disposed = false;
    let raf = 0;
    let cleanup3d = () => {};

    const S = {
      score: 0,
      ballsLeft: 3,
      particles: [],
      popups: [],
      trail: [],
      over: false,
      paddleX: W / 2,
      ball: null,
      bricks: [],
      wall: 1,
      msg: 'Drag to move — tap to launch!',
      msgAt: Date.now(),
      finishedAt: 0,
    };

    function buildWall() {
      S.bricks = [];
      for (let r = 0; r < ROWS; r++) {
        for (let c = 0; c < COLS; c++) {
          S.bricks.push({ x: 14 + c * 47, y: 64 + r * 21, w: 42, h: 16, row: r, alive: true });
        }
      }
    }
    function serve() {
      S.ball = { x: S.paddleX, y: PADDLE_Y - 10, vx: 0, vy: 0, stuck: true, serveAt: Date.now() };
    }
    function launch() {
      if (!S.ball?.stuck || S.over) return;
      const speed = 300 * (1 + (S.wall - 1) * 0.08);
      const ang = (-32 + Math.random() * 20) * (Math.PI / 180);
      S.ball.vx = Math.sin(ang) * speed;
      S.ball.vy = -Math.cos(ang) * speed;
      S.ball.stuck = false;
    }
    buildWall();
    serve();

    function say(msg) {
      S.msg = msg;
      S.msgAt = Date.now();
    }

    function finish() {
      S.over = true;
      S.finishedAt = Date.now();
      const amount = breakoutAmount(S.score);
      setTimeout(() => {
        if (doneRef.current) return;
        doneRef.current = true;
        onFinish({
          outcome: amount > 0 ? 'win' : 'lose',
          score: S.score,
          amount,
          ballsUsed: 3,
          durationMs: Date.now() - start,
        });
      }, 900);
    }

    function stepLogic(dt) {
      const b = S.ball;
      if (b && !S.over) {
        if (b.stuck) {
          b.x = S.paddleX;
          if (Date.now() - b.serveAt > 1200) launch();
        } else {
          b.x += b.vx * dt;
          b.y += b.vy * dt;
          if (b.x < 9) { b.x = 9; b.vx = Math.abs(b.vx); }
          if (b.x > W - 9) { b.x = W - 9; b.vx = -Math.abs(b.vx); }
          if (b.y < 9) { b.y = 9; b.vy = Math.abs(b.vy); }
          if (b.vy > 0 && b.y > PADDLE_Y - 9 && b.y < PADDLE_Y + 12 && Math.abs(b.x - S.paddleX) < PADDLE_W / 2 + 7) {
            const off = Math.max(-1, Math.min(1, (b.x - S.paddleX) / (PADDLE_W / 2)));
            const speed = Math.min(580, Math.hypot(b.vx, b.vy) * 1.01);
            const ang = off * (62 * Math.PI / 180);
            b.vx = Math.sin(ang) * speed;
            b.vy = -Math.cos(ang) * speed;
            b.y = PADDLE_Y - 10;
          }
          for (const br of S.bricks) {
            if (!br.alive) continue;
            if (b.x > br.x - 7 && b.x < br.x + br.w + 7 && b.y > br.y - 7 && b.y < br.y + br.h + 7) {
              br.alive = false;
              S.score += ROW_PTS[br.row];
              for (let i = 0; i < 6; i++) {
                const a = Math.random() * Math.PI * 2;
                const sp = 30 + Math.random() * 110;
                S.particles.push({ x: br.x + br.w / 2, y: br.y + br.h / 2, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, r: 1.6 + Math.random() * 2, life: 0.45, color: ROW_COLORS[br.row] });
              }
              const penX = Math.min(Math.abs(b.x - (br.x - 7)), Math.abs(b.x - (br.x + br.w + 7)));
              const penY = Math.min(Math.abs(b.y - (br.y - 7)), Math.abs(b.y - (br.y + br.h + 7)));
              if (penX < penY) b.vx = -b.vx; else b.vy = -b.vy;
              const sp = Math.hypot(b.vx, b.vy) * 1.012;
              const cur = Math.hypot(b.vx, b.vy) || 1;
              b.vx = (b.vx / cur) * Math.min(580, sp);
              b.vy = (b.vy / cur) * Math.min(580, sp);
              if (Math.abs(b.vy) < 95) { b.vy = b.vy < 0 ? -95 : 95; }
              break;
            }
          }
          if (S.bricks.every((x) => !x.alive)) {
            S.score += WALL_BONUS;
            S.wall += 1;
            S.popups.push({ x: W / 2, y: 210, text: `WALL DOWN! +${WALL_BONUS}`, life: 1.2, color: '#ffd94d', size: 21 });
            say(`🧱 Wall down! +${WALL_BONUS} — faster wall #${S.wall}`);
            buildWall();
            serve();
          }
          S.trail.push({ x: b.x, y: b.y });
          if (S.trail.length > 11) S.trail.shift();
          if (b.y > H + 14) {
            S.ballsLeft -= 1;
            if (S.ballsLeft <= 0) { finish(); }
            else { say(`Ball lost — ${S.ballsLeft} left`); serve(); }
          }
        }
      }
      for (const pt of S.particles) { pt.x += pt.vx * dt; pt.y += pt.vy * dt; pt.life -= dt; }
      S.particles = S.particles.filter((pt) => pt.life > 0);
      for (const pu of S.popups) { pu.y -= 30 * dt; pu.life -= dt * 0.85; }
      S.popups = S.popups.filter((pu) => pu.life > 0);
    }

    (async () => {
      const THREE = await import('three');
      if (disposed) return;
      const mount = mountRef.current;
      const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
      renderer.setPixelRatio(Math.min(2, window.devicePixelRatio || 1));
      renderer.setSize(W, H, false);
      renderer.domElement.style.cssText = 'position:absolute;inset:0;width:100%;height:100%;display:block;';
      mount.appendChild(renderer.domElement);

      const scene = new THREE.Scene();
      scene.background = new THREE.Color(0x0d1526);
      scene.fog = new THREE.Fog(0x0d1526, 1100, 2600);
      const camera = new THREE.PerspectiveCamera(50, W / H, 1, 4000);
      camera.position.set(200, 336, 626);
      camera.lookAt(200, 238, 0);

      scene.add(new THREE.HemisphereLight(0xbdd7ff, 0x140f2e, 1.5));
      const sun = new THREE.DirectionalLight(0xffffff, 2.0);
      sun.position.set(160, 460, 520);
      scene.add(sun);
      const fill = new THREE.DirectionalLight(0x7fb2ff, 0.7);
      fill.position.set(-260, 100, 260);
      scene.add(fill);

      const wy = (gy) => H - gy;

      // backdrop: the club's neon void art on a far plane + a floor
      {
        const tex = new THREE.TextureLoader().load('/art/breakout-bg.webp', (t) => {
          t.colorSpace = THREE.SRGBColorSpace;
        });
        const bg = new THREE.Mesh(
          new THREE.PlaneGeometry(980, 700),
          new THREE.MeshBasicMaterial({ map: tex, fog: false })
        );
        bg.position.set(200, 260, -190);
        scene.add(bg);
        const floor = new THREE.Mesh(
          new THREE.PlaneGeometry(1500, 900),
          new THREE.MeshStandardMaterial({ color: 0x0a1020, roughness: 1 })
        );
        floor.rotation.x = -Math.PI / 2;
        floor.position.set(200, -46, 160);
        scene.add(floor);
      }
      // court rails (left/right/top) in translucent neon
      {
        const railMat = new THREE.MeshBasicMaterial({ color: 0x2de2e6, transparent: true, opacity: 0.34 });
        const mkRail = (w2, h2, x, y) => {
          const m = new THREE.Mesh(new THREE.BoxGeometry(w2, h2, 30), railMat);
          m.position.set(x, y, 0);
          scene.add(m);
        };
        mkRail(5, H, 3, H / 2);
        mkRail(5, H, W - 3, H / 2);
        mkRail(W, 5, W / 2, H - 3);
      }
      // bricks — pooled glossy 3D blocks, one per wall slot
      const brickGeo = new THREE.BoxGeometry(42, 16, 26);
      const brickMats = ROW_COLORS.map((hex) => {
        const c = new THREE.Color(hex);
        return new THREE.MeshStandardMaterial({ color: c, roughness: 0.32, metalness: 0.35, emissive: c, emissiveIntensity: 0.22 });
      });
      const brickMeshes = S.bricks.map((br) => {
        const m = new THREE.Mesh(brickGeo, brickMats[br.row]);
        m.position.set(br.x + br.w / 2, wy(br.y + br.h / 2), 0);
        scene.add(m);
        return m;
      });
      // gold paddle
      const paddle = new THREE.Mesh(
        new THREE.BoxGeometry(PADDLE_W, 13, 36),
        new THREE.MeshStandardMaterial({ color: 0xf5c542, roughness: 0.28, metalness: 0.6, emissive: 0xf5c542, emissiveIntensity: 0.16 })
      );
      paddle.position.set(S.paddleX, wy(PADDLE_Y + 6), 0);
      scene.add(paddle);
      // ball — glowing sphere + light + trail points
      const ball = new THREE.Mesh(
        new THREE.SphereGeometry(8.4, 18, 14),
        new THREE.MeshBasicMaterial({ color: 0xeaf7ff })
      );
      scene.add(ball);
      const ballLight = new THREE.PointLight(0x9fd8ff, 1.0, 210, 0);
      scene.add(ballLight);
      let trailPts;
      {
        const g = new THREE.BufferGeometry();
        g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(11 * 3), 3));
        const cols = new Float32Array(11 * 3);
        for (let i = 0; i < 11; i++) {
          const f = (i / 11) * 0.55;
          cols[i * 3] = 0.62 * f; cols[i * 3 + 1] = 0.85 * f; cols[i * 3 + 2] = 1 * f;
        }
        g.setAttribute('color', new THREE.BufferAttribute(cols, 3));
        trailPts = new THREE.Points(g, new THREE.PointsMaterial({ size: 6.5, sizeAttenuation: false, vertexColors: true, transparent: true, opacity: 0.85 }));
        trailPts.frustumCulled = false;
        scene.add(trailPts);
      }
      // brick shatter particles
      const PMAX = 160;
      let partPts;
      {
        const g = new THREE.BufferGeometry();
        g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(PMAX * 3), 3));
        g.setAttribute('color', new THREE.BufferAttribute(new Float32Array(PMAX * 3), 3));
        partPts = new THREE.Points(g, new THREE.PointsMaterial({ size: 4.6, sizeAttenuation: false, vertexColors: true, transparent: true, opacity: 0.95 }));
        partPts.frustumCulled = false;
        scene.add(partPts);
      }
      const colorCache = {};
      function rgb(hex) {
        if (!colorCache[hex]) {
          const n = parseInt(hex.slice(1), 16);
          colorCache[hex] = [((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255];
        }
        return colorCache[hex];
      }

      function syncScene() {
        // bricks follow the wall state — a wall rebuild re-seats the pool
        if (brickMeshes.length !== S.bricks.length) {
          for (const m of brickMeshes) scene.remove(m);
          brickMeshes.length = 0;
          for (const br of S.bricks) {
            const m = new THREE.Mesh(brickGeo, brickMats[br.row]);
            scene.add(m);
            brickMeshes.push(m);
          }
        }
        S.bricks.forEach((br, i) => {
          const m = brickMeshes[i];
          m.visible = br.alive;
          m.position.set(br.x + br.w / 2, wy(br.y + br.h / 2), 0);
        });
        paddle.position.x = S.paddleX;
        const b = S.ball;
        if (b) {
          ball.visible = true;
          ball.position.set(b.x, wy(b.y), 6);
          ballLight.position.set(b.x, wy(b.y), 46);
        } else ball.visible = false;
        {
          const arr = trailPts.geometry.getAttribute('position');
          for (let i = 0; i < 11; i++) {
            const tp = S.trail[i];
            if (!tp) { arr.setXYZ(i, -100, -100, -100); continue; }
            arr.setXYZ(i, tp.x, wy(tp.y), 4);
          }
          arr.needsUpdate = true;
        }
        {
          const posA = partPts.geometry.getAttribute('position');
          const colA = partPts.geometry.getAttribute('color');
          for (let i = 0; i < PMAX; i++) {
            const pt = S.particles[i];
            if (!pt) { posA.setXYZ(i, -200, -200, -200); continue; }
            posA.setXYZ(i, pt.x, wy(pt.y), 16);
            const c = rgb(pt.color);
            colA.setXYZ(i, c[0], c[1], c[2]);
          }
          posA.needsUpdate = true;
          colA.needsUpdate = true;
        }
      }

      // ---------- overlay: popups + game over (game coordinates) ----------
      const overlay = overlayRef.current;
      const octx = overlay.getContext('2d');
      function drawOverlay() {
        octx.clearRect(0, 0, W, H);
        for (const pu of S.popups) {
          octx.globalAlpha = Math.max(0, Math.min(1, pu.life));
          octx.font = `900 ${pu.size}px system-ui`;
          octx.textAlign = 'center';
          octx.strokeStyle = 'rgba(4,8,20,0.85)';
          octx.lineWidth = 4;
          octx.strokeText(pu.text, pu.x, pu.y);
          octx.fillStyle = pu.color;
          octx.fillText(pu.text, pu.x, pu.y);
        }
        octx.globalAlpha = 1;
        if (S.over) {
          octx.fillStyle = 'rgba(4,8,16,0.66)';
          octx.fillRect(0, 0, W, H);
          octx.fillStyle = '#fff';
          octx.font = 'bold 26px system-ui';
          octx.textAlign = 'center';
          octx.fillText('GAME OVER', W / 2, H / 2 - 8);
          octx.font = '15px system-ui';
          octx.fillStyle = '#f5c542';
          octx.fillText(`${S.score.toLocaleString()} points`, W / 2, H / 2 + 20);
        }
        dom();
      }

      const el = {
        score: document.getElementById('bo-score'),
        balls: document.getElementById('bo-balls'),
        next: document.getElementById('bo-next'),
        msg: document.getElementById('bo-msg'),
      };
      function dom() {
        if (el.score) el.score.textContent = S.score.toLocaleString();
        if (el.balls) el.balls.textContent = `${Math.max(0, S.ballsLeft)}/3`;
        const nxt = BREAKOUT_TIERS.filter((t) => S.score < t.min).pop();
        if (el.next) {
          const amt = breakoutAmount(S.score);
          el.next.textContent = S.over
            ? amt > 0 ? `PAYS ${amt} PTS` : 'NO PAYOUT'
            : nxt ? `NEXT: ${nxt.amount} PTS @ ${nxt.min.toLocaleString()}` : 'MAX TIER!';
        }
        if (el.msg) el.msg.textContent = Date.now() - S.msgAt < 2600 ? S.msg : '';
      }

      let last = performance.now();
      const frame = (now) => {
        raf = requestAnimationFrame(frame);
        const dt = Math.min(0.033, (now - last) / 1000);
        last = now;
        stepLogic(dt);
        syncScene();
        renderer.render(scene, camera);
        drawOverlay();
      };
      raf = requestAnimationFrame(frame);

      window.__frgBreakout = {
        state: () => ({
          score: S.score,
          ballsLeft: S.ballsLeft,
          over: S.over,
          ball: S.ball ? { x: Math.round(S.ball.x), y: Math.round(S.ball.y), stuck: S.ball.stuck } : null,
          paddleX: Math.round(S.paddleX),
        }),
        setPaddle: (x) => { S.paddleX = Math.max(PADDLE_W / 2, Math.min(W - PADDLE_W / 2, x)); },
        launch: () => launch(),
      };

      cleanup3d = () => {
        cancelAnimationFrame(raf);
        renderer.dispose();
        if (renderer.domElement.parentNode) renderer.domElement.parentNode.removeChild(renderer.domElement);
        delete window.__frgBreakout;
      };
    })();

    function onMove(e) {
      const rect = mountRef.current?.getBoundingClientRect();
      if (!rect) return;
      const cx = (e.touches ? e.touches[0].clientX : e.clientX) - rect.left;
      S.paddleX = Math.max(PADDLE_W / 2, Math.min(W - PADDLE_W / 2, (cx / rect.width) * W));
    }
    function onDown(e) {
      onMove(e);
      launch();
    }
    const mountEl = mountRef.current;
    if (mountEl) {
      mountEl.addEventListener('pointermove', onMove);
      mountEl.addEventListener('pointerdown', onDown);
      mountEl.addEventListener('touchmove', onMove, { passive: true });
    }

    return () => {
      disposed = true;
      cleanup3d();
      if (mountEl) {
        mountEl.removeEventListener('pointermove', onMove);
        mountEl.removeEventListener('pointerdown', onDown);
        mountEl.removeEventListener('touchmove', onMove);
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="game-wrap pinball-wrap">
      <h2 className="game-title">🧱 FRG BREAKOUT 3D</h2>
      <div className="pb-hud">
        <div>SCORE <b id="bo-score">0</b></div>
        <div>BALL <b id="bo-balls">3/3</b></div>
        <div className="pb-next" id="bo-next">NEXT: 5 PTS @ 600</div>
      </div>
      <div
        ref={mountRef}
        style={{ position: 'relative', width: '100%', maxWidth: W, aspectRatio: '400 / 520', margin: '0 auto', touchAction: 'none', borderRadius: 12, overflow: 'hidden' }}
      >
        <canvas
          ref={overlayRef}
          width={W}
          height={H}
          style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', pointerEvents: 'none', zIndex: 2 }}
        />
      </div>
      <div className="pb-msg" id="bo-msg" />
      <p className="pinball-note">
        Drag on the board to steer the paddle. Rows pay 60/50/40/30/20/10 —
        clearing the whole wall pays +400 and the next wall is faster.
        Payouts: 600→5 · 1,300→10 · 2,000→15 · 2,900→22 · 4,000→32 ·
        5,500→45 PTS. Three balls — make them count.
      </p>
    </div>
  );
}
