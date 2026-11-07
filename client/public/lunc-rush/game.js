'use strict';
/* LUNC RUSH — Luna Classic momentum speed-platformer.
   Original engine + art. Sonic-STYLE mechanics (momentum, spin, loops,
   corkscrews) implemented from scratch; no third-party assets.
   Tokens in game: LUNC (crescent coin, repo art lunc.png) + USTC stars. */
const $ = (id) => document.getElementById(id);
const canvas = $('game'), ctx = canvas.getContext('2d');
window.__errs = [];
window.addEventListener('error', (e) => { window.__errs.push(String(e.message || e.error || 'err')); });

let CW = 0, CH = 0, DPR = 1, ZOOM = 1, VIEWW = 900, VIEWH = 540;
function resize() {
  DPR = Math.min(window.devicePixelRatio || 1, 2);
  CW = window.innerWidth; CH = window.innerHeight;
  canvas.width = Math.round(CW * DPR); canvas.height = Math.round(CH * DPR);
  VIEWW = (CH > CW) ? 600 : 980;
  ZOOM = CW / VIEWW; VIEWH = CH / ZOOM;
}
window.addEventListener('resize', resize); resize();

/* ---------------- audio: tiny original synth blips (no music) ---------------- */
let AC = null, muted = false;
try { muted = localStorage.getItem('luncRushMute') === '1'; } catch (e) {}
function audio() { if (!AC) { try { AC = new (window.AudioContext || window.webkitAudioContext)(); } catch (e) {} } if (AC && AC.state === 'suspended') AC.resume(); return AC; }
function tone(f0, f1, dur, type, vol, delay) {
  if (muted) return; const ac = audio(); if (!ac) return;
  const t0 = ac.currentTime + (delay || 0);
  const o = ac.createOscillator(), g = ac.createGain();
  o.type = type || 'square'; o.frequency.setValueAtTime(f0, t0);
  if (f1 && f1 !== f0) o.frequency.exponentialRampToValueAtTime(Math.max(f1, 1), t0 + dur);
  g.gain.setValueAtTime(vol || 0.05, t0); g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
  o.connect(g); g.connect(ac.destination); o.start(t0); o.stop(t0 + dur + 0.02);
}
const sfx = {
  coin(n) { const b = 1250 + Math.min(n || 0, 10) * 60; tone(b, b * 1.5, 0.09, 'square', 0.035); },
  star() { tone(880, 880, 0.07, 'triangle', 0.06); tone(1174, 1174, 0.07, 'triangle', 0.06, 0.06); tone(1568, 1568, 0.12, 'triangle', 0.06, 0.12); },
  jump() { tone(420, 760, 0.14, 'sine', 0.05); },
  spring() { tone(280, 980, 0.18, 'sine', 0.06); },
  smash() { tone(220, 40, 0.16, 'sawtooth', 0.07); tone(90, 30, 0.2, 'square', 0.05); },
  hurt() { tone(340, 70, 0.3, 'sawtooth', 0.06); },
  roll() { tone(300, 520, 0.08, 'triangle', 0.03); },
  beacon() { [659, 880, 1108, 1318].forEach((f, i) => tone(f, f, 0.12, 'triangle', 0.06, i * 0.09)); },
  fall() { tone(600, 120, 0.35, 'sine', 0.06); },
};

/* ---------------- input ---------------- */
const keys = { left: false, right: false, down: false, jump: false };
let jumpPressed = false; // edge trigger, consumed by physics
function pressJump() { jumpPressed = true; }
const KEYMAP = { ArrowLeft: 'left', KeyA: 'left', ArrowRight: 'right', KeyD: 'right', ArrowDown: 'down', KeyS: 'down' };
window.addEventListener('keydown', (e) => {
  if (KEYMAP[e.code]) { keys[KEYMAP[e.code]] = true; e.preventDefault(); }
  if (e.code === 'Space' || e.code === 'ArrowUp' || e.code === 'KeyW') { if (!keys.jump) pressJump(); keys.jump = true; e.preventDefault(); }
  if (e.code === 'KeyP' || e.code === 'Escape') togglePause();
});
window.addEventListener('keyup', (e) => {
  if (KEYMAP[e.code]) keys[KEYMAP[e.code]] = false;
  if (e.code === 'Space' || e.code === 'ArrowUp' || e.code === 'KeyW') keys.jump = false;
});
function bindTouch(id, prop) {
  const el = $(id);
  const on = (e) => { e.preventDefault(); el.classList.add('held'); if (prop === 'jump') { if (!keys.jump) pressJump(); keys.jump = true; } else keys[prop] = true; audio(); };
  const off = (e) => { e.preventDefault(); el.classList.remove('held'); keys[prop] = false; };
  el.addEventListener('touchstart', on, { passive: false }); el.addEventListener('touchend', off, { passive: false });
  el.addEventListener('touchcancel', off, { passive: false });
  el.addEventListener('mousedown', on); el.addEventListener('mouseup', off); el.addEventListener('mouseleave', off);
}
bindTouch('tLeft', 'left'); bindTouch('tRight', 'right'); bindTouch('tRoll', 'down'); bindTouch('tJump', 'jump');
const isTouch = ('ontouchstart' in window) || navigator.maxTouchPoints > 0;

/* ---------------- virtual thumbstick (default touch control) ----------------
   Floating stick: touch anywhere in the left zone and the base lands under
   the thumb. Horizontal push is ANALOG (scales the existing accel), push
   DOWN past the gate = roll/crouch. Classic pad stays selectable. */
let ctrlMode = 'stick';
try { if (localStorage.getItem('luncRushControls') === 'pad') ctrlMode = 'pad'; } catch (e) {}
const stick = { x: 0, down: false, id: null, ox: 0, oy: 0, live: false };
const STICK_R = 52;
function inputAxis() { // -1..1 merged axis: keys win, else analog stick
  const k = (keys.right ? 1 : 0) - (keys.left ? 1 : 0);
  return k !== 0 ? k : stick.x;
}
function downHeld() { return keys.down || stick.down; }
function stickHome() {
  const b = $('stickBase'), z = $('stickZone'); if (!b || !z) return;
  const zr = z.getBoundingClientRect(); // base is positioned relative to the zone
  b.style.left = (86 - zr.left) + 'px'; b.style.top = (window.innerHeight - 116 - zr.top) + 'px';
  $('stickKnob').style.transform = 'translate(0px,0px)';
}
function stickSet(cx, cy) {
  let dx = cx - stick.ox, dy = cy - stick.oy;
  const d = Math.hypot(dx, dy);
  if (d > STICK_R) { dx *= STICK_R / d; dy *= STICK_R / d; }
  $('stickKnob').style.transform = `translate(${dx}px,${dy}px)`;
  const nx = dx / STICK_R, ny = dy / STICK_R;
  stick.x = Math.abs(nx) < 0.16 ? 0 : nx;
  stick.down = ny > 0.52;
}
function stickRelease() {
  stick.x = 0; stick.down = false; stick.id = null; stick.live = false;
  stickHome();
}
function stickBegin(cx, cy, id) {
  stick.id = id; stick.ox = cx; stick.oy = cy; stick.live = true;
  const b = $('stickBase'), zr = $('stickZone').getBoundingClientRect();
  b.style.left = (cx - zr.left) + 'px'; b.style.top = (cy - zr.top) + 'px';
  stickSet(cx, cy);
  audio();
}
(function wireStick() {
  const zoneEl = $('stickZone'); if (!zoneEl) return;
  zoneEl.addEventListener('touchstart', (e) => {
    e.preventDefault();
    if (stick.id !== null) return;
    const t = e.changedTouches[0];
    stickBegin(t.clientX, t.clientY, t.identifier);
  }, { passive: false });
  zoneEl.addEventListener('touchmove', (e) => {
    e.preventDefault();
    for (const t of e.changedTouches) if (t.identifier === stick.id) stickSet(t.clientX, t.clientY);
  }, { passive: false });
  const end = (e) => { for (const t of e.changedTouches) if (t.identifier === stick.id) stickRelease(); };
  zoneEl.addEventListener('touchend', end); zoneEl.addEventListener('touchcancel', end);
  zoneEl.addEventListener('mousedown', (e) => {
    if (stick.id !== null) return;
    stickBegin(e.clientX, e.clientY, 'mouse');
    const mv = (ev) => { if (stick.id === 'mouse') stickSet(ev.clientX, ev.clientY); };
    const up = () => { if (stick.id === 'mouse') stickRelease(); window.removeEventListener('mousemove', mv); window.removeEventListener('mouseup', up); };
    window.addEventListener('mousemove', mv); window.addEventListener('mouseup', up);
  });
})();
function syncTouchUI() {
  const on = $('touch').classList.contains('on');
  const stickMode = ctrlMode === 'stick';
  $('touch').classList.toggle('stickmode', stickMode);
  const z = $('stickZone');
  if (z) z.classList.toggle('on', on && stickMode && isTouch);
  if (!(on && stickMode)) stickRelease(); else stickHome();
}
function setControls(m) {
  ctrlMode = m;
  try { localStorage.setItem('luncRushControls', m); } catch (e) {}
  stickRelease(); applyLang(); syncTouchUI();
}
function toggleControls() { audio(); setControls(ctrlMode === 'stick' ? 'pad' : 'stick'); }

/* ---------------- terrain ----------------
   Span: {x0,x1,y0,y1,k,d}  k: 'lin' | 'arc' (cosine ease) | 'dip' (y0->y1 + d*sin(pi t)) */
function spanY(s, x) {
  const t = (x - s.x0) / (s.x1 - s.x0);
  if (s.k === 'arc') return s.y0 + (s.y1 - s.y0) * (0.5 - 0.5 * Math.cos(Math.PI * t));
  if (s.k === 'dip') return s.y0 + (s.y1 - s.y0) * t + (s.d || 0) * Math.sin(Math.PI * t);
  return s.y0 + (s.y1 - s.y0) * t;
}
function spanSlope(s, x) {
  const t = (x - s.x0) / (s.x1 - s.x0), w = s.x1 - s.x0;
  if (s.k === 'arc') return (s.y1 - s.y0) * (Math.PI / (2 * w)) * Math.sin(Math.PI * t);
  if (s.k === 'dip') return (s.y1 - s.y0) / w + (s.d || 0) * (Math.PI / w) * Math.cos(Math.PI * t);
  return (s.y1 - s.y0) / w;
}
function surfaceAt(z, x) {
  const spans = z.spans;
  for (let i = 0; i < spans.length; i++) {
    const s = spans[i];
    if (x >= s.x0 && x <= s.x1) return { y: spanY(s, x), ang: Math.atan(spanSlope(s, x)), span: s };
  }
  return null;
}

/* ---------------- zone definitions ---------------- */
const G_STD = 2250, LOOP_MIN = 380, LOOP_G = 331; // speed retune 2 (owner, Nov 6): top speed 1122->810 (x0.722 on top of Nov 5 x0.85); loop gate scaled by the same factor, loop gravity by its square, so loop entry/detach behave identically in relative terms. NOTE: in-loop speed loss is dominated by the tangential-gravity climb (entry ~1.45x gate min speed at the top ~ sqrt(LOOP_G*r)), identical in relative terms in every build — a ~1.06x-gate entry can never clear any loop in ANY build (verified A/B vs the 1122 build); natural entries run at ~2.1x gate.
function buildZones() {
  const Z = [];
  function mk(spans, o) { const z = Object.assign({ spans, coins: [], stars: [], enemies: [], springs: [], loops: [], corks: [], plats: [], beacon: 0, len: 0, par: 75, grav: G_STD, jump: 1000, ckpt: 0, theme: 0 }, o || {}); Z.push(z); return z; }
  function coinSurf(z, x0, x1, n, lift) { for (let i = 0; i < n; i++) { const x = n === 1 ? (x0 + x1) / 2 : x0 + (x1 - x0) * i / (n - 1); const s = surfaceAt(z, x); if (s) z.coins.push({ x, y: s.y - (lift || 32), taken: false }); } }
  function coinLine(z, x0, x1, y, n) { for (let i = 0; i < n; i++) { const x = n === 1 ? (x0 + x1) / 2 : x0 + (x1 - x0) * i / (n - 1); z.coins.push({ x, y, taken: false }); } }
  function loopCoins(z, L, n) { for (let i = 0; i < n; i++) { const a = (-35 - i * 26) * Math.PI / 180; z.coins.push({ x: L.cx + (L.r - 6) * Math.cos(a), y: (L.gy - L.r) + (L.r - 6) * Math.sin(a), taken: false }); } }
  function corkCoins(z, C, n) { for (let i = 0; i < n; i++) { const s = i / (n - 1), x = C.x0 + (C.x1 - C.x0) * s; const surf = surfaceAt(z, x); if (!surf) continue; const b = -Math.PI / 2 + s * C.turns * 2 * Math.PI; z.coins.push({ x, y: (surf.y - C.r) - C.r * Math.sin(b), taken: false, cork: C }); } }
  function star(z, x, y) { z.stars.push({ x, y, taken: false }); }
  function starSurf(z, x, lift) { const s = surfaceAt(z, x); if (s) star(z, x, s.y - (lift || 46)); }

  /* ===== ZONE 1 — Coral Palms (tropical island) ===== */
  const z1 = mk([
    { x0: 0, x1: 650, y0: 430, y1: 430, k: 'lin' },
    { x0: 650, x1: 1100, y0: 430, y1: 345, k: 'lin' },
    { x0: 1100, x1: 1750, y0: 345, y1: 430, k: 'arc' },
    { x0: 1750, x1: 2750, y0: 430, y1: 430, k: 'lin' },
    { x0: 2750, x1: 3300, y0: 430, y1: 430, k: 'dip', d: 95 },
    { x0: 3300, x1: 4400, y0: 430, y1: 430, k: 'lin' },
    { x0: 4400, x1: 4700, y0: 430, y1: 380, k: 'lin' },
    { x0: 4700, x1: 5600, y0: 380, y1: 380, k: 'lin' },
    { x0: 5600, x1: 5900, y0: 380, y1: 430, k: 'arc' },
    { x0: 5900, x1: 6650, y0: 430, y1: 430, k: 'lin' },
    { x0: 6650, x1: 7150, y0: 430, y1: 430, k: 'lin' },
    { x0: 7150, x1: 7750, y0: 430, y1: 430, k: 'dip', d: 110 },
    { x0: 7750, x1: 8300, y0: 430, y1: 372, k: 'lin' },
    { x0: 8300, x1: 9300, y0: 372, y1: 372, k: 'lin' },
    { x0: 9300, x1: 9750, y0: 372, y1: 430, k: 'arc' },
    { x0: 9750, x1: 10950, y0: 430, y1: 430, k: 'lin' },
    { x0: 10950, x1: 11550, y0: 430, y1: 430, k: 'dip', d: 80 },
    { x0: 11550, x1: 12100, y0: 430, y1: 385, k: 'lin' },
    { x0: 12100, x1: 12700, y0: 385, y1: 385, k: 'lin' },
    { x0: 12700, x1: 13000, y0: 385, y1: 430, k: 'arc' },
    { x0: 13000, x1: 13450, y0: 430, y1: 430, k: 'lin' },
  ], { len: 13450, beacon: 13290, par: 185, theme: 0, ckpt: 8300 });
  z1.loops.push({ cx: 2050, r: 112, gy: 430 });
  z1.corks.push({ x0: 4860, x1: 5460, r: 62, turns: 1 });
  z1.springs.push({ x: 3460, y: 430, pow: 1090, anim: 0 });
  z1.plats.push({ x0: 3560, x1: 4360, y: 296 });
  z1.enemies.push({ type: 'candle', x: 3950, range: 46, sp: 19 }, { type: 'candle', x: 6120, range: 60, sp: 22 }, { type: 'drone', x: 2420, y0: 318, range: 70 }, { type: 'drone', x: 4180, y0: 306, range: 56 });
  coinSurf(z1, 150, 600, 6); coinSurf(z1, 720, 1040, 5); coinSurf(z1, 1200, 1700, 6);
  loopCoins(z1, z1.loops[0], 5);
  coinSurf(z1, 2820, 3240, 6, 40); coinLine(z1, 3640, 4280, 264, 7); coinSurf(z1, 4480, 4660, 3);
  corkCoins(z1, z1.corks[0], 9); coinSurf(z1, 5960, 6400, 6);
  star(z1, 4300, 252); starSurf(z1, 5540, 48); starSurf(z1, 3260, 54);
  /* Z1 extension: dip valley, sea-bridge corkscrew (1.5 turns), loop 2, spring shelf */
  z1.loops.push({ cx: 10450, r: 118, gy: 430 });
  z1.corks.push({ x0: 8450, x1: 9250, r: 64, turns: 1.5 });
  z1.springs.push({ x: 11700, y: 418, pow: 1090, anim: 0 });
  z1.plats.push({ x0: 11820, x1: 12460, y: 300 });
  z1.enemies.push({ type: 'candle', x: 6880, range: 52, sp: 20 }, { type: 'drone', x: 9550, y0: 300, range: 54 }, { type: 'candle', x: 11200, range: 48, sp: 19 }, { type: 'drone', x: 12340, y0: 252, range: 54 }, { type: 'candle', x: 13180, range: 40, sp: 19 });
  coinSurf(z1, 6720, 7100, 5); coinSurf(z1, 7220, 7680, 5, 44); coinSurf(z1, 7820, 8240, 4);
  corkCoins(z1, z1.corks[1], 10); coinSurf(z1, 9360, 9700, 4);
  coinSurf(z1, 9850, 10150, 4); loopCoins(z1, z1.loops[1], 6);
  coinSurf(z1, 11000, 11500, 5, 42); coinLine(z1, 11880, 12400, 268, 6); coinSurf(z1, 13040, 13360, 5);
  starSurf(z1, 7450, 56); star(z1, 12150, 252); starSurf(z1, 13260, 48);

  /* ===== ZONE 2 — Canyon Rush (sunset canyon) ===== */
  const z2 = mk([
    { x0: 0, x1: 800, y0: 430, y1: 430, k: 'lin' },
    { x0: 800, x1: 1250, y0: 430, y1: 360, k: 'lin' },
    { x0: 1250, x1: 1900, y0: 360, y1: 360, k: 'lin' },
    { x0: 1985, x1: 2600, y0: 375, y1: 375, k: 'lin' },
    { x0: 2600, x1: 3050, y0: 375, y1: 430, k: 'arc' },
    { x0: 3050, x1: 4200, y0: 430, y1: 430, k: 'lin' },
    { x0: 4200, x1: 4750, y0: 430, y1: 350, k: 'lin' },
    { x0: 4750, x1: 5450, y0: 350, y1: 350, k: 'lin' },
    { x0: 5450, x1: 5800, y0: 350, y1: 430, k: 'arc' },
    { x0: 5800, x1: 6180, y0: 430, y1: 430, k: 'lin' },
    { x0: 6245, x1: 7020, y0: 430, y1: 430, k: 'lin' },
    { x0: 7020, x1: 7750, y0: 430, y1: 430, k: 'lin' },
    { x0: 7750, x1: 8300, y0: 430, y1: 352, k: 'lin' },
    { x0: 8300, x1: 9050, y0: 352, y1: 352, k: 'lin' },
    { x0: 9050, x1: 9650, y0: 352, y1: 430, k: 'arc' },
    { x0: 9650, x1: 10400, y0: 430, y1: 430, k: 'lin' },
    { x0: 10400, x1: 11000, y0: 430, y1: 355, k: 'lin' },
    { x0: 11000, x1: 11750, y0: 355, y1: 355, k: 'lin' },
    { x0: 11750, x1: 12150, y0: 355, y1: 430, k: 'arc' },
    { x0: 12150, x1: 12900, y0: 430, y1: 430, k: 'dip', d: 95 },
    { x0: 12900, x1: 14040, y0: 430, y1: 430, k: 'lin' },
  ], { len: 14040, beacon: 13890, par: 200, theme: 1, ckpt: 6300 });
  z2.loops.push({ cx: 3420, r: 116, gy: 430 });
  z2.corks.push({ x0: 4900, x1: 5420, r: 60, turns: 1 });
  z2.springs.push({ x: 3900, y: 430, pow: 1070, anim: 0 });
  z2.plats.push({ x0: 4020, x1: 4720, y: 292 });
  z2.enemies.push({ type: 'drone', x: 1560, y0: 252, range: 80 }, { type: 'candle', x: 2300, range: 52, sp: 20 }, { type: 'candle', x: 3650, range: 40, sp: 17 }, { type: 'candle', x: 6520, range: 64, sp: 23 }, { type: 'drone', x: 5960, y0: 322, range: 60 });
  coinSurf(z2, 140, 740, 7); coinSurf(z2, 1330, 1840, 6); coinSurf(z2, 2060, 2540, 6);
  coinSurf(z2, 2680, 3000, 4); loopCoins(z2, z2.loops[0], 5); coinLine(z2, 4100, 4640, 260, 6);
  corkCoins(z2, z2.corks[0], 8); coinSurf(z2, 5840, 6140, 4); coinSurf(z2, 6300, 6820, 6);
  starSurf(z2, 2540, 48); star(z2, 4620, 248); starSurf(z2, 6330, 48);
  /* Z2 extension: rooftop spring chain (2 springs, 2 plats), corkscrew 2, half-pipe dip */
  z2.corks.push({ x0: 9820, x1: 10380, r: 60, turns: 1 });
  z2.springs.push({ x: 8380, y: 352, pow: 1020, anim: 0 }, { x: 9120, y: 262, pow: 980, anim: 0 });
  z2.plats.push({ x0: 8500, x1: 9200, y: 262 }, { x0: 9280, x1: 9950, y: 180 });
  z2.enemies.push({ type: 'candle', x: 7360, range: 56, sp: 22 }, { type: 'drone', x: 8760, y0: 168, range: 46 }, { type: 'candle', x: 10760, range: 48, sp: 19 }, { type: 'drone', x: 11400, y0: 250, range: 64 }, { type: 'drone', x: 12550, y0: 322, range: 58 }, { type: 'candle', x: 13380, range: 58, sp: 22 });
  coinSurf(z2, 7080, 7700, 7); coinSurf(z2, 7820, 8240, 5);
  coinLine(z2, 8560, 9140, 230, 6); coinLine(z2, 9340, 9890, 148, 6);
  corkCoins(z2, z2.corks[1], 9); coinSurf(z2, 10460, 10940, 5); coinSurf(z2, 11060, 11700, 6);
  coinSurf(z2, 12200, 12850, 6, 42); coinSurf(z2, 12960, 13820, 8);
  star(z2, 9600, 132); star(z2, 10100, 322); starSurf(z2, 13600, 48);

  /* ===== ZONE 3 — Neon Tundra (aurora snow) ===== */
  const z3 = mk([
    { x0: 0, x1: 900, y0: 430, y1: 430, k: 'lin' },
    { x0: 900, x1: 1500, y0: 430, y1: 430, k: 'dip', d: 115 },
    { x0: 1500, x1: 2000, y0: 430, y1: 340, k: 'lin' },
    { x0: 2000, x1: 2700, y0: 340, y1: 340, k: 'lin' },
    { x0: 2700, x1: 3200, y0: 340, y1: 430, k: 'arc' },
    { x0: 3200, x1: 4400, y0: 430, y1: 430, k: 'lin' },
    { x0: 4400, x1: 4900, y0: 430, y1: 355, k: 'lin' },
    { x0: 4900, x1: 5800, y0: 355, y1: 355, k: 'lin' },
    { x0: 5800, x1: 6300, y0: 355, y1: 430, k: 'arc' },
    { x0: 6300, x1: 7220, y0: 430, y1: 430, k: 'lin' },
    { x0: 7220, x1: 7950, y0: 430, y1: 430, k: 'lin' },
    { x0: 7950, x1: 8700, y0: 430, y1: 430, k: 'dip', d: 120 },
    { x0: 8700, x1: 9300, y0: 430, y1: 350, k: 'lin' },
    { x0: 9300, x1: 10100, y0: 350, y1: 350, k: 'lin' },
    { x0: 10100, x1: 10600, y0: 350, y1: 430, k: 'arc' },
    { x0: 10600, x1: 11800, y0: 430, y1: 430, k: 'lin' },
    { x0: 11800, x1: 12400, y0: 430, y1: 430, k: 'dip', d: -70 },
    { x0: 12400, x1: 13100, y0: 430, y1: 430, k: 'dip', d: 90 },
    { x0: 13100, x1: 13650, y0: 430, y1: 368, k: 'lin' },
    { x0: 13650, x1: 14150, y0: 368, y1: 368, k: 'lin' },
    { x0: 14150, x1: 14440, y0: 368, y1: 430, k: 'arc' },
  ], { len: 14440, beacon: 14310, par: 230, theme: 2, grav: 1500, jump: 905, ckpt: 9300 });
  z3.loops.push({ cx: 3560, r: 122, gy: 430 });
  z3.corks.push({ x0: 5060, x1: 5660, r: 66, turns: 1 });
  z3.springs.push({ x: 4060, y: 430, pow: 1000, anim: 0 });
  z3.plats.push({ x0: 4180, x1: 4920, y: 288 });
  z3.enemies.push({ type: 'drone', x: 2300, y0: 232, range: 74 }, { type: 'drone', x: 2560, y0: 268, range: 50 }, { type: 'candle', x: 3980, range: 44, sp: 19 }, { type: 'candle', x: 6620, range: 58, sp: 22 }, { type: 'drone', x: 6120, y0: 330, range: 66 });
  coinSurf(z3, 140, 840, 8); coinSurf(z3, 980, 1420, 6, 42); coinSurf(z3, 2080, 2640, 6);
  coinSurf(z3, 2780, 3140, 4); loopCoins(z3, z3.loops[0], 5); coinLine(z3, 4260, 4840, 256, 6);
  corkCoins(z3, z3.corks[0], 9); coinSurf(z3, 6380, 6980, 7);
  starSurf(z3, 1200, 52); star(z3, 4820, 244); starSurf(z3, 5740, 48);
  /* Z3 extension: low-grav swoop, loop 2, long float-arc (crest + valley), final deck */
  z3.loops.push({ cx: 11300, r: 124, gy: 430 });
  z3.enemies.push({ type: 'drone', x: 7620, y0: 306, range: 58 }, { type: 'candle', x: 9580, range: 46, sp: 19 }, { type: 'candle', x: 10980, range: 44, sp: 19 }, { type: 'drone', x: 13380, y0: 300, range: 56 }, { type: 'candle', x: 13920, range: 42, sp: 18 });
  coinSurf(z3, 7280, 7900, 7); coinSurf(z3, 8030, 8620, 6, 46); coinSurf(z3, 8760, 9240, 5);
  coinSurf(z3, 9360, 10040, 6); coinSurf(z3, 10160, 10540, 4);
  coinSurf(z3, 10660, 11020, 4); loopCoins(z3, z3.loops[1], 6);
  coinSurf(z3, 11880, 12360, 6, 128); coinSurf(z3, 12460, 13040, 5, 44);
  coinSurf(z3, 13160, 13600, 4); coinSurf(z3, 13710, 14100, 4); coinSurf(z3, 14190, 14390, 3);
  starSurf(z3, 10020, 50); star(z3, 12100, 268); starSurf(z3, 14020, 50);
  return Z;
}
const ZONES = buildZones();
const luncImg = new Image(); luncImg.src = 'lunc.png';

/* ---------------- game state ---------------- */
const ZONE_DEFS = ZONES;
let state = 'title'; // title | play | clear | over | finish
let paused = false;
let zi = 0, zone = null;
let score = 0, coinsHeld = 0, starsHeld = 0, hearts = 3, bonusTotal = 0;
let runTime = 0, zoneTime = 0, clearT = 0, coinChain = 0, chainT = 0;
let camX = 0, camY = 0, shake = 0;
let FX = {}; // feel-layer state (visual only — never read by physics)
function fxReset() { FX.zoom = 1; FX.lead = 0; FX.sq = 0; FX.st = 0; FX.wasAir = false; FX.prevVy = 0; FX.prevG = 0; FX.airT = 0; FX.skidT = 0; FX.corkIn = false; FX.loopFx = false; FX.corkFx = false; FX.wind = null; FX.lastX = 0; FX.lastY = 0; FX.pvx = 0; FX.pvy = 0; }
fxReset();
let particles = [], texts = [], dynCoins = [];
const P = { x: 70, y: 430, vx: 0, vy: 0, g: 0, ang: 0, grounded: true, onPlat: null, rolling: false, spin: false, facing: 1, invuln: 0, coyote: 0, jumpBuf: 0, cut: false, mode: 'ground', la: 0, ls: 0, ldir: 1, loop: null, respawnX: 70, runPhase: 0 };
let titleT = 0;

function freshZone(i) {
  const z = JSON.parse(JSON.stringify(ZONE_DEFS[i]));
  let maxY = 0;
  z.spans.forEach(s => { maxY = Math.max(maxY, s.y0, s.y1, s.y0 + (s.d || 0), s.y1 + (s.d || 0)); });
  z.killY = maxY + 380;
  z.enemies.forEach(e => { e.x0 = e.x; e.dead = false; e.t = Math.random() * 6; e.dir = 1; if (e.type === 'candle') { const s = surfaceAt(z, e.x); e.y = s ? s.y : 430; } });
  return z;
}
function loadZone(i, keepRun) {
  zi = i; zone = freshZone(i);
  P.x = 70; P.vx = 0; P.vy = 0; P.g = 0; P.rolling = false; P.spin = false; P.mode = 'ground'; P.loop = null; P.onPlat = null; P.invuln = 0; P.respawnX = 70;
  const s = surfaceAt(zone, P.x); P.y = s ? s.y : 430; P.grounded = true;
  zoneTime = 0; dynCoins = []; particles = []; texts = []; fxReset();
  camX = 0; camY = Math.max(-260, Math.min(P.y - VIEWH * 0.6, Math.max(-260, 640 - VIEWH)));
  showZoneBanner(T('zone' + (i + 1)), T('go'));
}
function startRun() {
  score = 0; coinsHeld = 0; starsHeld = 0; hearts = 3; bonusTotal = 0; runTime = 0;
  loadZone(0); state = 'play'; paused = false;
  $('titleScreen').classList.add('hidden'); $('endScreen').classList.add('hidden'); $('pauseScreen').classList.add('hidden');
  $('langSel').classList.add('hidden');
  $('hud').classList.remove('hidden'); if (isTouch) $('touch').classList.add('on');
  syncTouchUI();
  audio();
}
function corkAt(z, x) { for (const c of z.corks) if (x >= c.x0 && x <= c.x1) return c; return null; }
function corkBeta(c, x) { return -Math.PI / 2 + ((x - c.x0) / (c.x1 - c.x0)) * c.turns * 2 * Math.PI; }
function feetRenderPos() {
  if (P.grounded && P.mode === 'ground') {
    const c = corkAt(zone, P.x);
    if (c) { const s = surfaceAt(zone, P.x); if (s) return { x: P.x, y: (s.y - c.r) - c.r * Math.sin(corkBeta(c, P.x)), cork: c, beta: corkBeta(c, P.x) }; }
  }
  if (P.mode === 'loop' && P.loop) return { x: P.x, y: P.y, loop: true };
  return { x: P.x, y: P.y };
}

/* ---------------- physics ---------------- */
const ACC = 890, BRAKE = 1718, FRIC = 645, ROLLFRIC = 58, AIRACC = 479, MAXG = 810;
function doJump() {
  const z = zone, JV = z.jump;
  P.vx = P.g * Math.cos(P.ang) + JV * Math.sin(P.ang);
  P.vy = P.g * Math.sin(P.ang) - JV * Math.cos(P.ang);
  P.spin = P.rolling || Math.abs(P.g) > 160;
  P.grounded = false; P.onPlat = null; P.mode = 'air'; P.cut = false; P.coyote = 0;
  sfx.jump();
}
function landOn(surfY, ang, plat) {
  const z = zone;
  if (plat) { P.g = P.vx; P.ang = 0; } else { P.g = P.vx * Math.cos(ang) + P.vy * Math.sin(ang); P.ang = ang; }
  const landVy = P.vy;
  P.y = surfY; P.grounded = true; P.onPlat = plat || null; P.mode = 'ground'; P.vy = 0;
  if (landVy > 260) { const k = Math.min(1, landVy / 1200); FX.sq = Math.min(0.30, 0.10 + k * 0.22); FX.st = 0; if (landVy > 620) shake = Math.max(shake, 2.6); fxDust(P.x, surfY, Math.round(4 + k * 9), DUSTC[(Math.random() * 3) | 0], 120 + k * 130, 40 + k * 50); }
  if (P.spin && Math.abs(P.g) > 58) { P.rolling = true; }
  P.spin = false;
  if (P.g > MAXG) P.g = MAXG; if (P.g < -MAXG) P.g = -MAXG;
}
function step(dt) {
  const z = zone, G = z.grav;
  P.jumpBuf = Math.max(0, P.jumpBuf - dt); if (jumpPressed) { P.jumpBuf = 0.13; jumpPressed = false; }
  P.invuln = Math.max(0, P.invuln - dt);
  chainT -= dt; if (chainT <= 0) coinChain = 0;

  if (P.mode === 'loop' && P.loop) {
    const L = P.loop, prevLa = P.la;
    const tangG = -LOOP_G * Math.cos(P.la) * P.ldir; // accel along travel
    P.ls = Math.max(0, P.ls + tangG * dt - P.ls * 0.04 * dt);
    P.la += -P.ldir * (P.ls / L.r) * dt;
    P.x = L.cx + L.r * Math.cos(P.la); P.y = (L.gy - L.r) + L.r * Math.sin(P.la);
    P.facing = P.ldir;
    // detach if too slow on the upper half (centrifugal < gravity pull-in)
    const need = LOOP_G * L.r * Math.max(0, -Math.sin(P.la));
    if (P.ls * P.ls < need && Math.sin(P.la) < -0.05) {
      P.mode = 'air'; P.grounded = false;
      P.vx = P.ldir * Math.sin(P.la) * P.ls; P.vy = -P.ldir * Math.cos(P.la) * P.ls;
      P.spin = true; P.loop = null;
    } else if ((P.ldir > 0 && P.la <= Math.PI / 2 - Math.PI * 2) || (P.ldir < 0 && P.la >= Math.PI / 2 + Math.PI * 2)) {
      P.x = L.cx; P.y = L.gy; P.g = P.ldir * P.ls; P.mode = 'ground'; P.grounded = true; P.loop = null;
      const s = surfaceAt(z, P.x); if (s) { P.y = s.y; P.ang = s.ang; }
      burst(P.x, P.y - 20, 10, '#ffe066');
      if (FX.loopFx) { FX.loopFx = false; sfx.star(); for (let gi = 0; gi < 8; gi++) particles.push({ x: P.x + (Math.random() - 0.5) * 30, y: P.y - 14 - Math.random() * 26, vx: (Math.random() - 0.5) * 60, vy: -30 - Math.random() * 70, life: 0.55 + Math.random() * 0.3, max: 0.85, color: '#ffd23e', size: 2.4, grav: -40, star: 1 }); }
    }
    return;
  }

  if (P.grounded) {
    P.coyote = 0.1;
    if (P.jumpBuf > 0) { P.jumpBuf = 0; doJump(); }
  } else {
    P.coyote = Math.max(0, P.coyote - dt);
    if (P.jumpBuf > 0 && P.coyote > 0) { P.jumpBuf = 0; P.grounded = true; doJump(); }
  }
  if (P.grounded) {
    const prevX = P.x;
    if (P.onPlat) {
      const pl = P.onPlat;
      let acc = 0; const ax = inputAxis();
      if (!P.rolling && ax !== 0) acc += ax * (Math.sign(ax) !== Math.sign(P.g) && P.g !== 0 ? BRAKE : ACC);
      P.g += acc * dt;
      if (!P.rolling && ax === 0) P.g = approach(P.g, 0, FRIC * dt);
      if (P.rolling) P.g = approach(P.g, 0, ROLLFRIC * dt);
      P.x += P.g * dt; P.facing = P.g >= 0 ? 1 : -1; if (P.g !== 0) P.facing = Math.sign(P.g);
      if (P.x < pl.x0 || P.x > pl.x1) {
        const s = surfaceAt(z, P.x);
        if (s && s.y <= pl.y + 6) { P.onPlat = null; P.y = s.y; P.ang = s.ang; }
        else { P.grounded = false; P.onPlat = null; P.mode = 'air'; P.vx = P.g; P.vy = 0; P.spin = P.rolling; P.rolling = false; }
      } else P.y = pl.y;
    } else {
      const s0 = surfaceAt(z, P.x);
      if (!s0) { P.grounded = false; P.mode = 'air'; P.vx = P.g; P.vy = 0; }
      else {
        P.ang = s0.ang;
        const ax = inputAxis();
        if (P.rolling && ax !== 0 && Math.sign(ax) !== Math.sign(P.g) && Math.abs(P.g) < 184) P.rolling = false;
        if (!P.rolling && downHeld() && Math.abs(P.g) > 43) { P.rolling = true; sfx.roll(); }
        let acc = Math.sin(P.ang) * G * (P.rolling ? 1.55 : 1.0);
        if (P.rolling) acc += -Math.sign(P.g) * ROLLFRIC;
        else if (ax !== 0) acc += ax * (Math.sign(ax) !== Math.sign(P.g) && P.g !== 0 ? BRAKE : ACC);
        P.g += acc * dt;
        if (!P.rolling && ax === 0 && Math.abs(Math.sin(P.ang)) < 0.045) P.g = approach(P.g, 0, FRIC * dt);
        if (Math.abs(P.g) > 503) P.g -= P.g * 0.22 * dt;
        if (P.g > MAXG) P.g = MAXG; if (P.g < -MAXG) P.g = -MAXG;
        if (P.g !== 0) P.facing = Math.sign(P.g);
        P.x += Math.cos(P.ang) * P.g * dt;
        const s2 = surfaceAt(z, P.x);
        if (!s2) { P.grounded = false; P.mode = 'air'; P.vx = Math.cos(P.ang) * P.g; P.vy = Math.sin(P.ang) * P.g; P.spin = P.rolling; }
        else { P.y = s2.y; P.ang = s2.ang; }
        if (P.rolling && Math.abs(P.g) < 34 && !downHeld()) P.rolling = false;
        // loop trigger (crossing the loop's bottom point at speed)
        if (P.grounded && state === 'play') {
          for (const L of z.loops) {
            if (P.g > LOOP_MIN && prevX < L.cx && P.x >= L.cx) enterLoop(L, 1);
            else if (P.g < -LOOP_MIN && prevX > L.cx && P.x <= L.cx) enterLoop(L, -1);
          }
        }
      }
    }
    if (P.grounded) P.runPhase += Math.abs(P.g) * dt * 0.055;
  } else if (P.mode === 'air') {
    P.vx += inputAxis() * AIRACC * dt; if (P.vx > 724) P.vx = 724; if (P.vx < -724) P.vx = -724;
    P.vy += G * dt; if (P.vy > 1500) P.vy = 1500;
    if (!keys.jump && !P.cut && P.vy < -330) { P.vy *= 0.45; P.cut = true; }
    const prevY = P.y;
    P.x += P.vx * dt; P.y += P.vy * dt;
    if (P.vx !== 0) P.facing = Math.sign(P.vx);
    if (P.vy >= 0) {
      // one-way platforms first
      let landed = false;
      for (const pl of z.plats) {
        if (P.x >= pl.x0 - 4 && P.x <= pl.x1 + 4 && prevY <= pl.y + 0.5 && P.y >= pl.y) { landOn(pl.y, 0, pl); landed = true; break; }
      }
      if (!landed) {
        const s = surfaceAt(z, P.x);
        if (s && prevY <= s.y + 0.5 && P.y >= s.y) landOn(s.y, s.ang, null);
      }
    } else {
      const s = surfaceAt(z, P.x);
      if (s && P.y < s.y - 2) { /* rising below terrain level: stay airborne */ }
    }
    if (P.y > z.killY) { pitFall(); return; }
  }

  // springs
  for (const sp of z.springs) {
    sp.anim = Math.max(0, sp.anim - dt * 4);
    if (Math.abs(P.x - sp.x) < 22 && Math.abs(P.y - sp.y) < 30 && P.vy >= -60) {
      P.grounded = false; P.onPlat = null; P.mode = 'air'; P.vy = -sp.pow; P.vx = Math.max(P.vx, P.g * 0.6, 173); P.spin = false; sp.anim = 1; sfx.spring(); FX.sq = -0.34; FX.airT = 0;
      burst(sp.x, sp.y - 6, 6, '#7CFC98');
    }
  }
  // checkpoint
  if (P.x > z.ckpt && P.respawnX < z.ckpt) { P.respawnX = z.ckpt; toast('✔'); }
  // beacon
  if (state === 'play' && P.x >= z.beacon) zoneClear();
}
function enterLoop(L, dir) {
  P.mode = 'loop'; P.loop = L; P.ldir = dir; P.la = Math.PI / 2; P.ls = Math.abs(P.g); P.rolling = true;
  FX.loopFx = true; sfx.roll();
}
function approach(v, target, stepAmt) { return v < target ? Math.min(v + stepAmt, target) : Math.max(v - stepAmt, target); }

function burst(x, y, n, color) { for (let i = 0; i < n; i++) { const a = Math.random() * Math.PI * 2, sp = 60 + Math.random() * 260; particles.push({ x, y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp - 60, life: 0.5 + Math.random() * 0.3, max: 0.8, color, size: 2 + Math.random() * 3, grav: 300 }); } }
function floatText(x, y, txt, color) { texts.push({ x, y, txt, color: color || '#ffe066', t: 0 }); }
function fxDust(x, y, n, col, spread, up) { for (let i = 0; i < n; i++) particles.push({ x: x + (Math.random() - 0.5) * 14, y: y - Math.random() * 3, vx: (Math.random() - 0.5) * (spread || 90), vy: -(Math.random() * (up || 46)), life: 0.34 + Math.random() * 0.3, max: 0.64, color: col, size: 2 + Math.random() * 2.6, grav: 130 }); }
const DUSTC = ['#e8dcc4', '#d9c9a3', '#cbb98e'];

function hurt() {
  if (P.invuln > 0 || state !== 'play') return;
  sfx.hurt(); shake = 7;
  if (coinsHeld > 0) {
    const n = Math.min(coinsHeld, 8); coinsHeld -= n;
    for (let i = 0; i < n; i++) { const a = -Math.PI / 2 + (i / Math.max(n - 1, 1) - 0.5) * 1.9; const sp = 260 + Math.random() * 160; dynCoins.push({ x: P.x, y: P.y - 20, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, life: 4.2, delay: 0.55, bounced: 0 }); }
    P.invuln = 1.6;
    P.grounded = false; P.onPlat = null; P.mode = 'air'; P.vx = -P.facing * 230; P.vy = -360; P.spin = false; P.rolling = false;
  } else {
    hearts--; P.invuln = 2;
    burst(P.x, P.y - 18, 14, '#ff5a5a');
    if (hearts <= 0) { gameOver(); return; }
    P.grounded = false; P.onPlat = null; P.mode = 'air'; P.vx = -P.facing * 230; P.vy = -380; P.spin = false; P.rolling = false;
  }
  hud();
}
function pitFall() {
  sfx.fall(); hearts--;
  if (hearts <= 0) { gameOver(); return; }
  coinsHeld = Math.max(0, coinsHeld - 5);
  P.x = P.respawnX; fxReset(); const s = surfaceAt(zone, P.x); P.y = s ? s.y : 430;
  P.vx = 0; P.vy = 0; P.g = 0; P.grounded = true; P.mode = 'ground'; P.onPlat = null; P.rolling = false; P.spin = false; P.invuln = 2;
  camX = Math.max(0, P.x - VIEWW * 0.35);
  hud();
}
function zoneClear() {
  if (state !== 'play') return;
  const bonus = Math.max(0, Math.round(zone.par - zoneTime)) * 15;
  bonusTotal += bonus; score += bonus;
  state = 'clear'; clearT = 2.3; sfx.beacon();
  showBanner(T('zoneClear') + (bonus > 0 ? '  +' + bonus + ' ' + T('timeBonus') : ''));
  for (let i = 0; i < 26; i++) particles.push({ x: zone.beacon + 20 + (Math.random() - 0.5) * 90, y: P.y - 60 - Math.random() * 120, vx: (Math.random() - 0.5) * 160, vy: -Math.random() * 220, life: 1 + Math.random() * 0.6, max: 1.6, color: ['#ffd23e', '#5ea0ff', '#ffffff', '#ff9d5c'][i % 4], size: 3 + Math.random() * 3, grav: 260 });
  hud();
}
function endRun(finishedGame) {
  state = finishedGame ? 'finish' : 'over';
  $('touch').classList.remove('on'); syncTouchUI(); $('langSel').classList.remove('hidden');
  $('endTitle').textContent = finishedGame ? T('finish') : T('over');
  $('endScore').textContent = score.toLocaleString();
  $('endStats').innerHTML = '🪙 <b>' + coinsHeld + '</b> ' + T('coinsWord') + ' · <span style="color:#5ea0ff">★</span> <b>' + starsHeld + '</b> ' + T('starsWord') + ' · ⏱ <b>' + fmtTime(runTime) + '</b>';
  $('endBonus').textContent = T('timeBonus') + ': +' + bonusTotal;
  $('submitStatus').textContent = '';
  $('submitBtn').disabled = false;
  prefillName();
  $('endScreen').classList.remove('hidden');
}
function gameOver() { endRun(false); }
function finishRun() { endRun(true); sfx.beacon(); }

function updateWorld(dt) {
  // enemies
  for (const e of zone.enemies) {
    if (e.dead) continue;
    e.t += dt;
    if (e.type === 'candle') { e.x = e.x0 + Math.sin(e.t * e.sp / Math.max(e.range, 1)) * e.range; }
    else { e.x = e.x0 + Math.sin(e.t * 0.55) * e.range; e.y = e.y0 + Math.sin(e.t * 1.8) * 12; }
    const fp = feetRenderPos();
    const pcx = fp.x, pcy = fp.y - 17;
    const ecx = e.x, ecy = (e.type === 'candle' ? e.y - 17 : e.y);
    const dx = pcx - ecx, dy = pcy - ecy;
    if (dx * dx + dy * dy < 33 * 33) {
      const smashing = P.spin || P.rolling || P.mode === 'loop' || (P.mode === 'air' && P.vy > 60 && P.y - 26 < ecy);
      if (smashing) {
        e.dead = true; score += 100; sfx.smash(); shake = Math.max(shake, 2.2); burst(ecx, ecy, 12, e.type === 'candle' ? '#ff6b5e' : '#9fc2ff');
        floatText(ecx, ecy - 26, '+100', '#fff');
        if (P.mode === 'air') P.vy = keys.jump ? -720 : -520;
        hud();
      } else hurt();
    }
  }
  // static pickups (cork coins follow the player's render height)
  const fp = feetRenderPos(); const pcx = fp.x, pcy = fp.y - 16;
  for (const c of zone.coins) {
    if (c.taken) continue;
    const dx = pcx - c.x, dy = pcy - c.y;
    if (dx * dx + dy * dy < 34 * 34) { c.taken = true; coinsHeld++; score += 10; coinChain++; chainT = 1.1; sfx.coin(coinChain); burst(c.x, c.y, 4, '#ffd23e'); hud(); }
  }
  for (const s of zone.stars) {
    if (s.taken) continue;
    const dx = pcx - s.x, dy = pcy - s.y;
    if (dx * dx + dy * dy < 38 * 38) { s.taken = true; starsHeld++; score += 50; sfx.star(); floatText(s.x, s.y - 20, '+50 USTC', '#7db4ff'); burst(s.x, s.y, 8, '#5ea0ff'); hud(); }
  }
  // scattered coins
  for (let i = dynCoins.length - 1; i >= 0; i--) {
    const c = dynCoins[i];
    c.life -= dt; c.delay -= dt;
    if (c.life <= 0) { dynCoins.splice(i, 1); continue; }
    c.vy += 1550 * dt; c.x += c.vx * dt; c.y += c.vy * dt;
    const s = surfaceAt(zone, c.x);
    if (s && c.y > s.y - 8) { c.y = s.y - 8; if (Math.abs(c.vy) > 130 && c.bounced < 2) { c.vy = -Math.abs(c.vy) * 0.52; c.vx *= 0.75; c.bounced++; } else { c.vy = 0; c.vx = approach(c.vx, 0, 500 * dt); } }
    if (c.delay <= 0) { const dx = pcx - c.x, dy = pcy - (c.y - 6); if (dx * dx + dy * dy < 32 * 32) { dynCoins.splice(i, 1); coinsHeld++; score += 10; sfx.coin(0); hud(); } }
  }
  // particles & texts
  for (let i = particles.length - 1; i >= 0; i--) { const p = particles[i]; p.life -= dt; if (p.life <= 0) { particles.splice(i, 1); continue; } p.vy += (p.grav || 0) * dt; p.x += p.vx * dt; p.y += p.vy * dt; }
  for (let i = texts.length - 1; i >= 0; i--) { const t = texts[i]; t.t += dt; t.y -= 42 * dt; if (t.t > 0.95) texts.splice(i, 1); }
  // speed streaks + ball motion streaks (stronger, speed-scaled)
  const spdNow = P.mode === 'loop' ? P.ls : P.grounded ? Math.abs(P.g) : Math.hypot(P.vx, P.vy);
  if (state === 'play' && spdNow > 500 && Math.random() < 0.75) {
    particles.push({ x: P.x - P.facing * 20, y: P.y - 14 - Math.random() * 20, vx: -P.facing * (340 + spdNow * 0.35), vy: 0, life: 0.26, max: 0.26, color: 'rgba(255,244,214,0.8)', size: 2.2, grav: 0 });
  }
  if (state === 'play' && (P.rolling || P.spin || P.mode === 'loop') && spdNow > 420 && Math.random() < 0.85) {
    particles.push({ x: P.x - P.facing * 16, y: P.y - 15 + (Math.random() - 0.5) * 16, vx: -P.facing * (200 + spdNow * 0.3), vy: (Math.random() - 0.5) * 40, life: 0.2, max: 0.2, color: 'rgba(255,190,90,0.65)', size: 3, grav: 0 });
  }
  // ---- feel-layer upkeep (visual only) ----
  FX.pvx = (P.x - FX.lastX) / Math.max(dt, 0.001); FX.pvy = (P.y - FX.lastY) / Math.max(dt, 0.001); FX.lastX = P.x; FX.lastY = P.y;
  if (!P.grounded && P.mode === 'air') FX.airT += dt; else FX.airT = 0;
  if (P.grounded && Math.abs(P.g) > 330 && Math.random() < 0.55) fxDust(P.x - Math.sign(P.g) * 8, P.y, 1, 'rgba(232,220,196,0.8)', 60, 26);
  if (P.grounded && FX.prevG && Math.sign(P.g) !== Math.sign(FX.prevG) && Math.abs(FX.prevG) > 260 && Math.abs(P.g) > 90) { FX.skidT = 0.22; shake = Math.max(shake, 1.6); fxDust(P.x, P.y, 6, '#efe3c2', 130, 44); }
  FX.skidT = Math.max(0, FX.skidT - dt);
  FX.prevG = P.g;
  { const ck = corkAt(zone, P.x); const inC = !!(ck && P.grounded && P.mode === 'ground');
    if (inC && !FX.corkIn) { FX.corkIn = true; FX.corkFx = true; sfx.roll(); }
    if (!inC && FX.corkIn) { FX.corkIn = false; if (FX.corkFx) { FX.corkFx = false; burst(P.x, P.y - 20, 9, '#ffe066'); } } }
  // wind cue: soft filtered noise that rises with speed (audio starts only after a user gesture)
  try {
    if (AC && !muted) {
      if (!FX.wind) { const len = AC.sampleRate; const buf = AC.createBuffer(1, len, AC.sampleRate); const d = buf.getChannelData(0); for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1; const srcN = AC.createBufferSource(); srcN.buffer = buf; srcN.loop = true; const flt = AC.createBiquadFilter(); flt.type = 'bandpass'; flt.frequency.value = 500; flt.Q.value = 0.7; const gn = AC.createGain(); gn.gain.value = 0; srcN.connect(flt); flt.connect(gn); gn.connect(AC.destination); srcN.start(); FX.wind = { gn, flt }; }
      const wf = Math.max(0, Math.min(1, (spdNow - 430) / 430));
      FX.wind.gn.gain.setTargetAtTime(state === 'play' ? wf * wf * 0.055 : 0, AC.currentTime, 0.09);
      FX.wind.flt.frequency.setTargetAtTime(420 + wf * 780, AC.currentTime, 0.09);
    }
  } catch (e) {}
  shake = Math.max(0, shake - dt * 16);
}

/* ---------------- HUD / banners ---------------- */
function fmtTime(s) { s = Math.max(0, Math.floor(s)); return Math.floor(s / 60) + ':' + String(s % 60).padStart(2, '0'); }
function hud() {
  $('hudCoins').textContent = coinsHeld; $('hudStars').textContent = starsHeld; $('hudScore').textContent = score.toLocaleString();
  $('hudHearts').textContent = '❤'.repeat(Math.max(hearts, 0)) + '🖤'.repeat(Math.max(3 - hearts, 0));
  $('hudTime').textContent = fmtTime(runTime);
}
let bannerTO = null, zbTO = null, toastTO = null;
function showBanner(txt) { const b = $('banner'); b.textContent = txt; b.classList.remove('hidden'); clearTimeout(bannerTO); bannerTO = setTimeout(() => b.classList.add('hidden'), 1700); }
function showZoneBanner(name, sub) { $('zbName').textContent = name; $('zbSub').textContent = sub; const z = $('zoneBanner'); z.classList.remove('hidden'); clearTimeout(zbTO); zbTO = setTimeout(() => z.classList.add('hidden'), 1500); }
function toast(msg) { const t = $('toast'); t.textContent = msg; t.style.opacity = 1; clearTimeout(toastTO); toastTO = setTimeout(() => t.style.opacity = 0, 900); }

/* ---------------- rendering ---------------- */
function hash(n) { const x = Math.sin(n * 127.1 + 311.7) * 43758.5453; return x - Math.floor(x); }
function rr(x, y, w, h, r) { ctx.beginPath(); ctx.moveTo(x + r, y); ctx.arcTo(x + w, y, x + w, y + h, r); ctx.arcTo(x + w, y + h, x, y + h, r); ctx.arcTo(x, y + h, x, y, r); ctx.arcTo(x, y, x + w, y, r); ctx.closePath(); }


/* ================= SKY (screen space) ================= */
function drawSky(theme, t, lag) {
  ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
  let g;
  if (theme === 0) { g = ctx.createLinearGradient(0, 0, 0, CH); g.addColorStop(0, '#1d7fd4'); g.addColorStop(0.45, '#3fa9e0'); g.addColorStop(0.75, '#8fd0e8'); g.addColorStop(1, '#d8f2e4'); }
  else if (theme === 1) { g = ctx.createLinearGradient(0, 0, 0, CH); g.addColorStop(0, '#2a1650'); g.addColorStop(0.4, '#7a2d6e'); g.addColorStop(0.68, '#d6573f'); g.addColorStop(0.86, '#ff9a3d'); g.addColorStop(1, '#ffc46b'); }
  else { g = ctx.createLinearGradient(0, 0, 0, CH); g.addColorStop(0, '#071a3d'); g.addColorStop(0.55, '#0d2c56'); g.addColorStop(1, '#17456e'); }
  ctx.fillStyle = g; ctx.fillRect(0, 0, CW, CH);
  if (theme === 2) { // stars (aurora night)
    ctx.fillStyle = '#ffffff';
    const nStars = theme === 2 ? 140 : 90;
    for (let i = 0; i < nStars; i++) { const sx = ((hash(i * 3.1) * 1600 - camX * 0.06) % (CW + 40) + CW + 40) % (CW + 40) - 20; const sy = hash(i * 7.7) * CH * 0.7; const tw = 0.35 + 0.65 * Math.abs(Math.sin(t * 1.4 + i)); ctx.globalAlpha = 0.75 * tw; const r = hash(i) > 0.85 ? 2 : 1.2; ctx.fillRect(sx, sy, r, r); }
    ctx.globalAlpha = 1;
  }
  if (theme === 0) { // tropical day: bold sun, cumulus clouds, gulls
    const sunX = CW * 0.80 - camX * 0.02 % 40, sunY = CH * 0.16;
    const sg = ctx.createRadialGradient(sunX, sunY, 8, sunX, sunY, 200); sg.addColorStop(0, 'rgba(255,236,160,0.85)'); sg.addColorStop(1, 'rgba(255,220,120,0)');
    ctx.fillStyle = sg; ctx.fillRect(sunX - 210, sunY - 210, 420, 420);
    ctx.fillStyle = '#fff3b0'; ctx.beginPath(); ctx.arc(sunX, sunY, 34, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#ffe27a'; ctx.beginPath(); ctx.arc(sunX, sunY, 27, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = 'rgba(255,255,255,0.92)';
    for (const [f, sp, sc] of [[0.05, 4, 1.3], [0.11, 7, 0.95], [0.19, 11, 0.65]]) {
      for (let i = 0; i < 5; i++) {
        const cxp = (((hash(i * 17.3 + f * 91) * 1500 + t * sp - camX * f) % (CW + 340)) + CW + 340) % (CW + 340) - 170;
        const cyp = 30 + hash(i * 5.1 + f * 57) * CH * 0.26;
        const w = (80 + hash(i * 3.7 + f) * 100) * sc;
        ctx.beginPath();
        ctx.ellipse(cxp, cyp, w, w * 0.21, 0, 0, Math.PI * 2);
        ctx.ellipse(cxp - w * 0.42, cyp + 4, w * 0.55, w * 0.16, 0, 0, Math.PI * 2);
        ctx.ellipse(cxp + w * 0.45, cyp + 3, w * 0.6, w * 0.17, 0, 0, Math.PI * 2);
        ctx.ellipse(cxp + w * 0.05, cyp - w * 0.12, w * 0.52, w * 0.16, 0, 0, Math.PI * 2);
        ctx.fill();
      }
    }
    ctx.strokeStyle = 'rgba(20,50,80,0.55)'; ctx.lineWidth = 2; ctx.lineCap = 'round';
    for (let i = 0; i < 5; i++) {
      const bx = (((t * 24 + i * 310 - camX * 0.08) % (CW + 120)) + CW + 120) % (CW + 120) - 60;
      const by = 60 + i * 26 + Math.sin(t * 1.7 + i * 2.1) * 7;
      const fl = Math.sin(t * 9 + i * 1.7) * 4.5, s = 6 + (i % 3) * 1.6;
      ctx.beginPath(); ctx.moveTo(bx - s, by - fl); ctx.quadraticCurveTo(bx - s * 0.3, by + 2.5, bx, by); ctx.quadraticCurveTo(bx + s * 0.3, by + 2.5, bx + s, by - fl); ctx.stroke();
    }
    ctx.lineCap = 'butt';
  }

  if (theme === 1) { // canyon dusk: huge low sun + warm dust bands
    const sunX = CW * 0.24 - camX * 0.02 % 40, sunY = CH * 0.52;
    const sg = ctx.createRadialGradient(sunX, sunY, 10, sunX, sunY, 260); sg.addColorStop(0, 'rgba(255,190,90,0.8)'); sg.addColorStop(1, 'rgba(255,150,60,0)');
    ctx.fillStyle = sg; ctx.fillRect(sunX - 270, sunY - 270, 540, 540);
    ctx.fillStyle = '#ffd98a'; ctx.beginPath(); ctx.arc(sunX, sunY, 52, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#ffedb8'; ctx.beginPath(); ctx.arc(sunX, sunY, 42, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = 'rgba(255,170,90,0.16)';
    for (let i = 0; i < 4; i++) {
      const cxp = (((hash(i * 23.7) * 1400 + t * 5 - camX * 0.07) % (CW + 420)) + CW + 420) % (CW + 420) - 210;
      const cyp = 44 + hash(i * 9.3) * CH * 0.22;
      ctx.beginPath(); ctx.ellipse(cxp, cyp, 200, 14, 0, 0, Math.PI * 2); ctx.ellipse(cxp + 90, cyp + 7, 130, 10, 0, 0, Math.PI * 2); ctx.fill();
    }
  }

  if (theme === 2) { // aurora night: curtains of light + moon + shooting stars
    for (let b = 0; b < 3; b++) {
      const baseY = CH * (0.10 + b * 0.09), amp = 26 + b * 12, hue = ['rgba(64,255,170,', 'rgba(64,200,255,', 'rgba(170,110,255,'][b];
      ctx.beginPath(); ctx.moveTo(-20, baseY);
      for (let xx = -20; xx <= CW + 20; xx += 26) ctx.lineTo(xx, baseY + Math.sin(xx * 0.006 + t * (0.5 + b * 0.17) + b * 2.2) * amp + Math.sin(xx * 0.017 - t * 0.3) * 8);
      for (let xx = CW + 20; xx >= -20; xx -= 26) ctx.lineTo(xx, baseY + 64 + b * 16 + Math.sin(xx * 0.006 + t * (0.5 + b * 0.17) + b * 2.2) * amp);
      ctx.closePath();
      const ag = ctx.createLinearGradient(0, baseY - 40, 0, baseY + 90); ag.addColorStop(0, hue + (0.20 - b * 0.045) + ')'); ag.addColorStop(1, hue + '0)');
      ctx.fillStyle = ag; ctx.fill();
    }
    const mx = CW * 0.82, my = CH * 0.15;
    const mg2 = ctx.createRadialGradient(mx, my, 8, mx, my, 130); mg2.addColorStop(0, 'rgba(230,245,255,0.5)'); mg2.addColorStop(1, 'rgba(230,245,255,0)');
    ctx.fillStyle = mg2; ctx.fillRect(mx - 140, my - 140, 280, 280);
    ctx.fillStyle = '#eef6ff'; ctx.beginPath(); ctx.arc(mx, my, 23, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = 'rgba(170,190,215,0.5)'; ctx.beginPath(); ctx.arc(mx - 7, my + 4, 4.4, 0, Math.PI * 2); ctx.arc(mx + 8, my - 6, 3.3, 0, Math.PI * 2); ctx.fill();
    const cyc = t % 9;
    if (cyc < 0.85) {
      const pr = cyc / 0.85, sx = CW * (0.12 + 0.5 * pr), sy = CH * (0.06 + 0.18 * pr);
      const grd = ctx.createLinearGradient(sx, sy, sx - 74, sy - 30); grd.addColorStop(0, 'rgba(255,255,255,0.9)'); grd.addColorStop(1, 'rgba(255,255,255,0)');
      ctx.strokeStyle = grd; ctx.lineWidth = 2.2; ctx.beginPath(); ctx.moveTo(sx, sy); ctx.lineTo(sx - 74, sy - 30); ctx.stroke();
      ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.arc(sx, sy, 2, 0, Math.PI * 2); ctx.fill();
    }
  }
}

/* ================= MID PARALLAX LAYER ================= */
function drawSilhouettes(theme, t) {
  if (theme === 0) {
    // far island ridge + palm silhouettes
    ctx.fillStyle = 'rgba(38,110,120,0.55)';
    ctx.beginPath(); ctx.moveTo(camX - 60, 620);
    for (let x = camX - 60; x < camX + VIEWW + 60; x += 30) { const wx = x + camX * 0.72; const y = 470 - Math.sin(wx * 0.0032) * 46 - Math.sin(wx * 0.010) * 16; ctx.lineTo(x, y); }
    ctx.lineTo(camX + VIEWW + 60, 620); ctx.closePath(); ctx.fill();
    for (let i = Math.floor((camX * 0.28) / 150) - 1; i < Math.floor((camX * 0.28) / 150) + Math.ceil(VIEWW / 150) + 3; i++) {
      if (hash(i * 3.3) < 0.5) continue;
      const px = i * 150 - camX * 0.28 + camX;
      const py = 470 - Math.sin((px + camX * 0.72) * 0.0032) * 46 - Math.sin((px + camX * 0.72) * 0.010) * 16;
      const ph2 = 30 + hash(i * 7.1) * 20;
      ctx.strokeStyle = 'rgba(24,84,80,0.9)'; ctx.lineWidth = 4; ctx.beginPath(); ctx.moveTo(px, py); ctx.quadraticCurveTo(px + 3, py - ph2 * 0.6, px + 1, py - ph2); ctx.stroke();
      ctx.strokeStyle = 'rgba(24,84,80,0.75)'; ctx.lineWidth = 3;
      for (let f = 0; f < 5; f++) { const a = -0.5 + f * 0.42; ctx.beginPath(); ctx.moveTo(px + 1, py - ph2); ctx.quadraticCurveTo(px + 1 + Math.cos(a) * 13, py - ph2 - 5 - Math.sin(a) * 4, px + 1 + Math.cos(a) * 21, py - ph2 + 5 + Math.abs(Math.cos(a)) * 3); ctx.stroke(); }
    }
    // turquoise lagoon band with sun glints
    const lg2 = ctx.createLinearGradient(0, 500, 0, 640); lg2.addColorStop(0, 'rgba(64,200,205,0.5)'); lg2.addColorStop(1, 'rgba(24,120,160,0.6)');
    ctx.fillStyle = lg2; ctx.fillRect(camX - 60, 512, VIEWW + 120, 300);
    ctx.fillStyle = '#fff6cf';
    for (let i = 0; i < 30; i++) {
      const gx = camX + hash(i * 13.7) * VIEWW, gy = 520 + hash(i * 7.9) * 120;
      ctx.globalAlpha = 0.14 + 0.5 * Math.abs(Math.sin(t * 2.2 + i * 1.93));
      ctx.fillRect(gx, gy, 5 + hash(i) * 9, 1.6);
    }
    ctx.globalAlpha = 1;
    // near headland
    ctx.fillStyle = 'rgba(30,96,74,0.9)';
    ctx.beginPath(); ctx.moveTo(camX - 60, 620);
    for (let x = camX - 60; x < camX + VIEWW + 60; x += 30) { const wx = x + camX * 0.55; const y = 492 - Math.sin(wx * 0.004) * 50 - Math.sin(wx * 0.013) * 18; ctx.lineTo(x, y); }
    ctx.lineTo(camX + VIEWW + 60, 620); ctx.closePath(); ctx.fill();
  } else if (theme === 1) {
    // layered mesas + buttes (stepped flat tops) in sunset tones
    for (const [f, col, hBase] of [[0.30, 'rgba(122,52,80,0.55)', 190], [0.52, 'rgba(146,62,54,0.8)', 270], [0.74, 'rgba(112,44,40,0.95)', 360]]) {
      const bw = 300;
      const startI = Math.floor((camX * f) / bw) - 1, endI = startI + Math.ceil(VIEWW / bw) + 3;
      for (let i = startI; i < endI; i++) {
        const bx = i * bw - camX * f + camX, bh = hBase + hash(i * 1.7 + f * 40) * 110;
        const top = 560 - bh, tw = bw * (0.42 + hash(i * 3.1) * 0.2);
        ctx.fillStyle = col;
        ctx.beginPath(); ctx.moveTo(bx, 620); ctx.lineTo(bx + (bw - tw) * 0.3, top + 26); ctx.lineTo(bx + (bw - tw) * 0.3 + 8, top); ctx.lineTo(bx + (bw - tw) * 0.3 + tw - 8, top); ctx.lineTo(bx + (bw - tw) * 0.3 + tw, top + 26); ctx.lineTo(bx + bw, 620); ctx.closePath(); ctx.fill();
        ctx.fillStyle = 'rgba(255,190,110,0.20)'; ctx.fillRect(bx + (bw - tw) * 0.3 + 8, top, tw - 16, 7);
        ctx.fillStyle = 'rgba(0,0,0,0.14)'; ctx.fillRect(bx + (bw - tw) * 0.3 + 20, top + 44, tw - 40, 6); ctx.fillRect(bx + (bw - tw) * 0.3 + 12, top + 88, tw - 24, 6);
      }
    }
    // distant birds over the canyon
    ctx.strokeStyle = 'rgba(40,14,30,0.55)'; ctx.lineWidth = 2; ctx.lineCap = 'round';
    for (let i = 0; i < 4; i++) {
      const bx = camX + (((t * 15 + i * 380) % (VIEWW + 120)) + VIEWW + 120) % (VIEWW + 120) - 60;
      const by = 90 + i * 34 + Math.sin(t * 1.6 + i * 2.3) * 6;
      const fl = Math.sin(t * 8 + i * 1.9) * 4, s = 5.4 + (i % 3) * 1.4;
      ctx.beginPath(); ctx.moveTo(bx - s, by - fl); ctx.quadraticCurveTo(bx - s * 0.3, by + 2.2, bx, by); ctx.quadraticCurveTo(bx + s * 0.3, by + 2.2, bx + s, by - fl); ctx.stroke();
    }
    ctx.lineCap = 'butt';
    // glowing canyon signs (world space, LUNC/USTC branding kept)
    const signs = [[1050, 268, 'LUNC', '#ffd23e'], [2280, 283, 'USTC', '#5ea0ff'], [3350, 300, 'CANYON', '#ffb03a'], [4700, 258, 'DUST DEVIL', '#ff9d5c'], [6000, 330, 'LUNA CLASSIC', '#ffd23e'], [8150, 296, 'MESAS', '#ff7ad9'], [12150, 300, 'RED ROCK', '#7CFC98'], [13450, 322, 'LUNC RUSH', '#ffd23e']];
    ctx.textAlign = 'center'; ctx.font = '900 21px Arial';
    for (const [sx, sy, txt, col] of signs) { if (sx < camX - 200 || sx > camX + VIEWW + 200) continue; ctx.shadowColor = col; ctx.shadowBlur = 14; ctx.fillStyle = col; ctx.fillText(txt, sx, sy); ctx.shadowBlur = 0; }
  } else {
    // snow pine forest layers under the aurora
    for (const [f, col, base, ph3] of [[0.30, 'rgba(16,44,74,0.65)', 520, 44], [0.52, 'rgba(12,34,60,0.85)', 545, 58], [0.72, 'rgba(8,24,46,0.95)', 575, 74]]) {
      ctx.fillStyle = col;
      ctx.beginPath(); ctx.moveTo(camX - 60, 640);
      for (let x = camX - 60; x < camX + VIEWW + 60; x += 30) { const wx = x + camX * (1 - f) * 0.6; const y = base - Math.sin(wx * 0.0038) * 30 - Math.sin(wx * 0.012) * 12; ctx.lineTo(x, y); }
      ctx.lineTo(camX + VIEWW + 60, 640); ctx.closePath(); ctx.fill();
      for (let i = Math.floor((camX * f) / 92) - 1; i < Math.floor((camX * f) / 92) + Math.ceil(VIEWW / 92) + 3; i++) {
        if (hash(i * 4.7 + f * 31) < 0.34) continue;
        const px = i * 92 - camX * f + camX;
        const py = base - Math.sin((px + camX * (1 - f) * 0.6) * 0.0038) * 30 - Math.sin((px + camX * (1 - f) * 0.6) * 0.012) * 12 + 8;
        const hh = ph3 * (0.7 + hash(i * 9.1) * 0.6);
        ctx.beginPath(); ctx.moveTo(px, py - hh); ctx.lineTo(px + hh * 0.30, py - hh * 0.35); ctx.lineTo(px + hh * 0.15, py - hh * 0.35); ctx.lineTo(px + hh * 0.36, py); ctx.lineTo(px - hh * 0.36, py); ctx.lineTo(px - hh * 0.15, py - hh * 0.35); ctx.lineTo(px - hh * 0.30, py - hh * 0.35); ctx.closePath(); ctx.fill();
        ctx.fillStyle = 'rgba(230,244,255,0.5)';
        ctx.beginPath(); ctx.moveTo(px, py - hh); ctx.lineTo(px + hh * 0.13, py - hh * 0.68); ctx.lineTo(px - hh * 0.13, py - hh * 0.68); ctx.closePath(); ctx.fill();
        ctx.fillStyle = col;
      }
    }
  }
}

/* ================= TERRAIN + SURFACE TREATMENTS ================= */
function surfacePath(x0, x1, step, dy) {
  ctx.beginPath(); let pen = false;
  for (let x = x0; x <= x1; x += step) { const s = surfaceAt(zone, x); if (!s) { pen = false; continue; } if (!pen) { ctx.moveTo(x, s.y + (dy || 0)); pen = true; } else ctx.lineTo(x, s.y + (dy || 0)); }
}
function drawTerrain(theme, t) {
  const x0 = camX - 70, x1 = camX + VIEWW + 70;
  // ground body
  ctx.beginPath();
  let pen = false;
  for (let x = x0; x <= x1; x += 12) { const s = surfaceAt(zone, x); if (!s) { pen = false; continue; } if (!pen) { ctx.moveTo(x, s.y); pen = true; } else ctx.lineTo(x, s.y); }
  ctx.lineTo(x1, 2600); ctx.lineTo(x0, 2600); ctx.closePath();
  const g = ctx.createLinearGradient(0, 240, 0, 640);
  if (theme === 0) { g.addColorStop(0, '#c98d45'); g.addColorStop(0.12, '#a06a32'); g.addColorStop(1, '#5d3a1c'); }
  else if (theme === 1) { g.addColorStop(0, '#c4553a'); g.addColorStop(0.1, '#9c3d2b'); g.addColorStop(1, '#57241f'); }
  else { g.addColorStop(0, '#cfe0f2'); g.addColorStop(0.1, '#93b4d8'); g.addColorStop(1, '#3d5a80'); }
  ctx.fillStyle = g; ctx.fill();
  // underground strata (tall portrait views read as a cross-section, not void)
  ctx.save(); ctx.clip();
  ctx.fillStyle = 'rgba(0,0,0,0.16)';
  for (let y = 580; y < 2600; y += 120) ctx.fillRect(x0, y, x1 - x0, 10);
  ctx.fillStyle = 'rgba(255,255,255,0.05)';
  for (let x = Math.floor(x0 / 130) * 130; x < x1; x += 130) for (let y = 640; y < 1500; y += 170) { if (hash(x * 0.37 + y) > 0.45) ctx.fillRect(x + hash(y) * 50, y, 16, 7); }
  if (theme === 0) { // buried pebbles & roots in the cliff face
    ctx.fillStyle = 'rgba(0,0,0,0.20)';
    for (let x = Math.floor(x0 / 74) * 74; x < x1; x += 74) { const s = surfaceAt(zone, x); if (s && hash(x * 0.61) > 0.4) { ctx.beginPath(); ctx.ellipse(x + hash(x) * 30, s.y + 26 + hash(x * 1.3) * 46, 6 + hash(x * 2.1) * 7, 4, 0, 0, Math.PI * 2); ctx.fill(); } }
    ctx.strokeStyle = 'rgba(30,18,8,0.35)'; ctx.lineWidth = 2;
    for (let x = Math.floor(x0 / 210) * 210; x < x1; x += 210) { const s = surfaceAt(zone, x); if (s && hash(x * 0.43) > 0.5) { ctx.beginPath(); ctx.moveTo(x, s.y + 4); ctx.quadraticCurveTo(x + 8, s.y + 30, x - 4, s.y + 52); ctx.stroke(); } }
  }
  ctx.restore();
  if (theme === 0) { // grass RUNWAY: vivid green band + checker-mow stripes + sand speckles
    surfacePath(x0, x1, 10, 5); ctx.strokeStyle = 'rgba(64,170,80,0.85)'; ctx.lineWidth = 9; ctx.stroke();
    surfacePath(x0, x1, 10, 3); ctx.strokeStyle = 'rgba(110,205,105,0.7)'; ctx.lineWidth = 4; ctx.stroke();
    ctx.fillStyle = 'rgba(255,255,255,0.10)';
    for (let x = Math.floor(x0 / 64) * 64; x < x1; x += 128) { const s = surfaceAt(zone, x + 32); if (s) { ctx.save(); ctx.translate(x + 32, s.y + 4); ctx.rotate(s.ang); ctx.fillRect(-32, -3.4, 64, 6.8); ctx.restore(); } }
    ctx.fillStyle = 'rgba(70,44,20,0.5)';
    for (let x = Math.floor(x0 / 26) * 26; x < x1; x += 26) { const s = surfaceAt(zone, x); if (s && hash(x * 0.77) > 0.35) ctx.fillRect(x + hash(x * 1.9) * 14, s.y + 6 + hash(x * 2.7) * 9, 3.4, 2.2); }
    ctx.fillStyle = 'rgba(150,128,104,0.85)';
    for (let x = Math.floor(x0 / 130) * 130 + 40; x < x1; x += 130) { const s = surfaceAt(zone, x); if (s) { ctx.beginPath(); ctx.ellipse(x, s.y + 4, 6.5, 3.4, 0, 0, Math.PI * 2); ctx.fill(); ctx.fillStyle = 'rgba(110,94,76,0.85)'; ctx.beginPath(); ctx.ellipse(x + 11, s.y + 5, 4.4, 2.6, 0, 0, Math.PI * 2); ctx.fill(); ctx.fillStyle = 'rgba(150,128,104,0.85)'; } }
  } else if (theme === 1) { // red-rock TRAIL: packed dust band + speckles + embedded stones
    surfacePath(x0, x1, 10, 5); ctx.strokeStyle = 'rgba(226,120,70,0.8)'; ctx.lineWidth = 9; ctx.stroke();
    surfacePath(x0, x1, 10, 3); ctx.strokeStyle = 'rgba(255,170,105,0.65)'; ctx.lineWidth = 4; ctx.stroke();
    ctx.fillStyle = 'rgba(90,30,20,0.4)';
    for (let x = Math.floor(x0 / 26) * 26; x < x1; x += 26) { const s = surfaceAt(zone, x); if (s && hash(x * 0.77) > 0.4) ctx.fillRect(x + hash(x * 1.9) * 14, s.y + 6 + hash(x * 2.7) * 9, 3.4, 2.2); }
    ctx.fillStyle = 'rgba(214,150,105,0.9)';
    for (let x = Math.floor(x0 / 610) * 610 + 260; x < x1; x += 610) { const s = surfaceAt(zone, x); if (s) { ctx.beginPath(); ctx.ellipse(x, s.y + 15, 11, 3.8, 0, 0, Math.PI * 2); ctx.fill(); } }
  } else { // snowpack TRACK: sparkle glints + icy patches at springs & span ends
    ctx.fillStyle = 'rgba(255,255,255,0.85)';
    for (let i = 0; i < 26; i++) { const gx = x0 + hash(i * 17.7 + Math.floor(x0 / 90)) * (x1 - x0); const s = surfaceAt(zone, gx); if (s && hash(i * 3.3) > 0.3) { ctx.globalAlpha = 0.3 + 0.6 * Math.abs(Math.sin(t * 2.6 + i * 2.1)); ctx.fillRect(gx, s.y + 3 + hash(i) * 8, 3.6, 1.6); } }
    ctx.globalAlpha = 1;
    ctx.fillStyle = 'rgba(140,200,240,0.35)';
    const hz = [];
    for (const sp of zone.springs) hz.push(sp.x);
    for (const sp2 of zone.spans) { hz.push(sp2.x0); hz.push(sp2.x1); }
    for (const hx of hz) { if (hx < x0 || hx > x1) continue; const s = surfaceAt(zone, hx); if (!s) continue; ctx.beginPath(); ctx.ellipse(hx, s.y + 5, 26, 3.4, 0, 0, Math.PI * 2); ctx.fill(); }
  }
  // surface strip
  surfacePath(x0, x1, 10, 0);
  ctx.strokeStyle = theme === 0 ? '#7ed957' : theme === 1 ? '#ffb03a' : '#ffffff'; ctx.lineWidth = 5; ctx.stroke();
  ctx.strokeStyle = theme === 0 ? 'rgba(255,230,160,0.8)' : 'rgba(255,255,255,0.35)'; ctx.lineWidth = 2; ctx.stroke();
  // rivets / panel marks on station + city
  if (theme === 1) { ctx.fillStyle = 'rgba(60,20,14,0.35)'; for (let x = Math.floor(x0 / 90) * 90; x < x1; x += 90) { const s = surfaceAt(zone, x); if (s) ctx.fillRect(x, s.y + 14, 4, 4); } }
  // platforms + themed props
  for (const pl of zone.plats) {
    if (pl.x1 < x0 || pl.x0 > x1) continue;
    if (theme === 0) {
      ctx.fillStyle = '#8a5a2b'; ctx.fillRect(pl.x0, pl.y, pl.x1 - pl.x0, 14); ctx.fillStyle = '#57b24a'; ctx.fillRect(pl.x0, pl.y, pl.x1 - pl.x0, 6); ctx.fillStyle = 'rgba(0,0,0,0.3)'; for (let x = pl.x0 + 30; x < pl.x1; x += 60) ctx.fillRect(x, pl.y + 14, 7, 44);
      // palm sprouting from the deck + hanging coconut lantern
      const px2 = pl.x0 + 26;
      ctx.strokeStyle = '#6e4525'; ctx.lineWidth = 5; ctx.beginPath(); ctx.moveTo(px2, pl.y + 12); ctx.quadraticCurveTo(px2 + 4, pl.y - 16, px2 + 10, pl.y - 34); ctx.stroke();
      ctx.strokeStyle = '#2e8b47'; ctx.lineWidth = 3.4;
      for (let f = 0; f < 6; f++) { const a = -0.25 - f * 0.4; ctx.beginPath(); ctx.moveTo(px2 + 10, pl.y - 34); ctx.quadraticCurveTo(px2 + 10 + Math.cos(a) * 16, pl.y - 40 - Math.sin(a) * 5, px2 + 10 + Math.cos(a) * 27, pl.y - 30 + Math.abs(Math.cos(a)) * 7); ctx.stroke(); }
      ctx.fillStyle = '#5d4020'; ctx.beginPath(); ctx.arc(px2 + 6, pl.y - 30, 3.6, 0, Math.PI * 2); ctx.arc(px2 + 14, pl.y - 29, 3.2, 0, Math.PI * 2); ctx.fill();
      const lx = pl.x0 + 110;
      ctx.strokeStyle = 'rgba(40,24,10,0.8)'; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(lx, pl.y + 14); ctx.lineTo(lx, pl.y + 30); ctx.stroke();
      const lg = ctx.createRadialGradient(lx, pl.y + 38, 2, lx, pl.y + 38, 30); lg.addColorStop(0, 'rgba(255,196,92,0.5)'); lg.addColorStop(1, 'rgba(255,196,92,0)');
      ctx.fillStyle = lg; ctx.fillRect(lx - 32, pl.y + 6, 64, 64);
      ctx.fillStyle = '#ffca5f'; ctx.fillRect(lx - 3.4, pl.y + 31, 6.8, 9); ctx.fillStyle = '#5d3d24'; ctx.fillRect(lx - 4.6, pl.y + 29, 9.2, 2.6);
      // flower lip on the platform top
      for (let x = pl.x0 + 20; x < pl.x1 - 8; x += 46) { if (hash(x * 0.9) > 0.35) { ctx.fillStyle = ['#ff9ecb', '#ffd23e', '#ff7a59'][Math.floor(hash(x) * 3) % 3]; ctx.beginPath(); ctx.arc(x, pl.y - 2, 2.8, 0, Math.PI * 2); ctx.fill(); } }
    }
    else if (theme === 1) {
      ctx.fillStyle = '#a34a30'; ctx.fillRect(pl.x0, pl.y, pl.x1 - pl.x0, 16); ctx.fillStyle = '#e88a4d'; ctx.fillRect(pl.x0, pl.y, pl.x1 - pl.x0, 5); ctx.fillStyle = 'rgba(70,24,16,0.5)'; ctx.fillRect(pl.x0, pl.y + 9, pl.x1 - pl.x0, 3);
      // cactus perched on the ledge + bleached bones
      const cx3 = pl.x0 + 70;
      ctx.fillStyle = '#2e8b57';
      rr(cx3 - 4, pl.y - 26, 8, 26, 4); ctx.fill();
      rr(cx3 - 14, pl.y - 20, 6, 13, 3); ctx.fill(); ctx.fillRect(cx3 - 14, pl.y - 9, 11, 5);
      rr(cx3 + 8, pl.y - 17, 6, 10, 3); ctx.fill(); ctx.fillRect(cx3 + 3, pl.y - 9, 11, 5);
      ctx.fillStyle = '#ff9ecb'; ctx.beginPath(); ctx.arc(cx3, pl.y - 28, 3, 0, Math.PI * 2); ctx.fill();
      ctx.strokeStyle = 'rgba(240,230,205,0.85)'; ctx.lineWidth = 2.6; ctx.beginPath(); ctx.arc(pl.x1 - 60, pl.y - 4, 10, Math.PI * 1.05, Math.PI * 1.95); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(pl.x1 - 78, pl.y - 2); ctx.lineTo(pl.x1 - 44, pl.y - 2); ctx.stroke();
    }
    else {
      ctx.fillStyle = '#7d9cc4'; ctx.fillRect(pl.x0, pl.y, pl.x1 - pl.x0, 13); ctx.fillStyle = '#ffffff'; ctx.fillRect(pl.x0, pl.y, pl.x1 - pl.x0, 5); ctx.fillStyle = 'rgba(255,255,255,0.35)'; for (let x = pl.x0 + 22; x < pl.x1; x += 52) ctx.fillRect(x, pl.y + 8, 5, 3);
      // icicles under the shelf + a snowman lookout
      ctx.fillStyle = 'rgba(200,230,250,0.85)';
      for (let x = pl.x0 + 14; x < pl.x1 - 6; x += 34) { const il = 7 + hash(x * 1.3) * 9; ctx.beginPath(); ctx.moveTo(x, pl.y + 13); ctx.lineTo(x + 3.4, pl.y + 13 + il); ctx.lineTo(x + 6.8, pl.y + 13); ctx.closePath(); ctx.fill(); }
      const sx2 = pl.x0 + 60;
      ctx.fillStyle = '#f6fbff'; ctx.beginPath(); ctx.arc(sx2, pl.y - 6, 7, 0, Math.PI * 2); ctx.fill(); ctx.beginPath(); ctx.arc(sx2, pl.y - 16.5, 5, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = '#ff8c3a'; ctx.beginPath(); ctx.moveTo(sx2 + 4, pl.y - 16.5); ctx.lineTo(sx2 + 10, pl.y - 15.2); ctx.lineTo(sx2 + 4, pl.y - 14.6); ctx.closePath(); ctx.fill();
      ctx.fillStyle = '#22303f'; ctx.beginPath(); ctx.arc(sx2 + 1.8, pl.y - 17.6, 0.9, 0, Math.PI * 2); ctx.arc(sx2 - 1.8, pl.y - 17.6, 0.9, 0, Math.PI * 2); ctx.fill();
      const bl = 0.3 + 0.7 * Math.abs(Math.sin(t * 3 + pl.x0 * 0.5));
      ctx.fillStyle = `rgba(120,255,190,${bl})`; ctx.beginPath(); ctx.arc(pl.x0 + 12, pl.y - 3, 2.8, 0, Math.PI * 2); ctx.fill();
    }
  }
  // checkpoint flag
  const ck = zone.ckpt; const cs = surfaceAt(zone, ck);
  if (cs && ck > camX - 80 && ck < camX + VIEWW + 80) {
    ctx.strokeStyle = '#cfd8ff'; ctx.lineWidth = 3; ctx.beginPath(); ctx.moveTo(ck, cs.y); ctx.lineTo(ck, cs.y - 64); ctx.stroke();
    ctx.fillStyle = P.respawnX >= ck ? '#39d353' : '#5a6c96'; ctx.beginPath(); ctx.moveTo(ck, cs.y - 64); ctx.lineTo(ck + 26, cs.y - 54); ctx.lineTo(ck, cs.y - 44); ctx.closePath(); ctx.fill();
  }
  // beacon
  const bx = zone.beacon, bs = surfaceAt(zone, bx);
  if (bs && bx > camX - 120 && bx < camX + VIEWW + 120) {
    const pulse = 0.75 + 0.25 * Math.sin(titleT * 4);
    ctx.fillStyle = '#3a2c10'; ctx.fillRect(bx - 5, bs.y - 108, 10, 108);
    const bg = ctx.createRadialGradient(bx, bs.y - 124, 4, bx, bs.y - 124, 44 * pulse); bg.addColorStop(0, 'rgba(255,220,90,0.95)'); bg.addColorStop(1, 'rgba(255,220,90,0)');
    ctx.fillStyle = bg; ctx.beginPath(); ctx.arc(bx, bs.y - 124, 44 * pulse, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#ffd23e'; ctx.beginPath(); ctx.arc(bx, bs.y - 124, 13, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#fff3b0'; ctx.beginPath(); ctx.arc(bx, bs.y - 124, 6, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = 'rgba(0,0,0,0.55)'; ctx.fillRect(bx - 34, bs.y - 168, 68, 22);
    ctx.fillStyle = '#ffd23e'; ctx.font = '900 14px Arial'; ctx.textAlign = 'center'; ctx.fillText('GOAL', bx, bs.y - 152);
  }
}

/* ================= GROUND DECOR (trees, signs, lamps, fences, rails) ================= */
function decorBlocked(x) {
  for (const L of zone.loops) if (x > L.cx - L.r - 46 && x < L.cx + L.r + 46) return true;
  for (const C of zone.corks) if (x > C.x0 - 50 && x < C.x1 + 50) return true;
  for (const sp of zone.springs) if (Math.abs(x - sp.x) < 56) return true;
  if (Math.abs(x - zone.beacon) < 110 || Math.abs(x - zone.ckpt) < 60) return true;
  return false;
}
function drawPalm(x, y, s, t) {
  const sway = Math.sin(t * 0.9 + x * 0.05) * 0.03;
  ctx.save(); ctx.translate(x, y); ctx.rotate(sway); ctx.scale(s, s);
  ctx.strokeStyle = '#7a4a26'; ctx.lineWidth = 5.4; ctx.beginPath(); ctx.moveTo(0, 0); ctx.quadraticCurveTo(4, -22, 9, -40); ctx.stroke();
  ctx.strokeStyle = 'rgba(50,28,10,0.5)'; ctx.lineWidth = 1.6;
  for (const ry of [-9, -19, -29]) { ctx.beginPath(); ctx.moveTo(1 + (ry + 40) * 0.2, ry); ctx.lineTo(6 + (ry + 40) * 0.2, ry - 1.6); ctx.stroke(); }
  ctx.strokeStyle = '#2e8b47'; ctx.lineWidth = 3.6;
  for (let f = 0; f < 6; f++) { const a = -0.2 - f * 0.42; ctx.beginPath(); ctx.moveTo(9, -40); ctx.quadraticCurveTo(9 + Math.cos(a) * 15, -46 - Math.sin(a) * 4, 9 + Math.cos(a) * 25, -36 + Math.abs(Math.cos(a)) * 6); ctx.stroke(); }
  ctx.fillStyle = '#5d4020'; ctx.beginPath(); ctx.arc(5.5, -37, 3.8, 0, Math.PI * 2); ctx.arc(12.5, -36, 3.3, 0, Math.PI * 2); ctx.fill();
  ctx.restore();
}
function drawHibiscus(x, y, s, t) {
  const sway = Math.sin(t * 0.8 + x * 0.04) * 0.022;
  ctx.save(); ctx.translate(x, y); ctx.rotate(sway); ctx.scale(s, s);
  ctx.fillStyle = '#1e6b34';
  for (const [cx2, cy2, r] of [[0, -16, 13], [-11, -10, 9.5], [11, -11, 10], [-4, -23, 9], [7, -24, 8]]) { ctx.beginPath(); ctx.arc(cx2, cy2, r, 0, Math.PI * 2); ctx.fill(); }
  ctx.fillStyle = 'rgba(120,220,130,0.55)';
  for (const [cx2, cy2, r] of [[-4, -19, 7], [8, -16, 5.4], [-11, -13, 4.6]]) { ctx.beginPath(); ctx.arc(cx2, cy2, r, 0, Math.PI * 2); ctx.fill(); }
  for (let i = 0; i < 5; i++) { const a = hash(x + i * 7) * 6.28, fx = Math.cos(a) * 10, fy = -17 + Math.sin(a) * 7; ctx.fillStyle = ['#ff5f8f', '#ff8c42', '#ffd23e'][i % 3]; for (let pt = 0; pt < 5; pt++) { const pa = pt / 5 * Math.PI * 2; ctx.beginPath(); ctx.arc(fx + Math.cos(pa) * 2.2, fy + Math.sin(pa) * 2.2, 1.9, 0, Math.PI * 2); ctx.fill(); } ctx.fillStyle = '#fff3b0'; ctx.beginPath(); ctx.arc(fx, fy, 1.1, 0, Math.PI * 2); ctx.fill(); }
  ctx.restore();
}
function drawWoodSign(x, y, lines, accent) {
  ctx.fillStyle = '#5d3d24'; ctx.fillRect(x - 3, y - 46, 5, 46); ctx.fillRect(x + 26, y - 46, 5, 46);
  ctx.fillStyle = '#8a5a2b'; rr(x - 40, y - 72, 108, 30, 5); ctx.fill();
  ctx.strokeStyle = '#5d3d24'; ctx.lineWidth = 2.4; rr(x - 40, y - 72, 108, 30, 5); ctx.stroke();
  ctx.fillStyle = '#3a2410'; ctx.beginPath(); ctx.arc(x - 33, y - 57, 2, 0, Math.PI * 2); ctx.arc(x + 61, y - 57, 2, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = accent || '#ffe9b0'; ctx.font = '900 12.5px Arial'; ctx.textAlign = 'center';
  ctx.fillText(lines, x + 14, y - 52.5);
}
function drawLampPost(x, y, t, warm) {
  ctx.fillStyle = '#2a2138'; ctx.fillRect(x - 2.4, y - 66, 4.8, 66);
  ctx.beginPath(); ctx.arc(x, y - 70, 7, 0, Math.PI * 2); ctx.fill();
  const fl = 0.9 + 0.1 * Math.sin(t * 13 + x);
  const lg = ctx.createRadialGradient(x, y - 70, 2, x, y - 70, 42); lg.addColorStop(0, `rgba(255,205,100,${0.55 * fl})`); lg.addColorStop(1, 'rgba(255,205,100,0)');
  ctx.fillStyle = lg; ctx.fillRect(x - 44, y - 114, 88, 88);
  ctx.fillStyle = warm || '#ffd98a'; ctx.beginPath(); ctx.arc(x, y - 70, 4.6, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = 'rgba(255,220,140,0.13)'; ctx.beginPath(); ctx.ellipse(x, y - 1, 30, 4.6, 0, 0, Math.PI * 2); ctx.fill();
}
function drawCityLamp(x, y, t) {
  ctx.fillStyle = '#131a30'; ctx.fillRect(x - 2.4, y - 74, 4.8, 74); ctx.fillRect(x - 2.4, y - 74, 20, 4.4);
  const lg = ctx.createRadialGradient(x + 16, y - 68, 2, x + 16, y - 68, 46); lg.addColorStop(0, 'rgba(255,214,130,0.5)'); lg.addColorStop(1, 'rgba(255,214,130,0)');
  ctx.fillStyle = lg; ctx.fillRect(x - 32, y - 116, 96, 96);
  ctx.fillStyle = '#ffe1a0'; ctx.fillRect(x + 11, y - 71, 10, 5);
  ctx.fillStyle = 'rgba(255,220,140,0.12)'; ctx.beginPath(); ctx.ellipse(x + 13, y - 1, 34, 5, 0, 0, Math.PI * 2); ctx.fill();
}
function drawDecorBack(theme, t) {
  const x0 = camX - 90, x1 = camX + VIEWW + 90;
  if (theme === 0) {
    // fixed story signs
    const signs = [[430, 'PALMS →'], [1830, 'LOOP AHEAD'], [2500, 'LAGOON →'], [4650, 'CORKSCREW →'], [6120, 'HALFWAY →'], [8120, 'TUNNEL →'], [10050, 'LOOP 2 →'], [13060, 'GOAL →']];
    for (const [sx, txt] of signs) { if (sx < x0 || sx > x1) continue; const s = surfaceAt(zone, sx); if (s) drawWoodSign(sx, s.y, txt); }
    // fences on flat ground (posts + rails between neighbours)
    const posts = [];
    for (let x = Math.floor(x0 / 92) * 92; x < x1; x += 92) { const s = surfaceAt(zone, x); if (s && Math.abs(s.ang) < 0.055 && !decorBlocked(x)) posts.push([x, s.y]); }
    ctx.strokeStyle = 'rgba(240,246,240,0.9)'; ctx.lineWidth = 3.4;
    ctx.beginPath();
    for (let i = 0; i + 1 < posts.length; i++) { const [ax, ay] = posts[i], [bx2, by2] = posts[i + 1]; if (bx2 - ax <= 93 && Math.abs(by2 - ay) < 26) { ctx.moveTo(ax, ay - 21); ctx.lineTo(bx2, by2 - 21); ctx.moveTo(ax, ay - 11); ctx.lineTo(bx2, by2 - 11); } }
    ctx.stroke();
    ctx.fillStyle = '#e8ecec';
    for (const [px, py] of posts) { ctx.fillRect(px - 2.6, py - 27, 5.2, 27); ctx.fillRect(px - 3.6, py - 29.5, 7.2, 3.4); }
    // lamps
    for (let x = Math.floor(x0 / 640) * 640 + 210; x < x1; x += 640) { const s = surfaceAt(zone, x); if (s && !decorBlocked(x)) drawLampPost(x, s.y, t); }
    // trees / bushes / grass / flowers on a 130px decor grid
    for (let x = Math.floor(x0 / 130) * 130; x < x1; x += 130) {
      if (decorBlocked(x)) continue;
      const s = surfaceAt(zone, x); if (!s) continue;
      const h = hash(x * 0.131);
      if (h < 0.30) { if (hash(x * 0.71) < 0.5) drawPalm(x + 30, s.y + 2, 0.85 + h * 1.05, t); else drawHibiscus(x + 30, s.y + 2, 0.8 + h * 0.9, t); }
      else if (h < 0.46) { // bush
        ctx.fillStyle = '#1e7a3c'; const bw2 = 15 + hash(x * 2.2) * 9;
        ctx.beginPath(); ctx.arc(x + 26, s.y - 5, bw2 * 0.62, 0, Math.PI * 2); ctx.arc(x + 26 - bw2 * 0.5, s.y - 2, bw2 * 0.44, 0, Math.PI * 2); ctx.arc(x + 26 + bw2 * 0.5, s.y - 2, bw2 * 0.46, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = 'rgba(140,230,140,0.55)'; ctx.beginPath(); ctx.arc(x + 20, s.y - 10, bw2 * 0.3, 0, Math.PI * 2); ctx.fill();
      }
    }
    // grass tufts + flowers on a fine grid
    for (let x = Math.floor(x0 / 44) * 44; x < x1; x += 44) {
      const s = surfaceAt(zone, x); if (!s) continue;
      const h = hash(x * 0.317);
      if (h > 0.42 && !decorBlocked(x)) {
        ctx.strokeStyle = 'rgba(90,200,95,0.9)'; ctx.lineWidth = 1.8;
        const gx = x + h * 26, sw = Math.sin(t * 1.6 + x * 0.2) * 1.6;
        ctx.beginPath();
        ctx.moveTo(gx, s.y + 1); ctx.quadraticCurveTo(gx - 3, s.y - 6, gx - 4.6 + sw, s.y - 10);
        ctx.moveTo(gx + 3, s.y + 1); ctx.quadraticCurveTo(gx + 3.4, s.y - 7, gx + 5.4 + sw, s.y - 11);
        ctx.moveTo(gx + 6, s.y + 1); ctx.quadraticCurveTo(gx + 7, s.y - 5, gx + 8.6 + sw, s.y - 8);
        ctx.stroke();
      }
      if (h > 0.78 && !decorBlocked(x)) {
        const fx = x + 12 + h * 14, cols = ['#ff9ecb', '#fff3f6', '#ffd23e', '#c39bff'];
        ctx.strokeStyle = 'rgba(90,150,70,0.9)'; ctx.lineWidth = 1.6; ctx.beginPath(); ctx.moveTo(fx, s.y + 1); ctx.lineTo(fx, s.y - 8); ctx.stroke();
        ctx.fillStyle = cols[Math.floor(h * 40) % 4]; ctx.beginPath(); ctx.arc(fx, s.y - 10.4, 3, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = '#fff6d8'; ctx.beginPath(); ctx.arc(fx, s.y - 10.4, 1.2, 0, Math.PI * 2); ctx.fill();
      }
    }
  } else if (theme === 1) {
    for (let x = Math.floor(x0 / 520) * 520 + 150; x < x1; x += 520) { const s = surfaceAt(zone, x); if (s && !decorBlocked(x)) drawCityLamp(x, s.y, t); }
    const signs = [[900, 'MESA-7', '#7CFC98'], [2560, 'DUST RD', '#5ea0ff'], [4520, 'CANYON', '#ff7ad9'], [5920, 'LUNC →', '#ffd23e'], [7260, 'BUTTE-8', '#7CFC98'], [9680, 'TUNNEL', '#ffb03a'], [12680, 'LUNC →', '#ffd23e'], [13620, 'GOAL →', '#ffd23e']];
    ctx.textAlign = 'center';
    for (const [sx, txt, col] of signs) {
      if (sx < x0 || sx > x1) continue;
      const s = surfaceAt(zone, sx); if (!s) continue;
      ctx.fillStyle = '#131a30'; ctx.fillRect(sx - 2.2, s.y - 56, 4.4, 56);
      ctx.shadowColor = col; ctx.shadowBlur = 13; ctx.fillStyle = 'rgba(6,8,20,0.92)'; rr(sx - 44, s.y - 84, 88, 26, 5); ctx.fill();
      ctx.fillStyle = col; ctx.font = '900 12px Arial'; ctx.fillText(txt, sx, s.y - 66.5); ctx.shadowBlur = 0;
    }
    // trail barrels & cairn rocks
    for (let x = Math.floor(x0 / 470) * 470 + 300; x < x1; x += 470) {
      const s = surfaceAt(zone, x); if (!s || decorBlocked(x) || Math.abs(s.ang) > 0.1) continue;
      const h = hash(x * 0.53);
      if (h < 0.5) { ctx.fillStyle = '#7a4a26'; ctx.fillRect(x, s.y - 19, 15, 19); ctx.fillStyle = '#96622f'; ctx.fillRect(x, s.y - 19, 15, 4); ctx.fillRect(x, s.y - 8, 15, 3); ctx.strokeStyle = 'rgba(40,20,8,0.6)'; ctx.lineWidth = 1.4; ctx.strokeRect(x + 0.7, s.y - 18.3, 13.6, 17.6); }
      else { ctx.fillStyle = '#b98a68'; ctx.beginPath(); ctx.ellipse(x + 8, s.y - 4, 9, 5, 0, 0, Math.PI * 2); ctx.fill(); ctx.fillStyle = '#cfa07c'; ctx.beginPath(); ctx.ellipse(x + 8, s.y - 11, 6.4, 4, 0, 0, Math.PI * 2); ctx.fill(); ctx.fillStyle = '#dec09c'; ctx.beginPath(); ctx.ellipse(x + 8, s.y - 16.4, 4, 2.8, 0, 0, Math.PI * 2); ctx.fill(); }
    }
  } else {
    // safety rails on flat stretches
    const posts = [];
    for (let x = Math.floor(x0 / 118) * 118; x < x1; x += 118) { const s = surfaceAt(zone, x); if (s && Math.abs(s.ang) < 0.055 && !decorBlocked(x)) posts.push([x, s.y]); }
    ctx.strokeStyle = 'rgba(190,220,245,0.85)'; ctx.lineWidth = 2.6;
    ctx.beginPath();
    for (let i = 0; i + 1 < posts.length; i++) { const [ax, ay] = posts[i], [bx2, by2] = posts[i + 1]; if (bx2 - ax <= 119 && Math.abs(by2 - ay) < 26) { ctx.moveTo(ax, ay - 25); ctx.lineTo(bx2, by2 - 25); ctx.moveTo(ax, ay - 14); ctx.lineTo(bx2, by2 - 14); } }
    ctx.stroke();
    ctx.fillStyle = '#7d9cc4';
    for (const [px, py] of posts) ctx.fillRect(px - 2, py - 27, 4, 27);
    ctx.fillStyle = '#8affd8';
    for (const [px, py] of posts) ctx.fillRect(px - 2, py - 27, 4, 3);
    // floating holo signs
    const signs = [[820, 'PINE 7'], [2180, 'AURORA →'], [3980, 'LOOP AHEAD'], [6080, 'TUNDRA →'], [9050, 'PINE 9'], [10950, 'LOOP 2 →'], [12750, 'ICE ARC'], [14050, 'GOAL →']];
    ctx.textAlign = 'center';
    for (const [sx, txt] of signs) {
      if (sx < x0 || sx > x1) continue;
      const s = surfaceAt(zone, sx); if (!s) continue;
      const bob = Math.sin(t * 1.5 + sx * 0.01) * 3.4, yy = s.y - 96 + bob;
      ctx.fillStyle = 'rgba(70,200,255,0.13)'; rr(sx - 52, yy - 15, 104, 27, 6); ctx.fill();
      ctx.strokeStyle = 'rgba(120,230,255,0.75)'; ctx.lineWidth = 1.6; rr(sx - 52, yy - 15, 104, 27, 6); ctx.stroke();
      ctx.fillStyle = '#bfeaff'; ctx.font = '900 12px Arial'; ctx.fillText(txt, sx, yy + 4);
      ctx.strokeStyle = 'rgba(120,230,255,0.3)'; ctx.lineWidth = 1.2; ctx.beginPath(); ctx.moveTo(sx, yy + 12); ctx.lineTo(sx, s.y - 40); ctx.stroke();
    }
    // floor light dots along the walkway
    ctx.fillStyle = 'rgba(160,255,210,0.5)';
    for (let x = Math.floor(x0 / 118) * 118 + 59; x < x1; x += 118) { const s = surfaceAt(zone, x); if (s) ctx.fillRect(x - 3, s.y + 6, 6, 2.4); }
  }
}
function drawCloudShadows(theme, t) {
  if (theme !== 0 && theme !== 1) return;
  ctx.fillStyle = theme === 0 ? 'rgba(20,60,40,0.10)' : 'rgba(60,10,10,0.12)';
  for (let i = 0; i < 3; i++) {
    const wx = ((t * 34 + i * 2300) % (zone.len + 1500)) - 750;
    if (wx < camX - 260 || wx > camX + VIEWW + 260) continue;
    const s = surfaceAt(zone, wx); if (!s) continue;
    ctx.beginPath(); ctx.ellipse(wx, s.y - 4, 190 + i * 40, 20, 0, 0, Math.PI * 2); ctx.fill();
  }
}

/* ================= AMBIENT LIFE + FOREGROUND ================= */
let amb = [];
function drawAmbient(theme, t, dt) {
  if (amb.length < 24 && Math.random() < 0.3) amb.push({ x: camX + Math.random() * VIEWW, y: camY + Math.random() * VIEWH * 0.8, ph: Math.random() * 6.28, sp: 6 + Math.random() * 14 });
  for (let i = amb.length - 1; i >= 0; i--) {
    const a = amb[i];
    a.x += Math.sin(t * 0.7 + a.ph) * 9 * dt - a.sp * dt * 0.4; a.y += Math.cos(t * 0.55 + a.ph * 1.7) * 7 * dt - (theme === 2 ? 3.5 * dt : 0);
    if (a.x < camX - 30 || a.x > camX + VIEWW + 30 || a.y < camY - 240 || a.y > camY + VIEWH + 30) { amb.splice(i, 1); continue; }
    if (theme === 0) { // sea-spray sparkles drifting over the grass
      const tw = 0.35 + 0.65 * Math.abs(Math.sin(t * 1.8 + a.ph * 3));
      ctx.fillStyle = `rgba(255,255,255,${0.6 * tw})`; ctx.beginPath(); ctx.arc(a.x, a.y, 2, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = `rgba(190,245,255,${0.16 * tw})`; ctx.beginPath(); ctx.arc(a.x, a.y, 5.2, 0, Math.PI * 2); ctx.fill();
    } else if (theme === 1) { // canyon dust motes in the sunset light
      ctx.fillStyle = 'rgba(255,205,140,0.5)'; ctx.fillRect(a.x, a.y, 1.9, 1.9);
    } else { // orbit sparkles
      const tw = Math.abs(Math.sin(t * 2.4 + a.ph * 2));
      ctx.strokeStyle = `rgba(200,235,255,${0.65 * tw})`; ctx.lineWidth = 1.3;
      const r = 2 + tw * 2.6;
      ctx.beginPath(); ctx.moveTo(a.x - r, a.y); ctx.lineTo(a.x + r, a.y); ctx.moveTo(a.x, a.y - r); ctx.lineTo(a.x, a.y + r); ctx.stroke();
    }
  }
}
function drawForeground(theme, t) {
  ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
  const fg = ctx.createLinearGradient(0, CH - 90, 0, CH);
  fg.addColorStop(0, 'rgba(0,0,0,0)'); fg.addColorStop(1, theme === 0 ? 'rgba(16,8,20,0.42)' : 'rgba(0,0,8,0.45)');
  ctx.fillStyle = fg; ctx.fillRect(0, CH - 90, CW, 90);
  if (theme === 0) { // close grass silhouettes sweeping past at the very bottom
    ctx.fillStyle = 'rgba(8,40,20,0.8)';
    const off = (camX * 1.35) % 34;
    for (let sx = -34 + -off; sx < CW + 34; sx += 34) {
      const h = 13 + hash(sx * 0.37 + Math.floor(camX * 1.35 / 34)) * 20;
      ctx.beginPath();
      ctx.moveTo(sx, CH); ctx.quadraticCurveTo(sx + 3, CH - h * 0.6, sx + 1, CH - h);
      ctx.quadraticCurveTo(sx + 6, CH - h * 0.55, sx + 8, CH); ctx.closePath(); ctx.fill();
    }
  } else { // soft bokeh dust close to the lens
    for (let i = 0; i < 5; i++) {
      const bx = ((hash(i * 31.7) * 1200 + t * (5 + i * 2) - camX * 0.9) % (CW + 160) + CW + 160) % (CW + 160) - 80;
      const by = CH * (0.55 + hash(i * 7.3) * 0.4);
      ctx.fillStyle = theme === 1 ? 'rgba(255,190,130,0.055)' : 'rgba(170,220,255,0.06)';
      ctx.beginPath(); ctx.arc(bx, by, 16 + i * 6, 0, Math.PI * 2); ctx.fill();
    }
  }
}

function loopColors(theme) { return theme === 0 ? ['#1d7a3a', '#ffd23e'] : theme === 1 ? ['#8a3b2a', '#ffb03a'] : ['#7d9cc4', '#bfe9ff']; }
function drawLoopBack(theme) {
  const [dark] = loopColors(theme);
  for (const L of zone.loops) {
    if (L.cx + L.r < camX - 80 || L.cx - L.r > camX + VIEWW + 80) continue;
    ctx.strokeStyle = 'rgba(0,0,0,0.35)'; ctx.lineWidth = 7; ctx.beginPath(); ctx.moveTo(L.cx - L.r - 16, L.gy + 4); ctx.lineTo(L.cx - L.r * 0.34, L.gy - L.r * 0.94); ctx.moveTo(L.cx + L.r + 16, L.gy + 4); ctx.lineTo(L.cx + L.r * 0.34, L.gy - L.r * 0.94); ctx.stroke();
    ctx.strokeStyle = dark; ctx.lineWidth = 30; ctx.beginPath(); ctx.arc(L.cx, L.gy - L.r, L.r, 0, Math.PI * 2); ctx.stroke();
    if (theme === 0) { // palm trunks bracing the loop + a ring of gold studs
      ctx.strokeStyle = '#6e4525'; ctx.lineWidth = 9; ctx.beginPath(); ctx.moveTo(L.cx - L.r - 13, L.gy + 6); ctx.quadraticCurveTo(L.cx - L.r * 0.6, L.gy - L.r * 0.6, L.cx - L.r * 0.36, L.gy - L.r * 0.92); ctx.moveTo(L.cx + L.r + 13, L.gy + 6); ctx.quadraticCurveTo(L.cx + L.r * 0.6, L.gy - L.r * 0.6, L.cx + L.r * 0.36, L.gy - L.r * 0.92); ctx.stroke();
      ctx.fillStyle = '#ffd23e'; for (let a = 0; a < Math.PI * 2; a += Math.PI / 7) { ctx.beginPath(); ctx.arc(L.cx + (L.r + 19) * Math.cos(a), (L.gy - L.r) + (L.r + 19) * Math.sin(a), 3.2, 0, Math.PI * 2); ctx.fill(); }
    }
    if (theme === 1) { // striped strata bands across the rock ring
      ctx.strokeStyle = 'rgba(255,190,120,0.4)'; ctx.lineWidth = 3;
      for (const rr2 of [-8, 2, 11]) { ctx.beginPath(); ctx.arc(L.cx, L.gy - L.r, L.r + rr2, 0.3, 2.6); ctx.stroke(); }
    }
  }
}
function drawLoopFront(theme) {
  const [, lite] = loopColors(theme);
  for (const L of zone.loops) {
    if (L.cx + L.r < camX - 80 || L.cx - L.r > camX + VIEWW + 80) continue;
    ctx.strokeStyle = lite; ctx.lineWidth = 30; ctx.beginPath(); ctx.arc(L.cx, L.gy - L.r, L.r, 1.66, 3.05); ctx.stroke();
    ctx.strokeStyle = 'rgba(255,255,255,0.5)'; ctx.lineWidth = 3; ctx.beginPath(); ctx.arc(L.cx, L.gy - L.r, L.r - 13, 1.66, 3.05); ctx.stroke();
    if (theme === 0) { // palm crown fanning from the top of the loop + blossoms
      const tx2 = L.cx, ty2 = L.gy - L.r * 2 - 12;
      ctx.strokeStyle = '#2e8b47'; ctx.lineWidth = 4;
      for (let f = 0; f < 7; f++) { const a = Math.PI * (0.08 + f * 0.14); ctx.beginPath(); ctx.moveTo(tx2, ty2); ctx.quadraticCurveTo(tx2 + Math.cos(a) * 34, ty2 - Math.sin(a) * 30 - 8, tx2 + Math.cos(a) * 58, ty2 - Math.sin(a) * 26 + 16); ctx.stroke(); }
      ctx.fillStyle = '#5d4020'; ctx.beginPath(); ctx.arc(tx2 - 5, ty2 + 3, 4.6, 0, Math.PI * 2); ctx.arc(tx2 + 6, ty2 + 4, 4, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = '#ffb7d5';
      for (let a = 2.0; a < 2.85; a += 0.42) { ctx.beginPath(); ctx.arc(L.cx + (L.r + 16) * Math.cos(a), (L.gy - L.r) + (L.r + 16) * Math.sin(a), 2.1, 0, Math.PI * 2); ctx.fill(); }
    }
    if (theme === 2) { ctx.fillStyle = '#8affd8'; for (let a = 0; a < Math.PI * 2; a += Math.PI / 6) { ctx.beginPath(); ctx.arc(L.cx + L.r * Math.cos(a), (L.gy - L.r) + L.r * Math.sin(a), 3.4, 0, Math.PI * 2); ctx.fill(); } }
  }
}
function drawCorkBack(theme) {
  for (const C of zone.corks) {
    if (C.x1 < camX - 60 || C.x0 > camX + VIEWW + 60) continue;
    const col = theme === 0 ? 'rgba(46,139,71,0.92)' : theme === 1 ? 'rgba(122,50,36,0.92)' : 'rgba(90,130,180,0.92)';
    ctx.strokeStyle = col; ctx.lineWidth = 9; ctx.beginPath();
    for (let s = 0; s <= 1.001; s += 0.04) { const x = C.x0 + (C.x1 - C.x0) * s; const sf = surfaceAt(zone, x); if (!sf) continue; const b = -Math.PI / 2 + s * C.turns * 2 * Math.PI; const y = (sf.y - C.r) + C.r * Math.sin(b); s === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y); }
    ctx.stroke();
    ctx.strokeStyle = 'rgba(0,0,0,0.35)'; ctx.lineWidth = 4;
    for (let s = 0; s <= 1.001; s += 0.125) { const x = C.x0 + (C.x1 - C.x0) * s; const sf = surfaceAt(zone, x); if (sf) { ctx.beginPath(); ctx.moveTo(x, sf.y - C.r * 2 - 6); ctx.lineTo(x, sf.y + 2); ctx.stroke(); } }
  }
}
function drawCorkFront(theme) {
  for (const C of zone.corks) {
    if (C.x1 < camX - 60 || C.x0 > camX + VIEWW + 60) continue;
    const col = theme === 0 ? '#8affd8' : theme === 1 ? '#ffb03a' : '#eaf6ff';
    ctx.strokeStyle = col; ctx.lineWidth = 9; ctx.beginPath();
    for (let s = 0; s <= 1.001; s += 0.04) { const x = C.x0 + (C.x1 - C.x0) * s; const sf = surfaceAt(zone, x); if (!sf) continue; const b = -Math.PI / 2 + s * C.turns * 2 * Math.PI; const y = (sf.y - C.r) - C.r * Math.sin(b); s === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y); }
    ctx.stroke();
  }
}
function drawSpeedFX(theme, t) {
  ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
  if (state === 'play') {
    const spd = P.mode === 'loop' ? P.ls : P.grounded ? Math.abs(P.g) : Math.hypot(P.vx, P.vy);
    const sf = Math.max(0, Math.min(1, (spd - 470) / 380));
    if (sf > 0) {
      const dir = (P.mode === 'loop' ? P.ldir : P.facing) || 1;
      ctx.strokeStyle = 'rgba(255,248,225,0.5)'; ctx.lineCap = 'round';
      for (let i = 0; i < 7; i++) {
        const ph = hash(i * 7.31 + Math.floor(t * 9) * 0.618);
        const yy = 26 + hash(i * 3.77 + Math.floor(t * 9)) * (CH - 60);
        const xx = ((hash(i * 13.7) * 1400 - t * (1500 + sf * 900) * dir) % (CW + 340) + CW + 340) % (CW + 340) - 170;
        const ln = (36 + ph * 90) * (0.4 + sf);
        ctx.globalAlpha = 0.16 + sf * 0.5 * ph;
        ctx.lineWidth = 1.4 + ph * 1.6;
        ctx.beginPath(); ctx.moveTo(xx, yy); ctx.lineTo(xx - dir * ln, yy); ctx.stroke();
      }
      ctx.globalAlpha = 1; ctx.lineCap = 'butt';
    }
  }
  const vg = ctx.createRadialGradient(CW / 2, CH / 2, Math.min(CW, CH) * 0.42, CW / 2, CH / 2, Math.max(CW, CH) * 0.78);
  vg.addColorStop(0, 'rgba(6,4,18,0)'); vg.addColorStop(1, 'rgba(6,4,18,0.30)');
  ctx.fillStyle = vg; ctx.fillRect(0, 0, CW, CH);
}
const TUNNELC = [['#57b24a', '#ffd23e'], ['#c96a3f', '#ffd98a'], ['#7d9cc4', '#8affd8']];
function tunnelPhase(C) { if (!P.grounded || P.mode !== 'ground' || P.x < C.x0 - 190 || P.x > C.x1 + 60) return -1; const b = corkBeta(C, Math.max(C.x0, Math.min(C.x1, P.x))); return ((b + Math.PI / 2) % (Math.PI * 2)) / (Math.PI * 2); }
function drawTunnelBack(theme) {
  for (const C of zone.corks) {
    if (C.x1 < camX - 80 || C.x0 > camX + VIEWW + 80) continue;
    const sE = surfaceAt(zone, C.x0), sX = surfaceAt(zone, C.x1); if (!sE || !sX) continue;
    const rib = TUNNELC[theme][0];
    const ph = tunnelPhase(C);
    ctx.fillStyle = 'rgba(8,10,26,0.30)';
    ctx.beginPath(); ctx.moveTo(C.x0 - 26, sE.y + 6); ctx.lineTo(C.x0 - 26, sE.y - C.r * 2 - 64); ctx.quadraticCurveTo((C.x0 + C.x1) / 2, sE.y - C.r * 2 - 118, C.x1 + 26, sX.y - C.r * 2 - 64); ctx.lineTo(C.x1 + 26, sX.y + 6); ctx.closePath(); ctx.fill();
    if (ph >= 0) { const gx = C.x0 + (C.x1 - C.x0) * ph; const gs = surfaceAt(zone, gx); if (gs) { const gg = ctx.createRadialGradient(gx, gs.y - C.r, 6, gx, gs.y - C.r, 190); gg.addColorStop(0, 'rgba(255,240,190,0.20)'); gg.addColorStop(1, 'rgba(255,240,190,0)'); ctx.fillStyle = gg; ctx.fillRect(gx - 200, gs.y - C.r - 200, 400, 400); } }
    ctx.strokeStyle = rib; ctx.lineWidth = 7;
    for (let s = 0.02; s < 1; s += 0.09) {
      const x = C.x0 + (C.x1 - C.x0) * s; const sf = surfaceAt(zone, x); if (!sf) continue;
      ctx.globalAlpha = 0.5; ctx.beginPath(); ctx.moveTo(x, sf.y - C.r * 2 - 52); ctx.lineTo(x, sf.y + 2); ctx.stroke(); ctx.globalAlpha = 1;
    }
    for (let s = 0.06; s < 1; s += 0.16) {
      const x = C.x0 + (C.x1 - C.x0) * s; const sf = surfaceAt(zone, x); if (!sf) continue;
      const topY = sf.y - C.r * 2 - 56 + Math.sin(s * 9 + theme) * 8;
      ctx.strokeStyle = 'rgba(20,16,10,0.6)'; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(x, topY - 14); ctx.lineTo(x, topY); ctx.stroke();
      const on = ph >= 0 && Math.abs(s - ph) < 0.14;
      ctx.fillStyle = on ? '#fff3b0' : '#ffd98a'; ctx.beginPath(); ctx.arc(x, topY + 3, on ? 4.6 : 3.4, 0, Math.PI * 2); ctx.fill();
    }
    ctx.fillStyle = 'rgba(10,12,24,0.85)'; rr(C.x0 - 58, sE.y - C.r * 2 - 92, 76, 20, 4); ctx.fill();
    ctx.fillStyle = TUNNELC[theme][1]; ctx.font = '900 11px Arial'; ctx.textAlign = 'center'; ctx.fillText('TUNNEL', C.x0 - 20, sE.y - C.r * 2 - 78);
    ctx.fillStyle = 'rgba(10,12,24,0.85)'; rr(C.x1 - 18, sX.y - C.r * 2 - 92, 76, 20, 4); ctx.fill();
    ctx.fillStyle = TUNNELC[theme][1]; ctx.fillText('EXIT', C.x1 + 20, sX.y - C.r * 2 - 78);
  }
}
function drawTunnelFront(theme) {
  for (const C of zone.corks) {
    if (C.x1 < camX - 80 || C.x0 > camX + VIEWW + 80) continue;
    const rib = TUNNELC[theme][0], lite = TUNNELC[theme][1];
    const sE = surfaceAt(zone, C.x0 - 14), sX = surfaceAt(zone, C.x1 + 14);
    ctx.strokeStyle = rib; ctx.lineWidth = 10;
    for (const px of [C.x0 - 14, C.x1 + 14]) {
      const sf = surfaceAt(zone, px); if (!sf) continue;
      ctx.beginPath(); ctx.moveTo(px, sf.y + 4); ctx.lineTo(px, sf.y - C.r * 2 - 46); ctx.stroke();
      ctx.fillStyle = lite; ctx.beginPath(); ctx.arc(px, sf.y - C.r * 2 - 52, 5, 0, Math.PI * 2); ctx.fill();
    }
    if (sE && sX) { ctx.strokeStyle = rib; ctx.lineWidth = 8; ctx.beginPath(); ctx.moveTo(C.x0 - 14, sE.y - C.r * 2 - 46); ctx.quadraticCurveTo((C.x0 + C.x1) / 2, sE.y - C.r * 2 - 104, C.x1 + 14, sX.y - C.r * 2 - 46); ctx.stroke(); }
  }
}
function drawSpring(sp, theme) {
  const squash = sp.anim > 0 ? 1 - sp.anim * 0.45 : 1;
  ctx.fillStyle = theme === 1 ? '#123a5e' : '#5e4632'; ctx.fillRect(sp.x - 20, sp.y - 6, 40, 6);
  ctx.fillStyle = '#ff5964'; const h = 13 * squash; ctx.fillRect(sp.x - 16, sp.y - 6 - h, 32, h);
  ctx.fillStyle = '#ffd23e'; ctx.fillRect(sp.x - 16, sp.y - 9 - h, 32, 4);
}
function drawCoinAt(x, y, r, t, alpha) {
  ctx.save(); if (alpha !== undefined) ctx.globalAlpha = alpha;
  const sq = Math.abs(Math.sin(t * 3 + x * 0.05));
  ctx.translate(x, y); ctx.scale(0.35 + 0.65 * sq, 1);
  const g = ctx.createRadialGradient(-r * 0.3, -r * 0.3, r * 0.2, 0, 0, r); g.addColorStop(0, '#ffe98a'); g.addColorStop(0.75, '#f5b921'); g.addColorStop(1, '#c47f0e');
  ctx.fillStyle = g; ctx.beginPath(); ctx.arc(0, 0, r, 0, Math.PI * 2); ctx.fill();
  ctx.strokeStyle = '#9c6d0e'; ctx.lineWidth = 1.6; ctx.stroke();
  if (luncImg.complete && luncImg.naturalWidth) { ctx.save(); ctx.beginPath(); ctx.arc(0, 0, r * 0.78, 0, Math.PI * 2); ctx.clip(); ctx.drawImage(luncImg, -r * 0.78, -r * 0.78, r * 1.56, r * 1.56); ctx.restore(); }
  else { ctx.fillStyle = '#a86e0a'; ctx.beginPath(); ctx.arc(0, 0, r * 0.55, 0, Math.PI * 2); ctx.fill(); ctx.fillStyle = '#f5b921'; ctx.beginPath(); ctx.arc(r * 0.22, -r * 0.1, r * 0.45, 0, Math.PI * 2); ctx.fill(); }
  ctx.restore();
  // sparkle glint sweeping the coin
  const gl = Math.sin(t * 3 + x * 0.05 + 1.1);
  if (gl > 0.82) {
    ctx.save(); ctx.globalAlpha = (gl - 0.82) * 4.4; ctx.strokeStyle = '#fffbe8'; ctx.lineWidth = 1.6;
    const gx = x + r * 0.34, gy = y - r * 0.4, gr = 5.4;
    ctx.beginPath(); ctx.moveTo(gx - gr, gy); ctx.lineTo(gx + gr, gy); ctx.moveTo(gx, gy - gr); ctx.lineTo(gx, gy + gr); ctx.stroke(); ctx.restore();
  }
}
function drawStarAt(x, y, r, t) {
  ctx.save(); ctx.translate(x, y + Math.sin(t * 2.4 + x * 0.03) * 3); ctx.rotate(Math.sin(t * 1.8 + x * 0.02) * 0.2);
  ctx.shadowColor = '#5ea0ff'; ctx.shadowBlur = 13;
  ctx.fillStyle = '#3f8cff'; ctx.beginPath();
  for (let i = 0; i < 10; i++) { const a = -Math.PI / 2 + i * Math.PI / 5; const rr2 = i % 2 === 0 ? r : r * 0.45; const px = Math.cos(a) * rr2, py = Math.sin(a) * rr2; i === 0 ? ctx.moveTo(px, py) : ctx.lineTo(px, py); }
  ctx.closePath(); ctx.fill(); ctx.shadowBlur = 0;
  ctx.fillStyle = '#bcd8ff'; ctx.beginPath(); ctx.arc(0, 0, r * 0.3, 0, Math.PI * 2); ctx.fill();
  ctx.restore();
}
function drawEnemy(e, t) {
  if (e.type === 'candle') {
    const x = e.x, y = e.y, dir = Math.cos(e.t * e.sp / Math.max(e.range, 1)) >= 0 ? 1 : -1;
    ctx.fillStyle = '#232338'; ctx.fillRect(x - 13, y - 8, 26, 8);
    ctx.fillStyle = '#3a3a58'; ctx.fillRect(x - 10, y - 26, 20, 19);
    ctx.fillStyle = '#ff5964'; ctx.beginPath(); ctx.moveTo(x - 8, y - 26); ctx.lineTo(x - 5, y - 46); ctx.lineTo(x, y - 50); ctx.lineTo(x + 5, y - 46); ctx.lineTo(x + 8, y - 26); ctx.closePath(); ctx.fill();
    const fl = 1 + Math.sin(t * 11 + e.x) * 0.16;
    ctx.fillStyle = '#ffb03a'; ctx.beginPath(); ctx.ellipse(x, y - 44 * fl - 4, 4.6, 8 * fl, 0, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#fff3b0'; ctx.beginPath(); ctx.ellipse(x, y - 42 * fl - 2, 2.2, 4 * fl, 0, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#ffd23e'; ctx.beginPath(); ctx.arc(x + dir * 4, y - 17, 2.6, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#ff5964'; ctx.fillRect(x - 10, y - 12, 20, 3);
  } else {
    const x = e.x, y = e.y, tilt = Math.sin(e.t * 0.55) * 0.14;
    ctx.save(); ctx.translate(x, y); ctx.rotate(tilt);
    ctx.fillStyle = '#ffe9d2'; ctx.beginPath(); ctx.moveTo(0, -12); ctx.lineTo(30, 8); ctx.lineTo(4, 6); ctx.lineTo(-2, 14); ctx.lineTo(-8, 4); ctx.lineTo(-28, 6); ctx.closePath(); ctx.fill();
    ctx.fillStyle = '#ffb27a'; ctx.beginPath(); ctx.moveTo(0, -12); ctx.lineTo(30, 8); ctx.lineTo(4, 6); ctx.closePath(); ctx.fill();
    ctx.fillStyle = '#ff5964'; ctx.beginPath(); ctx.arc(3, -2, 3.4, 0, Math.PI * 2); ctx.fill();
    ctx.restore();
    ctx.strokeStyle = 'rgba(255,178,122,0.4)'; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(x - 18, y + 16 + Math.sin(t * 6) * 2); ctx.lineTo(x + 18, y + 16 + Math.cos(t * 5) * 2); ctx.stroke();
  }
}
/* ---- COMET the moon-fox hero rig (original character; art only — physics/hitbox untouched) ---- */
let spinAng = 0;
let cometSquash = 0, cometStretch = 0, legSwing = 0, tailLag = 0;
const FOX = { body: '#ff8c3a', bodyD: '#e06a1e', cream: '#fff3dc', creamD: '#f3ddba', ink: '#33231a', teal: '#17b8a6', tealD: '#0d7d72', gold: '#ffd23e' };
function drawCrescentMark(cx, cy, r, col) {
  ctx.save(); ctx.fillStyle = col;
  ctx.beginPath();
  ctx.arc(cx, cy, r, 0, Math.PI * 2);
  ctx.arc(cx + r * 0.44, cy - r * 0.26, r * 0.8, 0, Math.PI * 2);
  ctx.fill('evenodd');
  ctx.restore();
}
function drawFoxEar(len, wid, bend) {
  ctx.beginPath();
  ctx.moveTo(-wid / 2, 0);
  ctx.quadraticCurveTo(-wid / 2 - bend * 0.3, -len * 0.55, -bend, -len);
  ctx.quadraticCurveTo(bend * 0.2, -len - wid * 0.3, wid / 2, -len * 0.9);
  ctx.quadraticCurveTo(wid / 2 + bend * 0.12, -len * 0.45, wid / 2, 0);
  ctx.closePath(); ctx.fill();
  ctx.fillStyle = FOX.ink;
  ctx.beginPath();
  ctx.moveTo(-bend - 1.6, -len + 1);
  ctx.quadraticCurveTo(bend * 0.2, -len - wid * 0.3, wid / 2 - 0.6, -len * 0.9);
  ctx.quadraticCurveTo(bend * 0.1, -len * 0.72, -bend + 1.2, -len * 0.82);
  ctx.closePath(); ctx.fill();
}
function drawPlayer(t, dt) {
  const fp = feetRenderPos();
  const x = fp.x, y = fp.y;
  let rot = 0;
  const speed = P.mode === 'loop' ? P.ls : P.grounded ? Math.abs(P.g) : Math.hypot(P.vx, P.vy);
  if (P.mode === 'loop') rot = P.la - Math.PI / 2;
  else if (fp.cork) rot = fp.beta + Math.PI / 2;
  else if (P.grounded) rot = P.onPlat ? 0 : P.ang;
  else if (P.spin) { spinAng += dt * (9 + speed * 0.012) * (P.facing >= 0 ? 1 : -1); rot = spinAng; }
  else rot = Math.max(-0.4, Math.min(0.5, P.vy * 0.00045)) * P.facing;
  const blink = P.invuln > 0 && Math.floor(t * 14) % 2 === 0;
  const ball = P.rolling || P.spin || P.mode === 'loop';
  // hero size: rig scaled x1.28 about the feet point — VISUAL ONLY. Physics/hitbox deliberately
  // untouched: P.x/P.y, collision, loop/corkscrew clearance and pickup geometry stay as proven.
  const HS = 1.28;
  /* feel deform (visual only): landing squash, launch stretch, skid squash */
  const airNow = !P.grounded && P.mode === 'air';
  if (airNow) { FX.wasAir = true; FX.prevVy = P.vy; }
  if (P.grounded && FX.wasAir) { FX.wasAir = false; if (FX.prevVy > 240) cometSquash = Math.min(1, FX.prevVy / 1150); }
  if (FX.skidT > 0) cometSquash = Math.max(cometSquash, 0.35);
  cometSquash = Math.max(0, cometSquash - dt * 5.2);
  cometStretch = Math.max(0, cometStretch - dt * 4.2);
  let sqX = 1, sqY = 1;
  if (FX.sq > 0.005) { sqY = 1 - FX.sq * 0.55; sqX = 1 + FX.sq * 0.42; FX.sq = Math.max(0, FX.sq - dt * 3.4); }
  else if (FX.st > 0.005) { sqY = 1 + FX.st * 0.5; sqX = 1 - FX.st * 0.3; FX.st = Math.max(0, FX.st - dt * 3.4); }
  if (cometSquash > 0.01) { sqY *= 1 - cometSquash * 0.26; sqX *= 1 + cometSquash * 0.2; }
  if (cometStretch > 0.01) { sqY *= 1 + cometStretch * 0.22; sqX *= 1 - cometStretch * 0.14; }
  tailLag += ((ball ? 0.5 : Math.min(1, speed / 760)) - tailLag) * Math.min(1, dt * 6);
  const runCyc = P.grounded && speed > 30;
  legSwing = runCyc ? P.runPhase : legSwing + dt * 3;
  const bobY = runCyc ? Math.abs(Math.sin(P.runPhase)) * -1.7 : 0;
  ctx.save(); ctx.translate(x, y); ctx.rotate(rot); ctx.scale(P.facing * HS, HS); if (blink) ctx.globalAlpha = 0.35;
  /* comet tail: flame plume behind (-x), grows with speed */
  const tlen = Math.min(66, 10 + speed * 0.062) * (1 + Math.sin(t * 29) * 0.09);
  if (speed > 90) {
    const tg = ctx.createLinearGradient(-13, -17, -(15 + tlen), -17); tg.addColorStop(0, 'rgba(255,176,66,0.9)'); tg.addColorStop(0.45, 'rgba(255,110,40,0.5)'); tg.addColorStop(1, 'rgba(255,80,30,0)');
    ctx.fillStyle = tg; ctx.beginPath(); ctx.moveTo(-11, -25); ctx.lineTo(-(15 + tlen), -16 + Math.sin(t * 23) * 2.6); ctx.lineTo(-11, -8); ctx.closePath(); ctx.fill();
  }
  if (ball) {
    /* spin ball: orange sphere, rolling cream belly band, teal scarf wrap, ear spikes, crescent badge */
    if (speed > 140) { ctx.fillStyle = 'rgba(255,150,50,0.7)'; ctx.beginPath(); ctx.moveTo(-14, -23); ctx.lineTo(-(16 + tlen * 0.7), -15); ctx.lineTo(-14, -8); ctx.closePath(); ctx.fill(); }
    ctx.save(); ctx.scale(sqX, sqY);
    const bg3 = ctx.createRadialGradient(-5, -23, 3, 0, -16, 17); bg3.addColorStop(0, '#ffb066'); bg3.addColorStop(0.6, FOX.body); bg3.addColorStop(1, FOX.bodyD);
    ctx.fillStyle = bg3; ctx.beginPath(); ctx.arc(0, -16, 15.5, 0, Math.PI * 2); ctx.fill();
    ctx.save(); ctx.beginPath(); ctx.arc(0, -16, 15.5, 0, Math.PI * 2); ctx.clip();
    const ph = (t * (2.4 + speed * 0.012)) % (Math.PI * 2);
    ctx.fillStyle = FOX.cream; ctx.beginPath(); ctx.ellipse(Math.cos(ph) * 9, -16 + Math.sin(ph) * 12.5, 7.6, 4.6, ph * 0.6, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = FOX.teal; ctx.lineWidth = 4.6; ctx.beginPath(); ctx.arc(0, -16, 12.6, ph + 2.2, ph + 3.6); ctx.stroke();
    ctx.fillStyle = FOX.ink;
    for (const a of [ph + 0.7, ph + 2.8, ph + 4.9]) { ctx.beginPath(); ctx.moveTo(Math.cos(a) * 11.5, -16 + Math.sin(a) * 11.5); ctx.lineTo(Math.cos(a - 0.24) * 15.8, -16 + Math.sin(a - 0.24) * 15.8); ctx.lineTo(Math.cos(a + 0.24) * 15.8, -16 + Math.sin(a + 0.24) * 15.8); ctx.closePath(); ctx.fill(); }
    ctx.restore();
    ctx.strokeStyle = 'rgba(120,52,10,0.5)'; ctx.lineWidth = 1.6; ctx.beginPath(); ctx.arc(0, -16, 15.5, 0, Math.PI * 2); ctx.stroke();
    if (luncImg.complete && luncImg.naturalWidth) { ctx.save(); ctx.globalAlpha = 0.96; ctx.drawImage(luncImg, -4.6, -9.2, 9.2, 9.2); ctx.restore(); }
    else { ctx.save(); ctx.translate(0, -5); drawCrescentMark(0, 0, 4, FOX.gold); ctx.restore(); }
    ctx.restore();
  } else {
    ctx.save(); ctx.translate(0, bobY); ctx.scale(sqX, sqY);
    const p = P.runPhase, air = !P.grounded;
    const run = runCyc;
    const legA = run ? Math.sin(p) * 0.95 : 0, legB = run ? Math.sin(p + Math.PI) * 0.95 : 0;
    /* tail: big plume with cream tip, streams back with speed */
    ctx.save(); ctx.translate(-9.5, -13); ctx.rotate(-0.25 - tailLag * 0.65 + Math.sin(t * 3.1) * 0.05);
    const tg2 = ctx.createLinearGradient(0, 0, -26 - tailLag * 14, 0); tg2.addColorStop(0, FOX.body); tg2.addColorStop(0.62, FOX.bodyD); tg2.addColorStop(0.8, FOX.cream); tg2.addColorStop(1, FOX.cream);
    ctx.fillStyle = tg2; ctx.beginPath(); ctx.moveTo(2, -6.5); ctx.quadraticCurveTo(-16 - tailLag * 10, -9, -(27 + tailLag * 15), -2.5 + Math.sin(t * 5) * 1.4); ctx.quadraticCurveTo(-15 - tailLag * 9, 2.5, 2, 5.5); ctx.closePath(); ctx.fill(); ctx.restore();
    /* far ear */
    ctx.save(); ctx.translate(0.4, -40.5); ctx.rotate(-0.24 - tailLag * 0.5); ctx.fillStyle = FOX.bodyD; drawFoxEar(19, 6.4, 2.6 + tailLag * 4); ctx.restore();
    /* far arm */
    ctx.save(); ctx.translate(0, -21); ctx.rotate(air ? -0.8 : run ? Math.sin(p) * 0.6 : 0.1); ctx.fillStyle = FOX.bodyD; rr(-2.1, 0, 4.2, 10, 2.1); ctx.fill(); ctx.fillStyle = FOX.cream; ctx.beginPath(); ctx.arc(0, 10.6, 3, 0, Math.PI * 2); ctx.fill(); ctx.restore();
    /* far leg + runner shoe */
    ctx.save(); ctx.translate(-1.6, -11.5); ctx.rotate(air ? 0.5 : legB * 0.85); ctx.fillStyle = FOX.bodyD; rr(-2.3, 0, 4.6, 9, 2.3); ctx.fill();
    ctx.fillStyle = FOX.tealD; ctx.beginPath(); ctx.ellipse(3, 10.2, 6.2, 3, 0, 0, Math.PI * 2); ctx.fill(); ctx.fillStyle = '#eafffb'; ctx.fillRect(-2.6, 12.2, 11.4, 1.8); ctx.restore();
    /* body */
    const bg4 = ctx.createRadialGradient(-4, -26, 3, 0, -17, 16); bg4.addColorStop(0, '#ffa257'); bg4.addColorStop(0.65, FOX.body); bg4.addColorStop(1, FOX.bodyD);
    ctx.fillStyle = bg4; ctx.beginPath(); ctx.ellipse(0, -17.5, 11.4, 12.4, 0, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = FOX.cream; ctx.beginPath(); ctx.ellipse(3, -14.2, 6.4, 8, 0, 0, Math.PI * 2); ctx.fill();
    /* teal scarf at the neck, its tail streaming behind */
    ctx.fillStyle = FOX.teal; ctx.beginPath(); ctx.ellipse(1.5, -25.6, 9.6, 3.6, -0.06, 0, Math.PI * 2); ctx.fill();
    ctx.save(); ctx.translate(-6.5, -25); ctx.rotate(0.5 + tailLag * 0.55 + Math.sin(t * 6.2) * 0.07); ctx.fillStyle = FOX.tealD; ctx.beginPath(); ctx.moveTo(0, -2.4); ctx.lineTo(-(11 + tailLag * 9), 0.6); ctx.lineTo(0, 3.4); ctx.closePath(); ctx.fill(); ctx.restore();
    /* near leg + runner shoe */
    ctx.save(); ctx.translate(1.8, -11.5); ctx.rotate(air ? -0.42 : legA * 0.85); ctx.fillStyle = FOX.body; rr(-2.3, 0, 4.6, 9, 2.3); ctx.fill();
    ctx.fillStyle = FOX.teal; ctx.beginPath(); ctx.ellipse(3.2, 10.2, 6.4, 3.1, 0, 0, Math.PI * 2); ctx.fill(); ctx.fillStyle = '#eafffb'; ctx.fillRect(-2.4, 12.3, 11.8, 1.9); ctx.restore();
    /* head */
    const hg2 = ctx.createRadialGradient(1, -38, 2, 3.4, -33.5, 11.5); hg2.addColorStop(0, '#ffab5e'); hg2.addColorStop(0.7, FOX.body); hg2.addColorStop(1, FOX.bodyD);
    ctx.fillStyle = hg2; ctx.beginPath(); ctx.arc(3.4, -33.5, 10.6, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = FOX.cream; ctx.beginPath(); ctx.ellipse(6.4, -29.2, 7.8, 5.6, 0, 0, Math.PI * 2); ctx.fill();
    /* muzzle + nose + mouth (open grin at full speed) */
    ctx.fillStyle = FOX.cream; ctx.beginPath(); ctx.ellipse(9.6, -30.2, 5.2, 3.9, 0, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = FOX.ink; ctx.beginPath(); ctx.ellipse(13.6, -32.2, 2.2, 1.6, 0, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = 'rgba(255,255,255,0.8)'; ctx.beginPath(); ctx.ellipse(13, -32.8, 0.8, 0.5, 0, 0, Math.PI * 2); ctx.fill();
    ctx.lineCap = 'round';
    if (speed > 560) { ctx.fillStyle = '#7a2d12'; ctx.beginPath(); ctx.ellipse(10.6, -27.6, 2.6, 1.9, 0, 0, Math.PI * 2); ctx.fill(); ctx.fillStyle = '#fff'; ctx.fillRect(9.2, -29.2, 2.8, 1.3); }
    else { ctx.strokeStyle = FOX.ink; ctx.lineWidth = 1.2; ctx.beginPath(); ctx.arc(9.6, -28.6, 2.6, 0.15 * Math.PI, 0.85 * Math.PI); ctx.stroke(); }
    /* cheek blaze + blush */
    ctx.fillStyle = FOX.creamD; ctx.beginPath(); ctx.ellipse(0.6, -30.4, 3.1, 2.3, 0.3, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = 'rgba(255,110,80,0.38)'; ctx.beginPath(); ctx.ellipse(5.2, -30.8, 2.6, 1.7, 0, 0, Math.PI * 2); ctx.fill();
    /* eye: determined brow, speed squint, blink cycle, pain X after a hit */
    const eyeClosed = (t % 3.4) < 0.11;
    if (P.invuln > 1.15) { ctx.strokeStyle = FOX.ink; ctx.lineWidth = 1.8; ctx.beginPath(); ctx.moveTo(4.8, -37.6); ctx.lineTo(10, -33.8); ctx.moveTo(10, -37.6); ctx.lineTo(4.8, -33.8); ctx.stroke(); }
    else if (eyeClosed) { ctx.strokeStyle = FOX.ink; ctx.lineWidth = 1.7; ctx.beginPath(); ctx.moveTo(4.6, -35.8); ctx.quadraticCurveTo(7.4, -34.6, 10.2, -35.8); ctx.stroke(); }
    else { ctx.fillStyle = FOX.ink; ctx.beginPath(); ctx.ellipse(7.4, -35.9, 2.2, speed > 520 ? 2.2 : 3, 0, 0, Math.PI * 2); ctx.fill(); ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.arc(8.2, -36.9, 0.95, 0, Math.PI * 2); ctx.fill(); ctx.strokeStyle = FOX.ink; ctx.lineWidth = 1.6; ctx.beginPath(); ctx.moveTo(3.9, -40.3); ctx.quadraticCurveTo(7.4, -41.6, 11, -40.2); ctx.stroke(); }
    ctx.lineCap = 'butt';
    /* near ear with gold crescent stud */
    ctx.save(); ctx.translate(3, -41.8); ctx.rotate(-0.10 - tailLag * 0.62); ctx.fillStyle = FOX.body; drawFoxEar(22, 7.2, 3 + tailLag * 5);
    ctx.fillStyle = FOX.gold; ctx.beginPath(); ctx.arc(1.8, -6.5, 1.7, 0, Math.PI * 2); ctx.fill(); ctx.restore();
    /* near arm pumping */
    ctx.save(); ctx.translate(3.6, -21.5); ctx.rotate(air ? 0.9 : run ? Math.sin(p + Math.PI) * 0.65 : -0.08 + Math.sin(t * 2.2) * 0.05); ctx.fillStyle = FOX.body; rr(-2.2, 0, 4.4, 10.5, 2.2); ctx.fill(); ctx.fillStyle = FOX.cream; ctx.beginPath(); ctx.arc(0, 11.2, 3.1, 0, Math.PI * 2); ctx.fill(); ctx.restore();
    /* gold crescent crest charm on a cord */
    ctx.strokeStyle = 'rgba(120,84,30,0.85)'; ctx.lineWidth = 1.2; ctx.beginPath(); ctx.arc(3.4, -25.2, 4.6, Math.PI * 0.15, Math.PI * 0.85); ctx.stroke();
    if (luncImg.complete && luncImg.naturalWidth) { ctx.save(); ctx.globalAlpha = 0.97; ctx.drawImage(luncImg, -0.6, -23.2, 8.4, 8.4); ctx.restore(); }
    else { ctx.save(); ctx.translate(3.6, -19); drawCrescentMark(0, 0, 3.9, FOX.gold); ctx.restore(); }
    ctx.restore();
  }
  ctx.restore();
  // soft shadow
  const sg = surfaceAt(zone, P.x);
  if (sg && P.mode !== 'loop') { const sh = Math.max(0, 1 - (sg.y - y) / 300); if (sh > 0.05) { ctx.fillStyle = `rgba(0,0,0,${0.3 * sh})`; ctx.beginPath(); ctx.ellipse(P.x, sg.y + 5, 15 * sh + 5, 4, 0, 0, Math.PI * 2); ctx.fill(); } }
}

function render(t, dt) {
  const theme = zone ? zone.theme : 0;
  const speedNow = P.mode === 'loop' ? P.ls : P.grounded ? Math.abs(P.g) : Math.hypot(P.vx, P.vy);
  const camLag = Math.max(0, Math.min(1, (speedNow - 380) / 480)) * (P.grounded || P.mode === 'loop' ? 0.018 : 0.010);
  drawSky(theme, t, camLag);
  ctx.setTransform(DPR, 0, 0, DPR, 0, 0); ctx.scale(ZOOM, ZOOM);
  if (state !== 'title') { const zx = FX.zoom || 1; ctx.translate(VIEWW / 2, VIEWH * 0.55); ctx.scale(zx, zx); ctx.translate(-VIEWW / 2, -VIEWH * 0.55); }
  ctx.translate(-camX, -camY);
  drawSilhouettes(theme, t);
  drawLoopBack(theme); drawCorkBack(theme); drawTunnelBack(theme);
  drawTerrain(theme, t);
  drawDecorBack(theme, t);
  drawCloudShadows(theme, t);
  for (const sp of zone.springs) if (sp.x > camX - 60 && sp.x < camX + VIEWW + 60) drawSpring(sp, theme);
  for (const c of zone.coins) { if (c.taken || c.x < camX - 40 || c.x > camX + VIEWW + 40) continue; drawCoinAt(c.x, c.y + Math.sin(t * 2.6 + c.x * 0.04) * 2.4, 13, t); }
  for (const s of zone.stars) { if (s.taken || s.x < camX - 40 || s.x > camX + VIEWW + 40) continue; drawStarAt(s.x, s.y, 15, t); }
  for (const c of dynCoins) { if (c.life < 0.7 && Math.floor(t * 12) % 2 === 0) continue; drawCoinAt(c.x, c.y - 6, 12, t); }
  for (const e of zone.enemies) { if (e.dead || e.x < camX - 70 || e.x > camX + VIEWW + 70) continue; drawEnemy(e, t); }
  drawPlayer(t, dt);
  drawLoopFront(theme); drawCorkFront(theme); drawTunnelFront(theme);
  drawAmbient(theme, t, dt);
  for (const p of particles) { ctx.globalAlpha = Math.max(0, p.life / p.max); ctx.fillStyle = p.color; if (p.star) { const sr = p.size * 1.7; ctx.beginPath(); ctx.moveTo(p.x, p.y - sr); ctx.lineTo(p.x + sr * 0.3, p.y - sr * 0.3); ctx.lineTo(p.x + sr, p.y); ctx.lineTo(p.x + sr * 0.3, p.y + sr * 0.3); ctx.lineTo(p.x, p.y + sr); ctx.lineTo(p.x - sr * 0.3, p.y + sr * 0.3); ctx.lineTo(p.x - sr, p.y); ctx.lineTo(p.x - sr * 0.3, p.y - sr * 0.3); ctx.closePath(); ctx.fill(); } else ctx.fillRect(p.x - p.size / 2, p.y - p.size / 2, p.size, p.size); }
  ctx.globalAlpha = 1;
  ctx.textAlign = 'center'; ctx.font = '900 17px Arial';
  for (const ft of texts) { ctx.globalAlpha = 1 - ft.t; ctx.fillStyle = ft.color; ctx.fillText(ft.txt, ft.x, ft.y); }
  ctx.globalAlpha = 1;
  drawForeground(theme, t);
  drawSpeedFX(theme, t);
}

/* ---------------- main loop ---------------- */
let lastT = 0;
function frame(tms) {
  requestAnimationFrame(frame);
  const t = tms / 1000;
  let dt = Math.min(0.033, lastT ? t - lastT : 0.016); lastT = t;
  titleT += dt;
  if (!paused) {
    if (state === 'play') {
      runTime += dt; zoneTime += dt;
      const n = Math.max(1, Math.ceil(dt / (1 / 240))), h = dt / n;
      for (let i = 0; i < n && state === 'play'; i++) step(h);
      if (state === 'play') updateWorld(dt);
      hud();
    } else if (state === 'clear') {
      clearT -= dt; updateWorld(dt);
      if (clearT <= 0) { if (zi + 1 >= ZONES.length) finishRun(); else { loadZone(zi + 1); state = 'play'; } }
    }
  }
  // camera
  if (state === 'title') {
    camX = 150 + Math.sin(titleT * 0.12) * 120;
    camY = 430 - VIEWH * 0.66;
  } else {
    const spdC = P.mode === 'loop' ? P.ls : P.grounded ? Math.abs(P.g) : Math.hypot(P.vx, P.vy);
    const sf = Math.max(0, Math.min(1, (spdC - 330) / 520));
    FX.lead += (((P.grounded ? P.g : P.vx) * 0.30) - FX.lead) * Math.min(1, dt * 3.2);
    FX.zoom += ((1 - sf * 0.085) - FX.zoom) * Math.min(1, dt * 2.6);
    let anchorX = 0.42, anchorY = 0.60;
    if (P.mode === 'loop' && P.loop) { anchorX = 0.5; anchorY = 0.52; const L2 = P.loop; camX += ((L2.cx - VIEWW * 0.5) - camX) * Math.min(1, dt * 2.4); }
    const tx = Math.max(0, Math.min(Math.max(0, zone.len - VIEWW), P.x - VIEWW * anchorX + FX.lead));
    const lo = -260, hi = Math.max(lo, 640 - VIEWH);
    const ty = Math.max(lo, Math.min(hi, P.y - VIEWH * anchorY));
    camX += (tx - camX) * Math.min(1, dt * 5);
    camY += (ty - camY) * Math.min(1, dt * 4);
    if (P.mode === 'loop' && P.loop) { const L3 = P.loop; camY += (((L3.gy - L3.r) - VIEWH * 0.52) - camY) * Math.min(1, dt * 2.2); }
  }
  render(t, dt);
  // apply shake inside next frame's render via cam jitter
  if (shake > 0) { camX += (Math.random() - 0.5) * shake * 0.4; camY += (Math.random() - 0.5) * shake * 0.4; }
}

/* ---------------- UI wiring ---------------- */
function applyLang() {
  $('tagline').textContent = T('tag');
  $('playBtn').textContent = T('play'); $('howBtn').textContent = T('how'); $('boardBtn').textContent = T('board');
  $('howTitle').textContent = T('howTitle'); $('howBody').innerHTML = T('howBody'); $('howClose').textContent = T('close');
  $('boardTitle').textContent = T('board'); $('tabAll').textContent = T('allTime'); $('tabWeek').textContent = T('week'); $('boardClose').textContent = T('close');
  $('pauseTitle').textContent = T('paused'); $('resumeBtn').textContent = T('resume'); $('quitBtn').textContent = T('quit');
  $('submitBtn').textContent = T('submit'); $('againBtn').textContent = T('again'); $('endBoardBtn').textContent = T('board');
  $('nameInput').placeholder = T('namePh');
  const cl = T('controls') + ': ' + (ctrlMode === 'stick' ? T('stick') : T('pad'));
  if ($('ctrlBtn')) $('ctrlBtn').textContent = cl;
  if ($('ctrlBtnP')) $('ctrlBtnP').textContent = cl;
  if (state === 'finish') $('endTitle').textContent = T('finish'); else if (state === 'over') $('endTitle').textContent = T('over');
}
const langSel = $('langSel');
LANGS.forEach(([code, label]) => { const o = document.createElement('option'); o.value = code; o.textContent = label; langSel.appendChild(o); });
langSel.value = LANG_CUR;
langSel.addEventListener('change', () => { LANG_CUR = langSel.value; try { localStorage.setItem('luncRushLang', LANG_CUR); } catch (e) {} applyLang(); if (!$('boardScreen').classList.contains('hidden')) renderBoard(); });

function prefillName() {
  const inp = $('nameInput');
  const tg = window.Telegram && window.Telegram.WebApp && window.Telegram.WebApp.initDataUnsafe;
  const tname = tg && tg.user && tg.user.first_name;
  let saved = ''; try { saved = localStorage.getItem('luncRushName') || ''; } catch (e) {}
  inp.value = (saved || tname || 'Guest').slice(0, 16);
}
let boardData = null, boardTab = 'all';
async function loadBoard() {
  $('boardList').innerHTML = '<p style="text-align:center;opacity:.8">' + T('loading') + '</p>';
  try { const r = await fetch('/api/luna-games?game=lunc-rush'); boardData = await r.json(); } catch (e) { boardData = null; }
  renderBoard();
}
function renderBoard() {
  $('tabAll').classList.toggle('on', boardTab === 'all'); $('tabWeek').classList.toggle('on', boardTab === 'week');
  const rows = boardData ? (boardData[boardTab] || []) : [];
  if (!rows.length) { $('boardList').innerHTML = '<p style="text-align:center;opacity:.8">' + T('noScores') + '</p>'; return; }
  $('boardList').innerHTML = rows.map((r, i) => `<div class="row"><span class="rk">${i + 1}.</span><span class="nm"></span><span class="sc">${r.score}</span></div>`).join('');
  [...$('boardList').querySelectorAll('.row .nm')].forEach((el, i) => { el.textContent = rows[i].name; });
}
function openBoard() { $('boardScreen').classList.remove('hidden'); boardTab = 'all'; loadBoard(); }
$('tabAll').onclick = () => { boardTab = 'all'; renderBoard(); };
$('tabWeek').onclick = () => { boardTab = 'week'; renderBoard(); };
$('boardClose').onclick = () => $('boardScreen').classList.add('hidden');
$('boardBtn').onclick = () => { audio(); openBoard(); };
$('endBoardBtn').onclick = () => { audio(); openBoard(); };
$('howBtn').onclick = () => { audio(); $('howScreen').classList.remove('hidden'); };
$('howClose').onclick = () => $('howScreen').classList.add('hidden');
$('playBtn').onclick = () => startRun();
$('againBtn').onclick = () => startRun();
$('submitBtn').onclick = async () => {
  const btn = $('submitBtn'); btn.disabled = true;
  const name = ($('nameInput').value.trim() || 'Guest').slice(0, 16);
  try { localStorage.setItem('luncRushName', name); } catch (e) {}
  $('submitStatus').textContent = T('loading');
  const initData = (window.Telegram && window.Telegram.WebApp && window.Telegram.WebApp.initData) || '';
  try {
    const r = await fetch('/api/luna-games?game=lunc-rush', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ initData, name, score, seconds: Math.max(1, Math.round(runTime)) }) });
    const d = await r.json();
    if (d && d.ok) { $('submitStatus').textContent = d.rank ? T('rank').replace('{n}', d.rank) : T('saved'); boardData = null; }
    else { $('submitStatus').textContent = '⚠ ' + (d && d.error ? d.error : 'error'); btn.disabled = false; }
  } catch (e) { $('submitStatus').textContent = '⚠ network'; btn.disabled = false; }
};
function togglePause() {
  if (state !== 'play' && state !== 'clear') return;
  paused = !paused;
  $('pauseScreen').classList.toggle('hidden', !paused);
}
$('pauseBtn').onclick = () => togglePause();
if ($('ctrlBtn')) $('ctrlBtn').onclick = () => toggleControls();
if ($('ctrlBtnP')) $('ctrlBtnP').onclick = () => toggleControls();
$('resumeBtn').onclick = () => togglePause();
$('quitBtn').onclick = () => {
  paused = false; $('pauseScreen').classList.add('hidden');
  state = 'title'; zone = freshZone(0); P.x = 70; const s = surfaceAt(zone, P.x); P.y = s ? s.y : 430; P.g = 0; P.vx = 0; P.vy = 0; P.grounded = true; P.mode = 'ground'; P.rolling = false; P.spin = false;
  $('hud').classList.add('hidden'); $('touch').classList.remove('on'); syncTouchUI(); $('endScreen').classList.add('hidden'); $('titleScreen').classList.remove('hidden'); $('langSel').classList.remove('hidden');
};
$('muteBtn').onclick = () => { muted = !muted; try { localStorage.setItem('luncRushMute', muted ? '1' : '0'); } catch (e) {} $('muteBtn').textContent = muted ? '🔇' : '🔊'; if (!muted) sfx.coin(0); };
document.addEventListener('visibilitychange', () => { if (document.hidden && state === 'play' && !paused) togglePause(); });

/* ---------------- boot + QA hook ---------------- */
zone = freshZone(0);
{ const s = surfaceAt(zone, P.x); if (s) P.y = s.y; }
$('muteBtn').textContent = muted ? '🔇' : '🔊';
if (!isTouch) { if ($('ctrlBtn')) $('ctrlBtn').style.display = 'none'; if ($('ctrlBtnP')) $('ctrlBtnP').style.display = 'none'; }
window.addEventListener('resize', () => { if (!stick.live) stickHome(); });
applyLang(); hud(); syncTouchUI();
requestAnimationFrame(frame);
window.__LR = {
  state() { const c = zone ? corkAt(zone, P.x) : null; return { state, paused, zone: zi, x: Math.round(P.x), y: Math.round(P.y), g: Math.round(P.g), vx: Math.round(P.vx), vy: Math.round(P.vy), mode: P.mode, grounded: P.grounded, rolling: P.rolling, spin: P.spin, coins: coinsHeld, stars: starsHeld, score, hearts, la: +P.la.toFixed(2), ls: Math.round(P.ls), cork: !!(c && P.grounded), beta: c ? +corkBeta(c, P.x).toFixed(2) : null, time: +runTime.toFixed(1), errs: window.__errs.slice(0, 5) }; },
  start(z) { startRun(); if (z) { loadZone(z); state = 'play'; } },
  warp(x) { P.x = x; const s = surfaceAt(zone, x); P.mode = 'ground'; P.loop = null; if (s) { P.y = s.y; P.grounded = true; P.vy = 0; } },
  setG(v) { P.g = v; },
  give(n) { coinsHeld += n; hud(); },
  hurt() { P.invuln = 0; hurt(); },
  key(k, v) { keys[k] = v; },
  jump() { pressJump(); },
  stick(x, down) { stick.x = x; stick.down = !!down; },
  stickState() { return { x: +stick.x.toFixed(2), down: stick.down, live: stick.live, mode: ctrlMode, zoneOn: $('stickZone') ? $('stickZone').classList.contains('on') : null, padVisible: (() => { const el = $('padLeft'); if (!el) return null; const r = el.getBoundingClientRect(); return r.width > 0 && r.height > 0; })() }; },
  setControls(m) { setControls(m); },
  controls() { return ctrlMode; },
  setLang(l) { if (I18N[l]) { LANG_CUR = l; langSel.value = l; applyLang(); } },
  zoneInfo() { return { len: zone.len, beacon: zone.beacon, par: zone.par, coins: zone.coins.length, stars: zone.stars.length, enemies: zone.enemies.length, springs: zone.springs.length, plats: zone.plats.length, loops: zone.loops, corks: zone.corks, killY: zone.killY }; },
};
