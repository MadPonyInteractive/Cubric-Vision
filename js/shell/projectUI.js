/**
 * projectUI.js — UI logic for the Landing page project grid and New Project modal.
 * Cards are rendered using the MpiProjectCard compound component.
 */

import { state } from '../state.js';
import { listProjects, createProject, deleteProject, openProject, chooseFolder } from '../managers/projectManager.js';
import { MpiProjectCard } from '../components/Compounds/MpiProjectCard/MpiProjectCard.js';
import { MpiOkCancel } from '../components/Compounds/MpiOkCancel/MpiOkCancel.js';

// DOM refs (kept at module level to simplify event binding)
let projectGrid = null;
let newProjectModal = null;
let newProjectName = null;
let newProjectFolder = null;

/**
 * Initializes the project management UI: modal events and grid loading.
 */
export function initProjectUI() {
  projectGrid = document.getElementById('projectGrid');
  newProjectModal = document.getElementById('newProjectModal');
  newProjectName = document.getElementById('newProjectName');
  newProjectFolder = document.getElementById('newProjectFolder');

  const newProjectBtn = document.getElementById('newProjectBtn');
  const closeNewProjectModal = document.getElementById('closeNewProjectModal');
  const cancelNewProjectBtn = document.getElementById('cancelNewProjectBtn');
  const confirmNewProjectBtn = document.getElementById('confirmNewProjectBtn');
  const chooseFolderBtn = document.getElementById('chooseFolderBtn');

  if (newProjectBtn) {
    newProjectBtn.addEventListener('click', () => {
      newProjectName.value = '';
      newProjectFolder.value = '';
      newProjectModal.classList.remove('hide');
      setTimeout(() => newProjectName.focus(), 50);
    });
  }

  if (closeNewProjectModal) closeNewProjectModal.addEventListener('click', () => newProjectModal.classList.add('hide'));
  if (cancelNewProjectBtn) cancelNewProjectBtn.addEventListener('click', () => newProjectModal.classList.add('hide'));

  if (newProjectModal) {
    newProjectModal.addEventListener('click', (e) => {
      if (e.target === newProjectModal) newProjectModal.classList.add('hide');
    });
  }

  if (chooseFolderBtn) {
    chooseFolderBtn.addEventListener('click', async () => {
      chooseFolderBtn.classList.add('loading');
      const chosen = await chooseFolder();
      chooseFolderBtn.classList.remove('loading');
      if (chosen) newProjectFolder.value = chosen;
    });
  }

  if (confirmNewProjectBtn) {
    confirmNewProjectBtn.addEventListener('click', _handleConfirmNewProject);
  }

  if (newProjectName) {
    newProjectName.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') confirmNewProjectBtn.click();
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

async function _handleConfirmNewProject() {
  const confirmBtn = document.getElementById('confirmNewProjectBtn');
  const name = newProjectName.value.trim() || 'Untitled Project';
  const folder = newProjectFolder.value.trim() || null;

  if (confirmBtn) confirmBtn.classList.add('loading');
  try {
    const project = await createProject(name, folder);
    newProjectModal.classList.add('hide');
    openProject(project);
  } catch (err) {
    alert('Could not create project: ' + err.message);
  } finally {
    if (confirmBtn) confirmBtn.classList.remove('loading');
  }
}
