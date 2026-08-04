# MPI-388 Validation

Verify mode: **user-ux**. **PASS — user-verified live 2026-07-30.**

## Root cause (for the record)

Not History-specific, which is how the card was reported. `MpiGalleryBlock` seeds its op from
`getSelectedOp(activeModelId)` — the MPI-247 per-model memory — with no regard for media, so any
user pick of a media-hungry op is replayed onto the next Gallery mount whether it was made in
History or in the Gallery itself before the image was deleted. MPI-356's drop-to-text-op is gated
on `hadMedia`, i.e. a *transition*, so a box that mounts empty never triggers it.

## Fix

| File | Change |
|---|---|
| `js/data/commandRegistry.js` | New `isTextOnlyOp(key)` + `pickTextOnlyOp(mediaType, model, ctx)` — the filter MPI-356 had inlined, lifted so both callers share one decision. |
| `js/components/Organisms/MpiPromptBox/MpiPromptBox.js` | MPI-356 branch body extracted to `_dropToTextOp()`; new public `el.dropToTextOpIfEmpty()` = that drop, gated on empty box + media-hungry op. |
| `js/components/Blocks/MpiGalleryBlock/MpiGalleryBlock.js` | One call after `_wirePromptBox` + the count sync. |
| `tests/gallery-entry-text-op.test.cjs` | New, 4 tests. |
| `docs/generation-lifecycle.md` | New section: the no-force-DOWN rule and its two named exceptions. |

Placement is load-bearing. **After** `_wirePromptBox` so the resulting `operation-change` updates
the block's `activeOperation` instead of letting it drift; **after** the count sync because the
box's live counts are the only truthful read (restore drops chips on a slot-id mismatch and evicts
on capacity). `programmatic: true` keeps `s_selectedOpByModel` intact. Deliberately NOT on the
Reuse path (`MpiGalleryBlock` ~line 1255) — a reused op is authoritative.

## Evidence

- App trip, all four acceptance cases confirmed by the user: empty box on Gallery re-entry reads
  t2i; media present leaves the op alone; the remembered pick returns when media comes back;
  delete-last-image inside the Gallery still drops to t2i with no MPI-337 detail→upscale return.
- `node --test tests/gallery-entry-text-op.test.cjs` → 4/4.
- Full suite `node --test tests/*.test.cjs` → 278 tests, 269 pass, **9 fail = the same known
  pre-existing list** (optional-media-placeholder, permodel-key-allowlist ×3, resolve-model-deps,
  remoteProxy ×4). No new failures.
- eslint clean on all three touched modules (the `querySelector` warning at MpiPromptBox `_triggerRun`
  is pre-existing and untouched).

Honest limit: no negative control against unfixed HEAD. The two helpers are new, so a unit test on
them passes trivially; the test locks the contract the entry path depends on, and the app trip is
the actual control.

## No changelog entry — deliberate

MPI-356 shipped **after** the 1.2.0 release, so this defect never reached a user. Called by the
user: an in-cycle regression fixed in-cycle is not a 1.3 changelog line.
