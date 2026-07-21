# .claude/rules/ — routing index

Agent-facing architecture rules. **Do not read all of these** — match your task below, read
ONLY the target(s). CLAUDE.md's Context Router points here; this file routes within the folder.
Most rule files carry a `## Sub-Agent Briefing` section — paste it verbatim when dispatching
sub-agents (`/mpi-brief-rule <name>`).

| Task | Read |
|---|---|
| Any code at all (colors/icons/DOM/logging/imports/feedback conventions — baseline) | [dos_and_donts.md](dos_and_donts.md) |
| Build / move / style / debug a component | [components.md](components.md) |
| Cross-component communication (EventBus) | [events.md](events.md) |
| Global state (`js/state.js` Proxy) | [state.md](state.md) |
| Workspaces / routing / dev gallery | [workspaces.md](workspaces.md) |
| ComfyUI injection (send tasks, compile JSON, images/masks) | [comfy_injection.md](comfy_injection.md) |
| ComfyUI engine & backend (model registry, downloads, python server, engine split) | [comfy_engine.md](comfy_engine.md) |
| Download system (resumable, IPC/SSE) | [downloads.md](downloads.md) |
| App versioning (APP/SCHEMA/COMFY) | [versioning.md](versioning.md) |
| Kanban cards / board / agent messages | [kanban.md](kanban.md) |
| Committing in the shared tree / co-owned files | [git.md](git.md) |

## Component maps (generated views — who mounts what, wiring, state keys)

| Question | Read |
|---|---|
| Who mounts / owns a component | [component-mounts.md](component-mounts.md) |
| Event wiring per component | [component-events.md](component-events.md) — hub routing to [primitives](component-events-primitives.md) / [blocks](component-events-blocks.md) / [organisms](component-events-organisms.md) / [lifecycle](component-events-lifecycle.md) |
| State keys per component | [component-state.md](component-state.md) |
| ComfyUI params per component | [component-comfy.md](component-comfy.md) |

Update the four maps with the `mpic-update-component-map` skill — not by hand.

Per-component behavioral fine print (API/CSS contracts) lives in
[docs/component-contracts.md](../../docs/component-contracts.md); subsystem knowledge in
[docs/](../../docs/README.md).
