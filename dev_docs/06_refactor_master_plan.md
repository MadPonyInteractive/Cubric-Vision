# MpiAiSuite — R8 Big Bang Refactor: Master Plan

> **AGENT BRIEFING — READ FIRST.**  
> This is the single source of truth for the R8 refactor. All agents MUST read this before touching any code.  
> Status: ✅ Done · 🔄 Active · ⬜ Pending · ❌ Blocked

---

## 🎯 Mandate

**Aggressive rebuild. App is pre-release. No users to protect.**

The factory component system (C1–C7) was built specifically to replace all old component patterns.
We are now executing on that: delete legacy, rebuild tools on the factory, harden the architecture.

### What we are doing
- **Delete** all legacy floating components (`PromptBox.js`, `Slider.js`, `MuteIcon.js`, `VolumeControl.js`, `customDropdown.js`, `videoPlayerCore.js`)
- **Rebuild** all tools as consumers of the factory component system
- **Introduce** a centralized Event Bus for cross-page/cross-module communication
- **Upgrade** the State system to support Project Templates (full recall)
- **Add** a `js/utils/` utility layer to eliminate all copy-paste helpers
- **Set up** Git with proper branch strategy and semver versioning

### What we are NOT doing
- We are NOT maintaining backward-compatible shims or re-export layers
- We are NOT touching the factory itself (`factory.js`) — it is correct as-is
- We are NOT touching Electron entry (`main.js`), Express routes, or ComfyUI workflow JSONs
- We are NOT rewriting `interactiveCanvas.js` — it is not a factory component and stays as-is

---

## 🔴 Rules for ALL Agents

1. **One phase per session.** Do not combine phases.
2. **Read the phase file completely before writing any code.**
3. **Touch only the files listed in the phase.** If you need to touch an unlisted file, STOP and ask.
4. **No new dependencies.** Vanilla JS, no npm packages added.
5. **After each phase:** verify the app opens and navigates without console errors. Document what you did.
6. **Components:** always import from the correct tier path. Never import a deleted file.
7. **If blocked:** document the blocker clearly in the phase file and stop.

---

## 📦 Architecture After R8

```
MpiAiSuite/
├── js/
│   ├── utils/              ← NEW: shared atomic utilities
│   │   ├── dom.js          ← qs, qsa, on, off
│   │   ├── async.js        ← debounce, throttle, sleep
│   │   ├── string.js       ← truncate, slugify
│   │   ├── file.js         ← getExtension, formatBytes, isImage/Video
│   │   └── seed.js         ← generateSeed() (moved from uiHelpers)
│   ├── events.js           ← NEW: Central Event Bus (pub/sub + mediator)
│   ├── state.js            ← UPGRADED: reactive store + project templates
│   ├── toolState.js        ← UPGRADED: template save/restore support
│   ├── components/         ← FACTORY ONLY (no legacy files at root)
│   │   ├── factory.js
│   │   ├── types.js
│   │   ├── Primitives/     ← MpiBadge, MpiButton, MpiIcon, MpiInput,
│   │   │                      MpiPopup, MpiProgressBar, MpiSpinner, MpiToast
│   │   ├── Compounds/      ← MpiDragList, MpiIconButton, MpiMediaDropzone,
│   │   │                      MpiPopupButton, MpiScrollableBox, MpiSlider
│   │   │                      + MpiMuteIcon (new), MpiVolumeControl (new), MpiVideoPlayer (new)
│   │   └── Blocks/         ← MpiDropdown, MpiPromptBox, MpiRatioSelector
│   └── tools/              ← Each tool rebuilt to consume factory components
```

---

## 🗂️ Phase Index

> Each phase is an independent task file. Give the file to the agent, not this document.  
> Phases within a group can be given to separate Flash sessions in parallel if needed.

### Group 0 — Foundation (must complete before any other group)

| Phase | File | What | Touches |
|---|---|---|---|
| **0.1** | `phases/0.1-git-setup.md` | Init git, .gitignore, first commit | root only |
| **0.2** | `phases/0.2-versioning.md` | `package.json` semver, `CHANGELOG.md` | `package.json`, new file |
| **0.3** | `phases/0.3-utils-layer.md` | Create `js/utils/` | 5 new files only |
| **0.4** | `phases/0.4-event-bus.md` | Create `js/events.js` Event Bus | 1 new file + `state.js` wiring |
| **0.5** | `phases/0.5-state-upgrade.md` | Upgrade state + project templates | `state.js`, `toolState.js` |

### Group 1 — Legacy Deletion (after Group 0)

| Phase | File | What | Touches |
|---|---|---|---|
| **1.1** | `phases/1.1-delete-legacy-components.md` | Delete 6 floating legacy components | Delete 6 files |
| **1.2** | `phases/1.2-promote-muteicon-volume.md` | Build `MpiMuteIcon` + `MpiVolumeControl` factory Compounds | 4 new files |
| **1.3** | `phases/1.3-promote-videoplayer.md` | Build `MpiVideoPlayer` factory Compound | 2 new files |

### Group 2 — Tool Rebuild (after Group 1, one per session)

> Small tools (2.1–2.5): one session each — give Flash the phase file directly.  
> Large tools (2.6–2.10): split into sub-phases — give Flash one sub-phase file per session.

| Phase | File(s) | Tool | Sessions |
|---|---|---|---|
| **2.1** | `phases/2.1-tool-translator.md` | `translator.js` | 1 |
| **2.2** | `phases/2.2-tool-jsonformatter.md` | `jsonFormatter.js` | 1 |
| **2.3** | `phases/2.3-tool-compare.md` | `compare.js` | 1 |
| **2.4** | `phases/2.4-tool-cropextract.md` | `cropExtract.js` | 1 |
| **2.5** | `phases/2.5-tool-descriptor.md` | `descriptor.js` | 1 |
| **2.6** | `phases/2.6.1-upscaler-ui.md` → `2.6.2-upscaler-events.md` | `upscaler.js` | 2 |
| **2.7** | `phases/2.7.1-llm-promptbox.md` → `2.7.2-llm-cleanup.md` | `llm.js` | 2 |
| **2.8** | `phases/2.8-tool-detailer.md` | `detailer.js` | 1–2 (complex) |
| **2.9** | `phases/2.9.1-promptbuilder-ui.md` → `2.9.2-promptbuilder-events.md` | `promptBuilder.js` | 2 |
| **2.10** | `phases/2.10.1-generator-ui.md` → `2.10.2-generator-progress.md` → `2.10.3-generator-final.md` | `generator.js` | **3** |

### Group 3 — CSS Co-location (can run parallel to Group 2)

| Phase | File | What | Touches |
|---|---|---|---|
| **3.1** | `phases/3.1-css-primitives.md` | Extract Primitive CSS from `03_forms.css` | 8 component css + `03_forms.css` |
| **3.2** | `phases/3.2-css-compounds.md` | Extract Compound CSS from `03_forms.css` + `05_tools.css` + **implement CSS preloader in `shell.js`** | 6 component css + 2 partials + `shell.js` |
| **3.3** | `phases/3.3-css-audit.md` | Audit remaining global CSS for dead rules + verify preloader | `03`–`05` partials |

> **CSS Preloader — Why & What:** Component CSS is loaded dynamically via `ensureStylesheet()` on first mount. On a cold app start, components render before their CSS downloads, causing FOUC (Flash of Unstyled Content). Confirmed during Phase 2.4 verification: visiting the Component Gallery first "fixes" it by warming the CSS cache. The fix is `preloadComponentStyles()` in `shell.js` — a lightweight startup function that injects `<link>` tags for all known component CSS paths before any tool loads. Implemented at the end of **Phase 3.2** (when all co-located paths are finalized). See `phases/3.2-css-compounds.md` for the implementation.

### Group 4 — Docs & Finalization (after all groups)

| Phase | File | What | Touches |
|---|---|---|---|
| **4.1** | `phases/4.1-docs-overview.md` | Update `dev_docs/01_overview.md` | 1 file |
| **4.2** | `phases/4.2-docs-technical.md` | Update `dev_docs/04_technical_notes.md` | 1 file |
| **4.3** | `phases/4.3-docs-components.md` | Update `dev_docs/05_components.md` + `README.md` | 2 files |
| **4.4** | `phases/4.4-docs-workflows.md` | Update `.agents/workflows/*.md` | 3–4 workflow files |

---

## 📋 Architecture Decisions

### Event Bus Design (`js/events.js`)
A lightweight pub/sub system with optional mediator pattern for cross-tool coordination.

```js
// Emit from anywhere
Events.emit('media:updated', { projectId });
Events.emit('tool:running', { tool: 'generator', type: 'comfy' });

// Subscribe from anywhere
Events.on('media:updated', ({ projectId }) => refreshLibrary(projectId));

// One-time listener
Events.once('comfy:ready', () => startRun());

// Namespaced channels (mediator-style)
Events.channel('generator').emit('result', { url });
Events.channel('generator').on('result', handler);
```

**Standard event names (canonical — always use these):**
| Event | Payload | Who emits |
|---|---|---|
| `media:updated` | `{ projectId }` | Any tool saving to library |
| `tool:running` | `{ tool, type }` | `toolUtils.js` → `setRunningTool()` |
| `tool:idle` | `{ tool, type }` | `toolUtils.js` → `clearRunningTool()` |
| `project:changed` | `{ project }` | `shell.js` on project switch |
| `state:changed` | `{ key, value }` | `state.js` reactive store |
| `comfy:ready` | — | `comfyController.js` on server ready |
| `nav:tool` | `{ toolName }` | `router.js` on navigation |

**Replace:** All `document.dispatchEvent(new CustomEvent(...))` and `document.addEventListener(...)` calls in tools migrate to `Events.on/emit`.

---

### State System Upgrade (`state.js`)

**Current:** A single flat reactive object. Works but has no schema, no templates, no validation.

**Upgraded:**
```js
// Reactive store (unchanged API — backward compatible)
state.generatorInputImage = url;

// Project Templates — new API
State.saveTemplate(templateName); // serializes all current tool states
State.loadTemplate(templateName); // restores all tool states
State.getTemplates();             // list saved templates
State.deleteTemplate(name);

// Template schema: stored in project.json under "templates": {}
// Each template = snapshot of all toolState entries for the project
```

**What a template captures:**
- All tool settings (prompt text, sliders, seeds, model selections)
- Per-tool state via existing `toolState.js` save/load pattern
- Does NOT capture: media library contents, ComfyUI server state

---

### Vanilla JS Project Templates — Storage Design
Templates stored **inside** `project.json` per project (no new files):
```json
{
  "id": "abc123",
  "name": "My Project",
  "templates": {
    "Sharp Portrait Style": {
      "created": "2026-03-31T...",
      "toolStates": {
        "generator": { "seed": 12345, "steps": 30, "positivePrompt": "..." },
        "upscaler": { "denoise": 0.5 }
      }
    }
  }
}
```
Backend: new routes in `routes/projects.js`:
- `POST /project-templates/:id` — save template
- `GET /project-templates/:id` — list templates
- `DELETE /project-templates/:id/:name` — delete template

---

### Git Strategy
```
main       ← stable snapshots only
dev        ← active development (default working branch)
r8/phase-X ← one branch per R8 phase, merge to dev on completion
```
- Commit message format: `[R8-X.Y] Description` (e.g., `[R8-0.3] Add js/utils/ layer`)
- A tag on `main` for each milestone: `v0.8.0`, `v0.9.0`, `v1.0.0`

---

## 🗑️ Delete List (Phase 1.1)

These files are deleted outright. No shims. Tools that import them will break — that is intentional and expected. Tool migration phases fix the imports.

| File | Replaced By |
|---|---|
| `js/components/PromptBox.js` | `Blocks/MpiPromptBox/` |
| `js/components/Slider.js` | `Compounds/MpiSlider/` |
| `js/components/MuteIcon.js` | `Compounds/MpiMuteIcon/` (Phase 1.2) |
| `js/components/VolumeControl.js` | `Compounds/MpiVolumeControl/` (Phase 1.2) |
| `js/components/customDropdown.js` | `Blocks/MpiDropdown/` |
| `js/components/videoPlayerCore.js` | `Compounds/MpiVideoPlayer/` (Phase 1.3) |

> **Note:** After deletion, tools WILL throw import errors. This is expected. Do NOT run the app between Phase 1.1 and completing Phase 2.x for each tool. Complete all Group 1 phases first, then do Group 2 sequentially.

---

## 🔧 Component Quick Reference (for Tool Rebuild phases)

Agents rebuilding tools should import from these canonical paths:

```js
// Primitives
import { MpiButton }      from '../components/Primitives/MpiButton/MpiButton.js';
import { MpiIcon, ICONS } from '../components/Primitives/MpiIcon/MpiIcon.js';
import { MpiInput }       from '../components/Primitives/MpiInput/MpiInput.js';
import { MpiBadge }       from '../components/Primitives/MpiBadge/MpiBadge.js';
import { MpiSpinner }     from '../components/Primitives/MpiSpinner/MpiSpinner.js';
import { MpiToast }       from '../components/Primitives/MpiToast/MpiToast.js';
import { MpiProgressBar } from '../components/Primitives/MpiProgressBar/MpiProgressBar.js';
import { MpiPopup }       from '../components/Primitives/MpiPopup/MpiPopup.js';

// Compounds
import { MpiIconButton }    from '../components/Compounds/MpiIconButton/MpiIconButton.js';
import { MpiSlider }        from '../components/Compounds/MpiSlider/MpiSlider.js';
import { MpiMediaDropzone } from '../components/Compounds/MpiMediaDropzone/MpiMediaDropzone.js';
import { MpiScrollableBox } from '../components/Compounds/MpiScrollableBox/MpiScrollableBox.js';
import { MpiPopupButton }   from '../components/Compounds/MpiPopupButton/MpiPopupButton.js';
import { MpiDragList }      from '../components/Compounds/MpiDragList/MpiDragList.js';
// Post Phase 1.2:
import { MpiMuteIcon }      from '../components/Compounds/MpiMuteIcon/MpiMuteIcon.js';
import { MpiVolumeControl } from '../components/Compounds/MpiVolumeControl/MpiVolumeControl.js';
// Post Phase 1.3:
import { MpiVideoPlayer }   from '../components/Compounds/MpiVideoPlayer/MpiVideoPlayer.js';

// Blocks
import { MpiPromptBox }     from '../components/Blocks/MpiPromptBox/MpiPromptBox.js';
import { MpiDropdown }      from '../components/Blocks/MpiDropdown/MpiDropdown.js';
import { MpiRatioSelector } from '../components/Blocks/MpiRatioSelector/MpiRatioSelector.js';

// Events & State
import { Events } from '../events.js';
import { state }  from '../state.js';

// Utils
import { qs, qsa, on, off } from '../utils/dom.js';
import { debounce }         from '../utils/async.js';
import { generateSeed }     from '../utils/seed.js';
```

---

## ✅ Master Checklist

### Group 0 — Foundation
- [x] 0.1 Git initialized, `.gitignore` in place, initial commit
- [x] 0.2 `package.json` semver `0.8.0`, `CHANGELOG.md` created
- [x] 0.3 `js/utils/` with 5 utility files
- [x] 0.4 `js/events.js` Event Bus created and wired to `state.js`
- [x] 0.5 `state.js` upgraded, project templates backend routes added

### Group 1 — Legacy Deletion
- [x] 1.1 6 legacy components deleted
- [x] 1.2 `MpiMuteIcon` + `MpiVolumeControl` factory Compounds built
- [x] 1.3 `MpiVideoPlayer` factory Compound built

### Group 2 — Tool Rebuild
- [x] 2.1 translator.js rebuilt
- [x] 2.2 jsonFormatter.js rebuilt
- [x] 2.3 compare.js rebuilt
- [x] 2.4 cropExtract.js rebuilt
- [ ] 2.5 descriptor.js rebuilt
- [ ] 2.6 upscaler.js rebuilt
- [ ] 2.7 llm.js rebuilt
- [ ] 2.8 detailer.js rebuilt
- [ ] 2.9 promptBuilder.js rebuilt
- [ ] 2.10 generator.js rebuilt

### Group 3 — CSS Co-location
- [x] 3.1 Primitive CSS extracted and co-located
- [x] 3.2 Compound CSS extracted and co-located
- [ ] 3.3 Global CSS audit complete

### Group 4 — Docs
- [ ] 4.1–4.4 All dev_docs and workflow files updated

### Final Gate
- [ ] Zero console errors on full navigation pass
- [ ] Component Gallery renders all components
- [ ] Project Templates: save and restore cycle works
- [ ] Git: `dev` branch clean, tagged `v0.9.0`
