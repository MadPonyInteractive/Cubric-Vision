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
| ComfyUI Integration | [comfy.md](comfy.md) | comfyController, commandExecutor, workflow injection |
| Components | [components.md](components.md) | ComponentFactory, 3-tier hierarchy, overlay/hotkey rules |
| Projects | [projects.md](projects.md) | Project JSON shape, media folder, portability |
| Shell | [shell.md](shell.md) | navigation, overlayManager, hotkeyManager, shell.js |
| Utilities | [utils.md](utils.md) | dom.js, icons.js, ratios.js, seed.js, and all js/utils/ |
| Events | [events.md](events.md) | EventBus, canonical event names, cross-component communication |

## Key Architectural Invariants

1. **Never hardcode colors** — CSS variables from `styles/01_base.css` only.
2. **Never modify `js/components/factory.js`** — it is locked.
3. **Never emit `state:changed` manually** — the state Proxy fires it automatically.
4. **Never emit `project:changed` via `Events.emit`** — use native `CustomEvent` dispatch (known bug).
5. **Title-based workflow injection** — target nodes by `_meta.title`, not ID.
6. **Output node** is the canonical result capture point.
7. **All blocking UI uses `Overlays.request/release`** — never bypass.
8. **All hotkeys go through `Hotkeys.register/unregister`** — never raw `window.addEventListener`.

## How to Orient in an Unfamiliar File

1. Read the relevant subsystem doc above.
2. Check `.claude/rules/<subsystem>.md` for behavioral constraints.
3. Skim the actual file — patterns should now make sense.

## ComfyUI Portability

ComfyUI portable engine lives at `engine/ComfyUI_windows_portable/`. Projects are self-contained in `documents/MpiAiSuite/projects/`. Model files are stored separately under `documents/MpiAiSuite/models/`. This split allows projects to be portable while model files stay on the user's fast storage.