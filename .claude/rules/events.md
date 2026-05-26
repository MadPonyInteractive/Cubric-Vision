# The Event System (js/events.js)

> **AI INSTRUCTION:** You MUST use the Event Bus for cross-component and cross-file communication. Do not pass deep callbacks or directly import one component into another to trigger actions.

## Sub-Agent Briefing
> Copy this section verbatim into any sub-agent prompt that involves cross-component communication or event handling.

- **Always use `Events.on()` / `Events.emit()` for cross-component communication.** Never directly call methods on other components.
- **`Events.on()` returns an unsubscribe function — always store it and call it on cleanup.** Not doing so causes memory leaks.
- **Always check `js/events.js` (`MpiEventMap`) for canonical event names** before inventing new ones. Common ones: `ui:error`, `ui:close-all-popups`, `state:changed`, `project:changed`, `comfy:ready`, `comfy:error`.
- **Cleanup pattern (mandatory inside `setup()`):**
  ```js
  const unsub = Events.on('state:changed', handler);
  el.destroy = () => unsub();
  ```
- **For tools with many internal events,** use `Events.channel('myTool')` to namespace them (e.g. `myTool:result`).

## 🔴 CRITICAL "NEVER FORGET" RULES
1. **Unsubscribe to Prevent Leaks:** `Events.on()` returns an unsubscribe function. You MUST always store it and call it when your component is destroyed or removed from the DOM.
2. **Never Tight-Couple:** Do not directly call methods on other components. Emit an event instead.
3. **Use Canonical Names:** Always check `js/events.js` for the `MpiEventMap` to use existing standard events (e.g., `ui:error`, `state:changed`) rather than inventing new ones.

---

## 🛠️ Implementation Patterns

### 1. Basic Import and Usage
```javascript
import { Events } from '../../events.js';

// Subscribing
const unsubscribe = Events.on('project:changed', (projectData) => {
    console.log(projectData);
});

// Emitting
Events.emit('media:updated', { projectId: '123' });
```

### 2. The Cleanup Pattern (MANDATORY)
If a component mounts to the DOM and subscribes to events, it **MUST** clean up after itself when unmounted.
```javascript
setup: (el, props, emit) => {
    // 1. Store the unsubscribe function
    const unsub = Events.on('state:changed', handleStateChange);
    
    // 2. Call it in the destroy lifecycle or MutationObserver cleanup
    el.destroy = () => {
        unsub(); 
    };
}
```

### 3. The Channel Pattern (For Complex Tools)
If you are building a tool that has many internal events, use an isolated channel namespace to avoid polluting the global bus.
```javascript
const myToolBus = Events.channel('generator');
myToolBus.emit('result', { imgUrl }); 
// Externally, this appears as 'generator:result'
```

---

## 📋 Common Canonical Events
*(Always verify in `js/events.js` if unsure)*
* `ui:error` - Request the shell to show an error dialog
* `ui:close-all-popups` - Signal to close floating UIs and non-modal slide-overs
* `state:changed` - Global reactive state mutation
* `project:changed` - User switched active project
* `comfy:ready` / `comfy:error` - Engine status updates
* `slide-over:open` / `slide-over:toggle` - Shell-owned right panel open/toggle requests
* `generation-queue:changed` - Cue queue snapshot changed; subscribers derive visible queue state from this event payload
* `projects:listed` - Emitted from `loadProjectGrid()` after `listProjects()` resolves; payload `{ projects }`. Used by landing hero stats to show last-session timestamp.

> Full canonical event map (incl. `download:*`, `generation:*`, `tool:*`) lives in `docs/events.md`. `js/events.js` `MpiEventMap` is the runtime source of truth.
