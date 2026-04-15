/**
 * projectUI.js — UI logic for the Landing page project grid and New Project dialog.
 * Cards are rendered using MpiProjectCard. The "+ New Project" trigger uses MpiButton.
 * The creation dialog uses the MpiNewProject compound component.
 */

import { listProjects, createProject, deleteProject, openProject } from '../managers/projectManager.js';
import { MpiProjectCard } from '../components/Compounds/MpiProjectCard/MpiProjectCard.js';
import { MpiOkCancel } from '../components/Compounds/MpiOkCancel/MpiOkCancel.js';
import { MpiNewProject } from '../components/Compounds/MpiNewProject/MpiNewProject.js';
import { MpiButton } from '../components/Primitives/MpiButton/MpiButton.js';
import { MpiSettings } from '../components/Compounds/LandingPages/MpiSettings/MpiSettings.js';
import { MpiHelp } from '../components/Compounds/LandingPages/MpiHelp/MpiHelp.js';
import { MpiAbout } from '../components/Compounds/LandingPages/MpiAbout/MpiAbout.js';

// DOM refs
let projectGrid = null;

/** Lazily created MpiNewProject dialog instance (reused across opens). */
let _newProjectDialog = null;

/** Lazily created delete-confirm dialog instance (reused across opens). */
let _deleteConfirmDialog = null;

/** Unsubscribe fn for the current ok listener (replaced each call). */
let _deleteConfirmUnsub = null;

/** Lazily created landing-action overlay instances (reused across opens). */
let _settingsOverlay = null;
let _helpOverlay     = null;
let _aboutOverlay    = null;

/**
 * Initializes the project management UI: trigger button and grid loading.
 */
export function initProjectUI() {
  projectGrid = document.getElementById('projectGrid');

  // ── Landing action buttons (top-right of header) ──────────────────────────
  const actionsSlot = document.getElementById('landingActions');
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
  const btnSlot = document.getElementById('newProjectBtn');
  if (btnSlot) {
    const triggerBtn = MpiButton.mount(btnSlot, {
      text: '+ New Project',
      variant: 'primary',
      size: 'lg',
    });

    triggerBtn.on('click', () => {
      if (!_newProjectDialog) {
        _newProjectDialog = MpiNewProject.mount(document.createElement('div'));
        _newProjectDialog.on('create', async ({ name, location }) => {
          try {
            const project = await createProject(name || 'Untitled Project', location);
            openProject(project);
          } catch (err) {
            console.error('[projectUI] createProject failed:', err);
            alert('Could not create project: ' + err.message);
          }
        });
      }
      _newProjectDialog.el.show();
    });
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
 * @param {Function} onConfirm - Called only when user confirms.
 */
function _showDeleteConfirm(projectName, onConfirm) {
  if (!_deleteConfirmDialog) {
    _deleteConfirmDialog = MpiOkCancel.mount(document.createElement('div'), {
      title: 'Delete Project',
      text: `Are you sure you want to delete this project? This cannot be undone.`,
      okLabel: 'Delete',
      cancelLabel: 'Keep it',
    });
  }
  // Replace the ok listener with the fresh onConfirm
  if (_deleteConfirmUnsub) { _deleteConfirmUnsub(); _deleteConfirmUnsub = null; }
  _deleteConfirmUnsub = _deleteConfirmDialog.on('ok', () => onConfirm());
  _deleteConfirmDialog.el.show();
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

  card.on('click', () => openProject(project));

  card.on('delete', () => {
    _showDeleteConfirm(project.name, async () => {
      try {
        await deleteProject(project.folderPath);
        loadProjectGrid();
      } catch (err) {
        window.MpiAlert('Could not delete project: ' + err.message);
      }
    });
  });

  return card.el;
}
