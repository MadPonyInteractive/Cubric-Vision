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
