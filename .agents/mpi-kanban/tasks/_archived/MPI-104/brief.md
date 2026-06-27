# MPI-104 — RunPod console link in Settings

## Goal
Give the user a one-click jump to the RunPod console from the remote-engine
Settings section. When a Pod boot stalls (RunPod occasionally assigns a bad host
that never pulls the image — see MPI-103 live testing), or the user just wants
ground truth on Pod state / telemetry / logs / spend, the console is the answer.
A static link saves them opening a browser + navigating.

## Behaviour (locked with user 2026-06-16)
- **Deep-link when connected:** `https://console.runpod.io/pods?id=<podId>` — drops
  the user on the active Pod (telemetry/logs tab is where they'd look).
- **Static list otherwise:** `https://console.runpod.io/pods` — when no Pod is
  active (so they can still spot/kill an orphan or stuck Pod).
- Open in the user's external browser (Electron `shell.openExternal`), not in-app.

## Placement
In the RunPod section of `MpiSettings.js`, near the Connect/Disconnect row /
"Remote engine: <status>" line. A small text link or button — "Open in RunPod
console" / "View Pod on RunPod". Match existing Settings hint/link styling
(BEM, CSS vars, icons from icons.js — no raw SVG).

## Where the podId lives
- Backend tracks it (`_mode.podId` / `_startedPodId` in routes/remoteProxy.js);
  the renderer has `cfg.podId` in `runpodConfig` and `/remote/comfy/status`
  returns connection state. Use the renderer-side podId; fall back to the static
  list when null.

## Scope
- **App-side only, NO image rebuild.**
- Owner surface = the remote-engine Settings (MPI-78 agent owns this area; this
  card was created by the MPI-103 agent and handed off for someone to pick up).

## Out of scope
- Any change to the boot/stall/Cancel logic (already correct — MPI-86 slow-host
  guard + Cancel/retry). This card is just the convenience link.
