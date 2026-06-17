# MPI-82 Checklist

> Phase 1 (local drag-drop + missing guard + Windows separator fix + relocated-model
> heal) is COMPLETE and user-accepted — see validation.md for the full verified list.
> Only remote work remains.

## Remaining (RE-SCOPED 2026-06-17 — on-demand auto-upload, see plan.md RE-SCOPE block)

### Phase 2A — app-side (build + test NOW; upload POST gated until 2B)
- [ ] `routes/remoteModels.js`: `remoteUploadModel(localPath,type,filename)` (mirror
      `remoteUploadInput`) + `remoteModelPresent(type,filename)` (bare `/wrapper/models/status`).
- [ ] Express routes (`routes/remoteProxy.js` / `routes/comfy.js`): `/remote/upload/model`
      + presence check, mirroring `/remote/upload/media`.
- [ ] `js/services/comfyController.js`: generate-time, pre-`/prompt`, per selected
      LoRA/upscale in remote mode → presence check → if absent: toast + upload, then proceed.
- [ ] `js/services/commandExecutor.js`: `_findMissingModel` remote-aware (local-missing
      still blocks; present-local-absent-on-Pod → upload not block); same for `_resolveUpscaleParam`.
- [ ] Toast UX "Uploading <model> to cloud…" persists for the whole transfer.
- [ ] RAM check: `remoteUploadInput` buffers the whole file — decide stream-vs-buffer for multi-GB.

### Phase 2B — wrapper (GATED on MPI-81 rebuild; separable to its own agent)
- [ ] `mpi-ci/cubric-vision-pod/wrapper/wrapper.py`: `POST /wrapper/models/upload`
      (copy of `/wrapper/upload/media`, dest via `_model_dest(type,filename)` → `MODELS_DIR/<type>/`).
- [ ] Bump WRAPPER_VERSION; build cu124/cu128 matrix per pod-build procedure; make GHCR public.

### Phase 3 — live-Pod verify (after 2B image ships)
- [ ] Remote gen with Pod-absent local LoRA → upload toast → output produced.
- [ ] 2026-06-17 repro (`1xDeNoise_realplksr_otf.pth`) → uploads + produces output (was silent no-output).
- [ ] Re-gen same model → presence=true → no re-upload. Pod reset → re-uploads.
- [ ] True local-missing in remote mode → still blocks with toast.
