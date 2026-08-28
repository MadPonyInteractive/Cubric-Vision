# 02 — Media I/O

Polymorphic input slots, path-reading nodes, injection routing, self-gating outputs,
multi-output capture, and the two audio traps. Read [README](README.md) first.

## Polymorphic media slots

`inputSchema.media` is an array of slot GROUPS; `MpiBaseFlow` renders each generically:

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
- No `media` key → no upload UI (media-free flow). Media is NEVER a Run blocker in v1, but a flow
  that declares slots and gets none (and no prompt) is empty-run-guarded (`ui:warning`, abort).
- Each drop zone accepts DROP or click-to-browse (multi-select); over-cap files are dropped +
  `clientLogger.warn`.

## Path-reading input nodes (the core contract)

**Every flow-touched input node reads a filesystem PATH**, not a ComfyUI input-dir upload name:

| media | node class | reads path from | self-gates |
|---|---|---|---|
| image | `MpiLoadImageFromPath` | `.string` | empty path → `ExecutionBlocker` → its `Output_Image*` branch never runs |
| video | `MpiString` → VHS `LoadVideoPath` | `.string` | empty → `MpiAnyChecker`/`MpiBlockIfEmpty`/`MpiIfElse` block the branch |
| audio | `MpiLoadAudio` (MPI-259) | `.string` | empty → self-gates like the others (`block_if_empty`) |

This is why the flow injects a PATH, and why input nodes are NOT stock `LoadImage`/`LoadAudio`
(those read an input-dir filename and can't self-gate). The old stock `LoadAudio` was the last
holdout — it wanted an input-dir name, so the flow injected a path it couldn't use and the output
kept the source's own audio (MPI-259). The path-reading audio node fixed it: consistent
architecture across all three media types.

## 🔴 Self-gating is not the same as HANDLED

The table above says an empty slot "self-gates", which is true and reads as reassuring.
It is not. A self-gated branch produces **no output**, and ComfyUI reports the run as
**success** — so the user presses Generate, waits, and gets nothing, with no error
anywhere. Twelve slots across eight flows shipped in exactly that state (2026-08-28).

**What turns a self-gate into a refusal is `required` on the OP's media slot**, in
`js/data/commandRegistry.js`:

```js
mediaInputs: [
    { key: 'audio1', mediaType: MEDIA_TYPE.AUDIO, title: 'Input_Audio', required: true },
],
```

`_findMissingMediaSlot` (`js/services/generationService.js`) reads it at **enqueue** and
again at **dispatch**, and raises "Add an image/video/audio file before generating".
Flows reach it like everything else: `MpiBaseFlow._run` → `submitFlowGeneration` →
`enqueueGeneration`.

- **An ABSENT `required` already means required.** `required: false` is never accidental —
  it is always a deliberate opt-out of that guard.
- **The check is per media TYPE, not per role** (MPI-466). One attached image satisfies
  every image slot, so it catches "no media of this type at all" and never a deliberate
  one-of-two run.
- **A later step may DERIVE the media**, after the slot the user sees. Scribble's slot is
  labelled "Drawing (optional)" and its `paint` step fills `image1` at run time, before
  enqueue — so the blank-canvas route passes the guard. Check `flow.steps[].into` before
  concluding a slot is unfillable.
- **`upto` is the only media mode there is**, so a slot can never RENDER as required. The
  declaration is the only signal; nothing in the UI shows it.

**The law, and `tests/flow-required-media.test.cjs` enforces it repo-wide:** a slot whose
graph blocks when empty must not declare `required: false`. It is asserted as that PAIR
rather than "everything is required", because DramaBox is the legitimate counter-example:
its voice slot really is optional, which is how its prompt-only arm builds a speaker from
the words alone.

🔴 **And DramaBox is exempt through LAZINESS, not through the flag** — stated wrongly
once already and caught by a claim audit. `MpiLoadAudio#11` carries `block_if_empty: true`
like every other loader. `Input_Audio` is an `MpiString` whose only consumer is
`MpiAnyChecker#14`, and that checker's boolean drives `MpiIfElse#15` between two samplers,
one taking a `voice_ref` and one not. `MpiIfElse` declares its arms **lazy**, so an empty
slot takes the prompt-only arm and the loader is never requested — the flag is real and
simply unreachable. **So "does this slot block?" is not answerable from the flag alone.**
Route an injected path through a presence check when you want it optional; wire it into a
loader directly when you do not.

## Injection routing (`comfyController` media-kind sweep)

`comfyController` (in `runWorkflow`) classifies each media param's KIND, then routes it:

1. **Field detection** — `'video'/'audio'/'image' in node.inputs` tags the kind. A path-reading
   node has `.string`, NOT `.audio`/`.video`, so field-detection MISSES it. Backstop:
2. **Title pattern** — `/^input_video(_\d+)?$/i → video`, `/^input_audio(_\d+)?$/i → audio`,
   `/^input_image(_\d+)?$/i → image`. This catches every lowercase/numbered flow slot
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

The audio path never reaching `Input_audio` was TWO bugs in the op wiring, both flow-side (the
browser run was fine — a flow-vs-browser divergence is ALWAYS a flow-side injection/routing bug):

1. **Slot mediaType.** The `audio1` slot MUST be audio, NOT `MEDIA_TYPE.VIDEO`. Write it
   `MEDIA_TYPE.AUDIO` — the enum gained that member in MPI-573, so the bare string `'audio'`
   this section used to insist on is now just the same value spelled the long way. The flow's
   audio media item carries `mediaType: 'audio'`, and `_buildParams` role-first match requires
   `item.mediaType === slot.mediaType`. With `VIDEO` on the slot the match failed silently →
   `Input_audio` never set → output kept the source's own audio.
2. **`filterMediaInputsForModel`.** This helper DROPS every `'audio'` slot unless the model has
   `capabilities.audio === true` (the LTX-vs-WAN gate). A no-model Flow passes `model: null`, so
   its audio slot was filtered out entirely. Fixed: **`if (!model) return slots`** — a
   universal/Flow op's declared slots ARE the contract; the capability gate only exists to drop
   LTX's audio slot on WAN.

## Self-gating inputs — the step gate (MPI-644)

The frame refuses to leave **step 0** while a required media slot is empty, and says
*"You need to add inputs to this flow."* Step 0 is where every slot lives, so an empty
required one means the run is already doomed; before this the refusal landed at Generate,
several slides later, with nothing said in between.

- **The question asked is `findMissingMediaSlot`** (`js/services/generationService.js`) —
  the same predicate the enqueue and dispatch guards use, imported rather than copied.
  So the gate fires on exactly the ops those two would refuse, and never on one they
  would accept. It matches per media **TYPE**, not per role (MPI-466): one image
  satisfies every image slot. Do not tighten that here.
- **`required: false` opts a slot out**, of the gate and of both run-time guards
  together. DramaBox's voice is the shipped case — its prompt-only arm builds a speaker
  from the words, so the flow must reach Generate with nothing attached.
- **A step that DERIVES its media exempts the whole flow.** `composite: true` on a step
  means the kind builds the picture rather than editing one (`stepValueToMedia`), and it
  runs at dispatch — *after* the boundary being guarded. Scribble is the case: its slot
  reads "Drawing (optional)" and a blank canvas plus one stroke fills `image1`, even
  though `flowScribble` declares that slot required. `_stepDerivesOwnMedia` reads the
  flag; a gate without it refuses the flow's whole point.

So a new flow whose middle step CREATES its input must declare `composite` — otherwise
its users are stopped at step 0 before they can draw the thing that would satisfy the
slot. Pinned by `tests/desktop/flow-step-gate.spec.js` (both directions) and
`tests/flow-required-media.test.cjs` (the `required`/`block_if_empty` pair).

## Self-gating outputs

Flows do **no flow-side output gating**. Every media type self-gates INSIDE the workflow, so the
capture path keeps only what actually ran (`executed` events) — a gated-off output emits nothing
→ no card. No `outputSchema.when` is needed. The gating MpiNodes:

| node | gates | how |
|---|---|---|
| `MpiLoadImageFromPath` | image | empty/missing path → `ExecutionBlocker` → its `Output_Image*` branch never runs |
| `MpiLoadAudio` | audio | empty path → self-gates its branch (`block_if_empty`, default on) |
| `MpiBlockIfEmpty` | any | passes a value through, blocks downstream if empty |
| `MpiAnyChecker` | any | passes value + a `has_value` boolean to drive `MpiIfElse` |
| `MpiHasAudio` | audio | boolean: does the loaded media carry an audio track |
| `MpiIfElse` | video (+ any) | boolean branch — no `Input_video_2` path → `Output_video_2` never runs |

## Multi-output capture

> The base `Output_*` capture naming law (MPI-252) is **[shared] — canonical in
> [../common/output-capture-titles.md](../common/output-capture-titles.md).** The flow
> divergence — PREFIX match for numbered siblings — is below.

A multi-output flow captures every `Output_<Type>*` node's result as its own gallery card.
The capture filter is **prefix-match**: `Output_Image` / `Output_Image_2` / `Output_video_2` all
qualify; `output_preview` (multi-stage) and `output_audio` (side-channel) stay EXACT.

**The kept count is only known at completion** — outputs self-gate on input presence, so the flow
declares NO fixed N. `submitFlowGeneration` allocates exactly ONE "Generating…" placeholder (the
engine emits one live latent at a time, so one in-progress card is all that's honest), and the
capture-what-ran path lands the real 1..N cards on `generation:complete`. The in-app result pane
shows ALL that landed. **One mediaType per flow** — mixed image+video in a single run is NOT
supported (do not do the per-URL-mediaType refactor).
