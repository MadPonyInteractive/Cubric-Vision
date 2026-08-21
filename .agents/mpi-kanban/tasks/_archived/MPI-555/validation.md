# MPI-555 validation

## Live, in the user's app (2026-08-14)

Reuse of `t2i_007` (klein-4b / t2i) with three reference pictures and an audio chip
staged from a MiniMax H3 setup: **the tray came back empty.** Model, 16:9 ratio and
prompt all restored as before. Confirmed by Fabio on a reloaded renderer.

Before the fix the same click left all four chips staged, and the next Cue would have
carried inputs the reused card never had.

## The first attempt was wrong and is reverted

`a47a318f` put the clear inside Reuse's media branch. It could never fire: the Reuse
dialog greys the media toggles OFF when the source card has no media, so `use.images`
and its siblings were all false. Fabio reloaded, clicked Reuse, chips still there -
which is the only reason the wrong layer was caught. Reverted inside `8a40dd57`; both
gallery blocks are byte-identical to their pre-attempt state.

**The lesson worth keeping:** a chip is not Reuse's to own. The slot a chip fills is a
property of the op+model pairing, which is why `setOperation` already re-derives every
chip's LABEL - the missing half was dropping the chips the pairing has no slot for at
all. Fixing it in the PromptBox also covers switching op or model by hand.

## Automated

- `tests/promptbox-prune-unsupported-media.test.cjs` - 4 cases, mirrors the guard
  (house pattern). Covers: accepts-nothing drops the whole tray, partial acceptance
  keeps only what has a slot, the staging pairing is untouched AND emits nothing, and
  removals stay silent so the op-switch logic sees one settled state.
- Slot contract verified against the live registry: `klein-4b/t2i` -> `[]`,
  `klein-4b/i2i` -> `[image]`, `minimax-h3-ref2va/ref2v_ms` -> image+video+audio.
- `npm test` 586/586, eslint clean.
