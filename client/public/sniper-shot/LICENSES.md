# SNIPER SHOT 3D — third-party asset licenses

This build uses **no downloaded art assets at all**. The city, buildings,
cars, people, animals, targets, rifle and every texture are generated
procedurally at runtime by the game's own code (canvas textures + three.js
geometry) — original work for this project, in the same house style as
Arena Clash 3D and the original Sniper Shot. No name, character, level,
map, or asset from any commercial shooting game is used. The city's
advertising (LUNC / LUNA CLASSIC / LUNC DEV STUDIO billboards, shop
signs, banners, truck livery, roof paint) is the studio's own house
branding, drawn procedurally the same way — the crescent mark is drawn
in code, not copied from any file.

## Engine — three.js (MIT)

`lib/three.module.js` is three.js **r160**, MIT License,
Copyright © 2010–2023 three.js authors. It is the same vendored copy used
by Sniper Shot and Arena Clash 3D in this repository. The build is fully
procedural, so no `lib/addons/` loaders are required.

## Predecessor note

The original (pre-3D) Sniper Shot at `/sniper-shot/` uses Quaternius
CC0 character/animation packs — see its own `LICENSES.md`. None of those
files are used by this 3D build; its people and animals are simple
original articulated figures built from primitives so the whole living
city (traffic, crowds, animals) stays light enough for phones.
