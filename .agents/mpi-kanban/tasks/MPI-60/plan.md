# MPI-60 Plan

## Current State

- `/system/stats` reports RAM, GPU vendor, and memory-model metadata.
- Apple Silicon unified memory is represented as `gpu.vendor === 'apple'` / `memoryModel: 'unified'`.
- `MpiMemoryMonitor` hides the VRAM row for Apple unified-memory stats with no discrete VRAM.
- `commandExecutor` emits `tool:progress` after sampling starts and treats real work-node progress as the fallback signal when auxiliary model-init completion events are missing.
- `StatusBar` completion toasts include whole-run elapsed seconds.

## Implementation

- [x] Include enough GPU/memory metadata in `/system/stats` for the frontend to know when VRAM is unavailable because the machine uses Apple unified memory.
- [x] Update `MpiMemoryMonitor` to hide the VRAM row only for Apple unified-memory stats with no discrete VRAM.
- [x] Let real Comfy progress events break out of the model-initializing phase on macOS when the auxiliary model-init event stream does not report completion.
- [x] Show elapsed generation time when a run completes.
- [x] Verify the backend route and frontend logic without changing unrelated status-bar behavior.

## Completed

- Apple Silicon memory metadata and VRAM-row suppression.
- Mac progress fallback through `tool:progress`.
- Completion toast elapsed-time display.
- Targeted syntax checks, frontend ESLint, and `/system/stats` smoke.

## Remaining Work

- User validation on Apple Silicon during the next version bump.
