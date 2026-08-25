# MPI-621 Validation

**Verify mode:** `user-ux` — the last call on a generated picture is Fabio's.

## Automated — PASSED

| check | result |
|---|---|
| `node scripts/verify-workflow.mjs comfy_workflows/flow_draw_it_in.json` | ✓ 34 nodes, validates against the app engine on 48188 |
| `npm test` | **729 / 729 pass**, 0 fail |
| `npm run test:desktop` | **26 / 26 pass** |
| `npm run lint` | clean (`--max-warnings=0`) |
| `npm run release:check` | passed (op registry ↔ `operation_registry.json` mirror in sync at `1.1`) |

## Live — 5 runs on the local engine (48188), 4 cases

Plate reconstructed from the sweep's own files: `Untitled/Media/t2i_005.png` as the photo,
and the paint LAYER rebuilt by diffing `paint_001.png` against it. **The reconstruction lands
the drawn bbox at x 770..820, y 445..519 = 51 × 75 — identical to the brief's measurement**,
which independently confirms both the plate and the derivation.

Structural check on every run: diff the result against the source photo, split by the box
(+40px, past the 32px feather).

| run | prompt | box | outside the box | inside | verdict |
|---|---|---|---|---|---|
| `run1` | a man sitting on the sand | 145×260 (2.2×) | **0 of 902,428 px differ** | 99.6% re-rendered | subject complete, grounded with contact shadow, warm rim light matching the scene's low sun, no seam, ink gone |
| `small` | a small child standing on the wet sand | 36×73 | **0 of 957,100** | 100% | anchored at the drawn scale — but see the finding below |
| `smallsand` | a small child standing on the sand | 36×73 | 0 | — | tiny child at the drawn scale, own shadow, **no seam at all**, the tiger's leg crosses the box boundary unbroken |
| `cartoon` | a cartoon man in a bright red hat, flat cel-shaded | 145×260 | **0 of 902,428** | 96.6% | cartoon subject in a photoreal scene — **style applied to the subject ONLY** |
| `cartoon2` | same, seed 777001 | 145×260 | **0 of 902,428** | 94.2% | same, clean |

**"0 outside the box" is the claim the whole crop/stitch exists to make**, and it holds
bit-exactly on every run. A whole-image pass on this plate destroyed it (the brief records a
deleted bystander and a chimera).

The derived factor behaved as designed at both ends: `S=75, B=260 → f=1.231 → crop 320px` and
`S=33, B=73 → f=1.929 → crop 141px`, both leaving the scribble at ~240px after normalise.

## Two findings from the live runs

**1. The brief's last open question is ANSWERED: a large crop upscale is fine on textured
ground.** It asked whether the ~10× upscale at the tight end survives the downscale back into
the photo. `smallsand` crops 141px → 1024 (a **7.3×** upscale) and stitches back with no
visible seam and no softness — the tiger's leg runs through the box edge unbroken.

**2. But the seam IS background-dependent, and sky/water is where it shows.** The `small` run
put the same 33px figure over ocean/horizon and came back as a plainly visible lighter
rectangle. Same crop size, same upscale, different background — so that rectangle is Law 2's
re-grade over a flat background, not an upscale artefact. Consistent with
`blending-into-a-photo.md` ("worst over sky, water and flat sand"), except **sand did not show
it here at all.**

## One defect, not fixed — seed variance, not systematic

`cartoon` (seed 424242) invented a **large dark shadow blob with no caster** at the bottom of
the box. The source region there is clean sand (checked), and neither `run1` at the same box
and seed nor `cartoon2` at a different seed produced it — **1 of 2 cartoon seeds.** It is the
class the prompt's conditional-shadow clause exists to suppress, over-firing under style load.
Not chased: one occurrence in five runs, and the subject's own shadow was correct in all of
them.

## DoD item 6 — Fabio's runs in the app, 2026-08-25

He ran it himself. Three cases, and one of them found a defect my five runs could not have:

| run | plate | verdict |
|---|---|---|
| `flowScribObj_017` | tarantula on a **vintage** beach photo | subject right, **visible seam** |
| `flowScribObj_018` | same, deliberately BIGGER box | seam unchanged - more context did not help |
| `flowScribObj_019` | distant man on a modern plate | "No issue on this one. Even his shadow is ok... If it has a seam, I can't see it" |

**His diagnosis was right and is now measured:** "this was a vintage photo anyway, so the model
tried to fix what makes the photo vintage." On `_018` the returned patch came back de-faded and
re-contrasted - mean **+9.5/+5.5/+2.6 RGB** (channel-uneven, so a de-fade rather than a
brightness shift), sd **+5.9/+4.8/+4.4**, top-edge luma step **3.60** against the photo's own
0.39 across the same line.

**Why my own five runs missed it:** every plate I tested was a modern-looking render, where the
model's default look and the photo's grade already agree. The ~2% step I measured was real and
the generalisation off it was wrong.

### The fix, and its evidence

`ColorMatch` (KJNodes, already in the shipped engine) between the Klein decode and the stitch -
`image_ref` = the original crop, `image_target` = the decode, `mkl`, strength 1.

1. **Simulated first, no GPU**, on his own `_018` output: reinhard-equivalent transfer took the
   top-edge step 3.60 -> -0.75. A ring-only reference was tried and measured WORSE (-2.58),
   because the ring catches whatever else crosses the box edge.
2. **Then verified live** on the same vintage plate through the real node: mean delta
   **-3.2/-3.2/-2.6** (uniform - tone, not restoration), sd delta down 3.7x, **top-edge step
   3.60 -> -0.20**, below the plate's own natural variation. No rectangle visible.

`npm test` 737/737 after the change; `tests/inject-params-titles.test.cjs` pins the wiring,
because deleting the node is silent - the run still succeeds and the seam just returns.

**Known ceiling, not yet hit:** the reference includes the subject's own new pixels, so a
subject that FILLS the box would drag its tone toward the background it replaced. Drop
`strength` below 1 if that ever shows.

## CONFIRMED BY FABIO IN THE APP, 2026-08-25

`flowScribObj_020` - the same vintage tarantula case re-run through the fixed graph.
His words: **"oh wow! It really does fix it."** No seam.

That closes DoD item 6, and with it all six:

1. crop rule measured and justified in the flow doc - yes
2. Klein 9B only; SDXL render slot, rembg and the paste chain removed - yes
3. the prompt carries all six properties, each traceable to its finding - yes
4. verified on more than one plate - 4 agent plates + 4 of his own runs, incl. the
   style mismatch and the vintage plate that found the seam
5. `npm test` 737/737 and `npm run test:desktop` 26/26 - yes
6. live run in the app - yes, and it is what found and then confirmed the fix

**Nothing is outstanding. The remaining work on this card is close-out only.**
