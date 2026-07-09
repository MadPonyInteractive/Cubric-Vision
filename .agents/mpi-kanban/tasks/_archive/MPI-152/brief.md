# MPI-152 — v0.26 WS-event protocol regression

## Symptom
After bumping ComfyUI v0.25.1 → v0.26.0 (MPI-139 floor), a remote LTX gen
**completes on the Pod** (Pod log: `Prompt executed`, video lands in gallery)
but the **app never settles**: status stuck "LOADING MODEL", gallery card
spins forever, gen clock counts endlessly. v0.8.1 (v0.25.1) did NOT do this.
Floor-blocker for the v0.26 bump.

## Root cause (proven from live WS capture + v0.26 source)
v0.26 renamed/reshaped the ComfyUI WebSocket execution events. The app AND the
Pod wrapper still listen for the v0.25.1 event names → completion + progress
signals never recognized.

| v0.25.1 (old) | v0.26.0 (new) | Breaks |
|---|---|---|
| `progress` `{value,max,node}` | `progress_state` `{prompt_id, nodes:{id:{value,max,state}}}` | status/progress + sampling-start (app `commandExecutor.js:1106`); wrapper `ModelInitSynth` (`wrapper.py:386`, fires model-init-complete on `progress>0`) |
| `executing` with `node===null` (terminal) | `execution_success` `{prompt_id}` (`execution.py:815`, `broadcast=False`) | Promise-resolve (`comfyController.js:975`); gallery swap `exec.onComplete` (`commandExecutor.js:1139`); wrapper `watchdog.gen_end()` (`wrapper.py:1470`) |

Plus: the model-init SSE channel (`/comfy/events/stream`) reconnect-loops every
~2min during long gens (cosmetic-ish; separate from the WS that carries
completion — the WS stays alive through the sampler and resumes).

## Confirmed NON-issues (do not chase)
- `model_type FLUX` log line for LTX — normal (LTX uses the DiT/Flux arch class).
- Slow load / CPU-offloaded Gemma encoder / lowvram transformer thrash — that is
  MPI-146 (per-card VRAM perf), aggravates the hang's visibility but is NOT the
  cause. The hang reproduces on a FAST warm-Pod gen too.

## Still to investigate (the fan-out)
- Node renames (#14547) + category changes (#14460) vs the baked LTX-2.3
  workflow `class_type` refs — does the workflow still load on v0.26?
- Other v0.26 WS events the app consumes (preview frames, `status`, error shapes).
- v0.26 HTTP API/route shape changes the app or wrapper call (`/prompt`,
  `/history`, `/object_info`).

## Fix surfaces (after research)
- App: `js/services/commandExecutor.js` (progress_state map + execution_success
  for onComplete), `js/services/comfyController.js` (execution_success resolve —
  partial fix in place + temp WSDBG debug to REMOVE).
- Wrapper (mpi-ci): `cubric-vision-pod/wrapper/wrapper.py` (gen_end + synth) —
  needs a wrapper bump + image rebuild to ship.
- Keep BOTH old + new event handling (engine-version-agnostic) — local may still
  be on a different engine version than a Pod.
