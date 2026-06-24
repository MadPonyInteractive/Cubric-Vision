# Master Agent Context Rules

> **AI SYSTEM INSTRUCTION:** This is the master routing file for Cubric Studio. Whenever you begin a task, you MUST check this file and read the corresponding rule files in the `.claude/rules/` directory BEFORE writing any code.

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
- **Project JSON writes:** server routes that modify `project.json` MUST use `updateProjectJson()` in `routes/projects.js` for per-file queued atomic writes. Do not add direct `fs.writeJson(project.json, ...)` routes.
- **Frontend logging:** use `js/services/clientLogger.js`. Backend logging: use `routes/logger.js`. Never rely on bare `console.log`.
- **Kanban writes are pre-authorized.** Edit `.agents/mpi-kanban/board.json` and `.agents/mpi-kanban/tasks/<id>/` freely through MPI workflows - never ask permission to add, move, or update entries.
- **Kanban cards MUST track their real state — MOVE them.** When you pick up a `todo` card, move it to `doing` (`maturity: in-progress`) BEFORE editing files; when the work ships/commits, move it to `done` (`maturity: complete`, `status: accepted`). A card with real work passes `todo → doing → done` — never leave it parked in `todo` while you ship. A move = update BOTH `board.json` columns AND `tasks/<id>/task.json` (`column` + `maturity` + `updated_at`) + a `task.moved` event in both event logs. Board is JSON (`todo`/`doing`/`done`) — read `<mpi-lib>/task-board-ops/mutate.md` (the JSON-board doc), NOT the legacy `kanban-ops/` Markdown doc.

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
**->** **MUST READ:** `.claude/rules/versioning.md`, then `docs/versioning.md`

### Project Data & Meta File System
If you need to understand how project.json, .meta/ files, project load/reconciliation, or history items work:
**->** **READ:** `docs/project-integrity.md`

### Download System
If you are working with resumable downloads, IPC/SSE download events, or the download manager:
**->** **MUST READ:** `.claude/rules/downloads.md`

### Portable Builds & Distribution
If you need to build, produce, or collect portable release artifacts (CI workflow, `scripts/build-portable.mjs`, output folders, exec-bit/symlink gotchas, the `D:\CubricStudio\Vision\Builds` distribution folder):
**->** **READ:** `docs/releases/portable-distribution-contract.md` (§ "Build Process"). The same doc holds the artifact contract (names, layout, manifests); `docs/releases/github-release-checklist.md` covers release copy.

### Builder Pod — Model Onboarding (cooperative sessions)
If you are in a cooperative session adding a model/workflow via the **Cubric Vision Builder** RunPod image (spin a Pod, install nodes/weights, author + test a ComfyUI workflow, save tuning research) — or you need locked research (LTX-2.3 tiers, LoRA strength law, prompt contract, model set):
**->** **READ FIRST:** `docs/builder/README.md` (the operational loop) and `docs/builder/research/README.md` (concluded findings — read before re-testing). This is the home for all builder-Pod workflow + research, and it lives in THIS repo. The **image build + install scripts only** live in the separate `mpi-ci` repo at `c:\AI\Mpi\mpi-ci\cubric-vision-builder\` (Dockerfile, `install_*.sh`, `start-builder.sh`, its `README.md`); edit that repo with `git -C`. To BUILD/PUSH the image itself, use the `build-pod-image` skill.

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
**->** **Important:** App runs on http://127.0.0.1:3000/ (browser is dev-only — some features broken in browser; Electron desktop is the ship target).

### Desktop Automation (Playwright + Electron)
If a bug may involve Electron-only behavior, desktop shell APIs, window controls, IPC, local app state, or anything that differs from browser dev mode:
**->** **Use:** `npm run test:desktop` to launch the real Electron app through Playwright.
**->** **Write tests in:** `tests/desktop/*.spec.js`.
**->** **Important:** Desktop tests set `CUBRIC_E2E_USER_DATA` so they do not modify the normal Electron user data directory. Keep tests focused on launch/navigation/UI checks unless the task explicitly requires downloads, installs, file deletion, or generation.
**->** **Port note:** the app server binds to `127.0.0.1:3000`; make sure no other Cubric Studio instance is already using that port before running desktop tests.

### Git and Commits
Agents MAY commit without asking. Shared tree — commit by explicit pathspec
(`git commit --only <paths>`), never `git add -A`/`git add .`. Push stays a
user-authorized live op (do not push unless asked). Docs-repo push block still
applies (see Multi-Root Workspace § DOCS WEBSITE PUSH BLOCK).
---

## MPI Skills

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
| App versioning system | `.claude/rules/versioning.md` | `## Sub-Agent Briefing` |
| Project data model | `docs/project-integrity.md` | No briefing section — provide context inline |
| Download system | `.claude/rules/downloads.md` | `## Sub-Agent Briefing` |
| **Stage UI baseline (merged)** | `docs/redesign/PORTING.md` (+ `PRODUCT.md`, `DESIGN.md`, `RECOLOR.md`) | Read these only when touching a *new* surface or doing a follow-up phase. For routine work, the live `styles/01_base.css` and `.claude/rules/components.md` (§ "Stage design baseline") are sufficient. |

---

## Stage UI baseline — `docs/redesign/`

The Stage redesign is **merged to master** (commit `e9b5eb6`, PORTING.md phases 0–10.2). Stage tokens, components, and patterns are now the live baseline; routine work follows the OKLCH tokens in `styles/01_base.css` and the rules in `.claude/rules/components.md` (§ "Stage design baseline") directly — no need to re-read the redesign docs for every change. The `docs/redesign/` folder remains the spec for any **new surface** or follow-up phase. Source of truth for the spec:

| File | Purpose |
|---|---|
| `docs/redesign/PRODUCT.md` | Persona, register, tone, anti-references. Read first. |
| `docs/redesign/DESIGN.md` | OKLCH tokens, type scale, component primitives, motion, banned patterns. **Token block here is the new `:root`.** |
| `docs/redesign/PORTING.md` | Phase-by-phase port plan with file-level mappings. Execute one phase at a time. |
| `docs/redesign/RECOLOR.md` | Photoshop hex-replace recipe for mascot + logo PNGs. |
| `docs/redesign/c-stage/*.html` | The five Stage mockups: `landing`, `gallery`, `editor`, `editor-video`, `popups`. **Visual ground truth.** |
| `docs/redesign/c-stage/tokens.css` | Stage tokens + primitive selectors (dropdowns, popups, menu, gauge, frame, etc.). Copy values, not class names. |
| `docs/redesign/_base.css` | Mockup base reset. Reference only — do not import into the app. |

### How to consume the redesign docs

1. Mockups are **spec**, not source. Do NOT copy markup verbatim. Translate visual intent into the app's existing patterns:
   - BEM (`.mpi-block__element--modifier`)
   - `ComponentFactory.create()`
   - `js/utils/dom.js` (`qs`, `qsa`, `gid`, `on`, `off`)
   - `js/utils/icons.js` (no raw SVG inline — register missing icons there first)
   - CSS variables only (no hardcoded hex). New variables go in `styles/01_base.css`.
   - `Events.on()` / `Events.emit()` for cross-component communication.
   - `Hotkeys.bind` with a `hotkeyRegistry.js` id (no raw `window.addEventListener('keydown')`).
2. Token swap (PORTING.md Phase 0) lands first. Replace the `:root` block in `styles/01_base.css` with the OKLCH block from `docs/redesign/DESIGN.md`. Map legacy variable names (`--bg`, `--neon-glow`, etc.) to the new tokens via compat aliases — see PORTING.md Phase 0.3.
3. Each phase ships in its own commit. After each phase: open the matching mockup at `docs/redesign/c-stage/<surface>.html` in a browser, run the app, visually diff. If they don't match in a way the spec doesn't cover, **ask before deviating**.
4. Do NOT modify any file under `docs/redesign/*.md` or `docs/redesign/c-stage/*` to "match implementation." The relationship is one-way: spec → code. If a real-app constraint forces a deviation, leave a `// REDESIGN-DEVIATION:` comment at the call site and note it in the PR description.
5. Mascot + logo PNGs ship recolored per `RECOLOR.md` (Photoshop pass at the source). Until that pass lands, mockups use the original blue PNGs with a CSS hue-rotate filter — **do not ship the filter to the app**, recolor at the source.

### When to (re-)read the redesign docs

For routine changes inside the merged Stage baseline (component tweaks, bug fixes, restyles using existing tokens), the redesign docs are NOT required reading — `.claude/rules/components.md` § "Stage design baseline", `.claude/rules/dos_and_donts.md`, and `styles/01_base.css` are the live source of truth.

Re-read the redesign docs **only** when:

- Building a brand-new surface that has a corresponding mockup in `docs/redesign/c-stage/`.
- Executing a follow-up phase (anything beyond 10.2) or a deviation from the Stage spec.
- Auditing existing UI against Stage intent.

In those cases, read in this order:

1. `docs/redesign/PRODUCT.md` (full)
2. `docs/redesign/DESIGN.md` (full)
3. `docs/redesign/PORTING.md` (full)
4. The mockup matching the surface you're about to touch
5. The "Critical Rules Snapshot" above
6. Any `.claude/rules/*.md` referenced by the routing table for the area you're modifying (components, events, state, etc.)

Confirm in your first message that you've read them. Then propose which phase or deviation, and wait for approval before writing code.

---

## Multi-Root Workspace

VS Code workspace contains 4 root folders. Cubric-Vision is **master** (this folder — has `.claude/`, kanban, jsconfig, CLAUDE.md). Other 3 are siblings under `c:\AI\Mpi\`:

| Folder | Purpose | Git |
|---|---|---|
| `c:\AI\Mpi\Cubric-Vision` | Main Electron app (master root) | yes |
| `c:\AI\Mpi\CubricStudio_Redesign` | Reference-only design source for Stage redesign and future ports | no (intentional) |
| `c:\AI\Mpi\Cubric Studio (Website)` | Public marketing website (single page) — needs new design ported | yes (separate repo) |
| `c:\AI\Mpi\Cubric Studio (Docs)` | Documentation website — needs new design ported | yes (separate repo) |

### Rules when working across roots

1. **Master kanban lives here only.** All cross-folder work is tracked in `.agents/mpi-kanban/board.json` with task workspaces under `.agents/mpi-kanban/tasks/<id>/`. Entries pointing at sibling folders MUST include absolute path in body.
2. **CLAUDE.md and `.claude/rules/` apply to Cubric-Vision only.** Sibling roots don't auto-load this file. When working in a sibling folder, brief sub-agents manually with relevant rules.
3. **Use absolute paths** in tool calls (`Read`, `Glob`, `Grep`, `Edit`) when targeting sibling folders. Relative paths resolve against Cubric-Vision.
4. **Sibling git repos are separate.** Never run `git` from Cubric-Vision against sibling paths — `cd` into the sibling first or use `-C <path>`.
5. **Design source of truth for sibling websites:** `c:\AI\Mpi\CubricStudio_Redesign\` (no git, edit freely as design playground). Apply final design to Website/Docs repos.
6. **DOCS WEBSITE PUSH BLOCK (hard rule):** Never run `git push` (or any equivalent) in `c:\AI\Mpi\Cubric Studio (Docs)`. Production GitHub Pages currently serves the coming-soon `index.html` from a previous deploy; the local working tree has the full docs shell as `index.html` and the coming-soon page parked as `index-soon.html`. Pushing local `main` would replace the live coming-soon page with the unfinished docs shell. If the user asks to push the docs repo, refuse and explain: the docs site is not ready, work is local-only, and the swap (`index.html` ↔ `index-soon.html`) must happen first. Local dev/test only. This block is lifted only when the user explicitly says the docs site is ready to ship.

---
