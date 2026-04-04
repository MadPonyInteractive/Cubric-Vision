import { state } from '../state.js';

/**
 * Fetches the current list of models from the backend and updates global state.
 */
export async function refreshModelRegistry() {
  try {
    const res = await fetch('/llm/models');
    const data = await res.json();
    if (data.success) {
      state.allModels = data.models;
      return true;
    }
    return false;
  } catch (err) {
    console.error('Failed to refresh model registry:', err);
    return false;
  }
}

/**
 * Checks if a specific tool has at least one of its required models downloaded locally.
 * Returns the first available model if found, otherwise null.
 */
export function getFirstAvailableModel(toolName) {
  if (!state.allModels) return null;
  return state.allModels.find(m => m.tools.includes(toolName) && m.exists) || null;
}

/**
 * Returns a model by its ID.
 */
export function getModelById(modelId) {
  if (!state.allModels) return null;
  return state.allModels.find(m => m.id === modelId) || null;
}

/**
 * Returns all models associated with a specific tool.
 */
export function getRequiredModelsForTool(toolName) {
  if (!state.allModels) return [];
  return state.allModels.filter(m => m.tools.includes(toolName));
}

/**
 * Initiates model download via the backend.
 */
export async function downloadModel(modelId, onProgress) {
  try {
    const res = await fetch('/llm/download', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ modelId })
    });

    const data = await res.json();
    if (res.ok) {
      await refreshModelRegistry();
      return { success: true };
    }
    return { success: false, error: data.error || 'Server error' };
  } catch (err) {
    console.error('Download failed:', err);
    return { success: false, error: 'Connection lost' };
  }
}

/**
 * Deletes a local model file via the backend.
 */
export async function deleteModel(modelId) {
  try {
    const res = await fetch('/llm/delete', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ modelId })
    });
    if (res.ok) {
      await refreshModelRegistry();
      return true;
    }
    return false;
  } catch (err) {
    console.error('Delete failed:', err);
    return false;
  }
}
