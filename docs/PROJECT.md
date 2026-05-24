# Cubric Studio — Project Documentation

> Orientation hub for new agents. Start here, then drill into subsystem docs.

## What Is This App?

Cubric Studio is a desktop application (Electron) that wraps [ComfyUI](https://github.com/comfyanonymous/ComfyUI) as its generation engine. Users manage projects containing image/video generation history, configure models and LoRAs, and run generation workflows through a 3-workspace UI.

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
| Components | [.claude/rules/components.md](../.claude/rules/components.md) | ComponentFactory, 4-tier hierarchy (Primitives/Compounds/Organisms/Blocks), overlay/hotkey rules (canonical lives in rules) |
| Projects | [project-integrity.md](project-integrity.md) | Project JSON shape, media folder, portability (folded into project-integrity) |
| Shell | [shell.md](shell.md) | navigation, overlayManager, hotkeyManager, shell.js |
| Utilities | [utils.md](utils.md) | dom.js, icons.js, ratios.js, seed.js, and all js/utils/ |
| Events | [events.md](events.md) | EventBus, canonical event names, cross-component communication |
| Worktrees | [worktrees.md](worktrees.md) | Git worktree setup, `.engine-config.json` for sharing the ComfyUI engine folder, post-checkout hook |

## Rendering Architecture (MpiCanvas)

`MpiCanvas` uses a two-canvas stack + CSS-transform pan/zoom model:
- `.mpi-canvas__stack` is sized to image-native px and moved/scaled via `style.transform = translate(x,y) scale(s)` — no `ctx.translate/scale` for image surfaces.
- `canvas[data-role=base]` + `canvas[data-role=overlay]` — both image-native px; draw at `(0,0)` with no ctx transform.
- `canvas[data-role=screen-ui]` — container px sibling (not inside stack); draws brush indicator and comparison slider UI.
- Coord conversion: image-px = `(clientX - stackRect.left) / view.scale`.

## Key Architectural Invariants

1. **Never hardcode colors** — CSS variables from `styles/01_base.css` only.
2. **Never modify `js/components/factory.js`** — it is locked.
3. **Never emit `state:changed` manually** — the state Proxy fires it automatically.
4. **`project:changed`** — fired via `Events.emit('project:changed', { project })` in `projectService.js openProject()` (or related initialization logic).
5. **Title-based workflow injection** — target nodes by `_meta.title`, not ID.
6. **Output node** is the canonical result capture point.
7. **All blocking UI uses `Overlays.request/release`** — never bypass.
8. **All hotkeys go through `Hotkeys.bind/unbind`** — declare in `hotkeyRegistry.js`, bind by id. Never raw `window.addEventListener`.
9. **Loop armed flag is session-only** — `state.loopArmed` (boolean) toggles Cue dispatcher re-fire on queue drain. Do not persist it to `project.json`. There is no Single mode — Cue is the only execution path; Loop is a flag layered on top.

10. **Queue mode is in-app Cue dispatch** - `generationService` owns `_cueQueue` and submits one ComfyUI prompt at a time. Do not use ComfyUI native queue polling for Cue depth.
11. **LoRA settings can be flat or staged** - most models use six flat LoRA slots. WAN declares `model.loraStages` and stores LoRAs as `{ high: [...], low: [...] }`, injecting `Lora_High_*` and `Lora_Low_*` by workflow node title.
12. **Standalone workflow injectors are allowed for tool-panel utility workflows** - operations declare `injector` in `commandRegistry.js`; `commandExecutor` applies the matching `js/services/workflowInjectors/*Injector.js` after workflow JSON load and before submit. Injectors still target nodes by `_meta.title`, never numeric IDs.
13. **Continue from last frame** — video-history workspace adds an `MpiToolOptionsPrompt` toolbar (`#right-top-slot`) with two role-tagged frame thumbs + Extend / Create new actions. Right-click on `MpiVideoPlayer` exposes "Set as start frame" / "Set as end frame" (auto-switches to an i2v-capable model when needed) and "Reverse video" (`POST /api/video/reverse`, ffmpeg `-vf reverse` + `-af areverse`, output `video_reverse_NNN.mp4`, trim-aware, appends new history entry). Extend post-processes the freshly generated I2V via server-side ffmpeg concat (`POST /extend-video`, output `extended_NNN.mp4`, sidecar `extendedFrom: { id, displayName }`). Combine (history + gallery context menus, ≥ 2 selected videos in chronological click order via `getSelectionOrder()`) → `POST /combine-videos`, output `combined_NNN.mp4`. Both routes share `services/videoConcat.js`: fast-path concat-demuxer when codec/pix_fmt/fps/dims/audio shape match across inputs; fallback concat-filter (re-encode) with crop-zoom (scale-increase + center crop, NOT pad) for ComfyUI Combine-node parity. Progress streams via dedicated SSE channel `/concat/events/stream` consumed by `js/services/concatProgress.js`. ffmpeg stderr truncated to first line at three layers before any user-visible toast.

## How to Orient in an Unfamiliar File

1. Read the relevant subsystem doc above.
2. Check `.claude/rules/<subsystem>.md` for behavioral constraints.
3. Skim the actual file — patterns should now make sense.

## ComfyUI Portability

ComfyUI portable engine lives at `engine/ComfyUI_windows_portable/`. Projects are self-contained under `<Documents>/Cubric Studio/Projects/` (resolved via Electron `app.getPath('documents')` — works on Windows, macOS, Linux). Model files are stored separately under the engine folder. This split lets projects survive uninstall/reinstall while keeping model files near the engine that uses them.
