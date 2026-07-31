# MPI-414 — a failed `comfy install` leaves an engine that looks installed and cannot boot

Found live on Linux 2026-07-31, downstream of MPI-411. **This is the detection /
recovery gap**, not the cause — MPI-411's `--restore` prevents the failure;
MPI-414 is that nothing notices or repairs it once it has happened.

## The failure chain, measured

1. `comfy install` exits 1 (`ComfyUI is already installed at the specified path`)
   **before** it installs ComfyUI's own `requirements.txt`. MPI-411.
2. `_runEngineDownload` throws, so **step 5 never runs** and
   `<engine>/.mpi_engine_version` is never written (`engine.js:535-544`).
3. The user presses Retry. `MpiEngineInstall.js:316-324` routes on
   `/engine/status`, which is true as soon as the **venv python** exists:

   ```js
   engineReady = status && status.exists === true;
   const route = engineReady ? '/engine/repair-deps' : '/engine/download';
   ```

   On the uv path that python exists from step 1 onward — long before ComfyUI is
   cloned or stamped. So Retry goes to **deps-only**, which installs custom nodes
   and their requirements and returns success. It never re-runs
   `comfy install`, never installs ComfyUI core requirements, never stamps.

## The resulting state — every check passes, nothing works

Measured on the box:

| probe | result |
|---|---|
| `/engine/status` | `exists: true` |
| `/engine/deps-status` | `needsDepsInstall: false`, `missingDeps: []`, `driftedDeps: []` |
| `ComfyUI_linux/` | real clone, `main.py`, `.git`, 16 custom nodes |
| venv | 359 packages, `torch 2.13.0+cu130` |
| `/engine/version-check` | `installed: null`, **`needsInstall: true`** |
| ComfyUI start | `ModuleNotFoundError: No module named 'sqlalchemy'` |

The log confirms the deps install genuinely SUCCEEDED —
`node commit marker stamped for comfyui_controlnet_aux` at 00:48:28 — and still
left no stamp. So a *successful* install pass produces an unusable engine.

## Two distinct holes

1. **The stamp is only ever written by `_runEngineDownload`.** Any failure after
   provisioning, or any completion via the deps path, leaves a fully provisioned
   engine that the app reports as `needsInstall`. There is **no in-app
   recovery**: the user is shown "Let's set up ComfyUI" forever. The only escape
   found was hand-writing `printf '0.28.0' > engine/.mpi_engine_version`, which
   no user would ever discover.
2. **`engineReady` asks the wrong question on the uv path.** The comment at
   `MpiEngineInstall.js:311-315` says the routing exists so "repairing deps with
   no Python" cannot happen — but Python presence does not imply ComfyUI is
   installed. On Windows (prebuilt archive) python and ComfyUI arrive together,
   so the test holds; on Linux/macOS they are separate steps and it does not.

**Note the stamp is not sufficient either.** Writing it by hand made the UI
proceed, and ComfyUI still would not start, because ComfyUI's own
`requirements.txt` had never been installed. A green stamp on a broken engine is
arguably worse than no stamp.

## Candidate fixes

- **Readiness must be a real test, not a file.** `/engine/status` (and the Retry
  routing) should ask whether ComfyUI can actually run — e.g. clone present AND
  a core import available — not whether one binary exists.
- **`/engine/repair-deps` must be able to repair the engine**, or must refuse and
  hand back to `/engine/download`. Today it silently reports success on a broken
  engine.
- **Stamp on every success path**, not only inside `_runEngineDownload`.

## Manual recovery, for anyone who hits this before it is fixed

```sh
engine/comfy-venv/bin/python3 -m pip install -r engine/ComfyUI_linux/requirements.txt
printf '0.28.0' > engine/.mpi_engine_version
```

(No `--upgrade` — torch is already satisfied and `--upgrade` would drag the whole
CUDA stack down again, MPI-413.)

## Blast radius

Linux and macOS (the `_provisionUvEngine` path). Windows resolves python and
ComfyUI in one archive, so the routing assumption holds there.
