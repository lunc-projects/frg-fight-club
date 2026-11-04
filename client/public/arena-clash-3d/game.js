import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';

/* ============================================================
   ARENA CLASH 3D — Midnight Colosseum
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
renderer.toneMappingExposure = 1.12;
document.getElementById('game').appendChild(renderer.domElement);

const scene = new THREE.Scene();
scene.fog = new THREE.FogExp2(0x0a0818, 0.028);

let isPortrait = innerWidth < innerHeight;
const camera = new THREE.PerspectiveCamera(isPortrait ? 50 : 38, innerWidth / innerHeight, 0.1, 200);
camera.position.set(0, 1.5, 7.2);

addEventListener('resize', () => {
  isPortrait = innerWidth < innerHeight;
  camera.aspect = innerWidth / innerHeight;
  camera.fov = isPortrait ? 50 : 38;
  camera.updateProjectionMatrix();
  renderer.setSize(innerWidth, innerHeight);
  layoutArena();
});

/* ---------------- lights ---------------- */
scene.add(new THREE.HemisphereLight(0x8fa3cc, 0x1a0f08, 0.55));
const keyLight = new THREE.DirectionalLight(0xffd9a8, 2.6);
keyLight.position.set(4.5, 8, 5);
keyLight.castShadow = true;
keyLight.shadow.mapSize.set(2048, 2048);
keyLight.shadow.camera.left = -6; keyLight.shadow.camera.right = 6;
keyLight.shadow.camera.top = 7; keyLight.shadow.camera.bottom = -3;
keyLight.shadow.camera.far = 30; keyLight.shadow.bias = -0.0004;
scene.add(keyLight);
const rimLight = new THREE.DirectionalLight(0x5e8bff, 2.0);
rimLight.position.set(-5, 4.5, -6);
scene.add(rimLight);
const underGlow = new THREE.PointLight(0xff7a26, 12, 12, 1.8);
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

/* ---------------- arena ---------------- */
let gateRing, gateGlowSpr, moonMesh, moonGlowSpr;
const arena = new THREE.Group(); scene.add(arena);
const flames = [];
let embers = null;
{
  const sky = new THREE.Mesh(new THREE.SphereGeometry(80, 32, 20),
    new THREE.MeshBasicMaterial({ map: skyTex, side: THREE.BackSide, fog: false }));
  arena.add(sky);

  const platform = new THREE.Mesh(new THREE.CylinderGeometry(5.4, 5.9, 0.5, 48),
    new THREE.MeshStandardMaterial({ map: floorTex, roughness: 0.85, metalness: 0.08 }));
  platform.position.y = -0.25; platform.receiveShadow = true;
  arena.add(platform);

  const rim = new THREE.Mesh(new THREE.TorusGeometry(5.4, 0.045, 10, 90),
    new THREE.MeshStandardMaterial({ color: 0x1a0d05, emissive: 0xff7a26, emissiveIntensity: 2.6 }));
  rim.rotation.x = Math.PI / 2; rim.position.y = 0.012;
  arena.add(rim);
  const rim2 = new THREE.Mesh(new THREE.TorusGeometry(4.1, 0.03, 8, 80),
    new THREE.MeshStandardMaterial({ color: 0x050d1a, emissive: 0x2e9bff, emissiveIntensity: 1.7 }));
  rim2.rotation.x = Math.PI / 2; rim2.position.y = 0.012;
  arena.add(rim2);

  const gate = new THREE.Mesh(new THREE.TorusGeometry(3.1, 0.16, 14, 64),
    new THREE.MeshStandardMaterial({ color: 0x140a06, emissive: 0xe04a08, emissiveIntensity: 1.6, roughness: .4 }));
  gate.position.set(0, 3.0, -9.5);
  arena.add(gate);
  const gateGlow = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTex, color: 0xff8b3d, transparent: true, opacity: 0.5, depthWrite: false }));
  gateGlow.scale.set(11, 11, 1); gateGlow.position.copy(gate.position);
  arena.add(gateGlow);
  const moon = new THREE.Mesh(new THREE.CircleGeometry(1.15, 40),
    new THREE.MeshBasicMaterial({ color: 0xe8eeff, fog: false }));
  moon.position.set(-10.5, 8.4, -30); arena.add(moon);
  const moonGlow = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTex, color: 0x9db8ff, transparent: true, opacity: .55, depthWrite: false, fog: false }));
  moonGlow.scale.set(7, 7, 1); moonGlow.position.copy(moon.position); arena.add(moonGlow);
  gateRing = gate; gateGlowSpr = gateGlow; moonMesh = moon; moonGlowSpr = moonGlow;

  const stoneMat = new THREE.MeshStandardMaterial({ color: 0x191423, roughness: .95 });
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
  const N = 240, pos = new Float32Array(N * 3);
  for (let i = 0; i < N; i++) {
    pos[i * 3] = (Math.random() - .5) * 22; pos[i * 3 + 1] = Math.random() * 7; pos[i * 3 + 2] = -6 + Math.random() * 12;
  }
  const eg = new THREE.BufferGeometry();
  eg.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  embers = new THREE.Points(eg, new THREE.PointsMaterial({ map: glowTex, color: 0xffa050, size: 0.09, transparent: true, opacity: .8, depthWrite: false, blending: THREE.AdditiveBlending }));
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
    moonMesh.position.set(-3.8, 7.2, -26); moonMesh.scale.setScalar(0.85);
    moonGlowSpr.position.copy(moonMesh.position); moonGlowSpr.scale.set(5.5, 5.5, 1);
    scene.fog.density = 0.02;
  } else {
    gateRing.position.set(0, 3.0, -9.5); gateRing.scale.setScalar(1);
    gateGlowSpr.position.copy(gateRing.position); gateGlowSpr.scale.set(11, 11, 1);
    moonMesh.position.set(-10.5, 8.4, -30); moonMesh.scale.setScalar(1);
    moonGlowSpr.position.copy(moonMesh.position); moonGlowSpr.scale.set(7, 7, 1);
    scene.fog.density = 0.028;
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
  hit(heavy) { this.tone(heavy ? 140 : 180, 42, 0.16, 'sine', 0.65); this.noise(0.07, 2400, 'highpass', 0.2); },
  block() { this.tone(740, 620, 0.06, 'square', 0.12); this.noise(0.05, 3400, 'highpass', 0.12); },
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
    this.blocking = false; this.crouching = false;
    this.roundsWon = 0; this.aiTimer = 0; this.aiHoldT = 0; this.aiAction = null; this.aiBlockT = 0;
  }
  async load() {
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
function spawnOrb(owner, pos) {
  const grp = new THREE.Group();
  const core = new THREE.Mesh(new THREE.SphereGeometry(0.11, 16, 12),
    new THREE.MeshStandardMaterial({ color: 0x220a12, emissive: 0xff5577, emissiveIntensity: 4 }));
  const glow = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTex, color: 0xff7799, transparent: true, opacity: .8, depthWrite: false, blending: THREE.AdditiveBlending }));
  glow.scale.set(0.85, 0.85, 1);
  const light = new THREE.PointLight(0xff5577, 6, 3.4, 1.8);
  grp.add(core, glow, light); grp.position.copy(pos);
  fxGroup.add(grp);
  projectiles.push({ grp, owner, vx: owner.face * 6.4, life: 2.2 });
  AudioSys.zap();
}
const _v1 = new THREE.Vector3(), _v2 = new THREE.Vector3();

/* ---------------- combat ---------------- */
const ATTACKS = {
  jab:   { clip: 'jab',   startup: 0.10, active: 0.13, dmg: 5,  range: 1.04, push: 0.9, gain: 7,  hit: 'hitL', hitstop: 0.045, shake: 0.05 },
  heavy: { clip: 'heavy', startup: 0.24, active: 0.15, dmg: 10, range: 1.10, push: 1.7, gain: 11, hit: 'hitH', hitstop: 0.085, shake: 0.11 },
  kick:  { clip: 'kick1', startup: 0.13, active: 0.42, dmg: 8,  range: 0.86, push: 1.3, gain: 9,  hit: 'hitL', hitstop: 0.06, shake: 0.08, slide: true },
};
let hitstopT = 0, slowmoT = 0, shakeAmp = 0;

function dist(a, b) { return Math.abs(a.x - b.x); }
function inRange(att, def, range) { return dist(att, def) <= range && Math.abs(att.y - def.y) < 0.9; }

function startAttack(f, key) {
  const def = ATTACKS[key]; if (!def) return;
  f.state = 'attack'; f.stateT = 0; f.atk = def; f.atkKey = key; f.atkHitDone = false;
  f.play(def.clip, { loop: false, clamp: true, fade: 0.05 });
  if (key === 'kick') AudioSys.swing();
  else if (key === 'jab') setTimeout(() => AudioSys.swing(), 60);
  else AudioSys.swing();
}
function startSpecial(f) {
  if (f.meter < 50 || f.state !== 'idle' && f.state !== 'walk') return;
  f.meter -= 50;
  f.state = 'special'; f.stateT = 0; f.atkHitDone = false; f.specDone = false;
  if (f.cfg.specialType === 'dash') { f.play('special', { loop: false, clamp: true, fade: 0.05 }); AudioSys.dash(); }
  else { f.play('throw', { loop: false, clamp: true, fade: 0.05 }); }
}
function resolveHit(att, def, dmg, hitClip, push, opts = {}) {
  const blocked = def.blocking && def.state !== 'attack' && def.state !== 'hitstun' && def.state !== 'special';
  def.bonePos(def.chestBone, _v1); _v1.z = 0;
  if (blocked) {
    const chip = Math.max(1, Math.round(dmg * 0.1));
    def.hp = Math.max(1, def.hp - chip);
    def.state = 'blockstun'; def.stateT = 0;
    def.vx = att.face * push * 0.7;
    burst(_v1, 0xaaccff, 8, 1.6, 0.6);
    AudioSys.block();
    hitstopT = Math.max(hitstopT, 0.03);
    return;
  }
  def.hp -= dmg;
  att.meter = Math.min(100, att.meter + (opts.gain || 8));
  def.meter = Math.min(100, def.meter + 5);
  def.vx = att.face * push;
  burst(_v1, att.cfg.sparkColor, opts.heavy ? 26 : 16, opts.heavy ? 3.4 : 2.5, 1.3);
  if (opts.slash) { att.bonePos(att.handBone, _v2); slashArc(_v1, att.cfg.sparkColor, att.face < 0); }
  AudioSys.hit(opts.heavy);
  hitstopT = Math.max(hitstopT, opts.hitstop || 0.05);
  shakeAmp = Math.max(shakeAmp, opts.shake || 0.07);
  if (def.hp <= 0) { def.hp = 0; koSequence(att, def); return; }
  def.state = hitClip === 'knock' ? 'knock' : 'hitstun'; def.stateT = 0;
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
const P1 = new Fighter({
  name: 'MR LUNC', model: 'models/ryker/char.gltf', startX: -1.7, handBone: 'hand_r',
  sparkColor: 0x7fd8ff, specialType: 'dash',
  hair: ['models/ryker/Hair_SimpleParted.gltf', 'models/ryker/Hair_Beard.gltf'],
  clips: { ...CLIPMAP, heavy: 'Melee_Hook', special: 'Sword_Dash', throw: 'OverhandThrow' },
});
const P2 = new Fighter({
  name: 'MR USTC', model: 'models/sable/char.gltf', startX: 1.7, handBone: 'hand_l',
  sparkColor: 0xff8095, specialType: 'orb',
  hair: ['models/sable/Hair_Long.gltf'], hairTint: 0x6e4a34,
  clips: { ...CLIPMAP, heavy: 'Punch_Cross', special: 'Spell_Simple_Shoot', throw: 'Spell_Simple_Shoot' },
});
const FIGHTERS = [P1, P2];
function foe(f) { return f === P1 ? P2 : P1; }

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
const stick = { id: null, cx: 0, cy: 0 };
function stickReset() {
  stick.id = null;
  stickKnob.style.transform = '';
  touchState.left = touchState.right = touchState.down = touchState.up = false;
}
function stickVector(dx, dy) {
  const R = 46, len = Math.hypot(dx, dy);
  if (len > R) { dx *= R / len; dy *= R / len; }
  stickKnob.style.transform = `translate(${dx}px,${dy}px)`;
  touchState.left = dx < -15; touchState.right = dx > 15;
  touchState.down = dy > 20; touchState.up = dy < -20;
}
stickZone.addEventListener('pointerdown', e => {
  if (stick.id !== null) return;
  AudioSys.init();
  stick.id = e.pointerId; stick.cx = e.clientX; stick.cy = e.clientY;
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
function fighterUpdate(f, dt, input) {
  const o = foe(f);
  f.stateT += dt;
  // gravity / jump physics
  if (f.y > 0 || f.vy > 0) {
    f.vy -= 21 * dt; f.y += f.vy * dt;
    if (f.y <= 0) { f.y = 0; f.vy = 0; if (f.state === 'jump') { f.state = 'idle'; f.play('idle'); } }
  }
  // pushback velocity decay
  if (Math.abs(f.vx) > 0.01 && f.state !== 'special') {
    f.x += f.vx * dt; f.vx *= Math.max(0, 1 - 9 * dt);
  } else if (f.state === 'special' && f.cfg.specialType === 'dash') {
    // handled in special branch below
  } else f.vx = 0;
  f.blocking = false; f.crouching = false;

  const busy = ['attack', 'special', 'hitstun', 'blockstun', 'knock', 'death', 'win'].includes(f.state);
  if (!busy && game.phase === 'fight') {
    const toward = (f.face > 0 && input.right) || (f.face < 0 && input.left);
    const away = (f.face > 0 && input.left) || (f.face < 0 && input.right);
    const threat = (o.state === 'attack' || o.state === 'special') && dist(f, o) < 1.7;
    if (input.blockKey || (away && threat)) {
      f.blocking = true;
      if (f.state !== 'block') { f.state = 'block'; f.play('block', { fade: 0.06 }); }
    } else if (input.down) {
      f.crouching = true;
      if (f.state !== 'crouch') { f.state = 'crouch'; f.play('crouch', { fade: 0.06 }); }
    } else if (input.jumpHit && f.y === 0) {
      f.state = 'jump'; f.vy = 8.2; f.play('jump', { loop: false, clamp: true, fade: 0.05 });
    } else if (input.jabHit) startAttack(f, 'jab');
    else if (input.hookHit) startAttack(f, 'heavy');
    else if (input.kickHit) startAttack(f, 'kick');
    else if (input.specHit) startSpecial(f);
    else if (toward || away) {
      const dir = toward ? f.face : -f.face;
      f.x += dir * 1.75 * dt;
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
    if (!f.atkHitDone && f.stateT >= a.startup && f.stateT <= a.startup + a.active && inRange(f, o2, a.range)) {
      f.atkHitDone = true;
      resolveHit(f, o2, a.dmg, a.hit, a.push, { gain: a.gain, hitstop: a.hitstop, shake: a.shake, heavy: a.dmg >= 10, slash: f.atkKey !== 'kick' });
    }
    const total = Math.max(f.dur(f.atk.clip) * 0.92, a.startup + a.active + 0.18);
    if (f.stateT >= total) { f.state = 'idle'; f.atk = null; f.play('idle', { fade: 0.07 }); }
  }
  if (f.state === 'special') {
    if (f.cfg.specialType === 'dash') {
      const total = f.dur('special');
      if (f.stateT < 0.34) f.x += f.face * 7.6 * dt;
      if (!f.atkHitDone && f.stateT > 0.1 && inRange(f, o, 1.15)) {
        f.atkHitDone = true;
        f.bonePos(f.chestBone, _v1); slashArc(_v1, f.cfg.sparkColor, f.face < 0);
        resolveHit(f, o, 16, 'knock', 2.4, { gain: 4, hitstop: 0.13, shake: 0.16, heavy: true });
      }
      if (f.stateT >= total * 0.95) { f.state = 'idle'; f.play('idle', { fade: 0.08 }); }
    } else {
      if (!f.specDone && f.stateT >= 0.34) {
        f.specDone = true;
        f.bonePos(f.handBone, _v1); _v1.y = Math.max(_v1.y, 1.25); _v1.z = 0;
        spawnOrb(f, _v1.clone());
      }
      if (f.stateT >= f.dur('throw') * 0.95) { f.state = 'idle'; f.play('idle', { fade: 0.08 }); }
    }
  }
  if (f.state === 'hitstun' && f.stateT > (f.currentKey === 'hitH' ? 0.42 : 0.3)) { f.state = 'idle'; f.play('idle', { fade: 0.06 }); }
  if (f.state === 'blockstun' && f.stateT > 0.2) { f.state = 'idle'; f.play('idle', { fade: 0.05 }); }
  if (f.state === 'knock' && f.stateT > f.dur('knock') + 0.55) { f.state = 'idle'; f.play('idle', { fade: 0.1 }); }
  if (f.state === 'block' && game.phase === 'fight' && !input.blockKey && !input._aiBlock) { f.state = 'idle'; f.play('idle', { fade: 0.06 }); }

  if (f.state === 'death') f.y = -0.52 * Math.min(1, f.stateT / 0.45); // Death01 floats (root motion is neutralised) — settle the body onto the floor
  f.x = THREE.MathUtils.clamp(f.x, STAGE_MIN, STAGE_MAX);
  f.group.position.x = f.x;
  f.group.position.y = f.y;
  if (f.state !== 'death') { f.face = foe(f).x >= f.x ? 1 : -1; f.applyFacing(); }
  f.mixer.update(dt);
}

/* ---------------- AI ---------------- */
function aiInput(f, dt) {
  const o = foe(f);
  const inp = { left: false, right: false, down: false, jump: false, blockKey: false, jab: false, hook: false, kick: false, spec: false, _aiBlock: false };
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
    if (d > 2.7) {
      if (f.meter >= 50 && f.cfg.specialType === 'orb' && Math.random() < 0.5) { inp.specHit = true; }
      else { f.aiAction = towardKey; f.aiHoldT = 0.24; }
    } else if (d > 1.18) {
      const r = Math.random();
      if (f.meter >= 50 && f.cfg.specialType === 'dash' && r < 0.3) inp.specHit = true;
      else if (r < 0.24) { inp.kickHit = true; }
      else if (r < 0.34 && hurt) { f.aiAction = awayKey; f.aiHoldT = 0.3; }
      else { f.aiAction = towardKey; f.aiHoldT = 0.2; }
    } else {
      const r = Math.random();
      if (r < 0.42) inp.jabHit = true;
      else if (r < 0.64) inp.hookHit = true;
      else if (r < 0.78) inp.kickHit = true;
      else if (r < 0.88) { f.aiAction = awayKey; f.aiHoldT = 0.26; }
      else { inp.blockKey = true; inp._aiBlock = true; f.aiBlockT = 0.3; }
    }
  }
  if (f.aiAction) inp[f.aiAction] = true;
  return inp;
}

/* ---------------- match flow ---------------- */
const game = { phase: 'boot', round: 1, timer: 60, phaseT: 0, winner: null };
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
  f.face = f.cfg.startX < 0 ? 1 : -1; f.applyFacing(); f.play('idle');
  f.group.position.set(f.x, 0, 0);
}
function startMatch() {
  P1.roundsWon = 0; P2.roundsWon = 0; game.round = 1;
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
  for (const [f, hpEl, ghostEl, meterEl] of [[P1, $('hp1'), $('ghost1'), $('meter1')], [P2, $('hp2'), $('ghost2'), $('meter2')]]) {
    const v = Math.max(0, f.hp) / 100;
    hpEl.style.transform = `scaleX(${v})`;
    ghostEl.style.transform = `scaleX(${v})`;
    hpEl.classList.toggle('low', f.hp <= 25 && f.hp > 0);
    meterEl.style.width = f.meter + '%';
    meterEl.classList.toggle('ready', f.meter >= 50);
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
  // at the current aspect. In landscape this stays under the classic framing
  // distance, so the approved landscape shot is unchanged; in portrait it
  // pulls the camera back until BOTH fighters are in frame.
  const fitK = 2 * Math.tan(camera.fov * Math.PI / 360) * (innerWidth / innerHeight);
  const distFit = THREE.MathUtils.clamp(sep * 0.92 + 1.9, 3.8, 8.8) / fitK;
  const distC = THREE.MathUtils.clamp(Math.max(3.1 + sep * 0.66, distFit), 4.7, isPortrait ? 14 : 7.4);
  let tx = mid * 0.6, ty = isPortrait ? 1.95 : 1.34, tz = distC;
  if (game.phase === 'menu') {
    tx = Math.sin(t * 0.11) * 1.6; ty = isPortrait ? 1.8 : 1.35;
    tz = isPortrait ? Math.max(7.4, (3.4 * 0.92 + 1.9) / fitK) : 7.4;
  }
  if (game.phase === 'roundEnd' || game.phase === 'matchEnd') {
    const w = game.winner || P1; tx = w.x * 0.8; ty = isPortrait ? 1.8 : 1.3; tz = isPortrait ? 8.2 : 5.2;
  }
  camTarget.set(tx, ty, tz);
  camera.position.lerp(camTarget, 1 - Math.pow(0.0015, dt));
  if (shakeAmp > 0.002) {
    camera.position.x += (Math.random() - .5) * shakeAmp * 0.35;
    camera.position.y += (Math.random() - .5) * shakeAmp * 0.3;
    shakeAmp *= Math.pow(0.0001, dt);
  } else shakeAmp = 0;
  camera.lookAt(mid * 0.75, isPortrait ? 0.8 : 1.02, 0);
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
    const s = 1.4 + Math.sin(elapsed * 9 + i * 1.7) * 0.18 + Math.sin(elapsed * 23 + i) * 0.08;
    fl.scale.set(s, s * 1.3, 1);
  });
  underGlow.intensity = 11 + Math.sin(elapsed * 2.3) * 2.2;

  const SUB = QA_MODE === 'auto' ? 6 : 1; // QA-only: substep the sim so a full match completes under slow software rendering
  for (let _s = 0; _s < SUB; _s++) {
  if (game.phase !== 'boot') {
    game.phaseT += rawDt;
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
        showBanner(w.cfg.name + ' WINS', 'CHAMPION OF THE COLOSSEUM', 2.6);
        if (!QA_MODE) $('rematch').style.display = 'block';
      } else { game.round++; startRound(); }
    }
    if (game.phase !== 'frozen' && (dt > 0 || game.phase === 'roundEnd' || game.phase === 'matchEnd')) {
      const inp = QA_MODE === 'auto' ? aiInput(P1, dt) : readPlayerInput();
      const ai = QA_MODE === 'auto' ? aiInput(P2, dt) : aiInput(P2, dt);
      fighterUpdate(P1, dt, game.phase === 'fight' ? inp : {});
      fighterUpdate(P2, dt, game.phase === 'fight' ? ai : {});
      // body separation
      if (P1.state !== 'death' && P2.state !== 'death') {
        const d = P2.x - P1.x;
        if (Math.abs(d) < 0.58 && Math.abs(P1.y - P2.y) < 0.6) {
          const push = (0.58 - Math.abs(d)) / 2 * Math.sign(d || 1);
          P1.x -= push; P2.x += push;
        }
      }
      // projectiles
      for (let i = projectiles.length - 1; i >= 0; i--) {
        const p = projectiles[i];
        p.grp.position.x += p.vx * dt; p.life -= dt;
        p.grp.children[0].rotation.x += dt * 9;
        const target = foe(p.owner);
        const tp = target.bonePos(target.chestBone, _v2);
        if (target.state !== 'death' && p.grp.position.distanceTo(tp) < 0.52) {
          resolveHit(p.owner, target, 12, 'knock', 2.0, { gain: 3, hitstop: 0.1, shake: 0.13, heavy: true });
          p.life = 0;
        }
        if (p.life <= 0 || Math.abs(p.grp.position.x) > 5.2) {
          burst(p.grp.position, 0xff7799, 10, 1.8, 0.8);
          fxGroup.remove(p.grp); projectiles.splice(i, 1);
        }
      }
    } else {
      P1.mixer.update(0); P2.mixer.update(0);
    }
    updateHUD();
  }
  }
  updateSparks(rawDt);
  updateSlashes(rawDt);
  updateCamera(rawDt, elapsed);
  renderer.render(scene, camera);

  if (QA_MODE) {
    const el = document.getElementById('qaState');
    el.textContent = JSON.stringify({
      phase: game.phase, round: game.round, timer: Math.round(game.timer * 10) / 10,
      hp: [Math.round(P1.hp), Math.round(P2.hp)], wins: [P1.roundsWon, P2.roundsWon],
      states: [P1.state, P2.state], errors: window.__errs,
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
    setLoad(0.75, 'MR USTC');
    await P2.load();
    setLoad(1, 'READY');
    document.getElementById('loading').style.display = 'none';
    document.getElementById('hud').style.display = 'block';
    if (QA_MODE) { setupQA(QA_MODE); }
    else {
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
document.getElementById('fightBtn').addEventListener('click', () => {
  AudioSys.init(); AudioSys.bell();
  document.getElementById('menu').style.display = 'none';
  startMatch();
});
document.getElementById('rematch').addEventListener('click', () => { AudioSys.init(); startMatch(); });

/* ---------------- QA scenes (deterministic tableaux) ---------------- */
function freezePose(f, key, at) {
  f.play(key, { loop: false, clamp: true, fade: 0 });
  if (f.current) f.current.time = at;
  f.mixer.update(0.001);
}
function setupQA(mode) {
  document.getElementById('menu').style.display = 'none';
  document.getElementById('hud').style.display = 'block';
  if (mode === 'auto') { game.phase = 'menu'; startMatch(); return; }
  game.phase = 'fight'; game.timer = 47;
  P1.meter = 65; P2.meter = 80;
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
    P2.bonePos(P2.chestBone, _v1); burst(_v1, 0x7fd8ff, 22, 3, 1.3);
    slashArc(_v1, 0x7fd8ff, false);
    game.phase = 'frozen';
  } else if (mode === 'specdash') {
    P1.x = -0.9; P2.x = 0.62;
    P1.group.position.x = P1.x; P2.group.position.x = P2.x;
    P1.face = 1; P2.face = -1; P1.applyFacing(); P2.applyFacing();
    freezePose(P1, 'special', 0.3);
    freezePose(P2, 'hitH', 0.1);
    P2.hp = 61;
    P2.bonePos(P2.chestBone, _v1); burst(_v1, 0x7fd8ff, 26, 3.4, 1.4);
    slashArc(_v1, 0x7fd8ff, false);
    game.phase = 'frozen';
  } else if (mode === 'specorb') {
    P1.x = -0.7; P2.x = 1.5;
    P1.group.position.x = P1.x; P2.group.position.x = P2.x;
    P1.face = 1; P2.face = -1; P1.applyFacing(); P2.applyFacing();
    freezePose(P2, 'throw', 0.4);
    freezePose(P1, 'idle', 0.3);
    P2.bonePos(P2.handBone, _v1);
    spawnOrb(P2, new THREE.Vector3(0.35, 1.35, 0));
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
    // Mid-fight: MR LUNC's jab knocks MR USTC around — USTC back to camera.
    P1.x = -0.55; P2.x = 0.58;
    P1.group.position.x = P1.x; P2.group.position.x = P2.x;
    P1.face = 1; P1.applyFacing();
    P2.group.rotation.y = Math.PI * 0.8;
    freezePose(P1, 'jab', 0.16);
    freezePose(P2, 'knock', 0.12);
    P2.hp = 84;
    P2.bonePos(P2.chestBone, _v1); burst(_v1, 0x7fd8ff, 20, 3, 1.3);
    slashArc(_v1, 0x7fd8ff, false);
    game.phase = 'frozen';
  }
  updateHUD();
}
