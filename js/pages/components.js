/**
 * js/pages/components.js — Logic for the Component Gallery test page.
 * Manual mounting — components are declared in tpl-components.html as
 * pre-defined slots. No API fetch.
 */

'use strict';

import { state } from '../state.js';
import { toggleTheme } from '../themeManager.js';

// Primitives
import { MpiButton } from '../components/Primitives/MpiButton/MpiButton.js';
import { MpiIcon } from '../components/Primitives/MpiIcon/MpiIcon.js';
import { ICONS } from '../utils/icons.js';
import { MpiToast } from '../components/Primitives/MpiToast/MpiToast.js';
import { MpiSpinner } from '../components/Primitives/MpiSpinner/MpiSpinner.js';
import { MpiProgressBar } from '../components/Primitives/MpiProgressBar/MpiProgressBar.js';
import { MpiInput } from '../components/Primitives/MpiInput/MpiInput.js';
import { MpiBadge } from '../components/Primitives/MpiBadge/MpiBadge.js';
import { MpiMediaDropzone } from '../components/Primitives/MpiMediaDropzone/MpiMediaDropzone.js';
import { MpiPopup } from '../components/Primitives/MpiPopup/MpiPopup.js';
import { MpiScrollableBox } from '../components/Primitives/MpiScrollableBox/MpiScrollableBox.js';
import { MpiDragList } from '../components/Primitives/MpiDragList/MpiDragList.js';

// Compounds
import { MpiPromptBox } from '../components/Compounds/MpiPromptBox/MpiPromptBox.js';
import { MpiVolumeControl } from '../components/Compounds/MpiVolumeControl/MpiVolumeControl.js';
import { MpiRatioSelector } from '../components/Compounds/MpiRatioSelector/MpiRatioSelector.js';
import { MpiDropdown } from '../components/Compounds/MpiDropdown/MpiDropdown.js';

// Blocks
import { MpiVideoPlayer } from '../components/Blocks/MpiVideoPlayer/MpiVideoPlayer.js';

export async function initComponentsPage() {
    const debugToggle = document.getElementById('comp-debugToggle');
    const themeToggle = document.getElementById('comp-themeToggle');
    const searchInput = document.getElementById('comp-search');

    // Restore debug state
    if (localStorage.getItem('mpi_comp_debug') === 'true') {
        debugToggle.checked = true;
        document.body.classList.add('comp-debug');
    }

    if (themeToggle) {
        themeToggle.checked = state.isLightMode;
        themeToggle.addEventListener('change', () => toggleTheme(themeToggle.checked));
    }

    debugToggle.addEventListener('change', (e) => {
        document.body.classList.toggle('comp-debug', e.target.checked);
        localStorage.setItem('mpi_comp_debug', e.target.checked);
    });

    searchInput.addEventListener('input', (e) => filterComponents(e.target.value.toLowerCase().trim()));

    buildIconSection();
    mountAll();
}

/**
 * Dynamically injects comp-cards into #grid-MpiIcon from the live ICONS registry.
 * Adding a new icon to MpiIcon.js will auto-appear here with no HTML changes needed.
 */
function buildIconSection() {
    const grid = document.getElementById('grid-MpiIcon');
    if (!grid) return;

    const SIZES = ['xs', 'sm', 'md', 'lg', 'xl'];
    const COLORS = ['muted', 'accent', 'primary', 'danger', 'success'];

    // Pass 1 — build all card shells and flush into the live DOM
    const frag = document.createDocumentFragment();

    Object.keys(ICONS).forEach(key =>
        frag.appendChild(makeIconCard(`preview-icon-${key}`, 'MpiIcon', key))
    );
    SIZES.forEach(s =>
        frag.appendChild(makeIconCard(`preview-icon-size-${s}`, 'MpiIcon', `size: ${s}`))
    );
    COLORS.forEach(c =>
        frag.appendChild(makeIconCard(`preview-icon-color-${c}`, 'MpiIcon', `color: ${c}`))
    );

    grid.appendChild(frag); // ← elements are now in the DOM before any mount call

    // Pass 2 — mount icons into the now-visible slots
    Object.keys(ICONS).forEach(key => {
        mount(`preview-icon-${key}`, () =>
            MpiIcon.mount(slot(`preview-icon-${key}`), { name: key, size: 'lg' })
        );
    });
    SIZES.forEach(s =>
        mount(`preview-icon-size-${s}`, () =>
            MpiIcon.mount(slot(`preview-icon-size-${s}`), { name: 'info', size: s })
        )
    );
    COLORS.forEach(c =>
        mount(`preview-icon-color-${c}`, () =>
            MpiIcon.mount(slot(`preview-icon-color-${c}`), { name: 'info', size: 'lg', color: c })
        )
    );
}

/** Creates a .comp-card shell with an empty preview slot. */
function makeIconCard(previewId, name, label) {
    const card = document.createElement('div');
    card.className = 'comp-card';
    card.dataset.name = name.toLowerCase();
    card.dataset.label = label;
    card.innerHTML = `
        <div class="comp-card-header">
            <span class="comp-card-name">${name}</span>
            <span class="comp-card-badge">${label}</span>
        </div>
        <div class="comp-card-preview" id="${previewId}"></div>`;
    return card;
}

function mountAll() {
    // ── MpiButton ─────────────────────────────────────────────────────────────
    mount('preview-btn-primary', () => MpiButton.mount(slot('preview-btn-primary'), { variant: 'primary', text: 'Generate' }));
    mount('preview-btn-secondary', () => MpiButton.mount(slot('preview-btn-secondary'), { variant: 'secondary', text: 'Cancel' }));
    mount('preview-btn-danger', () => MpiButton.mount(slot('preview-btn-danger'), { variant: 'danger', text: 'Delete' }));
    mount('preview-btn-ghost', () => MpiButton.mount(slot('preview-btn-ghost'), { variant: 'ghost', text: 'Skip' }));
    mount('preview-btn-outline', () => MpiButton.mount(slot('preview-btn-outline'), { variant: 'outline', text: 'Export' }));
    mount('preview-btn-sm', () => MpiButton.mount(slot('preview-btn-sm'), { variant: 'primary', text: 'Small', size: 'sm' }));
    mount('preview-btn-lg', () => MpiButton.mount(slot('preview-btn-lg'), { variant: 'primary', text: 'Large', size: 'lg' }));
    mount('preview-btn-loading', () => MpiButton.mount(slot('preview-btn-loading'), { variant: 'primary', text: 'Loading', loading: true }));
    mount('preview-btn-disabled', () => MpiButton.mount(slot('preview-btn-disabled'), { variant: 'primary', text: 'Disabled', disabled: true }));

    // ── MpiButton — Icon mode (replaces MpiIconButton) ───────────────────────
    mount('preview-ibtn-primary', () => MpiButton.mount(slot('preview-ibtn-primary'), { icon: 'generate', info: 'Primary — hover + press invert' }));
    mount('preview-ibtn-label', () => MpiButton.mount(slot('preview-ibtn-label'), { icon: 'edit', label: 'Edit', info: 'With label' }));
    mount('preview-ibtn-toggle', () => {
        const i = MpiButton.mount(slot('preview-ibtn-toggle'), { icon: 'play', toggleable: true, info: 'Toggleable — click to commit' });
        i.on('toggle', ({ active }) => console.log('[gallery] toggle:', active));
    });
    mount('preview-ibtn-swap', () => MpiButton.mount(slot('preview-ibtn-swap'), { icon: 'play', iconActive: 'pause', toggleable: true, info: 'Toggle + icon swap (play/pause)' }));
    mount('preview-ibtn-danger', () => MpiButton.mount(slot('preview-ibtn-danger'), { icon: 'trash', variant: 'danger', info: 'Danger' }));
    mount('preview-ibtn-loading', () => MpiButton.mount(slot('preview-ibtn-loading'), { icon: 'refresh', variant: 'loading', info: 'Loading' }));
    mount('preview-ibtn-disabled', () => MpiButton.mount(slot('preview-ibtn-disabled'), { icon: 'close', variant: 'disabled', info: 'Disabled' }));
    // Sizes
    mount('preview-ibtn-sm', () => MpiButton.mount(slot('preview-ibtn-sm'), { icon: 'info', size: 'sm', info: 'Small (sm)' }));
    mount('preview-ibtn-lg', () => MpiButton.mount(slot('preview-ibtn-lg'), { icon: 'plus', size: 'lg', info: 'Large (lg)' }));
    mount('preview-ibtn-label-lg', () => MpiButton.mount(slot('preview-ibtn-label-lg'), { icon: 'download', label: 'Save File', size: 'lg', info: 'Large with label' }));
    mount('preview-ibtn-label-sm', () => MpiButton.mount(slot('preview-ibtn-label-sm'), { icon: 'sparkle', label: 'Boost', size: 'sm', info: 'Small with label' }));


    // ── MpiPopup — Enhanced (Primitive) ──────────────────────────────────────
    mount('preview-popupbtn-default', () => {
        const triggerSlot = slot('preview-popupbtn-default');
        triggerSlot.style.position = 'relative';
        triggerSlot.style.display = 'inline-block';

        const btn = MpiButton.mount(triggerSlot, { 
            icon: 'settings', 
            label: 'Toggle Popup', 
            toggleable: true 
        });

        const popup = MpiPopup.mount(triggerSlot, {
            position: 'top',
            items: [
                { id: 'edit', label: 'Edit', iconHtml: MpiIcon.template({ name: 'edit', size: 'sm' }) },
                { id: 'copy', label: 'Copy', iconHtml: MpiIcon.template({ name: 'copy', size: 'sm' }) },
                { id: 'delete', label: 'Delete', iconHtml: MpiIcon.template({ name: 'trash', size: 'sm' }) }
            ]
        });

        btn.on('click', () => {
            const active = !popup.props.active;
            popup.update({ active });
            btn.update({ active });
        });

        popup.on('select', ({ id }) => {
            console.log('[gallery] MpiPopup select:', id);
            popup.update({ active: false });
            btn.update({ active: false });
        });
    });

    // ── MpiScrollableBox (Primitive) ──────────────────────────────────────────
    mount('preview-scrollable-box', () => {
        const titles = ['Single A', 'Single B', 'Single C', 'Single D', 'Single E', 'Single F'];
        const box = MpiScrollableBox.mount(slot('preview-scrollable-box'), {
            titles,
            maxHeight: '120px',
            selectionMode: 'single'
        });
        box.on('select', ({ value }) => {
            const infoBar = document.getElementById('shell-info-text');
            if (infoBar) infoBar.textContent = `ScrollableBox (Single): ${value}`;
            console.log('[gallery] scrollable box select:', value);
        });
    });

    mount('preview-scrollable-box-multiple', () => {
        const titles = ['Multi 1', 'Multi 2', 'Multi 3', 'Multi 4', 'Multi 5', 'Multi 6'];
        const box = MpiScrollableBox.mount(slot('preview-scrollable-box-multiple'), {
            titles,
            maxHeight: '120px',
            selectionMode: 'multiple',
            selected: ['Multi 1', 'Multi 3']
        });
        box.on('select', ({ value, selection }) => {
            const infoBar = document.getElementById('shell-info-text');
            if (infoBar) infoBar.textContent = `ScrollableBox (Multi): ${selection.join(', ')}`;
            console.log('[gallery] scrollable box select:', value, selection);
        });
    });

    mount('preview-popupbtn-bottom', () => {
        const triggerSlot = slot('preview-popupbtn-bottom');
        triggerSlot.style.position = 'relative';
        triggerSlot.style.display = 'inline-block';

        const btn = MpiButton.mount(triggerSlot, { 
            icon: 'menu', 
            label: 'Bottom Menu', 
            toggleable: true 
        });

        const popup = MpiPopup.mount(triggerSlot, {
            position: 'bottom',
            items: [
                { id: 'a', label: 'Action A' },
                { id: 'b', label: 'Action B' }
            ]
        });

        btn.on('click', () => {
            const active = !popup.props.active;
            popup.update({ active });
            btn.update({ active });
        });
    });


    // ── MpiProgressBar — Slider mode ───────────────────────────────────────────
    mount('preview-slider-smart', () => {
        MpiProgressBar.mount(slot('preview-slider-smart'), {
            value: 65,
            prefix: 'Volume: ',
            suffix: '%',
            interactive: true,
            wheel: true
        });
    });

    mount('preview-slider-smart-2', () => {
        MpiProgressBar.mount(slot('preview-slider-smart-2'), {
            value: 0.50,
            step: 0.01,
            min: 0.00,
            max: 1.00,
            prefix: 'Denoise: ',
            variant: 'success',
            interactive: true,
            wheel: true
        });
    });

    // ── MpiVolumeControl ─────────────────────────────────────────────────────
    mount('preview-vol-control', () => {
        const vc = MpiVolumeControl.mount(slot('preview-vol-control'), { volume: 0.5 });
        vc.on('change', ({ volume, muted }) => console.log('[gallery] volume control change:', { volume, muted }));
    });

    // ── MpiDragList (Primitive) ─────────────────────────────────────────────────
    mount('preview-drag-list', () => {
        const items = [
            { label: 'Item 1: Primary Task', id: 1 },
            { label: 'Item 2: Secondary Priority', id: 2 },
            { label: 'Item 3: Low Importance', id: 3 },
            { label: 'Item 4: Optional Extra', id: 4 },
            { label: 'Item 5: Background Process', id: 5 }
        ];
        const dl = MpiDragList.mount(slot('preview-drag-list'), {
            items,
            maxHeight: '180px'
        });
        dl.on('reorder', ({ items }) => {
            const infoBar = document.getElementById('shell-info-text');
            if (infoBar) infoBar.textContent = `List Reordered: ${items[0].label} is now first`;
            console.log('[gallery] drag list reorder:', items);
        });
    });

    // ── MpiMediaDropzone (Primitive) ──────────────────────────────────────────
    mount('preview-dropzone-image', () => {
        const baseProps = {
            title: 'Source Image',
            icon: 'image',
            text: 'Drag & Drop or click to upload',
            mediaType: ['image']
        };

        const setupDz = (p) => {
            const dz = MpiMediaDropzone.mount(slot('preview-dropzone-image'), p);

            dz.on('drop', ({ url, file }) => {
                setupDz({ ...baseProps, value: url, type: 'image' });

                // Dimensions
                const img = new Image();
                img.onload = () => {
                    const badgeSlot = document.getElementById('preview-dropzone-image-badge');
                    if (badgeSlot) {
                        badgeSlot.innerHTML = '';
                        MpiBadge.mount(badgeSlot, { label: `${img.width}×${img.height}`, variant: 'info', pill: true });
                    }
                };
                img.src = url;
            });

            dz.on('remove', () => {
                setupDz(baseProps);
                const badgeSlot = document.getElementById('preview-dropzone-image-badge');
                if (badgeSlot) badgeSlot.innerHTML = '';
            });
        };

        setupDz(baseProps);
    });

    mount('preview-dropzone-video', () => {
        const baseProps = {
            title: 'Training Video',
            icon: 'video',
            text: 'MPEG, MP4 or MOV accepted',
            footer: 'Max 100MB',
            mediaType: ['video']
        };

        const setupDz = (p) => {
            const dz = MpiMediaDropzone.mount(slot('preview-dropzone-video'), p);
            dz.on('drop', ({ url }) => setupDz({ ...baseProps, value: url, type: 'video' }));
            dz.on('remove', () => setupDz(baseProps));
        };

        setupDz(baseProps);
    });

    mount('preview-dropzone-audio', () => {
        const baseProps = {
            title: 'Audio Track',
            icon: 'audio',
            text: 'WAV, MP3 or OGG',
            footer: '44.1kHz / 16-bit',
            mediaType: ['audio']
        };

        const setupDz = (p) => {
            const dz = MpiMediaDropzone.mount(slot('preview-dropzone-audio'), p);
            dz.on('drop', ({ url }) => setupDz({ ...baseProps, value: url, type: 'audio' }));
            dz.on('remove', () => setupDz(baseProps));
        };

        setupDz(baseProps);
    });

    // ── MpiVideoPlayer (Block) ────────────────────────────────────────────────
    mount('preview-videoplayer-default', () => {
        const vp = MpiVideoPlayer.mount(slot('preview-videoplayer-default'), {
            src: 'https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/BigBuckBunny.mp4',
            poster: 'https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/images/BigBuckBunny.png',
            muted: true,
            autoplay: false,
            volume: 0.75
        });

        vp.on('play', () => console.log('[gallery] video play'));
        vp.on('pause', () => console.log('[gallery] video pause'));
    });


    // ── MpiProgressBar (Base Primitive — Static by default) ──────────────────
    mount('preview-progress-standard', () => {
        MpiProgressBar.mount(slot('preview-progress-standard'), {
            value: 75,
            interactive: false,
            info: 'Static Progress: {value}%'
        });
    });

    mount('preview-progress-success', () => {
        MpiProgressBar.mount(slot('preview-progress-success'), {
            value: 100,
            variant: 'success',
            interactive: false,
            info: 'Completed'
        });
    });

    mount('preview-progress-danger', () => {
        MpiProgressBar.mount(slot('preview-progress-danger'), {
            value: 33,
            variant: 'danger',
            interactive: false,
            info: 'System Error: 33%'
        });
    });

    // ── MpiSpinner ────────────────────────────────────────────────────────────
    mount('preview-spinner-toggle', () => {
        const slotEl = slot('preview-spinner-toggle');
        const toggleSlot = document.createElement('div');
        const spinnerSlot = document.createElement('div');
        slotEl.appendChild(toggleSlot);
        slotEl.appendChild(spinnerSlot);

        const spinner = MpiSpinner.mount(spinnerSlot, { size: 'lg', variant: 'primary' });
        const toggle = MpiButton.mount(toggleSlot, {
            icon: 'refresh',
            label: 'Toggle Spinner',
            toggleable: true,
            active: true,
            info: 'Toggle the spinner visibility'
        });

        toggle.on('toggle', ({ active }) => {
            spinnerSlot.style.visibility = active ? 'visible' : 'hidden';
        });
    });


    // ── MpiInput ──────────────────────────────────────────────────────────────
    mount('preview-input-text', () => MpiInput.mount(slot('preview-input-text'), { type: 'text', label: 'Username', placeholder: 'Enter username...', info: 'Standard text input' }));
    mount('preview-input-email', () => MpiInput.mount(slot('preview-input-email'), { type: 'email', label: 'Email Address', placeholder: 'user@example.com', info: 'Email type input' }));
    mount('preview-input-password', () => MpiInput.mount(slot('preview-input-password'), { type: 'password', label: 'Password', placeholder: '••••••••', info: 'Password masking' }));
    mount('preview-input-number', () => MpiInput.mount(slot('preview-input-number'), { type: 'number', label: 'Quantity', value: 42, info: 'Numeric input' }));

    // ── MpiBadge ──────────────────────────────────────────────────────────────
    mount('preview-badge-variants', () => {
        const slotEl = slot('preview-badge-variants');
        slotEl.style.gap = '0.5rem';

        MpiBadge.mount(slotEl, { label: 'Success', variant: 'success' });
        MpiBadge.mount(slotEl, { label: 'Warning', variant: 'warning' });
        MpiBadge.mount(slotEl, { label: 'Danger', variant: 'danger' });
        MpiBadge.mount(slotEl, { label: 'Info', variant: 'info' });
        MpiBadge.mount(slotEl, { label: '99+', variant: 'primary', pill: true });
        MpiBadge.mount(slotEl, { label: 'Draft', variant: 'secondary' });
    });

    // ── MpiToast ──────────────────────────────────────────────────────────────
    mount('preview-toast-trigger', () => {
        const btn = MpiButton.mount(slot('preview-toast-trigger'), {
            icon: 'bell',
            label: 'Spawn Toast',
            variant: 'primary',
            info: 'Click to test the toast notification'
        });
        btn.on('click', () => {
            const toastWrapper = document.createElement('div');
            document.body.appendChild(toastWrapper);

            const t = MpiToast.mount(toastWrapper, {
                message: 'Notification sent successfully!',
                variant: 'success',
                duration: 3000
            });

            t.on('close', () => {
                t.destroy();
                toastWrapper.remove();
            });
        });
    });

    // ── MpiPopup (Primitive) ──────────────────────────────────────────────────
    mount('preview-popup-default', () => {
        MpiPopup.mount(slot('preview-popup-default'), {
            active: true,
            variant: 'glass'
        }, `
            <div style="padding: 10px; color: var(--text);">
                <h4 style="margin: 0 0 8px 0; font-family: var(--font-display);">Popup Content</h4>
                <p style="margin: 0; font-size: 0.8rem; opacity: 0.7;">This is a floating glass container.</p>
            </div>
        `);
    });

    // ── MpiRatioSelector (Compound) ───────────────────────────────────────────
    mount('preview-ratio-flux', () => {
        const sel = MpiRatioSelector.mount(slot('preview-ratio-flux'), {
            modelType: 'flux',
            initialOrientation: 'portrait',
            value: '1:1'
        });
        sel.on('change', (data) => console.log('[gallery] flux ratio change:', data));
        sel.on('orientation_change', (data) => console.log('[gallery] flux orient change:', data));
    });

    mount('preview-ratio-video', () => {
        const sel = MpiRatioSelector.mount(slot('preview-ratio-video'), {
            modelType: 'video',
            value: '16:9'
        });
        sel.on('change', (data) => console.log('[gallery] video ratio change:', data));
    });

    // ── MpiDropdown (Compound) ────────────────────────────────────────────────────
    mount('preview-dropdown-top', () => {
        const dd = MpiDropdown.mount(slot('preview-dropdown-top'), {
            label: 'Choose Option',
            titles: ['Option 1', 'Option 2', 'Option 3', 'Option 4', 'Option 5'],
            position: 'top',
            maxHeight: '150px',
        });
        dd.on('select', ({ value }) => {
            const infoBar = document.getElementById('shell-info-text');
            if (infoBar) infoBar.textContent = `Dropdown Select: ${value}`;
        });
    });

    mount('preview-dropdown-bottom', () => {
        const dd = MpiDropdown.mount(slot('preview-dropdown-bottom'), {
            label: 'Custom Icon)',
            titles: ['Red', 'Green', 'Blue', 'Yellow', 'Cyan', 'Magenta'],
            position: 'bottom',
            maxHeight: '150px',
            icon: 'download'
        });
        dd.on('select', ({ value }) => {
            const infoBar = document.getElementById('shell-info-text');
            if (infoBar) infoBar.textContent = `Dropdown Select: ${value}`;
        });
    });

    // ── MpiPromptBox (Compound) ────────────────────────────────────────────────
    mount('preview-promptbox-standard', () => {
        const pb = MpiPromptBox.mount(slot('preview-promptbox-standard'), {
            value: 'A futuristic city at sunset, neon lights, cinematic lighting'
        });
        pb.on('input', (data) => console.log('[gallery] prompt input:', data));
    });

    mount('preview-promptbox-expanded', () => {
        // Create some sub-components for the slots
        const badgeL1 = MpiBadge.mount(document.createElement('div'), { label: '4:3', variant: 'secondary' });
        const badgeL2 = MpiBadge.mount(document.createElement('div'), { label: 'Flux.1', variant: 'secondary' });
        const iconR1 = MpiButton.mount(document.createElement('div'), { icon: 'settings', size: 'sm', variant: 'ghost' });
        const iconR2 = MpiButton.mount(document.createElement('div'), { icon: 'bolt', size: 'sm', variant: 'ghost' });

        MpiPromptBox.mount(slot('preview-promptbox-expanded'), {
            value: 'A girl reading a book in a library, soft sunlight through windows',
            LeftA: [badgeL1, badgeL2],
            rightA: [iconR1, iconR2]
        });
    });

    mount('preview-promptbox-negative', () => {
        const pb = MpiPromptBox.mount(slot('preview-promptbox-negative'), {
            value: 'Portrait of a warrior, detailed armor, fire background',
            negativeValue: 'text, watermark, blurry, low resolution',
            includeNegative: true
        });
        pb.on('toggle-negative', ({ active }) => console.log('[gallery] negative toggle:', active));
    });
}

/** Clears a slot and returns it. */
function slot(id) {
    const el = document.getElementById(id);
    if (el) el.innerHTML = '';
    return el;
}

/** Safely invokes a mount fn, suppressing errors. */
function mount(id, fn) {
    try { if (document.getElementById(id)) fn(); }
    catch (e) { console.warn(`[gallery] mount "${id}" failed:`, e); }
}

function filterComponents(q) {
    document.querySelectorAll('.comp-card').forEach(c => {
        const match = (c.dataset.name || '').includes(q) || (c.dataset.label || '').includes(q);
        c.style.display = match ? 'flex' : 'none';
    });
    ['Primitives', 'MpiIcon', 'Compounds', 'Blocks'].forEach(tier => {
        const section = document.getElementById(`section-${tier}`);
        const grid = document.getElementById(`grid-${tier}`);
        if (!section || !grid) return;
        section.classList.toggle('hide', !Array.from(grid.children).some(c => c.style.display !== 'none'));
    });
}
