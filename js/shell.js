/**
 * shell.js — Controls the landing page, app shell visibility,
 * project cards, sidebar active states, and "coming soon" routing.
 *
 * Called by init.js after the DOM is ready.
 */

// Safe Electron IPC - only active if running inside Electron
let ipcRenderer = null;
try {
  if (typeof window.require === 'function') {
    const electron = window.require('electron');
    ipcRenderer = electron.ipcRenderer;
  }
} catch (e) {
  console.warn('[shell] Not running in Electron or require is not available. System features like window controls will be disabled.');
}

import { state, getToolComfySettings } from './state.js';
import { APP_CONFIG } from '../dev_configs/app_config.js';
import { navigate, onNavigate, PAGE_LANDING, PAGE_TOOL, PAGE_MEDIA, PAGE_SETTINGS, PAGE_ABOUT, PAGE_HELP, PAGE_COMPONENTS } from './router.js';
import { listProjects, createProject, deleteProject, openProject, chooseFolder } from './projectManager.js';
import { refreshModelRegistry, getFirstAvailableModel, getRequiredModelsForTool } from './modelManager.js';
import { refreshComfyWorkflowRegistry, deleteWorkflow, listComfyFiles, getDefaultWorkflowId } from './comfyModelManager.js';
import { unloadModel } from './llmService.js';
import { initShaderBackground, stopShaderBackground } from './components/shaderBackground.js';
import { ComfyUIController } from './comfyController.js';
import { TOOL_REGISTRY, COMFY_TOOLS, LLM_TOOLS, ENGINE_TOOLS, COMING_SOON_TOOLS } from './toolRegistry.js';
import { ensureTemplate, preloadTemplates } from './templateLoader.js';
import {
  initProvisioning,
  showEngineProvisioningScreen,
  showProvisioningScreen,
  showAdvancedSettingsScreen,
  closeActiveSubPage,
} from './provisioning.js';
// Re-export so existing importers (tools, init.js) don't need updating
export { showProvisioningScreen, showAdvancedSettingsScreen, closeActiveSubPage };

// ── DOM refs ──────────────────────────────────────────────────────────────────
const pageLanding = document.getElementById('page-landing');
const appShell = document.getElementById('app-shell');
const toolContainer = document.getElementById('tool-container');
const titlebarProjectName = document.getElementById('titlebar-project-name');
const projectGrid = document.getElementById('projectGrid');
const sidebar = document.getElementById('sidebar');

// Memory Monitoring Refs
const vramBarFill = document.getElementById('vramBarFill');
const ramBarFill = document.getElementById('ramBarFill');
const vramValue = document.getElementById('vramValue');
const ramValue = document.getElementById('ramValue');

// Landing
const newProjectBtn = document.getElementById('newProjectBtn');

// Modal – New Project
const newProjectModal = document.getElementById('newProjectModal');
const closeNewProjectModal = document.getElementById('closeNewProjectModal');
const cancelNewProjectBtn = document.getElementById('cancelNewProjectBtn');
const confirmNewProjectBtn = document.getElementById('confirmNewProjectBtn');
const newProjectName = document.getElementById('newProjectName');
const newProjectFolder = document.getElementById('newProjectFolder');
const chooseFolderBtn = document.getElementById('chooseFolderBtn');

// Removed old Modal – Confirm Delete

// Sidebar buttons
const sidebarNav = document.getElementById('sidebarNav');
const sidebarMediaBtn = document.getElementById('sidebarMediaBtn');
const sidebarProjectsBtn = document.getElementById('sidebarProjectsBtn');
const sidebarSettingsBtn = document.getElementById('sidebarSettingsBtn');
const sidebarHelpBtn = document.getElementById('sidebarHelpBtn');
const sidebarAboutBtn = document.getElementById('sidebarAboutBtn');
const sidebarComponentsBtn = document.getElementById('sidebarComponentsBtn');

// ── Tool templates map ────────────────────────────────────────────────────────
// COMING_SOON_TOOLS is now derived from toolRegistry.js.
// To add a stub tool, add an entry with type: 'soon' in js/toolRegistry.js.

const COMING_SOON_LABELS = Object.fromEntries(
  Object.entries(TOOL_REGISTRY)
    .filter(([, t]) => t.type === 'soon' || t.label)
    .map(([name, t]) => [name, { label: t.label || name, icon: t.icon || '🔧' }])
);

// ── State for delete confirmation ─────────────────────────────────────────────
let _pendingDeletePath = null;

const globalUnloadBtn = document.getElementById('globalUnloadBtn');
const unloadStatusPopup = document.getElementById('unload-status-popup');
const sidebarToggle = document.getElementById('sidebar-toggle');
const sidebarTooltip = document.getElementById('sidebar-tooltip');

// ── Init ──────────────────────────────────────────────────────────────────────
export async function initShell() {
  // 1. Preload Component Styles to avoid FOUC
  preloadComponentStyles([
    // Primitives
    'js/components/Primitives/MpiButton/MpiButton.css',
    'js/components/Primitives/MpiIcon/MpiIcon.css',
    'js/components/Primitives/MpiBadge/MpiBadge.css',
    'js/components/Primitives/MpiSpinner/MpiSpinner.css',
    'js/components/Primitives/MpiProgressBar/MpiProgressBar.css',
    'js/components/Primitives/MpiInput/MpiInput.css',
    'js/components/Primitives/MpiPopup/MpiPopup.css',
    'js/components/Primitives/MpiToast/MpiToast.css',
    'js/components/Primitives/MpiScrollableBox/MpiScrollableBox.css',
    'js/components/Primitives/MpiMediaDropzone/MpiMediaDropzone.css',

    // Compounds
    'js/components/Compounds/MpiDragList/MpiDragList.css',
    'js/components/Compounds/MpiVolumeControl/MpiVolumeControl.css',
    'js/components/Compounds/MpiPromptBox/MpiPromptBox.css',

    // Blocks
    'js/components/Blocks/MpiVideoPlayer/MpiVideoPlayer.css',
    'js/components/Blocks/MpiDropdown/MpiDropdown.css',
    'js/components/Blocks/MpiRatioSelector/MpiRatioSelector.css'
  ]);

  // Inject provisioning dependencies (avoids circular imports)
  initProvisioning(toolContainer, loadToolInternal);

  // Eagerly load templates that are needed on every project open, before any navigation
  preloadTemplates([
    'tpl-provisioning',   // Download Manager — used by every engine-dependent tool
    'tpl-comingSoon',     // Used by any "soon" nav item click
    'tpl-settings',
    'tpl-about',
    'tpl-help',
    'tpl-components',
  ]).catch(() => { }); // Non-fatal — ensureTemplate will retry on demand

  bindSidebarEvents();
  restoreSidebarState();
  bindPromptBoxEvents();
  restorePromptBoxState();
  bindModalEvents();
  bindInfoBarEvents();
  bindTooltipEvents();
  bindMaintenanceEvents();
  bindWindowControls();

  // Hide Components gallery link if not in Dev Mode
  if (sidebarComponentsBtn && !APP_CONFIG.dev_mode) {
    sidebarComponentsBtn.classList.add('hide');
  }

  // Start memory monitoring
  updateMemoryStats();
  setInterval(updateMemoryStats, 2000);

  // Initial model registry fetch (non-blocking)
  refreshModelRegistry().catch(err => console.error('[shell] background registry fetch failed:', err));
  refreshComfyWorkflowRegistry().catch(err => console.error('[shell] comfy registry fetch failed:', err));

  // Register router callback
  onNavigate((page, params) => {
    // Dev Mode: persist current page so a refresh restores it
    if (APP_CONFIG.test_styles) {
      sessionStorage.setItem('mpi_dev_page', page);
      sessionStorage.setItem('mpi_dev_params', JSON.stringify(params || {}));
    }
    handleNavigation(page, params);
  });

  // Dev Mode: restore last page on refresh; otherwise always start at landing
  if (APP_CONFIG.test_styles) {
    const savedPage = sessionStorage.getItem('mpi_dev_page');
    const savedParams = JSON.parse(sessionStorage.getItem('mpi_dev_params') || '{}');
    navigate(savedPage || PAGE_LANDING, savedParams);
  } else {
    navigate(PAGE_LANDING);
  }

  // Auto-start ComfyUI if enabled
  if (localStorage.getItem('mpi_auto_start_comfy') === 'true') {
    console.log('[shell] Auto-starting ComfyUI engine...');
    ComfyUIController.ensureServerRunning().catch(err => {
      console.error('[shell] Auto-start failed:', err);
    });
  }

  // ── Global Event Overrides ──────────────────────────────────────

  // Disable native context menu everywhere and implement Global Media Intercept
  document.addEventListener('contextmenu', async (e) => {
    e.preventDefault();

    const target = e.target;
    let mediaUrl = null;
    let mediaType = 'image';

    if (target.tagName.toLowerCase() === 'img' && target.src) {
      mediaUrl = target.src;
    } else if (target.tagName.toLowerCase() === 'canvas' && target.dataset.mediaUrl) {
      const base = target.dataset.mediaUrl;
      const comp = target.dataset.comparisonUrl;
      const rawSlider = target.dataset.sliderPos;
      let sliderPos = rawSlider !== undefined ? parseFloat(rawSlider) : 0.5;

      if (base && !comp) {
        mediaUrl = base;
      } else if (base && comp) {
        const rect = target.getBoundingClientRect();
        // The sliderPos is in 0-1 scale visually
        const relativeX = (e.clientX - rect.left) / rect.width;
        // Left of slider -> base image, Right of slider -> comparison image
        mediaUrl = relativeX < sliderPos ? base : comp;
      }
    }

    // Attempt to drill up if not found directly
    if (!mediaUrl) {
      let parentImg = target.closest('img');
      if (parentImg && parentImg.src) mediaUrl = parentImg.src;
    }

    if (!mediaUrl || mediaUrl.startsWith('chrome-extension://') || mediaUrl === 'about:blank') return;
    if (mediaUrl.includes('placeholder')) return;

    let context = 'library';
    if (target.closest('#history-panel') || target.closest('.history-list')) context = 'history';
    else if (target.closest('#tool-detailer') || target.closest('#tool-upscaler')) context = 'input';

    // Result images on the right side of comparison sliders are NOT yet saved to the library.
    // The canvas stores data-comparisonUrl for the result and data-mediaUrl for the source.
    // If the resolved mediaUrl is the comparison (right side), treat as unsaved.
    const compUrl = target.dataset?.comparisonUrl;
    const isSaved = !(compUrl && mediaUrl === compUrl);

    const { MediaContextMenu } = await import('./components/mediaContextMenu.js');
    MediaContextMenu.show(e.clientX, e.clientY, {
      url: mediaUrl,
      filename: mediaUrl.split('/').pop().split('?')[0] || 'media_file',
      type: mediaType,
      isSaved
    }, context);
  }, { capture: true });

  // Global Dev Tools Shortcut (Ctrl+Shift+I)
  document.addEventListener('keydown', (e) => {
    if (e.ctrlKey && e.shiftKey && e.key.toLowerCase() === 'i') {
      e.preventDefault();
      if (APP_CONFIG.dev_mode) {
        if (ipcRenderer) {
          ipcRenderer.send('toggle-dev-tools'); // More common binding
        } else {
          console.log('[shell] Dev Tools shortcut caught, but not in Electron.');
        }
      }
    }
  });
}

// ── Navigation handler ────────────────────────────────────────────────────────
function handleNavigation(page, params) {
  if (page === PAGE_LANDING) {
    state.activeSubPage = null; // Phase 3.6 Fix
    showLanding();
    loadProjectGrid();
    updateTitlebarProject();
    initShaderBackground();
  } else if (page === PAGE_TOOL) {
    showShell();
    loadTool(params.name || 'promptBuilder');
    updateSidebarActive(params.name || 'promptBuilder');
    updateTitlebarProject();
    stopShaderBackground();
  } else if (page === PAGE_MEDIA) {
    state.activeSubPage = null; // Phase 3.6 Fix
    showShell();
    loadTool('_media');
    updateSidebarActive('_media');
    updateTitlebarProject();
    stopShaderBackground();
  } else if (page === PAGE_SETTINGS) {
    state.activeSubPage = null; // Phase 3.6 Fix
    showShell();
    loadTool('_settings');
    updateSidebarActive('_settings');
    updateTitlebarProject();
    stopShaderBackground();
  } else if (page === PAGE_ABOUT) {
    state.activeSubPage = null; // Phase 3.6 Fix
    showShell();
    loadTool('_about');
    updateSidebarActive('_about');
    updateTitlebarProject();
    stopShaderBackground();
  } else if (page === PAGE_HELP) {
    state.activeSubPage = null; // Phase 3.6 Fix
    showShell();
    loadTool('_help');
    updateSidebarActive('_help');
    updateTitlebarProject();
    stopShaderBackground();
  } else if (page === PAGE_COMPONENTS) {
    state.activeSubPage = null;
    showShell();
    loadTool('_components');
    updateSidebarActive('_components');
    updateTitlebarProject();
    stopShaderBackground();
  }
}

// ── Page visibility ───────────────────────────────────────────────────────────
function showLanding() {
  pageLanding.classList.remove('hide');
  appShell.classList.add('hide');
}

function showShell() {
  pageLanding.classList.add('hide');
  appShell.classList.remove('hide');
}

// ── Landing: project grid ─────────────────────────────────────────────────────
async function loadProjectGrid() {
  projectGrid.innerHTML = '<div class="projects-loading"><div class="spinner"></div></div>';
  try {
    const projects = await listProjects();
    if (projects.length === 0) {
      projectGrid.innerHTML = `
        <div class="projects-empty">
          <strong>No projects yet</strong>
          Click "New Project" to create your first AI project.
        </div>`;
      return;
    }
    projectGrid.innerHTML = '';
    projects.forEach(p => projectGrid.appendChild(buildProjectCard(p)));
  } catch (err) {
    console.error('[shell] loadProjectGrid failed:', err);
    projectGrid.innerHTML = `<div class="projects-empty"><strong>Could not load projects.</strong></div>`;
  }
}

function buildProjectCard(project) {
  const card = document.createElement('div');
  card.className = 'project-card';
  card.dataset.folderPath = project.folderPath;

  const date = new Date(project.updatedAt);
  const dateStr = date.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });

  const thumbHtml = project.recentThumbnail
    ? `<img src="${project.recentThumbnail}" alt="${project.name}" onerror="this.style.display='none'">`
    : ``;

  card.innerHTML = `
    <div class="project-card-thumb">
      ${thumbHtml}
      <span class="project-card-folder-icon">📁</span>
    </div>
    <div class="project-card-body">
      <div class="project-card-name">${escapeHtml(project.name)}</div>
      <div class="project-card-date">${dateStr}</div>
    </div>
    <button class="project-card-delete" title="Delete project" data-folder="${escapeHtml(project.folderPath)}">
      <svg viewBox="0 0 24 24" width="14" height="14"><path fill="currentColor" d="M6 19c0 1.1.9 2 2 2h8c1.1 0 2-.9 2-2V7H6v12zM19 4h-3.5l-1-1h-5l-1 1H5v2h14V4z"/></svg>
    </button>`;

  // Open project on card click (not on delete button)
  card.addEventListener('click', (e) => {
    if (e.target.closest('.project-card-delete')) return;
    openProject(project);
  });

  // Delete
  card.querySelector('.project-card-delete').addEventListener('click', async (e) => {
    e.stopPropagation();
    if (await window.MpiConfirm(`Are you sure you want to delete ${project.name}? This cannot be undone.`)) {
      try {
        await deleteProject(project.folderPath);
        loadProjectGrid();
      } catch (err) {
        window.MpiAlert('Could not delete project: ' + err.message);
      }
    }
  });

  return card;
}

// ── Tool loading ──────────────────────────────────────────────────────────────
async function loadTool(toolName) {
  state.currentTool = toolName;

  // Requirement: If Advanced Settings or Download Manager is open and we switch tools, refresh the overlay instead of loading the tool
  const titleEl = document.getElementById('provisionTitle');
  const overlayTitle = titleEl?.textContent;
  const isPersistentOverlay = overlayTitle === 'Advanced Settings' || overlayTitle === 'Download Manager';

  // Phase 3.6 Fix: Only allow persistent overlays for engine-dependent tools
  const isTargetGenerative = ENGINE_TOOLS.has(toolName);

  if (state.activeSubPage && isPersistentOverlay) {
    if (isTargetGenerative) {
      if (state.activeSubPage.toolName !== toolName) {
        if (overlayTitle === 'Advanced Settings') {
          showAdvancedSettingsScreen(toolName);
        } else {
          showProvisioningScreen(toolName, state.activeSubPage.isManual);
        }
      }
      return;
    } else if (!isTargetGenerative) {
      // If navigating to a non-generative tool, clear the subpage state
      state.activeSubPage = null;
    }
  }

  toolContainer.innerHTML = '';

  if (COMING_SOON_TOOLS.has(toolName)) {
    const tpl = await ensureTemplate('tpl-comingSoon');
    const el = tpl.content.cloneNode(true);
    const info = COMING_SOON_LABELS[toolName] || { label: 'Coming Soon', icon: '🔧' };
    el.querySelector('#comingSoonTitle').textContent = info.label;
    el.querySelector('#comingSoonIcon').textContent = info.icon;
    toolContainer.appendChild(el);
    return;
  }

  if (toolName === '_settings') {
    const tpl = await ensureTemplate('tpl-settings');
    toolContainer.appendChild(tpl.content.cloneNode(true));
    import('./pages/settings.js').then(m => m.initSettingsPage()).catch(e => console.error('[shell] settings init failed:', e));
    return;
  }

  if (toolName === '_about') {
    const tpl = await ensureTemplate('tpl-about');
    toolContainer.appendChild(tpl.content.cloneNode(true));
    return;
  }

  if (toolName === '_help') {
    const tpl = await ensureTemplate('tpl-help');
    toolContainer.appendChild(tpl.content.cloneNode(true));
    return;
  }

  if (toolName === '_components') {
    const tpl = await ensureTemplate('tpl-components');
    if (tpl) {
      toolContainer.appendChild(tpl.content.cloneNode(true));
      import('./pages/components.js').then(m => m.initComponentsPage()).catch(e => console.error('[shell] components init failed:', e));
    }
    return;
  }

  if (toolName === '_media') {
    const tpl = await ensureTemplate('tpl-mediaLibrary');
    if (tpl) {
      toolContainer.appendChild(tpl.content.cloneNode(true));
      import('./pages/mediaLibrary.js').then(m => {
        m.initMediaLibrary();
        m.loadMediaFiles();
      }).catch(e => console.error('[shell] mediaLibrary init failed:', e));
    }
    return;
  }

  if (LLM_TOOLS.has(toolName)) {
    checkEngineStatusAndLoad(toolName, 'llama');
    return;
  }

  // Check Python Environment / ComfyUI engine for ComfyUI tools
  if (COMFY_TOOLS.has(toolName)) {
    checkEngineStatusAndLoad(toolName, 'comfy');
    return;
  }

  loadToolInternal(toolName);
}

// ── Tool logic mapping ────────────────────────────────────────────────────────

async function loadToolInternal(toolName) {
  // Clear the tool container so we don't stack UI elements over the provisioning screen
  toolContainer.innerHTML = '';

  // Refresh registries before loading tool to ensure selectors are populated
  if (COMFY_TOOLS.has(toolName)) {
    await refreshComfyWorkflowRegistry().catch(() => { });
  } else {
    await refreshModelRegistry().catch(() => { });
  }

  // Stage 9 & 10: Check dependencies before loading tool UI
  if (LLM_TOOLS.has(toolName)) {
    const available = getFirstAvailableModel(toolName);
    if (!available) {
      showProvisioningScreen(toolName);
      return;
    }
  } else if (COMFY_TOOLS.has(toolName)) {
    const { getWorkflowStatus, getDefaultWorkflowId } = await import('./comfyModelManager.js');
    const defaultWfId = getDefaultWorkflowId(toolName);
    const selectedWorkflowId = state.toolModelIds[toolName] || defaultWfId;
    if (!getWorkflowStatus(selectedWorkflowId)) {
      showProvisioningScreen(toolName);
      return;
    }
  }

  // Load tool from registry
  const toolDef = TOOL_REGISTRY[toolName];
  if (toolDef && toolDef.type !== 'soon') {
    const tpl = await ensureTemplate(toolDef.tplId);
    if (tpl) {
      toolContainer.appendChild(tpl.content.cloneNode(true));
      if (!toolDef.skipModelSelector) {
        injectModelSelector(toolName);
      }
      toolDef.module().then(initFn => initFn()).catch(e => console.error(`[shell] ${toolName} init failed:`, e));
      return;
    }
  }

  // Other tools
  const tplId = `tpl-${toolName}`;
  const tpl = await ensureTemplate(tplId).catch(() => document.getElementById(tplId));
  if (tpl) {
    toolContainer.appendChild(tpl.content.cloneNode(true));
  } else {
    toolContainer.innerHTML = `
      <div class="tool-panel">
        <div class="coming-soon-page">
          <div class="coming-soon-icon">🔧</div>
          <h2 class="coming-soon-title">${toolName}</h2>
          <p class="coming-soon-desc">This tool is under construction.</p>
        </div>
      </div>`;
  }
}

async function checkEngineStatusAndLoad(toolName, type) {
  toolContainer.innerHTML = '<div class="projects-loading"><div class="spinner"></div><div>Checking Engine...</div></div>';
  try {
    const res = await fetch(`/engine/status?type=${type}`);
    const data = await res.json();
    toolContainer.innerHTML = '';
    if (data.exists) {
      loadToolInternal(toolName);
    } else {
      showEngineProvisioningScreen(toolName, type, false);
    }
  } catch (e) {
    toolContainer.innerHTML = `<div class="projects-empty">Error verifying engine: ${e.message}</div>`;
  }
}

// showEngineProvisioningScreen lives in js/provisioning.js (imported above)

// showProvisioningScreen lives in js/provisioning.js (imported and re-exported above)

// showAdvancedSettingsScreen and closeActiveSubPage live in js/provisioning.js (imported and re-exported above)



export function injectModelSelector(toolName, container = null) {
  const toolDef = TOOL_REGISTRY[toolName];
  let items = [];
  let currentId = state.toolModelIds[toolName];
  const isComfy = toolDef?.type === 'comfy';
  if (isComfy) {
    const expectedType = toolDef?.comfyType || 'image_generation';
    items = (state.allComfyWorkflows || [])
      .filter(wf => wf.type === expectedType)
      .map(wf => ({
        id: wf.id,
        name: wf.name,
        exists: wf.isInstalled
      }));
  } else {
    items = getRequiredModelsForTool(toolName).filter(m => m.exists).map(m => ({
      id: m.id,
      name: m.name,
      exists: true
    }));
  }

  if (items.length === 0) return;

  // Default to first if tool not yet set or invalid
  if (!currentId || !items.find(m => m.id === currentId)) {
    currentId = items[0].id;
    state.toolModelIds[toolName] = currentId;
  }

  const selector = document.createElement('div');
  selector.className = 'tool-engine-selector';

  let optionsHtml = items.map(m =>
    `<option value="${m.id}" ${m.id === currentId ? 'selected' : ''}>${m.name}</option>`
  ).join('');

  // Add Edit Button for tools with advanced settings
  const hasAdvanced = toolDef?.hasAdvancedSettings === true;
  const editBtnHtml = hasAdvanced ? `
    <button class="engine-edit-btn" title="Advanced Settings">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"></path></svg>
    </button>
  ` : '';

  selector.innerHTML = `
        <select class="engine-select">
            ${optionsHtml}
        </select>
        ${editBtnHtml}
        <button class="engine-manage-btn" title="Manage Models">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M7 10l5 5 5-5M12 15V3"/></svg>
        </button>
    `;

  const select = selector.querySelector('.engine-select');
  select.addEventListener('change', (e) => {
    state.toolModelIds[toolName] = e.target.value;
    console.log(`[shell] ${toolName} switched to engine:`, state.toolModelIds[toolName]);
  });

  const manageBtn = selector.querySelector('.engine-manage-btn');
  manageBtn.addEventListener('click', () => {
    showProvisioningScreen(toolName, true);
  });

  if (hasAdvanced) {
    const editBtn = selector.querySelector('.engine-edit-btn');
    editBtn.addEventListener('click', () => {
      showAdvancedSettingsScreen(toolName);
    });
  }

  // Check if tool-panel exists
  const panel = toolContainer.querySelector('.tool-panel');
  const target = container || panel?.querySelector('.tool-header') || panel;
  if (target) {
    if (!container && target === panel) panel.style.position = 'relative';
    target.appendChild(selector);
  }
}

// ── Sidebar ───────────────────────────────────────────────────────────────────
function bindSidebarEvents() {
  // Tool nav items
  sidebarNav.querySelectorAll('.nav-item[data-tool]').forEach(btn => {
    btn.addEventListener('click', () => {
      navigate(PAGE_TOOL, { name: btn.dataset.tool });
    });
  });

  if (sidebarToggle) {
    sidebarToggle.addEventListener('click', () => {
      const isCollapsed = sidebar.classList.toggle('collapsed');
      document.body.classList.toggle('sidebar-collapsed', isCollapsed);
      updateSidebarGroupLabels(isCollapsed);
      localStorage.setItem('mpi_sidebar_collapsed', isCollapsed);
    });
  }

  // Group headers (Collapsible)
  sidebarNav.querySelectorAll('.nav-group-header').forEach(header => {
    header.addEventListener('click', () => {
      const groupId = header.dataset.group;
      const content = document.getElementById(`group-${groupId}`);
      if (!content) return;

      const isCollapsed = content.classList.toggle('collapsed');
      header.classList.toggle('collapsed', isCollapsed);

      // Persist state
      const collapsedGroups = JSON.parse(localStorage.getItem('mpi_collapsed_groups') || '[]');
      if (isCollapsed) {
        if (!collapsedGroups.includes(groupId)) collapsedGroups.push(groupId);
      } else {
        const idx = collapsedGroups.indexOf(groupId);
        if (idx !== -1) collapsedGroups.splice(idx, 1);
      }
      localStorage.setItem('mpi_collapsed_groups', JSON.stringify(collapsedGroups));
    });
  });

  sidebarMediaBtn.addEventListener('click', () => navigate(PAGE_MEDIA));
  sidebarProjectsBtn.addEventListener('click', () => navigate(PAGE_LANDING));
  sidebarSettingsBtn.addEventListener('click', () => navigate(PAGE_SETTINGS));
  sidebarHelpBtn.addEventListener('click', () => navigate(PAGE_HELP));
  sidebarAboutBtn.addEventListener('click', () => navigate(PAGE_ABOUT));
  if (sidebarComponentsBtn) {
    sidebarComponentsBtn.addEventListener('click', () => navigate(PAGE_COMPONENTS));
  }
}

function restoreSidebarState() {
  try {
    const collapsedGroups = JSON.parse(localStorage.getItem('mpi_collapsed_groups') || '[]');
    collapsedGroups.forEach(groupId => {
      const header = sidebarNav.querySelector(`.nav-group-header[data-group="${groupId}"]`);
      const content = document.getElementById(`group-${groupId}`);
      if (header && content) {
        header.classList.add('collapsed');
        content.classList.add('collapsed');
      }
    });

    const isSidebarCollapsed = localStorage.getItem('mpi_sidebar_collapsed') === 'true';
    if (isSidebarCollapsed) {
      sidebar.classList.add('collapsed');
      document.body.classList.add('sidebar-collapsed');
      updateSidebarGroupLabels(true);
    }
  } catch (e) {
    console.error('[shell] restoreSidebarState failed:', e);
  }
}

function updateSidebarGroupLabels(isCollapsed) {
  const labels = {
    create: isCollapsed ? 'PRT' : 'PROMPTS',
    generate: isCollapsed ? 'IMG' : 'IMAGES',
    video: isCollapsed ? 'V/A' : 'Video & Audio'
  };
  sidebarNav.querySelectorAll('.nav-group-header').forEach(header => {
    const groupId = header.dataset.group;
    const labelSpan = header.querySelector('.nav-group-label');
    if (labelSpan && labels[groupId]) {
      labelSpan.textContent = labels[groupId];
    }
  });
}

function updateSidebarActive(toolName) {
  document.querySelectorAll('.nav-item').forEach(el => el.classList.remove('active'));
  const active = document.querySelector(`.nav-item[data-tool="${toolName}"]`);
  if (active) active.classList.add('active');
  if (toolName === '_media') sidebarMediaBtn.classList.add('active');
  if (toolName === '_settings') sidebarSettingsBtn.classList.add('active');
  if (toolName === '_help') sidebarHelpBtn.classList.add('active');
  if (toolName === '_about') sidebarAboutBtn.classList.add('active');
  if (toolName === '_components' && sidebarComponentsBtn) sidebarComponentsBtn.classList.add('active');
}

/**
 * Shows/hides the green running dot on a nav-item.
 * Collapsed sidebar:  small ● absolutely positioned top-right of the icon.
 * Expanded sidebar:   same dot floats after the label, right-aligned.
 * Only one tool can show the indicator at a time.
 */
function updateSidebarRunningIndicator(toolId, isRunning) {
  // Remove all existing dots
  document.querySelectorAll('.nav-item .running-dot').forEach(d => d.remove());

  if (!isRunning || !toolId) return;

  const btn = document.querySelector(`.nav-item[data-tool="${toolId}"]`);
  if (!btn) return;

  // Ensure the button is position:relative for the dot overlay
  btn.style.position = 'relative';

  const dot = document.createElement('span');
  dot.className = 'running-dot';
  dot.setAttribute('aria-label', 'Running');
  btn.appendChild(dot);
}

// Wire the event emitted by toolUtils.setRunningTool / clearRunningTool
document.addEventListener('tool:running-changed', (e) => {
  updateSidebarRunningIndicator(e.detail.toolId, e.detail.running);
});

function bindTooltipEvents() {
  // We keep this for Sidebar Tooltips as requested if they have data-tooltip
  // But the global Info Bar is the primary source of truth now.
  const tooltipElements = document.querySelectorAll('[data-tooltip]');

  tooltipElements.forEach(el => {
    el.addEventListener('mouseenter', () => {
      if (!sidebar.classList.contains('collapsed')) return;
      if (!sidebarTooltip) return;

      const text = el.getAttribute('data-tooltip');
      sidebarTooltip.textContent = text;
      sidebarTooltip.classList.remove('hide');

      const rect = el.getBoundingClientRect();
      const top = rect.top + (rect.height / 2) - (sidebarTooltip.offsetHeight / 2);
      const left = rect.right + 12;

      sidebarTooltip.style.top = `${top}px`;
      sidebarTooltip.style.left = `${left}px`;
    });

    el.addEventListener('mouseleave', () => {
      if (sidebarTooltip) sidebarTooltip.classList.add('hide');
    });
  });
}

/**
 * Global Info Bar Hover Listener
 * Listens for any element with 'data-info' and updates the minimalist status bar.
 * NOTE: [data-tooltip] is intentionally excluded — those are sidebar collapsed tooltips
 * handled separately by bindTooltipEvents(). Only Primitive components use [data-info].
 */
function bindInfoBarEvents() {
  const infoText = document.getElementById('shell-info-text');
  if (!infoText) return;

  let currentTarget = null;
  const observer = new MutationObserver(() => {
    if (!currentTarget) return;
    const info = currentTarget.getAttribute('data-info');
    if (info && infoText.textContent !== info) {
      infoText.textContent = info;
    }
  });

  document.addEventListener('mouseover', (e) => {
    const target = e.target.closest('[data-info]');
    if (target && target !== currentTarget) {
      currentTarget = target;
      observer.disconnect();
      observer.observe(target, { attributes: true, attributeFilter: ['data-info'] });

      const info = target.getAttribute('data-info');
      if (info && infoText.textContent !== info) {
        infoText.classList.add('updating');
        setTimeout(() => {
          infoText.textContent = info;
          infoText.classList.remove('updating');
        }, 80);
      }
    }
  });

  document.addEventListener('mouseout', (e) => {
    const target = e.target.closest('[data-info]');
    if (target && target === currentTarget && (!e.relatedTarget || !target.contains(e.relatedTarget))) {
      currentTarget = null;
      observer.disconnect();

      infoText.classList.add('updating');
      setTimeout(() => {
        infoText.textContent = 'Ready';
        infoText.classList.remove('updating');
      }, 80);
    }
  });
}


function bindPromptBoxEvents() {
  // Global delegation for the toggle button at the top center
  document.addEventListener('click', (e) => {
    const btn = e.target.closest('.prompt-height-toggle');
    if (btn) {
      const isCompact = document.body.classList.toggle('prompt-compact');
      localStorage.setItem('mpi_prompt_compact', isCompact);
    }
  });

  // Double-click on the top area (wrapper) to also toggle
  document.addEventListener('dblclick', (e) => {
    const wrapper = e.target.closest('.prompt-box-wrapper');
    if (wrapper) {
      const isCompact = document.body.classList.toggle('prompt-compact');
      localStorage.setItem('mpi_prompt_compact', isCompact);
    }
  });
}

function restorePromptBoxState() {
  const isCompact = localStorage.getItem('mpi_prompt_compact') === 'true';
  if (isCompact) {
    document.body.classList.add('prompt-compact');
  }
}

// ── Header & Footer ───────────────────────────────────────────────────────────
function updateTitlebarProject() {
  if (state.currentProject && titlebarProjectName) {
    titlebarProjectName.textContent = ` - ${state.currentProject.name}`;
  } else if (titlebarProjectName) {
    titlebarProjectName.textContent = '';
  }
}

async function triggerMemoryRelease(isDeep = false) {
  if (globalUnloadBtn.disabled) return;

  const isCollapsed = sidebar.classList.contains('collapsed');
  const statusPrefix = isDeep ? (isCollapsed ? 'D...' : 'Deep Cleaning...') : (isCollapsed ? '...' : 'Releasing VRAM...');

  unloadStatusPopup.textContent = statusPrefix;
  unloadStatusPopup.classList.remove('hide');
  globalUnloadBtn.disabled = true;

  try {
    // 1. Unload LLM models (Always done)
    console.log('[shell] Unloading LLM models...');
    await unloadModel().catch(err => console.error('LLM unload failed:', err));

    // 2. Unload ComfyUI models & potentially clear cache
    console.log(`[shell] Unloading ComfyUI (deep=${isDeep})...`);
    const comfyRes = await fetch('/comfy/unload', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ deep: isDeep })
    }).catch(() => null);

    if (comfyRes && !comfyRes.ok) {
      // Fallback for some ComfyUI versions/proxies (Standard Unload only)
      await fetch('http://127.0.0.1:8188/extra/unload_models', { method: 'POST' }).catch(() => null);
    }

    unloadStatusPopup.textContent = isDeep
      ? (isCollapsed ? 'DC ✓' : 'Deep Clean Complete ✓')
      : (isCollapsed ? '✓' : 'VRAM Released ✓');

    setTimeout(() => {
      unloadStatusPopup.classList.add('hide');
      globalUnloadBtn.disabled = false;
    }, 2000);
  } catch (err) {
    console.error('Global unload failed:', err);
    unloadStatusPopup.textContent = isCollapsed ? '✗' : 'Unload Failed';
    setTimeout(() => {
      unloadStatusPopup.classList.add('hide');
      globalUnloadBtn.disabled = false;
    }, 3000);
  }
}

function bindMaintenanceEvents() {
  if (!globalUnloadBtn || !unloadStatusPopup) return;

  globalUnloadBtn.addEventListener('click', (e) => {
    triggerMemoryRelease(e.ctrlKey);
  });

  // Global Keyboard Shortcuts for Memory Release (F5 and Ctrl+F5)
  // F5 is a dedicated system key — must fire regardless of which element has focus.
  window.addEventListener('keydown', (e) => {
    if (e.key === 'F5') {
      e.preventDefault();
      triggerMemoryRelease(e.ctrlKey); // handles both F5 (standard) and Ctrl+F5 (deep)
      return;
    }

    // For all other shortcuts, skip if the user is typing
    if (['input', 'textarea'].includes(document.activeElement.tagName.toLowerCase())) return;

    // Visual feedback for Ctrl key
    if (e.key === 'Control') {
      globalUnloadBtn.classList.add('ctrl-held');
    }
  });

  window.addEventListener('keyup', (e) => {
    if (e.key === 'Control') {
      globalUnloadBtn.classList.remove('ctrl-held');
    }
  });
}

// ── Window Controls ───────────────────────────────────────────────────────────
function bindWindowControls() {
  const btnMin = document.getElementById('win-minimize');
  const btnMax = document.getElementById('win-maximize');
  const btnClose = document.getElementById('win-close');
  const btnFS = document.getElementById('win-fullscreen');
  const maxIcon = document.getElementById('max-icon');
  const restoreIcon = document.getElementById('restore-icon');
  const fsEnterIcon = document.getElementById('fullscreen-enter-icon');
  const fsExitIcon = document.getElementById('fullscreen-exit-icon');

  if (btnMin) {
    btnMin.addEventListener('click', () => {
      if (ipcRenderer) ipcRenderer.send('window-minimize');
      else console.log('[shell] window-minimize requested but ipcRenderer is unavailable');
    });
  }

  if (btnFS) {
    btnFS.addEventListener('click', () => {
      if (ipcRenderer) ipcRenderer.send('window-fullscreen');
      else console.log('[shell] window-fullscreen requested but ipcRenderer is unavailable');
    });
  }

  if (btnMax) {
    btnMax.addEventListener('click', () => {
      if (ipcRenderer) ipcRenderer.send('window-maximize');
      else console.log('[shell] window-maximize requested but ipcRenderer is unavailable');
    });
  }

  if (btnClose) {
    btnClose.addEventListener('click', () => {
      if (ipcRenderer) ipcRenderer.send('window-close');
      else console.log('[shell] window-close requested but ipcRenderer is unavailable');
    });
  }

  // F11 Shortcut for Full Screen
  window.addEventListener('keydown', (e) => {
    if (e.key === 'F11') {
      e.preventDefault();
      if (ipcRenderer) ipcRenderer.send('window-fullscreen');
    }
  });

  // Handle IPC events for window state changes
  if (ipcRenderer) {
    ipcRenderer.on('window-fullscreen-change', (event, isFullScreen) => {
      if (fsEnterIcon && fsExitIcon && btnFS) {
        if (isFullScreen) {
          fsEnterIcon.classList.add('hide');
          fsExitIcon.classList.remove('hide');
          btnFS.title = 'Exit Full Screen';
        } else {
          fsEnterIcon.classList.remove('hide');
          fsExitIcon.classList.add('hide');
          btnFS.title = 'Full Screen';
        }
      }
    });

    ipcRenderer.on('window-maximize-change', (event, isMaximized) => {
      if (maxIcon && restoreIcon) {
        if (isMaximized) {
          maxIcon.classList.add('hide');
          restoreIcon.classList.remove('hide');
        } else {
          maxIcon.classList.remove('hide');
          restoreIcon.classList.add('hide');
        }
      }
    });
  }
}

// ── Modal: New Project ────────────────────────────────────────────────────────
function bindModalEvents() {
  newProjectBtn.addEventListener('click', () => {
    newProjectName.value = '';
    newProjectFolder.value = '';
    newProjectModal.classList.remove('hide');
    setTimeout(() => newProjectName.focus(), 50);
  });

  closeNewProjectModal.addEventListener('click', () => newProjectModal.classList.add('hide'));
  cancelNewProjectBtn.addEventListener('click', () => newProjectModal.classList.add('hide'));
  newProjectModal.addEventListener('click', (e) => {
    if (e.target === newProjectModal) newProjectModal.classList.add('hide');
  });

  chooseFolderBtn.addEventListener('click', async () => {
    chooseFolderBtn.classList.add('loading');
    const chosen = await chooseFolder();
    chooseFolderBtn.classList.remove('loading');
    if (chosen) newProjectFolder.value = chosen;
  });

  confirmNewProjectBtn.addEventListener('click', async () => {
    const name = newProjectName.value.trim() || 'Untitled Project';
    const folder = newProjectFolder.value.trim() || null;
    confirmNewProjectBtn.classList.add('loading');
    try {
      const project = await createProject(name, folder);
      newProjectModal.classList.add('hide');
      openProject(project);
    } catch (err) {
      alert('Could not create project: ' + err.message);
    } finally {
      confirmNewProjectBtn.classList.remove('loading');
    }
  });

  // Allow Enter key to submit new project
  newProjectName.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') confirmNewProjectBtn.click();
  });
}

// ── Helpers ───────────────────────────────────────────────────────────────────
function escapeHtml(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

async function updateMemoryStats() {
  try {
    const res = await fetch('/system/stats');
    const data = await res.json();
    if (!data.success) return;

    // Update RAM
    const ramGB = (data.ram.used / (1024 ** 3)).toFixed(1);
    const totalRamGB = (data.ram.total / (1024 ** 3)).toFixed(0);
    const ramPercent = data.ram.percent;

    if (ramValue) ramValue.textContent = `${ramGB} / ${totalRamGB} GB`;
    if (ramBarFill) {
      ramBarFill.style.width = `${ramPercent}%`;
      ramBarFill.style.setProperty('--fill-percent', `${ramPercent}%`);
      ramBarFill.classList.toggle('warning', parseFloat(ramPercent) > 85);
    }

    // Update VRAM
    const vramGB = (data.vram.used / (1024 ** 3)).toFixed(1);
    const totalVramGB = (data.vram.total / (1024 ** 3)).toFixed(0);
    const vramPercent = data.vram.percent;

    if (vramValue) vramValue.textContent = `${vramGB} / ${totalVramGB} GB`;
    if (vramBarFill) {
      vramBarFill.style.width = `${vramPercent}%`;
      vramBarFill.style.setProperty('--fill-percent', `${vramPercent}%`);
      vramBarFill.classList.toggle('warning', parseFloat(vramPercent) > 85);
    }
  } catch (err) {
    console.warn('[shell] Failed to fetch memory stats:', err);
  }
}

/**
 * preloadComponentStyles — Injects <link> tags for all shared components
 * used across the application to prevent FOUC (Flash of Unstyled Content).
 * 
 * @param {string[]} paths - Array of relative paths to component .css files
 */
function preloadComponentStyles(paths) {
  const head = document.head;
  paths.forEach(path => {
    // Avoid duplicate injection
    if (head.querySelector(`link[href="${path}"]`)) return;

    const link = document.createElement('link');
    link.rel = 'stylesheet';
    link.href = path;
    head.appendChild(link);
  });
}
