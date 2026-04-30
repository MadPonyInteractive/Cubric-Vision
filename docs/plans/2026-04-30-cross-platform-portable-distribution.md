# Cross-Platform Portable Distribution

**Goal:** Ship three platform-specific zip files (Windows, macOS, Linux) that users unzip and double-click to launch — no pre-installed software required. Bundled Node.js + Electron binaries. ComfyUI engine bootstraps itself on first run per platform.

**Context:**

### Existing infrastructure
- `electron-builder.yml` already exists targeting Win (NSIS), Mac (DMG), Linux (AppImage) — this plan uses a **portable zip approach instead**; electron-builder targets are out of scope for Tier 3
- `routes/platformEngine.js` already abstracts all platform paths (`COMFY_DIR`, `getPythonBin`, `getLlamaBin`, etc.) — macOS/Linux branches are stubs/placeholders labeled `// placeholder — no portable release yet`
- `resolveDownloadConfig()` currently returns Windows `.7z` URLs only; AMD/Intel GPU detection uses Windows WMI (`wmic`) — entirely Windows-specific
- Engine install in `routes/engine.js` uses `node-7z` + `7zip-bin` for extraction and patches `run_nvidia_gpu.bat` — both Windows-only steps
- `GET /engine/status` checks `fs.pathExists(getPythonBin(ENGINE_ROOT))` — path stub works, just needs correct comfy-cli install path on Mac/Linux
- `start.bat` calls `npm start` → `electron .` — terminal window always visible

### Native/platform-specific dependencies (must be rebuilt per platform in build script)
- `sharp@0.34.5` — C++ image processing, one `.node` file
- `7zip-bin@5.2.0` — pre-compiled 7z binary (Windows `.exe`, Linux binary, **no macOS binary included** — needs fallback or platform package)
- `ffmpeg-static@5.3.0` — pre-compiled per platform (already mapped in `electron-builder.yml`)
- `ffprobe-static@3.1.0` — pre-compiled per platform (already mapped in `electron-builder.yml`)

### ComfyUI official releases — Windows only
- Confirmed: v0.20.1 and v0.19.3 ship only `ComfyUI_windows_portable_<gpu>.7z` — no AppImage, no `.dmg`, no Linux tar
- macOS/Linux engine: `comfy-cli` (`pip install comfy-cli && comfy install`) — 4 commands, fully automatable
- Python ships with macOS 12+; Linux needs `ensurepip` fallback (`python3 -m ensurepip --upgrade`)
- comfy-cli install path (to verify before implementing to-do 2): check `comfy-cli` docs for `--install-path` flag and default locations

### Build process — no CI/CD yet
- No `.github/workflows/` — releases are manual, built locally on Windows
- No `build` or `release` npm scripts — only `start`, `server`, `lint`
- `docs/plans/` exists and is the correct location for this file
- Electron 41.0.3 pinned; `node_modules/electron/dist/` contains the Windows binary already — Mac/Linux binaries must be fetched separately via `electron-download` or `@electron/get`

### macOS 7zip gap
- `7zip-bin` does not ship a macOS binary — on macOS the engine is comfy-cli (not `.7z`), so 7zip is only needed for Windows. However if any other `.7z` extraction is ever needed on Mac, use system `unzip` or `p7zip` via Homebrew. Flag this in to-do 3.

---

## To-Dos

- [ ] **1. Hide terminal on Windows launch**
  Replace `start.bat` with a VBScript wrapper (`CubricStudio.vbs`) that launches Electron silently (no console window). Keep `start.bat` as internal fallback for dev use.
  ```vbs
  CreateObject("WScript.Shell").Run "node\node.exe node_modules\.bin\electron .", 0, False
  ```
  Wait — with bundled Node, path will be relative to zip root. Adjust path once bundling is done. For now, create the `.vbs` to hide the terminal for dev/current `start.bat` usage.
  **Verify:** Double-click `CubricStudio.vbs` — Electron app window opens, no terminal window appears.

- [ ] **2. Extend `platformEngine.js` — macOS/Linux engine bootstrap**
  Currently `resolveDownloadConfig()` returns Windows `.7z` URLs only. Add platform branches:
  - `win32`: existing logic unchanged
  - `darwin` / `linux`: return a sentinel `{ engine: 'comfy-cli' }` — no download URL, signals the bootstrap to use `comfy-cli` instead
  Also extend `COMFY_DIR_MAP`, `PYTHON_BIN_PARTS_MAP` with correct paths for where `comfy-cli` installs ComfyUI (default: `~/.local/share/comfy-cli/comfyui` on Linux, `~/Library/Application Support/comfy-cli/comfyui` on macOS — verify against comfy-cli docs before implementing).
  **Verify:** In a test script, call `resolveDownloadConfig()` with `process.platform` mocked to `'darwin'` and `'linux'` — confirm it returns `{ engine: 'comfy-cli' }` and does not attempt a `.7z` download URL.

- [ ] **3. Add `comfy-cli` engine bootstrap path in `routes/engine.js`**
  In `_runEngineDownload()`, after `resolveDownloadConfig()`, branch on platform:
  - `win32`: existing `.7z` download + extract path unchanged
  - `darwin` / `linux`: spawn `pip3 install comfy-cli` then `comfy install --install-path <ENGINE_ROOT>`, streaming output as SSE `engine:downloading` / `engine:extracting` events so the frontend progress UI stays functional. Add `ensurepip` fallback for Linux (`python3 -m ensurepip --upgrade`).
  The patching step (bat file rewrite) is Windows-only — skip on Mac/Linux; `comfy-cli` handles its own config.
  **Verify:** Mock `process.platform = 'linux'` in a local test, trigger `POST /engine/download` — confirm SSE events fire and no `.7z` path is attempted. (Full functional test requires a Linux machine — code-path test only.)

- [ ] **4. Build script — bundle Node.js portable + produce platform zips**
  Create `scripts/build-portable.js` (Node.js script, run via `node scripts/build-portable.js --platform=win|mac|linux`).

  Per platform, the script:
  1. Downloads the official Node.js portable binary for that platform into `build/node/<platform>/`
     - Win: `node-vXX.X.X-win-x64.zip` from nodejs.org
     - Mac: `node-vXX.X.X-darwin-arm64.tar.gz` + `node-vXX.X.X-darwin-x64.tar.gz`
     - Linux: `node-vXX.X.X-linux-x64.tar.gz`
  2. Fetches platform-specific Electron binary (or uses `electron-download` / the binary already in `node_modules/electron/dist/`)
  3. Rebuilds native modules for target platform using `npm rebuild` or `node-pre-gyp` (sharp, 7zip-bin, ffmpeg-static, ffprobe-static)
  4. Assembles zip structure:
     ```
     CubricStudio_<platform>/
       node/                  ← portable Node.js
       app/                   ← source (node_modules included, engine excluded)
       CubricStudio.vbs       ← Windows only (silent launcher)
       start.bat              ← Windows dev/fallback
       start.sh               ← macOS/Linux
     ```
  5. Zips the folder → `dist/CubricStudio_<platform>.zip`

  **Verify:** Run `node scripts/build-portable.js --platform=win` on Windows — confirm `dist/CubricStudio_windows.zip` is produced, unzip it, double-click `CubricStudio.vbs`, app launches with no terminal.

- [ ] **5. macOS launcher — `start.command`**
  Create `start.command` (double-clickable in macOS Finder):
  ```bash
  #!/bin/bash
  DIR="$(cd "$(dirname "$0")" && pwd)"
  cd "$DIR/app"
  "$DIR/node/bin/node" node_modules/.bin/electron .
  ```
  `chmod +x start.command` must be set — handle this in the build script (step 4).
  Also create `start.sh` for Linux (identical content, different name for clarity).
  **Verify:** On macOS, double-click `start.command` in Finder — app opens as native window, no browser needed. (If no Mac available: verify script syntax is correct and `chmod +x` is set in the zip.)

- [ ] **6. Update `engine/status` check — handle `comfy-cli` install path**
  `GET /engine/status` currently checks `fs.pathExists(getPythonBin(ENGINE_ROOT))`. On macOS/Linux with `comfy-cli`, the Python binary path differs. Update the status check to use the platform-correct path from `platformEngine.js` (already stubbed in `PYTHON_BIN_PARTS_MAP`).
  **Verify:** Look at the code — confirm `GET /engine/status` returns `{ exists: false }` on a clean macOS/Linux path (no engine installed) and `{ exists: true }` after comfy-cli installs to the expected path.

---

## Out of Scope (Future)

- Code signing (macOS Gatekeeper / Windows SmartScreen) — Tier 2+
- CI/CD GitHub Actions for automated builds — after portable zip is validated manually
- Linux GPU detection (AMD `rocm-smi`, Intel `clinfo`) — comfy-cli handles GPU selection interactively for now
- Auto-update mechanism
- `electron-builder` NSIS/DMG/AppImage targets — superseded by portable zip for Tier 3; revisit for Tier 2
