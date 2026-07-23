# MPI-285 — Split video-reverse into three modes

## Goal
Video-viewer context menu: rename the single **Reverse video** item to **Reverse video & audio**, add two new siblings:
- **Reverse video** — video stream reversed, audio kept forward (passthrough).
- **Reverse audio** — audio reversed, video kept forward (passthrough).

## Current state
- Menu item + handler: [MpiGroupHistoryBlock.js:2241](../../../../js/components/Blocks/MpiGroupHistoryBlock/MpiGroupHistoryBlock.js#L2241) → `_handleReverseVideo()` at [:1374](../../../../js/components/Blocks/MpiGroupHistoryBlock/MpiGroupHistoryBlock.js#L1374).
- Route: [routes/videoReverse.js](../../../../routes/videoReverse.js) — always `-vf reverse` + (`-af areverse` when audio) → both streams.
- Icon `reverse` already in `js/utils/icons.js` — reuse for all three, no new icon.

## Design decisions
- **New `mode` param** on POST body: `'both' | 'video' | 'audio'`, default `'both'` (back-compat — old callers unaffected).
- **Stream-copy the untouched side** (no re-encode → fast, lossless):
  - `video`: `-vf reverse` + `-c:a copy` (or `-an` if no audio).
  - `audio`: `-af areverse` + `-c:v copy`.
  - `both`: current path (`-vf reverse` + `-af areverse`, full re-encode).
- **Trim caveat:** `-ss/-to` input-seek + `-c copy` can land off keyframes → glitchy cut. When `hasTrim` AND the copied stream is video (`mode:'audio'`), re-encode video instead of copy. (Audio copy under trim is fine — audio frames are tiny/independent enough; keep simple.) `ponytail:` accept audio-copy-under-trim; upgrade to re-encode if users report clicks.
- **Guard:** `mode:'audio'` on a source with `hasAudio === false` → 400 `{error:'source has no audio to reverse'}`; client shows error toast. (Optionally: disable the menu item when the current item's `hasAudio` is false — decide during impl, cheap.)
- **Output naming:** keep `video_reverse_NNN.mp4` for all modes (single sequence). `operation` stays `'reverse'`. `displayName`/toast wording adapts per mode ("Reversed video & audio saved" etc.).

## Steps
1. **Route** `routes/videoReverse.js` → verify: audio-only on audio-having clip produces reversed audio + forward video; video-only produces reversed video + forward audio; no-audio + `mode:'audio'` → 400.
   - Read `mode` from body (default `'both'`), validate against the 3 values.
   - Branch the ffmpeg arg builder (video-filter / audio-filter / copy flags) on `mode`.
   - Early 400 when `mode==='audio' && !srcMeta.hasAudio`.
2. **Client** `MpiGroupHistoryBlock.js` → verify: menu shows 3 items; each POSTs correct `mode`; toasts read right.
   - Menu items (`:2241`): replace the one `reverse` item with three — keys `reverse-both` / `reverse-video` / `reverse-audio`, labels "Reverse video & audio" / "Reverse video" / "Reverse audio", icon `reverse`.
   - `onSelect`: route each key to `_handleReverseVideo(mode)`.
   - `_handleReverseVideo(mode='both')`: add `mode` to POST body; per-mode toast strings.
3. **Smoke** in live app → verify: run all three on a video with audio + one without audio; confirm output plays, correct stream reversed, no-audio audio-only shows error.

## Verify checklist
- [ ] `mode:'both'` unchanged from today (regression).
- [ ] `mode:'video'` → video reversed, audio forward, audio not re-encoded (unless trim).
- [ ] `mode:'audio'` → audio reversed, video forward (copy unless trim).
- [ ] `mode:'audio'` + no-audio source → 400 + error toast.
- [ ] 3 menu items visible, correct labels, `reverse` icon on each.

## Out of scope
- No new icon. No batch/multi-item reverse. No settings toggle.
- Audio-copy-under-trim edge left as documented ceiling.
