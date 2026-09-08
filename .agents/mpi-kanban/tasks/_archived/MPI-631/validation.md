# MPI-631 — validation

## Measured on the real project ("The Failed Heist", 161 assets, 526.6 MB)

Sampler: `Get-Counter '\GPU Process Memory(*)\Dedicated Usage'` summed over every
`Cubric-Vision` electron + python PID, 3 s interval, alongside `nvidia-smi`. RTX 4060 Ti
16 GB, ComfyUI engine NOT running in any run, so every number below is the app alone.

Same tour each time: open the project, scroll the gallery to the bottom, visit the History
workspace, open and close flows, return and sit idle.

| build | resting | peak |
|---|---|---|
| pre-fix (v1.4.2 behaviour) | 1858.2 MB | 2111 MB |
| triggers A+B only (overlay + generation holds) | 1976.2 MB | 3455 MB |
| **+ trigger C (scroll-out demote)** | **738.2 MB** | **960.6 MB** |

**Resting down 1120 MB, 60%.** Flat at 738.2 for the final 90 s of sampling — settled, not
still decaying. Landing-idle is ~390-406 MB in every build, so the gallery's own cost went
from ~1450 MB to ~330-350 MB.

Peak matters as much: across a whole tour (two flows, two History trips, a full scroll to
the bottom and back) the app never exceeded 961 MB. The 3455 MB spike seen with A+B only —
a flow's own hero clips mounting on top of a still-fully-promoted gallery — is gone,
because the gallery underneath is now bounded.

Raw curves kept in the session scratchpad: `gpuwatch-prefix.csv` (pre-fix),
`gpuwatch-triggersAB.csv`, `gpuwatch2.csv` (final).

### Two findings from the measurement, not designed for in advance

- **A+B alone made resting WORSE, not better** (1976 vs 1858). Not a regression in the
  holds — neither an overlay nor a generation is present when a user simply sits in a
  scrolled gallery, so nothing held. "VRAM at dispatch" and "VRAM at rest" turned out to be
  two different problems and only the first was in the original scope. Trigger C is what
  closed the second.
- **Resume is correct, confirmed by observation** (Fabio): returning to the gallery
  *without* scrolling stays cheap, because `_resumeMedia` promotes only the visible band.
  The 1976 came from deliberately scrolling to the bottom each time, which re-promoted
  everything through the observer.

## Automated

- `npm test` — **751/751 pass**.
- `npx playwright test --config=playwright.desktop.config.js` — **31/31 pass**, exit 0
  (30 pre-existing + the new spec; run before trigger C, and the new spec's two cases were
  re-run green after).
- New spec: `tests/desktop/gallery-media-release.spec.js`, two cases.
- `npx eslint` clean on every touched file.
- `validate_board.py .` — exit 0, "Board validation passed".

### Mutation-tested — three mutations, three reds, all reverted

Each mutation was reverted with an explicit edit and `grep MUTATION` confirmed clean
afterwards; the suite was re-run green at the end.

| mutation | result |
|---|---|
| `_releaseMedia` no longer sweeps `demoteVideo` | RED — expected 0, got 4 |
| `_mediaHolds` guard in `_promoteVideo` neutered | RED — expected 0, got 4 |
| `demoteObserver` callback gutted | RED — expected 0, got 1 |

Each fails on its own assertion, so no half masks another. That check earned its keep
here: the trigger-C case initially passed against a fixture that overflowed by only 361 px
— less than `DEMOTE_MARGIN_PX` (600), so the demote could never fire and the test was green
for the wrong reason. The fixture now asserts its own overflow before asserting behaviour.

Second fixture trap, also caught by failing first: a made-up media src 404s into the
missing-media path, which empties `.mpi-group-card__media`, so nothing promotes and the
spec reads as a broken fix when the fix is fine. Both cases use real shipped media (the
Flow hero clips under `comfy_workflows/display/`).

## Not measured

**Vision's VRAM at the instant a real generation dispatches was never sampled.** Trigger B
is proven three ways — the desktop spec drives `generation:started` / `generation:complete`
with the queue count, it is mutation-tested, and the release path it calls is the same one
the measured overlay trigger uses — but the live dispatch number is not in evidence.
Sampling it needs the engine up and a real generation, and the engine was deliberately off
for every run so the app could be measured alone. Closed on the evidence above; reopen if
that number is wanted.

## Deviation from the card as written

Acceptance 1 asked for `releaseMedia()` / `resumeMedia()` on `instance.el`. They are
INTERNAL. Both callers turned out to live inside the grid's own setup, so a public method
would have been API with no consumer. Amended on the card rather than quietly satisfied.

## Follow-up raised

MPI-633 — the gallery renders one 512px image thumb at every card size, and promotes video
to the FULL-RESOLUTION master. Both are visible-quality and memory problems that this card
deliberately did not touch.
