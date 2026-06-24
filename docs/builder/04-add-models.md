# 04 — Add model weights

## Write an `install_models_<wf>.sh`

THIS folder (`cubric-vision-builder/`) is the canonical source — edit scripts here
(stale copies at `D:/WORK/workflows/` — ignore). For a new workflow: copy
`install_models_ltx23.sh` → `install_models_<name>.sh`, swap the weight list.
Extract the list from the workflow JSON — grep structured `{name, url, directory}`
blocks + the note-node "Model Links" text.

Conventions (also in parent README §"Writing model-install scripts"):
- `cd /opt/ComfyUI`; weights → `models/<type>/` (`diffusion_models/ loras/ vae/
  clip/ text_encoders/ upscale_models/ …`). The dirs are symlinked to the active
  data root, so writes land on the right disk automatically.
- Download: `aria2c -c -x16 -s16 <url> -d models/<type> -o <name>` (`-c` resumes,
  `-x16 -s16` saturate the NIC).
- **Tokens from Pod ENV** `$HF_TOKEN` / `$CIVITAI_TOKEN` — never hardcode. HF gated:
  `--header="Authorization: Bearer $HF_TOKEN"`. Civitai: `?token=$CIVITAI_TOKEN`.
- cu130/py3.13 deps: `cupy-cuda13x` (prebuilt) + `imageio-ffmpeg` (VHS).
- If you bake a new script as an image default, add it to the Dockerfile COPY block.

## ⚠️ Source reliability — Civitai blocks Pods, HF Xet throttles (2026-06-23)

Two sources that LOOK fine but fail from a RunPod datacenter — both push you to R2:

- **Civitai 403s from Pod IPs.** A `civitai.com/api/download/...?token=$CIVITAI_TOKEN`
  pull on a Pod returns **HTTP 403** (`errorCode=22 ... status=403`) — Civitai blocks
  datacenter IP ranges even with a valid token. Confirmed on Singularity (`3001143`)
  + Soft Enhance (`2849706`). **Civitai LoRAs MUST be staged to R2** (or another host)
  and pulled from there; the Pod cannot hit Civitai directly.
- **HF Xet CDN throttles the Pod downlink.** The LTX-2.3 **39GB bf16 diffusion** from
  HuggingFace sawtoothed **0–38 MiB/s for over an HOUR** from US-MO-1 (repeated 0B
  stalls) instead of the ~6min a clean datacenter pull should take. aria2c `-c` does
  resume through the stalls, so it eventually completes — but it's slow + flaky.
  **Stage big base weights to R2 too** (Cloudflare edge → fast from any datacenter,
  free egress). Push from the POD (`rclone` Pod→R2 = datacenter uplink → edge, fast)
  once it's down the slow way ONCE, then every future Pod pulls it from R2 in ~1-2min.
- Note: a concurrent **local** Jupyter/rclone upload (your home uplink) does NOT
  directly slow the Pod's own pulls (different machines/pipes), but heavy Jupyter
  refreshing + a saturated home uplink can make Pod progress *look* worse than it is.
  The 0B stalls are server-side CDN throttling, not your bandwidth.

## ⚠️ Upload cost rule — R2, not Jupyter, for re-used files

**Jupyter drag-drop uploads over YOUR uplink, not the Pod's downlink.** A 1.5GB
LoRA over a slow home connection ≈ **1 hour**, and the Pod bills the whole time.
The Pod's fat datacenter pipe is wasted because the bytes start on your local disk.

- **Drag-drop ONLY for files with no clean public URL** (e.g. the VBVR LoRAs — HF
  mirror filenames don't match local, wrong-weight risk).
- **R2 is the LAST RESORT, not a default mirror.** Use it ONLY for a weight that has
  **no usable public URL** (deleted/gated repo, or a mirror whose filenames don't
  match local → wrong-weight risk). If a clean HF/Civitai URL exists, `aria2c` it
  straight to the Pod — don't stage. The point of R2 is "we have nowhere online to
  get this from", not "let's cache everything".

### R2 — when there's no online source

- Bucket **`cubric-builds`**, public host **`https://dl.cubric.studio/`**, free
  egress (Pod pulls cost $0). rclone binary + config: see memory `R2 upload
  procedure` (config at `~/.secrets/rclone-r2.conf` — NEVER copy keys into a repo).
- ⚠️ **R2 has limited space — GARBAGE-COLLECT.** It's cost-limited (10GB/mo free,
  then ~$0.015/GB-mo) and shares the bucket with release builds. So:
  - Stage a weight ONLY when it has no public URL (above).
  - **Delete it from R2 once it's shipped from a permanent home** (mirrored to our
    own HF repo, or baked/merged into the shipped model). The R2 copy is a transient
    bridge, not the home of record.
  - Don't leave per-session model junk in the bucket. Deletion is **approval-gated**
    (MadPony-Identity R2 doc) — confirm with the user before removing anything.
- **Why R2 beats Jupyter drag-drop even though both use your uplink:** rclone
  resumes + verifies + reports a real %, and DOESN'T silently stall like the Jupyter
  browser upload (which died twice on a 805MB LoRA, 2026-06-23). The R2 copy then
  pulls back to ANY future Pod at datacenter speed — so the uplink tax is paid once,
  not per Pod. Proven 2026-06-23: VBVR-Sulphur-I2V-V4 (805MB) uploaded in **~2m52s**
  @4.5MB/s, public HEAD verified, Pod pulled it in seconds.
  > **CURRENTLY ON R2 (transient — GC when it gets a permanent home):**
  > `models/ltx-2.3/loras/LTX2.3_reasoning_Sulphur-2_I2V_V4.safetensors` (805MB).
  > Delete once VBVR is mirrored to our HF repo or merged into the shipped model.
- **Path (keep OUT of the `vision/v…` release tree):**
  `cubric-builds/models/<model-id>/<type>/<file>` →
  `https://dl.cubric.studio/models/<model-id>/<type>/<file>`.
- Stage / fetch / GC:
  ```bash
  # stage (only if no online source):
  $rclone --config $config copyto "LOCAL/file.safetensors" \
    "cubric-r2:cubric-builds/models/<id>/<type>/file.safetensors" --s3-no-check-bucket --progress
  # Pod fetch (in install_models_<wf>.sh):
  aria2c -c -x16 -s16 "https://dl.cubric.studio/models/<id>/<type>/file.safetensors" -d models/<type> -o file.safetensors
  # GC after it has a permanent home (approval-gated):
  $rclone --config $config delete "cubric-r2:cubric-builds/models/<id>/<type>/file.safetensors" --s3-no-check-bucket
  ```

## Verify the download

`aria2c` exits non-zero on HTTP error (the scripts use `--max-tries=5`). After a
run, sanity-check sizes match the expected weights — a prior session caught HF
mirror filenames that did NOT match local (crossed Wan i2v/t2v weights). Trust the
filename+size, not the repo name.
