# MPI-96 Brief

## Symptom (user-reported, 2026-06-15)

Pressed **Connect** with RTX 2000 Ada selected. Progress bar climbed to **99%
"like it was downloading everything"** then stopped. Checked RunPod console:
the Pod **was not started** — showed "Start for $0.24/hr", Compute **Not
running**. User then pressed Start in RunPod UI, got the yellow "stuck on a bad
host" boot message, stopped it.

## Log evidence (`logs/app.log`)

```
2118 createPod REST -> http 201 ok=true podId=sc2vdkrk6cvb3s
2119 Pod created (sc2vdkrk6cvb3s); renderer will poll for ready
2121 /remote/pod/create -> http 200 ready=false podId=sc2vdkrk6cvb3s
```

Log ends there — no `ready`, no teardown. `podId=sc2vdkrk6cvb3s` matches the
Pod in the user's RunPod screenshot. The poll loop is renderer-side
(`Events.emit('remote:connect-progress')` + DevTools), so app.log carries no
further lines while it spun.

## Root cause

The connect flow has **no RunPod runtime-status signal**:

- `_pollEngineReady` ([MpiSettings.js:523-551](../../../../js/components/Compounds/LandingPages/MpiSettings/MpiSettings.js))
  polls only `/remote/comfy/status` (wrapper/ComfyUI health).
- The bar % is a blind elapsed→% estimate: `_pct = clamp(0, 99, ms/240000*100)`
  ([MpiSettings.js:531](../../../../js/components/Compounds/LandingPages/MpiSettings/MpiSettings.js#L531)),
  mirrored by `_connectPct` in `js/shell.js` (heroStats GPU slot).
- So a Pod that **never started** (EXITED on the host / no host slot) and a Pod
  that is **booting slowly** produce identical output: the bar crawls to its 99%
  clamp and parks. `/remote/comfy/status` simply never returns `ready` in either
  case.

RunPod accepted `createPod` (HTTP 201) but the container never came up on a
host — a RunPod-side phantom Pod. The app can't see that because it never asks
RunPod for the Pod's runtime state.

## What already works (do NOT re-do)

MPI-86 boot watchdog fired correctly: at ~5 min the user saw the yellow
"This is taking longer than usual — the Pod may be stuck on a bad host. Press
Cancel…" hint and the Cancel button was live. The user was **not** trapped. So
the safety net is fine — the defect is the **misleading 99% bar** that implies a
download in progress on a Pod that isn't even running.

## Fix direction

1. Backend: add a route the renderer can poll for the **RunPod Pod runtime
   status** (`getPod` → `desiredStatus`/`runtime`/`lastStatusChange`). Likely
   lives next to the existing create/reconnect/status routes (find the runpod
   route module + the `getPod`/REST helper).
2. Renderer: in `_pollEngineReady`, poll Pod runtime status alongside
   `/remote/comfy/status`. If the Pod reports `EXITED` / `TERMINATED` /
   not-running **after create** (give it a short grace so a normal
   `CREATED→RUNNING` transition isn't flagged), stop the fake progress bar and
   surface "Pod failed to start on host — Cancel and pick another GPU." Keep
   Cancel live (already is).
3. Don't let the bar imply progress when the underlying Pod status is not
   running. Healthy slow-boot (status RUNNING but wrapper not yet ready) must
   still wait the full timeout.

## Scope / constraints

- App-side + one backend status route. No Pod image rebuild (progress UX +
  status polling are app code — see memory `project_remote_install_progress_truth`,
  `project_oom_container_self_heal`).
- 3 live RunPod verifications (real phantom-Pod repro) are USER-only — yellow
  card until the user live-verifies on hardware.

## Files (expected)

- `js/components/Compounds/LandingPages/MpiSettings/MpiSettings.js` — poll loop.
- `js/shell.js` — `_connectPct` / heroStats mirror (if the bar logic needs to
  reflect "not running").
- backend runpod route module — new `getPod`-status endpoint (TBD, confirm path
  during implementation).
