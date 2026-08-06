# MPI-459 Validation

## What changed

| File | Change |
|---|---|
| `routes/shared.js` | `PYTHON_DEPS_PATH` + `ensureCuratedPythonDeps()` moved here beside `runPipCommand` (was `_ensureCuratedPythonDeps` in `downloadManager.js`); `crypto` required; exported. Comment records WHY it may only run with the engine down. |
| `routes/downloadManager.js` | The pip pass is gone from `_runCustomNodeInstall` — comment in its place points at the new home and names `comfyNeedsRestart` as what carries the deps there. Now-orphaned `runPipCommand` import dropped. |
| `routes/comfy.js` | `/comfy/start` awaits `ensureCuratedPythonDeps()` immediately before the `spawn`. A failure logs + still spawns, and returns `depsWarning` on the response. |
| `tests/curated-python-deps.test.cjs` | Assertion 3 retargeted at `shared.js`. New assertion 3b: the pass must NOT appear in `downloadManager.js`, and must be awaited inside `/comfy/start` before the spawn (index ordering, not just presence). |
| `docs/download-manager.md` | New § "It runs at engine START, not during a model install (MPI-459)" — the WinError-5 mechanism, why a fresh engine is immune, why a failure must not abort the boot. |

## Evidence

**Static — `npm test`: 459 tests, 459 pass, 0 fail.** Includes the new ordering assertion.
`npx eslint` clean on all three route files. `require()` smoke of shared/comfy/downloadManager
loads with no cycle (comfy.js does not require downloadManager; both require shared).

**Live, on this machine, 2026-08-06.** App killed and relaunched on the new server code
(routes/ has no hot-reload), marker deliberately corrupted to `deadbeefdeadbeef` to force the
pass, engine started through the real `/comfy/start`:

```
14:35:42.449 [comfy]    Starting ComfyUI background process...
14:35:42.727 [download] installing curated python deps (9985e35fa0c6db61) in one pass
14:35:44.910 [download] curated python deps installed, marker stamped (9985e35fa0c6db61)
14:35:57.9   [comfy]    <ComfyUI node scan> ... Starting server / GUI at 127.0.0.1:48188
```

- The pass ran **before** the process existed — no `WinError 5`, where the same replace
  against a live engine is a hard failure (MPI-452 run 1).
- Corrupt marker → mismatch → pass ran → restamped to the real hash. Self-heal intact.
- Engine reached ready; `/object_info` = **1870 classes**, matching the MPI-452 baseline.

**No-op path (negative control).** Engine stop+start with the marker now matching:

```
14:37:04.263 [comfy]    Starting ComfyUI background process...
14:37:04.265 [download] curated python deps already installed (9985e35fa0c6db61)
```

2 ms, no pip. So a normal boot pays nothing; only the boot after a release moves a pin does.

## Not covered

- The failure branch (`depsWarning`, engine starts anyway) is code-verified only — not
  forced live. It is the same shape the old call site had, minus the install-level failure.
- Linux/macOS: no twin to sweep. One shared function, one call site, and the Pod bakes
  `python_deps.txt` into its image and runs no pip, so the remote path is untouched.

## Open for the user

MPI-452's defect **A** is what this card fixes. Its run-1 note says "Carded as MPI-459, NOT
fixed here" — MPI-452 can resume at step 4 without the hand-stamped marker workaround.
