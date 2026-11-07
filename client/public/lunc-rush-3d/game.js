/* ============================================================
   LUNC RUSH 3D — Luna Classic endless runner (Three.js r160)
   Hero: COMET the moon-fox (original character, procedural model)
   Run: 3-lane behind-view runner on a tropical island course.
   Coins are LUNC crescents, rare pickups are USTC stars.
   ============================================================ */
import * as THREE from 'three';

/* ---------------- constants ---------------- */
const LANE_X = [-2.3, 0, 2.3];
const SECT_LEN = 30;          // one ground section
const SECT_N = 16;            // sections alive at once (~480 m view)
const OB_SPACING = 45;        // nominal metres between obstacle rows (scaled by speed below)
const SPEED0 = 18, SPEED_MAX = 34, SPEED_RAMP = 0.055; // m/s — Tom: "speed him up"
const JUMP_V = 13.5;          // tuned so jump airtime matches the faster run
const GRAV = 34;
const LOOP_EVERY = 420, LOOP_R = 8.5, LOOP_CIRC = 2 * Math.PI * LOOP_R;
const COIN_SCORE = 25, STAR_SCORE = 250, DIST_SCORE = 1;

/* ---------------- state ---------------- */
const S = {
  mode: 'menu',           // menu | run | pause | over
  dist: 0, coins: 0, stars: 0, score: 0, hearts: 3,
  speed: 0, time: 0, runTime: 0,
  lane: 1, laneX: 0, y: 0, vy: 0, grounded: true,
  rollT: 0, stumbleT: 0, invulnT: 0, hitFlash: 0,
  loop: null, nextLoopAt: LOOP_EVERY, loopCount: 0,
  pitchChain: 0, muted: false, started: false, pilot: false,
};
try { S.muted = localStorage.getItem('luncRush3dMute') === '1'; } catch (e) {}

/* ---------------- three setup ---------------- */
const container = document.getElementById('game');
const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
container.appendChild(renderer.domElement);

/* Size from the REAL visible viewport. innerHeight/innerWidth can lag the
   Android browser chrome (and visualViewport is the ground truth) — a stale
   short height left a blue page-background band under the scene. */
function viewSize() {
  const vv = window.visualViewport;
  return {
    w: Math.round((vv && vv.width) || innerWidth),
    h: Math.round((vv && vv.height) || innerHeight),
  };
}
{
  const s0 = viewSize();
  renderer.setSize(s0.w, s0.h, false);
}
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.08;

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x69b7ff);
scene.fog = new THREE.Fog(0x9fd4ff, 90, 430);

const camera = new THREE.PerspectiveCamera(66, viewSize().w / viewSize().h, 0.1, 1200);
camera.position.set(0, 5.6, 9.5);

const hemi = new THREE.HemisphereLight(0xcfe8ff, 0x3d7a3a, 0.95);
scene.add(hemi);
const sun = new THREE.DirectionalLight(0xfff2cf, 1.9);
sun.position.set(28, 46, -30);
scene.add(sun);
const fill = new THREE.DirectionalLight(0x9fd0ff, 0.35);
fill.position.set(-20, 18, 30);
scene.add(fill);

/* ---------------- procedural canvas textures ---------------- */
function canvasTex(w, h, draw, rx = 1, ry = 1) {
  const c = document.createElement('canvas'); c.width = w; c.height = h;
  draw(c.getContext('2d'), w, h);
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(rx, ry);
  t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4;
  return t;
}
const grassTex = canvasTex(512, 512, (g, w, h) => {
  /* painted grass: layered wash patches, then thousands of blade strokes */
  g.fillStyle = '#3f9e46'; g.fillRect(0, 0, w, h);
  const wash = ['#35903f', '#48ab52', '#2f8a3a', '#55b364', '#3a9a48'];
  for (let i = 0; i < 46; i++) {
    g.fillStyle = wash[i % wash.length]; g.globalAlpha = 0.24;
    g.beginPath(); g.ellipse(Math.random() * w, Math.random() * h, 26 + Math.random() * 70, 16 + Math.random() * 44, Math.random() * 3, 0, 7); g.fill();
  }
  g.globalAlpha = 1;
  for (let i = 0; i < 5200; i++) {
    const x = Math.random() * w, y = Math.random() * h, l = 3 + Math.random() * 6;
    g.strokeStyle = `rgba(${18 + Math.random() * 40 | 0},${105 + Math.random() * 80 | 0},${34 + Math.random() * 26 | 0},0.55)`;
    g.lineWidth = 1;
    g.beginPath(); g.moveTo(x, y); g.lineTo(x + (Math.random() - 0.5) * 2.4, y - l); g.stroke();
  }
  for (let i = 0; i < 340; i++) { /* dry flecks */
    g.fillStyle = 'rgba(214,196,110,0.20)';
    g.fillRect(Math.random() * w, Math.random() * h, 2.4, 1.4);
  }
}, 1, 15);
const dirtTex = canvasTex(256, 256, (g, w, h) => {
  g.fillStyle = '#b98d5f'; g.fillRect(0, 0, w, h);
  g.fillStyle = 'rgba(140,100,60,0.16)';
  for (let i = 0; i < 26; i++) g.fillRect(Math.random() * w, Math.random() * h, 20 + Math.random() * 34, 12 + Math.random() * 20);
  g.fillStyle = 'rgba(90,60,30,0.35)';
  for (let i = 0; i < 260; i++) g.fillRect(Math.random() * w, Math.random() * h, 3, 3);
  g.fillStyle = 'rgba(255,240,200,0.20)';
  for (let i = 0; i < 160; i++) g.fillRect(Math.random() * w, Math.random() * h, 2, 2);
}, 2, 15);
const cliffTex = canvasTex(256, 256, (g, w, h) => {
  /* rock strata — horizontal bands, cracks and speckle (no checkerboard) */
  const bands = ['#b49b78', '#a8906c', '#c0aa84', '#9c8464', '#b8a27c', '#a58a66', '#c4ae88', '#98835f'];
  for (let j = 0; j < 8; j++) {
    g.fillStyle = bands[j]; g.fillRect(0, j * 32, w, 32);
    g.fillStyle = 'rgba(70,52,32,0.35)'; g.fillRect(0, j * 32, w, 2);
    for (let i = 0; i < 90; i++) {
      g.fillStyle = Math.random() < 0.5 ? 'rgba(70,52,32,0.18)' : 'rgba(255,240,210,0.14)';
      g.fillRect(Math.random() * w, j * 32 + Math.random() * 30, 2 + Math.random() * 5, 2);
    }
  }
  g.strokeStyle = 'rgba(80,60,40,0.5)'; g.lineWidth = 2;
  for (let i = 0; i < 14; i++) {
    g.beginPath(); let x = Math.random() * w, y = Math.random() * h; g.moveTo(x, y);
    for (let k = 0; k < 4; k++) { x += (Math.random() - 0.5) * 40; y += Math.random() * 30; g.lineTo(x, y); }
    g.stroke();
  }
}, 3, 2);
const barkTex = canvasTex(128, 256, (g, w, h) => {
  g.fillStyle = '#8a6a45'; g.fillRect(0, 0, w, h);
  g.fillStyle = 'rgba(60,40,20,0.45)';
  for (let i = 0; i < 26; i++) g.fillRect(Math.random() * w, 0, 3, h);
  g.fillStyle = 'rgba(120,90,55,0.5)';
  for (let i = 0; i < 20; i++) g.fillRect(Math.random() * w, 0, 2, h);
});
const waterTex = canvasTex(512, 512, (g, w, h) => {
  /* painted water: depth gradient + caustic web + sparkle */
  const gr = g.createLinearGradient(0, 0, w, h);
  gr.addColorStop(0, '#25b3e8'); gr.addColorStop(0.5, '#1493d8'); gr.addColorStop(1, '#0e7cc4');
  g.fillStyle = gr; g.fillRect(0, 0, w, h);
  g.strokeStyle = 'rgba(190,240,255,0.16)'; g.lineWidth = 1.6;
  for (let i = 0; i < 130; i++) {
    const x = Math.random() * w, y = Math.random() * h, r = 7 + Math.random() * 20;
    g.beginPath(); g.arc(x, y, r, Math.random() * 3, Math.random() * 2 + 1.2); g.stroke();
  }
  g.strokeStyle = 'rgba(255,255,255,0.38)'; g.lineWidth = 2;
  for (let i = 0; i < 30; i++) {
    g.beginPath(); const y = Math.random() * h; g.moveTo(Math.random() * w, y);
    g.bezierCurveTo(Math.random() * w, y - 6, Math.random() * w, y + 6, Math.random() * w, y); g.stroke();
  }
  g.fillStyle = 'rgba(210,245,255,0.55)';
  for (let i = 0; i < 260; i++) g.fillRect(Math.random() * w, Math.random() * h, 3, 1);
}, 8, 60);
/* painted sand: grain, shells, pebbles */
const sandTex = canvasTex(256, 256, (g, w, h) => {
  g.fillStyle = '#eed9a4'; g.fillRect(0, 0, w, h);
  for (let i = 0; i < 2600; i++) {
    g.fillStyle = Math.random() < 0.5 ? 'rgba(190,160,95,0.28)' : 'rgba(255,248,220,0.30)';
    g.fillRect(Math.random() * w, Math.random() * h, 1.6, 1.6);
  }
  for (let i = 0; i < 26; i++) { /* pebbles + shell flecks */
    g.fillStyle = Math.random() < 0.6 ? 'rgba(160,130,90,0.5)' : 'rgba(255,235,240,0.65)';
    g.beginPath(); g.ellipse(Math.random() * w, Math.random() * h, 2 + Math.random() * 3, 1.4 + Math.random() * 2, Math.random() * 3, 0, 7); g.fill();
  }
}, 4, 12);
/* palm frond sprite — a real feathered frond, alpha-cut */
const frondTex = (() => {
  const c = document.createElement('canvas'); c.width = 256; c.height = 128;
  const g = c.getContext('2d'); g.clearRect(0, 0, 256, 128);
  g.lineCap = 'round';
  const frond = (ox, oy, ang, len, colA, colB) => {
    const dx = Math.cos(ang), dy = Math.sin(ang), px = -dy, py = dx;
    g.strokeStyle = colA; g.lineWidth = 5;
    g.beginPath(); g.moveTo(ox, oy);
    g.quadraticCurveTo(ox + dx * len * 0.55, oy + dy * len * 0.55 + len * 0.10, ox + dx * len, oy + dy * len + len * 0.30); g.stroke();
    for (let t = 0.16; t < 0.98; t += 0.055) {
      const bx = ox + dx * len * t, by = oy + dy * len * t + len * 0.30 * t * t;
      const ll = len * 0.30 * (1 - t * 0.55);
      g.strokeStyle = t % 0.11 < 0.055 ? colA : colB; g.lineWidth = 2.4;
      g.beginPath(); g.moveTo(bx, by); g.lineTo(bx + px * ll * 0.4 + dx * ll * 0.3, by + py * ll * 0.4 + ll * 0.75); g.stroke();
      g.beginPath(); g.moveTo(bx, by); g.lineTo(bx - px * ll * 0.4 + dx * ll * 0.3, by - py * ll * 0.4 + ll * 0.75); g.stroke();
    }
  };
  frond(22, 26, -0.10, 205, '#2e9e44', '#3cb54f');
  frond(22, 62, 0.16, 195, '#27893c', '#35a647');
  frond(22, 98, 0.42, 180, '#2e9e44', '#46bd5c');
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4;
  return t;
})();
/* fox-fur detail for the hero: subtle painted stripes + speckle */
const furTex = canvasTex(256, 256, (g, w, h) => {
  g.fillStyle = '#f07f13'; g.fillRect(0, 0, w, h);
  for (let i = 0; i < 3000; i++) {
    g.fillStyle = Math.random() < 0.5 ? 'rgba(200,95,10,0.20)' : 'rgba(255,175,80,0.20)';
    g.fillRect(Math.random() * w, Math.random() * h, 2.2, 1.3);
  }
  g.strokeStyle = 'rgba(178,80,8,0.30)'; g.lineWidth = 7; g.lineCap = 'round';
  for (let i = 0; i < 5; i++) {
    g.beginPath(); const y = 28 + i * 52;
    g.moveTo(-8, y); g.bezierCurveTo(w * 0.3, y + 14, w * 0.7, y - 14, w + 8, y + 4); g.stroke();
  }
}, 1, 1);
const cloudTex = canvasTex(256, 128, (g) => {
  g.clearRect(0, 0, 256, 128);
  const blob = (x, y, r, a) => { const gr = g.createRadialGradient(x, y, 0, x, y, r); gr.addColorStop(0, `rgba(255,255,255,${a})`); gr.addColorStop(1, 'rgba(255,255,255,0)'); g.fillStyle = gr; g.fillRect(x - r, y - r, r * 2, r * 2); };
  blob(80, 78, 52, .95); blob(128, 66, 62, .95); blob(178, 78, 50, .95); blob(110, 88, 58, .8); blob(155, 88, 55, .8);
});
cloudTex.wrapS = cloudTex.wrapT = THREE.ClampToEdgeWrapping;

/* ---------------- materials ---------------- */
const M = {
  grass: new THREE.MeshLambertMaterial({ map: grassTex }),
  dirt: new THREE.MeshLambertMaterial({ map: dirtTex }),
  sand: new THREE.MeshLambertMaterial({ map: sandTex }),
  cliff: new THREE.MeshLambertMaterial({ map: cliffTex }),
  water: new THREE.MeshPhongMaterial({ map: waterTex, shininess: 90, color: 0xbfeaff }),
  bark: new THREE.MeshLambertMaterial({ map: barkTex }),
  leaf: new THREE.MeshLambertMaterial({ color: 0x2f9e44 }),
  leaf2: new THREE.MeshLambertMaterial({ color: 0x37b24d }),
  /* scenery pack materials (shared, reused by every instanced prop) */
  sandDk: new THREE.MeshLambertMaterial({ color: 0xdcc384 }),
  thatch: new THREE.MeshLambertMaterial({ color: 0xc9a35a }),
  woodDk: new THREE.MeshLambertMaterial({ color: 0x6e4f2a }),
  stone: new THREE.MeshLambertMaterial({ color: 0x8d8578 }),
  stoneDk: new THREE.MeshLambertMaterial({ color: 0x6f6a5e }),
  flame: new THREE.MeshBasicMaterial({ color: 0xffa726 }),
  pink: new THREE.MeshLambertMaterial({ color: 0xef6aa5 }),
  purple: new THREE.MeshLambertMaterial({ color: 0x9775fa }),
  yellow: new THREE.MeshLambertMaterial({ color: 0xffd43b }),
  whiteF: new THREE.MeshLambertMaterial({ color: 0xf8f9fa }),
  glint: new THREE.MeshPhongMaterial({ color: 0x9fd8ef, shininess: 120, transparent: true, opacity: 0.75 }),
  hillFar: new THREE.MeshBasicMaterial({ color: 0x5b9bd5, fog: true }),
  temple: new THREE.MeshBasicMaterial({ color: 0x4a86c5, fog: true }),
  bird: new THREE.MeshBasicMaterial({ color: 0x22303c, fog: true }),
  gold: new THREE.MeshPhongMaterial({ color: 0xffc93d, emissive: 0xcf8a00, emissiveIntensity: 0.55, shininess: 90 }),
  goldDark: new THREE.MeshPhongMaterial({ color: 0xe8a90c, emissive: 0x9a6a00, emissiveIntensity: 0.4, shininess: 70 }),
  ustc: new THREE.MeshPhongMaterial({ color: 0x4da3ff, emissive: 0x1d5fd0, emissiveIntensity: 0.9, shininess: 90 }),
  rock: new THREE.MeshLambertMaterial({ color: 0x9a8f80 }),
  red: new THREE.MeshPhongMaterial({ color: 0xe03131, emissive: 0x700000, emissiveIntensity: 0.35, shininess: 40 }),
  white: new THREE.MeshPhongMaterial({ color: 0xf5f5f5, shininess: 30 }),
  orange: new THREE.MeshPhongMaterial({ map: furTex, shininess: 35 }),
  orangeDk: new THREE.MeshPhongMaterial({ color: 0xb35c08, shininess: 35 }),
  cream: new THREE.MeshPhongMaterial({ color: 0xfff3d6, shininess: 35 }),
  teal: new THREE.MeshPhongMaterial({ color: 0x12b5a5, shininess: 50 }),
  ink: new THREE.MeshPhongMaterial({ color: 0x2b2b33, shininess: 20 }),
  nose: new THREE.MeshPhongMaterial({ color: 0x33231a, shininess: 60 }),
};

/* ---------------- world: scrolling sections ---------------- */
const world = new THREE.Group(); scene.add(world);
const sections = [];
const secGeo = new THREE.BoxGeometry(1, 1, 1);

function makeSection() {
  const g = new THREE.Group();
  const ground = new THREE.Mesh(secGeo, M.grass); ground.scale.set(90, 1, SECT_LEN); ground.position.y = -0.51; g.add(ground);
  const track = new THREE.Mesh(secGeo, M.dirt); track.scale.set(8.4, 0.22, SECT_LEN); track.position.y = -0.1; g.add(track);
  const edgeL = new THREE.Mesh(secGeo, M.sand); edgeL.scale.set(0.5, 0.26, SECT_LEN); edgeL.position.set(-4.45, -0.08, 0); g.add(edgeL);
  const edgeR = edgeL.clone(); edgeR.position.x = 4.45; g.add(edgeR);
  const beachL = new THREE.Mesh(secGeo, M.sand); beachL.scale.set(10, 0.5, SECT_LEN); beachL.position.set(-12.5, -0.55, 0); g.add(beachL);
  const beachR = beachL.clone(); beachR.position.x = 12.5; g.add(beachR);
  const waterL = new THREE.Mesh(secGeo, M.water); waterL.scale.set(120, 0.4, SECT_LEN); waterL.position.set(-75, -0.95, 0); g.add(waterL);
  const waterR = waterL.clone(); waterR.position.x = 75; g.add(waterR);
  const cliffL = new THREE.Mesh(secGeo, M.cliff); cliffL.scale.set(7, 13, SECT_LEN); cliffL.position.set(-30, 4.4, 0); g.add(cliffL);
  const cliffR = cliffL.clone(); cliffR.position.x = 30; g.add(cliffR);
  const hillL = new THREE.Mesh(secGeo, M.grass); hillL.scale.set(16, 5, SECT_LEN); hillL.position.set(-20, 1.6, 0); hillL.rotation.y = 0.06; g.add(hillL);
  const hillR = hillL.clone(); hillR.position.x = 20; hillR.rotation.y = -0.09; g.add(hillR);
  g.userData.baseZ = 0;
  world.add(g);
  return g;
}
for (let i = 0; i < SECT_N; i++) {
  const s = makeSection(); s.userData.baseZ = i * SECT_LEN; sections.push(s);
}

/* palms (instanced) */
const PALMS_PER_SEC = 7, PALM_N = SECT_N * PALMS_PER_SEC;
const trunkGeo = new THREE.CylinderGeometry(0.14, 0.24, 3.4, 6); trunkGeo.translate(0, 1.7, 0);
const frondGeo = new THREE.PlaneGeometry(4.6, 2.3); frondGeo.translate(0, 3.75, 0);
const trunkIM = new THREE.InstancedMesh(trunkGeo, M.bark, PALM_N);
const frondMat = new THREE.MeshLambertMaterial({ map: frondTex, alphaTest: 0.35, side: THREE.DoubleSide });
const frondIM = new THREE.InstancedMesh(frondGeo, frondMat, PALM_N);
const frond2IM = new THREE.InstancedMesh(frondGeo, frondMat, PALM_N);
trunkIM.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
frondIM.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
frond2IM.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
scene.add(trunkIM, frondIM, frond2IM);
const palmData = [];
for (let i = 0; i < PALM_N; i++) {
  const side = Math.random() < 0.5 ? -1 : 1;
  palmData.push({
    bx: side * (7.5 + Math.random() * 13), off: Math.random() * SECT_LEN,
    s: 0.8 + Math.random() * 0.7, tilt: (Math.random() - 0.5) * 0.22, rot: Math.random() * Math.PI * 2,
  });
}

/* clouds */
const cloudIM = new THREE.InstancedMesh(
  new THREE.PlaneGeometry(46, 20),
  new THREE.MeshBasicMaterial({ map: cloudTex, transparent: true, depthWrite: false, fog: false }), 22);
cloudIM.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
scene.add(cloudIM);
const cloudData = [];
for (let i = 0; i < 22; i++) cloudData.push({ x: (Math.random() - 0.5) * 320, y: 26 + Math.random() * 44, off: -Math.random() * 480, s: 0.55 + Math.random() * 1.25 });

/* sun billboard glow */
const sunSprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: cloudTex, color: 0xffe9a0, transparent: true, opacity: 0.9, fog: false, depthWrite: false, depthTest: false }));
sunSprite.scale.set(90, 45, 1); sunSprite.position.set(-70, 60, -260); sunSprite.renderOrder = -6; scene.add(sunSprite);

/* sun light shafts: REMOVED (Nov 7) — even shortened, the additive planes
   read as broad white diagonal beams across the sky on real phone GPUs
   (Tom's report). Deleted entirely; no replacement effect. */

/* ---------------- pickups ---------------- */
function crescentGeo() {
  const shape = new THREE.Shape();
  shape.absarc(0, 0, 0.5, 0, Math.PI * 2, false);
  const hole = new THREE.Path();
  hole.absarc(0.22, 0.1, 0.4, 0, Math.PI * 2, true);
  shape.holes.push(hole);
  const g = new THREE.ExtrudeGeometry(shape, { depth: 0.12, bevelEnabled: true, bevelThickness: 0.03, bevelSize: 0.03, bevelSegments: 1, curveSegments: 28 });
  g.center(); return g;
}
function starGeo() {
  const shape = new THREE.Shape();
  for (let i = 0; i < 10; i++) {
    const r = i % 2 === 0 ? 0.55 : 0.24, a = (i / 10) * Math.PI * 2 - Math.PI / 2;
    const x = Math.cos(a) * r, y = Math.sin(a) * r;
    if (i === 0) shape.moveTo(x, y); else shape.lineTo(x, y);
  }
  shape.closePath();
  const g = new THREE.ExtrudeGeometry(shape, { depth: 0.12, bevelEnabled: true, bevelThickness: 0.03, bevelSize: 0.03, bevelSegments: 1 });
  g.center(); return g;
}
const COIN_N = 90, STAR_N = 8;
const coinIM = new THREE.InstancedMesh(crescentGeo(), M.gold, COIN_N);
const starIM = new THREE.InstancedMesh(starGeo(), M.ustc, STAR_N);
coinIM.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
starIM.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
scene.add(coinIM, starIM);
const coins = [], stars = [];
for (let i = 0; i < COIN_N; i++) coins.push({ active: false, x: 0, y: 1.1, z: 0, fly: null });
for (let i = 0; i < STAR_N; i++) stars.push({ active: false, x: 0, y: 1.4, z: 0, fly: null });
let nextCoinZ = 60;

/* scattered coins after a hit */
const SCAT_N = 14;
const scatIM = new THREE.InstancedMesh(crescentGeo(), M.goldDark, SCAT_N);
scatIM.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
scene.add(scatIM);
const scats = [];
for (let i = 0; i < SCAT_N; i++) scats.push({ active: false, x: 0, y: 0, z: 0, vx: 0, vy: 0, vz: 0, life: 0, spin: 0 });

/* ============ RICH WORLD — instanced scenery (all original/procedural) ============
   Every prop shares one geometry + one material per type; placement uses the
   same wrap-span trick as the palms. Kinds: 0 bush, 1 flower, 2 grass tuft,
   3 beach rock, 4 sand patch, 5 glint puddle, 6 tiki torch, 7 wooden sign,
   8 hut, 9 stone statue, 10 banner arch. */
function bladeGeo(n, rBase, rTop, hgt) {
  const posArr = [];
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2, rr = Math.random() * 0.24;
    const bx = Math.cos(a) * rr, bz = Math.sin(a) * rr;
    const tx = bx + Math.cos(a) * 0.16, tz = bz + Math.sin(a) * 0.16, ty = hgt * (0.75 + Math.random() * 0.5);
    posArr.push(bx - rBase, 0, bz, bx + rBase, 0, bz, tx, ty, tz);
    posArr.push(bx, 0, bz - rBase, bx, 0, bz + rBase, tx, ty, tz);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(posArr), 3));
  g.computeVertexNormals();
  return g;
}
const decoParts = [];
function decoIM(geo, mat, n, dyn) {
  const im = new THREE.InstancedMesh(geo, mat, n);
  if (dyn !== false) im.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  im.frustumCulled = false;
  scene.add(im); decoParts.push(im); return im;
}
const DECO_N = 56;
const bushGeo = new THREE.IcosahedronGeometry(0.55, 1); bushGeo.scale(1, 0.72, 1); bushGeo.translate(0, 0.36, 0);
const decoBush = decoIM(bushGeo, M.leaf, DECO_N);
const decoBush2 = decoIM(bushGeo, M.leaf2, DECO_N);
const flowerGeo = new THREE.ConeGeometry(0.13, 0.3, 6); flowerGeo.translate(0, 0.32, 0);
const decoFlowerP = decoIM(flowerGeo, M.pink, DECO_N);
const decoFlowerY = decoIM(flowerGeo, M.yellow, DECO_N);
const decoFlowerV = decoIM(flowerGeo, M.purple, DECO_N);
const decoTuft = decoIM(bladeGeo(5, 0.045, 0, 0.5), M.leaf2, DECO_N * 2);
const decoRock = decoIM(new THREE.DodecahedronGeometry(0.5), M.rock, 28);
const decoSand = decoIM(new THREE.CircleGeometry(1.6, 14), M.sandDk, 28, false);
const decoGlint = decoIM(new THREE.CircleGeometry(0.9, 12), M.glint, 20, false);
const decoData = [];
function decoPlace(kind, bx, off, s, rot, aux) { decoData.push({ kind, bx, off, s, rot: rot || 0, aux: aux || 0 }); }
for (let i = 0; i < DECO_N; i++) {
  const sd = Math.random() < 0.5 ? -1 : 1, off = Math.random() * 480;
  decoPlace(0, sd * (5.6 + Math.random() * 13), off, 0.7 + Math.random() * 1.1, Math.random() * 6.3);
  decoPlace(0, sd * (5.6 + Math.random() * 13), off + 240, 0.7 + Math.random() * 1.1, Math.random() * 6.3);
  const fs = Math.random() < 0.5 ? -1 : 1;
  decoPlace(1, fs * (5.2 + Math.random() * 9), off + 120, 0.8 + Math.random() * 0.9, Math.random() * 6.3);
  decoPlace(1, (Math.random() < 0.5 ? -1 : 1) * (5.2 + Math.random() * 9), off + 300, 0.8 + Math.random() * 0.9, Math.random() * 6.3);
  decoPlace(2, sd * (4.9 + Math.random() * 12), off + 60, 0.8 + Math.random() * 1.2, Math.random() * 6.3);
  decoPlace(2, (Math.random() < 0.5 ? -1 : 1) * (4.9 + Math.random() * 12), off + 180, 0.8 + Math.random() * 1.2, Math.random() * 6.3);
  decoPlace(2, (Math.random() < 0.5 ? -1 : 1) * (4.9 + Math.random() * 12), off + 330, 0.8 + Math.random() * 1.2, Math.random() * 6.3);
  decoPlace(2, (Math.random() < 0.5 ? -1 : 1) * (4.9 + Math.random() * 12), off + 420, 0.8 + Math.random() * 1.2, Math.random() * 6.3);
}
for (let i = 0; i < 28; i++) {
  const sd = Math.random() < 0.5 ? -1 : 1, off = i * 17.1 + Math.random() * 8;
  decoPlace(3, sd * (8.5 + Math.random() * 7.5), off, 0.5 + Math.random() * 1.1, Math.random() * 6.3);
  decoPlace(4, sd * (7 + Math.random() * 12), off + 240, 0.8 + Math.random() * 1.6, Math.random() * 6.3);
}
for (let i = 0; i < 20; i++) decoPlace(5, (Math.random() < 0.5 ? -1 : 1) * (5.4 + Math.random() * 10), i * 24 + Math.random() * 10, 0.7 + Math.random() * 1.1, Math.random() * 6.3);

/* landmarks — sparser, bigger; two pools per type so they read as places */
const LM_OFFS = [70, 310];
const torchPoleGeo = new THREE.CylinderGeometry(0.09, 0.12, 2.3, 6); torchPoleGeo.translate(0, 1.15, 0);
const torchFlameGeo = new THREE.ConeGeometry(0.3, 0.85, 7); torchFlameGeo.translate(0, 2.65, 0);
const lmTorchPole = decoIM(torchPoleGeo, M.bark, 4);
const lmTorchFlame = decoIM(torchFlameGeo, M.flame, 4);
const signPostGeo = new THREE.BoxGeometry(0.16, 1.5, 0.16); signPostGeo.translate(0, 0.75, 0);
const signBoardGeo = new THREE.BoxGeometry(1.5, 0.55, 0.1); signBoardGeo.translate(0, 1.35, 0);
const lmSignPost = decoIM(signPostGeo, M.woodDk, 4);
const lmSignBoard = decoIM(signBoardGeo, null, 4); // material set below (branded sign texture)
const hutWallGeo = new THREE.CylinderGeometry(1.5, 1.6, 1.7, 8); hutWallGeo.translate(0, 0.85, 0);
const hutRoofGeo = new THREE.ConeGeometry(2.3, 1.5, 8); hutRoofGeo.translate(0, 2.4, 0);
const lmHutWall = decoIM(hutWallGeo, M.dirt, 2);
const lmHutRoof = decoIM(hutRoofGeo, M.thatch, 2);
const statueBaseGeo = new THREE.BoxGeometry(1.3, 0.5, 1.3); statueBaseGeo.translate(0, 0.25, 0);
const statueBodyGeo = new THREE.BoxGeometry(0.95, 1.9, 0.8); statueBodyGeo.translate(0, 1.45, 0);
const statueHeadGeo = new THREE.BoxGeometry(0.8, 0.75, 0.75); statueHeadGeo.translate(0, 2.75, 0);
const lmStatueBase = decoIM(statueBaseGeo, M.stoneDk, 2);
const lmStatueBody = decoIM(statueBodyGeo, M.stone, 2);
const lmStatueHead = decoIM(statueHeadGeo, M.stone, 2);
const archPostGeo = new THREE.BoxGeometry(0.35, 4.6, 0.35); archPostGeo.translate(0, 2.3, 0);
const archClothGeo = new THREE.BoxGeometry(11.4, 1.1, 0.14);
const lmArchPostL = decoIM(archPostGeo, M.woodDk, 2);
const lmArchPostR = decoIM(archPostGeo, M.woodDk, 2);
const lmArchCloth = decoIM(archClothGeo, null, 2); // branded banner texture, set in the branding block

/* sky dome — painted gradient backdrop (fog-exempt, follows the camera) */
const skyTex = canvasTex(1024, 512, (g, w, h) => {
  const gr = g.createLinearGradient(0, 0, 0, h);
  gr.addColorStop(0, '#2f7fe0'); gr.addColorStop(0.42, '#69b7ff'); gr.addColorStop(0.62, '#a8dcff');
  gr.addColorStop(0.74, '#ffe3ae'); gr.addColorStop(0.82, '#cfeeff'); gr.addColorStop(1, '#9fd4ff');
  g.fillStyle = gr; g.fillRect(0, 0, w, h);
  const sun = g.createRadialGradient(w * 0.30, h * 0.60, 4, w * 0.30, h * 0.60, 190);
  sun.addColorStop(0, 'rgba(255,252,225,0.95)'); sun.addColorStop(0.12, 'rgba(255,240,180,0.75)'); sun.addColorStop(1, 'rgba(255,240,180,0)');
  g.fillStyle = sun; g.fillRect(0, 0, w, h);
  const blob = (x, y, r, a) => { const b = g.createRadialGradient(x, y, 0, x, y, r); b.addColorStop(0, `rgba(255,255,255,${a})`); b.addColorStop(1, 'rgba(255,255,255,0)'); g.fillStyle = b; g.fillRect(x - r, y - r, r * 2, r * 2); };
  for (let i = 0; i < 42; i++) { const x = Math.random() * w, y = h * (0.10 + Math.random() * 0.34), r = 22 + Math.random() * 66; blob(x, y, r, 0.5); blob(x + r * 0.5, y + 4, r * 0.7, 0.45); blob(x - r * 0.5, y + 6, r * 0.6, 0.4); }
  g.fillStyle = 'rgba(255,255,255,0.55)';
  for (let i = 0; i < 260; i++) g.fillRect(Math.random() * w, Math.random() * h * 0.5, 2.6, 1.1);
}, 1, 1);
skyTex.wrapS = THREE.RepeatWrapping; skyTex.wrapT = THREE.ClampToEdgeWrapping;
const skyDome = new THREE.Mesh(
  new THREE.SphereGeometry(760, 24, 14),
  new THREE.MeshBasicMaterial({ map: skyTex, side: THREE.BackSide, fog: false, depthWrite: false, depthTest: false }));
skyDome.frustumCulled = false; skyDome.renderOrder = -10;
scene.add(skyDome);
scene.background = new THREE.Color(0x69b7ff); // clear color behind the dome (menu frames)

/* distant islands across the water + a temple silhouette (static in z, wrap) */
function farIsle(hgt, wid, mat, capMat) {
  const grp = new THREE.Group();
  const hill = new THREE.Mesh(new THREE.ConeGeometry(wid, hgt, 7), mat);
  hill.scale.z = 0.45; grp.add(hill);
  if (capMat) {
    const t1 = new THREE.Mesh(new THREE.BoxGeometry(wid * 0.34, hgt * 0.20, wid * 0.16), capMat); t1.position.y = hgt * 0.52; grp.add(t1);
    const t2 = new THREE.Mesh(new THREE.BoxGeometry(wid * 0.22, hgt * 0.34, wid * 0.13), capMat); t2.position.y = hgt * 0.66; grp.add(t2);
    const t3 = new THREE.Mesh(new THREE.BoxGeometry(wid * 0.10, hgt * 0.16, wid * 0.10), capMat); t3.position.y = hgt * 0.86; grp.add(t3);
  }
  scene.add(grp); return grp;
}
const farIsles = [
  { g: farIsle(26, 60, M.hillFar, null), x: -120, off: 40 },
  { g: farIsle(34, 74, M.hillFar, M.temple), x: 132, off: 230 },
  { g: farIsle(20, 52, M.hillFar, null), x: 118, off: 390 },
];

/* birds — two-wing flapping silhouettes crossing the sky */
const birdWingGeo = new THREE.PlaneGeometry(1.15, 0.34); birdWingGeo.translate(0.55, 0, 0);
const birdL = decoIM(birdWingGeo, M.bird, 6);
const birdR = decoIM(birdWingGeo, M.bird, 6);
birdL.material.side = THREE.DoubleSide; birdR.material.side = THREE.DoubleSide;
const birds = [];
for (let i = 0; i < 6; i++) birds.push({ x0: -70 - Math.random() * 90, y: 15 + Math.random() * 11, sp: 5.5 + Math.random() * 3.5, ph: Math.random() * 6.3, z: -55 - Math.random() * 130 });

/* floating pollen / sparkle motes around the runner.
   Nov 7: was THREE.Points — point sprites render as hard WHITE SQUARES on
   phone GPUs (point-size attenuation; Tom's report), so the motes are now
   tiny instanced SPHERES (real geometry): soft gold glints on every GPU,
   zero squares possible. */
const MOTE_N = 90;
const motes = new THREE.InstancedMesh(
  new THREE.SphereGeometry(0.055, 6, 5),
  new THREE.MeshBasicMaterial({ color: 0xffe9a0, transparent: true, opacity: 0.5, depthWrite: false, fog: true }),
  MOTE_N);
motes.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
motes.frustumCulled = false; scene.add(motes);
const moteData = [];
for (let i = 0; i < MOTE_N; i++) moteData.push({ x: (Math.random() - 0.5) * 17, y: 0.4 + Math.random() * 4.6, z: -Math.random() * 55, ph: Math.random() * 6.3, dr: 0.4 + Math.random() * 0.9 });

/* beach foam lines at both water edges (scroll with the world) */
const foamIM = decoIM(new THREE.PlaneGeometry(2.6, 1.15), M.whiteF, SECT_N * 2);
foamIM.material.transparent = true; foamIM.material.opacity = 0.5;

/* ============ HOUSE BRANDING — painted wordmark textures in the world ============
   LUNC / LUNA CLASSIC wordmarks + crescent, canvas-painted onto the loop
   banner, entry arch, start arch, trackside billboards and wooden signs.
   The words LUNA CLASSIC always appear — a crescent alone is not branding. */
function wordTex(w, h, draw) {
  const c = document.createElement('canvas'); c.width = w; c.height = h;
  draw(c.getContext('2d'), w, h);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4;
  return t;
}
function crescentPath(g, cx, cy, r) {
  g.beginPath();
  g.arc(cx, cy, r, 0, Math.PI * 2);
  g.arc(cx + r * 0.42, cy - r * 0.16, r * 0.80, 0, Math.PI * 2, true);
}
function paintCrescent(g, cx, cy, r, col) { g.fillStyle = col; crescentPath(g, cx, cy, r); g.fill('evenodd'); }
const bannerTex = wordTex(1024, 128, (g, w, h) => {
  const gr = g.createLinearGradient(0, 0, 0, h); gr.addColorStop(0, '#0e5a6e'); gr.addColorStop(1, '#083344');
  g.fillStyle = gr; g.fillRect(0, 0, w, h);
  g.strokeStyle = '#ffcf3d'; g.lineWidth = 6; g.strokeRect(5, 5, w - 10, h - 10);
  paintCrescent(g, 74, h / 2, 40, '#ffcf3d'); paintCrescent(g, w - 74, h / 2, 40, '#ffcf3d');
  g.fillStyle = '#ffe9a8'; g.font = '900 64px "Segoe UI",system-ui,sans-serif';
  g.textAlign = 'center'; g.textBaseline = 'middle';
  g.fillText('LUNA CLASSIC', w / 2, h / 2 + 3);
});
const archTex = wordTex(1024, 96, (g, w, h) => {
  g.fillStyle = '#12222e'; g.fillRect(0, 0, w, h);
  g.strokeStyle = '#ffcf3d'; g.lineWidth = 4; g.strokeRect(4, 4, w - 8, h - 8);
  paintCrescent(g, 58, h / 2, 30, '#ffcf3d'); paintCrescent(g, w - 58, h / 2, 30, '#ffcf3d');
  g.fillStyle = '#ffcf3d'; g.font = '900 52px "Segoe UI",system-ui,sans-serif';
  g.textAlign = 'center'; g.textBaseline = 'middle';
  g.fillText('LUNC RUSH 3D', w / 2, h / 2 + 2);
});
const bbTexA = wordTex(512, 256, (g, w, h) => {
  const gr = g.createLinearGradient(0, 0, 0, h); gr.addColorStop(0, '#7cc7ee'); gr.addColorStop(1, '#2b7fc4');
  g.fillStyle = gr; g.fillRect(0, 0, w, h);
  g.strokeStyle = '#ffffff'; g.lineWidth = 8; g.strokeRect(6, 6, w - 12, h - 12);
  paintCrescent(g, w / 2, 78, 52, '#ffcf3d');
  g.fillStyle = '#ffffff'; g.font = '900 54px "Segoe UI",system-ui,sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle';
  g.fillText('LUNA CLASSIC', w / 2, 168);
  g.fillStyle = '#ffe9a8'; g.font = '800 30px "Segoe UI",system-ui,sans-serif';
  g.fillText('★ LUNC RUSH 3D ★', w / 2, 218);
});
const bbTexB = wordTex(512, 256, (g, w, h) => {
  g.fillStyle = '#0b2a4a'; g.fillRect(0, 0, w, h);
  g.strokeStyle = '#ffcf3d'; g.lineWidth = 8; g.strokeRect(6, 6, w - 12, h - 12);
  paintCrescent(g, 84, 84, 46, '#ffcf3d');
  g.fillStyle = '#ffcf3d'; g.font = '900 74px "Segoe UI",system-ui,sans-serif'; g.textAlign = 'left'; g.textBaseline = 'middle';
  g.fillText('LUNC', 152, 74);
  g.fillStyle = '#63b3ff'; g.fillText('RUSH', 152, 152);
  g.fillStyle = '#ffffff'; g.font = '900 60px "Segoe UI",system-ui,sans-serif'; g.textAlign = 'center';
  g.fillText('3D', 440, 128);
  g.fillStyle = '#cfe8ff'; g.font = '800 28px "Segoe UI",system-ui,sans-serif'; g.textAlign = 'center';
  g.fillText('LUNA CLASSIC', w / 2, 222);
});
const bbTexC = wordTex(512, 256, (g, w, h) => {
  const gr = g.createLinearGradient(0, 0, 0, h); gr.addColorStop(0, '#ffd94d'); gr.addColorStop(1, '#f5a623');
  g.fillStyle = gr; g.fillRect(0, 0, w, h);
  g.strokeStyle = '#7a4d00'; g.lineWidth = 8; g.strokeRect(6, 6, w - 12, h - 12);
  paintCrescent(g, w / 2, 84, 54, '#0b2a4a');
  g.fillStyle = '#0b2a4a'; g.font = '900 58px "Segoe UI",system-ui,sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle';
  g.fillText('LUNC', w / 2, 178);
  g.font = '800 27px "Segoe UI",system-ui,sans-serif';
  g.fillText('LUNA CLASSIC', w / 2, 224);
});
const signTex = wordTex(256, 96, (g, w, h) => {
  g.fillStyle = '#8a6844'; g.fillRect(0, 0, w, h);
  g.fillStyle = 'rgba(60,40,18,0.5)';
  g.fillRect(0, h / 3, w, 3); g.fillRect(0, 2 * h / 3, w, 3);
  for (let i = 0; i < 160; i++) { g.fillStyle = 'rgba(70,48,22,0.25)'; g.fillRect(Math.random() * w, Math.random() * h, 5, 1.4); }
  paintCrescent(g, 42, h / 2, 26, '#ffcf3d');
  g.fillStyle = '#ffe9a8'; g.font = '900 44px "Segoe UI",system-ui,sans-serif'; g.textAlign = 'left'; g.textBaseline = 'middle';
  g.fillText('LUNC', 80, h / 2 + 2);
});
const thatchTex = canvasTex(256, 256, (g, w, h) => {
  g.fillStyle = '#c9a35a'; g.fillRect(0, 0, w, h);
  for (let i = 0; i < 900; i++) {
    g.strokeStyle = Math.random() < 0.5 ? 'rgba(140,105,45,0.5)' : 'rgba(235,205,130,0.5)';
    g.lineWidth = 1.6;
    const x = Math.random() * w, y = Math.random() * h;
    g.beginPath(); g.moveTo(x, y); g.lineTo(x + (Math.random() - 0.5) * 4, y + 12 + Math.random() * 16); g.stroke();
  }
  g.fillStyle = 'rgba(110,80,35,0.35)';
  for (let j = 1; j < 4; j++) g.fillRect(0, j * 64, w, 3);
}, 2, 1);
M.thatch.map = thatchTex; M.thatch.needsUpdate = true;
M.signBrand = new THREE.MeshLambertMaterial({ map: signTex });
const bannerMat = new THREE.MeshLambertMaterial({ map: bannerTex });
const archMat = new THREE.MeshLambertMaterial({ map: archTex });
const bbMats = [bbTexA, bbTexB, bbTexC].map(t => new THREE.MeshLambertMaterial({ map: t, side: THREE.DoubleSide }));

/* trackside billboards + the start arch (instanced, wrap with the world) */
const bbPostGeo = new THREE.BoxGeometry(0.24, 3.4, 0.24); bbPostGeo.translate(0, 1.7, 0);
const bbBoardGeo = new THREE.BoxGeometry(5.2, 2.6, 0.14); bbBoardGeo.translate(0, 4.1, 0);
const bbPostIM = decoIM(bbPostGeo, M.woodDk, 8);
const bbBoardIMs = bbMats.map(m => decoIM(bbBoardGeo, m, 3));
const BB_SPOTS = [
  { off: 88, side: -1, v: 0 }, { off: 150, side: 1, v: 1 }, { off: 232, side: -1, v: 2 },
  { off: 292, side: 1, v: 0 }, { off: 372, side: -1, v: 1 }, { off: 448, side: 1, v: 2 },
];
const startPostGeo = new THREE.BoxGeometry(0.4, 5.2, 0.4); startPostGeo.translate(0, 2.6, 0);
const startBoardGeo = new THREE.BoxGeometry(11.4, 1.35, 0.3); startBoardGeo.translate(0, 5.35, 0);
const startPostIM = decoIM(startPostGeo, M.woodDk, 2);
const startBoardIM = decoIM(startBoardGeo, bannerMat, 1);
const statueCresGeo = new THREE.TorusGeometry(0.34, 0.10, 8, 20, Math.PI * 1.45);
const lmStatueCres = decoIM(statueCresGeo, M.gold, 2);
lmSignBoard.material = M.signBrand;
lmArchCloth.material = bannerMat;

/* ---------------- obstacles ---------------- */
const obGeoBarrier = new THREE.BoxGeometry(1.9, 1.05, 0.45);
const obGeoStripe = new THREE.BoxGeometry(1.94, 0.28, 0.48);
const obGeoBar = new THREE.CylinderGeometry(0.09, 0.09, 2.0, 8);
const obGeoPost = new THREE.BoxGeometry(0.16, 1.9, 0.16);
const obGeoRock = new THREE.DodecahedronGeometry(0.62);
const barrierIM = new THREE.InstancedMesh(obGeoBarrier, M.red, 24);
const stripeIM = new THREE.InstancedMesh(obGeoStripe, M.white, 24);
const barIM = new THREE.InstancedMesh(obGeoBar, M.goldDark, 24);
const postIM = new THREE.InstancedMesh(obGeoPost, M.ink, 48);
const rockIM = new THREE.InstancedMesh(obGeoRock, M.rock, 24);
for (const im of [barrierIM, stripeIM, barIM, postIM, rockIM]) { im.instanceMatrix.setUsage(THREE.DynamicDrawUsage); scene.add(im); }
const obstacles = []; // {kind:'jump'|'roll'|'rock', lane, z, active}
let nextObZ = 130;

/* ---------------- the giant loop ---------------- */
const loopGroup = new THREE.Group();
{
  const tube = new THREE.Mesh(new THREE.TorusGeometry(LOOP_R, 0.55, 12, 64), M.goldDark);
  tube.position.y = LOOP_R; loopGroup.add(tube);
  const tubeIn = new THREE.Mesh(new THREE.TorusGeometry(LOOP_R, 0.2, 10, 64), M.gold);
  tubeIn.position.y = LOOP_R; loopGroup.add(tubeIn);
  const jewelGeo = new THREE.OctahedronGeometry(0.30);
  for (let i = 0; i < 10; i++) {
    const a = (i / 10) * Math.PI * 2;
    const j = new THREE.Mesh(jewelGeo, i % 2 ? M.ustc : M.gold);
    j.position.set(Math.cos(a) * LOOP_R, LOOP_R + Math.sin(a) * LOOP_R, 0.62);
    loopGroup.add(j);
  }
  const postGeo = new THREE.BoxGeometry(0.5, LOOP_R, 0.5);
  for (const sx of [-1, 1]) {
    const p = new THREE.Mesh(postGeo, M.ink);
    p.position.set(sx * LOOP_R * 0.7, LOOP_R / 2, 0);
    p.rotation.z = sx * 0.45;
    loopGroup.add(p);
  }
  const banner = new THREE.Mesh(new THREE.BoxGeometry(10.5, 1.1, 0.3), bannerMat);
  banner.position.set(0, LOOP_R * 2 + 1.15, 0); loopGroup.add(banner);
  const archL = new THREE.Mesh(new THREE.BoxGeometry(0.45, 3.4, 0.45), M.ink); archL.position.set(-5.2, 1.7, 0); loopGroup.add(archL);
  const archR = archL.clone(); archR.position.x = 5.2; loopGroup.add(archR);
  const archT = new THREE.Mesh(new THREE.BoxGeometry(10.9, 0.62, 0.45), archMat); archT.position.set(0, 3.45, 0); loopGroup.add(archT);
}
loopGroup.visible = false; scene.add(loopGroup);

/* ---------------- hero: COMET the moon-fox ---------------- */
function buildHero() {
  const hero = new THREE.Group();
  const bodyG = new THREE.Group(); hero.add(bodyG);
  const add = (parent, geo, mat, x, y, z, rx = 0, ry = 0, rz = 0) => {
    const m = new THREE.Mesh(geo, mat); m.position.set(x, y, z); m.rotation.set(rx, ry, rz); parent.add(m); return m;
  };
  // torso (capsule) leaning forward
  const torso = add(bodyG, new THREE.CapsuleGeometry(0.34, 0.55, 6, 12), M.orange, 0, 0.95, 0.05, 0.5);
  add(bodyG, new THREE.SphereGeometry(0.27, 12, 10), M.cream, 0, 0.82, -0.17, 0.5).scale.set(0.85, 1.05, 0.6); // chest patch
  // head
  const headG = new THREE.Group(); headG.position.set(0, 1.52, -0.3); bodyG.add(headG);
  add(headG, new THREE.SphereGeometry(0.30, 14, 12), M.orange, 0, 0, 0).scale.set(1, 0.92, 0.95);
  add(headG, new THREE.SphereGeometry(0.16, 10, 8), M.cream, 0, -0.10, -0.17).scale.set(1.1, 0.7, 0.8); // cheek/muzzle patch
  add(headG, new THREE.ConeGeometry(0.13, 0.34, 8), M.orange, 0, -0.05, -0.36, -Math.PI / 2 + 0.25); // snout
  add(headG, new THREE.SphereGeometry(0.055, 8, 8), M.nose, 0, -0.01, -0.52); // nose
  add(headG, new THREE.SphereGeometry(0.045, 8, 8), M.ink, -0.13, 0.09, -0.24); // eyes (visible in balance cam)
  add(headG, new THREE.SphereGeometry(0.045, 8, 8), M.ink, 0.13, 0.09, -0.24);
  // ears with dark tips
  const earGeo = new THREE.ConeGeometry(0.11, 0.42, 6);
  const tipGeo = new THREE.ConeGeometry(0.055, 0.2, 6);
  const earL = new THREE.Group(), earR = new THREE.Group();
  earL.position.set(-0.16, 0.24, 0.02); earR.position.set(0.16, 0.24, 0.02);
  add(earL, earGeo, M.orange, 0, 0.18, 0); add(earL, tipGeo, M.ink, 0, 0.4, 0);
  add(earR, earGeo, M.orange, 0, 0.18, 0); add(earR, tipGeo, M.ink, 0, 0.4, 0);
  earL.rotation.z = 0.18; earR.rotation.z = -0.18;
  headG.add(earL, earR);
  // crescent stud on left ear + chest charm
  add(earL, new THREE.TorusGeometry(0.05, 0.018, 6, 12, Math.PI * 1.4), M.gold, -0.06, 0.1, -0.08, 0, 0, 2.2);
  add(bodyG, new THREE.TorusGeometry(0.09, 0.032, 6, 14, Math.PI * 1.45), M.gold, 0, 1.02, -0.33, 0.35, 0, 2.4);
  // scarf (torus + tail flap)
  add(bodyG, new THREE.TorusGeometry(0.21, 0.075, 8, 14), M.teal, 0, 1.38, -0.18, Math.PI / 2 - 0.35);
  const scarfTail = add(bodyG, new THREE.BoxGeometry(0.16, 0.42, 0.045), M.teal, 0.1, 1.22, 0.22, 0.5);
  // arms
  const armGeo = new THREE.CapsuleGeometry(0.085, 0.3, 4, 8);
  const armL = new THREE.Group(), armR = new THREE.Group();
  armL.position.set(-0.4, 1.2, -0.05); armR.position.set(0.4, 1.2, -0.05);
  add(armL, armGeo, M.orange, 0, -0.2, 0); add(armR, armGeo, M.orange, 0, -0.2, 0);
  add(armL, new THREE.SphereGeometry(0.085, 8, 8), M.cream, 0, -0.42, 0); add(armR, new THREE.SphereGeometry(0.085, 8, 8), M.cream, 0, -0.42, 0);
  bodyG.add(armL, armR);
  // legs with teal shoes
  const legGeo = new THREE.CapsuleGeometry(0.1, 0.34, 4, 8);
  const shoeGeo = new THREE.BoxGeometry(0.17, 0.11, 0.3);
  const legL = new THREE.Group(), legR = new THREE.Group();
  legL.position.set(-0.17, 0.62, 0.02); legR.position.set(0.17, 0.62, 0.02);
  add(legL, legGeo, M.orangeDk, 0, -0.22, 0); add(legR, legGeo, M.orangeDk, 0, -0.22, 0);
  add(legL, shoeGeo, M.teal, 0, -0.5, -0.05); add(legR, shoeGeo, M.teal, 0, -0.5, -0.05);
  add(legL, new THREE.BoxGeometry(0.18, 0.05, 0.32), M.white, 0, -0.56, -0.05); add(legR, new THREE.BoxGeometry(0.18, 0.05, 0.32), M.white, 0, -0.56, -0.05);
  bodyG.add(legL, legR);
  // big tail plume with cream tip — streams behind (+Z)
  const tailG = new THREE.Group(); tailG.position.set(0, 1.0, 0.32); bodyG.add(tailG);
  const tail1 = add(tailG, new THREE.ConeGeometry(0.21, 0.85, 10), M.orange, 0, 0, 0.36, Math.PI / 2 + 0.35);
  const tail2 = add(tailG, new THREE.ConeGeometry(0.115, 0.4, 8), M.cream, 0, -0.13, 0.78, Math.PI / 2 + 0.35);
  // ball form
  const ballG = new THREE.Group(); ballG.visible = false; hero.add(ballG);
  const ball = add(ballG, new THREE.SphereGeometry(0.52, 18, 14), M.orange, 0, 0.52, 0);
  add(ballG, new THREE.TorusGeometry(0.5, 0.09, 8, 20), M.cream, 0, 0.52, 0, Math.PI / 2);
  add(ballG, new THREE.TorusGeometry(0.52, 0.05, 8, 20), M.teal, 0, 0.52, 0, 0, Math.PI / 3);
  add(ballG, new THREE.ConeGeometry(0.09, 0.26, 6), M.ink, -0.2, 1.0, 0.1, 0, 0, 0.3);
  add(ballG, new THREE.ConeGeometry(0.09, 0.26, 6), M.ink, 0.2, 1.0, 0.1, 0, 0, -0.3);
  add(ballG, new THREE.TorusGeometry(0.11, 0.04, 6, 14, Math.PI * 1.45), M.gold, 0, 0.52, -0.5, 0, 0, 2.4);
  return { group: hero, bodyG, ballG, legL, legR, armL, armR, tailG, tail1, tail2, headG, earL, earR, scarfTail, ball };
}
const H = buildHero();
scene.add(H.group);

/* speed streaks */
const streaks = [];
{
  const g = new THREE.BufferGeometry();
  const pos = new Float32Array(40 * 2 * 3);
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  const lines = new THREE.LineSegments(g, new THREE.LineBasicMaterial({ color: 0xfdf6dd, transparent: true, opacity: 0 }));
  lines.frustumCulled = false; scene.add(lines);
  for (let i = 0; i < 40; i++) streaks.push({ x: (Math.random() - 0.5) * 16, y: 0.5 + Math.random() * 5, z: -Math.random() * 60, len: 1.5 + Math.random() * 2.5 });
  streaks.lines = lines; streaks.pos = pos;
}

/* ---------------- audio (procedural, guarded) ---------------- */
const AU = { ctx: null, master: null, windGain: null, windFilter: null };
function audioInit() {
  if (AU.ctx) { if (AU.ctx.state === 'suspended') AU.ctx.resume(); return; }
  try {
    const C = window.AudioContext || window.webkitAudioContext; if (!C) return;
    AU.ctx = new C();
    AU.master = AU.ctx.createGain(); AU.master.gain.value = S.muted ? 0 : 0.5; AU.master.connect(AU.ctx.destination);
    // wind: looping noise buffer through bandpass
    const len = AU.ctx.sampleRate * 2, buf = AU.ctx.createBuffer(1, len, AU.ctx.sampleRate), d = buf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    const src = AU.ctx.createBufferSource(); src.buffer = buf; src.loop = true;
    AU.windFilter = AU.ctx.createBiquadFilter(); AU.windFilter.type = 'bandpass'; AU.windFilter.frequency.value = 400; AU.windFilter.Q.value = 0.6;
    AU.windGain = AU.ctx.createGain(); AU.windGain.gain.value = 0;
    src.connect(AU.windFilter); AU.windFilter.connect(AU.windGain); AU.windGain.connect(AU.master);
    src.start();
  } catch (e) { AU.ctx = null; }
}
function beep(freq, dur = 0.09, type = 'sine', vol = 0.22, slide = 0) {
  if (!AU.ctx || S.muted) return;
  try {
    const t = AU.ctx.currentTime, o = AU.ctx.createOscillator(), g = AU.ctx.createGain();
    o.type = type; o.frequency.setValueAtTime(freq, t);
    if (slide) o.frequency.exponentialRampToValueAtTime(Math.max(40, freq + slide), t + dur);
    g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    o.connect(g); g.connect(AU.master); o.start(t); o.stop(t + dur + 0.02);
  } catch (e) {}
}
function noiseBurst(dur = 0.35, vol = 0.3, freq = 900) {
  if (!AU.ctx || S.muted) return;
  try {
    const t = AU.ctx.currentTime, len = AU.ctx.sampleRate * dur, buf = AU.ctx.createBuffer(1, len, AU.ctx.sampleRate), d = buf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / len);
    const src = AU.ctx.createBufferSource(); src.buffer = buf;
    const f = AU.ctx.createBiquadFilter(); f.type = 'bandpass'; f.frequency.setValueAtTime(freq, t);
    f.frequency.exponentialRampToValueAtTime(2400, t + dur);
    const g = AU.ctx.createGain(); g.gain.value = vol;
    src.connect(f); f.connect(g); g.connect(AU.master); src.start(t);
  } catch (e) {}
}
const sndCoin = () => { S.pitchChain = Math.min(S.pitchChain + 1, 12); beep(880 * Math.pow(1.0595, S.pitchChain), 0.1, 'sine', 0.2); };
const sndStar = () => { beep(1320, 0.16, 'triangle', 0.25); setTimeout(() => beep(1760, 0.2, 'triangle', 0.2), 60); };
const sndJump = () => beep(300, 0.12, 'sine', 0.12, 260);
const sndHit = () => { beep(160, 0.25, 'sawtooth', 0.25, -90); noiseBurst(0.2, 0.2, 500); };
const sndWhoosh = () => noiseBurst(0.5, 0.35, 700);

/* ---------------- DOM / UI ---------------- */
const $ = id => document.getElementById(id);
const hud = $('hud'), touchUI = $('touchUI'), stickZone = $('stickZone');
const hudCoins = $('hudCoins'), hudStars = $('hudStars'), hudDist = $('hudDist'), heartsEl = $('hearts');
const bannerMain = $('bannerMain'), bannerSub = $('bannerSub');
let bannerTimer = null;
function showBanner(main, sub = '', ms = 1300) {
  bannerMain.textContent = main; bannerSub.textContent = sub;
  bannerMain.classList.remove('fadeout'); bannerSub.classList.remove('fadeout');
  clearTimeout(bannerTimer);
  bannerTimer = setTimeout(() => { bannerMain.classList.add('fadeout'); bannerSub.classList.add('fadeout'); }, ms);
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
  $('overTitle').textContent = T('over');
  $('submitBtn').textContent = T('submit');
  $('againBtn').textContent = T('again');
  $('menuBtn').textContent = T('menu');
  $('nameInput').placeholder = T('namePh');
  $('hudDistLabel').textContent = (T('distWord') || 'DIST').toUpperCase();
  $('muteBtn').textContent = S.muted ? '🔇' : '🔊';
}
const langSel = $('langSel');
LANGS.forEach(([code, label]) => { const o = document.createElement('option'); o.value = code; o.textContent = label; langSel.appendChild(o); });
langSel.value = LANG_CUR;
langSel.addEventListener('change', () => {
  if (I18N[langSel.value]) { LANG_CUR = langSel.value; try { localStorage.setItem('luncRush3dLang', LANG_CUR); } catch (e) {} applyLang(); }
});
function updateHUD() {
  hudCoins.textContent = S.coins; hudStars.textContent = S.stars;
  hudDist.textContent = Math.floor(S.dist) + 'm';
  heartsEl.textContent = '♥'.repeat(Math.max(0, S.hearts)) + '♡'.repeat(Math.max(0, 3 - S.hearts));
}

/* ---------------- leaderboard ---------------- */
let boardData = null, boardTab = 'all';
async function loadBoard() {
  try { const r = await fetch('/api/luna-games?game=lunc-rush-3d'); boardData = await r.json(); } catch (e) { boardData = null; }
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
  const name = ($('nameInput').value || '').trim() || 'COMET';
  try { localStorage.setItem('luncRush3dName', name); } catch (e) {}
  $('submitBtn').disabled = true;
  try {
    const r = await fetch('/api/luna-games?game=lunc-rush-3d', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ initData: '', name, score: Math.floor(S.score), seconds: Math.max(1, Math.round(S.runTime)) }),
    });
    const j = await r.json();
    $('savedLine').textContent = j && j.rank ? T('rank').replace('{n}', j.rank) : T('saved');
  } catch (e) { $('savedLine').textContent = T('saved'); }
}

/* ---------------- spawning ---------------- */
const dummy = new THREE.Object3D();
const HIDE = new THREE.Matrix4().makeScale(0, 0, 0);
function hideIM(im, i) { im.setMatrixAt(i, HIDE); }

function spawnCoins() {
  // called as the course extends: place one pattern roughly every 22-38 m
  let z = nextCoinZ;
  const roll = Math.random();
  const lane = (Math.random() * 3) | 0;
  const put = (x, y, zz) => {
    const c = coins.find(c => !c.active); if (!c) return;
    c.active = true; c.x = x; c.y = y; c.z = zz; c.fly = null;
  };
  if (roll < 0.42) {           // straight line of 5 in one lane
    for (let i = 0; i < 5; i++) put(LANE_X[lane], 1.1, z + i * 2.2);
    nextCoinZ = z + 5 * 2.2 + 12 + Math.random() * 14;
  } else if (roll < 0.68) {    // arc over a jump (high middle)
    for (let i = 0; i < 5; i++) { const t = i / 4; put(LANE_X[lane], 1.1 + Math.sin(t * Math.PI) * 1.5, z + i * 2.0); }
    nextCoinZ = z + 5 * 2.0 + 12 + Math.random() * 14;
  } else if (roll < 0.9) {     // zig-zag across lanes
    for (let i = 0; i < 6; i++) put(LANE_X[(lane + i) % 3], 1.1, z + i * 2.4);
    nextCoinZ = z + 6 * 2.4 + 12 + Math.random() * 14;
  } else {                     // rare USTC star + small coin tail
    const st = stars.find(s => !s.active);
    if (st) { st.active = true; st.x = LANE_X[lane]; st.y = 1.5; st.z = z + 4; st.fly = null; }
    for (let i = 0; i < 3; i++) put(LANE_X[lane], 1.1, z + i * 2.2);
    nextCoinZ = z + 22 + Math.random() * 16;
  }
}
function spawnObstacleRow() {
  const z = nextObZ;
  const clearLane = (Math.random() * 3) | 0;
  const kindPick = () => { const r = Math.random(); return r < 0.36 ? 'jump' : (r < 0.68 ? 'roll' : 'rock'); };
  let placed = 0;
  for (let l = 0; l < 3; l++) {
    if (l === clearLane) continue;
    // one obstacle per lane, never the same kind twice in a row:
    // a 'roll' gate must be ducked, so it can never share a row with
    // another 'roll' — the ducked hero would release into the second gate.
    let kind = kindPick();
    if (kind === 'roll' && obstacles.some(o => o.active && o.z === z && o.kind === 'roll')) kind = 'jump';
    if (placed === 0 || Math.random() < 0.75) { obstacles.push({ kind, lane: l, z, active: true }); placed++; }
  }
  if (!placed) obstacles.push({ kind: kindPick(), lane: (clearLane + 1) % 3, z, active: true });
  /* gap scales with current speed so reaction TIME stays ~constant as
     the run gets faster (fair at 34 m/s, not wall-to-wall at 18 m/s) */
  const spdF = 1 + Math.max(0, S.speed - SPEED0) * 0.022;
  nextObZ = z + OB_SPACING * spdF * (0.86 + Math.random() * 0.36) - Math.min(9, S.dist * 0.002);
}

/* QA auto-pilot: set via window.__rush3d.S.pilot = true (automated checks
   only). Steers to the clear lane, jumps 'jump' barriers and rocks, ducks
   'roll' gates, drifts toward coin lines. Not used in normal play. */
function qaPilot(dt) {
  const dzOf = o => o.z - S.dist;
  const sameRow = (a, b) => Math.abs(a.z - b.z) < 1;
  // how many lanes in the nearest threat's row are passable?
  let threat = null;
  for (const o of obstacles) {
    if (!o.active) continue;
    const dz = dzOf(o);
    if (dz > 0.4 && dz < 34 && (!threat || dz < dzOf(threat))) threat = o;
  }
  let actionDone = false;
  void dt;
  if (threat) {
    const rowObs = obstacles.filter(o => o.active && sameRow(o, threat));
    const blocked = new Set(rowObs.map(o => o.lane));
    const clearLanes = [0, 1, 2].filter(l => !blocked.has(l));
    const mine = rowObs.find(o => o.lane === S.lane);
    if (mine && clearLanes.length) {
      // a clear lane exists — always take it instead of jumping/ducking
      const t = clearLanes.reduce((a, b) => Math.abs(b - S.lane) < Math.abs(a - S.lane) ? b : a);
      if (t !== S.lane) { S.lane = t; actionDone = true; }
    } else if (mine) {
      // row covers every lane — must jump or duck the obstacle in front
      const dz = dzOf(mine);
      if (mine.kind === 'roll') { if (dz < 11 && dz > 3.5) { doRoll(); actionDone = true; } }
      else if (dz < 13) { doJump(); actionDone = true; }
    }
  }
  if (!actionDone && (!threat || dzOf(threat) > 20)) {
    let best = null;
    for (const c of coins) {
      if (!c.active) continue;
      const dz = c.z - S.dist;
      if (dz > 5 && dz < 30 && (!best || dz < best.dz)) best = { lane: Math.round((c.x + 2.3) / 2.3), dz };
    }
    if (best && best.lane !== S.lane) { S.lane = best.lane; }
  }
}

/* ---------------- game flow ---------------- */
function resetRun() {
  S.dist = 0; S.coins = 0; S.stars = 0; S.score = 0; S.hearts = 3;
  S.speed = SPEED0; S.y = 0; S.vy = 0; S.grounded = true;
  S.lane = 1; S.laneX = 0; S.rollT = 0; S.stumbleT = 0; S.invulnT = 0; S.hitFlash = 0;
  S.loop = null; S.nextLoopAt = LOOP_EVERY; S.loopCount = 0; S.runTime = 0; S.pitchChain = 0;
  for (const c of coins) c.active = false;
  for (const s of stars) s.active = false;
  for (const s of scats) s.active = false;
  obstacles.length = 0;
  nextCoinZ = 55; nextObZ = 120;
  loopGroup.visible = false;
  H.ballG.visible = false; H.bodyG.visible = true;
  updateHUD();
}
function startRun() {
  audioInit();
  resetRun();
  S.mode = 'run'; S.started = true;
  $('menu').classList.add('hidden'); $('overPanel').classList.add('hidden'); $('pausePanel').classList.add('hidden');
  hud.classList.remove('hidden'); touchUI.classList.remove('hidden');
  stickZone.classList.remove('hidden'); stickZone.classList.add('on');
  showBanner(T('go'), T('swipeHint'), 1200);
}
function endRun() {
  S.mode = 'over';
  hud.classList.add('hidden'); touchUI.classList.add('hidden');
  stickZone.classList.add('hidden'); stickZone.classList.remove('on'); stickReset();
  $('finalScoreLine').textContent = T('finalScore') + ': ' + Math.floor(S.score);
  $('finalDetail').textContent = `${S.coins} ${T('coinsWord')} · ${S.stars} ${T('starsWord')} · ${Math.floor(S.dist)}m`;
  $('savedLine').textContent = '';
  $('submitBtn').disabled = false;
  try { $('nameInput').value = localStorage.getItem('luncRush3dName') || ''; } catch (e) {}
  $('overPanel').classList.remove('hidden');
  loadBoard();
}
function pauseGame() {
  if (S.mode !== 'run') return;
  S.mode = 'pause'; $('pausePanel').classList.remove('hidden');
}
function resumeGame() {
  if (S.mode !== 'pause') return;
  S.mode = 'run'; $('pausePanel').classList.add('hidden');
}

$('playBtn').addEventListener('click', startRun);
$('againBtn').addEventListener('click', startRun);
$('submitBtn').addEventListener('click', submitScore);
$('menuBtn').addEventListener('click', () => { $('overPanel').classList.add('hidden'); $('menu').classList.remove('hidden'); S.mode = 'menu'; });
$('howBtn').addEventListener('click', () => $('howPanel').classList.remove('hidden'));
$('howClose').addEventListener('click', () => $('howPanel').classList.add('hidden'));
$('boardBtn').addEventListener('click', () => { $('boardPanel').classList.remove('hidden'); loadBoard(); });
$('boardClose').addEventListener('click', () => $('boardPanel').classList.add('hidden'));
$('tabAll').addEventListener('click', () => { boardTab = 'all'; $('tabAll').classList.add('on'); $('tabWeek').classList.remove('on'); renderBoard(); });
$('tabWeek').addEventListener('click', () => { boardTab = 'week'; $('tabWeek').classList.add('on'); $('tabAll').classList.remove('on'); renderBoard(); });
$('pauseBtn').addEventListener('click', pauseGame);
$('resumeBtn').addEventListener('click', resumeGame);
$('quitBtn').addEventListener('click', () => { $('pausePanel').classList.add('hidden'); $('overPanel').classList.add('hidden'); hud.classList.add('hidden'); touchUI.classList.add('hidden'); stickZone.classList.add('hidden'); stickZone.classList.remove('on'); stickReset(); $('menu').classList.remove('hidden'); S.mode = 'menu'; });
$('muteBtn').addEventListener('click', () => {
  S.muted = !S.muted;
  try { localStorage.setItem('luncRush3dMute', S.muted ? '1' : '0'); } catch (e) {}
  if (AU.master) AU.master.gain.value = S.muted ? 0 : 0.5;
  $('muteBtn').textContent = S.muted ? '🔇' : '🔊';
});

/* ---------------- input ---------------- */
function doLeft() { if (S.mode === 'run' && S.lane > 0) { S.lane--; } }
function doRight() { if (S.mode === 'run' && S.lane < 2) { S.lane++; } }
function doJump() {
  if (S.mode !== 'run') return;
  if (S.loop) return;
  if (S.grounded) { S.vy = JUMP_V; S.grounded = false; sndJump(); }
}
function doRoll() {
  if (S.mode !== 'run' || S.loop) return;
  if (!S.grounded) { S.vy = -26; } // slam down
  S.rollT = 0.62;
}
const bindBtn = (id, fn) => {
  const el = $(id);
  el.addEventListener('pointerdown', e => { e.preventDefault(); fn(); });
  el.addEventListener('touchstart', e => { e.preventDefault(); fn(); }, { passive: false });
};
bindBtn('btnJump', doJump); bindBtn('btnRoll', doRoll);

/* ---- Floating joystick (house style) ----------------------------------
   Base lands under the thumb wherever it touches inside #stickZone
   (left/lower screen). Discrete flicks only — lanes stay discrete:
   push past STICK_FIRE re-arms only after returning inside STICK_REARM,
   so one push = one action and a flick-release-flick = two.
   Left/right = lane switch, up = jump, down = roll. Touches that begin
   in the stick zone belong to the stick: the window swipe handlers skip
   them (stickTouch flag) so a flick never double-fires as a swipe. */
const STICK_R = 52, STICK_FIRE = 26, STICK_REARM = 12;
const stickBase = $('stickBase'), stickKnob = $('stickKnob');
const stick = { id: null, bx: 0, by: 0, armedX: true, armedY: true };
let stickTouch = false; // a touch owned by the stick is in progress
function stickShow(x, y) {
  stickBase.style.left = x + 'px'; stickBase.style.top = y + 'px';
  stickBase.style.display = 'block'; stickKnob.style.transform = '';
}
function stickReset() {
  stick.id = null; stick.armedX = true; stick.armedY = true;
  stickBase.style.display = 'none'; stickKnob.style.transform = '';
}
function stickMove(x, y) {
  let dx = x - stick.bx, dy = y - stick.by;
  const d = Math.hypot(dx, dy);
  if (d > STICK_R) { dx *= STICK_R / d; dy *= STICK_R / d; }
  stickKnob.style.transform = `translate(${dx}px,${dy}px)`;
  const ax = Math.abs(dx), ay = Math.abs(dy);
  if (ax < STICK_REARM && ay < STICK_REARM) { stick.armedX = true; stick.armedY = true; }
  if (ax >= ay) {
    if (stick.armedX && ax >= STICK_FIRE) { dx > 0 ? doRight() : doLeft(); stick.armedX = false; }
  } else if (stick.armedY && ay >= STICK_FIRE) {
    dy > 0 ? doRoll() : doJump(); stick.armedY = false;
  }
}
stickZone.addEventListener('pointerdown', e => {
  if (S.mode !== 'run' || stick.id !== null) return;
  stick.id = e.pointerId; stickTouch = true;
  stick.bx = e.clientX; stick.by = e.clientY;
  stick.armedX = true; stick.armedY = true;
  try { stickZone.setPointerCapture(e.pointerId); } catch (err) {}
  stickShow(e.clientX, e.clientY);
  e.preventDefault();
});
stickZone.addEventListener('pointermove', e => {
  if (e.pointerId !== stick.id) return;
  stickMove(e.clientX, e.clientY);
});
const stickEnd = e => {
  if (e.pointerId !== stick.id) return;
  stickReset(); stickTouch = false;
};
stickZone.addEventListener('pointerup', stickEnd);
stickZone.addEventListener('pointercancel', stickEnd);
// Swallow the raw touch events of a stick touch so nothing else sees them.
stickZone.addEventListener('touchstart', e => e.preventDefault(), { passive: false });
stickZone.addEventListener('touchmove', e => e.preventDefault(), { passive: false });
stickZone.addEventListener('touchend', e => e.preventDefault(), { passive: false });

let tsX = 0, tsY = 0, tsT = 0;
addEventListener('touchstart', e => {
  if (stickTouch) return;
  if (e.target.closest('button,select,input,.panel')) return;
  const t = e.changedTouches[0]; tsX = t.clientX; tsY = t.clientY; tsT = performance.now();
}, { passive: true });
addEventListener('touchend', e => {
  if (stickTouch) return;
  if (e.target.closest('button,select,input,.panel')) return;
  const t = e.changedTouches[0], dx = t.clientX - tsX, dy = t.clientY - tsY;
  if (performance.now() - tsT > 600) return;
  if (Math.abs(dx) < 24 && Math.abs(dy) < 24) return;
  if (Math.abs(dx) > Math.abs(dy)) { dx > 0 ? doRight() : doLeft(); }
  else { dy > 0 ? doRoll() : doJump(); }
}, { passive: true });
let mX = 0, mY = 0, mDown = false;
addEventListener('pointerdown', e => { if (e.pointerType === 'mouse' && !e.target.closest('button,select,input,.panel')) { mDown = true; mX = e.clientX; mY = e.clientY; } });
addEventListener('pointerup', e => {
  if (!mDown) return; mDown = false;
  const dx = e.clientX - mX, dy = e.clientY - mY;
  if (Math.abs(dx) < 24 && Math.abs(dy) < 24) return;
  if (Math.abs(dx) > Math.abs(dy)) { dx > 0 ? doRight() : doLeft(); } else { dy > 0 ? doRoll() : doJump(); }
});
addEventListener('keydown', e => {
  const k = e.code;
  if (k === 'ArrowLeft' || k === 'KeyA') doLeft();
  else if (k === 'ArrowRight' || k === 'KeyD') doRight();
  else if (k === 'ArrowUp' || k === 'KeyW' || k === 'Space') { doJump(); e.preventDefault(); }
  else if (k === 'ArrowDown' || k === 'KeyS') doRoll();
  else if (k === 'Escape' || k === 'KeyP') { S.mode === 'run' ? pauseGame() : resumeGame(); }
  else if (k === 'Enter' && S.mode === 'menu') startRun();
});
document.addEventListener('visibilitychange', () => { if (document.hidden) pauseGame(); });

/* ---------------- hazards / pickups logic ---------------- */
function scatterCoins() {
  const n = Math.min(8, S.coins);
  S.coins -= n;
  for (let i = 0; i < n; i++) {
    const s = scats.find(x => !x.active); if (!s) break;
    s.active = true; s.life = 4.5;
    s.x = S.laneX; s.y = 1.1; s.z = -2 - Math.random() * 2;
    s.vx = (Math.random() - 0.5) * 7; s.vy = 3.5 + Math.random() * 3.5; s.vz = 4 + Math.random() * 6;
    s.spin = Math.random() * 6;
  }
}
function takeHit() {
  S.hearts--; S.invulnT = 1.6; S.hitFlash = 0.35; S.stumbleT = 0.55;
  S.pitchChain = 0;
  scatterCoins(); sndHit();
  updateHUD();
  if (S.hearts <= 0) { endRun(); }
}

/* ---------------- main loop ---------------- */
const clock = new THREE.Clock();
let camShake = 0, globalT = 0;
const _v = new THREE.Vector3();

function animate() {
  requestAnimationFrame(animate);
  const rawDt = Math.min(clock.getDelta(), 0.05);
  const dt = S.mode === 'pause' ? 0 : rawDt;
  globalT += rawDt;

  /* --- difficulty / speed --- */
  if (S.mode === 'run') {
    S.runTime += dt;
    if (!S.loop) S.speed = Math.min(SPEED_MAX, SPEED0 + S.dist * SPEED_RAMP * 0.30 + S.runTime * 0.16);
    const inLoopBoost = S.loop ? 1.18 : 1;
    const effSpeed = S.speed * inLoopBoost * (S.stumbleT > 0 ? 0.45 : 1);
    if (S.pilot && !S.loop) qaPilot(dt);
    S.dist += effSpeed * dt;
    S.score += effSpeed * DIST_SCORE * dt;
    if (S.stumbleT > 0) S.stumbleT -= dt;
    if (S.invulnT > 0) S.invulnT -= dt;
    if (S.hitFlash > 0) { S.hitFlash -= dt; if (S.hitFlash <= 0) renderer.setClearColor(0x000000, 0); }

    /* vertical */
    if (!S.loop) {
      if (!S.grounded) {
        S.vy -= GRAV * dt; S.y += S.vy * dt;
        if (S.y <= 0) { S.y = 0; S.grounded = true; S.vy = 0; }
      }
      if (S.rollT > 0) S.rollT -= dt;
    }
    /* lane easing */
    const targetX = LANE_X[S.lane];
    S.laneX += (targetX - S.laneX) * Math.min(1, dt * 11);

    /* spawning ahead */
    const horizon = S.dist + 300;
    while (nextCoinZ < horizon) spawnCoins();
    while (nextObZ < horizon) spawnObstacleRow();
    for (let i = obstacles.length - 1; i >= 0; i--) if (obstacles[i].z < S.dist - 25) obstacles.splice(i, 1);

    /* loop scheduling */
    const loopZ = S.nextLoopAt;
    if (!S.loop && S.dist > loopZ - 200) { loopGroup.visible = true; }
    if (!S.loop && S.dist >= loopZ - 1.2) {
      S.loop = { theta: 0, z: loopZ };
      S.y = 0; S.grounded = true; S.rollT = 0;
      H.bodyG.visible = false; H.ballG.visible = true;
      sndWhoosh();
    }
    if (S.loop) {
      S.loop.theta += (effSpeed * dt) / LOOP_R;
      if (S.loop.theta >= Math.PI * 2) {
        // theta overshoot past 2π means the ball already rolled that far
        // along the flat exit — credit it, don't rewind.
        S.loop = null; S.loopCount++;
        S.nextLoopAt += LOOP_EVERY;
        H.ballG.visible = false; H.bodyG.visible = true;
        showBanner('LOOP!', '+' + (S.loopCount * 100), 900);
        S.score += 100;
        sndWhoosh();
      }
    }

    /* collisions: obstacles */
    if (!S.loop && S.invulnT <= 0) {
      for (const o of obstacles) {
        if (!o.active) continue;
        const dz = o.z - S.dist;
        if (dz > 1.4 || dz < -1.4) continue;
        if (Math.abs(LANE_X[o.lane] - S.laneX) > 0.95) continue;
        let hit = false;
        if (o.kind === 'jump') hit = S.y < 0.85;
        else if (o.kind === 'roll') hit = S.rollT <= 0 && S.y < 1.6;
        else hit = S.y < 0.75; // rock — must jump it
        if (hit) { o.active = false; takeHit(); break; }
      }
    }
    /* pickups */
    const collect = (p, isStar) => {
      const dz = p.z - S.dist, dx = p.x - S.laneX, dy = p.y - (S.y + 1.05);
      if (Math.abs(dz) < 1.15 && Math.abs(dx) < 0.95 && Math.abs(dy) < 1.35) {
        p.active = false;
        if (isStar) { S.stars++; S.score += STAR_SCORE; sndStar(); showBanner('★ USTC', '+250', 600); }
        else { S.coins++; S.score += COIN_SCORE; sndCoin(); }
        S.pitchChain = S.pitchChain; updateHUD();
        return true;
      }
      if (dz < -6) p.active = false;
      return false;
    };
    for (const c of coins) if (c.active) collect(c, false);
    for (const s of stars) if (s.active) collect(s, true);
    /* scattered coin physics */
    for (const s of scats) {
      if (!s.active) continue;
      s.life -= dt;
      s.vy -= 22 * dt;
      s.x += s.vx * dt; s.y += s.vy * dt; s.z += (s.vz - effSpeed) * dt; s.spin += dt * 9;
      if (s.y < 0.35) { s.y = 0.35; s.vy *= -0.45; s.vx *= 0.8; s.vz *= 0.8; }
      const dz = s.z + S.dist, dx = s.x - S.laneX;
      if (Math.abs(dz) < 1.1 && Math.abs(dx) < 1.0 && s.y < 1.9 && S.invulnT <= 0.4) {
        s.active = false; S.coins++; S.score += COIN_SCORE; sndCoin(); updateHUD();
      }
      if (s.life <= 0 || dz < -14) s.active = false;
    }
    updateHUD();
  }

  /* --- world scroll: sections --- */
  const span = SECT_N * SECT_LEN;
  for (const sec of sections) {
    let rel = (sec.userData.baseZ - (S.dist % span) + span) % span;
    sec.position.z = -(rel) + SECT_LEN * 0.5 - 8;
  }
  /* palms */
  for (let i = 0; i < PALM_N; i++) {
    const p = palmData[i];
    let rel = (p.off + ((i / PALMS_PER_SEC) | 0) * SECT_LEN - (S.dist % span) + span) % span;
    dummy.position.set(p.bx, 0, -rel + SECT_LEN * 0.5 - 8);
    dummy.rotation.set(0, p.rot, p.tilt);
    dummy.scale.setScalar(p.s);
    dummy.updateMatrix();
    trunkIM.setMatrixAt(i, dummy.matrix);
    frondIM.setMatrixAt(i, dummy.matrix);
    dummy.rotation.x = Math.sin(globalT * 1.3 + i) * 0.03;
    dummy.updateMatrix();
    frond2IM.setMatrixAt(i, dummy.matrix);
  }
  trunkIM.instanceMatrix.needsUpdate = true;
  frondIM.instanceMatrix.needsUpdate = true;
  frond2IM.instanceMatrix.needsUpdate = true;
  /* clouds */
  for (let i = 0; i < cloudData.length; i++) {
    const c = cloudData[i];
    let rel = (c.off - (S.dist * 0.92) % span + span) % span;
    dummy.position.set(c.x, c.y, -rel - 30);
    dummy.rotation.set(0, 0, 0); dummy.scale.setScalar(c.s);
    dummy.updateMatrix(); cloudIM.setMatrixAt(i, dummy.matrix);
  }
  cloudIM.instanceMatrix.needsUpdate = true;

  /* --- rich world scenery --- */
  {
    const dSpan = 480;
    const relZ = off => -(((off - S.dist) % dSpan + dSpan) % dSpan) + 22;
    let iBush = 0, iBush2 = 0, iFl = 0, iTuft = 0, iRock = 0, iSand = 0, iGlint = 0;
    for (const d of decoData) {
      const z = relZ(d.off);
      if (d.kind === 0) {
        dummy.position.set(d.bx, 0, z); dummy.rotation.set(0, d.rot, 0); dummy.scale.setScalar(d.s);
        dummy.updateMatrix();
        if ((iBush + iBush2) % 2 === 0 && iBush < DECO_N) decoBush.setMatrixAt(iBush++, dummy.matrix);
        else if (iBush2 < DECO_N) decoBush2.setMatrixAt(iBush2++, dummy.matrix);
      } else if (d.kind === 1) {
        dummy.position.set(d.bx, 0, z); dummy.rotation.set(0, d.rot, 0); dummy.scale.setScalar(d.s);
        dummy.updateMatrix();
        const pick = iFl % 3;
        if (pick === 0) decoFlowerP.setMatrixAt((iFl / 3) | 0, dummy.matrix);
        else if (pick === 1) decoFlowerY.setMatrixAt((iFl / 3) | 0, dummy.matrix);
        else decoFlowerV.setMatrixAt((iFl / 3) | 0, dummy.matrix);
        iFl++;
      } else if (d.kind === 2) {
        if (iTuft >= DECO_N * 2) continue;
        dummy.position.set(d.bx, 0, z); dummy.rotation.set(0, d.rot, 0); dummy.scale.setScalar(d.s);
        dummy.updateMatrix(); decoTuft.setMatrixAt(iTuft++, dummy.matrix);
      } else if (d.kind === 3) {
        if (iRock >= 28) continue;
        dummy.position.set(d.bx, 0.12, z); dummy.rotation.set(d.rot, d.rot * 1.7, 0); dummy.scale.set(d.s, d.s * 0.7, d.s);
        dummy.updateMatrix(); decoRock.setMatrixAt(iRock++, dummy.matrix);
      } else if (d.kind === 4) {
        if (iSand >= 28) continue;
        dummy.position.set(d.bx, 0.03, z); dummy.rotation.set(-Math.PI / 2, 0, d.rot); dummy.scale.setScalar(d.s);
        dummy.updateMatrix(); decoSand.setMatrixAt(iSand++, dummy.matrix);
      } else if (d.kind === 5) {
        if (iGlint >= 20) continue;
        dummy.position.set(d.bx, 0.04, z); dummy.rotation.set(-Math.PI / 2, 0, d.rot); dummy.scale.setScalar(d.s);
        dummy.updateMatrix(); decoGlint.setMatrixAt(iGlint++, dummy.matrix);
      }
    }
    decoBush.count = iBush; decoBush2.count = iBush2;
    decoFlowerP.count = Math.ceil(iFl / 3); decoFlowerY.count = Math.ceil(iFl / 3); decoFlowerV.count = Math.ceil(iFl / 3);
    decoTuft.count = iTuft; decoRock.count = iRock;
    for (const im of [decoBush, decoBush2, decoFlowerP, decoFlowerY, decoFlowerV, decoTuft, decoRock]) im.instanceMatrix.needsUpdate = true;

    /* landmarks */
    const flick = 1 + Math.sin(globalT * 11) * 0.16;
    LM_OFFS.forEach((off, li) => {
      const z = relZ(off);
      for (const sx of [-1, 1]) {
        const idx = li * 2 + (sx < 0 ? 0 : 1), x = sx * 6.1;
        dummy.rotation.set(0, 0, 0); dummy.scale.setScalar(1);
        dummy.position.set(x, 0, z); dummy.updateMatrix(); lmTorchPole.setMatrixAt(idx, dummy.matrix);
        dummy.scale.set(1, flick, 1); dummy.updateMatrix(); lmTorchFlame.setMatrixAt(idx, dummy.matrix);
        dummy.scale.setScalar(1);
        dummy.position.set(sx * 5.6, 0, z + 26); dummy.rotation.set(0, sx * 0.35, 0); dummy.updateMatrix();
        if (sx < 0) lmSignPost.setMatrixAt(li * 2, dummy.matrix); else lmSignPost.setMatrixAt(li * 2 + 1, dummy.matrix);
        dummy.updateMatrix();
        if (sx < 0) lmSignBoard.setMatrixAt(li * 2, dummy.matrix); else lmSignBoard.setMatrixAt(li * 2 + 1, dummy.matrix);
      }
      dummy.rotation.set(0, li * 1.3, 0); dummy.scale.setScalar(1);
      dummy.position.set(li === 0 ? -13.5 : 14.5, 0, z + 62); dummy.updateMatrix();
      lmHutWall.setMatrixAt(li, dummy.matrix); lmHutRoof.setMatrixAt(li, dummy.matrix);
      const stX = li === 0 ? 12.5 : -13;
      dummy.position.set(stX, 0, z + 118); dummy.updateMatrix();
      lmStatueBase.setMatrixAt(li, dummy.matrix); lmStatueBody.setMatrixAt(li, dummy.matrix); lmStatueHead.setMatrixAt(li, dummy.matrix);
      /* gold crescent emblem on the statue's chest, facing the track */
      dummy.position.set(stX + (stX > 0 ? -0.46 : 0.46), 1.62, z + 118);
      dummy.rotation.set(0, stX > 0 ? -Math.PI / 2 : Math.PI / 2, 2.4); dummy.scale.setScalar(1);
      dummy.updateMatrix(); lmStatueCres.setMatrixAt(li, dummy.matrix);
      dummy.rotation.set(0, li * 1.3, 0);
      const az = z + 168;
      dummy.rotation.set(0, 0, 0); dummy.scale.setScalar(1);
      dummy.position.set(-5.9, 0, az); dummy.updateMatrix(); lmArchPostL.setMatrixAt(li, dummy.matrix);
      dummy.position.set(5.9, 0, az); dummy.updateMatrix(); lmArchPostR.setMatrixAt(li, dummy.matrix);
      dummy.position.set(0, 4.35 + Math.sin(globalT * 2.2 + li * 2) * 0.07, az); dummy.updateMatrix(); lmArchCloth.setMatrixAt(li, dummy.matrix);
    });
    for (const im of [lmTorchPole, lmTorchFlame, lmSignPost, lmSignBoard, lmHutWall, lmHutRoof, lmStatueBase, lmStatueBody, lmStatueHead, lmArchPostL, lmArchPostR, lmArchCloth, lmStatueCres]) im.instanceMatrix.needsUpdate = true;

    /* branding: trackside billboards + start arch */
    {
      const vCount = [0, 0, 0];
      BB_SPOTS.forEach((b, bi2) => {
        const z = relZ(b.off), x = b.side * 8.6;
        dummy.rotation.set(0, b.side < 0 ? 0.22 : -0.22, 0); dummy.scale.setScalar(1);
        dummy.position.set(x - 1.9, 0, z); dummy.updateMatrix(); bbPostIM.setMatrixAt(bi2 * 2, dummy.matrix);
        dummy.position.set(x + 1.9, 0, z); dummy.updateMatrix(); bbPostIM.setMatrixAt(bi2 * 2 + 1, dummy.matrix);
        dummy.position.set(x, 0, z); dummy.updateMatrix(); bbBoardIMs[b.v].setMatrixAt(vCount[b.v]++, dummy.matrix);
      });
      bbPostIM.count = BB_SPOTS.length * 2; bbPostIM.instanceMatrix.needsUpdate = true;
      bbBoardIMs.forEach((im, vi) => { im.count = vCount[vi]; im.instanceMatrix.needsUpdate = true; });
      const sz = relZ(30);
      dummy.rotation.set(0, 0, 0); dummy.scale.setScalar(1);
      dummy.position.set(-5.5, 0, sz); dummy.updateMatrix(); startPostIM.setMatrixAt(0, dummy.matrix);
      dummy.position.set(5.5, 0, sz); dummy.updateMatrix(); startPostIM.setMatrixAt(1, dummy.matrix);
      dummy.position.set(0, 0, sz); dummy.updateMatrix(); startBoardIM.setMatrixAt(0, dummy.matrix);
      startPostIM.instanceMatrix.needsUpdate = true; startBoardIM.instanceMatrix.needsUpdate = true;
    }

    /* distant islands */
    for (const fi of farIsles) { fi.g.position.set(fi.x, 0, relZ(fi.off)); }

    /* birds: cross the sky, wrap around */
    for (let i = 0; i < birds.length; i++) {
      const b = birds[i];
      const bx = b.x0 + ((globalT * b.sp + i * 47) % 330);
      const by = b.y + Math.sin(globalT * 1.7 + b.ph) * 0.9;
      const flap = Math.sin(globalT * 7 + b.ph) * 0.65;
      dummy.position.set(bx, by, b.z); dummy.scale.setScalar(1);
      dummy.rotation.set(0, 0, flap); dummy.updateMatrix(); birdL.setMatrixAt(i, dummy.matrix);
      dummy.rotation.set(0, Math.PI, -flap); dummy.updateMatrix(); birdR.setMatrixAt(i, dummy.matrix);
    }
    birdL.instanceMatrix.needsUpdate = true; birdR.instanceMatrix.needsUpdate = true;

    /* pollen motes drifting around the runner (instanced spheres) */
    for (let i = 0; i < MOTE_N; i++) {
      const m = moteData[i];
      dummy.position.set(
        m.x + Math.sin(globalT * 0.7 + m.ph) * 0.8 + S.laneX * 0.4,
        m.y + Math.sin(globalT * m.dr + m.ph * 2) * 0.5,
        -((( -m.z + S.dist * 0.92) % 55 + 55) % 55) + 4);
      dummy.rotation.set(0, 0, 0);
      dummy.scale.setScalar(0.8 + 0.35 * Math.sin(globalT * 2 + m.ph * 3));
      dummy.updateMatrix(); motes.setMatrixAt(i, dummy.matrix);
    }
    motes.instanceMatrix.needsUpdate = true;

    /* beach foam at the water lines */
    let iFoam = 0;
    for (let sIdx = 0; sIdx < SECT_N; sIdx++) {
      const secZ = sections[sIdx].position.z - 7.5 + (sIdx % 3) * 9;
      for (const fx of [-18.6, 18.6]) {
        dummy.position.set(fx, 0.06, secZ); dummy.rotation.set(-Math.PI / 2, 0, 0);
        dummy.scale.set(1, 1 + 0.25 * Math.sin(globalT * 1.4 + sIdx * 1.7 + (fx > 0 ? 2 : 0)), 1);
        dummy.updateMatrix(); foamIM.setMatrixAt(iFoam++, dummy.matrix);
      }
    }
    foamIM.count = iFoam; foamIM.instanceMatrix.needsUpdate = true;
  }

  /* sky dome + sun follow the camera so the backdrop never ends */
  skyDome.position.set(camera.position.x, 6, camera.position.z - 120);
  sunSprite.position.set(camera.position.x - 70, 60, camera.position.z - 120);

  /* --- obstacles render --- */
  let bi = 0, si = 0, bai = 0, pi = 0, ri = 0;
  const maxOb = 80;
  for (const o of obstacles) {
    if (!o.active) continue;
    const rz = -(o.z - S.dist);
    if (rz > 12 || rz < -330) continue;
    const x = LANE_X[o.lane];
    if (o.kind === 'jump' && bi < 24) {
      dummy.rotation.set(0, 0, 0); dummy.scale.set(1, 1, 1);
      dummy.position.set(x, 0.55, rz); dummy.updateMatrix(); barrierIM.setMatrixAt(bi, dummy.matrix);
      dummy.position.set(x, 0.82, rz); dummy.updateMatrix(); stripeIM.setMatrixAt(si++, dummy.matrix);
      bi++;
    } else if (o.kind === 'roll' && bai < 24) {
      dummy.position.set(x - 1.0, 0, rz); dummy.rotation.set(0, 0, 0); dummy.scale.set(1, 1, 1); dummy.updateMatrix(); postIM.setMatrixAt(pi++, dummy.matrix);
      dummy.position.set(x + 1.0, 0, rz); dummy.updateMatrix(); postIM.setMatrixAt(pi++, dummy.matrix);
      dummy.rotation.set(0, 0, Math.PI / 2); dummy.position.set(x, 1.92, rz); dummy.updateMatrix(); barIM.setMatrixAt(bai++, dummy.matrix);
    } else if (o.kind === 'rock' && ri < 24) {
      dummy.position.set(x, 0.45, rz); dummy.rotation.set(o.z * 0.7, o.z * 1.3, 0); dummy.scale.set(1, 0.85, 1); dummy.updateMatrix(); rockIM.setMatrixAt(ri++, dummy.matrix);
    }
  }
  for (let i = bi; i < 24; i++) hideIM(barrierIM, i);
  for (let i = si; i < 24; i++) hideIM(stripeIM, i);
  for (let i = bai; i < 24; i++) hideIM(barIM, i);
  for (let i = pi; i < 48; i++) hideIM(postIM, i);
  for (let i = ri; i < 24; i++) hideIM(rockIM, i);
  barrierIM.instanceMatrix.needsUpdate = true; stripeIM.instanceMatrix.needsUpdate = true;
  barIM.instanceMatrix.needsUpdate = true; postIM.instanceMatrix.needsUpdate = true; rockIM.instanceMatrix.needsUpdate = true;

  /* --- pickups render --- */
  const spin = globalT * 3.2;
  for (let i = 0; i < COIN_N; i++) {
    const c = coins[i];
    if (!c.active) { hideIM(coinIM, i); continue; }
    dummy.position.set(c.x, c.y + Math.sin(globalT * 3 + i) * 0.07, -(c.z - S.dist));
    dummy.rotation.set(0, spin + i, 0); dummy.scale.setScalar(1);
    dummy.updateMatrix(); coinIM.setMatrixAt(i, dummy.matrix);
  }
  coinIM.instanceMatrix.needsUpdate = true;
  for (let i = 0; i < STAR_N; i++) {
    const s = stars[i];
    if (!s.active) { hideIM(starIM, i); continue; }
    dummy.position.set(s.x, s.y + Math.sin(globalT * 2.4 + i * 2) * 0.12, -(s.z - S.dist));
    dummy.rotation.set(0, -spin * 0.8 + i, 0); dummy.scale.setScalar(1.15);
    dummy.updateMatrix(); starIM.setMatrixAt(i, dummy.matrix);
  }
  starIM.instanceMatrix.needsUpdate = true;
  for (let i = 0; i < SCAT_N; i++) {
    const s = scats[i];
    if (!s.active) { hideIM(scatIM, i); continue; }
    dummy.position.set(s.x, s.y, s.z); // s.z is hero-relative (spawned behind, drifts +z)
    dummy.rotation.set(0, s.spin, 0); dummy.scale.setScalar(0.9);
    dummy.updateMatrix(); scatIM.setMatrixAt(i, dummy.matrix);
  }
  scatIM.instanceMatrix.needsUpdate = true;

  /* --- loop placement --- */
  if (loopGroup.visible) {
    const lz = S.nextLoopAt;
    loopGroup.position.z = S.loop ? -(S.loop.z - S.dist) : -(lz - S.dist);
    if (!S.loop && S.dist > lz + 30) loopGroup.visible = false;
    if (S.loop) loopGroup.position.z = 0;
  }

  /* --- hero placement & animation --- */
  const runPhase = globalT * (7 + S.speed * 0.52); // stride rate per m/s held ~constant
  if (S.loop) {
    const th = S.loop.theta;
    const cx = S.laneX * 0.3, cy = LOOP_R - Math.cos(th) * LOOP_R, cz = -Math.sin(th) * LOOP_R;
    H.group.position.set(cx, cy, cz);
    H.ballG.rotation.x = -th * 1.6;
    H.ballG.rotation.z = S.laneX * -0.12;
  } else {
    H.group.position.set(S.laneX, S.y, 0);
    H.group.rotation.z = (LANE_X[S.lane] - S.laneX) * -0.14;
    H.group.rotation.x = S.grounded ? THREE.MathUtils.clamp(S.speed * 0.006, 0, 0.14) : -0.12;
    // limbs
    const sw = S.grounded && S.mode === 'run' ? Math.sin(runPhase) : 0;
    const amp = S.grounded ? 0.85 : 0.25;
    if (S.rollT > 0) { // tucked sprint
      H.legL.rotation.x = 0.9; H.legR.rotation.x = 0.5; H.armL.rotation.x = -1.4; H.armR.rotation.x = -1.1;
    } else if (!S.grounded) {
      H.legL.rotation.x = -0.7; H.legR.rotation.x = 0.55; H.armL.rotation.x = -2.4; H.armR.rotation.x = -2.0;
    } else {
      H.legL.rotation.x = sw * amp; H.legR.rotation.x = -sw * amp;
      H.armL.rotation.x = -sw * amp * 0.8; H.armR.rotation.x = sw * amp * 0.8;
    }
    H.bodyG.position.y = S.grounded && S.mode === 'run' ? Math.abs(Math.sin(runPhase)) * 0.07 : 0;
    H.bodyG.rotation.x = S.rollT > 0 ? 0.35 : 0;
    H.tailG.rotation.x = -0.25 - (S.speed / SPEED_MAX) * 0.5 + Math.sin(globalT * 7) * 0.07;
    H.tailG.rotation.y = Math.sin(globalT * 2.6) * 0.16;
    H.earL.rotation.x = -0.3 - (S.speed / SPEED_MAX) * 0.35;
    H.earR.rotation.x = -0.3 - (S.speed / SPEED_MAX) * 0.35;
    H.scarfTail.rotation.x = 0.5 + (S.speed / SPEED_MAX) * 0.7 + Math.sin(globalT * 9) * 0.12;
    H.headG.rotation.y = (LANE_X[S.lane] - S.laneX) * -0.2;
    // hurt flicker
    const flick = S.invulnT > 0 && ((globalT * 14) | 0) % 2 === 0;
    H.bodyG.visible = !flick && !S.loop;
  }
  H.group.visible = true;

  /* --- camera --- */
  const speedT = THREE.MathUtils.clamp((S.speed - SPEED0) / (SPEED_MAX - SPEED0), 0, 1);
  let camTX = S.laneX * 0.55, camTY = 5.4 + S.y * 0.32, camTZ = 9.6 - speedT * 0.9;
  let lookY = 1.1 + S.y * 0.3, lookZ = -12;
  let fovT = 66 + speedT * 10;
  if (S.loop) {
    const th = S.loop.theta;
    camTX = S.laneX * 0.3; camTY = LOOP_R - Math.cos(th) * (LOOP_R + 4.6); camTZ = -Math.sin(th) * (LOOP_R + 4.6);
    lookY = LOOP_R - Math.cos(th + 0.5) * LOOP_R; lookZ = -Math.sin(th + 0.5) * LOOP_R;
    fovT = 74;
    camera.up.set(Math.sin(th), Math.cos(th), 0);
  } else {
    camera.up.set(0, 1, 0);
  }
  if (S.mode === 'menu') { // slow menu orbit drift
    camTX = Math.sin(globalT * 0.24) * 3.2; camTY = 3.6; camTZ = 8.6; lookY = 1.0; lookZ = -6; fovT = 60;
  }
  const lerpK = Math.min(1, rawDt * 5.5);
  camera.position.x += (camTX - camera.position.x) * lerpK;
  camera.position.y += (camTY - camera.position.y) * (S.loop ? 1 : lerpK);
  camera.position.z += (camTZ - camera.position.z) * (S.loop ? 1 : lerpK);
  if (S.hitFlash > 0) camShake = Math.max(camShake, 0.12);
  if (camShake > 0.001) {
    camera.position.x += (Math.random() - 0.5) * camShake;
    camera.position.y += (Math.random() - 0.5) * camShake;
    camShake *= Math.pow(0.001, rawDt * 2.2);
  }
  camera.lookAt(camera.position.x * 0.72, lookY, lookZ);
  if (Math.abs(camera.fov - fovT) > 0.05) { camera.fov += (fovT - camera.fov) * Math.min(1, rawDt * 3); camera.updateProjectionMatrix(); }

  /* --- streaks --- */
  {
    const op = S.mode === 'run' ? THREE.MathUtils.clamp((S.speed - 16) / 9, 0, 1) * 0.3 : 0;
    streaks.lines.material.opacity += (op - streaks.lines.material.opacity) * Math.min(1, rawDt * 4);
    const pos = streaks.pos;
    for (let i = 0; i < streaks.length; i++) {
      const st = streaks[i];
      st.z += (S.speed + 26) * rawDt * (S.mode === 'run' ? 1 : 0.25);
      if (st.z > 6) { st.z = -60 - Math.random() * 20; st.x = (Math.random() - 0.5) * 16; st.y = 0.5 + Math.random() * 5; }
      const j = i * 6;
      pos[j] = st.x; pos[j + 1] = st.y; pos[j + 2] = st.z;
      pos[j + 3] = st.x; pos[j + 4] = st.y; pos[j + 5] = st.z + st.len * (0.5 + speedT);
    }
    streaks.lines.geometry.attributes.position.needsUpdate = true;
    streaks.lines.position.x = camera.position.x * 0.9;
  }

  /* --- water shimmer --- */
  waterTex.offset.y -= rawDt * 0.02;
  grassTex.offset.y = dirtTex.offset.y = 0; // static; sections scroll instead

  /* --- wind audio follows speed --- */
  if (AU.ctx && AU.windGain) {
    const target = S.mode === 'run' ? THREE.MathUtils.clamp((S.speed - 12) / 14, 0, 1) * 0.16 : 0;
    AU.windGain.gain.setTargetAtTime(S.muted ? 0 : target, AU.ctx.currentTime, 0.15);
    AU.windFilter.frequency.setTargetAtTime(350 + speedT * 750, AU.ctx.currentTime, 0.2);
  }
  /* hit red flash: tint the sky dome (scene.background is the dome now) */
  skyDome.material.color.setHex(S.hitFlash > 0 ? 0xe88a8a : 0xffffff);

  renderer.render(scene, camera);
}

function fitViewport() {
  const { w, h } = viewSize();
  if (!w || !h) return;
  camera.aspect = w / h;
  camera.updateProjectionMatrix();
  renderer.setSize(w, h, false);
}
addEventListener('resize', fitViewport);
addEventListener('orientationchange', fitViewport);
if (window.visualViewport) {
  visualViewport.addEventListener('resize', fitViewport);
  visualViewport.addEventListener('scroll', fitViewport);
}

/* menu idle state: world slowly scrolls */
setInterval(() => { if (S.mode === 'menu') { S.dist += 0.14; } }, 50);

applyLang();
updateHUD();
$('muteBtn').textContent = S.muted ? '🔇' : '🔊';
try { $('nameInput').value = localStorage.getItem('luncRush3dName') || ''; } catch (e) {}
animate();

/* QA hook (used by automated checks; harmless in production) */
window.__rush3d = { S, startRun, H, THREE, scene, camera, renderer, stick, stickZone };
