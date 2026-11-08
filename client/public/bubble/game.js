/* ============================================================================
   LUNA BUBBLE 3D — neon bubble shooter · LUNC Dev Studio
   A faithful 3D rebuild of the original Luna Bubble: same hex-grid shooter,
   same waves, same sinking ceiling, same scoring — rebuilt as glossy neon
   glass in a deep-space abyss, where every match pops in a burst of light.
   All art is procedural/original; Three.js (MIT) is the only library.
   ============================================================================ */
import * as THREE from 'three';

const $ = id => document.getElementById(id);

/* ================= logical play space (identical to the original) ================= */
const LW = 440, LH = 760;                 /* portrait logical space */
const COLS = 8;
const R = 26, D = R * 2, ROWH = R * Math.sqrt(3);
const X0 = (LW - COLS * D) / 2;           /* 12 */
const TOPY = 10;                          /* ceiling ledge base (logical y) */
const DANGER_Y = 636;
const LAUNCH = { x: LW / 2, y: 706 };
const SPEED = 800;                        /* projectile px/s */
const WAVE_ROWS = 5;
const POP_BASE = 10, DROP_POINTS = 25, WAVE_BONUS = 250;
const MAXAIM = 72;                        /* aim clamp, degrees from vertical */

/* ================= palette (neon on dark — the owner's note) ================= */
const TYPES = [
  { name: 'Crescent', color: 0xffd76a, css: '#ffd76a', dark: 0xb8860b },  /* 0 gold */
  { name: 'Star',     color: 0x3fe0c8, css: '#3fe0c8', dark: 0x15957f },  /* 1 teal */
  { name: 'Coin',     color: 0xffb700, css: '#ffb700', dark: 0xcc7a00 },  /* 2 amber */
  { name: 'Crystal',  color: 0xb388ff, css: '#b388ff', dark: 0x6a48b8 },  /* 3 violet */
  { name: 'Orb',      color: 0x4da3ff, css: '#4da3ff', dark: 0x1f5fc4 },  /* 4 blue */
  { name: 'Comet',    color: 0xff6b9d, css: '#ff6b9d', dark: 0xc23368 },  /* 5 pink */
];
const WILD = 6;    /* gold LUNC crescent — matches ANY colour */
const STAR = 7;    /* blue USTC star — bursts every bubble of the colour it touches */
const WILD_CHANCE = 0.022, STAR_CHANCE = 0.020;

/* ================= helpers ================= */
const clamp = (v, a, b) => v < a ? a : v > b ? b : v;
let rng = Math.random;                    /* QA harness may substitute a seeded rng */
function mulberry(seed) {
  let t = seed >>> 0;
  return function () {
    t += 0x6D2B79F5;
    let r = Math.imul(t ^ (t >>> 15), 1 | t);
    r ^= r + Math.imul(r ^ (r >>> 7), 61 | r);
    return ((r ^ (r >>> 14)) >>> 0) / 4294967296;
  };
}
/* logical (440x760, y down) -> world (y up). World unit = 10 logical px. */
const W = 44, H = 76;
const px2wx = x => (x - LW / 2) / 10;
const px2wy = y => (LH / 2 - y) / 10;
const BR = R / 10;                        /* bubble radius in world units: 2.6 */

/* ================= state ================= */
const S = {
  mode: 'loading',          /* loading | menu | play | pause | over */
  grid: [], descent: 0,
  score: 0, best: 0, wave: 1, shots: 0, popped: 0, dropped: 0, elapsed: 0,
  currentType: 0, nextType: 1,
  projectile: null, aimDeg: 0, aiming: false,
  submitted: false, muted: false,
  overAt: 0,
};
try {
  S.muted = localStorage.getItem('lunaBubbleMute') === '1';
  S.best = +localStorage.getItem('lunaBubbleBest') || 0;
} catch (e) {}

/* ================= audio (WebAudio synth, as the original) ================= */
let AC = null;
function ensureAudio() {
  if (!AC) { try { AC = new (window.AudioContext || window.webkitAudioContext)(); } catch (e) {} }
  if (AC && AC.state === 'suspended') AC.resume();
}
function beep(freq, t0, dur, type, vol, slide) {
  if (!AC || S.muted) return;
  try {
    const t = AC.currentTime + (t0 || 0);
    const o = AC.createOscillator(), g = AC.createGain();
    o.type = type || 'sine'; o.frequency.setValueAtTime(freq, t);
    if (slide) o.frequency.exponentialRampToValueAtTime(Math.max(30, freq + slide), t + dur);
    g.gain.setValueAtTime(vol || 0.1, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g); g.connect(AC.destination);
    o.start(t); o.stop(t + dur + 0.02);
  } catch (e) {}
}
const sndShoot = () => beep(520, 0, 0.07, 'triangle', 0.10, 240);
const sndAttach = () => beep(190, 0, 0.06, 'sine', 0.16, -60);
const sndSwap = () => { beep(740, 0, 0.06, 'sine', 0.09, 220); beep(980, 0.05, 0.07, 'sine', 0.08, 160); };
function sndPop(n) { for (let i = 0; i < Math.min(n, 6); i++) beep(660 + i * 130, i * 0.045, 0.1, 'sine', 0.11); }
function sndBurst(big) { beep(big ? 180 : 240, 0, 0.22, 'sawtooth', 0.05, big ? -120 : -160); beep(1560, 0.02, 0.14, 'sine', 0.07, -500); }
function sndDrop(n) { beep(1180, 0, 0.14, 'sine', 0.10, -420); if (n > 3) beep(1560, 0.08, 0.16, 'sine', 0.08, -300); }
function sndWave() { [659, 784, 988, 1319].forEach((f, i) => beep(f, i * 0.08, 0.2, 'triangle', 0.12)); }
function sndOver() { [523, 440, 349, 262].forEach((f, i) => beep(f, i * 0.13, 0.22, 'triangle', 0.12)); }
function sndClick() { beep(880, 0, 0.05, 'sine', 0.07, 120); }

/* ================= three.js scene =================
   NO-CRASH HARDENING (owner rule, Nov 7): graphics step down gracefully
   (fancy -> plain -> low-power) and ANY failure lands on a recoverable
   error screen with a retry button — never a black/dead screen. */
const container = $('game');
const GFX_TIERS = [
  { aa: true, dpr: 2, env: true },        /* fancy: AA + full DPR + env reflections */
  { aa: false, dpr: 1.5, env: true },     /* plain */
  { aa: false, dpr: 1, env: false },      /* low-power */
];
/* ?gfx=N forces a tier (device testing / QA) */
(function () {
  try {
    const g = new URLSearchParams(location.search).get('gfx');
    if (g === '0' || g === '1' || g === '2') localStorage.setItem('lunaBubbleGfxTier', g);
  } catch (e) {}
})();
let gfxTier = 0;
function gfxFail(msg) {
  try { console.error('[bubble] graphics failure:', msg); } catch (e) {}
  if (gfxTier < GFX_TIERS.length - 1) {
    try { localStorage.setItem('lunaBubbleGfxTier', String(gfxTier + 1)); } catch (e) {}
    location.reload();
    return;
  }
  const el = document.createElement('div');
  el.style.cssText = 'position:fixed;inset:0;z-index:99;background:#04040f;color:#ffd7d7;display:flex;flex-direction:column;gap:14px;align-items:center;justify-content:center;font-size:16px;padding:24px;text-align:center';
  el.innerHTML = '<div style="font-size:40px">🌙</div><div>The game could not start graphics on this device.</div>';
  const b = document.createElement('button');
  b.textContent = '↻ TRY AGAIN';
  b.style.cssText = 'background:linear-gradient(180deg,#ffd94d,#f5a623);border:none;border-bottom:4px solid #b97e0a;color:#3a2400;font-size:17px;font-weight:900;padding:12px 34px;border-radius:999px;cursor:pointer;font-family:inherit';
  b.onclick = () => {
    try { localStorage.setItem('lunaBubbleGfxTier', '0'); } catch (e) {}
    location.reload();
  };
  el.appendChild(b);
  document.body.appendChild(el);
}
try { gfxTier = clamp(parseInt(localStorage.getItem('lunaBubbleGfxTier') || '0', 10) || 0, 0, GFX_TIERS.length - 1); } catch (e) {}
let renderer = null;
try {
  renderer = new THREE.WebGLRenderer({ antialias: GFX_TIERS[gfxTier].aa, powerPreference: gfxTier === 2 ? 'low-power' : 'high-performance' });
  if (!renderer.getContext()) throw new Error('no WebGL context');
} catch (e) {
  gfxFail('renderer creation: ' + (e && e.message));
  throw e;
}
renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, GFX_TIERS[gfxTier].dpr));
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.38;
renderer.domElement.addEventListener('webglcontextlost', ev => { ev.preventDefault(); gfxFail('WebGL context lost'); }, false);
container.appendChild(renderer.domElement);

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x0a1130);
scene.fog = new THREE.FogExp2(0x0a1130, 0.0016);

const camera = new THREE.PerspectiveCamera(42, 3 / 4, 0.1, 400);
let view = { w: 0, h: 0, scale: 1 };
function layout() {
  const wpx = container.clientWidth || innerWidth, hpx = container.clientHeight || innerHeight;
  renderer.setSize(wpx, hpx);
  /* world width shown: the play column plus a margin so the dark scene breathes */
  const worldW = 54;
  const aspect = wpx / hpx;
  const vH = worldW / aspect;                       /* visible world height */
  camera.aspect = aspect;
  /* frame the logical 760 height inside the visible height, anchored to the top */
  const scale = vH / (LH / 10);
  /* distance so the VISIBLE WIDTH at z=0 equals worldW: visW = 2*d*tan(fov/2)*aspect */
  camera.position.set(0, (LH / 10 - vH) / 2, worldW / 2 / (Math.tan(THREE.MathUtils.degToRad(camera.fov / 2)) * aspect));
  camera.updateProjectionMatrix();
  view = { w: wpx, h: hpx, scale };
}
window.addEventListener('resize', layout);

/* lights — bright ambient + a cool key + warm fill; bursts add their own flashes */
scene.add(new THREE.AmbientLight(0x8fa8e8, 1.15));
const keyLight = new THREE.DirectionalLight(0xbfe0ff, 2.1);
keyLight.position.set(-14, 26, 30);
scene.add(keyLight);
const fillLight = new THREE.DirectionalLight(0xffd9a0, 0.85);
fillLight.position.set(18, -8, 24);
scene.add(fillLight);
const rimLight = new THREE.PointLight(0x7a5cff, 90, 120);
rimLight.position.set(0, 30, -14);
scene.add(rimLight);

/* ================= procedural textures ================= */
function canvasTex(w, h, draw) {
  const c = document.createElement('canvas'); c.width = w; c.height = h;
  draw(c.getContext('2d'), w, h);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  return t;
}
/* equirect environment: dark room + softbox strips (reflections only) */
const envTex = canvasTex(1024, 512, (g, w, h) => {
  const grad = g.createLinearGradient(0, 0, 0, h);
  grad.addColorStop(0, '#33479e'); grad.addColorStop(0.5, '#16236b'); grad.addColorStop(1, '#0a1236');
  g.fillStyle = grad; g.fillRect(0, 0, w, h);
  const blob = (x, y, r, col, a) => {
    const rg = g.createRadialGradient(x, y, 0, x, y, r);
    rg.addColorStop(0, col); rg.addColorStop(1, 'rgba(0,0,0,0)');
    g.globalAlpha = a; g.fillStyle = rg; g.fillRect(x - r, y - r, r * 2, r * 2); g.globalAlpha = 1;
  };
  blob(220, 120, 190, '#9fd8ff', 1.0); blob(800, 100, 170, '#ffe9a8', 0.95);
  blob(520, 60, 130, '#b388ff', 0.85); blob(90, 300, 120, '#3fe0c8', 0.6); blob(940, 320, 120, '#ff6b9d', 0.55);
  g.fillStyle = 'rgba(255,255,255,0.95)';
  g.fillRect(120, 66, 260, 20); g.fillRect(640, 52, 300, 18); g.fillRect(380, 130, 240, 16);
});
if (GFX_TIERS[gfxTier].env) {
  try {
    const pmrem = new THREE.PMREMGenerator(renderer);
    scene.environment = pmrem.fromEquirectangular(envTex).texture;
  } catch (e) { /* reflections are decoration — play on without them */ }
}

/* deep-space backdrop: gradient + nebula wash + star points, far behind play */
const bgTex = canvasTex(1024, 1536, (g, w, h) => {
  const grad = g.createLinearGradient(0, 0, 0, h);
  grad.addColorStop(0, '#1a2a78'); grad.addColorStop(0.45, '#0d1748'); grad.addColorStop(1, '#060d2e');
  g.fillStyle = grad; g.fillRect(0, 0, w, h);
  let seed = 1234567;
  const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
  const blob = (x, y, r, col, a) => {
    const rg = g.createRadialGradient(x, y, 0, x, y, r);
    rg.addColorStop(0, col); rg.addColorStop(1, 'rgba(0,0,0,0)');
    g.globalAlpha = a; g.fillStyle = rg; g.fillRect(x - r, y - r, r * 2, r * 2); g.globalAlpha = 1;
  };
  blob(240, 260, 420, '#233a8f', 0.8); blob(820, 420, 460, '#3d1e6e', 0.72);
  blob(520, 900, 520, '#0d3a4a', 0.62); blob(160, 1250, 380, '#4a1030', 0.45); blob(880, 1180, 400, '#123a6e', 0.6);
  for (let i = 0; i < 900; i++) {
    const x = rnd() * w, y = rnd() * h, r = rnd() * 1.7 + 0.3;
    g.globalAlpha = 0.25 + rnd() * 0.75;
    g.fillStyle = rnd() > 0.85 ? '#ffe9a8' : (rnd() > 0.6 ? '#bcd8ff' : '#ffffff');
    g.beginPath(); g.arc(x, y, r, 0, 7); g.fill();
  }
  g.globalAlpha = 1;
});
const bg = new THREE.Mesh(
  new THREE.PlaneGeometry(150, 225),
  new THREE.MeshBasicMaterial({ map: bgTex, fog: false })
);
bg.position.set(0, 6, -46);
scene.add(bg);

/* drifting dust motes in the mid-field */
const DUST_N = 260;
const dustPos = new Float32Array(DUST_N * 3);
const dustVel = new Float32Array(DUST_N * 2);
for (let i = 0; i < DUST_N; i++) {
  dustPos[i * 3] = (Math.random() - 0.5) * 56;
  dustPos[i * 3 + 1] = (Math.random() - 0.5) * 84;
  dustPos[i * 3 + 2] = -16 + Math.random() * 12;
  dustVel[i * 2] = (Math.random() - 0.5) * 0.35;
  dustVel[i * 2 + 1] = 0.12 + Math.random() * 0.4;
}
const dustGeo = new THREE.BufferGeometry();
dustGeo.setAttribute('position', new THREE.BufferAttribute(dustPos, 3));
const dust = new THREE.Points(dustGeo, new THREE.PointsMaterial({
  color: 0x8fb8ff, size: 0.42, transparent: true, opacity: 0.8,
  blending: THREE.AdditiveBlending, depthWrite: false, sizeAttenuation: true,
}));
scene.add(dust);

/* ================= shared geometry/materials ================= */
const sphereGeo = new THREE.SphereGeometry(BR, 40, 28);
const glowTex = canvasTex(128, 128, (g, w, h) => {
  const rg = g.createRadialGradient(64, 64, 2, 64, 64, 64);
  rg.addColorStop(0, 'rgba(255,255,255,0.85)');
  rg.addColorStop(0.25, 'rgba(255,255,255,0.32)');
  rg.addColorStop(0.6, 'rgba(255,255,255,0.08)');
  rg.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = rg; g.fillRect(0, 0, w, h);
});
function glyphTex(draw) {
  return canvasTex(256, 256, (g, w, h) => {
    g.clearRect(0, 0, w, h);
    g.translate(128, 128);
    draw(g);
  });
}
function traceStar(g, r) {
  g.beginPath();
  for (let i = 0; i < 10; i++) {
    const a = -Math.PI / 2 + i * Math.PI / 5, rad = i % 2 ? r * 0.48 : r;
    const x = Math.cos(a) * rad, y = Math.sin(a) * rad;
    i ? g.lineTo(x, y) : g.moveTo(x, y);
  }
  g.closePath();
}
/* pale glyphs, as in the original game's gem art language */
const GLYPHS = [
  glyphTex(g => { g.fillStyle = 'rgba(255,255,255,0.6)'; g.beginPath(); g.arc(0, 0, 58, Math.PI * 0.5, Math.PI * 1.5, false); g.arc(28, 0, 44, Math.PI * 1.5, Math.PI * 0.5, false); g.closePath(); g.fill(); }),
  glyphTex(g => { g.fillStyle = 'rgba(255,255,255,0.6)'; traceStar(g, 60); g.fill(); }),
  glyphTex(g => { g.fillStyle = 'rgba(255,255,255,0.55)'; g.beginPath(); g.arc(0, 0, 56, 0, 7); g.fill(); g.strokeStyle = 'rgba(90,50,0,0.55)'; g.lineWidth = 9; g.beginPath(); g.arc(0, 0, 35, 0, 7); g.stroke(); g.fillStyle = 'rgba(90,50,0,0.5)'; g.beginPath(); g.arc(0, 0, 11, 0, 7); g.fill(); }),
  glyphTex(g => { g.fillStyle = 'rgba(255,255,255,0.55)'; g.beginPath(); g.moveTo(0, -62); g.lineTo(46, -15); g.lineTo(30, 54); g.lineTo(-30, 54); g.lineTo(-46, -15); g.closePath(); g.fill(); g.strokeStyle = 'rgba(255,255,255,0.5)'; g.lineWidth = 3; g.beginPath(); g.moveTo(-46, -15); g.lineTo(46, -15); g.moveTo(0, -62); g.lineTo(-17, -15); g.lineTo(0, 54); g.moveTo(17, -15); g.lineTo(0, 54); g.stroke(); }),
  glyphTex(g => { g.fillStyle = 'rgba(255,255,255,0.5)'; g.beginPath(); g.arc(0, 0, 56, 0, 7); g.fill(); g.fillStyle = 'rgba(255,255,255,0.8)'; g.beginPath(); g.ellipse(-18, -22, 17, 10, -0.6, 0, 7); g.fill(); }),
  glyphTex(g => { g.fillStyle = 'rgba(255,255,255,0.55)'; g.beginPath(); g.arc(0, 0, 52, 0, 7); g.fill(); const rg = g.createRadialGradient(-14, -16, 4, 0, 0, 58); rg.addColorStop(0, 'rgba(255,255,255,0.85)'); rg.addColorStop(1, 'rgba(255,255,255,0)'); g.fillStyle = rg; g.beginPath(); g.arc(0, 0, 56, 0, 7); g.fill(); g.strokeStyle = 'rgba(255,255,255,0.65)'; g.lineWidth = 5; g.beginPath(); g.arc(0, 0, 40, 0.7, 2.5); g.stroke(); }),
];
const wildGlyphTex = glyphTex(g => {
  const grad = g.createLinearGradient(0, -66, 0, 66);
  grad.addColorStop(0, '#fff3b0'); grad.addColorStop(0.5, '#ffcf3d'); grad.addColorStop(1, '#e89b0c');
  g.fillStyle = grad;
  g.beginPath(); g.arc(0, 0, 64, Math.PI * 0.5, Math.PI * 1.5, false); g.arc(31, 0, 48, Math.PI * 1.5, Math.PI * 0.5, false); g.closePath(); g.fill();
  g.strokeStyle = 'rgba(120,70,0,0.6)'; g.lineWidth = 4; g.stroke();
});
const starGlyphTex = glyphTex(g => {
  const grad = g.createLinearGradient(0, -66, 0, 66);
  grad.addColorStop(0, '#cfeaff'); grad.addColorStop(0.5, '#54b8ff'); grad.addColorStop(1, '#1f6fe0');
  traceStar(g, 64); g.fillStyle = grad; g.fill();
  g.strokeStyle = 'rgba(10,50,110,0.65)'; g.lineWidth = 4; g.stroke();
});

/* neon glass: colored transmission-style physical material (fake-glass recipe:
   transparent physical material, env reflections, clearcoat, emissive core) */
function bubbleMaterial(t) {
  const c = new THREE.Color(TYPES[t].color), d = new THREE.Color(TYPES[t].dark);
  /* glossy neon gel: saturated colour body + strong env reflection + clearcoat.
     (No transmission pass — it renders black under software GL and costs a
     full scene render; the env/clearcoat stack gives the same glass read.) */
  return new THREE.MeshPhysicalMaterial({
    color: c.clone(), metalness: 0.05, roughness: 0.08,
    transparent: true, opacity: 0.96,
    clearcoat: 1, clearcoatRoughness: 0.08,
    envMapIntensity: GFX_TIERS[gfxTier].env ? 2.4 : 1.3,
    emissive: c.clone().lerp(d, 0.3), emissiveIntensity: 0.6,
  });
}
const bubbleMats = TYPES.map((_, t) => bubbleMaterial(t));
const wildMat = new THREE.MeshPhysicalMaterial({
  color: 0xffcf3d, metalness: 0.75, roughness: 0.18,
  transparent: true, opacity: 0.98, clearcoat: 1, clearcoatRoughness: 0.08,
  envMapIntensity: 2.2, emissive: 0x8a5c00, emissiveIntensity: 0.8,
});
const starMat = new THREE.MeshPhysicalMaterial({
  color: 0x54b8ff, metalness: 0.3, roughness: 0.1,
  transparent: true, opacity: 0.96, clearcoat: 1, clearcoatRoughness: 0.08,
  envMapIntensity: 2.0, emissive: 0x0d3f8a, emissiveIntensity: 0.9,
});
function glyphMat(tex, opacity) {
  return new THREE.MeshBasicMaterial({ map: tex, transparent: true, opacity: opacity || 0.95, depthWrite: false });
}
const glyphMats = GLYPHS.map(t => glyphMat(t));
const wildGlyphMat = glyphMat(wildGlyphTex);
const starGlyphMat = glyphMat(starGlyphTex);

/* one bubble = glass sphere + additive halo sprite + floating glyph + inner core */
const glyphGeo = new THREE.PlaneGeometry(3.1, 3.1);
const haloGeo = new THREE.PlaneGeometry(8.6, 8.6);
const coreGeo = new THREE.SphereGeometry(1.15, 20, 14);
function makeBubbleMesh(type) {
  const grp = new THREE.Group();
  const isWild = type === WILD, isStar = type === STAR;
  const mat = isWild ? wildMat : isStar ? starMat : bubbleMats[type];
  const glass = new THREE.Mesh(sphereGeo, mat);
  grp.add(glass);
  const core = new THREE.Mesh(coreGeo, new THREE.MeshBasicMaterial({
    color: isWild ? 0xffe9a8 : isStar ? 0x9fd8ff : TYPES[type].color,
    transparent: true, opacity: 0.62, blending: THREE.AdditiveBlending, depthWrite: false,
  }));
  grp.add(core);
  const halo = new THREE.Mesh(haloGeo, new THREE.MeshBasicMaterial({
    map: glowTex, color: isWild ? 0xffcf3d : isStar ? 0x54b8ff : TYPES[type].color,
    transparent: true, opacity: 0.44, blending: THREE.AdditiveBlending, depthWrite: false,
  }));
  halo.position.z = -0.4;
  grp.add(halo);
  const gm = isWild ? wildGlyphMat : isStar ? starGlyphMat : glyphMats[type];
  const glyph = new THREE.Mesh(glyphGeo, gm);
  glyph.position.z = BR * 0.88;
  grp.add(glyph);
  grp.userData = { glass, core, halo, glyph };
  return grp;
}

/* ================= the play field: frame, ceiling, danger line, floor ================= */
const playGroup = new THREE.Group();
scene.add(playGroup);
{
  const steel = new THREE.MeshStandardMaterial({ color: 0x46548c, metalness: 0.85, roughness: 0.35, envMapIntensity: 1.5 });
  const goldTrim = new THREE.MeshStandardMaterial({ color: 0xc9971c, metalness: 0.9, roughness: 0.28, envMapIntensity: 1.4, emissive: 0x4a3000, emissiveIntensity: 0.5 });
  const mkBar = (w, h, x, y, mat) => {
    const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, 1.6), mat || steel);
    m.position.set(x, y, -0.9); playGroup.add(m); return m;
  };
  mkBar(1.5, 76, px2wx(2), 0); mkBar(1.5, 76, px2wx(LW - 2), 0);
  mkBar(46.5, 1.2, 0, px2wy(-4), goldTrim);
  mkBar(46.5, 2.2, 0, px2wy(LH + 8));
  /* rivets down both rails */
  const rivetGeo = new THREE.SphereGeometry(0.32, 10, 8);
  for (let i = 0; i < 16; i++) {
    for (const sx of [-1, 1]) {
      const rv = new THREE.Mesh(rivetGeo, goldTrim);
      rv.position.set(sx * 22.35, 36 - i * 4.8, 0.1);
      playGroup.add(rv);
    }
  }
  /* back panel: subtle printed branding, deep behind the bubbles */
  const panelTex = canvasTex(1024, 1600, (g, w, h) => {
    g.fillStyle = 'rgba(16,24,58,0.92)'; g.fillRect(0, 0, w, h);
    const pg = g.createRadialGradient(w / 2, h * 0.38, 40, w / 2, h * 0.38, 560);
    pg.addColorStop(0, 'rgba(255,207,61,0.20)'); pg.addColorStop(0.55, 'rgba(80,140,255,0.10)'); pg.addColorStop(1, 'rgba(0,0,0,0)');
    g.fillStyle = pg; g.fillRect(0, 0, w, h);
    g.strokeStyle = 'rgba(90,120,220,0.18)'; g.lineWidth = 2;
    for (let x = 0; x <= w; x += 64) { g.beginPath(); g.moveTo(x, 0); g.lineTo(x, h); g.stroke(); }
    for (let y = 0; y <= h; y += 64) { g.beginPath(); g.moveTo(0, y); g.lineTo(w, y); g.stroke(); }
    g.textAlign = 'center';
    g.fillStyle = 'rgba(255,233,168,0.32)';
    g.font = '900 92px system-ui, sans-serif';
    g.fillText('LUNA CLASSIC', w / 2, h * 0.47);
    g.font = '800 54px system-ui, sans-serif';
    g.fillStyle = 'rgba(159,216,255,0.28)';
    g.fillText('LUNC DEV STUDIO', w / 2, h * 0.47 + 92);
    g.strokeStyle = 'rgba(255,207,61,0.36)'; g.lineWidth = 5;
    g.beginPath(); g.arc(w / 2, h * 0.36, 92, Math.PI * 0.5, Math.PI * 1.5, false);
    g.arc(w / 2 + 44, h * 0.36, 70, Math.PI * 1.5, Math.PI * 0.5, false);
    g.closePath(); g.stroke();
  });
  const panel = new THREE.Mesh(new THREE.PlaneGeometry(46, 72), new THREE.MeshBasicMaterial({ map: panelTex, transparent: true }));
  panel.position.set(0, 2, -7.5);
  playGroup.add(panel);
}

/* ceiling piston + LUNA CLASSIC plate (rides at TOPY + descent) */
const ceilingGroup = new THREE.Group();
{
  const steel = new THREE.MeshStandardMaterial({ color: 0x39466e, metalness: 0.88, roughness: 0.3, envMapIntensity: 1.2 });
  const bar = new THREE.Mesh(new THREE.BoxGeometry(45, 2.4, 2.2), steel);
  bar.position.z = -0.4;
  ceilingGroup.add(bar);
  const plateTex = canvasTex(1024, 64, (g, w, h) => {
    g.fillStyle = '#131c3d'; g.fillRect(0, 0, w, h);
    g.strokeStyle = 'rgba(255,207,61,0.85)'; g.lineWidth = 3; g.strokeRect(4, 4, w - 8, h - 8);
    g.fillStyle = '#ffe9a8'; g.font = '900 36px system-ui, sans-serif'; g.textAlign = 'center';
    g.fillText('L U N A   C L A S S I C', w / 2, 44);
  });
  const plate = new THREE.Mesh(new THREE.PlaneGeometry(30, 1.9), new THREE.MeshBasicMaterial({ map: plateTex }));
  plate.position.set(0, 0, 0.75);
  ceilingGroup.add(plate);
  const toothGeo = new THREE.ConeGeometry(0.55, 1.5, 4);
  const toothMat = new THREE.MeshStandardMaterial({ color: 0xffb700, metalness: 0.8, roughness: 0.3, emissive: 0x6e4700, emissiveIntensity: 0.7 });
  for (let i = 0; i < 14; i++) {
    const tooth = new THREE.Mesh(toothGeo, toothMat);
    tooth.rotation.x = Math.PI;
    tooth.position.set(-20.8 + i * 3.2, -1.9, -0.4);
    ceilingGroup.add(tooth);
  }
  ceilingGroup.position.set(0, px2wy(TOPY - 14), 0);
  playGroup.add(ceilingGroup);
}

/* danger line: pulsing red neon strip */
const dangerMat = new THREE.MeshBasicMaterial({ color: 0xff2040, transparent: true, opacity: 0.85 });
const dangerLine = new THREE.Mesh(new THREE.PlaneGeometry(43.5, 0.55), dangerMat);
dangerLine.position.set(0, px2wy(DANGER_Y), -0.6);
playGroup.add(dangerLine);
const dangerHalo = new THREE.Mesh(new THREE.PlaneGeometry(43.5, 2.6), new THREE.MeshBasicMaterial({
  map: glowTex, color: 0xff2040, transparent: true, opacity: 0.22, blending: THREE.AdditiveBlending, depthWrite: false,
}));
dangerHalo.position.copy(dangerLine.position);
playGroup.add(dangerHalo);

/* moon shooter: gold crescent cannon on a branded pedestal */
const shooterGroup = new THREE.Group();
let shooterBarrel, loadedMesh = null, nextMesh = null;
{
  const gold = new THREE.MeshStandardMaterial({ color: 0xd9a821, metalness: 0.9, roughness: 0.25, envMapIntensity: 1.6, emissive: 0x533a00, emissiveIntensity: 0.55 });
  const steel = new THREE.MeshStandardMaterial({ color: 0x46548c, metalness: 0.85, roughness: 0.35, envMapIntensity: 1.5 });
  const base = new THREE.Mesh(new THREE.CylinderGeometry(4.6, 5.4, 1.7, 36), steel);
  base.position.y = -1.2; shooterGroup.add(base);
  const trim = new THREE.Mesh(new THREE.TorusGeometry(4.6, 0.3, 10, 40), gold);
  trim.rotation.x = Math.PI / 2; trim.position.y = -0.4; shooterGroup.add(trim);
  shooterBarrel = new THREE.Group();
  const barrel = new THREE.Mesh(new THREE.CylinderGeometry(1.5, 1.9, 4.6, 24, 1, true), gold);
  barrel.rotation.x = Math.PI / 2; barrel.position.z = 1.4; shooterBarrel.add(barrel);
  const rim = new THREE.Mesh(new THREE.TorusGeometry(1.55, 0.3, 10, 28), gold);
  rim.position.z = 3.6; shooterBarrel.add(rim);
  const cres = new THREE.Mesh(new THREE.TorusGeometry(1.05, 0.34, 10, 24, Math.PI * 1.35), gold);
  cres.rotation.z = Math.PI * 0.82; cres.position.z = 3.65; shooterBarrel.add(cres);
  shooterGroup.add(shooterBarrel);
  /* pedestal wordmark */
  const wmTex = canvasTex(1024, 96, (g, w, h) => {
    g.clearRect(0, 0, w, h);
    g.fillStyle = '#ffe9a8'; g.font = '900 52px system-ui, sans-serif'; g.textAlign = 'center';
    g.fillText('LUNC  DEV  STUDIO', w / 2, 62);
  });
  const wm = new THREE.Mesh(new THREE.PlaneGeometry(17, 1.6), new THREE.MeshBasicMaterial({ map: wmTex, transparent: true }));
  wm.position.set(0, -4.6, 2.2);
  shooterGroup.add(wm);
  shooterGroup.position.set(px2wx(LAUNCH.x), px2wy(LAUNCH.y) - 1.2, 0);
  playGroup.add(shooterGroup);
}
/* next-bubble pedestal (bottom-left, under the DOM swap orb) */
{
  const steel = new THREE.MeshStandardMaterial({ color: 0x46548c, metalness: 0.85, roughness: 0.35, envMapIntensity: 1.5 });
  const gold = new THREE.MeshStandardMaterial({ color: 0xd9a821, metalness: 0.9, roughness: 0.25, envMapIntensity: 1.5, emissive: 0x533a00, emissiveIntensity: 0.5 });
  const ped = new THREE.Mesh(new THREE.CylinderGeometry(3.3, 3.9, 1.1, 28), steel);
  ped.position.set(px2wx(52), px2wy(724), -0.2);
  playGroup.add(ped);
  const ring = new THREE.Mesh(new THREE.TorusGeometry(3.3, 0.24, 10, 32), gold);
  ring.rotation.x = Math.PI / 2;
  ring.position.set(px2wx(52), px2wy(718), -0.2);
  playGroup.add(ring);
}

/* ================= grid logic (ported 1:1 from the original) ================= */
function colCount(r) { return (r % 2 === 0) ? COLS : COLS - 1; }
function playable(r, c) { return r >= 0 && c >= 0 && c < colCount(r); }
function cellX(r, c) { return X0 + R + c * D + (r % 2 ? R : 0); }
function cellY(r) { return TOPY + S.descent + R + r * ROWH; }
function cellVal(r, c) {
  if (!playable(r, c) || r >= S.grid.length) return -1;
  const v = S.grid[r][c];
  return v === undefined ? -1 : v;
}
function ensureRows(n) {
  while (S.grid.length < n) {
    const row = new Array(COLS).fill(-1);
    S.grid.push(row);
  }
}
function neighborsOf(r, c) {
  const out = [[r, c - 1], [r, c + 1]];
  const ds = (r % 2 === 0) ? [[-1, -1], [-1, 0], [1, -1], [1, 0]]
                           : [[-1, 0], [-1, 1], [1, 0], [1, 1]];
  for (const [dr, dc] of ds) out.push([r + dr, c + dc]);
  return out;
}
function typesOnBoard() {
  const s = new Set();
  for (const row of S.grid) for (const v of row) if (v >= 0 && v < WILD) s.add(v);
  return [...s];
}
function typesForWave(w) { return w <= 2 ? 4 : (w <= 4 ? 5 : 6); }
function descentRate() { return Math.min(2.0 + 0.35 * (S.wave - 1), 6); }
function popPoints(n) { return n * POP_BASE + Math.max(0, n - 3) * 15; }
function genRow(r, typeCount) {
  const row = new Array(COLS).fill(-1);
  for (let c = 0; c < colCount(r); c++) {
    if (rng() < 0.88) row[c] = Math.floor(rng() * typeCount);
  }
  return row;
}
function dealWave() {
  S.grid = [];
  const tc = typesForWave(S.wave);
  for (let r = 0; r < WAVE_ROWS; r++) S.grid.push(genRow(r, tc));
}
function insertRows() {
  const tc = typesForWave(S.wave);
  S.grid.unshift(genRow(1, tc));
  S.grid.unshift(genRow(0, tc));
}
function rollSpecial() {
  const x = rng();
  if (x < WILD_CHANCE) return WILD;
  if (x < WILD_CHANCE + STAR_CHANCE) return STAR;
  return -1;
}
function pickLoaded() {
  const sp = rollSpecial();
  if (sp >= 0) return sp;
  const onBoard = typesOnBoard();
  const pool = onBoard.length ? onBoard : [...Array(typesForWave(S.wave)).keys()];
  return pool[Math.floor(rng() * pool.length)];
}
function refreshLoaded() {
  const onBoard = new Set(typesOnBoard());
  const fix = t => (t >= WILD || onBoard.size === 0 || onBoard.has(t)) ? t : [...onBoard][0];
  S.currentType = fix(S.currentType);
  S.nextType = fix(S.nextType);
  syncLoadedMeshes();
}
function lowestBottom() {
  let m = -Infinity;
  for (let r = 0; r < S.grid.length; r++)
    for (let c = 0; c < COLS; c++)
      if (S.grid[r][c] >= 0) m = Math.max(m, cellY(r) + R);
  return m;
}
function boardEmpty() { return typesOnBoard().length === 0 && !S.grid.some(row => row.some(v => v >= WILD)); }
function clusterFrom(r, c) {
  const t = cellVal(r, c);
  if (t < 0) return [];
  const seen = new Set([r + ',' + c]);
  const out = [[r, c]];
  const queue = [[r, c]];
  while (queue.length) {
    const [cr, cc] = queue.shift();
    for (const [nr, nc] of neighborsOf(cr, cc)) {
      const k = nr + ',' + nc;
      if (!seen.has(k) && cellVal(nr, nc) === t) { seen.add(k); out.push([nr, nc]); queue.push([nr, nc]); }
    }
  }
  return out;
}
/* cluster for a just-placed bubble: WILD counts as every colour; a placed STAR
   bursts the whole touched colour; specials already on the board join in */
function matchCluster(r, c) {
  const t = cellVal(r, c);
  if (t === STAR) {
    let best = [];
    for (const [nr, nc] of neighborsOf(r, c)) {
      const nt = cellVal(nr, nc);
      if (nt >= 0 && nt < WILD) {
        const cl = expandCluster([[nr, nc]], nt);
        if (cl.length > best.length) best = cl;
      }
    }
    return { cells: [[r, c], ...best], star: true };
  }
  if (t === WILD) {
    let best = [];
    for (const [nr, nc] of neighborsOf(r, c)) {
      const nt = cellVal(nr, nc);
      if (nt >= 0 && nt < WILD) {
        const cl = expandCluster([[nr, nc]], nt);
        if (cl.length > best.length) best = cl;
      }
    }
    return { cells: [[r, c], ...best], star: false };
  }
  return { cells: expandCluster([[r, c]], t), star: false };
}
function expandCluster(seeds, colour) {
  const seen = new Set(), out = [], queue = [...seeds];
  for (const [r, c] of seeds) seen.add(r + ',' + c);
  while (queue.length) {
    const [cr, cc] = queue.shift();
    out.push([cr, cc]);
    for (const [nr, nc] of neighborsOf(cr, cc)) {
      const k = nr + ',' + nc;
      if (seen.has(k)) continue;
      const v = cellVal(nr, nc);
      if (v === colour || v === WILD) { seen.add(k); queue.push([nr, nc]); }
    }
  }
  return out;
}
function anchoredCells() {
  const seen = new Set();
  const queue = [];
  for (let c = 0; c < colCount(0); c++) {
    if (cellVal(0, c) >= 0) { seen.add('0,' + c); queue.push([0, c]); }
  }
  while (queue.length) {
    const [cr, cc] = queue.shift();
    for (const [nr, nc] of neighborsOf(cr, cc)) {
      const k = nr + ',' + nc;
      if (!seen.has(k) && cellVal(nr, nc) >= 0) { seen.add(k); queue.push([nr, nc]); }
    }
  }
  return seen;
}
function nearestCell(px, py) {
  let r = Math.round((py - TOPY - S.descent - R) / ROWH);
  r = Math.max(0, r);
  const off = (r % 2) ? R : 0;
  let c = Math.round((px - X0 - R - off) / D);
  c = clamp(c, 0, colCount(r) - 1);
  const seen = new Set([r + ',' + c]);
  const queue = [[r, c]];
  while (queue.length) {
    const [cr, cc] = queue.shift();
    if (playable(cr, cc) && cellVal(cr, cc) < 0) return [cr, cc];
    for (const [nr, nc] of neighborsOf(cr, cc)) {
      const k = nr + ',' + nc;
      if (!seen.has(k) && nr <= S.grid.length + 1) { seen.add(k); queue.push([nr, nc]); }
    }
  }
  return null;
}

/* ================= bubble mesh field (mirrors the grid) ================= */
const fieldGroup = new THREE.Group();
scene.add(fieldGroup);
const meshGrid = [];              /* meshGrid[r][c] = Group | null */
function syncRowMeshes(r) {
  while (meshGrid.length <= r) meshGrid.push(new Array(COLS).fill(null));
}
function setCellMesh(r, c) {
  syncRowMeshes(r);
  const old = meshGrid[r][c];
  if (old) { fieldGroup.remove(old); meshGrid[r][c] = null; }
  const t = cellVal(r, c);
  if (t < 0) return;
  const m = makeBubbleMesh(t);
  m.position.set(px2wx(cellX(r, c)), px2wy(cellY(r)), 0);
  fieldGroup.add(m);
  meshGrid[r][c] = m;
}
function rebuildField() {
  for (const row of meshGrid) for (const m of row) if (m) fieldGroup.remove(m);
  meshGrid.length = 0;
  for (let r = 0; r < S.grid.length; r++)
    for (let c = 0; c < COLS; c++)
      if (cellVal(r, c) >= 0) setCellMesh(r, c);
}
function updateFieldPositions() {
  for (let r = 0; r < meshGrid.length; r++)
    for (let c = 0; c < COLS; c++) {
      const m = meshGrid[r] && meshGrid[r][c];
      if (m) m.position.y = px2wy(cellY(r));
    }
  ceilingGroup.position.y = px2wy(TOPY - 14 + S.descent);
}

/* ================= FX: light bursts, rings, shards, floaters =================
   FX CAPS (owner rule): bursts are GPU spikes — hard caps keep them cheap on
   phone GPUs. At most 6 live flashes (only 3 with a real dynamic light, the
   rest are light-free glow sprites), 10 rings, and the shard pool is a fixed
   320-instance recycled buffer that can never grow. */
const FX_MAX_FLASH = 6, FX_MAX_LIGHTS = 3, FX_MAX_RING = 10;
const flashes = [];
const flashPool = [];
function spawnFlash(x, y, colorHex, scale, life) {
  if (flashes.length >= FX_MAX_FLASH) {
    /* recycle the oldest burst instead of stacking another one */
    const old = flashes.shift();
    old.light.intensity = 0; old.spr.material.opacity = 0; old.spr.visible = false;
    flashPool.push(old);
  }
  let f = flashPool.pop();
  if (!f) {
    const light = new THREE.PointLight(0xffffff, 0, 46);
    const spr = new THREE.Mesh(haloGeo, new THREE.MeshBasicMaterial({
      map: glowTex, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false,
    }));
    f = { light, spr };
    scene.add(light); scene.add(spr);
  }
  f.useLight = flashes.filter(o => o.useLight).length < FX_MAX_LIGHTS;
  if (!f.useLight) f.light.intensity = 0;
  f.light.color.setHex(colorHex);
  f.light.position.set(px2wx(x), px2wy(y), 7);
  f.spr.material.color.setHex(colorHex);
  f.spr.position.set(px2wx(x), px2wy(y), 1.2);
  f.t = 0; f.life = life || 0.3; f.scale = scale || 1;
  flashes.push(f);
  return f;
}
function updateFlashes(dt) {
  for (let i = flashes.length - 1; i >= 0; i--) {
    const f = flashes[i];
    f.t += dt;
    const k = f.t / f.life;
    if (k >= 1) {
      f.light.intensity = 0; f.spr.material.opacity = 0;
      f.spr.visible = false;
      flashes.splice(i, 1); flashPool.push(f);
      continue;
    }
    f.spr.visible = true;
    const s = (3 + 11 * k) * f.scale;
    f.spr.scale.set(s, s, 1);
    f.spr.material.opacity = 0.9 * (1 - k);
    f.light.intensity = f.useLight ? 340 * (1 - k) * (1 - k) * f.scale : 0;
  }
}
const rings = [];
const ringGeo = new THREE.RingGeometry(0.86, 1, 40);
function spawnRing(x, y, colorHex) {
  if (rings.length >= FX_MAX_RING) return;
  const m = new THREE.Mesh(ringGeo, new THREE.MeshBasicMaterial({
    color: colorHex, transparent: true, blending: THREE.AdditiveBlending,
    depthWrite: false, side: THREE.DoubleSide,
  }));
  m.position.set(px2wx(x), px2wy(y), 0.8);
  scene.add(m);
  rings.push({ m, t: 0 });
}
function updateRings(dt) {
  for (let i = rings.length - 1; i >= 0; i--) {
    const r = rings[i];
    r.t += dt;
    const k = r.t / 0.45;
    if (k >= 1) { scene.remove(r.m); r.m.material.dispose(); rings.splice(i, 1); continue; }
    const s = BR * (1 + 3.4 * k);
    r.m.scale.set(s, s, 1);
    r.m.material.opacity = 0.85 * (1 - k);
  }
}
/* shard spray — instanced tetrahedra, recycled */
const SHARD_N = 320;
const shardGeo = new THREE.TetrahedronGeometry(0.34);
const shardMat = new THREE.MeshBasicMaterial({ transparent: true, opacity: 0.95 });
const shards = new THREE.InstancedMesh(shardGeo, shardMat, SHARD_N);
shards.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
shards.frustumCulled = false;
scene.add(shards);
const shardData = [];
for (let i = 0; i < SHARD_N; i++) shardData.push({ life: 0, x: 0, y: 0, z: 0, vx: 0, vy: 0, rx: 0, ry: 0, s: 1 });
let shardCursor = 0;
const _m4 = new THREE.Matrix4(), _q = new THREE.Quaternion(), _e = new THREE.Euler(), _v = new THREE.Vector3(), _sv = new THREE.Vector3();
const _col = new THREE.Color();
function typeHex(t) {
  return t === WILD ? 0xffcf3d : t === STAR ? 0x54b8ff : (TYPES[t] ? TYPES[t].color : 0xffffff);
}
function spawnShards(x, y, type, n, power) {
  const hex = typeHex(type);
  for (let i = 0; i < n; i++) {
    const d = shardData[shardCursor];
    const idx = shardCursor;
    shardCursor = (shardCursor + 1) % SHARD_N;
    const a = rng() * Math.PI * 2, sp = (30 + rng() * 90) * (power || 1);
    d.x = x; d.y = y; d.z = rng() * 1.6;
    d.vx = Math.cos(a) * sp; d.vy = Math.sin(a) * sp - 26;
    d.rx = rng() * 9; d.ry = rng() * 9; d.s = 0.6 + rng() * 0.9;
    d.life = 0.5 + rng() * 0.35;
    shards.setColorAt(idx, _col.setHex(hex).multiplyScalar(0.75 + rng() * 0.5));
  }
  if (shards.instanceColor) shards.instanceColor.needsUpdate = true;
}
function updateShards(dt) {
  for (let i = 0; i < SHARD_N; i++) {
    const d = shardData[i];
    if (d.life > 0) {
      d.life -= dt;
      d.vy += 300 * dt;
      d.x += d.vx * dt; d.y += d.vy * dt;
      d.rx += 7 * dt; d.ry += 9 * dt;
      const s = d.s * clamp(d.life / 0.3, 0, 1);
      _e.set(d.rx, d.ry, 0); _q.setFromEuler(_e);
      _v.set(px2wx(d.x), px2wy(d.y), d.z); _sv.set(s, s, s);
      _m4.compose(_v, _q, _sv);
    } else {
      _m4.makeScale(0, 0, 0);
    }
    shards.setMatrixAt(i, _m4);
  }
  shards.instanceMatrix.needsUpdate = true;
}
/* score floaters — HTML overlays projected from world space */
const floaters = [];
const floaterLayer = document.createElement('div');
floaterLayer.style.cssText = 'position:fixed;inset:0;pointer-events:none;z-index:4;overflow:hidden';
document.body.appendChild(floaterLayer);
function addFloater(x, y, text, css) {
  const el = document.createElement('div');
  el.textContent = text;
  el.style.cssText = 'position:absolute;font-weight:900;font-size:22px;letter-spacing:.03em;color:' +
    (css || '#ffd76a') + ';text-shadow:0 0 14px rgba(0,0,0,.65),0 0 22px currentColor;transform:translate(-50%,-50%);white-space:nowrap';
  floaterLayer.appendChild(el);
  floaters.push({ x, y, el, life: 1 });
}
const _pv = new THREE.Vector3();
function updateFloaters(dt) {
  for (let i = floaters.length - 1; i >= 0; i--) {
    const f = floaters[i];
    f.y -= 34 * dt; f.life -= dt;
    if (f.life <= 0) { f.el.remove(); floaters.splice(i, 1); continue; }
    _pv.set(px2wx(f.x), px2wy(f.y), 0).project(camera);
    f.el.style.left = ((_pv.x * 0.5 + 0.5) * view.w) + 'px';
    f.el.style.top = ((-_pv.y * 0.5 + 0.5) * view.h) + 'px';
    f.el.style.opacity = clamp(f.life / 0.55, 0, 1);
  }
}
/* popping bubbles animate: flash + inflate + vanish (over ~0.22s) */
const popAnims = [];
function updatePopAnims(dt) {
  for (let i = popAnims.length - 1; i >= 0; i--) {
    const a = popAnims[i];
    a.t += dt;
    const k = a.t / 0.22;
    if (k >= 1) { fieldGroup.remove(a.mesh); popAnims.splice(i, 1); continue; }
    const s = 1 + 0.85 * k;
    a.mesh.scale.set(s, s, 1);
    const u = a.mesh.userData;
    u.glass.material = a.mat;
    a.mat.opacity = 0.94 * (1 - k);
    u.halo.material.opacity = 0.34 + 0.5 * k;
    u.glyph.material.opacity = 0.95 * (1 - k);
  }
}
/* falling (orphaned) bubbles */
const falling = [];
function updateFalling(dt) {
  for (let i = falling.length - 1; i >= 0; i--) {
    const f = falling[i];
    f.vy += 1500 * dt;
    f.y += f.vy * dt;
    f.mesh.position.set(px2wx(f.x), px2wy(f.y), 0);
    f.mesh.rotation.z += f.spin * dt;
    if (f.y > LH + R) { scene.remove(f.mesh); falling.splice(i, 1); }
  }
}

/* ================= aim guide: dotted neon trajectory with one wall bounce ================= */
const AIM_DOTS = 22;
const aimDots = [];
{
  const dotGeo = new THREE.SphereGeometry(0.34, 10, 8);
  for (let i = 0; i < AIM_DOTS; i++) {
    const m = new THREE.Mesh(dotGeo, new THREE.MeshBasicMaterial({
      color: 0xffffff, transparent: true, opacity: 0.9, blending: THREE.AdditiveBlending, depthWrite: false,
    }));
    m.visible = false;
    scene.add(m);
    aimDots.push(m);
  }
}
function aimVector() {
  const a = S.aimDeg * Math.PI / 180;
  return { x: Math.sin(a), y: -Math.cos(a) };
}
function setAim(deg) { S.aimDeg = clamp(deg, -MAXAIM, MAXAIM); }
function updateAimGuide() {
  const show = S.mode === 'play' && !S.projectile;
  const loadedType = S.currentType;
  const colHex = loadedType === WILD ? 0xffcf3d : loadedType === STAR ? 0x54b8ff : TYPES[loadedType].color;
  for (const d of aimDots) { d.visible = show; d.material.color.setHex(colHex); }
  if (!show) return;
  shooterBarrel.rotation.y = -S.aimDeg * Math.PI / 180;
  const v = aimVector();
  let x = LAUNCH.x, y = LAUNCH.y, vx = v.x, vy = v.y;
  const stepLen = 21;
  let prevT = -1;
  for (let i = 0; i < AIM_DOTS; i++) {
    let t = (i + 1) * stepLen;
    let guard = 0;
    while (guard++ < 4) {
      const nx = x + vx * t, ny = y + vy * t;
      if (nx < R || nx > LW - R) {
        const tw = ((vx > 0 ? LW - R : R) - x) / vx;
        if (tw < t) { x += vx * tw; y += vy * tw; t -= tw; vx = -vx; continue; }
      }
      if (ny - R <= TOPY + S.descent) {
        const tc = (TOPY + S.descent + R - y) / vy;
        if (tc < t) { t = tc; }
      }
      break;
    }
    const fx = x + vx * t, fy = y + vy * t;
    if (fy <= TOPY + S.descent + R + 1) break;      /* reached the ceiling */
    aimDots[i].position.set(px2wx(fx), px2wy(fy), 0.4);
    const pulse = 0.75 + 0.25 * Math.sin(performance.now() / 90 - i * 0.55);
    aimDots[i].scale.setScalar(pulse * (1 - i / (AIM_DOTS * 1.6)));
    if (prevT >= 0 && t < prevT) break;
    prevT = t;
    /* hide dots that would overlap the bubble field */
    let nearField = false;
    outer: for (let r = 0; r < S.grid.length; r++) for (let c = 0; c < COLS; c++) {
      if (cellVal(r, c) < 0) continue;
      const dx = fx - cellX(r, c), dy = fy - cellY(r);
      if (dx * dx + dy * dy < (D + 6) * (D + 6)) { nearField = true; break outer; }
    }
    if (nearField) { for (let j = i; j < AIM_DOTS; j++) aimDots[j].visible = false; break; }
  }
}

/* ================= loaded / next bubble meshes ================= */
function syncLoadedMeshes() {
  if (loadedMesh) { shooterGroup.remove(loadedMesh); loadedMesh = null; }
  if (nextMesh) { scene.remove(nextMesh); nextMesh = null; }
  loadedMesh = makeBubbleMesh(S.currentType);
  loadedMesh.position.set(0, 1.6, 0.6);
  loadedMesh.scale.setScalar(0.92);
  shooterGroup.add(loadedMesh);
  nextMesh = makeBubbleMesh(S.nextType);
  nextMesh.position.set(px2wx(52), px2wy(700), 0);
  nextMesh.scale.setScalar(0.95);
  scene.add(nextMesh);
  $('swapLab').textContent = '⇄ ' + T('swap');
}
let projMesh = null;

/* ================= HUD / banners / toast ================= */
const hudCache = { score: '', wave: '', best: '' };
function hud() {
  const sc = String(S.score), wv = String(S.wave), bs = String(Math.max(S.best, S.score));
  if (hudCache.score !== sc) { $('hudScoreVal').textContent = sc; hudCache.score = sc; }
  if (hudCache.wave !== wv) { $('hudWaveVal').textContent = wv; hudCache.wave = wv; }
  if (hudCache.best !== bs) { $('hudBestVal').textContent = bs; hudCache.best = bs; }
}
let toastTimer = null;
function toast(msg, ms) {
  const t = $('toast');
  t.textContent = msg;
  t.style.opacity = '1';
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { t.style.opacity = '0'; }, ms || 1300);
}
let bannerTimer = null;
function showBanner(main, sub, ms) {
  const bm = $('bannerMain'), bs = $('bannerSub');
  bm.textContent = main || ''; bs.textContent = sub || '';
  bm.classList.remove('fadeout'); bs.classList.remove('fadeout');
  clearTimeout(bannerTimer);
  bannerTimer = setTimeout(() => { bm.classList.add('fadeout'); bs.classList.add('fadeout'); }, ms || 1400);
}

/* ================= game flow ================= */
function startGame() {
  S.score = 0; S.wave = 1; S.shots = 0; S.popped = 0; S.dropped = 0;
  S.elapsed = 0; S.descent = 0; S.projectile = null; S.aimDeg = 0; S.submitted = false;
  for (const a of popAnims) fieldGroup.remove(a.mesh);
  popAnims.length = 0;
  for (const f of falling) scene.remove(f.mesh);
  falling.length = 0;
  if (projMesh) { scene.remove(projMesh); projMesh = null; }
  dealWave();
  rebuildField();
  S.currentType = pickLoaded();
  S.nextType = pickLoaded();
  syncLoadedMeshes();
  S.mode = 'play';
  show(null);
  hud();
  showBanner(T('wave') + ' 1', '', 1100);
}
function endGame() {
  if (S.mode !== 'play') return;
  S.mode = 'over';
  S.overAt = performance.now();
  S.projectile = null;
  if (projMesh) { scene.remove(projMesh); projMesh = null; }
  if (S.score > S.best) {
    S.best = S.score;
    try { localStorage.setItem('lunaBubbleBest', String(S.best)); } catch (e) {}
  }
  sndOver();
  $('overTitle').textContent = T('over');
  $('finalScoreLine').textContent = T('finalScore') + ': ' + S.score;
  $('finalDetail').textContent = T('shotsLine')
    .replace('{w}', S.wave).replace('{p}', S.popped).replace('{d}', S.dropped)
    .replace('{s}', S.shots).replace('{t}', Math.round(S.elapsed));
  $('savedLine').textContent = '';
  $('submitBtn').disabled = false;
  try { $('nameInput').value = localStorage.getItem('lunaBubbleName') || ''; } catch (e) {}
  show('overPanel');
  hud();
}
function waveCleared() {
  const bonus = WAVE_BONUS * S.wave;
  S.score += bonus;
  addFloater(LW / 2, 300, '+' + bonus, '#7dff9a');
  showBanner(T('waveClear').replace('{n}', S.wave), '+' + bonus, 1500);
  sndWave();
  spawnFlash(LW / 2, 240, 0x7dff9a, 1.6, 0.4);
  S.wave++;
  dealWave();
  rebuildField();
  S.currentType = pickLoaded();
  S.nextType = pickLoaded();
  syncLoadedMeshes();
  hud();
}
function doSwap() {
  if (S.mode !== 'play' || S.projectile) return;
  const t = S.currentType; S.currentType = S.nextType; S.nextType = t;
  syncLoadedMeshes();
  sndSwap();
}

/* ================= shooting (original mechanics, ported) ================= */
function fire() {
  if (S.mode !== 'play' || S.projectile) return false;
  const v = aimVector();
  S.projectile = { x: LAUNCH.x, y: LAUNCH.y, vx: v.x * SPEED, vy: v.y * SPEED, type: S.currentType };
  projMesh = makeBubbleMesh(S.currentType);
  projMesh.position.set(px2wx(LAUNCH.x), px2wy(LAUNCH.y), 0);
  scene.add(projMesh);
  if (loadedMesh) { shooterGroup.remove(loadedMesh); loadedMesh = null; }
  S.shots++;
  sndShoot();
  S.currentType = S.nextType;
  S.nextType = pickLoaded();
  nextMeshPending = true;
  return true;
}
let nextMeshPending = false;
function attachProjectile() {
  const p = S.projectile;
  S.projectile = null;
  if (projMesh) { scene.remove(projMesh); projMesh = null; }
  const cell = nearestCell(p.x, p.y);
  if (!cell) { finishAttach(); return; }        /* nowhere to land — fizzles */
  const [r, c] = cell;
  ensureRows(r + 1);
  S.grid[r][c] = p.type;
  setCellMesh(r, c);
  sndAttach();
  const match = matchCluster(r, c);
  const placedIsStar = p.type === STAR;
  if (match.cells.length >= 3 || (placedIsStar && match.cells.length >= 2)) {
    burstCells(match.cells, r, c, placedIsStar);
  }
  finishAttach();
}
function burstCells(cells, ar, ac, starBurst) {
  const n = cells.length;
  const pts = popPoints(n);
  S.score += pts; S.popped += n;
  const big = n >= 6 || starBurst;
  for (const [cr, cc] of cells) {
    const t = S.grid[cr][cc];
    const x = cellX(cr, cc), y = cellY(cr);
    syncRowMeshes(cr);
    const mesh = meshGrid[cr][cc];
    meshGrid[cr][cc] = null;
    S.grid[cr][cc] = -1;
    if (mesh) {
      const mat = mesh.userData.glass.material.clone();
      mesh.userData.glass.material = mat;
      popAnims.push({ mesh, mat, t: 0 });
    }
    spawnFlash(x, y, typeHex(t), big ? 1.35 : 1, big ? 0.38 : 0.3);
    spawnRing(x, y, typeHex(t));
    spawnShards(x, y, t, big ? 9 : 6, big ? 1.5 : 1);
  }
  addFloater(cellX(ar, ac), cellY(ar) - 22, '+' + pts);
  sndPop(n);
  sndBurst(big);
  /* orphans: anything no longer connected to the ceiling drops */
  const anchored = anchoredCells();
  let drops = 0;
  for (let rr = 0; rr < S.grid.length; rr++) {
    for (let cc = 0; cc < COLS; cc++) {
      if (S.grid[rr][cc] >= 0 && !anchored.has(rr + ',' + cc)) {
        const t = S.grid[rr][cc];
        syncRowMeshes(rr);
        const mesh = meshGrid[rr][cc];
        meshGrid[rr][cc] = null;
        S.grid[rr][cc] = -1;
        if (mesh) {
          scene.attach(mesh);
          falling.push({ mesh, x: cellX(rr, cc), y: cellY(rr), vy: 60, spin: (rng() - 0.5) * 4 });
        }
        drops++;
      }
    }
  }
  if (drops) {
    const dPts = drops * DROP_POINTS;
    S.score += dPts; S.dropped += drops;
    addFloater(cellX(ar, ac), cellY(ar) + 30, '+' + dPts, '#9fd8ff');
    sndDrop(drops);
    toast('💧 ' + T('dropped').replace('{n}', drops) + ' +' + dPts);
  }
}
function finishAttach() {
  if (nextMeshPending) { syncLoadedMeshes(); nextMeshPending = false; }
  if (S.mode !== 'play') return;
  if (boardEmpty()) { waveCleared(); return; }
  refreshLoaded();
  hud();
  if (lowestBottom() > DANGER_Y) endGame();
}
function stepProjectile(dt) {
  const p = S.projectile;
  if (!p) return;
  const sub = 2;
  for (let i = 0; i < sub && S.projectile; i++) {
    p.x += p.vx * dt / sub;
    p.y += p.vy * dt / sub;
    if (p.x < R) { p.x = R; p.vx = Math.abs(p.vx); }
    if (p.x > LW - R) { p.x = LW - R; p.vx = -Math.abs(p.vx); }
    if (p.y - R <= TOPY + S.descent) { attachProjectile(); return; }
    let hit = false;
    for (let r = 0; r < S.grid.length && !hit; r++) {
      for (let c = 0; c < COLS; c++) {
        if (S.grid[r][c] < 0) continue;
        const dx = p.x - cellX(r, c), dy = p.y - cellY(r);
        if (dx * dx + dy * dy < (D - 2) * (D - 2)) { hit = true; break; }
      }
    }
    if (hit) { attachProjectile(); return; }
  }
  if (projMesh) projMesh.position.set(px2wx(p.x), px2wy(p.y), 0);
}

/* ================= update ================= */
function update(dt) {
  if (S.mode === 'play') {
    S.elapsed += dt;
    S.descent += descentRate() * dt;
    while (S.descent >= 2 * ROWH) {
      S.descent -= 2 * ROWH;
      insertRows();
      rebuildField();
    }
    stepProjectile(dt);
    if (S.mode === 'play' && lowestBottom() > DANGER_Y) endGame();
    updateFieldPositions();
  }
  updatePopAnims(dt);
  updateFalling(dt);
  updateFlashes(dt);
  updateRings(dt);
  updateShards(dt);
  updateFloaters(dt);
  /* dust drift */
  const dp = dustGeo.attributes.position.array;
  for (let i = 0; i < DUST_N; i++) {
    dp[i * 3] += dustVel[i * 2] * dt;
    dp[i * 3 + 1] += dustVel[i * 2 + 1] * dt;
    if (dp[i * 3 + 1] > 44) dp[i * 3 + 1] = -44;
    if (dp[i * 3] > 30) dp[i * 3] = -30; else if (dp[i * 3] < -30) dp[i * 3] = 30;
  }
  dustGeo.attributes.position.needsUpdate = true;
  /* danger line pulse — faster when bubbles get close */
  const danger = clamp(1 - (DANGER_Y - lowestBottomSafe()) / 260, 0, 1);
  const pulse = 0.65 + 0.35 * Math.sin(performance.now() / (danger > 0.55 ? 110 : 260));
  dangerMat.opacity = 0.55 + 0.45 * pulse * (0.5 + danger * 0.5);
  dangerHalo.material.opacity = 0.12 + 0.3 * pulse * danger + 0.08;
  dangerLine.scale.x = 1 + 0.006 * Math.sin(performance.now() / 300);
}
function lowestBottomSafe() {
  if (S.mode !== 'play' && S.mode !== 'pause') return -Infinity;
  return lowestBottom();
}

/* ================= screens / UI wiring ================= */
const SCREENS = ['menu', 'howPanel', 'boardPanel', 'pausePanel', 'overPanel'];
function show(id) {
  for (const s of SCREENS) $(s).classList.toggle('hidden', s !== id);
  $('menu').classList.toggle('hidden', id !== 'menu');
  const inRun = S.mode === 'play' || S.mode === 'pause';
  $('hud').classList.toggle('hidden', !(inRun || S.mode === 'over'));
  $('swapBtn').classList.toggle('hidden', !inRun);
}
function applyLang() {
  document.documentElement.lang = LANG_CUR;
  document.documentElement.dir = LANG_CUR === 'ar' ? 'rtl' : 'ltr';
  $('menuTag').textContent = T('tag');
  $('playBtn').textContent = T('play');
  $('howBtn').textContent = T('how');
  $('boardBtn').textContent = T('board');
  $('howBtn2').textContent = T('how');
  $('howTitle').textContent = T('howTitle');
  $('howBody').innerHTML = T('howBody');
  $('howClose').textContent = T('close');
  $('boardTitle').textContent = T('board');
  $('tabAll').textContent = T('allTime');
  $('tabWeek').textContent = T('week');
  $('boardClose').textContent = T('close');
  $('labScore').textContent = T('score');
  $('labWave').textContent = T('wave');
  $('labBest').textContent = T('best');
  $('pauseTitle').textContent = T('paused');
  $('resumeBtn').textContent = T('resume');
  $('quitBtn').textContent = T('quit');
  $('submitBtn').textContent = T('submit');
  $('againBtn').textContent = T('again');
  $('overBoardBtn').textContent = T('board');
  $('menuBtn').textContent = T('menu');
  $('nameInput').placeholder = T('namePh');
  $('secStrip').textContent = SECTXT();
  $('swapLab').textContent = '⇄ ' + T('swap');
  const sel = $('langSel');
  sel.innerHTML = '';
  for (const [code, name] of LANGS) {
    const o = document.createElement('option');
    o.value = code; o.textContent = name;
    if (code === LANG_CUR) o.selected = true;
    sel.appendChild(o);
  }
  hudCache.score = hudCache.wave = hudCache.best = '';
  hud();
}
$('langSel').addEventListener('change', e => {
  LANG_CUR = e.target.value;
  try { localStorage.setItem('lunaBubbleLang', LANG_CUR); } catch (err) {}
  applyLang();
  renderBoard();
});
$('playBtn').addEventListener('click', () => { ensureAudio(); sndClick(); startGame(); });
$('againBtn').addEventListener('click', () => { ensureAudio(); sndClick(); startGame(); });
$('menuBtn').addEventListener('click', () => { sndClick(); S.mode = 'menu'; show('menu'); });
$('howBtn').addEventListener('click', () => { sndClick(); show('howPanel'); });
$('howBtn2').addEventListener('click', () => { sndClick(); show('howPanel'); });
$('howClose').addEventListener('click', () => { sndClick(); show(S.mode === 'pause' ? 'pausePanel' : S.mode === 'play' ? null : 'menu'); if (S.mode === 'menu') show('menu'); });
$('boardBtn').addEventListener('click', () => { sndClick(); openBoard(); });
$('overBoardBtn').addEventListener('click', () => { sndClick(); openBoard(); });
$('boardClose').addEventListener('click', () => { sndClick(); show(S.mode === 'over' ? 'overPanel' : S.mode === 'pause' ? 'pausePanel' : 'menu'); });
$('pauseBtn').addEventListener('click', () => { if (S.mode === 'play') pauseGame(); });
$('resumeBtn').addEventListener('click', () => resumeGame());
$('quitBtn').addEventListener('click', () => { sndClick(); S.mode = 'menu'; S.projectile = null; if (projMesh) { scene.remove(projMesh); projMesh = null; } show('menu'); });
$('muteBtn').addEventListener('click', () => {
  S.muted = !S.muted;
  try { localStorage.setItem('lunaBubbleMute', S.muted ? '1' : '0'); } catch (e) {}
  $('muteBtn').textContent = S.muted ? '🔇' : '🔊';
  if (!S.muted) { ensureAudio(); sndClick(); }
});
$('swapBtn').addEventListener('click', e => { e.stopPropagation(); ensureAudio(); doSwap(); });
function pauseGame() {
  if (S.mode !== 'play') return;
  S.mode = 'pause';
  show('pausePanel');
  sndClick();
}
function resumeGame() {
  if (S.mode !== 'pause') return;
  S.mode = 'play';
  show(null);
  sndClick();
}

/* ================= leaderboard (shared router, game=bubble) ================= */
let boardData = null, boardTab = 'all';
async function loadBoard() {
  try { const r = await fetch('/api/luna-games?game=bubble'); boardData = await r.json(); } catch (e) { boardData = null; }
  renderBoard();
}
function renderBoard() {
  const body = $('boardBody');
  if (!body) return;
  const rows = boardData && boardData[boardTab];
  if (!rows) { body.innerHTML = `<div style="text-align:center;padding:12px">${T('loading')}</div>`; return; }
  if (!rows.length) { body.innerHTML = `<div style="text-align:center;padding:12px">${T('noScores')}</div>`; return; }
  body.innerHTML = '<table class="board">' + rows.map((r, i) =>
    `<tr><td>${i + 1}</td><td class="nm"></td><td class="sc">${Math.floor(r.score).toLocaleString()}</td></tr>`).join('') + '</table>';
  body.querySelectorAll('td.nm').forEach((td, i) => { td.textContent = rows[i].name; });
}
function openBoard() { show('boardPanel'); loadBoard(); }
$('tabAll').addEventListener('click', () => { boardTab = 'all'; $('tabAll').classList.add('on'); $('tabWeek').classList.remove('on'); renderBoard(); });
$('tabWeek').addEventListener('click', () => { boardTab = 'week'; $('tabWeek').classList.add('on'); $('tabAll').classList.remove('on'); renderBoard(); });
async function submitScore() {
  if (S.submitted) return;
  const name = $('nameInput').value.trim();
  if (name.length < 2) { $('nameInput').focus(); return; }
  S.submitted = true;
  $('submitBtn').disabled = true;
  try { localStorage.setItem('lunaBubbleName', name); } catch (e) {}
  try {
    const r = await fetch('/api/luna-games?game=bubble', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name, score: Math.floor(S.score), seconds: Math.max(10, Math.floor(S.elapsed)) }),
    });
    const j = await r.json();
    $('savedLine').textContent = j && j.rank ? T('rank').replace('{n}', j.rank) : T('saved');
  } catch (e) {
    $('savedLine').textContent = T('saved');
  }
  loadBoard();
}
$('submitBtn').addEventListener('click', submitScore);

/* ================= input: drag to aim, release to fire (the original) ================= */
function toLogical(cx, cy) {
  const wpx = view.w, hpx = view.h;
  const worldW = 54, vH = worldW / (wpx / hpx);
  const wx = (cx / wpx - 0.5) * worldW;
  const wyTop = (cy / hpx) * vH;
  return { x: wx * 10 + LW / 2, y: LH - wyTop * 10 };
}
function aimFromPoint(p) {
  const dx = p.x - LAUNCH.x, dy = LAUNCH.y - p.y;
  if (dy < 8 && Math.abs(dx) < 8) return;
  setAim(Math.atan2(dx, Math.max(dy, -40)) * 180 / Math.PI);
}
const cv = renderer.domElement;
cv.addEventListener('pointerdown', e => {
  ensureAudio();
  if (S.mode !== 'play') return;
  S.aiming = true;
  aimFromPoint(toLogical(e.clientX, e.clientY));
});
cv.addEventListener('pointermove', e => {
  if (!S.aiming || S.mode !== 'play') return;
  aimFromPoint(toLogical(e.clientX, e.clientY));
});
function releaseFire() {
  if (!S.aiming) return;
  S.aiming = false;
  if (S.mode === 'play') fire();
}
cv.addEventListener('pointerup', releaseFire);
cv.addEventListener('pointercancel', () => { S.aiming = false; });
cv.addEventListener('contextmenu', e => e.preventDefault());
window.addEventListener('keydown', e => {
  if (e.code === 'ArrowLeft') setAim(S.aimDeg - 3);
  else if (e.code === 'ArrowRight') setAim(S.aimDeg + 3);
  else if (e.code === 'Space') { ensureAudio(); if (S.mode === 'play') { e.preventDefault(); fire(); } }
  else if (e.code === 'KeyS') doSwap();
  else if (e.code === 'Escape') { if (S.mode === 'play') pauseGame(); else if (S.mode === 'pause') resumeGame(); }
});

/* ================= main loop ================= */
const clock = new THREE.Clock();
/* frame watchdog: sustained slow frames step the DPR down once (fancy keeps
   its look on healthy phones; struggling GPUs shed resolution, not frames) */
let slowFrames = 0, dprStepped = false;
function frame() {
  requestAnimationFrame(frame);
  const rawDt = clock.getDelta() || 0.016;
  if (!dprStepped && rawDt > 0.05 && S.mode === 'play') {
    if (++slowFrames > 90) {
      dprStepped = true;
      renderer.setPixelRatio(1);
    }
  } else if (rawDt <= 0.034) {
    slowFrames = Math.max(0, slowFrames - 2);
  }
  const dt = Math.min(rawDt, 0.05);
  const now = performance.now();
  if (S.mode !== 'pause') update(dt);
  updateAimGuide();
  /* idle menu sway: gentle bubble bob on the menu backdrop field */
  const t = now / 1000;
  for (let r = 0; r < meshGrid.length; r++)
    for (let c = 0; c < COLS; c++) {
      const m = meshGrid[r] && meshGrid[r][c];
      if (m) m.position.x = px2wx(cellX(r, c)) + Math.sin(t * 0.7 + r * 1.3 + c * 0.8) * 0.05;
    }
  try {
    renderer.render(scene, camera);
  } catch (e) {
    gfxFail('render: ' + (e && e.message));
  }
}

/* ================= boot ================= */
layout();
applyLang();
$('muteBtn').textContent = S.muted ? '🔇' : '🔊';
dealWave();
rebuildField();
S.currentType = pickLoaded();
S.nextType = pickLoaded();
syncLoadedMeshes();
hud();
requestAnimationFrame(frame);
setTimeout(() => { $('loadFill').style.width = '72%'; }, 60);
setTimeout(() => {
  $('loadFill').style.width = '100%';
  setTimeout(() => {
    $('loading').classList.add('hidden');
    S.mode = 'menu';
    show('menu');
  }, 160);
}, 420);
/* safety: never strand the player on the loading screen */
setTimeout(() => {
  if (S.mode === 'loading') {
    $('loading').classList.add('hidden');
    S.mode = 'menu';
    show('menu');
  }
}, 4000);

/* ================= QA hooks (used by the automated owner-style checks) ================= */
window.__qa = {
  S, TYPES, WILD, STAR,
  startGame, fire, doSwap, endGame, setAim,
  cellVal, cellX, cellY, typesOnBoard, lowestBottom,
  setGrid(rows) {
    S.grid = rows.map(r => { const a = new Array(COLS).fill(-1); r.forEach((v, i) => { a[i] = v; }); return a; });
    S.descent = 0;
    rebuildField();
    refreshLoaded();
  },
  placeAndAttach(r, c, type) {
    ensureRows(r + 1);
    S.grid[r][c] = type;
    setCellMesh(r, c);
    const m = matchCluster(r, c);
    if (m.cells.length >= 3 || (type === STAR && m.cells.length >= 2)) burstCells(m.cells, r, c, type === STAR);
    finishAttach();
  },
  boardCount() { let n = 0; for (const row of S.grid) for (const v of row) if (v >= 0) n++; return n; },
};
