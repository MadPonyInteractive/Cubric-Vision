# MPI-527 — Release artifacts that lie

Umbrella created by the consolidation sweep, 2026-08-10. Two `todo` cards, one theme:
**the portable build/update pipeline ships something untrue about itself, and the check
that should have caught it is part of the problem.**

**The member cards stay on the board.** Nothing was closed, merged or deleted to make
this. Close a member when the phase covering it lands, and say so in its card. If the
members turn out to be the better unit, delete this umbrella instead.

## Members

| Card | What it is |
|---|---|
| MPI-522 | The dangling-symlink build guard misses on CI Windows, and its test passes while testing nothing |
| MPI-523 | An in-place update never refreshes the installed `update-manifest.json` |

## Current State

**COMPLETE, 2026-08-30. Both members are `done`.**

- **MPI-522 — overtaken, closed on evidence.** Both defects were fixed on 2026-08-11 by
  `07b8e8b2` (`fix(MPI-542)`), which is why `scripts/overtaken-cards.py` never flagged it:
  the fix carries MPI-542's id, not this one. The unknown root cause is now known and
  recorded — `fs.access` SUCCEEDS on a dangling Windows reparse point, so the guard was
  inert; it uses `stat()` now. The false green is gone too: the test falls back to a
  **junction** instead of skipping on EPERM. Re-ran here: 8 pass, **0 skipped**.
- **MPI-523 — fixed.** `apply-update.cjs` now copies `resources/cubric/update-manifest.json`
  explicitly after the `files[]` loop. The cause is permanent by construction (a manifest
  cannot contain its own hash), so the build side could never have fixed it; that is written
  into `docs/releases/portable-distribution-contract.md` § Delta update details so it is not
  "fixed" there later. New mutation-checked test, `npm test` 798/798.

This clears the **MPI-527 row on MPI-595's Gate A**.

The 2026-08-10 state this replaces: not started, MPI-522 CI-red on every push.

Neither affected the shipped 1.4.0 bytes — MPI-522 verified that directly on the published
artifacts (linux tar.gz 0 symlinks, windows zip 0, macOS zip 31 symlinks and 0 dangling).

## Why one card and not two

Both are the same failure of self-description in one pipeline: a guard that reports a clean
tree it did not really check, a test that reports a pass it did not really run, and a
manifest that reports a version it is not. All three cost diagnosis time rather than user
harm, and all three live in `scripts/build-portable.mjs` / `apply-update.cjs` /
`tests/portable-win-layout.test.cjs`. Fixing the test honesty (522.2) without also asking
what else in this pipeline asserts something it never verified is how 522.1 survived in the
first place.

## Phase 1: Stop the false green, then fix the guard

MPI-522, **in that order** — defect (2) is why defect (1) survived. This dev box cannot
create symlinks (EPERM), so the test hits its own skip path and still counts green. Make it
a real skip or fail loudly; a skip that reports as a pass is the defect.

Then defect (1): root cause of the CI Windows miss is UNKNOWN and needs a Windows box that
CAN create symlinks to reproduce — the dev box cannot, which is exactly the constraint that
produced the false green. Budget for that before starting.

Note what is NOT broken and must stay that way: `shouldExcludeAppPath` keeping
`@cubric/connector` out of the staged tree is the primary defence, is separately tested,
and passes on CI. And a resolver that does not follow intermediate links reports 10 false
positives on macOS (`Framework/Foo -> Versions/Current/Foo`, `Versions/Current -> A`).

## Phase 2: The manifest

MPI-523. The delta bundle has 330 members but its manifest lists 329 files — the manifest
is not in its own file list, so `apply-update.cjs` never copies it in. Two acceptable end
states, pick one: refresh it on apply, or stop shipping it into the install where it can be
mistaken for truth. Verified before filing that nothing reads the INSTALLED manifest at
runtime (`findManifestRoot` inspects the BUNDLE; the next delta is computed at build time
from `release-baselines/`), so there is no update path to break either way.

## Verification

Phase 1: CI green on `tests/portable-win-layout.test.cjs`, and a planted dangling symlink
actually rejected on a runner. Phase 2: apply a delta update and read
`resources/cubric/update-manifest.json` — `toVersion` matches `appVersion.js`, or the file
is not there at all.

## Parallel Batch

Possible after phase 1's two defects are split — 522 owns `scripts/build-portable.mjs` +
`tests/portable-win-layout.test.cjs`, 523 owns `apply-update.cjs` + the bundle manifest
writer. Derive ownership from each member's `files.json` at dispatch time, not from this
list.

## Plan Drift

(none yet)
