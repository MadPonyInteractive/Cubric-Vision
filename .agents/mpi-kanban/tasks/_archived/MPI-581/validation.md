# MPI-581 validation

Flow preview art: a playbook, then real tile + hero for all three shipped flows.

## What closes this card

All three flows carry purpose-built art. None wears a model preview any more, and no
two share an asset. Fabio approved all three on 2026-08-20.

| Flow | `preview` | `video` | Device |
|---|---|---|---|
| Add Foley | `flow-ltx-foley.webp` 78 KB | `flow-ltx-foley.mp4` 481 KB | Picture plays untouched, the generated waveform draws itself in sync |
| Head Swap | `flow-head-swap.webp` 47 KB | `flow-head-swap.mp4` 114 KB | Before/after wipe, seam visible, tile is that wipe frozen on the face |
| Extend Video | `flow-ltx-extend.webp` 50 KB | `flow-ltx-extend.mp4` 815 KB | Result plays under a progress rail past a source-end mark |

## Evidence

**The Extend Video premise was proved before it was built on.** Fabio supplied two clips;
the device depends entirely on them being the same shot. Trimmed the result to the source's
56 frames and ran ffmpeg `psnr`: **avg 37.3 dB, min 30.96, max 42.36** — re-encode-level
identity. A different clip lands under 15 dB. Frames past 2.334 s continue the same walk.
So `2.334 / 4.042 = 57.74%` is a real seam, not an assumed one.

**Assets, measured not assumed** (`ffprobe`, `sharp`):

- `flow-ltx-extend.webp` — 896x1120 (4/5), 50176 bytes, under the 250 KB ceiling.
- `flow-ltx-extend.mp4` — 1280x800 (8:5), h264/yuv420p, 5.500 s, 815237 bytes, **no audio
  stream**. Loop endpoints YAVG 16.0 vs 19.5 (both effectively black), so it wraps cleanly.

**Live in an isolated instance** (`npm run app:isolated`, port 54123 — Fabio's `:3000` never
touched, confirmed still listening afterwards):

- Both assets HTTP **200**, served bytes == disk bytes (50176 / 815237).
- Flow Library tile and slide-over detail thumb both decode **896x1120** — the file really
  loaded, not just a `src` in the DOM.
- Hero `<video>`: `paused:false`, `muted:true`, `loop:true`, `playsInline:true`,
  `videoWidth/Height` 1280x800, `duration` 5.5, `currentTime` 3.484 -> 4.793, and
  `getBoundingClientRect().width` = **444 px** — laid out and visible, not a hidden mount.
- All three tiles present with distinct art, screenshot taken of the open flow.

**Suite:** `npm test` -> **630 passed, 0 failed**. This includes
`tests/shared-dep-uninstall-direction.test.cjs`, which the previous handoff recorded as
failing on master; MPI-579/580's fix is in the tree, so that note is now stale.

`npm run release:check` -> passed. No version surface drifted; the Flow Library is
`APP_CONFIG.dev_mode`-gated, so this work owes no `UNRELEASED.md` entry.

## Findings this card produced

1. **`--accent-heat` is `#FF7EB6`, not `#FF5FA2`.** The playbook's own ffmpeg recipes
   carried `#FF5FA2`, an invented pink that is neither app token, and both 2026-08-19
   heroes baked it in. Confirmed by canvas readback in Chromium (the token is fractionally
   out of sRGB gamut, linear red 1.026, which is where a hand conversion drifts). Playbook
   corrected; Extend Video uses the real token. **Fabio approved the two earlier heroes
   as-is**, so they keep `#FF5FA2` — the playbook now says so explicitly, to stop a future
   agent reading it as drift and rebuilding them.
2. **A hero probe can pass with nothing on screen.** `MpiFlowLibrary` gates Open on
   `state.currentPage === PAGE_GALLERY`; without a project open on the Gallery page a bare
   `Events.emit('flow:open')` mounts `MpiBaseFlow` into a 0x0 invisible overlay while the
   `<video>` still reports `paused:false` and a rising `currentTime`. Now a playbook trap:
   assert `getBoundingClientRect().width` too.
3. **The recipes do NOT graduate to `scripts/`.** Three flows in, each hero's filtergraph is
   bespoke to its device (xfade wipe / showwavespic reveal / progress rail); only a
   four-line webp encode repeats. The `ponytail:` note in the playbook records the decision
   so it is not re-litigated.
