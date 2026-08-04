# Master Agent Context Rules

> **AI SYSTEM INSTRUCTION:** This file ROUTES — it holds no knowledge of its own. Knowledge lives in `docs/` (map: `docs/README.md`) and `.claude/rules/`. Before any task: match it in the Context Router below and READ the target file(s) first. Do not re-document here what a target file already holds.

## THE CARDINAL RULES

1. **NEVER assume architectural patterns.** Route below, read the target, then code.
2. **The answer is probably already documented.** `docs/README.md` = knowledge map (routes every domain to its subsystem doc); `.claude/rules/README.md` = rules routing index; `docs/PROJECT.md` = architecture orientation. Check these BEFORE searching the codebase. **There is NO catch-all gotchas/dump file and none may be created** — every durable fact lives in its subsystem doc (≤200 lines each; exemptions in `docs/README.md`); cross-cutting conventions live in `.claude/rules/dos_and_donts.md`. Verify a named file/function/flag still exists before relying on a doc entry.
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
- **Mask / paint layers are UNDOABLE:** any new code that mutates `manualCanvas` / `subtractCanvas` (or a future paint layer) MUST record an `UndoStack` entry before mutating — a gesture via `undo.begin()`/`commit(rect)`, a one-shot op via `mask._recordUndo()`. An unwired mutation is a silent hole in Ctrl+Z. Read `docs/masking-undo.md` first.
- **Logging:** frontend `js/services/clientLogger.js`, backend `routes/logger.js` — never bare `console.log`.
- **Kanban writes are pre-authorized** — edit `.agents/mpi-kanban/board.json` + `tasks/<id>/` freely; never ask.
- **Kanban cards MUST track real state — MOVE them:** `todo → doing` BEFORE editing files, `doing → done` when the work ships. A move = update BOTH `board.json` columns AND `tasks/<id>/task.json` (`column` + `maturity` + `updated_at`) + a `task.moved` event in both event logs. Board is JSON — read `<mpi-lib>/task-board-ops/mutate.md` + `.claude/rules/kanban.md`, NOT the legacy `kanban-ops/` Markdown doc.

---

## VPN + the skewed clock (read BEFORE asking for the VPN)

CivitAI **region-blocks the UK**, so anything that hits `civitai.com` from this
machine — the SHA256 licence lookups in `docs/models/klein/licences.md`, a
community LoRA page, a shared workflow JSON — needs **Fabio's VPN on: ask, wait,
then run**, and tell him when you're done so he can turn it off. Agent
`WebFetch`/`WebSearch` can never reach CivitAI (Anthropic-side egress, also UK);
only shell tools go through his VPN. The block reads as intermittent — the
licence method worked bare on 2026-07-26 and needed the VPN on 2026-07-27 — so
check for `REGION_BLOCKED` before concluding an API changed.

**The VPN also skews the system clock, and that is the part that corrupts
files.** Measured 2026-07-29 in a sibling repo: `date -u` read `01:30Z` while the
true time was `15:29Z` — ~14 hours off, inside one session. While the VPN is on,
`date`, the session's "today", file mtimes and `git commit` timestamps are all
untrustworthy.

- **Ground truth is `gh api rate_limit -i` → the `Date:` header** — GitHub's
  clock, unaffected by this machine.
- Derive the offset **once** at the start of a VPN session and apply it to every
  stamp that lands in a file: kanban `created_at` / `updated_at`, event `at`,
  doc dates, research dates. Don't re-derive per write.
- A 14h skew keeps the same calendar date only by luck — near midnight it flips
  the **date**, which is what silently corrupts a card.

**Second VPN cost, measured 2026-07-27 (MPI-354):** it throttled an R2 upload
**~15x** (4.4 MiB/s → ~300 KiB/s). Do the CivitAI half with the VPN on, then have
it turned off before staging weights to R2.

---

## Context Router — READ the target BEFORE the matching task

| Task | Read first |
|---|---|
| **Any code at all** (baseline — universal CSS/icon/utility/logging/import rules) | `.claude/rules/dos_and_donts.md` |
| Components / UI (build, move, style, debug) | `.claude/rules/components.md`; per-component fine print (PromptBox/Toast/Popup/Input/StylePicker…) → `docs/component-contracts.md` |
| Generation lifecycle (dispatch, Stop/cancel, lanes, queue drain, progress bar) | `docs/generation-lifecycle.md` |
| Gallery (cards, thumbnails, selection, drag-drop, hover media) | `docs/gallery.md` |
| Masking (layer model, overlay draw, mask storage) | `docs/masking.md` |
| Canvas tool family (adding/changing a canvas tool, **the preview contract**, Add/Subtract, PromptBox contract) | `docs/masking-tools.md` |
| SAM3 masking (click-point + open-vocabulary text tools, their graph branches, the `name:N` trap) | `docs/masking-sam3.md` |
| Shape gizmo (rect/triangle/ellipse, ONE gizmo under the mask AND paint mounts, handles + Shift/ALT, shape-local hit-testing) | `docs/masking-shapes.md` |
| Adjust (grow / shrink / edge band off one distance field, why it is not a blur, **Fill Holes** and its opt-in composite flag) | `docs/masking-adjust.md` |
| Canvas undo / redo (the shared command stack — any code that MUTATES a mask or paint layer) | `docs/masking-undo.md` |
| Painting (the RGBA paint layer, the shared brush dab, per-entry paint persistence, Apply's server-side flatten) | `docs/painting.md` |
| Composite (the two front ends, the SCRATCH cut, the inverted brush meaning, cover-fit on client AND server, pasted slots) | `docs/composite.md` |
| Crop (resolution types, cropping past the image edge, snapping, pad-then-extract) | `docs/crop.md` |
| Model Library UI (install-state display, tile patching, featured) | `docs/model-library.md` |
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
| Product Pod runtime (`wrapper/wrapper.py`, `start.sh` in `c:\AI\Mpi\mpi-ci\cubric-vision-pod\`) | `c:\AI\Mpi\mpi-ci\cubric-vision-pod\README.md` § "Runtime externalize" + `docs/runpod-remote-engine.md` § 5. **NOT an image rebuild** — R2-floated on TWO channels (MPI-340): edit → `./publish-runtime.sh dev` → restart Pod → test → `./publish-runtime.sh promote` (dev bytes → stable = released users). A dev app run boots `dev`; released builds only ever boot `stable`. NEVER `publish-runtime.sh stable` for day-to-day work — it lands untested on released users. Rebuild only for truly-baked layers |
| Debugging / crashes / python engine issues | `docs/DEVELOPMENT.md` § Reading `logs/app.log` — **filter by `[category]`, never read the file whole**. **Any Electron run (dev too) logs to `%APPDATA%\Cubric Vision\logs\app.log`** — `main.js` sets `APP_USER_DATA` on itself (MPI-418). The repo's `logs/` only collects processes started WITHOUT it, i.e. test harnesses; reading it while chasing a live app bug shows you nothing |
| Running the node test suite | `docs/testing.md` — `npm test` (or `node --test "tests/*.test.cjs"`, quoted glob). The directory form `node --test tests/` DIES on Node v24 (`Cannot find module '...\tests'`) |
| Kanban cards / board / agent messages | `.claude/rules/kanban.md` (schema traps, backslash trap, ASCII messages) |
| Committing (shared tree, co-owned files) | `.claude/rules/git.md` |
| Browser automation | `playwright-cli`, run via **Bash** (`npx playwright-cli open <url>` / `goto` / `click eN` / `eval` / `close`) — the skill is `disable-model-invocation: true`, so it CANNOT be called with the Skill tool. `eval` wraps its arg as `() => (EXPR)`, so multi-statement JS must be an IIFE. App at http://127.0.0.1:3000/ (browser = dev-only, some features broken; Electron desktop = ship target) |
| Desktop (Electron-only) testing / writing a UI smoke spec | `docs/testing.md` — `npm run test:desktop`; tests in `tests/desktop/*.spec.js`; new specs use `tests/desktop/launch.js`; uses `CUBRIC_E2E_USER_DATA` (real user data untouched); **port 3000 must be free first** or the spec silently drives the already-running server. Both suites GATE the release (`mpi-version-bump` step 6) |

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

## Sibling repos — access WITHOUT loading their config

Cubric-Vision is **master** (this folder — has `.claude/`, kanban, jsconfig, CLAUDE.md). The siblings under `c:\AI\Mpi\` — `Cubric-Studio`, `MadPony-Identity`, `mpi-ci`, `Cubric-Prompt`, `Cubric Studio Brand Assets` — are reachable via `permissions.additionalDirectories` in `.claude/settings.json`, **deliberately NOT VS Code workspace folders.** Related on-disk siblings in neither list: `CubricStudio_Redesign` (design playground, intentionally no git), `Cubric Studio (Website)` and `Cubric Studio (Docs)` (separate repos).

**Why, and do not undo it:** a workspace folder behaves as `--add-dir`, which also loads that repo's `.claude/skills/`, `.claude/agents/` and its settings' `enabledPlugins` / `extraKnownMarketplaces`. Measured 2026-07-29 in the reverse direction: a Cubric-Prompt session holding this repo as a workspace folder was running **10 Vision skills + 4 Vision commands**, plus MadPony-Identity's rival `mpi-end` and Vision's `enabledPlugins`. `permissions.additionalDirectories` grants the same read/edit access with **none** of that config loading. So: **never re-add the siblings to `Cubric-Vision.code-workspace`, and never `/add-dir` them mid-session.** Expect a workspace-trust dialog on first start — declining it leaves the grant inert. Related trap: skill name collisions resolve **enterprise > personal > project**, so `mpi-end` must never go in `~/.claude/skills/` — it would override every repo's own copy.

**The two halves propagate differently.** `Cubric-Vision.code-workspace` is **gitignored** (`.gitignore:63`), so stripping the folders is a local-only edit that a fresh clone or a second machine will not inherit. `.claude/settings.json` **is** committed, so the grant travels. If the siblings reappear in the workspace, this is why.

### Rules when working across roots

1. **Master kanban lives here only.** Cross-folder work tracked in `.agents/mpi-kanban/`; entries pointing at sibling folders MUST include the absolute path in the body.
2. **CLAUDE.md + `.claude/rules/` auto-load for Cubric-Vision only.** Working in a sibling = brief sub-agents manually with the relevant rules.
3. **Absolute paths** in tool calls targeting siblings — relative paths resolve against Cubric-Vision.
4. **Sibling git repos are separate.** Never run `git` from Cubric-Vision against sibling paths — use `git -C <path>` or `cd` first.
5. **Design source of truth for the Website/Docs sites:** `c:\AI\Mpi\CubricStudio_Redesign\` (edit freely as playground; apply final design to the Website/Docs repos).
6. **DOCS WEBSITE PUSH BLOCK (hard rule):** Never run `git push` (or any equivalent) in `c:\AI\Mpi\Cubric Studio (Docs)`. **The block still stands — but its original reason no longer holds, so do not repeat that reason.** Production now serves the REAL Vision docs (sidebar, Installation / Getting Started / Settings, embedded videos), verified live 2026-07-30 — not the coming-soon page the rule was first written around. What the block protects now is simply that the local tree can be ahead of, behind, or divergent from what is deployed, and nobody has confirmed which. If asked to push: refuse, explain that the live site is real and a push could regress it, and ask the user to confirm the local tree is the intended deploy. Lifted only when the user explicitly says so.

---

## Git and Commits

Agents MAY commit without asking. Shared tree — commit by explicit pathspec (`git commit --only <paths>`), never `git add -A`/`git add .` (full co-owned-file recipe: `.claude/rules/git.md`). Push stays a user-authorized live op (do not push unless asked). Docs-repo push block above still applies.
