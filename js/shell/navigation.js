/**
 * navigation.js — Routing logic and workspace loading.
 *
 * Navigation model (history-stack based, see router.js):
 *   PAGE_LANDING      → project picker
 *   PAGE_GALLERY      → main gallery (grid of ItemGroups); default on project open
 *   PAGE_GROUP_HISTORY → history view for a single ItemGroup (params: { groupId })
 *
 * The radial menu tracks the current page but no longer carries operations
 * (MPI-356) — hold-Tab opens the model picker via 'ui:open-model-picker'.
 */

import { state } from '../state.js';
import { Events } from '../events.js';
import { refreshProject as refreshProjectStats, refreshGroup as refreshGroupStats } from '../services/projectStatsService.js';
import { APP_CONFIG } from '../../dev_configs/app_config.js';
import { gid } from '../utils/dom.js';
import { navigate, back, clearHistory, PAGE_LANDING, PAGE_GALLERY, PAGE_GROUP_HISTORY } from '../router.js';
import { MpiRadialMenu } from '../components/Primitives/MpiRadialMenu/MpiRadialMenu.js';
import { loadProjectGrid } from './projectUI.js';
import { Overlays } from '../managers/overlayManager.js';
import { clientLogger } from '../services/clientLogger.js';
import { remoteEngineClient } from '../services/remoteEngineClient.js';

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

// ── Radial context definitions ─────────────────────────────────────────────

// MPI-356: ops LEFT the ring — they live in the prompt box's op strip, which is
// always visible and doesn't rotate under the user. Both workspace contexts now
// hold the same single item: Models. Apps joins it when the app library un-gates
// (MPI-332); until then the radial short-circuits (see MpiRadialMenu._onTabDown)
// and hold-Tab opens the model picker with no ring drawn.
const RADIAL_ITEMS = [
    { action: 'models', label: 'Models', icon: 'layers' },
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
        _projectNameInst.el.setGroupLabel(group?.customName || group?.name || 'Group');
        const hs = state.historyStats || { count: 0, bytes: 0 };
        const initialCount = (hs.groupId === group?.id) ? hs.count : (group?.history?.length || 0);
        const initialBytes = (hs.groupId === group?.id) ? hs.bytes : 0;
        _projectNameInst.el.setStats({ count: initialCount, bytes: initialBytes, label: 'ENTRIES' });
        if (group) refreshGroupStats(group);
    }
}

// React to stats updates pushed by the stats service.
// eslint-disable-next-line mpi/require-destroy-on-events -- app-lifetime listener
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
 * Dev-gated radial action: restart ONLY the ComfyUI engine (no app reload).
 * Remote → wrapper's /proxy/restart-comfy (restarts the Pod's ComfyUI subprocess).
 * Local → stop + start the local ComfyUI process (start is idempotent, spawns fresh).
 */
// MPI-310 — the MPI-308 `_describeFirstChip` dev harness lived here. It answered the
// question it existed for (the caption is worth having), so the feature shipped as a
// real op: right-click a gallery card or history item → "Describe image". The harness
// is gone rather than kept alongside it — it bypassed both the queue and the plugin
// install gate, so it would have failed deep inside ComfyUI once the weight became
// optional. See js/utils/describeAction.js.

async function _restartEngine() {
    const remote = remoteEngineClient.isRemote();
    Events.emit('ui:info', { message: 'Restarting the engine…' });
    try {
        if (remote) {
            const r = await fetch('/proxy/restart-comfy', { method: 'POST' });
            if (!r.ok) throw new Error(`restart-comfy ${r.status}`);
        } else {
            await fetch('/comfy/stop', { method: 'POST' });
            // Let the process fully exit before starting, else /comfy/start races the
            // still-dying process, hits its already-running early-return, and never
            // spawns a fresh one (engine wedged, gen gate keeps restarting).
            await new Promise(r => setTimeout(r, 2000));
            const r = await fetch('/comfy/start', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ isUserRestart: true }),
            });
            if (!r.ok) throw new Error(`comfy/start ${r.status}`);
        }
    } catch (err) {
        clientLogger.error('navigation', `Restart engine failed: ${err.message}`);
        Events.emit('ui:error', { title: 'Restart failed', message: `Could not restart the engine: ${err.message}` });
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
    // MPI-338: dev actions live on their OWN radial (Ctrl+Tab / 'dev' context),
    // NOT appended to the page radial — Tab shows real operations only, so
    // tutorial capture is clean. Gated on dev_mode: no 'dev' context in production,
    // so Ctrl+Tab is inert there.
    const devItems = APP_CONFIG.dev_mode
        ? [
            { action: 'components', label: 'Components', icon: 'grid' },
            { action: 'apps', label: 'Apps', icon: 'layers' }, // App Library (MPI-256), dev-gated
            { action: 'restart-engine', label: 'Restart Engine', icon: 'refresh' }, // dev-gated: restart ComfyUI only
          ]
        : [];

    if (!_radialInstance) {
        _radialInstance = MpiRadialMenu.mount(_radialMount, {
            context: page,
        });

        _radialInstance.el.setContextItems(PAGE_GALLERY, RADIAL_ITEMS);
        _radialInstance.el.setContextItems(PAGE_GROUP_HISTORY, RADIAL_ITEMS);
        if (devItems.length) _radialInstance.el.setContextItems('dev', devItems);

        _radialInstance.on('select', ({ action }) => {
            if (action === 'models') {
                Events.emit('ui:open-model-picker', {});
                return;
            }
            if (action === 'components') {
                _loadComponentsGallery();
                return;
            }
            if (action === 'apps') {
                Events.emit('apps:open'); // App Library overlay (MPI-256, dev-gated)
                return;
            }
            if (action === 'restart-engine') {
                _restartEngine();
                return;
            }
        });
    } else {
        _radialInstance.el.setContext(page);
    }
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
