# MPI-641 checklist

- [x] Box `.mpi-base-flow__model-name` on the dropdown trigger's tokens (`--surface-2`, 1px solid, `--r-1`, `10px 14px`, `--t-sm`).
- [x] Quieter ink + `--line-soft` border, NO chevron / hover / pointer — it states, it does not offer.
- [x] Comment the pairing so a trigger restyle knows this box follows it; the block's "LAYOUT ONLY" header was corrected, since it now carries one deliberate exception.
- [x] Pinned by a desktop test comparing against a LIVE trigger on six computed properties (not hardcoded values, and not a class check).
- [x] `npm test` 774 pass / `npm run test:desktop` 39 pass.
- [x] Screenshot taken and checked by eye, after the peer committed the launcher. It caught a 4px height bug the tests had missed. Superseded note: `app:isolated` exits 0 in silence while a peer holds uncommitted edits in `main.js` + `scripts/launch-instance.mjs`, and the overlay is zero-size on Landing so `locator.screenshot` refuses it. See validation.md.
