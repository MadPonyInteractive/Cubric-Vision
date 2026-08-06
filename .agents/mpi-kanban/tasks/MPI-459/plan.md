# MPI-459 Plan — defer the curated pip pass to engine start

**Verify mode:** auto

## Root cause

`_ensureCuratedPythonDeps()` (`routes/downloadManager.js`) runs `pip install -r
dev_configs/python_deps.txt --no-deps` from inside `_runCustomNodeInstall`, i.e. during a
model install, with **no regard for whether the engine process is running**. When the pass
must REPLACE a package the live ComfyUI has already imported, Windows refuses to overwrite
the loaded binary — `OSError [WinError 5] Access is denied` on
`python_embeded/Lib/site-packages/cv2/cv2.pyd`, pip exits 1, and the model install reports
`Download Failed`. The marker `<ENGINE_ROOT>/.cubric_python_deps` is stamped only after a
successful pass, so every later install repeats the identical failure while the engine runs.

The install path is the wrong place for the pass. The one place the engine is provably
down is `/comfy/start` (`routes/comfy.js`), after the "already running" early return and
the MPI-434 port probe, immediately before `spawn`. Nothing is later for the deps either:
a custom-node install already REQUIRES a restart before the nodes register
(`comfyNeedsRestart` → the gen gate's stop+start in `js/services/comfyController.js`), so
the deps land on exactly the boot that first loads the nodes needing them.

One design, no twins: the function is shared by win/linux/macOS and has a single call site.
The Pod bakes `python_deps.txt` into the image and runs no pip, so the remote path is
untouched.

## Phases

### Move the pass to shared

Move `PYTHON_DEPS_PATH` + `_ensureCuratedPythonDeps` (with its MPI-413 comment block) from
`routes/downloadManager.js` into `routes/shared.js`, beside `runPipCommand`, exported as
`ensureCuratedPythonDeps`. shared.js is required by both consumers, so no require cycle
(comfy.js does not require downloadManager).

### Drop the pass from the install path

`_runCustomNodeInstall` no longer runs pip. It keeps setting `processState.comfyNeedsRestart
= true`, which is what now carries the deps to their install point. Comment records why.

### Run it at engine start

`/comfy/start` awaits `ensureCuratedPythonDeps()` immediately before `spawn`. On failure:
log the error and **still spawn**. Today a failed pass leaves a working engine; refusing to
boot over an offline pip would be a worse regression than the bug being fixed. The message
goes into the start response.

### Update the guard test and docs

`tests/curated-python-deps.test.cjs` assertion 3 regex-reads `downloadManager.js` for the
`--no-deps` install — retarget it at `shared.js`. Assertion 4 (per-node requirements step
stays gone) keeps pointing at downloadManager. Record the new home + the WinError-5 reason
in `docs/download-manager.md` § curated set.

## Verification

- `npm test` green (the curated-python-deps guard in particular).
- Live: corrupt `<ENGINE_ROOT>/.cubric_python_deps`, `POST /comfy/stop` then `/comfy/start`,
  confirm in `app.log` that the pip pass runs BEFORE the spawn, the marker restamps, and the
  engine reaches ready. That is the WinError-5 case, now with the engine down.

## Completed

All four phases, 2026-08-06. Verified: `npm test` 459/459; live boot on the new server code
with a corrupted marker ran the pass BEFORE the spawn, restamped the marker and reached 1870
classes; the no-op control took 2 ms with no pip. Evidence in `validation.md`.

## Current State

Shipped, card at `doing/validating`. Uncommitted — close-out belongs to `mpi-end-session`.

## Remaining Work

None in code. The remaining confirmation is a real model install (MPI-452 step 4) showing the
`Download Failed` path is gone end-to-end.
