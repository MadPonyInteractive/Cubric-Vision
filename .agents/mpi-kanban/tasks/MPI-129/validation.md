# MPI-129 Validation — HF → R2 migration

## DONE (2026-06-29)
Migration of all 9 MPI-owned re-hosts off Hugging Face onto Cloudflare R2.

### Uploaded (local G:/CubricModels → cubric-r2:cubric-models/vision, --s3-no-check-bucket)
| File | R2 path | bytes (R2 = local) |
|---|---|---|
| Wan_22_t2v_High  | vision/wan-2.2/diffusion_models/ | 14548461368 ✅ |
| Wan_22_t2v_Low   | vision/wan-2.2/diffusion_models/ | 14548461376 ✅ |
| Wan_22_i2v_High  | vision/wan-2.2/diffusion_models/ | 14306129210 ✅ |
| Wan_22_i2v_Low   | vision/wan-2.2/diffusion_models/ | 14306126698 ✅ |
| SDXL_Realistic   | vision/sdxl/checkpoints/ | 7105352784 ✅ |
| SDXL_NSFW        | vision/sdxl/checkpoints/ | 6938045122 ✅ |
| ILL_Anime        | vision/sdxl/checkpoints/ | 6938045570 ✅ |
| ILL_Anime_Beauty | vision/sdxl/checkpoints/ | 6938045170 ✅ |
| PONY_Mix         | vision/sdxl/checkpoints/ | 7105352832 ✅ |

### Verification
- All 9 size-match local byte-for-byte (rclone lsl). Byte-identical copy → sha256 in
  dependencies.js unchanged & valid. (R2 can't serve sha256 via API — size proof per
  STATUS convention; do NOT trust `rclone hashsum`/curl on R2.)
- dependencies.js: 9 url lines swapped HF → https://models.cubric.studio/vision/...
  Committed **f595390** (lint warn-only passed, explicit pathspec).
- Remaining HF URLs in dependencies.js = upstream only (Comfy-Org, uwg, Kim2091,
  Bingsu, Gourieff) — NOT MPI re-hosts, correctly out of scope.
- mpi-ci builder install script already R2 (models.cubric.studio/vision/ltx-2.3);
  no Wan/checkpoint fetch from it — builder pulls these from app dep flow, not script.

### Gotcha learned
`--s3-no-check-bucket` REQUIRED for R2 upload. Without it rclone multi-thread copy
calls CreateBucket (token lacks that perm, bucket already exists) → 403 AccessDenied,
0 bytes transferred, loop reports exit 0 (false success). Flag skips the probe.

### Cleanup confirmed safe
`cubric-builds/models/` (old release-night LTX location) = stale dup, fully mirrored
in cubric-models/vision/ltx-2.3/ (12/12 files). No app code / no builder script
references it. User cleared to delete. (`cubric-builds/vision/` = live Pro release
artifacts — KEEP.)

## DEFERRED — public-launch release flow (NOT this migration; gated on user)
These belong to the first public GitHub release (~2 wks), run via release skills:
- [ ] Land R2 dep URLs on **master** (currently on RunPod branch; promote via
      mpi-merge-branches when dev branch ships).
- [ ] Confirm public/master build has no live slow-stream watchdog (verified
      master never had it — add 02ef2c0 + disable a780e0a are both RunPod-only;
      net no-op. Just CONFIRM at build, don't re-introduce).
- [ ] Bump master 1.0.1 → 1.0.2 for public launch (mpi-version-bump / mpi-release-public).

## NOT pushed
Commit f595390 local on RunPod branch. Push = user-gated.
