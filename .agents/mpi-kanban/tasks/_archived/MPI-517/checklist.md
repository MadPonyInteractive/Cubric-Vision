# Checklist

- [x] Confirm both required core PRs are in v0.31.0 (`git merge-base --is-ancestor`)
- [x] Hash the local bench-validated file, confirm it matches the HF object
- [x] Confirm Comfy-Org has no int8 video VAE (so Kijai is genuinely the only source)
- [x] Confirm no peer card claims the files this card owns
- [x] Upload the VAE to R2 `vision/models/vae/` and verify via lsf + HTTP HEAD
- [x] Add `vae-minimax-h3-video-int8` to assetDeps.js (R2 url + Kijai mirrorUrl + sha256)
- [x] Keep `vae-minimax-h3-video` (fp16) present and unreferenced for the orphan sweep
- [x] Repoint both ModelDefs in models.js (fl2va + ref2va)
- [x] Update the two runtime graphs (`comfy_workflows/minimax_h3_{fl2va,r2va}.json`)
- [x] Update the two generation templates (`scripts/workflow_generation/`)
- [x] Update the two raw LiteGraph sources (`raw/`, incl. their embedded `url`)
- [x] Grep for any remaining `minimax_h3_video_vae_fp16` reference outside the kept dep
      (found two the first sweep missed: `generate_h3.py` SHARED_WEIGHTS, and the dep
      table in `docs/models/h3/README.md` - both fixed)
- [x] Verify the registry still imports clean in bare node
- [x] Confirm every weight in both runtime graphs is backed by a dep
- [x] Run orphan-sweep / resolve-model-deps / shared-dep-uninstall / extra-model-folders
      (11 pass, 0 fail)
- [x] Engine reached v0.31.x (89ac23ae) - merge gate cleared, shipped at 66909bcf
- [x] One real H3 generation through the committed graph on core v0.31.0 - success in
      150s, video AND audio, 2677MB int8 VAE staged
- [x] One clean install of the dep from R2 - 3171670912 bytes, sha256 MATCH
