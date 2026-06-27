# MPI-128 — Validation (item 1: dual-latent stage-2 staging)

Date: 2026-06-27

## Static / logic (DONE, verified)
- `node --check` on all 6 touched JS files → all OK.
- Self-check `dual_latent_check.mjs`: role-from-title (video/audio/legacy), latent
  split (order-independent video+audio), WAN single-latent → audioLatent null,
  fast-path gate (declared-but-missing audio blocks) → ALL PASS.
- Self-check `branch_check.mjs`: WAN branches, LTX Finish-only, no-model fallback,
  op-without-flag never branches → ALL PASS.
- Regenerated LTX files inspected: Output_Video_Latent (#48) + Output_Audio_Latent
  (#54) save titles; Input_Video_Latent (#67) + Input_Audio_Latent (#69) load;
  stage2 Input_Is_Continue=true, stage1=false; i2v Text_to_video=false, t2v=true.
- All 5 WORKFLOW_INPUT_DEFAULTS files present in comfy_workflows/input/ (incl.
  ltx_audio_latent_00001_.latent) → stage-1 baked-name validation safe.

## LIVE — PASS (2026-06-27, local engine, ComfyUI 0.26, G:\CubricModels)
LTX t2v with previewStage ON (audio-mode on, NO audio input file → audio latent
generated live from prompt). Two previews queued (16:9 + 9:16), both landed.
- [x] 1. Each preview wrote 2 latents to Ops Selection/Media/.latents/:
      652c6267-….latent (62704B) + 652c6267-….audio.latent (39664B), same for ad9d96a9.
- [x] 2. Preview sidecar: latent.status=available AND audioLatent.status=available
      (652c6267, stage=preview). Final card (ad9d96a9, stage=final) → both cleared.
- [x] 3. Stage-2 ran (user pressed Continue) → result landed; app.log has ZERO
      `Invalid latent file` / stage-preview-latent / materialize errors.
- [x] 4. Final produced.
- [x] 5. Continue button: initially mis-shown when LTX briefly had branchingContinue
      (user confirmed BOTH Continue + Finish worked no-audio), then reverted to
      Finish-only per refined-workflow decision (prompt no longer affects stage-2).
- [x] 6. Older queued preview still works (both previews independent, no cross-talk).
- [x] previewStage toggle now visible on LTX (multiStage:true landed).

## STILL UNTESTED (follow-up, not blocking item-1 close)
- LTX with a real AUDIO INPUT FILE (Reference / Original mode) preview→Finish —
  exercises the Input_Audio_File chip injecting over the baked default alongside
  dual-latent staging.
- RunPod (remote engine) dual-latent staging — same flow via wrapper upload path
  (remoteUploadInput in _stageOneLatent). Local proven; remote pending Pod free.

## Risk notes
- LTX stage-2 file still contains both SaveLatent nodes (no bypass-splice by
  design). A Finish (non-preview) run will re-emit 2 latents — harmless
  (capture title = 'output', collection only feeds the preview sidecar path).
- `Input_Video_Latent` stage-1 default stays `ComfyUI_00001_.latent` (WAN name,
  always staged) — overrides LTX's baked name but validation-only on stage-1.
