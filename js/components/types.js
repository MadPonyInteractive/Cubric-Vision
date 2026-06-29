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
 *   setCropRatio(ratio), getCropRect()
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
 * Emits: 'apply' { kind: 'image' | 'video-save' | 'video-snapshot' }
 */

/**
 * @typedef {Object} MpiToolOptionsMaskProps (Organism — js/components/Organisms/MpiToolOptionsMask)
 * @property {Object} viewer - MpiCanvasViewer instance
 *
 * Requires viewer.el: enterMode('mask'), exitMode(), evaluateMask(),
 *   setMaskBrushMode('brush'|'eraser'), clearMask(), invertMask(),
 *   getDetectionModels?(), setAutoMaskModel(), setAutoMaskUseBox(),
 *   runAutoMaskDetect(), getAutoMaskThumbsEl?(), compositeMaskDataURL()
 * No 'apply' emitted — mask is canvas-resident; PromptBox drives operations.
 */

/**
 * @typedef {Object} MpiToolOptionsUpscaleProps (Organism — js/components/Organisms/MpiToolOptionsUpscale)
 * @property {Object} viewer - MpiVideoViewer instance
 * Emits: 'apply' { factor: number, model: string }
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
 * @property {Array<string|{label:string,value:string,meta?:string,description?:string,detail?:string,disabled?:boolean}>} [options=[]] - Option list
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
 * @property {boolean} [includeNegative=false]
 * @property {boolean} [showSettings=true]
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
 *   show(mode)              — 'installing' | 'upgrading' — portals and shows appropriate phase
 *   hide()                  — removes portal, clears state
 *   setProgress(data)       — { progress: 0–100, speed, downloadedBytes, totalBytes }
 *   setStatus(text)         — update status message (e.g. 'Extracting...')
 *   setError(message)       — show error message + retry button
 *   destroy()               — cleanup SSE connection and portal
 *
 * Two-phase UI for first install:
 *   Phase 1 (setup):        Models path picker + Browse button + Install button
 *   Phase 2 (progress):     Progress bar + status text + speed/size info
 *
 * For upgrades:
 *   Skips Phase 1, goes straight to Phase 2 with "models are safe" messaging
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
 * @typedef {Object} MpiSpinnerProps
 * @property {'sm'|'md'|'lg'} [size='md'] - Spinner size
 * @property {'primary'|'secondary'|'light'|'dark'} [variant='primary'] - Color variant
 */

/**
 * @typedef {Object} MpiToastProps
 * @property {string} message - Notification message
 * @property {'info'|'success'|'warning'|'danger'} [variant='info'] - Visual variant
 * @property {number} [duration=3000] - Auto-hide duration in ms
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
 * Takes no props. Model-manager content for the MpiSlideOver panel — renders
 * installed + available models as MpiInstalledDisplay cards and owns refresh,
 * install, pause/resume/cancel, uninstall confirmation, and download:* subs.
 *
 * Opened via: Events.emit('slide-over:open', { title: 'Models', component: MpiModelManager }).
 *
 * Instance methods (on instance.el):
 *   onOpen()  — called by MpiSlideOver each time the panel opens; re-syncs installed state.
 *   destroy() — tears down all subscriptions, card instances, and the uninstall dialog.
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
 * @property {string}   [value='']           - Initial notes text shown in the textarea.
 * @property {string}   [placeholder='Write your notes here…'] - Textarea placeholder.
 * @property {Function} [onSave]             - async (notes: string) => void. Persists the notes.
 *                                             While it runs the Save button is disabled and the modal
 *                                             stays open; on rejection the modal stays open for retry.
 *
 * Instance methods (on instance.el):
 *   show() — Self-portals a backdrop + centred dialog to document.body (via MpiModal).
 *   hide() — Removes backdrop/wrapper, releases OverlayManager queue.
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
 *   updatePreview(tempId, previewUrl) — push latent preview to a generating card during generation
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
 *   'reuse'             { item, positive, negative, modelId, operation, injectionParams, mediaItems } - reuse prompt button clicked
 */

/**
 * @typedef {Object} MpiReusePromptDialogProps (Compound - js/components/Compounds/MpiReusePromptDialog)
 * @property {{prompt?:boolean,settings?:boolean,model?:boolean,images?:boolean}} [includes] - Initial checked reuse parts
 * @property {'original'|'current'} [source='original'] - Initial Gallery source option
 * @property {boolean} [showSource=true] - Whether to show Gallery source radio controls
 *
 * Instance methods (on instance.el):
 *   show()    - open the modal
 *   hide()    - close the modal
 *   destroy() - release modal listeners
 *
 * Emits:
 *   'apply'  { includes, source } - user confirmed reuse choices
 *   'cancel' {}                   - user cancelled
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
 *   enterMode(mode)               — enter 'crop'|'mask'|'automask' (or 'none' to exit all)
 *   exitMode()                    — exit any active tool mode
 *   getCurrentMaskDataURL()        — returns current mask as data URL, or null
 *   getMaskDataURLForEntry(item)   — returns one entry's mask data URL, or null
 *   hasMaskForEntry(item)          — resolves true when one entry has a mask
 *   hasMask()                     — returns boolean
 *   setGenerating(bool)            — show/hide generating spinner
 *
 * Emits:
 *   'mode-changed'  { mode }      — tool mode changed (from any source)
 *   'crop-applied'  { item }      — crop completed; item is the new HistoryItem
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
 * @property {Array<{action:string, label:string, icon:string}>} [extraItems=[]] - Extra items appended to every context (use for dev/conditional entries like the Components Gallery)
 *
 * Instance methods (on instance.el):
 *   show()                  — programmatically show the menu
 *   hide()                  — programmatically hide the menu
 *   setContext(ctx)         — switch context and re-render if visible
 *   setExtraItems(items)    — replace injected extra items and re-render if visible
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
 * @typedef {Object} MpiCompareOverlayProps (Compound — js/components/Compounds/MpiCompareOverlay)
 * No props required at mount time.
 *
 * Instance methods (on instance.el):
 *   open(itemA, itemB) — load two MediaItems and show the overlay
 *                        itemA = left/before, itemB = right/after
 *   hide()             — close the overlay and destroy the canvas
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
 *   showError('ComfyUI failed to start', 'Connection refused on port 8188');
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
 *   show()                      — Shows the modal with loading spinner
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
