/**
 * mediaActions.js — Action Registry for Media Context Menus
 *
 * RULES FOR AGENTS:
 * - This file is the REQUIRED single source of truth for all medial actions.
 * - Actions determine their own visibility based on validContexts and supportedTypes.
 * - 'execute' functions must handle their own global state updates and routing.
 */

import { state } from './state.js';
import { navigate } from './router.js';
import { saveResultToLibrary } from './toolUtils.js';

// Reusable SVG icons
const ICONS = {
    edit: `<svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor"><path d="M3 17.25V21h3.75L17.81 9.94l-3.75-3.75L3 17.25zM20.71 7.04a.996.996 0 0 0 0-1.41l-2.34-2.34a.996.996 0 0 0-1.41 0l-1.83 1.83 3.75 3.75 1.83-1.83z"/></svg>`,
    detail: `<svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor"><path d="M16 11c1.66 0 2.99-1.34 2.99-3S17.66 5 16 5c-1.66 0-3 1.34-3 3s1.34 3 3 3zm-8 0c1.66 0 2.99-1.34 2.99-3S9.66 5 8 5C6.34 5 5 6.34 5 8s1.34 3 3 3zm0 2c-2.33 0-7 1.17-7 3.5V19h14v-2.5c0-2.33-4.67-3.5-7-3.5z"/></svg>`,
    resize: `<svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor"><path d="M21 11V3h-8l3.29 3.29-10 10L3 13v8h8l-3.29-3.29 10-10z"/></svg>`,
    upscale: `<svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor"><path d="M12 2l-5.5 9h11L12 2zm0 3.84L13.93 9h-3.87L12 5.84zM4 14v2h16v-2H4zm0 4v2h16v-2H4z"/></svg>`,
    animate: `<svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor"><path d="M17 10.5V7a1 1 0 0 0-1-1H4a1 1 0 0 0-1 1v10a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1v-3.5l4 4v-11l-4 4z"/></svg>`,
    copy: `<svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor"><path d="M16 1H4c-1.1 0-2 .9-2 2v14h2V3h12V1zm3 4H8c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h11c1.1 0 2-.9 2-2V7c0-1.1-.9-2-2-2zm0 16H8V7h11v14z"/></svg>`,
    save: `<svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor"><path d="M17 3H5c-1.11 0-2 .9-2 2v14c0 1.1.89 2 2 2h14c1.1 0 2-.9 2-2V7l-4-4zm-5 16c-1.66 0-3-1.34-3-3s1.34-3 3-3 3 1.34 3 3-1.34 3-3 3zm3-10H5V5h10v4z"/></svg>`,
    download: `<svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor"><path d="M19 9h-4V3H9v6H5l7 7 7-7zM5 18v2h14v-2H5z"/></svg>`,
    clear: `<svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor"><path d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z"/></svg>`,
    delete: `<svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor"><path d="M6 19c0 1.1.9 2 2 2h8c1.1 0 2-.9 2-2V7H6v12zM19 4h-3.5l-1-1h-5l-1 1H5v2h14V4z"/></svg>`,
    inspect: `<svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor"><path d="M9.4 16.6L4.8 12l4.6-4.6L8 6l-6 6 6 6 1.4-1.4zm5.2 0l4.6-4.6-4.6-4.6L16 6l6 6-6 6-1.4-1.4z"/></svg>`
};

/**
 * Common Contexts:
 * - 'history': Opened from a tool's transient generation history (e.g. Generator)
 * - 'library': Opened from the permanent Media Library panel
 * - 'input': Opened from a tool's source media container (e.g. Upscaler input)
 */

export const MEDIA_ACTIONS = [
    {
        id: 'edit',
        label: 'Edit',
        supportedTypes: ['image'],
        validContexts: ['history', 'library', 'input'],
        icon: ICONS.edit,
        execute: (mediaUrl) => {
            state.pendingImageUrl = mediaUrl;
            navigate('tool', { name: 'editor' });
        }
    },
    {
        id: 'detail',
        label: 'Detail',
        supportedTypes: ['image'],
        validContexts: ['history', 'library', 'input'],
        icon: ICONS.detail,
        execute: (mediaUrl) => {
            state.pendingImageUrl = mediaUrl;
            navigate('tool', { name: 'detailer' });
        }
    },
    {
        id: 'resize',
        label: 'Resize',
        supportedTypes: ['image'],
        validContexts: ['history', 'library', 'input'],
        icon: ICONS.resize,
        execute: (mediaUrl) => {
            state.pendingImageUrl = mediaUrl;
            navigate('tool', { name: 'resizer' });
        }
    },
    {
        id: 'upscale',
        label: 'Upscale',
        supportedTypes: ['image'],
        validContexts: ['history', 'library', 'input'],
        icon: ICONS.upscale,
        execute: (mediaUrl) => {
            state.pendingImageUrl = mediaUrl;
            navigate('tool', { name: 'upscaler' });
        }
    },
    {
        id: 'animate',
        label: 'Animate',
        supportedTypes: ['image'],
        validContexts: ['history', 'library', 'input'],
        icon: ICONS.animate,
        execute: (mediaUrl) => {
            state.pendingImageUrl = mediaUrl;
            navigate('tool', { name: 'video' });
        }
    },
    {
        id: 'separator1', // Special UI item
        isSeparator: true
    },

    {
        id: 'copy',
        label: 'Copy',
        supportedTypes: ['image'], // Video/Audio copy clipboard support varies wildly
        validContexts: ['history', 'library', 'input'],
        icon: ICONS.copy,
        execute: async (mediaUrl) => {
            try {
                const res = await fetch(mediaUrl);
                const blob = await res.blob();
                await navigator.clipboard.write([new ClipboardItem({ [blob.type]: blob })]);
                window.MpiAlert('Image copied to clipboard!'); // Using non-blocking feedback ideal
            } catch (e) {
                console.error('Copy failed', e);
                navigator.clipboard.writeText(mediaUrl);
                window.MpiAlert('URL copied to clipboard (Direct copy failed)');
            }
        }
    },
    {
        id: 'save',
        label: 'Save',
        supportedTypes: ['image', 'video', 'audio'],
        validContexts: ['history', 'input'], // Library is already saved
        icon: ICONS.save,
        execute: async (mediaUrl, filename, callbacks) => {
            try {
                await saveResultToLibrary(mediaUrl, 'saved');
                window.MpiAlert('Media saved to Project Library successfully.');
                if (callbacks?.onSaved) callbacks.onSaved();
            } catch (e) {
                console.error("Save failed:", e);
                window.MpiAlert('Failed to save media: ' + e.message);
            }
        }
    },
    {
        id: 'download',
        label: 'Download',
        supportedTypes: ['image', 'video', 'audio'],
        validContexts: ['history', 'library', 'input'],
        icon: ICONS.download,
        execute: (mediaUrl, filename) => {
            const a = document.createElement('a');
            a.href = mediaUrl;
            a.download = filename || `download_${Date.now()}`;
            a.click();
        }
    },
    {
        id: 'delete',
        label: 'Delete',
        supportedTypes: ['image', 'video', 'audio'],
        validContexts: ['history', 'library', 'input'], // We don't delete from disk if just 'clearing' an input
        icon: ICONS.delete,
        execute: async (mediaUrl, filename, callbacks) => {
            if (!filename || !state.currentProject?.folderPath) {
                window.MpiAlert('Cannot delete: missing filename or active project state.');
                return;
            }

            //const confirmMsg = `Are you sure you want to delete ${filename}?`;
            const confirmMsg = `Are you sure you want to delete this media file?`;
            const performDelete = await window.MpiConfirm(confirmMsg);
            if (!performDelete) return;

            try {
                // Move to trash / delete on server
                await fetch(`/project-media/${state.currentProject.id}/${encodeURIComponent(filename)}?folderPath=${encodeURIComponent(state.currentProject.folderPath)}`, {
                    method: 'DELETE'
                });

                // Fire a global event or callback so history lists can refresh
                document.dispatchEvent(new CustomEvent('media:deleted', { detail: { filename } }));
                if (callbacks?.onDeleted) callbacks.onDeleted(filename);
            } catch (e) {
                console.error('Failed to trash file from menu:', e);
                window.MpiAlert('Failed to delete media: ' + e.message);
            }
        }
    }
];
