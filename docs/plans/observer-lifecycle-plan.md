# Implementation Plan: Scalable Reactivity & Lifecycle Upgrades

*Based on Subagent Review and User Clarification.*

We will bend the "Locked Factory" rule to implement extremely high-value, **fully backwards-compatible** enhancements to the core engine. This will prevent components from spinning in loops and eliminate manual unsubscription memory leaks without requiring a rewrite of the hundreds of existing components.

## 1. Non-Breaking Factory Enhancements (`js/components/factory.js`)

**A. Standardized `onUpdate` Lifecycle Hook**
Currently, `instance.update(newProps)` does nothing but log a warning. We will allow components to optionally define a diffing function.
- If a component defines `def.onUpdate(el, props, newProps)`, the factory will execute it.
- If not, it will fall back to the current behavior (log warning about re-mounting).
- *Benefit:* Allows complex Blocks (like `MpiGalleryBlock`) to react to state changes natively without destroying the DOM.

**B. The `addCleanup` Parameter**
Currently, components must manually define `el.destroy = () => { unsub(); }`. If forgotten, it leaks.
- We will add a 4th argument to the setup signature: `setup(el, props, emit, addCleanup)`.
- The factory will internally track these cleanups and automatically fire them inside `instance.destroy()` right before `el.destroy()` is called.
- *Benefit:* Old components using `el.destroy()` continue to work perfectly. New components get automated memory management.

## 2. Observer Pattern Optimization (`js/state.js` & `js/events.js`)

The app's Proxy-based state emits `state:changed` for every micro-mutation. We will add three surgical utilities to cut the noise down by 90%:

**A. Targeted State Subscriptions (`js/events.js`)**
- Add `Events.onState(key, handler)`: A wrapper that only fires your handler when the specific state key you care about is mutated.
- *Benefit:* Components no longer need to wake up for every unrelated state change.

**B. State Batching (`js/state.js`)**
- Add `state.batch(callback)`: Temporarily suspends `state:changed` event emission, runs the callback (which might mutate 10 keys), and then fires a single batched event at the end.
- *Benefit:* Massive UX performance gain during complex operations like loading projects or bulk updating selections.

## 3. Documentation Alignment
Update `CLAUDE.md` and `.claude/rules/components.md` to:
1. Explain the new `setup(el, props, emit, addCleanup)` signature.
2. Introduce the `onUpdate` lifecycle.
3. Recommend `Events.onState` over `Events.on('state:changed')`.

## Execution Status
*Pending user review. No code implementation has occurred yet.*
