import { state } from '../state.js';
import { toggleTheme } from '../themeManager.js';

export function initSettingsPage() {
  const modelList = document.getElementById('settingsModelList');
  if (modelList) {
    loadModelStatus();
  }

  const toggleThemeControl = document.getElementById('settingsToggleTheme');
  if (toggleThemeControl) {
    toggleThemeControl.checked = state.isLightMode;
    toggleThemeControl.addEventListener('change', () => {
      toggleTheme(toggleThemeControl.checked);
    });
  }

  const ollamaUrl = document.getElementById('settingsOllamaUrl');
  const comfyUrl = document.getElementById('settingsComfyUrl');
  const comfyRootPath = document.getElementById('settingsComfyRootPath');
  const browseComfyBtn = document.getElementById('settingsBrowseComfyBtn');

  if (ollamaUrl) {
    ollamaUrl.value = localStorage.getItem('mpi_ollama_url') || 'http://localhost:8080';
    ollamaUrl.addEventListener('change', () => localStorage.setItem('mpi_ollama_url', ollamaUrl.value));
  }
  if (comfyUrl) {
    comfyUrl.value = localStorage.getItem('mpi_comfy_url') || 'http://localhost:8188';
    comfyUrl.addEventListener('change', () => localStorage.setItem('mpi_comfy_url', comfyUrl.value));
  }
  
  const autoStartComfy = document.getElementById('settingsAutoStartComfy');
  if (autoStartComfy) {
    autoStartComfy.checked = localStorage.getItem('mpi_auto_start_comfy') === 'true';
    autoStartComfy.addEventListener('change', () => {
      localStorage.setItem('mpi_auto_start_comfy', autoStartComfy.checked);
    });
  }

  if (comfyRootPath) {
    // Stage 12.4 Fix: Clear if it was set to a temp path or as requested to point to internal engine
    const currentPath = localStorage.getItem('mpi_comfy_root_path') || '';
    if (currentPath.toLowerCase().includes('temp') || currentPath.toLowerCase().includes('tmp')) {
        localStorage.removeItem('mpi_comfy_root_path');
        comfyRootPath.value = '';
        setComfyPath('');
    } else {
        comfyRootPath.value = currentPath;
    }
    const syncComfyPath = () => {
        if (comfyRootPath.value !== localStorage.getItem('mpi_comfy_root_path')) {
            setComfyPath(comfyRootPath.value);
        }
    };
    comfyRootPath.addEventListener('change', syncComfyPath);
    comfyRootPath.addEventListener('blur', syncComfyPath);
    comfyRootPath.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') syncComfyPath();
    });
  }

  if (browseComfyBtn) {
    browseComfyBtn.addEventListener('click', async () => {
      try {
        const res = await fetch('/choose-folder', { method: 'POST' });
        const data = await res.json();
        if (!data.cancelled && data.path) {
          comfyRootPath.value = data.path;
          setComfyPath(data.path);
        }
      } catch (err) {
        console.error('Failed to choose folder:', err);
      }
    });
  }
}

async function setComfyPath(path) {
  localStorage.setItem('mpi_comfy_root_path', path);
  state.comfyRootPath = path;
  
  try {
    const res = await fetch('/comfy/set-path', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ path })
    });
    if (data.success) {
      const { refreshComfyWorkflowRegistry } = await import('../comfyModelManager.js');
      await refreshComfyWorkflowRegistry();
    } else {
      console.error('Failed to sync ComfyUI path with backend:', data.error);
    }
  } catch (err) {
    console.error('Error syncing ComfyUI path:', err);
  }
}

async function loadModelStatus() {
  const modelList = document.getElementById('settingsModelList');
  if (!modelList) return;

  try {
    const res = await fetch('/llm/models');
    const data = await res.json();
    if (data.success) {
      modelList.innerHTML = '';
      data.models.forEach(model => {
        modelList.appendChild(createModelCard(model));
      });
    } else {
      modelList.innerHTML = '<p class="error">Failed to load local models.</p>';
    }
  } catch (err) {
    console.error('Error loading models:', err);
    modelList.innerHTML = '<p class="error">Error connecting to local backend.</p>';
  }
}

function createModelCard(model) {
  const card = document.createElement('div');
  card.className = 'model-card';
  card.innerHTML = `
    <div class="model-info-main">
      <div class="model-name">${model.name}</div>
      <div class="model-meta">
        <span>📦 ${model.size}</span>
        <span>🧠 ${model.vram} VRAM</span>
        <span>🛠️ ${model.tools.join(', ')}</span>
      </div>
    </div>
    <div class="model-actions">
      <div class="model-status-badge ${model.exists ? 'local' : ''}">
        ${model.exists ? 'Local' : 'Remote'}
      </div>
      ${!model.exists ? `
        <button class="btn primary small download-btn" data-id="${model.id}">
          Download
        </button>
      ` : `
        <button class="btn secondary small delete-btn" data-id="${model.id}" disabled>
          Installed
        </button>
      `}
    </div>
  `;

  const downloadBtn = card.querySelector('.download-btn');
  if (downloadBtn) {
    downloadBtn.addEventListener('click', () => startModelDownload(model.id, downloadBtn, card));
  }

  return card;
}

async function startModelDownload(modelId, btn, card) {
  btn.disabled = true;
  btn.textContent = 'Starting...';

  const actions = card.querySelector('.model-actions');
  const progressContainer = document.createElement('div');
  progressContainer.className = 'download-progress-container';
  progressContainer.innerHTML = '<div class="download-progress-bar"></div>';
  
  // Replace button with progress
  btn.style.display = 'none';
  actions.appendChild(progressContainer);
  const progressBar = progressContainer.querySelector('.download-progress-bar');

  try {
    const res = await fetch('/llm/download', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ modelId })
    });

    if (res.ok) {
      // In a real impl with WebSockets, we'd update progressBar
      // Since we simulate for Stage 7, let's just wait for completion
      progressBar.style.width = '100%';
      setTimeout(() => {
        loadModelStatus();
      }, 1000);
    } else {
      alert('Download failed');
      loadModelStatus();
    }
  } catch (err) {
    console.error('Download error:', err);
    alert('Error starting download');
    loadModelStatus();
  }
}
