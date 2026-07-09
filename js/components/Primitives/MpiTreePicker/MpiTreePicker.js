import { ComponentFactory } from '../../factory.js';
import { qs, on } from '../../../utils/dom.js';
import { Events } from '../../../events.js';
import { renderIcon } from '../../../utils/icons.js';

const escapeHtml = (value) => String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');

const optionValue = (opt) => typeof opt === 'string' ? opt : opt.value;
const optionLabel = (opt) => typeof opt === 'string' ? opt : opt.label;

/** basename of a path (last segment after \ or /) */
const baseName = (v) => String(v || '').split(/[\\/]/).pop();

/** basename with the trailing extension removed (keeps dotfiles/no-ext intact) */
const stripExt = (name) => String(name || '').replace(/\.[^.\\/]+$/, '');

/**
 * Build a folder tree from the option list. Root-level items (value with no
 * separator) live at the top level. Returns { folders: Map<name, node>, files }
 * where node is the same shape recursively.
 *
 * The synthetic clear entry (value '') and any disabled entry are pulled OUT of
 * the tree — they render as pinned rows above it.
 */
const buildTree = (options) => {
    const root = { folders: new Map(), files: [] };
    for (const opt of options) {
        const val = optionValue(opt);
        if (val === '') continue;              // clear row handled separately
        if (opt.disabled) continue;            // disabled entry handled separately
        const parts = String(val).split(/[\\/]/);
        const file = parts.pop();
        let node = root;
        for (const seg of parts) {
            if (!node.folders.has(seg)) node.folders.set(seg, { folders: new Map(), files: [] });
            node = node.folders.get(seg);
        }
        node.files.push({ label: file, value: val });
    }
    return root;
};

const sortedFolderNames = (node) => [...node.folders.keys()].sort((a, b) => a.localeCompare(b));
const sortedFiles = (node) => [...node.files].sort((a, b) => a.label.localeCompare(b.label));

/**
 * MpiTreePicker — Searchable folder-tree picker primitive (MPI-233)
 *
 * A drop-in alternative to MpiDropdown for option lists whose values are
 * file-system-style paths (`Folder\Sub\file.ext` or POSIX `/`). The trigger
 * opens a portalled box with a search input + a collapsible folder tree; file
 * rows show only their basename, so two same-prefix paths are distinguishable
 * (the flat dropdown clips them identically). The stored value stays the full
 * path string, so upstream heal/resolve/inject logic is untouched.
 *
 * Not LoRA-specific — the LoRA slots are its first consumer. Reuse it anywhere
 * a large list of path-shaped values needs search + folder structure.
 *
 * Props (mirror MpiDropdown where they overlap):
 * @param {Array<{label:string,value:string,disabled?:boolean}>} [options=[]]
 * @param {string} [value=''] - Selected full path
 * @param {string} [placeholder='Select...'] - Trigger label when nothing selected
 * @param {string} [searchPlaceholder='Search…'] - Placeholder inside the search input
 * @param {string} [fileIcon='image'] - icons.js key for file-row icons
 * @param {boolean} [stripExtension=false] - Hide the file extension in row/trigger labels (value keeps the full path)
 * @param {string} [extraClasses=''] - Additional BEM modifier/helper classes on the root
 *
 * Emits:
 * 'change' { value: string, label: string }
 */
export const MpiTreePicker = ComponentFactory.create({
    name: 'MpiTreePicker',
    css: ['js/components/Primitives/MpiTreePicker/MpiTreePicker.css'],

    template: (props) => {
        const value        = props.value ?? '';
        const placeholder  = props.placeholder ?? 'Select...';
        const extraClasses = props.extraClasses || '';
        const base         = baseName(value);
        const triggerLabel = value ? (props.stripExtension === true ? stripExt(base) : base) : placeholder;
        return `
            <div class="mpi-tree-picker ${extraClasses}">
                <button type="button" class="mpi-tree-picker__trigger">
                    <span class="mpi-tree-picker__label">${escapeHtml(triggerLabel)}</span>
                    <span class="mpi-tree-picker__chevron" aria-hidden="true"></span>
                </button>
            </div>
        `;
    },

    setup: (el, props, emit) => {
        const root    = el;
        const trigger = qs('.mpi-tree-picker__trigger', el);
        const labelEl = qs('.mpi-tree-picker__label', el);
        const _unsubs = [];
        let observer = null;
        let destroyed = false;

        const options           = props.options || [];
        const placeholder        = props.placeholder ?? 'Select...';
        const searchPlaceholder  = props.searchPlaceholder ?? 'Search…';
        const fileIcon           = props.fileIcon ?? 'image';
        const stripExtension     = props.stripExtension === true;
        const noneOpt            = options.find(o => optionValue(o) === '');

        /** Display text for a file basename — honours stripExtension (value is untouched). */
        const fileLabel = (name) => stripExtension ? stripExt(name) : name;
        const missingOpt         = options.find(o => o.disabled);
        const tree               = buildTree(options);

        // Folder expand state, keyed by full folder path (e.g. "SDXL/Models").
        const expanded = new Set();
        let query = '';

        // Portalled box lives in document.body (immune to ancestor overflow/transform).
        const box = document.createElement('div');
        box.className = `mpi-tree-picker__box ${props.extraClasses || ''}`.trim();
        box.innerHTML = `
            <div class="mpi-tree-picker__search">
                <input type="text" class="mpi-tree-picker__search-input"
                       placeholder="${escapeHtml(searchPlaceholder)}" spellcheck="false" />
            </div>
            <div class="mpi-tree-picker__tree" role="listbox"></div>
        `;
        document.body.appendChild(box);
        const treeEl   = qs('.mpi-tree-picker__tree', box);
        const searchEl = qs('.mpi-tree-picker__search-input', box);

        /** Auto-expand the folder chain leading to the selected value on open. */
        const expandToValue = () => {
            const v = props.value;
            if (!v) return;
            const parts = String(v).split(/[\\/]/);
            parts.pop(); // drop filename
            let path = '';
            for (const seg of parts) {
                path = path ? `${path}/${seg}` : seg;
                expanded.add(path);
            }
        };

        const fileRowHtml = (opt, depth, disabled = false) => {
            const active = optionValue(opt) === props.value ? 'is-active' : '';
            const dis    = disabled ? 'is-disabled' : '';
            return `
                <div class="mpi-tree-picker__row mpi-tree-picker__row--file ${active} ${dis}"
                     style="--depth:${depth}"
                     data-value="${escapeHtml(optionValue(opt))}"
                     data-label="${escapeHtml(optionLabel(opt))}">
                    <span class="mpi-tree-picker__row-icon">${renderIcon(fileIcon, 'sm')}</span>
                    <span class="mpi-tree-picker__row-label">${escapeHtml(disabled ? optionLabel(opt) : fileLabel(optionLabel(opt)))}</span>
                </div>`;
        };

        /** Render the tree recursively. Returns HTML string. */
        const renderNode = (node, depth, pathPrefix) => {
            let html = '';
            for (const name of sortedFolderNames(node)) {
                const path = pathPrefix ? `${pathPrefix}/${name}` : name;
                const isOpen = expanded.has(path);
                const chev = isOpen ? 'chevronDown' : 'chevronRight';
                html += `
                    <div class="mpi-tree-picker__row mpi-tree-picker__row--folder"
                         style="--depth:${depth}" data-folder="${escapeHtml(path)}">
                        <span class="mpi-tree-picker__row-chevron">${renderIcon(chev, 'sm')}</span>
                        <span class="mpi-tree-picker__row-icon">${renderIcon('folder', 'sm')}</span>
                        <span class="mpi-tree-picker__row-label">${escapeHtml(name)}</span>
                    </div>`;
                if (isOpen) html += renderNode(node.folders.get(name), depth + 1, path);
            }
            for (const file of sortedFiles(node)) {
                html += fileRowHtml(file, depth);
            }
            return html;
        };

        /** Flat filtered list when a search query is active — matches basename. */
        const renderFiltered = () => {
            const q = query.toLowerCase();
            const flat = [];
            const walk = (node) => {
                for (const name of sortedFolderNames(node)) walk(node.folders.get(name));
                for (const file of sortedFiles(node)) {
                    if (file.label.toLowerCase().includes(q)) flat.push(file);
                }
            };
            walk(tree);
            if (!flat.length) return `<div class="mpi-tree-picker__empty">No matches</div>`;
            // ponytail: linear rebuild-per-keystroke over the whole tree — fine for
            // hundreds of items; debounce only if it ever hits thousands.
            return flat.map(f => fileRowHtml(f, 0)).join('');
        };

        /** Pinned rows above the tree: clear row + any disabled (missing) entry. */
        const pinnedHtml = () => {
            let html = '';
            if (noneOpt) {
                const active = props.value === '' ? 'is-active' : '';
                html += `
                    <div class="mpi-tree-picker__row mpi-tree-picker__row--none ${active}"
                         data-value="" data-label="${escapeHtml(optionLabel(noneOpt))}">
                        <span class="mpi-tree-picker__row-label">${escapeHtml(optionLabel(noneOpt))}</span>
                    </div>`;
            }
            if (missingOpt) {
                const active = optionValue(missingOpt) === props.value ? 'is-active' : '';
                html += fileRowHtml(missingOpt, 0, true).replace(
                    'mpi-tree-picker__row--file', `mpi-tree-picker__row--file mpi-tree-picker__row--missing ${active}`
                );
            }
            return html;
        };

        const rebuild = () => {
            const body = query ? renderFiltered() : renderNode(tree, 0, '');
            treeEl.innerHTML = pinnedHtml() + body;
        };

        // ── Positioning (lifted from MpiDropdown) ────────────────────────────
        const positionBox = () => {
            const rect = trigger.getBoundingClientRect();
            box.style.minWidth = `${rect.width}px`;
            box.style.left = `${rect.left + window.scrollX}px`;
            // Prefer below; flip above if it would overflow the viewport bottom.
            const below = window.innerHeight - rect.bottom;
            if (below < 280 && rect.top > below) {
                box.style.top = '';
                box.style.bottom = `${window.innerHeight - rect.top + 4}px`;
            } else {
                box.style.top = `${rect.bottom + 4}px`;
                box.style.bottom = '';
            }
        };

        let cleanupScroll = null;
        let cleanupResize = null;

        const closeBox = () => {
            root.classList.remove('is-open');
            box.classList.remove('is-open');
            if (cleanupScroll) { cleanupScroll(); cleanupScroll = null; }
            if (cleanupResize) { cleanupResize(); cleanupResize = null; }
        };

        const openBox = () => {
            query = '';
            searchEl.value = '';
            expanded.clear();
            expandToValue();
            rebuild();
            positionBox();
            root.classList.add('is-open');
            box.classList.add('is-open');
            searchEl.focus();
            // Scroll the active row into view.
            qs('.mpi-tree-picker__row.is-active', box)?.scrollIntoView({ block: 'nearest' });
            cleanupScroll = on(window, 'scroll', (e) => {
                if (box.contains(e.target)) return;
                closeBox();
            }, { passive: true, capture: true });
            cleanupResize = on(window, 'resize', closeBox, { passive: true });
        };

        const destroy = () => {
            if (destroyed) return;
            destroyed = true;
            closeBox();
            if (box.parentNode) box.parentNode.removeChild(box);
            _unsubs.forEach(fn => fn?.());
            observer?.disconnect();
        };
        el.destroy = destroy;

        // ── Events ───────────────────────────────────────────────────────────
        _unsubs.push(on(trigger, 'click', (e) => {
            e.stopPropagation();
            box.classList.contains('is-open') ? closeBox() : openBox();
        }));

        _unsubs.push(on(searchEl, 'input', () => {
            query = searchEl.value.trim();
            rebuild();
        }));

        _unsubs.push(on(treeEl, 'click', (e) => {
            e.stopPropagation();
            const folderRow = e.target.closest('.mpi-tree-picker__row--folder');
            if (folderRow) {
                const path = folderRow.dataset.folder;
                expanded.has(path) ? expanded.delete(path) : expanded.add(path);
                rebuild();
                return;
            }
            const fileRow = e.target.closest('.mpi-tree-picker__row');
            if (!fileRow || fileRow.classList.contains('is-disabled')) return;

            const value = fileRow.dataset.value ?? '';
            const label = fileRow.dataset.label || value;
            props.value = value;
            labelEl.textContent = value ? fileLabel(baseName(value)) : placeholder;
            closeBox();
            emit('change', { value, label });
        }));

        // Close on outside click + global popup-close signal.
        _unsubs.push(on(document, 'click', (e) => {
            if (!el.contains(e.target) && !box.contains(e.target)) closeBox();
        }));
        _unsubs.push(Events.on('ui:close-all-popups', closeBox));

        // Tear down the portal node when el leaves the DOM (re-mount on state:changed).
        observer = new MutationObserver(() => {
            if (!document.contains(el)) destroy();
        });
        observer.observe(document.body, { childList: true, subtree: true });
    }
});
