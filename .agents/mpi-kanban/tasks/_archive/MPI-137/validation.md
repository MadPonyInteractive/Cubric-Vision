# MPI-137 Validation

## Migration done 2026-06-27 (full-migrate-except-GC, user-authorized while AFK)

Target layout (user instruction): `cubric-builds/models/<...>` → `cubric-models/vision/<...>`
so other Cubric apps get their own top-level prefix under cubric-models.

### Prereqs (user, Cloudflare dashboard) — DONE + verified
- Bucket `cubric-models` created.
- Public host `https://models.cubric.studio/` bound (HEAD 200 verified).
- R2 token re-scoped (SAME token now covers cubric-builds + cubric-pod-runtime +
  cubric-models; no `rclone-r2.conf` change).

### Steps a–c — DONE + verified
- **(a) Server-side copy** `cubric-r2:cubric-builds/models/` →
  `cubric-r2:cubric-models/vision/` (R2→R2, no download/re-upload).
  - 12 objects / 63.028 GiB both sides (size match).
  - `rclone check` (hash compare): **0 differences, 12 matching files**.
  - Layout confirmed: `vision/ltx-2.3/<type>/<file>`.
- **(b) URL swap** — both consumers repointed `dl.cubric.studio/models/ltx-2.3/`
  → `models.cubric.studio/vision/ltx-2.3/`, kept in lockstep:
  - `js/data/modelConstants/dependencies.js` — 9 URLs (commit `de59499`, app RunPod branch).
  - `mpi-ci/cubric-vision-builder/install_models_ltx23.sh` — `R2=` base + comment
    (commit `ee9bdae`, mpi-ci main).
  - 0 stale `dl.cubric.studio/models` refs remain in either file.
- **(c) HEAD-verify new URLs** — all consumer paths HTTP 200 on the new host with
  matching Content-Length: transformer (42020150120), gemma (14454953106),
  text_projection, both VAEs, spatial upscaler, + all builder LoRAs
  (Reasoning_V1, Sulphur-2 V4, Singularity, Soft_Enhance).

### Step d (GC old copies) — NOT DONE (gated on user)
The 12 objects under `cubric-builds/models/ltx-2.3/` are STILL THERE (untouched).
Delete them only after:
1. The live app (restarted, on Pod image v0.10.2) confirms a model download pulls
   from `models.cubric.studio` cleanly.
2. Double-gated delete per the R2 capability doc (approval-gated).

Commits are NOT pushed (app RunPod branch; mpi-ci push gated). Push at the user's
go / next mpi-end.

### Remaining for done
- Live: restart app → trigger an LTX-2.3 model (re)download → confirm it hits the
  new host (logs / network) without error.
- Then GC old `cubric-builds/models/` copies (user-approved double-gate).
- Push both commits.
