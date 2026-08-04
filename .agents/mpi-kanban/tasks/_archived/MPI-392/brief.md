# MPI-392 Brief — the silent models-root reset

Found 2026-07-29 while investigating why a live models root changed mid-session. Every
link below is code, not inference. **Read this before touching the guard** — its blast
radius is bigger than it looks, because it writes SERVER state from a RENDERER heuristic.

## The chain

1. `js/components/Compounds/LandingPages/MpiSettings/MpiSettings.js:348-354` — on Settings
   panel **mount** (not a click):
   ```js
   let saved = Storage.getComfyRootPath() || '';
   if (saved.toLowerCase().includes('temp') || saved.toLowerCase().includes('tmp')) {
       Storage.removeComfyRootPath();
       saved = '';
       _setComfyPath('');          // <-- reaches through to the SERVER
   }
   ```
2. `_setComfyPath('')` POSTs `/comfy/set-path` with an empty path.
3. `routes/comfy.js:500-506` — a falsy path means "revert to default": it writes
   `extra_model_paths.yaml` pointing at `getDefaultModelsRoot()` (`<engine>/mpi_models`).
4. That YAML is the **single source of truth**. `/comfy/get-path` reads it directly; there
   is no backing preference. Once overwritten, nothing in the app remembers the real root.

**The route logs only on error.** A successful reset writes nothing to `app.log`, which is
why the live incident could not be attributed from the log at all.

## What it did live (2026-07-29)

Root flipped `G:/CubricModels` (144GB) -> `C:/AI/Mpi/Cubric-Vision/engine/mpi_models` with
no log line. The library then read as uninstalled, and the LOCAL engineAsset repair
re-downloaded `sam3-multiplex` (1.75GB) into the new root — a file that already existed at
the real one since the day before. Nothing was deleted; the 144GB was orphaned, not lost.

Trigger that session was almost certainly a poisoned `comfyRootPath`: MPI-387 forced the
engine-install modal via `CUBRIC_ENGINE_ROOT=C:/tmp/fake-engine` (that YAML is still on
disk, stamped 08:52 the same day), and `MpiEngineInstall.js:229` stores whatever sits in
the models field. That step is the ONE inferred link — the guard destroys its own evidence,
so the old localStorage value cannot be recovered.

## Why this ships, not just bites devs

The match is a **substring, anywhere, case-insensitive**. A user with `D:/AI/temp_models`,
`G:/tmp-models`, or a Windows account named something like `Temperance` loses their models
root **every time they open Settings**, silently, and their library reads as uninstalled.
The likely support report is "Cubric forgot my models again", which points nowhere near
Settings.

## Fix direction

- The guard only ever needed to clear **localStorage**. Writing server state from it is the
  overreach — drop the `_setComfyPath('')` call.
- If a temp check is still wanted, test a REAL temp dir (an `os.tmpdir()` prefix match), not
  a substring, and confirm with the user before resetting anything.
- Consider deleting the guard outright: it is dated `f41ffdc5` (2026-04-07) and its original
  reason may no longer exist. Establish that before keeping it.
- Independently: **log a successful `/comfy/set-path`** (old root -> new root). Its absence
  is the only reason this took an investigation instead of thirty seconds.
- Sweep `MpiEngineInstall.js:229` and any other `_setComfyPath('')`-shaped call for the same
  pattern.

## Test to leave behind

Mount Settings with a temp-ish stored path and assert `extra_model_paths.yaml` is
**byte-identical** afterwards. That is the assertion the current code fails.
