import { useEffect, useRef } from 'react';

// FRG Breakout — paddle & bricks. Drag (or move the mouse) to steer the
// paddle, keep the ball alive, smash the wall. 3 balls; every brick is
// points and clearing the wall pays a bonus and builds a faster one.
// Score converts to FRG by tiers (the server re-derives them exactly).
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
  const canvasRef = useRef(null);
  const doneRef = useRef(false);

  useEffect(() => {
    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d');
    const start = Date.now();
    const S = {
      score: 0,
      ballsLeft: 3,
      over: false,
      paddleX: W / 2,
      ball: null, // {x,y,vx,vy,stuck}
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

    let raf = 0;
    let last = performance.now();
    function step(now) {
      raf = requestAnimationFrame(step);
      const dt = Math.min(0.033, (now - last) / 1000);
      last = now;
      const b = S.ball;
      if (b && !S.over) {
        if (b.stuck) {
          b.x = S.paddleX;
          if (Date.now() - b.serveAt > 1200) launch();
        } else {
          b.x += b.vx * dt;
          b.y += b.vy * dt;
          // walls
          if (b.x < 9) { b.x = 9; b.vx = Math.abs(b.vx); }
          if (b.x > W - 9) { b.x = W - 9; b.vx = -Math.abs(b.vx); }
          if (b.y < 9) { b.y = 9; b.vy = Math.abs(b.vy); }
          // paddle
          if (b.vy > 0 && b.y > PADDLE_Y - 9 && b.y < PADDLE_Y + 12 && Math.abs(b.x - S.paddleX) < PADDLE_W / 2 + 7) {
            const off = Math.max(-1, Math.min(1, (b.x - S.paddleX) / (PADDLE_W / 2)));
            const speed = Math.min(580, Math.hypot(b.vx, b.vy) * 1.01);
            const ang = off * (62 * Math.PI / 180);
            b.vx = Math.sin(ang) * speed;
            b.vy = -Math.cos(ang) * speed;
            b.y = PADDLE_Y - 10;
          }
          // bricks
          for (const br of S.bricks) {
            if (!br.alive) continue;
            if (b.x > br.x - 7 && b.x < br.x + br.w + 7 && b.y > br.y - 7 && b.y < br.y + br.h + 7) {
              br.alive = false;
              S.score += ROW_PTS[br.row];
              // bounce off the smaller penetration axis
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
            say(`🧱 Wall down! +${WALL_BONUS} — faster wall #${S.wall}`);
            buildWall();
            serve();
          }
          // drain
          if (b.y > H + 14) {
            S.ballsLeft -= 1;
            if (S.ballsLeft <= 0) { finish(); }
            else { say(`Ball lost — ${S.ballsLeft} left`); serve(); }
          }
        }
      }
      draw();
    }

    function draw() {
      ctx.fillStyle = '#0d1526';
      ctx.fillRect(0, 0, W, H);
      // frame
      ctx.strokeStyle = '#2b3a55';
      ctx.lineWidth = 2;
      ctx.strokeRect(3, 3, W - 6, H - 6);
      // bricks
      for (const br of S.bricks) {
        if (!br.alive) continue;
        ctx.fillStyle = ROW_COLORS[br.row];
        ctx.beginPath();
        ctx.roundRect(br.x, br.y, br.w, br.h, 3);
        ctx.fill();
        ctx.fillStyle = 'rgba(255,255,255,0.30)';
        ctx.fillRect(br.x + 3, br.y + 2.5, br.w - 6, 3);
      }
      // paddle
      const px = S.paddleX - PADDLE_W / 2;
      ctx.fillStyle = '#f5c542';
      ctx.beginPath();
      ctx.roundRect(px, PADDLE_Y, PADDLE_W, 12, 6);
      ctx.fill();
      ctx.fillStyle = '#0d1526';
      ctx.font = 'bold 8px system-ui';
      ctx.textAlign = 'center';
      ctx.fillText('FRG', S.paddleX, PADDLE_Y + 9.5);
      // ball
      const b = S.ball;
      if (b && !S.over) {
        ctx.fillStyle = '#ffffff';
        ctx.beginPath();
        ctx.arc(b.x, b.y, 7, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = 'rgba(255,255,255,0.35)';
        ctx.beginPath();
        ctx.arc(b.x - (b.vx || 0) * 0.03, b.y - (b.vy || 0) * 0.03, 4.5, 0, Math.PI * 2);
        ctx.fill();
      }
      if (S.over) {
        ctx.fillStyle = 'rgba(4,8,16,0.72)';
        ctx.fillRect(0, 0, W, H);
        ctx.fillStyle = '#fff';
        ctx.font = 'bold 26px system-ui';
        ctx.textAlign = 'center';
        ctx.fillText('GAME OVER', W / 2, H / 2 - 8);
        ctx.font = '15px system-ui';
        ctx.fillStyle = '#f5c542';
        ctx.fillText(`${S.score.toLocaleString()} points`, W / 2, H / 2 + 20);
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

    function onMove(e) {
      const rect = canvas.getBoundingClientRect();
      const cx = (e.touches ? e.touches[0].clientX : e.clientX) - rect.left;
      S.paddleX = Math.max(PADDLE_W / 2, Math.min(W - PADDLE_W / 2, (cx / rect.width) * W));
    }
    function onDown(e) {
      onMove(e);
      launch();
    }
    canvas.addEventListener('pointermove', onMove);
    canvas.addEventListener('pointerdown', onDown);
    canvas.addEventListener('touchmove', onMove, { passive: true });

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

    raf = requestAnimationFrame(step);
    return () => {
      cancelAnimationFrame(raf);
      canvas.removeEventListener('pointermove', onMove);
      canvas.removeEventListener('pointerdown', onDown);
      canvas.removeEventListener('touchmove', onMove);
      delete window.__frgBreakout;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="game-wrap pinball-wrap">
      <h2 className="game-title">🧱 FRG BREAKOUT</h2>
      <div className="pb-hud">
        <div>SCORE <b id="bo-score">0</b></div>
        <div>BALL <b id="bo-balls">3/3</b></div>
        <div className="pb-next" id="bo-next">NEXT: 5 PTS @ 600</div>
      </div>
      <canvas ref={canvasRef} width={W} height={H} className="pb-canvas" />
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
