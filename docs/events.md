# Events

Cross-component and cross-layer communication. Not just UI — events span the entire application.

## EventBus (`js/events.js`)

- `Events.on(event, handler)`: Subscribe. Returns an unsubscribe function — **always store and call it on cleanup.**
- `Events.emit(event, data)`: Broadcast an event.
- `Events.once(event, handler)`: One-time subscription.
- `Events.onState(key, handler)`: Subscribe to a specific state key. Filters `state:changed` events internally. Returns unsubscribe. **Preferred over manual key filtering.**
- `Events.channel(namespace)`: Returns a namespaced bus (`bus.emit('subevent')` → `'namespace:subevent'` globally).

## Key Rule

**Never tight-couple components.** Do not directly call methods on other components. Emit an event instead.

## Canonical Event Map

Defined in `js/events.js` as `MpiEventMap`. Key events:

| Event | When it fires |
|---|---|
| `ui:error` | Request the shell to show an error dialog |
| `ui:close-all-popups` | Signal to close all floating UIs. Optional `{ reason: 'overlay-open' }` payload lets long-lived panels (`MpiSlideOver`) ignore the overlay-open pulse |
| `state:changed` | Global reactive state mutation (auto-fired by state Proxy) |
| `project:changed` | User switched active project |
| `project:group-added` | Group added to current project `{ group }` |
| `project:group-updated` | Group updated in current project `{ group }` |
| `project:group-removed` | Group removed from current project `{ groupId }` |
| `projects:listed` | Project grid loaded `{ projects }` — emitted by `projectUI.js loadProjectGrid()`, consumed by `heroStats.js` to repaint the session stat slot |
| `comfy:starting` | ComfyUI engine is starting |
| `comfy:ready` | ComfyUI engine is ready |
| `comfy:error` | ComfyUI engine error |
| `tool:running` | A tool is actively running `{ tool: string, type: string }` |
| `tool:idle` | All tools are idle |
| `nav:tool` | Navigation tool was activated |
| `download:started` | A download job was enqueued and started |
| `download:progress` | Download bytes/speed updated (throttled, 1/sec via Events) |
| `download:complete` | Download job finished successfully |
| `download:failed` | Download job failed |
| `download:paused` | Download job was paused |
| `download:resumed` | Download job was resumed |
| `download:cancelled` | Download job was cancelled |
| `download:uninstalled` | Model was uninstalled |
| `download:installing` | Custom node install phase started |
| `comfy:needs-restart` | ComfyUI auto-restart needed after custom node install |
| `media:imported` | File imported via PromptBox drop `{ url, filename, mediaType }` |
| `workspace:set-operation` | Radial menu operation change `{ operation }` |
| `radial:will-open` | Radial menu pre-render hook `{ page }` — workspace Block can refresh radial items synchronously before render |
| `workspace:inject-prompts` | Reuse button injects prompt into PromptBox `{ positive, negative }` |
| `slide-over:open` | Open a shell-owned right panel `{ title, component, extraClasses?, panelId? }` |
| `slide-over:toggle` | Toggle a shell-owned right panel `{ title, component, extraClasses?, panelId? }` |
| `generation-queue:open` | Open the Cue queue panel |
| `generation-queue:changed` | Cue queue snapshot changed `{ running, pending, items, depth, pendingCount, runningCount, loopArmed }` |
| `generation-store:changed` | **generationStore snapshot after any job transition** `{ jobs, running, pending, depth }` (MPI-208). The single source of truth all generation UI derives from — statusBar (bar ownership + self-heal to idle), the Cue count, and QueuePanel react to this. Each job carries `{ jobId, genId, engine, scope, phase, promptId, lane, … }`; `genId` === the `id` on that gen's `tool:*` events, so the derived statusBar correlates a store job to its live progress events. |
| `generation:started` | Generation registered in activeGenerations `{ id, scope, groupId, tempId, placeholderGroup, queueJobId?, queueDisplay? }` |
| `generation:preview` | New latent preview blob URL available `{ id, url }`; gallery cards keep the generating spinner visible until the preview image has loaded |
| `generation:complete` | Generation finished, item persisted `{ id, item, group, tempId? }` |
| `generation:error` | Generation failed `{ id, tempId? }` |
| `generation:cancelled` | Generation cancelled or produced no output `{ id, tempId? }` |

## Cleanup Pattern (mandatory)

```javascript
setup: (el, props, emit) => {
    const unsub = Events.on('state:changed', handleStateChange);
    el.destroy = () => unsub(); // Always call unsubscribe
}
```

## State vs Events

- `state:changed` is auto-fired by the state Proxy. **Never manually call `Events.emit('state:changed', ...)`** — it fires twice if you do.
- `project:changed` is emitted via `Events.emit('project:changed', { project })` in `projectService.js openProject()` (or related initialization). Use `Events.on('project:changed', ...)` to subscribe.
- Other events (`comfy:*`, `tool:*`, `nav:*`) are emitted by their respective services/managers.
