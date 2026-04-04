/**
 * projectUI.js — UI logic for the Landing page project grid and New Project modal.
 */

import { state } from '../state.js';
import { listProjects, createProject, deleteProject, openProject, chooseFolder } from '../projectManager.js';

// DOM refs (kept at module level to simplify event binding)
let projectGrid = null;
let newProjectModal = null;
let newProjectName = null;
let newProjectFolder = null;

/**
 * Initializes the project management UI: modal events and grid loading.
 */
export function initProjectUI() {
  projectGrid       = document.getElementById('projectGrid');
  newProjectModal   = document.getElementById('newProjectModal');
  newProjectName    = document.getElementById('newProjectName');
  newProjectFolder  = document.getElementById('newProjectFolder');

  const newProjectBtn       = document.getElementById('newProjectBtn');
  const closeNewProjectModal = document.getElementById('closeNewProjectModal');
  const cancelNewProjectBtn  = document.getElementById('cancelNewProjectBtn');
  const confirmNewProjectBtn = document.getElementById('confirmNewProjectBtn');
  const chooseFolderBtn      = document.getElementById('chooseFolderBtn');

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

function _buildProjectCard(project) {
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

  card.addEventListener('click', (e) => {
    if (e.target.closest('.project-card-delete')) return;
    openProject(project);
  });

  const delBtn = card.querySelector('.project-card-delete');
  delBtn.addEventListener('click', async (e) => {
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

function escapeHtml(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}
