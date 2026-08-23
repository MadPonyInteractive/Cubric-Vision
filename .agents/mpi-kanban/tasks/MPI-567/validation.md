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
| `operation_registry.json` | parses; `flowScribObj` added by hand, never regenerated |
| `npx eslint` on all five | clean |
| **full suite** | `npm test` — **684 tests, 0 fail** |
| new assertions | 4, in `tests/flow-model-choice.test.cjs` |
| **mutation-checked** | four ways: untitle the CLIPLoader → RED; bake a fixture path into `Input_Paint` → RED; drop the picker tier letter → RED; flip the blend recommendation back to 4B → RED. Files restored byte-for-byte, suite re-run clean each time |
| picker disambiguation | both Klein cards are named `FLUX.2 Klein`; the slot now appends the tier letter (9B = B, 4B = L) via the ungated `sizeTierLetter()`. The five SDXL candidates have distinct names and stay bare |

Registered as `flowScribObj` in all four op files at `appVersionIntroduced: '1.5.0'` —
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

## 2026-08-23 — session 10: the prompt, and two closed 05-verify gates

**Automated, all green.** `npm test` → **686 pass / 0 fail** (684 before; +2 new tests).
`node --check js/data/flowsRegistry.js` clean.

**Mutation-checked, not merely green.** Every new assertion was proven to fail on a mutant, each
restored in a `finally` block and verified byte-for-byte by sha256:

| mutant | result |
|---|---|
| `Input_Positive` retitled in `flow_scribble_object.json` | RED — named its own assertion |
| `result: { compare: 'image1' }` deleted from the FlowDef | RED — named `scribble-object` |
| paint step `role: 'image1'` → `'imageX'` | RED — named the MPI-531 role sweep |

`git diff --stat comfy_workflows/` clean against HEAD afterwards, so the mutation run left the
graph untouched.

**What this does NOT verify.** Nothing live. There has been no in-app run since the prompt was
added, and no reuse round trip — that is `05-verify.md`'s Definition of Done and it is still open.
The prompt chain is verified by reading only: field id `positive` → `_collectInputs` top-level run
input → `commandExecutor` ~610 `Input_Positive` → graph node 17 → `StringConcatenate` 18 →
`CLIPTextEncode` 20. Every hop exists; none has been exercised end to end.

**Deliberately not tested.** That `inputSchema.positive` is inert — proving a key is ignored means
asserting on absence across the whole frame, and the reading (`MpiBaseFlow` ~103 is the only
`inputSchema` consumer, and it takes `.media`) is what holds that line.

**Correction, same session — the prompt is declared on ONE surface, not two.**

It was first written on the paint step *and* in the flow's `fields`. That silently drops edits
from the second run onward: gizmo-step fields are role-keyed in `_stepValues[role].fields`, flow
fields live in `_fieldValues`, and `_collectInputs` applies the flow store LAST. A fresh open is
safe (`_seedField` → `undefined` with no `default` and no persisted root, so the key is absent),
but after one run `s_flowInputs` carries `positive` at the payload root, the flow-level copy seeds
from it, and the value typed on the drawing step is overwritten at collection. Wrong picture, no
error, second run only.

Caught by READING, not by a test — and no test here would have caught it either, since it needs a
persisted `s_flowInputs` from a prior run. That is the honest limit of this session's automated
evidence. Reverted to a single declaration; 686 tests still pass. The store unification is
[MPI-606](../MPI-606/) bug 6.

---

## Session 11 — op rename, brush presets, the doodle ghost (2026-08-23)

**`npm test` — 700 pass / 0 fail.** Baseline for this tree is 700, not the 686 the session-10
handoff quotes: MPI-606's untracked `tests/flow-frame.test.cjs` contributes 14. Nothing here adds
a test *case* — the one new assertion lands inside an existing test, so the count is unchanged by
design.

**The op rename `flowScribbleObject` → `flowScribObj`.** Free: `appVersionIntroduced` is `1.5.0`
against a released `APP_VERSION` of `1.4.2`, so no user has a file named after it. Swept SIX
files, not the five the handoff listed — `node --check` on all five JS, `json.load` on
`operation_registry.json`, and a repo-wide grep afterwards returning only two DELIBERATE
historical mentions (the playbook's before/after example and the flow doc's changelog row).

| Evidence | Result |
|---|---|
| `npm test` | 700/700 |
| `node --check` × 7 touched JS files | clean |
| `npx eslint` on both step components | clean, 0 findings |
| repo grep for the old key | 0 live references |

**One new assertion, mutation-checked RED.** `flow-model-choice.test.cjs` now pins that the paint
step and the box step share a `role`. That is the ENTIRE mechanism behind the ghost — the frame
merges gizmo reports per role (`MpiBaseFlow` ~1254), so a split role silently removes the drawing
from `props.value` with every other assertion still green. Mutant: `role: 'image1'` → `'imageX'`
on the box step in `flowsRegistry.js`. Test exit 1 with the new message; file restored inside
`finally` and confirmed byte-identical by sha256
(`485ca3b3df9bf3e100dee20739877af332dbb4a9631b86100ce99aa54d59e021` before and after).

**Live DOM probe — this agent's OWN app instance, never the user's.** `npm run app:isolated` with
`CUBRIC_AGENT_PROFILE` pointed at a fresh directory, because the default agent profile was held by
an orphan from an earlier session and produced the single-instance lock signature (splash
`ERR_FAILED -2`, exit 0, EPERM pruning the profile dir) — which reads as a broken app and is not
one. Instance came up on :58176; killed afterwards by PID-derived ancestry with an explicit refusal
guard if the `:3000` listener appeared anywhere in the tree, and `:3000` confirmed HTTP 200 after.

| Claim | Probe result |
|---|---|
| The ten `BRUSH_PRESETS` render, in order | Hard Round, Soft Round, Feather, Airbrush, Chisel, Calligraphy, Spray, Charcoal, Stipple, Dry Brush |
| The dropdown is WIRED, not just drawn | clicking **Spray** → `getValue().brush === 'spray'`, trigger label → `Spray` |
| The value carries the new key | keys = `brush, brushSize, color, mode, paint, size` |
| The slot is sized, not collapsed | 144px = the 9rem the sheet sets |
| The ghost lands exactly on the photo | ghost rect `(810,17,300,374)` == media rect, `aligned: true` |
| …including under `overflow:'allow'` | stage padding `16px 53px` at the time — the case a bare `top:0;left:0` gets wrong |
| The ghost cannot eat a click, and sits under the handles | `pointer-events: none`, `opacity 0.55`, precedes the overlay canvas in DOM order |
| It is INERT for a flow with no paint step | a box step mounted with no paint value has no ghost node at all |
| The photo really loaded | reported `size {w:512, h:640}`, box seeded to the full frame |

**What this does NOT verify.** Still nothing through a real generation: no live run, no reuse
round trip. The probe mounts the two step kinds directly with synthetic props — it proves the
components, not the flow around them. Whether the ghost is *legible enough* at 0.55 over a busy
photo is an eye judgement, and this card's `**Verify mode:** user-ux` says that is Fabio's.

**Two probe traps that each returned a confident wrong answer first.** `MpiDropdown` PORTALS its
list to `document.body`, so querying inside the mount slot found zero options and read as a
dropdown that renders nothing. And `resolveMediaUrl` rewrites any bare path to
`/project-file?path=…`, so feeding it a static repo path 404s and leaves a zero-sized image —
which surfaced as `w:0 h:0` rects and a `null` box, reading as a broken component rather than a
broken fixture.

---

## Session 11b — the ControlNet mapping, hold-Space pan/zoom, the shared cursor ring (2026-08-23)

**`npm test` — 703 pass / 0 fail** (701 in the tree after MPI-606's commit `c4dacc0c`, plus the
one sweep test added here counted as one case).

### 1. The ControlNet mapping was the app's outlier, and Fabio found it by eye

He reported *"every time I go over a 50 I start getting these lines that look like poop"* and asked
whether the mapping matched the SDXL workflows. It did not, on TWO axes, and only the first had
ever been written down:

| | every other ControlNet workflow | this flow, as shipped |
|---|---|---|
| slider 0-1 maps to strength | 0 - **0.5** | 0 - **1.0** |
| ControlNet released at | **56.9%** of steps | **100%** |

Swept every workflow in `comfy_workflows/`: `t2i_sdxl_realistic`, `t2i_sdxl_nsfw`, `t2i_ill_anime`,
`t2i_ill_anime_beauty`, `t2i_pony_mix` all sit at `0.569`, `chroma_t2i` and `chroma_hyper_t2i` at
`0.57`. `flow_scribble_object` at `1` was the sole exception in the repo.

`js/data/promptControlDefaults.js` and `PromptBoxControls.js` both state the rule outright — the
remap to 0-0.5 exists *"because past ~0.5 those ControlNets artefact"*. So slider 0.50 here was
already **double the app's maximum**, held to the final denoise step. The strength alone makes a
render stiff; holding the steer through the last steps is what stops the model resolving texture
and turns a stroke into a physical ridge, which is the artifact he described.

Fixed to byte parity with `t2i_sdxl_realistic` — node 22 `float` 0.5 -> 1, node 23 `output_max`
1 -> 0.5, node 24 `end_percent` 1 -> 0.569 — in the runtime graph AND its `raw/` twin. The runtime
was edited by INPUT NAME and the raw by widget INDEX, with the index checked against the class's
declared widget order and the two formats re-read and asserted equal afterwards, because a
positionally shifted `widgets_values` is silent and still validates. `graph_parity.py` re-run:
PARITY OK, unchanged.

`FlowDef` default moved 0.5 -> **1**, which is `PROMPT_CONTROL_DEFAULTS.controlStrength`, so the
knob now reads the same at the same number everywhere in the app.

**New guard, mutation-checked twice.** `flow-model-choice.test.cjs` now SWEEPS every workflow
carrying a `ControlNetApplyAdvanced` and asserts `end_percent <= 0.6`, plus `output_max === 0.5`
wherever the chain `MpiFloat Input_Control_strength -> MpiNormalizeValue -> strength` exists. It
also asserts it actually matched the scribble flow and at least six workflows, so it cannot pass by
matching nothing. Two mutants, each restoring the shipped-before value: `end_percent` back to 1,
and `output_max` back to 1. Both exit 1 naming their own assertion; file restored and confirmed
byte-identical by sha256 `490fba3a41e9673d568e37698ea2b9bee1a7f3c2a55894b8fd8b3dca4b673204`.

**NOT verified: where the usable band now sits.** The 0.30-0.60 sweep recorded in the FlowDef was
measured at the OLD mapping (raw strength, `end_percent` 1), so those numbers do not convert to
slider positions any more. The comment is marked historical and the field `note` rewritten to
describe the SYMPTOM rather than quote a number. Re-sweep before quoting one.

### 2 + 3. Hold-Space pan/zoom, and the cursor ring — both were re-inventions

Fabio: *"holding the space bar should give me the same behaviour of zooming in and out and click to
pan, just like we have in the history workspace"* and *"the brush and the eraser have the same
cursor display, which is just a white circle."* Same root: the step hand-rolled three things the
canvas family already owned, which is precisely what its own header forbids for strokes.

- **View** — the hand-rolled `{offsetX, offsetY, scale}` is now `ViewManager`, which brings
  `minScale` (a zoom-out cannot shrink past the fit) and `isManagedView` (a resize stops re-fitting
  once the user has moved the view). Bound the EXISTING `canvas.pan.start` / `canvas.pan.end`
  registry ids, so no hotkey was invented and `hotkeyRegistry.js` — MPI-606's file — went untouched.
- **Ring** — `_drawBrushIndicator`'s two-tone dashed ring and its three colour constants moved into
  `brushDab.js` as `drawBrushRing`, called from BOTH `MpiCanvas` (covering mask, paint and
  composite) and `MpiStepPaint`. `BRUSH_CURSOR_OUTLINE` became unused in `MpiCanvas` by that change
  and was dropped from its import; `BRUSH_CURSOR` stays, the comparison slider draws in it.

Unblocked by MPI-606 commit `c4dacc0c` — Space no longer advances a step, so it can mean pan.
Both `InputController` and this step bind the pan ids and every handler for an id fires, which is
harmless: the workspace canvas only pans on a mousedown ITS container receives, and the flow
overlay takes those.

**REAL-PIXEL PROBE, own instance on :50530, fresh profile** (`:3000` answered 200 after the kill,
which was by PID-derived ancestry with a refusal guard had his listener been in the tree). Both
claims under test are ones a DOM assertion cannot see — what colour the ring is, and whether the
view actually moved — so everything below is counted off `getImageData`, with the two accent
colours converted through a 1x1 canvas rather than by hand (`--accent-heat` is out of sRGB gamut).

| Claim | Measured |
|---|---|
| The ring is heat-pink for the brush | heat 19 px, frost **0** |
| …and frost-blue for the eraser | heat **0**, frost 19 px — a clean flip, so the ring is genuinely tool-coloured |
| The ring hides while Space is held | heat 0 px, canvas cursor `move` |
| …and comes back on release | heat 32 px, cursor back to `''` |
| Space + drag PANS | image bbox x 324 -> 384: **exactly** the 60px dragged |
| Space + wheel ZOOMS | bbox width 250 -> 306 |
| …without touching the brush | brushSize 45 before and after that wheel |
| Wheel is the brush again on release | 45 -> 50 |
| A moved view survives a resize | width 306 -> 307 across a container resize (`isManagedView`) |

**What this does NOT verify.** No live generation on the new mapping — whether the renders are
actually clean at the new default is Fabio's eye and the reason this card is `**Verify mode:**
user-ux`. The probe also mounts the step directly with synthetic props, so it proves the component,
not the flow around it.

**Probe trap worth keeping.** The two-tone ring is DASHED, so it exact-matches far fewer pixels
than a solid one would — 19, not hundreds. A plausible-looking absolute threshold (>50) reported
the ring as broken when it was correct. The assertion that means anything is the RELATIVE flip
between the two tools, not a magic floor.

### Session 11b addendum — B/E hotkeys and the missing MpiClearVram (2026-08-23)

**B / E now arm brush and eraser on the paint step**, bound to `mask.brush.toolbar` /
`mask.eraser.toolbar` — the same ids `MpiMaskStrip` binds, so no hotkey was invented. Routed
THROUGH `_modeRadio.el.setValue()` rather than writing `paint.brushType` directly: `setValue`
emits `select`, so the control and the manager cannot disagree about which tool is armed. A direct
write would swap the brush while the row kept showing the old one. The registry entries carry
`allowWhileTyping: false`, which is what keeps them off the prompt field this step also has. Not
probed live — it is two binds onto an already-probed handler.

**The flow was the ONLY graph in `comfy_workflows/` with no `MpiClearVram`** (Fabio, "in the spirit
of all the other workflows"). Node 170 inserted between the stitch (169) and `Output_Image` (146) —
the same position Head Swap (115) and Outpaint (493) use. Node shape copied verbatim from
`raw/flow_head_swap.json` 115: `passthrough` is type `*` with `shape: 7` on the input, NOT `IMAGE`.

The raw graph is LiteGraph, so this was link surgery rather than a value edit: the EXISTING link
239 keeps its id and is re-targeted `169 -> 170`, a new link 240 carries `170 -> 146`, and
`last_node_id` / `last_link_id` both advance. Re-using the id is what keeps the stitch's own
`outputs[0].links` correct without touching it. Asserted afterwards: both formats agree, all 85
link ids are unique, and every link resolves to a node that exists.

`graph_parity.py` re-run: it correctly FAILED on `146.images` changing from 169 to 170, which is
the deviation detector working as designed. Added to its `ALLOW` with the reason — the bench route
is unchanged and `seamfix` has no reason to know about an app-side VRAM release. PARITY OK after.

**No test added, deliberately.** `MpiClearVram` is NOT universal — 15 graphs lack one (`resize`,
`resize_video`, `remove_background`, the five `nvidia_pid_*`, `image_upscale`, `img_auto_mask`,
both SeedVR2, `Model Merger`, and notably `flow_ltx_extend` / `flow_ltx_foley`). A blanket sweep
would encode a rule that is not true, and a hand-kept allowlist would drift. Flagged for Fabio.

**Noticed, not actioned — a second outlier at the same node.** This flow's `Output_Image` is a
`SaveImage` with `filename_prefix: "mpi567_merged"`; every other flow (`character-sheet`,
`head-swap`, `outpaint`) uses `PreviewImage`. `SaveImage` writes an extra copy into the engine's
own output directory on every run, which nothing collects. It looks like an authoring leftover
rather than a decision, but changing the Output node class is not what was asked for and it
touches how the result is collected, so it is a question for Fabio rather than a quiet fix.

**703 tests pass, 0 fail** after both changes.

---

## Session 13 — the live run + reuse round trip, and the rename (2026-08-23)

**THE 05-VERIFY LIVE GATES ARE CLOSED.** Fabio ran the flow end to end on his own GPU,
seven successful generations (`FLOWSCRIBOBJ_009`–`015`) plus eleven he interrupted, all read
back off the app engine's `/history` rather than taken on trust.

- **Live run — PASSED.** The flow renders and blends. Both control arms work (`line`
  → `ScribblePreprocessor`, `shaded` → `CannyEdgePreprocessor`), confirmed per run in the
  dispatched graph. Base `SDXL_Realistic`, edit `flux-2-klein-9b-int8-convrot`.
- **Reuse round trip — PASSED.** Fabio verified reuse on two different flows; inputs
  restore on reopen.
- **The eleven non-success runs were `execution_interrupted`, not failures** — him hitting
  Stop. No graph error occurred in any of the nineteen dispatches.

**THE CONTROLNET BAND, RE-SWEPT — three points, and the house number finally explained.**
The FlowDef's `0.30-0.60` numbers were historical (measured at `end_percent 1`) and the
ceiling shipped at `output_max 0.5`. Measured live by Fabio:

| raw ceiling | result |
|---|---|
| 0.50 (shipped) | does NOT follow the drawing — subject had to be forced through the prompt |
| 0.65 | overshoots — the doodle itself came through in one generation (ink-as-edges) |
| **0.60** | **shipped.** His call between the two |

`end_percent` stays 0.569; the slider stays 0-1.

**Why 0.5 is the house number, which is the part worth keeping.** It is the minimum safe
ceiling across EVERY control type an SDXL card offers — not just scribble and canny but
**openpose and depth**, and those two set the floor: *"passing 50 starts giving a lot of
issues on open pose and depth"* (Fabio). A t2i workflow puts all of them behind one slider,
so its ceiling must satisfy the weakest.

**This flow may exceed it because its graph cannot reach them.** `flow_scribble_object.json`
hard-wires exactly two banks — `hed/pidi/scribble/ted` (node 14) and
`canny/lineart/anime_lineart/mlsd` (node 15) — behind a two-option radio, and carries no pose
or depth preprocessor anywhere (verified by sweeping the graph). So this is not an exemption
from the rule; the constraint the rule encodes does not reach this flow. Carried as a
**named, mutation-checked exception** in `flow-model-choice.test.cjs`, keyed by filename —
moving the scribble ceiling off 0.6 goes RED, and giving `t2i_sdxl_realistic.json` that same
0.6 also goes RED.

**THE SHADOW PROBLEM IS FRAMING, NOT THE LORA — and the evidence separates them.** Fabio's
first read was that a style LoRA was suppressing the shadow. The graph record says otherwise:
`011` and `012` ran WITH a LoRA and the old prompt, **`013` ran with NO LoRA and the same old
prompt and was still not the good one**, and `015` — the good one — is the only run with the
new prompt ("A full body far shot…"). `013` is the control, and it clears the LoRA.

The mechanism is in the graph. Node `#18 Append Clean Background` bolts
`"…full object in frame, product shot, no scenery, no ground, no shadow"` onto the user's
prompt for the render phase — the render is deliberately told to produce **no shadow**, so
every shadow comes from the blend phase (`#103`, which asks for contact shading). Contact
shading needs a contact point; a prompt like "standing at the beach" gets framed cropped at
the shins, there are no feet, and nothing grounds. `full object in frame` is already in that
suffix and is simply too weak to beat SDXL's portrait-framing prior. **Open, not fixed:**
strengthening `#18` so the flow stops requiring the user to know "full body far shot".

**Shadow DIRECTION is a separate and known limit — do not chase it by prompting.**
`blending-into-a-photo.md` already records that telling the model where the light is makes it
worse, which is why the box step asks for room and never for light direction.
