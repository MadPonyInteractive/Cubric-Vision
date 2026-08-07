# Media inputs — path→string contract (+ the latent survivor)

> Part of [workflow-authoring](README.md). **Canonical home** for the media-input
> rule. Applies to any Cubric workflow — models AND apps — that reads an image,
> mask, video, or audio input. It lives here so both the
> [add-model playbook](../playbooks/add-model/README.md) and [Flows](../flows.md)
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

### "No placeholder" is about the FILE — the RAW widget slot still needs one

The rule above kills the placeholder *image*. It does **not** free you from the
positional `widgets_values` slot in the raw LiteGraph export. When the `string`
(path) widget is converted to an **input socket** (dragged, so the node carries
`link`), the converter still consumes its slot: `workflow-to-api.mjs`
`emitWidgets` walks required-input order and does `vi += 1` for a widget-typed
input **even when it's linked** — the link wins for the value, but the slot is
eaten.

So a socket-linked load node's raw `widgets_values` must keep a **placeholder for
the linked widget**:

| node | linked `string` | NOT |
|---|---|---|
| `MpiLoadVideo` / `MpiLoadAudio` | `["", true]` (placeholder, `block_if_empty`) | `[true]` |
| `MpiLoadImageFromPath` | `["", "alpha", true]` (string, channel, `block_if_empty`) | `["alpha", true]` |

With `[true]` the converter reads `true` as the string slot, then `block_if_empty`
sits at `vi=1 ≥ len` → `break` → the key is **dropped**, and ComfyUI answers
`Prompt outputs failed validation` (400). **A node's default does NOT auto-fill a
missing *required* key in an API prompt**, and `block_if_empty` is required on all
three `MpiLoad*` classes — an absent key fails validation regardless of the
node's default value.

**How to apply:** count positional widgets from the FULL required order and keep a
placeholder for each up to the last real widget. Then verify the generated runtime
JSON actually has `block_if_empty` in that node's `inputs` after convert. This
surfaced during the mass `block_if_empty` sync — every workflow using these nodes
needed a re-sync.

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

## Nothing stages any more — the last survivor died with `LoadLatent` (MPI-466)

**This section used to say the opposite, and the reversal is the point.** It read
*"Do NOT 'finish the cleanup' by removing latent staging — there is no path node
for latents; killing this breaks every multi-stage LTX/Wan run."* That was true
while `LoadLatent` was the only way to read a latent, because ComfyUI validates a
Load* node's baked filename even when its output is gated off, so three dummy
`.latent` files had to be copied into the engine `input/` before every `_ms`
submit.

`MpiStageLatents` **is** the path node that did not exist. It reads its stage-1
file from a `load_path` widget the app writes per run, checks the engine `input/`
first and falls back to `<output>/latents/`. WAN, H3 and finally LTX all migrated
onto it, so no shipped graph carries a `LoadLatent` at all — and staging a file
that nothing loads is just three dead bytes in the build.

Deleted, therefore, and do not reinstate:

- `WORKFLOW_INPUT_DEFAULTS` and `POST /comfy/prepare-workflow-inputs` (`routes/comfy.js`)
- `_MEDIA_INPUT_CLASSES` + `_prepareWorkflowInputs` (`commandExecutor.js`)
- `comfy_workflows/input/{ComfyUI_00001_,ltx_video_latent_00001_,ltx_audio_latent_00001_}.latent`

Pinned by `tests/optional-media-placeholder.test.cjs`, which now fails in BOTH
directions: a bare Load* node reappearing in an optional graph, and
`WORKFLOW_INPUT_DEFAULTS` reappearing in `routes/comfy.js`.

`stage-preview-latent` is a DIFFERENT mechanism and stays — it writes the real
per-run stage-1 latent into the engine `input/` under a per-run name, which is
exactly what `MpiStageLatents.load_path` then reads.

## MUTE severs a link. BYPASS passes it through. They are NOT interchangeable (MPI-466)

A **muted** node (LiteGraph `mode: 2`) is removed and its output links go with it.
A **bypassed** node (`mode: 4`) is removed but its links are re-routed through by
matching type. The converter reproduces both exactly as the ComfyUI frontend does,
so a mute left on a live path ships a graph with **missing required inputs**.

What that looks like, because it does not look like an error: LTX shipped with
`Stage 2 Video/Audio Latent` and `Model` reroutes muted, so `VAEDecode.samples`,
`LTXVAudioVAEDecode.samples` and both `CFGGuider.model` arrived unlinked. ComfyUI
reported `Output will be ignored` for EVERY output node and the prompt "executed"
in **0.07 seconds** with no video and no failure. The app logged
`Generation completed but no output returned`.

Mute is for a node you want *gone*, on a branch nothing downstream needs. If you
want a node skipped but the signal to keep flowing, bypass it. If the path is
live, neither — leave it enabled.

The conversion gate below now catches this class before bake.

## `block_if_empty: false` on any loader whose PRESENCE drives routing (MPI-466)

`MpiLoadImageFromPath` / `MpiLoadAudio` raise an `ExecutionBlocker` when the path
is empty and `block_if_empty: true`. That blocker propagates downstream and kills
the branch — which is correct for a genuinely required input, and **wrong for a
media-derived route**, where the empty slot IS the signal.

In a presence-routed graph the routing is done by `MpiAnyChecker` → `has_value` →
the lazy `MpiIfElse` gates. The loader must not block, or it pre-empts the gate
before it can choose. All three end-frame graphs now agree:

| graph | `start` | `end` |
|---|---|---|
| `ltx_i2v_t2v*.json` | `false` | `false` |
| `minimax_h3_fl2va.json` | `false` | `false` |
| `wan22_i2v.json` | `false` | `false` |

H3 and WAN shipped with `start.block_if_empty: true` and were re-exported. Nobody
had hit it because `startFrame` was `required: true`, so an empty start never
reached those graphs — it only surfaced when the last-frame-only route needed one.

## Guard

`scripts/validate-injection-rules.mjs` gates every converted API before bake
(title-prefix law / capture / seed convention / integrity). It STOPS and names
the offending node on a violation — it never auto-fixes. Run the raw→API sync
(`scripts/sync-raw-workflows.mjs`) after authoring or re-exporting a workflow.
