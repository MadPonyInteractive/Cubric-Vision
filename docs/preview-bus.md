# Latent-preview bus

One system ingests binary latent-preview frames from **both** engines (local ComfyUI
WS + remote Pod proxy WSS), attributes each to its generation, filters non-image
frames, and emits **one engine-tagged event any surface can subscribe to**. To show
live latents anywhere (gallery card, Flow pane, a future OS floating window) you
subscribe to one event — no per-consumer WS handling, no engine checks, no attribution
logic. Shipped MPI-269 (`8f057a7c`).

## Subscribe

```js
Events.on('preview:frame', ({ engine, promptId, seq, url }) => { … })
```

| field      | meaning |
|------------|---------|
| `engine`   | `'local'` or `'remote'` — already resolved at ingest from which WS URL the socket bound. |
| `promptId` | the ComfyUI prompt this frame belongs to. Server-truth (see Attribution). |
| `seq`      | monotonic per-`promptId` counter. Only assigned to REAL image frames. Drop a frame if you already painted a higher seq. |
| `url`      | object URL for the JPEG blob. **Paint it and forget it → the bus frees it.** RETAIN it (buffer, replay, hold past the next frame) and it is **yours to revoke** — see Blob ownership. |

Resolve the generation:
```js
const entry = activeGenerations.byPromptId(promptId); // GenerationEntry | null
```
`null` = frame arrived before the `/prompt` ack set the promptId (transient). Skip it —
never fall back to "the active gen" (that was the cross-gen mis-attribution bug).

## Last-latent hold (show latents anywhere, even between frames)

A consumer that mounts or repaints **between** frames — e.g. during a slow second sampler
that emits no previews for tens of seconds — gets the current latent immediately:

```js
const last = activeGenerations.getLastPreview(genId); // {engine,promptId,seq,url} | null
if (last) paint(last.url);
```
The bus records the last-good latent per generation (cleared on `end()`). This is what
keeps a pane showing the last latent through a gap instead of going blank.

## Clip runs vs still runs — read it off the GENERATION, never latch it (MPI-535)

A burst previewer sends **one `VHS_latentpreview` marker per sampler run**, then a whole
clip of `PREVIEW_IMAGE` frames per step. That marker is the only thing separating a clip
run (accumulate + loop) from an ordinary still run (each frame replaces the last), and it
fires **exactly once**. So it is recorded on the generation, not on whoever was mounted
when it arrived:

```js
activeGenerations.resetPreview(genId, { length, rate }); // marker → durable per-run state
activeGenerations.getPreviewClip(genId);                 // {rate, length} | null — re-read per frame
```

`MpiGalleryBlock` hands the result to the card with **every** frame; the card mirrors it
and never latches. That is what makes a missed marker survivable, and it has to be:

- The card may not be in `_cardMap` yet when the marker lands.
- `setGenerating(null)` on any grid render calls `_clearPreviewImage()` →
  `_stopPreviewPlayback()`, which wipes playback state — reachable in the window between
  the marker and the first frame, before `latestPreviewUrl` is set.
- **A single-pass H3 run is ONE prompt = ONE marker for the whole run.** Multi-stage is two
  prompts (preview, then Finish), so it gets a second arming and *looks* fine — which is
  exactly how this shipped: reported as "single-pass is broken", actually a race that a
  later single-pass run won. Reproduced deterministically by delivering frames with no
  marker at all; the card now self-heals on the next frame.

`rate` and `length` are the clip's own contract and both are **used**, not decoration:
playback runs at `rate` (H3 announces 24, KJNodes' LTX override 16 — 8fps is only the
fallback) and the ring is sized by `length` (a shorter ring silently replays the clip's
tail — 48 of H3's 56 frames). Measured on the real card: 24 painted frames/s at rate 24,
7–8 at rate 8, and a no-clip burst still freezes on its last frame as it should.

## Consuming frames — `previewClipPlayer` is the ONLY way (MPI-571)

Do **not** paint `preview:frame` straight onto a surface, and do not write a second
ring. Everything above describes what ARRIVES; `js/services/previewClipPlayer.js` is
the one consumer that turns it into something watchable:

```js
const player = createPreviewClipPlayer({ paint: (url) => img.src = url });
Events.on('preview:frame', ({ promptId, url }) => {
    const entry = activeGenerations.byPromptId(promptId);
    if (!entry || !mine(entry)) return;
    player.push(url, activeGenerations.getPreviewClip(entry.id)); // clip EVERY frame
});
Events.on('generation:preview-reset', ({ id, clip }) => { /* mine? */ player.reset(clip); });
// and player.stop() from destroy() AND from every run-end path
```

**Why this is a rule and not a suggestion.** Four surfaces consumed this bus and
three had written their own consumer, each wrong in a different way — which is the
signature the bug was reported by: the same run showed *one still frame* in the
minimised window while the Flow pane *replayed the whole clip at burst speed on every
sampler step* and then froze.

| surface | what it did before | fix |
|---|---|---|
| gallery card (`MpiGalleryGrid`) | the correct ring — this module IS its ring, extracted | uses the player |
| Flow result pane (`MpiBaseFlow`) | `<img>.src` per frame on arrival → burst replay, then a freeze | uses the player |
| Group History (`MpiGroupHistoryBlock`) | `if (isVideo) return` — nothing at all on a video run | uses the player; the video branch paints `MpiVideoViewer.setLatentPreview()` |
| float window (`floatLatentBridge`) | forwarded only the NEWEST frame under a throttle → one still frame | player runs in the BRIDGE on blob URLs; the throttle samples the loop |

The float window is the shape to copy for any **cross-document** consumer: pace in the
renderer where the blobs are cheap, and let the existing throttle sample the loop.
Playing the clip in the other window instead would mean base64-encoding a 56-frame clip
per sampler step, which is the RAM flood `FRAME_MIN_MS` exists to prevent. Its `seq`
is the **bridge's own counter**, not the bus's — a looping player replays earlier
frames, so a forwarded bus `seq` runs backwards and a newer-only guard freezes the tile
on frame 1.

**`ownsFrames`: at most one player per generation may set it.** See Blob ownership
below — two owners means one revokes frames the other is still looping. The three
in-renderer surfaces are mutually exclusive by scope (`scope: 'gallery'` mounts a
placeholder card, `groupHistory` mounts the History viewer, and a Flow run mounts no
gallery placeholder at all — MPI-306), so each owns its own. The float bridge forwards
every run regardless of scope, overlaps all three, and therefore must not own. It
defaults to false: a consumer that should have owned leaks a bounded amount, one that
should not have owned silently breaks another surface.

**A non-owning consumer needs `generation:preview-reset` MORE than an owner does, not
less.** The reset listener in the snippet above is not optional bookkeeping: the owners
REVOKE the whole window on a stage reset, so a consumer that holds those same URLs and
skips the event goes on painting dead blobs until enough new frames push them out of
its ring — a `fetch()` rejection per frame and a stuttering surface. The float bridge
shipped without that listener and was the only consumer it could hurt (`ae8d6149`).

**Background timer throttling is NOT a hazard here — measured, do not re-chase.** The
float window's pacing runs on a `setInterval` in the MAIN renderer, which is hidden
exactly when that window is up, so Chromium's 1s hidden clamp and its 5-minute
intensive tier look like the obvious suspects. Neither applies: an Electron window
minimised on Windows keeps `document.visibilityState === 'visible'`, and a 125ms
interval ticked 80/80 per 10s while visible, while minimised, and again after 5m20s
minimised.

## Broken-frame gate (why you never receive garbage)

ComfyUI sends **non-image binary frames on the same preview socket** — e.g. a type-3,
~93-byte stage/progress marker emitted when a second model initializes in a multi-sampler
workflow (SDXL → PiD). The gate in `comfyController._stripPreviewHeader` is **general, not a
special-case**: a frame is a preview image iff it declares **ComfyUI event type 1**
(first 4 bytes big-endian = `PREVIEW_IMAGE`) **OR** carries a JPEG SOI (`FF D8`) with a
`>1KB` payload. Everything else returns `null` → skipped → `preview:frame` never fires
for it → consumers keep their last latent.
- Do **not** rely on an SOI-scan alone: a non-image marker's bytes can contain a
  coincidental `FF D8` and false-match.
- The SOI+size fallback (accept a sizable JPEG even with a nonstandard event type) keeps
  nonstandard-header images working — e.g. KJNodes' VHS/LTX-2 preview override (MPI-166),
  which uses a 28-byte header instead of core ComfyUI's 8-byte one.

## Attribution (binary frames carry no prompt_id)

Binary preview frames have no `prompt_id`, so they're attributed to `_activePromptId` —
the prompt the **server** says is running. That pointer updates on **both**
`execution_start` and `executing` (JSON messages interleaved with the binary frames).
`execution_start` fires *before* the first `executing`; tracking only `executing` left a
window where an early frame of a new gen was attributed to the previous gen. Both = closed.

## Gotchas

- **`Events` is per-document.** A separate Electron `BrowserWindow` / `window.open` window
  imports its **own** `events.js` = its own empty bus → subscribing to `preview:frame`
  there receives nothing. A cross-window consumer (e.g. the planned OS floating latent
  window when minimized) must either render inside the same renderer, or forward frames
  over IPC. And a `blob:` URL is per-document — it will **not** resolve in another window;
  send raw bytes / a data URL over IPC, not the blob URL.
- **Both-engine rule.** `engine` distinguishes local vs remote and the bus emits for both,
  but a local-only test does **not** verify remote — remote previews arrive over the
  renderer-direct WSS proxy. Verify a remote-connected gen too.
- **Route a multi-engine consumer by `engine`, NOT `byPromptId`.** The two engines are
  independent ComfyUI instances with **independent `promptId` spaces** — a local and a
  remote promptId can collide, so `byPromptId(promptId)` may return the wrong engine's gen.
  A consumer that shows local + remote side by side (the OS float window,
  `floatLatentBridge.js`) keys tiles by **engine lane** (`local`/`remote`) taken straight
  off the frame's `engine` tag. It does NOT derive lane from a promptId or genId lookup.
  It also can't resolve lane at `generation:started` — the store job registers only after
  an `await` inside `runCommand`, so the store is empty then. So the **first frame** owns
  tile creation: by then the store is populated and `generationStore.activeGenId(lane)`
  gives the correct gen (title/ownership). Per-lane "batch done" uses
  `generationStore.laneDepth(lane, excludeGenId)`.
- **Two onmessage closures.** `comfyController.connect()` has a reuse-path and a fresh-path
  onmessage handler — both must honor the `_stripPreviewHeader` null-skip. (A fix that
  updated only one shipped a broken frame on the fresh path; MPI-269 caught it in review.)

## Legacy path (retired — MPI-271)

The old `Events.emit('generation:preview', { id, url })` + `activeGenerations.setPreview`
path is **gone**. All three consumers (MpiBaseFlow Flow pane, MpiGalleryBlock placeholder
card, MpiGroupHistoryBlock viewer) subscribe to `preview:frame` + seed from
`getLastPreview`. The `preview:frame` bus listener in `activeGenerations` is now the
**sole writer** of `entry.latestPreviewUrl` / `placeholderGroup.latestPreviewUrl`, which the
non-subscriber reads still poll (queue-panel thumbnail, group-history mount-seed, gallery-grid
card re-mount). `exec.onPreview` survives only to re-emit `generation-queue:changed` so the
queue thumbnail refreshes as latents land. `generation:preview-reset` (MPI-167 stage-clip
drop) is unrelated and stays.

## What produces the frames

The decoders that turn a latent into the JPEG this bus carries — which model uses
which, why a missing one silently downgrades to a colour blob rather than failing,
the node-read decoders H3 and LTX need, and the `lighttaew*` landmine — live in
[preview-decoders.md](preview-decoders.md). Nothing above depends on them: the bus
contract is the same whichever decoder produced the bytes.

## Blob ownership — the RETAINER frees it, not the bus (MPI-508)

A burst previewer changes the arithmetic: a 5s H3 run mints **2500** blob URLs, not 20.
The obvious answer — the bus revokes each frame the next one replaces — is wrong, and so
is every variant of it. Measured on real H3 runs:

| bus-side rule | result |
|---|---|
| revoke on arrival | **2600** `ERR_FILE_NOT_FOUND` |
| revoke a lagged tail (ring of 64 > the card's window of 48) | 377, all after the run |
| flush on the terminal event | 1298, a flat 8/s over exactly 48 distinct URLs |
| **bus keeps only the newest; the retainer frees its own** | **3** |

Because `MpiGalleryGrid` **replays** a rolling 48-frame window at 8fps for an *unbounded*
time — the loop runs until the card is REMOVED, which for a video is minutes after the
last frame while the output downloads, saves and thumbnails. No lag and no lifecycle
event `activeGenerations` can see marks that moment.

So: `activeGenerations` owns exactly one URL per generation (the newest, revoked in
`end()`), and any consumer that holds a frame past the next one owns that frame. That
consumer is now always a `previewClipPlayer`, and the ownership is the explicit
`ownsFrames` flag on it (revokes on eviction and on `stop()`) — **exactly one player
per generation may set it**, see Consuming frames above. The cost is that frames reaching
**no** retainer (gallery unmounted) live until the page unloads — bounded by one run,
and cheaper than any of the three bugs above. The fix, if it ever matters, is a release
call from the consumer, never a guessed lag in the bus.

### A tiny video decoder has NO random access — decode from frame 0 (MPI-508)

A TAEHV is temporal: its `MemBlock`s chain state forward, so frame N is only correct if
every frame before it was decoded in the same pass. `MpiVideoSamplingPreview` therefore
decodes the **whole clip, every sampler step** — not a cost choice, the only correct one.
Its first version walked a cursor over a window of the clip "as real time earned frames",
and **every frame came out green**.

Two faults, one root. The 5D latent was flattened frames-as-batch with
`reshape((-1,) + x0.shape[-3:])`, but on `[B,C,T,H,W]` those last three dims are
`(T,H,W)`, not `(C,H,W)` — so the reshape produced `[C,T,H,W]` labelled `[T,C,H,W]`,
transposing time and channels. **It never raised:** `TAEHV.decode` only transposes when
`shape[1] != latent_channels`, and the frame budget clamped the batch to exactly
`latent_channels`, so the scrambled buffer was accepted as a valid whole clip.

H3's chunking is honoured too: its VAE codes **17 pixel frames per 5 latent tokens**, so
each chunk's 3-frame prefix is trimmed rather than `TAEHV.decode`'s one global trim, then
the encoder's 3-token tail pad is dropped (17 tokens → 56 frames, not 65).

**Verify a decode without a GPU or a generation.** kjnodes' `TAEHVDecoder` reads the same
`taeh3` weight, so load the weight on CPU and assert our decode matches theirs
bit-for-bit on a random latent (it does — max diff 0.0). A clean state-dict load proves
nothing: pixel-shuffle interpretation and activation choice are parameterless, they load
perfectly and decode wrong.

## Files
- `js/services/comfyController.js` — ingest, engine tag, attribution, broken-frame gate, `preview:frame` emit.
- `js/services/activeGenerations.js` — `byPromptId`, `getLastPreview`, `_lastPreview` map + bus listener.
- `js/services/previewClipPlayer.js` — **the one consumer**: ring, cursor, `rate` timer, still/clip mode, blob ownership.
- Its four surfaces: `MpiGalleryGrid.js`, `MpiBaseFlow.js`, `MpiGroupHistoryBlock.js` (+ `MpiVideoViewer.setLatentPreview`), `js/shell/floatLatentBridge.js`.
