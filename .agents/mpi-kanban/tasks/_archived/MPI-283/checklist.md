# MPI-283 Checklist

- [x] 1. Add mediabunny dep + standalone smoke — PASS: canDecode=true, packetCount=20, avgRate=24, duration=0.8333, 20/20 distinct hashes, frame0≠frame1 (combined_003.mp4, our h264/yuv420p output)
- [x] 2. Frame-sink service (js/services/frameSink.js) — PASS: UrlSource on real /project-file works; canDecode gate + null-fallback proven live.
  - COLOR FIX (USER-VERIFIED — reloaded, matches video, survives upscale): CanvasSink rendered vivid (WebCodecs mis-converts, crbug 40539111 — mis-tags matrix). Switched to VideoSampleSink + MANUAL YUV(I420)→RGB, matrix by height (≥720→BT.709 else BT.601, limited). SD pixResid 0.12/max1, HD pixResid 0.59/max8 (~pixel-perfect vs <video>). Per-frame cost only. Crop-export confirmed our ffmpeg clean (shift was decode-only). ⇒ EXPLAINS extend-from-last-frame color drift.
- [x] 3. MpiVideoSurface — canvas overlay + frameSink-backed frameStep. AUTO-PASS + USER-VERIFIED (1.2.0, 2026-07-14): frame-step exact + distinct every press, play hides canvas. "it's just working" 🎉
  - FIX (post-eyeball): overlay canvas was smaller than video (max-width/margin:auto letterboxed it). Now width/height:100%+object-fit:contain matches __video exactly. Verified rectsMatch true in wide stage.
  - NON-BUG (DaVinci-CONFIRMED): frame0==frame1 identical in DaVinci Resolve too = Wan/LTX padded duplicate first frame (49=48+1). MAD 0-1=1.25 vs ~9 all others. Player + sink indexing correct.
- [~] 4. MpiVideoControlBar — sub-range loop freeze FIXED. Rewrote _handleRangeBoundary + _seekRangeStartIfNeeded to direct time-vs-outSec compare (half-frame lead) + re-assert _play() on wrap; deleted _effectiveFps stub (inlined _fps). AUTO-PASS: loop ON → 6 clean wraps, bounded [in,out], no freeze; loop OFF → stops at out, no overshoot. ESLint clean. AWAITING user-ux eyeball.
- [~] 4b. Sub-range loop in≠0 freeze FIXED (removed t<_in-lead re-seek that pinned playhead on in-handle every tick). AUTO-PASS in=10 out=30: 4 clean wraps, no pin. AWAITING user eyeball.
- [~] Scrub-back visual glitch (interpolated-flash on step-back) FIX: frameStep paints canvas BEFORE moving video.currentTime (native seek under canvas was flashing its drifted target). Frames still exact (regression pass). NEEDS user re-eyeball.
- [~] 5. MpiTrimBar exact-frame mapping + Wan last-frame reach. DONE (auto-PASS, awaiting user eyeball):
  - ROOT of playhead drop-offset (pre-existing, worse after overlay): TWO coordinate systems for "frame N → x". TrimBar drop mapped in PTS-time (round(t*_fps)/_fps ÷ _duration), control-bar echo (_displayTime→setValueQuiet→_pctOf) mapped in idx/lastIdx-normalized space. Drop landed at one x, echo repainted at another → jump on release.
  - FIX: unified TrimBar to frame-index space — added _frameCount prop + setFrameCount(); _effFps=fc/dur; _snap/_pctOf/_eventToSeconds all idx-based, last-frame→100% normalized (MATCHES _displayTime). Control-bar pushes setFrameCount into trim (attach + setFrameCount).
  - ALSO fixed the DOUBLE-normalization: _displayTime was stretching to idx/lastIdx*dur AND _pctOf normalizing again → 1-frame echo shift. _displayTime now returns TRUE frame time idx/effFps; the single normalization lives in _pctOf.
  - Wan last-frame: un-stubbed MpiVideoSurface._effectiveFps (was `return _fps`) → fc/dur when both known, so seek/frameStep index the same frames; last frame reaches 100%.
  - Invariant self-check (scratchpad/invariant.mjs): 5 clip shapes (CFR, Wan 33@16, padded dur, NTSC 29.97, LTX 49@24) → drop%==echo% for EVERY frame (maxJump 0.00), frame0@0% + lastFrame@100% reachable. ESLint clean.
- [x] 6. Cleanup + docs — DONE.
  - Cleanup: no dead seek-math to remove. The two `0.25*fs` biases (MpiVideoSurface:257 native-fallback, MpiVideoControlBar:116 _seekFrame jump-to-last) are still LIVE (native-fallback + End-key jump), not dead. _effectiveFps un-stubbed = real. no-unused-vars clean (only pre-existing `catch (_)` idiom).
  - Doc: docs/video-player.md (97 lines) — audio-clock/PTS root cause, hybrid contract, canDecode cross-platform guarantee, COLOR matrix rule (height≥720→BT.709 else BT.601 limited; WebCodecs mis-reports matrix, use height), the frame-index coordinate law (single normalization in _pctOf, _displayTime returns true frame time), sub-range loop, frame0==frame1 non-bug. Added README.md UI-section row.
  - CORRECTION to MPI-287 premise: extract path (captureFrameBlob) draws the native <video> = color-CORRECT, NOT the WebCodecs canvas. Handoff's "extraction recolor" hypothesis is WRONG. Real extraction gap = frame-accuracy (native seek drift), not color. MPI-287 rewritten accordingly.
- [x] FOLLOW-UP CARD created: MPI-287 (todo) — extend-from-last-frame exact-frame capture via frameSink. Corrected from color → frame-accuracy.

## Doc-drift (ASK gate — CLAUDE.md)
Pending user OK before editing .claude/rules component maps:
- MpiVideoSurface: gained canvas overlay (.mpi-video-surface__frame) + frameSink dep + data-frame attr; _effectiveFps now fc/dur.
- MpiVideoControlBar: setFrameCount now pushes into trim; _displayTime returns true frame time; sub-range loop logic.
- MpiTrimBar: new frameCount prop + setFrameCount(); frame-index mapping.

## Open findings for next session (user-noted)
- LTX frame0==frame1 = NON-BUG (content; Wan differs). User may drop frame0 in workflow before export. No player change.
- Wan last-frame unreachable: 33-frame clip @16fps, frame 33 shows in scrub bar but can't STEP to it. User: minor, "unless it bites later." REVISIT in step 5 (last-frame/trim-out reach — likely the same `lastFrame = _frameCount-1` vs `round(hiSec*eff)` boundary math). Verify against DaVinci frame count.
- Scrub-back glitch: reorder fix applied, needs user re-eyeball (may not be fully gone — if not, investigate native <video> seeked repaint vs canvas z-order/opacity, or suppress video repaint during step).
- FOLLOW-UP CARD NEEDED: apply the same BT.601/709 matrix fix to the extend-from-last-frame EXTRACTION path (wherever it grabs a frame → that path recolors, causing transition color drift the user saw). Find the extraction site, reuse frameSink's _paintI420 logic or route through frameSink.

## Reference (color)
- Matrix rule: frame height ≥720 → BT.709, else BT.601, limited range (matches libx264 tag + Chromium <video>). WebCodecs mis-reports colorSpace.matrix (always bt709) → DON'T trust it, use height.
- frameSink._paintI420 does the conversion. <video>/DaVinci/our-ffmpeg-export = color truth.
- Research report (crbug 40539111/343011434, copyTo disproven, all in agent transcript) — key: manual YUV convert is the only exact fix; copyTo/drawImage/createImageBitmap all give the same mis-converted pixels.
