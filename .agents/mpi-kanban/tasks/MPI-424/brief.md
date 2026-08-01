# MPI-424 Brief - post the 1.3.0 Patreon + Discord announcements

Both posts are still unsent, confirmed by the user 2026-08-01. That is the good
news half of [MPI-423](../MPI-423/brief.md): the "hit **Remove**" sentence never
made it into a public announcement, because no announcement went out.

## Where the work happens

**`c:\AI\Mpi\MadPony-Identity`** - a sibling repo, not this one. It holds the
posting capabilities:

- `capabilities/patreon/`
- `capabilities/discord/` (+ `discord-ops.md` at the repo root)

Nothing in this card is edited from Cubric-Vision. Per CLAUDE.md's cross-root
rules, the sibling has its own git and its own config; work it from there.

## Where the copy comes from

| File | Role |
|---|---|
| `docs/releases/2026-07-30-v1.3.0.md` | the written changelog - the announcement source |
| `js/data/releaseNotes.js` -> `RELEASE_NOTES['1.3.0']` | the same notes as the app shows them |
| `docs/releases/UNRELEASED.md` | **not this release** - 7 lines, flushed at the 1.3.0 cut, accumulating for the next one |

## The one sentence that must not regress

Both files carried, and no longer carry:

> paint over an object, hit **Remove**, and it's gone in about four seconds.

There is no Remove operation. The corrected wording, live since `ca0eb45e`:

> mask an object, run **Inpaint** with the prompt left empty, and it's gone in
> about four seconds.

Writing the announcement from a cached or remembered version of the notes is the
one way this claim still reaches the public. Re-read the files.

## After posting

Tick **Patreon** and **Discord** in the Platform Update Checklist at the bottom
of `docs/releases/2026-07-30-v1.3.0.md`. Note that checklist is not reliably
maintained - Landing Page and Documentation Website sit unticked there too and
at least the docs site has shipped - so tick what you actually did and leave the
rest alone.
