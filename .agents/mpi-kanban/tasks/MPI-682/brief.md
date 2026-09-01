# MPI-682 — A flow cannot be uninstalled

Found 2026-09-01, trying to re-test MPI-681 by uninstalling MiniMax Music: there is no way
to. **A flow has no Uninstall anywhere in the app.**

## Why it was invisible until now

Until the audio flows, every flow's weight came in through a MODEL, and the Model Library
already uninstalls models. A flow's *own* `requiredDeps` were a small tail on top of that.
The audio section changed the shape — these flows have **no `requiredModels` at all**, so
their entire footprint is flow-owned and the Model Library never sees it:

| flow | own deps | models |
|---|---|---|
| `minimax-music` | 3 (13.4GB) | 0 |
| `drama-box` | 17 | 0 |
| `chatter-box` | 14 | 0 |
| `voice-changer` | 3 | 0 |
| `stems` | 1 | 0 |
| `head-swap` | 2 | 1 |

Everything on that list is install-only, permanently. The disk is reclaimable only by
hand-deleting files the app then has no idea are gone.

## Two blockers, one is server-side

**1. No UI.** `openDetail()` in
`js/components/Compounds/LandingPages/MpiFlowLibrary/MpiFlowLibrary.js` ends in a footer
block (grep `// Footer: installing`) with three states — installing → `Cancel`, available → `Open`, otherwise → `Install`. The
`available` branch mounts `Open` and nothing else.

**2. The backend would refuse anyway.** `_flowRequiredDepIds()`
(`routes/downloadManager.js:407`) protects every flow's deps **unconditionally** and takes
no exclude argument, so both engine uninstall guards would keep the very files the flow's
own uninstall is trying to free — a silent no-op. Its own header says protection is
unconditional on purpose, because a flow had no install state of its own to gate on.

Plugins hit exactly this and solved it: `_pluginRequiredDepIds(excludeUninstallId)`
(`:373-395`) is the same function *with* the exclude, and its comment names the reason —
"plugins are the first entity with a user-facing Uninstall button… protecting a plugin's
deps unconditionally would make its own uninstall a no-op". Flows are the second.

## The precedent to copy — `_uninstallPlugin`

`MpiModelManager.js:1324-1338`. A plugin row is deps-only, exactly like an audio flow, and
it already ships the whole pattern: `MpiOkCancel` confirm → `downloadService.uninstall(
pluginDepKey(id), deps, deleteFiles)` → the server guard releases the weight because the
uninstall id matches the owner's key. Same three moves for `flowDepKey(id)`.

## Scope decision — a flow uninstall frees the flow's OWN deps only

Not its `requiredModels` (Krea2 is not MiniMax's to delete — the Model Library owns models),
and not a `requiredPlugin`'s deps. `flowDepIds()` unions plugin deps into the *install*
payload, so uninstall must read `flow.requiredDeps` directly or the dialog over-promises
what it frees. No flow declares `requiredPlugins` today; the union still has to be
respected or this becomes a landmine the day one does.

Deps shared with **another flow** stay: `chatter-box` and `voice-changer` share 3 deps, so
this is a live case on the current board, not a hypothetical.

## Blast radius

Every flow with `requiredDeps` — the six above. Nothing else changes: models and plugins
keep their existing uninstall paths untouched.

## Related

- **MPI-681** (done, same session) — the repaint after uninstall is already wired: the
  `download:uninstalled` handler re-syncs, and the widened diff key now fans out
  `models:checked`, which `MpiFlowLibrary` listens to. Verify it, don't rebuild it.
- **MPI-462** orphan sweep exists because a not-installed entity never offers Uninstall and
  its files strand. This card removes that pathway for flows.
- **MPI-513** umbrella ("install state that lies to the user") by shape.
