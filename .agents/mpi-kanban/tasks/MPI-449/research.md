# MPI-449 — MiniMax H3 weight research (2026-08-05)

Scope of this pass: **what to download and why**, int8 only. Nothing downloaded yet — the
user pulls the files by browser. Runtime measurement is the next pass.

## 0. The blocker that outranks everything technical

The **MiniMax H3 Community License Agreement** (release date 2026-08-02) defines:

> "Excluded Territories" means the European Union, the United Kingdom, the Republic of
> Korea and the United States of America.
> "Applicable Territory" means worldwide, excluding the Excluded Territories.

The licence grant is "expressly limited to the Applicable Territory", and the trigger is
"using, reproducing, modifying, distributing, running, or displaying any portion". Governing
law: Hong Kong. Commercial threshold: separate written authorisation above USD 20M/yr.

This machine is in the UK. So H3 is **not** a model Cubric Vision can ship the way LTX or
WAN ship — bench research is one thing, shipping weights or a graph to users is another.
Decide the licence question before any engine bump or `dependencies.js` entry.

Same clause is why no turbo LoRA exists yet (§4).

### Mitigations assessed (2026-08-05)

| Idea | Verdict |
|---|---|
| Don't re-host the weights; point the dep straight at Comfy-Org's HF repo | **Real, partial.** Kills the §III redistribution claim outright — the clearest and most enforceable one. Leaves our own §V.4 use, and §II's "encourage or permit any person to violate". Mechanically free: `downloadManager._mirrorUrlsFor` already allows arbitrary `url` + `noMirror`, and 65 existing deps already point at third-party HF repos |
| Free / open source / donation-funded | **No effect on rights.** §II's carve-out is territorial, not commercial. Drops us below §IV.1's USD 20M threshold and makes damages theoretical, so it lowers the stakes without changing the position |
| Watermark the output | **Nothing.** No provision anywhere trades marking for territory. §V.4 bars Outputs regardless. §III.3.b (AI identifier) and Exhibit A #12 are obligations layered on a licence you'd have to already hold, never a substitute |
| Apply for a licence | **The actual fix, and it worked.** §II ¶2 invites it, and MiniMax runs an official request form for excluded territories — linked from `docs/QA-about-License.md` in the H3 repo. Authorization was granted on 2026-08-05, same day as the request. **This repo is public and the request carries a confidentiality undertaking, so the request, the approval and the applicant details are held OUTSIDE it:** `C:/AI/Mpi/_private/minimax-h3-licence/`. Do not copy any of it back in |

The snag in an application is §V.5: safeguards that must be implemented, maintained, tested,
and not "permit the circumvention" of. An open-source local app cannot honestly promise
that. The draft states this plainly rather than agreeing to a term we can't meet.

**Precedent that the ask is not hopeless.** Comfy Org is in San Francisco — the USA is an
Excluded Territory — yet it hosts `Comfy-Org/MiniMax-H3` (distribution under §III), did the
pruning and int8 convrot quantisation (Model Derivatives under §I.11), and shipped day-zero
support, which needed pre-release access. And `realrebelai/MiniMax-H3_GGUFs` states verbatim:
"i have permission under a license agreement with MiniMax." MiniMax grants case-by-case
arrangements to both funded companies and lone contributors.

## 1. What the two DiTs actually are

Two separate 24-B-ish DiTs, one file each, **not interchangeable**:

| DiT | ComfyUI node | Covers |
|---|---|---|
| `fl2va` | `MiniMaxH3ImageToVideo` | **T2V** (no image connected), **I2V** (first frame), last-frame, and first+last-frame interpolation |
| `ref2va` | `MiniMaxH3ReferenceToVideo` | Omni-reference: <=9 images, <=3 videos (each may carry its own audio), <=3 standalone audio clips, <=12 files total. Prompt addresses them by tag `<Picture 1>` / `<Video 1>` / `<Audio 1>` |

`fl2va` is the everyday workhorse (three of the four ops). `ref2va` is the character /
style / voice-lock model — the one that matters for the LoRA-free character bet.

Both emit **video + native stereo 32 kHz audio in one pass** (NestedTensor latent pair:
video `[B,24,T,H/16,W/16]` + audio `[B,32,2,T40]`), 24 fps, 4–15 s.

Not in the open weights: **H3-Context-IR** (the hosted prompt-refinement front end MiniMax
calls "critical to quality") and **H3-Regenerate-2K** (the 768p→2K second pass). Local =
H3-Base only, 768p short edge. The "2K" headline is an API-only feature today.

## 2. `pruned` and `convrot` decoded

- **`pruned`** — Comfy pruned the modulation weights (~40% of params) and replaced them
  with lookup tables. Comfy states **no quality loss**. 66% smaller. There is no reason to
  take a non-pruned file; the 34.04 GB `int8_convrot` and 40.23 GB `pruned_bf16` are
  strictly worse deals than `pruned_int8_convrot` at 20.97 GB.
- **`convrot`** — rotation-based (Hadamard-style) quantisation, group size 256, applied
  row-wise before int8. **Native ComfyUI core**, no custom node: `comfy/ops.py` handles
  `int8_tensorwise` + `convrot` and `convrot_w4a4`, `comfy/quant_ops.py` registers the algo.
  Runs on Ada — it is not a Blackwell format.
- **`nvfp4_awq`** — Blackwell (RTX 50xx) native format. The official templates default the
  text encoder to it, which is wrong for a 4060 Ti (sm_89). Swap it for `int8_convrot`.

## 3. The download list — int8, RTX 4060 Ti 16 GB + 64 GB RAM

All from `https://huggingface.co/Comfy-Org/MiniMax-H3` (ungated).

| File | Size | Target folder |
|---|---|---|
| `diffusion_models/minimax_h3_fl2va_pruned_int8_convrot.safetensors` | 20.97 GB | `C:/AI/diffusion_models/` |
| `diffusion_models/minimax_h3_ref2va_pruned_int8_convrot.safetensors` | 20.97 GB | `C:/AI/diffusion_models/` |
| `text_encoders/qwen3vl_32b_minimax_h3_int8_convrot.safetensors` | 27.14 GB | `C:/AI/text_encoders/` |
| `vae/minimax_h3_video_vae_fp16.safetensors` | 5.21 GB | `C:/AI/vae/` |
| `vae/minimax_h3_audio_vae_fp32.safetensors` | 0.61 GB | `C:/AI/vae/` |

Both DiTs = **74.90 GB**. One DiT (start with `fl2va`) = **53.93 GB**.

**Revised recommendation — int8 DiT, int4 text encoder.** Swapping the encoder for
`qwen3vl_32b_minimax_h3_int4_convrot.safetensors` (14.95 GB, from
`Abiray/Minimax-H3-nvfp4-INT4-INT8-Convrot`; there is no int4 encoder in Comfy-Org's repo)
drops the one-DiT set from 53.93 to **41.74 GB** and takes real pressure off system RAM
during the encode pass. int8 is kept where it matters — the DiT. Arrived at by reverse-
engineering a shipping third-party pack whose stated footprint is "about 40GB for Text to
Video and Image to Video, plus 20GB if you add Reference to Video": 20.97 + 14.95 + 5.21 +
0.61 = 41.74, and the "+20GB" pins the second DiT at pruned int8 rather than int4 (11.34).
Same source claims 12 GB VRAM minimum / 16 GB recommended, and that system RAM matters more
than VRAM — consistent with Comfy's own 8–12 GB + dynamic-offload claim. Unverified here.
`C:` has **205.8 GB free**, so the 53.7 GB ceiling on `G:` recorded in the brief no longer
applies — the storage half of the card is answered.

`extra_model_paths.yaml` on the bench had **no C:/AI mapping for text_encoders or vae** —
added under `comfyui_external` on 2026-08-05, and `C:/AI/text_encoders/` + `C:/AI/vae/`
created. Needs a bench restart to take effect.

**Text encoder note:** Comfy-Org's 27.14 GB encoder already omits Qwen3-VL language layers
50–63, the final norm and the LM head — H3 consumes the *unnormalised* hidden state after
layer 49. So it is not a "full 32B" download; there is nothing further to trim without
dropping precision.

### DECIDED 2026-08-05 — the encoder actually downloaded

**`ethanfel/Qwen3-VL-32B-Ultra-Heretic-H3-ComfyUI-INT8-ConvRot`**, file
`qwen3vl_32b_h3_ultra_uncensored_heretic_int8_convrot.safetensors`, **26.36 GB**, verified
against the repo's own `SHA256SUMS` (`d84547412144b7c50a6ec77437a889b869d3ace88da77ef1775d3d2a4901c192`).
Chosen over Comfy-Org's official 27.14 GB int8 for two reasons, both from its README:

- **Complete vision tower retained in BF16**, all norms BF16, 551 BF16 tensors. Only the
  350 language matrices are int8 convrot (group 256). The reference-image path — the one
  r2v identity depends on — is therefore full precision.
- Correct H3 shape: embedding + language layers 0–49, omitting 50–63 / final norm / LM head.

Caveat to keep honest: the base is `llmfan46/Qwen3-VL-32B-Instruct-ultra-uncensored-heretic`,
a **fine-tune**, not pure abliteration. Prompt adherence may differ from stock in either
direction. Comfy-Org's 27.14 GB file is the clean control if that ever needs isolating.

**int4 encoders were rejected, with evidence.** `ApacheOne/qwen3vl_32b_ConvRot_int4_int8_ComfyUI`
publishes a quant report:

| Build | Size | Worst sampled rel-RMSE | cos |
|---|---|---|---|
| `MAX_INT4_native_math` | 14.27 GB | **18–19%** | 0.982 |
| `MIXED_INT4_INT8` | 20.42 GB | **1.194%** | 0.99993 |

MAX_INT4 quantises the **vision tower** too (`visual.blocks.26.attn.proj.weight`, 18.05%
at int4 g=64) — precisely the reference-image path. Abiray's `int4_convrot` (14.95 GB)
publishes no report but is the same size class; assume comparable. If RAM ever forces a
cut, take ApacheOne's MIXED at 20.42 GB, never a 14–15 GB int4.

Other H3-shaped abliterated encoders surveyed (all correctly truncated to layers 0–49;
generic Qwen3-VL abliterated repos are transformers-format LLMs and will NOT load in a
`minimax` CLIPLoader): `nif0/...-Minimax-H3-GGUF` L0-49 Q4_K_M 14.93 GB / IQ4_XS 13.41 /
IQ3_XS 10.23 (needs ComfyUI-GGUF); nvfp4 heretic variants from Abiray, sakamakismile and
an OTMFLY mirror — Blackwell, skip. No abliterated int4_convrot exists.

### Deliberately skipped

| File | Why not |
|---|---|
| `*_bf16` (66.28 GB), `*_pruned_bf16` (40.23 GB) | No headroom, and pruned int8 is the shipped default |
| `*_int8_convrot` unpruned (34.04 GB) | Pruning is free; 13 GB for nothing |
| `*_pruned_fp8_scaled` (20.96 GB) | Same size as int8_convrot, and convrot is the format Comfy's own templates ship with |
| `qwen3vl_32b_..._nvfp4_awq` (15.69 GB) | Blackwell format; the templates' default is a 50-series assumption |
| `qwen3vl_32b_..._bf16` (51.51 GB) | Would not fit alongside a DiT in 64 GB RAM |

### Community mirrors — checked, not needed

- `Abiray/Minimax-H3-nvfp4-INT4-INT8-Convrot` — biggest community hub (43k dl). Its int8
  files are byte-identical in size to Comfy-Org's. Adds **int4_convrot** DiT (11.34 GB),
  **mixed int4/int8** (15.90 GB, ~15.5 GB VRAM) and an **int4 text encoder** (14.95 GB).
  Out of scope while int8-only, but this is the fallback if int8 turns out to crawl.
- `Gluttony10/MiniMax-H3-INT8-CONVROT` — 47 GB unpruned int8. No.
- `realrebelai/MiniMax-H3_GGUFs` (84k dl combined with Abiray's) — Q2_K/Q3_K_M/Q4_K_M,
  15.6–19.9 GB. Needs ComfyUI-GGUF and goes in `unet/`. Not int8; parked.
- `ethanfel/Qwen3-VL-32B-Ultra-Heretic-...-INT8-ConvRot` — uncensored/abliterated Qwen3-VL
  encoder, 26.36 GB, plus a 7.61 GB "generation tail" (layers 50–63 + LM head) that only
  the author's `ComfyUI-MiniMax-H3-Guide` node uses for prompt enhancement. Interesting for
  prompt-rewriting later; irrelevant to base generation.
- `Kijai/MiniMax-H3-TAE` — README only, no weights yet. Watch it: a tiny AE would give
  cheap latent previews on a model where a full video VAE decode is 5.21 GB.

## 4. Turbo / lightning LoRA — none exists

- Searched HF by name for lora / lightning / turbo / distill against H3: **zero hits.**
- The official `MiniMaxAI/MiniMax-H3` repo has no distill or LoRA folder.
- H3 is **guidance-distilled but not step-distilled**. That is why the templates use
  `BasicGuider` + `SamplerCustomAdvanced` with no CFG node — CFG is baked in, one forward
  pass per step.
- Comfy-Org discussion #11: "Ostris is already working on a 4-step LoRA for H3." Same
  thread notes the Excluded-Territories clause is what stops LightX2V and other EU/US/UK
  authors from publishing a turbo LoRA at all. Expect a slow, non-Western trickle.
- Community step advice today: **15 steps is reportedly indistinguishable from 20**, plus
  the `easycache` node. That is the only speed lever until a distill lands.

## 5. Sampling recipe from the official templates

**Correction (2026-08-05): the templates DO appear in the bench's template browser.** The
earlier claim here — "not in the installed `comfyui_workflow_templates` 0.11.31, so they
will not appear" — was misleading. The installed package is an `__init__.py` **stub with
no `templates/` directory at all**; the frontend fetches the index remotely, so the pin
never gated H3. Six H3 entries exist upstream and all six show in the browser:

| Name | Tags | What |
|---|---|---|
| `video_minimax_h3_{t2v,i2v,r2v}` | no `API` tag | **local weights — these** |
| `api_minimax_h3_{t2v,flf2v,r2v}` | `API` | MiniMax's hosted paid endpoint |

Filter **Runs on → Local** to hide the API three. The hand-placed copies at
`G:/ComfyUi/ComfyUI/user/default/workflows/MiniMax_H3_*.json` are redundant.

Both local templates default the CLIPLoader to `qwen3vl_32b_minimax_h3_nvfp4_awq` —
**wrong for Ada, must be swapped** (§2).

- Sampler `res_multistep`; scheduler `simple` (the r2v note says **`beta` or `normal` beats
  `simple` for reference-heavy prompts**); 20 steps, denoise 1.0
- `BasicGuider` (no CFG), `RandomNoise`, `SamplerCustomAdvanced`
- The single joint LATENT feeds **both** `VAEDecode` (video VAE) and `VAEDecodeAudio`
  (audio VAE)
- Frame count must satisfy `n % 17 == 5`. The templates do it with a
  `ComfyMathExpression`: `max(5, round(a * 24)) + (5 - (max(5, round(a * 24)) % 17)) % 17`
  where `a` = duration in seconds. 5 s → 124 frames.
- Canvas: 768 short edge, 768x1344 cap, each axis a multiple of 32. `ResolutionSelector` at
  0.4 MP → 864x480 for 16:9.
- `ref_image_size`: `match` = downscale refs to output res (fast); `max` = up to 2048 short
  edge for identity fidelity, but reference tokens ride along **every** step.
- **Sage Attention roughly doubles speed** per Comfy's docs (some layers fall back).

## 5b. Canvas rules, and the ratio table already landed in the app

Read from `comfy_extras/nodes_minimax_h3.py` at 0.30.2, not from docs.

**`adapt_canvas()` = 768 short edge, 768x1344 area cap (0.98 MP), each axis /32.** That is
the trained canvas and it is why the template's size note has an odd `0.98` row.
**It is NOT enforced on the output.** `adapt_canvas` is called exactly once, at line 241,
to conform **reference videos** in r2v; the entry nodes take `width`/`height` raw
(`height // 16`). So a bigger canvas will run — it just leaves the distribution. Every
node defaults to 1344x768, which is the tell.

The `Note: Size Settings Reference` table is **byte-identical across all three templates**
(sha1 `9b4d025948f9`) and is just the 16:9 column of core's `ResolutionSelector` at
`multiple=32`. Only the node *default* differs: t2v and r2v open on 16:9, i2v on **1:1**.
`ResolutionSelector`'s formula is symmetric in w/h, so 9:16 is the exact transpose of 16:9
— no separate table needed. Its enum has 8 ratios; `9:21` is the only gap.

**Shipped to `js/utils/ratios.js` as `MINIMAX_H3_RATIOS`** (5 tiers, `'quality'` mode,
provisional type key `h3`, inert until MPI-452 wires a ModelDef — same status
`WAN_5B_RATIOS` has had). `very_high` = `adapt_canvas` output; the four below are Comfy's
own MP anchors. **1:1 is the short edge of each tier's 16:9 pair (the LTX rule), NOT
`ResolutionSelector`'s square** — that would give 800 at 0.6 MP and 1024 at 0.98, both off
H3's canvas. Consequence worth surfacing in the UI: **square tops out at 768x768, so a 1:1
H3 video is genuinely lower-res than a 16:9 one** — the short-edge rule binds before the
area cap. No 2K/4K tier: H3-Regenerate-2K is API-only (§1).

**One node covers four ops.** `MiniMaxH3ImageToVideo` + the `fl2va` DiT serves T2V (nothing
connected), I2V (first_frame), last-frame, and first+last interpolation — `first_frame` and
`last_frame` are optional. The t2v and i2v templates are the *same graph*. For Vision that
is one workflow file with optional image inputs, not four. Only `ref2va` is a different
graph and a different DiT.

**The templates' `MathExpression` is redundant.**
`max(5, round(a*24)) + (5 - (max(5, round(a*24)) % 17)) % 17` converts seconds to frames and
snaps up to `n % 17 == 5`. `temporal_shape()` already calls `align_frame_count()`, the same
`while n%17!=5: n+=1`. The node exists only so the UI can expose seconds; a raw frame count
in `length` is snapped anyway. (Why 17: `video_latent_t(n) = 2 if n<=5 else ((n-5)//17)*5+2`.)

## 6. Runnability — MEASURED 2026-08-05. It runs.

**H3 runs on the RTX 4060 Ti 16 GB. No OOM, no crawl.** That answers the card's first
acceptance criterion, measured not guessed. Two i2v runs off the shipped
`video_minimax_h3_i2v` template, read from the bench's own `/history` (not a stopwatch):

| Run | Seed | Time | Note |
|---|---|---|---|
| `dc0da971` | 1 | **160.0 s** | cold — includes first load of ~47 GB of weights |
| `824a0af0` | 1 | 0.013 s | identical seed, fully cached, measures nothing |
| `4249c26f` | 2 | **131.0 s** | warm — seed-only change, models resident |

Config for all three: 640x640, 2 s → **56 frames** (`n % 17 == 5`), 20 steps,
`res_multistep` + `simple`, denoise 1.0, DiT `minimax_h3_fl2va_pruned_int8_convrot`,
encoder `qwen3vl_32b_h3_ultra_uncensored_heretic_int8_convrot` (ethanfel).

> **These runs were NOT on a clean box — treat every time here as an UPPER BOUND.** A
> Cubric-Prompt agent was running LLM tests concurrently: Ollama's `llama-server` with a
> vision model (`--mmproj`), cycling load→test→unload, spiking to ~9.5 GB VRAM and
> competing for system RAM — the exact resource H3 needed, with 24.5 GB of weights living
> in shared memory. It was NOT a steady steal: the dedicated-VRAM trace during the H3 run
> is a flat 14.8 GB plateau, so ComfyUI held most of the card. Clean warm time is
> **≤ 131 s** and the projections below shift down with it. Re-run seed-only with the
> Cubric-Prompt agent stopped before quoting any of this as final.

- **Warm = 6.55 s/step.** Model load overhead = **29 s** (160.0 − 131.0).
- Normalised: **5.711 µs per pixel-frame** warm.
- Third-party reference was 194 s for 20 steps at 864x480 / 124 frames = 51.4 M
  pixel-frames. That is **2.24x our work in 1.21x our time**, so that machine is ~1.5x
  faster per pixel-frame than this one. The 4060 Ti is in the same league, not an
  outlier.

Projected warm times at 20 steps, from the measured rate (16:9 column of
`MINIMAX_H3_RATIOS`):

| Tier | 16:9 | 2 s (56f) | 5 s (124f) |
|---|---|---|---|
| very_low | 608x352 | 68 s | 152 s |
| low | 736x416 | 98 s | 217 s |
| medium | 864x480 | 133 s | 294 s |
| high | 1152x640 | 236 s | 522 s |
| very_high | 1344x768 | 330 s | 731 s |

**These are floors, not estimates.** Linear-in-pixel-frames is optimistic — attention is
quadratic in token count and the larger tiers spill harder. Treat medium/5 s ≈ 5 min as
the best case.

### Memory behaviour during the run

Task Manager at peak, cross-checked against `/system_stats`:

- System RAM **60.0 / 63.8 GB (94%)**, Comfy reporting **3.8 GB free** of 68.5.
  (68.5 = what Comfy sees; 63.8 = Windows usable after hardware reserve. Both correct.)
- GPU dedicated **14.8 / 16.0 GB**, shared **24.5 / 47.8 GB** — 24.5 GB of weights
  streaming over PCIe every step. That is where the 6.55 s/step goes.
- GPU utilisation **98%** at 75 °C — it is computing, not just thrashing.
- `torch_vram_total` reports only **1.38 GB**. Torch's tracked pool is nearly empty while
  Task Manager shows 14.8 GB dedicated: under the `cudaMallocAsync` backend the weights
  sit outside torch's allocator, so **Comfy's own VRAM accounting cannot see them**. Do
  not diagnose H3 memory from `/system_stats` alone.

### Consequences

1. **The pruned-vs-unpruned A/B is probably not runnable on this box.** Pruned (20.97 GB)
   already pushed 24.5 GB into shared memory with 3.8 GB of RAM left. Unpruned adds
   13 GB and there is nowhere for it to go. `minimax_h3_fl2va_int8_convrot` (34.04 GB) is
   downloaded and on disk; if it OOMs or pages, record that as the answer rather than
   fighting it — Comfy states pruning is lossless anyway (§2).
2. Still not separately measured: whether ComfyUI unloads the encoder before the DiT
   loads, and what audio decode costs on its own. Both are inside the 131 s.
3. Close the browser before any further timing run — ~15 Chrome tabs at 94% RAM is the
   difference between offloading and paging to disk.

## 6b. The engine bump is a HARD gate, not a preference

`EmptyMiniMaxH3LatentAV`, `MiniMaxH3ImageToVideo`, `MiniMaxH3ReferenceToVideo`,
`MiniMaxH3SigmaShift` and the `minimax` CLIPLoader type are **core nodes introduced in
ComfyUI 0.30.0**. There is no custom-node package that backports them. The app engine is
pinned at **0.29.2** in `dev_configs/system_dependencies.json`, so **no H3 graph can run
in Cubric Vision at all until the engine is bumped** — this is not a quality or
performance trade-off, the nodes simply do not exist.

So MPI-452 (H3 model wiring) has **two** blockers, not one:

1. **MPI-451** — the licence gate.
2. **The 0.29.2 → 0.30.x engine bump** — its own card, carrying the standing risk from
   `.claude/rules/comfy_engine.md`: a core bump can break version-sensitive custom nodes,
   so the node-floor pairing check runs before the tag is picked. Encouraging evidence
   from this card: the bench went 0.29.2 → 0.30.2 with **zero import failures across all
   20 custom-node packs** and torch untouched. That is the bench's node set, not the
   engine's, so it lowers the risk rather than clearing it.

## 7. Sources

- <https://huggingface.co/Comfy-Org/MiniMax-H3> (file tree + README, via HF API)
- <https://huggingface.co/MiniMaxAI/MiniMax-H3> (README + LICENSE)
- <https://blog.comfy.org/p/minimax-h3-day-0-support-in-comfyui>
- <https://docs.comfy.org/tutorials/video/minimax/minimax-h3>
- <https://huggingface.co/Comfy-Org/MiniMax-H3/discussions/11>
- `github.com/Comfy-Org/workflow_templates` `templates/video_minimax_h3_*.json`
- Bench source: `G:/ComfyUi/ComfyUI/comfy/ops.py`, `comfy/quant_ops.py`,
  `comfy/text_encoders/minimax.py`, `comfy_extras/nodes_minimax_h3.py`
