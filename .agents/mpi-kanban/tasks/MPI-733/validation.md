# MPI-733 Validation

## Phase 1 — eligibility as a pure function: DONE, auto-verified 2026-09-12

### What landed

`selectCueAllTargets(operation, model, groups)` in `js/data/commandRegistry.js`, plus
`tests/cue-all-eligibility.test.cjs` (9 tests).

**Placement differs from the plan, deliberately** — see Plan Drift. The plan said to split
the helper into its own module "the way `js/utils/galleryRenditions.js` was split out"
because Node could not otherwise reach it. That premise does not hold:
`js/data/commandRegistry.js` has **no imports at all** and is already dynamically imported
by ~10 `.cjs` tests (`tests/gallery-entry-text-op.test.cjs:31` is the pattern). A separate
file would have held one function away from the three registry functions it reads.

### The rule is narrower than the plan's, and the registry is why

The plan's rule was "the op declares at least one slot of the selected media type". The
shipped rule is **exactly one REQUIRED slot, whose type matches the group**. This was not a
preference — enumerating every op's slots showed the looser rule dispatches broken jobs:

| op | slots | looser rule would… |
|---|---|---|
| `flowHeadSwap`, `flowScribObj`, `flowObjectStamp` | REQ image,image | queue N graphs each missing their 2nd required input |
| `flowVoiceChanger` | REQ audio,audio | same, on the audio side |
| `t2v_ms`, `flowDramaBox` | REQ none, OPT audio | make a text op "batchable" over its decoration |
| `ref2v_ms` | REQ none, OPT ×15 | same, spectacularly |
| `i2v_ms` on LTX | REQ image, OPT image,audio | make an AUDIO selection eligible through the optional audio slot — queueing image-to-video jobs with no image |

The tighter rule still lands on exactly the ops the plan promised, verified by an assertion
rather than by reading: `edit`, `krea2Edit`, `kleinEdit`, `qwenEdit`, `i2i`, `control`,
`upscale`, `pid`, `i2v` for image and `extend` for video all batch, and each is confirmed
single-required-input. It also picks up later single-input ops for free, which a whitelist
would not.

`inpaint`/`detail` still need no exclusion code: the Gallery mounts its PromptBox with
`canMask: false`, so a mask op is never the remembered op on this surface.

### Evidence

**`node --test tests/cue-all-eligibility.test.cjs` — 9 tests, 9 pass, 0 fail.** Covers the
four cases the plan named (mixed selection → images only; text-only op → zero; `extend`
over video → all; null op → zero) plus the four the slot enumeration turned up
(two-required-input ops, optional slots as a non-axis, wrong-media-type distinguished from
nothing-picked, junk input).

**The test is not vacuous — proven by falsification.** Replacing the type filter with
`list.filter(() => true)` turned **3 of the 9 red** (mixed selection, optional-slots,
all-wrong-type), and reverting turned them green again. The probe was removed and its
absence re-grepped (0 occurrences).

**`npm test` — 944 tests, 944 pass, 0 fail, exit 0**, run twice consecutively.

*Honest note:* one intermediate run of the full suite reported `fail 1` without naming the
test, and it did not reproduce on either of the two runs after it (both exit 0, 944/944).
Three peer sessions are editing this shared tree live, so a file changing mid-run is the
likely cause. It is recorded rather than hidden; if it recurs it is worth chasing, but
nothing in this card's diff is implicated — the new test passes in isolation and in-suite.

**`npm run lint` — clean.**

### Reasons the caller gets

`reason` is set only when nothing is eligible, so Phase 2's disabled tooltip can tell the
cases apart rather than showing one generic string:

- `'no-operation'` — nothing remembered, or a key that no longer exists
- `'not-batchable'` — the op does not take exactly one required input
- `'wrong-media-type'` — the op is batchable, but nothing selected matches its slot

## Phases 2–4 — NOT STARTED, and Phase 2 is blocked

`js/components/Compounds/MpiGalleryGrid/MpiGalleryGrid.js` is under a **live write claim**
from MPI-730 item 3 (session `44919499-034d-4a40-be05-24a7409a81a1`, status `active`,
heartbeat 12:27Z, its card in `doing`). Not edited, not negotiated. Re-read
`state/index.json` before assuming the block still stands.

Nothing about Phase 1 is affected: it touched only `commandRegistry.js` and a new test
file, neither of which any peer holds.

### One thing found for free, for whoever takes Phase 3

`MpiGalleryGrid.js:1528` already runs `if (useSelection) _exitSelectionMode();` after every
context-menu action. Phase 3's "exit selection mode after" is therefore already handled by
the grid — do not add a second exit in the Block handler.
