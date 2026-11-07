# Barrel Tower — asset licenses & credits

Barrel Tower is an ORIGINAL game by LUNC Dev Studio, built for this
project. It uses the classic climb-and-dodge arcade formula (climb
ladders, jump rolling barrels) the way many games share a formula —
but no name, character, art, music, level layout, or asset from any
commercial game is used. There is no Donkey Kong and no Mario here:
the barrel-rolling ape is this project's own gorilla character and
the hero is an original hard-hat tower worker (helmet + headlamp,
overalls, backpack), both designed from this project's own concept
art and modelled procedurally in code.

Everything in this game is procedural and original:

- **Models** — the ape, the climber, the red-steel girder tower,
  wooden decks, ladders, barrels, crates, fire drums, traffic cones,
  the LUNC crescent coin and the USTC star are all built in `game.js`
  from Three.js primitive geometry assembled in code. No external
  model files are loaded.
- **Textures** — wood planks, barrel staves, rusted steel, crate
  faces, the night sky, and the wordmark plates ("LUNA CLASSIC"
  illuminated sign, "LUNC DEV STUDIO" banner) are generated at
  runtime on `<canvas>` in `game.js`. No image textures are used.
- **Menu key art** — `keyart.webp` is this project's own AI-generated
  concept art, commissioned for Barrel Tower (2026-11-07) and used as
  the menu hero image and the basis for the Arcade card art.
- **Emblem** — `lunc.png`, the Luna Classic crescent emblem, is the
  project's own asset, shared with the other LUNC Dev Studio games.
- **Audio** — all sound is synthesized at runtime with the Web Audio
  API (pickup chimes, jump, thuds, fanfares). No audio files and no
  copyrighted music are used, ever.
- **Pickups** — LUNC crescents and USTC stars only.

## Third-party code

- `lib/three.module.js` — Three.js r160, MIT License.
  Copyright © 2010-2023 Three.js Authors. https://threejs.org
  (Vendored from this repository's own LUNC Rush 3D build, which uses
  the same release.)

No other third-party code or assets are used.
