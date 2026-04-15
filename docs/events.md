# Events

Cross-component and cross-layer communication. Not just UI — events span the entire application.

## EventBus (`js/events.js`)

- `Events.on(event, handler)`: Subscribe. Returns an unsubscribe function — **always store and call it on cleanup.**
- `Events.emit(event, data)`: Broadcast an event.
- `Events.once(event, handler)`: One-time subscription.
- `Events.channel(namespace)`: Returns a namespaced bus (`bus.emit('subevent')` → `'namespace:subevent'` globally).

## Key Rule

**Never tight-couple components.** Do not directly call methods on other components. Emit an event instead.

## Canonical Event Map

Defined in `js/events.js` as `MpiEventMap`. Key events:

| Event | When it fires |
|---|---|
| `ui:error` | Request the shell to show an error dialog |
| `ui:close-all-popups` | Signal to close all floating UIs |
| `state:changed` | Global reactive state mutation (auto-fired by state Proxy) |
| `project:changed` | User switched active project |
| `comfy:starting` | ComfyUI engine is starting |
| `comfy:ready` | ComfyUI engine is ready |
| `comfy:error` | ComfyUI engine error |
| `tool:running` | A tool is actively running |
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

## Cleanup Pattern (mandatory)

```javascript
setup: (el, props, emit) => {
    const unsub = Events.on('state:changed', handleStateChange);
    el.destroy = () => unsub(); // Always call unsubscribe
}
```

## State vs Events

- `state:changed` is auto-fired by the state Proxy. **Never manually call `Events.emit('state:changed', ...)`** — it fires twice if you do.
- `project:changed` is emitted via `Events.emit('project:changed', { project })` in `projectManager.js openProject()`. Use `Events.on('project:changed', ...)` to subscribe.
- Other events (`comfy:*`, `tool:*`, `nav:*`) are emitted by their respective services/managers.
