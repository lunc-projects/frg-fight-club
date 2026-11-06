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
  P.y = surfY; P.grounded = true; P.onPlat = plat || null; P.mode = 'ground'; P.vy = 0;
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
      P.grounded = false; P.onPlat = null; P.mode = 'air'; P.vy = -sp.pow; P.vx = Math.max(P.vx, P.g * 0.6, 173); P.spin = false; sp.anim = 1; sfx.spring();
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
  if (state === 'play' && P.mode !== 'loop' && Math.abs(P.g || P.vx) > 528 && Math.random() < 0.5) {
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
function rr(x, y, w, h, r) { ctx.beginPath(); ctx.moveTo(x + r, y); ctx.arcTo(x + w, y, x + w, y + h, r); ctx.arcTo(x + w, y + h, x, y + h, r); ctx.arcTo(x, y + h, x, y, r); ctx.arcTo(x, y, x + w, y, r); ctx.closePath(); }


/* ================= SKY (screen space) ================= */
function drawSky(theme, t) {
  ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
  let g;
  if (theme === 0) { g = ctx.createLinearGradient(0, 0, 0, CH); g.addColorStop(0, '#141c48'); g.addColorStop(0.35, '#3c2a68'); g.addColorStop(0.62, '#8a4470'); g.addColorStop(0.82, '#d96f5e'); g.addColorStop(1, '#f0955a'); }
  else if (theme === 1) { g = ctx.createLinearGradient(0, 0, 0, CH); g.addColorStop(0, '#04060f'); g.addColorStop(0.7, '#0c1734'); g.addColorStop(1, '#182550'); }
  else { g = ctx.createLinearGradient(0, 0, 0, CH); g.addColorStop(0, '#01020a'); g.addColorStop(1, '#0a1030'); }
  ctx.fillStyle = g; ctx.fillRect(0, 0, CW, CH);
  if (theme === 1 || theme === 2) { // stars
    ctx.fillStyle = '#ffffff';
    const nStars = theme === 2 ? 140 : 90;
    for (let i = 0; i < nStars; i++) { const sx = ((hash(i * 3.1) * 1600 - camX * 0.06) % (CW + 40) + CW + 40) % (CW + 40) - 20; const sy = hash(i * 7.7) * CH * 0.7; const tw = 0.35 + 0.65 * Math.abs(Math.sin(t * 1.4 + i)); ctx.globalAlpha = 0.75 * tw; const r = hash(i) > 0.85 ? 2 : 1.2; ctx.fillRect(sx, sy, r, r); }
    ctx.globalAlpha = 1;
  }
  if (theme === 0) { // sunset: low sun + glow, rising moon, drifting clouds, birds
    const sunX = CW * 0.17 - camX * 0.02 % 40, sunY = CH * 0.60;
    const sg = ctx.createRadialGradient(sunX, sunY, 8, sunX, sunY, 190); sg.addColorStop(0, 'rgba(255,176,92,0.65)'); sg.addColorStop(1, 'rgba(255,150,80,0)');
    ctx.fillStyle = sg; ctx.fillRect(sunX - 200, sunY - 200, 400, 400);
    ctx.fillStyle = '#ffb267'; ctx.beginPath(); ctx.arc(sunX, sunY, 30, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#ffd9a0'; ctx.beginPath(); ctx.arc(sunX, sunY, 24, 0, Math.PI * 2); ctx.fill();
    const mx = CW * 0.74 - camX * 0.03 % 60, my = CH * 0.30;
    const mg = ctx.createRadialGradient(mx, my, 10, mx, my, 150); mg.addColorStop(0, 'rgba(255,244,200,0.55)'); mg.addColorStop(1, 'rgba(255,244,200,0)');
    ctx.fillStyle = mg; ctx.fillRect(mx - 160, my - 160, 320, 320);
    ctx.fillStyle = '#fdf3c9'; ctx.beginPath(); ctx.arc(mx, my, 46, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = 'rgba(214,186,128,0.28)'; ctx.beginPath(); ctx.arc(mx - 15, my - 9, 7, 0, Math.PI * 2); ctx.fill();
    ctx.beginPath(); ctx.arc(mx + 17, my + 15, 5, 0, Math.PI * 2); ctx.fill();
    ctx.beginPath(); ctx.arc(mx + 9, my - 21, 4, 0, Math.PI * 2); ctx.fill();
    // drifting cloud layers (screen space, soft sunset-tinted blobs)
    for (const [f, sp, al, sc, tint] of [[0.05, 3.5, 0.13, 1.25, '255,190,170'], [0.11, 6, 0.18, 0.9, '255,205,185'], [0.19, 10, 0.24, 0.62, '255,220,200']]) {
      ctx.fillStyle = `rgba(${tint},${al})`;
      for (let i = 0; i < 6; i++) {
        const cxp = (((hash(i * 17.3 + f * 91) * 1500 + t * sp - camX * f) % (CW + 340)) + CW + 340) % (CW + 340) - 170;
        const cyp = 34 + hash(i * 5.1 + f * 57) * CH * 0.30;
        const w = (90 + hash(i * 3.7 + f) * 110) * sc;
        ctx.beginPath();
        ctx.ellipse(cxp, cyp, w, w * 0.20, 0, 0, Math.PI * 2);
        ctx.ellipse(cxp - w * 0.42, cyp + 4, w * 0.55, w * 0.15, 0, 0, Math.PI * 2);
        ctx.ellipse(cxp + w * 0.45, cyp + 3, w * 0.6, w * 0.16, 0, 0, Math.PI * 2);
        ctx.ellipse(cxp + w * 0.05, cyp - w * 0.11, w * 0.5, w * 0.15, 0, 0, Math.PI * 2);
        ctx.fill();
      }
    }
    // birds crossing the sunset
    ctx.strokeStyle = 'rgba(30,16,44,0.6)'; ctx.lineWidth = 2; ctx.lineCap = 'round';
    for (let i = 0; i < 5; i++) {
      const bx = (((t * 21 + i * 310 - camX * 0.08) % (CW + 120)) + CW + 120) % (CW + 120) - 60;
      const by = 74 + i * 30 + Math.sin(t * 1.7 + i * 2.1) * 7;
      const fl = Math.sin(t * 9 + i * 1.7) * 4.5, s = 6 + (i % 3) * 1.6;
      ctx.beginPath(); ctx.moveTo(bx - s, by - fl); ctx.quadraticCurveTo(bx - s * 0.3, by + 2.5, bx, by); ctx.quadraticCurveTo(bx + s * 0.3, by + 2.5, bx + s, by - fl); ctx.stroke();
    }
    ctx.lineCap = 'butt';
  }
  if (theme === 1) { // small crescent moon + slow cloud bands
    const mx = CW * 0.13, my = CH * 0.13;
    ctx.fillStyle = '#fdf3c9'; ctx.beginPath(); ctx.arc(mx, my, 17, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#04060f'; ctx.beginPath(); ctx.arc(mx + 7, my - 4, 14, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = 'rgba(160,180,240,0.10)';
    for (let i = 0; i < 4; i++) {
      const cxp = (((hash(i * 23.7) * 1400 + t * 4 - camX * 0.07) % (CW + 420)) + CW + 420) % (CW + 420) - 210;
      const cyp = 50 + hash(i * 9.3) * CH * 0.24;
      ctx.beginPath(); ctx.ellipse(cxp, cyp, 190, 15, 0, 0, Math.PI * 2); ctx.ellipse(cxp + 90, cyp + 7, 130, 11, 0, 0, Math.PI * 2); ctx.fill();
    }
  }
  if (theme === 2) { // Earth + moon backdrop + nebula wash + shooting stars
    for (const [nx, ny, col] of [[0.24, 0.30, 'rgba(120,70,200,0.13)'], [0.55, 0.14, 'rgba(40,140,190,0.11)'], [0.86, 0.52, 'rgba(200,70,140,0.08)']]) {
      const ng = ctx.createRadialGradient(CW * nx, CH * ny, 10, CW * nx, CH * ny, 240); ng.addColorStop(0, col); ng.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.fillStyle = ng; ctx.fillRect(CW * nx - 250, CH * ny - 250, 500, 500);
    }
    const ex = CW * 0.78 - camX * 0.04 % 80, ey = CH * 0.30;
    const eg = ctx.createRadialGradient(ex, ey, 20, ex, ey, 190); eg.addColorStop(0, 'rgba(90,160,255,0.4)'); eg.addColorStop(1, 'rgba(90,160,255,0)');
    ctx.fillStyle = eg; ctx.fillRect(ex - 200, ey - 200, 400, 400);
    ctx.fillStyle = '#2d6fd0'; ctx.beginPath(); ctx.arc(ex, ey, 62, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#39b06a'; ctx.beginPath(); ctx.arc(ex - 20, ey - 14, 20, 0, Math.PI * 2); ctx.arc(ex + 24, ey + 20, 15, 0, Math.PI * 2); ctx.arc(ex + 6, ey - 30, 11, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = 'rgba(255,255,255,0.75)'; ctx.beginPath(); ctx.arc(ex - 34, ey + 26, 10, 0, Math.PI * 2); ctx.arc(ex + 30, ey - 6, 8, 0, Math.PI * 2); ctx.arc(ex - 2, ey + 40, 7, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#e9e2cc'; ctx.beginPath(); ctx.arc(CW * 0.14, CH * 0.2, 24, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = 'rgba(190,175,140,0.5)'; ctx.beginPath(); ctx.arc(CW * 0.14 - 7, CH * 0.2 + 5, 4.5, 0, Math.PI * 2); ctx.arc(CW * 0.14 + 8, CH * 0.2 - 7, 3.4, 0, Math.PI * 2); ctx.fill();
    const cyc = t % 8;
    if (cyc < 0.85) { // shooting star streak
      const pr = cyc / 0.85, sx = CW * (0.15 + 0.5 * pr), sy = CH * (0.08 + 0.20 * pr);
      const grd = ctx.createLinearGradient(sx, sy, sx - 74, sy - 30); grd.addColorStop(0, 'rgba(255,255,255,0.9)'); grd.addColorStop(1, 'rgba(255,255,255,0)');
      ctx.strokeStyle = grd; ctx.lineWidth = 2.2; ctx.beginPath(); ctx.moveTo(sx, sy); ctx.lineTo(sx - 74, sy - 30); ctx.stroke();
      ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.arc(sx, sy, 2, 0, Math.PI * 2); ctx.fill();
    }
  }
}

/* ================= MID PARALLAX LAYER ================= */
function drawSilhouettes(theme, t) {
  if (theme === 0) {
    // far ridge with pine silhouettes
    ctx.fillStyle = 'rgba(58,32,74,0.75)';
    ctx.beginPath(); ctx.moveTo(camX - 60, 620);
    for (let x = camX - 60; x < camX + VIEWW + 60; x += 30) { const wx = x + camX * 0.72; const y = 452 - Math.sin(wx * 0.0035) * 52 - Math.sin(wx * 0.011) * 18; ctx.lineTo(x, y); }
    ctx.lineTo(camX + VIEWW + 60, 620); ctx.closePath(); ctx.fill();
    ctx.fillStyle = 'rgba(40,22,56,0.8)';
    for (let i = Math.floor((camX * 0.28) / 130) - 1; i < Math.floor((camX * 0.28) / 130) + Math.ceil(VIEWW / 130) + 3; i++) {
      if (hash(i * 3.3) < 0.45) continue;
      const px = i * 130 - camX * 0.28 + camX;
      const py = 452 - Math.sin((px + camX * 0.72) * 0.0035) * 52 - Math.sin((px + camX * 0.72) * 0.011) * 18;
      const ph2 = 26 + hash(i * 7.1) * 22;
      ctx.beginPath(); ctx.moveTo(px, py - ph2); ctx.lineTo(px + 8, py - ph2 * 0.45); ctx.lineTo(px + 3.4, py - ph2 * 0.45); ctx.lineTo(px + 9.5, py); ctx.lineTo(px - 9.5, py); ctx.lineTo(px - 3.4, py - ph2 * 0.45); ctx.lineTo(px - 8, py - ph2 * 0.45); ctx.closePath(); ctx.fill();
    }
    // near cliffs
    ctx.fillStyle = 'rgba(46,26,66,0.9)';
    ctx.beginPath(); ctx.moveTo(camX - 60, 620);
    for (let x = camX - 60; x < camX + VIEWW + 60; x += 30) { const wx = x + camX * 0.55; const y = 478 - Math.sin(wx * 0.004) * 58 - Math.sin(wx * 0.013) * 22; ctx.lineTo(x, y); }
    ctx.lineTo(camX + VIEWW + 60, 620); ctx.closePath(); ctx.fill();
    // sea with moon-glint sparkles
    ctx.fillStyle = 'rgba(30,40,90,0.55)'; ctx.fillRect(camX - 60, 522, VIEWW + 120, 300);
    ctx.strokeStyle = 'rgba(255,210,120,0.32)'; ctx.lineWidth = 2; ctx.beginPath();
    for (let i = 0; i < 12; i++) { const y = 530 + i * 16; const off = Math.sin(titleT * 1.3 + i * 2.2) * 14; ctx.moveTo(camX + ((i * 173 + off) % (VIEWW)), y); ctx.lineTo(camX + ((i * 173 + off) % VIEWW) + 60, y); }
    ctx.stroke();
    ctx.fillStyle = '#ffe9b0';
    for (let i = 0; i < 30; i++) {
      const gx = camX + hash(i * 13.7) * VIEWW, gy = 528 + hash(i * 7.9) * 120;
      ctx.globalAlpha = 0.14 + 0.5 * Math.abs(Math.sin(t * 2.2 + i * 1.93));
      ctx.fillRect(gx, gy, 5 + hash(i) * 9, 1.6);
    }
    ctx.globalAlpha = 1;
  } else if (theme === 1) {
    for (const [f, col, hBase, near] of [[0.35, 'rgba(16,24,58,0.9)', 210, 0], [0.6, 'rgba(10,15,38,0.95)', 300, 0], [0.8, 'rgba(6,9,24,0.97)', 390, 1]]) {
      const bw = near ? 240 : 190;
      const startI = Math.floor((camX * f) / bw) - 1, endI = startI + Math.ceil(VIEWW / bw) + 3;
      for (let i = startI; i < endI; i++) {
        const bx = i * bw - camX * f + camX, bh = hBase + hash(i * 1.7 + f * 40) * 130;
        const top = 560 - bh;
        ctx.fillStyle = col; ctx.fillRect(bx, top, bw - 26, bh + 260);
        // rooftop props: antennas with blinking beacons, water towers
        const kind = hash(i * 5.3 + f * 13);
        if (kind > 0.62) { // antenna
          ctx.strokeStyle = col; ctx.lineWidth = 4; ctx.beginPath(); ctx.moveTo(bx + (bw - 26) * 0.5, top); ctx.lineTo(bx + (bw - 26) * 0.5, top - 34 - hash(i) * 20); ctx.stroke();
          const bl = 0.35 + 0.65 * Math.abs(Math.sin(t * 2.4 + i * 1.9));
          ctx.fillStyle = `rgba(255,70,80,${bl})`; ctx.beginPath(); ctx.arc(bx + (bw - 26) * 0.5, top - 36 - hash(i) * 20, 3, 0, Math.PI * 2); ctx.fill();
        } else if (kind > 0.38) { // water tower
          const wx0 = bx + (bw - 26) * 0.30, ww = 44;
          ctx.fillStyle = col; ctx.fillRect(wx0, top - 30, ww, 26);
          ctx.beginPath(); ctx.moveTo(wx0 - 4, top - 30); ctx.lineTo(wx0 + ww / 2, top - 44); ctx.lineTo(wx0 + ww + 4, top - 30); ctx.closePath(); ctx.fill();
          ctx.fillRect(wx0 + 6, top - 4, 4, 10); ctx.fillRect(wx0 + ww - 10, top - 4, 4, 10);
        }
        // lit windows (varied warmth)
        for (let wy = 0; wy < (near ? 8 : 6); wy++) for (let wx = 0; wx < (near ? 5 : 4); wx++) {
          const hw = hash(i * 31 + wy * 7 + wx * 13 + f * 7);
          if (hw > 0.52) { ctx.fillStyle = hw > 0.86 ? 'rgba(160,220,255,0.8)' : 'rgba(255,214,110,0.75)'; ctx.fillRect(bx + 14 + wx * (near ? 44 : 38), top + 16 + wy * 34, 15, 10); }
        }
      }
    }
    // neon signs in world space
    const signs = [[1050, 268, 'LUNC', '#ffd23e'], [2280, 283, 'USTC', '#5ea0ff'], [3350, 300, 'VALIDATOR', '#ff7ad9'], [4700, 258, 'BLOCK 31160', '#7CFC98'], [6000, 330, 'LUNA CLASSIC', '#ffd23e'], [8150, 296, 'ROOFTOPS', '#2fd4ff'], [12150, 300, 'BLOCK 31161', '#7CFC98'], [13450, 322, 'LUNC RUSH', '#ffd23e']];
    ctx.textAlign = 'center'; ctx.font = '900 21px Arial';
    for (const [sx, sy, txt, col] of signs) { if (sx < camX - 200 || sx > camX + VIEWW + 200) continue; ctx.shadowColor = col; ctx.shadowBlur = 16; ctx.fillStyle = col; ctx.fillText(txt, sx, sy); ctx.shadowBlur = 0; }
  } else {
    // station truss + module silhouettes
    ctx.strokeStyle = 'rgba(90,110,180,0.5)'; ctx.lineWidth = 5;
    for (let i = 0; i < 8; i++) { const bx = Math.floor((camX * 0.4) / 420) * 420 + i * 420 - camX * 0.4 + camX; ctx.beginPath(); ctx.moveTo(bx, 150); ctx.lineTo(bx + 200, 300); ctx.lineTo(bx, 450); ctx.stroke(); }
    for (let i = Math.floor((camX * 0.45) / 560) - 1; i < Math.floor((camX * 0.45) / 560) + 4; i++) {
      const mx0 = i * 560 - camX * 0.45 + camX, my0 = 158 + hash(i * 3.9) * 60, mw = 250, mh = 74;
      ctx.fillStyle = 'rgba(16,24,54,0.88)'; rr(mx0, my0, mw, mh, 26); ctx.fill();
      ctx.strokeStyle = 'rgba(110,140,220,0.4)'; ctx.lineWidth = 2; rr(mx0, my0, mw, mh, 26); ctx.stroke();
      ctx.fillStyle = 'rgba(255,226,150,0.85)';
      for (let wxi = 0; wxi < 6; wxi++) if (hash(i * 29 + wxi * 11) > 0.35) ctx.fillRect(mx0 + 20 + wxi * 36, my0 + 28, 17, 10);
      const bl = 0.3 + 0.7 * Math.abs(Math.sin(t * 2 + i * 2.6));
      ctx.fillStyle = `rgba(120,230,255,${bl})`; ctx.beginPath(); ctx.arc(mx0 + mw - 14, my0 + 12, 3.2, 0, Math.PI * 2); ctx.fill();
      if (hash(i * 7.7) > 0.55) { // comm dish
        ctx.strokeStyle = 'rgba(120,150,220,0.55)'; ctx.lineWidth = 3;
        ctx.beginPath(); ctx.moveTo(mx0 + 40, my0); ctx.lineTo(mx0 + 28, my0 - 26); ctx.stroke();
        ctx.beginPath(); ctx.arc(mx0 + 24, my0 - 30, 17, Math.PI * 0.95, Math.PI * 1.75); ctx.stroke();
      }
    }
    ctx.fillStyle = 'rgba(20,30,70,0.8)';
    for (let i = 0; i < 6; i++) { const bx = Math.floor((camX * 0.55) / 520) * 520 + i * 520 - camX * 0.55 + camX; ctx.fillRect(bx, 470 + Math.sin(i * 3) * 14, 300, 16); }
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
  if (theme === 0) { // buried pebbles & roots in the cliff face
    ctx.fillStyle = 'rgba(0,0,0,0.20)';
    for (let x = Math.floor(x0 / 74) * 74; x < x1; x += 74) { const s = surfaceAt(zone, x); if (s && hash(x * 0.61) > 0.4) { ctx.beginPath(); ctx.ellipse(x + hash(x) * 30, s.y + 26 + hash(x * 1.3) * 46, 6 + hash(x * 2.1) * 7, 4, 0, 0, Math.PI * 2); ctx.fill(); } }
    ctx.strokeStyle = 'rgba(30,18,8,0.35)'; ctx.lineWidth = 2;
    for (let x = Math.floor(x0 / 210) * 210; x < x1; x += 210) { const s = surfaceAt(zone, x); if (s && hash(x * 0.43) > 0.5) { ctx.beginPath(); ctx.moveTo(x, s.y + 4); ctx.quadraticCurveTo(x + 8, s.y + 30, x - 4, s.y + 52); ctx.stroke(); } }
  }
  ctx.restore();
  if (theme === 0) { // dirt PATH: sandy band, speckles, edge stones
    surfacePath(x0, x1, 10, 5); ctx.strokeStyle = 'rgba(196,138,74,0.55)'; ctx.lineWidth = 9; ctx.stroke();
    surfacePath(x0, x1, 10, 3); ctx.strokeStyle = 'rgba(224,170,102,0.5)'; ctx.lineWidth = 4; ctx.stroke();
    ctx.fillStyle = 'rgba(70,44,20,0.5)';
    for (let x = Math.floor(x0 / 26) * 26; x < x1; x += 26) { const s = surfaceAt(zone, x); if (s && hash(x * 0.77) > 0.35) ctx.fillRect(x + hash(x * 1.9) * 14, s.y + 6 + hash(x * 2.7) * 9, 3.4, 2.2); }
    ctx.fillStyle = 'rgba(150,128,104,0.85)';
    for (let x = Math.floor(x0 / 130) * 130 + 40; x < x1; x += 130) { const s = surfaceAt(zone, x); if (s) { ctx.beginPath(); ctx.ellipse(x, s.y + 4, 6.5, 3.4, 0, 0, Math.PI * 2); ctx.fill(); ctx.fillStyle = 'rgba(110,94,76,0.85)'; ctx.beginPath(); ctx.ellipse(x + 11, s.y + 5, 4.4, 2.6, 0, 0, Math.PI * 2); ctx.fill(); ctx.fillStyle = 'rgba(150,128,104,0.85)'; } }
  } else if (theme === 1) { // paved ROAD: asphalt band + dashed markings + manholes
    surfacePath(x0, x1, 10, 5); ctx.strokeStyle = 'rgba(64,74,120,0.65)'; ctx.lineWidth = 9; ctx.stroke();
    ctx.fillStyle = 'rgba(255,240,190,0.55)';
    for (let x = Math.floor(x0 / 52) * 52; x < x1; x += 52) { const s = surfaceAt(zone, x); if (s && Math.abs(s.ang) < 0.30) ctx.fillRect(x, s.y + 11, 24, 3); }
    ctx.fillStyle = 'rgba(8,10,24,0.65)';
    for (let x = Math.floor(x0 / 610) * 610 + 260; x < x1; x += 610) { const s = surfaceAt(zone, x); if (s) { ctx.beginPath(); ctx.ellipse(x, s.y + 17, 11, 3.6, 0, 0, Math.PI * 2); ctx.fill(); } }
  } else { // station WALKWAY: panel seams + hazard stripes at springs & span ends
    ctx.strokeStyle = 'rgba(10,14,30,0.5)'; ctx.lineWidth = 2;
    for (let x = Math.floor(x0 / 90) * 90; x < x1; x += 90) { const s = surfaceAt(zone, x); if (s) { ctx.beginPath(); ctx.moveTo(x, s.y + 3); ctx.lineTo(x, s.y + 30); ctx.stroke(); } }
    const hz = [];
    for (const sp of zone.springs) hz.push(sp.x);
    for (const sp2 of zone.spans) { hz.push(sp2.x0); hz.push(sp2.x1); }
    ctx.save();
    for (const hx of hz) {
      if (hx < x0 || hx > x1) continue;
      const s = surfaceAt(zone, hx); if (!s) continue;
      ctx.beginPath(); ctx.rect(hx - 24, s.y + 1, 48, 7); ctx.clip();
      ctx.fillStyle = '#c9a227'; ctx.fillRect(hx - 24, s.y + 1, 48, 7);
      ctx.fillStyle = '#141824';
      for (let d = -8; d < 56; d += 12) { ctx.beginPath(); ctx.moveTo(hx - 24 + d, s.y + 8); ctx.lineTo(hx - 24 + d + 6, s.y + 1); ctx.lineTo(hx - 24 + d + 11, s.y + 1); ctx.lineTo(hx - 24 + d + 5, s.y + 8); ctx.closePath(); ctx.fill(); }
      ctx.restore(); ctx.save();
    }
    ctx.restore();
  }
  // surface strip
  surfacePath(x0, x1, 10, 0);
  ctx.strokeStyle = theme === 0 ? '#d9a05a' : theme === 1 ? '#8fa2ff' : '#aebfe8'; ctx.lineWidth = 5; ctx.stroke();
  ctx.strokeStyle = theme === 0 ? 'rgba(255,230,160,0.8)' : 'rgba(255,255,255,0.35)'; ctx.lineWidth = 2; ctx.stroke();
  // rivets / panel marks on station + city
  if (theme !== 0) { ctx.fillStyle = 'rgba(255,255,255,0.18)'; for (let x = Math.floor(x0 / 90) * 90; x < x1; x += 90) { const s = surfaceAt(zone, x); if (s) ctx.fillRect(x, s.y + 14, 4, 4); } }
  // platforms + themed props
  for (const pl of zone.plats) {
    if (pl.x1 < x0 || pl.x0 > x1) continue;
    if (theme === 0) {
      ctx.fillStyle = '#8a5a2b'; ctx.fillRect(pl.x0, pl.y, pl.x1 - pl.x0, 14); ctx.fillStyle = '#c98d45'; ctx.fillRect(pl.x0, pl.y, pl.x1 - pl.x0, 5); ctx.fillStyle = 'rgba(0,0,0,0.3)'; for (let x = pl.x0 + 30; x < pl.x1; x += 60) ctx.fillRect(x, pl.y + 14, 7, 44);
      // hanging lantern under the platform + rope
      const lx = pl.x0 + 90;
      ctx.strokeStyle = 'rgba(40,24,10,0.8)'; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(lx, pl.y + 14); ctx.lineTo(lx, pl.y + 30); ctx.stroke();
      const lg = ctx.createRadialGradient(lx, pl.y + 38, 2, lx, pl.y + 38, 30); lg.addColorStop(0, 'rgba(255,196,92,0.5)'); lg.addColorStop(1, 'rgba(255,196,92,0)');
      ctx.fillStyle = lg; ctx.fillRect(lx - 32, pl.y + 6, 64, 64);
      ctx.fillStyle = '#ffca5f'; ctx.fillRect(lx - 3.4, pl.y + 31, 6.8, 9); ctx.fillStyle = '#5d3d24'; ctx.fillRect(lx - 4.6, pl.y + 29, 9.2, 2.6);
      // grass lip on the platform top
      ctx.strokeStyle = 'rgba(96,150,70,0.9)'; ctx.lineWidth = 2;
      for (let x = pl.x0 + 12; x < pl.x1 - 8; x += 34) { if (hash(x * 0.9) > 0.4) { ctx.beginPath(); ctx.moveTo(x, pl.y + 1); ctx.lineTo(x - 2, pl.y - 5); ctx.moveTo(x + 4, pl.y + 1); ctx.lineTo(x + 5, pl.y - 6); ctx.stroke(); } }
    }
    else if (theme === 1) {
      ctx.fillStyle = '#232c4e'; ctx.fillRect(pl.x0, pl.y, pl.x1 - pl.x0, 16); ctx.fillStyle = '#ffd23e'; ctx.fillRect(pl.x0, pl.y, pl.x1 - pl.x0, 4);
      // rooftop AC unit + antenna with beacon
      const ax = pl.x0 + 60;
      ctx.fillStyle = '#39406e'; ctx.fillRect(ax, pl.y - 17, 40, 17); ctx.fillStyle = '#4a548a'; ctx.fillRect(ax + 4, pl.y - 13, 13, 9); ctx.fillRect(ax + 22, pl.y - 13, 13, 9);
      ctx.strokeStyle = '#8fa2ff'; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(pl.x1 - 60, pl.y); ctx.lineTo(pl.x1 - 60, pl.y - 34); ctx.stroke();
      const bl = 0.35 + 0.65 * Math.abs(Math.sin(t * 2.6 + pl.x0));
      ctx.fillStyle = `rgba(255,70,80,${bl})`; ctx.beginPath(); ctx.arc(pl.x1 - 60, pl.y - 37, 3, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = '#2c355c'; ctx.fillRect(pl.x0 + 150, pl.y - 10, 22, 10); // vent box
    }
    else {
      ctx.fillStyle = '#5a6c96'; ctx.fillRect(pl.x0, pl.y, pl.x1 - pl.x0, 13); ctx.fillStyle = '#d7e3ff'; ctx.fillRect(pl.x0, pl.y, pl.x1 - pl.x0, 4); ctx.fillStyle = 'rgba(255,255,255,0.3)'; for (let x = pl.x0 + 22; x < pl.x1; x += 52) ctx.fillRect(x, pl.y + 7, 5, 4);
      // hazard stripe along the platform front + blinking edge light
      ctx.save(); ctx.beginPath(); ctx.rect(pl.x0, pl.y + 9, pl.x1 - pl.x0, 4); ctx.clip();
      ctx.fillStyle = '#c9a227'; ctx.fillRect(pl.x0, pl.y + 9, pl.x1 - pl.x0, 4);
      ctx.fillStyle = '#141824'; for (let d = 0; d < pl.x1 - pl.x0 + 10; d += 11) { ctx.beginPath(); ctx.moveTo(pl.x0 + d, pl.y + 13); ctx.lineTo(pl.x0 + d + 5, pl.y + 9); ctx.lineTo(pl.x0 + d + 9, pl.y + 9); ctx.lineTo(pl.x0 + d + 4, pl.y + 13); ctx.closePath(); ctx.fill(); }
      ctx.restore();
      const bl = 0.3 + 0.7 * Math.abs(Math.sin(t * 3 + pl.x0 * 0.5));
      ctx.fillStyle = `rgba(120,230,255,${bl})`; ctx.beginPath(); ctx.arc(pl.x0 + 12, pl.y - 3, 2.8, 0, Math.PI * 2); ctx.fill();
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
function drawPine(x, y, s, t) {
  const sway = Math.sin(t * 0.9 + x * 0.05) * 0.018;
  ctx.save(); ctx.translate(x, y); ctx.rotate(sway); ctx.scale(s, s);
  ctx.fillStyle = '#4a3018'; ctx.fillRect(-2.6, -14, 5.2, 14);
  ctx.fillStyle = '#1e4630';
  for (const [w, yy] of [[30, -12], [24, -26], [17, -39]]) { ctx.beginPath(); ctx.moveTo(0, yy - 13); ctx.lineTo(w / 2, yy + 3); ctx.lineTo(-w / 2, yy + 3); ctx.closePath(); ctx.fill(); }
  ctx.fillStyle = 'rgba(70,160,105,0.55)';
  for (const [w, yy] of [[30, -12], [24, -26], [17, -39]]) { ctx.beginPath(); ctx.moveTo(0, yy - 13); ctx.lineTo(w * 0.18, yy + 1); ctx.lineTo(-w * 0.30, yy + 3); ctx.closePath(); ctx.fill(); }
  ctx.fillStyle = '#ffd23e'; ctx.beginPath(); ctx.arc(0, -53, 2.2, 0, Math.PI * 2); ctx.fill(); // moonlit tip
  ctx.restore();
}
function drawLeafy(x, y, s, t) {
  const sway = Math.sin(t * 0.8 + x * 0.04) * 0.022;
  ctx.save(); ctx.translate(x, y); ctx.scale(s, s);
  ctx.strokeStyle = '#4a3018'; ctx.lineWidth = 5; ctx.beginPath(); ctx.moveTo(0, 0); ctx.quadraticCurveTo(3, -18, 1, -30); ctx.stroke();
  ctx.lineWidth = 3; ctx.beginPath(); ctx.moveTo(1, -22); ctx.quadraticCurveTo(-9, -30, -14, -34); ctx.moveTo(1, -26); ctx.quadraticCurveTo(10, -32, 15, -37); ctx.stroke();
  ctx.rotate(sway);
  ctx.fillStyle = '#2c5c36';
  for (const [cx2, cy2, r] of [[0, -44, 17], [-14, -36, 12], [14, -37, 12.5], [-6, -52, 11], [8, -53, 10]]) { ctx.beginPath(); ctx.arc(cx2, cy2, r, 0, Math.PI * 2); ctx.fill(); }
  ctx.fillStyle = 'rgba(96,186,110,0.6)';
  for (const [cx2, cy2, r] of [[-5, -48, 9], [10, -44, 7], [-13, -39, 6]]) { ctx.beginPath(); ctx.arc(cx2, cy2, r, 0, Math.PI * 2); ctx.fill(); }
  ctx.fillStyle = '#ffb7d5';
  for (let i = 0; i < 4; i++) { const a = hash(x + i * 7) * 6.28; ctx.beginPath(); ctx.arc(Math.cos(a) * 13, -44 + Math.sin(a) * 9, 1.9, 0, Math.PI * 2); ctx.fill(); }
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
    const signs = [[430, 'MOONRISE →'], [1830, 'LOOP AHEAD'], [2500, 'LUNC · 2 MI'], [4650, 'CORKSCREW →'], [6120, 'HALFWAY →'], [8120, 'BRIDGE →'], [10050, 'LOOP 2 →'], [13060, 'GOAL →']];
    for (const [sx, txt] of signs) { if (sx < x0 || sx > x1) continue; const s = surfaceAt(zone, sx); if (s) drawWoodSign(sx, s.y, txt); }
    // fences on flat ground (posts + rails between neighbours)
    const posts = [];
    for (let x = Math.floor(x0 / 92) * 92; x < x1; x += 92) { const s = surfaceAt(zone, x); if (s && Math.abs(s.ang) < 0.055 && !decorBlocked(x)) posts.push([x, s.y]); }
    ctx.strokeStyle = 'rgba(96,62,32,0.9)'; ctx.lineWidth = 3.4;
    ctx.beginPath();
    for (let i = 0; i + 1 < posts.length; i++) { const [ax, ay] = posts[i], [bx2, by2] = posts[i + 1]; if (bx2 - ax <= 93 && Math.abs(by2 - ay) < 26) { ctx.moveTo(ax, ay - 21); ctx.lineTo(bx2, by2 - 21); ctx.moveTo(ax, ay - 11); ctx.lineTo(bx2, by2 - 11); } }
    ctx.stroke();
    ctx.fillStyle = '#6e4525';
    for (const [px, py] of posts) { ctx.fillRect(px - 2.6, py - 27, 5.2, 27); ctx.fillRect(px - 3.6, py - 29.5, 7.2, 3.4); }
    // lamps
    for (let x = Math.floor(x0 / 640) * 640 + 210; x < x1; x += 640) { const s = surfaceAt(zone, x); if (s && !decorBlocked(x)) drawLampPost(x, s.y, t); }
    // trees / bushes / grass / flowers on a 130px decor grid
    for (let x = Math.floor(x0 / 130) * 130; x < x1; x += 130) {
      if (decorBlocked(x)) continue;
      const s = surfaceAt(zone, x); if (!s) continue;
      const h = hash(x * 0.131);
      if (h < 0.30) { if (hash(x * 0.71) < 0.5) drawPine(x + 30, s.y + 2, 0.8 + h * 1.1, t); else drawLeafy(x + 30, s.y + 2, 0.78 + h * 0.9, t); }
      else if (h < 0.46) { // bush
        ctx.fillStyle = '#27512f'; const bw2 = 15 + hash(x * 2.2) * 9;
        ctx.beginPath(); ctx.arc(x + 26, s.y - 5, bw2 * 0.62, 0, Math.PI * 2); ctx.arc(x + 26 - bw2 * 0.5, s.y - 2, bw2 * 0.44, 0, Math.PI * 2); ctx.arc(x + 26 + bw2 * 0.5, s.y - 2, bw2 * 0.46, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = 'rgba(96,186,110,0.5)'; ctx.beginPath(); ctx.arc(x + 20, s.y - 10, bw2 * 0.3, 0, Math.PI * 2); ctx.fill();
      }
    }
    // grass tufts + flowers on a fine grid
    for (let x = Math.floor(x0 / 44) * 44; x < x1; x += 44) {
      const s = surfaceAt(zone, x); if (!s) continue;
      const h = hash(x * 0.317);
      if (h > 0.42 && !decorBlocked(x)) {
        ctx.strokeStyle = 'rgba(110,175,85,0.85)'; ctx.lineWidth = 1.8;
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
    const signs = [[900, 'NODE-7', '#7CFC98'], [2560, '24H SYNC', '#5ea0ff'], [4520, 'VALIDATOR', '#ff7ad9'], [5920, 'LUNC →', '#ffd23e'], [7260, 'NODE-8', '#7CFC98'], [9680, 'CORKSCREW', '#2fd4ff'], [12680, 'LUNC →', '#ffd23e'], [13620, 'GOAL →', '#ffd23e']];
    ctx.textAlign = 'center';
    for (const [sx, txt, col] of signs) {
      if (sx < x0 || sx > x1) continue;
      const s = surfaceAt(zone, sx); if (!s) continue;
      ctx.fillStyle = '#131a30'; ctx.fillRect(sx - 2.2, s.y - 56, 4.4, 56);
      ctx.shadowColor = col; ctx.shadowBlur = 13; ctx.fillStyle = 'rgba(6,8,20,0.92)'; rr(sx - 44, s.y - 84, 88, 26, 5); ctx.fill();
      ctx.fillStyle = col; ctx.font = '900 12px Arial'; ctx.fillText(txt, sx, s.y - 66.5); ctx.shadowBlur = 0;
    }
    // sidewalk crates & traffic cone props
    for (let x = Math.floor(x0 / 470) * 470 + 300; x < x1; x += 470) {
      const s = surfaceAt(zone, x); if (!s || decorBlocked(x) || Math.abs(s.ang) > 0.1) continue;
      const h = hash(x * 0.53);
      if (h < 0.5) { ctx.fillStyle = '#3a4470'; ctx.fillRect(x, s.y - 16, 17, 16); ctx.fillStyle = '#47538a'; ctx.fillRect(x + 3, s.y - 27, 13, 11); ctx.strokeStyle = 'rgba(0,0,0,0.4)'; ctx.lineWidth = 1.6; ctx.strokeRect(x + 0.8, s.y - 15.2, 15.4, 14.4); }
      else { ctx.fillStyle = '#d8622a'; ctx.beginPath(); ctx.moveTo(x + 2, s.y); ctx.lineTo(x + 6, s.y - 17); ctx.lineTo(x + 10, s.y - 17); ctx.lineTo(x + 14, s.y); ctx.closePath(); ctx.fill(); ctx.fillStyle = '#f2f2f2'; ctx.fillRect(x + 4.6, s.y - 10.4, 6.8, 3); ctx.fillStyle = '#8a3418'; ctx.fillRect(x, s.y - 1.8, 16, 1.8); }
    }
  } else {
    // safety rails on flat stretches
    const posts = [];
    for (let x = Math.floor(x0 / 118) * 118; x < x1; x += 118) { const s = surfaceAt(zone, x); if (s && Math.abs(s.ang) < 0.055 && !decorBlocked(x)) posts.push([x, s.y]); }
    ctx.strokeStyle = 'rgba(140,165,220,0.85)'; ctx.lineWidth = 2.6;
    ctx.beginPath();
    for (let i = 0; i + 1 < posts.length; i++) { const [ax, ay] = posts[i], [bx2, by2] = posts[i + 1]; if (bx2 - ax <= 119 && Math.abs(by2 - ay) < 26) { ctx.moveTo(ax, ay - 25); ctx.lineTo(bx2, by2 - 25); ctx.moveTo(ax, ay - 14); ctx.lineTo(bx2, by2 - 14); } }
    ctx.stroke();
    ctx.fillStyle = '#5a6c96';
    for (const [px, py] of posts) ctx.fillRect(px - 2, py - 27, 4, 27);
    ctx.fillStyle = '#ffd23e';
    for (const [px, py] of posts) ctx.fillRect(px - 2, py - 27, 4, 3);
    // floating holo signs
    const signs = [[820, 'DOCK 7'], [2180, 'AIRLOCK →'], [3980, 'LOOP AHEAD'], [6080, 'LUNA →'], [9050, 'DOCK 9'], [10950, 'LOOP 2 →'], [12750, 'FLOAT ARC'], [14050, 'GOAL →']];
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
    ctx.fillStyle = 'rgba(120,230,255,0.5)';
    for (let x = Math.floor(x0 / 118) * 118 + 59; x < x1; x += 118) { const s = surfaceAt(zone, x); if (s) ctx.fillRect(x - 3, s.y + 6, 6, 2.4); }
  }
}
function drawCloudShadows(theme, t) {
  if (theme !== 0 && theme !== 1) return;
  ctx.fillStyle = theme === 0 ? 'rgba(24,12,44,0.10)' : 'rgba(0,0,10,0.13)';
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
    if (theme === 0) { // fireflies / drifting pollen over the coast grass
      const tw = 0.35 + 0.65 * Math.abs(Math.sin(t * 1.8 + a.ph * 3));
      ctx.fillStyle = `rgba(255,224,130,${0.55 * tw})`; ctx.beginPath(); ctx.arc(a.x, a.y, 2.1, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = `rgba(255,224,130,${0.13 * tw})`; ctx.beginPath(); ctx.arc(a.x, a.y, 5.4, 0, Math.PI * 2); ctx.fill();
    } else if (theme === 1) { // city dust motes
      ctx.fillStyle = 'rgba(190,205,255,0.4)'; ctx.fillRect(a.x, a.y, 1.8, 1.8);
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
    ctx.fillStyle = 'rgba(10,14,16,0.75)';
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
      ctx.fillStyle = theme === 1 ? 'rgba(150,170,255,0.05)' : 'rgba(170,220,255,0.06)';
      ctx.beginPath(); ctx.arc(bx, by, 16 + i * 6, 0, Math.PI * 2); ctx.fill();
    }
  }
}

function loopColors(theme) { return theme === 0 ? ['#8a5a2b', '#d9a05a'] : theme === 1 ? ['#123a5e', '#2fd4ff'] : ['#39496e', '#aebfe8']; }
function drawLoopBack(theme) {
  const [dark] = loopColors(theme);
  for (const L of zone.loops) {
    if (L.cx + L.r < camX - 80 || L.cx - L.r > camX + VIEWW + 80) continue;
    ctx.strokeStyle = 'rgba(0,0,0,0.35)'; ctx.lineWidth = 7; ctx.beginPath(); ctx.moveTo(L.cx - L.r - 16, L.gy + 4); ctx.lineTo(L.cx - L.r * 0.34, L.gy - L.r * 0.94); ctx.moveTo(L.cx + L.r + 16, L.gy + 4); ctx.lineTo(L.cx + L.r * 0.34, L.gy - L.r * 0.94); ctx.stroke();
    ctx.strokeStyle = dark; ctx.lineWidth = 30; ctx.beginPath(); ctx.arc(L.cx, L.gy - L.r, L.r, 0, Math.PI * 2); ctx.stroke();
    if (theme === 0) { // wood grain arcs on the timber loop
      ctx.strokeStyle = 'rgba(60,34,12,0.4)'; ctx.lineWidth = 2;
      for (const rr2 of [-9, 0, 9]) { ctx.beginPath(); ctx.arc(L.cx, L.gy - L.r, L.r + rr2, 0.35, 2.5); ctx.stroke(); }
    }
  }
}
function drawLoopFront(theme) {
  const [, lite] = loopColors(theme);
  for (const L of zone.loops) {
    if (L.cx + L.r < camX - 80 || L.cx - L.r > camX + VIEWW + 80) continue;
    ctx.strokeStyle = lite; ctx.lineWidth = 30; ctx.beginPath(); ctx.arc(L.cx, L.gy - L.r, L.r, 1.66, 3.05); ctx.stroke();
    ctx.strokeStyle = 'rgba(255,255,255,0.5)'; ctx.lineWidth = 3; ctx.beginPath(); ctx.arc(L.cx, L.gy - L.r, L.r - 13, 1.66, 3.05); ctx.stroke();
    if (theme === 0) { // leafy vine + blossoms creeping over the front arc
      ctx.strokeStyle = 'rgba(52,110,58,0.85)'; ctx.lineWidth = 3; ctx.beginPath(); ctx.arc(L.cx, L.gy - L.r, L.r + 14, 1.8, 2.9); ctx.stroke();
      ctx.fillStyle = '#3f7d46';
      for (let a = 1.9; a < 2.9; a += 0.22) { ctx.beginPath(); ctx.ellipse(L.cx + (L.r + 15) * Math.cos(a), (L.gy - L.r) + (L.r + 15) * Math.sin(a), 4.6, 2.6, a, 0, Math.PI * 2); ctx.fill(); }
      ctx.fillStyle = '#ffb7d5';
      for (let a = 2.0; a < 2.85; a += 0.42) { ctx.beginPath(); ctx.arc(L.cx + (L.r + 16) * Math.cos(a), (L.gy - L.r) + (L.r + 16) * Math.sin(a), 2.1, 0, Math.PI * 2); ctx.fill(); }
    }
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
    ctx.fillStyle = '#dfe6ff'; ctx.beginPath(); ctx.moveTo(0, -12); ctx.lineTo(30, 8); ctx.lineTo(4, 6); ctx.lineTo(-2, 14); ctx.lineTo(-8, 4); ctx.lineTo(-28, 6); ctx.closePath(); ctx.fill();
    ctx.fillStyle = '#9fc2ff'; ctx.beginPath(); ctx.moveTo(0, -12); ctx.lineTo(30, 8); ctx.lineTo(4, 6); ctx.closePath(); ctx.fill();
    ctx.fillStyle = '#ff5964'; ctx.beginPath(); ctx.arc(3, -2, 3.4, 0, Math.PI * 2); ctx.fill();
    ctx.restore();
    ctx.strokeStyle = 'rgba(159,194,255,0.4)'; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(x - 18, y + 16 + Math.sin(t * 6) * 2); ctx.lineTo(x + 18, y + 16 + Math.cos(t * 5) * 2); ctx.stroke();
  }
}
let spinAng = 0;
let earSweep = 0, earBobP = 0;
/* ---- MOON RABBIT hero rig (art only; physics/hitbox untouched) ---- */
function drawRabbitEar(len, wid, bend, inner) {
  // ear drawn from origin (base) pointing up, bending toward -x (back)
  ctx.beginPath();
  ctx.moveTo(-wid / 2, 0);
  ctx.quadraticCurveTo(-wid / 2 - bend * 0.4, -len * 0.55, -bend, -len);
  ctx.quadraticCurveTo(0, -len - wid * 0.42, wid * 0.4, -len * 0.92);
  ctx.quadraticCurveTo(wid / 2 + bend * 0.15, -len * 0.5, wid / 2, 0);
  ctx.closePath(); ctx.fill();
  if (inner) {
    ctx.fillStyle = 'rgba(243,150,170,0.75)';
    ctx.beginPath();
    ctx.moveTo(-wid * 0.20, -len * 0.14);
    ctx.quadraticCurveTo(-wid * 0.22 - bend * 0.3, -len * 0.55, -bend * 0.88, -len * 0.86);
    ctx.quadraticCurveTo(-bend * 0.4, -len * 0.94, wid * 0.05, -len * 0.8);
    ctx.quadraticCurveTo(wid * 0.18, -len * 0.45, wid * 0.20, -len * 0.14);
    ctx.closePath(); ctx.fill();
  }
}
function drawCrescentMark(cx, cy, r, col) {
  ctx.save(); ctx.fillStyle = col;
  ctx.beginPath();
  ctx.arc(cx, cy, r, 0, Math.PI * 2);
  ctx.arc(cx + r * 0.44, cy - r * 0.26, r * 0.8, 0, Math.PI * 2);
  ctx.fill('evenodd');
  ctx.restore();
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
  // ear physics (visual spring): sweep back with speed, bounce with stride
  const sweepTgt = ball ? 0.4 : Math.min(0.95, speed / 830) * 0.85 + (!P.grounded && !ball ? 0.38 : 0);
  earSweep += (sweepTgt - earSweep) * Math.min(1, dt * 7);
  earBobP = P.grounded && speed > 40 ? P.runPhase : earBobP + dt * 2.2;
  const earBob = Math.sin(earBobP * 2) * (P.grounded && speed > 40 ? 0.055 : 0.02);
  ctx.save(); ctx.translate(x, y); ctx.rotate(rot); ctx.scale(P.facing, 1); if (blink) ctx.globalAlpha = 0.35;
  // comet tail (behind, -x in facing space)
  const tlen = Math.min(64, 12 + speed * 0.055) * (1 + Math.sin(t * 31) * 0.08);
  if (speed > 94 && !ball) {
    const tg = ctx.createLinearGradient(-14, -16, -(14 + tlen), -16); tg.addColorStop(0, 'rgba(255,150,50,0.85)'); tg.addColorStop(0.5, 'rgba(255,90,40,0.4)'); tg.addColorStop(1, 'rgba(255,90,40,0)');
    ctx.fillStyle = tg; ctx.beginPath(); ctx.moveTo(-12, -24); ctx.lineTo(-(14 + tlen), -15 + Math.sin(t * 24) * 2.4); ctx.lineTo(-12, -8); ctx.closePath(); ctx.fill();
  }
  if (ball) {
    /* curled-up rabbit ball: fur ball, ears wrapped around, tail puff, charm */
    if (speed > 144) { ctx.fillStyle = 'rgba(255,150,50,0.75)'; ctx.beginPath(); ctx.moveTo(-14, -22); ctx.lineTo(-(16 + tlen * 0.7), -15); ctx.lineTo(-14, -9); ctx.closePath(); ctx.fill(); }
    const bg = ctx.createRadialGradient(-5, -22, 3, 0, -16, 17); bg.addColorStop(0, '#fffaf0'); bg.addColorStop(0.65, '#f3e3bc'); bg.addColorStop(1, '#d9bd85');
    ctx.fillStyle = bg; ctx.beginPath(); ctx.arc(0, -16, 15.5, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = 'rgba(156,109,14,0.55)'; ctx.lineWidth = 1.6; ctx.stroke();
    // wrapped ears hugging the ball
    ctx.fillStyle = '#e8d3a5';
    ctx.beginPath(); ctx.ellipse(-3, -29.5, 11.5, 4.6, -0.5, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#f7ead2';
    ctx.beginPath(); ctx.ellipse(2, -27.8, 11, 4.2, 0.42, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = 'rgba(243,150,170,0.7)';
    ctx.beginPath(); ctx.ellipse(2.6, -27.6, 6.4, 2.2, 0.42, 0, Math.PI * 2); ctx.fill();
    // gold crescent ear-tip mark on the wrapped ear
    ctx.save(); ctx.translate(10.4, -30.6); ctx.rotate(0.5); ctx.scale(0.62, 0.62); drawCrescentMark(0, 0, 4.6, '#f5b921'); ctx.restore();
    // tail puff peeking at the back-bottom
    ctx.fillStyle = '#fffdf6';
    ctx.beginPath(); ctx.arc(-13.4, -7.5, 4.6, 0, Math.PI * 2); ctx.arc(-10.8, -4.6, 3.8, 0, Math.PI * 2); ctx.fill();
    // sleeping face: closed happy eye + nose + whisker dots
    ctx.strokeStyle = '#4a3a22'; ctx.lineWidth = 1.7; ctx.lineCap = 'round';
    ctx.beginPath(); ctx.arc(7.6, -15.5, 3.1, Math.PI * 1.08, Math.PI * 1.62); ctx.stroke();
    ctx.fillStyle = '#e77e95'; ctx.beginPath(); ctx.ellipse(12.6, -12.6, 1.9, 1.4, 0, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = 'rgba(74,58,34,0.55)'; ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(9, -9.6); ctx.lineTo(14.6, -8.6); ctx.moveTo(9.2, -11.2); ctx.lineTo(15, -11.4); ctx.stroke();
    ctx.lineCap = 'butt';
    // fur swirl + crescent charm at the chest
    ctx.strokeStyle = 'rgba(160,120,40,0.55)'; ctx.lineWidth = 2.2; ctx.beginPath(); ctx.arc(0, -16, 9.8, t * 2 % 6.28, t * 2 % 6.28 + 3.4); ctx.stroke();
    if (luncImg.complete && luncImg.naturalWidth) { ctx.save(); ctx.globalAlpha = 0.95; ctx.drawImage(luncImg, -4.4, -8.6, 8.8, 8.8); ctx.restore(); }
  } else {
    const run = P.grounded && Math.abs(P.g) > 30;
    const p = P.runPhase;
    const legA = run ? Math.sin(p) * 0.85 : 0, legB = run ? Math.sin(p + Math.PI) * 0.85 : 0;
    const air = !P.grounded;
    /* far ear (darker, behind head) */
    ctx.save(); ctx.translate(-1.6, -40.5); ctx.rotate(-0.30 - earSweep * 0.75 + earBob * 0.7);
    ctx.fillStyle = '#e2cb9e'; drawRabbitEar(23, 6.4, 3.4 + earSweep * 6, false); ctx.restore();
    /* far arm */
    ctx.save(); ctx.translate(0.5, -21);
    const armFA = air ? -0.7 : run ? Math.sin(p) * 0.55 : 0.12;
    ctx.rotate(armFA); ctx.fillStyle = '#ecd9b4';
    rr(-2.2, 0, 4.4, 10.5, 2.2); ctx.fill();
    ctx.beginPath(); ctx.arc(0, 11, 2.9, 0, Math.PI * 2); ctx.fill(); ctx.restore();
    /* far leg + long rabbit foot */
    ctx.save(); ctx.translate(-1.5, -11.5);
    if (air) { ctx.rotate(0.55); } else ctx.rotate(legB * 0.8);
    ctx.fillStyle = '#ecd9b4'; rr(-2.4, 0, 4.8, 9.5, 2.4); ctx.fill();
    ctx.fillStyle = '#fbf3df'; ctx.beginPath(); ctx.ellipse(2.6, 10.6, 5.6, 2.7, 0, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = 'rgba(150,120,70,0.6)'; ctx.lineWidth = 0.9; ctx.beginPath(); ctx.moveTo(4.6, 8.6); ctx.lineTo(4.6, 11.8); ctx.moveTo(6.6, 9); ctx.lineTo(6.6, 11.6); ctx.stroke();
    ctx.restore();
    /* fluffy tail */
    const tb = Math.sin(earBobP * 2 + 1.2) * 1.1;
    ctx.fillStyle = '#fffdf6';
    ctx.beginPath(); ctx.arc(-11.8, -15 + tb * 0.4, 5.2, 0, Math.PI * 2); ctx.arc(-13.6, -11.4 + tb * 0.4, 4.2, 0, Math.PI * 2); ctx.arc(-9.2, -11 + tb * 0.4, 3.9, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = 'rgba(226,203,158,0.7)'; ctx.beginPath(); ctx.arc(-12.8, -10.6 + tb * 0.4, 3.1, 0, Math.PI * 2); ctx.fill();
    /* body: cream fur with shading + belly patch */
    const bg2 = ctx.createRadialGradient(-4, -27, 3, 0, -18, 17); bg2.addColorStop(0, '#fffaf0'); bg2.addColorStop(0.62, '#f3e3bc'); bg2.addColorStop(1, '#dcbf8a');
    ctx.fillStyle = bg2; ctx.beginPath(); ctx.ellipse(0, -17.5, 11.6, 12.6, 0, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = 'rgba(255,253,246,0.9)'; ctx.beginPath(); ctx.ellipse(2.8, -14.6, 6.6, 8.2, 0, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = 'rgba(216,183,124,0.5)'; ctx.beginPath(); ctx.ellipse(-7.8, -20, 3.9, 7.6, 0.35, 0, Math.PI * 2); ctx.fill();
    /* near leg + foot */
    ctx.save(); ctx.translate(1.8, -11.5);
    if (air) { ctx.rotate(-0.38); } else ctx.rotate(legA * 0.8);
    ctx.fillStyle = '#f7ead2'; rr(-2.4, 0, 4.8, 9.5, 2.4); ctx.fill();
    ctx.fillStyle = '#fffaf0'; ctx.beginPath(); ctx.ellipse(2.8, 10.6, 5.9, 2.8, 0, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = 'rgba(150,120,70,0.65)'; ctx.lineWidth = 0.9; ctx.beginPath(); ctx.moveTo(4.8, 8.6); ctx.lineTo(4.8, 11.9); ctx.moveTo(6.9, 9); ctx.lineTo(6.9, 11.7); ctx.stroke();
    ctx.restore();
    /* head */
    const hg = ctx.createRadialGradient(0, -38, 2, 3.4, -33.5, 11); hg.addColorStop(0, '#fffcf4'); hg.addColorStop(0.7, '#f7ead2'); hg.addColorStop(1, '#e6d0a2');
    ctx.fillStyle = hg; ctx.beginPath(); ctx.arc(3.4, -33.5, 10.4, 0, Math.PI * 2); ctx.fill();
    // muzzle + nose + mouth
    ctx.fillStyle = 'rgba(255,253,246,0.95)'; ctx.beginPath(); ctx.ellipse(9.2, -29.9, 5.4, 4.1, 0, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#e77e95'; ctx.beginPath(); ctx.ellipse(13.2, -31.8, 2.1, 1.55, 0, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = 'rgba(255,255,255,0.75)'; ctx.beginPath(); ctx.ellipse(12.7, -32.3, 0.8, 0.55, 0, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = '#8a6a44'; ctx.lineWidth = 1.1; ctx.lineCap = 'round';
    ctx.beginPath(); ctx.arc(10.9, -28.2, 2.4, 0.25 * Math.PI, 0.8 * Math.PI); ctx.stroke();
    // whiskers
    ctx.strokeStyle = 'rgba(120,95,60,0.5)'; ctx.lineWidth = 0.8;
    ctx.beginPath(); ctx.moveTo(10.5, -29.4); ctx.lineTo(17.6, -30.2); ctx.moveTo(10.6, -28.2); ctx.lineTo(17.4, -27.2); ctx.moveTo(10.2, -30.6); ctx.lineTo(16.8, -32.6); ctx.stroke();
    ctx.lineCap = 'butt';
    // cheek blush
    ctx.fillStyle = 'rgba(244,150,170,0.4)'; ctx.beginPath(); ctx.ellipse(6.4, -29.6, 2.9, 1.9, 0, 0, Math.PI * 2); ctx.fill();
    // eye: blink cycle + pain face right after a hit
    const eyeClosed = (t % 3.7) < 0.12;
    if (P.invuln > 1.15) {
      ctx.strokeStyle = '#33270f'; ctx.lineWidth = 1.8; ctx.lineCap = 'round';
      ctx.beginPath(); ctx.moveTo(4.6, -37.4); ctx.lineTo(9.6, -33.6); ctx.moveTo(9.6, -37.4); ctx.lineTo(4.6, -33.6); ctx.stroke(); ctx.lineCap = 'butt';
    } else if (eyeClosed) {
      ctx.strokeStyle = '#33270f'; ctx.lineWidth = 1.7; ctx.lineCap = 'round';
      ctx.beginPath(); ctx.moveTo(4.4, -35.6); ctx.quadraticCurveTo(7.1, -34.4, 9.8, -35.6); ctx.stroke(); ctx.lineCap = 'butt';
    } else {
      ctx.fillStyle = '#2a2013'; ctx.beginPath(); ctx.ellipse(7.1, -35.7, 2.15, 2.9, 0, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.arc(7.9, -36.7, 0.95, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = 'rgba(255,255,255,0.75)'; ctx.beginPath(); ctx.arc(6.5, -34.3, 0.5, 0, Math.PI * 2); ctx.fill();
      ctx.strokeStyle = 'rgba(51,39,15,0.8)'; ctx.lineWidth = 1.4; ctx.beginPath(); ctx.moveTo(4.2, -39.6); ctx.quadraticCurveTo(7.2, -40.6, 10.1, -39.7); ctx.stroke();
    }
    /* near ear (front) with pink inner + gold crescent tip */
    ctx.save(); ctx.translate(3.2, -41.5); ctx.rotate(-0.13 - earSweep * 0.95 + earBob);
    ctx.fillStyle = '#f7ead2'; drawRabbitEar(25, 7, 3.8 + earSweep * 7.5, true);
    ctx.save(); ctx.translate(-(3.8 + earSweep * 7.5) - 0.6, -24.6); ctx.rotate(-0.35 - earSweep * 0.4); drawCrescentMark(0, 0, 3.4, '#f5b921'); ctx.restore();
    ctx.restore();
    /* near arm pumping */
    ctx.save(); ctx.translate(3.4, -21.5);
    const armNA = air ? 0.85 : run ? Math.sin(p + Math.PI) * 0.6 : -0.1 + Math.sin(t * 2.1) * 0.05;
    ctx.rotate(armNA); ctx.fillStyle = '#f7ead2';
    rr(-2.3, 0, 4.6, 10.5, 2.3); ctx.fill();
    ctx.beginPath(); ctx.arc(0, 11.2, 3, 0, Math.PI * 2); ctx.fill(); ctx.restore();
    /* gold crescent crest charm on a cord at the neck */
    ctx.strokeStyle = 'rgba(120,84,30,0.85)'; ctx.lineWidth = 1.2;
    ctx.beginPath(); ctx.arc(3.4, -25.4, 4.6, Math.PI * 0.15, Math.PI * 0.85); ctx.stroke();
    if (luncImg.complete && luncImg.naturalWidth) { ctx.save(); ctx.globalAlpha = 0.97; ctx.drawImage(luncImg, -0.6, -23.4, 8.4, 8.4); ctx.restore(); }
    else { ctx.save(); ctx.translate(3.6, -19.2); drawCrescentMark(0, 0, 3.9, '#f5b921'); ctx.restore(); }
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
  drawSilhouettes(theme, t);
  drawLoopBack(theme); drawCorkBack(theme);
  drawTerrain(theme, t);
  drawDecorBack(theme, t);
  drawCloudShadows(theme, t);
  for (const sp of zone.springs) if (sp.x > camX - 60 && sp.x < camX + VIEWW + 60) drawSpring(sp, theme);
  for (const c of zone.coins) { if (c.taken || c.x < camX - 40 || c.x > camX + VIEWW + 40) continue; drawCoinAt(c.x, c.y + Math.sin(t * 2.6 + c.x * 0.04) * 2.4, 13, t); }
  for (const s of zone.stars) { if (s.taken || s.x < camX - 40 || s.x > camX + VIEWW + 40) continue; drawStarAt(s.x, s.y, 15, t); }
  for (const c of dynCoins) { if (c.life < 0.7 && Math.floor(t * 12) % 2 === 0) continue; drawCoinAt(c.x, c.y - 6, 12, t); }
  for (const e of zone.enemies) { if (e.dead || e.x < camX - 70 || e.x > camX + VIEWW + 70) continue; drawEnemy(e, t); }
  drawPlayer(t, dt);
  drawLoopFront(theme); drawCorkFront(theme);
  drawAmbient(theme, t, dt);
  for (const p of particles) { ctx.globalAlpha = Math.max(0, p.life / p.max); ctx.fillStyle = p.color; ctx.fillRect(p.x - p.size / 2, p.y - p.size / 2, p.size, p.size); }
  ctx.globalAlpha = 1;
  ctx.textAlign = 'center'; ctx.font = '900 17px Arial';
  for (const ft of texts) { ctx.globalAlpha = 1 - ft.t; ctx.fillStyle = ft.color; ctx.fillText(ft.txt, ft.x, ft.y); }
  ctx.globalAlpha = 1;
  drawForeground(theme, t);
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
