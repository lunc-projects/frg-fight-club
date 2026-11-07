import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';

/* ============================================================
   BATTLE FORCE — Command Battle-Dome
   Characters & animations: Quaternius UBC + UAL (CC0 1.0)
   Engine: three.js r160 (MIT). All game code/art direction original.
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
scene.fog = new THREE.FogExp2(0x060a0c, 0.022);

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
scene.add(new THREE.HemisphereLight(0x9fd8d2, 0x0c1410, 0.55));
const keyLight = new THREE.DirectionalLight(0xffd9a8, 2.6);
keyLight.position.set(4.5, 8, 5);
keyLight.castShadow = true;
keyLight.shadow.mapSize.set(2048, 2048);
keyLight.shadow.camera.left = -6; keyLight.shadow.camera.right = 6;
keyLight.shadow.camera.top = 7; keyLight.shadow.camera.bottom = -3;
keyLight.shadow.camera.far = 30; keyLight.shadow.bias = -0.0004;
scene.add(keyLight);
const rimLight = new THREE.DirectionalLight(0x2fd8c8, 2.0);
rimLight.position.set(-5, 4.5, -6);
scene.add(rimLight);
// soft frontal fill (visual pass, Nov 6): lifts faces/chests toward the
// closer camera so the fighters read with more presence
const fillLight = new THREE.DirectionalLight(0xd6f2ec, 0.55);
fillLight.position.set(-3.5, 2.2, 6.5);
scene.add(fillLight);
const underGlow = new THREE.PointLight(0x2fd8c8, 12, 12, 1.8);
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
const floorTex = canvasTex(1024, 1024, (x, w, h) => {
  // BATTLE FORCE deck (conversion, Nov 7): gunmetal hangar plates with
  // rivets and a teal holo-grid burned into the surface — a command-dome
  // floor, not colosseum stone. All procedural canvas work, original.
  x.fillStyle = '#10151a'; x.fillRect(0, 0, w, h);
  const plate = 128;
  for (let py = 0; py < h / plate; py++) for (let px = 0; px < w / plate; px++) {
    const v = (Math.random() - 0.5) * 14;
    x.fillStyle = `rgb(${20 + v},${26 + v},${32 + v})`;
    x.fillRect(px * plate + 2, py * plate + 2, plate - 4, plate - 4);
    x.fillStyle = 'rgba(200,220,230,0.20)';
    for (const [rx, ry] of [[11, 11], [plate - 11, 11], [11, plate - 11], [plate - 11, plate - 11]]) {
      x.beginPath(); x.arc(px * plate + rx, py * plate + ry, 3, 0, 7); x.fill();
    }
  }
  x.strokeStyle = 'rgba(47,216,200,0.15)'; x.lineWidth = 2;
  for (let i = 0; i <= w; i += 64) {
    x.beginPath(); x.moveTo(i, 0); x.lineTo(i, h); x.stroke();
    x.beginPath(); x.moveTo(0, i); x.lineTo(w, i); x.stroke();
  }
  x.strokeStyle = 'rgba(0,0,0,.35)'; x.lineWidth = 1.4;
  for (let i = 0; i < 220; i++) {
    const px = Math.random() * w, py = Math.random() * h;
    x.beginPath(); x.moveTo(px, py);
    x.lineTo(px + (Math.random() - .5) * 70, py + (Math.random() - .5) * 70); x.stroke();
  }
  for (let i = 0; i < 2400; i++) {
    x.fillStyle = `rgba(255,255,255,${Math.random() * 0.05})`;
    x.fillRect(Math.random() * w, Math.random() * h, 2, 2);
  }
  const rg = x.createRadialGradient(w / 2, h / 2, 120, w / 2, h / 2, 512);
  rg.addColorStop(0, 'rgba(0,0,0,0)'); rg.addColorStop(1, 'rgba(0,0,0,0.42)');
  x.fillStyle = rg; x.fillRect(0, 0, w, h);
  // hazard ring + holo inlay ring around the emblem
  x.save(); x.translate(w / 2, h / 2);
  x.strokeStyle = 'rgba(255,179,64,0.50)'; x.lineWidth = 10; x.setLineDash([46, 26]);
  x.beginPath(); x.arc(0, 0, 318, 0, 7); x.stroke(); x.setLineDash([]);
  x.strokeStyle = 'rgba(47,216,200,0.35)'; x.lineWidth = 3;
  x.beginPath(); x.arc(0, 0, 296, 0, 7); x.stroke();
  x.restore();
  // BIG LUNA CLASSIC deck print (house branding rule: the words must be
  // there, crescent alone is not enough). Worn stencilled paint in the
  // same rotated frame as before (cylinder-cap UVs swap the axes).
  x.save();
  x.translate(w / 2, h / 2); x.rotate(-Math.PI / 2);
  x.strokeStyle = 'rgba(232,228,218,0.17)'; x.lineWidth = 10;
  x.beginPath(); x.arc(0, 0, 222, 0, 7); x.stroke();
  x.lineWidth = 4; x.strokeStyle = 'rgba(232,228,218,0.14)';
  x.beginPath(); x.arc(0, 0, 192, 0, 7); x.stroke();
  x.fillStyle = 'rgba(242,237,224,0.48)';
  x.beginPath(); x.arc(0, -108, 104, 0, 7); x.fill();
  x.globalCompositeOperation = 'destination-out';
  x.globalAlpha = 0.94;
  x.beginPath(); x.arc(50, -132, 90, 0, 7); x.fill();
  x.globalCompositeOperation = 'source-over';
  x.globalAlpha = 1;
  x.fillStyle = 'rgba(242,237,224,0.6)';
  x.textAlign = 'center'; x.textBaseline = 'middle';
  x.font = '900 96px Arial, sans-serif';
  x.fillText('LUNA', 0, 60);
  x.font = '900 82px Arial, sans-serif';
  x.fillText('CLASSIC', 0, 146);
  x.font = '700 37px Arial, sans-serif';
  x.fillStyle = 'rgba(255,196,77,0.55)';
  x.fillText('LUNC DEV STUDIO', 0, 196);
  x.restore();
  // sponsor rim band: LUNC wordmarks repeated around the deck edge
  x.save();
  x.translate(w / 2, h / 2); x.rotate(-Math.PI / 2);
  x.fillStyle = 'rgba(159,232,255,0.14)';
  x.font = '900 44px Arial, sans-serif'; x.textAlign = 'center'; x.textBaseline = 'middle';
  for (let i = 0; i < 10; i++) {
    const a = (i / 10) * Math.PI * 2;
    x.save(); x.rotate(a); x.translate(0, -424); x.fillText('LUNC', 0, 0); x.restore();
  }
  x.restore();
  // scuff the print so it reads as worn paint, not a fresh sticker
  x.save();
  x.globalCompositeOperation = 'destination-out';
  for (let i = 0; i < 300; i++) {
    x.globalAlpha = 0.05 + Math.random() * 0.12;
    const px = w / 2 + (Math.random() - .5) * 580, py = h / 2 + (Math.random() - .5) * 580;
    x.fillRect(px, py, 4 + Math.random() * 42, 2 + Math.random() * 5);
  }
  x.restore();
});
floorTex.wrapS = floorTex.wrapT = THREE.ClampToEdgeWrapping;
const skyTex = canvasTex(1024, 512, (x, w, h) => {
  const g = x.createLinearGradient(0, 0, 0, h);
  g.addColorStop(0, '#020608'); g.addColorStop(0.42, '#06222b');
  g.addColorStop(0.68, '#0a3644'); g.addColorStop(0.86, '#7a4a1e'); g.addColorStop(1, '#10100a');
  x.fillStyle = g; x.fillRect(0, 0, w, h);
  for (let i = 0; i < 340; i++) {
    x.fillStyle = `rgba(255,255,255,${0.25 + Math.random() * 0.7})`;
    const r = Math.random() * 1.6 + 0.3;
    x.beginPath(); x.arc(Math.random() * w, Math.random() * h * 0.5, r, 0, 7); x.fill();
  }
  for (let i = 0; i < 46; i++) {
    const cx = Math.random() * w, cy = h * 0.16 + Math.random() * h * 0.4, r = 40 + Math.random() * 120;
    const rg = x.createRadialGradient(cx, cy, 0, cx, cy, r);
    rg.addColorStop(0, 'rgba(4,18,20,0.5)'); rg.addColorStop(1, 'rgba(4,18,20,0)');
    x.fillStyle = rg; x.beginPath(); x.arc(cx, cy, r, 0, 7); x.fill();
  }
}, { nearest: true });
const glowTex = canvasTex(128, 128, (x, w, h) => {
  const g = x.createRadialGradient(64, 64, 2, 64, 64, 62);
  g.addColorStop(0, 'rgba(255,255,255,1)'); g.addColorStop(0.35, 'rgba(255,255,255,.5)');
  g.addColorStop(1, 'rgba(255,255,255,0)');
  x.fillStyle = g; x.fillRect(0, 0, w, h);
}, { nearest: true });
/* Visual pass (Nov 6) — new procedural textures, all original: a painted
   crescent moon, an arcade wall, and the two war banners that flank the
   gate (gold crescent for LUNC, azure star for USTC). BATTLE FORCE
   conversion (Nov 7): the moon is now a radar dish face, the wall a
   steel hangar, and the banners carry rank chevrons + the new name. */
const radarTex = canvasTex(512, 512, (x, w, h) => {
  // BATTLE FORCE (conversion, Nov 7): a painted radar dish face — steel
  // bowl, panel rings, amber feed receiver — replaces the crescent moon.
  x.clearRect(0, 0, w, h);
  const g = x.createRadialGradient(256, 256, 40, 256, 256, 250);
  g.addColorStop(0, 'rgba(47,216,200,0.20)'); g.addColorStop(1, 'rgba(47,216,200,0)');
  x.fillStyle = g; x.fillRect(0, 0, w, h);
  x.save(); x.translate(256, 250);
  const dg = x.createLinearGradient(-160, -140, 160, 160);
  dg.addColorStop(0, '#dfe9ee'); dg.addColorStop(0.6, '#9fb2bc'); dg.addColorStop(1, '#5f7480');
  x.fillStyle = dg;
  x.beginPath(); x.ellipse(0, 0, 168, 118, -0.5, 0, 7); x.fill();
  x.strokeStyle = 'rgba(20,30,36,0.65)'; x.lineWidth = 5;
  x.beginPath(); x.ellipse(0, 0, 168, 118, -0.5, 0, 7); x.stroke();
  x.strokeStyle = 'rgba(20,30,36,0.30)'; x.lineWidth = 3;
  x.beginPath(); x.ellipse(0, 0, 118, 80, -0.5, 0, 7); x.stroke();
  x.beginPath(); x.ellipse(0, 0, 66, 44, -0.5, 0, 7); x.stroke();
  x.strokeStyle = '#39434a'; x.lineWidth = 12;
  x.beginPath(); x.moveTo(0, 0); x.lineTo(88, -96); x.stroke();
  x.fillStyle = '#ffb340'; x.beginPath(); x.arc(92, -100, 15, 0, 7); x.fill();
  x.fillStyle = 'rgba(47,216,200,0.9)'; x.beginPath(); x.arc(92, -100, 6, 0, 7); x.fill();
  x.restore();
}, { nearest: true });
const wallTex = canvasTex(2048, 512, (x, w, h) => {
  // BATTLE FORCE hangar wall (conversion, Nov 7): riveted steel panels,
  // teal viewport slits, stencilled BATTLE FORCE / LUNA CLASSIC boards
  // and an amber hazard band — a military command dome, not a colosseum.
  const g = x.createLinearGradient(0, 0, 0, h);
  g.addColorStop(0, '#161d24'); g.addColorStop(0.55, '#10161d'); g.addColorStop(1, '#090d12');
  x.fillStyle = g; x.fillRect(0, 0, w, h);
  const bays = 16, bw = w / bays;
  for (let i = 0; i < bays; i++) {
    const bx = i * bw;
    x.fillStyle = 'rgba(0,0,0,0.5)'; x.fillRect(bx, 0, 4, h); x.fillRect(bx + bw - 4, 0, 4, h);
    x.fillStyle = 'rgba(190,225,235,0.06)'; x.fillRect(bx + 4, 0, 2, h);
    x.fillStyle = 'rgba(200,220,230,0.22)';
    for (const ry of [14, h * 0.30, h * 0.72, h - 16]) {
      x.beginPath(); x.arc(bx + 13, ry, 3, 0, 7); x.fill();
      x.beginPath(); x.arc(bx + bw - 13, ry, 3, 0, 7); x.fill();
    }
    // viewport slit with teal glow
    const vx = bx + bw * 0.18, vw = bw * 0.64, vy = h * 0.50, vh = h * 0.13;
    x.fillStyle = '#04141a'; x.fillRect(vx - 5, vy - 5, vw + 10, vh + 10);
    const vg = x.createLinearGradient(0, vy, 0, vy + vh);
    vg.addColorStop(0, 'rgba(47,216,200,0.40)'); vg.addColorStop(1, 'rgba(20,90,110,0.25)');
    x.fillStyle = vg; x.fillRect(vx, vy, vw, vh);
    x.fillStyle = 'rgba(4,10,12,0.85)'; x.fillRect(vx + vw / 2 - 3, vy, 6, vh);
    // stencil boards (venue branding): alternating BATTLE FORCE / LUNA CLASSIC
    x.textAlign = 'center'; x.textBaseline = 'middle';
    x.font = '900 30px Arial, sans-serif';
    x.fillStyle = 'rgba(255,196,77,0.34)';
    x.fillText(i % 2 ? 'LUNA CLASSIC' : 'BATTLE FORCE', bx + bw / 2, h * 0.145);
    x.font = '700 15px Arial, sans-serif';
    x.fillStyle = 'rgba(200,235,240,0.20)';
    x.fillText('LUNC DEV STUDIO', bx + bw / 2, h * 0.205);
    const v = (Math.random() - 0.5) * 12;
    x.fillStyle = `rgba(${v > 0 ? 210 : 0},${v > 0 ? 230 : 0},${v > 0 ? 235 : 10},${Math.abs(v) / 255})`;
    x.fillRect(bx + 4, h * 0.66, bw - 8, h * 0.20);
  }
  x.strokeStyle = 'rgba(0,0,0,0.55)'; x.lineWidth = 3;
  for (const fy of [0.30, 0.72]) { x.beginPath(); x.moveTo(0, h * fy); x.lineTo(w, h * fy); x.stroke(); }
  x.fillStyle = 'rgba(0,0,0,0.45)'; x.fillRect(0, h * 0.235, w, 6);
  // hazard stripe band along the foot of the wall
  x.save(); x.beginPath(); x.rect(0, h * 0.90, w, h * 0.07); x.clip();
  x.fillStyle = '#0b0d10'; x.fillRect(0, h * 0.90, w, h * 0.07);
  x.fillStyle = 'rgba(255,179,64,0.55)';
  for (let sx = -40; sx < w + 40; sx += 56) {
    x.beginPath();
    x.moveTo(sx, h * 0.97); x.lineTo(sx + 28, h * 0.90); x.lineTo(sx + 56, h * 0.90); x.lineTo(sx + 28, h * 0.97);
    x.closePath(); x.fill();
  }
  x.restore();
  for (let i = 0; i < 5200; i++) {
    x.fillStyle = `rgba(255,255,255,${Math.random() * 0.045})`;
    x.fillRect(Math.random() * w, Math.random() * h, 2, 2);
  }
  for (let i = 0; i < 700; i++) {
    x.fillStyle = `rgba(0,0,0,${Math.random() * 0.16})`;
    x.fillRect(Math.random() * w, Math.random() * h, 3, 2);
  }
});
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
const stoneTex = canvasTex(512, 512, (x, w, h) => paintStone(x, w, h, '#232a31', 'rgba(4,6,8,0.85)'));
const stoneBump = canvasTex(512, 512, (x, w, h) => paintStone(x, w, h, '#808080', 'rgba(0,0,0,0.9)'));
const stoneMatT = new THREE.MeshStandardMaterial({ map: stoneTex, bumpMap: stoneBump, bumpScale: 0.6, roughness: 0.94, metalness: 0.04, envMapIntensity: 0.25, fog: false });
function bannerTex(kind) {
  return canvasTex(256, 448, (x, w, h) => {
    const g = x.createLinearGradient(0, 0, 0, h);
    if (kind === 'lunc') { g.addColorStop(0, '#131c28'); g.addColorStop(1, '#080d14'); }
    else { g.addColorStop(0, '#0d2233'); g.addColorStop(1, '#060f18'); }
    x.fillStyle = g; x.fillRect(0, 0, w, h);
    const main = kind === 'lunc' ? '#ffc44d' : '#8fd0ff';
    x.strokeStyle = main; x.globalAlpha = 0.85; x.lineWidth = 5;
    x.strokeRect(14, 14, w - 28, h - 28);
    x.globalAlpha = 0.45; x.lineWidth = 2;
    x.strokeRect(24, 24, w - 48, h - 48);
    x.globalAlpha = 1;
    // rank chevrons across the head of the banner (Battle Force dressing)
    x.fillStyle = main;
    for (let cix = 0; cix < 3; cix++) {
      const cy = 44 + cix * 20;
      x.beginPath();
      x.moveTo(w / 2 - 34, cy + 12); x.lineTo(w / 2, cy - 8); x.lineTo(w / 2 + 34, cy + 12);
      x.lineTo(w / 2 + 34, cy + 24); x.lineTo(w / 2, cy + 4); x.lineTo(w / 2 - 34, cy + 24);
      x.closePath(); x.globalAlpha = 0.9 - cix * 0.22; x.fill();
    }
    x.globalAlpha = 1;
    x.save(); x.translate(w / 2, 176);
    if (kind === 'lunc') {
      x.fillStyle = main;
      x.beginPath(); x.arc(0, 0, 74, 0, 7); x.fill();
      x.globalCompositeOperation = 'destination-out';
      x.beginPath(); x.arc(30, -22, 62, 0, 7); x.fill();
      x.globalCompositeOperation = 'source-over';
      x.beginPath();
      const sx = 0, sy = 118;
      x.moveTo(sx, sy - 26); x.lineTo(sx + 7, sy - 7); x.lineTo(sx + 26, sy); x.lineTo(sx + 7, sy + 7);
      x.lineTo(sx, sy + 26); x.lineTo(sx - 7, sy + 7); x.lineTo(sx - 26, sy); x.lineTo(sx - 7, sy - 7);
      x.closePath(); x.fillStyle = main; x.fill();
    } else {
      x.fillStyle = main;
      x.beginPath();
      x.moveTo(0, -78); x.lineTo(16, -16); x.lineTo(78, 0); x.lineTo(16, 16);
      x.lineTo(0, 78); x.lineTo(-16, 16); x.lineTo(-78, 0); x.lineTo(-16, -16);
      x.closePath(); x.fill();
      x.strokeStyle = main; x.lineWidth = 7; x.globalAlpha = 0.8;
      for (const wy of [104, 126]) {
        x.beginPath();
        for (let px = -86; px <= 86; px += 4) {
          const py = wy + Math.sin(px * 0.06) * 8;
          if (px === -86) x.moveTo(px, py); else x.lineTo(px, py);
        }
        x.stroke();
      }
      x.globalAlpha = 1;
    }
    x.restore();
    // venue branding worked into the cloth: fighter word, then the game
    // name, then the house — painted like the rest of the banner
    x.fillStyle = main; x.textAlign = 'center'; x.textBaseline = 'middle';
    x.font = '900 44px Arial, sans-serif';
    x.fillText(kind === 'lunc' ? 'LUNC' : 'USTC', w / 2, 330);
    x.font = '900 25px Arial, sans-serif'; x.globalAlpha = 0.95;
    x.fillText('BATTLE FORCE', w / 2, h - 106);
    x.font = '700 19px Arial, sans-serif'; x.globalAlpha = 0.8;
    x.fillText('L U N C   D E V   S T U D I O', w / 2, h - 76);
    x.globalAlpha = 1;
    x.fillStyle = main;
    for (let i = 0; i < 5; i++) x.fillRect(28 + i * 42, h - 52, 22, 26);
  }, { nearest: true });
}
const bannerTexL = bannerTex('lunc');
const bannerTexR = bannerTex('ustc');
/* Entrance sign over the gate (venue branding, Tom Nov 6): a stone
   plaque painted with the house marks — LUNA CLASSIC in gold, LUNC DEV
   STUDIO beneath, crescents flanking. Procedural canvas, original. */
const signTex = canvasTex(1024, 256, (x, w, h) => {
  paintStone(x, w, h, '#1c232a', 'rgba(4,6,8,0.85)');
  const grd = x.createLinearGradient(0, 0, 0, h);
  grd.addColorStop(0, 'rgba(0,0,0,0.12)'); grd.addColorStop(1, 'rgba(0,0,0,0.42)');
  x.fillStyle = grd; x.fillRect(0, 0, w, h);
  x.strokeStyle = 'rgba(255,196,77,0.75)'; x.lineWidth = 6; x.strokeRect(14, 14, w - 28, h - 28);
  x.strokeStyle = 'rgba(255,196,77,0.30)'; x.lineWidth = 2; x.strokeRect(26, 26, w - 52, h - 52);
  for (const sgn of [-1, 1]) { // twin crescents flanking the name
    x.save(); x.translate(w / 2 + sgn * 372, 108);
    x.fillStyle = '#ffc44d';
    x.beginPath(); x.arc(0, 0, 52, 0, 7); x.fill();
    x.globalCompositeOperation = 'destination-out';
    x.beginPath(); x.arc(21, -15, 43, 0, 7); x.fill();
    x.globalCompositeOperation = 'source-over';
    x.restore();
  }
  x.textAlign = 'center'; x.textBaseline = 'middle';
  x.font = '900 104px Arial, sans-serif';
  x.fillStyle = 'rgba(0,0,0,0.55)'; x.fillText('BATTLE FORCE', w / 2 + 3, 111);
  const tg = x.createLinearGradient(0, 56, 0, 166);
  tg.addColorStop(0, '#ffe9a8'); tg.addColorStop(0.55, '#ffc44d'); tg.addColorStop(1, '#c77f1a');
  x.fillStyle = tg; x.fillText('BATTLE FORCE', w / 2, 108);
  x.font = '700 40px Arial, sans-serif';
  x.fillStyle = 'rgba(240,235,220,0.88)';
  x.fillText('L U N C   D E V   S T U D I O', w / 2, 198);
  x.font = '700 24px Arial, sans-serif';
  x.fillStyle = 'rgba(47,216,200,0.8)';
  x.fillText('L U N A   C L A S S I C', w / 2, 232);
}, { nearest: true });
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
    new THREE.MeshStandardMaterial({ map: floorTex, roughness: 0.55, metalness: 0.38, envMapIntensity: 0.4 }));
  platform.position.y = -0.25; platform.receiveShadow = true;
  arena.add(platform);

  /* Visual pass (Nov 6) — the bowl itself: a painted wall ringing the
     arena, three seating tiers stepping up to it with lit trim, and a
     dusting of distant crowd lights on the tiers. All procedural
     geometry + canvas textures, original to this project. BATTLE FORCE
     conversion (Nov 7) re-skins the wall/trim/lights as a steel
     command dome; the tier RING geometry is unchanged (see below). */
  const wall = new THREE.Mesh(new THREE.CylinderGeometry(17, 17.6, 7.6, 48, 1, true),
    new THREE.MeshStandardMaterial({ map: wallTex, roughness: 0.95, metalness: 0.04, side: THREE.BackSide, envMapIntensity: 0.2, fog: false }));
  wall.position.y = 3.0;
  arena.add(wall);
  // upper gallery band: a second, plainer ring above the arcade so the
  // wall's silhouette reaches higher into the sky (the fog used to eat
  // everything past the arch tops and the bowl read flat)
  const gallery = new THREE.Mesh(new THREE.CylinderGeometry(17.3, 17.1, 3.4, 48, 1, true),
    new THREE.MeshStandardMaterial({ map: stoneTex, bumpMap: stoneBump, bumpScale: 0.5, color: 0x8a97a3, roughness: 0.8, metalness: 0.35, side: THREE.BackSide, envMapIntensity: 0.15, fog: false }));
  gallery.position.y = 8.4;
  arena.add(gallery);
  const galleryTrim = new THREE.Mesh(new THREE.TorusGeometry(17.2, 0.05, 8, 72),
    new THREE.MeshStandardMaterial({ color: 0x1a0d05, emissive: 0x2fd8c8, emissiveIntensity: 0.7, roughness: 0.5, fog: false }));
  galleryTrim.rotation.x = Math.PI / 2; galleryTrim.position.y = 6.72;
  arena.add(galleryTrim);
  const stepMat = stoneMatT;
  const trimMat = new THREE.MeshStandardMaterial({ color: 0x0a1414, emissive: 0x2fd8c8, emissiveIntensity: 0.9, roughness: 0.5, fog: false });
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
    arena.add(new THREE.Points(cg, new THREE.PointsMaterial({ map: glowTex, color: 0x9fe8ff, size: 0.07, transparent: true, opacity: 0.5, depthWrite: false, blending: THREE.AdditiveBlending })));
  }

  const rim = new THREE.Mesh(new THREE.TorusGeometry(5.4, 0.045, 10, 90),
    new THREE.MeshStandardMaterial({ color: 0x1a0d05, emissive: 0xffb340, emissiveIntensity: 2.6 }));
  rim.rotation.x = Math.PI / 2; rim.position.y = 0.012;
  arena.add(rim);
  const rim2 = new THREE.Mesh(new THREE.TorusGeometry(4.1, 0.03, 8, 80),
    new THREE.MeshStandardMaterial({ color: 0x050d1a, emissive: 0x2fd8c8, emissiveIntensity: 1.7 }));
  rim2.rotation.x = Math.PI / 2; rim2.position.y = 0.012;
  arena.add(rim2);

  const gateMat = new THREE.MeshStandardMaterial({ color: 0x140a06, emissive: 0xe04a08, emissiveIntensity: 1.6, roughness: .4 });
  const gate = new THREE.Group();
  gate.add(new THREE.Mesh(new THREE.TorusGeometry(3.1, 0.16, 14, 64), gateMat));
  gate.add(new THREE.Mesh(new THREE.TorusGeometry(2.52, 0.06, 10, 56),
    new THREE.MeshStandardMaterial({ color: 0x06121f, emissive: 0x2fd8c8, emissiveIntensity: 1.9, roughness: .4 })));
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
  const radar = new THREE.Group();
  const mastMat = new THREE.MeshStandardMaterial({ color: 0x39434c, roughness: 0.6, metalness: 0.65, fog: false });
  const mast = new THREE.Mesh(new THREE.CylinderGeometry(0.14, 0.24, 3.6, 8), mastMat);
  mast.position.y = -1.3;
  const dish = new THREE.Mesh(new THREE.CircleGeometry(1.55, 28),
    new THREE.MeshStandardMaterial({ map: radarTex, transparent: true, side: THREE.DoubleSide, roughness: 0.5, metalness: 0.3, fog: false }));
  dish.position.y = 0.9; dish.rotation.y = 0.5; dish.rotation.x = -0.25;
  const radarGlow = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTex, color: 0x2fd8c8, transparent: true, opacity: 0.4, depthWrite: false, fog: false }));
  radarGlow.position.y = 0.9;
  radar.add(mast, dish, radarGlow);
  radar.position.set(-9.5, 11.5, -25);
  arena.add(radar);
  gateRing = gate; gateGlowSpr = gateGlow; moonMesh = radar; moonGlowSpr = radarGlow;

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
  /* Battle Force set dressing (conversion, Nov 7): twin searchlight
     towers flanking the gate with volumetric-feel beams that sweep the
     sky, plus a pulsing holo projector ring around the platform. */
  const towerMat = new THREE.MeshStandardMaterial({ color: 0x2c353d, roughness: 0.55, metalness: 0.6 });
  for (const side of [-1, 1]) {
    const tw = new THREE.Group();
    const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.15, 4.6, 8), towerMat);
    leg.position.y = 2.3;
    const head = new THREE.Mesh(new THREE.CylinderGeometry(0.34, 0.42, 0.8, 12), towerMat);
    head.rotation.z = Math.PI / 2; head.position.y = 4.75;
    const lens = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTex, color: 0xbfe8ff, transparent: true, opacity: 0.9, depthWrite: false }));
    lens.scale.set(1.5, 1.5, 1); lens.position.set(0, 4.75, 0.45);
    const beam = new THREE.Mesh(new THREE.ConeGeometry(1.15, 7.5, 20, 1, true),
      new THREE.MeshBasicMaterial({ color: 0x9fd8ff, transparent: true, opacity: 0.10, depthWrite: false, side: THREE.DoubleSide, blending: THREE.AdditiveBlending, fog: false }));
    beam.position.set(0, 6.4, 2.6); beam.rotation.x = 1.12;
    tw.add(leg, head, lens, beam);
    tw.position.set(side * 7.8, 0, -6.4);
    arena.add(tw);
    searchlights.push({ beam, phase: side * 2.1 });
  }
  const holo = new THREE.Mesh(new THREE.TorusGeometry(5.85, 0.022, 8, 96),
    new THREE.MeshBasicMaterial({ color: 0x2fd8c8, transparent: true, opacity: 0.5, fog: false }));
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
  embers = new THREE.Points(eg, new THREE.PointsMaterial({ map: glowTex, color: 0x7fe8dc, size: 0.09, transparent: true, opacity: .55, depthWrite: false, blending: THREE.AdditiveBlending }));
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

/* ---------------- asset loading ---------------- */
const loader = new GLTFLoader();
const clips = {};

function neutraliseRoot(clip) {
  for (const tr of clip.tracks) {
    if (/\.position$/.test(tr.name) && /^(pelvis|root|hips)/i.test(tr.name)) {
      const v = tr.values, n = v.length / 3;
      const x0 = v[0], z0 = v[2];
      for (let i = 0; i < n; i++) { v[i * 3] = x0; v[i * 3 + 2] = z0; }
    }
  }
  return clip;
}
async function loadAnims(url, names) {
  const g = await loader.loadAsync(url);
  for (const c of g.animations) if (names.includes(c.name)) clips[c.name] = neutraliseRoot(c);
}
function findBone(root, name) {
  let found = null;
  root.traverse(o => { if (o.isBone && o.name === name) found = o; });
  return found;
}

class Fighter {
  constructor(cfg) {
    this.cfg = cfg;
    this.group = new THREE.Group();
    this.hp = 100; this.meter = 0;
    this.x = cfg.startX; this.vx = 0; this.y = 0; this.vy = 0;
    this.face = cfg.startX < 0 ? 1 : -1;
    this.state = 'idle'; this.stateT = 0;
    this.atk = null; this.atkKey = null; this.atkHitDone = false; this.specDone = false;
    this.react = null; this.prevLimb = null; this.atkMinSurf = 99;
    this.specKind = null; this.ult = null;
    this.stats = { specDash: 0, specOrb: 0, specRise: 0, specSweep: 0, ult: 0 };
    this.blocking = false; this.crouching = false;
    this.roundsWon = 0; this.aiTimer = 0; this.aiHoldT = 0; this.aiAction = null; this.aiBlockT = 0; this.aiRot = {};
  }
  async load() {
    // re-entry (character select swap): retire the old model + mixer
    if (this.model) {
      if (this.mixer) this.mixer.stopAllAction();
      scene.remove(this.group);
      this.group = new THREE.Group();
      this.model = null; this.mixer = null; this.actions = {}; this.current = null;
      this.state = 'idle'; this.stateT = 0; this.atk = null; this.ult = null; this.specKind = null; this.react = null;
    }
    const g = await loader.loadAsync(this.cfg.model);
    this.model = g.scene;
    // measure from raw geometry bounds (bind space) — Box3.setFromObject is
    // unreliable on SkinnedMesh in r160 (returns the skinned-bounds stub)
    const bb = new THREE.Box3();
    this.model.traverse(o => {
      if (o.isMesh) {
        o.geometry.computeBoundingBox();
        bb.union(o.geometry.boundingBox);
      }
    });
    const h = bb.max.y - bb.min.y;
    this.measuredH = h; this.measuredMin = bb.min.y;
    const s = 1.8 / h;
    this.model.scale.setScalar(s);
    this.model.position.y = -bb.min.y * s;
    this.model.traverse(o => { if (o.isMesh) { o.castShadow = true; o.frustumCulled = false; } });
    // Visual pass (Nov 6): image-based-lighting response per material —
    // glossy eyes, satin hair, a light sheen on the suits. Materials only;
    // geometry, rig and animation are untouched.
    const seenMats = new Set();
    this.model.traverse(o => {
      if (!o.isMesh) return;
      const mats = Array.isArray(o.material) ? o.material : [o.material];
      for (const m of mats) {
        if (!m || seenMats.has(m) || !('envMapIntensity' in m)) continue;
        seenMats.add(m);
        const n = m.name || '';
        if (n.includes('Eyes')) { m.envMapIntensity = 1.0; m.roughness = Math.min(m.roughness, 0.22); }
        else if (n.includes('Hair')) { m.envMapIntensity = 0.7; m.roughness = 0.62; }
        else { m.envMapIntensity = 0.5; m.roughness = Math.min(m.roughness || 1, 0.85); }
      }
    });
    // Roster identity (Nov 6): the new fighters wear a tinted suit — the
    // material colour multiplies the baked CC0 texture (clone first: the
    // loader cache shares materials across loads of the same rig).
    if (this.cfg.suitTint) {
      const seenSuit = new Set();
      this.model.traverse(o => {
        if (!o.isMesh) return;
        const mats = Array.isArray(o.material) ? o.material : [o.material];
        for (let i = 0; i < mats.length; i++) {
          const m = mats[i];
          if (!m || seenSuit.has(m)) continue;
          seenSuit.add(m);
          const n = m.name || '';
          if (n.includes('Eyes') || n.includes('Hair')) continue;
          const cm = m.clone(); cm.color.set(this.cfg.suitTint);
          if (Array.isArray(o.material)) o.material[i] = cm; else o.material = cm;
        }
      });
    }
    this.group.add(this.model);
    this.group.position.x = this.x;
    scene.add(this.group);
    this.mixer = new THREE.AnimationMixer(this.model);
    this.actions = {};
    for (const [key, clipName] of Object.entries(this.cfg.clips)) {
      if (clips[clipName]) this.actions[key] = this.mixer.clipAction(clips[clipName]);
    }
    this.chestBone = findBone(this.model, 'spine_03') || findBone(this.model, 'spine_02');
    this.headBone = findBone(this.model, 'Head');
    this.pelvisBone = findBone(this.model, 'pelvis');
    // Striking limbs, measured from the rigs (both fighters share the map):
    // jab = lead hand_l, heavy = rear hand_r, kick/slide = lead foot_r.
    this.limbBones = {
      jab: findBone(this.model, 'hand_l'),
      heavy: findBone(this.model, 'hand_r'),
      kick: findBone(this.model, 'foot_r'),
    };
    // CC0 rigged hairstyles: re-attach as a plain mesh under the Head bone,
    // baked with the hair file's own inverse-bind matrix for the Head bone
    for (const hp of this.cfg.hair || []) {
      try {
        const hg = await loader.loadAsync(hp);
        hg.scene.traverse(o => {
          if (o.isSkinnedMesh && o.skeleton && this.headBone) {
            const hi = o.skeleton.bones.findIndex(b => b.name === 'Head');
            if (hi < 0) return;
            const hm = new THREE.Mesh(o.geometry, o.material);
            hm.castShadow = true; hm.frustumCulled = false;
            if (this.cfg.hairTint) { hm.material = o.material.clone(); hm.material.color.set(this.cfg.hairTint); }
            if ('envMapIntensity' in hm.material) { hm.material.envMapIntensity = 0.7; hm.material.roughness = 0.62; }
            hm.applyMatrix4(o.skeleton.boneInverses[hi]);
            this.headBone.add(hm);
          }
        });
      } catch (e) { console.warn('hair attach failed', hp, e); }
    }
    // debug: posed height via skinned bounding box + armature transform
    this.play('idle');
    this.mixer.update(0.1);
    let posedH = -1;
    this.model.traverse(o => {
      if (o.isSkinnedMesh) {
        o.computeBoundingBox();
        if (o.boundingBox) posedH = Math.max(posedH, o.boundingBox.max.y - o.boundingBox.min.y);
      }
    });
    this.posedH = posedH;
    const wp = n => { const b = findBone(this.model, n); if (!b) return null; const v = new THREE.Vector3(); b.getWorldPosition(v); return v.toArray().map(x => Math.round(x * 100) / 100); };
    this.armInfo = { head: wp('Head'), pelvis: wp('pelvis'), foot_l: wp('foot_l'), rootBone: wp('root'), grp: this.group.position.toArray(), mdlScale: this.model.scale.x };
    this.handBone = findBone(this.model, this.cfg.handBone);
    this.headBone = findBone(this.model, 'Head');
    this.play('idle');
    this.applyFacing();
  }
  dur(key) { const a = this.actions[key]; return a ? a.getClip().duration : 0.6; }
  play(key, opts = {}) {
    const a = this.actions[key]; if (!a) return;
    const prev = this.current;
    a.reset(); a.enabled = true;
    a.setLoop(opts.loop === false ? THREE.LoopOnce : THREE.LoopRepeat, Infinity);
    a.clampWhenFinished = !!opts.clamp;
    a.timeScale = opts.timeScale !== undefined ? opts.timeScale : 1;
    if (opts.at) a.time = opts.at;
    a.play();
    if (prev && prev !== a) {
      if (opts.fade === 0) prev.stop();
      else a.crossFadeFrom(prev, opts.fade !== undefined ? opts.fade : 0.12, false);
    }
    this.current = a; this.currentKey = key;
  }
  applyFacing() {
    this.group.rotation.y = this.face > 0 ? Math.PI / 2 : -Math.PI / 2;
  }
  bonePos(bone, out) {
    if (!bone) return out.set(this.x, 1.1 + this.y, 0);
    return bone.getWorldPosition(out);
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
  const col = owner.cfg.sparkColor; // orbs carry their owner's energy colour (gold LUNC / azure USTC / ember BURN / mint NOVA)
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

/* Impact reaction: an additive pose layer applied after the animation
   mixer each frame, so the body answers AT the point of impact — head
   snap for head strikes, torso twist for body strikes, a stagger dip
   for low strikes, a small brace when a guard absorbs the blow. */
const _pq = new THREE.Quaternion(), _wq = new THREE.Quaternion(), _dq = new THREE.Quaternion(), _ax = new THREE.Vector3();
function boneWorldRot(bone, x, y, z, ang) {
  if (!bone || !ang) return;
  _ax.set(x, y, z); _dq.setFromAxisAngle(_ax, ang);
  bone.parent.getWorldQuaternion(_pq);
  bone.getWorldQuaternion(_wq);
  _wq.premultiply(_dq);
  bone.quaternion.copy(_pq.invert().multiply(_wq));
}
function setReaction(def, zone, dir, power, blocked) {
  def.react = { t: 0, dur: blocked ? 0.16 : 0.27, zone, dir, power, blocked: !!blocked };
}
function applyReaction(f) {
  const r = f.react; if (!r) return;
  if (r.t >= r.dur) { f.react = null; return; }
  const k = Math.min(1, r.t / 0.03); // snap in fast…
  const s = Math.pow(1 - r.t / r.dur, 1.5) * k * r.power; // …then recover
  if (s <= 0.001) return;
  const d = r.dir;
  if (r.zone === 'head') {
    boneWorldRot(f.headBone, 0, 0, 1, -d * 0.55 * s); // head snaps back, away from the fist
    boneWorldRot(f.headBone, 0, 1, 0, d * 0.30 * s);  // …and turns away
    boneWorldRot(f.chestBone, 0, 1, 0, -d * 0.18 * s);
    boneWorldRot(f.chestBone, 0, 0, 1, -d * 0.12 * s);
  } else if (r.zone === 'body') {
    boneWorldRot(f.chestBone, 0, 1, 0, -d * 0.42 * s); // torso twists away from the blow
    boneWorldRot(f.chestBone, 0, 0, 1, -d * 0.22 * s); // shoulders recoil
    boneWorldRot(f.headBone, 0, 0, 1, -d * 0.18 * s);  // head lags a beat behind
  } else if (r.zone === 'low') {
    boneWorldRot(f.chestBone, 0, 0, 1, -d * 0.30 * s);
    boneWorldRot(f.headBone, 0, 0, 1, -d * 0.22 * s);
    f.group.position.y -= 0.06 * s; // stagger dip — legs buckle
  } else { // guard brace
    boneWorldRot(f.chestBone, 0, 0, 1, -d * 0.10 * s);
    boneWorldRot(f.headBone, 0, 0, 1, -d * 0.06 * s);
  }
}

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
function dashClipKey(f) { return f.cfg.dashKey; } // both rigs carry Sword_Dash, under the fighter's own clip key
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
const CLIPMAP = {
  idle: 'Idle_Loop', walk: 'Walk_Loop', crouch: 'Crouch_Idle_Loop', jump: 'Jump_Loop',
  block: 'Idle_Shield_Loop', jab: 'Punch_Jab', kick1: 'Slide_Start', kick2: 'Slide_Loop',
  hitL: 'Hit_Chest', hitH: 'Hit_Head', knock: 'Hit_Knockback', death: 'Death01',
  win: 'Idle_FoldArms_Loop',
};
/* Roster of FOUR pickable fighters (owner, Nov 6): MR LUNC and MRS USTC
   stay; CAPTAIN BURN (heavy) and MS NOVA (speedster) join. All four are
   original to this project on the same CC0 Quaternius rigs — identity
   comes from hair setup, suit palette, energy colour, their own special
   NAMES, and a per-fighter KIT (damage / speed / special tuning below).
   The control scheme never changes: ↑ RISE · ↓ SWEEP · → DASH · ← ORB ·
   full meter = ULTIMATE, 25 meter per special — only the numbers,
   names and behaviour of each fighter's versions differ. */
const ROSTER = [
  {
    id: 'lunc', name: 'MR LUNC', title: 'LUNA CLASSIC', style: 'BALANCED ALL-ROUNDER — the classic kit, honest numbers everywhere.',
    stats: { power: 3, speed: 3, range: 3 },
    model: 'models/ryker/char.gltf', handBone: 'hand_r', sparkColor: 0xffc44d,
    hair: ['models/ryker/Hair_SimpleParted.gltf', 'models/ryker/Hair_Beard.gltf'],
    clips: { heavy: 'Punch_Cross', special: 'Sword_Dash', throw: 'OverhandThrow' },
    dashKey: 'special',
    specNames: { rise: 'SOLAR RISE', sweep: 'ECLIPSE SWEEP', dash: 'COMET DASH', orb: 'NOVA ORB' },
    ultKind: 'combo',
    kit: { dmgMul: 1.0, moveMul: 1.0, dashPow: 7.6, dashDmg: 16, riseDmg: 14, riseHop: 6.2, sweepPow: 6.2, sweepDmg: 13, orbDmg: 12, orbPow: 6.4, orbLife: 2.2, ultOrbDmg: 8, ultOrbCount: 3, meterGainMul: 1.0 },
  },
  {
    id: 'ustc', name: 'MRS USTC', title: 'TERRA CLASSIC', style: 'ZONER — her ORB flies far and fast and hits hard; her DASH is short. Keep away and shoot.',
    stats: { power: 3, speed: 2, range: 5 },
    model: 'models/sable/char.gltf', handBone: 'hand_l', sparkColor: 0x4da6ff,
    hair: ['models/sable/Hair_Long.gltf'], hairTint: 0x6e4a34,
    clips: { heavy: 'Punch_Cross', special: 'Spell_Simple_Shoot', throw: 'Spell_Simple_Shoot', dashAlt: 'Sword_Dash' },
    dashKey: 'dashAlt',
    specNames: { rise: 'AZURE RISE', sweep: 'TIDE SWEEP', dash: 'SURGE DASH', orb: 'LAGOON ORB' },
    ultKind: 'barrage',
    kit: { dmgMul: 0.92, moveMul: 0.94, dashPow: 5.6, dashDmg: 13, riseDmg: 12, riseHop: 6.2, sweepPow: 5.4, sweepDmg: 11, orbDmg: 15, orbPow: 8.6, orbLife: 2.9, ultOrbDmg: 8, ultOrbCount: 3, meterGainMul: 1.0 },
  },
  {
    id: 'burn', name: 'CAPTAIN BURN', title: 'THE BURN WALLET', style: 'HEAVY BRAWLER — slow feet, huge hits. Every special lands like a truck; his ULTIMATE combo is the biggest in the game.',
    stats: { power: 5, speed: 1, range: 2 },
    model: 'models/ryker/char.gltf', handBone: 'hand_r', sparkColor: 0xff5a26,
    hair: ['models/ryker/Hair_Beard.gltf'], suitTint: 0xd8542e,
    clips: { heavy: 'Punch_Cross', special: 'Sword_Dash', throw: 'OverhandThrow' },
    dashKey: 'special',
    specNames: { rise: 'INFERNO RISE', sweep: 'ASH SWEEP', dash: 'EMBER CHARGE', orb: 'FIREBALL' },
    ultKind: 'combo',
    kit: { dmgMul: 1.3, moveMul: 0.8, dashPow: 6.6, dashDmg: 21, riseDmg: 19, riseHop: 5.4, sweepPow: 5.2, sweepDmg: 17, orbDmg: 15, orbPow: 5.6, orbLife: 1.9, ultOrbDmg: 8, ultOrbCount: 3, meterGainMul: 0.95 },
  },
  {
    id: 'nova', name: 'MS NOVA', title: 'THE COMET', style: 'SPEEDSTER — the fastest feet and specials in the arena. Light hits, but she is everywhere at once.',
    stats: { power: 2, speed: 5, range: 3 },
    model: 'models/sable/char.gltf', handBone: 'hand_l', sparkColor: 0x38f2c8,
    hair: [], hairTint: 0x2a7f8f, suitTint: 0x8f7fe8,
    clips: { heavy: 'Punch_Cross', special: 'Spell_Simple_Shoot', throw: 'Spell_Simple_Shoot', dashAlt: 'Sword_Dash' },
    dashKey: 'dashAlt',
    specNames: { rise: 'COMET RISE', sweep: 'TAIL SWEEP', dash: 'BLINK DASH', orb: 'STAR SHARD' },
    ultKind: 'barrage',
    kit: { dmgMul: 0.8, moveMul: 1.22, dashPow: 10.2, dashDmg: 11, riseDmg: 10, riseHop: 7.4, sweepPow: 8.4, sweepDmg: 9, orbDmg: 9, orbPow: 7.8, orbLife: 2.2, ultOrbDmg: 5, ultOrbCount: 5, meterGainMul: 1.1 },
  },
];
/* Both slots spawn as the classic pair; the character select re-skins a
   slot via load() (see applySelection). dashKey names the FIGHTER's rig
   dash clip: the ryker loadout dashes on 'special', the sable loadout on
   'dashAlt' — both are Sword_Dash on disk. (It must follow the fighter,
   not the slot: a ryker in slot 2 has no 'dashAlt' action, and a sable
   in slot 1 dashing on her 'special' cast pose whiffed the body-contact
   test the dash was tuned on — both found in roster QA, Nov 6.) */
const SLOT_DEFS = [
  { startX: -1.7, rosterIx: 0 },
  { startX: 1.7, rosterIx: 1 },
];
function slotCfg(slot) {
  const r = ROSTER[SLOT_DEFS[slot].rosterIx];
  return {
    ...r, startX: SLOT_DEFS[slot].startX, dashKey: r.dashKey,
    clips: { ...CLIPMAP, ...r.clips },
  };
}
let P1 = new Fighter(slotCfg(0));
let P2 = new Fighter(slotCfg(1));
const FIGHTERS = [P1, P2];
function foe(f) { return f === P1 ? P2 : P1; }
/* Character select: pickFighter = the player's roster index; the CPU
   opponent is drawn from the other three at boot (and re-drawn by the
   QA roster scenes). */
let pickFighter = 0;
let cpuFighter = 1;
function hexCss(c) { return '#' + c.toString(16).padStart(6, '0'); }
function refreshFaceoff() {
  const a = ROSTER[pickFighter], b = ROSTER[cpuFighter];
  const set = (id, v) => { const el = document.getElementById(id); if (el) el.textContent = v; };
  set('vsName1', a.name); set('vsTitle1', a.title);
  set('vsName2', b.name); set('vsTitle2', b.title);
  set('name1', a.name); set('title1', a.title);
  set('name2', b.name); set('title2', b.title);
  const lg = (id, r) => {
    const el = document.getElementById(id);
    if (el) el.innerHTML = `↑ ${r.specNames.rise} ↓ ${r.specNames.sweep}<br>→ ${r.specNames.dash} ← ${r.specNames.orb}`;
  };
  lg('legend1', a); lg('legend2', b);
  const root = document.documentElement.style;
  root.setProperty('--p1', hexCss(a.sparkColor));
  root.setProperty('--p2', hexCss(b.sparkColor));
  root.setProperty('--p1a', hexCss(a.sparkColor));
  root.setProperty('--p1b', hexCss(a.sparkColor));
  root.setProperty('--p2a', hexCss(b.sparkColor));
  root.setProperty('--p2b', hexCss(b.sparkColor));
  document.querySelectorAll('#selectRow .fcard').forEach((card, i) => {
    card.classList.toggle('sel', i === pickFighter);
    card.classList.toggle('cpu', i === cpuFighter);
  });
}
async function applySelection() {
  SLOT_DEFS[0].rosterIx = pickFighter;
  SLOT_DEFS[1].rosterIx = cpuFighter;
  const jobs = [];
  if (P1.cfg.id !== ROSTER[pickFighter].id) { P1.cfg = slotCfg(0); jobs.push(P1.load()); }
  if (P2.cfg.id !== ROSTER[cpuFighter].id) { P2.cfg = slotCfg(1); jobs.push(P2.load()); }
  if (jobs.length) await Promise.all(jobs);
  refreshFaceoff();
}
function buildSelectCards() {
  const row = document.getElementById('selectRow');
  if (!row) return;
  row.innerHTML = '';
  ROSTER.forEach((r, i) => {
    const card = document.createElement('button');
    card.className = 'fcard';
    const col = hexCss(r.sparkColor);
    const bar = (lab, v) => `<div class="frow"><span class="flab">${lab}</span><span class="fbar"><span class="ffill" style="display:block;width:${v * 20}%;background:${col}"></span></span></div>`;
    card.innerHTML = `<div class="fn" style="color:${col}">${r.name}</div><div class="ft2">${r.title}</div>` +
      `<div class="fsty">${r.style}</div>` +
      bar('POWER', r.stats.power) + bar('SPEED', r.stats.speed) + bar('RANGE', r.stats.range) +
      `<div class="cpuTag">CPU PICK</div>`;
    card.addEventListener('click', () => {
      AudioSys.init();
      pickFighter = i;
      if (cpuFighter === pickFighter) cpuFighter = (pickFighter + 1) % ROSTER.length;
      refreshFaceoff();
    });
    row.appendChild(card);
  });
  refreshFaceoff();
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
try { if (localStorage.getItem('ac3d.controls') === 'pad') ctlMode = 'pad'; } catch (e) { }
function applyCtlMode() {
  document.body.classList.toggle('ctl-pad', ctlMode === 'pad');
  document.body.classList.toggle('ctl-stick', ctlMode !== 'pad');
  document.querySelectorAll('.ctl-opt').forEach(b => b.classList.toggle('sel', b.dataset.mode === ctlMode));
  const hint = document.getElementById('ctlHint');
  if (hint) hint.textContent = ctlMode === 'pad'
    ? 'TOUCH: button pad — arrows move · JAB / HOOK / KICK / SPEC attack'
    : 'TOUCH: left stick moves — flick up to jump · push down to crouch';
  for (const k in touchState) touchState[k] = false;
  stickReset();
}
document.querySelectorAll('.ctl-opt').forEach(b => b.addEventListener('click', () => {
  ctlMode = b.dataset.mode === 'pad' ? 'pad' : 'stick';
  try { localStorage.setItem('ac3d.controls', ctlMode); } catch (e) { }
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

  if (f.state === 'death') f.y = -0.52 * Math.min(1, f.stateT / 0.45); // Death01 floats (root motion is neutralised) — settle the body onto the floor
  f.x = THREE.MathUtils.clamp(f.x, STAGE_MIN, STAGE_MAX);
  f.group.position.x = f.x;
  f.group.position.y = f.y;
  if (f.state !== 'death') { f.face = foe(f).x >= f.x ? 1 : -1; f.applyFacing(); }
  if (f.mixer) f.mixer.update(dt); // null while a select swap is mid-load
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
    f.aiTimer = 0.13 + Math.random() * 0.14;
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
    const fid = f.cfg.id;
    const farArr = fid === 'burn' ? ['dash', 'orb', 'dash'] : fid === 'nova' ? ['dash', 'orb', 'dash', 'orb'] : ['orb', 'dash', 'orb'];
    const midArr = fid === 'nova' ? ['dash', 'dash', 'orb', 'rise'] : fid === 'burn' ? ['dash', 'rise', 'dash', 'sweep'] : ['dash', 'orb', 'rise', 'dash'];
    if (d > 2.7) {
      // long range: ORB leads the rotation, DASH is the surprise closer;
      // a full bar means ULTIMATE — spend it, direction moot
      if (canSpec && Math.random() < (f.meter >= 100 ? 0.55 : 0.42)) { inp.specHit = true; inp.specDir = rot('far', farArr); }
      else if (fid === 'ustc' && Math.random() < 0.45) { f.aiAction = awayKey; f.aiHoldT = 0.22; } // zoner keeps her range
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
      else if (r < (fid === 'burn' ? 0.82 : 0.88)) { f.aiAction = awayKey; f.aiHoldT = 0.26; } // the brawler rarely backs off
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
  f.hp = 100; f.meter = 0; f.x = f.cfg.startX; f.vx = 0; f.y = 0; f.vy = 0;
  f.state = 'idle'; f.stateT = 0; f.atk = null; f.aiBlockT = 0; f.aiAction = null;
  f.specKind = null; f.ult = null;
  f.react = null; f.prevLimb = null;
  f.face = f.cfg.startX < 0 ? 1 : -1; f.applyFacing(); f.play('idle');
  f.group.position.set(f.x, 0, 0);
}
function startMatch() {
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
  showBanner('ROUND ' + game.round, 'FIRST TO 2', 1.0);
}
function endRound(winner, how) {
  if (game.phase === 'roundEnd' || game.phase === 'matchEnd') return;
  game.phase = 'roundEnd'; game.phaseT = 0; game.winner = winner;
  winner.roundsWon++;
  updatePips();
  if (how === 'K.O.') showBanner('K.O.', '', 1.4);
  else showBanner('TIME UP', winner.cfg.name + ' TAKES THE ROUND', 1.4);
  if (winner.state !== 'death') { winner.state = 'win'; winner.play('win', { fade: 0.15 }); }
}
function updatePips() {
  for (const [el, f] of [[$('pips1'), P1], [$('pips2'), P2]]) {
    [...el.children].forEach((pip, i) => pip.classList.toggle('won', i < f.roundsWon));
  }
}
function updateHUD() {
  for (const [f, hpEl, ghostEl, meterEl, specEl] of [[P1, $('hp1'), $('ghost1'), $('meter1'), $('specNext1')], [P2, $('hp2'), $('ghost2'), $('meter2'), $('specNext2')]]) {
    const v = Math.max(0, f.hp) / 100;
    hpEl.style.transform = `scaleX(${v})`;
    ghostEl.style.transform = `scaleX(${v})`;
    hpEl.classList.toggle('low', f.hp <= 25 && f.hp > 0);
    meterEl.style.width = f.meter + '%';
    meterEl.classList.toggle('ready', f.meter >= SPEC_COST && f.meter < 100);
    meterEl.classList.toggle('ult', f.meter >= 100);
    if (specEl) specEl.textContent = f.meter >= 100 ? '· ULTIMATE READY' : '';
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
  game.phase = 'menu'; game.winner = null;
  $('rematch').style.display = 'none';
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
  // Battle Force dressing motion: searchlight beams sweep, holo ring pulses
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
      showBanner('FIGHT!', '', 0.55); AudioSys.bell();
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
        const w = P1.roundsWon >= 2 ? P1 : P2;
        showBanner(w.cfg.name + ' WINS', 'BATTLE FORCE CHAMPION', 2.6);
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
      if (P1.mixer) P1.mixer.update(0); if (P2.mixer) P2.mixer.update(0);
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
      probe: qaProbe ? qaProbeSummary() : undefined,
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

/* ---------------- boot ---------------- */
(async function boot() {
  try {
    setLoad(0.05, 'ANIMATIONS I');
    await loadAnims('anim/ual1.glb', ['Idle_Loop', 'Walk_Loop', 'Crouch_Idle_Loop', 'Jump_Loop', 'Punch_Jab', 'Punch_Cross', 'Hit_Chest', 'Hit_Head', 'Death01', 'Roll', 'Spell_Simple_Shoot']);
    setLoad(0.3, 'ANIMATIONS II');
    await loadAnims('anim/ual2.glb', ['Idle_Shield_Loop', 'Idle_FoldArms_Loop', 'Melee_Hook', 'Hit_Knockback', 'Sword_Dash', 'OverhandThrow', 'Slide_Start', 'Slide_Loop', 'Sword_Regular_A']);
    setLoad(0.5, 'MR LUNC');
    await P1.load();
    setLoad(0.75, 'MRS USTC');
    await P2.load();
    setLoad(1, 'READY');
    document.getElementById('loading').style.display = 'none';
    document.getElementById('hud').style.display = 'block';
    if (QA_MODE) { await setupQA(QA_MODE); }
    else {
      // character select: the CPU draws a random opponent from the
      // other three fighters each visit
      const others = ROSTER.map((r, i) => i).filter(i => i !== pickFighter);
      cpuFighter = others[Math.floor(Math.random() * others.length)];
      buildSelectCards();
      await applySelection(); // must finish before animate(): load() nulls the mixer mid-swap
      game.phase = 'menu';
      document.getElementById('menu').style.display = 'flex';
    }
    updateHUD();
    animate();
  } catch (err) {
    window.__errs.push('boot: ' + (err && err.message));
    document.getElementById('qaState').textContent = JSON.stringify({ phase: 'boot-error', errors: window.__errs });
    console.error(err);
  }
})();
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
document.getElementById('rematch').addEventListener('click', () => { AudioSys.init(); startMatch(); });

/* ---------------- QA scenes (deterministic tableaux) ---------------- */
let qaImpact = null; // scripted live-sim impact scene state (QA only)
let qaProbe = null, qaHoldInputs = false, qaHoldAI = false; // clip-trajectory probe + input holds (QA only)
function qaProbeSample() {
  for (const tr of qaProbe.trackers) {
    const f = tr.f;
    for (const [key, bone] of Object.entries(tr.bones)) {
      if (!bone) continue;
      f.bonePos(bone, _v1);
      const fwd = (_v1.x - f.x) * f.face, y = _v1.y - f.y;
      const t = tr.t[key] || (tr.t[key] = { minY: 99, maxY: -99, maxFwd: -99, yAtMaxFwd: 0, firstY: null });
      if (t.firstY === null) t.firstY = y;
      if (y < t.minY) t.minY = y;
      if (y > t.maxY) t.maxY = y;
      if (fwd > t.maxFwd) { t.maxFwd = fwd; t.yAtMaxFwd = y; }
    }
  }
}
function qaProbeSummary() {
  const r2 = v => Math.round(v * 100) / 100;
  return { clip: qaProbe.name, dur: r2(qaProbe.dur), fighters: qaProbe.trackers.map(tr => {
    const o = {};
    for (const [k, t] of Object.entries(tr.t)) o[k] = { minY: r2(t.minY), maxY: r2(t.maxY), maxFwd: r2(t.maxFwd), yAtMaxFwd: r2(t.yAtMaxFwd), firstY: r2(t.firstY) };
    return o;
  }) };
}
function freezePose(f, key, at) {
  f.play(key, { loop: false, clamp: true, fade: 0 });
  if (f.current) f.current.time = at;
  if (f.mixer) f.mixer.update(0.001);
}
async function setupQA(mode) {
  // roster QA scenes: ?qa=roster:<playerIx>:<scene> (CPU = next fighter)
  // or ?qa=cpu:<cpuIx>:<scene> — loads the picked fighters first, then
  // runs the inner scene against them
  if (mode.indexOf('roster:') === 0 || mode.indexOf('cpu:') === 0) {
    const parts = mode.split(':');
    const ix = parseInt(parts[1], 10) || 0;
    if (parts[0] === 'roster') { pickFighter = ix; cpuFighter = (ix + 1) % ROSTER.length; }
    else { cpuFighter = ix; pickFighter = (ix + 1) % ROSTER.length; }
    await applySelection();
    return setupQA(parts.slice(2).join(':') || 'exchange');
  }
  if (mode === 'select') {
    // character-select screen QA: menu up, cards built, CPU drawn
    const others = ROSTER.map((r, i) => i).filter(i => i !== pickFighter);
    cpuFighter = others[1 % others.length];
    buildSelectCards();
    await applySelection();
    game.phase = 'menu';
    document.getElementById('menu').style.display = 'flex';
    return;
  }
  document.getElementById('menu').style.display = 'none';
  document.getElementById('hud').style.display = 'block';
  if (mode === 'auto') { game.phase = 'menu'; startMatch(); return; }
  game.phase = 'fight'; game.timer = 47;
  P1.meter = 65; P2.meter = 80;
  if (mode === 'sticktest') {
    // live fight vs the AI on REAL player input; the harness drives the
    // joystick with synthetic pointer events (double-taps included) and
    // reads the stick's internals back through this hook
    window.__stickDbg = () => ({
      id: stick.id, bases: document.querySelectorAll('#stickBase').length,
      ts: { left: !!touchState.left, right: !!touchState.right, down: !!touchState.down, up: !!touchState.up },
      basePos: [stickBase.style.left, stickBase.style.top], knob: stickKnob.style.transform,
      p1: [Math.round(P1.x * 100) / 100, P1.state], phase: game.phase,
    });
    updateHUD();
    return;
  }
  if (mode === 'dirtest') {
    // Player-path check for directional specials: the harness drives
    // REAL keyboard input (hold a direction, tap U for SPEC) and reads
    // the fired move back through qaState. P2's AI is held (qaHoldAI)
    // so nothing interrupts P1; P1's meter is topped up when it runs
    // dry (see the __dirtest refill in animate()).
    qaHoldAI = true;
    game.__dirtest = true;
    P2.meter = 0;
    updateHUD();
    return;
  }
  if (mode.indexOf('cliprobe:') === 0) {
    // Trajectory probe: both fighters loop one raw clip; qaState reports
    // each striking limb's height range + forward reach so special-move
    // clips get picked from measurements, not guesses.
    const name = decodeURIComponent(mode.slice('cliprobe:'.length));
    const clip = clips[name];
    P1.x = -0.9; P2.x = 0.9;
    P1.group.position.x = P1.x; P2.group.position.x = P2.x;
    P1.face = 1; P2.face = -1; P1.applyFacing(); P2.applyFacing();
    qaProbe = { name, dur: clip ? clip.duration : 0, trackers: [] };
    for (const f of FIGHTERS) {
      if (clip) { f.actions.probe = f.mixer.clipAction(clip); f.play('probe', { loop: true, fade: 0 }); }
      qaProbe.trackers.push({ f, bones: { handL: f.limbBones.jab, handR: f.limbBones.heavy, footR: f.limbBones.kick, head: f.headBone, chest: f.chestBone }, t: {} });
    }
    qaHoldInputs = true;
    updateHUD();
    return;
  }
  // Scripted LIVE impact scenes: real sim, real hit resolution — P1 throws
  // one strike at a measured distance, then the frame freezes just after
  // the strike resolves (or at the whiff's apex). Gaps come from the rig
  // measurements: jab connects up to ~1.02 spacing, so 0.92 = solid touch,
  // 1.34 = clean miss.
  const IMPACT_SCENES = {
    impactjab:   { atk: 'jab',   gap: 0.92 },
    impacthook:  { atk: 'heavy', gap: 0.88 }, // both heavies are Punch_Cross now (max connect ~0.91); the old Melee_Hook scene used 1.05
    impactcross: { atk: 'heavy', gap: 0.88, att2: true }, // MRS USTC's cross travels flat at chin height; its true max connect is ~0.91
    impactkick:  { atk: 'kick',  gap: 1.50, freezeMs: 30 },
    impactblock: { atk: 'jab',   gap: 0.92, block: true },
    whiffjab:    { atk: 'jab',   gap: 1.34, whiff: true },
    impactspdash1: { spec: 'dash', gap: 1.6 },               // MR LUNC's dash strike
    impactspdash2: { spec: 'dash', gap: 1.6, att2: true },  // MRS USTC's dash strike (Sword_Dash on her rig)
    impactsporb1:  { spec: 'orb', gap: 3.2, freezeMs: 30 }, // MR LUNC's orb, connecting at range
    impactsporb2:  { spec: 'orb', gap: 3.2, freezeMs: 30, att2: true }, // MRS USTC's orb
    spekrise1:     { spec: 'rise', gap: 1.5, freezeMs: 500 },  // MR LUNC's launcher — freeze catches the pop-up
    spekrise2:     { spec: 'rise', gap: 1.5, freezeMs: 500, att2: true }, // MRS USTC's launcher
    specsweep1:    { spec: 'sweep', gap: 1.9, freezeMs: 60 },  // MR LUNC's ground sweep trip
    specsweep2:    { spec: 'sweep', gap: 1.9, freezeMs: 60, att2: true }, // MRS USTC's ground sweep
    impactult:     { ult: true, gap: 2.6 },                 // MR LUNC's combo ULTIMATE
    impactult2:    { ult: true, gap: 3.4, att2: true },     // MRS USTC's barrage ULTIMATE
  };
  if (IMPACT_SCENES[mode]) {
    const sc = IMPACT_SCENES[mode];
    P1.x = -sc.gap / 2; P2.x = sc.gap / 2;
    P1.group.position.x = P1.x; P2.group.position.x = P2.x;
    P1.face = 1; P2.face = -1; P1.applyFacing(); P2.applyFacing();
    qaImpact = { atk: sc.atk, spec: sc.spec || null, ult: !!sc.ult, block: !!sc.block, whiff: !!sc.whiff, att2: !!sc.att2, freezeMs: sc.freezeMs || 80, t: 0, fired: false };
    updateHUD();
    return;
  }
  const setBannerPerm = (m, s) => {
    const mm = $('bannerMain'), ss = $('bannerSub');
    mm.textContent = m; ss.textContent = s || '';
    mm.className = 'pop'; ss.className = 'pop';
    clearTimeout(showBanner._t);
  };
  if (mode === 'faceoff') {
    P1.play('win'); P2.play('win');
    setBannerPerm('ROUND 1', 'FIRST TO 2');
    game.phase = 'frozen';
  } else if (mode === 'exchange') {
    P1.x = -0.52; P2.x = 0.56;
    P1.group.position.x = P1.x; P2.group.position.x = P2.x;
    P1.face = 1; P2.face = -1; P1.applyFacing(); P2.applyFacing();
    freezePose(P1, 'jab', 0.16);
    freezePose(P2, 'hitL', 0.07);
    P2.hp = 93; P2.meter = 88;
    P2.bonePos(P2.chestBone, _v1); burst(_v1, 0xffc44d, 22, 3, 1.3);
    slashArc(_v1, 0xffc44d, false);
    game.phase = 'frozen';
  } else if (mode === 'specdash') {
    P1.x = -0.9; P2.x = 0.62;
    P1.group.position.x = P1.x; P2.group.position.x = P2.x;
    P1.face = 1; P2.face = -1; P1.applyFacing(); P2.applyFacing();
    freezePose(P1, dashClipKey(P1), 0.3);
    freezePose(P2, 'hitH', 0.1);
    P2.hp = 61;
    P2.bonePos(P2.chestBone, _v1); burst(_v1, P1.cfg.sparkColor, 26, 3.4, 1.4);
    slashArc(_v1, P1.cfg.sparkColor, false);
    game.phase = 'frozen';
  } else if (mode === 'specorb') {
    P1.x = -0.7; P2.x = 1.5;
    P1.group.position.x = P1.x; P2.group.position.x = P2.x;
    P1.face = 1; P2.face = -1; P1.applyFacing(); P2.applyFacing();
    freezePose(P2, 'throw', 0.4);
    freezePose(P1, 'idle', 0.3);
    P2.bonePos(P2.handBone, _v1);
    spawnOrb(P2, new THREE.Vector3(0.35, 1.35, 0), P2.cfg.kit.orbDmg);
    const p = projectiles[0]; if (p) { p.grp.position.set(0.35, 1.35, 0); p.life = 99; }
    game.phase = 'frozen';
  } else if (mode === 'ko') {
    P1.x = -0.4; P2.x = 0.85;
    P1.group.position.x = P1.x; P2.group.position.x = P2.x;
    P1.face = 1; P2.face = -1; P1.applyFacing(); P2.applyFacing();
    freezePose(P2, 'death', 1.75);
    P2.y = -0.52; P2.group.position.y = -0.52;
    freezePose(P1, 'win', 0.8);
    P2.hp = 0; P1.roundsWon = 2;
    updatePips();
    setBannerPerm('K.O.', '');
    document.getElementById('koFlash').style.opacity = 0.55;
    game.phase = 'frozen';
  } else if (mode === 'backlunc' || mode === 'backustc') {
    // Both fighters turned away at real fight spacing — the shirt-back
    // prints are the subject. Focus fighter stands tall; the other crouches.
    const luncFocus = mode === 'backlunc';
    P1.x = luncFocus ? -0.66 : -0.82; P2.x = luncFocus ? 0.82 : 0.66;
    P1.group.position.x = P1.x; P2.group.position.x = P2.x;
    P1.group.rotation.y = Math.PI; P2.group.rotation.y = Math.PI;
    freezePose(luncFocus ? P1 : P2, 'win', 0.5);
    freezePose(luncFocus ? P2 : P1, 'crouch', 0.4);
    game.phase = 'frozen';
  } else if (mode === 'backfight') {
    // Mid-fight: MR LUNC's jab knocks MRS USTC around — USTC back to camera.
    P1.x = -0.55; P2.x = 0.58;
    P1.group.position.x = P1.x; P2.group.position.x = P2.x;
    P1.face = 1; P1.applyFacing();
    P2.group.rotation.y = Math.PI * 0.8;
    freezePose(P1, 'jab', 0.16);
    freezePose(P2, 'knock', 0.12);
    P2.hp = 84;
    P2.bonePos(P2.chestBone, _v1); burst(_v1, 0xffc44d, 20, 3, 1.3);
    slashArc(_v1, 0xffc44d, false);
    game.phase = 'frozen';
  } else if (mode === 'wide') {
    // QA-only: max separation — both fighters frozen at the stage clamps
    P1.x = -3.6; P2.x = 3.6;
    P1.group.position.x = P1.x; P2.group.position.x = P2.x;
    P1.face = 1; P2.face = -1; P1.applyFacing(); P2.applyFacing();
    freezePose(P1, 'idle', 0.3); freezePose(P2, 'idle', 0.3);
    game.phase = 'frozen';
  }
  updateHUD();
}
