# Unreleased — pending notes for the next version bump

> Scratchpad for changelog items accumulated between releases. When running
> `/mpi-version-bump`, fold every item below into the new
> `RELEASE_NOTES['<newVersion>']` entry in `js/data/releaseNotes.js` and the
> archival `docs/releases/YYYY-MM-DD-v<newVersion>.md`, then clear this file
> back to the header.
>
> **Cleared 2026-09-01 after 1.4.3 shipped.** All three fixes were folded into
> `RELEASE_NOTES['1.4.3']` and `docs/releases/2026-09-01-v1.4.3.md`. Note this file is
> the *branch's* scratchpad — 1.4.3 was cut from the `1.4.2` maintenance branch, so it
> held only the three issue-#2 fixes, never master's accumulated backlog.
>
> **Cleared 2026-08-15 after 1.4.2 shipped.** All nine items (4 new + 5 fixes) were
> folded into `RELEASE_NOTES['1.4.2']` and `docs/releases/2026-08-15-v1.4.2.md`.
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

<!--
DRAFT for 1.5.0 — agent draft, NOT approved copy. Gate 1 applies: Fabio rewrites this
before it ships. Scope is deliberately narrow — this release is the MiniMax H3 work and
nothing else. Flows, Music Maker and the rest of master stay on the 2.0 line.

Gate 0 run per bullet against v1.4.4 on 2026-09-05:
  - Encoder was HuggingFace-hosted on v1.4.4 (assetDeps.js `url:` is the ethanfel HF path,
    no mirrorUrl), so "came from HuggingFace / now from our servers" is REAL for this line.
    MPI-653 moved it to R2 on master only; these users never saw that.
  - Encoder was 24.55GB / 26,363,476,151 bytes on v1.4.4, so "about 10 GB less" is real
    (15,687,142,551 now).
  - Turbo: v1.4.4's dep FILENAME is `..._turbo_4step_v0.1_comfy.safetensors`, so the
    shipped weight is the 4-step v0.1 — while its `name:` field reads "(6-step distill)"
    and is simply wrong on the shipped line. Do NOT repeat either number; the copy below
    deliberately carries no step count.
  - The H3 high tier offering a size the model cannot produce is on v1.4.4 and was fixed
    in 19ec5c65, so it is a genuine Fixes bullet rather than same-version churn.
-->

## Important changes

- MiniMax H3 uses noticeably less memory than before, which makes it far more reliable on
  smaller machines and on rented GPUs — where running short of memory would previously
  stop a video partway through without explaining why.

## What's new

- **Sharper 2K and 4K video from MiniMax H3.** H3 now works in two stages: it lays the
  video down first, then a new upscaling stage rebuilds detail as it enlarges. High
  resolution clips hold together where before they were sampled straight out at full
  size. Turbo also moves to a stronger, better-trained fast model, so quick drafts look
  closer to the finished thing instead of glossy and plastic.

- **H3 downloads about 10 GB less, and arrives far faster.** The largest file H3 needs is
  now a smaller build, and it comes from our own servers rather than HuggingFace, where
  it trickled in at well under 1 MB/s and could run for hours or give up before
  finishing. If our copy is ever unreachable the app falls back to the original source on
  its own.

## Fixes

- The H3 quality picker offered a size the model cannot actually produce, so picking the
  highest setting could fail or hand back something other than the size on the label. The
  sizes offered now match what H3 renders.

<!--
HELD — needs Fabio's number before it can be written.

Remote Pod RAM floor. This line ships `minRamGb: 0` (js/core/storage.js): NO floor, so a
rented Pod can land on a 30-31GB 3090/4090 host. The encoder swap takes H3's staging pair
from ~45GB to ~35GB, which clears a 54GB L4 but NOT a 31GB host — so H3-on-Pod is only
half fixed without one. Master set 80, calibrated against the OLD 45GB staging; porting
that number verbatim would now refuse L4s that work. Suggested 48, which delivers ~42 on
Fabio's own "the ask is not the read" measurement (an L4 advertises 62 and gives 54).

If a floor lands, add a bullet saying rented GPUs are now picked with enough memory to
run H3, and that an existing Pod setting may need raising.
-->

