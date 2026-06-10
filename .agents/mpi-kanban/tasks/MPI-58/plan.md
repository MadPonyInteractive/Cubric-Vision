# MPI-58 Plan

## Current State

- Video history zoom works on Windows but fails on macOS/Linux.
- The viewer state appears to change on macOS because hover shows a move cursor, but the visible video does not zoom.
- Linux hover still shows the video hand cursor, suggesting the raw video element remains the hover/compositor target.
- `MpiVideoViewer` applies pan/zoom to the wrapper around `MpiVideoSurface`, which can be unreliable for hardware video compositing outside Windows.

## Implementation

- [ ] Apply pan/zoom transform directly to the actual video element so macOS/Linux video compositors receive the transform.
- [ ] Keep cursor state on the actual video element in sync with viewer zoom/pan state.
- [ ] Keep crop overlay alignment correct after zoom changes.
- [ ] Preserve click-to-play behavior and avoid panning conflicts while crop mode is active.
- [ ] Verify lint and a focused runtime check for video viewer transform updates.

## Completed

- None yet.

## Remaining Work

- Implement the cross-platform video zoom fix and verify it.
