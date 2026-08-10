# Unreleased — pending notes for the next version bump

> Scratchpad for changelog items accumulated between releases. When running
> `/mpi-version-bump`, fold every item below into the new
> `RELEASE_NOTES['<newVersion>']` entry in `js/data/releaseNotes.js` and the
> archival `docs/releases/YYYY-MM-DD-v<newVersion>.md`, then clear this file
> back to the header.
>
> **Cleared 2026-08-10 after 1.4.0 shipped.** The previous contents are not lost —
> every one of its 67 bullets was verified present in `RELEASE_NOTES['1.4.0']`
> before this reset (0 missing), and they live on in
> `docs/releases/2026-08-10-v1.4.0.md`. Two of them were deliberately dropped
> during Fabio's changelog review rather than folded: the MiniMax H3 turbo bullet
> and the H3 preview-pass bullet. `git log -- docs/releases/UNRELEASED.md` has the
> full history if you need the old wording.
>
> **The reset is part of the bump and it got missed in 1.4.0** — the fold ran, the
> clear did not, which would have re-folded all of 1.4.0 into 1.5.0 and shipped
> every bullet twice. If you are folding a release and this file still holds the
> last one's items, that is the bug, not a backlog.

## Important changes

_(none yet)_

## What's new

- **First run asks how you want to work before it asks for a folder.** Setup opened on
  a models-folder picker, with "run on a cloud GPU instead" as a small link at the
  bottom — so the only obvious path was a multi-gigabyte install, even on a machine
  that will never use it. It now opens on the actual question: **Local + Remote**
  installs ComfyUI here and generates on your own card, with a cloud GPU there for the
  jobs it cannot take; **Remote only** skips the install entirely and takes you
  straight into the app to connect a RunPod account. Each side says plainly what it
  costs you — a one-time install and a capable GPU, or an account billed while a Pod
  runs — and you can change your mind later in Settings. The folder picker is still
  there, one step further in, and it now reads as one screen rather than three
  different left edges.

## Fixes

_(none yet)_
