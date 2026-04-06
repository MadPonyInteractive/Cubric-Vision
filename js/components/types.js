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
 * @typedef {Object} MpiRatioSelectorProps (Compound — js/components/Compounds/MpiRatioSelector)
 * @property {string} [modelType='flux'] - Model to use for default ratios (flux or sdxl)
 * @property {'portrait'|'landscape'} [initialOrientation='portrait'] - Initial orientation
 * @property {string} [value] - Current selected ratio label
 */

/**
 * @typedef {Object} MpiVideoPlayerProps (Block — js/components/Blocks/MpiVideoPlayer)
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
 * @typedef {Object} MpiPromptBoxProps (Compound — js/components/Compounds/MpiPromptBox)
 * @property {string} [value=''] - Initial positive prompt value
 * @property {string} [negativeValue=''] - Initial negative prompt value
 * @property {boolean} [includeNegative=false] - Whether to show the negative prompt toggle
 * @property {any|any[]} [LeftA] - Components for the left container (ordered left-to-right)
 * @property {any|any[]} [rightA] - Components for the right container (ordered right-to-left)
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
 * @typedef {Object} MpiProjectsPageOverlayProps (Primitive — js/components/Primitives/MpiProjectsPageOverlay)
 * @property {boolean} [closable=true] - Show the X close button in the top-right corner
 *
 * Identical API to MpiOverlay but mounts over document.body instead of #tool-container.
 * Use on the landing page where #app-shell / #tool-container are hidden.
 *
 * Instance methods (on instance.el):
 *   show()                      — stashes body children, appends backdrop + overlay
 *   hide()                      — restores body children, releases OverlayManager queue
 *   appendToContainer(el: HTMLElement) — append a child into the scrollable content slot
 *
 * Emits:
 * 'close' {} — X button clicked (hide() called automatically)
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
 *
 * Instance methods (on instance.el):
 *   show()                      — injects into #tool-container, stashing prior content
 *   hide()                      — restores prior content, releases OverlayManager queue
 *   appendToContainer(el: HTMLElement) — append a child into the scrollable content slot
 *
 * Emits:
 * 'close' {} — X button clicked (hide() called automatically)
 */

/**
 * @typedef {Object} MpiModelsModalProps (Compound — js/components/Compounds/MpiModelsModal)
 * @property {string}   [icon='info']                    - MpiIcon registry key shown at top centre
 * @property {'xs'|'sm'|'md'|'lg'|'xl'} [iconSize='xl'] - Icon size
 * @property {string}   [title='']                       - Large title text
 * @property {string}   [text='']                        - Descriptive text above the content slot
 * @property {string}   [footer='']                      - Small text below the content slot
 * @property {boolean}  [closable=true]                  - Show the X close button
 *
 * Instance methods (on instance.el):
 *   show()                      — delegates to MpiOverlay; injects into #tool-container
 *   hide()                      — delegates to MpiOverlay; restores prior content
 *   appendToContainer(el: HTMLElement) — append a child into the content slot
 *
 * Emits:
 * 'close' {} — X button clicked (forwarded from MpiOverlay)
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
 * 'ok'     { inputValue?: string } — OK button clicked (includes input value if field is present)
 * 'cancel' {}                      — Cancel BUTTON clicked only (NOT emitted on Escape or hide())
 * 'input'  { value: string }       — Optional input field value changed
 */

/**
 * @typedef {Object} MpiInstalledDisplayProps (Compound — js/components/Compounds/MpiInstalledDisplay)
 * @property {string} [title='']          - Title text on the top-left
 * @property {string} [meta='']           - Small text on the top-right (e.g., "13.75GB REQUIRED")
 * @property {string} [text='']           - Descriptive body text
 * @property {string} [icon='info']       - MpiIcon registry key for the info row
 * @property {string} [iconText='']       - Text shown next to the icon
 * @property {'xs'|'sm'|'md'|'lg'|'xl'} [iconSize='sm'] - Info icon size
 * @property {'muted'|'accent'|'primary'|'danger'|'success'} [iconColor='danger'] - Info icon color
 * @property {boolean} [showDeleteModels=false]  - Show the optional Delete Models toggle button
 * @property {boolean} [deleteModelsActive=false] - Initial active state of Delete Models toggle
 * @property {string} [deleteLabel='Uninstall']  - Label for the right action button
 *
 * Emits:
 * 'delete'       {}                  — Uninstall/Delete button clicked
 * 'deleteModels' { active: boolean } — Delete Models toggle changed
 */

/**
 * @typedef {Object} MpiProjectNameProps (Compound — js/components/Compounds/MpiProjectName)
 * @property {string} [projectName=''] - Active project name displayed as the title
 * @property {string} [pageName='']    - Current page / context label (e.g. 'Main Menu', 'Image')
 *
 * Instance methods (on instance.el):
 *   setProjectName(name)  — update project name text
 *   setPageName(name)     — update page/context label text
 *
 * Emits:
 *   'back' {} — back-arrow clicked; shell handles navigation to landing
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




