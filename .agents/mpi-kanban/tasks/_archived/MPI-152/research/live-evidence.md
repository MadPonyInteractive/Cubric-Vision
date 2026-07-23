# MPI-152 — live evidence (2026-06-26)

Captured from a temp WSDBG/WSDBG2 logger added to `comfyController.js`
`internalListener` (logs every non-preview WS msg the renderer receives) +
direct Pod-source greps. Pod `vnque097lez1tt` (RTX 4090, cu124, v0.9.0 image,
ComfyUI 0.26.0).

## `progress_state` shape (v0.26) — the NEW progress event
```json
{
  "prompt_id": "225f1fd7-...",
  "nodes": {
    "1":  {"value":1, "max":1, "state":"finished", "node_id":"1", "display_node_id":"1", "parent_node_id":null, "real_node_id":"1", "prompt_id":"..."},
    "3":  {"value":0, "max":1, "state":"running",  "node_id":"3", ...},
    "12": {"value":1, "max":1, "state":"finished", ...}
  }
}
```
- Batched per-node map (NOT the old flat `{value,max,node}`).
- Per node: `value`/`max` (step progress) + `state` ∈ {`running`,`finished`}.
- To compute overall %: aggregate across `nodes` (sum value / sum max, or count
  finished/total), gated to work nodes like the old aggregator did per-node.
- Sampling-start detection: a terminal-phase work node transitions to
  `state:"running"` with `value>0` (replaces the old per-node `progress>0` test).

## Terminal completion — `execution_success`
- v0.26 source `execution.py:815`:
  `self.add_message("execution_success", { "prompt_id": prompt_id }, broadcast=False)`
- The old `executing` with `node===null` is NO LONGER sent. Live capture: every
  `executing` event carried a real node id; ZERO with node=null; ZERO
  `execution_success` reached the app across multiple gens — BUT see caveat.
- CAVEAT: in the captures the gen had not fully finished on the Pod when the log
  was read (post-sampler nodes 7/8/265-269 were still firing). Need a confirmed
  end-to-end capture that the `execution_success` frame DOES cross the wrapper WS
  relay to the app once the gen truly completes. The relay (`wrapper.py:1466`)
  forwards ALL text frames verbatim (no allowlist) so it SHOULD pass; confirm.
- `executed` events (per output node) STILL fire in v0.26 (`execution.py:575`) —
  output-URL collection still works; only the terminal settle is broken.

## Other v0.26 source facts (terminal/exec events, execution.py)
- 431/575: `executed` { node, display_node, output, prompt_id } — still sent.
- 493: `executing` { node, display_node, prompt_id } — per-node, never node=null.
- 533/708: `execution_error` — still sent (app handler OK).
- 815: `execution_success` { prompt_id }, broadcast=False — NEW terminal.

## Wrapper (mpi-ci cubric-vision-pod/wrapper/wrapper.py) — also broken on v0.26
- `1470`: `if t == "executing" and data.node is None: watchdog.gen_end()` — never
  fires on v0.26 → wrapper gen-watchdog never sees gen end.
- `386` `ModelInitSynth.observe`: emits `comfy:model-init-complete` on
  `etype=="progress" and value>0` — v0.26 sends `progress_state`, not
  `progress` → model-init-complete never synthesized → SSE "LOADING MODEL"
  overlay never clears from the SSE side either.
- `1466`: WS relay forwards every text frame verbatim (no type filter) — so new
  event names DO reach the app; the break is purely the app/wrapper not RECOGNIZING them.

## SSE reconnect-loop (separate, cosmetic-ish)
`/comfy/events/stream` relay (`remoteProxy.js:1407`) logged
`remote SSE stream aborted: terminated` every ~2min during gens
(14:05/14:07/14:10/14:12/14:25/14:33/14:39). This is the model-init SSE channel,
NOT the WS carrying completion. The WS stayed alive through the sampler and
resumed (events 14:37:14 → 14:39:22). Lower priority; tie to MPI-136.

## Reproduces independent of load speed
Hang seen on BOTH the slow cold-load gen AND a fast warm-Pod gen → confirms the
cause is the event-protocol rename, not the slow load (that's MPI-146).
