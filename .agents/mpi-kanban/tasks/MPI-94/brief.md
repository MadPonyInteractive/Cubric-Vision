# MPI-94 — RunPod UX polish + fresh-volume init

> Promoted from MPI-64 at epic close (2026-06-15). **Unbuilt work** — each item needs
> code or a decision (not just a live-Pod tick; those are MPI-93). Full narrative:
> `tasks/MPI-64/OPEN-ITEMS.md` (§ F, § G, § L) + `current-architecture.md`.

> **STATUS 2026-06-15 — 6/8 DONE, card parked (UNBLOCKED, ready to resume).** L5+G2 (committed
> d11e628, live-verified), L4 (committed feeabab, unverified on live dl), G1/G4/G6 already-done.
> The last 2 — **F4** and **L3** — were blocked on MPI-88's `_initRemoteBoot`/MpiSettings/
> remoteProxy rewrite; **MPI-88 is now DONE + committed (57f3d8e), working tree clean → base is
> stable, F4/L3 UNBLOCKED.** Rebase L3's copy on the final `_initRemoteBoot` warm-vs-create
> branch (the `warm`/`canAutoReconnect` flag). Both are app-side — ZERO impact on the MPI-81
> rebuild.

## Items (app-side unless tagged [rebuild])

- [ ] **F4 — Fresh-volume initialization + bundle versioning.** `[app]` + maybe `[rebuild]`.
      **✅ UNBLOCKED 2026-06-15** (MPI-88 done/committed 57f3d8e — its volume / remoteProxy /
      MpiSettings work is in). Still couples MPI-90 (read-side gate) — coordinate that. Ready to start.
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
      **✅ UNBLOCKED 2026-06-15** — `_initRemoteBoot` (js/shell.js) is now committed + stable
      (MPI-88 57f3d8e, MPI-87 7e5422d). The residual copy should key off the final `warm` /
      `canAutoReconnect` branch. Ready to start.

- [x] **G1 — Downgrade the "Restarting ComfyUI" restart-info modal → plain info toast.**
      **ALREADY DONE — verified 2026-06-15, no code needed.** The restart-info already emits
      `ui:info` (comfyController.js:197 → `StatusBar.notify(…, 'info')` toast), not the `ui:error`
      bug-reporter modal. `ui:error` there is reserved for genuine start FAILURE (line 254), which
      correctly stays a modal. Brief snapshot predated the MPI-64 modal→toast pass.

- [x] **G2 — "Stopping…" toast** — **REVERTED 2026-06-15 (user feedback). Net result: NO toast.**
      Originally shipped a remote-only `ui:info` "Stopping…" toast in `interrupt()` (d11e628,
      live-verified). User then judged it noise — a user-initiated Stop should not raise a toast at
      all. Removed at source (commit b425fa1): `interrupt()` is only ever the user-Stop path (every
      caller is a `cancel()`), so no toast belongs there. (Other call sites had grown `_settled`
      guards to avoid flashing it on no-op cancels — those can simplify later, left untouched.)
      The original G2 spec — ADD a toast for the Stop→interrupt gap — is closed as "won't do".

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
