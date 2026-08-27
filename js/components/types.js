/**
 * js/components/types.js — Shared Component Type Definitions for Cubric Studio.
 * 
 * This file acts as the single source of truth for component properties, 
 * variants, and state. Use these Types in JSDoc to help AI agents (and 
 * human developers) understand exactly what configuration a component 
 * expects without scanning logic.
 */


'use strict';

/**
 * @typedef {Object} MpiCanvasProps (Primitive — js/components/Primitives/MpiCanvas)
 * @property {(size: number) => void} [onBrushSizeChange] - Called when brush size changes via wheel in mask mode
 * @property {(type: string) => void} [onBrushTypeChange] - Called when brush type changes via hotkey (b/e)
 * @property {(count: number) => void} [onPointsChange] - Called when a point prompt is added or removed
 * @property {() => void} [onMaskStrokeEnd] - Called once per finished paint/erase stroke (MPI-372)
 *
 * Active modes (canvas.el.activeMode): 'none' | 'mask' | 'crop' | 'compare'
 * Setting any mode automatically deactivates all others (mutual exclusion).
 *
 * Instance methods (on instance.el):
 *   loadImage(url)            — load primary image; resets mode to 'none'
 *   loadComparisonImage(url)  — load secondary; sets mode to 'compare'
 *   clearImage()              — clear canvas; resets mode to 'none'
 *   resetView()               — fit image to container
 *   setGrid(h, v)             — draw overlay grid lines
 *   setMaskingMode(bool)      — shorthand for activeMode = 'mask'/'none'
 *   setBrushSize(size), setBrushType(type), flipMaskColor(),
 *   setMaskOpacity(opacity), clearMask(), getMaskDataURL(bg, fg)
 *   setMaskBwView(bool)       — display the mask opaque B/W instead of tinted
 *   setMaskPaintEnabled(bool) — arm/disarm brush painting for the active tool
 *   undoMask() / redoMask()   — MPI-376; restores the manual + subtract layers
 *                               and fires onMaskStrokeEnd so the op strip resyncs
 *   clearMaskUndo()           — drop history WITHOUT touching pixels (after a load)
 *   canUndoMask() / canRedoMask()
 *   setCropRatio(ratio), setCropSize(w, h), getCropRect()
 *                             — the crop rect may sit PARTLY OUTSIDE the image
 *                               (MPI-383); getCropRect can return negative x/y
 *   destroy()                 — remove canvas + detach all window listeners
 *
 * Emits:
 *   'modechange' { mode: string } — fired whenever activeMode changes
 */

/**
 * @typedef {Object} MpiMaskedImagePreviewProps (Primitive — js/components/Primitives/MpiMaskedImagePreview)
 * No props required.
 *
 * Lightweight image + mask preview for Prompt tool mode. Two <img> elements in a
 * CSS-transform stack. Pan/zoom via ViewManager. No GPU canvas backing.
 *
 * Instance methods (on instance.el):
 *   loadImage(url)          — load image; resets view to contain
 *   setMaskDataURL(dataUrl) — show painted mask as CSS mask-image overlay (PNG dataURL)
 *   clearMask()             — hide mask overlay
 *   destroy()               — remove event listeners, disconnect ResizeObserver
 */

/**
 * @typedef {Object} MpiToolOptionsCropProps (Organism — js/components/Organisms/MpiToolOptionsCrop)
 * @property {Object} viewer - MpiCanvasViewer OR MpiVideoViewer instance
 * @property {'image'|'video'} kind
 *
 * Three resolution types: ratio, free, and resolution (exact W×H, the only one
 * that resamples — MPI-383). Image kind also gets the fill colour used for
 * whatever the crop selects beyond the source; video hides both, since the
 * video path crops and cannot pad. Requires viewer.el: setCropRatio(ratio) and,
 * for images, setCropSize(w, h).
 *
 * Emits: 'apply' { kind: 'image' | 'video-save' | 'video-snapshot' }
 */

/**
 * @typedef {Object} MpiToolOptionsMaskBrushProps (Organism — js/components/Organisms/MpiToolOptionsMaskBrush)
 * @property {Object} viewer - MpiCanvasViewer instance
 *
 * The hand-painting tool of the mask family (MPI-381) and the ONLY tool that
 * paints. Owns nothing of its own — it is MpiMaskStrip WITH its brush pair.
 * Requires viewer.el: enterMode('mask'), exitMode(), evaluateMask(),
 *   setMaskPointsMode()
 * No 'apply' emitted — mask is canvas-resident; PromptBox drives operations.
 */

/**
 * @typedef {Object} MpiToolOptionsMaskAdjustProps (Organism — js/components/Organisms/MpiToolOptionsMaskAdjust)
 * @property {Object} viewer - MpiCanvasViewer instance
 * @property {'maskAdjust'|'paintAdjust'} [mode='maskAdjust'] - which layer to drive
 *
 * A method OVER an existing layer (MPI-382 mask, MPI-436 paint), not another way of
 * making one. One bidirectional Shrink / Grow slider, an Edge button that swaps that
 * ONE row for Outward + Inward, plus Apply and Reset; mounts MpiMaskStrip WITHOUT the
 * brush pair, pointed at this layer. Live preview — an unapplied adjustment is
 * DISCARDED on leaving the tool, through the shared discardPreview seam.
 *
 * ONE panel registered under TWO modes, the MPI-368 / MPI-373 pattern: `props.mode`
 * picks a row in `DEST` and nothing else branches. On paint this is the OUTLINE tool,
 * so that destination adds a colour picker (grow's new ring and the band are filled in
 * it) and drops Fill, which is a mask idea.
 *
 * Fill (MPI-431, mask only) closes enclosed holes — the graphs no longer do it — and
 * bakes any live preview with it as ONE undo entry.
 * Requires viewer.el: enterMode(), exitMode(), and per destination —
 *   mask  — evaluateMask(), setMaskPointsMode(), beginMaskAdjust(),
 *           previewMaskAdjust(), applyMaskAdjust(), endMaskAdjust(), fillMaskHoles()
 *   paint — setPaintColor(), beginPaintAdjust(), previewPaintAdjust(),
 *           applyPaintAdjust(), endPaintAdjust()
 * No 'apply' emitted — both layers are canvas-resident; PromptBox drives operations.
 */

/**
 * @typedef {Object} MpiToolOptionsMaskDetectProps (Organism — js/components/Organisms/MpiToolOptionsMaskDetect)
 * @property {Object} viewer - MpiCanvasViewer instance
 *
 * The YOLO tool of the mask family (MPI-371). Owns the model + box/segment
 * radios; mounts MpiMaskDetectRow and MpiMaskStrip WITHOUT the brush pair.
 * Requires viewer.el: enterMode('mask'), exitMode(), evaluateMask(),
 *   setMaskPointsMode(), getDetectionModels?(), setAutoMaskModel(),
 *   setAutoMaskUseBox()
 * No 'apply' emitted — mask is canvas-resident; PromptBox drives operations.
 */

/**
 * @typedef {Object} MpiToolOptionsMaskPointsProps (Organism — js/components/Organisms/MpiToolOptionsMaskPoints)
 * @property {Object} viewer - MpiCanvasViewer instance
 *
 * The click-point (SAM3) tool of the mask family. Owns the click instructions
 * and Clear points; mounts MpiMaskDetectRow and MpiMaskStrip WITHOUT the brush
 * pair. The Scope dial went away with MPI-380 — SAM3's point path has no
 * threshold, so there was nothing left for it to drive.
 * Requires viewer.el: enterMode('mask'), exitMode(), evaluateMask(),
 *   setMaskPointsMode(), clearMaskPoints()
 * No 'apply' emitted — mask is canvas-resident; PromptBox drives operations.
 */

/**
 * @typedef {Object} MpiToolOptionsMaskTextProps (Organism — js/components/Organisms/MpiToolOptionsMaskText)
 * @property {Object} viewer - MpiCanvasViewer instance
 *
 * The open-vocabulary (SAM3 text) tool of the mask family. Owns the name field
 * and the count; mounts MpiMaskDetectRow and MpiMaskStrip WITHOUT the brush
 * pair. The count is stamped into the prompt as `name:N` per category — SAM3
 * reads that suffix as the detection cap and a bare category returns ONE object.
 * Requires viewer.el: enterMode('mask'), exitMode(), evaluateMask(),
 *   setMaskPointsMode(), setMaskTextMode(), setMaskTextPrompt()
 * No 'apply' emitted — mask is canvas-resident; PromptBox drives operations.
 */

/**
 * @typedef {Object} MpiToolOptionsUpscaleProps (Organism — js/components/Organisms/MpiToolOptionsUpscale)
 * @property {Object} viewer - MpiVideoViewer instance
 * @property {'image'|'video'} [kind='video'] - Persistence key + which plugin entries list
 * Emits: 'apply' { factor: number, model: string, pluginId?: string, values?: Object }
 *   `model` is an upscale-model filename, '' for None, or a plugin dep key
 *   (`plugin:<id>`) when a plugin contributed the entry (MPI-580). `pluginId` and the
 *   plugin's declared control `values` (UNMAPPED — the dispatcher applies `mapTo`)
 *   ride along only for a plugin entry.
 */

/**
 * @typedef {Object} MpiToolOptionsRemoveBgProps (Organism — js/components/Organisms/MpiToolOptionsRemoveBg)
 * @property {Object} viewer - MpiCanvasViewer instance
 * Emits: 'apply' { bgMode: 'transparent'|'color', color: '#rrggbb' }
 */

/**
 * @typedef {Object} MpiToolOptionsInterpolateProps (Organism — js/components/Organisms/MpiToolOptionsInterpolate)
 * @property {Object} viewer - MpiVideoViewer instance
 * Emits: 'apply' { multiplier: number }
 */

/**
 * @typedef {Object} MpiToolOptionsResizeProps (Organism — js/components/Organisms/MpiToolOptionsResize)
 * @property {Object} viewer - MpiCanvasViewer OR MpiVideoViewer instance
 * @property {'image'|'video'} kind
 * @property {Object|null} [currentItem] - Selected history item used to seed source dimensions
 *
 * Persists project.toolSettings.resize:
 * { width, height, upscale_method, keep_proportion, pad_color: {r,g,b},
 *   crop_position, divisible_by, flip, rotation }
 *
 * Image mode runs debounced live previews via commandExecutor without saving
 * history. Emits: 'apply' full resize params object; parent block appends the
 * resized result as a new history entry.
 */

/**
 * @typedef {Object} MpiToolOptionsGifProps (Organism — js/components/Organisms/MpiToolOptionsGif)
 * @property {Object} viewer - MpiVideoViewer instance (registry-uniform signature; unused directly)
 *
 * Video-only GIF EXPORT (not a history op). Persists project.toolSettings.exportGif:
 * { fps, sizePreset, loop }. Parent injects the encoder via el.setEncoder(fn)
 * (fn(params) → Promise<{ url, byteSize, fileName }> via POST /api/video/gif) and
 * reads el.getExportParams(). "Generate preview" encodes a real GIF → inline
 * animated preview + real file-size badge. Emits: 'apply' { url?, fileName? } —
 * parent saves via native Save-As (<a download>); empty payload = encode on demand.
 */

/**
 * @typedef {Object} MpiToolOptionsPromptProps (Organism — js/components/Organisms/MpiToolOptionsPrompt)
 * @property {Object} promptBox - Live MpiPromptBox instance handle (mount return)
 * @property {Object} project - Current project { id, folderPath } for thumb drop uploads
 *
 * Renders two role-tagged frame thumb slots (startFrame / endFrame) with a
 * swap button between them and Extend / Create new action buttons.
 * Mirrors PromptBox media chips via the `media-change` event.
 *
 * Emits via Events bus:
 *   'prompt-box-tools:extend'
 *   'prompt-box-tools:create-new'
 *
 * Requires PromptBox instance API: getMediaByRole(role), removeMediaByRole(role),
 *   swapMediaRoles(roleA, roleB), injectMedia({ url, mediaType, role }).
 */

/**
 * @typedef {Object} MpiColorPickerProps (Primitive — js/components/Primitives/MpiColorPicker)
 * @property {string|{r:number,g:number,b:number}} [value='#000000'] - Initial RGB or #rrggbb color
 * @property {string} [info] - Info Bar description
 *
 * HSV visual picker with saturation/value square, hue slider, and RGB/hex
 * precision inputs. Supports pointer dragging and keyboard arrow adjustment.
 *
 * Instance methods (on instance.el):
 *   getRGB()          — returns { r, g, b }
 *   setRGB(r, g, b)   — updates color and emits change
 *   setHex(hex)       — updates color from #rrggbb and emits change
 *   getHex()          — returns #rrggbb
 *
 * Emits: 'change' { r, g, b, hex }
 */

/**
 * MpiOptionSelector `buttons` variant (extends MpiOptionSelector):
 *   buttons: [{ icon, label?, value, info? }]
 *   triggerIcon?, triggerSize?, triggerVariant?, triggerActive?, popupTitle?, info?
 * Instance methods (el): setButtons(arr), setTriggerIcon(icon), setTriggerActive(bool), getButtons()
 * Emits: 'change' { value, def }, 'popup_toggle' { active }
 */

/**
 * @typedef {Object} MpiAutoMaskThumbsProps (Compound — js/components/Compounds/MpiAutoMaskThumbs)
 * No props required — all state is managed imperatively.
 *
 * Instance methods (on instance.el):
 *   setImages(urls: string[]) — replace the thumbnail list; clears selection
 *   clear()                  — remove all thumbnails and reset selection
 *   getPicks()               — returns a copy of the current Set<number> of selected indices
 *   clearPicks()             — deselect all thumbnails without removing them
 *
 * Emits:
 *   'change' { picks: Set<number> } — any thumbnail toggled; picks = selected 0-based indices
 */

/**
 * @typedef {Object} MpiMaskStripProps (Compound — js/components/Compounds/MpiMaskStrip)
 * @property {Object}  viewer      - MpiCanvasViewer instance
 * @property {boolean} [brush=true] - Show the paint / erase pair and bind the B / E hotkeys.
 * @property {'mask'|'paint'} [dest='mask'] - Which layer the controls drive (MPI-375).
 *
 * The shared bottom strip of EVERY mask tool (MPI-371): paint / erase · invert ·
 * B/W view · clear · opacity. Tools where a brush makes no sense (Points,
 * Detect) pass `brush: false` and get the rest alone — and that same prop
 * disarms canvas painting for the tool (MPI-381). Opacity, invert and the B/W
 * view persist under the tool key of the active destination.
 *
 * MPI-375 made it destination-driven: `dest: 'paint'` points the same controls at
 * the RGBA paint layer, drops invert and B/W view (display toggles that only mean
 * something for a binary mask) and persists under the `paint` key. Destinations are
 * ROWS in the module's `DESTINATIONS` table, never branches in setup().
 *
 * MPI-435 added the brush PRESET picker — ten procedural dabs off the one shared
 * `brushDab.js`, so it belongs to the strip rather than to each tool panel. It is a
 * destination row like everything else: composite declares no preset setter and the
 * row is REMOVED, because a composite cut is hard for the same reason it has no
 * opacity slider. A brushless tool (`brush: false`) loses it too.
 *
 * Requires viewer.el, per destination:
 *   mask  — setMaskBrushMode('brush'|'eraser'), setMaskBrushPreset(id),
 *           setMaskInverted(), isMaskInverted(), setMaskBwView(), isMaskBwView(),
 *           setMaskPaintEnabled(), clearMask(), setMaskOpacity()
 *   paint — setPaintBrushMode('brush'|'eraser'), setPaintBrushPreset(id),
 *           setPaintEnabled(), clearPaint(), setPaintOpacity()
 * Emits nothing.
 */

/**
 * @typedef {Object} MpiToolOptionsPaintProps (Organism — js/components/Organisms/MpiToolOptionsPaint)
 * @property {Object} viewer - MpiCanvasViewer instance
 *
 * The Paint tool (MPI-375) — the whole Paint GROUP for now. A colour picker, Apply,
 * and MpiMaskStrip with `dest: 'paint'`. Paint is an INPUT to the models, not
 * decoration: rough in a shape, mask it, run detail over it.
 *
 * NOT a mask tool (it is in `_PAINT_TOOLS`, not `_MASK_TOOLS`) but it DOES keep the
 * PromptBox, because paint → mask → detail is one operation. NOT a preview either,
 * so it does not extend discardPreview() — paint strokes are committed pixels.
 *
 * Requires viewer.el: enterMode('paint'), exitMode(), setPaintColor(), applyPaint(),
 *   plus the paint destination surface MpiMaskStrip drives
 * No 'apply' emitted — Apply calls the viewer directly (a server-side flatten).
 */

/**
 * @typedef {Object} MpiToolOptionsShapesProps (Organism — js/components/Organisms/MpiToolOptionsShapes)
 * @property {Object} viewer - MpiCanvasViewer instance
 * @property {'maskShapes'|'paintShapes'} mode - which mount; decides the destination
 *
 * The Shapes tool (MPI-368) — ONE panel registered under TWO modes, one per
 * destination, driving ONE gizmo (`ShapeManager`). Rectangle / triangle / ellipse
 * with handles and ALT-rotation, committed into the binary mask layers or the RGBA
 * paint layer. Per-mount differences are ROWS in the module's `MOUNTS` table, never
 * branches in setup(); an unknown mode throws rather than silently driving the mask.
 *
 * Commit vocabulary differs per destination on purpose: mask = Add / Subtract,
 * paint = Fill / Erase ("subtract" already names a mask layer).
 *
 * The shape SURVIVES its commit (stamp again by dragging), but an uncommitted gizmo
 * is a PREVIEW — `discardPreview()` drops it on any rail switch. Brushless: the strip
 * mounts `brush: false`, which also disarms canvas painting so a drag pans.
 *
 * Requires viewer.el: enterMode('mask'|'paint'), exitMode(), evaluateMask(),
 *   setMaskPointsMode(), setShapeMode(), setShapeKind(), getShapeKind(),
 *   resetShape(), clearShape(), commitShape()
 * Emits nothing — a committed shape is layer pixels.
 */

/**
 * @typedef {Object} MpiToolOptionsCompositeProps (Organism — js/components/Organisms/MpiToolOptionsComposite)
 * @property {Object} viewer - MpiCanvasViewer instance
 * @property {'maskComp'|'paintComp'} mode - which front end; decides where the cut comes from
 * @property {Object} [clipboard] - app-local buffer accessors: { hasImage, getImage }
 *
 * The Composite group (MPI-373) — ONE panel under TWO modes, the same pattern as
 * MpiToolOptionsShapes and for the same reason. The selected entry is image 1 and
 * sits ON TOP; a slot holds image 2, underneath; a hole through image 1 reveals it.
 * `paintComp` cuts that hole live with the brush, `maskComp` takes it from the mask
 * already on the selected entry. Per-mount differences are ROWS in the module's
 * `MOUNTS` table; an unknown mode throws.
 *
 * ONE slot, seeded on mount from `Send to Composite` on the CANVAS context menu — not
 * by selecting two entries, which is what made the retired MPI-362 modal restart every
 * time the selection changed. There is no mask slot (user, 2026-08-04).
 *
 * The ONLY group that drops the PromptBox (`_COMPOSITE_TOOLS` is absent from
 * `_modeKeepsPromptBox`): it ends at its own Apply and needs the column for the slot.
 * The whole preview is scratch — `discardPreview()` drops the cut AND the underlay.
 *
 * Requires viewer.el: enterMode('composite'), exitMode(), setCompositeUnderlay(),
 *   setCompositeHoleFromMask(), hasCompositeHole(), getCompositeURL(), clearComposite(),
 *   setOnCompositeChange()
 * Emits: 'composite-apply' { overlayUrl, maskDataUrl } — the Block runs the blend.
 */

/**
 * @typedef {Object} MpiToolOptionsPlaceProps (Organism — js/components/Organisms/MpiToolOptionsPlace)
 * @property {Object} viewer - MpiCanvasViewer instance
 * @property {'placeComp'} mode - which mount this is
 * @property {Object} [clipboard] - the Send to Composite buffer: { hasImage, getImage }
 * @property {Object} [place] - the Block's Place accessors:
 *   { getImage, setImage, removeBackground, importFile }
 *
 * The THIRD composite front end (MPI-454), and the one that INVERTS the stack: the slot
 * image goes ON TOP at a size and angle a gizmo decides, and its OWN ALPHA is the cut —
 * no hole, no mask, nothing to brush. Its own component rather than a third row in
 * MpiToolOptionsComposite's `MOUNTS` table, because it shares no control with the two
 * hole-cutters.
 *
 * The slot has THREE ORIGINS, not three ways to do one thing: a file dropped on the
 * History workspace, MpiMediaPicker on an empty-slot click (project media plus the
 * filesystem), and right-click Paste off the Send to Composite buffer.
 *
 * The gizmo is the SHAPE gizmo with a third destination (`setShapeMode('place')`), so
 * Shift's aspect lock and Alt-rotate are inherited rather than reimplemented. Remove
 * Background is a TOGGLE, run on the slot image with `deferCommit` so the cut-out is
 * never committed to the project; toggling it off restores the original pixels from
 * memory with no second dispatch.
 *
 * Requires viewer.el: enterMode('composite'), exitMode(), setCompositeEnabled(),
 *   setShapeMode(), clearShape(), resetShape(), setPlaceImage(), hasPlaceImage(),
 *   applyPlace()
 * Instance methods (on instance.el): setSlotImage(v) — a drop while the tool is ALREADY
 *   open does not remount the panel, so this is how the second drop lands.
 * No 'apply' emitted — Apply calls the viewer directly, exactly as the Paint tool's does.
 */

/**
 * @typedef {Object} MpiMediaSlotProps (Compound — js/components/Compounds/MpiMediaSlot)
 * @property {string} label - shown when empty, e.g. 'Image underneath'
 * @property {string} [empty] - hint under the label; defaults to the paste hint
 * @property {()=>boolean} canPaste - is there something on the copy buffer
 * @property {()=>{url: string, name?: string}|null} readPaste - take it off the buffer
 * @property {Function} [onEmptyClick] - clicking the EMPTY slot calls this INSTEAD of the
 *   shortcut paste (MPI-454). Place passes it to open MpiMediaPicker; omit it and the
 *   shortcut is unchanged, which is what the two hole-cutting front ends want.
 *
 * A one-media drop point (MPI-373) — the Composite group's slot. Right-click opens
 * Paste / Clear (rows are conditional, never greyed); a left click on an empty slot
 * pastes as a shortcut, and the panel seeds it with `setValue()` on mount. Deliberately
 * dumb: it knows a label, a thumbnail URL and a menu — what a filled value MEANS
 * belongs to the panel.
 *
 * Instance methods (on instance.el): getValue() → {url, name}|null, setValue(v), clear()
 * Emits: 'change' { url: string|null, name: string|null }
 */

/**
 * @typedef {Object} MpiMaskDetectRowProps (Compound — js/components/Compounds/MpiMaskDetectRow)
 * @property {Object} viewer - MpiCanvasViewer instance
 *
 * The run / commit row shared by every detection-based mask tool: thumbs ·
 * Detect · Add / Subtract, blocked as a unit while Cue has real jobs.
 * The thumbs node is OWNED BY THE VIEWER — re-parented here, never destroyed.
 *
 * Requires viewer.el: getAutoMaskThumbsEl?(), runAutoMaskDetect(),
 *   bakeAutoPicks('manual'|'subtract')
 * Emits nothing.
 */

/**
 * @typedef {Object} MpiHistoryToolsDisabledEntry
 * @property {boolean} disabled - Whether the tool button renders grayed / non-interactive.
 * @property {string}  [reason] - Tooltip text explaining the disabled state.
 */

/**
 * @typedef {Object} MpiHistoryToolsProps (Compound — js/components/Compounds/MpiHistoryTools)
 * @property {'image'|'video'} mode - Selects the built-in tool list for the workspace.
 *
 * Built-in image tools: prompt, crop, resize, mask.
 * Built-in video tools: prompt, crop, videoUpscale, interpolate.
 *
 * Instance methods (on instance.el):
 *   setMode(mode)      — programmatically activate a mode; emits 'activate { mode }'.
 *                        No-op if mode === current active mode, or mode not in the list.
 *   setDisabled(map)   — bulk update disabled state. Shape:
 *                        { [toolMode: string]: MpiHistoryToolsDisabledEntry }.
 *                        Accepts top-level modes (e.g. 'mask', 'crop').
 *   getActiveMode()    — read current active mode (null if none).
 *
 * Emits:
 *   'activate' { mode: string } — fired on any mode change (user click or setMode).
 *                                 Radio-style; no 'deactivate' event.
 */

/**
 * @typedef {Object} MpiModalProps (Primitive — js/components/Primitives/MpiModal)
 * @property {string}   [width='min(480px, 90vw)'] - CSS width of the centred wrapper.
 * @property {boolean}  [backdropClose=true]        - Whether clicking the backdrop calls hide().
 * @property {Function} [onShow]                    - Called once the portal DOM is appended.
 *
 * Instance methods (on instance.el):
 *   show() — portals backdrop + wrapper to document.body, registers with OverlayManager.
 *   hide() — removes portal nodes, releases OverlayManager. Does NOT emit 'cancel'.
 *
 * Usage (inside a Compound setup):
 *   const modal = MpiModal.mount(document.createElement('div'), { width: 'min(440px, 90vw)' });
 *   modal.el.appendChild(el);           // put compound content inside the shell
 *   el.show = () => modal.el.show();
 *   el.hide = () => modal.el.hide();
 */

/**
 * @typedef {Object} MpiDropdownProps (Primitive — js/components/Primitives/MpiDropdown)
 * @property {Array<string|{label:string,value:string,meta?:string,description?:string,detail?:string,disabled?:boolean,info?:string,icon?:string}>} [options=[]] - Option list. `meta` is the right-hand detail, ellipsised at 11ch. An option's `icon` (an icons.js key) turns that meta into a standing FLAG instead — accent-coloured, sized to its content, never dimmed by hover or selection — for a short label the row must always carry, e.g. the Flow model picker's `icon: 'sparkle', meta: 'Recommended'` (MPI-599)
 * @property {string} [value=''] - Currently selected value
 * @property {string} [placeholder='Select...'] - Placeholder text (empty/unselected label)
 * @property {boolean} [disabled=false] - Disabled state
 * @property {'up'|'down'} [direction='down'] - Preferred open direction
 * @property {string} [info] - Info Bar description
 * @property {string} [extraClasses=''] - Additional BEM modifier/helper classes on the root
 * @property {boolean} [wrapLabels=false] - Allow option labels to wrap in the list
 *
 * Emits:
 * 'change' { value: string, label: string }
 */

/**
 * @typedef {Object} MpiStylePickerProps (Primitive — js/components/Primitives/MpiStylePicker)
 * A trigger button + floating, horizontally-scrolling grid of image cards for
 * picking a style LoRA. Replaces MpiDropdown for style selection but keeps an
 * INDEX value contract (emits the selected index int). Card 0 is the "None" card
 * (falls back to a "None" placeholder card when it has no image; supply one to
 * show art there too). The grid is portalled to document.body and anchored above
 * the trigger (the prompt box sits at the viewport bottom).
 * @property {Array<{label:string, image?:string}>} [styles=[]] - Index-aligned style entries; index 0 = None (uses its image if given, else a placeholder)
 * @property {number} [value=0] - Selected index
 * @property {string} [imageBase='comfy_workflows/display/'] - Path prefix for card images
 * @property {string} [info] - Info Bar description forwarded to the trigger
 *
 * Emits:
 * 'change' { index: number, label: string }
 */

/**
 * @typedef {Object} MpiTreePickerProps (Primitive — js/components/Primitives/MpiTreePicker)
 * Searchable folder-tree picker for path-shaped option lists (MPI-233). Drop-in
 * alternative to MpiDropdown — value stays the full path string so upstream
 * heal/resolve/inject logic is untouched. First consumer: LoRA slots in
 * MpiModelSettings; reuse anywhere a large list of `Folder\Sub\file.ext` values
 * needs search + folder structure.
 * @property {Array<{label:string,value:string,disabled?:boolean}>} [options=[]] - Option list; the entry with value '' becomes the pinned clear row, disabled entries render as pinned non-selectable rows above the tree
 * @property {string} [value=''] - Selected full path
 * @property {string} [placeholder='Select...'] - Trigger label when nothing selected
 * @property {string} [searchPlaceholder='Search…'] - Placeholder inside the search input
 * @property {string} [fileIcon='image'] - icons.js key for file-row icons
 * @property {boolean} [stripExtension=false] - Hide the file extension in row/trigger labels (the stored value keeps the full path)
 * @property {string} [extraClasses=''] - Root modifier (e.g. 'mpi-tree-picker--missing' for the red invalid state)
 *
 * Emits:
 * 'change' { value: string, label: string }
 */

/**
 * @typedef {Object} MpiRadioGroupProps (Primitive — js/components/Primitives/MpiRadioGroup)
 * @property {Array<string|{label:string,value:string}>} [options=[]] - Option list
 * @property {string} [value=''] - Currently selected value
 * @property {string} [name='radio'] - Accessible group name
 * @property {string} [info] - Info Bar description
 *
 * Emits:
 * 'select' { value: string }
 */

/**
 * @typedef {Object} MpiTileSheetItem (MPI-356)
 * @property {string} id - Unique; the key for patchState/setWaiting/setSelected
 * @property {string} name - Primary label
 * @property {'image'|'video'} [media='image'] - Drives 4:5 vs 16:9 thumb aspect
 * @property {string} [preview] - Filename under comfy_workflows/display/
 * @property {string} [meta] - Second label line (e.g. "VIDEO · High")
 * @property {boolean} [showMediaBadge] - Render the Image/Video pill
 * @property {boolean} [featured] - Gold sparkle flag on the thumb (editorial spotlight)
 * @property {boolean} [deprecated] - Warning flag on the thumb (model is on its way out)
 * @property {boolean} [dot] - Recently-installed heat dot
 * @property {boolean} [waiting] - Queued-install waiting mascot
 * @property {string} [state] - HTML for the fixed-height bottom row
 * @property {boolean} [selected] - Renders the tile as the current choice
 * @property {*} [source] - Consumer payload, echoed back on select
 */

/**
 * @typedef {Object} MpiTileSheetProps (Primitive — js/components/Primitives/MpiTileSheet)
 * @property {MpiTileSheetItem[]} [items=[]] - Tiles to render, in order
 * @property {Map<string,HTMLElement>} [previewCache] - Consumer-owned Map keyed by
 *   item id. When passed, thumb `<img>`/`<video>` elements are built once and
 *   RE-PARENTED on every rebuild instead of re-created, so a grid that rebuilds
 *   never goes blank (MPI-394). Required for any surface whose sheets are torn
 *   down and remounted on a state change; omit for one-shot sheets.
 *
 * Shared by the Model Library, the App Library and the model picker. Consumers own
 * their own status logic and pass the bottom row in as HTML (`item.state`).
 *
 * Instance methods (on instance.el):
 *   setItems(items) · patchState(id, html) · setWaiting(id, bool) ·
 *   setSelected(id|null) · getTile(id)
 *
 * Emits:
 * 'select' { id: string, item: MpiTileSheetItem }
 */

/**
 * @typedef {Object} MpiDropdownCompoundProps (Compound — js/components/Compounds/MpiDropdown)
 * @property {string[]} titles - Options to display in the list
 * @property {string} [label='Select...'] - Initial trigger text
 * @property {string|number} [maxHeight='250px'] - Max list height before scrolling
 * @property {'top'|'bottom'} [position='top'] - Where the dropdown appears (above/below trigger)
 * @property {string} [icon] - Custom icon name (defaults to chevronUp for top, chevronDown for bottom)
 */

/**
 * @typedef {Object} MpiOptionSelectorProps (Compound — js/components/Compounds/MpiOptionSelector)
 * @property {'ratio'|'number'|'buttons'} variant  - Selector variant (required)
 * @property {'sm'|'md'|'lg'} [size='md'] - Trigger button size (applies to ratio/number/buttons variants)
 *
 * The ratio popup panel renders `.ratio-row` + `.ratio-pick.r-X-Y` Stage selectors
 * (defined in MpiOptionSelector.css) instead of generic MpiButton items.
 * To show the ratio as a compact visual picker, use variant='ratio' — the popup
 * automatically uses the Stage ratio-pick grid layout.
 *
 * variant='ratio' props:
 * @property {string} [modelType='flux'] - Model type (flux, sdxl, wan, social) — determines UI mode via RATIO_MODES
 * @property {'portrait'|'landscape'} [initialOrientation='portrait'] - Initial orientation (image models only)
 * @property {string} [value='1:1'] - Current selected ratio label
 * @property {'very_low'|'low'|'medium'|'high'|'very_high'} [qualityTier='medium'] - Active quality tier (video/speed-mode only)
 *
 * variant='ratio' emits:
 * 'change' { value, ratio, w, h, orientation }
 * 'orientation_change' { orientation }
 * 'quality_change' { qualityTier }
 * 'popup_toggle' { active }
 * variant='ratio' instance methods:
 *   getValue() — returns { value, w, h, orientation, qualityTier }
 *
 * variant='number' props:
 * @property {string[]} values           - Ordered list of selectable value strings
 * @property {string}   [value]          - Initially selected value (defaults to values[0])
 * @property {string}   [icon]           - Icon shown on trigger button (optional)
 * @property {string}   [popupTitle]     - Badge label at top of popup (optional)
 * @property {string}   [info]           - Tooltip on trigger button
 *
 * variant='number' emits:
 * 'change'       { value: string }
 * 'popup_toggle' { active: boolean }
 * variant='number' instance methods:
 *   getValue()       — returns current selected string
 *   setValue(string) — imperatively set value; re-renders grid + trigger
 */

/**
 * @typedef {Object} MpiVideoViewerProps (Organism — js/components/Organisms/MpiVideoViewer)
 * @property {number} [fps=24] - Frame rate for video playback (passed to MpiVideoSurface)
 *
 * Note: The control bar (MpiVideoControlBar) is NOT mounted by the viewer.
 * The parent Block mounts MpiVideoControlBar and wires it via
 * `viewer.el.attachControlBar(instance)`.
 *
 * Instance methods (on instance.el):
 *   loadVideo(url, meta = {})         — load video URL; meta may include
 *                                       { fps, duration, frameCount, hasAudio, trim }.
 *                                       fps/frameCount/trim proxy to the attached control bar.
 *   attachControlBar(instance)        — wire an external MpiVideoControlBar
 *   detachControlBar()                — drop the attached control bar ref
 *   getSurfaceInstance()              — MpiVideoSurface instance
 *   enterCropMode(initialRect = null) — enable crop overlay with optional initial normalized rect
 *   exitCropMode()                    — disable crop overlay
 *   getCropRect()                     — returns current normalized crop rect { x, y, w, h }
 *   setCropRatio(ratio)               — set aspect ratio lock (null = free)
 *   captureSnapshot({ time }?)        — returns { blob, dataUrl } of current frame, respecting active crop
 *   setTopRight(items)                — top-right chip strip passthrough
 *   resetView()                       — fit video back to stage (zoom=1, no pan)
 *   setLatentPreview(url)             — paint a live latent frame OVER the loaded video
 *                                       (MPI-571); null/'' hides the layer again
 *   setGenerating(bool)               — show/hide spinner (generation flag); OR'd with internal load flag
 *   setLoading(bool)                  — external load flag; loadVideo toggles it
 *                                       automatically off the first loadeddata/error
 *   destroy()                         — clean up surface, cropTool, observers, listeners
 *
 * Emits:
 *   'play', 'pause', 'ended', 'timeupdate' — forwarded from MpiVideoSurface
 *   'change' { volume, muted }              — forwarded from surface volumechange
 *   'loadedmetadata' { duration }
 *   'crop-change' { rect: { x, y, w, h } } — crop rect changed
 */

/**
 * @typedef {Object} MpiVideoControlBarProps (Compound — js/components/Compounds/MpiVideoControlBar)
 * @property {number}  [fps=24]      - Frame rate for time display + trim snapping
 * @property {boolean} [showTrim=true] - When false, the embedded MpiTrimBar is
 *                                       not mounted; trim hotkeys (I/O/X) and
 *                                       range API become no-ops. Use for
 *                                       audio-only or trim-less surfaces.
 *
 * Instance methods (on instance.el):
 *   attachSurface(surfaceInstance) — wire to MpiVideoSurface
 *   detachSurface()                — drop surface listeners + hotkeys
 *   setRange(in, out)
 *   setRangeQuiet(in, out)
 *   getRange()                     — { in, out } or null when showTrim=false
 *   getValue()                     — playhead seconds or null
 *   setPendingTrim(in, out)        — one-shot trim applied on next loadedmetadata
 *   setVolume(v) / setMuted(m)
 *   setFps(fps) / setFrameCount(n)
 *
 * Emits:
 *   'loop-change'  { loop: boolean }
 *   'range-change' { in: number, out: number }
 */

/**
 * @typedef {Object} MpiPromptBoxProps (Organism — js/components/Organisms/MpiPromptBox)
 * @property {import('./data/modelRegistry.js').ModelDef|null} [model=null]
 * @property {import('./data/modelRegistry.js').ModelDef[]} [modelList=[]]
 * @property {string} [operation='t2i']
 * @property {string} [value='']
 * @property {string} [negativeValue='']
 * @property {string} [negativeAudioValue=''] - Seed for the THIRD prompt field (MPI-474). The prompt button cycles positive → negative → negative audio; the audio stop is offered only when the active model declares `capabilities.audio` (LTX), because only such a graph carries an `Input_Negative_Audio` node to receive it. A model without it cycles two ways exactly as before, and losing the capability while the audio field is active snaps the box back to the plain negative.
 * @property {boolean} [includeNegative=false] - Does this SURFACE offer a negative prompt? Necessary but not sufficient: the toggle also requires the active model's `capabilities.negativePrompt !== false` (absent ⇒ supported), re-evaluated on every model change.
 * @property {boolean} [generating=false]
 * @property {Object} [context={}]
 * @property {'gallery'|'history'} [workspaceKey='gallery']
 *   Selects which session draft slot (`state.promptDraft` / `state.promptMedia`)
 *   this box reads + writes, so gallery and history drafts never bleed (MPI-113).
 * @property {string|null} [workspaceId=null]
 *   Card id stamped into the saved slot. On mount the box restores its slot ONLY
 *   when the slot's stored id matches this — so opening a different history card
 *   shows a clean box, never the previous card's text/chips. Gallery omits it
 *   (id null = always matches = persistent). See component-state.md.
 *
 * Instance methods (on instance.el):
 *   imageCount    {number}
 *   videoCount    {number}
 *   getMediaItems()
 *   clearMedia()
 *   setOperation(key)
 *   setGenerating(bool)
 *   setModel(model)       — sync internal model dropdown to a new model (no remount)
 *   setModelList(list)    — update the available models list in the dropdown
 *   updateContext({ imageCount, videoCount, hasMask })
 *   injectMedia({ url, mediaType, role? }) → boolean
 *     — Adds media chip if model accepts the type; fires warning toast and returns
 *       false if incompatible. Single source of truth for all inject paths.
 *       Optional `role` tags the chip to a slot key (e.g. 'startFrame',
 *       'endFrame'); `_withAssignedRoles` honors explicit role over type-order
 *       fallback. Role-tagged inject displaces any prior chip with the same role.
 *
 * Emits:
 *   'model-change'      { model }
 *   'operation-change'  { operation }
 *   'media-change'      { imageCount, videoCount, items }
 *   'run'               { operation, positive, negative, mediaItems, injectionParams, previewOnly, historyMode }
 *   'cancel'            {}
 *   'settings'          { model }
 */


/**
 * @typedef {Object} MpiMemoryMonitorProps (Compound — js/components/Compounds/MpiMemoryMonitor)
 * @property {number} [pollInterval=2000] - Stats fetch interval in milliseconds
 * @property {string} [info] - Info bar description for the unload button
 *
 * Instance methods (on instance.el):
 *   startPolling()          — begin or resume polling the active stats source
 *                             (/system/stats locally, remote Pod stats while connected)
 *   stopPolling()           — pause polling
 *   showStatus(text)        — show a temporary badge message (called by shell after release)
 *
 * Emits:
 *   'release' { deep: boolean } — unload button clicked; shell handles the actual API call
 */

/**
 * @typedef {Object} MpiBadgeProps
 * @property {string} label - Badge text or count
 * @property {'primary'|'secondary'|'success'|'warning'|'danger'|'info'} [variant='primary'] - Color variant
 * @property {boolean} [pill=false] - Rounded pill style
 */

/**
 * @typedef {Object} MpiButtonProps
 * @property {string} [text] - Button label (used in plain text mode)
 * @property {'primary' | 'secondary' | 'danger' | 'outline' | 'ghost' | 'loading' | 'disabled'} [variant='primary'] - Visual style variant
 * @property {'sm' | 'md' | 'lg'} [size='md'] - Button size
 * @property {string} [info] - Info Bar description / tooltip
 * @property {boolean} [disabled=false] - Whether the button is interactable
 * @property {boolean} [loading=false] - Whether the button is in a loading state (shows spinner)
 * @property {'button' | 'submit' | 'reset'} [type='button'] - HTML button type
 * @property {'sharp' | 'pill'} [shape='sharp'] - Corner shape; 'sharp' = 0px radius (Stage default), 'pill' = rounded
 *
 * Icon Button properties (optional - activates icon mode if 'icon' is provided):
 * @property {string} [icon] - MpiIcon registry key (e.g. 'play', 'trash', 'settings')
 * @property {string} [iconActive] - Icon shown when active/toggled (enables icon-swap behaviour)
 * @property {string} [label] - Optional text label shown alongside icon
 * @property {'left'|'right'|'top'|'bottom'} [labelPosition='right'] - Position of label relative to icon
 * @property {boolean} [stroke=false] - Use stroke rendering for icon (ratio/outline icons)
 * @property {boolean} [toggleable] - If true, click commits the pressed (inverted) state
 * @property {boolean} [active] - Initial active/toggled state
 */

/**
 * @typedef {Object} MpiIconProps
 * @property {string} [name='info'] - Key from the ICONS registry.
 *   Fill icons: generate, play, pause, stop, check, close, plus, minus, trash, edit, copy,
 *     download, upload, refresh, search, heart, enhance, bolt, sparkle, layers,
 *     media, image, compare, crop, resize, chat, text, translate, folder, settings, help, info, grid,
 *     video, audio, upscaler, detailer, mask, unload, menu, back, chevronDown, chevronRight,
 *     volumeOff, volumeLow, volumeHigh, negative.
 *   Stroke icons (use stroke=true): ratio_1_1, ratio_3_4, ratio_4_3, ratio_4_5, ratio_5_4,
 *     ratio_5_8, ratio_8_5, ratio_9_16, ratio_16_9, gallery, refresh_stroke, seed,
 *     flipX_stroke, flipY_stroke.
 * @property {'xs'|'sm'|'md'|'lg'|'xl'} [size='md'] - Icon size
 * @property {'muted'|'accent'|'primary'|'danger'|'success'} [color] - BEM color modifier
 * @property {boolean} [stroke=false] - Stroke/outline mode — use for ratio rect icons
 */

/**
 * @typedef {Object} MpiEngineInstallProps (Compound — js/components/Compounds/MpiEngineInstall)
 * No props required — all state is managed imperatively and via SSE.
 *
 * Instance methods (on instance.el):
 *   show(mode)              — 'installing' | 'upgrading' | 'repairing' — portals and shows appropriate phase
 *   hide()                  — removes portal, clears state
 *   setProgress(data)       — { progress: 0–100, speed, downloadedBytes, totalBytes }
 *   setStatus(text)         — update status message (e.g. 'Extracting...')
 *   setError(message)       — show error message + retry button
 *   destroy()               — cleanup SSE connection and portal
 *
 * Three-phase UI for first install:
 *   Phase 0 (choose):       Local + Remote  vs  Remote only (MPI-519). 'Remote only'
 *                           sets runpodConfig { enabled, skipLocalEngine } and emits
 *                           'engine:install-skipped'; 'Local + Remote' reveals phase 1.
 *                           This phase renders wider than the rest — _showPhase caps
 *                           the modal element per phase.
 *   Phase 1 (setup):        Models path picker + Browse button + Install button + Back
 *   Phase 2 (progress):     Progress bar + status text + speed/size info
 *
 * For upgrades / repairs:
 *   Skips phases 0 and 1, goes straight to Phase 2 with "models are safe" messaging
 *
 * SSE integration:
 *   Connects to existing /comfy/downloads/stream and filters for engine:* events
 *   Events: engine:downloading, engine:extracting, engine:patching, engine:complete, engine:error, engine:upgrade-status
 *
 * Emits (via Events bus):
 *   'engine:ready' — when download/extract/patch complete (triggers shell.js boot continuation)
 */

/**
 * @typedef {Object} MpiInputProps
 * @property {'text'|'email'|'password'|'number'|'textarea'} [type='text'] - Input type
 * @property {string} [placeholder=''] - Placeholder text
 * @property {string|number} [value=''] - Initial value
 * @property {string} [label=''] - Field label
 * @property {boolean} [disabled=false] - Disabled state
 * @property {boolean} [readonly=false] - Read-only (displayed but not editable)
 * @property {boolean} [autoHeight=false] - textarea only: auto-resize to content height
 * @property {string} [error=''] - Error message
 * @property {string} [info=''] - Info Bar description
 *
 * Instance methods (on instance.el):
 *   setValue(v) — imperatively set the field's value. Emits NOTHING: a programmatic
 *                 write is not user input, so an `input`/`change` echo would run the
 *                 caller's own onChange against the value it just wrote. Re-runs the
 *                 auto-height measure when `autoHeight` is on. Use this rather than
 *                 reaching for `.mpi-input__field` — a caller that guesses at the DOM
 *                 can miss it and fail silently (MPI-504).
 */

/**
 * @typedef {Object} MpiPopupProps (Primitive — js/components/Primitives/MpiPopup)
 * @property {boolean} [active=false] - Whether the popup is visible
 * @property {string} [variant='glass'] - Visual variant
 * @property {'top'|'bottom'|'left'|'right'} [position='top'] - Position relative to trigger
 * @property {Array<{id: string, label: string, iconHtml?: string}>} [items] - Optional menu items
 */

/**
 * @typedef {Object} MpiProgressBarProps (Primitive — js/components/Primitives/MpiProgressBar)
 * @property {number} [min=0] - Minimum value
 * @property {number} [max=100] - Maximum value
 * @property {number} [step=1] - Step increment
 * @property {number} [value=50] - Current value
 * @property {string} [info] - Info Bar description (supports {value} placeholder)
 * @property {string} [prefix=''] - Text shown before value in Info Bar
 * @property {string} [suffix=''] - Text shown after value in Info Bar
 * @property {boolean} [interactive=false] - If false, input is disabled (static progress)
 * @property {boolean} [wheel=false] - Enable mouse wheel support
 * @property {boolean} [handle=false] - Show circular thumb handle on fill position
 * @property {'primary'|'secondary'|'success'|'danger'} [variant='primary'] - Color variant
*/

/**
 * @typedef {Object} MpiLevelMeterProps (Primitive — js/components/Primitives/MpiLevelMeter)
 * @property {'horizontal'|'vertical'} [orientation='horizontal'] - Bar direction
 * @property {number} [min=-70] - dBFS at the empty end
 * @property {number} [max=12] - dBFS at the full end
 * @property {number} [warn=-12] - dBFS where the amber zone starts
 * @property {number} [danger=0] - dBFS where the rose zone starts (the digital clip point)
 * @property {boolean} [showValue=true] - Show the numeric dB readout beside the bar
 *
 * Instance methods: setDb(db), setPeak(linear), reset(). Feed it FLOAT analyser
 * data — byte data clamps at ±1 and can never reach the rose zone.
 */

/**
 * @typedef {Object} MpiFaderProps (Primitive — js/components/Primitives/MpiFader)
 * @property {'horizontal'|'vertical'} [orientation='horizontal'] - Travel direction
 * @property {number} [min=-60] - dB at the bottom of the travel (the off position)
 * @property {number} [max=12] - dB at the top of the travel
 * @property {number} [step=0.1] - Fader resolution in dB
 * @property {number} [value=0] - Initial dB
 * @property {number} [unity=0] - dB the detent snaps to, and the fill's anchor
 * @property {number} [snap=1] - Snap tolerance in dB either side of unity; 0 disables
 * @property {boolean} [showValue=true] - Show the numeric dB readout
 *
 * A FADER scale, not a meter scale: 0 dB is unity, the neutral middle, with cut
 * below and boost above — where MpiLevelMeter's 0 dBFS is the ceiling. The
 * detent applies to pointer drags only; keyboard steps are exact requests.
 * Emits input/change with { db, gain }. Instance methods: setDb(db) (quiet),
 * getDb(), getGain() — 0 at the bottom of the scale, else 10^(dB/20).
 */

/**
 * @typedef {Object} MpiSpinnerProps
 * @property {'sm'|'md'|'lg'} [size='md'] - Spinner size
 * @property {'primary'|'secondary'|'light'|'dark'} [variant='primary'] - Color variant
 */

/**
 * @typedef {Object} MpiToastProps
 * @property {string} message - Notification message
 * @property {'info'|'success'|'warning'|'danger'} [variant='info'] - Visual variant
 * @property {number} [duration=3000] - Auto-hide duration in ms
 * @property {boolean} [sound=true] - Play the notification chime (once per burst). Pass false for immediate user-action feedback (Connect, Install, Cue).
 */

/**
 * @typedef {Object} MpiSettingsProps (Compound — js/components/Compounds/MpiSettings)
 * No props required — all state is read from localStorage / app state internally.
 *
 * Content component for MpiSlideOver. el.onOpen() re-initialises fields with fresh values.
 *
 * Trigger via: Events.emit('slide-over:open', { title: 'Settings', component: MpiSettings })
 */

/**
 * @typedef {Object} MpiRunpodSettingsProps (Compound — js/components/Compounds/LandingPages/MpiRunpodSettings)
 * No props required — reads state.runpodConfig + secretsClient internally (MPI-177 extraction).
 *
 * The RunPod Remote Engine section of the Settings panel. Mounted once by
 * MpiSettings into #mpiSettingsRunpodMount; MpiSettings forwards el.onOpen()
 * each panel open. el.destroy() clears the status/disk polls and aborts any
 * in-flight connect poll (the Pod itself is left booting — destroy ≠ Cancel).
 */

/**
 * @typedef {Object} MpiHotkeysProps (Compound — js/components/Compounds/LandingPages/mpi-hotkeys)
 * No props required. Static content.
 *
 * Content component for MpiSlideOver.
 *
 * Trigger via: Events.emit('slide-over:open', { title: 'Hotkeys', component: MpiHotkeys })
 */

/**
 * @typedef {Object} MpiAboutProps (Compound — js/components/Compounds/MpiAbout)
 * No props required.
 *
 * Emits: (none — content only, chrome owned by MpiSlideOver)
 */

/**
 * @typedef {Object} MpiSlideOverProps (Compound — js/components/Compounds/MpiSlideOver)
 * @property {string} title       - UPPERCASE label shown in panel header
 * @property {Object} component   - ComponentFactory blueprint to mount in the body slot
 *                                  (MpiSettings | MpiHotkeys | MpiAbout).
 *                                  If component.el.onOpen exists, it is called on open.
 * @property {string} [extraClasses] - Optional classes added to the slide-over root.
 *                                     Queue uses this to provide its own chrome.
 * @property {string} [panelId] - Stable identity used by `slide-over:toggle`.
 *
 * Opened via event (do not mount directly):
 *   Events.emit('slide-over:open', { title, component, extraClasses?, panelId? })
 *   Events.emit('slide-over:toggle', { title, component, extraClasses?, panelId? })
 *
 * Instance methods (on instance.el):
 *   open()  — slide in, append to body
 *   close() — slide out, remove from DOM
 *
 * Emits:
 * 'close' {} — panel dismissed (close button, outside click, ui:close-all-popups,
 *              or content component emitting 'close-request')
 */

/**
 * @typedef {Object} MpiQueuePanelProps (Compound - js/components/Compounds/MpiQueuePanel)
 *
 * Takes no props. Queue slide-over content for the in-app Cue queue. Reads the
 * snapshot from `generationService.getGenerationQueueSnapshot()`, subscribes to
 * `generation-queue:changed`, and calls cancel helpers by stable queue job id.
 * Owns its header controls: trash clears pending Cue jobs, X emits close-request.
 *
 * Opened via:
 *   Events.emit('slide-over:open', {
 *     title: 'Cue',
 *     component: MpiQueuePanel,
 *     extraClasses: 'mpi-slide-over--queue',
 *     panelId: 'generation-queue',
 *   }).
 *
 * Gallery `Q` uses `slide-over:toggle` with the same payload.
 *
 * Instance methods (on instance.el):
 *   onOpen()  - refreshes from the latest queue snapshot.
 *   destroy() - tears down queue subscriptions and listeners.
 *
 * Emits:
 *   'close-request' {} - asks MpiSlideOver to close the panel.
 */

/**
 * @typedef {Object} MpiOverlayProps (Primitive — js/components/Primitives/MpiOverlay)
 * @property {boolean} [closable=true] - Show the X close button in the top-right corner
 * @property {('tool-container'|'body')} [mountTarget='tool-container'] - Where to inject the overlay:
 *           'tool-container' — fills main area, leaves sidebar/titlebar visible (workspace pages)
 *           'body'           — full viewport with backdrop (landing page, no #tool-container)
 *
 * Instance methods (on instance.el):
 *   show()                      — injects into the chosen target, stashing prior content
 *   hide()                      — restores prior content, releases OverlayManager queue
 *   appendToContainer(el: HTMLElement) — append a child into the scrollable content slot
 *
 * Emits:
 * 'close' {} — X button clicked or `ui:close-all-popups` received (hide() called automatically)
 */

/**
 * @typedef {Object} MpiModelManagerProps (Compound — js/components/Compounds/LandingPages/MpiModelManager)
 *
 * Takes no props. The Model Library (MPI-215): self-hosts a full-page
 * MpiOverlay(body) styled as a dark contact sheet — lean preview tiles split
 * into Installed/Available × Image/Video sub-grids, with Media/Size/search
 * filters and a right-drawer detail panel (an absolute child of the overlay)
 * carrying description, Operations toggles, GPU-weight arch toggles, VRAM→RAM
 * trade table, disk footprint, and Install/Update/Uninstall. Owns all model
 * logic: refresh, install, pause/resume/cancel, uninstall confirmation, and
 * download:* subs.
 *
 * Opened via: Events.emit('models:open') → shell mounts it once and calls el.open().
 *
 * Instance methods (on instance.el):
 *   open()    — shows the overlay + re-syncs installed state (alias: onOpen).
 *   close()   — hides the overlay.
 *   destroy() — tears down subscriptions, tiles, detail toggles, the uninstall
 *               dialog, and the hosted overlay.
 */

/**
 * @typedef {Object} MpiFlowLibraryProps (Compound — js/components/Compounds/LandingPages/MpiFlowLibrary)
 *
 * Takes no props. The Flow Library (MPI-256, dev-gated): a clone of the Model
 * Library skeleton stripped to flow scope. Self-hosts a full-page MpiOverlay(body)
 * as a dark contact sheet of flow tiles (preview + title + availability badge from
 * flowAvailability, read-only over s_installedModelIds), with a right-drawer detail
 * panel carrying the description, the required-models install state, and ONE footer
 * button — all-installed → Open (emits `flow:open`, Gallery-only), missing → Install
 * (drives each missing model's own dependency download). No ops/arch toggles, VRAM
 * table, filters, or re-sync — availability derives entirely from the installed set,
 * so download:* events only re-derive badges in place (never a full re-render).
 *
 * Opened via: Events.emit('flows:open') → shell mounts it once and calls el.open().
 * Emits: `flow:open` {flowId} when Open is clicked in the Gallery.
 *
 * Instance methods (on instance.el):
 *   open()    — shows the overlay + renders the flow grid (alias: onOpen).
 *   close()   — hides the overlay.
 *   destroy() — tears down subscriptions, tiles, detail buttons, and the overlay.
 */

/**
 * @typedef {Object} MpiBaseFlowProps (Organism — js/components/Organisms/MpiBaseFlow)
 * @property {import('../data/flowsRegistry.js').FlowDef} flow - The flow descriptor.
 * @property {Object} [initialInputs] - Optional seed inputs (overridden by
 *   state.s_flowInputs[flow.id] when present).
 *
 * THE flow frame: a STEP CAROUSEL (MPI-306 Phase 1; was a flat form in MPI-256).
 * COMPOSITION: mounts a `main-area` MpiOverlay (covers #tool-container + prompt
 * box, spares #shell-info-bar), renders a topbar (Back + flow name + a NAVIGATING
 * step ticker) over a slide stage with arrows outside the content.
 *
 * Shape — two zones split by an INSET centre divider on the FIRST and LAST step
 * only (divided = supplying/reviewing, undivided = working):
 *   step 0     media slots (from inputSchema.media) │ what this flow does
 *   1..N       declared middle steps — bounded centred canvas, no divider
 *   last       controls + Generate                  │ result + Apply
 *
 * STEPS ARE DATA: a flow declares `steps: [{kind, role, title, hint, fields?}]`
 * (see FlowDef/FlowStep in js/data/flowsRegistry.js) and writes NO layout code.
 * `kind` keys into STEP_KINDS (MpiBaseFlow/stepKinds.js); each kind takes
 * {media, value, onChange, step} and reports a value. The frame collects
 * {[role]: value} into `stepValues` and merges it into the Run inputs — it never
 * learns what a gizmo does. A step is never invalid (every kind defaults), so the
 * forward arrow is never blocked. Declared `fields` render as ONE frame-owned row
 * between canvas and hint.
 *
 * Run merges media + stepValues + every declared field → submitFlowGeneration(flow,
 * inputs). A step that declares `param` binds its gizmo's value to that injection
 * param (e.g. Head Swap's box1/box2) — the flow says which role feeds which node,
 * the kind says what shape it takes, and the frame still never learns what a role
 * MEANS (MPI-572). Seeds/writes state.s_flowInputs[flow.id] AND
 * state.s_flowResults[flow.id] (top-level replace) so both the inputs and the last
 * RESULT survive close→reopen and Overlays.reset() — MPI-587; the result snapshot
 * carries its surface, status line and pending note, and is dropped by a HEAD probe
 * at mount when its file is gone. Back =
 * el.close() then Events.emit('flows:open'). Mid-run navigation is allowed; closing
 * with an unapplied result does NOT prompt (there is no Discard — see
 * docs/playbooks/add-flow/ui/carousel-frame.md).
 *
 * The run path COMMITS ON COMPLETION (scope:'gallery') — there is no Apply step.
 * MPI-306 Phase 3 built a hold-until-Apply flow and it was REVERTED after the UX
 * pass (an Apply the user never wants to skip is friction). See flowService.js.
 *
 * Mounted via: Events.emit('flow:open', {flowId}) → shell resolves the descriptor
 * and mounts one instance (destroying any prior active flow).
 *
 * Emits: 'close' — the overlay closed (X, Escape, ui:close-all-popups, or Back).
 * The shell DESTROYS the instance on it (MPI-345): a closed flow that stays alive
 * keeps its listeners, and the global `generation.run` hotkey among them queued a
 * phantom flow job on the next Ctrl+Enter. Every open mounts a fresh instance, so
 * nothing is lost — inputs live in state.s_flowInputs, the last result in
 * state.s_flowResults.
 *
 * Instance methods (on instance.el):
 *   open()/close() — show/hide the overlay (alias onOpen). The flow hotkeys
 *                    (ArrowLeft/Right, Ctrl+Enter) bind on open and unbind on close,
 *                    NOT for the instance lifetime — see suspend().
 *   suspend()      — hide WITHOUT emitting 'close', so the shell keeps the instance
 *                    (MPI-611). This is the Tab ring parking the flow to visit the
 *                    gallery; open() puts it back on the same step, with its inputs
 *                    and any running job intact. Driven by Events 'flow:suspend' /
 *                    'flow:restore'.
 *   destroy()      — tears down subs, the live slide (gizmos + listeners), the
 *                    per-flow component, and the overlay.
 */

/**
 * @typedef {Object} MpiStepBoxProps (Organism — js/components/Organisms/MpiStepBox)
 * @property {Object}   media      - The media item this step operates on ({url, …}).
 * @property {Object}   step       - The FlowStep declaration (uses `ratio` if present).
 * @property {Object|null} [value] - Restored value ({box:{x,y,w,h}}) or null. May also
 *                                   carry `paint` (a PNG data URL) when an earlier
 *                                   `paint` step declares the SAME role — the frame
 *                                   merges gizmo reports into one per-role entry, so
 *                                   the drawing arrives here and is ghosted under the
 *                                   box. Absent on a flow with no paint step (MPI-567).
 * @property {Function} onChange   - (value) => void; called as the box is dragged.
 *
 * The `box` STEP KIND (MPI-306) — a bounded image with a draggable/resizable
 * region box. Reuses js/utils/cropTool.js with `showGrid:false` (a rule-of-thirds
 * grid is a composition aid; this box marks a subject). Reports
 * `{box:{x,y,w,h}}` in ABSOLUTE SOURCE PIXELS, top-left anchored — the unit
 * `Mpi Box` consumes unconverted (docs/playbooks/add-flow/ui/box-gizmo.md).
 * cropTool works normalized; the conversion + EDGE clamp happen here, because
 * `Mpi Box Crop` returns the intersection and does NOT pad — an off-edge box
 * would otherwise yield a silently non-square crop.
 *
 * Knows nothing about its host flow, the workflow, or any injector — that is the
 * step-kind contract that keeps `steps` data.
 *
 * Instance methods (on instance.el):
 *   getValue() — returns {box:{x,y,w,h}} in source pixels.
 *   destroy()  — disconnects the ResizeObserver, destroys the crop tool.
 */

/**
 * @typedef {Object} MpiStepCropProps (Organism — js/components/Organisms/MpiStepCrop)
 * @property {Object}   media      - The media item this step operates on ({url, …}).
 * @property {Object}   step       - The FlowStep declaration (`orientation` seeds the bar).
 * @property {Object|null} [value] - Restored value ({crop:{x,y,w,h}, ratio:{orientation,label}}).
 * @property {Function} onChange   - (value) => void; called as the frame is dragged.
 *
 * The `crop` STEP KIND (MPI-594) — the OUTPAINT gizmo, `box`'s opposite number:
 * a rect that is EXPECTED to leave the image, whose overhang becomes the flat
 * area an edit model fills. Mounts `CropManager` (the History crop tool's own
 * rect/handle/snap engine) on a plain canvas stage, so the drag behaviour,
 * edge snapping and dashed source bounds are the one implementation, not a
 * lookalike. Reports `{crop:{x,y,w,h}}` in ABSOLUTE SOURCE PIXELS, top-left
 * anchored and free to be negative.
 *
 * Two deliberate differences from the History tool: a ratio CONTAINS the image
 * rather than inscribing it (picking a shape only ever adds bars), and the view
 * frames image ∪ rect, re-fitting on mouse-up but never mid-drag.
 *
 * Its ratio + orientation bar is the gizmo's own (two MpiRadioGroups over
 * CROP_RATIOS) rather than declared `fields`, because flipping orientation
 * rewrites the option list and a declared field's options are static.
 *
 * Binds to the run through STEP_MEDIA, not `param`: `composePaddedImage` draws
 * source + fill into the reported rect and the frame swaps that file in for the
 * step's role (docs/playbooks/add-flow/ui/crop-gizmo.md).
 *
 * Instance methods (on instance.el):
 *   getValue() — returns {crop:{x,y,w,h}, ratio:{orientation,label}}.
 *   destroy()  — disconnects the ResizeObserver, destroys CropManager + both radios.
 */

/**
 * @typedef {Object} MpiStepPaintProps (Organism — js/components/Organisms/MpiStepPaint)
 * @property {Object}   media      - The media item this step operates on ({url, …}).
 * @property {Object}   step       - The FlowStep declaration.
 * @property {Object|null} [value] - Restored value ({paint, size, color, brushSize, brush, mode});
 *                                   `brush` is a `BRUSH_PRESETS` id (MPI-435).
 * @property {Function} onChange   - (value) => void; called on stroke end and on any
 *                                   control change.
 *
 * The `paint` STEP KIND (MPI-567) — the DRAWING gizmo. The user draws on their own
 * photo and what the run receives is the drawing ALONE: an RGBA PNG at the photo's
 * resolution, transparent everywhere unpainted. Never the composite — a graph reads
 * such a layer twice (its RGB as a ControlNet hint, its ALPHA as a crop rect), and a
 * flattened photo makes the alpha the whole frame.
 *
 * Mounts `PaintManager` + `brushDab.js` — the History paint tool's own RGBA layer
 * and dab geometry — on a plain canvas stage, the same relationship MpiStepCrop has
 * with CropManager. There is no second brush, and stroke behaviour changes belong in
 * those two (docs/painting.md).
 *
 * Every mutation records into its own `UndoStack`: a stroke as a gesture, Clear as
 * PaintManager's own layer-wide one-shot (docs/masking-undo.md § The contract).
 * Ctrl+Z / Ctrl+Shift+Z are bound on the shared `mask.undo.canvas` registry ids.
 *
 * Its control row is the gizmo's own (brush/eraser, colour, Undo, Clear) rather than
 * declared `fields`, because those controls are INTRINSIC to any paint step and a
 * manifest that omitted them would leave a canvas the user cannot erase on. Brush
 * SIZE is the mouse wheel, matching InputController on the History canvas, and brush
 * SHAPE is an MpiDropdown over the same ten `BRUSH_PRESETS` MpiMaskStrip offers —
 * a setting on the shared dab, not a second brush engine.
 *
 * Binds through STEP_MEDIA, not `param`, and declares `mediaRole` on the step so the
 * layer lands in its OWN slot — the photo has to survive beside it
 * (docs/playbooks/add-flow/ui/paint-gizmo.md).
 *
 * Instance methods (on instance.el):
 *   getValue() — returns {paint, size:{w,h}, color, brushSize, mode}.
 *   destroy()  — disconnects the ResizeObserver, destroys the UndoStack and every control.
 */

/**
 * @typedef {Object} MpiStepCutoutProps (Organism — js/components/Organisms/MpiStepCutout)
 * @property {Object}   media      - The OBJECT being cleaned ({url, …}). This step's own
 *                                   role; there is no second one.
 * @property {Object}   step       - The FlowStep declaration.
 * @property {Object|null} [value] - Restored value ({removeBg, sourceUrl, bgUrl,
 *                                   objectSize, userMask:{manual,subtract}, brushSize}).
 * @property {Function} onChange   - (value) => void; on stroke end and any control change.
 *
 * The `cutout` STEP KIND (MPI-596) — the object alone on a stage of its own: a Remove
 * Background switch, then an erase/restore brush for whatever the cut missed or ate.
 *
 * 🔴 SKIPPABLE BY CONSTRUCTION, WITH NO FLAG. `composeCutObject` returns null when no
 * cut ran and no stroke was made, and the frame reads a null as "this kind changed
 * nothing" — so a PNG that arrived already cut out reaches the graph byte-identical.
 * The emptiness test is exact rather than a heuristic: MaskManager._layerToURL already
 * returns null for a layer with no painted pixels.
 *
 * 🔴 TWO MASK LAYERS, COMPOSITED ONLY AT DISPATCH. `bgMask` is the Remove Background
 * cut-out's alpha, `userMask` is MaskManager's manual/subtract pair, and they are never
 * flattened — flatten them and toggling the switch off destroys every erasure the user
 * made. So the brush works with the toggle OFF (the base alpha is the object's own
 * rectangle), toggling off and back on costs no second dispatch, and the composite
 * `(bgMask OR manual) AND NOT subtract` runs against the ORIGINAL RGB so Restore
 * reveals real pixels rather than a hole.
 *
 * Every mask mutation records into its own `UndoStack` — a stroke as a gesture, Reset
 * as MaskManager's layer-wide one-shot (docs/masking-undo.md § The contract). The
 * background toggle records nothing and must not; it mutates neither layer.
 *
 * TWO tools, not three: with no gizmo, nothing competes with the brush for the pointer,
 * so Erase/Restore is a plain pair — the shape MpiStepPaint has. Brush SIZE is the
 * wheel and Space pans/zooms, matching MpiStepPaint and InputController. The stage
 * paints a token-built CHECKER behind the canvas, and that is load-bearing rather than
 * decoration: the canvas is cleared where alpha is 0, so without it a white object is
 * indistinguishable from a removed background.
 *
 * Exports `composeObjectAlpha`, the shared composite law — MpiStepPlace runs the SAME
 * function to preview what this stage produced, so the two canvases cannot disagree.
 *
 * Instance methods (on instance.el):
 *   getValue() — the reported value above.
 *   destroy()  — disconnects the ResizeObserver, destroys the UndoStack, the
 *                MaskManager and every control.
 */

/**
 * @typedef {Object} MpiStepPlaceProps (Organism — js/components/Organisms/MpiStepPlace)
 * @property {Object}   media      - The SCENE the placement is made in ({url, …}).
 * @property {Object|null} [source] - The OBJECT being placed ({url, …}), resolved by the
 *                                   frame from the step's `sourceRole`. Null renders the
 *                                   scene with every control disabled and says why.
 * @property {Object|null} [sourceValue] - The VALUE the source role's own step reported —
 *                                   for Object Stamp, the `cutout` stage's two mask
 *                                   layers and cut-out url. Null when that stage was
 *                                   skipped, which previews the object's own rectangle.
 * @property {Object}   step       - The FlowStep declaration.
 * @property {Object|null} [value] - Restored value ({mode, sourceUrl,
 *                                   place:{cx,cy,halfW,halfH,rot}, size, objectSize}).
 * @property {Function} onChange   - (value) => void; on drag end and any control change.
 *
 * The `place` STEP KIND (MPI-596) — the PLACEMENT gizmo, and the first kind to read
 * TWO media roles: it draws on `step.role` and places `step.sourceRole`.
 *
 * Two modes, because the mechanism differs. `auto` uses the object's OWN pixels, so
 * the canvas shows it under the gizmo at the gizmo's aspect and the run receives it
 * stamped into the scene frame. `manual` uses only the REGION, so the canvas shows an
 * empty SQUARE box with no rotation — the box is where the model looks, and a rotation
 * handle would be a lie — and the run receives the clean object at its own full frame,
 * which is simply `sourceRole`'s media, so this kind derives NO file in Manual.
 *
 * Mounts two History engines whole, the relationship MpiStepPaint has with
 * PaintManager: `ShapeManager` armed `'place'` (MPI-454's gizmo — handles, shape-local
 * hit-testing, Shift's aspect lock, Alt-rotate) and `CompositeManager.drawPlaced` (the
 * rotated-rect stamp, fed the composited object canvas through `placeImage`).
 *
 * 🔴 THE CLEANUP IS NOT HERE. Remove Background, the brush and the UndoStack live in
 * MpiStepCutout, one stage earlier (plan.md § Plan Drift 2026-08-27) — cleaning the
 * object is work on the OBJECT, placing it is work on the SCENE. That split is what
 * lets the brush serve BOTH modes, gives the object a whole stage, and deletes the
 * three-tool pointer router: with no brush, the gizmo owns the pointer outright.
 *
 * 🔴 `sourceValue` IS THE SEAM AND IT HAS TO BE. `source` resolves from _mediaGroups —
 * the user's own inputs — so it is always the object as UPLOADED; the cut object is
 * derived at Run and never enters that map. So the preview is composed here through
 * `composeObjectAlpha`, the cutout stage's own function. The masks are NOT copied into
 * this step's value: they belong to the cutout step, are persisted once in its
 * snapshot, and re-derive from there on Reuse.
 *
 * Space pans/zooms, matching MpiStepPaint and InputController. Its control row is the
 * gizmo's own (mode, restore-size) rather than declared `fields`, because those are
 * intrinsic to any place step — the Manual PROMPT is not, and is declared on the step.
 *
 * Binds through STEP_MEDIA (the Auto stamp; null in Manual) and carries a STEP_PARAMS
 * adapter for the region rect, which only Manual consumes.
 *
 * Instance methods (on instance.el):
 *   getValue() — the reported value above.
 *   destroy()  — disconnects the ResizeObserver and destroys every control.
 */

/**
 * @typedef {Object} MpiCheckboxProps (Primitive — js/components/Primitives/MpiCheckbox)
 * @property {boolean} [checked=false]   - Initial checked state.
 * @property {string}  [label='']        - Optional label text; omit for a standalone checkbox.
 * @property {string}  [name='checkbox'] - Accessibility / form name attribute.
 * @property {boolean} [disabled=false]  - Disables interaction and applies muted styling.
 *
 * Instance methods (on instance.el):
 *   isChecked()    — Returns current boolean checked state.
 *   setChecked(v)  — Programmatically sets the checked state (boolean).
 *
 * Emits:
 * 'change' { checked: boolean } — Fired on each user toggle.
 */

/**
 * @typedef {Object} MpiOkCancelProps (Compound — js/components/Compounds/MpiOkCancel)
 * @property {string}  [title='']             - Large title text at the top of the dialog.
 * @property {string}  [text='']              - Descriptive body text shown below the title.
 * @property {string}  [inputPlaceholder]     - If provided, an input field is rendered below the text.
 * @property {string}  [inputValue='']        - Initial value pre-filled in the optional input field.
 * @property {boolean} [showCancel=true]      - Whether to display the Cancel button.
 * @property {string}  [okLabel='OK']         - Label for the confirm/OK button.
 * @property {string}  [cancelLabel='Cancel'] - Label for the cancel button.
 * @property {{label?: string, checked?: boolean}|null} [checkbox=null]
 *   When set, renders an MpiCheckbox between the input slot and actions.
 *   `label` — optional text next to the checkbox.
 *   `checked` — initial checked state (default true).
 *
 * Instance methods (on instance.el):
 *   show() — Self-portals a blurred backdrop + centred dialog to document.body.
 *             Registers with OverlayManager (Escape auto-closes). Caller needs nothing else.
 *   hide() — Removes backdrop/wrapper, releases OverlayManager queue.
 *             Does NOT emit 'cancel' — only the explicit Cancel button does.
 *
 * Usage:
 *   const d = MpiOkCancel.mount(document.createElement('div'), { title: 'Sure?', text: '...' });
 *   d.on('ok', () => doWork());
 *   d.el.show(); // all backdrop/Escape/queue handling is internal
 *
 * Emits:
 * 'ok'     { inputValue?: string, checkboxChecked?: boolean }
 *              — OK button clicked; checkboxChecked included when checkbox prop is set.
 * 'cancel' {}  — Cancel BUTTON clicked only (NOT emitted on Escape or hide())
 * 'input'  { value: string } — Optional input field value changed
 */

/**
 * @typedef {Object} MpiNotesEditorProps (Compound — js/components/Compounds/MpiNotesEditor)
 * @property {string}   [title='Notes']      - Dialog title.
 * @property {string}   [value='']           - Initial notes text (MARKDOWN) shown in the textarea.
 * @property {string}   [placeholder='Write your notes here…'] - Textarea placeholder.
 * @property {Function} [onSave]             - async (notes: string) => void. Persists the notes.
 *                                             While it runs the Save button is disabled and the modal
 *                                             stays open; on rejection the modal stays open for retry.
 *
 * A pencil/eye radio group in the header swaps the textarea for rendered markdown
 * (`js/utils/markdown.js`). The preview reads the LIVE textarea, so unsaved edits
 * show in it. It opens on the eye when `value` has content, on the pencil when empty.
 *
 * Instance methods (on instance.el):
 *   show() — Self-portals a backdrop + centred dialog to document.body (via MpiModal).
 *   hide() — Removes backdrop/wrapper, releases OverlayManager queue.
 *   destroy() — Releases the preview's delegated link handler.
 *
 * Usage:
 *   const e = MpiNotesEditor.mount(document.createElement('div'), {
 *       title: 'Card notes', value: item.notes || '',
 *       onSave: async (notes) => { await persist(notes); },
 *   });
 *   e.el.show();
 *
 * Emits:
 * 'save'   { value: string } — Save succeeded (after onSave resolves).
 * 'cancel' {}                — Cancel BUTTON clicked only (NOT emitted on Escape or hide()).
 */

/**
 * @typedef {Object} MpiAddToProjectProps (Compound — js/components/Compounds/MpiAddToProject)
 * @property {Array<{id:string,name:string}>} [projects=[]] - Selectable target projects for the dropdown.
 * @property {Function} [onConfirm] - async (projectId: string) => void. Copies the selected cards.
 *                                    While it runs the OK button is disabled and the modal stays open;
 *                                    on rejection the modal stays open for retry.
 *
 * Instance methods (on instance.el):
 *   show() — Self-portals a backdrop + centred dialog to document.body (via MpiModal).
 *   hide() — Removes backdrop/wrapper, releases OverlayManager queue.
 *
 * Usage:
 *   const d = MpiAddToProject.mount(document.createElement('div'), {
 *       projects, onConfirm: async (projectId) => { await copy(projectId); },
 *   });
 *   d.el.show();
 *
 * Emits:
 * 'confirm' { projectId: string } — Confirm succeeded (after onConfirm resolves).
 * 'cancel'  {}                    — Cancel BUTTON clicked only (NOT emitted on Escape or hide()).
 */

/**
 * @typedef {Object} MpiAudioRecorderProps (Compound — js/components/Compounds/MpiAudioRecorder)
 *
 * No props. The input device and gain come from Settings (Storage.getAudioInputDevice /
 * getAudioInputGain), not from the caller — a recorder that took them as props would let
 * two surfaces disagree about which microphone the app uses.
 *
 * Prefer the promise helper over mounting by hand:
 *   const file = await showAudioRecorder();   // File(.wav) | null
 *
 * The result is a 16-bit WAV, re-muxed from MediaRecorder's WebM: `.webm` is classified
 * as VIDEO by extension in five places on the server, so keeping the native container
 * would make the first project reload silently re-type the card to video.
 *
 * Instance methods (on instance.el):
 *   show() — Self-portals a backdrop + centred dialog to document.body (via MpiModal).
 *   hide() — Removes backdrop/wrapper, releases OverlayManager queue.
 *
 * Emits:
 * 'accept' { file: File } — Accept pressed; a WAV File.
 * 'cancel' {}             — Discard, Escape or backdrop.
 */

/**
 * @typedef {Object} MpiMediaPickerProps (Compound — js/components/Compounds/MpiMediaPicker)
 * @property {'image'|'video'|'audio'} [mediaType='image'] - Only history items of this type are listed.
 * @property {Function} [onPick] - (item: {filePath: string, mediaType: string}) => void.
 *                                 Called before the modal hides. The media is ALREADY in the
 *                                 project and on disk, so the caller takes the path as-is —
 *                                 nothing is hashed, copied or placed.
 * @property {Function} [onImport] - (files: File[]) => void. Files chosen from the FILESYSTEM.
 *                                 Omit it and no Import button renders. The caller is expected
 *                                 to route these through its own place/hash path, so an
 *                                 imported file is handled identically whichever surface
 *                                 reached it.
 * @property {'narration'|'character'|null} [voiceRoute=null] - Opt this slot into the shipped
 *                                 voice library, and say which route its play button previews
 *                                 (MPI-622). Omit it and no voice card renders. AUDIO slots
 *                                 only, and requires `onImport` — a picked voice is fetched,
 *                                 decoded to WAV and handed to `onImport` as a File, so it
 *                                 becomes an ordinary content-addressed project asset by the
 *                                 same path an upload takes.
 *
 * Two sources, one surface (settled with the user 2026-08-16): the project's own
 * media AND the filesystem. Still not a file manager — no cross-project browsing.
 *
 * On an AUDIO slot there are up to TWO more: a Record card opening MpiAudioRecorder
 * (MPI-573), and — where `voiceRoute` is set — a Voice library card opening
 * MpiVoicePicker (MPI-622). Record takes no prop, because a recording is not an
 * imported file and does not go through `onImport`: it is saved as project media first
 * and then resolves as an ordinary `pick`. A library voice is the opposite — it IS an
 * import, and deliberately reuses that path so the graph sees no difference.
 *
 * Instance methods (on instance.el):
 *   show() — Self-portals a backdrop + centred dialog to document.body (via MpiModal).
 *   hide() — Removes backdrop/wrapper, releases OverlayManager queue.
 *
 * Usage:
 *   const p = MpiMediaPicker.mount(document.createElement('div'), {
 *       mediaType: 'video', onPick: ({ filePath }) => { … },
 *   });
 *   p.el.show();
 *
 * Emits:
 * 'pick'   { filePath: string, mediaType: string } — A tile was chosen; the modal then hides.
 * 'import' { files: File[] }                       — Files picked from disk; the modal then hides.
 * 'cancel' {}                                      — Cancel BUTTON only (NOT on Escape or hide()).
 */

/**
 * @typedef {Object} MpiInstalledDisplayProps (Compound — js/components/Compounds/MpiInstalledDisplay)
 * @property {string} [title='']          - Title text on the top-left
 * @property {string} [meta='']           - Small text on the top-right (e.g., "13.75GB REQUIRED")
 * @property {string} [text='']           - Descriptive body text
 * @property {string} [image='']          - Preview still filename from modelConstants (e.g. 'sdxl-real-01.webp').
 *                                          Renders <img> from 'comfy_workflows/display/{image}'.
 * @property {string} [video='']          - Preview clip filename (e.g. 'wan22_preview.mp4'). Renders a muted,
 *                                          looping <video> that plays on hover and resets on mouse-leave.
 *                                          Takes precedence over `image` when both are set.
 * @property {'portrait'|'landscape'} [mediaRatio] - Preview box aspect. Defaults to 'landscape' for video,
 *                                          else 'portrait' (still art is ~4:5).
 * @property {string} [icon='info']       - MpiIcon registry key for the info row
 * @property {string} [iconText='']       - Text shown next to the icon
 * @property {'xs'|'sm'|'md'|'lg'|'xl'} [iconSize='sm'] - Info icon size
 * @property {'muted'|'accent'|'primary'|'danger'|'success'} [iconColor='danger'] - Info icon color
 * @property {boolean} [installed=false] - Whether this item is installed; controls badge label/variant
 * @property {string} [deleteLabel='Install']  - Label for the action button when not downloading
 * @property {'idle'|'downloading'|'paused'|'partial'|'installing'|'complete'} [downloadState='idle'] - Download state
 * @property {number} [progress=0]        - Download progress 0–1
 * @property {string} [speed='']          - Download speed string e.g. "12.3 MB/s"
 * @property {number} [downloadedBytes=0]   - Bytes downloaded so far
 * @property {number} [totalBytes=0]        - Total bytes to download
 * @property {boolean} [canUninstall=false] - Show Uninstall button when true and installed
 * @property {boolean} [hasPartialProgress=false] - Show progress bar for a partially-installed dep
 * @property {boolean} [isRemote=false]    - App is cloud-connected; hides Pause (remote has no pause/resume API)
 *
 * Emits:
 * 'delete' {}     — Action button clicked (Install when idle; context-dependent)
 * 'pause' {}      — Pause button clicked (during download)
 * 'resume' {}     — Resume button clicked (when paused)
 * 'cancel' {}     — Cancel button clicked
 * 'uninstall' {}  — Uninstall button clicked (when installed and canUninstall)
 */

/**
 * @typedef {Object} MpiProjectNameProps (Compound — js/components/Compounds/MpiProjectName)
 * @property {string} [projectName='']  - Active project name shown above breadcrumb
 * @property {string} [galleryLabel=''] - 'Gallery' link segment; empty = hidden (at gallery root)
 * @property {string} [groupLabel='']   - Current group name segment; empty = hidden
 *
 * Instance methods (on instance.el):
 *   setProjectName(name)    — update project name
 *   setGalleryLabel(label)  — pass '' to hide (at gallery root)
 *   setGroupLabel(label)    — pass '' to hide (not inside a group)
 *
 * Emits:
 *   'up'      {} — up-arrow clicked (navigate up one level: group→gallery, gallery→landing)
 *   'gallery' {} — gallery breadcrumb segment clicked
 *   'flows'   {} — the centred Flows button (MPI-589). The bar only announces the
 *                  click; the shell decides what opening Flows means.
 *
 * Every control here is a ghost-mounted MpiButton (MPI-582) — the back link, the
 * gallery segment and the Flows button alike. `setGalleryLabel` therefore goes
 * through MpiButton's `setLabel`, and the segment is mounted with a non-empty
 * `text` even when it starts hidden: MpiButton only renders the span setLabel
 * writes into when `props.text` is truthy at mount.
 */

/**
 * @typedef {Object} MpiContextMenuProps (Compound — js/components/Compounds/MpiContextMenu)
 * @property {MpiContextMenuItem[]} items - Menu item definitions
 *
 * Static API (primary usage — do not mount):
 *   MpiContextMenu.show({ x, y, items, onSelect })
 *     x, y      — cursor coordinates (fixed positioning)
 *     items     — array of MpiContextMenuItem
 *     onSelect  — callback(key: string) fired on item click; menu self-closes
 *
 * @typedef {Object} MpiContextMenuItem
 * @property {string}   key           - Unique identifier emitted to onSelect
 * @property {string}   [icon]        - Optional icon name from icons.js
 * @property {string}   label         - Display text
 * @property {string}   [kbd]         - Optional keyboard hint shown right-aligned (e.g. '⌘Z')
 * @property {boolean}  [separator]   - If true, renders a divider line; other fields ignored
 * @property {boolean}  [disabled]    - Grays out item; click does nothing
 * @property {boolean}  [danger]      - Renders item in danger color
 *
 * Behaviour:
 *   Portals to document.body at (x, y); clamps to viewport.
 *   Dismisses on: outside-click, Escape, ui:close-all-popups.
 *   MutationObserver cleans up if removed externally.
 *   z-index: 9999 (floating UI popup contract).
 */

/**
 * @typedef {Object} MpiGalleryGridProps (Compound — js/components/Compounds/MpiGalleryGrid)
 * @property {import('./data/projectModel.js').ItemGroup[]} [groups=[]] - Initial groups to render
 *
 * Instance methods (on instance.el):
 *   setGroups(groups)                 — replace all groups and re-render; detects isGenerating flag
 *   updatePreview(tempId, previewUrl, clip) — push latent preview to a generating card during
 *                                     generation; `clip` = { rate, length } for burst previewers
 *   resetPreviewClip(tempId, clip)    — new sampler stage: drop the card's current clip window
 *   removeCard(groupId)               — remove a single card by ID without full re-render
 *   setSelectionMode(val)             — toggle selection mode on UI
 *   getSelectionOrder()               — IDs of selected cards in chronological click order
 *   setGeneratingCard(wrapper, w, h)  — mount an external generating card in the grid's top slot
 *   clearGeneratingCard()             — remove the external generating card
 *
 * Emits:
 *   'open-group'  { group }       — user clicked a card (navigate to group history)
 *   'select'      { group, selected }  — checkbox toggled; selection mode managed by parent
 *   'reuse'       { current, original, group } — reuse prompt button clicked; payloads include prompt/model/settings/media
 *   'favourite'   { group, favourite } — favourite button toggled
 *   'media-missing' { group, itemId } — image file missing (404); parent handles GC
 *   'compare'     { groups }      — compare 2 selected groups
 *   'download'    { groups }      — download selected groups
 *   'delete'      { groups }      — delete selected groups
 *   'gc-group'    { group }       — group mutated by garbage collection
 *   'gc-remove'   { groupId }     — all history entries missing; group removed
 */

/**
 * @typedef {Object} MpiGalleryBlockProps
 * — No props. Reads state.currentProject directly.
 *
 * Emits: (none — uses Events bus)
 * Uses: state.currentProject, state.s_selectedModelIdByType
 */

/**
 * @typedef {Object} MpiHistoryListProps (Compound — js/components/Compounds/MpiHistoryList)
 * @property {import('./data/projectModel.js').HistoryItem[]} [history=[]] - Initial history array
 * @property {number} [selectedIndex=0] - Initially active entry index
 * @property {boolean} [isVideo=false] - Disables Compare in context menu for video groups
 * @property {(idx:number)=>Promise<boolean>|boolean} [hasMaskForIndex] - Per-entry mask availability check
 * @property {()=>boolean} [hasCopiedMask] - Whether a mask is on the app-local copy buffer (gates "Paste mask")
 *
 * MPI-373 removed "Mask composite" from this menu — the Composite rail group replaced it.
 *
 * Instance methods (on instance.el):
 *   setActiveIndex(idx)          — highlight active card (no events)
 *   setGroups(history)           — replace history array and rebuild cards
 *   appendEntry(item)            — add a new entry card at the end
 *   removeEntries(indices)       — remove cards at given sorted-descending indices
 *   exitSelectMode()             — programmatically exit select mode
 *   getSelectionOrder()          — indices of selected cards in chronological click order
 *
 * Emits:
 *   'entry-selected'    { idx, item }                  — card clicked (single-select)
 *   'selection-changed' { indices, anchor }             — selection updated (ctrl/shift/right-click)
 *   'selection-exited'  {}                              — select mode ended
 *   'delete-selected'   { indices }                     — delete from context menu
 *   'compare-requested' { indices: [number, number] }   — compare from context menu (image only)
 *   'download-selected' { indices }                     — download selected entries
 *   'download-mask'     { index }                       — download single entry mask
 *   'copy-mask'         { index }                       — copy the entry mask layers
 *   'paste-mask'        { index }                       — paste the copied mask onto the entry
 *   'reveal'            { indices }                       — open entry/Media folder in file system
 *   'reuse'             { item, positive, negative, modelId, operation, injectionParams, mediaItems } - reuse prompt button clicked
 */

/**
 * @typedef {Object} MpiReusePromptDialogProps (Compound - js/components/Compounds/MpiReusePromptDialog)
 * @property {{prompt?:boolean,settings?:boolean,model?:boolean,images?:boolean,video?:boolean,audio?:boolean}} [includes] - Initial checked reuse parts
 * @property {'original'|'current'} [source='original'] - Initial Gallery source option
 * @property {boolean} [showSource=true] - Whether to show Gallery source radio controls
 * @property {{original?:boolean,current?:boolean}} [imageAvailability] - Per-source: does the source carry a reusable input image? false greys "Use Images" (MPI-212)
 * @property {{original?:boolean,current?:boolean}} [videoAvailability] - Per-source: reusable input video? false greys "Use Video" (MPI-227)
 * @property {{original?:boolean,current?:boolean}} [audioAvailability] - Per-source: reusable input audio? false greys "Use Audio" (MPI-227)
 * @property {boolean} [isFlowCard=false] - App-generated card: split Apply into "Apply to Prompt Box" + "Apply to App" (MPI-263)
 *
 * Instance methods (on instance.el):
 *   show()    - open the modal
 *   hide()    - close the modal
 *   destroy() - release modal listeners
 *
 * Emits:
 *   'apply'  { includes, source, dest } - user confirmed reuse. dest: 'promptbox' honors checkboxes; 'app' reopens the App card (MPI-263)
 *   'cancel' {}                         - user cancelled
 */

/**
 * @typedef {Object} MpiCanvasViewerProps (Organism — js/components/Organisms/MpiCanvasViewer)
 * @property {string} [initialImageUrl=''] - URL of the first image to load
 * @property {number} [initialIdx=0]       - History index of the initial image
 * @property {Object} [initialItem=null]   - Full HistoryItem (provides id for TEMP mask persistence)
 * @property {string} [groupId=null]       - Owning group's id (component of TEMP mask key path)
 *
 * Instance methods (on instance.el):
 *   loadEntry(item, idx)           — save current mask, load item's image, restore idx's mask
 *   loadCompare(itemA, itemB)     — load two images in compare mode
 *   enterMode(mode)               — enter 'crop'|'mask'|'paint'|'automask' (or 'none' to exit all)
 *   exitMode()                    — exit any active tool mode
 *   applyPaint()                  — flatten the paint layer into a new history entry
 *   getCurrentMaskDataURL()        — returns current mask as data URL, or null
 *   getMaskDataURLForEntry(item)   — returns one entry's mask data URL, or null
 *   hasMaskForEntry(item)          — resolves true when one entry has a mask
 *   hasMask()                     — returns boolean
 *   setGenerating(bool)            — show/hide generating spinner
 *
 * Emits:
 *   'mode-changed'  { mode }      — tool mode changed (from any source)
 *   'crop-applied'  { item }      — crop completed; item is the new HistoryItem
 *   'paint-applied' { item }      — paint flattened; item is the new HistoryItem
 *   'mask-ready'    { hasMask }   — mask painted or cleared
 *   'entry-loaded'  { idx, hasMask } — image loaded for index
 */

/**
 * @typedef {Object} MpiGroupHistoryBlockProps (Block — js/components/Blocks/MpiGroupHistoryBlock)
 * @property {string} groupId - ID of the ItemGroup to display (from router params)
 *
 * Emits: (none — uses Events bus)
 * Uses: state.currentProject, state.s_selectedModelIdByType
 */

/**
 * @typedef {Object} MpiRadialMenuProps (Primitive — js/components/Primitives/MpiRadialMenu)
 * @property {'root'|'image'|'video'|'audio'} [context='root'] - Active context that determines which items are shown
 * @property {boolean} [open=false] - Force the menu open on mount (used for first-run/workspace entry)
 *
 * Instance methods (on instance.el):
 *   show()                  — programmatically show the menu
 *   hide()                  — programmatically hide the menu
 *   setContext(ctx)         — switch context and re-render if visible
 *   setContextItems(ctx, items) — replace a context's items (dev radial = 'dev' context, MPI-338)
 *
 * Emits:
 * 'select' { action: string } — user chose an item (action key from the context map)
 * 'open'   {}                 — menu became visible
 * 'close'  {}                 — menu became hidden
 */

/**
 * @typedef {Object} MpiProjectCardMedia
 * @property {'image'|'video'} type - Media type to render as the card background.
 * @property {string}          src  - URL or local path to the image or video file.
 */

/**
 * @typedef {Object} MpiNewProjectProps (Compound — js/components/Compounds/MpiNewProject)
 * No props required — all content is internal.
 *
 * Instance methods (on instance.el):
 *   show() — Self-portals a blurred backdrop + centred dialog to document.body.
 *             Registers with OverlayManager (Escape auto-closes). Resets fields on each show.
 *   hide() — Removes backdrop/wrapper, releases OverlayManager queue.
 *             Does NOT emit 'cancel' — only the explicit Cancel button does.
 *
 * Usage:
 *   const d = MpiNewProject.mount(document.createElement('div'));
 *   d.on('create', ({ name, location }) => createProject(name, location));
 *   d.el.show();
 *
 * Emits:
 * 'create' { name: string, location: string|null } — "+ Create Project" clicked
 * 'cancel' {}                                       — Cancel button clicked only
 */

/**
 * @typedef {Object} MpiProjectCardProps (Compound — js/components/Compounds/MpiProjectCard)
 * @property {string}               [title='Untitled'] - Project name shown in the card footer.
 * @property {string}               [date='']          - Formatted date string shown below the title.
 * @property {MpiProjectCardMedia}  [media]            - Optional image or video background.
 *                                                       Omit or set to null for an icon-only card.
 *
 * Instance methods: none (card is fully declarative via props + events).
 *
 * Emits:
 * 'click'  {} — Card body clicked (delete button area is excluded).
 * 'delete' {} — Delete button (trash icon) clicked. Caller decides confirmation flow.
 */

/**
 * @typedef {Object} MpiCompareViewProps (Compound — js/components/Compounds/MpiCompareView)
 * No props required at mount time.
 *
 * The ONE before/after surface: two labels, an MpiCanvas in `compare` mode and the
 * shared `compare.*` video transport. It states no size — it fills its host, which
 * is what lets the History overlay and a Flow's result frame share it (MPI-585).
 *
 * Instance methods (on instance.el):
 *   open(itemA, itemB) — load the pair; itemA = left/before, itemB = right/after.
 *                        Resolves false when the pair could not be loaded, so a
 *                        caller with a fallback can show it instead of a blank frame.
 *   destroy()          — unbind the hotkeys and destroy the canvas
 */

/**
 * @typedef {Object} MpiCompareOverlayProps (Compound — js/components/Compounds/MpiCompareOverlay)
 * No props required at mount time.
 *
 * The History TAKEOVER around MpiCompareView — it owns the overlay and nothing else.
 *
 * Instance methods (on instance.el):
 *   open(itemA, itemB) — load two MediaItems and show the overlay
 *                        itemA = left/before, itemB = right/after
 *   hide()             — close the overlay and destroy the compare surface
 *
 * Emits:
 *   'close' {} — overlay closed
 */

/**
 * @typedef {Object} MpiViewerCornersChipItem
 * @property {string}     text         - Chip label (will be rendered as-is; CSS uppercases)
 * @property {boolean}    [accent]     - Use ink-1 color instead of muted ink-3
 * @property {boolean}    [disabled]   - Greyed out + click suppressed
 * @property {() => void} [onClick]    - Provide to render as a clickable button; omit for static label
 */

/**
 * @typedef {Object} MpiViewerCornersProps (Compound — js/components/Compounds/MpiViewerCorners)
 * @property {MpiViewerCornersChipItem[]} [topRight] - Initial chip list (top-right slot)
 *
 * Top-right chip strip overlay for viewers (canvas + video). Stage-token only.
 * Mount as a sibling inside a position:relative viewer wrap; the corners element
 * fills its parent (`inset: 0`) and is pointer-events:none except on chips.
 *
 * Instance methods (on instance.el):
 *   setTopRight(items)            — replace chip list (full re-render)
 *   setChipEnabled(index, bool)   — toggle disabled state in place
 *   setChipText(index, text)      — update chip text in place
 *   setChipAccent(index, bool)    — toggle accent (ink-1) color
 *   destroy()                     — drop all click listeners
 *
 * Emits: none (use the per-chip onClick callback).
 */

/**
 * @typedef {Object} MpiTrimBarProps (Compound — js/components/Compounds/MpiTrimBar)
 * @property {number} [duration=0]   - Total clip length in seconds
 * @property {number} [fps=30]       - Snap granularity for handles + playhead
 * @property {number} [value=0]      - Initial playhead in seconds (clamped to [in,out])
 * @property {number} [inPoint=0]    - Initial in-point in seconds
 * @property {number} [outPoint]     - Initial out-point in seconds (defaults to duration)
 *
 * Self-contained two-handle trim seek bar. Track is 44px tall; trim handles
 * and the playhead overflow ±8px top/bottom and must NOT be clipped by the
 * parent. Stage tokens only (--accent-heat / --surface-bar / --line / --ink-1).
 *
 * Pointer drag coalesces on RAF; final value re-emits on pointerup so
 * downstream consumers see a stable end state.
 *
 * Instance methods (on instance.el):
 *   setDuration(d)                — replace duration; clamps in/out/value
 *   setFps(fps)                   — change snap granularity
 *   setValue(t) / setValueQuiet(t)
 *   setRange(in, out) / setRangeQuiet(in, out)
 *   getValue()                    — current playhead seconds
 *   getRange()                    — { in, out }
 *   destroy()                     — cancel RAF + drop listeners
 *
 * Emits (component-local):
 *   'seek'         { time }       — playhead committed (drag end or click)
 *   'in-change'    { time }       — in handle committed
 *   'out-change'   { time }       — out handle committed
 *   'range-change' { in, out }    — fired alongside in/out commits
 */

/**
 * @typedef {Object} MpiVideoSurfaceProps (Compound — js/components/Compounds/MpiVideoSurface)
 * @property {string}  [src]           - Video source URL
 * @property {string}  [poster]        - Poster image URL
 * @property {boolean} [autoplay=false]
 * @property {boolean} [loop=true]
 * @property {boolean} [muted=false]
 * @property {number}  [volume=1.0]
 * @property {number}  [fps=24]        - Frame rate for frameStep / seek clamp
 *
 * Bare <video> surface with click-to-toggle play. Owns no transport UI;
 * MpiVideoControlBar drives it via attachSurface(). Preserves the loop-
 * disable / seeked-restore dance and frame-step wrap-on-loop semantics.
 *
 * Instance methods (on instance.el):
 *   _setSrc(url)            — replace src + reload
 *   _play() / _pause()
 *   seek(seconds)           — clamps to [0, duration - 1/fps]; preserves loop dance
 *   frameStep(±1)           — pauses first; wraps when video.loop
 *   getVideoElement()       — raw <video> ref
 *   _setFps(fps) / _setFrameCount(n)
 *   getFps() / getFrameCount()
 *   _setVolume(v) / _setMuted(m)
 *   destroy()               — stop, clear src, drop listeners
 *
 * Emits (component-local):
 *   'play' / 'pause' / 'ended'   { time }
 *   'timeupdate'                 { time, duration }
 *   'loadedmetadata'             { duration }
 *   'volumechange'               { volume, muted }
 */

/**
 * @typedef {Object} MpiVideoControlBarProps (Compound — js/components/Compounds/MpiVideoControlBar)
 * @property {number} [fps=24]
 *
 * Transport + trim row for video. Mounts MpiTrimBar internally + the
 * play/frame±/loop/audio/fullscreen/frames-toggle buttons + time display.
 * Drives a sibling MpiVideoSurface via attachSurface(instance). Owns the
 * window-global video hotkeys (rebound/unbound on attach/detach).
 *
 * Range UX is wired but visual-only at this phase — defaults to the full
 * clip on each loadedmetadata. Persistence + range-aware ops land in
 * Phase D/E of the trim plan.
 *
 * Instance methods (on instance.el):
 *   attachSurface(instance)         — wire to a MpiVideoSurface instance
 *   detachSurface()                 — drop surface listeners + hotkeys
 *   setRange(in, out) / setRangeQuiet(in, out)
 *   getRange() / getValue()
 *   setVolume(v) / setMuted(m)
 *   setFrameCount(n)
 *   setFps(fps)
 *   destroy()
 *
 * Emits (component-local):
 *   'loop-change' { loop }
 */

/**
 * @typedef {Object} MpiErrorDialogProps (Compound — js/components/Compounds/MpiErrorDialog)
 * @property {string}  [title='An error occurred'] - Dialog title
 * @property {string}  [message='']               - Error detail shown to the user
 * @property {boolean} [downloadLog=true]          - Whether to show the Download Log button
 *
 * Instance methods (on instance.el):
 *   show()                    — portals backdrop + dialog to document.body
 *   hide()                    — removes portal, releases OverlayManager
 *   setError(title, message)  — update content before or after show()
 *
 * Preferred usage — call the shell singleton instead of mounting directly:
 *   import { showError } from '../../shell.js';
 *   showError('ComfyUI failed to start', 'Connection refused on port 48188');
 *
 * Emits:
 * 'dismiss'     {} — Dismiss button clicked
 * 'downloadLog' {} — Download Log button clicked
 */

/**
 * @typedef {Object} MpiStartingComfyProps (Compound — js/components/Compounds/MpiStartingComfy)
 * @property {string}   [title]  - Large title text
 * @property {string}   [text]   - Descriptive text below title
 *
 * Instance methods (on instance.el):
 *   show(phase?)                — Shows the modal with loading spinner. `phase` is an
 *                                 optional `{ title, text }` overriding the copy for a
 *                                 named startup step (e.g. the curated pip pass);
 *                                 omitting it resets to the default copy.
 *   hide()                      — Hides the modal
 *   setError(errMsg)            — Hides spinner and shows error text
 *   setLoading(isLoading)       — Toggles loading spinner
 */

/**
 * @typedef {Object} MpiMediaDropOverlayProps (Primitive — js/components/Primitives/MpiMediaDropOverlay)
 * @property {function({ file: File, mediaType: 'image'|'video' }): void} [onDrop]
 *   Called when a valid OS file is dropped. Upload, Events.emit, etc. are the
 *   caller's responsibility — this primitive is dumb.
 *
 * Full-area OS-file drop target. Shown by blocks while OS files are dragged
 * over the window. Ignores internal `application/mpi-media` drags.
 *
 * Instance methods (on instance.el):
 *   show() — add `--visible` modifier, making overlay interactive
 *   hide() — remove `--visible` modifier
 *
 * Auto-hides on global `ui:close-all-popups` event (Escape key).
 *
 * Does NOT emit component-level events and does NOT upload — callers own side effects.
 */

/**
 * @typedef {Object} MpiFolderDropProps (Primitive — js/components/Primitives/MpiFolderDrop)
 * @property {string} folderPath — absolute target folder; MUST be a configured
 *   model folder (primary root or a stored extra) — the import route rejects others.
 * @property {'loras'|'upscale_models'} bucket — model bucket this folder holds.
 * @property {string} [label] — display label (defaults to folderPath).
 * @property {boolean} [primary] — mark the primary managed folder.
 * @property {function(string): void} [onImport] — called with the imported
 *   filename after a successful copy (use to refresh asset lists / dropdowns).
 *
 * A labeled folder path that is also an OS drop target for model files. On drop
 * it resolves the file's absolute path via Electron `webUtils.getPathForFile`
 * and POSTs /comfy/import-model to COPY it into this folder (original stays).
 * A same-name collision triggers a confirm-then-replace. Browser dev mode (no
 * webUtils) ignores drops. Rejects non-model extensions with a ui:warning toast.
 *
 *
 * @typedef {Object} MpiProjectDropOverlayProps (Primitive — js/components/Primitives/MpiProjectDropOverlay)
 * @property {function({ folderPath: string, source: 'folder'|'json' }): void} [onDrop]
 *   Called when the user drops a project folder or a project.json onto the
 *   overlay. folderPath is absolute, normalised to forward slashes. Validation
 *   of the folder contents (project.json shape, id/name) is the caller's
 *   responsibility — this primitive only resolves the input to a folder path.
 *
 * Full-area OS-file drop target. Shown by the landing page while OS files are
 * dragged over the window. Reads the absolute path via Electron's
 * `webUtils.getPathForFile`; silently ignores drops when `webUtils` is
 * unavailable (plain-browser dev mode).
 *
 * Instance methods (on instance.el):
 *   show() — add `--visible` modifier, making overlay interactive
 *   hide() — remove `--visible` modifier
 *
 * Auto-hides on global `ui:close-all-popups` event (Escape key).
 *
 * Does NOT emit component-level events and does NOT call the backend — callers own side effects.
 */

/**
 * @typedef {Object} MpiComponentInstance
 * @property {HTMLElement} el - The root element in the DOM
 * @property {Object} props - Current properties
 * @property {function(Object): void} update - Merges new props and re-renders
 * @property {function(): void} destroy - Removes component from DOM and cleans listeners
 * @property {function(string, function): void} on - Subscribes to internal events
 */
/**
 * @typedef {Object} MpiTemplateEventMap — Template lifecycle events
 * 'templates:updated'  { projectId: string }          — template saved or deleted
 * 'templates:loaded'   { projectId: string, name: string } — template applied
 */

/**
 * @typedef {Object} MpiModelSettingsProps (Compound — js/components/Compounds/MpiModelSettings)
 * No props required at mount time — all data is loaded imperatively via open().
 *
 * Instance methods (on instance.el):
 *   open({ modelId?: string, toolKey?: string })
 *     — Populate from state.currentProject and show the overlay.
 *       Pass modelId for model context (shows LoRA slots + upscale selector).
 *       Pass toolKey for tool context (shows upscale selector only).
 *
 * Emits:
 *   'saved' {} — user confirmed changes; already persisted to disk
 *   'close' {} — overlay dismissed without saving
 */

/**
 * @typedef {Object} MpiModelPickerProps (Compound — js/components/Compounds/MpiModelPicker)
 * No props at mount time — the opener passes its own model list to open().
 *
 * The model overlay (MPI-356). Renders the Model Library's tile (MpiTileSheet)
 * over a self-hosted MpiOverlay(body); a click selects and closes.
 *
 * Instance methods (on instance.el):
 *   open({ models: ModelDef[], modelId?: string|null })
 *     — Render the passed (already workspace-filtered, installed) models and show.
 *   close()
 *
 * Emits:
 *   'select'   { model } — tile clicked; the overlay has already closed
 *   'settings' { model } — LoRA & Upscale clicked; the opener owns MpiModelSettings
 */



/**
 * @typedef {Object} MpiChangelogDialogProps (Compound — js/components/Compounds/MpiChangelogDialog)
 * No props required at mount time — content is provided imperatively via open().
 *
 * Startup "What's New" overlay. Describes the already-running APP_VERSION after a
 * version bump/update. NOT an updater — never checks the network or polls for
 * releases. Consumes the runtime release-note source (js/data/releaseNotes.js).
 * Shown as a singleton from shell.js, once per APP_VERSION.
 *
 * Instance methods (on instance.el):
 *   open({ version: string, stage?: string, notes: ReleaseNotes })
 *     — Set content (kicker label + sections) before showing. Rebuilds the body,
 *       so repeated open() calls are idempotent. Empty sections stay hidden.
 *   show() — portal + blocking backdrop (idempotent)
 *   hide() — release overlay
 *
 * Emits:
 *   'dismiss' { version: string } — user clicked Done. Escape/backdrop hide the
 *       modal but do NOT emit dismiss; the seen-version is persisted only on Done
 *       (wired in shell.js).
 */


/**
 * @typedef {Object} MpiLicenceGateProps (Compound — js/components/Compounds/MpiLicenceGate)
 * @property {LicenceDescriptor} licence - Descriptor from js/data/modelConstants/licences.js.
 *
 * Licence acceptance gate (MPI-451), shown before a licence-gated model downloads.
 * A few model licences oblige us as distributor to bind the END USER to the
 * licensor's restrictions before handing over the weights (MiniMax H3 §V.2); this
 * dialog is that notice and that binding. Only models with a descriptor in
 * MODEL_LICENCES ever see it — every other install path is untouched.
 *
 * Accept unlocks in two steps: the restrictions pane must be scrolled to the end
 * (which enables the acknowledgement checkboxes), then every box must be ticked.
 * The scroll gate covers that pane only, not the full agreement, which is a link out.
 * backdropClose is off — a stray click must not read as a decision here.
 *
 * Preferred usage — the promise helper, not a manual mount:
 *   import { showLicenceGate } from '.../MpiLicenceGate.js';
 *   if (await showLicenceGate(licence)) install();
 * downloadService.start() already does this for every gated model, so a caller
 * should almost never need it directly.
 *
 * Emits:
 *   'accept' {} — every box ticked and Accept pressed
 *   'cancel' {} — Cancel pressed. Escape / ui:close-all-popups do NOT emit it; the
 *       showLicenceGate helper watches for the element leaving the DOM and settles
 *       those as a decline, so the install promise can never hang.
 */


/**
 * @typedef {Object} MpiOpHelpDialogProps (Compound — js/components/Compounds/MpiOpHelpDialog)
 * No props required at mount time — content is provided imperatively via open().
 *
 * Per-operation prompting guide (MPI-360), opened by the "?" above the op strip in
 * the PromptBox parameters popup. Read-only: it has no confirm path and cannot
 * change a generation. Content comes from `getOpHelp(opKey, model)` in
 * js/data/commandRegistry.js, which resolves the op's own `help` block and any
 * per-model override — this component never looks anything up itself.
 *
 * MpiModal owns the backdrop, the portal and the Overlays entry, so Escape and
 * backdrop-click close it like every other modal.
 *
 * Instance methods (on instance.el):
 *   open({ title: string, body: string[],
 *          examples: Array<{prompt:string, note?:string, bad?:boolean}>,
 *          media: string[] })
 *     — Set content before showing. Rebuilds the body, so repeated open() calls are
 *       idempotent (the same instance is reused across ops). `media` paths are app-
 *       root-relative statics (`assets/help/inpaint.gif`); mp4/webm/mov render as a
 *       muted looping <video>, everything else (including GIF) as an <img>. A path
 *       that fails to load removes its own node rather than showing a broken glyph.
 *   show() — portal + blocking backdrop (idempotent)
 *   hide() — release overlay
 *
 * Emits: nothing. Closing is the only interaction.
 */


/**
 * @typedef {Object} MpiVoicePickerProps (Compound — js/components/Compounds/MpiVoicePicker, MPI-622)
 * @property {object} manifest              - Plain voice manifest (voices[] + performanceClips[]).
 *                                            Pass a fixture at dev/gallery time; the component
 *                                            never fetches. At runtime callers pass the result
 *                                            of loadVoiceLibrary() (its raw parsed JSON, not the
 *                                            library instance).
 * @property {'narration'|'character'} [route='narration']
 *                                          - Which route this mount previews, and so what the
 *                                            play button plays. 'narration' plays the generated
 *                                            TTS audition. 'character' (VC) plays the RAW
 *                                            SAMPLE: that is the file handed to `target_voice`,
 *                                            and no generated clip can preview a conversion
 *                                            whose source is the user's own recording. The
 *                                            generated character auditions were deleted in
 *                                            Phase 3.5 for exactly that reason.
 * @property {string} [selectedVoiceId]     - Pre-selected voice id.
 * @property {number|null} [userPitchHz]    - Median F0 of the user's own uploaded sample (Hz).
 *                                            When provided, pitch-distance warnings are shown
 *                                            beside voices whose median_f0 is far. The voice
 *                                            is never blocked — warning only (brief.md § 4).
 * @property {number} [warnSemitones=6]     - Threshold (semitones) above which the warning
 *                                            appears. Defaults to 6 (~perfect fourth).
 * @property {string} [kind]                - Narrow to one route's voices: '' | 'narration' |
 *                                            'character'. NO UI — the filter dropdowns were
 *                                            removed in Phase 4 and this is inert against the
 *                                            shipped library, where every voice is kind:'both'.
 * @property {boolean} [emotions=true]      - Render the emotion control at all. FALSE on the
 *                                            Voice Changer mount: that flow has no TTS stage,
 *                                            so the user's own recording carries the delivery
 *                                            and VC preserves it rather than adding one — the
 *                                            control would act on nothing. Emotion is a TTS
 *                                            control: the dropdown picks a performance clip,
 *                                            TTS speaks with that clip's delivery, and VC then
 *                                            swaps the voice while carrying it through.
 *
 * NO FILTERS, and the sections are divided into DEMOGRAPHIC GROUPS (Fabio, 2026-08-26 —
 * "we don't have that many voices to even think of filters at this point"). The group
 * (VOICE_GROUPS in js/data/voiceLibrary.js) is ORDERING only: two sections under one
 * heading are two different voices, so a group never flattens the sections inside it.
 *
 * Emits:
 *   'select'         { voice, emotion? }  — user confirmed; emotion only when the control showed.
 *   'audition-start' { voice }            — audition playback began.
 *   'audition-stop'  {}                   — audition playback stopped.
 *
 * Two voice kinds, and a voice may be both (kind:'both'):
 *   narration — direct TTS, no emotion, sounds exactly like its voice clip.
 *   character — TTS(performance clip) → VC(character clip), full emotion set.
 *
 * Filtering: kind / register / gender / language / section. accent is hidden — it is nullable
 * on purpose (a wrong label is worse than a missing one) and meaningless for character voices.
 * Emotion picker is shown in the detail panel for character/both voices only.
 *
 * THE LIST IS SECTIONS OF VARIATIONS. The shipped library is 15 sections over 56 clips, and
 * within a section they are one voice performed slightly differently, not distinct voices
 * (Fabio's ear, 2026-08-26). A section of one renders as a plain voice and is never labelled
 * "Variation 1".
 *
 * Audio: `route` decides — the narration audition, or the raw sample for VC. All paths go
 * through `library.assetUrl()`; a manifest path handed straight to `new Audio()` resolves
 * against the page and 404s.
 */
