import { useEffect, useRef, useState } from 'react';
import { createRenderer } from './gl.js';

// ---------------------------------------------------------------------------
// FRG Boxing — retro arcade-style fighting game (Punch-Out-inspired).
//
// - Pick 1 of 3 opponents (rookie → contender → champion).
// - The opponent GLOWS (tell) right before swinging: jab him in that
//   instant to earn a STAR and leave him dizzy.
// - STAR PUNCH spends a star on a huge uppercut. Getting hit loses all stars.
// - Dodging a hook restores a HEART and leaves him wide open.
// - Getting hit or punching his guard costs a heart; at 0 hearts you're
//   gassed (no punches) until you dodge.
// - Knockdowns: 3 in a round = TKO; if YOU go down, mash JAB to beat the
//   10-count. Points for everything. 3 rounds, then the judges decide.
// ---------------------------------------------------------------------------

const ROUND_SECONDS = 60;
const ROUNDS = 3;
const MAX_HP = 100;

export const OPPONENTS = [
  {
    id: 'gus',
    name: 'GLASS-JAW GUS',
    cls: 'ROOKIE',
    desc: 'All heart, no chin. Slow, obvious wind-ups.',
    hp: 120,
    tell: [520, 665],
    hook: [11, 15],
    guard: 0.24,
    pace: [780, 1200],
    feint: 0.07,
    combo: 0.09,
    scale: 0.94,
  },
  {
    id: 'champ',
    name: 'THE CHAMP',
    cls: 'CHAMPION',
    desc: 'The final boss. Blink and you are on the canvas.',
    hp: 185,
    tell: [300, 420],
    hook: [19, 24],
    guard: 0.36,
    pace: [480, 830],
    feint: 0.12,
    combo: 0.15,
    scale: 1.1,
  },
];

const rnd = (a, b) => a + Math.random() * (b - a);
const irnd = (a, b) => Math.floor(rnd(a, b + 1));
const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
const ENEMY_FRAME = {
  idle: 'idle',
  taunt: 'taunt',
  tell: 'tell',
  attack: 'attack',
  stunned: 'dizzy',
  recover: 'idle',
  down: 'down',
};

const fmtClock = (s) => {
  const t = Math.max(0, Math.ceil(s));
  return `${Math.floor(t / 60)}:${String(t % 60).padStart(2, '0')}`;
};

function freshState(opp) {
  return {
    phase: 'select', // select | fight | roundEnd | edown | pdown | done
    opp,
    round: 1,
    timeLeft: ROUND_SECONDS,
    pHp: MAX_HP,
    eHp: opp.hp,
    eMax: opp.hp,
    hearts: 11,
    stars: 1,
    points: 0,
    pDown: 0,
    eDown: 0,
    pDownRound: 0,
    eDownRound: 0,
    pRounds: 0,
    eRounds: 0,
    enemy: 'idle',
    eTimer: 1100,
    count: 0,
    countTimer: 0,
    getUpAt: 6,
    mash: 0,
    dodging: 0,
    dodgeDir: 0,
    blocking: false,
    tired: false,
    stunImmune: 0,
    stunHits: 0,
    feint: false,
    msg: 'Touch gloves!',
    damageDealt: 0,
    taken: 0,
    sway: 0,
    dmgNums: [],
    callout: null,
    burst: null,
    shake: false,
    punch: '',
    punchUntil: 0,
  };
}

// ---------------------------------------------------------------------
// The 3D ring stage. Reads the live fight state every frame and poses
// two low-poly 3D fighters: the opponent across the ring (his flash
// tell is an emissive flare — the same readable cue as the sprite's
// CSS flash) and the player's own gloves in first person. Owns no
// game logic — every rule stays in the state machine below.
// ---------------------------------------------------------------------
function RingStage3D({ stateRef }) {
  const mountRef = useRef(null);

  useEffect(() => {
    const S = stateRef;
    let disposed = false;
    let raf = 0;
    let cleanup = () => {};

    (async () => {
      const THREE = await import('three');
      if (disposed) return;
      const mount = mountRef.current;
      const W = 430;
      const H = 340;
      const renderer = createRenderer(THREE);
      renderer.setPixelRatio(Math.min(2, window.devicePixelRatio || 1));
      renderer.setSize(W, H, false);
      renderer.domElement.style.cssText = 'position:absolute;inset:0;width:100%;height:100%;display:block;';
      mount.appendChild(renderer.domElement);

      const scene = new THREE.Scene();
      scene.background = new THREE.Color(0x0a1224);
      scene.fog = new THREE.Fog(0x0a1224, 800, 2200);
      const camera = new THREE.PerspectiveCamera(55, W / H, 1, 4000);
      camera.position.set(0, 116, 258);
      camera.lookAt(0, 90, -30);

      scene.add(new THREE.HemisphereLight(0xd8e6ff, 0x1a2438, 1.45));
      const key = new THREE.DirectionalLight(0xfff0c8, 2.2);
      key.position.set(90, 320, 260);
      scene.add(key);
      const rim = new THREE.DirectionalLight(0x7fb2ff, 0.7);
      rim.position.set(-160, 180, -120);
      scene.add(rim);
      const ringLight = new THREE.PointLight(0xffe9b0, 900, 700);
      ringLight.position.set(0, 260, 30);
      scene.add(ringLight);

      // crowd backdrop (the club's ring art)
      {
        const tex = new THREE.TextureLoader().load('/sprites/ring-bg.webp', (t) => {
          t.colorSpace = THREE.SRGBColorSpace;
        });
        const bg = new THREE.Mesh(
          new THREE.PlaneGeometry(980, 430),
          new THREE.MeshBasicMaterial({ color: 0x0b1428, fog: false })
        );
        bg.position.set(0, 148, -265);
        scene.add(bg);
      }
      // the ring: apron, mat, posts, ropes
      {
        const apron = new THREE.Mesh(
          new THREE.BoxGeometry(470, 14, 370),
          new THREE.MeshStandardMaterial({ color: 0x1d3a5f, roughness: 0.7 })
        );
        apron.position.set(0, -10, -20);
        scene.add(apron);
        const mat = new THREE.Mesh(
          new THREE.BoxGeometry(430, 8, 330),
          new THREE.MeshStandardMaterial({ color: 0x9db1d1, roughness: 0.92 })
        );
        mat.position.set(0, -2, -20);
        scene.add(mat);
        const postMat = new THREE.MeshStandardMaterial({ color: 0x8a93a6, roughness: 0.35, metalness: 0.7 });
        const cornerCols = [0xd23b3b, 0xf1f5f9, 0x3b82f6, 0xf1f5f9];
        const corners = [[-205, -175], [205, -175], [-205, 135], [205, 135]];
        corners.forEach(([cx, cz], i) => {
          const post = new THREE.Mesh(new THREE.CylinderGeometry(5.5, 5.5, 104, 10), postMat);
          post.position.set(cx, 46, cz);
          scene.add(post);
          const pad = new THREE.Mesh(
            new THREE.BoxGeometry(13, 44, 13),
            new THREE.MeshStandardMaterial({ color: cornerCols[i], roughness: 0.55 })
          );
          pad.position.set(cx, 62, cz);
          scene.add(pad);
        });
        const ropeCols = [0xd23b3b, 0xf1f5f9, 0x3b82f6];
        for (let lvl = 0; lvl < 3; lvl++) {
          const y = 34 + lvl * 25;
          const rc = ropeCols[lvl];
          const m = new THREE.MeshStandardMaterial({ color: rc, roughness: 0.5 });
          const rope = new THREE.Mesh(new THREE.BoxGeometry(416, 3.6, 3.6), m);
          rope.position.set(0, y, -175);
          scene.add(rope);
          for (const cx of [-205, 205]) {
            const rope = new THREE.Mesh(new THREE.BoxGeometry(3.6, 3.6, 316), m);
            rope.position.set(cx, y, -20);
            scene.add(rope);
          }
        }
      }

      const SKIN = 0xd99e73;
      const opp = S.opp || { id: 'gus', scale: 0.94 };
      const isChamp = opp.id === 'champ';
      const TRUNKS = isChamp ? 0xf7b733 : 0x3b82f6;
      const GLOVE = isChamp ? 0xf7b733 : 0xd23b3b;

      function makeFighter(trunks, glove, skin, hairColor, beard) {
        const g = new THREE.Group();
        const skinMat = new THREE.MeshStandardMaterial({ color: skin, roughness: 0.58, emissive: 0x3d1c08, emissiveIntensity: 0 });
        const trunkMat = new THREE.MeshStandardMaterial({ color: trunks, roughness: 0.5, emissive: trunks, emissiveIntensity: 0.06 });
        const gloveMat = new THREE.MeshStandardMaterial({ color: glove, roughness: 0.3, emissive: glove, emissiveIntensity: 0.14 });
        const hairMat = new THREE.MeshStandardMaterial({ color: hairColor, roughness: 0.85 });
        const darkMat = new THREE.MeshStandardMaterial({ color: 0x1c1310, roughness: 0.6 });
        const bootMat = new THREE.MeshStandardMaterial({ color: 0xf1f5f9, roughness: 0.5 });

        // ---- legs: thigh + shin + boot, slight athletic stance ----
        for (const sd of [-1, 1]) {
          const thigh = new THREE.Mesh(new THREE.CylinderGeometry(8.2, 6.8, 26, 10), skinMat);
          thigh.position.set(sd * 12.5, 47, 0);
          thigh.rotation.z = sd * 0.05;
          g.add(thigh);
          const shin = new THREE.Mesh(new THREE.CylinderGeometry(6.4, 5.4, 24, 10), skinMat);
          shin.position.set(sd * 13.5, 23, 1);
          g.add(shin);
          const boot = new THREE.Mesh(new THREE.BoxGeometry(13.5, 8, 24), bootMat);
          boot.position.set(sd * 13.5, 4, 4);
          g.add(boot);
        }
        // ---- trunks + belt ----
        const shorts = new THREE.Mesh(new THREE.CylinderGeometry(21.5, 23.5, 21, 14), trunkMat);
        shorts.position.y = 66;
        shorts.scale.z = 0.82;
        g.add(shorts);
        const belt = new THREE.Mesh(new THREE.CylinderGeometry(22.5, 22.5, 7, 14), new THREE.MeshStandardMaterial({ color: 0xf8fafc, roughness: 0.4 }));
        belt.position.y = 78;
        belt.scale.z = 0.82;
        g.add(belt);

        // ---- torso (pivots at the waist so he can lean and twist) ----
        const torsoG = new THREE.Group();
        torsoG.position.y = 78;
        g.add(torsoG);
        const abdomen = new THREE.Mesh(new THREE.CylinderGeometry(17.5, 19.5, 15, 12), skinMat);
        abdomen.position.y = 6;
        abdomen.scale.z = 0.8;
        torsoG.add(abdomen);
        const chest = new THREE.Mesh(new THREE.CylinderGeometry(23, 18.5, 22, 14), skinMat);
        chest.position.y = 23;
        chest.scale.z = 0.76;
        torsoG.add(chest);
        const pec = new THREE.Mesh(new THREE.SphereGeometry(17, 14, 10), skinMat);
        pec.scale.set(1.18, 0.62, 0.55);
        pec.position.set(0, 26, 8);
        torsoG.add(pec);
        const neck = new THREE.Mesh(new THREE.CylinderGeometry(7.6, 9, 10, 10), skinMat);
        neck.position.y = 38;
        torsoG.add(neck);

        // ---- head: skull, jaw, face ----
        const headG = new THREE.Group();
        headG.position.y = 47;
        torsoG.add(headG);
        const skull = new THREE.Mesh(new THREE.SphereGeometry(15.5, 20, 16), skinMat);
        skull.scale.set(0.94, 1.07, 0.97);
        headG.add(skull);
        const jaw = new THREE.Mesh(new THREE.SphereGeometry(11.5, 14, 10), skinMat);
        jaw.scale.set(0.92, 0.72, 0.9);
        jaw.position.set(0, -8.5, 2.5);
        headG.add(jaw);
        const nose = new THREE.Mesh(new THREE.ConeGeometry(3.1, 7.5, 8), skinMat);
        nose.rotation.x = Math.PI / 2 - 0.25;
        nose.position.set(0, -0.5, 15.5);
        headG.add(nose);
        const eyeGeo = new THREE.SphereGeometry(1.95, 8, 8);
        for (const sd of [-1, 1]) {
          const eye = new THREE.Mesh(eyeGeo, darkMat);
          eye.position.set(sd * 5.6, 1.8, 13.6);
          headG.add(eye);
          const ear = new THREE.Mesh(new THREE.SphereGeometry(3.1, 8, 8), skinMat);
          ear.position.set(sd * 14.6, -0.5, 0);
          headG.add(ear);
        }
        const browGeo = new THREE.BoxGeometry(7.4, 1.9, 1.7);
        const browL = new THREE.Mesh(browGeo, hairMat);
        browL.position.set(-5.8, 5.6, 13.9);
        browL.rotation.z = -0.14;
        headG.add(browL);
        const browR = new THREE.Mesh(browGeo, hairMat);
        browR.position.set(5.8, 5.6, 13.9);
        browR.rotation.z = 0.14;
        headG.add(browR);
        const mouth = new THREE.Mesh(new THREE.BoxGeometry(6.4, 1.5, 1.2), darkMat);
        mouth.position.set(0, -8.2, 12.6);
        headG.add(mouth);
        const hair = new THREE.Mesh(new THREE.SphereGeometry(16.1, 18, 12), hairMat);
        hair.scale.set(0.97, 0.72, 1);
        hair.position.set(0, 5.4, -2.2);
        headG.add(hair);
        if (beard) {
          const bd = new THREE.Mesh(new THREE.BoxGeometry(15.5, 8.5, 5), hairMat);
          bd.position.set(0, -11.5, 9.5);
          headG.add(bd);
        }

        // ---- arms: shoulder pivot -> upper arm -> elbow -> forearm + glove ----
        function makeArm(side) {
          const arm = new THREE.Group();
          arm.position.set(side * 25.5, 31, 0);
          torsoG.add(arm);
          const upper = new THREE.Mesh(new THREE.CylinderGeometry(7.8, 6.6, 24, 10), skinMat);
          upper.position.y = -11;
          arm.add(upper);
          const elbow = new THREE.Group();
          elbow.position.y = -23;
          arm.add(elbow);
          const fore = new THREE.Mesh(new THREE.CylinderGeometry(6.2, 5.3, 20, 10), skinMat);
          fore.position.y = -9;
          elbow.add(fore);
          const gloveM = new THREE.Mesh(new THREE.SphereGeometry(10.8, 16, 13), gloveMat);
          gloveM.scale.set(1, 1.08, 1.2);
          gloveM.position.set(0, -22, 2);
          elbow.add(gloveM);
          const thumb = new THREE.Mesh(new THREE.SphereGeometry(3.8, 8, 8), gloveMat);
          thumb.position.set(-side * 5.5, -16, 7);
          elbow.add(thumb);
          return { arm, elbow };
        }
        const armL = makeArm(-1);
        const armR = makeArm(1);
        // dizzy stars that orbit a stunned fighter
        const starG = new THREE.Group();
        const starMat = new THREE.MeshBasicMaterial({ color: 0xffd94d });
        for (let i = 0; i < 3; i++) {
          const st = new THREE.Mesh(new THREE.OctahedronGeometry(4.4, 0), starMat);
          st.userData.a = (i / 3) * Math.PI * 2;
          starG.add(st);
        }
        starG.position.y = 152;
        starG.visible = false;
        g.add(starG);
        scene.add(g);
        return {
          g, torsoG, headG, armL, armR, starG, mouth, browL, browR, chest,
          flashMats: [
            { m: skinMat, base: 0 },
            { m: trunkMat, base: 0.06 },
            { m: gloveMat, base: 0.14 },
          ],
        };
      }

      const enemy = makeFighter(TRUNKS, GLOVE, SKIN, isChamp ? 0xe8c15a : 0x8a5a2b, isChamp);
      enemy.g.position.set(0, 2, -16);
      enemy.g.scale.setScalar((opp.scale || 1) * 1.12);

      // the player — first person: shoulders, back of head, own gloves
      const player = new THREE.Group();
      {
        const suitMat = new THREE.MeshStandardMaterial({ color: 0x1f2c4d, roughness: 0.7 });
        const shoulders = new THREE.Mesh(new THREE.BoxGeometry(96, 34, 30), suitMat);
        shoulders.position.set(0, -4, 0);
        player.add(shoulders);
        const pHead = new THREE.Mesh(new THREE.SphereGeometry(15.5, 16, 12), new THREE.MeshStandardMaterial({ color: 0x2b2118, roughness: 0.85 }));
        pHead.position.set(0, 24, 4);
        player.add(pHead);
        const mkGlove = (side) => {
          const grp = new THREE.Group();
          grp.position.set(side * 47, 20, -14);
          const gm = new THREE.Mesh(new THREE.SphereGeometry(14.6, 14, 12), new THREE.MeshStandardMaterial({ color: 0xd23b3b, roughness: 0.3, emissive: 0xd23b3b, emissiveIntensity: 0.16 }));
          gm.scale.set(1, 1.1, 1.25);
          grp.add(gm);
          const pFore = new THREE.Mesh(new THREE.CylinderGeometry(6.6, 8.2, 34, 10), new THREE.MeshStandardMaterial({ color: 0xd99e73, roughness: 0.6 }));
          pFore.position.set(-side * 7, -13, 13);
          pFore.rotation.x = 0.62;
          pFore.rotation.z = side * 0.38;
          grp.add(pFore);
          player.add(grp);
          return grp;
        };
        player.userData.gloveL = mkGlove(-1);
        player.userData.gloveR = mkGlove(1);
        player.position.set(0, 2, 128);
        scene.add(player);
      }

      let lastBurstId = 0;
      let recoilAt = 0;
      let punchKey = 0;
      let punchAt = 0;

      function pose(now) {
        const t = now / 1000;
        const E = enemy;
        const state = S.enemy;
        const inFight = S.phase === 'fight' || S.phase === 'edown' || S.phase === 'roundEnd';
        // burst recoil: a landed hit snaps his head back briefly
        if (S.burst && S.burst.id !== lastBurstId) {
          lastBurstId = S.burst.id;
          recoilAt = now;
        }
        const recoil = Math.max(0, 1 - (now - recoilAt) / 190);
        // base stance — guard up, breathing, light on his feet
        let bobY = Math.sin(t * 2.3) * 3.4;
        let swayX = 0;
        let lean = recoil * -0.22;
        let twist = Math.sin(t * 1.1) * 0.05;
        let armL = { x: -0.85, z: 0.26 };
        let armR = { x: -0.85, z: -0.26 };
        let elbL = -2.15;
        let elbR = -2.15;
        let headTilt = recoil * -0.3;
        let headYaw = Math.sin(t * 0.7) * 0.09;
        let browAngry = 0;
        let mouthOpen = recoil * 0.9;
        let lungeZ = 0;
        let flash = 0;
        E.starG.visible = false;
        if (state === 'idle' || state === 'taunt') {
          swayX = Math.sin(S.sway || 0) * 27;
          if (state === 'taunt') {
            bobY = Math.abs(Math.sin(t * 5.2)) * 7;
            armL = { x: -2.7, z: 0.55 };
            armR = { x: -2.7, z: -0.55 };
            elbL = -0.45;
            elbR = -0.45;
            mouthOpen = 1;
            headYaw = Math.sin(t * 3.1) * 0.22;
          }
        } else if (state === 'tell') {
          flash = 0.65 + Math.sin(t * 26) * 0.35;
          lean += -0.13;
          twist = 0.5;
          armR = { x: 0.72, z: -0.6 };
          elbR = -0.55;
          armL = { x: -0.8, z: 0.3 };
          elbL = -2.05;
          browAngry = 1;
          headYaw = 0.16;
        } else if (state === 'attack') {
          lungeZ = 52;
          lean += 0.12;
          twist = -0.42;
          armR = { x: -1.5, z: -0.08 };
          elbR = -0.12;
          armL = { x: -0.45, z: 0.35 };
          elbL = -1.8;
          browAngry = 0.7;
          mouthOpen = 0.7;
        } else if (state === 'stunned') {
          E.starG.visible = true;
          E.starG.children.forEach((st) => {
            const a = st.userData.a + t * 3.4;
            st.position.set(Math.cos(a) * 21, Math.sin(a) * 5, Math.sin(a) * 10 + 8);
          });
          headTilt = Math.sin(t * 7.5) * 0.14;
          headYaw = Math.sin(t * 5.9) * 0.18;
          armL = { x: -0.15, z: 0.52 };
          armR = { x: -0.15, z: -0.52 };
          elbL = -0.35;
          elbR = -0.35;
          bobY = Math.sin(t * 7.5) * 1.6;
          mouthOpen = 0.45;
        } else if (state === 'recover') {
          lean += -0.05;
          bobY = Math.sin(t * 1.7) * 2;
        }
        if (state === 'down' || S.phase === 'edown') {
          E.g.rotation.x = -1.42;
          E.g.position.y = 16;
          E.g.position.z = -8;
        } else {
          E.g.rotation.x = lean;
          E.g.position.y = 2 + bobY;
          E.g.position.z = -16 + lungeZ;
        }
        E.g.position.x = swayX;
        E.g.rotation.z = state === 'stunned' ? Math.sin(t * 7.5) * 0.05 : 0;
        E.torsoG.rotation.x = lean * 0.7;
        E.torsoG.rotation.y = twist;
        E.torsoG.position.y = 78 + Math.sin(t * 2.3) * 0.8;
        E.chest.scale.set(1, 1, 0.76 + Math.sin(t * 2.3) * 0.012);
        E.headG.rotation.x = headTilt;
        E.headG.rotation.y = headYaw;
        E.headG.rotation.z = state === 'stunned' ? Math.sin(t * 6.3) * 0.12 : 0;
        E.armL.arm.rotation.set(armL.x, 0, armL.z);
        E.armR.arm.rotation.set(armR.x, 0, armR.z);
        E.armL.elbow.rotation.x = elbL;
        E.armR.elbow.rotation.x = elbR;
        E.browL.rotation.z = -0.14 - browAngry * 0.3;
        E.browR.rotation.z = 0.14 + browAngry * 0.3;
        E.mouth.scale.y = 1 + mouthOpen * 2.2;
        for (const f of E.flashMats) f.m.emissiveIntensity = f.base + flash * 0.9;

        // ---- player ----
        const P = player;
        if (S.punch && S.punchUntil !== punchKey) {
          punchKey = S.punchUntil;
          punchAt = now;
        }
        const pk = Math.max(0, 1 - (now - punchAt) / 150);
        const punchExt = pk > 0 && S.punch ? Math.sin(Math.min(1, 1 - pk) * Math.PI) : 0;
        const dodgeShift = S.dodging > 0 ? S.dodgeDir * 44 : 0;
        P.position.x += (dodgeShift - P.position.x) * 0.4;
        const downed = S.phase === 'pdown';
        P.position.y = downed ? -26 : 2;
        P.rotation.x = downed ? 0.5 : 0;
        const gL = P.userData.gloveL;
        const gR = P.userData.gloveR;
        const tiredDrop = S.tired ? -13 : 0;
        const blockUp = S.blocking ? 13 : 0;
        gL.position.set(-47 + (S.blocking ? 17 : 0), 20 + tiredDrop + blockUp, -14);
        gR.position.set(47 - (S.blocking ? 17 : 0), 20 + tiredDrop + blockUp, -14);
        if (punchExt > 0 && !downed) {
          const act = S.punch === 'jabL' ? gL : gR;
          act.position.z = -14 - punchExt * 62;
          act.position.y = 20 + punchExt * 26;
          act.position.x = (S.punch === 'jabL' ? -47 : 47) * (1 - punchExt * 0.62);
          const sc = 1 + punchExt * 0.22;
          act.scale.set(sc, sc, sc);
        } else {
          gL.scale.set(1, 1, 1);
          gR.scale.set(1, 1, 1);
        }
        if (!inFight && S.phase !== 'pdown') {
          // between rounds / select: calm guard
        }
      }

      const frame = (now) => {
        raf = requestAnimationFrame(frame);
        pose(now);
        renderer.render(scene, camera);
      };
      raf = requestAnimationFrame(frame);

      cleanup = () => {
        cancelAnimationFrame(raf);
        renderer.dispose();
        if (renderer.domElement.parentNode) renderer.domElement.parentNode.removeChild(renderer.domElement);
      };
    })();

    return () => {
      disposed = true;
      cleanup();
    };
  }, [stateRef]);

  return <div ref={mountRef} style={{ position: 'absolute', inset: 0, zIndex: 0 }} />;
}


export default function Boxing({ onFinish }) {
  const state = useRef(freshState(OPPONENTS[1]));
  const [, setUi] = useState(0);
  const startedAt = useRef(null);
  const finished = useRef(false);
  const dmgId = useRef(0);

  const render = () => setUi((n) => n + 1);
  const S = state.current;

  const haptic = (style) => {
    try {
      window.Telegram?.WebApp?.HapticFeedback?.impactOccurred(style);
    } catch {
      /* not in Telegram */
    }
  };

  function shake() {
    S.shake = true;
    setTimeout(() => {
      S.shake = false;
      render();
    }, 320);
  }

  function showCallout(text, ms = 1150) {
    const id = ++dmgId.current;
    S.callout = { id, text };
    render();
    setTimeout(() => {
      if (S.callout && S.callout.id === id) {
        S.callout = null;
        render();
      }
    }, ms);
  }

  function hitBurst(big) {
    const id = ++dmgId.current;
    S.burst = { id, big };
    render();
    setTimeout(() => {
      if (S.burst && S.burst.id === id) {
        S.burst = null;
        render();
      }
    }, 380);
  }

  function dmgNum(txt, hurt) {
    const id = ++dmgId.current;
    S.dmgNums = [...S.dmgNums.slice(-5), { id, txt, hurt }];
    setTimeout(() => {
      S.dmgNums = S.dmgNums.filter((d) => d.id !== id);
      render();
    }, 820);
  }

  // ---- match flow ----------------------------------------------------------
  function endMatch(outcome, how) {
    if (finished.current) return;
    finished.current = true;
    if (outcome === 'win') {
      S.points += how.includes('decision') ? 500 : 1000;
    }
    S.phase = 'done';
    if (outcome === 'win') {
      showCallout(
        how.includes('decision')
          ? '🏆 DECISION — YOU WIN!'
          : how.includes('TKO')
            ? '💥 TKO! YOU WIN!'
            : '💥 K.O.! YOU WIN!',
        1350
      );
    }
    render();
    const durationMs = startedAt.current ? Date.now() - startedAt.current : 0;
    setTimeout(
      () =>
        onFinish({
          outcome,
          how,
          opponent: S.opp.name,
          points: S.points,
          durationMs,
          damageDealt: Math.round(S.damageDealt),
          rounds: `${S.pRounds}-${S.eRounds}`,
        }),
      1400
    );
  }

  function enemyDown() {
    S.eDown += 1;
    S.eDownRound += 1;
    S.points += 300;
    if (S.eDownRound >= 3) {
      endMatch('win', 'TKO — three knockdowns in one round');
      return;
    }
    S.enemy = 'down';
    S.phase = 'edown';
    S.count = 0;
    S.countTimer = 0;
    S.getUpAt = irnd(4, 7);
    S.msg = '💥 DOWN HE GOES! +300 pts. The ref is counting…';
    showCallout('💥 KNOCKDOWN! +300');
    haptic('heavy');
    shake();
    render();
  }

  function playerDown() {
    S.pDown += 1;
    S.pDownRound += 1;
    S.phase = 'pdown';
    S.count = 0;
    S.countTimer = 0;
    S.mash = 0;
    S.msg = "😖 You're down! Mash JAB to get up before 10!";
    showCallout('😖 YOU\'RE DOWN!', 900);
    haptic('heavy');
    shake();
    render();
  }

  function endRound() {
    const pWon = S.pHp >= S.eHp;
    if (pWon) {
      S.pRounds += 1;
      S.points += 100;
    } else {
      S.eRounds += 1;
    }
    if (S.round >= ROUNDS) {
      const win =
        S.pRounds > S.eRounds ||
        (S.pRounds === S.eRounds && S.pHp >= S.eHp);
      endMatch(win ? 'win' : 'loss', "Judges' decision");
      return;
    }
    S.phase = 'roundEnd';
    S.msg = pWon
      ? `🔔 Round ${S.round} is yours (+100 pts). Corner rest: +20 HP, hearts back.`
      : `🔔 Round ${S.round} to ${S.opp.name}. Corner rest: +20 HP, hearts back.`;
    render();
    setTimeout(() => {
      S.round += 1;
      S.timeLeft = ROUND_SECONDS;
      S.pHp = clamp(S.pHp + 10, 1, MAX_HP);
      S.eHp = clamp(S.eHp + 20, 1, S.eMax);
      S.hearts = Math.max(S.hearts, 8);
      S.tired = S.hearts <= 0;
      S.pDownRound = 0;
      S.eDownRound = 0;
      S.enemy = 'idle';
      S.eTimer = 1300;
      S.phase = 'fight';
      S.msg = `Round ${S.round} — fight!`;
      render();
    }, 2800);
  }

  // ---- combat ---------------------------------------------------------------
  function hurtPlayer(dmg, why) {
    S.pHp -= dmg;
    S.taken += dmg;
    if (S.stars > 0) {
      S.stars -= 1;
      S.msg = `💥 ${why} You lost a star!`;
    } else {
      S.msg = `💥 ${why}`;
    }
    S.hearts = Math.max(0, S.hearts - 1);
    if (S.hearts <= 0) S.tired = true;
    dmgNum(`-${Math.round(dmg)}`, true);
    haptic('heavy');
    shake();
    if (S.pHp <= 0) playerDown();
  }

  function hurtEnemy(dmg, label) {
    S.eHp -= dmg;
    S.damageDealt += dmg;
    dmgNum(`-${Math.round(dmg)}`, false);
    if (dmg >= 13) hitBurst(true);
    else if (label && label.includes('+50')) hitBurst(false);
    if (label) S.msg = label;
    if (S.eHp <= 0) enemyDown();
  }

  function flashGlove() {
    S.punch = S.punch === 'jabL' ? 'jabR' : 'jabL';
    S.punchUntil = Date.now() + 130;
  }

  function jab() {
    if (S.phase === 'pdown') {
      S.mash += 1;
      return;
    }
    // Punch recovery: mashing the button faster than a real arm throws
    // does nothing. Timing beats tapping.
    const nowMs = Date.now();
    if (nowMs - (S.lastJab || 0) < 170) return;
    S.lastJab = nowMs;
    if (S.phase !== 'fight' || S.dodging > 0) return;
    flashGlove();
    if (S.tired) {
      S.msg = "😮‍💨 You're gassed — no hearts! Dodge a punch to get one back.";
      render();
      return;
    }
    if (S.enemy === 'tell') {
      if (S.feint) {
        // You bit on the fake — eat the counter.
        S.feint = false;
        S.enemy = 'recover';
        S.eTimer = rnd(600, 900);
        hurtPlayer(
          rnd(S.opp.hook[0], S.opp.hook[1]) + 3,
          'FAKE-OUT! He counters your jab!'
        );
        render();
        return;
      }
      if (S.stunImmune > 0) {
        // You caught the flash — star's yours — but he's fighting
        // wary now: no stun, and his punch is still coming.
        if (S.stars < 5) S.stars += 1;
        S.points += 50;
        S.msg = "⭐ STAR EARNED — but he's wary, no stun! Dodge what's coming!";
        S.eTimer = 130;
        hurtEnemy(rnd(3, 5));
        haptic('medium');
        render();
        return;
      }
      if (S.stars < 5) {
        S.stars += 1;
        S.msg = "⭐ STAR EARNED! +50 pts. He's dizzy — pound him!";
      } else {
        S.msg = "Caught him flush! +50 pts. He's dizzy — pound him!";
      }
      S.points += 50;
      S.enemy = 'stunned';
      S.stunHits = 0;
      S.eTimer = rnd(1050, 1350);
      hurtEnemy(rnd(3, 5));
      haptic('medium');
      render();
      return;
    }
    if (S.enemy === 'attack') {
      hurtPlayer(rnd(S.opp.hook[0], S.opp.hook[1]), 'His hook lands first!');
      render();
      return;
    }
    if (S.enemy === 'stunned') {
      S.points += 10;
      S.stunHits += 1;
      let stunLabel = "Hammering him while he's dizzy! 👊";
      if (S.stunHits === 3 && S.stars < 5) {
        S.stars += 1;
        stunLabel += ' +⭐ STAR!';
      }
      hurtEnemy(rnd(3, 4), stunLabel);
      if (S.stunHits >= 4 && S.phase === 'fight') {
        // Four free ones is all you get — he fights his way out of it.
        S.enemy = 'recover';
        S.eTimer = rnd(500, 800);
        S.stunImmune = 1800;
        S.msg = "He shakes it off early — and he's wary now!";
      }
      haptic('light');
      render();
      return;
    }
    if (S.enemy === 'down') return;
    if (Math.random() < S.opp.guard) {
      S.hearts = Math.max(0, S.hearts - 1);
      if (S.hearts <= 0) S.tired = true;
      S.msg = '🛡️ Blocked! Punching his guard costs a heart.';
      haptic('light');
      render();
      return;
    }
    if (S.enemy === 'taunt') {
      S.points += 20;
      hurtEnemy(rnd(3, 4), 'Caught him showing off! +20 pts 👊');
    } else {
      S.points += 10;
      hurtEnemy(rnd(3, 4), 'Jab lands. +10 pts 👊');
    }
    haptic('light');
    render();
  }

  function starPunch() {
    if (S.phase !== 'fight') return;
    if (S.stars <= 0) {
      S.msg = 'No stars yet — jab him during his flash ⚠️ to earn one.';
      render();
      return;
    }
    if (S.enemy === 'attack') {
      hurtPlayer(
        rnd(S.opp.hook[0], S.opp.hook[1]),
        'Star punch too slow — his hook lands!'
      );
      render();
      return;
    }
    if (S.enemy === 'tell' && S.feint) {
      S.feint = false;
      S.enemy = 'recover';
      S.eTimer = rnd(600, 900);
      hurtPlayer(
        rnd(S.opp.hook[0], S.opp.hook[1]) + 3,
        'FAKE-OUT! He counters your star punch!'
      );
      render();
      return;
    }
    S.stars -= 1;
    S.points += 150;
    flashGlove();
    hurtEnemy(rnd(13, 18), '🌟 STAR UPPERCUT! +150 pts!');
    if (S.enemy !== 'down' && S.phase === 'fight' && S.stunImmune <= 0) {
      S.enemy = 'stunned';
      S.stunHits = 0;
      S.eTimer = rnd(1150, 1550);
    }
    haptic('heavy');
    render();
  }

  function dodge(dir) {
    if (S.phase !== 'fight') return;
    S.dodging = 340;
    S.dodgeDir = dir;
    render();
  }

  function setBlocking(on) {
    if (S.phase !== 'fight') return;
    S.blocking = on;
    render();
  }

  function startFight(opp) {
    state.current = freshState(opp);
    state.current.phase = 'fight';
    state.current.msg = 'Round 1 — fight! Watch for his flash ⚠️';
    finished.current = false;
    startedAt.current = Date.now();
    render();
  }

  // ---- main loop --------------------------------------------------------------
  useEffect(() => {
    const iv = setInterval(() => {
      const st = state.current;

      if (st.phase === 'fight' && (st.enemy === 'idle' || st.enemy === 'taunt')) {
        st.sway += 0.05;
      }
      if (st.dodging > 0) st.dodging -= 50;
      if (st.punch && Date.now() > st.punchUntil) st.punch = '';

      if (st.phase === 'edown' || st.phase === 'pdown') {
        st.countTimer += 50;
        if (st.countTimer >= 620) {
          st.countTimer = 0;
          st.count += 1;
        }
        if (st.phase === 'pdown' && st.mash >= 9) {
          st.phase = 'fight';
          st.pHp = 32;
          st.hearts = Math.max(st.hearts, 4);
          st.tired = false;
          st.enemy = 'idle';
          st.eTimer = 1500;
          st.msg = '⬆️ You beat the count! Back in it with 32 HP.';
          haptic('heavy');
        } else if (st.phase === 'edown' && st.count >= st.getUpAt) {
          st.phase = 'fight';
          st.eHp = Math.round(st.eMax * 0.32);
          st.enemy = 'idle';
          st.stunImmune = 1800;
          st.eTimer = 1500;
          st.msg = `He's up at ${st.count}! Wobbly — finish him this round.`;
        }
        if (st.count >= 10) {
          if (st.phase === 'pdown') {
            endMatch('loss', 'Knockout — you stayed down for 10');
          } else {
            endMatch('win', 'KNOCKOUT — he stayed down for 10');
          }
        }
        render();
        return;
      }

      if (st.phase !== 'fight') return;

      st.timeLeft -= 0.05;
      st.eTimer -= 50;
      if (st.stunImmune > 0) st.stunImmune -= 50;

      if (st.enemy === 'idle' && st.eTimer <= 0) {
        if (Math.random() < 0.15) {
          st.enemy = 'taunt';
          st.eTimer = rnd(800, 1200);
          st.msg = `😜 ${st.opp.name} is showing off…`;
        } else if (Math.random() < st.opp.feint) {
          // FAKE wind-up: looks exactly like a tell, but jabbing it
          // eats a counter and it converts to a fast attack.
          st.enemy = 'tell';
          st.feint = true;
          st.eTimer = rnd(170, 250);
          st.msg = "⚠️ He's winding up — jab NOW for a ⭐, or dodge!";
        } else {
          st.enemy = 'tell';
          st.feint = false;
          st.eTimer = rnd(st.opp.tell[0], st.opp.tell[1]) - (st.round - 1) * 40;
          st.msg = "⚠️ He's winding up — jab NOW for a ⭐, or dodge!";
        }
      } else if (st.enemy === 'taunt' && st.eTimer <= 0) {
        st.enemy = 'idle';
        st.eTimer = rnd(st.opp.pace[0], st.opp.pace[1]);
      } else if (st.enemy === 'tell' && st.eTimer <= 0) {
        st.enemy = 'attack';
        if (st.feint) {
          st.feint = false;
          st.eTimer = 180;
          st.msg = '😱 It was a FAKE — here it comes, fast!';
        } else {
          st.eTimer = 230;
        }
      } else if (st.enemy === 'attack' && st.eTimer <= 0) {
        if (st.dodging > 0) {
          st.hearts = clamp(st.hearts + 1, 0, 20);
          st.tired = false;
          st.points += 20;
          // A clean dodge earns a star too — bank up to 5 now.
          let starNote = '';
          if (st.stars < 5) {
            st.stars += 1;
            starNote = ' +⭐ STAR!';
          }
          if (Math.random() < st.opp.combo) {
            // No rest for the slick: he chains a second hook.
            st.enemy = 'attack';
            st.eTimer = 230;
            st.msg = "💨 You dodged — but he comes RIGHT back with another!";
          } else if (st.stunImmune > 0) {
            // Clean dodge still pays a heart + points, but a wary
            // opponent doesn't hand you a free stun window.
            st.enemy = 'recover';
            st.eTimer = rnd(500, 800);
            st.msg = "💨 Clean dodge! +1 ❤️ +20 pts — but he's wary, no free shots!";
          } else {
            st.enemy = 'stunned';
            st.stunHits = 0;
            st.eTimer = rnd(950, 1250);
            st.msg = "💨 Clean dodge! +1 ❤️ +20 pts — and he's wide open!";
          }
          if (starNote) st.msg += starNote;
          haptic('medium');
        } else if (st.blocking) {
          st.pHp -= rnd(2, 4);
          st.taken += 3;
          st.msg = '🛡️ Blocked his hook — chip damage only.';
          st.enemy = 'recover';
          st.eTimer = rnd(500, 800);
          if (st.pHp <= 0) playerDown();
          else if (Math.random() < st.opp.combo / 2) {
            st.enemy = 'attack';
            st.eTimer = 230;
            st.msg = '🛡️ Blocked — but he shrugs it off and swings AGAIN!';
          }
        } else {
          hurtPlayer(
            rnd(st.opp.hook[0], st.opp.hook[1]) + (st.round - 1) * 2,
            'His hook connects!'
          );
          if (st.phase === 'fight') {
            st.enemy = 'recover';
            st.eTimer = rnd(600, 900);
          }
        }
      } else if (st.enemy === 'stunned' && st.eTimer <= 0) {
        st.enemy = 'idle';
        st.stunImmune = 1800;
        st.eTimer = rnd(st.opp.pace[0], st.opp.pace[1]);
        st.msg = 'He shakes it off — and he\'s wary now.';
      } else if (st.enemy === 'recover' && st.eTimer <= 0) {
        st.enemy = 'idle';
        st.eTimer = rnd(st.opp.pace[0], st.opp.pace[1]);
      }

      if (st.phase === 'fight' && st.timeLeft <= 0) {
        endRound();
        return;
      }
      render();
    }, 50);
    return () => clearInterval(iv);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // keyboard for desktop testing
  useEffect(() => {
    const down = (e) => {
      if (e.code === 'Space') {
        e.preventDefault();
        jab();
      }
      if (e.code === 'ArrowLeft') dodge(-1);
      if (e.code === 'ArrowRight') dodge(1);
      if (e.code === 'ArrowUp') {
        e.preventDefault();
        starPunch();
      }
      if (e.code === 'ShiftLeft' || e.code === 'KeyB') setBlocking(true);
    };
    const up = (e) => {
      if (e.code === 'ShiftLeft' || e.code === 'KeyB') setBlocking(false);
    };
    window.addEventListener('keydown', down);
    window.addEventListener('keyup', up);
    return () => {
      window.removeEventListener('keydown', down);
      window.removeEventListener('keyup', up);
    };
  });

  // ---- render: opponent select ------------------------------------------------
  if (S.phase === 'select') {
    return (
      <div className="game">
        <h2>🥊 FRG Boxing 3D</h2>
        <p className="select-sub">Choose your opponent</p>
        <div className="opp-cards">
          {OPPONENTS.map((o) => (
            <button key={o.id} className="opp-card" onClick={() => startFight(o)}>
              <img className="opp-thumb" src={`/sprites/${o.id}-idle.webp`} alt="" />
              <div className="opp-info">
                <div className="opp-name">{o.name}</div>
                <div className="opp-class">{o.cls}</div>
                <div className="opp-desc">{o.desc}</div>
              </div>
              <div className="opp-stats">
                HP {o.hp}
                <br />
                Hooks {o.hook[0]}–{o.hook[1]}
              </div>
            </button>
          ))}
        </div>
        <div className="rules">
          <p>✨ <b>Watch for the flash.</b> Your opponent glows right before he
            swings. Jab him in that instant: ⭐ <b>star</b> earned, and he's dizzy.</p>
          <p>😱 <b>Beware the fake.</b> Some flashes are feints — jab one and
            you'll eat a counter. A real flash lasts; a fake is gone in a blink.
            And dodge one hook, he may throw another right behind it.</p>
          <p>🌟 <b>Star Punch</b> spends a star on a huge uppercut. Get hit and
            you lose a star — dodge cleanly or land a 3-hit stun combo to earn more (bank up to 5).</p>
          <p>↔️ <b>Dodge</b> his hooks to win back ❤️ hearts, earn a ⭐ (bank up to 5),
            and leave him open.
            Getting hit or punching his guard costs hearts — at 0 you're gassed.</p>
          <p>💥 3 knockdowns in a round = TKO. If YOU go down, mash JAB to beat
            the 10-count. 3 rounds, then the judges decide.</p>
        </div>
      </div>
    );
  }

  // ---- render: fight ------------------------------------------------------------
  const enemyStateLabel =
    {
      idle: 'circling…',
      taunt: 'taunting!',
      tell: "⚠️ HE'S OPEN!",
      attack: 'SWINGING!',
      stunned: 'DIZZY — POUND HIM!',
      recover: 'recovering',
      down: 'DOWN!',
    }[S.enemy] || '';
  const playerFrame =
    S.phase === 'pdown'
      ? 'down'
      : S.punch
        ? S.punch
        : S.dodging > 0
          ? S.dodgeDir < 0
            ? 'dodgeL'
            : 'dodgeR'
          : 'idle';
  const swayPct =
    S.phase === 'fight' && (S.enemy === 'idle' || S.enemy === 'taunt')
      ? 50 + Math.sin(S.sway) * 7
      : 50;

  return (
    <div className="game">
      <div className="scoreboard">
        <div className="sb-cell">
          ⭐<span>{S.stars}</span> ❤️<span>{S.hearts}</span>
        </div>
        <div className="sb-cell sb-points">POINTS: {S.points}</div>
        <div className="sb-cell sb-time">
          <span>{fmtClock(S.timeLeft)}</span>
          <span className="rnd">ROUND {S.round}</span>
        </div>
      </div>
      <div className="hp-row">
        <div className="hp-col">
          <div className="hp-label">YOU{S.pDown ? ` · down ×${S.pDown}` : ''}</div>
          <div className="hpbar">
            <div className="hpfill pfill" style={{ width: `${clamp(S.pHp, 0, 100)}%` }} />
          </div>
        </div>
        <div className="hp-col right">
          <div className="hp-label">
            {enemyStateLabel} · {S.opp.name}
            {S.eDown ? ` · down ×${S.eDown}` : ''}
          </div>
          <div className="hpbar">
            <div
              className="hpfill efill"
              style={{ width: `${clamp((S.eHp / S.eMax) * 100, 0, 100)}%` }}
            />
          </div>
        </div>
      </div>

      <div className={`ring ${S.shake ? 'shake' : ''}`}>
        <RingStage3D stateRef={S} />
{(S.phase === 'edown' || S.phase === 'pdown') && S.count > 0 && (
          <div className="countLbl">{S.count}</div>
        )}
        {S.dmgNums.map((d) => (
          <div key={d.id} className={`dmgnum ${d.hurt ? 'hurt' : ''}`}>
            {d.txt}
          </div>
        ))}
        {S.burst && (
          <div key={S.burst.id} className={`hitburst ${S.burst.big ? 'big' : ''}`}>
            {S.burst.big ? '💥' : '✦'}
          </div>
        )}
        {S.burst && (
          <div key={S.burst.id} className={`hitburst ${S.burst.big ? 'big' : ''}`}>
            {S.burst.big ? '💥' : '✦'}
          </div>
        )}
        {S.callout && (
          <div key={S.callout.id} className="box-callout">
            {S.callout.text}
          </div>
        )}
      </div>

      <div className="msg">{S.msg}</div>
      {S.phase === 'pdown' && (
        <div className="mash">⬆️ GET UP! MASH 👊 JAB! ⬆️</div>
      )}

      <div className="controls-arcade">
        <button
          className="cbtn b-dodge"
          onPointerDown={(e) => {
            e.preventDefault();
            dodge(-1);
          }}
        >
          ◀ DODGE
        </button>
        <button
          className="cbtn b-jab"
          onPointerDown={(e) => {
            e.preventDefault();
            jab();
          }}
        >
          👊 JAB
        </button>
        <button
          className="cbtn b-dodge"
          onPointerDown={(e) => {
            e.preventDefault();
            dodge(1);
          }}
        >
          DODGE ▶
        </button>
      </div>
      <div className="controls-arcade2">
        <button
          className={`cbtn b-star ${S.stars > 0 ? 'ready' : ''}`}
          onPointerDown={(e) => {
            e.preventDefault();
            starPunch();
          }}
        >
          ⭐ STAR PUNCH
        </button>
        <button
          className={`cbtn b-block ${S.blocking ? 'active' : ''}`}
          onPointerDown={(e) => {
            e.preventDefault();
            setBlocking(true);
          }}
          onPointerUp={() => setBlocking(false)}
          onPointerLeave={() => setBlocking(false)}
          onPointerCancel={() => setBlocking(false)}
        >
          🛡️ BLOCK (hold)
        </button>
      </div>
      <div className="hint">Desktop: ←/→ dodge · Space jab · ↑ star punch · Shift block</div>
    </div>
  );
}
