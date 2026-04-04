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

// DOM refs
let projectGrid = null;

/** Lazily created MpiNewProject dialog instance (reused across opens). */
let _newProjectDialog = null;

/**
 * Initializes the project management UI: trigger button and grid loading.
 */
export function initProjectUI() {
  projectGrid = document.getElementById('projectGrid');

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
  const dialog = MpiOkCancel.mount(document.createElement('div'), {
    title: 'Delete Project',
    text: `Are you sure you want to delete "${projectName}"? This cannot be undone.`,
    okLabel: 'Delete',
    cancelLabel: 'Keep it',
  });
  dialog.on('ok', () => onConfirm());
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
