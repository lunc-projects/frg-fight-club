# SNIPER SHOT — third-party asset licenses

Every third-party asset below is **CC0 1.0 Universal (public domain dedication)**
or MIT, verified against the license text shipped inside the downloaded packs
themselves (checked 2026-11-04). No name, character, level, or asset from any
commercial shooting game is used; the perch, the overwatch layout, the HUD,
and all game code are original work for this project. The setting reuses
Arena Clash 3D's colosseum art direction (also original to this project).

## Characters & animation — Quaternius (CC0 1.0)

Source: itch.io downloads by Quaternius. The `License.txt` /
`License_Standard.txt` inside each pack states CC0 1.0 Universal.

| Pack | itch upload id | Used for |
|---|---|---|
| Universal Animation Library 1 | 17958403 | `anim/ual1.glb` — idle/walk/crouch/hit/death clips |
| Universal Animation Library 2 | 17958478 | `anim/ual2.glb` — knockback clip |
| Universal Base Characters | 15861669 | `models/ryker/` (Superhero Male body + parted hair + beard), `models/sable/` (Superhero Female body + long hair) |

Notes on use:
- The model/animation files in this folder are the same trimmed, texture-
  downscaled copies prepared for Arena Clash 3D (see its LICENSES.md);
  the costume colours/emblems on the two characters were painted onto the
  diffuse textures by this project — the underlying body art remains
  Quaternius CC0.
- Hairstyles are the packs' own "Rigged to Head Bone" variants, re-attached
  to the character's Head bone at runtime via their inverse-bind matrix.

## Engine — three.js (MIT)

`lib/three.module.js` and `lib/addons/` (GLTFLoader, BufferGeometryUtils) are
three.js r160, MIT License, Copyright © 2010–2023 three.js authors.
