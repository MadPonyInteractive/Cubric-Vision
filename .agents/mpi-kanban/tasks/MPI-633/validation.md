# MPI-633 — validation

## Phase 0 — the two measurements the brief asked for (done BEFORE any rendition code)

Rig: `tests/desktop/_mpi633-decode-cost.rig.js` (M1) and `_mpi633-gallery-vram.rig.js` (M2).
Sampler `scratchpad/gpusnap.ps1` — `\GPU Process Memory(*)\Dedicated Usage` summed over
Electron's own `getAppMetrics()` pids, median of 3. RTX 4060 Ti 16 GB, ComfyUI engine OFF,
own profile + own `CUBRIC_PORT`, so the app is measured alone and never touches the user's.

**One app launch per config, deliberately.** A first pass measured the whole ladder in one
process and the numbers were junk: after a grid is torn down the GPU pool does not give the
memory back within seconds (a 3000x1280 run left 740 MB resident after unmount), so every
later step measured only what it needed *beyond* the pool the previous step had grown.

### M1a — VRAM against a clip's NATIVE resolution

Ladder encoded from ONE shipped clip (`comfy_workflows/display/flow-scribble.mp4`,
1280x800, 6 s, h264) so only pixel count varies. K=6 cards, then 12, in a fixed 82x103 box.
`delta/vid` is (6 cards − baseline)/6 and carries a fixed compositor cost; `slope/vid` is
(12 − 6)/6, the honest marginal cost of one more promoted video.

| native | MP | baseline | 6 cards | 12 cards | delta/vid | **slope/vid** |
|---|---|---|---|---|---|---|
| 768x480 | 0.37 | 313.3 | 379.0 | 373.5 | 10.9 | ~0 (−0.9) |
| 1152x720 | 0.83 | 315.1 | 437.9 | 501.5 | 20.5 | **10.6** |
| 1280x800 | 1.02 | 313.3 | 454.6 | 502.2 | 23.6 | **7.9** |
| 1728x1080 | 1.87 | 313.4 | 516.5 | 634.5 | 33.9 | **19.7** |
| 3000x1280 | 3.84 | 313.4 | 800.8 | 1188.2 | 81.2 | **64.6** |

All MB. Cost tracks native pixels at roughly **20 MB per megapixel per promoted video**
(delta) / ~17 MB/MP (slope), with a kick at the top of the ladder.

**A 3000x1280 clip costs ~65-81 MB of VRAM per promoted card; a 720p proxy of the same clip
costs ~11-21 MB — a 6x reduction.** 480p saves perhaps 10 MB/video more.

### M1b — the same clip, two card boxes (the mechanism the card rests on)

| clip | card box | box area | delta/vid | slope/vid |
|---|---|---|---|---|
| 3000x1280 | 64x80 | 1.0x | 81.2 | 64.6 |
| 3000x1280 | 134x167 | 4.4x | 82.4 | 62.8 |

**Identical within noise across a 4.4x change in painted area.** Decode cost is set by the
clip's native resolution and the display size does not enter it — `brief.md`'s reasoning is
confirmed by measurement. (Its "~100x the pixels the card shows" is right about pixels and
wrong as a memory ratio: VRAM follows native pixels only, so the real saving from a proxy
is the ~6x above, not 100x.)

### M2 — gallery VRAM across card sizes AND rendition sizes

120 image cards in a 1600x900 host, MPI-631's tour (scroll to the bottom, then sit idle).
`master` = the card renders the 1280x800 source, i.e. a rendition as large as the asset;
`thumb512` = today's single 512px WebP. Two runs where both exist.

| config | card box | visible | source drawn | resting delta |
|---|---|---|---|---|
| L1 + thumb512 (today, smallest cards) | 253x158 | 36 | 512x320 | **41.6 / 34.4** |
| L4 + thumb512 (today, biggest cards) | 775x484 | 4 | 512x320 | **12.1 / 12.0** |
| L4 + master (the proposal at max size) | 775x484 | 4 | 1280x800 | **238.3 / 238.2** |
| L1 + master (a WRONG tier at min size) | 253x158 | 36 | 1280x800 | 43.5 / 70.0 |
| L4 + master, **no scroll** | 775x484 | 4 | 1280x800 | **23.7** |
| L4 + thumb512, **no scroll** | 775x484 | 4 | 512x320 | −12.9 (≈0) |

**Step the tour by a VIEWPORT, not by a fraction of `scrollHeight`.** The first M2 pass used
12 proportional jumps, which is not the same tour at both levels — level 4's content is ~9x
taller, so it skipped ~60% of the cards while level 1 covered everything, and the two runs
then differed in how many cards were ever rasterised rather than in what a card costs. The
table above traverses every card at both levels (5 steps at L1, 44 at L4).

## What the measurements changed

1. **The brief's flatness table is wrong by an order of magnitude, and today's build is
   already flat in the *other* direction.** Today the largest card size costs **less** than
   the smallest (12 vs ~34-42 MB) — fewer cards, same 512px source each. The brief predicted
   ~24 vs ~22 MB; the real pair is ~34-42 vs ~12.
2. **A size-matched ladder is NOT free: 12 MB → 238 MB at the largest card size.** That is
   the honest cost of fixing the quality complaint, and it was not in the brief.
3. **But 214 of those 238 MB are RETENTION, not working set.** The no-scroll control costs
   23.7 MB — four visible 1280x800 cards, which is what the design actually needs. Everything
   above that is Chromium's GPU image cache holding every card the scroll passed. This is the
   same class of problem MPI-631 fixed for video (trigger C: demote a card scrolled further
   than `DEMOTE_MARGIN_PX` out of view), and it means the rendition ladder needs an
   **image-side demote** — swap a far-off-screen card back to the small thumb — or the
   quality fix costs 20x VRAM instead of 2x.

## Harness fact worth keeping

**The standard desktop harness can never measure VRAM.** `tests/desktop/launch.js` sets
`CUBRIC_E2E`, and `main.js:259` turns that into `disableHardwareAcceleration()` +
`--disable-gpu`, so every GPU sample reads 0.0 MB on a perfectly healthy app. The rigs launch
Electron themselves without that flag while keeping `CUBRIC_E2E_USER_DATA` + the run's
`CUBRIC_PORT` (which is what actually keeps them off the user's app — MPI-458).

**And do not sample by process TREE.** `Win32_Process` reports no children for the Electron
main pid (measured 2026-08-27: `tree(1)` while `getAppMetrics()` listed Browser/GPU/Tab/
Utility), so a tree walk reads 0.0 MB. `app.process().pid` is worse still — on Windows
Playwright spawns Electron through a `cmd.exe` shim. Take the pid list from
`app.getAppMetrics()`. Three runs of this rig read a confident 0.0 MB before that was found.

Raw: `scratchpad/m1-decode-cost.json`, `scratchpad/m2-gallery-vram.json`, logs `m1e.log`,
`m2b.log`, `m2c.log`.

## Phases 1-4

Not started — the build follows from the numbers above.
