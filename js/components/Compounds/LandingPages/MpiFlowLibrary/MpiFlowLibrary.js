import { ComponentFactory } from '../../../factory.js';
import { MpiOverlay } from '../../../Primitives/MpiOverlay/MpiOverlay.js';
import { MpiButton } from '../../../Primitives/MpiButton/MpiButton.js';
import { MpiTileSheet } from '../../../Primitives/MpiTileSheet/MpiTileSheet.js';
import { Events } from '../../../../events.js';
import { state } from '../../../../state.js';
import {
    listFlows, flowAvailability, getFlowDependencies, flowDepKey,
    flowModelIds, flowModelChoices, setFlowModel,
} from '../../../../data/flowsRegistry.js';
import { MpiDropdown } from '../../../Primitives/MpiDropdown/MpiDropdown.js';
import { getModelById, getModelDependencies } from '../../../../data/modelRegistry.js';
import { downloadService } from '../../../../services/downloadService.js';
import { sizeToGb } from '../../../../data/modelConstants/footprint.js';
import { PAGE_GALLERY } from '../../../../router.js';
import { qs, ce, on } from '../../../../utils/dom.js';

/**
 * MpiFlowLibrary — the Flow Library overlay (MPI-256).
 *
 * A dev-gated clone of the Model Library skeleton (MpiModelManager), stripped to
 * flow scope: a contact-sheet grid of flow tiles (preview + title + an availability
 * badge derived from `flowAvailability`) with a right-drawer detail panel carrying
 * the description, the required-models install state, and ONE footer button —
 * all-installed → Open (emits `flow:open`), missing models → Install (drives each
 * missing model's own dependency download, exactly the Model Library's `_install`).
 *
 * Flows have NO disk-presence concept of their own: availability is read-only over
 * `state.s_installedModelIds`. So there are no ops/arch toggles, no VRAM table, no
 * media/size filters, no pod-disk bar, and no re-sync/refresh machinery — the whole
 * install state derives from the installed-model set, which the shared model
 * download flow already keeps current. `download:*` events therefore only re-derive
 * badges in place (_patchTile), never a full re-render (MPI-235 discipline).
 *
 * `canOpen = (state.currentPage === PAGE_GALLERY)`: flows land as gallery cards in
 * the current project, so Open is only meaningful inside a project's Gallery. On
 * Landing the Open button is disabled and a click surfaces a `ui:info` toast.
 *
 * Lifecycle: el.open() shows the overlay + renders; the overlay X / Escape /
 * ui:close-all-popups hides it. el.destroy() tears everything down.
 */
export const MpiFlowLibrary = ComponentFactory.create({
    name: 'MpiFlowLibrary',
    css: ['js/components/Compounds/LandingPages/MpiFlowLibrary/MpiFlowLibrary.css'],

    template: () => `
        <div class="mpi-flow-library">
            <div class="mpi-flow-library__head">
                <h1 class="mpi-flow-library__title">Flows</h1>
                <p class="mpi-flow-library__sub" id="flow-lib-sub"></p>
            </div>
            <div class="mpi-flow-library__body" id="flow-body-slot"></div>

            <div class="mpi-flow-library__scrim" id="flow-detail-scrim"></div>
            <aside class="mpi-detail" id="flow-detail-panel">
                <div class="mpi-detail__head">
                    <h2 class="mpi-detail__head-title">Flow</h2>
                    <!-- close button mounted in setup (MPI-588): ComponentFactory.mount REPLACES
                         its container's innerHTML, so a Primitive landing beside siblings is
                         mounted into a throwaway div and appended here. -->
                </div>
                <div class="mpi-detail__body" id="flow-detail-body"></div>
                <div class="mpi-detail__actions" id="flow-detail-actions"></div>
            </aside>
        </div>`,

    setup: (el) => {
        const bodySlot = qs('#flow-body-slot', el);
        const subEl = qs('#flow-lib-sub', el);
        const scrim = qs('#flow-detail-scrim', el);
        const detailPanel = qs('#flow-detail-panel', el);
        const detailBody = qs('#flow-detail-body', el);
        const detailActions = qs('#flow-detail-actions', el);

        const _unsubs = [];

        // The shared tile grid (MPI-356). Patching a single tile's badge in place
        // instead of re-rendering the whole grid (MPI-235) now goes through
        // sheet.el.patchState(id, html).
        let _sheet = null;
        // Footer MpiButton instances in the OPEN detail panel — torn down on
        // close/reopen (they own their own DOM listeners).
        let _detailBtns = [];
        // The flow whose detail panel is open (null = closed).
        let _activeDetail = null;

        // ── Self-hosted overlay (body mode covers status bar — fine for a picker,
        // same as the Model Library). shell.js mounts this once + calls el.open(). ──
        const overlay = MpiOverlay.mount(document.createElement('div'), {
            closable: true, mountTarget: 'body',
        });
        overlay.el.appendToContainer(el);
        overlay.on('close', () => { _closeDetail(); });

        // ── Availability badge (chip) for a tile / section sort ──────────────
        function _badgeHtml(flow) {
            const { available } = flowAvailability(flow);
            return available
                ? `<span class="mpi-tile__chip mpi-tile__chip--installed">Ready</span>`
                : `<span class="mpi-tile__chip mpi-tile__chip--available">Get models</span>`;
        }

        // ── Tile item for the shared sheet: preview thumb + title + availability badge ──
        function _tileItem(flow) {
            return {
                id: flow.id,
                name: flow.title,
                media: 'image',
                preview: flow.preview,
                state: _badgeHtml(flow),
                source: flow,
            };
        }

        // ── Detail drawer ─────────────────────────────────────────────────────
        function _destroyDetailBtns() {
            _detailBtns.forEach(inst => inst?.el?.destroy?.());
            _detailBtns = [];
        }

        // Every download-queue key this flow installs under: one per required MODEL,
        // plus ONE for its own flow-only deps (MPI-304, keyed `flow:<id>` so it can never
        // collide with a model id). Install/cancel/progress all iterate this same list,
        // so the flow-deps row participates in the aggregated bar exactly like a model.
        function _installKeys(flow) {
            // Resolved ids (MPI-590): an any-of slot contributes the member that is
            // installed — or the default to install — never both, so the aggregated bar
            // and Cancel-all keep counting one job per slot exactly as before.
            const keys = flowModelIds(flow);
            if ((flow.requiredDeps || []).length) keys.push(flowDepKey(flow.id));
            return keys;
        }

        // Install every missing required model (each drives its own dep download —
        // the shared model install flow; exactly the Model Library's _install), plus the
        // flow's own deps as ONE more job. The Flow Library owns no dep resolution of its
        // own: getModelDependencies() / getFlowDependencies() resolve, the service starts.
        function _installMissing(flow, missing) {
            for (const modelId of missing) {
                const deps = getModelDependencies(modelId);
                if (deps.length) downloadService.start(modelId, deps);
            }
            // Flow-only deps: started under the flow key so the shared install/reconcile
            // machinery treats them as one unit and the guards can attribute them.
            const { missingDeps } = flowAvailability(flow);
            if (missingDeps.length) {
                const deps = getFlowDependencies(flow);
                if (deps.length) downloadService.start(flowDepKey(flow.id), deps);
            }
        }

        // Cancel EVERY in-flight install for this flow (Cancel-all) — models AND flow deps.
        function _cancelInstall(flow) {
            for (const key of _installKeys(flow)) {
                if ((state.downloadJobs || []).some(j => j.modelId === key)) {
                    downloadService.cancel(key);
                }
            }
        }

        // Aggregate install state across a flow's requiredModels. Installs are SERIAL
        // (downloadService serializes the queue), so N models each own 1/N of the bar:
        // installed → 1, the live download → job.progress, queued/not-started → 0.
        // `installing` = at least one model has a live download job. Returns overall 0–1.
        //   { installing, progress }
        function _installProgress(flow) {
            const ids = _installKeys(flow);
            if (!ids.length) return { installing: false, progress: 0 };
            const installed = state.s_installedModelIds || [];
            const jobs = state.downloadJobs || [];
            // The flow-deps key is "installed" when no dep is missing — it is not a model,
            // so it never appears in s_installedModelIds (MPI-304).
            const depsKey = flowDepKey(flow.id);
            const depsDone = !flowAvailability(flow).missingDeps.length;
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

        // MPI-304 — flow-only deps appear as ONE extra row in the same required list,
        // aggregated rather than itemised: they are an implementation detail of the flow
        // (a baked LoRA, a node pack), not a thing the user chose. The size is what they
        // actually care about, so it rides in the label.
        function _flowDepsRowHtml(flow) {
            const deps = getFlowDependencies(flow);
            if (!deps.length) return '';
            const done = !flowAvailability(flow).missingDeps.length;
            const gb = deps.reduce((n, d) => n + sizeToGb(d.size), 0);
            const label = gb ? `Extra dependencies (${gb.toFixed(1)}GB)` : 'Extra dependencies';
            return _rowHtml(label, done);
        }

        // MPI-590/599 — the model pickers. One labelled dropdown per CHOOSABLE SLOT: a role
        // the flow's graph plays a model in, with more than one candidate for it. A flow can
        // have several (an image model for one phase, an edit model for another), so the
        // slot's own label is the field label — two fields both reading "Model" say nothing.
        // They sit BEFORE the flow opens (Fabio's placement), above the required-models list
        // the pick drives.
        //
        // Candidates are offered whether or not they are INSTALLED (MPI-599). The picker
        // used to appear only once two were on disk, which meant the one user who most needed
        // it — the user with none — silently downloaded the first candidate and was never
        // told there had been a choice.
        function _modelChoiceHtml(flow) {
            return flowModelChoices(flow)
                .map((slot, i) => `
                <div class="mpi-detail__field">
                    <span class="mpi-detail__field-label">${slot.label}</span>
                    <div id="flow-detail-model-${i}"></div>
                </div>`)
                .join('');
        }

        function _mountModelChoice(flow) {
            const resolved = flowModelIds(flow);
            const installed = state.s_installedModelIds || [];
            flowModelChoices(flow).forEach((slot, i) => {
                const host = qs(`#flow-detail-model-${i}`, detailBody);
                if (!host) return;
                const dd = MpiDropdown.mount(host, {
                    options: slot.models.map(id => ({
                        value: id,
                        label: getModelById(id)?.name || id,
                        // The recommendation is the flow author's, and it is the candidate an
                        // untouched picker resolves to — so it has to be visible, or a user
                        // choosing blind between four SDXL checkpoints is guessing. Same
                        // sparkle the Model Library flags Featured with (MPI-514), and the
                        // word rather than a hover: a dropdown row has space for it.
                        ...(id === slot.recommended ? { icon: 'sparkle', meta: 'Recommended' } : {}),
                        // Not `disabled` — an uninstalled candidate is pickable ON PURPOSE.
                        // Picking it is how the user says "install that one instead", which
                        // the Required-models row and the Install button below then follow.
                        ...(installed.includes(id) ? {} : { info: `${getModelById(id)?.name || id} — not installed yet` }),
                    })),
                    value: slot.models.find(id => resolved.includes(id)) || slot.recommended,
                });
                dd.on('change', ({ value }) => {
                    setFlowModel(flow.id, value);
                    // Re-render: the resolved id feeds the required-models rows, the install
                    // keys and the footer, so a pick that only moved the dropdown label would
                    // leave the panel describing the other model.
                    openDetail(flow);
                });
                _detailBtns.push(dd);
            });
        }

        function openDetail(flow) {
            _destroyDetailBtns();
            _activeDetail = flow;
            const { available, missing } = flowAvailability(flow);

            detailBody.innerHTML = `
                <div class="mpi-detail__thumb mpi-detail__thumb--image mpi-detail__thumb--placeholder" id="flow-detail-thumb"></div>
                <div class="mpi-detail__titlerow">
                    <div><div class="mpi-detail__name">${flow.title}</div></div>
                </div>
                ${flow.description ? `<p class="mpi-detail__desc">${flow.description}</p>` : ''}
                ${_modelChoiceHtml(flow)}
                <div class="mpi-detail__field">
                    <span class="mpi-detail__field-label">Required models</span>
                    <ul class="mpi-detail__models">
                        ${flowModelIds(flow).map(_modelRowHtml).join('')}
                        ${_flowDepsRowHtml(flow)}
                    </ul>
                </div>`;

            _mountModelChoice(flow);

            const thumb = qs('#flow-detail-thumb', detailBody);
            if (flow.preview) {
                const img = ce('img', { src: `comfy_workflows/display/${flow.preview}`, className: 'mpi-detail__thumb-media' });
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
            const prog = _installProgress(flow);
            if (prog.installing) {
                const pct = Math.min(Math.round(prog.progress * 100), 100);
                const bar = ce('div', { className: 'mpi-detail__install-prog' });
                bar.innerHTML = `<div class="mpi-tile__prog"><div class="mpi-tile__prog-bar"><span style="width:${pct}%"></span></div><span class="mpi-tile__prog-pct">${pct}%</span></div>`;
                detailActions.appendChild(bar);
                const cancel = MpiButton.mount(ce('div'), { text: 'Cancel', variant: 'secondary', size: 'md' });
                cancel.on('click', () => { _cancelInstall(flow); });
                detailActions.appendChild(cancel.el); _detailBtns.push(cancel);
            } else if (available) {
                const canOpen = state.currentPage === PAGE_GALLERY;
                const open = MpiButton.mount(ce('div'), {
                    text: 'Open', variant: 'primary', size: 'md', disabled: !canOpen,
                });
                open.on('click', () => {
                    if (!canOpen) {
                        Events.emit('ui:info', { message: 'Open flows from the Gallery, inside a project.', sound: false });
                        return;
                    }
                    el.close();
                    Events.emit('flow:open', { flowId: flow.id });
                });
                detailActions.appendChild(open.el); _detailBtns.push(open);
            } else {
                const install = MpiButton.mount(ce('div'), { text: 'Install models', variant: 'primary', size: 'md' });
                install.on('click', () => { _installMissing(flow, missing); });
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
        // MPI-588 — the drawer's close control as a Primitive. It keeps `.mpi-detail__close`
        // (the 28px chrome shared with the Model Library drawer) and its id, so the CSS and
        // the listener below both still find it.
        const closeBtn = MpiButton.mount(ce('div'), {
            icon: 'close', size: 'sm', variant: 'ghost', extraClasses: 'mpi-detail__close',
        });
        closeBtn.el.id = 'flow-detail-close';
        closeBtn.el.setAttribute('aria-label', 'Close');
        qs('.mpi-detail__head', el).appendChild(closeBtn.el);

        _unsubs.push(on(scrim, 'click', _closeDetail));
        _unsubs.push(on(qs('#flow-detail-close', el), 'click', _closeDetail));
        _unsubs.push(Events.on('ui:close-all-popups', () => { _closeDetail(); }));

        // ── Render the contact sheet ────────────────────────────────────────
        function _destroyAllTiles() {
            _sheet?.el?.destroy?.();
            _sheet = null;
        }

        function renderList() {
            _destroyAllTiles();
            bodySlot.innerHTML = '';

            const flows = listFlows();
            const readyN = flows.filter(a => flowAvailability(a).available).length;
            subEl.textContent = flows.length
                ? `${readyN} ready · ${flows.length - readyN} need models`
                : 'No flows yet.';

            if (!flows.length) {
                bodySlot.appendChild(ce('div', {
                    className: 'mpi-flow-library__empty',
                    textContent: 'No flows available yet.',
                }));
                return;
            }

            _sheet = MpiTileSheet.mount(ce('div'), { items: flows.map(_tileItem) });
            _sheet.on('select', ({ item }) => openDetail(item.source));
            bodySlot.appendChild(_sheet.el);
        }

        // ── Re-derive a single flow's badge (+ its open detail footer) in place ──
        // Availability is a pure function of the installed set, so any install-state
        // change just recomputes badges — never a full grid rebuild (MPI-235).
        function _patchTile(flowId) {
            const flow = listFlows().find(a => a.id === flowId);
            if (!flow) return;
            _sheet?.el?.patchState(flowId, _badgeHtml(flow));
            if (_activeDetail && _activeDetail.id === flowId) openDetail(flow);
        }

        // A model finishing/leaving install changes s_installedModelIds → re-derive
        // every tile whose required set includes it. Cheap: iterate the tiny flow list.
        function _patchAllAffected() {
            for (const flow of listFlows()) _patchTile(flow.id);
        }

        // Tick only the aggregated bar width/pct in the open detail — cheap, per-progress
        // event (no footer rebuild). Full rebuild is reserved for state TRANSITIONS
        // (start/complete/cancel), which swap the button between Install/Cancel/Open.
        function _patchProgress(flow) {
            if (!_activeDetail || _activeDetail.id !== flow.id) return;
            const bar = qs('.mpi-tile__prog-bar span', detailActions);
            const pctEl = qs('.mpi-tile__prog-pct', detailActions);
            if (!bar || !pctEl) { openDetail(flow); return; } // footer not in bar-mode yet → transition
            const pct = Math.min(Math.round(_installProgress(flow).progress * 100), 100);
            bar.style.width = `${pct}%`;
            pctEl.textContent = `${pct}%`;
        }

        _unsubs.push(Events.on('state:changed', ({ key }) => {
            if (key === 's_installedModelIds') _patchAllAffected();
        }));
        // MPI-304 — flow-dep status is refreshed by the same sync but is NOT part of
        // s_installedModelIds, so the listener above never sees it change. models:checked
        // fires at the end of every sync (after the flow dep cache is written), which is
        // the only signal that a flow-deps install flipped a flow to Ready.
        _unsubs.push(Events.on('models:checked', () => { _patchAllAffected(); }));
        // Progress ticks: patch only the bar (fast path). A model whose required set
        // includes the ticking model repaints; the grid badges follow s_installedModelIds.
        _unsubs.push(Events.on('download:progress', ({ modelId }) => {
            // MPI-304: match the flow-deps key too, or a flow-deps-only install ticks
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
            closeBtn?.el?.destroy?.();
            overlay?.el?.destroy?.();
        };
    },
});
