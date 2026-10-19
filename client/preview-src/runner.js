/* NEON RUNNER — Season 2 sample preview. Standalone, no server, no points.
   Three.js endless runner: 3 lanes, swipe/tap/keys, jump barriers, slide
   signs, dodge blocks, collect coin arcs. World scrolls toward the player. */
import * as THREE from 'three';

const LANES = [-2.2, 0, 2.2];
const $ = (id) => document.getElementById(id);

function createRenderer() {
  const attempts = [
    { antialias: true, powerPreference: 'high-performance' },
    { antialias: true },
    { antialias: false, powerPreference: 'low-power' },
  ];
  let lastErr = null;
  for (const opts of attempts) {
    try {
      const r = new THREE.WebGLRenderer(opts);
      r.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
      return r;
    } catch (e) { lastErr = e; }
  }
  throw lastErr || new Error('WebGL unavailable');
}

let renderer;
try {
  renderer = createRenderer();
} catch (e) {
  $('glfail').style.display = 'flex';
  throw e;
}
$('stage').appendChild(renderer.domElement);

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x05070f);
scene.fog = new THREE.Fog(0x05070f, 24, 112);

const camera = new THREE.PerspectiveCamera(62, 1, 0.1, 220);
camera.position.set(0, 4.7, 7.6);
camera.lookAt(0, 1.1, -12);

scene.add(new THREE.HemisphereLight(0x8fb7ff, 0x0a0618, 1.1));
const key = new THREE.DirectionalLight(0xbfd4ff, 0.7);
key.position.set(4, 10, 6);
scene.add(key);
const glow = new THREE.PointLight(0x22d3ee, 18, 26);
glow.position.set(0, 3.2, 2);
scene.add(glow);

/* ---------- road with scrolling canvas texture ---------- */
function roadTexture() {
  const c = document.createElement('canvas'); c.width = 256; c.height = 256;
  const g = c.getContext('2d');
  g.fillStyle = '#0b0e1a'; g.fillRect(0, 0, 256, 256);
  for (let i = 0; i < 500; i++) {
    g.fillStyle = `rgba(255,255,255,${Math.random() * 0.05})`;
    g.fillRect(Math.random() * 256, Math.random() * 256, 2, 2);
  }
  // neon edge strips
  g.fillStyle = '#22d3ee'; g.fillRect(6, 0, 5, 256);
  g.fillStyle = '#e879f9'; g.fillRect(245, 0, 5, 256);
  // lane dividers (dashed)
  g.fillStyle = '#67e8f9';
  g.fillRect(82, 10, 5, 110); g.fillRect(169, 10, 5, 110);
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(1, 26);
  return t;
}
const roadTex = roadTexture();
const road = new THREE.Mesh(
  new THREE.PlaneGeometry(10.6, 260),
  new THREE.MeshStandardMaterial({ map: roadTex, roughness: 0.9, metalness: 0.1 })
);
road.rotation.x = -Math.PI / 2;
road.position.z = -110;
scene.add(road);

/* ---------- buildings (recycled) ---------- */
function facadeTexture(base, lit) {
  const c = document.createElement('canvas'); c.width = 128; c.height = 256;
  const g = c.getContext('2d');
  g.fillStyle = base; g.fillRect(0, 0, 128, 256);
  for (let y = 12; y < 240; y += 22) for (let x = 10; x < 118; x += 20) {
    g.fillStyle = Math.random() < 0.55 ? lit : 'rgba(20,26,48,0.9)';
    g.fillRect(x, y, 12, 14);
  }
  return new THREE.CanvasTexture(c);
}
const facades = [
  facadeTexture('#0d1230', '#67e8f9'), facadeTexture('#120d2e', '#f0abfc'),
  facadeTexture('#0a1428', '#fbbf24'), facadeTexture('#101024', '#93c5fd'),
];
const buildings = [];
{
  const geo = new THREE.BoxGeometry(1, 1, 1);
  for (let side = -1; side <= 1; side += 2) {
    for (let i = 0; i < 13; i++) {
      const h = 7 + Math.random() * 15;
      const m = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({
        map: facades[(Math.random() * facades.length) | 0], roughness: 0.85,
      }));
      m.scale.set(6 + Math.random() * 3, h, 5);
      m.position.set(side * (8.1 + Math.random() * 1.2), h / 2, 8 - i * 11);
      scene.add(m); buildings.push(m);
    }
  }
}

/* ---------- player ---------- */
function capsule(r, len, color, emissive = 0x000000, ei = 0) {
  const m = new THREE.Mesh(
    new THREE.CapsuleGeometry(r, len, 4, 10),
    new THREE.MeshStandardMaterial({ color, roughness: 0.55, emissive, emissiveIntensity: ei })
  );
  return m;
}
const player = new THREE.Group();
const bodyG = new THREE.Group(); player.add(bodyG);
const torso = capsule(0.33, 0.55, 0x111827); torso.position.y = 1.12; bodyG.add(torso);
const stripe = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.62, 0.05),
  new THREE.MeshStandardMaterial({ color: 0x22d3ee, emissive: 0x22d3ee, emissiveIntensity: 1.6 }));
stripe.position.set(0, 1.14, -0.33); bodyG.add(stripe);
const pack = new THREE.Mesh(new THREE.BoxGeometry(0.44, 0.56, 0.2),
  new THREE.MeshStandardMaterial({ color: 0x1f2937, roughness: 0.6 }));
pack.position.set(0, 1.16, 0.36); bodyG.add(pack);
const packGlow = new THREE.Mesh(new THREE.BoxGeometry(0.26, 0.3, 0.03),
  new THREE.MeshStandardMaterial({ color: 0x22d3ee, emissive: 0x22d3ee, emissiveIntensity: 2 }));
packGlow.position.set(0, 1.18, 0.47); bodyG.add(packGlow);
const head = new THREE.Mesh(new THREE.SphereGeometry(0.24, 18, 14),
  new THREE.MeshStandardMaterial({ color: 0x0f172a, roughness: 0.4 }));
head.position.y = 1.78; bodyG.add(head);
const visor = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.09, 0.06),
  new THREE.MeshStandardMaterial({ color: 0x22d3ee, emissive: 0x22d3ee, emissiveIntensity: 2 }));
visor.position.set(0, 1.8, -0.21); bodyG.add(visor);
function limb(x, y, r, len, color) {
  const g = new THREE.Group(); g.position.set(x, y, 0);
  const m = capsule(r, len, color); m.position.y = -len / 2 - r; g.add(m);
  bodyG.add(g); return g;
}
const armL = limb(-0.45, 1.42, 0.09, 0.42, 0x111827);
const armR = limb(0.45, 1.42, 0.09, 0.42, 0x111827);
const legL = limb(-0.17, 0.82, 0.11, 0.5, 0x0b1120);
const legR = limb(0.17, 0.82, 0.11, 0.5, 0x0b1120);
scene.add(player);

/* ---------- obstacles & coins ---------- */
function stripesTexture() {
  const c = document.createElement('canvas'); c.width = 128; c.height = 32;
  const g = c.getContext('2d');
  g.fillStyle = '#1e1b4b'; g.fillRect(0, 0, 128, 32);
  g.fillStyle = '#facc15';
  for (let x = -32; x < 128; x += 32) { g.beginPath(); g.moveTo(x, 32); g.lineTo(x + 16, 0); g.lineTo(x + 32, 0); g.lineTo(x + 16, 32); g.fill(); }
  return new THREE.CanvasTexture(c);
}
const stripeTex = stripesTexture();
function makeBarrier() {
  const g = new THREE.Group();
  const box = new THREE.Mesh(new THREE.BoxGeometry(2.0, 0.85, 0.35),
    new THREE.MeshStandardMaterial({ map: stripeTex, roughness: 0.6 }));
  box.position.y = 0.44; g.add(box);
  const edge = new THREE.Mesh(new THREE.BoxGeometry(2.04, 0.1, 0.39),
    new THREE.MeshStandardMaterial({ color: 0xa855f7, emissive: 0xa855f7, emissiveIntensity: 1.4 }));
  edge.position.y = 0.9; g.add(edge);
  g.userData.type = 'barrier'; return g;
}
function makeSign() {
  const g = new THREE.Group();
  const bar = new THREE.Mesh(new THREE.BoxGeometry(2.0, 0.8, 0.3),
    new THREE.MeshStandardMaterial({ color: 0x312e81, emissive: 0x6366f1, emissiveIntensity: 0.35, roughness: 0.5 }));
  bar.position.y = 1.95; g.add(bar);
  const strip = new THREE.Mesh(new THREE.BoxGeometry(2.0, 0.12, 0.32),
    new THREE.MeshStandardMaterial({ color: 0x22d3ee, emissive: 0x22d3ee, emissiveIntensity: 1.8 }));
  strip.position.y = 1.6; g.add(strip);
  for (const s of [-0.95, 0.95]) {
    const post = new THREE.Mesh(new THREE.BoxGeometry(0.09, 2.3, 0.09),
      new THREE.MeshStandardMaterial({ color: 0x334155, roughness: 0.6 }));
    post.position.set(s, 1.15, 0); g.add(post);
  }
  g.userData.type = 'sign'; return g;
}
function makeBlock() {
  const g = new THREE.Group();
  const box = new THREE.Mesh(new THREE.BoxGeometry(2.0, 2.3, 0.8),
    new THREE.MeshStandardMaterial({ color: 0x1e293b, roughness: 0.7 }));
  box.position.y = 1.15; g.add(box);
  const face = new THREE.Mesh(new THREE.BoxGeometry(1.7, 1.9, 0.05),
    new THREE.MeshStandardMaterial({ color: 0xef4444, emissive: 0xef4444, emissiveIntensity: 0.55 }));
  face.position.set(0, 1.15, 0.43); g.add(face);
  g.userData.type = 'block'; return g;
}
const coinGeo = new THREE.CylinderGeometry(0.34, 0.34, 0.09, 20);
const coinMat = new THREE.MeshStandardMaterial({ color: 0xfbbf24, emissive: 0xf59e0b, emissiveIntensity: 0.7, metalness: 0.7, roughness: 0.25 });
function makeCoin() {
  const m = new THREE.Mesh(coinGeo, coinMat);
  m.rotation.x = Math.PI / 2; m.userData.type = 'coin'; return m;
}

const obstacles = []; const coins = [];
const makers = { barrier: makeBarrier, sign: makeSign, block: makeBlock };
function spawnObstacle(type, lane, z) {
  const o = makers[type](); o.position.set(LANES[lane], 0, z);
  o.userData.lane = lane; scene.add(o); obstacles.push(o);
}
function spawnCoin(x, y, z) {
  const c = makeCoin(); c.position.set(x, y, z); scene.add(c); coins.push(c);
}
function spawnPattern(z) {
  const r = Math.random();
  if (r < 0.30) {
    // coin line in a random lane
    const lane = (Math.random() * 3) | 0;
    for (let i = 0; i < 5; i++) spawnCoin(LANES[lane], 0.95, z - i * 1.7);
    return;
  }
  // obstacles: block 1 or 2 lanes, never all 3
  const lanes = [0, 1, 2].sort(() => Math.random() - 0.5);
  const count = Math.random() < 0.38 ? 2 : 1;
  const types = ['barrier', 'sign', 'block'];
  for (let i = 0; i < count; i++) {
    const type = types[(Math.random() * 3) | 0];
    spawnObstacle(type, lanes[i], z);
    if (type === 'barrier' && Math.random() < 0.6) {
      // coin arc over the barrier
      for (let k = 0; k < 5; k++) {
        const t = k / 4;
        spawnCoin(LANES[lanes[i]], 0.7 + Math.sin(t * Math.PI) * 1.15, z + 1.8 - t * 3.6);
      }
    }
  }
  if (count === 1 && Math.random() < 0.5) {
    const free = lanes[1];
    for (let i = 0; i < 4; i++) spawnCoin(LANES[free], 0.95, z - i * 1.7);
  }
}

/* ---------- game state ---------- */
let mode = 'ready'; // ready | run | over
let lane = 1, playerY = 0, vy = 0, sliding = 0, runPhase = 0;
let speed = 0, distance = 0, coinCount = 0, score = 0;
let nextSpawn = 30, elapsed = 0;
let best = +(localStorage.getItem('neonRunnerBest') || 0);

function reset() {
  for (const o of obstacles) scene.remove(o);
  for (const c of coins) scene.remove(c);
  obstacles.length = 0; coins.length = 0;
  lane = 1; playerY = 0; vy = 0; sliding = 0;
  speed = 15; distance = 0; coinCount = 0; score = 0; nextSpawn = 26; elapsed = 0;
  player.position.set(0, 0, 0); bodyG.rotation.set(0, 0, 0); bodyG.scale.set(1, 1, 1);
}
function start() {
  reset(); mode = 'run';
  $('startCard').style.display = 'none';
  $('overCard').style.display = 'none';
}
function crash() {
  mode = 'over';
  if (score > best) { best = score; localStorage.setItem('neonRunnerBest', String(best)); }
  $('finalScore').textContent = score.toLocaleString();
  $('finalCoins').textContent = coinCount;
  $('finalDist').textContent = Math.floor(distance) + 'm';
  $('bestLine').textContent = 'Best: ' + best.toLocaleString();
  $('overCard').style.display = 'flex';
  $('flash').style.opacity = '1';
  setTimeout(() => { $('flash').style.opacity = '0'; }, 130);
}
function move(dir) { if (mode === 'run') lane = Math.max(0, Math.min(2, lane + dir)); }
function jump() {
  if (mode === 'run' && playerY <= 0.001) { vy = 9.4; sliding = 0; }
}
function slide() {
  if (mode === 'run' && playerY <= 0.001) sliding = 0.68;
  else if (mode === 'run') vy = Math.min(vy, -14); // slam down
}

/* ---------- input ---------- */
let touchX = null, touchY = null;
window.addEventListener('touchstart', (e) => {
  const t = e.changedTouches[0]; touchX = t.clientX; touchY = t.clientY;
}, { passive: true });
window.addEventListener('touchend', (e) => {
  if (touchX === null) return;
  const t = e.changedTouches[0];
  const dx = t.clientX - touchX, dy = t.clientY - touchY;
  touchX = touchY = null;
  if (mode !== 'run') return;
  if (Math.abs(dx) < 24 && Math.abs(dy) < 24) return;
  if (Math.abs(dx) > Math.abs(dy)) move(dx > 0 ? 1 : -1);
  else if (dy < 0) jump(); else slide();
}, { passive: true });
window.addEventListener('keydown', (e) => {
  if (e.key === 'ArrowLeft' || e.key === 'a') move(-1);
  else if (e.key === 'ArrowRight' || e.key === 'd') move(1);
  else if (e.key === 'ArrowUp' || e.key === 'w' || e.key === ' ') { e.preventDefault(); jump(); }
  else if (e.key === 'ArrowDown' || e.key === 's') slide();
});
$('btnL').addEventListener('click', () => move(-1));
$('btnR').addEventListener('click', () => move(1));
$('btnJ').addEventListener('click', jump);
$('btnS').addEventListener('click', slide);
$('startBtn').addEventListener('click', start);
$('againBtn').addEventListener('click', start);

/* ---------- HUD ---------- */
function hud() {
  $('hudScore').textContent = score.toLocaleString();
  $('hudCoins').textContent = coinCount;
  $('hudDist').textContent = Math.floor(distance) + 'm';
}

/* ---------- main loop ---------- */
const clock = new THREE.Clock();
function resize() {
  const w = window.innerWidth, h = window.innerHeight;
  renderer.setSize(w, h);
  camera.aspect = w / h; camera.updateProjectionMatrix();
}
window.addEventListener('resize', resize);
resize();

function tick() {
  requestAnimationFrame(tick);
  const dt = Math.min(clock.getDelta(), 0.05);
  const running = mode === 'run';
  const idleSpeed = mode === 'ready' ? 4 : 0;
  const v = running ? speed : idleSpeed;

  if (running) {
    elapsed += dt;
    speed = Math.min(36, 15 + elapsed * 0.28);
    distance += v * dt;
    score = Math.floor(distance) + coinCount * 25;
    nextSpawn -= v * dt;
    if (nextSpawn <= 0) { spawnPattern(-118); nextSpawn = 15 + Math.random() * 8 - Math.min(5, elapsed * 0.03); }
    hud();
  }
  roadTex.offset.y += (v * dt) / 10;

  // buildings recycle
  for (const b of buildings) {
    b.position.z += v * dt;
    if (b.position.z > 16) b.position.z -= 143;
  }

  // player motion
  const targetX = LANES[lane];
  player.position.x += (targetX - player.position.x) * Math.min(1, dt * 11);
  if (running) {
    if (playerY > 0 || vy > 0) {
      vy -= 27 * dt; playerY += vy * dt;
      if (playerY <= 0) { playerY = 0; vy = 0; }
    }
    if (sliding > 0) sliding -= dt;
  }
  player.position.y = playerY;
  const slidingNow = sliding > 0 && playerY <= 0.001;
  bodyG.scale.y = slidingNow ? 0.52 : 1;
  bodyG.position.y = slidingNow ? -0.18 : 0;
  bodyG.rotation.x = slidingNow ? 0.5 : (playerY > 0 ? -0.12 : 0);
  bodyG.rotation.z = (LANES[lane] - player.position.x) * -0.14;

  // run cycle
  runPhase += dt * (4 + v * 0.55);
  const sw = playerY > 0 ? 0.25 : Math.sin(runPhase) * 0.75;
  legL.rotation.x = sw; legR.rotation.x = -sw;
  armL.rotation.x = -sw * 0.85; armR.rotation.x = sw * 0.85;
  if (playerY > 0) { legL.rotation.x = 0.55; legR.rotation.x = -0.3; }
  bodyG.position.y += Math.abs(Math.sin(runPhase)) * 0.05 * (playerY > 0 ? 0 : 1);

  // obstacles
  for (let i = obstacles.length - 1; i >= 0; i--) {
    const o = obstacles[i];
    o.position.z += v * dt;
    if (o.position.z > 10) { scene.remove(o); obstacles.splice(i, 1); continue; }
    if (running && Math.abs(o.position.z) < 0.72 && o.userData.lane === lane) {
      const t = o.userData.type;
      if (t === 'block') crash();
      else if (t === 'barrier' && playerY < 0.72) crash();
      else if (t === 'sign' && !slidingNow) crash();
    }
  }
  // coins
  for (let i = coins.length - 1; i >= 0; i--) {
    const c = coins[i];
    c.position.z += v * dt;
    c.rotation.z += dt * 4;
    if (c.position.z > 10) { scene.remove(c); coins.splice(i, 1); continue; }
    if (running && Math.abs(c.position.z) < 0.95 && Math.abs(c.position.x - player.position.x) < 0.95
        && Math.abs(c.position.y - (playerY + 0.95)) < 1.25) {
      scene.remove(c); coins.splice(i, 1);
      coinCount++; score = Math.floor(distance) + coinCount * 25; hud();
      $('coinPop').style.opacity = '1';
      setTimeout(() => { $('coinPop').style.opacity = '0'; }, 90);
    }
  }

  renderer.render(scene, camera);
}
reset();
hud();
tick();

window.__frgRunner = {
  state: () => ({ mode, score, coins: coinCount, distance: Math.floor(distance), lane, speed }),
  start, move, jump, slide,
};
