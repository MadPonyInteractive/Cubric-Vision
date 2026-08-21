# MPI-551 — 21:9 cinematic ratio for every video model

## Why

Users want the cinematic letterbox framing (black bars top/bottom) as a first-class
canvas, not a post-crop. Today every video ratio tier ships exactly three entries:
`1:1`, `9:16`, `16:9`. This adds a fourth, `21:9`.

**Naming:** "21:9" not "2.39:1". 21/9 = 2.333 vs true anamorphic scope 2.39 — a
marketing round, the same one every monitor and TV mode already makes. Users
recognise 21:9; 2.39:1 reads as film-nerd. The actual pixel ratios below land
between 2.29 and 2.50 anyway, so neither label is pixel-exact — see § Ratio
exactness.

`ratio_21_9` ALREADY EXISTS in `js/utils/icons.js:135` (the crop tool uses it).
No icon work. Entries use `icon: "rect_21_9"` — the selector rewrites the
`rect_` prefix to `ratio_` at render time.

## Ratio exactness — not a goal, and precedent says so

`docs/models/ltx/tiers.md` § "Aspect-ratio exactness": the shipped 16:9 tiers
already run 1.71–1.77, because the models were trained on approximate buckets and
each grid constraint (/16, /32, /64) quantises hard at small sizes. The 21:9
values below run 2.29–2.50 for the same reason. Pixel-exact framing is a crop-at-
output concern, not a canvas concern.

## Tables

Each ladder is **area-incremental** — MP rises monotonically across tiers, which
is what a tier means. Verified per model against that model's own grid rule.

### H3 (`MINIMAX_H3_RATIOS`) — /32

USER-TESTED. Fabio compared 1536x640 against 1376x576 and reported 1536x640 gave
"really good results", which is why it sits at `high` and the dead-on-2.39
1376x576 sits one rung lower at `medium`.

| tier | 21:9 | ratio | MP |
|---|---|---|---|
| very_low | 832x352 | 2.36 | 0.29 |
| low | 1152x480 | 2.40 | 0.55 |
| medium | 1376x576 | 2.39 | 0.79 |
| high | 1536x640 | 2.40 | 0.98 |
| very_high | 1920x800 | 2.40 | 1.54 |
| 2k | 3840x1600 | 2.40 | 6.14 |
| 4k | 5120x2176 | 2.35 | 11.14 |

`high` at 0.98 MP sits right on H3's 768x1344 area cap (0.98 MP) — same pixel
budget as the native 16:9. Its short edge is 640, below H3's 768 native short
edge, so it is slightly under-trained on that axis; the user's own A/B says it
looks better regardless, and that measurement outranks the theory.

### LTX (`LTX_RATIOS`) — /64, NOT /32

The 2-stage pipeline halves then x2-upscales, so the half must itself be /32 —
making the effective grid /64. A /32-but-not-/64 value does not pad, it FLOORS,
silently mismatching the label the user picked (live-proven: 960x544 -> 960x512).
Every value below is /64-clean.

| tier | 21:9 | ratio | MP |
|---|---|---|---|
| very_low | 768x320 | 2.40 | 0.25 |
| low | 1024x448 | 2.29 | 0.46 |
| medium | 1280x512 | 2.50 | 0.66 |
| high | 1664x704 | 2.36 | 1.17 |
| very_high | 2560x1088 | 2.35 | 2.79 |
| 2k | 3840x1600 | 2.40 | 6.14 |
| 4k | 5120x2176 | 2.35 | 11.14 |

`low` (2.29) and `medium` (2.50) are the widest ratio drift in this card. They are
the closest /64 pairs at those areas; tightening either breaks the MP ladder.
Consistent with the existing 16:9 spread of 1.71–1.77.

### WAN 14B (`WAN_RATIOS`) — /16

Both samplers run at the SAME target res (no LTX-style half-clean constraint), so
/16 is the whole rule.

| tier | 21:9 | ratio | MP |
|---|---|---|---|
| very_low | 512x208 | 2.46 | 0.11 |
| low | 768x320 | 2.40 | 0.25 |
| medium | 1120x480 | 2.33 | 0.54 |
| high | 1728x720 | 2.40 | 1.24 |
| very_high | 2560x1088 | 2.35 | 2.79 |

`medium` keeps WAN's native 480 short edge and `high` keeps native 720 — both
in-distribution on the axis WAN cares about. `very_high` is above native, the same
extrapolated status the existing 1920x1088 entry already carries.

### WAN 5B (`WAN_5B_RATIOS`) — /32

720p-only model, three tiers. Not yet wired to a shipped model card, but
`getModelRatios` already routes it, so it gets the entry for consistency.

| tier | 21:9 | ratio | MP |
|---|---|---|---|
| low | 1120x480 | 2.33 | 0.54 |
| medium | 1344x576 | 2.33 | 0.77 |
| high | 1664x704 | 2.36 | 1.17 |

## H3 2k/4k — "Experimental - High VRAM" note

Applies to **EVERY ratio in H3's `2k` and `4k` tiers**, not just the new 21:9 one.

Evidence this is warranted, not decoration: **MPI-549** reports H3 ref2v OOMing at
both 2k and 4k on an RTX 5090 (32GB VRAM, 60GB RAM), and each OOM takes the remote
engine down and restarts the Pod — real money on a rented GPU. H3's own ratios.js
comment also records `4k` as the ONE tier with no run behind it, and extrapolates
~7-8x a 2k run from the measured ~3.3x-time-per-2x-pixels curve.

**Mechanism — a data-driven `note` field, not a model branch.** The status-bar
string is built in TWO places in `MpiOptionSelector.js` as `${r.label}${dims}`
(template path ~line 62, runtime `updateUI` path ~line 471). Both must change, or
the note appears on first paint and vanishes on first interaction — the exact
template/runtime-twin bug the file already warns about for the orientation toggle.

Add an optional `note` to the ratio entry and append it in both places:

    const note = r.note ? ` (${r.note})` : '';
    info: `${r.label}${dims}${note}`

Then each H3 2k/4k entry carries `note: "Experimental - High VRAM"`. No model-type
check inside the component — any future tier can opt in by adding the field.

ASCII hyphen in the note, not an en-dash: the value lands in an HTML `data-info`
attribute and the codebase keeps card/message text ASCII.

## Blast radius

- `ratios.js` tables are `deepFreeze`d at module load; adding entries before the
  freeze call is fine, mutating after is not.
- `KREA2_RATIOS['1k'] IS FLUX_RATIOS` (same object) — untouched here, but do not
  "tidy" it while in the file.
- `promptReuse.js` resolves a saved generation by ratio LABEL against the tier
  table. Adding a label is additive: old items never say "21:9", so nothing
  re-resolves differently. Removing or renaming one later WOULD break reuse.
- The picker row goes 3 -> 4 buttons. Check the grid does not wrap badly in
  `mpi-opt-sel__grid--ratio`.
- `tests/ratio-modes-exhaustive.test.cjs` walks every RATIO_MODES value on both
  axes — it must stay green.

## Known interaction, not a blocker

**LTX t2v spontaneously letterboxes.** `docs/models/ltx/black-bars-and-nag.md`:
LTX-Video was trained with letterboxing stripped and pure black as a "generate-here"
sentinel, so on some seeds — especially prompts carrying `cinematic`, `anamorphic`,
`widescreen` — it frames sub-canvas and fills the margin black. A user picking a
21:9 canvas on t2v can therefore get bars INSIDE an already-letterboxed frame.
i2v is clean (the start frame pins composition edge to edge). Worth a sentence in
the LTX table comment so the next person does not re-diagnose it as a 21:9 bug.

## Out of scope

- Image models (FLUX/SDXL/Krea2) — video only, per the request.
- `CROP_RATIOS` / `SOCIAL_RATIOS` — crop already has 21:9 and 2.39:1.
- Any workflow/injection change. This is canvas dimensions only.
