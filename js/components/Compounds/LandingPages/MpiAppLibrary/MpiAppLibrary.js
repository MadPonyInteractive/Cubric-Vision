import { ComponentFactory } from '../../../factory.js';
import { MpiOverlay } from '../../../Primitives/MpiOverlay/MpiOverlay.js';
import { MpiButton } from '../../../Primitives/MpiButton/MpiButton.js';
import { Events } from '../../../../events.js';
import { state } from '../../../../state.js';
import { listApps, appAvailability, getAppDependencies, appDepKey } from '../../../../data/appsRegistry.js';
import { getModelById, getModelDependencies } from '../../../../data/modelRegistry.js';
import { downloadService } from '../../../../services/downloadService.js';
import { sizeToGb } from '../../../../data/modelConstants/footprint.js';
import { PAGE_GALLERY } from '../../../../router.js';
import { qs, ce, on } from '../../../../utils/dom.js';
import { renderIcon } from '/js/utils/icons.js';

/**
 * MpiAppLibrary — the App Library overlay (MPI-256).
 *
 * A dev-gated clone of the Model Library skeleton (MpiModelManager), stripped to
 * app scope: a contact-sheet grid of app tiles (preview + title + an availability
 * badge derived from `appAvailability`) with a right-drawer detail panel carrying
 * the description, the required-models install state, and ONE footer button —
 * all-installed → Open (emits `app:open`), missing models → Install (drives each
 * missing model's own dependency download, exactly the Model Library's `_install`).
 *
 * Apps have NO disk-presence concept of their own: availability is read-only over
 * `state.s_installedModelIds`. So there are no ops/arch toggles, no VRAM table, no
 * media/size filters, no pod-disk bar, and no re-sync/refresh machinery — the whole
 * install state derives from the installed-model set, which the shared model
 * download flow already keeps current. `download:*` events therefore only re-derive
 * badges in place (_patchTile), never a full re-render (MPI-235 discipline).
 *
 * `canOpen = (state.currentPage === PAGE_GALLERY)`: apps land as gallery cards in
 * the current project, so Open is only meaningful inside a project's Gallery. On
 * Landing the Open button is disabled and a click surfaces a `ui:info` toast.
 *
 * Lifecycle: el.open() shows the overlay + renders; the overlay X / Escape /
 * ui:close-all-popups hides it. el.destroy() tears everything down.
 */
export const MpiAppLibrary = ComponentFactory.create({
    name: 'MpiAppLibrary',
    css: ['js/components/Compounds/LandingPages/MpiAppLibrary/MpiAppLibrary.css'],

    template: () => `
        <div class="mpi-app-library">
            <div class="mpi-app-library__head">
                <h1 class="mpi-app-library__title">Apps</h1>
                <p class="mpi-app-library__sub" id="app-lib-sub"></p>
            </div>
            <div class="mpi-app-library__body" id="app-body-slot"></div>

            <div class="mpi-app-library__scrim" id="app-detail-scrim"></div>
            <aside class="mpi-detail" id="app-detail-panel">
                <div class="mpi-detail__head">
                    <h2 class="mpi-detail__head-title">App</h2>
                    <button class="mpi-detail__close" id="app-detail-close" type="button" aria-label="Close">${renderIcon('close', 'md')}</button>
                </div>
                <div class="mpi-detail__body" id="app-detail-body"></div>
                <div class="mpi-detail__actions" id="app-detail-actions"></div>
            </aside>
        </div>`,

    setup: (el) => {
        const bodySlot = qs('#app-body-slot', el);
        const subEl = qs('#app-lib-sub', el);
        const scrim = qs('#app-detail-scrim', el);
        const detailPanel = qs('#app-detail-panel', el);
        const detailBody = qs('#app-detail-body', el);
        const detailActions = qs('#app-detail-actions', el);

        const _unsubs = [];

        // Per-appId TILE tracking so download:* events can re-derive a single tile's
        // badge in place instead of re-rendering the whole grid (MPI-235).
        //   Map<appId, { tile, badgeEl }>
        const _tileInstances = new Map();
        // Footer MpiButton instances in the OPEN detail panel — torn down on
        // close/reopen (they own their own DOM listeners).
        let _detailBtns = [];
        // The app whose detail panel is open (null = closed).
        let _activeDetail = null;

        // ── Self-hosted overlay (body mode covers status bar — fine for a picker,
        // same as the Model Library). shell.js mounts this once + calls el.open(). ──
        const overlay = MpiOverlay.mount(document.createElement('div'), {
            closable: true, mountTarget: 'body',
        });
        overlay.el.appendToContainer(el);
        overlay.on('close', () => { _closeDetail(); });

        // ── Availability badge (chip) for a tile / section sort ──────────────
        function _badgeHtml(app) {
            const { available } = appAvailability(app);
            return available
                ? `<span class="mpi-tile__chip mpi-tile__chip--installed">Ready</span>`
                : `<span class="mpi-tile__chip mpi-tile__chip--available">Get models</span>`;
        }

        // ── Lean tile: preview thumb + title + availability badge. Click → detail. ──
        function _buildTile(app) {
            const tile = ce('button', { className: 'mpi-tile mpi-tile--image', type: 'button' });

            const thumb = ce('div', { className: 'mpi-tile__thumb' });
            if (app.preview) {
                const img = ce('img', {
                    src: `comfy_workflows/display/${app.preview}`,
                    className: 'mpi-tile__thumb-media',
                    loading: 'lazy',
                });
                _unsubs.push(on(img, 'error', () => { thumb.classList.add('mpi-tile__thumb--placeholder'); img.remove(); }));
                thumb.appendChild(img);
            } else {
                thumb.classList.add('mpi-tile__thumb--placeholder');
            }
            tile.appendChild(thumb);

            const badgeEl = ce('div', { className: 'mpi-tile__state' });
            badgeEl.innerHTML = _badgeHtml(app);
            const body = ce('div', { className: 'mpi-tile__body' });
            const nameCol = ce('div');
            nameCol.appendChild(ce('div', { className: 'mpi-tile__name', textContent: app.title }));
            body.appendChild(nameCol);
            body.appendChild(badgeEl);
            tile.appendChild(body);

            _unsubs.push(on(tile, 'click', () => openDetail(app)));
            _tileInstances.set(app.id, { tile, badgeEl });
            return tile;
        }

        // ── Detail drawer ─────────────────────────────────────────────────────
        function _destroyDetailBtns() {
            _detailBtns.forEach(inst => inst?.el?.destroy?.());
            _detailBtns = [];
        }

        // Every download-queue key this app installs under: one per required MODEL,
        // plus ONE for its own app-only deps (MPI-304, keyed `app:<id>` so it can never
        // collide with a model id). Install/cancel/progress all iterate this same list,
        // so the app-deps row participates in the aggregated bar exactly like a model.
        function _installKeys(app) {
            const keys = (app.requiredModels || []).slice();
            if ((app.requiredDeps || []).length) keys.push(appDepKey(app.id));
            return keys;
        }

        // Install every missing required model (each drives its own dep download —
        // the shared model install flow; exactly the Model Library's _install), plus the
        // app's own deps as ONE more job. The App Library owns no dep resolution of its
        // own: getModelDependencies() / getAppDependencies() resolve, the service starts.
        function _installMissing(app, missing) {
            for (const modelId of missing) {
                const deps = getModelDependencies(modelId);
                if (deps.length) downloadService.start(modelId, deps);
            }
            // App-only deps: started under the app key so the shared install/reconcile
            // machinery treats them as one unit and the guards can attribute them.
            const { missingDeps } = appAvailability(app);
            if (missingDeps.length) {
                const deps = getAppDependencies(app);
                if (deps.length) downloadService.start(appDepKey(app.id), deps);
            }
        }

        // Cancel EVERY in-flight install for this app (Cancel-all) — models AND app deps.
        function _cancelInstall(app) {
            for (const key of _installKeys(app)) {
                if ((state.downloadJobs || []).some(j => j.modelId === key)) {
                    downloadService.cancel(key);
                }
            }
        }

        // Aggregate install state across an app's requiredModels. Installs are SERIAL
        // (downloadService serializes the queue), so N models each own 1/N of the bar:
        // installed → 1, the live download → job.progress, queued/not-started → 0.
        // `installing` = at least one model has a live download job. Returns overall 0–1.
        //   { installing, progress }
        function _installProgress(app) {
            const ids = _installKeys(app);
            if (!ids.length) return { installing: false, progress: 0 };
            const installed = state.s_installedModelIds || [];
            const jobs = state.downloadJobs || [];
            // The app-deps key is "installed" when no dep is missing — it is not a model,
            // so it never appears in s_installedModelIds (MPI-304).
            const depsKey = appDepKey(app.id);
            const depsDone = !appAvailability(app).missingDeps.length;
            let sum = 0, installing = false;
            for (const id of ids) {
                if (id === depsKey ? depsDone : installed.includes(id)) { sum += 1; continue; }
                const job = jobs.find(j => j.modelId === id);
                if (job) {
                    installing = true;
                    sum += Math.min(Math.max(job.progress || 0, 0), 1);
                }
            }
            return { installing, progress: sum / ids.length };
        }

        function _rowHtml(name, installed) {
            const chip = installed
                ? `<span class="mpi-tile__chip mpi-tile__chip--installed">Installed</span>`
                : `<span class="mpi-tile__chip mpi-tile__chip--available">Install</span>`;
            return `<li class="mpi-detail__model-row"><span>${name}</span>${chip}</li>`;
        }

        function _modelRowHtml(modelId) {
            const model = getModelById(modelId);
            return _rowHtml(model?.name || modelId, (state.s_installedModelIds || []).includes(modelId));
        }

        // MPI-304 — app-only deps appear as ONE extra row in the same required list,
        // aggregated rather than itemised: they are an implementation detail of the app
        // (a baked LoRA, a node pack), not a thing the user chose. The size is what they
        // actually care about, so it rides in the label.
        function _appDepsRowHtml(app) {
            const deps = getAppDependencies(app);
            if (!deps.length) return '';
            const done = !appAvailability(app).missingDeps.length;
            const gb = deps.reduce((n, d) => n + sizeToGb(d.size), 0);
            const label = gb ? `Extra dependencies (${gb.toFixed(1)}GB)` : 'Extra dependencies';
            return _rowHtml(label, done);
        }

        function openDetail(app) {
            _destroyDetailBtns();
            _activeDetail = app;
            const { available, missing } = appAvailability(app);

            detailBody.innerHTML = `
                <div class="mpi-detail__thumb mpi-detail__thumb--image mpi-detail__thumb--placeholder" id="app-detail-thumb"></div>
                <div class="mpi-detail__titlerow">
                    <div><div class="mpi-detail__name">${app.title}</div></div>
                </div>
                ${app.description ? `<p class="mpi-detail__desc">${app.description}</p>` : ''}
                <div class="mpi-detail__field">
                    <span class="mpi-detail__field-label">Required models</span>
                    <ul class="mpi-detail__models">
                        ${(app.requiredModels || []).map(_modelRowHtml).join('')}
                        ${_appDepsRowHtml(app)}
                    </ul>
                </div>`;

            const thumb = qs('#app-detail-thumb', detailBody);
            if (app.preview) {
                const img = ce('img', { src: `comfy_workflows/display/${app.preview}`, className: 'mpi-detail__thumb-media' });
                _unsubs.push(on(img, 'load', () => {
                    if (img.naturalWidth && img.naturalHeight) thumb.style.aspectRatio = `${img.naturalWidth} / ${img.naturalHeight}`;
                }));
                _unsubs.push(on(img, 'error', () => { img.remove(); thumb.classList.add('mpi-detail__thumb--placeholder'); }));
                thumb.classList.remove('mpi-detail__thumb--placeholder');
                thumb.appendChild(img);
            }

            // Footer: installing → aggregated bar + Cancel-all; else all-installed →
            // Open (Gallery-only); else → Install.
            detailActions.innerHTML = '';
            const prog = _installProgress(app);
            if (prog.installing) {
                const pct = Math.min(Math.round(prog.progress * 100), 100);
                const bar = ce('div', { className: 'mpi-detail__install-prog' });
                bar.innerHTML = `<div class="mpi-tile__prog"><div class="mpi-tile__prog-bar"><span style="width:${pct}%"></span></div><span class="mpi-tile__prog-pct">${pct}%</span></div>`;
                detailActions.appendChild(bar);
                const cancel = MpiButton.mount(ce('div'), { text: 'Cancel', variant: 'secondary', size: 'md' });
                cancel.on('click', () => { _cancelInstall(app); });
                detailActions.appendChild(cancel.el); _detailBtns.push(cancel);
            } else if (available) {
                const canOpen = state.currentPage === PAGE_GALLERY;
                const open = MpiButton.mount(ce('div'), {
                    text: 'Open', variant: 'primary', size: 'md', disabled: !canOpen,
                });
                open.on('click', () => {
                    if (!canOpen) {
                        Events.emit('ui:info', { message: 'Open apps from the Gallery, inside a project.', sound: false });
                        return;
                    }
                    el.close();
                    Events.emit('app:open', { appId: app.id });
                });
                detailActions.appendChild(open.el); _detailBtns.push(open);
            } else {
                const install = MpiButton.mount(ce('div'), { text: 'Install models', variant: 'primary', size: 'md' });
                install.on('click', () => { _installMissing(app, missing); });
                detailActions.appendChild(install.el); _detailBtns.push(install);
            }

            scrim.classList.add('is-open');
            detailPanel.classList.add('is-open');
        }

        function _closeDetail() {
            scrim.classList.remove('is-open');
            detailPanel.classList.remove('is-open');
            _activeDetail = null;
            _destroyDetailBtns();
        }
        _unsubs.push(on(scrim, 'click', _closeDetail));
        _unsubs.push(on(qs('#app-detail-close', el), 'click', _closeDetail));
        _unsubs.push(Events.on('ui:close-all-popups', () => { _closeDetail(); }));

        // ── Render the contact sheet ────────────────────────────────────────
        function _destroyAllTiles() { _tileInstances.clear(); }

        function renderList() {
            _destroyAllTiles();
            bodySlot.innerHTML = '';

            const apps = listApps();
            const readyN = apps.filter(a => appAvailability(a).available).length;
            subEl.textContent = apps.length
                ? `${readyN} ready · ${apps.length - readyN} need models`
                : 'No apps yet.';

            if (!apps.length) {
                bodySlot.appendChild(ce('div', {
                    className: 'mpi-app-library__empty',
                    textContent: 'No apps available yet.',
                }));
                return;
            }

            const sheet = ce('div', { className: 'mpi-app-library__sheet' });
            apps.forEach(app => sheet.appendChild(_buildTile(app)));
            bodySlot.appendChild(sheet);
        }

        // ── Re-derive a single app's badge (+ its open detail footer) in place ──
        // Availability is a pure function of the installed set, so any install-state
        // change just recomputes badges — never a full grid rebuild (MPI-235).
        function _patchTile(appId) {
            const app = listApps().find(a => a.id === appId);
            if (!app) return;
            const ref = _tileInstances.get(appId);
            if (ref) ref.badgeEl.innerHTML = _badgeHtml(app);
            if (_activeDetail && _activeDetail.id === appId) openDetail(app);
        }

        // A model finishing/leaving install changes s_installedModelIds → re-derive
        // every tile whose required set includes it. Cheap: iterate the tiny app list.
        function _patchAllAffected() {
            for (const app of listApps()) _patchTile(app.id);
        }

        // Tick only the aggregated bar width/pct in the open detail — cheap, per-progress
        // event (no footer rebuild). Full rebuild is reserved for state TRANSITIONS
        // (start/complete/cancel), which swap the button between Install/Cancel/Open.
        function _patchProgress(app) {
            if (!_activeDetail || _activeDetail.id !== app.id) return;
            const bar = detailActions.querySelector('.mpi-tile__prog-bar span');
            const pctEl = detailActions.querySelector('.mpi-tile__prog-pct');
            if (!bar || !pctEl) { openDetail(app); return; } // footer not in bar-mode yet → transition
            const pct = Math.min(Math.round(_installProgress(app).progress * 100), 100);
            bar.style.width = `${pct}%`;
            pctEl.textContent = `${pct}%`;
        }

        _unsubs.push(Events.on('state:changed', ({ key }) => {
            if (key === 's_installedModelIds') _patchAllAffected();
        }));
        // MPI-304 — app-dep status is refreshed by the same sync but is NOT part of
        // s_installedModelIds, so the listener above never sees it change. models:checked
        // fires at the end of every sync (after the app dep cache is written), which is
        // the only signal that an app-deps install flipped an app to Ready.
        _unsubs.push(Events.on('models:checked', () => { _patchAllAffected(); }));
        // Progress ticks: patch only the bar (fast path). A model whose required set
        // includes the ticking model repaints; the grid badges follow s_installedModelIds.
        _unsubs.push(Events.on('download:progress', ({ modelId }) => {
            // MPI-304: match the app-deps key too, or an app-deps-only install ticks
            // the queue while the bar sits frozen at 0.
            if (_activeDetail && _installKeys(_activeDetail).includes(modelId)) _patchProgress(_activeDetail);
        }));
        // State transitions rebuild the open panel (footer swaps Install↔Cancel↔Open,
        // required-models rows repaint). Only the open panel repaints; the grid badges
        // follow s_installedModelIds once the model actually flips installed.
        _unsubs.push(Events.on('download:complete', () => { if (_activeDetail) openDetail(_activeDetail); }));
        _unsubs.push(Events.on('download:started', () => { if (_activeDetail) openDetail(_activeDetail); }));
        _unsubs.push(Events.on('download:cancelled', () => { if (_activeDetail) openDetail(_activeDetail); }));

        // ── Open / close the Library overlay ──────────────────────────────────
        el.open = () => { overlay.el.show(); renderList(); };
        el.close = () => { overlay.el.hide(); };
        el.onOpen = el.open;

        renderList();

        el.destroy = () => {
            _unsubs.forEach(fn => fn());
            _destroyAllTiles();
            _destroyDetailBtns();
            overlay?.el?.destroy?.();
        };
    },
});
