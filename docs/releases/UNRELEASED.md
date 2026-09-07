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
before it ships.

SCOPE, and it widened on 2026-09-07. This release is the MiniMax H3 work PLUS the
non-Flow image-model work carried over from master (Fabio: "B"). Flows, Music Maker,
Stable Audio, 3D scene and the gallery rendition ladder stay on the 2.0 line.

Gate 0 re-run per bullet against v1.4.4 on 2026-09-07:
  - Encoder: v1.4.4's `h3-qwen3vl-32b-clip` url is the ethanfel HF path with NO
    mirrorUrl. It is R2-primary now (MPI-653 ported 2026-09-07), HF kept as the
    fallback, and `release:deps` HEADs both — 260/260 reachable. So "from our own
    servers rather than HuggingFace" is REAL for this line. Measured on master when the
    object was uploaded: 0.66 MB/s off HF against 35.7-37.4 MB/s off R2.
  - "DOWNLOADS ABOUT 10 GB LESS" IS DELETED AND MUST NOT COME BACK. That was the NVFP4
    encoder's saving, and NVFP4 was rejected on 2026-09-07 (MPI-698, ~10 generations of
    entity duplication). The shipped encoder is the same 24.55GB / 26,363,476,151-byte
    Heretic int8_convrot file v1.4.4 shipped. Same bytes, faster host — that is the
    whole of the claim now.
  - RAM floor: v1.4.4 ships `minRamGb: 0` — no floor at all — so "used to place you on
    whatever machine was free" is accurate rather than same-version churn. The number is
    64, not the 62 an earlier draft carried and not the 2.0 line's 80: with the Heretic
    encoder back the staging pair is ~45GB, and in this datacentre RTX 5090 hosts come
    at 54 or 90 and nothing between, so 64 excludes the 54 and lands the 90.
  - Video posters: v1.4.4 renders them at `scale=256:-2` while image thumbs are 512
    (`services/ffmpegThumb.js`), so "videos looked softer than images" is real and
    shipped. Both are 512 now.
  - Inpaint: on v1.4.4 exactly one card declares `inpaint` — Klein 4B. Five SDXL-family
    cards and both Krea 2 cards gain it here, so this is genuinely new to a user.
  - Klein 9B: master gained it 2026-08-27 but master has not been released since v1.4.2
    (2026-08-15), so NO user has ever seen it. New, not a port note.
  - Turbo: v1.4.4's dep FILENAME is `..._turbo_4step_v0.1_comfy.safetensors`, so the
    shipped weight is the 4-step v0.1 — while its `name:` field reads "(6-step distill)"
    and is simply wrong on the shipped line. Do NOT repeat either number; the copy below
    deliberately carries no step count.
  - The H3 high tier offering a size the model cannot produce is on v1.4.4 and was fixed
    in 19ec5c65, so it is a genuine Fixes bullet rather than same-version churn.
  - The quality-tier RENAME (MPI-704) is a real user-visible change and needs saying: a
    saved project's tier string resolves to a different canvas than it did before.
-->

## Important changes

- **The video quality settings have been renamed, and a saved project may open at a
  different size.** MiniMax H3's sizes moved down one step: what used to be the top
  ordinary setting is now the middle one, and a genuinely larger option sits above it.
  The sizes themselves did not change — the labels did, because the old top setting
  produced draft-grade video and should not have been called high. Reopening an older
  project may therefore show a different size than the one you saved.

- MiniMax H3 uses noticeably less memory than before, which makes it far more reliable on
  smaller machines and on rented GPUs — where running short of memory would previously
  stop a video partway through without explaining why.

- Rented GPUs are now chosen with enough memory to actually run H3. Renting a remote GPU
  used to place you on whatever machine was free, including ones with too little system
  memory for a video model, where a generation could be killed partway through with no
  explanation. New Pods now ask for at least 64 GB. You can change that figure in
  settings, and should raise it for anything heavier than H3.

## What's new

- **A second FLUX.2 Klein: the 9B.** A larger, stronger sibling of the Klein already in
  the app, with its own seven styles — Storybook, Comic, Anime, Chibi, Doodle, Vintage
  and Watercolour. They are deliberately not the same eight the smaller Klein offers:
  four of them are a different artist's work entirely, so naming them after the 4B styles
  they sit beside would be a label that lies about what loads. Both cards now carry their
  size in the name, so it is clear which one you are picking and which styles belong to
  it.

- **Inpainting comes to SDXL, Illustrious, Pony and Krea 2.** Paint a mask, describe what
  should be there, and only that part is rebuilt — the rest of the picture is left exactly
  as it was. It was previously available on FLUX.2 Klein alone. On Krea 2 the fast/quality
  toggle works here too, so a quick fix stays quick.

- **Sharper 2K and 4K video from MiniMax H3.** H3 now works in two stages: it lays the
  video down first, then a new upscaling stage rebuilds detail as it enlarges. High
  resolution clips hold together where before they were sampled straight out at full
  size. Turbo also moves to a stronger, better-trained fast model, so quick drafts look
  closer to the finished thing instead of glossy and plastic.

- **The largest file H3 needs now comes from our own servers.** It used to be fetched
  from HuggingFace, where it trickled in at well under 1 MB/s and could run for hours or
  give up before finishing. It is the same file — it just arrives at a usable speed now.
  If our copy is ever unreachable the app falls back to the original source on its own.

- **Longer LTX clips render faster.** LTX now uses ComfyUI's own built-in fast attention,
  which needs nothing installed and works on the graphics card you already have. The gain
  grows with clip length: nothing measurable on a 2 second clip, around 13% off a 5
  second one.

## Fixes

- Uninstalling a model left some of its files on disk while reporting success. Anything
  the model kept next to the engine — frame interpolation weights, for instance — could
  not be removed at all, and the app told you the files were being kept deliberately.
  They are properly removed now, and the space comes back.

- Videos in the gallery looked softer than the images sitting next to them. Their preview
  frames were being generated at half the width of image thumbnails; both are the same
  size now.

- The H3 quality picker offered a size the model cannot actually produce, so picking the
  highest setting could fail or hand back something other than the size on the label. The
  sizes offered now match what H3 renders.

- The video preview flashed a few scrambled frames at the start of an LTX generation.

- Downloading models to a rented GPU has had three failures fixed: it no longer gives up
  when the cheap CPU machines it prefers are all taken, it no longer starts more downloads
  at once than the machine can carry, and a download now picks itself back up if the
  remote machine restarts underneath it instead of stalling silently.

<!--
Remote Pod RAM floor — WRITTEN. Fabio set 62 in a92a89a1; corrected to 64 in 365476d7
after the encoder revert took the staging pair back to ~45GB. See the Gate 0 block above.

Gate 0: this line really did ship `minRamGb: 0` (js/core/storage.js on v1.4.4), i.e. no
floor at all, so "used to place you on whatever machine was free" is accurate rather than
same-version churn.

The copy says "at least 64 GB" and calls it changeable on purpose: it is a suggestion,
not a ceiling.

NOT WRITTEN, and deliberately — internal only, nothing a user perceives:
  - MPI-609, the Klein style LoRA file renames (the picker labels did not change)
  - MPI-703, the MpiNodes pin
  - c4208de8, the pod-lock gate fix (affects the smoke runner, not the app)
  - MPI-619's mechanism; only its user-facing half (the names) is in the Klein bullet
-->
