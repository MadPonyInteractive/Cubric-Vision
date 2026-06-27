# MPI-93 — RunPod remote live-verification checklist

> Promoted from MPI-64 at epic close (2026-06-15). **Verification-only.** Every item
> below is already coded + committed; the work is to run it on a live Pod and tick.
> Source of truth for the full narrative: `tasks/MPI-64/OPEN-ITEMS.md` (§ M + the
> referenced items) and `tasks/MPI-64/current-architecture.md`.

## How to use this card
Pick it up only when a live RunPod Pod is already up for other work. Tick + date +
Pod/GPU when each passes. None of these needs code — if a verify FAILS, that is a new
finding: log it and (if it needs code) open/repoint a card.

## Items

- [ ] **M4 — Cancel / interrupt a remote gen mid-run.** Never exercised remotely (B2 open
      half). Submit a remote gen, hit Stop/Interrupt mid-diffusion → the gen ends cleanly,
      the Cue clears, no orphaned prompt, UI returns to idle. Path: `POST /proxy/interrupt`
      + `/proxy/queue {clear}` (comfyController renderer-direct → remoteProxy forward).

- [ ] **M5 — Higher-res / longer T2V on a 64GB+ Pod.** Minimal T2V already hit ~92-94% RAM
      on L4/5090 (B2). Run a bigger/longer T2V on a 64GB+ container → completes without OOM.
      Confirms the RAM-wall advice (memory: project_video_gen_ram_wall) + that big Pods clear
      it. Ties to D1 cache policy (MPI-75).

- [ ] **A3 — OOM-toast live-verify.** Code committed (`31eb419` commandExecutor soft-503 toast
      branch; `12992c3` comfyController 503 classify + shell.js comfyReady gate). DEFERRED at
      SESSION 8 because the weak test GPU was reclaimed. Force a container-OOM (push a gen past
      a small Pod's container-RAM cap), then fire a gen during the ComfyUI re-init window →
      expect a SOFT "engine restarting after a memory spike — try again" toast (NOT the
      bug-reporter "ComfyUI Error" modal), and the status bar auto-repaints `REMOTE · ONLINE`
      on recovery without a manual toggle. (Detection half already PASS — M6. Pod-DEATH recovery
      is NOT tracked — reactive.)

- [ ] **F8 — Crash-watchdog backstop.** Delete-on-quit PASS (live 2026-06-14). REMAINING:
      (a) box-OFF warm-stop (EXITED) path; (b) simulated-crash → the wrapper's ~15min idle
      idle-watchdog self-stops the Pod (the safety net for app crash/kill where main.js teardown
      can't run). Confirm the Pod transitions to STOPPED after ~15min of no authed traffic.

- [ ] **G5 — Step 4.3.1 volume-delete-with-attached-Pod.** Code is in; live verify deferred.
      Delete a volume while a Pod is attached → the flow deletes the attached Pod FIRST, then
      the volume; both gone in the console, no "volume attached" error.

## Out of scope
Anything that needs unbaked weights (interpolate/upscale/auto-mask remote) is B4 → **MPI-81**
image rebuild, not this card. Anything that needs code is **MPI-94** (polish/build) or its own card.
