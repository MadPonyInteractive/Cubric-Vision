# Cross-Platform Portable Distribution

> **Refreshed 2026-05-18.** Original plan (2026-04-30, commit `852af67`) contained concrete research on portable-zip layouts, comfy-cli bootstrap, native-dep rebuild list, launcher specs. May 1 rewrite (commit `7ec10ce`) replaced it with an abstract refactor-first framing and deleted the research. This refresh restores the research, merges in what has shipped since, and re-states the goal: **three portable zips, no installers**.

**Goal:** ship three platform-specific portable zips (Windows, macOS, Linux) that users unzip and run. No NSIS, no DMG, no AppImage, no system-wide installer. Bundled Node + Electron + native deps. ComfyUI engine bootstraps on first run per platform.

**User experience target:**
- **Windows:** unzip → double-click `CubricStudio.vbs` → app opens (no terminal).
- **macOS:** unzip → double-click `start.command` in Finder → app opens.
- **Linux:** unzip → run `./start.sh` (or `./install_engine.sh` first if engine bootstrap is two-step) → app opens.

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

## ComfyUI distribution facts (from research)

- **Windows official portable.** v0.20.1 + v0.19.3 ship `ComfyUI_windows_portable_<gpu>.7z` (nvidia / nvidia_cu126 / amd / intel). Self-contained `python_embeded/` + ComfyUI + `run_nvidia_gpu.bat`. App already uses this via `routes/engine.js _runEngineDownload()`.
- **macOS / Linux: no official portable.** Engine install = `comfy-cli`:
  ```bash
  pip install comfy-cli
  comfy install --install-path <ENGINE_ROOT>
  ```
  Fully automatable, 4 commands. comfy-cli detects GPU and picks the right torch wheel (MPS on Mac, CUDA/ROCm on Linux).
- **Host Python:** ships with macOS 12+. Linux usually has `python3`, may need `python3 -m ensurepip --upgrade` for pip.
- **comfy-cli default install paths** (verify before implementing):
  - Linux: `~/.local/share/comfy-cli/comfyui`
  - macOS: `~/Library/Application Support/comfy-cli/comfyui`

  We override via `--install-path <ENGINE_ROOT>` so the engine lives next to (or alongside) the app's portable zip layout, matching the Windows convention.

---

## Native dependencies — must be rebuilt per target platform

The build script must produce platform-correct binaries for each of these:

| Package | Notes |
|---|---|
| `sharp@0.34.5` | C++ image processing. One `.node` file. `npm rebuild --platform=...` |
| `7zip-bin@5.2.0` | Pre-compiled 7z binary. Windows `.exe` + Linux binary present. **No macOS binary** — only needed for `.7z` extract (Windows engine). On Mac, comfy-cli replaces it, so 7zip-bin is dead weight on Mac. Strip from Mac zip OR keep with no-op guard. |
| `ffmpeg-static@5.3.0` | Pre-compiled per platform. Already mapped in `electron-builder.yml` extraResources — we'll mirror the same mapping in the portable build script. |
| `ffprobe-static@3.1.0` | Same as ffmpeg-static. |
| Electron 41.0.3 | Per-platform binary via `@electron/get` or by pre-installing `node_modules` on the target platform (cleanest path = build on target OS). |

---

## Phase target order

1. **Windows portable zip — first deliverable.** Locally buildable + testable end-to-end.
2. **Linux portable zip + engine bootstrap.** Needs Linux host (VM, WSL, CI runner) to build native deps + smoke.
3. **macOS portable zip + engine bootstrap.** Needs Mac host (or CI) — no Windows substitute for final validation.

Order is mechanical (Windows is the only platform locally testable), not a priority statement. Linux + Mac are equal-rank ship targets, not stretch goals.

---

## Phase 0 — Runtime portability fixes (Windows-locally testable)

Three small fixes blocking ALL three portable zips. Each independently testable on the current Windows dev machine.

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

---

## Phase 1 — Engine bootstrap: platform branches

The current `_runEngineDownload()` in `routes/engine.js` is Windows-only: downloads `.7z`, extracts via `node-7z`, patches `run_nvidia_gpu.bat`. We add Linux + macOS branches that use `comfy-cli`.

- [ ] **1.1. Extend `resolveDownloadConfig()` for Linux/macOS**
  - File: [routes/platformEngine.js:151-218](../../routes/platformEngine.js)
  - Current: returns `{ comfy: { url, filename }, llama: { url, filename } }` (Windows-only `.7z` + Windows-only llama-server zip).
  - New shape per platform:
    - `win32`: existing `.7z` URLs (unchanged).
    - `darwin` / `linux`: return `{ comfy: { mode: 'comfy-cli' }, llama: { url, filename } }` — no URL for comfy (comfy-cli handles download), sentinel `mode` field signals the install branch.
  - llama-server: ggerganov releases cover all three platforms (`bin-win-*` / `bin-macos-*` / `bin-ubuntu-*`). Add Mac + Linux URL construction.
  - GPU detection on Mac/Linux: no `wmic`. Use `nvidia-smi` if present (covers Linux NVIDIA). For Mac, assume MPS (Apple Silicon) — comfy-cli auto-picks.
  - **Verify:** mock `process.platform = 'darwin'` and `'linux'` in a one-off script — confirm `resolveDownloadConfig()` returns the sentinel and a valid llama URL. Do NOT trust this for release — host test required.

- [ ] **1.2. Add `comfy-cli` install branch in `routes/engine.js`**
  - File: [routes/engine.js:56-298](../../routes/engine.js) (`_runEngineDownload`)
  - After `resolveDownloadConfig()`, branch on `downloadConfig.comfy.mode`:
    - `undefined` (Windows): existing `.7z` download → extract → patch path, unchanged.
    - `'comfy-cli'` (Mac/Linux): new path:
      1. Ensure host has `python3` + `pip` (run `python3 -m ensurepip --upgrade` on Linux as fallback).
      2. `spawn('pip3', ['install', '--user', 'comfy-cli'])` → SSE `engine:downloading` stream from stdout.
      3. `spawn('comfy', ['--workspace', ENGINE_ROOT, 'install', '--nvidia'])` (or `--m-series` for Mac arm64) → SSE `engine:extracting` stream from stdout.
      4. Skip `.bat` patching entirely. comfy-cli writes its own launch scripts; we don't use them — we always spawn `python main.py` ourselves (existing code path in `routes/comfy.js`).
  - SSE event contract MUST stay identical so the frontend progress UI keeps working.
  - **Verify:** code-path test on Windows with `process.platform` mocked. Functional test deferred to host.

- [ ] **1.3. Verify `getPythonBin()` for comfy-cli layout**
  - File: [routes/platformEngine.js:54-57](../../routes/platformEngine.js)
  - Current `PYTHON_BIN_PARTS_MAP`:
    - `darwin`: `[..., 'venv', 'bin', 'python3']`
    - `linux`: `[..., 'venv', 'bin', 'python3']`
  - Verify against actual `comfy install --workspace <path>` output. If comfy-cli creates a venv at `<ENGINE_ROOT>/venv/bin/python3`, this is correct. If it nests differently (e.g. `<ENGINE_ROOT>/ComfyUI/venv/...`), update the map.
  - **Verify:** run `comfy install --workspace /tmp/test-engine` on a Linux box (WSL acceptable for path check, NOT for release), check resulting tree, update `PYTHON_BIN_PARTS_MAP` to match.

- [ ] **1.4. Update `GET /engine/status` to use platform-correct path**
  - File: [routes/engine.js:24-40](../../routes/engine.js)
  - Already uses `getPythonBin(ENGINE_ROOT)` which is platform-aware. Once 1.3 confirms the Mac/Linux layout, this should Just Work.
  - **Verify:** with engine absent on Mac/Linux: returns `{ exists: false }`. After comfy-cli install: returns `{ exists: true }`.

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
  - Keep `start-debug.bat` for dev/debug with visible terminal.
  - **Verify:** double-click `CubricStudio.vbs` from an unzipped folder → Electron window opens, no console flash.

- [ ] **2.2. Build script `scripts/build-portable.js`**
  - Invocation: `node scripts/build-portable.js --platform=win`
  - Steps for Windows:
    1. Download portable Node.js: `node-vXX.X.X-win-x64.zip` from nodejs.org → `build/node/win/`.
    2. Use Electron binary already in `node_modules/electron/dist/` (already Windows on the dev box).
    3. `npm rebuild` for native deps (sharp). Native binary cache: ensure target matches host.
    4. Stage layout:
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
    5. Exclusions (match `electron-builder.yml` `files:`): `engine/`, `llama_engine/`, `llama_models/`, `logs/`, `dist/`, `docs/`, `tests/`, `.claude/`, `media/`, `*.log`, `*.original.md`, `nimbalyst-local/`, `.playwright-cli/`, `.engine-config.json`.
    6. Keep ffmpeg-static + ffprobe-static `.exe` files reachable from `services/ffmpegBinary.js` — either leave them inside `node_modules/` (simplest) or copy to `app/resources/` and set `MPI_RESOURCES_PATH` accordingly in the launcher.
    7. Zip `CubricStudio_windows/` → `dist/CubricStudio_windows.zip`.
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
    cd "$DIR/app"
    "$DIR/node/bin/node" node_modules/electron/cli.js .
    ```
  - Build script must `chmod +x start.sh` before zipping.
  - **Verify:** on Linux host, `./start.sh` from unzipped folder opens the app.

- [ ] **3.2. Engine install script (`install_engine.sh`)**
  - Optional split: if comfy-cli install from inside the app is unreliable on first-run (host lacks pip, etc.), ship a separate user-run script:
    ```bash
    #!/bin/bash
    set -e
    command -v python3 >/dev/null || { echo "Install Python 3.10+ first"; exit 1; }
    python3 -m ensurepip --upgrade || true
    python3 -m pip install --user comfy-cli
    "$HOME/.local/bin/comfy" --workspace "$(pwd)/engine" install --nvidia
    ```
  - User runs once before first app launch. App's `_runEngineDownload` then becomes a no-op on Linux if engine present, OR triggers the same script via `spawn`.
  - **Decision needed:** in-app comfy-cli install (Phase 1.2) vs separate `install_engine.sh`. Prefer in-app for parity with Windows UX; keep script as fallback if pip/ensurepip detection fails.
  - **Verify:** on clean Linux host, run install script — `engine/` populated with working ComfyUI venv.

- [ ] **3.3. Build script Linux branch**
  - `node scripts/build-portable.js --platform=linux` (must run ON a Linux host — native deps).
  - Steps:
    1. Download `node-vXX.X.X-linux-x64.tar.gz` from nodejs.org → `build/node/linux/`.
    2. Fetch Linux Electron binary via `@electron/get` (or rely on `electron` install on Linux host).
    3. `npm rebuild` for sharp + others on Linux.
    4. Stage layout:
       ```
       CubricStudio_linux/
         node/                     ← portable Node Linux
         app/                      ← repo source + node_modules (linux-x64)
         start.sh                  ← chmod +x
         install_engine.sh         ← chmod +x (if Phase 3.2 ships the split)
       ```
    5. Strip Windows-only `7zip-bin` `.exe` if present; keep the Linux binary.
    6. ffmpeg/ffprobe: use the Linux binaries from `ffmpeg-static`/`ffprobe-static`.
    7. Tarball or zip → `dist/CubricStudio_linux.tar.gz` (tar preserves +x bit; zip does not on Linux).
  - **Verify:** build on Linux host, copy tarball to clean Linux VM, extract, run `./start.sh` (after engine install).

- [ ] **3.4. Linux smoke checklist**
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
    cd "$DIR/app"
    "$DIR/node/bin/node" node_modules/electron/cli.js .
    ```
  - Build script must `chmod +x start.command`.
  - **Gatekeeper note:** unsigned `.command` triggers "cannot be opened because developer cannot be verified." User workaround: right-click → Open (first time only). Document in release notes.
  - **Verify:** on Mac, double-click in Finder → app opens.

- [ ] **4.2. Engine install (comfy-cli via Phase 1.2 in-app OR separate `install_engine.command`)**
  - Same decision as 3.2. Mac ships Python 3 system-wide (12+), so in-app should be reliable.
  - For arm64 (Apple Silicon): `comfy install --m-series`. For x86_64 Macs: `comfy install --nvidia` (rare; most discrete-GPU Macs are old).
  - **Verify:** clean Mac, run engine install, ComfyUI starts under venv Python.

- [ ] **4.3. Build script macOS branch**
  - **Must run on macOS** for native deps (sharp arm64 vs x86_64, no Mac binary in `7zip-bin`).
  - Two arch zips: `CubricStudio_macos_arm64.zip` + `CubricStudio_macos_x64.zip`. OR universal binary if Electron+sharp builds allow (not always).
  - Steps:
    1. Download `node-vXX.X.X-darwin-arm64.tar.gz` (or `-x64`) → `build/node/mac-<arch>/`.
    2. Fetch macOS Electron binary via `@electron/get` matching arch.
    3. `npm rebuild` on Mac.
    4. **7zip-bin Mac gap:** no Mac binary in the npm package. Since Mac uses comfy-cli (not `.7z`), `7zip-bin` is dead weight. Either:
       - delete `node_modules/7zip-bin/` from Mac stage, OR
       - guard imports with `if (process.platform === 'win32')` so Mac never touches it.
       - If `.7z` extract becomes necessary on Mac in future, fall back to `system unzip` or `Homebrew p7zip`.
    5. Stage layout:
       ```
       CubricStudio_macos_<arch>/
         node/                     ← portable Node macOS <arch>
         app/                      ← repo source + node_modules (darwin-<arch>)
         start.command             ← chmod +x
         install_engine.command    ← chmod +x (if split path chosen)
       ```
    6. Zip → `dist/CubricStudio_macos_<arch>.zip`.
  - **Verify:** build on Mac, copy zip to clean Mac, double-click `start.command`.

- [ ] **4.4. macOS smoke checklist**
  - Same as Phase 2.3 on a real Mac. arm64 + x86_64 ideally both tested. CI option: GitHub Actions `macos-latest` runner.

---

## Phase 5 — Release artifacts + notes

- [ ] **5.1. Tag `v0.0.1`**
- [ ] **5.2. Upload three (or four with arch split) zips to GitHub Releases**
- [ ] **5.3. Release notes**
  - Per-platform unzip + launch instructions
  - First-run engine install ETA + disk usage
  - Mac Gatekeeper right-click → Open note
  - Linux: required system packages (Python 3.10+, pip)
  - Hardware: NVIDIA recommended on Win/Linux, Apple Silicon on Mac
  - Link to docs site once DNS lands

---

## Recommended order of work

1. Phase 0 (all three fixes) — locally testable on Windows. 2-3 hours.
2. Phase 1.1 + 1.2 + 1.3 — engine branches. Code-path testable on Windows. Real verification deferred to host.
3. Phase 2 — Windows portable zip + smoke. **Ship Windows v0.0.1.**
4. Phase 3 — Linux portable zip. Needs Linux host. Smoke gate before release.
5. Phase 4 — macOS portable zip. Needs Mac host. Smoke gate before release.
6. Phase 5 — release all three when each clears its smoke gate.

Linux and macOS do NOT block on Windows ship — once their host is available, they ship.

---

## Anti-mistake rules for agents

- This is a **portable zip** plan. Do not introduce NSIS, DMG, AppImage, or any installer flow. `electron-builder.yml` is out of scope; either delete it or leave it as a parked future option clearly labelled.
- Do not refactor `routes/comfy.js` / `routes/shared.js` / `routes/downloadManager.js` to "split `getComfyPath`" unless an actual Mac/Linux comfy-cli layout test proves the current single helper breaks. The deleted research (May 1 rewrite) over-scoped this; current code works for the Windows `engine/<COMFY_DIR>/ComfyUI/...` layout, and may also work for comfy-cli's layout if `COMFY_DIR_MAP` is set correctly per platform.
- Do not mutate `process.platform` inside a long-running process and call Mac/Linux "tested." Use fresh process loads for path tests; require a real host for release confidence.
- Do not mark a platform as supported because the code path compiles. Smoke checklist (2.3 / 3.4 / 4.4) must pass on a real host.
- Do not download Node/Electron binaries from random mirrors. nodejs.org for Node, `@electron/get` for Electron.

---

## Explicit non-goals

- Code signing (Win Authenticode / Apple Developer ID)
- macOS notarization
- SmartScreen reputation seeding
- Auto-updates (electron-updater is a future-tier option)
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

Windows ships when Phase 2 acceptance is met. Linux ships when Phase 3 acceptance is met. macOS ships when Phase 4 acceptance is met. They release independently; one platform's delay does not block the others.
