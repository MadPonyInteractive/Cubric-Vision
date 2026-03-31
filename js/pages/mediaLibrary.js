import { state } from '../state.js';
import { openMediaModal } from '../components/mediaDetailModal.js';
import { MediaContextMenu } from '../components/mediaContextMenu.js';
import { saveToolState } from '../toolState.js';
import { navigate, PAGE_TOOL } from '../router.js';

let filterTabs, grid, emptyState;
let delSelectedBtn, dlSelectedBtn, compareSelectedBtn;

let currentFiles = [];
let selectedFiles = new Set();
let currentFilter = 'all';

export function initMediaLibrary() {
    grid = document.getElementById('media-grid');
    emptyState = document.getElementById('media-emptyState');
    filterTabs = document.querySelectorAll('#media-tabs .nav-item');
    delSelectedBtn = document.getElementById('media-deleteSelectedBtn');
    dlSelectedBtn = document.getElementById('media-downloadSelectedBtn');
    compareSelectedBtn = document.getElementById('media-compareSelectedBtn');

    if (!grid) return;

    filterTabs.forEach(tab => {
        tab.addEventListener('click', (e) => {
            filterTabs.forEach(t => t.classList.remove('active'));
            e.target.classList.add('active');
            currentFilter = e.target.dataset.filter;
            _renderGrid();
        });
    });

    delSelectedBtn.addEventListener('click', _deleteSelected);
    dlSelectedBtn.addEventListener('click', _downloadSelected);
    compareSelectedBtn?.addEventListener('click', _compareSelected);

    // Listen for deletions or updates from the modal to refresh
    document.addEventListener('media:deleted', () => {
        if (state.currentPage === 'media') loadMediaFiles();
    });
    document.addEventListener('media:updated', () => {
        if (state.currentPage === 'media') loadMediaFiles();
    });
}

export async function loadMediaFiles() {
    if (!state.currentProject) {
        grid.innerHTML = '';
        emptyState.classList.remove('hide');
        return;
    }

    try {
        const res = await fetch(`/project-media/${state.currentProject.id}?folderPath=${encodeURIComponent(state.currentProject.folderPath)}`);
        const data = await res.json();
        
        if (data.success) {
            currentFiles = data.files.sort((a,b) => b.name.localeCompare(a.name)); // sort newest first ideally, alphabetical works
            selectedFiles.clear();
            _renderGrid();
        } else {
            console.error('Failed to load media:', data.error);
        }
    } catch (e) {
        console.error('Error fetching media:', e);
    }
}

function _renderGrid() {
    grid.innerHTML = '';
    let filtered = currentFiles;
    if (currentFilter === 'favorites') {
        filtered = currentFiles.filter(f => f.metadata?.favorite);
    } else if (currentFilter !== 'all') {
        filtered = currentFiles.filter(f => f.type === currentFilter);
    }
    
    if (filtered.length === 0) {
        emptyState.classList.remove('hide');
        delSelectedBtn.classList.add('hide');
        dlSelectedBtn.classList.add('hide');
        return;
    }
    
    emptyState.classList.add('hide');

    filtered.forEach(file => {
        grid.appendChild(_buildMediaCard(file));
    });

    _updateActionVisibility();
}

function _buildMediaCard(file) {
    const card = document.createElement('div');
    card.className = 'media-card';
    if (selectedFiles.has(file.name)) card.classList.add('selected');

    const fileUrl = `/project-file?path=${encodeURIComponent(file.path)}`;
    let previewHtml = '';
    
    if (file.type === 'image') {
        previewHtml = `<img src="${fileUrl}" loading="lazy">`;
    } else if (file.type === 'video') {
        previewHtml = `<video src="${fileUrl}" preload="metadata" muted loop></video>`;
    } else if (file.type === 'audio') {
        previewHtml = `<div class="media-card-audio">🎵</div>`;
    } else {
        previewHtml = `<div class="media-card-audio">📄</div>`;
    }

    const width = file.metadata?.width || 512;
    const height = file.metadata?.height || 512;
    const ar = width / height;
    card.style.flex = `${ar} 1 ${ar * 240}px`;

    card.innerHTML = `
        ${previewHtml}
        <div class="media-card-overlay">
        </div>
        <button class="heart-btn bottom-right ${file.metadata?.favorite ? 'active' : ''}" title="Favorite">
            <svg class="heart-icon" viewBox="0 0 24 24" width="18" height="18"><path d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z"/></svg>
        </button>
        <div class="media-card-checkbox"></div>
        <div class="media-card-use" title="Copy to clipboard">
            <svg viewBox="0 0 24 24" width="14" height="14" style="pointer-events:none;"><path fill="currentColor" d="M16 1H4a2 2 0 0 0-2 2v14h2V3h12V1zm3 4H8a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h11a2 2 0 0 0 2-2V7a2 2 0 0 0-2-2zm0 16H8V7h11v14z"/></svg>
        </div>
    `;

    // Behaviors
    const checkbox = card.querySelector('.media-card-checkbox');
    const useBtn = card.querySelector('.media-card-use');
    const videoObj = card.querySelector('video');

    if (videoObj) {
        const updateVideoAr = () => {
            if (videoObj.videoWidth && videoObj.videoHeight) {
                const actualAr = videoObj.videoWidth / videoObj.videoHeight;
                card.style.flex = `${actualAr} 1 ${actualAr * 240}px`;
            }
        };
        if (videoObj.readyState >= 1) updateVideoAr();
        else videoObj.addEventListener('loadedmetadata', updateVideoAr);

        card.addEventListener('mouseenter', () => videoObj.play().catch(()=>{}));
        card.addEventListener('mouseleave', () => { videoObj.pause(); videoObj.currentTime=0; });
    } else {
        const imgObj = card.querySelector('img');
        if (imgObj && (!file.metadata || !file.metadata.width)) {
            const updateImgAr = () => {
                if (imgObj.naturalWidth && imgObj.naturalHeight) {
                    const actualAr = imgObj.naturalWidth / imgObj.naturalHeight;
                    card.style.flex = `${actualAr} 1 ${actualAr * 240}px`;
                }
            };
            if (imgObj.complete) updateImgAr();
            else imgObj.addEventListener('load', updateImgAr);
        }
    }

    checkbox.addEventListener('click', (e) => {
        e.stopPropagation();
        _toggleSelection(file.name, card);
    });

    // Heart toggle
    const heartBtn = card.querySelector('.heart-btn');
    heartBtn.addEventListener('click', async (e) => {
        e.stopPropagation();
        const isFavorite = !heartBtn.classList.contains('active');
        heartBtn.classList.toggle('active', isFavorite);
        
        // Update local state and server
        if (!file.metadata) file.metadata = {};
        file.metadata.favorite = isFavorite;

        try {
            await fetch(`/project-media/${state.currentProject.id}/update-meta?folderPath=${encodeURIComponent(state.currentProject.folderPath)}`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    filename: file.name,
                    updates: { favorite: isFavorite }
                })
            });
        } catch (err) {
            console.error("Failed to toggle favorite", err);
        }
    });

    useBtn.addEventListener('click', async (e) => {
        e.stopPropagation();
        try {
            const response = await fetch(fileUrl);
            const blob = await response.blob();
            
            // For images, we try to use ClipboardItem
            if (file.type === 'image') {
                // Browsers usually only allow copying PNGs to clipboard
                // If it's not a PNG, we might need a canvas conversion, but let's try direct first
                const data = [new ClipboardItem({ [blob.type]: blob })];
                await navigator.clipboard.write(data);
            } else {
                // For others, maybe just copy the URL for now or alert
                await navigator.clipboard.writeText(window.location.origin + fileUrl);
            }

            const originalInner = useBtn.innerHTML;
            useBtn.innerHTML = '✓';
            useBtn.style.color = '#4ade80';
            setTimeout(() => {
                useBtn.innerHTML = originalInner;
                useBtn.style.color = '';
            }, 2000);
        } catch (err) {
            console.error('Copy failed:', err);
            // Fallback for some browsers or types
            const input = document.createElement('input');
            input.value = window.location.origin + fileUrl;
            document.body.appendChild(input);
            input.select();
            document.execCommand('copy');
            document.body.removeChild(input);
        }
    });

    card.addEventListener('click', () => {
        openMediaModal(file, state.currentProject.folderPath);
    });

    card.addEventListener('contextmenu', (e) => {
        e.preventDefault();
        e.stopPropagation();
        MediaContextMenu.show(
            e.clientX, e.clientY,
            { url: fileUrl, filename: file.name, type: file.type, isSaved: true },
            'library',
            {
                onDeleted: (filename) => {
                    document.dispatchEvent(new CustomEvent('media:deleted', { detail: { filename } }));
                }
            }
        );
    });

    return card;
}

function _toggleSelection(name, cardEl) {
    if (selectedFiles.has(name)) {
        selectedFiles.delete(name);
        cardEl.classList.remove('selected');
    } else {
        selectedFiles.add(name);
        cardEl.classList.add('selected');
    }
    _updateActionVisibility();
}

function _updateActionVisibility() {
    const hasSelection = selectedFiles.size > 0;
    delSelectedBtn.classList.toggle('hide', !hasSelection);
    dlSelectedBtn.classList.toggle('hide', !hasSelection);
    if (compareSelectedBtn) {
        compareSelectedBtn.classList.toggle('hide', selectedFiles.size !== 2);
    }
}

async function _deleteSelected() {
    if (selectedFiles.size === 0) return;
    
    for (const name of selectedFiles) {
        try {
            await fetch(`/project-media/${state.currentProject.id}/${encodeURIComponent(name)}?folderPath=${encodeURIComponent(state.currentProject.folderPath)}`, {
                method: 'DELETE'
            });
            // Dispatch event for history cleanup
            document.dispatchEvent(new CustomEvent('media:deleted', { detail: { name } }));
        } catch(e) { 
            console.error('Error deleting', name, e); 
        }
    }
    
    selectedFiles.clear();
    await loadMediaFiles();
}

function _downloadSelected() {
    for (const name of selectedFiles) {
        const dlUrl = `/project-media/${state.currentProject.id}/download/${encodeURIComponent(name)}?folderPath=${encodeURIComponent(state.currentProject.folderPath)}`;
        window.open(dlUrl, '_blank');
    }
    // Optional: auto-clear selection after download
    selectedFiles.clear();
    _renderGrid();
}

function _compareSelected() {
    if (selectedFiles.size !== 2) return;
    
    const selected = Array.from(selectedFiles);
    const file1 = currentFiles.find(f => f.name === selected[0]);
    const file2 = currentFiles.find(f => f.name === selected[1]);
    
    if (file1 && file2) {
        saveToolState('compare', {
            leftImage: file1.path,
            rightImage: file2.path
        });
        navigate(PAGE_TOOL, { name: 'compare' });
    }
}
