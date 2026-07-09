# MPI-121 Checklist

Implementation done. Item below is USER VALIDATION — eye-test it live with
ComfyUI running. Full recipe in validation.md.

- [x] Implementation: POST /comfy/refresh-models route + download:complete fire-and-forget hook (parsed, lint-clean)
- [ ] **Model appears WITHOUT a restart** → with ComfyUI running, drop a checkpoint into the active models root (or let an in-app model download finish into the existing root) → the new model shows up in the model selector (e.g. CheckpointLoaderSimple list) WITHOUT a ComfyUI stop/start. NOT a ~5-10s restart, NOT a "needs restart" prompt.
- [ ] **No-op when ComfyUI is down** → trigger a model download while ComfyUI is NOT running → no error surfaces from the refresh call (it silently no-ops; model reseeds on next ComfyUI start).
