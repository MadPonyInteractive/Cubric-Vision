import { state } from '../state.js';
import { refreshComfyWorkflowRegistry, downloadWorkflowDependencies, deleteWorkflow, getWorkflowStatus } from '../comfyModelManager.js';

const modal = document.getElementById('modelManagerModal');
const list = document.getElementById('modelManagerList');
const closeX = document.getElementById('closeModelManagerModal');
const closeBtn = document.getElementById('closeModelManagerBtn');

let onComplete = null;

export function initModelManagerModal() {
    if (!modal) return;
    const close = () => modal.classList.add('hide');
    closeX?.addEventListener('click', close);
    closeBtn?.addEventListener('click', close);
    modal.addEventListener('click', (e) => { if (e.target === modal) close(); });
}

export async function openModelManager(workflowId, callback, toolName) {
    onComplete = callback;
    modal.classList.remove('hide');
    list.innerHTML = `<div class="spinner"></div><div>Loading workflows...</div>`;
    await refreshComfyWorkflowRegistry();
    renderList(workflowId, toolName);
}

function renderList(targetId, toolName) {
    list.innerHTML = '';
    let workflows = state.allComfyWorkflows || [];

    if (toolName) {
        const expectedType = (toolName === 'generator') ? 'image_generation' : 'detailer';
        workflows = workflows.filter(wf => wf.type === expectedType);
    }

    if (workflows.length === 0) {
        list.innerHTML = '<p>No workflows defined in configuration.</p>';
        return;
    }

    workflows.forEach(wf => {
        const card = document.createElement('div');
        card.className = 'model-provision-card';
        card.innerHTML = `
            <div class="model-provision-header">
                <span class="model-provision-name">${wf.name}</span>
                <span class="field-hint">${(wf.totalSizeOnDisk / (1024**3)).toFixed(2)}GB installed</span>
            </div>
            <div class="model-provision-description">${wf.description || ''}</div>
            <div class="model-provision-info">🧠 ${wf.maxVramRequired} VRAM REQUIRED</div>
            <div class="model-status-row" id="status-${wf.id}">
                ${wf.isInstalled ? `
                    <div class="model-status-badge local">INSTALLED</div>
                    <button class="btn secondary small delete-btn">Uninstall Workflow</button>
                ` : `
                    <div style="display:flex; flex-direction:column; gap:0.5rem; width:100%;">
                        <button class="btn primary download-btn">Download Workflow Assets</button>
                        ${wf.totalSizeOnDisk > 0 ? `<button class="btn secondary small outline cleanup-btn" style="width:fit-content;">Delete Leftover Files</button>` : ''}
                    </div>
                `}
            </div>
            <div class="download-progress-container hide" id="progress-${wf.id}">
                <div class="download-progress-bar pulsing"></div>
                <div class="progress-message" id="msg-${wf.id}">Analyzing dependencies...</div>
            </div>
        `;

        const statusRow = card.querySelector(`#status-${wf.id}`);
        const downloadBtn = card.querySelector('.download-btn');
        const deleteBtn = card.querySelector('.delete-btn');
        const cleanupBtn = card.querySelector('.cleanup-btn');
        const progressContainer = card.querySelector(`#progress-${wf.id}`);
        const progressMsg = card.querySelector(`#msg-${wf.id}`);

        downloadBtn?.addEventListener('click', async () => {
            statusRow.classList.add('hide');
            progressContainer.classList.remove('hide');
            
            const result = await downloadWorkflowDependencies(wf.id, (name, current, total) => {
                progressMsg.textContent = `Downloading ${name} (${current}/${total})...`;
            });

            if (result.success) {
                renderList(targetId, toolName);
                checkAllCleared(targetId);
            } else {
                alert(`Setup failed: ${result.error}`);
                statusRow.classList.remove('hide');
                progressContainer.classList.add('hide');
            }
        });

        const handleDelete = async (isCleanup = false) => {
            const confirmMsg = isCleanup 
                ? `This will delete leftover files for "${wf.name}" that aren't used by other installed workflows. Proceed?`
                : `This will delete models and custom nodes used ONLY by "${wf.name}". Shared assets will be kept. Proceed?`;
            
            if (await window.MpiConfirm(confirmMsg)) {
                const ok = await deleteWorkflow(wf.id);
                if (ok) renderList(targetId, toolName);
                else alert('Delete failed');
            }
        };

        deleteBtn?.addEventListener('click', () => handleDelete(false));
        cleanupBtn?.addEventListener('click', () => handleDelete(true));

        list.appendChild(card);
    });
}

function checkAllCleared(workflowId) {
    if (getWorkflowStatus(workflowId)) {
        if (onComplete) {
            setTimeout(() => {
                modal.classList.add('hide');
                onComplete();
                onComplete = null;
            }, 1000);
        }
    }
}
