# MPI-484 — Validation

Verified 2026-08-08 against the live system: the user's app served :3000 (server fork
PID 8040) with its engine on 48188 (PID 10372, a child of 8040), a model smoke run in
flight. Neither was closed, restarted or otherwise touched.

## Acceptance 1 — a non-owner instance attaches, owner keeps running

Launched a second instance with `npm run app:isolated` (own profile, port 57150). It
never spawned an engine, so `activeComfyProcess` is null in its server fork — the exact
state that used to produce the dialog.

```
GET  /comfy/status  ->  {"running":true,"ready":true,"needsRestart":false}
POST /comfy/start   ->  {"success":true,"message":"Already running"}   HTTP 200
```

Before the change that POST was `HTTP 409 {"error":"Something else is already using port
48188 — most likely another ComfyUI. Close it, then start the engine again."}`, which is
the screenshot that opened this card, and `/comfy/status` answered `running:false` over a
live engine.

Owner unaffected throughout and after teardown: 48188 still LISTENING on PID 10372, and
the owner's own `/comfy/status` on :3000 still `{"running":true,"ready":true}`.

## Acceptance 2 — an attached instance cannot stop the owner's engine

Proven by reading, deliberately not by firing a kill at a live engine mid-smoke-run.
`/comfy/stop` is `stopComfyUI(); res.json({success:true})`, and the whole body of
`stopComfyUI()` (`routes/shared.js:165-172`) sits behind
`if (processState.activeComfyProcess)`. There is no kill-by-port and no PID lookup
anywhere in it, so a null handle makes it a total no-op. `/comfy/unload` returns early on
the same null handle. Ownership was never shared; only availability now is.

## Regression sweep

`tests/comfy-port-lockstep.test.cjs` asserted the OLD contract
(`/comfy/start refuses a port it did not open`) and failed the moment the route changed —
which is the test doing its job. Rewritten to the new contract rather than deleted,
keeping the half that is still load-bearing: **the probe must run BEFORE the spawn.** That
ordering matters more now, not less — reach `spawn()` with the port occupied and a second
ComfyUI fails to bind and exits, leaving a DEAD engine and a `lastExit`, which is strictly
worse than the dialog this replaced. A second test now guards the `/comfy/status` twin.

`node --test tests/comfy-port-lockstep.test.cjs tests/comfy-needs-restart.test.cjs` → 7/7.
eslint clean on both changed files. The full suite was NOT run: peers hold uncommitted
edits in `routes/downloadManager.js`, `routes/remoteModels.js` and `scripts/smoke-workflows.mjs`,
so a suite-wide result would not be attributable to this change.

Client callers swept — `js/services/comfyController.js:384` and `js/shell/navigation.js:276`
both branch on `!res.ok`, so a 200 simply stops raising; `comfyController:380` is additionally
gated on `!status.running`, which the status fix now makes false. No client change needed.

## One thing this does NOT fix, and it is logged rather than hidden

The restart path is stop-then-start. In a non-owner instance the stop is a no-op, so the
start now attaches and reports success without anything having restarted — a custom-node
install in a second instance will not pick up its node. That path was already broken
before this card (it produced the 409 instead), so this is not a regression, but silence
would be. `/comfy/start` now emits a `warn` naming it when `isUserRestart` was requested
and we attached. A real fix means asking the OWNER to restart, which needs a cross-instance
channel and is deliberately not built here.
