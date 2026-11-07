/* ============================================================
   LUNA BLASTER — full-3D space blaster (Three.js r160)
   LUNC Dev Studio · Luna Classic
   Design (own game, NOT a Defender reskin): you guard the MOON GATE
   at the rim of the Shattered Belt. Enemies fly DOWN the screen in
   3D space; your gunship flies a free 2D plane (house joystick).
   Cannons auto-fire; the FIRE button is a Nova Burst that clears
   enemy shots. Sector boss: the VOID DREADNOUGHT.
   Pickups: LUNC gold crescents + USTC blue stars ONLY.
   ============================================================ */
import * as THREE from 'three';

/* ---------------- helpers ---------------- */
const $ = id => document.getElementById(id);
const clamp = (v, a, b) => v < a ? a : v > b ? b : v;
const rand = (a, b) => a + Math.random() * (b - a);
const esc = s => String(s || '').replace(/</g, '&lt;');

/* ---------------- i18n ---------------- */
let LANG_CUR = 'en';
try {
  const s = localStorage.getItem('lunaBlasterLang');
  if (s && I18N[s]) LANG_CUR = s;
  else { const n = (navigator.language || 'en').slice(0, 2); if (I18N[n]) LANG_CUR = n; }
} catch (e) {}
function T(k) { return (I18N[LANG_CUR] && I18N[LANG_CUR][k]) || I18N.en[k] || k; }
function applyLang() {
  document.querySelectorAll('[data-i18n]').forEach(el => { el.textContent = T(el.getAttribute('data-i18n')); });
  document.querySelectorAll('[data-i18n-html]').forEach(el => { el.innerHTML = T(el.getAttribute('data-i18n-html')); });
  $('nameInput').placeholder = T('namePh');
  $('fireBtn').textContent = 'FIRE';
  $('hpLabel').textContent = T('bossName');
  updateBestLine();
  document.documentElement.lang = LANG_CUR;
  document.documentElement.dir = LANG_CUR === 'ar' ? 'rtl' : 'ltr';
}
const langSel = $('langSel');
LANGS.forEach(([code, label]) => { const o = document.createElement('option'); o.value = code; o.textContent = label; langSel.appendChild(o); });
langSel.value = LANG_CUR;
langSel.addEventListener('change', () => {
  if (I18N[langSel.value]) { LANG_CUR = langSel.value; try { localStorage.setItem('lunaBlasterLang', LANG_CUR); } catch (e) {} applyLang(); }
});

/* ---------------- audio (synth, no assets) ---------------- */
let AC = null, muted = false;
try { muted = localStorage.getItem('lunaBlasterMuted') === '1'; } catch (e) {}
function ac() { if (!AC) { try { AC = new (window.AudioContext || window.webkitAudioContext)(); } catch (e) {} } if (AC && AC.state === 'suspended') AC.resume(); return AC; }
function beep(f0, f1, dur, type, vol) {
  if (muted) return; const c = ac(); if (!c) return;
  const o = c.createOscillator(), g = c.createGain(), t = c.currentTime;
  o.type = type || 'square'; o.frequency.setValueAtTime(f0, t);
  o.frequency.exponentialRampToValueAtTime(Math.max(20, f1), t + dur);
  g.gain.setValueAtTime(vol || 0.05, t); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  o.connect(g); g.connect(c.destination); o.start(t); o.stop(t + dur + 0.02);
}
const sfx = {
  shot() { beep(880, 220, 0.07, 'square', 0.018); },
  boom() { beep(160, 40, 0.28, 'sawtooth', 0.07); },
  bigBoom() { beep(110, 24, 0.6, 'sawtooth', 0.1); },
  hit() { beep(300, 90, 0.18, 'triangle', 0.08); },
  coin() { beep(1180, 1560, 0.1, 'sine', 0.05); },
  star() { beep(880, 1760, 0.22, 'sine', 0.06); },
  nova() { beep(1200, 60, 0.45, 'sawtooth', 0.09); },
  power() { beep(520, 1040, 0.18, 'triangle', 0.06); },
  alarm() { beep(196, 196, 0.16, 'square', 0.06); setTimeout(() => beep(196, 196, 0.16, 'square', 0.06), 200); },
};

/* ---------------- three setup ---------------- */
/* CRASH-PROOF GRAPHICS (owner rule, Oct 18 lesson): fancy -> plain -> low.
   Stage comes from the crash-guard script in index.html (window.__gfxStage,
   persisted in localStorage; the RELOAD button steps it up). Renderer
   creation itself falls back stepwise; a lost WebGL context reloads into
   the next stage instead of leaving a black screen. */
const GFX_STAGE = Math.min(2, Math.max(0, window.__gfxStage || 0));
function makeRenderer(stage) {
  const opts = stage === 0
    ? { antialias: true, powerPreference: 'high-performance' }
    : stage === 1
      ? { antialias: true, powerPreference: 'default' }
      : { antialias: false, powerPreference: 'low-power', stencil: false, depth: true };
  return new THREE.WebGLRenderer(opts);
}
let renderer = null;
let gfxActive = GFX_STAGE;
for (let s = GFX_STAGE; s <= 2 && !renderer; s++) {
  try { renderer = makeRenderer(s); gfxActive = s; } catch (e) { renderer = null; }
}
if (!renderer) { if (window.__showFail) window.__showFail(); throw new Error('no-webgl'); }
try { localStorage.setItem('lunaBlasterStage', String(gfxActive)); } catch (e) {}
window.__gfxActive = gfxActive;
renderer.domElement.addEventListener('webglcontextlost', (ev) => {
  ev.preventDefault();
  try { localStorage.setItem('lunaBlasterStage', String(Math.min(2, gfxActive + 1))); } catch (e) {}
  location.reload();
});
renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, gfxActive === 2 ? 1 : 1.5));
const isCoarsePointer = window.matchMedia && window.matchMedia('(pointer: coarse)').matches;
renderer.shadowMap.enabled = !isCoarsePointer && gfxActive === 0;   // desktop stage-0 keeps full shadows; phones/step-downs keep the look via lights + materials
if (renderer.shadowMap.enabled) renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.toneMapping = gfxActive === 2 ? THREE.NoToneMapping : THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.12;
$('game').appendChild(renderer.domElement);

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x0a0618);
scene.fog = new THREE.FogExp2(0x0d0722, 0.005);

const camera = new THREE.PerspectiveCamera(58, 1, 0.1, 400);
camera.position.set(0, 0, 46);

/* visible play bounds at z=0 */
let VW = 30, VH = 46;
function computeBounds() {
  const d = camera.position.z;
  VH = 2 * d * Math.tan(THREE.MathUtils.degToRad(camera.fov / 2));
  VW = VH * camera.aspect;
}
function resize() {
  const w = window.innerWidth, h = window.innerHeight;
  renderer.setSize(w, h);
  camera.aspect = w / h; camera.updateProjectionMatrix();
  computeBounds();
  parkGate();
}
window.addEventListener('resize', resize);

/* lights */
scene.add(new THREE.AmbientLight(0x554488, 1.9));
const hemi = new THREE.HemisphereLight(0x8a7dff, 0x1a0b2e, 0.85);
scene.add(hemi);
const key = new THREE.DirectionalLight(0xfff2d8, 2.6);
key.position.set(14, 22, 30); key.castShadow = true;
key.shadow.mapSize.set(1024, 1024);
key.shadow.camera.left = -26; key.shadow.camera.right = 26;
key.shadow.camera.top = 30; key.shadow.camera.bottom = -30;
key.shadow.camera.far = 90;
scene.add(key);
const rim = new THREE.DirectionalLight(0x7a5cff, 1.7);
rim.position.set(-18, -8, 12); scene.add(rim);
const shipLight = new THREE.PointLight(0xffcf3d, 30, 26, 1.6); scene.add(shipLight);
if (gfxActive === 2) shipLight.visible = false;   // low stage: one less dynamic light

/* ---------------- procedural textures ---------------- */
function canvasTex(w, h, draw) {
  const c = document.createElement('canvas'); c.width = w; c.height = h;
  draw(c.getContext('2d'), w, h);
  const t = new THREE.CanvasTexture(c); t.anisotropy = 4; return t;
}
const deckTex = canvasTex(512, 512, (g, w, h) => {
  g.fillStyle = '#241a3e'; g.fillRect(0, 0, w, h);
  g.strokeStyle = 'rgba(150,120,255,.28)'; g.lineWidth = 2;
  for (let i = 0; i <= 4; i++) { g.beginPath(); g.moveTo(i * 128, 0); g.lineTo(i * 128, h); g.stroke(); g.beginPath(); g.moveTo(0, i * 128); g.lineTo(w, i * 128); g.stroke(); }
  g.fillStyle = 'rgba(255,207,61,.10)';
  for (let i = 0; i < 26; i++) g.fillRect(Math.random() * w, Math.random() * h, 3, 3);
  g.fillStyle = 'rgba(120,90,220,.16)'; g.font = '900 44px sans-serif'; g.textAlign = 'center';
  g.fillText('LUNA CLASSIC', w / 2, h / 2 - 8);
  g.font = '800 22px sans-serif'; g.fillStyle = 'rgba(255,207,61,.20)';
  g.fillText('LUNC DEV STUDIO', w / 2, h / 2 + 30);
});
deckTex.wrapS = deckTex.wrapT = THREE.RepeatWrapping; deckTex.repeat.set(3, 6);
const rockTex = canvasTex(256, 256, (g, w, h) => {
  g.fillStyle = '#4a3a5e'; g.fillRect(0, 0, w, h);
  for (let i = 0; i < 900; i++) { g.fillStyle = `rgba(${20 + Math.random() * 60 | 0},${14 + Math.random() * 40 | 0},${40 + Math.random() * 60 | 0},.5)`; g.beginPath(); g.arc(Math.random() * w, Math.random() * h, 2 + Math.random() * 12, 0, 7); g.fill(); }
  g.strokeStyle = 'rgba(0,0,0,.35)'; for (let i = 0; i < 14; i++) { g.beginPath(); let x = Math.random() * w, y = Math.random() * h; g.moveTo(x, y); for (let j = 0; j < 4; j++) { x += rand(-40, 40); y += rand(-40, 40); g.lineTo(x, y); } g.stroke(); }
});
const shipTex = canvasTex(256, 256, (g, w, h) => {
  const gr = g.createLinearGradient(0, 0, w, h); gr.addColorStop(0, '#f4f6ff'); gr.addColorStop(.5, '#b9c2d9'); gr.addColorStop(1, '#7e8aa8');
  g.fillStyle = gr; g.fillRect(0, 0, w, h);
  g.strokeStyle = 'rgba(40,50,90,.5)'; g.lineWidth = 3;
  for (let i = 0; i < 5; i++) { g.beginPath(); g.moveTo(0, i * 64); g.lineTo(w, i * 64); g.stroke(); }
  g.fillStyle = '#c9971c'; g.beginPath(); g.arc(w / 2, h / 2, 52, 0, 7); g.fill();
  g.fillStyle = '#8a5f04'; g.beginPath(); g.arc(w / 2 + 20, h / 2 - 12, 44, 0, 7); g.fill();
  g.fillStyle = '#f4f6ff'; g.beginPath(); g.arc(w / 2 + 20, h / 2 - 12, 44, 0, 7); g.fill();
  g.fillStyle = '#20294d'; g.font = '900 21px sans-serif'; g.textAlign = 'center'; g.fillText('LUNA CLASSIC', w / 2, h - 26);
});
const gateRingTex = canvasTex(512, 128, (g, w, h) => {
  g.fillStyle = '#17102c'; g.fillRect(0, 0, w, h);
  g.fillStyle = '#ffcf3d'; g.font = '900 52px sans-serif'; g.textAlign = 'center'; g.fillText('LUNA CLASSIC', w / 2, 58);
  g.fillStyle = '#9d86ff'; g.font = '800 26px sans-serif'; g.fillText('LUNC DEV STUDIO', w / 2, 98);
  g.strokeStyle = 'rgba(255,207,61,.8)'; g.lineWidth = 4; g.strokeRect(4, 4, w - 8, h - 8);
});

/* materials */
const MAT = {
  gold:   new THREE.MeshStandardMaterial({ color: 0xffcf3d, metalness: 0.9, roughness: 0.3, emissive: 0x664d00, emissiveIntensity: 0.5 }),
  goldFlat: new THREE.MeshBasicMaterial({ color: 0xffcf3d }),
  shipHull: new THREE.MeshStandardMaterial({ map: shipTex, metalness: 0.55, roughness: 0.35 }),
  shipDark: new THREE.MeshStandardMaterial({ color: 0x2a3350, metalness: 0.8, roughness: 0.4 }),
  cockpit: new THREE.MeshStandardMaterial({ color: 0x63d8ff, metalness: 0.2, roughness: 0.1, emissive: 0x1a5f88, emissiveIntensity: 0.9 }),
  flame:  new THREE.MeshBasicMaterial({ color: 0xff9d3d }),
  flameIn: new THREE.MeshBasicMaterial({ color: 0xfff3b0 }),
  violet: new THREE.MeshStandardMaterial({ color: 0x8b3dff, metalness: 0.6, roughness: 0.3, emissive: 0x3d0f80, emissiveIntensity: 0.9 }),
  violetEye: new THREE.MeshBasicMaterial({ color: 0xff4dd8 }),
  amber:  new THREE.MeshStandardMaterial({ color: 0xff9d1e, metalness: 0.7, roughness: 0.3, emissive: 0x7a3c00, emissiveIntensity: 0.7 }),
  teal:   new THREE.MeshStandardMaterial({ color: 0x12b5a5, metalness: 0.7, roughness: 0.3, emissive: 0x00584f, emissiveIntensity: 0.8 }),
  tealEye: new THREE.MeshBasicMaterial({ color: 0x7dffce }),
  rock:   new THREE.MeshStandardMaterial({ map: rockTex, roughness: 0.95, metalness: 0.05 }),
  bossHull: new THREE.MeshStandardMaterial({ color: 0x4a2c4e, metalness: 0.85, roughness: 0.35, emissive: 0x2b0014, emissiveIntensity: 0.5 }),
  bossPanel: new THREE.MeshStandardMaterial({ color: 0x8a5a3a, metalness: 0.75, roughness: 0.4, emissive: 0x331a00, emissiveIntensity: 0.4 }),
  bossRed: new THREE.MeshBasicMaterial({ color: 0xff2e4d }),
  bossCore: new THREE.MeshStandardMaterial({ color: 0xff5d7a, emissive: 0xff1e46, emissiveIntensity: 2.2, roughness: 0.3 }),
  bullet: new THREE.MeshBasicMaterial({ color: 0xffe98a }),
  bulletGlow: new THREE.MeshBasicMaterial({ color: 0xffb52e, transparent: true, opacity: 0.4 }),
  ebullet: new THREE.MeshBasicMaterial({ color: 0xff4d6e }),
  ebulletCore: new THREE.MeshBasicMaterial({ color: 0xffffff }),
  star:   new THREE.MeshStandardMaterial({ color: 0x63b3ff, metalness: 0.6, roughness: 0.25, emissive: 0x0d4d99, emissiveIntensity: 1.1 }),
  deck:   new THREE.MeshStandardMaterial({ map: deckTex, roughness: 0.6, metalness: 0.5 }),
  shield: new THREE.MeshBasicMaterial({ color: 0x6ee7ff, transparent: true, opacity: 0.28, side: THREE.DoubleSide, depthWrite: false }),
  gate:   new THREE.MeshStandardMaterial({ color: 0x5a4a8a, metalness: 0.8, roughness: 0.35, emissive: 0x1c1040, emissiveIntensity: 0.6 }),
  gateSign: new THREE.MeshBasicMaterial({ map: gateRingTex }),
};

/* sprite texture for floating score text */
function textSprite(text, color) {
  const c = document.createElement('canvas'); c.width = 256; c.height = 96;
  const g = c.getContext('2d');
  g.font = '900 52px sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle';
  g.lineWidth = 10; g.strokeStyle = 'rgba(0,0,0,.65)'; g.strokeText(text, 128, 48);
  g.fillStyle = color || '#ffe9a8'; g.fillText(text, 128, 48);
  const t = new THREE.CanvasTexture(c);
  const m = new THREE.SpriteMaterial({ map: t, transparent: true, depthWrite: false });
  const s = new THREE.Sprite(m); s.scale.set(5.4, 2.0, 1);
  return s;
}

/* ---------------- world scenery ---------------- */
/* starfield: 3 parallax layers (positions updated on the GPU via time
   offset in onBeforeRender — no per-frame attribute uploads) */
const starLayers = [];
function makeStars(n, size, color, speed) {
  const geo = new THREE.BufferGeometry();
  const pos = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) { pos[i * 3] = rand(-70, 70); pos[i * 3 + 1] = rand(-62, 62); pos[i * 3 + 2] = rand(-30, -6); }
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  const pts = new THREE.Points(geo, new THREE.PointsMaterial({ color, size, sizeAttenuation: true, transparent: true, opacity: 0.95 }));
  pts.userData.speed = speed; scene.add(pts); starLayers.push(pts); return pts;
}
makeStars(240, 0.55, 0xffffff, 3.2);
makeStars(160, 0.9, 0xcdbcff, 5.5);
makeStars(90, 1.5, 0xffe9a8, 9.0);

/* nebula sprites */
function nebulaTex(inner, outer) {
  return canvasTex(256, 256, (g, w, h) => {
    const gr = g.createRadialGradient(128, 128, 8, 128, 128, 128);
    gr.addColorStop(0, inner); gr.addColorStop(1, outer);
    g.fillStyle = gr; g.fillRect(0, 0, w, h);
  });
}
const nebs = [];
[[0x5b2ea6, -26, 18, 46], [0x123a7a, 30, -14, 54], [0x7a1e4d, 8, 30, 40], [0x0f5f6e, -34, -26, 48]].forEach(([col, x, y, s]) => {
  const hex = '#' + col.toString(16).padStart(6, '0');
  const m = new THREE.Sprite(new THREE.SpriteMaterial({ map: nebulaTex(hex + 'cc', hex + '00'), transparent: true, opacity: 0.85, depthWrite: false }));
  m.position.set(x, y, -34); m.scale.set(s, s, 1); scene.add(m); nebs.push(m);
});

/* the shattered planet (upper left, distant) */
const planet = new THREE.Group();
{
  const core = new THREE.Mesh(new THREE.SphereGeometry(6.4, 28, 22), new THREE.MeshStandardMaterial({ map: rockTex, roughness: 0.9, emissive: 0xff5a1e, emissiveIntensity: 0.14 }));
  core.castShadow = true; planet.add(core);
  const glow = new THREE.Mesh(new THREE.SphereGeometry(3.1, 18, 14), new THREE.MeshBasicMaterial({ color: 0xff7a2e }));
  glow.position.set(2.2, -2.0, 3.4); planet.add(glow);
  const shards = new THREE.Group();
  for (let i = 0; i < 9; i++) {
    const sh = new THREE.Mesh(new THREE.DodecahedronGeometry(rand(0.5, 1.5)), MAT.rock);
    const a = i / 9 * Math.PI * 2;
    sh.position.set(Math.cos(a) * rand(8, 11), Math.sin(a) * rand(6, 9), rand(-2, 2));
    sh.rotation.set(rand(0, 3), rand(0, 3), rand(0, 3)); shards.add(sh);
  }
  planet.add(shards); planet.userData.shards = shards;
  planet.position.set(-30, 21, -26); scene.add(planet);
}

/* the MOON GATE — two branded towers + glowing ring, top of screen */
const gateGroup = new THREE.Group();
let gateRing;
{
  const towerGeo = new THREE.BoxGeometry(2.6, 13, 2.6);
  const trimGeo = new THREE.BoxGeometry(3.1, 0.7, 3.1);
  [-13.5, 13.5].forEach(x => {
    const t = new THREE.Mesh(towerGeo, MAT.gate); t.position.set(x, 0, 0); t.castShadow = true; gateGroup.add(t);
    for (let i = -2; i <= 2; i++) { const tr = new THREE.Mesh(trimGeo, MAT.gold); tr.position.set(x, i * 2.9, 0); gateGroup.add(tr); }
    const lamp = new THREE.Mesh(new THREE.SphereGeometry(0.55, 12, 10), new THREE.MeshBasicMaterial({ color: 0x7dffce }));
    lamp.position.set(x, 7.1, 0); gateGroup.add(lamp);
  });
  gateRing = new THREE.Mesh(new THREE.TorusGeometry(10.6, 0.55, 12, 48), MAT.gold);
  gateRing.position.set(0, 1.5, 0); gateGroup.add(gateRing);
  const sign = new THREE.Mesh(new THREE.PlaneGeometry(17, 4.25), MAT.gateSign);
  sign.position.set(0, 13.6, 0.4); gateGroup.add(sign);
  const beam = new THREE.Mesh(new THREE.CylinderGeometry(10.2, 10.2, 1.2, 40, 1, true), new THREE.MeshBasicMaterial({ color: 0x63d8ff, transparent: true, opacity: 0.10, side: THREE.DoubleSide, depthWrite: false }));
  beam.rotation.x = Math.PI / 2; beam.position.set(0, 1.5, 0); gateGroup.add(beam);
  gateGroup.position.set(0, 25.5, -9);
  scene.add(gateGroup);
}
/* the gate is SCENERY: parked at the top-centre of the screen at boot and
   re-parked on resize so it frames the action on any aspect. */
function parkGate() { gateGroup.position.y = VH * 0.36; gateGroup.position.x = 0; }
parkGate();

/* the belt rim — deck floor the action flies over */
const deck = new THREE.Mesh(new THREE.PlaneGeometry(150, 190), MAT.deck);
deck.rotation.x = -Math.PI / 2; deck.position.set(0, -15.5, -34);
deck.receiveShadow = true; scene.add(deck);

/* floating belt rocks (instanced, wrap-around drift) */
const ROCK_N = 42;
const rockIM = new THREE.InstancedMesh(new THREE.DodecahedronGeometry(1), MAT.rock, ROCK_N);
rockIM.castShadow = true; scene.add(rockIM);
const rocks = [];
for (let i = 0; i < ROCK_N; i++) rocks.push({ x: rand(-46, 46), y: rand(-34, 34), z: rand(-20, -3), s: rand(0.35, 1.7), rx: rand(0, 3), ry: rand(0, 3), sp: rand(0.1, 0.5), vy: rand(0.6, 1.6) });
const dummy = new THREE.Object3D();
function drawRocks() {
  for (let i = 0; i < ROCK_N; i++) {
    const r = rocks[i];
    dummy.position.set(r.x, r.y, r.z); dummy.rotation.set(r.rx, r.ry, 0); dummy.scale.setScalar(r.s);
    dummy.updateMatrix(); rockIM.setMatrixAt(i, dummy.matrix);
  }
  rockIM.instanceMatrix.needsUpdate = true;
}

/* ---------------- the player gunship ---------------- */
function buildShip() {
  const g = new THREE.Group();
  const bodyGeo = new THREE.SphereGeometry(1, 24, 16); bodyGeo.scale(0.78, 1.25, 0.34);
  const body = new THREE.Mesh(bodyGeo, MAT.shipHull); body.castShadow = true; g.add(body);
  const canopyGeo = new THREE.SphereGeometry(0.42, 16, 12); canopyGeo.scale(1, 1.35, 0.8);
  const canopy = new THREE.Mesh(canopyGeo, MAT.cockpit); canopy.position.set(0, 0.28, 0.3); g.add(canopy);
  const wingGeo = new THREE.BoxGeometry(1.5, 0.85, 0.12);
  [-1, 1].forEach(s => {
    const w = new THREE.Mesh(wingGeo, MAT.shipHull);
    w.position.set(s * 0.95, -0.55, 0); w.rotation.z = s * -0.38; w.castShadow = true; g.add(w);
    const tip = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.5, 0.16), MAT.gold);
    tip.position.set(s * 1.62, -0.83, 0); g.add(tip);
    const fin = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.55, 0.3), MAT.shipDark);
    fin.position.set(s * 0.55, -1.0, -0.05); g.add(fin);
    /* wing cannon pod: short upright cylinder at the nose line, reads as a turret */
    const barrel = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.1, 0.55, 8), MAT.shipDark);
    barrel.position.set(s * 0.42, 1.05, 0.18); g.add(barrel);
  });
  /* engine flames */
  const flame = new THREE.Group();
  const fo = new THREE.Mesh(new THREE.ConeGeometry(0.3, 1.15, 10), MAT.flame); fo.rotation.x = Math.PI; fo.position.y = -0.55; flame.add(fo);
  const fi = new THREE.Mesh(new THREE.ConeGeometry(0.16, 0.7, 10), MAT.flameIn); fi.rotation.x = Math.PI; fi.position.y = -0.42; flame.add(fi);
  flame.position.set(0, -1.25, 0); g.add(flame); g.userData.flame = flame;
  /* shield bubble (hidden until powered) */
  const sh = new THREE.Mesh(new THREE.SphereGeometry(1.85, 20, 14), MAT.shield);
  sh.visible = false; g.add(sh); g.userData.shieldMesh = sh;
  g.userData.barrels = [new THREE.Vector3(-0.42, 1.5, 0), new THREE.Vector3(0.42, 1.5, 0), new THREE.Vector3(0, 1.55, 0)];
  return g;
}
const ship = buildShip(); scene.add(ship);
const engineLight = new THREE.PointLight(0xff9d3d, 12, 12, 1.8); scene.add(engineLight);
if (gfxActive === 2) engineLight.visible = false;

/* ---------------- enemy builders ---------------- */
function buildShardling() {
  const g = new THREE.Group();
  const core = new THREE.Mesh(new THREE.OctahedronGeometry(0.85), MAT.violet); core.castShadow = true; g.add(core);
  const spikeGeo = new THREE.ConeGeometry(0.2, 0.8, 6);
  for (let i = 0; i < 4; i++) {
    const a = i / 4 * Math.PI * 2;
    const sp = new THREE.Mesh(spikeGeo, MAT.violet);
    sp.position.set(Math.cos(a) * 0.9, Math.sin(a) * 0.9, 0);
    sp.rotation.z = a - Math.PI / 2; g.add(sp);
  }
  const eye = new THREE.Mesh(new THREE.SphereGeometry(0.3, 12, 10), MAT.violetEye); eye.position.z = 0.55; g.add(eye);
  return g;
}
function buildLancer() {
  const g = new THREE.Group();
  const bodyGeo = new THREE.ConeGeometry(0.55, 2.5, 4); bodyGeo.rotateX(Math.PI); // point down-screen
  const body = new THREE.Mesh(bodyGeo, MAT.amber); body.castShadow = true; g.add(body);
  const finGeo = new THREE.BoxGeometry(1.5, 0.5, 0.1);
  const fin = new THREE.Mesh(finGeo, MAT.amber); fin.position.y = 0.9; g.add(fin);
  const eye = new THREE.Mesh(new THREE.SphereGeometry(0.2, 10, 8), MAT.bossRed); eye.position.set(0, 0.3, 0.3); g.add(eye);
  return g;
}
function buildWarden() {
  const g = new THREE.Group();
  const hullGeo = new THREE.SphereGeometry(1.05, 20, 14); hullGeo.scale(1.25, 0.72, 0.55);
  const hull = new THREE.Mesh(hullGeo, MAT.teal); hull.castShadow = true; g.add(hull);
  const domeGeo = new THREE.SphereGeometry(0.55, 16, 12); domeGeo.scale(1, 0.8, 0.8);
  const dome = new THREE.Mesh(domeGeo, MAT.cockpit); dome.position.set(0, 0.25, 0.25); g.add(dome);
  const eye = new THREE.Mesh(new THREE.SphereGeometry(0.22, 10, 8), MAT.tealEye); eye.position.set(0, -0.15, 0.55); g.add(eye);
  [-1, 1].forEach(s => {
    const pod = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.16, 0.8, 8), MAT.shipDark);
    pod.rotation.x = Math.PI / 2; pod.position.set(s * 1.35, -0.35, 0); g.add(pod);
  });
  const ring = new THREE.Mesh(new THREE.TorusGeometry(1.45, 0.07, 8, 28), MAT.gold);
  ring.rotation.x = Math.PI / 2.4; g.add(ring); g.userData.ring = ring;
  return g;
}
function buildBoss() {
  const g = new THREE.Group();
  const hullGeo = new THREE.SphereGeometry(4.6, 26, 18); hullGeo.scale(1.5, 0.62, 0.6);
  const hull = new THREE.Mesh(hullGeo, MAT.bossHull); hull.castShadow = true; g.add(hull);
  const spine = new THREE.Mesh(new THREE.BoxGeometry(9.5, 1.1, 1.4), MAT.bossHull); spine.position.y = 1.6; g.add(spine);
  /* panel + stripe detailing so the hull never reads as one flat blob */
  const bandGeo = new THREE.TorusGeometry(4.35, 0.14, 8, 32); bandGeo.scale(1.5, 0.62, 0.62);
  [-1.7, 0, 1.7].forEach(x => { const band = new THREE.Mesh(bandGeo, MAT.bossPanel); band.rotation.y = Math.PI / 2; band.position.x = x; g.add(band); });
  const stripeGeo = new THREE.BoxGeometry(12.6, 0.34, 0.2);
  [-0.9, 0.35].forEach(y => { const st = new THREE.Mesh(stripeGeo, MAT.bossRed); st.position.set(0, y, 2.62); g.add(st); });
  const ribGeo = new THREE.BoxGeometry(0.5, 2.2, 0.5);
  for (let i = -3; i <= 3; i++) { if (!i) continue; const rib = new THREE.Mesh(ribGeo, MAT.bossPanel); rib.position.set(i * 1.75, 1.15, 0.9); rib.rotation.x = 0.5; g.add(rib); }
  [-5.9, 5.9].forEach(x => { const lamp = new THREE.Mesh(new THREE.SphereGeometry(0.34, 10, 8), MAT.bossRed); lamp.position.set(x, -1.7, 1.6); g.add(lamp); });
  const keel = new THREE.Mesh(new THREE.ConeGeometry(0.8, 2.6, 4), MAT.bossPanel); keel.rotation.x = Math.PI; keel.position.set(0, -3.4, 0.6); g.add(keel);
  const core = new THREE.Mesh(new THREE.SphereGeometry(1.35, 18, 14), MAT.bossCore); core.position.set(0, -0.4, 1.6); g.add(core); g.userData.core = core;
  const turrets = [];
  [[-4.6, -1.2], [0, -2.2], [4.6, -1.2]].forEach(([x, y]) => {
    const tg = new THREE.Group();
    const base = new THREE.Mesh(new THREE.SphereGeometry(0.75, 14, 10), MAT.bossHull); tg.add(base);
    const b1 = new THREE.Mesh(new THREE.CylinderGeometry(0.14, 0.14, 1.5, 8), MAT.shipDark);
    b1.position.set(-0.2, -0.8, 0.3); tg.add(b1);
    const b2 = b1.clone(); b2.position.x = 0.2; tg.add(b2);
    const lamp = new THREE.Mesh(new THREE.SphereGeometry(0.2, 8, 8), MAT.bossRed); lamp.position.set(0, 0.55, 0.5); tg.add(lamp);
    tg.position.set(x, y, 1.2); g.add(tg); turrets.push(tg);
  });
  g.userData.turrets = turrets;
  [-1, 1].forEach(s => {
    const fin = new THREE.Mesh(new THREE.BoxGeometry(2.6, 3.4, 0.3), MAT.bossHull);
    fin.position.set(s * 7.6, 0.6, 0); fin.rotation.z = s * 0.5; g.add(fin);
    const tipL = new THREE.Mesh(new THREE.SphereGeometry(0.3, 8, 8), MAT.bossRed);
    tipL.position.set(s * 8.6, 2.1, 0); g.add(tipL);
  });
  return g;
}

/* ---------------- pickups ---------------- */
function buildCrescent() {
  const g = new THREE.Group();
  const t1 = new THREE.Mesh(new THREE.TorusGeometry(0.55, 0.3, 10, 24), MAT.gold); g.add(t1);
  const cut = new THREE.Mesh(new THREE.SphereGeometry(0.52, 12, 10), new THREE.MeshBasicMaterial({ color: 0x0a0618 }));
  cut.position.set(0.34, 0.16, 0.05); cut.scale.set(1, 1, 0.6); g.add(cut);
  const glow = new THREE.PointLight(0xffcf3d, 6, 7, 2); g.add(glow);
  return g;
}
function starGeo() {
  const shape = new THREE.Shape();
  for (let i = 0; i < 10; i++) {
    const r = i % 2 ? 0.42 : 0.95, a = i / 10 * Math.PI * 2 - Math.PI / 2;
    const x = Math.cos(a) * r, y = Math.sin(a) * r;
    i ? shape.lineTo(x, y) : shape.moveTo(x, y);
  }
  shape.closePath();
  return new THREE.ExtrudeGeometry(shape, { depth: 0.28, bevelEnabled: true, bevelSize: 0.06, bevelThickness: 0.06 });
}
const STAR_GEO = starGeo();
function buildStar() {
  const g = new THREE.Group();
  const s = new THREE.Mesh(STAR_GEO, MAT.star); s.position.z = -0.14; g.add(s);
  const glow = new THREE.PointLight(0x63b3ff, 6, 7, 2); g.add(glow);
  return g;
}
function buildCore(kind) {
  const g = new THREE.Group();
  const col = kind === 'spread' ? 0xffcf3d : kind === 'rapid' ? 0xff9d3d : 0x6ee7ff;
  const core = new THREE.Mesh(new THREE.IcosahedronGeometry(0.5, 0), new THREE.MeshStandardMaterial({ color: col, emissive: col, emissiveIntensity: 0.9, metalness: 0.4, roughness: 0.3 }));
  g.add(core);
  const ring = new THREE.Mesh(new THREE.TorusGeometry(0.85, 0.09, 8, 22), MAT.gold); g.add(ring); g.userData.ring = ring;
  const spr = textSprite(kind === 'spread' ? '×3' : kind === 'rapid' ? '»»' : '🛡', '#ffffff');
  spr.scale.set(2.6, 1.0, 1); spr.position.y = 1.25; g.add(spr);
  return g;
}

/* ---------------- pools ---------------- */
const HIDE_M = new THREE.Matrix4().makeScale(0, 0, 0);
function makePool(n, geo, mat) {
  const im = new THREE.InstancedMesh(geo, mat, n); im.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  for (let i = 0; i < n; i++) im.setMatrixAt(i, HIDE_M);
  im.frustumCulled = false; scene.add(im); return im;
}
const bulletIM = makePool(90, new THREE.SphereGeometry(0.17, 8, 6), MAT.bullet);
const bulletGlowIM = makePool(90, new THREE.SphereGeometry(0.42, 8, 6), MAT.bulletGlow);
const ebulletIM = makePool(160, new THREE.SphereGeometry(0.27, 8, 6), MAT.ebullet);
const ebulletCoreIM = makePool(160, new THREE.SphereGeometry(0.13, 8, 6), MAT.ebulletCore);
const sparkIM = makePool(240, new THREE.OctahedronGeometry(0.16), new THREE.MeshBasicMaterial({ color: 0xffb03d }));
const smokeIM = makePool(120, new THREE.SphereGeometry(0.5, 8, 6), new THREE.MeshBasicMaterial({ color: 0x8d84b8, transparent: true, opacity: 0.34 }));
const bullets = [], ebullets = [], sparks = [], smokes = [], floaters = [];
function drawPool(im, arr, spin) {
  const n = Math.min(arr.length, im.instanceMatrix.count);
  for (let i = 0; i < n; i++) {
    const p = arr[i];
    dummy.position.set(p.x, p.y, p.z || 0);
    dummy.rotation.set(spin ? p.rot || 0 : 0, spin ? (p.rot || 0) * 1.3 : 0, 0);
    dummy.scale.setScalar(p.s || 1); dummy.updateMatrix();
    im.setMatrixAt(i, dummy.matrix);
    if (p.c !== undefined && im.instanceColor) im.setColorAt(i, dummyColor.set(p.c));
  }
  for (let i = n; i < im.instanceMatrix.count; i++) im.setMatrixAt(i, HIDE_M);
  im.instanceMatrix.needsUpdate = true;
  if (im.instanceColor) im.instanceColor.needsUpdate = true;
}
const dummyColor = new THREE.Color(0xffffff);
function burst(x, y, n, color) {
  n = gfxActive === 2 ? Math.ceil(n * 0.5) : n;   // low stage: halved particle load
  for (let i = 0; i < n && sparks.length < (gfxActive === 2 ? 120 : 240); i++) {
    const a = Math.random() * Math.PI * 2, sp = rand(3, 13);
    sparks.push({ x, y, z: rand(-0.5, 0.5), vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, life: rand(0.3, 0.7), t: 0, rot: rand(0, 3), s: rand(0.6, 1.6), c: color || 0xffb03d });
  }
  /* smoke puff — Sky Force-style layered explosions (fire + smoke + debris) */
  for (let i = 0; i < (gfxActive === 2 ? 0 : Math.min(3, n / 6)) && smokes.length < 120; i++) {
    smokes.push({ x: x + rand(-0.7, 0.7), y: y + rand(-0.7, 0.7), z: rand(-0.4, 0.4), vx: rand(-1.2, 1.2), vy: rand(0.6, 2.2), life: rand(0.7, 1.3), t: 0, s: rand(0.8, 1.5) });
  }
}
function floatText(x, y, text, color) {
  const s = textSprite(text, color); s.position.set(x, y, 2); scene.add(s);
  floaters.push({ s, t: 0 });
}

/* ---------------- game state ---------------- */
const S = {
  mode: 'menu',           // menu | playing | paused | over
  score: 0, coins: 0, stars: 0, dist: 0, runTime: 0,
  hull: 3, wave: 0, sector: 1, kills: 0,
  best: 0, muted: false,
};
try { S.best = parseInt(localStorage.getItem('lunaBlasterBest') || '0', 10) || 0; } catch (e) {}
const P = { x: 0, y: -VH * 0.32, vx: 0, vy: 0, fireT: 0, invuln: 0, shield: false, spread: 0, rapid: 0, tilt: 0 };
const waves = [];        // { t, count, interval, types, next, left }
let boss = null, bossWarnT = 0, interT = 0, hintT = 0, shakeT = 0, firstWave = false;
const enemies = [], pickups = [];

/* ---------------- input: joystick + keys ---------------- */
const stick = { active: false, id: null, x: 0, y: 0 };
const keys = {};
let fireHeld = false;
const stickBase = $('stickBase'), stickKnob = $('stickKnob'), fireBtn = $('fireBtn');
function stickCenter() { const r = stickBase.getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2, rad: r.width / 2 }; }
function setKnob(dx, dy) { stickKnob.style.transform = `translate(${dx}px, ${dy}px)`; }
window.addEventListener('pointerdown', e => {
  if (S.mode !== 'playing') return;
  const c = stickCenter();
  const d = Math.hypot(e.clientX - c.x, e.clientY - c.y);
  if (d < c.rad + 46 && !stick.active) {
    stick.active = true; stick.id = e.pointerId; moveStick(e);
  }
}, { passive: true });
window.addEventListener('pointermove', e => { if (stick.active && e.pointerId === stick.id) moveStick(e); }, { passive: true });
function endStick(e) { if (stick.active && e.pointerId === stick.id) { stick.active = false; stick.x = 0; stick.y = 0; setKnob(0, 0); } }
window.addEventListener('pointerup', endStick);
window.addEventListener('pointercancel', endStick);
function moveStick(e) {
  const c = stickCenter();
  let dx = e.clientX - c.x, dy = e.clientY - c.y;
  const d = Math.hypot(dx, dy), max = c.rad - 12;
  if (d > max) { dx = dx / d * max; dy = dy / d * max; }
  setKnob(dx, dy);
  const dead = 7;
  stick.x = Math.abs(dx) < dead ? 0 : dx / max;
  stick.y = Math.abs(dy) < dead ? 0 : -dy / max;
}
fireBtn.addEventListener('pointerdown', e => { e.preventDefault(); fireHeld = true; fireBtn.classList.add('on'); novaBurst(); });
window.addEventListener('pointerup', () => { fireHeld = false; fireBtn.classList.remove('on'); });
window.addEventListener('keydown', e => {
  keys[e.code] = true;
  if (e.code === 'Space') { if (S.mode === 'playing') { e.preventDefault(); if (!fireHeld) { fireHeld = true; novaBurst(); } } }
  if ((e.code === 'KeyP' || e.code === 'Escape') && S.mode === 'playing') pauseGame();
});
window.addEventListener('keyup', e => { keys[e.code] = false; if (e.code === 'Space') fireHeld = false; });

/* nova burst: shockwave that clears enemy bullets + light damage */
let nova = null;
function novaBurst() {
  if (S.mode !== 'playing' || nova) return;
  nova = { r: 1 };
  sfx.nova();
  const ring = new THREE.Mesh(new THREE.TorusGeometry(1, 0.22, 8, 36), new THREE.MeshBasicMaterial({ color: 0xffd95e, transparent: true, opacity: 0.95 }));
  ring.position.set(P.x, P.y, 0.5); scene.add(ring); nova.mesh = ring;
  ebullets.forEach(b => { b.dead = true; burst(b.x, b.y, 2, 0xff4d6e); });
  enemies.forEach(en => { damageEnemy(en, 1, true); });
}

/* ---------------- spawning ---------------- */
function spawnEnemy(type, x) {
  let mesh, hp, score, r;
  if (type === 'shard') { mesh = buildShardling(); hp = 2; score = 100; r = 1.1; }
  else if (type === 'lancer') { mesh = buildLancer(); hp = 2; score = 150; r = 1.0; }
  else { mesh = buildWarden(); hp = 6; score = 300; r = 1.5; }
  const e = { type, mesh, hp, maxHp: hp, score, r, x, y: VH / 2 + 3, z: 0, t: rand(0, 6), fireT: rand(1.2, 2.6), baseX: x, dead: false };
  mesh.position.set(e.x, e.y, 0); scene.add(mesh); enemies.push(e);
}
function startWave(n) {
  S.wave = n;
  showBanner(T('wave').replace('{n}', n), T('sector').replace('{n}', S.sector));
  const types = ['shard', 'shard'];
  if (n >= 2) types.push('lancer');
  if (n >= 3) types.push('shard', 'lancer');
  if (n >= 4) types.push('warden');
  waves.push({ t: 0.8, count: 5 + n * 2, interval: Math.max(0.5, 1.05 - n * 0.07), types, next: 0 });
}
function spawnBoss() {
  const mesh = buildBoss();
  boss = { mesh, hp: 130 + (S.sector - 1) * 70, maxHp: 130 + (S.sector - 1) * 70, x: 0, y: VH / 2 + 9, t: 0, fireT: 2, phase: 'enter', dead: false };
  mesh.position.set(0, boss.y, -1); scene.add(mesh);
  $('hpWrap').style.display = 'block'; $('hpLabel').textContent = T('bossName');
  sfx.alarm();
}
function dropPickup(x, y, kind) {
  let mesh;
  if (kind === 'coin') mesh = buildCrescent();
  else if (kind === 'star') mesh = buildStar();
  else mesh = buildCore(kind);
  mesh.position.set(x, y, 0); scene.add(mesh);
  pickups.push({ kind, mesh, x, y, t: rand(0, 6), vy: kind === 'coin' || kind === 'star' ? 5.2 : 4.2 });
}
function onKill(e) {
  S.kills++; addScore(e.score, e.x, e.y);
  burst(e.x, e.y, e.type === 'warden' ? 22 : 13, e.type === 'shard' ? 0xb46bff : e.type === 'lancer' ? 0xffb03d : 0x4dffd2);
  sfx.boom();
  shakeT = Math.max(shakeT, 0.12);
  const roll = Math.random();
  if (e.type === 'warden') { if (roll < 0.55) dropPickup(e.x, e.y, ['spread', 'rapid', 'shield'][(Math.random() * 3) | 0]); else if (roll < 0.8) dropPickup(e.x, e.y, 'coin'); }
  else if (roll < 0.10) dropPickup(e.x, e.y, 'coin');
  else if (roll < 0.115) dropPickup(e.x, e.y, 'star');
}
function flashMesh(root) {
  /* hit flash: swap all mesh materials to a shared white material for one
     beat, then restore — the genre's clearest "your shots are landing" cue */
  if (root.userData._flash) return;
  root.userData._flash = true;
  root.traverse(o => { if (o.isMesh) { o.userData._m = o.material; o.material = FLASH_MAT; } });
  setTimeout(() => {
    root.traverse(o => { if (o.isMesh && o.userData._m) { o.material = o.userData._m; o.userData._m = null; } });
    root.userData._flash = false;
  }, 55);
}
const FLASH_MAT = new THREE.MeshBasicMaterial({ color: 0xffffff });
function damageEnemy(e, dmg, silent) {
  if (e.dead) return;
  e.hp -= dmg;
  if (!silent) flashMesh(e.mesh);
  if (e.hp <= 0) { e.dead = true; onKill(e); }
}
function addScore(n, x, y) {
  S.score += n;
  if (x !== undefined) floatText(x, y, '+' + n, '#ffe9a8');
}

/* ---------------- combat ---------------- */
function playerShoot(dt) {
  P.fireT -= dt;
  const rate = P.rapid > 0 ? 0.11 : 0.19;
  if (P.fireT > 0) return;
  P.fireT = rate;
  const offs = P.spread > 0 ? [-0.42, 0, 0.42] : [0];
  offs.forEach((ox, i) => {
    if (bullets.length < 90) bullets.push({ x: P.x + ox, y: P.y + 1.6, vx: ox * 2.2, vy: 46, s: 1 });
    const f = new THREE.Mesh(new THREE.SphereGeometry(0.16, 6, 6), MAT.flameIn);
    f.position.set(P.x + ox, P.y + 1.55, 0); scene.add(f);
    floaters.push({ s: f, t: 0, flash: true });
  });
  sfx.shot();
}
function enemyShoot(e) {
  const dx = P.x - e.x, dy = P.y - e.y, d = Math.hypot(dx, dy) || 1;
  const sp = 13;
  ebullets.push({ x: e.x, y: e.y - 1, vx: dx / d * sp, vy: dy / d * sp, s: 1 });
  beep(340, 180, 0.09, 'sawtooth', 0.02);
}
function bossShoot(kind) {
  if (!boss) return;
  if (kind === 'fan') {
    for (let i = -2; i <= 2; i++) {
      const a = -Math.PI / 2 + i * 0.22;
      ebullets.push({ x: boss.x, y: boss.y - 2.4, vx: Math.cos(a) * 12, vy: Math.sin(a) * 12, s: 1 });
    }
  } else {
    boss.mesh.userData.turrets.forEach(tg => {
      const wx = boss.x + tg.position.x, wy = boss.y + tg.position.y;
      const dx = P.x - wx, dy = P.y - wy, d = Math.hypot(dx, dy) || 1;
      ebullets.push({ x: wx, y: wy - 0.6, vx: dx / d * 11, vy: dy / d * 11, s: 1 });
    });
  }
  beep(240, 120, 0.12, 'sawtooth', 0.03);
}
function hurtPlayer() {
  if (P.invuln > 0 || S.mode !== 'playing') return;
  if (P.shield) {
    P.shield = false; ship.userData.shieldMesh.visible = false; P.invuln = 1.2;
    burst(P.x, P.y, 16, 0x6ee7ff); sfx.hit(); floatText(P.x, P.y + 2.4, 'SHIELD DOWN', '#6ee7ff');
    return;
  }
  S.hull--; P.invuln = 1.6; shakeT = Math.max(shakeT, 0.3);
  burst(P.x, P.y, 20, 0xff5d7a); sfx.hit();
  updateHUD();
  if (S.hull <= 0) gameOver();
}

/* ---------------- flow ---------------- */
function showBanner(main, sub, ms) {
  $('bannerMain').textContent = main; $('bannerSub').textContent = sub || '';
  $('banner').classList.remove('hidden');
  clearTimeout(showBanner._t);
  showBanner._t = setTimeout(() => $('banner').classList.add('hidden'), ms || 2100);
}
function updateHUD() {
  $('hudScore').textContent = S.score;
  $('hudCoins').textContent = S.coins;
  $('hudStars').textContent = S.stars;
  $('hudDist').textContent = Math.floor(S.dist) + 'm';
  $('hearts').textContent = '♥'.repeat(Math.max(0, S.hull)) + '♡'.repeat(Math.max(0, 3 - S.hull));
  if (boss) $('hpBar').style.width = Math.max(0, boss.hp / boss.maxHp * 100) + '%';
}
function updateBestLine() {
  $('bestLine').textContent = S.best > 0 ? T('best').replace('{n}', S.best) : '';
}
function show(id) { ['menuScreen', 'howScreen', 'boardScreen', 'pauseScreen', 'overScreen'].forEach(s => $(s).classList.toggle('hidden', s !== id)); if (!id) ['menuScreen', 'howScreen', 'boardScreen', 'pauseScreen', 'overScreen'].forEach(s => $(s).classList.add('hidden')); }
function startGame() {
  /* clear field */
  enemies.forEach(e => scene.remove(e.mesh)); enemies.length = 0;
  pickups.forEach(p => scene.remove(p.mesh)); pickups.length = 0;
  bullets.length = 0; ebullets.length = 0; sparks.length = 0; smokes.length = 0; waves.length = 0;
  if (boss) { scene.remove(boss.mesh); boss = null; }
  $('hpWrap').style.display = 'none';
  Object.assign(S, { score: 0, coins: 0, stars: 0, dist: 0, runTime: 0, hull: 3, wave: 0, sector: 1, kills: 0 });
  Object.assign(P, { x: 0, y: -VH * 0.32, vx: 0, vy: 0, fireT: 0, invuln: 0, shield: false, spread: 0, rapid: 0 });
  ship.userData.shieldMesh.visible = false;
  ship.visible = true;
  S.mode = 'playing'; firstWave = true; interT = 1.1; hintT = 5;
  show(null);
  $('hud').classList.remove('hidden'); $('controls').classList.remove('hidden');
  showBanner(T('sector').replace('{n}', 1), T('go'));
  updateHUD();
  try { const n = localStorage.getItem('lunaBlasterName'); if (n) $('nameInput').value = n; } catch (e) {}
}
function pauseGame() {
  if (S.mode !== 'playing') return;
  S.mode = 'paused'; show('pauseScreen');
}
function resumeGame() { if (S.mode !== 'paused') return; S.mode = 'playing'; show(null); }
function toMenu() {
  S.mode = 'menu'; show('menuScreen');
  $('hpWrap').style.display = 'none';
  $('hud').classList.add('hidden'); $('controls').classList.add('hidden');
  ship.visible = true; ship.position.set(0, -VH * 0.32, 0);
}
function gameOver() {
  S.mode = 'over';
  $('hpWrap').style.display = 'none';
  burst(P.x, P.y, 46, 0xffcf3d); burst(P.x, P.y, 30, 0xff5d7a);
  sfx.bigBoom(); shakeT = 0.6;
  ship.visible = false;
  if (S.score > S.best) { S.best = S.score; try { localStorage.setItem('lunaBlasterBest', String(S.best)); } catch (e) {} }
  $('finalScore').textContent = S.score;
  $('overStats').textContent = '☾ ' + S.coins + ' · ★ ' + S.stars + ' · ' + Math.floor(S.dist) + 'm · ' + S.kills + ' kills';
  $('savedLine').textContent = '';
  $('submitBtn').disabled = false;
  setTimeout(() => { if (S.mode === 'over') { show('overScreen'); $('controls').classList.add('hidden'); } }, 900);
}

/* ---------------- leaderboard ---------------- */
let boardData = null, boardTab = 'all';
async function loadBoard() {
  try { const r = await fetch('/api/luna-games?game=blaster'); boardData = await r.json(); } catch (e) { boardData = null; }
  renderBoard();
}
function renderBoard() {
  const el = $('boardBody');
  if (!boardData) { el.innerHTML = '<div style="text-align:center;padding:10px">' + esc(T('loading')) + '</div>'; return; }
  const list = (boardTab === 'week' ? boardData.week : boardData.all) || [];
  if (!list.length) { el.innerHTML = '<div style="text-align:center;padding:10px">' + esc(T('noScores')) + '</div>'; return; }
  el.innerHTML = '<table class="board">' + list.map((r, i) =>
    `<tr><td>${i + 1}.</td><td class="nm">${esc(r.name || '')}</td><td class="sc">${r.score}</td></tr>`).join('') + '</table>';
}
async function submitScore() {
  const name = ($('nameInput').value || '').trim() || 'ACE';
  try { localStorage.setItem('lunaBlasterName', name); } catch (e) {}
  $('submitBtn').disabled = true;
  try {
    const tg = window.Telegram && window.Telegram.WebApp;
    const r = await fetch('/api/luna-games?game=blaster', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ initData: tg ? tg.initData || '' : '', name, score: Math.floor(S.score), seconds: Math.max(1, Math.round(S.runTime)) }),
    });
    const j = await r.json();
    $('savedLine').textContent = j && j.rank ? T('rank').replace('{n}', j.rank) : T('saved');
  } catch (e) { $('savedLine').textContent = T('saved'); }
}

/* ---------------- UI wiring ---------------- */
$('playBtn').addEventListener('click', () => { ac(); startGame(); });
$('howBtn').addEventListener('click', () => show('howScreen'));
$('howClose').addEventListener('click', () => show(S.mode === 'menu' ? 'menuScreen' : null));
$('boardBtn').addEventListener('click', () => { show('boardScreen'); loadBoard(); });
$('overBoardBtn').addEventListener('click', () => { show('boardScreen'); loadBoard(); });
$('boardClose').addEventListener('click', () => show(S.mode === 'over' ? 'overScreen' : 'menuScreen'));
$('tabAll').addEventListener('click', () => { boardTab = 'all'; renderBoard(); });
$('tabWeek').addEventListener('click', () => { boardTab = 'week'; renderBoard(); });
$('pauseBtn').addEventListener('click', () => { if (S.mode === 'playing') pauseGame(); });
$('resumeBtn').addEventListener('click', resumeGame);
$('quitBtn').addEventListener('click', toMenu);
$('menuBtn').addEventListener('click', toMenu);
$('againBtn').addEventListener('click', () => { ac(); startGame(); });
$('submitBtn').addEventListener('click', submitScore);
$('muteBtn').addEventListener('click', () => {
  muted = !muted; $('muteBtn').textContent = muted ? '🔇' : '🔊';
  try { localStorage.setItem('lunaBlasterMuted', muted ? '1' : '0'); } catch (e) {}
});
$('muteBtn').textContent = muted ? '🔇' : '🔊';
setInterval(() => { if (S.mode === 'playing') submitHeartbeat(); }, 5000);
function submitHeartbeat() { /* keeps runTime honest for the router's rate rails */ }

/* ---------------- update ---------------- */
function update(dt, t) {
  if (S.mode === 'paused') return;
  /* scenery always breathes — star layers drift via position offset (cheap) */
  starLayers.forEach(l => {
    l.position.y -= l.userData.speed * dt;
    if (l.position.y < -124) l.position.y += 124;
  });
  nebs.forEach((n, i) => { n.position.y = Math.sin(t * 0.05 + i * 1.7) * 3 + (i % 2 ? 8 : -4); });
  planet.rotation.y += dt * 0.03; planet.userData.shards.rotation.z += dt * 0.05;
  gateRing.rotation.z += dt * 0.25;
  deckTex.offset.y -= dt * (S.mode === 'playing' ? 0.055 : 0.012);
  rocks.forEach(r => { r.y -= r.vy * dt * (S.mode === 'playing' ? 1.6 : 0.5); r.rx += r.sp * dt; r.ry += r.sp * 0.7 * dt; if (r.y < -36) { r.y = 36; r.x = rand(-46, 46); } });
  drawRocks();

  if (S.mode === 'menu') {
    ship.position.x = Math.sin(t * 0.6) * 2.2;
    ship.position.y = -VH * 0.32 + Math.sin(t * 1.3) * 0.5;
    ship.rotation.z = Math.sin(t * 0.6) * -0.14;
    ship.userData.flame.scale.y = 0.8 + Math.sin(t * 22) * 0.18;
  }
  if (S.mode !== 'playing') { shipLight.position.set(ship.position.x, ship.position.y + 1, 6); engineLight.position.set(ship.position.x, ship.position.y - 2, 2); renderFx(dt); return; }

  S.runTime += dt; S.dist += dt * 9;
  if (hintT > 0) { hintT -= dt; if (hintT <= 0) { /* hint lives in how-to; banner already shown */ } }

  /* --- player movement --- */
  let ix = stick.x, iy = stick.y;
  if (keys['ArrowLeft'] || keys['KeyA']) ix -= 1;
  if (keys['ArrowRight'] || keys['KeyD']) ix += 1;
  if (keys['ArrowUp'] || keys['KeyW']) iy += 1;
  if (keys['ArrowDown'] || keys['KeyS']) iy -= 1;
  const il = Math.hypot(ix, iy); if (il > 1) { ix /= il; iy /= il; }
  const SPEED = 26;
  P.vx += (ix * SPEED - P.vx) * Math.min(1, dt * 10);
  P.vy += (iy * SPEED - P.vy) * Math.min(1, dt * 10);
  P.x = clamp(P.x + P.vx * dt, -VW / 2 + 1.6, VW / 2 - 1.6);
  P.y = clamp(P.y + P.vy * dt, -VH / 2 + 2.2, VH * 0.30);
  P.tilt += ((-P.vx * 0.016) - P.tilt) * Math.min(1, dt * 8);
  ship.position.set(P.x, P.y, 0);
  ship.rotation.z = P.tilt;
  ship.rotation.x = clamp(-P.vy * 0.006, -0.2, 0.2);
  ship.userData.flame.scale.y = 0.9 + Math.abs(P.vy) * 0.012 + Math.sin(t * 26) * 0.15;
  if (P.invuln > 0) { P.invuln -= dt; ship.visible = Math.sin(t * 34) > -0.25; } else ship.visible = true;
  if (P.spread > 0) P.spread -= dt;
  if (P.rapid > 0) P.rapid -= dt;
  shipLight.position.set(P.x, P.y + 1, 6);
  engineLight.position.set(P.x, P.y - 2.2, 2);

  playerShoot(dt);

  /* --- waves / boss pacing --- */
  if (firstWave) { interT -= dt; if (interT <= 0) { firstWave = false; startWave(1); } }
  waves.forEach(w => {
    w.t -= dt;
    if (w.t <= 0 && w.next < w.count) {
      w.t = w.interval; w.next++;
      const type = w.types[(Math.random() * w.types.length) | 0];
      spawnEnemy(type, rand(-VW / 2 + 3, VW / 2 - 3));
    }
  });
  for (let i = waves.length - 1; i >= 0; i--) if (waves[i].next >= waves[i].count) waves.splice(i, 1);
  const fieldClear = enemies.length === 0 && !boss && bossWarnT <= 0;
  if (!firstWave && waves.length === 0 && fieldClear) {
    interT -= dt;
    if (interT <= 0) {
      if (S.wave > 0 && S.wave % 4 === 0) { bossWarnT = 2.2; showBanner(T('bossWarn'), '', 2000); sfx.alarm(); interT = 0; }
      else { startWave(S.wave + 1); interT = 1.6; }
    }
  } else if (!boss && bossWarnT <= 0) interT = Math.max(interT, 0.4);
  if (bossWarnT > 0) { bossWarnT -= dt; if (bossWarnT <= 0 && !boss) spawnBoss(); }

  /* --- enemies --- */
  for (let i = enemies.length - 1; i >= 0; i--) {
    const e = enemies[i];
    if (e.dead) { scene.remove(e.mesh); enemies.splice(i, 1); continue; }
    e.t += dt;
    if (e.type === 'shard') {
      e.y -= 8.6 * dt; e.x = e.baseX + Math.sin(e.t * 2.6) * 2.1;
      e.mesh.rotation.y += dt * 2.4; e.mesh.rotation.x += dt * 1.7;
    } else if (e.type === 'lancer') {
      e.y -= (e.y > P.y + 9 ? 7.5 : 21) * dt;
      e.mesh.rotation.z = Math.sin(e.t * 3) * 0.1;
    } else { /* warden */
      e.y -= (e.y > VH * 0.18 ? 6.4 : 1.1) * dt;
      e.x = e.baseX + Math.sin(e.t * 0.9) * 3.2;
      e.mesh.rotation.y = Math.sin(e.t * 0.9) * 0.4;
      if (e.mesh.userData.ring) e.mesh.userData.ring.rotation.z += dt * 1.5;
      e.fireT -= dt;
      if (e.fireT <= 0 && e.y < VH / 2 - 2 && e.y > P.y + 4) { e.fireT = rand(1.7, 2.7); enemyShoot(e); }
    }
    e.mesh.position.set(e.x, e.y, e.z);
    /* collision with player */
    const d = Math.hypot(e.x - P.x, e.y - P.y);
    if (d < e.r + 1.05) { burst(e.x, e.y, 14, 0xff5d7a); hurtPlayer(); scene.remove(e.mesh); enemies.splice(i, 1); continue; }
    if (e.y < -VH / 2 - 4) { scene.remove(e.mesh); enemies.splice(i, 1); }
  }

  /* --- boss --- */
  if (boss) {
    const b = boss; b.t += dt;
    if (b.phase === 'enter') { b.y -= 7 * dt; if (b.y <= VH * 0.30) { b.y = VH * 0.30; b.phase = 'fight'; } }
    else {
      b.x = Math.sin(b.t * 0.45) * VW * 0.26;
      b.mesh.rotation.z = Math.sin(b.t * 0.45 + 0.6) * -0.05;
      b.fireT -= dt;
      if (b.fireT <= 0) { b.fireT = 1.45; bossShoot(Math.random() < 0.5 ? 'fan' : 'aim'); }
      if (b.mesh.userData.core) b.mesh.userData.core.rotation.y += dt * 2;
    }
    b.mesh.position.set(b.x, b.y, -1);
    if (Math.hypot(b.x - P.x, b.y - P.y) < 5.6 && P.invuln <= 0) hurtPlayer();
    updateHUD();
  }

  /* --- bullets --- */
  for (let i = bullets.length - 1; i >= 0; i--) {
    const b = bullets[i];
    b.x += b.vx * dt; b.y += b.vy * dt;
    if (b.y > VH / 2 + 3 || Math.abs(b.x) > VW / 2 + 3) { bullets.splice(i, 1); continue; }
    let consumed = false;
    for (const e of enemies) {
      if (e.dead) continue;
      if (Math.abs(b.x - e.x) < e.r + 0.3 && Math.abs(b.y - e.y) < e.r + 0.3) { damageEnemy(e, 1); consumed = true; break; }
    }
    if (!consumed && boss && boss.phase === 'fight') {
      if (Math.abs(b.x - boss.x) < 6.4 && Math.abs(b.y - boss.y) < 3.1) {
        boss.hp -= 1; consumed = true; burst(b.x, b.y, 2, 0xff5d7a); flashMesh(boss.mesh);
        if (boss.hp <= 0) killBoss();
      }
    }
    if (consumed) bullets.splice(i, 1);
  }
  for (let i = ebullets.length - 1; i >= 0; i--) {
    const b = ebullets[i];
    if (b.dead) { ebullets.splice(i, 1); continue; }
    b.x += b.vx * dt; b.y += b.vy * dt;
    if (Math.abs(b.x) > VW / 2 + 4 || Math.abs(b.y) > VH / 2 + 4) { ebullets.splice(i, 1); continue; }
    if (Math.hypot(b.x - P.x, b.y - P.y) < 1.15 && P.invuln <= 0) { ebullets.splice(i, 1); hurtPlayer(); }
  }

  /* --- pickups --- */
  for (let i = pickups.length - 1; i >= 0; i--) {
    const p = pickups[i]; p.t += dt;
    const dx = P.x - p.x, dy = P.y - p.y, d = Math.hypot(dx, dy);
    if ((p.kind === 'coin' || p.kind === 'star') && d < 5.5) { p.x += dx / d * 13 * dt; p.y += dy / d * 13 * dt; }
    else p.y -= p.vy * dt;
    p.mesh.position.set(p.x, p.y, 0);
    p.mesh.rotation.y += dt * 2.6;
    if (p.mesh.userData.ring) p.mesh.userData.ring.rotation.x += dt * 2;
    if (d < 1.6) {
      collectPickup(p); scene.remove(p.mesh); pickups.splice(i, 1); continue;
    }
    if (p.y < -VH / 2 - 3) { scene.remove(p.mesh); pickups.splice(i, 1); }
  }

  renderFx(dt);
  if ((S.runTime | 0) !== update._lastSec) { update._lastSec = S.runTime | 0; updateHUD(); }
}
function collectPickup(p) {
  if (p.kind === 'coin') { S.coins++; addScore(50, p.x, p.y); sfx.coin(); }
  else if (p.kind === 'star') {
    S.stars++; addScore(250, p.x, p.y); sfx.star();
    if (S.hull < 3) { S.hull++; floatText(P.x, P.y + 2.6, '+1 HULL', '#8dffb0'); }
  } else if (p.kind === 'spread') { P.spread = 12; floatText(p.x, p.y, 'SPREAD ×3', '#ffcf3d'); sfx.power(); }
  else if (p.kind === 'rapid') { P.rapid = 12; floatText(p.x, p.y, 'RAPID FIRE', '#ff9d3d'); sfx.power(); }
  else if (p.kind === 'shield') {
    if (!P.shield) { P.shield = true; ship.userData.shieldMesh.visible = true; floatText(p.x, p.y, 'SHIELD UP', '#6ee7ff'); }
    else { P.spread = 12; floatText(p.x, p.y, 'SPREAD ×3', '#ffcf3d'); }
    sfx.power();
  }
  updateHUD();
}
function killBoss() {
  const b = boss; boss = null;
  $('hpWrap').style.display = 'none';
  addScore(2000, b.x, b.y);
  burst(b.x, b.y, 60, 0xff5d7a); burst(b.x, b.y, 40, 0xffcf3d);
  sfx.bigBoom(); shakeT = 0.7;
  scene.remove(b.mesh);
  dropPickup(b.x - 2, b.y, 'star'); dropPickup(b.x + 2, b.y, ['spread', 'rapid', 'shield'][(Math.random() * 3) | 0]);
  S.sector++; S.wave++;
  showBanner(T('sector').replace('{n}', S.sector), T('go'));
  interT = 2.2; waves.length = 0;
}

/* ---------------- fx render ---------------- */
function renderFx(dt) {
  drawPool(bulletIM, bullets);
  drawPool(bulletGlowIM, bullets);
  drawPool(ebulletIM, ebullets);
  drawPool(ebulletCoreIM, ebullets);
  for (let i = sparks.length - 1; i >= 0; i--) {
    const s = sparks[i]; s.t += dt;
    s.x += s.vx * dt; s.y += s.vy * dt; s.vx *= 0.92; s.vy *= 0.92;
    s.s = Math.max(0.05, s.s * (1 - dt * 1.4));
    if (s.t > s.life) sparks.splice(i, 1);
  }
  drawPool(sparkIM, sparks, true);
  for (let i = smokes.length - 1; i >= 0; i--) {
    const s = smokes[i]; s.t += dt;
    s.x += s.vx * dt; s.y += s.vy * dt;
    s.s += dt * 1.6;
    if (s.t > s.life) smokes.splice(i, 1);
  }
  drawPool(smokeIM, smokes);
  for (let i = floaters.length - 1; i >= 0; i--) {
    const f = floaters[i]; f.t += dt;
    if (f.flash) { f.s.position.y += dt * 2; if (f.t > 0.09) { scene.remove(f.s); floaters.splice(i, 1); } continue; }
    f.s.position.y += dt * 3.2;
    f.s.material.opacity = Math.max(0, 1 - f.t / 0.9);
    if (f.t > 0.9) { scene.remove(f.s); f.s.material.map.dispose(); f.s.material.dispose(); floaters.splice(i, 1); }
  }
  if (nova) {
    nova.r += dt * 60;
    nova.mesh.scale.setScalar(nova.r);
    nova.mesh.material.opacity = Math.max(0, 0.95 - nova.r / 30);
    nova.mesh.position.set(P.x, P.y, 0.5);
    if (nova.r > 30) { scene.remove(nova.mesh); nova = null; }
  }
  if (shakeT > 0) {
    shakeT -= dt;
    camera.position.x = rand(-0.35, 0.35) * shakeT * 2.4;
    camera.position.y = rand(-0.35, 0.35) * shakeT * 2.4;
  } else { camera.position.x = 0; camera.position.y = 0; }
}

/* ---------------- main loop ---------------- */
const clock = new THREE.Clock();
let stepCount = 0;
function loop() {
  requestAnimationFrame(loop);
  /* Fixed-step simulation (120 steps/s, render every frame): the game runs
     at full real-time speed even on slow renderers — SwiftShader QA rigs,
     weak phone GPUs — because sim time never depends on frame rate. */
  let acc = Math.min(clock.getDelta(), 0.25);
  const STEP = 1 / 120;
  let n = 0;
  while (acc > 0 && n < 30) { update(STEP, clock.elapsedTime); acc -= STEP; n++; }
  stepCount += n;
  try { renderer.render(scene, camera); }
  catch (e) { /* render fault: never a dead black screen — reload stepped down */
    try { localStorage.setItem('lunaBlasterStage', String(Math.min(2, gfxActive + 1))); } catch (e2) {}
    if (gfxActive >= 2) { if (window.__showFail) window.__showFail(); } else location.reload();
  }
}

/* ---------------- boot ---------------- */
resize();
applyLang();
updateBestLine();
try { const n = localStorage.getItem('lunaBlasterName'); if (n) $('nameInput').value = n; } catch (e) {}
P.y = -VH * 0.32; ship.position.set(0, P.y, 0);
drawRocks();
let lp = 0;
const loadTick = setInterval(() => {
  lp += 25; $('loadBar').style.width = Math.min(100, lp) + '%';
  if (lp >= 100) {
    clearInterval(loadTick);
    $('loader').classList.add('hidden');
    show('menuScreen');
    loop();
  }
}, 120);

/* debug/QA hook (harmless; used by the house QA harness) */
window.__blaster = { S, P, startGame, gameOver, pauseGame, spawnBoss, spawnEnemy, get enemies() { return enemies; }, get boss() { return boss; }, get bullets() { return bullets; }, get pickups() { return pickups; }, get steps() { return stepCount; }, dmgBoss(n) { if (boss) { boss.hp -= n; if (boss.hp <= 0) killBoss(); } } };
