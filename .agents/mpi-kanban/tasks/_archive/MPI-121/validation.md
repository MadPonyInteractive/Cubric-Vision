# MPI-121 — Live Validation Recipe

## Deferred test: model file add → /object_info refresh → visible without restart

**Preconditions:**
- Cubric Vision running locally with ComfyUI engine started and ready.
- At least one model already installed so ComfyUI has a `checkpoints` root registered.

**Steps:**

1. Open the app, navigate to a workspace that shows the model selector (e.g. Image workspace → checkpoint dropdown).
2. Note the current checkpoint list (or open ComfyUI directly at `http://127.0.0.1:8188/object_info` and search `CheckpointLoaderSimple.input.required.ckpt_name[0]` — this is the raw list ComfyUI exposes).
3. Copy a `.safetensors` checkpoint file into the **active models root** (`checkpoints/` subfolder) using your OS file manager — do NOT use the in-app download, just a plain file copy.
4. Wait ~2 seconds, then click Install / use the model selector without doing anything to restart ComfyUI.
5. **Expected (with MPI-121 fix):** The newly added checkpoint appears in the ComfyUI model list on next generation without a restart toast. The backend logs should show `Model cache reseeded via /object_info (no restart needed)`.
6. **If the model is NOT visible:** Check `/comfy/refresh-models` response in the Network tab — it should return `{ "success": true }` (not `notRunning: true`). If `notRunning: true`, ComfyUI wasn't running when the download completed; start it and re-check.

**How the refresh fires today (MPI-121 implementation):**
The `download:complete` SSE event in `downloadService.js` now calls `POST /comfy/refresh-models` fire-and-forget immediately after every non-UW model install. That backend route does `GET http://127.0.0.1:<COMFYUI_PORT>/object_info` via the existing axios instance, which reseeds ComfyUI's filename cache.

**For the pure file-copy test (no in-app download):**
The `/comfy/refresh-models` route is also callable directly:
```
curl -X POST http://127.0.0.1:3000/comfy/refresh-models
```
Run this after dropping the file, then re-open the model selector — the checkpoint should appear.

**What does NOT need the lighter refresh:**
- Changing the models ROOT path in Settings → still triggers `comfyNeedsRestart = true` → full restart (correct, unchanged).
- Adding/removing an extra LoRA/upscale folder in Settings → still triggers `comfyNeedsRestart = true` → full restart (correct, unchanged).
- Custom node install → still broadcasts `comfy:needs-restart` → full restart (correct, unchanged).

**Pass criteria:**
- [ ] Checkpoint added via in-app download appears in selector without restart toast.
- [ ] `curl -X POST http://127.0.0.1:3000/comfy/refresh-models` returns `{"success":true}` when ComfyUI is running.
- [ ] Backend log shows `Model cache reseeded via /object_info (no restart needed)`.
- [ ] No regression: changing models ROOT in Settings still restarts ComfyUI.
