# Video Player Controls — History Page Bug Fix

<!-- trackers
to-do-1: NIM-27
to-do-2: NIM-28
to-do-3: NIM-29
to-do-4: NIM-30
to-do-5: NIM-31
-->

**Tracker:** `bug_mobh7v7c44obn7`
**Workspace:** Gallery / History (MpiGroupHistoryBlock → videoStrategy → MpiVideoViewer → MpiVideoPlayer)
**Files:**
- `js/components/Compounds/MpiVideoPlayer/MpiVideoPlayer.js`
- `js/components/Compounds/MpiVideoPlayer/MpiVideoPlayer.css`
- `js/components/Primitives/MpiProgressBar/MpiProgressBar.js`
- `js/components/Primitives/MpiProgressBar/MpiProgressBar.css`
- `js/utils/icons.js`
- `js/components/types.js`

## Root-cause summary

| Issue | Root cause |
|---|---|
| Controls too big | `MpiButton size: 'lg'` on every control + control bar padding `12px 16px` + slider heights 16-18px. Aspect-ratio constraint on `.mpi-video-player` widens video and inflates absolutely-positioned controls. |
| Prev/next frame icons "wrong" | Likely visual: `lg` size makes them oversized & misaligned. Icons themselves (`frameBack`/`frameForward`) exist and render. |
| Fullscreen icon "wrong" | Same — `lg` size oversized. Icon `fullscreen` exists. |
| Seek bar dead | `progressSlider.on('change', ...)` works in theory but progress bar is updated via `dispatchEvent('input')` in `updateTime` — feedback loop swallows user input. Also `interactive` prop missing on progressSlider mount (line 128) — primitive ignores user pointer events. |
| Volume bar partial | `volumeSlider` IS mounted with `interactive: true`, but slider visual updated via dispatched `input` event from `handleVolumeChange` — fights user input. |
| No handle on bars | MpiProgressBar primitive has no thumb. Native input range thumb hidden by CSS. |
| Mute not toggling icon | `muteBtn.el.setAttribute('data-icon', newIcon)` does nothing — MpiButton renders SVG once at mount. Must use `iconActive` + `active` toggle pattern (like play/pause). Use existing `volumeOff` for muted state (user-confirmed). |

## To-dos

- [x] **1. Add optional `handle` prop to MpiProgressBar primitive**
  - File: `js/components/Primitives/MpiProgressBar/MpiProgressBar.js` + `.css`
  - Add `handle: boolean = false` prop to template + props spec
  - When `handle: true`, render `<div class="mpi-progress__handle"></div>` inside `.mpi-progress__track-container`, positioned absolutely at `left: {fillPercent}%` (track via inline style updated alongside fill width in the existing input handler)
  - CSS: 14px round handle, `var(--mpi-color-accent)` border, white fill, `transform: translate(-50%, -50%)` so it sits centred on the value point, vertical centre via `top: 50%`
  - Update `js/components/types.js` `ProgressBarProps` to document the prop
  - **Verify:** Mount any progress bar with `{ handle: true, value: 50, interactive: true }` in dev gallery; confirm a circular handle appears at the 50% mark and slides with input. Console.log `'[handle] pos:', percent` inside the position update during implementation.

- [x] **2. Fix progress + volume sliders (interactive flag, feedback loop, wire seek)**
  - File: `js/components/Compounds/MpiVideoPlayer/MpiVideoPlayer.js`
  - Add `interactive: true, handle: true` to the progress slider mount (line 128 area)
  - Add `handle: true` to volume slider mount (already interactive)
  - Replace `dispatchEvent(new Event('input'))` in `updateTime` and `handleVolumeChange` with a direct visual sync that does NOT trigger the slider's change handler — either set fill width inline, or expose a `setValueQuiet(value)` method on MpiProgressBar (preferred; add to primitive). This stops user-drag from being clobbered by `timeupdate`.
  - Confirm `progressSlider.on('change', ...)` actually fires and seeks. The `isSeeking` guard already exists; ensure `change` event reaches handler.
  - **Verify:** Open a gallery video. Drag the seek bar handle — video time jumps to that position. Drag volume handle — audio volume changes. Console.log `'[seek] →', value` and `'[vol] →', value` in the handlers during implementation.

- [x] **3. Fix mute button to be a real toggle with icon swap**
  - File: `js/components/Compounds/MpiVideoPlayer/MpiVideoPlayer.js` (mute button mount + `handleVolumeChange`)
  - Re-mount muteBtn with `{ icon: 'volumeHigh', iconActive: 'volumeOff', active: initialMuted, size: ... }` so MpiButton's built-in icon swap kicks in
  - In `handleVolumeChange`, replace `setAttribute('data-icon', ...)` with `muteBtn.el.classList.toggle('is-active', video.muted)` (same pattern as loop button, line 270)
  - Drop the volume-level icon switching (Low/High) since the toggle handles muted vs unmuted; level differentiation is signalled by the slider itself
  - Use existing `volumeOff` icon as `iconActive`. No new icon needed (user confirmed 2026-04-23).
  - **Verify:** Click mute button — icon visually swaps between speaker-with-waves and speaker-with-line; click again to swap back. Audio mutes/unmutes accordingly. Console.log `'[mute] →', video.muted` during implementation.

- [x] **4. Shrink controls and tighten layout**
  - File: `js/components/Compounds/MpiVideoPlayer/MpiVideoPlayer.css` + `MpiVideoPlayer.js`
  - In JS: change all `size: 'lg'` button mounts to `size: 'md'` (or `'sm'` for frame-step buttons if `md` still too big)
  - In CSS: reduce control bar padding from `12px 16px` to `6px 10px`; reduce gaps; reduce progress slider height from 18px → 6px (pre-handle) and volume slider from 16px → 6px; cap control bar height to ~40px max
  - Remove or relax `.mpi-video-player { aspect-ratio: 16 / 9 }` constraint — let parent `.mpi-video-viewer__player` (100% × 100%) drive sizing; use `object-fit: contain` on the `<video>` element instead
  - **Verify:** Reload gallery video. Visual check: control bar is compact (~40px tall), buttons ~32px, prev/next/fullscreen icons render at correct size and clearly recognizable. Video fills container without forcing aspect-ratio.

- [ ] **5. Update tracker + close out**
  - Call `mcp__nimbalyst-mcp__tracker_update` on `bug_mobh7v7c44obn7` with `status: done`
  - Update session phase to `validating`
  - **Verify:** Tracker board shows item moved to done column.

## Notes

- Investigator initially reported "seek/volume/mute work" — contradicted by user report and code review (mute uses dead `setAttribute`, sliders fight feedback loop). Trust user.
- All icons needed are present (`frameBack`, `frameForward`, `fullscreen`, `volumeHigh`, `volumeLow`, `volumeOff`). Only the mute toggle wiring is broken; new icon is optional.
- BEM strict: `.mpi-progress__handle` for primitive, no new top-level classes in player.
