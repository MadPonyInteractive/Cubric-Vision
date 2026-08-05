# MPI-446 Validation

Simulated the runner locally with `CUBRIC_ENGINE_ROOT` pointed at an EMPTY directory:
`/engine/version-check` then returns `needsInstall: true` (`routes/engine.js:707`) and the
model check finds no weights — the same two things a windows-latest runner has.

## The brief diagnosed ONE cause; there were TWO

| Spec | Real cause | Fix |
|---|---|---|
| `app-close-destroys-instance.spec.js` | boot gate parks `initShell` forever (`js/shell.js:265`) | `_isE2E()` joins the `skipLocalEngine` skip branch |
| `mask-persist-roundtrip.spec.js:247` | **no usable model** → history block opens in CROP, and the masked preview only exists in PROMPT mode (`MpiGroupHistoryBlock.js:1311`) | spec seeds a dependency-free image model |

The brief attributed both failures to the boot gate. The negative control below disproves
that for the nav spec: with `_isE2E` stubbed to `false` the nav spec still PASSES (it drives
`navigate()` through imports and never waits on `initShell`), while `app-close` fails. The
nav spec was never a gate victim — it was depending on the dev's own model library, which
also made it a race locally against the boot install-check.

## Evidence

| Run | Config | Result |
|---|---|---|
| 1 | empty engine root, before any fix | app-close FAILED (`.mpi-base-app` 0 elements), nav FAILED ("Timed out waiting for preview mask") — both exactly as on CI |
| 2 | empty engine root, shell.js fix only | app-close PASSED, nav still FAILED |
| 3 | **negative control** — `_isE2E` stubbed to `false`, both fixes otherwise in | app-close FAILED again (same 0-elements error), nav passed |
| 4 | empty engine root, both fixes | 4/4 |
| 5 | normal local profile, `npm run test:desktop` | **17/17** |
| 6 | `CUBRIC_ENGINE_ROOT=<empty>` + `CI=1`, `npm run test:desktop` | **17/17** |
| 7 | `npm test` (node suite) | 430/430 |

A diagnostic spec timeline (deleted after use) settled cause #2: the history block mounted,
the canvas mounted, and the viewer spinner never cleared — because the block had gone to
CROP, so `swapToPreview()` was never called and `.mpi-masked-preview__masked` never existed.
Then, on the empty engine root, every real image model reported `isModelUsable: false` after
the boot sync, and a pushed dependency-free model survived a forced `syncModelInstalled()`
(server returns installed for a model that declares no deps) and put the block in prompt
mode with the mask restored at 250ms.

## Closed on a real runner

CI run **30969140710** (windows-latest, push `8bbcc123`): `npm test` green and
`npm run test:desktop` **17 passed (57.2s)** with both `test.fixme` calls gone. Runs 1-7
above were the local simulation; this is the runner itself.
