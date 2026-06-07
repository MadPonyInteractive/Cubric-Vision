# Portable Build — Experience Log

> **Purpose.** This is the *lessons-learned journal* for building Cubric Vision
> portable artifacts, written by the agents who actually did the builds. It is
> the human/experiential companion to the formal
> [`portable-distribution-contract.md`](portable-distribution-contract.md) (the
> spec) — read the contract for *what* the rules are; read this for *why they
> exist and what bit us*.
>
> **Especially important for macOS**, which the maintainer cannot test on real
> hardware. Every cross-platform gotcha we hit on Linux is a candidate to bite
> macOS silently. Capture everything.
>
> **How to use this file:** each agent that does a build (or a build-tooling
> change) appends a dated section under its platform. Do NOT rewrite earlier
> sections — append. Keep entries concrete: command run, what broke, the fix,
> and what a future builder should check.

---

## Quick reference — the load-bearing facts

If you read nothing else before building:

1. **node_modules cannot be cross-built.** It holds native, per-OS binaries
   (Electron, ffmpeg). A Windows machine cannot produce a launchable Linux/mac
   artifact. Build each OS *on that OS* — GitHub Actions CI matrix does this.
   See [[project_per_os_ci_build]] and the contract § "Build Process".
2. **Users never run `npm install`.** Ship builds bundle node_modules. Requiring
   an install would mean the user needs Node + a C/C++ toolchain (native modules
   compile on install) + a network Electron download. That breaks
   extract-and-run and offline/Discord delivery.
3. **The archive writer is hand-rolled** (no system `tar`/`zip`). It has dropped
   symlinks and exec bits before. Always verify exec bits on a fresh tarball.
4. **`--no-node-modules` is dev/test only.** It strips node_modules for
   cross-OS *transfer during testing* and auto-stages a `setup.sh`/`setup.bat`.
   Never ship it.
5. **Test builds must pass `--no-source-manifest`** or they overwrite the
   committed `resources/cubric/update-manifest.json`.

---

## Initial Build — Linux (2026-06-07)

First end-to-end portable build work beyond Windows. Target was a Linux artifact
the maintainer could validate on an old ThinkPad X121e. Author: Claude (Opus 4.8).

### What the code looked like before

The whole engine-install path (`routes/engine.js` `_runEngineDownload`) was
Windows-shaped: it always downloaded a ComfyUI `.7z` portable and extracted it
with `7zip-bin`/`node-7z`, patched a `run_nvidia_gpu.bat`, etc. None of that
exists for Linux/macOS — **Comfy-Org ships no prebuilt portable for those OSes.**

### Key realization: Linux/mac engine = build it, don't download it

There is no archive to fetch. The engine is bootstrapped with **uv + comfy-cli**:

```
uv venv --python 3.12 <engine>/ComfyUI_linux/venv
uv pip install --python <venv python> comfy-cli
comfy --skip-prompt --workspace <engine>/ComfyUI_linux install <gpu-flag> --fast-deps
```

- `uv` = a fast, single-binary Python env manager (Astral). Picked because it
  needs no system Python and bundles trivially (~one binary).
- `comfy-cli` = the official ComfyUI installer CLI; it creates `ComfyUI/` under
  the workspace and installs deps into the venv.
- **Flag names were verified against comfy-cli source, not the README** — the
  README omits several. `--skip-prompt` and `--workspace` are *global* (before
  `install`); `--nvidia/--amd/--m-series/--cpu` are `install` options.
- GPU flag is auto-picked from `resolveDownloadConfig().gpu.vendor`: `--nvidia`
  if `nvidia-smi` sees a card, `--m-series` on darwin, else `--cpu`.

The layout the bootstrap produces (`<workspace>/venv/bin/python3`,
`<workspace>/ComfyUI/main.py`) is *exactly* where `getPythonBin()` /
`getComfyPath()` already look, so the existing spawn-based launch in
`routes/comfy.js` did not change. That was the design goal — branch the
*provisioning*, leave the *launch* path platform-agnostic.

### Code shape that resulted

`resolveDownloadConfig()` now returns `{ method, comfy, gpu }`:
`method: 'archive'` (Windows, `comfy: {url,filename}`) vs `'uv-bootstrap'`
(Linux/mac, `comfy: null`). `_runEngineDownload` dispatches into
`_provisionWindowsEngine` (the old flow, **7z required only inside this branch —
never at module load**, so non-Windows hosts never need a 7z binary) or
`_provisionUvEngine`.

### The cross-build wall (and how CI solved it)

Building `--platform linux` from the Windows dev box stages the **win32**
node_modules (electron.exe, ffmpeg.exe). `start.sh` then can't launch — wrong-OS
Electron. You cannot cross-compile native modules.

Two honest paths emerged:
- **Dev/test transfer:** build with `--no-node-modules`, hand the folder to the
  Linux box, run `npm install` there (a `setup.sh` was added to automate this).
  Good enough to validate *code paths*, not a shippable artifact.
- **Real artifact:** build on Linux. We did this via **GitHub Actions** — a
  matrix of `windows-latest` / `ubuntu-latest` / `macos-latest` runners, each
  doing `npm ci` + `build-portable.mjs` natively. This is also **how macOS will
  ship without the maintainer owning a Mac.** Workflow:
  `.github/workflows/build-portable.yml`.

CI gotchas hit:
- `workflow_dispatch` only triggers if the workflow YAML is on the **default
  branch** (master). A feature-branch-only workflow can't be dispatched — had to
  merge to master first.
- On the Windows runner, `command -v uv` returns an extension-less path; the real
  binary is `uv.exe`. `stageUvBinary` now falls back to `<path>.exe` on win32.
- CI uploads to **Actions artifacts** (14-day retention), not a Release and not
  local disk. Pull with `gh run download <run-id> -n cubric-vision-<os>-<arch>`.

### uv bundling (zero-setup engine bootstrap)

CI installs uv (`astral-sh/setup-uv`) and passes `--uv-bin`, which stages it at
`<root>/uv/uv`. Launchers export `CUBRIC_UV_BIN` to it, so a downloaded artifact
needs **no uv install on the user box**. `resolveUvBin()` prefers
`CUBRIC_UV_BIN`, then PATH `uv`.

### Line-ending landmine

There was no `.gitattributes`. With `core.autocrlf`, Git could check out
`*.sh`/`*.command` with CRLF, which **breaks the shebang on Linux/mac**
(`bad interpreter: /usr/bin/env sh^M`). Added `.gitattributes` forcing LF on
those. This affects *all* launchers, not just new ones — a latent bug for any
Unix artifact.

### Accelerators deliberately excluded

The maintainer asked about adding SageAttention (used on RunPod). Research showed
it is fragile (needs Triton + a CUDA toolkit/nvcc, Ampere+ only) **and changes
the workflows** (different attention backend / nodes). Forcing it into the base
install would break unsupported GPUs and every existing workflow. Deferred to a
separate optional-accelerator-build track — kanban **MPI-50**. Base bootstrap
ships with no accelerators.

### What a later session found (tar/symlink — see [[project_portable_tar_exec_symlink]])

The first real CI Linux tarball still failed to launch (exit 18). The hand-rolled
tar writer:
1. `listFiles()` used `isFile()`, which is **false for symlinks** → every
   `node_modules/.bin/*` symlink (incl. `.bin/electron`) was silently dropped.
2. Only `.sh`/`.command` got mode 755; the 206 MB `electron/dist/electron`
   binary shipped mode 644 (not executable).

Fix: launchers now call the Electron binary **directly** and `chmod +x` it at
startup (self-heal regardless of archive mode); `isExecutableEntry()` marks the
electron binary, `uv/uv`, and `.bin/*` as 755 in the tar (defense in depth).
**Lesson: never trust `.bin/<symlink>` to survive the archive.**

### Checklist for the next Linux build

- [ ] Built on Linux (CI), not cross-built from Windows.
- [ ] `tar -tvzf …v<v>.tar.gz | grep 'electron/dist/electron$'` shows
      `-rwxr-xr-x`.
- [ ] Tarball contains `app/node_modules/`, `resources/ffmpeg`, `uv/uv`.
- [ ] Extract on a clean box, `./start-with-terminal.sh`, app shell opens.
- [ ] Engine setup runs the `uv venv → comfy-cli → comfy install` chain and
      creates `engine/ComfyUI_linux/venv/bin/python3` + `ComfyUI/main.py`.
- [ ] Generation is *not* expected on weak/no-GPU hardware — validate the path.

---

## macOS — considerations BEFORE the first build (write-up, not yet validated)

> No section below has been run on real Apple hardware. Treat everything here as
> *hypotheses to verify*, and append a dated "Initial Build — macOS" section when
> a real (or CI) build is attempted. Mark clearly what was machine-verified vs
> assumed.

Carry-overs from Linux that almost certainly apply to macOS:

- **Same uv + comfy-cli engine path** (`method: 'uv-bootstrap'`). GPU flag is
  `--m-series` on darwin (Apple Silicon); set in `_provisionUvEngine`. Intel Macs
  would need `--cpu` — current code keys `--m-series` off `process.platform ===
  'darwin'`, so an Intel Mac would wrongly get `--m-series`. **Verify/branch on
  arch (`arm64` vs `x64`) before trusting Intel-Mac installs.**
- **Electron binary path differs:** macOS launches
  `node_modules/electron/dist/Electron.app/Contents/MacOS/Electron`, not
  `dist/electron`. The `start.command` template already handles this + self-chmod.
- **Same archive caveats:** the hand-rolled writer must mark the mac Electron
  binary executable; verify exec bits on the produced `.zip`. (macOS full
  artifact uses `.zip`, not `.tar.gz`.)
- **Must be built on macOS** (CI `macos-latest`) for native node_modules +
  ffmpeg. ffprobe-static ships per-arch (`darwin/x64`, `darwin/arm64`);
  ffmpeg-static is host-arch only.

macOS-specific unknowns to investigate at first build:

- **Gatekeeper / quarantine.** An unsigned, un-notarized app downloaded from the
  internet gets a `com.apple.quarantine` attribute → "app is damaged / cannot be
  opened" or a right-click-Open dance. We have no signing identity. The contract
  § "Platform Disclosure" already says macOS is community-validation-needed;
  release copy must tell mac users how to clear quarantine
  (`xattr -dr com.apple.quarantine <app>`), or that they must right-click → Open.
- **`.command` double-click behavior.** Finder runs `.command` in Terminal; the
  no-terminal launcher story (Win `start.vbs`, Linux detached) is **deferred on
  macOS** — it still shows Terminal. See [[project_portable_launcher_split]].
- **uv binary for macOS.** `astral-sh/setup-uv` on `macos-latest` provides a
  native uv; `--uv-bin "$(command -v uv)"` should resolve a real path (no `.exe`
  issue). Verify it is the arm64 build on Apple Silicon runners.
- **Python 3.12 fetch.** `uv venv --python 3.12` lets uv download Python if the
  host lacks it. Confirm this works headless on a mac runner / user box.

When the first macOS build happens, append: the exact CI run id, whether the
`.zip` launched after clearing quarantine, whether the uv/comfy chain ran, and
the arch flag actually used.

---

## Linux engine install — brought end-to-end on real hardware (2026-06-07)

Author: Claude (Opus 4.8). Validation box: maintainer's old, **GPU-less** Ubuntu
laptop. This section supersedes several details written earlier in this file
before the install was actually run on Linux — see "CORRECTIONS" at the end.

This is the session where the Linux engine install was driven from "fails
immediately" to "ComfyUI installs and launches." It failed in **five distinct
ways in sequence**, each hiding the next. Every one is a macOS risk because the
mac path uses the *same* uv + comfy-cli bootstrap. Read this before the first
mac build.

### Failure 1 — git is a hard, undocumented host dependency

`comfy install` clones ComfyUI + custom nodes through **GitPython**, which
requires a real `git` binary. The GPU-less laptop had no git → cryptic
`ImportError: Bad git executable` dump, exit 1. Windows never hits this (it uses
the prebuilt `.7z` archive, never comfy-cli).

Fix: new `routes/gitProvision.js` — `ensureGit()` uses host git if present, else
installs it. **Elevation is graphical-first (`pkexec`)** so it works even on a
no-terminal launch; falls back to terminal `sudo` only when a TTY exists; on
macOS uses Homebrew (no sudo) or points at `xcode-select --install`. If nothing
works, it throws an actionable message the install screen shows. The resolved
path is passed to comfy-install as `GIT_PYTHON_GIT_EXECUTABLE` (+
`GIT_PYTHON_REFRESH=quiet` to kill GitPython's banner).

- **Decision:** we do NOT bundle a portable git. git is a tree (core binary +
  ~20 subcommands + templates + CA certs); relocating it per-OS is fragile,
  macOS adds codesigning. The host package manager installs a correct one.
- **macOS note:** most Macs already have git via Xcode CLT. If not, brew is the
  clean path; `xcode-select --install` opens a GUI installer we can't await, so
  the code asks the user to complete it and retry. **VERIFY on a real Mac** that
  the brew branch runs and the xcode-select branch's message is acceptable.
- **VALIDATED on Linux:** pkexec password dialog appeared, git installed, install
  continued.

### Failure 2 — comfy-cli owns the workspace; our layout fought it

comfy-cli **clones ComfyUI directly INTO its `--workspace`** and refuses a
pre-existing non-git dir ("exists but is not a valid git repository", exit 255).
Our code pre-created `<engine>/ComfyUI_linux/` AND put the venv inside it AND
expected a `/ComfyUI` subdir. Three-way collision.

Also: when `VIRTUAL_ENV` is set, comfy-cli **reuses that venv** and makes no
`.venv` of its own (confirmed in `comfy_cli/resolve_python.py`).

Fix (Linux/mac only; **Windows untouched**), all branched on a new
`USES_COMFY_CLI = (linux || darwin)` flag in `routes/platformEngine.js`:
- `<engine>/<COMFY_DIR>` (e.g. `ComfyUI_linux`) **IS the ComfyUI repo root** — no
  `/ComfyUI` subdir. `getComfyPath()` drops that segment on these platforms.
- The uv venv moved to a **sibling** dir `<engine>/comfy-venv` (`COMFY_VENV_DIR`),
  so it is not inside the dir comfy-cli must clone into. `getPythonBin()` points
  there. `VIRTUAL_ENV` is set to it so comfy-cli reuses it.
- Do **not** pre-create the workspace. Added a **stale-workspace guard**: if the
  workspace exists but has no `.git` (failed prior run), remove it so retries are
  clean.
- `getComfyRepoRel()` is the single source of truth for the `/ComfyUI`-or-not
  decision and is also sent to the client via `/system/platform-config` so
  `js/data/modelRegistry.js` stops hardcoding the subdir.
- **VALIDATED:** clone succeeded into `engine/ComfyUI_linux`, used `comfy-venv`.

> This **invalidates the earlier claim in this file** that the bootstrap produces
> `<workspace>/venv` + `<workspace>/ComfyUI` and that the launch path was
> unchanged. The real Linux/mac layout is `<engine>/ComfyUI_linux` (repo root) +
> `<engine>/comfy-venv` (venv).

### Failure 3 — uv venvs have no pip; comfy-cli needs it

comfy-cli's `DependencyCompiler` runs `python -m pip install --upgrade pip uv`
against the active venv. **uv venvs are pip-less by default** →
`No module named pip`, exit 1.

Fix: create the venv with **`uv venv --seed`** (installs pip). Note: on Python
3.12+ `--seed` installs pip but not setuptools/wheel — fine, comfy-cli only needs
pip here. **VALIDATED.**

### Failure 4 — logger crashed the app on close (EIO)

On app exit the logger's `console.log` mirror wrote to a **closed stdout/pipe**,
throwing a synchronous `write EIO` that surfaced as an Electron "A JavaScript
error occurred in the main process" dialog. Pre-existing latent bug; any
Linux/mac user closing the app would hit it.

Fix: wrap the console writes in `routes/logger.js` in try/catch; the file log is
the durable sink. **VALIDATED (no dialog).** **macOS will hit the same** —
already fixed by this change.

### Failure 5 — install picked CPU torch, launch forced GPU

GPU detection found no NVIDIA → installer chose `--cpu` (correct). But the launch
command in `routes/comfy.js` **always** started ComfyUI with `--lowvram` (GPU
mode). A CPU install launched in GPU mode fails at runtime. The two were
inconsistent.

Fix: launch now mirrors the install vendor — `resolveDownloadConfig()` (cached),
and if no GPU vendor, start ComfyUI with `--cpu` (dropping `--lowvram`).
`routes/comfy.js` is the **only** runtime launch path (`run_nvidia_gpu.bat` is
patched but never executed — dead vestige). **VALIDATED: install completed,
custom nodes installed, ComfyUI launched.**

- **macOS note:** `--m-series` is the darwin GPU flag. The CPU-vs-GPU launch
  branch keys off `gpu.vendor`. On Apple Silicon, detection must yield a vendor
  (or the darwin special-case) so launch uses Metal, not `--cpu`. **VERIFY the
  vendor/launch mapping on a real Mac.**

### Still-open bugs at end of session (not yet fixed)

- **`routes/engine.js:351` `ReferenceError: engineInfo is not defined`.** The
  post-install version-stamp step references `engineInfo`, which is only defined
  in the Windows branch. The Linux/uv path crashes here *after* the engine is
  fully installed (so Retry "works" — engine already there). Fix: use
  `config.engine.version` or `COMFY_VERSION`. **This will hit macOS too.**
- **No-models project page:** opening a project with zero models installed makes
  the model side-drawer flicker open/close; needs the loop killed + a "go install
  a model" popup. UX, platform-agnostic.

### Performance reality (set expectations in release copy)

On the old GPU-less laptop, `comfy install --cpu --fast-deps` spent **30+ minutes**
on "pip installing build dependencies" (CPU torch wheel is large; build deps
compile slowly on weak hardware). This is **expected, not a hang**. Mac users on
CPU-only or low-end hardware will see similar. The install streams progress; a
silent-looking long pip step is normal.

### macOS pre-flight checklist (updated from this session)

Before/at the first mac build, verify on real Apple hardware:

- [ ] **git:** present (Xcode CLT) → used directly; absent → brew branch installs
      it; no-brew → the `xcode-select --install` message is shown and retry works.
- [ ] **Layout:** comfy-cli clones into `<engine>/ComfyUI_macos` (repo root, no
      `/ComfyUI` subdir); venv is the sibling `<engine>/comfy-venv`;
      `getComfyPath`/`getPythonBin` resolve correctly (they branch on
      `USES_COMFY_CLI`, which already includes darwin).
- [ ] **pip:** `uv venv --seed` gives the venv pip (comfy-cli needs it).
- [ ] **Arch flag:** Apple Silicon → `--m-series`; an **Intel Mac (`x64`) would
      wrongly get `--m-series`** because the flag keys off `process.platform ===
      'darwin'`, not arch. Branch on arch before trusting Intel-Mac installs.
- [ ] **Launch mode:** Apple Silicon launches with Metal (not `--cpu`); confirm
      `gpu.vendor`/darwin mapping drives the right launch flag in comfy.js.
- [ ] **engine.js:351 engineInfo fix** is in (else mac install crashes at the
      version stamp like Linux did).
- [ ] **EIO logger guard** is in (else the close-time crash dialog appears).
- [ ] Electron binary: `dist/Electron.app/Contents/MacOS/Electron`, exec bit set
      in the `.zip`; `start.command` self-chmods.
- [ ] Gatekeeper/quarantine handled in release copy (`xattr -dr
      com.apple.quarantine` or right-click → Open) — unsigned, un-notarized.

### Build/test loop that worked this session

edit → commit → push branch → `gh workflow run build-portable.yml --ref <branch>
-f version=0.0.1` → wait CI (~5–8 min) → `gh run download <run-id> -n
cubric-vision-linux-x64 -D "D:\CubricStudio\Vision\Builds"` → user extracts +
tests on the real laptop. **Linux/mac engine code cannot be tested on the Windows
dev box** — only the real OS exercises native node_modules + the comfy-cli clone.
The same loop produces mac artifacts (`-n cubric-vision-darwin-arm64`), but
nobody can validate them without a Mac → this log is the substitute.

### CORRECTIONS to earlier sections of this file

- The "uv venv → comfy-cli → comfy install" snippet near the top shows the **old**
  layout (`<engine>/ComfyUI_linux/venv` + `ComfyUI/`). Real layout is
  `<engine>/ComfyUI_linux` as the repo root + sibling `<engine>/comfy-venv`.
- "the launch path did not change" is **no longer true** — comfy.js now branches
  CPU vs GPU at launch.
- "`workflow_dispatch` only triggers if the YAML is on the default branch" —
  more precisely: the YAML must be **registered on the default branch**, but you
  can then dispatch it against any branch's code with `--ref <branch>`. We ran
  every build this session against the feature branch that way.
- comfy-cli flag/layout facts here were verified against comfy-cli source
  (`command/install.py`, `resolve_python.py`) during this session.

---

## Linux polish + UX/folder fixes toward merge (2026-06-07)

Author: Claude (Opus 4.8, 1M ctx). Validation box: same GPU-less Ubuntu laptop.
This session picked up right after the "five failures" section above: engine
install was reaching ComfyUI launch, but two known bugs remained and three new
issues surfaced during real-world testing. Every fix here is **frontend or
build/launcher** — none touch the validated engine-install chain — but several
have direct macOS consequences. Branch: `mpi-8/git-auto-provision` (NOT yet
merged at end of session — pending a successful generation on the laptop).

### Fixed 1 — engine.js version-stamp ReferenceError (the carried-over bug)

`routes/engine.js` post-install version stamp used `engineInfo.version`, but
`engineInfo` is only defined in the Windows branch. Linux/uv path crashed there
*after* a successful install. Fixed → `config.engine.version` (in scope on both
paths). **This was a macOS risk too — now fixed for all platforms.** Commit
`499c5c8`.

### Fixed 2 — no-models project popup + flicker loop

Opening a project with zero models auto-opened the model slide-over, whose
`onOpen` re-synced models and re-wrote the (still empty) `s_installedModelIds`,
which a GalleryBlock watcher read as a cue to re-open the drawer → open/close
flicker loop. Replaced the auto-open with a **one-shot popup** ("No models
installed → Go to Projects"), guarded by a `_noModelsPromptShown` flag.
Platform-agnostic UX. Commit `499c5c8`. **Verified on the Windows build** (popup
shows, navigates, no flicker) — this is the one fix this session that *could* be
verified on the dev box because it is pure frontend.

### Fixed 3 — ComfyUI readiness timeout too short for CPU boxes

A real generation attempt on the laptop logged `ComfyUI server failed to become
ready in time`, but the server actually came up ~40s LATER and ran fine. The
frontend poll in `js/services/comfyController.js` gave up at **60 iterations ×
1s = 60s**; CPU torch load + checkpoint on weak hardware took ~100s. Raised both
readiness loops (cold start + post-install auto-restart) to a named
`COMFY_READY_TIMEOUT_S = 240`. Harmless on fast machines (returns as soon as
ready). Commit `03c88dc`. **macOS on CPU / low-end hardware needs this same
headroom** — the timeout is platform-agnostic so it is already covered.

### Fixed 4 — Linux taskbar branding (and the macOS dock prep) ⭐ READ FOR MAC

Symptom: the Linux taskbar showed **"Electron"** + the default Electron icon,
because the portable runs the **unpackaged** electron binary directly (no
electron-builder packaging). Researched the exact mechanisms (cited Electron
docs/issues). Key facts that ALSO govern macOS:

- **`app.setName()` does NOT change the OS taskbar/dock name on Linux OR macOS.**
  It only affects internal Electron references (menu, `app.getName()`,
  notification sender). We set it to `'Cubric Vision'` anyway (commit `6cf6fbe`)
  but it is cosmetic-internal only.
- **Linux taskbar name** = WM_CLASS (X11), derived from `package.json` `name`
  (→ `cubric-vision`); on **Wayland** the app_id comes from `package.json`
  `desktopName` (→ added `"cubric-vision.desktop"`), else it falls back to the
  binary basename ("electron"). The "Electron" the maintainer saw was almost
  certainly the **Wayland app_id fallback** (or a missing `.desktop` match).
- **Linux taskbar/dock ICON** comes from a `.desktop` file whose
  `StartupWMClass=` matches the window class, with `Icon=` resolving through the
  hicolor icon theme. `BrowserWindow { icon }` only sets the in-window
  `_NET_WM_ICON` hint — **GNOME/KDE ignore it for the dock.** No way to set
  WM_CLASS via a flag (Electron rejected `--class`).
- For a **portable / no-install** app the only path is to install a per-user
  `.desktop` + icon at first run. Added `scripts/portable/linux/setup-desktop.sh`
  (writes `~/.local/share/applications/cubric-vision.desktop` +
  `~/.local/share/icons/hicolor/256x256/apps/cubric-vision.png`, refreshes
  caches; idempotent, non-fatal). The launcher calls it on start.
  `build-portable.mjs` stages `cubric-vision.png` + `setup-desktop.sh` at the
  portable root (linux only).

**macOS dock equivalents (PREP IN PLACE, NOT YET VALIDATED):**

- Dock **name** = `CFBundleName`/`CFBundleDisplayName` in the bundled
  `Electron.app/Contents/Info.plist`. `app.setName()` will NOT do it. Added
  `brandMacBundle()` in `build-portable.mjs` that runs `plutil -replace
  CFBundleName/CFBundleDisplayName … 'Cubric Vision'` on the staged Info.plist
  (darwin build only, requires `plutil` — present on the macOS runner).
- Dock **icon** = `CFBundleIconFile` (`electron.icns`). `brandMacBundle()` swaps
  it **only if `build/icon.icns` exists** — and it **does NOT exist yet** (repo
  has `build/icon.png` only). So today the mac dock icon falls back to the
  runtime `app.dock.setIcon(favicon.png)` call added in `main.js` (works while
  running). **ACTION FOR MAC BUILD: generate `build/icon.icns`** (from the logo)
  so the dock icon is correct *before* launch too, not just at runtime.
- **Editing Info.plist breaks any ad-hoc code signature.** We don't sign, so
  fine — but if signing is ever added, re-sign AFTER the plist edit.

> Net for mac: name change should work via plutil; icon will be runtime-only
> until `build/icon.icns` is added. Verify both on a real Mac dock.

### Fixed 5 — custom models folder was NOT additive ⭐ ARCHITECTURE FIX

The big one. Changing the models folder in Settings rewrote
`extra_model_paths.yaml` with a **single** `base_path` = the custom folder,
**dropping the default `mpi_models` root entirely**. Engine-installed deps (vae,
clip, upscalers, controlnet, custom-node models) live under the default root, so
after a path change ComfyUI could no longer find them AND the install-status
check (which only scanned the custom root) reported the model's deps missing →
false "no models installed" popup even though the models page showed the model.

Fix (commit `0a19fb4`):
- `routes/yamlHelper.js` now **always emits the default root as its own ComfyUI
  config block** (`comfyui_default`) in addition to the active/custom block
  (`comfyui`). ComfyUI treats each top-level block as an independent search root,
  so changing the folder ADDS a search location instead of replacing it.
  Additive `loras`/`upscale_models` extras stay on the primary block.
- Install-status checks (`/comfy/models/check` and `resolveComfyPath` in
  `shared.js`) now **fall back to the default root** when a dep is not found
  under the custom root.
- Reverting to default / clearing extra folders **no longer deletes the YAML**
  (which would orphan models under `mpi_models`); it rewrites with the default
  block. Removing an extra folder still drops it from the YAML (GC via rebuild).

**macOS relevance:** this is platform-agnostic server code — the same YAML/path
logic runs on mac. No mac-specific work, but the mac validator should run the
same "install in default → repoint to a pre-existing folder → model still
recognized → generation loads checkpoint from custom + deps from default" test.

> Caveat: the fix only changes **future** YAML writes. An install that already
> has the old single-block YAML must re-trigger a set-path (or fresh install) to
> regenerate it.

### Deferred this session (logged, not fixed)

- **comfy-cli `--cpu --fast-deps` installs CUDA torch (cu130) on no-GPU boxes.**
  Root cause is a comfy-cli bug: `--cpu` passes bare Python `None`, not
  `GPU_OPTION.CPU`; with `--fast-deps` the `DependencyCompiler` compares
  `gpu == GPU_OPTION.CPU` (whose `.value` is `None`, but the enum member ≠ `None`)
  → falls to `else` → no torch index → uv pulls PyPI default (now CUDA on Linux).
  It RUNS on CPU (just wastes ~2GB). Logged as **kanban MPI-52**. **Fix when
  tackled:** pre-install CPU torch (`uv pip install … torch --index-url
  https://download.pytorch.org/whl/cpu`) then `comfy install … --cpu --fast-deps
  --skip-torch-or-directml`. **macOS likely has the analogous problem** —
  `--m-series`/`--cpu` may resolve a non-Metal default torch; verify the wheel
  actually built for the mac arch at first mac build.
- **setup-desktop.sh + cubric-vision.png location.** Maintainer wants both moved
  into the portable `resources/` folder, and BOTH launchers (`start.sh` +
  `start-with-terminal.sh`) to call setup-desktop explicitly (today `start.sh`
  only reaches it by detaching into `start-with-terminal.sh`). See memory
  `project_linux_desktop_setup_todo`. Next session.

### What the next builder must check

- All five fixes above are on `mpi-8/git-auto-provision`, NOT master. Merge only
  after a real generation succeeds on the laptop.
- For mac: generate `build/icon.icns`; verify `plutil` name change + dock icon;
  re-run the additive-folder test; confirm the readiness timeout covers mac CPU
  loads; check the comfy-cli torch wheel arch.

---

## Template for new entries

```
## Initial Build — <platform> (<date>)
Author: <agent/model>.
- Command(s) run:
- What broke:
- Fix:
- What the next builder must check:
```
