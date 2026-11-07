/* ================================================================
   BARREL TOWER — an original 3D arcade climber by LUNC Dev Studio.
   Climb the red-steel girder tower, dodge the great ape's rolling
   barrels, grab LUNC crescents + USTC stars, reach the top deck.
   All models are procedural Three.js geometry; all textures are
   generated at runtime on canvas. No external assets, no third-
   party game IP. See LICENSES.md.
   ================================================================ */
import * as THREE from 'three';

/* ---------------- error surface (house loader pattern) ---------------- */
window.addEventListener('error', (e) => {
  if (document.getElementById('loadErr')) return;
  const d = document.createElement('div'); d.id = 'loadErr';
  d.textContent = 'Barrel Tower hit a snag loading. Please check your connection and refresh.';
  document.body.appendChild(d);
  const l = document.getElementById('loader'); if (l) l.style.display = 'none';
});

const $ = (id) => document.getElementById(id);
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const lerp = (a, b, t) => a + (b - a) * t;

/* ================= geometry constants ================= */
const DECK_W = 15;              // deck length in x
const DEPTH = 3.4;              // deck depth in z (structure centred z=0)
const PLAY_Z = 0.7;             // gameplay plane
const PLAY_MIN = -6.9, PLAY_MAX = 6.9;
const LV_H = 3.6;               // vertical gap between decks (was 3.0 — one deck removed, taller gaps so the scene reads bigger)
const SLOPE_DY = 0.9;           // high-end minus low-end over a deck
const TOP = 4;                  // top deck index (decks 0..4 — one deck removed Nov 7 at Tom's request: "reduce one level so the screen size can grow")
const HERO_SCALE = 1.35;        // hero visual scale (Tom Nov 7: "make the character a little bit bigger") — visual only; physics stay in world units
const HALF = DECK_W / 2;
const deckDir = (i) => (i === TOP ? 0 : (i % 2 === 0 ? -1 : 1)); // +1: rises toward +x — parity flipped vs the old 6-deck tower so the deck under the flat top (deck 3) still receives barrels on its HIGH end; every deck keeps barrel traffic
const yAt = (i, x) => i * LV_H + deckDir(i) * (x / DECK_W) * SLOPE_DY + SLOPE_DY / 2;
const DECK_T = 0.28;            // deck slab thickness
const DECK_TILT = Math.atan2(SLOPE_DY, DECK_W);

/* Ladders: per lower deck i (0..TOP-1) one full ladder joins deck i to i+1.
   (x position, and whether it is a short decoy on this level — decoys are
   extra short ladders that stop halfway; the full one always works.) */
function ladderX(i) { return [4.9, -4.9, 3.9, -3.9][i]; }
const FILL_XS = [0.4];                      // one mid fill ladder per gap (front layer)
function decoyX(i) { return [-1.2, 1.6, -2.2, 2.4][i]; }

const APE_X = -4.6;             // ape stands left on the top deck
const GOAL_X = 3.2;             // reach this x on the top deck to clear

/* ================= level tuning ================= */
function levelCfg(L) {
  return {
    interval: Math.max(1.15, 2.6 - 0.28 * (L - 1)),     // seconds between barrels
    speed: 3.1 + 0.35 * (L - 1),                        // barrel top speed
    crates: L >= 2,                                     // rolling crates from L2
    fire: L >= 3,                                       // fire drums from L3
    decoys: L >= 2,                                     // short decoy ladders
    maxH: Math.min(6, 3 + Math.floor((L - 1) / 2)),     // hazards alive at once
  };
}

/* ================= state ================= */
const S = {
  mode: 'boot',           // menu | run | pause | over | clear
  score: 0, cres: 0, stars: 0, lives: 3, level: 1,
  runTime: 0, muted: false, invulnT: 0, deathT: 0, clearT: 0,
  camShake: 0, flashT: 0,
};
try { S.muted = localStorage.getItem('barrelTowerMuted') === '1'; } catch (e) {}

/* ================= audio (WebAudio, synthesized) ================= */
let AC = null;
function audio() {
  if (!AC) { const C = window.AudioContext || window.webkitAudioContext; if (C) AC = new C(); }
  if (AC && AC.state === 'suspended') AC.resume();
  return AC;
}
function beep(freq, dur = 0.09, type = 'sine', vol = 0.2, slide = 0) {
  if (S.muted) return; const ac = audio(); if (!ac) return;
  const o = ac.createOscillator(), g = ac.createGain();
  o.type = type; o.frequency.setValueAtTime(freq, ac.currentTime);
  if (slide) o.frequency.exponentialRampToValueAtTime(Math.max(30, freq + slide), ac.currentTime + dur);
  g.gain.setValueAtTime(vol, ac.currentTime);
  g.gain.exponentialRampToValueAtTime(0.001, ac.currentTime + dur);
  o.connect(g); g.connect(ac.destination); o.start(); o.stop(ac.currentTime + dur);
}
const sfx = {
  coin() { beep(1180, 0.07, 'sine', 0.18); setTimeout(() => beep(1760, 0.1, 'sine', 0.16), 55); },
  star() { beep(880, 0.08, 'triangle', 0.2); setTimeout(() => beep(1320, 0.12, 'triangle', 0.18), 60); },
  jump() { beep(300, 0.14, 'square', 0.1, 420); },
  hop() { beep(520, 0.06, 'sine', 0.12, 160); },
  thud() { beep(90, 0.16, 'sine', 0.32, -40); },
  hurt() { beep(220, 0.25, 'sawtooth', 0.2, -140); },
  clear() { [660, 830, 990, 1320].forEach((f, i) => setTimeout(() => beep(f, 0.13, 'triangle', 0.2), i * 95)); },
  over() { [440, 350, 280, 196].forEach((f, i) => setTimeout(() => beep(f, 0.16, 'sawtooth', 0.14), i * 130)); },
  roar() { beep(120, 0.4, 'sawtooth', 0.16, -50); },
};

/* ================= renderer / scene ================= */
const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.28;   // lifted Nov 7 (Tom: "lighten up the screen so you can see more detail")
$('game').appendChild(renderer.domElement);

const scene = new THREE.Scene();
scene.fog = new THREE.FogExp2(0x24365e, 0.008);   // lighter + thinner Nov 7 so the far side of the tower and the backdrop stay visible
const camera = new THREE.PerspectiveCamera(60, 1, 0.1, 300);

function resize() {
  const w = window.innerWidth, h = window.innerHeight;
  renderer.setSize(w, h);
  camera.aspect = w / h; camera.updateProjectionMatrix();
}
window.addEventListener('resize', resize); resize();

/* lights — night set: cool ambient + moon key + warm practicals */
scene.add(new THREE.HemisphereLight(0xa8c8f0, 0x4a3826, 0.85));
const moonLight = new THREE.DirectionalLight(0xcfe0ff, 1.3);
moonLight.position.set(14, 26, 10);
moonLight.castShadow = true;
moonLight.shadow.mapSize.set(2048, 2048);
moonLight.shadow.camera.left = -16; moonLight.shadow.camera.right = 16;
moonLight.shadow.camera.top = 21; moonLight.shadow.camera.bottom = -4;
moonLight.shadow.camera.far = 70; moonLight.shadow.bias = -0.0006;
scene.add(moonLight);
const fillLight = new THREE.DirectionalLight(0xffd9a0, 0.42);
fillLight.position.set(-10, 8, 14); scene.add(fillLight);
const workLights = [];   // {light, bulb, base, phase} — flicker set

/* ================= canvas textures ================= */
function cnv(w, h, fn) {
  const c = document.createElement('canvas'); c.width = w; c.height = h;
  fn(c.getContext('2d'), w, h);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4;
  return t;
}
function grain(g, w, h, n, cols, aMax) {
  for (let i = 0; i < n; i++) {
    g.fillStyle = cols[(Math.random() * cols.length) | 0];
    g.globalAlpha = Math.random() * aMax;
    g.fillRect(Math.random() * w, Math.random() * h, 1 + Math.random() * 3, 1 + Math.random() * 3);
  }
  g.globalAlpha = 1;
}
const woodTex = cnv(512, 256, (g, w, h) => {
  const grad = g.createLinearGradient(0, 0, 0, h);
  grad.addColorStop(0, '#9a6a38'); grad.addColorStop(0.5, '#8a5a2c'); grad.addColorStop(1, '#7c5026');
  g.fillStyle = grad; g.fillRect(0, 0, w, h);
  for (let p = 0; p < 4; p++) {                       // plank bands
    const y0 = p * h / 4;
    g.fillStyle = 'rgba(0,0,0,.28)'; g.fillRect(0, y0, w, 3);
    g.fillStyle = 'rgba(255,220,160,.10)'; g.fillRect(0, y0 + 3, w, 2);
    for (let i = 0; i < 26; i++) {                    // grain streaks
      g.strokeStyle = `rgba(${40 + Math.random() * 40 | 0},${24 + Math.random() * 22 | 0},8,${0.12 + Math.random() * 0.2})`;
      g.lineWidth = 1 + Math.random() * 1.6;
      const yy = y0 + 6 + Math.random() * (h / 4 - 12);
      g.beginPath(); g.moveTo(0, yy);
      g.bezierCurveTo(w * 0.3, yy + (Math.random() * 6 - 3), w * 0.7, yy + (Math.random() * 6 - 3), w, yy);
      g.stroke();
    }
    for (let k = 0; k < 3; k++) {                     // knots
      const kx = Math.random() * w, ky = y0 + h / 8 + (Math.random() * h / 8 - h / 16);
      const rg = g.createRadialGradient(kx, ky, 1, kx, ky, 9);
      rg.addColorStop(0, 'rgba(46,26,8,.85)'); rg.addColorStop(1, 'rgba(46,26,8,0)');
      g.fillStyle = rg; g.beginPath(); g.arc(kx, ky, 9, 0, 7); g.fill();
    }
  }
  grain(g, w, h, 500, ['#5e3c16', '#c08c4c', '#6e4520'], 0.14);
});
woodTex.wrapS = woodTex.wrapT = THREE.RepeatWrapping;
const barrelTex = cnv(512, 256, (g, w, h) => {
  g.fillStyle = '#8a5a2c'; g.fillRect(0, 0, w, h);
  for (let s = 0; s < 8; s++) {                        // vertical staves
    const x0 = s * w / 8;
    g.fillStyle = s % 2 ? 'rgba(255,214,150,.07)' : 'rgba(0,0,0,.09)'; g.fillRect(x0, 0, w / 8, h);
    g.fillStyle = 'rgba(30,16,4,.55)'; g.fillRect(x0, 0, 2.5, h);
    for (let i = 0; i < 12; i++) {
      g.strokeStyle = `rgba(52,30,10,${0.10 + Math.random() * 0.16})`;
      g.lineWidth = 1 + Math.random();
      const xx = x0 + 4 + Math.random() * (w / 8 - 8);
      g.beginPath(); g.moveTo(xx, 0); g.lineTo(xx + (Math.random() * 4 - 2), h); g.stroke();
    }
  }
  grain(g, w, h, 420, ['#5e3c16', '#c08c4c'], 0.13);
});
const steelTex = cnv(256, 256, (g, w, h) => {
  const grad = g.createLinearGradient(0, 0, w, h);
  grad.addColorStop(0, '#a03428'); grad.addColorStop(0.5, '#8e2b20'); grad.addColorStop(1, '#7e261b');
  g.fillStyle = grad; g.fillRect(0, 0, w, h);
  grain(g, w, h, 900, ['#5c1a10', '#c05038', '#6e2013', '#d4694f'], 0.20);
  for (let i = 0; i < 26; i++) {                       // scratches / rust runs
    g.fillStyle = `rgba(60,20,8,${0.10 + Math.random() * 0.18})`;
    g.fillRect(Math.random() * w, Math.random() * h, 1.5, 8 + Math.random() * 30);
  }
});
steelTex.wrapS = steelTex.wrapT = THREE.RepeatWrapping;
/* tactile depth: derive bump maps from the diffuse canvases so wood grain,
   rust and stave seams catch the work-lights instead of reading flat */
const bumpOf = (src, strength) => {
  const c = document.createElement('canvas');
  c.width = src.image.width; c.height = src.image.height;
  const g = c.getContext('2d');
  g.filter = 'grayscale(1) contrast(1.25)';
  g.drawImage(src.image, 0, 0);
  g.filter = 'none';
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  return t;
};
const woodBump = bumpOf(woodTex), barrelBump = bumpOf(barrelTex), steelBump = bumpOf(steelTex);
const crateTex = cnv(256, 256, (g, w, h) => {
  g.drawImage(woodTex.image, 0, 0, w, h);
  g.strokeStyle = 'rgba(70,44,16,.9)'; g.lineWidth = 16; g.strokeRect(8, 8, w - 16, h - 16);
  g.lineWidth = 11; g.beginPath();
  g.moveTo(10, 10); g.lineTo(w - 10, h - 10); g.moveTo(w - 10, 10); g.lineTo(10, h - 10); g.stroke();
  g.fillStyle = 'rgba(52,30,10,.85)';
  [[14, 14], [w - 14, 14], [14, h - 14], [w - 14, h - 14]].forEach(([x, y]) => { g.beginPath(); g.arc(x, y, 5, 0, 7); g.fill(); });
});
function textPlate(lines, opts = {}) {
  const fs = opts.fs || 64, pad = 26;
  const meas = document.createElement('canvas').getContext('2d');
  const font = `900 ${fs}px 'Arial Black',Arial,sans-serif`;
  meas.font = font;
  const tw = Math.max(...lines.map((s) => meas.measureText(s).width));
  const w = Math.ceil(tw + pad * 2), h = Math.ceil(fs * 1.28 * lines.length + pad * 1.4);
  const tex = cnv(w, h, (g) => {
    if (opts.bg) { g.fillStyle = opts.bg; g.fillRect(0, 0, w, h); }
    if (opts.border) { g.strokeStyle = opts.border; g.lineWidth = 8; g.strokeRect(6, 6, w - 12, h - 12); }
    g.font = font; g.textAlign = 'center'; g.textBaseline = 'middle';
    lines.forEach((s, i) => {
      const y = pad * 0.7 + fs * 1.28 * (i + 0.5);
      if (opts.glow) { g.shadowColor = opts.glow; g.shadowBlur = 26; }
      g.fillStyle = opts.fg || '#ffe9a8'; g.fillText(s, w / 2, y);
      g.shadowBlur = 0;
      if (opts.stroke) { g.lineWidth = 3; g.strokeStyle = opts.stroke; g.strokeText(s, w / 2, y); }
    });
  });
  return { tex, aspect: w / h };
}
const skyTex = cnv(1024, 512, (g, w, h) => {
  const grad = g.createLinearGradient(0, 0, 0, h);
  grad.addColorStop(0, '#16264d'); grad.addColorStop(0.55, '#243a6b'); grad.addColorStop(1, '#3a5a94');
  g.fillStyle = grad; g.fillRect(0, 0, w, h);
  for (let i = 0; i < 260; i++) {                      // stars
    g.fillStyle = `rgba(255,255,255,${0.25 + Math.random() * 0.75})`;
    const r = Math.random() < 0.08 ? 2 : 1;
    g.fillRect(Math.random() * w, Math.random() * h * 0.8, r, r);
  }
  const neb = (x, y, r, col) => { const rg = g.createRadialGradient(x, y, 0, x, y, r); rg.addColorStop(0, col); rg.addColorStop(1, 'rgba(0,0,0,0)'); g.fillStyle = rg; g.fillRect(x - r, y - r, r * 2, r * 2); };
  neb(w * 0.22, h * 0.3, 190, 'rgba(70,100,190,.24)');
  neb(w * 0.78, h * 0.18, 150, 'rgba(120,80,180,.18)');
  neb(w * 0.55, h * 0.55, 220, 'rgba(50,80,160,.16)');
});

/* ================= shared materials / geometries ================= */
const M = {
  steel: new THREE.MeshStandardMaterial({ map: steelTex, bumpMap: steelBump, bumpScale: 0.6, roughness: 0.58, metalness: 0.5 }),
  steelDark: new THREE.MeshStandardMaterial({ color: 0x6e2013, roughness: 0.7, metalness: 0.45 }),
  wood: new THREE.MeshStandardMaterial({ map: woodTex, bumpMap: woodBump, bumpScale: 0.7, roughness: 0.82, metalness: 0.02 }),
  woodDark: new THREE.MeshStandardMaterial({ color: 0x6e4520, roughness: 0.9 }),
  barrel: new THREE.MeshStandardMaterial({ map: barrelTex, bumpMap: barrelBump, bumpScale: 0.8, roughness: 0.78 }),
  band: new THREE.MeshStandardMaterial({ color: 0x3c4148, roughness: 0.38, metalness: 0.85 }),
  gold: new THREE.MeshStandardMaterial({ color: 0xffc93d, roughness: 0.24, metalness: 0.95, emissive: 0x664d00, emissiveIntensity: 0.35 }),
  goldFlat: new THREE.MeshStandardMaterial({ color: 0xf5b942, roughness: 0.3, metalness: 0.9 }),
  brass: new THREE.MeshStandardMaterial({ color: 0xc9962e, roughness: 0.35, metalness: 0.9 }),
  crate: new THREE.MeshStandardMaterial({ map: crateTex, bumpMap: woodBump, bumpScale: 0.5, roughness: 0.85 }),
  ladder: new THREE.MeshStandardMaterial({ color: 0xd8b25a, roughness: 0.42, metalness: 0.75 }),
  rope: new THREE.MeshStandardMaterial({ color: 0x8a6f42, roughness: 0.95 }),
  coneOrange: new THREE.MeshStandardMaterial({ color: 0xe8641c, roughness: 0.6 }),
  coneWhite: new THREE.MeshStandardMaterial({ color: 0xf2f2f2, roughness: 0.5 }),
  bulb: new THREE.MeshStandardMaterial({ color: 0xffca7a, emissive: 0xffa63d, emissiveIntensity: 2.6 }),
  lampMetal: new THREE.MeshStandardMaterial({ color: 0x2e3238, roughness: 0.45, metalness: 0.8 }),
  fur: new THREE.MeshStandardMaterial({ color: 0x6b4a2f, roughness: 0.95 }),
  furDark: new THREE.MeshStandardMaterial({ color: 0x4a3018, roughness: 0.97 }),
  skin: new THREE.MeshStandardMaterial({ color: 0x8a7360, roughness: 0.8 }),
  leather: new THREE.MeshStandardMaterial({ color: 0x54401e, roughness: 0.75 }),
  hatOrange: new THREE.MeshStandardMaterial({ color: 0xf07d18, roughness: 0.35, metalness: 0.1 }),
  denim: new THREE.MeshStandardMaterial({ color: 0x2e5fa3, roughness: 0.85 }),
  shirt: new THREE.MeshStandardMaterial({ color: 0x3f8f5f, roughness: 0.85 }),
  skinC: new THREE.MeshStandardMaterial({ color: 0xf2b98a, roughness: 0.7 }),
  shoeRed: new THREE.MeshStandardMaterial({ color: 0xc23b2e, roughness: 0.55 }),
  pack: new THREE.MeshStandardMaterial({ color: 0x707880, roughness: 0.8 }),
  fireMetal: new THREE.MeshStandardMaterial({ color: 0x8a3324, roughness: 0.55, metalness: 0.5 }),
};
const boxGeo = new THREE.BoxGeometry(1, 1, 1);
function box(parent, mat, x, y, z, sx, sy, sz, shadow = true) {
  const m = new THREE.Mesh(boxGeo, mat);
  m.position.set(x, y, z); m.scale.set(sx, sy, sz);
  m.castShadow = shadow; m.receiveShadow = true;
  parent.add(m); return m;
}
function cyl(parent, mat, rt, rb, h, seg = 14) {
  const m = new THREE.Mesh(new THREE.CylinderGeometry(rt, rb, h, seg), mat);
  m.castShadow = true; m.receiveShadow = true; parent.add(m); return m;
}
/* gold crescent: extruded crescent shape (two-circle cut) */
function crescentGeo(r = 0.34, depth = 0.09) {
  const s = new THREE.Shape();
  s.absarc(0, 0, r, 0, Math.PI * 2, false);
  const hole = new THREE.Path();
  hole.absarc(r * 0.42, r * 0.22, r * 0.82, 0, Math.PI * 2, true);
  s.holes.push(hole);
  const g = new THREE.ExtrudeGeometry(s, { depth, bevelEnabled: true, bevelThickness: 0.02, bevelSize: 0.02, bevelSegments: 2, curveSegments: 28 });
  g.center(); return g;
}
function starGeo(r = 0.34, depth = 0.09) {
  const s = new THREE.Shape();
  for (let i = 0; i < 10; i++) {
    const a = (i / 10) * Math.PI * 2 - Math.PI / 2, rr = i % 2 ? r * 0.45 : r;
    const x = Math.cos(a) * rr, y = Math.sin(a) * rr;
    if (i === 0) s.moveTo(x, y); else s.lineTo(x, y);
  }
  s.closePath();
  const g = new THREE.ExtrudeGeometry(s, { depth, bevelEnabled: true, bevelThickness: 0.02, bevelSize: 0.02, bevelSegments: 2 });
  g.center(); return g;
}
const cresGeoShared = crescentGeo();
const starGeoShared = starGeo();
const starMat = new THREE.MeshStandardMaterial({ color: 0x59e0d2, roughness: 0.25, metalness: 0.4, emissive: 0x1fbfae, emissiveIntensity: 0.9 });

/* ================= background: sky, moon, city, dust ================= */
{
  const sky = new THREE.Mesh(new THREE.SphereGeometry(160, 24, 16),
    new THREE.MeshBasicMaterial({ map: skyTex, side: THREE.BackSide, fog: false }));
  sky.position.set(0, 10, -30); scene.add(sky);
}
const moonGroup = new THREE.Group();
{
  const glow = new THREE.Mesh(new THREE.CircleGeometry(5.4, 32),
    new THREE.MeshBasicMaterial({ color: 0xffeeb8, transparent: true, opacity: 0.2, fog: false }));
  const moon = new THREE.Mesh(crescentGeo(3.1, 0.2),
    new THREE.MeshBasicMaterial({ color: 0xf7e3a1, fog: false }));
  moon.rotation.z = -0.5;
  moonGroup.add(glow, moon);
  moonGroup.position.set(10.5, 20.8, -26); moonGroup.scale.setScalar(0.62);
  scene.add(moonGroup);
}
{ /* distant city glow: two dark skyline planes + lit-window sprites */
  const cityMat = new THREE.MeshBasicMaterial({ color: 0x1d2c52, fog: false });   // lifted Nov 7 so the skyline reads against the lighter sky
  const mkRow = (z, y0, seed) => {
    const grp = new THREE.Group();
    let x = -46;
    let s = seed;
    const rnd = () => { s = (s * 16807) % 2147483647; return s / 2147483647; };
    while (x < 46) {
      const w = 2.5 + rnd() * 4, h = 3 + rnd() * 7;
      const b = new THREE.Mesh(boxGeo, cityMat);
      b.position.set(x + w / 2, y0 + h / 2, z); b.scale.set(w, h, 0.5); grp.add(b);
      const n = (w * h * 0.55) | 0;
      for (let i = 0; i < n; i++) {
        const win = new THREE.Mesh(new THREE.PlaneGeometry(0.22, 0.3),
          new THREE.MeshBasicMaterial({ color: rnd() > 0.3 ? 0xffca7a : 0xbfd8ff, transparent: true, opacity: 0.4 + rnd() * 0.4, fog: false }));
        win.position.set(x + 0.4 + rnd() * (w - 0.8), y0 + 0.5 + rnd() * (h - 1), z + 0.3);
        grp.add(win);
      }
      x += w + 0.4 + rnd() * 1.6;
    }
    scene.add(grp);
  };
  mkRow(-34, -8.5, 12345); mkRow(-27, -9.5, 777);
  const groundGlow = new THREE.Mesh(new THREE.PlaneGeometry(120, 26),
    new THREE.MeshBasicMaterial({ color: 0x27355e, transparent: true, opacity: 0.5, fog: false }));
  groundGlow.rotation.x = -Math.PI / 2; groundGlow.position.set(0, -6.4, -8);
  scene.add(groundGlow);
  /* warm horizon glow bed: radial canvas gradient — the city breathing below */
  {
    const gc = document.createElement('canvas'); gc.width = 256; gc.height = 128;
    const gg = gc.getContext('2d');
    const grad = gg.createRadialGradient(128, 128, 8, 128, 128, 128);
    grad.addColorStop(0, 'rgba(255,166,66,0.55)');
    grad.addColorStop(0.45, 'rgba(214,110,40,0.28)');
    grad.addColorStop(1, 'rgba(120,50,20,0)');
    gg.fillStyle = grad; gg.fillRect(0, 0, 256, 128);
    const glowTex = new THREE.CanvasTexture(gc);
    const bed = new THREE.Mesh(new THREE.PlaneGeometry(110, 30),
      new THREE.MeshBasicMaterial({ map: glowTex, transparent: true, depthWrite: false, fog: false }));
    bed.position.set(0, -3.2, -30);
    scene.add(bed);
    const bedNear = new THREE.Mesh(new THREE.PlaneGeometry(70, 16),
      new THREE.MeshBasicMaterial({ map: glowTex, transparent: true, opacity: 0.7, depthWrite: false, fog: false }));
    bedNear.position.set(0, -4.6, -14);
    scene.add(bedNear);
  }
}
/* drifting dust motes near the work-lights */
const MOTES = 220;
const moteGeo = new THREE.BufferGeometry();
{
  const pos = new Float32Array(MOTES * 3);
  for (let i = 0; i < MOTES; i++) {
    pos[i * 3] = (Math.random() - 0.5) * 20;
    pos[i * 3 + 1] = Math.random() * 19 - 1;
    pos[i * 3 + 2] = (Math.random() - 0.5) * 6 + 1;
  }
  moteGeo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
}
const motes = new THREE.Points(moteGeo, new THREE.PointsMaterial({
  color: 0xffd9a0, size: 0.075, transparent: true, opacity: 0.6, depthWrite: false,
}));
scene.add(motes);

/* ================= tower structure ================= */
const world = new THREE.Group(); scene.add(world);
const POST_XS = [-HALF, -HALF / 2, 0, HALF / 2, HALF];
function beamBetween(parent, a, b, t, mat) {
  const d = new THREE.Vector3().subVectors(b, a);
  const len = d.length();
  const m = new THREE.Mesh(boxGeo, mat || M.steel);
  m.scale.set(t, len, t);
  m.position.copy(a).addScaledVector(d, 0.5);
  m.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), d.normalize());
  m.castShadow = true; m.receiveShadow = true;
  parent.add(m); return m;
}
function rivets(parent, x0, x1, y, z, n) {
  const g = new THREE.SphereGeometry(0.055, 6, 5);
  for (let i = 0; i < n; i++) {
    const r = new THREE.Mesh(g, M.band);
    r.position.set(lerp(x0, x1, n === 1 ? 0 : i / (n - 1)), y, z);
    parent.add(r);
  }
}
const stringBulbs = [];
function stringRun(parent, a, b, nB) {
  const pts = [];
  for (let i = 0; i <= 16; i++) {
    const t = i / 16, p = new THREE.Vector3().lerpVectors(a, b, t);
    p.y -= Math.sin(t * Math.PI) * 0.34;
    pts.push(p);
  }
  const wire = new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 24, 0.02, 5), M.lampMetal);
  parent.add(wire);
  for (let i = 1; i < nB + 1; i++) {
    const t = i / (nB + 1), p = new THREE.Vector3().lerpVectors(a, b, t);
    p.y -= Math.sin(t * Math.PI) * 0.34;
    const bulb = new THREE.Mesh(new THREE.SphereGeometry(0.075, 8, 8), M.bulb);
    bulb.position.copy(p); bulb.position.y -= 0.07;
    parent.add(bulb); stringBulbs.push(bulb);
  }
}
function hangingLamp(parent, x, y, z) {
  const g = new THREE.Group(); g.position.set(x, y, z);
  const cord = cyl(g, M.lampMetal, 0.02, 0.02, 0.8); cord.position.y = -0.4;
  const shade = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.34, 0.26, 14, 1, true), M.lampMetal);
  shade.position.y = -0.86; shade.castShadow = true; g.add(shade);
  const bulb = new THREE.Mesh(new THREE.SphereGeometry(0.1, 10, 10), M.bulb);
  bulb.position.y = -0.95; g.add(bulb);
  const pl = new THREE.PointLight(0xffb45e, 14, 8.5, 1.9);
  pl.position.y = -1.0; g.add(pl);
  parent.add(g);
  workLights.push({ light: pl, base: 14, phase: Math.random() * 9 });
  return g;
}
const deckGroups = [];
function buildTower() {
  for (let i = 0; i <= TOP; i++) {
    const g = new THREE.Group(); world.add(g); deckGroups.push(g);
    const dir = deckDir(i);
    /* wooden plank deck (planks run along z, gaps show) */
    const nP = 9, pw = DECK_W / nP;
    for (let p = 0; p < nP; p++) {
      const x = -HALF + pw * (p + 0.5);
      const plank = box(g, M.wood, x, yAt(i, x) - DECK_T / 2, 0, pw - 0.07, DECK_T, DEPTH);
      plank.rotation.z = -dir * DECK_TILT;
      plank.material = M.wood;
    }
    /* steel edge beams under both long edges */
    [-DEPTH / 2 + 0.14, DEPTH / 2 - 0.14].forEach((z) => {
      const b = box(g, M.steel, 0, i * LV_H + SLOPE_DY / 2 - DECK_T - 0.14, z, DECK_W + 0.3, 0.3, 0.22);
      b.rotation.z = -dir * DECK_TILT;
    });
    /* posts at this level's corners down to the deck below */
    if (i > 0) {
      [-HALF + 0.15, HALF - 0.15].forEach((x) => {
        [-DEPTH / 2 + 0.15, DEPTH / 2 - 0.15].forEach((z) => {
          box(g, M.steel, x, (yAt(i, x) + yAt(i - 1, x)) / 2 - DECK_T, z, 0.21, LV_H, 0.21);
        });
      });
      /* X-bracing on the front face */
      const zf = DEPTH / 2 - 0.15;
      for (let sIdx = 0; sIdx < POST_XS.length - 1; sIdx++) {
        const x0 = POST_XS[sIdx] + 0.1, x1 = POST_XS[sIdx + 1] - 0.1;
        beamBetween(g, new THREE.Vector3(x0, yAt(i - 1, x0) - 0.1, zf), new THREE.Vector3(x1, yAt(i, x1) - DECK_T - 0.2, zf), 0.075);
        beamBetween(g, new THREE.Vector3(x0, yAt(i, x0) - DECK_T - 0.2, zf), new THREE.Vector3(x1, yAt(i - 1, x1) - 0.1, zf), 0.075);
      }
      /* back-face horizontal struts */
      [-DEPTH / 2 + 0.15].forEach((z) => {
        const b = box(g, M.steelDark, 0, (i - 0.5) * LV_H + SLOPE_DY / 2, z, DECK_W, 0.16, 0.16);
        b.rotation.z = -dir * DECK_TILT;
      });
    } else {
      [-HALF + 0.15, HALF - 0.15].forEach((x) => {
        [-DEPTH / 2 + 0.15, DEPTH / 2 - 0.15].forEach((z) => {
          box(g, M.steel, x, yAt(0, x) / 2 - DECK_T, z, 0.3, yAt(0, x), 0.3);
        });
      });
      const base = box(g, M.steelDark, 0, -0.55, 0, DECK_W + 1.6, 0.5, DEPTH + 1.4);
      base.receiveShadow = true;
    }
    /* rivet rows along the front edge beam */
    rivets(g, -HALF + 0.5, HALF - 0.5, yAt(i, 0) + 0.02, DEPTH / 2 + 0.02, 9);
    /* safety rail along the back edge */
    const railY = (x) => yAt(i, x) + 0.55;
    [-HALF + 0.1, HALF - 0.1].forEach((x) => box(g, M.ladder, x, yAt(i, x) + 0.28, -DEPTH / 2 + 0.08, 0.07, 0.56, 0.07));
    const rail = box(g, M.ladder, 0, railY(0), -DEPTH / 2 + 0.08, DECK_W, 0.07, 0.07);
    rail.rotation.z = -dir * DECK_TILT;
    /* string lights under the deck above (skip on the ground deck) */
    if (i > 0) stringRun(g, new THREE.Vector3(-HALF + 0.6, i * LV_H - 0.5, DEPTH / 2 - 0.3), new THREE.Vector3(HALF - 0.6, i * LV_H - 0.5, DEPTH / 2 - 0.3), 7);
    /* hanging lamps */
    if (i < TOP) { hangingLamp(g, -3.4 + i * 0.7, (i + 1) * LV_H + 0.35, 1.1); hangingLamp(g, 3.8 - i * 0.6, (i + 1) * LV_H + 0.35, 1.1); }
    /* set dressing: cones + crates on some decks */
    if (i === 1 || i === 3) makeCone(g, 5.9 - i, yAt(i, 5.9 - i), 1.15);
    if (i === 2) makeCone(g, -6.1 + i * 0.4, yAt(i, -6.1 + i * 0.4), 1.15);
    if (i === 2) { const c = makeCrate(0.95); c.position.set(-5.6, yAt(2, -5.6) + 0.48, -0.9); g.add(c); }
    if (i === 3) { const c = makeCrate(0.95); c.position.set(5.7, yAt(3, 5.7) + 0.48, -0.9); g.add(c); const c2 = makeCrate(0.7); c2.position.set(5.7, yAt(3, 5.7) + 1.3, -0.9); g.add(c2); }
  }
  /* side safety rails on the top deck front (concept key art) */
  const tg = deckGroups[TOP];
  [-5.4, 5.4].forEach((x) => box(tg, M.ladder, x, yAt(TOP, x) + 0.3, DEPTH / 2 - 0.1, 0.07, 0.6, 0.07));
  const tr = box(tg, M.ladder, 0, yAt(TOP, 0) + 0.6, DEPTH / 2 - 0.1, DECK_W - 2, 0.07, 0.07);
  /* LUNA CLASSIC illuminated sign on the front of the top deck */
  const sign = textPlate(['LUNA', 'CLASSIC'], { fs: 92, bg: '#131a2e', border: '#f5b942', fg: '#ffe9a8', glow: '#ffb62e' });
  const signMesh = new THREE.Mesh(new THREE.PlaneGeometry(3.1, 3.1 / sign.aspect),
    new THREE.MeshBasicMaterial({ map: sign.tex, transparent: false }));
  signMesh.position.set(1.6, TOP * LV_H - 1.0, DEPTH / 2 + 0.42);
  world.add(signMesh);
  const signBack = box(world, M.lampMetal, 1.6, TOP * LV_H - 1.0, DEPTH / 2 + 0.3, 3.3, 3.3 / sign.aspect + 0.2, 0.1);
  signBack.castShadow = false;
  /* LUNC DEV STUDIO banner strung mid-tower */
  const ban = textPlate(['LUNC DEV STUDIO'], { fs: 54, bg: 'rgba(232,168,28,.88)', fg: '#221a02' });
  const banMesh = new THREE.Mesh(new THREE.PlaneGeometry(4.6, 4.6 / ban.aspect),
    new THREE.MeshStandardMaterial({ map: ban.tex, side: THREE.DoubleSide, roughness: 0.9 }));
  banMesh.position.set(-0.6, 2 * LV_H - 0.72, DEPTH / 2 + 0.5);
  banMesh.rotation.z = 0.012;
  world.add(banMesh);
  /* ladders */
  buildLadders(false);
}
const ladderGroup = new THREE.Group();
function makeLadder(x, i, full) {
  const g = new THREE.Group();
  const yB = yAt(i, x), yT = yAt(i + 1, x);
  const h = full ? (yT - yB) + 0.55 : (yT - yB) * 0.52;
  [-0.26, 0.26].forEach((dx) => box(g, M.ladder, x + dx, yB + h / 2, PLAY_Z, 0.07, h, 0.07));
  const nR = Math.max(2, Math.floor(h / 0.34));
  for (let r = 0; r <= nR; r++) box(g, M.ladder, x, yB + 0.18 + (h - 0.3) * (r / nR), PLAY_Z, 0.55, 0.055, 0.055);
  g.userData = { x, from: i, full, topY: yB + h };
  return g;
}
function buildLadders(withDecoys) {
  while (ladderGroup.children.length) ladderGroup.remove(ladderGroup.children[0]);
  for (let i = 0; i < TOP; i++) {
    ladderGroup.add(makeLadder(ladderX(i), i, true));
    FILL_XS.forEach((fx) => ladderGroup.add(makeLadder(fx, i, true)));
    if (withDecoys) ladderGroup.add(makeLadder(decoyX(i), i, false));
  }
  if (!ladderGroup.parent) world.add(ladderGroup);
}
/* ladder lookup for gameplay: full ladders only */
function ladderAt(deck, x) {
  let best = null, bd = 0.62;
  for (const g of ladderGroup.children) {
    if (!g.userData.full) continue;
    if (g.userData.from !== deck && g.userData.from !== deck - 1) continue;
    const d = Math.abs(g.userData.x - x);
    if (d < bd) { bd = d; best = g.userData; }
  }
  return best;
}
function makeCone(parent, x, y, z) {
  const g = new THREE.Group(); g.position.set(x, y, z);
  const bodyC = new THREE.Mesh(new THREE.ConeGeometry(0.21, 0.52, 12), M.coneOrange);
  bodyC.position.y = 0.28; bodyC.castShadow = true; g.add(bodyC);
  const stripe = new THREE.Mesh(new THREE.CylinderGeometry(0.135, 0.165, 0.13, 12), M.coneWhite);
  stripe.position.y = 0.3; g.add(stripe);
  box(g, M.coneOrange, 0, 0.025, 0, 0.5, 0.05, 0.5);
  parent.add(g); return g;
}
function makeCrate(size) {
  const g = new THREE.Group();
  const c = new THREE.Mesh(boxGeo, M.crate);
  c.scale.setScalar(size); c.castShadow = true; c.receiveShadow = true; g.add(c);
  g.userData.size = size;
  return g;
}

/* ================= barrels & hazards ================= */
function makeBarrel() {
  const g = new THREE.Group();
  const bodyB = new THREE.Mesh(new THREE.CylinderGeometry(0.42, 0.42, 0.78, 18), M.barrel);
  bodyB.castShadow = true; g.add(bodyB);
  const belly = new THREE.Mesh(new THREE.SphereGeometry(0.435, 18, 12), M.barrel);
  belly.scale.set(1, 0.78, 1); belly.castShadow = true; g.add(belly);
  [-0.26, 0.26].forEach((y) => {
    const band = new THREE.Mesh(new THREE.TorusGeometry(0.432, 0.032, 8, 22), M.band);
    band.rotation.x = Math.PI / 2; band.position.y = y; g.add(band);
  });
  [0.4, -0.4].forEach((y) => {
    const cap = new THREE.Mesh(new THREE.CircleGeometry(0.4, 18), M.woodDark);
    cap.rotation.x = y > 0 ? -Math.PI / 2 : Math.PI / 2; cap.position.y = y; g.add(cap);
  });
  g.rotation.z = Math.PI / 2;   // lying on its side, axis along x
  return g;
}
function makeFireDrum() {
  const g = makeBarrel();
  g.children[0].material = M.fireMetal; g.children[1].material = M.fireMetal;
  const flame = new THREE.Group();
  const f1 = new THREE.Mesh(new THREE.ConeGeometry(0.16, 0.5, 8),
    new THREE.MeshBasicMaterial({ color: 0xff7b24, transparent: true, opacity: 0.9 }));
  f1.position.y = 0.34;
  const f2 = new THREE.Mesh(new THREE.ConeGeometry(0.09, 0.34, 8),
    new THREE.MeshBasicMaterial({ color: 0xffd23d, transparent: true, opacity: 0.95 }));
  f2.position.y = 0.3;
  flame.add(f1, f2); flame.position.y = 0.42; flame.rotation.z = -Math.PI / 2;
  flame.name = 'flame';
  g.add(flame);
  const pl = new THREE.PointLight(0xff8b3d, 7, 5.5, 2); g.add(pl);
  g.userData.flame = flame;
  return g;
}
const hazards = [];   // {grp, kind, deck, dir, speed, active, spin}
function spawnHazardPool() {
  for (let i = 0; i < 8; i++) {
    const b = makeBarrel(); b.visible = false; world.add(b);
    hazards.push({ grp: b, kind: 'barrel', deck: 0, dir: 1, active: false, falling: 0, x: 0, yOff: 0, passedBy: false });
    const c = makeCrate(0.8); c.visible = false; world.add(c);
    hazards.push({ grp: c, kind: 'crate', deck: 0, dir: 1, active: false, falling: 0, x: 0, yOff: 0, passedBy: false });
  }
  for (let i = 0; i < 3; i++) {
    const f = makeFireDrum(); f.visible = false; world.add(f);
    hazards.push({ grp: f, kind: 'fire', deck: 0, dir: 1, active: false, falling: 0, x: 0, yOff: 0, passedBy: false });
  }
}
function freeHazard(kind) { return hazards.find((h) => h.kind === kind && !h.active); }

/* ================= pickups ================= */
const pickups = [];   // {grp, kind:'cres'|'star', deck, x, taken}
function layoutPickups() {
  for (const p of pickups) { world.remove(p.grp); }
  pickups.length = 0;
  const spots = [
    [0, -3.4, 'cres'], [0, 2.6, 'cres'], [0, 5.6, 'star'],
    [1, -2.2, 'cres'], [1, 0.8, 'cres'], [1, 4.4, 'cres'],
    [2, -4.6, 'star'], [2, -0.6, 'cres'], [2, 3.2, 'cres'],
    [3, -3.0, 'cres'], [3, 1.4, 'star'], [3, 5.2, 'cres'],
    [4, -5.2, 'star'], [4, -1.6, 'cres'], [4, 0.6, 'cres'], [4, 2.2, 'cres'],
  ];
  for (const [deck, x, kind] of spots) {
    const grp = new THREE.Group();
    const mesh = new THREE.Mesh(kind === 'cres' ? cresGeoShared : starGeoShared, kind === 'cres' ? M.gold : starMat);
    mesh.castShadow = true; grp.add(mesh);
    grp.position.set(x, yAt(deck, x) + 0.62, PLAY_Z);
    world.add(grp);
    pickups.push({ grp, mesh, kind, deck, x, taken: false, ph: Math.random() * 6 });
  }
}

/* ================= THE APE ================= */
const ape = new THREE.Group();
const apeParts = {};
function buildApe() {
  const fur = M.fur, furD = M.furDark, skin = M.skin;
  const sph = (mat, r) => { const m = new THREE.Mesh(new THREE.SphereGeometry(r, 18, 14), mat); m.castShadow = true; return m; };
  /* legs + hips (squatting stance on the top deck) */
  const hips = sph(furD, 0.78); hips.scale.set(1.15, 0.8, 0.9); hips.position.y = 1.05; ape.add(hips);
  [-1, 1].forEach((s) => {
    const thigh = sph(fur, 0.5); thigh.scale.set(0.75, 1.25, 0.75); thigh.position.set(0.95 * s, 0.78, 0.18); thigh.rotation.z = 0.5 * s; ape.add(thigh);
    const shin = sph(furD, 0.42); shin.scale.set(0.7, 1.1, 0.7); shin.position.set(1.28 * s, 0.3, 0.3); ape.add(shin);
    const foot = box(ape, furD, 1.3 * s, 0.09, 0.52, 0.42, 0.18, 0.85);
    foot.castShadow = true;
  });
  /* torso */
  const torso = new THREE.Group(); torso.position.y = 1.95; ape.add(torso); apeParts.torso = torso;
  const belly = sph(skin, 0.92); belly.scale.set(0.92, 1.12, 0.66); belly.position.set(0, 0.1, 0.3); torso.add(belly);
  const chest = sph(fur, 1.08); chest.scale.set(1.22, 1.05, 0.78); chest.position.set(0, 0.18, -0.08); torso.add(chest);
  const pec = sph(skin, 0.8); pec.scale.set(1.1, 0.8, 0.5); pec.position.set(0, 0.42, 0.42); torso.add(pec);
  /* harness: two leather straps crossing to the medallion */
  [-1, 1].forEach((s) => {
    const strap = box(torso, M.leather, 0.34 * s, 0.28, 0.62, 0.2, 1.5, 0.06);
    strap.rotation.z = 0.62 * s;
    const buckle = box(torso, M.brass, 0.55 * s, 0.72, 0.6, 0.16, 0.16, 0.05);
    buckle.rotation.z = 0.62 * s;
  });
  const belt = box(torso, M.leather, 0, -0.72, 0.28, 1.5, 0.24, 0.9);
  belt.scale.set(1, 1, 0.9);
  /* THE gold crescent medallion */
  const med = new THREE.Group(); med.position.set(0, 0.28, 0.78); torso.add(med);
  const medBack = new THREE.Mesh(new THREE.CylinderGeometry(0.52, 0.52, 0.09, 28), M.brass);
  medBack.rotation.x = Math.PI / 2; med.add(medBack);
  const medCres = new THREE.Mesh(crescentGeo(0.4, 0.07), M.gold);
  medCres.position.z = 0.08; med.add(medCres);
  const chain = new THREE.Mesh(new THREE.TorusGeometry(0.62, 0.045, 8, 24, Math.PI), M.brass);
  chain.position.set(0, 0.62, 0.45); chain.rotation.z = Math.PI; chain.rotation.x = 0.25; torso.add(chain);
  apeParts.medallion = med;
  /* gold shoulder pad (his right) */
  const pad = sph(M.goldFlat, 0.52); pad.scale.set(1.05, 0.62, 1.05); pad.position.set(-1.18, 0.88, 0); torso.add(pad);
  const padRim = new THREE.Mesh(new THREE.TorusGeometry(0.5, 0.05, 8, 20), M.brass);
  padRim.rotation.x = Math.PI / 2; padRim.position.set(-1.18, 0.8, 0); torso.add(padRim);
  /* arms */
  function arm(side) {
    const sh = new THREE.Group(); sh.position.set(1.28 * side, 0.72, 0.02); torso.add(sh);
    const upper = sph(fur, 0.46); upper.scale.set(0.78, 1.5, 0.78); upper.position.y = -0.55; sh.add(upper);
    const foreG = new THREE.Group(); foreG.position.y = -1.12; sh.add(foreG);
    const fore = sph(furD, 0.4); fore.scale.set(0.75, 1.35, 0.75); fore.position.y = -0.45; foreG.add(fore);
    const fist = sph(skin, 0.4); fist.scale.set(0.95, 0.8, 1.15); fist.position.set(0, -0.98, 0.06); foreG.add(fist);
    [-0.16, 0, 0.16].forEach((dx) => {
      const kn = sph(skin, 0.11); kn.position.set(dx, -1.2, 0.3); foreG.add(kn);
    });
    sh.rotation.z = 0.35 * side;
    return { sh, foreG };
  }
  apeParts.armL = arm(-1); apeParts.armR = arm(1);
  /* head */
  const head = new THREE.Group(); head.position.set(0, 1.32, 0.05); torso.add(head); apeParts.head = head;
  const skull = sph(furD, 0.62); skull.scale.set(1, 1.05, 0.95); head.add(skull);
  const brow = box(head, furD, 0, 0.18, 0.48, 0.95, 0.22, 0.3);
  const muzzle = sph(skin, 0.4); muzzle.scale.set(1.05, 0.72, 0.8); muzzle.position.set(0, -0.22, 0.38); head.add(muzzle);
  const nose = box(head, skin, 0, -0.08, 0.68, 0.3, 0.12, 0.12);
  [-0.09, 0.09].forEach((dx) => { const n = new THREE.Mesh(new THREE.SphereGeometry(0.035, 6, 6), M.furDark); n.position.set(dx, -0.06, 0.74); head.add(n); });
  const mouth = box(head, M.furDark, 0, -0.36, 0.6, 0.34, 0.05, 0.05);
  [-1, 1].forEach((s) => {
    const eye = new THREE.Mesh(new THREE.SphereGeometry(0.062, 8, 8), new THREE.MeshStandardMaterial({ color: 0xffb62e, emissive: 0xcc7a00, emissiveIntensity: 0.7, roughness: 0.3 }));
    eye.position.set(0.21 * s, 0.1, 0.55); head.add(eye);
    const ear = sph(furD, 0.17); ear.position.set(0.62 * s, 0.08, 0); head.add(ear);
  });
  const tuft = new THREE.Mesh(new THREE.ConeGeometry(0.2, 0.4, 8), fur);
  tuft.position.y = 0.66; tuft.castShadow = true; head.add(tuft);
  ape.position.set(APE_X, yAt(TOP, APE_X), 0.35);
  ape.scale.setScalar(1.12);
  world.add(ape);
  /* barrel stack beside the ape */
  const st = [[0.45, 0.45], [1.3, 0.45], [0.85, 1.2]];
  st.forEach(([dx, yy]) => {
    const b = makeBarrel(); b.rotation.z = 0; b.rotation.y = 0.15;
    b.position.set(APE_X + 2.1 + dx, yAt(TOP, APE_X) + yy, -0.55);
    world.add(b);
  });
  /* a held barrel in front of the ape (shown during the throw wind-up) */
  const held = makeBarrel(); held.visible = false; world.add(held);
  apeParts.held = held;
}
/* ape throw animation state */
const apeAnim = { t: 99, dur: 0.85 };

/* ================= THE CLIMBER ================= */
const hero = new THREE.Group();
const heroParts = {};
function buildHero() {
  const legL = new THREE.Group(), legR = new THREE.Group();
  const armL = new THREE.Group(), armR = new THREE.Group();
  [-1, 1].forEach((s) => {
    const leg = s < 0 ? legL : legR;
    leg.position.set(0.14 * s, 0.52, 0);
    const thigh = box(leg, M.denim, 0, -0.16, 0, 0.17, 0.34, 0.19);
    const shinG = new THREE.Group(); shinG.position.y = -0.32; leg.add(shinG);
    box(shinG, M.denim, 0, -0.13, 0, 0.15, 0.28, 0.17);
    box(shinG, M.shoeRed, 0, -0.3, 0.05, 0.16, 0.1, 0.3);
    leg.userData.shin = shinG; hero.add(leg);
    const arm = s < 0 ? armL : armR;
    arm.position.set(0.3 * s, 0.92, 0);
    box(arm, M.shirt, 0, -0.14, 0, 0.13, 0.3, 0.15);
    const handG = new THREE.Group(); handG.position.y = -0.28; arm.add(handG);
    box(handG, M.skinC, 0, -0.1, 0, 0.11, 0.22, 0.13);
    arm.userData.hand = handG; hero.add(arm);
  });
  heroParts.legL = legL; heroParts.legR = legR; heroParts.armL = armL; heroParts.armR = armR;
  const torso = new THREE.Group(); torso.position.y = 0.52; hero.add(torso); heroParts.torso = torso;
  box(torso, M.denim, 0, 0.24, 0, 0.44, 0.5, 0.26);                    // overalls bib
  box(torso, M.shirt, 0, 0.4, -0.01, 0.46, 0.2, 0.27);                 // shirt shoulders
  box(torso, M.brass, -0.12, 0.36, 0.14, 0.06, 0.06, 0.03);            // buckles
  box(torso, M.brass, 0.12, 0.36, 0.14, 0.06, 0.06, 0.03);
  const pack = box(torso, M.pack, 0, 0.22, -0.24, 0.36, 0.46, 0.18);  // backpack
  box(torso, M.coneOrange, 0, 0.36, -0.34, 0.2, 0.1, 0.02);
  const headG = new THREE.Group(); headG.position.y = 1.06; hero.add(headG); heroParts.head = headG;
  const skull = new THREE.Mesh(new THREE.SphereGeometry(0.21, 16, 12), M.skinC);
  skull.castShadow = true; headG.add(skull);
  box(headG, M.furDark, 0, -0.05, -0.1, 0.3, 0.12, 0.24);              // hair back
  [-1, 1].forEach((s) => {
    const eye = new THREE.Mesh(new THREE.SphereGeometry(0.028, 6, 6), M.furDark);
    eye.position.set(0.08 * s, 0.03, 0.19); headG.add(eye);
  });
  const hat = new THREE.Group(); hat.position.y = 0.13; headG.add(hat);
  const dome = new THREE.Mesh(new THREE.SphereGeometry(0.235, 16, 10, 0, Math.PI * 2, 0, Math.PI / 2), M.hatOrange);
  dome.castShadow = true; hat.add(dome);
  const brim = new THREE.Mesh(new THREE.CylinderGeometry(0.27, 0.27, 0.035, 16), M.hatOrange);
  brim.position.y = -0.01; hat.add(brim);
  const lampBase = box(hat, M.lampMetal, 0, 0.1, 0.2, 0.11, 0.09, 0.06);
  const lamp = new THREE.Mesh(new THREE.SphereGeometry(0.04, 8, 8), M.bulb);
  lamp.position.set(0, 0.1, 0.24); hat.add(lamp);
  const beam = new THREE.PointLight(0xffd9a0, 3.5, 4.5, 2); beam.position.set(0, 0.1, 0.35); hat.add(beam);
  hero.traverse((o) => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = false; } });
  hero.scale.setScalar(HERO_SCALE);   // visual only — jump/gravity/collision stay in world units (hazard + pickup tests retuned to the taller body)
  world.add(hero);
}
const P = {  // player kinematics
  deck: 0, x: -5.4, y: 0, vy: 0, vx: 0, grounded: true, climbing: null,
  face: 1, runPh: 0, dead: false, faceT: 0,
};
function heroPlace() {
  const gy = P.climbing ? P.y : yAt(P.deck, P.x) + P.y;
  hero.position.set(P.x, gy, PLAY_Z);
  hero.rotation.y = P.face > 0 ? 0.35 : Math.PI - 0.35;
}

/* ================= input: floating joystick ================= */
const keys = {};
window.addEventListener('keydown', (e) => {
  keys[e.code] = true;
  if (['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'Space'].includes(e.code)) e.preventDefault();
  if (e.code === 'Space') jumpQueued = true;
});
window.addEventListener('keyup', (e) => { keys[e.code] = false; });
const stickBase = $('stickBase'), stickKnob = $('stickKnob'), stickDock = $('stickDock');
const STICK_R = 46;
const stick = { id: null, kind: null, bx: 0, by: 0, nx: 0, ny: 0 };
let jumpQueued = false;
function stickHome() {
  const r = stickDock.getBoundingClientRect();
  stick.bx = r.left + r.width / 2; stick.by = r.top + r.height / 2;
  stickBase.style.opacity = '.62';
  stickKnob.style.transform = 'translate(-50%,-50%)';
}
function stickShow(x, y) {
  stick.bx = x; stick.by = y; stick.nx = 0; stick.ny = 0;
  stickBase.style.opacity = '1';
  stickDock.style.left = (x - 59) + 'px'; stickDock.style.top = (y - 59) + 'px'; stickDock.style.bottom = 'auto';
  stickKnob.style.transform = 'translate(-50%,-50%)';
}
function stickMove(x, y) {
  let dx = x - stick.bx, dy = y - stick.by;
  const d = Math.hypot(dx, dy);
  if (d > STICK_R) { dx *= STICK_R / d; dy *= STICK_R / d; }
  stick.nx = dx / STICK_R; stick.ny = dy / STICK_R;
  stickKnob.style.transform = `translate(calc(-50% + ${dx}px), calc(-50% + ${dy}px))`;
}
function stickReset() {
  stick.id = null; stick.kind = null; stick.nx = 0; stick.ny = 0;
  stickDock.style.left = '26px'; stickDock.style.top = 'auto';
  stickDock.style.bottom = 'calc(env(safe-area-inset-bottom,0px) + 22px)';
  requestAnimationFrame(stickHome);
}
function stickStart(id, kind, x, y) {
  if (S.mode !== 'run' || stick.id !== null) return false;
  stick.id = id; stick.kind = kind; stickShow(x, y);
  window.__stickPtrAt = performance.now();
  return true;
}
window.addEventListener('pointerdown', (e) => {
  if (e.target !== renderer.domElement) return;
  if (e.clientX < window.innerWidth * 0.66) stickStart(e.pointerId, 'pointer', e.clientX, e.clientY);
});
window.addEventListener('pointermove', (e) => { if (stick.id === e.pointerId) stickMove(e.clientX, e.clientY); });
window.addEventListener('pointerup', (e) => { if (stick.id === e.pointerId) stickReset(); });
window.addEventListener('pointercancel', (e) => { if (stick.id === e.pointerId) stickReset(); });
window.addEventListener('touchstart', (e) => {
  for (const t of e.changedTouches) {
    if (t.target !== renderer.domElement) continue;
    if (t.clientX < window.innerWidth * 0.66) stickStart(t.identifier, 'touch', t.clientX, t.clientY);
  }
}, { passive: true });
window.addEventListener('touchmove', (e) => {
  for (const t of e.changedTouches) if (stick.id === t.identifier) stickMove(t.clientX, t.clientY);
}, { passive: true });
window.addEventListener('touchend', (e) => {
  for (const t of e.changedTouches) if (stick.id === t.identifier) stickReset();
});
window.addEventListener('touchcancel', (e) => {
  for (const t of e.changedTouches) if (stick.id === t.identifier) stickReset();
});
$('btnJump').addEventListener('pointerdown', (e) => { e.preventDefault(); jumpQueued = true; audio(); });
function inputAxes() {
  let ax = stick.nx, ay = stick.ny;
  if (keys.ArrowLeft || keys.KeyA) ax = -1;
  if (keys.ArrowRight || keys.KeyD) ax = 1;
  if (keys.ArrowUp || keys.KeyW) ay = -1;
  if (keys.ArrowDown || keys.KeyS) ay = 1;
  if (jumpQueued) { ay = Math.min(ay, -1); }
  return { ax, ay };
}

/* ================= UI / screens / i18n ================= */
const hud = $('hud'), touchUI = $('touchUI');
let bannerTimer = null;
function showBanner(main, sub = '', ms = 1400) {
  $('bannerMain').textContent = main; $('bannerSub').textContent = sub;
  $('bannerMain').classList.remove('fadeout'); $('bannerSub').classList.remove('fadeout');
  clearTimeout(bannerTimer);
  bannerTimer = setTimeout(() => { $('bannerMain').classList.add('fadeout'); $('bannerSub').classList.add('fadeout'); }, ms);
}
const popupLayer = $('popups');

/* ================= juice: spark bursts + dust puffs =================
   One pooled Points cloud; bursts fire on pickups, barrel clears, landings,
   deaths and level clears — the feedback layer premium arcade games live on. */
const FX_N = 260;
const fxPos = new Float32Array(FX_N * 3);
const fxCol = new Float32Array(FX_N * 3);
const fxVel = new Float32Array(FX_N * 3);
const fxLife = new Float32Array(FX_N);
const fxGeo = new THREE.BufferGeometry();
fxGeo.setAttribute('position', new THREE.BufferAttribute(fxPos, 3));
fxGeo.setAttribute('color', new THREE.BufferAttribute(fxCol, 3));
const fxPts = new THREE.Points(fxGeo, new THREE.PointsMaterial({
  size: 0.14, vertexColors: true, transparent: true, opacity: 0.95, depthWrite: false,
}));
fxPts.frustumCulled = false;
scene.add(fxPts);
let fxHead = 0;
const _fc = new THREE.Color();
function burst(x, y, z, hex, n, spd, up) {
  _fc.set(hex);
  for (let i = 0; i < n; i++) {
    const j = fxHead; fxHead = (fxHead + 1) % FX_N;
    fxPos[j * 3] = x; fxPos[j * 3 + 1] = y; fxPos[j * 3 + 2] = z;
    const a = Math.random() * Math.PI * 2, r = (0.25 + Math.random() * 0.75) * spd;
    fxVel[j * 3] = Math.cos(a) * r;
    fxVel[j * 3 + 1] = up * (0.4 + Math.random() * 0.9);
    fxVel[j * 3 + 2] = Math.sin(a) * r * 0.4;
    const v = 0.75 + Math.random() * 0.45;
    fxCol[j * 3] = _fc.r * v; fxCol[j * 3 + 1] = _fc.g * v; fxCol[j * 3 + 2] = _fc.b * v;
    fxLife[j] = 0.55 + Math.random() * 0.5;
  }
}
function updateFx(dt) {
  let any = false;
  for (let j = 0; j < FX_N; j++) {
    if (fxLife[j] <= 0) continue;
    any = true;
    fxLife[j] -= dt;
    fxVel[j * 3 + 1] -= 3.4 * dt;
    fxPos[j * 3] += fxVel[j * 3] * dt;
    fxPos[j * 3 + 1] += fxVel[j * 3 + 1] * dt;
    fxPos[j * 3 + 2] += fxVel[j * 3 + 2] * dt;
    if (fxLife[j] <= 0) fxPos[j * 3 + 1] = -50;
  }
  if (any) { fxGeo.attributes.position.needsUpdate = true; fxGeo.attributes.color.needsUpdate = true; }
}

function popup(worldPos, text, color = '#ffe9a8') {
  const v = worldPos.clone().project(camera);
  const el = document.createElement('div');
  el.className = 'pop'; el.textContent = text; el.style.color = color;
  el.style.left = ((v.x * 0.5 + 0.5) * 100) + '%';
  el.style.top = ((-v.y * 0.5 + 0.5) * 100) + '%';
  popupLayer.appendChild(el);
  setTimeout(() => el.remove(), 1000);
}
function updateHUD() {
  $('hudScore').textContent = S.score;
  $('hudCres').textContent = S.cres;
  $('hudLvl').textContent = T('level') + ' ' + S.level;
  $('hearts').textContent = '♥'.repeat(Math.max(0, S.lives)) + '♡'.repeat(Math.max(0, 3 - S.lives));
}
function applyLang() {
  document.documentElement.lang = LANG_CUR;
  document.documentElement.dir = LANG_CUR === 'ar' ? 'rtl' : 'ltr';
  $('menuTag').textContent = T('tag');
  $('playBtn').textContent = T('play');
  $('howBtn').textContent = T('how');
  $('boardBtn').textContent = T('board');
  $('howTitle').textContent = T('howTitle');
  $('howBody').innerHTML = T('howBody');
  $('howClose').textContent = T('close');
  $('boardTitle').textContent = T('board');
  $('tabAll').textContent = T('allTime');
  $('tabWeek').textContent = T('week');
  $('boardClose').textContent = T('close');
  $('pauseTitle').textContent = T('paused');
  $('resumeBtn').textContent = T('resume');
  $('quitBtn').textContent = T('quit');
  $('overTitle').textContent = T('overTitle');
  $('submitBtn').textContent = T('submit');
  $('againBtn').textContent = T('again');
  $('menuBtn').textContent = T('menu');
  $('nameInput').placeholder = T('namePh');
  $('hudScoreLbl').textContent = T('score');
  $('hudLivesLbl').textContent = T('lives');
  $('jumpLbl').textContent = T('jump');
  $('secStrip').textContent = T('sec');
  $('muteBtn').textContent = S.muted ? '🔇' : '🔊';
  updateHUD();
}
const langSel = $('langSel');
LANGS.forEach(([code, label]) => { const o = document.createElement('option'); o.value = code; o.textContent = label; langSel.appendChild(o); });
langSel.value = LANG_CUR;
langSel.addEventListener('change', () => {
  if (I18N[langSel.value]) { LANG_CUR = langSel.value; try { localStorage.setItem('barrelTowerLang', LANG_CUR); } catch (e) {} applyLang(); }
});
function showScreen(id) {
  ['menu', 'howPanel', 'boardPanel', 'pausePanel', 'overPanel'].forEach((s) => $(s).classList.toggle('hidden', s !== id));
  if (!id) ['menu', 'howPanel', 'boardPanel', 'pausePanel', 'overPanel'].forEach((s) => $(s).classList.add('hidden'));
}
$('playBtn').addEventListener('click', () => { audio(); startGame(); });
$('againBtn').addEventListener('click', () => { audio(); startGame(); });
$('howBtn').addEventListener('click', () => showScreen('howPanel'));
$('howClose').addEventListener('click', () => showScreen(S.mode === 'run' || S.mode === 'pause' ? null : 'menu'));
$('boardBtn').addEventListener('click', () => { showScreen('boardPanel'); loadBoard(); });
$('boardClose').addEventListener('click', () => showScreen('menu'));
$('tabAll').addEventListener('click', () => { boardTab = 'all'; $('tabAll').classList.add('on'); $('tabWeek').classList.remove('on'); renderBoard(); });
$('tabWeek').addEventListener('click', () => { boardTab = 'week'; $('tabWeek').classList.add('on'); $('tabAll').classList.remove('on'); renderBoard(); });
$('pauseBtn').addEventListener('click', () => { if (S.mode === 'run') { S.mode = 'pause'; showScreen('pausePanel'); } });
$('resumeBtn').addEventListener('click', () => { if (S.mode === 'pause') { S.mode = 'run'; showScreen(null); } });
$('quitBtn').addEventListener('click', () => toMenu());
$('menuBtn').addEventListener('click', () => toMenu());
$('muteBtn').addEventListener('click', () => {
  S.muted = !S.muted;
  try { localStorage.setItem('barrelTowerMuted', S.muted ? '1' : '0'); } catch (e) {}
  $('muteBtn').textContent = S.muted ? '🔇' : '🔊';
});
$('submitBtn').addEventListener('click', submitScore);
function toMenu() {
  S.mode = 'menu';
  hud.classList.add('hidden'); touchUI.classList.add('hidden'); stickDock.classList.add('hidden');
  stickReset(); showScreen('menu');
}

/* ================= leaderboard ================= */
let boardData = null, boardTab = 'all';
async function loadBoard() {
  try { const r = await fetch('/api/luna-games?game=barrel-tower'); boardData = await r.json(); } catch (e) { boardData = null; }
  renderBoard();
}
function renderBoard() {
  const el = $('boardBody');
  if (!boardData) { el.innerHTML = '<div style="text-align:center;padding:10px">' + T('loading') + '</div>'; return; }
  const list = (boardTab === 'week' ? boardData.week : boardData.all) || [];
  if (!list.length) { el.innerHTML = '<div style="text-align:center;padding:10px">' + T('noScores') + '</div>'; return; }
  el.innerHTML = '<table class="board">' + list.map((r, i) =>
    `<tr><td>${i + 1}.</td><td class="nm">${String(r.name || '').replace(/</g, '&lt;')}</td><td class="sc">${r.score}</td></tr>`).join('') + '</table>';
}
async function submitScore() {
  const name = ($('nameInput').value || '').trim() || 'CLIMBER';
  try { localStorage.setItem('barrelTowerName', name); } catch (e) {}
  $('submitBtn').disabled = true;
  try {
    const r = await fetch('/api/luna-games?game=barrel-tower', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ initData: '', name, score: Math.floor(S.score), seconds: Math.max(10, Math.round(S.runTime)), level: S.level }),
    });
    const j = await r.json();
    $('savedLine').textContent = j && j.rank ? T('rank').replace('{n}', j.rank) : T('saved');
  } catch (e) { $('savedLine').textContent = T('saved'); }
}

/* ================= game flow ================= */
function resetPlayer() {
  P.deck = 0; P.x = -5.4; P.y = 0; P.vy = 0; P.vx = 0;
  P.grounded = true; P.climbing = null; P.dead = false; P.face = 1;
  hero.visible = true; hero.rotation.z = 0;
  heroPlace();
}
function clearHazards() { hazards.forEach((h) => { h.active = false; h.grp.visible = false; }); }
function startGame() {
  S.score = 0; S.cres = 0; S.stars = 0; S.lives = 3; S.level = 1; S.runTime = 0;
  S.invulnT = 0; S.deathT = 0; S.clearT = 0;
  clearHazards(); layoutPickups();
  buildLadders(levelCfg(1).decoys);
  spawnT = 1.2;
  resetPlayer();
  S.mode = 'run';
  showScreen(null);
  hud.classList.remove('hidden'); touchUI.classList.remove('hidden'); stickDock.classList.remove('hidden');
  requestAnimationFrame(stickHome);
  updateHUD();
  showBanner(T('level') + ' 1', T('hint'), 1300);
}
function startLevel(L) {
  S.level = L;
  clearHazards(); layoutPickups();
  buildLadders(levelCfg(L).decoys);
  spawnT = 1.4;
  resetPlayer();
  S.mode = 'run'; S.clearT = 0;
  updateHUD();
  showBanner(T('level') + ' ' + L, T('hint'), 1300);
}
function levelClear() {
  const bonusPts = 500 + 100 * S.level;
  S.score += bonusPts;
  sfx.clear();
  showBanner(T('levelClear'), T('bonus') + ' +' + bonusPts, 1700);
  burst(P.x, yAt(P.deck, P.x) + 1.2, PLAY_Z, 0xffc93d, 26, 2.6, 2.6);
  burst(P.x, yAt(P.deck, P.x) + 1.2, PLAY_Z, 0x63e6d8, 14, 2.2, 2.2);
  popup(new THREE.Vector3(P.x, yAt(P.deck, P.x) + 1.6, PLAY_Z), '+' + bonusPts);
  S.mode = 'clear'; S.clearT = 1.9;
  updateHUD();
}
function loseLife() {
  if (P.dead) return;
  burst(P.x, yAt(P.deck, P.x) + 0.8, PLAY_Z, 0xff7a4d, 18, 2.0, 2.0);
  P.dead = true; S.deathT = 0.85; S.camShake = 0.5; S.flashT = 0.35;
  sfx.hurt(); sfx.thud();
  hero.rotation.z = 1.35;
}
function afterDeath() {
  S.lives--;
  updateHUD();
  if (S.lives <= 0) {
    S.mode = 'over'; sfx.over();
    $('finalScoreLine').textContent = T('finalScore') + ': ' + S.score;
    $('finalDetail').textContent = S.cres + ' ☾ · ' + S.stars + ' ★ · ' + T('level') + ' ' + S.level;
    $('submitBtn').disabled = false; $('savedLine').textContent = '';
    try { $('nameInput').value = localStorage.getItem('barrelTowerName') || ''; } catch (e) {}
    hud.classList.add('hidden'); touchUI.classList.add('hidden'); stickDock.classList.add('hidden');
    showScreen('overPanel');
  } else {
    resetPlayer(); S.invulnT = 1.6;
  }
}
let spawnT = 1.2;
function trySpawn(cfg) {
  const alive = hazards.filter((h) => h.active).length;
  if (alive >= cfg.maxH) return;
  let kind = 'barrel';
  const roll = Math.random();
  if (cfg.fire && roll < 0.18) kind = 'fire';
  else if (cfg.crates && roll < 0.42) kind = 'crate';
  const h = freeHazard(kind) || freeHazard('barrel');
  if (!h) return;
  h.active = true; h.deck = TOP; h.dir = -deckDir(TOP - 1) || 1;
  h.dir = 1;  // top deck is flat: the ape rolls barrels toward +x, they drop at the right edge onto deck 3's high end
  h.x = APE_X + 1.6; h.yOff = 0; h.falling = 0; h.passedBy = false;
  h.grp.visible = true;
  apeAnim.t = 0;
  sfx.roar();
}

/* ================= per-frame updates ================= */
function updatePlayer(dt) {
  if (P.dead) return;
  const { ax, ay } = inputAxes();
  const SPEED = 4.6, GRAV = 22, JUMP_V = 8.6;
  if (P.climbing) {
    const lad = P.climbing;
    const target = lad.from + 1;
    if (ay < -0.35) P.y += 2.6 * dt;
    else if (ay > 0.35) P.y -= 2.6 * dt;
    P.x += clamp(ax, -1, 1) * 1.1 * dt;
    P.x = clamp(P.x, lad.x - 0.55, lad.x + 0.55);
    const yTopDeck = yAt(target, P.x), yBotDeck = yAt(lad.from, P.x);
    if (P.y >= yTopDeck - 0.02 && ay < -0.3) {
      P.deck = target; P.y = 0; P.climbing = null; P.grounded = true;
    } else if (P.y <= yBotDeck + 0.02) {
      P.deck = lad.from; P.y = 0; P.climbing = null; P.grounded = true;
    }
    P.runPh += dt * 7;
    return;
  }
  /* horizontal run */
  const targetVx = clamp(ax, -1, 1) * SPEED;
  P.vx = lerp(P.vx, targetVx, 1 - Math.pow(0.0001, dt));
  if (Math.abs(ax) > 0.12) P.face = ax > 0 ? 1 : -1;
  P.x += P.vx * dt;
  P.runPh += Math.abs(P.vx) * dt * 1.9;
  /* ladder entry */
  if (P.grounded && Math.abs(P.vx) < 2.2) {
    if (ay < -0.45) {
      const lad = ladderAt(P.deck, P.x);
      if (lad && lad.from === P.deck && P.deck < TOP) {
        P.climbing = lad; P.y = yAt(P.deck, P.x); P.x = lad.x; return;
      }
    } else if (ay > 0.45 && P.deck > 0) {
      const lad = ladderAt(P.deck - 1, P.x);
      if (lad && lad.from === P.deck - 1) {
        P.climbing = lad; P.y = yAt(P.deck, P.x); P.x = lad.x; return;
      }
    }
  }
  /* jump */
  if (P.grounded && (keys.Space || jumpQueued || (stick.ny < -0.62 && Math.abs(stick.nx) < 0.75))) {
    P.vy = JUMP_V; P.grounded = false; sfx.jump();
  }
  jumpQueued = false;
  /* vertical */
  if (!P.grounded) {
    P.vy -= GRAV * dt;
    P.y += P.vy * dt;
    if (P.y <= 0) {
      P.y = 0; P.vy = 0;
      if (!P.grounded) sfx.hop();
      P.grounded = true;
    }
  }
  /* deck edge: fall to the deck below */
  if (P.x < PLAY_MIN || P.x > PLAY_MAX) {
    if (P.deck === 0) { P.x = clamp(P.x, PLAY_MIN, PLAY_MAX); }
    else {
      P.deck--; P.x = clamp(P.x, PLAY_MIN + 0.05, PLAY_MAX - 0.05);
      P.y = LV_H + SLOPE_DY; /* start above the lower deck, gravity lands him */
      P.grounded = false; P.vy = 0;
    }
  }
  /* goal */
  if (P.deck === TOP && P.x >= GOAL_X && S.mode === 'run') levelClear();
}
function poseHero(dt, t) {
  const run = P.grounded && Math.abs(P.vx) > 0.4 && !P.climbing;
  const ph = P.runPh * 2.4;
  const sw = run ? Math.sin(ph) * 0.62 : 0;
  heroParts.legL.rotation.x = P.climbing ? Math.sin(P.runPh * 2) * 0.5 : (P.grounded ? sw : 0.55);
  heroParts.legR.rotation.x = P.climbing ? -Math.sin(P.runPh * 2) * 0.5 : (P.grounded ? -sw : -0.3);
  heroParts.legL.userData.shin.rotation.x = P.grounded ? Math.max(0, -sw) * 0.7 : 0.5;
  heroParts.legR.userData.shin.rotation.x = P.grounded ? Math.max(0, sw) * 0.7 : 0.9;
  if (P.climbing) {
    heroParts.armL.rotation.x = -2.6 + Math.sin(P.runPh * 2) * 0.4;
    heroParts.armR.rotation.x = -2.6 - Math.sin(P.runPh * 2) * 0.4;
    heroParts.torso.rotation.x = 0.08;
  } else if (!P.grounded) {
    heroParts.armL.rotation.x = -2.9; heroParts.armR.rotation.x = -2.9;
    heroParts.torso.rotation.x = -0.06;
  } else {
    heroParts.armL.rotation.x = -sw * 0.8; heroParts.armR.rotation.x = sw * 0.8;
    heroParts.torso.rotation.x = run ? 0.1 : Math.sin(t * 2) * 0.02;
  }
  heroParts.head.rotation.y = P.climbing ? 0 : Math.sin(t * 0.7) * 0.08;
}
function updateHazards(dt, cfg) {
  const R = 0.44;
  for (const h of hazards) {
    if (!h.active) continue;
    const dirSlope = deckDir(h.deck);
    const downhill = h.deck === TOP ? 1 : -dirSlope;
    const spd = cfg.speed * (h.kind === 'crate' ? 0.85 : 1);
    if (h.falling > 0) {
      h.falling -= dt * 3.2;
      h.yOff = -Math.sin(Math.min(1, 1 - h.falling) * Math.PI * 0.5) * (LV_H * 0) - (1 - Math.max(0, h.falling)) * 0;
      /* simple: interpolate y between decks */
      const yFrom = yAt(h.deck + 1, h.x), yTo = yAt(h.deck, h.x);
      const k = clamp(1 - h.falling, 0, 1);
      h.grp.position.set(h.x, lerp(yFrom, yTo, k) + R - 0.03, PLAY_Z);
      h.grp.rotation.z -= downhill * dt * 4;
      if (h.falling <= 0) { h.yOff = 0; }
      continue;
    }
    h.x += downhill * spd * dt;
    const gy = yAt(h.deck, h.x);
    h.grp.position.set(h.x, gy + R - 0.03 + (h.yOff || 0), PLAY_Z);
    if (h.kind === 'crate') {
      h.grp.rotation.z -= downhill * spd * dt / 0.42 * 0.7;
      h.grp.position.y = gy + 0.42;
    } else {
      h.grp.rotation.y -= downhill * spd * dt / R;
      if (h.kind === 'fire' && h.grp.userData.flame) {
        const f = h.grp.userData.flame;
        f.scale.setScalar(1 + Math.sin(performance.now() * 0.03 + h.x) * 0.18);
      }
    }
    /* drop at the downhill edge */
    const edgeX = downhill > 0 ? HALF - 0.2 : -HALF + 0.2;
    if ((downhill > 0 && h.x >= edgeX) || (downhill < 0 && h.x <= edgeX)) {
      if (h.deck === 0) { h.active = false; h.grp.visible = false; continue; }
      h.deck--; h.falling = 1;
    }
    /* collision with the player */
    if (!P.dead && S.invulnT <= 0 && S.mode === 'run' && !P.climbing) {
      const py = yAt(P.deck, P.x) + P.y;
      if (h.deck === P.deck && Math.abs(h.x - P.x) < 0.52 && Math.abs((gy + 0.3) - (py + 0.61)) < 0.97) {
        if (P.y > 0.42 && !P.grounded) {
          /* cleared it — award once per pass */
          if (!h.passedBy) { h.passedBy = true; S.score += 100; burst(P.x, py + 0.25, PLAY_Z, 0xd9c9a8, 10, 1.3, 1.1); popup(new THREE.Vector3(P.x, py + 1.5, PLAY_Z), '+100'); sfx.hop(); updateHUD(); }
        } else {
          loseLife();
        }
      } else if (h.passedBy && Math.abs(h.x - P.x) > 1.4) {
        h.passedBy = false;
      }
    }
  }
}
function updatePickups(dt, t) {
  for (const p of pickups) {
    if (p.taken) continue;
    p.grp.rotation.y += dt * 2.4;
    p.grp.position.y = yAt(p.deck, p.x) + 0.62 + Math.sin(t * 2.4 + p.ph) * 0.09;
    if (S.mode === 'run' && !P.dead && !P.climbing && p.deck === P.deck) {
      const py = yAt(P.deck, P.x) + P.y + 0.74;
      if (Math.abs(p.x - P.x) < 0.62 && Math.abs(p.grp.position.y - py) < 1.0) {
        p.taken = true; p.grp.visible = false;
        if (p.kind === 'cres') { S.cres++; S.score += 50; sfx.coin(); burst(p.x, py + 0.7, PLAY_Z, 0xffc93d, 12, 1.6, 1.6); popup(new THREE.Vector3(p.x, py + 0.7, PLAY_Z), '+50'); }
        else { S.stars++; S.score += 250; sfx.star(); burst(p.x, py + 0.7, PLAY_Z, 0x63e6d8, 16, 1.9, 1.9); popup(new THREE.Vector3(p.x, py + 0.7, PLAY_Z), '+250', '#8ff5e8'); }
        updateHUD();
      }
    }
  }
}
function updateApe(dt, t) {
  /* idle life: breathing, head sway, medallion glint */
  apeParts.torso.position.y = 1.95 + Math.sin(t * 1.4) * 0.045;
  apeParts.head.rotation.y = Math.sin(t * 0.45) * 0.22;
  apeParts.head.rotation.x = Math.sin(t * 0.8) * 0.05;
  apeParts.medallion.rotation.z = Math.sin(t * 1.1) * 0.06;
  apeParts.armL.sh.rotation.x = Math.sin(t * 1.4) * 0.06;
  if (apeAnim.t < apeAnim.dur) {
    apeAnim.t += dt;
    const k = clamp(apeAnim.t / apeAnim.dur, 0, 1);
    const wind = Math.sin(k * Math.PI);            // raise then slam
    apeParts.armR.sh.rotation.x = -2.2 * wind;
    apeParts.armR.sh.rotation.z = 0.35 - 0.5 * wind;
    apeParts.armR.foreG.rotation.x = -0.7 * wind;
    apeParts.torso.rotation.x = 0.16 * wind;
    const held = apeParts.held;
    held.visible = k < 0.55;
    if (held.visible) {
      held.position.set(APE_X + 1.15, yAt(TOP, APE_X) + 1.6 + 0.5 * wind, PLAY_Z);
      held.rotation.y += dt * 3;
    }
    if (k >= 1) {
      apeParts.armR.sh.rotation.x = 0; apeParts.armR.sh.rotation.z = 0.35;
      apeParts.armR.foreG.rotation.x = 0; apeParts.torso.rotation.x = 0;
      held.visible = false;
    }
  } else {
    apeParts.armR.sh.rotation.x = Math.sin(t * 1.4 + 1) * 0.06;
  }
}

/* ================= camera ================= */
const camTarget = new THREE.Vector3();
function updateCamera(dt, t) {
  let focusY, dist, fovK = 1;
  if (S.mode === 'menu') {
    focusY = 8.2; dist = 24;
    camTarget.set(Math.sin(t * 0.11) * 1.4, focusY, 0);
    camera.position.lerp(new THREE.Vector3(Math.sin(t * 0.11) * 3.4, 7.8, dist), 1 - Math.pow(0.01, dt));
  } else {
    const py = P.climbing ? P.y : yAt(P.deck, P.x) + P.y;
    focusY = clamp(py * 0.8 + 1.7, 4.6, 13.6);
    dist = 21.5;
    camTarget.set(P.x * 0.16, focusY, 0);
    camera.position.lerp(new THREE.Vector3(P.x * 0.16, focusY + 0.3, dist), 1 - Math.pow(0.001, dt));
  }
  if (S.camShake > 0) {
    S.camShake -= dt;
    camera.position.x += (Math.random() - 0.5) * S.camShake * 0.5;
    camera.position.y += (Math.random() - 0.5) * S.camShake * 0.5;
  }
  camera.lookAt(camTarget.x, camTarget.y - 0.4, 0);
  moonGroup.position.x = camera.position.x * 0.4 + 12;
}

/* ================= build & boot ================= */
buildTower();
buildApe();
buildHero();
spawnHazardPool();
layoutPickups();
resetPlayer();
hero.position.set(-5.4, yAt(3, -5.4), PLAY_Z);
try { const nm = localStorage.getItem('barrelTowerName'); if (nm) $('nameInput').value = nm; } catch (e) {}
applyLang();
S.mode = 'menu';
showScreen('menu');
$('loader').style.display = 'none';

/* ================= main loop ================= */
const clock = new THREE.Clock();
let elapsed = 0;
function frame() {
  requestAnimationFrame(frame);
  const dt = Math.min(clock.getDelta(), 0.05);
  elapsed += dt;
  const t = elapsed;
  /* light life */
  for (const w of workLights) w.light.intensity = w.base * (0.9 + 0.1 * Math.sin(t * 13 + w.phase) * Math.sin(t * 7.3 + w.phase * 2));
  motes.rotation.y = Math.sin(t * 0.008) * 0.05;
  updateFx(dt);
  moteGeo.attributes.position.array.forEach((v, i) => { if (i % 3 === 1) moteGeo.attributes.position.array[i] = v + Math.sin(t * 0.5 + i) * 0.0006; });
  if (S.mode === 'run') {
    S.runTime += dt;
    if (S.invulnT > 0) { S.invulnT -= dt; hero.visible = Math.floor(t * 12) % 2 === 0 || S.invulnT <= 0; }
    const cfg = levelCfg(S.level);
    spawnT -= dt;
    if (spawnT <= 0) { trySpawn(cfg); spawnT = cfg.interval * (0.85 + Math.random() * 0.3); }
    updatePlayer(dt);
    updateHazards(dt, cfg);
    heroPlace(); poseHero(dt, t);
  } else if (S.mode === 'clear') {
    S.clearT -= dt;
    heroPlace(); poseHero(dt, t);
    if (S.clearT <= 0) startLevel(S.level + 1);
  } else if (S.mode === 'menu' || S.mode === 'over') {
    heroPlace();
    ape.rotation.y = Math.sin(t * 0.11) * 0.12;
  }
  if (P.dead) {
    S.deathT -= dt;
    hero.rotation.z = 1.35 * Math.min(1, (0.85 - S.deathT) * 3 + 0.4);
    if (S.deathT <= 0) { P.dead = false; hero.rotation.z = 0; afterDeath(); }
  }
  updatePickups(dt, t);
  updateApe(dt, t);
  updateCamera(dt, t);
  renderer.render(scene, camera);
}
frame();
/* QA hooks (used by the automated touch QA; harmless in production) */
window.__bt = {
  S, P, hazards, pickups,
  start: startGame,
  stickState: () => ({ id: stick.id, nx: stick.nx, ny: stick.ny }),
  setMode: (m) => { S.mode = m; },
};
