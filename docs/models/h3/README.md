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
| Weights | 4 files, 53.15 GB, **publisher-hosted, never R2** |
| Engine floor | ComfyUI **0.30.0** (the H3 nodes do not exist before it) |

There are two H3 transformers. This card is **fl2va** (`MiniMaxH3ImageToVideo`), the
everyday workhorse covering t2v, first-frame, last-frame and first+last interpolation.
**ref2va** (`MiniMaxH3ReferenceToVideo`, omni-reference: ≤9 images, ≤3 videos, ≤3 audio
clips) is a SEPARATE card, `minimax-h3-ref2va` — a different transformer file in the same
repo, sharing this card's encoder and both VAEs.

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

Still open on MPI-452: the NOTICE string the licensor requires verbatim, and the
"Powered by MiniMax H3" attribution on the product surface.

## Weights

All four verified 2026-08-06: the publisher URLs return HTTP 200 and serve byte counts
identical to the local copies, so the registry sha256 values are the hashes of what a
user actually downloads.

| dep id | file | size |
|---|---|---|
| `minimax-h3-fl2va-transformer` | `minimax_h3_fl2va_pruned_int8_convrot.safetensors` | 20.97 GB |
| `h3-qwen3vl-32b-clip` | `qwen3vl_32b_h3_ultra_uncensored_heretic_int8_convrot.safetensors` | 26.36 GB |
| `vae-minimax-h3-video` | `minimax_h3_video_vae_fp16.safetensors` | 5.21 GB |
| `vae-minimax-h3-audio` | `minimax_h3_audio_vae_fp32.safetensors` | 0.61 GB |

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

**Naming trap, locked by an assert in `generate_h3.py`:** the latent pair MUST stay
`Output_Video_Latent` / `Input_Video_Latent`. `_latentRoleFromTitle` in
`js/services/commandExecutor.js` tags any title CONTAINING "audio" as the audio latent —
a role H3 has no second slot for — so the natural name `Output_AV_Latent` would break
stage-2 resume silently.

## Routing — derived from media, not from a toggle

H3 does not take an op int. `Input_Start_Frame` and `Input_End_Frame` are path strings;
each feeds an `MpiAnyChecker` (`has img1` / `has img2`) and those two booleans drive four
lazy `MpiIfElse` branches into four `MiniMaxH3ImageToVideo` nodes (t2v, start-only,
end-only, start+end). **Illegal states are unreachable by construction** — there is no
toggle that can disagree with the media present. LTX should adopt this shape (MPI-455).

`generate_h3.py` asserts all four branches survive, because a missing one does not error —
it falls through to another and conditions on the wrong frames.

## Frames, duration and canvas

- Valid frame counts are **n % 17 == 5** at 24 fps. `MpiH3Length` snaps a wanted duration
  onto that grid (nearest, not up) and reports the true seconds.
- **Trained range is 124–362 frames** (5.2–15 s). 56 frames works but is below it, so the
  UI default should sit near 5 s, not 2 s.
- Ratio ladder: native is `high` (768x1344). `very_high` (1088x1920) is ABOVE the trained
  canvas — a **final-render** tier, not an iterate tier: 2x the pixels costs 3.3x the time
  (attention is quadratic in token count), so 1088x1920 is ~25.6 min for a 2.33 s clip and
  roughly an hour at 124 frames.
- **A canvas change is a different latent shape, so the same seed is a DIFFERENT sample.**
  Tier A/B can never be read as "same shot, sharper", and the UI must not imply it.

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

## Sources

- <https://huggingface.co/Comfy-Org/MiniMax-H3> — both transformers, both VAEs, stock encoders
- <https://huggingface.co/MiniMaxAI/MiniMax-H3> — README + LICENSE
- <https://huggingface.co/ethanfel/Qwen3-VL-32B-Ultra-Heretic-H3-ComfyUI-INT8-ConvRot> — the shipped encoder
