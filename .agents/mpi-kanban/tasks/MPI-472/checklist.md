# MPI-472 Checklist

## Done

- [x] `imageio-ffmpeg` added to `dev_configs/python_deps.in`, with the reason inline
      (it is NOT `imageio`, and it is OUR node's hard dep, not a transitive).
- [x] `python_deps.txt` recompiled with `node scripts/compile-node-deps.mjs`.
      Diff is two lines: `imageio-ffmpeg==0.6.0` + its `# via`. Nothing else moved, no
      torch/CUDA/opencv leak (the script's own guard re-asserts, and `npm test` re-checks).
- [x] **Root of the root**: `compile-node-deps.mjs --check` only fetched
      `installRequirements: true` nodes. That flag is the Pod's bake/volume split, not a
      claim about declared requirements — and since MPI-413 nothing installs a node's
      `requirements.txt`, so the curated file is the only installer. The gate now reads
      every locked node; a node with no requirements file 404s and declares nothing.
- [x] Sweep for the same class (brief step 3): all 7 `installRequirements: false` nodes
      fetched at their pinned commits — only VideoHelperSuite ships a `requirements.txt`
      at all (`opencv-python`, already covered by the unified contrib+headless build, and
      `imageio-ffmpeg`). MpiNodes' own imports audited: every third-party one is covered
      (`PIL`, `numpy`, `aiohttp`, `safetensors`, `torch`) except `soundfile`, which
      `video.py:76` imports inside a try and falls back to stdlib `wave`. No second hole.
- [x] Guard test: `tests/curated-python-deps.test.cjs` now asserts the pin, and its
      node-lock assertion no longer filters on `installRequirements`.
- [x] `docs/download-manager.md` § curated set — corrected the "adding an
      `installRequirements: true` node" instruction and recorded why the gate reads all.

## Not done

- [ ] A real video generation through the app. The binary resolves and the install path is
      proven (below), but nothing has rendered an mp4 since the fix.
