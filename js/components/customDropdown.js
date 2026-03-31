/**
 * customDropdown.js — Reusable collapsible file-picker dropdown component.
 *
 * Extracted from shell.js (was private functions — now a proper component).
 * Import and call renderCustomDropdown() anywhere you need a file-picker with
 * folder grouping, active state, and a "None" option.
 *
 * RULES FOR AGENTS:
 * - Do not copy this logic into other files. Import it.
 * - Styling lives in styles/03_forms.css under the .custom-dropdown selector.
 */

/**
 * Truncates a model filename for display (strips extension, applies middle ellipsis).
 * @param {string} path
 * @param {number} maxLen
 * @returns {string}
 */
export function truncatePath(path, maxLen = 30) {
    if (!path || path === 'None') return path;
    let display = path.replace(/\.(safetensors|ckpt|pt|bin|pth)$/i, '');
    if (display.length <= maxLen) return display;
    const start = display.substring(0, Math.floor(maxLen / 2) - 1);
    const end = display.substring(display.length - Math.floor(maxLen / 2) + 1);
    return `${start}...${end}`;
}

/**
 * Renders a collapsible file-picker dropdown into a parent element.
 *
 * Features:
 * - Organizes files by folder (path segment before first '/')
 * - Folders are collapsible
 * - Active item is highlighted
 * - Optional "None" item at the top
 * - Closes when clicking outside
 * - Updates its own label on selection
 *
 * Usage:
 *   import { renderCustomDropdown } from '../components/customDropdown.js';
 *
 *   renderCustomDropdown(
 *     containerEl,          // HTMLElement to render into
 *     ['folder/a.pt', 'b.safetensors'],  // flat file list
 *     currentValue,         // currently selected value (string or null)
 *     (val) => { myState = val; },  // called with new value on selection
 *     true                  // include "None" option at top
 *   );
 *
 * @param {HTMLElement} parent — element to render into (will be cleared)
 * @param {string[]} files — flat list of file paths
 * @param {string|null} currentSelection — currently active value
 * @param {function} onSelect — callback(value: string) called on selection
 * @param {boolean} [includeNone=false] — whether to add a "None" option
 */
export function renderCustomDropdown(parent, files, currentSelection, onSelect, includeNone = false) {
    const dropdown = document.createElement('div');
    dropdown.className = 'custom-dropdown';

    const displayValue = currentSelection
        ? truncatePath(currentSelection)
        : (includeNone ? 'None' : 'Select a file...');

    dropdown.innerHTML = `
        <div class="custom-dropdown-toggle">
            <span title="${currentSelection || ''}">${displayValue}</span>
            <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="3"><path d="M6 9l6 6 6-6"/></svg>
        </div>
        <div class="custom-dropdown-menu hide">
            ${includeNone ? '<div class="custom-dropdown-item" data-value="None">None</div>' : ''}
            <div id="dropdownContent"></div>
        </div>
    `;

    parent.innerHTML = '';
    parent.appendChild(dropdown);

    const toggle = dropdown.querySelector('.custom-dropdown-toggle');
    const menu = dropdown.querySelector('.custom-dropdown-menu');
    const content = dropdown.querySelector('#dropdownContent');

    toggle.addEventListener('click', (e) => {
        e.stopPropagation();
        // Close all other open dropdowns
        document.querySelectorAll('.custom-dropdown-menu').forEach(m => {
            if (m !== menu) m.classList.add('hide');
        });
        menu.classList.toggle('hide');
    });

    document.addEventListener('click', () => menu.classList.add('hide'));

    // Organize files into folders
    const structure = {};
    const rootFiles = [];

    files.forEach(f => {
        if (f.includes('/')) {
            const parts = f.split('/');
            const folder = parts[0];
            const file = parts.slice(1).join('/');
            if (!structure[folder]) structure[folder] = [];
            structure[folder].push({ full: f, short: file });
        } else {
            rootFiles.push(f);
        }
    });

    // Render folders
    Object.keys(structure).sort().forEach(folder => {
        const folderEl = document.createElement('div');
        folderEl.className = 'custom-dropdown-folder';
        folderEl.innerHTML = `
            <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2"><path d="M6 9l6 6 6-6"/></svg>
            ${folder}
        `;

        const filesEl = document.createElement('div');
        filesEl.className = 'custom-dropdown-files hide';

        structure[folder].sort((a, b) => a.short.localeCompare(b.short)).forEach(fileObj => {
            const fileEl = document.createElement('div');
            fileEl.className = 'custom-dropdown-item';
            if (fileObj.full === currentSelection) fileEl.classList.add('active');
            fileEl.textContent = fileObj.short;
            fileEl.title = fileObj.full;
            fileEl.dataset.value = fileObj.full;
            fileEl.addEventListener('click', () => {
                onSelect(fileObj.full);
                toggle.querySelector('span').textContent = truncatePath(fileObj.full);
                toggle.querySelector('span').title = fileObj.full;
                menu.classList.add('hide');
            });
            filesEl.appendChild(fileEl);
        });

        folderEl.addEventListener('click', (e) => {
            e.stopPropagation();
            folderEl.classList.toggle('collapsed');
            filesEl.classList.toggle('hide');
        });

        content.appendChild(folderEl);
        content.appendChild(filesEl);
    });

    // Render root-level files
    rootFiles.sort().forEach(f => {
        const fileEl = document.createElement('div');
        fileEl.className = 'custom-dropdown-item';
        if (f === currentSelection) fileEl.classList.add('active');
        fileEl.textContent = f;
        fileEl.title = f;
        fileEl.dataset.value = f;
        fileEl.addEventListener('click', () => {
            onSelect(f);
            toggle.querySelector('span').textContent = truncatePath(f);
            toggle.querySelector('span').title = f;
            menu.classList.add('hide');
        });
        content.appendChild(fileEl);
    });

    // Handle None option
    if (includeNone) {
        const noneBtn = dropdown.querySelector('.custom-dropdown-item[data-value="None"]');
        if (noneBtn) {
            noneBtn.addEventListener('click', () => {
                onSelect('None');
                toggle.querySelector('span').textContent = 'None';
                toggle.querySelector('span').title = '';
                menu.classList.add('hide');
            });
        }
    }
}
