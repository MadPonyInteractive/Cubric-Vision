import { ComponentFactory } from '../../../factory.js';
import { MpiOverlay } from '../../../Primitives/MpiOverlay/MpiOverlay.js';
import { MpiButton } from '../../../Primitives/MpiButton/MpiButton.js';
import { MpiTileSheet } from '../../../Primitives/MpiTileSheet/MpiTileSheet.js';
import { Events } from '../../../../events.js';
import { state } from '../../../../state.js';
import {
    listFlows, flowAvailability, getFlowDependencies, flowDepKey,
    flowModelIds, flowModelChoices, flowModelSlots, setFlowModel,
} from '../../../../data/flowsRegistry.js';
import { MpiDropdown } from '../../../Primitives/MpiDropdown/MpiDropdown.js';
import { MpiOkCancel } from '../../MpiOkCancel/MpiOkCancel.js';
import { getModelById, getModelDependencies, disambiguatedName, reSyncInstalledModels } from '../../../../data/modelRegistry.js';
import { downloadService } from '../../../../services/downloadService.js';
import { sizeToGb } from '../../../../data/modelConstants/footprint.js';
import { DEPS } from '../../../../data/modelConstants/dependencies.js';
import { PAGE_GALLERY } from '../../../../router.js';
import { qs, ce, on } from '../../../../utils/dom.js';
import { renderIcon } from '../../../../utils/icons.js';
import { hasAcceptedLicence } from '../../../../data/modelConstants/licences.js';
import { flowInstallKeys, flowLicences, buildLicenceRows } from '../../../../utils/flowLicences.js';

/**
 * Output-type sections, in render order (MPI-634). A flow's tile is the same 4/5
 * still whatever it produces, so — unlike the Model Library, where the media split
 * is also an aspect-ratio split — nothing on the grid said whether a flow made an
 * image, a video or audio. These headers are the same ones the Model Library and
 * the model picker already draw, so the three pickers read alike.
 */
const MEDIA_SECTIONS = [
    { media: 'image', label: 'Image' },
    { media: 'video', label: 'Video' },
    { media: 'audio', label: 'Audio' },
];

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

        // One shared tile grid (MPI-356) PER output-type section (MPI-634). Patching a
        // single tile's badge in place instead of re-rendering the whole grid (MPI-235)
        // goes through sheet.el.patchState(id, html) — a flow lives in exactly one sheet,
        // so the patch is a blind fan-out and the sheets that don't hold it no-op.
        const _sheets = [];
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
            if (available) return `<span class="mpi-tile__chip mpi-tile__chip--installed">Ready</span>`;
            // MPI-666 — the Model Library's chip, on the surface a beginner actually uses.
            // "Get models" promises a download and delivers a legal wall plus a trip to
            // Hugging Face for an access grant; three shipped flows (scribble,
            // scribble-object, object-stamp) all need `klein-9b`, so this was an ambush on
            // the Flow grid while the Model Library named it correctly for the same weights.
            // Naming it before the click is the whole affordance — the gate itself already
            // fires either way, in `downloadService.start()`.
            if (_licenceErrands(flow).length) {
                return `<span class="mpi-tile__chip mpi-tile__chip--available">Licence required</span>`;
            }
            return `<span class="mpi-tile__chip mpi-tile__chip--available">Get models</span>`;
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

        // `flowInstallKeys` (every download-queue key this flow installs under) and
        // `flowLicences` (the descriptors gating them) moved to js/utils/flowLicences.js
        // in MPI-666 phase 2, because MpiBaseFlow's step 0 needs the same licence block
        // after install and two copies would drift. The queue key IS the licence key —
        // that identity is why one module owns both.

        // Does anything this flow needs send the user to the LICENSOR before it can install?
        // That is the question the tile has to answer, because that is what turns "Get
        // models" into a lie: not the existence of a licence, but an errand outside this app
        // standing between the click and the weights. Two shapes qualify, and a licence in
        // neither never matches — its consent is one dialog at install, mid-flow, which is
        // not worth pre-announcing.
        //
        //   `verify`    — the licensor grants access on their own site and we probe it
        //                 (FLUX klein-9b: a Hugging Face access request, then a token).
        //   `territory` — the licence excludes where the user is, and the gate's FIRST
        //                 acknowledgement is "I am outside the excluded territories, or I
        //                 hold my own authorization". MiniMax H3 excludes the EU, the UK,
        //                 Korea and the USA, so most of our users cannot honestly tick that
        //                 box until MiniMax answer their form. Widened here (MPI-666, once
        //                 MPI-591 put H3 behind Extend Video): H3 carries no `verify` — the
        //                 weights are not gated, only the RIGHT to use them is — so the
        //                 original `verify`-only test read it as ungated and the tile
        //                 promised a download that delivers a Feishu form. Same ambush the
        //                 chip exists to stop, through the door the first test did not watch.
        //
        // Not gated on WHERE the user is: we do not geolocate, and asking the licence
        // instead of the user is the honest test — the ones who are outside the bar lose
        // nothing but a truer word on a tile.
        // Returns the DESCRIPTORS, not a boolean, because the footer has to name which kind
        // of errand is outstanding and a second pass over all of them would name one the
        // user has already run.
        function _licenceErrands(flow) {
            return flowLicences(flow)
                .filter(({ key, licence }) => (licence.verify || licence.territory) && !hasAcceptedLicence(key))
                .map(({ licence }) => licence);
        }

        // ── Uninstall (MPI-682) ───────────────────────────────────────────────
        //
        // Until the audio section every flow's weight arrived through a MODEL, and the
        // Model Library already uninstalls models — a flow's own `requiredDeps` were a
        // small tail on top of that. `minimax-music`, `drama-box`, `chatter-box`,
        // `voice-changer` and `stems` declare NO requiredModels at all, so their entire
        // footprint is flow-owned and the Model Library never sees it. Without this the
        // 13.4GB MiniMax Music writes to disk is install-only, permanently.
        let _pendingConfirm = null; // { run: async () => void }
        const _confirmDialog = MpiOkCancel.mount(ce('div'), {
            title: 'Uninstall', okLabel: 'Uninstall', cancelLabel: 'Cancel',
        });
        _confirmDialog.on('ok', async () => {
            const pending = _pendingConfirm;
            _pendingConfirm = null;
            await pending?.run();
        });
        _confirmDialog.on('cancel', () => { _pendingConfirm = null; });
        // The body is set with textContent, and MpiOkCancel.css carries `white-space:
        // pre-line` (MPI-683), so a `\n` in the message renders as a real line break.
        const _confirmText = qs('#text-slot', _confirmDialog.el);
        function _showConfirm(text, run) {
            if (_confirmText) _confirmText.textContent = text;
            _pendingConfirm = { run };
            _confirmDialog.el.show();
        }

        // The flow's OWN deps, and deliberately NOT `getFlowDependencies()`: that unions a
        // `requiredPlugins` plugin's deps in for the INSTALL payload, and a plugin's deps
        // are not this flow's to free — the server guard keeps them whatever we send, so
        // counting them would make the dialog promise disk it cannot deliver. Required
        // MODELS are excluded for the same reason from the other side: the Model Library
        // owns those, and MiniMax does not get to delete Krea2. No flow declares
        // `requiredPlugins` today; this is written correctly for the day one does.
        function _ownDeps(flow) {
            return (flow.requiredDeps || []).map(id => DEPS[id]).filter(Boolean);
        }

        function _uninstallFlow(flow) {
            const deps = _ownDeps(flow);
            if (!deps.length) return;
            const gb = deps.reduce((n, d) => n + sizeToGb(d.size), 0);
            _showConfirm(
                `Uninstall ${flow.title}? ${gb ? `${gb.toFixed(1)}GB` : 'Its files'} will be freed. `
                + 'Files shared with another installed flow will be kept.',
                async () => {
                    await downloadService.uninstall(flowDepKey(flow.id), deps, true);
                    // NOT redundant with the SSE — this IS the repaint. `downloadService`
                    // re-syncs only inside its `download:uninstalled` SSE listener, and
                    // `_eventSource` is created lazily by the first download: a session
                    // that has installed nothing has `_eventSource === null`, so that
                    // listener cannot fire and the dep-status cache stays pre-uninstall
                    // forever. Measured 2026-09-01 against a live app — the weights were
                    // gone from disk while the drawer still read Ready / Installed and the
                    // header still counted the flow. The Model Library's `await
                    // reSyncInstalledModels()` after every uninstall is load-bearing for
                    // the same reason. The re-sync ends in `models:checked`, which the
                    // listener below turns into `_patchAllAffected()`.
                    await reSyncInstalledModels();
                },
            );
        }

        // Install every missing required model (each drives its own dep download —
        // the shared model install flow; exactly the Model Library's _install), plus the
        // flow's own deps as ONE more job. The Flow Library owns no dep resolution of its
        // own: getModelDependencies() / getFlowDependencies() resolve, the service starts.
        // MPI-666, DELIBERATELY NOT FIXED HERE — a refused gate still has no outcome at this
        // call site, and it cannot get one honestly from `MpiFlowLibrary`. `start()` resolves
        // `undefined` on refusal, but on SUCCESS it resolves `this._installChain`, which ends
        // `.then(settle, settle)` and so resolves `undefined` too. The two are the same value.
        // Inferring a refusal from "no job appeared" instead would be a symptom patch on a
        // race, and awaiting the chain would fire the message when the download FINISHED.
        // The fix is one line in `downloadService.start()` (refuse → a distinguishable value);
        // that file is MPI-500's, so it is filed as a message, not taken. Every other caller
        // awaits and discards, so the change is safe whenever 500 lands it.
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
            for (const key of flowInstallKeys(flow)) {
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
            const ids = flowInstallKeys(flow);
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

        // MPI-590/599 — the model pickers. One dropdown per CHOOSABLE SLOT: a role the flow's
        // graph plays a model in, with more than one candidate for it. They sit BEFORE the
        // flow opens, above the required-models list the pick drives, and this drawer is now
        // the one place that question is asked — since MPI-638 an INSTALLED flow opens
        // straight into its frame and never renders this panel at all.
        //
        // THE QUESTION HERE IS "WHICH ONE DO I DOWNLOAD", and that is why candidates are
        // offered whether or not they are installed (MPI-599). The run slide asks the other
        // question — which one do I RUN — and offers installed candidates only. Two surfaces,
        // two questions, one session Map (`setFlowModel`).
        //
        // The slot's `label` is a DISAMBIGUATOR, not a name (MPI-638). It renders only when
        // the flow declares more than one slot; otherwise the caption is the generic "Model"
        // and the dropdown's own rows carry the identity. Fabio, 2026-08-28: "render model"
        // and "edit model" "are not names that are sustainable because we might have
        // 'pinpaint model' or 'remove model'". No shipped flow declares two slots, so today
        // that wording is gone from the app without a single descriptor edit — and the day a
        // two-slot flow ships, the label returns to a place where it earns its words.
        function _modelChoiceHtml(flow) {
            const multi = flowModelSlots(flow).length > 1;
            return flowModelChoices(flow)
                .map((slot, i) => `
                <div class="mpi-detail__field">
                    <span class="mpi-detail__field-label">${multi ? slot.label : 'Model'}</span>
                    <div class="mpi-detail__model-pick">
                        <div id="flow-detail-model-${i}"></div>
                    </div>
                </div>`)
                .join('');
        }

        function _mountModelChoice(flow) {
            const resolved = flowModelIds(flow);
            const installed = state.s_installedModelIds || [];
            flowModelChoices(flow).forEach((slot, i) => {
                const host = qs(`#flow-detail-model-${i}`, detailBody);
                if (!host) return;
                // Two candidates in ONE slot can share a display name — FLUX.2 Klein 4B and
                // 9B are both literally "FLUX.2 Klein" — which renders two identical rows the
                // user cannot choose between (MPI-567). `disambiguatedName` appends the tier
                // letter when, and only when, this slot is actually ambiguous. It lives in
                // modelRegistry.js because MpiBaseFlow's run-slide picker needs the exact
                // same call (MPI-638), and two copies would drift into one surface
                // disambiguating and the other not.
                const _label = (id) => disambiguatedName(id, slot.models);
                const dd = MpiDropdown.mount(host, {
                    options: slot.models.map(id => ({
                        value: id,
                        label: _label(id),
                        // The recommendation is the flow author's, and it is the candidate an
                        // untouched picker resolves to — so it has to be visible, or a user
                        // choosing blind between four SDXL checkpoints is guessing. Same
                        // sparkle the Model Library flags Featured with (MPI-514), and the
                        // word rather than a hover: a dropdown row has space for it.
                        ...(id === slot.recommended ? { icon: 'sparkle', meta: 'Recommended' } : {}),
                        // Not `disabled` — an uninstalled candidate is pickable ON PURPOSE.
                        // Picking it is how the user says "install that one instead", which
                        // the Required-models row and the Install button below then follow.
                        ...(installed.includes(id) ? {} : { info: `${_label(id)} — not installed yet` }),
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

                // NO LoRA COGWHEEL HERE (MPI-638). MPI-608 put one in this drawer and
                // MPI-613 put another on the run slide, and both were live at once. Since
                // MPI-638 an INSTALLED flow never opens this drawer at all, so the only
                // flow that reaches it is one whose weights are not on disk — and a LoRA
                // rack for a model the user has not downloaded configures nothing. The
                // cogwheel now lives beside the model dropdown on the run slide, where the
                // rack it edits is one press from the Generate button that uses it.
            });
        }

        // MPI-666 — the licence field's HOST. The rows themselves come from
        // js/utils/flowLicences.js, which MpiBaseFlow's step 0 renders from too; only the
        // drawer's `mpi-detail__field` wrapper is local, because only this surface has one.
        function _licenceFieldHtml(flow) {
            if (!flowLicences(flow).length) return '';
            return `
                <div class="mpi-detail__field">
                    <span class="mpi-detail__field-label">Licence</span>
                    <div id="flow-detail-licences"></div>
                </div>`;
        }

        function _mountLicences(flow) {
            const host = qs('#flow-detail-licences', detailBody);
            if (!host) return;
            host.append(...buildLicenceRows(flow, _unsubs));
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
                </div>
                ${_licenceFieldHtml(flow)}`;

            _mountModelChoice(flow);
            _mountLicences(flow);

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
                // MPI-682 — the only route to freeing a deps-only flow's weights. Gated on
                // the flow owning deps, exactly as the plugin row is (MpiModelManager
                // `_pluginTile`): a models-only flow owns nothing to free, its weights come
                // off in the Model Library, and a button here would read as an offer to
                // delete the model itself.
                if ((flow.requiredDeps || []).length) {
                    const uninstall = MpiButton.mount(ce('div'), {
                        text: 'Uninstall', variant: 'secondary', size: 'md',
                    });
                    uninstall.on('click', () => { _uninstallFlow(flow); });
                    detailActions.appendChild(uninstall.el); _detailBtns.push(uninstall);
                }
            } else {
                // Same button, same path — the gate fires inside `downloadService.start()`
                // whatever this says. Only the PROMISE changes, and it has to match what the
                // click actually delivers (MPI-666):
                //   "Verify licence"  — a `verify` licence ends in a token probe we run, so
                //                       the word is literal. Matches the Model Library.
                //   "Review licence"  — a territory-restricted one has nothing to verify;
                //                       the dialog is where the terms and the licensor's own
                //                       authorization route live, and for an EU/UK/KR/US user
                //                       reading them IS the step. Promising verification we
                //                       never perform would be the same lie as "Get models".
                //   "Install models"  — ungated: the click starts a download.
                // Derived from the OUTSTANDING descriptors, not all of them: a flow whose
                // klein-9b receipt is already filed and whose H3 one is not has nothing left
                // to verify, and "Verify licence" would name the step the user already did.
                const outstanding = _licenceErrands(flow);
                const install = MpiButton.mount(ce('div'), {
                    text: !outstanding.length ? 'Install models'
                        : outstanding.some(l => l.verify) ? 'Verify licence' : 'Review licence',
                    variant: 'primary', size: 'md',
                });
                install.on('click', () => { _installMissing(flow, missing); });
                detailActions.appendChild(install.el); _detailBtns.push(install);
            }

            scrim.classList.add('is-open');
            detailPanel.classList.add('is-open');
        }

        // A tile press. An INSTALLED flow opens straight into its frame — the drawer is
        // skipped, not hidden (MPI-638).
        //
        // Fabio, 2026-08-28: "when a flow is installed and the user clicks it, the slide over
        // shows up for the user to press open. The first thing that the user sees is an
        // explanation of how the flow works and what it does, so the slide over is an
        // unnecessary step." He is describing a literal duplicate: `MpiBaseFlow`'s step 0
        // already paints the title, the hero clip and the description in its right column,
        // so for a Ready flow the drawer's only unique content is install machinery that
        // flow has no use for.
        //
        // The drawer still opens for everything else, and both cases are load-bearing:
        //   - NOT available → Install, the aggregated progress bar and Cancel-all live there,
        //     and so does the model picker, which is where a user chooses what to DOWNLOAD.
        //   - available but not in the Gallery → `flow:open` would go nowhere. Flows land as
        //     gallery cards in the current project, so the drawer's disabled Open + its toast
        //     stay the honest answer on Landing.
        // `#flow-back` inside the frame reopens this library, so nothing becomes unreachable.
        function _pick(flow) {
            if (flowAvailability(flow).available && state.currentPage === PAGE_GALLERY) {
                el.close();
                Events.emit('flow:open', { flowId: flow.id });
                return;
            }
            openDetail(flow);
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
        // …EXCEPT when the pulse came from an overlay OPENING on top of us. `Overlays.open`
        // fires `{ reason: 'overlay-open' }` on every open specifically so long-lived panels
        // can ignore it (overlayManager.js ~44), and this detail drawer is one — the LoRA
        // cogwheel opens Model Settings from inside it, and without this guard that open
        // pulse closed the drawer underneath, so returning from the panel dropped the user
        // back on the grid with nothing selected (Fabio, MPI-608). Same guard MpiOverlay
        // (~234) and MpiSlideOver (~116) already carry, and for the same reason.
        //
        // Escape and Overlays.reset() still fire this BARE, so the drawer still closes on
        // those — which is the behaviour that made the bare listener look correct.
        _unsubs.push(Events.on('ui:close-all-popups', (payload) => {
            if (payload?.reason === 'overlay-open') return;
            _closeDetail();
        }));

        // ── Render the contact sheet ────────────────────────────────────────
        function _destroyAllTiles() {
            _sheets.forEach(s => s?.el?.destroy?.());
            _sheets.length = 0;
        }

        // One labelled section: header (icon + name + count) then its contact sheet.
        // Empty section = no header, so a build with no audio flows looks exactly as it
        // does today.
        function _block(items, label, icon) {
            if (!items.length) return;
            const head = ce('div', {
                className: `mpi-flow-library__media-head mpi-flow-library__media-head--${icon}`,
            });
            head.innerHTML = `${renderIcon(icon, 'sm')}<span>${label}</span><span class="mpi-flow-library__media-head-n">${items.length}</span>`;
            bodySlot.appendChild(head);

            const sheet = MpiTileSheet.mount(ce('div'), { items: items.map(_tileItem) });
            sheet.on('select', ({ item }) => _pick(item.source));
            _sheets.push(sheet);
            bodySlot.appendChild(sheet.el);
        }

        // The head count, derived from the SAME `flowAvailability` the tile badges are.
        // It lives in its own function because it has two callers (MPI-635): a full
        // render, and every install-state change that re-derives the badges without one.
        // Written only by renderList(), it read "11 ready" over a grid of twelve
        // Get-models chips — the header and the grid below it are one claim about one
        // set, so they have to be recomputed by one signal.
        function _renderSub() {
            const flows = listFlows();
            const readyN = flows.filter(a => flowAvailability(a).available).length;
            subEl.textContent = flows.length
                ? `${readyN} ready · ${flows.length - readyN} need models`
                : 'No flows yet.';
        }

        function renderList() {
            _destroyAllTiles();
            bodySlot.innerHTML = '';

            const flows = listFlows();
            _renderSub();

            if (!flows.length) {
                bodySlot.appendChild(ce('div', {
                    className: 'mpi-flow-library__empty',
                    textContent: 'No flows available yet.',
                }));
                return;
            }

            for (const { media, label } of MEDIA_SECTIONS) {
                _block(flows.filter(f => f.mediaType === media), label, media);
            }
            // A flow whose mediaType matches no section still gets a grid rather than
            // silently vanishing from the library — the sections are a VIEW over the
            // registry, not a filter on it.
            _block(
                flows.filter(f => !MEDIA_SECTIONS.some(s => s.media === f.mediaType)),
                'Other', 'info',
            );
        }

        // ── Re-derive a single flow's badge (+ its open detail footer) in place ──
        // Availability is a pure function of the installed set, so any install-state
        // change just recomputes badges — never a full grid rebuild (MPI-235).
        function _patchTile(flowId) {
            const flow = listFlows().find(a => a.id === flowId);
            if (!flow) return;
            _sheets.forEach(s => s?.el?.patchState(flowId, _badgeHtml(flow)));
            if (_activeDetail && _activeDetail.id === flowId) openDetail(flow);
        }

        // A model finishing/leaving install changes s_installedModelIds → re-derive
        // every tile whose required set includes it. Cheap: iterate the tiny flow list.
        function _patchAllAffected() {
            for (const flow of listFlows()) _patchTile(flow.id);
            _renderSub();
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
            if (_activeDetail && flowInstallKeys(_activeDetail).includes(modelId)) _patchProgress(_activeDetail);
        }));
        // State transitions rebuild the open panel (footer swaps Install↔Cancel↔Open,
        // required-models rows repaint). Only the open panel repaints; the grid badges
        // follow s_installedModelIds once the model actually flips installed.
        _unsubs.push(Events.on('download:complete', () => { if (_activeDetail) openDetail(_activeDetail); }));
        _unsubs.push(Events.on('download:started', () => { if (_activeDetail) openDetail(_activeDetail); }));
        _unsubs.push(Events.on('download:cancelled', () => { if (_activeDetail) openDetail(_activeDetail); }));
        // MPI-682 — nothing else reports a FLOW uninstall. MpiModelManager owns the
        // removed/kept toast for models and plugins, and it only exists while the Model
        // Library is mounted; its lookup resolves a `flow:` key to neither, so the two
        // never both speak. No repaint here on purpose: at this instant the dep-status
        // cache is still pre-uninstall, so painting now would redraw the flow as Ready.
        // The repaint is the `await reSyncInstalledModels()` in `_uninstallFlow` — it
        // re-reads disk and ends in `models:checked`, which MPI-681 made fire for a
        // deps-only change and which `_patchAllAffected` is bound to above.
        _unsubs.push(Events.on('download:uninstalled', ({ modelId, removed = [], keptShared = [], keptModelFiles = [] }) => {
            const flow = listFlows().find(f => flowDepKey(f.id) === modelId);
            if (!flow) return;
            // MPI-469 — a dep reported 'already-absent' was not KEPT, it was never on disk,
            // so it is gone and the uninstall is complete. Counting it as kept toasts
            // "files kept" over a flow whose weights had all vanished.
            const absent = keptModelFiles.filter(k => k.reason === 'already-absent').length;
            const gone = removed.length + absent;
            const kept = (keptModelFiles.length - absent) + keptShared.length;
            // sound:false — this confirms a click the user just made; no chime.
            if (gone && kept) {
                Events.emit('ui:info', { title: 'Uninstalled', message: `${flow.title} uninstalled (some shared files kept).`, sound: false });
            } else if (gone) {
                Events.emit('ui:success', { title: 'Uninstalled', message: `${flow.title} uninstalled.`, sound: false });
            } else {
                Events.emit('ui:info', { title: 'Nothing freed', message: `${flow.title} — every file is still needed by another installed flow.`, sound: false });
            }
        }));

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
            _confirmDialog?.el?.destroy?.();
            overlay?.el?.destroy?.();
        };
    },
});
