# MPI-85 — Remote/local routing: local fallback when no Pod + "Auto-connect on start" checkbox

> Found live 2026-06-15 during the MPI-64 remote mask test. Spun out of MPI-64 as a settings/routing
> redesign (separate scope from the RunPod transport work).

## Problem (observed live)

App was relaunched with **"Enable RunPod remote engine" still ON**, but the previous Pod had been
**deleted on quit** (delete-on-quit box ON), and no Pod auto-(re)connected. Trying an auto-mask:

```
[WARN] [remoteEngine] WS token fetch failed — remote event channel unavailable
[ERROR] [comfy] autoMask workflow failed — Error: Remote engine not connected.
        Open Settings → RunPod and press Connect to create a Pod before generating.
    at Object._ensureRemoteReady (comfyController.js:305:15)
```

Result: a **hard "Auto-mask failed" bug-reporter modal** + the user is **locked out of the local engine**
— even though the status bar showed `LOCAL · OFFLINE · RTX 4060 Ti · 7/7 models` (local ComfyUI ready,
all models present). The failure was BEFORE any masking/SAM node ran, so it is NOT a mask-system bug.

## Root cause

The single toggle **"Enable RunPod remote engine"** fuses two distinct concepts:

1. **Routing preference** — should a generation go to a Pod?
2. **Boot lifecycle** — should launching the app auto-spin/auto-reconnect a (billed) Pod?

Generation routing keys off the toggle (`remoteEngine enabled === true` → `_ensureRemoteReady` throws if no
Pod) instead of the **actual connection state**. So "remote enabled but no Pod" = total lockout, when a
perfectly good local engine exists.

## Decisions (user, 2026-06-15)

1. **Auto-fallback to LOCAL when no Pod is connected** (app-start-no-Pod OR mid-session disconnect — "if he
   disconnects, he wants to work offline"). One-time info toast: *"No Pod connected — running locally.
   Connect in Settings → RunPod for cloud generation."* GUARD: if the requested model is installed only on
   the Pod volume and NOT locally, do not silently fail — surface *"This model is installed on your Pod —
   Connect to use it,"* not a cryptic error.
2. **New checkbox "Automatically connect on app start" — default OFF.** Owns the boot auto-connect lifecycle,
   decoupled from "Enable RunPod remote engine." Default OFF = no surprise billed Pod at launch; user opts in.
3. **"Enable RunPod remote engine" becomes "remote is AVAILABLE / show the panel," NOT "force remote."**
   Routing follows the live connection state: Pod connected → remote; else → local.

## Mental model after the change

| Toggle / state | Behavior |
|---|---|
| Remote enabled, **Pod connected** | gen → remote |
| Remote enabled, **no Pod** (stopped/disconnected/unavailable) | gen → LOCAL + one-time toast; remote-only model → "Connect to use" prompt |
| Remote enabled, **auto-connect ON** | app start spins/reconnects a Pod automatically |
| Remote enabled, **auto-connect OFF** (default) | app starts LOCAL; user Connects when wanted |
| Remote disabled | local only (unchanged) |

## Likely files

- **Gen routing:** `js/services/comfyController.js` `_ensureRemoteReady` (~:305) + `ensureServerRunning`
  (~:180) — the throw-if-no-Pod gate becomes a local-fallback branch (route to the local engine instead of
  throwing) with a model-availability guard.
- **Boot lifecycle:** the boot auto-connect/auto-reconnect path (shell.js boot + the `wasConnected`
  auto-resume) — gate it on the new "auto-connect on start" flag, not on `remoteEngine.enabled`.
- **Settings UI:** `js/components/Compounds/LandingPages/MpiSettings/MpiSettings.js` — add the
  "Automatically connect on app start" checkbox; reword the "Enable RunPod remote engine" hint.
- **State/storage:** new persisted flag (e.g. `runpodConfig.autoConnectOnStart`); keep `enabled` as
  availability only.
- **Model availability guard:** local-install check (downloadManager / model registry) for the
  remote-only-model fallback message.

## Verify

- Remote enabled, no Pod, hit Generate → runs on local engine + one-time toast (NOT the bug-reporter modal);
  the status bar's LOCAL state is honoured.
- A model installed only on the Pod (not local) → clear "Connect to use this model" message, not a crash.
- New checkbox OFF (default): app launch stays local, no Pod auto-spun. ON: a Pod auto-connects at start.
- Mid-session disconnect → next gen falls back to local seamlessly.
- "Enable RunPod remote engine" ON with a connected Pod still routes remote (no regression).
