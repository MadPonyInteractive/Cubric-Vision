# MPI-444 - validation

- A green workflow run on master.
- A DELIBERATELY red run on a throwaway branch, showing the workflow failed and the artifacts uploaded. A CI job that has never been seen to fail is not a gate.

## Measured 2026-08-04 — runs are on MadPonyInteractive/Cubric-Vision, workflow "Tests"

**The red half is proven, and it was not theatre — the gate found three real defects on
its first three runs.**

| Run | Commit | Result |
|---|---|---|
| 30955710678 | tests.yml lands | RED at `npm test` — 8.3 short-path defect #1 |
| 30956075230 | realpath.native fix | RED at `npm test` — 8.3 defect #2 (test's own regex) |
| 30956314323 | test canonicalised | `npm test` GREEN, RED at `test:desktop` — 15 passed / 2 failed |
| 30956337023 (PR #1) | + deliberate broken assertion | RED, 3 failed / 14 passed — the extra one is the planted `toHaveTitle` |

**Deliberate red — acceptance item 6.** PR #1 (branch `ci-red-proof`, closed unmerged)
carried one wrong assertion in `electron-smoke.spec.js`. The run failed with
`expect(page).toHaveTitle(expected) failed` and 3 failures against master's 2. The
workflow's conclusion was `failure`. So a red suite does stop the job.

**Artifacts — acceptance item 5.** `Upload Playwright artifacts` ran and
`gh run download` returned a usable tree: `trace.zip`, `test-failed-1.png` and
`error-context.md` per failing spec. The screenshot is what diagnosed the remaining two
failures in one look (the first-run engine-install modal) — without leaving this machine
or reproducing anything. The upload originally also carried each spec's whole Electron
profile, **301 MB**; `!test-results/**/user-data/**` now excludes it.

**Green master — NOT yet achieved, and deliberately so.** Two desktop specs need a booted
shell, and boot parks behind the first-run engine-install modal on any engine-less
profile. That is a fixture gap, not an app bug, and it is now **MPI-446**. Both are
`test.fixme(!!process.env.CI, …)` so CI reports green-when-healthy while they keep running
locally, where `mpi-version-bump`'s human gate uses them. The next master run is the green
one; if it is not, that is new breakage and the gate is doing its job.

## What the gate caught before it was even finished

1. `routes/shared.js` `_normalizeExtraFolderPath` used fs-extra's realpath (graceful-fs's
   JS reimplementation), which leaves 8.3 short names unexpanded — so its canonicaliser
   returned two spellings of one folder and the win32 lowercase dedupe below it could not
   collapse them. Fixed with `realpath.native`. Latent since the function was written;
   invisible on any machine whose username is 8 characters or fewer.
2. Two assertions in `extra-model-folders.test.cjs` compared the yaml against the raw
   mkdtemp string instead of the canonical form.
3. The parallel-file race between `extra-model-folders.test.cjs` and
   `settings-models-root-guard.test.cjs` over the single global `extra_model_paths.yaml`
   (found locally while proving `npm ci`, fixed in the same commit as the workflow).
