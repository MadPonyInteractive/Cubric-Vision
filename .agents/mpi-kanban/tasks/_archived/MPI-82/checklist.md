# MPI-82 Checklist — COMPLETE (all phases shipped + live-verified 2026-06-17)

> Phase 1 (local drag-drop + missing guard + Windows separator fix + relocated-model
> heal) COMPLETE + accepted. Phases 2A/2B/3 (on-demand auto-upload) COMPLETE + live-
> verified. See validation.md for the full verified list.

### Phase 2A — app-side — DONE (commit d8925a1)
- [x] `routes/remoteModels.js`: `remoteUploadModel` + `remoteModelPresent` (bare `/wrapper/models/status`).
- [x] Express routes (`routes/remoteProxy.js`): `/remote/upload/model` + `/remote/model-present`,
      upload route resolves filename → abs local path via configured folders.
- [x] `js/services/comfyController.js`: `_uploadRemoteModels` pre-`/prompt`, gated
      `isRemote() && !opts.forceLocal`; presence check → if absent: toast + upload, then proceed.
- [x] `js/services/commandExecutor.js`: thread `opts.forceLocal`; documented `_findMissingModel`
      as mode-agnostic (no redundant remote branch — local-disk presence is the precondition for both).
- [x] Toast UX "Uploading <model> to the cloud…" shown for the transfer.
- [N/A] RAM stream-vs-buffer: kept buffer (matches existing `remoteUploadInput`); fine in live test.

### Phase 2B — wrapper + image — DONE (mpi-ci 249ea37, v0.4.9 / wrapper 0.2.11; app pin flip 553a1b9)
- [x] `wrapper.py`: `POST /wrapper/models/upload` (`_land_on_models` → `_model_dest` → `MODELS_DIR/<type>/`).
- [x] WRAPPER_VERSION 0.2.10→0.2.11; cu124/cpu via CI, cu128 local; three v0.4.9 tags public.
- [x] App pin flipped (POD_IMAGE_VERSION v0.4.9, WRAPPER_VERSION 0.2.11) + app restart.

### Phase 3 — live-Pod verify — ACCEPTED (USER, L4, 2026-06-17)
- [x] Remote `t2v_ms` gen with Pod-absent local LoRA → upload toast → landed → LoRA influenced output.
- [x] Repro `1xDeNoise_realplksr_otf.pth` (+ `1x-ITF-SkinDiffDetail-Lite-v1.pth`) → uploads + produces
      output (was silent no-output). Both buckets confirmed.
- [x] Re-gen / concurrent same model → presence true → no re-upload.
- [N/A] Pod-reset re-upload: network volume is persistent (Reset doesn't wipe it); presence is a live
      `os.path.exists` every gen, no app cache — absent→upload + present→skip already proven.
- [ ] True local-missing still blocks: Phase-1 behavior, `_findMissingModel` untouched, not re-run live.

### Follow-up flagged (NOT MPI-82)
- [ ] x2 upscale appears to DOWNSCALE (832×1024 → 416×512). Upscale-factor/output-sizing, unrelated to
      upload. Card separately if reproducible.
