# MPI-669 - checklist

Inputs, derived not guessed:
- `ver` = `0.22.0-dev` (current DEV tag is v0.21.0-dev)
- `wver` = `0.2.41` (wrapper last changed 2026-08-09, the image was built 2026-08-10, so unchanged)
- `ref`  = `v0.34.0` (the TAG from node_lock comfyui.core.tag - never the commit SHA)

- [ ] Copy `node_lock.json` + `python_deps.txt` into the mpi-ci build context (both, together).
- [ ] Commit + push mpi-ci - CI builds the PUSHED ref, not the local tree.
- [ ] Dispatch both legs (cu130 -> Docker Hub, cpu -> GHCR). Blank `only_profile`:
      a GPU-only push leaves CPU Pods pulling a tag that does not exist.
- [ ] Bump `POD_IMAGE_VERSION_DEV` + `POD_IMAGE_VERSION_CPU_DEV`. Stable pins stay put.
- [ ] 5a: `docker manifest inspect` both tags.
- [ ] 5b: cpu boot smoke on `CUBRIC_RUNTIME_CHANNEL=dev` (an unset channel smokes stable
      and reports the wrong wrapper version).
- [ ] USER: app restart, fresh Pod, H3 generation succeeds.
