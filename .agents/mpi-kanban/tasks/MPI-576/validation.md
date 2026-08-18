# MPI-576 — validation

## What had to be proven

1. A silent internal heal job announces NOTHING — not the raw job id, not the
   per-model cascade storm.
2. A genuine shared-dep cascade still toasts (the fix must not kill the real feature).
3. No `engine:*` id literal remains in `notificationService.js` CODE to leak a third
   time. Both ids still appear there in the COMMENT explaining why the allowlist was
   removed (lines 204-205) — the test calls `stripComments()` before asserting, so it
   pins the code and not the prose. (Claim tightened after the close-out claim auditor
   flagged the unqualified version as overbroad.)

## Evidence

**Automated — `tests/install-queue-wedge.test.cjs` § "internal heal jobs are started
silent, and both toast sites honour it".** Replaces the MPI-395 test that pinned the
`'engine:assets'` literal (that literal is deliberately gone). Asserts: every
`engine:*` job id shell.js owns is started with `{ silent: true }`; downloadService
records, resolves and stamps the mark; the cascade toast bails on it; notificationService
gates on `data.silent` and its CODE carries no `'engine:` literal (comments stripped
first).

- MUTATION-CHECKED, not just green: reverting either gate turns it red —
  `AssertionError: the cascade toast must bail on a silent job`.
- Full suite **629/629 pass**. `npx eslint` on the three changed files: clean.
- Pre-commit lint-staged hook: passed.

**Live A/B — isolated local instance, no Pod.** The seam is engine-agnostic, so it does
not need a Pod. A local no-op install cannot be used to trigger it (see the note added to
`docs/download-manager.md` — the local route never calls `_checkModelJobsComplete` when
every dep is already on disk, so no model-level `download:complete` is ever emitted), so
the real handler was driven through a stubbed `window.EventSource`, with
`krea2.installed` forced false first so the cascade condition was genuinely met:

| run | result |
|---|---|
| `start(id, [], { silent: true })` | `[]` — no toast of any kind |
| control, same path, no flag | `engine:probe-loud installed.` **and** `Krea 2 installed.` |

The control IS the reported bug, reproduced locally: a raw job id plus a model announced
as freshly installed with nothing downloaded.

**Live on a real Pod connect — Fabio, 2026-08-18** (screenshot, Model Library, 25GB/80GB
volume, 2 models installed). One INFO toast only: *"Warming the cloud engine — staging 2
models to fast disk…"* — that is the MPI-329 stage-on-connect prefetch, which is correct
and unrelated. **No "installed." toasts, no raw job id.**

## Scope of that last run — stated honestly

`engine:assets` runs on EVERY first connect regardless of drift, so its leak (the MPI-395
symptom) is proven gone against a live Pod. The node-drift heal only fires when a volume
node is off-pin, and that volume was freshly created — so the drift path specifically
rests on the local A/B above, not on this run. Both go through the same `data.silent`
gate, which is why this is sufficient rather than a gap.

## Verdict

Closed on evidence. No open questions.
