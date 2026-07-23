# MPI-260 Validation

## Verified (user-confirmed this session, 2026-07-12)

- **Transparent mode, LOCAL engine** — chipmunks/portrait test, clean fur + flyaway-hair edges. ✅
- **Color mode, LOCAL engine** — subject composited over picked solid color (#AF5050, #846060). ✅
- **Picker gating** — color picker + label show ONLY when Color mode selected. ✅
- **Transparent + Color, REMOTE Pod engine** — dark selfie scene (phone rim-light, black-on-black), clean cutout both modes. ✅ (Pod image rebuilt to bake birefnet by a separate agent session.)

## Bug found + fixed mid-session
- Native `RemoveBackground` outputs a foreground MASK (not RGBA). Initial graph cut the SUBJECT instead of the background (inverted). Fix: `InvertMask` before `JoinImageWithAlpha` (transparent branch); color branch uses the un-inverted mask for `ImageCompositeMasked`. Re-verified correct.

## Infra
- Weight `birefnet.safetensors` (444MB, MIT, Comfy-Org/BiRefNet) uploaded + verified on R2 (`models.cubric.studio/vision/models/background_removal/`), sha256 `9ab374…` matches dep. Pod Dockerfile bakes it (mpi-ci).

## Outstanding (non-blocking, git hygiene)
- 5 co-owned registry files (dependencies.js, commandRegistry.js, operationRegistry.js, operation_registry.json, universal_workflows.js) hold my removeBackground entries in the SAME hunks as peers' in-flight appSdxl4k/apps work. Deliberately NOT committed by this session — they ride out with the owning peer sessions' commits. Feature works regardless (files on disk). Core MPI-260 committed in 38fdfa5a.
