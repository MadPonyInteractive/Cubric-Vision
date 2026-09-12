# Stale comments claim the edit ops show a ratio picker — they do not

UMBRELLA: MPI-732. Read `tasks/MPI-732/plan.md` for the member list and phase order.

## Current State

Project mode: **scalable-foundation**.

**DONE, 2026-09-12.** Both comments corrected, lint clean, card in `done`/`complete` on
the evidence in `validation.md`. Nothing remains and there is no next action on this card.
The one thing a later reader should know: `docs/op-model-selection.md` was checked and
does not carry the same stale claim, so no doc is owed. Next in umbrella MPI-732 is
MPI-733 (Cue all) — but its Phase 2 file, `MpiGalleryGrid.js`, was under a live peer write
claim (MPI-730 item 3) when this card closed.

**There was no functional bug.** `ratio` is correctly hidden on the model-specific edit
ops by the MPI-354 `imageSizedOps` mechanism:

- `modelShowsRatio(model, operation)` returns false when the op is in the model's
  `imageSizedOps` — `js/data/commandRegistry.js:1534`.
- The control is filtered out at `js/components/Organisms/MpiPromptBox/PromptBoxControls.js:1610`
  (`if (id === 'ratio' && !modelShowsRatio(model, operation)) return false;`).
- Krea2 declares `krea2Edit` in `imageSizedOps` at `js/data/modelConstants/models.js:699`
  and `:830`; Klein declares `kleinEdit` at `:1014` and `:1139`; Qwen declares `qwenEdit`
  at `:1781`.

Confirmed against a live screenshot of the running app on 2026-09-12: the Krea2 edit
panel shows Quality / Style / Stylization / turbo and **no ratio selector**.

**What is wrong is two comments that assert the opposite**, and a reader who trusts
them will conclude the picker is live:

- `js/data/commandRegistry.js:441` — on the `edit` op, contrasting it with Krea2's:
  *"Krea2's edit is a separate op (krea2Edit) — it uses OUR provided dims and needs
  ratio + style."*
- `js/data/commandRegistry.js:356` — on `kleinEdit`: *"Takes ratio (Klein's editor uses
  OUR dimensions, like krea2Edit)"*.

`js/data/commandRegistry.js:485` already states the truth for Krea2 (*"suppressed by
Krea2's imageSizedOps — edit now follows the SOURCE image size"*), so the file
currently contradicts itself.

The `'ratio'` entry sitting in those ops' `components` arrays is **inert**, not wrong —
`components` is the op's declared list and `imageSizedOps` is the per-model override
that suppresses it. Removing it is optional and is the kind of cleanup that can quietly
change behaviour if a future model supports one of these ops without declaring
`imageSizedOps`. Default to leaving the arrays alone and fixing only the comments; if
the entries are removed, that is a deliberate call to be stated in Plan Drift.

## Completed

- [x] **Phase 1 — both comments corrected, 2026-09-12.** `js/data/commandRegistry.js`
      `:356` (`kleinEdit`) and `:441` (`edit`) now say what is true and name
      `modelShowsRatio()`. Comments only: 8 insertions / 4 deletions, no code line
      touched. Lint clean. Evidence and the four-site read-back: `validation.md`.

## Remaining Work

**None — the card is done.** It was a two-line correction in one file with nothing to
parallelise.

## Phase 1: Correct the comments — DONE

- [x] Rewrite `js/data/commandRegistry.js:441` and `:356` to say what is true: these
      edit ops follow the SOURCE image size and the ratio picker is suppressed by the
      model's `imageSizedOps`. Point at `modelShowsRatio` so the next reader can check
      rather than trust. Do not restate what `:485` already says — make the three
      comments agree, not repeat.
      **Verify:** re-read the three comment blocks together; they agree, and each names
      a symbol that exists. `npm run lint` clean. No behaviour change, so no test is
      owed — the screenshot above and the `imageSizedOps` declarations are the evidence
      the described behaviour is already what ships.

## Plan Drift

- **2026-09-12 — a FOURTH comment site exists, and it was already correct.**
  `js/data/commandRegistry.js:341`, on the `control` op: *"`ratio` is suppressed per model
  by `imageSizedOps`/modelShowsRatio, which is how Klein/Krea2/Qwen hide it here while
  SDXL and Chroma keep it."* The plan named three sites and this is a fourth. It needed no
  edit — instead it became the wording the two fixes were matched to, so the file now
  explains the mechanism once and cross-refers rather than repeating it four ways.
- **2026-09-12 — `components` arrays left untouched, as the plan's default.** No
  deliberate removal call was taken, so there is nothing further to state here.
- **2026-09-12 — line numbers held.** `:356`, `:441` and `:485` were all still exact when
  the card was picked up; `:485` shifted to `:489` only after this card's own +4 lines.

## Verification

**Verify mode:** auto

Comment-only. Nothing for a human to look at in the running app; the behaviour it now
describes correctly was already verified by screenshot before the card was written.

## Preservation Notes

- Nothing for docs, rules or memory. `docs/op-model-selection.md` is the doc that would
  own this if it needed one — check it does not carry the same stale claim before
  closing, and fix it there too if it does.
