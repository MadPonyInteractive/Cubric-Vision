/**
 * js/pages/components.js — Logic for the Component Gallery test page.
 * Manual mounting — components are declared in tpl-components.html as
 * pre-defined slots. No API fetch.
 */

'use strict';

import { state } from '../state.js';
import { Events } from '../events.js';

// Primitives
import { MpiButton } from '../components/Primitives/MpiButton/MpiButton.js';
import { MpiIcon } from '../components/Primitives/MpiIcon/MpiIcon.js';
import { ICONS } from '../utils/icons.js';
import { MpiToast } from '../components/Primitives/MpiToast/MpiToast.js';
import { MpiSpinner } from '../components/Primitives/MpiSpinner/MpiSpinner.js';
import { MpiProgressBar } from '../components/Primitives/MpiProgressBar/MpiProgressBar.js';
import { MpiInput } from '../components/Primitives/MpiInput/MpiInput.js';
import { MpiDropdown } from '../components/Primitives/MpiDropdown/MpiDropdown.js';
import { MpiRadioGroup } from '../components/Primitives/MpiRadioGroup/MpiRadioGroup.js';
import { MpiBadge } from '../components/Primitives/MpiBadge/MpiBadge.js';
import { MpiMediaDropzone } from '../components/Primitives/MpiMediaDropzone/MpiMediaDropzone.js';
import { MpiPopup } from '../components/Primitives/MpiPopup/MpiPopup.js';
import { MpiScrollableBox } from '../components/Primitives/MpiScrollableBox/MpiScrollableBox.js';
import { MpiDragList } from '../components/Primitives/MpiDragList/MpiDragList.js';
import { MpiOverlay } from '../components/Primitives/MpiOverlay/MpiOverlay.js';
import { MpiRadialMenu } from '../components/Primitives/MpiRadialMenu/MpiRadialMenu.js';
import { StatusBar } from '../shell/statusBar.js';

// Compounds
import { MpiPromptBox } from '../components/Blocks/MpiPromptBox/MpiPromptBox.js';
import { MpiVolumeControl } from '../components/Compounds/MpiVolumeControl/MpiVolumeControl.js';
import { MpiRatioSelector } from '../components/Compounds/MpiRatioSelector/MpiRatioSelector.js';
import { MpiToolbar } from '../components/Compounds/MpiToolbar/MpiToolbar.js';
import { MpiCameraConfig } from '../components/Compounds/MpiCameraConfig/MpiCameraConfig.js';
import { MpiLightingConfig } from '../components/Compounds/MpiLightingConfig/MpiLightingConfig.js';
import { MpiStyleConfig } from '../components/Compounds/MpiStyleConfig/MpiStyleConfig.js';
import { MpiVideoScene } from '../components/Compounds/MpiVideoScene/MpiVideoScene.js';
import { MpiModal } from '../components/Primitives/MpiModal/MpiModal.js';
import { MpiOkCancel } from '../components/Compounds/MpiOkCancel/MpiOkCancel.js';
import { MpiInstalledDisplay } from '../components/Compounds/MpiInstalledDisplay/MpiInstalledDisplay.js';
import { MpiMemoryMonitor } from '../components/Compounds/MpiMemoryMonitor/MpiMemoryMonitor.js';
import { MpiProjectName } from '../components/Compounds/MpiProjectName/MpiProjectName.js';
import { MpiProjectCard } from '../components/Compounds/MpiProjectCard/MpiProjectCard.js';
import { MpiNewProject } from '../components/Compounds/MpiNewProject/MpiNewProject.js';
import { MpiModelsModal } from '../components/Blocks/MpiModelsModal/MpiModelsModal.js';
import { MpiStartingComfy } from '../components/Compounds/MpiStartingComfy/MpiStartingComfy.js';
import { MpiErrorDialog } from '../components/Compounds/MpiErrorDialog/MpiErrorDialog.js';
import { MpiCompareOverlay } from '../components/Compounds/MpiCompareOverlay/MpiCompareOverlay.js';
import { MpiAutoMaskThumbs } from '../components/Compounds/MpiAutoMaskThumbs/MpiAutoMaskThumbs.js';
import { MpiToolActionBar } from '../components/Compounds/MpiToolActionBar/MpiToolActionBar.js';

// Blocks
import { MpiVideoPlayer } from '../components/Blocks/MpiVideoPlayer/MpiVideoPlayer.js';

export async function initComponentsPage() {
    const debugToggle = document.getElementById('comp-debugToggle');
    const searchInput = document.getElementById('comp-search');

    // Restore debug state
    if (localStorage.getItem('mpi_comp_debug') === 'true') {
        debugToggle.checked = true;
        document.body.classList.add('comp-debug');
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

    // ── MpiMemoryMonitor (Compound) ──────────────────────────────────
    mount('preview-mem-monitor', () => {
        const mm = MpiMemoryMonitor.mount(slot('preview-mem-monitor'), { pollInterval: 2000 });
        mm.on('release', ({ deep }) => {
            const infoBar = document.getElementById('shell-info-text');
            if (infoBar) infoBar.textContent = deep ? 'Deep clean triggered (gallery demo)' : 'VRAM release triggered (gallery demo)';
            console.log('[gallery] memory monitor release:', { deep });
        });
    });

    // ── MpiProjectName (Compound) ────────────────────────────────────────────
    mount('preview-project-name', () => {
        const pn = MpiProjectName.mount(slot('preview-project-name'), {
            projectName: 'My Cool Project',
            pageName: 'Image',
        });
        pn.on('back', () => console.log('[gallery] project name back clicked'));
    });

    // ── MpiOverlay (Primitive) ────────────────────────────────────────────────
    mount('preview-overlay-default', () => {
        const slotEl = slot('preview-overlay-default');

        // Trigger button shown in the gallery card
        const triggerSlot = document.createElement('div');
        slotEl.appendChild(triggerSlot);
        const btn = MpiButton.mount(triggerSlot, {
            icon: 'layers',
            label: 'Open Overlay',
            variant: 'primary',
            info: 'Click to show the MpiOverlay — replaces the main area'
        });

        // Overlay — empty shell; show()/hide() swaps it into #tool-container
        const overlay = MpiOverlay.mount(document.createElement('div'), { closable: true });

        // Add a MpiBadge into the content slot for demo purposes
        const badgeWrap = document.createElement('div');
        overlay.el.appendToContainer(badgeWrap);
        MpiBadge.mount(badgeWrap, { label: 'Empty Overlay', variant: 'info', pill: true });

        btn.on('click', () => overlay.el.show());
        overlay.on('close', () => console.log('[gallery] overlay closed'));
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

    // ── MpiRadialMenu (Primitive) ─────────────────────────────────────────────
    mount('preview-radial-menu', () => {
        const slotEl = slot('preview-radial-menu');

        // Render inside the card preview — force open so it's always visible in gallery
        const radial = MpiRadialMenu.mount(slotEl, { context: 'root', open: true });

        // Cycle contexts on select to showcase all states
        const CONTEXTS = ['root', 'image', 'video', 'audio'];
        let ctxIndex = 0;
        radial.on('select', ({ action }) => {
            console.log('[gallery] radial select:', action);
            ctxIndex = (ctxIndex + 1) % CONTEXTS.length;
            radial.el.setContext(CONTEXTS[ctxIndex]);
            radial.el.show();
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
    mount('preview-input-readonly', () => MpiInput.mount(slot('preview-input-readonly'), { type: 'text', label: 'Read-only Field', value: 'Cannot edit this', readonly: true, info: 'readonly prop' }));
    mount('preview-input-autoheight', () => MpiInput.mount(slot('preview-input-autoheight'), { type: 'textarea', label: 'Auto-height Textarea', placeholder: 'Type here to grow...', autoHeight: true, info: 'autoHeight prop' }));

    // ── MpiDropdown (Primitive) ───────────────────────────────────────────────
    mount('preview-prim-dropdown-down', () => {
        const dd = MpiDropdown.mount(slot('preview-prim-dropdown-down'), {
            options: ['Option A', 'Option B', 'Option C', 'Option D'],
            placeholder: 'Choose...',
            direction: 'down',
        });
        dd.on('change', ({ value }) => {
            const infoBar = document.getElementById('shell-info-text');
            if (infoBar) infoBar.textContent = `Dropdown (Primitive): ${value}`;
        });
    });

    mount('preview-prim-dropdown-up', () => {
        const dd = MpiDropdown.mount(slot('preview-prim-dropdown-up'), {
            options: ['Red', 'Green', 'Blue', 'Cyan', 'Magenta'],
            value: 'Green',
            direction: 'up',
        });
        dd.on('change', ({ value }) => {
            const infoBar = document.getElementById('shell-info-text');
            if (infoBar) infoBar.textContent = `Dropdown (Primitive) up: ${value}`;
        });
    });

    mount('preview-prim-dropdown-disabled', () => {
        MpiDropdown.mount(slot('preview-prim-dropdown-disabled'), {
            options: ['Alpha', 'Beta'],
            placeholder: 'Disabled',
            disabled: true,
        });
    });

    // ── MpiRadioGroup (Primitive) ─────────────────────────────────────────────
    mount('preview-radio-group-default', () => {
        const rg = MpiRadioGroup.mount(slot('preview-radio-group-default'), {
            options: ['Camera', 'Lighting', 'Style'],
            value: 'Camera',
            name: 'config-tab',
        });
        rg.on('select', ({ value }) => {
            const infoBar = document.getElementById('shell-info-text');
            if (infoBar) infoBar.textContent = `RadioGroup select: ${value}`;
        });
    });

    mount('preview-radio-group-values', () => {
        const rg = MpiRadioGroup.mount(slot('preview-radio-group-values'), {
            options: [
                { label: '16:9', value: '16_9' },
                { label: '4:3', value: '4_3' },
                { label: '1:1', value: '1_1' },
            ],
            value: '16_9',
            name: 'aspect-ratio',
        });
        rg.on('select', ({ value }) => {
            const infoBar = document.getElementById('shell-info-text');
            if (infoBar) infoBar.textContent = `RadioGroup (obj options): ${value}`;
        });
    });

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

    // ── StatusBar progress test ───────────────────────────────────────────────
    mount('preview-statusbar-progress', () => {
        const wrapper = slot('preview-statusbar-progress');
        wrapper.style.flexDirection = 'column';
        wrapper.style.gap = '0.5rem';
        wrapper.style.alignItems = 'flex-start';

        const mkSlot = () => { const d = document.createElement('div'); wrapper.appendChild(d); return d; };

        const input = MpiInput.mount(mkSlot(), { type: 'number', label: 'Progress (0–100)', value: 0, min: 0, max: 100, step: 1, info: 'Set a value to drive the StatusBar progress fill' });
        const btnStart = MpiButton.mount(mkSlot(), { text: 'Start', variant: 'primary', size: 'sm', info: 'Begin a fake generation job' });
        const btnComplete = MpiButton.mount(mkSlot(), { text: 'Complete', variant: 'secondary', size: 'sm', info: 'Mark job done and fire a toast' });
        const btnCancel = MpiButton.mount(mkSlot(), { text: 'Cancel', variant: 'danger', size: 'sm', info: 'Cancel the active job' });

        input.on('change', ({ value }) => StatusBar.progress.update(value / 100));
        btnStart.on('click', () => StatusBar.progress.start('Generating image...'));
        btnComplete.on('click', () => StatusBar.progress.complete('Image generated successfully!'));
        btnCancel.on('click', () => StatusBar.progress.cancel());
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
            modelType: 'social',
            value: '16:9'
        });
        sel.on('change', (data) => console.log('[gallery] video ratio change:', data));
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

    mount('preview-toolbar-default', () => {
        // Correct pattern: Mount first, then attach listeners, then pass to parent
        const save = MpiButton.mount(document.createElement('div'), { icon: 'download', info: 'Save current settings as a preset', size: 'sm', variant: 'ghost' });
        save.on('click', () => {
            console.log('[gallery] toolbar save clicked');
            Events.emit('media:updated', { msg: 'Preset saved to library', type: 'success' });
        });

        const trash = MpiButton.mount(document.createElement('div'), { icon: 'edit', info: 'Delete selected preset', size: 'sm', variant: 'ghost' });
        trash.on('click', () => console.log('[gallery] toolbar delete'));

        const tb = MpiToolbar.mount(slot('preview-toolbar-default'), {
            presets: ['Wokflow A', 'Workflow B'],
            value: 'Wokflow A',
            comps: [save, trash]
        });

        // System-level reaction
        Events.on('media:updated', ({ msg, type }) => {
            const toastWrapper = document.createElement('div');
            document.body.appendChild(toastWrapper);
            MpiToast.mount(toastWrapper, { message: msg, variant: type || 'info', duration: 3000 });
        });

        tb.on('select', ({ value }) => console.log('[gallery] toolbar select:', value));
    });

    mount('preview-toolbar-empty', () => {
        const tb = MpiToolbar.mount(slot('preview-toolbar-empty'), {
            presets: [],
            placeholder: 'No presets saved yet...'
        });
        tb.on('save', () => console.log('[gallery] toolbar save (default)'));
        tb.on('delete', () => console.log('[gallery] toolbar delete (default)'));
    });

    mount('preview-toolbar-left-area', () => {
        const tb = MpiToolbar.mount(slot('preview-toolbar-left-area'), {
            title: 'Generation',
            model: { value: 0.75 },
            clip: { value: 0.50 },
            presets: ['None', 'Model A', 'Model B'],
            value: 'None',
            placeholder: 'None',
            comps: []
        });

        tb.on('select', ({ value }) => console.log('[gallery] toolbar select:', value));
        tb.on('modelChange', ({ value }) => console.log('[gallery] model strength changed:', value));
        tb.on('clipChange', ({ value }) => console.log('[gallery] clip strength changed:', value));
    });

    mount('preview-toolbar-strengths-only', () => {
        const tb = MpiToolbar.mount(slot('preview-toolbar-strengths-only'), {
            model: { value: 1.00 },
            clip: { value: 0.00 },
            presets: ['Model A', 'Model B'],
            placeholder: 'None'
        });

        tb.on('modelChange', ({ value }) => console.log('[gallery] model strength:', value));
        tb.on('clipChange', ({ value }) => console.log('[gallery] clip strength:', value));
        tb.on('select', ({ value }) => console.log('[gallery] toolbar select:', value));
    });

    // ── MpiCameraConfig (Compound) ────────────────────────────────────────────
    mount('preview-camera-config', () => {
        const cc = MpiCameraConfig.mount(slot('preview-camera-config'), {
            value: { cam_type: '35mm Film', shot_angle: 'Low Angle (LA)', shot_size: 'Medium Shot (MS)' }
        });
        cc.on('change', ({ values }) => console.log('[gallery] camera config change:', values));
    });

    // ── MpiLightingConfig (Compound) ──────────────────────────────────────────
    mount('preview-lighting-config', () => {
        const lc = MpiLightingConfig.mount(slot('preview-lighting-config'), {
            value: { light_type: 'Cinematic Lighting', light_color: 'Teal and Orange' }
        });
        lc.on('change', ({ values }) => console.log('[gallery] lighting config change:', values));
    });

    // ── MpiStyleConfig (Compound) ─────────────────────────────────────────────
    mount('preview-style-config', () => {
        const sc = MpiStyleConfig.mount(slot('preview-style-config'), {
            value: { color_grade: 'Cinematic Teal & Orange', color_contrast: 'High Contrast' }
        });
        sc.on('change', ({ values }) => console.log('[gallery] style config change:', values));
    });

    // ── MpiVideoScene (Compound) ──────────────────────────────────────────────
    mount('preview-video-scene', () => {
        const vs = MpiVideoScene.mount(slot('preview-video-scene'), {
            scenes: [
                { description: 'Hero walks through door', angle: 'Low Angle (LA)', size: 'Wide Shot (WS)', movement: 'Dolly In', speed: 'Normal Time', duration: 8 },
                { description: 'Close-up on face', angle: 'Front Angle (FA)', size: 'Close-Up (CU)', movement: 'Static', speed: 'Slow Motion 60fps', duration: 4 }
            ]
        });
        vs.on('change', ({ scenes }) => console.log('[gallery] video scene change:', scenes));
    });

    // ── MpiOkCancel (Compound) ────────────────────────────────────────────────
    mount('preview-okcancal-standard', () => {
        const slotEl = slot('preview-okcancal-standard');

        const triggerSlot = document.createElement('div');
        slotEl.appendChild(triggerSlot);
        const btn = MpiButton.mount(triggerSlot, {
            icon: 'help',
            label: 'Confirm',
            variant: 'primary',
            size: 'md',
            info: 'Click to show standard confirmation dialog'
        });

        // Mount once — el.show() portals it to body with backdrop on each call
        const okc = MpiOkCancel.mount(document.createElement('div'), {
            title: 'Confirm Action',
            text: 'Are you sure you want to proceed with this operation?'
        });

        btn.on('click', () => okc.el.show());
        okc.on('ok', () => console.log('[gallery] MpiOkCancel OK clicked'));
        okc.on('cancel', () => console.log('[gallery] MpiOkCancel Cancel clicked'));
    });

    mount('preview-okcancal-with-input', () => {
        const slotEl = slot('preview-okcancal-with-input');

        const triggerSlot = document.createElement('div');
        slotEl.appendChild(triggerSlot);
        const btn = MpiButton.mount(triggerSlot, {
            icon: 'edit',
            label: 'New Preset',
            variant: 'primary',
            size: 'md',
            info: 'Click to save a new preset with custom name'
        });

        const okc = MpiOkCancel.mount(document.createElement('div'), {
            title: 'Enter Preset Name',
            text: 'Create a new preset with a unique name:',
            inputPlaceholder: 'e.g., My Custom Preset',
        });

        btn.on('click', () => okc.el.show());
        okc.on('ok', ({ inputValue }) => console.log('[gallery] MpiOkCancel OK with input:', inputValue));
        okc.on('cancel', () => console.log('[gallery] MpiOkCancel Cancel clicked'));
        okc.on('input', ({ value }) => console.log('[gallery] MpiOkCancel input changed:', value));
    });

    mount('preview-okcancal-no-cancel', () => {
        const slotEl = slot('preview-okcancal-no-cancel');

        const triggerSlot = document.createElement('div');
        slotEl.appendChild(triggerSlot);
        const btn = MpiButton.mount(triggerSlot, {
            icon: 'check',
            label: 'Status',
            variant: 'primary',
            size: 'md',
            info: 'Click to show completion status (no cancel button)'
        });

        const okc = MpiOkCancel.mount(document.createElement('div'), {
            title: 'Operation Complete',
            text: 'Your changes have been saved successfully.',
            showCancel: false,
            okLabel: 'Close'
        });

        btn.on('click', () => okc.el.show());
        okc.on('ok', () => console.log('[gallery] MpiOkCancel OK clicked'));
    });

    // ── MpiModal (Primitive) ──────────────────────────────────────────────────
    mount('preview-modal-standard', () => {
        const slotEl = slot('preview-modal-standard');

        const triggerSlot = document.createElement('div');
        slotEl.appendChild(triggerSlot);
        const btn = MpiButton.mount(triggerSlot, {
            icon: 'layers',
            label: 'Open Modal',
            variant: 'primary',
            size: 'md',
            info: 'Click to show a bare MpiModal shell'
        });

        const modal = MpiModal.mount(document.createElement('div'), {
            width: 'min(400px, 90vw)',
        });

        // Simple content placed inside the modal shell
        const inner = document.createElement('div');
        inner.style.cssText = 'padding:1.5rem;display:flex;flex-direction:column;gap:1rem;';

        const title = document.createElement('div');
        title.textContent = 'MpiModal Shell';
        title.style.cssText = 'font-size:1.25rem;font-weight:700;color:var(--text-primary,#fff);';
        inner.appendChild(title);

        const body = document.createElement('div');
        body.textContent = 'This is a bare MpiModal primitive. It owns the backdrop, portal, Overlays queue, and Escape handling. Compounds mount their content inside.';
        body.style.cssText = 'font-size:0.9rem;color:var(--text-secondary,#aaa);line-height:1.5;';
        inner.appendChild(body);

        const closeSlot = document.createElement('div');
        closeSlot.style.cssText = 'display:flex;justify-content:flex-end;padding-top:0.5rem;border-top:1px solid var(--border-secondary,rgba(100,100,120,0.2));';
        const closeBtn = MpiButton.mount(document.createElement('div'), {
            text: 'Close',
            variant: 'secondary',
            size: 'md'
        });
        closeBtn.on('click', () => modal.el.hide());
        closeSlot.appendChild(closeBtn.el);
        inner.appendChild(closeSlot);

        modal.el.appendChild(inner);
        btn.on('click', () => modal.el.show());
        console.log('[gallery] MpiModal mounted');
    });

    // ── MpiNewProject (Compound) ──────────────────────────────────────────────
    mount('preview-newproject-standard', () => {
        const slotEl = slot('preview-newproject-standard');
        const triggerSlot = document.createElement('div');
        slotEl.appendChild(triggerSlot);
        const btn = MpiButton.mount(triggerSlot, {
            icon: 'plus',
            label: '+ New Project',
            variant: 'primary',
            size: 'md',
            info: 'Click to show the New Project dialog'
        });
        const dialog = MpiNewProject.mount(document.createElement('div'));
        dialog.on('create', ({ name, location }) =>
            console.log('[gallery] MpiNewProject create:', { name, location }));
        dialog.on('cancel', () => console.log('[gallery] MpiNewProject cancelled'));
        btn.on('click', () => dialog.el.show());
    });

    // ── MpiInstalledDisplay (Compound) ────────────────────────────────────────
    mount('preview-installed-display-full', () => {
        const slotEl = slot('preview-installed-display-full');
        const wrap = document.createElement('div');
        wrap.style.width = '340px';
        slotEl.appendChild(wrap);
        const inst = MpiInstalledDisplay.mount(wrap, {
            title: 'SDXL (Uncensored)',
            meta: '13.75GB REQUIRED',
            text: 'A NSFW SDXL-based workflow using the Lustify V7 for fast generations and the official SDXL Refiner for higher quality images.',
            icon: 'info',
            iconText: '8GB VRAM REQUIRED',
            iconColor: 'danger',
            showDeleteModels: true,
            deleteModelsActive: false,
            deleteLabel: 'Uninstall'
        });
        inst.on('delete', () => console.log('[gallery] MpiInstalledDisplay delete clicked'));
        inst.on('deleteModels', ({ active }) => console.log('[gallery] MpiInstalledDisplay deleteModels:', active));
    });

    mount('preview-installed-display-simple', () => {
        const slotEl = slot('preview-installed-display-simple');
        const wrap = document.createElement('div');
        wrap.style.width = '340px';
        slotEl.appendChild(wrap);
        const inst = MpiInstalledDisplay.mount(wrap, {
            title: 'Flux Dev',
            meta: '23.8GB REQUIRED',
            text: 'The standard Flux Dev model for high-quality text-to-image generation at various resolutions.',
            icon: 'info',
            iconText: '16GB VRAM REQUIRED',
            iconColor: 'danger',
            showDeleteModels: false,
            deleteLabel: 'Uninstall'
        });
        inst.on('delete', () => console.log('[gallery] MpiInstalledDisplay simple delete clicked'));
    });

    // ── MpiProjectCard (Compound) ───────────────────────────────────────────
    mount('preview-project-card-none', () => {
        const pc = MpiProjectCard.mount(slot('preview-project-card-none'), {
            title: 'Empty Project',
            date: '4 Apr 2026'
        });
        pc.on('click', () => console.log('[gallery] project card clicked'));
        pc.on('delete', () => console.log('[gallery] project card delete clicked'));
    });

    mount('preview-project-card-image', () => {
        MpiProjectCard.mount(slot('preview-project-card-image'), {
            title: 'Landscape Design',
            date: '3 Apr 2026',
            media: { type: 'image', src: 'media-for-testing/img (1).png' }
        });
    });

    mount('preview-project-card-video', () => {
        MpiProjectCard.mount(slot('preview-project-card-video'), {
            title: 'Motion Graphics',
            date: '2 Apr 2026',
            media: { type: 'video', src: 'media-for-testing/video-16-9.mp4' }
        });
    });

    // ── MpiModelsModal (Block) ─────────────────────────────────────────────
    mount('preview-models-modal-default', () => {
        const slotEl = slot('preview-models-modal-default');

        const triggerSlot = document.createElement('div');
        slotEl.appendChild(triggerSlot);
        const btn = MpiButton.mount(triggerSlot, {
            icon: 'download',
            label: 'Open Models',
            variant: 'primary',
            info: 'Click to show MpiModelsModal — replaces the main area'
        });

        const modal = MpiModelsModal.mount(document.createElement('div'), {
            icon: 'download',
            title: 'Model Manager',
            text: 'Select a model pack to install. Required files will be fetched automatically.',
            footer: 'Models are stored locally and never shared.',
            closable: true
        });

        btn.on('click', () => modal.el.show());
        modal.on('close', () => console.log('[gallery] MpiModelsModal closed'));
    });

    // ── MpiErrorDialog (Compound) ────────────────────────────────────────────────
    mount('preview-error-dialog-default', () => {
        const slotEl = slot('preview-error-dialog-default');

        const triggerSlot = document.createElement('div');
        slotEl.appendChild(triggerSlot);
        const btn = MpiButton.mount(triggerSlot, {
            icon: 'info',
            label: 'Trigger Error',
            variant: 'danger',
            info: 'Click to test the error dialog'
        });

        const dialog = MpiErrorDialog.mount(document.createElement('div'), {
            title: 'ComfyUI failed to start',
            message: 'Connection refused on port 8188. Ensure the engine is installed and try again.',
        });

        btn.on('click', () => dialog.el.show());
    });

    // ── MpiCompareOverlay (Compound) ────────────────────────────────────────────
    mount('preview-compare-overlay-default', () => {
        const slotEl = slot('preview-compare-overlay-default');

        const triggerSlot = document.createElement('div');
        slotEl.appendChild(triggerSlot);
        const btn = MpiButton.mount(triggerSlot, {
            icon: 'compare',
            label: 'Open Compare',
            variant: 'primary',
            info: 'Click to test the compare overlay with two placeholder images',
        });

        const overlay = MpiCompareOverlay.mount(document.createElement('div'));

        btn.on('click', () => {
            // Use placeholder images for gallery demo
            overlay.el.open(
                { filePath: 'https://picsum.photos/seed/before/800/600', name: 't2i_001' },
                { filePath: 'https://picsum.photos/seed/after/800/600', name: 'upscaled_001' }
            );
        });
    });

    // ── MpiStartingComfy (Compound) ─────────────────────────────────────────────
    mount('preview-starting-comfy-default', () => {
        const slotEl = slot('preview-starting-comfy-default');

        const triggerSlot = document.createElement('div');
        slotEl.appendChild(triggerSlot);
        const btn = MpiButton.mount(triggerSlot, {
            icon: 'play',
            label: 'Start Engine',
            variant: 'primary',
            info: 'Click to test the engine startup modal'
        });

        const modal = MpiStartingComfy.mount(document.createElement('div'));

        btn.on('click', () => {
            modal.el.show();
            // Simulate startup success after 3 seconds
            setTimeout(() => {
                modal.el.hide();
            }, 3000);
        });
    });

    // ── MpiAutoMaskThumbs (Compound) ──────────────────────────────────────────
    mount('preview-auto-mask-thumbs', () => {
        const thumbs = MpiAutoMaskThumbs.mount(slot('preview-auto-mask-thumbs'));
        // Seed with placeholder data URLs representing detected segments
        const placeholders = Array.from({ length: 6 }, (_, i) => {
            const c = document.createElement('canvas');
            c.width = 56; c.height = 56;
            const ctx = c.getContext('2d');
            const hue = (i * 55) % 360;
            ctx.fillStyle = `hsl(${hue}, 60%, 35%)`;
            ctx.fillRect(0, 0, 56, 56);
            ctx.fillStyle = '#fff';
            ctx.font = 'bold 18px sans-serif';
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.fillText(i + 1, 28, 28);
            return c.toDataURL();
        });
        thumbs.el.setImages(placeholders);
        thumbs.on('change', ({ picks }) =>
            console.log('[gallery] MpiAutoMaskThumbs picks:', [...picks])
        );
    });

    // ── MpiToolActionBar with topSlot (Compound) ─────────────────────────────
    mount('preview-tool-action-bar-top', () => {
        const thumbs = MpiAutoMaskThumbs.mount(document.createElement('div'));
        const placeholders = Array.from({ length: 4 }, (_, i) => {
            const c = document.createElement('canvas');
            c.width = 56; c.height = 56;
            const ctx = c.getContext('2d');
            ctx.fillStyle = `hsl(${i * 80}, 55%, 40%)`;
            ctx.fillRect(0, 0, 56, 56);
            return c.toDataURL();
        });
        thumbs.el.setImages(placeholders);

        const bar = MpiToolActionBar.mount(slot('preview-tool-action-bar-top'), {
            topSlot: thumbs,
            actions: [
                { key: 'detect', icon: 'search', label: 'Detect', variant: 'primary', info: 'Run detection' },
                { key: 'apply', icon: 'check', label: 'Apply', variant: 'primary', info: 'Apply mask' },
                { key: 'cancel', icon: 'close', label: 'Cancel', variant: 'ghost', info: 'Cancel' },
            ],
        });
        bar.el.show();
        bar.on('action', ({ key }) => console.log('[gallery] MpiToolActionBar action:', key));
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
