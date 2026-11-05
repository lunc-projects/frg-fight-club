import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';

/* ============================================================
   SNIPER SHOT — Midnight Colosseum Overwatch
   Characters & animations: Quaternius UBC + UAL (CC0 1.0)
   Engine: three.js r160 (MIT). All game code/art direction original.
   Same world as Arena Clash 3D: dusk colosseum, rim-lit stone,
   torch pillars, drifting embers — seen from the sniper's perch.
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
scene.fog = new THREE.FogExp2(0x0a0818, 0.0115);

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
  x.fillStyle = '#17151f'; x.fillRect(0, 0, w, h);
  for (let ring = 0; ring < 9; ring++) {
    const r0 = ring * 60, r1 = r0 + 56;
    const segs = 6 + ring * 2;
    for (let s = 0; s < segs; s++) {
      const a0 = (s / segs) * Math.PI * 2, a1 = ((s + 0.92) / segs) * Math.PI * 2;
      const v = 18 + Math.random() * 16;
      x.fillStyle = `rgb(${v + 6},${v + 2},${v + 14})`;
      x.beginPath();
      x.arc(w / 2, h / 2, r0 + 30, a0, a1); x.arc(w / 2, h / 2, r1 + 30, a1, a0, true);
      x.closePath(); x.fill();
    }
  }
  x.strokeStyle = 'rgba(0,0,0,.55)'; x.lineWidth = 3;
  for (let ring = 0; ring < 10; ring++) { x.beginPath(); x.arc(w / 2, h / 2, ring * 60 + 30, 0, 7); x.stroke(); }
  x.strokeStyle = 'rgba(0,0,0,.35)'; x.lineWidth = 1.4;
  for (let i = 0; i < 260; i++) {
    const px = Math.random() * w, py = Math.random() * h;
    x.beginPath(); x.moveTo(px, py);
    x.lineTo(px + (Math.random() - .5) * 60, py + (Math.random() - .5) * 60); x.stroke();
  }
  for (let i = 0; i < 2600; i++) {
    x.fillStyle = `rgba(255,255,255,${Math.random() * 0.05})`;
    x.fillRect(Math.random() * w, Math.random() * h, 2, 2);
  }
});
floorTex.wrapS = floorTex.wrapT = THREE.ClampToEdgeWrapping;
const skyTex = canvasTex(1024, 512, (x, w, h) => {
  const g = x.createLinearGradient(0, 0, 0, h);
  g.addColorStop(0, '#050310'); g.addColorStop(0.42, '#171233');
  g.addColorStop(0.68, '#3d1d4e'); g.addColorStop(0.86, '#8a3b2e'); g.addColorStop(1, '#2a0f14');
  x.fillStyle = g; x.fillRect(0, 0, w, h);
  for (let i = 0; i < 340; i++) {
    x.fillStyle = `rgba(255,255,255,${0.25 + Math.random() * 0.7})`;
    const r = Math.random() * 1.6 + 0.3;
    x.beginPath(); x.arc(Math.random() * w, Math.random() * h * 0.5, r, 0, 7); x.fill();
  }
  for (let i = 0; i < 46; i++) {
    const cx = Math.random() * w, cy = h * 0.16 + Math.random() * h * 0.4, r = 40 + Math.random() * 120;
    const rg = x.createRadialGradient(cx, cy, 0, cx, cy, r);
    rg.addColorStop(0, 'rgba(10,8,26,0.5)'); rg.addColorStop(1, 'rgba(10,8,26,0)');
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

/* ---------------- arena set ---------------- */
const coverMeshes = [];   // shot blockers (raycast targets)
const flames = [];
let embers = null;
{
  const sky = new THREE.Mesh(new THREE.SphereGeometry(120, 32, 20),
    new THREE.MeshBasicMaterial({ map: skyTex, side: THREE.BackSide, fog: false }));
  scene.add(sky);
  const moon = new THREE.Mesh(new THREE.CircleGeometry(2.2, 40), new THREE.MeshBasicMaterial({ color: 0xe8eeff, fog: false }));
  moon.position.set(-14, 13, -60); scene.add(moon);
  const moonGlow = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTex, color: 0x9db8ff, transparent: true, opacity: .5, depthWrite: false, fog: false }));
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
    new THREE.MeshStandardMaterial({ color: 0x050d1a, emissive: 0x2e9bff, emissiveIntensity: 1.5 }));
  rim2.rotation.x = Math.PI / 2; rim2.position.set(0, 0.02, -4); scene.add(rim2);

  // the far gate the runners are escaping FROM — and your gate line behind
  const gateMat = new THREE.MeshStandardMaterial({ color: 0x140a06, emissive: 0xe04a08, emissiveIntensity: 1.5, roughness: .4 });
  const gate = new THREE.Mesh(new THREE.TorusGeometry(3.4, 0.18, 14, 64), gateMat);
  gate.position.set(0, 3.2, -21); scene.add(gate);
  const gateGlow = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTex, color: 0xff8b3d, transparent: true, opacity: 0.5, depthWrite: false }));
  gateGlow.scale.set(12, 12, 1); gateGlow.position.copy(gate.position); scene.add(gateGlow);

  // backdrop colonnade
  const stoneMat = new THREE.MeshStandardMaterial({ map: stoneTex, roughness: .95 });
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

  // --- cover: pillars, crates, barriers enemies weave between ---
  const crateMat = new THREE.MeshStandardMaterial({ map: woodTex, roughness: .85 });
  const barrierMat = new THREE.MeshStandardMaterial({ map: stoneTex, roughness: .95 });
  function addCover(mesh, x, z, w, h) {
    mesh.position.set(x, h / 2, z);
    mesh.castShadow = true; mesh.receiveShadow = true;
    scene.add(mesh); coverMeshes.push(mesh);
    return { x, z, w, h, mesh };
  }
  window.__covers = [
    addCover(new THREE.Mesh(new THREE.CylinderGeometry(0.62, 0.72, 3.4, 12), stoneMat), -4.6, -14, 1.4, 3.4),
    addCover(new THREE.Mesh(new THREE.BoxGeometry(1.5, 1.5, 1.5), crateMat), 2.8, -13.4, 1.5, 1.5),
    addCover(new THREE.Mesh(new THREE.BoxGeometry(2.6, 1.05, 0.5), barrierMat), 5.6, -8, 2.6, 1.05),
    addCover(new THREE.Mesh(new THREE.CylinderGeometry(0.62, 0.72, 3.4, 12), stoneMat), -1.8, -7.6, 1.4, 3.4),
    addCover(new THREE.Mesh(new THREE.BoxGeometry(1.5, 1.5, 1.5), crateMat), -5.8, -2.2, 1.5, 1.5),
    addCover(new THREE.Mesh(new THREE.BoxGeometry(1.5, 3.0, 1.5), crateMat), 4.4, -1.6, 1.5, 3.0),
    addCover(new THREE.Mesh(new THREE.BoxGeometry(2.6, 1.05, 0.5), barrierMat), 0.6, 3.4, 2.6, 1.05),
    addCover(new THREE.Mesh(new THREE.CylinderGeometry(0.62, 0.72, 3.4, 12), stoneMat), -4.2, 4.2, 1.4, 3.4),
    addCover(new THREE.Mesh(new THREE.BoxGeometry(1.5, 1.5, 1.5), crateMat), 6.1, 8.6, 1.5, 1.5),
    addCover(new THREE.Mesh(new THREE.BoxGeometry(2.6, 1.05, 0.5), barrierMat), -2.4, 9.2, 2.6, 1.05),
  ];
  // stacked crate dressing (not waypoint cover)
  const extra = new THREE.Mesh(new THREE.BoxGeometry(1.1, 1.1, 1.1), crateMat);
  extra.position.set(4.4, 2.05 + 0.55, -1.6); extra.castShadow = true; scene.add(extra); coverMeshes.push(extra);
  // side torches
  for (const sx of [-8.5, 8.5]) for (const sz of [-12, 0, 10]) {
    const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.12, 2.6, 8), stoneMat);
    pole.position.set(sx, 1.3, sz); scene.add(pole);
    const fl = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTex, color: 0xffa63d, transparent: true, opacity: .9, depthWrite: false }));
    fl.scale.set(1.3, 1.7, 1); fl.userData.k = 0.9; fl.position.set(sx, 2.9, sz); scene.add(fl); flames.push(fl);
  }
  // war banners — house colours of the two fighters, marking the lanes
  const bannerCols = [0xe05e12, 0x2e9bff];
  window.__banners = [];
  [[-6.9, -5.5, 0], [6.9, -11.5, 1], [-7.4, -16.5, 1], [7.4, -3.5, 0]].forEach(([bx, bz, ci]) => {
    const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.08, 4.6, 8), stoneMat);
    pole.position.set(bx, 2.3, bz); pole.castShadow = true; scene.add(pole);
    const cloth = new THREE.Mesh(new THREE.PlaneGeometry(1.15, 2.5),
      new THREE.MeshStandardMaterial({ color: bannerCols[ci], emissive: bannerCols[ci], emissiveIntensity: 0.32, roughness: 0.9, side: THREE.DoubleSide }));
    cloth.position.set(bx + 0.6, 3.15, bz); cloth.rotation.y = 0.35; scene.add(cloth);
    window.__banners.push(cloth);
  });
  // the sniper's perch: stone ledge below the lens line, grounds the view
  const perch = new THREE.Mesh(new THREE.BoxGeometry(8.5, 2.1, 2.4), barrierMat);
  perch.position.set(0, 1.05, 15.6); perch.receiveShadow = true; scene.add(perch);

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
const CHAR_DEFS = [
  { model: 'models/ryker/char.gltf', hair: ['models/ryker/Hair_SimpleParted.gltf', 'models/ryker/Hair_Beard.gltf'], hairTint: 0 },
  { model: 'models/sable/char.gltf', hair: ['models/sable/Hair_Long.gltf'], hairTint: 0x6e4a34 },
];

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

/* ---------------- enemy runners ---------------- */
const ROWS = [-13.8, -7.9, -1.9, 3.9, 9.0]; // cover rows by z
const BREACH_Z = 11.6;
let enemySeq = 0;
class Enemy {
  constructor(defIdx, speed) {
    this.defIdx = defIdx; this.baseSpeed = speed;
    this.hp = 2; this.state = 'loading'; this.dead = false; this.breached = false;
    this.wpIndex = 0; this.pauseT = 0; this.hitT = 0; this.deathT = 0; this.alertT = 0;
    this.id = ++enemySeq;
    this.group = new THREE.Group();
    // path: gate -> weave cover rows -> breach line
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
    this.load();
  }
  async load() {
    const def = CHAR_DEFS[this.defIdx];
    try {
      const g = await loader.loadAsync(def.model);
      this.model = g.scene;
      this.model.visible = false; // no bind-pose flash while hair loads
      const bb = new THREE.Box3();
      this.model.traverse(o => { if (o.isMesh) { o.geometry.computeBoundingBox(); bb.union(o.geometry.boundingBox); } });
      const h = bb.max.y - bb.min.y;
      const s = 1.8 / h;
      this.model.scale.setScalar(s);
      this.model.position.y = -bb.min.y * s;
      this.model.traverse(o => { if (o.isMesh) { o.castShadow = true; o.frustumCulled = false; } });
      this.group.add(this.model);
      this.mixer = new THREE.AnimationMixer(this.model);
      this.actions = {};
      for (const [key, clipName] of Object.entries({ run: 'Walk_Loop', idle: 'Idle_Loop', crouch: 'Crouch_Idle_Loop', hitC: 'Hit_Chest', hitH: 'Hit_Head', death: 'Death01' })) {
        if (clips[clipName]) this.actions[key] = this.mixer.clipAction(clips[clipName]);
      }
      this.chestBone = findBone(this.model, 'spine_03') || findBone(this.model, 'spine_02');
      this.headBone = findBone(this.model, 'Head');
      this.pelvisBone = findBone(this.model, 'pelvis');
      for (const hp of def.hair || []) {
        try {
          const hg = await loader.loadAsync(hp);
          hg.scene.traverse(o => {
            if (o.isSkinnedMesh && o.skeleton && this.headBone) {
              const hi = o.skeleton.bones.findIndex(b => b.name === 'Head');
              if (hi < 0) return;
              const hm = new THREE.Mesh(o.geometry, o.material);
              hm.castShadow = true; hm.frustumCulled = false;
              if (def.hairTint) { hm.material = o.material.clone(); hm.material.color.set(def.hairTint); }
              hm.applyMatrix4(o.skeleton.boneInverses[hi]);
              this.headBone.add(hm);
            }
          });
        } catch (e) { /* hair is cosmetic */ }
      }
      this.state = 'run';
      this.play('run');
      this.mixer.update(0.05);
      this.model.visible = true;
    } catch (e) { window.__errs.push('enemy load: ' + e.message); this.state = 'gone'; }
  }
  play(key, opts = {}) {
    const a = this.actions && this.actions[key]; if (!a) return;
    const prev = this.current;
    a.reset(); a.enabled = true;
    a.setLoop(opts.loop === false ? THREE.LoopOnce : THREE.LoopRepeat, Infinity);
    a.clampWhenFinished = !!opts.clamp;
    a.timeScale = opts.timeScale !== undefined ? opts.timeScale : 1;
    a.play();
    if (prev && prev !== a) { if (opts.fade === 0) prev.stop(); else a.crossFadeFrom(prev, opts.fade !== undefined ? opts.fade : 0.12, false); }
    this.current = a; this.currentKey = key;
  }
  bonePos(bone, out) {
    if (!bone) return out.set(this.group.position.x, 1.1, this.group.position.z);
    return bone.getWorldPosition(out);
  }
  speedNow() { return this.baseSpeed * (this.alertT > 0 ? 1.45 : 1); }
  update(dt) {
    if (this.state === 'loading' || this.state === 'gone') return;
    if (this.alertT > 0) this.alertT -= dt;
    if (this.mixer) this.mixer.update(dt);
    if (this.state === 'dead') {
      this.deathT += dt;
      if (this.deathT > 2.0) this.group.position.y = -(this.deathT - 2.0) * 0.55; // settle into the stone
      if (this.deathT > 3.1) { this.state = 'gone'; scene.remove(this.group); }
      return;
    }
    if (this.state === 'hit') {
      this.hitT -= dt;
      if (this.hitT <= 0) { this.state = 'run'; this.play('run'); }
      return;
    }
    if (this.state === 'cover') {
      this.pauseT -= dt;
      if (this.pauseT <= 0) { this.wpIndex++; this.state = 'run'; this.play('run'); }
      return;
    }
    // run toward current waypoint
    const wp = this.wps[this.wpIndex + 1] || this.wps[this.wps.length - 1];
    const p = this.group.position;
    const dx = wp.x - p.x, dz = wp.z - p.z;
    const d = Math.hypot(dx, dz);
    const sp = this.speedNow();
    if (this.current) this.current.timeScale = sp / 1.55;
    if (d < 0.35) {
      if (wp.z >= BREACH_Z) { this.breach(); return; }
      if (wp.cover && this.alertT <= 0) {
        this.state = 'cover'; this.pauseT = 0.7 + Math.random() * 1.1;
        this.play('crouch');
      } else { this.wpIndex++; }
      return;
    }
    p.x += (dx / d) * sp * dt;
    p.z += (dz / d) * sp * dt;
    this.group.rotation.y = Math.atan2(dx, dz);
  }
  breach() {
    if (this.breached) return;
    this.breached = true; this.state = 'gone';
    scene.remove(this.group);
    onBreach(this);
  }
  damage(zone, point) {
    if (this.dead || this.state === 'gone') return 'none';
    if (zone === 'head') this.hp = 0; else this.hp -= 1;
    if (this.hp <= 0) {
      this.dead = true; this.state = 'dead'; this.deathT = 0;
      this.play('death', { loop: false, clamp: true, fade: 0.05 });
      burst(point, 0xff5560, 18, 2.6, 1.2);
      return 'kill';
    }
    this.state = 'hit'; this.hitT = 0.34;
    this.play(zone === 'head' ? 'hitH' : 'hitC', { loop: false, clamp: true, fade: 0.03 });
    burst(point, 0xff8095, 10, 1.8, 0.8);
    return 'hit';
  }
  dispose() { scene.remove(this.group); this.state = 'gone'; }
}

/* ---------------- rifle viewmodel ---------------- */
const rifle = new THREE.Group();
const boltHandle = new THREE.Group();
{
  const metal = new THREE.MeshStandardMaterial({ color: 0x23242c, roughness: 0.42, metalness: 0.75 });
  const darkMetal = new THREE.MeshStandardMaterial({ color: 0x14151a, roughness: 0.5, metalness: 0.7 });
  const wood = new THREE.MeshStandardMaterial({ map: woodTex, roughness: 0.8 });
  const stock = new THREE.Mesh(new THREE.BoxGeometry(0.075, 0.13, 0.52), wood);
  stock.position.set(0, -0.03, 0.18); stock.rotation.x = 0.1; rifle.add(stock);
  const body = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.075, 0.34), metal);
  body.position.set(0, 0.01, -0.08); rifle.add(body);
  const barrel = new THREE.Mesh(new THREE.CylinderGeometry(0.016, 0.016, 0.52, 10), darkMetal);
  barrel.rotation.x = Math.PI / 2; barrel.position.set(0, 0.028, -0.48); rifle.add(barrel);
  const muzzle = new THREE.Mesh(new THREE.CylinderGeometry(0.026, 0.026, 0.07, 10), darkMetal);
  muzzle.rotation.x = Math.PI / 2; muzzle.position.set(0, 0.028, -0.72); rifle.add(muzzle);
  const scopeTube = new THREE.Mesh(new THREE.CylinderGeometry(0.026, 0.026, 0.24, 12), darkMetal);
  scopeTube.rotation.x = Math.PI / 2; scopeTube.position.set(0, 0.095, -0.1); rifle.add(scopeTube);
  const scopeBell = new THREE.Mesh(new THREE.CylinderGeometry(0.038, 0.032, 0.07, 12), darkMetal);
  scopeBell.rotation.x = Math.PI / 2; scopeBell.position.set(0, 0.095, -0.21); rifle.add(scopeBell);
  const mount = new THREE.Mesh(new THREE.BoxGeometry(0.02, 0.045, 0.1), metal);
  mount.position.set(0, 0.06, -0.1); rifle.add(mount);
  const bolt = new THREE.Mesh(new THREE.CylinderGeometry(0.011, 0.011, 0.07, 8), metal);
  bolt.rotation.z = Math.PI / 2; bolt.position.set(0.05, 0, 0);
  const knob = new THREE.Mesh(new THREE.SphereGeometry(0.02, 10, 8), darkMetal);
  knob.position.set(0.09, 0, 0);
  boltHandle.add(bolt, knob); boltHandle.position.set(0.03, 0.02, 0.06); rifle.add(boltHandle);
  rifle.position.set(0.3, -0.31, -0.55);
  rifle.rotation.y = 0.06;
  camera.add(rifle);
  scene.add(camera);
}
const muzzleTip = new THREE.Object3D();
muzzleTip.position.set(0, 0.028, -0.78); rifle.add(muzzleTip);
const muzzleLight = new THREE.PointLight(0xffb050, 0, 9, 1.8);
scene.add(muzzleLight);

/* ---------------- game state ---------------- */
const game = { phase: 'boot', wave: 0, score: 0, kills: 0, shots: 0, hits: 0, headshots: 0,
  breaches: 0, combo: 0, bestCombo: 0, timer: 0, toSpawn: 0, spawnT: 0,
  waveShots: 0, waveHits: 0, interT: 0, timerExpired: false, simT: 0 };
let enemies = [];
const MAG = 5;
const player = { ammo: MAG, chamberT: 0, reloadT: 0, scoped: false, zoomIdx: 0,
  breath: 1, holding: false, breathLock: false, kick: 0, boltT: -1 };
const ZOOMS = [15, 10.5, 7.2];
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
  if (!player.scoped || game.phase !== 'fight') return;
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
  if (dragMoved < 6 && performance.now() - dragT0 < 350 && game.phase === 'fight') fire(); // tap = shoot
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
$('againBtn').addEventListener('click', () => { AudioSys.init(); startGame(); });

function setScope(on) {
  if (game.phase !== 'fight' && game.phase !== 'waveclear') on = false;
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
  if (game.phase !== 'fight') return;
  if (player.reloadT > 0 || player.chamberT > 0) return;
  if (player.ammo <= 0) { AudioSys.dryFire(); startReload(); return; }
  player.ammo--; game.shots++; game.waveShots++;
  AudioSys.shot();
  player.chamberT = 1.0; player.boltT = 0;
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
      { zone: 'head', r: raySeg(O, _dir, v.head, v.head), R: 0.235 },
      { zone: 'body', r: raySeg(O, _dir, v.pelv, v.chest), R: 0.285 },
      { zone: 'low', r: raySeg(O, _dir, v.pelv, _hp.set(v.pelv.x, v.pelv.y - 0.85, v.pelv.z)), R: 0.23 },
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
      if (r.dist <= 0.235 && r.t < occDist - 0.05 && r.t <= best.t + 0.35 && (!headBest || r.t < headBest.t)) {
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
  if (killed) {
    game.kills++;
    if (zone === 'head') game.headshots++;
    const pts = Math.round((100 + Math.round(best.t) * 2 + (zone === 'head' ? 150 : 0)) * mult);
    game.score += pts;
    AudioSys.kill(); if (zone === 'head') AudioSys.headshot();
    freezeT = 0.05; // a breath of hit-stop on the kill
  } else {
    game.score += Math.round(25 * mult);
    AudioSys.hitTick();
  }
  showHitmarker(killed);
  showCombo();
  updateHUD();
}
function startReload() {
  if (game.phase !== 'fight' || player.reloadT > 0 || player.ammo >= MAG) return;
  player.reloadT = 1.6;
  AudioSys.reload();
}

/* ---------------- waves / flow ---------------- */
function aliveCount() { return enemies.filter(e => !e.dead && !e.breached && e.state !== 'gone').length; }
function startGame() {
  for (const e of enemies) e.dispose();
  enemies = [];
  Object.assign(game, { score: 0, kills: 0, shots: 0, hits: 0, headshots: 0, breaches: 0, combo: 0, bestCombo: 0 });
  player.ammo = MAG; player.chamberT = 0; player.reloadT = 0; player.breath = 1;
  setScope(false);
  $('menu').style.display = 'none';
  $('gameover').style.display = 'none';
  $('hud').style.display = 'block';
  document.querySelectorAll('#breaches .gate').forEach(g => g.classList.remove('lost'));
  startWave(1);
  AudioSys.bell();
}
function startWave(n) {
  game.wave = n;
  game.toSpawn = 3 + n;
  game.spawnT = 0.8;
  game.timer = 75;
  game.timerExpired = false;
  game.waveShots = 0; game.waveHits = 0;
  game.phase = 'fight';
  showBanner('WAVE ' + n, n === 1 ? 'HOLD THE GATE' : 'THEY KEEP COMING', 1.0);
  updateHUD();
}
function waveCleared() {
  game.phase = 'waveclear'; game.interT = 3.2;
  setScope(false);
  if (game.timerExpired) {
    showBanner('TIME UP', 'THE REST SLIPPED THROUGH', 1.2);
  } else {
    const acc = game.waveShots ? game.waveHits / game.waveShots : 0;
    const grade = acc >= 0.85 ? 'S — DEADEYE' : acc >= 0.65 ? 'A — SHARPSHOOTER' : acc >= 0.45 ? 'B — STEADY' : 'C — SPRAY AND PRAY';
    const bonus = Math.round(200 * acc) + game.wave * 25;
    game.score += bonus;
    showBanner('WAVE ' + game.wave + ' CLEARED', grade + ' · BONUS +' + bonus, 1.4);
    AudioSys.waveClear();
  }
  updateHUD();
}
function onBreach(e) {
  if (game.phase !== 'fight') return;
  game.breaches++;
  const bf = $('breachFlash'); bf.style.transition = 'none'; bf.style.opacity = 1;
  void bf.offsetWidth;
  requestAnimationFrame(() => { bf.style.transition = 'opacity .5s'; bf.style.opacity = 0; });
  AudioSys.breach();
  document.querySelectorAll('#breaches .gate').forEach((g, i) => g.classList.toggle('lost', i < game.breaches));
  if (game.breaches >= 3) gameOver();
}
function gameOver() {
  game.phase = 'over';
  setScope(false);
  const acc = game.shots ? Math.round(100 * game.hits / game.shots) : 0;
  $('goStats').innerHTML =
    'FINAL SCORE <b>' + game.score + '</b><br>' +
    'WAVES HELD <b>' + game.wave + '</b> · KILLS <b>' + game.kills + '</b> · HEADSHOTS <b>' + game.headshots + '</b><br>' +
    'ACCURACY <b>' + acc + '%</b> · BEST COMBO <b>×' + (1 + 0.25 * Math.min(Math.max(game.bestCombo - 1, 0), 7)).toFixed(2).replace(/\.?0+$/, '') + '</b>';
  $('gameover').style.display = 'flex';
}
function spawnEnemy() {
  const defIdx = (Math.random() * CHAR_DEFS.length) | 0;
  const speed = 1.85 + game.wave * 0.16 + Math.random() * 0.55;
  enemies.push(new Enemy(defIdx, speed));
}

/* ---------------- HUD ---------------- */
let lastAmmo = -1, lastChamber = null;
function updateHUD() {
  $('scoreVal').textContent = game.score;
  $('waveVal').textContent = Math.max(game.wave, 1);
  $('killVal').textContent = game.kills;
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
    phase: game.phase, wave: game.wave, score: game.score, kills: game.kills,
    shots: game.shots, hits: game.hits, headshots: game.headshots, breaches: game.breaches,
    combo: game.combo, ammo: player.ammo, chamberT: Math.round(player.chamberT * 100) / 100,
    reloadT: Math.round(player.reloadT * 100) / 100, scoped: player.scoped,
    alive: aliveCount(), toSpawn: game.toSpawn, timer: Math.round(game.timer),
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
window.__qa = {
  start: () => startGame(),
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
  if (qaDone || game.phase !== 'fight') return;
  qaAutoT += dt;
  if (qaAutoT > 150) { qaDone = true; return; }
  const e = enemies.find(x => !x.dead && !x.breached && x.state !== 'gone' && x.state !== 'loading' && x.headBone);
  if (!e) { setScope(false); return; }
  setScope(true); qaHold = true;
  qaShotFlip = !qaShotFlip;
  qaAimAt(qaShotFlip ? 'head' : 'body');
  if (player.ammo <= 0) { startReload(); return; }
  if (player.chamberT <= 0 && player.reloadT <= 0) fire();
  if (game.kills >= 2 && game.hits >= 2 && game.shots >= 2) qaDone = true;
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
    rifle.position.y = -0.31 - Math.sin(p * Math.PI) * 0.018;
    if (p >= 1) { player.boltT = -1; boltHandle.position.z = 0.06; boltHandle.rotation.x = 0; rifle.position.y = -0.31; }
  }
  player.kick *= Math.pow(0.0001, dt); if (player.kick < 0.0004) player.kick = 0;
  muzzleLight.intensity *= Math.pow(0.000001, dt); if (muzzleLight.intensity < 0.05) muzzleLight.intensity = 0;

  if (game.phase === 'fight') {
    game.timer -= dt;
    if (game.spawnT > 0) game.spawnT -= dt;
    if (game.toSpawn > 0 && game.spawnT <= 0 && aliveCount() < 6) {
      spawnEnemy();
      game.toSpawn--;
      game.spawnT = Math.max(1.15, 2.35 - game.wave * 0.12);
    }
    if (game.timer <= 0 && !game.timerExpired) {
      game.timerExpired = true; game.timer = 0;
      for (const e of [...enemies]) if (!e.dead && !e.breached && e.state !== 'gone') e.breach();
      game.toSpawn = 0;
    }
    if (game.phase === 'fight' && game.toSpawn === 0 && aliveCount() === 0 && enemies.every(e => e.state === 'gone' || e.dead)) {
      // wave ends when every runner is dead or through; corpses may still be sinking
      if (enemies.every(e => e.dead || e.breached || e.state === 'gone')) waveCleared();
    }
  } else if (game.phase === 'waveclear') {
    game.interT -= dt;
    if (game.interT <= 0) startWave(game.wave + 1);
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
  $('cross').style.display = (!scopedNow && (game.phase === 'fight' || game.phase === 'waveclear')) ? 'block' : 'none';
  rifle.visible = !scopedNow;
  $('breathWrap').style.display = player.scoped ? 'block' : 'none';
  $('breathFill').style.width = Math.round(player.breath * 100) + '%';
  $('breathFill').style.background = player.holding ? 'linear-gradient(90deg,#ffd98a,#ffb340)' : '';

  // aim: player + sway + kick (menu gets a slow idle pan)
  let yaw = aimYaw, pitch = aimPitch;
  if (game.phase === 'menu') { yaw = Math.sin(elapsed * 0.1) * 0.16; pitch = -0.045 + Math.sin(elapsed * 0.07) * 0.012; }
  const amp = player.scoped ? (player.holding ? 0.0007 : 0.0044) : 0.0007;
  const swX = (Math.sin(elapsed * 0.83) + Math.sin(elapsed * 1.31 + 2.1) * 0.6) * amp;
  const swY = (Math.cos(elapsed * 0.97 + 0.7) + Math.sin(elapsed * 1.53) * 0.6) * amp * 0.85;
  camera.position.copy(CAM_POS);
  camera.rotation.order = 'YXZ';
  camera.rotation.y = yaw + swX;
  camera.rotation.x = pitch + swY + player.kick;
  camera.rotation.z = 0;
  // rifle idle sway, subtler echo of the scope sway
  rifle.position.x = 0.3 + swX * 1.4;
  if (player.boltT < 0) rifle.position.y = -0.31 + swY * 1.2;

  renderer.render(scene, camera);

  if (QA_MODE) $('qaState').textContent = JSON.stringify(qaState());
}

/* ---------------- boot ---------------- */
(async function boot() {
  try {
    setLoad(0.06, 'ANIMATIONS I');
    await loadAnims('anim/ual1.glb', ['Idle_Loop', 'Walk_Loop', 'Crouch_Idle_Loop', 'Hit_Chest', 'Hit_Head', 'Death01']);
    setLoad(0.4, 'ANIMATIONS II');
    await loadAnims('anim/ual2.glb', ['Hit_Knockback']);
    setLoad(0.62, 'THE PERCH');
    // warm one of each character so the first spawn does not hitch
    for (const d of CHAR_DEFS) await loader.loadAsync(d.model);
    setLoad(1, 'READY');
    $('loading').style.display = 'none';
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
