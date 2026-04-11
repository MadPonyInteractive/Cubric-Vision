# Master Agent Context Rules

> **AI SYSTEM INSTRUCTION:** This is the master routing file for MpiAiSuite. Whenever you begin a task, you MUST check this file and read the corresponding rule files in the `.claude/rules/` directory BEFORE writing any code.

## THE CARDINAL RULES
1. **NEVER assume architectural patterns.** Check the rules below.
2. **NEVER go rogue.** If a utility or system exists, use it.
3. **DOCUMENTATION DRIFT:** At the end of ANY session where code was written, you MUST review whether any of the following changed:
   - A new utility was added to `js/utils/`
   - A new route category or workspace was introduced
   - An architectural pattern was modified or replaced
   - A new dependency or backend service was added
   - A component's events, props, state connections, or ComfyUI injection changed

   If any of the above is true, you MUST ask the user: *"Should I update `.claude/rules/` to reflect these changes?"* **Do NOT update the architectural rule files without explicit permission.** (However, you ARE allowed to update `.claude/rules/backlog.md` autonomously to cross off completed tasks).
   Additionally, if component wiring changed, run `/update-component-map` to regenerate the component map rule files.

---

## Critical Rules Snapshot (Applies to ALL agents, always)

> These rules apply unconditionally. No file read required — follow them immediately.

- **Never hardcode colors.** Use CSS variables from `styles/01_base.css` only.
- **Never paste raw SVG.** All icons come from `js/utils/icons.js`. Add missing icons there first.
- **Never use raw `document.querySelector`.** Use shorthands from `js/utils/dom.js`.
- **Never create global state outside `js/state.js`.** The `state` object is a Proxy — mutating it auto-fires `state:changed`. Never manually emit that event.
- **Never use raw `window.addEventListener('keydown')`.** Use `Hotkeys.register` / `Hotkeys.unregister`.
- **BEM is mandatory.** Format: `.mpi-block__element--modifier`. No exceptions.
- **All components MUST use `ComponentFactory.create()`.** Never bypass the factory pattern.
- **NEVER modify `js/components/factory.js`.** The factory is locked.
- **Every new component MUST:** register its `.css` in `js/shell/preloadStyles.js` AND document its props in `js/components/types.js`.
- **Use `Events.on()` / `Events.emit()` for all cross-component communication.** Always store and call the returned unsubscribe function on cleanup.
- **Frontend logging:** use `js/services/clientLogger.js`. Backend logging: use `routes/logger.js`. Never rely on bare `console.log`.

---

## Baseline Rule (ALWAYS APPLIES)

**Before writing any code**, you MUST read `.claude/rules/dos_and_donts.md`. It contains universal CSS, icon, and utility rules that apply to every task regardless of category.

---

## Documentation Lookup

> **Before searching for anything in the codebase,** check `docs/PROJECT.md` first — it is the orientation hub that points to all subsystem docs. Most answers about structure, architecture, and data shapes are already documented there.

---

## Context Router

If you are asked to perform a task in any of the following categories, you MUST use the `Read` tool to ingest the respective rule file first.

### Components & UI
If you are building, moving, styling, or debugging a visual component (Primitives, Compounds, Blocks):
**->** **MUST READ:** `.claude/rules/components.md`

### General Logic, DOM, CSS & Utilities
If you are styling a component, writing generic DOM query logic, or adding icons/ratios:
**->** **MUST READ:** `.claude/rules/dos_and_donts.md`

### Events & Communication
If you need components to talk to each other, or if you need to dispatch system signals:
**->** **MUST READ:** `.claude/rules/events.md`

### Application State
If you are tracking data that must persist across the application (e.g., current project, selected model):
**->** **MUST READ:** `.claude/rules/state.md`

### Workspace & Routing Architecture
If you need to understand the app's pages, workflow states, or the dev component gallery:
**->** **MUST READ:** `.claude/rules/workspaces.md`

### ComfyUI Workflows & Injection
If you are sending tasks to ComfyUI, compiling JSON workflows, or dealing with images/masks in graphs:
**->** **MUST READ:** `.claude/rules/comfy_injection.md`

### ComfyUI Engine & Backend
If you are adding models to the registry, managing downloads, or dealing with the python server:
**->** **MUST READ:** `.claude/rules/comfy_engine.md`

### Component Mount Map
If you need to know who mounts a component, what props it receives, or where it appears in the UI:
**->** **MUST READ:** `.claude/rules/component-mounts.md`

### Component Event Wiring
If you need to know what events a component emits or listens to (without building or modifying components):
**->** **MUST READ:** `.claude/rules/component-events.md`

### Component State Connections
If you need to know which state keys a component reads or writes:
**->** **MUST READ:** `.claude/rules/component-state.md`

### Component ComfyUI Injection
If you need to know what gets injected into ComfyUI workflows, which component injects it, and for which operations:
**->** **MUST READ:** `.claude/rules/component-comfy.md`

### Debugging & Errors
If you are trying to fix a bug, a server crash, or an issue with the python engine:
**->** **MUST DO:** Read the last 50-100 lines of `logs/app.log` using the `Read` tool with an `offset`. Do NOT parse the entire file. This log is the master terminal output and contains runtime telemetry.

### Browser Automation (playwright-cli)
If you need to run browser automation or test web interfaces:
**->** **Use:** `playwright-cli` skill (see `Skill: playwright-cli`)
**->** **Important:** When opening a visible browser, always use the `--headed` flag so the user can see the browser window and interactions. Omit `--headed` only when running headless (e.g., in CI or when no visual feedback is needed).

---

## Sub-Agent Rule Injection Map

> **FOR THE MAIN AGENT:** When dispatching a sub-agent via the `Agent` tool, sub-agents start cold — they have no CLAUDE.md context. You MUST copy the relevant briefing text from the rule file's `## Sub-Agent Briefing` section directly into the sub-agent's prompt. Always include the Critical Rules Snapshot above in every sub-agent prompt.

| Task type | Rule file | Briefing location |
|---|---|---|
| Any code at all | *(inline above)* | Critical Rules Snapshot — always include |
| Components / UI | `.claude/rules/components.md` | `## Sub-Agent Briefing` |
| DOM / CSS / Utilities | `.claude/rules/dos_and_donts.md` | `## Sub-Agent Briefing` |
| Events & communication | `.claude/rules/events.md` | `## Sub-Agent Briefing` |
| Application state | `.claude/rules/state.md` | `## Sub-Agent Briefing` |
| ComfyUI workflow injection | `.claude/rules/comfy_injection.md` | `## Sub-Agent Briefing` |
| ComfyUI engine / backend | `.claude/rules/comfy_engine.md` | `## Sub-Agent Briefing` |
| Workspace / routing | `.claude/rules/workspaces.md` | `## Sub-Agent Briefing` |
| Debugging | `logs/app.log` (last 100 lines via `Read` with offset) | No briefing section — paste log tail directly |
| Component mount locations | `.claude/rules/component-mounts.md` | `## Sub-Agent Briefing` |
| Component event wiring | `.claude/rules/component-events.md` | `## Sub-Agent Briefing` |
| Component state connections | `.claude/rules/component-state.md` | `## Sub-Agent Briefing` |
| Component ComfyUI injection | `.claude/rules/component-comfy.md` | `## Sub-Agent Briefing` |

---

## Current Backlog & To-Dos
If you need to know what to work on next, or if you want to find bug fixes:
**->** **MUST READ:** `.claude/rules/backlog.md`

> **CRITICAL:** Backlog items that lack detailed technical context are NOT self-explanatory. If an item is unclear, you MUST stop and ask the user: *"Can you explain in detail how we should approach [Task]?"* before writing any code.
