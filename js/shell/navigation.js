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
import { refreshProject as refreshProjectStats, refreshGroup as refreshGroupStats } from '../services/projectStatsService.js';
import { APP_CONFIG } from '../../dev_configs/app_config.js';
import { gid } from '../utils/dom.js';
import { navigate, back, clearHistory, PAGE_LANDING, PAGE_GALLERY, PAGE_GROUP_HISTORY } from '../router.js';
import { MpiRadialMenu } from '../components/Primitives/MpiRadialMenu/MpiRadialMenu.js';
import { loadProjectGrid } from './projectUI.js';
import { getAvailableCommands } from '../data/commandRegistry.js';
import { getModelById } from '../data/modelRegistry.js';
import { Overlays } from '../managers/overlayManager.js';
import { clientLogger } from '../services/clientLogger.js';

// ── Module-scoped refs ──────────────────────────────────────────────────────

let _radialInstance   = null;
let _radialMount      = null;   // dedicated persistent container for the radial
let _projectNameInst  = null;
let _toolContainer    = null;
let _appShell         = null;
let _currentPage      = null;
let _currentGroupId   = null;
let _pageLanding      = null;
let _currentBlock     = null;   // track mounted view Block for teardown
let _navSeq           = 0;      // guards async teardown/import ordering
let _radialModelId    = null;   // active model id for radial item generation;
                                // pushed by Blocks via refreshRadial({ modelId })

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
    imageUpscale:'upscaler',
};

/**
 * Builds radial items for the gallery context from the active model + current
 * media context. Only operations that are currently available (inputs met) are
 * included — the radial is an action launcher, not a capability browser.
 * @param {{ imageCount?: number, videoCount?: number }} [ctx]
 * @returns {Array<{action:string, label:string, icon:string}>}
 */
function _buildGalleryItems(ctx = {}) {
    const model = _radialModelId ? getModelById(_radialModelId) : null;
    if (!model) return [];
    const hasMedia = (ctx.imageCount ?? 0) > 0 || (ctx.videoCount ?? 0) > 0;
    return getAvailableCommands(model.mediaType, model, ctx)
        .filter(cmd => {
            if (!cmd.available) return false;
            const isTextOnly = (cmd.requiresImages ?? 0) === 0 && (cmd.requiresVideo ?? 0) === 0;
            return !(hasMedia && isTextOnly);
        })
        .map(cmd => ({ action: cmd.key, label: cmd.label, icon: OP_ICONS[cmd.key] || 'generate' }));
}

// Last items pushed by MpiGroupHistoryBlock — single source of truth, derived
// from the Block's own _opOptions() (same data the PromptBox dropdown uses).
let _groupHistoryItems = [];

/**
 * Maps a PromptBox-shaped op option ({ value, label, disabled }) to a radial
 * item. Keeps only enabled options.
 * @param {Array<{value:string,label:string,disabled?:boolean}>} opts
 * @returns {Array<{action:string,label:string,icon:string}>}
 */
function _mapOpsToRadialItems(opts) {
    return (opts || [])
        .filter(o => !o.disabled)
        .map(o => ({ action: o.value, label: o.label, icon: OP_ICONS[o.value] || 'generate' }));
}

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
export async function handleNavigation(page, params = {}) {
    const navToken = ++_navSeq;

    if (page === PAGE_LANDING) {
        clearHistory();
        Overlays.reset();
        // Tear down radial so the next project entry re-mounts fresh.
        if (_radialInstance) {
            _radialInstance.destroy?.();
            _radialMount.innerHTML = '';
            _radialInstance = null;
        }
        // Tear down mounted view block if it exists
        await _destroyCurrentBlock();
        if (navToken !== _navSeq) return;
        _showLanding();
        loadProjectGrid();
        updateTitlebarProject();
        return;
    }

    if (page === PAGE_GALLERY) {
        _showShell();
        updateTitlebarProject();
        await _loadView(PAGE_GALLERY, params, navToken);
        return;
    }

    if (page === PAGE_GROUP_HISTORY) {
        _showShell();
        updateTitlebarProject();
        await _loadView(PAGE_GROUP_HISTORY, params, navToken);
    }
}

/**
 * Forces a titlebar sync with current state.
 */
export function updateTitlebarProject() {
    if (!_projectNameInst) return;
    _projectNameInst.el.setProjectName(state.currentProject?.name || '');
}

async function _destroyCurrentBlock() {
    if (!_currentBlock) return;

    const block = _currentBlock;
    _currentBlock = null;

    try {
        if (block.el && typeof block.el.destroy === 'function') {
            await block.el.destroy();
            block.el.remove?.();
        } else {
            await block.destroy?.();
        }
    } catch (err) {
        clientLogger.error('navigation', 'destroy() threw for previous block', err);
    }
}

// ── View loader ─────────────────────────────────────────────────────────────

/**
 * Loads the correct workspace into _toolContainer and syncs the radial + breadcrumb.
 * @param {string} page   - PAGE_GALLERY | PAGE_GROUP_HISTORY
 * @param {Object} params - Route params (e.g. { groupId } for group-history)
 */
async function _loadView(page, params = {}, navToken = _navSeq) {
    // ── Radial menu ─────────────────────────────────────────────────────────
    _syncRadial(page);

    // ── Page content ────────────────────────────────────────────────────────
    Overlays.reset();

    // Tear down previously mounted block before clearing DOM.
    await _destroyCurrentBlock();
    if (navToken !== _navSeq) return;
    _toolContainer.innerHTML = '';
    _toolContainer.style.position = 'relative';

    if (params.view === 'components') {
        _updateBreadcrumb(page, params);
        return _loadComponentsGallery();
    }

    try {
        const mod = await _importView(page);
        if (navToken !== _navSeq) return;
        if (mod?.mount) {
            _currentBlock = mod.mount(_toolContainer, params);
        }
        // Only update breadcrumb after successful mount — prevents "cleared
        // breadcrumb + stale view" state when mount throws.
        _updateBreadcrumb(page, params);
    } catch (err) {
        clientLogger.error('navigation', `Failed to load view "${page}"`, err);
    }
}

function _updateBreadcrumb(page, params) {
    _currentPage = page;
    _currentGroupId = params?.groupId || null;
    if (page === PAGE_GALLERY) {
        _projectNameInst.el.setBackLabel('Projects');
        _projectNameInst.el.setGalleryLabel('');
        _projectNameInst.el.setGroupLabel('');
        const ps = state.projectStats || { count: 0, bytes: 0 };
        _projectNameInst.el.setStats({ count: ps.count, bytes: ps.bytes, label: 'ASSETS' });
        refreshProjectStats();
    } else if (page === PAGE_GROUP_HISTORY) {
        const group = state.currentProject?.itemGroups?.find(g => g.id === params.groupId);
        _projectNameInst.el.setBackLabel('Gallery');
        _projectNameInst.el.setGalleryLabel('');
        _projectNameInst.el.setGroupLabel(group?.name || 'Group');
        const hs = state.historyStats || { count: 0, bytes: 0 };
        const initialCount = (hs.groupId === group?.id) ? hs.count : (group?.history?.length || 0);
        const initialBytes = (hs.groupId === group?.id) ? hs.bytes : 0;
        _projectNameInst.el.setStats({ count: initialCount, bytes: initialBytes, label: 'ENTRIES' });
        if (group) refreshGroupStats(group);
    }
}

// React to stats updates pushed by the stats service.
Events.on('state:changed', ({ key, value }) => {
    if (!_projectNameInst) return;
    if (key === 'projectStats' && _currentPage === PAGE_GALLERY) {
        _projectNameInst.el.setStats({ count: value.count, bytes: value.bytes, label: 'ASSETS' });
    } else if (key === 'historyStats' && _currentPage === PAGE_GROUP_HISTORY) {
        if (value.groupId === _currentGroupId) {
            _projectNameInst.el.setStats({ count: value.count, bytes: value.bytes, label: 'ENTRIES' });
        }
    }
});

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
        _radialInstance.el.setContextItems(PAGE_GROUP_HISTORY, _groupHistoryItems);

        _radialInstance.on('select', ({ action }) => {
            if (action === 'components') {
                _loadComponentsGallery();
                return;
            }
            Events.emit('workspace:set-operation', { operation: action });
        });

        // Bridge: radial pre-render hook → workspace event. Active workspace
        // Block can refresh radial items synchronously (e.g. re-evaluate live
        // mask state) so the upcoming render reflects current capabilities.
        _radialInstance.on('will-open', () => {
            Events.emit('radial:will-open', { page: _currentPage });
        });
    } else {
        _radialInstance.el.setContextItems(PAGE_GALLERY, _buildGalleryItems());
        _radialInstance.el.setContextItems(PAGE_GROUP_HISTORY, _groupHistoryItems);
        _radialInstance.el.setContext(page);
        _radialInstance.el.setExtraItems(extraItems);
    }
}

/**
 * Rebuilds the gallery radial items using the current media context.
 * Called by gallery.js when the PromptBox media-change or model-change fires.
 * @param {{ imageCount?: number, videoCount?: number, modelId?: string|null }} [ctx]
 */
export function refreshRadial(ctx = {}) {
    if (Object.prototype.hasOwnProperty.call(ctx, 'modelId')) {
        _radialModelId = ctx.modelId ?? null;
    }
    if (!_radialInstance) return;
    _radialInstance.el.setContextItems(PAGE_GALLERY, _buildGalleryItems(ctx));
}

/**
 * Replaces the group-history radial items. Called by MpiGroupHistoryBlock with
 * the SAME op options it feeds to MpiPromptBox — single source of truth so the
 * radial and PromptBox dropdown can never disagree.
 * @param {Array<{value:string,label:string,disabled?:boolean}>} opOptions
 */
export function refreshGroupHistoryRadial(opOptions) {
    _groupHistoryItems = _mapOpsToRadialItems(opOptions);
    if (!_radialInstance) return;
    _radialInstance.el.setContextItems(PAGE_GROUP_HISTORY, _groupHistoryItems);
}

/** Clears group-history radial items (called by Block on teardown). */
export function clearGroupHistoryRadial() {
    _groupHistoryItems = [];
    if (!_radialInstance) return;
    _radialInstance.el.setContextItems(PAGE_GROUP_HISTORY, []);
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
    const tpl = gid('tpl-components');
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
