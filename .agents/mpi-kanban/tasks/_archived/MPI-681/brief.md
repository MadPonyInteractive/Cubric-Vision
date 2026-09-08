# MPI-681 — A flow-deps-only install never repaints

Found live 2026-09-01 while installing the MiniMax Music 3 weights for MPI-664. **Not
MPI-664's doing** — the flow only made an existing hole 100% reproducible.

## What the user sees

Install the 13.4GB for Text to Music from the Flow Library drawer. The download finishes,
the log says so, the "installed." toast fires — and the drawer **stays frozen at 100% with
a Cancel button**, the `Extra dependencies (13.4GB)` row still shows an `Install` chip, and
the grid tile still reads "needs models". It never recovers. Restarting the app clears it.

## Root cause

`syncModelInstalled()` — `js/data/modelRegistry.js:246-255`.

The `models:checked` fan-out is diff-gated on the **MODEL set only**:

```js
const installedModelIds = Object.keys(results)
    .filter(id => !id.startsWith('app:') && !id.startsWith('plugin:') && isModelUsable(id));
const _installedKey = installedModelIds.slice().sort().join(',');
...
if (_installedKey === _lastEmittedInstalledKey && _driftedKey === _lastEmittedDriftedKey) {
    return true; // nothing changed — skip the models:checked fan-out
}
```

A **flow-deps-only** install writes a fresh `_flowDepStatusCache` twenty lines earlier
(`setFlowDepStatus`, line ~222) and then changes **neither** key — flow deps are not
models, so `installedModelIds` is byte-identical before and after. The gate takes the early
`return true`, and `models:checked` never fires.

`MpiFlowLibrary` has no other signal. Its own comment
(`MpiFlowLibrary.js:617-622`) states the assumption that broke:

> `models:checked` fires at the end of every sync (after the flow dep cache is written),
> which is the only signal that a flow-deps install flipped a flow to Ready.

That was true when MPI-304 shipped flow deps. **MPI-326 later made the emit diff-gated**
and keyed it on the model set only, silently cutting the wire. `_patchTile` already calls
`openDetail(flow)` for the active drawer, so the repaint is fully wired — it is only never
invoked.

Restarting works because `_lastEmittedInstalledKey` is `null` at module load, so the first
sync of a session always emits.

## Blast radius

Every flow with `requiredModels: []` + `requiredDeps` — i.e. **the whole audio section**:
`voice-changer`, `chatter-box`, `drama-box`, `stems`, `minimax-music`.

A flow with BOTH models and deps (`head-swap`) is masked: its model install moves
`installedModelIds`, so the fan-out fires and the deps repaint with it.

**`setPluginDepStatus` (MPI-310) sits in the same loop and has the same hole** — a
plugin-deps-only install is equally invisible. Shared primitive: fix both in one pass, and
sweep the `plugin:`/`app:` consumers, or it is a false done.

## The fix (not yet implemented)

Widen the diff key past models, so it covers what the sync actually rewrote — the flow-dep
and plugin-dep status caches — rather than teaching each consumer to poll. Do **not** just
drop the gate: MPI-326 exists because the remote heartbeat re-syncs every ~5s and a
no-change re-emit tore down open op dropdowns and in-progress slider drags.

## Verify

Two flow deps on disk, app running, drawer open, no restart:
- the footer swaps Cancel → Open,
- the `Extra dependencies` row flips to `Installed`,
- the tile badge flips to READY and the header count increments.

Then confirm MPI-326's original complaint has not returned: connect the remote engine, open
an op dropdown, and hold it open across several heartbeats.

## Related

Belongs under the **MPI-513** umbrella ("install state that lies to the user") by shape,
but it is a distinct root cause — a missing fan-out signal, not the two-writer problem
MPI-320 fixes. It will still be there after MPI-513 phase 1.
