# MPI-571 Validation

## Automated — PASSED

- `npm test` — **615/615**, including the new `tests/previewClipPlayer.test.cjs` (9)
  and the two MPI-565 tests retargeted onto the extraction.
- `npm run lint` — clean (`eslint js/ --max-warnings=0`).

## Live, offline (real browser, own isolated instance on :55188, no GPU) — PASSED

The user's app was never touched: own profile + own port via `npm run app:isolated`,
torn down afterwards (port confirmed free).

| check | result |
|---|---|
| all six touched modules import in the page | ok — no path/TDZ error |
| gallery card, 4-frame clip at rate 8 | `0,0,1,2,2,3,3,0,0,1,1,2,2,3,3,0,…` — all frames, cycling, wrapping |
| gallery card, still mode (`clip: null`) | each frame replaces, HOLDS on the last, no timer |
| `MpiVideoViewer.setLatentPreview(url)` | hidden by default; paints with the right src, `z-index: 2`, `position: absolute`, `pointer-events: none` |
| `MpiVideoViewer.setLatentPreview(null)` | hides and drops the `src` attribute |
| `removeCard()` | card gone, loop stopped |
| browser console | clean (one 404 from a bad probe URL of my own) |

The gallery result is the load-bearing one: it is the surface that already WORKED, so
an identical loop-and-wrap through the extracted player is the proof the refactor did
not regress the only correct consumer.

## Live, on Fabio's own generations (2026-08-17) — 3 of 4 surfaces PASS

He ran his own work (MiniMax H3 i2v among them) and watched all four:

| surface | result |
|---|---|
| Gallery | PASS — "the Flows now work and are still good in the Gallery" |
| Flows (result pane) | PASS — the burst-replay-then-freeze is gone |
| History workspace | PLAYS correctly, but the latent came up as a small window floating over the current entry |
| Minimised float window | INTERMITTENT — "sometimes plays and sometimes gets stuck" |

He also called VRAM/RAM cost a non-issue for this feature.

Not a foley run, so **MPI-531's dispatched-prompt debt did NOT park** — it still needs
one LTX foley run read back from Comfy `/history`.

### History small window — ROOT-CAUSED AND FIXED

`.mpi-video-viewer__latent` carried `max-width/max-height: 100%` and no width/height, so
the `<img>` laid out at the latent JPEG's INTRINSIC size — a fraction of the output's
resolution — and `margin: auto` parked that small tile in the middle of the stage.
Now `width/height: 100%` with the existing `object-fit: contain`, so it letterboxes into
exactly the box the video occupies.

Measured in a real page against the real stylesheet (own instance on :55193): a 16x7
image now reports an 800x400 rect inside an 800x400 stage.

### Minimised window — one cause fixed, one still open

**Ruled OUT by measurement, do not re-chase:** Chromium background timer throttling. The
new pacing runs on a `setInterval` in the MAIN renderer, which is hidden exactly when the
float window is up, so the 1s hidden clamp and the 5-minute intensive tier were the first
suspects. Neither exists here: an Electron window minimised on Windows keeps
`document.visibilityState === 'visible'`, and a 125ms interval ticked 80/80 times per 10s
while visible, while minimised, and again after 5m20s minimised. The loop keeps running.

**FIXED — the bridge never listened for `generation:preview-reset`.** All three
in-renderer surfaces did; the bridge shipped without it, and it is the one consumer that
cannot survive missing it. Those three OWN their frames (`ownsFrames: true`) and REVOKE
the whole window on a stage reset, so the bridge — which by design owns nothing — kept
looping URLs that were already dead: a `fetch()` rejection per frame, an unhandled
rejection out of the playback timer, and a stuttering tile until enough new frames pushed
the corpses out of its ring. It now resets with the others, and `blobUrlToDataUrl`
swallows a dead URL instead of rejecting.

**STILL OPEN — needs one observation from the next stuck run.** Three candidates left,
and they take different fixes, so guessing is not on:
1. **By design.** A finished gen freezes its tile on the final frame with a happy-mascot
   "Done" badge and the caption "Click to open" (`float-latent.html` `finalize`). A stuck
   tile SHOWING that badge is the feature working.
2. **Still-mode tail.** Models with no clip previewer paint one frame per sampler step, so
   the tile legitimately holds the last frame through a long VAE-decode / encode / save
   phase. Clip-mode runs (H3, LTX) loop through that gap; still-mode ones cannot.
3. **A stranded `t.done` gate.** `float-latent.html` clears `done` only when `add-tile`
   arrives with a genId DIFFERENT from the tile's owner. The bridge takes that genId from
   `generationStore.activeGenId(lane)`; if that reads null on the next queued item's first
   frames, the tile stays gated and never paints again — permanently stuck, and only on a
   QUEUE, which fits "sometimes".

The discriminator is free on his next stuck run: **did the stuck tile show the Done badge
and "Click to open"** (→ 1), and **was it the first item or a later one in a queue**
(→ 3)? Plus which model (→ 2).

## NOT yet verified — needs one clip-bursting generation

A synthetic probe cannot reach these two, and they are the two Fabio reported:

- **Flow result pane** — must now pace and LOOP instead of replaying the clip at
  burst speed per sampler step and freezing on a still.
- **Minimised float window** — must now MOVE instead of showing one still frame.

Also unverified by construction: the remote engine lane (`docs/preview-bus.md`
both-engine rule — a local run does not prove remote).

**If that run is a FOLEY (LTX) run it also parks MPI-531's last debt** — read the
DISPATCHED prompt back from Comfy `/history`, because the step-field promotion path
fails silently and the box on screen is not evidence. A run on any other flow does not.

## Final — all four surfaces confirmed live (2026-08-17, second pass)

Fabio re-ran after `ae8d6149` — an LTX foley run for the Flow pane and the History viewer,
H3 for the rest.

| surface | verdict |
|---|---|
| Gallery | PASS |
| Flow result pane | PASS — paces and loops; the burst-replay-then-freeze is gone |
| History workspace | PASS — plays, and the latent now fills the stage instead of floating as a small tile |
| Minimised float window | PASS — *"Minimised looks fine"* |

**The minimised "stuck" was never a bug.** He confirmed the frozen tile carried the Done
badge and "Click to open" — `finalize`'s finished state. Asked whether it should keep
looping instead, his call was **freeze on Done**. No code change; the behaviour stands as
designed and this line is the record of that decision.

Also ruled out on the way: the four runs were H3 and LTX, both CLIP previewers, so the
still-mode tail was not in play either; and they were four SEPARATE runs, not a queue, so
nothing could have stranded `float-latent.html`'s `t.done` gate.

### Carried out of this card — MPI-575

The LTX preview FLASHES junk frames on the audio-carrying flows (foley, extend), never on
H3. It flashes identically in all three in-renderer surfaces, which is what places it
upstream of this card: they now share one consumer and simply paint what the bus delivers.
Root-cause read + the measurement that settles it are on **MPI-575**. Fabio's call: not a
blocker.

### Still unproven by construction

The remote engine lane. `docs/preview-bus.md`'s both-engine rule — a local run never
proves remote.
