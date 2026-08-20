# MPI-588 — validation

## The debt is gone

`npx eslint js/ --max-warnings=0` → exit 0. `mpi/no-bare-form-control` reports **0** across
`js/`, down from 26 in 11 files. Every one of those files is committable again without a
`--no-verify`.

## Suites

- `npm test` → **655/655**, run before and after the CSS specificity fix.
- `npm run test:desktop` → **24/24**, likewise. Three of those specs exercise converted
  controls directly: `workspace-sweep` opens *and closes* the settings slide-over (the
  converted close button), `runpod-settings-extract` renders inside it, and
  `model-settings-popup` opens the LoRA panel that owns the bypass toggle.

## Pixels, on a live renderer

Own isolated instance (`npm run app:isolated`, port 50300 — the user's :3000 was left alone),
driven with `playwright-cli`. Computed styles read off real elements, not a fake context.

Geometry and type, resting state — each matches what the hand-rolled control had:

| Control | Read back |
|---|---|
| slide-over close | `BUTTON`, 28×28, padding 0, radius 4px, transparent, icon present |
| model-library tag | `BUTTON`, uppercase, weight 400, 11px, tracking 1.54px (= 0.14em), padding `4px 0` |
| library search | real `INPUT`, no background, 0 border, 0 padding, 13px, no inset shadow |
| drawer close | `BUTTON`, 28×28, radius 0, padding 0, **icon pinned at 13px** |
| context-menu row | `BUTTON`, `text-transform: none`, weight 400, 13px, `grid` `18px 1fr auto`, padding `8px 14px` |
| auto-mask tile | `BUTTON`, 56×56, padding 0, 2px frame, radius 4px, `position: relative` |
| queue head button | `BUTTON`, 28×28, radius 0, padding 0, 1px border |
| queue stop action | 26px tall, min-width 80px, padding `0 14px`, heat fill, weight 700, tracking 1.2px |
| engine choice card | `BUTTON`, no uppercase, weight 400, column, left-aligned, canvas fill, heat-45% edge |
| media-picker tab | `BUTTON`, sentence case, weight 400, 13px, padding `8px 14px`, `role="tab"` |
| upload card | `BUTTON`, square, 1px dashed edge, canvas fill, column |
| frame swap | `BUTTON`, `id="swap-btn"` intact, 32×32, radius 0, **between the two frame slots in DOM order** |
| licence link | `BUTTON`, sentence case, weight 400, 11px, padding 0, underlined, frost |
| prompt-box chip remove | 16×16, absolute at `-6/-6`, surface-1 fill, radius 0, `z-index: 5` |
| prompt-box role pill | absolute, surface-0/72% fill, weight 600, 10px, no uppercase; `--end` → heat/82% |
| `@ref` picker row | flex, padding `4px 8px`, 11px, weight 400, left-aligned; active → heat fill |

Wired, not just drawn: the slide-over close **dismissed the panel**; the context-menu row
**fired `onSelect` → `'a'`**; the library search **filtered 236 tiles to 0** on a non-matching
query; a filter tag **flipped `aria-selected`** and kept its `::after` heat dot (`" ●"`);
`chooseLocal` → `backToChoose` **walked the modal choose → setup → choose**; an auto-mask tile
**toggled into `getPicks()`**; and `clearBtn.setDisabled(...)` **greyed the queue's clear button**
on an empty queue.

## The specificity bug this pass actually found

Hovering every converted control (real pointer, not a class swap) caught one regression the
resting-state reads could not: **a bypassed LoRA lost its warn tint on hover.**

The cause is arithmetic, and it is the trap worth remembering: **`:not(:disabled)` contributes
its argument's specificity.** `.mpi-btn.mpi-ibtn.mpi-btn--ghost:hover:not(:disabled)` is
therefore **(0,5,0)**, not the (0,3,1) it looks like — three classes plus `:hover` plus
`:disabled`. Every consumer override that merely "added a class" was tying it, not beating it,
and only won by stylesheet load order. Seven rules were re-scored to (0,6,0) — four classes plus
`:not(:disabled)` — so they outrank it outright: the bypass toggle, the queue head button, the
slide-over close, the drawer close, both ToolOptionsPrompt chips, the media-picker expand and
preview-close, and the prompt-box chip remove.

Re-hovered after the fix, all correct: bypass keeps its warn color-mix; the queue button fills
`--surface-2`; the swap keeps `--surface-1` and turns heat; the thumb clear turns heat with
surface-1 glyph; the slide-over close fills `--surface-3`; the stop action keeps its heat fill
while the cancel stays transparent; the media tiles and upload card keep the canvas fill under a
heat edge; the expand and preview-close chips hold their scrims; the drawer close stays
background-free with an ink-2 edge.

## Deliberate deltas (nothing else changed)

1. **Icon glyphs are sized by the button's size class now** (`.mpi-btn--sm.mpi-ibtn .mpi-icon`
   = 16px), so a few icons move by ~2px from their old hand-set size. Two places that had an
   explicit pin keep it: the drawer close at 13px, and the queue action's `xs` glyph.
2. **Every hover the consumer had is preserved**, including the ones the ghost Primitive would
   not paint. Dropping them would align the app with the ghost vocabulary and delete ~30 lines
   of override — but it is a visual decision, not a lint fix, so it was not taken here.
