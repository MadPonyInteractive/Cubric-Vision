# MPI-256 research — Agent E: ComponentFactory / BaseApp / router / buttons / state

## Q1. ComponentFactory.create contract
- Signature (`factory.js:40`): `ComponentFactory.create(def) → blueprint`.
- `def` (`factory.js:35-39`): `name` (required, CustomEvent prefix), `template(props,children)→string` (required), `setup(el,props,emit)` (optional, all wiring), `css[]` (injected once per path via ensureStylesheet, `factory.js:16-24`), `dependencies[]` (reference-only).
- Blueprint: `.template`, `.setup`, `.mount(container,props,children)` → inject CSS → `container.innerHTML = html` → `def.setup` → instance `{el, props, children, update, on, destroy}`.
- `instance.destroy()` (`factory.js:115-122`): calls `el.destroy()` if defined → removes el from parent → `listeners.clear()`.
- `_unsubs` pattern (`components.md:207-228`): collect Events.on/Hotkeys.bind/child.destroy returns; `el.destroy` runs them. Navigation calls `instance.el.destroy()` before clearing `_toolContainer.innerHTML` (`navigation.js:173-189`).
- RISKS: portal nodes in document.body only cleaned if el.destroy does it explicitly (factory doesn't know portals). `update()` is a no-op stub (`factory.js:102-109`) — live updates = imperative `el.*` methods set in setup.

## Q2. BaseApp precedent — COMPOSITION, not inheritance
- NO class inheritance/mixins anywhere. Factory = plain object factory.
- **Established pattern = wrap MpiOverlay** (3 precedents):
  - `MpiCompareOverlay.js:62-184`: setup mounts `MpiOverlay.mount(document.createElement('div'), {closable:true})`, then `overlay.el.appendToContainer(el)`, proxies `el.show/hide`. = exact "frame + content" pattern.
  - `MpiModelManager.js:99-104`: same (`overlay.el.appendToContainer(el)`, proxies `el.open/close`).
  - `MpiModelSettings.js:241-242`: same, `{closable:true}`.
- **BaseApp recommended = composition (Option 1):** BaseApp blueprint whose setup mounts shared frame (header/result pane/generate/upload slots) + exposes `el.mountContent(appEl)` slots. Per-app components mount BaseApp then fill slots. Overlay shell = MpiOverlay.
- Option 2 = shared `baseSetup(el,props,emit)` helper spread into each def — valid but duplicates frame HTML unless templates also compose.
- Tier rule (`components.md:54-59`): BaseApp frame w/ slots = Organism; per-app wrapper = Organism or Block by imports.
- RISKS: `appendToContainer` is MpiOverlay-specific. `container.innerHTML = html` in mount ⇒ BaseApp template uses EMPTY named slots (`<div id="app-content-slot">`), setup fills imperatively (as every Block does).

## Q3. New-component obligations
1. CSS path in `js/shell/preloadStyles.js` (`PRELOAD_COMPONENT_STYLES`, preloadStyles.js:6) — must match def.css.
2. Props `@typedef` in `js/components/types.js`.
3. Ask user re dev components gallery (`js/pages/components.js`, test_styles gate) — ask-first, not mandatory.
4. Rule-file updates: `component-mounts.md` (sub-mounts), `component-events*.md` (new bus events), `component-state.md` (new state keys). Not runtime-breaking but rule-contract mandatory.
5. BEM + 01_base.css tokens only; no backdrop-filter; sharp corners default (`components.md:6-18`).
6. Hotkeys: registry + matching `<li>` in mpi-hotkeys.js template are PAIRED (`components.md:181`).

## Q4. Router — overlays need ZERO router changes
- `router.js:11-13` = PAGE_LANDING/PAGE_GALLERY/PAGE_GROUP_HISTORY only; no overlay concept.
- Model Library avoidance: `shell.js:346-351` — `Events.on('models:open', ...)` lazy-singleton `MpiModelManager.mount(document.createElement('div'))` then `_modelLibrary.el.open()`. Never navigate().
- MpiOverlay Stash Pattern (`MpiOverlay.js:76-100`): moves `#tool-container` children to hidden stash on show, restores on hide — workspace DOM preserved.
- **`Overlays.reset()` fires at top of EVERY navigation branch** (`navigation.js:135`, `navigation.js:203`) → force-closes ALL overlays (both tool-container and body mode). App overlay open + navigate ⇒ force-closed. Apps sidestep by being event-triggered (never navigate to open), but input-state survival across a forced close must come from state.js, not the component.

## Q5. Entry buttons + dev_mode gating
- **Gallery:** NO dedicated toolbar component; header = `mpi-gallery-block__header` inside `MpiGalleryBlock.js:60-65` (`__crumb/__filters/__sort`). Adding a button = template change to MpiGalleryBlock + mount in its setup.
- **Landing:** `js/shell/projectUI.js:initProjectUI()` — `#landingActions` slot (projectUI.js:73-88) holds plain `<a>` nav links (Models/Settings/Hotkeys/About) via a `defs` array (75-80); `#newProjectBtn` = MpiButton.
- **dev_mode gate patterns to copy:**
  - Array-conditional (cleanest): `navigation.js:274-277` `const extraItems = APP_CONFIG.dev_mode ? [{action:'components',...}] : []`.
  - Template ternary: `MpiRunpodSettings.js:90-92`.
  - Hotkey `when: () => APP_CONFIG.dev_mode` (`hotkeyRegistry.js:539`).
- RISK/decision: Apps button on Landing = plain `<a>` (match #landingActions) vs MpiButton; Gallery needs a new header slot.

## Q6. State rules for s_appInputs
- `s_` prefix = session-aware but NOT uniformly non-persisted (s_selectedModelIdByType + s_lastSelectedMediaType mirror to localStorage; s_installedModelIds + s_selectedOpByModel do not). Per-key comment is authoritative (`state.js:31-69`).
- New key = 3 files together: `state.js` `_state` (+ comment: type, session/persist, readers/writers), `component-state.md` table row, consumer setup.
- Replace-not-mutate (`components.md:237`, `component-state.md:76`): Proxy is SHALLOW — `state.s_appInputs = {...state.s_appInputs, [appId]: inputs}`, never sub-mutate.
- `batchState(() => {...})` when multiple keys change together (`components.md:244-252`).
- Suggested shape: `s_appInputs: {}` — `{[appId]: Object}`, session-only, top-level replace only.
- OPEN DECISION: s_appInputs in state.js (survives navigation + Overlays.reset force-close) vs component-closure (dies with overlay). Given Overlays.reset on every navigation ⇒ state.js if tweak-and-rerun must survive.
