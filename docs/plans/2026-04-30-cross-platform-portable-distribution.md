# Cross-Platform Portable Distribution

> **Refreshed 2026-05-18.** Original plan (2026-04-30, commit `852af67`) contained concrete research on portable-zip layouts, comfy-cli bootstrap, native-dep rebuild list, launcher specs. May 1 rewrite (commit `7ec10ce`) replaced it with an abstract refactor-first framing and deleted the research. This refresh restores the research, merges in what has shipped since, and re-states the goal: **three portable zips, no installers**.

**Goal:** ship three platform-specific portable zips (Windows, macOS, Linux) that users unzip and run. No NSIS, no DMG, no AppImage, no system-wide installer. Bundled Node + Electron + native deps. ComfyUI engine bootstraps on first run per platform.

**User experience target:**
- **Windows:** unzip → double-click `CubricStudio.vbs` → app opens (no terminal).
- **macOS:** unzip → double-click `start.command` in Finder → app opens.
- **Linux:** unzip → run `./start.sh` → app opens.

**Update target:** every release publishes both a full portable artifact for
new users and a portable update bundle/script for existing users. This follows
the ComfyUI portable pattern: the app folder can include an `update/` directory
with platform scripts the user runs manually to pull/apply only what is needed.
This is not `electron-updater` and not an installer.

**Primary constraint:** development happens on one Windows machine. Linux and macOS cannot be marked done without a real-host smoke test.

---

## Existing infrastructure (already shipped)

Audit 2026-05-18:

- `electron-builder.yml` exists targeting Win NSIS / Mac DMG / Linux AppImage. **Out of scope for this plan** — we are shipping portable zips, not installers. Either delete the file or leave it as a future-tier option clearly labelled "not used by build-portable script."
- `routes/platformEngine.js` — `COMFY_DIR_MAP`, `PYTHON_BIN_PARTS_MAP`, `LLAMA_BIN_MAP` all have darwin/linux entries (marked `// placeholder — no portable release yet`). `getEngineRoot`/`getLlamaEngineRoot`/`getLlamaModelsRoot` config-aware. GPU detection (nvidia/amd/intel) Windows-only paths via `wmic`.
- `services/ffmpegBinary.js` resolves bundled binaries via `MPI_RESOURCES_PATH` or `process.resourcesPath`, falls back to `ffmpeg-static`/`ffprobe-static` in dev. Used by `services/ffmpegThumb.js`, `services/ffprobeVideo.js`, `services/videoConcat.js`, `routes/videoCrop.js`.
- `main.js:299` exports `MPI_RESOURCES_PATH` to the forked server. **Note:** built for electron-builder packaging; for portable zip we'll need a parallel env (e.g. `MPI_RESOURCES_PATH` pointed at `<unzip-root>/app/resources/` or similar).
- `main.js:407–425` (`warp-cursor`) — win32/darwin/linux branches (PowerShell / osascript / xdotool).
- `main.js:509` (`choose-folder`) — Electron `dialog.showOpenDialog`, cross-platform.
- `routes/projects.js` default project root = `<Documents>/Cubric Studio/Projects` via `APP_DOCUMENTS` from main.js. Cross-platform via `app.getPath('documents')`.
- `routes/system.js:228` `/system/platform-config` exposes `process.platform` + `COMFY_DIR` to client.

---

### Current engine path contract

The existing Windows implementation is built around one path shape. Preserve it unless a real Mac/Linux comfy-cli install proves it impossible:

- `getEngineRoot()` returns the engine root (`<repo-or-portable>/engine`, or `.engine-config.json` override in worktrees).
- `getComfyPath(engineRoot, ...)` resolves to `<ENGINE_ROOT>/<COMFY_DIR>/ComfyUI/...`.
- `getPythonBin(engineRoot)` resolves to the platform Python under `<ENGINE_ROOT>/<COMFY_DIR>/...`.
- `routes/comfy.js` starts ComfyUI by spawning `getPythonBin(ENGINE_ROOT)` with `main.py = getComfyPath(ENGINE_ROOT, 'main.py')`.
- `routes/shared.js`, `routes/comfy.js`, `routes/downloadManager.js`, `routes/engine.js`, and `main.js` capture these roots at module import time, so any portable env/config must be present before `server.js` starts.
- Worktree sharing already exists via `.engine-config.json` (`enginePath`, `llamaPath`, `llamaModelsPath`). Portable zips should use explicit environment variables instead of writing `.engine-config.json` into shipped artifacts, because shipped zips need to remain movable.

---

## ComfyUI distribution facts (from research)

- **Windows official portable.** v0.20.1 + v0.19.3 ship `ComfyUI_windows_portable_<gpu>.7z` (nvidia / nvidia_cu126 / amd / intel). Self-contained `python_embeded/` + ComfyUI + `run_nvidia_gpu.bat`. App already uses this via `routes/engine.js _runEngineDownload()`.
- **macOS / Linux: no official portable.** Engine install = `comfy-cli` driven by bundled `uv`. No system Python required (see "Python bootstrap via uv" below).
- **comfy-cli install path:** we pass `--workspace <ENGINE_ROOT>/<COMFY_DIR>`, not bare `<ENGINE_ROOT>`. Comfy CLI documents `comfy --workspace=<path> install` as installing ComfyUI into `<path>/ComfyUI`, which matches the existing app path contract.

---

## Python bootstrap via `uv` (Mac/Linux)

Problem: Windows zip ships `python_embeded/` inside ComfyUI's own portable. Mac/Linux have NO official portable Python equivalent. Cannot assume user has Python 3.10+ with pip.

Solution: bundle [`uv`](https://github.com/astral-sh/uv) (Astral) — single static Rust binary, ~30MB per platform. uv manages Python install + venv + pip-equivalent. Zero host Python dependency.

**Why uv:**
- Single binary, ~30MB. Mac arm64/x64, Linux x64/arm64, Windows x64 all available.
- Apache 2.0 / MIT license. Free to redistribute. No SaaS, no API keys, no recurring costs.
- Installs Python via `python-build-standalone` (relocatable PSF + MIT licensed builds).
- Faster than pip (Rust resolver).
- Pin to specific uv version in `dev_configs/system_dependencies.json` for reproducibility.

**Zip-local uv environment variables** before every uv/comfy call:
- `UV_PYTHON_INSTALL_DIR=<zip-root>/python` — managed Python lives inside the unzipped app.
- `UV_TOOL_DIR=<zip-root>/uv-tools` — `uv tool install comfy-cli` does not write tool envs to the user profile.
- `UV_TOOL_BIN_DIR=<zip-root>/uv-bin` — the `comfy` executable is zip-local and can be invoked directly.
- `UV_CACHE_DIR=<zip-root>/uv-cache` — first-run downloads/cache stay portable and inspectable.
- `UV_MANAGED_PYTHON=1` — force uv-managed Python instead of silently selecting host Python.
- `UV_NO_CONFIG=1` — prevent user/global uv config from changing installer behavior.

**Engine install flow (Mac/Linux, all silent, SSE-streamed to UI):**
```
1. spawn('<zip>/uv', ['python', 'install', '3.12'])
2. spawn('<zip>/uv', ['tool', 'install', '--python', '3.12', 'comfy-cli'])
3. spawn('<zip>/uv-bin/comfy', ['--workspace', COMFY_WORKSPACE, 'install', '--fast-deps'])
```

**Zip-local Python install dir** to keep portable promise intact:
- Set `UV_PYTHON_INSTALL_DIR=<zip-root>/python` env before each `uv` call.
- Python interpreter lands inside the unzipped folder, not `~/.local/share/uv/`.
- Set `UV_TOOL_DIR`/`UV_TOOL_BIN_DIR`/`UV_CACHE_DIR` too; otherwise comfy-cli and uv cache can still land under the user profile.
- Moving the unzipped folder = engine still works (no machine-cache dependency).
- Adds ~100MB to disk after first-run; first-run network ~30MB Python download.

**Comfy workspace contract for Mac/Linux:**
- `COMFY_WORKSPACE = path.join(ENGINE_ROOT, COMFY_DIR)`, not bare `ENGINE_ROOT`.
- Comfy CLI documents `comfy --workspace=<path> install` as installing ComfyUI into `<path>/ComfyUI`.
- That preserves the app's existing `getComfyPath(ENGINE_ROOT, ...) -> <ENGINE_ROOT>/<COMFY_DIR>/ComfyUI/...` contract.
- With comfy-cli installed via `uv tool install`/pipx-style isolation, its docs say it creates a `.venv` inside the workspace. Expected Python path is therefore `<ENGINE_ROOT>/<COMFY_DIR>/.venv/bin/python` on Mac/Linux, but this MUST be verified on a real host before coding final path constants.
- Do not assume flags like `--m-series`, `--nvidia`, or `--amd` exist until `comfy install --help` is checked for the pinned comfy-cli version. Current comfy-cli docs explicitly support `--fast-deps`; GPU wheel selection is described there, while system CUDA/ROCm requirements may still apply on Linux.

**User experience: zero friction.** Same as Windows today — open app, engine install screen with progress bar, done. No terminal, no Python prompts, no version picking, no manual config.

**Costs:** ~30MB uv binary per platform in the zip. ~100MB Python after first-run in `<zip>/python/`. No cash costs.

---

## Native dependencies — must be rebuilt per target platform

The build script must produce platform-correct binaries for each of these:

| Package | Notes |
|---|---|
| `sharp@0.34.5` | C++ image processing. One `.node` file. `npm rebuild --platform=...` |
| `7zip-bin@5.2.0` | Pre-compiled 7z binary. Windows `.exe` + Linux binary present. **No macOS binary**. Current code also imports it for custom-node ZIP extraction, so Phase 0.5 must remove/lazy-load that dependency before Mac can strip it safely. Windows engine `.7z` extraction can keep using it. |
| `ffmpeg-static@5.3.0` | Pre-compiled per platform. Already mapped in `electron-builder.yml` extraResources — we'll mirror the same mapping in the portable build script. |
| `ffprobe-static@3.1.0` | Same as ffmpeg-static. |
| Electron 41.0.3 | Per-platform binary via `@electron/get` or by pre-installing `node_modules` on the target platform (cleanest path = build on target OS). |
| `uv` (external binary, **Mac/Linux only**) | Astral's Rust binary. ~30MB. Downloaded from astral-sh/uv GitHub releases by `build-portable.js`. Pinned in `dev_configs/system_dependencies.json`. Not an npm package; staged at zip root. Windows zip does NOT need uv (ComfyUI portable ships its own `python_embeded/`). |

---

## LLM / llama.cpp future track

LLM features are **not part of the first portable releases** unless a release explicitly enables them. The app already has dormant llama.cpp plumbing (`routes/llm.js`, `dev_configs/llm_models.json`, `llama_engine/`, `llama_models/`, `getLlamaBin()`), so this distribution plan should preserve those paths without making LLM success a v0.0.1 gate.

Planned LLM rollout:

- Local first, remote later.
- Local runtime: llama.cpp / `llama-server`.
- Initial local model set: one tested Qwen model and one tested Gemma model.
- Expected VRAM bands: low tier around 4 GB VRAM; higher tier around 8-12 GB VRAM.
- Initial use: prompt enhancement.
- Later use: other assistant-style features inside Cubric Studio.
- After local LLM releases are stable, add an optional remote provider path via DeepInfra.

Packaging implications:

- Do **not** bundle GGUF model files inside the app zip. Keep model downloads optional and stored under `llama_models/`.
- Keep `CUBRIC_LLAMA_ROOT` and `CUBRIC_LLAMA_MODELS_ROOT` in launchers now so future LLM releases are folder-stable and movable.
- llama-server binary staging/download can be future-ready, but the v0.0.1 smoke gate should not fail because llama-server or GGUFs are absent unless the release includes LLM features.
- Before the LLM release, prune `dev_configs/llm_models.json` to the two intended tested models and remove stale experimental entries from the user-facing registry.
- DeepInfra support should be introduced behind a provider abstraction later (`local` vs `remote`) and must not become a hard dependency for local generation or prompt enhancement.

---

## Phase target order

1. **Windows portable zip — first deliverable.** Locally buildable + testable end-to-end.
2. **Linux portable zip + engine bootstrap.** Needs Linux host (VM, WSL, CI runner) to build native deps + smoke.
3. **macOS portable zip + engine bootstrap.** Needs Mac host (or CI) — no Windows substitute for final validation.

Order is mechanical (Windows is the only platform locally testable), not a priority statement. Linux + Mac are equal-rank ship targets, not stretch goals.

---

## Phase 0 — Runtime portability fixes (Windows-locally testable)

Five fixes block ALL three portable zips. Most are independently testable on the current Windows dev machine; ZIP extraction import safety still needs a Mac/Linux require smoke.

- [ ] **0.1. Replace bare `ffmpeg`/`ffprobe` in `routes/projects.js`**
  - File: [routes/projects.js:1057,1080](../../routes/projects.js)
  - Replace `ffprobeCmd`/`ffmpegCmd` template strings with `execFile(ffprobePath, [...args])` / `execFile(ffmpegPath, [...args])` using `services/ffmpegBinary.js`.
  - Convert from `execPromise(cmd)` (shell) to argv form — removes the quoting hazard at the same time.
  - **Verify:** extract a clip from a video in the editor — same output filename pattern, same crop behavior.

- [ ] **0.2. Make `/open-folder` cross-platform**
  - File: [routes/system.js:71-81](../../routes/system.js)
  - Replace `exec('start "" ...')` with an IPC call to main that uses `shell.openPath(folderPath)` (Electron, cross-platform, no shell).
  - Keep the route signature stable; the route becomes a thin pass-through to the IPC (same pattern as `/choose-folder`).
  - **Verify:** right-click any project on the landing page → "Open in file explorer" still opens the folder in dev.

- [ ] **0.3. Audit other Windows-only shell calls**
  - `routes/system.js:26` `nvidia-smi` — already gracefully returns zeros on non-Windows (no `nvidia-smi` in PATH).
  - `routes/platformEngine.js` `detectAmdGPU` / `detectIntelArcGPU` already gate on `process.platform === 'win32'`.
  - `main.js:407-425` (`warp-cursor`) already branches per platform.
  - Grep remaining `exec(`/`execFile(` calls in `routes/` and `main.js` — flag any unbranched Windows-only command.
  - **Verify:** grep clean, document any remaining branch in a comment at the call site.

- [ ] **0.4. Define portable root/env contract before build work**
  - Files: launchers, `main.js`, `routes/platformEngine.js`, `services/ffmpegBinary.js`.
  - Add explicit env vars set by every launcher:
    - `CUBRIC_PORTABLE_ROOT=<zip-root>`
    - `CUBRIC_ENGINE_ROOT=<zip-root>/engine`
    - `CUBRIC_LLAMA_ROOT=<zip-root>/llama_engine`
    - `CUBRIC_LLAMA_MODELS_ROOT=<zip-root>/llama_models`
    - `CUBRIC_UV_BIN=<zip-root>/uv` (Mac/Linux)
    - `MPI_RESOURCES_PATH=<zip-root>/resources`
  - `getEngineRoot()` / `getLlamaEngineRoot()` / `getLlamaModelsRoot()` should prefer these env vars before `.engine-config.json`, then fall back to repo-local defaults.
  - `services/ffmpegBinary.js` should work for both electron-builder resources and portable `resources/`.
  - **Verify:** start app from a copied folder outside the repo and log resolved roots once on startup.

- [ ] **0.5. Remove Mac/Linux dependency on `7zip-bin` for custom node ZIPs**
  - Current blocker: `routes/downloadManager.js` imports `node-7z`/`7zip-bin` at module load and uses it for GitHub custom node ZIP extraction, not just Windows engine `.7z`.
  - Options:
    - Replace custom-node ZIP extraction with a cross-platform JS ZIP library.
    - Or lazy-load `node-7z` only for Windows `.7z` engine extraction and use a different extractor for `.zip`.
  - Do NOT strip `7zip-bin` from Mac until this is fixed; otherwise the server can crash during module import.
  - **Verify:** custom node ZIP extract works on Windows after the change, and `require('./routes/downloadManager')` succeeds on a Mac host without a Mac `7zip-bin` binary.

---

## Phase 1 — Engine bootstrap: platform branches

The current `_runEngineDownload()` in `routes/engine.js` is Windows-only: downloads `.7z`, extracts via `node-7z`, patches `run_nvidia_gpu.bat`. We add Linux + macOS branches that use `comfy-cli`.

- [ ] **1.1. Extend `resolveDownloadConfig()` for Linux/macOS**
  - File: [routes/platformEngine.js:151-218](../../routes/platformEngine.js)
  - Current: returns `{ comfy: { url, filename }, llama: { url, filename } }` (Windows-only `.7z` + Windows-only llama-server zip).
  - New shape per platform:
    - `win32`: existing `.7z` URLs (unchanged).
    - `darwin` / `linux`: return `{ comfy: { mode: 'comfy-cli', workspace: path.join(ENGINE_ROOT, COMFY_DIR), installArgs: [...] }, llama: { url, filename } }` — no URL for comfy (comfy-cli handles download), sentinel `mode` field signals the install branch.
  - llama-server: ggerganov releases cover all three platforms (`bin-win-*` / `bin-macos-*` / `bin-ubuntu-*`). Add Mac + Linux URL construction as future-ready support, but do not require llama-server provisioning for v0.0.1 unless LLM features are enabled in that release.
  - GPU detection on Mac/Linux: no `wmic`. On Linux call `nvidia-smi` directly, not `which nvidia-smi`, when CUDA version is needed. For Mac, branch by `process.arch` (`arm64` = Apple Silicon/MPS path; `x64` = CPU-only or unsupported GPU warning until proven).
  - Verify comfy-cli install flags against the pinned comfy-cli version. Prefer `install --fast-deps` unless `--nvidia`/`--m-series`/`--amd` are confirmed by `comfy install --help`.
  - **Verify:** mock `process.platform = 'darwin'` and `'linux'` in a one-off script — confirm `resolveDownloadConfig()` returns the sentinel and a valid llama URL. Do NOT trust this for release — host test required.

- [ ] **1.2. Add `comfy-cli` install branch (uv-driven) in `routes/engine.js`**
  - File: [routes/engine.js:56-298](../../routes/engine.js) (`_runEngineDownload`)
  - Resolve bundled uv path from `CUBRIC_UV_BIN` first, then `<portable-root>/uv` (Mac/Linux). Add helper `getUvBin()` in `platformEngine.js`.
  - Add helper `getPortableRoot()` and `getUvEnv()` in `platformEngine.js` so all uv subprocess calls share the same zip-local env contract.
  - After `resolveDownloadConfig()`, branch on `downloadConfig.comfy.mode`:
    - `undefined` (Windows): existing `.7z` download → extract → patch path, unchanged.
    - `'comfy-cli'` (Mac/Linux): new path, all silent, SSE-streamed:
      1. `spawn(uvBin, ['python', 'install', '3.12'], { env: getUvEnv() })` → SSE `engine:downloading` stream from stdout/stderr (Python interpreter download).
      2. `spawn(uvBin, ['tool', 'install', '--python', '3.12', 'comfy-cli'], { env: getUvEnv() })` → SSE `engine:extracting` (comfy-cli + deps install).
      3. `spawn(comfyBin, ['--workspace', COMFY_WORKSPACE, 'install', '--fast-deps'], { env: getUvEnv() })` where `comfyBin = <UV_TOOL_BIN_DIR>/comfy`. SSE `engine:extracting`.
      4. Skip `.bat` patching entirely. comfy-cli writes its own launch scripts; we don't use them — we always spawn `python main.py` ourselves via `getPythonBin()` (existing code path in `routes/comfy.js`).
  - After install, write `extra_model_paths.yaml` at `getComfyPath(ENGINE_ROOT, 'extra_model_paths.yaml')` as Windows does.
  - After install, run the existing universal workflow dependency finish path. Custom node install uses `runPipCommand()` from `routes/shared.js`, so `getPythonBin()` must already point at the comfy-cli workspace venv before `finishCustomNodeInstall()` runs.
  - On any error, surface clear message to user UI (e.g. "uv binary missing from app bundle" or "comfy-cli install failed: <stderr tail>"). User-actionable, not silent.
  - SSE event contract MUST stay identical so the frontend progress UI keeps working.
  - **Verify:** code-path test on Windows with `process.platform` mocked. Functional test deferred to host.

- [ ] **1.3. Verify `getPythonBin()` for comfy-cli + uv-managed Python layout**
  - File: [routes/platformEngine.js:54-57](../../routes/platformEngine.js)
  - Current `PYTHON_BIN_PARTS_MAP`:
    - `darwin`: `[..., 'venv', 'bin', 'python3']`
    - `linux`: `[..., 'venv', 'bin', 'python3']`
  - Desired contract: `COMFY_WORKSPACE=<ENGINE_ROOT>/<COMFY_DIR>`, `ComfyUI` lives at `<COMFY_WORKSPACE>/ComfyUI`, and comfy-cli's venv lives at `<COMFY_WORKSPACE>/.venv`.
  - If verified, update Mac/Linux path to `[COMFY_DIR_MAP.<platform>, '.venv', 'bin', 'python']`.
  - Run `<zip-root>/uv-bin/comfy --workspace /tmp/test-engine/ComfyUI_linux install --fast-deps` on a Linux box (WSL acceptable for path check, NOT for release), inspect tree, set `PYTHON_BIN_PARTS_MAP` to match exact layout.
  - **Verify:** after install, `getPythonBin(ENGINE_ROOT)` resolves to a file that exists and `<that file> --version` prints 3.12.x.

- [ ] **1.4. Update `GET /engine/status` to use platform-correct path**
  - File: [routes/engine.js:24-40](../../routes/engine.js)
  - Already uses `getPythonBin(ENGINE_ROOT)` which is platform-aware. Once 1.3 confirms the Mac/Linux layout, this should Just Work.
  - **Verify:** with engine absent on Mac/Linux: returns `{ exists: false }`. After comfy-cli install: returns `{ exists: true }`.

- [ ] **1.5. Keep llama.cpp pathing future-ready but out of v0.0.1 acceptance**
  - Files: `routes/platformEngine.js`, `routes/llm.js`, `routes/shared.js`, `dev_configs/llm_models.json`.
  - Ensure `getLlamaEngineRoot()`, `getLlamaModelsRoot()`, and `getLlamaBin()` respect the Phase 0.4 portable env vars.
  - Do not auto-download llama-server or GGUF models during ComfyUI engine install for releases that do not expose LLM features.
  - Before the first LLM-enabled release, curate `dev_configs/llm_models.json` down to the intended Qwen + Gemma models and verify the stated VRAM tiers in release notes.
  - **Verify for v0.0.1:** app launches and ComfyUI generation works when `llama_engine/` and `llama_models/` are absent.

---

## Phase 2 — Windows portable zip

First fully shippable deliverable.

- [ ] **2.1. Windows silent launcher (`CubricStudio.vbs`)**
  - Hides the terminal window on launch. Sample:
    ```vbs
    Set sh = CreateObject("WScript.Shell")
    sh.CurrentDirectory = CreateObject("Scripting.FileSystemObject").GetParentFolderName(WScript.ScriptFullName) & "\app"
    sh.Run """..\node\node.exe"" node_modules\electron\cli.js .", 0, False
    ```
  - Path-relative to zip root. Targets `node_modules/electron/cli.js` (NOT `node_modules/.bin/electron` — that bin shim assumes `npm` is on PATH).
  - Launcher must set the Phase 0.4 portable env vars before starting Node/Electron.
  - Keep `start-debug.bat` for dev/debug with visible terminal.
  - **Verify:** double-click `CubricStudio.vbs` from an unzipped folder → Electron window opens, no console flash.

- [ ] **2.2. Build script `scripts/build-portable.js`**
  - Invocation: `node scripts/build-portable.js --platform=win`
  - Steps for Windows:
    1. Download portable Node.js: `node-vXX.X.X-win-x64.zip` from nodejs.org → `build/node/win/`.
    2. Use Electron binary already in `node_modules/electron/dist/` (already Windows on the dev box).
    3. Stage/install `node_modules` with Electron present. `electron` is currently a devDependency, but the portable launcher depends on `node_modules/electron/cli.js`, so do not use an omit-dev install unless Electron is copied separately.
    4. `npm rebuild` for native deps (sharp). Native binary cache: ensure target matches host.
    5. Stage layout:
       ```
       CubricStudio_windows/
         node/                     ← portable Node
         app/                      ← repo source + node_modules
           main.js
           server.js
           routes/
           services/
           js/
           styles/
           views/
           node_modules/           ← rebuilt for win32-x64
         CubricStudio.vbs          ← silent launcher
         start-debug.bat           ← debug launcher (visible terminal)
       ```
    6. Exclusions (match `electron-builder.yml` `files:`): `engine/`, `llama_engine/`, `llama_models/`, `logs/`, `dist/`, `docs/`, `tests/`, `.claude/`, `media/`, `*.log`, `*.original.md`, `nimbalyst-local/`, `.playwright-cli/`, `.engine-config.json`.
    7. Keep ffmpeg-static + ffprobe-static `.exe` files reachable from `services/ffmpegBinary.js` — either leave them inside `node_modules/` (simplest) or copy to `resources/` and set `MPI_RESOURCES_PATH` accordingly in the launcher.
    8. Zip `CubricStudio_windows/` → `dist/CubricStudio_windows.zip`.
  - **Verify:** unzip to a folder OUTSIDE the repo, double-click launcher, app opens, engine install completes, generate one image, video crop works.

- [ ] **2.3. Windows smoke checklist**
  - Launch from unzip ✓
  - Engine install ✓
  - Model path write (extra_model_paths.yaml lands in correct spot) ✓
  - ComfyUI starts ✓
  - One generation ✓
  - Open folder (right-click → open) ✓
  - Video crop ✓
  - Quit + relaunch, project list preserved ✓
  - Move unzipped folder, relaunch — still works (no absolute paths baked in) ✓
  - **Verify:** all green on the same artifact intended for public release.

---

## Phase 3 — Linux portable zip

Equal-priority deliverable. Needs Linux host or CI runner to build native deps + smoke.

- [ ] **3.1. Linux launcher (`start.sh`)**
  - Sample:
    ```bash
    #!/bin/bash
    DIR="$(cd "$(dirname "$0")" && pwd)"
    export CUBRIC_PORTABLE_ROOT="$DIR"
    export CUBRIC_ENGINE_ROOT="$DIR/engine"
    export CUBRIC_LLAMA_ROOT="$DIR/llama_engine"
    export CUBRIC_LLAMA_MODELS_ROOT="$DIR/llama_models"
    export CUBRIC_UV_BIN="$DIR/uv"
    export MPI_RESOURCES_PATH="$DIR/resources"
    cd "$DIR/app"
    "$DIR/node/bin/node" node_modules/electron/cli.js .
    ```
  - Build script must `chmod +x start.sh` before zipping.
  - **Verify:** on Linux host, `./start.sh` from unzipped folder opens the app.

- [ ] **3.2. Build script Linux branch**
  - `node scripts/build-portable.js --platform=linux` (must run ON a Linux host — native deps).
  - Steps:
    1. Download `node-vXX.X.X-linux-x64.tar.gz` from nodejs.org → `build/node/linux/`.
    2. Fetch Linux Electron binary via `@electron/get` (or rely on `electron` install on Linux host).
    3. Download `uv` Linux binary from astral-sh/uv GitHub releases (version pinned in `dev_configs/system_dependencies.json`) → stage at zip root.
    4. Stage/install `node_modules` with Electron present; do not omit devDependencies unless Electron is copied separately.
    5. `npm rebuild` for sharp + others on Linux.
    6. Stage layout:
       ```
       CubricStudio_linux/
         node/                     ← portable Node Linux
         uv                        ← uv binary, chmod +x
         python/                   ← created on first run by uv (UV_PYTHON_INSTALL_DIR)
         uv-tools/                 ← created on first run by uv (UV_TOOL_DIR)
         uv-bin/                   ← created on first run by uv (UV_TOOL_BIN_DIR)
         uv-cache/                 ← created on first run by uv (UV_CACHE_DIR)
         resources/                ← ffmpeg/ffprobe if copied out of node_modules
         app/                      ← repo source + node_modules (linux-x64)
         start.sh                  ← chmod +x
       ```
    7. Strip Windows-only `7zip-bin` `.exe` if present; keep the Linux binary until Phase 0.5 removes runtime dependence for custom-node ZIPs.
    8. ffmpeg/ffprobe: use the Linux binaries from `ffmpeg-static`/`ffprobe-static`.
    9. Tarball → `dist/CubricStudio_linux.tar.gz` (tar preserves +x bit; zip does not on Linux).
  - **Verify:** build on Linux host, copy tarball to clean Linux VM, extract, run `./start.sh`. App opens, engine install runs in background (uv → Python → comfy-cli → ComfyUI), one generation completes.

- [ ] **3.3. Linux smoke checklist**
  - Same as Phase 2.3 but on Linux host. ANY of: real Linux desktop, Linux VM with GPU passthrough, rented GPU Linux box. WSL is acceptable for backend-only checks but NOT for the desktop/Electron launch part of the gate.

---

## Phase 4 — macOS portable zip

Equal-priority deliverable. macOS final validation requires real Mac (no Windows substitute).

- [ ] **4.1. macOS launcher (`start.command`)**
  - `.command` extension = double-clickable in Finder.
  - Sample:
    ```bash
    #!/bin/bash
    DIR="$(cd "$(dirname "$0")" && pwd)"
    export CUBRIC_PORTABLE_ROOT="$DIR"
    export CUBRIC_ENGINE_ROOT="$DIR/engine"
    export CUBRIC_LLAMA_ROOT="$DIR/llama_engine"
    export CUBRIC_LLAMA_MODELS_ROOT="$DIR/llama_models"
    export CUBRIC_UV_BIN="$DIR/uv"
    export MPI_RESOURCES_PATH="$DIR/resources"
    cd "$DIR/app"
    "$DIR/node/bin/node" node_modules/electron/cli.js .
    ```
  - Build script must `chmod +x start.command`.
  - **Gatekeeper note:** unsigned `.command` triggers "cannot be opened because developer cannot be verified." User workaround: right-click → Open (first time only). Document in release notes.
  - **Verify:** on Mac, double-click in Finder → app opens.

- [ ] **4.2. Build script macOS branch**
  - **Must run on macOS** for native deps (sharp arm64 vs x86_64, no Mac binary in `7zip-bin`).
  - Two arch zips: `CubricStudio_macos_arm64.zip` + `CubricStudio_macos_x64.zip`. OR universal binary if Electron+sharp builds allow (not always).
  - Steps:
    1. Download `node-vXX.X.X-darwin-arm64.tar.gz` (or `-x64`) → `build/node/mac-<arch>/`.
    2. Fetch macOS Electron binary via `@electron/get` matching arch.
    3. Download `uv` macOS binary (arch-matched) from astral-sh/uv GitHub releases → stage at zip root, chmod +x.
    4. Stage/install `node_modules` with Electron present; do not omit devDependencies unless Electron is copied separately.
    5. `npm rebuild` on Mac.
    6. **7zip-bin Mac gap:** no Mac binary in the npm package. Since `routes/downloadManager.js` currently imports `7zip-bin` at module load for custom-node ZIP extraction, Mac builds must not delete `7zip-bin` until Phase 0.5 replaces/lazy-loads that path. After Phase 0.5, strip `7zip-bin` from Mac stages.
    7. Stage layout:
       ```
       CubricStudio_macos_<arch>/
         node/                     ← portable Node macOS <arch>
         uv                        ← uv binary, chmod +x
         python/                   ← created on first run by uv (UV_PYTHON_INSTALL_DIR)
         uv-tools/                 ← created on first run by uv (UV_TOOL_DIR)
         uv-bin/                   ← created on first run by uv (UV_TOOL_BIN_DIR)
         uv-cache/                 ← created on first run by uv (UV_CACHE_DIR)
         resources/                ← ffmpeg/ffprobe if copied out of node_modules
         app/                      ← repo source + node_modules (darwin-<arch>)
         start.command             ← chmod +x
       ```
    8. Zip → `dist/CubricStudio_macos_<arch>.zip`.
  - **Verify:** build on Mac, copy zip to clean Mac, double-click `start.command`. App opens, engine install runs in background (uv → Python → comfy-cli → ComfyUI), one generation completes via MPS on Apple Silicon.

- [ ] **4.3. macOS smoke checklist**
  - Same as Phase 2.3 on a real Mac. arm64 + x86_64 ideally both tested. CI option: GitHub Actions `macos-latest` runner.

---

## Phase 5 — Release artifacts + notes

- [ ] **5.1. Tag `v0.0.1`**
- [ ] **5.2. Upload three (or four with arch split) zips to GitHub Releases**
- [ ] **5.2a. Upload matching update bundles once the update system exists**
  - Full portable artifacts remain mandatory for new users.
  - Update bundles are optional until Phase 6 lands.
- [ ] **5.3. Release notes**
  - Per-platform unzip + launch instructions
  - First-run engine install ETA + disk usage
  - Mac Gatekeeper right-click → Open note
  - Mac/Linux: no system Python required; first run uses bundled `uv` to download/manage Python under the unzipped folder.
  - Linux: required GPU driver stack still applies (NVIDIA driver/CUDA visibility for NVIDIA, ROCm only if explicitly supported and tested).
  - Hardware: NVIDIA recommended on Win/Linux, Apple Silicon on Mac
  - LLM note: first releases do not include local LLM model downloads unless explicitly stated; future local LLM releases will use llama.cpp with optional Qwen/Gemma downloads under `llama_models/`.
  - Link to docs site once DNS lands

---

## Phase 6 — Portable update bundles

Portable releases still need an update path. Users should not have to download
the full app every time if they already have a working folder with engines,
models, projects, and settings.

Target UX:
- **Windows:** open `update/update.bat`.
- **macOS:** open `update/update.command`.
- **Linux:** run `./update/update.sh`.

Release artifact model:
- Full portable artifact per platform remains the source of truth:
  - Windows zip.
  - Linux tarball.
  - macOS zip per arch.
- Update artifact per platform contains only the updater scripts, manifest, and
  changed app files needed to patch an existing portable folder.
- GitHub Releases publish both when the update system is ready:
  - `CubricVision_windows.zip`
  - `CubricVision_windows_update.zip`
  - equivalent Linux/macOS names.

Update scope:
- Update app code, bundled resources, launchers, metadata, and connector
  manifests.
- Preserve user data:
  - `engine/`
  - `llama_engine/`
  - `llama_models/`
  - projects under Documents
  - downloaded models and generated media
  - local config files intended to survive updates
- Do not silently delete user-modified files unless they are clearly generated
  cache files.

Implementation direction:
- Add a version manifest to full releases and update bundles.
- The update script verifies it is running from a Cubric portable root.
- The update script checks current app version and target version.
- The update script backs up replaced app files or creates a rollback folder.
- The update script applies changed files atomically enough to avoid leaving the
  app half-updated when extraction/copy fails.
- The update script refreshes connector/app manifests after update so the
  future broker sees new capabilities.
- The app must be closed during update unless a later hub-owned updater can
  coordinate process shutdown safely.

Manifest fields to define:
- `appId`
- `displayName`
- `fromVersion`
- `toVersion`
- `platform`
- `arch`
- `files[]`
- `delete[]`
- `preserve[]`
- `sha256`
- `connectorManifestHash`

Open decisions:
- Whether update bundles are binary deltas or simple changed-file bundles.
  Recommendation for v1: changed-file bundles. They are simpler, inspectable,
  and reliable for portable folders.
- Whether the app checks GitHub for available updates or only links users to
  the release page. Recommendation for v1: notify/link only, manual script
  applies the update.
- Whether the future Cubric Studio hub becomes the cross-app update manager.
  Recommendation: yes, later. The hub can eventually coordinate updates for
  Vision, Prompt, Audio, and Video, but the first portable updater should work
  without the hub.

Verify:
- Update from N-1 to N on a copied portable folder.
- Engine/model folders remain intact.
- Projects still open after update.
- Connector manifest/version changes are visible to the broker or future
  registry after relaunch.
- Failed update leaves either the old app working or a clear rollback path.

---

## Recommended order of work

1. Phase 0 (runtime fixes + portable root/env + ZIP extraction fix) — mostly Windows-locally testable. Do this before any build script work.
2. Phase 1.1 + 1.2 + 1.3 — engine branches. Code-path testable on Windows. Real verification deferred to host.
3. Phase 2 — Windows portable zip + smoke. **Ship Windows v0.0.1.**
4. Phase 3 — Linux portable zip. Needs Linux host. Smoke gate before release.
5. Phase 4 — macOS portable zip. Needs Mac host. Smoke gate before release.
6. Phase 5 — release all three when each clears its smoke gate.
7. Phase 6 — portable update bundles. Can ship after the first full portable
   release, but should exist before frequent public update cadence.

Linux and macOS do NOT block on Windows ship — once their host is available, they ship.

---

## Open-source contribution workflow

Public GitHub repos do not need to give strangers push access. Normal open-source flow:

1. Contributor forks the repo.
2. Contributor pushes commits to their fork.
3. Contributor opens a Pull Request (PR) against `main` or a platform branch.
4. Maintainer reviews the diff, asks for changes if needed, and merges only when comfortable.

Recommended repo setup before publishing:

- Keep direct pushes to `main` limited to maintainers.
- Enable branch protection for `main` once public: require PR review, require status checks, and block force-pushes.
- Add PR templates with platform fields: OS version, CPU arch, GPU, driver version, install artifact name, clean/fresh install or upgrade, logs attached.
- Add issue templates for Windows, Linux, macOS install failures with the same platform fields.
- Add labels: `platform:windows`, `platform:linux`, `platform:macos`, `area:installer`, `area:engine`, `good first issue`, `needs logs`.
- Add `CONTRIBUTING.md` with local setup, no large model/engine files in PRs, how to run smoke tests, and how to attach app logs.
- Accept contributor install fixes through PRs, not direct commits. If a contributor becomes trusted, add them as a collaborator later with limited permissions.

For this distribution project specifically, PRs touching installer/build code should include at least:

- The exact artifact tested (`CubricStudio_linux.tar.gz`, `CubricStudio_macos_arm64.zip`, etc.).
- Whether the test was CI, VM, RunPod, rented Mac, or physical host.
- Output of a small diagnostic script that prints platform, arch, resolved portable root, engine root, Comfy path, Python path, uv path, ffmpeg path, and whether each exists.
- App log tail from first engine install attempt.

---

## Anti-mistake rules for agents

- This is a **portable zip** plan. Do not introduce NSIS, DMG, AppImage, or any installer flow. `electron-builder.yml` is out of scope; either delete it or leave it as a parked future option clearly labelled.
- Do not refactor `routes/comfy.js` / `routes/shared.js` / `routes/downloadManager.js` to "split `getComfyPath`" unless an actual Mac/Linux comfy-cli layout test proves the current single helper breaks. The deleted research (May 1 rewrite) over-scoped this; current code works for the Windows `engine/<COMFY_DIR>/ComfyUI/...` layout, and may also work for comfy-cli's layout if `COMFY_DIR_MAP` is set correctly per platform.
- For Mac/Linux comfy-cli, the default target is `--workspace <ENGINE_ROOT>/<COMFY_DIR>`, not bare `<ENGINE_ROOT>`, because the current app expects `<ENGINE_ROOT>/<COMFY_DIR>/ComfyUI/...`.
- Do not strip `7zip-bin` from Mac until custom-node ZIP extraction no longer imports it at module load.
- Do not rely only on `UV_PYTHON_INSTALL_DIR`; set all zip-local uv env vars (`UV_TOOL_DIR`, `UV_TOOL_BIN_DIR`, `UV_CACHE_DIR`, `UV_MANAGED_PYTHON`, `UV_NO_CONFIG`) for every uv/comfy subprocess.
- Do not mutate `process.platform` inside a long-running process and call Mac/Linux "tested." Use fresh process loads for path tests; require a real host for release confidence.
- Do not mark a platform as supported because the code path compiles. Smoke checklist (2.3 / 3.4 / 4.4) must pass on a real host.
- Do not download Node/Electron binaries from random mirrors. nodejs.org for Node, `@electron/get` for Electron.

---

## Explicit non-goals

- Code signing (Win Authenticode / Apple Developer ID)
- macOS notarization
- SmartScreen reputation seeding
- Auto-updates via `electron-updater`
- Silent background patching in v0.0.1
- LLM model bundling in the first portable releases. Local Qwen/Gemma via llama.cpp is a later release track; DeepInfra remote inference comes after local LLM releases are stable.
- Linux package formats beyond a tarball (no .deb, .rpm, snap, flatpak, AppImage)
- Splitting `getComfyPath` into nine helpers (deferred until a real layout mismatch is observed)
- Universal Mac binary (ship arm64 + x64 separately first; revisit if maintenance pain warrants)
- Full CI release automation (manual builds on dev box + rented Mac/Linux acceptable for v0.0.1)

---

## Acceptance for v0.0.1

All true per platform before that platform's zip is published:

- Zip extracts to a folder outside the repo, on a clean OS install.
- Double-click launcher opens app with no terminal (Win/Mac) or `./start.sh` works (Linux).
- Engine install completes (Win: `.7z` extract; Mac/Linux: comfy-cli) without manual intervention beyond the documented user steps.
- One image generation completes end-to-end.
- Folder open works.
- Video crop works.
- Quit + relaunch preserves projects.
- Moving the unzipped folder doesn't break the app (no absolute paths baked in).
- LLM routes are non-blocking for non-LLM releases: absence of `llama_engine/` and `llama_models/` does not block app launch, ComfyUI install, or image/video generation.
- Update bundles are not required for the first full portable artifact, but the
  release notes must say whether users should download the full artifact or can
  use an update bundle.

Windows ships when Phase 2 acceptance is met. Linux ships when Phase 3 acceptance is met. macOS ships when Phase 4 acceptance is met. They release independently; one platform's delay does not block the others.
