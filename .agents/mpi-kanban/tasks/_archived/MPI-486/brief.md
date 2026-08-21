# MPI-486 — a non-owner can now ask the engine's owner to restart it

## Why

MPI-484 made every app instance share one engine on 48188 and closed with one hole named
explicitly rather than hidden: **a non-owner cannot restart.** The restart path is
stop-then-start, a non-owner's stop is a no-op, so `/comfy/start` attached and answered
success while nothing restarted — and the custom node that instance had just installed
stayed unregistered. 484 logged a warn. The user's call: no loose strings, build the channel.

## Why the stop stays a no-op

`stopComfyUI()`'s whole body is behind `if (processState.activeComfyProcess)`, with no
kill-by-port and no PID lookup (`routes/shared.js`). That is the safety property that stops
one instance killing another's engine, so the fix must NOT be "let a non-owner kill the
process on the port". Doing that would also make the owner's exit handler record an
undeserved crash — `comfyStopRequested` is false — and report it in the wrong app.

## The channel

A request file in the shared `ENGINE_ROOT`, which is repo-scoped
(`.engine-config.json` at the repo root, fallback `<repo>/engine`) and therefore the one
thing both instances are guaranteed to agree on:

- **Non-owner:** `/comfy/start` + `isUserRestart` while attached → write
  `.engine-restart-request.json` `{at, reason}` → `{ success: true, message: 'Restart
  requested', delegated: true }`. The caller's existing readiness poll covers the gap.
- **Owner:** a 2s interval, armed on spawn, cleared on the engine's exit → read, **delete
  first**, then stop + start (via its own `/comfy/start`, so the spawn logic is reused
  rather than extracted).

**Rejected: the broker.** It is best-effort (absent → the responder never starts) and every
instance registers under the same `cubric.vision` appId, so it cannot address the instance
holding the process. Verified earlier this session: a second `cubric.vision` registration
does not even evict the first.

## The two orderings that are the whole design

Both failures are infinite restart loops, not wrong values, so both are pinned by tests:

1. **Delete before restarting.** Otherwise the request survives the stop and the new
   engine's own watcher reads it again on the next tick.
2. **Ignore a request older than our own process.** The request that CAUSED this start is
   still on disk when the engine comes up; without `request.at > spawnedAt` it restarts
   itself forever.

## Acceptance

1. A plain attach writes NO request file (no false positives).
2. A non-owner `isUserRestart` returns `delegated: true` and leaves a well-formed request.
3. The owner honours a fresh request and ignores a stale one, without looping.
4. The owner's engine is never touched by a non-owner.
