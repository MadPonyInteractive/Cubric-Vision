# 01 — Descriptor & Ops

The two registrations every flow needs: the **op** (in 4 files) and the **descriptor**
(`FlowDef` in `flowsRegistry.js`). Read [README](README.md) first.

## The op — register in 4 files

> The two-mirror registry skeleton (`operationRegistry.js` + `operation_registry.json`,
> `appVersionIntroduced`, no-version-bump) is **[shared] — canonical in
> [../common/op-registration.md](../common/op-registration.md).** Below is the flow-side
> shape: `universal: true` is mandatory, and `operation_registry.json` is a hand-maintained
> superset that must NEVER be regenerated.

A flow op is a **universal op** (a second producer into the generation queue, exactly like
the History block's universal tool ops). Register it in all four, in this order:

> The `flowVideoStitch` op used below is an **illustrative example, not a shipping op** — it
> was one of the three test Flows ripped in MPI-332. It is kept here because it is the only
> shape that exercises the full media-input matrix (image + video + the audio string) in one
> block. For a real, shipping example see `flowLtxFoley` in `js/data/commandRegistry.js`.

1. **`js/data/commandRegistry.js`** — the op definition:
   ```js
   flowVideoStitch: {
     label: 'Flow: Video Stitch',
     progressLabel: 'Stitching',
     mediaType: MEDIA_TYPE.VIDEO,        // OUTPUT type
     requiresImages: 0,                  // media never a hard requirement in v1
     mediaInputs: [
       { key: 'video1', mediaType: MEDIA_TYPE.VIDEO, title: 'Input_video',   required: false },
       { key: 'video2', mediaType: MEDIA_TYPE.VIDEO, title: 'Input_video_2', required: false },
       { key: 'audio1', mediaType: 'audio',          title: 'Input_audio',   required: false },
     ],
     promptRequired: false,              // pure media utility — no prompt
     universal: true,                    // MANDATORY for flow ops
   },
   ```
   - `title` on each `mediaInputs` slot MUST match the workflow node's `_meta.title`
     (the injector matches case-insensitively but **silently skips a title with no node** —
     the shared silent-skip trap, [../common/inject-titles-guard.md](../common/inject-titles-guard.md);
     guard in [05](05-verify.md)).
   - **`mediaType` per slot: `MEDIA_TYPE.IMAGE` / `MEDIA_TYPE.VIDEO` / the string `'audio'`.**
     `MEDIA_TYPE` only enumerates image + video — audio is the bare string. Getting this
     wrong is the MPI-259 audio bug: see [02](02-media-io.md).
   - **Slot count = capacity (MPI-337).** Declare one `mediaInputs` slot per item the op
     accepts — the drop/eviction cap (`_maxMediaForOperation`) reads that count, and for
     non-flow ops so does the availability gate (`getAvailableCommands`:
     `requires* ≤ count ≤ #slots` + `requiresMask`). `universal: true` flow ops are
     EXCLUDED from `getAvailableCommands`, so they never appear on the model op
     radial/dropdown — the flow surface owns its own media I/O.
2. **`js/data/modelConstants/universal_workflows.js`** — op → workflow filename:
   ```js
   flowVideoStitch: { workflow: 'flow_video_test.json' },
   ```
   The filename is resolved case-insensitively (a middleware in `routes/workflowStatic.js`
   resolves `/comfy_workflows/<name>` regardless of case), so `App_Foo.json` vs `app_foo.json`
   both work. Keep whatever case the user exported.
3. **`js/core/operationRegistry.js`** — version stamp:
   ```js
   flowVideoStitch: { latestVersion: '1.0', appVersionIntroduced: '1.2.0' },
   ```
4. **`operation_registry.json`** — the hand-maintained superset:
   ```json
   "flowVideoStitch": { "latestVersion": "1.0", "appVersionIntroduced": "1.2.0", "universal": true }
   ```
   **NEVER regenerate this file from JS** — regeneration strips the `universal` flags.

## The descriptor — `FlowDef` in `flowsRegistry.js`

`flowsRegistry.js` is the single source of truth for flows (read-only over
`state.s_installedModelIds` — flows have NO disk-presence concept of their own; do NOT
cargo-cult install-sync machinery from modelRegistry).

```js
{
  id,             // unique
  title,          // card + slide-over
  preview,        // filename under comfy_workflows/display/ — its OWN 4/5 webp, see 06
  description,    // slide-over copy
  requiredModels, // MODEL SLOTS (NOT dep ids) — [] for a no-model flow; a { label, models }
                  //   entry is a slot the user picks a model for (see below)
  modelParams,    // optional — per-model injection params for a choosable slot (see below)
  operation,      // the universal-op key from commandRegistry.js
  workflow,       // the workflow filename from universal_workflows.js
  fields,         // declared run-slide controls (MPI-531) — the SAME `fields` a step declares
  mediaType,      // 'image' | 'video' | 'audio' — the OUTPUT type (always required).
                  // Also picks the Flow Library section the flow lands under (MPI-634).
  inputSchema,    // { positive?: 'string', media?: [ ...slot groups ] }
}
```

**A flow declares `fields` instead of authoring its own JS Organism — that BESPOKE surface was
removed in MPI-572.** A per-Flow JS component is a thing a third-party Flow can never have, so
every knob written that way was debt the community-package work would have had to port.
`fields` is the same vocabulary a step's `fields` uses, rendered by the frame on the run slide;
an id prefixed `Input_` routes into `injectionParams` instead of the top level.

**This does NOT mean a Flow has no components — it has nothing BUT components.** Every declared
field mounts an app Primitive (`js/utils/declaredFields.js`): `select` is an MpiDropdown,
`slider` an MpiProgressBar, `text` and `number` an MpiInput, `toggle` an MpiButton (icon mode,
`toggleable`), `radio` an MpiRadioGroup, `button` an MpiButton. The declaration chooses WHICH
component; it has never
replaced one. **If a control cannot be expressed, the answer is a new PRIMITIVE plus a new field
type — never a bare `<input>`, and never a Flow-owned Organism.** A Flow is more flexible in that
it can carry all sorts of different components, but they are all components
(`.claude/rules/components.md` § Every UI element is a component). Full contract + the
id-routing table:
[ui/carousel-frame.md](ui/carousel-frame.md) § `fields` is the ONE control surface. Worked
examples: [existing-flows/ltx-extend.md](existing-flows/ltx-extend.md) (run slide),
[existing-flows/head-swap.md](existing-flows/head-swap.md) (a `radio` + two step `param` binds).

**One field emits ONE value into ONE param** (`mapTo` is a linear range map, not a fan-out).
A control that means two or more graph values — a resolution is width AND height — is
expressed in the GRAPH, by one `MpiInt` selecting `MpiAnySwitch` banks:
[ui/switch-bank-fields.md](ui/switch-bank-fields.md). Zero app code, and the selector title
must be pinned in `tests/inject-params-titles.test.cjs` or a lost switch silently pins every
run to `any_1`.

**A graph carrying `Input_Lora_Phase<N>_1..6` does NOT need a LoRA control.** Put `loras: true`
on the model SLOT that runs that phase and the flow reuses the app's own Model Settings panel —
the six-slot rack, strengths, bypass, drop zones, all already built — opened by a cogwheel
beside that slot's dropdown. One rack per phase, so a flow choosing a model per phase fills both
(MPI-608). The catch is that opening it is only half: a flow dispatches with `model.id: null`, so
without the `loraPhases` chain the rack saves fine and injects nothing.
`settingsModel` / `{ action: 'settings' }` are RETIRED — [ui/lora-rack.md](ui/lora-rack.md).

**A step may also bind its gizmo to a graph param**: `{ kind:'box', role:'image1', param:'box1' }`.
The flow declares WHICH role feeds WHICH node — that stays flow knowledge — while the shape the
graph wants belongs to the step KIND (`stepValueToParam`, `stepKinds.js`). That pair replaced the
one job only JS could do, and is what makes a FlowDef fully expressible as a manifest.

### No-model flow (Video Stitch)

```js
{
  id: 'video-stitch',
  title: 'Video Stitch',
  preview: 'flow-video-stitch.webp',   // its own 4/5 webp — [06](06-preview-image.md)
  requiredModels: [],             // always available, no install gate
  operation: 'flowVideoStitch',
  workflow: 'flow_video_test.json',
  mediaType: 'video',
  inputSchema: {
    media: [
      { type: 'video', mode: 'upto', max: 2, roles: ['video1', 'video2'] },
      { type: 'audio', mode: 'upto', max: 1, roles: ['audio1'] },
    ],
  },
  // no fields — MpiBaseFlow renders the media slots straight from inputSchema.media
}
```

- **`requiredModels: []`** → `flowAvailability` returns `{available:true, missing:[]}` always.
  No install gate, badge is Ready, Open enabled (in a project).
- **No `fields`** → `MpiBaseFlow` renders just the media slots + Run. Valid path: a pure media
  utility has nothing to ask.
- `inputSchema.media[].roles` MUST match the op's `mediaInputs` keys (`video1`/`video2`/`audio1`).

### Multi-model flow (SDXL 4K)

`requiredModels: ['sdxl-nsfw', 'nvidia-pid']` — availability = ALL installed; the Flow Library
Install button drives each missing model's OWN dep download (`getModelDependencies(id)` →
`downloadService.start(id, deps)`). Flows declare **models, never deps** (zero dep duplication).
See [04](04-overlay-and-shell.md) for the install-progress UI.

### Model slots — the flow declares a ROLE, the user picks which model fills it (MPI-590/599)

An entry in `requiredModels` written as `{ label, models }` is a **choosable slot** — one role
the graph plays a model in, with interchangeable candidates for it. The flow runs on whichever
one resolves, and an `MpiDropdown` per slot in the slide-over lets the user pick, whether or not
anything is installed yet. Character Sheet, whose two phases are two different models
(MPI-610): `[{ label: 'Render model', models: ['krea2','krea2-nsfw'], loras: true },
{ label: 'Blend model', models: ['klein-4b','klein-9b'], loras: true }]`.

A flow may declare several, and they resolve independently — an image model for one phase of the
graph, an edit model for another. `models[0]` is the recommended candidate; declaration order is
preference order.

**Never read `flow.requiredModels` directly** (a slot arrives as an object), and never ship a
choosable slot without the `modelParams` that carries the pick into the graph — a picker that
changes only the badge is the failure mode this was built against.

→ **[any-of-models.md](any-of-models.md)** — the resolver helpers, `modelParams`, why the picker
offers uninstalled candidates, and why `modelFamily` is the wrong field.

### A GATED model in `requiredModels` brings obligations the Flow Library does not carry yet

Some model licences oblige us to bind the end user before the weights arrive, and to show an
attribution wherever the model is presented. `js/data/modelConstants/licences.js` keys those by
model id (MiniMax H3 is the first). **Check it before you put a model in `requiredModels`.**

Half of this is already free, half is not:

- **Free — the acceptance gate.** It sits in `downloadService.start()`, which every install
  path funnels through, so a flow's Install button shows `MpiLicenceGate` with no flow-side
  work. Receipts are keyed by LICENCE id, so a user who already accepted while installing
  the model directly is not re-prompted by the flow.
- **NOT free — the standing licence row.** `MpiModelManager`'s detail drawer renders the
  licence name, the required `poweredBy` attribution, and the licence / authorization /
  report-misuse links ([MpiModelManager.js](../../../js/components/Compounds/LandingPages/MpiModelManager/MpiModelManager.js), `#detail-licence-row`).
  **`MpiFlowLibrary`'s drawer has no equivalent** — it reuses the same `.mpi-detail__*`
  classes, so the markup ports directly, but nobody has needed it yet.

So: a flow built on a gated model must add that row to its own slide-over. Attribution
(H3 §III.3.a/§IV.2) is owed on the surface where the model is *presented*, and for a flow
user that surface is the Flow Library drawer — they may never open the Model Library at all.
The licence copy itself is already bundled under `licences/<id>/` and reachable through the
same `licenceUrl`, so only the render site is missing. See [docs/models/h3/README.md](../../models/h3/README.md) § Licence.

### Flow-only extra weights — `requiredDeps` (MPI-304, SHIPPED)

> **Read this before adding a flow-specific weight to a MODEL's dependency list.** Doing that
> taxes every user of that model — and is never necessary.

Some flows need a weight no model requires — a baked LoRA, an extra detector, a custom node.
`requiredModels` resolves MODEL ids only, so declare those as `requiredDeps` — dep ids
resolved from `DEPS`, alongside `requiredModels`:

```js
{
  requiredModels: ['qwen-edit'],           // shared model
  requiredDeps:   ['qwen-lora-headswap'],  // flow-only extras
}
```

Works for LoRAs, support weights AND custom nodes (`nodesDeps` is already merged into `DEPS`).
The scaling case it exists for: Head Swap needs a 1.2GB LoRA on top of `qwen-edit`; folding
that into the model would push it onto every Qwen user, and a flow taking 30 style LoRAs would
tax all users ~15GB.

**A flow-only dep is still a dep — it needs `origin` and a second download origin.** Same
rule as a model weight, same reason: record `<owner>/<repo>` + the upstream filename, then
give it a `mirrorUrl` (byte-identical upstream) or re-host it, else `noMirror: true`. Head
Swap's own LoRA is the cautionary tale — it shipped with an empty `origin` and became the
only dep in the catalogue with a single route. Full rule:
[add-model/02-dependencies-r2.md](../add-model/02-dependencies-r2.md) § `origin` is
LOAD-BEARING.

**The entry still lives in the file for its KIND** — `loraDeps.js` for a LoRA, `assetDeps.js`
for a weight, `nodesDeps.js` for a node pack. Deps are filed by *what they are*, never by who
requires them; ownership is a list of ids, not a file. When a kind-file gets fat, split it
further BY KIND (`loraDeps.js` → `loras/krea2.js`, `loras/qwen.js`) — the
[dependencies.js](../../../js/data/modelConstants/dependencies.js) facade absorbs that with
zero consumer changes.

**How it behaves** (all of this is automatic — a new flow only writes the id list):

- **Gating is identical to a missing model.** `flowAvailability()` returns `missingDeps`
  alongside `missing`, and `available` accounts for both. The tile badge reads "Get models",
  Open stays blocked, and `submitFlowGeneration`'s pre-flight aborts — so a missing flow dep can
  never reach ComfyUI as a "lora not found" mid-run.
- **One extra row** in the slide-over's required list ("Extra dependencies (1.2GB)"),
  aggregated rather than itemised — the deps are an implementation detail of the flow, not a
  thing the user picked.
- **Install/cancel/progress** run under the key `flow:<id>` (`flowDepKey()`), one job for the
  flow's whole dep set, counted as one share of the aggregated install bar.
- **Disk status** rides the model sync: `syncModelInstalled()` appends an `flow:<id>` entry to
  the SAME `/comfy/models/check` payload (that route is id-agnostic — it stats filenames and
  never looks at `MODELS`) and hands each flow its slice via `setFlowDepStatus()`. Flows run no
  sync of their own. The cache is empty until the first sync, so an unsynced dep reads
  NOT-installed — it fails **closed**, which is the recoverable direction.
- **GC protection.** Both uninstall guards (`_localSharedDepsMap` and `_remoteSharedDepIds` in
  `routes/downloadManager.js`) build their protected set from `MODELS`, so a dep no model
  requires was invisible to them and any model uninstall would delete it. They now union in
  `_flowRequiredDepIds()` — unconditionally, since a flow has no install state of its own to
  gate on. **If you add another dep-protection path, add the flow union there too.**

## A PROMPT IS A FIELD. `inputSchema` only ever reads `media` (MPI-567)

**`inputSchema.positive: 'string'` does nothing.** Not "less than you expect" — nothing. Grep the
repo: the only consumer of `inputSchema` is `MpiBaseFlow`'s `_mediaGroups`, and it reads
`.media`. Any other key in that object is decoration.

A prompt reaches a run by being a **declared field whose id is `positive`**:

```js
fields: [{ id: 'positive', type: 'text', rows: 2, label: 'What did you draw?' }]
```

`_collectInputs` promotes any field id that is NOT `Input_*` to a top-level run input, and
`commandExecutor` (~610) maps `positive` → the graph's `Input_Positive` node.

**Why this is written down.** Scribble to Object carried `positive: 'string'` in `inputSchema`
from the day it was wired, shipped with **no prompt box at all**, and the dead key read as proof
the prompt was handled — through a code review, a full test suite and a handoff. The user drew a
blob meaning "an old lady", got an unrecognisable object rendered into his photo, and reasonably
concluded the flow needed a new feature. It needed a field.

`promptRequired: true` on the op does **not** save you: it is declared on fifteen-odd ops and
read by nothing (MPI-606). And the frame's empty-run guard aborts only when there is *neither*
media *nor* prompt — so a flow with media and an empty prompt runs and returns a confident wrong
picture.

> **The general rule both cases teach:** a declaration that no code reads is worse than no
> declaration. It survives review precisely because it looks like the thing that was asked for.
> When you add a key to a FlowDef, grep for its consumer before you trust it.

## A field declared on a GIZMO step AND the run slide drops edits on run 2 (MPI-567)

Declaring one id on two surfaces looks supported, and `_collectInputs` even documents it —
*"a flow declaring the same id in both places means the run slide's value is the one the user saw
immediately before pressing Generate."* **That is true only for a frame-native step.**

| step kind | where its `fields` values live |
|---|---|
| `kind: 'fields'` (FRAME_KIND, no role) | the **flow** store, `_fieldValues` — seeded there deliberately (`stepKinds.js` § `FRAME_KINDS`) |
| a gizmo kind (`paint`, `box`, `crop` — has a `role`) | the **step** store, `_stepValues[role].fields` |

`_collectInputs` applies step stores first and `_fieldValues` last. So for a **gizmo** step:

- **Fresh open — fine.** `_seedField` returns `undefined` for a flow-level field with no
  `default` and no persisted root, so the key is absent and cannot overwrite.
- **After one run — broken.** `s_flowInputs` now carries the id at the payload root, the
  flow-level copy seeds from it, and from then on the value the user edits **on the step** is
  overwritten at collection by the stale run-slide one. Wrong output, no error, second run only.

`character-sheet` really does declare its prompt twice and works — because its prompt step is
`kind: 'fields'`. Copying that pattern onto a gizmo step is the trap.

**Until MPI-606 unifies the stores: declare a shared id on ONE surface.** For a gizmo-step flow
that means the step, and changing the value before `Generate Again` costs one ticker click.

## The op key becomes the OUTPUT FILENAME — keep it short (MPI-567)

`routes/projects.js` (~1812) sanitises the op key and uses it as the sequenced filename prefix,
capped at 24 chars: this flow's op shipped as `flowScribbleObject` → `flowScribbleObject_001.png`,
badged in the gallery as `FLOWSCRIBBLEOBJECT_001`, and was renamed to `flowScribObj` →
`FLOWSCRIBOBJ_001` before release for exactly that reason. Long op names produce unusable
filenames, and the gallery badge is where the user meets them.

**Renaming is free before release and expensive after.** Check `appVersionIntroduced` against the
released `APP_VERSION`: an op introduced in an unreleased version has no files on any user's disk,
so the rename is a find-and-replace and nothing more. Once shipped, existing filenames and their
`sequenceCounters` entry are user data — leave it.

**It is more than the four op files.** The op key is matched BY NAME in the test suite as well, so
sweep the whole repo rather than the playbook's file list: `flowScribObj`'s rename touched the four
op files, the FlowDef's `operation`, and two tests — `flow-model-choice.test.cjs` asserts
`COMMANDS.<op>.injector`, and `inject-params-titles.test.cjs` names it in prose. `npm test` is the
gate that proves the sweep was complete.

This is why the flow ops do **not** share one naming convention: `flowHeadSwap` (1.1.0) and the
two LTX flows (1.4.2) shipped with long names and keep them. Do not "tidy" a released op key.

## The run path — `submitFlowGeneration`

`js/services/flowService.js` `submitFlowGeneration(flow, inputs, callbacks)`:
- Pre-flight **MODEL guard** — missing model → `ui:warning`, abort before enqueue. A no-model
  flow passes this trivially (`missing` empty).
- Config: `model: {id:null, mediaType}` (so RUN CLEAN — commandExecutor gates all LoRA/upscale
  injection on `payload.modelId`, and flow gens pass `model.id === null`), **no `getNextGeneration`**.
- ONE `placeholderGroup` "Generating…" card while the job runs; the real 1..N cards land on
  `generation:complete` (multi-output — see [02](02-media-io.md)).
