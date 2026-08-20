# MPI-579 Validation

`Verify mode: user-ux`. The workflow half self-verifies (schema gate + a real
generation with ffprobe on the output); the card closes on Fabio's eyes in the
History video workspace.

## Phase 0 — the bench graph recovered — PASS (2026-08-19)

`build_v2v.py` copied out of the previous session's temp directory into this
session's scratchpad and executed with the ship arguments
(`img_compression=0`, no `guide_strength`, no `temporal_after`).

| check | result |
|---|---|
| nodes built | **23** |
| guide nodes (`14`,`15`,`34`,`53`) | absent ✓ |
| temporal nodes (`124`,`126`) | absent ✓ |
| `12.img_compression` | `0` ✓ |
| `33.cfg` (CFGGuider) | `1` ✓ |
| `42.sigmas` (ManualSigmas) | `0.85, 0.7250, 0.4219, 0.0` ✓ |

**Correction to the card and to MPI-568: the graph is 23 nodes, not 21.** Both
say 21. Counted by executing the builder, not by reading prose. Nothing else in
the description is affected — the ship configuration is exactly as documented.

## Phase 1 — schema gate — PASS, and it decided the sigma route (2026-08-19)

Probed the **app engine on :48188** (the user replica), not the bench on :8188.
Both were listening; the app engine is the one that has to run this.

**29/29 classes present, zero missing:** `ManualSigmas`, `MpiLoadVideo`,
`MpiSaveVideo`, `MpiListRange`, `MpiMath`, `MpiConvert`, `MpiFloat`, `MpiInt`,
`MpiText`, `MpiClearVram`, `LTXVLatentUpsampler`, `LatentUpscaleModelLoader`,
`LTXVEmptyLatentAudio`, `LTXVConcatAVLatent`, `LTXVSeparateAVLatent`,
`LTXVPreprocess`, `LTXVConditioning`, `ImageResizeKJv2`, `VAELoaderKJ`,
`CFGGuider`, `SamplerCustomAdvanced`, `KSamplerSelect`, `RandomNoise`,
`DualCLIPLoader`, `UNETLoader`, `VAEEncode`, `VAEDecode`, `CLIPTextEncode`,
`VAELoader`.

### THE SIGMA ROUTE IS DECIDED: route 2, the op-local injector

`ManualSigmas` takes exactly one input and it is a plain widget:

```json
{"required": {"sigmas": ["STRING", {"default": "1, 0.5", "multiline": false}]}}
```

No `forceInput`, output `SIGMAS`. So the title injector can write it directly,
the same way `Input_Upscale_Model` writes `model_name` on a loader in
`video_upscale.json`.

**Route 1 (build the string inside the graph) is CLOSED, and not on elegance —
on a silent data-destroying default.** It needed `MpiMath` → `MpiConvert` to turn
each scaled float into text, and `MpiConvert`'s schema is:

```json
{"required": {"input": ["*", {"forceInput": true}],
              "round": ["BOOLEAN", {"default": true, "label_on": "up", "label_off": "down"}]}}
```

`round` **defaults to true / "up"**. A schedule of `0.675, 0.5757, 0.3350, 0`
would come out of that chain as `1, 1, 1, 0`. It would not error — it would run,
produce a plausible-looking video, and be wrong. That is precisely the class of
bug the schema gate exists to catch, and it is why the route was probed rather
than chosen from memory.

Route 1 also cost ~7 plumbing nodes against route 2's ~15 lines, so it lost on
both axes at once.

### Pin indices locked from the live schema

- `MpiLoadVideo` → `(IMAGE images, AUDIO audio, FLOAT fps, INT frame_count, FLOAT duration, INT width, INT height, BOOLEAN has_audio)` = pins **0–7**. Audio pass-through is `[1]→audio`, `[2]→fps`, `[7]→use_audio` on `MpiSaveVideo`, exactly as `video_upscale.json` already wires it.
- `MpiListRange` → `(* list, INT count)`, `INPUT_IS_LIST`, inclusive negative indices — the frame trim.
- `LTXVEmptyLatentAudio.frame_rate` accepts `FLOAT,INT`, so the loader's FLOAT `fps` wires straight in.

**A ceiling found here, not in any MPI-568 note:** `LTXVEmptyLatentAudio.frames_number`
has `max: 1000`. At 8n+1 that caps one pass at **993 frames** regardless of VRAM.
Not a limit any bench arm approached (81 and 121 frames), and it is above the
frame count VRAM will allow anyway — recorded so Phase 5 measures against the
real binding constraint rather than assuming this one is it.

## Phase 2 — the workflow runs, and audio survives — PASS (2026-08-19)

`comfy_workflows/ltx_video_upscale.json`, 29 nodes. Offline check first (every
class on the engine, every link resolves, every pin in range), then a real
generation on the app engine through the GPU lease.

**Source:** `LTX Balanced/Media/video_crop_001.mp4` — 1436x808, 24 fps, 73 frames,
**with an aac audio track**, chosen for that last property.

| run | frames | out | time | peak VRAM (whole card) |
|---|---:|---|---:|---:|
| `smoke25` | 25 | 2816x1600 | 127s | **15407 MB** (baseline 2655) |

`ffmpeg -i` on the output:

```
Duration: 00:00:01.04
Stream #0:0 Video: h264, 2816x1600, 24 fps
Stream #0:1 Audio: aac (LC), 48000 Hz, stereo
```

- **2816x1600 is exactly 2x the /32 fit** of 1436x808 (-> 1408x800). The
  `ImageResizeKJv2(divisible_by: 32)` + `LTXVLatentUpsampler` chain is correct.
- **THE AUDIO STREAM SURVIVED.** The card recorded audio pass-through as UNBUILT;
  it needed no new nodes, only `MpiLoadVideo[1]/[2]/[7]` -> `MpiSaveVideo`, the
  wiring `video_upscale.json` already uses. Proven, not assumed.

### A trap that cost one failed run, and would cost the next person the same

The first attempt died at `ImageFromBatch` with
`TypeError: slice indices must be integers`. **The graph was not at fault — the
smoke harness was**, and the way it failed is the lesson:

`MpiMath` evaluates through `safe_math`, whose function table is
`{n: getattr(math, n)}` — **the `math` module only**. `min` and `max` are
builtins, so `min(a,25)` raises `disallowed call 'min'`, and `MpiMath.doit`
**catches that and returns `0.0`**. No error surfaces at the node; a float 0.0
flows on and blows up somewhere downstream, in a node that had nothing to do
with it. Use a conditional expression instead — `(a if a<25 else 25)` — which
`safe_math` does support via `ast.IfExp`.

The shipped expression `floor((a-1)/8)*8+1` is safe on both counts: `math.floor`
returns a true `int`, so the 8n+1 count reaches `ImageFromBatch.length` and
`LTXVEmptyLatentAudio.frames_number` as an integer.

## Phase 3/4 — op, injector and plugin wired (2026-08-19)

`ltxVideoUpscale` in `commandRegistry` (universal, `injector: 'ltxSigmas'`),
mapped in `UNIVERSAL_WORKFLOWS`, stamped `1.5.0` in `operationRegistry.js` and
mirrored into `operation_registry.json` (1.4.2 is tagged and branched, so a new
op key belongs to the next minor).

`ltxSigmasInjector` verified against MPI-568's own measured rungs — all four
reproduce to 4 dp from the single scaling law:

```
0.600 -> 0.6000, 0.5118, 0.2978, 0.0000     0.750 -> 0.7500, 0.6397, 0.3723, 0.0000
0.675 -> 0.6750, 0.5757, 0.3350, 0.0000     0.850 -> 0.8500, 0.7250, 0.4219, 0.0000
```

plus: a missing or zero denoise falls back to 0.675 rather than emitting a
degenerate no-op schedule, and a workflow without the `Input_Sigmas` node throws
instead of running the graph's default.

### `tests/plugin-dep-gc.test.cjs` resolved deps against the wrong map

It imported `assetDeps.js` and asserted every plugin dep exists there. The dep
entries are split four ways (`modelDeps` / `assetDeps` / `loraDeps` /
`nodesDeps`) and `dependencies.js` re-merges them as `DEPS`. While the only
plugin dep was a support weight, `assetDeps` happened to be enough. The LTX
upscaler needs a transformer, which lives in `modelDeps`, so a real dep was
reported as unknown. Repointed at `DEPS`.

## RESOLVED — the GC finding, and why my first recommendation was WRONG

Fabio approved "protect only while every dep is present" and then asked for the
prior cards, rules and docs to be read first, because this area has shipped
broken releases. **That research overturned the recommendation. It was the exact
gate that destroyed 5.24 GB of user weights.** Recorded in full because the
reasoning is what stops it being proposed a third time.

### The two circularities — `docs/download-manager.md` § exclusive deps

| rule | circularity | damage |
|---|---|---|
| per-dep on-disk (pre-MPI-258) | a shared file counted as proof for EVERY model declaring it, so a tier family protected the same idle copy from both sides while neither was installed | **~19 GB undeletable** (MPI-258 B1) |
| `fullyInstalled` (MPI-258/276) | a shared dep is itself an input to the gate, so the instant it goes missing every model needing it stops defending it | **5.24 GB destroyed** (MPI-310) |

**"Protect only while every dep is present" IS the second row.** With the LTX
upscaler declaring six deps, deleting any one of them by any path would have
switched off the plugin's protection for the other five — including the 20 GB
transformer. Same shape as the live MPI-310 incident, where uninstalling the
image-describer plugin deleted the encoder four Krea2 cards declared, while the
dialog promised *"shared files will be kept"*.

The resolution the codebase already reached is **exclusive-dep evidence** for
MODELS: a model counts as installed when a dep no other model declares is on
disk. That cannot be applied to plugins — the describer's only dep is shared with
Krea2, so it would have no exclusive evidence, protect nothing, and MPI-310
would recur. Which is exactly why `_pluginRequiredDepIds` is unconditional.

Also read, and applying: `_multiModelDepIds` must be computed over the WHOLE
registry (invariant 5, `_archived/MPI-276/research/04-bug-history-invariants.md`),
and recurring pattern **A — "fix one engine, forget the twin"**, 4+ hits.

### The actual answer was already shipped, in FlowDef

`requiredDeps` is not "every weight the graph loads" — it is **what this
capability owns that no model provides**. The Flow Library has been drawing that
line since MPI-304:

| flow | requiredModels | requiredDeps |
|---|---|---|
| `ltx-foley` | `['ltx-23-balanced']` | **absent** — runs entirely on the tier |
| `ltx-extend` | `['ltx-23-balanced']` | **absent** — same |
| `head-swap` | `['qwen-edit']` | `['qwen-lora-headswap', 'comfyui-inpaint-cropandstitch']` — only its own |

Even the foley LoRA is declared on the MODEL (`ltx23-lora-foley`, balanced tier
only), not on the flow. The LTX Video upscaler adds no weight of its own at all,
so it belongs in the `ltx-foley` row.

### What changed, and what it deliberately does NOT touch

`PluginDef` gains optional `requiredModels`; the plugin now declares
`requiredDeps: []` + `requiredModels: ['ltx-23-balanced']`, and
`pluginAvailability()` reads `state.s_installedModelIds` exactly as
`flowAvailability()` already does.

**No GC guard was touched.** `_pluginRequiredDepIds`, `_multiModelDepIds`,
`_localSharedDepsMap`, `_sweepOrphanedDeps` and their remote twins are unchanged,
so neither circularity can have been reintroduced — the plugin simply contributes
no protection edge. **630/630 tests pass**, including both GC tests that fail in
opposite directions by design.

### Still open — the Library row's Install button

`_pluginTile` (`MpiModelManager.js:1152`) sizes and installs from `requiredDeps`
alone. With an empty list it renders `Install ()` and starts a job with no deps —
a dead button for a user who does not have LTX 2.3 Balanced. Nothing is destroyed
and nothing else regresses; the dropdown entry is correctly hidden for that user,
because `upscalePluginsFor` gates on `pluginAvailability`.

The fix is the same aggregation the Flow Library already runs — `_installKeys` /
`_installMissing` / `_installProgress` in `MpiFlowLibrary.js:118-175` — ported to
the plugin row. **This is the next session's first task.**

## (superseded) The original write-up of the finding

`tests/shared-dep-uninstall-direction.test.cjs` case (4) fails:

```
MPI-258 B1 regression: 5 tier-family deps stranded
(neither transformer installed, yet ltx23-video-vae is protected)
```

**This is a real consequence, not a stale test.** MPI-258 B1 is the invariant that
an LTX tier family whose transformers are BOTH absent must not keep its shared
support weights undeletable — it stranded ~19 GB once already.

`pluginRequiredDepIds()` is unconditional **by design**: "a plugin has no install
state of its own — its deps ARE its install state, so gating protection on their
presence would be circular." That is right for the image describer, whose single
dep leaves it either fully usable or fully absent. It is wrong here, because this
is **the first plugin with a MULTI-dep set that is a strict subset of a model
tier's**: with the transformer gone the plugin is dead, yet it still protects the
five shared weights, so a user who uninstalls LTX cannot reclaim them.

Narrowing `requiredDeps` to the transformer alone does not solve it — the same
field drives the **Install** button, so a user without LTX would download 20 GB
and then fail inside ComfyUI on a missing VAE. One field is being asked two
different questions: *what must be installed* and *what must be protected*.

Options, with the cost of each:

1. **Protect only while every dep is present** (plugin usable => protect). Fixes
   B1, keeps the describer's behaviour identical, and touches
   `pluginRequiredDepIds()` plus its server twin `_pluginRequiredDepIds` in
   `routes/downloadManager.js`. **Recommended.**
2. **Split the field** — `requiredDeps` for install, a separate exclusive set for
   protection. More honest, more surface, and every future plugin has to get two
   fields right instead of one.
3. **Accept the stranding** and change the test. Rejected: it re-opens the exact
   ~19 GB bug MPI-258 fixed.

Either 1 or 2 is a change to the MPI-580 mechanism, which that card's plan closed
with "this card writes no GC code". Per THE ROOT-CAUSE RULE step 4, briefed rather
than patched.

## Phase 5 — in-app VRAM — **GO, with a ceiling** (2026-08-19)

These are APP numbers, not bench numbers. Verified from the live process command
line: the engine on :48188 runs
`main.py --listen 127.0.0.1 --port 48188 --lowvram --preview-method taesd ...`,
so `--lowvram` is confirmed rather than assumed, and the transformer is the int8
the plugin declares. Peak is `nvidia-smi memory.used` — whole card, the same
measure MPI-568 used.

| run | frames | out | Mpx | time | baseline | peak | graph cost |
|---|---:|---|---:|---:|---:|---:|---:|
| `smoke25` | 25 | 2816x1600 | 4.5 | 127s | 2655 MB | 15407 MB | 12752 MB |
| `full73` | 73 | 2816x1600 | 4.5 | 375s | 1003 MB | **15724 MB** | **14721 MB** |

**Verdict: it runs in the app.** 73 frames of 4.5 Mpx completed in one pass, no
chunking, audio intact, 375s (123 s per second of footage — consistent with the
bench's 103 s/s at a lower Mpx on a NORMAL_VRAM engine).

**But the headroom is 656 MB, and it is not the app's to spend.** The two runs
differ in baseline because desktop VRAM moved under them, and that is the whole
risk:

- `full73` fit with a **1003 MB** baseline. Its graph cost of 14721 MB plus the
  **2655 MB** baseline the earlier run saw is **17376 MB — over a 16380 MB card.**
- Measured live earlier this session, Edge alone held **1006 MB**, two Vision
  windows **815 MB**, dwm **377 MB**.

So whether this succeeds depends on what else is on the GPU when the user presses
Run, not on anything the app controls. **The graph cost also grows with frames:**
12752 MB at 25 frames, 14721 MB at 73. Extrapolated, ~121 frames does not fit even
on an idle card.

Consequences for the UI, to settle before Phase 6 is designed around them:

1. A failure here is a ComfyUI OOM deep in the graph after several minutes of
   work, which is the worst possible way for a user to learn this.
2. Neither a frame cap nor a resolution cap is currently enforced anywhere — the
   graph takes whatever the source gives it, up to the `LTXVEmptyLatentAudio`
   `frames_number` ceiling of 1000 (993 at 8n+1), which is far above the real
   binding constraint.
3. The `MpiClearVram` node runs before save, not before the sampler, so a resident
   app-side model is not unloaded by this graph.

## Phase 6 — not started
