# MPI-481 — a dead remote download poisons every later install

## The line

`routes/downloadManager.js` `_startRemoteDownload`, ~2196:

```js
const freshStatus = statusResults[dep.id];
const reallyComplete = depJob.status === 'complete'
    && (freshStatus ? freshStatus.installed === true : true);
const inFlight = _remoteDepIds.has(dep.id)
    || depJob.status === 'downloading'      // <-- trusted BLIND
    || reallyComplete;
if (inFlight) {
    // Attach only — leave the shared dep's live state alone.
    continue;
}
```

`reallyComplete` is cross-checked against `statusResults` — fresh wrapper truth,
fetched by `remoteModelsCheck` a few lines above, reporting real on-disk state of the
volume. That guard exists because **MPI-100** found a cached `complete` surviving an
uninstall and faking a green INSTALLED over a missing weight.

The `'downloading'` arm has the same staleness and got none of the same treatment. A
dep job says `downloading` for as long as the process lives; nothing settles it when the
Pod behind it disappears.

## What it costs

`continue` means the dep never reaches `toInstall`, so **no `/wrapper/models/install`
fires at all**. The model job exists, its bar sits where the dead run left it, and it
waits on an SSE stream that has no producer. There is no error, no toast and no log
line — the app looks like it is downloading.

Only an app restart clears it, because `_modelJobs` / `_depJobs` are module-level.

## How it was found

2026-08-08, resuming the MPI-467 smoke run. The app had been up since the previous
session, whose CPU Pod died mid-fill. `/comfy/downloads/status` still listed **13 model
jobs**, every dep `downloading`, byte counts frozen and identical across samples.

The runner was about to POST an install for each of those same 13 models. Every dep
would have matched the guard, attached to a corpse, and installed nothing — and the
10-minute no-bytes stall watchdog (`e60b269b`) would have read that as a dead Pod and
recycled the host on a loop, billing the whole time.

Caught before the first install POSTed. Cleared by cancelling all 13 jobs **after**
deleting the Pod, so `remoteUninstallDep` had nothing to reach — cancelling with a Pod
attached would have deleted ~97 GB of partials off the volume.

## Not a smoke-runner problem

The runner only exposed it. The user-facing path is identical: a Pod dies, is deleted,
or is torn down mid-install → press Install again → silent no-op until restart.

## Fix

1. Give the `'downloading'` arm the same freshness cross-check `reallyComplete` has.
   `statusResults` is already in scope.
2. Treat `_remoteDepIds` as stale when no Pod is active — the set survives a
   disconnect and is the other half of the same false-attach.
3. Sweep for the third instance of this pattern before shipping: MPI-100 fixed
   `complete`, this fixes `downloading`, and the guard has three arms.

Do **not** fix it by clearing jobs on Pod teardown alone — that treats the symptom in
one path and leaves the guard trusting cache.
