# MPI-584 Validation

`Verify mode: user-ux`. Everything below the "Owed to Fabio" line is code + live-render
evidence gathered on my own isolated instance; the real upscale run and the graphics are
his.

## What this card actually built

One `FlowDef` and one test case. The op (`ltxVideoUpscale`, universal, injector
`ltxSigmas`), the graph (`ltx_video_upscale.json`, 29 nodes) and both registry mappings
already existed and were verified by MPI-579, so no op was registered, nothing was
version-bumped, and no dep entry was authored.

| file | change |
|---|---|
| `js/data/flowsRegistry.js` | `ltx-upscale` FlowDef — 4th flow |
| `tests/inject-params-titles.test.cjs` | title pin for `ltx_video_upscale.json` (covers BOTH surfaces — MPI-579 shipped the plugin without one) |
| `docs/playbooks/add-flow/existing-flows/ltx-upscale.md` | the flow's own playbook page |

## Phase 1 — automated — PASS (2026-08-20)

- `node --check js/data/flowsRegistry.js` clean; `npx eslint js/data/flowsRegistry.js` clean.
- `npm test` — **631 tests, 631 pass, 0 fail**, including the new title pin and the
  MPI-531 sweep (a step role must be supplied by `inputSchema.media` — vacuous here, no steps).
- `npm run release:check` — passed.

## Phase 2 — live render on my own instance — PASS (2026-08-20)

`npm run app:isolated` on :51691 (never the user's :3000), driven with playwright-cli.

**Registry + availability**, read out of the live module:

```
{found:true, title:"Upscale Video", op:"ltxVideoUpscale", roles:["inputVideo"],
 fields:["positive:text","Input_Denoise:slider","Input_Prompt_Strength:slider"],
 av:{available:true, missing:[], missingDeps:[]}}
```

Available with `ltx-23-balanced` installed and **nothing else** — which is the whole point
of declaring no `requiredDeps`.

**Every declared field mounts an app Primitive** (MPI-582's law). Classes present on the
run slide: `mpi-input` / `mpi-input__field--textarea` (the prompt) and two `mpi-progress`
sliders. The only bare `input`/`textarea` elements in the subtree are the ones INSIDE those
components (`mpi-input__field`, `mpi-progress__input`) — no native widget got through.

**The mapping lands on Fabio's numbers**, computed by the shipped declarations through
`mapDeclaredValue` and then `ltxSigmasInjector` against the real workflow file:

```
positive: ""            Input_Denoise: 0.675       Input_Prompt_Strength: 1
Input_Sigmas -> "0.6750, 0.5757, 0.3350, 0.0000"
```

UI 0.5 → sigma 0.675 → the mid-range schedule; UI 0 → cfg 1, the no-guidance end. Empty
prompt.

**Empty-run guard fires** with the flow's own copy: pressing Generate with no clip gives
"Upscale Video needs at least one input before it can run." (The op also declares
`inputVideo` as a REQUIRED slot, so `_findMissingMediaSlot` is a second net at enqueue.)

**The tile survives its missing art.** `flow-ltx-upscale.webp` does not exist yet and the
Flow Library renders the tile as a clean gradient placeholder with a `✓ READY` badge — no
broken-image glyph, no layout hole. Screenshot taken; library now reads "4 ready · 0 need
models".

## Owed to Fabio — this card is NOT closeable yet

1. **A real upscale through the Flow.** Deliberately not run by me: the isolated instance
   shares `APP_DOCUMENTS`, so a completed flow run would commit a card into a real project,
   and the graph peaks ~15.4 GB of a 16 GB card — firing it while his app holds models is
   how you get an OOM in someone else's session. The graph itself already ran end-to-end on
   the app engine in MPI-579 Phase 2 (25 frames, 2816x1600, audio stream survived); what a
   live Flow run adds is the `mediaItems → inputVideo` hop and the gallery commit.
2. **The two preview assets** — `flow-ltx-upscale.webp` (4/5 tile) + `flow-ltx-upscale.mp4`
   (wide hero), via `/mpi-flow-graphics`. Both must be cut from a real run of THIS flow, so
   they are blocked on (1).
3. **A decision on the VRAM cap.** No cap shipped: the graph exposes no knob to cap, so it
   needs a new node plus a control — its own card. The description carries the warning
   instead ("Short clips first…"). Numbers: 12752 MB at 25 frames, 14721 MB at 73, on a
   16380 MB card.
4. **The dev gate.** This is the 4th flow, and the gate was set to stay "until ≥4 flows
   exist (user decision)". His call, not mine.
