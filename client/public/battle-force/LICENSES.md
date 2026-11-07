# Battle Force — third-party asset licenses

> Renamed from "Arena Clash 3D" on 2026-11-07 (owner's direction):
> same engine, roster and CC0/MIT assets; the arena was re-skinned as a
> military command battle-dome (steel deck + holo grid, hangar wall,
> radar tower, searchlights — all procedural canvas/geometry original
> to this project, no new third-party assets).

Every third-party asset below is **CC0 1.0 Universal (public domain dedication)**
or MIT, verified against the license text shipped inside the downloaded packs
themselves (checked 2026-11-04). No name, character, or asset from any
commercial fighting game is used; fighter names, the arena, the HUD, and the
costume repaints are original work for this project.

## Characters & animation — Quaternius (CC0 1.0)

Source: itch.io downloads by Quaternius. The `License.txt` /
`License_Standard.txt` inside each pack states CC0 1.0 Universal.

| Pack | itch upload id | Used for |
|---|---|---|
| Universal Animation Library 1 | 17958403 | `anim/ual1.glb` — idle/walk/jump/crouch/block/hit/death/win clips |
| Universal Animation Library 2 | 17958478 | `anim/ual2.glb` — punch/hook/slide/dash/cast clips |
| Universal Base Characters | 15861669 | `models/ryker/` (Superhero Male body + parted hair + beard), `models/sable/` (Superhero Female body + long hair) |

Notes on use:
- Animation GLBs were mechanically trimmed to the clips the game uses
  (meshes/textures stripped, unused accessors garbage-collected).
- Character textures were downscaled to ≤1024px.
- The costume colours/emblems on the two fighters were painted onto the
  diffuse textures by this project (original designs: navy suit + gold
  diamond for RYKER, crimson suit for SABLE) — the underlying body art
  remains Quaternius CC0.
- Hairstyles are the packs' own "Rigged to Head Bone" variants, re-attached
  to the character's Head bone at runtime via their inverse-bind matrix.

## Visual pass + roster expansion (2026-11-06)

No new third-party assets were added. The richer colosseum (arcade wall,
seating tiers, rune pylons, braziers, war banners, painted crescent moon,
impact-flash star) is procedural geometry + canvas textures drawn in
code, original to this project. The two added fighters — CAPTAIN BURN
and MS NOVA — are original characters for this project built on the same
CC0 Quaternius rigs listed above: BURN reuses the male body with the
pack's beard hairstyle and an ember-red material tint; NOVA reuses the
female body with no hair attachment and a violet material tint. Tints
are runtime material colours over the CC0 textures — no new art assets.
A later same-day addition (texture-richness pass) painted an ashlar
stone-block canvas texture (+ a matching procedural bump map) onto the
seating tiers, gallery band, pillars, rune pylons and braziers, and
painted masonry block joints into the arcade wall texture — again all
procedural canvas work original to this project, no new assets.

## Engine — three.js r160 (MIT)

Vendored under `lib/` (`three.module.js`, GLTFLoader + BufferGeometryUtils
addons). MIT License, © three.js authors. https://threejs.org

## Everything else

Arena geometry/textures (procedural canvas + primitives), HUD, sounds
(WebAudio synthesis), and all game code are original to this project.
