# MPI-82 Phase 2B handoff — wrapper `POST /wrapper/models/upload` + image rebuild

> **For the image-build agent.** Self-contained — everything you need is here so
> you don't have to grep the codebase or ask. Read top to bottom, then build.

## What you're adding and why
The app (MPI-82 Phase 2A, committed `d8925a1` on the Cubric-Vision `RunPod`
branch) auto-uploads a user's LOCAL LoRA/upscale model to the Pod volume at
generation time when the Pod doesn't already have it. The app side is DONE and
calls a wrapper endpoint that **does not exist yet**:

```
POST /wrapper/models/upload
```

Your job: add that ONE endpoint to the wrapper, bump the wrapper version, and
build/publish the images. The presence check the app uses
(`POST /wrapper/models/status`) already works on the current image — no change
needed there.

## The endpoint — copy the existing `/wrapper/upload/media` pattern
**File:** `c:\AI\Mpi\mpi-ci\cubric-vision-pod\wrapper\wrapper.py`

The media/latent uploads already land files on the volume via the shared
`_land_on_volume()` helper (line ~726), which writes to `INPUT_DIR`. You need the
SAME shape but landing in `MODELS_DIR/<type>/<basename>` instead, resolved by the
existing `_model_dest(subdir, filename)` helper (line ~762) — which already
validates the type against `MODEL_SUBDIRS` and basenames the filename.

Reference handlers to copy (lines ~739–754):
```python
@app.post("/wrapper/upload/media")
async def upload_media(request: Request, file: UploadFile,
                       filename: str = Form(...), overwrite: str = Form("true")):
    if not _http_token_ok(request):
        return UNAUTHORIZED
    watchdog.touch()
    return await _land_on_volume(file, filename, overwrite)
```

`_land_on_volume` (line ~726) — note it writes to `INPUT_DIR`; you want
`_model_dest` instead:
```python
async def _land_on_volume(file: UploadFile, filename: str, overwrite: str):
    base = _safe_basename(filename)
    if base is None:
        return _err("invalid_payload", "filename must be a bare basename", status=422)
    dest = os.path.join(INPUT_DIR, base)
    if os.path.exists(dest) and overwrite.lower() != "true":
        return _err("exists", "file exists", status=409)
    data = await file.read()
    with open(dest, "wb") as fh:
        fh.write(data)
    return JSONResponse({"name": base, "type": "input", "path": dest, "bytes": len(data)})
```

`_model_dest` (line ~762), already present, validates + resolves the path:
```python
def _model_dest(subdir: str, filename: str):
    if not _SUBDIR_RE.match(subdir or ""):
        return None, "invalid model type"
    base = _safe_basename(filename or "")
    if base is None:
        return None, "filename must be a bare basename"
    rel = MODEL_SUBDIRS.get(subdir, subdir)
    return os.path.join(MODELS_DIR, rel, base), None
```

### Suggested implementation (a models-dir twin of `_land_on_volume`)
Add a helper + the route. The app sends a `type` Form field
(`'loras'` | `'upscale_models'`) plus `file`, `filename`, `overwrite` — same
multipart contract as media, with `type` added.

```python
async def _land_on_models(file: UploadFile, subdir: str, filename: str, overwrite: str):
    dest, err = _model_dest(subdir, filename)
    if dest is None:
        return _err("invalid_payload", err, status=422)
    if os.path.exists(dest) and overwrite.lower() != "true":
        return _err("exists", "file exists", status=409)
    os.makedirs(os.path.dirname(dest), exist_ok=True)  # MODELS_DIR/<type>/ may not exist yet
    data = await file.read()
    with open(dest, "wb") as fh:
        fh.write(data)
    return JSONResponse({"name": os.path.basename(dest), "type": subdir, "path": dest, "bytes": len(data)})


@app.post("/wrapper/models/upload")
async def upload_model(request: Request, file: UploadFile,
                       filename: str = Form(...), type: str = Form(...),
                       overwrite: str = Form("true")):
    if not _http_token_ok(request):
        return UNAUTHORIZED
    watchdog.touch()
    return await _land_on_models(file, type, filename, overwrite)
```

### App-side contract (must match exactly — already shipped, don't change the app)
- Multipart fields: `file` (the blob), `filename` (bare basename, str),
  `type` (`'loras'` | `'upscale_models'`), `overwrite` (`'true'`).
- Auth: Bearer token via `_http_token_ok` (same as every other wrapper route).
- The app reads success as HTTP 200 with a JSON body. It does NOT consume any
  field from the response (the Pod resolves the model by basename, no path
  injection), so the exact response shape is non-critical — but keep it
  `{ name, type, path, bytes }` for parity/logging.
- `MODELS_DIR` = `/workspace/mpi_models` (env `CUBRIC_MODELS_DIR`); `MODEL_SUBDIRS`
  maps `loras`→`loras`, `upscale_models`→`upscale_models` (identity). So a
  `loras` upload lands at `/workspace/mpi_models/loras/<basename>` — exactly where
  the presence check (`/wrapper/models/status` → `_is_complete_on_disk`) looks. The
  loop closes: upload lands it, next-gen presence check finds it, no re-upload.

### Edge cases (don't over-build — ponytail)
- `os.makedirs(..., exist_ok=True)` is the only real addition over the media
  path: a fresh volume may not have `MODELS_DIR/loras/` yet. `_land_on_volume`
  skips this because `INPUT_DIR` is pre-created at boot; the models subdirs may
  not be.
- Multi-GB files: `await file.read()` buffers the whole body in RAM, same as the
  media path. Acceptable for now (matches existing behavior). If you want to be
  tidy you can stream with `shutil.copyfileobj(file.file, fh)` — optional, not
  required. Leave a `# ponytail:` note if you stream so it's intentional.
- `overwrite='true'` is what the app always sends (idempotent re-upload), so the
  409 branch won't normally fire — keep it anyway for parity.

## Version bump
- `WRAPPER_VERSION` (line ~54): `WRAPPER_VERSION = os.environ.get("CUBRIC_WRAPPER_VERSION", "0.1.0")`.
  The file default is `0.1.0`; the REAL shipped version is injected via the
  `CUBRIC_WRAPPER_VERSION` build arg/env in the image build config — so the bump
  happens THERE, not (only) in this default. Find the current shipped wrapper
  version in the build config / pod-build procedure (the app pins a specific
  `wrapper_version`; recent app-side work referenced wrapper `0.2.x`) and bump to
  the next. Do NOT confuse it with the `comfy-kitchen` pip dep (also `0.2.x`) —
  different thing. Follow the existing version scheme; don't invent one.
- Update the route-list doc comment block near the top of `wrapper.py` (~line
  19–20, where `POST /wrapper/upload/media` etc. are listed) to add the new route
  so the header stays accurate.

## Build + publish (THE EXISTING FLOW — per Fabio)
- **cu128 image → build LOCALLY on the Windows machine** (`docker build`). cu128
  is Blackwell-floor and is NOT built in CI. (Disk note: C: is constrained;
  Docker data root + build artifacts belong on D:.)
- **cu124 image AND the CPU-only `-cpu` image → GitHub Actions** in the `mpi-ci`
  repo. These two are the CI matrix.
- **Push `mpi-ci` main BEFORE `gh workflow run`** — dispatch builds the PUSHED
  ref, not your local tree. (`cubric-vision-pod/` is a subfolder of the `mpi-ci`
  repo, not its own repo — commit at the mpi-ci root.)
- The CI workflow includes a **GHCR-make-public** step; make sure the new tags
  end up public or the app can't pull them.
- Follow the pod-build procedure doc/card for the exact matrix + tag names; don't
  guess tag formats.

## After the image ships — the app needs a restart (tell Fabio)
The running Express child bakes `POD_IMAGE_VERSION` / `WRAPPER_VERSION` at boot.
After publishing, the live app keeps sending the OLD image tag until it's
**restarted**. So: publish → Fabio restarts the app → verify via the app-log
image line + `/health` `wrapper_version` showing the new version. Until then the
upload POST will 404 against the old image (the app handles that 404 as a clean
failure toast — not a crash).

## Live verification (Phase 3 — after the rebuilt image is live)
This is the MPI-82 Phase 3 sign-off (Fabio drives, on a live Pod):
1. Remote gen with a Pod-ABSENT local LoRA → "Uploading … to the cloud" toast →
   file lands in `/workspace/mpi_models/loras/` → generation uses it → output
   produced.
2. The repro that opened this card: custom local upscaler
   `1xDeNoise_realplksr_otf.pth` (Pod-absent) → now uploads + produces output
   (was silent no-output).
3. Re-gen same model → presence check true → NO re-upload (instant).
4. Pod reset (volume wiped) → next gen re-uploads (presence false again).

## DO NOT
- Don't touch `/wrapper/models/status` or `_is_complete_on_disk` — they already
  answer the app's presence check correctly for bare `{type, filename}`.
- Don't touch any Cubric-Vision app file — Phase 2A is committed and owns the app
  side. This handoff is wrapper + image ONLY.
- Don't trigger live Pod ops (create/connect/delete) — image build/publish is
  authorized; live Pod operations stay USER-only.

## Coordination
Card: MPI-82 (this folder). Gating card for the rebuild: MPI-81. When the image
is published + version-bumped, drop a kanban message to MPI-82 with the new
image/wrapper version tags so the app-side gate can be flipped to "live" and
Phase 3 scheduled.
