# Pod Lifecycle Policy

**Status:** Decision record — Phase 1 design document. No code written.

---

## Decision Summary

- **Create vs start:** Reuse an existing stopped Pod if one exists for the user's current volume+data-center profile; only create a new Pod when none exists or the existing one is incompatible/deleted.
- **Stop vs delete on app quit:** Stop (not delete) by default on clean app quit. Delete is an explicit user action. Both states are surfaced clearly so users understand storage continues to bill after stop.
- **Network volume delete is a first-class user action.** A user can delete the network volume from settings. This is required, not just allowed: a network volume is locked to one data center, and each data center exposes only a subset of GPU cards. To use a different GPU family the user may have to delete the volume and create a fresh one in another data center. (User decision 2026-06-11.) Deleting the volume warns that all models must be re-downloaded.
- **Connection model (user decision 2026-06-11):** RunPod is gated by a **master toggle in a Settings → RunPod section** (off by default). Off → all RunPod UI inactive, app is purely local, no pop-up. On → RunPod settings active. With it on, app open shows an **advisory pop-up** (not a connect gate): *"Your RunPod section is active — when ComfyUI starts you will be using your RunPod credits."* There is NO separate "Connect" button and NO auto/explicit-connect distinction: the Pod starts at the **existing ComfyUI-start trigger** (the same `comfy:ready` boot path that starts the local engine today), just routed to start a Pod instead of the local subprocess.
- **Idle watchdog (crash backstop):** The Cubric wrapper process inside the Pod self-stops the Pod after **15 minutes** of no authenticated traffic. This is the sole reliable safety net when Electron crashes or is force-killed. See watchdog spec below. (15 min for inference — long video generations can run several minutes; 12 min noted as the future baseline once LoRA training lands.)
- **Billing warnings:** Shown at stop, at quit-while-running, and at any point the user asks to delete a Pod or a network volume.
- **Start/resume stale-payload handling:** After a RunPod start/resume call returns, the app polls the Pod status API until the wrapper responds on its HTTP health endpoint — the initial runtime payload from RunPod is not trusted.

---

## Lifecycle State Table

Each row covers one scenario. "WHO STOPS BILLING" means who is responsible for halting GPU billing (storage always bills until the network volume is deleted — that is user-must-act in all cases).

| Scenario | App Action | Pod State After Action | Who Stops GPU Billing | User-Visible Feedback |
|---|---|---|---|---|
| **Fresh install — no Pod exists** | At the first ComfyUI-start trigger with RunPod active; app calls RunPod `POST /pods` to create a new Pod from the Cubric template, attaching the selected network volume. | STARTING → (polling) → RUNNING | App (creates, will later stop) | Progress indicator: "Creating remote engine…"; data-center + GPU confirmation shown before creation. |
| **Existing stopped Pod (normal path)** | At the ComfyUI-start trigger (the existing `comfy:ready` boot path, routed to remote): app calls RunPod `POST /pods/{id}/start`. Polls until wrapper `/health` responds. | EXITED → STARTING → (polling) → RUNNING | App (resumes, will later stop) | Progress indicator: "Starting remote engine…"; estimated cost/hour shown; stale-runtime warning suppressed — polling handles it silently. |
| **Existing running Pod (relaunch after crash)** | App reads persisted Pod ID on launch; RunPod status = RUNNING; wrapper `/health` confirms reachable. App resumes using the existing Pod without re-starting it. | RUNNING (unchanged) | App (on next clean quit or watchdog) | Yellow banner: "Remote engine was already running — resumed. GPU billing was active since [last-seen time]." Offer: keep / stop now. |
| **Failed start — Pod stays EXITED or errors** | Start/resume call returns or times out without wrapper becoming healthy. App retries once. After two failures, marks remote engine unavailable. | EXITED or ERROR | Idle watchdog (if Pod partially started) or no billing | Error card: "Remote engine failed to start (reason from RunPod API). [Retry] [Open RunPod console] [Use local engine]". No generation is attempted. |
| **Failed start — RunPod API unreachable** | App cannot reach RunPod REST API (network down, API outage). Same retry logic. | Unknown (unchanged on RunPod side) | App had no chance to start; billing unchanged from previous state | Error card: "Cannot reach RunPod. Check internet connection." If a Pod was already RUNNING, idle watchdog will stop it after 15 min of no app traffic. |
| **App crash / force-kill** | Electron quit handler never runs. No stop call is made. | RUNNING → (watchdog fires) → EXITED | **Idle watchdog** stops the Pod after 15 minutes of no authenticated traffic. | On next app launch: banner "Remote engine auto-stopped by idle watchdog after the app closed unexpectedly." Residual GPU billing window = up to 15 min after crash. |
| **Network loss mid-generation** | WebSocket/proxy connection drops. `commandExecutor` already handles local WS reconnect; remote mode follows the same reconnect loop against the Express backend proxy. If the backend proxy cannot reach the wrapper for > 60 s, generation is marked failed locally. | RUNNING (Pod is unaffected by client network loss) | Idle watchdog (if client never reconnects — timer resets on reconnect) | Generation error card: "Connection to remote engine lost." Offer: retry / stop remote engine. Pod keeps running and watchdog timer resets on each reconnect attempt that reaches the wrapper. |
| **Network loss mid-generation (client reconnects)** | App restores connection; backend proxy re-attaches to wrapper WS. In-progress generation resumes (ComfyUI continues server-side; wrapper re-streams events). | RUNNING (unchanged) | App (on next quit) | Brief "Reconnecting…" indicator; generation resumes without restart if ComfyUI still processing. |
| **User quit — clean** | Electron `before-quit` handler fires. App calls `POST /pods/{id}/stop` via Express backend (not renderer). Shows "Stopping remote engine…" in quit dialog. Proceeds with quit whether or not the stop call succeeds (timeout = 8 s). | RUNNING → EXITED | App (stop call) — **storage billing continues** | Quit dialog: "Stopping remote engine… [GPU billing will end; storage billing continues until volume is deleted]". If stop call times out, shows "Could not confirm stop — remote engine will auto-stop within 15 minutes via idle watchdog." |
| **User quit — Pod already stopped** | No RunPod call needed. Quit proceeds immediately. | EXITED (unchanged) | N/A (already stopped) | No extra dialog. |
| **User explicitly deletes Pod** | User triggers "Delete Pod" action in settings. App calls RunPod `DELETE /pods/{id}`. Clears persisted Pod ID. | Deleted | User-must-act for network volume storage billing | Confirmation dialog: "This deletes the Pod. **Your network volume ([name]) continues to bill [$/hr] for storage until you delete it in the RunPod console.** [Confirm Delete] [Cancel]". |
| **User deletes network volume (out-of-app)** | User deletes volume in RunPod console while Pod is stopped. On next app launch, the stored Pod ID may reference a deleted Pod or a Pod that can no longer attach its volume. | Invalid / incompatible | User-must-act (already done out-of-band) | Launch: compatibility check fails → "Remote engine volume not found. [Create new setup] [Disconnect]". |
| **App quits while Pod start is in progress** | Race: user quits during the "Starting remote engine…" polling phase. App attempts a stop/cancel call; if the Pod ID is already assigned it sends `POST /pods/{id}/stop`. | STARTING → (stop attempted) | App (attempted stop) + idle watchdog as backstop | "Cancelling remote engine start…"; warning: "If the engine had already started, it will auto-stop within 15 minutes." |
| **GPU type unavailable (no Secure Cloud stock)** | RunPod `POST /pods` (or `start`) returns availability error. App does not retry automatically. | No Pod created (or stays EXITED) | N/A | Error card: "Requested GPU not available in Secure Cloud. [Choose different GPU] [Try again later] [Use local engine]". GPU preference is saved; user can change it. |
| **Template/volume manifest mismatch** | Pod starts; wrapper `/health` returns a manifest incompatibility flag. App refuses to submit generation. Pod is stopped automatically. | RUNNING → (app stops it) → EXITED | App (auto-stops on manifest mismatch) | Modal: "Remote engine is incompatible with this app version. [Repair / Reinitialize Volume] [Cancel]". Repair flow is Phase 3. |

---

## Idle Watchdog Specification

### Why this exists

Electron `before-quit` and `will-quit` handlers cannot be awaited reliably when the process is force-killed, OOM-killed, or the OS shuts down. If Electron dies mid-session without an 8-second stop-call window, the Pod keeps running and billing the user indefinitely with no app-side recourse. The idle watchdog is the only reliable crash backstop.

### Timeout value: 15 minutes (inference)

**Reasoning:**

- Must be long enough to survive normal transient interruptions (network blip, slow machine, user stepping away) **and long inference runs** — some video generations take several minutes — without stopping a live session.
- Short enough that a crash does not bill excessively. RunPod bills per-minute; 15 minutes caps the worst-case crash overage at 15 minutes of GPU time.
- Must not fire during a long generation. The wrapper keeps the timer alive via generation-active signals (see below), so the 15-minute idle window only starts counting when the wrapper is genuinely idle — no active generation AND no authenticated heartbeat.
- **15 min is the v1 inference value (user decision 2026-06-11).** 12 min is recorded as the future baseline once LoRA training lands, at which point the policy may need to change (training has different idle/active semantics). The value is centralized in the wrapper config so it can be revisited without a redesign.

### What counts as authenticated traffic (resets the timer)

Any HTTP request or WebSocket message that passes token verification at the wrapper layer resets the idle countdown:

- `GET /health` (backend proxy sends this on a regular heartbeat interval — see below)
- `POST /prompt` (workflow submit)
- `POST /upload/*` (asset upload)
- `GET /view` (output fetch)
- `POST /interrupt`, `POST /queue/*`
- Any WebSocket `ping` frame from an authenticated connection
- `POST /staging/*` (latent/preview staging)

Unauthenticated requests (wrong or missing token → 401) do NOT reset the timer. This prevents an external scanner from keeping the Pod alive.

### How a long-running generation keeps the Pod alive

Two layers:

1. **Generation-active heartbeat (wrapper-internal):** While ComfyUI is executing a workflow (between `POST /prompt` and the final `executed` event), the wrapper internally marks itself as generation-active and suppresses the idle timer entirely. No external heartbeat needed during active generation. When the `executed` (or error) event fires, generation-active clears and the idle timer starts from zero.

2. **App-side periodic heartbeat:** The Express backend proxy sends `GET /health` to the wrapper every **3 minutes** while the remote engine is connected (regardless of whether a generation is running). This keeps the timer from expiring during idle-but-connected sessions (user is thinking, browsing the gallery, writing a prompt). Three minutes is well under the 15-minute threshold, giving four missed heartbeats before watchdog fire — tolerating temporary network loss without stopping the Pod.

### Watchdog implementation contract (for Phase 2)

The wrapper process must implement:

```
IDLE_TIMEOUT = 15 min   # v1 inference value; config-driven, not hard-coded inline
idle_deadline = now + IDLE_TIMEOUT
generation_active = false

on authenticated_request:
    if not generation_active:
        idle_deadline = now + IDLE_TIMEOUT

on prompt_submitted:
    generation_active = true

on generation_finished_or_errored:
    generation_active = false
    idle_deadline = now + IDLE_TIMEOUT

background_loop (every 60s):
    if not generation_active and now >= idle_deadline:
        call RunPod self-stop API
        exit wrapper process
```

The self-stop call uses the RunPod REST API with the user's API key (passed to the Pod via a secure environment variable at deploy time — see `secret-storage.md`). The wrapper must have the API key + its own Pod ID available at runtime to issue the self-stop.

### Watchdog failure modes

| Failure | Effect | Mitigation |
|---|---|---|
| Wrapper process crashes before watchdog fires | Pod stays running indefinitely | Pod-level `--restart on-failure` in Docker run args prevents silent restart of a hung wrapper — a crashed wrapper means ComfyUI is also unavailable, so billing with no utility. User should be informed on reconnect. |
| RunPod self-stop API call fails (network issue) | Pod keeps running past deadline | Wrapper retries stop call 3× at 60-second intervals before giving up. If all retries fail, it logs and exits the process — Pod may stay running but the wrapper is gone, so no further billing utility. |
| API key not available in wrapper env | Watchdog cannot call stop | Wrapper emits a startup warning in its log; app reads this from `/health` and shows a warning: "Idle watchdog is disabled — API key not configured in Pod. Pod will not auto-stop on disconnect." Treated as a configuration error at deploy time. |

---

## Start/Resume Stale-Payload Polling Policy

RunPod can return incorrect/stale runtime data (wrong public URL, missing port mapping) immediately after a start/resume call returns. This is a known issue confirmed by the OneTrainer reference implementation.

**Policy:** After issuing `POST /pods/{id}/start`, the app does NOT use the runtime data from the start response. Instead:

1. Poll `GET /pods/{id}` (RunPod status API) until `desiredStatus = RUNNING` and `runtime.uptimeInSeconds > 0`.
2. Extract the public proxy URL from `runtime.ports` only after condition 1 is satisfied.
3. Issue `GET /health` to the wrapper at the extracted URL. Retry every 5 seconds for up to 3 minutes.
4. Only when `/health` returns HTTP 200 with a valid token-verified response is the Pod considered ready.

Do not trust the proxy URL until `/health` succeeds. If `/health` does not succeed within 3 minutes, treat as a failed start (see state table row "Failed start").

**Why 3 minutes:** Pod cold-start (container pull on first deploy) can take 1–2 minutes; warm restart (stopped Pod resuming) is typically under 60 seconds. 3 minutes allows for slow container starts on busy data centers without blocking the user indefinitely.

---

## User-Visible Billing Warnings — Required Surfaces

These warnings must appear at the following points; they are required for Phase 5 documentation but the UX copy must be present by Phase 4's "verify lifecycle cleanup" step:

| Trigger | Warning Text (draft) | Location |
|---|---|---|
| App open, RunPod section active | "Your RunPod section is active — when ComfyUI starts you will be using your RunPod credits." | Advisory pop-up (dismissable; not a connect gate) |
| Before Pod creation | "Creating a remote engine will charge your RunPod account at approximately $[cost]/hr for GPU + $[storage_cost]/hr for volume storage while running." | Settings confirmation modal |
| Delete network volume confirmation | "Deleting this network volume removes all installed models and cache. You will need to re-download models next time. This also frees a data-center slot so you can pick a different GPU family. **[Confirm Delete] [Cancel]**" | Volume delete modal |
| At app quit while Pod RUNNING | "Remote engine is running. Stopping it now — GPU billing will end. **Storage billing (\$[rate]/hr) continues until you delete the network volume in your RunPod console.**" | Quit confirmation overlay |
| Stop confirmation (manual) | "GPU billing will stop. Storage billing continues." | Settings stop button tooltip / confirm |
| Delete Pod confirmation | "Deleting the Pod. **Your network volume ([id]) continues to bill for storage until you delete it at runpod.io.**" | Delete modal |
| Crash/watchdog recovery (next launch) | "Your remote engine was stopped automatically after the app closed. Check your RunPod console for any residual charges." | Launch-time banner (dismissable) |
| API key missing in Pod env (watchdog disabled) | "Idle watchdog is disabled. If the app crashes, your Pod will keep running and billing until you stop it manually at runpod.io." | Settings warning badge |

---

## Policy Choices — RESOLVED (user, 2026-06-11)

1. **Stop-vs-delete on quit default:** **Stop** (preserves volume attachment, faster next start). Volume delete is a separate explicit action (see below). ✅ decided.

2. **Connection model:** No "Connect" button, no auto/explicit-connect distinction. RunPod gated by a **Settings → RunPod master toggle** (off by default). When on, app open shows an **advisory pop-up** ("RunPod section active — ComfyUI start will use your RunPod credits"). The Pod starts at the **existing ComfyUI-start trigger** (`comfy:ready` boot path, routed to remote). ✅ decided.

3. **Network volume delete:** First-class user action in settings (required for switching data center / GPU family, since a volume is locked to one data center and each data center has only a subset of cards). Warns that models must be re-downloaded. ✅ decided.

4. **Watchdog timeout:** **15 minutes** for v1 inference (long video runs). 12 min recorded as the future LoRA-training baseline. Config-driven in the wrapper, not hard-coded inline. ✅ decided.

5. **Heartbeat interval:** 3 minutes (app sends `GET /health` to wrapper every 3 min when connected). Internal implementation detail, not user-facing.

6. **Crash-recovery banner:** Show on next launch if last session ended without a confirmed stop call. For v1, always show.
