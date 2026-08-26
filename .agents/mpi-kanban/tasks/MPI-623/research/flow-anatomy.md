# Flow Anatomy — Investigation Findings

Sources: `docs/playbooks/add-flow/` (README + 01-05, ui/carousel-frame.md, 06-preview-image.md),
`js/data/flowsRegistry.js`, `js/data/commandRegistry.js`, `js/services/flowService.js`,
`js/data/progressStages.js`.

---

## Q1 — Exact file inventory

### 4 files for the op registration (in this order)

1. **`js/data/commandRegistry.js`** — add an entry in `commands` with `universal: true`, `mediaType`, `mediaInputs[]`, `progressLabel`, `promptRequired`.
2. **`js/data/modelConstants/universal_workflows.js`** — map op key → workflow filename.
3. **`js/core/operationRegistry.js`** — add `{ latestVersion: '1.0', appVersionIntroduced: '<APP_VERSION>' }`.
4. **`operation_registry.json`** (repo root) — hand-maintained superset; add the same entry plus `"universal": true`. NEVER regenerate from JS — regeneration strips `universal` flags.

### Additional files

5. **`js/data/flowsRegistry.js`** — add a `FlowDef` to the `FLOWS` array.
6. **`comfy_workflows/<Name>.json`** — the workflow graph (exported from LiteGraph, case-insensitive routing via `routes/workflowStatic.js`).
7. **`comfy_workflows/display/flow-<name>.webp`** — the 4/5 tile still (required to avoid reddening CI — a 404 on this fails the desktop suite).
8. **`comfy_workflows/display/flow-<name>.mp4`** — the wide hero loop (optional; if absent the hero shows the still).
9. **`tests/inject-params-titles.test.cjs`** — add a test case asserting every `Input_*`/`Output_*` title in the op's `mediaInputs` exists in the workflow JSON.
10. **`js/data/modelConstants/{loraDeps|assetDeps|nodesDeps}.js`** — only if the flow needs a dep no model already declares; filed by what the dep IS, not who requires it. `requiredDeps` on the `FlowDef` references these ids.
11. **`js/data/progressStages.js`** — add a `{ single: N }` entry for the workflow filename if progress bar totals matter (omitting it causes the stage counter to tick without a denominator, which is acceptable).

No new JS component, no CSS file, no preloadStyles entry — a Flow is data, not an organism.

---

## Q2 — FlowDef schema (from flowsRegistry.js:24-230 JSDoc)

```js
{
  id:             string,           // REQUIRED. Unique. Drives sidecar `flowId` + URL slug.
  title:          string,           // REQUIRED. Card + slide-over heading.
  preview:        string,           // REQUIRED. Filename under comfy_workflows/display/. 4/5 webp.
  video:          string,           // optional. Wide hero loop (.mp4) — same folder. Omit and hero uses preview.
  description:    string,           // REQUIRED. Slide-over copy; rendered as a single <p>.
  requiredModels: Array<            // REQUIRED. [] = always available (no-model flow).
    string |                        //   bare string = one-candidate slot (must be installed)
    { label: string, models: string[], loras?: boolean }
                                    //   object = choosable slot — user picks from models[]; first = recommended
  >,
  modelParams:    Object<string, Object>, // optional. Per-model injection params for choosable slots.
                                    //   Key = model id, value = injection params merged at dispatch.
                                    //   WITHOUT this a choosable slot changes only the availability badge.
  requiredDeps:   string[],         // optional. DEP ids (dependencies.js facade) no model needs.
  requiredPlugins: string[],        // optional. Plugin ids whose deps fold into this flow's dep set.
  operation:      string,           // REQUIRED. Universal-op key from commandRegistry.js.
  workflow:       string,           // REQUIRED. ComfyUI workflow filename from universal_workflows.js.
  fields:         FlowStepField[],  // optional. Run-slide controls rendered by MpiBaseFlow.
  mediaType:      'image'|'video'|'audio',  // REQUIRED. What the flow PRODUCES.
  inputSchema: {                    // REQUIRED (even if empty — no media -> omit `.media` key).
    media?: Array<{                 // One entry per slot GROUP.
      type:   'image'|'video'|'audio',
      mode:   'upto',               // only mode supported in v1
      max:    number,               // cap; roles.length must === max
      roles:  string[],             // role key per position; MUST match op's mediaInputs[].key
      labels: string[],             // optional, index-aligned with roles; slot copy shown in UI
    }>,
  },
  result: {                         // optional. How the result is shown.
    compare: string,                // role key for the BEFORE in a before/after comparison.
                                    // Only declare on flows that IMPROVE supplied media.
  },
  steps: FlowStep[],                // optional. Middle carousel steps (step 0 and last are implicit).
}
```

`FlowStepField` type vocabulary (all mount app Primitives — `js/utils/declaredFields.js`):

```js
{
  id:          string,          // REQUIRED. 'positive'/'negative' = top-level input.
                                //   'Input_*' prefix = injectionParams (graph node name).
  type:        'select'         // → MpiDropdown
             | 'radio'          // → MpiRadioGroup
             | 'button'         // → MpiButton (action button or toggle)
             | 'toggle'         // → MpiButton (icon mode, toggleable)
             | 'number'         // → MpiInput
             | 'slider'         // → MpiProgressBar
             | 'text',          // → MpiInput (rows > 1 = textarea)
  label:       string,          // optional
  options:     Array<{v, label, info?, note?}>,  // for select/radio
  columns:     number,          // for radio: N-column grid
  min:         number,          // for number/slider (ENFORCED — clamped before graph)
  max:         number,          // for number/slider
  step:        number,          // for number/slider
  mapTo:       [number, number],// for slider: map [0..1] UI range to [a..b] graph value
  rows:        number,          // for text: > 1 = textarea
  placeholder: string,          // for text
  icon:        string,          // for button/toggle: icons.js key
  default:     any,
  action:      'enhance',       // makes a button an ACTION — runs op, writes to `to` field
  op:          string,          // for action:'enhance': universal op key (must be outputKind:'text')
  from:        string,          // for action:'enhance': id of source field
  to:          string,          // for action:'enhance': id of destination field
  model:       string,          // for action:'enhance': optional model id
  note:        string,          // always-visible sub-caption (e.g. cost note under radio)
  info:        string,          // status-bar hover gloss
}
```

`FlowStep` schema:

```js
{
  kind:        string,    // REQUIRED. Step kind from MpiBaseFlow/stepKinds.js: 'box'|'paint'|'crop'|'preview'|'fields'
  role:        string,    // REQUIRED (except for kind:'fields'). Media role this step operates on.
  title:       string,    // REQUIRED. Shown above canvas.
  hint:        string,    // optional. Guidance below canvas.
  tickerLabel: string,    // optional. Short label in the step ticker.
  param:       string,    // optional. Bind gizmo value to injection param (e.g. 'box1' → 'Input_Box').
  ratio:       number,    // optional. Aspect lock for box gizmo (UI-only).
  overflow:    'allow',   // optional. Let the box extend past the image edge.
  mediaRole:   string,    // optional. Where a derived file lands if NOT the step's own role.
  fields:      FlowStepField[],  // optional. One row of controls between canvas and hint.
}
```

### Worked example — `flowLtxExtend` (current, shipping)

```js
// flowsRegistry.js:367-435
{
    id: 'ltx-extend',
    title: 'Extend Video',
    preview: 'flow-ltx-extend.webp',
    video: 'flow-ltx-extend.mp4',
    description: 'Continue a video past its last frame. Drop a clip, describe what happens next, and LTX 2.3 generates the new seconds — with matching audio — onto the end of it.',
    requiredModels: ['ltx-23-balanced'],
    operation: 'flowLtxExtend',
    workflow: 'flow_ltx_extend.json',
    mediaType: 'video',
    inputSchema: {
        media: [
            { type: 'video', mode: 'upto', max: 1, roles: ['video1'], labels: ['Video to extend'] },
        ],
    },
    steps: [
        {
            kind: 'preview', role: 'video1',
            tickerLabel: 'Describe',
            title: 'Describe what happens next',
            fields: [
                { id: 'positive', type: 'text', rows: 3, label: 'What happens next',
                  placeholder: 'Describe the new seconds — action, camera, sound…' },
                { id: 'negative', type: 'text', rows: 2, label: 'Avoid',
                  default: 'letterbox, black bars, ...' },
            ],
        },
    ],
    fields: [
        { id: 'Input_Duration', type: 'slider', label: 'Seconds to add', min: 1, max: 10, step: 1, default: 4 },
    ],
}
```

And its op in `commandRegistry.js`:

```js
flowLtxExtend: {
    label: 'Flow: Extend Video',
    progressLabel: 'Extending',
    mediaType: MEDIA_TYPE.VIDEO,
    requiresImages: 0,
    mediaInputs: [
        { key: 'video1', mediaType: MEDIA_TYPE.VIDEO, title: 'Input_Video', required: false },
    ],
    promptRequired: false,
    universal: true,
},
```

---

## Q3 — Media INPUT

### How a flow accepts media input

**Descriptor field**: `inputSchema.media[]` — each entry is a slot GROUP.

```js
inputSchema: {
  media: [
    { type: 'image', mode: 'upto', max: 2, roles: ['image1', 'image2'], labels: ['Original', 'Face Reference'] },
  ],
}
```

**User picks**: Drop zones rendered by `MpiBaseFlow` from `inputSchema.media`. Each slot accepts drop or click-to-browse.

**File reaches ComfyUI**: Files are placed in `Media/.preview-assets/<sha256><ext>` (content-addressed, not the gallery). At Run, `MpiBaseFlow._placePreviewAsset` → `POST /project-media/:id/place-preview-asset` → returns a `/project-file?path=…` URL. That URL is resolved to a filesystem path by `comfyController` → injected into the graph node's `.string` widget (path-reading nodes: `MpiLoadImageFromPath`, `MpiString` for video, `MpiLoadAudio`).

**Injection routing** (comfyController, `02-media-io.md:49-64`):
1. Field detection: `'video'/'audio'/'image' in node.inputs` tags kind — but path-reading nodes have `.string`, so field detection misses.
2. Title pattern: `/^input_video(_\d+)?$/i` → video, `/^input_audio(_\d+)?$/i` → audio, `/^input_image(_\d+)?$/i` → image. This is the primary path for flow slots.
3. Class route for images: `class_type === 'MpiLoadImageFromPath'` → flips kind to `imagepath` (path-resolve branch, not upload-name branch).

### Multiple media inputs

YES — fully supported. Declare multiple `roles` in a slot group (up to `max`), or multiple slot groups for different media types. Role assignment is positional. The op's `mediaInputs` must have a matching `key` per role.

Example (two images + audio): `inputSchema.media: [ { type:'image', max:2, roles:['image1','image2'] }, { type:'audio', max:1, roles:['audio1'] } ]`.

### Non-image inputs

- **Video**: `type: 'video'` in `inputSchema.media`, `MEDIA_TYPE.VIDEO` on the op slot. Graph uses `MpiString` → VHS `LoadVideoPath`, reads `.string`, self-gates via `MpiAnyChecker`/`MpiBlockIfEmpty`/`MpiIfElse`. SUPPORTED.
- **Audio**: `type: 'audio'` in `inputSchema.media`, `MEDIA_TYPE.AUDIO` (NOT VIDEO) on the op slot. Graph uses `MpiLoadAudio`, reads `.string`. SUPPORTED (shipping: Voice Changer MPI-607).
- **Folder / .ply / 3D / binary**: NOT supported. The `inputSchema.media` type is an enum of `'image'|'video'|'audio'` only (`02-media-io.md:19`). No injection routing exists for other file types. There is no `type: 'folder'` or `type: 'ply'` in the slot schema.

---

## Q4 — Media OUTPUT

### How a flow result becomes a gallery card

`submitFlowGeneration` calls `enqueueGeneration(config, callbacks, opts)` once. The job enters the shared generation queue. On `generation:complete`, the capture path reads every node title matching the prefix `Output_Image*` / `Output_video*` (prefix-match) or exactly `output_audio` / `output_preview` (exact). Each matching node's output becomes one gallery card.

One `"Generating…"` placeholder is allocated. Real 1..N cards land on completion. No flow-side `outputSchema` — outputs self-gate inside the workflow (empty path → `ExecutionBlocker` / `MpiBlockIfEmpty`).

Flow cards get `flowId` + `flowInputs` added to their `.meta` sidecar so Reuse can restore them.

### Supported output types end-to-end today

| `mediaType` on FlowDef / op | Save path | Gallery card | Shipped example |
|---|---|---|---|
| `'image'` | `Media/Images/…` | Image card | Head Swap, Draw It In, Character Sheet, Outpaint |
| `'video'` | `Media/Videos/…` | Video card (auto-mounts MpiVideoViewer + MpiVideoControlBar) | Extend Video, Add Foley, Upscale Video |
| `'audio'` | (SaveAudio node `Output_Audio`) | Audio card | Voice Changer (MPI-607) |

### Non-standard output (folder / binary asset)

**NOT supported.** There is no `outputKind` other than `'media'` (or `'text'` for text-only ops like `promptEnhance` / `imageDescribe`, which saves nothing and lands no gallery item). `commandRegistry.js:136` documents `outputKind: 'media'|'text'` as the only two options.

There is no folder-shaped output, no `.ply` output, no binary asset output path. The capture system (`generationService`) captures by ComfyUI node title pattern and writes image/video/audio files. Anything outside that envelope is NOT supported today and would require new capture + sidecar infrastructure.

---

## Q5 — `fields` / uiComponent

### How a flow declares user-facing controls

`FlowDef.fields` is the ONLY control surface for the run slide. A `FlowStep.fields` is the control row for that step. Both use the same `FlowStepField` vocabulary. Every declared field mounts an app Primitive (see `js/utils/declaredFields.js`, MPI-582):

| `type` | Component | Notes |
|---|---|---|
| `select` | `MpiDropdown` | `options: [{v, label, info?, note?}]` |
| `radio` | `MpiRadioGroup` | `options`, `columns` for N-column grid |
| `button` | `MpiButton` | Can carry `action: 'enhance'` |
| `toggle` | `MpiButton` (icon, toggleable) | `icon` from icons.js |
| `number` | `MpiInput` | `min`/`max`/`step` ENFORCED |
| `slider` | `MpiProgressBar` | `min`/`max`/`step`/`mapTo` |
| `text` | `MpiInput` | `rows > 1` = textarea |

**Value routing** (`01-descriptor-and-ops.md:95`):
- `id` NOT prefixed `Input_` → top-level run input (`positive`, `negative`, etc.)
- `id` prefixed `Input_` → `injectionParams` (addresses a graph node directly)

**One field, one value.** A field that means two graph params uses an MpiAnySwitch in the graph (see `ui/switch-bank-fields.md`).

### What `uiComponent` was and why it is gone

There was a per-flow `uiComponent` mapping in MpiBaseFlow that resolved a flow id to a bespoke JS Organism. The last such component was `MpiFlowHeadSwap.js`. This entire mechanism was deleted in MPI-572.

From `04-overlay-and-shell.md:18-25`:
> "The shell `flow:open` handler mounts `MpiBaseFlow` with the descriptor and nothing else — `MpiBaseFlow.mount(…, { flow })`. The name→blueprint map it used to resolve (`_flowComponents`) is gone, along with the last flow component, `MpiFlowHeadSwap`."

**Which flows used it**: Head Swap (the only one; it was the last). No shipped flow uses a per-flow component today.

**No flows use a custom uiComponent** — the concept is deleted. Every flow is pure data in `flowsRegistry.js`.

### Custom interactive control — how it is done

If a control cannot be expressed by the existing `type` vocabulary:

1. Add a new `type` value to `FlowStepField` (in `js/utils/declaredFields.js`, `_buildField`).
2. Add the corresponding Primitive component (CSS registered in `js/shell/preloadStyles.js`, props documented in `js/components/types.js`).
3. The new type is then available to every flow declaratively.

This is the only path. A Flow-owned Organism is prohibited — it cannot be carried by a third-party manifest (MPI-531). From `01-descriptor-and-ops.md:103`: "If a control cannot be expressed, the answer is a new PRIMITIVE plus a new field type — never a bare `<input>`, and never a Flow-owned Organism."

### Special: multi-value control (e.g. resolution = width + height)

Expressed in the GRAPH, not the FlowDef: one `MpiInt` selects `MpiAnySwitch` banks. Zero app code. The selector node title must be added to `tests/inject-params-titles.test.cjs`.

### Special: model-slot LoRA rack

`loras: true` on a `requiredModels` slot exposes the user's Model Settings LoRA rack for that phase, via a cogwheel beside the model selector in the slide-over. The graph carries `Input_Lora_Phase<N>_<i>` nodes; the rack fills them. No `type: 'loras'` field is needed — it is opt-in at the slot level.

---

## Q6 — Dependency declaration

### Models

`FlowDef.requiredModels`: an array of model IDs (strings) or choosable slot objects. The availability gate and Install button in the Flow Library drive each model's own dep download via `downloadService.start(id, deps)`. The model's deps come from `getModelDependencies(id)` — the dep files for that model.

### Flow-only extra weights / nodes (`requiredDeps`)

`FlowDef.requiredDeps: string[]` — dep IDs resolved from the `DEPS` facade in `js/data/modelConstants/dependencies.js`. These are deps no model requires. The dep entry itself lives in the file for its KIND:

| Kind | File |
|---|---|
| LoRAs | `js/data/modelConstants/loraDeps.js` |
| Weights/support files | `js/data/modelConstants/assetDeps.js` |
| Custom node packs | `js/data/modelConstants/nodesDeps.js` |

`js/data/modelConstants/dependencies.js` is the facade that merges all four into `DEPS`. Consumers import from the facade; filing by kind keeps the files manageable.

**GC protection**: Both uninstall guards in `routes/downloadManager.js` union in `_flowRequiredDepIds()` — a flow-only dep cannot be GC'd by a model uninstall. This is unconditional.

**A flow-only dep still needs `origin` + a second download origin** (or `noMirror: true`). See `add-model/02-dependencies-r2.md` § `origin` is LOAD-BEARING.

**Gating**: `flowAvailability()` returns `missingDeps` alongside `missing`, and both block the same badge + Run guard.

### Plugins

`FlowDef.requiredPlugins: string[]` — plugin IDs whose deps fold into this flow's dep set (MPI-580). No plugin install state of its own; their deps gate identically to `requiredDeps`.

---

## Q7 — Workflow JSON

### Where graphs live

`comfy_workflows/<Name>.json` — raw (LiteGraph) graphs go in `comfy_workflows/raw/<Name>.json` (bare name = a direct runtime file for flows, not a `_template` suffix which triggers the generator). The sync script converts raw → runtime:

```
comfy_workflows/raw/<Name>.json  →  (sync-raw-workflows.mjs)  →  comfy_workflows/<Name>.json
```

Filenames are resolved case-insensitively via `routes/workflowStatic.js`, so `Flow_Foo.json` and `flow_foo.json` both work. Case is preserved from export.

### Template vs runtime split

- **Raw** (`raw/`): LiteGraph format, human-editable. NEVER edit the runtime JSON directly.
- **Runtime** (`comfy_workflows/<Name>.json`): API format, generated by `sync-raw-workflows.mjs`. The file the app actually dispatches.
- `validate-injection-rules.mjs` is the gate: it checks that every `Input_*`/`Output_*` title referenced by the op exists in the runtime graph.

### How values are injected at dispatch (`js/services/workflowInjectors/`)

At dispatch, `comfyController.runWorkflow(config, workflow)` walks the graph and applies `_inject(node, key, value)` for each param.

**Standard injection** (`comfyController._inject`): matches param key against node widget names. Special spray list for `unet_name`, `ckpt_name`, etc.

**Custom injectors** declared on the op (`injector` field in commandRegistry):
- `'headSwap'` → `headSwapInjector` — handles `box1`/`box2` → MpiBox nodes (four widgets x/y/width/height; generic title injection would match but write nothing).

**Concrete example** — `ltxSigmas` injector (`js/services/workflowInjectors/ltxSigmasInjector.js`): the upscale flow's `Input_Denoise` slider (UI 0–1) is mapped via `mapTo: [0.50, 0.85]` to a start sigma, then `ltxSigmasInjector` derives the full 4-value sigma schedule from that one number. The graph has no `Input_Denoise` node; the injector synthesises the four `Input_Sigma_*` values from the mapped float.

**Title pattern injection**: `comfyController` uses `_meta.title` matching for `Input_*` nodes (case-insensitive). A node titled `Input_Video` gets the resolved video path written to its `.string` widget. The pattern is `/^input_(video|audio|image)(_\d+)?$/i`.

---

## Q8 — Dev gating

**Flag**: `APP_CONFIG.dev_mode` — evaluates to `true` when `BUILD_HASH === 'dev'` (i.e., a local dev run). Set at app boot.

**What it hides**: Both Flow Library entry points — the Landing nav "Flows" link AND the Gallery radial "Flows" entry — are hidden on a non-dev (staged) build automatically. From `04-overlay-and-shell.md:194`:
> "`APP_CONFIG.dev_mode = BUILD_HASH === 'dev'` hides BOTH entry points on a staged (non-dev) build automatically."

**Gate stays until ≥4 flows exist** — a user decision. Lifting it is an explicit call.

No per-flow gate. All flows are either all visible (dev) or all hidden (staged).

---

## Q9 — Preview assets

A Flow requires TWO media files, filed in `comfy_workflows/display/`:

### `preview` (REQUIRED)

- **Purpose**: Flow Library tile + slide-over thumb + hero poster/fallback.
- **Dimensions**: 896 × 1120 (or 512 × 640). Aspect ratio 4:5.
- **Format**: `.webp`, quality ≈ 90, ≤ 250 KB.
- **Naming**: `flow-<kebab-id>.webp`. Named for the flow, never reused across flows.
- **Placement code**: `MpiTileSheet.css:56` (tile, 4/5 cover), `MpiModelManager.css:300` (slide-over), `MpiBaseFlow.js _buildInputsSlide` (hero poster).
- **Design rules**: Must read at ~220 px wide (grid min). No load-bearing content in outer 10% of edges. Compose with contrast to spare (tiles render desaturated until hover). One subject, one idea, readable in a glance.

### `video` (OPTIONAL but strongly recommended)

- **Purpose**: Wide autoplaying hero loop on the flow's first slide.
- **Dimensions**: 1280 × 800 (8:5) or 1280 × 720 (16:9).
- **Format**: `.mp4`, H.264, ≤ 2 MB, 4–8 s, seamless loop. SILENT (autoplay requires `muted`).
- **Naming**: `flow-<kebab-id>.mp4`. Sits beside the still.
- **NOT a video tile**: `MpiFlowLibrary.js:104` passes `media: 'image'` for tiles — the flow grid never autoplays. The `video` field only affects the hero on the inputs slide.
- **Omit**: The hero falls back to the still. This is the correct state while art is being made — omit the field, never write a name ahead of the file.

### What happens if they are missing

**`preview` missing → CI turns red.** From `flowsRegistry.js:633-640` (scribble-to-object comment): a `preview` declared before the file existed caused `tests/desktop/flows-tab-ring.spec.js` to fail (`consoleErrors` must be empty in three places) and held master's CI red for a day and eight pushes. `preview` is optional syntactically (both consumers guard it), but declaring it before the file is written is the trap. **Correct: omit the field, add it only after the file is committed.**

**`video` missing**: Hero shows the still. No CI impact. Safe to omit permanently.

---

## Q10 — Long-running jobs / progress / multi-dispatch

### Progress stages

`js/data/progressStages.js` maps workflow filename → `{ single: N, preview: N, stage2: N }`.

- `single` = total tqdm bars for a normal (non-staged) run.
- `preview` = bars for a stage-1 preview-only run (multi-stage model ops only, NOT applicable to flows).
- `stage2` = bars for a stage-2 continuation run (same, model ops only).
- `postTile` = bars after UltimateSDUpscale tiles (Krea2 upscaler only).

The status bar shows "Stage N/M" as bars tick. Without an entry, it shows "· N" (no denominator). Omitting an entry is acceptable and is the current state for most flow workflows (none of the flow graphs have entries).

To add one: watch the ComfyUI terminal during a real run, count how many times a tqdm bar restarts at 0 (including the `0/1` model-load bar). Key = workflow filename WITHOUT `_stage2` suffix.

### Can a Flow express a multi-stage job with several sequential ComfyUI dispatches?

**NO — a Flow is strictly one graph dispatch.**

`submitFlowGeneration` (flowService.js:126) calls `enqueueGeneration` exactly ONCE. There is no mechanism for a FlowDef to declare a sequence of ops. The `preview`/`stage2` modes exist for the multi-stage MODEL ops (LTX, MiniMax H3, WAN i2v) — they are NOT accessible to Flows.

The `previewOnly` and `isStage2` flags in the generation config are injected by the model-side Continue/Stage-2 infrastructure, which Flows bypass entirely (a flow runs `model: { id: null }`; the "RUN CLEAN" doctrine means no `getNextGeneration`, no branching-continue).

**The nearest existing thing to multi-pass in a Flow**: the graph itself can contain sequential passes (e.g., Character Sheet: Krea2 generates the sheet, then a Klein edit pass removes the head — all in ONE graph dispatch, ONE ComfyUI job). This is the correct pattern: sequential passes in one graph, not sequential `enqueueGeneration` calls.

**If a Flow genuinely needed two sequential dispatches**, there is no framework support today. It would require new orchestration in `flowService.js` (a chain: first dispatch → `onComplete` callback → second dispatch) plus UI to show an intermediate state. This does not exist and would be non-trivial new infrastructure.

### Progress label for a Flow

`commandRegistry.js` `progressLabel` field on the op is the present-participle verb shown in the status bar (e.g., `'Rendering the drawing'`, `'Drawing the sheet'`). It falls back to `'Generating'` when absent. This is all that needs to be declared for progress text.

---

## Summary of key constraints

| Question | Answer |
|---|---|
| Files for one flow (minimum) | 6: commandRegistry + universal_workflows + operationRegistry + operation_registry.json + flowsRegistry + workflow JSON. Plus preview webp (add only after file exists). Plus test case. |
| Non-image/video/audio output | NOT supported. Only `'image'`, `'video'`, `'audio'` mediaTypes, captured by title-prefix pattern. No folder or binary output. |
| Custom interactive control | Only via new field `type` + new Primitive. No per-Flow JS Organism (deleted MPI-572, prohibited). |
| Multi-dispatch | NOT supported. One Flow = one `enqueueGeneration`. Sequential passes must be inside ONE graph. |
| Dev gate | `APP_CONFIG.dev_mode` — automatic, covers all flows at once. |
