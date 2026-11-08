# Luna Bubble 3D — Asset Licenses

Everything in this game is original or procedurally generated in code. No
third-party art, models, fonts, or audio files are bundled. Visual quality
techniques were studied from genre-leading titles (Bubble Witch 3 Saga,
Panda Pop) as reference for lighting and presentation only — no assets, art,
names, characters, or layouts from those games are used.

## Code

- **This game** (`index.html`, `game.js`) — original work for LUNC Dev Studio.
- **Three.js r160** (`lib/three.module.js`) — MIT License, Copyright © 2010–2023
  three.js authors. https://threejs.org — the full license text ships inside
  the library file header.

## Art (all procedural, generated at runtime by `game.js`)

- Bubbles — Three.js sphere geometry with a physical glass material; glyphs
  (crescent, star, coin, crystal, orb, comet, gold LUNC crescent, blue USTC
  star) are drawn on canvas in code.
- Environment reflections — a canvas-generated equirectangular "dark room
  with softbox strips" image, used only as a reflection map.
- Backdrop — a canvas-generated deep-space scene (gradient, nebula wash,
  star field) plus drifting dust particles; a back panel carries the words
  "LUNA CLASSIC" and "LUNC DEV STUDIO" drawn in code.
- Shooter, ceiling plate, frames — built from Three.js primitives in code;
  wordmarks are drawn on canvas in code.
- The gold crescent logo marks are simple SVG paths drawn in `index.html`.

## Audio

- All sound effects are synthesized live with the WebAudio API (oscillators).
  No audio files are used.

## Rules of play

- Free to play. The game never connects a wallet and never asks you to sign
  anything. Any page that does is a fake.
