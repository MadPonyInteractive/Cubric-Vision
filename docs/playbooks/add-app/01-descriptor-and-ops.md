# 01 — Descriptor & Ops

The two registrations every app needs: the **op** (in 4 files) and the **descriptor**
(`AppDef` in `appsRegistry.js`). Read [README](README.md) first.

## The op — register in 4 files

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
     EXACTLY (the injector matches case-insensitively but silently skips a title with no
     node — see [05](05-verify.md), `tests/inject-params-titles.test.cjs`).
   - **`mediaType` per slot: `MEDIA_TYPE.IMAGE` / `MEDIA_TYPE.VIDEO` / the string `'audio'`.**
     `MEDIA_TYPE` only enumerates image + video — audio is the bare string. Getting this
     wrong is the MPI-259 audio bug: see [02](02-media-io.md).
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

## The run path — `submitAppGeneration`

`js/services/appService.js` `submitAppGeneration(app, inputs, callbacks)`:
- Pre-flight **MODEL guard** — missing model → `ui:warning`, abort before enqueue. A no-model
  app passes this trivially (`missing` empty).
- Config: `model: {id:null, mediaType}` (so RUN CLEAN — commandExecutor gates all LoRA/upscale
  injection on `payload.modelId`, and app gens pass `model.id === null`), **no `getNextGeneration`**.
- ONE `placeholderGroup` "Generating…" card while the job runs; the real 1..N cards land on
  `generation:complete` (multi-output — see [02](02-media-io.md)).
