# State Management (js/state.js)

> **AI INSTRUCTION:** All global, persistent data must flow through `js/state.js`. Do not go rogue and create isolated data silos.

## 🔴 CRITICAL "NEVER FORGET" RULES
1. **No Rogue States:** NEVER declare global arrays, objects, or variables outside of a component's lifecycle instance to act as "state". If data needs to persist across tool switches or component mounts, it MUST go in `js/state.js`.
2. **Auto-Reactivity:** The exported `state` object is a Proxy. Mutating it (`state.myVariable = 123;`) automatically emits a global `state:changed` event. 
3. **Never Manually Emit State:** Because of the Proxy, you MUST NOT manually run `Events.emit('state:changed', ...)` after updating a state variable. The proxy does it for you.
4. **Local vs Global:** Internal component state (like a toggle being opened or closed) CAN remain inside the component. But data (like selected models, current projects, generated images) MUST live in `state.js`.

---

## 🛠️ Implementation Patterns

### 1. Reading and Writing State
```javascript
import { state } from '../../state.js';

// Read
if (state.currentPage === 'landing') { ... }

// Write (this automatically fires the event bus!)
state.currentPage = 'project'; 
```

### 2. Reacting to State Changes
Since `state.js` fires a canonical event on mutation, components can listen to changes dynamically (remembering the Event System Cleanup rule).

```javascript
import { state } from '../../state.js';
import { Events } from '../../events.js';

setup: (el, props, emit) => {
    const unsub = Events.on('state:changed', ({ key, value }) => {
        if (key === 'currentPage') {
             console.log("Page updated to: ", value);
        }
    });

    el.destroy = () => unsub(); // Mandatory cleanup
}
```

> **Note on Architecture:** The `state.js` file contains legacy keys and is undergoing structural refactoring. However, the exact rule still applies: **use `js/state.js` as the source of truth for persistency.**
