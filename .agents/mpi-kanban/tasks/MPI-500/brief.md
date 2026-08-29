# MPI-500 — what is left, and why it is not code

The toggle shipped. `d3d475a9` (state, UI, wire, both delete sites, tests) and
`ae6f10b0` (the off/on description Fabio asked for). Verified: `npm test` 787/787,
and a live isolated instance showed the plate rendering, defaulting off, surviving a
reload, and putting `useRecycleBin` on the uninstall body as `true` then `false` to
match the switch. A claim audit over all three commits returned 7 proven, 0 false.

**`plan.md` is the scope. `checklist.md` is what actually happened.** One plan step
was deliberately not taken: `js/state.js` gained nothing, because nothing in the app
reacts to this pref changing — it is read once, at uninstall. The Auto-start toggle
directly above it in Settings is the same shape.

## The two remaining items — both docs, both gated

**1. `docs/download-manager.md:479` is now wrong.** The paragraph ends *"Small files
still go to the bin (undo-safety); only over-quota weights hit the fallback."* That
is true only with the toggle ON. With it OFF — the default, and what every test and
agent sandbox gets — nothing goes to the bin. Every quota fact in that paragraph is
still correct; only the who-decides sentence changed.

That file is on **MPI-653's `files.json`** and carried its uncommitted edits when
MPI-500 closed, so editing it would have swept a peer's work into this card's commit.
Message `dc873940` asks MPI-653 to fold the rewrite in, or to release the file.

**2. `docs/releases/UNRELEASED.md` owes an entry.** This is user-facing: the
inconsistency it fixes is the one Fabio reported three times ("some models end up in
my recycle bin and others don't"). `close-out.md` forbids close-out from writing
release notes without a per-file yes, so it was proposed and not written.

## Not in scope, recorded so it is not re-litigated

The remote leg. A Pod volume has no Recycle Bin, `_sweepOrphanedDepsRemote` /
`remoteUninstallDep` delete through the wrapper, and both are untouched. The
setting's own copy says so.
