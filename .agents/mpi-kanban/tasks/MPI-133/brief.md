# MPI-133 Brief — LTX 2K/4K quality tiers

> Designed in brainstorm (2026-06-25). Dims web-researched + /64-verified.
> Ships as part of the LTX push (relates to MPI-127). Self-contained — all
> numbers and edits below are final.

## Goal

Add **2K** and **4K** quality tiers to LTX video generation. Reuse the existing
quality-radio mechanism — these are new tiers, not a new control and not an
upscale pass. Same single-stage resolution injection, just larger dims.

## Decisions (locked — do not re-litigate)

- **Tiers, not upscale pass.** LTX 2K/4K are native gen resolutions injected
  into the model. No `outputScale` knob, no stage-2 upscale toggle.
- **Extend the quality radio, do NOT add separate buttons.** A second control
  would need to sync back to the quality radio — avoided entirely by extending.
- **No state / sidecar change.** `qualityTier` already serializes into
  `controlState` SCHEMA 3. `'2k'` / `'4k'` are just new valid values. No schema
  bump, no migration.
- **Labels are literal: `2K`, `4K`** (clearest for users).
- **Wan is untouched.** `LTX_RATIOS` and `WAN_RATIOS` are independent tables —
  Wan must NOT gain 2K/4K tiers.

## Final dimensions

Official LTX-2.3 broadcast dims (1440p / 2160p from docs.ltx.video) **snapped to
the /64 pipeline grid** (the multi-stage ×0.5→×2 rule, see
`docs/builder/research/ltx-2.3-tiers.md` §"/64 size rule"). All 6 verified /64
AND half-grid /32 clean.

| Tier key | label | 1:1 | 9:16 (w×h) | 16:9 (w×h) |
|---|---|---|---|---|
| `2k` | **2K** | 1472×1472 | 1408×2560 | 2560×1408 |
| `4k` | **4K** | 2176×2176 | 2176×3840 | 3840×2176 |

Notes:
- 1:1 (1472, 2176) matches the research-tested squares exactly.
- 9:16 / 16:9 = official 1440p/2160p with the off-grid short edge snapped to /64
  (1440→1408, 2160→2176). AR drifts ~2% — identical to the already-shipped
  `low`/`high` tiers, so NOT a new crop concern.
- Icons: reuse existing `rect_1_1`, `rect_9_16`, `rect_16_9`.

## Implementation — 3 files

### 1. `js/utils/ratios.js`

Add two keys to `LTX_RATIOS` (after `very_high`):

```js
'2k': [
    { label: "1:1", w: 1472, h: 1472, icon: "rect_1_1" },
    { label: "9:16", w: 1408, h: 2560, icon: "rect_9_16" },
    { label: "16:9", w: 2560, h: 1408, icon: "rect_16_9" }
],
'4k': [
    { label: "1:1", w: 2176, h: 2176, icon: "rect_1_1" },
    { label: "9:16", w: 2176, h: 3840, icon: "rect_9_16" },
    { label: "16:9", w: 3840, h: 2176, icon: "rect_16_9" }
]
```

Update the header comment block (currently says "2K/4K dropped") to reflect that
2K/4K are now shipped LTX tiers.

### 2. `js/components/Compounds/MpiOptionSelector/MpiOptionSelector.js`

The quality variant currently has a global `QUALITY_TIERS` array shared by Wan +
LTX. Make it **model-aware** so only LTX gets the 2 extra tiers:

- Replace the flat `const QUALITY_TIERS = [...]` (line ~125) with a per-model
  lookup, e.g.:
  ```js
  const QUALITY_TIERS_BY_MODEL = {
      wan: ['very_low', 'low', 'medium', 'high', 'very_high'],
      ltx: ['very_low', 'low', 'medium', 'high', 'very_high', '2k', '4k'],
  };
  const tiersFor = (modelType) =>
      QUALITY_TIERS_BY_MODEL[modelType?.toLowerCase()] ?? QUALITY_TIERS_BY_MODEL.wan;
  ```
  Every site that reads `QUALITY_TIERS` (validation in `setValue`, the click
  handler, `_buildQualityOptions`) must use `tiersFor(modelType)` instead. Note
  `_setupQuality`'s click handler validates against the tier list — thread
  `modelType` through so 2k/4k are accepted for LTX and rejected for Wan.
- `QUALITY_LABELS`: add `'2k': '2K'`, `'4k': '4K'`.
- `_buildQualityOptions(modelType, selectedRatio)`: iterate `tiersFor(modelType)`.
  For the `info` string (status-bar hover text, line ~146), append a motion hint
  for the two new tiers so the status bar TEACHES the res/motion tradeoff (the
  research finding: motion decays as resolution climbs):
  - `2k` → `2K — {w}×{h} · detail-focused, low motion`
  - `4k` → `4K — {w}×{h} · max detail, minimal motion`
  - all others unchanged (`{Label} — {w}×{h}`).

  The `info` field is the existing status-bar hover mechanism — no new wiring;
  it already flows there. Resolution shown reflects the currently selected
  ratio label (existing `match` logic).

### 3. `js/components/Compounds/MpiOptionSelector/MpiOptionSelector.css`

The radio row will hold 7 buttons for LTX. Add `flex-wrap: wrap` (and a sane
row-gap) to `.mpi-opt-sel__quality-radio` so the 5 base tiers stay on row 1 and
2K/4K wrap to row 2. CSS-only — no JS layout logic. Verify the 5-tier Wan/LTX
layouts still render on a single row at normal widths.

## Verification

- LTX model selected → quality radio shows 7 tiers, 2K/4K on a wrapped 2nd row.
- Wan model selected → quality radio shows 5 tiers, NO 2K/4K, single row.
- Hover 2K/4K → status bar shows resolution + motion hint.
- Switch ratio (1:1 ↔ 9:16 ↔ 16:9) while 2K/4K selected → dims update from
  `LTX_RATIOS['2k'|'4k']`, no collapse/snap surprises (numbers are /64-clean).
- Generate at 2K/4K → injected width/height match the table above.
- Pick 2K/4K, save, reload group → `qualityTier` round-trips via sidecar
  (no schema bump expected; confirm replay restores the tier).

## Out of scope

- No upscaler / stage-2 changes.
- No Wan changes.
- No new state keys, no `controlState` schema bump.
- 4K motion quality is a known model limitation (research: motion ~vanishes at
  4K) — the status-bar hint communicates this; do NOT try to "fix" motion here.
