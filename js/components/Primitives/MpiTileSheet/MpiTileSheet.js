import { ComponentFactory } from '../../factory.js';
import { ce, on } from '../../../utils/dom.js';
import { renderIcon } from '../../../utils/icons.js';

/**
 * MpiTileSheet — shared contact-sheet tile grid (Primitive, MPI-356).
 *
 * One sheet renders one grid of tiles. Three surfaces use it: the Model Library,
 * the App Library, and the model picker. Before this component the tile markup
 * was written twice (MpiModelManager._buildTile and MpiFlowLibrary._buildTile)
 * against ONE copy of the CSS that only the Model Library owned — the App
 * Library borrowed the selectors across a component boundary and lost
 * `--lib-card` in the process.
 *
 * A Primitive, not a Compound, because both libraries are Compounds and the
 * hierarchy forbids Compounds importing Compounds.
 *
 * Deliberately state-DUMB: consumers own their own status logic and hand the
 * bottom row over as an HTML string (`item.state`). That keeps install
 * progress, availability chips, and the picker's LoRA button out of here.
 *
 * Usage:
 *   const sheet = MpiTileSheet.mount(document.createElement('div'), { items });
 *   host.appendChild(sheet.el);
 *   sheet.on('select', ({ id, item }) => openDetail(item.source));
 *   sheet.el.patchState(id, '<span class="mpi-tile__chip">…</span>');
 *
 * Item shape:
 * @typedef {Object} TileItem
 * @property {string}  id               - Unique; the key for patchState/setWaiting/setSelected
 * @property {string}  name             - Primary label
 * @property {'image'|'video'} [media='image'] - Drives 4:5 vs 16:9 thumb aspect
 * @property {string}  [preview]        - Filename under comfy_workflows/display/
 * @property {string}  [meta]           - Second label line (e.g. "VIDEO · High")
 * @property {boolean} [showMediaBadge] - Render the Image/Video pill
 * @property {boolean} [featured]       - Sparkle badge on the thumb
 * @property {boolean} [dot]            - Recently-installed heat dot
 * @property {boolean} [waiting]        - Queued-install waiting mascot
 * @property {string}  [state]          - HTML for the fixed-height bottom row
 * @property {boolean} [selected]       - Renders the tile as the current choice
 * @property {*}       [source]         - Consumer payload, echoed back on select
 *
 * Props:
 * @param {TileItem[]} [items=[]]
 * @param {Map<string,HTMLElement>} [previewCache] - Consumer-owned; keeps thumb
 *        media alive across sheet rebuilds (MPI-394)
 *
 * Instance methods (on instance.el):
 *   setItems(items)         — full rebuild
 *   patchState(id, html)    — swap one tile's bottom row in place; no-op if absent
 *   setWaiting(id, bool)    — toggle the waiting mascot
 *   setSelected(id|null)    — move the selected modifier
 *   getTile(id)             — the tile element, or null
 *
 * Emits:
 *   'select' { id, item }
 */
export const MpiTileSheet = ComponentFactory.create({
    name: 'MpiTileSheet',
    css: ['js/components/Primitives/MpiTileSheet/MpiTileSheet.css'],

    template: () => `<div class="mpi-tile-sheet"></div>`,

    setup: (el, props, emit) => {
        // Per-render listener cleanups. setItems() rebuilds the DOM, so every
        // hover/error handler attached to the old tiles must go with them —
        // otherwise a library that re-renders on every download tick leaks a
        // listener per tile per tick.
        let _tileUnsubs = [];
        const _tiles = new Map();   // id -> { tile, stateEl, mascot }
        // Consumer-owned preview cache (MPI-394). Absent = build fresh every time.
        const _previewCache = props.previewCache instanceof Map ? props.previewCache : null;

        function _mediaBadge(media) {
            return media === 'video'
                ? `<span class="mpi-tile__badge mpi-tile__badge--video">${renderIcon('video', 'sm')}Video</span>`
                : `<span class="mpi-tile__badge">${renderIcon('image', 'sm')}Image</span>`;
        }

        // The tile's thumb media, reused across rebuilds when the consumer passed a
        // previewCache. A rebuild that RE-CREATES the <img>/<video> hands back an
        // element with no pixels, and `loading="lazy"` then defers its load until
        // after the next layout — so a grid that rebuilds while the main thread is
        // busy sits fully blank for as long as that takes (MPI-394: ~20s across the
        // Model Library when an install or uninstall completed). Re-parenting an
        // already-decoded element paints in the same frame instead.
        function _previewMedia(item) {
            const cached = _previewCache?.get(item.id);
            if (cached) return cached;
            let media;
            if (item.media === 'video') {
                media = ce('video', {
                    src: `comfy_workflows/display/${item.preview}`,
                    className: 'mpi-tile__thumb-media',
                });
                media.muted = true; media.loop = true; media.playsInline = true; media.preload = 'metadata';
                // Poster by filename convention (foo.mp4 → foo.webp). A multi-MB
                // preview must fetch its moov atom before it can show ANY frame —
                // ltx23_high_preview.mp4 is 40MB, which is why that tile was always
                // the last to paint. A missing poster file is a silent no-op.
                media.poster = `comfy_workflows/display/${item.preview.replace(/\.[^.]+$/, '.webp')}`;
            } else {
                media = ce('img', {
                    src: `comfy_workflows/display/${item.preview}`,
                    className: 'mpi-tile__thumb-media',
                    loading: 'lazy',
                    alt: '',
                });
            }
            _previewCache?.set(item.id, media);
            return media;
        }

        function _buildTile(item) {
            const isVideo = item.media === 'video';
            const tile = ce('button', {
                className: `mpi-tile mpi-tile--${isVideo ? 'video' : 'image'}${item.selected ? ' mpi-tile--selected' : ''}`,
                type: 'button',
            });

            // Thumb — image still or hover-play muted video; placeholder gradient
            // when no preview asset is declared or the asset fails to load.
            const thumb = ce('div', { className: 'mpi-tile__thumb' });
            if (item.preview) {
                const media = _previewMedia(item);
                _tileUnsubs.push(on(media, 'error', () => {
                    thumb.classList.add('mpi-tile__thumb--placeholder');
                    media.remove();
                    // Never hand a broken element back on the next rebuild — evicting
                    // it lets the fresh one fail again and re-raise the placeholder.
                    _previewCache?.delete(item.id);
                }));
                if (isVideo) {
                    _tileUnsubs.push(on(tile, 'mouseenter', () => { media.play().catch(() => {}); }));
                    _tileUnsubs.push(on(tile, 'mouseleave', () => { media.pause(); try { media.currentTime = 0; } catch (_) { /* noop */ } }));
                }
                thumb.appendChild(media);
            } else {
                thumb.classList.add('mpi-tile__thumb--placeholder');
            }

            // Heat dot + featured star ride absolute on the thumb so neither
            // shifts the tile when it appears.
            if (item.dot) thumb.appendChild(ce('div', { className: 'mpi-tile__new' }));
            if (item.featured) {
                const star = ce('div', { className: 'mpi-tile__featured', title: 'Featured' });
                star.innerHTML = renderIcon('sparkle', 'sm');
                thumb.appendChild(star);
            }
            // Queued-install waiting mascot (MPI-284) — always built so
            // setWaiting() can toggle it without a rebuild.
            const mascot = ce('img', {
                className: `mpi-tile__mascot${item.waiting ? ' mpi-tile__mascot--visible' : ''}`,
                src: 'assets/mascot/waiting.png',
                alt: '',
            });
            thumb.appendChild(mascot);
            tile.appendChild(thumb);

            const body = ce('div', { className: 'mpi-tile__body' });
            const top = ce('div', { className: 'mpi-tile__top' });
            const nameCol = ce('div');
            nameCol.appendChild(ce('div', { className: 'mpi-tile__name', textContent: item.name || '' }));
            if (item.meta) nameCol.appendChild(ce('div', { className: 'mpi-tile__meta', textContent: item.meta }));
            top.appendChild(nameCol);
            if (item.showMediaBadge) {
                const badge = ce('div');
                badge.innerHTML = _mediaBadge(item.media);
                if (badge.firstElementChild) top.appendChild(badge.firstElementChild);
            }
            body.appendChild(top);

            const stateEl = ce('div', { className: 'mpi-tile__state' });
            stateEl.innerHTML = item.state || '';
            body.appendChild(stateEl);
            tile.appendChild(body);

            _tileUnsubs.push(on(tile, 'click', () => emit('select', { id: item.id, item })));
            _tiles.set(item.id, { tile, stateEl, mascot });
            return tile;
        }

        function setItems(items) {
            _tileUnsubs.forEach(fn => fn?.());
            _tileUnsubs = [];
            _tiles.clear();
            el.innerHTML = '';
            (items || []).forEach(item => el.appendChild(_buildTile(item)));
        }

        el.setItems = setItems;

        el.patchState = (id, html) => {
            const ref = _tiles.get(id);
            if (ref) ref.stateEl.innerHTML = html ?? '';
        };

        el.setWaiting = (id, isWaiting) => {
            const ref = _tiles.get(id);
            if (ref?.mascot) ref.mascot.classList.toggle('mpi-tile__mascot--visible', !!isWaiting);
        };

        el.setSelected = (id) => {
            _tiles.forEach((ref, key) => ref.tile.classList.toggle('mpi-tile--selected', key === id));
        };

        el.getTile = (id) => _tiles.get(id)?.tile || null;

        el.destroy = () => {
            _tileUnsubs.forEach(fn => fn?.());
            _tileUnsubs = [];
            _tiles.clear();
        };

        setItems(props.items);
    },
});
