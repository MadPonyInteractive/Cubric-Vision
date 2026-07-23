# MPI-128 — Checklist (item 1: dual-latent stage-2 staging)

## Workflow files
- [x] LTX template bumped tier-2 dual-save (Output_Video_Latent / Output_Audio_Latent)
- [x] 4 LTX app files regenerated via orchestrate.py (titles + Is_Continue verified)

## App wiring (7 points)
- [x] 1. commandExecutor `_collectComfyLatents` tags role by SaveLatent title
- [x] 2. generationService splits latents → `latent` (video) + `audioLatent`
- [x] 3. projects.js `materializePreviewAssets` materializes audio latent → `.latents/<id>.audio.latent`
- [x] 4. projects.js validate-preview-assets stats + gates fast-path on audio latent
- [x] 5. MpiGalleryBlock continue + finish pass `loadAudioLatentName`/`audioLatentFilePath`
- [x] 6. commandExecutor `_stagePreviewLatent` stages both latents (2 route calls)
- [x] 7. commandExecutor `_buildParams` emits `Input_Audio_Latent`
- [x] deletion cleanup drops both video + audio latent files

## Capability gates
- [x] LTX `multiStage: false → true` (unlocks previewStage toggle + preview→Finish)
- [x] branchingContinue made model-aware (WAN=true, LTX omits → Finish-only)

## Verify
- [x] node --check all touched JS — pass
- [x] self-check: latent role-tagging + video/audio pairing + fast-path gate — pass
- [x] self-check: branching-continue model gate — pass
- [ ] LIVE: LTX i2v preview → Finish on a real engine (local or Pod)
      - [ ] preview run writes 2 latents to `.latents/` (`<id>.latent` + `<id>.audio.latent`)
      - [ ] Finish stages BOTH into engine input/
      - [ ] stage-2 prompt validates (no `Invalid latent file`)
      - [ ] final ≈ preview; Continue button hidden (Finish-only)

## Deferred (still on this card, NOT this session)
- [ ] item 2: R2 base-file audit + GC (coordinate MPI-137/129)
- [ ] item 3: kill `_ms` suffix → command.isMultiStage flag
- [ ] item 4: multimodal 5+ image UI (blocked on LTX upstream)
- [ ] item 5: deferred branch workflows (lipdub/lipsync/extend/CTRL/head-swap)
