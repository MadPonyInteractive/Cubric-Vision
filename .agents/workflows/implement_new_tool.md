---
description: How to implement a new tool in MpiAiSuite
---

# 🚀 Implementing a New Tool

Follow this 5-step checklist to integrate a new tool. For detailed API documentation and patterns, see [Technical Notes & Patterns](file:///c:/AI/Mpi/MpiAiSuite/dev_docs/04_technical_notes.md).

## 1. Create JS Module (`js/tools/yourtool.js`)
Export an `initYourtool` function. Use `loadToolState` for persistence.
```js
import { loadToolState, saveToolState } from '../toolState.js';
export async function initYourtool() {
    const saved = loadToolState('yourtool');
    // setup UI listeners...
}
```

## 2. Create HTML Template (`templates/tpl-yourtool.html`)
Wrap your tool UI in a single `<template id="tpl-yourtool">`.
```html
<template id="tpl-yourtool">
  <div class="tool-panel" id="tool-yourtool">
    <div class="tool-header">
       <div class="tool-header-text"><h2 class="tool-title">Your Tool</h2></div>
    </div>
    <div class="tool-body"><!-- controls here --></div>
  </div>
</template>
```
Add a stub to `index.html`: `<!-- tpl-yourtool → templates/tpl-yourtool.html -->`.

## 3. Register in `js/toolRegistry.js`
This is the **single source of truth** for all tool metadata.
```js
yourtool: {
    type: 'comfy', // 'comfy' | 'llm' | 'standalone'
    comfyType: 'image_generation', 
    hasAdvancedSettings: true,
    tplId: 'tpl-yourtool',
    module: () => import('./tools/yourtool.js').then(m => m.initYourtool),
}
```

## 4. Add Sidebar Nav (`index.html`)
Add a `<button class="nav-item" data-route="yourtool">` in the appropriate group.

## 5. Add CSS (`styles/05_tools.css`)
Append tool-specific styles to the bottom: `/* ── Your Tool ──────────────── */`

---

### 🛠️ Common Patterns & API
Refer to [04_technical_notes.md](file:///c:/AI/Mpi/MpiAiSuite/dev_docs/04_technical_notes.md) for:
- [x] **Shared Utilities**: `getLoadableUrl`, `uploadImageToProject`, `saveResultToLibrary`.
- [x] **Video & Audio**: `bindPlayPause`, `bindVolumeControl`, and Vertical Slider centering.
- [x] **ComfyUI Integration**: Using `ComfyUIController.runWorkflow()`.
- [x] **Known Gotchas**: Floating bars and Full-Graph validation.

### 🧪 Smoke Test Checklist
- [ ] Navigate to tool (No console errors)
- [ ] Navigate away/back (State restored)
- [ ] Drag & Drop / Paste works
- [ ] Save result → Media Library updated
- [ ] Ctrl+Enter triggers action
