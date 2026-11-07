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
const OB_SPACING = 45;        // nominal metres between obstacle rows
const SPEED0 = 13, SPEED_MAX = 25, SPEED_RAMP = 0.055; // m/s
const GRAV = 34, JUMP_V = 12.5;
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
renderer.setSize(innerWidth, innerHeight);
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.08;
container.appendChild(renderer.domElement);

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x69b7ff);
scene.fog = new THREE.Fog(0x9fd4ff, 90, 430);

const camera = new THREE.PerspectiveCamera(66, innerWidth / innerHeight, 0.1, 1200);
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
const grassTex = canvasTex(256, 256, (g, w, h) => {
  g.fillStyle = '#43a047'; g.fillRect(0, 0, w, h);
  for (let i = 0; i < 900; i++) {
    g.fillStyle = `rgba(${20 + Math.random() * 40 | 0},${110 + Math.random() * 60 | 0},40,0.25)`;
    g.fillRect(Math.random() * w, Math.random() * h, 2, 3 + Math.random() * 4);
  }
}, 1, 15);
const dirtTex = canvasTex(256, 256, (g, w, h) => {
  g.fillStyle = '#b98d5f'; g.fillRect(0, 0, w, h);
  g.fillStyle = '#a87c4f';
  for (let i = 0; i < 8; i++) for (let j = 0; j < 8; j++)
    if ((i + j) % 2 === 0) g.fillRect(i * 32, j * 32, 32, 32);
  g.fillStyle = 'rgba(90,60,30,0.35)';
  for (let i = 0; i < 260; i++) g.fillRect(Math.random() * w, Math.random() * h, 3, 3);
  g.fillStyle = 'rgba(255,240,200,0.20)';
  for (let i = 0; i < 160; i++) g.fillRect(Math.random() * w, Math.random() * h, 2, 2);
}, 2, 15);
const cliffTex = canvasTex(256, 256, (g, w, h) => {
  g.fillStyle = '#c8b8a2'; g.fillRect(0, 0, w, h);
  for (let i = 0; i < 8; i++) for (let j = 0; j < 8; j++)
    if ((i + j) % 2 === 0) { g.fillStyle = '#b39d7f'; g.fillRect(i * 32, j * 32, 32, 32); }
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
const waterTex = canvasTex(256, 256, (g, w, h) => {
  g.fillStyle = '#1b9ad6'; g.fillRect(0, 0, w, h);
  g.strokeStyle = 'rgba(255,255,255,0.35)'; g.lineWidth = 2;
  for (let i = 0; i < 26; i++) {
    g.beginPath(); const y = Math.random() * h; g.moveTo(Math.random() * w, y);
    g.bezierCurveTo(Math.random() * w, y - 6, Math.random() * w, y + 6, Math.random() * w, y); g.stroke();
  }
  g.fillStyle = 'rgba(140,225,255,0.5)';
  for (let i = 0; i < 120; i++) g.fillRect(Math.random() * w, Math.random() * h, 3, 1);
}, 8, 60);
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
  sand: new THREE.MeshLambertMaterial({ color: 0xead9a0 }),
  cliff: new THREE.MeshLambertMaterial({ map: cliffTex }),
  water: new THREE.MeshPhongMaterial({ map: waterTex, shininess: 90, color: 0xbfeaff }),
  bark: new THREE.MeshLambertMaterial({ map: barkTex }),
  leaf: new THREE.MeshLambertMaterial({ color: 0x2f9e44 }),
  leaf2: new THREE.MeshLambertMaterial({ color: 0x37b24d }),
  gold: new THREE.MeshPhongMaterial({ color: 0xffc93d, emissive: 0xcf8a00, emissiveIntensity: 0.55, shininess: 90 }),
  goldDark: new THREE.MeshPhongMaterial({ color: 0xe8a90c, emissive: 0x9a6a00, emissiveIntensity: 0.4, shininess: 70 }),
  ustc: new THREE.MeshPhongMaterial({ color: 0x4da3ff, emissive: 0x1d5fd0, emissiveIntensity: 0.9, shininess: 90 }),
  rock: new THREE.MeshLambertMaterial({ color: 0x9a8f80 }),
  red: new THREE.MeshPhongMaterial({ color: 0xe03131, emissive: 0x700000, emissiveIntensity: 0.35, shininess: 40 }),
  white: new THREE.MeshPhongMaterial({ color: 0xf5f5f5, shininess: 30 }),
  orange: new THREE.MeshPhongMaterial({ color: 0xf07f13, shininess: 35 }),
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
  const hillL = new THREE.Mesh(secGeo, M.grass); hillL.scale.set(16, 5, SECT_LEN); hillL.position.set(-20, 1.6, 0); g.add(hillL);
  const hillR = hillL.clone(); hillR.position.x = 20; g.add(hillR);
  g.userData.baseZ = 0;
  world.add(g);
  return g;
}
for (let i = 0; i < SECT_N; i++) {
  const s = makeSection(); s.userData.baseZ = i * SECT_LEN; sections.push(s);
}

/* palms (instanced) */
const PALMS_PER_SEC = 4, PALM_N = SECT_N * PALMS_PER_SEC;
const trunkGeo = new THREE.CylinderGeometry(0.14, 0.24, 3.4, 6); trunkGeo.translate(0, 1.7, 0);
const frondGeo = new THREE.ConeGeometry(1.9, 0.8, 7); frondGeo.translate(0, 3.55, 0);
const trunkIM = new THREE.InstancedMesh(trunkGeo, M.bark, PALM_N);
const frondIM = new THREE.InstancedMesh(frondGeo, M.leaf, PALM_N);
const frond2IM = new THREE.InstancedMesh(frondGeo, M.leaf2, PALM_N);
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
  new THREE.MeshBasicMaterial({ map: cloudTex, transparent: true, depthWrite: false, fog: false }), 14);
cloudIM.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
scene.add(cloudIM);
const cloudData = [];
for (let i = 0; i < 14; i++) cloudData.push({ x: (Math.random() - 0.5) * 320, y: 34 + Math.random() * 30, off: -Math.random() * 480, s: 0.7 + Math.random() * 1.1 });

/* sun billboard glow */
const sunSprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: cloudTex, color: 0xffe9a0, transparent: true, opacity: 0.9, fog: false, depthWrite: false }));
sunSprite.scale.set(90, 45, 1); sunSprite.position.set(-70, 60, -260); scene.add(sunSprite);

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
  const tube = new THREE.Mesh(new THREE.TorusGeometry(LOOP_R, 0.55, 10, 44), M.goldDark);
  tube.position.y = LOOP_R; loopGroup.add(tube);
  const tubeIn = new THREE.Mesh(new THREE.TorusGeometry(LOOP_R, 0.2, 8, 44), M.gold);
  tubeIn.position.y = LOOP_R; loopGroup.add(tubeIn);
  const postGeo = new THREE.BoxGeometry(0.5, LOOP_R, 0.5);
  for (const sx of [-1, 1]) {
    const p = new THREE.Mesh(postGeo, M.ink);
    p.position.set(sx * LOOP_R * 0.7, LOOP_R / 2, 0);
    p.rotation.z = sx * 0.45;
    loopGroup.add(p);
  }
  const banner = new THREE.Mesh(new THREE.BoxGeometry(10.5, 1.1, 0.3), M.teal);
  banner.position.set(0, LOOP_R * 2 + 1.15, 0); loopGroup.add(banner);
  const archL = new THREE.Mesh(new THREE.BoxGeometry(0.45, 3.4, 0.45), M.ink); archL.position.set(-5.2, 1.7, 0); loopGroup.add(archL);
  const archR = archL.clone(); archR.position.x = 5.2; loopGroup.add(archR);
  const archT = new THREE.Mesh(new THREE.BoxGeometry(10.9, 0.45, 0.45), M.ink); archT.position.set(0, 3.4, 0); loopGroup.add(archT);
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
  const lines = new THREE.LineSegments(g, new THREE.LineBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0 }));
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
const hud = $('hud'), touchUI = $('touchUI');
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
  nextObZ = z + OB_SPACING * (0.82 + Math.random() * 0.4) - Math.min(9, S.dist * 0.002);
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
  showBanner(T('go'), T('swipeHint'), 1200);
}
function endRun() {
  S.mode = 'over';
  hud.classList.add('hidden'); touchUI.classList.add('hidden');
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
$('quitBtn').addEventListener('click', () => { $('pausePanel').classList.add('hidden'); $('overPanel').classList.add('hidden'); hud.classList.add('hidden'); touchUI.classList.add('hidden'); $('menu').classList.remove('hidden'); S.mode = 'menu'; });
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
bindBtn('btnLeft', doLeft); bindBtn('btnRight', doRight);
bindBtn('btnJump', doJump); bindBtn('btnRoll', doRoll);

let tsX = 0, tsY = 0, tsT = 0;
addEventListener('touchstart', e => {
  if (e.target.closest('button,select,input,.panel')) return;
  const t = e.changedTouches[0]; tsX = t.clientX; tsY = t.clientY; tsT = performance.now();
}, { passive: true });
addEventListener('touchend', e => {
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
    if (!S.loop) S.speed = Math.min(SPEED_MAX, SPEED0 + S.dist * SPEED_RAMP * 0.14 + S.runTime * 0.055);
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
  const runPhase = globalT * (9 + S.speed * 0.55);
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
    const op = S.mode === 'run' ? THREE.MathUtils.clamp((S.speed - 16) / 9, 0, 1) * 0.55 : 0;
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
  /* hit red flash via scene fog tint */
  if (S.hitFlash > 0) { scene.background.setHex(0xd96a6a); } else { scene.background.setHex(0x69b7ff); }

  renderer.render(scene, camera);
}

addEventListener('resize', () => {
  camera.aspect = innerWidth / innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(innerWidth, innerHeight);
});

/* menu idle state: world slowly scrolls */
setInterval(() => { if (S.mode === 'menu') { S.dist += 0.14; } }, 50);

applyLang();
updateHUD();
$('muteBtn').textContent = S.muted ? '🔇' : '🔊';
try { $('nameInput').value = localStorage.getItem('luncRush3dName') || ''; } catch (e) {}
animate();

/* QA hook (used by automated checks; harmless in production) */
window.__rush3d = { S, startRun, H, THREE, scene, camera, renderer };
