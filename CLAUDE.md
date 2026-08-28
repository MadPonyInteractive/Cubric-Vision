# Master Agent Context Rules

> **AI SYSTEM INSTRUCTION:** This file ROUTES — no knowledge of its own. Read the target before the task. **Two maps route everything:** `docs/README.md` (subsystems) and `.claude/rules/README.md` (conventions); the Router below carries only what they cannot.

## THE CARDINAL RULES

1. **NEVER assume architectural patterns.** Route, read the target, then code.
2. **The answer is probably already documented.** Check `docs/README.md`, `.claude/rules/README.md`, `docs/PROJECT.md` BEFORE searching the codebase. **There is NO catch-all gotchas file and none may be created** — durable facts go in the subsystem doc (≤200 lines), cross-cutting conventions in `dos_and_donts.md`. Verify a named symbol still exists before trusting a doc entry.
3. **Use existing utilities and systems.**
4. **FIX THE ROOT CAUSE — NEVER SYMPTOM-PATCH.** A guard clause / try-catch / timeout at the crash site that hides the symptom is a **FALSE DONE** and will be rejected. Cannot explain WHY it happens = you have not found it. Shared primitive → fix EVERY call site in one pass; dual-engine code → BOTH twins. Real fix needs a refactor → STOP and brief the user. **Read `.claude/rules/root-cause.md` before any fix.**
5. **DOC DRIFT:** at session end, if the code added a workspace or changed component wiring (events, props, state, comfy injection), ask *"Should I update `.claude/rules/`?"* — **never edit the rule files without explicit permission.**

## Critical Rules Snapshot (ALL agents, always — no file read required)

- **Colors:** CSS vars from `styles/01_base.css`. **Icons:** `js/utils/icons.js`, never raw SVG. **Logging:** `js/services/clientLogger.js` (front) / `routes/logger.js` (back), never bare `console.log`.
- **DOM:** `qs`/`qsa`/`gid` from `js/utils/dom.js`. **Listeners:** `on()`/`off()` from the same, never raw `addEventListener` (exception: inside `destroy()`). **Hotkeys:** `Hotkeys.bind`/`unbind` with an id from `hotkeyRegistry.js`, never raw `keydown`.
- **State:** all global state in `js/state.js` — a Proxy, so mutation auto-fires `state:changed`; never emit it manually, and never mutate sub-objects: replace the top-level key.
- **BEM is mandatory:** `.mpi-block__element--modifier`. No exceptions.
- **EVERY UI ELEMENT IS A COMPONENT** — never a bare `<input>`/`<select>`/`<textarea>`/`<button>`. Nothing covers the use → create one. Flows are no exception: a Flow's `fields` NAME these components, they do not replace them.
- **Components:** always `ComponentFactory.create()`; NEVER modify `js/components/factory.js` (locked); a new one registers its `.css` in `js/shell/preloadStyles.js` and its props in `js/components/types.js`.
- **Comms:** `Events.on()`/`emit()`; store and call the returned unsubscribe on cleanup. **Teardown:** navigation MUST call `instance.destroy()` before clearing a mounted Block (never `innerHTML = ''`); any `setup` adding a listener or Observer MUST define `el.destroy()`.
- **project.json writes:** server routes MUST use `updateProjectJson()` (`routes/projects.js`), never direct `fs.writeJson`.
- **Mask / paint layers are UNDOABLE:** code mutating `manualCanvas`/`subtractCanvas`/a paint layer MUST record an `UndoStack` entry first (`undo.begin()`/`commit(rect)` or `mask._recordUndo()`). Unwired = a silent hole in Ctrl+Z.
- **NEVER take the user's app — spin your own: `npm run app:isolated`.** `:3000` is their live session: do not curl, drive, restart or close it. Yours needs its OWN profile AND port or it dies at ~2.3s, exit 0, no window, on the `userData` lock — not a bug to chase (`docs/testing.md`).
- **Kanban cards MUST track real state — MOVE them:** `todo → doing` BEFORE editing files, `doing → done` when it ships; a `todo → doing` move MUST also write `tasks/<id>/files.json` (only you can — ownership is never inferable later). Exact shape: `.claude/rules/kanban.md`.
- **The plugin enforces the rest:** `guard-card` (no card in `doing` = no code edit), `guard-claim` (a live peer's path), `guard-git` (`checkout --`/`restore`/`stash`/`reset --hard`/`clean`).

## Context Router

**Every subsystem, component, event, state and workflow-authoring topic is routed by `docs/README.md` and `.claude/rules/README.md` — go there first.** This table carries only what those maps cannot.

| Task | Read first |
|---|---|
| **Driving the RUNNING app over HTTP** — projects, media, dispatch, engine/pod control, recovering a prompt from a sidecar | `.claude/skills/cubric-vision/SKILL.md`, then `docs/generation-lifecycle.md` § "the THIRD producer". A submit runs in whatever project the app has OPEN — `/connector/open-project` first |
| **Removing** a model/tier, or deprecating ONE op | `docs/playbooks/add-model/README.md` § "Removing or re-tiering". **Do NOT delete the dep entry** — the orphan sweep reads `DEPS`, so deleting it strands the weight on users' disks forever |
| Product Pod runtime (`wrapper/wrapper.py`, `start.sh`) | `docs/runpod-remote-engine.md` § 5. **NOT an image rebuild** — edit → `./publish-runtime.sh dev` → restart Pod → test → `promote`. **NEVER `publish-runtime.sh stable`**: it lands untested on released users |
| Debugging a live app bug | `docs/DEVELOPMENT.md` § Reading `logs/app.log` — filter by `[category]`, never read it whole. **Every Electron run, dev included, logs to `%APPDATA%\Cubric Vision\logs\app.log`**; the repo's `logs/` holds only test harnesses |
| Browser automation | `playwright-cli` via **Bash**, never the Skill tool (`disable-model-invocation`). `eval` wraps its arg as `() => (EXPR)`, so multi-statement JS must be an IIFE **on ONE line**. Point it at your own instance, never `:3000` |
| VPN / CivitAI region block / a suspicious timestamp | `docs/vpn-and-clock.md` — **check the clock before blaming the VPN**; the reflex is wrong more often than right |
| Working in a sibling repo under `c:\AI\Mpi\` | `.claude/rules/sibling-repos.md` — incl. the hard no-push block on Cubric Studio (Docs) |

### Procedures — RUN THE SKILL (it enforces the playbook)

| Task | Skill | Playbook |
|---|---|---|
| Bump the SHIPPED engine, or "test all the models" | `/mpi-bump-engine` | `docs/playbooks/bump-engine/`. **NOT `/mpi-bump-local-comfy`** (the `G:\ComfyUi` bench — never reaches a user). Runner `scripts/smoke-workflows.mjs`, `--plan` first: it spends nothing. `release:check` refuses a bumped engine with no `smoke-evidence.json` |
| Change a node in `ComfyUi-MpiNodes`, or the pin drifted | `/mpi-nodes-sync` | The SIBLING repo owns the procedures (`c:\AI\Mpi\ComfyUi-MpiNodes\.claude\commands\`) and they do NOT load here — READ them, follow inline. A node ships only **committed → pushed → pinned** in `dev_configs/node_lock.json` |

`/mpi-add-model` (`docs/playbooks/add-model/` — every known trap; models are NOT version-bumped), `/mpi-add-flow`, `/mpi-flow-graphics` each enforce their own playbook. The rest of the MPI workflow ships as the **Mpi-Kanban plugin** and describes itself in the skill list — `/mpi-handoff` switches sessions mid-job (card stays in `doing`); `/mpi-end-session` is close-out for FINISHED work only.

## Sub-Agent Dispatch (MANDATORY before EVERY dispatch)

Sub-agents start cold with zero CLAUDE.md context. Dispatching without briefing = broken sub-agent.

1. **`/mpi-brief-rule <name>`** for each rule file the task touches.
2. **Paste in:** the briefing(s) + the Critical Rules Snapshot + `.claude/rules/root-cause.md` § Sub-Agent Briefing. No briefing section in a rule → the Snapshot at minimum. Debugging → the `logs/app.log` tail directly.
3. **Name its OWNERSHIP** — the exact files it may edit. A file outside that list = file one `mpi-message` and STOP that line of work; never edit or negotiate.

## Git and Commits

Agents MAY commit and push without asking (`push_policy: auto` in `.agents/mpi-kanban/project-profile.md` is the source of truth). Shared tree — commit by explicit pathspec (`git commit --only <paths>`), never `git add -A`/`.`. Full recipe + the destructive-git ban: **`.claude/rules/git.md`**. `.husky/pre-push` refuses master while its last CI run is RED (`--no-verify` when you ARE the fix); it fails OPEN, so a block means a real `failure`.
