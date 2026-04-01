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
 * @typedef {Object} MpiDropdownProps (Block — js/components/Blocks/MpiDropdown)
 * @param {string[]} titles - Options to display in the list
 * @param {string} [label='Select...'] - Initial trigger text
 * @param {string|number} [maxHeight='250px'] - Max list height before scrolling
 * @param {'top'|'bottom'} [position='top'] - Where the dropdown appears (above/below trigger)
 * @param {string} [icon] - Custom icon name (defaults to chevronUp for top, chevronDown for bottom)
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
 * @typedef {Object} MpiDragListProps (Compound — js/components/Compounds/MpiDragList)
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




