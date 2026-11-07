# Luna Pool 3D — Asset Licenses

Everything in this game is original or procedurally generated in code. No
third-party art, models, fonts, or audio files are bundled.

## Code

- **This game** (`index.html`, `game.js`) — original work for LUNC Dev Studio.
- **Three.js r160** (`lib/three.module.js`) — MIT License, Copyright © 2010–2023
  three.js authors. https://threejs.org — the full license text ships inside the
  library file header.

## Art (all procedural, generated at runtime by `game.js`)

- Felt texture — canvas-generated: royal-blue cloth noise with a faint Luna
  Classic crescent and "LUNA CLASSIC / LUNC DEV STUDIO" lettering drawn in code.
- Wood rails — canvas-generated grain.
- Balls — canvas-generated equirectangular textures: classic pool colours with
  white number spots (1–8); the cue ball carries gold Luna Classic crescents.
- Environment reflections — canvas-generated equirectangular "pool hall"
  (dark room + warm softbox strips) used only as a reflection map.
- Table, pockets, lamps, cue stick — built from Three.js primitives in code.

## Audio

- All sound effects are synthesized live with the WebAudio API (oscillators and
  filtered noise). No audio files are used.

## Rules of play

- Free to play. The game never connects a wallet and never asks you to sign
  anything. Any page that does is a fake.
