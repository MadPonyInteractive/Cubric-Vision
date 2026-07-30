# MPI-387 — validation state

Umbrella card. Per-sub-item, because they ship independently.

| Fix | Commit | Validation state |
|---|---|---|
| A — MAX_PATH archive + install-depth preflight | `494228fe` | Unit-tested (`tests/install-path-depth.test.cjs`). **Archive half CLOSED 2026-07-30** on the real 1.3.0 zip via Explorer "Extract All" (6419=6419 files, 84 chars of MAX_PATH headroom) — see § dev PC. The pip/LTXVideo install-depth half still needs the laptop. |
| B — Impact-Pack `git+sam2` drop | `f371a162` | Pinned by a test. Not re-run on a git-less clean box. |
| C — failure attribution split | `494228fe` | Unit-tested. Not seen fire on a real failing install. |
| D — Windows standard-Electron relayout | `bbfd6295` | **Launch half CLOSED 2026-07-30** on the dev PC — `CubricVision.exe` double-clicked from the real extract reached the UI at v1.3.0 through the full first-run chain (see § dev PC). SAC launch and the transition update still need the laptop. See below. |
| E — release note | `bbfd6295` | Written into `docs/releases/UNRELEASED.md` § importantChanges. Ships when the version is bumped. |
| F1 — weight-only node shell reads as installed | `2ee5ee15` | Unit-tested, all 4 call sites fixed. **Not seen fire on a real RIFE install.** See below. |
| F2 — no-GPU machines get the CUDA build | `2ee5ee15` | **Logged, not fixed** — user decision: keep the build, kill the silence. |
| F3 — cupy build failure reported as success | `2ee5ee15` | **Documented, no code change** — the node lies; our exit-code check is correct. |

## D — what was actually verified

Verified on 2026-07-29, on the maintainer Windows workstation, from a real
staged build (`--platform win32 --from-manifest release-baselines/win32-x64.json`):

- `CubricVision.exe` at the zip root; `resources/app/main.js` present; no `app/`
  directory; `resources/default_app.asar` removed; no duplicate
  `resources/app/node_modules/electron/dist`; no `.vbs` and no `start*` file.
- Delta bundle: 6501 changed/added, `delete: ["start-with-terminal.bat","start.vbs"]`
  — exactly the retired launchers, nothing else.
- The staged `CubricVision.exe` launched by its own path with **no environment
  set at all** and resolved every root inside the portable folder:
  `portable`, `engine`, `models`, `resources` — plus `APP_USER_DATA` pointing at
  `<root>/user-data`.
- `tests/portable-win-layout.test.cjs` (6 tests) pass. Full suite 262/271 with
  the failure LIST unchanged vs the 9 known pre-existing failures.
- eslint clean on every changed JS file.

## D — full app boot from the new layout (gap 1) — CLOSED 2026-07-29

Re-run with port 3000 free, staged with
`--platform win32 --arch x64 --clean --no-archive --no-source-manifest
--stage-dir C:/tmp/mpi387-boot`. `CubricVision.exe` launched by its own path
with **no environment set at all**, and user-confirmed on screen:

- Window renders the real UI — no white box, no blank frame. Engine-install
  screen ("Welcome / Let's Set Up ComfyUI") is what comes up.
- The Models-folder field pre-fills `C:\tmp\mpi387-boot\CubricVision-windo…`,
  i.e. `getDefaultModelsRoot` resolved **inside the staged portable root** with
  no launcher env. This is the one blocker the D report itself flagged as
  unproven — a no-launcher boot could have fallen back to `<engine>/mpi_models`
  and `%APPDATA%`. It did not.
- `[main] portable roots:` logged all four roots inside the staged folder;
  `APP_USER_DATA` = `<root>/user-data`.
- Server came up on 127.0.0.1:3000 from `resources/app`; `[update] portable
  check` and `[gpu-detect] Resolved config` both ran.
- Staged `user-data/logs/app.log`: 7 lines, **zero ERROR, zero WARN**.
- The build left the tracked tree clean (`--no-source-manifest` held).

## D — what is still NOT verified

These three all need a real release to exist first; none is cheap.

2. **A clean Windows 11 machine with Smart App Control ON.** The whole point of D
   is that SAC blocks scripts and reputation-evaluates an exe. Nothing here
   proves the exe actually launches under SAC — expect a SmartScreen
   "More info → Run anyway", not a silent block. Only the reproducing laptop can
   settle this.
3. **A transition update applied by a v1.2.0 install.** The applier that runs it
   is the user's OLD one, so none of this session's applier hardening is in play.
   The design says it works (new files copied, `start.vbs` deleted, `app/`
   deliberately left behind), but it has not been run.
4. **A SECOND update, from the new layout.** That is the one that exercises
   `loadExtractZip`'s `resources/app` branch and `evictBusyFile`. A first update
   passes without touching either.

## F1 — what was found and fixed

The reported symptom (`Illegal transition ComfyUI-Frame-Interpolation: complete ->
downloading`) is real but it was the *smallest* consequence. Root cause: a
`targetPath` weight resolves UNDER the node folder and downloads first (RIFE writes
`comfyui-frame-interpolation/ckpts/rife/rife47.pth`), leaving a folder that holds
nothing but subdirs. MPI-243 already established the correct test — a real node ships
top-level FILES — but only applied it to the EXTRACTION site. Four places still
decided INSTALL STATE from bare `pathExists` / `isCompleteOnDisk` on that folder:

| Site | Consequence |
|---|---|
| `routes/downloadManager.js` `startModelDownload` | dep set `complete`, then downloaded -> the logged illegal transition. Cosmetic. |
| `routes/downloadManager.js` `startUniversalWorkflowInstall` | same false `complete` in the UW path. |
| `routes/comfy.js` `_localModelsCheck` | reports the node installed to the UI. |
| `routes/shared.js` `checkUniversalWorkflowDepsStatus` | calls it not-missing. A commit-pinned node is rescued by the drift check that follows (no `.mpi_node_commit` marker -> drifted -> pre-wipe + re-extract); an UNPINNED node would be silently skipped forever. **Measured after the fact: all 14 `custom_nodes` in `dependencies.js` are `git-commit` pinned in `dev_configs/node_lock.json`, so that second path is LATENT, not live today.** It becomes live the moment a registry/tag-sourced node is added. |

Fix: the predicate moved to `routes/downloadCompletion.js` as `isNodeInstalledOnDisk`,
with `isDepInstalledOnDisk(dep, path)` as the type branch every install-state caller
now shares. `downloadManager`'s private `_nodeFolderHasFiles` is now an alias of it, so
extraction and install-state can no longer drift apart.

**Remote twin: deliberately unchanged.** The remote branch
(`downloadManager.js`, `_isImageResident` / `remote node requeue`) trusts the wrapper's
volume scan and never reads local disk, so it cannot hit this false positive.

Verified: `tests/download-completion.test.cjs` gained two cases (weight-only shell ->
not installed; add `__init__.py` -> installed; absent -> false; and the type branch,
with a marked partial weight as the negative control). Full suite `node --test
tests/*.test.cjs` = **275/275, zero failures**. eslint clean on all five changed files.

**Not verified:** no real RIFE install was run. The unit test pins the predicate and the
branch, not the end-to-end absence of the WARN. That needs a clean engine install.

## F2 — logged, not fixed (user decision 2026-07-29)

`resolveDownloadConfig()` has no CPU-only archive to fall back to, so a machine with
no NVIDIA/AMD/Intel-Arc GPU keeps getting `ComfyUI_windows_portable_nvidia.7z` and
runs on CPU. The user's call was: keep that behaviour, but stop it being silent. The
`else` branch in `routes/platformEngine.js` now WARNs that the CUDA build is a
deliberate fallback and that the download is larger than the machine needs, and
records that `detectIntelArcGPU` matches Arc / Data Center only — Iris, UHD and HD
land in the fallthrough BY DESIGN, since no `_intel.7z` path serves them.

The reproducing laptop's log showed `nvidia-smi not found` and then a resolved NVIDIA
filename with nothing in between; that gap is what this closes.

**Shipping a lighter build is explicitly NOT in scope here** — it needs a new hosted
artifact and its own card.

## F3 — documented, no code change (correct outcome)

`ComfyUI-Frame-Interpolation`'s `install.py` fails to build `cupy-wheel`
(`ModuleNotFoundError: No module named 'pkg_resources'` — setuptools 83 dropped it)
and then exits 0, so app.log reads `Failed to build 'cupy-wheel'` followed by
`Custom install command succeeded`. `runCustomCommand` (`routes/shared.js`) checks the
exit code correctly and is RIGHT to resolve — the node lies about its own status.
cupy only accelerates the CUDA path and RIFE falls back to torch without it, so there
is no user-visible defect and nothing to repair.

Recorded as expected noise in the dep entry itself
(`js/data/modelConstants/nodesDeps.js`, `ComfyUI-Frame-Interpolation`), which is where
the next person reading this log line will look, with an explicit warning not to
"fix" it by weakening the exit-code check or pinning cupy.

## Adjacent, NOT fixed (out of scope, flagged only)

`js/data/modelConstants/nodesDeps.js` gives `ComfyUI-Frame-Interpolation` the
user-facing `name: 'ComfyUI Impact Subpack'` — a copy-paste from the entry below it.
Wrong label in the install UI. Left alone deliberately; it is not part of F3.

## Spun out of this card

**MPI-390** — a GPU-less first run cannot reach RunPod at all: the non-dismissible
engine-install modal covers the only UI that enables it. Found while tracing F2.
Distinct defect (F2 = which build is chosen; MPI-390 = the remote escape hatch is
unreachable). Full trace in `tasks/MPI-390/brief.md`.

## Validation is GATED ON THE 1.3.0 RELEASE (user decision, 2026-07-29)

A throwaway master build was made and verified rootless
(`CubricVision.exe` at the zip root, build hash `2ee5ee1581a7`), but the user chose
NOT to test on the reproducing laptop with it — a concurrent session is still landing
work, and the evidence should come from the artifact users actually receive.

So every remaining MPI-387 item is now a **1.3.0 release-validation task**, to be run
on the maintainer's clean Windows 11 laptop with Smart App Control ON:

| Item | What 1.3.0 settles |
|---|---|
| A depth | Explorer "Extract All" into the default Downloads, one folder deep, no MAX_PATH failure from LTXVideo's pip |
| B git | Impact-Pack installs with `where git` returning nothing on that machine |
| C attribution | if anything fails, the message names the node and the real phase |
| D SAC | `CubricVision.exe` launches — expect SmartScreen "More info -> Run anyway", not a silent block |
| D transition | **newly reachable at 1.3.0**: a real v1.2.0 install applying the 1.3.0 bundle. Its applier is the user's OLD one, so this is the first live test of that path |
| F1 | no `Illegal transition ComfyUI-Frame-Interpolation: complete -> downloading` |
| F2 | the new no-GPU fallthrough WARN appears (that is the fix working, not a fault) |
| F3 | `Failed to build 'cupy-wheel'` followed by `Custom install command succeeded` is EXPECTED and harmless |

## A — settled on the dev PC from the real 1.3.0 artifact, 2026-07-30

The maintainer's dev workstation is an early-fail filter, NOT laptop coverage: `where
git` resolves here (`C:\Program Files\Git\cmd\git.exe`) so B is unprovable by
construction, and Smart App Control is not the blocking configuration on this box.
What it DID settle, from `CubricVision-windows-x64-v1.3.0.zip` extracted with
Explorer "Extract All" (the shell extractor, deliberately not 7-Zip — the shell one is
what has the MAX_PATH ceiling):

- **6419 files inside the zip, 6419 on disk.** Zero silent MAX_PATH casualties. This is
  the half of A that a unit test cannot reach, because the ceiling lives in the shell
  extractor, not in our code.
- **ONE folder, `CubricVision.exe` directly inside** — not two nested. All 26 top-level
  entries present including `uv/` and `update/`.
- `resources/app/package.json` reads `1.3.0`; no root `app/`, no `start.vbs` — the D
  relayout as shipped, now confirmed on a real downloaded artifact rather than a
  staged build.
- `resources/cubric/update-manifest.json`: `toVersion 1.3.0`, `kind portable-stage`.
- **Longest path 176 chars — 84 of headroom under MAX_PATH 260.** Extract root was
  `D:\cubric-install-test\` (53 chars); `C:\Users\Fabio\Downloads\` is 56, so the
  default Downloads location would reach 179 and is equally safe. **Extract location is
  therefore irrelevant to A on any machine with a normal-length profile path** — the
  laptop does not need a short path to pass.

### D launch half — `CubricVision.exe` reached the UI, 2026-07-30

Double-clicked from `D:\cubric-install-test\CubricVision-windows-x64-v1.3.0\`. It ran
the whole first-run chain with no manual intervention beyond the dialogs themselves:
splash → "Let's Set Up ComfyUI" models-folder picker → 18+ adult-content gate → the
`RELEASE · V1.3.0` What's New sheet → home screen reading **CUBRIC VISION · V1.3.0**,
25 recent projects, `RTX 4060 Ti · 16GB VRAM · 64GB RAM`. Captured in screenshots.

**No SmartScreen prompt appeared — this box does not have it.** That is not a pass on
the SAC question; it means the question was never asked here. The laptop is still the
only place the SAC result exists, and there a SILENT block (double-click does nothing)
is the failure, not the blue box.

`<extract root>/user-data/logs/app.log` — 8 lines, no errors, three that matter:

```
[gpu-detect] NVIDIA GeForce RTX 4060 Ti, CUDA: 13.2
[update] up to date (current=1.3.0 latest=1.2.0)
[MpiEngineInstall] Local engine install skipped via the RunPod escape hatch (MPI-390)
```

The middle line is the pre-publish constraint observed LIVE rather than reasoned from
`main.js:1023`: a 1.3.0 install queries GitHub, correctly sees 1.2.0 as latest, and
offers nothing. Every in-app update item stays post-publish and this is the proof.

The engine line is MPI-390's escape hatch taken deliberately — no local engine was
provisioned, so nothing below D was exercised on this box.

Log location confirmed for the laptop: `<extract root>\user-data\logs\app.log`.

Not settled here, unchanged: SAC launch behaviour, the missing-`git` install, F1/F2/F3
(all need a real engine install), and the transition update.

**Adjacent observation, not a defect, no card yet:** the build ships
`resources/app/node_modules/@eslint-community/…` and `resources/app/docs/archive/`.
devDependencies and the archived docs tree are going out inside the binary. Bloat only.

**Still not reachable at 1.3.0:** a SECOND update, applied from the new layout — the
one that exercises `loadExtractZip`'s `resources/app` branch and `evictBusyFile`. That
needs 1.3.1 or later. It is the last thing standing between this card and `done`.

The whole set is settled by one artifact plus one file: `<extract root>/user-data/logs/app.log`.
