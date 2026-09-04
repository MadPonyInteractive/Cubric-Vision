# MiniMax H3

Hub for the MiniMax H3 video+audio model. Research that produced these numbers is
`.agents/mpi-kanban/tasks/MPI-449/research.md`; the wiring card is MPI-452.

**H3 is the first model in this repo whose LICENCE is a product constraint, not a
formality.** Read § Licence before scoping anything.

## What ships

| | |
|---|---|
| ModelDef id | `minimax-h3` — **load-bearing**, see § Licence |
| `model.type` | `h3` (drives `RATIO_MODES` / `BUILTIN_RATIOS` / `BUILTIN_QUALITY_TIERS` in `js/utils/ratios.js`) |
| Ops | `t2v_ms`, `i2v_ms` — one graph, `comfy_workflows/minimax_h3_fl2va.json` |
| Stages | Two, in ONE file. No `_stage2` twin |
| Audio | Emitted, not accepted. `capabilities.audio` is OFF — see § Audio |
| Weights | 6 files, **48.03 GB** (computed from `DEPS`, 2026-08-30). The two DiTs and the audio VAE are publisher-hosted; the encoder (MPI-653), the int8 video VAE (MPI-517), the turbo LoRA and the TAE are R2-primary — so "never R2" no longer holds |
| Engine floor | ComfyUI **0.30.0** (the H3 nodes do not exist before it) |

There are two H3 transformers. This card is **fl2va** (`MiniMaxH3ImageToVideo`), the
everyday workhorse covering t2v, first-frame, last-frame and first+last interpolation.
**ref2va** (`MiniMaxH3ReferenceToVideo`, omni-reference: ≤9 images, ≤3 videos, ≤3 audio
clips) is a SEPARATE card, `minimax-h3-ref2va` — a different transformer file in the same
repo, sharing this card's encoder and both VAEs. It has its own doc:
[ref2va.md](ref2va.md), which carries the 2026-08-07 judged results, the slot-numbered
prompt tags, and why a good-looking ref2va clip off the WRONG transformer is not
evidence of anything.

## Licence — the constraint that outranks the technical work

The MiniMax H3 Community License Agreement (2026-08-02) grants rights only in the
"Applicable Territory": **worldwide EXCLUDING the EU, the UK, the USA and South Korea**.
The bar covers Outputs, not just weights. Governing law is Hong Kong.

Two consequences are baked into the wiring and must not be "tidied away":

1. **The weights are NOT on R2 and must never be.** Every dep points at the publisher's
   own HF repo. That kills the redistribution claim (§III) outright — the clearest and
   most enforceable one. See the comment on `minimax-h3-fl2va-transformer` in
   `js/data/modelConstants/modelDeps.js`.
2. **The ModelDef id is `minimax-h3` because a lookup depends on it.** MPI-451's licence
   gate keys `MODEL_LICENCES` (`js/data/modelConstants/licences.js`) by model id and
   blocks the install until the user accepts. Rename the id and the lookup MISSES —
   silently, with no error — and H3 installs ungated, which is exactly what our
   authorization's flow-down commitment forbids.

Authorization for this machine's territory was requested and granted 2026-08-05. The
request carries a confidentiality undertaking, so it lives **outside every git root** at
`C:/AI/Mpi/_private/minimax-h3-licence/`. Do not copy any of it into this repo.

### What each clause actually cost us

Read against the agreement itself, not from memory — most of § III is *encouraged*, and
only two lines are load-bearing.

| Clause | Owed? | Discharged by |
|---|---|---|
| §III.1 — "provide a copy of this Agreement" | **Yes** | `licences/minimax-h3/LICENSE.txt`, **bundled** |
| §III.4 — NOTICE text file, verbatim | **Yes** | `licences/minimax-h3/NOTICE.txt` |
| §III.3.a — "Powered by MiniMax H3" | Encouraged; **we committed to it** in the authorization request | `poweredBy` on the descriptor → Model Library drawer |
| §IV.2 — prominently display "MiniMax H3" | Yes (free/donation app, but assume it binds) | same row |
| §V.2 — bind the user before access | **Yes** | `MpiLicenceGate`, MPI-451 |
| §V.5 — reporting route | **Yes** | `report` → Discord, MPI-451 |
| §III.2 — modified-file notices | No | we modify no weights |
| §III.3.b/c — AI-gen identifier, blog post | Encouraged only | — |
| §IV.1 — separate authorization above $20M/yr | No | nowhere near |

**§III.1 is why the licence is bundled rather than linked.** Its scope is "Third Parties who
receive the MiniMax H3 Works **or use your products or services related thereto**" — that
second half reaches every Vision user who runs H3, not only someone we hand weights to, and
a link to huggingface.co names a copy rather than providing one. `LICENSE.txt` is
byte-identical to what `MiniMaxAI/MiniMax-H3` serves (17,604 bytes, fetched 2026-08-06).
`licenceUrl` is therefore root-relative and `openExternal` resolves it against the app
origin — the port is not fixed (`CUBRIC_PORT`), so it cannot be hardcoded.

**§III.4 strictly binds a distributor, and we distribute nothing** — every weight comes from
the publisher's own URL. The NOTICE ships anyway; it costs one file and removes the argument.

**The attribution is on the MODEL, not on Vision.** §III.3.a scopes the notice to a product
"developed using MiniMax H3", which is the model entry, not the app. Consequence: a Flow
Library Flow built on H3 needs that row in its OWN slide-over — `MpiFlowLibrary`'s drawer has
no licence row. Noted in `docs/playbooks/add-flow/01-descriptor-and-ops.md`.

Still open on MPI-452: a card preview clip inside the 124–362 trained frame range.

## Weights

All four verified: the source URLs return HTTP 200 and serve byte counts identical to the
local copies, so the registry sha256 values are the hashes of what a user actually
downloads. Three verified 2026-08-06 against their publisher URLs; the video VAE was
re-verified 2026-08-10 after the int8 swap below.

| dep id | file | size |
|---|---|---|
| `minimax-h3-fl2va-transformer` | `minimax_h3_fl2va_pruned_int8_convrot.safetensors` | 20.97 GB |
| `h3-qwen3vl-32b-clip` | `qwen3vl_32b_h3_ultra_uncensored_heretic_int8_convrot.safetensors` | 26.36 GB |
| `vae-minimax-h3-video-int8` | `minimax_h3_video_vae_int8_convrot.safetensors` | 3.17 GB |
| `vae-minimax-h3-audio` | `minimax_h3_audio_vae_fp32.safetensors` | 0.61 GB |

**The video VAE is int8_convrot and REQUIRES ComfyUI core ≥ v0.31.0** (MPI-517). Core PR
#15334 (merged 2026-08-06) is what teaches core to read the format; on v0.30.x it does not
load. It replaced the 5.21 GB fp16 build on 2026-08-10 after bench measurement showed it
faster with no quality loss. If the engine pin in `dev_configs/node_lock.json` ever drops
below 0.31, this dep must go back to `vae-minimax-h3-video` (kept in `assetDeps.js`).

**It is also the one H3 weight we host ourselves.** R2-primary with the publisher as
`mirrorUrl` — the inverse of the other three. Not a change of licence posture: its only
publisher is `Kijai/MiniMax-H3-experimental`, created five days before adoption and named
"experimental", and H3 deps generate no mirrors on their own, so a delete or a silent
re-export would break every new install with nothing to fall back to. Comfy-Org publishes
int8_convrot for both DiTs and the encoder but ships this VAE fp16-only (checked
2026-08-10), so there is no stable-publisher alternative to point at.

**PRUNED is final; the 34.04 GB unpruned file was deleted.** Of three candidate arguments
only download size survived measurement: speed died (the sign flips between canvases, both
deltas inside run-to-run noise) and resident memory died (ComfyUI streams per layer). The
one real difference is temporal — unpruned is slightly more expressive — and it was only
ever observed at 56 frames, so it is NOT proven to persist on long clips. Re-testing costs
a 32 GB re-download.

**int4 encoders were rejected with evidence** (MPI-449 § 4/§ 5). Comfy-Org's own stock
encoder is 27.14 GB, so 26.36 GB is not the large option.

## Two-stage — and why there is no `_stage2` twin

Every other video model ships a duplicate `_stage2` workflow file. H3 does not, because
MPI-449 fixed the two forcing paths that made twins necessary: `ExecutionBlocker` travels
downstream only, and an `OUTPUT_NODE` always executes. `MpiSaveLatent` now takes a lazy
`enabled` input, so a continue run genuinely SKIPS the stage-1 sampler instead of running
and discarding it.

Measured on the shipped graph, 864x480 / 56 frames, 2026-08-06:

| mode | time | bars | outputs |
|---|---|---|---|
| single | 145 s | 2 (5-step, 15-step) | `Output_Video` + latent |
| preview | 54 s | 1 (5-step) | `Output_Preview` + latent, no `Output_Video` |
| stage2 | 98 s | 1 (15-step) | `Output_Video` only, no latent re-save |

That is `PROGRESS_STAGES['minimax_h3_fl2va.json'] = { single: 2, preview: 1, stage2: 1 }`.
**When re-counting: tqdm prints each finished bar TWICE**, so a raw grep of `100%` lines
reads 4 for the single run.

### The latent handshake (ComfyUi-MpiNodes a6e5d5e)

H3 packs video AND audio into ONE `NestedTensor` latent, which crashes core `SaveLatent`
— hence `MpiSaveLatent`/`MpiLoadLatent`. Those nodes originally spoke only to a
hand-driven bench and could not drive the app's Continue:

- `MpiSaveLatent` returned **no `ui` payload**, so the app collected nothing from
  `/history` and never learned a latent existed.
- `MpiLoadLatent` read only `<output>/latents/`, but the app stages a per-run latent into
  the engine **`input/`** folder (where core `LoadLatent` reads).

Fixed in the node, NOT as an app special case, so LTX, WAN and H3 share one contract:
save now reports `ui.latents` (`filename` + `subfolder: "latents"` + `type: "output"`) and
load checks `input/` first, falling back to `<output>/latents/` so a hand-run bench graph
is unaffected.

### What the no-twin design cost the APP — four half-wires, all fixed

Shipping one file for both stages is right, but the app had **four** places that assumed
the fleet's shape. **Not one of them errored.** Every single one produced a plausible
result behind a fallback that hid the failure, which is why they were found by running H3
through Vision on 2026-08-06 and never by reading the graph.

| assumption | where | effect | state |
|---|---|---|---|
| the latent saver is `class_type: 'SaveLatent'` | `saveLatentNodeIds`, `commandExecutor.js` | H3 uses `MpiSaveLatent`, so the set was EMPTY, the latent was never collected, and **every** preview fell back to the COLD path and re-ran the whole workflow — returning a different sample than the one approved | **FIXED**, pinned |
| a multi-stage model has a `_stage2` twin FILE | `resolveWorkflowFile`, `resolveModelDeps.js` | appended `_stage2` unconditionally → Finish 404'd on `minimax_h3_fl2va_stage2.json`, which must never exist | **FIXED** — `capabilities.singleFileStages` opts a model out |
| something, somewhere, writes `Input_Is_Continue` | nothing did | **zero writers tree-wide**; the node sat baked `false`, so fixing the resolver alone would have handed stage 2 the base graph with the gate still off — it re-runs stage 1 and returns a different sample, with nothing to announce it | **FIXED** — `_buildParams` emits the gate for every multi-stage op. Note the KEY moved: MPI-473 deleted the standalone `Is_Continue` / `Preview_Only` params (no graph ever had those nodes), so the gate now rides `Input_Video_Latent.is_continue` / `.is_preview` on `MpiStageLatents` alone |
| the latent-load widget is called `latent` | `_inject`'s target list, `comfyController.js` | core `LoadLatent` calls it `latent` and **is** listed, so all 12 LTX and 4 WAN graphs always injected fine; H3, the only graph on `MpiLoadLatent` (`filename`), got **nothing** injected, kept its baked name, loaded no latent, gated every lazy branch off, and finished in **0.03 s** with empty outputs | **FIXED** — `'filename'` added |

The fourth one is the expensive lesson: a node the app *cannot address at all* looks
exactly like a node it addresses wrongly. What separated them was reading the **dispatched
graph** out of ComfyUI's `/history` and seeing the baked value still sitting there.

**The pattern behind all four:** the app encodes fleet conventions in **shared resolvers**
keyed on class names, titles and widget names. A model that breaks one does not crash — it
silently takes a fallback. `docs/playbooks/add-model/README.md` now carries this as a hard
rule: a model breaking a shipped convention must have that convention **grepped for in the
app before testing**.

### The design that replaced it

The eight-node save/load/gate cluster is gone. `MpiStageLatents` owns the whole handshake
in one node with `is_continue` / `is_preview` / `save_path` / `load_path` as widgets and
lazy latent inputs — see [../../workflow-authoring/mpi-nodes.md](../../workflow-authoring/mpi-nodes.md).
H3 collapsed 64 → 57 nodes, all four media branches intact. WAN is migrated and its two
twins are deleted; **LTX's six remain** until its re-author lands (MPI-456), and LTX being
dual-latent is the open question there.

A fifth half-wire appeared the moment H3 and WAN migrated — `saveLatentNodeIds` did not
know `MpiStageLatents` either, because its class name says "latents", not "save". The test
written for the first one caught it before it shipped.

**Naming trap, locked by an assert in `generate_h3.py`:** the one stage node MUST stay
titled `Input_Video_Latent`, even though it carries a packed video+audio latent and
`Output_AV_Latent` reads more naturally. `commandExecutor` injects the stage gates
(`Input_Video_Latent.is_continue` / `.is_preview`) by that exact title, and injection
silently skips a title matching no node — so a rename makes every Continue re-run stage 1
and return a different sample, with nothing to announce it.

## Routing — derived from media, not from a toggle

H3 does not take an op int. `Input_Start_Frame` and `Input_End_Frame` are path strings;
each feeds an `MpiAnyChecker` (`has img1` / `has img2`) and those two booleans drive four
lazy `MpiIfElse` branches into four `MiniMaxH3ImageToVideo` nodes (t2v, start-only,
end-only, start+end). **Illegal states are unreachable by construction** — there is no
toggle that can disagree with the media present. LTX should adopt this shape (MPI-455).

`generate_h3.py` asserts all four branches survive, because a missing one does not error —
it falls through to another and conditions on the wrong frames.

### The keyframe resize belongs to the NODE — the graph lost it once already

`MiniMaxH3ImageToVideo` treats its two keyframes differently: `first_frame` gets
`_resize(..., "disabled")` — a plain stretch, the upstream comment calls it a "geometry
anchor" — while `last_frame` gets `"center"`, an aspect-preserving cover-crop. So an i2v
source whose aspect misses the canvas is squashed into every frame, and when BOTH frames
are given they are conformed by two different rules and disagree with each other. MPI-449's
research called this out (§ line 377) and assigned a fix to MPI-452.

MPI-452 answered it **in the graph**: nodes 218/220 (`ImageResizeKJv2`, `keep_proportion:
crop`, `crop_position: center`) sat in front of both frame paths, so each frame arrived at
canvas size and core's stretch was a no-op. This section used to record that as settled and
warn that app-side fitting would crop twice.

**That answer did not survive its own graph rebuild.** The two-pass port (`6deb60b6`,
2026-09-04) replaced the four-copy branch lattice with a single `MpiH3ImageToVideo`, and
the two resize nodes went out with the lattice — `git log -S ImageResizeKJv2` shows them
entering at `bb50b55e` and leaving at `6deb60b6`, and the rebuilt fl2va has **zero** resize
nodes: `MpiLoadImageFromPath` 217/219 wire straight into the i2v node. The first user run
that day came back squashed (MPI-687).

The fix is now in the NODE, not the graph: `MpiH3ImageToVideo._cover_crop` (MpiNodes
1.2.10) conforms **both** frames before delegating, so core's own resize is handed an
at-size image and becomes a no-op. Crop, never pad — letterbox bars baked into frame 0 get
animated as scenery. **Do not re-add graph resize nodes**: they would crop twice, and the
reason this moved into the node is precisely that a graph node can be dropped by a rebuild
without anything failing. The crop mode is pinned by `h3.py`'s self-check, because a
regression to `'disabled'` is invisible in the graph and shows up only as a squashed
frame 0.

## Frames, duration and canvas

- Valid frame counts are **n % 17 == 5** at 24 fps. `MpiH3Length` snaps a wanted duration
  onto that grid (nearest, not up) and reports the true seconds.
- **Trained range is 124–362 frames** (5.2–15 s). 56 frames works but is below it, so the
  UI default should sit near 5 s, not 2 s.
- Ratio ladder: native is `high` (768x1344). Everything above it — `very_high` (1088x1920)
  and `2k` (1472x2560, added 2026-08-07) — is ABOVE the trained canvas: **final-render**
  tiers, not iterate tiers, because 2x the pixels costs 3.3x the time (attention is
  quadratic in token count), so 1088x1920 is ~25.6 min for a 2.33 s clip and roughly an
  hour at 124 frames. Quality holds up there better than "extrapolated" suggests — a bare
  2560x1472 run was measured clean, which is what earned the `2k` tier — so treat the top
  of the ladder as a COST limit first. Do not confuse it with **H3-Regenerate-2K**, the
  768p→2K second pass, which is API-only and not in these weights ([ref2va.md](ref2va.md)).
- **A canvas change is a different latent shape, so the same seed is a DIFFERENT sample.**
  Tier A/B can never be read as "same shot, sharper", and the UI must not imply it.
- **The two-pass halves the canvas and doubles it back, so the tier number is not what
  stage 1 renders.** Both H3 runtimes carry the pair: stage 1 is `floor(a / 32) * 16`, and
  stage 2 is `floor(floor(a/16)*16 * b / 32 + 0.5) * 32` with `b = 2`. A /32-clean canvas
  halves to a /16-clean one, and /16 is all the latent grid (`height // 16`) needs. **The
  ceiling on stage 1 is /16, NOT /32** — that mistake is what broke it: the halving shipped
  as `floor(a / 64) * 32`, over-constraining stage 1 to /32, which composes to
  `floor(target / 64) * 64` and silently drops 32px from every canvas not divisible by 64.
  Six of the 21 distinct dimensions in `MINIMAX_H3_RATIOS` were affected — `very_low`
  352/608, `low` 480/864, `medium` 1376, `very_high` 800 — so the whole of the default tier
  rendered 32px short while the status bar showed the label. Found and fixed 2026-09-04
  (MPI-687), one day after the two-pass shipped. Read this before changing either
  expression, and check the whole ladder rather than the one canvas in front of you: the
  15 unaffected dimensions all happened to be /64 and hid it.
- `adapt_canvas` (768 short edge, `MAX_PIXELS = 768*1344`) is **never applied to the output
  latent** — it is called only from `MiniMaxH3ReferenceToVideo` to conform reference
  VIDEOS. `MiniMaxH3ImageToVideo.execute` calls `_empty_av_latent(width, height, length)`
  with no clamp at all, which is why `very_high` renders 2.09 MP. Do not reach for it to
  explain a canvas that came back smaller than asked — that reflex cost MPI-687 a session.

## Audio

H3 emits video + native stereo 32 kHz audio from one sampler pass. Verified on the shipped
graph: the output mp4 carries `h264 864x480 24fps` + `aac stereo 32000 Hz`.

`capabilities.audio` is deliberately **absent** from the ModelDef. That flag surfaces an
audio INPUT slot plus the `audioMode`/`useAudio` controls (`MpiPromptBox.js`), and fl2va
accepts no audio — it only produces it, muxed into the mp4 by `MpiSaveVideo(use_audio)`.
The model that DOES take audio in is ref2va, and that card wants `audio: true`.

## LoRAs

Six flat user slots on `MpiLoraModelClip`, exposing model AND clip strength. The clip half
matters more than usual: H3's "clip" is the Qwen3-VL tower and it ingests the KEYFRAME as
well as the prompt.

**Trap:** `model_lora_keys_unet` has 17 named model branches and H3 is not one of them, so
a **Diffusers-format H3 LoRA loads without error and does nothing**. Only plain
`diffusion_model.*` / `lora_unet_*` keys map.

## Memory is a poor predictor here — in BOTH directions

Falsified twice: by file size (2026-08-05) and by canvas size (2026-08-06 — 13.2/16 GB at
2.09 MP, LOWER than at 640x640, because ComfyUI keeps fewer weights resident to leave room
for activations). Do not use it to predict anything about this model.

Related: `execution_cached` listing a node is NOT evidence it was needed — leaf constant
nodes cache per value, so booleans show cached whichever way they are flipped. To tell
pruned from cached, vary an input nothing has ever sampled.

Performance levers already tested and REJECTED — the KJNodes H3 VRAM patches (measured
+13.8% for nothing on both cards that matter) and the Sage attention patch — are in
[performance.md](performance.md). Read it before wiring an optimisation into either graph.

## Sources

- <https://huggingface.co/Comfy-Org/MiniMax-H3> — both transformers, both VAEs, stock encoders
- <https://huggingface.co/MiniMaxAI/MiniMax-H3> — README + LICENSE
- <https://huggingface.co/ethanfel/Qwen3-VL-32B-Ultra-Heretic-H3-ComfyUI-INT8-ConvRot> — the shipped encoder
