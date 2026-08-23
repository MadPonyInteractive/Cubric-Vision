/**
 * navigation.js — Routing logic and workspace loading.
 *
 * Navigation model (history-stack based, see router.js):
 *   PAGE_LANDING      → project picker
 *   PAGE_GALLERY      → main gallery (grid of ItemGroups); default on project open
 *   PAGE_GROUP_HISTORY → history view for a single ItemGroup (params: { groupId })
 *
 * Tab is the workspace flipper (MPI-378, widened to three states in MPI-589,
 * re-ordered in MPI-611): gallery → last card → the open Flow → gallery. The
 * remembered card lives in project.json (`lastGroupId`) so it survives a restart;
 * the flow leg is the flow you are IN, parked rather than closed, and falls back to
 * the Flow Library when nothing is open. The workspace radial is GONE — it
 * survives only as the dev-gated Ctrl+Tab menu; Models is reached from the prompt
 * box's model button.
 */

import { state } from '../state.js';
import { Events } from '../events.js';
import { refreshProject as refreshProjectStats, refreshGroup as refreshGroupStats } from '../services/projectStatsService.js';
import { APP_CONFIG } from '../../dev_configs/app_config.js';
import { gid, qs } from '../utils/dom.js';
import { navigate, back, clearHistory, PAGE_LANDING, PAGE_GALLERY, PAGE_GROUP_HISTORY } from '../router.js';
import { MpiRadialMenu } from '../components/Primitives/MpiRadialMenu/MpiRadialMenu.js';
import { Hotkeys } from '../managers/hotkeyManager.js';
import { resolveFlipTarget } from '../data/projectModel.js';
import { updateProject } from '../services/projectService.js';
import { loadProjectGrid } from './projectUI.js';
import { Overlays } from '../managers/overlayManager.js';
import { clientLogger } from '../services/clientLogger.js';
import { remoteEngineClient } from '../services/remoteEngineClient.js';
import { getEngine } from '../services/comfyController.js';

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

    // MPI-589: the quick route to Flows, now that the library is no longer dev-gated.
    // The bar emits; opening is the shell's business, and `flows:open` already carries
    // the no-engine guard.
    _projectNameInst.on('flows', () => Events.emit('flows:open'));
}

// ── Tab flipper (MPI-378) ───────────────────────────────────────────────────

// Bound while a workspace is on screen, unbound on the landing page. This is
// not just tidiness: hotkeyManager suppresses native Tab traversal as soon as
// ANY handler exists for it, so an app-lifetime binding would kill tabbing
// through the landing page's project form — which has real text inputs.
let _unbindFlip = null;

/**
 * The Tab ring: gallery → last card → the open Flow → gallery.
 * A project with no cards simply skips that leg, and with no Flow open the third
 * stop falls back to the Flow Library — so the ring never dead-ends.
 */
function _flipWorkspace() {
    // MPI-611 — the third stop is the FLOW YOU ARE IN, not the library that lists
    // them. Tab parks the flow (hidden, NOT destroyed — `flow:suspend`), visits the
    // gallery and the card, and the third Tab drops you back into it mid-step, with
    // the inputs and any in-flight run untouched. Flows are OVERLAYS rather than
    // pages, so their legs are "what is on screen?", not a `state.currentPage` value.
    if (qs('.mpi-base-flow')) {
        Events.emit('flow:suspend');
        // Hiding the overlay already restored the gallery underneath — re-navigating
        // to the page we are on would tear that down and rebuild it for nothing.
        if (state.currentPage !== PAGE_GALLERY) navigate(PAGE_GALLERY);
        return;
    }
    // The Library is not a stop on the ring (MPI-589 made it one; MPI-611 gave the
    // slot to the flow itself). Tab leaves it the way it came in.
    if (qs('.mpi-overlay--body .mpi-flow-library')) {
        Events.emit('ui:close-flows');
        if (state.currentPage !== PAGE_GALLERY) navigate(PAGE_GALLERY);
        return;
    }
    if (state.currentPage === PAGE_GALLERY) {
        const groupId = resolveFlipTarget(state.currentProject);
        if (groupId) {
            navigate(PAGE_GROUP_HISTORY, { groupId });
            return;
        }
        // No card to show — fall through so the ring is still gallery ↔ third stop.
    }
    // On a card (or a gallery with no card): back into the parked flow. The emit is
    // a no-op when nothing is parked, and the shell shows synchronously, so the DOM
    // is the answer to "did that work?" — no second flag to keep in sync.
    Events.emit('flow:restore');
    if (qs('.mpi-base-flow')) return;
    Events.emit('flows:open');
}

/**
 * Records the card the flipper returns to. Called from the ONE choke point that
 * every card-entry path goes through (this router mounting MpiGroupHistoryBlock),
 * so restore-on-boot and any future entry path are covered without new hooks.
 * @param {string} groupId
 */
function _rememberGroup(groupId) {
    if (!state.currentProject || state.currentProject.lastGroupId === groupId) return;
    updateProject({ lastGroupId: groupId }).catch(err =>
        clientLogger.warn('navigation', `Could not remember the last card: ${err.message}`));
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
 * Loads the correct workspace into _toolContainer and syncs the breadcrumb.
 * @param {string} page   - PAGE_GALLERY | PAGE_GROUP_HISTORY
 * @param {Object} params - Route params (e.g. { groupId } for group-history)
 */
async function _loadView(page, params = {}, navToken = _navSeq) {
    // ── Dev radial (Ctrl+Tab, dev builds only) ──────────────────────────────
    _syncRadial();

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
        // Same reason the breadcrumb waits: only remember a card that actually opened.
        if (page === PAGE_GROUP_HISTORY && params.groupId) _rememberGroup(params.groupId);
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
    // MPI-501: a restart terminates ComfyUI — on a running queue that destroys the
    // in-flight prompt with no error anywhere. Same guard as the generation gate, but
    // a short wait: this is an explicit human action, so refuse fast and let them
    // decide (Stop it, or wait) rather than leave the radial hanging for minutes.
    // `unreachableMeansIdle` is opted into HERE and nowhere else: this is the one caller
    // where a human has explicitly asked to repair the engine, so an unreadable queue must
    // not lock them out of fixing a wedged ComfyUI. Every app-initiated restart takes the
    // default (refuse), because there nobody asked and the cost is someone's finished work.
    if (!await getEngine(!remote).waitForIdleQueue({ timeoutMs: 30000, unreachableMeansIdle: true })) {
        // A refusal is the guard WORKING, not a failure. This was `ui:error`, which is the
        // shell's crash dialog (`showError`) — so a by-design refusal rendered with an
        // "Error Summary" box and a REPORT ON GITHUB button, inviting a bug report for
        // correct behaviour. `ui:warning` is the toast channel (StatusBar.notify, 6s).
        // Wording: no "then restart" either. They just clicked Restart Engine, so it read
        // as an instruction to redo what they had done; and outside this dev-only radial
        // (`APP_CONFIG.dev_mode`) nobody restarts ComfyUI by hand at all.
        Events.emit('ui:warning', {
            message: 'Restart cancelled — a generation is still running on the engine. Stop it, or wait for it to finish.',
        });
        return;
    }
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
 * Mounts the dev radial on first entry into a workspace.
 *
 * MPI-378 removed the workspace ring entirely — Tab is the flipper, and Models
 * is reached from the prompt box's model button (which still emits
 * 'ui:open-model-picker'). What's left is the dev-only Ctrl+Tab menu (MPI-338),
 * so in production nothing mounts at all.
 */
function _syncRadial() {
    if (!APP_CONFIG.dev_mode || _radialInstance) return;

    _radialInstance = MpiRadialMenu.mount(_radialMount, { context: 'dev' });
    _radialInstance.el.setContextItems('dev', [
        { action: 'components', label: 'Components', icon: 'grid' },
        { action: 'flows', label: 'Flows', icon: 'layers' },                     // Flow Library (MPI-256)
        { action: 'restart-engine', label: 'Restart Engine', icon: 'refresh' },  // restart ComfyUI only
    ]);

    _radialInstance.on('select', ({ action }) => {
        if (action === 'components') {
            _loadComponentsGallery();
            return;
        }
        if (action === 'flows') {
            Events.emit('flows:open'); // Flow Library overlay (MPI-256, dev-gated)
            return;
        }
        if (action === 'restart-engine') {
            _restartEngine();
            return;
        }
    });
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
    _unbindFlip?.();
    _unbindFlip = null;
}

function _showShell() {
    _pageLanding?.classList.add('hide');
    _appShell?.classList.remove('hide');
    if (!_unbindFlip) _unbindFlip = Hotkeys.bind('workspace.flip', _flipWorkspace);
}
