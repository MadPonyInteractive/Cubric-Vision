# MPI-634 — validation

## What changed

`MpiFlowLibrary` rendered one undifferentiated `MpiTileSheet` over every flow, so
nothing on the grid said whether a flow produced an image, a video or audio — the
tile is the same 4/5 still either way. It now renders one labelled section per
output type (`flow.mediaType`), the same `__media-head` header the Model Library
(`MpiModelManager._mediaBlock`) and the model picker (`MpiModelPicker._mediaBlock`)
already draw.

- `js/components/Compounds/LandingPages/MpiFlowLibrary/MpiFlowLibrary.js`
  — `MEDIA_SECTIONS` + `_block()`; `_sheet` (one) → `_sheets` (one per section);
  `_destroyAllTiles` and `_patchTile` fan out over the array.
- `js/components/Compounds/LandingPages/MpiFlowLibrary/MpiFlowLibrary.css`
  — `.mpi-flow-library__media-head` (+ `--video`, `--audio`, `-n`), values copied
  from the Model Library's rule so the three pickers match.

## Evidence — live app, 2026-08-28

Own isolated instance (`CUBRIC_AGENT_PROFILE=…/cubric-agent-634 npm run app:isolated`,
port 53212; user's :3000 left alone and verified still owned by PID 29360 after
teardown), driven with `playwright-cli`.

Headers render, with the right counts and the right token colours:

```
"Image6 | …__media-head--image | color=oklch(0.5 0.018 80)"    <- --ink-4
"Video3 | …__media-head--video | color=oklch(0.82 0.13 220)"   <- --accent-frost
"Audio3 | …__media-head--audio | color=oklch(0.78 0.14 60)"    <- --accent-warn
```

No flow is lost by the split, and header/sheet alternate in order:

```
{ sheets: 3, tiles: 12, perSheet: [6,3,3],
  order: [head--image, tile-sheet, head--video, tile-sheet, head--audio, tile-sheet] }
```

12 tiles = the 12 flows in `flowsRegistry`. No `Other` section appeared, i.e. every
shipped flow carries a recognised `mediaType`.

Selection still works from a non-first sheet — clicking the 2nd tile of the AUDIO
sheet opened the drawer on `Text to Speech` (`#flow-detail-panel.is-open === true`).

Badge patching still reaches every sheet — `Events.emit('models:checked')` left all
12 chips present and re-derived (12 before, 12 after).

Screenshots confirm the visual: `IMAGE 6` grey, `VIDEO 3` cyan, `AUDIO 3` amber,
same type treatment as the Model Library.

## Checks

- `npm run lint` — clean (`--max-warnings=0`).
- `npm test` — 761 pass, 0 fail.

## Noted, NOT changed (pre-existing)

The `#flow-lib-sub` line ("11 ready · 1 need models") is written only by
`renderList()`, while the tile badges re-derive on `models:checked` / `download:*`.
So the sub-line can disagree with the chips until the next full render. That
divergence predates this card and is untouched by it.
