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
import { APP_CONFIG } from '../../dev_configs/app_config.js';
import { navigate, back, clearHistory, PAGE_LANDING, PAGE_WORKSPACE } from '../router.js';
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

// ── Radial context definitions (new UX) ────────────────────────────────────
//
// Each view declares which radial actions are available.
// 'root' action = go back to main gallery.

const RADIAL_CONTEXTS = {
    workspace: [
        { action: 'imageWorkspace', label: 'Image',  icon: 'image' },
        { action: 'videoWorkspace', label: 'Video',  icon: 'video' },
        { action: 'audioWorkspace', label: 'Audio',  icon: 'audio' },
    ],
    imageWorkspace: [
        { action: 'generator',      label: 'Generate',  icon: 'generate' },
        { action: 'upscaler',       label: 'Upscale',   icon: 'upscaler' },
        { action: 'workspace',      label: '← Gallery', icon: 'back' },
    ],
    generator: [
        { action: 'upscaler',       label: 'Upscaler',  icon: 'upscaler' },
        { action: 'imageWorkspace', label: '← Gallery', icon: 'back' },
    ],
    upscaler: [
        { action: 'generator',      label: 'Generator', icon: 'generate' },
        { action: 'imageWorkspace', label: '← Gallery', icon: 'back' },
    ],
    videoWorkspace: [
        { action: 'workspace',      label: '← Gallery', icon: 'back' },
    ],
    audioWorkspace: [
        { action: 'workspace',      label: '← Gallery', icon: 'back' },
    ],
};

// Human-readable labels for each view (used in breadcrumb)
const VIEW_WORKSPACE_LABEL = {
    workspace:      'Main Gallery',
    imageWorkspace: 'Image',
    videoWorkspace: 'Video',
    audioWorkspace: 'Audio',
};

const VIEW_TOOL_LABEL = {
    generator: 'Generator',
    upscaler:  'Upscaler',
};

// Maps each tool view to its parent workspace view (for breadcrumb)
const VIEW_TOOL_PARENT = {
    generator: 'imageWorkspace',
    upscaler:  'imageWorkspace',
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

    // Back arrow — navigates up the breadcrumb hierarchy rather than the history stack
    _projectNameInst.on('back', () => {
        const view = state.currentParams?.view;
        if (!view) { back(); return; }

        // Tool → parent workspace
        if (VIEW_TOOL_PARENT[view]) {
            navigate(PAGE_WORKSPACE, { view: VIEW_TOOL_PARENT[view] });
            return;
        }
        // Workspace (non-root) → main gallery
        if (view !== 'workspace') {
            navigate(PAGE_WORKSPACE, { view: 'workspace' });
            return;
        }
        // Main gallery → landing (project picker)
        navigate(PAGE_LANDING);
    });

    // Root breadcrumb ("MAIN GALLERY") — always goes to workspace root
    _projectNameInst.on('root', () => {
        navigate(PAGE_WORKSPACE, { view: 'workspace' });
    });

    // Workspace breadcrumb (e.g. "IMAGE") — navigates to the parent workspace of the current tool
    _projectNameInst.on('workspace', () => {
        const view = state.currentParams?.view;
        if (VIEW_TOOL_LABEL[view]) {
            const parentView = VIEW_TOOL_PARENT[view] || 'imageWorkspace';
            navigate(PAGE_WORKSPACE, { view: parentView });
        }
    });
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

    if (page === PAGE_WORKSPACE) {
        _showShell();
        updateTitlebarProject();
        stopShaderBackground();
        _loadView(params.view || 'workspace');
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
 * Loads the correct page/tool into _toolContainer and syncs the radial + breadcrumb.
 * @param {string} view - e.g. 'gallery' | 'imageWorkspace' | 'generator'
 */
async function _loadView(view) {
    // ── Breadcrumb ──────────────────────────────────────────────────────────
    const isRoot      = view === 'workspace';
    const isTool      = !!VIEW_TOOL_LABEL[view];
    const toolLabel   = VIEW_TOOL_LABEL[view] || '';

    // Root segment: hidden when already at workspace root
    _projectNameInst.el.setRootLabel(isRoot ? '' : 'Main Gallery');

    // Workspace segment: the parent workspace when on a tool, the view label otherwise
    if (isTool) {
        // Each tool declares its parent workspace via VIEW_TOOL_PARENT
        const parentView = VIEW_TOOL_PARENT[view] || 'imageWorkspace';
        _projectNameInst.el.setWorkspaceLabel(VIEW_WORKSPACE_LABEL[parentView] || '');
    } else {
        // On a workspace page — show its own label, hidden at root
        _projectNameInst.el.setWorkspaceLabel(isRoot ? '' : (VIEW_WORKSPACE_LABEL[view] || ''));
    }

    _projectNameInst.el.setToolLabel(toolLabel);

    // ── Radial menu ─────────────────────────────────────────────────────────
    _syncRadial(view);

    // ── Page content ────────────────────────────────────────────────────────
    _toolContainer.innerHTML = '';
    _toolContainer.style.position = 'relative';

    if (view === 'components') {
        return _loadComponentsGallery();
    }

    // Lazy-load the tool/page module
    try {
        const mod = await _importView(view);
        if (mod?.mount) mod.mount(_toolContainer);
    } catch (err) {
        console.error(`[navigation] Failed to load view "${view}":`, err);
    }
}

/**
 * Syncs the radial menu to the current view context.
 * Creates the radial on first call, injects context items and switches context on subsequent calls.
 * @param {string} view
 */
function _syncRadial(view) {
    const extraItems = APP_CONFIG.dev_mode
        ? [{ action: 'components', label: 'Components', icon: 'grid' }]
        : [];

    if (!_radialInstance) {
        _radialInstance = MpiRadialMenu.mount(_radialMount, {
            context: view,
            extraItems,
        });

        // Inject all UX-defined context item sets into the radial upfront
        // (must happen before show so _render() has items available)
        Object.entries(RADIAL_CONTEXTS).forEach(([ctx, items]) => {
            _radialInstance.el.setContextItems(ctx, items);
        });

        // Only auto-open on first entry for new projects (tutorial not yet seen)
        if (!state.currentProject?.tutorialSeen) {
            _radialInstance.el.show();
        }

        _radialInstance.on('select', ({ action }) => {
            if (action === 'components') {
                _loadView('components');
                return;
            }
            // All actions are view names — push to history and load
            navigate(PAGE_WORKSPACE, { view: action });
        });
    } else {
        // Inject updated context items (in case they changed) then switch context
        Object.entries(RADIAL_CONTEXTS).forEach(([ctx, items]) => {
            _radialInstance.el.setContextItems(ctx, items);
        });
        _radialInstance.el.setContext(view);
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
        case 'workspace':
            return import('../tools/workspace/workspace.js');
        case 'imageWorkspace':
            return import('../tools/imageWorkspace/imageWorkspace.js');
        case 'generator':
            return import('../tools/generator/generator.js');
        case 'upscaler':
            return import('../tools/upscaler/upscaler.js');
        case 'videoWorkspace':
            return import('../tools/videoWorkspace/videoWorkspace.js');
        case 'audioWorkspace':
            return import('../tools/audioWorkspace/audioWorkspace.js');
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
