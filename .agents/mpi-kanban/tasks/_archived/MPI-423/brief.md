# MPI-423 Brief — "hit Remove" names a control that does not exist

Raised 2026-08-01 from the docs-site side while writing the Cubric Vision 1.3.0
pages. The docs had copied the claim from the release notes on trust; checking it
against `commandRegistry.js` before publishing is what surfaced it.

## The claim

> paint over an object, hit **Remove**, and it's gone in about four seconds.

## Where it appears

| Site | What it is | Who reads it |
|---|---|---|
| `js/data/modelConstants/models.js:529` | `klein-4b` → `description` | **Every user** — the Model Library detail panel |
| `js/data/releaseNotes.js:49` | `RELEASE_NOTES['1.3.0']` | **Every user** — the in-app changelog |
| `docs/releases/2026-07-30-v1.3.0.md:54-55` | archival mirror | anyone reading the repo |

The **models.js** one is the problem. The other two are changelogs describing a
moment in time; this one is interface copy that a user reads *while deciding
whether to install the model*, and it tells them to press something that is not
there.

Note the mirror wraps the phrase across two lines (`…hit` / `**Remove**…`), so a
single-line `grep 'hit \*\*Remove\*\*'` returns nothing. It is there.

## Verified absent — not merely "I could not find it"

- No `remove:` key in `commandRegistry.js`.
- `models.js` itself lists `remove` under *"Deprecated (never wired to a
  workflow, kept so legacy history items still validate)"*, with `change`.
- `grep -rE "label: '(Remove|remove)'" js/` → nothing.
- The only `Remove` labels that exist are **Remove Background**
  (`commandRegistry.js:744`, `MpiToolOptionsRemoveBg.js:110`).

That last point is the actual user harm. Someone hunting for the promised
"Remove" finds **Remove Background**, runs it, and gets roughly the inverse of
what they wanted — the subject cut out instead of the object erased.

## What actually removes an object

1. Mask it — any of the four mask tools.
2. Pick **`inpaint`** from the operation strip.
3. Leave the prompt **empty**.

The prompt is the router: empty runs the erase path, any text runs the fill path.

**The app already knows this.** `commandRegistry.js` → `inpaint.help`:

> *"Leave the prompt EMPTY to remove the masked object, or write what you would
> like to see there instead."*
>
> *"Never write an instruction to delete something. The model reads your words as
> things to DRAW — 'remove the tattoo' risks painting a tattoo."*

…and its examples carry `remove the tattoo` flagged `bad: true`. So the app
contradicts itself: the **?** guide teaches the right thing, the model tile
teaches the wrong one, and the tile is what a user reads first.

The 1.3.0 notes also disagree with themselves — the prose says "hit Remove"
while the `### New Operations` section in the same file lists `remove` as
deprecated and never wired.

## Scope

The urgent part is one line. `models.js:529` is live UI; rewrite the sentence to
name Inpaint with an empty prompt.

Two judgement calls that should be **decided and recorded**, not assumed:

- **`RELEASE_NOTES['1.3.0']`** — a historical record of a shipped release.
  Correcting it keeps users from being misled; editing shipped changelog entries
  has its own cost. Either is defensible; silently doing neither is not.
- **Downstream comms.** The Platform Update Checklist in
  `docs/releases/2026-07-30-v1.3.0.md` lists Patreon and Discord unticked — but
  that checklist is not reliably maintained (GitHub Releases and Documentation
  Website are also unticked and both have happened). Check before assuming.

## Not in scope — the docs site is already correct

`docs.cubric.studio/vision/models/` documents the real path under
`#klein-remove` as a three-step procedure, carries the "never write an
instruction to delete" warning, and notes leaving the style on **None** for a
plain erase (styles apply to the patch, not the picture). Shipped in
`Cubric-Studio-Docs` `04a400b`; live and verified 2026-08-01. Nothing to do
there — the fix is entirely app-side.
