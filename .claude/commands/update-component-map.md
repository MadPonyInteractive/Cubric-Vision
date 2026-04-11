Regenerate all 4 component map rule files in `.claude/rules/` by exploring the current codebase. Follow these steps exactly.

## Step 1 — Explore components

Read EVERY component file under `js/components/Primitives/`, `js/components/Compounds/`, and `js/components/Blocks/`. For each component extract:
- **Props:** from `template(props)` param destructuring or `js/components/types.js` JSDoc
- **Emits:** every `emit(` call — capture event name and payload shape
- **Listens:** every `Events.on(` call — capture event name
- **State reads:** every `state.` read (e.g. `state.currentProject`, `state.s_selectedModelId`)
- **State writes:** every `state.x =` assignment

## Step 2 — Explore workspaces

Read `js/workspaces/gallery/gallery.js` and `js/workspaces/groupHistory/groupHistory.js`. For each workspace extract:
- Every `ComponentName.mount(container, props)` call — capture component name, props shape, and mount target (slot ID or description)
- Every `.on(event, handler)` call on mounted instances

## Step 3 — Explore cross-cutting files

Read these files:
- `js/events.js` — extract the full MpiEventMap (all canonical event names and payload shapes)
- `js/state.js` — extract every top-level state key and its type/purpose
- `js/components/Blocks/MpiPromptBox/PromptBoxControls.js` — extract each control's `nodeTitle`, `getInjectionParams()` return shape
- `js/data/commandRegistry.js` — extract each operation ID and its `components[]` array (which controls it uses)

## Step 4 — Rewrite the 4 rule files

Write all 4 files using ONLY the terse formats below. No prose. Tables and structured lists only. Preserve the `## Sub-Agent Briefing` header in each file.

### `.claude/rules/component-mounts.md` format:

```
## Sub-Agent Briefing
> Use this file when you need to know who mounts a component, what props it receives, or where it appears in the UI.

## gallery.js
- ComponentName   props: { prop1, prop2 }   slot: #slot-id-or-description
- ComponentName   shown on: 'event-name' event from OtherComponent

## groupHistory.js
- ComponentName   props: { prop1 }   slot: description
...

## shell.js (if any)
...
```

### `.claude/rules/component-events.md` format:

```
## Sub-Agent Briefing
> Use this file when you need to know what events a component emits or listens to.

## ComponentName
EMITS:   event-name { payloadKey: type, ... }
         event-name2 { payloadKey: type }
LISTENS: canonical:event-name { payloadKey }

## ComponentName2
EMITS:   (none)
LISTENS: ui:close-all-popups
```

Only include components that emit or listen to at least one event.

### `.claude/rules/component-state.md` format:

```
## Sub-Agent Briefing
> Use this file when you need to know which state keys a component reads or writes.

| state key          | type        | readers                                    | writers                        |
|--------------------|-------------|--------------------------------------------|--------------------------------|
| currentProject     | Project|null| gallery, groupHistory, MpiModelSettings    | gallery, groupHistory          |
| s_selectedModelId  | string|null | MpiPromptBox, gallery, groupHistory        | MpiPromptBox                   |
...
```

### `.claude/rules/component-comfy.md` format:

```
## Sub-Agent Briefing
> Use this file when you need to know what gets injected into ComfyUI workflows and from which component.

## Injection Points
| Control ID    | Component        | nodeTitle(s)         | Params injected               | Operations (from commandRegistry) |
|---------------|------------------|----------------------|-------------------------------|-----------------------------------|
| ratio         | MpiRatioSelector | Width / Height       | { Width: number, Height: number } | t2i, i2i, upscale, video      |
| mask          | MpiCanvas        | Input_Mask           | { maskDataUrl: string }        | detail, inpaint                   |
...

## Execution Flow
MpiPromptBox 'run' event → commandExecutor.runCommand(command, { operation, positive, negative, mediaItems, injectionParams })
  → _buildParams() merges injectionParams + model settings
  → ComfyUIController.runWorkflow(workflowFile, params, onProgress)
  → nodes targeted by _meta.title (case-insensitive)

## PromptBoxControls Registry
Location: js/components/Blocks/MpiPromptBox/PromptBoxControls.js
Adding a new control: (1) create component, (2) add entry to PROMPT_BOX_CONTROLS with nodeTitle + getInjectionParams(), (3) add control ID to operation's components[] in commandRegistry.js
```

## Step 5 — Report

After rewriting all 4 files, print a short report:
- How many components documented
- Any new components found since last run (compare against previous file content)
- Any components removed
- Any components flagged for non-standard patterns (missing Events.on cleanup, no emit calls despite being interactive, etc.)
