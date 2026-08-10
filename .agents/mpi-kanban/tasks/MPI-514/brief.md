# MPI-514 - Tile badge explainer popup + a deprecated flag for models

**Fabio, 2026-08-10:** *"users have no idea what the star means anyway, and they
won't have any idea what the deprecate model symbol will mean either... we can use
the MPI popup, direction up, and just stick a badge in there - the badge will say
either featured or marked for deprecation."*

Deliberately NOT a system. Deprecation is a per-model editorial flag exactly like
`featured`: an agent is told "mark this for deprecation", the flag is set, a card
covers the actual removal, and the flag disappears with the model on the release
that removes it.

## Scope

1. `featured` star keeps its slot; its native `title="Featured"` goes - the repo
   forbids the Electron default tooltip. Hover mounts `MpiPopup` (position `top`)
   holding one `MpiBadge`.
2. New `deprecated` ModelDef flag -> its own tile badge, same slot, same hover
   popup, badge label "Marked for deprecation".
3. `nvidia-pid` gets `deprecated: true`. Its replacement is [MPI-507](../MPI-507/brief.md)
   (PiD becomes four plugins in the image upscale dropdown).

## What deprecation MEANS here (and the trap)

Deprecating PiD is a **conversion, not a delete**: the model leaves the Model
Library and comes back as plugins on the upscale dropdown (MPI-507, which itself
waits on MPI-506's plugin-dropdown mechanism).

On the release that removes the ModelDef, **do not delete the `pid-*` / `vae-*` /
`pid-gemma` entries from the dep files**. `_orphanedDepIds` in
`routes/downloadManager.js` walks DEPS and trashes what no model protects - the
surviving entry is exactly what lets a user who already downloaded the weight
reclaim the disk. Delete it and the sweep goes blind and the file strands forever.
MPI-470 and MPI-466 both kept theirs. Procedure:
`docs/playbooks/add-model/README.md` § "Removing or re-tiering a model".

## Do NOT reuse the op-level `deprecated`

`operationRegistry.js` already has a `deprecated` flag - on OPERATIONS, meaning
"history written by an older version still validates, nothing may write this key
again". It is invisible to users and its only reader is
`scripts/release-health-check.mjs` against the `dev_configs/operation_registry.json`
mirror. The model flag added here is a separate field on a separate object; the
`pid` OP is not deprecated (the plugins still run it).

## Follow-ups Fabio added in the same session

3. Optical centring: the `warning` glyph's ink is a wide, short triangle sitting
   half a unit high in its 24-unit viewBox, so flex-centring the `<svg>` box left
   the ink off-centre. Trimmed to 16px + `translateY(0.33px)`, scoped to
   `.mpi-tile__flag--deprecated`. The star measured dead-centre already and was
   left alone.
4. `minimax-h3-ref2va` is featured too.
5. **The EPIPE dialog** (unrelated to badges, fixed here because it was blocking
   the session): closing an agent's app instance popped a modal "Cubric Vision
   failed to start" quoting an EPIPE stack. The console mirror in
   `routes/logger._write` fails ASYNCHRONOUSLY on a dead pipe, so its try/catch
   never saw it and `uncaughtException` raised the dialog. `main.js` now swallows
   `EPIPE`/`EIO` on stdout/stderr only. Written up in
   `docs/DEVELOPMENT.md` § boot crash.

