# Krea2 — resolution

> Part of [docs/krea2/](README.md).

## Use `FLUX_RATIOS` values, delete the `ResolutionSelector`

The official template carries a core `ResolutionSelector` node
(`comfy_extras/nodes_resolution.py`). It is **not a table** — it is a formula:

```python
scale  = sqrt(megapixels * 1024*1024 / (w_ratio * h_ratio))
width  = round(w_ratio * scale / multiple) * multiple
```

Compared against our `FLUX_RATIOS` @ 1.0 MP / multiple 8:

| ratio | our FLUX | selector | |
|---|---|---|---|
| 1:1 | 1024×1024 | 1024×1024 | identical |
| 3:4 | 896×1152 | 888×1184 | ~1% apart |
| 16:9 | 1344×768 | 1368×768 | ~1% apart |
| 4:5 · 5:8 · 5:4 · 8:5 | ✅ | **absent** | selector cannot express these |
| 2:3 · 3:2 · 21:9 | absent | ✅ | we do not offer these |

**Drop the node.** The app already injects `width`/`height` into `EmptyLatentImage`; a
selector in the graph is a competing second source of truth. It exists in the template because
a standalone Comfy user has no app UI. Our values are also mostly divisible by 32/64; the
selector's `1184`/`1368` are not — and, per below, they are not divisible by **16** either.

## Dimensions must be multiples of **16** (not 8)

Two factors stack:

| stage | factor | source |
|---|---|---|
| VAE encode | ÷8 | `qwen_image_vae` `spacial_compression: 8` (`comfy/sd.py:724`) |
| DiT patchify | ÷2 | `patch=2` (`comfy/ldm/krea2/model.py:183`) |
| **pixel constraint** | **÷16** | 8 × 2 |

**Off-multiple does not crash.** `comfy/ldm/krea2/model.py:239` calls
`pad_to_patch_size(x, (2,2))` with `padding_mode="circular"` and crops back after
(*"as Flux/Lumina/QwenImage do"*). So a ÷8-but-not-÷16 size (e.g. `1000×1000` → latent
`125×125`, odd) is silently **circular-padded** by one latent row/column — content wraps from
the opposite edge — generated, then cropped. It works; one edge is subtly wrong.

✅ **All nine `FLUX_RATIOS` values are ÷16-clean** (verified: 1024×1024, 896×1152, 896×1088,
768×1280, 768×1344, 1152×896, 1088×896, 1280×768, 1344×768 — zero padding on every one).
Copying them onto the Krea2 ModelDef needs **no guard**. Any *new* size must be ÷16.

Per MPI-174, a new `type` declares `ratios` on its ModelDef. **Copy the values onto the Krea2
ModelDef — do NOT set `type: 'flux'` to inherit the hardcoded table.**

## The 2K tier — SETTLED, ships (live 2026-07-10)

Turbo is native 1024→2048, and the second band **earns its cost**:

| run | pixels | time |
|---|---|---|
| 896×1152 | 0.98 MP | 28.36 s |
| 1024×2048 | 2.00 MP | 61.04 s |

**2.03× the pixels ⇒ 2.18× the time — time scales LINEARLY in pixels, not quadratically.**
(An earlier "≥4× attention cost" warning was WRONG.) For scale: Chroma is 58–62 s at ~1 MP, so
Krea2 does **twice the pixels in the same wall clock, at better quality**.

⇒ Ship `qualityTiers: ['1k','2k']`, not plain orientation mode. Declaring `qualityTiers`
auto-flips `RATIO_MODES['krea2']` to `'quality'` (`ratios.js:222`) — no edit to `ratios.js`.

**Each tier is a FLAT 9-entry array** carrying both orientations' labels (`1:1` appears once —
square is orientation-free), exactly like LTX/Wan. `getModelRatios` indexes a declared table by
**one** key (`ratios.js:276`), and `_buildQualityOptions` (`MpiOptionSelector.js:167`) does
`getModelRatios(type, undefined, tier).find(r => r.label === selectedRatio)` — so labels must be
unique within a tier and shared across tiers, or switching `1k`↔`2k` loses the selection.

| ratio | 1k | 2k |
|---|---|---|
| 1:1 | 1024×1024 | 1472×1472 |
| 3:4 | 896×1152 | 1248×1664 |
| 4:5 | 896×1088 | 1280×1600 |
| 5:8 | 768×1280 | 1120×1792 |
| 9:16 | 768×1344 | 1088×1936 |
| 4:3 | 1152×896 | 1664×1248 |
| 5:4 | 1088×896 | 1600×1280 |
| 8:5 | 1280×768 | 1792×1120 |
| 16:9 | 1344×768 | 1936×1088 |

All values are ÷16-clean (zero circular padding). The 2K tier is 1.91–2.07 MP. `1472×1472`
deliberately matches LTX's 2K square for cross-model visual consistency.

> The live test was `1024×2048` = **1:2** (0.5000), *not* 9:16 (0.5625). It proved the **2 MP
> band**; it does not pin a ratio.

**Two things this does not touch.** The 2K tier lives on Krea2's ModelDef, **not** inside
`FLUX_RATIOS` — that table is never mutated. And Chroma needs no gating: a declared table
returns **early** (`ratios.js:274`), so Krea2 never reaches the switch and Chroma's
`case 'chroma'` never sees a declared table.

⚠ Krea2 is the **first** model ever to use the MPI-174 declared-ratios path (no model in
`models.js` sets `ratios:` today ⇒ `DECLARED_RATIOS_BY_TYPE` is empty and that branch has never
executed in production). **Expect to find its bugs.** One is already known: `QUALITY_LABELS`
(`MpiOptionSelector.js:141`) has a `'2k'` key but **no `'1k'`** — add `'1k': '1K',` or the tier
picker renders `undefined`.

---

## VRAM / RAM — the table is COMPUTED, and it checks out

`footprint.js` (MPI-168) derives the trade table from dep `size` strings + three fitted global
constants. **Nothing is authored per model.** For Krea2 it yields:

| VRAM | model RAM need | corroboration (web research, 2026-07-10) |
|---|---|---|
| **8 GB** (floor) | ~16 GB | runs via ComfyUI DynamicVRAM RAM-spilling. **Slow** — ~31 s/img est. on a 3060 Ti. Real, not comfortable. |
| **16 GB** | ~8 GB | RTX 5080 confirmed working, ~3.5 GB headroom. **The comfortable practical minimum.** |
| **24 GB** | 0 | fully resident |

The floor is `max(8, 0.25 × 22.10) = 8` — the `MIN_FLOOR` clamp, not a Krea2 measurement.

**Independent corroboration.** Research measured **peak sampling VRAM ≈ 12.40 GB**; our
transformer is **12.24 GB**. They match because ComfyUI **evicts the Qwen3-VL-4B text encoder
(4.88 GB) before the sampler loads** — the encoder and transformer are never both resident.
The text encoder is *not* an OOM culprit; no report attributes an OOM to it.

**The table states MODEL need, not system total.** The ~24 GB RAM that 8 GB-VRAM users report
= our 16 GB model need + their OS reserve (~10–20 GB, the user's own headroom, deliberately
never baked in — see `footprint.js` header).

### ⚠ What the "runs on 8 GB" claims actually refer to

Three different things, only one of which is us:

1. **Community GGUF Q4** (~7.2–7.7 GiB) — fits fully resident. *Most likely referent.* Needs a
   community-forked loader (city96's throws `Unexpected architecture type`). **We do not ship
   GGUF** (MPI-190 removed it) — this path does not exist in Cubric Vision.
2. **`fp8_scaled` + DynamicVRAM spilling** — what we ship. Two confirmed reports
   (RTX A2000, RTX 3060 Ti). Works, needs ~24 GB system RAM, slow.
3. **Official NVFP4** (7.67 GiB) — fits 8 GB, but **Blackwell-only** (RTX 50xx).

⇒ Quote **16 GB VRAM as the comfortable minimum**; 8 GB is the honest floor with a RAM cost.

**Speed reference** (RTX 3090, 1024², 8 steps): `fp8_scaled` = **14.82 s/img**;
`int8_convrot` = **7.70 s/img** (1.92× faster, Ampere INT8 tensor cores). No 4090 timing exists
anywhere. **AMD ROCm is broken** — kernel crash at step 1.

⇒ int8 is a **live perf candidate**, not adopted. Full analysis, the six adoption gates, and why
it does *not* contradict the LTX "INT8 → skip" verdict:
[`docs/builder/research/krea2-int8-quant.md`](../builder/research/krea2-int8-quant.md).

**No first-party hardware requirements exist.** krea-ai's GitHub, the HF model card, the ComfyUI
docs tutorial, and krea.ai's technical report all publish *zero* VRAM specs. Anyone citing an
"official" 8 GB figure is citing nothing.
