# MPI-685 — a damaged user pip cache breaks the engine install, and Repair is unreachable without a live engine

Reported on GitHub issue #2 (`[bug]: Node 'ClownsharKSampler' not found`), reopened
2026-09-03 after the reporter took v1.4.3 and could not find the Repair engine button
MPI-674 shipped for exactly this case.

## What the user's log says

`app.log`, two consecutive engine starts (22:16:38 and 22:27:22 on 2026-09-01, both on
1.4.3), identical failure five packages into the curated pass:

```
ERROR: Could not install packages due to an OSError: [Errno 13] Permission denied:
'C:\users\andrew\appdata\local\pip\cache\wheels\1f\be\48\...\antlr4_python3_runtime-4.9.3-py3-none-any.whl'
```

That path is pip's own wheel cache in the Windows user profile. Nothing of ours: not the
portable root (`F:\Cubric`), not `python_embeded`, not the models. One file in it is
unreadable, so pip aborts the whole `install -r python_deps.txt` pass. The marker is
stamped only on success, so every start re-runs the pass and dies on the same file —
`ensureCuratedPythonDeps` is already, in effect, running the repair on every boot, and the
repair can never win while pip reads that cache.

Downstream, exactly as MPI-673/674 predicted: `comfyui_controlnet_aux`,
`comfyui-impact-pack`, `ComfyUI-Impact-Subpack`, `RES4LYF`, `comfyui-videohelpersuite` and
`ComfyUI-LTXVideo` all IMPORT FAILED (`No module named 'pywt'`, `triton`, …), and the
gen gate blocked with `Generation blocked — engine packages missing`.

## Why he saw an empty Engine health box

Two separate defects, both visible in his screenshot (warning copy, nothing under it):

1. **v1.4.3 CSS** — `.mpi-settings__section` is `display: flex`, which beats the UA
   `[hidden] { display: none }`, so `section.hidden = true` did nothing and the section
   rendered for everyone, healthy or not. **Already fixed on master** by `0b8fbd33`
   (MPI-629, which needed the same guard for the Update section) — it landed after the
   v1.4.3 tag. Nothing to do here beyond shipping it.
2. **The button really was absent.** `_initEngineHealth` mounts only while
   `state.comfyDepsWarning` is set, and that mirrors `/comfy/status`'s `depsWarning`, which
   is `processState.lastDepsWarning || _importFailureWarning()` — both process memory, and
   `_importFailureWarning()` returns `null` outright when `!processState.activeComfyProcess`.
   Launch the app, open Settings before starting the engine, and the app has no idea it is
   degraded. The failure is on disk; nothing reads disk.

## The fix

1. **`runPipCommand` gets its own cache dir** (`routes/shared.js`) — `PIP_CACHE_DIR` under
   the engine root. Keeps caching (so this is not `--no-cache-dir`, which would make every
   reinstall re-download), and no state in a Windows user profile can break an install
   again. Root cause, not a symptom guard: pip stops reading the poisoned directory.
2. **A failed curated pass leaves a marker** (`routes/shared.js`) next to the success
   marker, carrying the reason; a successful pass removes it. `/comfy/status` falls back to
   it (`routes/comfy.js`) when nothing is in memory, so Settings can offer Repair on a cold
   app with the engine down.

   Note why this is a failure marker and not `curatedDepsPending()`: pending is also true on
   a healthy fresh install that has simply never started the engine, and that would put
   "Part of the engine did not install" in front of every new user.

## Not in scope

- The import-failure branch of `depsWarning` stays process-memory only. It needs a running
  engine to have been observed at all, and a stamped-marker-then-missing-packages engine is
  the rarer case MPI-674 already covers once started.
- `_importFailureWarning()`'s `activeComfyProcess` guard is left alone.
