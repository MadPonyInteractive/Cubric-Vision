# MPI-600 research — the bench workflow

`klein_9b_bench.json` is a **copy of `comfy_workflows/klein_t2i.json`** (the shipped Klein 4B
template, API-prompt format, 195 nodes) with the 9B swaps already applied. Fabio's call
2026-08-22: reuse the 4B template rather than author a new graph.

**It is a bench artifact, not app code.** Nothing here ships. MPI-598 does the app wiring.

## What the 4B template already gives us — and the one thing it does not

`Input_is_Turbo` (node 52, `MpiSimpleBoolean`) is wired and drives real things:

| Node | Title | Expression |
|---|---|---|
| 203 | steps | `4 if a else 20` |
| 204 | cfg | `1.0 if a else 5.0` |
| 417 / 437 | — | `1.0 if a else 1.5` |
| 418 / 439 | — | `2 if a else 10` |
| 57 / 212 / 222 | `MpiIfElse` | swaps the NEGATIVE conditioning — `ConditioningZeroOut` when turbo, real `CLIPTextEncode` when not |

**But there is no turbo-LoRA loader node in the graph.** `Input_is_Turbo` flips *numbers and the
negative*, nothing else — which is consistent with 4B's turbo LoRA having been dropped on
2026-07-27. So "already set up to take a turbo LoRA" is half true: the settings half is wired,
the LoRA half is not.

**That needs no surgery.** `Input_Lora_1..6` (nodes 99, 98, 95, 96, 97, 100) are `MpiLoraModel`
slots sitting in the model chain, all defaulting to `lora_name: "None"`. The turbo LoRA rides
**`Input_Lora_1` (node 99)** — set the name and `strength_model` and the sweep is done.

Model chain, always-on path:

```
27 UNETLoader → 38 NSFW LoRA → 103 StyleSelector → 101/102 StyleLoras
   → 99 Lora_1 → 98 Lora_4 → 95 Lora_2 → 96 Lora_5 → 97 Lora_3 → 100 Lora_6 → CFGGuider
```

## Edits already applied in `klein_9b_bench.json`

| # | Node | Change | Why |
|---|---|---|---|
| 1 | 27 `UNETLoader` | `unet_name` → `flux-2-klein-9b-int8-convrot.safetensors` | **swap per arm** |
| 2 | 14 `CLIPLoader` | `clip_name` → `qwen_3_8b_int8_convrot.safetensors` | 9B needs the **8B** embedder; 4B's `qwen_3_4b` is a different model |
| 3 | 103 | `.model` rewired `38` → `27` | **bypasses the 4B NSFW LoRA** — see trap below |
| 4 | 101, 102 | every `lora_N` → `"None"` | all eight are **4B** style LoRAs |
| 5 | 99 `Input_Lora_1` | `lora_name: "None"`, `strength_model: 1.0` | the turbo-LoRA slot, set per arm |
| 6 | 203, 204 | expressions → literals `"4"` / `"1.0"` | per-run steps/cfg, no boolean juggling |
| 7 | 111 | `PreviewImage` → **`SaveImage`**, prefix `klein_9b/distilled/run` | Preview does not persist; prefix is relative to the bench output root `D:\WORK\Images\Outputs` |

15 `VAELoader` left at `flux2-vae.safetensors` — already on disk, and the only one of the two
template VAEs we have.

## THE TRAP: every LoRA baked into this graph is a 4B LoRA

A 4B LoRA on a 9B model is a dimension mismatch. `LoraLoaderModelOnly` **loads the file even at
strength 0**, so a prompt-gated strength does not save you.

- **38 NSFW LoRA** — unconditional in the model chain, strength from node 44
  (`1.0 if a else 0.0`). **Bypassed** in the copy (edit 3). This one would have fired on every
  single run.
- **101 / 102 style LoRAs** — eight 4B files. **Cleared** (edit 4).
- **143 refcontrol depth** and **259 outpaint** — 4B, but only on the control and fill branches.
  The bench runs `Input_wf_type` **1** (t2i) and **4** (kleinEdit), so they should never execute.
  Left in place; if a control run is ever added, clear them first.

## Per-arm settings

`Input_wf_type`: **1** = t2i, **4** = kleinEdit (the edit branch — scenarios 1–4 all use it).

| Arm | 27 `unet_name` | 99 `lora_name` | 99 strength | 203 steps | 204 cfg | 111 prefix |
|---|---|---|---|---|---|---|
| base | `flux-2-klein-base-9b-int8-ConvRot.safetensors` | `None` | — | `20` | `5.0` | `klein_9b/base/run` |
| base+turbo @1.0 | `flux-2-klein-base-9b-int8-ConvRot.safetensors` | `klein_9B_Turbo_r128.safetensors` | `1.0` | `8` | `1.0` | `klein_9b/base-turbo-100/run` |
| base+turbo @0.7 | same | same | `0.7` | `10` | `1.5` | `klein_9b/base-turbo-070/run` |
| base+turbo @0.25–0.5 | same | same | `0.25`–`0.5` | `8` | `3.5` | `klein_9b/base-turbo-035/run` |
| distilled | `flux-2-klein-9b-int8-convrot.safetensors` | `None` | — | `4` | `1.0` | `klein_9b/distilled/run` |
| KV | `flux-2-klein-9b-kv_int8_convrot.safetensors` | `None` | — | `4` | `1.0` | `klein_9b/kv/run` |

Steps/cfg for base and distilled are the template's own `else`/`if` values — they are the shipped
4B numbers and are a **starting point on 9B, not a measurement**. Confirm them early.

Turbo-LoRA rows come from anyMODE's own recommendation and community reports (see `brief.md`).

`Input_Seed` is node **33** — set the three fixed seeds there.

## Still owed before the first real run

1. **Confirm the LoRA loads on an INT8 ConvRot base at all.** Rank 128 on a quantised base is
   unproven. If it only loads on fp8, leg A is forced to fp8 — record the asymmetry.
2. **The KV arm needs `FluxKVCache`**, which is not in this graph. Add it on the KV arm only, and
   do not let it near the t2i path. If it fails with `timestep_zero_index`, that is the known
   upstream issue, not a bad download.
3. **Verify the graph runs at all on 9B** before scoring anything — one t2i at 1024², warm.
