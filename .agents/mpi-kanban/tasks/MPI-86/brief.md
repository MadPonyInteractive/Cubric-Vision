# MPI-86 — Cancel during an in-progress RunPod connection + boot watchdog

> Promoted from MPI-64 OPEN-ITEMS K1 (was F5). Explicit user request, re-flagged 2026-06-15.
> A feature, not a validation item.

## Problem

A Pod can stick at RunPod's "Initializing your pod…" for >5 min on a bad host/volume (RunPod-side, out
of our control). During this window the app's `_starting` flag spans the WHOLE boot → the **Connect
button is disabled** with no way out. The user is trapped — the only escape is killing the app (and a
half-started Pod may keep billing). Observed repeatedly; the user explicitly wants a cancel affordance.

## Scope

1. **Cancel button next to Connect** — aborts the in-flight create/reconnect: delete the half-started Pod
   (stop billing), clear `_starting`/`_connecting`, re-enable Connect.
2. **Auto-cancel on GPU switch** — if the user picks a different GPU while a connection is in flight,
   auto-cancel the in-flight one so they can immediately Connect to another card (the out-of-stock / bad-host
   pivot — see MPI-64 L1: cards go in/out of stock, the user needs to bail and retry another).
3. **Boot watchdog/poller** — while `_starting`, poll RunPod Pod status + wrapper `/health` every ~2-3 min;
   if no progress past a threshold, surface a "taking too long — Cancel and try another GPU" prompt. Tie into
   the existing `_starting` flag + the `/remote/comfy/status` poll.

## Likely files

- `js/components/Compounds/LandingPages/MpiSettings/MpiSettings.js` — the Connect/Disconnect button + `_starting`/
  `_connecting`/`_engineBusy` state; add Cancel + the GPU-switch auto-cancel.
- `routes/remoteProxy.js` / `routes/runpodRemote.js` — an abort/delete path for an in-flight create
  (`_createPodInternal`); the half-started Pod must be deleted so it doesn't orphan-bill.
- The boot/connect poll loop (shell.js connect feed / Settings poll) for the watchdog threshold.

## Constraints

- USER runs all live Pod ops; Claude drives steps + observes.
- A healthy FAST boot must be unaffected (no premature cancel). The watchdog threshold must clear the
  normal first-boot-per-GPU compile time (several minutes — see MPI-64 L3).
- Deleting the half-started Pod must be the same delete path as Disconnect (no orphan billing).

## Verify

- A Pod stuck initializing past the threshold lets the user **Cancel** → Pod deleted, no orphan billing,
  Connect re-enabled.
- Picking a different GPU mid-connect auto-cancels the in-flight one and lets the user Connect to the new card.
- A healthy fast boot completes normally — no premature cancel, no spurious "taking too long" prompt.
