# MPI-396 — uninstall never settles the model's job in the install store

## How it was found

Live, 2026-07-29, while running the MPI-395 residuals on CPU Pod `omi9588i0gymlu`. Step 6 was
"uninstall SDXL Realistic to restore headroom". After it, the tile sat in **Available** — correct
section — but drew a **full 100% progress bar** where the Install chip belongs. **Ctrl+R did not
clear it.**

Not a regression from MPI-395 (that fix is `downloadService.js` + `notificationService.js`; this
is the store + the tile state machine) and not from MPI-394 (preview elements).

## Root cause

`installStore.pruneTerminal()` ([installStore.js:257-269](../../../../routes/install/installStore.js#L257-L269)):

```js
if (job.status === MODEL_STATES.DONE) {
    drop = confirmedInstalled.has(modelId) || age >= DONE_TTL_MS;   // 120_000
}
```

That encodes **"a DONE job ends with the model INSTALLED."** It has two exits and uninstall fits
neither:

- `confirmedInstalled` never gains an uninstalled model, so the fast exit can't fire.
- The only remaining exit is the 120-second belt.

Uninstall produces **confirmed NOT-installed** — evidence just as terminal as confirmed-installed,
and arguably stronger, since the user asked for it. The store simply has no way to hear it.

`routes/downloadManager.js:2408` does `_modelJobs.delete(modelId)` on the **remote** uninstall leg
(the local leg has its own twin below it), but that is downloadManager's own legacy runtime map —
**not** the SOT store. So the store keeps the DONE job and keeps shipping it in every snapshot.
The store lives in the **main process**, which is why a renderer reload re-hydrates the stale job
instead of clearing it — the symptom that made this look permanent rather than transient.

## The renderer half — same assumption, one layer up

`_modelState` ([MpiModelManager.js:676](../../../../js/components/Compounds/LandingPages/MpiModelManager/MpiModelManager.js#L676)):

```js
const isBusy = isActiveDownload || (!!job && downloadState === 'complete');
```

MPI-241 added that so a fast ephemeral-Pod install (`started → complete` collapsing before
`reSyncInstalledModels()` lands) would not flash the Install chip. `_tileState` then checks
`anyInstalled && !isActiveDownload` first — which is false for an uninstalled model — so the
`isBusy` branch wins and renders a determinate bar at `job.progress = 1` → **100%**.

MPI-241 modelled the window *before* installed flips **true**. Uninstall is the identical shape
with the opposite meaning: lingering DONE job + not installed. Neither layer distinguishes them.

## The sweep found TWO more, and they change the severity

The 120s belt is not the whole story — **the job never gets pruned at all.**

1. **Engine-split half-wire.** The LOCAL uninstall leg calls
   `reconciler.reconcileOnce()` ([downloadManager.js:2547](../../../../routes/downloadManager.js#L2547),
   commented "G11: reconcile against post-delete disk truth"). The REMOTE leg
   ([:2408-2410](../../../../routes/downloadManager.js#L2408-L2410)) does its `_modelJobs.delete` +
   broadcast and then `return res.json(...)` — it **never reaches that line.** Exactly the
   half-wire class `.claude/rules/comfy_engine.md` § Engine Split warns about.
2. **The reconciler poll self-idles.** `start()`'s tick is gated on
   `store.hasActiveJobs()` ([reconciler.js:153](../../../../routes/install/reconciler.js#L153)),
   and `hasActiveJobs` is true only for a NON-terminal job. Post-uninstall every job is terminal,
   so the 15s poll returns early **forever**.

Net effect: the stale DONE job survives **indefinitely**, not 120 seconds. The only two things
that can clear it are the next install (which re-activates the poll) or an SSE reconnect
([:1068](../../../../routes/downloadManager.js#L1068)) landing more than `DONE_TTL_MS` after the
job went terminal. The user's Ctrl+R was an SSE reconnect that arrived too early — which is
precisely why it looked permanent.

## Fix direction — at the store, not the tile

The store is the SOT (`.claude/rules/downloads.md`: *"The SOT is `routes/install/installStore.js`"*).
An uninstalled model whose store job still reads DONE is the store lying to **every** consumer —
the tile is just the consumer that happens to draw it. Suppressing the bar in `_tileState` would
leave the lie in place and is exactly the symptom-patch THE ROOT-CAUSE RULE forbids.

Two shapes to weigh:

1. Uninstall explicitly settles/drops its store job (mirror of what `:2408` already does to the
   legacy map).
2. `pruneTerminal` learns a confirmed-**un**installed set alongside `confirmedInstalled`.

(1) is more direct; (2) is closer to the reconciler's existing "reconcile against truth" model.
Decide after reading `reconciler.js` — it already runs a post-uninstall pass, so the plumbing may
be there.

## Blast radius — sweep BEFORE editing

- **Both engine legs.** Remote uninstall (~`downloadManager.js:2408`) and the local leg below it.
  A one-leg fix is a false done — see `.claude/rules/comfy_engine.md` § Engine Split.
- **Every store-snapshot consumer**, not just `MpiModelManager` — the snapshot replaces
  `state.downloadJobs` wholesale.
- **Do not regress MPI-241.** A genuinely completing install must still hold its progress UI
  through the pre-re-sync window. The guard test for that has to keep passing, and a negative
  control should prove the new test fails without the fix.

## Related

- MPI-397 — the other half of the same uninstall UX (grid waits on the remote disk stat). Separate
  root, separate decision; do not merge them.
- `docs/model-library.md` § "download:complete lingers in state.downloadJobs" — the existing
  written-down warning that this class of bug keeps coming from. Extend it once fixed.
