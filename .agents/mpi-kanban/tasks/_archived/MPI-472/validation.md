# MPI-472 Validation

All run 2026-08-07 on the dev machine, engine and app both DOWN (`:48188` and `:3000`
refused), which is the state the curated pass requires.

## The gate catches it — both directions

```
node scripts/compile-node-deps.mjs --check        →  OK, exit 0
# same command with the imageio-ffmpeg line removed from python_deps.in:
DRIFT — 1 declared requirement(s) missing from python_deps.in:
  imageio-ffmpeg   (from ComfyUI-VideoHelperSuite)     →  exit 1
```

The negative control is the point: before the fix the gate never fetched VHS at all, so it
printed `OK` while the requirement was missing.

## The lock resolves on the engine interpreter

`uv pip install --python <engine python> --no-deps --dry-run -r dev_configs/python_deps.txt`
→ `Resolved 125 packages`, `Would make no changes`. Proves every pin has a compatible
wheel for the shipped interpreter (3.13, win_amd64) in ~45 ms.

## The app's own install path delivers it — not just the file

Rather than wipe a 25 GB engine to get a "fresh install", the delivery loop was exercised
directly, which is what a fresh install runs anyway:

1. `python -m pip uninstall -y imageio-ffmpeg` → `import imageio_ffmpeg` →
   `ModuleNotFoundError`. The exact failed state from the log in the brief.
2. `require('./routes/shared').ensureCuratedPythonDeps()` — the function `/comfy/start`
   calls before the spawn.
3. `[pip] Successfully installed imageio-ffmpeg-0.6.0`,
   `curated python deps installed, marker stamped (fbf05d804b767e8c)`.
4. `import imageio_ffmpeg; imageio_ffmpeg.get_ffmpeg_exe()` →
   `...\python_embeded\Lib\site-packages\imageio_ffmpeg\binaries\ffmpeg-win-x86_64-v7.1.exe`,
   exists = True.

**Existing engines self-heal with no wipe.** The marker is a hash of `python_deps.txt`
contents; the recompile changed it, so the next `/comfy/start` re-runs the one-pass install
on every machine that already has an engine.

## Suite

`npm test` → 482 passed, 0 failed.

## Still open

A real video generation writing an mp4. Nothing has rendered since the fix — the binary
resolves and the install path is proven, but the product-level check is unrun.

## Not this card

The Pod never had the bug: both `mpi-ci/cubric-vision-pod/Dockerfile` and the builder image
apt-install `ffmpeg`, so `find_ffmpeg()`'s third branch (`shutil.which`) succeeds there.
Adding the pin means the next image build also bundles it — harmless, ~31 MB, no rebuild
needed for correctness.

`.claude/rules/comfy_engine.md` still documents `installRequirements` as "set `true` when
the node ships a real `requirements.txt`", which VideoHelperSuite contradicts. Left alone —
rule files need explicit permission (CLAUDE.md cardinal rule 5).
