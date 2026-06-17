# MPI-107 — Validation

## Fix (app-side only, no Pod rebuild)
`js/services/comfyController.js`:
1. Remote per-model restart poll now gates on `s.ready && (s.comfyReady === undefined || s.comfyReady)` (was bare `s.ready`). Matches the shell.js:653 connection gate + the line-312 comment intent. `=== undefined` keeps old-image compat.
2. `_ensureRemoteReady` probe retries 3×/700ms before concluding not-ready, so only a PERSISTENT not-ready falls to local (genuine OOM/disconnect — MPI-85), not a transient wrapper 503 right after a Cancel/interrupt.

## Live verification — 2026-06-17, RTX L40S, Pod image v0.4.8
Full original repro reproduced, bug GONE:

1. Started WAN 2.2 I2V SMOOTH gen (remote). → ran on Pod.
2. **Cancelled mid-gen** (Stop → `/proxy/interrupt`). Console logged `[generationService] Generation completed but no output returned` — the cancelled gen, expected.
3. **Changed ratio** (param tweak).
4. **Re-Cue.** → regenerated ON THE POD at the new ratio (320×320, tile `i2v_ms_024`, 19s).

Result:
- Bottom bar stayed **IDLE/GENERATING · REMOTE** throughout — never dropped to LOCAL.
- **NO "generating locally" toast** (the original symptom — gone).
- **NO "still loading new nodes" false timeout.**
- Toast: "DONE · Generation finished in 25s" + "Generation complete · i2v_ms finished."
- `/remote/comfy/status` healthy all session: `{running:true, ready:true, comfyReady:true, connecting:false, noGpu:false}`.

The `completed but no output returned` log line — which in the original session immediately preceded the silent local-drop — was this time harmless (cancelled gen only, no fallback).

## Case (a) vs (b): confirmed (a)
Pure app-side bug. Pod ComfyUI was healthy (`comfyReady:true`). No Pod rebuild required.

## Out of scope (not MPI-107)
- "Stage 1 rerun finished but latent not produced" (i2v preview multistage) → tracked in MPI-89.
- `/remote/pod/reconnect` deletes warm Pod on transient GPU stock-out → NOT carded (user decision); breadcrumb in memory `project_reconnect_deletes_warm_pod.md`. This was the real cause of the earlier "lost my Pod" confusion (RunPod GPU stock-out + delete-recreate churn), not reload and not delete-on-quit (which was OFF).

## Status: COMPLETE + accepted (user verified in-app)
