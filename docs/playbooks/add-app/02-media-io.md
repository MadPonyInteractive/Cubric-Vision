# 02 — Media I/O

Polymorphic input slots, path-reading nodes, injection routing, self-gating outputs,
multi-output capture, and the two audio traps. Read [README](README.md) first.

## Polymorphic media slots

`inputSchema.media` is an array of slot GROUPS; `MpiBaseApp` renders each generically:

```js
inputSchema: {
  media: [
    { type: 'image', mode: 'upto', max: 2, roles: ['image1', 'image2'] },
    { type: 'audio', mode: 'upto', max: 1, roles: ['audio1'] },
  ],
}
```

- `type`: `'image' | 'video' | 'audio'`.
- `mode: 'upto'` = dynamic-until-cap (an empty drop zone "Drop up to N…" appears until `max`
  slots are filled; `'fixed'` is treated as `'upto'` for now).
- `max` = cap.
- `roles` (length === max) = the role key assigned to the i-th filled item BY POSITION (models
  reference by index; roles re-assign on removal). **Each `role` MUST match a `key` in the op's
  `mediaInputs`** so the injector maps the item to its `Input_*` node.
- No `media` key → no upload UI (media-free app). Media is NEVER a Run blocker in v1, but an app
  that declares slots and gets none (and no prompt) is empty-run-guarded (`ui:warning`, abort).
- Each drop zone accepts DROP or click-to-browse (multi-select); over-cap files are dropped +
  `clientLogger.warn`.

## Path-reading input nodes (the core contract)

**Every app-touched input node reads a filesystem PATH**, not a ComfyUI input-dir upload name:

| media | node class | reads path from | self-gates |
|---|---|---|---|
| image | `MpiLoadImageFromPath` | `.string` | empty path → `ExecutionBlocker` → its `Output_Image*` branch never runs |
| video | `MpiString` → VHS `LoadVideoPath` | `.string` | empty → `MpiAnyChecker`/`MpiBlockIfEmpty`/`MpiIfElse` block the branch |
| audio | `MpiLoadAudioFromPath` (MPI-259) | `.string` | empty → self-gates like the others |

This is why the app injects a PATH, and why input nodes are NOT stock `LoadImage`/`LoadAudio`
(those read an input-dir filename and can't self-gate). The old stock `LoadAudio` was the last
holdout — it wanted an input-dir name, so the app injected a path it couldn't use and the output
kept the source's own audio (MPI-259). The path-reading audio node fixed it: consistent
architecture across all three media types.

## Injection routing (`comfyController` media-kind sweep)

`comfyController` (in `runWorkflow`) classifies each media param's KIND, then routes it:

1. **Field detection** — `'video'/'audio'/'image' in node.inputs` tags the kind. A path-reading
   node has `.string`, NOT `.audio`/`.video`, so field-detection MISSES it. Backstop:
2. **Title pattern** — `/^input_video(_\d+)?$/i → video`, `/^input_audio(_\d+)?$/i → audio`,
   `/^input_image(_\d+)?$/i → image`. This catches every lowercase/numbered app slot
   (`Input_video`, `Input_video_2`, `Input_audio`, `Input_Image_2`).
3. **Class route (images)** — an image param whose target node `class_type ===
   'MpiLoadImageFromPath'` flips kind `image → imagepath` so it takes the path-resolve branch,
   not the input-dir upload-name branch. Legacy `LoadImage` keeps `image` (upload-name). Class-based,
   so migrating a workflow to the new node auto-flips it with no injector change.
4. **Resolve** — `video`/`audio`/`imagepath` kinds go through `_resolveMediaPath` locally, or
   `_uploadRemoteMedia` → Pod-absolute path on remote. `_inject` then writes the resolved path
   into the node's widget (key priority includes `string`, so MpiString/MpiLoad*FromPath → `.string`).

So a new path-reading audio node titled `Input_audio` needs **zero injector change** — the title
pattern tags it `'audio'`, the path resolves, `_inject` writes `.string`.

## The two audio traps (MPI-259)

The audio path never reaching `Input_audio` was TWO bugs in the op wiring, both app-side (the
browser run was fine — an app-vs-browser divergence is ALWAYS an app-side injection/routing bug):

1. **Slot mediaType.** The `audio1` slot MUST be `mediaType: 'audio'` (the string), NOT
   `MEDIA_TYPE.VIDEO`. `MEDIA_TYPE` only enumerates image + video. The app's audio media item
   carries `mediaType: 'audio'`, and `_buildParams` role-first match requires
   `item.mediaType === slot.mediaType`. With `VIDEO` on the slot the match failed silently →
   `Input_audio` never set → output kept the source's own audio.
2. **`filterMediaInputsForModel`.** This helper DROPS every `'audio'` slot unless the model has
   `capabilities.audio === true` (the LTX-vs-WAN gate). A no-model App passes `model: null`, so
   its audio slot was filtered out entirely. Fixed: **`if (!model) return slots`** — a
   universal/App op's declared slots ARE the contract; the capability gate only exists to drop
   LTX's audio slot on WAN.

## Self-gating outputs

Apps do **no app-side output gating**. Every media type self-gates INSIDE the workflow, so the
capture path keeps only what actually ran (`executed` events) — a gated-off output emits nothing
→ no card. No `outputSchema.when` is needed. The gating MpiNodes:

| node | gates | how |
|---|---|---|
| `MpiLoadImageFromPath` | image | empty/missing path → `ExecutionBlocker` → its `Output_Image*` branch never runs |
| `MpiLoadAudioFromPath` | audio | empty path → self-gates its branch |
| `MpiBlockIfEmpty` | any | passes a value through, blocks downstream if empty |
| `MpiAnyChecker` | any | passes value + a `has_value` boolean to drive `MpiIfElse` |
| `MpiHasAudio` | audio | boolean: does the loaded media carry an audio track |
| `MpiIfElse` | video (+ any) | boolean branch — no `Input_video_2` path → `Output_video_2` never runs |

## Multi-output capture

A multi-output app captures every `Output_<Type>*` node's result as its own gallery card.
The capture filter is **prefix-match**: `Output_Image` / `Output_Image_2` / `Output_video_2` all
qualify; `output_preview` (multi-stage) and `output_audio` (side-channel) stay EXACT.

**The kept count is only known at completion** — outputs self-gate on input presence, so the app
declares NO fixed N. `submitAppGeneration` allocates exactly ONE "Generating…" placeholder (the
engine emits one live latent at a time, so one in-progress card is all that's honest), and the
capture-what-ran path lands the real 1..N cards on `generation:complete`. The in-app result pane
shows ALL that landed. **One mediaType per app** — mixed image+video in a single run is NOT
supported (do not do the per-URL-mediaType refactor).
