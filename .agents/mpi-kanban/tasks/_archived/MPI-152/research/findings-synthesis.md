# MPI-152 — research synthesis (4 agents, 2026-06-26)

## CORRECTION to the initial root-cause theory

The initial theory ("v0.26 RENAMED the WS events, app listens for old names") is
**WRONG**. Verified from v0.26 source:

- v0.26 sends BOTH `progress` (legacy) AND `progress_state` (new) — `main.py:430`.
  The app's `progressAggregator.js` already handles both. NOT broken.
- `execution_success` is NOT new to v0.26 — it existed in v0.25.1 too.
- `executing` with `node===null` — Agent 1 reports still sent in v0.26 (contradicts
  the live capture where we saw zero null sentinels; reconcile: likely the capture
  ended before gen-completion, OR the null sentinel + execution_success both fire at
  end and both were lost in the same reconnect window).
- `executed`, `execution_error`, `execution_cached`, binary preview (8-byte header)
  — ALL unchanged in v0.26. App handlers correct.

## ACTUAL root cause — connection lifecycle, not event rename

`execution_success` (and the terminal events generally) are sent **`broadcast=False`**
→ targeted ONLY to the submitting client's socket (`server.client_id`). ComfyUI does
NOT replay missed events to a reconnected client.

The REMOTE WS reconnects periodically mid-gen (the ~2min SSE/WS churn we observed —
`onclose` → `setTimeout(connect, 1000)` at comfyController.js:663). If the gen
completes during the ~1s reconnect window, the terminal event fires into the old/dead
socket and is lost → the gen Promise never settles → app hangs in "running"/"STARTING"
forever, even though the Pod finished and the output file exists.

The app's clientId is STABLE across reconnects (`crypto.randomUUID()` once, line 108),
so it's NOT a clientId-rotation bug — it's a missed-event-during-blip + no-replay bug.

My in-session `execution_success` matcher patch (comfyController.js:975, dual terminal
check) is CORRECT but INSUFFICIENT alone — it settles the gen IF the event arrives;
the bug is the event NOT arriving on reconnect.

## THE FIX — completion reconciliation via /history (Agent 3, HIGH confidence)

On WS reconnect while a gen is in flight, query ComfyUI `/history/{prompt_id}`:
- empty `{}` → still running, let WS events settle it
- `status.completed===true && status.status_str==="success"` → DONE: build URLs from
  `entry.outputs` (same shape as the `executed` event `output` → reuse
  `_collectComfyOutputUrls`) and resolve the gen
- `status.status_str==="error"` → reject with `status.messages`

Needs:
1. `wrapper.py` (mpi-ci): new `GET /wrapper/history/{prompt_id}` → forwards to
   `COMFY_HTTP/history/{prompt_id}` (analogous to `/wrapper/view`). NO such endpoint
   today → wrapper bump + image rebuild required.
2. `routes/remoteProxy.js`: new `GET /proxy/history/:promptId` passthrough.
3. `comfyController.js`: `_reconcileFromHistory(promptId)` called from `this._ws.onopen`
   when `_isRunning && _activePromptId` (add ~500ms settle delay). Store the Promise
   `resolve` in a new `_promptResolvers` Map (parallel to `_promptRejectors`) for clean
   settlement. Engine-agnostic (works local + remote; local httpBase already direct).

This is squarely MPI-136 (stall watchdog / silent-SSE-stall) territory — MPI-152's fix
IS the MPI-136 mechanism. Consider merging or cross-linking.

## /history response shape (v0.26, PROVEN from source)
```json
{ "<prompt_id>": {
    "prompt": [num, "<id>", {graph}, {client_id}, [outputs_to_execute]],
    "outputs": { "<node_id>": { "images":[{filename,subfolder,type}], "gifs":[...], "videos":[...] } },
    "meta": { "<node_id>": {node_id, display_node, parent_node, real_node_id} },
    "status": { "status_str":"success"|"error", "completed":bool, "messages":[] }
} }
```
Not-yet-in-history → body is `{}` (NOT 404).

## Node renames — NO breakage (Agent 2, HIGH confidence)
#14547 = display_name only, `class_type`/`node_id` UNCHANGED. #14460 categories =
UI-only. All baked LTX/Wan/SDXL workflow `class_type` refs valid on v0.26. The only
overlap (`PrimitiveStringMultiline` in SDXL t2i) is a display-name change, not a break.
→ Drop the "node rename" worry from the floor.

## Slow load — aimdo not initializing (Agent 4) → feeds MPI-145/146
BOMBSHELL: v0.26 `--lowvram` help text: **"Doesn't do anything if dynamic vram is
enabled."** v0.26's default dynamic-vram (aimdo / comfy_aimdo) should keep the text
encoder on GPU. The CPU-offloaded Gemma we observed means **aimdo is NOT initializing
on the Pod** (likely CUDA/package mismatch — aimdo wants torch 2.10 cu130-ish), so
`--lowvram` falls through to its real CPU-offload behavior.
- ACTION (MPI-145/146): on the next Pod, check ComfyUI startup stdout for `aimdo` /
  `dynamic` init lines. If aimdo is OFF, the fix is to ENABLE it + DROP `--lowvram`,
  not to tune lowvram. fp8 transformer (~20GB) + fp8 encoder (~7GB) fits a 24GB 4090
  with dynamic-vram. This reframes MPI-146 entirely.
- `--disable-dynamic-vram` is deprecated ("removed soon"); don't add it.
- PR #14577/#14594 = warning-text + Krea2 memory-factor only; NOT mem-mgr algorithm changes.

## Net plan
1. App-side: `_reconcileFromHistory` + `_promptResolvers` + `/proxy/history` (works for
   LOCAL immediately; remote needs the wrapper endpoint).
2. Wrapper-side (mpi-ci): `/wrapper/history` + bump wrapper 0.2.14→0.2.15 + rebuild
   (fold into the next Pod image build).
3. Keep my `execution_success` dual-terminal matcher (correct, belt-and-suspenders).
4. Remove temp WSDBG/WSDBG2 debug from comfyController.js.
5. MPI-145/146: investigate aimdo-not-initializing as the real load-speed cause.
6. Node-rename worry: CLOSED, no action.
