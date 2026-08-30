# MPI-660 — validation

## What was proven

`node --test "tests/*.test.cjs"` — **797 pass, 0 fail**. Run twice: 796 with the new file's
first three tests, 797 once the fourth (the tool-route convention scan) was added. The
pre-MPI-660 baseline was 793.

`tests/flow-output-filename.test.cjs`, 4 tests, all green:

1. every file-producing op is filed under a name the UI shows
2. every Flow files its output under its own title
3. the tool routes name their output in the same convention as the ops
4. the prefix survives the trip from the registry to the sequence allocator

The tests have teeth rather than restating the table — an earlier run of #2 rejected
`flowFoley` for dropping "Add" from "Add Foley", and #3's scan was widened after it was
observed matching only 4 of the 6 real prefix literals (it now reads all six:
crop, composite, videoCrop, videoReverse, combined, extended).

## The resolved table, read out of the live registry

    kleinEdit_001   krea2Edit_001   qwenEdit_001   edit_001  ->  edit_001
    pid_001                                                  ->  upscale_001
    t2v_ms_001 / i2v_ms_001 / ref2v_ms_001                   ->  t2v_001 / i2v_001 / ref2v_001
    flowChatterBox_001                                       ->  flowTTS_001
    flowLtxExtend_001                                        ->  flowExtendVideo_001
    flowLtxFoley_001                                         ->  flowAddFoley_001
    flowScribObj_001                                         ->  flowDrawItIn_001
    video_crop_001 / video_reverse_001                       ->  videoCrop_001 / videoReverse_001

## Not proven

**No generation was run in the live app.** Nothing here downloads a real ComfyUI output,
so the end-to-end save path is covered by source assertions (test 4), not by a file on
disk. The first real TTS run should land as `flowTTS_001.wav`.

No collision risk was found for the renames: `nextSequence` seeds a new prefix's counter
from a disk scan for that literal prefix plus `_NNN`, so `video_crop_007.mp4` is invisible
to `videoCrop` and existing files keep their names.

## `docs/releases/UNRELEASED.md` entry — APPROVED and written 2026-08-30

The Flow half owes nothing (Flows debut in this release, so no user met the old names).
The prompt-box half does: `edit`, `pid` and the `_ms` video ops all shipped in v1.4.2 or
earlier, so this changes what a released feature names its files. It went under `## Fixes`,
not `## Important changes` — Fabio's call, and the right one: nothing breaks, and files
already on disk keep their names. The text as written:

> - Generated files are named after the button you pressed. An edit is `edit_004` whichever
>   model made it, an upscale is `upscale_002` rather than `pid_002`, and a video is
>   `i2v_007` rather than `i2v_ms_007`. The names came from internal ids before, so the same
>   Edit button produced four different ones. Which model made a picture is still one click
>   away on the card's Reuse. Files you already have keep the names they were saved under.

## Decisions on record (Fabio, 2026-08-30)

- Collapsing the four edit keys onto `edit_NNN` is wanted — the model is recoverable
  through Reuse, and four names for one button was the worse outcome.
- The snake_case tool prefixes were to be fixed in the same pass.
