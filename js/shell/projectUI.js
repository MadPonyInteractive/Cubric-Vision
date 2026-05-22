/**
 * projectUI.js — UI logic for the Landing page project grid and New Project dialog.
 * Cards are rendered using MpiProjectCard. The "+ New Project" trigger uses MpiButton.
 * The creation dialog uses the MpiNewProject compound component.
 */

import { listProjects, createProject, deleteProject, openProject, addProjectByFolder } from '../services/projectService.js';
import { fetchStats } from '../services/projectStatsService.js';
import { navigate, PAGE_GALLERY } from '../router.js';
import { Events } from '../events.js';
import { clientLogger } from '../services/clientLogger.js';
import { formatBytes } from '../utils/formatBytes.js';
import { gid } from '../utils/dom.js';
import { APP_VERSION } from '../core/appVersion.js';
import { MpiProjectCard } from '../components/Compounds/MpiProjectCard/MpiProjectCard.js';
import { MpiOkCancel } from '../components/Compounds/MpiOkCancel/MpiOkCancel.js';
import { MpiNewProject } from '../components/Compounds/MpiNewProject/MpiNewProject.js';
import { MpiButton } from '../components/Primitives/MpiButton/MpiButton.js';
import { MpiContextMenu } from '../components/Compounds/MpiContextMenu/MpiContextMenu.js';
import { MpiProjectDropOverlay } from '../components/Primitives/MpiProjectDropOverlay/MpiProjectDropOverlay.js';
import { MpiSettings } from '../components/Compounds/LandingPages/MpiSettings/MpiSettings.js';
import { MpiHelp } from '../components/Compounds/LandingPages/MpiHelp/MpiHelp.js';
import { MpiAbout } from '../components/Compounds/LandingPages/MpiAbout/MpiAbout.js';
import { MpiModelManager } from '../components/Compounds/LandingPages/MpiModelManager/MpiModelManager.js';
import '../components/Compounds/MpiSlideOver/MpiSlideOver.js';

// DOM refs
let projectGrid = null;

// Aborts in-flight per-row stats fetches when the grid rebuilds, so late
// responses don't write into rows that no longer exist.
let _statsBatchAC = null;

// MpiNewProject is NOT a singleton — fresh mount per open.
// factory.on() accumulates listeners with no unsub, so reusing would stack handlers.

// Delete-confirm dialog is NOT a singleton — a fresh instance is created per
// confirmation. The factory's .on() accumulates listeners with no unsub, so
// reusing a singleton would fire all prior handlers on every confirmation.

/**
 * Initializes the project management UI: trigger button and grid loading.
 */
export function initProjectUI() {
  projectGrid = gid('projectGrid');

  // ── Hero version label ─────────────────────────────────────────────────────
  const versionEl = gid('heroVersion');
  if (versionEl) versionEl.textContent = `Cubric Vision · v${APP_VERSION}`;

  // ── Hero nav: plain text links (Settings · Help · About) ─────────────────
  const navSlot = gid('landingActions');
  if (navSlot) {
    const defs = [
      { label: 'Models',   handler: () => Events.emit('slide-over:open', { title: 'Models',   component: MpiModelManager }) },
      { label: 'Settings', handler: () => Events.emit('slide-over:open', { title: 'Settings', component: MpiSettings }) },
      { label: 'Help',     handler: () => Events.emit('slide-over:open', { title: 'Help',     component: MpiHelp     }) },
      { label: 'About',    handler: () => Events.emit('slide-over:open', { title: 'About',    component: MpiAbout    }) },
    ];
    defs.forEach(({ label, handler }) => {
      const a = document.createElement('a');
      a.className = 'mpi-landing__hero-nav-item';
      a.textContent = label;
      a.addEventListener('click', handler);
      navSlot.appendChild(a);
    });
  }

  // ── "+ New project" CTA in hero ────────────────────────────────────────────
  const ctaSlot = gid('newProjectBtn');
  if (ctaSlot) {
    const triggerBtn = MpiButton.mount(ctaSlot, {
      text: '+ New project',
      variant: 'primary',
      size: 'md',
    });
    triggerBtn.on('click', _openNewProjectDialog);
  }

  // ── "Open folder" — hero CTA (secondary) + picker footer ─────────────────
  const _openFolder = async () => {
    try {
      const { ipcRenderer } = window.require('electron');
      const result = await ipcRenderer.invoke('choose-folder');
      if (!result?.cancelled && result?.path) await handleProjectDrop(result.path);
    } catch (err) {
      clientLogger.error('projectUI', 'openFolder failed', err);
    }
  };

  if (typeof window.require === 'function') {
    const heroFolderSlot = gid('openFolderHeroBtn');
    if (heroFolderSlot) {
      const heroFolderBtn = MpiButton.mount(heroFolderSlot, {
        text: 'Open folder',
        variant: 'outline',
        size: 'md',
      });
      heroFolderBtn.on('click', _openFolder);
    }

    const pickerFolderSlot = gid('openFolderBtn');
    if (pickerFolderSlot) {
      const pickerFolderBtn = MpiButton.mount(pickerFolderSlot, {
        text: 'Open folder…',
        variant: 'outline',
        size: 'md',
      });
      pickerFolderBtn.on('click', _openFolder);
    }
  }

  // ── Drag-and-drop project import (Electron only) ──────────────────────────
  // Feature-detect window.require — in plain browser dev mode webUtils is
  // unavailable and the feature cannot deliver absolute paths, so skip mount.
  if (typeof window.require === 'function') {
    const landingEl = gid('page-landing');
    if (landingEl) {
      const dropOverlay = MpiProjectDropOverlay.mount(document.createElement('div'), {
        onDrop: ({ folderPath }) => { handleProjectDrop(folderPath); },
      });
      landingEl.appendChild(dropOverlay.el);

      // Scope drag listeners to #page-landing — navigation toggles its
      // display, so events only fire while the landing page is visible.
      let _dragCounter = 0;
      const _isFileDrag = (e) => e.dataTransfer?.types?.includes('Files');

      landingEl.addEventListener('dragenter', (e) => {
        if (!_isFileDrag(e)) return;
        _dragCounter++;
        dropOverlay.el.show();
      });
      landingEl.addEventListener('dragleave', (e) => {
        if (!_isFileDrag(e)) return;
        if (_dragCounter > 0 && --_dragCounter === 0) dropOverlay.el.hide();
      });
      landingEl.addEventListener('dragover', (e) => { if (_isFileDrag(e)) e.preventDefault(); });
      landingEl.addEventListener('drop', () => {
        _dragCounter = 0;
        dropOverlay.el.hide();
      });
      // initProjectUI runs once at boot — no teardown needed.
    }
  }
}

/**
 * Validate a dropped project folder, register its parent in extra paths,
 * and refresh the grid so a card appears. Does NOT open the project.
 */
async function handleProjectDrop(folderPath) {
  try {
    await addProjectByFolder(folderPath);
    await loadProjectGrid();
  } catch (err) {
    clientLogger.error('projectUI', 'drop import failed', err);
    Events.emit('ui:error', { title: 'Could not import project', message: err.message });
  }
}

/**
 * Loads and renders the projects as Stage picker rows.
 */
export async function loadProjectGrid() {
  if (!projectGrid) return;
  // Cancel any in-flight per-row stats fetches from the previous render.
  if (_statsBatchAC) _statsBatchAC.abort();
  _statsBatchAC = new AbortController();
  projectGrid.innerHTML = '<div class="mpi-landing__loading"><div class="spinner"></div></div>';
  try {
    const projects = await listProjects();
    const countEl = gid('pickerCount');
    if (countEl) countEl.textContent = projects.length > 0 ? `Recent · ${String(projects.length).padStart(2, '0')}` : '';
    if (projects.length === 0) {
      projectGrid.innerHTML = `
        <div class="mpi-landing__empty">
          <img class="mpi-landing__empty-mascot" src="assets/mascot/greet.png" alt="">
          <strong>No projects yet</strong>
          <p>Click "+ New project" to create your first AI project.</p>
        </div>`;
      return;
    }
    projectGrid.innerHTML = '';
    projects.forEach(p => projectGrid.appendChild(_buildProjectRow(p)));
  } catch (err) {
    clientLogger.error('projectUI', 'loadProjectGrid failed', err);
    projectGrid.innerHTML = `
      <div class="mpi-landing__empty">
        <img class="mpi-landing__empty-mascot" src="assets/mascot/greet.png" alt="">
        <strong>No projects yet</strong>
        <p>Click "+ New project" to create your first AI project.</p>
      </div>`;
  }
}

function _openNewProjectDialog() {
  const newProjectDialog = MpiNewProject.mount(document.createElement('div'));
  newProjectDialog.on('create', async ({ name, location }) => {
    try {
      const project = await createProject(name || 'Untitled Project', location);
      await openProject(project);
      navigate(PAGE_GALLERY);
    } catch (err) {
      clientLogger.error('projectUI', 'createProject failed', err);
      window.MpiAlert('Could not create project: ' + err.message);
    }
  });
  newProjectDialog.el.show();
}

/**
 * Shows an MpiOkCancel confirmation dialog for project deletion.
 * The component self-manages the backdrop, portal, and overlay queue.
 * @param {string} projectName
 * @param {Function} onConfirm - Called with { deleteFiles: boolean } when user confirms.
 */
function _showDeleteConfirm(projectName, onConfirm) {
  // Fresh mount per confirmation — factory.on() accumulates listeners with no
  // unsub mechanism, so a singleton would fire all prior handlers on each ok.
  const dialog = MpiOkCancel.mount(document.createElement('div'), {
    title: 'Delete Project',
    text: `Are you sure you want to delete "${projectName}"?`,
    okLabel: 'Delete',
    cancelLabel: 'Keep it',
    checkbox: { label: 'Also delete files from disk', checked: true },
  });
  dialog.on('ok', ({ checkboxChecked }) => {
    onConfirm({ deleteFiles: !!checkboxChecked });
  });
  dialog.el.show();
}

/**
 * Builds a Stage picker row for one project.
 * Layout: thumbnail | name + date | asset count + size
 * @param {Object} project
 * @returns {HTMLElement}
 */
function _buildProjectRow(project) {
  const date = new Date(project.updatedAt);
  const dateStr = date.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });

  const row = document.createElement('div');
  row.className = 'mpi-landing__pl-row';

  // Thumbnail (image or video — first frame static, plays on row hover)
  const thumb = document.createElement('div');
  thumb.className = 'mpi-landing__pl-thumb' + (project.recentThumbnail ? '' : ' mpi-landing__pl-thumb--empty');
  if (project.recentThumbnail) {
    if (project.recentThumbnailType === 'video') {
      const video = document.createElement('video');
      video.src = project.recentThumbnail;
      video.muted = true;
      video.loop = true;
      video.playsInline = true;
      video.preload = 'metadata';
      thumb.appendChild(video);
    } else {
      const img = document.createElement('img');
      img.src = project.recentThumbnail;
      img.alt = project.name;
      thumb.appendChild(img);
    }
  }

  // Meta
  const meta = document.createElement('div');
  meta.className = 'mpi-landing__pl-meta';

  const h4 = document.createElement('h4');
  h4.textContent = project.name;
  meta.appendChild(h4);

  const sub = document.createElement('span');
  sub.className = 'mpi-landing__pl-sub';
  sub.textContent = dateStr;
  meta.appendChild(sub);

  // Count — placeholder until /project-stats resolves
  const ct = document.createElement('div');
  ct.className = 'mpi-landing__pl-count';
  const n = document.createElement('span');
  n.className = 'mpi-landing__pl-n';
  n.textContent = '—';
  const sizeNode = document.createTextNode('assets');
  ct.appendChild(n);
  ct.appendChild(sizeNode);

  row.appendChild(thumb);
  row.appendChild(meta);
  row.appendChild(ct);

  if (project.recentThumbnailType === 'video') {
    const video = thumb.querySelector('video');
    if (video) {
      row.addEventListener('mouseenter', () => video.play().catch(() => {}));
      row.addEventListener('mouseleave', () => {
        video.pause();
        video.currentTime = 0;
      });
    }
  }

  // Live stats fetch — independent per row, aborted on grid rebuild.
  const signal = _statsBatchAC?.signal;
  fetchStats({ projectId: project.id, folderPath: project.folderPath, signal })
    .then(({ count, bytes }) => {
      if (signal?.aborted) return;
      n.textContent = String(count);
      sizeNode.textContent = bytes > 0 ? `assets · ${formatBytes(bytes)}` : 'assets';
    })
    .catch(err => {
      if (err?.name !== 'AbortError') clientLogger.warn('projectUI', 'fetchStats failed', err);
    });

  row.addEventListener('click', async () => {
    await openProject(project);
    navigate(PAGE_GALLERY);
  });

  row.addEventListener('contextmenu', (e) => {
    e.preventDefault();
    MpiContextMenu.show({
      x: e.clientX,
      y: e.clientY,
      items: [
        { key: 'delete', icon: 'trash', label: 'Delete project', danger: true },
      ],
      onSelect: (key) => {
        if (key !== 'delete') return;
        _showDeleteConfirm(project.name, async ({ deleteFiles }) => {
          try {
            await deleteProject(project, { deleteFiles });
            loadProjectGrid();
          } catch (err) {
            window.MpiAlert('Could not delete project: ' + err.message);
          }
        });
      },
    });
  });

  return row;
}
