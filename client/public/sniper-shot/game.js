import * as THREE from 'three';

/* ============================================================
   SNIPER SHOT 3D — Rooftop Range Over the City
   You are the sniper on a rooftop above a living 3D city:
   traffic, strolling people, happy animals — and playful
   TARGETS hidden in it all (balloons, boards, cans, drones,
   beach balls, pinwheels, kites, car roof signs).
   TARGETS ONLY: hitting a person or an animal is a FOUL.
   All art is procedural/original (canvas textures + geometry);
   engine: three.js r160 (MIT). See LICENSES.md.
   Mechanics carried from Sniper Shot (drag aim, scope zooms,
   hold-breath steady, bolt-action mag, combo multiplier, waves).

   City pass (Tom, Nov 7): ~1/3 of the towers removed for open lots
   and sightlines, more people + cars, denser targets at all ranges.
   People and animals are NEVER targets — hitting one is a FOUL.
   ============================================================ */

const QA = new URLSearchParams(location.search);
const QA_MODE = QA.get('qa'); // 'auto' = self-play, '1' = API exposed for a driver
window.__errs = [];
window.addEventListener('error', e => { window.__errs.push(String(e.message || e.error)); });

const $ = id => document.getElementById(id);
const T = k => window.T(k);
const loadFill = $('loadFill'), loadPct = $('loadPct');
function setLoad(p, label) {
  loadFill.style.width = Math.round(p * 100) + '%';
  loadPct.textContent = Math.round(p * 100) + '%' + (label ? ' · ' + label : '');
}
const nextFrame = () => new Promise(r => requestAnimationFrame(r));

/* seeded rng so the city layout is stable run to run */
function mulberry32(a) {
  return function () {
    a |= 0; a = a + 0x6D2B79F5 | 0;
    let t = Math.imul(a ^ a >>> 15, 1 | a);
    t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
    return ((t ^ t >>> 14) >>> 0) / 4294967296;
  };
}
const rng = mulberry32(20261106);
const rr = (a, b) => a + rng() * (b - a);
const pick = arr => arr[(rng() * arr.length) | 0];

/* ---------------- renderer / scene / camera ---------------- */
const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
renderer.setSize(innerWidth, innerHeight);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.18;
$('game').appendChild(renderer.domElement);

const scene = new THREE.Scene();
scene.fog = new THREE.FogExp2(0xcfe0f2, 0.0026);

let isPortrait = innerWidth < innerHeight;
const camera = new THREE.PerspectiveCamera(55, innerWidth / innerHeight, 0.1, 700);
const CAM_POS = new THREE.Vector3(0, 31.3, 41);
camera.position.copy(CAM_POS);
scene.add(camera);
addEventListener('resize', () => {
  isPortrait = innerWidth < innerHeight;
  camera.aspect = innerWidth / innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(innerWidth, innerHeight);
});

/* ---------------- lights ---------------- */
scene.add(new THREE.HemisphereLight(0xbfdcff, 0x8a7a5f, 0.95));
const sun = new THREE.DirectionalLight(0xfff1d6, 2.6);
sun.position.set(55, 95, 30);
sun.castShadow = true;
sun.shadow.mapSize.set(2048, 2048);
sun.shadow.camera.left = -95; sun.shadow.camera.right = 95;
sun.shadow.camera.top = 95; sun.shadow.camera.bottom = -95;
sun.shadow.camera.near = 10; sun.shadow.camera.far = 320;
sun.shadow.bias = -0.0006;
sun.target.position.set(0, 0, -45);
scene.add(sun); scene.add(sun.target);
const fill = new THREE.DirectionalLight(0xd8ecff, 0.5);
fill.position.set(-40, 30, 80);
scene.add(fill);

/* ---------------- procedural textures ---------------- */
function canvasTex(w, h, draw, opts = {}) {
  const c = document.createElement('canvas'); c.width = w; c.height = h;
  draw(c.getContext('2d'), w, h);
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.colorSpace = THREE.SRGBColorSpace;
  if (opts.clamp) { t.wrapS = t.wrapT = THREE.ClampToEdgeWrapping; }
  if (opts.aniso) t.anisotropy = 4;
  return t;
}
const skyTex = canvasTex(1024, 512, (x, w, h) => {
  const g = x.createLinearGradient(0, 0, 0, h);
  g.addColorStop(0, '#2f6fd0'); g.addColorStop(0.45, '#6fa8e8');
  g.addColorStop(0.75, '#a8cdf2'); g.addColorStop(0.92, '#dceefb'); g.addColorStop(1, '#fdf3d8');
  x.fillStyle = g; x.fillRect(0, 0, w, h);
}, { clamp: true });
/* ---------------- house branding: the city advertises LUNC ---------------- */
function drawCrescent(x, cx, cy, r, gold) {
  x.save();
  x.fillStyle = gold;
  x.beginPath(); x.arc(cx, cy, r, 0, 7); x.fill();
  x.globalCompositeOperation = 'destination-out';
  x.beginPath(); x.arc(cx + r * 0.42, cy - r * 0.1, r * 0.82, 0, 7); x.fill();
  x.restore();
}
function brandPanel(w, h, bg, lines, opts = {}) {
  return canvasTex(w, h, (x) => {
    x.fillStyle = bg; x.fillRect(0, 0, w, h);
    x.strokeStyle = opts.frame || '#f5c542'; x.lineWidth = Math.max(4, h * 0.03);
    x.strokeRect(x.lineWidth / 2, x.lineWidth / 2, w - x.lineWidth, h - x.lineWidth);
    const hasC = opts.crescent !== false;
    if (hasC) drawCrescent(x, w * 0.16, h * 0.5, h * 0.3, '#f5c542');
    x.textAlign = 'left'; x.textBaseline = 'middle';
    const tx = hasC ? w * 0.30 : w * 0.07;
    const n = lines.length;
    lines.forEach((ln, i) => {
      x.fillStyle = ln.color || '#ffffff';
      x.font = `900 ${ln.size}px 'Arial Black',Arial,sans-serif`;
      x.fillText(ln.text, tx, h * (n === 1 ? 0.52 : (0.30 + i * 0.40)));
    });
  }, { clamp: true, aniso: true });
}
const brandMats = {
  billboard: new THREE.MeshStandardMaterial({ map: brandPanel(1024, 384, '#12233d', [
    { text: 'LUNA CLASSIC', size: 118, color: '#ffffff' },
    { text: 'LUNC · LUNC DEV STUDIO', size: 56, color: '#f5c542' }]), roughness: 0.55 }),
  banner: new THREE.MeshStandardMaterial({ map: brandPanel(1024, 256, '#f5c542', [
    { text: 'LUNA CLASSIC', size: 104, color: '#12233d' }]), roughness: 0.7, side: THREE.DoubleSide }),
  signGold: new THREE.MeshStandardMaterial({ map: brandPanel(512, 128, '#12233d', [
    { text: 'LUNC', size: 72, color: '#f5c542' }]), roughness: 0.6 }),
  signWhite: new THREE.MeshStandardMaterial({ map: brandPanel(512, 128, '#f4f6f8', [
    { text: 'LUNA CLASSIC', size: 46, color: '#12233d' }], { crescent: false }), roughness: 0.6 }),
  signStudio: new THREE.MeshStandardMaterial({ map: brandPanel(512, 128, '#1d3f2a', [
    { text: 'LUNC DEV STUDIO', size: 44, color: '#ffffff' }], { crescent: false }), roughness: 0.6 }),
  truck: new THREE.MeshStandardMaterial({ map: brandPanel(1024, 256, '#f4f6f8', [
    { text: 'LUNA CLASSIC', size: 84, color: '#12233d' },
    { text: 'LUNC DEV STUDIO', size: 48, color: '#b8860b' }]), roughness: 0.5 }),
  roof: new THREE.MeshStandardMaterial({ map: brandPanel(512, 512, '#3a3f45', [
    { text: 'LUNC', size: 150, color: '#f5c542' }]), roughness: 0.95 }),
};
const shopSignMats = [brandMats.signGold, brandMats.signWhite, brandMats.signStudio];

const glowTex = canvasTex(128, 128, (x, w, h) => {
  const g = x.createRadialGradient(64, 64, 2, 64, 64, 62);
  g.addColorStop(0, 'rgba(255,255,255,1)'); g.addColorStop(0.35, 'rgba(255,255,255,.5)');
  g.addColorStop(1, 'rgba(255,255,255,0)');
  x.fillStyle = g; x.fillRect(0, 0, w, h);
}, { clamp: true });
function facadeTex(base, winLit, winDark) {
  return canvasTex(256, 512, (x, w, h) => {
    // masonry: brick courses + per-block tone shifts + grime near the base
    x.fillStyle = base; x.fillRect(0, 0, w, h);
    const bh = 8;
    for (let y = 0; y < h; y += bh) {
      x.fillStyle = (y / bh) % 2 ? 'rgba(0,0,0,.055)' : 'rgba(255,255,255,.045)';
      x.fillRect(0, y, w, 1);
      for (let bx = ((y / bh) % 2) * 16; bx < w; bx += 32) x.fillRect(bx, y, 1, bh);
    }
    for (let i = 0; i < 2600; i++) {
      x.fillStyle = Math.random() < 0.5 ? `rgba(0,0,0,${Math.random() * 0.09})` : `rgba(255,255,255,${Math.random() * 0.06})`;
      x.fillRect(Math.random() * w, Math.random() * h, 3, 2);
    }
    const grime = x.createLinearGradient(0, h * 0.82, 0, h);
    grime.addColorStop(0, 'rgba(30,25,20,0)'); grime.addColorStop(1, 'rgba(30,25,20,.38)');
    x.fillStyle = grime; x.fillRect(0, h * 0.82, w, h * 0.18);
    const cols = 6, rows = 14, cw = w / cols, ch = h / rows;
    for (let cx = 0; cx < cols; cx++) for (let cy = 0; cy < rows; cy++) {
      const wx = cx * cw + cw * 0.2, wy = cy * ch + ch * 0.18, ww = cw * 0.6, wh = ch * 0.56;
      const lit = Math.random() < 0.36;
      // recess shadow, then glass (gradient = sky bounce + interior depth)
      x.fillStyle = 'rgba(0,0,0,.42)'; x.fillRect(wx - 2, wy - 2, ww + 4, wh + 4);
      const g = x.createLinearGradient(0, wy, 0, wy + wh);
      if (lit) { g.addColorStop(0, '#fff3c4'); g.addColorStop(0.55, winLit); g.addColorStop(1, '#e8a94e'); }
      else { g.addColorStop(0, '#9fc4e0'); g.addColorStop(0.4, winDark); g.addColorStop(1, '#1d2833'); }
      x.fillStyle = g; x.fillRect(wx, wy, ww, wh);
      // cross mullion + glass sheen diagonal
      x.fillStyle = 'rgba(20,26,34,.55)'; x.fillRect(wx + ww / 2 - 1, wy, 2, wh); x.fillRect(wx, wy + wh / 2 - 1, ww, 2);
      x.fillStyle = 'rgba(255,255,255,.28)';
      x.beginPath(); x.moveTo(wx, wy + wh); x.lineTo(wx + ww * 0.45, wy); x.lineTo(wx + ww * 0.75, wy); x.lineTo(wx + ww * 0.3, wy + wh); x.closePath(); x.fill();
      if (lit && Math.random() < 0.3) { // curtain band on some lit windows
        x.fillStyle = 'rgba(120,70,30,.35)'; x.fillRect(wx, wy, ww, wh * 0.3);
      }
      if (Math.random() < 0.14) { // AC box under some windows
        x.fillStyle = '#c9ccd2'; x.fillRect(wx + ww * 0.2, wy + wh + 3, ww * 0.6, 7);
        x.fillStyle = 'rgba(0,0,0,.35)'; x.fillRect(wx + ww * 0.2, wy + wh + 8, ww * 0.6, 2);
      }
    }
    // stone band between floors every 4 rows
    x.fillStyle = 'rgba(255,255,255,.10)';
    for (let cy = 4; cy < rows; cy += 4) x.fillRect(0, cy * ch - 2, w, 3);
  });
}
const facadeMats = [
  ['#b8a894', '#ffd98a', '#3c4c60'], ['#9fb2c4', '#ffe2a0', '#33424f'],
  ['#c4b096', '#ffd98a', '#40382e'], ['#a8b8a4', '#fff0b8', '#37443c'],
  ['#c9a2a0', '#ffd98a', '#463a44'], ['#94a6bd', '#ffe9b0', '#2f3c4c'],
].map(([b, l, d]) => {
  const t = facadeTex(b, l, d);
  return new THREE.MeshStandardMaterial({ map: t, roughness: 0.92, metalness: 0.02 });
});
const roofTex = canvasTex(256, 256, (x, w, h) => {
  x.fillStyle = '#5c6066'; x.fillRect(0, 0, w, h);
  for (let i = 0; i < 3800; i++) {
    const v = 70 + Math.random() * 50;
    x.fillStyle = `rgba(${v},${v},${v + 4},.5)`;
    x.fillRect(Math.random() * w, Math.random() * h, 2, 2);
  }
  for (let i = 0; i < 7; i++) { // tar patches + seams
    x.fillStyle = 'rgba(0,0,0,.16)';
    x.fillRect(Math.random() * w * 0.7, Math.random() * h * 0.7, 30 + Math.random() * 60, 20 + Math.random() * 40);
  }
  x.fillStyle = 'rgba(0,0,0,.22)';
  x.fillRect(0, 0, w, 3); x.fillRect(0, 0, 3, h);
});
const roofMat = new THREE.MeshStandardMaterial({ map: roofTex, roughness: 1 });
const asphaltTex = canvasTex(256, 256, (x, w, h) => {
  x.fillStyle = '#43464c'; x.fillRect(0, 0, w, h);
  for (let i = 0; i < 4200; i++) {
    const v = 52 + Math.random() * 42;
    x.fillStyle = `rgba(${v},${v},${v + 6},.55)`;
    x.fillRect(Math.random() * w, Math.random() * h, 2, 2);
  }
  for (let i = 0; i < 5; i++) { // cracks + patches + oil stains
    x.strokeStyle = 'rgba(0,0,0,.30)'; x.lineWidth = 1.5; x.beginPath();
    let cx = Math.random() * w, cy = Math.random() * h; x.moveTo(cx, cy);
    for (let s = 0; s < 5; s++) { cx += (Math.random() - 0.5) * 46; cy += (Math.random() - 0.5) * 46; x.lineTo(cx, cy); }
    x.stroke();
    x.fillStyle = 'rgba(0,0,0,.13)'; x.beginPath();
    x.ellipse(Math.random() * w, Math.random() * h, 14 + Math.random() * 26, 8 + Math.random() * 14, Math.random() * 3, 0, 7); x.fill();
  }
  x.fillStyle = 'rgba(250,250,244,.9)';
  for (let px = 8; px < w; px += 42) x.fillRect(px, h / 2 - 2, 22, 4); // dashed centre line
  x.fillStyle = 'rgba(240,200,60,.55)'; x.fillRect(0, 4, w, 3); x.fillRect(0, h - 7, w, 3); // worn edge lines
});
asphaltTex.anisotropy = 8;
const walkTex = canvasTex(128, 128, (x, w, h) => {
  x.fillStyle = '#b9b3a6'; x.fillRect(0, 0, w, h);
  for (let i = 0; i < 1500; i++) { x.fillStyle = `rgba(0,0,0,${Math.random() * 0.08})`; x.fillRect(Math.random() * w, Math.random() * h, 2, 2); }
  for (let i = 0; i < 300; i++) { x.fillStyle = `rgba(255,255,255,${Math.random() * 0.07})`; x.fillRect(Math.random() * w, Math.random() * h, 2, 2); }
  x.strokeStyle = 'rgba(0,0,0,.30)'; x.lineWidth = 3; x.strokeRect(0, 0, w, h);
  x.strokeStyle = 'rgba(0,0,0,.12)'; x.lineWidth = 1; x.beginPath(); x.moveTo(0, h / 2); x.lineTo(w, h / 2); x.stroke();
});
const grassTex = canvasTex(256, 256, (x, w, h) => {
  x.fillStyle = '#558f43'; x.fillRect(0, 0, w, h);
  for (let i = 0; i < 9000; i++) { // blade flecks, two tones
    const g = 110 + Math.random() * 100;
    x.fillStyle = Math.random() < 0.24 ? 'rgba(214,188,90,.28)' : `rgba(${g * 0.5},${g},${g * 0.38},.5)`;
    x.fillRect(Math.random() * w, Math.random() * h, 1.6, 3.4);
  }
  for (let i = 0; i < 4; i++) { // worn patches
    x.fillStyle = 'rgba(150,128,74,.20)'; x.beginPath();
    x.ellipse(Math.random() * w, Math.random() * h, 20 + Math.random() * 30, 12 + Math.random() * 18, Math.random() * 3, 0, 7); x.fill();
  }
});
const barkTex = canvasTex(64, 128, (x, w, h) => {
  x.fillStyle = '#6b4a30'; x.fillRect(0, 0, w, h);
  for (let i = 0; i < 46; i++) {
    x.strokeStyle = `rgba(30,18,8,${0.25 + Math.random() * 0.3})`; x.lineWidth = 1 + Math.random() * 2;
    x.beginPath(); const bx = Math.random() * w; x.moveTo(bx, -4);
    x.bezierCurveTo(bx + 5, h * 0.3, bx - 5, h * 0.6, bx + 3, h + 4); x.stroke();
  }
  for (let i = 0; i < 300; i++) { x.fillStyle = `rgba(255,230,190,${Math.random() * 0.10})`; x.fillRect(Math.random() * w, Math.random() * h, 2, 3); }
}, { clamp: false });
const bullTex = canvasTex(256, 256, (x, w, h) => {
  const cx = w / 2, cy = h / 2;
  const rings = [[124, '#e8e4da'], [104, '#d23b47'], [80, '#e8e4da'], [56, '#2e6fd8'], [32, '#e8e4da'], [15, '#e8b62a']];
  for (const [r, col] of rings) { x.fillStyle = col; x.beginPath(); x.arc(cx, cy, r, 0, 7); x.fill(); }
  x.strokeStyle = 'rgba(60,40,20,.65)'; x.lineWidth = 5; x.beginPath(); x.arc(cx, cy, 125, 0, 7); x.stroke();
}, { clamp: true });
const ballTex = canvasTex(256, 128, (x, w, h) => {
  const cols = ['#ff5d5d', '#ffd93b', '#3fa7ff', '#ffffff', '#5dd95d', '#ff9f2e'];
  const cw = w / cols.length;
  cols.forEach((c, i) => { x.fillStyle = c; x.fillRect(i * cw, 0, cw + 1, h); });
}, { clamp: true });
const kiteTex = canvasTex(128, 128, (x, w, h) => {
  x.fillStyle = '#ffcf3f'; x.fillRect(0, 0, w, h);
  x.fillStyle = '#e23b4e'; x.beginPath(); x.moveTo(0, 0); x.lineTo(w, 0); x.lineTo(w / 2, h / 2); x.closePath(); x.fill();
  x.fillStyle = '#2e6fd8'; x.beginPath(); x.moveTo(0, h); x.lineTo(w, h); x.lineTo(w / 2, h / 2); x.closePath(); x.fill();
  x.fillStyle = '#fff'; x.beginPath(); x.arc(w / 2, h / 2, 13, 0, 7); x.fill();
}, { clamp: true });

/* shared materials / geometries */
const hitMat = new THREE.MeshBasicMaterial({ transparent: true, opacity: 0, depthWrite: false, colorWrite: false });
const M = {
  std: (color, rough = 0.9) => new THREE.MeshStandardMaterial({ color, roughness: rough }),
};
const GEO = {
  box: new THREE.BoxGeometry(1, 1, 1),
  cyl: new THREE.CylinderGeometry(0.5, 0.5, 1, 10),
  sph: new THREE.SphereGeometry(0.5, 14, 10),
  cone: new THREE.ConeGeometry(0.5, 1, 10),
  circ: new THREE.CircleGeometry(0.5, 24),
  plane: new THREE.PlaneGeometry(1, 1),
};
function mesh(geo, mat, parent, x = 0, y = 0, z = 0, sx = 1, sy = 1, sz = 1) {
  const m = new THREE.Mesh(geo, mat);
  m.position.set(x, y, z); m.scale.set(sx, sy, sz);
  if (parent) parent.add(m);
  return m;
}

/* hit registry: every shootable thing registers proxy meshes here */
const hitList = [];       // all raycast candidates (targets + fouls + occluders)
function regHit(m, cat, ref) { m.userData.hit = { cat, ref }; hitList.push(m); return m; }
function unregHit(m) { const i = hitList.indexOf(m); if (i >= 0) hitList.splice(i, 1); }

/* ============================================================
   THE CITY
   ============================================================ */
const AVENUES = [26, -6, -38, -70, -102];           // street centre-lines (along X)
const CROSS = [-66, -33, 33, 66];                    // street centre-lines (along Z)
const PARK = { x0: 8, x1: 58, z0: -2, z1: 19 };    // the park block — first block across the avenue, visible from the roof
const POND = { x: 33, z: 8.5, r: 6 };
const occluders = [];
function regOcc(m) { regHit(m, 'occ', null); occluders.push(m); return m; }

const boardSpots = [];   // {pos:Vector3, ry} places a target board can stand
const canSpots = [];     // {pos:Vector3} ledges for cans
const pinSpots = [];     // {pos:Vector3, ry} pinwheel mounts
const roofPeopleSpots = []; // {ax,az,bx,bz,y} rooftop stroller paths (people — fouls, never targets)

{ // sky dome + sun + clouds
  const sky = new THREE.Mesh(new THREE.SphereGeometry(420, 28, 16),
    new THREE.MeshBasicMaterial({ map: skyTex, side: THREE.BackSide, fog: false }));
  scene.add(sky);
  const sunDisc = mesh(GEO.circ, new THREE.MeshBasicMaterial({ color: 0xfff6d8, fog: false }), scene, 150, 190, -330, 42, 42, 1);
  sunDisc.lookAt(0, 30, 47);
  const sunGlow = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTex, color: 0xffe9a8, transparent: true, opacity: 0.85, depthWrite: false, fog: false }));
  sunGlow.scale.set(150, 150, 1); sunGlow.position.set(150, 190, -330); scene.add(sunGlow);
}
const clouds = [];
{
  const cm = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 1, emissive: 0x8899aa, emissiveIntensity: 0.25 });
  for (let i = 0; i < 9; i++) {
    const g = new THREE.Group();
    const n = 3 + (rng() * 3 | 0);
    for (let j = 0; j < n; j++) {
      const s = mesh(GEO.sph, cm, g, j * rr(3, 5.5) - n * 2, rr(-0.6, 0.6), rr(-1.5, 1.5), rr(6, 11), rr(2.2, 3.4), rr(4, 6));
      s.castShadow = false;
    }
    g.position.set(rr(-190, 190), rr(52, 84), rr(-190, -30));
    scene.add(g); clouds.push({ g, v: rr(0.5, 1.1) });
  }
}
{ // ground base + streets + sidewalks
  const base = mesh(GEO.plane, M.std(0x8a8272, 1), scene, 0, 0, -55, 320, 250, 1);
  base.rotation.x = -Math.PI / 2; base.receiveShadow = true; regOcc(base);
  const asphMat = new THREE.MeshStandardMaterial({ map: asphaltTex, roughness: 0.95 });
  for (const z of AVENUES) {
    const m1 = asphMat.clone(); m1.map = asphaltTex.clone(); m1.map.needsUpdate = true; m1.map.repeat.set(26, 1);
    const st = mesh(GEO.plane, m1, scene, 0, 0.03, z, 270, 11, 1);
    st.rotation.x = -Math.PI / 2; st.receiveShadow = true;
    const wMat = new THREE.MeshStandardMaterial({ map: walkTex, roughness: 1 });
    for (const s of [-1, 1]) {
      const wk = mesh(GEO.box, wMat, scene, 0, 0.06, z + s * 6.7, 270, 0.12, 2.3);
      wk.receiveShadow = true;
    }
  }
  for (const x of CROSS) {
    const m1 = asphMat.clone(); m1.map = asphaltTex.clone(); m1.map.needsUpdate = true; m1.map.repeat.set(15, 1);
    const st = mesh(GEO.plane, m1, scene, x, 0.025, -42, 11, 158, 1);
    st.rotation.x = -Math.PI / 2; st.rotation.z = Math.PI / 2; st.receiveShadow = true;
  }
}
/* trees (shared build) */
const trunkMat = new THREE.MeshStandardMaterial({ map: barkTex, roughness: 1 }), leafMats = [M.std(0x4d9240, 1), M.std(0x5da24a, 1), M.std(0x3f8438, 1)];
function tree(parent, x, z, s = 1) {
  const g = new THREE.Group(); g.position.set(x, 0, z); g.scale.setScalar(s); parent.add(g);
  const tr = mesh(GEO.cyl, trunkMat, g, 0, 1.1, 0, 0.35, 2.2, 0.35); tr.castShadow = true;
  const lm = pick(leafMats);
  const c1 = mesh(GEO.sph, lm, g, 0, 3.1, 0, 3.1, 2.9, 3.1); c1.castShadow = true;
  mesh(GEO.sph, lm, g, 0.9, 2.4, 0.4, 2.0, 1.8, 2.0);
  mesh(GEO.sph, lm, g, -0.9, 2.5, -0.3, 1.8, 1.7, 1.8);
  return g;
}
{ // buildings
  const bands = [ // height ranges widened Nov 7 (Tom) — a varied skyline, not a grid of clones
    { z0: -0.5, z1: 20.5, h: [10, 21] }, { z0: -32.5, z1: -11.5, h: [13, 27] },
    { z0: -64.5, z1: -43.5, h: [15, 31] }, { z0: -96.5, z1: -75.5, h: [18, 38] },
    { z0: -126, z1: -107.5, h: [24, 50] },
  ];
  const slots = [[-128, -71.5], [-60.5, -38.5], [-27.5, 27.5], [38.5, 60.5], [71.5, 128]];
  const wtMat = M.std(0x9a6b46, 0.95), acMat = M.std(0xb9c0c7, 0.7);
  bands.forEach((band, bi) => {
    const depth = (band.z1 - band.z0) * 0.8, zc = (band.z0 + band.z1) / 2;
    for (const [sx0, sx1] of slots) {
      const w = sx1 - sx0, n = w > 40 ? 3 : (w > 26 ? 2 : 1);
      for (let i = 0; i < n; i++) {
        const px0 = sx0 + (w / n) * i, px1 = sx0 + (w / n) * (i + 1);
        const cx = (px0 + px1) / 2;
        if (bi === 2 && cx > PARK.x0 - 4 && cx < PARK.x1 + 4) continue; // park block
        const bw = (px1 - px0) * rr(0.66, 0.94), bd = depth * rr(0.85, 1);
        /* Tom (Nov 7): thin the city out — roughly a third of the towers become
           open lots (plaza + crate + ground-level target spots), opening up
           sightlines and sky and adding street-level targets. */
        const slotI = slots.findIndex(s => s[0] === sx0);
        const isLot = bi === 0 ? ((slotI + i) % 4 === 3) : ((slotI + i + bi) % 3 === 2);
        if (isLot) {
          const plaza = mesh(GEO.box, M.std(0xa79b7e, 1), scene, cx, 0.07, zc, bw, 0.14, bd);
          plaza.receiveShadow = true; regOcc(plaza);
          const crate = mesh(GEO.box, M.std(0x8a6642, 1), scene, cx + bw * 0.25, 0.55, zc, 1.1, 1.1, 1.1);
          crate.castShadow = true; regOcc(crate);
          canSpots.push({ pos: new THREE.Vector3(crate.position.x, 1.1, crate.position.z) });
          boardSpots.push({ pos: new THREE.Vector3(cx - bw * 0.2, 0, zc + bd * 0.2), ry: rr(-0.2, 0.2) });
          pinSpots.push({ pos: new THREE.Vector3(cx + bw * 0.35, 0, zc - bd * 0.25), ry: 0 });
          if (rng() < 0.55) tree(scene, cx - bw * 0.35, zc - bd * 0.2, rr(0.9, 1.25));
          continue;
        }
        const h = rr(band.h[0], band.h[1]);
        const fm = pick(facadeMats).clone();
        fm.map = fm.map.clone(); fm.map.needsUpdate = true;
        fm.map.repeat.set(Math.max(1, Math.round(bw / 7)), Math.max(2, Math.round(h / 9)));
        const b = new THREE.Mesh(GEO.box, [fm, fm, roofMat, roofMat, fm, fm]);
        b.scale.set(bw, h, bd); b.position.set(cx, h / 2, zc + rr(-1, 1));
        b.castShadow = bi < 4; b.receiveShadow = true;
        scene.add(b); regOcc(b);
        /* --- house branding worked into the streetscape --- */
        if (bi === 0 && h >= 13) { // ground-floor shop sign facing the avenue
          const sg = mesh(GEO.box, pick(shopSignMats), scene, cx, 3.4, b.position.z + bd / 2 + 0.35, Math.min(bw * 0.62, 11), 1.5, 0.5);
          sg.castShadow = true;
          if (rng() < 0.75) { // canvas awning over the shop front — street-level life
            const aw = mesh(GEO.box, M.std(pick([0xc4553b, 0x3f7d5d, 0x38618f, 0xd9a441]), 0.9), scene, cx, 2.5, b.position.z + bd / 2 + 0.6, Math.min(bw * 0.6, 10.5), 0.08, 1.6);
            aw.rotation.x = 0.3;
          }
        }
        if (bi <= 1 && h >= 21 && rng() < 0.6) { // rooftop billboard on a pole frame (chance up Nov 7 — fewer towers, branding stays prominent)
          const bg2 = new THREE.Group();
          bg2.position.set(cx + bw * rr(-0.15, 0.15), h, b.position.z);
          scene.add(bg2);
          const poleMat = M.std(0x3c4148, 0.7);
          mesh(GEO.cyl, poleMat, bg2, -3.4, 1.6, 0, 0.22, 3.2, 0.22);
          mesh(GEO.cyl, poleMat, bg2, 3.4, 1.6, 0, 0.22, 3.2, 0.22);
          const panel = mesh(GEO.box, brandMats.billboard, bg2, 0, 5.4, 0, 13, 4.9, 0.35);
          panel.castShadow = true;
          mesh(GEO.box, poleMat, bg2, 0, 5.4, -0.3, 13.4, 5.3, 0.15);
        }
        if (bi === 1 && rng() < 0.5) { // banner strung across the facade
          const bn = mesh(GEO.plane, brandMats.banner, scene, cx, h * 0.62, b.position.z + bd / 2 + 0.12, Math.min(bw * 0.8, 15), 3.4, 1);
          bn.rotation.y = 0;
        }
        if (bi <= 2 && h <= 26) { // dress near roofs: props + target spots
          const ry = h, rz = b.position.z;
          if (rng() < 0.55) { // water tower
            const g = new THREE.Group(); g.position.set(cx - bw * 0.22, ry, rz - bd * 0.15); scene.add(g);
            for (const [lx, lz] of [[-0.9, -0.9], [0.9, -0.9], [-0.9, 0.9], [0.9, 0.9]])
              mesh(GEO.box, wtMat, g, lx, 1, lz, 0.18, 2, 0.18);
            const tank = mesh(GEO.cyl, wtMat, g, 0, 3.1, 0, 3.4, 2.4, 3.4); tank.castShadow = true; regOcc(tank);
            mesh(GEO.cone, M.std(0x6e4e2e, 1), g, 0, 4.9, 0, 3.9, 1.3, 3.9);
          }
          if (rng() < 0.7) { // AC unit — can ledge on top
            const ac = mesh(GEO.box, acMat, scene, cx + bw * rr(0.1, 0.3), ry + 0.55, rz + bd * rr(0.05, 0.3), rr(1.6, 2.6), 1.1, rr(1.4, 2));
            ac.castShadow = true; regOcc(ac);
            canSpots.push({ pos: new THREE.Vector3(ac.position.x, ry + 1.1, ac.position.z) });
          }
          if (rng() < 0.5) mesh(GEO.cyl, acMat, scene, cx - bw * 0.3, ry + 0.8, rz + bd * 0.25, 0.7, 1.6, 0.7); // vent
          boardSpots.push({ pos: new THREE.Vector3(cx + bw * 0.18, ry, rz + bd * 0.28), ry: 0, roof: true });
          pinSpots.push({ pos: new THREE.Vector3(cx - bw * 0.34, ry, rz + bd * 0.42), ry: 0 });
          canSpots.push({ pos: new THREE.Vector3(cx + bw * 0.3, ry, rz + bd * 0.45) });
          /* Tom (Nov 7): more to shoot at per roof — second board / pin / can on many roofs */
          if (rng() < 0.5) boardSpots.push({ pos: new THREE.Vector3(cx - bw * 0.3, ry, rz - bd * 0.3), ry: rr(-0.3, 0.3), roof: true });
          if (rng() < 0.4) pinSpots.push({ pos: new THREE.Vector3(cx + bw * 0.36, ry, rz - bd * 0.38), ry: 0 });
          if (rng() < 0.35) canSpots.push({ pos: new THREE.Vector3(cx - bw * 0.05, ry, rz - bd * 0.45) });
          if (bi <= 1 && h <= 26 && rng() < 0.55) roofPeopleSpots.push({ ax: cx - bw * 0.3, az: rz + bd * 0.1, bx: cx + bw * 0.3, bz: rz + bd * 0.1, y: ry });
        }
        if (bi === 3 && rng() < 0.5) // far roofs carry boards too — scoped targets at distance
          boardSpots.push({ pos: new THREE.Vector3(cx, h, b.position.z + bd * 0.3), ry: 0, roof: true });
      }
    }
  });
  // far skyline silhouettes (beyond the playable grid)
  const silMat = M.std(0x7e97b5, 1);
  for (let i = 0; i < 16; i++) {
    const h = rr(30, 72), x = -170 + i * 22 + rr(-5, 5);
    const s = mesh(GEO.box, silMat, scene, x, h / 2, rr(-168, -148), rr(13, 19), h, 14);
    s.castShadow = false;
  }
  for (const sx of [-1, 1]) for (let i = 0; i < 6; i++) {
    const h = rr(26, 55);
    mesh(GEO.box, silMat, scene, sx * rr(138, 155), h / 2, -20 - i * 24, 14, h, rr(13, 18));
  }
}
{ // the park
  const g = new THREE.Group(); scene.add(g);
  const lawnMat = new THREE.MeshStandardMaterial({ map: grassTex, roughness: 1 });
  lawnMat.map = grassTex.clone(); lawnMat.map.needsUpdate = true; lawnMat.map.repeat.set(7, 3);
  const lawn = mesh(GEO.box, lawnMat, g, (PARK.x0 + PARK.x1) / 2, 0.09, (PARK.z0 + PARK.z1) / 2, PARK.x1 - PARK.x0, 0.18, PARK.z1 - PARK.z0);
  lawn.receiveShadow = true; regOcc(lawn);
  const pathMat = M.std(0xcfc4a8, 1);
  mesh(GEO.box, pathMat, g, 33, 0.2, 2, 50, 0.06, 2.4).receiveShadow = true;
  mesh(GEO.box, pathMat, g, 14, 0.2, 8.5, 2.4, 0.06, 21).receiveShadow = true;
  const pond = mesh(GEO.circ, new THREE.MeshStandardMaterial({ color: 0x3f8fd2, roughness: 0.25, metalness: 0.1 }), g, POND.x, 0.22, POND.z, POND.r * 2, POND.r * 2, 1);
  pond.rotation.x = -Math.PI / 2;
  const rim = mesh(new THREE.TorusGeometry(POND.r, 0.22, 8, 32), M.std(0xb9b3a6, 1), g, POND.x, 0.22, POND.z);
  rim.rotation.x = Math.PI / 2;
  for (let i = 0; i < 15; i++) { // park trees, kept off the pond + paths
    let x, z, ok = false;
    while (!ok) { x = rr(PARK.x0 + 2, PARK.x1 - 2); z = rr(PARK.z0 + 2, PARK.z1 - 2); ok = Math.hypot(x - POND.x, z - POND.z) > POND.r + 2.4 && Math.abs(z - 2) > 2.6 && Math.abs(x - 14) > 2.6; }
    tree(g, x, z, rr(0.85, 1.3));
  }
  const benchMat = M.std(0x8a6642, 1), ironMat = M.std(0x3c4148, 0.8);
  [[18, 15.5], [48, 15.5], [18, 1.5], [48, 1.5]].forEach(([bx, bz], i) => {
    const bg = new THREE.Group(); bg.position.set(bx, 0.18, bz); bg.rotation.y = (i % 2 ? Math.PI : 0) + (bz > 8.5 ? Math.PI : 0); g.add(bg);
    mesh(GEO.box, benchMat, bg, 0, 0.5, 0, 2.4, 0.1, 0.55);
    mesh(GEO.box, benchMat, bg, 0, 0.95, -0.28, 2.4, 0.5, 0.08);
    mesh(GEO.box, ironMat, bg, -1, 0.25, 0, 0.1, 0.5, 0.5); mesh(GEO.box, ironMat, bg, 1, 0.25, 0, 0.1, 0.5, 0.5);
    if (i < 2) canSpots.push({ pos: new THREE.Vector3(bx + 0.6, 0.73, bz) });
  });
  for (const [lx, lz] of [[10, 17], [56, 17], [10, 0], [56, 0]]) { // lamp posts
    mesh(GEO.cyl, ironMat, g, lx, 1.6, lz, 0.14, 3.2, 0.14);
    mesh(GEO.sph, new THREE.MeshStandardMaterial({ color: 0xfff2c8, emissive: 0xffdf94, emissiveIntensity: 0.7 }), g, lx, 3.3, lz, 0.5, 0.5, 0.5);
  }
  // park fence along the south edge (avenue 26 side) — one pinwheel mounts here
  const fenceMat = M.std(0x6e5136, 1);
  for (let fx = PARK.x0; fx <= PARK.x1; fx += 3.1) mesh(GEO.box, fenceMat, g, fx, 0.55, PARK.z1 - 0.4, 0.12, 1.1, 0.12);
  mesh(GEO.box, fenceMat, g, (PARK.x0 + PARK.x1) / 2, 1.02, PARK.z1 - 0.4, PARK.x1 - PARK.x0, 0.09, 0.09);
  pinSpots.push({ pos: new THREE.Vector3(14, 1.1, PARK.z1 - 0.4), ry: 0 });
  boardSpots.push({ pos: new THREE.Vector3(24, 0.18, 15), ry: 0.12 });
  boardSpots.push({ pos: new THREE.Vector3(44, 0.18, 1), ry: -0.1 });
}
/* sidewalk trees along the near avenues */
for (const z of [19.6, -12.9]) for (let x = -58; x <= 58; x += 15.5) { // denser street trees (Nov 7)
  if (Math.abs(x) < 8) continue;
  tree(scene, x + rr(-2, 2), z + (z > 0 ? 0.9 : -0.9), rr(0.7, 0.95));
}
/* ---------------- the player's rooftop ---------------- */
const pigeonSpots = [];
{
  const g = new THREE.Group(); scene.add(g);
  const fm = facadeMats[1].clone(); fm.map = fm.map.clone(); fm.map.needsUpdate = true; fm.map.repeat.set(5, 3);
  const b = new THREE.Mesh(GEO.box, [fm, fm, roofMat, roofMat, fm, fm]);
  b.scale.set(34, 28.4, 22); b.position.set(0, 14.2, 50.6); b.receiveShadow = true; scene.add(b); regOcc(b);
  const slab = mesh(GEO.box, M.std(0x74777c, 1), g, 0, 28.55, 50.4, 35, 0.5, 23);
  slab.receiveShadow = true;
  const roofBrand = mesh(GEO.plane, brandMats.roof, g, 7.5, 28.83, 52, 9, 9, 1); // LUNC painted on your own roof
  roofBrand.rotation.x = -Math.PI / 2;
  const parMat = M.std(0x8d9299, 1);
  const front = mesh(GEO.box, parMat, g, 0, 29.4, 39.7, 35, 1.2, 0.55); regOcc(front);
  mesh(GEO.box, parMat, g, -17.2, 29.4, 50.6, 0.55, 1.2, 22);
  mesh(GEO.box, parMat, g, 17.2, 29.4, 50.6, 0.55, 1.2, 22);
  // sandbag nest on the parapet, flanking the aim line — dressing you
  // only see at the bottom of the frame when you aim down at the city
  const bagMat = M.std(0xa08b62, 1);
  for (const sx of [-1, 1]) for (let i = 0; i < 3; i++) {
    const bx = sx * (1.9 + i * 1.05);
    const bag = mesh(GEO.sph, bagMat, g, bx, 30.22, 39.75, 1.05, 0.45, 0.65);
    bag.castShadow = true;
    if (i < 2) mesh(GEO.sph, bagMat, g, bx + sx * 0.3, 30.62, 39.75, 0.95, 0.4, 0.6);
  }
  const acMat = M.std(0xb9c0c7, 0.7);
  const ac1 = mesh(GEO.box, acMat, g, -9, 29.4, 44, 3.4, 1.7, 2.4); ac1.castShadow = true; regOcc(ac1);
  const ac2 = mesh(GEO.box, acMat, g, 11, 29.2, 52, 2.6, 1.3, 2); ac2.castShadow = true;
  mesh(GEO.cyl, acMat, g, 6, 29.8, 43, 0.8, 2, 0.8);
  // water tower behind you
  const wtMat = M.std(0x9a6b46, 0.95);
  const wg = new THREE.Group(); wg.position.set(-12.5, 28.8, 55); g.add(wg);
  for (const [lx, lz] of [[-1.1, -1.1], [1.1, -1.1], [-1.1, 1.1], [1.1, 1.1]]) mesh(GEO.box, wtMat, wg, lx, 1.4, lz, 0.22, 2.8, 0.22);
  mesh(GEO.cyl, wtMat, wg, 0, 4.1, 0, 4.4, 3, 4.4);
  mesh(GEO.cone, M.std(0x6e4e2e, 1), wg, 0, 6.3, 0, 5, 1.6, 5);
  pinSpots.push({ pos: new THREE.Vector3(-16.6, 30.0, 39.7), ry: 0 });
  pinSpots.push({ pos: new THREE.Vector3(16.6, 30.0, 39.7), ry: 0 });
  for (let i = 0; i < 6; i++) pigeonSpots.push(new THREE.Vector3(-14 + i * 5.6, 30.0, 39.7));
}

/* ============================================================
   CITY LIFE — cars, people, animals (all fouls if shot)
   ============================================================ */
function roundedRectRoute(x0, z0, x1, z1, r = 5) {
  const pts = [];
  const corners = [[x1 - r, z0, 1, 0], [x1, z1 - r, 0, 1], [x0 + r, z1, -1, 0], [x0, z0 + r, 0, -1]];
  // walk the perimeter clockwise with rounded corners
  const edge = (ax, az, bx, bz) => { const d = Math.hypot(bx - ax, bz - az), n = Math.max(2, Math.round(d / 4)); for (let i = 0; i < n; i++) pts.push(new THREE.Vector3(ax + (bx - ax) * i / n, 0, az + (bz - az) * i / n)); };
  const arc = (cx, cz, a0, a1) => { const n = 5; for (let i = 0; i < n; i++) { const a = a0 + (a1 - a0) * i / n; pts.push(new THREE.Vector3(cx + Math.cos(a) * r, 0, cz + Math.sin(a) * r)); } };
  edge(x0 + r, z0, x1 - r, z0); arc(x1 - r, z0 + r, -Math.PI / 2, 0);
  edge(x1, z0 + r, x1, z1 - r); arc(x1 - r, z1 - r, 0, Math.PI / 2);
  edge(x1 - r, z1, x0 + r, z1); arc(x0 + r, z1 - r, Math.PI / 2, Math.PI);
  edge(x0, z1 - r, x0, z0 + r); arc(x0 + r, z0 + r, Math.PI, Math.PI * 1.5);
  return pts;
}
function loopWalker(route) {
  const segs = []; let total = 0;
  for (let i = 0; i < route.length; i++) {
    const a = route[i], b = route[(i + 1) % route.length];
    const len = a.distanceTo(b); segs.push({ a, b, len, start: total }); total += len;
  }
  return { route, segs, total,
    at(d, out, dirOut) {
      d = ((d % total) + total) % total;
      let s = segs[segs.length - 1];
      for (const sg of segs) if (d >= sg.start && d <= sg.start + sg.len) { s = sg; break; }
      const t = s.len ? (d - s.start) / s.len : 0;
      out.lerpVectors(s.a, s.b, t);
      if (dirOut) dirOut.subVectors(s.b, s.a).normalize();
      return out;
    } };
}
/* ---------------- cars ---------------- */
const cars = [];
const carPaints = [0xe74c3c, 0x3498db, 0xf5c542, 0x2ecc71, 0xff8c42, 0x9b59b6, 0xecf0f1, 0xe91e63, 0x1abc9c, 0xf39c12, 0x5d8aa8, 0xd35400];
function makeCar(route, dist0, speed, withSign, kind = 'car') {
  const g = new THREE.Group(); scene.add(g);
  g.scale.setScalar(kind === 'truck' ? 1.1 : 1.16); // slightly bigger (Nov 7) — traffic must read from the rooftop perch
  const paint = new THREE.MeshStandardMaterial({ color: pick(carPaints), roughness: 0.32, metalness: 0.55 });
  const glass = new THREE.MeshStandardMaterial({ color: 0x2a3d4f, roughness: 0.12, metalness: 0.6 });
  const car = { g, speed, baseSpeed: speed, dist: dist0, walker: loopWalker(route), fleeT: 0, wheels: [], sign: null, signT: 0, honkCd: 0 };
  let body;
  if (kind === 'truck') { // delivery truck wearing the LUNA CLASSIC livery
    body = new THREE.Mesh(GEO.box, [brandMats.truck, brandMats.truck, M.std(0xdfe3e8, 0.6), M.std(0x9aa0a8, 0.8), paint, paint]);
    body.scale.set(2.3, 2.5, 5.6); body.position.set(0, 1.65, -0.4); body.castShadow = true; g.add(body);
    const cab = mesh(GEO.box, paint, g, 0, 0.95, 2.9, 2.1, 1.15, 1.3); cab.castShadow = true;
    mesh(GEO.box, glass, g, 0, 1.2, 3.56, 1.8, 0.5, 0.06);
    regHit(body, 'foul', { kind: 'car', car }); regHit(cab, 'foul', { kind: 'car', car });
  } else {
    body = mesh(GEO.box, paint, g, 0, 0.62, 0, 1.9, 0.62, 4.3); body.castShadow = true;
    const cabin = mesh(GEO.box, glass, g, 0, 1.16, -0.25, 1.7, 0.55, 2.1); cabin.castShadow = true;
    regHit(body, 'foul', { kind: 'car', car });
    regHit(cabin, 'foul', { kind: 'car', car });
  }
  mesh(GEO.box, new THREE.MeshStandardMaterial({ color: 0xffe9a8, emissive: 0xffca55, emissiveIntensity: 0.55, roughness: 0.4 }), g, -0.6, 0.66, kind === 'truck' ? 3.56 : 2.16, 0.34, 0.16, 0.05);
  mesh(GEO.box, new THREE.MeshStandardMaterial({ color: 0xffe9a8, emissive: 0xffca55, emissiveIntensity: 0.55, roughness: 0.4 }), g, 0.6, 0.66, kind === 'truck' ? 3.56 : 2.16, 0.34, 0.16, 0.05);
  mesh(GEO.box, M.std(0xd23b47, 0.4), g, -0.6, 0.66, kind === 'truck' ? -3.21 : -2.16, 0.34, 0.16, 0.05);
  mesh(GEO.box, M.std(0xd23b47, 0.4), g, 0.6, 0.66, kind === 'truck' ? -3.21 : -2.16, 0.34, 0.16, 0.05);
  const wheelGeo = new THREE.CylinderGeometry(0.37, 0.37, 0.24, 12);
  const wheelMat = M.std(0x1c1e22, 0.9);
  for (const [wx, wz] of (kind === 'truck' ? [[-1.0, 2.2], [1.0, 2.2], [-1.0, -2.2], [1.0, -2.2]] : [[-0.88, 1.4], [0.88, 1.4], [-0.88, -1.4], [0.88, -1.4]])) {
    const w = mesh(wheelGeo, wheelMat, g, wx, 0.37, wz);
    w.rotation.z = Math.PI / 2; car.wheels.push(w);
  }
  if (withSign) {
    const sg = new THREE.Group(); sg.position.set(0, 1.44, -0.25); g.add(sg);
    mesh(GEO.cyl, M.std(0x555b63, 0.6), sg, 0, 0.25, 0, 0.09, 0.5, 0.09);
    const disc = mesh(GEO.circ, new THREE.MeshStandardMaterial({ map: bullTex, roughness: 0.6 }), sg, 0, 0.95, 0, 1.5, 1.5, 1);
    disc.material.side = THREE.DoubleSide;
    car.sign = disc; car.signGroup = sg;
    regHit(disc, 'target', { type: 'sign', car, pts: 100 });
  }
  cars.push(car);
  return car;
}
{
  const R1 = roundedRectRoute(-33, -6, 33, 26), R2 = roundedRectRoute(-66, -38, -33, -6),
        R3 = roundedRectRoute(33, -70, 66, -38), R4 = roundedRectRoute(-33, -102, 33, -70),
        R5 = roundedRectRoute(-66, -102, 66, -70); // outer loop on the far avenues (Nov 7)
  makeCar(R1, 0, 8.5, true); makeCar(R1, 70, 9.5, false); makeCar(R1, 150, 8, false, 'truck'); makeCar(R1, 210, 10, false);
  makeCar(R1, 100, 9.2, false); makeCar(R1, 260, 8.6, false);
  makeCar(R2, 20, 9, true); makeCar(R2, 110, 8.2, false); makeCar(R2, 190, 9.8, false, 'truck');
  makeCar(R2, 160, 9.6, true);
  makeCar(R3, 40, 8.8, true); makeCar(R3, 130, 9.4, false); makeCar(R3, 200, 8.4, false);
  makeCar(R3, 90, 10.2, false);
  makeCar(R4, 60, 10.5, false); makeCar(R4, 190, 9.2, false);
  makeCar(R4, 130, 8.8, false, 'truck');
  makeCar(R5, 30, 9.0, true); makeCar(R5, 170, 9.7, false);
}
const _v1 = new THREE.Vector3(), _v2 = new THREE.Vector3();
function updateCars(dt) {
  for (const c of cars) {
    if (c.fleeT > 0) c.fleeT -= dt;
    const sp = c.baseSpeed * (c.fleeT > 0 ? 1.7 : 1);
    c.dist += sp * dt;
    c.walker.at(c.dist, _v1, _v2);
    c.g.position.set(_v1.x, 0, _v1.z);
    const targetYaw = Math.atan2(_v2.x, _v2.z);
    let dy = targetYaw - c.g.rotation.y;
    while (dy > Math.PI) dy -= Math.PI * 2; while (dy < -Math.PI) dy += Math.PI * 2;
    c.g.rotation.y += dy * Math.min(1, dt * 7);
    if (c.fleeT > 0) c.g.rotation.z = Math.sin(perfNow * 30 + c.dist) * 0.02; else c.g.rotation.z = 0;
    for (const w of c.wheels) w.rotation.x += sp * dt / 0.37;
    if (c.signT > 0) { // sign knocked down — counts back up, then pops back
      c.signT -= dt;
      if (c.signT <= 0 && c.signGroup) c.signGroup.visible = true;
    }
    if (c.honkCd > 0) c.honkCd -= dt;
  }
}
/* ---------------- people ---------------- */
const people = [];
const shirtPalette = [0xff6b6b, 0xffd93b, 0x6bcbff, 0x95e06c, 0xff9ff3, 0xfeca57, 0x48dbfb, 0xff9f43, 0x1dd1a1, 0xee5a6f, 0xc8d6e5, 0xf368e0];
const skinPalette = [0xf2c79b, 0xd9a066, 0xa06a3b, 0x7a4a24, 0xffe0bd];
function makePerson(path) {
  const g = new THREE.Group(); scene.add(g);
  const shirt = M.std(pick(shirtPalette), 0.95), pants = M.std(pick([0x33506e, 0x59452e, 0x3e3e46, 0x6e3333, 0x2e5e4e]), 0.95);
  const skin = M.std(pick(skinPalette), 0.8);
  const p = { g, path, t: rng(), dir: rng() < 0.5 ? 1 : -1, speed: rr(1.05, 1.65), phase: rr(0, 6), startleT: 0, yaw: 0, baseY: 0 };
  const legGeo = GEO.box;
  p.legL = new THREE.Group(); p.legL.position.set(-0.13, 0.86, 0); g.add(p.legL);
  p.legR = new THREE.Group(); p.legR.position.set(0.13, 0.86, 0); g.add(p.legR);
  mesh(legGeo, pants, p.legL, 0, -0.3, 0, 0.19, 0.62, 0.22).castShadow = true;
  mesh(legGeo, pants, p.legR, 0, -0.3, 0, 0.19, 0.62, 0.22).castShadow = true;
  const torso = mesh(GEO.box, shirt, g, 0, 1.2, 0, 0.56, 0.68, 0.3); torso.castShadow = true;
  p.armL = new THREE.Group(); p.armL.position.set(-0.35, 1.48, 0); g.add(p.armL);
  p.armR = new THREE.Group(); p.armR.position.set(0.35, 1.48, 0); g.add(p.armR);
  mesh(GEO.box, shirt, p.armL, 0, -0.24, 0, 0.14, 0.52, 0.17);
  mesh(GEO.box, shirt, p.armR, 0, -0.24, 0, 0.14, 0.52, 0.17);
  mesh(GEO.sph, skin, g, 0, 1.76, 0, 0.42, 0.46, 0.42);
  mesh(GEO.sph, M.std(pick([0x2c2018, 0x59452e, 0x14100c, 0x8a6a3b, 0xb0b0b0]), 1), g, 0, 1.86, -0.03, 0.45, 0.3, 0.45);
  const proxy = mesh(GEO.cyl, hitMat, g, 0, 0.95, 0, 0.74, 1.9, 0.74);
  regHit(proxy, 'foul', { kind: 'person', ref: p });
  p.proxy = proxy;
  people.push(p);
  return p;
}
function pingpongPath(ax, az, bx, bz) { return { kind: 'pp', a: new THREE.Vector3(ax, 0, az), b: new THREE.Vector3(bx, 0, bz), len: Math.hypot(bx - ax, bz - az) }; }
function wanderPath(x0, z0, x1, z1, avoid) { return { kind: 'wd', x0, z0, x1, z1, avoid, target: null, pauseT: 0 }; }
{
  const lines = [
    pingpongPath(-58, 19.8, 58, 19.8), pingpongPath(-58, 19.8, 58, 19.8), pingpongPath(-58, 19.8, 58, 19.8),
    pingpongPath(-58, 19.8, 58, 19.8), pingpongPath(-58, 19.8, 58, 19.8),
    pingpongPath(-58, -13.2, 58, -13.2), pingpongPath(-58, -13.2, 58, -13.2),
    pingpongPath(-58, -13.2, 58, -13.2), pingpongPath(-58, -13.2, 58, -13.2),
    pingpongPath(-58, -31.6, 58, -31.6), pingpongPath(-58, -31.6, 58, -31.6), pingpongPath(-58, -31.6, 58, -31.6),
    pingpongPath(-56, -63.4, 2, -63.4), pingpongPath(-56, -63.4, 2, -63.4),
    pingpongPath(27.6, -28, 27.6, 14), pingpongPath(27.6, -28, 27.6, 14),
    pingpongPath(-58, 32.7, 58, 32.7), pingpongPath(-58, 32.7, 58, 32.7),
    pingpongPath(-58, -44.7, 58, -44.7), pingpongPath(-58, -44.7, 58, -44.7),
    pingpongPath(-58, -76.7, 58, -76.7), pingpongPath(-58, -76.7, 58, -76.7),
    pingpongPath(-39.7, 14, -39.7, -60), pingpongPath(-39.7, 14, -39.7, -60),
    pingpongPath(39.7, 14, 39.7, -60),
  ];
  for (const L of lines) makePerson(L);
  for (let i = 0; i < 6; i++) makePerson(wanderPath(PARK.x0 + 2, PARK.z0 + 2, PARK.x1 - 2, PARK.z1 - 2, POND));
  for (const s of roofPeopleSpots) { // rooftop strollers — fouls like everyone else, never targets
    const p = makePerson(pingpongPath(s.ax, s.az, s.bx, s.bz));
    p.baseY = s.y; p.g.position.y = s.y;
  }
}
function personStep(p, dt) {
  const path = p.path;
  if (path.kind === 'pp') {
    p.t += (p.speed * dt / path.len) * p.dir;
    if (p.t > 1) { p.t = 1; p.dir = -1; } if (p.t < 0) { p.t = 0; p.dir = 1; }
    _v1.lerpVectors(path.a, path.b, p.t);
    _v2.subVectors(path.b, path.a).multiplyScalar(p.dir);
  } else {
    if (!path.target || p.g.position.distanceTo(path.target) < 0.5) {
      if (path.pauseT > 0) { path.pauseT -= dt; return 0; }
      let tx, tz, tries = 0;
      do { tx = rr(path.x0, path.x1); tz = rr(path.z0, path.z1); tries++; }
      while (tries < 8 && path.avoid && Math.hypot(tx - path.avoid.x, tz - path.avoid.z) < path.avoid.r + 1.6);
      path.target = new THREE.Vector3(tx, 0, tz);
      if (rng() < 0.3) path.pauseT = rr(0.5, 2);
    }
    _v2.subVectors(path.target, p.g.position); _v2.y = 0;
    const d = _v2.length();
    if (d > 0.01) { _v2.divideScalar(d); _v1.copy(p.g.position).addScaledVector(_v2, Math.min(d, p.speed * 0.8 * dt)); }
    else _v1.copy(p.g.position);
  }
  const moving = _v1.distanceToSquared(p.g.position) > 1e-8;
  p.g.position.x = _v1.x; p.g.position.z = _v1.z;
  if (moving) {
    const ty = Math.atan2(_v2.x, _v2.z);
    let dy = ty - p.yaw; while (dy > Math.PI) dy -= Math.PI * 2; while (dy < -Math.PI) dy += Math.PI * 2;
    p.yaw += dy * Math.min(1, dt * 8); p.g.rotation.y = p.yaw;
  }
  return moving ? 1 : 0;
}
function updatePeople(dt, t) {
  for (const p of people) {
    const moving = personStep(p, dt);
    if (p.startleT > 0) {
      p.startleT -= dt;
      const k = Math.max(0, p.startleT / 0.7);
      p.g.position.y = p.baseY + Math.sin((1 - k) * Math.PI) * 0.34;
      p.armL.rotation.z = 2.6 * (1 - k); p.armR.rotation.z = -2.6 * (1 - k);
      p.armL.rotation.x = 0; p.armR.rotation.x = 0;
    } else if (moving) {
      p.phase += dt * p.speed * 3.6;
      const s = Math.sin(p.phase);
      p.legL.rotation.x = s * 0.55; p.legR.rotation.x = -s * 0.55;
      p.armL.rotation.x = -s * 0.45; p.armR.rotation.x = s * 0.45;
      p.armL.rotation.z = 0.08; p.armR.rotation.z = -0.08;
      p.g.position.y = p.baseY + Math.abs(Math.cos(p.phase)) * 0.045;
    } else {
      p.legL.rotation.x *= 0.8; p.legR.rotation.x *= 0.8;
      p.armL.rotation.x *= 0.8; p.armR.rotation.x *= 0.8;
      p.g.position.y = p.baseY + Math.sin(t * 1.8 + p.phase) * 0.012;
    }
  }
}
/* ---------------- animals ---------------- */
const animals = []; // dogs & cats (wander)
function makeDog(path) {
  const g = new THREE.Group(); scene.add(g);
  const fur = M.std(pick([0xb08954, 0x6e5136, 0xe8e2d4, 0x3c3c40, 0xd9a066]), 1);
  const a = { g, path, kind: 'dog', speed: rr(0.9, 1.4), phase: rr(0, 6), yaw: 0, scamperT: 0 };
  mesh(GEO.box, fur, g, 0, 0.44, 0, 0.36, 0.32, 0.66).castShadow = true;
  mesh(GEO.box, fur, g, 0, 0.58, 0.42, 0.27, 0.27, 0.3);
  mesh(GEO.box, fur, g, 0, 0.66, 0.3, 0.3, 0.08, 0.3); // ears slab
  a.tail = mesh(GEO.box, fur, g, 0, 0.55, -0.42, 0.09, 0.09, 0.34);
  mesh(GEO.box, fur, g, 0, 0.16, 0.18, 0.3, 0.32, 0.1);
  mesh(GEO.box, fur, g, 0, 0.16, -0.2, 0.3, 0.32, 0.1);
  const proxy = mesh(GEO.box, hitMat, g, 0, 0.42, 0, 0.56, 0.84, 0.95);
  regHit(proxy, 'foul', { kind: 'animal', ref: a });
  animals.push(a); return a;
}
function makeCat(x, z, roofY) {
  const g = new THREE.Group(); g.position.set(x, roofY || 0, z); scene.add(g);
  const fur = M.std(pick([0xe8913a, 0x8a8d91, 0x2e2e33, 0xe8e2d4]), 1);
  const a = { g, kind: 'cat', sits: roofY !== undefined, phase: rr(0, 6), yaw: rr(0, 6.28), scamperT: 0, home: new THREE.Vector3(x, roofY || 0, z) };
  mesh(GEO.box, fur, g, 0, 0.3, 0, 0.26, 0.24, 0.48).castShadow = true;
  mesh(GEO.sph, fur, g, 0, 0.44, 0.26, 0.27, 0.25, 0.27);
  a.tail = mesh(GEO.box, fur, g, 0, 0.5, -0.3, 0.07, 0.5, 0.07);
  a.tail.geometry = GEO.box;
  mesh(GEO.box, fur, g, 0, 0.12, 0, 0.22, 0.24, 0.4);
  const proxy = mesh(GEO.box, hitMat, g, 0, 0.32, 0, 0.44, 0.68, 0.62);
  regHit(proxy, 'foul', { kind: 'animal', ref: a });
  animals.push(a); return a;
}
{
  for (let i = 0; i < 3; i++) makeDog(wanderPath(PARK.x0 + 2, PARK.z0 + 2, PARK.x1 - 2, PARK.z1 - 2, POND));
  makeDog(pingpongPath(-50, 18.6, 50, 18.6));
  makeDog(pingpongPath(-50, -14.4, 50, -14.4));
  const catW = wanderPath(PARK.x0 + 2, PARK.z0 + 2, PARK.x1 - 2, PARK.z1 - 2, POND);
  const c1 = makeCat(20, -50); c1.path = catW; c1.speed = 0.8;
  const c2 = makeCat(46, -58); c2.path = wanderPath(PARK.x0 + 2, PARK.z0 + 2, PARK.x1 - 2, PARK.z1 - 2, POND); c2.speed = 0.7;
  makeCat(-16.6, 39.7, 30.03); // rooftop cat on your own parapet
}
const birds = [];
{
  const birdCols = [0x5da2e8, 0xe86a5d, 0xf5c542, 0xe8e2d4, 0x7fd08a];
  for (let i = 0; i < 7; i++) {
    const g = new THREE.Group(); scene.add(g);
    const mat = M.std(pick(birdCols), 0.9);
    const b = { g, cx: rr(-40, 40), cz: rr(-80, -10), rx: rr(24, 55), rz: rr(18, 40), h: rr(24, 38), speed: rr(0.14, 0.24) * (rng() < 0.5 ? 1 : -1), phase: rr(0, 6.28), scamperT: 0 };
    const body = mesh(GEO.cone, mat, g, 0, 0, 0, 0.36, 1.0, 0.36); body.rotation.x = Math.PI / 2;
    mesh(GEO.sph, mat, g, 0, 0.05, 0.42, 0.2, 0.18, 0.2);
    b.wingL = new THREE.Group(); b.wingL.position.set(-0.08, 0.08, 0); g.add(b.wingL);
    b.wingR = new THREE.Group(); b.wingR.position.set(0.08, 0.08, 0); g.add(b.wingR);
    mesh(GEO.plane, new THREE.MeshStandardMaterial({ color: mat.color, roughness: 0.9, side: THREE.DoubleSide }), b.wingL, -0.5, 0, 0, 0.95, 0.34, 1);
    mesh(GEO.plane, new THREE.MeshStandardMaterial({ color: mat.color, roughness: 0.9, side: THREE.DoubleSide }), b.wingR, 0.5, 0, 0, 0.95, 0.34, 1);
    const proxy = mesh(GEO.sph, hitMat, g, 0, 0, 0, 0.85, 0.85, 0.85);
    regHit(proxy, 'foul', { kind: 'animal', ref: b });
    birds.push(b);
  }
}
const ducks = [];
{
  for (let i = 0; i < 4; i++) {
    const g = new THREE.Group(); scene.add(g);
    const white = i % 2 === 0;
    const mat = M.std(white ? 0xf2eee2 : 0x8a6a42, 0.9);
    const d = { g, r: rr(2.2, 4.6), speed: rr(0.25, 0.45) * (i % 2 ? 1 : -1), phase: rr(0, 6.28), scamperT: 0 };
    mesh(GEO.sph, mat, g, 0, 0.16, 0, 0.52, 0.36, 0.66);
    mesh(GEO.sph, mat, g, 0, 0.38, 0.26, 0.24, 0.22, 0.24);
    const bill = mesh(GEO.cone, M.std(0xf39c12, 0.8), g, 0, 0.36, 0.44, 0.12, 0.22, 0.12); bill.rotation.x = Math.PI / 2;
    const proxy = mesh(GEO.sph, hitMat, g, 0, 0.2, 0, 0.66, 0.6, 0.76);
    regHit(proxy, 'foul', { kind: 'animal', ref: d });
    ducks.push(d);
  }
}
const pigeons = [];
{
  for (const spot of pigeonSpots) {
    const g = new THREE.Group(); g.position.copy(spot); scene.add(g);
    const mat = M.std(pick([0x9aa0a8, 0x7d8590, 0xb9bec6]), 1);
    const pg = { g, phase: rr(0, 6.28), scamperT: 0, home: spot.clone() };
    pg.body = mesh(GEO.sph, mat, g, 0, 0.13, 0, 0.26, 0.24, 0.34);
    pg.head = mesh(GEO.sph, mat, g, 0, 0.27, 0.15, 0.15, 0.15, 0.15);
    const proxy = mesh(GEO.sph, hitMat, g, 0, 0.16, 0, 0.3, 0.34, 0.4);
    regHit(proxy, 'foul', { kind: 'animal', ref: pg });
    pigeons.push(pg);
  }
}
function updateAnimals(dt, t) {
  for (const a of animals) {
    if (a.kind === 'cat' && a.sits) { // rooftop cat: sits, tail flicks
      a.tail.rotation.x = -0.7 + Math.sin(t * 2.2 + a.phase) * 0.25;
      a.g.rotation.y = a.yaw + Math.sin(t * 0.4 + a.phase) * 0.3;
      continue;
    }
    if (a.path) { // reuse the people walker with a fake person shim
      const shim = { g: a.g, path: a.path, t: a._t ?? 0.5, dir: a._dir ?? 1, speed: (a.scamperT > 0 ? 3.2 : (a.speed || 0.9)), yaw: a.yaw, phase: a.phase };
      const moving = personStep(shim, dt);
      a._t = shim.t; a._dir = shim.dir; a.yaw = shim.yaw;
      a.phase += dt * (moving ? 9 : 2);
      a.g.position.y = (a.g.position.y || 0) * 0; // stay grounded
      if (a.kind === 'dog') {
        a.tail.rotation.y = Math.sin(t * 7 + a.phase) * 0.5;
        a.g.position.y = moving ? Math.abs(Math.sin(a.phase)) * 0.03 : 0;
      } else if (a.kind === 'cat') {
        a.tail.rotation.x = -0.5 + Math.sin(t * 3 + a.phase) * 0.2;
      }
    }
    if (a.scamperT > 0) a.scamperT -= dt;
  }
  for (const b of birds) {
    b.phase += dt * b.speed * (b.scamperT > 0 ? 2.2 : 1);
    const x = b.cx + Math.cos(b.phase) * b.rx, z = b.cz + Math.sin(b.phase) * b.rz;
    const y = b.h + Math.sin(b.phase * 3) * 1.4 + (b.scamperT > 0 ? 4 : 0);
    const dx = -Math.sin(b.phase) * Math.sign(b.speed), dz = Math.cos(b.phase) * Math.sign(b.speed);
    b.g.position.set(x, y, z);
    b.g.rotation.y = Math.atan2(dx, dz);
    const flap = Math.sin(perfNow * 11 + b.phase * 7) * 0.75;
    b.wingL.rotation.z = flap; b.wingR.rotation.z = -flap;
    if (b.scamperT > 0) b.scamperT -= dt;
  }
  for (const d of ducks) {
    d.phase += dt * d.speed * (d.scamperT > 0 ? 3 : 1);
    const x = POND.x + Math.cos(d.phase) * d.r, z = POND.z + Math.sin(d.phase) * d.r;
    d.g.position.set(x, 0.24 + Math.sin(perfNow * 2 + d.phase * 5) * 0.03, z);
    d.g.rotation.y = Math.atan2(-Math.sin(d.phase) * Math.sign(d.speed), Math.cos(d.phase) * Math.sign(d.speed)) + (d.speed > 0 ? 0 : Math.PI);
    if (d.scamperT > 0) d.scamperT -= dt;
  }
  for (const pg of pigeons) {
    if (pg.scamperT > 0) { // flutter up and resettle at home
      pg.scamperT -= dt;
      const k = pg.scamperT / 1.4;
      pg.g.position.copy(pg.home); pg.g.position.y += Math.sin((1 - k) * Math.PI) * 2.2;
      pg.head.position.z = 0.15;
    } else {
      pg.head.position.z = 0.15 + (Math.sin(t * 6 + pg.phase) > 0.72 ? 0.05 : 0); // peck
      pg.g.rotation.y = pg.phase + Math.sin(t * 0.5 + pg.phase) * 0.6;
    }
  }
}
let perfNow = 0; // seconds, set by the main loop (hoisted use in updates)

/* ============================================================
   EFFECTS — tracers, sparkles, dust puffs, score popups
   ============================================================ */
const tracers = [];
{
  for (let i = 0; i < 5; i++) {
    const geo = new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(), new THREE.Vector3()]);
    const line = new THREE.Line(geo, new THREE.LineBasicMaterial({ color: 0xffe9a8, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false }));
    line.frustumCulled = false; scene.add(line);
    tracers.push({ line, t: 1e9 });
  }
}
let tracerIdx = 0;
function tracer(a, b) {
  const tr = tracers[tracerIdx++ % tracers.length];
  const p = tr.line.geometry.attributes.position;
  p.setXYZ(0, a.x, a.y, a.z); p.setXYZ(1, b.x, b.y, b.z); p.needsUpdate = true;
  tr.t = 0; tr.line.material.opacity = 0.9;
}
const SPN = 260;
const sparkGeo = new THREE.BufferGeometry();
const sparkPos = new Float32Array(SPN * 3), sparkCol = new Float32Array(SPN * 3);
sparkGeo.setAttribute('position', new THREE.BufferAttribute(sparkPos, 3));
sparkGeo.setAttribute('color', new THREE.BufferAttribute(sparkCol, 3));
const sparkPts = new THREE.Points(sparkGeo, new THREE.PointsMaterial({ size: 0.34, map: glowTex, vertexColors: true, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending }));
sparkPts.frustumCulled = false; scene.add(sparkPts);
const sparks = [];
for (let i = 0; i < SPN; i++) { sparkPos[i * 3 + 1] = -999; sparks.push({ life: 0, max: 1, vx: 0, vy: 0, vz: 0, x: 0, y: -999, z: 0 }); }
let sparkIdx = 0;
const _c = new THREE.Color();
function burst(pos, color, n = 12, speed = 3.4, life = 0.55, up = 1.6) {
  _c.set(color);
  for (let k = 0; k < n; k++) {
    const s = sparks[sparkIdx++ % SPN];
    s.x = pos.x; s.y = pos.y; s.z = pos.z;
    const th = Math.random() * Math.PI * 2, ph = Math.acos(2 * Math.random() - 1), sp = speed * (0.35 + Math.random() * 0.75);
    s.vx = Math.sin(ph) * Math.cos(th) * sp; s.vz = Math.sin(ph) * Math.sin(th) * sp; s.vy = Math.abs(Math.cos(ph)) * sp * 0.7 + up;
    s.life = s.max = life * (0.6 + Math.random() * 0.7);
    const j = (sparkIdx - 1) % SPN;
    sparkCol[j * 3] = _c.r; sparkCol[j * 3 + 1] = _c.g; sparkCol[j * 3 + 2] = _c.b;
  }
  sparkGeo.attributes.color.needsUpdate = true;
}
function updateSparks(dt) {
  for (let i = 0; i < SPN; i++) {
    const s = sparks[i];
    if (s.life <= 0) continue;
    s.life -= dt;
    if (s.life <= 0) { sparkPos[i * 3 + 1] = -999; continue; }
    s.vy -= 5.5 * dt;
    s.x += s.vx * dt; s.y += s.vy * dt; s.z += s.vz * dt;
    sparkPos[i * 3] = s.x; sparkPos[i * 3 + 1] = s.y; sparkPos[i * 3 + 2] = s.z;
  }
  sparkGeo.attributes.position.needsUpdate = true;
}
const puffs = [];
{
  for (let i = 0; i < 10; i++) {
    const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTex, color: 0xcfc4ae, transparent: true, opacity: 0, depthWrite: false }));
    scene.add(sp); puffs.push({ sp, t: 1e9 });
  }
}
let puffIdx = 0;
function puff(pos, scale = 1, color = 0xcfc4ae) {
  const p = puffs[puffIdx++ % puffs.length];
  p.sp.position.copy(pos); p.sp.material.color.set(color);
  p.t = 0; p.base = scale;
}
function updatePuffs(dt) {
  for (const p of puffs) {
    if (p.t > 0.5) { p.sp.material.opacity = 0; continue; }
    p.t += dt;
    const k = Math.min(1, p.t / 0.5);
    p.sp.scale.setScalar((0.6 + k * 2.2) * (p.base || 1));
    p.sp.material.opacity = 0.5 * (1 - k);
  }
}
/* score popups (DOM, projected) */
const popPool = [];
{
  const wrap = $('pops');
  for (let i = 0; i < 14; i++) {
    const d = document.createElement('div');
    d.className = 'pop'; wrap.appendChild(d);
    popPool.push({ el: d, t: 1e9, world: new THREE.Vector3() });
  }
}
let popIdx = 0;
function popup(worldPos, text, cls = 'good', size = 21) {
  const p = popPool[popIdx++ % popPool.length];
  p.world.copy(worldPos); p.t = 0;
  p.el.textContent = text; p.el.className = 'pop ' + cls;
  p.el.style.fontSize = size + 'px';
}
const _pv = new THREE.Vector3();
function updatePopups(dt) {
  for (const p of popPool) {
    if (p.t > 0.95) { p.el.style.opacity = 0; continue; }
    p.t += dt;
    _pv.copy(p.world); _pv.y += p.t * 1.5;
    _pv.project(camera);
    if (_pv.z > 1) { p.el.style.opacity = 0; continue; }
    p.el.style.left = ((_pv.x * 0.5 + 0.5) * innerWidth) + 'px';
    p.el.style.top = ((-_pv.y * 0.5 + 0.5) * innerHeight) + 'px';
    p.el.style.opacity = Math.min(1, (0.95 - p.t) / 0.3);
  }
}

/* ============================================================
   TARGETS — the playful things you ARE allowed to shoot
   ============================================================ */
const targets = [];
function addTarget(t) { targets.push(t); return t; }
function killTarget(t) {
  t.alive = false;
  for (const px of t.proxies) unregHit(px);
  if (t.root) scene.remove(t.root);
  const i = targets.indexOf(t); if (i >= 0) targets.splice(i, 1);
}
const balloonCols = [0xff5d5d, 0xffd93b, 0x3fa7ff, 0x5dd95d, 0xff9ff3, 0xff9f2e];
function spawnBalloon() {
  const g = new THREE.Group();
  const col = pick(balloonCols);
  const ball = mesh(GEO.sph, new THREE.MeshStandardMaterial({ color: col, roughness: 0.35 }), g, 0, 0, 0, 1.15, 1.32, 1.15);
  ball.castShadow = true;
  mesh(GEO.cone, M.std(col, 0.5), g, 0, -0.78, 0, 0.16, 0.22, 0.16).rotation.x = Math.PI;
  mesh(GEO.cyl, M.std(0xdddddd, 1), g, 0, -1.25, 0, 0.025, 0.8, 0.025);
  g.position.set(rr(-72, 72), rr(1, 6), rr(-92, 8));
  scene.add(g);
  const t = { type: 'balloon', root: g, proxies: [ball], alive: true, rise: rr(1.0, 1.7), phase: rr(0, 6.28), pts: 50,
    aimPos: out => out.copy(g.position),
    update(dt, now) { g.position.y += t.rise * dt; g.position.x += Math.sin(now * 1.2 + t.phase) * dt * 0.8; if (g.position.y > 43) killTarget(t); } };
  ball.userData.refObj = t;
  regHit(ball, 'target', { type: 'balloon', ref: t, pts: 50 });
  return addTarget(t);
}
function spawnBoard(spot) {
  const g = new THREE.Group(); g.position.copy(spot.pos); g.rotation.y = spot.ry || 0;
  scene.add(g);
  mesh(GEO.box, M.std(0x6e5136, 1), g, 0, 0.8, -0.09, 0.14, 1.6, 0.14);
  mesh(GEO.box, M.std(0x8a6642, 1), g, 0, 1.62, -0.1, 2.1, 2.1, 0.1);
  const disc = mesh(GEO.circ, new THREE.MeshStandardMaterial({ map: bullTex, roughness: 0.6 }), g, 0, 1.62, 0, 1.95, 1.95, 1);
  const t = { type: 'board', root: g, proxies: [disc], alive: true, life: rr(13, 17), phase: rr(0, 6.28), pts: 100,
    aimPos: out => disc.getWorldPosition(out),
    update(dt, now) { t.life -= dt; g.rotation.z = Math.sin(now * 0.9 + t.phase) * 0.03; if (t.life <= 0) killTarget(t); } };
  regHit(disc, 'target', { type: 'board', ref: t, pts: 100 });
  return addTarget(t);
}
const canCols = [0xd23b47, 0x2e8fd8, 0x37c978, 0xf5c542, 0xe8e8ec];
function spawnCan(spot) {
  const g = new THREE.Group(); g.position.copy(spot.pos); scene.add(g);
  const can = mesh(GEO.cyl, new THREE.MeshStandardMaterial({ color: pick(canCols), roughness: 0.3, metalness: 0.65 }), g, 0, 0.21, 0, 0.34, 0.42, 0.34);
  can.castShadow = true;
  const t = { type: 'can', root: g, proxies: [can], alive: true, state: 'idle', flyT: 0, vel: new THREE.Vector3(), spin: rr(6, 11), pts: 75,
    aimPos: out => { out.copy(g.position); out.y += 0.21; return out; },
    update(dt) {
      if (t.state !== 'flying') return;
      t.flyT += dt;
      t.vel.y -= 20 * dt;
      g.position.addScaledVector(t.vel, dt);
      g.rotation.x += t.spin * dt; g.rotation.z += t.spin * 0.7 * dt;
      if (t.flyT > 0.85) { // land somewhere new
        const s = pick(canSpots);
        g.position.copy(s.pos); g.rotation.set(0, 0, 0); t.state = 'idle';
      }
    } };
  regHit(can, 'target', { type: 'can', ref: t, pts: 75 });
  return addTarget(t);
}
function spawnDrone() {
  const g = new THREE.Group(); scene.add(g);
  const dir = rng() < 0.5 ? 1 : -1;
  const bodyM = M.std(0x3c4148, 0.4);
  mesh(GEO.box, bodyM, g, 0, 0, 0, 0.55, 0.2, 0.55).castShadow = true;
  const rotors = [];
  for (const [ax, az] of [[-0.42, -0.42], [0.42, -0.42], [-0.42, 0.42], [0.42, 0.42]]) {
    mesh(GEO.box, bodyM, g, ax * 0.7, 0.02, az * 0.7, 0.3, 0.05, 0.08);
    const r = mesh(GEO.circ, new THREE.MeshBasicMaterial({ color: 0xcccccc, transparent: true, opacity: 0.5, side: THREE.DoubleSide }), g, ax, 0.14, az, 0.4, 0.4, 1);
    r.rotation.x = -Math.PI / 2; rotors.push(r);
  }
  const lamp = mesh(GEO.sph, new THREE.MeshStandardMaterial({ color: 0xff4444, emissive: 0xff2222, emissiveIntensity: 2 }), g, 0, -0.14, 0, 0.13, 0.13, 0.13);
  const proxy = mesh(GEO.box, hitMat, g, 0, 0, 0, 0.95, 0.6, 0.95);
  const y0 = rr(23, 34);
  g.position.set(dir > 0 ? -125 : 125, y0, rr(-70, -2));
  const t = { type: 'drone', root: g, proxies: [proxy], alive: true, vx: dir * rr(6, 10), y0, phase: rr(0, 6.28), state: 'fly', vy: 0, pts: 150,
    aimPos: out => out.copy(g.position),
    update(dt, now) {
      for (const r of rotors) r.rotation.z += dt * 42;
      lamp.material.emissiveIntensity = (Math.sin(now * 7 + t.phase) > 0 ? 2.4 : 0.3);
      if (t.state === 'fly') {
        g.position.x += t.vx * dt;
        g.position.y = t.y0 + Math.sin(now * 1.7 + t.phase) * 0.8;
        if (Math.abs(g.position.x) > 132) killTarget(t);
      } else {
        t.vy -= 24 * dt; g.position.y += t.vy * dt;
        g.rotation.z += dt * 8; g.rotation.x += dt * 5;
        burst(g.position, 0xffc37a, 1, 1.2, 0.3, 0.4);
        if (g.position.y < 0.4) { puff(g.position, 1.2); killTarget(t); }
      }
    } };
  regHit(proxy, 'target', { type: 'drone', ref: t, pts: 150 });
  return addTarget(t);
}
function spawnBall() {
  const g = new THREE.Group(); scene.add(g);
  const ball = mesh(GEO.sph, new THREE.MeshStandardMaterial({ map: ballTex, roughness: 0.5 }), g, 0, 0, 0, 1, 1, 1);
  ball.castShadow = true;
  g.position.set(rr(PARK.x0 + 4, PARK.x1 - 4), 3, rr(PARK.z0 + 4, PARK.z1 - 4));
  const t = { type: 'ball', root: g, proxies: [ball], alive: true, vel: new THREE.Vector3(rr(-2.4, 2.4), 0, rr(-2.4, 2.4)), pts: 100,
    aimPos: out => out.copy(g.position),
    update(dt) {
      t.vel.y -= 17 * dt;
      g.position.addScaledVector(t.vel, dt);
      if (g.position.y < 0.68) { g.position.y = 0.68; t.vel.y = Math.abs(t.vel.y) * 0.78; if (t.vel.y < 1.4) t.vel.y = rr(3.4, 5.2); }
      if (g.position.x < PARK.x0 + 1 || g.position.x > PARK.x1 - 1) t.vel.x *= -1;
      if (g.position.z < PARK.z0 + 1 || g.position.z > PARK.z1 - 1) t.vel.z *= -1;
      g.position.x = THREE.MathUtils.clamp(g.position.x, PARK.x0 + 0.6, PARK.x1 - 0.6);
      g.position.z = THREE.MathUtils.clamp(g.position.z, PARK.z0 + 0.6, PARK.z1 - 0.6);
      ball.rotation.x += t.vel.z * dt * 1.6; ball.rotation.z -= t.vel.x * dt * 1.6;
    } };
  regHit(ball, 'target', { type: 'ball', ref: t, pts: 100 });
  return addTarget(t);
}
const pinCols = [0xff5d5d, 0xffd93b, 0x3fa7ff, 0x5dd95d];
function spawnPinwheel(spot) {
  const g = new THREE.Group(); g.position.copy(spot.pos); scene.add(g);
  mesh(GEO.cyl, M.std(0x777d85, 0.6), g, 0, 0.55, 0, 0.07, 1.1, 0.07);
  const hub = new THREE.Group(); hub.position.set(0, 1.25, 0.1); g.add(hub);
  for (let i = 0; i < 4; i++) {
    const blade = mesh(GEO.plane, new THREE.MeshStandardMaterial({ color: pinCols[i], roughness: 0.6, side: THREE.DoubleSide }), hub, 0, 0.3, 0, 0.3, 0.62, 1);
    const holder = new THREE.Group(); holder.rotation.z = i * Math.PI / 2; hub.add(holder);
    holder.add(blade); blade.position.set(0.1, 0.32, 0); blade.rotation.y = 0.6;
  }
  mesh(GEO.sph, M.std(0xffffff, 0.4), hub, 0, 0, 0.03, 0.14, 0.14, 0.14);
  const proxy = mesh(GEO.cyl, hitMat, hub, 0, 0, 0, 1.15, 0.24, 1.15);
  proxy.rotation.x = Math.PI / 2;
  const t = { type: 'pin', root: g, proxies: [proxy], alive: true, hub, downT: 0, pts: 125,
    aimPos: out => hub.getWorldPosition(out),
    update(dt) {
      if (t.downT > 0) { t.downT -= dt; if (t.downT <= 0) { hub.visible = true; proxy.visible = true; } return; }
      hub.rotation.z += dt * 5.5;
    } };
  regHit(proxy, 'target', { type: 'pin', ref: t, pts: 125 });
  return addTarget(t);
}
function spawnKite() {
  const g = new THREE.Group(); scene.add(g);
  const sail = mesh(GEO.plane, new THREE.MeshStandardMaterial({ map: kiteTex, roughness: 0.7, side: THREE.DoubleSide }), g, 0, 0, 0, 1.5, 1.5, 1);
  sail.rotation.z = Math.PI / 4;
  const tailBits = [];
  for (let i = 1; i <= 4; i++) {
    const b = mesh(GEO.box, M.std(pinCols[i % 4], 0.7), g, 0, -0.6 - i * 0.34, -0.05 * i, 0.16, 0.1, 0.03);
    tailBits.push(b);
  }
  const proxy = mesh(GEO.box, hitMat, g, 0, 0, 0, 1.35, 1.35, 0.25);
  const t = { type: 'kite', root: g, proxies: [proxy], alive: true, phase: rr(0, 6.28), state: 'fly', vy: 0, pts: 125,
    aimPos: out => out.copy(g.position),
    update(dt, now) {
      if (t.state === 'fly') {
        g.position.set(30 + Math.sin(now * 0.21 + t.phase) * 13, 21.5 + Math.sin(now * 0.33 + t.phase) * 2.6, -52 + Math.cos(now * 0.16 + t.phase) * 7);
        g.rotation.z = Math.sin(now * 0.9 + t.phase) * 0.28;
        g.rotation.y = Math.sin(now * 0.4 + t.phase) * 0.4;
        tailBits.forEach((b, i) => { b.position.x = Math.sin(now * 2.2 + t.phase - i * 0.8) * 0.16; });
      } else {
        t.vy -= 9 * dt; g.position.y += t.vy * dt;
        g.position.x += dt * 1.5; g.rotation.z += dt * 2.4;
        if (g.position.y < 0.9) killTarget(t);
      }
    } };
  regHit(proxy, 'target', { type: 'kite', ref: t, pts: 125 });
  return addTarget(t);
}
/* target director — keeps the city's target mix topped up */
const boardBag = [];
function nextBoardSpot() {
  if (!boardBag.length) { boardBag.push(...boardSpots); for (let i = boardBag.length - 1; i > 0; i--) { const j = (rng() * (i + 1)) | 0;[boardBag[i], boardBag[j]] = [boardBag[j], boardBag[i]]; } }
  return boardBag.pop();
}
const canState = { made: false };
function seedStaticTargets() {
  if (canState.made) return; canState.made = true;
  const spots = [...canSpots];
  for (let i = 0; i < Math.min(10, spots.length); i++) { // 6 -> 10 cans (Nov 7)
    const j = (rng() * spots.length) | 0;
    spawnCan(spots.splice(j, 1)[0]);
  }
  /* pin spots grew with the extra roof/lot mounts — seed a shuffled subset
     (24) so pinwheel draw calls stay capped on phones */
  const pinList = [...pinSpots];
  for (let i = pinList.length - 1; i > 0; i--) { const j = (rng() * (i + 1)) | 0;[pinList[i], pinList[j]] = [pinList[j], pinList[i]]; }
  for (const s of pinList.slice(0, 24)) spawnPinwheel(s);
  spawnBall(); spawnBall();
  spawnKite();
}
function director(dt) {
  const w = game.wave || 1;
  const count = ty => targets.reduce((n, t) => n + (t.type === ty && t.alive ? 1 : 0), 0);
  director._bt = (director._bt || 0) - dt;
  if (count('balloon') < Math.min(4 + w, 7) && director._bt <= 0) { spawnBalloon(); director._bt = 0.7; }
  if (count('board') < 5 && director._bt <= 0) { spawnBoard(nextBoardSpot()); director._bt = 0.4; }
  director._dt2 = (director._dt2 || 0) - dt;
  if (count('drone') < Math.min(w + 1, 4) && director._dt2 <= 0) { spawnDrone(); director._dt2 = rr(2.5, 5); }
  if (count('ball') < 2) spawnBall();
  if (count('kite') < 2) spawnKite();
}
function updateTargets(dt, now) {
  for (const t of [...targets]) if (t.alive) t.update(dt, now);
}

/* ============================================================
   AUDIO — all procedural WebAudio, no files
   ============================================================ */
const AudioSys = {
  ctx: null, master: null, muted: false,
  init() {
    if (this.ctx) { if (this.ctx.state === 'suspended') this.ctx.resume(); return; }
    try {
      this.ctx = new (window.AudioContext || window.webkitAudioContext)();
      this.master = this.ctx.createGain(); this.master.gain.value = this.muted ? 0 : 0.45;
      this.master.connect(this.ctx.destination);
    } catch (e) { /* no audio — fine */ }
  },
  setMute(m) { this.muted = m; if (this.master) this.master.gain.value = m ? 0 : 0.45; },
  env(g, t0, a, peak, d) { g.gain.setValueAtTime(0, t0); g.gain.linearRampToValueAtTime(peak, t0 + a); g.gain.exponentialRampToValueAtTime(0.001, t0 + a + d); },
  tone(freq, dur, type = 'sine', vol = 0.5, slideTo = null, delay = 0) {
    if (!this.ctx || this.muted) return;
    try {
      const t0 = this.ctx.currentTime + delay, o = this.ctx.createOscillator(), g = this.ctx.createGain();
      o.type = type; o.frequency.setValueAtTime(freq, t0);
      if (slideTo) o.frequency.exponentialRampToValueAtTime(slideTo, t0 + dur);
      this.env(g, t0, 0.005, vol, dur);
      o.connect(g); g.connect(this.master); o.start(t0); o.stop(t0 + dur + 0.1);
    } catch (e) {}
  },
  noise(dur, vol = 0.5, freq = 1200, delay = 0) {
    if (!this.ctx || this.muted) return;
    try {
      const t0 = this.ctx.currentTime + delay, len = Math.max(1, (dur * this.ctx.sampleRate) | 0);
      const buf = this.ctx.createBuffer(1, len, this.ctx.sampleRate), d = buf.getChannelData(0);
      for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / len);
      const src = this.ctx.createBufferSource(); src.buffer = buf;
      const f = this.ctx.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = freq;
      const g = this.ctx.createGain(); this.env(g, t0, 0.004, vol, dur);
      src.connect(f); f.connect(g); g.connect(this.master); src.start(t0);
    } catch (e) {}
  },
  shot() { this.noise(0.16, 0.8, 900); this.tone(140, 0.14, 'sine', 0.7, 45); },
  dryFire() { this.tone(1900, 0.04, 'square', 0.12); },
  reloadS() { this.tone(700, 0.05, 'square', 0.15); this.tone(500, 0.05, 'square', 0.15, null, 0.22); this.tone(950, 0.06, 'square', 0.2, null, 0.5); },
  popS() { this.tone(520, 0.1, 'sine', 0.5, 1250); this.noise(0.05, 0.25, 2600); },
  dingS() { this.tone(1760, 0.22, 'triangle', 0.4); this.tone(2637, 0.14, 'triangle', 0.2); },
  thockS() { this.tone(840, 0.12, 'triangle', 0.45, 500); this.noise(0.05, 0.2, 1400); },
  droneS() { this.tone(760, 0.42, 'sawtooth', 0.25, 90); },
  chimeS() { this.tone(1318, 0.12, 'sine', 0.35); this.tone(1760, 0.18, 'sine', 0.3, null, 0.07); },
  whistleS() { for (let i = 0; i < 2; i++) { this.tone(2350, 0.13, 'square', 0.16, 2250, i * 0.19); } },
  honkS() { this.tone(392, 0.16, 'square', 0.22); this.tone(330, 0.2, 'square', 0.22, null, 0.22); },
  bellS() { this.tone(880, 0.5, 'sine', 0.3); this.tone(1318, 0.6, 'sine', 0.2, null, 0.02); },
  clearS() { [659, 880, 990, 1318].forEach((f, i) => this.tone(f, 0.16, 'triangle', 0.3, null, i * 0.09)); },
};

/* ---------------- rifle (view model) ---------------- */
const rifle = new THREE.Group();
let boltHandle, muzzleTip;
{
  const polymer = M.std(0x2b2e34, 0.55), metal = new THREE.MeshStandardMaterial({ color: 0x17181c, roughness: 0.35, metalness: 0.6 });
  const accent = M.std(0xd99a26, 0.4);
  mesh(GEO.box, polymer, rifle, 0, -0.045, 0.21, 0.095, 0.17, 0.36);           // stock
  mesh(GEO.box, polymer, rifle, 0, 0.01, -0.08, 0.085, 0.13, 0.52);            // body
  const barrel = mesh(GEO.cyl, metal, rifle, 0, 0.045, -0.58, 0.042, 0.58, 0.042); barrel.rotation.x = Math.PI / 2;
  const brake = mesh(GEO.cyl, metal, rifle, 0, 0.045, -0.88, 0.06, 0.08, 0.06); brake.rotation.x = Math.PI / 2;
  const tube = mesh(GEO.cyl, metal, rifle, 0, 0.125, -0.14, 0.056, 0.26, 0.056); tube.rotation.x = Math.PI / 2;
  mesh(GEO.box, metal, rifle, 0, 0.075, -0.2, 0.03, 0.05, 0.03);
  mesh(GEO.box, metal, rifle, 0, 0.075, -0.06, 0.03, 0.05, 0.03);
  mesh(GEO.cyl, accent, rifle, 0, 0.125, -0.28, 0.06, 0.02, 0.06).rotation.x = Math.PI / 2;
  mesh(GEO.box, polymer, rifle, 0, -0.095, -0.14, 0.07, 0.13, 0.15);           // magazine
  const grip = mesh(GEO.box, polymer, rifle, 0, -0.08, 0.1, 0.07, 0.14, 0.08); grip.rotation.x = 0.4;
  boltHandle = new THREE.Group(); boltHandle.position.set(0.055, 0.03, -0.02); rifle.add(boltHandle);
  mesh(GEO.cyl, metal, boltHandle, 0.03, 0, 0, 0.05, 0.07, 0.05).rotation.z = Math.PI / 2;
  mesh(GEO.sph, metal, boltHandle, 0.075, 0, 0, 0.075, 0.075, 0.075);
  rifle.position.set(0.32, -0.33, -0.55);
  rifle.rotation.y = 0.05;
  camera.add(rifle);
  muzzleTip = new THREE.Object3D(); muzzleTip.position.set(0, 0.045, -0.93); rifle.add(muzzleTip);
}
const muzzleLight = new THREE.PointLight(0xffb050, 0, 12, 1.8);
scene.add(muzzleLight);

/* ---------------- game state ---------------- */
const game = { phase: 'boot', wave: 0, score: 0, targetsHit: 0, shots: 0, fouls: 0,
  combo: 0, bestCombo: 0, timer: 0, interT: 0, waveShots: 0, waveHits: 0, runT: 0, simT: 0 };
const MAG = 5;
const player = { ammo: MAG, chamberT: 0, reloadT: 0, scoped: false, zoomIdx: 0, zoomFov: 15,
  breath: 1, holding: false, breathLock: false, kick: 0, boltT: -1 };
/* Graded scope (Tom's note, Nov 6): zoom is a CONTINUOUS value, not an
   in/out toggle. The scope magnifies from 1x (fov 55 — the plain
   unscoped view, zero extra zoom) up to ~8x (fov 6.8); the ZOOM button
   steps through four labelled stops (1x / 2x / 4x / 8x), the − / +
   buttons nudge in small smooth steps, the wheel and pinch zoom are
   smooth, and the setting STAYS where the player leaves it between
   shots and waves — setScope never touches it.
   (Tom, Nov 7: "all the Scopes that we use make it go from 2x to 0" —
   the zoom floor is 1x, so the player can always zoom all the way back
   out to the plain view without leaving the scope.) */
const ZOOMS = [15, 10.5, 7.2]; // QA-friendly stops (fov); kept for harness compat
const FOV_PLAIN = 55, FOV_WIDE = 55, FOV_MAX = 6.8; // FOV_WIDE (widest scoped view / min zoom) = FOV_PLAIN itself: 1x, zero extra zoom (Tom, Nov 7)
const ZOOM_STOPS = [{ fov: 55, label: '1X' }, { fov: 24, label: '2X' }, { fov: 12.6, label: '4X' }, { fov: 6.8, label: '8X' }];
function zoomLabel(fov = player.zoomFov) { return (FOV_PLAIN / fov).toFixed(1).replace(/\.0$/, '') + 'X'; } // magnification vs the plain unscoped view
function setZoomFov(f) {
  player.zoomFov = THREE.MathUtils.clamp(f, FOV_MAX, FOV_WIDE);
  player.zoomIdx = ZOOMS.reduce((bi, z, i) => Math.abs(z - player.zoomFov) < Math.abs(ZOOMS[bi] - player.zoomFov) ? i : bi, 0);
  updateZoomReadout();
}
function cycleZoom() { // ZOOM button: 1x -> 2x -> 4x -> 8x -> 1x …
  const next = ZOOM_STOPS.find(s => s.fov < player.zoomFov - 0.6) || ZOOM_STOPS[0];
  setZoomFov(next.fov);
}
function updateZoomReadout() { const el = $('zoomVal'); if (el) el.textContent = zoomLabel(); }
let aimYaw = 0, aimPitch = -0.13;
let freezeT = 0, elapsed = 0;
let qaHold = false, qaDone = false, qaFreeze = false, qaFoulDone = false;

function showBanner(main, sub = '', hold = 0.9, red = false) {
  const m = $('bannerMain'), s = $('bannerSub');
  m.textContent = main; s.textContent = sub;
  m.className = red ? 'red' : ''; s.className = '';
  void m.offsetWidth;
  m.classList.add('pop'); s.classList.add('pop');
  clearTimeout(showBanner._t);
  showBanner._t = setTimeout(() => { m.classList.add('fadeout'); s.classList.add('fadeout'); }, hold * 1000);
}
let comboTimer = null;
function comboMult() { return 1 + 0.25 * Math.min(Math.max(game.combo - 1, 0), 7); }
function showCombo() {
  if (game.combo < 2) return;
  $('combo').textContent = T('combo') + ' ×' + comboMult().toFixed(2).replace(/\.?0+$/, '');
  $('combo').style.opacity = 1;
  clearTimeout(comboTimer);
  comboTimer = setTimeout(() => $('combo').style.opacity = 0, 900);
}
function showHitmarker(foul) {
  const hm = $('hitmarker');
  hm.classList.toggle('foul', !!foul);
  if (QA_MODE) hm.style.transform = 'translate(-50%,-50%) scale(2.1)';
  hm.style.transition = 'none'; hm.style.opacity = 1;
  void hm.offsetWidth;
  if (QA_MODE) return;
  requestAnimationFrame(() => { hm.style.transition = 'opacity 0.28s'; hm.style.opacity = 0; });
}

/* ---------------- input ---------------- */
const keys = {};
addEventListener('keydown', e => {
  keys[e.code] = true;
  if (e.code === 'Space') { e.preventDefault(); if (!e.repeat) fire(); }
  if (e.code === 'KeyR') startReload();
  if (e.code === 'KeyF' || e.code === 'KeyQ') setScope(!player.scoped);
  if (e.code === 'Equal' && player.scoped) setZoomFov(player.zoomFov * 0.8);
  if (e.code === 'Minus' && player.scoped) setZoomFov(player.zoomFov * 1.25);
  AudioSys.init();
});
addEventListener('keyup', e => { keys[e.code] = false; });
addEventListener('wheel', e => {
  if (!player.scoped || game.phase !== 'fight') return;
  setZoomFov(player.zoomFov * (e.deltaY > 0 ? 1.12 : 0.89)); // smooth graded wheel zoom
}, { passive: true });
document.body.style.touchAction = 'none';

const pointers = new Map();
let dragId = null, dragX = 0, dragY = 0, dragMoved = 0, dragT0 = 0, canvasDown = false, pinchD = 0;
const cvs = renderer.domElement;
cvs.addEventListener('pointerdown', e => {
  AudioSys.init();
  pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
  if (pointers.size === 2) {
    const [a, b] = [...pointers.values()];
    pinchD = Math.hypot(a.x - b.x, a.y - b.y);
    dragId = null; canvasDown = false;
    return;
  }
  dragId = e.pointerId; dragX = e.clientX; dragY = e.clientY; dragMoved = 0; dragT0 = performance.now();
  canvasDown = true;
});
cvs.addEventListener('pointermove', e => {
  if (!pointers.has(e.pointerId)) return;
  pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
  if (pointers.size === 2) { // pinch = smooth graded zoom (ratio-based, stops anywhere)
    const [a, b] = [...pointers.values()];
    const d = Math.hypot(a.x - b.x, a.y - b.y);
    if (player.scoped && pinchD > 0 && d > 0) setZoomFov(player.zoomFov * (pinchD / d));
    pinchD = d;
    return;
  }
  if (e.pointerId !== dragId) return;
  const dx = e.clientX - dragX, dy = e.clientY - dragY;
  dragX = e.clientX; dragY = e.clientY;
  dragMoved += Math.abs(dx) + Math.abs(dy);
  const sens = 0.0031 * (player.scoped ? (camera.fov / 55) * 2.2 : 1);
  aimYaw = THREE.MathUtils.clamp(aimYaw - dx * sens, -0.78, 0.78);
  aimPitch = THREE.MathUtils.clamp(aimPitch - dy * sens, -1.0, 0.34);
});
const dragEnd = e => {
  pointers.delete(e.pointerId);
  if (e.pointerId !== dragId) return;
  canvasDown = false;
  if (pointers.size === 0 && dragMoved < 6 && performance.now() - dragT0 < 350 && game.phase === 'fight') fire(); // tap = shoot
  dragId = null;
};
cvs.addEventListener('pointerup', dragEnd);
cvs.addEventListener('pointercancel', dragEnd);

function bindBtn(id, fn) {
  const el = $(id);
  el.addEventListener('pointerdown', e => { e.preventDefault(); e.stopPropagation(); AudioSys.init(); fn(); });
}
bindBtn('scopeBtn', () => setScope(!player.scoped));
bindBtn('zoomBtn', () => { if (player.scoped) cycleZoom(); });
bindBtn('zoomOutBtn', () => { if (player.scoped) setZoomFov(player.zoomFov * 1.3); });
bindBtn('zoomInBtn', () => { if (player.scoped) setZoomFov(player.zoomFov * 0.75); });
bindBtn('fireBtn', () => fire());
bindBtn('reloadBtn', () => startReload());
$('muteBtn').addEventListener('pointerdown', e => {
  e.preventDefault(); e.stopPropagation(); AudioSys.init();
  AudioSys.setMute(!AudioSys.muted);
  try { localStorage.setItem('sniper3dMute', AudioSys.muted ? '1' : '0'); } catch (err) {}
  $('muteBtn').textContent = AudioSys.muted ? '✕' : '♪';
});
try { if (localStorage.getItem('sniper3dMute') === '1') { AudioSys.muted = true; $('muteBtn').textContent = '✕'; } } catch (err) {}
$('startBtn').addEventListener('click', () => { AudioSys.init(); startGame(); });
$('againBtn').addEventListener('click', () => { AudioSys.init(); startGame(); });

function setScope(on) {
  if (game.phase !== 'fight' && game.phase !== 'waveclear') on = false;
  player.scoped = on;
  $('scopeBtn').classList.toggle('on', on);
  $('zoomBtn').disabled = !on;
  $('zoomOutBtn').disabled = !on;
  $('zoomInBtn').disabled = !on;
  if (!on) player.holding = false;
  updateZoomReadout();
}

/* ---------------- shooting ---------------- */
const raycaster = new THREE.Raycaster();
raycaster.far = 280;
const _dir = new THREE.Vector3(), _hp = new THREE.Vector3();
function hitInactive(h) { // things currently not really there (respawning)
  const p = h.object.userData.hit.ref;
  if (!p) return false;
  if (p.type === 'pin' && p.ref.downT > 0) return true;
  if (p.type === 'sign' && p.car.signT > 0) return true;
  if (p.type === 'drone' && p.ref.state === 'fall') return true;
  return false;
}
function fire() {
  if (game.phase !== 'fight') return;
  if (player.reloadT > 0 || player.chamberT > 0) return;
  if (player.ammo <= 0) { AudioSys.dryFire(); startReload(); return; }
  player.ammo--; game.shots++; game.waveShots++;
  AudioSys.shot();
  player.chamberT = 0.85; player.boltT = 0;
  player.kick = player.scoped ? 0.017 : 0.009;
  muzzleTip.getWorldPosition(_hp);
  muzzleLight.position.copy(_hp); muzzleLight.intensity = 26;
  const mf = $('muzzleFlash'); mf.style.transition = 'none'; mf.style.opacity = player.scoped ? 0 : 1;
  void mf.offsetWidth;
  requestAnimationFrame(() => { mf.style.transition = 'opacity .12s'; mf.style.opacity = 0; });

  camera.getWorldDirection(_dir);
  raycaster.set(camera.position, _dir);
  const hits = raycaster.intersectObjects(hitList, false);
  let hit = null;
  for (const h of hits) { if (!hitInactive(h)) { hit = h; break; } }
  const muzzle = muzzleTip.getWorldPosition(new THREE.Vector3());
  if (!hit) {
    _hp.copy(_dir).multiplyScalar(280).add(camera.position);
    tracer(muzzle, _hp);
    game.combo = 0;
    updateHUD();
    return;
  }
  tracer(muzzle, hit.point);
  const hd = hit.object.userData.hit;
  if (hd.cat === 'target') resolveTargetHit(hit, hd.ref);
  else if (hd.cat === 'foul') resolveFoul(hit, hd.ref);
  else { // occluder — dust where it lands, combo lost
    puff(hit.point, 0.5, 0xbfb49c);
    burst(hit.point, 0xd8cdb2, 4, 1.4, 0.35, 0.7);
    game.combo = 0;
  }
  updateHUD();
}
function resolveTargetHit(hit, p) {
  const t = p.ref;
  let base = p.pts;
  if (p.type === 'board' && hit.uv) {
    const r = Math.hypot(hit.uv.x - 0.5, hit.uv.y - 0.5) * 2;
    base = r < 0.3 ? 150 : (r < 0.62 ? 100 : 60);
  }
  game.combo++; game.bestCombo = Math.max(game.bestCombo, game.combo);
  const pts = Math.round((base + Math.round(hit.distance)) * comboMult());
  game.score += pts; game.targetsHit++; game.hits = (game.hits || 0) + 1; game.waveHits++;
  popup(hit.point, '+' + pts, 'good', p.type === 'board' && base === 150 ? 27 : 21);
  showHitmarker(false);
  showCombo();
  freezeT = 0.03;
  const P = hit.point;
  switch (p.type) {
    case 'balloon':
      AudioSys.popS(); burst(P, 0xffe27a, 16, 3.8, 0.6, 1.4); burst(P, 0xffffff, 6, 2.4, 0.4, 1);
      killTarget(t); break;
    case 'board':
      AudioSys.thockS(); burst(P, 0xffd76a, 8, 2, 0.4, 0.8);
      t.life = Math.min(t.life, 2.2); break;
    case 'can':
      AudioSys.dingS(); burst(P, 0xfff2b0, 7, 2, 0.4, 0.9);
      t.state = 'flying'; t.flyT = 0;
      t.vel.copy(_dir).multiplyScalar(2.5); t.vel.y = 7; t.vel.x += rr(-1, 1); break;
    case 'drone':
      AudioSys.droneS(); burst(P, 0xffa63d, 14, 3.2, 0.55, 1);
      t.state = 'fall'; t.vy = 0; break;
    case 'ball':
      AudioSys.popS(); burst(P, 0xffffff, 12, 3, 0.55, 1.2); burst(P, 0x7fd8ff, 8, 2.4, 0.5, 1);
      killTarget(t); break;
    case 'pin':
      AudioSys.chimeS(); burst(P, 0xb8ffe2, 12, 2.8, 0.5, 1.1);
      t.downT = 6; t.hub.visible = false; break;
    case 'kite':
      AudioSys.chimeS(); burst(P, 0xffd76a, 12, 2.8, 0.5, 0.8);
      t.state = 'fall'; t.vy = 0; break;
    case 'sign': {
      AudioSys.chimeS(); AudioSys.honkS(); burst(P, 0xffd76a, 12, 2.8, 0.5, 1);
      const car = p.car; car.signT = 8; if (car.signGroup) car.signGroup.visible = false;
      break;
    }
  }
}
function resolveFoul(hit, p) {
  game.combo = 0;
  showHitmarker(true);
  const ff = $('foulFlash'); ff.style.transition = 'none'; ff.style.opacity = 1;
  void ff.offsetWidth;
  requestAnimationFrame(() => { ff.style.transition = 'opacity .5s'; ff.style.opacity = 0; });
  if (p.kind === 'car') {
    AudioSys.honkS();
    game.score = Math.max(0, game.score - 25);
    popup(hit.point, T('foulCar') + ' −25', 'foul', 20);
    p.car.fleeT = 2.2;
    return;
  }
  AudioSys.whistleS();
  game.score = Math.max(0, game.score - 100);
  game.fouls++;
  if (p.kind === 'person') p.ref.startleT = 0.7;
  else if (p.ref) p.ref.scamperT = p.ref.scamperT !== undefined ? 1.6 : p.ref.scamperT;
  document.querySelectorAll('#fouls .fpip').forEach((el, i) => el.classList.toggle('hit', i < game.fouls));
  if (game.fouls >= 3) {
    showBanner(p.kind === 'person' ? T('foulPerson') : T('foulAnimal'), '−100', 1.1, true);
    setTimeout(() => { if (game.phase === 'fight' || game.phase === 'waveclear') gameOver(); }, 1050);
  } else {
    popup(hit.point, (p.kind === 'person' ? T('foulPerson') : T('foulAnimal')) + ' −100', 'foul', 22);
  }
}
function startReload() {
  if (game.phase !== 'fight' || player.reloadT > 0 || player.ammo >= MAG) return;
  player.reloadT = 1.6;
  AudioSys.reloadS();
}

/* ---------------- waves / flow ---------------- */
function startGame() {
  for (const t of [...targets]) if (t.type !== 'pin' && t.type !== 'can') killTarget(t);
  for (const t of targets) { if (t.type === 'pin') { t.downT = 0; t.hub.visible = true; } if (t.type === 'can') { t.state = 'idle'; t.root.rotation.set(0, 0, 0); } }
  for (const c of cars) if (c.signGroup) { c.signGroup.visible = true; c.signT = 0; }
  Object.assign(game, { score: 0, targetsHit: 0, hits: 0, shots: 0, fouls: 0, combo: 0, bestCombo: 0, runT: 0 });
  player.ammo = MAG; player.chamberT = 0; player.reloadT = 0; player.breath = 1;
  aimYaw = 0; aimPitch = -0.13;
  setScope(false);
  $('menu').style.display = 'none';
  $('gameover').style.display = 'none';
  $('howScreen').style.display = 'none';
  $('boardScreen').style.display = 'none';
  $('hud').style.display = 'block';
  document.querySelectorAll('#fouls .fpip').forEach(g => g.classList.remove('hit'));
  seedStaticTargets();
  startWave(1);
  AudioSys.bellS();
}
function startWave(n) {
  game.wave = n;
  game.timer = 60;
  game.waveShots = 0; game.waveHits = 0;
  game.phase = 'fight';
  showBanner(T('waveN').replace('{n}', n), n === 1 ? T('ruleTitle') : '', 1.0);
  updateHUD();
}
function waveCleared() {
  game.phase = 'waveclear'; game.interT = 3.4;
  setScope(false);
  const acc = game.waveShots ? game.waveHits / game.waveShots : 0;
  const bonus = Math.round(200 * acc) + game.wave * 25;
  game.score += bonus;
  showBanner(T('waveClear').replace('{n}', game.wave), T('bonus') + ' +' + bonus + ' · ' + Math.round(acc * 100) + '%', 1.5);
  AudioSys.clearS();
  updateHUD();
}
function gameOver() {
  game.phase = 'over';
  setScope(false);
  const acc = game.shots ? Math.round(100 * (game.hits || 0) / game.shots) : 0;
  $('goTitle').textContent = T('over');
  $('goSub').textContent = T('overSub');
  $('goStats').innerHTML =
    T('finalScore') + ' <b>' + game.score + '</b><br>' +
    T('targetsW') + ' <b>' + game.targetsHit + '</b> · ' + T('accW') + ' <b>' + acc + '%</b><br>' +
    T('wavesW') + ' <b>' + game.wave + '</b> · ' + T('comboW') + ' <b>×' + comboMultFor(game.bestCombo) + '</b>';
  prefillName();
  $('submitStatus').textContent = '';
  $('submitBtn').disabled = false;
  $('gameover').style.display = 'flex';
  updateHUD();
}
function comboMultFor(c) { return (1 + 0.25 * Math.min(Math.max(c - 1, 0), 7)).toFixed(2).replace(/\.?0+$/, ''); }

/* ---------------- HUD ---------------- */
let lastAmmo = -1, lastBusy = null;
function updateHUD() {
  $('scoreVal').textContent = game.score;
  $('waveVal').textContent = Math.max(game.wave, 1);
  $('targetVal').textContent = game.targetsHit;
  const t = Math.max(0, Math.ceil(game.timer));
  $('waveTimer').textContent = t;
  $('waveTimer').classList.toggle('hurry', t <= 10 && game.phase === 'fight');
  if (player.ammo !== lastAmmo) {
    lastAmmo = player.ammo;
    const box = $('ammo'); box.innerHTML = '';
    for (let i = 0; i < MAG; i++) {
      const d = document.createElement('div');
      d.className = 'round' + (i < player.ammo ? '' : ' spent');
      box.appendChild(d);
    }
  }
  const busy = player.chamberT > 0 || player.reloadT > 0;
  if (busy !== lastBusy) { lastBusy = busy; $('fireBtn').disabled = busy; }
  $('reloadBtn').textContent = player.reloadT > 0 ? '···' : T('reloadB');
}

/* ---------------- per-frame sim ---------------- */
function simUpdate(dt) {
  game.simT += dt;
  perfNow = elapsed;
  // breath
  const wantHold = player.scoped && (keys.ShiftLeft || keys.ShiftRight || canvasDown || qaHold);
  if (wantHold && !player.breathLock && player.breath > 0) {
    player.holding = true;
    player.breath = Math.max(0, player.breath - dt / 3);
    if (player.breath <= 0) player.breathLock = true;
  } else {
    player.holding = false;
    player.breath = Math.min(1, player.breath + dt / (player.scoped ? 5.5 : 2.5));
    if (player.breathLock && player.breath > 0.4) player.breathLock = false;
  }
  if (player.chamberT > 0) player.chamberT -= dt;
  if (player.reloadT > 0) { player.reloadT -= dt; if (player.reloadT <= 0) { player.ammo = MAG; lastAmmo = -1; } }
  if (player.boltT >= 0) {
    player.boltT += dt;
    const p = Math.min(1, player.boltT / 0.34);
    boltHandle.position.z = -0.02 + Math.sin(p * Math.PI) * 0.055;
    boltHandle.rotation.x = Math.sin(p * Math.PI) * 0.7;
    rifle.position.y = -0.33 - Math.sin(p * Math.PI) * 0.018;
    if (p >= 1) { player.boltT = -1; boltHandle.position.z = -0.02; boltHandle.rotation.x = 0; rifle.position.y = -0.33; }
  }
  player.kick *= Math.pow(0.0001, dt); if (player.kick < 0.0004) player.kick = 0;
  muzzleLight.intensity *= Math.pow(0.000001, dt); if (muzzleLight.intensity < 0.05) muzzleLight.intensity = 0;

  if (game.phase === 'fight') {
    game.runT += dt;
    game.timer -= dt;
    director(dt);
    if (game.timer <= 0 && game.phase === 'fight') waveCleared();
  } else if (game.phase === 'waveclear') {
    game.interT -= dt;
    if (game.interT <= 0) startWave(game.wave + 1);
  }
  if (!qaFreeze) {
    updateCars(dt);
    updatePeople(dt, elapsed);
    updateAnimals(dt, elapsed);
    updateTargets(dt, elapsed);
  }
  updateHUD();
}

/* ---------------- camera / render loop ---------------- */
const clock = new THREE.Clock();
function animate() {
  requestAnimationFrame(animate);
  const rawDt = Math.min(clock.getDelta(), 0.05);
  elapsed += rawDt;
  let dt = rawDt;
  if (freezeT > 0) { freezeT -= rawDt; dt = 0; }
  if (QA_MODE === 'auto') qaAutoPilot();
  if (dt > 0 || game.phase !== 'fight') simUpdate(dt);

  for (const c of clouds) { c.g.position.x += c.v * rawDt; if (c.g.position.x > 230) c.g.position.x = -230; }
  updateSparks(rawDt); updatePuffs(rawDt); updatePopups(rawDt);
  for (const tr of tracers) {
    if (tr.t < 0.09) { tr.t += rawDt; tr.line.material.opacity = 0.9 * (1 - tr.t / 0.09); }
    else tr.line.material.opacity = 0;
  }

  // scope zoom easing — glides smoothly to whatever graded level is set
  const targetFov = player.scoped ? player.zoomFov : FOV_PLAIN;
  if (Math.abs(camera.fov - targetFov) > 0.05) {
    camera.fov += (targetFov - camera.fov) * Math.min(1, rawDt * 11);
    camera.updateProjectionMatrix();
  }
  const scopedNow = player.scoped && camera.fov < 34;
  $('scopeOverlay').style.display = scopedNow ? 'block' : 'none';
  $('zoomReadout').style.display = scopedNow ? 'block' : 'none';
  $('cross').style.display = (!scopedNow && (game.phase === 'fight' || game.phase === 'waveclear')) ? 'block' : 'none';
  rifle.visible = !scopedNow;
  $('breathWrap').style.display = player.scoped ? 'block' : 'none';
  $('breathFill').style.width = Math.round(player.breath * 100) + '%';
  $('breathFill').style.background = player.holding ? 'linear-gradient(90deg,#ffd98a,#ffb340)' : '';

  // aim: player + sway + kick (menu gets a slow idle pan over the city)
  let yaw = aimYaw, pitch = aimPitch;
  if (game.phase === 'menu') { yaw = Math.sin(elapsed * 0.07) * 0.24; pitch = -0.12 + Math.sin(elapsed * 0.05) * 0.015; }
  const amp = QA_MODE ? 0 : (player.scoped ? (player.holding ? 0.0007 : 0.0044) : 0.0007);
  const swX = (Math.sin(elapsed * 0.83) + Math.sin(elapsed * 1.31 + 2.1) * 0.6) * amp;
  const swY = (Math.cos(elapsed * 0.97 + 0.7) + Math.sin(elapsed * 1.53) * 0.6) * amp * 0.85;
  camera.position.copy(CAM_POS);
  camera.rotation.order = 'YXZ';
  camera.rotation.y = yaw + swX;
  camera.rotation.x = pitch + swY + player.kick;
  camera.rotation.z = 0;
  rifle.position.x = 0.32 + swX * 1.4;
  if (player.boltT < 0) rifle.position.y = -0.33 + swY * 1.2;

  renderer.render(scene, camera);
  if (QA_MODE) $('qaState').textContent = JSON.stringify(qaState());
}

/* ---------------- language + leaderboard ---------------- */
function applyLang() {
  $('tagLine').textContent = T('tag');
  $('startBtn').textContent = T('play');
  $('howBtn').textContent = T('how');
  $('boardBtn').textContent = T('board');
  $('endBoardBtn').textContent = T('board');
  $('ruleTitle').textContent = T('ruleTitle');
  $('ruleBody').textContent = T('ruleBody');
  $('howTitle').textContent = T('howTitle');
  $('howBody').innerHTML = T('howBody');
  $('howClose').textContent = T('close');
  $('boardClose').textContent = T('close');
  $('boardTitle').textContent = T('board');
  $('tabAll').textContent = T('allTime');
  $('tabWeek').textContent = T('week');
  $('scoreLab').textContent = T('score');
  $('waveLab').textContent = T('wave');
  $('timeLab').textContent = T('time');
  $('targetsLab').textContent = T('targets');
  $('foulsLab').textContent = T('fouls');
  $('ammoLab').textContent = T('mag');
  $('breathLab').textContent = T('breath');
  $('scopeBtn').textContent = T('scopeB');
  $('zoomBtn').textContent = T('zoomB');
  $('fireBtn').textContent = T('fireB');
  $('submitBtn').textContent = T('submit');
  $('againBtn').textContent = T('again');
  $('nameInput').placeholder = T('namePh');
  lastAmmo = -1; lastBusy = null; updateHUD();
}
const langSel = $('langSel');
window.LANGS.forEach(([code, label]) => { const o = document.createElement('option'); o.value = code; o.textContent = label; langSel.appendChild(o); });
langSel.value = window.LANG_CUR;
langSel.addEventListener('change', () => {
  window.LANG_CUR = langSel.value;
  try { localStorage.setItem('sniper3dLang', window.LANG_CUR); } catch (e) {}
  applyLang();
  if ($('boardScreen').style.display === 'flex') renderBoard();
});
let boardData = null, boardTab = 'all';
async function loadBoard() {
  $('boardList').innerHTML = '<p style="text-align:center;opacity:.8">' + T('loading') + '</p>';
  try { const r = await fetch('/api/luna-games?game=sniper-shot'); boardData = await r.json(); } catch (e) { boardData = null; }
  renderBoard();
}
function renderBoard() {
  if (!boardData) { $('boardList').innerHTML = '<p style="text-align:center;opacity:.8">' + T('noScores') + '</p>'; return; }
  $('tabAll').classList.toggle('on', boardTab === 'all');
  $('tabWeek').classList.toggle('on', boardTab === 'week');
  const rows = boardData[boardTab] || [];
  if (!rows.length) { $('boardList').innerHTML = '<p style="text-align:center;opacity:.8">' + T('noScores') + '</p>'; return; }
  $('boardList').innerHTML = rows.map((r, i) => `<div class="row"><span class="rk">${i + 1}.</span><span class="nm"></span><span class="sc">${r.score}</span></div>`).join('');
  [...$('boardList').querySelectorAll('.row .nm')].forEach((el, i) => { el.textContent = rows[i].name; });
}
function openBoard() { $('boardScreen').style.display = 'flex'; boardTab = 'all'; loadBoard(); }
$('tabAll').onclick = () => { boardTab = 'all'; renderBoard(); };
$('tabWeek').onclick = () => { boardTab = 'week'; renderBoard(); };
$('boardClose').onclick = () => $('boardScreen').style.display = 'none';
$('boardBtn').onclick = () => { AudioSys.init(); openBoard(); };
$('endBoardBtn').onclick = () => { AudioSys.init(); openBoard(); };
$('howBtn').onclick = () => { AudioSys.init(); $('howScreen').style.display = 'flex'; };
$('howClose').onclick = () => $('howScreen').style.display = 'none';
function prefillName() {
  const inp = $('nameInput');
  const tg = window.Telegram && window.Telegram.WebApp && window.Telegram.WebApp.initDataUnsafe;
  const tname = tg && tg.user && tg.user.first_name;
  let saved = ''; try { saved = localStorage.getItem('sniper3dName') || ''; } catch (e) {}
  inp.value = (saved || tname || 'Guest').slice(0, 16);
}
$('submitBtn').onclick = async () => {
  const btn = $('submitBtn'); btn.disabled = true;
  const name = ($('nameInput').value.trim() || 'Guest').slice(0, 16);
  try { localStorage.setItem('sniper3dName', name); } catch (e) {}
  $('submitStatus').textContent = T('loading');
  const initData = (window.Telegram && window.Telegram.WebApp && window.Telegram.WebApp.initData) || '';
  try {
    const r = await fetch('/api/luna-games?game=sniper-shot', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ initData, name, score: game.score, seconds: Math.max(1, Math.round(game.runT)) }) });
    const d = await r.json();
    if (d && d.ok) { $('submitStatus').textContent = d.rank ? T('rank').replace('{n}', d.rank) : T('saved'); boardData = null; }
    else { $('submitStatus').textContent = '⚠ ' + (d && d.error ? d.error : 'error'); btn.disabled = false; }
  } catch (e) { $('submitStatus').textContent = '⚠ network'; btn.disabled = false; }
};

/* ---------------- QA hooks ---------------- */
const _av = new THREE.Vector3();
function aimAtPoint(p) {
  _av.copy(p).sub(camera.position);
  const len = _av.length(); _av.divideScalar(len || 1);
  aimPitch = THREE.MathUtils.clamp(Math.asin(THREE.MathUtils.clamp(_av.y, -1, 1)), -1.0, 0.34);
  aimYaw = THREE.MathUtils.clamp(Math.atan2(-_av.x, -_av.z), -0.78, 0.78);
  camera.rotation.order = 'YXZ';
  camera.rotation.y = aimYaw; camera.rotation.x = aimPitch; camera.rotation.z = 0;
  camera.updateMatrixWorld(true);
}
function qaState() {
  const c0 = cars[0], p0 = people[0], b0 = birds[0];
  return {
    phase: game.phase, wave: game.wave, score: game.score, targetsHit: game.targetsHit,
    hits: game.hits || 0, shots: game.shots, fouls: game.fouls, combo: game.combo,
    ammo: player.ammo, scoped: player.scoped, zoomIdx: player.zoomIdx, zoomFov: player.zoomFov,
    zoomX: zoomLabel(), fov: Math.round(camera.fov * 10) / 10,
    timer: Math.round(game.timer), targetsActive: targets.length,
    counts: { cars: cars.length, people: people.length, animals: animals.length, birds: birds.length, ducks: ducks.length, pigeons: pigeons.length },
    life: {
      car: c0 ? [Math.round(c0.g.position.x * 10) / 10, Math.round(c0.g.position.z * 10) / 10] : null,
      person: p0 ? [Math.round(p0.g.position.x * 10) / 10, Math.round(p0.g.position.z * 10) / 10] : null,
      bird: b0 ? [Math.round(b0.g.position.x), Math.round(b0.g.position.y), Math.round(b0.g.position.z)] : null,
    },
    drawCalls: renderer.info.render.calls,
    errors: window.__errs, qaDone,
  };
}
function qaAimable(p) { // would aimAtPoint(p) land inside the aim clamps?
  _av.copy(p).sub(camera.position);
  const len = _av.length() || 1; _av.divideScalar(len);
  const yaw = Math.atan2(-_av.x, -_av.z), pitch = Math.asin(THREE.MathUtils.clamp(_av.y, -1, 1));
  return Math.abs(yaw) <= 0.76 && pitch >= -0.98 && pitch <= 0.32;
}
function qaAimTarget() {
  let best = null, bestD = 1e9, bestKind = '';
  const consider = (pos, kind) => { if (!qaAimable(pos)) return; const d = pos.distanceTo(camera.position); if (d < bestD) { bestD = d; best = pos; bestKind = kind; } };
  for (const t of targets) { if (!t.alive) continue; if (t.type === 'pin' && t.downT > 0) continue; t.aimPos(_av); consider(_av.clone(), t.type); }
  for (const c of cars) if (c.signGroup && c.signGroup.visible) { c.sign.getWorldPosition(_av); consider(_av.clone(), 'sign'); }
  if (!best) return 'none';
  aimAtPoint(best);
  return bestKind + '@' + Math.round(bestD);
}
function qaAimFoul() { // a stroller with a CLEAR line — no building in the way
  let best = null, bestD = 1e9;
  const rc = new THREE.Raycaster(); rc.far = 280;
  for (const p of people) {
    _av.copy(p.g.position); _av.y += 1.15;
    if (!qaAimable(_av)) continue;
    scene.updateMatrixWorld(true);
    const dir = _av.clone().sub(camera.position).normalize();
    rc.set(camera.position, dir);
    const hs = rc.intersectObjects(hitList, false);
    const first = hs.find(h => !hitInactive(h));
    if (!first || first.object !== p.proxy) continue; // blocked or off-line
    const d = _av.distanceTo(camera.position);
    if (d < bestD) { bestD = d; best = p; }
  }
  if (!best) return false;
  _av.copy(best.g.position); _av.y += 1.15;
  aimAtPoint(_av);
  return true;
}
function qaAimCar() { // nearest car visible over the parapet (streets you can see)
  let best = null, bestD = 1e9;
  for (const c of cars) { if (c.g.position.z < -14) continue; const d = c.g.position.distanceTo(camera.position); if (d < bestD) { bestD = d; best = c; } }
  if (!best) return false;
  _av.copy(best.g.position); _av.y += 0.7;
  aimAtPoint(_av);
  return true;
}
window.__qa = {
  start: () => startGame(),
  state: qaState,
  aim: (x, y, z) => aimAtPoint(new THREE.Vector3(x, y, z)),
  scope: v => setScope(v !== false),
  zoom: i => setZoomFov(ZOOMS[THREE.MathUtils.clamp(i | 0, 0, ZOOMS.length - 1)]),
  zoomSet: f => setZoomFov(f), zoomLabel: () => zoomLabel(),
  zoomIn: () => setZoomFov(player.zoomFov * 0.75), zoomOut: () => setZoomFov(player.zoomFov * 1.3),
  zoomCycle: () => cycleZoom(),
  fire: () => fire(),
  reload: () => startReload(),
  aimTarget: () => qaAimTarget(),
  aimFoul: () => qaAimFoul(),
  aimCar: () => qaAimCar(),
  holdBreath: v => { qaHold = !!v; },
  freeze: v => { qaFreeze = v !== false; },
  setLang: l => { if (window.I18N[l]) { window.LANG_CUR = l; langSel.value = l; applyLang(); } },
};
/* QA probe: dump the camera ray + the first hits along it, with the
   hit objects' world positions — diagnoses blocked/missed shots. */
window.__probe = () => {
  const dir = new THREE.Vector3();
  camera.getWorldDirection(dir);
  const rc = new THREE.Raycaster(); rc.far = 280;
  rc.set(camera.position, dir);
  const hs = rc.intersectObjects(hitList, false).slice(0, 6).map(h => {
    const hd = h.object.userData.hit || {};
    const wp = new THREE.Vector3(); h.object.getWorldPosition(wp);
    return { cat: hd.cat, kind: hd.ref && hd.ref.kind, type: hd.ref && hd.ref.type, d: Math.round(h.distance * 10) / 10, wp: [Math.round(wp.x), Math.round(wp.y * 10) / 10, Math.round(wp.z)] };
  });
  return { camY: Math.round(camera.position.y * 10) / 10, camZ: Math.round(camera.position.z), dir: [Math.round(dir.x * 100) / 100, Math.round(dir.y * 100) / 100, Math.round(dir.z * 100) / 100], hits: hs };
};
let qaAutoT = 0;
function qaAutoPilot() {
  if (qaDone) return;
  if (game.phase === 'menu') { startGame(); return; }
  if (game.phase !== 'fight') return;
  qaAutoT += 1;
  if (qaAutoT > 60 * 150) { qaDone = true; return; }
  setScope(true); qaHold = true;
  if (player.ammo <= 0) { startReload(); return; }
  if (player.chamberT > 0 || player.reloadT > 0) return;
  if (!qaFoulDone && (game.hits || 0) >= 2) {
    if (qaAimFoul()) { fire(); if (game.fouls >= 1) qaFoulDone = true; }
    return;
  }
  if (qaFoulDone && (game.hits || 0) >= 2) { qaDone = true; return; }
  if (qaAimTarget()) fire();
}

/* ---------------- boot ---------------- */
(async function boot() {
  try {
    setLoad(0.35, 'CITY');
    await nextFrame();
    setLoad(0.7, 'RANGE');
    seedStaticTargets();
    await nextFrame();
    setLoad(1, 'READY');
    $('loading').style.display = 'none';
    applyLang();
    window.__qaReady = true;
    if (QA_MODE) { startGame(); }
    else { game.phase = 'menu'; $('menu').style.display = 'flex'; }
    updateHUD();
    animate();
  } catch (err) {
    window.__errs.push('boot: ' + (err && err.message));
    $('qaState').textContent = JSON.stringify({ phase: 'boot-error', errors: window.__errs });
    console.error(err);
  }
})();
