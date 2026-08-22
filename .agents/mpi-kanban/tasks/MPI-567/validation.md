# MPI-567 — validation

## The `paint` step kind (2026-08-22, session 6)

Static: `node --check` clean on all six touched JS files; `npx eslint js/components/Organisms/MpiStepPaint/ js/components/Organisms/MpiBaseFlow/` clean.

Live: driven in **my own isolated instance** (`npm run app:isolated`, `http://127.0.0.1:58669` —
never the user's port), through a temp module served off the app that mounted `MpiStepPaint`
standalone on a synthetic **1200×800** photo and dispatched real mouse events at the component's
own listeners. Measurement is the alpha bbox + the OPAQUE-PIXEL COUNT of the exported PNG, because
a bbox alone cannot tell a restored stroke from a differently-shaped one. Probe deleted afterwards
(`js/__probe_mpi567.js`), instance killed by the PID launched, `:58669` confirmed gone.

### Mount

| check | result |
|---|---|
| reported `size` | `1200 × 800` — the SOURCE's natural size |
| `paint` with nothing drawn | `null` |
| stage canvas / fit | `1198 × 329`, scale `0.39125`, offset `364.25, 8` |
| controls | 2 mode buttons + colour picker + `Undo` (disabled) + `Clear` |
| **bare form controls** | **0** (`input[type=range]`, `select`, `textarea`) |
| canvas cursor | `none` (the brush ring is the cursor) |

### Strokes, undo, clear — the Ctrl+Z contract

| step | opaque px | alpha bbox |
|---|---|---|
| stroke 1 (image px 300,300 → 750,340; brush 40) | **19529** | `278,279 490×81` |
| stroke 2 (300,600 → 600,610) | **32893** | `278,279 490×359` |
| **Undo** | **19529** | `278,279 490×81` — byte-exact restore of stroke 1 |
| **Clear** | **0** | — |
| **Undo after Clear** | **19529** | `278,279 490×81` |

The bbox matches the drawn geometry to within antialias (a 40px brush from (300,300) to (750,340)
predicts `280..770 × 280..360`). Each mutation reported exactly once: 1 report on mount, then
2 · 3 · 4 · 5 · 6.

### The file the graph would run on

`composePaintLayer(value)` → `paint.png`, `image/png`, **42392 bytes**, **1200 × 800**, **19529**
opaque px, same bbox. The LAYER ALONE at SOURCE resolution — not the composite, not the layer's
own working size.

### Reuse

A second, fresh mount seeded with the reported value restored **19529** px at the identical bbox,
plus `color` and `mode`. That is the Reuse path with no frame change.

### Empty

After a final Clear: `paint: null`, `composePaintLayer` → `null`, `Undo` still enabled (the Clear
itself is undoable).

### Wheel sizing + the eraser branch

| check | result |
|---|---|
| wheel up ×4 from 40 | `60` (5 per tick, matching `InputController`) |
| wheel down ×20 | `2` — clamped at MIN |
| wheel up ×200 | `400` — clamped at MAX |
| stroke at brush 40 | `25274` px |
| switch to eraser → stroke across it | `21297` px (3977 erased) |
| **Undo the erase** | **`25274`** — exact restore |

### Teardown

`el.destroy()` on both instances, hosts removed, nothing left in the DOM.

## The graph rebuild onto the LanPaint route (2026-08-22, session 9)

`raw/` was authored by script and the runtime twin converted from it with
`COMFY_URL=http://127.0.0.1:48188 node scripts/workflow-to-api.mjs`, against the APP ENGINE as
`docs/workflow-authoring/converters.md` requires (LanPaint is on 48188 now; the handoff said it was
not). The structural checks below ran without a GPU; the live run in § Live run used one.

| check | result |
|---|---|
| node count, both copies | **70 → 55** (25 deleted, 10 added) |
| new route present | `MpiBox` 1, `MpiBoxMask` 1, `InpaintCropImproved` 1, `GrowMaskWithBlur` 1, `SetLatentNoiseMask` 1, `FluxGuidance` 1, `LanPaint_KSampler` 1, `InpaintStitchImproved` 1 |
| relight tail gone | `ImageBlend` 0, `ThresholdMask` 0, `MaskComposite` 0, `CFGGuider` 0, `SamplerCustomAdvanced` 0, `Flux2Scheduler` 0, `RandomNoise` 0, `KSamplerSelect` 0, `GetImageSize` 0, `ImageBlur` 0 |
| stage 1 intact | nodes 1–35 untouched; the 2 surviving `ImageCompositeMasked` are `Paint On Flat` and `Stitch` |
| **parity vs `seamfix.build(feather=96)`** | **PARITY OK** — every node class and every input matches, links included |
| orphans | none — all 55 reachable from an OUTPUT node |
| LiteGraph integrity | 84 links, every back-reference consistent, no dangling ids, every new socket wired |
| workflow-reading tests | 10 files, **53 assertions, 0 fail** |

The parity check is `research/lanpaint/graph_parity.py`. It imports `seamfix` and calls `build()`
in-process rather than comparing against a transcribed copy, so it cannot drift from the wiring
that was actually measured. **Re-run it after any edit to this graph** — a positionally shifted
`widgets_values` entry is silent (the converter shifts every later value and ComfyUI still
validates), and this is the only check that catches it.

Deviations from `build()` are declared in that script's `ALLOW` list, not left implicit:

| deviation | why |
|---|---|
| stamped image is node 35's output, not a baked path | stage 1 makes it in-graph |
| box mask is `MpiBoxMask(Input_Box)`, not a baked PNG | the `box` step supplies the rect |
| `LanPaint_KSampler.seed` ← `Input_Seed` (26) | what the deleted `RandomNoise` did |
| node 106 `ImageScaleToTotalPixels` kept | proven no-op (`resolution_steps: 16` snaps 1024² back to 1024²) — dropping it is a change with no benefit |
| prompt from `MpiText` 103 | asserted equal to `seamfix.BLEND_PHYSICS2` verbatim |
| `SaveImage` prefix | the flow keeps its own `Output_Image` |

### Live run — the shipped twin's own stage 2, pixel-identical to `f096`

GPU authorized by Fabio for one short window. `research/lanpaint/graph_liverun.py` pulls stage 2
**out of `comfy_workflows/flow_scribble_object.json` itself** (not a hand-copy), repoints node 35's
stamped composite at the fixture seamfix used, sets `Input_Box` to the same auto box and
`Input_Seed` to seamfix's `134002004938138`, and compares against session 8's `f096` output on disk.

| plate | secs | vs `mpi567_sf_f096_<plate>` |
|---|---|---|
| sun | 24.1 (cold) | **mean abs 0.0 — max 0, 0 px differ** |
| overcast | **16.0** (warm) | **mean abs 0.0 — max 0, 0 px differ** |

16.0s warm is session 8's 16.1s. Confirmed a second way, offline and without the GPU:
`ImageChops.difference(...).getbbox()` returns `None` on both pairs.

**Gate on PIXELS, never bytes.** ComfyUI bakes the dispatched prompt into a PNG `tEXt` chunk, so
two files holding the same picture hash differently the moment node ids differ — which they do
here by construction. The first run's `DIFFERS` on the sha alone read as a failure and was not one;
`graph_liverun.py` now gates on the pixel diff and says why in its docstring.

Stage 1 was deliberately not re-run: this rebuild did not touch nodes 1–35, and they were proven on
the bench in session 7 (~18s cold / ~9s warm, three runs).

### NOT verified here

- **Stage 1 has not been re-run** since the rebuild. It is untouched (nodes 1-35) and was proven
  in session 7, but no single dispatch has yet carried a drawing all the way to a blended photo.
  That happens at the flow's first live run.
- The seam numbers behind `f096` (worst `cnr` 0.85 → 0.15) are session 8's, measured through the
  python runner. Nothing here re-measures them; this validates that the graph carries that wiring.

## The app half — op, FlowDef, two model slots (2026-08-22, session 9)

Static only; the flow has not yet been opened in a running app.

| check | result |
|---|---|
| `node --check` | clean on `flowsRegistry.js`, `commandRegistry.js`, `operationRegistry.js`, `universal_workflows.js`, the test |
| `operation_registry.json` | parses; `flowScribbleObject` added by hand, never regenerated |
| `npx eslint` on all five | clean |
| **full suite** | `npm test` — **684 tests, 0 fail** |
| new assertions | 4, in `tests/flow-model-choice.test.cjs` |
| **mutation-checked** | four ways: untitle the CLIPLoader → RED; bake a fixture path into `Input_Paint` → RED; drop the picker tier letter → RED; flip the blend recommendation back to 4B → RED. Files restored byte-for-byte, suite re-run clean each time |
| picker disambiguation | both Klein cards are named `FLUX.2 Klein`; the slot now appends the tier letter (9B = B, 4B = L) via the ungated `sizeTierLetter()`. The five SDXL candidates have distinct names and stay bare |

Registered as `flowScribbleObject` in all four op files at `appVersionIntroduced: '1.5.0'` —
matching the four sibling flow ops in this dev cycle, not the released `APP_VERSION` 1.4.2.

**Two choosable slots, both Fabio's call (2026-08-22):** `Render model` over all five SDXL ids,
`Blend model` over `klein-4b` / `klein-9b`. Recommendations `sdxl-realistic` / `klein-4b` — 4B is
what every measurement on this card was taken against.

**The blend slot swaps TWO nodes.** 9B needs `qwen_3_8b_int8_convrot` and 4B needs `qwen_3_4b`;
the mismatch dies with a shape error that reads as a LanPaint bug (MPI-600). Node 100's CLIPLoader
was untitled, so it was retitled `Input_Edit_Clip` and each arm carries both weights. Its param is
the dotted `Input_Edit_Clip.clip_name` because `clip_name` is NOT on `comfyController._inject`'s
spray list while `ckpt_name` and `unet_name` are — a plain key would match the node and write
nothing. That asymmetry is the thing the mutation check protects.

**The no-drawing case fails closed structurally**, not by app code: both `MpiLoadImageFromPath`
loaders bake `string: ''` with `block_if_empty: true`, which returns an `ExecutionBlocker`. Pinned,
because it is a baked value and nothing about editing the graph defends it.

### NOT verified — the app half has never run

- **No live run and no reuse round trip.** That is `05-verify.md`'s Definition of Done and it is
  still open. Needs the GPU and a `npm run app:isolated` instance.
- **`preview` / `video` are declared and the files do not exist** — `flow-scribble-object.webp`
  and `.mp4` come from a later `/mpi-flow-graphics` pass, so the Library tile shows a broken image
  until then.
- **The box step's default is the whole image**, which for this flow is the measured worst case
  (everything inside the box is re-rendered). The auto-seed from the drawing's bbox is designed and
  NOT built — it is a new shared-frame contract. See `docs/playbooks/add-flow/existing-flows/scribble-to-object.md`
  § OPEN.

## Still open across the whole card

- **The flow has never RUN.** It is fully registered as of session 9 — op, FlowDef, slots, steps,
  fields, tests — but no dispatch has gone through it inside the app. The card's own Definition of
  Done (a live run + a reuse round trip, `docs/playbooks/add-flow/05-verify.md`) is what closes it.
- `mediaRole`'s append path was read and reasoned, not executed — it needs a flow declaring two
  media roles, which is the wiring step.
