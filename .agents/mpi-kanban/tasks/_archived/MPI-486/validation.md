# MPI-486 — Validation

Verified 2026-08-08 with the user's app on :3000 (server fork PID 8040) owning the engine
on 48188 (PID 10372) and a model smoke run in flight. Neither was closed or restarted.

## Verified live — the delegating half

A second instance from `npm run app:isolated` (port 63894), which owns no engine:

```
POST /comfy/start  {}                          -> {"success":true,"message":"Already running"}
  <ENGINE_ROOT>/.engine-restart-request.json   -> absent          (no false positive)

POST /comfy/start  {"isUserRestart":true,       -> {"success":true,"message":"Restart requested",
                    "reason":"MPI-484 live check"}   "delegated":true}
  <ENGINE_ROOT>/.engine-restart-request.json   -> {"at":1786169645339,"reason":"MPI-484 live check"}
```

Acceptance 1, 2 and 4 met: a plain attach writes nothing, a requested restart is delegated
with a well-formed record, and the owner's engine was still LISTENING on 48188 throughout
and after teardown. The request file was removed afterwards.

## NOT verified live — the honouring half (acceptance 3)

**Stated plainly rather than rounded up.** Honouring requires an instance that OWNS an
engine, and 48188 was held by the user's app for the whole session, so no instance under my
control could ever be the owner. Testing it would have meant taking the port from a live
smoke run.

What stands in for it: `tests/engine-restart-delegation.test.cjs` (4/4) pins the two
orderings that are the entire design, chosen because each failure mode is an infinite
restart loop rather than a wrong value —

1. the request is deleted BEFORE the restart begins (asserted inside the watcher body, so
   the `/comfy/stop` route's own `stopComfyUI()` cannot satisfy it by accident);
2. a request older than our own spawn is ignored (`request.at > spawnedAt`);

plus the watcher being armed on spawn and cleared on the engine's exit. The remaining risk
is confined to the runtime wiring of a 2s `setInterval`, not to the decision logic.

**Owed:** one end-to-end run — instance A spawns the engine, instance B posts
`isUserRestart`, A restarts it, B's readiness poll recovers, and it happens exactly once —
the moment 48188 is free.

## Regression sweep

`node --test tests/engine-restart-delegation.test.cjs tests/comfy-port-lockstep.test.cjs
tests/comfy-needs-restart.test.cjs` → 11/11. eslint clean on `routes/comfy.js`.

The full suite was not run: peers hold uncommitted edits in `routes/downloadManager.js`,
`routes/remoteModels.js` and `scripts/smoke-workflows.mjs`, so a suite-wide result would
not be attributable to this change.

## Design notes worth keeping

The owner restarts by calling its **own** `/comfy/start` over loopback rather than by
extracting the ~100-line spawn block into a function. Same code path, no refactor of a live
route while a peer works in `routes/`.

The broker was rejected as the channel: it is best-effort (absent → the responder never
starts) and every instance registers under the same `cubric.vision` appId. Measured earlier
this session — a second `cubric.vision` registration did not evict the first — so it cannot
address the one instance holding the process.

## Filing note

An id collision: I took 485 from `next_id` while a peer was committing their own MPI-485
(`aa60dadf`), and my write overwrote their card on disk. Theirs was restored from HEAD
intact and verified byte-clean; this card is the re-file. The code here also predates the
card, which is not the card-then-edit order the rules ask for.
