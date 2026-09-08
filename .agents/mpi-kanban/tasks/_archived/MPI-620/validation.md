# MPI-620 validation

## The flow itself

Live-run by Fabio on both Klein tiers and with an Anime style LoRA: two clean blank-canvas
generations, a 4B run, and a run seeded from an uploaded sketch. Eight `flowScribble_*` cards
exist on disk in the "Scribble flow" project. Both graphs engine-verified through
`scripts/verify-workflow.mjs` (48188) and `scripts/validate-injection-rules.mjs`.

Two bugs found by those runs were fixed and reproduced before/after in an isolated instance:
clearing a filled media slot broke navigation (sparse-array hole + `Array.find`), and clearing
a slot also discarded the step's declared field values.

## Follow-up 1 — reuse never refuses

Measured in a real renderer, `s_installedModelIds` stubbed, four cases:

| Case | Result |
|---|---|
| recorded 9B, only 4B installed | opens, inputs restored, warning names both tiers |
| nothing installed | opens, inputs restored, `ui:danger` toast |
| recorded tier installed | opens, silent |
| pre-MPI-620 card (nothing recorded) | opens, silent — no guess from weight filenames |

`ui:danger` proven to RENDER, not merely emit: one `.mpi-toast--danger` element, labelled
"Failed". Pinned against regression by `tests/desktop/flow-reuse-opens-without-model.spec.js`,
which asserts the Flow Library is never opened — the guard-clause instinct is what would revert
this.

## Follow-up 2 — the tier is recorded and badged

Badge measured through a real `MpiGalleryGrid` mount of four synthetic cards: `scribble` with
`flowModelIds: ['klein-4b']` → row 1 `FLUX.2 KLEIN 4B`; `character-sheet` (2 choosable slots),
`scribble-object` (0 choosable) and a card with nothing recorded → row 1 suppressed.

Storage proven against real data rather than assumed: Fabio's eight live `flowScribble`
sidecars carry `generationSettings` with exactly the keys `generationService` builds, so the new
key rides the same blob — no route, `projectModel` or migration change.

## Graphics

Loop = t0.1 vs t5.958 MAD **0.82**; ground lift **63.1**; stroke lift **14.2**; style beat
**47.1** — every beat non-zero, which is the positive proof each animates (the `drawbox`/`crop`
traps read 0). crf 26 over crf 23 at PSNR y **41.5 dB**, 1.58 MB → 1.11 MB. Live in an isolated
instance with the project open on the gallery: hero selected BY SRC, `paused:false`, `muted`,
`loop:true`, `currentTime` advancing, `1280x800`, **cssW 444**, poster `flow-scribble.webp`;
both assets **200** at exactly 132,468 and 1,159,205 bytes.

## Suites

`npm test` **739/739**. `npm run test:desktop` **29/29**. `npm run release:check` passed.
`validate_board.py` passed. eslint clean on every touched file.

## Claim audit

11 claims across commits `f9f62c91`, `360cff8a`, `e1e3ec5f` — **11 PROVEN, 0 findings**. The
empirical half of claim 11 disproved the handoff's "flow_scribble.json is pure ASCII" excuse
(six non-ASCII bytes), which is what made the `bench-editing.md` heal worth writing precisely.
