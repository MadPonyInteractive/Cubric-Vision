'use strict';

import { APP_CONFIG } from '../../dev_configs/app_config.js';

/** @enum {string} */
export const KEY_TYPE = {
    DOWN: 'down',
    UP:   'up',
};

/**
 * Declarative hotkey registry.
 * Each entry shape:
 *   { id, key, type, category, scopeLabel, description, when, allowWhileTyping }
 *
 * `type`            — KEY_TYPE.DOWN (default) or KEY_TYPE.UP
 * `when`            — optional fn({ state, event, activeElement, isTyping }) → bool
 * `allowWhileTyping`— if true, fires even when an input/textarea has focus
 *
 * NOTE: This registry is the runtime source of truth for binding. The help
 * page (`MpiHelp.js`) does NOT consume this file — its layout is hand-authored
 * HTML. When you add/change a hotkey here, also update `MpiHelp.js` HTML.
 */
export const HOTKEY_REGISTRY = [

    // ── Overlay ──────────────────────────────────────────────────────────────
    {
        id:               'overlay.close',
        key:              'escape',
        type:             KEY_TYPE.DOWN,
        category:         'overlay',
        scopeLabel:       'Overlay',
        description:      'Close overlay',
        allowWhileTyping: true,
    },

    // ── PromptBox ─────────────────────────────────────────────────────────────
    {
        id:               'promptBox.blur',
        key:              'escape',
        type:             KEY_TYPE.DOWN,
        category:         'promptBox',
        scopeLabel:       'PromptBox',
        description:      'Blur PromptBox text field (restore app hotkeys)',
        allowWhileTyping: true,
        when: ({ activeElement }) =>
            activeElement instanceof HTMLTextAreaElement &&
            !!activeElement.closest?.('.mpi-prompt-box'),
    },

    // ── Focus Mode ────────────────────────────────────────────────────────────
    {
        id:               'focusMode.toggle',
        key:              'f',
        type:             KEY_TYPE.DOWN,
        category:         'focusMode',
        scopeLabel:       'Focus Mode',
        description:      'Toggle focus mode',
        allowWhileTyping: false,
    },
    {
        id:               'focusMode.exit',
        key:              'escape',
        type:             KEY_TYPE.DOWN,
        category:         'focusMode',
        scopeLabel:       'Focus Mode',
        description:      'Exit focus mode',
        allowWhileTyping: true,
    },

    // ── Memory ────────────────────────────────────────────────────────────────
    {
        id:               'memory.refresh',
        key:              'f5',
        type:             KEY_TYPE.DOWN,
        category:         'memory',
        scopeLabel:       'Memory',
        description:      'Refresh memory',
        allowWhileTyping: true,
    },

    // ── Memory Monitor ────────────────────────────────────────────────────────
    {
        id:               'memoryMonitor.ctrl.down',
        key:              'control',
        type:             KEY_TYPE.DOWN,
        category:         'memoryMonitor',
        scopeLabel:       'Memory Monitor',
        description:      'Show memory monitor details',
        allowWhileTyping: true,
    },
    {
        id:               'memoryMonitor.ctrl.up',
        key:              'control',
        type:             KEY_TYPE.UP,
        category:         'memoryMonitor',
        scopeLabel:       'Memory Monitor',
        description:      'Hide memory monitor details',
        allowWhileTyping: true,
    },

    // ── Mask — Toolbar scope ──────────────────────────────────────────────────
    {
        id:               'mask.brush.toolbar',
        key:              'b',
        type:             KEY_TYPE.DOWN,
        category:         'mask',
        scopeLabel:       'Mask Toolbar',
        description:      'Select brush tool',
        allowWhileTyping: false,
    },
    {
        id:               'mask.eraser.toolbar',
        key:              'e',
        type:             KEY_TYPE.DOWN,
        category:         'mask',
        scopeLabel:       'Mask Toolbar',
        description:      'Select eraser tool',
        allowWhileTyping: false,
    },

    // ── Mask — Canvas scope ───────────────────────────────────────────────────
    {
        id:               'mask.brush.canvas',
        key:              'b',
        type:             KEY_TYPE.DOWN,
        category:         'mask',
        scopeLabel:       'Mask Canvas',
        description:      'Select brush tool',
        allowWhileTyping: false,
    },
    {
        id:               'mask.eraser.canvas',
        key:              'e',
        type:             KEY_TYPE.DOWN,
        category:         'mask',
        scopeLabel:       'Mask Canvas',
        description:      'Select eraser tool',
        allowWhileTyping: false,
    },

    // ── Gallery ───────────────────────────────────────────────────────────────
    {
        id:               'gallery.selection.exit',
        key:              'escape',
        type:             KEY_TYPE.DOWN,
        category:         'gallery',
        scopeLabel:       'Gallery',
        description:      'Exit selection mode',
        allowWhileTyping: true,
    },
    {
        id:               'gallery.selection.delete',
        key:              'delete',
        type:             KEY_TYPE.DOWN,
        category:         'gallery',
        scopeLabel:       'Gallery',
        description:      'Delete selected cards',
        allowWhileTyping: false,
    },
    {
        id:               'gallery.size.inc',
        key:              '+',
        type:             KEY_TYPE.DOWN,
        category:         'gallery',
        scopeLabel:       'Gallery',
        description:      'Increase thumbnail size',
        allowWhileTyping: false,
    },
    {
        id:               'gallery.size.dec',
        key:              '-',
        type:             KEY_TYPE.DOWN,
        category:         'gallery',
        scopeLabel:       'Gallery',
        description:      'Decrease thumbnail size',
        allowWhileTyping: false,
    },
    {
        id:               'gallery.queue.toggle',
        key:              'q',
        type:             KEY_TYPE.DOWN,
        category:         'gallery',
        scopeLabel:       'Gallery',
        description:      'Toggle Cue panel',
        allowWhileTyping: false,
    },
    {
        id:               'gallery.info.toggle',
        key:              'i',
        type:             KEY_TYPE.DOWN,
        category:         'gallery',
        scopeLabel:       'Gallery',
        description:      'Toggle card info mode',
        allowWhileTyping: false,
    },

    // ── History ───────────────────────────────────────────────────────────────
    {
        id:               'history.selection.delete',
        key:              'delete',
        type:             KEY_TYPE.DOWN,
        category:         'history',
        scopeLabel:       'History',
        description:      'Delete selected entries',
        allowWhileTyping: false,
    },
    {
        id:               'history.return.gallery',
        key:              'escape',
        type:             KEY_TYPE.DOWN,
        category:         'history',
        scopeLabel:       'History',
        description:      'Return to gallery',
        allowWhileTyping: true,
    },

    // ── Radial Menu ───────────────────────────────────────────────────────────
    {
        id:               'radialMenu.toggle',
        key:              'tab',
        type:             KEY_TYPE.DOWN,
        category:         'radialMenu',
        scopeLabel:       'Radial Menu',
        description:      'Toggle radial menu',
        allowWhileTyping: false,
    },

    // ── Modal ─────────────────────────────────────────────────────────────────
    {
        id:               'modal.confirm',
        key:              'enter',
        type:             KEY_TYPE.DOWN,
        category:         'modal',
        scopeLabel:       'Modal',
        description:      'Confirm modal action',
        allowWhileTyping: true,
    },

    // ── Crop ──────────────────────────────────────────────────────────────────
    {
        id:               'crop.shift.canvas',
        key:              'shift',
        type:             KEY_TYPE.DOWN,
        category:         'crop',
        scopeLabel:       'Crop Canvas',
        description:      'Constrain crop ratio (hold)',
        allowWhileTyping: false,
    },
    {
        id:               'crop.shift.canvas.up',
        key:              'shift',
        type:             KEY_TYPE.UP,
        category:         'crop',
        scopeLabel:       'Crop Canvas',
        description:      'Release crop ratio constraint',
        allowWhileTyping: false,
    },
    {
        id:               'crop.shift.video',
        key:              'shift',
        type:             KEY_TYPE.DOWN,
        category:         'crop',
        scopeLabel:       'Crop Video',
        description:      'Constrain crop ratio (hold)',
        allowWhileTyping: false,
    },
    {
        id:               'crop.shift.video.up',
        key:              'shift',
        type:             KEY_TYPE.UP,
        category:         'crop',
        scopeLabel:       'Crop Video',
        description:      'Release crop ratio constraint',
        allowWhileTyping: false,
    },

    // ── Canvas ────────────────────────────────────────────────────────────────
    {
        id:               'canvas.pan.start',
        key:              'space',
        type:             KEY_TYPE.DOWN,
        category:         'canvas',
        scopeLabel:       'Canvas',
        description:      'Start pan (hold)',
        allowWhileTyping: false,
    },
    {
        id:               'canvas.pan.end',
        key:              'space',
        type:             KEY_TYPE.UP,
        category:         'canvas',
        scopeLabel:       'Canvas',
        description:      'End pan',
        allowWhileTyping: false,
    },

    // ── Generation ────────────────────────────────────────────────────────────
    {
        id:               'generation.run',
        key:              'control+enter',
        type:             KEY_TYPE.DOWN,
        category:         'generation',
        scopeLabel:       'Generation',
        description:      'Cue generation',
        allowWhileTyping: true,
    },
    {
        id:               'generation.stop',
        key:              'control+alt+enter',
        type:             KEY_TYPE.DOWN,
        category:         'generation',
        scopeLabel:       'Generation',
        description:      'Stop current job',
        allowWhileTyping: true,
    },
    {
        id:               'generation.loop',
        key:              'control+l',
        type:             KEY_TYPE.DOWN,
        category:         'generation',
        scopeLabel:       'Generation',
        description:      'Toggle loop mode',
        allowWhileTyping: true,
    },

    // ── Video Player ──────────────────────────────────────────────────────────
    {
        id:               'video.playPause',
        key:              'space',
        type:             KEY_TYPE.DOWN,
        category:         'video',
        scopeLabel:       'Video Player',
        description:      'Play / pause',
        allowWhileTyping: false,
    },
    {
        id:               'video.frame.back',
        key:              'arrowleft',
        type:             KEY_TYPE.DOWN,
        category:         'video',
        scopeLabel:       'Video Player',
        description:      'Previous frame',
        allowWhileTyping: false,
    },
    {
        id:               'video.frame.forward',
        key:              'arrowright',
        type:             KEY_TYPE.DOWN,
        category:         'video',
        scopeLabel:       'Video Player',
        description:      'Next frame',
        allowWhileTyping: false,
    },
    {
        id:               'video.volume.up',
        key:              'arrowup',
        type:             KEY_TYPE.DOWN,
        category:         'video',
        scopeLabel:       'Video Player',
        description:      'Volume +10%',
        allowWhileTyping: false,
    },
    {
        id:               'video.volume.down',
        key:              'arrowdown',
        type:             KEY_TYPE.DOWN,
        category:         'video',
        scopeLabel:       'Video Player',
        description:      'Volume -10%',
        allowWhileTyping: false,
    },
    {
        id:               'video.loop',
        key:              'l',
        type:             KEY_TYPE.DOWN,
        category:         'video',
        scopeLabel:       'Video Player',
        description:      'Toggle loop',
        allowWhileTyping: false,
    },
    {
        id:               'video.frame.first',
        key:              '0',
        type:             KEY_TYPE.DOWN,
        category:         'video',
        scopeLabel:       'Video Player',
        description:      'Jump to first frame',
        allowWhileTyping: false,
    },
    {
        id:               'video.frame.last',
        key:              '1',
        type:             KEY_TYPE.DOWN,
        category:         'video',
        scopeLabel:       'Video Player',
        description:      'Jump to last frame',
        allowWhileTyping: false,
    },
    {
        id:               'video.trim.in',
        key:              'i',
        type:             KEY_TYPE.DOWN,
        category:         'video',
        scopeLabel:       'Video Player',
        description:      'Set trim in to playhead',
        allowWhileTyping: false,
    },
    {
        id:               'video.trim.out',
        key:              'o',
        type:             KEY_TYPE.DOWN,
        category:         'video',
        scopeLabel:       'Video Player',
        description:      'Set trim out to playhead',
        allowWhileTyping: false,
    },
    {
        id:               'video.trim.clear',
        key:              'x',
        type:             KEY_TYPE.DOWN,
        category:         'video',
        scopeLabel:       'Video Player',
        description:      'Reset trim range',
        allowWhileTyping: false,
    },

    // ── Compare Overlay ───────────────────────────────────────────────────────
    {
        id:               'compare.playPause',
        key:              'space',
        type:             KEY_TYPE.DOWN,
        category:         'compare',
        scopeLabel:       'Compare',
        description:      'Play / pause both videos',
        allowWhileTyping: false,
    },
    {
        id:               'compare.frame.back',
        key:              'arrowleft',
        type:             KEY_TYPE.DOWN,
        category:         'compare',
        scopeLabel:       'Compare',
        description:      'Previous frame (no loop)',
        allowWhileTyping: false,
    },
    {
        id:               'compare.frame.forward',
        key:              'arrowright',
        type:             KEY_TYPE.DOWN,
        category:         'compare',
        scopeLabel:       'Compare',
        description:      'Next frame (no loop)',
        allowWhileTyping: false,
    },
    {
        id:               'compare.loop',
        key:              'l',
        type:             KEY_TYPE.DOWN,
        category:         'compare',
        scopeLabel:       'Compare',
        description:      'Toggle loop',
        allowWhileTyping: false,
    },

    // ── System / Built-ins ────────────────────────────────────────────────────
    {
        id:               'system.fullscreen',
        key:              'f11',
        type:             KEY_TYPE.DOWN,
        category:         'system',
        scopeLabel:       'System',
        description:      'Toggle fullscreen',
        allowWhileTyping: true,
    },
    // UI size (global webFrame zoom) — keyboard equivalents of Ctrl+wheel.
    // Two enlarge keys: numpad/main-row '+' and the shiftless '=' (browser
    // zoom-in convention). Distinct mapKeys from the gallery's bare '+'/'-'.
    {
        id:               'system.uiZoom.in.plus',
        key:              'control++',
        type:             KEY_TYPE.DOWN,
        category:         'system',
        scopeLabel:       'System',
        description:      'Increase UI size',
        allowWhileTyping: true,
    },
    {
        id:               'system.uiZoom.in.equal',
        key:              'control+=',
        type:             KEY_TYPE.DOWN,
        category:         'system',
        scopeLabel:       'System',
        description:      'Increase UI size',
        allowWhileTyping: true,
    },
    {
        id:               'system.uiZoom.out',
        key:              'control+-',
        type:             KEY_TYPE.DOWN,
        category:         'system',
        scopeLabel:       'System',
        description:      'Decrease UI size',
        allowWhileTyping: true,
    },
    {
        id:               'devtools.toggle',
        key:              'control+shift+i',
        type:             KEY_TYPE.DOWN,
        category:         'system',
        scopeLabel:       'System',
        description:      'Toggle DevTools',
        when:             () => APP_CONFIG.dev_mode,
        allowWhileTyping: true,
    },
    {
        id:               'system.contextMenu',
        key:              'contextmenu',
        type:             KEY_TYPE.DOWN,
        category:         'system',
        scopeLabel:       'System',
        description:      'Open context menu',
        when:             ({ isTyping }) => !APP_CONFIG.dev_mode && !isTyping,
        allowWhileTyping: false,
    },
    {
        id:               'system.contextMenu.shiftF10',
        key:              'shift+f10',
        type:             KEY_TYPE.DOWN,
        category:         'system',
        scopeLabel:       'System',
        description:      'Open context menu',
        when:             ({ isTyping }) => !APP_CONFIG.dev_mode && !isTyping,
        allowWhileTyping: false,
    },
];

/**
 * @param {string} id
 * @returns {object|undefined}
 */
export const getEntryById = (id) => HOTKEY_REGISTRY.find(e => e.id === id);
