# MPI-102 Brief — Install/Uninstall button dead after an uninstall

**Origin:** live-found 2026-06-16 during MPI-100 verify on the no-GPU Pod
(`qj7nx8bkdp6nhq`). **APP-ONLY, NO IMAGE REBUILD** — the click dies in the renderer
before any fetch (app.log shows NO line; console clean).

## Symptom

After UNINSTALLING a model, pressing **INSTALL** on a card does nothing — no download,
no log line. Earlier this session the dead button was UNINSTALL (MPI-99, fixed). Same
family: a card re-rendered after an uninstall has the wrong / no click handler. The user
called it: "something else is the root — a UI that is unresponsive after an uninstall."

## Root cause (renderer state)

`js/components/Compounds/LandingPages/MpiModelManager/MpiModelManager.js` `renderList()`
chooses a card's handlers off `downloadState`:

- Installed branch (~line 251): `isActiveDownload = downloadState === 'downloading' || 'paused' || 'installing'` → if true, wires pause/resume/cancel; ELSE wires `uninstall`.
- Uninstalled branch (~line 362): `if (downloadState !== 'idle')` → wires pause/resume/cancel; ELSE wires `delete` (the **Install** button, label "Install", line 371).

`downloadState` comes from `state.downloadJobs.find(j => j.modelId === model.id)?.status`.
A finished install leaves a job with status **`'complete'`** in `state.downloadJobs`
(`download:complete` sets status but the job is never removed). `'complete'` is neither
`'idle'` nor in the active set — BUT the uninstalled branch's guard is
`downloadState !== 'idle'`, which `'complete'` SATISFIES → it takes the pause/cancel
branch and **never wires the `delete` (Install) handler** → the Install button renders but
is dead.

## Why the cancel path works but uninstall doesn't

`download:cancelled` (line ~469) explicitly calls `awaitReSync()` with the comment
"Rebuild card so its handlers wire to `delete` (Install) again — the pause/resume/cancel
handlers attached during downloading are dead now." The **uninstall** path has no
equivalent guaranteed re-render-after-clear, and a lingering `'complete'` job is never
normalized to `'idle'`. `downloadService.uninstall()` DOES clear the job
(`downloadService.js:121`) but only AFTER emitting `download:uninstalled` (line 120); the
exact ordering vs the `s_installedModelIds` state-driven renderList (MpiModelManager:372)
needs a **live DevTools probe** to confirm whether the stale job is still present at
render time.

## Fix direction (probe first, then choose)

1. **Normalize in renderList (robust):** treat `downloadState` of `'complete'` (and
   `'cancelled'`) as `'idle'` when deciding the primary action, so an installed/uninstalled
   card ALWAYS wires its correct handler (uninstall / install) regardless of a stale job.
   Change both guards (installed ~251, uninstalled ~362).
2. **And/or clear-then-render (matches cancel):** make the uninstall flow clear
   `state.downloadJobs` for the model BEFORE the re-render and force a `renderList()` /
   `awaitReSync()`, mirroring `download:cancelled`.

Prefer #1 as the durable guard (a stale terminal job should never dictate the button); #2
as belt-and-braces.

## Repro / verify

Remote (or local) → install a model → uninstall it → press INSTALL on the now-uninstalled
card → expect a REAL install to start (download:started, log line). Also re-check that the
UNINSTALL button still works on a freshly-installed card (don't regress MPI-99). A
one-line DevTools probe of `state.downloadJobs` right after an uninstall confirms the
stale `'complete'` entry.

## Notes

`MpiModelManager.js` was the MPI-99 agent's file (session closed). This is a NEW bug, not
a regression of the MpiModal dialog fix. Renderer-only — do not rebuild the Pod image.
Relates to the install-path stale-state family already fixed BACKEND-side in
`downloadManager.js` `_depJobs` (MPI-100 commit ac1c308) — this is the FRONTEND analogue.
