# Krea2 — transformer quant variants (`int8_convrot`, `mxfp8`, `nvfp4`)

> Status: **candidates, not adopted.** We ship `fp8_scaled` only.
> Raised 2026-07-10 during MPI-242 (Krea2 onboarding). Companion:
> [quant-and-coldstart-investigation.md](quant-and-coldstart-investigation.md).

## The full quant matrix (live from the HF API, 2026-07-10)

`Comfy-Org/Krea-2` `diffusion_models/`:

| quant | Turbo | Raw | target silicon |
|---|---|---|---|
| `bf16` | 24.48 GB | 24.48 GB | any — reference, 2× size |
| **`fp8_scaled`** | **12.24 GB** | **12.24 GB** | any — **what we ship**. Weight-only fp8, dequant to bf16 matmul; loads anywhere |
| `int8_convrot` | 12.57 GB | 12.57 GB | **Ampere / Ada** — INT8 IMMA tensor cores |
| `mxfp8` | 12.60 GB | **—** | **Blackwell only** (native mxfp8 tensor path) |
| `nvfp4` | 7.15 GB | **—** | **Blackwell only** (sm_120 FP4) |

⚠ **`mxfp8` and `nvfp4` exist for TURBO ONLY.** Raw ships three variants, not five — so a
`variants.arch` axis on Raw **cannot** offer a Blackwell-native option; Raw's Blackwell users
fall back to `fp8_scaled`. (Verified against the HF API, not assumed.)

✅ **All three are NATIVE in ComfyUI 0.27** — `comfy/quant_ops.py` registers `mxfp8`, `nvfp4`,
and `int8_tensorwise` in `QUANT_ALGOS`. **No community fork required.** This clears the gate
that killed GGUF (MPI-190).

## The int8 finding

| variant | RTX 3090, 1024², 8 steps |
|---|---|
| `krea2_turbo_fp8_scaled` (what we ship) | **14.82 s/img** |
| `krea2_turbo_int8_convrot` | **7.70 s/img** |

**1.92× faster.** The mechanism is Ampere's INT8 tensor-core path (`convrot` =
convolution-rotation weight reordering, engaging the INT8 IMMA pipeline that fp8 cannot
use on pre-Blackwell silicon).

Source: community benchmark (see `docs/krea2/resolution.md` § VRAM/RAM). **We have not
reproduced it.** No 4090 timing exists anywhere; no 3090 quality A/B exists either.

## Why this does NOT contradict "INT8 → skip" in the LTX investigation

[quant-and-coldstart-investigation.md](quant-and-coldstart-investigation.md) § "Dead / skip"
says:

> **INT8 mixed (Winnougan ~29GB)** — Ampere-targeted, no 5090 benefit, barely smaller. Skip.

That verdict is **correct and still stands** — for its context. Read the two carefully:

| | LTX investigation | Krea2 finding |
|---|---|---|
| target GPU | RTX **5090** (Blackwell, sm_120) | RTX **3090** (Ampere, sm_86) |
| goal | shrink a 40 GB transformer + kill the cold-start tax | raw sampling throughput |
| int8 verdict | no benefit *on Blackwell*, barely smaller ⇒ skip | 1.92× *on Ampere* |

**"Ampere-targeted" was the reason to reject it there, and it is the reason to want it here.**
Blackwell has native fp8/mxfp8 tensor cores, so fp8 already saturates the pipeline; Ampere
does not, so INT8 IMMA is the faster path. Same fact, opposite conclusion, different silicon.

⇒ Do not cite the LTX "skip" as a reason to dismiss Krea2 int8, and do not cite this page as
a reason to revisit LTX int8 on Blackwell.

## The implementation path already exists

This is a **runtime-VARIANT axis** (MPI-200), and the machinery is shipped and proven:

- `js/data/modelConstants/gpuArch.js` returns `'blackwell' | 'modern' | 'legacy'`
  (`modern` = Ada / Ampere / Turing / RTX A-series).
- `models.js` LTX-2.3 declares the exact pattern:

```js
variants: {
    arch: {
        options: {
            blackwell: { label: 'RTX 50 Series (Blackwell)', size: '24.1GB',
                         extraDeps: ['ltx23-transformer-mxfp8'], workflowSuffix: '_mxfp8' },
            modern:    { label: 'RTX 40 & Older',            size: '25.2GB',
                         extraDeps: ['ltx23-transformer-fp8'],   workflowSuffix: '_fp8' },
        },
    },
},
```

- `resolveModelDeps.js` § variant axis installs **only** the weight matching this machine's
  GPU. `archVariantOptions()` drives the model-manager toggle row (MPI-209).

A Krea2 arch axis is a near-copy, **minus the workflow suffix** — the graph is unchanged, only
the `UNETLoader` weight differs, so **no `workflowSuffix` is needed** (unlike LTX, which emits
`_mxfp8`/`_fp8` workflow files).

Sketch for **Turbo** (all three weights exist):

```js
variants: {
    arch: {
        options: {
            blackwell: { label: 'RTX 50 Series (Blackwell)', size: '12.6GB',
                         extraDeps: ['krea2-turbo-transformer-mxfp8'] },
            modern:    { label: 'RTX 40 & Older',            size: '12.57GB',
                         extraDeps: ['krea2-turbo-transformer-int8'] },
            // legacy → fp8_scaled fallback (loads anywhere)
        },
    },
},
```

⚠ **Raw cannot use this shape** — it has no `mxfp8`/`nvfp4`. Raw would be `int8` on `modern`
and `fp8_scaled` everywhere else, or simply `fp8_scaled` throughout.

⚠ **`nvfp4` (7.15 GB) is the only variant that fits 8 GB VRAM resident** — but it is
Blackwell-only, so it cannot rescue the 8 GB Ampere/Ada users who most need it. See
`docs/krea2/resolution.md` § VRAM.

## What must be settled before adopting

1. ✅ **The weights exist.** Confirmed live on the HF API (`Comfy-Org/Krea-2`) — see the matrix
   above. Sizes recorded; hashes still to be captured at upload time.
2. ✅ **ComfyUI 0.27 loads them natively.** `comfy/quant_ops.py` `QUANT_ALGOS` registers
   `mxfp8`, `nvfp4`, `int8_tensorwise`. No community fork — the gate that killed GGUF
   (MPI-190) does not apply here.
3. ⬜ **Reproduce the 1.92× ourselves** on the 4060 Ti (Ada, `modern`) — the benchmark is a
   3090 (Ampere). Ada's INT8 path differs; **do not assume it transfers.** Same seed, same
   steps, same resolution.
4. ⬜ **Quality A/B.** fp8 was rejected on LTX for eyes/teeth. int8 is a *different* strategy
   (integer + per-block scale, not reduced-precision float), so the LTX fp8 quality verdict
   does **not** predict Krea2 int8 quality — but neither does it exonerate it. Lock the seed,
   compare faces at 1K and 2K.
5. ⬜ **Blackwell behaviour.** Turbo has a real `mxfp8` (12.6 GB) — so on a 5090 the choice is
   `mxfp8` vs `fp8_scaled`, not int8. Needs its own A/B. **Raw has no mxfp8**, so its Blackwell
   users stay on `fp8_scaled` regardless.
6. ⬜ **Storage cost.** Each extra transformer is a second R2 upload + a second per-user
   download (~12.6 GB). `archVariantOptions()` makes it an install **toggle**, not a forced
   download (MPI-209) — but the R2 bill and the model-manager complexity are real.
7. ⬜ **Is `nvfp4` worth it?** 7.15 GB fits 8 GB VRAM *resident* — the only variant that does.
   But it is Blackwell-only, and Blackwell cards mostly have ≥16 GB. **Likely low value**: it
   solves a VRAM problem for GPUs that don't have one. Confirm before spending an upload on it.

## Do not

- **Do not ship int8 as the default** on the strength of one third-party 3090 benchmark.
- **Do not add a GGUF path** — removed in MPI-190, do not re-raise ([[project memory]]).
- **Do not conflate `int8_convrot` with the "INT8 mixed (Winnougan)"** weight the LTX doc
  rejected. Different weight, different model, different silicon target.

## If adopted

New card, not MPI-242. Krea2 ships `fp8_scaled` first; int8 is a follow-up perf lever with a
clean, already-built seam.
