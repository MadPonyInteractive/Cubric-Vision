# MPI-462 — validation

## Defect 1 — partial bar exclusion. VALIDATED.

- Probe replayed BOTH exclusion rules over the real registry + live dep status, then the
  result was confirmed against the rendered tiles in the running app.
  - LTX 2.3 high: bar 33% (20.4 / 61.4GB) → no bar (0 / 41GB)
  - Wan 2.2 5B: bar 36% (6.27 / 17.2GB) → no bar (0 / 10.93GB)
  - LTX 2.3 balanced: all-installed, unchanged — no regression on an installed model
  - Denominators fall to each model's own unique weight, proving the new on-disk
    intersection does not over-exclude.
- Model Library rendered four bars where six were; after the orphan reclaim, zero.
- `npm test` 467 pass / 0 fail at the time of that commit.

## Defect 2 — orphan collector. VALIDATED BY TEST + MEASUREMENT; NOT YET SEEN IN THE APP.

Verified:
- `tests/orphan-sweep.test.cjs` — 5 tests over the real `_orphanedDepIds` /
  `_sweepOrphanedDeps` against a throwaway `CUBRIC_MODELS_ROOT`: collects a genuine
  orphan, refuses a dep an installed model wants, never classifies `custom_nodes`
  (the local ComfyUI-MpiNodes is a symlink to its source repo), never classifies
  universal or `targetPath` deps, and refuses anything outside the managed models root.
- Full suite 472 pass / 0 fail (was 467).
- Read-only classification against the user's REAL disk: 65 deps protected, 41
  orphan-eligible registry-wide, **0 actually on disk** — it would delete nothing today,
  which is correct now that this session reclaimed the 8.
- The uninstall route itself was driven live for the reclaim (3 POSTs, 7 files trashed,
  correct `removed N / kept N universal` lines), but that ran on the code as it was
  BEFORE the sweep was added.

## OUTSTANDING — what closes this card

The sweep has never executed inside the running app. `routes/` does not hot-reload, so it
needs a **full server restart**, then one real model uninstall, and the log line should read:

```
uninstall <model>: removed N, kept N universal, N shared, N model files, N pip-installs, swept N orphaned
```

`swept 0` is the expected and correct result on a healthy disk — the sweep proving it
declines is as valid as the sweep collecting something. Do NOT manufacture an orphan to
watch it fire.

Also outstanding, deliberately: the REMOTE twin (Pod volume) is not implemented — MPI-464.
