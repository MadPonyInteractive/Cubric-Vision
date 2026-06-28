# Auto-retry GPU connect

Design approved in [brief.md](brief.md). Opt-in checkbox turns Connect into a background availability poll that waits for an out-of-stock GPU to free, then hands off to the existing connect path — without ever entering the blocking "connecting" state until a slot is won.

## Current State

- Project mode: scalable-foundation. Branch: RunPod (v1.1.0 trunk).
- Picker filters to available GPUs only: `MpiSettings.js` ~L1191 `.filter(g => ... availMap.has(g.id))`, availMap holds only `g.available` GPUs.
- `_connectEngine` (`MpiSettings.js` ~L632) is one-shot: emits `remote:connection { phase:'connecting' }` immediately, then hits `/remote/pod/create` or `/remote/pod/reconnect`, polls to ready.
- Blocking gate = `phase:'connecting'`, consumed in `MpiPromptBox.js:1070` (`_remoteTransitioning`) and `comfyController.js:37-39` (`_remoteTransition`). Blocks Cue/generation.
- `_cancelConnect` (`MpiSettings.js` ~L850) already flips Cancel→Connect, deletes any half-started Pod, resets phase.
- Availability endpoint exists: `GET /runpod/gpu-availability?dataCenterId=<dc>` → `{ gpuTypes, dataCenters[].gpuAvailability[] }` with `{ available, gpuTypeId, stockStatus }`.
- `runpodConfig` already persists `autoConnectOnStart`, `deleteOnQuit`, `gpuType`, `datacenter`, `volumeId`. Boot auto-connect = `_initRemoteBoot` in `js/shell.js` ~L394.

## Implementation

- [ ] Add opt-in auto-retry mode end to end. **Verify:** with checkbox OFF, picker + Connect behave exactly as today (no regression); with checkbox ON, out-of-stock GPUs appear tagged "will wait", pressing Connect polls every 15s with `phase` staying `null` (local Cue/generation NOT blocked, button shows Cancel), and when the GPU frees it transitions into the normal connecting flow and connects. Cancel stops the loop. Boot resumes the wait loop only when both `autoConnectOnStart` and `autoRetry` are on.

Sub-steps (one coherent flow, mostly `MpiSettings.js` + one `shell.js` hook):

1. **Persist flag.** Add `autoRetry` to `runpodConfig` (default false). Render an "Auto-retry connection" checkbox in the RunPod section near `autoConnectOnStart`; wire save through the existing `state.runpodConfig` replace + Storage path. Hint copy: explains it waits for the picked GPU to free and keeps local generation usable meanwhile.
2. **Picker unlock.** When `autoRetry` is on, stop filtering 0-stock GPUs out of the dropdown (~L1191). Tag them `Unavailable — will wait` in the meta; keep available GPUs showing their normal `High/Medium/Low` stock. Off = unchanged filter.
3. **Wait loop.** Add `_waitForGpu(root, cfg)`: every 15s `GET /runpod/gpu-availability?dataCenterId=<dc>`, check the picked `gpuType` in the DC's `gpuAvailability` (Any-region = aggregate across DCs, mirror existing `availMap` logic). **Never emit `phase:'connecting'`; phase stays `null`.** Button = Cancel via existing label flip; hint = `Waiting for <GPU> — checking every 15s…`. Drive the loop with a flag the existing `_cancelConnect` clears (reuse `_connectAbort` or a sibling `_waitAbort`).
4. **Win handoff.** Stock>0 for the picked GPU → stop polling → call the existing `_connectEngine(root)` create path verbatim. Real `connecting` phase + existing toasts ("Creating a Pod…" → "Remote engine ready") start here only.
5. **Race swallow.** If the create then 400s out-of-stock (sniped between poll and create), catch it and drop back to the wait loop instead of surfacing failure. Wrap the handoff so a refused create re-enters `_waitForGpu` rather than the dead-end "pick another" branch.
6. **Connect entry gate.** In the Connect button handler, branch: `autoRetry && picked GPU currently out-of-stock` → `_waitForGpu`; else → today's direct `_connectEngine`. (An available GPU with autoRetry on still connects immediately — no pointless poll.)
7. **Boot resume.** In `_initRemoteBoot` (`shell.js`), when `autoConnectOnStart && autoRetry` and the saved GPU is currently out-of-stock, start the wait loop in the background instead of the one-shot create. `autoRetry` alone (no autoConnectOnStart) does NOT resume — session-only.

## Completed

- [ ] Nothing yet.

## Remaining Work

- All of the above (single Implementation item).

## Plan Drift

- None yet.

## Verification

1. **Regression (checkbox off):** Settings → RunPod, leave Auto-retry off. Dropdown shows only available GPUs; Connect on a Low-stock GPU connects as today; Connect on a now-gone GPU shows today's "pick another" path. No new behavior.
2. **Wait, non-blocking:** Turn Auto-retry on. Pick an out-of-stock GPU (now visible, tagged). Press Connect → button shows Cancel, hint "Waiting… checking every 15s". Confirm hero/status bar stay local·offline (NOT "connecting") and a local Cue/generation still runs unblocked during the wait. (Force by picking a card that's genuinely 0-stock, or temporarily stub availability.)
3. **Win:** When the GPU frees (or stub returns stock>0), confirm it transitions into the normal connecting flow, "Creating a Pod…" toast fires, and it connects to ready.
4. **Cancel:** During the wait, press Cancel → loop stops, no Pod created, back to local·offline.
5. **Boot resume:** Both checkboxes on + saved out-of-stock GPU → relaunch → wait loop runs in background (no blocking, local usable). With only autoRetry on → no auto-resume.
6. Check `logs/app.log` for clean poll logs, no error spam, no orphan Pods.

## Preservation Notes

- Likely doc drift: `.claude/rules/component-state.md` (new `runpodConfig.autoRetry` key read/written by MpiSettings) and possibly `component-events.md` if any new event is introduced (aim: reuse `remote:connection`, no new event). Ask before updating rules per CLAUDE.md cardinal rule 3.
- No new backend route expected — reuses `/runpod/gpu-availability` + existing `/remote/pod/create`. If a backend change creeps in, note it.
- 15s interval hardcoded by design (YAGNI). Mark with `// ponytail:` if a magic number needs context.
