# MPI-627 — validation

## Automated

- `tests/image-thumb-alpha.test.cjs` (new). Asserts the thumb lands at the
  `.webp` path, that **a transparent pixel survives the downscale** (the
  extension is not the thing that matters), that no JPG is left beside it, and
  that an opaque source still thumbs. **Mutation-checked**: reverted to the old
  `-q:v 4` JPG args and the test fails; source restored in a `finally`.
- `npm test` — **742 pass, 0 fail** (741 before this card).
- `npx eslint` on all four changed JS files — clean.

## Against the user's own project (on a COPY, never the live folder)

The real router mounted on a spare port, `POST /backfill-image-thumbs` against a
copy of `Documents/Cubric Vision/Projects/Stamp Flow Tests`:

- 13 sidecars patched; **5 cut-outs healed** to alpha-carrying WebP, their stale
  jpgs deleted; **3 opaque JPG sources untouched**.
- Second run patched **0** — the migration is idempotent.
- The healed thumb composited over `--surface-3` renders the cut-out gun on the
  gallery surface, no backdrop, no shadow.

## Needs the user's eyes (why this card sits in `validating`)

Restart the app, reopen **Stamp Flow Tests**, confirm the gun and the coffee-cup
cards show their cut-outs over the gallery surface.
