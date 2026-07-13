# Media inputs — path→string contract (+ the latent survivor)

> Part of [workflow-authoring](README.md). **Canonical home** for the media-input
> rule. Applies to any Cubric workflow — models AND apps — that reads an image,
> mask, video, or audio input. It lives here so both the
> [add-model playbook](../playbooks/add-model/README.md) and [apps](../apps.md)
> point at ONE source.

## The rule (MPI-272)

**Media inputs are path-reading loader nodes. The app writes the full
project-folder PATH into the node's `string` widget; the node self-gates on an
empty string.** No placeholder file, no `input/` staging, no upload step for
image/mask/video/audio.

- image / mask → **`MpiLoadImageFromPath`** (a detailer mask is this class with a
  fixed `channel: 'mask'`; an image uses `channel: 'alpha'`/default)
- audio → **`MpiLoadAudio`**
- video → **`MpiLoadVideo`** (or `VHS_LoadVideoPath`)
- a plain **`MpiString`** feeding any `MpiLoad*` is also valid (fan-out)

Every media input is titled `Input_*` and takes its full file path in one
`string` widget. When the path is empty the node blocks its own branch
(`ExecutionBlocker`), so an unused optional slot (a t2v graph's
`Input_Start_Frame`, a no-audio gen's `Input_audio`) costs nothing — **there is
no baked filename to validate against, so nothing to reject.** This is what
killed the old placeholder trap.

### Path source law

Every injected path comes from the **PROJECT FOLDER** — gallery or
`.preview-assets`, resolved via `/project-file?path=` — never a raw filesystem
path. `_resolveMediaPath` (local) decodes `/project-file?path=` → local path;
`_uploadRemoteMedia` (Pod) ships the bytes and injects the Pod-absolute path.
Reuse-prompt resolves against the project store and fails hard otherwise;
`_assertMediaSourceExists` HEAD-probes the source and raises the
`input_asset_deleted` soft-error (WARNING toast, not the crash dialog) when a
reused card's source was deleted.

### Injection

Title-based: a param keyed like the node title (`Input_Image`, `Input_Mask`,
`Input_audio`, `Input_Start_Frame`, …) routes by **target node class** — any
path-reading loader → the resolve/upload branch → the resolved path is written
into the node's `string`. Case-insensitive on both sides. No `image`/`mask`
input exists on a path node, so the old upload-name branch (`_uploadImage`) is
gone.

Data-URL media (the auto-mask painted mask arrives as a `data:` URL, which a
path node's `os.path.isfile` cannot read) is first staged to a hashed file via
`POST /comfy/stage-media-data-url`, then flows the normal resolve→inject path.

## The ONE survivor — latents still stage into `input/`

`LoadLatent` has **no** path-string variant, so `.latent` files are the sole
exception and still stage the old way:

- `WORKFLOW_INPUT_DEFAULTS` (`routes/comfy.js`) lists **latents only**:
  `ComfyUI_00001_.latent`, `ltx_video_latent_00001_.latent`,
  `ltx_audio_latent_00001_.latent`.
- `_MEDIA_INPUT_CLASSES` (`commandExecutor.js`) = **`LoadLatent` only**;
  `_prepareWorkflowInputs` copies the latents into the engine `input/` before
  submit. Stage-2 (`_ms`) additionally injects the per-preview latents over the
  baked names (dual-latent, MPI-128).

**Do NOT "finish the cleanup" by removing latent staging.** There is no path
node for latents; killing this breaks every multi-stage LTX/Wan run. The
`Input_*_Latent` wiring, `stage-preview-latent`, and the three latent defaults
stay untouched.

## Guard

`scripts/validate-injection-rules.mjs` gates every converted API before bake
(title-prefix law / capture / seed convention / integrity). It STOPS and names
the offending node on a violation — it never auto-fixes. Run the raw→API sync
(`scripts/sync-raw-workflows.mjs`) after authoring or re-exporting a workflow.
