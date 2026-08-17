# MPI-571 Plan — one shared latent-preview consumer

## Goal

Four surfaces each re-implement the accumulate-ring + `rate` playback that
`docs/preview-bus.md` already specifies, and three of them get it wrong.
Extract ONE consumer they all share. Do not touch the bus.

## Current State

All five phases are CODE-COMPLETE and offline-verified. 615/615 node tests pass,
eslint clean, and the gallery / video-viewer halves were driven live in a real
browser (own isolated instance on :55188, since torn down).

**The single next action is a live clip-bursting generation** with the Flow pane and
the minimised window open — the only two surfaces a synthetic probe could not reach,
and the two Fabio actually reported. GPU is shared; ASK before dispatching. If it can
be a FOLEY run, read the DISPATCHED prompt back from Comfy `/history` and MPI-531's
last debt parks with it.

**Fabio's call 2026-08-17:** he will run the generations himself and watch all FOUR
surfaces — Gallery, History workspace, Flows, Minimised Preview — as the first job of
the next session. So the next session opens on that check, not on new code. Nothing
here is believed to work on a real run until he has looked; the offline probe only
proves the gallery and the video-viewer layer.

## The divergence, measured against the code

| Surface | File | On a clip run today |
|---|---|---|
| Gallery card | `js/components/Compounds/MpiGalleryGrid/MpiGalleryGrid.js:487-575` | ring + cursor + `setInterval` at `clip.rate`, ring sized by `clip.length`, revokes on eviction — **CORRECT, the reference** |
| Flow result pane | `js/components/Organisms/MpiBaseFlow/MpiBaseFlow.js:1284` -> `_paintResult:1190` | swaps `<img>.src` on EVERY frame as fast as they arrive -> replays whole clip fast per sampler step, freezes on the last |
| Group History | `js/components/Blocks/MpiGroupHistoryBlock/MpiGroupHistoryBlock.js:776` | `if (isVideo) return;` — no video preview at all |
| Float window | `js/shell/floatLatentBridge.js:124` + `main/float-latent.html:139` | `FRAME_MIN_MS` throttle forwards only the NEWEST frame; the window does a still `<img>` swap -> **one still frame** |

Fabio's two reported symptoms are rows 2 and 4 exactly. Row 4 is even
ponytail-commented as a deliberate simplification at `main/float-latent.html:126`
— that comment is what this card overturns.

The bus is innocent: `activeGenerations.getPreviewClip(genId)` is per-generation,
re-readable per frame, and already correct (MPI-535).

## Approach

### Phase 1: extract the player

New `js/services/previewClipPlayer.js`:

```js
createPreviewClipPlayer({ paint, onEvict, canPaint }) -> { push(url, clip), reset(clip), stop() }
```

Owns: the ring, the cursor, the `setInterval` at `clip.rate`, still-vs-clip mode,
and the eviction revoke. Consumer supplies only:

- `paint(url)` — put this URL on screen (or forward it)
- `onEvict(url)` — last chance to abort an in-flight preload before the revoke
  (gallery needs this; see `_abortPendingPreload`)
- `canPaint()` — gallery's `_generating` gate

**Blob ownership is unchanged** (`docs/preview-bus.md` § Blob ownership): the
retainer frees the URL. The player IS the retainer now, so the revoke moves into
it and the bus is untouched.

**Ownership:** `js/services/previewClipPlayer.js`, `tests/previewClipPlayer.test.cjs`

### Phase 2: gallery card onto the player

Replace the ~110 lines at `MpiGalleryGrid.js:487-575` with the player plus the
three hooks. **This is the risk of the whole card** — it is the one surface that
works. Behaviour must be indistinguishable.

**Ownership:** `js/components/Compounds/MpiGalleryGrid/MpiGalleryGrid.js`

### Phase 3: Flow result pane + Group History

Both subscribe to `preview:frame` already. Both gain: read
`getPreviewClip(entry.id)` per frame, push through a player whose `paint` is the
surface's existing single-URL painter, honour `generation:preview-reset`, and
`stop()` on run end / `destroy()`.

History additionally drops its `if (isVideo) return;` bail — that line is why a
video generation shows nothing there at all.

**Ownership:** `js/components/Organisms/MpiBaseFlow/MpiBaseFlow.js`,
`js/components/Blocks/MpiGroupHistoryBlock/MpiGroupHistoryBlock.js`

### Phase 4: float window

The cross-document one. `blob:` URLs and the `Events` bus do not cross a
`BrowserWindow`, and a 56-frame clip re-encoded to data URLs per sampler step is
the RAM flood `FRAME_MIN_MS` exists to prevent.

So the player runs in the BRIDGE, on cheap blob URLs, and its `paint` is the
existing throttled encode-and-send. The float window stays a dumb `<img>` swap
and needs no clip machinery. Net effect: looping motion in the minimised tile,
sampled at the IPC rate, with **zero** change to encode volume.

**Ownership:** `js/shell/floatLatentBridge.js`

### Phase 5: doc + live check

`docs/preview-bus.md` gains a "Consuming frames" section naming the player as the
one way to consume, so the fifth surface does not re-implement this again.

## Verification

**Verify mode:** user-ux

Offline first (no GPU): synthetic clip frames pushed through each consumer's own
update path — the harness in memory `tool_repro_a_preview_frame_race_without_a_gpu`
— plus a node test on the player itself (still mode, clip mode, ring eviction,
rate change, marker-miss self-heal). Then `npm test` + `npm run lint`.

Then ONE live clip-bursting generation with all four surfaces open. GPU is
shared — ASK Fabio before dispatching.

**If that run is a FOLEY (LTX) run it also parks MPI-531's last debt**: read the
DISPATCHED prompt back from Comfy `/history` to prove the step-field promotion
actually reached the graph (it fails silently — the box on screen is not
evidence). A run on any other flow does not park it.

## Remaining Work

- [x] Phase 1 — the player + its test (9 tests, all green)
- [x] Phase 2 — gallery card onto it, behaviour verified unchanged live
- [x] Phase 3 — Flow pane + Group History (+ the new video-viewer latent layer)
- [x] Phase 4 — float window via the bridge
- [x] Phase 5 — docs split + rewritten
- [ ] **The live four-surface check** — needs one clip-bursting generation. BLOCKED
      on Fabio's go: the GPU is shared with a Cubric-Prompt sweep.

## Plan Drift

**2026-08-17 — History was NOT a wrong re-implementation of the ring. It had no
surface at all.** The card's premise was that four consumers each rebuilt the ring
and got it wrong. True for the Flow pane and the float window; false for History.
Its image path was already correct (still runs replace each frame, which is right)
and its video path did `if (isVideo) return` with a *stated, correct* reason: a JPEG
latent cannot be painted into a `<video>`. So the fix there was not extraction — it
was giving `MpiVideoViewer` a latent LAYER over its existing stage stack
(`setLatentPreview`, z-index 2, between the player and the crop overlay). That is
net-new UI, small, and the honest completion of "History needs the same playback".
A clip-bursting run always lands in History as a VIDEO group, so this is the branch
that mattered.

**2026-08-17 — a seam the plan did not anticipate: `ownsFrames`.** Making three more
surfaces RETAIN frames created a hazard the single-consumer design did not have — two
retainers of the same run, one revoking blobs the other is still looping (the MPI-508
ERR_FILE_NOT_FOUND storm, self-inflicted). Checked rather than assumed: the three
in-renderer surfaces are mutually exclusive by scope (`scope: 'gallery'` mounts a
placeholder card, `groupHistory` mounts the History viewer, and `flowService` mounts
NO gallery placeholder — MPI-306), so each may own its own. The float bridge forwards
every run regardless of scope and overlaps all three, so it must not own. Default is
false: a consumer that should have owned leaks a bounded, already-documented amount;
one that should not have owned silently breaks another surface.

**2026-08-17 — the float window's `seq` had to become the BRIDGE's own counter.** A
looping player replays earlier frames, so their bus `seq` runs backwards, and
`float-latent.html` drops anything not strictly newer. Forwarding the bus seq would
have frozen the tile on frame 1 — reproducing the exact bug being fixed, from the
opposite direction.

**2026-08-17 — two MPI-565 tests were pinned to the old function names.** Their
invariants survive the extraction (destroy stops both timers; abort-before-revoke),
but the abort-before-revoke law now lives in the player while the abort itself stays
on the card, so that test checks both files.

**2026-08-17 — `docs/preview-bus.md` was already 68% over the 200-line rule** before
this card and my section made it 378. Split at its natural seam: the TAESD/decoder
half (which weight, which loader, the `lighttaew*` landmine) became
`docs/preview-decoders.md` (149 lines); the bus contract + the one consumer + blob
ownership stayed (247). `docs/README.md` map retargeted and the remainder recorded on
the exemption list, same rationale as its peers.

## Completed

**Phase 1 — `js/services/previewClipPlayer.js`.** `createPreviewClipPlayer({paint,
onEvict, canPaint, ownsFrames})` -> `{push, reset, stop, isClip}`. Owns the ring, the
cursor, the `setInterval` at `clip.rate`, still-vs-clip mode and the eviction revoke.
`tests/previewClipPlayer.test.cjs`, 9 tests on mocked timers: still replace, clip
loop at the announced rate, ring sized by the announced length, cursor alignment
after eviction, marker-miss self-heal, rate re-arm, stage reset, teardown, and the
non-owning default.

**Phase 2 — gallery card.** ~112 lines at `MpiGalleryGrid.js:463-574` replaced by the
player plus the two card-specific hooks it kept (`_abortPendingPreload` on `onEvict`,
`_generating` on `canPaint`). Owner of its frames.

**Phase 3 — Flow pane + History.** `MpiBaseFlow` pushes through the player with
`getPreviewClip(entry.id)` re-read per frame, handles `generation:preview-reset`, and
stops in `_setRunning(false)` (the one choke point every end path already routes
through) and in `destroy()`. `MpiGroupHistoryBlock` same, plus the dropped `isVideo`
bail and a new `_endPreviewPlayback()` on complete / error / cancelled.

**Phase 4 — float window.** Per-lane players in `floatLatentBridge`, paced on cheap
blob URLs; the existing `FRAME_MIN_MS` throttle became `sendFrame()`, the player's
paint target. Data-URL volume is UNCHANGED — the throttle now samples a loop instead
of the newest frame, so the tile moves for free. `float-latent.html` stays a dumb
`<img>` swap; only its ponytail comment changed, because it was documenting the bug.

**Phase 5 — docs.** `docs/preview-bus.md` gained "Consuming frames —
`previewClipPlayer` is the ONLY way", with the before/after table for all four
surfaces, the cross-document pattern, and the `ownsFrames` rule. Decoder half split
to `docs/preview-decoders.md`.

**Offline verification (real browser, own isolated instance, no GPU).**
- All six touched modules import clean in the page.
- Gallery card, 4-frame synthetic clip at rate 8: painted
  `0,0,1,2,2,3,3,0,0,1,1,2,2,3,3,0,...` — every frame, cycling, wrapping. The
  reference behaviour, preserved through the extraction.
- Gallery card, still mode (`clip: null`): each frame replaces the last and it
  HOLDS on the last, no timer. The common path, no regression.
- `MpiVideoViewer.setLatentPreview`: hidden by default, paints with the right src at
  `z-index: 2` / `position: absolute` / `pointer-events: none`, hides and drops its
  src on `null`.
- `removeCard` tears the card down and stops the loop.
- Browser console clean apart from a 404 from my own bad probe URL.
- 615/615 node tests, `npm run lint` clean.
