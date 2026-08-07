# MPI-472 Brief — `imageio-ffmpeg` is not in the dependency lock

**Severity: ship-blocking.** Any user whose engine does a full reinstall loses
**all video generation on every model** — LTX, WAN, MiniMax H3, every op that
ends in `MpiSaveVideo`. It fails at the very last node, after the full sample.

## What happened (observed live, 2026-08-07)

The dev engine full-reinstalled itself and came back without ffmpeg:

```
06:09:42  [engine] Full engine reinstall — custom node
                   "ComfyUI-MpiNodes.stale-aaa1d2d9.disabled" is no longer in the registry
06:09:42  [engine] Removing old ComfyUI portable
06:24:11  [comfy]  [VideoHelperSuite] WARNING - Failed to import imageio_ffmpeg
06:24:11  [comfy]  [VideoHelperSuite] ERROR   - No valid ffmpeg found.
06:58:47  [comfy]  MpiSaveVideo failed: RuntimeError: [MpiSaveVideo] no ffmpeg found
                   (imageio-ffmpeg bundle / VHS_FORCE_FFMPEG_PATH / PATH all failed).
```

Log: `%APPDATA%\Cubric Vision\logs\app.log` (filter by `[engine]` / `[comfy]`).

**The wipe is NOT this card.** It was already fixed by MPI-457 in `6856d841`
("a .disabled node folder is not a deprecation") ~70 min after it fired. The
wipe only *exposed* the real defect below.

## Root cause

`MpiSaveVideo` resolves ffmpeg via `find_ffmpeg()`
(`C:\AI\Mpi\ComfyUi-MpiNodes\help_funcs.py:419`), order:
`VHS_FORCE_FFMPEG_PATH` env → `import imageio_ffmpeg` → `shutil.which("ffmpeg")`.

- `dev_configs/python_deps.in` — **no `imageio` or `imageio-ffmpeg` line at all.**
- `dev_configs/python_deps.txt:106` — `imageio==2.37.4`. **Different package**,
  present only as a compiled transitive. It does NOT bundle the binary.
- `engine/.../site-packages/` after the reinstall — `imageio/` present,
  `imageio_ffmpeg` **absent**.
- `custom_nodes/comfyui-videohelpersuite/requirements.txt` — two lines:
  `opencv-python`, `imageio-ffmpeg`. **That is the only place it was ever declared.**

So our own node's hard runtime dependency is owned by a third-party node's
requirements file. Remove or fail to install VHS and every video op dies. That
is the root cause; the reinstall is just the trigger that stopped VHS's
requirements from being applied.

## Fix

1. Add `imageio-ffmpeg` to `dev_configs/python_deps.in` (the engine had `0.6.0`).
2. Recompile `python_deps.txt`. **Do not hand-edit the `.txt`** — it is a
   compiled lock. Read `~/.claude/memory/tools/uv-pip-compile.md` FIRST: it
   documents that `--no-emit-package` does not exclude the transitive closure,
   that `--no-deps` is load-bearing, and that the resolver cannot dedupe
   same-namespace distributions. This lock must NOT start owning torch.
3. Sweep for the same class: any other package that only ever arrived through a
   custom node's `requirements.txt` but is required by **our** MpiNodes code.
   `help_funcs.py` and `video.py` are the places to start.

## Verify

Not "it installs" — prove it on a clean engine:

- A fresh/full engine install lands `imageio_ffmpeg` in
  `engine/ComfyUI_windows_portable/python_embeded/Lib/site-packages/`.
- In the engine python: `import imageio_ffmpeg; imageio_ffmpeg.get_ffmpeg_exe()`
  returns an existing path.
- A real video generation completes and `Output_Video` emits an mp4.
- `npm test` still green.

## Already done (dev machine only — NOT the fix)

`imageio-ffmpeg==0.6.0` was pip-installed into the local engine on 2026-08-07 to
unblock the session. That repairs one machine and nothing else; the lock is
still wrong. Note `find_ffmpeg()` runs per invocation and Python does not cache
failed imports, so that unblock needed no engine restart — VHS's own nodes stay
degraded until one, because they cache at import.

## Context

Found while validating MPI-466 (LTX i2v routes). Not MPI-466's doing.
