# MPI-387 — validation state

Umbrella card. Per-sub-item, because they ship independently.

| Fix | Commit | Validation state |
|---|---|---|
| A — MAX_PATH archive + install-depth preflight | `494228fe` | **CLOSED END TO END 2026-07-30.** Archive half on the dev PC (6419=6419 files, 84 chars of headroom); install-depth half on the SAC laptop — no MAX_PATH/Long-Path hint from the LTXVideo pip at a real deep path. |
| B — Impact-Pack `git+sam2` drop | `f371a162` | **CLOSED 2026-07-30 on the git-less SAC laptop — and seen FIRING**, not merely not-failing: `requirements filtered for ComfyUI-Impact-Pack on win32: dropped git+.../sam2`, zero `Cannot find command git`. See § git-less clean install. |
| C — failure attribution split | `494228fe` | Unit-tested. **Still NOT exercised** — the laptop install completed with no fatal failure, so nothing real ever needed attributing. A clean run cannot prove this one. |
| D — Windows standard-Electron relayout | `bbfd6295` | **CLOSED 2026-07-30 on the SAC laptop** — launched with Smart App Control ENFORCED (`0x1`) on an unsigned exe still carrying MOTW: no block, no prompt. Launch + transition-applier halves also closed on the dev PC. Only the in-app fetch+spawn half remains, and it is post-publish by construction. See § SAC laptop. |
| E — release note | `bbfd6295` | Written into `docs/releases/UNRELEASED.md` § importantChanges. Ships when the version is bumped. |
| F1 — weight-only node shell reads as installed | `2ee5ee15` | Unit-tested, all 4 call sites fixed. **CLEAN on the laptop install 2026-07-30** — no `Illegal transition ComfyUI-Frame-Interpolation`; the node downloaded and installed normally. Absence is the pass. |
| F2 — no-GPU machines get the CUDA build | `2ee5ee15` | **Logged, not fixed** — user decision: keep the build, kill the silence. **WARN CONFIRMED PRESENT 2026-07-30** on a genuinely GPU-less laptop (`nvidia-smi not found`). Presence is the pass. |
| F3 — cupy build failure reported as success | `2ee5ee15` | **Documented, no code change** — the node lies; our exit-code check is correct. **CONFIRMED live 2026-07-30**: build errors on `ModuleNotFoundError: No module named 'pkg_resources'`, node then prints "Installing cupy...", install completes regardless. |

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

## B / F1 / F2 / F3 / A-install-depth — the git-less clean install, SAC laptop, 2026-07-30

ONE local engine install on the reproducing laptop settled five items. Preconditions for
this run were established first (see § SAC laptop): `where git` finds nothing, and
`nvidia-smi not found` — so both the git-less path and the no-GPU path are genuine here,
not simulated.

Engine: ComfyUI `v0.28.0` portable, into
`C:\Users\hugom\Downloads\CubricVision-windows-x64-v1.3.0\engine\`. All 15 universal
workflow nodes downloaded and their requirements installed.

**B — `git+sam2` drop: CONFIRMED, and seen FIRING for the first time.** Not merely an
absence of failure — the filter logged its own work:

```
[INFO] [download] requirements filtered for ComfyUI-Impact-Pack on win32:
                  dropped git+https://github.com/facebookresearch/sam2
```

Zero occurrences of `Cannot find command git` across the whole install. This is the
result the card was raised for and it had never been observed on real git-less hardware
before.

**F2 — no-GPU fallthrough WARN: CONFIRMED PRESENT** (presence is the pass; the fix was
"keep the build, kill the silence"):

```
[INFO] [gpu-detect] nvidia-smi not found or failed
[WARN] [gpu-detect] No NVIDIA, AMD or Intel Arc GPU detected - falling back to the
       NVIDIA (CUDA) portable build. Generation will run on CPU and the download is
       larger than this machine needs.
```

**F3 — cupy lies, our exit-code check is right: CONFIRMED as documented.** The build
genuinely fails and the node then announces it is installing anyway; the install carried
on and completed:

```
[custom-cmd] Getting requirements to build wheel: finished with status 'error'
             ModuleNotFoundError: No module named 'pkg_resources'
ERROR: Failed to build 'cupy-wheel' when getting requirements to build wheel
Checking cupy... / Uninstall cupy if existed... / Installing cupy...
```

Root of the cupy failure is `pkg_resources` absent from the embedded Python (no
setuptools). Harmless, unchanged, still not ours to fix.

**F1 — no `Illegal transition ComfyUI-Frame-Interpolation: complete -> downloading`.**
The node downloaded and installed with no transition error. Absence is the pass here.

**A install-depth half — CLOSED. No MAX_PATH or Long-Path HINT from the LTXVideo pip**,
which ran from a real deep path
(`...\engine\ComfyUI_windows_portable\ComfyUI\custom_nodes\ComfyUI-LTXVideo\requirements.txt`).
With the archive half already closed on the dev PC, fix A is now settled end to end.

**C — NOT EXERCISED, deliberately not marked passed.** Nothing failed fatally during
this install, so the attribution split never had a real failure to describe. It stays
open; a clean run cannot prove it.

**Incidental, self-heal worked:** `[WARN] [engine] Removing partial engine folder (no
embedded Python)` fired before the download, so the partial-engine guard cleaned up an
earlier stub rather than installing on top of it.

## D — SAC laptop, the machine that reported this card, 2026-07-30

**The launch fix is confirmed on the reproducing hardware.** This is the result the
whole 1.3.0 validation trip existed to get.

Both preconditions were established BEFORE the launch, because "it opened fine" and
"the test could not fail" look identical:

| Precondition | Command | Result |
|---|---|---|
| Smart App Control genuinely ON | `reg query "HKLM\SYSTEM\CurrentControlSet\Control\CI\Policy" /v VerifiedAndReputablePolicyState` | `REG_DWORD 0x1` — **enforced** (0 = off, 2 = evaluation) |
| The exe still carries MOTW | `dir /r CubricVision.exe` | `CubricVision.exe:Zone.Identifier:$DATA`, 99 bytes |
| `git` genuinely absent | `where git` | `INFO: Could not find files for the given pattern(s)` |

The MOTW check was deliberately repeated on the EXTRACTED exe rather than trusted from
the zip (zip: 242-byte Zone.Identifier). Explorer does not always propagate MOTW through
extraction, and had it been stripped, Windows would have stayed silent no matter what we
shipped — a vacuous pass. It propagated: 99 bytes on the binary itself.

Transport was browser-only via Google Drive, and the zip arrived byte-exact at
523,638,376 — identical to the built artifact — so nothing in the transfer altered what
was under test.

**Result: double-click launched straight into the app. No block, no SmartScreen dialog,
no "More info / Run anyway".** The failure mode this card was raised for — double-click
does nothing at all, silently — did not occur on the machine that originally produced it.

That is precisely what fix D predicted: SAC blocks `.vbs` and `.bat` outright with no
user override, which is why every 1.2.0 launch path was dead on this box, and an
executable does not get that treatment.

**Doc nuance worth keeping:** 1.3.0's What's New says Windows "may still warn you the
first time with a blue Windows protected your PC box... click More info, then Run
anyway." On this machine no warning appeared at all. The wording is hedged with "may" so
it is not wrong, and warning a user about a prompt that does not arrive is the safe
direction — but the observed behaviour on enforced SAC is cleaner than the copy implies.

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

### D transition half — a real 1.2.0 install crossed to 1.3.0, 2026-07-30

Subject: `D:\CubricStudio\Vision\Builds\CubricVision-windows-x64-v1.2.0\`, a genuine
old-layout install (`app/`, `start.vbs`, `update.bat`, `resources/cubric/update-manifest.json`
reading `fromVersion null` / `toVersion 1.2.0`). Applied with its OWN shipped
`update-from-zip.bat` — the 1.2.0-era copy, which is what a real user would run — against
`CubricVision-windows-x64-update-v1.3.0.zip`. This is the applier half only; the
fetch+spawn half is post-publish by construction.

Every expected outcome landed:

| Expected | Result |
|---|---|
| files copied | `resources/app/package.json` reads **1.3.0** |
| `start.vbs` gone | absent |
| stale `app/` left behind | present, still reads **1.2.0** — deliberate, not a leak |
| `CubricVision.exe` at root | present, plus `CubricVision.exe.old` from the evict-busy-file move |
| rollback recoverable | `update/rollback/<ISO stamp>/` written per run |

**Why this matters more than the 1.2.0 install count suggests.** 1.3.0 is the first
standard-Electron layout, so EVERY pre-1.3 user crosses this transition exactly once,
whichever version they are on — Windows full-build downloads stand at 22 / 1 / 20 for
v1.0.1 / v1.1.0 / v1.2.0 (upper bound, scrapers included). A broken applier would have
stranded all of them on a build whose updater cannot reach the new layout, with
"download the full build again" as the only recovery — which is exactly the paragraph
1.3.0's What's New already warns about.

**Cosmetic leftover, checked and deliberately not carded:** the install's
`resources/cubric/update-manifest.json` still reads `toVersion 1.2.0` after the update.
Nothing at runtime reads it — grepped `main.js`, `routes/`, `js/`, `scripts/`; the only
consumer is `apply-update.cjs`, and it reads the BUNDLE's copy (`findManifestRoot`, line
85) to drive the update, never the install's. The app's own version comes from
`package.json`, which is correct. Stale metadata, no behaviour.

**Not a defect, recorded so it is not re-investigated:** the console showed
`'ubricVision.exe' is not recognized` after a successful apply. Neither the 1.2.0-era nor
the 1.3.0 `update-from-zip.bat` contains any relaunch line — both end at
`exit /b %ERRORLEVEL%`. That was a command typed at the prompt afterwards with its
leading `C` dropped by the console, not output from the updater.

Not settled here, unchanged: SAC launch behaviour, the missing-`git` install, F1/F2/F3
(all need a real engine install), and the in-app fetch+spawn half of the update.

**Adjacent observation, not a defect, no card yet:** the build ships
`resources/app/node_modules/@eslint-community/…` and `resources/app/docs/archive/`.
devDependencies and the archived docs tree are going out inside the binary. Bloat only.

**Still not reachable at 1.3.0:** a SECOND update, applied from the new layout — the
one that exercises `loadExtractZip`'s `resources/app` branch and `evictBusyFile`. That
needs 1.3.1 or later. **Now owned by MPI-422** together with the new in-app path.

The whole set is settled by one artifact plus one file: `<extract root>/user-data/logs/app.log`.

## D in-app fetch+spawn — RAN 2026-08-01 against the published release, and FAILED

The post-publish item. v1.3.0 went live 2026-08-01T04:56:50Z, which made a real
1.2.0 → 1.3.0 in-app update testable for the first time since MPI-334 shipped in
1.1.0. A fresh `CubricVision-windows-x64-v1.2.0.zip` was extracted to
`D:\cubric-inapp-update-test\` (972 MB on disk, `app/package.json` = 1.2.0, old
layout with `start.vbs` + `update.bat`), launched, and the button was pressed.

**The fetch half PASSED — first live firing ever:**

```
[2026-08-01T05:33:26.804Z] [INFO] [update] portable check — current=1.2.0 latest=1.3.0
[2026-08-01T05:33:27.278Z] [INFO] [update] update available: v1.2.0 -> v1.3.0, prompting
```

The dialog rendered correctly ("You have v1.2.0. Latest is v1.3.0"), and pressing
**UPDATE NOW** did spawn the updater — a PowerShell console appeared and downloaded
the asset to completion: **451,116,582 bytes, byte-exact against the release asset.**

**The apply half FAILED, and the user saw the console close by itself:**

| Expected | Actual |
|---|---|
| `update/downloads/latest-update-path.txt` holds the zip path | **0 bytes** |
| `update-from-zip.bat "<zip>"` applies the bundle | called with an empty argument |
| `resources/app/package.json` reads 1.3.0 | **absent** — `app/` still 1.2.0 |
| `start.vbs` deleted, rollback dir written | both still/never there |
| app reopens | never did |

### Root cause — `stdio: 'ignore'` makes a shell-redirect capture impossible

Not a fluke, not the file size, not the user closing the window (asked and
confirmed: it closed by itself). Three runs settle it:

| Run | Spawn context | Download | Path capture |
|---|---|---|---|
| The real one | `spawn('update.bat', {detached, stdio:'ignore', shell:true})` from `main.js` | 451,116,582 B ✅ | **0 B** ❌ |
| Repro A | `cmd /c` from a normal console, same command, same asset | 451,116,582 B ✅ | 170 B, exit 0 ✅ |
| Repro B | a 12-line Node script spawning the SAME way `main.js` does, 6 KB download | 5,959 B ✅ | **0 B**, `GOT=[]` ❌ |

Repro B is the decisive one: shrinking the download 75,000× changes nothing, so
size and the progress bar are both innocent. `stdio: 'ignore'` hands the child a
NUL stdout; cmd creates the `>` redirect file (hence a 0-byte file with the right
timestamp) but PowerShell's `Write-Output` still lands in NUL. `set /p` then reads
nothing, `update-from-zip.bat` prints its usage and exits 2, and the console closes.

No crash was logged — `Get-WinEvent` over the window is clean, which is consistent:
nothing crashed, the batch simply ran to a no-op. *(Incidental: Windows raised four
`VBScriptDeprecationAlert` events for `start.vbs` at launch — another nail in the
launcher fix D already retired.)*

### This is legacy code and cannot be fixed by shipping anything

`update.bat` lives on the user's disk. Master already replaced the whole path in
fix D — `run-update` now spawns `process.execPath` on `update/win-update.cjs` with
`ELECTRON_RUN_AS_NODE=1`, no cmd, no PowerShell, no `.bat`. Audited today and it is
**immune by construction**: `spawnSync(..., stdio: ['ignore','pipe','inherit'])`
creates its own pipe and reads `result.stdout` in-process, and it hard-fails on
`!bundle || !fs.existsSync(bundle)` rather than continuing with an empty path.

Affected fleet: every pre-1.3.0 Windows install that CAN launch — Windows 10, or
Windows 11 with SAC off. (SAC-blocked Win11 users never reach the button at all.)
Their only route to 1.3.0 is a full download.

### Mitigation shipped the same day (user decision)

- **The Windows update bundle was deleted from the v1.3.0 release.** At 451 MB
  against a 523 MB full build the layout move had made it a delta in name only,
  and its only consumer could not apply it. Without the asset the old updater
  throws `No matching update asset found` and exits immediately instead of
  spending 451 MB to do nothing. macOS (3.3 MB) and Linux (2.8 MB) bundles are
  real deltas on untouched layouts with `curl`-based updaters and were KEPT.
- Release notes corrected on GitHub and in `docs/releases/2026-07-30-v1.3.0.md`;
  the trap and the "never re-introduce a shell-redirect capture into an updater"
  rule are recorded in `docs/releases/portable-distribution-contract.md`
  § In-app update prompt.
- **Windows deltas resume at 1.4.0.**

### Two NEW gaps found while auditing the replacement — spun out as MPI-422

1. **`win-update.cjs` is silent by construction.** Electron spawns it detached
   with `stdio: 'ignore'`, so there is no console at all now, and it writes no log
   file — its `console.error` diagnostics go to NUL. If it fails, the app quits and
   never comes back: no window, no message, no evidence. That is exactly the
   blindness MPI-369 was raised about, reintroduced on a different path.
2. **The prompt's copy is wrong.** It promises "The app will close, update, and
   reopen." `win-update.cjs` ends at `Update applied successfully.` with no
   relaunch, and neither `update-from-zip.bat` has one either.

## Close-out — what this card is NOT waiting for

- **C (failure attribution) stays unproven and that is accepted.** It needs a real
  fatal install failure to describe; three clean installs across two machines never
  produced one. It is unit-tested (`tests/install-path-depth.test.cjs` pins that a
  pip-only batch never claims "extraction failed"). Chasing it further means
  manufacturing a broken environment for a message-only change — not worth a card.
- **The two 1.4.0-gated items moved to MPI-422**: a SECOND update applied from the
  new layout (`loadExtractZip`'s `resources/app` branch + `evictBusyFile`), and the
  in-app fetch+spawn on the NEW `win-update.cjs` path.

Everything this card was raised for — the silent SAC block, MAX_PATH, the missing
`git`, the misattributed error, and F1/F2/F3 — is closed on the machine that
reported it.
