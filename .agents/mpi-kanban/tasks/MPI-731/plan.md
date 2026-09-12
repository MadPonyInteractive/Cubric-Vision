# Audio plays in our own player, not Electron's

## Current State

Project mode: scalable-foundation.

Every surface that plays a generated audio result hands the user Chromium's default
`<audio controls>`: a grey pill with a native slider, native icons and no waveform. MPI-730
gave the gallery card a real scrub track; the player is the other half and the one the user
actually presses play on.

**What already exists, and is not to be rebuilt:**

- `MpiWaveform` (`js/components/Compounds/MpiWaveform/`, 118 lines) — the scrub track.
  Props `{ mask, progress, duration }`, API `setMask/setProgress/setDuration/getProgress`,
  emits `seek { fraction, time, modified }`. **It owns no `<audio>` and must not gain one**:
  the consumer drives `setProgress()` from its own `timeupdate` and decides what a seek
  means. That split is the only reason both the card and this player can mount it.
- **ONE 21:9 mask rendition** (≈1260x540) at the item's sidecar `thumbPath`, stretched by
  `mask-size: 100% 100%` into whatever box mounts it. A short wide transport strip is still
  the right wave — **do not bake a second rendition** (`docs/gallery-audio-cards.md`).
- The mask and the duration are **already on a flow result item**, so this card needs no new
  route, no new bake and no new plumbing: `routes/projects.js:2188-2192` stamps
  `thumbPath` + `duration` on an audio generation's sidecar and returns both
  (`:2295`), and `generationService.js:1260` / `:1275` copy them onto the live item. Both
  call sites below already hold that item as `it`.

**Where the bare player is today** (`js/components/Organisms/MpiBaseFlow/MpiBaseFlow.js`):

| line | what | note |
|---|---|---|
| `2339` | `_sharedAudioEl(url)` → `ce('audio', { className: 'mpi-base-flow__result-audio', src, controls: true })` | **THE ONE element** (MPI-727). Keyed by URL, MOVED between the floating dock and the result pane inside ONE synchronous `_renderSlide` pass, never re-created — a fresh element with the same `src` restarts from zero. |
| `2371` | `_dockNode` N-output branch → its own `<audio controls>` | nothing to share, so each output gets one |
| `2717` | `_paintPlainResults` N-output branch → same | |

`_dropSharedAudio()` (`:2347`) is the only teardown and is called from exactly three places
(`:2338` URL change, `:2400` no result, `:3436` flow destroy). `_teardownResultSurfaces()`
(`:2913`) deliberately does not touch the shared element.

**Out of scope, with reasons** (each is a card of its own if wanted):
`MpiBaseFlow.js:738` filled audio SLOT — a hover-audition thumbnail, not a player (MPI-622);
`MpiAudioRecorder.js:223` — a blob URL with no sidecar and therefore no mask, inside a dialog
with its own layout; `MpiMediaPicker.js:242` / `:485` — hover-audition tiles.

**Repo facts that shape the check:** there is **no jsdom in the node suite** (measured: only
five tests mention it, all saying they avoid it), so a component check has to be a
`tests/desktop/*.spec.js`. `express.static(__dirname)` (`server.js:44`) serves
`/voices/child_1.opus` — 11.1s of real audio, the fixture `docs/gallery-audio-cards.md`
already names — so the spec needs no ffmpeg bake and no tone generator.
`tests/desktop/flow-result-follows-steps.spec.js` is MPI-727's identity gate; its selectors
are `… __media audio`, which still resolve through a wrapper, so it stays valid as the
regression check.

**Live peer claims (2026-09-12 13:05Z):** `js/components/types.js` and
`js/shell/preloadStyles.js` are both held by **MPI-728** (`status: claimed`, live 12:35Z).
A claimed record is a NO whatever its heartbeat says, so the two one-line registrations they
need are sequenced last — item 8 — and neither blocks the feature. `MpiBaseFlow.css`,
`types.js` and `preloadStyles.js` all carry uncommitted peer hunks: **stage by hunk, never
`git add` the file.** `js/components/Primitives/MpiProgressBar/` (item 1) is clean and
unclaimed — but it is a shared Primitive, so claim it before the first edit and release it
the moment the item lands.

**`js/pages/components.js` is MPI-739's** (claim live 17:05Z, card still in `doing`). Its
work shipped at 18:11/18:19 (`6ef03986`, `fa5c161a`) and Fabio believes that session is
finished, but the record is what `guard-claim` reads and it still says `claimed` — so leave
the page alone. Nothing on the critical path needs it; the demo variant is item 8's
follow-up, and it now has a named home: that commit rehomed the two slider cards
(`preview-slider-smart`, `preview-slider-smart-2`) from a fictional "MpiSlider" heading in
Compounds to `MpiProgressBar`'s own row beside the static bars, which is where a vertical
variant belongs.

**`MpiGalleryGrid.js` (item 6) holds TWO peers' uncommitted work** — MPI-733's `cue-all`
context-menu entry, deliberately uncommitted while it waits on Fabio's UX verify, and ~83
lines of MPI-678's archive work — plus an untracked `tests/desktop/gallery-archive.spec.js`.
Neither is a live `claimed` record, so the file is writable, but it makes item 6 the
riskiest swap in the card: **do it last, stage by hunk, and read `git diff` before every
stage.** That is why items 5 and 6 are separate items rather than one "adopt everywhere".

**Claims re-checked 2026-09-12 ~19:00Z — the two blocks above are GONE.** MPI-728's
record is `complete` (types.js + preloadStyles.js committed, clean in git) and MPI-739's is
`complete` with the card in `done` (components.js + tpl-components.html clean). The only
`claimed` record on any file this card touches is MPI-731's own. So item 8's registrations
and the demo-page variant are unblocked — claim them before the first write. What has NOT
changed: `MpiGalleryGrid.js/.css` still carry uncommitted MPI-733 (`needs_verification`,
card in `doing`) and MPI-678 work. No live claim, but item 6 stays last and hunk-staged.

## Decided at plan time

The brief left three things open and asked for a fourth decision explicitly; Fabio settled
the layout as a fifth on 2026-09-12 and the consistency scope as a sixth. All six are
settled below from the code, not from preference. Do not re-litigate them — build them.

1. **A SIBLING component, not a third mode of `MpiVideoControlBar`.** The brief asked; the
   answer is sibling. `attachSurface()` speaks `MpiVideoSurface`'s private API —
   `getVideoElement`, `_play`, `_pause`, `_setVolume`, `_setMuted`, `_setFps`,
   `_setFrameCount`, `frameStep`, `seek`, plus six component-local emits — and an `<audio>`
   satisfies none of it, so a mode needs a fake-surface adapter first. Past that, most of the
   bar is frame math that exists only for frame accuracy (`requestVideoFrameCallback` watch,
   `_frameBounds`, `_displayTime`, the sub-range loop, the frames/seconds toggle, the trim
   bar, fullscreen) — `docs/video-player.md` says so in as many words, and audio has no
   frame-accuracy problem. A mode is an adapter plus ~10 `if (isAudio)` gates inside a
   560-line file that two other surfaces depend on; a sibling is one file that only does
   this. **The reuse is real and it is in the primitives**: `MpiButton` play/pause +
   `MpiButton` mute, `MpiProgressBar` volume, `formatTime`, the same icon names, the same
   hotkey ids, the same two-group bar layout.
2. **Where it lives: the two surfaces that already have a bare player** — the Flow result
   pane and the floating result dock. NOT the gallery (hover-plays-from-0 + click-to-seek is
   MPI-730's signed-off contract) and NOT a new audio workspace, so MPI-730's `!_isAudioNow`
   `open-group` suppression stays exactly as documented.
3. **Volume is `MpiProgressBar` 0–100, not `MpiFader`.** `components.md` routes "gain/volume
   fader" to `MpiFader`, and that row is about a MIX gain: `MpiFader` is a dB scale with
   unity in the MIDDLE and +12 dB of boost, and `HTMLMediaElement.volume` is clamped to
   1.0 — a fader whose top half does nothing. `MpiVideoControlBar`'s own volume slider is
   the precedent for a transport. Say so in the component's header so the next reader does
   not "fix" it.
4. **The player owns its `<audio>`; `MpiWaveform` still owns none.** One player instance per
   URL, and `_sharedAudioEl` becomes `_sharedAudioPlayer` returning `instance.el` — the same
   instance is MOVED, never rebuilt, so MPI-727's doctrine moves up one level without
   changing kind. The inner `<audio>` is created once and its `src` is never re-pointed.
5. **ONE row, and the volume hides behind the mute button** (Fabio, 2026-09-12, with the
   video bar on screen as the reference): `play │ time │ waveform │ mute`, the waveform
   taking every pixel the other three do not. That is `MpiVideoControlBar`'s own grouping —
   left cluster, wide track, right cluster — minus the controls only video has. The volume
   slider is **VERTICAL and revealed on hover over the mute button**, because a horizontal
   one inline would eat the waveform exactly where the player is smallest (the 200-260px
   dock), which is where the wave is already hardest to read.
   **`MpiProgressBar` has no vertical option today** — not a lost feature: `orientation`
   appears nowhere in that Primitive and `git log -S vertical` over its folder returns **0
   commits**, ever. What the gallery has is TWO sliders side by side (size + volume,
   `MpiGalleryGrid.js:161-164`), both horizontal. The only vertical slider in the app is
   `MpiFader` (`orientation: 'vertical'`), and it is the wrong one here for the reason in
   decision 3. So the vertical option gets ADDED to the one Primitive that owns sliders —
   item 1 below.
   **The deleted component Fabio remembered is real, and it did not have it either.**
   `MpiSlider` (`js/components/Compounds/MpiSlider/`) existed and was deleted in `3c09fdbd`
   *"Component Int Refactor - Stage 2"* — which is why `MpiProgressBar`'s header still says
   "Absorbs all MpiSlider capabilities". Recovered and read (`git show 3c09fdbd^:…`): 72
   lines, a thin wrapper adding wheel support and prefix/suffix info formatting, **no
   `orientation`, no `vertical`, and nothing in its CSS** either. So no vertical option was
   ever lost — it was never written.
6. **ONE volume control, mounted in all three places** (Fabio, 2026-09-12: *"those two
   places need to be updated for consistency"*). The mute-plus-volume pair exists in exactly
   two surfaces today and they do not match each other, let alone the new player:

   | surface | mute | slider | extras |
   |---|---|---|---|
   | `MpiVideoControlBar` right cluster | `MpiButton` toggling `video.muted` | horizontal `MpiProgressBar`, `step: 1`, no wheel | `M` + volume hotkeys |
   | `MpiGalleryGrid` header (`:161-164`, `:453-482`) | **none at all** - the icon is a decorative `<span>`, and volume 0 IS the mute | horizontal `MpiProgressBar`, `step: 5`, `wheel: true` | persisted via `Storage.getGalleryVolume()` |

   So the button+flyout from decision 5 lands as its own compound,
   **`MpiVolumeControl`**, and all three surfaces mount it. It owns no media element - same
   doctrine as `MpiWaveform`, and it has to, because those two rows disagree about what
   muting even means: one has a real `muted` flag, the other calls zero the mute. The
   compound owns the button, the flyout and the gesture; the consumer owns the meaning.
   Two things fall out for free: the gallery **gains a mute button it never had**, and both
   existing rows get width back - the gallery header's own CSS says the centre zone "holds
   BOTH sliders and shrinks first when space is tight", and this returns ~7rem of it.
   `step`, `wheel` and persistence stay consumer-side, because they legitimately differ.

   **Still `MpiProgressBar`, not `MpiFader`** - and note this hardened rather than changed
   when the scope grew to three surfaces. Fabio read the first plan as recommending
   `MpiFader`; it recommended the opposite. Both existing surfaces are already linear
   0-100 bound straight to `media.volume`, so `MpiFader` would silently re-taper the video
   workspace and the gallery to dB, and it would put **MPI-740** (its wheel crawls, and it
   cannot leave the unity detent - filed 2026-09-12 from this same conversation) on this
   card's critical path. `MpiFader` stays the mix gain it was built to be.

## Implementation

- [ ] **1. Teach `MpiProgressBar` `orientation: 'vertical'`.** Additive, default unchanged,
      and it lands in the Primitive that `components.md` calls the single source of truth for
      sliders rather than as a one-off inside the player. The component is 130 lines and the
      change is small: `template()` adds a `mpi-progress--vertical` class and writes the
      handle's initial offset as `bottom` rather than `left`; `updateVisuals()` branches to
      `trackFill.style.height` / `handleEl.style.bottom`. The CSS block is the real content —
      **`writing-mode: vertical-lr; direction: rtl` on the `<input type="range">`**, which
      Chromium renders as a native bottom-to-top range (Electron 41 ships Chromium ~142; the
      feature landed in 136, so no rotate/transform hack and no pointer-math rewrite). The
      existing wheel handler already reads correctly vertically (`deltaY < 0` → increase).
      Do NOT touch the horizontal path, and do not "fix" the pre-existing missing
      `el.destroy()` while in there — flag it instead.
      **Verify:** in a real Electron window, assert the fill grows from the BOTTOM and that
      the value the input reports matches the pointer position — a vertical range that
      silently reads top-to-bottom is the whole risk, and it is invisible to any DOM-only
      assertion. Drive it through its real consumer (item 2 mounted in item 5's video bar),
      **not** through `js/pages/components.js`: that page is the Primitive's demo home but is
      **claimed by MPI-739** as of 2026-09-12 17:05Z. Adding the demo variant is a one-line
      follow-up once that claim releases. Every existing consumer must be unchanged:
      `grep -rc "MpiProgressBar.mount" js/` equal before and after, and one horizontal
      slider (the gallery volume) exercised in the same run.

- [ ] **2. Build `MpiVolumeControl`** (`js/components/Compounds/MpiVolumeControl/`) — the
      mute button and its hover-reveal vertical volume, as one component, because three
      surfaces need it and `components.md`'s rule is that there is ONE of each control.
      Mounts `MpiButton` `{ icon: 'volumeHigh', iconActive: 'volumeOff', size: 'sm', info: 'Mute/Unmute (M)' }`
      plus the item-1 vertical `MpiProgressBar` inside a `.mpi-volume-control` positioning
      context; `:hover, :focus-within` reveals the flyout in CSS — no JS, no timers, no
      portal. **Props:** `{ value = 100, muted = false, step = 1, wheel = false }`.
      **API:** `setValue(v)` / `setValueQuiet(v)` / `setMuted(b)` / `getValue()`.
      **Emits:** `input { value }`, `change { value }`, `mute-toggle { muted }`.
      **It owns no media element** — the same split that makes `MpiWaveform` reusable, and
      here it is forced: the video bar has a real `muted` flag while the gallery treats
      volume 0 as the mute, so only the consumer can know what a mute-toggle means. Keep
      `step`, `wheel` and any persistence OUT of it for the same reason.
      **Verify:** covered by items 5 and 6 driving it live, plus the flyout assertions in
      item 7 — a compound with three consumers and no consumer of its own is not worth its
      own spec.

- [ ] **3. Build `MpiAudioPlayer`** (`js/components/Compounds/MpiAudioPlayer/MpiAudioPlayer.js`
      + `.css`). Owns ONE `<audio>` (created in `setup`, `preload: 'metadata'`, `src` from
      props, never re-pointed) and mounts, through `ComponentFactory.create()`:
      `MpiButton` `{ icon: 'play', iconActive: 'pause', size: 'sm', info: 'Play/Pause (SPACE)' }`,
      `MpiButton` `{ icon: 'volumeHigh', iconActive: 'volumeOff', size: 'sm', info: 'Mute/Unmute (M)' }`,
      `MpiProgressBar` `{ orientation: 'vertical', min: 0, max: 100, step: 1, value: 100, suffix: '%', interactive: true, handle: true, variant: 'primary' }`,
      `MpiWaveform` `{ mask, duration }`, and one `.mpi-audio-player__time` span.
      **Props:** `{ src, mask, duration, hotkeys = true }`. **API:** `getAudioElement()`,
      `setMask(url)`, `destroy()`.
      **Layout: ONE row** — `play │ time │ waveform │ mute`, the waveform on `flex: 1` so it
      takes every pixel the other three do not. Same grouping as `MpiVideoControlBar` (left
      cluster, wide track, right cluster) minus the video-only controls, so the two
      transports read as the same family.
      **The volume is a vertical slider revealed on hover over the mute button**, not an
      inline one: inline horizontal costs the waveform ~90px exactly where the player is
      narrowest. Wrap the mute button and the flyout in one
      `.mpi-audio-player__volume` positioning context and reveal with
      **`:hover, :focus-within` in CSS — no JS, no timers, no portal**. The wrapper (not the
      button) owns the hover so the pointer can travel from button to slider without it
      closing; `:focus-within` is what keeps it keyboard-reachable. Verify nothing in either
      mount chain sets `overflow: hidden` — `.mpi-flow-result-dock` and its `__media` box do
      not today, so an absolutely positioned flyout escapes both and needs no `MpiPopup`. If
      that ever changes, the answer is `MpiPopup`/portal, not clipping the flyout.
      BEM `.mpi-audio-player__*`; tokens only; the consumer may SIZE it and nothing else.
      **Wiring:** `timeupdate` → `wf.setProgress(t/d)` + time text; `loadedmetadata` →
      `wf.setDuration` (the `duration` prop covers the pre-metadata paint); `volumechange` →
      slider `setValueQuiet` + mute `is-active`; `play`/`pause` → play button `is-active`;
      **`ended` → hold the fill at 1**, same doctrine as the card (emptying it reads as "the
      player died") — and unlike the card there is no `mouseleave`, so there is no latch to
      pair it with. Waveform `seek` → `audio.currentTime = time` and keep playing;
      `modified` is ignored here (no selection mode on a player). Time text is
      `formatTime(s).slice(0, 5)` — `mm:ss`; centiseconds are a video-editing affordance.
      **Hotkeys:** reuse the existing `video.playPause` / `video.mute` / `video.volume.up` /
      `video.volume.down` ids rather than minting audio twins — `hotkeyManager` buckets
      handlers by KEY, so a second id for the same key buys nothing but a settings row.
      Copy `MpiVideoControlBar`'s `_canDrive()` gate verbatim
      (`el.isConnected && el.getClientRects().length > 0`): without it a player stashed in a
      `display: none` overlay still answers SPACE, which is MPI-585 reproduced. `hotkeys:
      false` exists for the N-output case — N visible players all answering SPACE would play
      N songs at once. `destroy()` pauses the audio, drops the listeners, unbinds the
      hotkeys and destroys all four sub-components.
      **Verify:** `npx eslint` clean on the new files; behaviour is item 7.

- [ ] **4. Wire it into the Flow's two audio surfaces.** `_sharedAudioEl(url)` →
      `_sharedAudioPlayer(url, { mask, duration })`, same URL key, returning `instance.el`;
      `_dropSharedAudio()` calls `instance.destroy()` (which pauses) instead of
      `pause()` + `remove()`. Both N-output branches (`:2371`, `:2717`) mount their own
      player with `hotkeys: false`, pushed onto a `_plainAudioPlayers` list that
      `_teardownResultSurfaces()` destroys — **the shared instance must never be in that
      list**, it outlives every repaint on purpose. Pass `mask: it.thumbPath` and
      `duration: it.duration` at all three sites (`it` is already in scope; a null
      `thumbPath` is the pre-MPI-730 / ffmpeg-failed case and paints fills with no wave,
      which still scrubs — no fallback code). **Everything stays synchronous**: no rAF, no
      promise, no timeout between removing the player from one parent and appending it to
      the other, or MPI-727 comes straight back.
      **CSS:** keep `mpi-base-flow__result-audio` on the player root as the pane's sizing
      hook (the gallery does the same with `mpi-group-card__thumb`), so
      `MpiBaseFlow.css:1084` `:has()` rule and the `min(360px, 80%)` width still apply.
      `MpiFlowResultDock.css`'s `:has(audio)` still matches (the `<audio>` is inside), but
      260px was chosen for the NATIVE control's minimum width — widen it for the player and
      drop `__media audio { width: 100% }`, which now sizes a hidden element.
      **Verify:** `tests/desktop/flow-result-follows-steps.spec.js` green — it asserts node
      IDENTITY across two navigations and that the sound never stops, which is exactly the
      contract this item can break. Then a live check (below).

- [ ] **5. Consistency: `MpiVideoControlBar` adopts `MpiVolumeControl`.** Drop its own
      `muteBtn` + `volumeSlider` mounts and the `.mpi-video-control-bar__volume` wrapper;
      mount the compound in the same slot. The wiring is already there and only changes
      shape: `muteBtn.on('click')` → the compound's `mute-toggle` → `_surface._setMuted`,
      `volumeSlider.on('input'|'change')` → the compound's → `_doVolume`, and the
      `volumechange` subscriber's `setValueQuiet` + `is-active` toggle → `setValue` +
      `setMuted`. **Keep both hotkeys working**: `video.mute` currently does
      `muteBtn.el.click()` and `_adjustVolume` reads `v.volume` off the element — re-point
      the first at the compound and leave the second alone, it never touched the slider.
      `el.setVolume` / `el.setMuted` keep their signatures. Destroy the compound in
      `destroy()` where the two old mounts were destroyed.
      **Verify:** in a real window, the video workspace's volume still changes the sound and
      the mute button still flips both ways, driven from the UI **and** from `M` /
      volume-up / volume-down; the bar's right cluster is narrower by roughly the slider it
      lost. The trim bar, frame stepping and fullscreen must be untouched — if any of them
      moved, the swap reached past its edge.

- [ ] **6. Consistency: `MpiGalleryGrid` adopts `MpiVolumeControl`** — and the gallery gets
      a real mute button for the first time. Replace the decorative
      `.mpi-gallery-grid__volume-icon` `<span>` + `_paintVolumeIcon()` + the horizontal
      slider in `.mpi-gallery-grid__volume-wrap` with one mount; pass `step: 5, wheel: true`
      to keep the feel it has today. `_volume` stays the single source of truth and
      `Storage.setGalleryVolume()` stays on `input`, so hover-play, the audio cards' volume-0
      mute (`docs/gallery-audio-cards.md`) and the live `_applyVolume` sweep over
      `audio[data-src]` / `video.mpi-group-card__thumb--video` are all unchanged.
      **`mute-toggle` means volume 0 here**: map it to `_volume = 0` and remember the
      previous value so unmuting restores it — that is the behaviour the span never had, and
      the one place this item adds function rather than moving it. Give the freed ~7rem back
      to the header's centre zone (`MpiGalleryGrid.css:14-17` explains why that matters).
      **DO THIS ITEM LAST.** `MpiGalleryGrid.js` carries MPI-733's and MPI-678's
      uncommitted work (see Current State), so every stage here is hunk-level and every
      `git diff` gets read first. If the file is mid-flight when this item comes up, defer
      it and say so on the card — a shared header row is not worth clobbering a peer's
      unverified feature.
      **Verify:** live — hover an audio card and a video card, confirm the volume still
      lands on both, mute and unmute round-trips to the same level, and the setting survives
      a reload (it is in `Storage`). `tests/desktop/gallery-audio-waveform.spec.js` and the
      other gallery specs stay green: the waveform card's hover contract reads `_volume`.

- [ ] **7. The checks.** New `tests/desktop/flow-audio-player.spec.js`: mount
      `MpiAudioPlayer` directly via `await import(…)` against `/voices/child_1.opus` (real
      audio, served by `express.static`) and assert — play button → `paused === false` and
      the time text advances; a click at 50% of the waveform's width moves `currentTime`
      into the middle **as a RANGE, never a point** (the clip keeps playing during a settle:
      `docs/gallery-audio-cards.md` trap 4); mute button → `muted` flips both ways; the
      volume slider → `audio.volume`; `destroy()` → `paused === true`. Plus the two the new
      layout adds: the **flyout is hidden until the volume wrapper is hovered** (assert
      measured visibility, not a class — a CSS-only reveal is exactly the kind that a
      specificity accident leaves permanently open), and the **waveform is still the widest
      element in the row at the dock's width** (the whole reason the volume hides). Call
      `clearBootModals()` first — a fresh E2E profile stacks the 18+ gate and the changelog
      over every pixel (trap 1). Re-run `flow-result-follows-steps.spec.js` unchanged.
      **Verify:** both specs green, and each new assertion proven able to FAIL against a
      deliberately broken build before it counts.
      **Then the live check, which no spec covers:** the specs run maskless, so the wave
      itself is only ever painted in a real app — generate a TTS line or a foley hit in the
      user's own app, confirm the wave paints in the pane, scrub it, step back off the last
      step and confirm the dock takes the same player still playing.

- [ ] **8. Registrations and docs — sequenced last, because MPI-728 holds two of the files.**
      `js/shell/preloadStyles.js`: add `MpiAudioPlayer.css`, `MpiVolumeControl.css`
      **and `MpiWaveform.css`** — the last is missing (MPI-730 registered the component in
      `types.js` but not the FOUC manifest), and the player mounts the waveform, so its
      absence would flash the player's own track. `js/components/types.js`: add the
      `MpiAudioPlayerProps` and `MpiVolumeControlProps` typedefs in house style, and extend
      `MpiProgressBarProps` with `orientation`. If MPI-728's claim is still live when this item comes up, `mpi-message`
      that session and record the two pending lines on the card rather than writing over a
      live claim. `docs/gallery-audio-cards.md` (133/200 lines) gains a short **"The
      player"** section — the sibling-not-a-mode decision, the one-instance-per-URL /
      MOVED-not-rebuilt rule, and the MpiProgressBar-not-MpiFader note; split to
      `docs/audio-player.md` only if it pushes the file past 200.
      **Verify:** `python <mpi-lib>/scripts/validate_board.py .` exits 0; `docs/README.md`
      row still points at the right file.

## Completed

- [x] **1. `MpiProgressBar` `orientation: 'vertical'`** (2026-09-12, `eeef13dc`). Template adds
      `mpi-progress--vertical` and writes `bottom`/`height` instead of `left`/`width`;
      `updateVisuals` does the same; CSS scoped under `.mpi-progress--vertical` with
      `writing-mode: vertical-lr; direction: rtl` on the native input. Verified by
      `tests/desktop/flow-audio-player.spec.js` in a real window: bottom click reads LOW, top
      reads HIGH, fill anchored at the bottom, horizontal control beside it untouched.
      **Falsified**: without `direction: rtl` a bottom click reads 100 and the spec fails.

- [x] **2. `MpiVolumeControl`** (2026-09-12, uncommitted). `js/components/Compounds/MpiVolumeControl/`
      — `MpiButton` mute + vertical `MpiProgressBar` in an upward flyout, owns no media.
      Props `{ value, muted, step, wheel, info }`; API `setValue` / `setMuted` / `getValue`
      (both setters quiet); emits `input` / `change` / `mute-toggle { muted }`. Panel 140px,
      travel 112px (`--s-8`). Verified by the second test in
      `tests/desktop/flow-audio-player.spec.js`, mounted in a real `MpiVideoControlBar`'s right
      cluster in place of its own pair: hidden and click-through before hover, open on hover,
      survives the pointer travelling up into it, top click LOUD / bottom QUIET, mute asks
      `muted: true`, setters never echo, closes on leave. **Falsified**: with `:focus-within`
      in place of `:has(:focus-visible)` the "leaving closes" assertion fails.

- [x] **Wheel + 5. `MpiVideoControlBar` adopts `MpiVolumeControl`** (2026-09-12, uncommitted,
      session `59f90600`). Wheel: `WHEEL_STEP = 5`, always on, one capture listener on the
      root (button AND panel), slider mounts `wheel: false`, `wheel` prop deleted. Bar: own
      mute + horizontal slider + wrapper + 5 CSS rules gone; `mute-toggle` and the `M` hotkey
      both call `_toggleMute()`; attach/`volumechange` mirror via `setValue`/`setMuted`.
      `MpiVolumeControl.css` added to `preloadStyles.js` (item 8's line, pulled forward).
      Test 2 now mounts bare + asserts the wheel; new test 3 drives a real `MpiVideoSurface`
      through the bar (button, wheel, `M`, arrows). 3 passed; wheel and `M` falsified.
      Side effect, deliberate: the bar's volume fill is `primary`, no longer `--accent-heat`.
      **Fabio signed off item 5 live in the video workspace, 2026-09-12 ("it works great").**

- [x] **Zero reads as muted** (2026-09-12, Fabio's ask after the live look). In
      `MpiVolumeControl`, so all three consumers get it: the speaker shows its muted icon when
      the level is 0 as well as when muted (`_paint` = `_muted || value === 0`, repainted on
      drag input, wheel, `setValue`, `setMuted`). A click at zero RESTORES the level the
      lowering gesture began from (snapshot on root `pointerdown` capture + wheel-burst start,
      `WHEEL_GESTURE_GAP_MS = 400`), reported as `input`/`change` — never `mute-toggle`, which
      would re-mute after the consumer's volume handler unmutes. Known ceiling (ponytail
      comment): hotkey changes arrive through `setValue` and are not snapshotted. Tests 2 + 3
      extended; both halves falsified.

**Where it stands (2026-09-12, session `59f90600`):** items 1, 2, wheel, 5 and zero-as-muted
done, verified, Fabio-approved. **NEXT: item 5b** — in the video workspace (Group History),
move the transport bar BELOW the PromptBox so the PromptBox's upward panel stops covering the
bar's buttons. Then item 3 — `MpiAudioPlayer` as a **very small widget whose width the
consumer sets**, so it fits a Flow. Master CI is green again since `da3b23bc`.

## Remaining Work

- **5b. Transport bar below the PromptBox in the video workspace** (Fabio, 2026-09-12, with the
  bar live on screen). Facts found, not yet designed: `MpiGroupHistoryBlock`'s grid is
  `header / left centre right / controls`; the bar mounts in `#controls-slot`
  (`.mpi-group-history-block__controls`, grid row 3, `auto`). The PromptBox sits in
  `.mpi-group-history-block__bottom` — `position: fixed; bottom: 30px; z-index: 10`,
  "shell-managed" — so it floats OVER the grid rather than taking a row, and its ▲ expander
  opens upward across the bar. Read `.claude/rules/component-mounts.md` § MpiVideoControlBar
  and `docs/workspaces.md` first; the rule files need Fabio's permission to edit. Only the
  video workspace is in scope — the Flow result pane mounts its own bar under the split.
  **Verify:** in a real window the bar sits below the PromptBox, the PromptBox's expanded
  panel no longer covers any bar button, the volume flyout still opens unclipped, and
  image groups (no bar, `:empty`) keep their layout. Then Fabio's live look.
- `js/components/types.js`'s `MpiWaveformProps` typedef is **stale** from MPI-730 — it says
  the played layer is an `--accent-heat` tint (it is `--accent-audio` now) and its `seek`
  payload omits `modified`. Not this card's mess and not this card's file to fix; flag it
  to the user, and fold it into item 8 only with permission.
- Whether the recorder dialog and the media-picker tiles should get the same player.
- A one-line demo follow-up once **MPI-739** releases `js/pages/components.js`: the vertical
  `MpiProgressBar` variant and `MpiVolumeControl` belong on that page beside their siblings.
- **MPI-740** (`MpiFader`'s wheel) is filed and independent — nothing here waits on it, and
  nothing there should wait on this.

## Plan Drift

- **2026-09-12 — the card grew two consistency items, on Fabio's instruction.** The volume
  control was going to be private to the player. He pointed out the app already has the
  mute-plus-volume pair in two places — the video workspace and the gallery header — and
  that all three must match, so the button+flyout became `MpiVolumeControl` (item 2) with
  three consumers (items 3, 5, 6). Net effect on size is smaller than it reads: both
  existing surfaces hand-wire an icon and a slider today and each loses that wiring.
  The gallery also gains a mute button it never had — its icon is a decorative `<span>`.
- **2026-09-12 — `MpiFader` was NOT the recommendation, and the scope growth settled it.**
  Fabio read the first plan as suggesting `MpiFader` ("I don't mind if we use MpiFader like
  you are suggesting"); it suggested the opposite and recorded `MpiFader` as the alternative
  to avoid. With three surfaces in scope the case closes: the video bar and the gallery are
  both already linear 0-100 bound to `media.volume`, so adopting `MpiFader` would re-taper
  two shipped surfaces to dB as a side effect of an audio-player card. It would also pull
  **MPI-740** onto the critical path — filed from this same conversation after he found that
  `MpiFader`'s wheel crawls (0.1 dB per tick over a 72 dB travel) and can never leave the
  unity detent (`detent` is cleared only on `keydown`, so every wheel tick inside the 1 dB
  tolerance is snapped back to 0 dB). Those are real defects in the mix fader and they are
  fixed there, not here.
- **2026-09-12 — two rows became one, and the volume went vertical (Fabio, with the video
  player on screen).** The plan shipped with a two-row transport (waveform on top, controls
  under it) on the reasoning that one row cannot hold a horizontal volume slider at the
  dock's width. Correct premise, wrong conclusion: the answer is that the volume does not
  sit in the row at all. It hides behind the mute button and pops out **vertically** on
  hover, so the row stays `play │ time │ waveform │ mute` and the waveform keeps the width —
  which matters most exactly where the player is small, the case the two-row layout was
  invented for. Row order and the reference layout are his; do not drift back.
- **2026-09-12 — the vertical slider people remember does not exist.** Fabio recalled the
  gallery having "a vertical and horizontal slider" and expected `MpiProgressBar` to carry
  the option already. It does not, and never did: `orientation` appears nowhere in that
  Primitive and `git log -S vertical` over its folder returns **0 commits**. The gallery has
  two HORIZONTAL sliders side by side (size + volume). The only vertical slider in the app
  is `MpiFader`, which is a dB mix gain with unity in the middle and +12 dB of boost that
  `HTMLMediaElement.volume` cannot use. So this card now ADDS the option to `MpiProgressBar`
  (item 1) rather than reaching for `MpiFader` — one Primitive owns sliders, and the next
  surface that wants a vertical one should find it there.
- **2026-09-12 — item 2 built slightly different from its spec, each for a measured reason.**
  (a) **`:has(:focus-visible)`, not `:focus-within`**: a mouse click leaves focus on the
  button or the range, so `:focus-within` held the flyout open after the pointer left —
  proven by swapping it back and watching the spec fail. Keyboard focus still opens it.
  (b) **No separate `setValueQuiet`**: `setValue` is already quiet, because every consumer
  is the source of truth and only ever mirrors state back; an emitting setter had no caller.
  (c) **An `info` prop** for the mute tooltip: only the video bar binds `M`, so a hardcoded
  "(M)" would lie in the gallery and the player's N-output mounts.
  (d) **The flyout opens UPWARD only.** Right for the video bar and the dock; the gallery
  header sits at the TOP of its workspace, so item 6 may need a downward modifier. Not built
  until item 6 proves it.
- **2026-09-12 — Fabio's flyout sign-off reorders the card and settles the wheel.** Height
  and upward direction approved as built. The wheel is ON for every mount and fast, gallery
  speed (5 per tick): make `wheel` default true and step the wheel by 5 in
  `MpiVolumeControl` itself rather than asking each consumer, then drive it by wheel in the
  spec. Item 5 now precedes item 3 so the control is seen live in the video workspace
  before the player is built. Item 3 constraint added: the player is a **small** widget and
  its width is the consumer's to set (no fixed or minimum width that fights a Flow pane).
- **2026-09-12 — two item-8 premises are stale.** `MpiWaveform.css` IS already in
  `js/shell/preloadStyles.js` (line 83), and no live claim holds `preloadStyles.js` or
  `types.js` (MPI-728's record is complete). Item 8 is unblocked. It also matters more than
  it read: an unregistered component stylesheet loads async on first mount, and the spec
  measured the flyout OPEN before the sheet landed — that flash is what users would see.
- **2026-09-12 — Fabio's live look at item 5 added two asks, both folded into this card.**
  (1) Zero reads as muted, like standard volume controls — built in `MpiVolumeControl`, with
  a click at zero restoring the pre-gesture level, because a speaker that shows muted and
  toggles only a flag would look dead. (2) Move the video workspace's transport bar below the
  PromptBox — item 5b, next session, before item 3. `MpiVolumeControl.css` preload (item 8)
  already landed with item 5.

## Verification

- `npx eslint` clean on every touched file.
- **`MpiProgressBar` regression, because item 1 edits a Primitive ~40 surfaces mount:**
  the horizontal path byte-for-byte unchanged in behaviour (one existing slider driven
  live), `grep -c "MpiProgressBar.mount" ` equal before and after, and the vertical one
  filling from the BOTTOM with its reported value matching the pointer.
- `tests/desktop/flow-audio-player.spec.js` green, each assertion falsified once.
- `tests/desktop/flow-result-follows-steps.spec.js` green — MPI-727 did not regress.
- Node suite green (`npm test`) — nothing here touches it, so a change there is a signal.
- A real audio generation in the user's own app: the wave paints, a scrub lands, and the
  player rides the dock across a step change without stopping.
- **The two adopted surfaces, live, because a shared control is where a swap goes wrong
  quietly:** the video workspace's volume and mute still work from the UI and from `M` /
  volume-up / volume-down, with trim, frame stepping and fullscreen untouched; the gallery's
  volume still reaches both an audio card and a hover video, its new mute round-trips back
  to the same level, and the setting survives a reload. Gallery specs stay green.

## Preservation Notes

- `docs/gallery-audio-cards.md` gains the player section at close-out (item 8).
- Durable facts worth keeping: the `MpiProgressBar`-not-`MpiFader` reasoning (it reads like
  a rule violation and is not), the sibling-not-a-mode evidence, and the fact that a flow
  result item already carries `thumbPath` + `duration` so no route work is ever needed for
  an audio surface.
- If `MpiWaveform` ever grows an `<audio>`, this card and MPI-730 both break: that split is
  load-bearing, not a style choice.
- **Correction worth keeping: `MpiProgressBar` never had a vertical option.** It reads like
  a regression (the gallery looks like it lost one) and it is not — the gallery has TWO
  horizontal sliders side by side, size and volume, and `git log -S vertical` over the
  Primitive's folder returns 0 commits. `MpiFader` is the only vertical slider in the app
  and it is a dB mix gain. After item 1 the option exists for real; before it, anyone
  going looking for the one that "used to be there" is hunting nothing.
