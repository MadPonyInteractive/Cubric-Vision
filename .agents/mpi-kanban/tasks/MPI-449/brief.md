# MPI-449 Brief — MiniMax H3 research on the bench

Goal: find out whether MiniMax H3 is usable for Cubric Vision **before** spending an
engine bump on it. The bench is the sandbox; the engine stays pinned at 0.29.2 until
this card returns a go.

---

## START HERE — state as of 2026-08-05 evening

**Read `research.md` first.** It supersedes the storage arithmetic below.

What changed since this brief was written:

1. **Licence resolved.** H3's Community Licence excludes the EU, UK, US and South Korea —
   and covers Outputs, not just weights. MiniMax runs an official request form for excluded
   territories (linked from `docs/QA-about-License.md` in the H3 repo). **A request was
   submitted and authorization was granted the same day.** Request/approval detail is held
   **outside this repo** — public repo, confidentiality undertaking —
   at `C:/AI/Mpi/_private/minimax-h3-licence/`. Do not copy any of it in here.
   Consequences are carded: **MPI-451** (licence gate, blocks release) and **MPI-452**
   (H3 model wiring, blocked).
2. **Storage is no longer a constraint.** Weights go to `C:/AI/` (205.8 GB free), not `G:`.
   The "53.7 GB free / 53.92 GB needed" squeeze below is dead — ignore it.
3. **Weight set revised: 41.74 GB, not 53.9.** int8 DiT + **int4** text encoder. Table and
   reasoning in `research.md`.
4. **The bench is ready.** `extra_model_paths.yaml` gained `text_encoders:` and `vae:` under
   `C:/AI/` (needs a ComfyUI restart), and the three official H3 templates — which are NOT in
   the installed `comfyui_workflow_templates` 0.11.31 — are placed at
   `G:/ComfyUi/ComfyUI/user/default/workflows/MiniMax_H3_{t2v,i2v,r2v}.json`.

Still unanswered, and it belongs to MPI-452 not here: whether the authorization reaches end
users who are themselves in an excluded territory, or only the licensee.

---

## THIS CARD IS THE UMBRELLA — decided 2026-08-05 by the user

**No separate card for the engine bump.** MPI-449 owns the whole H3 arc: bench research,
the go/no-go, then the execution. The sequence, once bench testing says H3 is viable:

1. Run the blocking card **MPI-451** (licence gate).
2. Bump the engine 0.29.2 -> 0.30.x. H3's core nodes are 0.30.0+ with no backport, so this
   is a hard gate, not a preference (`research.md` § 6b).
3. Hand off to **MPI-452** for the model wiring.

All of it driven from here. **Use `/mpi-handoff` to carry state into fresh sessions** as
context fills — that is the intended working mode for this card, not an exception.

### Current state — weights down, first numbers taken, BLOCKED

Done since the section above was written:

- All five files downloaded to `C:/AI/` and checksum-verified. Encoder chosen is
  ethanfel's abliterated int8 (26.36 GB), not Comfy-Org's — reasoning in `research.md` § 3.
- **H3 runs on the 4060 Ti 16 GB.** 131 s warm, 20 steps, 640x640 x 56 frames. Acceptance
  criterion #1 is answered. Details and the tier projections in `research.md` § 6.
- `MINIMAX_H3_RATIOS` shipped to `js/utils/ratios.js` (commit `f739e076`), inert until
  MPI-452 wires a ModelDef.

**BLOCKED right now:** a Cubric-Prompt agent is running prompt-enhancement tests with
Ollama on the same GPU, cycling a vision model in and out of VRAM. Every timing here was
taken against that contention, so they are **upper bounds**. The clean re-run waits for
that agent to finish.

Next when unblocked: seed-only re-run at 640x640 for a clean warm number, then 864x480 /
5 s / 20 steps for a like-for-like against the 194 s third-party reference.

---

## Original brief (storage section below is superseded)

## What is already done (2026-08-05)

The bench at `G:/ComfyUi` was bumped **0.29.2 -> 0.30.2** (latest tag). Verified live
against the running server, not the files:

- `/system_stats` reports `0.30.2`
- **zero** custom-node import failures across all 20 packs
- `bg_removal` and `controlnet` dropdowns still enumerate (yaml did not drift)
- H3 nodes registered: `EmptyMiniMaxH3LatentAV`, `MiniMaxH3ImageToVideo`,
  `MiniMaxH3ReferenceToVideo`, `MiniMaxH3SigmaShift`
- `minimax` is present as a `CLIPLoader` type

Python deps moved: frontend 1.47.11 -> 1.47.12, workflow-templates 0.11.20 -> 0.11.31,
comfy-kitchen 0.2.22 -> 0.2.26, comfy-aimdo 0.4.10 -> 0.4.11. **torch untouched.**
The pre-bump yaml is backed up at `G:/ComfyUi/ComfyUI/extra_model_paths.yaml.bak-v0292`.

No repo file changed. Nothing to commit from the bump itself.

## The blocking question: does it fit?

Weights: `https://huggingface.co/Comfy-Org/MiniMax-H3` (ungated). Sizes measured from
the HF API, not estimated:

| File | Size |
|---|---|
| `diffusion_models/minimax_h3_{fl2va,ref2va}_bf16` | 66.28 GB |
| `diffusion_models/minimax_h3_{fl2va,ref2va}_pruned_bf16` | 40.23 GB |
| `diffusion_models/minimax_h3_{fl2va,ref2va}_int8_convrot` | 34.04 GB |
| `diffusion_models/minimax_h3_{fl2va,ref2va}_pruned_int8_convrot` | 20.97 GB |
| `diffusion_models/minimax_h3_{fl2va,ref2va}_pruned_fp8_scaled` | 20.96 GB |
| `text_encoders/qwen3vl_32b_minimax_h3_bf16` | 51.51 GB |
| `text_encoders/qwen3vl_32b_minimax_h3_int8_convrot` | 27.14 GB |
| `text_encoders/qwen3vl_32b_minimax_h3_nvfp4_awq` | 15.69 GB |
| `vae/minimax_h3_video_vae_fp16` | 5.21 GB |
| `vae/minimax_h3_audio_vae_fp32` | 0.61 GB |

Local hardware: **RTX 4060 Ti, 16 GB VRAM**; `G:` has **53.7 GB free**.

Smallest set that avoids nvfp4 = 20.96 + 27.14 + 5.21 + 0.61 = **53.92 GB**. That is
already ~200 MB over the free space on `G:`, before any headroom. And the DiT alone at
fp8 is 21 GB against 16 GB of VRAM, so even once it is on disk ComfyUI is offloading
both the DiT and a 27 GB text encoder to system RAM every step.

`nvfp4_awq` (15.69 GB) is the only encoder that would change the arithmetic, but nvfp4
is a Blackwell (RTX 50-series) format and this card is Ada (sm_89). **Whether ComfyUI
dequantises nvfp4 on Ada, and at what speed, is unverified — do not assume either way.**

Two honest options, and the card should pick one rather than half-trying both:

1. **Free disk and try the fp8 + int8 set locally.** Cheapest to start, most likely to
   end in an OOM or a multi-minute-per-step crawl. Worth it only to get a real number.
2. **Run it on a Pod instead.** `docs/builder/README.md` is the existing route and the
   Builder Pod already exists for exactly this. Settles runnability without clearing
   54 GB off `G:`, and it is the only way to see H3 at bf16.

## What the nodes tell us about the model

From `comfy_extras/nodes_minimax_h3.py` at v0.30.2 — H3 is **not** a drop-in for a
WAN or LTX graph:

- Latents are `NestedTensor` **pairs**: video `[B,24,T,H/16,W/16]` + audio `[B,32,2,T40]`.
  It generates picture and sound together.
- 24 fps; audio latent runs at 40.
- Canvas is 768 short edge with a 768x1344 pixel cap, each axis rounded to a multiple
  of 32.
- Frame count is snapped to `n % 17 == 5`.
- Conditioning carries Qwen3-VL-32B hidden states with per-token modality tags, plus
  keyframe/reference condition latents that are re-injected every step and never
  denoised.
- Sampling runs on the flat pack with any stock sampler; the model handles the audio
  stream's shifted schedule internally.
- `fl2va` = first/last-frame to video+audio (`MiniMaxH3ImageToVideo`),
  `ref2va` = reference to video+audio (`MiniMaxH3ReferenceToVideo`). Two separate DiT
  files — you cannot serve both from one download.

There is **no bundled workflow template**: `comfyui_workflow_templates` 0.11.31 ships
none for H3, so the first graph is hand-built.

## Engine bump — deliberately out of scope for this card

The app engine is pinned at `0.29.2` in `dev_configs/system_dependencies.json`. The
bench is now **ahead** of it, so any H3 graph authored on the bench cannot run in
Cubric Vision yet. That is intended: prove H3 is worth having first.

When the bump is considered, it is its own card and it carries the standing risk from
`.claude/rules/comfy_engine.md` — a core bump can break version-sensitive custom nodes,
so the node-floor pairing check runs before the tag is picked.

## The audio half is NOT a scope question — LTX already does this

Vision generates audio today and always has: **LTX 2.3 emits video and audio jointly**,
which is why `ltx23-audio-vae` sits in its `dependencies` in
`js/data/modelConstants/models.js`. LTX also accepts audio as a control input
(`LTXVReferenceAudio`, MPI-4 → `docs/models/ltx/audio-input.md`). Both directions are
shipped.

So H3 returning a soundtrack is **ordinary for this app, not a first**. Treat LTX as
prior art for how joint video+audio generation is dispatched, decoded through a second
audio VAE, and surfaced in the gallery. What is genuinely out of Vision's scope is a
STANDALONE audio tool (text-to-music, an audio editor) — that is Cubric Audio, and H3
is not that.

One H3-specific constraint worth recording: audio is **not optional**. Every entry
point allocates the joint AV latent — `_empty_av_latent` always builds both the video
`[B,24,T,H/16,W/16]` and audio `[B,32,2,T40]` tensors, and the extension registers no
audio-free or audio-only node. `first_frame`/`last_frame` are optional (so pure
text-to-video+audio works), but you cannot ask H3 for silent video, and you cannot ask
it for audio without paying the full video sampling cost. If a silent variant is ever
wanted, it means decoding the video VAE alone and discarding the audio latent.

(Written after three wrong turns in the same session: this section first called H3's
audio an open scope question, then reached the right answer via the wrong evidence, then
invented a "LTX consumes, H3 synthesises" split that does not exist. The user corrected
it twice. The memory entry behind it — `project_product_scope`, which said "No audio/3D
planned" — has been fixed. Check `models.js` dependencies before claiming Vision lacks
an audio capability.)
