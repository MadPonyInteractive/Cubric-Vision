import { ComponentFactory } from '../../factory.js';

/**
 * Icon registry — fill="currentColor" Material-style paths, 24x24 grid.
 * Sourced from the app's existing inline SVGs (sidebar, modals, toolbars).
 * Source of thruth for all app icons
 */
export const ICONS = {
    // ── Navigation ────────────────────────────────────────────────────────────
    'menu': '<path d="M3 18h18v-2H3v2zm0-5h18v-2H3v2zm0-7v2h18V6H3z"/>',
    'close': '<path d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z"/>',
     'chevronDown': '<path d="M7 10l5 5 5-5H7z"/>',
    'chevronUp': '<path d="M7 14l5-5 5 5H7z"/>',
    'chevronRight': '<path d="M10 6L8.59 7.41 13.17 12l-4.58 4.59L10 18l6-6z"/>',
    'back': '<path d="M20 11H7.83l5.59-5.59L12 4l-8 8 8 8 1.41-1.41L7.83 13H20v-2z"/>',

    // ── Actions ───────────────────────────────────────────────────────────────
    'check': '<path d="M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41z"/>',
    'plus': '<path d="M19 13h-6v6h-2v-6H5v-2h6V5h2v6h6v2z"/>',
    'minus': '<path d="M19 13H5v-2h14v2z"/>',
    'trash': '<path d="M6 19c0 1.1.9 2 2 2h8c1.1 0 2-.9 2-2V7H6v12zM19 4h-3.5l-1-1h-5l-1 1H5v2h14V4z"/>',
    'edit': '<path d="M3 17.25V21h3.75L17.81 9.94l-3.75-3.75L3 17.25zM20.71 7.04a1 1 0 0 0 0-1.41l-2.34-2.34a1 1 0 0 0-1.41 0l-1.83 1.83 3.75 3.75 1.83-1.83z"/>',
    'copy': '<path d="M16 1H4c-1.1 0-2 .9-2 2v14h2V3h12V1zm3 4H8c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h11c1.1 0 2-.9 2-2V7c0-1.1-.9-2-2-2zm0 16H8V7h11v14z"/>',
    'download': '<path d="M19 9h-4V3H9v6H5l7 7 7-7zM5 18v2h14v-2H5z"/>',
    'upload': '<path d="M9 16h6v-6h4l-7-7-7 7h4zm-4 2h14v2H5z"/>',
    'refresh': '<path d="M12 4V1L8 5l4 4V6c3.31 0 6 2.69 6 6 0 1.01-.25 1.97-.7 2.8l1.46 1.46A7.93 7.93 0 0020 12c0-4.42-3.58-8-8-8zm0 14c-3.31 0-6-2.69-6-6 0-1.01.25-1.97.7-2.8L5.24 7.74A7.93 7.93 0 004 12c0 4.42 3.58 8 8 8v3l4-4-4-4v3z"/>',
    'search': '<path d="M15.5 14h-.79l-.28-.27A6.471 6.471 0 0 0 16 9.5 6.5 6.5 0 1 0 9.5 16c1.61 0 3.09-.59 4.23-1.57l.27.28v.79l5 4.99L20.49 19l-4.99-5zm-6 0C7.01 14 5 11.99 5 9.5S7.01 5 9.5 5 14 7.01 14 9.5 11.99 14 9.5 14z"/>',
    'heart': '<path d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z"/>',
    'enhance': '<path d="M7.5 5.6L10 7 8.6 4.5 10 2 7.5 3.4 5 2l1.4 2.5L5 7zm12 9.8l-2.5-1.4L14 15.4l1.4-2.5L14 10.4l2.5 1.4L19 10.4l-1.4 2.5L19 15.4zm-1.2-11.3l-.8-.8L4 16.8 6 18.8 19.3 5.5l-.8-.8-1.7 1.7-1.3-1.3z"/>',

    // ── Media / Generate ──────────────────────────────────────────────────────
    'generate': '<path d="M5 13h11.17l-4.88 4.88c-.39.39-.39 1.03 0 1.42.39.39 1.02.39 1.41 0l6.59-6.59a.996.996 0 0 0 0-1.41l-6.58-6.6a.996.996 0 1 0-1.41 1.41L16.17 11H5c-.55 0-1 .45-1 1s.45 1 1 1z"/>',
    'play': '<path d="M8 5v14l11-7z"/>',
    'pause': '<path d="M6 19h4V5H6v14zm8-14v14h4V5h-4z"/>',
    'stop': '<path d="M6 6h12v12H6z"/>',
    'bolt': '<path d="M13 2L3 14h9l-1 8 10-12h-9l1-8z"/>',
    'sparkle': '<path d="M12 3l2.09 6.26L20 12l-5.91 2.74L12 21l-2.09-6.26L4 12l5.91-2.74z"/>',
    'layers': '<path d="M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5-10-5-10 5zM2 12l10 5 10-5-10-5-10 5z"/>',
    'seed': '<path d="M9 3c0 4.5 6 4.5 6 9s-6 4.5-6 9"/><path d="M15 3c0 4.5-6 4.5-6 9s6 4.5 6 9"/><path d="M10 6h4"/><path d="M10 18h4"/><path d="M11 12h2"/>',

    // ── App Sections ──────────────────────────────────────────────────────────
    'folder': '<path d="M20 6h-8l-2-2H4c-1.1 0-2 .9-2 2v12c0 1.1.9 2 2 2h16c1.1 0 2-.9 2-2V8c0-1.1-.9-2-2-2z"/>',
    'media': '<path d="M4 6H2v14c0 1.1.9 2 2 2h14v-2H4V6zm16-4H8c-1.1 0-2 .9-2 2v12c0 1.1.9 2 2 2h12c1.1 0 2-.9 2-2V4c0-1.1-.9-2-2-2zm-8 12.5v-9l6 4.5-6 4.5z"/>',
    'image': '<path d="M21 19V5c0-1.1-.9-2-2-2H5c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2zM8.5 13.5l2.5 3.01L14.5 12l4.5 6H5l3.5-4.5z"/>',
    'compare': '<path d="M10 3H5c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h5v2h2V1h-2v2zm0 15H5V5h5v13zm9-15h-5v2h5v13h-5v2h5c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2z"/>',
    'crop': '<path d="M7 1L5 3v14c0 1.1.9 2 2 2h14l2-2V3l-2-2H7zm14 16H7V3h14v14zM9 5h10v10H9V5zm2 2v6h6V7h-6z"/>',
    'video': '<path d="M17 10.5V7a1 1 0 0 0-1-1H4a1 1 0 0 0-1 1v10a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1v-3.5l4 4v-11l-4 4z"/>',
    'audio': '<path d="M12 3v10.55A4 4 0 1 0 14 17V7h4V3h-6z"/>',
    'chat': '<path d="M20 2H4c-1.1 0-2 .9-2 2v18l4-4h14c1.1 0 2-.9 2-2V4c0-1.1-.9-2-2-2z"/>',
    'text': '<path d="M19 3H5c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2zm-5 14H7v-2h7v2zm3-4H7v-2h10v2zm0-4H7V7h10v2z"/>',
    'translate': '<path d="M12.87 15.07l-2.54-2.51.03-.03A17.52 17.52 0 0 0 14.07 6H17V4h-7V2H8v2H1v2h11.17C11.5 7.92 10.44 9.75 9 11.35 8.07 10.32 7.3 9.19 6.69 8h-2c.73 1.63 1.73 3.17 2.98 4.56l-5.09 5.02L4 19l5-5 3.11 3.11.76-2.04zM18.5 10h-2L12 22h2l1.12-3h4.75L21 22h2l-4.5-12zm-2.62 7l1.62-4.33L19.12 17h-3.24z"/>',
    'grid': '<path d="M13 13v8h8v-8h-8zM3 21h8v-8H3v8zM3 11h8V3H3v8zM13 3v8h8V3h-8z"/>',
    'upscaler': '<path d="M12 2l-5.5 9h11L12 2zm0 3.84L13.93 9h-3.87L12 5.84zM4 14v2h16v-2H4zm0 4v2h16v-2H4z"/>',
    'detailer': '<path d="M16 11c1.66 0 2.99-1.34 2.99-3S17.66 5 16 5c-1.66 0-3 1.34-3 3s1.34 3 3 3zm-8 0c1.66 0 2.99-1.34 2.99-3S9.66 5 8 5C6.34 5 5 6.34 5 8s1.34 3 3 3zm0 2c-2.33 0-7 1.17-7 3.5V19h14v-2.5c0-2.33-4.67-3.5-7-3.5z"/>',
    'mask': '<path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm0 18c-4.41 0-8-3.59-8-8s3.59-8 8-8 8 3.59 8 8-3.59 8-8 8zm4.5-8.5c-.83 0-1.5-.67-1.5-1.5s.67-1.5 1.5-1.5 1.5.67 1.5 1.5-.67 1.5-1.5 1.5zM9 11.5c-.83 0-1.5-.67-1.5-1.5s.67-1.5 1.5-1.5 1.5.67 1.5 1.5-.67 1.5-1.5 1.5zm3 7c-2.33 0-4.31-1.46-5.11-3.5h10.22c-.8 2.04-2.78 3.5-5.11 3.5z"/>',

    // ── System ────────────────────────────────────────────────────────────────
    'settings': '<path d="M19.14 12.94c.04-.3.06-.61.06-.94s-.02-.64-.07-.94l2.03-1.58c.18-.14.23-.41.12-.61l-1.92-3.32c-.12-.22-.37-.29-.59-.22l-2.39.96c-.5-.38-1.03-.7-1.62-.94l-.36-2.54c-.04-.24-.24-.41-.48-.41h-3.84c-.24 0-.43.17-.47.41l-.36 2.54c-.59.24-1.13.57-1.62.94l-2.39-.96c-.22-.08-.47 0-.59.22L2.74 8.87c-.12.21-.08.47.12.61l2.03 1.58c-.05.3-.09.63-.09.94s.02.64.07.94l-2.03 1.58c-.18.14-.23.41-.12.61l1.92 3.32c.12.22.37.29.59.22l2.39-.96c.5.38 1.03.7 1.62.94l.36 2.54c.05.24.24.41.48.41h3.84c.24 0 .44-.17.47-.41l.36-2.54c.59-.24 1.13-.56 1.62-.94l2.39.96c.22.08.47 0 .59-.22l1.92-3.32c.12-.22.07-.47-.12-.61l-2.01-1.58zM12 15.6c-1.98 0-3.6-1.62-3.6-3.6s1.62-3.6 3.6-3.6 3.6 1.62 3.6 3.6-1.62 3.6-3.6 3.6z"/>',
    'help': '<path d="M11 18h2v-2h-2v2zm1-16C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm0 18c-4.41 0-8-3.59-8-8s3.59-8 8-8 8 3.59 8 8-3.59 8-8 8zm0-14c-2.21 0-4 1.79-4 4h2c0-1.1.9-2 2-2s2 .9 2 2c0 2-3 1.75-3 5h2c0-2.25 3-2.5 3-5 0-2.21-1.79-4-4-4z"/>',
    'info': '<path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm1 15h-2v-6h2v6zm0-8h-2V7h2v2z"/>',
    'unload': '<path d="M17 17H7V7h10v10zm3-3V4c0-1.1-.9-2-2-2H6c-1.1 0-2 .9-2 2v10H2v2h2v2c0 1.1.9 2 2 2h2v2h2v-2h4v2h2v-2h2c1.1 0 2-.9 2-2v-2h2v-2h-2zm-2-2v6H6v-6h12zm0-8v6H6V4h12z"/>',

    // ── Volume (from MuteIcon.js) ─────────────────────────────────────────────
    // Use with stroke=false (fill-based, already Material style)
    'volumeOff': '<path d="M16.5 12c0-1.77-1.02-3.29-2.5-4.03v2.21l2.45 2.45c.03-.2.05-.41.05-.63zm2.5 0c0 .94-.2 1.82-.54 2.64l1.51 1.51C20.63 14.91 21 13.5 21 12c0-4.28-2.99-7.86-7-8.77v2.06c2.89.86 5 3.54 5 6.71zM4.27 3L3 4.27 7.73 9H3v6h4l5 5v-6.73l4.25 4.25c-.67.52-1.42.93-2.25 1.18v2.06c1.38-.31 2.63-.95 3.69-1.81L19.73 21 21 19.73l-9-9L4.27 3zM12 4L9.91 6.09 12 8.18V4z"/>',
    'volumeLow': '<path d="M18.5 12c0-1.77-1.02-3.29-2.5-4.03v8.05c1.48-.73 2.5-2.25 2.5-4.02zM5 9v6h4l5 5V4L9 9H5z"/>',
    'volumeHigh': '<path d="M3 9v6h4l5 5V4L7 9H3zm13.5 3c0-1.77-1.02-3.29-2.5-4.03v8.05c1.48-.73 2.5-2.25 2.5-4.02zM14 3.23v2.06c2.89.86 5 3.54 5 6.71s-2.11 5.85-5 6.71v2.06c4.01-.91 7-4.49 7-8.77s-2.99-7.86-7-8.77z"/>',

    // ── Prompt mode (from toolUtils.js) ──────────────────────────────────────
    // 'check' already covers ICON_POSITIVE. Adding negative/prohibited:
    'negative': '<path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zM4 12c0-4.42 3.58-8 8-8 1.85 0 3.55.63 4.9 1.69L5.69 16.9C4.63 15.55 4 13.85 4 12zm8 8c-1.85 0-3.55-.63-4.9-1.69L18.31 7.1c1.06 1.35 1.69 3.05 1.69 4.9 0 4.42-3.58 8-8 8z"/>',

    // ── Aspect Ratio Rects (from ratioUtils.js) ───────────────────────────────
    // These are STROKE-based (<rect> shapes). Use with prop: stroke=true
    'ratio_1_1': '<rect x="4" y="4" width="16" height="16" rx="2"/>',
    'ratio_3_4': '<rect x="5.5" y="3" width="13" height="18" rx="2"/>',
    'ratio_4_3': '<rect x="3" y="5.5" width="18" height="13" rx="2"/>',
    'ratio_4_5': '<rect x="6" y="4" width="12" height="16" rx="2"/>',
    'ratio_5_4': '<rect x="4" y="6" width="16" height="12" rx="2"/>',
    'ratio_5_8': '<rect x="6.5" y="2" width="11" height="20" rx="2"/>',
    'ratio_8_5': '<rect x="2" y="6.5" width="20" height="11" rx="2"/>',
    'ratio_9_16': '<rect x="7" y="2" width="10" height="20" rx="2"/>',
    'ratio_16_9': '<rect x="2" y="7" width="20" height="10" rx="2"/>',
    'gallery': '<rect x="3" y="3" width="18" height="18" rx="2" ry="2"/><circle cx="8.5" cy="8.5" r="1.5"/><polyline points="21 15 16 10 5 21"/>',
    'refresh_stroke': '<path d="M21 12a9 9 0 0 0-9-9 9.75 9.75 0 0 0-6.74 2.74L3 8"/><path d="M3 3v5h5"/><path d="M3 12a9 9 0 0 0 9 9 9.75 9.75 0 0 0 6.74-2.74L21 16"/><path d="M16 16h5v5"/>',
};

/**
 * MpiIcon — Atomic SVG Icon Primitive
 *
 * Props:
 * @param {string}  [name='info']  - Key from ICONS registry
 * @param {'xs'|'sm'|'md'|'lg'|'xl'} [size='md'] - Icon size (via CSS class)
 * @param {'muted'|'accent'|'primary'|'danger'|'success'} [color] - Optional color modifier
 * @param {boolean} [stroke=false] - If true, renders as stroke/outline (for ratio rect icons)
 */
export const MpiIcon = ComponentFactory.create({
    name: 'MpiIcon',
    css: ['js/components/Primitives/MpiIcon/MpiIcon.css'],
    template: (props) => {
        const name = props.name || 'info';
        const size = props.size || 'md';
        const colorClass = props.color ? ` mpi-icon--${props.color}` : '';
        const inner = ICONS[name] || ICONS['info'];
        const isStroke = props.stroke === true;

        const svgAttrs = isStroke
            ? `fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"`
            : `fill="currentColor"`;

        return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" ${svgAttrs}
                     class="mpi-icon mpi-icon--${size}${colorClass}" aria-hidden="true">
            ${inner}
        </svg>`;
    }
});
