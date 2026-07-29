# MPI-395 Brief

Full diagnosis, evidence and fix are in [validation.md](validation.md). This file carries
only what that does not: how to reproduce it, and how to tell it apart from its neighbours.

## Reproduction

Needs a Pod whose volume **already holds the engine assets** — i.e. any session after the
first. On a fresh volume it does not reproduce, because the engine-asset install becomes a
real ~1.76GB download that always lands after the listener is armed.

1. Start the app (the latch is per app session — a reconnect is not enough).
2. Connect to the Pod. `engine:assets` runs and completes as a no-op.
3. Open the Model Library and install anything.
4. Pre-fix: the tile parks on `Queued…` and stays there. It frees after 30 minutes.

**Ctrl+R is the workaround** — reloading the renderer resets `_inFlight` to 0.

## Confirming it from the live app, without the console

```
curl -s http://127.0.0.1:3000/comfy/downloads/status   # the clicked model has NO job
curl -s http://127.0.0.1:3000/comfy/downloads/active   # {"models":[],"engine":false}
```

A tile reading `Queued…` while `active` is empty **and** the model has no server-side job
is the signature: `queued` is set only when `_inFlight > 0`, so the chain is holding while
nothing is actually running.

## Not to be confused with

- **MPI-393** (drift heal installing whole model universes). That logs
  `remote drift heal: re-cloning …` per model and moves real bytes. Here the log is silent
  and the volume is flat — nothing was drifted.
- **The volume-full blocks** of the 2026-07-29 session. Those log
  `remote install blocked — volume full: need X, have Y` and surface a warning toast. This
  bug logs nothing and shows nothing.
- **MPI-241** (a lingering terminal `complete` job flashing the Install chip). That is a
  *display* state on a job that exists; here the job does not exist at all.

## Ceiling left in place

The 30-minute `_awaitDownloadDone` safety timeout stays — it is a legitimate backstop for a
genuinely dropped signal on a long download. It now logs when it fires, which converts a
future wedge from invisible into a one-line grep.
