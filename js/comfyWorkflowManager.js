import { state } from './state.js';

/**
 * Fetches the current list of ComfyUI workflows from the backend and updates global state.
 */
export async function refreshComfyWorkflowRegistry() {
  try {
    const res = await fetch('/comfy/workflows');
    const data = await res.json();
    if (data.success) {
      state.allComfyWorkflows = data.workflows; // Use a more descriptive name
      return true;
    }
    return false;
  } catch (err) {
    console.error('Failed to refresh ComfyUI workflow registry:', err);
    return false;
  }
}

/**
 * Initiates sequential model download for a workflow.
 */
export async function downloadWorkflowDependencies(workflowId, onProgress) {
  try {
    const wf = (state.allComfyWorkflows || []).find(w => w.id === workflowId);
    if (!wf) throw new Error('Workflow not found');

    const missing = wf.dependencies.filter(d => !d.exists);
    for (let i = 0; i < missing.length; i++) {
        const dep = missing[i];
        state.downloadingWorkflows[workflowId] = { name: dep.name, current: i + 1, total: missing.length };
        if (onProgress) onProgress(dep.name, i + 1, missing.length);

        const res = await fetch('/comfy/model/download', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ modelId: dep.id })
        });
        if (!res.ok) {
            delete state.downloadingWorkflows[workflowId];
            throw new Error(`Download failed for ${dep.name}`);
        }
    }

    // Phase 3.8: Mark as installed in backend
    await fetch('/comfy/workflow/install-complete', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: workflowId })
    });

    delete state.downloadingWorkflows[workflowId];
    await refreshComfyWorkflowRegistry();
    return true;
  } catch (err) {
    console.error('Workflow download failed:', err);
    delete state.downloadingWorkflows[workflowId];
    return false;
  }
}

/**
 * Deletes a workflow using smart garbage collection.
 */
export async function deleteWorkflow(workflowId, deleteModels = true) {
  try {
    const res = await fetch('/comfy/workflow/delete', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: workflowId, deleteModels })
    });
    if (res.ok) {
        await refreshComfyWorkflowRegistry();
        return true;
    }
    return false;
  } catch (err) {
    console.error('Workflow delete failed:', err);
    return false;
  }
}

export function getWorkflowStatus(workflowId) {
    const wf = (state.allComfyWorkflows || []).find(w => w.id === workflowId);
    return wf ? wf.installed : false;
}

/**
 * Lists files in a ComfyUI subdirectory (models/checkpoints, etc.)
 */
export async function listComfyFiles(subDir) {
  try {
    const res = await fetch(`/comfy/list-files?subDir=${encodeURIComponent(subDir)}`);
    const data = await res.json();
    return data.success ? data.files : [];
  } catch (err) {
    console.error(`Failed to list ComfyUI files for ${subDir}:`, err);
    return [];
  }
}

/**
 * Returns the default workflow ID for a given tool name based on its type.
 */
export function getDefaultWorkflowId(toolName) {
  const workflows = state.allComfyWorkflows || [];
  const expectedType = (toolName === 'generator') ? 'image_generation' : 
                       (toolName === 'upscaler') ? 'upscaler' : 'detailer';
  const match = workflows.find(wf => wf.type === expectedType);
  return match ? match.id : null;
}
