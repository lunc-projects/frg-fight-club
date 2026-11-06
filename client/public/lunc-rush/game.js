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
const G_STD = 2250, LOOP_MIN = 620, LOOP_G = 880;
function buildZones() {
  const Z = [];
  function mk(spans, o) { const z = Object.assign({ spans, coins: [], stars: [], enemies: [], springs: [], loops: [], corks: [], plats: [], beacon: 0, len: 0, par: 75, grav: G_STD, jump: 1000, ckpt: 0, theme: 0 }, o || {}); Z.push(z); return z; }
  function coinSurf(z, x0, x1, n, lift) { for (let i = 0; i < n; i++) { const x = n === 1 ? (x0 + x1) / 2 : x0 + (x1 - x0) * i / (n - 1); const s = surfaceAt(z, x); if (s) z.coins.push({ x, y: s.y - (lift || 32), taken: false }); } }
  function coinLine(z, x0, x1, y, n) { for (let i = 0; i < n; i++) { const x = n === 1 ? (x0 + x1) / 2 : x0 + (x1 - x0) * i / (n - 1); z.coins.push({ x, y, taken: false }); } }
  function loopCoins(z, L, n) { for (let i = 0; i < n; i++) { const a = (-35 - i * 26) * Math.PI / 180; z.coins.push({ x: L.cx + (L.r - 6) * Math.cos(a), y: (L.gy - L.r) + (L.r - 6) * Math.sin(a), taken: false }); } }
  function corkCoins(z, C, n) { for (let i = 0; i < n; i++) { const s = i / (n - 1), x = C.x0 + (C.x1 - C.x0) * s; const surf = surfaceAt(z, x); if (!surf) continue; const b = -Math.PI / 2 + s * C.turns * 2 * Math.PI; z.coins.push({ x, y: (surf.y - C.r) - C.r * Math.sin(b), taken: false, cork: C }); } }
  function star(z, x, y) { z.stars.push({ x, y, taken: false }); }
  function starSurf(z, x, lift) { const s = surfaceAt(z, x); if (s) star(z, x, s.y - (lift || 46)); }

  /* ===== ZONE 1 — Moonrise Coast ===== */
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
  ], { len: 6650, beacon: 6480, par: 70, theme: 0, ckpt: 3300 });
  z1.loops.push({ cx: 2050, r: 112, gy: 430 });
  z1.corks.push({ x0: 4860, x1: 5460, r: 62, turns: 1 });
  z1.springs.push({ x: 3460, y: 430, pow: 1090, anim: 0 });
  z1.plats.push({ x0: 3560, x1: 4360, y: 296 });
  z1.enemies.push({ type: 'candle', x: 3950, range: 46, sp: 26 }, { type: 'candle', x: 6120, range: 60, sp: 30 }, { type: 'drone', x: 2420, y0: 318, range: 70 }, { type: 'drone', x: 4180, y0: 306, range: 56 });
  coinSurf(z1, 150, 600, 6); coinSurf(z1, 720, 1040, 5); coinSurf(z1, 1200, 1700, 6);
  loopCoins(z1, z1.loops[0], 5);
  coinSurf(z1, 2820, 3240, 6, 40); coinLine(z1, 3640, 4280, 264, 7); coinSurf(z1, 4480, 4660, 3);
  corkCoins(z1, z1.corks[0], 9); coinSurf(z1, 5960, 6400, 6);
  star(z1, 4300, 252); starSurf(z1, 5540, 48); starSurf(z1, 3260, 54);

  /* ===== ZONE 2 — Validator City ===== */
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
  ], { len: 7020, beacon: 6880, par: 80, theme: 1, ckpt: 3100 });
  z2.loops.push({ cx: 3420, r: 116, gy: 430 });
  z2.corks.push({ x0: 4900, x1: 5420, r: 60, turns: 1 });
  z2.springs.push({ x: 3900, y: 430, pow: 1070, anim: 0 });
  z2.plats.push({ x0: 4020, x1: 4720, y: 292 });
  z2.enemies.push({ type: 'drone', x: 1560, y0: 252, range: 80 }, { type: 'candle', x: 2300, range: 52, sp: 28 }, { type: 'candle', x: 3650, range: 40, sp: 24 }, { type: 'candle', x: 6520, range: 64, sp: 32 }, { type: 'drone', x: 5960, y0: 322, range: 60 });
  coinSurf(z2, 140, 740, 7); coinSurf(z2, 1330, 1840, 6); coinSurf(z2, 2060, 2540, 6);
  coinSurf(z2, 2680, 3000, 4); loopCoins(z2, z2.loops[0], 5); coinLine(z2, 4100, 4640, 260, 6);
  corkCoins(z2, z2.corks[0], 8); coinSurf(z2, 5840, 6140, 4); coinSurf(z2, 6300, 6820, 6);
  starSurf(z2, 2540, 48); star(z2, 4620, 248); starSurf(z2, 6330, 48);

  /* ===== ZONE 3 — Orbit Station ===== */
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
  ], { len: 7220, beacon: 7060, par: 90, theme: 2, grav: 1500, jump: 905, ckpt: 3300 });
  z3.loops.push({ cx: 3560, r: 122, gy: 430 });
  z3.corks.push({ x0: 5060, x1: 5660, r: 66, turns: 1 });
  z3.springs.push({ x: 4060, y: 430, pow: 1000, anim: 0 });
  z3.plats.push({ x0: 4180, x1: 4920, y: 288 });
  z3.enemies.push({ type: 'drone', x: 2300, y0: 232, range: 74 }, { type: 'drone', x: 2560, y0: 268, range: 50 }, { type: 'candle', x: 3980, range: 44, sp: 26 }, { type: 'candle', x: 6620, range: 58, sp: 30 }, { type: 'drone', x: 6120, y0: 330, range: 66 });
  coinSurf(z3, 140, 840, 8); coinSurf(z3, 980, 1420, 6, 42); coinSurf(z3, 2080, 2640, 6);
  coinSurf(z3, 2780, 3140, 4); loopCoins(z3, z3.loops[0], 5); coinLine(z3, 4260, 4840, 256, 6);
  corkCoins(z3, z3.corks[0], 9); coinSurf(z3, 6380, 6980, 7);
  starSurf(z3, 1200, 52); star(z3, 4820, 244); starSurf(z3, 5740, 48);
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
  zoneTime = 0; dynCoins = []; particles = []; texts = [];
  camX = 0; camY = Math.max(-260, Math.min(P.y - VIEWH * 0.6, Math.max(-260, 640 - VIEWH)));
  showZoneBanner(T('zone' + (i + 1)), T('go'));
}
function startRun() {
  score = 0; coinsHeld = 0; starsHeld = 0; hearts = 3; bonusTotal = 0; runTime = 0;
  loadZone(0); state = 'play'; paused = false;
  $('titleScreen').classList.add('hidden'); $('endScreen').classList.add('hidden'); $('pauseScreen').classList.add('hidden');
  $('langSel').classList.add('hidden');
  $('hud').classList.remove('hidden'); if (isTouch) $('touch').classList.add('on');
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
const ACC = 1450, BRAKE = 2800, FRIC = 1050, ROLLFRIC = 95, AIRACC = 780, MAXG = 1320;
function doJump() {
  const z = zone, JV = z.jump;
  P.vx = P.g * Math.cos(P.ang) + JV * Math.sin(P.ang);
  P.vy = P.g * Math.sin(P.ang) - JV * Math.cos(P.ang);
  P.spin = P.rolling || Math.abs(P.g) > 260;
  P.grounded = false; P.onPlat = null; P.mode = 'air'; P.cut = false; P.coyote = 0;
  sfx.jump();
}
function landOn(surfY, ang, plat) {
  const z = zone;
  if (plat) { P.g = P.vx; P.ang = 0; } else { P.g = P.vx * Math.cos(ang) + P.vy * Math.sin(ang); P.ang = ang; }
  P.y = surfY; P.grounded = true; P.onPlat = plat || null; P.mode = 'ground'; P.vy = 0;
  if (P.spin && Math.abs(P.g) > 95) { P.rolling = true; }
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
      let acc = 0; const dir = (keys.right ? 1 : 0) - (keys.left ? 1 : 0);
      if (!P.rolling && dir !== 0) acc += dir * (Math.sign(dir) !== Math.sign(P.g) && P.g !== 0 ? BRAKE : ACC);
      P.g += acc * dt;
      if (!P.rolling && dir === 0) P.g = approach(P.g, 0, FRIC * dt);
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
        const dir = (keys.right ? 1 : 0) - (keys.left ? 1 : 0);
        if (P.rolling && dir !== 0 && Math.sign(dir) !== Math.sign(P.g) && Math.abs(P.g) < 300) P.rolling = false;
        if (!P.rolling && keys.down && Math.abs(P.g) > 70) { P.rolling = true; sfx.roll(); }
        let acc = Math.sin(P.ang) * G * (P.rolling ? 1.55 : 1.0);
        if (P.rolling) acc += -Math.sign(P.g) * ROLLFRIC;
        else if (dir !== 0) acc += dir * (Math.sign(dir) !== Math.sign(P.g) && P.g !== 0 ? BRAKE : ACC);
        P.g += acc * dt;
        if (!P.rolling && dir === 0 && Math.abs(Math.sin(P.ang)) < 0.045) P.g = approach(P.g, 0, FRIC * dt);
        if (Math.abs(P.g) > 980) P.g -= P.g * 0.22 * dt;
        if (P.g > MAXG) P.g = MAXG; if (P.g < -MAXG) P.g = -MAXG;
        if (P.g !== 0) P.facing = Math.sign(P.g);
        P.x += Math.cos(P.ang) * P.g * dt;
        const s2 = surfaceAt(z, P.x);
        if (!s2) { P.grounded = false; P.mode = 'air'; P.vx = Math.cos(P.ang) * P.g; P.vy = Math.sin(P.ang) * P.g; P.spin = P.rolling; }
        else { P.y = s2.y; P.ang = s2.ang; }
        if (P.rolling && Math.abs(P.g) < 55 && !keys.down) P.rolling = false;
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
    const dir = (keys.right ? 1 : 0) - (keys.left ? 1 : 0);
    P.vx += dir * AIRACC * dt; if (P.vx > 1180) P.vx = 1180; if (P.vx < -1180) P.vx = -1180;
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
      P.grounded = false; P.onPlat = null; P.mode = 'air'; P.vy = -sp.pow; P.vx = Math.max(P.vx, P.g * 0.6, 240); P.spin = false; sp.anim = 1; sfx.spring();
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
}
function approach(v, target, stepAmt) { return v < target ? Math.min(v + stepAmt, target) : Math.max(v - stepAmt, target); }

function burst(x, y, n, color) { for (let i = 0; i < n; i++) { const a = Math.random() * Math.PI * 2, sp = 60 + Math.random() * 260; particles.push({ x, y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp - 60, life: 0.5 + Math.random() * 0.3, max: 0.8, color, size: 2 + Math.random() * 3, grav: 300 }); } }
function floatText(x, y, txt, color) { texts.push({ x, y, txt, color: color || '#ffe066', t: 0 }); }

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
  P.x = P.respawnX; const s = surfaceAt(zone, P.x); P.y = s ? s.y : 430;
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
  $('touch').classList.remove('on'); $('langSel').classList.remove('hidden');
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
        e.dead = true; score += 100; sfx.smash(); burst(ecx, ecy, 12, e.type === 'candle' ? '#ff6b5e' : '#9fc2ff');
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
  // speed streaks
  if (state === 'play' && P.mode !== 'loop' && Math.abs(P.g || P.vx) > 860 && Math.random() < 0.5) {
    particles.push({ x: P.x - P.facing * 20, y: P.y - 14 - Math.random() * 18, vx: -P.facing * 300, vy: 0, life: 0.22, max: 0.22, color: 'rgba(255,240,200,0.7)', size: 2, grav: 0 });
  }
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
function drawSky(theme, t) {
  ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
  let g;
  if (theme === 0) { g = ctx.createLinearGradient(0, 0, 0, CH); g.addColorStop(0, '#1b2350'); g.addColorStop(0.45, '#4a2c6d'); g.addColorStop(0.75, '#b5506e'); g.addColorStop(1, '#e8865a'); }
  else if (theme === 1) { g = ctx.createLinearGradient(0, 0, 0, CH); g.addColorStop(0, '#050914'); g.addColorStop(0.7, '#0d1836'); g.addColorStop(1, '#16224d'); }
  else { g = ctx.createLinearGradient(0, 0, 0, CH); g.addColorStop(0, '#01020a'); g.addColorStop(1, '#0a1030'); }
  ctx.fillStyle = g; ctx.fillRect(0, 0, CW, CH);
  if (theme === 1 || theme === 2) { // stars
    ctx.fillStyle = '#ffffff';
    for (let i = 0; i < 90; i++) { const sx = ((hash(i * 3.1) * 1600 - camX * 0.06) % (CW + 40) + CW + 40) % (CW + 40) - 20; const sy = hash(i * 7.7) * CH * 0.7; const tw = 0.35 + 0.65 * Math.abs(Math.sin(t * 1.4 + i)); ctx.globalAlpha = 0.75 * tw; const r = hash(i) > 0.85 ? 2 : 1.2; ctx.fillRect(sx, sy, r, r); }
    ctx.globalAlpha = 1;
  }
  if (theme === 0) { // rising moon + sea sparkle band
    const mx = CW * 0.74 - camX * 0.03 % 60, my = CH * 0.30;
    const mg = ctx.createRadialGradient(mx, my, 10, mx, my, 150); mg.addColorStop(0, 'rgba(255,244,200,0.55)'); mg.addColorStop(1, 'rgba(255,244,200,0)');
    ctx.fillStyle = mg; ctx.fillRect(mx - 160, my - 160, 320, 320);
    ctx.fillStyle = '#fdf3c9'; ctx.beginPath(); ctx.arc(mx, my, 46, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = 'rgba(214,186,128,0.28)'; ctx.beginPath(); ctx.arc(mx - 15, my - 9, 7, 0, Math.PI * 2); ctx.fill();
    ctx.beginPath(); ctx.arc(mx + 17, my + 15, 5, 0, Math.PI * 2); ctx.fill();
    ctx.beginPath(); ctx.arc(mx + 9, my - 21, 4, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#f7b267'; ctx.beginPath(); ctx.arc(CW * 0.16 - camX * 0.02 % 40, CH * 0.62, 30, 0, Math.PI * 2); ctx.fill();
  }
  if (theme === 2) { // Earth + moon backdrop
    const ex = CW * 0.78 - camX * 0.04 % 80, ey = CH * 0.30;
    const eg = ctx.createRadialGradient(ex, ey, 20, ex, ey, 190); eg.addColorStop(0, 'rgba(90,160,255,0.4)'); eg.addColorStop(1, 'rgba(90,160,255,0)');
    ctx.fillStyle = eg; ctx.fillRect(ex - 200, ey - 200, 400, 400);
    ctx.fillStyle = '#2d6fd0'; ctx.beginPath(); ctx.arc(ex, ey, 62, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#39b06a'; ctx.beginPath(); ctx.arc(ex - 20, ey - 14, 20, 0, Math.PI * 2); ctx.arc(ex + 24, ey + 20, 15, 0, Math.PI * 2); ctx.arc(ex + 6, ey - 30, 11, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = 'rgba(255,255,255,0.75)'; ctx.beginPath(); ctx.arc(ex - 34, ey + 26, 10, 0, Math.PI * 2); ctx.arc(ex + 30, ey - 6, 8, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#e9e2cc'; ctx.beginPath(); ctx.arc(CW * 0.14, CH * 0.2, 24, 0, Math.PI * 2); ctx.fill();
  }
}
function drawSilhouettes(theme) {
  // mid parallax layer, drawn in world transform with its own camera factor
  if (theme === 0) {
    ctx.fillStyle = 'rgba(46,26,66,0.85)';
    ctx.beginPath(); ctx.moveTo(camX - 60, 620);
    for (let x = camX - 60; x < camX + VIEWW + 60; x += 30) { const wx = x + camX * 0.55; const y = 470 - Math.sin(wx * 0.004) * 60 - Math.sin(wx * 0.013) * 22; ctx.lineTo(x, y); }
    ctx.lineTo(camX + VIEWW + 60, 620); ctx.closePath(); ctx.fill();
    // sea
    ctx.fillStyle = 'rgba(30,40,90,0.55)'; ctx.fillRect(camX - 60, 520, VIEWW + 120, 300);
    ctx.strokeStyle = 'rgba(255,210,120,0.35)'; ctx.lineWidth = 2; ctx.beginPath();
    for (let i = 0; i < 12; i++) { const y = 528 + i * 16; const off = Math.sin(titleT * 1.3 + i * 2.2) * 14; ctx.moveTo(camX + ((i * 173 + off) % (VIEWW)), y); ctx.lineTo(camX + ((i * 173 + off) % VIEWW) + 60, y); }
    ctx.stroke();
  } else if (theme === 1) {
    for (const [f, col, hBase] of [[0.35, 'rgba(16,24,58,0.9)', 210], [0.6, 'rgba(10,15,38,0.95)', 300]]) {
      const bw = 190;
      const startI = Math.floor((camX * f) / bw) - 1, endI = startI + Math.ceil(VIEWW / bw) + 3;
      ctx.fillStyle = col;
      for (let i = startI; i < endI; i++) {
        const bx = i * bw - camX * f + camX, bh = hBase + hash(i * 1.7) * 130;
        ctx.fillRect(bx, 560 - bh, bw - 26, bh + 200);
        ctx.fillStyle = 'rgba(255,214,110,0.75)';
        for (let wy = 0; wy < 6; wy++) for (let wx = 0; wx < 4; wx++) if (hash(i * 31 + wy * 7 + wx * 13) > 0.55) ctx.fillRect(bx + 14 + wx * 38, 560 - bh + 16 + wy * 34, 15, 10);
        ctx.fillStyle = col;
      }
    }
    // neon signs in world space
    const signs = [[1050, 268, 'LUNC', '#ffd23e'], [2280, 283, 'USTC', '#5ea0ff'], [3350, 300, 'VALIDATOR', '#ff7ad9'], [4700, 258, 'BLOCK 31160', '#7CFC98'], [6000, 330, 'LUNA CLASSIC', '#ffd23e']];
    ctx.textAlign = 'center'; ctx.font = '900 21px Arial';
    for (const [sx, sy, txt, col] of signs) { if (sx < camX - 200 || sx > camX + VIEWW + 200) continue; ctx.shadowColor = col; ctx.shadowBlur = 16; ctx.fillStyle = col; ctx.fillText(txt, sx, sy); ctx.shadowBlur = 0; }
  } else {
    ctx.strokeStyle = 'rgba(90,110,180,0.5)'; ctx.lineWidth = 5;
    for (let i = 0; i < 8; i++) { const bx = Math.floor((camX * 0.4) / 420) * 420 + i * 420 - camX * 0.4 + camX; ctx.beginPath(); ctx.moveTo(bx, 150); ctx.lineTo(bx + 200, 300); ctx.lineTo(bx, 450); ctx.stroke(); }
    ctx.fillStyle = 'rgba(20,30,70,0.8)';
    for (let i = 0; i < 6; i++) { const bx = Math.floor((camX * 0.55) / 520) * 520 + i * 520 - camX * 0.55 + camX; ctx.fillRect(bx, 470 + Math.sin(i * 3) * 14, 300, 16); }
  }
}
function drawTerrain(theme) {
  const x0 = camX - 70, x1 = camX + VIEWW + 70;
  // ground body
  ctx.beginPath();
  let pen = false;
  for (let x = x0; x <= x1; x += 12) { const s = surfaceAt(zone, x); if (!s) { pen = false; continue; } if (!pen) { ctx.moveTo(x, s.y); pen = true; } else ctx.lineTo(x, s.y); }
  ctx.lineTo(x1, 2600); ctx.lineTo(x0, 2600); ctx.closePath();
  const g = ctx.createLinearGradient(0, 240, 0, 640);
  if (theme === 0) { g.addColorStop(0, '#7a5230'); g.addColorStop(0.12, '#5d3d24'); g.addColorStop(1, '#2c1c12'); }
  else if (theme === 1) { g.addColorStop(0, '#2b3350'); g.addColorStop(0.1, '#1c2338'); g.addColorStop(1, '#0a0e20'); }
  else { g.addColorStop(0, '#4a5878'); g.addColorStop(0.1, '#2e3852'); g.addColorStop(1, '#121828'); }
  ctx.fillStyle = g; ctx.fill();
  // underground strata (tall portrait views read as a cross-section, not void)
  ctx.save(); ctx.clip();
  ctx.fillStyle = 'rgba(0,0,0,0.16)';
  for (let y = 580; y < 2600; y += 120) ctx.fillRect(x0, y, x1 - x0, 10);
  ctx.fillStyle = 'rgba(255,255,255,0.05)';
  for (let x = Math.floor(x0 / 130) * 130; x < x1; x += 130) for (let y = 640; y < 1500; y += 170) { if (hash(x * 0.37 + y) > 0.45) ctx.fillRect(x + hash(y) * 50, y, 16, 7); }
  ctx.restore();
  // surface strip
  ctx.beginPath(); pen = false;
  for (let x = x0; x <= x1; x += 10) { const s = surfaceAt(zone, x); if (!s) { pen = false; continue; } if (!pen) { ctx.moveTo(x, s.y); pen = true; } else ctx.lineTo(x, s.y); }
  ctx.strokeStyle = theme === 0 ? '#d9a05a' : theme === 1 ? '#8fa2ff' : '#aebfe8'; ctx.lineWidth = 5; ctx.stroke();
  ctx.strokeStyle = theme === 0 ? 'rgba(255,230,160,0.8)' : 'rgba(255,255,255,0.35)'; ctx.lineWidth = 2; ctx.stroke();
  // rivets / panel marks on station + city
  if (theme !== 0) { ctx.fillStyle = 'rgba(255,255,255,0.18)'; for (let x = Math.floor(x0 / 90) * 90; x < x1; x += 90) { const s = surfaceAt(zone, x); if (s) ctx.fillRect(x, s.y + 14, 4, 4); } }
  // platforms
  for (const pl of zone.plats) {
    if (pl.x1 < x0 || pl.x0 > x1) continue;
    if (theme === 0) { ctx.fillStyle = '#8a5a2b'; ctx.fillRect(pl.x0, pl.y, pl.x1 - pl.x0, 14); ctx.fillStyle = '#c98d45'; ctx.fillRect(pl.x0, pl.y, pl.x1 - pl.x0, 5); ctx.fillStyle = 'rgba(0,0,0,0.3)'; for (let x = pl.x0 + 30; x < pl.x1; x += 60) ctx.fillRect(x, pl.y + 14, 7, 44); }
    else if (theme === 1) { ctx.fillStyle = '#232c4e'; ctx.fillRect(pl.x0, pl.y, pl.x1 - pl.x0, 16); ctx.fillStyle = '#ffd23e'; ctx.fillRect(pl.x0, pl.y, pl.x1 - pl.x0, 4); }
    else { ctx.fillStyle = '#5a6c96'; ctx.fillRect(pl.x0, pl.y, pl.x1 - pl.x0, 13); ctx.fillStyle = '#d7e3ff'; ctx.fillRect(pl.x0, pl.y, pl.x1 - pl.x0, 4); ctx.fillStyle = 'rgba(255,255,255,0.3)'; for (let x = pl.x0 + 22; x < pl.x1; x += 52) ctx.fillRect(x, pl.y + 7, 5, 4); }
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
function loopColors(theme) { return theme === 0 ? ['#8a5a2b', '#d9a05a'] : theme === 1 ? ['#123a5e', '#2fd4ff'] : ['#39496e', '#aebfe8']; }
function drawLoopBack(theme) {
  const [dark] = loopColors(theme);
  for (const L of zone.loops) {
    if (L.cx + L.r < camX - 80 || L.cx - L.r > camX + VIEWW + 80) continue;
    ctx.strokeStyle = 'rgba(0,0,0,0.35)'; ctx.lineWidth = 7; ctx.beginPath(); ctx.moveTo(L.cx - L.r - 16, L.gy + 4); ctx.lineTo(L.cx - L.r * 0.34, L.gy - L.r * 0.94); ctx.moveTo(L.cx + L.r + 16, L.gy + 4); ctx.lineTo(L.cx + L.r * 0.34, L.gy - L.r * 0.94); ctx.stroke();
    ctx.strokeStyle = dark; ctx.lineWidth = 30; ctx.beginPath(); ctx.arc(L.cx, L.gy - L.r, L.r, 0, Math.PI * 2); ctx.stroke();
  }
}
function drawLoopFront(theme) {
  const [, lite] = loopColors(theme);
  for (const L of zone.loops) {
    if (L.cx + L.r < camX - 80 || L.cx - L.r > camX + VIEWW + 80) continue;
    ctx.strokeStyle = lite; ctx.lineWidth = 30; ctx.beginPath(); ctx.arc(L.cx, L.gy - L.r, L.r, 1.66, 3.05); ctx.stroke();
    ctx.strokeStyle = 'rgba(255,255,255,0.5)'; ctx.lineWidth = 3; ctx.beginPath(); ctx.arc(L.cx, L.gy - L.r, L.r - 13, 1.66, 3.05); ctx.stroke();
    if (theme === 2) { ctx.fillStyle = '#ffd23e'; for (let a = 0; a < Math.PI * 2; a += Math.PI / 6) { ctx.beginPath(); ctx.arc(L.cx + L.r * Math.cos(a), (L.gy - L.r) + L.r * Math.sin(a), 3.4, 0, Math.PI * 2); ctx.fill(); } }
  }
}
function drawCorkBack(theme) {
  for (const C of zone.corks) {
    if (C.x1 < camX - 60 || C.x0 > camX + VIEWW + 60) continue;
    const col = theme === 0 ? 'rgba(120,72,32,0.9)' : theme === 1 ? 'rgba(24,60,110,0.9)' : 'rgba(52,66,102,0.9)';
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
    const col = theme === 0 ? '#d9a05a' : theme === 1 ? '#2fd4ff' : '#aebfe8';
    ctx.strokeStyle = col; ctx.lineWidth = 9; ctx.beginPath();
    for (let s = 0; s <= 1.001; s += 0.04) { const x = C.x0 + (C.x1 - C.x0) * s; const sf = surfaceAt(zone, x); if (!sf) continue; const b = -Math.PI / 2 + s * C.turns * 2 * Math.PI; const y = (sf.y - C.r) - C.r * Math.sin(b); s === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y); }
    ctx.stroke();
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
}
function drawStarAt(x, y, r, t) {
  ctx.save(); ctx.translate(x, y + Math.sin(t * 2.4 + x * 0.03) * 3); ctx.rotate(Math.sin(t * 1.8 + x * 0.02) * 0.2);
  ctx.shadowColor = '#5ea0ff'; ctx.shadowBlur = 13;
  ctx.fillStyle = '#3f8cff'; ctx.beginPath();
  for (let i = 0; i < 10; i++) { const a = -Math.PI / 2 + i * Math.PI / 5; const rr = i % 2 === 0 ? r : r * 0.45; const px = Math.cos(a) * rr, py = Math.sin(a) * rr; i === 0 ? ctx.moveTo(px, py) : ctx.lineTo(px, py); }
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
    ctx.fillStyle = '#dfe6ff'; ctx.beginPath(); ctx.moveTo(0, -12); ctx.lineTo(30, 8); ctx.lineTo(4, 6); ctx.lineTo(-2, 14); ctx.lineTo(-8, 4); ctx.lineTo(-28, 6); ctx.closePath(); ctx.fill();
    ctx.fillStyle = '#9fc2ff'; ctx.beginPath(); ctx.moveTo(0, -12); ctx.lineTo(30, 8); ctx.lineTo(4, 6); ctx.closePath(); ctx.fill();
    ctx.fillStyle = '#ff5964'; ctx.beginPath(); ctx.arc(3, -2, 3.4, 0, Math.PI * 2); ctx.fill();
    ctx.restore();
    ctx.strokeStyle = 'rgba(159,194,255,0.4)'; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(x - 18, y + 16 + Math.sin(t * 6) * 2); ctx.lineTo(x + 18, y + 16 + Math.cos(t * 5) * 2); ctx.stroke();
  }
}
let spinAng = 0;
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
  ctx.save(); ctx.translate(x, y); ctx.rotate(rot); if (blink) ctx.globalAlpha = 0.35;
  const ball = P.rolling || P.spin || P.mode === 'loop';
  // comet tail (behind, opposite facing)
  const tlen = Math.min(64, 12 + speed * 0.055) * (1 + Math.sin(t * 31) * 0.08);
  if (speed > 130 && !ball) {
    const tg = ctx.createLinearGradient(-P.facing * 14, -16, -P.facing * (14 + tlen), -16); tg.addColorStop(0, 'rgba(255,150,50,0.85)'); tg.addColorStop(0.5, 'rgba(255,90,40,0.4)'); tg.addColorStop(1, 'rgba(255,90,40,0)');
    ctx.fillStyle = tg; ctx.beginPath(); ctx.moveTo(-P.facing * 12, -24); ctx.lineTo(-P.facing * (14 + tlen), -15 + Math.sin(t * 24) * 2.4); ctx.lineTo(-P.facing * 12, -8); ctx.closePath(); ctx.fill();
  }
  if (ball) {
    const bg = ctx.createRadialGradient(-5, -22, 3, 0, -16, 17); bg.addColorStop(0, '#fff8e2'); bg.addColorStop(0.7, '#eed9a4'); bg.addColorStop(1, '#c9a95e');
    ctx.fillStyle = bg; ctx.beginPath(); ctx.arc(0, -16, 15.5, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = 'rgba(156,109,14,0.65)'; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(0, -16, 15.5, 0, Math.PI * 2); ctx.stroke();
    ctx.strokeStyle = 'rgba(160,120,40,0.8)'; ctx.lineWidth = 2.6; ctx.beginPath(); ctx.arc(0, -16, 9.5, t * 2 % 6.28, t * 2 % 6.28 + 3.6); ctx.stroke();
    if (luncImg.complete && luncImg.naturalWidth) { ctx.save(); ctx.globalAlpha = 0.92; ctx.drawImage(luncImg, -8.5, -24.5, 17, 17); ctx.restore(); }
    // tail sparks in ball form
    if (speed > 200) { ctx.fillStyle = 'rgba(255,150,50,0.75)'; ctx.beginPath(); ctx.moveTo(-P.facing * 14, -22); ctx.lineTo(-P.facing * (16 + tlen * 0.7), -15); ctx.lineTo(-P.facing * 14, -9); ctx.closePath(); ctx.fill(); }
  } else {
    // shoes
    const run = P.grounded && Math.abs(P.g) > 30;
    const ph = run ? Math.sin(P.runPhase) * 6 : 0;
    ctx.fillStyle = '#26336e';
    ctx.beginPath(); ctx.ellipse(P.facing * 3 + ph * 0.5, -2.5, 8, 4.4, 0, 0, Math.PI * 2); ctx.fill();
    ctx.beginPath(); ctx.ellipse(P.facing * 3 - ph * 0.5, -2.5, 8, 4.4, 0, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#ffd23e'; ctx.fillRect(P.facing * 3 + ph * 0.5 - 8, -4.6, 16, 2.2); ctx.fillRect(P.facing * 3 - ph * 0.5 - 8, -4.6, 16, 2.2);
    // body
    const bg2 = ctx.createRadialGradient(-5, -26, 4, 0, -18, 19); bg2.addColorStop(0, '#fffaf0'); bg2.addColorStop(0.65, '#f3e3b8'); bg2.addColorStop(1, '#d9bf85');
    ctx.fillStyle = bg2; ctx.beginPath(); ctx.arc(0, -18, 16.5, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = 'rgba(156,109,14,0.5)'; ctx.lineWidth = 1.6; ctx.stroke();
    // gold crescent crest
    ctx.save(); ctx.translate(P.facing * 2, -33); ctx.rotate(P.facing * 0.5);
    if (luncImg.complete && luncImg.naturalWidth) ctx.drawImage(luncImg, -10, -10, 20, 20);
    else { ctx.fillStyle = '#f5b921'; ctx.beginPath(); ctx.arc(0, 0, 8, 0, Math.PI * 2); ctx.fill(); ctx.fillStyle = '#f3e3b8'; ctx.beginPath(); ctx.arc(3.4, -2, 6.6, 0, Math.PI * 2); ctx.fill(); }
    ctx.restore();
    // face: determined eye + brow
    ctx.fillStyle = '#20203a'; ctx.beginPath(); ctx.arc(P.facing * 8, -19, 2.9, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.arc(P.facing * 8 + 1, -20, 1.1, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = '#20203a'; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(P.facing * 3.4, -25.4); ctx.lineTo(P.facing * 11, -23.8); ctx.stroke();
    ctx.strokeStyle = 'rgba(32,32,58,0.85)'; ctx.lineWidth = 1.8; ctx.beginPath(); ctx.arc(P.facing * 5, -11, 4.4, 0.15 * Math.PI, 0.62 * Math.PI); ctx.stroke();
  }
  ctx.restore();
  // soft shadow
  const sg = surfaceAt(zone, P.x);
  if (sg && P.mode !== 'loop') { const sh = Math.max(0, 1 - (sg.y - y) / 300); if (sh > 0.05) { ctx.fillStyle = `rgba(0,0,0,${0.3 * sh})`; ctx.beginPath(); ctx.ellipse(P.x, sg.y + 5, 15 * sh + 5, 4, 0, 0, Math.PI * 2); ctx.fill(); } }
}
function render(t, dt) {
  const theme = zone ? zone.theme : 0;
  drawSky(theme, t);
  ctx.setTransform(DPR, 0, 0, DPR, 0, 0); ctx.scale(ZOOM, ZOOM); ctx.translate(-camX, -camY);
  drawSilhouettes(theme);
  drawLoopBack(theme); drawCorkBack(theme);
  drawTerrain(theme);
  for (const sp of zone.springs) if (sp.x > camX - 60 && sp.x < camX + VIEWW + 60) drawSpring(sp, theme);
  for (const c of zone.coins) { if (c.taken || c.x < camX - 40 || c.x > camX + VIEWW + 40) continue; drawCoinAt(c.x, c.y + Math.sin(t * 2.6 + c.x * 0.04) * 2.4, 13, t); }
  for (const s of zone.stars) { if (s.taken || s.x < camX - 40 || s.x > camX + VIEWW + 40) continue; drawStarAt(s.x, s.y, 15, t); }
  for (const c of dynCoins) { if (c.life < 0.7 && Math.floor(t * 12) % 2 === 0) continue; drawCoinAt(c.x, c.y - 6, 12, t); }
  for (const e of zone.enemies) { if (e.dead || e.x < camX - 70 || e.x > camX + VIEWW + 70) continue; drawEnemy(e, t); }
  drawPlayer(t, dt);
  drawLoopFront(theme); drawCorkFront(theme);
  for (const p of particles) { ctx.globalAlpha = Math.max(0, p.life / p.max); ctx.fillStyle = p.color; ctx.fillRect(p.x - p.size / 2, p.y - p.size / 2, p.size, p.size); }
  ctx.globalAlpha = 1;
  ctx.textAlign = 'center'; ctx.font = '900 17px Arial';
  for (const ft of texts) { ctx.globalAlpha = 1 - ft.t; ctx.fillStyle = ft.color; ctx.fillText(ft.txt, ft.x, ft.y); }
  ctx.globalAlpha = 1;
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
    const look = (P.grounded ? P.g : P.vx) * 0.15;
    const tx = Math.max(0, Math.min(Math.max(0, zone.len - VIEWW), P.x - VIEWW * 0.42 + look));
    const lo = -260, hi = Math.max(lo, 640 - VIEWH);
    const ty = Math.max(lo, Math.min(hi, P.y - VIEWH * 0.60));
    camX += (tx - camX) * Math.min(1, dt * 5);
    camY += (ty - camY) * Math.min(1, dt * 4);
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
$('resumeBtn').onclick = () => togglePause();
$('quitBtn').onclick = () => {
  paused = false; $('pauseScreen').classList.add('hidden');
  state = 'title'; zone = freshZone(0); P.x = 70; const s = surfaceAt(zone, P.x); P.y = s ? s.y : 430; P.g = 0; P.vx = 0; P.vy = 0; P.grounded = true; P.mode = 'ground'; P.rolling = false; P.spin = false;
  $('hud').classList.add('hidden'); $('touch').classList.remove('on'); $('endScreen').classList.add('hidden'); $('titleScreen').classList.remove('hidden'); $('langSel').classList.remove('hidden');
};
$('muteBtn').onclick = () => { muted = !muted; try { localStorage.setItem('luncRushMute', muted ? '1' : '0'); } catch (e) {} $('muteBtn').textContent = muted ? '🔇' : '🔊'; if (!muted) sfx.coin(0); };
document.addEventListener('visibilitychange', () => { if (document.hidden && state === 'play' && !paused) togglePause(); });

/* ---------------- boot + QA hook ---------------- */
zone = freshZone(0);
{ const s = surfaceAt(zone, P.x); if (s) P.y = s.y; }
$('muteBtn').textContent = muted ? '🔇' : '🔊';
applyLang(); hud();
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
  setLang(l) { if (I18N[l]) { LANG_CUR = l; langSel.value = l; applyLang(); } },
  zoneInfo() { return { len: zone.len, beacon: zone.beacon, loops: zone.loops, corks: zone.corks, killY: zone.killY }; },
};
