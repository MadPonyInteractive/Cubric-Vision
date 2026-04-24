/**
 * js/components/types.js — Shared Component Type Definitions for MpiAiSuite.
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
 * @typedef {Object} MpiToolActionBarDef
 * @property {string}  key              - Unique key emitted with 'action' event
 * @property {string}  icon             - Icon registry key
 * @property {string}  [label]          - Text label shown below icon
 * @property {string}  [variant='ghost'] - MpiButton variant
 * @property {boolean} [toggleable]     - Button commits active state on click
 * @property {boolean} [active]         - Initial active state
 * @property {string}  [radioGroup]     - Buttons in the same group are mutually exclusive
 * @property {string}  [info]           - Tooltip / info bar text
 */

/**
 * @typedef {Object} MpiToolActionBarProps (Compound — js/components/Compounds/MpiToolActionBar)
 * @property {MpiToolActionBarDef[]} actions   - Button definitions
 * @property {Object}               [topSlot]  - A mounted component instance shown above the pill (e.g. MpiAutoMaskThumbs)
 * @property {Object}               [leftSlot] - A mounted component instance to embed on the left of the pill
 *
 * Instance methods (on instance.el):
 *   show()          — make the bar visible (slide-up animation)
 *   hide()          — hide the bar
 *   setActive(key)  — activate a toggleable button and deactivate its radio siblings (no event emitted)
 *
 * Emits:
 *   'action' { key: string, active: boolean } — any button clicked
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
 * @typedef {Object} MpiHistoryToolsDef
 * @property {string} mode - Canvas mode key ('crop'|'mask'|...)
 * @property {string} icon - Icon registry key
 * @property {string} [info] - Info bar / tooltip text
 */

/**
 * @typedef {Object} MpiHistoryToolsProps (Compound — js/components/Compounds/MpiHistoryTools)
 * @property {MpiHistoryToolsDef[]} tools - Ordered list of tool definitions to render
 *
 * Instance methods (on instance.el):
 *   syncMode(mode) — reflect an external modechange onto button states without emitting events.
 *                    Pass 'none' to deactivate all buttons.
 *
 * Emits:
 *   'activate'   { mode: string } — user pressed an inactive tool button
 *   'deactivate' { mode: string } — user pressed the currently-active tool button (toggle off)
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
 * @property {Array<string|{label:string,value:string}>} [options=[]] - Option list
 * @property {string} [value=''] - Currently selected value
 * @property {string} [placeholder='Select...'] - Placeholder text (empty/unselected label)
 * @property {boolean} [disabled=false] - Disabled state
 * @property {'up'|'down'} [direction='down'] - Preferred open direction
 * @property {string} [info] - Info Bar description
 *
 * Emits:
 * 'change' { value: string }
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
 * @property {'ratio'|'number'} variant  - Selector variant (required)
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
 * @typedef {Object} MpiVideoPlayerProps (Compound — js/components/Compounds/MpiVideoPlayer)
 * @property {string} [src] - Video source URL
 * @property {string} [poster] - Poster image URL
 * @property {boolean} [autoplay=false] - Auto-play on mount
 * @property {boolean} [loop=false] - Loop playback
 * @property {boolean} [muted=false] - Start muted
 * @property {number} [volume=1.0] - Initial volume (0–1)
 * @property {boolean} [controls=true] - Show custom UI controls overlay
 *
 * Emits:
 * 'play' { time: number }
 * 'pause' { time: number }
 * 'ended' { time: number }
 * 'timeupdate' { time: number, duration: number }
 * 'change' { volume: number, muted: boolean }
 */

/**
 * @typedef {Object} MpiVideoViewerProps (Organism — js/components/Organisms/MpiVideoViewer)
 * @property {number} [fps=24] - Frame rate for video playback (passed to MpiVideoPlayer)
 * @property {boolean} [controls=true] - Show video player controls
 *
 * Instance methods (on instance.el):
 *   loadVideo(url, meta = {})         — load video URL; meta may include { fps, duration, frameCount, hasAudio }
 *   enterCropMode(initialRect = null) — enable crop overlay with optional initial normalized rect
 *   exitCropMode()                    — disable crop overlay
 *   getCropRect()                     — returns current normalized crop rect { x, y, w, h }
 *   setCropRatio(ratio)               — set aspect ratio lock (null = free)
 *   captureSnapshot()                 — returns { blob, dataUrl } of current frame, respecting active crop
 *   destroy()                         — clean up player, cropTool, observers, listeners
 *
 * Emits:
 *   'play', 'pause', 'ended', 'timeupdate', 'change', 'loop-change' — forwarded from MpiVideoPlayer
 *   'crop-change' { rect: { x, y, w, h } } — crop rect changed
 */

/**
 * @typedef {Object} MpiDragListProps (Primitive — js/components/Primitives/MpiDragList)
 * @property {MpiDragListItem[]} items - Array of items to be displayed and reordered
 * @property {string|number} [maxHeight='250px'] - Max list height before scrolling
 * @property {string} [placeholder='Empty list'] - Text shown when there are no items
 */

/**
 * @typedef {Object} MpiDragListItem
 * @property {string} label - Display text for the item
 * @property {string|number} [id] - Unique identifier
 * @property {any} [data] - Optional metadata associated with the item
 */

/**
 * @typedef {Object} MpiMediaDropzoneProps (Primitive — js/components/Primitives/MpiMediaDropzone)
 * @property {string}   [icon='media']  - Key from MpiIcon registry
 * @property {string}   title           - Primary title text
 * @property {string}   text            - Description text
 * @property {string}   [footer]        - Optional dimensions/footer info
 * @property {string[]} [mediaType]     - Array of accepted types: 'image', 'video', 'audio'
 * @property {string}   [width='250px'] - Fixed width override
 * @property {string}   [value]         - URL of displayed media (sets display mode)
 * @property {'image'|'video'|'audio'} [type='image'] - Media type for display rendering
 */


/**
 * @typedef {Object} MpiPromptBoxProps (Block — js/components/Blocks/MpiPromptBox)
 * @property {import('./data/modelRegistry.js').ModelDef|null} [model=null]
 * @property {import('./data/modelRegistry.js').ModelDef[]} [modelList=[]]
 * @property {string} [operation='t2i']
 * @property {string} [value='']
 * @property {string} [negativeValue='']
 * @property {boolean} [includeNegative=false]
 * @property {boolean} [showSettings=true]
 * @property {boolean} [generating=false]
 * @property {Object} [context={}]
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
 *   injectMedia({ url, mediaType }) → boolean
 *     — Adds media chip if model accepts the type; fires warning toast and returns
 *       false if incompatible. Single source of truth for all inject paths.
 *
 * Emits:
 *   'model-change'      { model }
 *   'operation-change'  { operation }
 *   'media-change'      { imageCount, videoCount, items }
 *   'run'               { operation, positive, negative, mediaItems, injectionParams }
 *   'cancel'            {}
 *   'settings'          { model }
 */


/**
 * @typedef {Object} MpiVolumeControlProps (Compound — js/components/Compounds/MpiVolumeControl)
 * @property {number} [volume=1.0] - Initial volume 0–1
 * @property {boolean} [muted=false] - Initial muted state
 * Emits: 'change' { volume: number, muted: boolean }
 */

/**
 * @typedef {Object} MpiMemoryMonitorProps (Compound — js/components/Compounds/MpiMemoryMonitor)
 * @property {number} [pollInterval=2000] - Stats fetch interval in milliseconds
 * @property {string} [info] - Info bar description for the unload button
 *
 * Instance methods (on instance.el):
 *   startPolling()          — begin or resume polling /system/stats
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
 *     media, image, compare, crop, chat, text, translate, folder, settings, help, info, grid,
 *     video, audio, upscaler, detailer, mask, unload, menu, back, chevronDown, chevronRight,
 *     volumeOff, volumeLow, volumeHigh, negative.
 *   Stroke icons (use stroke=true): ratio_1_1, ratio_3_4, ratio_4_3, ratio_4_5, ratio_5_4,
 *     ratio_5_8, ratio_8_5, ratio_9_16, ratio_16_9, gallery, refresh_stroke, seed.
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
 * @typedef {Object} MpiScrollableBoxProps (Primitive — js/components/Primitives/MpiScrollableBox)
 * @property {string[]} titles - Options to display in the list
 * @property {string|number} [maxHeight] - Optional max height for the scrollable area
 * @property {'single'|'multiple'} [selectionMode='single'] - Selection behavior
 * @property {string[]} [selected=[]] - Initially selected items
 *
 * Emits:
 * 'select' { value: string, selection: string[] }
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
 * @typedef {Object} MpiToolbarProps (Compound — js/components/Compounds/MpiToolbar)
 * @property {Array<string|{label:string,value:string}>} [presets=[]] - Saved preset list
 * @property {string} [value=''] - Currently selected preset value
 * @property {string} [placeholder='Select preset...'] - Dropdown placeholder
 *
 * Emits:
 * 'select' { value: string } — preset selected
 * 'save'   {}               — save button clicked
 * 'delete' {}               — delete button clicked
 */

/**
 * @typedef {Object} MpiCameraConfigProps (Compound — js/components/Compounds/MpiCameraConfig)
 * @property {Object} [value={}] - Initial values. Keys: cam_type, cam_lens, cam_focal,
 *   cam_aperture, cam_shutter, cam_iso, shot_angle, shot_size, shot_dof, shot_comp
 *
 * Emits:
 * 'change' { values: Object } — full values object on any field change
 */

/**
 * @typedef {Object} MpiLightingConfigProps (Compound — js/components/Compounds/MpiLightingConfig)
 * @property {Object} [value={}] - Initial values. Keys: light_type, light_color,
 *   light_intensity, light_dir
 *
 * Emits:
 * 'change' { values: Object } — full values object on any field change
 */

/**
 * @typedef {Object} MpiStyleConfigProps (Compound — js/components/Compounds/MpiStyleConfig)
 * @property {Object} [value={}] - Initial values. Keys: color_grade, color_contrast,
 *   color_sat, color_sharp
 *
 * Emits:
 * 'change' { values: Object } — full values object on any field change
 */

/**
 * @typedef {Object} MpiVideoSceneProps (Compound — js/components/Compounds/MpiVideoScene)
 * @property {MpiVideoSceneItem[]} [scenes=[]] - Initial scene list
 * @property {string[]} [angles]               - Override angle options
 * @property {string[]} [sizes]                - Override size options
 * @property {string[]} [movements]            - Override movement options
 * @property {string[]} [speeds]               - Override speed options
 *
 * Emits:
 * 'change' { scenes: MpiVideoSceneItem[] } — emitted on any field change or add/remove
 */

/**
 * @typedef {Object} MpiVideoSceneItem
 * @property {string} [description=''] - Brief shot description
 * @property {string} [angle='']       - Camera angle
 * @property {string} [size='']        - Shot size
 * @property {string} [movement='']    - Camera movement
 * @property {string} [speed='']       - Playback speed modifier
 * @property {number} [duration=5]     - Shot duration in seconds (1–30)
 */

/**
 * @typedef {Object} MpiSettingsProps (Compound — js/components/Compounds/MpiSettings)
 * No props required — all state is read from localStorage / app state internally.
 *
 * Instance methods (on instance.el):
 *   show() — opens the full-page settings overlay, initialises fields with current values
 *   hide() — closes the overlay
 *
 * Emits:
 * 'close' {} — overlay closed
 */

/**
 * @typedef {Object} MpiHelpProps (Compound — js/components/Compounds/MpiHelp)
 * No props required.
 *
 * Instance methods (on instance.el):
 *   show() — opens the full-page help overlay
 *   hide() — closes the overlay
 *
 * Emits:
 * 'close' {} — overlay closed
 */

/**
 * @typedef {Object} MpiAboutProps (Compound — js/components/Compounds/MpiAbout)
 * No props required.
 *
 * Instance methods (on instance.el):
 *   show() — opens the full-page about overlay
 *   hide() — closes the overlay
 *
 * Emits:
 * 'close' {} — overlay closed
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
 * @typedef {Object} MpiModelsModalProps (Block — js/components/Blocks/MpiModelsModal)
 * @property {string}   [icon='download']               - MpiIcon registry key shown at top centre
 * @property {'xs'|'sm'|'md'|'lg'|'xl'} [iconSize='xl'] - Icon size
 * @property {string}   [title='Install Models']     - Large title text
 * @property {string}   [text='']                    - Descriptive text above the content slot
 * @property {string}   [footer='']                   - Small text below the content slot
 * @property {boolean}  [closable=true]              - Show the X close button
 *
 * Self-owns a scrollable list of uninstalled models as MpiInstalledDisplay cards.
 * Install button per card triggers download + reSyncInstalledModels().
 * Shows automatically when state.s_installedModelIds.length === 0.
 *
 * Instance methods (on instance.el):
 *   show()  — delegates to MpiOverlay; shows the overlay
 *   hide()  — delegates to MpiOverlay; hides the overlay
 *
 * Emits:
 * 'close' {} — X button clicked (forwarded from MpiOverlay)
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
 * @typedef {Object} MpiInstalledDisplayProps (Compound — js/components/Compounds/MpiInstalledDisplay)
 * @property {string} [title='']          - Title text on the top-left
 * @property {string} [meta='']           - Small text on the top-right (e.g., "13.75GB REQUIRED")
 * @property {string} [text='']           - Descriptive body text
 * @property {string} [image='']          - Preview PNG filename from modelConstants (e.g. 'Lustify7.png').
 *                                          Renders <img> from 'comfy_workflows/display/{image}'.
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
 *   setGeneratingCard(wrapper, w, h)  — mount an external generating card in the grid's top slot
 *   clearGeneratingCard()             — remove the external generating card
 *
 * Emits:
 *   'open-group'  { group }       — user clicked a card (navigate to group history)
 *   'select'      { group, selected }  — checkbox toggled; selection mode managed by parent
 *   'reuse'       { positive, negative } — reuse prompt button clicked
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
 * Emits: (none — uses Events bus and PromptBoxService)
 * Uses: state.currentProject, state.s_selectedModelId, PromptBoxService
 */

/**
 * @typedef {Object} MpiHistoryListProps (Compound — js/components/Compounds/MpiHistoryList)
 * @property {import('./data/projectModel.js').HistoryItem[]} [history=[]] - Initial history array
 * @property {number} [selectedIndex=0] - Initially active entry index
 * @property {boolean} [isVideo=false] - Disables Compare in context menu for video groups
 *
 * Instance methods (on instance.el):
 *   setActiveIndex(idx)          — highlight active card (no events)
 *   setGroups(history)           — replace history array and rebuild cards
 *   appendEntry(item)            — add a new entry card at the end
 *   removeEntries(indices)       — remove cards at given sorted-descending indices
 *   exitSelectMode()             — programmatically exit select mode
 *
 * Emits:
 *   'entry-selected'    { idx, item }                  — card clicked (single-select)
 *   'selection-changed' { indices, anchor }             — selection updated (ctrl/shift/right-click)
 *   'selection-exited'  {}                              — select mode ended
 *   'delete-selected'   { indices }                     — delete from context menu
 *   'compare-requested' { indices: [number, number] }   — compare from context menu (image only)
 */

/**
 * @typedef {Object} MpiCanvasViewerProps (Organism — js/components/Organisms/MpiCanvasViewer)
 * @property {string} [initialImageUrl=''] - URL of the first image to load
 * @property {number} [initialIdx=0]       - History index of the initial image
 *
 * Instance methods (on instance.el):
 *   loadEntry(item, idx)           — save current mask, load item's image, restore idx's mask
 *   loadCompare(itemA, itemB)     — load two images in compare mode
 *   enterMode(mode)               — enter 'crop'|'mask'|'automask' (or 'none' to exit all)
 *   exitMode()                    — exit any active tool mode
 *   getCurrentMaskDataURL()        — returns current mask as data URL, or null
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
 * Emits: (none — uses Events bus and PromptBoxService)
 * Uses: state.currentProject, state.s_selectedModelId, PromptBoxService
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
 * @typedef {Object} MpiGalleryDropOverlayProps (Primitive — js/components/Primitives/MpiGalleryDropOverlay)
 * @property {function({ file: File, mediaType: 'image'|'video' }): void} [onDrop]
 *   Called when a valid OS file is dropped. Upload, Events.emit, etc. are the
 *   caller's responsibility — this primitive is dumb.
 *
 * Full-area OS-file drop target. Shown by gallery block while OS files are dragged
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
 * PromptBoxService — Shell-level singleton wrapper around MpiPromptBox.
 *
 * Additional method (beyond existing):
 *   injectMedia({ url, mediaType }) → boolean
 *     — Delegates to mounted MpiPromptBox el.injectMedia(). Returns false if no
 *       instance is mounted or the model rejects the type (toast already fired).
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


