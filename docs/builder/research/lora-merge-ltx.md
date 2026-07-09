# Merging a LoRA stack into ONE file (LTX-2.3)

**Goal:** take a live LoRA chain (SoftEnhance → Abliterated → Detailer, applied on top of
the LTX base) and flatten it into a single reusable `.safetensors` — the "make it ours"
pattern used for SDXL/Wan — so the engine carries one file instead of three.

**Verdict (LIVE-PROVEN 2026-07-01):** you cannot bake the LTX stack into a *checkpoint*
(see § Why not a checkpoint). The path that works is **extract the combined delta as a
new LoRA** via KJNodes `LoraExtractKJ`, then union the model+clip halves with
[merge_lora.py](../../../comfy_workflows/scripts/merge-loras/merge_lora.py). Three-way
verify-gen (live stack vs rank-64 vs rank-128) confirmed it — rank 128 was preferred
over even the live stack.

---

## TL;DR working recipe

1. Build the live stack in ComfyUI: base loaders → the LoRA nodes in apply order.
   Use the **BF16/FP16** base + **BF16** Gemma text encoder for extraction (see § Quant).
2. Add **two `LoraExtractKJ`** nodes (KJNodes → `KJNodes/lora`):
   - **Model:** `finetuned` ← last LoRA node's `model` out · `original` ← base UNet's
     `MODEL` out.
   - **Clip:** `finetuned` ← last LoRA node's `clip` out · `original` ← DualCLIPLoader's
     `CLIP` out.
   - Both: `lora_type` **standard** · `algorithm` **svd_linalg** · `rank` **= max source
     LoRA rank** (see § Rank) · `output_dtype` fp16.
   - Model `bias_diff` true; **Clip `bias_diff` FALSE** (see § Meta-tensor crash).
3. Run. Two files land in ComfyUI's `--output-directory` (NOT `output/loras/` — see
   § Output dir).
4. Union them: `python merge_lora.py <model> <clip> <out>` — drops Gemma vision keys,
   asserts no collision.
5. Load with the standard **`LoraLoader`** (model+clip), strength 1.0/1.0. NOT
   model-only.

---

## Why not a checkpoint (the first dead end)

Native `CheckpointSave` on the stacked graph → `ValueError: min() iterable argument is
empty`. It scans tensor keys to detect model config; LTX's quant/custom layout gives it
nothing. Even if it saved, a baked LTX-2.3-22B checkpoint is 20–40GB, must fit VRAM, and
shifts results vs the live quantized apply. CLIP is not the blocker (CheckpointSave has a
`clip` input) — the GGUF/LTX layout is.

## Native merge nodes are DEAD on LTX (the second dead end)

`ModelMergeSubtract` / `CLIPMergeSubtract` → `AttributeError: 'Linear' object has no
attribute 'temp'`. LTX-2.3 uses `MixedPrecisionOps` (comfy/ops.py) — a custom Linear with
no `.temp` weight-staging attr that native merge reaches for. This is architectural, NOT
quant-related: it fails on BF16 too. **Do not use the native subtract nodes on LTX.**
`LoraExtractKJ` sidesteps them — it diffs internally via `get_key_patches`/`add_patches`
(the path LTX supports) and only then runs SVD.

## `lora_type: full` is a trap (the third dead end)

`full` stores the raw full-rank diff per layer → the MODEL file came out **40GB** (≈ the
model itself; useless as a "small reusable LoRA") AND it crashes on the clip's meta
tensors (`NotImplementedError: Cannot copy out of meta tensor`, at the `.diff` write).
Use `standard` (SVD-compressed) — it also *skips* meta tensors gracefully instead of
crashing.

## Quantized bases break the EXTRACT (BF16 for extraction)

The extract reads raw layer weights, so the base you extract FROM must be un-quantized:

- **GGUF** base → the native path hit `.temp`; the KJ path reads GGML tensors it can't
  diff cleanly.
- **FP8** text encoder → `AttributeError: 'Linear' object has no attribute 'weight_scale'`
  (FP8 scaled-ops store `weight_scale`; the extract reads raw `.weight`).

So extract with **BF16 UNet + BF16 Gemma**. (We downloaded the BF16 heretic Gemma —
`DreamFast/gemma-3-12b-it-heretic`, `comfyui/gemma_3_12B_it_heretic.safetensors`, ~22GB —
just for the extraction; runtime still uses the FP8/GGUF variants.) The delta is
base-relative but applies fine onto the quantized runtime base.

VRAM note: BF16 22B does NOT fit a 16GB card for a pure-GPU merge, and pure-CPU LTX init
threw a Windows access violation. `LoraExtractKJ` uses normal `load_models_gpu`
management and completed on a 16GB 4060 Ti — the giant/meta layers OOM-skip individually
without killing the run.

## Rank MUST match the strongest source LoRA (the fidelity bug)

The real quality bug: **extraction rank truncates each source LoRA to that rank.** Measure
the source LoRAs' native ranks first — here:

| LoRA | native rank | relative delta magnitude |
|---|---|---|
| SoftEnhance | 32 | medium |
| Abliterated | 64 | small (mostly clip-side) |
| **Detailer** | **128** | **largest** |

Extracting at rank 64 **halved Detailer** (the strongest, most-visible LoRA) → that was
the drift in the first verify-gen. Fix: set extraction `rank = max(source ranks)` = **128**
here. Not higher (nothing exceeds 128; higher just pads). This is a *data-driven* choice,
not "crank the rank."

Note: extraction rank is the *fidelity* knob, NOT the same as applying a heavy trained
rank-128 LoRA at gen time — the output applies like any normal LoRA, gen-time cost 64→128
is negligible.

## The extraction is faithful even when most keys read ZERO

A zero-scan of the model extract showed ~67% of `lora_up` keys all-zero — **that's
correct**, not a failure. The zero layers are all `audio_*` / `av_ca_*` (audio + audio-
video cross-attention) — the image/video LoRAs genuinely don't touch them. The nonzero
33% is exactly the video transformer (`transformer_blocks.*.attn1/2`, `ff.net`) the LoRAs
patch. Zero delta = LoRA didn't touch that layer, not a broken extract.

Harmless per-key warnings during extraction (all skip cleanly in `standard` mode):
`embed_tokens` (256GB SVD request), `vision_model.*` / `position_embedding` (meta
tensors), `text_embedding_projection.*aggregate_embed` (131GB OOM), and a `cusolver
failed to converge → accurate svd fallback` UserWarning (that fallback is GOOD — it's why
`svd_linalg` beats `svd_lowrank`, which instead *zeros* the key).

## Output dir gotcha

ComfyUI writes extracts to its `--output-directory`, set in the launcher. On this machine
`run_nvidia_gpu.bat` redirects it to `D:\WORK\Images\Outputs` — the files are NOT in
`output/loras/`. Check the bat if the output folder looks empty.

## Files

- Script: [comfy_workflows/scripts/merge-loras/merge_lora.py](../../../comfy_workflows/scripts/merge-loras/merge_lora.py)
- Proven output: `G:/CubricModels/loras/LTX2.3/LTX23_softenhance_abliterated_detailer_merged.safetensors`
  (rank 128, 3.7GB, model+clip).
