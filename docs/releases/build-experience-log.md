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

## Template for new entries

```
## Initial Build — <platform> (<date>)
Author: <agent/model>.
- Command(s) run:
- What broke:
- Fix:
- What the next builder must check:
```
