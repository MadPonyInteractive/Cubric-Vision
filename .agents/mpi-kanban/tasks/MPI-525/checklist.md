# MPI-525 checklist

- [x] `curatedDepsPending()` in `routes/shared.js` — read-only predicate mirroring both
      skip/install branches of `ensureCuratedPythonDeps`
- [x] `GET /comfy/deps-pending` in `routes/comfy.js`
- [x] `comfyController.js` reads it before POSTing `/comfy/start`, tags `comfy:starting`
      with `phase: 'python-deps'`, re-emits a plain `comfy:starting` once the POST answers
- [x] `js/shell.js` renames the modal copy on that phase
- [x] `MpiStartingComfy.show(phase?)` assigns copy BEFORE its idempotent guard, so a
      second call relabels a modal already on screen
- [x] `tests/curated-deps-pending.test.cjs` — three marker states, hermetic via
      `CUBRIC_ENGINE_ROOT` (3/3), `npm test` 629/629, eslint clean
- [x] Live run on a forced (staled-marker) pass — both transitions observed
- [x] TRUE wipe-and-reinstall: `POST /engine/upgrade {"mode":"full"}`, real 2 m 47.6 s pip
      download, install label held the whole pass and flipped within 22 ms of it ending
- [x] Engine handed back healthy (1885 class_types, 0 IMPORT FAILED); `G:\CubricModels`
      never in scope; bench on 8188 untouched
