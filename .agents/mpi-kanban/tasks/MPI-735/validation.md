# MPI-735 Validation

Comment-only card. Nothing to look at in the running app — the behaviour the comments now
describe correctly is what already shipped, and that was verified by screenshot on
2026-09-12 before the card was written.

## What changed

`js/data/commandRegistry.js`, two comment blocks, 8 insertions / 4 deletions. `git diff`
confirms the change is comments only — no `components` array, no op field, no code line.

- `:353-356` (`kleinEdit` header) — was *"Takes ratio (Klein's editor uses OUR dimensions,
  like krea2Edit)"*. Now states `ratio` sits in `components` but is never shown, because
  Klein names `kleinEdit` in its `imageSizedOps` and `modelShowsRatio()` suppresses it.
- `:439-444` (the `edit` op) — was *"Krea2's edit is a separate op (krea2Edit) — it uses
  OUR provided dims and needs ratio + style"*. Now says Krea2's edit is separate for its
  style rack and second reference slot, and that it too follows the source size.

The `'ratio'` entries in the `components` arrays were deliberately LEFT ALONE, per the
plan: they are inert, not wrong. `components` is the op's declared list; `imageSizedOps`
is the per-model override. Removing them would change behaviour for any future model that
supports one of these ops without declaring `imageSizedOps`.

## Evidence

**The four comment sites now agree.** Re-read together after the edit:

| line | op | says | state |
|---|---|---|---|
| `:341` | `control` | `ratio` suppressed per model by `imageSizedOps`/`modelShowsRatio` | already correct — this is the wording the two fixes were matched to |
| `:356` | `kleinEdit` | listed but never shown; Klein's `imageSizedOps`; source size | **fixed** |
| `:441` | `edit` | no controls at all; Krea2's edit follows source size too | **fixed** |
| `:489` | `krea2Edit` | `ratio` listed but suppressed by Krea2's `imageSizedOps` | already correct |

`:341` is a FOURTH site the plan did not name. It was already correct and needed no edit.

**Every symbol named still exists** (grepped 2026-09-12, post-edit):

- `modelShowsRatio` — defined `js/data/commandRegistry.js:1538`, imported at
  `js/components/Organisms/MpiPromptBox/PromptBoxControls.js:23` and applied at `:1610`
  (`if (id === 'ratio' && !modelShowsRatio(model, operation)) return false;`).
- `imageSizedOps` — Krea2 declares `krea2Edit` at `js/data/modelConstants/models.js:699`
  and `:830`; Klein declares `kleinEdit` at `:1014` and `:1139`; Qwen declares `qwenEdit`
  at `:1781`. The described suppression is real in the data, not just in the prose.

**`npm run lint` — PASSED**, clean, `--max-warnings=0`.

No test is owed: no behaviour changed, and the `imageSizedOps` declarations above are the
standing proof of the behaviour the comments now describe.

## Preservation note discharged

`docs/op-model-selection.md` was grepped for the same stale claim and does **not** carry
it. No doc edit owed.

## Closing

Verify mode `auto`, self-verification passed on every criterion the plan's Phase 1 named.
Card closes on this evidence.
