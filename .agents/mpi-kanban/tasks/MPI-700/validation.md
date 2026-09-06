# Validation — MPI-700

**Verified by:** Fabio, wired and run on his own bench, 2026-09-06.
**Verdict:** PASSED.

## What was wrong

`MpiSaveVideo` was `OUTPUT_NODE = True` with `RETURN_TYPES = ()`. Nothing could be ordered
after the mp4 existed, which forced an `MpiClearVramEnd` onto every terminal branch (video
decode, audio decode, latent) and put the multi-second VRAM clear *inside* render time.

## The fix

`b8bc9b3` (ComfyUi-MpiNodes, `video.py`) — `RETURN_TYPES = ("STRING",)` /
`RETURN_NAMES = ("video_path",)`, and the return adds a `"result": (out_path,)` key
alongside the unchanged `"ui"` payload. The preview still appears; the absolute path of the
written mp4 is now reachable downstream, and it also feeds `MpiHasAudio` / `MpiLoadVideo`.

## Evidence

Fabio wired `video_path` to `MpiClearVramEnd` and confirmed it works. One terminal clear
now replaces the per-branch ones, and it fires after the user already has the file, so the
unload stops costing render time. Image workflows already end in a preview node with an
output, so they gain the same ordering without a change.

## Ship state

Committed **locally only** — same block as MPI-701. `ComfyUi-MpiNodes` HEAD is 4 commits
ahead of `origin/main` and two of them are MPI-699's uncleared work; `git push` sends the
branch, not a commit. The `dev_configs/node_lock.json` pin bump waits on that push, and the
app's current pin `8505769` predates the node, so nothing here is a live user bug.
