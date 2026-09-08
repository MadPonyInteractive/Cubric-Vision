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

## 4a. LoRA: H3 takes MODEL **and** CLIP — decided 2026-08-06

**The encoder really does influence the output**, so a LoRA trained with encoder weights is
not a no-op. The text encoder runs **once**, inside the node
(`comfy_extras/nodes_minimax_h3.py:141-142`):

```python
tokens = clip.tokenize(prompt, images=images)
cond   = clip.encode_from_tokens_scheduled(tokens)
```

That `cond` is consumed at **every** sampling step, so patched encoder weights steer the
whole run. For H3 this is a bigger lever than a normal TE LoRA: note `images=images` — the
"clip" is the **qwen3vl VL tower** and it ingests the KEYFRAME as well as the prompt, so an
encoder LoRA shapes how the model reads the input IMAGE, not just the text.

**DECISION: H3 ships 6 LoRA slots with BOTH strengths.** Requires only two things in
MPI-452, no UI work:

1. Workflow uses **`MpiLoraModelClip`** — the established 6-slot node, wired as a chain
   (`Input_Lora_1` .. `Input_Lora_6`, each taking `model` + `clip` from the previous).
   Copy LTX's rack; do NOT use core `LoraLoader`.

   > **Correction, 2026-08-06.** An earlier revision of this section claimed H3 would be
   > the FIRST model here with a clip path, on a count of "19 LoRA nodes, all
   > `LoraLoaderModelOnly`". That count was wrong — the grep pattern
   > `"class_type": "Lora[A-Za-z]*"` cannot match `MpiLoraModelClip`, which does not start
   > with `Lora`. Real counts across `comfy_workflows/*.json`: **`MpiLoraModelClip` 141**,
   > `MpiLoraModel` 128, `LoraLoaderModelOnly` 12, `MpiStyleLoras` 10. Clip strength is the
   > MAJORITY pattern, and `models.js` already ships `loraStrengths: ['model','clip']` on
   > two models. H3 is ordinary here, not a precedent.
2. Leave `loraStrengths` **unset** in the ModelDef. `MpiModelSettings.js:598` already
   defaults to `['model','clip']`, `_buildStrengthsRow` renders whichever knobs are listed,
   and `LORA_COUNT = 6` is app-wide. Nothing to build.

**Mechanics confirmed from comfy source:**

- CLIP side: `model_lora_keys_clip` has a generic `text_encoders.*` fallback with no
  special-casing, and the minimax TE is a plain `comfy.sd1_clip.SD1ClipModel` subclass
  (`MiniMaxH3TEModel`) built through the normal CLIP path (`comfy/sd.py:1800-1801`), so it
  patches like any other CLIP. Clip strength is a silent no-op on a LoRA with no TE keys —
  not an error.
- Quantization is NOT a blocker: `model_patcher.py` handles `QuantizedTensor` explicitly
  (lines 960, 1721, 1912). But the shipped encoder is int8_convrot, so expect quantization
  noise to swallow small deltas — train/validate against the quant that ships.
- **TRAP — model side has NO H3 branch.** `model_lora_keys_unet` has 17 named model
  branches (SD3, Flux, Krea2, Kandinsky5, HunyuanVideo...) and MiniMax H3 is not one. H3 is
  served only by the generic `diffusion_model.*` -> `lora_unet_*` loop. So a
  **Diffusers-format** H3 LoRA loads WITHOUT ERROR and does nothing, because the
  Diffusers->comfy key conversion only runs inside those per-model branches. Anyone testing
  a community LoRA and concluding "H3 ignores LoRAs" has probably hit this.

**Wrong lever for skin texture.** Conditioning steers semantics; skin micro-texture is
produced by the DiT and decoded by the VAE, and section 5b already found the VAE round-trip
scrubs high-frequency regardless. An encoder LoRA can push toward "grainy film photograph";
it cannot add detail the DiT does not render. For texture the DiT is the target — or a
grain pass in post. Cost asymmetry: the encoder is 32B, a far heavier training target than
the DiT, for a lever that is indirect on texture.

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

**The table is one tier SHORT by this repo's own convention** (found 2026-08-06). The
argument above — H3's canvas is fixed at 768 short edge, so the ladder stops there — does
not survive `ratios.js:56-58`, which ships WAN a `very_high` of 1920x1088 while calling
720p "the documented CEILING" and the tier "ABOVE native (works, but extrapolated ->
detail tier, expect artifacts)". So an above-native detail tier is the established
pattern here, not an exception. H3 would extrapolate *less* than WAN already does:

| | native | very_high | linear |
|---|---|---|---|
| WAN 2.2 14B | 1280x720 | 1920x1088 | 1.50x |
| H3 (proposed) | 1344x768 | 1920x1088 | 1.43x |

1088 and 1920 are both /32, so H3's grid stays clean. **DECIDED by the user 2026-08-06
after running it: SHIP `very_high` = 1088x1920, matching WAN and LTX.** Tested at 56
frames against 768x1344 and judged good — "this settles it when it comes to resolution".
Eye rendering in particular was called better than any open-source model the user has
seen.

**The cost is the catch, and it reclassifies the tier.** Scaling is steeply superlinear,
because attention is quadratic in token count and tokens track pixels:

| canvas | MP | 56 f | vs previous row |
|---|---|---|---|
| 480x864 | 0.41 | 157 s | - |
| 768x1344 | 1.03 | 467 s | 2.5x px -> 3.0x time |
| 1088x1920 | 2.09 | **1537 s** | 2.0x px -> **3.3x time** |

25.6 minutes for a 2.33 s clip, and 124 frames would be roughly an hour. `very_high` is a
**final-render tier, not an iterate tier** — which is precisely the case the two-stage
preview flow in section 7 exists to serve. Memory is NOT the limit at this canvas: 13.2/16 GB
dedicated with headroom and 55.5/63.8 GB system, i.e. LOWER than the 14.7 GB seen at
640x640, because ComfyUI keeps fewer weights resident to leave room for activations.
**Memory has now been a poor predictor for H3 in both directions — by file size (section
6a) and by canvas size. Stop using it to predict anything here.**

**Composition is NOT seed-stable across a canvas change.** A different canvas is a
different latent shape, so the same seed is a different sample, not the same shot with
more detail — observed as the subject being framed nearer in one tier and further in
another. Consequence: a tier A/B can never be read as "same shot, sharper", and the
picker must not imply that.

**Ladder consequence, still OPEN for MPI-452.** Making `very_high` = 1088x1920 must not
just overwrite the current `very_high` (768x1344), because that would drop the native
in-distribution canvas from the picker. WAN's ladder puts its native at `high`
(1280x720) and the extrapolated one at `very_high`; copying that exactly gives:
very_low 352x608, low 480x864, medium 640x1152, high **768x1344** (native), very_high
**1088x1920** (extrapolated), dropping 416x736. Not yet applied to `ratios.js`.

**Note the template's own
`Note: Size Settings Reference` going to 2.0 MP is NOT evidence for this** — it is the
generic `ResolutionSelector` column, byte-identical across all three templates; the H3
row in it is 0.98 (1344x768), and everything above is the generic ladder continuing.

**Resolution trades texture for cleanliness, and the source image does not control it**
(observed 2026-08-06, same source across all canvases). Going up, noise drops and morphing
drops, but skin turns smooth and plastic. Mechanism is the one above: the subject spans
more latent cells, so the model has the capacity to render its own prior for skin — and
that prior is clean. At 480x864 it cannot resolve skin, and the coarser decode reads as
grain. The user preferred 480x864 for that texture.

**That texture is NOT the source's grain.** The source in these runs carried heavy added
Photoshop grain, and it cannot be the cause: 480x864 and 768x1344 shared the same source
and differed anyway, so resolution is the only variable that moved. High-frequency grain
is destroyed by the lanczos downscale and the /16 encode before the model sees it (and the
VL tower gets the already-resized image), so a de-grained source should change little.
**Product consequence: grain belongs in a post pass, not in a tier choice** — picking a
lower tier to get texture silently costs morphing and detail. Untested and worth one run:
the same seed at 480x864 with a de-grained copy, which would confirm the stripping claim
live rather than from source reading.

**One node covers four ops.** `MiniMaxH3ImageToVideo` + the `fl2va` DiT serves T2V (nothing
connected), I2V (first_frame), last-frame, and first+last interpolation — `first_frame` and
`last_frame` are optional. The t2v and i2v templates are the *same graph*. For Vision that
is one workflow file with optional image inputs, not four. Only `ref2va` is a different
graph and a different DiT.

**`first_frame` is PLAIN-STRETCHED to the canvas — `last_frame` is not.** In
`MiniMaxH3ImageToVideo.execute`, `first_frame` gets `_resize(..., crop="disabled")` (the
comment calls it a "geometry anchor") while `last_frame` gets `crop="center"`, an
aspect-preserving cover-crop. So an i2v source whose aspect does not match the chosen
canvas is **squashed**, and every generated frame inherits the distortion. **MPI-452 must
fit the first frame to the canvas aspect before dispatch** (or drive the canvas from the
image aspect) rather than handing an arbitrary image to the node.

**The i2v template already ships the fix, disconnected.** A "Use Image Size" group sits in
`video_minimax_h3_i2v` — `ImageScaleToTotalPixels` (id 119) into `GetImageSize` (id 120) —
with **no input source and zero output links**; `ResolutionSelector` (id 115) drives the
canvas instead. It is `mode=ALWAYS`, not bypassed, and only avoids erroring on its empty
required input because ComfyUI prunes unconsumed branches from execution. Wire
`LoadImage -> 119` and `120.width/height -> the H3 node` and the canvas follows the source
aspect, making the plain stretch a no-op. **Its shipped default overshoots H3's canvas**,
though: widgets are `['nearest-exact', 1, 32]` = 1.0 MP, which puts a square source at
1024x1024 against a 768 native square and 16:9 at 1376x768 against 1344x768. Whatever
copies this pattern must clamp to `adapt_canvas`, not to a megapixel target.

Related, same call site: the keyframe is lanczos-resized and then VAE-encoded at /16, and
the VL tower at line 141 receives the **already-resized** image. Split the consequence by
frequency, because the two halves have different causes and different fixes:

- **High-frequency** (grain, sensor noise, JPEG blocking) is destroyed by the lanczos
  downscale and the /16 encode. The model never sees it. Preprocessing, not blindness.
- **Low-frequency** (blur, smear, blown highlights, edit seams, upscale mush) survives
  both and reaches the model intact. Observed 2026-08-05 on a heavily-degraded 1262x1262
  dataset photo at 640x640: H3 did not carry that character into the generation. That is
  **regression toward a clean training distribution**, and it is what every video model
  does. Pruning is not the cause — modulation weights do not carry "notice the degradation".

**Fine detail is bounded by the /16 latent grid, and one clip proved it.** The video latent
is `[B,24,T,H/16,W/16]`, so 640x640 = a **40x40** grid, native 768x768 = 48x48, native
1344x768 = 84x48. A tattoo covering ~20% of frame width gets ~8 latent cells across —
below the representable resolution, so the model re-invents plausible linework each frame
instead of tracking the design.

Observed 2026-08-05, and it is self-isolating: in a single i2v clip where the subject walks
toward the camera, the tattoos **morph heavily while she is far away and stabilise as she
fills the frame**. Same seed, same model, same run — the only variable is how many latent
cells the tattoo occupies. That rules out pruning, source-image quality and model capability
in one observation.

Product consequence: **raising the tier does not fix this.** Native square is 48 cells vs
40, only 1.2x linear. H3 at a 768 short edge structurally cannot hold tattoo or text detail
in a wide shot. The three real answers are crop tighter so the subject fills the canvas, run
a detail pass afterwards, or use **`ref2va`** — its references go through the VL tower at
`ref_image_size: 'max'` (up to 2048 short edge) and ride along every step, which is identity
conditioning independent of the subject's apparent size in frame. That last one is the
LoRA-free character bet and is worth testing after the A/B.

Diagnostic that separates them, and it is free on any existing output: compare output
**frame 0** to the source. The keyframe is a condition latent re-injected every step and
never denoised, so frame 0 is the closest the run gets to the input. Artefacts present at
frame 0 and gone later = temporal drift toward the prior (prompt-addressable). Frame 0
already clean = the VAE round-trip is scrubbing it (no prompt will fix that).

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

1. ~~The pruned-vs-unpruned A/B is probably not runnable on this box.~~ **Wrong — it ran
   fine. See § 6a.**
2. Still not separately measured: whether ComfyUI unloads the encoder before the DiT
   loads, and what audio decode costs on its own. Both are inside the 131 s.
3. Close the browser before any further timing run — ~15 Chrome tabs at 94% RAM is the
   difference between offloading and paging to disk.

## 6a. RESOLVED — pruned wins on download size. Re-confirmed 2026-08-06 at 768x1344.

> Do not re-run this A/B at SHORT lengths — it has now been run three times and the
> answer has not moved. The one open question is long clips; see the caveat at the end
> of this section.

Measured 2026-08-05 on the bench, `MiniMaxH3ImageToVideo`, 640x640, 56 frames, 20 steps,
`res_multistep` + `simple`, denoise 1.0, ethanfel int8 encoder, same prompt and same source
image throughout. Only `unet_name` varied.

| DiT | Size | Time | Box |
|---|---|---|---|
| `minimax_h3_fl2va_pruned_int8_convrot` | 20.97 GB | **160.0 s** cold | LLM agent running |
| `minimax_h3_fl2va_int8_convrot` | 34.04 GB | **162.0 s** cold | LLM agent paused |

**+13 GB of weights bought 2 seconds (1.25%) and, by eye, ~2% less tattoo morphing.** The
unpruned run had the *cleaner* box, so that gap if anything flatters it. Audio differed
between the two, but that is expected and carries no signal: the same seed through
different weights is a different trajectory end to end.

**Decision: ship pruned.** Comfy's "no quality loss" claim holds at this resolution, and
`minimax_h3_fl2va_int8_convrot` (34.04 GB) can be deleted to reclaim disk. MPI-452's
dependency entry takes the pruned file.

Two predictions this falsified, recorded so they are not repeated:

- **"Unpruned will not fit / will page."** It ran. Memory was near-identical —
  14.7 GB dedicated + 24.9 GB shared, versus pruned's 14.8 + 24.5. ComfyUI streams weights
  per layer, so resident footprint is capped by what fits, **not by file size**. A model
  being larger than VRAM plus comfortable RAM headroom is not, on its own, a reason to
  expect failure here.
- **"The size gap will show up as a time gap."** It did not. At this canvas H3 is
  compute-bound, not weight-transfer-bound.

Not measured, and deliberately not chased: unpruned **warm**. It would only reveal load
overhead, which changes no decision.

### CONFIRMED at higher resolution 2026-08-06 — with one new finding

Re-run by the user at two larger canvases, 56 frames, seed 4, 20 steps, same prompt and
source image, only `unet_name` varied:

| canvas | pruned | unpruned | delta |
|---|---|---|---|
| 480x864 | 157.02 s | 152.42 s | pruned **slower** by 4.6 s |
| 768x1344 | 467.28 s | 491.12 s | pruned faster by 23.8 s (-4.9%) |

**The sign flips, so time is not an argument either way.** Both deltas sit inside the
~25 s run-to-run spread measured in section 7. This retires the timing half of this A/B
for good - stop quoting seconds as a reason to prefer either file.

**Spatial quality: equal at both canvases.** Confirms the 2026-08-05 call at a canvas
2.7x larger.

**NEW - the difference is TEMPORAL, not spatial.** At 768x1344 the unpruned run is
slightly more expressive in facial motion: wider smile, more eye crinkle, on the same
seed and source. Pruned is a little more restrained. Visible on stills, not subtle
enough to need frame-by-frame. Judged not worth 13 GB by the user.

**Decision stands: ship pruned.** But the reason is narrower than it looks. Of the three
candidate arguments, two are dead:

- speed - dead, sign flips, inside noise (above)
- resident memory - dead since 2026-08-05, ComfyUI streams per layer so footprint is
  capped by what fits, not by file size (the falsified predictions above)
- **download size - the only real argument, and it is a big one: 20.97 GB vs 34.04 GB
  is 13 GB the user does not have to download or store.** For a shipped product that is
  decisive on its own.

**FINAL 2026-08-06: the unpruned file is DELETED.** `minimax_h3_fl2va_int8_convrot.safetensors`
(34,038,892,334 bytes) removed from `C:/AI/diffusion_models/` at the user's instruction,
31.7 GiB reclaimed. `minimax_h3_fl2va_pruned_int8_convrot.safetensors` (20,970,379,616 bytes)
is the file MPI-452's dependency entry takes. Re-downloadable from `Comfy-Org/MiniMax-H3`
if the long-clip caveat below ever forces a re-test.

**CAVEAT, and it is the same trap as section 9.** The expressiveness gap was observed at
**56 frames**, the shortest length H3 makes and less than half the trained minimum.
Pruning removes capacity, and the damage now has a demonstrated temporal signature -
which is exactly the axis that would compound over a longer sequence. A gap that reads
as "not worth 13 GB" at 2.33 s is not proven to stay that small at 124-362 frames.
**Re-check before a 5-15 s tier default in MPI-452**; do not treat this row as closed
for long clips.

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

---

## 7. Two-stage sampling on H3 — settled 2026-08-06

**Split the sigma schedule, don't split the model.** `SplitSigmas(step=5)` feeds
stage 1 the high sigmas and stage 2 the low ones; stage 2 runs `DisableNoise`.
Three-way A/B at 352x352, same seed: original single-stage == our split run in one
pass == save/load across two runs. **Bit-for-bit equal.** That proves `res_multistep`
resumes exactly, and that the latent survives the disk round-trip (bf16 -> safetensors
-> `.float()` -> sampler loses nothing).

Save `SamplerCustomAdvanced.output` (noisy, at sigma[N]) and preview
`denoised_output` (the x0 estimate). Saving the denoised estimate and resuming from
it looks plausible and is silently wrong.

**5 steps is enough for a preview at 352x352** — 5, 6, 7 and 8 were indistinguishable.
**Still measured out of range only.** The 2026-08-06 in-range session ran stage 1 at 5
steps and got a usable preview, but did NOT re-run the 5/6/7/8 comparison at 124
frames, so the floor itself is unconfirmed in range. See § 9.

### Timings, 352x352 / 56 frames — SUPERSEDED, below trained range

| | s |
|---|---|
| single-stage, 20 steps + decode | 34.64 |
| stage 1, 5 steps + preview decode | 12.00 |
| stage 2, 15 steps + decode | 24.00 |
| two-stage total | 36.00 (**+1.4 s, +4%**) |

Kept only as the out-of-range reference. Use the in-range table below.

### Timings, 352x608 / 124 frames — IN TRAINED RANGE, 2026-08-06

Warm engine (loaders cached), bench 8188, `res_multistep`, 20 steps, `SplitSigmas`
step=5. Queued over the API so the browser stayed out of it.

| run | s |
|---|---|
| split-in-one-pass, 20 steps + decode (seed 4) | 168.25 |
| split-in-one-pass, 20 steps + decode (seed 5) | 143.51 |
| stage 1, 5 steps + preview decode | 51.00 |
| stage 2, 15 steps + decode (stage-1 result pruned) | 112.25 |
| stage 2, 15 steps + decode (stage-1 result cached) | 118.92 |
| **two-stage total** | **163.25 – 169.92** |

**The two-stage overhead is not resolvable at this size.** Two single-pass runs of the
same graph differ by 24.7 s (~15%), which swamps the +1.4 s measured at 56 frames.
What the numbers do support: two-stage costs no meaningful penalty — it is not a
multiple, and the totals straddle the single-pass samples. Do not quote a percentage
overhead at 124 frames; quote "within run-to-run noise".

Per-step cost cannot be derived cleanly for the same reason. Rough scale: ~5-7 s/step
at 124f/352x608, against ~1.2 s/step at 56f/352x352.

### Correctness at 124 frames — bit-exact, 2026-08-06

The disk round-trip is the one part of the two-stage flow whose behaviour is
shape-dependent (`NestedTensor.unbind()` over a 2.2x larger latent), so it was
re-proved in range rather than assumed:

- two-run flow (stage 1 seed 5 -> stage 2 seed 5), two-run flow (stage 2 re-run at
  seed 99) and split-in-one-pass at seed 5 all produced the **same mp4 sha256**
  (`4464f9fd…`). Disk round-trip is lossless at 124 frames.
- Stage 1 run twice independently wrote the **same latent sha256** (`301843b7…`,
  3,022,728 bytes) — the save path is deterministic.
- Seed 5 vs seed 99 on stage 2 gave identical bytes, confirming `DisableNoise` really
  does ignore the seed. Handy: the seed is therefore free to vary on a continue run,
  which is what makes the cache-busting test below possible.

### The lazy gate prunes stage 1 for real — proved 2026-08-06

Earlier the stage-2 run showed node 153 (the stage-1 sampler) in `execution_cached`,
which cannot distinguish "pruned by the lazy gate" from "free because cached". Re-run
at a **never-sampled seed (99)** so node 153 had no cache entry: it stayed absent from
the cache list and the run still took 112.25 s, flat against the cached run's 118.92 s
and nowhere near the 143-168 s a real 20-step pass costs. The gate, not the cache, is
what skips stage 1.

Second, independent proof: with `enabled` false, stage 2 left the staged latent's hash
AND mtime untouched — `MpiSaveLatent` did not write, so it never pulled its upstream.

**Method note:** `execution_cached` listing a node is NOT evidence it was needed. Leaf
constant nodes cache per value, so both booleans show as cached whichever way they are
flipped. Vary an input nothing has ever sampled to get a clean read.

**Bench has no `ffprobe` on PATH.** The bundled binary is
`G:/ComfyUi/python_embeded/Lib/site-packages/imageio_ffmpeg/binaries/ffmpeg-win-x86_64-v7.1.exe`
— `-map 0:v:0 -f null -` prints the true frame count.

### The blocker trap (generic, not H3)

Gating after a sampler does not stop the sampler, and an `OUTPUT_NODE` forces its
upstream unconditionally. Full write-up + the WAN/LTX consequence:
`docs/workflow-authoring/mpi-nodes.md` § "Blocking a branch does NOT stop the work
feeding it". Fixed in MpiNodes `42b1540` (lazy `MpiBlocker`) and `fd9bdca`
(`MpiSaveLatent.enabled`). **Bump `dev_configs/node_lock.json` `69a4333` -> `fd9bdca`
to ship it.**

### New MpiNodes built for this (all pushed, all verified live)

- `MpiSaveLatent` / `MpiLoadLatent` — core `SaveLatent` crashes on an H3 latent
  (`NestedTensor` has no `.contiguous()`); `unbind()` splits the video+audio pair into
  `latent_tensor_0/1` and load rebuilds it. `comfy.nested_tensor` is imported INSIDE
  the function — it only exists from 0.30.0 and the app engine is 0.29.2, so a
  module-level import would stop the whole pack loading in Vision.
- `MpiBooleanInvert` — wire-only NOT gate.
- `MpiH3Length` — see below.

## 8. Duration: H3 cannot do whole seconds

`align_frame_count`: `while n % 17 != 5: n += 1`, at 24 fps. Valid lengths are
5, 22, 39, 56, 73, 90, 107, 124... An exact integer second needs `n` divisible by 24
AND `n % 17 == 5`; the smallest is **n = 192 = exactly 8 s**, next 25 s. So 1, 2 and 3
second clips are **impossible**.

Measured on a real output (`MiniMax_H3_00001_.mp4`, requested "2 seconds"):
`Duration 00:00:02.33, 24 fps, aac 32000 Hz stereo` = 56 frames. Confirmed.

`MpiH3Length` (seconds -> frames / true seconds / `in_trained_range`) replaces the
Math Expression and snaps to the **nearest** valid count; core snaps up, which is
never closer (4 s: core 107 = 4.46 s, nearest 90 = 3.75 s).

**App-side check done by reading, not run:** `MpiVideoControlBar` derives
`effFps = frameCount / duration` and works in frame indices, so a 2.33 s clip needs no
UI change. `MpiSaveVideo` encodes at the float fps given and pins length to the video.
One consequence: H3's audio latent runs at 40 vs video 24, so lengths never match to
the sample and `MpiSaveVideo`'s pad/trim engages on every H3 clip — `truncate_to_audio`
is not a no-op here. Worth one real gallery playthrough in MPI-452.

**H3 does NOT repeat frames.** Hashed all 56 decoded frames of a real output: 56
unique, no adjacent duplicates, no repeats at all. WAN and LTX duplicate the first
frame and need the remove-frame node; H3 does not.

## 9. Trained-range status — PARTLY CLEARED 2026-08-06

`nodes_minimax_h3.py:90` — `length` default **124**, tooltip "trained range is
~**124-362**" (5.17-15.08 s). Everything measured before 2026-08-06 ran at **56
frames**, under half the shortest trained length.

Re-measured in range at 124 frames / 352x608 (§ 7), verified 124 frames / 5.16 s on
the real mp4:

| claim | status |
|---|---|
| two-stage correctness (disk round-trip lossless) | **CLEARED** — bit-exact at 124f |
| lazy gate prunes stage 1 | **CLEARED** — proved against a cache-busted seed |
| timing table | **REPLACED** — and the overhead turns out to be below run-to-run noise |
| 5-step preview floor (§ 7) | **CLOSED by the user 2026-08-06** — 5 steps accepted as the preview floor. Decided, not re-measured in range; do not re-open it as a measurement task |
| pruned vs unpruned, spatial quality (§ 6a) | **CLEARED** — equal at 480x864 and 768x1344 |
| pruned vs unpruned, motion/expressiveness (§ 6a) | **STILL OPEN** — the gap is temporal and was only seen at 56 frames |

**Before either open row becomes a tier default in MPI-452, re-run it at 124 frames.**
Note the in-range session also changed resolution (352x352 -> 352x608), so it replaces
the old numbers rather than extending them; do not mix rows across the two tables.
