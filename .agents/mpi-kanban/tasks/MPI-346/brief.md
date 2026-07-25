# MPI-346 — bump `comfyui-krea2edit` v1.1 → v1.2.2

## Why

We ship the **v1.2 weights** (`krea2_identity_edit_v1_2_r128.safetensors`,
`js/data/modelConstants/loraDeps.js`) on the **v1.1 nodes** (`17af8833`, 2026-07-09).
The v1.2 release bumped BOTH halves; we only took the weights. Everything the v1.2
node release added has been unavailable, and the reference geometry we feed the v1.2
weights is the legacy one.

Second driver: v1.2.1 (`dc7940f4`) is the fix for ComfyUI core `c9602625`
(`ref_latents` added to the diffusion-model wrapper signature). Our v1.1 pin was safe
only through ComfyUI 0.28 — this bump clears that blocker ahead of 0.29.

## What changed in the node (v1.1 → v1.2.2)

`Krea2EditModelPatch` new optional inputs:

| input | effect |
|---|---|
| `vae` + `source_image` / `source_image_b` | pixel-space source path: crop/resize in PIXELS and VAE-encode internally (cached per target res). Immune to input/output resolution mismatch — the blur fix. Overrides `source_latent`. |
| `fit_mode` (`fit` default / `crop (legacy)`) | ref geometry. `fit` = resample the source to the target grid at a training-matched centered offset (stride-1 RoPE ids). **Only bites when `vae` + `source_image` are both connected** — otherwise it prints a warning and falls back to the latent path. |
| `ref_boost` / `ref_boost_a` | reference-fidelity dial — additive attention-logit bias on target→ref. `ref_boost` = LAST ref (the subject in our 2-ref wiring), `ref_boost_a` = FIRST ref (scene). 1.0 = off. |
| `ref_boost_mask` (MASK) | restricts `ref_boost` to a region of the **LAST reference** (e.g. the face). Inert while `ref_boost == 1.0`. |

`Krea2EditGroundedEncode` gained `system_prompt` (override the grounding system prompt;
empty = training default).

The node now prints `[krea2edit] nodes v<version> loaded` at import — use it to confirm
which pin actually loaded.

### `ref_boost_mask` is NOT an inpaint mask

It masks the **reference**, not the target: which part of the ref the boost applies to.
It does not constrain where the edit lands in the output. Our target-side masking
(`InpaintCropImproved` / `InpaintStitchImproved`, MPI-282) is a separate, unaffected
mechanism. New capability = "lock identity to this region of the reference".

## Behavior change to expect on the CURRENT wiring

Our graph uses the **latent** path (`source_latent` ← `VAEEncode`), nodes `306` (2-ref)
and `408` (1-ref) in `comfy_workflows/krea2_t2i_<sfw|nsfw>.json`. That path is not
unchanged:

- v1.1: `F.interpolate(src, size=(H,W), bilinear)` — plain **stretch**.
- v1.2: `_fit_src` — center-crop to the target AR, then resize.

So mismatched-AR edits change output (a fix — no more stretched subjects — but a
change). Matched-AR edits are byte-identical. `pad_to_patch_size` also gained
`padding_mode="replicate"`; our ÷16 resolution rule keeps the latent patch-aligned, so
that branch should never fire.

`fit_mode` defaulting to `fit` does NOT change our behavior: with no `vae`/`source_image`
connected, `ref_native` is False and the forward takes the anchor-id latent path exactly
as with `crop (legacy)`.

## Cost

`installRequirements:false` ⇒ the node is NOT baked into the Pod image (Dockerfile bake
loop skips it) — it rides the volume. **A commit bump is a `node_lock.json` edit and
nothing else**; the `.mpi_node_commit` drift ladder (MPI-222) reinstalls at the new
commit on BOTH engines. No Pod image rebuild. Archive is 46,276 bytes (was ~11KB).

## Done in this card

- `dev_configs/node_lock.json` — `comfyui-krea2edit.commit` → `223a9383eabf991cb2120663162441383da50f27`
- `js/data/modelConstants/nodesDeps.js` — `size` 11KB → 45KB + pin note
- `.claude/skills/mpi-bump-local-comfy/SKILL.md` — struck the now-cleared 0.28 pairing constraint

## Owned by the user (workflow authoring)

Rewiring `comfy_workflows/raw/krea2_t2i_template.json` in LiteGraph, then re-export.
Candidate work, in ladder order:

1. **`vae` + `source_image` / `source_image_b`** on both `Krea2EditModelPatch` nodes.
   The images are already in the graph — nodes `370` / `405` feed `Krea2EditGroundedEncode`.
   Pure workflow change, no app/injection change. Gets the blur + `fit` geometry.
2. **`ref_boost`** — the video pushed it to **4** for identity lock; character/reference
   sheets as input are a v1.2 WEIGHT capability, so they work today, but `ref_boost` is
   what makes the identity stick. Needs an `Input_*`-titled injectable node + a PromptBox
   control if it should be user-facing; bake a constant first to find the value.
3. **`ref_boost_mask`** — needs app plumbing (mask painted on the SUBJECT chip, currently
   History-workspace only). Separate card when we get there.

## Live findings (user, bench testing on the v1.2.2 nodes)

- **`grounding_px` 1024 beats 768.** Confirmed by A/B on the bench. Consistent with
  v1.2's high-res adaptation pass (v1.1's trained range was 384-768). Plan is to scale
  input images to 1024 up front, which helps further. The shipped runtime JSON still
  bakes 768 - revisit when rewiring.
- **`ref_boost` 4 helps on a SINGLE reference** - real identity/character consistency gain.
- **`ref_boost` INVERTS on two characters / two references** - actively destroys
  consistency. Mechanically expected: the boost applies to the LAST ref only, but the
  attention bias rows are `rows0:` (ALL target tokens), so character A's tokens are
  dragged toward ref 2 as hard as character B's. There is no target-side gating.
  `ref_boost_mask` should reduce this (fewer boosted columns, no outfit/background
  contamination) but cannot cure it. Two-ref probably wants `ref_boost` near 1.0.
- **Untested:** `ref_boost_mask` for localized edits. Note the mask masks the REFERENCE
  columns, not the target rows - it cannot localize an edit or stop the model
  reframing/zooming. That job belongs to the existing `InpaintCropImproved` /
  `InpaintStitchImproved` path (MPI-282) plus `fit_mode: fit` for the grid mapping.

## Verify

- Log line `[krea2edit] nodes v1.2.2 loaded` on engine boot.
- A/B one edit with source AR ≠ output AR, v1.1 vs v1.2.2, same seed — expect the
  stretch to disappear.
- Both engines: local + a RunPod connect (drift ladder must reinstall the node).
