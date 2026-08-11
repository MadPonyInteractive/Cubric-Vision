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
>
> **Target is 1.4.1, not 1.5.0 (Fabio, 2026-08-11).** Everything accumulated since
> 1.4.0 is fixes and small improvements, so it ships as a patch and this file folds
> as one block. The first-run entry below was filed "now under 1.5.0" by MPI-519 on
> 2026-08-10 — that is superseded; do not act on it. 1.4.1 goes out once the MPI-542
> umbrella's cards are done.

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

- **Video previews play at the video's speed again.** On some runs the live preview
  flashed the whole clip in an instant each time the sampler advanced, then froze until
  the next step. It now plays continuously at the clip's own frame rate, and no longer
  trims the start of the clip.

- **A cloud Pod used for downloads is no longer treated as a generation engine.**
  Connecting a "No GPU — download only" Pod while you were working locally could take
  your generation with it: the app tried to stage model weights onto a machine with no
  GPU and a few gigabytes of RAM, the Pod was killed, and the app read that as a dead
  engine and dropped remote mode — taking every in-flight install down with it. A
  download Pod is now only ever a download target.

- **A cloud install that dies now says so, instead of freezing.** When the Pod went
  away mid-install, the model card kept showing the Pod's last progress — a live-looking
  bar and a Cancel button for a download that could never finish, sometimes painted over
  a model your own disk already had. Those installs now end properly, say why, and offer
  a working Retry, and the Model Library goes back to showing what is really on your
  machine.

- **Losing the Pod mid-install is a notice, not an error report.** Stopping your own Pod
  raised the "Download Failed" dialog with a Report on GitHub button. It is now a normal
  heads-up message.

- **A queued install can no longer land on the wrong machine.** Installs run one at a
  time, and the engine was only decided when each one's turn actually came — so a model
  queued for your cloud Pod could start downloading to your local disk after the Pod
  disconnected, tens of gigabytes you never asked for. A queued install now remembers
  where it was meant to go and is cancelled, with a message, if that engine is gone.

- **"Generation complete" notifications no longer arrive long after the fact.** A batch
  that did not finish cleanly could leave its finished-count behind, and the next time
  anything drained the queue that stale count fired — announcing generations that had
  ended ten or twenty minutes earlier, sometimes over an hour. Counts that outlive their
  batch are now discarded.

- **Notifications stay up long enough to read.** Every notification got the same three
  seconds, whether it said "Copied" or quoted three figures and a drive letter — so the
  longer and more useful ones were gone before the first line landed. A notification now
  stays for as long as its message takes to read. And when two are on screen at once,
  only the first counts down: the second waits its turn instead of expiring while you
  are still reading the one above it.

- **"Not enough disk space" now names the disk, and asks for the right amount.** A local
  install could refuse with "29.3 GB needed, 29.4 GB free" — more free space than it said
  it wanted — because the check quietly reserves a small working margin the message never
  mentioned. And when the full disk was your cloud Pod's volume, the app replaced the
  server's exact figures with "free up space and try again", pointing you at your own
  machine, where clearing space would not have helped. Both messages now name the drive
  or the Pod volume and quote the amount actually required.
