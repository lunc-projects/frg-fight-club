/* MEGA RAMP CRASH — Season 2 sample preview. Standalone, no server, no points.
   Lock your launch power, rocket down a mega ramp (dodge the wrecking ball,
   hit boost pads), launch into the sky, steer the flight, land in the
   junkyard rings and smash everything you roll through. */
import * as THREE from 'three';

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
try { renderer = createRenderer(); } catch (e) { $('glfail').style.display = 'flex'; throw e; }
$('stage').appendChild(renderer.domElement);

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x8fc3ee);
scene.fog = new THREE.Fog(0xa9c8ec, 60, 240);

const camera = new THREE.PerspectiveCamera(62, 1, 0.1, 400);
scene.add(new THREE.HemisphereLight(0xcfe8ff, 0x3a4a2f, 1.15));
const sun = new THREE.DirectionalLight(0xfff2d9, 1.5);
sun.position.set(30, 60, 40);
scene.add(sun);

/* ---------- ground & skyline ---------- */
function groundTexture() {
  const c = document.createElement('canvas'); c.width = 256; c.height = 256;
  const g = c.getContext('2d');
  g.fillStyle = '#5b5648'; g.fillRect(0, 0, 256, 256);
  for (let i = 0; i < 900; i++) {
    g.fillStyle = `rgba(${20 + Math.random() * 60},${18 + Math.random() * 50},${10 + Math.random() * 30},${0.25 + Math.random() * 0.3})`;
    g.fillRect(Math.random() * 256, Math.random() * 256, 3 + Math.random() * 7, 2 + Math.random() * 5);
  }
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(30, 30);
  return t;
}
const ground = new THREE.Mesh(new THREE.PlaneGeometry(400, 400),
  new THREE.MeshStandardMaterial({ map: groundTexture(), roughness: 1 }));
ground.rotation.x = -Math.PI / 2;
ground.position.set(0, 0, -120);
scene.add(ground);

function facadeTexture(base, lit) {
  const c = document.createElement('canvas'); c.width = 128; c.height = 256;
  const g = c.getContext('2d');
  g.fillStyle = base; g.fillRect(0, 0, 128, 256);
  for (let y = 12; y < 240; y += 22) for (let x = 10; x < 118; x += 20) {
    g.fillStyle = Math.random() < 0.5 ? lit : 'rgba(30,40,60,0.85)';
    g.fillRect(x, y, 12, 14);
  }
  return new THREE.CanvasTexture(c);
}
const facades = [facadeTexture('#5a6c8a', '#dbeafe'), facadeTexture('#6b5a7a', '#fde68a'), facadeTexture('#4a5a74', '#bfdbfe')];
{
  const geo = new THREE.BoxGeometry(1, 1, 1);
  for (let i = 0; i < 34; i++) {
    const side = i % 2 === 0 ? -1 : 1;
    const h = 14 + Math.random() * 30;
    const m = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ map: facades[i % 3], roughness: 0.9 }));
    m.scale.set(10 + Math.random() * 8, h, 10);
    m.position.set(side * (34 + Math.random() * 22), h / 2, 30 - ((i / 2) | 0) * 17 - Math.random() * 6);
    scene.add(m);
  }
}

/* ---------- the mega ramp ---------- */
// Travel direction is -Z. Top platform z=8..14 at y=34, slope to (y=3, z=-46),
// lip z=-46..-53.6 angled up 18 degrees.
const SLOPE = { zTop: 8, yTop: 34, zBot: -46, yBot: 3 };
const SLOPE_LEN = Math.hypot(SLOPE.zTop - SLOPE.zBot, SLOPE.yTop - SLOPE.yBot); // ~61.9
const SLOPE_ANG = Math.atan2(SLOPE.yTop - SLOPE.yBot, SLOPE.zTop - SLOPE.zBot); // ~0.525 rad

function rampStripeTexture() {
  const c = document.createElement('canvas'); c.width = 128; c.height = 128;
  const g = c.getContext('2d');
  g.fillStyle = '#d8dde6'; g.fillRect(0, 0, 128, 128);
  g.fillStyle = '#dc2626';
  for (let y = -128; y < 256; y += 64) {
    g.beginPath(); g.moveTo(0, y + 32); g.lineTo(64, y); g.lineTo(128, y + 32); g.lineTo(128, y + 64); g.lineTo(64, y + 32); g.lineTo(0, y + 64); g.fill();
  }
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(1, 10);
  return t;
}
const rampGroup = new THREE.Group(); scene.add(rampGroup);
{
  const stripeMat = new THREE.MeshStandardMaterial({ map: rampStripeTexture(), roughness: 0.8 });
  const steelMat = new THREE.MeshStandardMaterial({ color: 0x7a2430, roughness: 0.6, metalness: 0.5 });
  // slope deck
  const deck = new THREE.Mesh(new THREE.BoxGeometry(7.6, 0.5, SLOPE_LEN + 2), stripeMat);
  deck.position.set(0, (SLOPE.yTop + SLOPE.yBot) / 2 - 0.25, (SLOPE.zTop + SLOPE.zBot) / 2);
  deck.rotation.x = -SLOPE_ANG;
  rampGroup.add(deck);
  // lip deck (up 18 deg)
  const lipLen = 8.6;
  const lip = new THREE.Mesh(new THREE.BoxGeometry(7.6, 0.5, lipLen), stripeMat);
  lip.position.set(0, SLOPE.yBot + Math.sin(0.314) * lipLen / 2 - 0.2, SLOPE.zBot - Math.cos(0.314) * lipLen / 2);
  lip.rotation.x = 0.314;
  rampGroup.add(lip);
  // top platform
  const plat = new THREE.Mesh(new THREE.BoxGeometry(9, 0.6, 10), steelMat);
  plat.position.set(0, SLOPE.yTop - 0.3, SLOPE.zTop + 4.5);
  rampGroup.add(plat);
  // support columns
  for (let i = 0; i < 6; i++) {
    const t = i / 5;
    const z = SLOPE.zTop - t * (SLOPE.zTop - SLOPE.zBot);
    const y = SLOPE.yTop - t * (SLOPE.yTop - SLOPE.yBot);
    for (const s of [-3.2, 3.2]) {
      const col = new THREE.Mesh(new THREE.BoxGeometry(0.7, y, 0.7), steelMat);
      col.position.set(s, y / 2, z);
      rampGroup.add(col);
    }
    const cross = new THREE.Mesh(new THREE.BoxGeometry(7.1, 0.5, 0.5), steelMat);
    cross.position.set(0, y * 0.55, z);
    rampGroup.add(cross);
  }
}
function rampY(z) { // deck surface height at z (slope segment)
  const t = (SLOPE.zTop - z) / (SLOPE.zTop - SLOPE.zBot);
  return SLOPE.yTop - t * (SLOPE.yTop - SLOPE.yBot);
}

/* boost pads on the ramp */
const pads = [];
for (const p of [{ x: -1.7, z: -13 }, { x: 1.7, z: -33 }]) {
  const m = new THREE.Mesh(new THREE.BoxGeometry(2.2, 0.14, 3.2),
    new THREE.MeshStandardMaterial({ color: 0x22d3ee, emissive: 0x22d3ee, emissiveIntensity: 1.6 }));
  m.position.set(p.x, rampY(p.z) + 0.08, p.z);
  m.rotation.x = -SLOPE_ANG;
  scene.add(m); pads.push({ ...p, mesh: m, hit: false });
}

/* wrecking ball on a crane over the ramp */
const ballGroup = new THREE.Group(); scene.add(ballGroup);
const BALL_Z = -23;
{
  const craneMat = new THREE.MeshStandardMaterial({ color: 0x374151, roughness: 0.6, metalness: 0.4 });
  for (const s of [-5.4, 5.4]) {
    const post = new THREE.Mesh(new THREE.BoxGeometry(0.6, 14, 0.6), craneMat);
    post.position.set(s, rampY(BALL_Z) + 7, BALL_Z); scene.add(post);
  }
  const beam = new THREE.Mesh(new THREE.BoxGeometry(11.4, 0.6, 0.6), craneMat);
  beam.position.set(0, rampY(BALL_Z) + 14, BALL_Z); scene.add(beam);
}
const ballPivot = new THREE.Group();
ballPivot.position.set(0, rampY(BALL_Z) + 14, BALL_Z);
scene.add(ballPivot);
const ballMesh = new THREE.Mesh(new THREE.SphereGeometry(1.15, 20, 16),
  new THREE.MeshStandardMaterial({ color: 0x4b4237, roughness: 0.45, metalness: 0.8 }));
ballMesh.position.y = -12.3;
ballPivot.add(ballMesh);
const chainMesh = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.09, 12.3, 6),
  new THREE.MeshStandardMaterial({ color: 0x222222, roughness: 0.5, metalness: 0.7 }));
chainMesh.position.y = -6.15;
ballPivot.add(chainMesh);

/* ---------- landing rings ---------- */
const RINGS = [
  { z: -108, r: 7, pts: 100, color: 0x38bdf8 },
  { z: -128, r: 6, pts: 250, color: 0xa78bfa },
  { z: -148, r: 5, pts: 500, color: 0xfbbf24 },
];
for (const ring of RINGS) {
  const m = new THREE.Mesh(new THREE.TorusGeometry(ring.r, 0.32, 10, 40),
    new THREE.MeshStandardMaterial({ color: ring.color, emissive: ring.color, emissiveIntensity: 1.1 }));
  m.rotation.x = Math.PI / 2;
  m.position.set(0, 0.25, ring.z);
  scene.add(m);
}

/* ---------- junkyard props (smashable) ---------- */
const props = [];
function wreckCar(color) {
  const g = new THREE.Group();
  const body = new THREE.Mesh(new THREE.BoxGeometry(1.9, 0.55, 4.1),
    new THREE.MeshStandardMaterial({ color, roughness: 0.5, metalness: 0.4 }));
  body.position.y = 0.55; g.add(body);
  const cab = new THREE.Mesh(new THREE.BoxGeometry(1.6, 0.5, 2.0),
    new THREE.MeshStandardMaterial({ color: 0x1f2937, roughness: 0.3, metalness: 0.3 }));
  cab.position.set(0, 1.05, -0.2); cab.rotation.z = 0.06; g.add(cab);
  return g;
}
function crate() {
  const m = new THREE.Mesh(new THREE.BoxGeometry(1.4, 1.4, 1.4),
    new THREE.MeshStandardMaterial({ color: 0x9a6b3f, roughness: 0.9 }));
  m.position.y = 0.7; const g = new THREE.Group(); g.add(m); return g;
}
function barrel(color) {
  const m = new THREE.Mesh(new THREE.CylinderGeometry(0.55, 0.55, 1.3, 14),
    new THREE.MeshStandardMaterial({ color, roughness: 0.5, metalness: 0.5 }));
  m.position.y = 0.65; const g = new THREE.Group(); g.add(m); return g;
}
{
  const colors = [0xef4444, 0x3b82f6, 0x9ca3af, 0x65a30d, 0xf97316, 0x6b7280, 0x0ea5e9, 0xa855f7];
  let seed = 7;
  const rnd = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; };
  for (let i = 0; i < 34; i++) {
    const kind = rnd();
    const g = kind < 0.5 ? wreckCar(colors[(rnd() * colors.length) | 0])
      : kind < 0.78 ? crate() : barrel(colors[(rnd() * colors.length) | 0]);
    const z = -72 - rnd() * 105;
    let x = (rnd() - 0.5) * 34;
    if (Math.abs(x) < 3.4 && z < -95) x += Math.sign(x || 1) * 4; // keep ring centers readable
    g.position.set(x, 0, z);
    g.rotation.y = rnd() * Math.PI * 2;
    if (kind >= 0.5 && kind < 0.78 && rnd() < 0.4) { // stacked crate
      const top = crate(); top.position.y = 1.4; g.add(top);
    }
    scene.add(g);
    props.push({ g, smashed: false, vx: 0, vz: 0, va: 0, restY: 0 });
  }
}

/* ---------- the player's car ---------- */
const car = new THREE.Group(); scene.add(car);
const carBody = new THREE.Group(); car.add(carBody);
{
  const yellow = new THREE.MeshStandardMaterial({ color: 0xfacc15, roughness: 0.3, metalness: 0.35 });
  const dark = new THREE.MeshStandardMaterial({ color: 0x111827, roughness: 0.35, metalness: 0.3 });
  const body = new THREE.Mesh(new THREE.BoxGeometry(1.9, 0.5, 4.3), yellow);
  body.position.y = 0.55; carBody.add(body);
  const nose = new THREE.Mesh(new THREE.BoxGeometry(1.8, 0.34, 0.9), yellow);
  nose.position.set(0, 0.44, -2.4); nose.rotation.x = 0.18; carBody.add(nose);
  const cab = new THREE.Mesh(new THREE.BoxGeometry(1.55, 0.48, 2.0), dark);
  cab.position.set(0, 1.0, 0.25); carBody.add(cab);
  const spoiler = new THREE.Mesh(new THREE.BoxGeometry(1.9, 0.09, 0.5), dark);
  spoiler.position.set(0, 1.02, 2.05); carBody.add(spoiler);
  for (const s of [-0.8, 0.8]) {
    const strut = new THREE.Mesh(new THREE.BoxGeometry(0.09, 0.34, 0.09), dark);
    strut.position.set(s, 0.85, 2.05); carBody.add(strut);
  }
}
const wheels = [];
{
  const wg = new THREE.CylinderGeometry(0.42, 0.42, 0.3, 16);
  const wm = new THREE.MeshStandardMaterial({ color: 0x0a0a0a, roughness: 0.9 });
  for (const [x, z] of [[-0.95, -1.45], [0.95, -1.45], [-0.95, 1.45], [0.95, 1.45]]) {
    const w = new THREE.Mesh(wg, wm);
    w.rotation.z = Math.PI / 2;
    w.position.set(x, 0.42, z);
    carBody.add(w); wheels.push(w);
  }
}

/* ---------- game state ---------- */
let mode = 'ready'; // ready(power meter) | descent | flight | rollout | done
let power = 0, powerDir = 1, lockedPower = 0;
let cx = 0, cz = 0, cy = 0, vx = 0, vy = 0, vz = 0; // car position/velocity (travel -Z)
let speed = 0, pitch = 0, airTime = 0, ballHitDone = false;
let smashes = 0, ringPts = 0, bounced = false, endTimer = 0, shake = 0;
let steerIn = 0, pitchIn = 0, ballPhase = 0;
let best = +(localStorage.getItem('megaRampBest') || 0);

const START = { x: 0, z: SLOPE.zTop + 3.5, y: SLOPE.yTop };
function reset() {
  cx = START.x; cz = START.z; cy = START.y; vx = vy = vz = 0;
  speed = 0; pitch = -SLOPE_ANG; airTime = 0; ballHitDone = false;
  smashes = 0; ringPts = 0; bounced = false; endTimer = 0; shake = 0;
  steerIn = 0; pitchIn = 0;
  for (const p of pads) p.hit = false;
  for (const pr of props) {
    pr.smashed = false; pr.vx = pr.vz = pr.va = 0;
    pr.g.rotation.set(0, pr.g.rotation.y, 0);
    pr.g.position.y = 0;
    pr.g.visible = true;
  }
  car.position.set(cx, cy + 0.05, cz);
  car.rotation.set(0, 0, 0); // model nose is at local -Z = travel direction
  carBody.rotation.set(0, 0, 0);
}
function launch() {
  if (mode !== 'ready') return;
  lockedPower = power;
  speed = 5 + lockedPower * 0.14; // 30..100 power -> 9.2..19 u/s at the top
  mode = 'descent';
  $('startCard').style.display = 'none';
  $('pad').style.display = 'flex';
}
function finish() {
  mode = 'done';
  const dist = Math.max(0, Math.round(-53.6 - cz));
  const distPts = dist;
  const airPts = Math.round(airTime) * 20;
  const smashPts = smashes * 50;
  const total = distPts + airPts + smashPts + ringPts;
  if (total > best) { best = total; localStorage.setItem('megaRampBest', String(best)); }
  $('rDist').textContent = dist + 'm → ' + distPts;
  $('rAir').textContent = airTime.toFixed(1) + 's → ' + airPts;
  $('rSmash').textContent = smashes + ' → ' + smashPts;
  $('rRing').textContent = ringPts ? '+' + ringPts : '—';
  $('rTotal').textContent = total.toLocaleString();
  $('bestLine').textContent = 'Best: ' + best.toLocaleString();
  $('overCard').style.display = 'flex';
  $('pad').style.display = 'none';
  window.__lastScore = total;
}

/* ---------- input ---------- */
function hold(id, on, off) {
  const el = $(id);
  el.addEventListener('pointerdown', (e) => { e.preventDefault(); on(); });
  el.addEventListener('pointerup', off); el.addEventListener('pointerleave', off); el.addEventListener('pointercancel', off);
}
hold('btnL', () => { steerIn = -1; }, () => { if (steerIn < 0) steerIn = 0; });
hold('btnR', () => { steerIn = 1; }, () => { if (steerIn > 0) steerIn = 0; });
hold('btnU', () => { pitchIn = 1; }, () => { if (pitchIn > 0) pitchIn = 0; });
hold('btnD', () => { pitchIn = -1; }, () => { if (pitchIn < 0) pitchIn = 0; });
window.addEventListener('keydown', (e) => {
  if (e.key === 'ArrowLeft' || e.key === 'a') steerIn = -1;
  else if (e.key === 'ArrowRight' || e.key === 'd') steerIn = 1;
  else if (e.key === 'ArrowUp' || e.key === 'w') pitchIn = 1;
  else if (e.key === 'ArrowDown' || e.key === 's') pitchIn = -1;
  else if (e.key === ' ' && mode === 'ready') { e.preventDefault(); launch(); }
});
window.addEventListener('keyup', (e) => {
  if (['ArrowLeft', 'a', 'ArrowRight', 'd'].includes(e.key)) steerIn = 0;
  if (['ArrowUp', 'w', 'ArrowDown', 's'].includes(e.key)) pitchIn = 0;
});
$('launchBtn').addEventListener('click', launch);
$('againBtn').addEventListener('click', () => {
  $('overCard').style.display = 'none';
  reset(); mode = 'ready';
  $('startCard').style.display = 'flex';
});

/* ---------- helpers ---------- */
function ballX(t) { return Math.sin(t * 1.35) * 3.6; }
function popup(text, color) {
  const el = $('pop');
  el.textContent = text; el.style.color = color || '#fbbf24';
  el.style.opacity = '1';
  setTimeout(() => { el.style.opacity = '0'; }, 650);
}
function hud() {
  $('hudSpeed').textContent = Math.round(Math.abs(vz || speed) * 3.6);
  $('hudDist').textContent = Math.max(0, Math.round(-53.6 - cz)) + 'm';
  $('hudSmash').textContent = smashes;
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

const camTarget = new THREE.Vector3();
function tick() {
  requestAnimationFrame(tick);
  const dt = Math.min(clock.getDelta(), 0.05);
  const t = clock.elapsedTime;

  // wrecking ball swings always
  ballPhase = t;
  ballPivot.rotation.z = Math.sin(t * 1.35) * 0.34;

  if (mode === 'ready') {
    power += powerDir * dt * 65;
    if (power > 100) { power = 100; powerDir = -1; }
    if (power < 25) { power = 25; powerDir = 1; }
    $('powerFill').style.width = power + '%';
    $('powerVal').textContent = Math.round(power);
    $('powerFill').style.background = power > 85 ? '#ef4444' : power > 60 ? '#f59e0b' : '#22d3ee';
  }

  if (mode === 'descent') {
    speed += 13.5 * dt; // gravity down the slope
    cz -= Math.cos(SLOPE_ANG) * speed * dt;
    cy = rampY(cz); // on the deck
    cx += steerIn * 5.2 * dt;
    cx = Math.max(-3.1, Math.min(3.1, cx));
    pitch = -SLOPE_ANG;
    // boost pads
    for (const p of pads) {
      if (!p.hit && Math.abs(cz - p.z) < 1.7 && Math.abs(cx - p.x) < 1.4) {
        p.hit = true; speed += 6.5; popup('⚡ BOOST!', '#67e8f9');
        p.mesh.material.emissiveIntensity = 0.3;
      }
    }
    // wrecking ball
    if (!ballHitDone && Math.abs(cz - BALL_Z) < 1.5) {
      const bx = ballX(t);
      if (Math.abs(cx - bx) < 1.7) {
        ballHitDone = true; speed *= 0.42; shake = 0.5;
        popup('💥 CLANG! Speed lost', '#f87171');
      }
    }
    if (cz <= SLOPE.zBot) { // onto the lip
      mode = 'lip';
    }
    hud();
  } else if (mode === 'lip') {
    speed += 4 * dt;
    cz -= Math.cos(0.314) * speed * dt;
    cy += Math.sin(0.314) * speed * dt;
    pitch = 0.314;
    if (cz <= -53.6) {
      mode = 'flight';
      vz = -Math.cos(0.314) * speed;
      vy = Math.sin(0.314) * speed;
      vx = 0;
      popup('🕊️ AIRBORNE!', '#fbbf24');
    }
    hud();
  } else if (mode === 'flight') {
    airTime += dt;
    vy -= 21.5 * dt;
    if (pitchIn > 0) { vy += 5.5 * dt; vz -= 1.6 * dt; }   // nose up: float longer, bleed speed
    if (pitchIn < 0) { vy -= 6 * dt; }                       // nose down: dive
    vx += steerIn * 7 * dt;
    vx *= (1 - 0.9 * dt);
    cx += vx * dt; cz += vz * dt; cy += vy * dt;
    cx = Math.max(-26, Math.min(26, cx));
    pitch = Math.atan2(vy, Math.abs(vz)) * 0.9;
    if (cy <= 0.05) {
      cy = 0.05;
      // landing ring check at first touch
      for (const ring of RINGS) {
        const d = Math.hypot(cx, cz - ring.z);
        if (d <= ring.r) { ringPts = Math.max(ringPts, ring.pts); }
      }
      if (ringPts) popup('🎯 RING +' + ringPts + '!', '#fbbf24');
      if (vy < -13 && !bounced) { // hard landing bounce
        bounced = true; vy = -vy * 0.28; vz *= 0.62; shake = 0.4;
        popup('💥 HARD LANDING!', '#f87171');
      } else {
        mode = 'rollout'; vy = 0;
      }
    }
    hud();
  } else if (mode === 'rollout') {
    vz += 9.5 * dt; // friction (vz is negative)
    if (vz > -0.4) { vz = 0; endTimer += dt; if (endTimer > 0.7) finish(); }
    vx *= (1 - 2.2 * dt);
    cx += (vx + steerIn * 2.4) * dt;
    cz += vz * dt;
    pitch *= (1 - 6 * dt);
    // smash props
    for (const pr of props) {
      if (pr.smashed) continue;
      const d = Math.hypot(pr.g.position.x - cx, pr.g.position.z - cz);
      if (d < 2.1 && Math.abs(vz) > 2.5) {
        pr.smashed = true; smashes++;
        pr.vx = (pr.g.position.x - cx) * 2.2 + (Math.random() - 0.5) * 3;
        pr.vz = vz * 0.55;
        pr.va = (Math.random() - 0.5) * 7;
        popup('💥 +50', '#fb923c');
        hud();
      }
    }
    hud();
  }

  // prop tumble animation
  for (const pr of props) {
    if (!pr.smashed || (pr.vx === 0 && pr.vz === 0)) continue;
    pr.g.position.x += pr.vx * dt;
    pr.g.position.z += pr.vz * dt;
    pr.g.rotation.z += pr.va * dt;
    pr.g.rotation.x += pr.va * 0.6 * dt;
    pr.vx *= (1 - 2.4 * dt); pr.vz *= (1 - 2.4 * dt); pr.va *= (1 - 2.4 * dt);
    if (Math.abs(pr.vx) < 0.05 && Math.abs(pr.vz) < 0.05) { pr.vx = pr.vz = pr.va = 0; }
  }

  // car transform
  car.position.set(cx, cy + 0.05, cz);
  carBody.rotation.x = pitch; // +pitch = nose up; descent pitch is negative (nose down the slope)
  carBody.rotation.z = -steerIn * 0.05 - vx * 0.012;
  const wheelSpin = (mode === 'descent' || mode === 'lip') ? speed : Math.abs(vz);
  for (const w of wheels) w.rotation.x += wheelSpin * dt * 2.2;

  // camera chase
  if (shake > 0) shake -= dt;
  const shX = shake > 0 ? (Math.random() - 0.5) * shake * 1.4 : 0;
  const shY = shake > 0 ? (Math.random() - 0.5) * shake : 0;
  const lift = mode === 'flight' ? 4.6 : 3.6;
  camTarget.set(cx * 0.72 + shX, cy + lift + shY, cz + 9.5);
  camera.position.lerp(camTarget, Math.min(1, dt * 4.5));
  camera.lookAt(cx * 0.9, cy + 0.7, cz - 9);
  camera.fov += (((mode === 'flight') ? 70 : 62) - camera.fov) * Math.min(1, dt * 3);
  camera.updateProjectionMatrix();

  renderer.render(scene, camera);
}
reset();
hud();
tick();

window.__frgRamp = {
  state: () => ({ mode, power: Math.round(power), speed: Math.round(speed), cz: Math.round(cz), cy: Math.round(cy), smashes, ringPts, airTime: +airTime.toFixed(2) }),
  launch, setPower: (p) => { power = p; },
  steer: (v) => { steerIn = v; }, pitchIn: (v) => { pitchIn = v; },
  pos: () => ({ cx, cz, cy }),
};
