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
  preview,        // filename under comfy_workflows/display/ (reuse any existing webp)
  description,    // slide-over copy
  requiredModels, // MODEL ids (NOT dep ids) — [] for a no-model flow
  operation,      // the universal-op key from commandRegistry.js
  workflow,       // the workflow filename from universal_workflows.js
  uiComponent,    // per-flow component NAME (string) — OMIT for a media-only flow
  mediaType,      // 'image' | 'video' — the OUTPUT type (always required)
  inputSchema,    // { positive?: 'string', media?: [ ...slot groups ] }
}
```

### No-model flow (Video Stitch)

```js
{
  id: 'video-stitch',
  title: 'Video Stitch',
  preview: 'sdxl-real-01.webp',   // any existing preview
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
  // no uiComponent — MpiBaseFlow renders the media slots straight from inputSchema.media
}
```

- **`requiredModels: []`** → `flowAvailability` returns `{available:true, missing:[]}` always.
  No install gate, badge is Ready, Open enabled (in a project).
- **No `uiComponent`** → the shell's `flow:open` handler resolves `_flowComponents[undefined]`
  to `null`; `MpiBaseFlow` mounts NO per-flow controls, just the media slots + Run. Valid path.
- `inputSchema.media[].roles` MUST match the op's `mediaInputs` keys (`video1`/`video2`/`audio1`).

### Multi-model flow (SDXL 4K)

`requiredModels: ['sdxl-nsfw', 'nvidia-pid']` — availability = ALL installed; the Flow Library
Install button drives each missing model's OWN dep download (`getModelDependencies(id)` →
`downloadService.start(id, deps)`). Flows declare **models, never deps** (zero dep duplication).
See [04](04-overlay-and-shell.md) for the install-progress UI.

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

## The run path — `submitFlowGeneration`

`js/services/flowService.js` `submitFlowGeneration(flow, inputs, callbacks)`:
- Pre-flight **MODEL guard** — missing model → `ui:warning`, abort before enqueue. A no-model
  flow passes this trivially (`missing` empty).
- Config: `model: {id:null, mediaType}` (so RUN CLEAN — commandExecutor gates all LoRA/upscale
  injection on `payload.modelId`, and flow gens pass `model.id === null`), **no `getNextGeneration`**.
- ONE `placeholderGroup` "Generating…" card while the job runs; the real 1..N cards land on
  `generation:complete` (multi-output — see [02](02-media-io.md)).
