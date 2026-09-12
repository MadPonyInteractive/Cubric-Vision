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
need are sequenced last — item 4 — and neither blocks the feature. `MpiBaseFlow.css`,
`types.js` and `preloadStyles.js` all carry uncommitted peer hunks: **stage by hunk, never
`git add` the file.**

## Decided at plan time

The brief left three things open and asked for a fourth decision explicitly. All four are
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

## Implementation

- [ ] **1. Build `MpiAudioPlayer`** (`js/components/Compounds/MpiAudioPlayer/MpiAudioPlayer.js`
      + `.css`). Owns ONE `<audio>` (created in `setup`, `preload: 'metadata'`, `src` from
      props, never re-pointed) and mounts, through `ComponentFactory.create()`:
      `MpiButton` `{ icon: 'play', iconActive: 'pause', size: 'sm', info: 'Play/Pause (SPACE)' }`,
      `MpiButton` `{ icon: 'volumeHigh', iconActive: 'volumeOff', size: 'sm', info: 'Mute/Unmute (M)' }`,
      `MpiProgressBar` `{ min: 0, max: 100, step: 1, value: 100, suffix: '%', interactive: true, handle: true, variant: 'primary' }`,
      `MpiWaveform` `{ mask, duration }`, and one `.mpi-audio-player__time` span.
      **Props:** `{ src, mask, duration, hotkeys = true }`. **API:** `getAudioElement()`,
      `setMask(url)`, `destroy()`. **Layout: two rows in one grid** — the waveform full
      width on top (the scrub track is the point), then `play │ time │ ——— │ mute │ volume`.
      One layout, no responsive branch: it has to read at the dock's 200-260px and at the
      pane's `min(360px, 80%)`, and a single row cannot. BEM `.mpi-audio-player__*`; tokens
      only; the consumer may SIZE it and nothing else.
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
      **Verify:** `npx eslint` clean on the new files; behaviour is item 3.

- [ ] **2. Wire it into the Flow's two audio surfaces.** `_sharedAudioEl(url)` →
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

- [ ] **3. The checks.** New `tests/desktop/flow-audio-player.spec.js`: mount
      `MpiAudioPlayer` directly via `await import(…)` against `/voices/child_1.opus` (real
      audio, served by `express.static`) and assert — play button → `paused === false` and
      the time text advances; a click at 50% of the waveform's width moves `currentTime`
      into the middle **as a RANGE, never a point** (the clip keeps playing during a settle:
      `docs/gallery-audio-cards.md` trap 4); mute button → `muted` flips both ways; the
      volume slider → `audio.volume`; `destroy()` → `paused === true`. Call
      `clearBootModals()` first — a fresh E2E profile stacks the 18+ gate and the changelog
      over every pixel (trap 1). Re-run `flow-result-follows-steps.spec.js` unchanged.
      **Verify:** both specs green, and each new assertion proven able to FAIL against a
      deliberately broken build before it counts.
      **Then the live check, which no spec covers:** the specs run maskless, so the wave
      itself is only ever painted in a real app — generate a TTS line or a foley hit in the
      user's own app, confirm the wave paints in the pane, scrub it, step back off the last
      step and confirm the dock takes the same player still playing.

- [ ] **4. Registrations and docs — sequenced last, because MPI-728 holds two of the files.**
      `js/shell/preloadStyles.js`: add `MpiAudioPlayer.css` **and `MpiWaveform.css`** — the
      latter is missing (MPI-730 registered the component in `types.js` but not the FOUC
      manifest), and the player mounts the waveform, so its absence would flash the
      player's own track. `js/components/types.js`: add the `MpiAudioPlayerProps` typedef in
      house style. If MPI-728's claim is still live when this item comes up, `mpi-message`
      that session and record the two pending lines on the card rather than writing over a
      live claim. `docs/gallery-audio-cards.md` (133/200 lines) gains a short **"The
      player"** section — the sibling-not-a-mode decision, the one-instance-per-URL /
      MOVED-not-rebuilt rule, and the MpiProgressBar-not-MpiFader note; split to
      `docs/audio-player.md` only if it pushes the file past 200.
      **Verify:** `python <mpi-lib>/scripts/validate_board.py .` exits 0; `docs/README.md`
      row still points at the right file.

## Completed

## Remaining Work

- User-ux sign-off on the layout: a two-row transport is a plan-time call, and where the
  volume slider sits is exactly the kind of thing the user looks at once and changes.
- `js/components/types.js`'s `MpiWaveformProps` typedef is **stale** from MPI-730 — it says
  the played layer is an `--accent-heat` tint (it is `--accent-audio` now) and its `seek`
  payload omits `modified`. Not this card's mess and not this card's file to fix; flag it
  to the user, and fold it into item 4 only with permission.
- Whether the recorder dialog and the media-picker tiles should get the same player.

## Plan Drift

## Verification

- `npx eslint` clean on every touched file.
- `tests/desktop/flow-audio-player.spec.js` green, each assertion falsified once.
- `tests/desktop/flow-result-follows-steps.spec.js` green — MPI-727 did not regress.
- Node suite green (`npm test`) — nothing here touches it, so a change there is a signal.
- A real audio generation in the user's own app: the wave paints, a scrub lands, and the
  player rides the dock across a step change without stopping.

## Preservation Notes

- `docs/gallery-audio-cards.md` gains the player section at close-out (item 4).
- Durable facts worth keeping: the `MpiProgressBar`-not-`MpiFader` reasoning (it reads like
  a rule violation and is not), the sibling-not-a-mode evidence, and the fact that a flow
  result item already carries `thumbPath` + `duration` so no route work is ever needed for
  an audio surface.
- If `MpiWaveform` ever grows an `<audio>`, this card and MPI-730 both break: that split is
  load-bearing, not a style choice.
