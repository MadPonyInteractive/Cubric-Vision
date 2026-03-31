---
description: Systematically breaks down overgrown monolithic files into clean, JSDoc-typed modules using the Facade Pattern.
agent: code-archaeologist
---

# /modularize - Monolithic File Breakdown

$ARGUMENTS

> 🤖 **Activates `@[code-archaeologist]`** — an empathetic but rigorous historian of code who follows Chesterton's Fence: *"Don't remove a line of code until you understand why it was put there."*

---

## Purpose

This command breaks down large, overgrown files into smaller, focused modules using the **Facade Pattern** — without changing any external behaviour or modifying dependent files.

Use it to cure "AI Fatigue" caused by files that are too large for agents to reason about efficiently.

---

## Sub-commands

```
/modularize target:[file_path]                          - Analyse and break down the target file
/modularize target:[file_path] extract:[fn]→[dest]      - Also move specific function(s) to a shared utility/component
/modularize plan:[file_path]                            - Show the split plan only (no code written)
/modularize verify:[file_path]                         - Confirm a completed refactor preserved the public API
```

**`extract:` argument syntax:**
```
extract:functionName→js/utils/myUtil.js
extract:fnA→js/utils/shared.js,fnB→js/utils/shared.js
```
Multiple extractions are comma-separated. If the destination file already exists, the function is appended to it.

---

## Strict Directives

> These rules are MANDATORY and cannot be overridden.

1. **No UI/CSS changes** — You are FORBIDDEN from altering any visual output, CSS classes, or HTML structures. This is a strict 1-to-1 logic refactor.
2. **No dependent changes** — Because we use the Facade Pattern, dependent files do NOT need to be read or modified. The public API must remain identical. *Exception: destination files named in `extract:` arguments will be created or appended to.*
3. **JSDoc only** — Use JSDoc for types and documentation. Do NOT convert the file to TypeScript.
4. **Extraction = move, not copy** — An extracted function is removed from the target file and re-exported from its new destination. The target file imports it from there.

---

## Behaviour

### Phase 1 — Scan, Plan & Approve (Single Gate)

> 🔴 **Scope rule:** Read ONLY the target file. Dependent files are never opened — that is the entire point of the Facade Pattern.

The `code-archaeologist` reads the target file once and produces a combined **Risk Summary + Split Plan** in a single response:

1. **Identify the public API** — every exported function, method, and property that must be preserved exactly.
2. **Flag risks** — global state (`window.*`), DOM coupling, magic numbers, anything that complicates splitting (3–5 bullets max).
3. **Identify domains** — the logical responsibility groups within the file (e.g. State, Rendering, Event Handling, Feature Logic).
4. **Flag utility candidates** — identify any pure functions, stateless helpers, or logic with no coupling to the class/module that could be reused by other tools. List them with a suggested destination. If the user has already supplied `extract:` arguments, confirm or correct the proposed destinations.
5. **Propose the directory structure** — new folder, sub-module names, and what logic goes into each.
6. **Risk gate** — if risks are HIGH (e.g. deep shared mutable state, circular logic, undocumented side effects), STOP and ask clarifying questions before proceeding. Otherwise proceed directly to the plan.
7. 🛑 **One approval** — present the Risk Summary, Utility Candidates, and Split Plan together. Wait for a single user confirmation before writing any code.

---

### Phase 2a — Extract Shared Utilities (if applicable)

> Skip this phase if no `extract:` arguments were provided AND no utility candidates were identified in Phase 1.

For each function confirmed for extraction:

1. **Create or append** the destination file (`js/utils/`, `js/components/`, etc.).
2. **Move** the function — remove it from the target file, add it to the destination with full JSDoc.
3. **Add the import** — update the target file to import the function from its new location. No other files are touched.
4. **Verify the function is pure or near-pure** — if it has side effects that depend on the source file's internal state, flag it and ask the user whether to proceed or leave it in place.

---

### Phase 2b — Create Sub-Modules (Strangler Fig)

The `code-archaeologist` uses the **Strangler Fig Pattern**: don't rewrite — wrap. New modules are grown around the existing logic, not carved out of it cold.

1. **Create** each new module file inside the proposed directory.
2. **Apply strict JSDoc** to every class, function, and state object:
   - `@param` and `@returns` on every function
   - `@typedef` for complex configuration objects
   - Private methods prefixed with `_` and tagged `@private`
3. **Minimise coupling** — pass state, callbacks, and DOM references cleanly; sibling modules should not import each other.
4. **Safe Refactors only** — Extract Method, Rename Variable, Guard Clauses. No logic rewrites unless fully understood and test-covered.

---

### Phase 3 — Create the Facade

1. **Rewrite** the original target file as an Orchestrator / Facade (typically becomes `index.js` of the new directory).
2. **Import and initialise** all sub-modules.
3. **Route** data and events between sub-modules through the Facade only.
4. **Preserve the public API** exactly — every public method, property, and constructor signature must be exposed identically.

---

### Phase 4 — Verification

1. **Review** the Facade to confirm all original public methods and event listeners are present and correctly delegated.
2. **Ask the user** to run their standard checks or exercise the feature in the UI to confirm the 1-to-1 refactor is complete.

---

## Output Format

### Phase 1 Output — Risk Summary + Split Plan (combined)

````markdown
## 🗂️ Modularize: [TargetFile]

### ⚠️ Risk Summary
- [Risk 1 — e.g. global state: `window.canvasInstance` mutated in 3 places]
- [Risk 2 — e.g. tight coupling: direct DOM query for `#toolbar` inside class]
- [Risk level: LOW / MEDIUM / HIGH]

### 🔧 Utility Candidates
| Function | Why reusable | Suggested destination |
|----------|-------------|----------------------|
| `fnName()` | Pure, no class coupling, useful in other tools | `js/utils/[dest].js` |
| *(none)* | | |

> If you have additional extractions to specify, add them now using `extract:fn→dest` syntax.

### Proposed Structure
```
[TargetFile]/
├── index.js        ← Facade (replaces original file)
├── [Module1].js    ← [Responsibility]
├── [Module2].js    ← [Responsibility]
└── [Module3].js    ← [Responsibility]
```

### Module Breakdown
| Module | Responsibility | Key Exports |
|--------|---------------|-------------|
| `index.js` | Orchestrates all sub-modules, preserves public API | Same as original |
| `[Module1].js` | [Description] | `[method1()]`, `[method2()]` |
| `[Module2].js` | [Description] | `[method1()]` |

### What will NOT change
- All files that currently import `[TargetFile]` remain untouched.
- All public methods, events, and constructor signatures preserved.

Ready to proceed? (y/n)
````

---

### Completion Summary (Phase 4 output)

```markdown
## ✅ Modularize Complete: [TargetFile]

### New Structure
[list of created files with one-line responsibility each]

### Public API Preserved
- ✅ [method1()] → delegated to [Module].js
- ✅ [method2()] → delegated to [Module].js
- ✅ [event listeners] → wired in index.js

### Manual Verification Checklist
- [ ] Open the feature in the browser — does it load without console errors?
- [ ] Exercise the primary interaction (e.g. pan, zoom, draw) — does it behave identically?
- [ ] Trigger each public method that external code calls — do they all respond correctly?
- [ ] Open DevTools Network tab — no new or missing script requests?
- [ ] If functions were extracted: confirm their destination files are importable and the callers work as before.
- [ ] Check any feature-specific behaviours noted in the Risk Summary above.
```

---

## Examples

```
/modularize target:js/components/interactiveCanvas.js
/modularize target:js/tools/detailer.js extract:resizeImageIfNeeded→js/imageProcessor.js
/modularize target:js/tools/generator.js extract:formatPrompt→js/utils/promptUtils.js,buildHeaders→js/utils/promptUtils.js
/modularize plan:js/tools/generator.js
/modularize verify:js/components/interactiveCanvas/index.js
```

---

## Key Principles

- **Chesterton's Fence** — understand every line before removing it
- **Single-file scope** — read only the target file; never open dependents (except named extraction destinations)
- **Extract to share, not to move** — only extract a function if it's genuinely reusable elsewhere, not just to tidy up
- **Strangler Fig, not big bang** — wrap existing logic, migrate incrementally
- **Behaviour first** — a refactor that breaks something is worse than a monolith
- **Facade = safety net** — downstream consumers never know the internals changed
- **JSDoc, not TypeScript** — types without a build step
- **Minimal coupling** — sub-modules talk to the Facade, not to each other
- **One responsibility per module** — if you can't name it in 3 words, split it further
