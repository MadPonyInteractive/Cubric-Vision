# MPI-283 Validation

Status: VALIDATED (user-verified, 1.2.0, 2026-07-15).

## User-verified this session
- Frame-step exact + distinct every press; play hides canvas. "it's just working" (steps 1-4).
- Sub-range loop (in=0 and in≠0): clean wraps, no freeze, no playhead pin. "Loop is now performing correctly."
- Scrub-back interpolated-flash: GONE. "When scrubbing back, the interpolated flash is gone."
- Playhead drop offset (step 5): "100% accurate now" — drop lands exactly, in-handle sits on playhead.
- Color: matches native `<video>`, survives upscale (step 2 color fix).

## Auto-verified (invariant self-check)
- scratchpad/invariant.mjs: 5 clip shapes (CFR 20@24, Wan 33@16, padded dur, NTSC 29.97, LTX 49@24) → drop% == echo% for EVERY frame (maxJump 0.00), frame0@0% + lastFrame@100% reachable. ESLint clean on all 4 touched files.

## Known non-bug (NOT a player defect)
- Wan 33-frame clip: last frame (33) not reachable + frame0==frame1. Same padded-duplicate first frame as LTX (48+1). Content, DaVinci-confirmed. User is fixing workflow-side (drop frame 0) in a separate session. No player change. Do NOT "fix" in the player.

## Follow-up
- MPI-287 (todo): extend-from-last-frame exact-frame capture via frameSink (frame-accuracy, NOT color — extraction draws native <video> = already color-correct).

## Docs
- docs/video-player.md (subsystem doc). .claude/rules/component-mounts.md updated (3 video components).
