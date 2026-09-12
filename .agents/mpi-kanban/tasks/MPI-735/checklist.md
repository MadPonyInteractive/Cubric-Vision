# MPI-735 Checklist

Derived from `plan.md` Phase 1. Comment-only card — one phase, one file. **Complete.**

- [x] Implementation
  - [x] Rewrote `js/data/commandRegistry.js:441` (the `edit` op's comment, which claimed
        Krea2's edit "needs ratio + style") — it now states that `krea2Edit` follows the
        SOURCE image size, with `ratio` suppressed by Krea2's `imageSizedOps`
  - [x] Rewrote `js/data/commandRegistry.js:356` (the `kleinEdit` header comment, "Takes
        ratio (Klein's editor uses OUR dimensions, like krea2Edit)") to the same truth for
        Klein, naming `modelShowsRatio()` so the next reader can check rather than trust
  - [x] Left the `'ratio'` entries in the `components` arrays alone — inert, not wrong;
        `imageSizedOps` is the per-model override. Removing them is a behaviour risk for a
        future model that supports the op without declaring `imageSizedOps`

- [x] Verification
  - [x] Re-read the four comment sites together — `:341` (`control`, already correct),
        `:356`, `:441`, `:489` (`krea2Edit`, already correct) — they agree, and every
        symbol each names still exists (machine-verified, see `validation.md`)
  - [x] `npm run lint` clean
  - [x] No behaviour change — `git diff` is comments only, 8 insertions / 4 deletions, no
        code line touched. No test owed; the `imageSizedOps` declarations are the evidence

## Checked, nothing owed

- `docs/op-model-selection.md` does NOT carry the same stale claim (grepped 2026-09-12) —
  the plan's Preservation Note is discharged with no doc edit.
- `:341` on the `control` op is a FOURTH site the plan did not name, and it was already
  correct. It became the wording the two fixes were matched to, not a fifth fix.
