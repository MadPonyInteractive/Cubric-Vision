/**
 * projectUI.js — UI logic for the Landing page project grid and New Project dialog.
 * Cards are rendered using MpiProjectCard. The "+ New Project" trigger uses MpiButton.
 * The creation dialog uses the MpiNewProject compound component.
 */

import { listProjects, createProject, deleteProject, openProject, addProjectByFolder } from '../services/projectService.js';
import { navigate, PAGE_GALLERY } from '../router.js';
import { Events } from '../events.js';
import { clientLogger } from '../services/clientLogger.js';
import { gid } from '../utils/dom.js';
import { MpiProjectCard } from '../components/Compounds/MpiProjectCard/MpiProjectCard.js';
import { MpiOkCancel } from '../components/Compounds/MpiOkCancel/MpiOkCancel.js';
import { MpiNewProject } from '../components/Compounds/MpiNewProject/MpiNewProject.js';
import { MpiButton } from '../components/Primitives/MpiButton/MpiButton.js';
import { MpiProjectDropOverlay } from '../components/Primitives/MpiProjectDropOverlay/MpiProjectDropOverlay.js';
import { MpiSettings } from '../components/Compounds/LandingPages/MpiSettings/MpiSettings.js';
import { MpiHelp } from '../components/Compounds/LandingPages/MpiHelp/MpiHelp.js';
import { MpiAbout } from '../components/Compounds/LandingPages/MpiAbout/MpiAbout.js';

// DOM refs
let projectGrid = null;

// MpiNewProject is NOT a singleton — fresh mount per open.
// factory.on() accumulates listeners with no unsub, so reusing would stack handlers.

// Delete-confirm dialog is NOT a singleton — a fresh instance is created per
// confirmation. The factory's .on() accumulates listeners with no unsub, so
// reusing a singleton would fire all prior handlers on every confirmation.

/** Lazily created landing-action overlay instances (reused across opens). */
let _settingsOverlay = null;
let _helpOverlay     = null;
let _aboutOverlay    = null;

/**
 * Initializes the project management UI: trigger button and grid loading.
 */
export function initProjectUI() {
  projectGrid = gid('projectGrid');

  // ── Landing action buttons (top-right of header) ──────────────────────────
  const actionsSlot = gid('landingActions');
  if (actionsSlot) {
    const defs = [
      { icon: 'settings', label: 'Settings', handler: () => {
          if (!_settingsOverlay) _settingsOverlay = MpiSettings.mount(document.createElement('div'));
          _settingsOverlay.el.show();
      }},
      { icon: 'help',     label: 'Help',     handler: () => {
          if (!_helpOverlay) _helpOverlay = MpiHelp.mount(document.createElement('div'));
          _helpOverlay.el.show();
      }},
      { icon: 'info',     label: 'About',    handler: () => {
          if (!_aboutOverlay) _aboutOverlay = MpiAbout.mount(document.createElement('div'));
          _aboutOverlay.el.show();
      }},
    ];

    defs.forEach(({ icon, label, handler }) => {
      const slot = document.createElement('div');
      actionsSlot.appendChild(slot);
      const btn = MpiButton.mount(slot, {
        icon,
        label,
        labelPosition: 'right',
        variant: 'ghost',
        size: 'sm',
      });
      btn.on('click', handler);
    });
  }

  // ── New Project button ─────────────────────────────────────────────────────
  const btnSlot = gid('newProjectBtn');
  if (btnSlot) {
    const triggerBtn = MpiButton.mount(btnSlot, {
      text: '+ New Project',
      variant: 'primary',
      size: 'lg',
    });

    triggerBtn.on('click', () => {
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
    });
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
 * Loads and renders the projects into the grid.
 */
export async function loadProjectGrid() {
  if (!projectGrid) return;
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
    projects.forEach(p => projectGrid.appendChild(_buildProjectCard(p)));
  } catch (err) {
    console.error('[shell/projectUI] loadProjectGrid failed:', err);
    projectGrid.innerHTML = `<div class="projects-empty"><strong>Could not load projects.</strong></div>`;
  }
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
 * Builds a single project card using the MpiProjectCard compound component.
 * @param {Object} project - Project data from projectManager.
 * @returns {HTMLElement} Mounted card wrapper element.
 */
function _buildProjectCard(project) {
  const date = new Date(project.updatedAt);
  const dateStr = date.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });

  /** @type {import('../components/Compounds/MpiProjectCard/MpiProjectCard.js').MpiProjectCardProps} */
  const props = {
    title: project.name,
    date: dateStr,
    media: project.recentThumbnail ? { type: 'image', src: project.recentThumbnail } : null,
  };

  const wrapper = document.createElement('div');
  const card = MpiProjectCard.mount(wrapper, props);

  card.on('click', async () => {
    await openProject(project);
    navigate(PAGE_GALLERY);
  });

  card.on('delete', () => {
    _showDeleteConfirm(project.name, async ({ deleteFiles }) => {
      try {
        await deleteProject(project, { deleteFiles });
        loadProjectGrid();
      } catch (err) {
        window.MpiAlert('Could not delete project: ' + err.message);
      }
    });
  });

  return card.el;
}
