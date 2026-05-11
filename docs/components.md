# Component System

## ComponentFactory (`js/components/factory.js`)

**Locked — never modify.**

All components are created via `ComponentFactory.create(spec)`. Returns an instance with `mount(container)`, `emit(event, data)`, `on(event, handler)`, `update(props)`, `destroy()`.

```javascript
export const MyComponent = ComponentFactory.create({
    name: 'MyComponent',
    css: ['js/components/Tier/MyComponent/MyComponent.css'],
    template: (props) => `<div class="mpi-my-comp">${props.text}</div>`,
    setup: (el, props, emit) => {
        // All logic here. Return nothing — instance methods are attached to el.
    }
});
```

## 4-Tier Hierarchy

**Primitives** (Tier 1): Buttons, inputs, icons. Import nothing.
**Compounds** (Tier 2): Cards, forms, modals. Import Primitives only.
**Organisms** (Tier 3): Rich widgets composing multiple Compounds. Import Primitives + Compounds. Examples: `MpiCanvasViewer`, `MpiVideoViewer`, `MpiVideoPlayer`.
**Blocks** (Tier 4): Sidebars, grids, workspace coordinators. Import Primitives + Compounds + Organisms.

**Never import up.** A Compound cannot import another Compound's JS — only its CSS if needed.

## Every New Component Checklist

1. Add CSS path to `js/shell/preloadStyles.js`.
2. Document props in `js/components/types.js`.
3. Ask user if it should be added to `js/pages/components.js` (dev gallery).

## Blocking UI (Modals/Overlays)

- Call `Overlays.request({ show, hide, id: el })` to open.
- Call `Overlays.release(el)` to close.
- Portal to `document.body`. Clean up own wrapper + backdrop on close.
- Self-close on `ui:close-all-popups` event.

## Floating UI (Dropdowns/Popups)

- No Overlays registration.
- Self-close on `ui:close-all-popups`.
- Use `MutationObserver` to remove portal from `document.body` when anchor is removed from DOM.

## New Resize Tool Components

- `MpiColorPicker` (Primitive): HSV visual picker with saturation/value square, hue slider, RGB/hex precision inputs, and a lightweight portaled popup. Emits `change { r, g, b, hex }` and exposes `getRGB`, `setRGB`, `setHex`, `getHex`.
- `MpiToolOptionsResize` (Organism): Group History tool panel for resize/flip/rotate. Mounts width/height inputs, method/proportion/crop-position dropdowns, `MpiColorPicker`, divisible-by input, flip/rotation radio groups, and Apply. Persists to `project.toolSettings.resize` through `settings:tool:update`. Image mode debounces live Comfy previews without saving history; Apply appends a new history entry and preserves the source item.

Group History image toolbar now includes `resize` under Transform. The mediator
registry maps `resize` and future `resizeVideo` to `MpiToolOptionsResize`.

## Hotkeys

- `Hotkeys.bind(id, fn)` to bind — `id` is a stable registry id from `hotkeyRegistry.js`.
- Store the returned unbind fn in `_unsubs`; called in `el.destroy()`.
- Never use raw `window.addEventListener('keydown')`.
- Hotkey typing suppression only applies to text-entry controls. Sliders and other non-text controls may retain focus; do not blur them solely to preserve global shortcuts.

## Events

Components communicate via the EventBus. See `docs/events.md` for the full pattern and canonical event names.
