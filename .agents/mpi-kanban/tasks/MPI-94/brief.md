# MPI-94 — RunPod UX polish + fresh-volume init

> Promoted from MPI-64 at epic close (2026-06-15). **Unbuilt work** — each item needs
> code or a decision (not just a live-Pod tick; those are MPI-93). Full narrative:
> `tasks/MPI-64/OPEN-ITEMS.md` (§ F, § G, § L) + `current-architecture.md`.

## Items (app-side unless tagged [rebuild])

- [ ] **F4 — Fresh-volume initialization + bundle versioning.** `[app]` + maybe `[rebuild]`.
      Cubric dir layout + the first manifest written Pod-side by the wrapper init script;
      refuse to run against a stale workflow/custom-node bundle + an approved repair path.
      The wrapper-coupled half pairs with the MPI-90 manifest-compat gate (read side).

- [ ] **L5 — Status-poll false-negative flips UI to `local·offline` for one tick mid-download.**
      `[app]` renderer-only. The connection feed (`_initRemoteConnectionFeed`, js/shell.js) polls
      `/remote/comfy/status` every 5s with a 4s timeout; under download load one failed/timed-out
      tick emits `connected:false` → hero/status bar flips to local for one tick → next poll
      recovers. FIX: require N consecutive failed/not-ready polls before flipping disconnected,
      and/or treat a known-active download as keep-alive. Distinct from A1 (real WS death).
      **Stakes raised by MPI-85** (local-fallback) — a false offline now has more consequence.

- [ ] **L4 — No download-speed (MB/s) readout in remote mode.** `[app]` (+ maybe wrapper
      `[rebuild]`). Local downloads show live MB/s; remote (wrapper aria2c) shows only the size
      bar. Derive bytes/sec from successive `models:install-progress` ticks (no rebuild) or carry
      a native rate in the SSE, then map onto the existing local `download:*` speed field.

- [ ] **L3 — Connect-ETA messaging (first-boot-compile vs warm-resume).** `[app]`. MOSTLY
      RESOLVED — the CREATE-path copy is good ("First-time setup… one time, a few minutes"). The
      only residual: confirm the BOOT auto-reconnect path's flat ~90-120s ETA is accurate or make
      it distinguish first-boot-compile from warm-resume. Low priority.

- [ ] **G1 — Downgrade the "Restarting ComfyUI" restart-info modal → plain info toast.** `[app]`.
      It reuses the `ui:error` bug-reporter modal (Report-on-GitHub + Error Summary) for an INFO
      event. (User chose to KEEP the B4-drop modal as-is; this is the restart-info one only.)

- [ ] **G2 — "Stopping…" toast** for the ~5s gap between Stop and the Pod actually interrupting.
      `[app]`.

- [ ] **G6 — First-connect-on-a-new-image-tag 504** (image pull > 300s timeout; reconnect
      warm-resumes) + GPU-availability-refresh-on-dropdown-open. `[app]`. (The image-pull PROGRESS
      display is the separate MPI-87 card; this is the 504 timeout + dropdown refresh.)

- [ ] **G4 — aria2c fast model download.** `[rebuild]` — wrapper `_run_install` → aria2c
      (`-x16 -s16`, ~10-40× the httpx path) with httpx fallback; Dockerfile apt installs `aria2`.
      Biggest remote-UX win. = **MPI-75 candidate #2** — fold into the MPI-75 image rebuild rather
      than re-implement here; listed for completeness.

## Relationships
- F4 read-side gate = **MPI-90**. G4 + cache/free = **MPI-75** (image rebuild). Weight bakes
  (interpolate/upscale/mask remote) = **MPI-81**. This card is the leftover app-side polish.
