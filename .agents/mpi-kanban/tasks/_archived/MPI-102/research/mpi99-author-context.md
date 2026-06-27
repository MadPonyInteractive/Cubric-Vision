# MPI-102 — context from the MPI-99 author (the engineer who fixed the twin gate)

I fixed MPI-99 (the dead UNINSTALL button after an install). MPI-102 is the **exact
mirror** on the other branch. This note is the implementer's-eye view so the next session
doesn't re-discover what I already learned.

## The two gates are twins — I only fixed one

`MpiModelManager.js renderList()` has TWO sibling branches, each picking a card's click
handler off `downloadState`:

| Branch | Section | Gate (current) | Active → wires | Else → wires |
|---|---|---|---|---|
| Installed (~line 251) | `installed:true` cards | `isActiveDownload = downloadState === 'downloading' \|\| 'paused' \|\| 'installing'` | pause/resume/cancel | **uninstall** (opens confirm dialog) |
| Uninstalled (~line 362) | `installed:false` cards | `downloadState !== 'idle'` | pause/resume/cancel | **delete** = the **Install** button (label `'Install'`, line 371) |

In MPI-99 (commit **a28c7a8**) I rewrote ONLY the installed branch — changed it from the
old `downloadState !== 'idle'` to the explicit `isActiveDownload` whitelist. I did **not**
touch the uninstalled branch. So line 362 is still the buggy `!== 'idle'`. **MPI-102 is
finishing the job I left half-done.** The brief's fix #1 is exactly right.

## The exact fix (mirror what a28c7a8 did to the installed branch)

Replace line 362's guard with the same whitelist constant the installed branch already
uses. Concretely:

```js
// uninstalled branch (~line 362) — BEFORE
if (downloadState !== 'idle') {
    // pause/resume/cancel
} else {
    card.on('delete', async () => { await _installModel(model); });
}

// AFTER — terminal 'complete'/'cancelled' must fall through to the Install handler
const isActiveDownload = downloadState === 'downloading'
    || downloadState === 'paused'
    || downloadState === 'installing';
if (isActiveDownload) {
    // pause/resume/cancel  (unchanged)
} else {
    card.on('delete', async () => { await _installModel(model); });
}
```

This is byte-for-byte the same shape as the installed-branch fix already in the file — read
lines ~244-257 first and copy that `isActiveDownload` block so the two branches stay
identical. Consider hoisting `isActiveDownload` to one helper used by both branches so they
can never drift again (optional, but they ARE the same predicate).

## Critical: do NOT break the genuinely-downloading-new-pack case

The uninstalled branch legitimately fires for a model being downloaded for the FIRST time
(not yet installed) — that card MUST keep pause/resume/cancel while `downloading`/`paused`/
`installing`. The whitelist preserves that exactly; a naive "treat everything as idle"
would strip pause/cancel off a live new-pack download. Verify a fresh install of an
UNinstalled model still shows working pause/cancel mid-download.

## Why the click is silently dead (don't chase the wrong layer)

Same trap as MPI-99: the button renders, the click reaches it, `emit('delete')` (or
`emit('uninstall')`) FIRES — there's just **no listener** because the wrong branch ran. No
JS error, clean console, NO backend log (dies before any fetch). When you probe, confirm
whether the handler is even WIRED before suspecting `_installModel`, the dialog, or the
backend. The fastest probe is a one-liner reading `state.downloadJobs` right after an
uninstall to see the stale `'complete'` entry, plus a `document.addEventListener` capture
on the component emit event (`mpiinstalleddisplay:delete`) to prove emit fires with no
effect. (In MPI-99 the decisive probe was: emit fires + `el.show()` never called.)

## Root of the whole family: download:complete never clears the job

`download:complete` (downloadService.js ~line 201) sets `job.status='complete'` but never
removes the job from `state.downloadJobs`. Contrast `download:cancelled` (~line 288) and
`download:uninstalled` (~line 296) which `.filter()` the job out. So a lingering
`'complete'` job is the upstream cause for BOTH MPI-99 and MPI-102. The brief's fix #2
(clear-then-render in the uninstall flow, mirroring `download:cancelled`'s `awaitReSync()`)
attacks that root. I recommend **doing BOTH**: fix #1 (the gate whitelist) is the durable
guard so a stale terminal job can never dictate a button again; fix #2 normalizes the
state. If you only do one, do #1 — it's the same proven change as a28c7a8.

A broader durable option (bigger blast radius, get approval): make `download:complete`
itself drop the job from `state.downloadJobs` like its siblings do. That would kill the
entire family at the source, but it touches downloadService shared by the download UI —
test the install progress→complete→installed transition doesn't lose its "complete" flash.

## Do NOT confuse with the harmless MpiModal change

Commit **3845756** added an `if (_isShown && !_backdrop) _isShown = false` reconcile to
`MpiModal.js`. That was my FIRST (wrong) MPI-99 hypothesis. It's harmless and stayed as a
safety net, but it is NOT related to MPI-102. The real lever for this family is the
`MpiModelManager` gate + the lingering job, not the modal.

## Backend analogue already shipped (different file, don't duplicate)

The MPI-100 agent fixed the BACKEND twin of this stale-state family in
`downloadManager.js` `_startRemoteDownload` `_depJobs` ATTACH guard (commit **ac1c308**):
a stale `depJob.status==='complete'` was short-circuiting a re-install server-side. MPI-102
is the pure FRONTEND analogue — the click never even reaches that backend, so ac1c308 is
not the fix here, but it's the same lesson (a stale `'complete'` must not gate behavior).

## Verify checklist

1. Remote (or local): install a model → uninstall it → press **INSTALL** on the now-
   uninstalled card → a REAL install starts (`download:started`, app.log line).
2. Regression: install a model → press **UNINSTALL** on the freshly-installed card →
   confirm dialog still opens (don't undo MPI-99 / a28c7a8).
3. Regression: start downloading an UNinstalled pack → pause/cancel still work mid-download.
4. App-only, NO image rebuild.
