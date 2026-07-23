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
  on all t2i runtime files. (Was 4 files when written; MPI-316 collapsed them to 2 —
  `krea2_t2i_sfw.json` / `_nsfw.json`.)

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

- **The MPI-316 collapse changed the graph under this card — re-verify on the same Pod run**
  (added 2026-07-20). MPI-316 shipped and closed on **local-engine evidence only**; nothing in
  it has run remotely. What changed beneath the edit path:
  - **Different weight.** Edit now runs on Raw + the `krea2_turbo_distill_r128` accelerator
    LoRA, not a Turbo transformer. `krea2-lora-accelerator` is a NEW dep on both cards — check
    it installs on the volume and resolves; a missing LoRA is the classic silent-degrade.
  - **Backslash path.** That dep's `lora_name` bakes as `krea-2\extra\...` (repo-wide
    convention, matches every other subfoldered LoRA), but the Pod is **Linux**. Existing LoRAs
    ship this way and work, so it should be fine — confirm rather than assume.
  - **New two-pass chain.** Both tiers now run a 3-step accelerator refiner after the main
    sampler. Verify it survives the remote path and the crop/stitch edit route.
  - **Tier is injected, not baked.** `Input_Tier` comes from the `krea2Turbo` toggle at runtime;
    the workflow bakes `1` only as a safe default. Injection failure is SILENT — confirm a
    turbo-ON remote run actually renders at tier 2 (8+3 steps), not the baked quality chain.
  - Deleted runtime files (`krea2_t2i_balanced_*`, `_high_*`, `krea2_turbo_*`) may still sit on
    the Pod volume from an earlier sync; they are unreferenced but worth clearing.

> User intends to consolidate every RunPod-deferred card (MPI-282, MPI-300, MPI-310, MPI-198)
> into ONE verification card in a later session. Until that exists, this list lives here.

Card stays in `doing` until RunPod passes.
