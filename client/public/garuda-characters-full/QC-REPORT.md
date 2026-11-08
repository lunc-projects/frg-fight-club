# GARUDA Full-Body Pack — QC Report (Nov 8, 2026)

Built by `~/workspace/garuda-characters-work/make_fullbody.py` on top of
the extraction pack (`~/workspace/garuda-characters/`). Ordered by Tom
after playing the hero test build: "Characters look great we just need
to add legs to them" + "Turn their body sideways so they are facing
the game direction."

## Case finding (evidence)

**CASE B — the originals are busts.** The original NFT art for #74,
#1, #415 and #417 was inspected directly (1000×1000 originals in
`garuda-characters-work/orig/`): every one is a front-facing bust
portrait — head + torso, cropped mid-torso at the frame's bottom edge.
No legs, waist or side view exists in the source art. The extraction
pack was faithful; the legs simply were never drawn by the artist.
There is also no side-view art anywhere in the team's assets we hold.

## What was built (per token, all 500)

- Palette sampled from the token's own bust (outfit from the torso
  band, accent, feather colour from the head sides, beak colour).
- Lower body drawn in the same flat black-outline style: waist/shorts
  block continuing the outfit colour, two legs in a side stride
  (outfit-colour thighs, bare eagle shins + talon feet in beak
  colour), both feet ending exactly at the sprite's bottom edge.
- Side turn, as far as the art mechanically allows: horizontal
  squeeze (0.82×) + forward-lean shear on the bust, tail feathers and
  a folded wing behind the torso on the trailing side, and the beak
  patch shifted toward the facing side where it could be isolated
  cleanly (**282 / 500** passed the beak isolation gates; the other
  218 keep their original beak position — the head stays the NFT's
  own front-facing art; a true profile redraw of 500 unique portraits
  is not a mechanical transform and was NOT faked).
- Beak not colour-detected on 2 tokens (#449, #458): default eagle
  orange used for legs/feet; both still built and visually fine
  (#449 is the helmeted Legendary — black legs, orange feet read
  correctly in the QC sheet).
- In-game the game now mirrors the sprite with the run direction and
  anchors its feet at the hitbox bottom (see the game file), so the
  character stands ON the ground line instead of sinking into it.

## Result: 500 / 500 built, 0 build errors

- 500 PNGs (`1.png` … `500.png`) + `characters.json` (all `ok: true`)
  + `build-report.json` (per-token palette + beak record).
- Total size: ~71 MB (vs 82.5 MB for the bust pack).

## Visual verification (human-reviewed composites on sky blue)

- Prototypes #74, #1, #415, #417 iterated 4 times and eyeballed at
  full size and at in-game size (76 px) before the mass run.
- Post-run sheets reviewed: ALL 20 Legendaries, Tom's 6 tokens
  (#66, #74, #269, #330, #415, #416) and a seeded random 20
  (#117, #190, #493, #193, #65, #99, #361, #23, #44, #71, #127,
  #416, #260, #108, #206, #329, #16, #236, #250, #233).
  Every reviewed sprite reads as one complete character: outfit
  continues into the shorts, legs/talons planted, tail behind.
  Quirks noted, none blocking: #425's pink boa token gets pink legs
  (palette-honest); wide-stance on muscular tokens reads "power
  stance" rather than mid-stride.
- In-game verification (staged build, QA suite run_qa_fullbody.py):
  39 PASS in the final run. Every behavioural check passed —
  Tom's wallet → his 6 staked → #74 and #415 in-world, Legendary
  #417 (2 shields + power dive), full Level 1 completion, staked
  crediting + stolen-#115 cross-check, audio fix, zero page errors,
  and the new section 14/15 (PLAY WITH YOUR NFT states + menu
  visibility). The suite's two legacy pixel-census checks (hero
  "pink" fraction) report low numbers under the new build because
  the character no longer sinks into the census box and the sprite
  is 42% taller (76 px box vs ~108 px of character) — the heroes
  were verified by direct screenshot inspection instead (see qa/).
  Deployed build re-verified live on the test route the same way
  (relay of fresh production bytes; #74 run + menu screenshots).

## Files

- Sprites + manifest: `~/workspace/garuda-characters-full/`
- Generator: `~/workspace/garuda-characters-work/make_fullbody.py`
- Deployed (test route only) as `/garuda-characters-full/` next to
  `/garuda-hero-test/`; the bust pack and the live game are untouched.
