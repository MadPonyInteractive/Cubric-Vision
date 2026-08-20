# MPI-579 — LTX Video upscaler, the plugin

**Umbrella:** MPI-553, phase 1b — the first CONSUMER of the plugin mechanism.
**Mechanism:** MPI-580, shipped and verified (`0a18c242`). **Second consumer waiting:**
MPI-557 (Video Face Detailer adopts this plugin). **Later:** MPI-578 re-bases onto the
LTX 2.5 upscalers; v1 ships on 2.3 — Fabio's call.

**Verify mode:** `user-ux` — the entry, its controls and the upscale itself are hand-feel
surfaces. The workflow half self-verifies (`/object_info` schema gate + a real generation),
but the card closes on Fabio's eyes in the History video workspace.

## Current State

**2026-08-19 — nothing built yet. This plan is the first artifact.** The card description
is thorough and current; it is not restated here, only corrected and extended where
orientation found something it could not know.

**Phases 0–5 are DONE and green (630/630).** The workflow runs in the app: 73 frames,
1436x808 -> 2816x1600, 375s, peak 15724 MB under `--lowvram`, **audio intact**. The op,
the `ltxSigmas` injector and the PluginDef are wired. Evidence for every phase is in
`validation.md`.

**The Library row is DONE (2026-08-20).** `_pluginTile` aggregated over `requiredDeps`
alone and rendered `Install ()`; it now sizes, installs and reports progress over every
key the plugin installs under — `requiredModels` ∪ its own deps — ported from
`MpiFlowLibrary`'s `_installKeys` / `_installMissing` / `_installProgress`. Measured live:
the row reads **39.0GB / Installed**, and Uninstall is gated on the plugin owning deps
(a plugin that runs on a MODEL has nothing of its own to free). 630/630, ESLint clean.
Evidence: `validation.md` § The Library row.

**Phase 6 PASSED (2026-08-20).** Fabio: *"The upscale was successful in the History Workspace."* Every phase of this card is green; what is left is close-out (`mpi-end-session`), which also closes MPI-580 and MPI-568.

**His eye caught a defect that is NOT this card's** and it is now MPI-582: the declared-field renderer hand-rolled bare inputs, so the two sliders drew as Chromium's native range widget. At his instruction the SLIDER and TEXT branches were fixed in this session - `buildField` mounts `MpiProgressBar` and `MpiInput` - and he confirmed the result on screen. The rest of MPI-582 (select/toggle/number, the longhand range sweep, the Flow audit, the doc fix) is his next session.

**(superseded) Next action was: Phase 6 is with FABIO.** Everything machine-checkable passed in my own
`app:isolated` instance (`READY http://127.0.0.1:57009`, `:3000` untouched):
`upscalePluginsFor('video')` returns the plugin and `('image')` returns nothing, the three
declared fields are exactly the spec, and the defaults split to
`Input_Denoise 0.675` / `Input_Prompt_Strength 1`. What is left is his eyes on the
History video workspace — the dropdown entry, the controls revealing, Upscale Factor
hiding, and one real upscale with its audio.

Two things NOT to redo, both expensive to relearn: the GC declaration (`validation.md`
§ RESOLVED — listing the tier's weights breaks MPI-258 B1, and the obvious cure is the
MPI-310 weight-destroying gate), and the VRAM headroom (`validation.md` § Phase 5 —
656 MB spare on an idle card, and the desktop can eat that).

MPI-580 gives us, already in `master`:
- `PluginDef.upscale { kinds, label, fields }` → an entry in the EXISTING History upscale
  dropdown, value `plugin:<id>`, listed only when `pluginAvailability().installed`.
- The declared-field renderer at `js/utils/declaredFields.js`, `mapTo: [lo, hi]` applied at
  PAYLOAD time, and `splitDeclaredValues` enforcing the one routing law.
- The `plugin:` branch in `MpiGroupHistoryBlock._handleApply` (`:594`) already resolving the
  plugin, splitting values and calling `_runVideoTool(plugin.operation, injectionParams, inputs)`.

So this card writes **no UI mechanism**. It writes a registry entry, an op, a workflow, and
one measurement.

## THREE CORRECTIONS TO THE CARD — read before building

### 1. Audio pass-through is NOT unbuilt. It is one wire in the app.

The card says *"AUDIO PASS-THROUGH IS OWED HERE and it is UNBUILT, not merely untested"*.
That is true of the BENCH only, and for a reason that does not survive the port: the bench
loads with `VHS_LoadVideo`, which is video-only.

**The app does not use VHS.** `MpiLoadVideo` (`c:\AI\Mpi\ComfyUi-MpiNodes\video.py:175`)
returns `(images, audio, fps, frame_count, duration, width, height, has_audio)` and
`MpiSaveVideo` takes `audio` / `fps` / `use_audio`. `comfy_workflows/video_upscale.json`
already wires exactly that — node `757` → `756` on pins `1`, `2`, `7`. Copy that wiring and
audio pass-through is done, satisfying Fabio's "whatever comes in goes out" for free.

**It still needs proving, not assuming**: the bench never ran a clip with audio through this
graph, and the sampler round trip is on the VIDEO branch only, so the audio it re-attaches
is the untouched source track. That is the intended behaviour, and Phase 5 verifies it on a
real clip with sound.

### 2. The sigma SCHEDULE is a single scaling law — recovered, not re-derived.

The card specifies `denoise UI 0-1 → sigmas 0.50-0.85`. `sigmas` is not a float: it is
`ManualSigmas`' whole schedule string. MPI-568 ran its arms with hand-written schedules that
differ in step COUNT and SHAPE (`s015`/`s030` are 2-step, `s050` is 3-step at a 0.60 second
rung, `s085` is 3-step at 0.853), so "map a slider onto 0.50–0.85" was undefined between the
rungs.

**MPI-568 answered it and the answer is `A — same shape, lower start`** (plan.md § THE LADDER
IS NOT ONE PARAMETER, and the rung table that closes it). Every rung Fabio judged was the
shipped 0.85 schedule SCALED:

| rung | schedule | = s × (1, 0.852941, 0.496353, 0) |
|---|---|---|
| 0.600 | `0.6000, 0.5118, 0.2978, 0` | ✓ |
| **0.675** | `0.6750, 0.5757, 0.3350, 0` | ✓ (the default) |
| 0.750 | `0.7500, 0.6397, 0.3723, 0` | ✓ |
| 0.850 | `0.8500, 0.7250, 0.4219, 0` | ✓ (the shipped LTX schedule) |

So the app builds the string from ONE float `s`:

```
s,  0.852941·s,  0.496353·s,  0        (ratios are 0.7250/0.85 and 0.4219/0.85)
```

The shape confound was measured and is worth ~13% of the start-sigma gap, which is why the
slider is well defined as a single continuous control. **The 3-step `s050` schedule Fabio
approved in the ship watch is NOT the one the slider produces at 0.50** — the slider produces
`0.50, 0.4265, 0.2482, 0`. Same start, 0.85's shape, and the shape control (`cb_s050shape`)
is exactly that arm; it measured 1.209 from `cb_s050`, the same magnitude as changing
nothing. Stated here so nobody later reads a mismatch as a wiring bug.

### 3. The proven bench graph survives on disk — port it, do not re-derive it.

`C:\Users\Fabio\AppData\Local\Temp\claude\c--AI-Mpi-Cubric-Vision\e9f7dc25-31bc-42c2-bfff-8c95ae748b48\scratchpad\build_v2v.py`
— 21 nodes, the exact ship configuration:

- `img_compression = 0` (the shipped graph's 18 is for conditioning images and degrades a v2v input)
- **no `LTXVAddGuide`** — CLOSED NEGATIVE. *"The guide IS the source"*: it carries no
  information the upscale lacks, so it can only pull the result back toward source sharpness.
  There is no guide strength that buys 0.85's look with the right person.
- **no temporal upsampler** — closed negative (the wavy distortion, ~2× amplified by it)
- `euler_cfg_pp`, `cfg` on node `33` (`CFGGuider`), sigmas on node `42` (`ManualSigmas`)
- the AV latent is mandatory: `LTXVEmptyLatentAudio` of matching frame count →
  `LTXVConcatAVLatent` → sampler → `LTXVSeparateAVLatent` before decode. A video-only latent
  is not a legal input to the LTX 2.3 transformer.

Copy the file into this session's scratchpad before touching anything — it is in another
session's temp directory and is not durable.

## THE ONE OPEN DECISION — which transformer the plugin declares

bf16 is **39.13 GB** (`ltx23-transformer-bf16`, the HIGH tier); int8_convrot is **20.03 GB**
(`ltx23-transformer-int8`, the BALANCED tier). The card's claim that *"any user with LTX
installed already holds every weight this needs"* is only true for the tier whose transformer
the plugin names — every other LTX weight this graph touches (video VAE, audio VAE, text
projection, gemma CLIP, spatial upscaler) is in BOTH tiers' `dependencies`.

`ltx_i2v_t2v.json` and `ltx_i2v_t2v_int8.json` differ in **exactly one field** — node `4`'s
`unet_name`. So this is a one-string fork, not two graphs.

**Decision: BALANCED, and declared as a MODEL rather than as its weights.** The `ltx-foley`
precedent turned out to be the whole answer, not just the tier choice: it declares
`requiredModels: ['ltx-23-balanced']` and **no** `requiredDeps`, because it runs entirely on
the tier. So does this plugin.

**Listing the six weights instead was tried and is WRONG — see `validation.md` § RESOLVED.**
It broke MPI-258 B1 (a plugin's deps are protected unconditionally, so the five shared LTX
support weights became unreclaimable), and the obvious cure — protect only while every dep is
present — is the `fullyInstalled` gate that MPI-310 proved destroys weights. Both circularities
are in `docs/download-manager.md` § exclusive deps. Do not re-derive this; do not re-propose it.

Consequence, stated once: a HIGH-tier-only user sees the plugin as not installed and is offered
the Balanced tier. That is Fabio's rule applied honestly.

**Not doing:** injecting `unet_name` per installed tier. It would need an availability gate
meaning "either tier", and inventing one is mechanism work MPI-580 deliberately closed.

## Design

### The plugin (`js/data/pluginsRegistry.js`)

```js
{
    id: 'ltx-video-upscaler',
    title: 'LTX Video upscaler',            // Fabio's name, verbatim
    description: '…',
    requiredDeps: [
        'ltx23-transformer-int8', 'ltx23-video-vae', 'ltx23-audio-vae',
        'ltx23-text-projection', 'ltx23-gemma-clip', 'ltx23-spatial-upscaler',
    ],
    operation: 'ltxVideoUpscale',
    upscale: {
        kinds: ['video'],
        label: 'LTX Video upscaler',
        fields: [
            { id: 'positive', type: 'text', rows: 3, label: 'Prompt', default: '', placeholder: '…' },
            { id: 'Input_Denoise', type: 'slider', label: 'Denoise',
              min: 0, max: 1, step: 0.01, default: 0.5,  mapTo: [0.50, 0.85] },
            { id: 'Input_Prompt_Strength', type: 'slider', label: 'Prompt strength',
              min: 0, max: 1, step: 0.01, default: 0,    mapTo: [1, 3] },
        ],
    },
}
```

Both sliders come from the card verbatim. **Do not re-derive them and do not restore the
overruled cfg-3 default** — Fabio: *"1.0 is the correct call… Most upscaling jobs do not want
too much change anyway."* An upscale is a fidelity job by default; steering is opt-in.

`positive` is a bare id, so it reaches the op as a run input and `_buildParams` turns it into
`Input_Positive`. `Input_*` ids go to `injectionParams`, whose keys ARE node titles verbatim
(`commandExecutor.js:655`). **The default prompt must be EMPTY** — MPI-568's most expensive
finding is that the graph's own default positive (`"natural skin texture, freckles, sharp
eyes"`) was ordering the artifact every downstream dial was built to remove, confirmed by eye
as moles on flat cheek skin. A neutral placeholder is copy, never a value.

### The op (`js/data/commandRegistry.js` + `universal_workflows.js`)

`ltxVideoUpscale`: `mediaType: VIDEO`, `requiresVideo: 1`, one `inputVideo` media input
titled `Input_Video`, `promptRequired: false`, `universal: true`, workflow
`ltx_video_upscale.json`. Modelled on `videoUpscale` (`commandRegistry.js:842`).

**One wrinkle worth naming:** a `universal` op's deps are the universal set (custom nodes +
`engineAsset` weights), and this op needs MODEL weights that are not in it. The plugin's
availability gate is what covers that, and it is the same shape `imageDescribe` already has —
a universal op whose real weight is owned by a plugin. Verified in Phase 3, not assumed.

### The workflow (`comfy_workflows/ltx_video_upscale.json`, new)

`build_v2v.py` with the app's I/O and control surface substituted:

| bench | app |
|---|---|
| `VHS_LoadVideo` | `MpiLoadVideo` titled `Input_Video` → images/audio/fps/frame_count/width/height |
| `VHS_VideoCombine` | `MpiSaveVideo` titled `Output_Video`, `audio`/`fps`/`use_audio` from the loader |
| literal `width`/`height` | from the loader, through `ImageResizeKJv2 divisible_by: 32` (as the bench) |
| literal `frames` | derived from `frame_count`, trimmed to the largest legal `8n+1` |
| literal `prompt` | `MpiText` titled `Input_Positive` (+ `Input_Negative` carrying the bench NEG string as its default) |
| `seed` literal | `MpiInt` titled `Input_Seed` (`_buildParams` fills it every run) |
| `cfg: 1` on node 33 | `MpiFloat` titled `Input_Prompt_Strength` |
| `sigmas` string on node 42 | see below — the one unresolved wiring question |

**8n+1 and /32.** Dimensions are already handled by the bench's own
`ImageResizeKJv2(divisible_by: 32)`. Frames are not: a user's clip has an arbitrary count, so
the graph must trim to `floor((n-1)/8)*8+1` via `MpiMath` + `MpiListRange` (which is already
how the shipped LTX graph drops a frame, node `485`), and the SAME count must reach
`LTXVEmptyLatentAudio.frames_number` or the AV concat is illegal.

**How one float becomes the schedule string — DECIDED in Phase 1, on schema evidence.**
`ManualSigmas` takes one plain STRING widget (`{"sigmas": ["STRING", {"multiline": false}]}`,
no `forceInput`), so the title injector can write it directly.

**Route: an op-local injector.** `commandRegistry` already supports `injector:` and
`js/services/workflowInjectors/index.js` is a two-line registry (`resize`, `headSwap`); an
injector is `{ inject(workflow, injectionParams), consumes: [...] }` and `commandExecutor`
deletes only the keys it declares it consumed (`:1591`, MPI-306). So:
`ltxSigmasInjector` consumes `Input_Denoise` and writes `s, 0.852941·s, 0.496353·s, 0` onto
the node titled `Input_Sigmas`. ~15 lines, no new graph nodes, and the one piece of
LTX-specific arithmetic sits next to the MPI-568 evidence that produced it.

**Building the string inside the graph is CLOSED, and not on elegance.** It needed
`MpiMath` → `MpiConvert` per step, and `MpiConvert.round` **defaults to `true` / "up"** —
`0.675, 0.5757, 0.3350, 0` would leave that chain as `1, 1, 1, 0`, with no error, producing
a plausible video that is wrong. Evidence in `validation.md` § Phase 1.

## Phases

**Phase 0 — recover the bench graph.** Copy `build_v2v.py` into this session's scratchpad.
**Verify:** the file is readable here and its 21 nodes match what this plan quotes.

**Phase 1 — the schema gate and the sigma route.** Probe `/object_info` for `ManualSigmas`,
`MpiLoadVideo`, `MpiSaveVideo`, `LTXVLatentUpsampler`, `LTXVEmptyLatentAudio`,
`LTXVConcatAVLatent`, `LTXVSeparateAVLatent`, `LTXVPreprocess`, `MpiListRange`, `MpiMath`.
Pick the sigma route on what the schema actually says.
**Verify:** every class exists with the pins this plan assumes, and the chosen sigma route is
recorded in `validation.md` with the `/object_info` evidence. A route picked from memory is a
fail.

**Phase 2 — the workflow.** Author `comfy_workflows/ltx_video_upscale.json`. Frame trim,
/32 fit, AV latent, audio pass-through, the four injectable titles.
**Verify:** `POST /prompt` on the app engine with a real short clip WITH AN AUDIO TRACK
completes; ffprobe the output for 2× dimensions AND a surviving audio stream. Not "the graph
validates" — MPI-465/467 exist because validation passes the bug this catches.

**Phase 3 — the op.** `commandRegistry` entry + `UNIVERSAL_WORKFLOWS` mapping + progress
stages + the op-local injector if Phase 1 chose route 2.
**Verify:** `npm test` green, and the op dispatches from a scratch call with the params
landing on the right node titles (diff the dispatched graph out of Comfy `/history` — it
holds what the app really injected).

**Phase 4 — the plugin.** The `PluginDef` above; `js/components/types.js` if a typedef moves.
**Verify:** `node --test tests/plugin-dep-gc.test.cjs` still green (the new plugin must change
no protection behaviour), and `pluginAvailability()` reads installed on a machine with the
Balanced tier.

**Phase 5 — the in-app VRAM measurement. THIS IS A GO/NO-GO, not a footnote.** The bench
peaked at 15163–15898 MB of 16380 (97%) on a **NORMAL_VRAM** ComfyUI with the **int8**
transformer; the app runs `--lowvram`. No MPI-568 number is an app number. Measure the real
peak in `npm run app:isolated`, with the app engine loaded, on both source classes, and on a
clip longer than the 121 frames the bench ever ran in one pass.
**Verify:** a peak-VRAM table in `validation.md` and an explicit verdict — runs in the app /
runs only with models unloaded first / does not run. If it does not run, STOP and brief Fabio
before designing any UI around it; the entry is worthless if selecting it OOMs.

**Phase 6 — the end-to-end user check (`user-ux`).** Own instance only, never `:3000`.
**Verify, in front of Fabio:** the entry appears in the History **video** upscale dropdown
and NOT the image one; selecting it reveals the prompt box and both sliders and HIDES Upscale
Factor; both sliders read 0–1; a real upscale runs end to end; audio survives; and the output
looks right at the default 0.5 (sigma 0.675).

## Files

`js/data/pluginsRegistry.js` · `js/data/commandRegistry.js` ·
`js/data/modelConstants/universal_workflows.js` · `comfy_workflows/ltx_video_upscale.json`
(new) · `js/components/types.js` · progress-stage table (located in Phase 3, not guessed here)

**Not touched, deliberately:**
- `js/data/modelConstants/models.js` — a live peer session owns it (MPI-504). The plugin adds
  no ModelDef and needs no tier edit.
- `js/components/Organisms/MpiBaseFlow/MpiBaseFlow.js` — dirty in the tree with an
  uncommitted flow video-hero change belonging to another session.
- `js/utils/declaredFields.js`, `MpiToolOptionsUpscale/*`, `MpiGroupHistoryBlock.js` — MPI-580
  shipped them. If this card needs to change one, that is a mechanism gap and gets said out
  loud, not patched here.
- `js/data/modelConstants/assetDeps.js` / `modelDeps.js` — nothing to author. Every weight is
  already declared, already on R2, already in both LTX tiers.

## Not this card

The Flow twin. Fabio, 2026-08-19: Flows are the surface for users who cannot drive the rest of
the UI, so capabilities ship TWICE on purpose — and his ordering is **History workspace video
first**. An agent finding this capability in two places later must not "fix" it by deleting
one. MPI-557 (Video Face Detailer) is the Flow that consumes this plugin, and it is blocked on
this card, not folded into it.
