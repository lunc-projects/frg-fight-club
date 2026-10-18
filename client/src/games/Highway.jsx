import { useEffect, useRef, useState } from 'react';

// FRG Highway — REAL 3D endless driver (Three.js/WebGL). Weave the
// neon highway, skim past traffic for NEAR MISS bonuses, grab the gold
// coins — one crash ends the run. The 3D is a presentation layer: the
// run logic, scoring and result contract are the same ones the server
// re-derives exactly (score = distance/10 + 25/coin + 50/near miss).
export const HIGHWAY_TIERS = [
  { min: 4500, amount: 45 },
  { min: 3000, amount: 32 },
  { min: 2000, amount: 22 },
  { min: 1200, amount: 15 },
  { min: 700, amount: 10 },
  { min: 300, amount: 5 },
];
export function highwayPoints(score) {
  const t = HIGHWAY_TIERS.find((x) => score >= x.min);
  return t ? t.amount : 0;
}

const W = 400;
const H = 560;
const SEG = 200;
const NSEG = 300;
const TRACK = SEG * NSEG;
const DRAW = 42;
const ROAD_W = 2100;
const CAM_H = 1050;
const FOV = 100;
const CAM_DEPTH = 1 / Math.tan(((FOV / 2) * Math.PI) / 180);
const PLAYER_Z = CAM_H * CAM_DEPTH;
const MAX_SPEED = SEG * 60;
const ACCEL = MAX_SPEED / 3.5;
const CENTRIFUGAL = 0.31;
const LANES_X = [-0.62, 0, 0.62];
const PLAYER_VIEW_Z = 2400;

function curveAt(i) {
  if (i < 18) return 0;
  const c = Math.sin(i * 0.013) * 1.35 + Math.sin(i * 0.0047 + 1.7) * 1.15;
  return Math.max(-2.3, Math.min(2.3, c));
}

export default function Highway({ onFinish }) {
  const mountRef = useRef(null);
  const overlayRef = useRef(null);
  const [hud, setHud] = useState({ kmh: 0, score: 0, dist: 0, coins: 0 });
  const [glFailed, setGlFailed] = useState(false);
  const [stageTry, setStageTry] = useState(0);
  const [phase, setPhase] = useState('count');
  const S = useRef(null);
  if (!S.current) {
    S.current = {
      phase: 'count', countAt: performance.now(), startedAt: null, finishedAt: null,
      position: 0, absPos: 0, playerX: 0, speed: 0, steer: 0, btnSteer: 0, dragX: null, keys: 0,
      cars: [], coins: [], nextCarZ: 2600, nextCoinZ: 5200,
      coinsGot: 0, nearMisses: 0, distance: 0, score: 0,
      popups: [], callout: null, shake: 0, crashSpin: 0,
      lastCalloutAt: 0, hudAt: 0, over: false, offroad: false,
      burst: null,
    };
  }

  useEffect(() => {
    const s = S.current;
    let disposed = false;
    let raf = 0;
    let cleanup3d = () => {};

    (async () => {
      const THREE = await import('three');
      if (disposed) return;
      try {

      // ---------- renderer / scene ----------
      const mount = mountRef.current;
      // Some phones/WebViews refuse the fanciest context — degrade
      // gracefully through plainer settings instead of a black screen.
      let renderer = null;
      let lastErr = null;
      for (const opts of [
        { antialias: true, powerPreference: 'high-performance' },
        { antialias: false, powerPreference: 'default' },
        { antialias: false, powerPreference: 'low-power' },
      ]) {
        try {
          renderer = new THREE.WebGLRenderer(opts);
          break;
        } catch (e) {
          lastErr = e;
        }
      }
      if (!renderer) throw lastErr || new Error('WebGL unavailable on this device');
      renderer.domElement.addEventListener('webglcontextlost', (e) => {
        e.preventDefault();
        if (!disposed) setGlFailed(true);
      });
      renderer.setPixelRatio(Math.min(2, window.devicePixelRatio || 1));
      renderer.setSize(W, H, false);
      renderer.domElement.style.cssText = 'position:absolute;inset:0;width:100%;height:100%;display:block;';
      mount.appendChild(renderer.domElement);

      const scene = new THREE.Scene();
      scene.background = new THREE.Color(0x070a1c);
      scene.fog = new THREE.Fog(0x070a1c, 2600, 9900);
      const camera = new THREE.PerspectiveCamera(62, W / H, 10, 30000);
      camera.position.set(0, 1620, 0);

      scene.add(new THREE.HemisphereLight(0x8fb7ff, 0x1a1030, 1.7));
      const sun = new THREE.DirectionalLight(0xbfd8ff, 1.9);
      sun.position.set(2500, 4200, -1500);
      scene.add(sun);
      const fill = new THREE.DirectionalLight(0x9fc4ff, 0.85);
      fill.position.set(-1200, 2600, 6000);
      scene.add(fill);
      const glow = new THREE.PointLight(0xffc46b, 1.5, 9500, 0);
      glow.position.set(0, 750, 3000);
      scene.add(glow);

      // ---------- sky: stars + moon ----------
      {
        const n = 380;
        const pos = new Float32Array(n * 3);
        for (let i = 0; i < n; i++) {
          const a = Math.random() * Math.PI * 2;
          const e = Math.random() * 0.9 + 0.08;
          const r = 16000;
          pos[i * 3] = Math.cos(a) * r * Math.cos(e);
          pos[i * 3 + 1] = Math.sin(e) * r * 0.5;
          pos[i * 3 + 2] = Math.abs(Math.sin(a)) * r - 2000;
        }
        const g = new THREE.BufferGeometry();
        g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
        scene.add(new THREE.Points(g, new THREE.PointsMaterial({ color: 0xcfe2ff, size: 42, sizeAttenuation: true, fog: false })));
        const moon = new THREE.Mesh(
          new THREE.CircleGeometry(620, 32),
          new THREE.MeshBasicMaterial({ color: 0xf5f0c8, fog: false })
        );
        moon.position.set(-5200, 4300, 13500);
        scene.add(moon);
      }

      // ---------- ground ----------
      {
        const ground = new THREE.Mesh(
          new THREE.PlaneGeometry(46000, 24000),
          new THREE.MeshBasicMaterial({ color: 0x05070f })
        );
        ground.rotation.x = -Math.PI / 2;
        ground.position.set(0, -30, 9000);
        scene.add(ground);
      }

      // ---------- road ribbon + neon edges (geometry rebuilt per frame) ----------
      const NB = DRAW + 3; // boundary samples
      function ribbon(width, y, color, vertexColors) {
        const geo = new THREE.BufferGeometry();
        const positions = new Float32Array(NB * 2 * 3);
        geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
        const normals = new Float32Array(NB * 2 * 3);
        for (let i = 0; i < NB * 2; i++) normals[i * 3 + 1] = 1;
        geo.setAttribute('normal', new THREE.BufferAttribute(normals, 3));
        if (vertexColors) geo.setAttribute('color', new THREE.BufferAttribute(new Float32Array(NB * 2 * 3), 3));
        const idx = [];
        for (let i = 0; i < NB - 1; i++) {
          const a = i * 2, b = i * 2 + 1, c = i * 2 + 2, d = i * 2 + 3;
          idx.push(a, b, c, b, d, c);
        }
        geo.setIndex(idx);
        const mat = vertexColors
          ? new THREE.MeshBasicMaterial({ vertexColors: true, side: THREE.DoubleSide })
          : new THREE.MeshStandardMaterial({ color, roughness: 0.92, metalness: 0.05, side: THREE.DoubleSide });
        const mesh = new THREE.Mesh(geo, mat);
        mesh.frustumCulled = false;
        scene.add(mesh);
        return { mesh, positions };
      }
      const road = ribbon(ROAD_W, 0, 0x39406b, false);
      const edgeL = ribbon(210, 6, 0, true);
      const edgeR = ribbon(210, 6, 0, true);
      const NEON = [new THREE.Color(0xff2e88), new THREE.Color(0x00e5ff)];

      // lane dashes — pooled planes
      const dashMat = new THREE.MeshBasicMaterial({ color: 0xdfe9ff });
      const dashes = [];
      for (let i = 0; i < 26; i++) {
        const d = new THREE.Mesh(new THREE.PlaneGeometry(60, 300), dashMat);
        d.rotation.x = -Math.PI / 2;
        d.position.y = 8;
        scene.add(d);
        dashes.push(d);
      }

      // ---------- city buildings (instanced, window-lit texture) ----------
      function facadeTexture() {
        const c = document.createElement('canvas');
        c.width = 128; c.height = 256;
        const x = c.getContext('2d');
        x.fillStyle = '#0c1229';
        x.fillRect(0, 0, 128, 256);
        for (let r = 0; r < 16; r++) {
          for (let col = 0; col < 6; col++) {
            const lit = Math.random();
            x.fillStyle = lit > 0.62 ? (Math.random() < 0.6 ? '#ffd98a' : '#9fd8ff') : '#070b1c';
            x.fillRect(10 + col * 19, 10 + r * 15, 11, 8);
          }
        }
        const t = new THREE.CanvasTexture(c);
        t.colorSpace = THREE.SRGBColorSpace;
        return t;
      }
      const CITY_N = 92;
      const city = new THREE.InstancedMesh(
        new THREE.BoxGeometry(1, 1, 1),
        new THREE.MeshBasicMaterial({ map: facadeTexture() }),
        CITY_N
      );
      city.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
      city.frustumCulled = false;
      scene.add(city);
      const cityTint = [new THREE.Color(0x9db4ff), new THREE.Color(0xffd9a0), new THREE.Color(0xd0a8ff), new THREE.Color(0xa8ffe9)];
      const buildings = [];
      for (let i = 0; i < CITY_N; i++) {
        buildings.push({
          trackZ: Math.random() * 16000,
          side: i % 2 ? 1 : -1,
          lane: Math.random(),
          w: 1100 + Math.random() * 1300,
          h: 1500 + Math.random() * 3400,
          d: 1100 + Math.random() * 900,
        });
        city.setColorAt(i, cityTint[i % cityTint.length]);
      }
      if (city.instanceColor) city.instanceColor.needsUpdate = true;
      const CITY_SPAN = 16000;

      // ---------- streetlights (pooled) ----------
      const lampMat = new THREE.MeshBasicMaterial({ color: 0x8be9ff });
      const poleMat = new THREE.MeshStandardMaterial({ color: 0x2a3350, roughness: 0.8 });
      const lamps = [];
      for (let i = 0; i < 12; i++) {
        const g = new THREE.Group();
        const pole = new THREE.Mesh(new THREE.CylinderGeometry(26, 34, 980, 6), poleMat);
        pole.position.y = 490;
        const head = new THREE.Mesh(new THREE.SphereGeometry(72, 10, 8), lampMat);
        head.position.y = 1010;
        g.add(pole, head);
        scene.add(g);
        lamps.push(g);
      }

      // ---------- cars ----------
      function makeCar(bodyColor, isPlayer) {
        const g = new THREE.Group();
        const paint = new THREE.MeshStandardMaterial({ color: bodyColor, roughness: 0.46, metalness: 0.35, emissive: bodyColor, emissiveIntensity: 0.14 });
        const body = new THREE.Mesh(new THREE.BoxGeometry(1150, 330, 2500), paint);
        body.position.y = 330;
        const hood = new THREE.Mesh(new THREE.BoxGeometry(1060, 190, 760), paint);
        hood.position.set(0, 560, 800);
        const cabin = new THREE.Mesh(
          new THREE.BoxGeometry(920, 330, 1080),
          new THREE.MeshStandardMaterial({ color: 0x101828, roughness: 0.12, metalness: 0.4 })
        );
        cabin.position.set(0, 640, -160);
        g.add(body, hood, cabin);
        if (isPlayer) {
          const spoiler = new THREE.Mesh(new THREE.BoxGeometry(1180, 60, 260), paint);
          spoiler.position.set(0, 700, -1180);
          const finL = new THREE.Mesh(new THREE.BoxGeometry(60, 190, 200), paint);
          finL.position.set(-480, 580, -1180);
          const finR = finL.clone();
          finR.position.x = 480;
          g.add(spoiler, finL, finR);
        }
        const wheelGeo = new THREE.CylinderGeometry(300, 300, 190, 14);
        wheelGeo.rotateZ(Math.PI / 2);
        const wheelMat = new THREE.MeshStandardMaterial({ color: 0x0a0a12, roughness: 0.9 });
        for (const [wx, wz] of [[-560, 800], [560, 800], [-560, -800], [560, -800]]) {
          const w = new THREE.Mesh(wheelGeo, wheelMat);
          w.position.set(wx, 300, wz);
          g.add(w);
        }
        const tailMat = new THREE.MeshBasicMaterial({ color: 0xff2a30 });
        for (const tx of [-330, 330]) {
          const t = new THREE.Mesh(new THREE.BoxGeometry(300, 90, 30), tailMat);
          t.position.set(tx, 420, -1265);
          g.add(t);
        }
        const headMat = new THREE.MeshBasicMaterial({ color: 0xfff3c4 });
        for (const hx of [-350, 350]) {
          const h = new THREE.Mesh(new THREE.BoxGeometry(260, 80, 30), headMat);
          h.position.set(hx, 400, 1265);
          g.add(h);
        }
        g.visible = false;
        scene.add(g);
        return g;
      }
      const playerCar = makeCar(0xf7b733, true);
      playerCar.scale.setScalar(0.92);
      playerCar.visible = true;
      const TRAFFIC_COLORS = [0xd23b3b, 0x3b6fd2, 0xe8e8ec, 0x37b06f, 0x8a5fd0, 0xe07b2a];
      const carPool = [];
      for (let i = 0; i < 14; i++) carPool.push(makeCar(TRAFFIC_COLORS[i % TRAFFIC_COLORS.length], false));

      // ---------- coins ----------
      const coinGeo = new THREE.CylinderGeometry(210, 210, 30, 22);
      coinGeo.rotateX(Math.PI / 2);
      const coinMat = new THREE.MeshStandardMaterial({ color: 0xffc93c, emissive: 0x8a5c00, roughness: 0.25, metalness: 0.9 });
      const coinPool = [];
      for (let i = 0; i < 10; i++) {
        const m = new THREE.Mesh(coinGeo, coinMat);
        m.visible = false;
        scene.add(m);
        coinPool.push(m);
      }

      // ---------- explosion points ----------
      const burstGeo = new THREE.BufferGeometry();
      const burstPos = new Float32Array(42 * 3);
      burstGeo.setAttribute('position', new THREE.BufferAttribute(burstPos, 3));
      const burstPts = new THREE.Points(burstGeo, new THREE.PointsMaterial({ color: 0xffa03c, size: 150, transparent: true, opacity: 0.95 }));
      burstPts.visible = false;
      burstPts.frustumCulled = false;
      scene.add(burstPts);

      // ---------- segments / curve data (shared with the run logic) ----------
      const segCurves = [];
      for (let i = 0; i < NSEG; i++) segCurves.push(curveAt(i));
      const findCurve = (z) => segCurves[Math.floor(z / SEG) % NSEG];

      // ---------- run logic (unchanged contract) ----------
      function scoreNow() {
        return Math.floor(s.distance / 10) + s.coinsGot * 25 + s.nearMisses * 50;
      }
      function popup(anchor, text, color, size) {
        s.popups.push({ anchor, text, color: color || '#fff', size: size || 15, life: 1, yOff: 0 });
      }
      function spawnAhead() {
        const ahead = s.absPos + PLAYER_Z + DRAW * SEG + 6000;
        while (s.nextCarZ < ahead) {
          const lane = LANES_X[Math.floor(Math.random() * 3)] + (Math.random() - 0.5) * 0.16;
          s.cars.push({ z: s.nextCarZ % TRACK, abs: s.nextCarZ, x: lane, speed: 3400 + Math.random() * 1900, passed: false, rel: 0 });
          s.nextCarZ += 6200 + Math.random() * 3600;
        }
        while (s.nextCoinZ < ahead) {
          if (Math.random() < 0.62) {
            s.coins.push({ z: s.nextCoinZ % TRACK, x: LANES_X[Math.floor(Math.random() * 3)], taken: false });
          }
          s.nextCoinZ += 8200 + Math.random() * 3200;
        }
        const behindAbs = s.absPos + PLAYER_Z - 900;
        s.cars = s.cars.filter((c) => c.abs > behindAbs);
        s.coins = s.coins.filter((c) => !c.taken);
      }
      const fwd = (z) => {
        let d = (z - ((s.position + PLAYER_Z) % TRACK) + TRACK) % TRACK;
        if (d > TRACK / 2) d -= TRACK;
        return d;
      };

      function crash() {
        s.phase = 'crashed';
        s.finishedAt = performance.now();
        setPhase('crashed');
        s.shake = 16;
        s.crashSpin = 6.5;
        s.burst = { at: performance.now(), vels: [] };
        for (let i = 0; i < 42; i++) {
          const a = Math.random() * Math.PI * 2;
          const v = 500 + Math.random() * 1500;
          s.burst.vels.push({ x: Math.cos(a) * v, y: Math.random() * 1400 + 300, z: Math.sin(a) * v });
        }
        popup(null, '💥 CRASH!', '#ff6b5e', 30);
        setTimeout(() => {
          if (s.over) return;
          s.over = true;
          const score = scoreNow();
          const amount = highwayPoints(score);
          onFinish({
            outcome: amount > 0 ? 'win' : 'lose',
            score, amount,
            coins: s.coinsGot, nearMisses: s.nearMisses, distance: s.distance,
            durationMs: Math.round((s.finishedAt || performance.now()) - (s.startedAt || s.countAt)),
          });
        }, 1500);
      }

      // ---------- per-frame: logic step ----------
      function stepLogic(now, dt) {
        if (s.phase === 'count') {
          if (now - s.countAt > 2400) {
            s.phase = 'drive';
            s.startedAt = now;
            setPhase('drive');
            popup(null, 'GO! 🏁', '#4ade80', 30);
          }
        } else if (s.phase === 'drive') {
          const offroad = Math.abs(s.playerX) > 1.04;
          s.offroad = offroad;
          const target = offroad ? MAX_SPEED * 0.38 : MAX_SPEED;
          if (s.speed < target) s.speed = Math.min(target, s.speed + ACCEL * dt * (offroad ? 0.4 : 1));
          else s.speed = Math.max(target, s.speed - MAX_SPEED * 0.55 * dt);
        } else if (s.phase === 'crashed') {
          s.speed = Math.max(0, s.speed - MAX_SPEED * 1.4 * dt);
          s.crashSpin = Math.max(0, s.crashSpin - 3.2 * dt);
        }
        const speedPct = s.speed / MAX_SPEED;

        let steer = s.btnSteer;
        if (s.dragX != null) steer = Math.max(-1, Math.min(1, (s.dragX - W / 2) / 70));
        if (s.keys) steer = s.keys;
        s.steer = steer;
        if (s.phase === 'drive') {
          const baseRate = 2 * speedPct;
          s.playerX += steer * dt * baseRate * 1.9 * (0.35 + 0.65 * speedPct);
          s.playerX -= dt * baseRate * speedPct * findCurve(s.position + PLAYER_Z) * CENTRIFUGAL;
          s.playerX = Math.max(-1.32, Math.min(1.32, s.playerX));
        }

        const prevPos = s.position;
        s.absPos += s.speed * dt;
        s.position = (s.position + s.speed * dt) % TRACK;
        if (s.phase === 'drive') {
          s.distance = Math.floor((s.distance * 100 + s.speed * dt) / 100);
          s.score = scoreNow();
          const m = s.distance;
          if (m > 0 && m % 500 < 6 && now - s.lastCalloutAt > 4000) {
            s.lastCalloutAt = now;
            s.callout = { text: `${Math.floor(m / 500) * 500}m! 🏎️`, at: now };
          }
        }
        void prevPos;

        if (s.phase === 'drive' || s.phase === 'count') {
          spawnAhead();
          // advance traffic by absolute bookkeeping
          for (const car of s.cars) {
            car.abs += car.speed * dt;
            car.z = car.abs % TRACK;
            car.rel = fwd(car.z);
          }
        } else {
          for (const car of s.cars) car.rel = fwd(car.z);
        }

        if (s.phase === 'drive') {
          for (const car of s.cars) {
            if (!car.passed && car.rel < -SEG * 0.4) {
              car.passed = true;
              const gap = Math.abs(car.x - s.playerX);
              if (gap < 0.44) { crash(); break; }
              if (gap < 0.80) {
                s.nearMisses += 1;
                popup({ zPos: PLAYER_Z + car.rel + 400, xOff: (car.x - s.playerX) * ROAD_W * 0.4 }, 'NEAR MISS +50', '#ffd94d', 19);
              }
            }
          }
          if (s.phase === 'drive') {
            for (const coin of s.coins) {
              const d = fwd(coin.z);
              if (!coin.taken && d < SEG * 0.3 && d > -SEG * 0.5 && Math.abs(coin.x - s.playerX) < 0.31) {
                coin.taken = true;
                s.coinsGot += 1;
                popup({ zPos: PLAYER_Z + d, xOff: (coin.x - s.playerX) * ROAD_W * 0.4 }, '+25', '#ffd94d', 17);
              }
            }
          }
        }

        for (const pu of s.popups) { pu.life -= dt * 1.05; pu.yOff -= 34 * dt; }
        s.popups = s.popups.filter((pu) => pu.life > 0);
        if (s.callout && now - s.callout.at > 1100) s.callout = null;
        if (s.shake > 0) s.shake = Math.max(0, s.shake - 42 * dt);

        if (now - s.hudAt > 120) {
          s.hudAt = now;
          setHud({ kmh: Math.round(speedPct * 238), score: s.score, dist: s.distance, coins: s.coinsGot });
        }
      }

      // ---------- per-frame: build view transforms ----------
      // Boundary offsets of the road center in position space.
      const bounds = []; // {z, off}
      function buildBounds() {
        bounds.length = 0;
        const baseIdx = Math.floor(s.position / SEG) % NSEG;
        const basePct = (s.position % SEG) / SEG;
        let x = 0;
        let dx = -(segCurves[baseIdx] * basePct);
        bounds.push({ z: 0, off: 0 });
        for (let n = 0; n < NB - 1; n++) {
          const curve = segCurves[(baseIdx + n) % NSEG];
          x += dx;
          bounds.push({ z: (n + 1) * SEG - basePct * SEG, off: x });
          dx += curve;
        }
      }
      function offAt(zPos) {
        if (zPos <= 0) return bounds[0].off;
        for (let i = 1; i < bounds.length; i++) {
          if (zPos <= bounds[i].z) {
            const a = bounds[i - 1], b = bounds[i];
            const t = (zPos - a.z) / Math.max(1, b.z - a.z);
            return a.off + (b.off - a.off) * t;
          }
        }
        return bounds[bounds.length - 1].off;
      }
      let playerOff = 0;
      function viewX(zPos, worldX) {
        return offAt(zPos) + worldX - playerOff - s.playerX * ROAD_W;
      }
      function viewZ(zPos) {
        return zPos - PLAYER_Z + PLAYER_VIEW_Z;
      }

      const tmpM = new THREE.Matrix4();
      const tmpQ = new THREE.Quaternion();
      const tmpV = new THREE.Vector3();
      const tmpS = new THREE.Vector3();

      function syncScene(now) {
        buildBounds();
        playerOff = offAt(PLAYER_Z);
        const speedPct = s.speed / MAX_SPEED;

        // road + edges
        for (let half = 0; half < 3; half++) {
          const rb = half === 0 ? road : half === 1 ? edgeL : edgeR;
          const halfW = half === 0 ? ROAD_W : 210;
          const centerShift = half === 0 ? 0 : half === 1 ? -(ROAD_W + 105) : ROAD_W + 105;
          const pos = rb.positions;
          for (let i = 0; i < NB; i++) {
            const bd = bounds[i];
            const cx = bd.off - playerOff - s.playerX * ROAD_W + centerShift;
            const cz = viewZ(bd.z);
            pos[i * 6] = cx - halfW;
            pos[i * 6 + 1] = half === 0 ? 0 : 6;
            pos[i * 6 + 2] = cz;
            pos[i * 6 + 3] = cx + halfW;
            pos[i * 6 + 4] = half === 0 ? 0 : 6;
            pos[i * 6 + 5] = cz;
            if (half > 0) {
              const col = NEON[(Math.floor((s.position + bd.z) / SEG / 3) + (half === 2 ? 1 : 0)) % 2 === 0 ? 0 : 1];
              const carr = rb.mesh.geometry.getAttribute('color');
              carr.setXYZ(i * 2, col.r, col.g, col.b);
              carr.setXYZ(i * 2 + 1, col.r, col.g, col.b);
              if (i === NB - 1) carr.needsUpdate = true;
            }
          }
          rb.mesh.geometry.getAttribute('position').needsUpdate = true;
        }
        // dashes at even segment centers
        {
          let di = 0;
          const baseZ = s.position - (s.position % (SEG * 2));
          for (let k = 0; k < 40 && di < dashes.length; k++) {
            const zPos = baseZ - s.position + k * SEG * 2 + SEG;
            if (zPos < -SEG || zPos > DRAW * SEG) continue;
            for (const fx of [-1 / 3, 1 / 3]) {
              if (di >= dashes.length) break;
              const d = dashes[di++];
              d.visible = true;
              d.position.x = viewX(zPos, fx * ROAD_W);
              d.position.z = viewZ(zPos);
            }
          }
          for (; di < dashes.length; di++) dashes[di].visible = false;
        }
        // buildings
        {
          let bi = 0;
          for (const b of buildings) {
            let rel = (b.trackZ - s.position + CITY_SPAN * 4) % CITY_SPAN;
            if (rel > DRAW * SEG + 2600) { tmpM.makeScale(0, 0, 0); city.setMatrixAt(bi++, tmpM); continue; }
            const zPos = rel + PLAYER_Z;
            tmpV.set(viewX(zPos, b.side * (ROAD_W + 1500 + b.lane * 2600)), b.h / 2 - 20, viewZ(zPos));
            tmpS.set(b.w, b.h, b.d);
            tmpM.compose(tmpV, tmpQ, tmpS);
            city.setMatrixAt(bi++, tmpM);
          }
          city.instanceMatrix.needsUpdate = true;
        }
        // lamps every ~1200 units
        {
          let li = 0;
          const baseZ = s.position - (s.position % 1200);
          for (let k = 0; k < 12; k++) {
            const zPos = baseZ - s.position + k * 1200 + PLAYER_Z;
            if (zPos < 0 || zPos > DRAW * SEG + 1000) continue;
            const lamp = lamps[li++];
            if (!lamp) break;
            lamp.visible = true;
            lamp.position.set(viewX(zPos, (k % 2 ? 1 : -1) * (ROAD_W + 260)), 0, viewZ(zPos));
          }
          for (; li < lamps.length; li++) lamps[li].visible = false;
        }
        // traffic
        {
          let ci = 0;
          for (const car of s.cars) {
            if (car.rel == null || car.rel < -700 || car.rel > DRAW * SEG) continue;
            const mesh = carPool[ci++];
            if (!mesh) break;
            mesh.visible = true;
            mesh.position.set(viewX(PLAYER_Z + car.rel, car.x * ROAD_W), 0, viewZ(PLAYER_Z + car.rel));
            mesh.rotation.y = 0;
          }
          for (; ci < carPool.length; ci++) carPool[ci].visible = false;
        }
        // coins
        {
          let ci = 0;
          for (const coin of s.coins) {
            const d = fwd(coin.z);
            if (d < -300 || d > DRAW * SEG) continue;
            const mesh = coinPool[ci++];
            if (!mesh) break;
            mesh.visible = true;
            mesh.position.set(viewX(PLAYER_Z + d, coin.x * ROAD_W), 520, viewZ(PLAYER_Z + d));
            mesh.rotation.y = now / 280 + coin.z;
          }
          for (; ci < coinPool.length; ci++) coinPool[ci].visible = false;
        }
        // player car
        {
          playerCar.position.set(s.steer * 240, 0, PLAYER_VIEW_Z);
          playerCar.rotation.y = -s.steer * 0.16 + (s.phase === 'crashed' ? s.crashSpin * 0.9 : 0);
          playerCar.rotation.z = -s.steer * 0.045;
          playerCar.position.y = speedPct > 0.05 ? Math.sin(now / 90) * 14 * speedPct : 0;
          glow.position.x = s.steer * 240;
        }
        // explosion
        if (s.burst) {
          const age = (now - s.burst.at) / 1000;
          if (age < 0.85) {
            burstPts.visible = true;
            const arr = burstGeo.getAttribute('position');
            for (let i = 0; i < 42; i++) {
              const v = s.burst.vels[i];
              arr.setXYZ(i,
                s.steer * 200 + v.x * age,
                420 + v.y * age - 1900 * age * age,
                PLAYER_VIEW_Z + v.z * age);
            }
            arr.needsUpdate = true;
            burstPts.material.opacity = 0.95 * (1 - age / 0.85);
          } else {
            burstPts.visible = false;
            s.burst = null;
          }
        }
        // camera
        {
          const lookOff = offAt(PLAYER_Z + 3000) - playerOff - s.playerX * ROAD_W;
          camera.position.x = s.steer * 90 + (s.shake > 0 ? (Math.random() - 0.5) * s.shake * 22 : 0);
          camera.position.y = 1620 + (s.shake > 0 ? (Math.random() - 0.5) * s.shake * 12 : 0);
          camera.lookAt(lookOff * 0.55, 520, 6100);
          const targetFov = 62 + speedPct * 13;
          if (Math.abs(camera.fov - targetFov) > 0.2) {
            camera.fov = targetFov;
            camera.updateProjectionMatrix();
          }
        }
      }

      // ---------- 2D overlay: popups, callouts, countdown ----------
      const overlay = overlayRef.current;
      const octx = overlay.getContext('2d');
      const dpr = Math.min(2, window.devicePixelRatio || 1);
      overlay.width = W * dpr;
      overlay.height = H * dpr;
      const tmpP = new THREE.Vector3();
      function drawOverlay(now) {
        octx.setTransform(dpr, 0, 0, dpr, 0, 0);
        octx.clearRect(0, 0, W, H);
        for (const pu of s.popups) {
          let px = W / 2;
          let py = 190;
          if (pu.anchor) {
            tmpP.set(viewX(pu.anchor.zPos, pu.anchor.xOff), 900, viewZ(pu.anchor.zPos)).project(camera);
            px = (tmpP.x * 0.5 + 0.5) * W;
            py = (-tmpP.y * 0.5 + 0.5) * H + pu.yOff;
          }
          octx.globalAlpha = Math.max(0, Math.min(1, pu.life));
          octx.font = `900 ${pu.size}px system-ui`;
          octx.textAlign = 'center';
          octx.strokeStyle = 'rgba(4,6,20,0.85)';
          octx.lineWidth = 4;
          octx.strokeText(pu.text, px, py);
          octx.fillStyle = pu.color;
          octx.fillText(pu.text, px, py);
        }
        octx.globalAlpha = 1;
        if (s.callout) {
          const age = now - s.callout.at;
          const sc = age < 200 ? 0.6 + (age / 200) * 0.5 : 1.1;
          octx.save();
          octx.translate(W / 2, 118);
          octx.scale(sc, sc);
          octx.globalAlpha = age > 800 ? Math.max(0, 1 - (age - 800) / 300) : 1;
          octx.font = '900 27px system-ui';
          octx.textAlign = 'center';
          octx.strokeStyle = 'rgba(4,6,20,0.9)';
          octx.lineWidth = 6;
          octx.strokeText(s.callout.text, 0, 0);
          octx.fillStyle = '#ffd94d';
          octx.fillText(s.callout.text, 0, 0);
          octx.restore();
          octx.globalAlpha = 1;
        }
        if (s.phase === 'count') {
          const el = (now - s.countAt) / 1000;
          const n = el < 0.7 ? '3' : el < 1.4 ? '2' : el < 2.1 ? '1' : 'GO!';
          octx.fillStyle = 'rgba(3,5,16,0.35)';
          octx.fillRect(0, 0, W, H);
          octx.font = '900 74px system-ui';
          octx.textAlign = 'center';
          octx.strokeStyle = 'rgba(4,6,20,0.9)';
          octx.lineWidth = 9;
          octx.strokeText(n, W / 2, 250);
          octx.fillStyle = n === 'GO!' ? '#4ade80' : '#ffd94d';
          octx.fillText(n, W / 2, 250);
        }
        if (s.offroad && s.phase === 'drive') {
          octx.font = '800 15px system-ui';
          octx.textAlign = 'center';
          octx.fillStyle = '#ff9d5c';
          octx.fillText('⚠️ OFF ROAD — SLOW!', W / 2, 34);
        }
      }

      let last = performance.now();
      const frame = (now) => {
        raf = requestAnimationFrame(frame);
        const dt = Math.min(0.05, (now - last) / 1000);
        last = now;
        stepLogic(now, dt);
        syncScene(now);
        renderer.render(scene, camera);
        drawOverlay(now);
      };
      raf = requestAnimationFrame(frame);

      window.__frgHighway = {
        state: () => ({
          phase: s.phase,
          score: s.score,
          distance: s.distance,
          coins: s.coinsGot,
          nearMisses: s.nearMisses,
          playerX: Math.round(s.playerX * 100) / 100,
          speed: Math.round(s.speed),
          cars: s.cars.filter((c) => c.rel != null && c.rel > -400 && c.rel < 9000).map((c) => ({ rel: Math.round(c.rel), x: Math.round(c.x * 100) / 100 })),
        }),
        steer: (v) => { s.keys = v; },
      };

      cleanup3d = () => {
        cancelAnimationFrame(raf);
        renderer.dispose();
        mount.removeChild(renderer.domElement);
        delete window.__frgHighway;
      };
      } catch (err) {
        console.error('Highway 3D failed to start:', err);
        if (!disposed) setGlFailed(true);
      }
    })();

    return () => {
      disposed = true;
      cleanup3d();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stageTry]);

  const s = S.current;
  const setBtn = (v) => { s.btnSteer = v; };
  const retryGl = () => {
    S.current = null; // fresh run state on the next render
    setHud({ kmh: 0, score: 0, dist: 0, coins: 0 });
    setPhase('count');
    setGlFailed(false);
    setStageTry((t) => t + 1);
  };
  const onPointer = (e) => {
    if (e.type === 'pointerdown' || e.type === 'pointermove') {
      if (e.buttons || e.type === 'pointerdown') {
        const r = e.currentTarget.getBoundingClientRect();
        s.dragX = ((e.clientX - r.left) / r.width) * W;
      }
    }
    if (e.type === 'pointerup' || e.type === 'pointerleave') s.dragX = null;
  };

  return (
    <main className="flight-wrap">
      <h2 className="section">🏎️ FRG HIGHWAY 3D</h2>
      <div className="flight-hud">
        <span>🏁 <b>{hud.dist}</b>m</span>
        <span>💨 <b>{hud.kmh}</b> km/h</span>
        <span>🪙 <b>{hud.coins}</b></span>
        <span>⭐ <b>{hud.score}</b></span>
      </div>
      <div
        ref={mountRef}
        style={{ position: 'relative', width: '100%', maxWidth: W, aspectRatio: '400 / 560', margin: '0 auto', touchAction: 'none', borderRadius: 12, overflow: 'hidden' }}
        onPointerDown={onPointer}
        onPointerMove={onPointer}
        onPointerUp={onPointer}
        onPointerLeave={onPointer}
      >
        <canvas
          ref={overlayRef}
          style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', pointerEvents: 'none', zIndex: 2 }}
        />
        {glFailed && (
          <div className="gl-fail">
            <p>😵 The 3D graphics couldn't start on this device.</p>
            <button className="btn btn-big" onClick={retryGl}>↻ Try again</button>
          </div>
        )}
      </div>
      <div className="flight-controls">
        <button className="btn flight-btn" onPointerDown={() => setBtn(-1)} onPointerUp={() => setBtn(0)} onPointerLeave={() => setBtn(0)}>◀ STEER</button>
        <button className="btn flight-btn" onPointerDown={() => setBtn(1)} onPointerUp={() => setBtn(0)} onPointerLeave={() => setBtn(0)}>STEER ▶</button>
      </div>
      <p className="fineprint">
        Weave the traffic — skim past a car for a NEAR MISS +50, grab coins for +25,
        every 10m is +1. One crash ends the run. Points tiers: 300 → 5 · 700 → 10 ·
        1,200 → 15 · 2,000 → 22 · 3,000 → 32 · 4,500 → 45 PTS.
      </p>
    </main>
  );
}
