# MPI-563 — validation

## The fix

One branch in `js/services/commandExecutor.js`, placed **before** the message-based OOM
classifier: `err?.code === 'engine_dropped'` → warning toast carrying `err.message`
verbatim (already user-facing, and it holds the reconnect instruction the OOM toast
discarded). Shape matches the neighbouring `weights_missing_*` / `input_asset_deleted`
branches — warning toast, `exec.onError?.(err)`, `return`.

The OOM branch itself is unchanged and deliberately still message-based: ComfyUI's own OOM
arrives with no `code`, so narrowing it would send real OOMs to the bug-reporter dialog.
A comment on each branch now records why the order is load-bearing.

## Verified

| Check | Result |
|---|---|
| `node --test "tests/engine-dropped-not-oom.test.cjs"` | 4/4 pass |
| Full suite `node --test "tests/*.test.cjs"` | **590/590 pass, exit 0** |
| `validate_board.py .` | `Board validation passed`, exit 0 |

### Mutation-tested — green tests proved to actually catch the defect

A passing test is worthless until it is shown to fail on the bug. Both regression shapes
were reintroduced against a byte-verified backup (`md5sum` before and after; restored by
copy, **never** `git checkout --`, which has wiped uncommitted work in this repo before):

| Mutation | Result |
|---|---|
| A — `engine_dropped` branch deleted | 2 fail / 2 pass ✔ caught |
| B — branch moved *below* the OOM regex | 1 fail / 3 pass ✔ caught |

Mutation A also exposed a hole in the test itself: `indexOf` returns `-1` when the branch
is absent, and `-1 < oomIdx` is true, so the ordering assertion passed on the exact bug it
existed to catch. A `dropIdx > 0` guard was added and the mutation re-run. That hole was
found by mutation-testing, not by writing the test.

## NOT verified

The fix has **not** been observed live in a real WS drop. Forcing one costs a Pod and the
user closed the investigation. For a branch-ordering change with the source-order assertion
above, test + mutation evidence is the proportionate check — but this is a classification
path, so the first real drop is where the toast text gets its live confirmation.

## Context

Found while diagnosing OOM toasts on MiniMax H3 `ref2v_ms` (2026-08-14). Real cause was a
55.88 GiB-RAM Pod on a ~360-frame run with `minRamGb` at its default 0; an 85.68 GiB host
with `minRamGb: 65` completed the same scene clean. The toast's wording happened to be true
in that instance **by coincidence**, and its "inputs are likely too large" advice pointed
the diagnosis at the resolution setting, which was never the problem.

Deliberately out of scope (user's call): the `minRamGb: 0` default, and recording a
frame-count→RAM floor anywhere in `docs/`.
