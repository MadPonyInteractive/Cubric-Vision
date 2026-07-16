# MPI-282 — Validation

## Verified LOCAL (Electron desktop, local engine) — 2026-07-16

- **t2i** — generates. Fixed a no-input-image dimension block (empty `Input_Image`
  starved `Get Image Size` → no latent dims → no sampler); re-export sources dims when
  the image is empty.
- **Masked identity-edit** — works end-to-end. Paint mask in History workspace →
  `InpaintCrop` → sample (identity-edit LoRA) → `InpaintStitch`. No color seam (the
  whole-image-edit seam was a VAE composite-boundary drift; the crop/stitch path avoids it).
  Man composited into the scene cleanly.
- **Empty mask** — whole-image edit (the `MpiAnyChecker` on `Input_Mask` gates correctly).
- **Dep install** — `comfyui-inpaint-cropandstitch` auto-installed into the portable engine
  on demand (installRequirements:false, rides volume — no rebuild). `comfyui-krea2edit`
  confirmed present.
- **Sanitizer** — `_sanitize_injected_inputs` scrubs leaked test-state at build (verified:
  baked seed/prompt/image path/style/Is_Edit all reset). `validate-injection-rules.mjs` passes
  on all 4 t2i runtime files.

## Reverted (tried, didn't work — do NOT re-add without new evidence)

- **Style LoRAs on edit** (styleSelect + stylization) — style LoRAs don't compose with the
  identity-edit LoRA; edit degrades. Edit op ships `components: []`.
- **Force-1024 crop toggle** (`Input_HiRes_Mode`) — didn't improve results enough to keep.

Both nodes remain in the graph, scrubbed to safe defaults, just not user-exposed.

## PENDING — final gate (deferred to 2026-07-17)

- **RunPod (remote engine) verification.** Local-engine-on-Windows is NOT proof of the remote
  path. Needs: connect a Pod, install the two edit node packs on the volume, run a masked edit
  remotely, confirm crop/stitch + dep install + output capture over the network.
  ([[feedback_runpod_not_local_engine_proof]])

Card stays in `doing` until RunPod passes.
