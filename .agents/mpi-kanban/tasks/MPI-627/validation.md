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

## Confirmed in the app — 2026-08-26T16:34:40Z

Reloading was not enough and briefly read as "the fix did nothing": Ctrl+R reloads
the renderer while the **server process keeps the old code in memory**. Evidence at
the time: the app had been running since 06:53:52, the fix landed ~16:45, and all
33 thumbs on disk were still `.thumb.jpg` with the newest written at 17:15.

After a full quit and relaunch, Fabio: *"fix worked. The consistent colour is now
not confusing anymore."* The gun, the cup and the `pal8` Google logo (3840x2160,
transparency without ever reporting `rgba`) all composite onto the gallery surface.

Also verified during close-out: `npm run release:check` **passed**; no versioned
surface was touched, so no bump is owed; `scripts/overtaken-cards.py` reported
**0 candidates**; board validation **passed**.
