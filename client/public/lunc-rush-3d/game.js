/* ============================================================
   LUNC RUSH 3D — Luna Classic endless runner (Three.js r160)
   Hero: ROO the kangaroo (original character, procedural model)
   Run: 3-lane behind-view runner through the Australian outback.
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
const COIN_SCORE = 25, STAR_SCORE = 250, DIST_SCORE = 1;

/* ---------------- the S-curve track (Nov 7, owner directive) ----------------
   The giant loop/tube is GONE. The track now bends left and right in
   smooth S-curves and the player steers through them with the existing
   free-steering stick. Bending is done the cheap, crash-safe way this
   engine already supports: NOTHING in the world is re-meshed — every
   frame, each visible thing's screen x is offset by (bend at ITS
   distance ahead − bend at the hero). Near the hero the offset is ~0
   (the track under you never jumps); far ahead the road visibly curves
   away, and the hero is carried along by BEND_DRIFT so an untouched
   stick rides the centre line through the bends.
   BEND_MAX / SPEED: required lateral drift peaks at ~1.35 m/s while
   full-stick steering moves ~11 m/s — curves are gentle by design and
   clearable at the UNCHANGED speed constants (18→34 m/s). */
const BEND_AMP = 7.5;                       // max lateral offset of the centre line (m)
const BEND_WL = 340;                        // one full S wavelength (m)
const BEND_K = (Math.PI * 2) / BEND_WL;
function trackBend(d) { return BEND_AMP * Math.sin(d * BEND_K); }
function trackBendVel(d) { return BEND_AMP * BEND_K * Math.cos(d * BEND_K); } // d(bend)/d(dist), unitless
/* screen-x for a world thing: its own x plus the bend at its distance
   ahead of the hero (a = metres ahead of the hero; may be negative for
   things just behind). Hero sits at a=0. */
let bendHero = 0; // trackBend(S.dist), refreshed once per frame
function bendX(x, a) { return x + (trackBend(S.dist + a) - bendHero); }
/* Lanes/pickups/obstacles are stored RELATIVE to the moving centre line
   (x_rel = screen x − bend at that distance), so collisions and pickups
   compare like-for-like against S.relX, the hero's own offset from the
   centre line. S.relX is refreshed once per frame from laneX. */

/* ---------------- state ---------------- */
const S = {
  mode: 'menu',           // menu | run | pause | over
  dist: 0, coins: 0, stars: 0, score: 0, hearts: 3,
  speed: 0, time: 0, runTime: 0,
  lane: 1, laneX: 0, steerX: null, y: 0, vy: 0, grounded: true,
  rollT: 0, stumbleT: 0, invulnT: 0, hitFlash: 0,
  nextArchAt: 420, archCount: 0, relX: 0,
  pitchChain: 0, muted: false, started: false, pilot: false,
};
try { S.muted = localStorage.getItem('luncRush3dMute') === '1'; } catch (e) {}

/* ---------------- three setup ---------------- */
const container = document.getElementById('game');
const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
/* explicit opaque sky-blue clear colour: any pixel the dome ever misses
   clears to sky, never black/white (flash hygiene, Nov 7) */
renderer.setClearColor(0xffc98a, 1);
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
scene.background = new THREE.Color(0xffc98a);
scene.fog = new THREE.Fog(0xf7cf9a, 90, 430);

const camera = new THREE.PerspectiveCamera(66, viewSize().w / viewSize().h, 0.1, 1200);
camera.position.set(0, 5.6, 9.5);
/* Smoothed camera look-at point (polish pass): the look target is damped
   on its own faster spring than the camera body, so lane changes pan the
   view INTO the move instead of the frame swimming after it. Damping is
   exponential (frame-rate independent) — no jitter/snapping at any fps. */
const lookPt = new THREE.Vector3(0, 1.1, -12);
const speedFx = document.getElementById('speedFx'); // $ helper is defined later in the file

const hemi = new THREE.HemisphereLight(0xffe3b8, 0xa2542e, 0.95);
scene.add(hemi);
const sun = new THREE.DirectionalLight(0xffdf9e, 2.0);
sun.position.set(-24, 26, -46);
scene.add(sun);
const fill = new THREE.DirectionalLight(0xffc9a0, 0.35);
fill.position.set(20, 16, 30);
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
  /* painted red-centre earth: ochre washes, spinifex dots, pebble speckle */
  g.fillStyle = '#c96f35'; g.fillRect(0, 0, w, h);
  const wash = ['#b85f2b', '#d67f3e', '#a85424', '#e08f4a', '#bd6530'];
  for (let i = 0; i < 46; i++) {
    g.fillStyle = wash[i % wash.length]; g.globalAlpha = 0.24;
    g.beginPath(); g.ellipse(Math.random() * w, Math.random() * h, 26 + Math.random() * 70, 16 + Math.random() * 44, Math.random() * 3, 0, 7); g.fill();
  }
  g.globalAlpha = 1;
  for (let i = 0; i < 3800; i++) { /* spinifex tuft dots: dry straw + olive */
    const x = Math.random() * w, y = Math.random() * h, r = 1 + Math.random() * 2.6;
    g.fillStyle = Math.random() < 0.55 ? 'rgba(198,164,80,0.5)' : 'rgba(128,124,58,0.45)';
    g.beginPath(); g.arc(x, y, r, 0, 7); g.fill();
  }
  for (let i = 0; i < 900; i++) { /* pebbles + pale grit */
    g.fillStyle = Math.random() < 0.5 ? 'rgba(120,66,30,0.35)' : 'rgba(255,214,160,0.28)';
    g.fillRect(Math.random() * w, Math.random() * h, 2, 1.6);
  }
  g.strokeStyle = 'rgba(140,74,32,0.30)'; g.lineWidth = 2; /* dry cracks */
  for (let i = 0; i < 12; i++) {
    g.beginPath(); let x = Math.random() * w, y = Math.random() * h; g.moveTo(x, y);
    for (let k = 0; k < 3; k++) { x += (Math.random() - 0.5) * 44; y += (Math.random() - 0.5) * 30; g.lineTo(x, y); }
    g.stroke();
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
  /* red-rock strata — rust bands, cracks and speckle (no checkerboard) */
  const bands = ['#b5502a', '#a34724', '#c05e31', '#9c3f20', '#b95630', '#a84a26', '#c46438', '#96401f'];
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
  /* gum bark: pale smooth trunk with peeling rust-and-charcoal ribbons */
  g.fillStyle = '#d9c6a8'; g.fillRect(0, 0, w, h);
  for (let i = 0; i < 30; i++) {
    g.fillStyle = Math.random() < 0.5 ? 'rgba(168,104,62,0.4)' : 'rgba(110,96,84,0.35)';
    const x = Math.random() * w; g.fillRect(x, Math.random() * h * 0.4, 3 + Math.random() * 5, 30 + Math.random() * 90);
  }
  g.fillStyle = 'rgba(240,228,205,0.5)';
  for (let i = 0; i < 22; i++) g.fillRect(Math.random() * w, 0, 2, h);
});
const waterTex = canvasTex(512, 512, (g, w, h) => {
  /* cracked claypan flats: pale cracked earth where the far plains run */
  const gr = g.createLinearGradient(0, 0, w, h);
  gr.addColorStop(0, '#dfae72'); gr.addColorStop(0.5, '#d59e5e'); gr.addColorStop(1, '#cb9250');
  g.fillStyle = gr; g.fillRect(0, 0, w, h);
  g.strokeStyle = 'rgba(122,74,36,0.4)'; g.lineWidth = 1.6;
  for (let i = 0; i < 90; i++) { /* polygonal crack web */
    let x = Math.random() * w, y = Math.random() * h;
    g.beginPath(); g.moveTo(x, y);
    for (let k = 0; k < 5; k++) { x += (Math.random() - 0.5) * 64; y += (Math.random() - 0.5) * 64; g.lineTo(x, y); }
    g.stroke();
  }
  for (let i = 0; i < 2600; i++) { /* grit + salt flecks */
    g.fillStyle = Math.random() < 0.5 ? 'rgba(150,96,48,0.3)' : 'rgba(255,238,205,0.32)';
    g.fillRect(Math.random() * w, Math.random() * h, 2.2, 1.6);
  }
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
/* gum-leaf canopy sprite — drooping eucalyptus leaf sprays, alpha-cut */
const frondTex = (() => {
  const c = document.createElement('canvas'); c.width = 256; c.height = 128;
  const g = c.getContext('2d'); g.clearRect(0, 0, 256, 128);
  g.lineCap = 'round';
  const spray = (ox, oy, ang, len, colA, colB) => {
    const dx = Math.cos(ang), dy = Math.sin(ang), px = -dy, py = dx;
    g.strokeStyle = 'rgba(112,96,78,0.9)'; g.lineWidth = 3;
    g.beginPath(); g.moveTo(ox, oy);
    g.quadraticCurveTo(ox + dx * len * 0.55, oy + dy * len * 0.55 + len * 0.06, ox + dx * len, oy + dy * len + len * 0.22); g.stroke();
    for (let t = 0.14; t < 0.98; t += 0.05) {
      const bx = ox + dx * len * t, by = oy + dy * len * t + len * 0.22 * t * t;
      const ll = len * 0.16 * (1 - t * 0.4);
      for (const sgn of [-1, 1]) { /* lance-shaped gum leaves, alternating */
        g.fillStyle = (t * 20 | 0) % 2 ? colA : colB;
        g.beginPath();
        g.ellipse(bx + px * ll * sgn + dx * ll * 0.4, by + py * ll * sgn + ll * 0.55, ll * 0.30, ll * 0.95, ang + sgn * 0.5, 0, 7);
        g.fill();
      }
    }
  };
  spray(22, 22, -0.08, 208, '#5d7350', '#71865e');
  spray(22, 62, 0.18, 196, '#54683f', '#667c50');
  spray(22, 100, 0.44, 178, '#5d7350', '#7d9268');
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4;
  return t;
})();
/* roo-coat detail for the hero: sandy speckle over a rust-brown base */
const furTex = canvasTex(256, 256, (g, w, h) => {
  g.fillStyle = '#b06a38'; g.fillRect(0, 0, w, h);
  for (let i = 0; i < 3000; i++) {
    g.fillStyle = Math.random() < 0.5 ? 'rgba(140,80,40,0.20)' : 'rgba(216,158,102,0.20)';
    g.fillRect(Math.random() * w, Math.random() * h, 2.2, 1.3);
  }
  g.strokeStyle = 'rgba(146,86,44,0.25)'; g.lineWidth = 7; g.lineCap = 'round';
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
  water: new THREE.MeshPhongMaterial({ map: waterTex, shininess: 24, color: 0xf2d9b0 }),
  bark: new THREE.MeshLambertMaterial({ map: barkTex }),
  leaf: new THREE.MeshLambertMaterial({ color: 0x5d7350 }),
  leaf2: new THREE.MeshLambertMaterial({ color: 0x71865e }),
  /* scenery pack materials (shared, reused by every instanced prop) */
  sandDk: new THREE.MeshLambertMaterial({ color: 0xd98d4e }),
  thatch: new THREE.MeshLambertMaterial({ color: 0xb9a06a }),
  woodDk: new THREE.MeshLambertMaterial({ color: 0x6e4f2a }),
  stone: new THREE.MeshLambertMaterial({ color: 0x8d8578 }),
  stoneDk: new THREE.MeshLambertMaterial({ color: 0x6f6a5e }),
  flame: new THREE.MeshBasicMaterial({ color: 0xffa726 }),
  pink: new THREE.MeshLambertMaterial({ color: 0xef6aa5 }),
  purple: new THREE.MeshLambertMaterial({ color: 0x9775fa }),
  yellow: new THREE.MeshLambertMaterial({ color: 0xffd43b }),
  whiteF: new THREE.MeshLambertMaterial({ color: 0xf8f9fa }),
  glint: new THREE.MeshPhongMaterial({ color: 0x9fd8ef, shininess: 120, transparent: true, opacity: 0.75 }),
  hillFar: new THREE.MeshBasicMaterial({ color: 0xa8502e, fog: true }),
  temple: new THREE.MeshBasicMaterial({ color: 0x8f3d20, fog: true }),
  bird: new THREE.MeshBasicMaterial({ color: 0x22303c, fog: true }),
  gold: new THREE.MeshPhongMaterial({ color: 0xffc93d, emissive: 0xcf8a00, emissiveIntensity: 0.85, shininess: 110 }),
  goldDark: new THREE.MeshPhongMaterial({ color: 0xe8a90c, emissive: 0x9a6a00, emissiveIntensity: 0.4, shininess: 70 }),
  ustc: new THREE.MeshPhongMaterial({ color: 0x4da3ff, emissive: 0x1d5fd0, emissiveIntensity: 1.15, shininess: 110 }),
  rock: new THREE.MeshLambertMaterial({ color: 0x9a8f80 }),
  red: new THREE.MeshPhongMaterial({ color: 0xe03131, emissive: 0x700000, emissiveIntensity: 0.35, shininess: 40 }),
  white: new THREE.MeshPhongMaterial({ color: 0xf5f5f5, shininess: 30 }),
  orange: new THREE.MeshPhongMaterial({ map: furTex, shininess: 35 }),
  orangeDk: new THREE.MeshPhongMaterial({ color: 0x8a4f26, shininess: 35 }),
  cream: new THREE.MeshPhongMaterial({ color: 0xf3e3c2, shininess: 35 }),
  teal: new THREE.MeshPhongMaterial({ color: 0xb03a1e, shininess: 50 }),
  ink: new THREE.MeshPhongMaterial({ color: 0x2b2b33, shininess: 20 }),
  nose: new THREE.MeshPhongMaterial({ color: 0x33231a, shininess: 60 }),
};

/* ---------------- world: scrolling sections ---------------- */
const world = new THREE.Group(); scene.add(world);
const sections = [];
const secGeo = new THREE.BoxGeometry(1, 1, 1);

function makeSection() {
  const g = new THREE.Group();
  /* CURVED TRACK (Nov 7): each 30 m section is built from SUB (=6) chained
     sub-slabs laid along the bend, so the road itself visibly curves left
     and right — the polish step in x per sub-slab is ≤~0.9 m and the seam
     yaw ≤~5°, and because the ground plane is 90 m wide the strips overlap
     generously, hiding any seam. Sub-slab LOCAL coordinates: x is centred
     on the section's own centre line (position.x of the group carries the
     bend offset at scroll time), z is relative to the section centre.
     Only the ground parts (ground/track/edges/beaches) are chained; the
     far scenery (water/cliffs/hills) stays on the section frame — it sits
     30–195 m out where the bend reads as landscape, not road. */
  const SUB = 6, SUB_LEN = SECT_LEN / SUB;
  const chained = [
    [M.grass, 90, 1, -0.51], [M.dirt, 8.4, 0.22, -0.1],
    [M.sand, 0.5, 0.26, -0.08, -4.45], [M.sand, 0.5, 0.26, -0.08, 4.45],
    [M.sand, 10, 0.5, -0.55, -12.5], [M.sand, 10, 0.5, -0.55, 12.5],
  ];
  for (let si = 0; si < SUB; si++) {
    for (const [mat, w, h, y, cx] of chained) {
      const m = new THREE.Mesh(secGeo, mat);
      m.scale.set(w, h, SUB_LEN + 0.6);          // slight z overlap kills hairline gaps
      m.position.set((cx || 0), y, 0);           // z/x/yaw set at scroll time from userData.subs
      g.add(m);
      (g.userData.subs = g.userData.subs || []).push({ mesh: m, si, cx: cx || 0 });
    }
  }
  const waterL = new THREE.Mesh(secGeo, M.water); waterL.scale.set(120, 0.4, SECT_LEN); waterL.position.set(-75, -0.95, 0); g.add(waterL);
  const waterR = waterL.clone(); waterR.position.x = 75; g.add(waterR);
  const cliffL = new THREE.Mesh(secGeo, M.cliff); cliffL.scale.set(7, 6.5, SECT_LEN); cliffL.position.set(-30, 2.2, 0); g.add(cliffL);
  const cliffR = cliffL.clone(); cliffR.position.x = 30; g.add(cliffR);
  const hillL = new THREE.Mesh(secGeo, M.cliff); hillL.scale.set(16, 2.6, SECT_LEN); hillL.position.set(-20, 0.75, 0); hillL.rotation.y = 0.06; g.add(hillL);
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

/* sun billboard glow: REMOVED (Nov 7 hotfix) — a 90x45-unit, 0.9-opacity,
   depthTest-off glow sprite glued to the camera painted a broad bright
   wash over the play view and swept across the screen in the loop.
   Tom reported "flashing light screen" three times; the bar is ZERO
   large-area light effects. The painted sky dome + clouds carry the sky. */

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
  const g = new THREE.ExtrudeGeometry(shape, { depth: 0.12, bevelEnabled: true, bevelThickness: 0.045, bevelSize: 0.045, bevelSegments: 2, curveSegments: 28 });
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
  const g = new THREE.ExtrudeGeometry(shape, { depth: 0.12, bevelEnabled: true, bevelThickness: 0.045, bevelSize: 0.045, bevelSegments: 2 });
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
  gr.addColorStop(0, '#3f74c9'); gr.addColorStop(0.40, '#7fb0e6'); gr.addColorStop(0.58, '#c9e2f2');
  gr.addColorStop(0.72, '#ffe0a0'); gr.addColorStop(0.82, '#ffd9a0'); gr.addColorStop(1, '#f7cf9a');
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
scene.background = new THREE.Color(0xffc98a); // clear color behind the dome (menu frames)

/* distant outback ranges + the great mesa (Uluru-style, flat top, static in z, wrap) */
function farIsle(hgt, wid, mat, capMat) {
  const grp = new THREE.Group();
  const hill = new THREE.Mesh(new THREE.CylinderGeometry(wid * 0.86, wid, hgt, 9), mat);
  hill.position.y = hgt * 0.5; hill.scale.z = 0.42; grp.add(hill);
  if (capMat) { /* long flat summit slab — the mesa cap */
    const cap = new THREE.Mesh(new THREE.BoxGeometry(wid * 1.02, hgt * 0.10, wid * 0.30), capMat);
    cap.position.y = hgt * 1.02; grp.add(cap);
  }
  scene.add(grp); return grp;
}
const farIsles = [
  { g: farIsle(15, 64, M.hillFar, null), x: -120, off: 40 },
  { g: farIsle(21, 80, M.hillFar, M.temple), x: 132, off: 230 },
  { g: farIsle(12, 56, M.hillFar, null), x: 118, off: 390 },
];

/* birds — two-wing flapping silhouettes crossing the sky */
const birdWingGeo = new THREE.PlaneGeometry(1.15, 0.34); birdWingGeo.translate(0.55, 0, 0);
const birdL = decoIM(birdWingGeo, M.bird, 6);
const birdR = decoIM(birdWingGeo, M.bird, 6);
birdL.material.side = THREE.DoubleSide; birdR.material.side = THREE.DoubleSide;
const birds = [];
for (let i = 0; i < 6; i++) birds.push({ x0: -70 - Math.random() * 90, y: 15 + Math.random() * 11, sp: 5.5 + Math.random() * 3.5, ph: Math.random() * 6.3, z: -55 - Math.random() * 130 });

/* floating dust motes around the runner, golden in the low sun.
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

/* kangaroo-crossing road signs — Aussie diamond warning signs (yellow board,
   black border, hopping-roo silhouette) on posts both sides of the track */
const rooSignTex = wordTex(128, 128, (g, w, h) => {
  g.fillStyle = '#f7b500'; g.fillRect(0, 0, w, h);
  g.strokeStyle = '#141414'; g.lineWidth = 7; g.strokeRect(5, 5, w - 10, h - 10);
  g.save(); g.translate(w / 2, h / 2 + 6); g.rotate(Math.PI / 4); g.translate(-w / 2, -(h / 2 + 6));
  g.strokeStyle = '#141414'; g.lineWidth = 9; g.strokeRect(14, 14, w - 28, h - 28);
  g.restore();
  g.fillStyle = '#141414';
  g.beginPath(); g.ellipse(58, 66, 21, 13, -0.5, 0, 7); g.fill();           // body
  g.beginPath(); g.ellipse(80, 44, 8.5, 6.5, -0.6, 0, 7); g.fill();        // head
  g.fillRect(80, 22, 4.6, 15); g.fillRect(88, 25, 4.2, 13);                // ears
  g.beginPath(); g.moveTo(44, 74); g.quadraticCurveTo(24, 80, 14, 96); g.lineTo(22, 100); g.quadraticCurveTo(32, 86, 48, 82); g.fill(); // tail
  g.beginPath(); g.moveTo(66, 74); g.lineTo(56, 100); g.lineTo(66, 100); g.lineTo(76, 80); g.fill();   // hind leg + big foot
  g.beginPath(); g.moveTo(76, 56); g.lineTo(88, 66); g.lineTo(84, 70); g.lineTo(74, 62); g.fill();   // forearm
});
const rooSignPostGeo = new THREE.BoxGeometry(0.14, 2.2, 0.14); rooSignPostGeo.translate(0, 1.1, 0);
const rooSignBoardGeo = new THREE.BoxGeometry(1.25, 1.25, 0.06); rooSignBoardGeo.translate(0, 2.5, 0);
const rooSignPostIM = decoIM(rooSignPostGeo, M.ink, 12);
const rooSignBoardIM = decoIM(rooSignBoardGeo, new THREE.MeshLambertMaterial({ map: rooSignTex, side: THREE.DoubleSide }), 12);
const ROO_SIGN_OFFS = [48, 120, 205, 285, 360, 445];

/* dust lines along the claypan edges (scroll with the world) */
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
  const gr = g.createLinearGradient(0, 0, 0, h); gr.addColorStop(0, '#7c2d12'); gr.addColorStop(1, '#431407');
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
  const gr = g.createLinearGradient(0, 0, 0, h); gr.addColorStop(0, '#e8b06a'); gr.addColorStop(1, '#b45a24');
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

/* ---------------- the finish arch (was: the giant loop) ----------------
   The loop/tube is REMOVED (owner, Nov 7: "Get rid of the tube make the
   track go left and right"). What stays is this free-standing branding
   arch — the LUNA CLASSIC banner + LUNC DEV STUDIO plate on two posts
   with a LUNC RUSH top bar — which the track passes UNDER every
   ARCH_EVERY metres as a distance marker. Pure scenery: no trigger, no
   collision, no ball form, no framing code — ROO just runs through it,
   following the bends like everything else. */
const ARCH_EVERY = 420, ARCH_Y = 8.5;
const archGroup = new THREE.Group();
{
  // LUNC DEV STUDIO plate on the banner's back face (seen on approach)
  const studioTex = wordTex(1024, 128, (g, w, h) => {
    g.fillStyle = '#17202a'; g.fillRect(0, 0, w, h);
    g.strokeStyle = '#ffcf3d'; g.lineWidth = 6; g.strokeRect(5, 5, w - 10, h - 10);
    paintCrescent(g, 74, h / 2, 40, '#ffcf3d'); paintCrescent(g, w - 74, h / 2, 40, '#ffcf3d');
    g.fillStyle = '#ffe9a8'; g.font = '900 60px "Segoe UI",system-ui,sans-serif';
    g.textAlign = 'center'; g.textBaseline = 'middle';
    g.fillText('LUNC DEV STUDIO', w / 2, h / 2 + 3);
  });
  const plate = new THREE.Mesh(new THREE.BoxGeometry(10.5, 1.1, 0.06),
    [M.ink, M.ink, M.ink, M.ink, new THREE.MeshLambertMaterial({ map: studioTex }), M.ink]);
  plate.position.set(0, ARCH_Y * 2 + 1.15, -0.20); archGroup.add(plate);
  const postGeo = new THREE.BoxGeometry(0.5, ARCH_Y, 0.5);
  for (const sx of [-1, 1]) {
    const p = new THREE.Mesh(postGeo, M.ink);
    p.position.set(sx * ARCH_Y * 0.7, ARCH_Y / 2, 0);
    p.rotation.z = sx * 0.45;
    archGroup.add(p);
  }
  const banner = new THREE.Mesh(new THREE.BoxGeometry(10.5, 1.1, 0.3), bannerMat);
  banner.position.set(0, ARCH_Y * 2 + 1.15, 0); archGroup.add(banner);
  const archL = new THREE.Mesh(new THREE.BoxGeometry(0.45, 3.4, 0.45), M.ink); archL.position.set(-5.2, 1.7, 0); archGroup.add(archL);
  const archR = archL.clone(); archR.position.x = 5.2; archGroup.add(archR);
  const archT = new THREE.Mesh(new THREE.BoxGeometry(10.9, 0.62, 0.45), archMat); archT.position.set(0, 3.45, 0); archGroup.add(archT);
}
archGroup.visible = false; scene.add(archGroup);

/* ---------------- hero: ROO the kangaroo ----------------
   Upright bounding posture, big hind legs + long feet, thick tail
   trailing to the ground behind, pouch with a joey, long ears,
   sandy rust-brown coat with a cream belly. Built from primitives
   in the same style as the old hero; the ANIMATION (below) is a
   real hop cycle, not a leg-swing run. */
function buildHero() {
  const hero = new THREE.Group();
  const bodyG = new THREE.Group(); hero.add(bodyG);
  const add = (parent, geo, mat, x, y, z, rx = 0, ry = 0, rz = 0) => {
    const m = new THREE.Mesh(geo, mat); m.position.set(x, y, z); m.rotation.set(rx, ry, rz); parent.add(m); return m;
  };
  // hips — the wide kangaroo pelvis everything hangs off
  add(bodyG, new THREE.SphereGeometry(0.40, 14, 12), M.orange, 0, 0.98, 0.10).scale.set(1.0, 0.92, 1.05);
  // torso (capsule) — leaning forward over the hips
  const torso = add(bodyG, new THREE.CapsuleGeometry(0.35, 0.55, 6, 12), M.orange, 0, 1.42, -0.02, 0.42);
  add(bodyG, new THREE.SphereGeometry(0.29, 12, 10), M.cream, 0, 1.28, -0.20, 0.42).scale.set(0.88, 1.15, 0.62); // cream belly
  // pouch + joey (front of the belly: a cream mound and a tiny head)
  add(bodyG, new THREE.SphereGeometry(0.20, 10, 8), M.cream, 0, 1.06, -0.33, 0.30).scale.set(1, 0.9, 0.62);
  const joeyG = new THREE.Group(); joeyG.position.set(0, 1.22, -0.40); bodyG.add(joeyG);
  add(joeyG, new THREE.SphereGeometry(0.105, 10, 8), M.orange, 0, 0, 0);
  add(joeyG, new THREE.ConeGeometry(0.045, 0.16, 6), M.orange, -0.055, 0.13, 0);
  add(joeyG, new THREE.ConeGeometry(0.045, 0.16, 6), M.orange, 0.055, 0.13, 0);
  add(joeyG, new THREE.SphereGeometry(0.035, 8, 8), M.nose, 0, -0.03, -0.09);
  // head — taller skull, long roo muzzle
  const headG = new THREE.Group(); headG.position.set(0, 2.02, -0.28); bodyG.add(headG);
  add(headG, new THREE.SphereGeometry(0.285, 14, 12), M.orange, 0, 0, 0).scale.set(0.88, 1.05, 0.95);
  add(headG, new THREE.SphereGeometry(0.15, 10, 8), M.cream, 0, -0.14, -0.16).scale.set(1.05, 0.72, 0.85); // muzzle patch
  add(headG, new THREE.ConeGeometry(0.115, 0.40, 8), M.orange, 0, -0.09, -0.34, -Math.PI / 2 + 0.18); // long muzzle
  add(headG, new THREE.SphereGeometry(0.06, 8, 8), M.nose, 0, -0.05, -0.53); // nose
  add(headG, new THREE.SphereGeometry(0.048, 8, 8), M.ink, -0.125, 0.10, -0.22); // eyes
  add(headG, new THREE.SphereGeometry(0.048, 8, 8), M.ink, 0.125, 0.10, -0.22);
  // long ears with dark tips
  const earGeo = new THREE.ConeGeometry(0.105, 0.56, 6);
  const tipGeo = new THREE.ConeGeometry(0.05, 0.22, 6);
  const earL = new THREE.Group(), earR = new THREE.Group();
  earL.position.set(-0.15, 0.26, 0.02); earR.position.set(0.15, 0.26, 0.02);
  add(earL, earGeo, M.orange, 0, 0.24, 0); add(earL, tipGeo, M.ink, 0, 0.55, 0);
  add(earR, earGeo, M.orange, 0, 0.24, 0); add(earR, tipGeo, M.ink, 0, 0.55, 0);
  earL.rotation.z = 0.16; earR.rotation.z = -0.16;
  headG.add(earL, earR);
  // crescent stud on left ear + chest charm (house branding on the hero)
  add(earL, new THREE.TorusGeometry(0.05, 0.018, 6, 12, Math.PI * 1.4), M.gold, -0.06, 0.14, -0.08, 0, 0, 2.2);
  add(bodyG, new THREE.TorusGeometry(0.09, 0.032, 6, 14, Math.PI * 1.45), M.gold, 0, 1.48, -0.34, 0.35, 0, 2.4);
  // neckerchief (torus + tail flap) — outback rust-red
  add(bodyG, new THREE.TorusGeometry(0.22, 0.075, 8, 14), M.teal, 0, 1.86, -0.16, Math.PI / 2 - 0.35);
  const scarfTail = add(bodyG, new THREE.BoxGeometry(0.16, 0.42, 0.045), M.teal, 0.1, 1.70, 0.22, 0.5);
  // small forearms, held tucked at the chest (classic roo)
  const armGeo = new THREE.CapsuleGeometry(0.07, 0.26, 4, 8);
  const armL = new THREE.Group(), armR = new THREE.Group();
  armL.position.set(-0.33, 1.62, -0.16); armR.position.set(0.33, 1.62, -0.16);
  add(armL, armGeo, M.orange, 0, -0.16, 0); add(armR, armGeo, M.orange, 0, -0.16, 0);
  add(armL, new THREE.SphereGeometry(0.07, 8, 8), M.cream, 0, -0.34, 0); add(armR, new THREE.SphereGeometry(0.07, 8, 8), M.cream, 0, -0.34, 0);
  bodyG.add(armL, armR);
  // BIG hind legs: thigh + shin pivoting at the hip, long flat feet.
  // Rest pose = the hop launch pose (group rotation 0): thigh swept
  // back-down, shin reaching forward-down, foot flat on the ground.
  const thighGeo = new THREE.CapsuleGeometry(0.155, 0.42, 4, 10);
  const shinGeo = new THREE.CapsuleGeometry(0.095, 0.40, 4, 8);
  const footGeo = new THREE.BoxGeometry(0.16, 0.09, 0.62);
  const legL = new THREE.Group(), legR = new THREE.Group();
  legL.position.set(-0.21, 0.95, 0.06); legR.position.set(0.21, 0.95, 0.06);
  const mkLeg = leg => {
    add(leg, thighGeo, M.orangeDk, 0, -0.28, 0.10, -0.5); // thigh, angled back
    const shin = new THREE.Group(); shin.position.set(0, -0.55, 0.26); leg.add(shin);
    add(shin, shinGeo, M.orange, 0, -0.26, -0.06, 0.22);
    add(shin, footGeo, M.orangeDk, 0, -0.52, -0.30); // long foot, toe forward
    return shin;
  };
  const shinL = mkLeg(legL), shinR = mkLeg(legR);
  bodyG.add(legL, legR);
  // long thick tail — tapering segments trailing behind to the ground (+Z),
  // the roo's third leg; waved by the hop cycle
  const tailG = new THREE.Group(); tailG.position.set(0, 0.92, 0.34); bodyG.add(tailG);
  const tail1 = add(tailG, new THREE.ConeGeometry(0.20, 1.05, 10), M.orange, 0, -0.16, 0.42, Math.PI / 2 + 0.30);
  const tail2G = new THREE.Group(); tail2G.position.set(0, -0.24, 0.90); tailG.add(tail2G);
  const tail2 = add(tail2G, new THREE.ConeGeometry(0.115, 0.95, 8), M.orangeDk, 0, -0.02, 0.42, Math.PI / 2 + 0.10);
  return { group: hero, bodyG, legL, legR, shinL, shinR, armL, armR, tailG, tail1, tail2, tail2G, headG, earL, earR, scarfTail, joeyG };
}
const H = buildHero();
scene.add(H.group);

/* speed streaks: REMOVED (Nov 7 hotfix) — 40 pale lines whipping past the
   camera at speed+26 m/s recycled constantly across the whole view and
   read as light streaks flashing on a phone (Tom's report). Deleted with
   their per-frame update below; the wind AUDIO still carries the speed. */

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
const hud = $('hud'), touchUI = $('touchUI'), stickDock = $('stickDock');
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
  $('howBtnPause').textContent = T('how');
  $('quitBtn').textContent = T('quit');
  $('overTitle').textContent = T('over');
  $('submitBtn').textContent = T('submit');
  $('againBtn').textContent = T('again');
  $('menuBtn').textContent = T('menu');
  $('nameInput').placeholder = T('namePh');
  $('hudDistLabel').textContent = (T('distWord') || 'DIST').toUpperCase();
  $('muteBtn').textContent = S.muted ? '🔇' : '🔊';
  const bt = $('bootTxt'); if (bt) bt.textContent = T('loading');
  const ch = $('ctrlHint'); if (ch && !ch.classList.contains('hidden')) ch.textContent = T('swipeHint');
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
  const name = ($('nameInput').value || '').trim() || 'ROO';
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

/* ---------------- run-start control hint ----------------
   One calm pill at run start (polish pass): tells a first-time player
   exactly what the stick does, fades out after a few seconds, and
   dismisses itself the moment they actually steer / jump / roll. */
const ctrlHint = $('ctrlHint');
let hintTimer = null, hintFadeTimer = null;
function showHint() {
  if (!ctrlHint) return;
  clearTimeout(hintTimer); clearTimeout(hintFadeTimer);
  ctrlHint.textContent = T('swipeHint');
  ctrlHint.classList.remove('hidden'); ctrlHint.classList.remove('fade');
  hintTimer = setTimeout(dismissHint, 3600);
}
function dismissHint() {
  if (!ctrlHint || ctrlHint.classList.contains('hidden')) return;
  clearTimeout(hintTimer);
  ctrlHint.classList.add('fade');
  clearTimeout(hintFadeTimer);
  hintFadeTimer = setTimeout(() => ctrlHint.classList.add('hidden'), 480);
}

/* ---------------- game flow ---------------- */
function resetRun() {
  S.dist = 0; S.coins = 0; S.stars = 0; S.score = 0; S.hearts = 3;
  S.speed = SPEED0; S.y = 0; S.vy = 0; S.grounded = true;
  S.lane = 1; S.laneX = 0; S.steerX = null; S.rollT = 0; S.stumbleT = 0; S.invulnT = 0; S.hitFlash = 0;
  S.nextArchAt = ARCH_EVERY; S.archCount = 0; S.runTime = 0; S.pitchChain = 0;
  for (const c of coins) c.active = false;
  for (const s of stars) s.active = false;
  for (const s of scats) s.active = false;
  obstacles.length = 0;
  nextCoinZ = 55; nextObZ = 120;
  archGroup.visible = false;
  updateHUD();
}
function startRun() {
  audioInit();
  resetRun();
  S.mode = 'run'; S.started = true;
  /* snap the camera to the run pose so a run never opens with a swoop
     in from the menu orbit (polish pass) */
  camera.position.set(0, 5.4, 9.6);
  lookPt.set(0, 1.1, -12);
  camera.fov = 66; camera.updateProjectionMatrix();
  $('menu').classList.add('hidden'); $('overPanel').classList.add('hidden'); $('pausePanel').classList.add('hidden');
  hud.classList.remove('hidden'); touchUI.classList.remove('hidden');
  stickDock.classList.remove('hidden'); stickHome();
  showBanner(T('go'), '', 900);
  showHint();
}
function endRun() {
  S.mode = 'over';
  dismissHint();
  hud.classList.add('hidden'); touchUI.classList.add('hidden');
  stickDock.classList.add('hidden'); stickReset();
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
$('howBtnPause').addEventListener('click', () => $('howPanel').classList.remove('hidden'));
$('quitBtn').addEventListener('click', () => { $('pausePanel').classList.add('hidden'); $('overPanel').classList.add('hidden'); hud.classList.add('hidden'); touchUI.classList.add('hidden'); stickDock.classList.add('hidden'); stickReset(); $('menu').classList.remove('hidden'); S.mode = 'menu'; });
$('muteBtn').addEventListener('click', () => {
  S.muted = !S.muted;
  try { localStorage.setItem('luncRush3dMute', S.muted ? '1' : '0'); } catch (e) {}
  if (AU.master) AU.master.gain.value = S.muted ? 0 : 0.5;
  $('muteBtn').textContent = S.muted ? '🔇' : '🔊';
});

/* ---------------- input ---------------- */
function doLeft() { if (S.mode !== 'run') return; if (S.steerX != null) { S.steerX = Math.max(trackBend(S.dist) - STEER_MAX, S.steerX - 2.3); S.lane = Math.max(0, Math.round((S.steerX - trackBend(S.dist)) / 2.3) + 1); S.steerTgt = S.steerX; } else if (S.lane > 0) { S.lane--; } }
function doRight() { if (S.mode !== 'run') return; if (S.steerX != null) { S.steerX = Math.min(trackBend(S.dist) + STEER_MAX, S.steerX + 2.3); S.lane = Math.min(2, Math.round((S.steerX - trackBend(S.dist)) / 2.3) + 1); S.steerTgt = S.steerX; } else if (S.lane < 2) { S.lane++; } }
function doJump() {
  if (S.mode !== 'run') return;
  dismissHint();
  if (S.grounded) { S.vy = JUMP_V; S.grounded = false; sndJump(); }
}
function doRoll() {
  if (S.mode !== 'run') return;
  dismissHint();
  if (!S.grounded) { S.vy = -26; } // slam down
  S.rollT = 0.62;
}
const bindBtn = (id, fn) => {
  const el = $(id);
  el.addEventListener('pointerdown', e => { e.preventDefault(); fn(); });
  el.addEventListener('touchstart', e => { e.preventDefault(); fn(); }, { passive: false });
};
bindBtn('btnJump', doJump); bindBtn('btnRoll', doRoll);

/* ---- Floating joystick — ALWAYS VISIBLE, FREE steering (Nov 7) -------
   The gold stick sits in its dock (bottom-left) the whole run — the player
   SEES it before touching anything (Tom asked 4x; the old build only drew
   it after a press landed inside a 46%-wide invisible zone, and even then
   only as discrete lane flicks — no left/right steering around objects).
   Now: the stick's horizontal axis drives SMOOTH continuous lateral
   movement (S.steerX) across the full track width while held; vertical
   push past STICK_FIRE = jump (up) / roll (down), edge-triggered.
   Steering input is captured on THREE independent channels so no webview
   quirk can starve all of them:
     (a) pointer events on window (with setPointerCapture on the canvas),
     (b) touch events on window (catches flows with no pointer events),
     (c) mouse events on window (desktop).
   A steering press begins anywhere in the LEFT 2/3 of the screen below
   the HUD strip (except on buttons/panels); the dock's knob follows the
   thumb wherever it goes; a second simultaneous touch on the right side
   still hits the ▲/▼ buttons (multi-touch), and steering + ▲ can be held
   together. Keyboard/qaPilot switch S.lane; the animation update below
   eases laneX
   toward steerX while the stick is active and toward the lane otherwise,
   and re-derives S.lane from steerX so collisions/pickups stay coherent.
   The old window swipe handlers are GONE: a drag now STEERS (it used to
   fire one lane hop on release, which fought the stick). */
const STICK_R = 52, STICK_FIRE = 26, STEER_MAX = 3.1, STEER_SPEED = 13;
const stickBase = $('stickBase'), stickKnob = $('stickKnob');
const stick = { id: null, kind: null, bx: 0, by: 0, x: 0, nx: 0, ny: 0, armedUp: true, armedDn: true, homeX: 0, homeY: 0 };
let stickTouch = false; // a steering press is in progress (any channel)
function stickHome() {
  const r = stickDock.getBoundingClientRect();
  stick.homeX = r.left + r.width / 2; stick.homeY = r.top + r.height / 2;
  stick.bx = stick.homeX; stick.by = stick.homeY;
  stickBase.style.opacity = '.62';
  stickKnob.style.transform = 'translate(-50%,-50%)';
}
function stickShow(x, y) {
  stick.bx = x; stick.by = y; stick.x = 0; stick.nx = 0; stick.ny = 0;
  stick.armedUp = true; stick.armedDn = true;
  stickBase.style.opacity = '1';
  stickKnob.style.transform = 'translate(-50%,-50%)';
}
function stickMove(x, y) {
  let dx = x - stick.bx, dy = y - stick.by;
  const d = Math.hypot(dx, dy);
  stick.x = dx;
  if (d > STICK_R) { dx *= STICK_R / d; dy *= STICK_R / d; }
  stick.nx = dx / STICK_R; stick.ny = dy / STICK_R;
  stickKnob.style.transform = `translate(calc(-50% + ${dx}px), calc(-50% + ${dy}px))`;
  const ay = Math.abs(dy);
  if (ay < 12) { stick.armedUp = true; stick.armedDn = true; }
  else if (dy < 0 && stick.armedUp && ay >= STICK_FIRE) { doJump(); stick.armedUp = false; }
  else if (dy > 0 && stick.armedDn && ay >= STICK_FIRE) { doRoll(); stick.armedDn = false; }
}
function stickReset() {
  if (S.steerX != null) {
    const r = Math.round(S.relX); // snap in centre-line-relative space
    if (Math.abs(S.relX - r) > 0.3) {
      S.steerX = r + trackBend(S.dist); S.lane = Math.max(0, Math.min(2, Math.round(r / 2.3) + 1));
    } else {
      S.lane = Math.max(0, Math.min(2, Math.round(S.relX / 2.3) + 1));
    }
  }
  stick.id = null; stick.kind = null; stick.x = 0; stick.nx = 0; stick.ny = 0;
  S.steerX = null; stickTouch = false;
  stickHome();
}
function steerBegin(id, kind, x, y) {
  if (S.mode !== 'run' || stick.id !== null) return false;
  dismissHint();
  stick.id = id; stick.kind = kind; stickTouch = true;
  S.steerX = S.laneX; S.steerTgt = S.laneX;
  stickShow(x, y);
  return true;
}
function steerZoneOK(x, y, target) {
  if (target && target.closest && target.closest('button,select,input,.panel,.screen')) return false;
  const vv = window.visualViewport;
  const W = (vv && vv.width) || innerWidth, H = (vv && vv.height) || innerHeight;
  return x < W * 2 / 3 && y > H * 0.14;
}
function steerReleaseSnap() {
  if (S.steerX != null) {
    S.lane = Math.max(0, Math.min(2, Math.round(S.relX / 2.3) + 1));
    S.steerX = LANE_X[S.lane] + trackBend(S.dist);
    S.steerTgt = S.steerX;
  }
}
/* (a) pointer channel */
addEventListener('pointerdown', e => {
  if (e.pointerType === 'mouse') return;
  if (!steerZoneOK(e.clientX, e.clientY, e.target)) return;
  if (steerBegin(e.pointerId, 'ptr', e.clientX, e.clientY)) {
    window.__stickPtrAt = performance.now();
    try { renderer.domElement.setPointerCapture(e.pointerId); } catch (err) {}
  }
});
addEventListener('pointermove', e => {
  if (stick.kind === 'ptr' && e.pointerId === stick.id) stickMove(e.clientX, e.clientY);
});
const ptrEnd = e => {
  if (stick.kind === 'ptr' && e.pointerId === stick.id) { steerReleaseSnap(); stickReset(); }
};
addEventListener('pointerup', ptrEnd);
addEventListener('pointercancel', ptrEnd);
/* (b) touch channel — for webviews that deliver touch without pointer */
addEventListener('touchstart', e => {
  if (stick.id !== null) return;
  if (window.__stickPtrAt && performance.now() - window.__stickPtrAt < 700 && stick.kind === 'ptr') return;
  for (const t of e.changedTouches) {
    if (steerZoneOK(t.clientX, t.clientY, e.target)) {
      if (steerBegin('touch:' + t.identifier, 'touch', t.clientX, t.clientY)) e.preventDefault();
      break;
    }
  }
}, { passive: false });
addEventListener('touchmove', e => {
  if (stick.kind !== 'touch' || stick.id === null) return;
  for (const t of e.changedTouches) if ('touch:' + t.identifier === stick.id) { stickMove(t.clientX, t.clientY); e.preventDefault(); }
}, { passive: false });
const touchEnd = e => {
  if (stick.kind !== 'touch' || stick.id === null) return;
  for (const t of e.changedTouches) if ('touch:' + t.identifier === stick.id) { steerReleaseSnap(); stickReset(); }
};
addEventListener('touchend', touchEnd);
addEventListener('touchcancel', touchEnd);
/* (c) mouse channel (desktop drag) */
let mDown = false;
addEventListener('pointerdown', e => {
  if (e.pointerType !== 'mouse') return;
  if (!steerZoneOK(e.clientX, e.clientY, e.target)) return;
  if (steerBegin(e.pointerId, 'mouse', e.clientX, e.clientY)) mDown = true;
});
addEventListener('pointermove', e => {
  if (mDown && stick.kind === 'mouse' && e.pointerId === stick.id) stickMove(e.clientX, e.clientY);
});
addEventListener('pointerup', e => {
  if (mDown && stick.kind === 'mouse' && e.pointerId === stick.id) { steerReleaseSnap(); stickReset(); }
  mDown = false;
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
    s.x = S.relX; s.y = 1.1; s.z = -2 - Math.random() * 2;
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
    S.speed = Math.min(SPEED_MAX, SPEED0 + S.dist * SPEED_RAMP * 0.30 + S.runTime * 0.16);
    const effSpeed = S.speed * (S.stumbleT > 0 ? 0.45 : 1);
    if (S.pilot) qaPilot(dt);
    const distPrev = S.dist;
    S.dist += effSpeed * dt;
    S.score += effSpeed * DIST_SCORE * dt;
    if (S.stumbleT > 0) S.stumbleT -= dt;
    if (S.invulnT > 0) S.invulnT -= dt;
    if (S.hitFlash > 0) S.hitFlash -= dt;
    /* CURVE CARRY: the bends move the centre line sideways at
       trackBendVel × speed (peak ≈1.35 m/s at top speed). Carry the hero
       (lane + steering targets together) by exactly that much each frame
       so holding the centre rides the bends — the player only steers to
       change lanes or dodge, never to fight the road. */
    const bendDrift = trackBend(S.dist) - trackBend(distPrev);
    if (bendDrift !== 0) {
      S.laneX += bendDrift;
      if (S.steerX != null) { S.steerX += bendDrift; S.steerTgt += bendDrift; }
    }
    S.relX = S.laneX - trackBend(S.dist); // hero offset from the centre line

    /* vertical */
    {
      if (!S.grounded) {
        S.vy -= GRAV * dt; S.y += S.vy * dt;
        if (S.y <= 0) { S.y = 0; S.grounded = true; S.vy = 0; }
      }
      if (S.rollT > 0) S.rollT -= dt;
    }
    /* lateral movement: free steering while the stick is held. Polish
       pass response (Nov 7): driven by the NORMALIZED stick axis with a
       0.14 deadzone (resting-thumb jitter no longer drifts ROO) and a
       gentle 1.35 power curve — small pushes make small moves, full push
       still crosses the track fast. Velocity integrates the REAL frame
       dt (the old code hard-coded a 60 fps step, so steering slowed
       down on low-fps phones), and the follow springs are exponential
       (frame-rate independent). On release the snap-to-lane is unchanged. */
    if (S.steerX != null) {
      const STEER_VEL = 11, DEAD = 0.14;
      const a = Math.abs(stick.nx || 0);
      if (a > DEAD) {
        const t = (a - DEAD) / (1 - DEAD);
      S.steerTgt = THREE.MathUtils.clamp(S.steerTgt + Math.sign(stick.nx) * Math.pow(t, 1.35) * STEER_VEL * dt, trackBend(S.dist) - STEER_MAX, trackBend(S.dist) + STEER_MAX);
      }
      S.steerX += (S.steerTgt - S.steerX) * (1 - Math.exp(-16 * dt));
      S.laneX += (S.steerX - S.laneX) * (1 - Math.exp(-20 * dt));
      S.lane = Math.max(0, Math.min(2, Math.round(S.relX / 2.3) + 1));
    } else {
      /* lane target rides the bend too: lanes are relative to the
         (moving) centre line, so add the same per-frame drift */
      const targetX = LANE_X[S.lane] + bendDrift;
      S.laneX += (targetX - S.laneX) * (1 - Math.exp(-11 * dt)) + bendDrift * Math.exp(-11 * dt);
    }
    S.relX = S.laneX - trackBend(S.dist);

    /* spawning ahead */
    const horizon = S.dist + 300;
    while (nextCoinZ < horizon) spawnCoins();
    while (nextObZ < horizon) spawnObstacleRow();
    for (let i = obstacles.length - 1; i >= 0; i--) if (obstacles[i].z < S.dist - 25) obstacles.splice(i, 1);

    /* finish-arch marker: pure scenery pass-under, +100 and a cheer —
       no state change, no collision, the run just flows through it */
    if (S.dist >= S.nextArchAt) {
      S.archCount++;
      S.nextArchAt += ARCH_EVERY;
      S.score += 100;
      showBanner('🏁 ' + Math.floor(S.dist) + 'm!', '+100', 900);
      sndWhoosh();
    }

    /* collisions: obstacles */
    if (S.invulnT <= 0) {
      for (const o of obstacles) {
        if (!o.active) continue;
        const dz = o.z - S.dist;
        if (dz > 1.4 || dz < -1.4) continue;
        if (Math.abs(LANE_X[o.lane] - S.relX) > 0.95) continue;
        let hit = false;
        if (o.kind === 'jump') hit = S.y < 0.85;
        else if (o.kind === 'roll') hit = S.rollT <= 0 && S.y < 1.6;
        else hit = S.y < 0.75; // rock — must jump it
        if (hit) { o.active = false; takeHit(); break; }
      }
    }
    /* pickups */
    const collect = (p, isStar) => {
      const dz = p.z - S.dist, dx = p.x - S.relX, dy = p.y - (S.y + 1.05);
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
      const dz = s.z + S.dist, dx = s.x - S.relX;
      if (Math.abs(dz) < 1.1 && Math.abs(dx) < 1.0 && s.y < 1.9 && S.invulnT <= 0.4) {
        s.active = false; S.coins++; S.score += COIN_SCORE; sndCoin(); updateHUD();
      }
      if (s.life <= 0 || dz < -14) s.active = false;
    }
    updateHUD();
  }

  /* --- world scroll: sections --- */
  const span = SECT_N * SECT_LEN;
  bendHero = trackBend(S.dist); // the bend at the hero, all frame offsets hang off this
  for (const sec of sections) {
    let rel = (sec.userData.baseZ - (S.dist % span) + span) % span;
    /* +9 (was -8): the tiling must reach at least ~+6 BEHIND the hero at
       every phase — the camera's bottom ray lands at z≈+4..+6, and with
       -8 the rearmost section's back edge dipped to -8 for ~12m of every
       30m cycle, leaving the ground under the camera open to the pale
       sky dome: the once-per-section "flashing light screen" (Nov 7). */
    sec.position.z = -(rel) + SECT_LEN * 0.5 + 9;
    /* CURVES: lay this section's chained sub-slabs along the bend. a =
       metres ahead of the hero at the sub-slab's centre; dx = bend there
       minus bend at the hero; yaw = -(bend slope) so each slab points
       along the road. All values derive from absolute distance, so a
       section reads identically however it was recycled. */
    if (sec.userData.subs) {
      for (const sub of sec.userData.subs) {
        const aC = -(sec.position.z - SECT_LEN / 2 + (sub.si + 0.5) * (SECT_LEN / 6)); // metres ahead of hero (screen)
        const dC = S.dist + aC;
        sub.mesh.position.x = sub.cx + (trackBend(dC) - bendHero);
        sub.mesh.position.z = -SECT_LEN / 2 + (sub.si + 0.5) * (SECT_LEN / 6);
        sub.mesh.rotation.y = -Math.atan(trackBendVel(dC)) * 0.9;
      }
    }
    /* whole-section banking: the ground group rolls gently INTO the bend
       (bank ∝ bend slope, capped ±7°) — reads as a cambered road on the
       turns and costs nothing. */
    sec.rotation.z = THREE.MathUtils.clamp(-trackBendVel(S.dist + rel) * 0.55, -0.12, 0.12);
  }
  /* palms */
  for (let i = 0; i < PALM_N; i++) {
    const p = palmData[i];
    let rel = (p.off + ((i / PALMS_PER_SEC) | 0) * SECT_LEN - (S.dist % span) + span) % span;
    const pz = -rel + SECT_LEN * 0.5 + 9;
    dummy.position.set(bendX(p.bx, -pz), 0, pz); // +9: same shift as sections (see above)
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
    /* every scenery x passes through bx2: bend offset at that thing's z */
    const bx2 = (x, z) => bendX(x, -z);
    let iBush = 0, iBush2 = 0, iFl = 0, iTuft = 0, iRock = 0, iSand = 0, iGlint = 0;
    for (const d of decoData) {
      const z = relZ(d.off);
      if (d.kind === 0) {
        dummy.position.set(bx2(d.bx, z), 0, z); dummy.rotation.set(0, d.rot, 0); dummy.scale.setScalar(d.s);
        dummy.updateMatrix();
        if ((iBush + iBush2) % 2 === 0 && iBush < DECO_N) decoBush.setMatrixAt(iBush++, dummy.matrix);
        else if (iBush2 < DECO_N) decoBush2.setMatrixAt(iBush2++, dummy.matrix);
      } else if (d.kind === 1) {
        dummy.position.set(bx2(d.bx, z), 0, z); dummy.rotation.set(0, d.rot, 0); dummy.scale.setScalar(d.s);
        dummy.updateMatrix();
        const pick = iFl % 3;
        if (pick === 0) decoFlowerP.setMatrixAt((iFl / 3) | 0, dummy.matrix);
        else if (pick === 1) decoFlowerY.setMatrixAt((iFl / 3) | 0, dummy.matrix);
        else decoFlowerV.setMatrixAt((iFl / 3) | 0, dummy.matrix);
        iFl++;
      } else if (d.kind === 2) {
        if (iTuft >= DECO_N * 2) continue;
        dummy.position.set(bx2(d.bx, z), 0, z); dummy.rotation.set(0, d.rot, 0); dummy.scale.setScalar(d.s);
        dummy.updateMatrix(); decoTuft.setMatrixAt(iTuft++, dummy.matrix);
      } else if (d.kind === 3) {
        if (iRock >= 28) continue;
        dummy.position.set(bx2(d.bx, z), 0.12, z); dummy.rotation.set(d.rot, d.rot * 1.7, 0); dummy.scale.set(d.s, d.s * 0.7, d.s);
        dummy.updateMatrix(); decoRock.setMatrixAt(iRock++, dummy.matrix);
      } else if (d.kind === 4) {
        if (iSand >= 28) continue;
        dummy.position.set(bx2(d.bx, z), 0.03, z); dummy.rotation.set(-Math.PI / 2, 0, d.rot); dummy.scale.setScalar(d.s);
        dummy.updateMatrix(); decoSand.setMatrixAt(iSand++, dummy.matrix);
      } else if (d.kind === 5) {
        if (iGlint >= 20) continue;
        dummy.position.set(bx2(d.bx, z), 0.04, z); dummy.rotation.set(-Math.PI / 2, 0, d.rot); dummy.scale.setScalar(d.s);
        dummy.updateMatrix(); decoGlint.setMatrixAt(iGlint++, dummy.matrix);
      }
    }
    decoBush.count = iBush; decoBush2.count = iBush2;
    decoFlowerP.count = Math.ceil(iFl / 3); decoFlowerY.count = Math.ceil(iFl / 3); decoFlowerV.count = Math.ceil(iFl / 3);
    decoTuft.count = iTuft; decoRock.count = iRock;
    for (const im of [decoBush, decoBush2, decoFlowerP, decoFlowerY, decoFlowerV, decoTuft, decoRock]) im.instanceMatrix.needsUpdate = true;

    /* landmarks */
    const flick = 1 + Math.sin(globalT * 7.3) * 0.09 + Math.sin(globalT * 13.7) * 0.04;
    LM_OFFS.forEach((off, li) => {
      const z = relZ(off);
      for (const sx of [-1, 1]) {
        const idx = li * 2 + (sx < 0 ? 0 : 1), x = sx * 6.1;
        dummy.rotation.set(0, 0, 0); dummy.scale.setScalar(1);
        dummy.position.set(bx2(x, z), 0, z); dummy.updateMatrix(); lmTorchPole.setMatrixAt(idx, dummy.matrix);
        dummy.scale.set(1, flick, 1); dummy.updateMatrix(); lmTorchFlame.setMatrixAt(idx, dummy.matrix);
        dummy.scale.setScalar(1);
        dummy.position.set(bx2(sx * 5.6, z + 26), 0, z + 26); dummy.rotation.set(0, sx * 0.35, 0); dummy.updateMatrix();
        if (sx < 0) lmSignPost.setMatrixAt(li * 2, dummy.matrix); else lmSignPost.setMatrixAt(li * 2 + 1, dummy.matrix);
        dummy.updateMatrix();
        if (sx < 0) lmSignBoard.setMatrixAt(li * 2, dummy.matrix); else lmSignBoard.setMatrixAt(li * 2 + 1, dummy.matrix);
      }
      dummy.rotation.set(0, li * 1.3, 0); dummy.scale.setScalar(1);
      dummy.position.set(bx2(li === 0 ? -13.5 : 14.5, z + 62), 0, z + 62); dummy.updateMatrix();
      lmHutWall.setMatrixAt(li, dummy.matrix); lmHutRoof.setMatrixAt(li, dummy.matrix);
      const stX = li === 0 ? 12.5 : -13;
      dummy.position.set(bx2(stX, z + 118), 0, z + 118); dummy.updateMatrix();
      lmStatueBase.setMatrixAt(li, dummy.matrix); lmStatueBody.setMatrixAt(li, dummy.matrix); lmStatueHead.setMatrixAt(li, dummy.matrix);
      /* gold crescent emblem on the statue's chest, facing the track */
      dummy.position.set(bx2(stX + (stX > 0 ? -0.46 : 0.46), z + 118), 1.62, z + 118);
      dummy.rotation.set(0, stX > 0 ? -Math.PI / 2 : Math.PI / 2, 2.4); dummy.scale.setScalar(1);
      dummy.updateMatrix(); lmStatueCres.setMatrixAt(li, dummy.matrix);
      dummy.rotation.set(0, li * 1.3, 0);
      const az = z + 168;
      dummy.rotation.set(0, 0, 0); dummy.scale.setScalar(1);
      dummy.position.set(bx2(-5.9, az), 0, az); dummy.updateMatrix(); lmArchPostL.setMatrixAt(li, dummy.matrix);
      dummy.position.set(bx2(5.9, az), 0, az); dummy.updateMatrix(); lmArchPostR.setMatrixAt(li, dummy.matrix);
      dummy.position.set(bx2(0, az), 4.35 + Math.sin(globalT * 2.2 + li * 2) * 0.07, az); dummy.updateMatrix(); lmArchCloth.setMatrixAt(li, dummy.matrix);
    });
    for (const im of [lmTorchPole, lmTorchFlame, lmSignPost, lmSignBoard, lmHutWall, lmHutRoof, lmStatueBase, lmStatueBody, lmStatueHead, lmArchPostL, lmArchPostR, lmArchCloth, lmStatueCres]) im.instanceMatrix.needsUpdate = true;

    /* branding: trackside billboards + start arch */
    {
      const vCount = [0, 0, 0];
      BB_SPOTS.forEach((b, bi2) => {
        const z = relZ(b.off), x = b.side * 8.6;
        dummy.rotation.set(0, b.side < 0 ? 0.22 : -0.22, 0); dummy.scale.setScalar(1);
        dummy.position.set(bx2(x - 1.9, z), 0, z); dummy.updateMatrix(); bbPostIM.setMatrixAt(bi2 * 2, dummy.matrix);
        dummy.position.set(bx2(x + 1.9, z), 0, z); dummy.updateMatrix(); bbPostIM.setMatrixAt(bi2 * 2 + 1, dummy.matrix);
        dummy.position.set(bx2(x, z), 0, z); dummy.updateMatrix(); bbBoardIMs[b.v].setMatrixAt(vCount[b.v]++, dummy.matrix);
      });
      bbPostIM.count = BB_SPOTS.length * 2; bbPostIM.instanceMatrix.needsUpdate = true;
      bbBoardIMs.forEach((im, vi) => { im.count = vCount[vi]; im.instanceMatrix.needsUpdate = true; });
      const sz = relZ(30);
      dummy.rotation.set(0, 0, 0); dummy.scale.setScalar(1);
      dummy.position.set(bx2(-5.5, sz), 0, sz); dummy.updateMatrix(); startPostIM.setMatrixAt(0, dummy.matrix);
      dummy.position.set(bx2(5.5, sz), 0, sz); dummy.updateMatrix(); startPostIM.setMatrixAt(1, dummy.matrix);
      dummy.position.set(bx2(0, sz), 0, sz); dummy.updateMatrix(); startBoardIM.setMatrixAt(0, dummy.matrix);
      startPostIM.instanceMatrix.needsUpdate = true; startBoardIM.instanceMatrix.needsUpdate = true;
    }

    /* distant ranges + mesa */
    for (const fi of farIsles) { fi.g.position.set(bx2(fi.x, relZ(fi.off)), 0, relZ(fi.off)); }

    /* kangaroo-crossing signs: both sides of the track, facing the runner */
    {
      let iSign = 0;
      for (const off of ROO_SIGN_OFFS) {
        const z = relZ(off);
        for (const sx of [-1, 1]) {
          dummy.rotation.set(0, sx < 0 ? 0.30 : -0.30, 0); dummy.scale.setScalar(1);
          dummy.position.set(bx2(sx * 5.35, z), 0, z); dummy.updateMatrix(); rooSignPostIM.setMatrixAt(iSign, dummy.matrix);
          dummy.rotation.set(0, sx < 0 ? 0.30 : -0.30, Math.PI / 4); dummy.updateMatrix(); rooSignBoardIM.setMatrixAt(iSign, dummy.matrix);
          iSign++;
        }
      }
      rooSignPostIM.count = iSign; rooSignBoardIM.count = iSign;
      rooSignPostIM.instanceMatrix.needsUpdate = true; rooSignBoardIM.instanceMatrix.needsUpdate = true;
    }

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

    /* dust motes drifting around the runner (instanced spheres) */
    for (let i = 0; i < MOTE_N; i++) {
      const m = moteData[i];
      dummy.position.set(
        m.x + Math.sin(globalT * 0.7 + m.ph) * 0.8 + S.laneX * 0.4,
        m.y + Math.sin(globalT * m.dr + m.ph * 2) * 0.5,
        -((( -m.z + S.dist * 0.92) % 55 + 55) % 55) + 4);
      dummy.rotation.set(0, 0, 0);
      dummy.scale.setScalar(0.85 + 0.18 * Math.sin(globalT * 2 + m.ph * 3));
      dummy.updateMatrix(); motes.setMatrixAt(i, dummy.matrix);
    }
    motes.instanceMatrix.needsUpdate = true;

    /* dust lines along the claypan edges */
    let iFoam = 0;
    for (let sIdx = 0; sIdx < SECT_N; sIdx++) {
      const secZ = sections[sIdx].position.z - 7.5 + (sIdx % 3) * 9;
      for (const fx of [-18.6, 18.6]) {
        dummy.position.set(bendX(fx, -secZ), 0.06, secZ); dummy.rotation.set(-Math.PI / 2, 0, 0);
        dummy.scale.set(1, 1 + 0.15 * Math.sin(globalT * 1.4 + sIdx * 1.7 + (fx > 0 ? 2 : 0)), 1);
        dummy.updateMatrix(); foamIM.setMatrixAt(iFoam++, dummy.matrix);
      }
    }
    foamIM.count = iFoam; foamIM.instanceMatrix.needsUpdate = true;
  }

  /* sky dome follows the camera so the backdrop never ends */
  skyDome.position.set(camera.position.x, 6, camera.position.z - 120);

  /* --- obstacles render --- */
  let bi = 0, si = 0, bai = 0, pi = 0, ri = 0;
  const maxOb = 80;
  for (const o of obstacles) {
    if (!o.active) continue;
    const rz = -(o.z - S.dist);
    if (rz > 12 || rz < -330) continue;
    const x = bendX(LANE_X[o.lane], -rz);
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
    dummy.position.set(bendX(c.x, c.z - S.dist), c.y + Math.sin(globalT * 3 + i) * 0.07, -(c.z - S.dist));
    dummy.rotation.set(0, spin + i, 0); dummy.scale.setScalar(1);
    dummy.updateMatrix(); coinIM.setMatrixAt(i, dummy.matrix);
  }
  coinIM.instanceMatrix.needsUpdate = true;
  for (let i = 0; i < STAR_N; i++) {
    const s = stars[i];
    if (!s.active) { hideIM(starIM, i); continue; }
    dummy.position.set(bendX(s.x, s.z - S.dist), s.y + Math.sin(globalT * 2.4 + i * 2) * 0.12, -(s.z - S.dist));
    dummy.rotation.set(0, -spin * 0.8 + i, 0); dummy.scale.setScalar(1.15);
    dummy.updateMatrix(); starIM.setMatrixAt(i, dummy.matrix);
  }
  starIM.instanceMatrix.needsUpdate = true;
  for (let i = 0; i < SCAT_N; i++) {
    const s = scats[i];
    if (!s.active) { hideIM(scatIM, i); continue; }
    dummy.position.set(bendX(s.x, s.z), s.y, s.z); // s.z is hero-relative (spawned behind, drifts +z)
    dummy.rotation.set(0, s.spin, 0); dummy.scale.setScalar(0.9);
    dummy.updateMatrix(); scatIM.setMatrixAt(i, dummy.matrix);
  }
  scatIM.instanceMatrix.needsUpdate = true;

  /* --- finish arch placement: next marker arch ahead, following bends --- */
  {
    const az = -(S.nextArchAt - ARCH_EVERY - S.dist); // the arch currently on course
    const onCourse = az < 12 && az > -480;
    archGroup.visible = onCourse;
    if (onCourse) {
      archGroup.position.set(bendX(0, -az), 0, az);
      archGroup.rotation.y = -Math.atan(trackBendVel(S.dist - az)) * 0.9;
      archGroup.rotation.z = THREE.MathUtils.clamp(-trackBendVel(S.dist - az) * 0.55, -0.12, 0.12);
    }
  }

  /* --- hero placement & animation --- */
  const runPhase = globalT * (7 + S.speed * 0.52); // stride rate per m/s held ~constant
  const hopPh = S.dist * 0.52; // hop cycle is DISTANCE-driven: one bound per ~12 m
  const hopRaw = Math.sin(hopPh);
  const hopLift = S.grounded && S.mode === 'run' ? Math.max(0, hopRaw) * 0.30 : 0;
  const hopS = THREE.MathUtils.clamp(hopRaw * 1.6, -1, 1); // sharpened: distinct crouch vs full-stretch airborne beats
  const hopC = Math.cos(hopPh);
  {
    H.group.position.set(S.laneX, S.y + hopLift, 0);
    /* lean INTO the bend + the steering lean: the road's slope at the
       hero tilts ROO up to ~8° on the turns (banking feel) */
    H.group.rotation.z = (LANE_X[S.lane] - S.relX) * -0.14 + THREE.MathUtils.clamp(-trackBendVel(S.dist) * 0.9, -0.14, 0.14);
    H.group.rotation.x = S.grounded ? (S.mode === 'run' ? -hopRaw * 0.09 : THREE.MathUtils.clamp(S.speed * 0.006, 0, 0.14)) : -0.12;
    // limbs — a kangaroo HOPS: both hind legs swing together through a
    // crouch -> launch -> airborne stretch -> reach -> land cycle, phased
    // to hopLift (which peaks at hopS = 1). NOT an alternating leg run.
    if (S.rollT > 0) { // tucked sprint (duck under the bar)
      H.legL.rotation.x = -0.55; H.legR.rotation.x = -0.55; H.shinL.rotation.x = 0.9; H.shinR.rotation.x = 0.9;
      H.armL.rotation.x = -0.9; H.armR.rotation.x = -0.9;
      H.bodyG.position.y = 0;
      H.group.rotation.z = S.steerX != null ? (S.steerX - S.laneX) * -0.14 + THREE.MathUtils.clamp(-trackBendVel(S.dist) * 0.9, -0.14, 0.14) : H.group.rotation.z;
    } else if (!S.grounded) { // the player's JUMP: legs reach forward, paws up
      H.legL.rotation.x = -0.85; H.legR.rotation.x = -0.85; H.shinL.rotation.x = 0.35; H.shinR.rotation.x = 0.35;
      H.armL.rotation.x = -2.2; H.armR.rotation.x = -2.2;
      H.bodyG.position.y = 0;
    } else if (S.mode === 'run') { // THE HOP CYCLE
      H.legL.rotation.x = -hopS * 0.62; H.legR.rotation.x = -hopS * 0.62;      // swing fwd as he rises, trail at the top, drive down to land
      H.shinL.rotation.x = 0.55 - hopC * 0.5; H.shinR.rotation.x = 0.55 - hopC * 0.5; // folded at crouch/apex, extended at launch/land
      H.armL.rotation.x = -0.35 - hopS * 0.3; H.armR.rotation.x = -0.35 - hopS * 0.3; // paws pump gently, together
      H.bodyG.position.y = -Math.max(0, -hopRaw) * 0.10; // crouch squash in the bottom half of the cycle
    } else { // menu idle: gentle breathing, feet planted
      H.legL.rotation.x = 0; H.legR.rotation.x = 0; H.shinL.rotation.x = 0.55; H.shinR.rotation.x = 0.55;
      H.armL.rotation.x = -0.35; H.armR.rotation.x = -0.35;
      H.bodyG.position.y = Math.sin(globalT * 1.8) * 0.015;
    }
    H.bodyG.rotation.x = S.rollT > 0 ? 0.35 : 0;
    H.tailG.rotation.x = (S.mode === 'run' && S.grounded) ? hopRaw * 0.16 : -0.08 + Math.sin(globalT * 2.2) * 0.05; // counter-wave against the hop
    H.tailG.rotation.y = Math.sin(globalT * 2.6) * 0.10;
    if (H.tail2G) H.tail2G.rotation.x = (S.mode === 'run' && S.grounded) ? -hopRaw * 0.22 : 0;
    if (H.joeyG) H.joeyG.rotation.x = (S.mode === 'run' && S.grounded) ? hopRaw * 0.14 : Math.sin(globalT * 2.4) * 0.06; // joey bobs with the hop
    H.earL.rotation.x = -0.22 - (S.speed / SPEED_MAX) * 0.3 + ((S.mode === 'run' && S.grounded) ? hopC * 0.08 : 0);
    H.earR.rotation.x = -0.22 - (S.speed / SPEED_MAX) * 0.3 + ((S.mode === 'run' && S.grounded) ? hopC * 0.08 : 0);
    H.scarfTail.rotation.x = 0.5 + (S.speed / SPEED_MAX) * 0.7 + Math.sin(globalT * 9) * 0.12;
    H.headG.rotation.y = (LANE_X[S.lane] - S.relX) * -0.2;
    // hurt flicker
    const flick = S.invulnT > 0 && ((globalT * 14) | 0) % 2 === 0;
    H.bodyG.visible = !flick;
  }
  H.group.visible = true;

  /* --- camera --- */
  const speedT = THREE.MathUtils.clamp((S.speed - SPEED0) / (SPEED_MAX - SPEED0), 0, 1);
  /* the camera aims a touch INTO the bend (look lead ∝ bend slope up to
     ~120 m ahead): the turn is visible coming, not a surprise */
  const bendLead = trackBend(S.dist + 110) - bendHero;
  let camTX = S.laneX * 0.55 + bendLead * 0.30, camTY = 5.4 + S.y * 0.32, camTZ = 9.6 - speedT * 0.9;
  let lookY = 1.1 + S.y * 0.3, lookZ = -12;
  let fovT = 66 + speedT * 10;
  camera.up.set(0, 1, 0);
  if (S.mode === 'menu') { // slow menu orbit drift
    camTX = Math.sin(globalT * 0.24) * 3.2; camTY = 3.6; camTZ = 8.6; lookY = 1.0; lookZ = -6; fovT = 60;
  }
  const lerpK = 1 - Math.exp(-6.0 * rawDt);
  const lookK = 1 - Math.exp(-9.0 * rawDt);
  {
    camera.position.x += (camTX - camera.position.x) * lerpK;
    camera.position.y += (camTY - camera.position.y) * lerpK;
    camera.position.z += (camTZ - camera.position.z) * lerpK;
    lookPt.x += ((camTX + bendLead * 0.85) * 1.309 - lookPt.x) * lookK;
    lookPt.y += (lookY - lookPt.y) * lookK;
    lookPt.z += (lookZ - lookPt.z) * lookK;
  }
  if (S.hitFlash > 0) camShake = Math.max(camShake, 0.12);
  if (camShake > 0.001) {
    camera.position.x += (Math.random() - 0.5) * camShake;
    camera.position.y += (Math.random() - 0.5) * camShake;
    camShake *= Math.pow(0.001, rawDt * 2.2);
  }
  camera.lookAt(lookPt);
  /* subtle speed vignette: a soft cool edge glow that only breathes in
     near top speed (polish pass — speedFx was a dead element before).
     Owner crash-safety rule: the style write happens ONLY when the
     rounded value actually changes and never while the value is 0, so
     this costs zero per-frame layout/paint churn for most of a run. */
  const fx = S.mode === 'run' ? Math.round(speedT * 10) / 10 : 0;
  if (fx !== speedFx._last) {
    speedFx._last = fx;
    speedFx.style.opacity = fx ? String(Math.min(1, fx * 1.6)) : '0';
  }
  if (Math.abs(camera.fov - fovT) > 0.05) { camera.fov += (fovT - camera.fov) * Math.min(1, rawDt * 3); camera.updateProjectionMatrix(); }

  /* --- water shimmer --- */
  waterTex.offset.y -= rawDt * 0.02;
  grassTex.offset.y = dirtTex.offset.y = 0; // static; sections scroll instead

  /* --- wind audio follows speed --- */
  if (AU.ctx && AU.windGain) {
    const target = S.mode === 'run' ? THREE.MathUtils.clamp((S.speed - 12) / 14, 0, 1) * 0.16 : 0;
    AU.windGain.gain.setTargetAtTime(S.muted ? 0 : target, AU.ctx.currentTime, 0.15);
    AU.windFilter.frequency.setTargetAtTime(350 + speedT * 750, AU.ctx.currentTime, 0.2);
  }
  /* hit feedback is the camera shake + heart loss only (Nov 7 hotfix):
     the old full-screen sky-dome tint flash is REMOVED — zero flash
     overlays. */

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
$('boot').classList.add('hidden'); // boot/loading screen hands over to the menu
animate();

/* QA hook (used by automated checks; harmless in production) */
window.__rush3d = { S, startRun, H, THREE, scene, camera, renderer, stick, stickDock, stickKnob, lookPt };
