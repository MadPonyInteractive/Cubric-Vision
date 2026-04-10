# The Event System (js/events.js)

> **AI INSTRUCTION:** You MUST use the Event Bus for cross-component and cross-file communication. Do not pass deep callbacks or directly import one component into another to trigger actions.

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
* `ui:close-all-popups` - Signal to close floating UIs
* `state:changed` - Global reactive state mutation
* `project:changed` - User switched active project
* `comfy:ready` / `comfy:error` - Engine status updates
