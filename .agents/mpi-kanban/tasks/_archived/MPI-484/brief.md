# MPI-484 — 48188 is a SHARED engine port, so ownership is not availability

## The report

2026-08-08. An agent running its own app instance (`npm run app:isolated`, MPI-458)
tried to generate and got a **`Generation failed` dialog**:

> Something else is already using port 48188 — most likely another ComfyUI. Close it,
> then start the engine again.

Nothing was wrong. The port was held by the user's own engine — PID 10372, a child of
his server fork 8040 — and the agent's instance was being told to close it.

## Root

`routes/comfy.js` `/comfy/start` (~284-303) decides ownership and availability with the
SAME test:

```js
if (processState.activeComfyProcess) return res.json({ success: true, message: 'Already running' });
...
const occupied = await probeAx.get(`http://127.0.0.1:${COMFYUI_PORT}/history`, ...);
if (occupied) return res.status(409).json({ error: msg });   // "another ComfyUI"
```

`activeComfyProcess` is module-level in the server fork, so it answers "did **I** spawn
it", not "is an engine up". A second app instance never spawned it, so every healthy
shared engine reads to it as a stranger.

`/comfy/status` (~170) has the identical defect: `if (!activeComfyProcess) return
{ running: false }`. An instance attached to a live engine reports the engine as down.

## Why the guard existed, and why that reason expired

The MPI-434 comment is explicit — "we have no child of our own, so ANYTHING answering on
our port is a stranger" — and it was RIGHT when written: the engine shared ComfyUI's
default 8188 with the standalone bench at `G:\ComfyUi`, so an occupant really was
foreign, and adopting it meant generating against an engine with no MpiNodes and dying
as `Node 'Input_Seed' not found`.

Two things retired that premise. The engine moved to a private **48188** (nothing else
binds it), and **MPI-458 made a second app instance routine** — `npm run app:isolated`
exists precisely so agents stop taking the user's app. The guard now fires on the
normal case it never anticipated.

**User's call, 2026-08-08:** 48188 is the shared engine port; every app instance uses
that one ComfyUI. The port change alone was the fix; the extra guard overdid it.

## The fix

An answering port means the engine is up — attach, do not refuse and do not spawn.

1. `/comfy/start`: occupied → `{ success: true, message: 'Already running' }`.
2. `/comfy/status`: no child but the port answers → `running: true`.

**Deleting the 409 without the attach would be worse than the bug**: control falls
through to `spawn()`, a second ComfyUI tries to bind an occupied 48188 and dies, and the
instance ends up with a dead engine and a `lastExit` instead of a dialog.

## Not touched, deliberately

An attached instance cannot kill the owner's engine, and it needs no guard to stop it:
`/comfy/stop` calls `stopComfyUI()`, whose whole body sits behind
`if (processState.activeComfyProcess)` (`routes/shared.js`) — no kill-by-port and no PID
lookup anywhere — and `/comfy/unload` returns early on the same null handle. Verified by
reading rather than by firing a kill at a live engine mid-smoke-run. Ownership stays
with the spawner; only availability is shared. No change needed and none made.

## Acceptance

1. A second app instance whose engine it did not spawn gets `success` from
   `/comfy/start` and `running: true` from `/comfy/status`, while the owner's engine
   keeps running.
2. The owner's `/comfy/stop` still stops it; the attached instance's stop stays a no-op.
