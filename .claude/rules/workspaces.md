# Workspace Architecture

> **AI INSTRUCTION:** Pages, workflow states, and routing. Full narrative + Landing/Gallery/History layout details live in `docs/workspaces.md`.

## Sub-Agent Briefing
> Copy this section verbatim into any sub-agent prompt that involves routing, navigation, or workspace layout.

**Three workspaces:** Landing (project select/create) → Gallery (default project view) → Group History (single card detail). See `docs/workspaces.md` for full layout details.

**Routing:** Use `js/router.js` (`navigate()` / `back()`) — never `window.location`. Pages: `PAGE_LANDING`, `PAGE_GALLERY`, `PAGE_GROUP_HISTORY`. `js/shell/navigation.js` lazy-loads each workspace Block on transition.

**PromptBox mount:** Mount `MpiPromptBox` Organism directly into `#prompt-box-mount` (`gid('prompt-box-mount')`). Block keeps the handle in `_pb`; call `_pb?.destroy?.()` before remount AND in Block `el.destroy`. Slot is shell-owned (declared in `index.html`), persists across workspace switches. No `PromptBoxService` — Block mounts direct.

**Zero-model gate:** Empty/new project auto-opens the Model Library overlay via `models:open`. PromptBox mounts only when `s_installedModelIds.length > 0` (keyed off `state:changed`, NOT a `models:closed` event). `resolveActiveModel(mediaType)` returns `null` at zero-install — workspace must re-resolve in the `s_installedModelIds` watcher.

**Dev Components Gallery:** `js/pages/components.js` — hidden, gated by `test_styles: true` in `dev_configs/app_config.js`. Ask before adding components.
