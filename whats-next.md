# MpiAiSuite — Documentation Structure Plan Handoff

> **⚠️ NEXT AGENT: Read this entire file before doing anything. The plan is at `docs/superpowers/plans/2026-04-11-documentation-structure.md`. Do NOT write any code until you have a user-approved plan.**

---

## Original Task

The user requested a **planning session** (not execution) to design the documentation structure for MpiAiSuite before any implementation. This was prompted by a prior onboarding session (Session 1) that documented ~60-70% of the codebase but produced no documentation artifacts. The goal was to establish a shared documentation structure so future agents can orient quickly.

---

## Work Completed

### Session: Planning the Documentation Structure (Session 2 of N)

**Files created:**

- `docs/superpowers/plans/2026-04-11-documentation-structure.md` — The full implementation plan, revised after brainstorming with the user. Contains 4 tasks (Task 0: CLAUDE.md drift reminder, Task 1: hub doc, Task 2: 8 subsystem docs, Task 3: rule briefing tightens).

**Files modified:**

- None yet — this was a planning session only, no execution.

**Actions taken:**

1. Read `whats-next.md` from prior session to understand context and what was already read/noted.
2. Invoked `superpowers:writing-plans` skill to create an initial plan.
3. Brainstormed extensively with the user about the plan structure, then refined it based on user feedback.

**Key decisions made (in order):**

1. **Scope cut:** User said only the Documentation Structure plan, not the Model UI & Installation State plan. Model UI work deferred to a future session.

2. **Folder vs flat files:** User said if a subsystem only has one file, use a flat file (e.g. `docs/projects.md` not `docs/projects/README.md`). Keeps depth manageable. Applied to all 8 subsystem docs.

3. **docs/utils.md added:** Utilities were being completely ignored by agents. `dom.js` is the most critical — agents consistently use `qs()` but leave `qsAll()`, `on()`, `ready()`, `createElement()`, `attr()`, `remove()` behind, causing refactoring work. `docs/utils.md` covers all `js/utils/` files with a table for `dom.js` specifically.

4. **docs/events.md added as standalone:** User noted events are used across the entire app — not just UI components. Backend (`comfy:ready`, `comfy:error`), project lifecycle (`project:changed`), tool state (`tool:running`, `tool:idle`), navigation (`nav:tool`). A standalone `docs/events.md` is warranted, not just referenced from `docs/components.md`.

5. **Icons and ratios in utils.md, not their own docs:** User asked where icons and ratios docs should live. Decision: keep them in `docs/utils.md` alongside `dom.js`, `seed.js`, etc. One authoritative utility doc, referenced from everywhere that needs it.

6. **Documentation Drift:** User pushed back on a verbose CLAUDE.md entry. Settled on a single line: "After any session where code was written, briefly note in your response whether any docs or rules look stale. If unsure, ask." The principle matters more than the checklist.

7. **Rules vs docs non-duplication confirmed:** Rules say HOW (behavioral constraints), docs say WHAT (narrative description). The `comfy_injection.md` Standard Node Title Map stays in the rule file — docs just reference it. No duplication.

8. **docs/ location:** Keep at project root. It's the standard place for narrative docs, both agents and humans know to look there, and it keeps `.claude/` focused purely on agent instructions.

9. **Rule briefing tightens:** 4 rule files get updated Sub-Agent Briefings that point to the corresponding `.md` doc. The briefings are now lightweight redirects, not content duplicates.

---

## Work Remaining

### High Priority — Execute the documentation plan

**Plan location:** `docs/superpowers/plans/2026-04-11-documentation-structure.md`

**Tasks (in order):**

**Task 0: Add Documentation Drift reminder to CLAUDE.md**
- Read CLAUDE.md, find existing Documentation Drift section (may already have something)
- If missing or insufficient, add: "After any session where code was written, briefly note in your response whether any docs or rules look stale. If unsure, ask. Keep docs and rules in sync as a matter of course — not as a cargo-cult checklist."
- Commit

**Task 1: Create `docs/PROJECT.md` hub**
- Write the hub file with the 3-workspace ASCII flow, subsystems table (8 entries now), architectural invariants, "how to orient" guide, ComfyUI portability note
- Commit

**Task 2: Create 8 flat subsystem docs**
- `docs/workspaces.md` — Landing, Gallery, Group History, routing
- `docs/data.md` — modelRegistry, commandRegistry, projectModel
- `docs/comfy.md` — comfyController, commandExecutor, assetService, workflow injection
- `docs/components.md` — ComponentFactory, 3-tier hierarchy, overlay/hotkey/events rules (events points to docs/events.md)
- `docs/projects.md` — Project/Group/Item JSON shapes, Project Manager, portability, project:changed bug
- `docs/shell.md` — shell.js, navigation.js, overlayManager.js, hotkeyManager.js, statusBar.js, windowControls.js, projectUI.js, memoryOps.js
- `docs/utils.md` — ALL utilities. Critical: dom.js shorthands table (qs, qsAll, on, ready, createElement, attr, remove). icons.js, ratios.js, seed.js, and other utils tables.
- `docs/events.md` — EventBus API, cleanup pattern, canonical MpiEventMap table (ui:error, state:changed, project:changed, comfy:*, tool:*, nav:tool), State vs Events distinction
- Commit

**Task 3: Tighten 4 rule file Sub-Agent Briefings**
- `.claude/rules/workspaces.md` — point to `docs/workspaces.md`
- `.claude/rules/state.md` — point to `docs/data.md`
- `.claude/rules/comfy_engine.md` — point to `docs/comfy.md` and `docs/data.md`
- `.claude/rules/comfy_injection.md` — point to `docs/comfy.md` for full title map
- Commit

**Prerequisite files to read before execution:**
- `styles/01_base.css` — verify CSS variable names used in any future CSS code (color, spacing, radius, font-size, etc.)
- All existing rule files (to understand current state before modifying briefings)
- `js/events.js` — to verify canonical event names for `docs/events.md`
- `js/utils/dom.js` — to verify exact function names/signatures for `docs/utils.md`
- `js/utils/icons.js` — to verify icon API for `docs/utils.md`
- `js/utils/ratios.js` — to verify ratio names for `docs/utils.md`
- `js/utils/seed.js` — to verify seed API for `docs/utils.md`

---

## Attempted Approaches

- **Initial plan had README folders** — e.g. `docs/workspaces/README.md`. User rejected: flat files are better when each subsystem only has one file. All 8 docs are now flat `.md` files.

- **Initially planned 6 subsystem docs** (workspaces, data, comfy, components, projects, shell). After brainstorming: added `utils.md` and `events.md` as standalone docs. `utils.md` because utilities are ignored by agents; `events.md` because events span beyond UI.

- **Icons and ratios got their own mini-sections in their respective subsystem docs** — considered but rejected. Better to have one `docs/utils.md` that all subsystems reference.

- **Verbose Documentation Drift rule in CLAUDE.md** — initially drafted a detailed multi-line rule. User said this was too much. Simplified to one line: the agent should use judgment, not run a checklist.

---

## Critical Context

### The Two-System Architecture for Agent Guidance

This project has TWO systems that tell agents what to do:

1. **Rules system** (`.claude/rules/*.md`) — Behavioral constraints: "how to work" (never hardcode colors, never modify factory.js, use Events.on, etc.). The `## Sub-Agent Briefing` sections in each rule file are lightweight redirects to the corresponding `docs/*.md`.

2. **Docs system** (`docs/*.md`) — Narrative descriptions: "what things are" (what is a workspace, what does the data layer do, how does ComfyUI injection work). These tell an agent what they're looking at.

**These must not duplicate content.** Rules say HOW, docs say WHAT. A new agent reading both should get both perspectives without repetition.

### The `dom.js` Problem (Critical)

Agents consistently use `qs()` from `dom.js` but ignore the rest (`qsAll()`, `on()`, `ready()`, `createElement()`, `attr()`, `remove()`). This causes refactoring work. `docs/utils.md` must make the full `dom.js` API visible, not just `qs()`.

### The `project:changed` Event Bug

`projectManager.js:openProject()` fires as a native `CustomEvent`, not via `Events.emit()`. Subscribers using `Events.on('project:changed', ...)` will miss it. This must be documented in `docs/projects.md` and `docs/events.md`.

### The State Proxy Rule

`state.js` is a Proxy. Mutating `state.foo = x` automatically fires `state:changed`. **Never call `Events.emit('state:changed', ...)`** — doing so causes double-fire. Documented in `docs/data.md` and `docs/events.md`.

### ComfyUI Title-Based Injection

Workflow nodes are matched by `_meta.title` (case-insensitive). "Output" and "Detected" are special capture nodes. The full title map lives in `.claude/rules/comfy_injection.md` — docs just reference it, don't duplicate.

### Model Registry `installed` Flag

`installed: false` is the default in `modelConstants/models.js`. `syncModelInstalled()` in `modelRegistry.js` hits `POST /comfy/models/check` and sets `installed` dynamically at runtime. **Never hardcode `installed: true` in the registry.**

### groupHistory.js Rogue Agent Risk (Flagged in Prior Session)

User flagged `js/workspaces/groupHistory/groupHistory.js` as having been modified by agents who "went rogue and missed some patterns." Patterns to verify when that file is next touched:
- All `Events.on` stored to `unsub*` variable and called in destroy
- All `Hotkeys.register` matched with `Hotkeys.unregister`
- No raw DOM queries — use `dom.js` shorthands
- CSS variables only — no hardcoded colors
- State mutations through `state.*` proxy, not direct object mutation

This was NOT addressed in the documentation plan — flagged for future session.

### Legacy LLM Files

- `js/services/llmService.js` — Has a TODO: wire `showError()` into catch blocks. Model switching, OOM, VRAM errors need user-facing notifications.
- `routes/llm.js` — LLM backend routes (legacy)
- State keys `g_abortControllers` and `currentLoadedModel` in `state.js` are marked legacy

These were NOT addressed in the documentation plan.

---

## Current State

### Session Status: Planning Complete — Awaiting User Approval to Execute

- The documentation structure plan is **written and approved by the user**
- The plan file is at `docs/superpowers/plans/2026-04-11-documentation-structure.md`
- **No code has been written** — this was purely a planning/brainstorming session
- User wants **subagent-driven execution** when the time comes (one subagent per task, with review between tasks)
- The `docs/` folder did not exist before this session
- The `docs/superpowers/plans/` folder already existed (contained prior session's handoff)

### What's Finalized
- The plan itself (file structure, task breakdown, self-review checklist)
- All 8 subsystem doc names and their content outlines
- The Documentation Drift one-liner for CLAUDE.md
- The rule briefing update language for all 4 rule files

### What Needs Verification Before Execution
- `styles/01_base.css` CSS variable names (the plan uses generic names like `--color-accent`, `--spacing-md` — these should be verified)
- `js/events.js` canonical event names (to ensure `docs/events.md` MpiEventMap table is accurate)
- `js/utils/dom.js` exact function names and signatures (to ensure `docs/utils.md` is accurate)
- `js/utils/icons.js` API
- `js/utils/ratios.js` RATIOS constant names
- `js/utils/seed.js` API

### Open Items (Not Addressed in This Plan)
- Model UI & Installation State backlog item (deferred)
- groupHistory.js pattern review
- LLM service wiring
- `project:changed` bug fix
- `gallery.js _persistGroups()` pattern fix (uses raw fetch instead of projectManager.updateProject)
