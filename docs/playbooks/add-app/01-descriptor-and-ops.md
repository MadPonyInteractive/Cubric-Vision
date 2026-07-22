# 01 — Descriptor & Ops

The two registrations every app needs: the **op** (in 4 files) and the **descriptor**
(`AppDef` in `appsRegistry.js`). Read [README](README.md) first.

## The op — register in 4 files

> The two-mirror registry skeleton (`operationRegistry.js` + `operation_registry.json`,
> `appVersionIntroduced`, no-version-bump) is **[shared] — canonical in
> [../common/op-registration.md](../common/op-registration.md).** Below is the app-side
> shape: `universal: true` is mandatory, and `operation_registry.json` is a hand-maintained
> superset that must NEVER be regenerated.

An app op is a **universal op** (a second producer into the generation queue, exactly like
the History block's universal tool ops). Register it in all four, in this order:

1. **`js/data/commandRegistry.js`** — the op definition:
   ```js
   appVideoStitch: {
     label: 'App: Video Stitch',
     progressLabel: 'Stitching',
     mediaType: MEDIA_TYPE.VIDEO,        // OUTPUT type
     requiresImages: 0,                  // media never a hard requirement in v1
     mediaInputs: [
       { key: 'video1', mediaType: MEDIA_TYPE.VIDEO, title: 'Input_video',   required: false },
       { key: 'video2', mediaType: MEDIA_TYPE.VIDEO, title: 'Input_video_2', required: false },
       { key: 'audio1', mediaType: 'audio',          title: 'Input_audio',   required: false },
     ],
     promptRequired: false,              // pure media utility — no prompt
     universal: true,                    // MANDATORY for app ops
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
     non-app ops so does the availability gate (`getAvailableCommands`:
     `requires* ≤ count ≤ #slots` + `requiresMask`). `universal: true` app ops are
     EXCLUDED from `getAvailableCommands`, so they never appear on the model op
     radial/dropdown — the app surface owns its own media I/O.
2. **`js/data/modelConstants/universal_workflows.js`** — op → workflow filename:
   ```js
   appVideoStitch: { workflow: 'app_video_test.json' },
   ```
   The filename is resolved case-insensitively (a middleware in `routes/workflowStatic.js`
   resolves `/comfy_workflows/<name>` regardless of case), so `App_Foo.json` vs `app_foo.json`
   both work. Keep whatever case the user exported.
3. **`js/core/operationRegistry.js`** — version stamp:
   ```js
   appVideoStitch: { latestVersion: '1.0', appVersionIntroduced: '1.2.0' },
   ```
4. **`operation_registry.json`** — the hand-maintained superset:
   ```json
   "appVideoStitch": { "latestVersion": "1.0", "appVersionIntroduced": "1.2.0", "universal": true }
   ```
   **NEVER regenerate this file from JS** — regeneration strips the `universal` flags.

## The descriptor — `AppDef` in `appsRegistry.js`

`appsRegistry.js` is the single source of truth for apps (read-only over
`state.s_installedModelIds` — apps have NO disk-presence concept of their own; do NOT
cargo-cult install-sync machinery from modelRegistry).

```js
{
  id,             // unique
  title,          // card + slide-over
  preview,        // filename under comfy_workflows/display/ (reuse any existing webp)
  description,    // slide-over copy
  requiredModels, // MODEL ids (NOT dep ids) — [] for a no-model app
  operation,      // the universal-op key from commandRegistry.js
  workflow,       // the workflow filename from universal_workflows.js
  uiComponent,    // per-app component NAME (string) — OMIT for a media-only app
  mediaType,      // 'image' | 'video' — the OUTPUT type (always required)
  inputSchema,    // { positive?: 'string', media?: [ ...slot groups ] }
}
```

### No-model app (Video Stitch)

```js
{
  id: 'video-stitch',
  title: 'Video Stitch',
  preview: 'sdxl-real-01.webp',   // any existing preview
  requiredModels: [],             // always available, no install gate
  operation: 'appVideoStitch',
  workflow: 'app_video_test.json',
  mediaType: 'video',
  inputSchema: {
    media: [
      { type: 'video', mode: 'upto', max: 2, roles: ['video1', 'video2'] },
      { type: 'audio', mode: 'upto', max: 1, roles: ['audio1'] },
    ],
  },
  // no uiComponent — MpiBaseApp renders the media slots straight from inputSchema.media
}
```

- **`requiredModels: []`** → `appAvailability` returns `{available:true, missing:[]}` always.
  No install gate, badge is Ready, Open enabled (in a project).
- **No `uiComponent`** → the shell's `app:open` handler resolves `_appComponents[undefined]`
  to `null`; `MpiBaseApp` mounts NO per-app controls, just the media slots + Run. Valid path.
- `inputSchema.media[].roles` MUST match the op's `mediaInputs` keys (`video1`/`video2`/`audio1`).

### Multi-model app (SDXL 4K)

`requiredModels: ['sdxl-nsfw', 'nvidia-pid']` — availability = ALL installed; the App Library
Install button drives each missing model's OWN dep download (`getModelDependencies(id)` →
`downloadService.start(id, deps)`). Apps declare **models, never deps** (zero dep duplication).
See [04](04-overlay-and-shell.md) for the install-progress UI.

### App-only extra weights — `requiredDeps` (MPI-304, SHIPPED)

> **Read this before adding an app-specific weight to a MODEL's dependency list.** Doing that
> taxes every user of that model — and is never necessary.

Some apps need a weight no model requires — a baked LoRA, an extra detector, a custom node.
`requiredModels` resolves MODEL ids only, so declare those as `requiredDeps` — dep ids
resolved from `DEPS`, alongside `requiredModels`:

```js
{
  requiredModels: ['qwen-edit'],           // shared model
  requiredDeps:   ['qwen-lora-headswap'],  // app-only extras
}
```

Works for LoRAs, support weights AND custom nodes (`nodesDeps` is already merged into `DEPS`).
The scaling case it exists for: Head Swap needs a 1.2GB LoRA on top of `qwen-edit`; folding
that into the model would push it onto every Qwen user, and an app taking 30 style LoRAs would
tax all users ~15GB.

**The entry still lives in the file for its KIND** — `loraDeps.js` for a LoRA, `assetDeps.js`
for a weight, `nodesDeps.js` for a node pack. Deps are filed by *what they are*, never by who
requires them; ownership is a list of ids, not a file. When a kind-file gets fat, split it
further BY KIND (`loraDeps.js` → `loras/krea2.js`, `loras/qwen.js`) — the
[dependencies.js](../../../js/data/modelConstants/dependencies.js) facade absorbs that with
zero consumer changes.

**How it behaves** (all of this is automatic — a new app only writes the id list):

- **Gating is identical to a missing model.** `appAvailability()` returns `missingDeps`
  alongside `missing`, and `available` accounts for both. The tile badge reads "Get models",
  Open stays blocked, and `submitAppGeneration`'s pre-flight aborts — so a missing app dep can
  never reach ComfyUI as a "lora not found" mid-run.
- **One extra row** in the slide-over's required list ("Extra dependencies (1.2GB)"),
  aggregated rather than itemised — the deps are an implementation detail of the app, not a
  thing the user picked.
- **Install/cancel/progress** run under the key `app:<id>` (`appDepKey()`), one job for the
  app's whole dep set, counted as one share of the aggregated install bar.
- **Disk status** rides the model sync: `syncModelInstalled()` appends an `app:<id>` entry to
  the SAME `/comfy/models/check` payload (that route is id-agnostic — it stats filenames and
  never looks at `MODELS`) and hands each app its slice via `setAppDepStatus()`. Apps run no
  sync of their own. The cache is empty until the first sync, so an unsynced dep reads
  NOT-installed — it fails **closed**, which is the recoverable direction.
- **GC protection.** Both uninstall guards (`_localSharedDepsMap` and `_remoteSharedDepIds` in
  `routes/downloadManager.js`) build their protected set from `MODELS`, so a dep no model
  requires was invisible to them and any model uninstall would delete it. They now union in
  `_appRequiredDepIds()` — unconditionally, since an app has no install state of its own to
  gate on. **If you add another dep-protection path, add the app union there too.**

## The run path — `submitAppGeneration`

`js/services/appService.js` `submitAppGeneration(app, inputs, callbacks)`:
- Pre-flight **MODEL guard** — missing model → `ui:warning`, abort before enqueue. A no-model
  app passes this trivially (`missing` empty).
- Config: `model: {id:null, mediaType}` (so RUN CLEAN — commandExecutor gates all LoRA/upscale
  injection on `payload.modelId`, and app gens pass `model.id === null`), **no `getNextGeneration`**.
- ONE `placeholderGroup` "Generating…" card while the job runs; the real 1..N cards land on
  `generation:complete` (multi-output — see [02](02-media-io.md)).
