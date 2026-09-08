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
| 8 | 254, 278 | `.model` rewired `259` → `100` | **bypasses the 4B outpaint LoRA** on the `wf_type` 5 branch — see the trap below |

15 `VAELoader` left at `flux2-vae.safetensors` — already on disk, and the only one of the two
template VAEs we have.

## THE TRAP: every LoRA baked into this graph is a 4B LoRA

A 4B LoRA on a 9B model is a dimension mismatch. `LoraLoaderModelOnly` **loads the file even at
strength 0**, so a prompt-gated strength does not save you.

- **38 NSFW LoRA** — unconditional in the model chain, strength from node 44
  (`1.0 if a else 0.0`). **Bypassed** in the copy (edit 3). This one would have fired on every
  single run.
- **101 / 102 style LoRAs** — eight 4B files. **Cleared** (edit 4).
- **259 outpaint** — 4B, `strength 1.1`. **This one WAS live.** It was described here as
  sitting on a branch the bench does not run, but the bench now runs `Input_wf_type` **5**
  (the localised, masked edit) and **that branch reaches 259 unconditionally**. **Bypassed** in
  the copy by edit #8. Never re-wire it back on a 9B arm.
- **143 refcontrol depth** — 4B, feeds CFGGuider 125. Verified **not** reachable from `wf_type`
  1, 4 or 5. Left in place; clear it first if a control run is ever added.

Reachability was checked by walking each branch's output back through its inputs, not by reading
the graph by eye. After edit #8 all three branches the bench runs reach **zero**
`LoraLoaderModelOnly`, and every `Input_Lora` and style-LoRA slot is `None`.

## Per-arm settings

`Input_wf_type`: **1** = t2i, **4** = kleinEdit (whole-image edit), **5** = the **localised,
masked edit** — crop around the mask, green-fill it, regenerate, stitch back. Scenario 3 is a
`wf_type` 5 run; it takes `Input_Mask` (node **298**) alongside `Input_Image` (node **474**), and
the character it places is described in the **prompt**, since that branch chains no image
reference of its own.

| Arm | 27 `unet_name` | 99 `lora_name` | 99 strength | 203 steps | 204 cfg | 111 prefix |
|---|---|---|---|---|---|---|
| base | `flux-2-klein-base-9b-int8-convrot-comfy.safetensors` | `None` | — | `20` | `5.0` | `klein_9b/base/run` |
| base+turbo @1.0 | `flux-2-klein-base-9b-int8-convrot-comfy.safetensors` | `klein_9B_Turbo_r128.safetensors` | `1.0` | `8` | `1.0` | `klein_9b/base-turbo-100/run` |
| base+turbo @0.7 | same | same | `0.7` | `10` | `1.5` | `klein_9b/base-turbo-070/run` |
| base+turbo @0.25–0.5 | same | same | `0.25`–`0.5` | `8` | `3.5` | `klein_9b/base-turbo-035/run` |
| distilled | `flux-2-klein-9b-int8-convrot.safetensors` | `None` | — | `4` | `1.0` | `klein_9b/distilled/run` |
| KV | `flux-2-klein-9b-kv_int8_convrot.safetensors` | `None` | — | `4` | `1.0` | `klein_9b/kv/run` |

Steps/cfg for base and distilled are the template's own `else`/`if` values — they are the shipped
4B numbers and are a **starting point on 9B, not a measurement**. Confirm them early.

Turbo-LoRA rows come from anyMODE's own recommendation and community reports (see `brief.md`).

`Input_Seed` is node **33** — set the three fixed seeds there.

## Still owed before the first real run

1. ~~Confirm the LoRA loads on an INT8 ConvRot base at all.~~ **CLOSED 2026-08-22 — it does.**
   `klein_9B_Turbo_r128` attaches **121 patches** to the base arm (`0` without it), no unmatched
   keys, and the pixels differ. fp8 is not forced and there is no asymmetry to record.
   **But the base weight had to be CONVERTED first** — the downloaded
   `flux-2-klein-base-9b-int8-ConvRot.safetensors` cannot be loaded by native ComfyUI at all.
   Every arm above now names `…-convrot-comfy.safetensors`. See `format.md` § Leg A preamble,
   which also records that **distilled and KV are not actually ConvRot** despite their filenames.
2. ~~**The KV arm needs `FluxKVCache`**, which is not in this graph.~~ **CLOSED 2026-08-22.**
   Added as node **900** (`FluxKVCache`, `model` from node **100**). It has **no consumer by
   default**, and ComfyUI never executes an unreferenced node — so it is inert on every arm until
   one opts in with `run.py --link 170.model=900,0`, which reaches only branch 4's `CFGGuider`.
   The t2i path (`125 CFGGuider`, model from 143) cannot see it. No `timestep_zero_index` failure
   occurred. Leg D is in `results_kv.md`; driver is `kv_leg.py`.
3. **Verify the graph runs at all on 9B** before scoring anything — one t2i at 1024², warm.


## Bench tooling (this card's own scripts)

| Script | What it does |
|---|---|
| `run.py` | Queues this graph on :8188. Every knob is `--set NODE.input=value`. Samples GPU memory through the run and reports peak, wall clock, `execution_cached` and the files that landed. |
| `make_mask.py` | Draws a 1-bit mask (`--ellipse`/`--rect x0,y0,x1,y1`) for a `wf_type` 5 run. |
| `seam.py` | `seam.py BASE RESULT MASK` — scores seam / lighting integrity by measurement: outside-mask delta, distance rings outward from the mask edge, inside-mask delta. This is how scenario 3 is scored. |
| `kv_leg.py` | Leg D — the KV multi-reference speed matrix (weight × `FluxKVCache`, 2 and 3 refs). Appends to `results_kv.md`. |
| `kv_ratios.py` | Turns those rows into the speedup per reference count. |
| `kv_sheet.py` | Leg D contact sheet — arms down, (cell × seed) across. **The leg's headline is only visible here**: `distilled+node` and `kv+node` post identical timings and VRAM, and only one of them keeps the plate and the references. |

`run.py` gained two things for Leg D: `--link NODE.input=SRC,IDX` (rewire a link, not just a
value) and a **sampler-only** timing read off `/internal/logs/raw`. Wall clock on this bench is
~73% constant RAM→VRAM load — fine for the quality legs, useless for a speed ratio. Mark that log
**by timestamp**, never by index: the endpoint keeps only the last 300 entries, so an index mark
silently returns an empty list and the timing reads `None`.

**Read a VRAM number only after freeing the bench first** — `POST /free
{"unload_models":true,"free_memory":true}`, sample the floor, then run. The bench retains its
`cudaMallocAsync` pool between runs, so an un-freed baseline reports the *previous* run's pool as
this run's idle. Detail in `format.md`.
