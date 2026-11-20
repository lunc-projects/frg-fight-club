import * as THREE from 'three';

/* ============================================================
   FROG ARENA 2 — Sunlit Colosseum (design test)
   Fighters: articulated 3D colorful frog champions — the game's 10
   original warriors — driven by the Arena Clash 3D engine (three.js
   r160, MIT). All game code/art direction original.
   ============================================================ */

const QA = new URLSearchParams(location.search);
const QA_MODE = QA.get('qa');
window.__errs = [];
window.addEventListener('error', e => { window.__errs.push(String(e.message || e.error)); });

const loadFill = document.getElementById('loadFill');
const loadPct = document.getElementById('loadPct');
function setLoad(p, label) {
  loadFill.style.width = Math.round(p * 100) + '%';
  loadPct.textContent = Math.round(p * 100) + '%' + (label ? ' · ' + label : '');
}

/* ---------------- renderer / scene / camera ---------------- */
const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
renderer.setSize(innerWidth, innerHeight);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.16;
document.getElementById('game').appendChild(renderer.domElement);

const scene = new THREE.Scene();
scene.fog = new THREE.FogExp2(0xa8dcf7, 0.010);

let isPortrait = innerWidth < innerHeight;
const camera = new THREE.PerspectiveCamera(isPortrait ? 52 : 41, innerWidth / innerHeight, 0.1, 200);
camera.position.set(0, 1.5, 7.2);

addEventListener('resize', () => {
  isPortrait = innerWidth < innerHeight;
  camera.aspect = innerWidth / innerHeight;
  camera.fov = isPortrait ? 52 : 41;
  camera.updateProjectionMatrix();
  renderer.setSize(innerWidth, innerHeight);
  layoutArena();
});

/* ---------------- lights ---------------- */
scene.add(new THREE.HemisphereLight(0xcfeaff, 0x8a7a4a, 0.95));
const keyLight = new THREE.DirectionalLight(0xfff1c4, 2.9);
keyLight.position.set(4.5, 8, 5);
keyLight.castShadow = true;
keyLight.shadow.mapSize.set(2048, 2048);
keyLight.shadow.camera.left = -6; keyLight.shadow.camera.right = 6;
keyLight.shadow.camera.top = 7; keyLight.shadow.camera.bottom = -3;
keyLight.shadow.camera.far = 30; keyLight.shadow.bias = -0.0004;
scene.add(keyLight);
const rimLight = new THREE.DirectionalLight(0x7ec8f2, 1.1);
rimLight.position.set(-5, 4.5, -6);
scene.add(rimLight);
// soft frontal fill (visual pass, Nov 6): lifts faces/chests toward the
// closer camera so the fighters read with more presence
const fillLight = new THREE.DirectionalLight(0xffffff, 0.5);
fillLight.position.set(-3.5, 2.2, 6.5);
scene.add(fillLight);
const underGlow = new THREE.PointLight(0xffc46b, 12, 12, 1.8);
underGlow.position.set(0, 0.7, -2.5);
scene.add(underGlow);

/* ---------------- procedural textures ---------------- */
function canvasTex(w, h, draw, opts = {}) {
  const c = document.createElement('canvas'); c.width = w; c.height = h;
  draw(c.getContext('2d'), w, h);
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.colorSpace = THREE.SRGBColorSpace;
  if (opts.nearest) { t.wrapS = t.wrapT = THREE.ClampToEdgeWrapping; }
  return t;
}
const floorTex = (() => {
  const c = document.createElement('canvas'); c.width = c.height = 1024;
  const x = c.getContext('2d');
  const cx = 512, cy = 512;
  x.fillStyle = '#9a825e'; x.fillRect(0, 0, 1024, 1024);
  // dark stone slabs
  for (let i = 0; i < 2600; i++) {
    x.fillStyle = `rgba(${140 + Math.random() * 60},${115 + Math.random() * 45},${70 + Math.random() * 35},0.28)`;
    x.fillRect(Math.random() * 1024, Math.random() * 1024, 3 + Math.random() * 22, 2 + Math.random() * 12);
  }
  x.strokeStyle = 'rgba(70,52,26,0.45)'; x.lineWidth = 3;
  for (let i = 0; i <= 8; i++) {
    x.beginPath(); x.moveTo(i * 128, 0); x.lineTo(i * 128, 1024); x.stroke();
    x.beginPath(); x.moveTo(0, i * 128); x.lineTo(1024, i * 128); x.stroke();
  }
  // cracks
  x.strokeStyle = 'rgba(80,60,30,0.4)'; x.lineWidth = 1.6;
  for (let i = 0; i < 26; i++) {
    let px = Math.random() * 1024, py = Math.random() * 1024;
    x.beginPath(); x.moveTo(px, py);
    for (let j = 0; j < 5; j++) { px += (Math.random() - 0.5) * 90; py += (Math.random() - 0.5) * 90; x.lineTo(px, py); }
    x.stroke();
  }
  const ring = (r, col, w) => { x.beginPath(); x.arc(cx, cy, r, 0, Math.PI * 2); x.strokeStyle = col; x.lineWidth = w; x.stroke(); };
  ring(492, '#6b5636', 26);
  ring(478, '#f2b13c', 5);
  ring(300, 'rgba(242,177,60,0.95)', 7);
  ring(268, 'rgba(18,165,184,0.9)', 4);
  ring(150, 'rgba(242,177,60,0.6)', 3);
  const crescent = (px, py, r, col) => {
    x.fillStyle = col;
    x.beginPath(); x.arc(px, py, r, 0, Math.PI * 2); x.fill();
    x.fillStyle = '#9a825e';
    x.beginPath(); x.arc(px + r * 0.38, py - r * 0.16, r * 0.82, 0, Math.PI * 2); x.fill();
  };
  const skull = (px, py, s, col) => {
    x.fillStyle = col;
    x.beginPath(); x.ellipse(px, py - s * 0.12, s * 0.62, s * 0.55, 0, 0, Math.PI * 2); x.fill();
    x.fillRect(px - s * 0.34, py + s * 0.22, s * 0.68, s * 0.42);
    x.fillStyle = '#9a825e';
    x.beginPath(); x.arc(px - s * 0.26, py - s * 0.08, s * 0.15, 0, Math.PI * 2); x.fill();
    x.beginPath(); x.arc(px + s * 0.26, py - s * 0.08, s * 0.15, 0, Math.PI * 2); x.fill();
    x.beginPath(); x.moveTo(px, py + s * 0.10); x.lineTo(px - s * 0.09, py + s * 0.30); x.lineTo(px + s * 0.09, py + s * 0.30); x.closePath(); x.fill();
    x.fillRect(px - s * 0.20, py + s * 0.40, s * 0.05, s * 0.20);
    x.fillRect(px + s * 0.02, py + s * 0.40, s * 0.05, s * 0.20);
    x.fillRect(px + s * 0.22, py + s * 0.40, s * 0.05, s * 0.20);
  };
  // center emblem: skull over crescent (the spec image's mat)
  skull(cx, cy - 6, 92, '#f7f1de');
  crescent(cx - 118, cy + 84, 30, '#ffd23c');
  crescent(cx + 118, cy + 84, 30, '#ffd23c');
  x.fillStyle = '#8a5a14';
  x.font = '900 64px "Arial Black", Arial, sans-serif';
  x.textAlign = 'center'; x.textBaseline = 'middle';
  const arcText = (txt, r, a0, a1, flip) => {
    const n = txt.length;
    for (let i = 0; i < n; i++) {
      const a = a0 + (a1 - a0) * (n === 1 ? 0.5 : i / (n - 1));
      x.save();
      x.translate(cx + Math.cos(a) * r, cy + Math.sin(a) * r);
      x.rotate(a + (flip ? -Math.PI / 2 : Math.PI / 2));
      x.fillText(txt[i], 0, 0);
      x.restore();
    }
  };
  arcText('FROG CLASSIC', 382, -Math.PI * 0.86, -Math.PI * 0.14, false);
  x.font = '900 40px "Arial Black", Arial, sans-serif';
  x.fillStyle = 'rgba(10,110,124,0.95)';
  arcText('SUNLIT COLOSSEUM', 388, Math.PI * 0.80, Math.PI * 0.20, true);
  x.font = '900 34px "Arial Black", Arial, sans-serif';
  x.fillStyle = 'rgba(138,90,20,0.95)';
  for (const sx of [-1, 1]) {
    x.save(); x.translate(cx + sx * 452, cy); x.rotate(sx * Math.PI / 2); x.fillText('LUNC', 0, 0); x.restore();
  }
  const t = new THREE.CanvasTexture(c);
  t.anisotropy = 8; t.colorSpace = THREE.SRGBColorSpace;
  return t;
})();
floorTex.wrapS = floorTex.wrapT = THREE.ClampToEdgeWrapping;
const skyTex = (() => {
  const c = document.createElement('canvas'); c.width = 1024; c.height = 512;
  const x = c.getContext('2d');
  const g = x.createLinearGradient(0, 0, 0, 512);
  g.addColorStop(0, '#2f9be8');
  g.addColorStop(0.45, '#6fc4f2');
  g.addColorStop(0.75, '#a8dcf7');
  g.addColorStop(1, '#dff4fd');
  x.fillStyle = g; x.fillRect(0, 0, 1024, 512);
  // soft white clouds
  for (let i = 0; i < 42; i++) {
    const cy2 = Math.random() * 320, w = 120 + Math.random() * 300;
    const cg = x.createRadialGradient(Math.random() * 1024, cy2, 4, Math.random() * 1024, cy2, w * 0.4);
    cg.addColorStop(0, 'rgba(255,255,255,0.55)'); cg.addColorStop(1, 'rgba(255,255,255,0)');
    x.fillStyle = cg;
    x.fillRect(0, cy2 - 60, 1024, 120);
  }
  // bright sun with warm halo, upper left
  const mx = 205, my = 105;
  const mg = x.createRadialGradient(mx, my, 10, mx, my, 150);
  mg.addColorStop(0, 'rgba(255,236,160,0.85)'); mg.addColorStop(1, 'rgba(255,236,160,0)');
  x.fillStyle = mg; x.fillRect(mx - 160, my - 160, 320, 320);
  x.fillStyle = '#fff6c8';
  x.beginPath(); x.arc(mx, my, 40, 0, Math.PI * 2); x.fill();
  x.fillStyle = '#ffffff';
  x.beginPath(); x.arc(mx, my, 30, 0, Math.PI * 2); x.fill();
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
})();
const glowTex = canvasTex(128, 128, (x, w, h) => {
  const g = x.createRadialGradient(64, 64, 2, 64, 64, 62);
  g.addColorStop(0, 'rgba(255,255,255,1)'); g.addColorStop(0.35, 'rgba(255,255,255,.5)');
  g.addColorStop(1, 'rgba(255,255,255,0)');
  x.fillStyle = g; x.fillRect(0, 0, w, h);
}, { nearest: true });
const moonTex = canvasTex(256, 256, (x, w, h) => {
  x.clearRect(0, 0, w, h);
  const g = x.createRadialGradient(128, 128, 40, 128, 128, 126);
  g.addColorStop(0, 'rgba(255,248,205,1)');
  g.addColorStop(0.82, 'rgba(255,226,130,0.95)');
  g.addColorStop(0.96, 'rgba(255,180,60,0.35)');
  g.addColorStop(1, 'rgba(255,180,60,0)');
  x.fillStyle = g;
  x.beginPath(); x.arc(128, 128, 126, 0, Math.PI * 2); x.fill();
  x.fillStyle = 'rgba(255,205,90,0.35)';
  for (const [cx2, cy2, r] of [[100, 100, 17], [158, 150, 13], [140, 84, 9], [92, 168, 10], [176, 108, 7]]) {
    x.beginPath(); x.arc(cx2, cy2, r, 0, Math.PI * 2); x.fill();
  }
});
const wallTex = (() => {
  const c = document.createElement('canvas'); c.width = 2048; c.height = 512;
  const x = c.getContext('2d');
  x.fillStyle = '#c8b294'; x.fillRect(0, 0, 2048, 512);
  for (let i = 0; i < 5200; i++) {
    x.fillStyle = `rgba(${170 + Math.random() * 55},${145 + Math.random() * 45},${100 + Math.random() * 40},0.3)`;
    x.fillRect(Math.random() * 2048, Math.random() * 512, 4 + Math.random() * 26, 3 + Math.random() * 14);
  }
  x.strokeStyle = 'rgba(90,70,40,0.35)'; x.lineWidth = 2;
  for (let i = 0; i < 60; i++) {
    x.beginPath(); x.moveTo(Math.random() * 2048, 0); x.lineTo(Math.random() * 2048, 512); x.stroke();
  }
  const crescent = (px, py, r, col, bg) => {
    x.fillStyle = col;
    x.beginPath(); x.arc(px, py, r, 0, Math.PI * 2); x.fill();
    x.fillStyle = bg;
    x.beginPath(); x.arc(px + r * 0.38, py - r * 0.16, r * 0.82, 0, Math.PI * 2); x.fill();
  };
  // seven arches with vivid banners between
  const NW = 7, WW = 2048 / NW;
  for (let i = 0; i < NW; i++) {
    const px = i * WW + WW / 2, top = 66 + (i % 3) * 22, w = 118, base = 500;
    // arch inset (deep violet night through the ruin)
    const ag = x.createLinearGradient(0, top, 0, base);
    ag.addColorStop(0, '#8fd0f7'); ag.addColorStop(1, '#dff4fd');
    x.fillStyle = ag;
    x.beginPath();
    x.moveTo(px - w / 2, base);
    x.lineTo(px - w / 2, top + 90);
    x.quadraticCurveTo(px - w / 2, top + 8, px, top);
    x.quadraticCurveTo(px + w / 2, top + 8, px + w / 2, top + 90);
    x.lineTo(px + w / 2, base);
    x.closePath(); x.fill();
    x.strokeStyle = '#8a7350'; x.lineWidth = 13; x.stroke();
    x.strokeStyle = '#f2b13c'; x.lineWidth = 3;
    x.beginPath();
    x.moveTo(px - w / 2 + 12, base); x.lineTo(px - w / 2 + 12, top + 92);
    x.quadraticCurveTo(px - w / 2 + 12, top + 22, px, top + 12);
    x.quadraticCurveTo(px + w / 2 - 12, top + 22, px + w / 2 - 12, top + 92);
    x.lineTo(px + w / 2 - 12, base);
    x.stroke();
    // mullion cross inside the arch
    x.strokeStyle = 'rgba(120,95,60,0.85)'; x.lineWidth = 7;
    x.beginPath(); x.moveTo(px, top + 26); x.lineTo(px, base); x.stroke();
    x.beginPath(); x.moveTo(px - w / 2 + 8, top + 190); x.lineTo(px + w / 2 - 8, top + 190); x.stroke();
    // banner hanging between arches
    if (i < NW - 1) {
      const bx = (i + 1) * WW, bw = 74, bh = 190, by = 120;
      x.fillStyle = ['#e0342b', '#12a5b8', '#7d3fd1', '#ff7a1a', '#2a9d4f', '#e7548f'][i % 6];
      x.fillRect(bx - bw / 2, by, bw, bh);
      x.beginPath(); x.moveTo(bx - bw / 2, by + bh); x.lineTo(bx, by + bh + 30); x.lineTo(bx + bw / 2, by + bh); x.closePath(); x.fill();
      x.strokeStyle = '#f2b13c'; x.lineWidth = 3; x.strokeRect(bx - bw / 2, by, bw, bh);
      crescent(bx, by + 62, 24, '#ffe9a8', ['#e0342b', '#12a5b8', '#7d3fd1', '#ff7a1a', '#2a9d4f', '#e7548f'][i % 6]);
      x.fillStyle = '#ffffff';
      x.font = '900 25px "Arial Black", Arial, sans-serif';
      x.textAlign = 'center';
      x.fillText(i % 2 ? 'FROG' : 'LUNC', bx, by + 138);
    }
  }
  // torch glow dots along the wall base
  for (let i = 0; i < 14; i++) {
    const px = 70 + i * 146, py = 452;
    const tg = x.createRadialGradient(px, py, 2, px, py, 42);
    tg.addColorStop(0, 'rgba(255,180,70,0.55)'); tg.addColorStop(1, 'rgba(255,180,70,0)');
    x.fillStyle = tg; x.fillRect(px - 44, py - 44, 88, 88);
    x.fillStyle = '#ffcf7a';
    x.beginPath(); x.arc(px, py, 4.5, 0, Math.PI * 2); x.fill();
  }
  const t = new THREE.CanvasTexture(c);
  t.wrapS = THREE.RepeatWrapping; t.repeat.x = 2;
  t.anisotropy = 8; t.colorSpace = THREE.SRGBColorSpace;
  return t;
})();
wallTex.repeat.set(3, 1);
/* Texture-richness pass (Nov 6, Tom's bar: "max these games out — rich
   textured graphics, not flat colours"): a painted ashlar stone-block
   texture shared by the steps, gallery band, pillars, pylons and
   braziers (they were flat colour fills), plus a bump map derived from
   the same painting. All procedural canvas work, original. */
function paintStone(x, w, h, base, joint) {
  x.fillStyle = base; x.fillRect(0, 0, w, h);
  const rows = 6, rh = h / rows;
  for (let r = 0; r < rows; r++) {
    const off = (r % 2) * 0.5;
    const cols = 4;
    for (let cix = -1; cix < cols + 1; cix++) {
      const bx = (cix + off) * (w / cols), by = r * rh, bw2 = w / cols, bh2 = rh;
      const v = (Math.random() - 0.5) * 26;
      x.fillStyle = `rgba(${v > 0 ? 205 : 0},${v > 0 ? 225 : 0},${v > 0 ? 232 : 10},${Math.abs(v) / 255})`;
      x.fillRect(bx + 2, by + 2, bw2 - 4, bh2 - 4);
      const grd = x.createLinearGradient(bx, by, bx, by + bh2);
      grd.addColorStop(0, 'rgba(205,230,238,0.07)'); grd.addColorStop(1, 'rgba(0,0,0,0.20)');
      x.fillStyle = grd; x.fillRect(bx + 2, by + 2, bw2 - 4, bh2 - 4);
      x.fillStyle = 'rgba(0,0,0,0.30)'; x.fillRect(bx + 2, by + bh2 - 6, bw2 - 4, 3); // worn lower lip
    }
  }
  x.strokeStyle = joint; x.lineWidth = 3;
  for (let r = 0; r <= rows; r++) { x.beginPath(); x.moveTo(0, r * rh); x.lineTo(w, r * rh); x.stroke(); }
  for (let r = 0; r < rows; r++) {
    const off = (r % 2) * 0.5;
    for (let cix = 0; cix <= 4; cix++) {
      const bx = (cix + off) * (w / 4);
      x.beginPath(); x.moveTo(bx, r * rh); x.lineTo(bx, (r + 1) * rh); x.stroke();
    }
  }
  x.strokeStyle = 'rgba(200,230,238,0.10)'; x.lineWidth = 1;
  for (let r = 0; r < rows; r++) { x.beginPath(); x.moveTo(0, r * rh + 2); x.lineTo(w, r * rh + 2); x.stroke(); }
  for (let i = 0; i < 46; i++) { // cracks
    x.strokeStyle = `rgba(0,0,0,${0.18 + Math.random() * 0.22})`; x.lineWidth = 1 + Math.random();
    let px = Math.random() * w, py = Math.random() * h;
    x.beginPath(); x.moveTo(px, py);
    const segs = 2 + (Math.random() * 3 | 0);
    for (let sg = 0; sg < segs; sg++) { px += (Math.random() - 0.5) * 46; py += Math.random() * 30; x.lineTo(px, py); }
    x.stroke();
  }
  for (let i = 0; i < 30; i++) { // damp / soot stains
    const sx = Math.random() * w, sy = Math.random() * h, sr = 22 + Math.random() * 70;
    const sg2 = x.createRadialGradient(sx, sy, 0, sx, sy, sr);
    sg2.addColorStop(0, `rgba(4,8,10,${0.10 + Math.random() * 0.14})`); sg2.addColorStop(1, 'rgba(0,0,0,0)');
    x.fillStyle = sg2; x.beginPath(); x.arc(sx, sy, sr, 0, 7); x.fill();
  }
  for (let i = 0; i < 5200; i++) { // grain
    x.fillStyle = `rgba(255,255,255,${Math.random() * 0.05})`;
    x.fillRect(Math.random() * w, Math.random() * h, 2, 2);
  }
  for (let i = 0; i < 2600; i++) {
    x.fillStyle = `rgba(0,0,0,${Math.random() * 0.13})`;
    x.fillRect(Math.random() * w, Math.random() * h, 2, 2);
  }
}
const stoneTex = canvasTex(512, 512, (x, w, h) => paintStone(x, w, h, '#8a7350', 'rgba(60,45,20,0.6)'));
const stoneBump = canvasTex(512, 512, (x, w, h) => paintStone(x, w, h, '#808080', 'rgba(0,0,0,0.9)'));
const stoneMatT = new THREE.MeshStandardMaterial({ map: stoneTex, bumpMap: stoneBump, bumpScale: 0.6, roughness: 0.94, metalness: 0.04, envMapIntensity: 0.25, fog: false });
function bannerTex(kind) {
  const c = document.createElement('canvas'); c.width = 512; c.height = 768;
  const x = c.getContext('2d');
  const lunc = kind === 0;
  x.fillStyle = lunc ? '#c22424' : '#0e8a99'; x.fillRect(0, 0, 512, 768);
  const g = x.createLinearGradient(0, 0, 0, 768);
  g.addColorStop(0, 'rgba(255,255,255,0.07)'); g.addColorStop(1, 'rgba(0,0,0,0.35)');
  x.fillStyle = g; x.fillRect(0, 0, 512, 768);
  x.strokeStyle = '#f2b13c'; x.lineWidth = 10; x.strokeRect(18, 18, 476, 732);
  x.strokeStyle = 'rgba(255,255,255,0.5)'; x.lineWidth = 3; x.strokeRect(40, 40, 432, 688);
  const crescent = (px, py, r, col, bg) => {
    x.fillStyle = col;
    x.beginPath(); x.arc(px, py, r, 0, Math.PI * 2); x.fill();
    x.fillStyle = bg;
    x.beginPath(); x.arc(px + r * 0.38, py - r * 0.16, r * 0.82, 0, Math.PI * 2); x.fill();
  };
  const skull = (px, py, s, col, bg) => {
    x.fillStyle = col;
    x.beginPath(); x.ellipse(px, py - s * 0.12, s * 0.62, s * 0.55, 0, 0, Math.PI * 2); x.fill();
    x.fillRect(px - s * 0.34, py + s * 0.22, s * 0.68, s * 0.42);
    x.fillStyle = bg;
    x.beginPath(); x.arc(px - s * 0.26, py - s * 0.08, s * 0.15, 0, Math.PI * 2); x.fill();
    x.beginPath(); x.arc(px + s * 0.26, py - s * 0.08, s * 0.15, 0, Math.PI * 2); x.fill();
    x.beginPath(); x.moveTo(px, py + s * 0.10); x.lineTo(px - s * 0.09, py + s * 0.30); x.lineTo(px + s * 0.09, py + s * 0.30); x.closePath(); x.fill();
  };
  const bg = lunc ? '#c22424' : '#0e8a99';
  crescent(256, 205, 105, '#ffe9a8', bg);
  skull(256, 415, 74, '#f7f1de', bg);
  x.fillStyle = '#ffd23c';
  x.textAlign = 'center'; x.textBaseline = 'middle';
  x.font = '900 92px "Arial Black", Arial, sans-serif';
  x.fillText(lunc ? 'LUNC' : 'FROG', 256, 585);
  x.font = '900 40px "Arial Black", Arial, sans-serif';
  x.fillStyle = '#ffffff';
  x.fillText(lunc ? 'CLASSIC' : 'CLASSIC', 256, 662);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4;
  return t;
}
const bannerTexL = bannerTex(0);
const bannerTexR = bannerTex(1);
/* Entrance sign over the gate (venue branding, Tom Nov 6): a stone
   plaque painted with the house marks — LUNA CLASSIC in gold, LUNC DEV
   STUDIO beneath, crescents flanking. Procedural canvas, original. */
const signTex = (() => {
  const c = document.createElement('canvas'); c.width = 1024; c.height = 256;
  const x = c.getContext('2d');
  x.fillStyle = '#12507e'; x.fillRect(0, 0, 1024, 256);
  for (let i = 0; i < 700; i++) {
    x.fillStyle = `rgba(${40 + Math.random() * 40},${110 + Math.random() * 40},${160 + Math.random() * 50},0.3)`;
    x.fillRect(Math.random() * 1024, Math.random() * 256, 4 + Math.random() * 18, 3 + Math.random() * 8);
  }
  x.strokeStyle = '#f2b13c'; x.lineWidth = 7; x.strokeRect(12, 12, 1000, 232);
  x.strokeStyle = 'rgba(126,230,245,0.6)'; x.lineWidth = 2; x.strokeRect(26, 26, 972, 204);
  const crescent = (px, py, r) => {
    x.fillStyle = '#ffd23c';
    x.beginPath(); x.arc(px, py, r, 0, Math.PI * 2); x.fill();
    x.fillStyle = '#12507e';
    x.beginPath(); x.arc(px + r * 0.38, py - r * 0.16, r * 0.82, 0, Math.PI * 2); x.fill();
  };
  crescent(92, 128, 44); crescent(932, 128, 44);
  x.textAlign = 'center'; x.textBaseline = 'middle';
  x.fillStyle = '#ffd23c';
  x.font = '900 104px "Arial Black", Arial, sans-serif';
  x.fillText('FROG ARENA', 512, 106);
  x.fillStyle = '#bfe9ff';
  x.font = '900 40px "Arial Black", Arial, sans-serif';
  x.fillText('L U N C   D E V   S T U D I O', 512, 196);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4;
  return t;
})();
/* Image-based lighting baked from the game's own sky: gives the suits,
   hair and eyes believable specular life under the closer camera. */
{
  const pmrem = new THREE.PMREMGenerator(renderer);
  const envScene = new THREE.Scene();
  envScene.add(new THREE.Mesh(new THREE.SphereGeometry(50, 16, 12),
    new THREE.MeshBasicMaterial({ map: skyTex, side: THREE.BackSide })));
  const envSun = new THREE.Mesh(new THREE.SphereGeometry(4, 8, 8), new THREE.MeshBasicMaterial());
  envSun.material.color.setRGB(3.2, 3.1, 2.7);
  envSun.position.set(18, 22, 14);
  envScene.add(envSun);
  scene.environment = pmrem.fromScene(envScene, 0.05).texture;
  pmrem.dispose();
}

/* ---------------- arena ---------------- */
let gateRing, gateGlowSpr, moonMesh, moonGlowSpr;
const arena = new THREE.Group(); scene.add(arena);
const flames = [];
const banners = [];
const searchlights = [];
let holoRing = null;
let embers = null;
{
  const sky = new THREE.Mesh(new THREE.SphereGeometry(80, 32, 20),
    new THREE.MeshBasicMaterial({ map: skyTex, side: THREE.BackSide, fog: false }));
  arena.add(sky);

  const platform = new THREE.Mesh(new THREE.CylinderGeometry(5.4, 5.9, 0.5, 48),
    new THREE.MeshStandardMaterial({ map: floorTex, roughness: 0.8, metalness: 0.15, envMapIntensity: 0.4 }));
  platform.position.y = -0.25; platform.receiveShadow = true;
  arena.add(platform);

  /* Visual pass (Nov 6) — the bowl itself: a painted wall ringing the
     arena, three seating tiers stepping up to it with lit trim, and a
     dusting of distant crowd lights on the tiers. All procedural
     geometry + canvas textures, original to this project. FROG ARENA 2
     re-skins the wall/trim/lights as a sunlit colosseum; the
     tier RING geometry is unchanged (see below). */
  const wall = new THREE.Mesh(new THREE.CylinderGeometry(17, 17.6, 7.6, 48, 1, true),
    new THREE.MeshStandardMaterial({ map: wallTex, roughness: 0.95, metalness: 0.04, side: THREE.BackSide, envMapIntensity: 0.2, fog: false }));
  wall.position.y = 3.0;
  arena.add(wall);
  // upper gallery band: a second, plainer ring above the arcade so the
  // wall's silhouette reaches higher into the sky (the fog used to eat
  // everything past the arch tops and the bowl read flat)
  const gallery = new THREE.Mesh(new THREE.CylinderGeometry(17.3, 17.1, 3.4, 48, 1, true),
    new THREE.MeshStandardMaterial({ map: stoneTex, bumpMap: stoneBump, bumpScale: 0.5, color: 0xa08b62, roughness: 0.8, metalness: 0.35, side: THREE.BackSide, envMapIntensity: 0.15, fog: false }));
  gallery.position.y = 8.4;
  arena.add(gallery);
  const galleryTrim = new THREE.Mesh(new THREE.TorusGeometry(17.2, 0.05, 8, 72),
    new THREE.MeshStandardMaterial({ color: 0x1a0d05, emissive: 0xe8b13c, emissiveIntensity: 0.7, roughness: 0.5, fog: false }));
  galleryTrim.rotation.x = Math.PI / 2; galleryTrim.position.y = 6.72;
  arena.add(galleryTrim);
  const stepMat = stoneMatT;
  const trimMat = new THREE.MeshStandardMaterial({ color: 0x0a1414, emissive: 0xf2b13c, emissiveIntensity: 0.9, roughness: 0.5, fog: false });
  /* Seating tiers are RINGS (tread + inner riser), never solid discs:
     the first build used full cylinders, whose largest disc topped out
     at y=1.0 across the WHOLE arena — burying the platform (top y=0)
     and the fighters' lower halves inside the stone (waist-deep
     fighters, knock/death poses showing only a head and an arm above
     the "floor"). Each tier is an annulus OUTSIDE the platform: a flat
     tread ring at its top height plus a riser band dropping from its
     inner edge to the tier below. A base disc at ground level closes
     the bowl out to the wall. */
  const stepMatD = stepMat.clone(); stepMatD.side = THREE.DoubleSide;
  {
    const base = new THREE.Mesh(new THREE.CircleGeometry(17.8, 56), stepMatD);
    base.rotation.x = -Math.PI / 2; base.position.y = -0.49; base.receiveShadow = true;
    arena.add(base);
  }
  for (const [inner, outer, top, dropTo] of [[5.35, 8.4, 0.25, -0.49], [8.4, 11.4, 0.62, 0.25], [11.4, 14.4, 1.0, 0.62]]) {
    const tread = new THREE.Mesh(new THREE.RingGeometry(inner, outer, 56), stepMatD);
    tread.rotation.x = -Math.PI / 2; tread.position.y = top; tread.receiveShadow = true;
    arena.add(tread);
    const riser = new THREE.Mesh(new THREE.CylinderGeometry(inner, inner, top - dropTo, 56, 1, true), stepMatD);
    riser.position.y = (top + dropTo) / 2;
    arena.add(riser);
    const trim = new THREE.Mesh(new THREE.TorusGeometry(outer + 0.01, 0.028, 8, 72), trimMat);
    trim.rotation.x = Math.PI / 2; trim.position.y = top + 0.01;
    arena.add(trim);
  }
  {
    const N2 = 340, pos2 = new Float32Array(N2 * 3);
    for (let i = 0; i < N2; i++) {
      const r = 6.6 + Math.random() * 7.7, a = Math.random() * Math.PI * 2;
      const top = r < 8.4 ? 0.25 : r < 11.4 ? 0.62 : 1.0;
      pos2[i * 3] = Math.cos(a) * r;
      pos2[i * 3 + 1] = top + 0.12 + Math.random() * 0.5;
      pos2[i * 3 + 2] = Math.sin(a) * r;
    }
    const cg = new THREE.BufferGeometry();
    cg.setAttribute('position', new THREE.BufferAttribute(pos2, 3));
    arena.add(new THREE.Points(cg, new THREE.PointsMaterial({ map: glowTex, color: 0xfff3b0, size: 0.07, transparent: true, opacity: 0.5, depthWrite: false, blending: THREE.AdditiveBlending })));
  }

  const rim = new THREE.Mesh(new THREE.TorusGeometry(5.4, 0.045, 10, 90),
    new THREE.MeshStandardMaterial({ color: 0x1a0d05, emissive: 0xffb340, emissiveIntensity: 2.6 }));
  rim.rotation.x = Math.PI / 2; rim.position.y = 0.012;
  arena.add(rim);
  const rim2 = new THREE.Mesh(new THREE.TorusGeometry(4.1, 0.03, 8, 80),
    new THREE.MeshStandardMaterial({ color: 0x050d1a, emissive: 0xffc46b, emissiveIntensity: 1.7 }));
  rim2.rotation.x = Math.PI / 2; rim2.position.y = 0.012;
  arena.add(rim2);

  const gateMat = new THREE.MeshStandardMaterial({ color: 0x140a06, emissive: 0xff7a2a, emissiveIntensity: 1.6, roughness: .4 });
  const gate = new THREE.Group();
  gate.add(new THREE.Mesh(new THREE.TorusGeometry(3.1, 0.16, 14, 64), gateMat));
  gate.add(new THREE.Mesh(new THREE.TorusGeometry(2.52, 0.06, 10, 56),
    new THREE.MeshStandardMaterial({ color: 0x06121f, emissive: 0xffd76b, emissiveIntensity: 1.9, roughness: .4 })));
  const studMat = new THREE.MeshStandardMaterial({ color: 0x140b04, emissive: 0xffb340, emissiveIntensity: 2.2, roughness: .35 });
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * Math.PI * 2;
    const stud = new THREE.Mesh(new THREE.SphereGeometry(0.085, 10, 8), studMat);
    stud.position.set(Math.cos(a) * 3.1, Math.sin(a) * 3.1, 0);
    gate.add(stud);
  }
  gate.position.set(0, 3.0, -9.5);
  arena.add(gate);
  const sign = new THREE.Mesh(new THREE.BoxGeometry(5.6, 1.4, 0.22),
    [stoneMatT, stoneMatT, stoneMatT, stoneMatT,
     new THREE.MeshStandardMaterial({ map: signTex, roughness: 0.7, metalness: 0.05, envMapIntensity: 0.35, fog: false }), stoneMatT]);
  sign.position.set(0, 6.9, -9.5);
  arena.add(sign);
  const gateGlow = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTex, color: 0xff8b3d, transparent: true, opacity: 0.5, depthWrite: false }));
  gateGlow.scale.set(11, 11, 1); gateGlow.position.copy(gate.position);
  arena.add(gateGlow);
  // Command-dome radar tower (conversion, Nov 7): a lattice mast + dish
  // standing behind the wall where the painted moon used to hang. The
  // layoutArena() hooks below keep the moonMesh/moonGlowSpr names — here
  // they point at the tower group and its teal glow sprite.
  /* The gate keeps its ring + glow (assigned just above); the radar
     dish becomes the bright sun. */
  const moon = new THREE.Group();
  const moonDisc = new THREE.Mesh(new THREE.CircleGeometry(2.6, 40),
    new THREE.MeshBasicMaterial({ map: moonTex, transparent: true, fog: false }));
  moon.add(moonDisc);
  const moonGlow = new THREE.Sprite(new THREE.SpriteMaterial({
    map: glowTex, color: 0xffd76b, transparent: true, opacity: 0.55,
    blending: THREE.AdditiveBlending, depthWrite: false, fog: false,
  }));
  moonGlow.scale.set(11, 11, 1); moon.add(moonGlow);
  moon.position.set(-10.5, 9.6, -24);
  scene.add(moon);
  gateRing = gate; gateGlowSpr = gateGlow; moonMesh = moon; moonGlowSpr = moonGlow;

  const stoneMat = new THREE.MeshStandardMaterial({ map: stoneTex, bumpMap: stoneBump, bumpScale: 0.6, roughness: .95, envMapIntensity: 0.2 });
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * Math.PI * 2 + 0.4;
    const px = Math.cos(a) * 9.5, pz = Math.sin(a) * 9.5 - 2;
    if (pz > 3.5) continue;
    const pillar = new THREE.Mesh(new THREE.CylinderGeometry(0.42, 0.55, 5.6 + (i % 3), 10), stoneMat);
    pillar.position.set(px, 2.4, pz); arena.add(pillar);
    const cap = new THREE.Mesh(new THREE.CylinderGeometry(0.62, 0.62, 0.28, 10), stoneMat);
    cap.position.set(px, 5.4 + (i % 3), pz); arena.add(cap);
    const flame = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTex, color: 0xffa63d, transparent: true, opacity: .85, depthWrite: false }));
    flame.scale.set(1.5, 1.9, 1); flame.position.set(px, 5.9 + (i % 3), pz);
    arena.add(flame); flames.push(flame);
  }
  /* Visual pass (Nov 6) — gate-side set dressing: twin rune pylons with
     flames (gold left / azure right), four low braziers, and the two war
     banners flanking the gate. Same stone family as the pillars. */
  for (const side of [-1, 1]) {
    const py = new THREE.Group();
    const shaft = new THREE.Mesh(new THREE.BoxGeometry(1.05, 4.4, 1.05), stoneMat);
    shaft.position.y = 2.2;
    const capP = new THREE.Mesh(new THREE.CylinderGeometry(0.86, 0.62, 0.5, 4), stoneMat);
    capP.position.y = 4.62; capP.rotation.y = Math.PI / 4;
    const rune = new THREE.Mesh(new THREE.BoxGeometry(0.16, 3.1, 0.06),
      new THREE.MeshStandardMaterial({ color: 0x0a0a12, emissive: side < 0 ? 0xffb340 : 0x2e9bff, emissiveIntensity: 2.0, roughness: .4 }));
    rune.position.set(0, 2.25, 0.56);
    const pflame = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTex, color: 0xffa63d, transparent: true, opacity: .85, depthWrite: false }));
    pflame.scale.set(1.3, 1.7, 1); pflame.position.y = 5.25; pflame.userData.base = 1.25;
    py.add(shaft, capP, rune, pflame); flames.push(pflame);
    py.position.set(side * 5.4, 0, -8.8);
    arena.add(py);
  }
  for (const [bx, bz] of [[-5.6, -3.4], [5.6, -3.4], [-5.6, 3.6], [5.6, 3.6]]) {
    const bg = new THREE.Group();
    const stem = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.11, 0.62, 8), stoneMat);
    stem.position.y = 0.31;
    const bowl = new THREE.Mesh(new THREE.CylinderGeometry(0.36, 0.16, 0.26, 12), stoneMat);
    bowl.position.y = 0.72;
    const bflame = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTex, color: 0xffa63d, transparent: true, opacity: .85, depthWrite: false }));
    bflame.scale.set(1.05, 1.35, 1); bflame.position.y = 1.05; bflame.userData.base = 1.0;
    bg.add(stem, bowl, bflame); flames.push(bflame);
    bg.position.set(bx, 0.25, bz);
    arena.add(bg);
  }
  /* Frog Arena 2 set dressing: twin stone towers flanking
     the gate with torch braziers, plus a pulsing holo projector ring
     around the platform. */
  /* Stone towers flank the gate (replacing the sci-fi
     searchlight towers): broken stone keeps with torch braziers,
     plus the pale moon the layout code positions. */
  const ruinMat = new THREE.MeshStandardMaterial({ color: 0xa68d64, roughness: 0.95, envMapIntensity: 0.25 });
  const ruinDark = new THREE.MeshStandardMaterial({ color: 0x7d6a4c, roughness: 1, envMapIntensity: 0.2 });
  function ruinTower(side) {
    const g = new THREE.Group();
    const tiers = [[2.6, 3.2, 0], [2.1, 2.6, 3.0], [1.6, 2.0, 5.4]];
    tiers.forEach(([w, h, y], i) => {
      const b = new THREE.Mesh(new THREE.BoxGeometry(w, h, w), i % 2 ? ruinDark : ruinMat);
      b.position.y = y + h / 2; b.rotation.y = side * i * 0.16; b.castShadow = true; g.add(b);
    });
    // broken top spikes
    for (let i = 0; i < 4; i++) {
      const sp = new THREE.Mesh(new THREE.ConeGeometry(0.22, 0.7 + (i % 2) * 0.5, 5), ruinDark);
      sp.position.set((i % 2 ? 0.55 : -0.55), 7.9, (i < 2 ? 0.55 : -0.55)); g.add(sp);
    }
    // arched window glow
    const win = new THREE.Mesh(new THREE.PlaneGeometry(0.62, 1.15),
      new THREE.MeshBasicMaterial({ color: 0xbfe6ff, transparent: true, opacity: 0.9, fog: false }));
    win.position.set(0, 4.6, 1.06); g.add(win);
    const winGlow = new THREE.Sprite(new THREE.SpriteMaterial({
      map: glowTex, color: 0x9fd8ff, transparent: true, opacity: 0.3,
      blending: THREE.AdditiveBlending, depthWrite: false, fog: false }));
    winGlow.scale.set(2.6, 2.6, 1); winGlow.position.set(0, 4.6, 1.3); g.add(winGlow);
    // torch brazier on top
    const bowl = new THREE.Mesh(new THREE.CylinderGeometry(0.42, 0.2, 0.3, 8), ruinDark);
    bowl.position.y = 8.15; g.add(bowl);
    const fl = new THREE.Sprite(new THREE.SpriteMaterial({
      map: glowTex, color: 0xffa63c, transparent: true, opacity: 0.95,
      blending: THREE.AdditiveBlending, depthWrite: false, fog: false }));
    fl.scale.set(1.5, 1.9, 1); fl.position.y = 8.65; g.add(fl); flames.push(fl);
    g.position.set(side * 10.8, -0.4, -10.5);
    g.rotation.y = -side * 0.35;
    scene.add(g);
    return g;
  }
  ruinTower(-1); ruinTower(1);
  gateRing = gate; gateGlowSpr = gateGlow; moonMesh = moon; moonGlowSpr = moonGlow;
  const holo = new THREE.Mesh(new THREE.TorusGeometry(5.85, 0.022, 8, 96),
    new THREE.MeshBasicMaterial({ color: 0x2fb8d8, transparent: true, opacity: 0.5, fog: false }));
  holo.rotation.x = Math.PI / 2; holo.position.y = 0.65;
  arena.add(holo); holoRing = holo;
  for (const [side, tex] of [[-1, bannerTexL], [1, bannerTexR]]) {
    const bg2 = new THREE.Group();
    const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.045, 0.045, 5.4, 8), stoneMat);
    pole.position.y = 2.7;
    const bar = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.035, 1.7, 8), stoneMat);
    bar.rotation.z = Math.PI / 2; bar.position.y = 5.15;
    const cloth = new THREE.Mesh(new THREE.PlaneGeometry(1.45, 2.5, 6, 10),
      new THREE.MeshStandardMaterial({ map: tex, side: THREE.DoubleSide, roughness: .9, envMapIntensity: 0.2 }));
    cloth.position.y = 3.82;
    bg2.add(pole, bar, cloth);
    bg2.position.set(side * 3.6, 0, -9.2);
    arena.add(bg2);
    banners.push({ cloth, phase: side * 1.7 });
  }
  const N = 240, pos = new Float32Array(N * 3);
  for (let i = 0; i < N; i++) {
    pos[i * 3] = (Math.random() - .5) * 22; pos[i * 3 + 1] = Math.random() * 7; pos[i * 3 + 2] = -6 + Math.random() * 12;
  }
  const eg = new THREE.BufferGeometry();
  eg.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  embers = new THREE.Points(eg, new THREE.PointsMaterial({ map: glowTex, color: 0xffe9a8, size: 0.09, transparent: true, opacity: .55, depthWrite: false, blending: THREE.AdditiveBlending }));
  arena.add(embers);
}
// Set pieces are composed per orientation: the landscape gate ring / moon
// placement overwhelms a portrait frame, so portrait pulls them smaller,
// higher and into the narrower frustum.
function layoutArena() {
  if (!gateRing) return;
  if (isPortrait) {
    gateRing.position.set(0, 3.7, -11.5); gateRing.scale.setScalar(0.78);
    gateGlowSpr.position.copy(gateRing.position); gateGlowSpr.scale.set(8.5, 8.5, 1);
    moonMesh.position.set(-3.6, 9.8, -26); moonMesh.scale.setScalar(1.35);
    moonGlowSpr.position.set(0, 0.9, 0); moonGlowSpr.scale.set(4.2, 4.2, 1);
    scene.fog.density = 0.016;
  } else {
    gateRing.position.set(0, 3.0, -9.5); gateRing.scale.setScalar(1);
    gateGlowSpr.position.copy(gateRing.position); gateGlowSpr.scale.set(11, 11, 1);
    moonMesh.position.set(-9.5, 11.5, -25); moonMesh.scale.setScalar(2.4);
    moonGlowSpr.position.set(0, 0.9, 0); moonGlowSpr.scale.set(5.5, 5.5, 1);
    scene.fog.density = 0.022;
  }
}
layoutArena();

/* ---------------- audio (synth, no assets) ---------------- */
const AudioSys = {
  ctx: null, muted: false,
  init() { if (!this.ctx) { try { this.ctx = new (window.AudioContext || window.webkitAudioContext)(); } catch (e) { } } },
  env(node, t0, a, d, peak = 0.5) {
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(0, t0); g.gain.linearRampToValueAtTime(peak, t0 + a);
    g.gain.exponentialRampToValueAtTime(0.001, t0 + a + d);
    node.connect(g); g.connect(this.ctx.destination); return g;
  },
  tone(freq0, freq1, dur, type = 'sine', peak = 0.4) {
    if (!this.ctx || this.muted) return; const t = this.ctx.currentTime;
    const o = this.ctx.createOscillator(); o.type = type;
    o.frequency.setValueAtTime(freq0, t); o.frequency.exponentialRampToValueAtTime(Math.max(freq1, 1), t + dur);
    this.env(o, t, 0.005, dur, peak); o.start(t); o.stop(t + dur + 0.05);
  },
  noise(dur, filterFreq, type = 'bandpass', peak = 0.3, q = 1) {
    if (!this.ctx || this.muted) return; const t = this.ctx.currentTime;
    const len = Math.max(1, (dur * this.ctx.sampleRate) | 0);
    const buf = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
    const d = buf.getChannelData(0); for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    const src = this.ctx.createBufferSource(); src.buffer = buf;
    const f = this.ctx.createBiquadFilter(); f.type = type; f.frequency.value = filterFreq; f.Q.value = q;
    src.connect(f); this.env(f, t, 0.004, dur, peak); src.start(t);
  },
  swing() { this.noise(0.13, 900, 'bandpass', 0.16, 1.6); },
  hit(kind) { // weight matched to the strike: jab snaps, kick thuds, heavy booms
    if (kind === 'heavy') { this.tone(128, 36, 0.22, 'sine', 0.8); this.noise(0.09, 1800, 'highpass', 0.22); }
    else if (kind === 'kick') { this.tone(108, 33, 0.19, 'sine', 0.72); this.noise(0.08, 1200, 'lowpass', 0.3); }
    else { this.tone(185, 48, 0.13, 'sine', 0.55); this.noise(0.06, 2600, 'highpass', 0.18); }
  },
  block() { this.tone(290, 170, 0.07, 'square', 0.1); this.noise(0.06, 500, 'lowpass', 0.22); },
  bell() { this.tone(660, 655, 0.7, 'sine', 0.3); this.tone(990, 985, 0.55, 'sine', 0.18); },
  ko() { this.tone(96, 28, 0.8, 'sine', 0.8); this.noise(0.5, 300, 'lowpass', 0.5); },
  zap() { this.tone(220, 1400, 0.22, 'sawtooth', 0.14); },
  dash() { this.noise(0.24, 500, 'bandpass', 0.22, 0.8); },
};
document.getElementById('muteBtn').addEventListener('click', () => {
  AudioSys.muted = !AudioSys.muted;
  document.getElementById('muteBtn').textContent = AudioSys.muted ? '✕' : '♪';
});

  // (no GLB assets — the colorful frog champions are built from articulated primitives)
/* Fighter = a REAL 3D colorful frog champion built from Three.js
   primitives, modelled on the design spec (Tom's generated image):
   an upright MUSCULAR frog in black-and-gold spiked armor — crown,
   skull motifs, cape — in a sunlit colosseum. Proportions:
   ~1.92 tall, broad chest, narrow waist, long articulated limbs.
   Every limb is TWO segments (upper + fore / thigh + shin) driven
   by a small IK solver to the same anchor points the combat engine
   reads (limbBones), so the swept-limb contact system works
   unchanged: jab bone = front fist, heavy bone = back fist, kick
   bone = front foot. Idle breathing/sway, walk steps, jab extends,
   hook swings, kick extends, block, flinch, KO fall — real motion.
   Character variants come from cfg.skin: palette (GREEN frog skin
   for everyone — each portrait's colour lives in its armor), armor
   tint, trim, cape, emblem (sun / moon / rose / skull / rune /
   star), headgear (crown / rosecrown / flamecrest / hood / plume /
   starcrown / circlet) and a feminine build for the Queen and
   Princess. The models are built to match the painted portraits
   (in the DOM character-select cards) — wide frog heads, throat
   pouches, muscle-lathe limbs, full colorful armor. */
const DUR = {
  idle: 1.6, walk: 0.8, crouch: 1.2, jump: 0.9, block: 1.2,
  jab: 0.55, heavy: 0.72, kick1: 0.5, kick2: 0.62,
  hitL: 0.45, hitH: 0.5, knock: 0.95, death: 1.15, win: 1.6,
  dash: 0.62, special: 0.62, throw: 0.8,
};
const _iv = new THREE.Vector3(), _iv2 = new THREE.Vector3(), _iv3 = new THREE.Vector3();
const _iDown = new THREE.Vector3(0, -1, 0);
/* Two-segment IK in joint-local space. seg1Mesh hangs off the joint
   group; seg2Grp sits at the middle joint; seg2Mesh + endGrp ride
   it. Targets are frog-space points; the joint group's frog-space
   origin is passed in. Pole biases the elbow (back-down) or knee
   (forward). */
function aim2(jx, jy, jz, seg1, seg2Grp, seg2Mesh, endGrp, tx, ty, tz, a, b, px, py, pz) {
  _iv.set(tx - jx, ty - jy, tz - jz);
  let d = _iv.length();
  const maxD = a + b - 0.012;
  if (d > maxD) { _iv.multiplyScalar(maxD / d); d = maxD; }
  if (d < 0.12) { _iv.setLength(0.12); d = 0.12; }
  const dirx = _iv.x / d, diry = _iv.y / d, dirz = _iv.z / d;
  const cosA = THREE.MathUtils.clamp((a * a + d * d - b * b) / (2 * a * d), -1, 1);
  const m = a * cosA, h = a * Math.sqrt(Math.max(0, 1 - cosA * cosA));
  let ox = px - dirx * (px * dirx + py * diry + pz * dirz);
  let oy = py - diry * (px * dirx + py * diry + pz * dirz);
  let oz = pz - dirz * (px * dirx + py * diry + pz * dirz);
  const ol = Math.hypot(ox, oy, oz) || 1; ox /= ol; oy /= ol; oz /= ol;
  const ex = dirx * m + ox * h, ey = diry * m + oy * h, ez = dirz * m + oz * h;
  _iv2.set(ex, ey, ez);
  const l1 = Math.max(0.05, _iv2.length()); _iv2.normalize();
  seg1.quaternion.setFromUnitVectors(_iDown, _iv2);
  seg1.scale.y = l1;
  seg2Grp.position.set(ex, ey, ez);
  _iv3.set(_iv.x - ex, _iv.y - ey, _iv.z - ez);
  const l2 = Math.max(0.05, _iv3.length()); _iv3.normalize();
  seg2Grp.quaternion.setFromUnitVectors(_iDown, _iv3);
  seg2Mesh.scale.y = l2;
  if (endGrp) endGrp.position.set(0, -l2, 0);
}
/* Lathe-profile limb geometry: radius baked in, spans y 0..-1
   from the joint, so aim2's scale.y stretch works unchanged while
   the silhouette gets real muscle bulk (biceps, calves, gauntlet
   flare) instead of plain toy cylinders. */
function latheGeo(ctrl) {
  const pts = [];
  const N = 18;
  for (let i = 0; i <= N; i++) {
    const t = i / N;
    let r = ctrl[ctrl.length - 1][1];
    for (let j = 0; j < ctrl.length - 1; j++) {
      const t0 = ctrl[j][0], r0 = ctrl[j][1], t1 = ctrl[j + 1][0], r1 = ctrl[j + 1][1];
      if (t >= t0 && t <= t1) {
        const k = t1 > t0 ? (t - t0) / (t1 - t0) : 0;
        r = r0 + (r1 - r0) * (k * k * (3 - 2 * k));
        break;
      }
    }
    pts.push(new THREE.Vector2(Math.max(0.012, r), -t));
  }
  pts.unshift(new THREE.Vector2(0.012, 0.006));
  pts.push(new THREE.Vector2(0.012, -1.006));
  return new THREE.LatheGeometry(pts, 14);
}
class Fighter {
  constructor(cfg) {
    this.cfg = cfg;
    this.group = new THREE.Group();
    this.hp = 100; this.maxHp = cfg.maxHp || 100; this.meter = 0;
    this.x = cfg.startX; this.vx = 0; this.y = 0; this.vy = 0;
    this.face = cfg.startX < 0 ? 1 : -1;
    this.state = 'idle'; this.stateT = 0;
    this.atk = null; this.atkKey = null; this.atkHitDone = false; this.specDone = false;
    this.react = null; this.prevLimb = null; this.atkMinSurf = 99;
    this.specKind = null; this.ult = null;
    this.stats = { specDash: 0, specOrb: 0, specRise: 0, specSweep: 0, ult: 0 };
    this.blocking = false; this.crouching = false;
    this.roundsWon = 0; this.aiTimer = 0; this.aiHoldT = 0; this.aiAction = null; this.aiBlockT = 0; this.aiRot = {};
    this.anim = { key: 'idle', t: 0, loop: true, clamp: false, timeScale: 1 };
    this.current = this.anim; this.currentKey = 'idle';
    this.measuredH = 1.92; this.measuredMin = 0; this.posedH = 1.92; this.armInfo = {};
  }
  static shadowTex() {
    if (!Fighter._shTex) {
      const c = document.createElement('canvas'); c.width = c.height = 128;
      const x = c.getContext('2d');
      const g = x.createRadialGradient(64, 64, 4, 64, 64, 62);
      g.addColorStop(0, 'rgba(0,0,0,0.85)'); g.addColorStop(0.7, 'rgba(0,0,0,0.4)'); g.addColorStop(1, 'rgba(0,0,0,0)');
      x.fillStyle = g; x.fillRect(0, 0, 128, 128);
      Fighter._shTex = new THREE.CanvasTexture(c);
      Fighter._flatGeo = new THREE.PlaneGeometry(1, 1);
      Fighter._shieldGeo = new THREE.SphereGeometry(0.62, 18, 14);
      Fighter._sphGeo = new THREE.SphereGeometry(1, 20, 16);
      Fighter._segGeo = new THREE.CylinderGeometry(0.86, 1, 1, 10); Fighter._segGeo.translate(0, -0.5, 0);
      Fighter._armUpGeo = latheGeo([[0, 0.100], [0.18, 0.128], [0.38, 0.138], [0.62, 0.112], [0.85, 0.092], [1, 0.084]]);
      Fighter._armFoGeo = latheGeo([[0, 0.082], [0.30, 0.098], [0.62, 0.104], [0.85, 0.118], [1, 0.100]]);
      Fighter._thighGeo = latheGeo([[0, 0.138], [0.25, 0.162], [0.50, 0.148], [0.75, 0.118], [1, 0.100]]);
      Fighter._shinGeo = latheGeo([[0, 0.100], [0.22, 0.128], [0.50, 0.108], [0.80, 0.090], [1, 0.082]]);
    }
    return Fighter._shTex;
  }
  async load() {
    if (this.pose) scene.remove(this.group);
    Fighter.shadowTex();
    this.group = new THREE.Group();
    this.pose = new THREE.Group(); this.group.add(this.pose);
    this.yawG = new THREE.Group(); this.pose.add(this.yawG);
    this.shadow = new THREE.Mesh(Fighter._flatGeo, new THREE.MeshBasicMaterial({
      map: Fighter._shTex, transparent: true, depthWrite: false, opacity: 0.45 }));
    this.shadow.rotation.x = -Math.PI / 2; this.shadow.position.y = 0.015;
    this.shadow.scale.set(1.7, 1.1, 1); this.shadow.renderOrder = 1;
    this.group.add(this.shadow);
    this._buildFrog();
    this.yawG.add(this.frog);
    this.shield = new THREE.Mesh(Fighter._shieldGeo, new THREE.MeshBasicMaterial({
      map: glowTex, color: 0xcdb2ff, transparent: true, opacity: 0.38,
      depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide }));
    this.shield.position.set(0, 1.05, 0.45); this.shield.scale.set(1.8, 2.1, 1);
    this.shield.visible = false;
    this.pose.add(this.shield);
    const mk = (px, py, pz) => { const o = new THREE.Object3D(); o.position.set(px, py, pz); this.pose.add(o); return o; };
    this.pelvisBone = mk(0, 1.02, 0);
    this.chestBone = mk(0, 1.48, 0);
    this.headBone = mk(0, 1.82, 0);
    this.handBone = mk(0.36, 1.34, 0.24);
    this.limbBones = { jab: mk(0.36, 1.30, 0.22), heavy: mk(-0.36, 1.30, 0.22), kick: mk(0.20, 0.50, 0.12) };
    this.group.position.set(this.x, 0, 0);
    scene.add(this.group);
    this.play('idle');
    this.applyFacing();
    this._loaded = true;
  }
  /* Build the colorful frog champion — rebuilt Nov 18 (Tom's
     verdict: the first models were smooth toy figures that did not
     match the portraits; the pink Princess "looked like Miss
     Piggy"). Now modelled on the painted portraits: a WIDE flat
     frog head (eyes on top, slit pupils, heavy brow, big throat
     pouch, wide mouth), GREEN frog skin on every warrior (the
     portraits' colour lives in the ARMOR, not the body), muscle-
     bulked lathe-profile limbs, armored gauntlet forearms and
     greave shins, layered spiked pauldrons, tassets, and each
     portrait's own emblem + headgear (sun crown, violet-gem crown,
     rose crown, flame crest, hood, plume, star crown, circlet).
     Local space = pose space: +z toward the foe, feet at y=0.
     Combat anchors, IK segment lengths and pose targets are
     unchanged — only the meshes changed. */
  _buildFrog() {
    const sk = this.cfg.skin || {};
    const fem = !!sk.female;
    const std = (color, rough, metal) => new THREE.MeshStandardMaterial({ color, roughness: rough === undefined ? 0.6 : rough, metalness: metal || 0 });
    const M = {
      body: std(sk.body !== undefined ? sk.body : 0x4a7a35, 0.52),
      belly: std(sk.belly !== undefined ? sk.belly : 0xb9c9a0, 0.62),
      spot: std(sk.spot !== undefined ? sk.spot : 0x2f5523, 0.62),
      pupil: std(sk.pupil !== undefined ? sk.pupil : 0x141414, 0.3),
      iris: std(sk.iris !== undefined ? sk.iris : 0xff9a1f, 0.3),
      white: std(0xf4f1e6, 0.3),
      armor: std(sk.armor !== undefined ? sk.armor : 0x17181c, 0.42, 0.85),
      trim: std(sk.trim !== undefined ? sk.trim : 0xd8a83c, 0.3, 0.85),
      cape: std(sk.cape !== undefined && sk.cape !== null ? sk.cape : 0x2a1a3e, 0.78),
      cloth: std(sk.cape !== undefined && sk.cape !== null ? sk.cape : 0x14100c, 0.85),
      bone: std(0xd8d2c0, 0.55),
      dark: std(0x0c0d10, 0.45),
      leather: std(0x3a2c1e, 0.82),
      gem: std(sk.gem !== undefined ? sk.gem : (sk.iris !== undefined ? sk.iris : 0xff9a1f), 0.25, 0.3),
      glow: sk.glow ? new THREE.MeshStandardMaterial({ color: 0x0b0c10, emissive: sk.trim, emissiveIntensity: 1.15, roughness: 0.4, metalness: 0.2 }) : null,
    };
    const ACC = M.glow || M.trim;
    const F = this.frog = new THREE.Group();
    const S = sk.scale || 1;
    const sph = (mat, sx, sy, sz, px, py, pz, parent) => {
      const m = new THREE.Mesh(Fighter._sphGeo, mat);
      m.scale.set(sx, sy, sz); m.position.set(px, py, pz); m.castShadow = true;
      (parent || F).add(m); return m;
    };
    const box = (mat, sx, sy, sz, px, py, pz, parent) => {
      const m = new THREE.Mesh(new THREE.BoxGeometry(sx, sy, sz), mat);
      m.position.set(px, py, pz); m.castShadow = true; (parent || F).add(m); return m;
    };
    const cone = (mat, r, h, px, py, pz, rx, rz, parent) => {
      const m = new THREE.Mesh(new THREE.ConeGeometry(r, h, 8), mat);
      m.position.set(px, py, pz); if (rx) m.rotation.x = rx; if (rz) m.rotation.z = rz;
      m.castShadow = true; (parent || F).add(m); return m;
    };
    const sun = (mat, r) => {
      const g = new THREE.Group();
      const d = new THREE.Mesh(new THREE.CircleGeometry(r, 20), mat); d.castShadow = true; g.add(d);
      for (let i = 0; i < 8; i++) {
        const a = (i / 8) * Math.PI * 2;
        const c = new THREE.Mesh(new THREE.ConeGeometry(r * 0.30, r * 0.9, 5), mat);
        c.position.set(Math.cos(a) * r * 1.3, Math.sin(a) * r * 1.3, 0);
        c.rotation.z = a - Math.PI / 2; c.castShadow = true; g.add(c);
      }
      return g;
    };
    const skull = (s) => {
      const g = new THREE.Group();
      sph(M.bone, 0.055 * s, 0.05 * s, 0.045 * s, 0, 0.012 * s, 0, g);
      box(M.bone, 0.058 * s, 0.04 * s, 0.03 * s, 0, -0.042 * s, 0.006 * s, g);
      sph(M.dark, 0.013 * s, 0.017 * s, 0.01 * s, 0.023 * s, 0.016 * s, 0.042 * s, g);
      sph(M.dark, 0.013 * s, 0.017 * s, 0.01 * s, -0.023 * s, 0.016 * s, 0.042 * s, g);
      return g;
    };
    const emblem = (kind, r) => {
      const g = new THREE.Group();
      if (kind === 'sun') g.add(sun(M.trim, r));
      else if (kind === 'moon') {
        const c = new THREE.Mesh(new THREE.CircleGeometry(r, 20), M.trim); g.add(c);
        const b = new THREE.Mesh(new THREE.CircleGeometry(r * 0.82, 20), M.armor);
        b.position.set(r * 0.38, r * 0.28, 0.004); g.add(b);
      } else if (kind === 'skull') { const k = skull(r / 0.055); g.add(k); }
      else if (kind === 'rune') {
        const d = box(ACC, r * 1.25, r * 1.25, 0.018, 0, 0, 0, g); d.rotation.z = Math.PI / 4;
        const d2 = box(M.dark, r * 0.62, r * 0.62, 0.02, 0, 0, 0.004, g); d2.rotation.z = Math.PI / 4;
      } else if (kind === 'star') {
        for (const rz of [0, Math.PI / 2]) {
          const c = new THREE.Mesh(new THREE.ConeGeometry(r * 0.30, r * 2.1, 5), ACC);
          c.rotation.z = rz; c.castShadow = true; g.add(c);
          const c2 = new THREE.Mesh(new THREE.ConeGeometry(r * 0.30, r * 2.1, 5), ACC);
          c2.rotation.z = rz + Math.PI; c2.castShadow = true; g.add(c2);
        }
        sph(ACC, r * 0.30, r * 0.30, r * 0.30, 0, 0, 0.01, g);
      } else if (kind === 'rose') {
        sph(M.trim, r * 0.52, r * 0.52, r * 0.4, 0, 0.01, 0, g);
        sph(M.trim, r * 0.4, r * 0.4, r * 0.32, -r * 0.55, -r * 0.3, -0.004, g);
        sph(M.trim, r * 0.4, r * 0.4, r * 0.32, r * 0.55, -r * 0.3, -0.004, g);
        sph(M.dark, r * 0.2, r * 0.2, r * 0.2, 0, 0.01, r * 0.3, g);
      } else {
        const d = new THREE.Mesh(new THREE.CircleGeometry(r * 0.7, 16), M.trim); g.add(d);
      }
      return g;
    };
    /* ---- cape (behind, -z) ---- */
    if (sk.cape !== null) {
      const capeH = (fem && sk.headgear === 'crown') ? 1.60 : 1.42;
      const cg = new THREE.PlaneGeometry(0.94, capeH, 1, 4); cg.translate(0, -capeH / 2, 0);
      const cape = new THREE.Mesh(cg, M.cape);
      cape.position.set(0, 1.66, -0.30); cape.rotation.x = 0.10; cape.castShadow = true;
      cape.material.side = THREE.DoubleSide;
      F.add(cape); this.capeMesh = cape;
      sph(M.trim, 0.05, 0.05, 0.05, 0.40, 1.64, -0.24);
      sph(M.trim, 0.05, 0.05, 0.05, -0.40, 1.64, -0.24);
    }
    /* ---- pelvis, belt, skirt / tassets ---- */
    sph(M.body, 0.335, 0.225, 0.265, 0, 1.02, 0);
    {
      const belt = new THREE.Mesh(new THREE.CylinderGeometry(0.328, 0.328, 0.095, 14), M.dark);
      belt.position.y = 1.05; belt.castShadow = true; F.add(belt);
      if (sk.emblem === 'skull') { const k = skull(1.15); k.position.set(0, 1.05, 0.315); F.add(k); }
      else {
        sph(M.trim, 0.052, 0.05, 0.035, 0, 1.05, 0.318);
        sph(M.gem, 0.028, 0.028, 0.02, 0, 1.05, 0.345);
      }
      if (sk.tassets) {
        for (let i = -3; i <= 3; i++) {
          if (i === 0) continue;
          const a = i * 0.40;
          const plate = box(M.armor, 0.15, 0.30, 0.028, Math.sin(a) * 0.295, 0.855, Math.cos(a) * 0.295);
          plate.rotation.set(0.17, a, 0);
          const edge = box(M.trim, 0.15, 0.018, 0.03, Math.sin(a) * 0.315, 0.715, Math.cos(a) * 0.315);
          edge.rotation.set(0.17, a, 0);
        }
        const front = box(M.armor, 0.20, 0.38, 0.03, 0, 0.815, 0.30); front.rotation.x = 0.10;
        const fe = emblem(sk.emblem || 'none', 0.052); fe.position.set(0, 0.86, 0.322); F.add(fe);
      } else {
        const skirt = new THREE.Mesh(new THREE.CylinderGeometry(0.315, fem ? 0.46 : 0.42, fem ? 0.44 : 0.36, 12, 1, true),
          new THREE.MeshStandardMaterial({ color: sk.cape !== undefined && sk.cape !== null ? sk.cape : 0x1a1426, roughness: 0.85, side: THREE.DoubleSide }));
        skirt.position.set(0, fem ? 0.81 : 0.84, 0); skirt.castShadow = true; F.add(skirt);
        const hem = new THREE.Mesh(new THREE.TorusGeometry(fem ? 0.46 : 0.42, 0.015, 6, 24), M.trim);
        hem.rotation.x = Math.PI / 2; hem.position.y = fem ? 0.595 : 0.665; F.add(hem);
      }
    }
    /* ---- torso: narrow waist, broad muscular chest, full cuirass ---- */
    sph(M.body, fem ? 0.27 : 0.30, 0.30, 0.235, 0, 1.24, 0);
    sph(M.belly, fem ? 0.185 : 0.21, 0.25, 0.115, 0, 1.21, 0.10);
    sph(M.body, fem ? 0.365 : 0.405, 0.335, 0.295, 0, 1.50, 0);
    sph(M.body, 0.30, 0.16, 0.24, 0, 1.70, -0.02);
    sph(M.armor, fem ? 0.375 : 0.415, 0.345, 0.275, 0, 1.52, 0.02);
    sph(M.armor, fem ? 0.30 : 0.335, 0.27, 0.16, 0, 1.53, 0.14);
    {
      const gorget = new THREE.Mesh(new THREE.TorusGeometry(0.205, 0.038, 8, 20), M.armor);
      gorget.position.set(0, 1.715, 0.01); gorget.rotation.x = Math.PI / 2 - 0.15; gorget.scale.set(1, 0.9, 1);
      gorget.castShadow = true; F.add(gorget);
      const trim = new THREE.Mesh(new THREE.TorusGeometry(0.345, 0.017, 6, 28), M.trim);
      trim.position.set(0, 1.345, 0.02); trim.rotation.x = Math.PI / 2 - 0.25; trim.scale.set(1, 0.82, 1); F.add(trim);
      const em = emblem(sk.emblem || 'none', 0.078); em.position.set(0, 1.565, 0.312); F.add(em);
      for (const yy of [1.30, 1.19]) box(M.armor, 0.20, 0.018, 0.012, 0, yy, 0.238);
    }
    sph(M.spot, 0.10, 0.07, 0.05, 0.30, 1.30, -0.26);
    sph(M.spot, 0.12, 0.08, 0.05, -0.32, 1.12, -0.22);
    /* ---- neck + head: unmistakably FROG ---- */
    {
      const neck = new THREE.Mesh(new THREE.CylinderGeometry(0.135, 0.165, 0.18, 10), M.body);
      neck.position.set(0, 1.71, 0.01); neck.castShadow = true; F.add(neck);
    }
    const head = new THREE.Group(); F.add(head); this.headG = head;
    sph(M.body, 0.365, 0.205, 0.275, 0, 1.865, 0.0, head);
    sph(M.spot, 0.30, 0.07, 0.13, 0, 1.955, 0.10, head);
    sph(M.body, 0.29, 0.125, 0.225, 0, 1.775, 0.085, head);
    sph(M.body, 0.245, 0.10, 0.195, 0, 1.685, 0.065, head);
    sph(M.belly, 0.235, 0.175, 0.18, 0, 1.585, 0.045, head);
    {
      const mouth = new THREE.Mesh(new THREE.TorusGeometry(0.185, 0.016, 8, 24, Math.PI), M.dark);
      mouth.position.set(0, 1.775, 0.252); mouth.rotation.set(-0.10, 0, Math.PI); head.add(mouth);
    }
    sph(M.dark, 0.016, 0.012, 0.012, 0.068, 1.85, 0.262, head);
    sph(M.dark, 0.016, 0.012, 0.012, -0.068, 1.85, 0.262, head);
    sph(M.spot, 0.032, 0.026, 0.03, 0.305, 1.90, 0.10, head);
    sph(M.spot, 0.032, 0.026, 0.03, -0.305, 1.90, 0.10, head);
    sph(M.spot, 0.026, 0.022, 0.026, 0.325, 1.815, 0.0, head);
    sph(M.spot, 0.026, 0.022, 0.026, -0.325, 1.815, 0.0, head);
    for (const s of [1, -1]) {
      sph(M.body, 0.118, 0.105, 0.108, 0.168 * s, 2.0, 0.04, head);
      sph(M.white, 0.09, 0.09, 0.09, 0.168 * s, 2.015, 0.068, head);
      sph(M.iris, 0.058, 0.058, 0.058, 0.168 * s, 2.02, 0.122, head);
      sph(M.pupil, 0.05, 0.02, 0.02, 0.168 * s, 2.022, 0.15, head);
      if (fem) for (let li = 0; li < 3; li++)
        cone(M.dark, 0.008, 0.055, (0.168 + (li - 1) * 0.048) * s, 2.085, 0.095, -0.7, (li - 1) * 0.3 * s, head);
    }
    /* ---- headgear (per portrait) ---- */
    const gear = sk.headgear || null;
    if (gear === 'crown' || gear === 'starcrown') {
      const crownMat = gear === 'starcrown' ? M.armor : M.trim;
      const cr = new THREE.Group(); cr.position.set(0, 2.02, 0.0); head.add(cr);
      const band = new THREE.Mesh(new THREE.CylinderGeometry(0.21, 0.235, 0.09, 14), crownMat);
      band.position.y = 0.045; band.castShadow = true; cr.add(band);
      for (let i = 0; i < 9; i++) {
        const a2 = (i / 9) * Math.PI * 2;
        const h = (i % 2 ? 0.16 : 0.24) + (Math.sin(a2) > 0.94 ? 0.07 : 0);
        const spike = new THREE.Mesh(new THREE.ConeGeometry(0.03, h, 6), crownMat);
        spike.position.set(Math.cos(a2) * 0.19, 0.09 + h / 2, Math.sin(a2) * 0.19);
        spike.castShadow = true; cr.add(spike);
      }
      sph(M.gem, 0.032, 0.032, 0.032, 0, 0.045, 0.228, cr);
      sph(M.gem, 0.024, 0.024, 0.024, 0.155, 0.045, 0.165, cr);
      sph(M.gem, 0.024, 0.024, 0.024, -0.155, 0.045, 0.165, cr);
    } else if (gear === 'rosecrown') {
      const ti = new THREE.Mesh(new THREE.TorusGeometry(0.235, 0.02, 8, 24), M.trim);
      ti.position.set(0, 2.0, 0.01); ti.rotation.x = 0.35; ti.castShadow = true; head.add(ti);
      for (let i = 0; i < 5; i++) {
        const x = (i - 2) * 0.085;
        sph(M.trim, 0.036, 0.036, 0.036, x, 2.075 - Math.abs(i - 2) * 0.012, 0.175 - Math.abs(i - 2) * 0.028, head);
        if (i < 4) cone(M.body, 0.016, 0.06, x + 0.042, 2.045, 0.15 - Math.abs(i - 1.5) * 0.02, 0.5, 0.4, head);
      }
      sph(M.gem, 0.026, 0.026, 0.026, 0, 2.03, 0.215, head);
    } else if (gear === 'tiara') {
      const ti = new THREE.Mesh(new THREE.TorusGeometry(0.20, 0.02, 8, 24, Math.PI), M.trim);
      ti.position.set(0, 1.99, 0.02); ti.rotation.x = 0.30; ti.castShadow = true; head.add(ti);
      cone(M.trim, 0.026, 0.10, 0, 2.13, 0.10, 0.3, 0, head);
      sph(M.iris, 0.03, 0.03, 0.03, 0, 2.02, 0.225, head);
    } else if (gear === 'flamecrest') {
      for (let i = 0; i < 5; i++) {
        const h = [0.16, 0.25, 0.32, 0.25, 0.16][i];
        cone(ACC, 0.034, h, (i - 2) * 0.078, 2.06 + h / 2 - 0.04, -0.02 - Math.abs(i - 2) * 0.014, -0.38, 0, head);
      }
      const band = new THREE.Mesh(new THREE.TorusGeometry(0.27, 0.028, 8, 22), M.armor);
      band.position.set(0, 2.0, 0.01); band.rotation.x = Math.PI / 2; band.scale.set(1.06, 0.94, 1);
      band.castShadow = true; head.add(band);
    } else if (gear === 'hood') {
      const hood = new THREE.Mesh(new THREE.ConeGeometry(0.315, 0.48, 12, 1, true), M.cloth);
      hood.position.set(0, 2.07, -0.05); hood.rotation.x = 0.22; hood.castShadow = true;
      hood.material = M.cloth; hood.material.side = THREE.DoubleSide;
      head.add(hood);
      const mantle = new THREE.Mesh(new THREE.TorusGeometry(0.235, 0.05, 8, 20), M.cloth);
      mantle.position.set(0, 1.79, 0); mantle.rotation.x = Math.PI / 2; mantle.scale.set(1.08, 0.95, 1);
      mantle.castShadow = true; head.add(mantle);
    } else if (gear === 'plume') {
      sph(M.armor, 0.295, 0.15, 0.26, 0, 1.99, 0.0, head);
      const plumeMat = std(sk.plume !== undefined ? sk.plume : 0x3fa9f5, 0.7);
      for (let i = 0; i < 6; i++) {
        const c = cone(plumeMat, 0.055, 0.34, 0, 2.20 - Math.abs(i - 1.5) * 0.018, 0.115 - i * 0.052, -0.75 + i * 0.27, 0, head);
        c.scale.set(0.45, 1, 1);
      }
      sph(M.trim, 0.03, 0.03, 0.03, 0, 2.06, 0.20, head);
    } else if (gear === 'circlet') {
      const band = new THREE.Mesh(new THREE.TorusGeometry(0.265, 0.017, 8, 22), M.armor);
      band.position.set(0, 2.0, 0.01); band.rotation.x = Math.PI / 2; band.scale.set(1.08, 0.95, 1);
      band.castShadow = true; head.add(band);
      for (let i = 0; i < 5; i++)
        cone(M.trim, 0.012, 0.05, (i - 2) * 0.09, 2.06, 0.10 - Math.abs(i - 2) * 0.012, 0, 0, head);
    } else if (gear === 'crest') {
      for (let i = 0; i < 5; i++)
        cone(M.iris, 0.035, 0.16 - Math.abs(i - 2) * 0.025, (i - 2) * 0.085, 2.06, -0.02 - Math.abs(i - 2) * 0.012, -0.25, 0, head);
    } else if (gear === 'band') {
      const band = new THREE.Mesh(new THREE.TorusGeometry(0.295, 0.04, 8, 22), M.iris);
      band.position.set(0, 1.94, 0.02); band.rotation.x = Math.PI / 2; band.scale.set(1.05, 0.92, 1);
      band.castShadow = true; head.add(band);
    }
    /* ---- pauldrons (layered, spiked) ---- */
    for (const s of [1, -1]) {
      const pg = new THREE.Group(); pg.position.set(0.475 * s, 1.675, 0); F.add(pg);
      const dome = new THREE.Mesh(Fighter._sphGeo, M.armor);
      dome.scale.set(0.205, 0.17, 0.205); dome.castShadow = true; pg.add(dome);
      const dome2 = new THREE.Mesh(Fighter._sphGeo, M.armor);
      dome2.scale.set(0.175, 0.125, 0.175); dome2.position.set(0.02 * s, -0.095, 0); dome2.castShadow = true; pg.add(dome2);
      const rim = new THREE.Mesh(new THREE.TorusGeometry(0.165, 0.016, 6, 20), M.trim);
      rim.rotation.x = Math.PI / 2; rim.position.y = -0.06; pg.add(rim);
      cone(M.armor, 0.037, 0.17, 0, 0.175, 0, 0, 0, pg);
      cone(M.armor, 0.031, 0.13, 0.095 * s, 0.125, 0.02, 0, -0.5 * s, pg);
      cone(M.armor, 0.031, 0.13, -0.095 * s, 0.125, 0.02, 0, 0.5 * s, pg);
      cone(M.armor, 0.028, 0.11, 0, 0.115, 0.115, 0.5, 0, pg);
      cone(M.armor, 0.028, 0.11, 0, 0.115, -0.115, -0.5, 0, pg);
      if (sk.emblem === 'sun') {
        const sd = sun(M.trim, 0.072); sd.position.set(0.195 * s, 0.01, 0); sd.rotation.y = s * Math.PI / 2; pg.add(sd);
      }
    }
    /* ---- articulated limbs (two-segment IK, lathe-profiled) ---- */
    const limbS = fem ? 0.86 : 1;
    const leatherFore = this.cfg.id === 'brawler' || this.cfg.id === 'nightblade';
    const mkArm = (side) => {
      const shoulder = new THREE.Group(); shoulder.position.set(0.485 * side, 1.615, 0.02); F.add(shoulder);
      sph(M.body, 0.105, 0.105, 0.105, 0, 0, 0, shoulder);
      const upper = new THREE.Mesh(Fighter._armUpGeo, M.body);
      upper.scale.set(limbS, 1, limbS); upper.castShadow = true; shoulder.add(upper);
      const foreG = new THREE.Group(); shoulder.add(foreG);
      const fore = new THREE.Mesh(Fighter._armFoGeo, leatherFore ? M.leather : M.armor);
      fore.scale.set(limbS, 1, limbS); fore.castShadow = true; foreG.add(fore);
      const cuff = new THREE.Mesh(new THREE.TorusGeometry(0.10, 0.015, 6, 14), M.trim);
      cuff.rotation.x = Math.PI / 2; cuff.position.y = -0.315; foreG.add(cuff);
      cone(M.trim, 0.017, 0.07, 0.105, -0.17, 0, 0, 1.1, foreG);
      const fistG = new THREE.Group(); foreG.add(fistG);
      sph(M.body, 0.11, 0.10, 0.12, 0, 0, 0, fistG);
      box(M.armor, 0.145, 0.055, 0.10, 0, 0.015, 0.05, fistG);
      for (const kx of [-0.042, 0, 0.042]) sph(M.trim, 0.014, 0.014, 0.014, kx, 0.045, 0.10, fistG);
      return { shoulder, upper, foreG, fore, fistG, jx: 0.485 * side, jy: 1.615, jz: 0.02, a: 0.36, b: 0.36 };
    };
    this.armJab = mkArm(1); this.armHeavy = mkArm(-1);
    const mkLeg = (side) => {
      const hip = new THREE.Group(); hip.position.set(0.20 * side, 1.00, 0); F.add(hip);
      sph(M.body, 0.135, 0.135, 0.135, 0, 0, 0, hip);
      const thigh = new THREE.Mesh(Fighter._thighGeo, sk.legArmor ? M.armor : M.body);
      thigh.scale.set(limbS, 1, limbS); thigh.castShadow = true; hip.add(thigh);
      const shinG = new THREE.Group(); hip.add(shinG);
      const shin = new THREE.Mesh(Fighter._shinGeo, M.armor);
      shin.scale.set(limbS, 1, limbS); shin.castShadow = true; shinG.add(shin);
      if (sk.emblem === 'sun') { const sd = sun(M.trim, 0.05); sd.position.set(0, -0.045, 0.108); shinG.add(sd); }
      else {
        const kd = new THREE.Mesh(new THREE.CircleGeometry(0.058, 16), M.trim);
        kd.position.set(0, -0.045, 0.108); shinG.add(kd);
      }
      cone(M.trim, 0.028, 0.09, 0, -0.10, 0.115, 1.35, 0, shinG);
      const footG = new THREE.Group(); shinG.add(footG);
      box(M.body, 0.125, 0.055, 0.30, 0, -0.01, 0.07, footG);
      if (sk.legArmor || sk.tassets) box(M.armor, 0.13, 0.05, 0.15, 0, 0.008, 0.155, footG);
      for (const ts of [1, 0, -1]) cone(M.body, 0.026, 0.11, 0.048 * ts, -0.015, 0.245, 1.25, 0, footG);
      return { hip, thigh, shinG, shin, footG, jx: 0.20 * side, jy: 1.00, jz: 0, a: 0.49, b: 0.49 };
    };
    this.legFront = mkLeg(1); this.legBack = mkLeg(-1);
    F.scale.setScalar(S);
  }
  play(key, opts = {}) {
    const a = {
      key, t: opts.at || 0,
      loop: opts.loop !== false, clamp: !!opts.clamp,
      timeScale: opts.timeScale !== undefined ? opts.timeScale : 1,
    };
    Object.defineProperty(a, 'time', { get: () => a.t, set: v => { a.t = v; } });
    this.anim = a;
    this.current = a; this.currentKey = key;
  }
  dur(key) { return DUR[key] || 0.6; }
  applyFacing() {
    this.group.rotation.y = this.face > 0 ? Math.PI / 2 : -Math.PI / 2;
  }
  bonePos(bone, out) {
    if (!bone) return out.set(this.x, 1.1 + this.y, 0);
    return bone.getWorldPosition(out);
  }
  updatePose(dt) {
    if (!this.frog) return;
    const a = this.anim;
    a.t += dt * (a.timeScale || 1);
    const key = a.key, dur = this.dur(key);
    let t = a.t;
    if (a.loop) t = dur ? ((t % dur) + dur) % dur : t; else t = Math.min(Math.max(t, 0), dur);
    const ph = dur ? THREE.MathUtils.clamp(t / dur, 0, 1) : 0;
    let bobY = 0, tiltZ = 0, tiltX = 0, scX = 1, scY = 1, lunge = 0, dipY = 0, flop = 0;
    const L = { jab: [0.36, 1.32, 0.24], heavy: [-0.36, 1.32, 0.24], kick: [0.20, 0.52, 0.14] };
    let footF = [0.25, 0.03, 0.05], footB = [-0.25, 0.03, -0.04];
    switch (key) {
      case 'idle': {
        const br = Math.sin(a.t * 2.6);
        bobY = br * 0.03; scY = 1 + br * 0.012;
        L.jab = [0.36 + Math.sin(a.t * 1.7) * 0.015, 1.32 + br * 0.02, 0.24];
        L.heavy = [-0.36 - Math.sin(a.t * 1.7) * 0.015, 1.32 + br * 0.02, 0.24];
        break;
      }
      case 'walk': {
        const s = Math.sin(a.t * 9), c = Math.cos(a.t * 9);
        bobY = Math.abs(c) * 0.06; tiltZ = 0.045;
        footF = [0.25, Math.max(0, s) * 0.11 + 0.03, 0.05 + s * 0.17];
        footB = [-0.25, Math.max(0, -s) * 0.11 + 0.03, -0.04 - s * 0.17];
        L.jab = [0.34, 1.30, 0.22 + c * 0.05]; L.heavy = [-0.34, 1.30, 0.22 - c * 0.05];
        break;
      }
      case 'crouch': scY = 0.82; dipY = -0.07; L.jab = [0.32, 1.08, 0.26]; L.heavy = [-0.32, 1.08, 0.26];
        footF = [0.28, 0.03, 0.12]; footB = [-0.28, 0.03, -0.10]; break;
      case 'block': scX = 1.05; scY = 0.95; L.jab = [0.17, 1.48, 0.40]; L.heavy = [-0.17, 1.48, 0.40]; break;
      case 'jump': scY = 1.04; tiltZ = -0.05;
        footF = [0.24, 0.38, 0.16]; footB = [-0.24, 0.30, -0.14]; break;
      case 'jab': {
        const e = Math.sin(Math.min(1, ph / 0.45) * Math.PI * 0.5);
        const ext = ph > 0.6 ? e * (1 - ph) / 0.4 : e;
        lunge = 0.15 * ext; L.jab = [0.07, 1.54, 0.30 + 0.82 * ext]; tiltZ = -0.09 * ext; break;
      }
      case 'heavy': {
        const w = ph < 0.3 ? -(ph / 0.3) : 0;
        const e = ph >= 0.3 ? Math.sin(Math.min(1, (ph - 0.3) / 0.3) * Math.PI * 0.5) : 0;
        const ext = ph > 0.75 ? e * Math.max(0, (1 - ph) / 0.25) : e;
        lunge = 0.18 * ext + w * 0.26;
        L.heavy = [-0.44 + 0.72 * ext * ext, 1.56 - 0.10 * ext, 0.16 + 0.62 * ext];
        L.jab = [0.32, 1.26, 0.14];
        tiltZ = -0.14 * ext + w * 0.18; break;
      }
      case 'kick1': case 'kick2': {
        const e = Math.sin(Math.min(1, Math.max(0, (ph - 0.1) / 0.45)) * Math.PI * 0.5);
        const ext = ph > 0.8 ? e * (1 - ph) / 0.2 : e;
        L.kick = [0.05, 0.55, 0.18 + 1.02 * ext]; scY = 0.96; tiltZ = 0.10 * ext;
        footF = [0.05, 0.10 + 0.30 * ext, 0.22 + 1.02 * ext];
        break;
      }
      case 'dash': case 'special': {
        const e = Math.sin(Math.min(1, ph * 1.15) * Math.PI);
        lunge = 0.1; scX = 1 + 0.09 * e; tiltZ = -0.15;
        L.jab = [0.11, 1.46, 0.60]; L.heavy = [-0.11, 1.46, 0.60];
        footF = [0.26, 0.10, -0.18]; footB = [-0.26, 0.06, -0.30]; break;
      }
      case 'throw': {
        const e = Math.sin(Math.min(1, ph / 0.5) * Math.PI * 0.5);
        L.jab = [0.13, 1.62, 0.34 + 0.42 * e]; L.heavy = [-0.13, 1.62, 0.34 + 0.42 * e]; tiltZ = -0.07 * e; break;
      }
      case 'hitL': case 'hitH': {
        const e = Math.sin(Math.min(1, ph) * Math.PI);
        tiltZ = 0.20 * e; lunge = -0.10 * e; if (key === 'hitH') tiltX = -0.16 * e; break;
      }
      case 'knock': { const e = Math.min(1, ph * 1.6); flop = -1.25 * e * e; tiltZ = 0.1 * e;
        L.jab = [0.40, 0.45, -0.1]; L.heavy = [-0.40, 0.45, -0.1]; break; }
      case 'death': { const e = Math.min(1, ph * 1.8); flop = -1.35 * e;
        L.jab = [0.42, 0.40, -0.12]; L.heavy = [-0.42, 0.40, -0.12]; break; }
      case 'win': { const b = Math.abs(Math.sin(a.t * 6.5)); bobY = b * 0.11; scY = 1 + b * 0.04;
        L.jab = [0.30, 1.78, 0.30]; L.heavy = [-0.30, 1.78, 0.30]; break; }
    }
    if (this.react) {
      const r = this.react;
      const k = Math.min(1, r.t / 0.03);
      const s = Math.pow(Math.max(0, 1 - r.t / r.dur), 1.5) * k * r.power;
      if (s > 0.001) {
        if (r.zone === 'head') { tiltX -= 0.3 * s; tiltZ += 0.3 * s; }
        else if (r.zone === 'body') { tiltZ += 0.26 * s; }
        else if (r.zone === 'low') { dipY -= 0.07 * s; tiltZ += 0.2 * s; }
        else { tiltZ += 0.08 * s; }
        lunge -= 0.1 * s;
      }
    }
    const S = (this.cfg.skin && this.cfg.skin.scale) || 1;
    this.pose.position.set(0, bobY + dipY, lunge);
    this.pose.rotation.set(tiltX, 0, tiltZ);
    this.frog.rotation.x = flop * 0.92;
    this.frog.rotation.z = flop * 0.22;
    this.frog.scale.set(S * scX, S * scY, S * scX);
    this.limbBones.jab.position.set(L.jab[0], L.jab[1], L.jab[2]);
    this.limbBones.heavy.position.set(L.heavy[0], L.heavy[1], L.heavy[2]);
    this.limbBones.kick.position.set(L.kick[0], L.kick[1], L.kick[2]);
    const poleArm = [0.3, -1, -0.6], poleLeg = [0, 0.25, 1];
    aim2(this.armJab.jx, this.armJab.jy, this.armJab.jz, this.armJab.upper, this.armJab.foreG, this.armJab.fore, this.armJab.fistG,
      L.jab[0], L.jab[1], L.jab[2], this.armJab.a, this.armJab.b, poleArm[0], poleArm[1], poleArm[2]);
    aim2(this.armHeavy.jx, this.armHeavy.jy, this.armHeavy.jz, this.armHeavy.upper, this.armHeavy.foreG, this.armHeavy.fore, this.armHeavy.fistG,
      L.heavy[0], L.heavy[1], L.heavy[2], this.armHeavy.a, this.armHeavy.b, poleArm[0], poleArm[1], poleArm[2]);
    aim2(this.legFront.jx, this.legFront.jy, this.legFront.jz, this.legFront.thigh, this.legFront.shinG, this.legFront.shin, this.legFront.footG,
      footF[0], footF[1], footF[2], this.legFront.a, this.legFront.b, poleLeg[0], poleLeg[1], poleLeg[2]);
    aim2(this.legBack.jx, this.legBack.jy, this.legBack.jz, this.legBack.thigh, this.legBack.shinG, this.legBack.shin, this.legBack.footG,
      footB[0], footB[1], footB[2], this.legBack.a, this.legBack.b, poleLeg[0], poleLeg[1], poleLeg[2]);
    this.handBone.position.set(L.jab[0], L.jab[1], L.jab[2]);
    if (this.capeMesh) this.capeMesh.rotation.x = 0.10 + Math.sin(a.t * 2.2) * 0.03 + Math.max(0, -lunge) * 0.4;
    this.shield.visible = (this.state === 'block' || this.state === 'blockstun');
    this.shadow.position.y = 0.015 - this.y;
    const shS = Math.max(0.45, 1 - this.y * 0.16);
    this.shadow.scale.set(1.7 * shS, 1.1 * shS, 1);
  }
}
/* ---------------- effects ---------------- */
const fxGroup = new THREE.Group(); scene.add(fxGroup);
// spark particles (pooled)
const SPARKS = 220;
const sparkGeo = new THREE.BufferGeometry();
const sparkPos = new Float32Array(SPARKS * 3);
const sparkVel = new Float32Array(SPARKS * 3);
const sparkLife = new Float32Array(SPARKS);
sparkGeo.setAttribute('position', new THREE.BufferAttribute(sparkPos, 3));
const sparkMat = new THREE.PointsMaterial({ map: glowTex, size: 0.14, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, vertexColors: true });
const sparkCol = new Float32Array(SPARKS * 3);
sparkGeo.setAttribute('color', new THREE.BufferAttribute(sparkCol, 3));
const sparkPts = new THREE.Points(sparkGeo, sparkMat);
sparkPts.frustumCulled = false; fxGroup.add(sparkPts);
let sparkHead = 0;
const _c = new THREE.Color();
function burst(pos, colorHex, n = 16, power = 2.6, up = 1.2) {
  _c.set(colorHex);
  for (let i = 0; i < n; i++) {
    const k = sparkHead; sparkHead = (sparkHead + 1) % SPARKS;
    sparkPos[k * 3] = pos.x; sparkPos[k * 3 + 1] = pos.y; sparkPos[k * 3 + 2] = pos.z + 0.15;
    const a = Math.random() * Math.PI * 2, r = (0.3 + Math.random() * 0.7) * power;
    sparkVel[k * 3] = Math.cos(a) * r; sparkVel[k * 3 + 1] = Math.sin(a) * r * 0.7 + up * Math.random(); sparkVel[k * 3 + 2] = (Math.random() - .5) * 1.2;
    sparkLife[k] = 0.38 + Math.random() * 0.3;
    sparkCol[k * 3] = _c.r; sparkCol[k * 3 + 1] = _c.g; sparkCol[k * 3 + 2] = _c.b;
  }
}
function updateSparks(dt) {
  for (let k = 0; k < SPARKS; k++) {
    if (sparkLife[k] <= 0) { sparkPos[k * 3 + 1] = -50; continue; }
    sparkLife[k] -= dt;
    sparkVel[k * 3 + 1] -= 5.5 * dt;
    sparkPos[k * 3] += sparkVel[k * 3] * dt;
    sparkPos[k * 3 + 1] += sparkVel[k * 3 + 1] * dt;
    sparkPos[k * 3 + 2] += sparkVel[k * 3 + 2] * dt;
  }
  sparkGeo.attributes.position.needsUpdate = true;
  sparkGeo.attributes.color.needsUpdate = true;
}
// dust puff sprites (pooled) — a soft breath of dust at the contact point
const puffs = [];
function puff(pos, scale = 0.5, tint = 0xcfc4b0, opacity = 0.42) {
  const m = new THREE.SpriteMaterial({ map: glowTex, color: tint, transparent: true, opacity, depthWrite: false });
  const s = new THREE.Sprite(m);
  s.position.copy(pos); s.position.z += 0.22;
  s.scale.set(scale, scale * 0.82, 1);
  fxGroup.add(s); puffs.push({ s, life: 0.3, max: 0.3, grow: scale * 2.4, op: opacity });
}
function updatePuffs(dt) {
  for (let i = puffs.length - 1; i >= 0; i--) {
    const o = puffs[i]; o.life -= dt;
    const k = Math.max(0, o.life / o.max);
    o.s.material.opacity = o.op * k;
    const sc = o.s.scale.x + o.grow * dt; o.s.scale.set(sc, sc * 0.82, 1);
    o.s.position.y += dt * 0.25;
    if (o.life <= 0) { fxGroup.remove(o.s); o.s.material.dispose(); puffs.splice(i, 1); }
  }
}
// impact flash (visual pass, Nov 6): a hot star-burst that pops on the
// contact point, tinted with the attacker's energy colour, plus one
// shared point light that re-pops per hit — strikes land with real pop.
const flashTex = canvasTex(256, 256, (x, w, h) => {
  x.clearRect(0, 0, w, h);
  x.translate(128, 128);
  const g = x.createRadialGradient(0, 0, 2, 0, 0, 60);
  g.addColorStop(0, 'rgba(255,255,255,1)'); g.addColorStop(0.4, 'rgba(255,255,255,.55)'); g.addColorStop(1, 'rgba(255,255,255,0)');
  x.fillStyle = g; x.beginPath(); x.arc(0, 0, 60, 0, 7); x.fill();
  x.fillStyle = 'rgba(255,255,255,.9)';
  for (let i = 0; i < 4; i++) {
    x.save(); x.rotate(i * Math.PI / 2 + 0.4);
    x.beginPath(); x.moveTo(0, -7); x.lineTo(122, 0); x.lineTo(0, 7); x.closePath(); x.fill(); x.restore();
  }
  x.fillStyle = 'rgba(255,255,255,.55)';
  for (let i = 0; i < 4; i++) {
    x.save(); x.rotate(i * Math.PI / 2 + 0.4 + Math.PI / 4);
    x.beginPath(); x.moveTo(0, -4.5); x.lineTo(76, 0); x.lineTo(0, 4.5); x.closePath(); x.fill(); x.restore();
  }
}, { nearest: true });
const flashes = [];
const impactLight = new THREE.PointLight(0xffffff, 0, 5.2, 1.7);
fxGroup.add(impactLight);
function impactFlash(pos, colorHex, scale = 0.9) {
  const m = new THREE.SpriteMaterial({ map: flashTex, color: colorHex, transparent: true, opacity: .95, depthWrite: false, blending: THREE.AdditiveBlending });
  const s = new THREE.Sprite(m);
  s.position.copy(pos); s.position.z += 0.3;
  s.scale.set(scale, scale, 1);
  s.material.rotation = Math.random() * Math.PI;
  fxGroup.add(s); flashes.push({ s, life: 0.11, max: 0.11, sc: scale });
}
function impactLightPop(pos, colorHex, power) {
  impactLight.color.set(colorHex);
  impactLight.position.set(pos.x, pos.y, pos.z + 0.5);
  impactLight.intensity = power;
}
function updateFlashes(dt) {
  for (let i = flashes.length - 1; i >= 0; i--) {
    const o = flashes[i]; o.life -= dt;
    const k = Math.max(0, o.life / o.max);
    o.s.material.opacity = 0.95 * k;
    const sc = o.sc * (1 + (1 - k) * 0.7); o.s.scale.set(sc, sc, 1);
    if (o.life <= 0) { fxGroup.remove(o.s); o.s.material.dispose(); flashes.splice(i, 1); }
  }
  if (impactLight.intensity > 0.01) impactLight.intensity *= Math.pow(0.00005, dt);
  else impactLight.intensity = 0;
}
// slash arc sprite
const slashTex = canvasTex(256, 256, (x, w, h) => {
  x.clearRect(0, 0, w, h);
  const g = x.createRadialGradient(128, 128, 40, 128, 128, 126);
  g.addColorStop(0, 'rgba(255,255,255,0)'); g.addColorStop(0.75, 'rgba(255,255,255,.95)'); g.addColorStop(1, 'rgba(255,255,255,0)');
  x.strokeStyle = g; x.lineWidth = 30; x.lineCap = 'round';
  x.beginPath(); x.arc(128, 128, 96, -0.4, 1.75); x.stroke();
  x.strokeStyle = 'rgba(255,255,255,.55)'; x.lineWidth = 52;
  x.beginPath(); x.arc(128, 128, 96, 0.15, 1.25); x.stroke();
}, { nearest: true });
const slashSprites = [];
function slashArc(pos, colorHex, flip) {
  const m = new THREE.SpriteMaterial({ map: slashTex, color: colorHex, transparent: true, opacity: .95, depthWrite: false, blending: THREE.AdditiveBlending });
  const s = new THREE.Sprite(m);
  s.position.copy(pos); s.position.z += 0.35;
  s.scale.set(1.7, 1.7, 1); if (flip) s.scale.x *= -1;
  s.material.rotation = flip ? 2.6 : -0.5;
  fxGroup.add(s); slashSprites.push({ s, life: 0.16 });
}
function updateSlashes(dt) {
  for (let i = slashSprites.length - 1; i >= 0; i--) {
    const o = slashSprites[i]; o.life -= dt;
    o.s.material.opacity = Math.max(0, o.life / 0.16) * 0.95;
    const sc = o.s.scale.x + dt * 6; o.s.scale.set(sc, Math.abs(o.s.scale.y) + dt * 6, 1);
    if (o.life <= 0) { fxGroup.remove(o.s); o.s.material.dispose(); slashSprites.splice(i, 1); }
  }
}
// projectiles
const projectiles = [];
function spawnOrb(owner, pos, dmg = 12, homing = false) {
  const grp = new THREE.Group();
  const col = owner.cfg.sparkColor; // orbs carry their owner's energy colour (each champion's own energy colour)
  const core = new THREE.Mesh(new THREE.SphereGeometry(0.11, 16, 12),
    new THREE.MeshStandardMaterial({ color: 0x101418, emissive: col, emissiveIntensity: 4 }));
  const glow = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTex, color: col, transparent: true, opacity: .8, depthWrite: false, blending: THREE.AdditiveBlending }));
  glow.scale.set(0.85, 0.85, 1);
  const light = new THREE.PointLight(col, 6, 3.4, 1.8);
  grp.add(core, glow, light); grp.position.copy(pos);
  fxGroup.add(grp);
  // orb speed/range are kit numbers: the zoner's flies far and fast, the
  // brawler's is a short heavy lob, the speedster's darts out quick
  projectiles.push({ grp, owner, vx: owner.face * owner.cfg.kit.orbPow, life: owner.cfg.kit.orbLife, dmg, homing });
  AudioSys.zap();
}
const _v1 = new THREE.Vector3(), _v2 = new THREE.Vector3();

/* ---------------- combat ----------------
   TRUE CONTACT: a strike lands only when the striking limb's swept path
   (previous frame -> this frame) actually touches the defender's body
   volumes — torso capsule (pelvis->chest), head sphere, leg capsule.
   Limb reach and timings were measured from the rigs' animation clips:
   jab fist peaks ~0.77 out at head height, hook arcs wide, the slide
   kick's lead foot travels at pelvis height. If the limb never arrives,
   the strike whiffs: no damage, no reaction, no effects. */
const ATTACKS = {
  jab:   { clip: 'jab',   limb: 'jab',   startup: 0.12, active: 0.30, dmg: 5,  push: 0.9, gain: 14, hitstop: 0.05, shake: 0 },
  heavy: { clip: 'heavy', limb: 'heavy', startup: 0.20, active: 0.26, dmg: 10, push: 1.7, gain: 22, hitstop: 0.10, shake: 0.11 },
  kick:  { clip: 'kick1', limb: 'kick',  startup: 0.13, active: 0.42, dmg: 8,  push: 1.3, gain: 18, hitstop: 0.07, shake: 0, slide: true },
};
let hitstopT = 0, slowmoT = 0, shakeAmp = 0;

function dist(a, b) { return Math.abs(a.x - b.x); }
function inRange(att, def, range) { return dist(att, def) <= range && Math.abs(att.y - def.y) < 0.9; }

const _limb = new THREE.Vector3(), _limbPrev = new THREE.Vector3();
const _pelv = new THREE.Vector3(), _chst = new THREE.Vector3(), _hed = new THREE.Vector3();
const _s1 = new THREE.Vector3(), _s2 = new THREE.Vector3(), _cp = new THREE.Vector3(), _leg = new THREE.Vector3();
// closest distance between segments p1->p2 and p3->p4; writes closest point on p3->p4 into out
function segSegDist(p1, p2, p3, p4, out) {
  const d1 = _s1.subVectors(p2, p1), d2 = _s2.subVectors(p4, p3);
  const a = d1.lengthSq(), e = d2.lengthSq();
  let s = 0, t = 0;
  if (a > 1e-9 && e > 1e-9) {
    const r = new THREE.Vector3().subVectors(p1, p3);
    const b = d1.dot(d2), c = d1.dot(r), f = d2.dot(r);
    const den = a * e - b * b;
    s = den > 1e-9 ? THREE.MathUtils.clamp((b * f - c * e) / den, 0, 1) : 0;
    t = (b * s + f) / e;
    if (t < 0) { t = 0; s = THREE.MathUtils.clamp(-c / a, 0, 1); }
    else if (t > 1) { t = 1; s = THREE.MathUtils.clamp((b - c) / a, 0, 1); }
  }
  const c1 = new THREE.Vector3().copy(p1).addScaledVector(d1, s);
  out.copy(p3).addScaledVector(d2, t);
  return c1.distanceTo(out);
}
const BODY_R = { torso: 0.21, head: 0.21, leg: 0.19, limb: 0.09 };
// Swept limb-vs-body test. kind: 'jab'|'heavy'|'kick' picks the limb bone.
// Returns { point, zone, surf } on contact (surf = how deep past the surface,
// negative = touching), or null. Also reports the best surface distance seen
// via att.atkMinSurf for whiff diagnostics.
function limbContact(att, def, kind, extraR = 0) {
  const bone = kind === 'body' ? att.chestBone : att.limbBones[kind];
  att.bonePos(bone, _limb);
  if (!att.prevLimb) att.prevLimb = _limb.clone();
  _limbPrev.copy(att.prevLimb);
  def.bonePos(def.pelvisBone, _pelv);
  def.bonePos(def.chestBone, _chst);
  def.bonePos(def.headBone, _hed);
  let best = null, headBest = null;
  const test = (a, b, r, zone) => {
    const d = segSegDist(_limbPrev, _limb, a, b, _cp);
    const surf = d - (r + BODY_R.limb + extraR);
    if (surf < att.atkMinSurf) att.atkMinSurf = surf;
    if (surf > 0) return;
    const cand = { point: _cp.clone(), zone, surf };
    if (zone === 'head') { if (!headBest || surf < headBest.surf) headBest = cand; }
    if (!best || surf < best.surf) best = cand;
  };
  test(_pelv, _chst, BODY_R.torso, 'body');
  test(_hed, _hed, BODY_R.head, 'head');
  test(_chst, _hed, 0.17, 'head'); // neck/upper-chest line reads as a head strike
  _leg.copy(_pelv); _leg.y -= 0.78; // leg capsule: straight down from the pelvis
  test(_pelv, _leg, BODY_R.leg, 'low');
  att.prevLimb.copy(_limb);
  // simultaneous contact: if the limb also reached the head line within a
  // hair of the deepest contact, the head reaction dominates the read
  if (best && headBest && headBest.surf <= best.surf + 0.05) return headBest;
  return best;
}

/* Impact reaction: setReaction() stores the hit; Fighter.updatePose
   folds it into the frog pose, so the body answers AT the point of
   impact — head snap for head strikes, torso twist for body
   strikes, a stagger dip for low strikes, a brace when guarded. */
function setReaction(def, zone, dir, power, blocked) {
  def.react = { t: 0, dur: blocked ? 0.16 : 0.27, zone, dir, power, blocked: !!blocked };
}
function applyReaction(f, dt) { /* folded into Fighter.updatePose via f.react */ }
function startAttack(f, key) {
  const def = ATTACKS[key]; if (!def) return;
  f.state = 'attack'; f.stateT = 0; f.atk = def; f.atkKey = key; f.atkHitDone = false;
  f.prevLimb = null; f.atkMinSurf = 99;
  f.play(def.clip, { loop: false, clamp: true, fade: 0.05 });
  if (key === 'kick') AudioSys.swing();
  else if (key === 'jab') setTimeout(() => AudioSys.swing(), 60);
  else AudioSys.swing();
}
/* Specials (owner, Nov 4): DIRECTIONAL specials — the direction held on
   the stick/pad at the moment SPEC is pressed picks the move:
     → (or no direction) = DASH STRIKE (rush-in hit)
     ←                   = ORB PROJECTILE (ranged blast)
     ↑                   = RISE (step-in launcher, pops the opponent up)
     ↓                   = SWEEP (long low slide, trips the opponent)
   All four are attack moves, both fighters own all four, each costs 25
   meter. The earlier alternating dash<->orb "NEXT" scheme is superseded.
   At a FULL bar (100) SPEC in any direction fires the ULTIMATE instead:
   LUNC's dash-in 3-hit combo + dash finisher, USTC's 3-orb barrage —
   about 24 damage if everything lands, never a one-shot from full HP.
   Clip choices are probe-measured (see ?qa=cliprobe:): no rising-fist
   clip exists in the UAL set, so RISE rides the proven Punch_Cross fist
   on a code-driven hop — the fist sweeps up through the chin line as the
   body leaves the floor, and the launch reaction sells the rest. SWEEP
   reuses the slide clips: Slide_Loop holds the lead foot 0.83 m out at
   0.10 m height — a true low line. */
const SPEC_COST = 25;
function specKindFromInput(input) {
  if (input.jump) return 'rise';   // stick/pad up (input.jump = up held)
  if (input.down) return 'sweep';
  if (input.left) return 'orb';
  return 'dash';                   // right or neutral — the forgiving default
}
function startSpecial(f, kind) {
  if (f.state !== 'idle' && f.state !== 'walk' && f.state !== 'crouch') return;
  if (f.meter >= 100) { startUltimate(f); return; }
  if (f.meter < SPEC_COST) return;
  f.meter -= SPEC_COST;
  beginSpecial(f, kind || 'dash');
}
function dashClipKey(f) { return 'dash'; }
function beginSpecial(f, kind) {
  f.state = 'special'; f.stateT = 0; f.atkHitDone = false; f.specDone = false;
  f.specKind = kind;
  f.prevLimb = null; f.atkMinSurf = 99;
  if (kind === 'dash') { f.play(dashClipKey(f), { loop: false, clamp: true, fade: 0.05 }); AudioSys.dash(); f.stats.specDash++; }
  else if (kind === 'rise') { f.play('heavy', { loop: false, clamp: true, fade: 0.05 }); f.vy = f.cfg.kit.riseHop; AudioSys.swing(); f.stats.specRise++; }
  else if (kind === 'sweep') { f.play('kick1', { loop: false, clamp: true, fade: 0.05 }); AudioSys.dash(); f.stats.specSweep++; }
  else { f.play('throw', { loop: false, clamp: true, fade: 0.05 }); f.stats.specOrb++; }
}
function startUltimate(f) {
  f.meter = 0;
  f.stats.ult++;
  f.specKind = null;
  f.ult = { kind: f.cfg.ultKind, step: 0, stepT: 0, finisher: false, clipDone: false };
  showBanner('ULTIMATE', f.cfg.name, 1.1);
  burst(f.bonePos(f.chestBone, _v1).clone(), f.cfg.sparkColor, 30, 3.4, 1.6);
  impactFlash(f.bonePos(f.chestBone, _v1).clone(), f.cfg.sparkColor, 2.0);
  impactLightPop(f.bonePos(f.chestBone, _v1), f.cfg.sparkColor, 34);
  AudioSys.zap(); AudioSys.bell();
}
/* Ultimate driver — runs at the end of the owner's fighterUpdate.
   'combo': dash in, jab, jab, heavy, then a light dash finisher
   (5+5+10+4 = 24 if every piece lands). 'barrage': three 8-dmg orbs.
   While it runs, brief slow-mo pulses + a camera push (ultCamT) sell
   the moment; if it K.O.s, resolveHit's normal K.O. sequence plays. */
function updateUltimate(att, dt) {
  const u = att.ult, def = foe(att);
  if (!u) return;
  u.stepT += dt;
  if (att.state === 'death' || game.phase !== 'fight') { att.ult = null; return; }
  if (game.ultCamT <= 0) { slowmoT = Math.max(slowmoT, 0.06); game.ultCamT = 0.5; }
  const end = () => { att.ult = null; if (att.state === 'ultimate') { att.state = 'idle'; att.play('idle', { fade: 0.08 }); } };
  if (u.kind === 'combo') {
    if (u.step === 0) {
      att.state = 'ultimate';
      if (!u.clipDone) { u.clipDone = true; att.play('special', { loop: false, clamp: true, fade: 0.05 }); AudioSys.dash(); }
      att.x += att.face * 9.5 * dt;
      if (dist(att, def) <= 0.78 || u.stepT > 0.65) { u.step = 1; u.stepT = 0; startAttack(att, 'jab'); }
      return;
    }
    if (u.step <= 3) {
      if (att.state === 'idle') { // previous strike finished — chain the next
        if (u.step === 3) {
          u.step = 4; u.stepT = 0; u.finisher = true;
          beginSpecial(att, 'dash');
          att.stats.specDash--; // the finisher is part of the ultimate, not a metered special
        } else {
          u.step++; u.stepT = 0;
          startAttack(att, u.step === 3 ? 'heavy' : 'jab');
        }
      }
      return;
    }
    if (u.step === 4 && att.state === 'idle') end();
    if (u.stepT > 5) end(); // safety
    return;
  }
  // barrage — orb count / pace / damage are per-fighter kit numbers
  att.state = 'ultimate';
  const orbN = att.cfg.kit.ultOrbCount, orbGap = orbN > 3 ? 0.17 : 0.24;
  if (u.step < orbN && u.stepT >= u.step * orbGap) {
    att.play('throw', { loop: false, clamp: true, fade: 0.03 });
    att.bonePos(att.handBone, _v1); _v1.y = Math.max(_v1.y, 1.25); _v1.z = 0;
    spawnOrb(att, _v1.clone(), att.cfg.kit.ultOrbDmg, true); // barrage orbs track the target — a knockback lean must not dodge 2 of 3
    u.step++;
  }
  if (u.step >= orbN && u.stepT > orbN * orbGap + 0.6) end();
}
// contact: { point, zone } from limbContact (or null for projectiles ->
// chest-height body contact). opts: { gain, hitstop, shake, heavy, kind }
function resolveHit(att, def, dmg, push, opts = {}) {
  if (!opts.rawDmg) dmg = Math.max(1, Math.round(dmg * att.cfg.kit.dmgMul)); // per-fighter power (roster kits, Nov 6)
  if (opts.gain) opts.gain = Math.round(opts.gain * att.cfg.kit.meterGainMul);
  const blocked = def.blocking && def.state !== 'attack' && def.state !== 'hitstun' && def.state !== 'special';
  const contact = opts.contact || null;
  const zone = contact ? contact.zone : 'body';
  const pt = contact ? contact.point : def.bonePos(def.chestBone, _v1).clone(); pt.z = 0;
  // counter-hit: defender caught mid-move (attacking, dashing, airborne)
  const counter = !blocked && (def.state === 'attack' || def.state === 'special' || def.y > 0.02);
  window.__lastHit = { kind: opts.kind || 'hit', zone, blocked, counter, at: performance.now() };
  if (blocked) {
    const chip = Math.max(1, Math.round(dmg * 0.1));
    def.hp = Math.max(1, def.hp - chip);
    def.state = 'blockstun'; def.stateT = 0;
    def.vx = att.face * push * 0.45; // guard absorbs: small push, stays planted
    burst(pt, 0x9db8dd, 12, 1.5, 0.5);
    impactFlash(pt, 0x9db8dd, 0.55);
    impactLightPop(pt, 0x9db8dd, 5);
    puff(pt, 0.34, 0x8fa3c8, 0.3);
    setReaction(def, 'guard', att.face, 0.5, true);
    AudioSys.block();
    hitstopT = Math.max(hitstopT, 0.03);
    return;
  }
  def.hp -= dmg;
  att.meter = Math.min(100, att.meter + (opts.gain || 8));
  def.meter = Math.min(100, def.meter + 10);
  let pushV = push * (counter ? 1.45 : 1) * (zone === 'low' ? 1.15 : 1);
  if (att.ult && att.ult.kind === 'combo') pushV *= 0.45; // the ultimate juggles — the victim stays in the pocket for the chain
  def.vx = att.face * pushV;
  const heavy = !!opts.heavy;
  burst(pt, att.cfg.sparkColor, heavy ? 38 : 22, heavy ? 3.4 : 2.5, 1.3);
  burst(pt, 0xffffff, heavy ? 10 : 6, 1.7, 0.9);
  puff(pt, heavy ? 0.62 : 0.46, 0xcfc4b0, 0.42);
  impactFlash(pt, att.cfg.sparkColor, heavy ? 1.3 : 0.85);
  impactLightPop(pt, att.cfg.sparkColor, heavy ? 30 : 15);
  if (heavy || opts.kind === 'kick' || opts.kind === 'special') slashArc(pt, att.cfg.sparkColor, att.face < 0);
  setReaction(def, zone, att.face, heavy ? 1.0 : (opts.kind === 'kick' ? 0.8 : 0.6), false);
  AudioSys.hit(opts.kind === 'heavy' || heavy ? 'heavy' : (opts.kind === 'kick' ? 'kick' : 'jab'));
  hitstopT = Math.max(hitstopT, (opts.hitstop || 0.05) + (counter ? 0.025 : 0));
  if (heavy || counter) shakeAmp = Math.max(shakeAmp, (opts.shake || 0) + (counter && heavy ? 0.03 : 0));
  if (def.hp <= 0) { def.hp = 0; koSequence(att, def); return; }
  const knock = opts.knock || (counter && dmg >= 10);
  const hitClip = knock ? 'knock' : (zone === 'head' ? 'hitH' : 'hitL');
  def.state = knock ? 'knock' : 'hitstun'; def.stateT = 0;
  def.play(hitClip, { loop: false, clamp: true, fade: 0.04 });
}
function koSequence(winner, loser) {
  loser.state = 'death'; loser.stateT = 0;
  loser.play('death', { loop: false, clamp: true, fade: 0.06 });
  loser.vx = winner.face * 1.2;
  slowmoT = 1.15; hitstopT = 0.12; shakeAmp = 0.22;
  AudioSys.ko();
  document.getElementById('koFlash').style.opacity = 1;
  setTimeout(() => document.getElementById('koFlash').style.opacity = 0, 420);
  endRound(winner, 'K.O.');
}

/* ---------------- fighters ---------------- */
/* ===== FROG ARENA 2 — the game's 10 ORIGINAL colorful frog warriors =====
   This game is its own thing: the fighters are original characters
   created for Frog Arena 2 (the future 1,000-warrior mint game) —
   they belong to no existing collection. Names, classes, titles ours;
   each warrior's painted portrait (warriors/*.webp) is the select-
   screen art and future mint art; in the arena the picked warrior IS
   the 3D colorful frog model, tinted/armored per character. */
const SPEC2 = {
  rise: 'TOAD RISE', sweep: 'NIGHT SWEEP', dash: 'SWAMP DASH', orb: 'BOG ORB',
  kingRise: 'SOLAR RISE', kingSweep: 'ECLIPSE SWEEP', kingDash: 'COMET DASH', kingOrb: 'NOVA ORB',
};
const ROSTER = [
  { id: 'king', name: 'KING CROAKMORE', title: 'THE CROWNED SOVEREIGN', cls: 'CROWNED KING', art: 'king.webp',
    stats: { power: 5, speed: 3, range: 4 }, sparkColor: 0xffc44d, ultKind: 'barrage', maxHp: 130, aiStyle: 'brawler', aiMul: 0.82,
    specNames: { rise: 'SOLAR RISE', sweep: 'ECLIPSE SWEEP', dash: 'COMET DASH', orb: 'NOVA ORB' },
    style: 'The crowned sovereign of the colosseum. Solar specials, red-and-gold armor, the full crown.',
    skin: { body: 0x66bb44, belly: 0xf2e6b8, spot: 0x3f8f2f, armor: 0xc22424, trim: 0xf2b13c, cape: 0xb01e28, headgear: 'crown', iris: 0xff9a1f, gem: 0x27c46a, emblem: 'sun', tassets: true } },
  { id: 'queen', name: 'QUEEN VESPERA', title: 'THE VIOLET REGENT', cls: 'WARRIOR QUEEN', art: 'queen.webp',
    stats: { power: 4, speed: 4, range: 4 }, sparkColor: 0xb98cff, ultKind: 'barrage', maxHp: 115, aiStyle: 'zoner', aiMul: 0.9,
    specNames: SPEC2, style: 'The roster\'s warrior queen. Bright violet armor, gold crown, magenta cape.',
    skin: { body: 0x4caf3f, belly: 0xe4f2c8, spot: 0x2f7a2a, armor: 0x7d3fd1, trim: 0xf2b13c, cape: 0xc22a72, headgear: 'crown', gem: 0xb98cff, iris: 0xffb03a, female: true, emblem: 'moon', tassets: true } },
  { id: 'princess', name: 'PRINCESS ROSALIE', title: 'THE ROSE PRINCESS', cls: 'ROYAL PRINCESS', art: 'princess.webp',
    stats: { power: 3, speed: 5, range: 3 }, sparkColor: 0xff9ecb, ultKind: 'combo', maxHp: 100, aiStyle: 'speed', aiMul: 0.95,
    specNames: SPEC2, style: 'The young rose princess. Small, fast, bright rose-pink armor and tiara.',
    skin: { body: 0x7ed957, belly: 0xf7f3d0, spot: 0x4da332, armor: 0xe7548f, trim: 0xf7a8b8, cape: 0xff4d8d, headgear: 'rosecrown', iris: 0xff9a1f, female: true, scale: 0.93, emblem: 'rose', tassets: true } },
  { id: 'ember', name: 'EMBERLORD KAEL', title: 'THE EMBERLORD', cls: 'EMBER KNIGHT', art: 'ember.webp',
    stats: { power: 5, speed: 2, range: 3 }, sparkColor: 0xff7a2a, ultKind: 'combo', maxHp: 120, aiStyle: 'brawler', aiMul: 0.88,
    specNames: SPEC2, style: 'The ember knight. Heavy hits, flame crest, bright flame-red armor.',
    skin: { body: 0x6f8f3a, belly: 0xe8dfae, spot: 0x4a6423, armor: 0xd93a1e, trim: 0xffa62b, cape: 0x8e1f16, headgear: 'flamecrest', iris: 0xff5a1f, glow: true, emblem: 'skull', tassets: true, legArmor: true } },
  { id: 'shadow', name: 'NYX THE SHADOWBLADE', title: 'MASTER OF SHADOWS', cls: 'SHADOW ASSASSIN', art: 'shadow.webp',
    stats: { power: 4, speed: 5, range: 4 }, sparkColor: 0x35e0d0, ultKind: 'barrage', maxHp: 110, aiStyle: 'speed', aiMul: 0.9,
    specNames: SPEC2, style: 'Master of shadows. Electric-blue dart frog, purple crystal armor, glowing cyan eyes.',
    skin: { body: 0x1e9be0, belly: 0xd8ecf5, spot: 0xff8c1a, armor: 0x5b2ea6, trim: 0x2ee6d6, cape: 0x241457, headgear: 'hood', iris: 0x2ee6d6, pupil: 0x063a34, glow: true, emblem: 'rune' } },
  { id: 'captain', name: 'CAPTAIN DELMAR', title: 'THE TIDE CAPTAIN', cls: 'WAR CAPTAIN', art: 'captain.webp',
    stats: { power: 4, speed: 3, range: 5 }, sparkColor: 0x4da6ff, ultKind: 'barrage', maxHp: 110, aiStyle: 'zoner', aiMul: 0.95,
    specNames: SPEC2, style: 'The tide captain. Tropical turquoise armor, feather plume, long-range orbs.',
    skin: { body: 0x2fae5f, belly: 0xeef5d8, spot: 0x1c7a40, armor: 0x12a5b8, trim: 0xff7a59, cape: 0x0e7a86, headgear: 'plume', plume: 0xff6b4a, iris: 0xffb03a, emblem: 'skull', tassets: true } },
  { id: 'nightblade', name: 'NIGHTBLADE VOSS', title: 'BLADE OF THE NIGHT WATCH', cls: 'NIGHT WARRIOR', art: 'nightblade.webp',
    stats: { power: 4, speed: 4, range: 3 }, sparkColor: 0x8b5cf6, ultKind: 'combo', maxHp: 105, aiStyle: 'speed', aiMul: 1.0,
    specNames: SPEC2, style: 'Blade of the night watch. Vivid orange-bronze armor, fast hands.',
    skin: { body: 0x5da244, belly: 0xeef0cd, spot: 0x3c7031, armor: 0xe07b24, trim: 0xffd23c, cape: 0x7a2a5e, headgear: 'circlet', iris: 0xd23b3b, emblem: 'none' } },
  { id: 'soldier', name: 'GRUMM THE BULWARK', title: 'THE FRONT-LINE BULWARK', cls: 'HEAVY SOLDIER', art: 'soldier.webp',
    stats: { power: 3, speed: 4, range: 2 }, sparkColor: 0xa8e063, ultKind: 'combo', maxHp: 105, aiStyle: 'balanced', aiMul: 1.05,
    specNames: SPEC2, style: 'Front-line bulwark. Big pauldrons, bright red-and-gold armor, no cape.',
    skin: { body: 0x55a83e, belly: 0xe9efc4, spot: 0x3a7031, armor: 0xc22424, trim: 0xf2b13c, cape: null, iris: 0xff9a1f, emblem: 'skull', tassets: true, legArmor: true } },
  { id: 'starknight', name: 'STELLARIS', title: 'THE STAR KNIGHT', cls: 'STAR KNIGHT', art: 'starknight.webp',
    stats: { power: 3, speed: 3, range: 3 }, sparkColor: 0x2fb8d8, ultKind: 'combo', maxHp: 102, aiStyle: 'balanced', aiMul: 1.1,
    specNames: SPEC2, style: 'The star knight. Pearl-white armor, glowing teal trim.',
    skin: { body: 0x4da653, belly: 0xe6f2d8, spot: 0x2f7038, armor: 0xdfe9ee, trim: 0x2fb8d8, cape: 0x3a7bd5, headgear: 'starcrown', iris: 0xffb03a, glow: true, emblem: 'star', tassets: true, legArmor: true } },
  { id: 'brawler', name: 'BRAMBLE', title: 'THE OLD POND BRAWLER', cls: 'VETERAN BRAWLER', art: 'brawler.webp',
    stats: { power: 2, speed: 2, range: 2 }, sparkColor: 0x7fe07a, ultKind: 'combo', maxHp: 100, aiStyle: 'balanced', aiMul: 1.2,
    specNames: SPEC2, style: 'The old pond brawler. Warm bronze armor, rust-red cape, honest fists.',
    skin: { body: 0x7f9a4a, belly: 0xefe6c4, spot: 0x5c7038, armor: 0xb5762e, trim: 0xe8c87a, cape: 0xa83a28, iris: 0xd8b25a, emblem: 'skull' } },
];
let pickFighter = ROSTER[0], cpuFighter = ROSTER[9];
let P1 = new Fighter(slotCfg(ROSTER[0], -1.7));
let P2 = new Fighter(slotCfg(ROSTER[9], 1.7));
const FIGHTERS = [P1, P2];
function foe(f) { return f === P1 ? P2 : P1; }
function hexCss(c) { return '#' + c.toString(16).padStart(6, '0'); }
function updateLegend() {
  const fmt = sn => `↑ ${sn.rise} ↓ ${sn.sweep}<br>→ ${sn.dash} ← ${sn.orb}`;
  $('legend1').innerHTML = fmt(P1.cfg.specNames);
  $('legend2').innerHTML = fmt(P2.cfg.specNames);
}
function slotCfg(r, startX) {
  return {
    key: r.id, id: r.id, name: r.name, title: r.title,
    cls: r.cls, skin: r.skin,
    specNames: r.specNames, ultKind: r.ultKind, sparkColor: r.sparkColor,
    maxHp: r.maxHp, aiStyle: r.aiStyle, aiMul: r.aiMul,
    kit: FC.kitFromStats(r.stats), startX,
  };
}
function refreshFaceoff() {
  $('vsName1').textContent = P1.cfg.name; $('vsTitle1').textContent = P1.cfg.title;
  $('vsName2').textContent = P2.cfg.name; $('vsTitle2').textContent = P2.cfg.title;
  $('name1').textContent = P1.cfg.name; $('title1').textContent = P1.cfg.title;
  $('name2').textContent = P2.cfg.name; $('title2').textContent = P2.cfg.title;
  document.documentElement.style.setProperty('--p1', '#' + new THREE.Color(P1.cfg.sparkColor).getHexString());
  document.documentElement.style.setProperty('--p2', '#' + new THREE.Color(P2.cfg.sparkColor).getHexString());
  updateLegend();
}
async function applySelection() {
  const want1 = slotCfg(pickFighter, -1.7), want2 = slotCfg(cpuFighter, 1.7);
  if (P1.cfg.key !== want1.key) { P1.cfg = want1; P1.maxHp = want1.maxHp; P1.hp = want1.maxHp; await P1.load(); }
  if (P2.cfg.key !== want2.key) { P2.cfg = want2; P2.maxHp = want2.maxHp; P2.hp = want2.maxHp; await P2.load(); }
  refreshFaceoff();
}
function buildSelectCards() {
  const row = $('selectRow'); row.innerHTML = '';
  for (const r of ROSTER) {
    const b = document.createElement('button');
    b.className = 'fcard' + (r === pickFighter ? ' sel' : '');
    b.dataset.id = r.id;
    const bars = ['power', 'speed', 'range'].map(k =>
      `<div class="sbar"><span>${k.slice(0, 3).toUpperCase()}</span><i style="width:${r.stats[k] * 20}%"></i></div>`).join('');
    b.innerHTML =
      `<img class="fart" alt="" src="warriors/${r.art}">` +
      `<b>${r.name}</b><small>${r.cls}</small>${bars}<p>${r.style}</p>` +
      (r === cpuFighter ? `<em class="cpuTag">${FC.t('cpuTag')}</em>` : '');
    b.onclick = () => {
      pickFighter = r;
      if (cpuFighter === pickFighter) { const rest = ROSTER.filter(x => x !== pickFighter); cpuFighter = rest[Math.floor(Math.random() * rest.length)]; }
      buildSelectCards();
      applySelection();
    };
    row.appendChild(b);
  }
}
/* ---------------- input ---------------- */
const keys = {};
addEventListener('keydown', e => {
  keys[e.code] = true;
  if (['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'Space'].includes(e.code)) e.preventDefault();
  AudioSys.init();
});
addEventListener('keyup', e => { keys[e.code] = false; });
const touchState = {};
if ('ontouchstart' in window) document.body.classList.add('touch');
document.querySelectorAll('.tbtn').forEach(b => {
  const k = b.dataset.k;
  const on = e => { e.preventDefault(); AudioSys.init(); touchState[k] = true; };
  const off = e => { e.preventDefault(); touchState[k] = false; };
  b.addEventListener('pointerdown', on);
  b.addEventListener('pointerup', off);
  b.addEventListener('pointerleave', off);
  b.addEventListener('pointercancel', off);
});
/* ---------------- control scheme: joystick (default) | button pad ---------------- */
const stickBase = document.getElementById('stickBase');
const stickKnob = document.getElementById('stickKnob');
const stickZone = document.getElementById('stickZone');
const stick = { id: null, cx: 0, cy: 0, t0: 0 };
function stickReset() {
  stick.id = null;
  stickKnob.style.transform = '';
  // send the base HOME: a tap (double-tap worst) used to leave the
  // joystick parked wherever it landed, because the anchor styles were
  // never cleared on release
  stickBase.style.left = ''; stickBase.style.top = ''; stickBase.style.bottom = '';
  touchState.left = touchState.right = touchState.down = touchState.up = false;
}
function stickVector(dx, dy) {
  const R = 46, len = Math.hypot(dx, dy);
  if (len > R) { dx *= R / len; dy *= R / len; }
  stickKnob.style.transform = `translate(${dx}px,${dy}px)`;
  // tap-jitter guard: in the first 70 ms after anchoring, a small drift
  // is finger noise on a tap, not steering — it could cross the jump
  // threshold for a frame and make the fighter hop on a plain tap
  if (performance.now() - stick.t0 < 70 && len < 30) { dx = 0; dy = 0; }
  touchState.left = dx < -15; touchState.right = dx > 15;
  touchState.down = dy > 20; touchState.up = dy < -20;
}
stickZone.addEventListener('pointerdown', e => {
  if (stick.id !== null) return;
  AudioSys.init();
  stick.id = e.pointerId; stick.cx = e.clientX; stick.cy = e.clientY; stick.t0 = performance.now();
  try { stickZone.setPointerCapture(e.pointerId); } catch (err) { }
  stickBase.style.left = (e.clientX - 62) + 'px';
  stickBase.style.top = (e.clientY - 62) + 'px';
  stickBase.style.bottom = 'auto';
  stickVector(0, 0);
  e.preventDefault();
});
stickZone.addEventListener('pointermove', e => {
  if (e.pointerId === stick.id) stickVector(e.clientX - stick.cx, e.clientY - stick.cy);
});
const stickEnd = e => { if (e.pointerId === stick.id) stickReset(); };
stickZone.addEventListener('pointerup', stickEnd);
stickZone.addEventListener('pointercancel', stickEnd);
// if capture is lost without an up/cancel (OS gesture, shade pull,
// capture failure), the id used to stay set forever: every later touch
// was ignored by the guard and any held direction stuck on
stickZone.addEventListener('lostpointercapture', stickEnd);
addEventListener('blur', () => { if (stick.id !== null) stickReset(); });

let ctlMode = 'stick';
try { if (localStorage.getItem('farena2.controls') === 'pad') ctlMode = 'pad'; } catch (e) { }
function applyCtlMode() {
  document.body.classList.toggle('ctl-pad', ctlMode === 'pad');
  document.body.classList.toggle('ctl-stick', ctlMode !== 'pad');
  document.querySelectorAll('.ctl-opt').forEach(b => b.classList.toggle('sel', b.dataset.mode === ctlMode));
  const hint = document.getElementById('ctlHint');
  if (hint) hint.textContent = ctlMode === 'pad'
    ? FC.t('hintPad')
    : FC.t('hintStick');
  for (const k in touchState) touchState[k] = false;
  stickReset();
}
document.querySelectorAll('.ctl-opt').forEach(b => b.addEventListener('click', () => {
  ctlMode = b.dataset.mode === 'pad' ? 'pad' : 'stick';
  try { localStorage.setItem('farena2.controls', ctlMode); } catch (e) { }
  AudioSys.init(); applyCtlMode();
}));
applyCtlMode();

const pressed = { jab: false, hook: false, kick: false, spec: false, jump: false };
function readPlayerInput() {
  const inp = {
    left: !!(keys.KeyA || keys.ArrowLeft || touchState.left),
    right: !!(keys.KeyD || keys.ArrowRight || touchState.right),
    down: !!(keys.KeyS || keys.ArrowDown || touchState.down),
    jump: !!(keys.KeyW || keys.ArrowUp || touchState.up),
    blockKey: !!(keys.ShiftLeft || keys.ShiftRight || touchState.block),
    jab: !!(keys.KeyJ || touchState.jab), hook: !!(keys.KeyK || touchState.hook),
    kick: !!(keys.KeyL || touchState.kick), spec: !!(keys.KeyU || touchState.spec),
  };
  for (const k of ['jab', 'hook', 'kick', 'spec', 'jump']) { inp[k + 'Hit'] = inp[k] && !pressed[k]; pressed[k] = inp[k]; }
  return inp;
}

/* ---------------- per-fighter update ---------------- */
const STAGE_MIN = -3.6, STAGE_MAX = 3.6;
/* Body separation: the two roots may never come closer than MIN_SEP, so
   the bodies can touch but never interpenetrate. Runs after every
   movement update (walk, slide, dash, knockback all included), splits
   the push symmetrically, and hands the leftover to the free fighter
   when one is pinned at a stage edge. group.position is re-synced here
   so the correction is what the same frame actually renders. Strike
   reach is unaffected: jab connects up to ~1.02 root gap, cross ~0.91,
   kick ~1.50 — a 0.62 floor keeps every strike landing on the surface. */
const MIN_SEP = 0.62;
function separateFighters() {
  const a = P1, b = P2;
  const d = b.x - a.x;
  if (Math.abs(d) >= MIN_SEP) return;
  const dir = d === 0 ? (a.face >= 0 ? 1 : -1) : Math.sign(d);
  const sep = () => (b.x - a.x) * dir;
  const need = MIN_SEP - sep();
  a.x -= dir * need / 2; b.x += dir * need / 2;
  const ca = THREE.MathUtils.clamp(a.x, STAGE_MIN, STAGE_MAX);
  if (ca !== a.x) { a.x = ca; b.x += dir * (MIN_SEP - sep()); }
  const cb = THREE.MathUtils.clamp(b.x, STAGE_MIN, STAGE_MAX);
  if (cb !== b.x) { b.x = cb; a.x -= dir * (MIN_SEP - sep()); }
  a.x = THREE.MathUtils.clamp(a.x, STAGE_MIN, STAGE_MAX);
  b.x = THREE.MathUtils.clamp(b.x, STAGE_MIN, STAGE_MAX);
  a.group.position.x = a.x; b.group.position.x = b.x;
}
function fighterUpdate(f, dt, input) {
  const o = foe(f);
  f.stateT += dt;
  if (f.react) f.react.t += dt;
  // gravity / jump physics
  if (f.y > 0 || f.vy > 0) {
    f.vy -= 21 * dt; f.y += f.vy * dt;
    if (f.y <= 0) { f.y = 0; f.vy = 0; if (f.state === 'jump') { f.state = 'idle'; f.play('idle'); } }
  }
  // pushback velocity decay
  if (Math.abs(f.vx) > 0.01 && f.state !== 'special') {
    f.x += f.vx * dt; f.vx *= Math.max(0, 1 - 9 * dt);
  } else if (f.state === 'special' && f.specKind === 'dash') {
    // handled in special branch below
  } else f.vx = 0;
  f.blocking = false; f.crouching = false;

  const busy = ['attack', 'special', 'ultimate', 'hitstun', 'blockstun', 'knock', 'death', 'win'].includes(f.state);
  if (!busy && game.phase === 'fight') {
    const toward = (f.face > 0 && input.right) || (f.face < 0 && input.left);
    const away = (f.face > 0 && input.left) || (f.face < 0 && input.right);
    const threat = (o.state === 'attack' || o.state === 'special') && dist(f, o) < 1.7;
    if (input.blockKey || (away && threat)) {
      f.blocking = true;
      if (f.state !== 'block') { f.state = 'block'; f.play('block', { fade: 0.06 }); }
    } else if (input.specHit) {
      // SPEC is read BEFORE crouch/jump: the direction the player is
      // holding (up/down) selects the special, so those stances must not
      // swallow the press first. Direction comes from the live input
      // vector (AI passes specDir explicitly; players get it from the
      // held stick/pad/keys).
      startSpecial(f, input.specDir || specKindFromInput(input));
    } else if (input.down) {
      f.crouching = true;
      if (f.state !== 'crouch') { f.state = 'crouch'; f.play('crouch', { fade: 0.06 }); }
    } else if (input.jumpHit && f.y === 0) {
      f.state = 'jump'; f.vy = 8.2; f.play('jump', { loop: false, clamp: true, fade: 0.05 });
    } else if (input.jabHit) startAttack(f, 'jab');
    else if (input.hookHit) startAttack(f, 'heavy');
    else if (input.kickHit) startAttack(f, 'kick');
    else if (toward || away) {
      const dir = toward ? f.face : -f.face;
      f.x += dir * 1.75 * f.cfg.kit.moveMul * dt;
      if (f.state !== 'walk') { f.state = 'walk'; f.play('walk', { timeScale: toward ? 1 : -1, fade: 0.08 }); }
      else if (f.current) f.current.timeScale = toward ? 1 : -1;
    } else if (f.state !== 'idle') { f.state = 'idle'; f.play('idle'); }
  }
  // blocking flag while in blockstun too
  if (f.state === 'block') f.blocking = true;
  if (f.state === 'crouch') f.crouching = true;

  // state progression
  if (f.state === 'attack' && f.atk) {
    const a = f.atk, o2 = o;
    if (a.slide) {
      // slide travel + kick1 -> kick2 chain
      if (f.stateT > 0.1 && f.stateT < 0.62) f.x += f.face * 3.3 * dt;
      if (f.stateT > 0.16 && f.currentKey !== 'kick2' && !f.atkHitDone) f.play('kick2', { loop: false, clamp: true, fade: 0.03 });
    }
    if (!f.atkHitDone) {
      if (f.stateT >= a.startup && f.stateT <= a.startup + a.active) {
        if (dist(f, o2) < 1.9) {
          const c = limbContact(f, o2, a.limb);
          if (c) {
            f.atkHitDone = true;
            resolveHit(f, o2, a.dmg, a.push, { gain: a.gain, hitstop: a.hitstop, shake: a.shake, heavy: a.dmg >= 10, kind: f.atkKey, contact: c });
          }
        } else { f.bonePos(f.limbBones[a.limb], _limb); if (!f.prevLimb) f.prevLimb = _limb.clone(); else f.prevLimb.copy(_limb); }
      } else if (f.stateT < a.startup) {
        // track the limb through the wind-up so the first active frame
        // sweeps from the limb's true previous position (no tunneling)
        f.bonePos(f.limbBones[a.limb], _limb); if (!f.prevLimb) f.prevLimb = _limb.clone(); else f.prevLimb.copy(_limb);
      }
    }
    const total = Math.max(f.dur(f.atk.clip) * 0.92, a.startup + a.active + 0.18);
    if (f.stateT >= total) { f.state = 'idle'; f.atk = null; f.play('idle', { fade: 0.07 }); }
  }
  if (f.state === 'special') {
    if (f.specKind === 'dash') {
      const total = f.dur(dashClipKey(f));
      if (f.stateT < 0.34) f.x += f.face * f.cfg.kit.dashPow * dt;
      if (!f.atkHitDone && f.stateT > 0.1 && dist(f, o) < 1.9) {
        const c = limbContact(f, o, 'body', 0.22); // the whole body is the weapon on a dash; 0.22 because a clean pass at the 0.62 floor measured +0.02..+0.03 short at 0.16 — the visible torso mass reaches past the spine point
        if (c) {
          f.atkHitDone = true;
          const fin = f.ult && f.ult.finisher; // ultimate's finisher dash is a light 4-dmg cap (rawDmg: never kit-scaled)
          resolveHit(f, o, fin ? 4 : f.cfg.kit.dashDmg, 2.4, { gain: 8, hitstop: 0.13, shake: 0.16, heavy: true, knock: true, kind: 'special', contact: c, rawDmg: !!fin });
        }
      }
      if (f.stateT >= total * 0.95) { f.state = 'idle'; f.play('idle', { fade: 0.08 }); }
    } else if (f.specKind === 'rise') {
      // LAUNCHER: short step-in while the hop (vy set in beginSpecial)
      // carries the cross upward. The fist's swept path is tracked from
      // the wind-up so the first active frame can't tunnel.
      const total = Math.max(f.dur('heavy') * 0.95, 0.72);
      if (f.stateT < 0.30) f.x += f.face * 4.6 * dt;
      if (!f.atkHitDone) {
        if (f.stateT >= 0.10 && f.stateT <= 0.55 && dist(f, o) < 2.0) {
          const c = limbContact(f, o, 'heavy', 0.10);
          if (c) {
            f.atkHitDone = true;
            resolveHit(f, o, f.cfg.kit.riseDmg, 1.5, { gain: 10, hitstop: 0.12, shake: 0.15, heavy: true, knock: true, kind: 'special', contact: c, rawDmg: true });
            if (o.state === 'knock') o.vy = Math.max(o.vy, 7.6); // LAUNCH — the pop-up is the point of the move
          }
        } else if (f.stateT < 0.10) {
          f.bonePos(f.limbBones.heavy, _limb); if (!f.prevLimb) f.prevLimb = _limb.clone(); else f.prevLimb.copy(_limb);
        }
      }
      if (f.stateT >= total) { f.state = 'idle'; f.play('idle', { fade: 0.08 }); }
    } else if (f.specKind === 'sweep') {
      // GROUND SWEEP: the kick slide stretched into a long low dash —
      // Slide_Loop pins the lead foot at floor height, the contact test
      // reads it against the leg capsule ('low' zone), and a connect
      // trips (knock). Dust puffs trail the slide along the floor.
      if (f.stateT > 0.14 && f.currentKey !== 'kick2' && !f.atkHitDone) f.play('kick2', { loop: false, clamp: true, fade: 0.03 });
      if (f.stateT > 0.06 && f.stateT < 0.55) {
        f.x += f.face * f.cfg.kit.sweepPow * dt;
        f.specFxT = (f.specFxT || 0) + dt;
        if (f.specFxT > 0.05) { f.specFxT = 0; puff(_v1.set(f.x + f.face * 0.3, 0.12, 0), 0.4, 0xbfb096, 0.35); }
      }
      if (!f.atkHitDone) {
        if (f.stateT >= 0.12 && f.stateT <= 0.66 && dist(f, o) < 2.0) {
          const c = limbContact(f, o, 'kick', 0.10);
          if (c) {
            f.atkHitDone = true;
            resolveHit(f, o, f.cfg.kit.sweepDmg, 2.1, { gain: 10, hitstop: 0.11, shake: 0.13, heavy: true, knock: true, kind: 'special', contact: c, rawDmg: true });
            puff(_v1.set(o.x, 0.15, 0), 0.75, 0xcfc4b0, 0.5); // dust burst at the tripped feet
          }
        } else if (f.stateT < 0.12) {
          f.bonePos(f.limbBones.kick, _limb); if (!f.prevLimb) f.prevLimb = _limb.clone(); else f.prevLimb.copy(_limb);
        }
      }
      if (f.stateT >= 0.85) { f.state = 'idle'; f.play('idle', { fade: 0.08 }); }
    } else {
      if (!f.specDone && f.stateT >= 0.34) {
        f.specDone = true;
        f.bonePos(f.handBone, _v1); _v1.y = Math.max(_v1.y, 1.25); _v1.z = 0;
        spawnOrb(f, _v1.clone(), f.cfg.kit.orbDmg);
      }
      if (f.stateT >= f.dur('throw') * 0.95) { f.state = 'idle'; f.play('idle', { fade: 0.08 }); }
    }
  }
  if (f.ult) updateUltimate(f, dt);
  if (f.state === 'hitstun' && f.stateT > (f.currentKey === 'hitH' ? 0.42 : 0.3)) { f.state = 'idle'; f.play('idle', { fade: 0.06 }); }
  if (f.state === 'blockstun' && f.stateT > 0.2) { f.state = 'idle'; f.play('idle', { fade: 0.05 }); }
  if (f.state === 'knock' && f.stateT > f.dur('knock') + 0.55) { f.state = 'idle'; f.play('idle', { fade: 0.1 }); }
  if (f.state === 'block' && game.phase === 'fight' && !input.blockKey && !input._aiBlock) { f.state = 'idle'; f.play('idle', { fade: 0.06 }); }

  f.x = THREE.MathUtils.clamp(f.x, STAGE_MIN, STAGE_MAX);
  f.group.position.x = f.x;
  f.group.position.y = f.y;
  if (f.state !== 'death') { f.face = foe(f).x >= f.x ? 1 : -1; f.applyFacing(); }
  f.updatePose(dt);
}

/* ---------------- AI ---------------- */
function aiInput(f, dt) {
  const o = foe(f);
  const inp = { left: false, right: false, down: false, jump: false, blockKey: false, jab: false, hook: false, kick: false, spec: false, specDir: null, _aiBlock: false };
  inp.jabHit = inp.hookHit = inp.kickHit = inp.specHit = inp.jumpHit = false;
  if (game.phase !== 'fight' || ['death', 'win'].includes(f.state)) return inp;
  f.aiTimer -= dt;
  const d = dist(f, o);
  const towardKey = f.face > 0 ? 'right' : 'left';
  const awayKey = f.face > 0 ? 'left' : 'right';
  // reactive block: opponent just started an attack nearby
  if ((o.state === 'attack' || o.state === 'special') && o.stateT < 0.16 && d < 1.6 && Math.random() < 0.62) f.aiBlockT = 0.34;
  if (f.aiBlockT > 0) { f.aiBlockT -= dt; inp.blockKey = true; inp._aiBlock = true; return inp; }
  if (f.aiHoldT > 0) { f.aiHoldT -= dt; if (f.aiAction) inp[f.aiAction] = true; return inp; }
  if (f.aiTimer <= 0) {
    f.aiTimer = (0.13 + Math.random() * 0.14) * (f.cfg.aiMul || 1);
    f.aiAction = null;
    const hurt = f.hp < 28;
    // Directional-special selection: a per-band rotation guarantees the
    // AI cycles ALL FOUR moves over a match (front-loaded so the first
    // spends in a band are all distinct kinds), and metered specials are
    // capped at 8 per match so totals stay in the proven ~5-8 band —
    // past the cap the AI saves the bar for the ULTIMATE instead.
    const specTotal = f.stats.specDash + f.stats.specOrb + f.stats.specRise + f.stats.specSweep;
    const canSpec = f.meter >= SPEC_COST && (f.meter >= 100 || specTotal < 8);
    const rot = (band, arr) => { const i = f.aiRot[band] || 0; f.aiRot[band] = i + 1; return arr[i % arr.length]; };
    // per-fighter AI flavour (roster kits): the zoner hangs back and
    // shoots, the brawler walks you down, the speedster darts in and out
    const fid = f.cfg.aiStyle || 'balanced';
    const farArr = fid === 'brawler' ? ['dash', 'orb', 'dash'] : fid === 'speed' ? ['dash', 'orb', 'dash', 'orb'] : ['orb', 'dash', 'orb'];
    const midArr = fid === 'speed' ? ['dash', 'dash', 'orb', 'rise'] : fid === 'brawler' ? ['dash', 'rise', 'dash', 'sweep'] : ['dash', 'orb', 'rise', 'dash'];
    if (d > 2.7) {
      // long range: ORB leads the rotation, DASH is the surprise closer;
      // a full bar means ULTIMATE — spend it, direction moot
      if (canSpec && Math.random() < (f.meter >= 100 ? 0.55 : 0.42)) { inp.specHit = true; inp.specDir = rot('far', farArr); }
      else if (fid === 'zoner' && Math.random() < 0.45) { f.aiAction = awayKey; f.aiHoldT = 0.22; } // zoner keeps her range
      else { f.aiAction = towardKey; f.aiHoldT = 0.24; }
    } else if (d > 1.18) {
      const r = Math.random();
      if (canSpec && (f.meter >= 100 ? r < 0.4 : r < 0.32)) { inp.specHit = true; inp.specDir = rot('mid', midArr); }
      else if (r < 0.24) { inp.kickHit = true; }
      else if (r < 0.34 && hurt) { f.aiAction = awayKey; f.aiHoldT = 0.3; }
      else { f.aiAction = towardKey; f.aiHoldT = 0.2; }
    } else {
      const r = Math.random();
      if (f.meter >= 100 && r < 0.18) { inp.specHit = true; inp.specDir = 'dash'; } // point-blank ULTIMATE (direction moot at a full bar)
      else if (canSpec && f.meter < 100 && r < (f.meter >= 75 ? 0.28 : 0.22)) { inp.specHit = true; inp.specDir = rot('close', ['rise', 'sweep', 'dash', 'orb', 'sweep', 'rise']); } // close-range special: launcher / sweep / dash / orb rotation
      else if (r < 0.42) inp.jabHit = true;
      else if (r < 0.64) inp.hookHit = true;
      else if (r < 0.78) inp.kickHit = true;
      else if (r < (fid === 'brawler' ? 0.82 : 0.88)) { f.aiAction = awayKey; f.aiHoldT = 0.26; } // the brawler rarely backs off
      else { inp.blockKey = true; inp._aiBlock = true; f.aiBlockT = 0.3; }
    }
  }
  if (f.aiAction) inp[f.aiAction] = true;
  return inp;
}

/* ---------------- match flow ---------------- */
const game = { phase: 'boot', round: 1, timer: 60, phaseT: 0, winner: null, ultCamT: 0 };
const $ = id => document.getElementById(id);
function showBanner(main, sub = '', hold = 0.85) {
  const m = $('bannerMain'), s = $('bannerSub');
  m.textContent = main; s.textContent = sub;
  m.className = ''; s.className = '';
  void m.offsetWidth;
  m.classList.add('pop'); s.classList.add('pop');
  clearTimeout(showBanner._t);
  showBanner._t = setTimeout(() => { m.classList.add('fadeout'); s.classList.add('fadeout'); }, hold * 1000);
}
function resetFighter(f) {
  f.hp = f.maxHp || 100; f.meter = 0; f.x = f.cfg.startX; f.vx = 0; f.y = 0; f.vy = 0;
  f.state = 'idle'; f.stateT = 0; f.atk = null; f.aiBlockT = 0; f.aiAction = null;
  f.specKind = null; f.ult = null;
  f.react = null; f.prevLimb = null;
  f.face = f.cfg.startX < 0 ? 1 : -1; f.applyFacing(); f.play('idle');
  f.group.position.set(f.x, 0, 0);
}
function startMatch() {
  $('hud').style.display = 'block';
  P1.roundsWon = 0; P2.roundsWon = 0; game.round = 1;
  P1.stats = { specDash: 0, specOrb: 0, specRise: 0, specSweep: 0, ult: 0 }; P2.stats = { specDash: 0, specOrb: 0, specRise: 0, specSweep: 0, ult: 0 };
  $('rematch').style.display = 'none';
  startRound();
}
function startRound() {
  resetFighter(P1); resetFighter(P2);
  for (const p of projectiles) fxGroup.remove(p.grp);
  projectiles.length = 0;
  game.timer = QA_MODE === 'auto' ? 30 : 60;
  game.phase = 'intro'; game.phaseT = 0;
  P1.play('win'); P2.play('win');
  updatePips();
  showBanner(FC.t('round') + ' ' + game.round, 'FIRST TO 2', 1.0);
}
function endRound(winner, how) {
  if (game.phase === 'roundEnd' || game.phase === 'matchEnd') return;
  game.phase = 'roundEnd'; game.phaseT = 0; game.winner = winner;
  winner.roundsWon++;
  updatePips();
  if (how === 'K.O.') showBanner(FC.t('ko'), '', 1.4);
  else showBanner(FC.t('timeUp'), winner.cfg.name, 1.4);
  if (winner.state !== 'death') { winner.state = 'win'; winner.play('win', { fade: 0.15 }); }
}
function updatePips() {
  for (const [el, f] of [[$('pips1'), P1], [$('pips2'), P2]]) {
    [...el.children].forEach((pip, i) => pip.classList.toggle('won', i < f.roundsWon));
  }
}
function updateHUD() {
  for (const [f, hpEl, ghostEl, meterEl, specEl] of [[P1, $('hp1'), $('ghost1'), $('meter1'), $('specNext1')], [P2, $('hp2'), $('ghost2'), $('meter2'), $('specNext2')]]) {
    const v = Math.max(0, f.hp) / (f.maxHp || 100);
    hpEl.style.transform = `scaleX(${v})`;
    ghostEl.style.transform = `scaleX(${v})`;
    hpEl.classList.toggle('low', f.hp <= 25 && f.hp > 0);
    meterEl.style.width = f.meter + '%';
    meterEl.classList.toggle('ready', f.meter >= SPEC_COST && f.meter < 100);
    meterEl.classList.toggle('ult', f.meter >= 100);
    if (specEl) specEl.textContent = f.meter >= 100 ? FC.t('ultReady') : '';
  }
  const t = Math.max(0, Math.ceil(game.timer));
  $('timer').textContent = t;
  $('timer').classList.toggle('hurry', t <= 10 && game.phase === 'fight');
  $('pauseBtn').style.display = (!QA_MODE && !paused && (game.phase === 'fight' || game.phase === 'intro')) ? 'block' : 'none';
}

/* ---------------- pause ---------------- */
let paused = false;
$('pauseBtn').addEventListener('click', () => {
  if (game.phase !== 'fight' && game.phase !== 'intro') return;
  paused = true; $('pauseMenu').style.display = 'flex'; AudioSys.init();
});
$('resumeBtn').addEventListener('click', () => { paused = false; $('pauseMenu').style.display = 'none'; });
$('quitBtn').addEventListener('click', () => {
  paused = false; $('pauseMenu').style.display = 'none';
  resetFighter(P1); resetFighter(P2);
  applySelection();
  game.phase = 'menu'; game.winner = null;
  $('rematch').style.display = 'none';
  $('hud').style.display = 'none';
  $('menu').style.display = 'flex';
  updatePips(); updateHUD();
});

/* ---------------- camera ---------------- */
const camTarget = new THREE.Vector3();
function updateCamera(dt, t) {
  const mid = (P1.x + P2.x) / 2;
  const sep = Math.abs(P1.x - P2.x);
  // Distance that fits (separation + body margin) inside the horizontal FOV
  // at the current aspect; in portrait it pulls the camera back until BOTH
  // fighters are in frame.
  // Owner (Nov 4): "make the characters a little bigger, closer up" — the
  // fit margin and floor were tightened ~15-18% at fighting range in both
  // orientations. The portrait wide cap (14) is untouched, so the
  // full-separation pull-back behaves exactly as before.
  // Visual pass (Nov 6): tightened again for the reference framing —
  // FOV 38->41 / 50->52, margin 0.85*sep+1.45 -> 0.80*sep+1.10, base
  // 2.65+0.56*sep -> 2.05+0.50*sep, floor 4.0 -> 3.1 (landscape). At
  // fighting range the camera sits ~25-28% closer than the specials
  // build. (Portrait cap/fit rules corrected Nov 7 — see below.)
  const fitK = 2 * Math.tan(camera.fov * Math.PI / 360) * (innerWidth / innerHeight);
  // the fit width must cover the FULL span of both bodies around the
  // anchor (the camera looks at mid*0.75, not mid): a standing body
  // reaches ~0.48 from its root, but a KNOCKED-DOWN or dead body lies
  // ~1.55 long — a knockdown at the stage edge used to slide half out
  // of frame. The old 0.80*sep+1.10 budget is also less than the
  // separation itself past sep ~5.5, which pushed edge fighters out.
  const ext = f => (f.state === 'knock' || f.state === 'death') ? 1.55 : 0.48;
  const spanL = Math.min(P1.x - ext(P1), P2.x - ext(P2));
  const spanR = Math.max(P1.x + ext(P1), P2.x + ext(P2));
  const anchor0 = mid * 0.75;
  const needSpan = 2 * Math.max(anchor0 - spanL, spanR - anchor0);
  const needW = Math.max(sep * 0.80 + 1.10, needSpan);
  const distFit = THREE.MathUtils.clamp(needW, 2.6, 10.4) / fitK;
  // the portrait cap must never override distFit: on narrow phones
  // (aspect ~0.41) a full stage-width separation needs ~17 units, and
  // the old flat 14 cap pushed both fighters out of the frame — the
  // cap now only ever RAISES the fit distance, never lowers it
  const distC = THREE.MathUtils.clamp(Math.max(2.05 + sep * 0.50, distFit), 3.1, isPortrait ? Math.max(14, distFit) : 7.4);
  // Camera MOTION (owner, Nov 4: "move the camera around — 360 or even
  // 180"): the camera orbits an anchor point by angle theta. During the
  // FIGHT it only sways +-13 deg on a slow 26 s cycle and NEVER crosses
  // to the back side, so facing and left/right controls never flip. The
  // big arcs play where they can't hurt play: a fly-in arc on the round
  // intro, a 165 deg sweep around the winner on round/match end, and a
  // slow +-35 deg arc on the menu.
  let anchorX = mid * 0.75, baseX = mid * 0.6, baseY = isPortrait ? 1.9 : 1.32, dist = distC, theta = 0;
  if (game.phase === 'menu') {
    anchorX = 0; baseX = 0; baseY = isPortrait ? 1.8 : 1.35;
    // menu keeps the wider establishing distance (old fit): at +-1.7 the
    // fighters' idle limbs graze the frame edge at the fight distance,
    // especially mid-arc — the menu is a billboard, not the fight framing
    dist = isPortrait ? Math.max(7.4, (3.4 * 0.92 + 1.9) / fitK) : 7.4;
    theta = THREE.MathUtils.degToRad(35) * Math.sin(t * 0.11);
  } else if (game.phase === 'roundEnd' || game.phase === 'matchEnd') {
    const w = game.winner || P1;
    anchorX = w.x; baseX = w.x; baseY = isPortrait ? 1.8 : 1.3;
    dist = isPortrait ? 7.0 : 4.0;
    const k = Math.min(1, game.phaseT / 4.2); // phaseT runs 0-2.8 in roundEnd, keeps counting in matchEnd
    const ease = k * k * (3 - 2 * k);
    theta = THREE.MathUtils.degToRad(165) * ease * (w.face > 0 ? 1 : -1); // sweep toward the fallen foe's side
    dist *= 1 - 0.28 * Math.pow(Math.sin(theta), 2); // pull in at side angles: stays inside the pillar ring / clear of the gate
  } else if (game.phase === 'intro') {
    const k = Math.min(1, game.phaseT / 1.45);
    const ease = 1 - Math.pow(1 - k, 3);
    theta = THREE.MathUtils.degToRad(58) * (1 - ease); // fly-in arc, settled at 0 as FIGHT! lands
  } else if (game.phase === 'fight') {
    theta = THREE.MathUtils.degToRad(13) * Math.sin(game.phaseT * (Math.PI * 2 / 26));
  }
  // ULTIMATE beat: while an ultimate runs, swing to a dramatic
  // three-quarter angle on the user and push in ~12% — brief, then the
  // normal fight framing (or the round-end sweep) takes back over.
  if (game.ultCamT > 0 && game.phase === 'fight') {
    const ua = P1.ult ? P1 : (P2.ult ? P2 : null);
    if (ua) {
      const k = Math.min(1, game.ultCamT / 0.55);
      anchorX = ua.x * 0.7 + foe(ua).x * 0.3; baseX = anchorX;
      theta = THREE.MathUtils.degToRad(38) * Math.sin(k * Math.PI) * ua.face;
      dist *= 0.88;
    }
  }
  const ox = baseX - anchorX, st = Math.sin(theta), ct = Math.cos(theta);
  camTarget.set(anchorX + ox * ct + dist * st, baseY, -ox * st + dist * ct);
  camera.position.lerp(camTarget, 1 - Math.pow(0.0015, dt));
  if (shakeAmp > 0.002) {
    camera.position.x += (Math.random() - .5) * shakeAmp * 0.35;
    camera.position.y += (Math.random() - .5) * shakeAmp * 0.3;
    shakeAmp *= Math.pow(0.0001, dt);
  } else shakeAmp = 0;
  camera.lookAt(anchorX, isPortrait ? 0.8 : 1.02, 0);
}

/* ---------------- main loop ---------------- */
const clock = new THREE.Clock();
let elapsed = 0;
function animate() {
  requestAnimationFrame(animate);
  let rawDt = Math.min(clock.getDelta(), 0.05);
  elapsed += rawDt;
  if (paused) { renderer.render(scene, camera); return; }
  let dt = rawDt;
  if (slowmoT > 0) { slowmoT -= rawDt; dt *= 0.25; }
  if (hitstopT > 0) { hitstopT -= rawDt; dt = 0; }

  // ambient life
  const ep = embers.geometry.attributes.position;
  for (let i = 0; i < ep.count; i++) {
    let y = ep.getY(i) + rawDt * (0.14 + (i % 5) * 0.03);
    if (y > 7.5) y = 0;
    ep.setY(i, y);
    ep.setX(i, ep.getX(i) + Math.sin(elapsed * 0.7 + i) * rawDt * 0.12);
  }
  ep.needsUpdate = true;
  flames.forEach((fl, i) => {
    const b = fl.userData.base || 1.4;
    const s = b + Math.sin(elapsed * 9 + i * 1.7) * 0.18 * (b / 1.4) + Math.sin(elapsed * 23 + i) * 0.08;
    fl.scale.set(s, s * 1.3, 1);
  });
  // banner cloth wave (visual pass): cheap vertex sway, hem swings most
  for (const b of banners) {
    const posA = b.cloth.geometry.attributes.position;
    for (let i = 0; i < posA.count; i++) {
      const vx = posA.getX(i), vy = posA.getY(i);
      const hang = (1.25 - vy) / 2.5;
      posA.setZ(i, Math.sin(elapsed * 2.2 + b.phase + vx * 2.4 + hang * 3.2) * 0.09 * hang);
    }
    posA.needsUpdate = true;
  }
  // set dressing motion: holo ring pulses, torch flames flicker
  for (const s of searchlights) {
    s.beam.rotation.z = Math.sin(elapsed * 0.35 + s.phase) * 0.35;
    s.beam.rotation.x = 1.12 + Math.cos(elapsed * 0.27 + s.phase) * 0.14;
  }
  if (holoRing) { holoRing.rotation.z = elapsed * 0.15; holoRing.material.opacity = 0.38 + Math.sin(elapsed * 2.2) * 0.14; }
  if (gateRing) gateRing.rotation.z -= rawDt * 0.06;
  // energy trails (visual pass): dash/sweep specials drag their colour;
  // orbs shed sparks as they fly
  for (const f of FIGHTERS) {
    if (f.state === 'special' && (f.specKind === 'dash' || f.specKind === 'sweep')) {
      f.fxTrailT = (f.fxTrailT || 0) + rawDt;
      if (f.fxTrailT > 0.028) {
        f.fxTrailT = 0;
        puff(_v1.set(f.x - f.face * 0.15, 0.95 + f.y, 0), 0.55, f.cfg.sparkColor, 0.4);
      }
    }
  }
  for (const p of projectiles) if (Math.random() < 0.65) burst(p.grp.position, p.owner.cfg.sparkColor, 1, 0.5, 0.15);
  underGlow.intensity = 11 + Math.sin(elapsed * 2.3) * 2.2;

  const SUB = QA_MODE === 'auto' ? 6 : 1; // QA-only: substep the sim so a full match completes under slow software rendering
  for (let _s = 0; _s < SUB; _s++) {
  if (game.phase !== 'boot') {
    game.phaseT += rawDt;
    game.ultCamT = Math.max(0, game.ultCamT - rawDt);
    if (game.phase === 'intro' && game.phaseT > 1.45) {
      game.phase = 'fight'; game.phaseT = 0;
      showBanner(FC.t('fightWord'), '', 0.55); AudioSys.bell();
      P1.play('idle'); P2.play('idle'); P1.state = 'idle'; P2.state = 'idle';
    }
    if (game.phase === 'fight') {
      game.timer -= dt;
      if (game.timer <= 0) {
        game.timer = 0;
        endRound(P1.hp >= P2.hp ? P1 : P2, 'TIME');
      }
    }
    if (game.phase === 'roundEnd' && game.phaseT > 2.8) {
      if (P1.roundsWon >= 2 || P2.roundsWon >= 2) {
        game.phase = 'matchEnd';
        if (P1.roundsWon >= 2) showBanner(P1.cfg.name + ' WINS', FC.t('matchWon'), 2.6);
        else showBanner(P2.cfg.name + ' WINS', FC.t('defeated'), 2.6);
        if (!QA_MODE) $('rematch').style.display = 'block';
      } else { game.round++; startRound(); }
    }
    if (game.__dirtest && game.phase === 'fight' && P1.state === 'idle' && P1.meter < SPEC_COST) P1.meter = 60; // QA-only: keep the dirtest driver supplied
    if (qaImpact && game.phase === 'fight') {
      qaImpact.t += dt;
      const attF = qaImpact.att2 ? P2 : P1;
      if (!qaImpact.fired && qaImpact.t > 1.15) {
        qaImpact.fired = true;
        if (qaImpact.ult) startUltimate(attF);
        else if (qaImpact.spec) { startSpecial(attF, qaImpact.spec); }
        else startAttack(attF, qaImpact.atk);
      }
      if (qaImpact.ult) { // freeze once the ultimate's whole sequence completes
        if (qaImpact.fired && !attF.ult && attF.state === 'idle' && qaImpact.t > 1.4) game.phase = 'frozen';
        else if (qaImpact.t > 12) game.phase = 'frozen';
      }
      else if (qaImpact.fired && window.__lastHit && performance.now() - window.__lastHit.at > qaImpact.freezeMs) game.phase = 'frozen';
      else if (qaImpact.whiff && qaImpact.fired && attF.state === 'attack' && attF.atk && attF.stateT >= attF.atk.startup + attF.atk.active * 0.55) game.phase = 'frozen';
      else if (qaImpact.spec && qaImpact.fired && attF.state === 'idle' && qaImpact.t > 1.5 && projectiles.length === 0) game.phase = 'frozen'; // a live orb is still travelling — don't freeze the scene out from under it (USTC's short throw clip idles long before her orb lands)
      else if (qaImpact.t > 5 && !qaImpact.spec) game.phase = 'frozen';
      else if (qaImpact.t > 8) game.phase = 'frozen';
    }
    if (game.phase !== 'frozen' && (dt > 0 || game.phase === 'roundEnd' || game.phase === 'matchEnd')) {
      let inp, ai;
      if (qaImpact) {
        const blockInp = { blockKey: true, _aiBlock: true };
        inp = qaImpact.att2 && qaImpact.block ? blockInp : {};
        ai = !qaImpact.att2 && qaImpact.block ? blockInp : {};
      }
      else if (QA_MODE === 'auto') { inp = aiInput(P1, dt); ai = aiInput(P2, dt); }
      else if (qaHoldInputs) { inp = {}; ai = {}; }
      else if (qaHoldAI) { inp = readPlayerInput(); ai = {}; }
      else { inp = readPlayerInput(); ai = aiInput(P2, dt); }
      fighterUpdate(P1, dt, game.phase === 'fight' ? inp : {});
      fighterUpdate(P2, dt, game.phase === 'fight' ? ai : {});
      // body separation: roots never closer than MIN_SEP, render-synced
      separateFighters();
      // projectiles
      for (let i = projectiles.length - 1; i >= 0; i--) {
        const p = projectiles[i];
        p.grp.position.x += p.vx * dt; p.life -= dt;
        p.grp.children[0].rotation.x += dt * 9;
        const target = foe(p.owner);
        const tp = target.bonePos(target.chestBone, _v2);
        if (p.homing && target.state !== 'death') { // steer toward the chest, capped so it still reads as a projectile
          const maxStep = 3.0 * dt;
          p.grp.position.y += Math.max(-maxStep, Math.min(maxStep, tp.y - p.grp.position.y));
          p.grp.position.z += Math.max(-maxStep, Math.min(maxStep, tp.z - p.grp.position.z));
        }
        if (target.state !== 'death' && p.grp.position.distanceTo(tp) < 0.52) {
          resolveHit(p.owner, target, p.dmg || 12, 2.0, { gain: 6, hitstop: 0.1, shake: 0.13, heavy: true, knock: true, kind: 'orb' });
          p.life = 0;
        }
        if (p.life <= 0 || Math.abs(p.grp.position.x) > 5.2) {
          burst(p.grp.position, p.owner.cfg.sparkColor, 10, 1.8, 0.8);
          fxGroup.remove(p.grp); projectiles.splice(i, 1);
        }
      }
    } else {
      
    }
    updateHUD();
  }
  }
  updateSparks(rawDt);
  updateSlashes(rawDt);
  updatePuffs(rawDt);
  updateFlashes(rawDt);
  for (const f of FIGHTERS) applyReaction(f);
  updateCamera(rawDt, elapsed);
  renderer.render(scene, camera);

  if (qaProbe) qaProbeSample();
  if (QA_MODE) {
    const el = document.getElementById('qaState');
    el.textContent = JSON.stringify({
      probe: window.__probe || undefined,
      phase: game.phase, round: game.round, timer: Math.round(game.timer * 10) / 10,
      hp: [Math.round(P1.hp), Math.round(P2.hp)], wins: [P1.roundsWon, P2.roundsWon],
      states: [P1.state, P2.state], xs: [Math.round(P1.x * 100) / 100, Math.round(P2.x * 100) / 100], errors: window.__errs,
      spec: [{ dash: P1.stats.specDash, orb: P1.stats.specOrb, rise: P1.stats.specRise, sweep: P1.stats.specSweep, ult: P1.stats.ult, meter: Math.round(P1.meter), kind: P1.specKind, inUlt: !!P1.ult }, { dash: P2.stats.specDash, orb: P2.stats.specOrb, rise: P2.stats.specRise, sweep: P2.stats.specSweep, ult: P2.stats.ult, meter: Math.round(P2.meter), kind: P2.specKind, inUlt: !!P2.ult }], ultCam: game.ultCamT > 0,
      roster: [P1.cfg.id, P2.cfg.id], orbs: projectiles.map(p => ({ vx: Math.round(p.vx * 10) / 10, life: Math.round(p.life * 10) / 10, dmg: p.dmg, owner: p.owner.cfg.id })),
      lastHit: window.__lastHit || null, surf: Math.round(P1.atkMinSurf * 100) / 100, surf2: Math.round(P2.atkMinSurf * 100) / 100,
      draws: renderer.info.render.calls, tris: renderer.info.render.triangles,
      dbg: { cam: camera.position.toArray().map(v => Math.round(v * 100) / 100), mh: [P1.measuredH, P2.measuredH], mn: [P1.measuredMin, P2.measuredMin], gs: [P1.group.scale.x, P2.group.scale.x], ph: [P1.posedH, P2.posedH], arm: [P1.armInfo, P2.armInfo] },
    });
  }
}

/* ===== FROG ARENA 2 — boot + QA harness =====
   (Keyboard, touch buttons, the floating stick, control-scheme
   toggle, pause and mute are all wired in the engine's input
   section above — unchanged from Arena Clash 3D.) */
let qaImpact = null; // scripted live-sim impact scene state (QA only)
let qaProbe = null, qaHoldInputs = false, qaHoldAI = false;
function qaProbeSample() {
  if (!qaProbe || !P1 || !P2) return;
  const s = qaProbe;
  s.frames++;
  for (const [f, o] of [[P1, s.p1], [P2, s.p2]]) {
    if (f.y > o.peakY) o.peakY = f.y;
    if (f.y < -0.001) o.belowFloor = true;
    const st = f.state + (f.state === 'attack' && f.atk ? ':' + f.atk.name : '');
    if (st !== o.lastState) { o.states.push(st); o.lastState = st; }
  }
  window.__probe = {
    frames: s.frames, p1: s.p1, p2: s.p2,
    hp: [P1.hp, P2.hp], rounds: [P1.roundsWon, P2.roundsWon],
    phase: game.phase, round: game.round, timer: game.timer,
    errs: window.__errs,
  };
}
function freezePose(f, key, at) {
  f.play(key, { loop: false, clamp: true });
  if (f.current) f.current.time = at;
}
/* Impact scenes: fighters placed, the engine fires the scripted
   move at t>1.15 and freezes on the hit — screenshot gold. */
const IMPACT_SCENES = {
  impactjab: { p1: -0.95, p2: 0.15, qa: { atk: 'jab', freezeMs: 90 } },
  impacthook: { p1: -0.95, p2: 0.15, qa: { atk: 'heavy', freezeMs: 90 } },
  impactkick: { p1: -1.0, p2: 0.2, qa: { atk: 'kick', freezeMs: 90 } },
  impactblock: { p1: -0.95, p2: 0.15, qa: { atk: 'jab', freezeMs: 90, block: true } },
  whiffjab: { p1: -1.7, p2: 0.6, qa: { atk: 'jab', whiff: true, freezeMs: 90 } },
  impactspdash: { p1: -2.3, p2: 0.4, meter: 60, qa: { spec: 'dash', freezeMs: 90 } },
  impactsporb: { p1: -1.7, p2: 0.6, meter: 60, qa: { spec: 'orb', freezeMs: 90 } },
  spekrise: { p1: -0.9, p2: 0.2, meter: 60, qa: { spec: 'rise', freezeMs: 90 } },
  specsweep: { p1: -0.9, p2: 0.2, meter: 60, qa: { spec: 'sweep', freezeMs: 90 } },
  impactult: { p1: -1.9, p2: 0.5, meter: 100, qa: { ult: true, freezeMs: 90 } },
};
async function setupQA() {
  const scene = QA_MODE;
  const hideMenu = () => { $('menu').style.display = 'none'; $('hud').style.display = 'flex'; $('controls').style.display = 'flex'; };
  if (scene.startsWith('roster:')) {
    const n = Math.max(0, Math.min(ROSTER.length - 1, parseInt(scene.slice(7), 10) || 0));
    pickFighter = ROSTER[n];
    cpuFighter = ROSTER[(n + 5) % ROSTER.length];
    buildSelectCards();
    await applySelection();
    hideMenu();
    startMatch();
    qaProbe = { frames: 0, p1: { peakY: 0, belowFloor: false, states: [], lastState: '' }, p2: { peakY: 0, belowFloor: false, states: [], lastState: '' } };
  }
  if (scene === 'auto') {
    hideMenu();
    startMatch();
    qaProbe = { frames: 0, p1: { peakY: 0, belowFloor: false, states: [], lastState: '' }, p2: { peakY: 0, belowFloor: false, states: [], lastState: '' } };
  } else if (scene === 'select') {
    game.phase = 'menu';
    $('loading').style.display = 'none';
    $('menu').style.display = 'flex';
  } else if (scene === 'faceoff') {
    $('loading').style.display = 'none';
    $('versus').style.display = 'flex';
    refreshFaceoff();
    game.phase = 'faceoff';
  } else if (scene === 'exchange' || scene === 'wide') {
    hideMenu();
    game.phase = 'fight'; game.roundPhase = 'fight';
    P1.x = scene === 'wide' ? -2.6 : -0.85; P2.x = scene === 'wide' ? 2.6 : 0.85;
    P1.face = 1; P2.face = -1; P1.applyFacing(); P2.applyFacing();
    P1.group.position.x = P1.x; P2.group.position.x = P2.x;
    freezePose(P1, 'heavy', 0.34); freezePose(P2, 'hitH', 0.2);
    P1.limbBones.heavy.getWorldPosition(_v1);
    burst(_v1.x, _v1.y, 0, P2.cfg.sparkColor, 16, 3.2);
    slashArc(_v1.x, _v1.y, 0, P1.face, P2.cfg.sparkColor);
    game.phase = 'frozen';
  } else if (IMPACT_SCENES[scene]) {
    const sc = IMPACT_SCENES[scene];
    hideMenu();
    game.phase = 'fight'; game.roundPhase = 'fight'; game.phaseT = 0;
    P1.x = sc.p1; P2.x = sc.p2; P1.y = 0; P2.y = 0;
    P1.face = 1; P2.face = -1; P1.applyFacing(); P2.applyFacing();
    P1.group.position.x = P1.x; P2.group.position.x = P2.x;
    if (sc.meter) P1.meter = sc.meter;
    P1.play('idle'); P2.play('idle');
    qaImpact = Object.assign({ t: 0, fired: false }, sc.qa);
    qaProbe = { frames: 0, p1: { peakY: 0, belowFloor: false, states: [], lastState: '' }, p2: { peakY: 0, belowFloor: false, states: [], lastState: '' } };
    updateHUD();
  }
}

/* ---------- flow buttons ---------- */
document.getElementById('fightBtn').addEventListener('click', async () => {
  AudioSys.init(); AudioSys.bell();
  const btn = document.getElementById('fightBtn');
  btn.disabled = true;
  const old = btn.textContent;
  btn.textContent = 'LOADING…';
  try { await applySelection(); } catch (e) { console.warn('fighter load failed', e); }
  btn.disabled = false; btn.textContent = old;
  document.getElementById('menu').style.display = 'none';
  startMatch();
});
document.getElementById('rematch').addEventListener('click', () => {
  AudioSys.init();
  $('versus').style.display = 'none';
  startMatch();
});

/* ---------- boot ---------- */
(async () => {
  try {
    setLoad(0.15, 'RAISING THE RUINS');
    await P1.load();
    setLoad(0.55, 'ARMORING THE CHAMPIONS');
    await P2.load();
    buildSelectCards();
    await applySelection();
    setLoad(0.9, 'LIGHTING THE TORCHES');
    if (QA_MODE) { await setupQA(); if (QA_MODE !== 'select' && QA_MODE !== 'faceoff') $('loading').style.display = 'none'; }
    else {
      const others = ROSTER.filter(r => r !== pickFighter);
      cpuFighter = others[Math.floor(Math.random() * others.length)];
      buildSelectCards();
      await applySelection();
      game.phase = 'menu';
      $('loading').style.display = 'none';
      $('menu').style.display = 'flex';
    }
    setLoad(1, 'READY');
    window.__ready = true;
    animate();
  } catch (err) {
    setLoad(1, 'ERROR — ' + (err && err.message ? err.message : err));
    window.__hud = 'BOOT ERROR: ' + (err && err.stack ? err.stack : err);
    console.error(err);
  }
})();