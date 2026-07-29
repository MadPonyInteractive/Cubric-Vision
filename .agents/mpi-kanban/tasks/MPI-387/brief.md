# MPI-387 — Clean Windows 11 install is broken end-to-end

Raised 2026-07-29. A second user reported the app not starting on Windows 11; the user then
reproduced a full install on a clean Windows 11 Home laptop (integrated graphics, no NVIDIA)
and captured `app.log`. Everything below is measured or quoted, not inferred.

Two prior reports share this shape: MPI-369 (Windows 10 user, 1.2.0, flash-and-close, no log).

---

## A — MAX_PATH kills the LTXVideo pip step  (SHIPPABLE NOW)

From the captured log:

```
[pip-err] ERROR: Could not install packages due to an OSError: [Errno 2] No such file or directory:
'C:\Users\hugom\Downloads\CubricVision-windows-x64-v1.2.0\CubricVision-windows-x64-v1.2.0\engine\
 ComfyUI_windows_portable\python_embeded\Lib\site-packages\diffusers\pipelines\deprecated\
 stable_diffusion_attend_and_excite\pipeline_stable_diffusion_attend_and_excite.py'
HINT: This error might have occurred since this system does not have Windows Long Path support enabled.
```

Measured: **266 characters against the 260 limit. Over by six.**

`diffusers` comes from `ComfyUI-LTXVideo/requirements.txt` line 1.

### The doubled root folder is ours and it is free to fix

The install root is:

```
C:/Users/hugom/Downloads/CubricVision-windows-x64-v1.2.0/CubricVision-windows-x64-v1.2.0
```

The name appears **twice**. The full archive is `CubricVision-windows-x64-v1.2.0.zip` *and*
contains an inner root folder of the same name, so Explorer's "Extract All" — which defaults to a
destination folder named after the zip — nests it twice. That doubled prefix costs **32
characters**. Removing it puts this path 26 under the limit.

Root len measured: 88 chars doubled, 56 single. Saving: 32.

### Two fixes, both needed

1. Stop the archive double-nesting (build script owns the inner root folder name).
2. A **preflight depth check** at engine-install time. A short archive name cannot save a user who
   extracts somewhere deep, and unlike (1) this one travels in an update bundle.

**(1) does NOT reach existing installs.** It changes how the zip is packaged; an update bundle
applied into an already-extracted deep folder cannot shorten a path that is already on disk.

---

## B — Impact-Pack needs `git`, which users do not have  (SHIPPABLE NOW)

```
[pip] Collecting git+https://github.com/facebookresearch/sam2 (from requirements.txt line 10)
[pip-err] ERROR: Cannot find command 'git' - do you have 'git' installed and in your PATH?
```

Deterministic on every clean machine. **Confirmed twice live**, the second time via the Retry
button, which produced "UW Deps Repair failed".

Likely dead weight: we ship **SAM 1** (`sam-vit-b`, visible in the UW dep list), and MPI-380
established SAM 1 stays as the Impact segment refiner because the `SAM_MODEL` slot cannot take
SAM3. Prove sam2 is unused *before* dropping it, not after.

Existing home for the fix: the `requirementsDrop` mechanism added in `a851eb18` for the macOS
`onnxruntime-gpu` drop (MPI-370). **Trap:** `_createDepJob` is a WHITELIST — unlisted dep fields
vanish silently.

---

## C — The error misattributes the failure, and Retry is a lie  (SHIPPABLE NOW)

```
[ERROR] [engine] Custom node install error: One or more custom node extractions failed - see logs
```

**Zero extractions failed.** All 14 zips extracted, renamed and commit-marker stamped. Three *pip*
steps failed. `routes/engine.js` ~line 474 emits "UW deps installation failed. Press Retry to
re-attempt."

This wrong attribution is why a previous agent told the user to just press Retry.

Worse: A and B are **deterministic**. Retry re-runs them, they fail identically, and the app
proceeds anyway — so the user ends up with LTXVideo missing `diffusers` and Impact-Pack missing
`sam2`, silently, with the install reported as done.

### The race theory was WRONG — do not re-open it

An early hypothesis said node extraction raced ahead of engine extraction into a missing
`custom_nodes/`. The log **disproves** it; sequencing is correct:

```
03:42:29 Skipping custom node install; will be called after engine extraction
03:43:23 Extracting engine archive...
03:46:40 Engine ready, finishing custom node installation...
03:46:40 _runCustomNodeInstall: extracting 14 custom node(s)
```

---

## D — Smart App Control blocks the whole Windows launch chain  (OWN EFFORT)

SAC hard-blocks `.appref-ms .bat .cmd .chm .cpl .js .jse .msc .msp .reg .vbe .vbs .wsf` with **no
per-file allowlist and no override in the dialog**. Windows 11 only, on by default after a clean
install — which is why it never appeared on the dev box or on Windows 10.

We ship three blocked hops before the exe:

```
start.vbs  ->  start-with-terminal.bat  ->  node_modules/.bin/electron.cmd  ->  electron.exe
 BLOCKED         BLOCKED                       BLOCKED                          unsigned
```

The exe is an unrenamed `electron.exe` inside `node_modules` — the worst possible reputation
profile. Scripts get a hard block with no path; an exe at least gets reputation-*evaluated*.

### `.lnk` was tested and REJECTED — do not re-propose it

Empirically verified: created a shortcut, renamed the parent folder, read it back.

```
STORED TARGET: ...\lnktest\A\bin\hostname.exe
TARGET EXISTS AT STORED PATH: False
```

`.lnk` stores an **absolute** path. A portable zip extracts wherever the user drops it. This is
why the original plan's Phase 2.1 `.lnk` choice drifted to `.vbs` — that drift was correct.

### Signing does not fix this, and is not urgent

Researched 2026-07-29:
- **EV certs no longer grant immediate SmartScreen reputation.** That behaviour was removed.
- **OV is now as effective as EV** for reputation — the EV premium buys nothing here.
- **SAC blocks signed binaries too** if reputation is unknown or the chain is not as expected.
- Azure Artifact Signing (ex-Trusted Signing) rotated intermediate CAs ~March 2026 and broke
  reputation for apps whose previous builds were trusted.

Signing **starts the reputation clock, it does not skip it.** Necessary eventually, not a fix.
For comparison, nimbalyst (`github.com/nimbalyst/nimbalyst`) uses electron-builder + NSIS with
`publisherName: "NIMBALYST, INC."` and mac notarization — they paid and they package properly.
Note this repo has an `electron-builder.yml` that is **dead config**: `electron-builder` is not in
devDependencies and nothing runs it.

### The relayout — 7 blockers (full agent report, 2026-07-29)

Target: standard Electron layout so a plain `CubricVision.exe` at the zip root is the double-click
target. `resources/app/` replaces `app/`; Electron resolves it *relative to the exe*, so it is
portable-safe. Linux and macOS are NOT affected (`.sh` / `.command` are not blocked) — this is a
Windows-only branch in the build script.

Good news: `resolveMainPortableRoot()` (main.js:527-537) and `resolveMainResourcesPath()`
(main.js:539-549) both work **unchanged** — `app.isPackaged` flips true and `process.resourcesPath`
becomes real. And `resources/` does **not** collide: MPI uses `resources/cubric|icons|ffmpeg.exe`,
Electron uses `resources/app/` + `default_app.asar`.

BLOCKERS:

| What | Where |
|---|---|
| `.vbs/.bat/.cmd` launchers hardcoded | `build-portable.mjs:30-44` (`PLATFORM_CONFIG.win32`) |
| Skeleton creates/copies to `app/` | `build-portable.mjs:428, 498, 502, 503` |
| **No step extracts Electron's dist to root — must be authored from scratch** | `build-portable.mjs` (absent) |
| Update bundle copies from `app/` | `build-portable.mjs:703` |
| `run-update` IPC spawns `update.bat` | `main.js:1015, 1018` |
| `loadExtractZip` hardcodes `app/node_modules/extract-zip` | `apply-update.cjs:46` (breaks the *2nd* update) |
| Existing `update-from-zip.bat` is itself SAC-blocked | `scripts/portable/windows/update-from-zip.bat:14` |

MUST-UPDATE: `isExecutableEntry` (`:863-864`), `bundledLaunchers`/`alwaysKeep` (`:706-711, 733`),
`restoreLauncherBits` (`apply-update.cjs:120-121`), `writeBuildInfo` dest, `artifact.launchers`
(`:682-685`), and **all three `release-baselines/*.json`** — every app path moves from `app/...` to
`resources/app/...`, so the transition bundle is effectively a full bundle until restamped.

Docs that become false: `docs/releases/portable-distribution-contract.md` lines 176-189 (layout
diagram), 193 (launcher split), 195-197 (updater), 314-317 (owned paths).

**The archive NAME stays frozen** (MPI-369 constraint) — shipped updaters glob it. Only the
extracted root folder name is free (`updateRootName`, `build-portable.mjs:1021`).

---

## E — Existing Windows 11 SAC users are ALREADY UNREACHABLE  (OWN EFFORT)

`update.bat`, `update-from-zip.bat` and `start.vbs` are all blocked, and `main.js:1015` spawns
`update.bat` for the in-app update button. Such a user cannot launch, cannot auto-update, and
cannot hand-apply a zip.

**Any fix reaches them only via a fresh full download.** This must be stated in the release notes.

A transition update also bricks the launch path if mishandled: the manifest deletes `app/` while
the old `start.vbs` still does `pushd %ROOT%\app`. The bundle must ship `CubricVision.exe` at root
and tell the user to use it.

---

## F — Two smaller findings

**F1.** `[WARN] [installStore] Illegal transition ComfyUI-Frame-Interpolation: complete ->
downloading (local dep start) -> rejected`. The in-folder `rife47.pth` weight
(`custom_nodes/comfyui-frame-interpolation/ckpts/rife/`) appears to mark the dep complete before
its node zip starts. Check the legal-transition table in `routes/install/installStore.js` and
whether the rejection dropped real work.

**F2.** `[gpu-detect] nvidia-smi not found or failed` then `Resolved config:
ComfyUI_windows_portable_nvidia.7z`. This laptop has integrated graphics only and **no AMD/Intel
WMI probe appears in the log at all**. It downloaded the CUDA build — several GB of torch that
machine can never use. Check whether the AMD/Intel branches in `resolveDownloadConfig()` ran.

**F3 (logged, low priority).** `ComfyUI-Frame-Interpolation`'s `install.py`: `Failed to build
'cupy-wheel'` -> `ModuleNotFoundError: No module named 'pkg_resources'` (setuptools 83 dropped it),
immediately followed by `Custom install command succeeded`. It reports success on a failed build.

---

## Already fixed this session (uncommitted, `main.js`)

The splash window showed a **white box** for seconds on the weak laptop. Not a missing file —
`splash/splash.html` is in the `v1.2.0` tag, is not in `APP_COPY_EXCLUDES`, and is fully
self-contained. The window was shown before Chromium's first paint and `backgroundColor` does not
cover that gap. Now `show: false` + `ready-to-show`.

Also added a `.catch()` on `splashWindow.loadFile()` — it returns a promise that escaped the
surrounding try/catch (which only sees sync throws) and would now take the whole process down
through the MPI-369 `unhandledRejection` handler.

---

## Release note

A 1.2.1 patch can carry **B and C** via an update bundle. **A only helps a fresh full download**
(see above). **1.2.1 does nothing for SAC-blocked users** — it still ships the `.vbs`/`.bat` chain.

Shipping 1.3.0 from master instead would also carry the MPI-369 boot-crash handler, which is what
makes the *next* "it just closes, no log" report diagnosable. Blocked by the standing CHANGELOG
hold on masking (one entry when MPI-368 shapes land).
