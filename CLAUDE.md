# Master Agent Context Rules

> **AI SYSTEM INSTRUCTION:** This is the master routing file for MpiAiSuite. Whenever you begin a task, you MUST check this file and read the corresponding rule files in the `.claude/rules/` directory BEFORE writing any code.

## THE CARDINAL RULES
1. **NEVER assume architectural patterns.** Check the rules below.
2. **NEVER go rogue.** If a utility or system exists, use it.
3. **DOCUMENTATION DRIFT:** If you establish a new global utility, introduce a new component tier, or change an architectural pattern during a session, you MUST ask the user: *"Should I update the `.claude/rules/` to reflect this new pattern?"* **Do NOT update the architectural rule files without explicit permission.** (However, you ARE allowed to update `.claude/rules/backlog.md` autonomously to cross off completed tasks).

---

## Baseline Rule (ALWAYS APPLIES)

**Before writing any code**, you MUST read `.claude/rules/dos_and_donts.md`. It contains universal CSS, icon, and utility rules that apply to every task regardless of category.

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

### Debugging & Errors
If you are trying to fix a bug, a server crash, or an issue with the python engine:
**->** **MUST DO:** Read the last 50-100 lines of `logs/app.log` using the `Read` tool with an `offset`. Do NOT parse the entire file. This log is the master terminal output and contains runtime telemetry.

---

## Current Backlog & To-Dos
If you need to know what to work on next, or if you want to find bug fixes:
**->** **MUST READ:** `.claude/rules/backlog.md`

> **CRITICAL:** Backlog items that lack detailed technical context are NOT self-explanatory. If an item is unclear, you MUST stop and ask the user: *"Can you explain in detail how we should approach [Task]?"* before writing any code.
