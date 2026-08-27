# MPI-631 — Gallery holds ~1.5 GB of VRAM until you navigate away

## The measurement

A 3 s sampler (`Get-Counter '\GPU Process Memory(*)\Dedicated Usage'` summed over every
`Cubric-Vision` electron + python PID, alongside `nvidia-smi`) across a real session on a
16 GB RTX 4060 Ti, 2026-08-27:

| time | Vision MB | what was happening |
|---|---|---|
| 17:09:44 | 410.6 | landing, idle, ComfyUI engine NOT running |
| 17:09:57 | 1878.2 | big project open, gallery scrolled |
| 17:10:01 | 2111.1 | peak |
| 17:10:25 | 495.1 | **entered the History workspace** |
| 17:10:33 | 2017.3 | back in the gallery |
| 17:10:58 | 404.5 | **History workspace again** |
| 17:11:10 | 1970.8 | back in the gallery |
| 17:12:48 → 17:25:58 | **1858.2** | flat, byte-identical, 13 minutes, zero decay |

161 assets → ~1450 MB above landing, ~10.5 MB per card. The resting value did not move by
a single tenth of a megabyte over 13 idle minutes, so this is not a cache Chromium will
trim under pressure — the references are held.

Baseline control: with Vision fully shut down the box read 1171 MiB; with Vision up and the
engine off it read 1562 MiB. Vision alone = 391 MiB on landing, and the per-process sum
agreed with the whole-device delta within noise, so the attribution method is sound.

## Root cause

`MpiGalleryGrid.js` → the promote observer (search `promoteObserver`) is a one-way ratchet:

```js
if (!entry.isIntersecting) continue;      // leaving the viewport is ignored
...
cardElForGroup.promoteVideo();
_ioPromoted.add(entry.target);
promoteObserver.unobserve(entry.target);  // the card can never be reconsidered
```

Scrolling a video card into view once creates a `<video preload="auto">`, appends it over
the 256 px poster, and it lives for the rest of the grid's life. `preload="auto"` buffers
the file and keeps a decoder plus decode surfaces resident. Scroll a 161-asset project end
to end and you own 161 live decoders.

`_removeHoverVideo()` already exists and already does the correct teardown (pause, remove,
reset `_videoPromoted`). All five of its call sites are content-change paths — the card
became audio / empty / background-image / non-video. **None** is scroll-out or
visibility. The right function is written; it is simply never called for the case that
matters.

The History-workspace dips are the same mechanism from the other side: navigating away
destroys the grid, `promoteObserver.disconnect()` runs and the DOM is dropped, so all 161
decoders die at once. That is why the memory comes back only there.

Supporting evidence this state is long-standing: MPI-583 (`docs/gallery.md`) fixed a seek
storm measured over "100 videos" in the DOM — a symptom of the same retention.

## Why not virtualise the grid (yet)

Windowing fixes *how many cards exist*. Card count is not the cost: images already ship
512 px WebP thumbs (MPI-319), roughly 1 MB of texture each, so 161 images is ~160 MB, not
1450. The cost is per-video decoder retention, and it would still be wrong inside a
window — the visible band plus overscan would ratchet the same way. Windowing means
rewriting justified layout, selection, drag-out and scroll anchoring. Do the cheap fix,
re-measure, and only reach for virtualisation if the number is still bad.

## The design (Fabio's framing)

The goal is **not** low idle usage in the abstract. It is that the UI must not be sitting
on VRAM at the moment the user needs it: 1.9 GB of gallery on a 16 GB card is 12 % of it
gone right when an LTX video generation wants everything.

One primitive, three possible callers:

| trigger | release when | resume when | in scope |
|---|---|---|---|
| gallery stops being the visible surface | a Flow / overlay opens | it is visible again | yes |
| a generation is dispatched | dispatch | the queue drains | yes |
| card scrolled far off-screen | past a ~600 px margin | back near the viewport | follow-up only if measurement still demands it |

The two in scope are Fabio's, and they are the ones that serve the goal.

### The subtle part

Promotion must stay **suspended**, not merely undone. `IntersectionObserver.observe()`
fires immediately for anything already intersecting, so a naive release re-promotes the
visible band on the next tick and frees nothing. A `_mediaSuspended` flag checked inside
`_promoteVideo` is what makes the release stick.

### Where it wires

`Overlays.onDepthChange` in the grid is already the single choke point — MPI-570 built it
and documented `depth 0 → 1` as "the gallery stopped being the visible surface", with
Flow, Model Manager, Flow Library and History all routing through it. Trigger one is one
more line in that existing handler. Trigger two rides `generation:started` /
`generation:complete` plus `state.generationQueueCount`, the same pair
`shell/notificationService.js` already uses to detect a drained queue.

### Carve-outs

- While suspended, an explicit hover on a single card may still promote it — one decoder,
  not 161 — so the gallery stays usable during a long generation.
- The generating card's live preview (`updatePreview` / `resetPreviewClip`, see
  `docs/preview-bus.md`) is a different path and must not be touched by suspension.
- Visually the swap is near-invisible: a promoted video sits paused on frame 0 over a
  poster of frame 0. Only a card mid-hover-play visibly stops.

## Not this card

- **The engine is the opposite trigger.** Freeing ComfyUI's models *before* a generation
  forces a reload of the model about to be used. The engine's separate finding — ~480 MB
  of model left resident after a generation, reclaimable by `POST /comfy/unload`, which
  today only fires from the F5 / Ctrl+F5 hotkey in `js/shell/memoryOps.js` and never
  automatically — wants an idle-unload instead. Separate card.
- Grid virtualisation, per above.

## Fallback if the targeted fix under-delivers

Teardown is *proven* to release 100 % of it (2017 → 404 MB). So if demoting videos does
not move the number enough, the blunt version is to tear the grid content down and rebuild
on resume — exactly what navigation does today — at the cost of a re-render and restoring
scroll position. Escalate only on measurement.

## How this gets verified

Re-run the identical tour with the sampler
(`scratchpad/gpuwatch.ps1`, 3 s interval) and compare curves, then read Vision's MB at the
moment a real generation is dispatched. That second number is the one that decides whether
this worked.
