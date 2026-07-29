# MPI-351 — Validation

**USER-VERIFIED live, 2026-07-29.** The user re-ran the failing case in the app and
confirmed the upscale now runs on the selected entry.

## What the bug actually was

The History workspace treated the PromptBox chip rail as the input when it held an
image, and only fell back to the selected entry when the rail was empty
(`wantsCurrentType && !hasCurrentTypeMedia`). Chips are persisted per workspace in
`state.promptMedia[wsKey]` and re-injected on every mount, so one image staged once
owned `Input_Image` indefinitely — invisibly, since the PromptBox panel is hidden
behind the History prompt rail tool.

## Evidence that pinned it (project "Cubric prompt tests")

Read from `Media/.meta/*.json` — `generationSettings.mediaItems`, not output sizes:

| entry | time | recorded input |
|---|---|---|
| upscale_002-005 | 23:43–23:47 | `.preview-assets/5b9ea765…` |
| removeBackground_001 | 23:49 | `.preview-assets/5b843dbe…` (correct) |
| **crop_011 created** | 23:54 | — |
| upscale_007 | 23:58 | `.preview-assets/5b9ea765…` |

`5b9ea765` hashes to **kleinEdit_002.png, 912×1152**, generated at 21:54 — two hours
stale. 912×1152 × 1.5 = **1368×1728**, the exact size of upscale_007. crop_011
(1241×1552) never reached the graph. This is why the bug originally read as "the
upscale factor is applied twice": the factor was always 1.5 and always correct.

`removeBackground_001` is the negative control that identified the mechanism — tool
ops (`_runImageTool`, crop) build `mediaItems` from `currentItem` and never read the
rail, so only PromptBox-driven ops were hijacked.

## Fix

`MpiGroupHistoryBlock.js`, three edits:

1. `_generationFromPromptPayload` — rail media no longer reaches the graph. Image
   group → staged media is `[]`, so the selected entry always fills the slots. Video
   group → only role-tagged `startFrame`/`endFrame` and non-image (audio) survive;
   `i2v` requires an IMAGE start frame that a video entry cannot fill, and those
   frames come from the dedicated slots in `MpiToolOptionsPrompt` plus the
   Extend/New-shot last-frame capture. Untagged rail images are dropped there too.
2. `_applyPromptReuse` — image groups no longer inject reused source images; they
   would be inert. Video still restores its frames.
3. `_mountPromptBoxIfNeeded` — image groups clear the restored chip on mount, so
   existing projects stop carrying the one that caused this.

Product decision (user): History is one operation on one image. Multi-image ops
(krea2Edit / qwenEdit / kleinEdit second and third images) belong in the gallery —
picking one in History now runs it on the selected entry alone. Evidence supported
this: across all 23 projects, multi-image *image* runs inside History numbered zero.

## Automated check

`tests/history-current-entry-owns-media.test.cjs` — 5/5. Covers: stale chip loses to
the selected entry; a multi-image op collapses to the entry; video start/end frames
and audio survive; an untagged rail image in a video group is dropped.

eslint clean on the changed file. Pre-existing suite failures unchanged.

## Not done

The chip rail UI is untouched — it is simply out of the dispatch path now, and the
video start/end-frame slots are slated to move to an App.
