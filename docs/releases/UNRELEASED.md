# Unreleased — pending notes for the next version bump

> Scratchpad for changelog items accumulated between releases. When running
> `/mpi-version-bump`, fold every item below into the new
> `RELEASE_NOTES['<newVersion>']` entry in `js/data/releaseNotes.js` and the
> archival `docs/releases/YYYY-MM-DD-v<newVersion>.md`, then clear this file
> back to the header.
>
> **Cleared 2026-08-11 after 1.4.1 shipped.** All nine bullets (1 new + 8 fixes)
> were folded into `RELEASE_NOTES['1.4.1']` and
> `docs/releases/2026-08-11-v1.4.1.md`, including the first-run entry an earlier
> commit (`e2b0ddbf`) had filed for 1.5.0 — Fabio retargeted the whole scratchpad
> at the patch, because nothing pending was a feature.
>
> **The reset is part of the bump and it got missed in 1.4.0** — the fold ran, the
> clear did not, which would have re-folded all of 1.4.0 into the next version and
> shipped every bullet twice. If you are folding a release and this file still holds
> the last one's items, that is the bug, not a backlog.
>
> **Before writing a "used to / previously / no longer" claim, check it against the
> last released tag** (`git show v<prev>:<path>`), per bullet. Code that changed two
> or three times inside one unreleased version reads like user-visible history but
> never shipped, and the entry is then simply false. Full gate:
> `.claude/skills/mpi-release/references/copy-review.md` § Gate 0.

## Important changes

_(none yet)_

## What's new

Notes read as notes now — Project notes and Card notes render your markdown instead of showing the raw text. Headings, tables, lists, quotes and code all come out formatted, with each heading level in its own colour so a long document is easy to scan. A pencil/eye pair at the top right switches between editing the source and reading it, and the preview shows what you have typed before you save it. Long notes scroll — before, anything past the height of the window was simply cut off with no way to reach it. The window is wider and the text larger, so a table has room to breathe. Release notes take markdown too, so this "What's new" can be formatted from here on.

Video has a 21:9 cinematic ratio. It sits beside 1:1, 9:16 and 16:9 on every video model and at every quality level, so the wide anamorphic shape is a choice up front rather than a crop afterwards.


## Fixes

MiniMax H3 video looks better with Turbo off. The slower setting was coming out worse than the fast one, which is backwards - it now gives the quality it asks the extra time for.

Reference images and audio no longer linger in the prompt box after you move to a model or operation that cannot use them. Reusing a text-to-image card while references were staged left them sitting in the tray, and the next generation quietly ran carrying inputs it should never have had.

