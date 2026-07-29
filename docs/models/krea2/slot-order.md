# Krea2 — image slot ORDER and the 2-reference wall (MPI-312 / MPI-313)

The two image slots on the Krea2 identity-edit path are **not interchangeable**, and the
2-reference limit is a model property, not a bug. Read this before debugging a "the edit
ignored my subject" report.

## Scene chip 1, subject chip 2 — load-bearing

- **scene → chip 1** — `Input_Image` → `image` / `source_latent`
- **subject → chip 2** — `Input_Image_2` → `image_b` / `source_latent_b`

Off-order **silently degrades** the output. No error, no warning, no log line.

This is not inferred — the node says so itself. `comfyui-krea2edit/__init__.py:119` tooltips
`source_latent_b` as:

> *"2nd reference (subject photo) for multi-ref LoRAs -> RoPE frame=2, training-matched order:
> scene first, subject second"*

The upstream model card is blunter: *"Swapping them sharply degrades results."*

**Wiring is correct; the UI is not.** Injection is slot-addressable by `slot.key`
(`commandExecutor._buildParams`) with no packing — see
[project-integrity.md](../../project-integrity.md) and `docs/data.md` § Media roles for the
sparse-slot contract. But the chips render **bare numeric badges** with no Scene/Person
labels, so a user who drops them backwards gets the degraded path with zero signal. That gap
is MPI-312.

## Two subjects in ONE pass loses both faces

Reproduced 2026-07-19, **including on a large, well-lit reference** — so it is NOT a
reference-quality problem. Clothing survives; faces don't. That matches the card's
*"texture-faithful, proportion-conservative… facial geometry regresses"*. v1.1 → v1.2 barely
moved it.

Upstream prescribes **chained single-ref passes** — MPI-313, gated on whether pass 2 preserves
pass 1's subject.

## Ruled out — do NOT re-test

| Theory | Why it's dead |
|---|---|
| Slot wiring is wrong | Traced correct end-to-end. |
| Pre-downscale `image_b` | Destroys shirt text + clothing texture, and the face deviates *identically* — so face identity does not ride the pixel path. |
| Lower megapixels | Gens break above ~1.5MP; going lower doesn't recover faces. |
| Prompt phrasing | Two enhancer-side attempts failed. Wrong layer. |

Same 2-reference shape as the broken-hands finding in [samplers.md](samplers.md) — single-ref
fine, 2-ref broken. Possibly one root cause; untested.
