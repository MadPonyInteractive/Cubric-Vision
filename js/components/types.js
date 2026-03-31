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
 * @typedef {Object} MpiButtonProps
 * @property {string} [text] - Button label
 * @property {'primary' | 'secondary' | 'danger' | 'outline' | 'ghost'} variant - Visual style variant
 * @property {'sm' | 'md' | 'lg'} [size='md'] - Button size
 * @property {string} [info] - Info Bar description
 * @property {boolean} [disabled=false] - Whether the button is interactable
 * @property {boolean} [loading=false] - Whether the button is in a loading state
 * @property {'button' | 'submit' | 'reset'} [type='button'] - HTML button type
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
 * @typedef {Object} MpiIconButtonProps  (Compound — js/components/Compounds/MpiIconButton)
 * @property {string} icon           - MpiIcon registry key (e.g. 'play', 'trash', 'settings')
 * @property {string} [iconActive]   - Icon shown when active/toggled (enables icon-swap behaviour)
 * @property {string} [label]        - Optional text label shown beside icon
 * @property {string} [info]         - Info Bar / tooltip description (sets data-info + title)
 * @property {'primary'|'danger'|'loading'|'disabled'} [variant='primary'] - Visual variant
 * @property {'sm'|'md'|'lg'} [size='md'] - Button size
 * @property {boolean} [toggleable]  - If true, click commits the pressed (inverted) state
 * @property {boolean} [active]      - Initial active/toggled state
 * @property {'left'|'right'|'top'|'bottom'} [labelPosition='right'] - Position of label relative to icon
 */


/**
 * @typedef {Object} MpiPopupProps (Primitive — js/components/Primitives/MpiPopup)
 * @property {boolean} [active=false] - Whether the popup is visible
 * @property {string} [id] - Unique ID for the popup
 * @property {string} [variant='glass'] - Visual variant
 */


/**
 * @typedef {Object} MpiSliderProps (Compound — js/components/Compounds/MpiSlider)
 * @property {string}  [prefix='']     - Text shown before value in Info Bar
 * @property {string}  [suffix='']     - Text shown after value in Info Bar
 * @property {string}  [info]          - Tooltip/Info template (overrides prefix/suffix)
 * @property {boolean} [wheel=true]    - Enable mouse wheel support
 * @property {number}  [min=0]         - Min value
 * @property {number}  [max=100]        - Max value
 * @property {number}  [step=1]        - Step increment
 * @property {number}  [value=50]       - Initial value
 * @property {boolean} [interactive=true] - Inherited, but Sliders are typically interactive
 * @property {'primary'|'secondary'|'success'|'danger'} [variant='primary']
 */

/**
 * @typedef {Object} MpiCardProps
 * @property {string} title - Card header title
 * @property {string} [subtitle] - Optional subtitle (smaller text)
 * @property {string} [image] - Optional header image URL
 * @property {boolean} [interactive=false] - Whether the card has hover effects
 */

/**
 * @typedef {Object} MpiIconButtonProps
 * @property {string} icon - Name of icon from MpiIcon registry
 * @property {string} [info] - Description displayed in the Info Bar on hover
 * @property {'primary' | 'secondary' | 'danger' | 'ghost'} [variant='ghost'] - Visual style variant
 * @property {'sm' | 'md' | 'lg'} [size='md'] - Button size
 * @property {boolean} [toggleable=false] - If true, maintains an active/checked state
 * @property {boolean} [active=false] - Initial active state
 * @property {boolean} [disabled=false] - Whether the button is interactable
 * @property {string} [label] - Optional text label shown next to the icon
 * @property {'left'|'right'|'top'|'bottom'} [labelPosition='right'] - Position of label relative to icon
 */

/**
 * @deprecated Use MpiIconButton instead
 * @typedef {Object} MpiToggleProps
 * @property {string} [label] - Label text next to the toggle
 * @property {boolean} [checked=false] - Initial state
 * @property {boolean} [disabled=false] - Whether the toggle is interactable
 * @property {'primary' | 'accent'} [variant='primary'] - Visual style variant
 */

/**
 * @typedef {Object} MpiBadgeProps
 * @property {string} label - Badge text or count
 * @property {'primary'|'secondary'|'success'|'warning'|'danger'|'info'} [variant='primary'] - Color variant
 * @property {boolean} [pill=false] - Rounded pill style
 */

/**
 * @typedef {Object} MpiSpinnerProps
 * @property {'sm'|'md'|'lg'} [size='md'] - Spinner size
 * @property {'primary'|'secondary'|'light'|'dark'} [variant='primary'] - Color variant
 */

/**
 * @typedef {Object} MpiProgressBarProps (Primitive — js/components/Primitives/MpiProgressBar)
 * @property {number} [min=0] - Minimum value
 * @property {number} [max=100] - Maximum value
 * @property {number} [step=1] - Step increment
 * @property {number} [value=50] - Current value
 * @property {string} [info] - Info Bar description (supports {value} placeholder)
 * @property {boolean} [interactive=false] - If false, input is disabled (static progress)
 * @property {'primary'|'secondary'|'success'|'danger'} [variant='primary'] - Color variant
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

// Replaced by MpiProgressBarProps below

/**
 * @typedef {Object} MpiToastProps
 * @property {string} message - Notification message
 * @property {'info'|'success'|'warning'|'danger'} [variant='info'] - Visual variant
 * @property {number} [duration=3000] - Auto-hide duration in ms
 */

/**
 * @typedef {Object} MpiRatioSelectorProps (Compound — js/components/Compounds/MpiRatioSelector)
 * @property {string} [modelType='flux'] - Model to use for default ratios (flux or sdxl)
 * @property {'portrait'|'landscape'} [initialOrientation='portrait'] - Initial orientation
 * @property {string} [value] - Current selected ratio label
 */


/**
 * @typedef {Object} MpiPopupButtonProps (Compound — js/components/Compounds/MpiPopupButton)
 * @param {string} triggerHtml - HTML for the trigger button
 * @param {boolean} [showPopup=false] - Initial state
 * @param {'top'|'bottom'} [position='top'] - Where the popup appears
 */

/**
 * @typedef {Object} MpiScrollableBoxProps (Compound — js/components/Compounds/MpiScrollableBox)
 * @param {string[]} titles - Options to display in the list
 * @param {string|number} [maxHeight] - Optional max height for the scrollable area
 */

/**
 * @typedef {Object} MpiDropdownProps (Block — js/components/Blocks/MpiDropdown)
 * @param {string[]} titles - Options to display in the list
 * @param {string} [label='Select...'] - Initial trigger text
 * @param {string|number} [maxHeight='250px'] - Max list height before scrolling
 * @param {'top'|'bottom'} [position='top'] - Where the dropdown appears (above/below trigger)
 * @param {string} [icon] - Custom icon name (defaults to chevronUp for top, chevronDown for bottom)
 */


/**
 * @typedef {Object} MpiPromptBoxProps (Block — js/components/Blocks/MpiPromptBox)
 * @property {string} [value=''] - Initial positive prompt value
 * @property {string} [negativeValue=''] - Initial negative prompt value
 * @property {boolean} [includeNegative=false] - Whether to show the negative prompt toggle
 * @property {any|any[]} [LeftA] - Components for the left container (ordered left-to-right)
 * @property {any|any[]} [rightA] - Components for the right container (ordered right-to-left)
 */

/**
 * @typedef {Object} MpiDragListItem
 * @property {string} label - Display text for the item
 * @property {string|number} [id] - Unique identifier
 * @property {any} [data] - Optional metadata associated with the item
 */

/**
 * @typedef {Object} MpiDragListProps (Compound — js/components/Compounds/MpiDragList)
 * @property {MpiDragListItem[]} items - Array of items to be displayed and reordered
 * @property {string|number} [maxHeight='250px'] - Max list height before scrolling
 * @property {string} [placeholder='Empty list'] - Text shown when there are no items
 */


/**
 * @typedef {Object} MpiMediaDropzoneProps (Compound — js/components/Compounds/MpiMediaDropzone)
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
 * @typedef {Object} MpiComponentInstance
 * @property {HTMLElement} el - The root element in the DOM
 * @property {Object} props - Current properties
 * @property {function(Object): void} update - Merges new props and re-renders
 * @property {function(): void} destroy - Removes component from DOM and cleans listeners
 * @property {function(string, function): void} on - Subscribes to internal events
 */
