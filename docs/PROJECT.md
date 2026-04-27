# MpiAiSuite — Project Documentation

> Orientation hub for new agents. Start here, then drill into subsystem docs.

## What Is This App?

MpiAiSuite is a desktop application (Electron) that wraps [ComfyUI](https://github.com/comfyanonymous/ComfyUI) as its generation engine. Users manage projects containing image/video generation history, configure models and LoRAs, and run generation workflows through a 3-workspace UI.

## 3-Workspace Flow

```
[Landing] → select/create project → [Gallery] → click card → [Group History]
```

- **Landing:** Project selection and creation.
- **Gallery:** Default project view — all media items in a radial grid. Contains PromptBox for running model-tied commands.
- **Group History:** Single card detail — history timeline, canvas, PromptBox for running model-tied + universal commands.

## Key Subsystems

| Subsystem | Doc | What it covers |
|---|---|---|
| Workspaces | [workspaces.md](workspaces.md) | Landing, Gallery, Group History, routing |
| Data Layer | [data.md](data.md) | modelRegistry, commandRegistry, projectModel |
| Versioning | [versioning.md](versioning.md) | APP_VERSION, SCHEMA_VERSION, COMFY_VERSION, operation registry, release workflow |
| Project Integrity | [project-integrity.md](project-integrity.md) | .meta/ sidecars, UUID history, migration, reconciliation, hydration |
| ComfyUI Integration | [comfy.md](comfy.md) | comfyController, commandExecutor, download manager, workflow injection |
| Downloads | [comfy.md#download-manager](comfy.md#download-manager) | Resumable downloads, IPC/SSE, resume/pause/cancel, SHA256 verification |
| Components | [components.md](components.md) | ComponentFactory, 4-tier hierarchy (Primitives/Compounds/Organisms/Blocks), overlay/hotkey rules |
| Projects | [projects.md](projects.md) | Project JSON shape, media folder, portability |
| Shell | [shell.md](shell.md) | navigation, overlayManager, hotkeyManager, shell.js |
| Utilities | [utils.md](utils.md) | dom.js, icons.js, ratios.js, seed.js, and all js/utils/ |
| Events | [events.md](events.md) | EventBus, canonical event names, cross-component communication |

## Key Architectural Invariants

1. **Never hardcode colors** — CSS variables from `styles/01_base.css` only.
2. **Never modify `js/components/factory.js`** — it is locked.
3. **Never emit `state:changed` manually** — the state Proxy fires it automatically.
4. **`project:changed`** — fired via `Events.emit('project:changed', { project })` in `projectService.js openProject()` (or related initialization logic).
5. **Title-based workflow injection** — target nodes by `_meta.title`, not ID.
6. **Output node** is the canonical result capture point.
7. **All blocking UI uses `Overlays.request/release`** — never bypass.
8. **All hotkeys go through `Hotkeys.bind/unbind`** — declare in `hotkeyRegistry.js`, bind by id. Never raw `window.addEventListener`.

## How to Orient in an Unfamiliar File

1. Read the relevant subsystem doc above.
2. Check `.claude/rules/<subsystem>.md` for behavioral constraints.
3. Skim the actual file — patterns should now make sense.

## Rendering Architecture

### MpiCanvas + rawGpuPipeline

`MpiCanvas` (Primitive) is the interactive image viewer used in the history workspace. It uses a **two-canvas stack** inside a CSS-transformed container:

- `.mpi-canvas__stack` — sized to image native px, panned/zoomed via CSS `transform: translate(x,y) scale(s)`. GPU compositor handles pan/zoom; no per-frame rasterization.
- `baseCanvas` — displays the image. In raw tool mode, Pixi's `_app.canvas` is mounted here directly (via `setBaseCanvas`). In other modes, a 2D canvas draws the loaded image at 1:1.
- `overlayCanvas` — 2D canvas (image-native px) for mask, crop, grid, and comparison clip layer. Line widths are normalized by `/ view.scale` so on-screen thickness stays constant.
- `screenUICanvas` — 2D canvas (container px) for the brush indicator and comparison slider drag handle. Not affected by CSS transform.

`rawGpuPipeline.js` (`js/utils/`) owns the Pixi v8 WebGL application. It uses an **upstream-cache model**: `_upstreamRT[N]` = source rendered through all shaders except shader N. Dragging slider N composites shader N on top of `_upstreamRT[N]` in a single pass (~1ms at 4K). On commit (`commitParams()`), all 8 upstream caches are rebuilt. This eliminates the old `createImageBitmap` GPU→CPU→GPU roundtrip.

**Key rule:** Never pass the Pixi canvas through a bitmap copy. Call `canvas.el.setBaseCanvas(pipeline.getCanvas())` once at mount, then `pipeline.render()` updates the display automatically.

## ComfyUI Portability

ComfyUI portable engine lives at `engine/ComfyUI_windows_portable/`. Projects are self-contained in `documents/MpiAiSuite/projects/`. Model files are stored separately under `documents/MpiAiSuite/models/`. This split allows projects to be portable while model files stay on the user's fast storage.
