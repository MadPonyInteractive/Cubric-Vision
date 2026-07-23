# MPI-273 Plan — Semantic phase labels

## Goal
Status bar shows real phase names ("Loading model", "Generating", "Refining",
"Decoding", "Finishing") driven by `MpiLogger` nodes in the workflow, replacing
the generic `· N/M` stage counter. Label wins over N/M. Per-workflow opt-in.

## Mechanism (mirrors existing stdout sniffers)
The backend already regex-sniffs ComfyUI stdout and broadcasts SSE events
(`comfy:model-initializing`, `comfy:segment-total`, `comfy:tile-progress`,
`comfy:step-progress` in `routes/comfy.js`). The executor forwards those SSE
events to `tool:*` app events; `statusBar.js` maps them to label/bar updates.
We add ONE more of each: a `[MPI_PHASE] <label>` marker → `comfy:phase` SSE →
`tool:phase` event → `StatusBar.progress.updateLabel(label)`.

`MpiLogger` (already in the pack, `print(f"{prefix} {any}")`, `OUTPUT_NODE=True`)
is the emitter. Author sets `prefix = "[MPI_PHASE] Refining"` and wires its
`any` input to the node whose completion marks the phase boundary.

## Timing model (accepted)
A label fires when its wired-to node completes (ComfyUI dependency order), NOT
wall-clock. Author places each `MpiLogger` on the seam whose completion = "next
phase started". Good enough; finer needs per-node Python hooks — out of scope.

## Phases

### Phase 1 — Backend marker sniffer
`routes/comfy.js` `_handleComfyOutput`: add a `[MPI_PHASE]` regex BEFORE the
tqdm block, broadcast `comfy:phase { label }`, `return` (the line carries no
tqdm bar). Place near the model-init/SEGS checks.
- verify: unit-grep the regex against a sample `[MPI_PHASE] Refining` line.

### Phase 2 — Executor forward + renderer listener
- `commandExecutor.js`: add `comfy:phase` SSE listener (engine-filtered like the
  others) → `Events.emit('tool:phase', { tool: 'groupHistory', id, label })`.
- `statusBar.js`: add `Events.on('tool:phase', …)` → `updateLabel(label)`.
  Label persists until next marker; coexists with the bar fill; overrides the
  `· N/M` text.
- verify: live gen on the pilot workflow shows the label swapping.

### Phase 3 — Pilot workflow (USER owns the wiring)
User wires `MpiLogger` phase markers into ONE multi-stage workflow (their pick,
e.g. Krea2/LTX) in the raw LiteGraph source, reconverts to API. Agent does NOT
touch raw/. Live-watch the label sequence.
- verify: status bar cycles the authored phase names during a real generation.

### Phase 4 — (deferred, post-verify) Rollout + N/M removal
After the pilot proves out: roll markers to all workflows, then rip out the
`progressStages.js` / N/M `tool:stage` path in a cleanup pass. NOT this session.

## Files
- `routes/comfy.js` — phase regex + `comfy:phase` broadcast
- `js/services/commandExecutor.js` — `comfy:phase` SSE → `tool:phase`
- `js/shell/statusBar.js` — `tool:phase` → `updateLabel`
- (user) one raw workflow + its converted API json

## Non-goals
- No new node (MpiLogger exists).
- No N/M removal this session (Phase 4 deferred).
- No touching `comfy_workflows/raw/` — user-owned.
