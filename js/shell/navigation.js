/**
 * navigation.js — Routing logic and workspace loading.
 *
 * Navigation model (history-stack based, see router.js):
 *   PAGE_LANDING      → project picker
 *   PAGE_GALLERY      → main gallery (grid of ItemGroups); default on project open
 *   PAGE_GROUP_HISTORY → history view for a single ItemGroup (params: { groupId })
 *
 * The radial menu context tracks the current page and emits 'workspace:set-operation'
 * so the active PromptBox can update its selected operation without navigating.
 */

import { state } from '../state.js';
import { Events } from '../events.js';
import { APP_CONFIG } from '../../dev_configs/app_config.js';
import { navigate, back, clearHistory, PAGE_LANDING, PAGE_GALLERY, PAGE_GROUP_HISTORY } from '../router.js';
import { initShaderBackground, stopShaderBackground } from '../components/shaderBackground.js';
import { MpiRadialMenu } from '../components/Primitives/MpiRadialMenu/MpiRadialMenu.js';
import { loadProjectGrid } from './projectUI.js';
import { getAvailableCommands } from '../data/commandRegistry.js';
import { getModelById } from '../data/modelRegistry.js';
import { Overlays } from '../managers/overlayManager.js';

// ── Module-scoped refs ──────────────────────────────────────────────────────

let _radialInstance   = null;
let _radialMount      = null;   // dedicated persistent container for the radial
let _projectNameInst  = null;
let _toolContainer    = null;
let _appShell         = null;
let _pageLanding      = null;

// ── Radial context definitions ─────────────────────────────────────────────

// Icon to use for each operation key in the radial menu
const OP_ICONS = {
    t2i:         'image',
    i2i:         'image',
    upscale:     'upscaler',
    detail:      'detailer',
    edit:        'generate',
    change:      'generate',
    remove:      'generate',
    t2v:         'video',
    i2v:         'video',
    extend:      'video',
    interpolate: 'video',
    videoUpscale:'upscaler',
};

/**
 * Builds radial items for the gallery context from the active model + current
 * media context. Only operations that are currently available (inputs met) are
 * included — the radial is an action launcher, not a capability browser.
 * @param {{ imageCount?: number, videoCount?: number }} [ctx]
 * @returns {Array<{action:string, label:string, icon:string}>}
 */
function _buildGalleryItems(ctx = {}) {
    const model = getModelById(state.s_selectedModelId);
    if (!model) return [];
    return getAvailableCommands(model.mediaType, model, ctx)
        .filter(cmd => cmd.available)
        .map(cmd => ({ action: cmd.key, label: cmd.label, icon: OP_ICONS[cmd.key] || 'generate' }));
}

// group-history items are still static (no dynamic input context yet — that's item 6)
const GROUP_HISTORY_ITEMS = [
    { action: 'upscale', label: 'Upscale', icon: 'upscaler' },
    { action: 'detail',  label: 'Detail',  icon: 'detailer' },
];

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
        Overlays.reset();
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
    Overlays.reset();
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

        _radialInstance.el.setContextItems(PAGE_GALLERY, _buildGalleryItems());
        _radialInstance.el.setContextItems(PAGE_GROUP_HISTORY, GROUP_HISTORY_ITEMS);

        if (!state.currentProject?.tutorialSeen) {
            _radialInstance.el.show();
        }

        _radialInstance.on('select', ({ action }) => {
            if (action === 'components') {
                _loadComponentsGallery();
                return;
            }
            Events.emit('workspace:set-operation', { operation: action });
        });
    } else {
        _radialInstance.el.setContextItems(PAGE_GALLERY, _buildGalleryItems());
        _radialInstance.el.setContextItems(PAGE_GROUP_HISTORY, GROUP_HISTORY_ITEMS);
        _radialInstance.el.setContext(page);
        _radialInstance.el.setExtraItems(extraItems);
    }
}

/**
 * Rebuilds the gallery radial items using the current media context.
 * Called by gallery.js when the PromptBox media-change fires.
 * @param {{ imageCount?: number, videoCount?: number }} [ctx]
 */
export function refreshRadial(ctx = {}) {
    if (!_radialInstance) return;
    _radialInstance.el.setContextItems(PAGE_GALLERY, _buildGalleryItems(ctx));
}

// ── Lazy view imports ───────────────────────────────────────────────────────

/**
 * Lazy-imports a view Block by route name.
 * Returns an object with a `mount(container, params)` method.
 * @param {string} view
 * @returns {Promise<{mount: function}>|null}
 */
async function _importView(view) {
    switch (view) {
        case PAGE_GALLERY: {
            const { MpiGalleryBlock } = await import('../components/Blocks/MpiGalleryBlock/MpiGalleryBlock.js');
            return { mount: (container, params) => MpiGalleryBlock.mount(container, params) };
        }
        case PAGE_GROUP_HISTORY: {
            const { MpiGroupHistoryBlock } = await import('../components/Blocks/MpiGroupHistoryBlock/MpiGroupHistoryBlock.js');
            return { mount: (container, params) => MpiGroupHistoryBlock.mount(container, params) };
        }
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
