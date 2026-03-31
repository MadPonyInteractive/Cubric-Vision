import { state } from '../state.js';

let modalOverlay, closeBtn, uploadBtn, uploadInput, filterBtns, grid, emptyState;
let _onSelectCallback = null;
let currentMedia = [];
let currentFilter = 'newest';
let _filterType = 'all'; 

export function initAssetBrowserModal() {
    modalOverlay = document.getElementById('assetBrowserModal');
    closeBtn = document.getElementById('closeAssetBrowserModal');
    uploadBtn = document.getElementById('assetBrowserUploadBtn');
    uploadInput = document.getElementById('assetBrowserUpload');
    grid = document.getElementById('assetBrowserGrid');
    emptyState = document.getElementById('assetBrowserEmpty');

    if (!modalOverlay) return;

    closeBtn.addEventListener('click', closeAssetBrowser);
    
    // Upload local file to project media
    uploadBtn.addEventListener('click', () => uploadInput.click());
    uploadInput.addEventListener('change', async (e) => {
        if (!state.currentProject) { alert("Please open a project first."); return; }
        
        for (const f of Array.from(e.target.files)) {
            // Use the generic uploader from toolUtils
            import('../toolUtils.js').then(async (m) => {
                const res = await m.uploadMediaToProject(f, 'browser');
                if (res) loadMedia();
            });
        }
        uploadInput.value = '';
        setTimeout(loadMedia, 500); // Reload after upload
    });

    // Filters
    filterBtns = document.querySelectorAll('.asset-browser-filters button');
    filterBtns.forEach(btn => {
        btn.addEventListener('click', (e) => {
            filterBtns.forEach(b => b.classList.remove('active'));
            e.target.classList.add('active');
            currentFilter = e.target.getAttribute('data-filter');
            renderGrid();
        });
    });

    // Close on overlay click
    modalOverlay.addEventListener('click', (e) => {
        if (e.target === modalOverlay) closeAssetBrowser();
    });
}

export function openAssetBrowser(onSelectCallback, options = {}) {
    if (!state.currentProject) {
        alert("Please open a project to browse its media.");
        return;
    }
    _onSelectCallback = onSelectCallback;
    _filterType = options.type || 'all';
    modalOverlay.classList.remove('hide');
    loadMedia();
}

export function closeAssetBrowser() {
    modalOverlay.classList.add('hide');
    _onSelectCallback = null;
}

async function loadMedia() {
    if (!state.currentProject) return;
    try {
        const res = await fetch(`/project-media/${state.currentProject.id}?folderPath=${encodeURIComponent(state.currentProject.folderPath)}`);
        const data = await res.json();
        
        if (data.success && data.files) {
            if (_filterType !== 'all') {
                currentMedia = data.files.filter(f => f.type === _filterType);
            } else {
                currentMedia = data.files;
            }
            renderGrid();
        } else {
            console.error('Failed to load media:', data.error);
            grid.innerHTML = `<div class="media-empty-state">Failed to load media: ${data.error || 'Unknown error'}</div>`;
        }
    } catch (e) {
        console.error('Error fetching media:', e);
        grid.innerHTML = `<div class="media-empty-state">Error fetching media. Check console.</div>`;
    }
}

function renderGrid() {
    grid.innerHTML = '';
    
    // Sorting / Filtering logic
    let displayMedia = [...currentMedia];
    
    if (currentFilter === 'newest') {
        displayMedia.sort((a, b) => b.mtime - a.mtime);
    } else if (currentFilter === 'oldest') {
        displayMedia.sort((a, b) => a.mtime - b.mtime);
    } else if (currentFilter === 'favorites') {
        displayMedia = displayMedia.filter(m => m.metadata?.favorite);
        displayMedia.sort((a, b) => b.mtime - a.mtime);
    } else if (currentFilter === 'used') {
        displayMedia.sort((a, b) => (b.metadata?.useCount || 0) - (a.metadata?.useCount || 0));
    }

    if (displayMedia.length === 0) {
        grid.classList.add('hide');
        emptyState.classList.remove('hide');
        return;
    }

    grid.classList.remove('hide');
    emptyState.classList.add('hide');

    displayMedia.forEach(file => {
        const card = document.createElement('div');
        card.className = 'media-card';
        const width = file.metadata?.width || 512;
        const height = file.metadata?.height || 512;
        const ar = width / height;
        card.style.flex = `${ar} 1 ${ar * 240}px`;

        const fileUrl = `/project-file?path=${encodeURIComponent(file.path)}`;
        let previewHtml = '';
        if (file.type === 'video') {
            previewHtml = `<video src="${fileUrl}" preload="metadata" muted loop></video>`;
        } else if (file.type === 'audio') {
            previewHtml = `<div class="media-card-audio">🎵</div>`;
        } else {
            previewHtml = `<img src="${fileUrl}" alt="${file.name}" loading="lazy">`;
        }

        card.innerHTML = `
            ${previewHtml}
            <button class="heart-btn top-right ${file.metadata?.favorite ? 'active' : ''}" title="Favorite">
                <svg class="heart-icon" viewBox="0 0 24 24" width="18" height="18"><path d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z"/></svg>
            </button>
        `;

        if (file.type === 'video') {
            const video = card.querySelector('video');
            const updateVideoAr = () => {
                if (video.videoWidth && video.videoHeight) {
                    const actualAr = video.videoWidth / video.videoHeight;
                    card.style.flex = `${actualAr} 1 ${actualAr * 240}px`;
                }
            };
            if (video.readyState >= 1) updateVideoAr();
            else video.addEventListener('loadedmetadata', updateVideoAr);

            card.addEventListener('mouseenter', () => video.play().catch(() => { }));
            card.addEventListener('mouseleave', () => { video.pause(); video.currentTime = 0; });
        } else if (file.type === 'image') {
            const img = card.querySelector('img');
            if (img && (!file.metadata || !file.metadata.width)) {
                const updateImgAr = () => {
                    if (img.naturalWidth && img.naturalHeight) {
                        const actualAr = img.naturalWidth / img.naturalHeight;
                        card.style.flex = `${actualAr} 1 ${actualAr * 240}px`;
                    }
                };
                if (img.complete) updateImgAr();
                else img.addEventListener('load', updateImgAr);
            }
        }
        
        card.addEventListener('click', (e) => {
            // If click was on the heart button, don't trigger selection
            if (e.target.closest('.heart-btn')) return;

            if (_onSelectCallback) {
                // Increment use count in metadata
                fetch(`/project-media/${state.currentProject.id}/update-meta?folderPath=${encodeURIComponent(state.currentProject.folderPath)}`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        filename: file.name,
                        updates: { useCount: (file.metadata?.useCount || 0) + 1 }
                    })
                }).catch(err => console.error("Failed to update media meta", err));
                
                _onSelectCallback({
                    url: `/project-file?path=${encodeURIComponent(file.path)}`,
                    filename: file.name
                });
                closeAssetBrowser();
            }
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
        
        // Add drag support
        const dragEl = card.querySelector('img, video, .media-card-audio');
        if (dragEl) {
            dragEl.draggable = true;
            dragEl.addEventListener('dragstart', (e) => {
                const src = dragEl.src || fileUrl;
                e.dataTransfer.setData('text/plain', src);
            });
        }

        grid.appendChild(card);
    });
}
