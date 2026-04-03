/**
 * shell.js — App bootstrap: landing page, workspace shell, project grid,
 * memory monitoring, window controls, and maintenance shortcuts.
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
  console.warn('[shell] Not running in Electron — window controls disabled.');
}

import { state } from './state.js';
import { APP_CONFIG } from '../dev_configs/app_config.js';
import { navigate, onNavigate, PAGE_LANDING, PAGE_WORKSPACE } from './router.js';
import { listProjects, createProject, deleteProject, openProject, chooseFolder } from './projectManager.js';
import { refreshModelRegistry } from './modelManager.js';
import { refreshComfyWorkflowRegistry } from './comfyModelManager.js';
import { unloadModel } from './llmService.js';
import { initShaderBackground, stopShaderBackground } from './components/shaderBackground.js';
import { ComfyUIController } from './comfyController.js';
import { Hotkeys } from './managers/hotkeyManager.js';
import { MpiMemoryMonitor } from './components/Compounds/MpiMemoryMonitor/MpiMemoryMonitor.js';
import { MpiRadialMenu } from './components/Primitives/MpiRadialMenu/MpiRadialMenu.js';
import { MpiProjectName } from './components/Compounds/MpiProjectName/MpiProjectName.js';

// ── DOM refs ──────────────────────────────────────────────────────────────────
const pageLanding         = document.getElementById('page-landing');
const appShell            = document.getElementById('app-shell');
const toolContainer       = document.getElementById('tool-container');

const projectGrid         = document.getElementById('projectGrid');
const monitorMount        = document.getElementById('memory-monitor-mount');
const projectNameMount    = document.getElementById('project-name-mount');

// Landing
const newProjectBtn = document.getElementById('newProjectBtn');

// Modal – New Project
const newProjectModal      = document.getElementById('newProjectModal');
const closeNewProjectModal = document.getElementById('closeNewProjectModal');
const cancelNewProjectBtn  = document.getElementById('cancelNewProjectBtn');
const confirmNewProjectBtn = document.getElementById('confirmNewProjectBtn');
const newProjectName       = document.getElementById('newProjectName');
const newProjectFolder     = document.getElementById('newProjectFolder');
const chooseFolderBtn      = document.getElementById('chooseFolderBtn');

// ── Init ──────────────────────────────────────────────────────────────────────
export async function initShell() {
  // 1. Preload component styles to prevent FOUC
  preloadComponentStyles([
    // Primitives
    'js/components/Primitives/MpiButton/MpiButton.css',
    'js/components/Primitives/MpiIcon/MpiIcon.css',
    'js/components/Primitives/MpiBadge/MpiBadge.css',
    'js/components/Primitives/MpiSpinner/MpiSpinner.css',
    'js/components/Primitives/MpiProgressBar/MpiProgressBar.css',
    'js/components/Primitives/MpiInput/MpiInput.css',
    'js/components/Primitives/MpiDropdown/MpiDropdown.css',
    'js/components/Primitives/MpiRadioGroup/MpiRadioGroup.css',
    'js/components/Primitives/MpiPopup/MpiPopup.css',
    'js/components/Primitives/MpiToast/MpiToast.css',
    'js/components/Primitives/MpiScrollableBox/MpiScrollableBox.css',
    'js/components/Primitives/MpiMediaDropzone/MpiMediaDropzone.css',
    'js/components/Primitives/MpiDragList/MpiDragList.css',
    'js/components/Primitives/MpiOverlay/MpiOverlay.css',
    'js/components/Primitives/MpiRadialMenu/MpiRadialMenu.css',

    // Compounds
    'js/components/Compounds/MpiVolumeControl/MpiVolumeControl.css',
    'js/components/Compounds/MpiPromptBox/MpiPromptBox.css',
    'js/components/Compounds/MpiDropdown/MpiDropdown.css',
    'js/components/Compounds/MpiRatioSelector/MpiRatioSelector.css',
    'js/components/Compounds/MpiToolbar/MpiToolbar.css',
    'js/components/Compounds/MpiCameraConfig/MpiCameraConfig.css',
    'js/components/Compounds/MpiLightingConfig/MpiLightingConfig.css',
    'js/components/Compounds/MpiStyleConfig/MpiStyleConfig.css',
    'js/components/Compounds/MpiVideoScene/MpiVideoScene.css',
    'js/components/Compounds/MpiOkCancel/MpiOkCancel.css',
    'js/components/Compounds/MpiInstalledDisplay/MpiInstalledDisplay.css',
    'js/components/Compounds/MpiMemoryMonitor/MpiMemoryMonitor.css',
    'js/components/Compounds/MpiProjectName/MpiProjectName.css',

    // Blocks
    'js/components/Blocks/MpiVideoPlayer/MpiVideoPlayer.css',
  ]);

  bindModalEvents();
  bindInfoBarEvents();
  bindWindowControls();

  // Mount MpiProjectName — top-left HUD: project name + page label + back arrow
  _projectNameInstance = MpiProjectName.mount(projectNameMount, {
    projectName: state.currentProject?.name || '',
    pageName: 'Main Menu',
  });
  _projectNameInstance.on('back', () => navigate(PAGE_LANDING));

  // Mount MpiMemoryMonitor — owns polling and unload button
  const memMonitor = MpiMemoryMonitor.mount(monitorMount);
  memMonitor.on('release', ({ deep }) => triggerMemoryRelease(deep, memMonitor.el));

  // F5 — trigger memory release (Ctrl+F5 = deep clean)
  Hotkeys.register('f5', (e) => {
    e.preventDefault();
    triggerMemoryRelease(e.ctrlKey, memMonitor.el);
  });

  // Background registry fetches (non-blocking)
  refreshModelRegistry().catch(err => console.error('[shell] model registry fetch failed:', err));
  refreshComfyWorkflowRegistry().catch(err => console.error('[shell] comfy registry fetch failed:', err));

  // Register router callback
  onNavigate((page, params) => {
    if (APP_CONFIG.test_styles) {
      sessionStorage.setItem('mpi_dev_page', page);
      sessionStorage.setItem('mpi_dev_params', JSON.stringify(params || {}));
    }
    handleNavigation(page, params);
  });

  // Dev Mode: restore last page on refresh; otherwise always start at landing
  if (APP_CONFIG.test_styles) {
    const savedPage   = sessionStorage.getItem('mpi_dev_page');
    const savedParams = JSON.parse(sessionStorage.getItem('mpi_dev_params') || '{}');
    navigate(savedPage || PAGE_LANDING, savedParams);
  } else {
    navigate(PAGE_LANDING);
  }

  // Auto-start ComfyUI if enabled
  if (localStorage.getItem('mpi_auto_start_comfy') === 'true') {
    console.log('[shell] Auto-starting ComfyUI...');
    ComfyUIController.ensureServerRunning().catch(err => {
      console.error('[shell] Auto-start failed:', err);
    });
  }

  // Disable native context menu + Global Media Intercept
  document.addEventListener('contextmenu', async (e) => {
    e.preventDefault();

    const target = e.target;
    let mediaUrl  = null;
    const mediaType = 'image';

    if (target.tagName.toLowerCase() === 'img' && target.src) {
      mediaUrl = target.src;
    } else if (target.tagName.toLowerCase() === 'canvas' && target.dataset.mediaUrl) {
      const base = target.dataset.mediaUrl;
      const comp = target.dataset.comparisonUrl;
      if (base && !comp) {
        mediaUrl = base;
      } else if (base && comp) {
        const rect      = target.getBoundingClientRect();
        const relativeX = (e.clientX - rect.left) / rect.width;
        const sliderPos = parseFloat(target.dataset.sliderPos ?? 0.5);
        mediaUrl = relativeX < sliderPos ? base : comp;
      }
    }

    if (!mediaUrl) {
      const parentImg = target.closest('img');
      if (parentImg?.src) mediaUrl = parentImg.src;
    }

    if (!mediaUrl || mediaUrl.startsWith('chrome-extension://') || mediaUrl === 'about:blank') return;
    if (mediaUrl.includes('placeholder')) return;

    let context = 'library';
    if (target.closest('#history-panel') || target.closest('.history-list')) context = 'history';

    const compUrl = target.dataset?.comparisonUrl;
    const isSaved = !(compUrl && mediaUrl === compUrl);

    const { MediaContextMenu } = await import('./components/mediaContextMenu.js');
    MediaContextMenu.show(e.clientX, e.clientY, {
      url:      mediaUrl,
      filename: mediaUrl.split('/').pop().split('?')[0] || 'media_file',
      type:     mediaType,
      isSaved,
    }, context);
  }, { capture: true });

  // Dev Tools shortcut (Ctrl+Shift+I)
  Hotkeys.register('control+shift+i', () => {
    if (APP_CONFIG.dev_mode) {
      if (ipcRenderer) ipcRenderer.send('toggle-dev-tools');
      else console.log('[shell] Dev Tools shortcut — not in Electron.');
    }
  });
}

// ── Navigation ────────────────────────────────────────────────────────────────
function handleNavigation(page, params) {
  if (page === PAGE_LANDING) {
    state.activeSubPage = null;
    showLanding();
    loadProjectGrid();
    updateTitlebarProject();
    initShaderBackground();
  } else if (page === PAGE_WORKSPACE) {
    showShell();
    updateTitlebarProject();
    stopShaderBackground();
    toolContainer.innerHTML = '';
    _mountWorkspace();
  }
}

// ── Workspace ────────────────────────────────────────────────────────────────

/** @type {import('./components/Primitives/MpiRadialMenu/MpiRadialMenu.js').MpiRadialMenuProps|null} */
let _radialInstance = null;

/** @type {Object|null} MpiProjectName instance — kept at module scope so _mountWorkspace can update it */
let _projectNameInstance = null;

/**
 * Mounts the workspace canvas and the radial menu.
 * Called each time the router transitions to PAGE_WORKSPACE.
 */
function _mountWorkspace() {
  // Destroy previous instance if navigating back into workspace
  if (_radialInstance) {
    _radialInstance.destroy();
    _radialInstance = null;
  }

  // Reset page label to Main Menu on workspace entry
  if (_projectNameInstance) _projectNameInstance.el.setPageName('Main Menu');

  // toolContainer acts as the workspace canvas — needs relative positioning
  toolContainer.style.position = 'relative';

  // Dev-only: inject Components Gallery shortcut into every radial context
  const extraItems = APP_CONFIG.dev_mode ? [
    { action: 'components', label: 'Components', icon: 'grid' }
  ] : [];

  // Mount the radial menu — open immediately so first-run onboarding is shown
  _radialInstance = MpiRadialMenu.mount(toolContainer, { context: 'root', open: true, extraItems });

  // Map action → display label for MpiProjectName
  const ACTION_LABELS = {
    root:       'Main Menu',
    image:      'Image',
    video:      'Video',
    audio:      'Audio',
    gallery:    'Gallery',
    components: 'Components',
  };

  _radialInstance.on('select', ({ action }) => {
    console.log('[shell] radial select:', action);

    if (action === 'components') {
      if (_projectNameInstance) _projectNameInstance.el.setPageName('Components');
      _loadComponentsGallery();
      return;
    }

    // Update page label in HUD
    if (_projectNameInstance && ACTION_LABELS[action]) {
      _projectNameInstance.el.setPageName(ACTION_LABELS[action]);
    }

    // Future: navigate to sub-tools or overlays based on action
  });
}

/**
 * Loads the Components Gallery page into the tool container.
 * Dev-only — only reachable when APP_CONFIG.dev_mode is true.
 */
async function _loadComponentsGallery() {
  const { ensureTemplate } = await import('./templateLoader.js');
  const { initComponentsPage } = await import('./pages/components.js');

  toolContainer.innerHTML = '';
  toolContainer.style.position = '';

  await ensureTemplate('tpl-components');
  const tpl = document.getElementById('tpl-components');
  toolContainer.appendChild(tpl.content.cloneNode(true));

  await initComponentsPage();
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

  const date    = new Date(project.updatedAt);
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

  card.addEventListener('click', (e) => {
    if (e.target.closest('.project-card-delete')) return;
    openProject(project);
  });

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

// ── Info Bar ──────────────────────────────────────────────────────────────────
/**
 * Listens for [data-info] elements and updates the shell status bar on hover.
 * NOTE: [data-tooltip] is intentionally excluded — those were sidebar tooltips.
 */
function bindInfoBarEvents() {
  const infoText = document.getElementById('shell-info-text');
  if (!infoText) return;

  let currentTarget = null;
  const observer = new MutationObserver(() => {
    if (!currentTarget) return;
    const info = currentTarget.getAttribute('data-info');
    if (info && infoText.textContent !== info) infoText.textContent = info;
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

// ── Titlebar ──────────────────────────────────────────────────────────────────
function updateTitlebarProject() {
  if (_projectNameInstance) {
    _projectNameInstance.el.setProjectName(state.currentProject?.name || '');
  }
}

// ── Memory Release ────────────────────────────────────────────────────────────
/**
 * Calls the ComfyUI + LLM unload APIs and updates the MpiMemoryMonitor status badge.
 * @param {boolean} isDeep - If true, performs a deep clean (Ctrl+F5)
 * @param {HTMLElement} monitorEl - The mounted MpiMemoryMonitor element
 */
async function triggerMemoryRelease(isDeep = false, monitorEl) {
  const statusPrefix = isDeep ? 'Deep Cleaning...' : 'Releasing VRAM...';
  if (monitorEl?.showStatus) monitorEl.showStatus(statusPrefix);

  try {
    await unloadModel().catch(err => console.error('[shell] LLM unload failed:', err));

    const comfyRes = await fetch('/comfy/unload', {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({ deep: isDeep }),
    }).catch(() => null);

    if (comfyRes && !comfyRes.ok) {
      await fetch('http://127.0.0.1:8188/extra/unload_models', { method: 'POST' }).catch(() => null);
    }

    if (monitorEl?.showStatus) monitorEl.showStatus(isDeep ? 'Deep Clean ✓' : 'VRAM Released ✓');
  } catch (err) {
    console.error('[shell] Global unload failed:', err);
    if (monitorEl?.showStatus) monitorEl.showStatus('Unload Failed');
  }
}

// ── Window Controls ───────────────────────────────────────────────────────────
function bindWindowControls() {
  const btnMin       = document.getElementById('win-minimize');
  const btnMax       = document.getElementById('win-maximize');
  const btnClose     = document.getElementById('win-close');
  const btnFS        = document.getElementById('win-fullscreen');
  const maxIcon      = document.getElementById('max-icon');
  const restoreIcon  = document.getElementById('restore-icon');
  const fsEnterIcon  = document.getElementById('fullscreen-enter-icon');
  const fsExitIcon   = document.getElementById('fullscreen-exit-icon');

  if (btnMin) btnMin.addEventListener('click', () => {
    if (ipcRenderer) ipcRenderer.send('window-minimize');
  });

  if (btnFS) btnFS.addEventListener('click', () => {
    if (ipcRenderer) ipcRenderer.send('window-fullscreen');
  });

  if (btnMax) btnMax.addEventListener('click', () => {
    if (ipcRenderer) ipcRenderer.send('window-maximize');
  });

  if (btnClose) btnClose.addEventListener('click', () => {
    if (ipcRenderer) ipcRenderer.send('window-close');
  });

  window.addEventListener('keydown', (e) => {
    if (e.key === 'F11') {
      e.preventDefault();
      if (ipcRenderer) ipcRenderer.send('window-fullscreen');
    }
  });

  if (ipcRenderer) {
    ipcRenderer.on('window-fullscreen-change', (event, isFullScreen) => {
      if (fsEnterIcon && fsExitIcon && btnFS) {
        fsEnterIcon.classList.toggle('hide', isFullScreen);
        fsExitIcon.classList.toggle('hide', !isFullScreen);
        btnFS.title = isFullScreen ? 'Exit Full Screen' : 'Full Screen';
      }
    });

    ipcRenderer.on('window-maximize-change', (event, isMaximized) => {
      if (maxIcon && restoreIcon) {
        maxIcon.classList.toggle('hide', isMaximized);
        restoreIcon.classList.toggle('hide', !isMaximized);
      }
    });
  }
}

// ── Modal: New Project ────────────────────────────────────────────────────────
function bindModalEvents() {
  newProjectBtn.addEventListener('click', () => {
    newProjectName.value   = '';
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
    const name   = newProjectName.value.trim() || 'Untitled Project';
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

/**
 * Injects <link> tags for all shared component CSS files to prevent FOUC.
 * @param {string[]} paths - Relative paths to component .css files
 */
function preloadComponentStyles(paths) {
  const head = document.head;
  paths.forEach(path => {
    if (head.querySelector(`link[href="${path}"]`)) return;
    const link = document.createElement('link');
    link.rel   = 'stylesheet';
    link.href  = path;
    head.appendChild(link);
  });
}
