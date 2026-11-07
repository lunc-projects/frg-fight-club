# LUNC Rush 3D — asset licenses & credits

No name, character, art, music, or asset from any commercial game is used.
The hero, world, HUD, and all models in this game are original work for
this project, built procedurally in code (Three.js geometry + canvas
textures generated at runtime). The only third-party code is Three.js.

## Three.js (MIT License)

- `lib/three.module.js` — Three.js r160, MIT License.
  Copyright © 2010-2023 Three.js Authors. https://threejs.org
  (Vendored from this repository's own Arena Clash 3D build, which uses
  the same release.)
- `lib/addons/loaders/GLTFLoader.js` — Three.js r160 addon, MIT License.
  Vendored for parity with the other 3D games in this repo; LUNC Rush 3D
  loads no external model files (all models are procedural), so the
  loader is currently unused but kept available for future licensed
  model drops.

## Hero — COMET the moon-fox (original)

COMET is an original character created for LUNC Rush (first drawn for the
2D game, 2026-11-06). The 3D model is built entirely from Three.js
primitive geometry (spheres, capsules, cones) assembled in `game.js` —
no third-party model, texture, or animation is used. Orange coat, cream
chest/muzzle, dark ear tips, teal scarf and runner shoes, gold crescent
ear stud and chest charm, large cream-tipped tail plume.

## World & pickups (original, procedural)

- Ground/track/cliff/bark/water/cloud textures are generated at runtime
  on `<canvas>` in `game.js` — no image files, no third-party art.
- Palm trees, cliffs, hills, the giant loop, obstacles, the LUNC crescent
  coin (extruded crescent shape) and the USTC star (extruded star shape)
  are all procedural Three.js geometry created for this game.
- `lunc.png` — the Luna Classic crescent emblem, the project's own asset
  (shared with the 2D LUNC Rush), drawn from the game's own crescent
  design.

## Audio (original, procedural)

All sound is synthesized at runtime with the Web Audio API (coin chime,
star chime, jump, hit, loop whoosh, wind). No audio files and no
copyrighted music are used, ever.
