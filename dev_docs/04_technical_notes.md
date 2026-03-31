# Mpi AI Suite — Technical Notes & Patterns

## 🧩 Component Architecture (Factory Pattern)

### Core Engine (`factory.js`)
- **Pattern**: A centralized `ComponentFactory` that returns a mountable instance.
- **Lifecycle**: Every component supports `mount(container, props)`, `update(newProps)`, and `destroy()`.
- **CSS Injection**: The factory ensures a component's CSS is injected into `<head>` only once, regardless of how many instances are created.
- **Event Bubbling**: Components emit both internal events (`on`) and DOM-bubbling events (`mpicomp:event`). This allows for individual listeners or global page-level delegation.
- **`mount(container, props)`**: Takes a live DOM element reference — does NOT require the element to be in the document yet for template rendering, but the Component Gallery pattern requires it to be in the live DOM before calling the _gallery_ `mount()` wrapper (see DOM-before-mount gotcha below).

### AI Type Context (`types.js`)
- **Pattern**: Centralized `Typedef` objects for component Props.
- **Goal**: AI agents **must** read `types.js` before modifying or creating a component. This provides full API context without needing to parse the full source code.

### Hierarchy & Imports
- **Primitives**: Zero dependencies. Use `../../factory.js` relative path.
- **Compounds**: Can only import Primitives.
- **Blocks**: Can import Compounds/Primitives.
- **Rule**: Never import "up" the hierarchy.

### ICONS Registry (Single Source of Truth)
`js/components/Primitives/MpiIcon/MpiIcon.js` exports `ICONS` as a named export:
```js
import { MpiIcon, ICONS } from '../components/Primitives/MpiIcon/MpiIcon.js';
```
- `Object.keys(ICONS)` gives every registered icon key in declaration order.
- Stroke icons (`ratio_*`) use `key.startsWith('ratio_')` to auto-detect and pass `stroke: true`.
- **Never maintain a separate hardcoded icon list elsewhere.** Import `ICONS` and derive from it.

### Component Gallery (`tpl-components.html` + `pages/components.js`)
- The gallery is the live visual test page for all components. Navigate to it via the grid icon in the sidebar.
- **Static sections** (MpiButton, MpiIconButton): Cards are defined in HTML; JS mounts into them.
- **Dynamic sections** (MpiIcon): The HTML contains only an empty `<div id="grid-MpiIcon">`. `buildIconSection()` in `components.js` creates all cards from `ICONS` at runtime — adding a new icon to the registry makes it appear automatically with zero HTML changes.

### ⚠️ DOM-before-mount Gotcha (Critical)
**Symptom**: Cards appear in the gallery but preview slots are empty — no icons render.
**Cause**: `document.getElementById(id)` returns `null` for nodes inside a `DocumentFragment` that hasn't been appended to the live DOM yet. The gallery's `mount(id, fn)` helper guards with `if (document.getElementById(id)) fn()` — so the render is silently skipped.
**Fix**: Two-pass pattern — build all card shells into a `DocumentFragment`, call `grid.appendChild(frag)` to flush them into the live DOM, **then** run all `mount()` calls in a second loop:
```js
// Pass 1 — DOM
Object.keys(ICONS).forEach(key => frag.appendChild(makeIconCard(`preview-icon-${key}`, ...)));
grid.appendChild(frag); // ← live DOM now
// Pass 2 — mount
Object.keys(ICONS).forEach(key => mount(`preview-icon-${key}`, () => MpiIcon.mount(slot(...), ...)));
```

---

## 📂 Media & Upload Patterns

### High-Performance Binary Streaming
- **Pattern**: For large files (Video, Audio, Large RAM-heavy Images), avoid Base64 and `app.use(json({limit: '100mb'}))`.
- **Implementation**: Use `POST /upload-raw` and `req.pipe(fs.createWriteStream(path))`. Set `x-filename` header for the filename.
- **Utility**: `uploadMediaToProject(file, prefix)` in `js/toolUtils.js` is the canonical entry point. It automatically selects the best route based on file size and type.

### Asset Browser Navigation
- **Filter Type**: Use `openAssetBrowser(callback, { type: 'video' })` to restrict selection to specific media types.
- **Hover Previews**: Any video element in a grid should have `muted loop` and listeners for `mouseenter` → `play()`, `mouseleave` → `pause()`.

### Standard Video Controls (`videoPlayerCore.js`)
- **Pattern**: For any tool requiring standard play/pause and volume logic, use the unified `js/components/videoPlayerCore.js` module.
- **Implementation**:
  - `bindPlayPause(videoEl, buttonEl)`: Toggles play/pause with icon updates (Play ▶ / Pause ⏸).
  - `bindVolumeControl(videoEl, { controlEl, popupEl, sliderEl, iconEl, onVolumeChange })`: Binds a full vertical volume fader with hover popup, mute toggle, and mouse wheel support.
- **Vertical Sliders**: Fixed in `05_tools.css` via `.ce-volume-slider`. To achieve perfect centering with a rotated (`-90deg`) range input in Chromium, match the input `height` to the thumb `height` and use `margin-top: -3px;`.
- **Persistence (Recall)**: Always pass `onVolumeChange: (vol, muted) => { saveToolState('toolName', { volume: vol, muted }); }` to the binder. This ensures audio preferences are restored when the user returns to the tool.

---

# Mpi AI Suite — Technical Notes & Gotchas

---

## Global Media Intercept (Context Menu)

**Rule:** Never attach `.oncontextmenu` listeners manually to individual images or canvases inside tools.
- **Implementation:** `js/shell.js` binds a single global `document.addEventListener('contextmenu')` listener (with `capture: true`).
- **Detection:** It detects if the click target is an `<img>` or `<canvas>`. For images, it reads `src`. For canvases, it reads the `data-media-url` dataset attribute.
- **Interactive Canvas Support:** `InteractiveCanvas.js` injects `dataset.mediaUrl`, `dataset.comparisonUrl`, and `dataset.sliderPos`. The global interceptor uses the mouse X coordinate to calculate which side of the comparison slider was clicked, routing the correct URL to the context menu dynamically.
- **Context Routing:** The listener uses `.closest()` to identify if the media is inside `.history-panel`, `.library-grid`, or `.source-preview` and passes this string to `MediaContextMenu.show()`.
- **`isSaved` logic:** If the resolved URL equals `dataset.comparisonUrl` (right side of comparison = unsaved result), `isSaved=false` so the Save option appears. All other images default to `isSaved=true`.

---

## ComfyUI: Mask Upload Format

**Rule:** ComfyUI's `LoadImage` node derives the mask tensor from the **alpha channel** and **inverts** it: `mask = 1 - (alpha / 255)`.

| Alpha value | mask tensor | Effect |
|---|---|---|
| `A=0` (transparent) | 1.0 | ✅ Selected for detail |
| `A=255` (opaque) | 0.0 | ✅ Skipped (background) |

- **Gotcha:** Sending a fully-opaque PNG (all `A=255`) gives an all-zero mask tensor → `mask_to_segs` reports "Empty mask".
- **Fix in `_buildComfyMask()`:** Painted pixels → `A=0`, background pixels → `A=255`. RGB values are irrelevant for mask derivation.
- **Source:** `currentMaskRaw` stores white=painted/transparent=bg (raw brush data). `_buildComfyMask()` inverts the alpha to match ComfyUI's expectation.

---

## ComfyUI: UltralyticsDetectorProvider Model Paths

`UltralyticsDetectorProvider` requires the **subfolder prefix** in the model name:
- ✅ `bbox/face_yolov8n.pt`
- ❌ `face_yolov8n.pt`

Model filenames with correct paths are stored in `dev_configs/comfy_workflows.json` under `dependencies[].filename` (e.g. `ultralytics/bbox/face_yolov8n.pt`). Strip the `ultralytics/` prefix when injecting — ComfyUI resolves from its models root.

When in Manual mode, always send a real fallback like `bbox/face_yolov8n.pt` — never an empty string. ComfyUI validates the entire graph even when the node is logically bypassed.

---

## ComfyUI: Full-Graph Validation

**Rule:** ComfyUI validates **all** nodes in the workflow graph before executing any of them. Even if a node is gated by a boolean (`Auto_Mask=false`), its `ckpt_name` input must still be a valid non-empty string or validation fails with `400 Bad Request`.

**Pattern:** 
- Only inject `Checkpoint` when `toolSettings.model` is non-null/non-empty. Missing → workflow uses its own saved default. Empty string → validation failure.
- Always inject `sams` with a real model name even in manual mode.

---

## Detailer: Raw Mask vs Display Overlay

Two separate data stores must be maintained:
- **`maskOverlay` canvas** — display-only spotlight effect (dark overlay with transparent holes over painted areas). Never read this for ComfyUI input.
- **`currentMaskRaw`** — data URL of raw brush mask (white=painted, transparent=background). Source of truth for: re-editing in modal, producing the ComfyUI mask via `_buildComfyMask()`, state persistence.

When the modal sends `state.detailerInputMask`, store it in `currentMaskRaw` first, then call `_applyMaskDataUrlToOverlay()` for display. Pass `currentMaskRaw` (not the overlay canvas) back to the modal for re-editing.

---

---

## Shared Tool Utilities API (`js/toolUtils.js`)

> **Rule:** Import these — never copy-paste them. A copy is a bug that only gets fixed in one place.

```js
import {
    getLoadableUrl,        // Convert any path/URL → browser-loadable /project-file?path= URL
    uploadImageToProject,  // Upload a File from drag/drop or clipboard to project Media/
    saveResultToLibrary,   // Save a ComfyUI result URL to the project media library
    setRunButtonState,     // Toggle action button between Run ▶ and Stop ■
} from '../toolUtils.js';

import { PromptBox } from '../components/PromptBox.js';
```

### `getLoadableUrl(url) → string`
Converts any file path or project-file URL into a browser-loadable URL:
- Raw absolute path → `/project-file?path=<encoded>`
- Already a `/project-file?path=` URL → re-encodes the path param for safety
- `data:`, `blob:`, `http:` URLs → passed through unchanged

```js
const loadable = getLoadableUrl(state.yourtoolInputImage);
await canvas.loadImage(loadable);
```

### `uploadImageToProject(file, prefix) → Promise<{ filePath } | null>`
Uploads a dropped/pasted `File` to the active project's `Media/` folder via the `/project-media/:id/upload` endpoint. Returns `{ filePath }` on success or `null` on failure.

```js
const result = await uploadImageToProject(file, 'yourtool');
if (result?.filePath) {
    state.yourtoolInputImage = result.filePath;
    renderTool();
}
```

### `saveResultToLibrary(resultUrl, prefix) → Promise<void>`
Fetches a ComfyUI result URL as a blob, converts to base64, and POSTs to the media upload endpoint. Auto-dispatches `media:updated` on success.

```js
try {
    saveBtn.disabled = true;
    await saveResultToLibrary(currentResultUrl, 'yourtool_result');
    saveBtn.style.color = '#4ade80'; // success green feedback
    setTimeout(() => { saveBtn.style.color = ''; saveBtn.disabled = false; }, 2000);
} catch (e) {
    window.MpiAlert('Failed to save: ' + e.message);
    saveBtn.disabled = false;
}
```

### `setRunButtonState(btn, isRunning) → void`
Toggles the main action button between Run icon (no danger class) and Stop icon (danger class). Set the `title` separately.

```js
setRunButtonState(runBtn, true);   // → stop icon + danger class
setRunButtonState(runBtn, false);  // → run icon, no danger class
runBtn.title = isRunning ? 'Cancel (Ctrl+Enter)' : 'Run (Ctrl+Enter)';
```

### `PromptBox` Component
Universal UI wrapper for any text generation or image prompt input. Replaces legacy textareas and handles auto-expand, negative/positive styling, clipboard actions, and drag-and-drop logic natively.

```js
const promptBox = new PromptBox({
    toolId: 'yourtool',
    container: document.getElementById('yourtool-prompt-wrapper'), // Injection target
    toggleContainer: document.getElementById('yourtool-toggle-wrapper'), // Optional mode switch target
    onImageDrop: async (fileOrUrl) => { ... } // Optional image parsing handler
});

// To read the active text:
const val = promptBox.positivePrompt;
```

---

## Session Persistence (`toolState.js`)

### Pattern: Per-Project, Per-Tool State
**Rule:** Tool state (source image, results, settings) must be persistent across navigation within the same project session.
- **Implementation:** Use `saveToolState(toolName, stateObj)` and `loadToolState(toolName)`. 
- **Storage:** Data is keyed by `${projectId}_${toolName}` in `localStorage`.
- **Restoration:** Call `loadToolState` at the top of the tool's `init*()` function.
- **Empty State Visibility:** Use a centralized `render*()` function (e.g., `renderUpscaler()`) to manage the visibility of the "Drag & Drop" empty state based on the truthiness of the restored `inputImage`. Always check for valid paths (non-empty, not `"null"`) before hiding the empty state.

### Result Persistence after Transfer
**Rule:** When a result is "Transferred to Source", do NOT clear the `currentResultUrl`. 
- **Benefit:** Maintaining the result URL, even after it becomes the new source, ensures the comparison view remains valid and the "Save" button remains functional if the user navigates away and returns.

---

## ComfyUI Asset Processing

### Result URLs as Inputs
**Rule:** ComfyUI result URLs (e.g., `http://127.0.0.1:8188/view?...`) must be correctly identified as assets and re-uploaded as files BEFORE being passed to nodes.
- **ComfyUI Limitation:** Standard nodes like `LoadImage` expect a filename in the `input` directory, not a full `http://` URL.
- **Controller Logic (`runWorkflow`):** The asset detection condition in `js/comfyController.js` includes `val.startsWith('http')`. 
- **Workflow:** 
    1. Controller detects a URL in a tool's parameters.
    2. Controller fetches the image and uploads it to ComfyUI as a static file (e.g., `mpi_input_image.png`).
    3. Controller injects the *filename* into the workflow JSON.
- **Cache Friendly:** Using static filenames for uploads (instead of unique timestamps) enables ComfyUI's internal execution caching.

---

## ComfyUI Node Injection

**Rule:** Never use hardcoded node IDs. Always inject via `_meta.title`.

// Robust Multi-Node Injection: Always use filter() to target all nodes with the same title
const nodeIds = Object.keys(workflow).filter(id => workflow[id]._meta?.title === 'Positive');
nodeIds.forEach(id => {
  workflow[id].inputs.text = positivePrompt;
});
```

### Seed & Field Types
Injection must be field-agnostic to support both standard Primitives (`value`) and Custom Nodes like `MpiInt` (`int`).
- **Seed:** Check for `int`, `value`, `seed`, or `noise_seed`.
- **Denoise:** Check for `float`, `value`, or `denoise`.
- **Resolution/Batch:** Use the `_injectValue(nodeId, val)` helper (pattern in `generator.js`) to probe for `int` vs `value` fields, ensuring compatibility with custom `MpiInt` nodes.

### Undefined Variable Typo
Fixed a bug where `_promptStr` was used as a fallback for `_positivePrompt`; always ensure local variable names match the intended prompt state.

### Standard title hook reference
> **Full mapping dictionary** (including `Checkpoint`, LoRA slots, `Output` capture rules, and all injection key types) is in the agent workflow:
> `.agents/workflows/comfyui_mapping_rules.md` — use `/comfyui_mapping_rules` to load it.

Quick reference for the most common hooks: `Positive`, `Negative`, `Seed`, `Width`, `Height`, `Batch_Size`, `Use_Refiner`, `Turbo`, `Denoise`, `Steps`, `Input_Image`, `Input_Mask`, `Upscale_Model`, `Output`.

### Seed Range Unification
To support modern high-precision workflows (like FLUX), the application uses **14-digit integers** for random seed generation. 
- Implementation: `Math.floor(Math.random() * 100000000000000)`
- Files: `js/uiHelpers.js`, `js/tools/generator.js`

### Batch Number Gotcha
Injecting `batch_size` directly into `Empty Latent Image` **does not work** if that input is connected to a primitive node via a link — ComfyUI ignores the API value in favor of the link.
- **Fix:** Rename the `PrimitiveInt` node to exactly `"Batch_Size"` in the ComfyUI UI. Inject into its `.inputs.value`. This is the only reliable way.

### KSampler Seed Fallback
If no `"Seed"` primitive is found, fall back to searching any node with `class_type` containing `"KSampler"` and inject into `noise_seed` or `seed`.

---

## Electron & Security

### ComfyUI WebSocket Authentication
ComfyUI rejects WS connections whose `Origin` doesn't match. `main.js` intercepts all outgoing headers and spoofs `Origin` to `http://127.0.0.1:8188`:

```js
session.defaultSession.webRequest.onBeforeSendHeaders(
  { urls: ['*://127.0.0.1/*', 'ws://127.0.0.1/*'] },
  (details, callback) => {
    details.requestHeaders['Origin'] = 'http://127.0.0.1:8188';
    callback({ requestHeaders: details.requestHeaders });
  }
);
```

### Stale JS After Code Changes
`main.js` calls `mainWindow.webContents.session.clearCache()` on every launch to prevent cached JS from serving old code during development.

---

## Model Paths

- **External models root:** User-configurable in Settings. Stored in app settings. Used for `.safetensors`, LoRAs, upscale models.
- **Custom nodes:** Always internal to `engine/ComfyUI_windows_portable/ComfyUI/custom_nodes/`. Never in the external root. This prevents Python version/env conflicts.
- **Path helper:** `resolveComfyPath(dep, customRoot, config)` in `routes/shared.js` determines the correct absolute path for any asset type, honoring the custom root while keeping custom_nodes internal.
- **`extra_model_paths.yaml`:** Auto-generated by the app (`routes/comfy.js` → `/comfy/set-path`) to tell ComfyUI where external models live.

---

## LLM Engine (`llama-server.exe`)

- **VRAM cap:** Always launch with `-c 8192` context. Without this, Qwen-VL auto-allocates 262k tokens → 64GB RAM exhaustion.
- **Mutex:** A shared `processState` object in `routes/shared.js` prevents LLM and ComfyUI from competing for VRAM — `stopLlamaServer()` is called before ComfyUI starts and vice versa. Never remove this.
- **Process cleanup:** `llama-server.exe` is force-killed on process exit (registered in `routes/shared.js` signal handlers) and on model hot-swap. If you add new spawn paths, add cleanup to `stopLlamaServer()` / `stopComfyUI()` in `routes/shared.js`.
- **Vision models:** Require `--mmproj <path>` in the spawn args. Check `llm_models.json` for the correct mmproj file for each VL model.

---

## Dependency Management (`comfy_workflows.json`)

- Each workflow entry has an `installed: true/false` flag — the source of truth for UI state.
- **Smart pruning:** Before deleting a model on workflow uninstall, check if any other `installed: true` workflow depends on it.
- **`syncWorkflowStates()`** in `routes/shared.js` re-scans the disk and corrects all `installed` flags. Called on app start and when the models path changes. Route handlers call it via `require('./shared').syncWorkflowStates()`. Always call this after any external model path modification.

---

## Masking & Detailer

- **Zero-stretch rule:** Source image and mask must use `object-fit: contain` + `position: absolute; top: 50%; left: 50%; transform: translate(-50%, -50%)` to stay aligned regardless of container size.
- **Asset upload order:** Upload source image first, then mask, then queue the prompt. ComfyUI `/upload/image` is synchronous per call.
- **Execution Caching:** Always use static filenames for `LoadImage` node inputs (e.g., `mpi_detailer_input.png`) instead of timestamps. This enables ComfyUI's server-side caching, allowing it to skip the entire run if the workflow JSON and asset filenames remain identical.
- **Seed Persistence:** Use `js/toolState.js` to store the active seed. Restoring it synchronously on tool initialization ensures the seed remains static across tool-switches and sessions until the user manually clicks "New Seed".
- **`ComfyUIController.connect(callback)`:** Normalizes the nested `data` field from ComfyUI WS messages. Binary preview frames are converted to blob URLs and delivered as `{ type: 'preview', url }`.
- **Silent Mask Updates (Visual Feedback)**: 
    - **Trigger**: Selecting/deselecting thumbnails calls `runEnhance(false, true)` (isReady=false, maskOnly=true).
    - **UI Masking**: During silent runs (`isMaskOnlyRun = true`), the WebSocket listener in `detailer.js` ignores `detected` (thumbnails) and `output` messages to prevent reloading the UI. It *only* processes the `output_mask` node.
    - **Processing (`_processAutoMask`)**: Standard ComfyUI masks (White=Mask, Black=Background) are converted to Spotlight-ready maps (Opaque=Mask/Spotlight, Transparent=Background) via the brightness threshold (White > 128).
    - **Spotlight Composition**: `renderDetailer()` uses `ctx.globalCompositeOperation = 'destination-out'` to clear holes in a semi-transparent black overlay (`rgba(0, 0, 0, 0.6)`).
    - **Canvas Reset Gotcha**: Resizing a canvas (`.width = val`) clears it and resets the context state. `renderDetailer` must re-acquire the context and re-fill the darkened layer AFTER any potential resize.

---

## Troubleshooting: Infinite Project Loading Spinner

If the landing page spinner never disappears:
1. **Electron not detected in browser:** `js/shell.js` conditionally requires Electron — if `window.require` is absent (browser), it skips. This is intentional.
2. **Slow FS scan:** `server.js` limits the project thumbnail scan to 100 files max per project.
3. **Corrupt `project.json`:** Wrapped in try-catch — corrupt files are skipped, not thrown.
4. **Broken module import:** A 404 on any `import()` will silently halt the JS chain before `initShell()` runs. Check the DevTools network tab for red requests.

---

## Custom Dialog System

Native `alert()`, `confirm()`, `prompt()` are globally overridden. Always use:

```js
await MpiAlert('Title', 'Message');
const ok = await MpiConfirm('Title', 'Are you sure?');
const val = await MpiPrompt('Title', 'Enter value:', 'default');
```

Defined in `js/dialogs.js`.

---

## Interactive Canvas & Viewers

### Infinite Zoom-out
To support flexible previewing, `js/components/interactiveCanvas.js` uses a minimum scale of `0.01` (1%) instead of capping at the image-fit (`minScale`). 
- **Target:** Affects all tools using `InteractiveCanvas` (Detailer, Media Detail Modal, result previews).

### Unified Scaling (Comparison Mode)
When `isComparisonMode` is active, the `draw()` method automatically scales the comparison image (`imgAfter`) to match the base image's (`img`) resolution while preserving its original aspect ratio. 
- **Method**: Calculates `relScale = Math.min(img.width / imgAfter.width, img.height / imgAfter.height)`.
- **Alignment**: Centered relative to the base image vertically and horizontally.
- **Swipe Support**: The `sliderPos` clipping remains synchronized because both images are drawn within the same coordinate space (0, 0, baseWidth, baseHeight) after the relative scale is applied.

## Navigation & UI Patterns

### Global Trigger Consistency
**Rule:** Every tool that performs a primary execution (Generate, Enhance, Translate, etc.) MUST be registered in the global `Ctrl + Enter` handler in `js/init.js`.

### Prompt Mode UI Logic
- **Icons:** Use the standard **Checkmark** SVG for positive/detail mode and the **Prohibited** (`🚫`) sign for negative/exclude mode.
- **Feedback:** When in negative mode, the `innerHTML` of the icon container is updated, and the button's `style.color` must be set to `var(--danger)`.
- **Placeholder Sync:** Always update the `textarea` placeholder text when switching modes.

### Startup Configuration
- **Auto-start ComfyUI**: Controlled by `localStorage.mpi_auto_start_comfy`. Logic resides in `js/shell.js`'s `initShell()` call, which triggers `ComfyUIController.ensureServerRunning()` on boot.

## Keyboard Shortcut Standards

To ensure a consistent user experience, the application follows two distinct keyboard shortcut patterns for prompt boxes:

### 1. LLM-Based Tools (Create Section)
*LLM Chat, Descriptor, Translator, JSON Formatter, Prompt Builder*
- **Enter**: Submits the prompt or triggers the tool action.
- **Shift + Enter**: Creates a new line.
- **Implementation**: Handled globally in `js/init.js` (for shared tools) or locally in `llm.js`/`promptBuilder.js`. Always call `e.preventDefault()` **before** any `await` calls to prevent the browser from inserting a hardware-level newline.

### 2. ComfyUI-Based Tools (Image Gen)
*Generator, Detailer*
- **Ctrl + Enter**: Submits/Generates.
- **Enter**: Creates a new line.
- **Constraint**: This pattern matches the standard ComfyUI web interface behavior.

### 3. Global Shortcuts
- **Escape**: Closes any active modal-overlay AND cancels active LLM generation/descriptors by calling the tool's exported `cancel()` function.
- **F11**: Toggles full-screen mode.

---

## Detailer: Keyboard Listener Stacking Bug (Fixed)

**Symptom:** Ctrl+Enter triggers a global interrupt instead of starting generation, or fires twice.  
**Cause:** `initDetailer()` is called on every page mount. Any `addEventListener` inside it stacks — two visits = two listeners firing simultaneously for every keypress. One call set `isRunning=true`, the other immediately saw it and called `interrupt()`.  
**Fix:** 
1. The global Ctrl+Enter shortcut for all ComfyUI tools is owned by `js/init.js` — never add a second handler for it in tool files.
2. Non-global listeners (plain Enter, M key) must be guarded with a module-level `_shortcutRegistered` flag: `if (!_shortcutRegistered) { _shortcutRegistered = true; window.addEventListener(...); }`.
3. Use `element.onclick = fn` instead of `element.addEventListener('click', fn)` for single-action buttons inside `init*()` functions — `.onclick` assignment always replaces the previous handler.

---

## Detailer: Async runEnhance Abort Guard

**Pattern:** When `runEnhance()` contains multiple `await` calls (server start, WS connect, uploads), the user can interrupt mid-flight by pressing Ctrl+Enter. Without a guard, the function continues past each await even though `isRunning` was reset to `false` by `interrupt()`.

**Fix:** Check `ComfyUIController.isRunning` after each major await and return early if false:
```js
await ComfyUIController.ensureServerRunning();
if (!ComfyUIController.isRunning) { progressWrapper?.classList.add('hide'); return; }
// ... WS setup ...
if (!ComfyUIController.isRunning) { progressWrapper?.classList.add('hide'); return; }
```
Also: always reset `ComfyUIController.isRunning = false` at the top of `initDetailer()` to clear stale state from a previous session.

---

## Detailer: Recursive Workflow Enhancements

### Result-to-Source Transfer Mechanism
- **Implementation**: The latest generated stable result URL (ComfyUI `view` API) is stored in a module-level `currentResultUrl` variable. 
- **Bypass Logic**: When the transfer arrow is clicked, `state.detailerInputImage` is set directly to this URL. `renderDetailer()` then loads this URL into the source pane. 
- **Auto-Save Avoidance**: Because the URL points to the ComfyUI server and not a local file, it bypasses the `handleImageUpload` function, which is the only trigger for automatic media library commits. This allows for infinite recursive detailing without gallery clutter.
- **Cleanup**: `currentResultUrl` is cleared and the transfer button is hidden whenever a new image is manually uploaded or selected from the asset browser to prevent state leakage between different base images.

### Manual Result Saving
- **API**: Uses the standard `/project-media/:projectId/upload` endpoint.
- **Data Flow**: The result image is fetched from the ComfyUI server as a `Blob`, converted to `Base64` via `FileReader`, and then POSTed to the backend.
- **Feedback**: A success state is shown by changing the icon color to green for 2 seconds. A custom event `media:updated` is dispatched to trigger a refresh across all open media panels.

---

## Unified Tool Header System

### Automatic Model Selector Injection
To maintain UI consistency and reduce boilerplate, the app uses a unified injection pattern for the model/workflow selector.
- **Mechanism**: `injectModelSelector(toolName)` in `shell.js` automatically searches for a `.tool-header` element within the tool's panel.
- **Targeting**: If `.tool-header` is found, the selector is appended there. If not, it falls back to the `.tool-panel` with `position: relative`.
- **Logic Location**: Orchestrated globally in `loadToolInternal` in `shell.js`. Do not manually call `injectModelSelector` inside individual tool `init` functions unless you are targeting a non-standard container.

### Required Template Structure
All tool templates in `index.html` should follow this structure to ensure the selector aligns correctly and doesn't break header text:
```html
<div class="tool-header">
  <div class="tool-header-text">
    <h2 class="tool-title">Title</h2>
    <p class="tool-desc">Description</p>
  </div>
  <!-- Selector will be injected here as a sibling to .tool-header-text -->
</div>
```

### Sticky Header Offset
The `.tool-header` uses `position: sticky; top: -1.25rem`. This specific negative offset is required to negate the top padding of the workspace container, allowing the header to pin exactly at the top of the viewport without visual "jumps" during transition.

---

## Compare Tool & Canvas Lifecycle

### Mandatory Canvas Destruction
**Rule:** Any tool using `InteractiveCanvas` MUST call `.destroy()` on the existing instance before creating a new one in the `init()` function.
- **Cause:** `InteractiveCanvas.js` registers multiple high-level window listeners (`resize`, `keydown`, `keyup`, `mousemove`). Navigating back and forth without destruction causes these listeners to stack, leading to double-firing shortcuts and memory leaks.
- **Implementation:**
  ```js
  if (compareCanvas) compareCanvas.destroy();
  compareCanvas = new InteractiveCanvas(container);
  ```

### Tool-Specific Layout Overrides
The Compare tool uses a `:has()` selector to balance the global workspace padding when active:
- **Rule**: Use `.tool-container:has(#tool-compare)` to override the standard `5rem` bottom padding. This ensures vertical symmetry where the gap below the tool matches the gap above it.
- **Thumbnail Scaling**: Side slots use `clamp(80px, 12vw, 160px)` to remain responsive while protecting the central workspace.
- **Slider Interaction**: Always use `getBoundingClientRect()` combined with `scaleX/Y` calibration (internal resolution vs display size) for mouse interactions. Relying on `e.offsetX` directly causes grab point drift after window resizes.
- **Initial Centering**: Use `requestAnimationFrame` inside `resetView()` when first loading a tool to ensure the DOM layout has settled and `clientWidth/Height` report stable values. Premature calculation leads to off-center rendering.

### Media Library Multi-selection
- **Logic:** The "Compare Selected" button in `mediaLibrary.js` is only visible when `selectedFiles.size === 2`.
- **State Transfer:** Navigation uses `saveToolState('compare', { leftImage, rightImage })` to pass data between pages, avoiding complex URL parameter management.

---

## ComfyUI WebSocket Architecture — The `runWorkflow` Contract

**Rule:** Every ComfyUI tool MUST use `ComfyUIController.runWorkflow()` to execute workflows. **No tool may create its own WebSocket or install its own `ws.onmessage` handler.**

**Why this exists:** The Generator (the first tool built) originally had its own `_connectWebSocket()` private function that created a raw WS and installed a hard-coded `onmessage` closure. When later tools (Detailer, Upscaler) called `runWorkflow()` → `connect()`, the WS was still `OPEN` so `connect()` returned early — updating `activeListener` but leaving the Generator's custom `onmessage` in place. Binary preview frames went to the dead Generator callback → **no live previews in any subsequent tool**.

**Resolution (2026-03-29):** `generator.js` was refactored to use `runWorkflow()` like all other tools:
1. All workflow parameters are injected into the JSON manually (same technique as always).
2. The fully-injected workflow object is passed as the first arg to `runWorkflow(workflow, {}, callback)`. Empty `params` tells the controller to skip its own injection loop.
3. The `onMessage` callback handles `preview`, `progress`, and `executed` messages identically to Detailer/Upscaler.

**Defensive armor:** `comfyController.js connect()` re-binds `ws.onmessage` to the standard handler on every call, even when reusing an open WS. This is a belt-and-suspenders guard.

---

## WebSocket & Execution Management

### Dynamic Listener Capture
**Rule:** Never use a captured closure variable for the WebSocket `onmessage` handler in `ComfyUIController`. Always reference `this.activeListener`. 
- **Bug:** Capturing `currentListener` during the initial `connect()` call causes tool-switching regressions. If a user runs the Upscaler and then the Detailer, the WebSocket remains open but the `onmessage` handler still points to the (now destroyed) Upscaler callback.
- **Fix:** `this.ws.onmessage = (e) => { if (this.activeListener) this.activeListener(msg); ... }`

### Metadata Injection Order
In `runWorkflow`, ensure that workflow-specific metadata (like `node_title`) is injected into the message object **before** forwarding it to the tool's callback. 
- **Detailer Dependency:** The Detailer tool relies on `msg.data.node_title === "Output"` to trigger the final result display. If the callback runs first, the tool sees a raw node ID and ignores the message, appearing "stuck".

---

## Interactive Canvas: Grid Overlay

### Coordinate Space Alignment
**Rule:** Always draw the grid overlay *inside* the main coordinate transformation block (between `ctx.save()` and `ctx.restore()`).
- **Correction:** Drawing the grid after `ctx.restore()` causes it to render in "canvas space" (top-left of the viewport) rather than "image space". 
- **Implementation:** The grid should use `this.img.width` and `this.img.height` for boundaries while inside the scaled context.

### High-Contrast Dashed Lines
To ensure visibility on both dark and light images, use a dual-pass dashed line approach:
1. Pass 1: `strokeStyle = 'white'`, `lineWidth = 2 / scale`.
2. Pass 2: `strokeStyle = 'black'`, `lineDashOffset = dashLength / scale`.
This creates a "marching ants" or alternating black/white effect that is visible on any background.

---

## Media Library & Tool Integration

### Standardized URL Loading (`getLoadableUrl`)
**Rule:** Never pass a raw local file path (`C:/...` or `file://`) directly to an `Image.src`. Browsers will block it with a "Not allowed to load local resource" error.
- **Helper:** Use the `getLoadableUrl(url)` function in `upscaler.js` or `detailer.js`.
- **Functionality:** 
    1. Detects `path=` parameters and re-encodes them for safety.
    2. Detects raw paths and wraps them in `/project-file?path=`.
    3. Passes data-urls and http-urls through unchanged.
- **Application:** Use this before EVERY `canvas.loadImage()` or `img.src` assignment.

### Interactive Canvas: Stability & Recursion
**Rule:** The `draw()` method MUST NEVER call `this.resize()` directly.
- **Risk:** `resize()` calls `draw()` which would then call `resize()`, leading to a `Maximum call stack size exceeded` crash.
- **Correct Pattern:** If `canvas.width` is 0, simply `return` from `draw()`. Let the `ResizeObserver` or an external tool-level `requestAnimationFrame` trigger the resize when the DOM is ready.
- **Cleanup:** Always use `canvas.clearImage()` instead of setting `canvas.img = null`. Setting it to null breaks the internal `Image` object lifecycle.

### Drag & Drop: Unified Pattern
**Rule:** Support both **Files** and **URLs** in every tool's drop zone.
- **URL Drops:** Check `e.dataTransfer.getData('text/plain')`. If it's a project URL, ingest it directly. This allows dragging thumbnails from the Media Library into tools.
- **File Drops:** Use the project-relative upload endpoint. Store the `filePath` in state so the image persists and is shared across project instances. 
- **Targeting:** Apply listeners to both the source preview area AND the prompt `textarea` for maximum ergonomic flexibility.

---

## Seed Management Pattern

To ensure consistent behavior across all image-generation tools, the application follows a standardized "sticky seed" pattern.

### standard Implementation (`Generator`, `Detailer`, `Upscaler`)
1. **Module-level State**: Maintain a `let currentSeed = null;` at the top of the tool file.
2. **Synchronous Initialization**:
   - In the tool's `init*()` function, call `loadToolState(toolName)`.
   - Restore `currentSeed` from the `seed` property if it exists.
3. **Sticky Execution**:
   - In the execution trigger (e.g., `triggerUpscale`), check if `currentSeed` is `null`.
   - If `null`, generate a new 14-digit seed via `generateSeed()` and call `save*State()`.
   - Inject `currentSeed` into the workflow parameters. This ensures the same seed is used for repeated runs until manually changed.
4. **Manual Update**:
   - The "New Seed" button listener must call `currentSeed = generateSeed()`, immediately followed by `save*State()`.
   - Provide visual feedback (e.g., color pulse) to confirm the generation.
5. **Global Diagnostic Logging**:
   - Every seed injection is logged by `ComfyUIController.runWorkflow` in `js/comfyController.js`.
   - Console filter: `[ComfyUIController] Injecting Seed`.
   - This provides a "source of truth" to verify that the seed sent to the engine matches the UI's intent and remains stable.

### Why this pattern?
- **User Intention**: Users often want to tweak prompts or denoise values while keeping the composition (seed) identical. 
- **Persistence**: By storing the seed in `toolState`, the composition is preserved even if the user navigates to the Media Library and back.
- **Engine Sync**: 14-digit seeds are required for compatibility with high-precision models (FLUX, SDXL). Standard 10-digit seeds are insufficient for the current engine's noise resolution.

---

## 🎬 Video & Interaction (Crop & Extract)

### Volume Slider Orientation
**Problem:** A vertical `<input type="range">` in modern Chromium using `writing-mode: vertical-lr; direction: rtl;` alongside `appearance: slider-vertical;` can cause the slider hitbox to squish horizontally (width gets compressed into height incorrectly).
**Fix:** Use native `-webkit-appearance: slider-vertical; appearance: slider-vertical;` and constrain the bounds via standard `width`/`height` sizes with `margin: 0;`. Do NOT apply `writing-mode` or `direction` flips for slider tracks anymore.

### Visible Rect Calculation (Letterboxing)
**Problem:** A `video` element with `object-fit: contain` doesn't always fill its container. Using container-relative percentages for cropping leads to offsets in the "black bars" area.
**Pattern:**
1. Calculate `videoAspect` vs `containerAspect`.
2. Determine `actualWidth` / `actualHeight` of the video pixels.
3. Map mouse percentages to this "Visible Rect" instead of the 100% container.
**Utility:** See `getVideoBounds()` in `js/tools/cropExtract.js`.

### Singleton Component Cleanup
**Rule:** Components like `MediaContextMenu` that use global listeners must store their handlers statically.
- **Gotcha:** If you re-instance a menu without removing the old `mousedown` listener, the old listener will trigger on the next click, immediately calling `hide()` on your new menu.
- **Fix:** Always `document.removeEventListener` using a static reference before clearing it.

---

## Keyboard Shortcuts: System Overrides (F5)

**Rule:** Standard browser functions like `F5` (Refresh) should be intercepted and mapped to app-specific utility actions to provide a more "native app" experience.

- **Implementation:** `js/shell.js` global `keydown` listener for `F5`.
- **Logic:**
    - `e.key === 'F5'`: Calls `triggerMemoryRelease(e.ctrlKey)`.
    - `e.preventDefault()`: Blocks the browser reload.
- **Visual Feedback**: Use `keydown`/`keyup` for the `Control` key to toggle a `.ctrl-held` class on the trigger button. This provides immediate visual confirmation of "modifier mode" without requiring a click.
- **Constraint:** Always check `document.activeElement` (tagName `input` or `textarea`) to ensure tool shortcuts don't fire while typing.

---

## Running Tool Tracking (`toolUtils.js`)

When ANY tool starts a run, call `setRunningTool(toolId, type)` immediately, and `clearRunningTool(type)` in the `finally` block.

```js
import { setRunningTool, clearRunningTool } from '../toolUtils.js';
setRunningTool('generator', 'comfy'); // on start
clearRunningTool('comfy');            // in finally
```
- `type`: `'comfy'` for ComfyUI tools; `'llm'` for LLM tools.
- Fires `tool:running-changed` CustomEvent → `shell.js` updates the sidebar dot.
- `init.js` reads `state.runningComfyTool` to guard Ctrl+Enter cross-tool cancel.

---

## Sidebar: Collapsed Span Hider vs `.running-dot`

**Gotcha:** `.sidebar.collapsed .nav-item span { display: none !important }` catches ALL spans, including dynamically injected `.running-dot`.

**Fix:** Use `:not(.running-dot)` and `display:block !important` on `.running-dot` base rule:
```css
.sidebar.collapsed .nav-item span:not(.running-dot), .sidebar.collapsed .nav-badge { display: none !important; }
.running-dot { display: block !important; position: absolute; top: 5px; right: 5px; }
```

---

## ComfyUI `/free` API — Correct Field Names

`POST /free` accepts: `{ "unload_models": true, "free_memory": true }`.
- `free_memory` = flush tensor cache. **`free_cache` is NOT a valid field** — ComfyUI ignores it silently; memory stays allocated.
---

## ComfyUI Integration Patterns

All ComfyUI tools MUST use `ComfyUIController.runWorkflow()`.

### Pattern A: Standard (Controller-Injected)
Use this when you can map UI fields directly to node titles. The controller loads the JSON and injects values automatically.
```js
await ComfyUIController.runWorkflow(workflowId, {
    Positive: promptBox.positivePrompt,
    Seed: currentSeed,
}, (msg) => {
    if (msg.type === 'executed' && msg.data.node_title === 'Output') {
        currentResultUrl = `http://${ComfyUIController.serverAddress}/view?...`;
    }
});
```

### Pattern B: Pre-Injected JSON (Manual)
Use this for complex logic (multi-LoRA, conditional nodes). Inject into the JSON manually and pass `{}` for params.
```js
const workflow = await (await fetch(`/comfy_workflows/${file}`)).json();
// ... manual injection ...
await ComfyUIController.runWorkflow(workflow, {}, (msg) => { ... });
```

---

## Tool Development Gotchas

### ⚠️ Floating Prompt Bar Scope
Elements inside `.gen-prompt-fixed` (the bottom bar) are **siblings** of the tool panel, not children.
- ✅ Use `document.getElementById('tool-id-element')`.
- ❌ Do NOT use `container.querySelector('#tool-id-element')` as it will return `null`.

### ⚠️ Full-Graph Validation
ComfyUI validates **every node** in a graph before it runs, even if that node is logically bypassed (e.g., `Ready=false`). 
- **Fix**: Always send a complete parameter set (Checkpoint, Seed, Positive/Negative) in every execution phase.

### ⚠️ Ctrl+Enter Stacking
`js/init.js` handles the global `Ctrl+Enter` shortcut. 
- **Rule**: Never add a second `keydown` listener for `Ctrl+Enter` inside your tool's `init()` function, or it will double-fire and immediately cancel its own run.
---

## CSS Animations Under `backdrop-filter`

`backdrop-filter: blur()` on a parent creates a GPU compositing layer that can freeze child CSS `animation` in Chromium/Electron.
- **Partial fix:** `will-change: transform` on the animated element forces it onto its own layer.
- **Full fix:** Remove `backdrop-filter` from modal overlays or use a plain `rgba()` overlay instead.

---

## 💎 Premium UI Patterns

### The Hover Bridge (`::after`)
**Problem:** A gap (e.g., 10px or 20px) between a trigger button and its popup causes a `mouseleave` event to fire when the user moves the mouse slowly, closing the popup before they reach it.
**Fix:** Add an invisible `::after` (or `::before`) pseudo-element to the **popup** that extends into the gap:
```css
.mpi-slider--popup::after {
    content: "";
    position: absolute;
    top: 100%; /* If popup is above the trigger */
    left: 0;
    width: 100%;
    height: 20px; /* Bridge size */
}
```
This keeps the mouse "inside" the component's hover bounds while crossing the empty space.

### UI Component Orchestration (`VolumeControl.js`)
**Pattern:** For complex interactive groups (e.g., a Mute toggle + a Volume Slider), avoid writing sync logic in the tool file. Create a "Controller/Orchestrator" component.
- **Implementation:** `VolumeControl` manages both `MuteIcon` and `Slider` instances. It translates a single `onChange` event from the slider into state updates for the mute button and vice versa.
- **Benefit:** Reduces per-tool boilerplate from ~40 lines to 5 lines.
- **Rule:** The orchestrator should be "pure" (UI only). Persistence (`saveToolState`) should remain the responsibility of the tool's callback to maintain architectural separation.

---

