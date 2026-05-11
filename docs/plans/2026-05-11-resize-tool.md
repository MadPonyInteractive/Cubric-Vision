# Resize Tool — Plan

> Universal Comfy-backed Resize + Flip + Rotate tool for the History workspace (image first, video next). Single workflow per media type. Standalone injector pattern under a new `js/services/workflowInjectors/` folder. Settings persisted per project under `project.toolSettings.resize`.

Scope source: kanban entry "Resize tool" (BACKLOG → PLANNING). Workflow files `comfy_workflows/resize.json` + `comfy_workflows/resize_video.json` already authored.

5 large testable phases. Each phase is independently shippable and verifiable.

---

## Phase 1 — Foundation: workflow + dependency + executor wiring

**Goal:** Plumbing in place. Universal op `resize` resolves to `resize.json`, kjnodes installs with engine, executor routes through a new injector. No UI yet — verify via console logs.

- [x] **1.1 — Wire universal workflow + dependency + commandRegistry entries**

    Touch four files together — they are tightly coupled and only work as a set.

    1. `js/data/modelConstants/dependencies.js:170` — add `installOnEngine: true` to the `comfyui-kjnodes` entry. (`ComfyUI-MpiNodes` and `ComfyUI-VideoHelperSuite` already have it.)
    2. `js/data/modelConstants/universal_workflows.js` — add two entries:
       ```js
       resize:      { workflow: 'resize.json' },
       resizeVideo: { workflow: 'resize_video.json' },
       ```
    3. `js/data/commandRegistry.js` (near existing universal ops around line 185) — add two op definitions:
       ```js
       resize: {
           label: 'Resize',
           mediaType: MEDIA_TYPE.IMAGE,
           requiresImages: 1,
           mediaInputs: [
               { key: 'inputImage', mediaType: MEDIA_TYPE.IMAGE, title: 'Input_Image', required: true },
           ],
           promptRequired: false,
           universal: true,
           injector: 'resize',
       },
       resizeVideo: {
           label: 'Resize Video',
           mediaType: MEDIA_TYPE.VIDEO,
           requiresVideo: 1,
           mediaInputs: [
               { key: 'inputVideo', mediaType: MEDIA_TYPE.VIDEO, title: 'Input_Video', required: true },
           ],
           promptRequired: false,
           universal: true,
           injector: 'resize',
       },
       ```
       The `injector: 'resize'` field is new — both ops share the same injector since the workflow node graphs are identical aside from the LoadImage vs LoadVideo input node.
    4. Confirm `getUniversalWorkflow('resize')` and `getUniversalWorkflow('resizeVideo')` resolve in `js/data/modelConstants/modelRegistry.js` (no code change expected — existing helper reads UNIVERSAL_WORKFLOWS).

    **Verify:** Open browser dev tools. In the console, type `(await import('/js/data/modelConstants/universal_workflows.js')).UNIVERSAL_WORKFLOWS.resize` — confirm `{ workflow: 'resize.json' }` returns. Then `(await import('/js/data/commandRegistry.js')).COMMANDS.resize.injector` — confirm `'resize'` returns. Then in Settings → Engine status (or wherever engine deps list), confirm `comfyui-kjnodes` shows as a universal dep to install.

- [x] **1.2 — Create resize workflow injector**

    Create new folder + file: `js/services/workflowInjectors/resizeInjector.js`.

    Read `comfy_workflows/resize.json` to confirm the node IDs (1=Resize Image v2, 2=LoadImage, 3=ImageFlip, 4=ImageRotate, 5=MpiIfElse, 6=MpiSimpleBoolean "Flip", 7=PreviewImage). Read `comfy_workflows/resize_video.json` to capture the video LoadVideo node id and title (likely the same shape but with VHS LoadVideo node at the input position).

    Injector contract:
    ```js
    /**
     * @typedef {Object} ResizeParams
     * @property {number} width
     * @property {number} height
     * @property {string} upscale_method      'nearest'|'exact'|'bilinear'|'area'|'bicubic'|'lanczos'|'nvidia_rtx_vsr'
     * @property {string} keep_proportion     'stretch'|'resize'|'pad'|'pad_edge'|'pad_edge_pixel'|'crop'|'pillarbox_blur'|'total_pixels'
     * @property {{r:number,g:number,b:number}} pad_color   ints 0-255
     * @property {string} crop_position       'center'|'top'|'bottom'|'left'|'right'
     * @property {number} divisible_by
     * @property {'none'|'x'|'y'} flip
     * @property {'none'|'90'|'180'|'270'} rotation
     */

    /**
     * Mutates (and returns) the workflow JSON in place with resize params applied.
     * Looks up nodes by their `_meta.title` so it works for both resize.json
     * and resize_video.json regardless of numeric IDs.
     */
    export function injectResize(workflow, params) { ... }
    ```

    Title-based lookup keys (use `Object.entries(workflow).find(([,n]) => n._meta?.title === '<title>')`):
    - `'Resize Image v2'` → set width, height, upscale_method, keep_proportion, `pad_color = "${r}, ${g}, ${b}"`, crop_position, divisible_by, device='cpu'.
    - `'ImageFlip'` → set flip_method to `'x-axis: vertically'` or `'y-axis: horizontally'`.
    - `'Image Rotate'` → set rotation to `'none' | '90 degrees' | '180 degrees' | '270 degrees'`.
    - `'Flip'` (MpiSimpleBoolean) → set boolean = `params.flip !== 'none'`.

    Do NOT touch Input_Image / Input_Video / Output nodes — those are media-input + output and are handled by the existing `_buildParams` media-slot logic + result handler.

    Also create `js/services/workflowInjectors/index.js`:
    ```js
    import { injectResize } from './resizeInjector.js';
    export const INJECTORS = { resize: injectResize };
    ```

    **Verify:** Look at the code — confirm `js/services/workflowInjectors/resizeInjector.js` exists, exports `injectResize`, and uses `_meta.title` lookups (not hardcoded numeric ids). Confirm `js/services/workflowInjectors/index.js` exists with the `INJECTORS` registry export.

- [x] **1.3 — Route commandExecutor through injector when op declares one**

    In `js/services/commandExecutor.js`:

    1. Import the injector registry at the top: `import { INJECTORS } from './workflowInjectors/index.js';`
    2. In `runCommand(payload)` (around line 437, after `_buildParams` and after the workflow JSON is fetched but **before** submit at line 597) — add a hook:
       ```js
       const opDef = COMMANDS[payload.operation];
       if (opDef?.injector) {
           const injector = INJECTORS[opDef.injector];
           if (!injector) {
               clientLogger.error('commandExecutor', `Missing injector "${opDef.injector}" for op ${payload.operation}`);
           } else {
               // injector mutates the workflow JSON directly using payload.injectionParams
               injector(workflow, payload.injectionParams || {});
               clientLogger.info('commandExecutor', `Applied injector "${opDef.injector}"`);
           }
       }
       ```
    3. Generic `_buildParams` continues to handle Width/Height/seed/positive/negative as before — no changes there. Injector params live alongside generic params.

    **Verify:** In dev tools console, dispatch a fake resize payload via `commandExecutor.runCommand({ operation: 'resize', model: {id:null, mediaType:'image'}, mediaItems: [<any existing image item>], injectionParams: { width: 512, height: 512, upscale_method: 'lanczos', keep_proportion: 'crop', pad_color: {r:255,g:105,b:180}, crop_position: 'center', divisible_by: 2, flip: 'none', rotation: 'none' } })`. Check the network tab for the `/comfy/queue` POST — confirm the submitted workflow JSON has the injected values on nodes 1, 3, 4, 6. Log message "Applied injector resize" should appear.

- [x] **1.4 — Generalize `getToolSettings` signature**

    In `js/data/projectModel.js:366`:
    ```js
    export function getToolSettings(project, toolKey, defaults = { upscaleModel: null }) {
        return (project.toolSettings ?? {})[toolKey] ?? defaults;
    }
    ```

    All existing callers (commandExecutor.js:246, MpiModelSettings.js:415, projectService.js:103/111/138) continue to work — they get the same `{ upscaleModel: null }` fallback. Resize tool will pass its own defaults object in Phase 2.

    **Verify:** Look at the code — confirm `getToolSettings` accepts an optional third `defaults` argument with the existing object as fallback. Manually call it with a third arg in dev tools: `(await import('/js/data/projectModel.js')).getToolSettings({}, 'nope', { foo: 1 })` — confirm returns `{ foo: 1 }`. Existing callers (grep `getToolSettings(`) untouched.

---

## Phase 2 — Tool UI: organism, color picker primitive, icon, mount wiring

**Goal:** Resize tool appears in the toolbar (image workspace), opens an options panel with every control rendering and persisting to `project.toolSettings.resize`. No Comfy execution yet. Apply button disabled or no-op.

- [x] **2.1 — Create MpiColorPicker primitive**

    New files:
    - `js/components/Primitives/MpiColorPicker/MpiColorPicker.js`
    - `js/components/Primitives/MpiColorPicker/MpiColorPicker.css`

    Use `ComponentFactory.create()`. Render: a button-style trigger showing the current swatch + hex (e.g. `[■] #ff69b4`). On click, open a portaled popup containing:
    - HSV saturation/value square with draggable circular handle.
    - Hue slider with draggable handle.
    - 3 `MpiInput` number fields for R / G / B (0-255, step 1, min 0, max 255).
    - 1 `MpiInput` text field for hex (`#rrggbb`, normalized to lower-case on blur).
    - Swatch preview at the top.

    Two-way sync: dragging HSV controls updates R/G/B + hex; editing R/G/B updates the hex field and visual handles; editing hex updates R/G/B and visual handles. Emit `'change' { r, g, b, hex }` on any committed change. Instance methods: `getRGB()`, `setRGB(r,g,b)`, `setHex(hex)`.

    Document props in `js/components/types.js` (after the existing color-related types or near the end). Register CSS in `js/shell/preloadStyles.js` in the Primitives section.

    **Verify:** Open the component test gallery (`/test-components` or wherever Primitives are previewed). Mount `MpiColorPicker.mount(container, { value: '#ff69b4' })`. Click the swatch — popup opens. Type `0a0a0a` in hex — R/G/B fields show 10/10/10. Type 255 in R — hex updates to `#ff0a0a`. Listener on `'change'` fires with `{ r:255, g:10, b:10, hex:'#ff0a0a' }`.

- [x] **2.2 — Add `resize` icon to icon registry**

    In `js/utils/icons.js`, add a new entry `resize` to the `ICONS` object. Use a Material-Design-style 24x24 SVG path representing scale/resize (e.g. arrows pointing into corners from outside, or a rectangle with corner pull markers). Keep stroke/fill conventions consistent with neighboring entries.

    **Verify:** In dev tools console: `(await import('/js/utils/icons.js')).renderIcon('resize')` — confirm an SVG string is returned (not undefined). Mount a quick `MpiButton.mount(document.body, { icon: 'resize', label: 'test' })` — confirm icon renders without console errors.

- [x] **2.3 — Create MpiToolOptionsResize organism (UI + settings persistence, no Comfy yet)**

    New files:
    - `js/components/Organisms/MpiToolOptionsResize/MpiToolOptionsResize.js`
    - `js/components/Organisms/MpiToolOptionsResize/MpiToolOptionsResize.css`

    Use `ComponentFactory.create()`. Mirror the structure of `MpiToolOptionsCrop.js`. Props: `{ viewer, kind: 'image' | 'video' }`.

    Mounted controls (all exposed, no popups except color picker):
    - **Width** + **Height** — `MpiInput` (`type: 'number'`, min 1, step 1). No aspect lock.
    - **Upscale method** — `MpiDropdown` with options: `nearest`, `exact`, `bilinear`, `area`, `bicubic`, `lanczos` (default), `nvidia_rtx_vsr`.
    - **Keep proportion** — `MpiDropdown` with options: `stretch`, `resize`, `pad`, `pad_edge`, `pad_edge_pixel`, `crop` (default), `pillarbox_blur`, `total_pixels`.
    - **Crop position** — `MpiDropdown` (`center`, `top`, `bottom`, `left`, `right`). Visible only when `keep_proportion === 'crop'`.
    - **Pad color** — `MpiColorPicker`. Visible only when `keep_proportion` is one of `pad | pad_edge | pad_edge_pixel | pillarbox_blur`.
    - **Divisible by** — `MpiInput` (`type: 'number'`, min 1, step 1, default 1).
    - **Flip** — `MpiRadioGroup` (icon-only): `none`, `x` (up/down arrows = "x-axis: vertically"), `y` (left/right arrows = "y-axis: horizontally").
    - **Rotation** — `MpiRadioGroup`: `none`, `90`, `180`, `270`.
    - **Apply** — `MpiButton` (`label: 'Apply'`, `variant: 'primary'`, `size: 'sm'`). For this phase, clicking Apply just emits `'apply'` with the full param object — no Comfy submission yet.

    Persistence:
    - On setup, read `getToolSettings(state.currentProject, 'resize', DEFAULTS)` where `DEFAULTS = { width: <source W or 1024>, height: <source H or 1024>, upscale_method: 'lanczos', keep_proportion: 'crop', pad_color: {r:0,g:0,b:0}, crop_position: 'center', divisible_by: 1, flip: 'none', rotation: 'none' }`. Seed each control with the stored value.
    - On any control change, debounce 300ms then dispatch via `Events.emit('settings:tool:update', { toolKey: 'resize', key, value })` (the existing `projectService` queue picks this up and persists). Or use `projectService` directly if there's a helper — mirror what `MpiToolOptionsUpscale` does for its `upscaleModel` save.

    Lifecycle:
    - On setup, set `viewer.el.activeMode = 'resize'` (new mode — MpiCanvas accepts arbitrary strings since `activeMode` is a setter that only emits `modechange`; if the canvas crashes on unknown modes, add a no-op `'resize'` branch in the activeMode setter).
    - On destroy: `viewer.el.activeMode = 'none'`. Tear down all child component instances (call `_unsubs.forEach(fn => fn())`).
    - Collect Events.on() unsubscribes in `const _unsubs = []`.

    Document props in `js/components/types.js`. Register CSS in `js/shell/preloadStyles.js`.

    **Verify:** Look at the code — confirm all 9 controls render in the order specified. Use a temporary test mount (`MpiToolOptionsResize.mount(document.body, { viewer: someViewer, kind: 'image' })`) and:
    1. Change Width to 768 — within 1s, check `state.currentProject.toolSettings.resize.width === 768`. Wait 2s — `project.json` on disk has `toolSettings.resize.width: 768` (peek via terminal or by reloading the project).
    2. Change keep_proportion to `pad` — crop_position dropdown disappears, pad_color picker appears.
    3. Click Apply — listener on `'apply'` receives the full params object.

- [x] **2.4 — Add resize sub-tool to MpiHistoryTools (image workspace only for now)**

    In `js/components/Compounds/MpiHistoryTools/MpiHistoryTools.js`:

    Replace the existing comment placeholder on line 54 with a real entry in `IMAGE_TOOLS.transform.group`:
    ```js
    { mode: 'crop',   icon: 'crop',   info: 'Crop'   },
    { mode: 'resize', icon: 'resize', info: 'Resize' },
    ```

    Leave `VIDEO_TOOLS` untouched for now (Phase 4 will add resize there).

    **Verify:** Open the app, navigate to an image group history workspace. The left-rail toolbar shows a new Resize button under the Transform group, below Crop. Hover — tooltip says "Resize". Click — `MpiHistoryTools` emits `'activate' { mode: 'resize' }` (check console with a temporary log added in MpiGroupHistoryBlock's tools listener, or via the existing log if there is one).

- [x] **2.5 — Mount MpiToolOptionsResize via MpiGroupHistoryBlock mediator**

    In `js/components/Blocks/MpiGroupHistoryBlock/MpiGroupHistoryBlock.js`:

    1. Import: `import { MpiToolOptionsResize } from '../../Organisms/MpiToolOptionsResize/MpiToolOptionsResize.js';`
    2. Add to `TOOL_OPTIONS_REGISTRY` (line ~54):
       ```js
       const TOOL_OPTIONS_REGISTRY = {
           crop:         MpiToolOptionsCrop,
           mask:         MpiToolOptionsMask,
           videoUpscale: MpiToolOptionsUpscale,
           interpolate:  MpiToolOptionsInterpolate,
           resize:       MpiToolOptionsResize,
           resizeVideo:  MpiToolOptionsResize,  // same compound, video viewer kind
       };
       ```
    3. Add to `TOOL_LABELS` (line ~275): `resize: 'Resize', resizeVideo: 'Resize',`.
    4. In `_handleApply(mode, payload)` (line ~255) add a `resize` / `resizeVideo` branch — for this phase, just `clientLogger.info('MpiGroupHistoryBlock', 'Resize apply payload', payload);` (Phase 3 wires it to Comfy).

    **Verify:** In the image group workspace, click the Resize tool. The `#right-top-slot` shows the new MpiToolOptionsResize panel with all controls. PromptBox is hidden. Click Apply — console shows the logged payload with the current control values. Click Crop tool — Resize panel destroys cleanly, Crop panel mounts. Click Resize again — panel re-seeds from persisted toolSettings (try changing width to 999, switching tools, switching back — width still 999).

---

## Phase 3 — Live preview + Apply (image workspace)

**Goal:** Image-workspace resize tool is end-to-end functional. Live Comfy preview repaints the canvas on every control change (debounced). Apply appends the resized result as a new history entry, preserving the source item.

- [x] **3.1 — MpiCanvas / MpiCanvasViewer resize preview API**

    Add a small API surface so the tool can swap the canvas image to a preview blob and restore on cancel:

    In `js/components/Primitives/MpiCanvas/MpiCanvas.js`:
    - Add `setPreviewImage(blobUrl)` — temporarily replaces the displayed image with a preview blob (without touching `this.img` ownership rules — keep `this.img` as the original `HTMLImageElement`; use a separate `this._previewImg` if needed). See memory `feedback_mpicanvas_img_must_stay_image`.
    - Add `clearPreviewImage()` — restores the original image.
    - Both methods are no-ops if not in `activeMode === 'resize'`.

    In `js/components/Organisms/MpiCanvasViewer/MpiCanvasViewer.js`:
    - Add `enterResizeMode()` / `exitResizeMode()` thin wrappers — call `swapToCanvas()`, set `activeMode = 'resize'`, capture the source image dims and emit them via a new `'resize-source-ready' { width, height }` event so the options panel can seed width/height.
    - Add `setResizePreview(blobUrl)` / `clearResizePreview()` — pass-through to MpiCanvas methods.

    **Verify:** Look at the code — confirm the 4 new methods exist on MpiCanvas and the 4 wrappers on MpiCanvasViewer. Confirm `this.img` is not reassigned to anything other than `HTMLImageElement` in any of the new code paths.

- [x] **3.2 — Live preview round-trip in MpiToolOptionsResize**

    In `MpiToolOptionsResize.js` extend the existing change handlers from Phase 2:

    1. On setup (after seeding controls from toolSettings), listen for `viewer.on('resize-source-ready', ({width, height}) => { _seedDims(width, height); })` only when the persisted toolSettings did not override (i.e. first-time open per project).
    2. On any control change, after persisting toolSettings (debounced 300ms), trigger a **preview re-injection** on a separate **250ms** debounce. Use `AbortController` to cancel any in-flight preview when a new change arrives.
    3. Preview flow:
       - Build a payload identical to the Apply payload, but mark it as a preview (e.g. `previewOnly: true` in the config — note this is **not** the multi-stage `Preview_Only` workflow flag; it's a client-side hint that the result must NOT be persisted to history).
       - Submit via `commandExecutor.runCommand` (or a new thin `commandExecutor.runPreview` wrapper that skips the result-save step).
       - On result, fetch the output image via the existing comfy view URL, convert to blob URL, call `viewer.el.setResizePreview(blobUrl)`.
       - On error, log via `clientLogger.warn` and leave previous preview in place.
    4. Show a small spinner / "Previewing…" indicator in the panel while a preview is in flight.

    **Important:** Preview must NOT call `/project/save-generation`. It must NOT add a history item. The preview image lives only in canvas memory; tool teardown clears it via `clearResizePreview()`.

    **Verify:** Open the Resize tool on an image. Change Width to 256 — within ~1s, the canvas updates to show the resized result. Change keep_proportion to `pad` and pad_color to bright pink — canvas updates to show the padded result with pink borders. Switch tools (e.g. to Crop) — canvas restores to the original full-res image. No new history entry is added during preview changes.

- [x] **3.3 — Apply: commit via save-generation as a new history entry**

    Wire the Apply button flow end-to-end in `MpiGroupHistoryBlock._handleApply`:

    For `mode === 'resize'` (and `'resizeVideo'` in Phase 4):
    1. Determine `currentItem` (the focused image history item).
    2. Call `generationService.startGeneration` with the full resize params and the current item as `mediaItems[0]`. Do **not** pass `replaceItemId`.
    3. Let the existing Group History `generation:complete` listener append the new item, select it, and refresh the viewer/list.
    4. On success, clear the canvas preview (`viewer.el.clearResizePreview()`) and show a success toast.
    5. On error: toast the error message; do not clear preview.

    **Verify:** Open an image group with at least one item. Open the Resize tool, set Width=512, Height=512, keep_proportion=`crop`. Click Apply. Within a few seconds, a success toast appears and the history list has one additional entry named `resize_###`; the original source item remains available. The new entry sidecar has `pixelDimensions.w: 512, pixelDimensions.h: 512` and no `frozenParams` field.

---

## Phase 4 — Video workspace support

**Goal:** Same tool, same UI, video items. The injector already supports the video workflow (title-based lookups); this phase just registers the op, adds the toolbar entry, and exercises the video LoadVideo input path.

- [ ] **4.1 — Add resizeVideo sub-tool to VIDEO_TOOLS + verify video wiring**

    1. In `js/components/Compounds/MpiHistoryTools/MpiHistoryTools.js`, add to `VIDEO_TOOLS.transform.group`:
       ```js
       { mode: 'crop',        icon: 'crop',   info: 'Crop'   },
       { mode: 'resizeVideo', icon: 'resize', info: 'Resize' },
       ```
       (`resizeVideo` op key — same icon as image resize.)
    2. Confirm the existing `MpiGroupHistoryBlock` mediator already handles `mode: 'resizeVideo'` via the registry/labels entries added in Phase 2 (2.5). If TOOL_LABELS or TOOL_OPTIONS_REGISTRY was scoped only to image earlier, double-check both lookups resolve.
    3. In `js/components/Organisms/MpiVideoViewer/MpiVideoViewer.js`, add `enterResizeMode()` / `exitResizeMode()` / `setResizePreview()` / `clearResizePreview()` parallels to the MpiCanvasViewer methods added in Phase 3 (3.1). Video preview = swap the displayed video src to a preview-output URL; tear down on exit.
    4. In `MpiToolOptionsResize`, branch on `kind`:
       - When `kind === 'video'`, the seed dims come from the video sidecar (`videoMeta.width / height`) rather than MpiCanvasViewer's `resize-source-ready` event. Wire whichever source the video viewer exposes.
       - The apply path uses `mediaType: 'video'` on save-generation; the existing generationService video-save branch should handle this.

    **Verify:** Open a video group history workspace. The left toolbar Transform group now shows Crop + Resize. Click Resize. The options panel mounts with seeded width/height matching the source video. Change Width=512, click Apply. Within ~tens of seconds, a new resized video entry is appended while the source video remains available.

---

## Phase 5 — Docs, rules, follow-up kanban entry

**Goal:** Documentation and rule files reflect the new tool. New kanban entry created to track the crop+mask UI refresh and toolSettings parity.

- [ ] **5.1 — Sync `.claude/rules/*.md` files**

    1. `.claude/rules/component-comfy.md` — add two rows in the operations table (around line 131-150 per investigation):
       ```
       | `resize`      | Resize       | image | 1 | — | — | no | (none) | universal |
       | `resizeVideo` | Resize Video | video | 0 | 1 | — | no | (none) | universal |
       ```
       Plus a short note in the Injection section: "Resize uses a standalone injector (`js/services/workflowInjectors/resizeInjector.js`) routed via the `injector` field on the op definition. It does not go through `_buildParams` for its tool-specific params."
    2. `.claude/rules/component-events.md` — add `resize → MpiToolOptionsResize` and `resizeVideo → MpiToolOptionsResize` to the TOOL_OPTIONS_REGISTRY snippet and the prose list of video tool options (line ~488 per investigation). Document that Apply appends a new history entry and does not replace the source item.
    3. `.claude/rules/component-mounts.md` — update the Image and Video mode tool lists (line ~52-59): `prompt, crop, mask, resize` and `prompt, crop, videoUpscale, interpolate, resizeVideo`. Update the TOOL_OPTIONS_REGISTRY snippet to match component-events.md.
    4. `.claude/rules/component-state.md` — add `project.toolSettings.resize` to the toolSettings section with the full shape: `{ width, height, upscale_method, keep_proportion, pad_color: {r,g,b}, crop_position, divisible_by, flip, rotation }`. Persisted via `updateProjectJson`. Restored via `getToolSettings(project, 'resize', defaults)`.

    **Verify:** Look at the four rule files — confirm each contains the new resize entries described above. Run a grep for `resize` across `.claude/rules/` — count matches per file matches the expected updates.

- [ ] **5.2 — Sync `docs/` files**

    1. `docs/PROJECT.md` — no structural change; if there is a universal commands list, add `resize` and `resizeVideo` to it.
    2. `docs/comfy.md` — add a short "Workflow injectors" subsection under or near the existing "Workflow Injection Pattern" section: when an op declares `injector: '<name>'`, executor delegates workflow JSON mutation to `js/services/workflowInjectors/<name>Injector.js`. Used for tool-panel-driven utility workflows (resize, future: paint, color-correct).
    3. `docs/project-integrity.md` — extend the `toolSettings` schema doc with the resize key shape.

    **Verify:** Look at the three doc files — confirm each has the new resize-related content. Open `docs/PROJECT.md` and search for `resize`; open `docs/comfy.md` and search for `injector`; open `docs/project-integrity.md` and search for `toolSettings.resize`.

- [ ] **5.3 — Create follow-up kanban entry "Tool panel UI refresh — Stage mockup match"**

    Add a new BACKLOG entry to `.claude/mpi-kanban/kanban.md` (insert at top of BACKLOG):

    ```md
    ### Tool panel UI refresh — Stage mockup match

      - tags: [feature, design, ux]
      - priority: medium
      - workload: Normal
      - defaultExpanded: true
        ```md
        Refresh MpiToolOptionsCrop + MpiToolOptionsMask to match the Stage
        mockup language used by MpiToolOptionsResize (caps-tracked section
        headers, source-metadata block, primitive-driven controls). Plus
        wire crop + mask param persistence to `project.toolSettings.crop`
        and `project.toolSettings.mask` for parity with resize.

        Scope:
        - Visual refresh only (no behavior changes) for crop + mask panels.
        - Add `project.toolSettings.crop` (family, orientation, ratio) and
          `project.toolSettings.mask` (brushSize, feather, opacity, target)
          persisted on every change via the same projectService queue
          resize uses.
        - Restore last-used settings when each tool reopens.
        - Coordinate with existing entry "When applying a crop, the crop
          box goes away." — that entry's "update looks of crop box" line
          may be subsumed here; check before starting.
        ```
    ```

    **Verify:** Open `.claude/mpi-kanban/kanban.md` in the Kanban view (or read it). Confirm the new entry exists at the top of BACKLOG with the body above.

---

## Out of scope (this plan)

- Free transform handles (rotate/skew/perspective on canvas) — keep_proportion modes cover transform intent.
- Crop + Mask tool panel redesign — separate kanban entry created in Phase 5.3.
- Hotkeys for resize / flip / rotate — explicitly deferred.
- Exposing the `device` parameter (CPU/GPU) — hardcoded to `cpu`.
- Aspect ratio lock on W/H — explicitly out per design discussion.

## Files touched (forecast)

- `js/data/modelConstants/dependencies.js`
- `js/data/modelConstants/universal_workflows.js`
- `js/data/commandRegistry.js`
- `js/data/projectModel.js`
- `js/services/commandExecutor.js`
- `js/services/workflowInjectors/resizeInjector.js` (new)
- `js/services/workflowInjectors/index.js` (new)
- `js/components/Primitives/MpiColorPicker/MpiColorPicker.{js,css}` (new)
- `js/components/Organisms/MpiToolOptionsResize/MpiToolOptionsResize.{js,css}` (new)
- `js/components/Compounds/MpiHistoryTools/MpiHistoryTools.js`
- `js/components/Blocks/MpiGroupHistoryBlock/MpiGroupHistoryBlock.js`
- `js/components/Primitives/MpiCanvas/MpiCanvas.js`
- `js/components/Organisms/MpiCanvasViewer/MpiCanvasViewer.js`
- `js/components/Organisms/MpiVideoViewer/MpiVideoViewer.js`
- `js/components/types.js`
- `js/shell/preloadStyles.js`
- `js/utils/icons.js`
- `.claude/rules/component-comfy.md`
- `.claude/rules/component-events.md`
- `.claude/rules/component-mounts.md`
- `.claude/rules/component-state.md`
- `docs/PROJECT.md`
- `docs/comfy.md`
- `docs/project-integrity.md`
- `.claude/mpi-kanban/kanban.md` (Phase 5.3 follow-up entry + this plan's PLANNING transition)
