# 02 — Dependencies, R2 upload, progress-bar stages

> Part of the [add-model playbook](README.md). Dep entry shape, baked LoRAs, the
> ≥20 GB hot-store gate, the R2 upload procedure (with the traps that bite), and
> the `progressStages.js` bar count.

## Dependencies — entry shape + R2 upload

Weight dep shape (see `dependencies.js` for live examples):
```js
'my-model-weight': {
    id: 'my-model-weight',
    name: 'Display Name',
    origin: 'HF-org/repo',                 // informational
    filename: 'diffusion_models/file.safetensors',   // relative to models root == R2 tail
    url: 'https://models.cubric.studio/vision/models/diffusion_models/file.safetensors',
    size: '9.31GB',                        // footprint.js reads this for the VRAM/RAM table
    sha256: null                           // fill via /mpic-compute-dep-hashes AFTER upload
}
```

**Reuse shared deps — do not re-host.** The 5B reuses `umt5_xxl_fp8_e4m3fn_scaled`
(same clip as the 14B, already on HF/R2) — just list the existing dep id. Only
host what's genuinely new.

**BAKED LoRAs are normal deps.** A LoRA the *workflow* loads (not a user slot) travels with
the model and is declared exactly like a weight: `filename: 'loras/<family>/<file>.safetensors'`,
a `size` string, `sha256`, and **no `type` field** — only `custom_nodes` and `json` carry `type`.
Precedent: LTX-2.3 ships three (`ltx23-lora-merged`, `-transition`, `-talkvid`), Wan-5B one
(`wan22-5b-turbo-lora`). Put them in a per-family lora subfolder (`loras/ltx-2.3/`,
`loras/wan-2.2-5b/`, `loras/krea-2/…`); R2 mirrors that path. Do NOT confuse these with the
user LoRA slots (`Input_Lora_1..N`), which are runtime files the user supplies and are never deps.

> **TRAP — `isWeightDep()` counts EVERY LoRA dep toward `totalWeightsGb()`.** That is correct
> when the workflow loads them all every run (LTX). It **over-counts** when the LoRAs are
> *mutually exclusive* — e.g. Krea2's 9 style LoRAs, where an `MpiMath` gate zeroes all but one
> and `MpiLoraModel.apply_lora` short-circuits at `strength_model == 0` (`loras.py:100`, returns
> before `load_lora_cached`). Only ONE is ever resident. Before special-casing `footprint.js`,
> **measure**: Krea2's over-count is 3.50 GB and changes **no row** of the table (the floor is
> pinned by `MIN_FLOOR = 8` and `ceil(spill/8)*8` absorbs the rest). Only act if a future
> model's idle LoRAs push `totalWeights` across a floor or row boundary.

**Custom-node dep + node-bump flow (MPI-222).** A model that needs a custom node
adds `type: 'custom_nodes'` — it's universal by type (no `installOnEngine` flag;
that's deleted). Pin its commit in `dev_configs/node_lock.json` (`source:
git-commit`). Set `installRequirements: true` iff the node ships a `requirements.txt`
— that flag ALSO decides the Pod split: `true` = baked into the image, `false` =
installed on the volume at connect. **To bump a node later:** edit its commit in
`node_lock.json` ONLY. The `.mpi_node_commit` drift ladder reinstalls it at the new
commit on both engines. **Rebuild the Pod image ONLY if the bumped node is baked**
(`installRequirements: true`) — a volume node (`false`) heals with no rebuild. A
baked-node bump also needs `POD_IMAGE_VERSION` bumped + an app restart; the app warns
"Pod image is stale" if it detects a baked node adrift.

**In-folder weights — `targetPath`.** A weight whose node hard-codes its scan dir
(RIFE reads only `custom_nodes/comfyui-frame-interpolation/ckpts/rife/`) can't live in
`mpi_models/`. Give its dep `engineAsset: true` + `targetPath:
'custom_nodes/<node>/<subdir>'` (bare `filename`, no type-subdir prefix) — it installs
inside the node folder, boot-installs + self-heals like any `engineAsset`, and is
image-resident on remote. See `.claude/rules/comfy_engine.md` § 2.5c.

> **🛑 PING THE USER — any single weight file ≥ 20 GB (Pod hot-store + disk budget, MPI-194).**
> RunPod **volume** pods keep weights on a 750 MB/s network volume; re-reading a huge file
> every gen-stage was the LTX slowdown. The fix (MPI-194) STAGES any single file **≥ 20 GB**
> from the volume onto the pod's container disk on first use (sticky, LRU-evicted). The
> container disk is **50 GB** and today fits exactly ONE ≥20GB model (LTX's 41GB transformer).
> So when you add a model whose dep list has a file **≥ 20 GB**, STOP and tell the user BEFORE
> shipping — two things need a call:
> 1. **Disk budget.** If the new ≥20GB hot-set does NOT fit in the free container-disk space
>    (e.g. a 60–70GB weight, or a 2nd big model that must coexist with LTX), `CONTAINER_DISK_GB`
>    in `routes/remotePodLifecycle.js` (create payload) must be bumped. ~$0.004/hr per +30GB.
> 2. **Confirm it's genuinely ≥20GB per FILE**, not per set. Reference (2026-07-05): LTX
>    transformer 41GB → hot-stored; LTX Gemma TE 9.45GB, every Wan file ≤13.55GB → NOT (under 20,
>    stay on the volume). Threshold constant = `HOT_STORE_MIN_GB = 20` (binary GB via
>    `sizeToGb`) in `js/services/commandExecutor.js`.
>
> Files **under 20 GB need no action** — they stay on the volume, no disk/cost impact. This gate
> is ONLY about the ≥20GB ones.

### R2 upload (cubric-models bucket)

Access via `C:\Users\Fabio\.secrets\rclone-r2.conf`, remote `cubric-r2:`, bucket
`cubric-models` → public host `https://models.cubric.studio/`. Path convention
(MPI-178 flat-mirror): R2 MIRRORS the local ComfyUI models dir — flat by type,
NOT by model family: `vision/models/<comfy-type>/<file>`. Since a dep's
`filename` IS the comfy-relative path, the invariant is
`url == https://models.cubric.studio/vision/models/<filename>`. Full capability
doc: `c:\AI\Mpi\MadPony-Identity\capabilities\cloudflare-r2\README.md` (boot via
`START-HERE.md`).

**TRAP — scoped-token 403 on multi-thread upload.** A plain `rclone copyto`
of a large file fails with `403 AccessDenied … CreateBucket`: rclone's
multi-thread chunk writer probes/creates the bucket, which the scoped R2 token
cannot do. **ALWAYS pass `--s3-no-check-bucket`** (documented in the R2 README).
Belt-and-suspenders for big files: also `--multi-thread-streams 0`.

**ALWAYS cap upload bandwidth: `--bwlimit 3M`.** Fabio's uplink is ~4 MB/s; an
uncapped upload saturates it and blocks his system. Cap at **3 MB/s** to leave
~1 MB/s of headroom. The cap is GLOBAL across concurrent transfers, so upload
multiple weights **sequentially in one job** (not parallel jobs — two jobs each
capped 3M = 6M total, defeating the cap). rclone resumes partials, so re-issuing
a capped command after an uncapped run loses no progress.

```bash
CONF="C:/Users/Fabio/.secrets/rclone-r2.conf"
rclone --config "$CONF" copyto "LOCAL/file.safetensors" \
  "cubric-r2:cubric-models/vision/models/<type>/file.safetensors" \
  --s3-no-check-bucket --multi-thread-streams 0 --bwlimit 3M -P
```

**TRAP — a wrapping shell `echo "DONE"` masks rclone's non-zero exit.** Do NOT
trust "exit 0" from a compound command. ALWAYS verify the upload landed:
```bash
rclone --config "$CONF" lsf -R "cubric-r2:cubric-models/vision/models/<type>/" --s3-no-check-bucket
# and a public HTTP HEAD (content-length must be non-empty + match the local size):
curl -sIL "https://models.cubric.studio/vision/models/<type>/file.safetensors" | grep -i content-length
```

**TRAP — every KILLED upload leaves an orphaned multipart session in R2.** Each
time you stop + restart an rclone upload (e.g. to re-apply `--bwlimit`), the
aborted run leaves an incomplete multipart upload behind. These are NOT the final
object (a completed upload is fine + reachable) but they consume bucket space and
show as "Ongoing Multipart Upload" rows in the Cloudflare dash — easy to mistake
for a failed upload. **After any kill-and-restart, clean them up** (R2 delete-class
op → needs user approval first). `rclone cleanup` has a default 24h age filter, so
a same-day orphan needs `-o max-age=0`:
```bash
# list pending (verify what you're about to abort):
rclone --config "$CONF" backend list-multipart-uploads cubric-r2:cubric-models
# abort ALL incomplete uploads regardless of age (final objects are untouched):
rclone --config "$CONF" backend cleanup cubric-r2:cubric-models -o max-age=0
```
Better: let an upload run to completion the first time (cap bandwidth UP FRONT so
you never need to kill + restart).

R2 deletes need explicit user approval (capability rule).

### Fill hashes

Run `/mpic-compute-dep-hashes` (→ `python scripts/computeDepHashes.py`) to replace every
`sha256: null` with the real hash. Do NOT leave nulls — the download manager needs them
for the end-user integrity check.

**Hashes do NOT wait for the R2 upload.** For R2-hosted deps (`models.cubric.studio` URL),
the script hashes the **LOCAL master copy** under `CUBRIC_MODELS_ROOT` (default
`g:/cubricmodels`), because R2's ETag is multipart-MD5 and useless for sha256. So the moment
the weights are in `G:\CubricModels\<type>\` — which is *before* any upload, since that is
where they start — you can fill every hash. Do it **in parallel** with (or before) the upload;
the upload is only what lets end-users download the file, it has nothing to do with computing
the hash. (HF-hosted deps hash from the remote ETag/stream instead — also no local upload.)

## Status-bar stage count (`progressStages.js`)

The status bar fills 0→100% **once per tqdm bar** and shows `Stage N/M`. `M` is the
number of times the bar restarts at 0 in a full run — it **cannot** be derived from
the workflow JSON, so every workflow needs an entry in `js/data/progressStages.js`
(`PROGRESS_STAGES`), keyed by workflow filename (the `_stage2` suffix is stripped by
the lookup).

`M` depends on the **run mode** (same file, different bar counts):
`single` (single-stage op, or a multi-stage op run straight to finish),
`preview` (multi-stage `previewOnly`), `stage2` (the `_stage2` file).

Bar counts vary per workflow — there is no universal number:
- LTX = `{ single: 3, preview: 2, stage2: 1 }` (load + sampler-A + sampler-B)
- Wan 14B / SDXL = `{ single: 2 }` (load bar + one sampler)
- Wan 5B (single-stage, one sampler pass) = `{ single: 1 }` (shows `1/1`)
- Upscalers/detailers = variable (per-tile passes; UltimateSDUpscale has its own)

Note the count is the number of tqdm bars that actually restart, NOT
samplers×something — Wan 5B's one pass is a single bar (`1/1`), even though other
models count a separate model-load bar. Never set a count higher than the real bar
restarts (a `2/1` is worse than no total).

**COUNT IT LIVE — do not guess.** Run the workflow in each applicable mode, watch
the ComfyUI terminal, count how many times a tqdm bar restarts at 0 (INCLUDING the
`0/1` model-load bar). No entry → the counter still ticks but shows no total
(`· 2`, not `· 2/3`). A wrong count shows a wrong denominator to the user.
