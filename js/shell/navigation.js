/**
 * navigation.js — Routing logic and tool/workspace loading.
 *
 * Navigation model (history-stack based, see router.js):
 *   PAGE_LANDING  → project picker
 *   PAGE_WORKSPACE → all workspace views, differentiated by params.view:
 *     'workspace'       — Main workspace landing / gallery (default on project open)
 *     'imageWorkspace'  — Image workspace / gallery (filtered)
 *     'generator'       — Generator tool
 *     'upscaler'        — Upscaler tool
 *
 * The radial menu context tracks the current view and shows contextual actions.
 * Selecting a radial action calls navigate() which pushes history and loads the view.
 */

import { state } from '../state.js';
import { Events } from '../events.js';
import { APP_CONFIG } from '../../dev_configs/app_config.js';
import { navigate, back, clearHistory, PAGE_LANDING, PAGE_GALLERY, PAGE_GROUP_HISTORY } from '../router.js';
import { initShaderBackground, stopShaderBackground } from '../components/shaderBackground.js';
import { MpiRadialMenu } from '../components/Primitives/MpiRadialMenu/MpiRadialMenu.js';
import { loadProjectGrid } from './projectUI.js';

// ── Module-scoped refs ──────────────────────────────────────────────────────

let _radialInstance   = null;
let _radialMount      = null;   // dedicated persistent container for the radial
let _projectNameInst  = null;
let _toolContainer    = null;
let _appShell         = null;
let _pageLanding      = null;

// ── Radial context definitions ─────────────────────────────────────────────
//
// gallery      — shown in the main gallery; items set the active PromptBox operation
// group-history — shown inside an item group's history view

const RADIAL_CONTEXTS = {
    gallery: [
        { action: 't2i', label: 'Text to Image',  icon: 'image' },
        { action: 'i2i', label: 'Image to Image', icon: 'image' },
        { action: 't2v', label: 'Text to Video',  icon: 'video' },
        { action: 'i2v', label: 'Image to Video', icon: 'video' },
    ],
    'group-history': [
        { action: 'upscale', label: 'Upscale',  icon: 'upscaler' },
        { action: 'detail',  label: 'Detail',   icon: 'generate' },
        { action: 'edit',    label: 'Edit',      icon: 'generate' },
        { action: 'extend',  label: 'Extend',    icon: 'video' },
    ],
};

// ── Public init ─────────────────────────────────────────────────────────────

/**
 * Initializes navigation refs and hooks into the router.
 * @param {Object} refs - DOM references from shell.js
 */
export function initNavigation(refs) {
    _toolContainer   = refs.toolContainer;
    _radialMount     = refs.radialMount;
    _appShell        = refs.appShell;
    _pageLanding     = refs.pageLanding;
    _projectNameInst = refs.projectNameInstance;

    // Up-arrow — navigates up one level (not back in history stack)
    // group-history → gallery, gallery → landing
    _projectNameInst.on('up', () => {
        if (state.currentPage === PAGE_GROUP_HISTORY) {
            navigate(PAGE_GALLERY);
        } else {
            navigate(PAGE_LANDING);
        }
    });

    // Gallery breadcrumb — always goes to main gallery
    _projectNameInst.on('gallery', () => navigate(PAGE_GALLERY));
}

// ── Core router handler ─────────────────────────────────────────────────────

/**
 * Core navigation router — called by shell.js on every route change.
 * @param {string} page
 * @param {Object} [params]
 */
export function handleNavigation(page, params = {}) {
    if (page === PAGE_LANDING) {
        clearHistory();
        state.activeSubPage = null;
        // Tear down radial so the next project entry re-mounts fresh,
        // correctly re-evaluating tutorialSeen for the new project.
        if (_radialInstance) {
            _radialMount.innerHTML = '';
            _radialInstance = null;
        }
        _showLanding();
        loadProjectGrid();
        updateTitlebarProject();
        initShaderBackground();
        return;
    }

    if (page === PAGE_GALLERY) {
        _showShell();
        updateTitlebarProject();
        stopShaderBackground();
        _loadView(PAGE_GALLERY, params);
        return;
    }

    if (page === PAGE_GROUP_HISTORY) {
        _showShell();
        updateTitlebarProject();
        stopShaderBackground();
        _loadView(PAGE_GROUP_HISTORY, params);
    }
}

/**
 * Forces a titlebar sync with current state.
 */
export function updateTitlebarProject() {
    if (!_projectNameInst) return;
    _projectNameInst.el.setProjectName(state.currentProject?.name || '');
}

// ── View loader ─────────────────────────────────────────────────────────────

/**
 * Loads the correct workspace into _toolContainer and syncs the radial + breadcrumb.
 * @param {string} page   - PAGE_GALLERY | PAGE_GROUP_HISTORY
 * @param {Object} params - Route params (e.g. { groupId } for group-history)
 */
async function _loadView(page, params = {}) {
    // ── Breadcrumb ──────────────────────────────────────────────────────────
    if (page === PAGE_GALLERY) {
        // At gallery root: show project name only, no second segment
        _projectNameInst.el.setGalleryLabel('');
        _projectNameInst.el.setGroupLabel('');
    } else if (page === PAGE_GROUP_HISTORY) {
        // Inside a group: show "Gallery" as up-link + group name
        const group = state.currentProject?.itemGroups?.find(g => g.id === params.groupId);
        _projectNameInst.el.setGalleryLabel('Gallery');
        _projectNameInst.el.setGroupLabel(group?.name || 'Group');
    }

    // ── Radial menu ─────────────────────────────────────────────────────────
    _syncRadial(page);

    // ── Page content ────────────────────────────────────────────────────────
    _toolContainer.innerHTML = '';
    _toolContainer.style.position = 'relative';

    if (params.view === 'components') {
        return _loadComponentsGallery();
    }

    try {
        const mod = await _importView(page);
        if (mod?.mount) mod.mount(_toolContainer, params);
    } catch (err) {
        console.error(`[navigation] Failed to load view "${page}":`, err);
    }
}

/**
 * Syncs the radial menu to the current page context.
 * Creates the radial on first call; switches context on subsequent calls.
 * Radial actions in gallery/group-history set the PromptBox operation via
 * the 'workspace:set-operation' event — they do NOT trigger navigation.
 * @param {string} page - PAGE_GALLERY | PAGE_GROUP_HISTORY
 */
function _syncRadial(page) {
    const extraItems = APP_CONFIG.dev_mode
        ? [{ action: 'components', label: 'Components', icon: 'grid' }]
        : [];

    if (!_radialInstance) {
        _radialInstance = MpiRadialMenu.mount(_radialMount, {
            context: page,
            extraItems,
        });

        Object.entries(RADIAL_CONTEXTS).forEach(([ctx, items]) => {
            _radialInstance.el.setContextItems(ctx, items);
        });

        if (!state.currentProject?.tutorialSeen) {
            _radialInstance.el.show();
        }

        _radialInstance.on('select', ({ action }) => {
            if (action === 'components') {
                _loadComponentsGallery();
                return;
            }
            // Radial actions are operation keys — broadcast to PromptBox
            Events.emit('workspace:set-operation', { operation: action });
        });
    } else {
        Object.entries(RADIAL_CONTEXTS).forEach(([ctx, items]) => {
            _radialInstance.el.setContextItems(ctx, items);
        });
        _radialInstance.el.setContext(page);
        _radialInstance.el.setExtraItems(extraItems);
    }
}

// ── Lazy view imports ───────────────────────────────────────────────────────

/**
 * Lazy-imports a view module by name.
 * Each tool/page exports a `mount(container)` function.
 * @param {string} view
 * @returns {Promise<{mount: function}>}
 */
async function _importView(view) {
    switch (view) {
        case PAGE_GALLERY:
            return import('../workspaces/gallery/gallery.js');
        case PAGE_GROUP_HISTORY:
            return import('../workspaces/groupHistory/groupHistory.js');
        default:
            console.warn(`[navigation] Unknown view: "${view}"`);
            return null;
    }
}

async function _loadComponentsGallery() {
    const { ensureTemplate } = await import('../managers/templateManager.js');
    const { initComponentsPage } = await import('../pages/components.js');

    _toolContainer.innerHTML = '';
    _toolContainer.style.position = '';

    await ensureTemplate('tpl-components');
    const tpl = document.getElementById('tpl-components');
    _toolContainer.appendChild(tpl.content.cloneNode(true));

    await initComponentsPage();
}

// ── Page visibility ─────────────────────────────────────────────────────────

function _showLanding() {
    _pageLanding?.classList.remove('hide');
    _appShell?.classList.add('hide');
}

function _showShell() {
    _pageLanding?.classList.add('hide');
    _appShell?.classList.remove('hide');
}
