import * as THREE from 'three';

/* ============================================================
   COOKIE SNIPER — a game for the DO community.
   Cookie monsters are raiding the bakery at dusk. Guard the
   cookie jar from the sniper's perch: scope, breathe, crumble.
   Engine: three.js r160 (MIT). ALL art, characters and code are
   original to this project — the cookie monsters are procedural
   geometry built at runtime (cookie-disc bodies, googly eyes).
   No third-party characters, names or likenesses are used.
   ============================================================ */

const QA = new URLSearchParams(location.search);
const QA_MODE = QA.get('qa'); // 'auto' = self-play, '1' = API exposed for a driver
window.__errs = [];
window.addEventListener('error', e => { window.__errs.push(String(e.message || e.error)); });

const $ = id => document.getElementById(id);
const loadFill = $('loadFill'), loadPct = $('loadPct');
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
renderer.shadowMap.autoUpdate = true;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.24;
$('game').appendChild(renderer.domElement);

const scene = new THREE.Scene();
scene.fog = new THREE.FogExp2(0x180b10, 0.0115);

let isPortrait = innerWidth < innerHeight;
const camera = new THREE.PerspectiveCamera(55, innerWidth / innerHeight, 0.1, 220);
const CAM_POS = new THREE.Vector3(0, 3.15, 16.5);
camera.position.copy(CAM_POS);
addEventListener('resize', () => {
  isPortrait = innerWidth < innerHeight;
  camera.aspect = innerWidth / innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(innerWidth, innerHeight);
});

/* ---------------- lights ---------------- */
scene.add(new THREE.HemisphereLight(0x8fa3cc, 0x1a0f08, 0.85));
const keyLight = new THREE.DirectionalLight(0xffd9a8, 2.8);
keyLight.position.set(6, 11, 2);
keyLight.castShadow = true;
keyLight.shadow.mapSize.set(2048, 2048);
keyLight.shadow.camera.left = -16; keyLight.shadow.camera.right = 16;
keyLight.shadow.camera.top = 16; keyLight.shadow.camera.bottom = -26;
keyLight.shadow.camera.far = 60; keyLight.shadow.bias = -0.0004;
scene.add(keyLight);
const rimLight = new THREE.DirectionalLight(0x5e8bff, 2.3);
rimLight.position.set(-6, 5, -14);
scene.add(rimLight);
// soft warm fill from the perch so cover faces and runners read at distance
const fillLight = new THREE.DirectionalLight(0xffc9a0, 0.55);
fillLight.position.set(2, 4, 18);
scene.add(fillLight);
const underGlow = new THREE.PointLight(0xff7a26, 12, 16, 1.8);
underGlow.position.set(0, 0.8, -8);
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
  x.fillStyle = '#6e4a28'; x.fillRect(0, 0, w, h);
  // baked-crumb mottling
  for (let i = 0; i < 5200; i++) {
    const v = Math.random();
    x.fillStyle = v < 0.5 ? `rgba(46,28,12,${0.12 + Math.random() * 0.25})` : `rgba(214,164,95,${0.10 + Math.random() * 0.22})`;
    const r = 2 + Math.random() * 9;
    x.beginPath(); x.arc(Math.random() * w, Math.random() * h, r, 0, 7); x.fill();
  }
  // faint baked rings, like a giant cookie tin lid pressed into the crumbs
  x.strokeStyle = 'rgba(40,24,10,.35)'; x.lineWidth = 4;
  for (let ring = 1; ring < 8; ring++) { x.beginPath(); x.arc(w / 2, h / 2, ring * 66, 0, 7); x.stroke(); }
  x.strokeStyle = 'rgba(255,220,160,.10)'; x.lineWidth = 2;
  for (let ring = 1; ring < 8; ring++) { x.beginPath(); x.arc(w / 2, h / 2, ring * 66 + 4, 0, 7); x.stroke(); }
  // scattered crumbs + choc chips
  for (let i = 0; i < 700; i++) {
    x.fillStyle = `rgba(30,18,8,${0.3 + Math.random() * 0.4})`;
    x.beginPath(); x.arc(Math.random() * w, Math.random() * h, 1.5 + Math.random() * 3.5, 0, 7); x.fill();
  }
  for (let i = 0; i < 2600; i++) {
    x.fillStyle = `rgba(255,230,180,${Math.random() * 0.06})`;
    x.fillRect(Math.random() * w, Math.random() * h, 2, 2);
  }
});
floorTex.wrapS = floorTex.wrapT = THREE.ClampToEdgeWrapping;
const skyTex = canvasTex(1024, 512, (x, w, h) => {
  const g = x.createLinearGradient(0, 0, 0, h);
  g.addColorStop(0, '#170a26'); g.addColorStop(0.4, '#3d1732');
  g.addColorStop(0.66, '#7a2e38'); g.addColorStop(0.86, '#c96f2e'); g.addColorStop(1, '#eda852');
  x.fillStyle = g; x.fillRect(0, 0, w, h);
  for (let i = 0; i < 150; i++) { // stars only up high
    x.fillStyle = `rgba(255,244,220,${0.2 + Math.random() * 0.6})`;
    const r = Math.random() * 1.4 + 0.3;
    x.beginPath(); x.arc(Math.random() * w, Math.random() * h * 0.34, r, 0, 7); x.fill();
  }
  for (let i = 0; i < 22; i++) { // soft warm clouds
    const cx = Math.random() * w, cy = h * 0.34 + Math.random() * h * 0.44, r = 40 + Math.random() * 110;
    const rg = x.createRadialGradient(cx, cy, 0, cx, cy, r);
    rg.addColorStop(0, 'rgba(255,190,120,0.20)'); rg.addColorStop(1, 'rgba(255,190,120,0)');
    x.fillStyle = rg; x.beginPath(); x.arc(cx, cy, r, 0, 7); x.fill();
  }
  for (let i = 0; i < 30; i++) { // dark wisps for depth
    const cx = Math.random() * w, cy = h * 0.14 + Math.random() * h * 0.4, r = 40 + Math.random() * 120;
    const rg = x.createRadialGradient(cx, cy, 0, cx, cy, r);
    rg.addColorStop(0, 'rgba(20,8,20,0.4)'); rg.addColorStop(1, 'rgba(20,8,20,0)');
    x.fillStyle = rg; x.beginPath(); x.arc(cx, cy, r, 0, 7); x.fill();
  }
}, { nearest: true });
const glowTex = canvasTex(128, 128, (x, w, h) => {
  const g = x.createRadialGradient(64, 64, 2, 64, 64, 62);
  g.addColorStop(0, 'rgba(255,255,255,1)'); g.addColorStop(0.35, 'rgba(255,255,255,.5)');
  g.addColorStop(1, 'rgba(255,255,255,0)');
  x.fillStyle = g; x.fillRect(0, 0, w, h);
}, { nearest: true });
const woodTex = canvasTex(256, 256, (x, w, h) => {
  x.fillStyle = '#4a3420'; x.fillRect(0, 0, w, h);
  for (let i = 0; i < 46; i++) {
    x.strokeStyle = `rgba(${20 + Math.random() * 30},${12 + Math.random() * 18},6,${0.25 + Math.random() * 0.3})`;
    x.lineWidth = 1 + Math.random() * 3;
    const y = Math.random() * h;
    x.beginPath(); x.moveTo(0, y);
    x.bezierCurveTo(w * 0.3, y + (Math.random() - .5) * 14, w * 0.7, y + (Math.random() - .5) * 14, w, y);
    x.stroke();
  }
  x.strokeStyle = 'rgba(0,0,0,.6)'; x.lineWidth = 10; x.strokeRect(0, 0, w, h);
  x.fillStyle = 'rgba(0,0,0,.5)';
  for (const [px, py] of [[14, 14], [w - 14, 14], [14, h - 14], [w - 14, h - 14]]) { x.beginPath(); x.arc(px, py, 5, 0, 7); x.fill(); }
});
const stoneTex = canvasTex(256, 256, (x, w, h) => {
  x.fillStyle = '#2c2639'; x.fillRect(0, 0, w, h);
  for (let i = 0; i < 900; i++) {
    const v = 34 + Math.random() * 32;
    x.fillStyle = `rgba(${v + 8},${v + 3},${v + 16},${0.5})`;
    x.fillRect(Math.random() * w, Math.random() * h, 3 + Math.random() * 7, 3 + Math.random() * 7);
  }
  x.strokeStyle = 'rgba(0,0,0,.5)'; x.lineWidth = 2;
  for (let i = 0; i < 14; i++) {
    const px = Math.random() * w, py = Math.random() * h;
    x.beginPath(); x.moveTo(px, py);
    x.lineTo(px + (Math.random() - .5) * 70, py + (Math.random() - .5) * 70); x.stroke();
  }
});

const cookieTex = canvasTex(256, 256, (x, w, h) => {
  x.fillStyle = '#d9a45f'; x.fillRect(0, 0, w, h);
  for (let i = 0; i < 1500; i++) { // dough grain
    const v = Math.random();
    x.fillStyle = v < 0.5 ? `rgba(150,100,45,${0.10 + Math.random() * 0.18})` : `rgba(240,200,130,${0.10 + Math.random() * 0.16})`;
    x.fillRect(Math.random() * w, Math.random() * h, 2 + Math.random() * 4, 2 + Math.random() * 4);
  }
  const rg = x.createRadialGradient(w/2, h/2, w*0.28, w/2, h/2, w*0.52); // baked edge
  rg.addColorStop(0, 'rgba(120,72,25,0)'); rg.addColorStop(1, 'rgba(120,72,25,0.55)');
  x.fillStyle = rg; x.fillRect(0, 0, w, h);
  for (let i = 0; i < 15; i++) { // chocolate chips
    const cx = 20 + Math.random() * (w - 40), cy = 20 + Math.random() * (h - 40), r = 6 + Math.random() * 8;
    x.fillStyle = '#3a2110';
    x.beginPath(); x.arc(cx, cy, r, 0, 7); x.fill();
    x.fillStyle = 'rgba(255,220,170,.25)';
    x.beginPath(); x.arc(cx - r * 0.3, cy - r * 0.3, r * 0.35, 0, 7); x.fill();
  }
});
const doughTex = canvasTex(256, 256, (x, w, h) => {
  x.fillStyle = '#ecdcae'; x.fillRect(0, 0, w, h);
  for (let i = 0; i < 900; i++) { // soft raw-dough mottling
    const v = Math.random();
    x.fillStyle = v < 0.5 ? `rgba(206,178,110,${0.10 + Math.random() * 0.16})` : `rgba(250,240,210,${0.10 + Math.random() * 0.18})`;
    const r = 3 + Math.random() * 10;
    x.beginPath(); x.arc(Math.random() * w, Math.random() * h, r, 0, 7); x.fill();
  }
  for (let i = 0; i < 26; i++) { // flour dusting patches
    const cx = Math.random() * w, cy = Math.random() * h, r = 8 + Math.random() * 22;
    const rg = x.createRadialGradient(cx, cy, 0, cx, cy, r);
    rg.addColorStop(0, 'rgba(255,252,244,0.5)'); rg.addColorStop(1, 'rgba(255,252,244,0)');
    x.fillStyle = rg; x.beginPath(); x.arc(cx, cy, r, 0, 7); x.fill();
  }
  for (let i = 0; i < 500; i++) { // tiny raw specks
    x.fillStyle = `rgba(160,128,70,${Math.random() * 0.25})`;
    x.fillRect(Math.random() * w, Math.random() * h, 2, 2);
  }
});
const milkTex = canvasTex(256, 256, (x, w, h) => {
  x.fillStyle = '#f4f7f2'; x.fillRect(0, 0, w, h);
  x.fillStyle = '#3f74c9'; x.fillRect(0, h * 0.34, w, h * 0.3); // blue band
  x.fillStyle = '#e8eefc'; x.fillRect(0, h * 0.40, w, h * 0.05);
  x.fillStyle = '#d84b3a'; x.beginPath(); x.arc(w / 2, h * 0.49, 20, 0, 7); x.fill(); // abstract spot label
  x.fillStyle = 'rgba(255,255,255,.85)'; x.beginPath(); x.arc(w / 2, h * 0.49, 8, 0, 7); x.fill();
  x.strokeStyle = 'rgba(90,110,140,.35)'; x.lineWidth = 5; x.strokeRect(0, 0, w, h);
});
const candyTex = canvasTex(256, 256, (x, w, h) => {
  x.fillStyle = '#f6ecec'; x.fillRect(0, 0, w, h);
  x.fillStyle = '#d84b5e';
  for (let i = -4; i < 10; i++) { // diagonal candy stripes
    x.beginPath();
    x.moveTo(i * 48, 0); x.lineTo(i * 48 + 24, 0); x.lineTo(i * 48 + 24 - 64, h); x.lineTo(i * 48 - 64, h);
    x.closePath(); x.fill();
  }
  x.strokeStyle = 'rgba(120,40,50,.4)'; x.lineWidth = 5; x.strokeRect(0, 0, w, h);
});

/* ---------------- arena set ---------------- */
const coverMeshes = [];   // shot blockers (raycast targets)
const flames = [];
let embers = null;
{
  const sky = new THREE.Mesh(new THREE.SphereGeometry(120, 32, 20),
    new THREE.MeshBasicMaterial({ map: skyTex, side: THREE.BackSide, fog: false }));
  scene.add(sky);
  const moon = new THREE.Mesh(new THREE.CircleGeometry(2.2, 40), new THREE.MeshBasicMaterial({ map: cookieTex, fog: false }));
  moon.position.set(-14, 13, -60); scene.add(moon);
  const moonGlow = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTex, color: 0xffcf8f, transparent: true, opacity: .5, depthWrite: false, fog: false }));
  moonGlow.scale.set(12, 12, 1); moonGlow.position.copy(moon.position); scene.add(moonGlow);

  const ground = new THREE.Mesh(new THREE.CircleGeometry(30, 56),
    new THREE.MeshStandardMaterial({ map: floorTex, roughness: 0.9, metalness: 0.06 }));
  ground.rotation.x = -Math.PI / 2; ground.position.set(0, 0, -4);
  ground.receiveShadow = true;
  scene.add(ground);

  const rim1 = new THREE.Mesh(new THREE.TorusGeometry(24, 0.07, 10, 90),
    new THREE.MeshStandardMaterial({ color: 0x1a0d05, emissive: 0xff7a26, emissiveIntensity: 2.2 }));
  rim1.rotation.x = Math.PI / 2; rim1.position.set(0, 0.02, -4); scene.add(rim1);
  const rim2 = new THREE.Mesh(new THREE.TorusGeometry(17, 0.05, 8, 80),
    new THREE.MeshStandardMaterial({ color: 0x050d1a, emissive: 0xffe2ae, emissiveIntensity: 1.1 }));
  rim2.rotation.x = Math.PI / 2; rim2.position.set(0, 0.02, -4); scene.add(rim2);

  // the far gate the runners are escaping FROM — and your gate line behind
  const gateMat = new THREE.MeshStandardMaterial({ color: 0x140a06, emissive: 0xe04a08, emissiveIntensity: 1.5, roughness: .4 });
  const gate = new THREE.Mesh(new THREE.TorusGeometry(3.4, 0.18, 14, 64), gateMat);
  gate.position.set(0, 3.2, -21); scene.add(gate);
  const gateGlow = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTex, color: 0xff8b3d, transparent: true, opacity: 0.5, depthWrite: false }));
  gateGlow.scale.set(12, 12, 1); gateGlow.position.copy(gate.position); scene.add(gateGlow);

  // backdrop colonnade
  const stoneMat = new THREE.MeshStandardMaterial({ map: stoneTex, color: 0xc7a37e, roughness: .95 });
  for (let i = 0; i < 9; i++) {
    const a = Math.PI * (0.08 + 0.105 * i);
    const px = Math.cos(a) * 26, pz = -4 - Math.sin(a) * 26;
    if (pz > 2) continue;
    const pillar = new THREE.Mesh(new THREE.CylinderGeometry(0.55, 0.7, 8 + (i % 3), 10), stoneMat);
    pillar.position.set(px, 3.6, pz); pillar.castShadow = true; scene.add(pillar);
    const flame = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTex, color: 0xffa63d, transparent: true, opacity: .85, depthWrite: false }));
    flame.scale.set(1.7, 2.1, 1); flame.userData.k = 1.17; flame.position.set(px, 8.2 + (i % 3), pz);
    scene.add(flame); flames.push(flame);
  }

  // --- cover: cookie jars, milk cartons, candy barriers, cookie stacks ---
  const glassMat = new THREE.MeshStandardMaterial({ color: 0xd8ecff, transparent: true, opacity: 0.30, roughness: 0.12, metalness: 0.1 });
  const lidMat = new THREE.MeshStandardMaterial({ color: 0xc9962e, roughness: 0.35, metalness: 0.8 });
  const milkMat = new THREE.MeshStandardMaterial({ map: milkTex, roughness: .8 });
  const candyMat = new THREE.MeshStandardMaterial({ map: candyTex, roughness: .8 });
  const cookieMat = new THREE.MeshStandardMaterial({ map: cookieTex, roughness: .85 });
  const cookieTexTall = cookieTex.clone(); cookieTexTall.repeat.set(1, 3); cookieTexTall.needsUpdate = true;
  const cookieStackMat = new THREE.MeshStandardMaterial({ map: cookieTexTall, roughness: .85 });
  function addCover(mesh, x, z, w, h) {
    mesh.position.set(x, h / 2, z);
    mesh.castShadow = true; mesh.receiveShadow = true;
    scene.add(mesh); coverMeshes.push(mesh);
    return { x, z, w, h, mesh };
  }
  window.__covers = [
    addCover(new THREE.Mesh(new THREE.CylinderGeometry(0.68, 0.68, 3.4, 18), glassMat), -4.6, -14, 1.4, 3.4),
    addCover(new THREE.Mesh(new THREE.BoxGeometry(1.5, 1.5, 1.5), milkMat), 2.8, -13.4, 1.5, 1.5),
    addCover(new THREE.Mesh(new THREE.BoxGeometry(2.6, 1.05, 0.5), candyMat), 5.6, -8, 2.6, 1.05),
    addCover(new THREE.Mesh(new THREE.CylinderGeometry(0.68, 0.68, 3.4, 18), glassMat), -1.8, -7.6, 1.4, 3.4),
    addCover(new THREE.Mesh(new THREE.BoxGeometry(1.5, 1.5, 1.5), milkMat), -5.8, -2.2, 1.5, 1.5),
    addCover(new THREE.Mesh(new THREE.CylinderGeometry(0.75, 0.75, 3.0, 20), cookieStackMat), 4.4, -1.6, 1.5, 3.0),
    addCover(new THREE.Mesh(new THREE.BoxGeometry(2.6, 1.05, 0.5), candyMat), 0.6, 3.4, 2.6, 1.05),
    addCover(new THREE.Mesh(new THREE.CylinderGeometry(0.68, 0.68, 3.4, 18), glassMat), -4.2, 4.2, 1.4, 3.4),
    addCover(new THREE.Mesh(new THREE.BoxGeometry(1.5, 1.5, 1.5), milkMat), 6.1, 8.6, 1.5, 1.5),
    addCover(new THREE.Mesh(new THREE.BoxGeometry(2.6, 1.05, 0.5), candyMat), -2.4, 9.2, 2.6, 1.05),
  ];
  // jar dressing: lids + cookies inside the three glass jars; gable tops on the milk cartons
  for (const c of window.__covers) {
    if (c.h === 3.4) {
      const lid = new THREE.Mesh(new THREE.CylinderGeometry(0.74, 0.74, 0.14, 18), lidMat);
      lid.position.set(c.x, 3.47, c.z); lid.castShadow = true; scene.add(lid);
      for (let i = 0; i < 3; i++) {
        const ck = new THREE.Mesh(new THREE.CylinderGeometry(0.55, 0.55, 0.17, 18), cookieMat);
        ck.rotation.x = Math.PI / 2; ck.rotation.z = Math.random() * 3;
        ck.position.set(c.x, 0.55 + i * 0.85, c.z); scene.add(ck);
      }
    } else if (c.h === 1.5) {
      const gable = new THREE.Mesh(new THREE.CylinderGeometry(0.01, 1.04, 0.52, 4), milkMat);
      gable.rotation.y = Math.PI / 4; gable.scale.z = 0.72;
      gable.position.set(c.x, 1.76, c.z); gable.castShadow = true; scene.add(gable);
    }
  }
  // stacked cookie dressing on the tall stack (not waypoint cover)
  const extra = new THREE.Mesh(new THREE.CylinderGeometry(0.55, 0.55, 0.18, 18), cookieMat);
  extra.rotation.x = Math.PI / 2; extra.rotation.z = 0.4;
  extra.position.set(4.4, 3.12, -1.6); extra.castShadow = true; scene.add(extra); coverMeshes.push(extra);
  // side torches
  for (const sx of [-8.5, 8.5]) for (const sz of [-12, 0, 10]) {
    const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.12, 2.6, 8), new THREE.MeshStandardMaterial({ map: woodTex, roughness: .9 }));
    pole.position.set(sx, 1.3, sz); scene.add(pole);
    const fl = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTex, color: 0xffa63d, transparent: true, opacity: .9, depthWrite: false }));
    fl.scale.set(1.3, 1.7, 1); fl.userData.k = 0.9; fl.position.set(sx, 2.9, sz); scene.add(fl); flames.push(fl);
  }
  // war banners — house colours of the two fighters, marking the lanes
  const bannerCols = [0xff7d9c, 0xffe6b8];
  window.__banners = [];
  [[-6.9, -5.5, 0], [6.9, -11.5, 1], [-7.4, -16.5, 1], [7.4, -3.5, 0]].forEach(([bx, bz, ci]) => {
    const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.08, 4.6, 8), new THREE.MeshStandardMaterial({ map: woodTex, roughness: .9 }));
    pole.position.set(bx, 2.3, bz); pole.castShadow = true; scene.add(pole);
    const cloth = new THREE.Mesh(new THREE.PlaneGeometry(1.15, 2.5),
      new THREE.MeshStandardMaterial({ color: bannerCols[ci], emissive: bannerCols[ci], emissiveIntensity: 0.32, roughness: 0.9, side: THREE.DoubleSide }));
    cloth.position.set(bx + 0.6, 3.15, bz); cloth.rotation.y = 0.35; scene.add(cloth);
    window.__banners.push(cloth);
  });
  // the sniper's perch: wooden bakery counter below the lens line
  const perch = new THREE.Mesh(new THREE.BoxGeometry(8.5, 2.1, 2.4), new THREE.MeshStandardMaterial({ map: woodTex, roughness: .85 }));
  perch.position.set(0, 1.05, 15.6); perch.receiveShadow = true; scene.add(perch);

  // the oven mouth the monsters pour out of: dark opening + warm glow
  const oven = new THREE.Mesh(new THREE.PlaneGeometry(11, 6.5),
    new THREE.MeshBasicMaterial({ color: 0x120602 }));
  oven.position.set(0, 3, -23.5); scene.add(oven);
  const ovenGlow = new THREE.PointLight(0xff8b3d, 30, 20, 1.8);
  ovenGlow.position.set(0, 2.6, -20.5); scene.add(ovenGlow);

  // THE COOKIE JAR — what they're all running for, on the counter in front of you
  {
    const jar = new THREE.Group();
    const glass = new THREE.Mesh(new THREE.CylinderGeometry(0.92, 0.84, 1.9, 24), glassMat);
    glass.position.y = 0.95; jar.add(glass);
    for (let i = 0; i < 4; i++) {
      const ck = new THREE.Mesh(new THREE.CylinderGeometry(0.72, 0.72, 0.2, 20), cookieMat);
      ck.rotation.x = Math.PI / 2; ck.rotation.z = Math.random() * 3;
      ck.position.set((Math.random() - .5) * 0.1, 0.32 + i * 0.4, (Math.random() - .5) * 0.1);
      jar.add(ck);
    }
    const band = new THREE.Mesh(new THREE.CylinderGeometry(0.94, 0.94, 0.42, 24), candyMat);
    band.position.y = 1.45; jar.add(band);
    const lid = new THREE.Mesh(new THREE.CylinderGeometry(0.98, 0.98, 0.2, 24), lidMat);
    lid.position.y = 2.0; lid.castShadow = true; jar.add(lid);
    const knob = new THREE.Mesh(new THREE.SphereGeometry(0.16, 12, 10), lidMat);
    knob.position.y = 2.18; jar.add(knob);
    jar.scale.setScalar(0.8);
    jar.position.set(0, 0, 13.5);
    scene.add(jar);
    const jarGlow = new THREE.PointLight(0xffc37a, 7, 9, 1.8);
    jarGlow.position.set(0, 3.1, 12.4); scene.add(jarGlow);
  }

  const N = 260, pos = new Float32Array(N * 3);
  for (let i = 0; i < N; i++) {
    pos[i * 3] = (Math.random() - .5) * 30; pos[i * 3 + 1] = Math.random() * 8; pos[i * 3 + 2] = -22 + Math.random() * 34;
  }
  const eg = new THREE.BufferGeometry();
  eg.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  embers = new THREE.Points(eg, new THREE.PointsMaterial({ map: glowTex, color: 0xffa050, size: 0.1, transparent: true, opacity: .8, depthWrite: false, blending: THREE.AdditiveBlending }));
  scene.add(embers);
}
const COVERS = window.__covers;
const BANNERS = window.__banners;

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
  tone(freq0, freq1, dur, type = 'sine', peak = 0.4, delay = 0) {
    if (!this.ctx || this.muted) return; const t = this.ctx.currentTime + delay;
    const o = this.ctx.createOscillator(); o.type = type;
    o.frequency.setValueAtTime(freq0, t); o.frequency.exponentialRampToValueAtTime(Math.max(freq1, 1), t + dur);
    this.env(o, t, 0.005, dur, peak); o.start(t); o.stop(t + dur + 0.05);
  },
  noise(dur, filterFreq, type = 'bandpass', peak = 0.3, q = 1, delay = 0) {
    if (!this.ctx || this.muted) return; const t = this.ctx.currentTime + delay;
    const len = Math.max(1, (dur * this.ctx.sampleRate) | 0);
    const buf = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
    const d = buf.getChannelData(0); for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    const src = this.ctx.createBufferSource(); src.buffer = buf;
    const f = this.ctx.createBiquadFilter(); f.type = type; f.frequency.value = filterFreq; f.Q.value = q;
    src.connect(f); this.env(f, t, 0.004, dur, peak); src.start(t);
  },
  shot() { // crack + body + long colosseum echo
    this.noise(0.16, 2600, 'highpass', 0.65);
    this.tone(150, 34, 0.3, 'sine', 0.9);
    this.noise(0.5, 420, 'lowpass', 0.4, 0.7, 0.02);
    this.noise(0.3, 500, 'lowpass', 0.16, 0.7, 0.24);   // echo
    this.noise(0.34, 380, 'lowpass', 0.09, 0.7, 0.5);   // echo tail
  },
  dryFire() { this.tone(900, 500, 0.05, 'square', 0.12); },
  bolt() { this.noise(0.05, 1800, 'bandpass', 0.22, 2, 0.02); this.noise(0.05, 1200, 'bandpass', 0.26, 2, 0.14); this.tone(300, 180, 0.05, 'square', 0.1, 0.22); },
  reload() { this.noise(0.06, 900, 'bandpass', 0.25, 2, 0); this.noise(0.06, 1400, 'bandpass', 0.28, 2, 0.32); this.noise(0.07, 700, 'bandpass', 0.3, 2, 1.15); this.tone(240, 160, 0.06, 'square', 0.12, 1.3); },
  hitTick() { this.tone(1500, 1300, 0.05, 'square', 0.16); },
  crunch() { // a bite into a crisp cookie: bright noise snap + low thump
    this.noise(0.09, 900, 'bandpass', 0.5, 0.8);
    this.noise(0.05, 2400, 'highpass', 0.28);
    this.tone(190, 70, 0.1, 'sine', 0.4);
  },
  crumble() { // the whole cookie gives way — three snaps cascading down
    this.crunch();
    this.noise(0.1, 650, 'bandpass', 0.42, 0.8, 0.07);
    this.noise(0.13, 420, 'bandpass', 0.36, 0.8, 0.15);
    this.tone(300, 60, 0.24, 'triangle', 0.3, 0.02);
  },
  bossCrunch() { // deeper, heavier crunch for the dough monster
    this.noise(0.16, 300, 'bandpass', 0.6, 0.7);
    this.noise(0.08, 1100, 'bandpass', 0.3, 0.8, 0.01);
    this.tone(110, 42, 0.18, 'sine', 0.55);
  },
  headshot() { this.tone(1560, 1560, 0.09, 'sine', 0.22); this.tone(2340, 2340, 0.14, 'sine', 0.18, 0.07); },
  kill() { this.tone(520, 180, 0.16, 'triangle', 0.3); },
  breach() { this.tone(196, 130, 0.5, 'sawtooth', 0.3); this.tone(147, 98, 0.55, 'sawtooth', 0.26, 0.08); },
  bell() { this.tone(660, 655, 0.7, 'sine', 0.28); this.tone(990, 985, 0.55, 'sine', 0.16); },
  waveClear() { this.tone(523, 523, 0.14, 'triangle', 0.25); this.tone(659, 659, 0.14, 'triangle', 0.25, 0.13); this.tone(784, 784, 0.3, 'triangle', 0.28, 0.26); },
};
$('muteBtn').addEventListener('click', () => {
  AudioSys.init();
  AudioSys.muted = !AudioSys.muted;
  $('muteBtn').textContent = AudioSys.muted ? '✕' : '♪';
});

/* ---------------- cookie monsters are 100% procedural ----------------
   No models are loaded: every monster is built at runtime from
   primitives (see the CookieMonster class below), so the game is
   fully self-contained and the creatures are original designs. */

/* ---------------- effects: sparks, puffs, tracers ---------------- */
const fxGroup = new THREE.Group(); scene.add(fxGroup);
const SPARKS = 200;
const sparkGeo = new THREE.BufferGeometry();
const sparkPos = new Float32Array(SPARKS * 3);
const sparkVel = new Float32Array(SPARKS * 3);
const sparkLife = new Float32Array(SPARKS);
sparkGeo.setAttribute('position', new THREE.BufferAttribute(sparkPos, 3));
const sparkMat = new THREE.PointsMaterial({ map: glowTex, size: 0.16, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, vertexColors: true });
const sparkCol = new Float32Array(SPARKS * 3);
sparkGeo.setAttribute('color', new THREE.BufferAttribute(sparkCol, 3));
const sparkPts = new THREE.Points(sparkGeo, sparkMat);
sparkPts.frustumCulled = false; fxGroup.add(sparkPts);
let sparkHead = 0;
const _c = new THREE.Color();
function burst(pos, colorHex, n = 14, power = 2.4, up = 1.1) {
  _c.set(colorHex);
  for (let i = 0; i < n; i++) {
    const k = sparkHead; sparkHead = (sparkHead + 1) % SPARKS;
    sparkPos[k * 3] = pos.x; sparkPos[k * 3 + 1] = pos.y; sparkPos[k * 3 + 2] = pos.z;
    const a = Math.random() * Math.PI * 2, r = (0.3 + Math.random() * 0.7) * power;
    sparkVel[k * 3] = Math.cos(a) * r; sparkVel[k * 3 + 1] = Math.sin(a) * r * 0.7 + up * Math.random(); sparkVel[k * 3 + 2] = Math.sin(a) * r;
    sparkLife[k] = 0.34 + Math.random() * 0.3;
    sparkCol[k * 3] = _c.r; sparkCol[k * 3 + 1] = _c.g; sparkCol[k * 3 + 2] = _c.b;
  }
}
function updateSparks(dt) {
  for (let k = 0; k < SPARKS; k++) {
    if (sparkLife[k] <= 0) { sparkPos[k * 3 + 1] = -60; continue; }
    sparkLife[k] -= dt;
    sparkVel[k * 3 + 1] -= 5.5 * dt;
    sparkPos[k * 3] += sparkVel[k * 3] * dt;
    sparkPos[k * 3 + 1] += sparkVel[k * 3 + 1] * dt;
    sparkPos[k * 3 + 2] += sparkVel[k * 3 + 2] * dt;
  }
  sparkGeo.attributes.position.needsUpdate = true;
  sparkGeo.attributes.color.needsUpdate = true;
}
const puffs = [];
function puff(pos, scale = 0.5, tint = 0xcfc4b0, opacity = 0.4) {
  const m = new THREE.SpriteMaterial({ map: glowTex, color: tint, transparent: true, opacity, depthWrite: false });
  const s = new THREE.Sprite(m);
  s.position.copy(pos); s.scale.set(scale, scale * 0.82, 1);
  fxGroup.add(s); puffs.push({ s, life: 0.32, max: 0.32, grow: scale * 2.2, op: opacity });
}
function updatePuffs(dt) {
  for (let i = puffs.length - 1; i >= 0; i--) {
    const o = puffs[i]; o.life -= dt;
    o.s.material.opacity = o.op * Math.max(0, o.life / o.max);
    const sc = o.s.scale.x + o.grow * dt; o.s.scale.set(sc, sc * 0.82, 1);
    o.s.position.y += dt * 0.3;
    if (o.life <= 0) { fxGroup.remove(o.s); o.s.material.dispose(); puffs.splice(i, 1); }
  }
}
const tracers = [];
function tracer(from, to, colorHex = 0xffd9a0) {
  const g = new THREE.BufferGeometry().setFromPoints([from, to]);
  const m = new THREE.LineBasicMaterial({ color: colorHex, transparent: true, opacity: 0.95, blending: THREE.AdditiveBlending, depthWrite: false });
  const line = new THREE.Line(g, m);
  fxGroup.add(line); tracers.push({ line, life: 0.09 });
}
function updateTracers(dt) {
  for (let i = tracers.length - 1; i >= 0; i--) {
    const t = tracers[i]; t.life -= dt;
    t.line.material.opacity = Math.max(0, t.life / 0.09) * 0.95;
    if (t.life <= 0) { fxGroup.remove(t.line); t.line.geometry.dispose(); t.line.material.dispose(); tracers.splice(i, 1); }
  }
}

/* ---------------- cookie monsters ----------------
   Original creatures, built from primitives: a round cookie-disc
   body with chocolate chips, googly eyes on stalks, a wide mouth,
   stubby arms and legs. They run with a wobbly bounce-and-tilt
   gait, duck behind cover, and crumble into chunks when shot.
   Kinds: 'chip' (small + fast, 1 hit), 'cookie' (medium, 2 hits),
   'chunk' (big + slow tank, 3 hits). Eye-zone hits always crumble. */
const ROWS = [-13.8, -7.9, -1.9, 3.9, 9.0]; // cover rows by z
const BREACH_Z = 11.6;
let enemySeq = 0;
const KINDS = {
  chip:   { scale: 0.62, hp: 1, speedF: 1.5,  dough: 0xe0b06a, rBase: 0.36 },
  cookie: { scale: 1.0,  hp: 2, speedF: 1.0,  dough: 0xd9a45f, rBase: 0.36 },
  chunk:  { scale: 1.5,  hp: 3, speedF: 0.58, dough: 0xbf8742, rBase: 0.34 },
};
const chipMatShared = new THREE.MeshStandardMaterial({ color: 0x3a2110, roughness: .6 });
const eyeWhiteMat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: .35 });
const pupilMat = new THREE.MeshStandardMaterial({ color: 0x140a06, roughness: .3 });
const mouthMat = new THREE.MeshStandardMaterial({ color: 0x2a1608, roughness: .9 });
const chunkGeo = new THREE.BoxGeometry(0.17, 0.11, 0.17);
const chunkMats = [0xd9a45f, 0xc08b3e, 0x3a2110, 0xe6bc77].map(c =>
  new THREE.MeshStandardMaterial({ color: c, roughness: .9 }));

class CookieMonster {
  constructor(kind, speed, speedF) {
    const K = KINDS[kind];
    this.kind = kind; this.K = K;
    this.baseSpeed = speed * (speedF || K.speedF);
    this.hp = K.hp; this.state = 'run'; this.dead = false; this.breached = false;
    this.wpIndex = 0; this.pauseT = 0; this.hitT = 0; this.deathT = 0; this.alertT = 0;
    this.id = ++enemySeq;
    this.gait = Math.random() * 6.28;
    this.duck = 0; this.squash = 0; this.spawnT = 0;
    this.chunks = [];
    // hit volumes (radii matched to the disc body; consumed by fire())
    const sc = K.scale;
    this.hitR = { head: 0.27 * sc + 0.05, body: 0.47 * sc, low: 0.3 * sc };
    this.group = new THREE.Group();
    this.buildBody();
    // path: oven -> weave cover rows -> the cookie jar line
    const sx = (Math.random() - 0.5) * 7;
    this.wps = [{ x: sx, z: -19.5, cover: false }];
    for (const rz of ROWS) {
      const rowCovers = COVERS.filter(c => Math.abs(c.z - rz) < 1.2);
      let cx, cz = rz, cw = 0;
      if (rowCovers.length && Math.random() < 0.85) {
        const c = rowCovers[(Math.random() * rowCovers.length) | 0];
        cx = c.x + (Math.random() < 0.5 ? -1 : 1) * (c.w / 2 + 0.62); cz = c.z; cw = 1;
      } else cx = (Math.random() - 0.5) * 11;
      this.wps.push({ x: cx, z: cz, cover: !!cw });
    }
    this.wps.push({ x: (Math.random() - 0.5) * 6, z: BREACH_Z + 1.5, cover: false });
    this.group.position.set(this.wps[0].x, 0, this.wps[0].z);
    scene.add(this.group);
  }
  buildBody() {
    const K = this.K, sc = K.scale;
    const R = 0.55 * sc;                    // disc radius
    const legLen = 0.3 * sc;
    this.R = R; this.legLen = legLen;
    const doughMat = new THREE.MeshStandardMaterial({ map: cookieTex, color: K.dough, roughness: .85 });
    const limbMat = new THREE.MeshStandardMaterial({ color: K.dough, roughness: .85 });
    const body = new THREE.Group();          // bounces / tilts / ducks
    body.position.y = legLen + R;
    this.body = body;
    this.group.add(body);
    // the cookie disc (flat faces forward/back)
    const disc = new THREE.Mesh(new THREE.CylinderGeometry(R, R, 0.3 * sc, 26), doughMat);
    disc.rotation.x = Math.PI / 2;
    disc.castShadow = true;
    body.add(disc); this.disc = disc;
    // a second thinner disc behind for the tank — a proper double chunk
    if (this.kind === 'chunk') {
      const disc2 = new THREE.Mesh(new THREE.CylinderGeometry(R * 0.94, R * 0.94, 0.26 * sc, 26), doughMat);
      disc2.rotation.x = Math.PI / 2; disc2.position.z = -0.3 * sc; disc2.castShadow = true;
      body.add(disc2);
    }
    // 3D chips sprinkled on the front face
    for (let i = 0; i < 6; i++) {
      const chip = new THREE.Mesh(new THREE.SphereGeometry(0.05 * sc, 8, 6), chipMatShared);
      const a = Math.random() * 6.28, rr = Math.random() * R * 0.62;
      chip.position.set(Math.cos(a) * rr, Math.sin(a) * rr - 0.05 * sc, 0.16 * sc);
      chip.scale.z = 0.5;
      body.add(chip);
    }
    // wide open mouth on the front face
    const mouth = new THREE.Mesh(new THREE.CircleGeometry(0.17 * sc, 20), mouthMat);
    mouth.scale.set(1.45, 0.85, 1);
    mouth.position.set(0, -0.14 * sc, 0.155 * sc);
    body.add(mouth); this.mouth = mouth;
    // googly eyes on stalks — this cluster is the head/eye zone
    this.pupils = [];
    for (const sx of [-1, 1]) {
      const stalk = new THREE.Mesh(new THREE.CylinderGeometry(0.028 * sc, 0.028 * sc, 0.18 * sc, 6), limbMat);
      stalk.position.set(sx * 0.17 * sc, R + 0.06 * sc, 0.02 * sc);
      stalk.rotation.z = -sx * 0.25;
      body.add(stalk);
      const eye = new THREE.Mesh(new THREE.SphereGeometry(0.135 * sc, 14, 12), eyeWhiteMat);
      eye.position.set(sx * 0.2 * sc, R + 0.17 * sc, 0.03 * sc);
      eye.castShadow = true;
      body.add(eye);
      const pupil = new THREE.Mesh(new THREE.SphereGeometry(0.06 * sc, 10, 8), pupilMat);
      pupil.position.set(sx * 0.2 * sc, R + 0.19 * sc, 0.145 * sc);
      body.add(pupil);
      this.pupils.push(pupil);
    }
    // stubby arms (pivot at the shoulder)
    this.arms = [];
    for (const sx of [-1, 1]) {
      const arm = new THREE.Group();
      arm.position.set(sx * (R + 0.02), 0.08 * sc, 0);
      const m = new THREE.Mesh(new THREE.CylinderGeometry(0.055 * sc, 0.065 * sc, 0.44 * sc, 8), limbMat);
      m.position.y = -0.2 * sc; m.castShadow = true;
      arm.add(m);
      const hand = new THREE.Mesh(new THREE.SphereGeometry(0.085 * sc, 10, 8), limbMat);
      hand.position.y = -0.42 * sc;
      arm.add(hand);
      arm.rotation.z = sx * 0.45;
      body.add(arm);
      this.arms.push(arm);
    }
    // stubby legs + shoes (pivot at the hip, attached to the group so
    // the body can bounce above them)
    this.legs = [];
    for (const sx of [-1, 1]) {
      const leg = new THREE.Group();
      leg.position.set(sx * 0.2 * sc, legLen + 0.1 * sc, 0);
      const m = new THREE.Mesh(new THREE.CylinderGeometry(0.06 * sc, 0.055 * sc, legLen + 0.08 * sc, 8), limbMat);
      m.position.y = -(legLen + 0.08 * sc) / 2 + 0.04 * sc;
      leg.add(m);
      const shoe = new THREE.Mesh(new THREE.SphereGeometry(0.1 * sc, 10, 8), chipMatShared);
      shoe.scale.set(1, 0.6, 1.5); shoe.position.set(0, -legLen - 0.02 * sc, 0.04 * sc);
      leg.add(shoe);
      this.group.add(leg);
      this.legs.push(leg);
    }
    // hit-volume markers (stand in for the old skeleton bones)
    const mk = (x, y, z) => { const o = new THREE.Object3D(); o.position.set(x, y, z); body.add(o); return o; };
    this.headBone = mk(0, R + 0.17 * sc, 0.03 * sc);       // the eyes
    this.chestBone = mk(0, 0.05 * sc, 0);
    this.pelvisBone = mk(0, -0.3 * sc, 0);
    body.scale.setScalar(0.01); // pop-in
  }
  bonePos(bone, out) {
    if (!bone) return out.set(this.group.position.x, 1.1, this.group.position.z);
    return bone.getWorldPosition(out);
  }
  speedNow() { return this.baseSpeed * (this.alertT > 0 ? 1.45 : 1); }
  spawnCrumbChunks(n, spread = 1) {
    const p = this.group.position;
    for (let i = 0; i < n; i++) {
      const m = new THREE.Mesh(chunkGeo, chunkMats[(Math.random() * chunkMats.length) | 0]);
      const sc = (0.6 + Math.random() * 1.1) * this.K.scale;
      m.scale.setScalar(sc);
      m.position.set(p.x + (Math.random() - .5) * 0.4, this.legLen + this.R + (Math.random() - .5) * 0.5, p.z + (Math.random() - .5) * 0.4);
      m.rotation.set(Math.random() * 3, Math.random() * 3, Math.random() * 3);
      m.castShadow = true;
      fxGroup.add(m);
      this.chunks.push({
        m, vx: (Math.random() - .5) * 2.4 * spread, vy: 1.6 + Math.random() * 2.2 * spread, vz: (Math.random() - .5) * 2.4 * spread,
        rx: (Math.random() - .5) * 9, rz: (Math.random() - .5) * 9, rest: false, age: 0, gone: false,
      });
    }
  }
  updateChunks(dt) {
    for (const c of this.chunks) {
      if (c.gone) continue;
      c.age += dt;
      if (!c.rest) {
        c.vy -= 9.5 * dt;
        c.m.position.x += c.vx * dt;
        c.m.position.y += c.vy * dt;
        c.m.position.z += c.vz * dt;
        c.m.rotation.x += c.rx * dt; c.m.rotation.z += c.rz * dt;
        const floorY = 0.06 * c.m.scale.x;
        if (c.m.position.y <= floorY) { c.m.position.y = floorY; c.rest = true; }
      }
      let k = 1;
      if (this.dead && this.deathT > 1.7) k = Math.max(0, 1 - (this.deathT - 1.7) / 1.2); // death sweep
      else if (c.age > 4.5) k = Math.max(0, 1 - (c.age - 4.5) / 1.0);                        // old crumbs vanish
      if (k < 1) {
        c.m.scale.setScalar(Math.max(0.01, (c.baseSc || c.m.scale.x) * k));
        if (k <= 0.02) { fxGroup.remove(c.m); c.gone = true; }
      }
    }
  }
  update(dt) {
    if (this.state === 'gone') return;
    if (this.alertT > 0) this.alertT -= dt;
    this.updateChunks(dt);
    if (this.spawnT < 1) { // pop-in
      this.spawnT = Math.min(1, this.spawnT + dt / 0.28);
      const e = 1 - Math.pow(1 - this.spawnT, 3);
      this.body.scale.setScalar(Math.max(0.01, e));
    }
    if (this.state === 'dead') {
      this.deathT += dt;
      if (this.deathT > 3.1) { this.state = 'gone'; scene.remove(this.group); }
      return;
    }
    if (this.squash > 0) this.squash = Math.max(0, this.squash - dt / 0.3);
    const sq = 1 - 0.25 * this.squash;
    if (this.state === 'hit') {
      this.hitT -= dt;
      this.body.scale.set(1 / sq, sq, 1); // squash & stretch wobble
      if (this.hitT <= 0) { this.state = 'run'; this.body.scale.set(1, 1, 1); }
      return;
    }
    // duck toward cover pose when holding at cover
    const duckTarget = this.state === 'cover' ? 1 : 0;
    this.duck += (duckTarget - this.duck) * Math.min(1, dt * 9);
    if (this.state === 'cover') {
      this.pauseT -= dt;
      this.idleAnimate(dt);
      if (this.pauseT <= 0) { this.wpIndex++; this.state = 'run'; }
      return;
    }
    // run toward current waypoint
    const wp = this.wps[this.wpIndex + 1] || this.wps[this.wps.length - 1];
    const p = this.group.position;
    const dx = wp.x - p.x, dz = wp.z - p.z;
    const d = Math.hypot(dx, dz);
    const sp = this.speedNow();
    if (d < 0.35) {
      if (wp.z >= BREACH_Z) { this.breach(); return; }
      if (wp.cover && this.alertT <= 0) {
        this.state = 'cover'; this.pauseT = 0.7 + Math.random() * 1.1;
      } else { this.wpIndex++; }
      return;
    }
    p.x += (dx / d) * sp * dt;
    p.z += (dz / d) * sp * dt;
    this.group.rotation.y = Math.atan2(dx, dz);
    this.runAnimate(dt, sp);
  }
  runAnimate(dt, sp) {
    const f = (5.2 * sp / 1.55) * (this.kind === 'chip' ? 1.35 : 1);
    this.gait += dt * f;
    const g = this.gait;
    const bounce = Math.abs(Math.sin(g)) * 0.1 * this.K.scale;
    this.body.position.y = this.legLen + this.R + bounce - this.duck * 0.3 * this.K.scale;
    this.body.scale.set(1, 1 - this.duck * 0.22, 1);
    this.body.rotation.z = Math.sin(g) * 0.085;
    this.body.rotation.x = 0.06 + Math.sin(g * 2) * 0.03;
    this.arms[0].rotation.x = Math.sin(g) * 0.75;
    this.arms[1].rotation.x = -Math.sin(g) * 0.75;
    this.legs[0].rotation.x = -Math.sin(g) * 0.65;
    this.legs[1].rotation.x = Math.sin(g) * 0.65;
    // googly pupils wander
    for (let i = 0; i < 2; i++) {
      const pu = this.pupils[i];
      pu.position.x = (i ? 1 : -1) * 0.2 * this.K.scale + Math.sin(this.gait * 0.7 + i * 2.4) * 0.018 * this.K.scale;
      pu.position.y = (this.R + 0.19 * this.K.scale) + Math.cos(this.gait * 0.9 + i * 1.7) * 0.015 * this.K.scale;
    }
  }
  idleAnimate(dt) { // at cover: duck low, eyes peek, tiny nervous bounce
    this.gait += dt * 2.2;
    this.body.position.y = this.legLen + this.R - this.duck * 0.3 * this.K.scale + Math.abs(Math.sin(this.gait)) * 0.02;
    this.body.scale.set(1, 1 - this.duck * 0.22, 1);
    this.body.rotation.z = Math.sin(this.gait * 0.5) * 0.03;
    this.arms[0].rotation.x *= 0.9; this.arms[1].rotation.x *= 0.9;
    this.legs[0].rotation.x *= 0.9; this.legs[1].rotation.x *= 0.9;
  }
  breach() {
    if (this.breached) return;
    this.breached = true; this.state = 'gone';
    scene.remove(this.group);
    onBreach(this);
  }
  damage(zone, point) {
    if (this.dead || this.state === 'gone') return 'none';
    if (zone === 'head') this.hp = 0; else this.hp -= playerGun.dmg;
    burst(point, 0xd9a45f, zone === 'head' ? 16 : 10, 2.0, 1.0);   // crumbs
    burst(point, 0x3a2110, 5, 1.4, 0.7);                            // choc bits
    if (this.hp <= 0) {
      this.dead = true; this.state = 'dead'; this.deathT = 0;
      this.body.visible = false;
      for (const leg of this.legs) leg.visible = false;
      this.spawnCrumbChunks(this.kind === 'chunk' ? 16 : 11, 1.15);
      for (const c of this.chunks) c.baseSc = c.m.scale.x;
      burst(point, 0xe6bc77, 18, 2.8, 1.4);
      return 'kill';
    }
    this.state = 'hit'; this.hitT = 0.34; this.squash = 1;
    this.spawnCrumbChunks(3, 0.6);
    for (const c of this.chunks) c.baseSc = c.m.scale.x;
    return 'hit';
  }
  dispose() {
    for (const c of this.chunks) fxGroup.remove(c.m);
    this.chunks = [];
    scene.remove(this.group); this.state = 'gone';
  }
}

/* ---------------- THE COOKIE DOUGH MONSTER (level boss) ----------------
   The finale of every level: a giant raw-dough blob, several times
   the size of a normal monster, built from the same primitives —
   lumpy pale dough, drip shapes, huge googly eyes, a wide mouth.
   It oozes straight for the jar, shrugging off hits that would
   crumble a cookie: body shots chip it (1), eye shots deal heavy
   damage (3) but never one-shot it. It visibly sags as it weakens.
   If it reaches the jar, the run is over regardless of breaches. */
const doughChunkMats = [0xead9b0, 0xe2cd96, 0xf7ecd0, 0xd9bd7f].map(c =>
  new THREE.MeshStandardMaterial({ color: c, roughness: .95 }));
function bossHpFor(level) { return 5 + level * 3; }          // L1: 8 HP, L10: 35 HP
function bossSpeedFor(level) { return 0.5 + level * 0.035; } // slow ooze, faster late

class DoughBoss {
  constructor(level) {
    this.isBoss = true; this.kind = 'boss';
    this.level = level;
    this.maxHp = bossHpFor(level);
    this.hp = this.maxHp;
    this.baseSpeed = bossSpeedFor(level);
    this.state = 'run'; this.dead = false; this.breached = false;
    this.hitT = 0; this.deathT = 0; this.alertT = 0; this.spawnT = 0;
    this.gait = Math.random() * 6.28;
    this.id = ++enemySeq;
    this.chunks = [];
    // hit volumes, consumed by fire() exactly like the monsters' bones
    this.hitR = { head: 0.85, body: 1.55, low: 1.15 };
    this.group = new THREE.Group();
    this.buildBody();
    this.baseX = (Math.random() - 0.5) * 3;
    this.swayT = Math.random() * 6.28;
    this.group.position.set(this.baseX, 0, -19.5);
    scene.add(this.group);
  }
  buildBody() {
    const doughMat = new THREE.MeshStandardMaterial({ map: doughTex, roughness: .95 });
    const body = new THREE.Group();
    this.baseBodyY = 1.62;
    body.position.y = this.baseBodyY;
    this.body = body;
    this.group.add(body);
    const blob = (r, x, y, z, sx = 1, sy = 1, sz = 1) => {
      const m = new THREE.Mesh(new THREE.SphereGeometry(r, 22, 16), doughMat);
      m.position.set(x, y, z); m.scale.set(sx, sy, sz);
      m.castShadow = true;
      body.add(m); return m;
    };
    blob(1.55, 0, 0, 0, 1.08, 0.85, 0.92);        // the main dough mass
    blob(0.78, -1.05, 0.42, 0.1, 1, 0.9, 1);      // lumps
    blob(0.66, 1.12, 0.3, -0.08, 1, 0.95, 1);
    blob(0.6, 0.35, 0.92, 0.28, 1, 0.85, 1);
    blob(0.52, -0.5, 0.85, -0.3, 1, 0.9, 1);
    blob(0.7, 0.05, -0.55, -0.95, 1, 0.8, 1);
    // dough drips hanging off the bottom rim
    for (const [dx, len] of [[-1.25, 0.62], [-0.45, 0.85], [0.55, 0.7], [1.3, 0.55]]) {
      const drip = blob(0.18, dx, -1.12, 0.55);
      drip.scale.y = len * 2.6;
    }
    // wide open mouth on the front face
    const mouth = new THREE.Mesh(new THREE.CircleGeometry(0.4, 22), mouthMat);
    mouth.scale.set(1.5, 0.95, 1);
    mouth.position.set(0, -0.52, 1.34);
    body.add(mouth); this.mouth = mouth;
    // huge googly eyes on stalks — the head/eye zone
    this.pupils = [];
    for (const sx of [-1, 1]) {
      const stalk = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.07, 0.5, 8), doughMat);
      stalk.position.set(sx * 0.52, 1.32, 0.25);
      stalk.rotation.z = -sx * 0.22;
      body.add(stalk);
      const eye = new THREE.Mesh(new THREE.SphereGeometry(0.36, 16, 12), eyeWhiteMat);
      eye.position.set(sx * 0.58, 1.62, 0.3);
      eye.castShadow = true;
      body.add(eye);
      const pupil = new THREE.Mesh(new THREE.SphereGeometry(0.16, 12, 10), pupilMat);
      pupil.position.set(sx * 0.58, 1.66, 0.6);
      body.add(pupil);
      this.pupils.push(pupil);
    }
    // stubby dough arms (pivot at the shoulder)
    this.arms = [];
    for (const sx of [-1, 1]) {
      const arm = new THREE.Group();
      arm.position.set(sx * 1.62, 0.25, 0.1);
      const m = new THREE.Mesh(new THREE.SphereGeometry(0.3, 12, 10), doughMat);
      m.scale.set(0.75, 1.5, 0.75); m.position.y = -0.42; m.castShadow = true;
      arm.add(m);
      arm.rotation.z = sx * 0.5;
      body.add(arm);
      this.arms.push(arm);
    }
    // feet blobs at the base
    for (const sx of [-1, 1]) {
      const foot = new THREE.Mesh(new THREE.SphereGeometry(0.34, 12, 10), doughMat);
      foot.scale.set(1.1, 0.45, 1.5);
      foot.position.set(sx * 0.72, -1.5, 0.35);
      body.add(foot);
    }
    // hit-volume markers (same interface as CookieMonster's bones)
    const mk = (x, y, z) => { const o = new THREE.Object3D(); o.position.set(x, y, z); body.add(o); return o; };
    this.headBone = mk(0, 1.62, 0.3);       // the eyes
    this.chestBone = mk(0, 0.35, 0);
    this.pelvisBone = mk(0, -0.75, 0);
    body.scale.setScalar(0.01); // pop-in; update() drives scale from here
  }
  bonePos(bone, out) {
    if (!bone) return out.set(this.group.position.x, 2.2, this.group.position.z);
    return bone.getWorldPosition(out);
  }
  speedNow() { return this.baseSpeed; }
  spawnDoughChunks(n, spread = 1, point = null) {
    const p = this.group.position;
    for (let i = 0; i < n; i++) {
      const m = new THREE.Mesh(chunkGeo, doughChunkMats[(Math.random() * doughChunkMats.length) | 0]);
      m.scale.setScalar(1.6 + Math.random() * 2.2);
      m.position.set(
        (point ? point.x : p.x) + (Math.random() - .5) * 0.7,
        (point ? point.y : 1.9) + (Math.random() - .5) * 0.6,
        (point ? point.z : p.z) + (Math.random() - .5) * 0.7);
      m.rotation.set(Math.random() * 3, Math.random() * 3, Math.random() * 3);
      m.castShadow = true;
      fxGroup.add(m);
      this.chunks.push({
        m, baseSc: m.scale.x,
        vx: (Math.random() - .5) * 3 * spread, vy: 1.8 + Math.random() * 2.6 * spread, vz: (Math.random() - .5) * 3 * spread,
        rx: (Math.random() - .5) * 8, rz: (Math.random() - .5) * 8, rest: false, age: 0, gone: false,
      });
    }
  }
  updateChunks(dt) {
    for (const c of this.chunks) {
      if (c.gone) continue;
      c.age += dt;
      if (!c.rest) {
        c.vy -= 9.5 * dt;
        c.m.position.x += c.vx * dt;
        c.m.position.y += c.vy * dt;
        c.m.position.z += c.vz * dt;
        c.m.rotation.x += c.rx * dt; c.m.rotation.z += c.rz * dt;
        const floorY = 0.06 * c.m.scale.x;
        if (c.m.position.y <= floorY) { c.m.position.y = floorY; c.rest = true; }
      }
      let k = 1;
      if (this.dead && this.deathT > 1.7) k = Math.max(0, 1 - (this.deathT - 1.7) / 1.2);
      else if (c.age > 4.5) k = Math.max(0, 1 - (c.age - 4.5) / 1.0);
      if (k < 1) {
        c.m.scale.setScalar(Math.max(0.01, (c.baseSc || c.m.scale.x) * k));
        if (k <= 0.02) { fxGroup.remove(c.m); c.gone = true; }
      }
    }
  }
  update(dt) {
    if (this.state === 'gone') return;
    if (this.alertT > 0) this.alertT -= dt;
    this.updateChunks(dt);
    let pop = 1; // pop-in
    if (this.spawnT < 1) {
      this.spawnT = Math.min(1, this.spawnT + dt / 0.4);
      pop = Math.max(0.01, 1 - Math.pow(1 - this.spawnT, 3));
    }
    if (this.state === 'dead') {
      this.deathT += dt;
      if (this.deathT > 3.1) { this.state = 'gone'; scene.remove(this.group); }
      return;
    }
    // sag as it weakens, plus a hit squash on top
    const frac = Math.max(0, this.hp / this.maxHp);
    const sagY = 0.7 + 0.3 * frac, sagXZ = 1 + 0.17 * (1 - frac);
    let sq = 1;
    if (this.state === 'hit') {
      this.hitT -= dt;
      sq = 1 - 0.16 * Math.sin(Math.PI * Math.max(0, this.hitT / 0.26));
      if (this.hitT <= 0) this.state = 'run';
    }
    this.body.scale.set(pop * sagXZ / sq, pop * sagY * sq, pop * sagXZ / sq);
    // ooze straight for the jar, swaying gently
    const p = this.group.position;
    p.z += this.baseSpeed * dt;
    this.swayT += dt * 0.55;
    p.x = this.baseX + Math.sin(this.swayT) * 0.7;
    this.gait += dt * 2.1;
    this.body.position.y = this.baseBodyY + Math.abs(Math.sin(this.gait)) * 0.07 - (1 - frac) * 0.22;
    this.body.rotation.z = Math.sin(this.gait * 0.5) * 0.045;
    this.arms[0].rotation.x = Math.sin(this.gait) * 0.4;
    this.arms[1].rotation.x = -Math.sin(this.gait) * 0.4;
    for (let i = 0; i < 2; i++) {
      const pu = this.pupils[i];
      pu.position.x = (i ? 1 : -1) * 0.58 + Math.sin(this.gait * 0.6 + i * 2.2) * 0.05;
      pu.position.y = 1.66 + Math.cos(this.gait * 0.8 + i * 1.6) * 0.04;
    }
    if (p.z >= BREACH_Z) this.breach();
  }
  breach() {
    if (this.breached) return;
    this.breached = true; this.state = 'gone';
    scene.remove(this.group);
    onBossBreach(this);
  }
  damage(zone, point) {
    if (this.dead || this.state === 'gone') return 'none';
    const dmg = zone === 'head' ? 3 * playerGun.dmg : playerGun.dmg;   // eyes hurt most — but never a one-shot
    this.hp -= dmg;
    burst(point, 0xead9b0, zone === 'head' ? 18 : 12, 2.2, 1.1);   // pale dough bits
    burst(point, 0xd9bd7f, 6, 1.5, 0.7);
    if (this.hp <= 0) {
      this.hp = 0;
      this.dead = true; this.state = 'dead'; this.deathT = 0;
      this.body.visible = false;
      this.spawnDoughChunks(34, 1.5);
      burst(point, 0xf7ecd0, 24, 3.2, 1.6);
      return 'kill';
    }
    this.state = 'hit'; this.hitT = 0.26;
    this.spawnDoughChunks(zone === 'head' ? 6 : 4, 0.8, point);
    return 'hit';
  }
  dispose() {
    for (const c of this.chunks) fxGroup.remove(c.m);
    this.chunks = [];
    scene.remove(this.group); this.state = 'gone';
  }
}

/* ---------------- the armory: 4 rifles, real tradeoffs ----------------
   dmg   = damage per body hit (eye hits deal 3x — on the dough boss
           this is what melts its health pool; normal monsters still
           crumble instantly to an eye shot, body hits chip their hp)
   bolt  = seconds before the next shot can fire
   mag   = rounds before a reload
   zooms = scope FOV steps (fewer steps / higher min = weaker scope)
   sway  = scope sway multiplier (lower = steadier)
   No rifle is strictly best: the Piercer hits hardest but bolts
   slowly with a 3-round mag; the Cannon cycles fastest with the
   biggest mag but chips; the Guard is rock-steady but short-sighted;
   the Chip Shot sits in the middle of everything. */
const GUNS = [
  { id: 'chip', name: 'CHIP SHOT', tag: 'The balanced all-rounder. A fine first rifle.',
    dmg: 1, bolt: 1.0, mag: 5, zooms: [15, 10.5, 7.2], sway: 1.0,
    barrel: 0.52, barrelR: 0.016, scopeLen: 0.24, scopeR: 0.026, stock: null },
  { id: 'piercer', name: 'DOUGH PIERCER', tag: 'Monster damage and a huge scope — but a slow bolt and only 3 rounds.',
    dmg: 2, bolt: 1.7, mag: 3, zooms: [13, 9, 6, 4.6], sway: 1.4,
    barrel: 0.74, barrelR: 0.014, scopeLen: 0.36, scopeR: 0.036, stock: 0x23211e },
  { id: 'cannon', name: 'CRUMB CANNON', tag: 'Fastest bolt and the biggest mag — but it only chips the dough.',
    dmg: 0.5, bolt: 0.5, mag: 8, zooms: [16, 11], sway: 1.2,
    barrel: 0.38, barrelR: 0.024, scopeLen: 0.15, scopeR: 0.02, stock: 0x9c3226 },
  { id: 'guard', name: 'JAR GUARD', tag: 'Rock-steady aim and a quick bolt — with a modest little scope.',
    dmg: 1, bolt: 0.8, mag: 6, zooms: [15, 10.5], sway: 0.45,
    barrel: 0.6, barrelR: 0.017, scopeLen: 0.2, scopeR: 0.023, stock: 0x20655e },
];
let playerGun = GUNS[0];
let gunIdx = 0;

function buildRifleMesh(def) {
  const g = new THREE.Group();
  const metal = new THREE.MeshStandardMaterial({ color: 0x23242c, roughness: 0.42, metalness: 0.75 });
  const darkMetal = new THREE.MeshStandardMaterial({ color: 0x14151a, roughness: 0.5, metalness: 0.7 });
  const stockMat = def.stock === null
    ? new THREE.MeshStandardMaterial({ map: woodTex, roughness: 0.8 })
    : new THREE.MeshStandardMaterial({ color: def.stock, roughness: 0.62, metalness: 0.08 });
  const stock = new THREE.Mesh(new THREE.BoxGeometry(0.075, 0.13, 0.52), stockMat);
  stock.position.set(0, -0.03, 0.18); stock.rotation.x = 0.1; g.add(stock);
  const body = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.075, 0.34), metal);
  body.position.set(0, 0.01, -0.08); g.add(body);
  const barrel = new THREE.Mesh(new THREE.CylinderGeometry(def.barrelR, def.barrelR, def.barrel, 10), darkMetal);
  barrel.rotation.x = Math.PI / 2; barrel.position.set(0, 0.028, -(0.22 + def.barrel / 2)); g.add(barrel);
  const muzzle = new THREE.Mesh(new THREE.CylinderGeometry(def.barrelR * 1.6, def.barrelR * 1.6, 0.07, 10), darkMetal);
  muzzle.rotation.x = Math.PI / 2; muzzle.position.set(0, 0.028, -(0.22 + def.barrel + 0.035)); g.add(muzzle);
  const scopeY = 0.07 + def.scopeR;
  const scopeTube = new THREE.Mesh(new THREE.CylinderGeometry(def.scopeR, def.scopeR, def.scopeLen, 12), darkMetal);
  scopeTube.rotation.x = Math.PI / 2; scopeTube.position.set(0, scopeY, -0.1); g.add(scopeTube);
  const scopeBell = new THREE.Mesh(new THREE.CylinderGeometry(def.scopeR * 1.45, def.scopeR * 1.2, 0.07, 12), darkMetal);
  scopeBell.rotation.x = Math.PI / 2; scopeBell.position.set(0, scopeY, -0.1 - def.scopeLen / 2); g.add(scopeBell);
  const mount = new THREE.Mesh(new THREE.BoxGeometry(0.02, 0.045, 0.1), metal);
  mount.position.set(0, 0.06, -0.1); g.add(mount);
  const bolt = new THREE.Mesh(new THREE.CylinderGeometry(0.011, 0.011, 0.07, 8), metal);
  bolt.rotation.z = Math.PI / 2; bolt.position.set(0.05, 0, 0);
  const knob = new THREE.Mesh(new THREE.SphereGeometry(0.02, 10, 8), darkMetal);
  knob.position.set(0.09, 0, 0);
  const boltHandle = new THREE.Group();
  boltHandle.add(bolt, knob); boltHandle.position.set(0.03, 0.02, 0.06); g.add(boltHandle);
  const muzzleTip = new THREE.Object3D();
  muzzleTip.position.set(0, 0.028, -(0.22 + def.barrel + 0.12)); g.add(muzzleTip);
  return { group: g, boltHandle, muzzleTip };
}

/* ---------------- rifle viewmodel (swapped per gun) ---------------- */
const VM_POS = { x: 0.22, y: -0.295, z: -0.52 };   // framed for portrait phones
let rifle = null, boltHandle = null, muzzleTip = null;
function setViewmodel(def) {
  if (rifle) camera.remove(rifle);
  const b = buildRifleMesh(def);
  rifle = b.group; boltHandle = b.boltHandle; muzzleTip = b.muzzleTip;
  rifle.position.set(VM_POS.x, VM_POS.y, VM_POS.z);
  rifle.rotation.y = 0.14;
  camera.add(rifle);
}
setViewmodel(playerGun);
scene.add(camera);
const muzzleLight = new THREE.PointLight(0xffb050, 0, 9, 1.8);
scene.add(muzzleLight);

/* ---------------- the 360° pick turntable ---------------- */
const pickGroup = new THREE.Group();
pickGroup.position.set(0, 1.02, 6.8);
const pickRings = [];
{
  const discMat = new THREE.MeshStandardMaterial({ color: 0x4a2f1a, roughness: 0.85 });
  const goldMat = new THREE.MeshStandardMaterial({ color: 0xd99a26, roughness: 0.35, metalness: 0.8, emissive: 0x442200 });
  const disc = new THREE.Mesh(new THREE.CylinderGeometry(2.1, 2.3, 0.16, 30), discMat);
  pickGroup.add(disc);
  const rim = new THREE.Mesh(new THREE.TorusGeometry(2.1, 0.045, 10, 40), goldMat);
  rim.rotation.x = Math.PI / 2; rim.position.y = 0.08; pickGroup.add(rim);
  // the prize itself — a little cookie jar on the centre pole
  const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.07, 0.85, 10), goldMat);
  pole.position.y = 0.5; pickGroup.add(pole);
  const jarGlass = new THREE.Mesh(new THREE.CylinderGeometry(0.34, 0.3, 0.52, 14),
    new THREE.MeshStandardMaterial({ color: 0xdfeaf2, roughness: 0.12, metalness: 0.1, transparent: true, opacity: 0.55 }));
  jarGlass.position.y = 1.18; pickGroup.add(jarGlass);
  const jarLid = new THREE.Mesh(new THREE.CylinderGeometry(0.37, 0.37, 0.07, 14), goldMat);
  jarLid.position.y = 1.47; pickGroup.add(jarLid);
  for (let i = 0; i < 3; i++) {
    const ck = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.16, 0.05, 12),
      new THREE.MeshStandardMaterial({ color: 0xb5772e, roughness: 0.9 }));
    ck.position.set(Math.sin(i * 2.2) * 0.12, 0.98 + i * 0.09, Math.cos(i * 2.2) * 0.12);
    ck.rotation.set(0.4, i, 0.3); pickGroup.add(ck);
  }
  GUNS.forEach((def, i) => {
    const a = i * Math.PI / 2;
    const mount = new THREE.Group();
    mount.position.set(Math.sin(a) * 1.45, 0.08, Math.cos(a) * 1.45);
    mount.rotation.y = a + Math.PI;   // barrel faces outward
    mount.userData.gunIdx = i;
    const rm = buildRifleMesh(def).group;
    rm.scale.setScalar(1.5);
    rm.rotation.x = 1.12;              // barrel tipped up, armory-style
    rm.position.y = 0.62;
    mount.add(rm);
    const ring = new THREE.Mesh(new THREE.RingGeometry(0.52, 0.66, 26),
      new THREE.MeshBasicMaterial({ color: 0xffb340, transparent: true, opacity: 0.9, side: THREE.DoubleSide }));
    ring.rotation.x = -Math.PI / 2; ring.position.y = 0.015;
    mount.add(ring);
    pickRings.push(ring);
    pickGroup.add(mount);
  });
  const pl = new THREE.PointLight(0xffc37a, 60, 22, 1.8);
  pl.position.set(0, 3.6, 6.8); scene.add(pl);
}
scene.add(pickGroup);

function updateGunPanel() {
  const d = playerGun;
  $('gunName').textContent = d.name;
  $('gunTag').textContent = d.tag;
  const maxZoom = 55 / Math.min(...d.zooms);
  const bars = [
    ['dmg', d.dmg / 2, '×' + d.dmg],
    ['bolt', THREE.MathUtils.clamp((1.9 - d.bolt) / 1.5, 0.04, 1), d.bolt.toFixed(1) + 's'],
    ['mag', d.mag / 8, '' + d.mag],
    ['zoom', THREE.MathUtils.clamp(maxZoom / 12, 0.04, 1), '×' + maxZoom.toFixed(1)],
    ['steady', THREE.MathUtils.clamp((1.7 - d.sway) / 1.4, 0.04, 1), d.sway <= 0.6 ? 'STEADY' : d.sway >= 1.3 ? 'WILD' : 'OK'],
  ];
  for (const [k, f, v] of bars) { $('gb-' + k).style.width = Math.round(f * 100) + '%'; $('gv-' + k).textContent = v; }
  $('startBtn').textContent = 'START · ' + d.name;
  pickRings.forEach((r, i) => r.visible = i === gunIdx);
}
function selectGun(i) {
  gunIdx = THREE.MathUtils.clamp(i | 0, 0, GUNS.length - 1);
  playerGun = GUNS[gunIdx];
  MAG = playerGun.mag;
  ZOOMS = playerGun.zooms;
  player.zoomIdx = Math.min(player.zoomIdx, ZOOMS.length - 1);
  if (player.ammo > MAG) player.ammo = MAG;
  lastAmmo = -1;
  setViewmodel(playerGun);
  updateGunPanel();
}
function showPick() {
  game.phase = 'gunpick';
  setScope(false);
  pickGroup.visible = true;
  $('menu').style.display = 'flex';
  $('gameover').style.display = 'none';
  $('hud').style.display = 'none';
  updateGunPanel();
}

/* ---------------- game state ---------------- */
const game = { phase: 'boot', wave: 0, level: 0, boss: null, trickleT: 0,
  score: 0, kills: 0, shots: 0, hits: 0, headshots: 0,
  breaches: 0, combo: 0, bestCombo: 0, timer: 0, toSpawn: 0, spawnT: 0,
  waveShots: 0, waveHits: 0, interT: 0, timerExpired: false, simT: 0 };
let enemies = [];
let MAG = GUNS[0].mag;
const player = { ammo: MAG, chamberT: 0, reloadT: 0, scoped: false, zoomIdx: 0,
  breath: 1, holding: false, breathLock: false, kick: 0, boltT: -1 };
let ZOOMS = GUNS[0].zooms;
let aimYaw = 0, aimPitch = -0.052;
let freezeT = 0, elapsed = 0;
let qaHold = false, qaDone = false, qaFreeze = false;

function showBanner(main, sub = '', hold = 0.9) {
  const m = $('bannerMain'), s = $('bannerSub');
  m.textContent = main; s.textContent = sub;
  m.className = ''; s.className = '';
  void m.offsetWidth;
  m.classList.add('pop'); s.classList.add('pop');
  clearTimeout(showBanner._t);
  showBanner._t = setTimeout(() => { m.classList.add('fadeout'); s.classList.add('fadeout'); }, hold * 1000);
}
let comboTimer = null;
function showToast(text, ms = 900) {
  $('combo').textContent = text;
  $('combo').style.opacity = 1;
  clearTimeout(comboTimer);
  comboTimer = setTimeout(() => $('combo').style.opacity = 0, ms);
}
function showCombo() {
  if (game.combo < 2) return;
  const mult = 1 + 0.25 * Math.min(game.combo - 1, 7);
  $('combo').textContent = 'COMBO ×' + mult.toFixed(2).replace(/\.?0+$/, '');
  $('combo').style.opacity = 1;
  clearTimeout(comboTimer);
  comboTimer = setTimeout(() => $('combo').style.opacity = 0, 900);
}
function showHitmarker(kill) {
  const hm = $('hitmarker');
  hm.classList.toggle('kill', !!kill);
  if (QA_MODE) hm.style.transform = 'translate(-50%,-50%) scale(2.1)'; // unmistakable in proof shots
  hm.style.transition = 'none'; hm.style.opacity = 1;
  void hm.offsetWidth; // commit the opaque frame before starting the fade
  if (QA_MODE) return; // QA holds the marker so proof frames can capture it
  requestAnimationFrame(() => {
    hm.style.transition = 'opacity 0.28s';
    hm.style.opacity = 0;
  });
}

/* ---------------- input: drag aim, keys, buttons ---------------- */
const keys = {};
addEventListener('keydown', e => {
  keys[e.code] = true;
  if (e.code === 'Space') { e.preventDefault(); if (!e.repeat) fire(); }
  if (e.code === 'KeyR') startReload();
  if (e.code === 'KeyF' || e.code === 'KeyQ') setScope(!player.scoped);
  if (e.code === 'Equal' && player.scoped) player.zoomIdx = Math.min(ZOOMS.length - 1, player.zoomIdx + 1);
  if (e.code === 'Minus' && player.scoped) player.zoomIdx = Math.max(0, player.zoomIdx - 1);
  AudioSys.init();
});
addEventListener('keyup', e => { keys[e.code] = false; });
addEventListener('wheel', e => {
  if (!player.scoped || (game.phase !== 'fight' && game.phase !== 'boss')) return;
  player.zoomIdx = THREE.MathUtils.clamp(player.zoomIdx + (e.deltaY > 0 ? -1 : 1), 0, ZOOMS.length - 1);
}, { passive: true });
document.body.style.touchAction = 'none';

let dragId = null, dragX = 0, dragY = 0, dragMoved = 0, dragT0 = 0, canvasDown = false;
const cvs = renderer.domElement;
cvs.addEventListener('pointerdown', e => {
  AudioSys.init();
  dragId = e.pointerId; dragX = e.clientX; dragY = e.clientY; dragMoved = 0; dragT0 = performance.now();
  canvasDown = true;
});
cvs.addEventListener('pointermove', e => {
  if (e.pointerId !== dragId) return;
  const dx = e.clientX - dragX, dy = e.clientY - dragY;
  dragX = e.clientX; dragY = e.clientY;
  dragMoved += Math.abs(dx) + Math.abs(dy);
  const sens = 0.0031 * (player.scoped ? (camera.fov / 55) * 2.2 : 1);
  aimYaw = THREE.MathUtils.clamp(aimYaw - dx * sens, -0.66, 0.66);
  aimPitch = THREE.MathUtils.clamp(aimPitch - dy * sens, -0.34, 0.18);
});
const dragEnd = e => {
  if (e.pointerId !== dragId) return;
  canvasDown = false;
  if (dragMoved < 6 && performance.now() - dragT0 < 350 && (game.phase === 'fight' || game.phase === 'boss')) fire(); // tap = shoot
  dragId = null;
};
cvs.addEventListener('pointerup', dragEnd);
cvs.addEventListener('pointercancel', dragEnd);

function bindBtn(id, fn) {
  const el = $(id);
  el.addEventListener('pointerdown', e => { e.preventDefault(); e.stopPropagation(); AudioSys.init(); fn(); });
}
bindBtn('scopeBtn', () => setScope(!player.scoped));
bindBtn('fireBtn', () => fire());
bindBtn('reloadBtn', () => startReload());
$('startBtn').addEventListener('click', () => { AudioSys.init(); startGame(); });
$('againBtn').addEventListener('click', () => { AudioSys.init(); showPick(); });

/* gun pick: drag spins the turntable, a tap raycasts a rifle */
let pickDragId = null, pickDragX = 0, pickMoved = 0, pickT0 = 0, pickDragOn = false;
const menuEl = $('menu');
menuEl.addEventListener('pointerdown', e => {
  if (game.phase !== 'gunpick' || e.target === $('startBtn')) return;
  pickDragId = e.pointerId; pickDragX = e.clientX; pickMoved = 0; pickT0 = performance.now(); pickDragOn = true;
});
menuEl.addEventListener('pointermove', e => {
  if (!pickDragOn || e.pointerId !== pickDragId) return;
  const dx = e.clientX - pickDragX; pickDragX = e.clientX;
  pickMoved += Math.abs(dx);
  pickGroup.rotation.y += dx * 0.009;
});
const pickEnd = e => {
  if (!pickDragOn || e.pointerId !== pickDragId) return;
  pickDragOn = false;
  if (pickMoved < 6 && performance.now() - pickT0 < 350) {
    const ndc = new THREE.Vector2((e.clientX / innerWidth) * 2 - 1, -(e.clientY / innerHeight) * 2 + 1);
    raycaster.setFromCamera(ndc, camera);
    const hits = raycaster.intersectObjects(pickGroup.children, true);
    for (const h of hits) {
      let o = h.object;
      while (o && o.userData.gunIdx === undefined) o = o.parent;
      if (o) { selectGun(o.userData.gunIdx); AudioSys.init(); break; }
    }
  }
  pickDragId = null;
};
menuEl.addEventListener('pointerup', pickEnd);
menuEl.addEventListener('pointercancel', pickEnd);

function setScope(on) {
  if (game.phase !== 'fight' && game.phase !== 'boss' && game.phase !== 'levelclear') on = false;
  player.scoped = on;
  $('scopeBtn').classList.toggle('on', on);
  if (!on) player.holding = false;
}

/* ---------------- shooting ---------------- */
const raycaster = new THREE.Raycaster();
const _dir = new THREE.Vector3(), _hp = new THREE.Vector3();
const _pa = new THREE.Vector3(), _pb = new THREE.Vector3(), _ph = new THREE.Vector3();
// closest approach between ray O+tD (t in [0,160]) and segment A->B.
// returns {dist, t} — t = distance along the (unit) ray to closest point.
function raySeg(O, D, A, B) {
  const d1x = D.x * 160, d1y = D.y * 160, d1z = D.z * 160;
  const d2x = B.x - A.x, d2y = B.y - A.y, d2z = B.z - A.z;
  const rx = O.x - A.x, ry = O.y - A.y, rz = O.z - A.z;
  const a = d1x * d1x + d1y * d1y + d1z * d1z, e = d2x * d2x + d2y * d2y + d2z * d2z;
  const f = d2x * rx + d2y * ry + d2z * rz;
  let s = 0, t = 0;
  if (e <= 1e-9) { // B is a single point (head sphere centre)
    s = a > 1e-9 ? THREE.MathUtils.clamp(-(d1x * rx + d1y * ry + d1z * rz) / a, 0, 1) : 0;
  } else if (a > 1e-9) {
    const c = d1x * rx + d1y * ry + d1z * rz, b = d1x * d2x + d1y * d2y + d1z * d2z;
    const den = a * e - b * b;
    s = den > 1e-9 ? THREE.MathUtils.clamp((b * f - c * e) / den, 0, 1) : 0;
    t = (b * s + f) / e;
    if (t < 0) { t = 0; s = THREE.MathUtils.clamp(-c / a, 0, 1); }
    else if (t > 1) { t = 1; s = THREE.MathUtils.clamp((b - c) / a, 0, 1); }
  }
  const dx = (O.x + d1x * s) - (A.x + d2x * t), dy = (O.y + d1y * s) - (A.y + d2y * t), dz = (O.z + d1z * s) - (A.z + d2z * t);
  return { dist: Math.hypot(dx, dy, dz), t: s * 160 };
}
function enemyVolumes(e) {
  // bones are posed by the last mixer update — call after render-prep update
  e.bonePos(e.headBone, _ph);
  e.bonePos(e.pelvisBone, _pa);
  e.bonePos(e.chestBone, _pb);
  return { head: _ph.clone(), pelv: _pa.clone(), chest: _pb.clone() };
}
function fire() {
  if (game.phase !== 'fight' && game.phase !== 'boss') return;
  if (player.reloadT > 0 || player.chamberT > 0) return;
  if (player.ammo <= 0) { AudioSys.dryFire(); startReload(); return; }
  player.ammo--; game.shots++; game.waveShots++;
  AudioSys.shot();
  player.chamberT = playerGun.bolt; player.boltT = 0;
  player.kick = player.scoped ? 0.017 : 0.009;
  // muzzle flash
  muzzleTip.getWorldPosition(_hp);
  muzzleLight.position.copy(_hp); muzzleLight.intensity = 26;
  const mf = $('muzzleFlash'); mf.style.transition = 'none'; mf.style.opacity = player.scoped ? 0 : 1;
  void mf.offsetWidth;
  requestAnimationFrame(() => { mf.style.transition = 'opacity .12s'; mf.style.opacity = 0; });

  camera.getWorldDirection(_dir);
  const O = camera.position;
  // cover occlusion
  raycaster.set(O, _dir); raycaster.far = 160;
  const occ = raycaster.intersectObjects(coverMeshes, false);
  const occDist = occ.length ? occ[0].distance : 160;
  // enemy volumes
  let best = null;
  for (const e of enemies) {
    if (e.dead || e.breached || e.state === 'gone' || e.state === 'loading' || !e.headBone) continue;
    const v = enemyVolumes(e);
    const tests = [
      { zone: 'head', r: raySeg(O, _dir, v.head, v.head), R: e.hitR.head },
      { zone: 'body', r: raySeg(O, _dir, v.pelv, v.chest), R: e.hitR.body },
      { zone: 'low', r: raySeg(O, _dir, v.pelv, _hp.set(v.pelv.x, v.pelv.y - 0.85, v.pelv.z)), R: e.hitR.low },
    ];
    for (const t of tests) {
      if (t.r.dist <= t.R && (!best || t.r.t < best.t)) {
        _v3.copy(_dir).multiplyScalar(t.r.t).add(O);
        best = { t: t.r.t, enemy: e, zone: t.zone, point: _v3.clone() };
      }
    }
  }
  const muzzle = muzzleTip.getWorldPosition(new THREE.Vector3());
  // zone priority: a shot placed on the head is a headshot, even if the
  // ray also grazes the torso capsule on the way in. The head sits just
  // above the chest, so only a head contact near the body contact counts.
  if (best && best.zone !== 'head') {
    let headBest = null;
    for (const e of enemies) {
      if (e.dead || e.breached || e.state === 'gone' || e.state === 'loading' || !e.headBone) continue;
      const v = enemyVolumes(e);
      const r = raySeg(O, _dir, v.head, v.head);
      if (r.dist <= e.hitR.head && r.t < occDist - 0.05 && r.t <= best.t + 0.35 && (!headBest || r.t < headBest.t)) {
        _v3.copy(_dir).multiplyScalar(r.t).add(O);
        headBest = { t: r.t, enemy: e, zone: 'head', point: _v3.clone() };
      }
    }
    if (headBest) best = headBest;
  }
  if (best && best.t < occDist - 0.05) {
    tracer(muzzle, best.point);
    resolveEnemyHit(best);
  } else {
    // miss — tracer to the occluder / far point, dust where it lands
    const endT = Math.min(occDist, 160);
    _v3.copy(_dir).multiplyScalar(endT).add(O);
    tracer(muzzle, _v3.clone());
    if (occDist < 160) puff(_v3.clone(), 0.4, 0x9a8d76, 0.45);
    burst(_v3.clone(), 0xffc37a, 5, 1.2, 0.5);
    game.combo = 0;
    for (const e of enemies) if (!e.dead && e.state !== 'gone') e.alertT = Math.max(e.alertT, 2.0); // shots fired — they run
  }
  updateHUD();
}
const _v3 = new THREE.Vector3();
function resolveEnemyHit(best) {
  const e = best.enemy, zone = best.zone;
  const res = e.damage(zone, best.point);
  game.hits++; game.waveHits++;
  game.combo++; game.bestCombo = Math.max(game.bestCombo, game.combo);
  const mult = 1 + 0.25 * Math.min(game.combo - 1, 7);
  const killed = res === 'kill';
  if (e.isBoss) {
    if (killed) {
      game.kills++;
      if (zone === 'head') game.headshots++;
      const pts = Math.round((300 + game.level * 100) * mult);
      game.score += pts;
      AudioSys.crumble(); AudioSys.bossCrunch(); if (zone === 'head') AudioSys.headshot();
      showToast('DOUGH MONSTER CRUMBLED!');
      freezeT = 0.09; // a longer hit-stop for the big one
    } else {
      game.score += Math.round((zone === 'head' ? 60 : 25) * mult);
      AudioSys.bossCrunch();
      if (zone === 'head') showToast('EYE HIT — BIG DAMAGE!');
    }
    showHitmarker(killed);
    if (!killed || game.combo >= 2) showCombo();
    updateHUD();
    if (killed) onBossDown(e);
    return;
  }
  if (killed) {
    game.kills++;
    if (zone === 'head') game.headshots++;
    const pts = Math.round((100 + Math.round(best.t) * 2 + (zone === 'head' ? 150 : 0)) * mult);
    game.score += pts;
    AudioSys.crumble(); if (zone === 'head') AudioSys.headshot();
    showToast(zone === 'head' ? 'EYE SHOT — CRUMBLED!' : 'CRUMBLED!');
    freezeT = 0.05; // a breath of hit-stop on the kill
  } else {
    game.score += Math.round(25 * mult);
    AudioSys.crunch();
  }
  showHitmarker(killed);
  if (!killed || game.combo >= 2) showCombo();
  updateHUD();
}
function startReload() {
  if ((game.phase !== 'fight' && game.phase !== 'boss') || player.reloadT > 0 || player.ammo >= MAG) return;
  player.reloadT = 1.6;
  AudioSys.reload();
}

/* ---------------- levels / flow ----------------
   A run is 10 levels. Each level: a wave of cookie monsters, then
   the COOKIE DOUGH MONSTER oozes in as the finale (with a light
   trickle of normal monsters while you fight it). Kill the boss to
   clear the level; kill the level-10 boss to save the jar. Three
   breaches in a level end the run — and if the boss itself reaches
   the jar, the run is over on the spot. */
function aliveCount() { return enemies.filter(e => !e.dead && !e.breached && e.state !== 'gone').length; }
function normalAlive() { return enemies.filter(e => !e.isBoss && !e.dead && !e.breached && e.state !== 'gone').length; }
function comboLabel() { return (1 + 0.25 * Math.min(Math.max(game.bestCombo - 1, 0), 7)).toFixed(2).replace(/\.?0+$/, ''); }
function breachFlashFx() {
  const bf = $('breachFlash'); bf.style.transition = 'none'; bf.style.opacity = 1;
  void bf.offsetWidth;
  requestAnimationFrame(() => { bf.style.transition = 'opacity .5s'; bf.style.opacity = 0; });
}
function startGame() { startGameAtLevel(1); AudioSys.bell(); }
function startGameAtLevel(n) {
  for (const e of enemies) e.dispose();
  enemies = [];
  game.boss = null;
  Object.assign(game, { score: 0, kills: 0, shots: 0, hits: 0, headshots: 0, breaches: 0, combo: 0, bestCombo: 0 });
  player.ammo = MAG; player.chamberT = 0; player.reloadT = 0; player.breath = 1;
  setScope(false);
  pickGroup.visible = false;
  $('menu').style.display = 'none';
  $('gameover').style.display = 'none';
  $('hud').style.display = 'block';
  startLevel(THREE.MathUtils.clamp(n | 0, 1, 10));
}
function levelSpawnCount(n) { return 4 + n * 2; }   // L1: 6 monsters → L10: 24
function startLevel(n) {
  game.level = n; game.wave = n;
  game.toSpawn = levelSpawnCount(n);
  game.spawnT = 0.8;
  game.timer = 75;
  game.timerExpired = false;
  game.waveShots = 0; game.waveHits = 0;
  game.breaches = 0;   // the jar gets a fresh guard every level
  document.querySelectorAll('#breaches .gate').forEach(g => g.classList.remove('lost'));
  player.ammo = MAG; player.reloadT = 0; player.chamberT = 0; player.breath = 1; player.breathLock = false;
  lastAmmo = -1;
  game.phase = 'fight';
  showBanner('LEVEL ' + n, n === 1 ? 'OF 10 — PROTECT THE COOKIE JAR' : 'LEVEL ' + n + ' OF 10', 1.0);
  updateHUD();
}
function startBossPhase() {
  game.phase = 'boss';
  game.timer = 0;
  game.trickleT = 3.0;
  game.boss = new DoughBoss(game.level);
  enemies.push(game.boss);
  showBanner('COOKIE DOUGH MONSTER', 'IT WANTS THE JAR — EYE SHOTS HURT IT MOST', 1.4);
  AudioSys.breach();
  updateHUD();
}
function onBossDown(boss) {
  const killBonus = 500 + game.level * 250;
  game.score += killBonus;
  game.boss = null;
  // clear the field for the breather — the boss corpse keeps crumbling
  for (const e of [...enemies]) if (e !== boss) e.dispose();
  enemies = enemies.filter(e => e === boss);
  if (game.level >= 10) { victory(); return; }
  const clearBonus = 150 + game.level * 50;
  game.score += clearBonus;
  game.phase = 'levelclear'; game.interT = 3.6;
  setScope(false);
  showBanner('LEVEL CLEARED!', 'DOUGH MONSTER DOWN · BONUS +' + (killBonus + clearBonus), 1.6);
  AudioSys.waveClear();
  updateHUD();
}
function onBossBreach(boss) {
  if (game.phase !== 'boss') return;
  breachFlashFx();
  AudioSys.breach();
  gameOver();
}
function victory() {
  game.phase = 'victory';
  setScope(false);
  const acc = game.shots ? Math.round(100 * game.hits / game.shots) : 0;
  $('goTitle').textContent = 'COOKIE JAR SAVED!';
  $('goStats').innerHTML =
    'FINAL SCORE <b>' + game.score + '</b><br>' +
    'ALL <b>10 LEVELS</b> CLEARED · CRUMBLED <b>' + game.kills + '</b> · EYE SHOTS <b>' + game.headshots + '</b><br>' +
    'ACCURACY <b>' + acc + '%</b> · BEST COMBO <b>×' + comboLabel() + '</b>';
  $('gameover').style.display = 'flex';
  AudioSys.waveClear(); AudioSys.bell();
}
function onBreach(e) {
  if (game.phase !== 'fight' && game.phase !== 'boss') return;
  game.breaches++;
  breachFlashFx();
  AudioSys.breach();
  document.querySelectorAll('#breaches .gate').forEach((g, i) => g.classList.toggle('lost', i < game.breaches));
  if (game.breaches >= 3) gameOver();
}
function gameOver() {
  game.phase = 'over';
  setScope(false);
  const acc = game.shots ? Math.round(100 * game.hits / game.shots) : 0;
  $('goTitle').textContent = 'JAR OVERRUN';
  $('goStats').innerHTML =
    'FINAL SCORE <b>' + game.score + '</b><br>' +
    'REACHED LEVEL <b>' + game.level + ' OF 10</b> · CRUMBLED <b>' + game.kills + '</b> · EYE SHOTS <b>' + game.headshots + '</b><br>' +
    'ACCURACY <b>' + acc + '%</b> · BEST COMBO <b>×' + comboLabel() + '</b>';
  $('gameover').style.display = 'flex';
}
function spawnEnemy() {
  const lv = game.level;
  const r = Math.random();
  let kind = 'cookie', speedF;
  const chunkShare = lv >= 3 ? Math.min(0.22, 0.13 + lv * 0.01) : 0;   // tanks from level 3
  const chipShare = lv >= 2 ? Math.min(0.45, 0.28 + lv * 0.015) : 0;   // minis grow with level
  if (chunkShare && r < chunkShare) kind = 'chunk';
  else if (chipShare && r < chunkShare + chipShare) {
    kind = 'chip';
    speedF = 1.5 + (lv - 1) * 0.05;   // minis get faster on later levels
  }
  const speed = 1.75 + lv * 0.17 + Math.random() * 0.5;
  enemies.push(new CookieMonster(kind, speed, speedF));
}

/* ---------------- HUD ---------------- */
let lastAmmo = -1, lastChamber = null;
function updateHUD() {
  $('scoreVal').textContent = game.score;
  $('waveVal').textContent = Math.max(game.level, 1) + '/10';
  $('killVal').textContent = game.kills;
  const bw = $('bossWrap');
  if (game.phase === 'boss' && game.boss && !game.boss.dead) {
    bw.style.display = 'block';
    $('bossFill').style.width = Math.max(0, Math.round(100 * game.boss.hp / game.boss.maxHp)) + '%';
  } else bw.style.display = 'none';
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
  if (busy !== lastChamber) { lastChamber = busy; $('fireBtn').disabled = busy; }
  $('reloadBtn').textContent = player.reloadT > 0 ? '···' : 'RELOAD';
}

/* ---------------- QA hooks ---------------- */
function aimAtPoint(p) {
  _v3.copy(p).sub(camera.position);
  const len = _v3.length(); _v3.divideScalar(len || 1);
  aimPitch = Math.asin(THREE.MathUtils.clamp(_v3.y, -1, 1));
  aimYaw = Math.atan2(-_v3.x, -_v3.z);
}
function qaState() {
  return {
    phase: game.phase, wave: game.wave, level: game.level, score: game.score, kills: game.kills,
    shots: game.shots, hits: game.hits, headshots: game.headshots, breaches: game.breaches,
    combo: game.combo, ammo: player.ammo, chamberT: Math.round(player.chamberT * 100) / 100,
    gun: playerGun.id, magSize: MAG, zoomSteps: ZOOMS.length, dmg: playerGun.dmg,
    reloadT: Math.round(player.reloadT * 100) / 100, scoped: player.scoped,
    alive: aliveCount(), toSpawn: game.toSpawn, timer: Math.round(game.timer),
    bossHp: game.boss ? game.boss.hp : null,
    bossMaxHp: game.boss ? game.boss.maxHp : null,
    bossZ: game.boss ? Math.round(game.boss.group.position.z * 10) / 10 : null,
    nearestZ: enemies.reduce((m, e) => (!e.dead && !e.breached && e.state !== 'gone' ? Math.max(m, e.group.position.z) : m), -99),
    errors: window.__errs, qaDone,
  };
}
function qaAimAt(zone, stableOnly) {
  // engage the most advanced runner — also the best screenshot subject.
  // stableOnly picks a stationary one (holding at cover / reeling from a hit).
  let e = null;
  for (const x of enemies) {
    if (x.dead || x.breached || x.state === 'gone' || x.state === 'loading' || !x.headBone) continue;
    if (stableOnly && x.state !== 'cover' && x.state !== 'hit') continue;
    if (!e || x.group.position.z > e.group.position.z) e = x;
  }
  if (!e) return false;
  const v = enemyVolumes(e);
  aimAtPoint(zone === 'head' ? v.head : v.chest);
  return true;
}
function qaAimBoss(zone) {
  const b = game.boss;
  if (!b || b.dead || b.state === 'gone' || !b.headBone) return false;
  const v = enemyVolumes(b);
  aimAtPoint(zone === 'head' ? v.head : v.chest);
  return true;
}
window.__qa = {
  start: () => startGame(),
  // QA: jump straight into level n (fresh run) — used to verify the
  // level-10 boss / victory path without playing all 10 levels.
  startLevel: n => startGameAtLevel(n),
  // QA: end the current level's wave phase immediately so the boss
  // phase begins on the next sim tick.
  skipToBoss: () => {
    if (game.phase !== 'fight') return false;
    game.toSpawn = 0;
    for (const e of [...enemies]) if (!e.isBoss) e.dispose();
    enemies = enemies.filter(e => e.isBoss);
    return true;
  },
  aimBoss: zone => qaAimBoss(zone || 'body'),
  // QA: gun pick screen — show it, choose a rifle, pose the turntable
  showPick: () => showPick(),
  pickGun: i => { selectGun(i); return playerGun.id; },
  setSpin: r => { pickGroup.rotation.y = r; },
  guns: () => GUNS.map(g => ({ id: g.id, name: g.name, dmg: g.dmg, bolt: g.bolt, mag: g.mag, zooms: g.zooms.length, sway: g.sway })),
  state: qaState,
  scope: v => setScope(v !== false),
  fire: () => fire(),
  reload: () => startReload(),
  aimAt: zone => qaAimAt(zone || 'body'),
  aimAtCover: zone => qaAimAt(zone || 'body', true),
  freeze: v => { qaFreeze = v !== false; },
  holdBreath: v => { qaHold = !!v; },
};
let qaAutoT = 0, qaShotFlip = false;
function qaAutoPilot(dt) {
  if (qaDone || (game.phase !== 'fight' && game.phase !== 'boss')) return;
  qaAutoT += dt;
  if (qaAutoT > 150) { qaDone = true; return; }
  const boss = game.boss && !game.boss.dead && game.boss.state !== 'gone' ? game.boss : null;
  const e = boss || enemies.find(x => !x.dead && !x.breached && x.state !== 'gone' && x.state !== 'loading' && x.headBone);
  if (!e) { setScope(false); return; }
  setScope(true); qaHold = true;
  qaShotFlip = !qaShotFlip;
  if (boss) qaAimBoss(qaShotFlip ? 'head' : 'body');
  else qaAimAt(qaShotFlip ? 'head' : 'body');
  if (player.ammo <= 0) { startReload(); return; }
  if (player.chamberT <= 0 && player.reloadT <= 0) fire();
  if (!boss && game.kills >= 2 && game.hits >= 2 && game.shots >= 2) qaDone = true;
}

/* ---------------- per-frame sim ---------------- */
function simUpdate(dt) {
  game.simT += dt;
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
    boltHandle.position.z = 0.06 + Math.sin(p * Math.PI) * 0.055;
    boltHandle.rotation.x = Math.sin(p * Math.PI) * 0.7;
    rifle.position.y = VM_POS.y - Math.sin(p * Math.PI) * 0.018;
    if (p >= 1) { player.boltT = -1; boltHandle.position.z = 0.06; boltHandle.rotation.x = 0; rifle.position.y = VM_POS.y; }
  }
  player.kick *= Math.pow(0.0001, dt); if (player.kick < 0.0004) player.kick = 0;
  muzzleLight.intensity *= Math.pow(0.000001, dt); if (muzzleLight.intensity < 0.05) muzzleLight.intensity = 0;

  if (game.phase === 'fight') {
    game.timer = Math.max(0, game.timer - dt);
    if (game.spawnT > 0) game.spawnT -= dt;
    if (game.toSpawn > 0 && game.spawnT <= 0 && aliveCount() < 6 + Math.floor(game.level / 3)) {
      spawnEnemy();
      game.toSpawn--;
      game.spawnT = Math.max(0.85, 2.4 - game.level * 0.14);
    }
    // the level's wave is beaten when every monster is crumbled or
    // through — then the dough monster comes out for the finale
    if (game.phase === 'fight' && game.toSpawn === 0 && normalAlive() === 0) startBossPhase();
  } else if (game.phase === 'boss') {
    // a light trickle of normal monsters keeps the pressure on
    game.trickleT -= dt;
    if (game.trickleT <= 0 && normalAlive() < 3) {
      spawnEnemy();
      game.trickleT = Math.max(3.2, 5.2 - game.level * 0.2);
    }
  } else if (game.phase === 'levelclear') {
    game.interT -= dt;
    if (game.interT <= 0) startLevel(game.level + 1);
  }
  for (const e of enemies) if (!qaFreeze) e.update(dt);
  enemies = enemies.filter(e => e.state !== 'gone');
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

  const SUB = QA_MODE === 'auto' ? 3 : 1;
  for (let s = 0; s < SUB; s++) {
    if (QA_MODE === 'auto') qaAutoPilot(dt);
    if (dt > 0 || game.phase !== 'fight') simUpdate(dt);
  }

  // ambient life
  const ep = embers.geometry.attributes.position;
  for (let i = 0; i < ep.count; i++) {
    let y = ep.getY(i) + rawDt * (0.14 + (i % 5) * 0.03);
    if (y > 8.5) y = 0;
    ep.setY(i, y);
    ep.setX(i, ep.getX(i) + Math.sin(elapsed * 0.7 + i) * rawDt * 0.12);
  }
  ep.needsUpdate = true;
  flames.forEach((fl, i) => {
    const sc = 1.45 + Math.sin(elapsed * 9 + i * 1.7) * 0.18 + Math.sin(elapsed * 23 + i) * 0.08;
    fl.scale.set(sc * (fl.userData.k || 1), sc * 1.3, 1);
  });
  underGlow.intensity = 11 + Math.sin(elapsed * 2.3) * 2.2;
  BANNERS.forEach((b, i) => { b.rotation.y = 0.35 + Math.sin(elapsed * 1.1 + i * 1.9) * 0.14; b.rotation.z = Math.sin(elapsed * 0.9 + i) * 0.03; });
  updateSparks(rawDt); updatePuffs(rawDt); updateTracers(rawDt);

  // scope zoom easing
  const targetFov = player.scoped ? ZOOMS[player.zoomIdx] : 55;
  if (Math.abs(camera.fov - targetFov) > 0.05) {
    camera.fov += (targetFov - camera.fov) * Math.min(1, rawDt * 11);
    camera.updateProjectionMatrix();
  }
  const scopedNow = player.scoped && camera.fov < 34;
  $('scopeOverlay').style.display = scopedNow ? 'block' : 'none';
  $('cross').style.display = (!scopedNow && (game.phase === 'fight' || game.phase === 'boss' || game.phase === 'levelclear')) ? 'block' : 'none';
  rifle.visible = !scopedNow;
  $('breathWrap').style.display = player.scoped ? 'block' : 'none';
  $('breathFill').style.width = Math.round(player.breath * 100) + '%';
  $('breathFill').style.background = player.holding ? 'linear-gradient(90deg,#ffd98a,#ffb340)' : '';

  // aim: player + sway + kick (gun pick gets a framed view of the turntable)
  let yaw = aimYaw, pitch = aimPitch;
  if (game.phase === 'gunpick') {
    yaw = Math.sin(elapsed * 0.08) * 0.045; pitch = -0.31 + Math.sin(elapsed * 0.06) * 0.008;
    if (!pickDragOn) pickGroup.rotation.y += rawDt * 0.4;   // the 360° spin
  }
  const amp = player.scoped ? (player.holding ? 0.0007 : 0.0044) * playerGun.sway : 0.0007;
  const swX = (Math.sin(elapsed * 0.83) + Math.sin(elapsed * 1.31 + 2.1) * 0.6) * amp;
  const swY = (Math.cos(elapsed * 0.97 + 0.7) + Math.sin(elapsed * 1.53) * 0.6) * amp * 0.85;
  camera.position.copy(CAM_POS);
  camera.rotation.order = 'YXZ';
  camera.rotation.y = yaw + swX;
  camera.rotation.x = pitch + swY + player.kick;
  camera.rotation.z = 0;
  // rifle idle sway, subtler echo of the scope sway
  rifle.position.x = VM_POS.x + swX * 1.4;
  if (player.boltT < 0) rifle.position.y = VM_POS.y + swY * 1.2;

  renderer.render(scene, camera);

  if (QA_MODE) $('qaState').textContent = JSON.stringify(qaState());
}

/* ---------------- boot ---------------- */
(async function boot() {
  try {
    setLoad(0.3, 'BAKING MONSTERS');
    await new Promise(r => setTimeout(r, 30));
    setLoad(0.65, 'FILLING THE JAR');
    await new Promise(r => setTimeout(r, 30));
    setLoad(1, 'READY');
    $('loading').style.display = 'none';
    window.__qaReady = true;
    if (QA_MODE) { startGame(); }
    else { showPick(); }
    updateHUD();
    animate();
  } catch (err) {
    window.__errs.push('boot: ' + (err && err.message));
    $('qaState').textContent = JSON.stringify({ phase: 'boot-error', errors: window.__errs });
    console.error(err);
  }
})();
