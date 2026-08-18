# MPI-576 — every Pod connect announces every model on the volume as a fresh install

## Symptom (Fabio, 2026-08-18, five screenshots)

Connect to a Pod. A stack of toasts fires, one per model already installed on the volume:

```
DONE  engine:node-drift installed.
DONE  FLUX.2 Klein installed.
DONE  NVIDIA PiD Upscaler installed.
DONE  Boogu Image Edit installed.
DONE  MiniMax H3 installed.
DONE  MiniMax H3 Reference installed.
DONE  Krea 2 installed.
```

**Nothing was downloaded.** VRAM 0.0-0.2/24 GB, RAM 0.4-0.7/62 GB, status bar `IDLE · REMOTE`,
project `mpi-546-smoke` untouched at 7 assets. These are pre-existing volume weights being
re-announced.

Fabio had assumed this was agents connecting to a Pod. It is not — it is every connect.

One screenshot also carries `HEADS UP Model "krea2" is not installed — cannot reuse full
prompt.` **while** the "installed." toasts are firing — i.e. a reuse-prompt click landed inside
the same window and read the model as absent. Possibly the same transition window; not proven,
do not assume.

## Root cause — the cascade toast diffs a re-sync instead of asking whether bytes moved

[downloadService.js:566-620](js/services/downloadService.js#L566-L620), the SSE
`download:complete` handler:

```js
const preSync = new Set(MODELS.filter(m => m.installed).map(m => m.id));
reSyncInstalledModels().then(() => {
    for (const m of MODELS) {
        if (m.installed && !preSync.has(m.id) && m.id !== data.modelId) {
            /* ...MpiToast `${m.name} installed.` */
        }
    }
});
```

The intent (a real one) is the **shared-dep cascade**: installing model A can complete model B's
dep set, and B deserves a toast. The heuristic is "not installed before the re-sync, installed
after → it was just installed."

That inference is false on a connect edge. Install-state is engine-scoped
([modelRegistry.js:163-164](js/data/modelRegistry.js#L163-L164) routes to
`/comfy/models/check` vs `/check-local` off `effectiveEngine()`), so when the app switches to the
Pod the whole remote set legitimately flips `absent → present` as it is re-derived against the
volume. Every model on that volume then satisfies `m.installed && !preSync.has(m.id)` and gets
announced. The flip means "the answer came from a different engine", not "bytes landed".

**What triggers the handler on connect:** the first-connect node-drift heal.
[shell.js:1574](js/shell.js#L1574) → `_healRemoteNodeDrift()` →
`downloadService.start(NODE_DRIFT_JOB_ID, deps)` ([shell.js:1453-1475](js/shell.js#L1453-L1475)),
which completes and broadcasts `download:complete`. MPI-230 explicitly wanted that heal
**silent** ("no prompt, no toast"). The connect-edge `syncModelInstalled()` runs just before it
([shell.js:1559](js/shell.js#L1559)), so the re-sync inside the handler is the one that publishes
the remote set — with `preSync` captured from whatever the registry still held.

## Second, smaller bug in the same report — a raw job id leaks

`engine:node-drift installed.` comes from
[notificationService.js:212-214](js/shell/notificationService.js#L212-L214), whose allowlist is:

```js
if (!data.modelId || data.modelId === '__universal_workflow__' || data.modelId === 'engine:assets') return;
```

`engine:assets` was added for exactly this symptom (MPI-395 — "a pure no-op once the volume
already holds the weights… announced `engine:assets installed.` on every single connect"). The
node-drift job id ([shell.js:1451](js/shell.js#L1451) `NODE_DRIFT_JOB_ID = 'engine:node-drift'`)
is the same shape and was never added. `tests/engine-assets-silent-install.test.cjs` pins the
`engine:assets` literal to shell.js; there is no twin for node-drift.

## Root-cause rule — do not grow the allowlist a third time

Two internal job ids have now leaked as user-facing "installed." toasts, and the model-level
storm is a heuristic standing in for a fact the system already has. The structural fix is to
make a completion say **whether anything was actually installed**, and let both toast sites read
that instead of inferring it:

- A no-op completion (dep already present / volume pre-check short-circuit / heal that re-cloned
  nothing) must be distinguishable from a real one — the download manager knows which; the
  client is guessing.
- The cascade toast should fire off *that*, not off a registry diff. A registry diff cannot tell
  a download from an engine switch, and never will.
- Silent internal jobs should be silent by CONSTRUCTION (a flag on the job), not by a literal
  allowlist that the next `engine:*` id will also miss.

The tempting patches, both wrong: adding `'engine:node-drift'` to the allowlist (leaves the
model storm and guarantees a third leak), or suppressing the cascade toast while
remote-connected (kills a genuine cascade on a Pod install).

## Blast radius

`download:complete` has many consumers — [downloadService.js:566](js/services/downloadService.js#L566)
(cascade toast + `reSyncInstalledModels`), [notificationService.js:198](js/shell/notificationService.js#L198)
(toast / OS notification), [MpiModelManager.js:1407](js/components/Compounds/LandingPages/MpiModelManager/MpiModelManager.js#L1407),
[MpiFlowLibrary.js:356](js/components/Compounds/LandingPages/MpiFlowLibrary/MpiFlowLibrary.js#L356),
[MpiEngineInstall.js:717](js/components/Compounds/MpiEngineInstall/MpiEngineInstall.js#L717),
[commandExecutor.js:1149](js/services/commandExecutor.js#L1149), [shell.js:1153](js/shell.js#L1153),
plus `downloadService`'s own `_awaitDownloadDone`. Adding a field is safe; changing WHEN the event
fires is not. Server emitters: `routes/downloadManager.js` lines 770, 2051, 2179, 2470, 2557,
2570, 2753 — the per-dep (`{depId, modelId:null}`) and model-level (`{modelId}`) broadcasts.

## Cost of leaving it

Cosmetic but load-bearing: the storm is indistinguishable from a real install, so it trains the
user to ignore install toasts — and an OS notification fires per model when the window is
unfocused ([notificationService.js:222-229](js/shell/notificationService.js#L222-L229)).


---

## Root cause, CORRECTED (2026-08-18, after reading the code)

The diagnosis above is right about the SITE and wrong about the MECHANISM, and the
difference matters because it invalidates the fix it proposes.

**It is not an engine-switch artifact.** The brief argues the whole remote set flips
`absent -> present` because install-state is re-derived against a different engine, with
`preSync` captured from a stale local-scoped registry. It cannot be: `reSyncInstalledModels`
IS `syncModelInstalled` ([modelRegistry.js:267](js/data/modelRegistry.js#L267)), and the
connect edge already awaits it at [shell.js:1559](js/shell.js#L1559) BEFORE the heal runs.
So `preSync` is already the remote-derived set.

**It is the drift heal itself.** A drifted volume node is reported
`installed: false` for every dep that names it
([remoteModels.js:321](routes/remoteModels.js#L321) — `d.installed = false; d.drifted = true`),
so EVERY model whose dep universe contains that node reads absent on the connect-edge sync.
`_healRemoteNodeDrift` then re-clones the one KB-scale node, and the post-heal re-sync flips
the whole sharing set back to installed at once. Six models share it -> six toasts. The flip
is REAL; it is just not a download, and MPI-230 had already required this heal to be silent.

**Therefore the brief's proposed server field would NOT have fixed it.** "Did bytes move?"
answers TRUE here — the heal re-clones with `force: true` specifically so the wrapper cannot
short-circuit on folder-exists. A no-op/bytes-moved flag would have left the storm intact.

## What shipped

The brief's THIRD bullet, which does hold: silent BY CONSTRUCTION.

- `downloadService.start(id, deps, { silent: true })` — the caller declares it. Both internal
  heals now do ([shell.js](js/shell.js) `_healRemoteNodeDrift`, `_installRemoteEngineAssets`).
- The id lands in a module-level `_silentJobs` set in
  [downloadService.js](js/services/downloadService.js), NOT on the job object: the
  `download:jobs` snapshot handler replaces `state.downloadJobs` wholesale with SERVER-built
  jobs and would strip a client-side field mid-heal.
- The model-level `download:complete` handler resolves + clears the mark, stamps
  `data.silent`, and skips the cascade toast. The registry re-sync still runs.
- [notificationService.js](js/shell/notificationService.js) gates on `data.silent` — the
  `'engine:assets'` literal is DELETED. A third `engine:*` id cannot leak.

Not done, deliberately: no server-side change. `download:complete`'s payload and timing are
untouched, so none of its eight consumers move.

## Verification

- `tests/install-queue-wedge.test.cjs` — the MPI-395 `engine:assets`-literal test is replaced
  by the by-construction pin (both heals started silent; both toast sites honour it; no
  `'engine:` literal may return to notificationService). Mutation-checked: reverting either
  gate turns it red. Full suite 629/629, eslint clean.
- **Live A/B on an isolated local instance** (no Pod — the seam is engine-agnostic). Stubbed
  `EventSource`, fired a real model-level `download:complete` through the real handler with
  `krea2.installed` forced false so the cascade condition was genuinely met:
  - `{ silent: true }` -> `[]`. No toast at all.
  - control, same code path, no flag -> `engine:probe-loud installed.` AND `Krea 2 installed.`
    — i.e. the reported bug reproduced exactly, and the genuine cascade toast still works.

Left for Fabio: one real Pod connect on a volume with node drift, to confirm the storm is
gone end to end. Everything reachable without a Pod is verified.
