# Master Agent Context Rules

> **AI SYSTEM INSTRUCTION:** This is the master routing file for MpiAiSuite. Whenever you begin a task, you MUST check this file and read the corresponding rule files in the `.claude/rules/` directory BEFORE writing any code.

## THE CARDINAL RULES
1. **NEVER assume architectural patterns.** Check the rules below.
2. **Use existing utilities and systems.** If a utility or pattern already exists, use it.
3. **DOCUMENTATION DRIFT:** At the end of ANY session where code was written, if a new workspace was introduced or component wiring (events, props, state, ComfyUI injection) changed, ask the user: *"Should I update `.claude/rules/`to reflect these changes?"* 
**Do NOT update the architectural rule files without explicit permission.** 

---

## Critical Rules Snapshot (Applies to ALL agents, always)

> These rules apply unconditionally. No file read required — follow them immediately.

- **Never hardcode colors.** Use CSS variables from `styles/01_base.css` only.
- **Never paste raw SVG.** All icons come from `js/utils/icons.js`. Add missing icons there first.
- **Never use raw \****`document.querySelector`**\*\*.** Use shorthands from `js/utils/dom.js` (`qs`, `qsa`, `gid`).
- **Never use raw \****`addEventListener`***\* / \****`removeEventListener`**\*\* in components.** Use `on()` / `off()` from `js/utils/dom.js` — both return cleanup/re-add fns. Exception: inside `destroy()`.
- **Never create global state outside \****`js/state.js`**\*\*.** The `state` object is a Proxy — mutating it auto-fires `state:changed`. Never manually emit that event.
- **Never use raw \****`window.addEventListener('keydown')`**\*\*.** Use `Hotkeys.bind` / `Hotkeys.unbind` with a registry id from `hotkeyRegistry.js`.
- **BEM is mandatory.** Format: `.mpi-block__element--modifier`. No exceptions.
- **All components MUST use \****`ComponentFactory.create()`**\*\*.** Never bypass the factory pattern.
- **NEVER modify \****`js/components/factory.js`**\*\*.** The factory is locked.
- **Every new component MUST:** register its `.css` in `js/shell/preloadStyles.js` AND document its props in `js/components/types.js`.
- **Use \****`Events.on()`***\* / \****`Events.emit()`**\*\* for all cross-component communication.** Always store and call the returned unsubscribe function on cleanup.
- **Navigation MUST call \****`instance.destroy()`**\*\* before clearing mounted Block.** See `.claude/rules/components.md` section "Observer Lifecycle & Teardown Contract". Never use `innerHTML = ''` alone.
- **If \****`setup`***\* calls \****`Events.on(...)`***\*, \****`window.addEventListener(...)`***\*, or creates any Observer — MUST define \****`el.destroy()`**\*\* that cleans them up.** Collect unsubscribes in `const _unsubs = []`.
- **Never mutate \****`state`**\*\* sub-objects directly** (e.g., `state.currentProject.itemGroups[i] = x`). Always replace the top-level key: `state.currentProject = { ...state.currentProject, itemGroups: [...] }`.
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
If you are building, moving, styling, or debugging a visual component (Primitives, Compounds, Organisms, Blocks):
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

### App Versioning System
If you need to understand how APP_VERSION, SCHEMA_VERSION, COMFY_VERSION, or the operation registry work:
**->** **READ:** `docs/versioning.md`

### Project Data & Meta File System
If you need to understand how project.json, .meta/ files, project load/reconciliation, or history items work:
**->** **READ:** `docs/project-integrity.md`

### Download System
If you are working with resumable downloads, IPC/SSE download events, or the download manager:
**->** **MUST READ:** `.claude/rules/downloads.md`

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

### Shell Services & Managers
If you are working with shell-level managers (Overlays, Hotkeys, StatusBar):
**->** **MUST READ:** `docs/shell.md` for service documentation

### Debugging & Errors
If you are trying to fix a bug, a server crash, or an issue with the python engine:
**->** **MUST DO:** Read the last 50-100 lines of `logs/app.log` using the `Read` tool with an `offset`. Do NOT parse the entire file. This log is the master terminal output and contains runtime telemetry.

### Browser Automation (playwright-cli)
If you need to run browser automation or test web interfaces:
**->** **Use:** `playwright-cli` skill (see `Skill: playwright-cli`) — installed globally (`npm i -g @playwright/cli`); skill at `~/.claude/skills/playwright-cli` (all projects).
**->** **Important:** App runs on http://127.0.0.1:3000/ (browser is dev-only — most features broken in browser; Electron desktop is the ship target).
**->** **MANDATORY: Run HEADED, not headless.** Always pass `--headed` (or `headless: false` programmatically) so the user can see the browser window. Headless = silent failure for visual bugs. Capture screenshots on key steps + on every failure for evidence.

### Git and Commits
NEVER commit to git unless user specifically asks for it
---

## MPI Skills `C:\Users\Fabio\.claude\skills\mpi\`

Four skills manage a human-in-the-loop execution system:

| Command | Skill | Purpose |
| --- | --- | --- |
| `/mpi-brainstorm` | mpi-brainstorm | Explore an idea collaboratively, write a spec, ask if you want a plan |
| `/mpi-quick-plan` | mpi-quick-plan | Create empty plan scaffold for manual to-do entry |
| `/mpi-write-plan` | mpi-write-plan | Decompose complex goals with parallel sub-agents into to-dos |
| `/mpi-execute-next` | mpi-execute-next | Execute next `[ ]` to-do — briefs before code, waits for "go" |
| `/mpi-handoff` | mpi-handoff | Generate a structured handoff doc when context is getting large |
| `/mpi-component-audit` | mpi-component-audit | ESLint audit of js/components/ — report violations, no fixes |
| `/mpi-brief-rule` | mpi-brief-rule | Inject rule briefing into sub-agent prompt at dispatch time |

**Core principle:** Parallel sub-agents only in planning. Execution is always sequential, one to-do at a time, with mandatory brief gate before any code is written.

---

## Sub-Agent Rule Injection Map

> **FOR THE MAIN AGENT — MANDATORY BEFORE EVERY SUB-AGENT DISPATCH:**
>
> Sub-agents start cold with zero CLAUDE.md context. Dispatching without briefing = broken sub-agent.
>
> **STEP 1 (REQUIRED):** Run `/mpi-brief-rule <name>` for each relevant rule (see table below). This reads the rule file and returns the `## Sub-Agent Briefing` section verbatim.
>
> **STEP 2 (REQUIRED):** Paste the returned briefing text into the sub-agent's prompt, along with the Critical Rules Snapshot above.
>
> **No exceptions.** If the rule has no briefing section, paste the Critical Rules Snapshot at minimum.

| Task type | Rule file | Briefing location |
| --- | --- | --- |
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
| App versioning system | `docs/versioning.md` | No briefing section — provide context inline |
| Project data model | `docs/project-integrity.md` | No briefing section — provide context inline |
| Download system | `.claude/rules/downloads.md` | `## Sub-Agent Briefing` |

---
