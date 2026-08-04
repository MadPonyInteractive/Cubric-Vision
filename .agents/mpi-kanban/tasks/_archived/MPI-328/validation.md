# MPI-328 Validation

**Shipped 2026-07-29.** Remote model-check now fails CLOSED.

## What changed

`routes/remoteModels.js` — the fold-back that merges image-resident deps into the wrapper's
`/wrapper/models/status` answer was extracted into an exported pure function,
`foldBackWrapperStatus(results, { imageResidentByModel, volumeDepCount, volumeNodeDrifted })`,
and its two fail-open defects fixed:

| Was | Now |
|---|---|
| `results[mid] \|\| { installed: true, deps: [] }` — a model the wrapper OMITTED defaulted to installed | A model we asked about that comes back missing (or with fewer dep lines than we asked about) is **dropped from `results`** and logged: `[runpod] models/status short answer for <id>` |
| `entry.installed = deps.every(d => d.installed)` — vacuously `true` on `[]` | `deps.length > 0 && deps.every(...)` |

**Why drop rather than default to `false`:** unknown is neither installed nor not-installed.
Dropping the key means each consumer keeps its last known state, so a wrapper hiccup does not
blink an installed model red either. All five callers already tolerate a missing entry (sweep
below). The card's original prescription was "default false"; dropping is the same fail-closed
property without the false-negative flicker.

`volumeDepCount` (model id → how many deps were actually sent to the wrapper) is the new signal
that distinguishes "the wrapper failed to answer" from "we never asked" — a model whose deps are
ALL image-resident sends an empty list, so its absence from the response is legitimate and the
fold-back still owns it (MPI-276's false-PARTIAL fix, guarded by test 5).

## Consumer sweep — all 5 call sites of `remoteModelsCheck`

| Site | Reads | Impact |
|---|---|---|
| `routes/comfy.js:650` → `syncModelInstalled` → `js/data/modelRegistry.js:180` (`model.installed = results[id].installed`) | **model-level `installed`** | **the cascade path — fixed** |
| `routes/downloadManager.js:349` `_remoteSharedDepIds` | `entry.deps[]` only | unaffected; already fail-safe (empty evidence → `continue`) |
| `routes/downloadManager.js:1037` `_reconcilerCheckInstalled` | `entry.deps[]` | unaffected; absent model = absent from the truth map ("never a false settle") |
| `routes/downloadManager.js:1526` `_reconcileOutstandingRemoteDeps` | `entry.deps[]` via `\|\| []` | unaffected |
| `routes/downloadManager.js:1714` remote download pre-check | `entry.deps[]` via `\|\| []` | unaffected; pre-check miss = treat as nothing installed |

Only one consumer ever read the model-level flag. No local twin exists — the fold-back is
remote-only (the local path is `localModelsCheck`, a plain disk stat with no merge step).

## Evidence

- `tests/remote-status-fail-closed.test.cjs` — 8 assertions against the REAL exported function
  (not a mirror): omitted model, under-reported model, honest complete answer, one-dep-missing,
  all-baked model (MPI-276 guard), vacuous-empty guard, drift tagging (MPI-222 guard), mixed
  volume+baked. **PASS.**
- **Negative control:** the old fold-back logic run verbatim against case 1 returns
  `{"installed":true,"deps":[]}` — i.e. the test fails on the pre-fix code, so it is a real
  regression guard rather than a tautology.
- Full suite `node --test tests/*.test.cjs`: 254/263. The 9 failures are the known pre-existing
  set (`optional-media-placeholder`, `permodel-key-allowlist` ×3, `resolve-model-deps`,
  `remoteProxy` ×4) — unchanged by this work.
- Observability gap the card flagged is closed: the short-answer branch logs what the wrapper
  returned. The original 1.1.1 cascade produced zero app-level log lines.

## Remote leg → MPI-385

Nothing here needs a Pod to be *correct*, and the trigger was never reproduced on 1.2 — it is a
latent fail-open, now closed. The only Pod-observable item is confirming the new warn line fires
(and nothing else regresses) during a real boot race. Added as a one-liner to `MPI-385`'s brief
per the standing rule: a card whose only leftover is remote closes on local evidence.
