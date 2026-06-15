# MPI-94 — RunPod UX polish + fresh-volume init

> Promoted from MPI-64 at epic close (2026-06-15). **Unbuilt work** — each item needs
> code or a decision (not just a live-Pod tick; those are MPI-93). Full narrative:
> `tasks/MPI-64/OPEN-ITEMS.md` (§ F, § G, § L) + `current-architecture.md`.

## Items (app-side unless tagged [rebuild])

- [ ] **F4 — Fresh-volume initialization + bundle versioning.** `[app]` + maybe `[rebuild]`.
      Cubric dir layout + the first manifest written Pod-side by the wrapper init script;
      refuse to run against a stale workflow/custom-node bundle + an approved repair path.
      The wrapper-coupled half pairs with the MPI-90 manifest-compat gate (read side).

- [x] **L5 — Status-poll false-negative flips UI to `local·offline` for one tick mid-download.**
      **DONE (2026-06-15).** `_initRemoteConnectionFeed` (js/shell.js) now debounces the offline
      flip: `MISS_THRESHOLD = 3` consecutive failed/not-ready polls before broadcasting
      disconnected, AND an active remote download (tracked via `download:started`/`:progress` vs
      `:complete`/`:failed`/`:cancelled`) is treated as keep-alive (suppresses the flip entirely
      while downloading). The CONNECTED edge still repaints immediately — only the bad edge is
      debounced. The genuine engine-drop path (`_initEngineDropRecovery`, sticky
      `phase:'disconnected'`) is separate and unaffected.
      **LIVE-VERIFIED 2026-06-15** on a connected Pod: status bar held `IDLE · REMOTE`, no
      false `local·offline` flip during gen/stop.

- [x] **L4 — No download-speed (MB/s) readout in remote mode.**
      **DONE (2026-06-15) — app-only, NO rebuild.** `downloadService.js` `download:progress`
      handler now derives MB/s client-side when `data.speed` is empty (the remote/aria2c case):
      `_deriveSpeed(modelId, downloadedBytes)` computes byte-delta / time-delta between successive
      ticks, formats with a local-matching `_formatSpeed` (X.X MB/s / X KB/s / X B/s), and fills
      both `job.speed` and the emitted `data.speed` so the existing local download UI renders it
      unchanged. Per-model samples in a module `_speedSamples` Map, dropped on
      complete/failed/cancelled. No-op for local (speed already set). Chosen the no-rebuild path
      (derive from ticks) over carrying a native rate in the wrapper SSE.
      **UNVERIFIED on a live remote download** — needs a real remote model install to confirm the
      rate renders; code-verified + eslint clean.

- [ ] **L3 — Connect-ETA messaging (first-boot-compile vs warm-resume).** `[app]`. MOSTLY
      RESOLVED — the CREATE-path copy is good ("First-time setup… one time, a few minutes"). The
      only residual: confirm the BOOT auto-reconnect path's flat ~90-120s ETA is accurate or make
      it distinguish first-boot-compile from warm-resume. Low priority.

- [x] **G1 — Downgrade the "Restarting ComfyUI" restart-info modal → plain info toast.**
      **ALREADY DONE — verified 2026-06-15, no code needed.** The restart-info already emits
      `ui:info` (comfyController.js:197 → `StatusBar.notify(…, 'info')` toast), not the `ui:error`
      bug-reporter modal. `ui:error` there is reserved for genuine start FAILURE (line 254), which
      correctly stays a modal. Brief snapshot predated the MPI-64 modal→toast pass.

- [x] **G2 — "Stopping…" toast** for the ~5s gap between Stop and the Pod actually interrupting.
      **DONE (2026-06-15).** `ComfyUIController.interrupt()` (comfyController.js) now emits a
      remote-only `ui:info` "Stopping…" toast at the start of the interrupt (gated on
      `remoteEngineClient.isRemote()` — local interrupt is instant, no gap). Single chokepoint:
      all Stop paths route through `interrupt()`.
      **LIVE-VERIFIED 2026-06-15** on a connected Pod: "Stopping… the remote engine is
      interrupting the current step." toast appeared on Stop during a remote I2V gen.

- [x] **G6 — First-connect-on-a-new-image-tag 504 + GPU-availability-refresh-on-dropdown-open.**
      **ALREADY DONE — verified by code read 2026-06-15, no code needed** (both halves landed in
      the MPI-64 connect-flow rework; brief snapshot predated it).
      (a) **504:** the create/reconnect backend now returns immediately with `starting` (no 504 on
      a long first-image pull); the renderer owns the wait via `_pollEngineReady` in MpiSettings.js
      (20-min timeout = 1200000ms, covers the ~3GB pull + one-time sageattention compile) with a
      ~150s slow-signal "downloading the engine" message. Boot path mirrors this.
      (b) **dropdown refresh:** `gpuInst.on('open', …)` (MpiSettings.js) re-fetches
      `/runpod/gpu-availability` (DC-scoped) and rebuilds the GPU options in place every time the
      picker opens. Both confirmed present in HEAD (not part of MPI-88's in-flight edits).
      (The image-pull PROGRESS display is the separate MPI-87 card.)

- [x] ~~**G4 — aria2c fast model download.** `[rebuild]`~~ **DONE (2026-06-15)** — shipped in
      the current Pod images as MPI-75 batch item #2 (v0.4.0). Already live; struck from this card.

## Relationships
- F4 read-side gate = **MPI-90**. G4 + cache/free = **MPI-75** (image rebuild). Weight bakes
  (interpolate/upscale/mask remote) = **MPI-81**. This card is the leftover app-side polish.
