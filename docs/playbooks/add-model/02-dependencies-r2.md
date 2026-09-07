# 02 — Dependencies, R2 upload, progress-bar stages

> Part of the [add-model playbook](README.md). Dep entry shape, baked LoRAs, the
> Pod hot-store (everything stages now — no size gate), the R2 upload procedure
> (with the traps that bite), and the `progressStages.js` bar count.

## Dependencies — entry shape + R2 upload

Weight dep shape (see `dependencies.js` for live examples):
```js
'my-model-weight': {
    id: 'my-model-weight',
    name: 'Display Name',
    origin: 'HF-org/repo',                 // NOT informational — see below
    filename: 'diffusion_models/file.safetensors',   // relative to models root == R2 tail
    url: 'https://models.cubric.studio/vision/models/diffusion_models/file.safetensors',
    size: '9.31GB',                        // GENERATED - do not type it, see 'Fill sizes'
    bytes: 9996468224,                     // GENERATED - the measured value of record
    sha256: null                           // fill via /mpic-compute-dep-hashes AFTER upload
}
```

**`origin` is LOAD-BEARING — record `<owner>/<repo>` plus the upstream filename, never
prose (MPI-429).** It is the input to the mirror sweep, which resolves every dep's second
download origin. R2 is one host, and one ISP filter on it takes the whole catalogue
(MPI-427 measured 44/44 dead). A dep whose `origin` says "HuggingFace" or nothing at all
cannot be placed: `qwen-lora-headswap` shipped with an empty `origin`, went unfound across
a 968-repo sweep, and had to be flagged `noMirror: true` — the ONE dep in the catalogue
with a single route — until Fabio named the repo by hand. The bytes were byte-identical
upstream the whole time.

After the upload, give the dep its second route (`docs/download-manager.md` § "The second
origin"): a byte-identical upstream copy gets an explicit `mirrorUrl`; anything we baked
ourselves gets re-hosted to `Mad-Pony-Interactive/cubric-studio` under the same
`vision/models/<comfy-type>/<file>` path and needs no per-dep field. **A dep with neither
must carry `noMirror: true`**, or the generic rewrite hands it a URL that 404s. The gate is
the hash: a mirror serving different bytes fails the SHA256 verify and the file is deleted,
so "same filename upstream" is not evidence — match `sha256` against the HF tree API's
`lfs.oid`, which IS the sha256.

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

> **🛑 MANDATORY PASS — `installRequirements: true`? Regenerate the curated pip set (MPI-413).**
> The local engine no longer runs any node's `requirements.txt`. It installs ONE curated
> file, `dev_configs/python_deps.txt`, in a single `--no-deps` pass. A new or bumped node
> whose requirements are not represented there ships with **missing** dependencies and
> fails to import — silently, on the user's machine. So whenever you add a node with
> `installRequirements: true`, or bump the commit of one:
>
> ```sh
> node scripts/compile-node-deps.mjs --check   # what does the node declare that we don't cover?
> # add anything it reports to dev_configs/python_deps.in (with a comment saying why)
> node scripts/compile-node-deps.mjs           # regenerate dev_configs/python_deps.txt
> node --test "tests/curated-python-deps.test.cjs"
> ```
>
> Commit **both** `python_deps.in` and `python_deps.txt`. `.in` is hand-curated and is
> where a decision lives (a drop, a pin, a PEP 508 marker); `.txt` is generated — never
> hand-edit it. The check fetches each node's requirements from GitHub at the exact
> `node_lock.json` commit, so it needs no engine and gives the same answer on any machine.
>
> Two things the curated file must never contain, both enforced by the test: the
> engine-owned torch stack (`torch`/`torchvision`/`torchaudio`/`triton`/`nvidia-*`/`cuda-*`
> — engine provisioning owns those, and a naive compile pulls them in as real transitives
> of diffusers/ultralytics/kornia), and more than one opencv distribution (they share the
> `cv2` namespace, so two means `import cv2` is decided by whichever pip ran last).
>
> `pipPins` and `installRequirementsCommand` on the dep entry are now **remote-only** —
> `routes/remoteModels.js` still sends them to the Pod wrapper, which has not converged
> onto the curated file yet. Keep them accurate for that path; they no longer affect a
> local install.

**In-folder weights — `targetPath`.** A weight whose node hard-codes its scan dir
(RIFE reads only `custom_nodes/comfyui-frame-interpolation/ckpts/rife/`) can't live in
`mpi_models/`. Give its dep `engineAsset: true` + `targetPath:
'custom_nodes/<node>/<subdir>'` (bare `filename`, no type-subdir prefix) — it installs
inside the node folder, boot-installs + self-heals like any `engineAsset`, and is
image-resident on remote. See `.claude/rules/comfy_engine.md` § 2.5c.

> **Pod hot-store — NO SIZE GATE ANY MORE. There is nothing to ping the user about.**
> RunPod **volume** pods keep weights on a 750 MB/s network volume; re-reading a huge file
> every gen-stage was the LTX slowdown, and MPI-194 first fixed it by staging only files
> ≥ 20 GB onto the pod's container disk. **That threshold is gone.** Everything now goes to
> the hot store on the fast disc: `HOT_STORE_MIN_GB = 0.1` in
> `js/services/commandExecutor.js`, with the Pod wrapper's floor dropped to match
> (`CUBRIC_HOT_STORE_MIN_BYTES: '100000000'`, `routes/remotePodLifecycle.js`). 0.1 GB stages
> transformer + clip + vae + the active LoRAs and skips only ~0-byte stubs. The driver was
> the "2 min per switch" saga: weights left on the volume random-read at a 10× fault
> (Krea2 switch measured 80 s from volume vs 9 s from disk, 2026-07-23).
>
> The only remaining per-file filter is **VRAM, not disk** (MPI-329): a single file LARGER
> than the pod's VRAM is skipped, because it cannot stay resident (aimdo streams it
> per-stage regardless of source, so staging buys nothing) and a copy that big would hog
> the wrapper's one hot-store lock and stall an interactive gen's preflight for minutes.
> So on a 24 GB card the LTX 42 GB transformer is NOT staged while its 11 GB TE is; a 96 GB
> card stages both.
>
> Disk budget is not a decision either: the container disk mirrors the network-volume size
> so the full staged set fits, and it is a per-create parameter (`containerDiskInGb`) — the
> fixed `CONTAINER_DISK_GB` constant this section used to cite no longer exists.
>
> **Adding a model with big files therefore needs no approval step for hot-store reasons.**
> (Corrected 2026-08-06 on MPI-452/H3: this section still described the 20 GB gate and a
> 50 GB container disk, and sent an agent to ask the user for a disk-budget call that has
> not been a real decision since the everything-to-hot-store change. `sizeToGb` reads the
> registry `size` STRING as binary GB, so that string is what any size comparison sees.)

### FIRST — may we host it at all? (licence gate, MPI-365)

R2 is the default and nearly every weight belongs there. But **uploading a weight
to R2 is redistribution**, and not every licence permits it. Check BEFORE you
upload — an upload is the act the licence governs, so "upload now, check later" is
already the violation.

The two shapes you will meet:

| licence | what to do |
|---|---|
| Apache-2.0 / MIT / permissive, or a CivitAI weight whose `allowCommercialUse` includes `Image` | R2 as normal (rest of this doc) |
| Forbids redistribution — **FLUX.1-dev is the live example** | **Link the ORIGIN repo. Never mirror it.** |

**The non-mirrored pattern.** Point `url` straight at the upstream host and let the
user pull from it — which is exactly what ComfyUI, Invoke and Fooocus do. We ship
software that references a weight; we do not hand over the bytes. The downloader is
host-agnostic (`new DownloaderHelper(this.depJob.url, …)`) and the on-disk name comes
from the dep's `filename`, not the URL, so a generically-named upstream file
(`diffusion_pytorch_model.safetensors`) still lands correctly. Nothing else changes.

Worked example — `controlnet-union-flux` in `assetDeps.js`:

```js
url: 'https://huggingface.co/Shakker-Labs/FLUX.1-dev-ControlNet-Union-Pro-2.0/resolve/main/diffusion_pytorch_model.safetensors',
```

**Do not assume a paid licence solves it.** BFL sells a self-serve commercial
licence for FLUX, and it *still* says you are "expressly prohibited from …
distributing … to third parties via any means". No price unblocks rehosting, and
FLUX.1-dev is not even in the self-serve tiers. Quantising does not launder it
either — a GGUF/fp8 conversion is a derivative and carries the same terms.

**Three consequences to accept when you link an origin:**

1. **No mirror failover.** `_mirrorUrlsFor` swaps the origin but PRESERVES the
   pathname, so it can only fail over between hosts with identical layouts. An
   upstream path has no R2 twin, so that dep is single-homed.
2. **The `sha256` is the only integrity guard.** R2 objects are ours; an upstream
   repo can be re-uploaded under us. Pin the hash — never ship `sha256: null` on a
   non-mirrored dep.
3. **Check the repo is not gated.** A gated HF repo needs a per-account token, which
   we cannot ship. If the weight you want is gated, find an ungated re-host with a
   compatible licence or pick a different weight.

Surface the licence to the user through the existing `credit` block (MPI-358) —
`MpiAbout` renders a Credits list from every dep that carries one, so the obligation
is discharged by the data rather than by someone remembering.

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

**TRAP — a COMMENT is not evidence that something is or is not hosted.** That same HEAD is
the answer months later, not only at upload time. On 2026-08-22 a ModelDef comment saying
Klein 9B's "four weights are not on R2" was repeated to the user as fact and then carried
forward into a freshly written comment — while all four had been up for some time, every
`Content-Length` byte-exact. Hosting state changes without the note beside it changing, so
a doc, a code comment or a handoff claiming EITHER direction is a prompt to check, never
the check. One `curl -sI` per URL settles it, and a byte-exact `Content-Length` also tells
a complete upload from a truncated one.

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

### Fill sizes

Run `python scripts/computeDepHashes.py --sizes`. It HEADs every dep, writes the measured
byte count as `bytes:`, and REGENERATES `size:` from it. **Never type either by hand.**

Every `size` string used to be hand-typed, and none had ever been measured. Measured
2026-08-08 (MPI-482): across all 107 file-backed deps the typed strings totalled 498.9 GB
against a true 478.2 GB - **4.1% OVER**, not under, because the common mistake is copying
HuggingFace's decimal-GB display into a field every consumer parses as 1024-based. The
worst single entry was `ltx23-spatial-upscaler` at 1.5GB declared against 0.93GB real.

`size` is what the consumers actually read - `footprint.js`, the smoke runner's volume
preflight, and `modelJob.totalBytes` via `_parseSizeToBytes` on BOTH engine paths - so
regenerating that string is what corrects them. `bytes` is the value of record.

The pass runs after upload for R2 deps (it reads R2's `Content-Length`; it falls back to a
local `stat` under `CUBRIC_MODELS_ROOT` if the HEAD fails). HF deps read `X-Linked-Size`
from the 302 - **not** that response's `Content-Length`, which is the ~1 KB redirect body.
Re-running writes nothing; a non-empty diff means a file on the host changed.

custom_nodes deps are skipped: their `url` is a `lockUrl()` git repo, not a file, so there
is no Content-Length to read. Those 14 `size` strings stay hand-written.

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
