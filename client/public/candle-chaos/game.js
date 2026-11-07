/* ============================================================
   CANDLE CHAOS — 3D chart-runner (Three.js r160)
   LUNC Dev Studio original. Leap candle to candle along a living
   candlestick chart: GREEN is safe, RED is death, and the candles
   behind you crack and fall away. Pickups are LUNC crescents and
   USTC stars only. Free game — no wallet, no signing, ever.
   ============================================================ */
import * as THREE from 'three';

const $ = (id) => document.getElementById(id);
const clamp = (v, a, b) => v < a ? a : v > b ? b : v;
const lerp = (a, b, t) => a + (b - a) * t;

/* ---------------- constants ---------------- */
const LANE_X = [-2.35, 0, 2.35];
const STEP_Z = 3.05;               // distance between chart steps
const BLOCK_W = 2.15, BLOCK_D = 2.3;
/* Control-ease tuning (Nov 7, owner: "hard to control — easier movement").
   Everything below is about forgiveness: slower opening pace, floatier
   jump with coyote time + input buffering, stronger air steering, a
   wider landing catch and a green-favoured boundary rule. */
const SPEED0 = 7.6, SPEED_MAX = 15.5, SPEED_RAMP = 0.0042;
const GRAV = 34, GRAV_RISE = 26, JUMP_V = 15.2;
const COYOTE_MS = 150;             // jump still fires just after an edge
const BUFFER_MS = 160;             // jump pressed just before landing fires
const STICK_DEAD = 0.06;           // stick deadzone (was: none on a raw value)
const CATCH_BELOW = 1.35;          // landing catch depth under the top plane
const AUTO_STEP = 1.05;            // rises <= this are stepped up freely
const GEN_AHEAD = 44;              // steps kept ahead of the player
const CRESCENT_SCORE = 50, STAR_SCORE = 150;

/* ---------------- state ---------------- */
const S = {
  mode: 'boot',          // boot | menu | run | pause | dying | over
  score: 0, dist: 0, crescents: 0, stars: 0, streak: 0,
  speed: 0, runTime: 0, time: 0,
  x: 0, y: 0, z: 0, vx: 0, vy: 0, grounded: true,
  curBlock: null, lastBlock: null, fallStartY: 0, airTime: 0, bumped: false,
  lastGroundedT: -9, jumpBufferT: -9,   // coyote / input-buffer timestamps
  dieT: 0, dieKind: null, muted: false, best: 0, submitted: false,
};
try {
  S.muted = localStorage.getItem('candleChaosMute') === '1';
  S.best = +localStorage.getItem('candleChaosBest') || 0;
} catch (e) {}

/* ---------------- tiny WebAudio synth ---------------- */
let AC = null;
function audio() {
  if (!AC) { try { AC = new (window.AudioContext || window.webkitAudioContext)(); } catch (e) {} }
  if (AC && AC.state === 'suspended') AC.resume();
  return AC;
}
function tone(f0, f1, dur, type, vol, delay = 0) {
  if (S.muted) return; const ac = audio(); if (!ac) return;
  const t = ac.currentTime + delay;
  const o = ac.createOscillator(), g = ac.createGain();
  o.type = type; o.frequency.setValueAtTime(f0, t);
  o.frequency.exponentialRampToValueAtTime(Math.max(f1, 1), t + dur);
  g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(0.001, t + dur);
  o.connect(g).connect(ac.destination); o.start(t); o.stop(t + dur + 0.02);
}
function noiseBurst(dur, freq, vol) {
  if (S.muted) return; const ac = audio(); if (!ac) return;
  const n = Math.floor(ac.sampleRate * dur);
  const buf = ac.createBuffer(1, n, ac.sampleRate), d = buf.getChannelData(0);
  for (let i = 0; i < n; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / n);
  const src = ac.createBufferSource(); src.buffer = buf;
  const f = ac.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = freq;
  const g = ac.createGain(); g.gain.value = vol;
  src.connect(f).connect(g).connect(ac.destination); src.start();
}
const sfx = {
  jump() { tone(280, 560, 0.14, 'square', 0.05); },
  land(streak) { tone(420 + Math.min(streak, 12) * 35, 300, 0.07, 'sine', 0.10); },
  crescent() { tone(990, 990, 0.08, 'sine', 0.10); tone(1480, 1480, 0.12, 'sine', 0.09, 0.06); },
  star() { tone(880, 880, 0.07, 'triangle', 0.11); tone(1174, 1174, 0.07, 'triangle', 0.11, 0.06); tone(1568, 1568, 0.13, 'triangle', 0.11, 0.12); },
  crack() { noiseBurst(0.16, 900, 0.16); },
  shatter() { noiseBurst(0.4, 2400, 0.22); tone(240, 38, 0.45, 'sawtooth', 0.10); },
  fall() { tone(700, 120, 0.5, 'sine', 0.06); },
  click() { tone(660, 660, 0.05, 'sine', 0.06); },
};

/* ---------------- three setup ---------------- */
const container = $('game');
const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.12;
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.setClearColor(0x060a18, 1);
container.appendChild(renderer.domElement);

function viewSize() {
  const vv = window.visualViewport;
  return { w: Math.round((vv && vv.width) || innerWidth), h: Math.round((vv && vv.height) || innerHeight) };
}
{ const s0 = viewSize(); renderer.setSize(s0.w, s0.h, false); }

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x060a18);
scene.fog = new THREE.Fog(0x070b1a, 42, 178);

const camera = new THREE.PerspectiveCamera(66, 1, 0.1, 900);
function applySize() {
  const s = viewSize();
  renderer.setSize(s.w, s.h, false);
  camera.aspect = s.w / s.h; camera.updateProjectionMatrix();
}
applySize();
window.addEventListener('resize', applySize);
if (window.visualViewport) window.visualViewport.addEventListener('resize', applySize);

const hemi = new THREE.HemisphereLight(0x8093c9, 0x1a0f2e, 1.05);
scene.add(hemi);
const moonLight = new THREE.DirectionalLight(0xcfe0ff, 1.5);
moonLight.castShadow = true;
moonLight.shadow.mapSize.set(1024, 1024);
moonLight.shadow.camera.left = -17; moonLight.shadow.camera.right = 17;
moonLight.shadow.camera.top = 17; moonLight.shadow.camera.bottom = -17;
moonLight.shadow.camera.far = 70; moonLight.shadow.bias = -0.002;
scene.add(moonLight); scene.add(moonLight.target);
const glowLight = new THREE.PointLight(0xffb35c, 26, 24, 1.8);
scene.add(glowLight);

/* ---------------- canvas textures ---------------- */
function canvasTex(w, h, draw, srgb = true) {
  const c = document.createElement('canvas'); c.width = w; c.height = h;
  draw(c.getContext('2d'), w, h);
  const t = new THREE.CanvasTexture(c);
  if (srgb) t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  return t;
}
const waxTex = canvasTex(256, 256, (g, w, h) => {
  // vertical gloss streaks — candle wax reads as banded, glossy columns
  for (let x = 0; x < w; x += 2) {
    const v = 0.86 + Math.random() * 0.14;
    g.fillStyle = `rgb(${Math.round(238 * v)},${Math.round(240 * v)},${Math.round(238 * v)})`;
    g.fillRect(x, 0, 2, h);
  }
  // glossy hot-spot: bright vertical band left of centre
  const hg = g.createLinearGradient(w * 0.18, 0, w * 0.46, 0);
  hg.addColorStop(0, 'rgba(255,255,255,0)');
  hg.addColorStop(0.5, 'rgba(255,255,255,0.34)');
  hg.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = hg; g.fillRect(w * 0.18, 0, w * 0.28, h);
  // darker shaded right edge for cylindrical depth
  const eg = g.createLinearGradient(w * 0.72, 0, w, 0);
  eg.addColorStop(0, 'rgba(0,0,0,0)');
  eg.addColorStop(1, 'rgba(0,0,0,0.30)');
  g.fillStyle = eg; g.fillRect(w * 0.72, 0, w * 0.28, h);
  // translucent wax-drip streaks running down from the melt top
  for (let i = 0; i < 34; i++) {
    g.fillStyle = `rgba(255,255,255,${0.10 + Math.random() * 0.20})`;
    const x = Math.random() * w;
    g.beginPath(); g.ellipse(x, 4, 1.6 + Math.random() * 2.2, 14 + Math.random() * 54, 0, 0, Math.PI * 2); g.fill();
  }
  // fine grain
  for (let i = 0; i < 900; i++) {
    g.fillStyle = `rgba(0,0,0,${Math.random() * 0.05})`;
    g.fillRect(Math.random() * w, Math.random() * h, 2, 2 + Math.random() * 6);
  }
});
waxTex.wrapS = waxTex.wrapT = THREE.RepeatWrapping;
// molten pool seen from above: radial light-centre, depth-dark rim
const poolTex = canvasTex(128, 128, (g, w, h) => {
  const rg = g.createRadialGradient(w / 2, h / 2, 4, w / 2, h / 2, w * 0.52);
  rg.addColorStop(0, '#ffffff');
  rg.addColorStop(0.45, 'rgba(255,255,255,0.88)');
  rg.addColorStop(0.8, 'rgba(230,230,230,0.75)');
  rg.addColorStop(1, 'rgba(120,120,120,0.9)');
  g.fillStyle = rg; g.fillRect(0, 0, w, h);
  for (let i = 0; i < 26; i++) { // wobble rings in the melt
    g.strokeStyle = `rgba(0,0,0,${0.03 + Math.random() * 0.05})`;
    g.beginPath(); g.arc(w / 2 + (Math.random() - 0.5) * 8, h / 2 + (Math.random() - 0.5) * 8, 6 + Math.random() * 46, 0, Math.PI * 2); g.stroke();
  }
  for (let i = 0; i < 9; i++) { // drips spilling over the rim
    g.fillStyle = 'rgba(255,255,255,0.5)';
    const a = Math.random() * Math.PI * 2;
    g.beginPath(); g.ellipse(w / 2 + Math.cos(a) * w * 0.44, h / 2 + Math.sin(a) * h * 0.44, 3.4, 2.2, a, 0, Math.PI * 2); g.fill();
  }
});
const crackTex = canvasTex(128, 128, (g, w, h) => {
  g.fillStyle = '#f6f6f6'; g.fillRect(0, 0, w, h);
  g.strokeStyle = 'rgba(12,0,4,0.85)'; g.lineWidth = 2;
  for (let i = 0; i < 7; i++) {
    let x = Math.random() * w, y = Math.random() * h;
    g.beginPath(); g.moveTo(x, y);
    for (let j = 0; j < 5; j++) { x += (Math.random() - 0.5) * 44; y += Math.random() * 30; g.lineTo(x, y); }
    g.stroke();
  }
  g.strokeStyle = 'rgba(255,90,40,0.5)'; g.lineWidth = 1;
  for (let i = 0; i < 5; i++) {
    let x = Math.random() * w, y = Math.random() * h;
    g.beginPath(); g.moveTo(x, y);
    for (let j = 0; j < 4; j++) { x += (Math.random() - 0.5) * 36; y += Math.random() * 26; g.lineTo(x, y); }
    g.stroke();
  }
});
const flameTex = canvasTex(96, 128, (g, w, h) => {
  // layered teardrop flame: outer halo / coloured body / near-white core
  const teardrop = (cx, top, bot, hw, stops) => {
    const grad = g.createRadialGradient(cx, bot - (bot - top) * 0.26, 2, cx, (top + bot) / 2, (bot - top) * 0.62);
    for (const [o, c] of stops) grad.addColorStop(o, c);
    g.fillStyle = grad;
    g.beginPath();
    g.moveTo(cx, top);
    g.bezierCurveTo(cx + hw, bot - (bot - top) * 0.42, cx + hw * 0.86, bot, cx, bot);
    g.bezierCurveTo(cx - hw * 0.86, bot, cx - hw, bot - (bot - top) * 0.42, cx, top);
    g.fill();
  };
  teardrop(48, 6, 122, 30, [[0, 'rgba(255,255,255,0.30)'], [0.55, 'rgba(255,255,255,0.16)'], [1, 'rgba(255,255,255,0)']]);
  teardrop(48, 20, 118, 21, [[0, 'rgba(255,255,255,0.95)'], [0.6, 'rgba(255,255,255,0.80)'], [1, 'rgba(255,255,255,0)']]);
  teardrop(48, 52, 112, 11.5, [[0, 'rgba(255,255,255,1)'], [1, 'rgba(255,255,255,0.25)']]);
});
const glowTex = canvasTex(64, 64, (g, w, h) => {
  const grad = g.createRadialGradient(32, 32, 1, 32, 32, 31);
  grad.addColorStop(0, 'rgba(255,255,255,0.9)');
  grad.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = grad; g.fillRect(0, 0, w, h);
});
const cityTex = canvasTex(512, 512, (g, w, h) => {
  g.fillStyle = '#04060f'; g.fillRect(0, 0, w, h);
  const cols = ['#ffca7a', '#ffd9a0', '#9fd0ff', '#fff3d6', '#ffb35c'];
  // building blocks: darker masses with lit window grids = real depth
  for (let i = 0; i < 190; i++) {
    const bw = 14 + Math.random() * 42, bh = 14 + Math.random() * 42;
    const bx = Math.random() * w, by = Math.random() * h;
    g.fillStyle = `rgba(16,22,44,${0.5 + Math.random() * 0.5})`;
    g.fillRect(bx, by, bw, bh);
    g.fillStyle = `rgba(120,160,255,${0.05 + Math.random() * 0.08})`;
    g.fillRect(bx, by, bw, 2);
    const rows = Math.max(2, (bh / 6) | 0), colsN = Math.max(2, (bw / 5) | 0);
    for (let r2 = 0; r2 < rows; r2++) for (let c2 = 0; c2 < colsN; c2++) {
      if (Math.random() < 0.42) continue;
      g.fillStyle = cols[(Math.random() * cols.length) | 0];
      g.globalAlpha = 0.35 + Math.random() * 0.65;
      g.fillRect(bx + 2 + c2 * 5, by + 3 + r2 * 6, 2.2, 2.8);
    }
  }
  g.globalAlpha = 1;
  // loose street lights between the blocks
  for (let i = 0; i < 700; i++) {
    g.fillStyle = cols[(Math.random() * cols.length) | 0];
    g.globalAlpha = 0.25 + Math.random() * 0.6;
    g.fillRect(Math.random() * w, Math.random() * h, 1.6, 1.6);
  }
  g.globalAlpha = 1;
});
cityTex.wrapS = cityTex.wrapT = THREE.RepeatWrapping;
cityTex.repeat.set(7, 60);

/* ---------------- sky: stars, city, moon + chart backdrop ---------------- */
{
  const n = 2400, pos = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) {
    pos[i * 3] = (Math.random() - 0.5) * 420;
    pos[i * 3 + 1] = Math.random() * 130 - 14;
    pos[i * 3 + 2] = 60 - Math.random() * 4200;
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  scene.add(new THREE.Points(geo, new THREE.PointsMaterial({ color: 0xcfe4ff, size: 1.5, sizeAttenuation: false, fog: false, transparent: true, opacity: 0.9 })));
}
const city = new THREE.Mesh(
  new THREE.PlaneGeometry(520, 4400),
  new THREE.MeshBasicMaterial({ map: cityTex, fog: false })
);
city.rotation.x = -Math.PI / 2;
city.position.set(0, -26, -2050);
scene.add(city);
// near rim of taller blocks along both sides — parallax depth against
// the flat lit plane; follows the player like the chart wall does
const rimGroup = new THREE.Group();
{
  const rimTexG = canvasTex(128, 256, (g, w, h) => {
    g.fillStyle = '#0a1024'; g.fillRect(0, 0, w, h);
    const cols = ['#ffca7a', '#ffd9a0', '#9fd0ff', '#fff3d6'];
    for (let y = 8; y < h - 6; y += 11) for (let x = 6; x < w - 6; x += 10) {
      if (Math.random() < 0.45) continue;
      g.fillStyle = cols[(Math.random() * cols.length) | 0];
      g.globalAlpha = 0.4 + Math.random() * 0.6;
      g.fillRect(x, y, 4.6, 6);
    }
    g.globalAlpha = 1;
    g.fillStyle = 'rgba(130,170,255,0.16)'; g.fillRect(0, 0, w, 3);
  });
  const rimMat = new THREE.MeshBasicMaterial({ map: rimTexG, fog: false });
  const rimGeo = new THREE.BoxGeometry(7, 1, 11);
  for (let i = 0; i < 30; i++) {
    const m = new THREE.Mesh(rimGeo, rimMat);
    const side = i % 2 === 0 ? -1 : 1;
    const bh = 4 + Math.random() * 10;
    m.scale.y = bh;
    m.position.set(side * (24 + Math.random() * 30), -26 + bh / 2, -i * 12 - Math.random() * 6);
    m.rotation.y = (Math.random() - 0.5) * 0.5;
    rimGroup.add(m);
  }
  rimGroup.position.z = 60;
  scene.add(rimGroup);
}
/* Mid-distance skyline tier (premium-depth pass): a nearer, taller,
   warmer-lit city band between the flat lit plane and the rim blocks —
   the three-tier depth (bright near rim / warm mid band / tiny far
   windows) that top runner titles use to sell scale. Own canvas art. */
const midGroup = new THREE.Group();
{
  const midTex = canvasTex(256, 512, (g, w, h) => {
    g.fillStyle = '#0b1226'; g.fillRect(0, 0, w, h);
    const cols = ['#ffd9a0', '#ffca7a', '#a8d4ff', '#fff3d6'];
    for (let y = 10; y < h - 8; y += 14) for (let x = 8; x < w - 8; x += 13) {
      if (Math.random() < 0.38) continue;
      g.fillStyle = cols[(Math.random() * cols.length) | 0];
      g.globalAlpha = 0.5 + Math.random() * 0.5;
      g.fillRect(x, y, 6.2, 8);
    }
    g.globalAlpha = 1;
    // rooftop beacon dots — a couple of red aircraft lights per tower
    for (let i = 0; i < 5; i++) {
      g.fillStyle = 'rgba(255,70,80,0.95)';
      g.beginPath(); g.arc(12 + Math.random() * (w - 24), 5 + Math.random() * 8, 2.4, 0, Math.PI * 2); g.fill();
    }
    g.fillStyle = 'rgba(150,190,255,0.22)'; g.fillRect(0, 0, w, 4);
  });
  const midMat = new THREE.MeshBasicMaterial({ map: midTex, fog: false });
  const midGeo = new THREE.BoxGeometry(11, 1, 7);
  for (let i = 0; i < 26; i++) {
    const m = new THREE.Mesh(midGeo, midMat);
    const side = i % 2 === 0 ? -1 : 1;
    const bh = 13 + Math.random() * 17;
    m.scale.y = bh;
    m.position.set(side * (58 + Math.random() * 26), -26 + bh / 2, -i * 15 - Math.random() * 8);
    m.rotation.y = (Math.random() - 0.5) * 0.35;
    midGroup.add(m);
  }
  midGroup.position.z = 40;
  scene.add(midGroup);
}

const chartGroup = new THREE.Group();
{
  // glowing grid wall
  const gridTex = canvasTex(256, 256, (g, w, h) => {
    g.fillStyle = 'rgba(8,20,38,0.55)'; g.fillRect(0, 0, w, h);
    g.strokeStyle = 'rgba(64,224,208,0.5)'; g.lineWidth = 1;
    for (let i = 0; i <= 8; i++) {
      g.beginPath(); g.moveTo(i * w / 8, 0); g.lineTo(i * w / 8, h); g.stroke();
      g.beginPath(); g.moveTo(0, i * h / 8); g.lineTo(w, i * h / 8); g.stroke();
    }
  });
  gridTex.wrapS = gridTex.wrapT = THREE.RepeatWrapping; gridTex.repeat.set(6, 3);
  const wall = new THREE.Mesh(new THREE.PlaneGeometry(190, 84),
    new THREE.MeshBasicMaterial({ map: gridTex, transparent: true, opacity: 0.5, fog: false, depthWrite: false }));
  wall.position.set(0, 22, 0);
  chartGroup.add(wall);
  // second, larger fainter grid layer behind — parallax depth in the sky
  const wall2 = new THREE.Mesh(new THREE.PlaneGeometry(300, 130),
    new THREE.MeshBasicMaterial({ map: gridTex, transparent: true, opacity: 0.18, fog: false, depthWrite: false }));
  wall2.position.set(0, 30, -14);
  chartGroup.add(wall2);
  // translucent chart candles + price line
  const linePts = [];
  let p = 16;
  const cg = new THREE.BoxGeometry(3.4, 1, 1.2);
  const gm = new THREE.MeshBasicMaterial({ color: 0x2eff7d, transparent: true, opacity: 0.5, fog: false });
  const rm = new THREE.MeshBasicMaterial({ color: 0xff3b47, transparent: true, opacity: 0.5, fog: false });
  for (let i = 0; i < 26; i++) {
    p = clamp(p + (Math.random() - 0.44) * 7, 4, 34);
    const bh = 3 + Math.random() * 7;
    const m = new THREE.Mesh(cg, Math.random() < 0.58 ? gm : rm);
    m.scale.y = bh; m.position.set(-84 + i * 6.8, p, 1.5);
    chartGroup.add(m);
    linePts.push(new THREE.Vector3(-84 + i * 6.8, p + bh / 2 + 0.4, 2.2));
  }
  const line = new THREE.Line(
    new THREE.BufferGeometry().setFromPoints(linePts),
    new THREE.LineBasicMaterial({ color: 0xffcf3d, transparent: true, opacity: 0.9, fog: false }));
  chartGroup.add(line);
  // the gold price line as a fat glowing ribbon (Lines are 1px everywhere)
  const ribbonPts = [];
  for (let i = 0; i < linePts.length - 1; i++) {
    const a = linePts[i], b = linePts[i + 1];
    ribbonPts.push(a.x, a.y - 0.55, 2.1, b.x, b.y - 0.55, 2.1, b.x, b.y + 0.55, 2.1);
    ribbonPts.push(a.x, a.y - 0.55, 2.1, b.x, b.y + 0.55, 2.1, a.x, a.y + 0.55, 2.1);
  }
  const ribbonGeo = new THREE.BufferGeometry();
  ribbonGeo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(ribbonPts), 3));
  chartGroup.add(new THREE.Mesh(ribbonGeo, new THREE.MeshBasicMaterial({
    color: 0xffcf3d, transparent: true, opacity: 0.34, fog: false, depthWrite: false, side: THREE.DoubleSide,
  })));
  // second price line (teal) weaving under the gold one
  const line2Pts = [];
  let p2 = 12;
  for (let i = 0; i < 26; i++) {
    p2 = clamp(p2 + (Math.random() - 0.47) * 6, 3, 30);
    line2Pts.push(new THREE.Vector3(-84 + i * 6.8, p2, 2.0));
  }
  chartGroup.add(new THREE.Line(
    new THREE.BufferGeometry().setFromPoints(line2Pts),
    new THREE.LineBasicMaterial({ color: 0x3fe0d2, transparent: true, opacity: 0.55, fog: false })));
  // dashed horizontal gridlines with glowing level dots
  const dashMat = new THREE.LineDashedMaterial({ color: 0x3a86c9, dashSize: 3, gapSize: 2.4, transparent: true, opacity: 0.5, fog: false });
  for (const gy of [8, 18, 28]) {
    const dl = new THREE.Line(
      new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(-92, gy, 1.8), new THREE.Vector3(92, gy, 1.8)]), dashMat);
    dl.computeLineDistances();
    chartGroup.add(dl);
  }
  const dotGeo = new THREE.SphereGeometry(0.55, 10, 8);
  const dotMat = new THREE.MeshBasicMaterial({ color: 0x9fd0ff, fog: false });
  for (let i = 0; i < 9; i++) {
    const d = new THREE.Mesh(dotGeo, dotMat);
    d.position.set(-80 + i * 20, [8, 18, 28][i % 3], 1.8);
    chartGroup.add(d);
  }
  // Warm horizon glow behind the chart wall (premium pass, Alto-style):
  // a huge soft peach bloom low on the sky that every silhouette rim —
  // skyline, chart wall, candles — reads against. Our own gradient art.
  const horizon = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTex, color: 0xff9a4d, transparent: true, opacity: 0.30, fog: false, depthWrite: false }));
  horizon.scale.set(300, 130, 1); horizon.position.set(-10, 2, -8);
  chartGroup.add(horizon);
  const horizonCore = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTex, color: 0xffcf8a, transparent: true, opacity: 0.30, fog: false, depthWrite: false }));
  horizonCore.scale.set(150, 66, 1); horizonCore.position.set(-14, 0, -7);
  chartGroup.add(horizonCore);
  // rising/falling arrow pair — the classic chart glyphs
  const arrowShape = new THREE.Shape();
  arrowShape.moveTo(0, 2.6); arrowShape.lineTo(1.5, 0.4); arrowShape.lineTo(0.65, 0.4);
  arrowShape.lineTo(0.65, -2.2); arrowShape.lineTo(-0.65, -2.2); arrowShape.lineTo(-0.65, 0.4); arrowShape.lineTo(-1.5, 0.4);
  arrowShape.closePath();
  const arrowGeo = new THREE.ShapeGeometry(arrowShape);
  const upArrow = new THREE.Mesh(arrowGeo, new THREE.MeshBasicMaterial({ color: 0x2eff7d, transparent: true, opacity: 0.75, fog: false }));
  upArrow.position.set(-66, 33, 2.4); upArrow.scale.setScalar(1.7);
  chartGroup.add(upArrow);
  const dnArrow = new THREE.Mesh(arrowGeo, new THREE.MeshBasicMaterial({ color: 0xff3b47, transparent: true, opacity: 0.75, fog: false }));
  dnArrow.rotation.z = Math.PI; dnArrow.position.set(72, 12, 2.4); dnArrow.scale.setScalar(1.7);
  chartGroup.add(dnArrow);
  // crescent moon (two-circle shape) + glow
  const shape = new THREE.Shape();
  shape.absarc(0, 0, 7.5, 0, Math.PI * 2, false);
  const hole = new THREE.Path();
  hole.absarc(2.9, 1.7, 6.4, 0, Math.PI * 2, true);
  shape.holes.push(hole);
  const moon = new THREE.Mesh(new THREE.ShapeGeometry(shape, 40),
    new THREE.MeshBasicMaterial({ color: 0xffdf8a, fog: false }));
  moon.position.set(56, 40, 2);
  chartGroup.add(moon);
  const mglow = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTex, color: 0xffcf3d, transparent: true, opacity: 0.5, fog: false, depthWrite: false }));
  mglow.scale.set(38, 38, 1); mglow.position.copy(moon.position);
  chartGroup.add(mglow);
  chartGroup.position.set(0, 0, -165);
  scene.add(chartGroup);
}

/* ---------------- shared geometry / materials ---------------- */
const bodyGeo = new THREE.BoxGeometry(BLOCK_W, 1, BLOCK_D);
const discGeo = new THREE.CylinderGeometry(0.80, 0.94, 0.15, 20);
const wickGeo = new THREE.CylinderGeometry(0.045, 0.045, 0.36, 6);
const tailGeo = new THREE.CylinderGeometry(0.055, 0.075, 1, 6);
const chunkGeo = new THREE.BoxGeometry(0.36, 0.32, 0.36);
const matGreen = new THREE.MeshStandardMaterial({ map: waxTex, color: 0x1ed760, emissive: 0x0a5226, emissiveIntensity: 0.55, roughness: 0.22, metalness: 0.05, envMapIntensity: 0.7 });
const matRed = new THREE.MeshStandardMaterial({ map: crackTex, color: 0xe02334, emissive: 0x6e0714, emissiveIntensity: 0.6, roughness: 0.26, metalness: 0.05, envMapIntensity: 0.7 });
const matDiscG = new THREE.MeshStandardMaterial({ map: poolTex, color: 0x9dffb8, emissive: 0x2b9e52, emissiveIntensity: 0.8, roughness: 0.15, metalness: 0.05 });
const matDiscR = new THREE.MeshStandardMaterial({ map: poolTex, color: 0xffb09a, emissive: 0xa8230d, emissiveIntensity: 0.8, roughness: 0.15, metalness: 0.05 });
const matWick = new THREE.MeshStandardMaterial({ color: 0x191008, roughness: 0.9 });
const flameMatG = new THREE.SpriteMaterial({ map: flameTex, color: 0x51ff85, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false });
const flameMatR = new THREE.SpriteMaterial({ map: flameTex, color: 0xff6a3c, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false });
const haloMatG = new THREE.SpriteMaterial({ map: glowTex, color: 0x2eff7d, transparent: true, opacity: 0.30, blending: THREE.AdditiveBlending, depthWrite: false });
const haloMatR = new THREE.SpriteMaterial({ map: glowTex, color: 0xff5030, transparent: true, opacity: 0.30, blending: THREE.AdditiveBlending, depthWrite: false });
const chunkMatG = new THREE.MeshStandardMaterial({ color: 0x1ed760, roughness: 0.5 });
const chunkMatR = new THREE.MeshStandardMaterial({ color: 0xe02334, roughness: 0.5 });

/* crescent pickup geometry (gold torus arc) + star */
const crescentGeo = new THREE.TorusGeometry(0.42, 0.15, 10, 22, 4.15);
const matCrescent = new THREE.MeshStandardMaterial({ color: 0xffcf3d, emissive: 0xa87400, emissiveIntensity: 0.7, roughness: 0.22, metalness: 0.75 });
const starGeo = (() => {
  const s = new THREE.Shape();
  for (let i = 0; i < 10; i++) {
    const r = i % 2 === 0 ? 0.52 : 0.22, a = (i / 10) * Math.PI * 2 - Math.PI / 2;
    const x = Math.cos(a) * r, y = Math.sin(a) * r;
    i === 0 ? s.moveTo(x, y) : s.lineTo(x, y);
  }
  s.closePath();
  return new THREE.ExtrudeGeometry(s, { depth: 0.16, bevelEnabled: true, bevelSize: 0.04, bevelThickness: 0.04 });
})();
const matStar = new THREE.MeshStandardMaterial({ color: 0x3fe0d2, emissive: 0x12998f, emissiveIntensity: 0.7, roughness: 0.2, metalness: 0.4 });

function makeCandle(color) {
  const grp = new THREE.Group();
  const bodyH = 1.35 + Math.random() * 1.35;
  const body = new THREE.Mesh(bodyGeo, color === 'G' ? matGreen : matRed);
  body.scale.y = bodyH;
  body.position.y = -bodyH / 2;
  body.castShadow = true; body.receiveShadow = true;
  grp.add(body);
  const disc = new THREE.Mesh(discGeo, color === 'G' ? matDiscG : matDiscR);
  disc.position.y = 0.06;
  grp.add(disc);
  const wick = new THREE.Mesh(wickGeo, matWick);
  wick.position.y = 0.28;
  grp.add(wick);
  // candlestick tail wick hanging under the body — the chart signature
  const tailLen = 0.55 + Math.random() * 1.15;
  const tail = new THREE.Mesh(tailGeo, color === 'G' ? matDiscG : matDiscR);
  tail.scale.y = tailLen;
  tail.position.y = -bodyH - tailLen / 2 + 0.04;
  grp.add(tail);
  const flame = new THREE.Sprite(color === 'G' ? flameMatG : flameMatR);
  flame.scale.set(0.85, 1.25, 1);
  flame.position.y = 0.86;
  flame.userData.phase = Math.random() * 9;
  grp.add(flame);
  const halo = new THREE.Sprite(color === 'G' ? haloMatG : haloMatR);
  halo.scale.set(2.3, 2.3, 1);
  halo.position.y = 0.72;
  halo.userData.phase = flame.userData.phase;
  grp.add(halo);
  grp.userData.flame = flame;
  grp.userData.halo = halo;
  return grp;
}

/* chunk particle pool (wax shards) + ember pool (glowing points) */
const chunks = [];
for (let i = 0; i < 72; i++) {
  const m = new THREE.Mesh(chunkGeo, chunkMatG);
  m.visible = false; m.castShadow = false;
  scene.add(m);
  chunks.push({ m, vx: 0, vy: 0, vz: 0, rx: 0, rz: 0, life: 0 });
}
const EMBERS = 240;
const emberPos = new Float32Array(EMBERS * 3);
const emberVel = new Float32Array(EMBERS * 3);
const emberLife = new Float32Array(EMBERS);
const emberGeo = new THREE.BufferGeometry();
emberGeo.setAttribute('position', new THREE.BufferAttribute(emberPos, 3));
for (let i = 0; i < EMBERS; i++) emberPos[i * 3 + 1] = -999;
const embers = new THREE.Points(emberGeo, new THREE.PointsMaterial({
  map: glowTex, color: 0xffa63d, size: 0.42, transparent: true, opacity: 0.95,
  blending: THREE.AdditiveBlending, depthWrite: false, sizeAttenuation: true,
}));
embers.frustumCulled = false;
scene.add(embers);
let emberIdx = 0;
function spawnEmbers(x, y, z, n = 6, tint = null) {
  embers.material.color.set(tint === 'R' ? 0xff5030 : tint === 'G' ? 0x51ff85 : tint === 'gold' ? 0xffcf3d : tint === 'teal' ? 0x3fe0d2 : 0xffa63d);
  for (let i = 0; i < n; i++) {
    const k = emberIdx; emberIdx = (emberIdx + 1) % EMBERS;
    emberPos[k * 3] = x + (Math.random() - 0.5) * 1.2;
    emberPos[k * 3 + 1] = y + (Math.random() - 0.5) * 0.5;
    emberPos[k * 3 + 2] = z + (Math.random() - 0.5) * 1.2;
    emberVel[k * 3] = (Math.random() - 0.5) * 2.2;
    emberVel[k * 3 + 1] = 1.2 + Math.random() * 3.0;
    emberVel[k * 3 + 2] = (Math.random() - 0.5) * 2.2;
    emberLife[k] = 0.55 + Math.random() * 0.5;
  }
}
function updateEmbers(dt) {
  let any = false;
  for (let k = 0; k < EMBERS; k++) {
    if (emberLife[k] <= 0) continue;
    any = true;
    emberLife[k] -= dt;
    if (emberLife[k] <= 0) { emberPos[k * 3 + 1] = -999; continue; }
    emberVel[k * 3 + 1] -= 5.5 * dt;
    emberPos[k * 3] += emberVel[k * 3] * dt;
    emberPos[k * 3 + 1] += emberVel[k * 3 + 1] * dt;
    emberPos[k * 3 + 2] += emberVel[k * 3 + 2] * dt;
  }
  if (any) emberGeo.attributes.position.needsUpdate = true;
}
let chunkIdx = 0;
function spawnChunks(x, y, z, color, n = 6, spread = 2.4) {
  for (let i = 0; i < n; i++) {
    const c = chunks[chunkIdx]; chunkIdx = (chunkIdx + 1) % chunks.length;
    c.m.material = color === 'G' ? chunkMatG : chunkMatR;
    c.m.position.set(x + (Math.random() - 0.5) * 1.4, y - Math.random() * 0.4, z + (Math.random() - 0.5) * 1.4);
    c.m.scale.setScalar(0.7 + Math.random() * 0.9);
    c.m.visible = true;
    c.vx = (Math.random() - 0.5) * spread; c.vz = (Math.random() - 0.5) * spread;
    c.vy = 1 + Math.random() * 2.6;
    c.rx = (Math.random() - 0.5) * 7; c.rz = (Math.random() - 0.5) * 7;
    c.life = 1.15;
  }
}
function updateChunks(dt) {
  for (const c of chunks) {
    if (!c.m.visible) continue;
    c.life -= dt;
    if (c.life <= 0) { c.m.visible = false; continue; }
    c.vy -= 22 * dt;
    c.m.position.x += c.vx * dt; c.m.position.y += c.vy * dt; c.m.position.z += c.vz * dt;
    c.m.rotation.x += c.rx * dt; c.m.rotation.z += c.rz * dt;
    if (c.life < 0.3) c.m.scale.multiplyScalar(0.92);
  }
}

/* ---------------- path generation ---------------- */
const gen = { next: 0, price: 2.0, safeLane: 1, gapNext: false, lastGap: -9, lastWall: -9 };
const steps = new Map();   // i -> {i, z, price, gap, blocks:[block|null x3]}
const pickups = [];        // {kind, mesh, x, y, z, taken, step}

function stepZ(i) { return -i * STEP_Z; }

function genStep(i) {
  const z = stepZ(i);
  let gap = false;
  if (gen.gapNext) {
    // price right after a gap stays close to the pre-gap price so the jump lands
    gen.price = clamp(gen.price + (Math.random() - 0.5) * 1.1 - 0.35, 0.2, 8.6);
    gen.gapNext = false;
  } else if (i > 4) {
    let dy = (Math.random() - 0.48) * 1.45 + (3.6 - gen.price) * 0.045;
    if (i > 14 && i - gen.lastWall > 6 && Math.random() < 0.13) {
      dy = 1.4 + Math.random() * 0.9; gen.lastWall = i;   // wall step: JUMP!
    }
    gen.price = clamp(gen.price + dy, 0.2, 8.6);
    if (i > 12 && i - gen.lastGap > 7 && Math.random() < 0.09) {
      gap = true; gen.lastGap = i; gen.gapNext = true;
    }
  }
  // safe lane wanders by at most one lane per step — a route always exists
  if (i > 0 && Math.random() < 0.62) {
    gen.safeLane = clamp(gen.safeLane + (Math.random() < 0.5 ? -1 : 1), 0, 2);
  }
  const step = { i, z, price: gen.price, gap, blocks: [null, null, null] };
  if (!gap) {
    const distNow = i * STEP_Z;
    const redP = i < 8 ? 0 : Math.min(0.14 + distNow * 0.00042, 0.40);
    const gapP = i < 6 ? 0 : 0.15;
    for (let lane = 0; lane < 3; lane++) {
      let color = null;
      if (lane === gen.safeLane || i <= 4) color = 'G';
      else {
        const r = Math.random();
        if (r < gapP) color = null;
        else if (r < gapP + redP) color = 'R';
        else color = 'G';
      }
      if (!color) continue;
      const top = gen.price + (lane === gen.safeLane ? 0 : (Math.random() - 0.5) * 0.16);
      const grp = makeCandle(color);
      grp.position.set(LANE_X[lane], top, z);
      scene.add(grp);
      const block = {
        step: i, lane, x: LANE_X[lane], z, top, color, grp,
        state: 'idle', crumbleAt: Infinity, crackT: 0, vy: 0, rot: (Math.random() - 0.5) * 0.14,
      };
      step.blocks[lane] = block;
      // pickups ride the green line
      if (color === 'G' && i > 3) {
        const pr = Math.random();
        const pk = lane === gen.safeLane
          ? (pr < 0.30 ? 'crescent' : pr < 0.375 ? 'star' : null)
          : (pr < 0.13 ? 'crescent' : pr < 0.175 ? 'star' : null);
        if (pk) addPickup(pk, LANE_X[lane], top + 1.12, z, i);
      }
    }
  } else {
    // a crescent arc over the gap rewards the jump
    if (Math.random() < 0.55) addPickup('crescent', LANE_X[gen.safeLane], gen.price + 1.75, z, i);
  }
  steps.set(i, step);
  gen.next = i + 1;
}

function addPickup(kind, x, y, z, step) {
  const mesh = new THREE.Group();
  const coreMesh = new THREE.Mesh(kind === 'crescent' ? crescentGeo : starGeo, kind === 'crescent' ? matCrescent : matStar);
  coreMesh.userData.spin = true;
  mesh.add(coreMesh);
  const halo = new THREE.Sprite(new THREE.SpriteMaterial({
    map: glowTex, color: kind === 'crescent' ? 0xffcf3d : 0x3fe0d2,
    transparent: true, opacity: 0.42, blending: THREE.AdditiveBlending, depthWrite: false,
  }));
  halo.scale.set(1.75, 1.75, 1);
  mesh.add(halo);
  mesh.position.set(x, y, z);
  mesh.userData.baseY = y;
  mesh.userData.phase = Math.random() * 9;
  scene.add(mesh);
  pickups.push({ kind, mesh, x, y, z, taken: false, step });
}

function ensureSteps() {
  const playerStep = Math.floor(-S.z / STEP_Z);
  while (gen.next < playerStep + GEN_AHEAD) genStep(gen.next);
  // retire far-behind steps whose blocks are all gone
  for (const [i, st] of steps) {
    if (i < playerStep - 7) {
      for (const b of st.blocks) if (b && b.state !== 'gone') { scene.remove(b.grp); b.state = 'gone'; }
      steps.delete(i);
    }
  }
  for (let k = pickups.length - 1; k >= 0; k--) {
    if (pickups[k].step < playerStep - 7) { scene.remove(pickups[k].mesh); pickups.splice(k, 1); }
  }
}

function blocksNear(z) {
  const out = [];
  const ci = Math.round(-z / STEP_Z);
  for (let i = ci - 1; i <= ci + 1; i++) {
    const st = steps.get(i); if (!st) continue;
    for (const b of st.blocks) if (b && (b.state === 'idle' || b.state === 'cracking')) out.push(b);
  }
  return out;
}
function blockAt(x, z) {
  // Among candles whose footprint holds the point, prefer the one the
  // runner is most centred on (a higher neighbour only wins if it is
  // clearly taller) — no cheap deaths for straddling an edge.
  let best = null, bestScore = -Infinity;
  for (const b of blocksNear(z)) {
    const dx = Math.abs(x - b.x), dz = Math.abs(z - b.z);
    // z slack (0.40) makes neighbouring steps' footprints just touch:
    // STEP_Z 3.05 vs BLOCK_D/2+0.40 = 1.55 — no dead seam to fall through.
    if (dx <= BLOCK_W / 2 + 0.14 && dz <= BLOCK_D / 2 + 0.40) {
      const s = b.top - (dx + dz) * 0.35;
      if (s > bestScore) { bestScore = s; best = b; }
    }
  }
  return best;
}
function landBlockAt(x, z, y) {
  // Landing-only resolver: judge what the runner's CENTRE is over, with
  // a wider catch — a rim landing on a GREEN candle counts as long as
  // the centre is on it. Between candles of similar height (a normal
  // straddle) GREEN wins the tie: a boundary graze should not kill.
  // A clearly-taller RED still wins — standing in RED is still death.
  let best = null, bestScore = -Infinity;
  for (const b of blocksNear(z)) {
    const dx = Math.abs(x - b.x), dz = Math.abs(z - b.z);
    if (dx <= BLOCK_W / 2 + 0.30 && dz <= BLOCK_D / 2 + 0.55) {
      let s = b.top - (dx + dz) * 0.35;
      if (b.top > y + AUTO_STEP) s -= 2.5;                       // a wall, not a floor
      if (best && b.color === 'G' && best.color === 'R' &&
          Math.abs(b.top - best.top) <= 0.35 && b.top <= best.top + 0.05) s = bestScore + 0.01;
      if (s > bestScore) { bestScore = s; best = b; }
    }
  }
  return best;
}

/* ---------------- the runner (procedural, crescent-emblem hoodie mascot) ---------------- */
const runner = new THREE.Group();
const R = {};
{
  const hoodie = new THREE.MeshStandardMaterial({ color: 0x26355e, roughness: 0.62 });
  const hoodie2 = new THREE.MeshStandardMaterial({ color: 0x2f4475, roughness: 0.62 });
  const pants = new THREE.MeshStandardMaterial({ color: 0x232c47, roughness: 0.72 });
  const skin = new THREE.MeshStandardMaterial({ color: 0xf2b98a, roughness: 0.6 });
  const fur = new THREE.MeshStandardMaterial({ color: 0x54402c, roughness: 0.9 });
  const teal = new THREE.MeshStandardMaterial({ color: 0x17b8a6, roughness: 0.7 });
  const gold = new THREE.MeshStandardMaterial({ color: 0xffcf3d, emissive: 0xa87400, emissiveIntensity: 0.75, roughness: 0.24, metalness: 0.7 });
  const shoeM = new THREE.MeshStandardMaterial({ color: 0xff8c42, roughness: 0.55 });
  const add = (parent, geo, mat, x, y, z) => {
    const m = new THREE.Mesh(geo, mat); m.position.set(x, y, z); m.castShadow = true; parent.add(m); return m;
  };
  // legs (pivot at hip)
  for (const s of [-1, 1]) {
    const leg = new THREE.Group(); leg.position.set(0.14 * s, 0.54, 0); runner.add(leg);
    add(leg, new THREE.BoxGeometry(0.17, 0.5, 0.19), pants, 0, -0.24, 0);
    add(leg, new THREE.BoxGeometry(0.18, 0.1, 0.32), shoeM, 0, -0.5, -0.05);
    R[s < 0 ? 'legL' : 'legR'] = leg;
  }
  // torso (hoodie capsule, leaning into the run)
  const torso = new THREE.Group(); torso.position.y = 0.54; runner.add(torso); R.torso = torso;
  add(torso, new THREE.CapsuleGeometry(0.30, 0.32, 6, 14), hoodie, 0, 0.34, 0);
  add(torso, new THREE.BoxGeometry(0.3, 0.16, 0.08), hoodie2, 0, 0.16, -0.27); // pocket
  add(torso, new THREE.BoxGeometry(0.34, 0.045, 0.02), gold, 0, 0.60, -0.295); // gold chest stripe
  add(torso, new THREE.BoxGeometry(0.05, 0.05, 0.03), gold, -0.30, 0.60, -0.10); // shoulder studs
  add(torso, new THREE.BoxGeometry(0.05, 0.05, 0.03), gold, 0.30, 0.60, -0.10);
  add(torso, new THREE.BoxGeometry(0.36, 0.05, 0.24), hoodie2, 0, 0.03, -0.02); // waistband
  const emblem = add(torso, new THREE.TorusGeometry(0.125, 0.038, 8, 22, 4.15), gold, 0, 0.44, -0.285);
  emblem.rotation.y = Math.PI; emblem.rotation.z = 0.62;
  const eglow = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTex, color: 0xffcf3d, transparent: true, opacity: 0.55, depthWrite: false }));
  eglow.scale.set(0.55, 0.55, 1); eglow.position.set(0, 0.44, -0.33); torso.add(eglow);
  R.eglow = eglow;
  // arms (pivot at shoulder)
  for (const s of [-1, 1]) {
    const arm = new THREE.Group(); arm.position.set(0.40 * s, 0.56, 0); torso.add(arm);
    add(arm, new THREE.CapsuleGeometry(0.085, 0.28, 4, 10), hoodie2, 0, -0.2, 0);
    add(arm, new THREE.SphereGeometry(0.085, 10, 8), skin, 0, -0.42, 0);
    R[s < 0 ? 'armL' : 'armR'] = arm;
  }
  // head: face + hood + ears + muzzle + face detail
  const eyeM = new THREE.MeshStandardMaterial({ color: 0x14100c, roughness: 0.35 });
  const head = new THREE.Group(); head.position.set(0, 0.86, 0); torso.add(head); R.head = head;
  add(head, new THREE.SphereGeometry(0.205, 18, 14), skin, 0, 0, -0.02);
  add(head, new THREE.SphereGeometry(0.115, 12, 10), new THREE.MeshStandardMaterial({ color: 0xffd9b0, roughness: 0.65 }), 0, -0.06, -0.15);
  const hood = add(head, new THREE.SphereGeometry(0.265, 18, 12, 0, Math.PI * 2, 0, Math.PI * 0.58), hoodie, 0, 0.045, 0.045);
  hood.rotation.x = -0.42;
  add(head, new THREE.SphereGeometry(0.035, 8, 8), eyeM, -0.075, 0.03, -0.185); // eyes
  add(head, new THREE.SphereGeometry(0.035, 8, 8), eyeM, 0.075, 0.03, -0.185);
  add(head, new THREE.SphereGeometry(0.028, 8, 8), eyeM, 0, -0.045, -0.255); // nose
  add(head, new THREE.SphereGeometry(0.016, 6, 6), new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.3 }), -0.065, 0.045, -0.21); // eye shine
  add(head, new THREE.SphereGeometry(0.016, 6, 6), new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.3 }), 0.085, 0.045, -0.21);
  for (const s of [-1, 1]) {
    add(head, new THREE.ConeGeometry(0.075, 0.17, 8), fur, 0.135 * s, 0.235, 0.03);
    add(head, new THREE.ConeGeometry(0.038, 0.09, 6), new THREE.MeshStandardMaterial({ color: 0xd9a066, roughness: 0.8 }), 0.135 * s, 0.225, 0.015); // inner ear
  }
  // scarf trailing behind
  R.scarf = add(torso, new THREE.BoxGeometry(0.36, 0.085, 0.52), teal, 0, 0.68, 0.3);
  // striped tail
  const tail = new THREE.Group(); tail.position.set(0, 0.08, 0.24); torso.add(tail); R.tail = tail;
  const tailCols = [0x5a4632, 0xc9b18c, 0x5a4632, 0xc9b18c];
  for (let i = 0; i < 4; i++) {
    add(tail, new THREE.BoxGeometry(0.15 - i * 0.018, 0.13, 0.17),
      new THREE.MeshStandardMaterial({ color: tailCols[i], roughness: 0.9 }),
      0, 0.05 + i * 0.085, 0.05 + i * 0.075);
  }
  runner.traverse((o) => { if (o.isMesh) o.castShadow = true; });
  scene.add(runner);
}
function poseRunner(dt) {
  const t = S.time;
  if (S.mode === 'run' && S.grounded) {
    const ph = t * (7 + S.speed * 0.55);
    R.legL.rotation.x = Math.sin(ph) * 0.9;
    R.legR.rotation.x = Math.sin(ph + Math.PI) * 0.9;
    R.armL.rotation.x = Math.sin(ph + Math.PI) * 0.75;
    R.armR.rotation.x = Math.sin(ph) * 0.75;
    runner.position.y = S.y + Math.abs(Math.sin(ph)) * 0.07;
    R.torso.rotation.x = 0.16 + S.speed * 0.004;
  } else if (S.mode === 'run' && !S.grounded) {
    const falling = S.vy < -2;
    R.legL.rotation.x = falling ? 0.5 : -0.75;
    R.legR.rotation.x = falling ? -0.4 : 0.55;
    R.armL.rotation.z = 0.85 + (falling ? Math.sin(t * 26) * 0.35 : 0);
    R.armR.rotation.z = -0.85 - (falling ? Math.cos(t * 26) * 0.35 : 0);
    R.armL.rotation.x = -0.4; R.armR.rotation.x = -0.4;
    runner.position.y = S.y;
    R.torso.rotation.x = S.vy > 2 ? 0.05 : 0.24;
  } else if (S.mode === 'dying') {
    runner.position.y = S.y;
    runner.rotation.x = -Math.min(S.dieT * 2.4, 1.5);
  } else {
    // menu idle: gentle bob, tail sway
    runner.position.y = S.y + Math.sin(t * 2.1) * 0.03;
    R.legL.rotation.x = 0; R.legR.rotation.x = 0;
    R.armL.rotation.x = Math.sin(t * 2.1) * 0.08;
    R.armR.rotation.x = -Math.sin(t * 2.1) * 0.08;
    R.armL.rotation.z = 0.08; R.armR.rotation.z = -0.08;
    R.torso.rotation.x = 0.05;
  }
  if (R.eglow) { const p = 0.5 + Math.sin(t * 3.4) * 0.13; R.eglow.material.opacity = p; }
  R.tail.rotation.y = Math.sin(t * 3.1) * 0.22;
  R.scarf.rotation.x = -0.35 + Math.sin(t * 5.3) * 0.13 - (S.mode === 'run' ? S.speed * 0.016 : 0);
  runner.position.x = S.x;
  runner.position.z = S.z;
  if (S.mode !== 'dying') runner.rotation.x = 0;
  runner.rotation.y = clamp(-S.vx * 0.028, -0.3, 0.3);
}

/* ---------------- input: floating joystick (window-level) + keys + JUMP ---------------- */
const stick = { active: false, id: null, cx: 0, cy: 0, x: 0, y: 0 };
const keys = { left: false, right: false, up: false, down: false };
const dock = $('stickDock'), knob = $('stickKnob');
function stickCenter() {
  const r = dock.getBoundingClientRect();
  return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
}
window.addEventListener('pointerdown', (e) => {
  if (S.mode !== 'run') return;
  if (e.target.closest('button, select, input, .screen, .panel')) return;
  const vw = innerWidth;
  if (e.clientX < vw * 0.62 && !stick.active) {
    stick.active = true; stick.id = e.pointerId;
    const c = stickCenter(); stick.cx = c.x; stick.cy = c.y;
    stickMove(e);
  }
});
window.addEventListener('pointermove', (e) => { if (stick.active && e.pointerId === stick.id) stickMove(e); });
function stickEnd(e) {
  if (stick.active && e.pointerId === stick.id) {
    stick.active = false; stick.x = 0; stick.y = 0;
    knob.style.transform = 'translate(0px,0px)';
  }
}
window.addEventListener('pointerup', stickEnd);
window.addEventListener('pointercancel', stickEnd);
let stickJumpArmed = true;
function stickMove(e) {
  const dx = e.clientX - stick.cx, dy = e.clientY - stick.cy;
  const max = 40;
  const len = Math.hypot(dx, dy) || 1;
  const cl = Math.min(len, max);
  const nx = dx / len * cl, ny = dy / len * cl;
  knob.style.transform = `translate(${nx}px,${ny}px)`;
  stick.x = clamp(nx / max, -1, 1);
  stick.y = clamp(ny / max, -1, 1);
  if (stick.y < -0.62 && stickJumpArmed) { stickJumpArmed = false; doJump(); }
  if (stick.y > -0.2) stickJumpArmed = true;
}
window.addEventListener('keydown', (e) => {
  if (e.repeat) return;
  const k = e.code;
  if (k === 'ArrowLeft' || k === 'KeyA') keys.left = true;
  if (k === 'ArrowRight' || k === 'KeyD') keys.right = true;
  if (k === 'ArrowUp' || k === 'KeyW') keys.up = true;
  if (k === 'ArrowDown' || k === 'KeyS') keys.down = true;
  if (k === 'Space' || k === 'ArrowUp' || k === 'KeyW') { if (S.mode === 'run') { doJump(); e.preventDefault(); } }
  if (k === 'KeyP' || k === 'Escape') { if (S.mode === 'run') pauseGame(); else if (S.mode === 'pause') resumeGame(); }
});
window.addEventListener('keyup', (e) => {
  const k = e.code;
  if (k === 'ArrowLeft' || k === 'KeyA') keys.left = false;
  if (k === 'ArrowRight' || k === 'KeyD') keys.right = false;
  if (k === 'ArrowUp' || k === 'KeyW') keys.up = false;
  if (k === 'ArrowDown' || k === 'KeyS') keys.down = false;
});
$('btnJump').addEventListener('pointerdown', (e) => { e.preventDefault(); if (S.mode === 'run') doJump(); });

function doJump() {
  if (S.mode !== 'run') return;
  if (S.grounded) { fireJump(); return; }
  // Coyote time: he stepped off an edge a moment ago — still jump.
  if ((performance.now() - S.lastGroundedT) / 1000 <= COYOTE_MS / 1000) { fireJump(); return; }
  // Otherwise remember the press: if he lands within the buffer window,
  // the jump fires on touchdown instead of being eaten.
  S.jumpBufferT = performance.now();
}
function fireJump() {
  S.grounded = false;
  S.vy = JUMP_V;
  S.fallStartY = S.y;
  S.airTime = 0;
  S.jumpBufferT = -9;
  sfx.jump();
}

/* ---------------- scoring / landing ---------------- */
function onLand(block) {
  if (block !== S.lastBlock) {
    const dropped = S.fallStartY - block.top;
    if (dropped > 2.2 || S.bumped) S.streak = 0;
    S.streak++;
    S.score += 10 + Math.min(S.streak, 12) * 2;
    if (S.streak >= 5 && S.streak % 5 === 0) showBanner('', T('streak').replace('{n}', S.streak), 900);
    S.lastBlock = block;
    // landing dust: a small ring of wax puffs at the runner's feet
    spawnChunks(block.x, block.top + 0.12, block.z, block.color, 3, 1.6);
    spawnEmbers(S.x, block.top + 0.25, S.z, 2, 'G');
  }
  if (block.crumbleAt === Infinity) {
    // Standing pressure. Early in a run — and on the opening candles,
    // whose timer starts at spawn — the floor is patient; it tightens
    // as you get further in.
    block.crumbleAt = S.time + (S.dist < 60 || block.step < 24 ? 3.6 : 2.6);
  }
  S.curBlock = block;
  S.bumped = false;
  sfx.land(S.streak);
}
function die(kind) {
  if (S.mode !== 'run') return;
  S.mode = 'dying'; S.dieKind = kind; S.dieT = 0;
  if (kind === 'red') {
    sfx.shatter();
    spawnChunks(S.x, S.y + 1, S.z, 'R', 14, 4.5);
    spawnEmbers(S.x, S.y + 0.8, S.z, 14, 'R');
    $('deathFlash').style.opacity = '1';
    setTimeout(() => { $('deathFlash').style.opacity = '0'; }, 260);
  } else {
    sfx.fall();
  }
}

/* ---------------- physics step ---------------- */
function stepPhysics(dt) {
  S.speed = Math.min(SPEED_MAX, SPEED0 + S.dist * SPEED_RAMP);
  // Gentle input curve: small stick movements already steer usefully,
  // full deflection stays full. Tiny deadzone kills thumb jitter.
  let inputX = stick.active ? stick.x : (keys.left ? -1 : 0) + (keys.right ? 1 : 0);
  inputX = clamp(inputX, -1, 1);
  if (Math.abs(inputX) < STICK_DEAD) inputX = 0;
  const ax = Math.abs(inputX);
  inputX = Math.sign(inputX) * (ax * (0.55 + 0.45 * ax));
  // Air steering is stronger than ground steering — a jump can be
  // corrected mid-flight instead of being a one-way ticket.
  const targetVx = inputX * (S.grounded ? 11.5 : 13.5);
  S.vx = lerp(S.vx, targetVx, clamp(dt * (S.grounded ? 11 : 9), 0, 1));
  S.x = clamp(S.x + S.vx * dt, -3.55, 3.55);
  const prevY = S.y;

  if (S.grounded) {
    S.z -= S.speed * dt;
    const support = blockAt(S.x, S.z);
    if (support && support === S.curBlock && Math.abs(support.top - S.y) < 0.3) {
      // still on the same candle
    } else if (support && support.top <= S.y + AUTO_STEP) {
      if (support.color === 'R') { S.y = support.top; die('red'); return; }
      if (support.top < S.y - 0.55) {
        // stepped off a ledge — become airborne and fall to it
        S.grounded = false; S.vy = 0; S.fallStartY = S.y; S.airTime = 0; S.curBlock = null;
        S.lastGroundedT = performance.now();
      } else {
        S.y = support.top;
        if (support !== S.curBlock) onLand(support); else S.curBlock = support;
      }
    } else if (support && support.top > S.y + AUTO_STEP) {
      // wall: a taller candle blocks the way — jump it, the floor is crumbling
      S.z = support.z + BLOCK_D / 2 + 0.19;
      S.bumped = true;
      if (S.curBlock && S.curBlock.crumbleAt === Infinity) S.curBlock.crumbleAt = S.time + 1.6;
    } else {
      // nothing underfoot: walked off an edge or over a gap
      S.grounded = false; S.vy = 0; S.fallStartY = S.y; S.airTime = 0; S.curBlock = null;
      S.lastGroundedT = performance.now();
    }
  }
  if (!S.grounded && S.mode === 'run') {
    S.airTime += dt;
    // Lighter gravity on the rise = a floatier, more generous jump;
    // full gravity on the way down keeps it snappy, not floaty-forever.
    S.vy -= (S.vy > 0 ? GRAV_RISE : GRAV) * dt;
    S.y += S.vy * dt;
    S.z -= S.speed * dt;
    if (S.vy <= 0) {
      const b = landBlockAt(S.x, S.z, prevY);
      // Land when we were above the top last frame and have now reached
      // it (catch window under the plane so fast falls and seam entries
      // at low frame rates still catch instead of tunnelling).
      if (b && prevY >= b.top - 0.02 && S.y <= b.top + 0.02 && S.y >= b.top - CATCH_BELOW) {
        if (b.color === 'R') { S.y = b.top; die('red'); return; }
        S.y = b.top; S.grounded = true; S.vy = 0;
        onLand(b);
        // Buffered jump: a press just before touchdown fires now.
        if ((performance.now() - S.jumpBufferT) / 1000 <= BUFFER_MS / 1000) fireJump();
      } else if (b && b.top > prevY + AUTO_STEP) {
        // slammed into the side of a taller candle: slide back to its edge
        S.z = Math.max(S.z, b.z + BLOCK_D / 2 + 0.19);
        S.bumped = true;
      }
    }
    if (S.y < -8) { die('fall'); return; }
  }
  S.dist = Math.max(S.dist, -S.z);
  S.score += S.speed * dt * 1.0;
}

/* ---------------- crumble / falling blocks ---------------- */
function updateBlocks(dt) {
  const playerStep = Math.floor(-S.z / STEP_Z);
  for (const st of steps.values()) {
    if (st.i > playerStep + 3) continue;
    for (const b of st.blocks) {
      if (!b) continue;
      if (b.state === 'idle') {
        if (S.z < b.z - 1.5 && b.crumbleAt === Infinity) {
          // Patient early (first ~60 m), tightening as the run deepens.
          const base = S.dist < 60 ? 3.1 : clamp(2.3 - (S.speed - 9) * 0.08, 1.35, 2.3);
          b.crumbleAt = S.time + base;
        }
        if (S.time >= b.crumbleAt) {
          b.state = 'cracking'; b.crackT = 0;
          spawnChunks(b.x, b.top + 0.2, b.z, b.color, 6);
          spawnEmbers(b.x, b.top + 0.3, b.z, 4, b.color);
          sfx.crack();
        }
      } else if (b.state === 'cracking') {
        b.crackT += dt;
        b.grp.position.x = b.x + (Math.random() - 0.5) * 0.05;
        b.grp.position.z = b.z + (Math.random() - 0.5) * 0.05;
        if (Math.random() < dt * 14) spawnChunks(b.x, b.top, b.z, b.color, 1);
        if (Math.random() < dt * 7) spawnEmbers(b.x, b.top + 0.2, b.z, 1, b.color);
        if (b.crackT > 0.45) {
          b.state = 'falling'; b.vy = 0;
          spawnChunks(b.x, b.top, b.z, b.color, 8);
          spawnEmbers(b.x, b.top + 0.2, b.z, 6, b.color);
          if (S.grounded && S.curBlock === b) {
            S.grounded = false; S.vy = 0; S.fallStartY = S.y; S.airTime = 0; S.curBlock = null;
          }
        }
      } else if (b.state === 'falling') {
        b.vy -= 26 * dt;
        b.grp.position.y += b.vy * dt;
        b.grp.rotation.x += b.rot * dt * 3;
        b.grp.rotation.z += b.rot * dt * 2;
        if (b.grp.position.y < b.top - 46) { scene.remove(b.grp); b.state = 'gone'; }
      }
      // flame + halo flicker (shared phase per candle)
      const f = b.grp.userData.flame;
      if (f && b.state !== 'gone') {
        const s = 1 + Math.sin(S.time * 12 + f.userData.phase) * 0.13 + Math.sin(S.time * 29 + f.userData.phase * 2) * 0.05;
        f.scale.set(0.85 * s, 1.25 * (2 - s) * 0.9 + 0.25, 1);
        const halo = b.grp.userData.halo;
        if (halo) {
          const hs = 2.3 * (1 + Math.sin(S.time * 9 + f.userData.phase) * 0.09);
          halo.scale.set(hs, hs, 1);
        }
      }
    }
  }
}

function updatePickups(dt) {
  for (const p of pickups) {
    if (p.taken) continue;
    // spin the coin/star core only — the halo sprite stays unrotated
    for (const ch of p.mesh.children) if (ch.userData.spin) ch.rotation.y += dt * 2.6;
    p.mesh.position.y = p.y + Math.sin(S.time * 2.4 + p.mesh.userData.phase) * 0.14;
    if (S.mode === 'run' && Math.abs(S.x - p.x) < 1.05 && Math.abs(S.z - p.z) < 1.05 && Math.abs((S.y + 0.95) - p.mesh.position.y) < 1.55) {
      p.taken = true; p.mesh.visible = false;
      if (p.kind === 'crescent') {
        S.crescents++; S.score += CRESCENT_SCORE; sfx.crescent();
        $('hudCres').style.transform = 'scale(1.14)';
        setTimeout(() => { $('hudCres').style.transform = ''; }, 130);
        spawnEmbers(p.x, p.mesh.position.y, p.z, 8, 'gold');
      } else {
        S.stars++; S.score += STAR_SCORE; sfx.star();
        showBanner('', `+${STAR_SCORE} ★`, 750);
        spawnEmbers(p.x, p.mesh.position.y, p.z, 10, 'teal');
      }
    }
  }
}

/* ---------------- UI ---------------- */
const hudCache = { score: '', cres: '', dist: '' };
function updateHUD() {
  const sc = String(Math.floor(S.score));
  if (sc !== hudCache.score) { hudCache.score = sc; $('hudScoreVal').textContent = sc; }
  const cr = String(S.crescents);
  if (cr !== hudCache.cres) { hudCache.cres = cr; $('hudCresVal').textContent = cr; }
  const d = String(Math.floor(S.dist));
  if (d !== hudCache.dist) { hudCache.dist = d; $('hudDistVal').textContent = d; }
}
let bannerTO = null;
function showBanner(main, sub, dur = 1100) {
  const bm = $('bannerMain'), bs = $('bannerSub');
  bm.textContent = main; bs.textContent = sub;
  bm.classList.remove('fadeout'); bs.classList.remove('fadeout');
  clearTimeout(bannerTO);
  bannerTO = setTimeout(() => { bm.classList.add('fadeout'); bs.classList.add('fadeout'); }, dur);
}
function applyLang() {
  $('menuTag').textContent = T('tag');
  $('playBtn').textContent = T('play');
  $('howBtn').textContent = T('how');
  $('boardBtn').textContent = T('board');
  $('howTitle').textContent = T('howTitle');
  $('howBody').innerHTML = HOWTXT();
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
  $('labScore').textContent = T('score');
  $('labCres').textContent = T('crescent');
  $('labDist').textContent = T('dist');
  $('btnJump').textContent = T('jump');
  $('secStrip').textContent = SECTXT();
  $('muteBtn').textContent = S.muted ? '🔇' : '🔊';
}
{
  const sel = $('langSel');
  for (const [code, label] of LANGS) {
    const o = document.createElement('option');
    o.value = code; o.textContent = label;
    if (code === LANG_CUR) o.selected = true;
    sel.appendChild(o);
  }
  sel.addEventListener('change', () => {
    LANG_CUR = sel.value;
    try { localStorage.setItem('candleChaosLang', LANG_CUR); } catch (e) {}
    applyLang();
  });
}
function show(id) {
  for (const s of ['menu', 'howPanel', 'boardPanel', 'pausePanel', 'overPanel']) $(s).classList.add('hidden');
  if (id) $(id).classList.remove('hidden');
  const inRun = S.mode === 'run' || S.mode === 'dying' || S.mode === 'pause';
  $('hud').classList.toggle('hidden', !inRun);
  $('touchUI').classList.toggle('hidden', S.mode !== 'run');
  $('stickDock').classList.toggle('hidden', S.mode !== 'run');
}

/* ---------------- leaderboard ---------------- */
let boardData = null, boardTab = 'all';
async function loadBoard() {
  try { const r = await fetch('/api/luna-games?game=candle'); boardData = await r.json(); } catch (e) { boardData = null; }
  renderBoard();
}
function renderBoard() {
  const body = $('boardBody');
  const rows = boardData && boardData[boardTab];
  if (!rows) { body.innerHTML = `<div style="text-align:center;padding:12px">${T('loading')}</div>`; return; }
  if (!rows.length) { body.innerHTML = `<div style="text-align:center;padding:12px">${T('noScores')}</div>`; return; }
  body.innerHTML = '<table class="board">' + rows.map((r, i) =>
    `<tr><td>${i + 1}</td><td class="nm"></td><td class="sc">${Math.floor(r.score).toLocaleString()}</td></tr>`).join('') + '</table>';
  body.querySelectorAll('td.nm').forEach((td, i) => { td.textContent = rows[i].name; });
}
async function submitScore() {
  if (S.submitted) return;
  const name = $('nameInput').value.trim();
  if (name.length < 2) { $('nameInput').focus(); return; }
  S.submitted = true;
  try { localStorage.setItem('candleChaosName', name); } catch (e) {}
  try {
    const r = await fetch('/api/luna-games?game=candle', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name, score: Math.floor(S.score), seconds: Math.floor(S.runTime) }),
    });
    const j = await r.json();
    $('savedLine').textContent = j && j.rank ? T('rank').replace('{n}', j.rank) : T('saved');
  } catch (e) {
    $('savedLine').textContent = T('saved');
  }
  loadBoard();
}

/* ---------------- run control ---------------- */
function resetWorld() {
  for (const st of steps.values()) for (const b of st.blocks) if (b) scene.remove(b.grp);
  steps.clear();
  for (const p of pickups) scene.remove(p.mesh);
  pickups.length = 0;
  for (const c of chunks) c.m.visible = false;
  emberLife.fill(0);
  for (let i = 0; i < EMBERS; i++) emberPos[i * 3 + 1] = -999;
  emberGeo.attributes.position.needsUpdate = true;
  gen.next = 0; gen.price = 2.0; gen.safeLane = 1; gen.gapNext = false; gen.lastGap = -9; gen.lastWall = -9;
  S.score = 0; S.dist = 0; S.crescents = 0; S.stars = 0; S.streak = 0;
  S.speed = 0; S.runTime = 0;
  S.x = 0; S.z = -2 * STEP_Z; S.vx = 0; S.vy = 0;
  S.grounded = true; S.bumped = false; S.airTime = 0;
  S.lastGroundedT = -9; S.jumpBufferT = -9;
  S.submitted = false; S.dieKind = null;
  runner.rotation.set(0, 0, 0);
  ensureSteps();
  const st2 = steps.get(2);
  const startBlock = st2 && st2.blocks[1];
  S.y = startBlock ? startBlock.top : 2.0;
  S.curBlock = startBlock; S.lastBlock = startBlock;
  hudCache.score = hudCache.cres = hudCache.dist = '';
  updateHUD();
}
function startRun() {
  audio(); sfx.click();
  resetWorld();
  S.mode = 'run';
  show(null);
  $('overPanel').classList.add('hidden');
  showBanner(T('go'), '', 800);
}
function pauseGame() {
  if (S.mode !== 'run') return;
  S.mode = 'pause'; show('pausePanel'); sfx.click();
}
function resumeGame() {
  if (S.mode !== 'pause') return;
  S.mode = 'run'; show(null); sfx.click();
}
function toMenu() {
  S.mode = 'menu';
  resetWorld();
  show('menu');
}
function gameOver() {
  S.mode = 'over';
  const sc = Math.floor(S.score);
  if (sc > S.best) { S.best = sc; try { localStorage.setItem('candleChaosBest', String(sc)); } catch (e) {} }
  $('finalScoreLine').textContent = `${T('finalScore')}: ${sc.toLocaleString()}`;
  $('finalDetail').textContent = T('distLine')
    .replace('{d}', Math.floor(S.dist)).replace('{c}', S.crescents).replace('{s}', S.stars);
  $('savedLine').textContent = '';
  try { $('nameInput').value = localStorage.getItem('candleChaosName') || ''; } catch (e) {}
  show('overPanel');
  loadBoard();
}

$('playBtn').addEventListener('click', startRun);
$('howBtn').addEventListener('click', () => { sfx.click(); show('howPanel'); });
$('howClose').addEventListener('click', () => { sfx.click(); show(S.mode === 'menu' ? 'menu' : null); if (S.mode === 'menu') show('menu'); });
$('boardBtn').addEventListener('click', () => { sfx.click(); show('boardPanel'); loadBoard(); });
$('boardClose').addEventListener('click', () => { sfx.click(); show('menu'); });
$('tabAll').addEventListener('click', () => { boardTab = 'all'; $('tabAll').classList.add('on'); $('tabWeek').classList.remove('on'); renderBoard(); });
$('tabWeek').addEventListener('click', () => { boardTab = 'week'; $('tabWeek').classList.add('on'); $('tabAll').classList.remove('on'); renderBoard(); });
$('pauseBtn').addEventListener('click', pauseGame);
$('resumeBtn').addEventListener('click', resumeGame);
$('quitBtn').addEventListener('click', () => { sfx.click(); toMenu(); });
$('muteBtn').addEventListener('click', () => {
  S.muted = !S.muted;
  try { localStorage.setItem('candleChaosMute', S.muted ? '1' : '0'); } catch (e) {}
  $('muteBtn').textContent = S.muted ? '🔇' : '🔊';
  if (!S.muted) sfx.click();
});
$('submitBtn').addEventListener('click', submitScore);
$('againBtn').addEventListener('click', startRun);
$('menuBtn').addEventListener('click', () => { sfx.click(); toMenu(); });
document.addEventListener('visibilitychange', () => { if (document.hidden && S.mode === 'run') pauseGame(); });

/* ---------------- camera ---------------- */
const camTarget = new THREE.Vector3();
function updateCamera(dt) {
  if (S.mode === 'menu') {
    const t = S.time * 0.12;
    camera.position.set(Math.sin(t) * 5.6, S.y + 4.4 + Math.sin(S.time * 0.4) * 0.4, S.z + 7.6 + Math.cos(t) * 1.4);
    camTarget.set(0, S.y + 1.1, S.z - 4);
    camera.lookAt(camTarget);
    return;
  }
  // Behind-and-above, looking up-path: the runner rides the LOWER third
  // of the frame and the chart path fills the view ahead (spec framing).
  const px = S.x * 0.55;
  const py = S.y + 4.6 - clamp(S.vy * 0.05, -0.9, 0.7);
  // px/py ease smoothly; z is set exactly each frame (constant offset —
  // no judder). Ease factors are frame-rate independent.
  const kx = 1 - Math.exp(-dt * 7), ky = 1 - Math.exp(-dt * 5.2);
  camera.position.x = lerp(camera.position.x, px, kx);
  camera.position.y = lerp(camera.position.y, py, ky);
  camera.position.z = S.z + 8.6;
  camTarget.set(S.x * 0.72, S.y + 1.55, S.z - 10);
  camera.lookAt(camTarget);
  chartGroup.position.z = S.z - 165;
  chartGroup.position.y = clamp(S.y - 2, -4, 6);
  rimGroup.position.z = S.z + 130 - (((-S.z) % 12) + 12) % 12;
  midGroup.position.z = S.z + 118 - (((-S.z) % 15) + 15) % 15;
  moonLight.position.set(S.x + 9, S.y + 20, S.z + 7);
  moonLight.target.position.set(S.x, S.y, S.z - 6);
  glowLight.position.set(S.x, S.y + 2.6, S.z - 1.5);
}

/* ---------------- main loop ---------------- */
const clock = new THREE.Clock();
function loop() {
  requestAnimationFrame(loop);
  const dt = Math.min(clock.getDelta(), 0.05);
  S.time += dt;
  if (S.mode === 'run' && !S.qaHold) {
    S.runTime += dt;
    stepPhysics(dt);
    if (S.mode === 'run') { // physics may have killed the player
      ensureSteps();
      updateBlocks(dt);
      updatePickups(dt);
      updateHUD();
    }
  } else if (S.mode === 'dying') {
    S.dieT += dt;
    if (S.dieKind === 'red') {
      S.vy -= GRAV * dt; S.y += S.vy * dt;
    } else if (S.dieKind === 'fall') {
      S.vy -= GRAV * dt; S.y += S.vy * dt; S.z -= S.speed * dt * 0.4;
    }
    updateBlocks(dt);
    updateChunks(dt);
    if (S.dieT > 0.95) gameOver();
  } else if (S.mode === 'menu' || S.mode === 'over') {
    updateBlocks(dt);
    updatePickups(dt);
  }
  updateChunks(dt);
  updateEmbers(dt);
  // ambient flame sparks drifting up from the nearby candles —
  // denser since the premium pass: a living scene should breathe
  if ((S.mode === 'run' || S.mode === 'menu') && Math.random() < dt * 11) {
    const nb = blocksNear(S.z - 6 - Math.random() * 10);
    if (nb.length) {
      const b = nb[(Math.random() * nb.length) | 0];
      if (b.state === 'idle') spawnEmbers(b.x, b.top + 0.6, b.z, 1, b.color);
    }
  }
  poseRunner(dt);
  updateCamera(dt);
  renderer.render(scene, camera);
}

/* ---------------- boot ---------------- */
applyLang();
resetWorld();
S.mode = 'menu';
show('menu');
$('loadFill').style.width = '100%';
setTimeout(() => { $('loading').classList.add('hidden'); }, 350);
window.__ccBooted = true;
loadBoard();
loop();

/* ---------------- QA handle (invisible; used by automated checks) ---------------- */
window.CCQA = {
  S,
  start: startRun,
  jump: doJump,
  pause: pauseGame,
  resume: resumeGame,
  setStick(x) { stick.active = true; stick.x = x; },
  clearStick() { stick.active = false; stick.x = 0; },
  mode: () => S.mode,
  hud: () => ({ score: $('hudScoreVal').textContent, cres: $('hudCresVal').textContent, dist: $('hudDistVal').textContent }),
  findBlock(color) {
    let best = null;
    for (const st of steps.values()) for (const b of st.blocks) {
      if (b && b.color === color && b.state === 'idle' && b.z < S.z - 2) { if (!best || b.z > best.z) best = b; }
    }
    return best ? { x: b_x(best), z: best.z, top: best.top } : null;
    function b_x(b) { return b.x; }
  },
  teleportToBlock(color) {
    const t = this.findBlock(color);
    if (!t) return false;
    S.x = t.x; S.z = t.z; S.y = t.top + 0.4; S.vy = -1; S.grounded = false; S.fallStartY = S.y; S.curBlock = null;
    return true;
  },
  /* Drop the runner high above the nearest upcoming gap step so the
     fall carries him over it and (bot-steered) onto the far side. */
  dropOverGap() {
    const ci = Math.floor(-S.z / STEP_Z);
    for (let i = ci + 1; i < ci + 40; i++) {
      const st = steps.get(i);
      if (st && st.gap) {
        S.x = LANE_X[gen.safeLane]; S.z = st.z + STEP_Z * 0.55;
        S.y = st.price + 4.6; S.vy = 0.5; S.grounded = false;
        S.fallStartY = S.y; S.curBlock = null;
        return { gapStep: i, z: st.z };
      }
    }
    return null;
  },
  crumbling() {
    for (const st of steps.values()) for (const b of st.blocks) {
      if (b && (b.state === 'cracking' || b.state === 'falling')) return { state: b.state, z: b.z };
    }
    return null;
  },
  stickVisible() {
    const d = $('stickDock');
    return !d.classList.contains('hidden') && d.getBoundingClientRect().width > 0;
  },
  /* Scripted forgiveness probes for the control-ease pass. Each one
     arranges a precise scenario with deterministic steps and reports
     PASS/FAIL — see qa/ease_tests.py. */
  findStepGapAhead() {
    const ci = Math.floor(-S.z / STEP_Z);
    for (let i = ci + 1; i < ci + 60; i++) {
      const st = steps.get(i);
      if (st && st.gap) return i;
    }
    return -1;
  },
  placeRunway(gapStep) {
    // stand the runner grounded on the candle just before the gap,
    // in the safe lane, near its front edge, low fall state
    const st = steps.get(gapStep - 1);
    if (!st) return false;
    let b = null;
    for (const bb of st.blocks) if (bb && bb.color === 'G' && (!b || bb.top > b.top)) b = bb;
    if (!b) return false;
    S.x = b.x; S.z = b.z - BLOCK_D / 2 - 0.15; S.y = b.top;
    S.vx = 0; S.vy = 0; S.grounded = true; S.curBlock = b; S.bumped = false;
    S.jumpBufferT = -9;
    return true;
  },
  placeStraddle(pct) {
    // airborne just above a spot where GREEN and RED candles of the
    // same step sit at (nearly) the same height; the runner's centre
    // lands pct of the way from the green centre toward the red one.
    const ci = Math.floor(-S.z / STEP_Z);
    for (let i = ci + 1; i < ci + 90; i++) {
      const st = steps.get(i); if (!st) continue;
      for (let a = 0; a < 2; a++) {
        const g = st.blocks[a], r = st.blocks[a + 1];
        if (g && r && g.color === 'G' && r.color === 'R' &&
            Math.abs(g.top - r.top) <= 0.3 && r.top >= g.top - 0.05) {
          S.x = g.x + (r.x - g.x) * pct;
          S.z = g.z + 1.1; S.y = Math.max(g.top, r.top) + 0.35;
          S.vx = 0; S.vy = -3; S.grounded = false; S.curBlock = null;
          S.fallStartY = S.y; S.jumpBufferT = -9;
          return { step: i, gx: g.x, rx: r.x, top: Math.max(g.top, r.top) };
        }
      }
    }
    return null;
  },
  placeDrop(yOff, vy0) {
    // airborne above the block the runner is currently standing on —
    // a controlled short drop for the jump-buffer probe
    if (!S.curBlock) return false;
    S.y = S.curBlock.top + yOff; S.vy = vy0; S.grounded = false;
    S.fallStartY = S.y; S.jumpBufferT = -9;
    return true;
  },
  state() {
    return {
      mode: S.mode, grounded: S.grounded, x: +S.x.toFixed(3), y: +S.y.toFixed(3),
      z: +S.z.toFixed(3), vy: +S.vy.toFixed(2), dist: Math.floor(S.dist),
      block: S.curBlock ? { color: S.curBlock.color, step: S.curBlock.step } : null,
    };
  },
  /* Advance the simulation deterministically (no rendering) — the
     render loop runs far too slowly under software GL for real-time
     bot play. auto() steers toward the nearest green candle and jumps
     gaps/walls, like a careful player. */
  step(sec) {
    const dt = 1 / 30;
    S.qaHold = true;
    for (let t = 0; t < sec; t += dt) {
      S.time += dt;
      if (S.mode === 'run') {
        S.runTime += dt; stepPhysics(dt);
        if (S.mode === 'run') { ensureSteps(); updateBlocks(dt); updatePickups(dt); }
      } else if (S.mode === 'dying') {
        S.dieT += dt;
        if (S.dieKind === 'red' || S.dieKind === 'fall') { S.vy -= GRAV * dt; S.y += S.vy * dt; }
        updateBlocks(dt);
        if (S.dieT > 0.95) { gameOver(); break; }
      } else break;
      updateChunks(dt); updateEmbers(dt);
    }
    S.qaHold = false;
    updateHUD();
    return { mode: S.mode, score: Math.floor(S.score), dist: Math.floor(S.dist), crescents: S.crescents, stars: S.stars, grounded: S.grounded };
  },
  auto(sec) {
    const dt = 1 / 30;
    let overGap = false, crossedGap = false, sawCrumble = false;
    S.qaHold = true;
    for (let t = 0; t < sec; t += dt) {
      if (S.mode !== 'run') break;
      // steer for the most reachable green candle a few metres ahead
      let target = null, bestCost = Infinity;
      for (const st of steps.values()) for (const b of st.blocks) {
        if (!b || b.color !== 'G' || b.state === 'gone') continue;
        const dz = S.z - b.z;
        if (dz < -1 || dz > 16) continue;
        const cost = Math.abs(dz - 6) + Math.abs(b.x - S.x) * 1.6 + Math.max(0, b.top - S.y - 1) * 2;
        if (cost < bestCost) { bestCost = cost; target = b; }
      }
      stick.active = true;
      stick.x = target ? clamp((target.x - S.x) * 0.85, -1, 1) : 0;
      if (S.grounded) {
        // look further ahead (3.0) so the bot commits to edges/gaps
        // early enough for the forgiving jump to carry it
        const ahead = blockAt(S.x, S.z - 3.0);
        if (!ahead || ahead.top > S.y + AUTO_STEP) doJump();
      }
      S.time += dt; S.runTime += dt;
      stepPhysics(dt);
      if (S.mode !== 'run') break;
      ensureSteps(); updateBlocks(dt); updatePickups(dt);
      updateChunks(dt); updateEmbers(dt);
      if (!S.grounded) {
        const st = steps.get(Math.floor(-S.z / STEP_Z));
        if (st && st.gap) overGap = true;
      } else if (overGap) crossedGap = true;
      if (!sawCrumble) {
        outer: for (const st of steps.values()) for (const b of st.blocks) {
          if (b && (b.state === 'cracking' || b.state === 'falling')) { sawCrumble = true; break outer; }
        }
      }
    }
    stick.active = false; stick.x = 0;
    S.qaHold = false;
    updateHUD();
    return {
      mode: S.mode, score: Math.floor(S.score), dist: Math.floor(S.dist),
      crescents: S.crescents, stars: S.stars, streak: S.streak,
      crossedGap, sawCrumble, x: +S.x.toFixed(2), y: +S.y.toFixed(2),
    };
  },
};
