# Master Agent Context Rules

> **AI SYSTEM INSTRUCTION:** This file ROUTES — it holds no knowledge of its own. Knowledge lives in `docs/` (map: `docs/README.md`) and `.claude/rules/`. Before any task: match it in the Context Router below and READ the target file(s) first. Do not re-document here what a target file already holds.

## THE CARDINAL RULES

1. **NEVER assume architectural patterns.** Route below, read the target, then code.
2. **The answer is probably already documented.** `docs/README.md` = knowledge map (routes every domain to its subsystem doc); `docs/PROJECT.md` = architecture orientation. Check these BEFORE searching the codebase. `docs/gotchas.md` holds ONLY cross-cutting conventions + temporary/unverified flags — durable knowledge goes to its subsystem doc (≤200 lines each; exemptions in `docs/README.md`). Verify a named file/function/flag still exists before relying on a doc entry.
3. **Use existing utilities and systems.** If a utility or pattern already exists, use it.
4. **FIX THE ROOT CAUSE — NEVER SYMPTOM-PATCH.** See THE ROOT-CAUSE RULE below. Non-negotiable.
5. **DOCUMENTATION DRIFT:** at the end of ANY session where code was written, if a new workspace was introduced or component wiring (events, props, state, ComfyUI injection) changed, ask the user: *"Should I update `.claude/rules/` to reflect these changes?"* **Do NOT update the architectural rule files without explicit permission.**

---

## THE ROOT-CAUSE RULE (every fix, every agent — no exceptions)

**Symptom-patching is forbidden.** The path of least resistance — a guard clause, a special case, a try/catch, a timeout at the crash site — is how this repo's worst regressions were born. A fix that silences the symptom without touching the cause is a **false done** and will be rejected.

Before ANY fix:

1. **Diagnose to the actual root.** Trace the failure to its origin — not to the first line where a check makes the error disappear. If you cannot explain WHY the bug happens, you have not found it yet.
2. **Map what's in place first.** Read the subsystem doc (`docs/README.md` routes it) and understand the existing design before changing it. The correct fix usually already has a home — a resolver, a store, a queue — that the buggy code bypassed.
3. **Sweep the blast radius.** Touching a shared primitive (resolver / filter / store / util) = grep EVERY consumer/call site, classify each, fix all in one pass. Dual-engine code = fix BOTH the local AND remote twins. A one-consumer fix on a shared primitive is a false done.
4. **Prefer the structural fix — even a section refactor — over a local patch.** If the root fix means refactoring a section of the app: STOP and brief the user first (root cause, consumers affected, proposed refactor, why a patch would be wrong), then proceed on their go. Never quietly ship the band-aid because the refactor felt too big.
5. **Prove it.** Verify at every affected call site, not just the reported symptom. On version/dependency bumps that break things: research ALL breaking surfaces first, then fix in one coherent pass — never patch one symptom at a time.

Standing lessons behind this rule: `.claude/rules/comfy_engine.md` § Engine Split (the "half-wire" bugs), memory `feedback_engine_split_sweep_all_consumers`, `feedback_check_both_engine_paths`, `feedback_research_first_on_version_breaks`.

---

## Critical Rules Snapshot (applies to ALL agents, always — no file read required)

- **Colors:** CSS variables from `styles/01_base.css` only — never hardcode.
- **Icons:** `js/utils/icons.js` only — never paste raw SVG; add missing icons there first.
- **DOM queries:** `qs` / `qsa` / `gid` from `js/utils/dom.js` — never raw `document.querySelector`.
- **Listeners:** `on()` / `off()` from `js/utils/dom.js` in components — never raw `addEventListener`/`removeEventListener` (exception: inside `destroy()`).
- **State:** all global state lives in `js/state.js` (a Proxy — mutation auto-fires `state:changed`; never emit it manually). Never mutate sub-objects — replace the top-level key: `state.currentProject = { ...state.currentProject, itemGroups: [...] }`.
- **Hotkeys:** `Hotkeys.bind` / `Hotkeys.unbind` with a registry id from `hotkeyRegistry.js` — never raw `window.addEventListener('keydown')`.
- **BEM is mandatory:** `.mpi-block__element--modifier`. No exceptions.
- **Components:** always `ComponentFactory.create()`; NEVER modify `js/components/factory.js` (locked); every new component registers its `.css` in `js/shell/preloadStyles.js` AND documents its props in `js/components/types.js`.
- **Cross-component communication:** `Events.on()` / `Events.emit()`; always store and call the returned unsubscribe on cleanup.
- **Teardown:** navigation MUST call `instance.destroy()` before clearing a mounted Block (never `innerHTML = ''` alone); any `setup` that calls `Events.on(...)`, `window.addEventListener(...)`, or creates an Observer MUST define `el.destroy()` cleaning them up (collect in `const _unsubs = []`). See `.claude/rules/components.md` § Observer Lifecycle & Teardown Contract.
- **project.json writes:** server routes MUST use `updateProjectJson()` in `routes/projects.js` (per-file queued atomic writes) — never direct `fs.writeJson`.
- **Logging:** frontend `js/services/clientLogger.js`, backend `routes/logger.js` — never bare `console.log`.
- **Kanban writes are pre-authorized** — edit `.agents/mpi-kanban/board.json` + `tasks/<id>/` freely; never ask.
- **Kanban cards MUST track real state — MOVE them:** `todo → doing` BEFORE editing files, `doing → done` when the work ships. A move = update BOTH `board.json` columns AND `tasks/<id>/task.json` (`column` + `maturity` + `updated_at`) + a `task.moved` event in both event logs. Board is JSON — read `<mpi-lib>/task-board-ops/mutate.md`, NOT the legacy `kanban-ops/` Markdown doc.

---

## Context Router — READ the target BEFORE the matching task

| Task | Read first |
|---|---|
| **Any code at all** (baseline — universal CSS/icon/utility rules) | `.claude/rules/dos_and_donts.md` |
| Components / UI (build, move, style, debug) | `.claude/rules/components.md` |
| Events & cross-component communication | `.claude/rules/events.md` |
| Application state | `.claude/rules/state.md` |
| Workspaces / routing / dev component gallery | `.claude/rules/workspaces.md` |
| ComfyUI injection (send tasks, compile JSON, images/masks in graphs) | `.claude/rules/comfy_injection.md` |
| Workflow authoring / injectable nodes & controls / MpiNodes / tier selectors (model OR app) | `docs/workflow-authoring/README.md` — append what you learn there |
| ComfyUI engine & backend (model registry, downloads, python server) | `.claude/rules/comfy_engine.md` |
| App versioning (APP/SCHEMA/COMFY, operation registry) | `.claude/rules/versioning.md`, then `docs/versioning.md` |
| Project data (project.json, `.meta/`, load/reconciliation, history items) | `docs/project-integrity.md` |
| Download system (resumable downloads, IPC/SSE events) | `.claude/rules/downloads.md` |
| Component maps: who mounts / event wiring / state keys / comfy injection | `.claude/rules/component-mounts.md` / `component-events.md` / `component-state.md` / `component-comfy.md` |
| Shell services (Overlays, Hotkeys, StatusBar) | `docs/shell.md` |
| Stage UI / redesign | `styles/01_base.css` tokens + `.claude/rules/components.md` § "Stage design baseline". Redesign docs ONLY for a new surface / follow-up phase / Stage audit → `docs/README.md` § Redesign spec |
| Portable builds & distribution | `docs/releases/portable-distribution-contract.md` § "Build Process" (artifact contract in same doc; release copy → `docs/releases/github-release-checklist.md`) |
| Cloudflare R2 (upload/list/verify weights, builds, pod-runtime files) | `c:\AI\Mpi\MadPony-Identity\capabilities\cloudflare-r2\README.md` |
| Builder Pod sessions (spin Pod, install nodes/weights, author + test workflows) + locked research | `docs/builder/README.md` + `docs/builder/research/README.md` (read before re-testing). Image build/install scripts live ONLY in `c:\AI\Mpi\mpi-ci\cubric-vision-builder\` (`git -C`); build/push the image = `build-pod-image` skill |
| Product Pod runtime (`wrapper/wrapper.py`, `start.sh` in `c:\AI\Mpi\mpi-ci\cubric-vision-pod\`) | `c:\AI\Mpi\mpi-ci\cubric-vision-pod\README.md` § "Runtime externalize" + `docs/runpod-remote-engine.md` § 5. **NOT an image rebuild** — R2-floated: edit → `./publish-runtime.sh stable` → restart Pod. Rebuild only for truly-baked layers |
| Debugging / crashes / python engine issues | Last 50–100 lines of `logs/app.log` (`Read` with offset — NEVER the whole file) |
| Browser automation | `playwright-cli` skill; app at http://127.0.0.1:3000/ (browser = dev-only, some features broken; Electron desktop = ship target) |
| Desktop (Electron-only) testing | `npm run test:desktop`; tests in `tests/desktop/*.spec.js`; uses `CUBRIC_E2E_USER_DATA` (real user data untouched); port 3000 must be free first |

### Procedures — RUN THE SKILL (it enforces the playbook)

| Task | Skill | Playbook (the skill's step 0 — non-negotiable) |
|---|---|---|
| Wire a NEW model end-to-end | `/mpi-add-model` | `docs/playbooks/add-model/` (README hub + `01`–`06`) — holds every known trap. Models are NOT version-bumped. A handoff or `docs/models/<model>/` doc ASSUMES the playbook — read both |
| Wire a NEW App (dev-gated App-Library outcome app — NOT a model) | `/mpi-add-app` | `docs/playbooks/add-app/` (README hub + `01`–`05`). Worked examples: Video Stitch, SDXL 4K, Image Regen |

---

## MPI Skills

Human-in-the-loop execution system. **Core principle:** parallel sub-agents only in planning; execution is sequential, one to-do at a time, with a mandatory brief gate before any code.

| Command | Purpose |
| --- | --- |
| `/mpi-brainstorm` | Explore an idea collaboratively, write a spec |
| `/mpi-create-plan` | Compact plan for a well-scoped task |
| `/mpi-create-large-plan` | Investigation-backed large plan with parallel research sub-agents |
| `/mpi-continue` | Resume active work, show/read a board card, or update card state |
| `/mpi-execute-parallel` | Parallel batch execution from a large plan |
| `/mpi-handoff` | Structured handoff doc when context is getting large |
| `/mpi-init` | Initialize MPI workflow for a new project or session |
| `/mpi-end` | Session close-out — sync, commit touched files, close validated work |
| `/mpi-component-audit` | ESLint audit of `js/components/` — report only, no fixes |
| `/mpi-brief-rule` | Return a rule file's Sub-Agent Briefing for dispatch |
| `/mpi-add-model` | Wire a NEW model (enforces `docs/playbooks/add-model/`) |
| `/mpi-add-app` | Wire a NEW App (enforces `docs/playbooks/add-app/`) |

---

## Sub-Agent Dispatch (MANDATORY before EVERY dispatch)

Sub-agents start cold with zero CLAUDE.md context. Dispatching without briefing = broken sub-agent.

1. **Run `/mpi-brief-rule <name>`** for each rule file the task touches (same routing as the Context Router; it returns that rule's `## Sub-Agent Briefing` verbatim).
2. **Paste into the sub-agent prompt:** the briefing(s) + the Critical Rules Snapshot + THE ROOT-CAUSE RULE.

**No exceptions.** If a rule has no briefing section, paste the Snapshot at minimum. Special cases: debugging → paste the `logs/app.log` tail directly; `docs/project-integrity.md` has no briefing → provide context inline.

---

## Multi-Root Workspace

Cubric-Vision is **master** (this folder — has `.claude/`, kanban, jsconfig, CLAUDE.md). VS Code workspace roots (`Cubric-Vision.code-workspace`): this folder + siblings under `c:\AI\Mpi\` — `Cubric-Studio`, `MadPony-Identity`, `mpi-ci`, `Cubric-Prompt`, `Cubric Studio Brand Assets`. Related on-disk siblings NOT in the workspace: `CubricStudio_Redesign` (design playground, intentionally no git), `Cubric Studio (Website)` and `Cubric Studio (Docs)` (separate repos).

### Rules when working across roots

1. **Master kanban lives here only.** Cross-folder work tracked in `.agents/mpi-kanban/`; entries pointing at sibling folders MUST include the absolute path in the body.
2. **CLAUDE.md + `.claude/rules/` auto-load for Cubric-Vision only.** Working in a sibling = brief sub-agents manually with the relevant rules.
3. **Absolute paths** in tool calls targeting siblings — relative paths resolve against Cubric-Vision.
4. **Sibling git repos are separate.** Never run `git` from Cubric-Vision against sibling paths — use `git -C <path>` or `cd` first.
5. **Design source of truth for the Website/Docs sites:** `c:\AI\Mpi\CubricStudio_Redesign\` (edit freely as playground; apply final design to the Website/Docs repos).
6. **DOCS WEBSITE PUSH BLOCK (hard rule):** Never run `git push` (or any equivalent) in `c:\AI\Mpi\Cubric Studio (Docs)`. Production GitHub Pages serves the coming-soon `index.html` from a previous deploy; the local tree has the unfinished docs shell as `index.html` (coming-soon parked as `index-soon.html`). Pushing would replace the live coming-soon page with the unfinished shell. If asked to push: refuse, explain, and note the `index.html` ↔ `index-soon.html` swap must happen first. Lifted only when the user explicitly says the docs site is ready to ship.

---

## Git and Commits

Agents MAY commit without asking. Shared tree — commit by explicit pathspec (`git commit --only <paths>`), never `git add -A`/`git add .` (full co-owned-file recipe: `docs/gotchas.md` § commit hygiene). Push stays a user-authorized live op (do not push unless asked). Docs-repo push block above still applies.
