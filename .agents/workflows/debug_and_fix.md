---
description: How to debug and fix issues in MpiAiSuite without breaking the app
---

# Debugging & Safe Fixing Workflow

Use this guide when you need to investigate a runtime issue, a visual regression, or unexpected behavior.

## Step 1: Identify the Scope

Before touching any code, determine which layer the bug is in:

| Symptom | Likely Location |
|---|---|
| Page/tool doesn't render | Template in `index.html`, tool's `init*()`, or `js/toolRegistry.js` missing entry |
| UI looks wrong / missing styles | Search by class name across `styles/01_base.css` → `styles/05_tools.css` |
| Button / interaction broken | Tool JS file in `js/tools/` or `js/shell.js` |
| Textarea/Prompt or Image Drop issues | `js/components/PromptBox.js` lifecycle |
| API call fails (4xx/5xx) | Relevant `routes/*.js` file — check `routes/shared.js` for helpers |
| ComfyUI won't queue / wrong output | `js/comfyController.js`, title-based injection (see `/comfyui_mapping_rules`) |
| LLM not responding | `routes/llm.js` spawn logic, `js/tools/llm.js` |
| App spinner never clears on landing | See "Infinite Project Loading" in `dev_docs/04_technical_notes.md` |
| Electron window / IPC issue | `main.js` |
| Provisioning/Download Manager broken | `js/provisioning.js` |
| Dropdown/file picker broken | `js/components/customDropdown.js` |
| Tool not appearing in registry | `js/toolRegistry.js` — check entry exists and `type` is correct |

## Step 2: Read Before Writing

1. **Read `dev_docs/02_status.md`** — understand the current stage and what's incomplete.
2. **Read `dev_docs/04_technical_notes.md`** — check the section for your affected area before any edit.
3. **Read the relevant file fully** before making changes.

## Step 3: Minimal Change Principle

- Fix only what's broken. Do not refactor surrounding code unless it's causing the bug.
- If you need to change more than 3 files, stop and re-evaluate — something is likely wrong with the diagnosis.
- Never remove the `processState` mutex logic from `routes/shared.js` — it prevents VRAM crashes.

## Step 4: CSS Changes

The app uses **5 CSS partials** in `styles/`. Never edit `styles.css` (it doesn't exist).

1. Search for the class name across all 5 files before adding new rules.
2. New tool-specific rules go in **`styles/05_tools.css`** with a `/* ── Tool Name ── */` header.
3. Shell/layout rules: `styles/02_shell.css`. Forms/modals: `styles/03_forms.css`. ComfyUI panels: `styles/04_comfy.css`.
4. Do **not** use `!important` unless overriding an Electron/Chromium default.

## Step 5: State Persistence

If a fix involves form state, always check `js/toolState.js`. Each tool saves/loads its own key. Do not use `localStorage` directly — go through `saveToolState`/`loadToolState`.

## Step 6: ComfyUI Node Changes

If the fix involves ComfyUI parameter injection:
1. Always use title-based injection (`_meta.title`). Never hardcode node IDs.
2. See `/comfyui_mapping_rules` for the full mapping dictionary.
3. Test by logging the modified workflow JSON before queueing — `console.log(JSON.stringify(workflow, null, 2))`.

## Step 7: Adding a Backend Fix

Route handlers live in `routes/*.js` — pick the right file:
- Project/media bug → `routes/projects.js`
- LLM bug → `routes/llm.js`
- ComfyUI bug → `routes/comfy.js`
- Engine provisioning → `routes/engine.js`
- Shared helper bug → `routes/shared.js`

Never add new route handlers to `server.js` directly.

## Step 8: Hand Off to the User for Testing

**Do NOT open a browser or run the server yourself.** The user tests manually.

When your fix is complete, tell the user what you changed and ask them to test:

> "Fixed. Please run `Start.bat` (or `node server.js`) and navigate to [tool name]. Let me know if it looks right."

If the user finds a follow-up bug, treat it as a new Step 1 — re-read the relevant file, diagnose, fix minimal, hand off again.


## Step 9: Update Docs

After resolving a non-obvious bug:
- Add a concise entry to the relevant section of `dev_docs/04_technical_notes.md`.
- One line cause + one line fix is enough.
- Update `dev_docs/02_status.md` if the fix closes an open task.
