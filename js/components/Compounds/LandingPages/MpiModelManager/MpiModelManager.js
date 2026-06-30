import { ComponentFactory } from '../../../factory.js';
import { MpiInstalledDisplay } from '../../MpiInstalledDisplay/MpiInstalledDisplay.js';
import { MpiOkCancel } from '../../MpiOkCancel/MpiOkCancel.js';
import { MpiButton } from '../../../Primitives/MpiButton/MpiButton.js';
import { Events } from '../../../../events.js';
import { state } from '../../../../state.js';
import { MODELS, reSyncInstalledModels, getModelDepStatus } from '../../../../data/modelRegistry.js';
import { DEPS } from '../../../../data/modelConstants/dependencies.js';
import {
    resolveDeps, resolveFullUniverse, deriveInstalledOps, selectableOps,
    expandRequiredOps, dependentsOfOp,
} from '../../../../data/modelConstants/resolveModelDeps.js';
import { getCommand } from '../../../../data/commandRegistry.js';
import { downloadService } from '../../../../services/downloadService.js';
import { remoteEngineClient } from '../../../../services/remoteEngineClient.js';
import { qs, qsa, ce, on } from '../../../../utils/dom.js';
import { formatBytes } from '../../../../utils/formatBytes.js';

/**
 * MpiModelManager — Model-manager content for the MpiSlideOver panel.
 *
 * Renders installed + available models as MpiInstalledDisplay cards and owns all
 * model-list logic: refresh, install, pause/resume/cancel, uninstall, partial-
 * progress, and download:* event subscriptions.
 *
 * MPI-122 — operation-selectable models (e.g. Wan 2.2) render a toggle row above
 * the card. The user picks which operations to install; the button reads
 * Install / Update / Uninstall depending on installed vs drafted state:
 *   - 0 ops installed                → Install (installs the drafted ops)
 *   - ≥1 installed, draft == installed → Uninstall (whole model)
 *   - ≥1 installed, draft != installed → Update (install added ops + uninstall
 *     removed ops; a confirm dialog gates any removal)
 * The draft persists across sessions in state.s_modelOpDraftByModel. A "base"
 * toggle (commonDeps) is shown only when the model has bundled ops that run on
 * commonDeps alone (image models with upscale/detail); turning it off cascades
 * every op off. Video models (no bundled ops) show only their op toggles.
 *
 * Flat models with no separable operations (all image models today) keep the
 * original Install/Uninstall card behaviour with no toggle row.
 *
 * No overlay chrome — drops into the MpiSlideOver body. MpiSlideOver calls
 * el.onOpen() each time the panel opens so installed state is re-synced.
 */
export const MpiModelManager = ComponentFactory.create({
    name: 'MpiModelManager',
    css: ['js/components/Compounds/LandingPages/MpiModelManager/MpiModelManager.css'],

    template: () => `
        <div class="mpi-model-manager">
            <div class="mpi-model-manager__toolbar">
                <p class="mpi-model-manager__text">Select a model pack to install. Required files will be fetched automatically.</p>
                <div class="mpi-model-manager__refresh-btn" id="refresh-btn-slot"></div>
            </div>
            <div class="mpi-model-manager__separator"></div>
            <div class="mpi-model-manager__slot" id="body-slot"></div>
        </div>`,

    setup: (el) => {
        const bodySlot = qs('#body-slot', el);
        const refreshSlot = qs('.mpi-model-manager__refresh-btn', el);

        const _unsubs = [];

        // Tracks whether the app is connected to a cloud (RunPod) engine. Remote
        // downloads have no pause/resume API, so cards hide the Pause button when
        // this is true. Kept in sync via the remote:connection event. (MPI-140)
        let _isRemote = false;

        // Per-modelId card instance tracking so download:progress events can update a
        // single card in-place instead of re-rendering the whole list.
        //   Map<modelId, { wrapper, display }>
        const _cardInstances = new Map();
        //   Map<modelId, { pause, resume, cancel }>
        const _cardHandlers = new Map();
        // Op-toggle MpiButton instances per model, torn down on re-render/destroy.
        //   Map<modelId, Array<{ key, inst }>>  (key 'base' for the base toggle)
        const _opToggles = new Map();

        // ── Base-toggle pseudo-key ───────────────────────────────────────────
        const BASE = 'base';

        // ── Refresh button ───────────────────────────────────────────────────
        const refreshBtn = MpiButton.mount(refreshSlot, {
            icon: 'refresh', variant: 'ghost', size: 'md',
            info: 'Refresh model state from disk',
        });
        _unsubs.push(on(refreshBtn.el, 'click', () => { awaitReSync(); }));

        // ── Confirm dialog (shared) — used for whole-model uninstall AND op removal ──
        let _pendingConfirm = null; // { run: async () => void }
        const _confirmDialog = MpiOkCancel.mount(document.createElement('div'), {
            title:       'Uninstall',
            text:        'Delete these files?\n• Files shared with other installed models will be kept.',
            okLabel:     'Uninstall',
            cancelLabel: 'Cancel',
            checkbox:    { label: 'Also delete model files from disk', checked: true },
        });
        _confirmDialog.on('ok', async ({ checkboxChecked }) => {
            const pending = _pendingConfirm;
            _pendingConfirm = null;
            if (!pending) return;
            await pending.run(checkboxChecked);
            await reSyncInstalledModels();
        });
        _confirmDialog.on('cancel', () => { _pendingConfirm = null; });

        // Set the dialog body text before showing (op removal vs whole-model differ).
        const _confirmText = qs('#text-slot', _confirmDialog.el);
        function _showConfirm(text, run) {
            if (_confirmText) _confirmText.textContent = text;
            _pendingConfirm = { run };
            _confirmDialog.el.show();
        }

        // ── Dep helpers ──────────────────────────────────────────────────────
        const _depIsInstalled = depState =>
            depState === true || depState?.installed === true;

        function _parseSizeToBytes(sizeStr) {
            if (!sizeStr) return 0;
            const match = sizeStr.match(/^([\d\.]+)\s*(GB|MB|KB|B)$/i);
            if (!match) return 0;
            return parseFloat(match[1]) * { GB: 1024 ** 3, MB: 1024 ** 2, KB: 1024, B: 1 }[match[2].toUpperCase()] || 0;
        }

        function _sizeOf(depIds) {
            let total = 0;
            for (const id of depIds) {
                const dep = DEPS[id];
                if (dep) total += _parseSizeToBytes(dep.size);
            }
            return total;
        }

        function _vramOf(depIds) {
            let maxVram = 0;
            for (const id of depIds) {
                const v = parseInt(DEPS[id]?.vram) || 0;
                if (v > maxVram) maxVram = v;
            }
            return maxVram;
        }

        // Operations the model bundles into its core (in supportedOps but NOT a
        // selectable operation group) — e.g. SDXL upscale/detail. When ≥1 exists,
        // commonDeps form a usable "base" and we show a base toggle. Video models
        // have none, so no base toggle.
        function _bundledOps(model) {
            const sel = new Set(selectableOps(model));
            return (model.supportedOps || []).filter(op => {
                if (sel.has(op)) return false;
                const cmd = getCommand(op);
                return cmd && !cmd.universal;
            });
        }
        const _hasBaseToggle = model => _bundledOps(model).length > 0;

        // ── Installed-state + draft derivation ───────────────────────────────
        function _installedOpsOf(model) {
            const depStatus = getModelDepStatus(model.id);
            if (!depStatus) return [];
            // Engine-correct: a model with engine-split weights (LTX bf16/GGUF) is
            // installed when the CURRENT engine's transformer is on disk, not the
            // other engine's. Pass the engine so a Pod doesn't read "not installed"
            // because the local bf16 is absent (and vice-versa). (MPI-163)
            const engine = remoteEngineClient.isRemote() ? 'remote' : 'local';
            const { installedOps } = deriveInstalledOps(
                model, id => _depIsInstalled(depStatus.get(id)), engine,
            );
            return installedOps;
        }

        // The user's current op-selection draft for a model. Persisted across
        // sessions in state.s_modelOpDraftByModel. Defaults:
        //   - if any op is installed → the installed set (so reopening reflects disk)
        //   - else (fresh model)     → all selectable ops (default all-on)
        // A NON-EMPTY saved draft wins. An empty/absent saved draft is NOT honored —
        // "all ops off" is not a meaningful persisted state for a not-installed model
        // (it would default Wan to commonDeps-only ~6.5GB and Install would fetch no
        // ops). A stale empty draft from earlier testing must fall back to the
        // installed-or-all default, not stick as empty. (MPI-122)
        function _draftFor(model) {
            const saved = state.s_modelOpDraftByModel?.[model.id];
            if (Array.isArray(saved) && saved.length > 0) {
                // Keep only still-selectable ops, then expand requiresOps.
                const expanded = expandRequiredOps(model, saved);
                if (expanded.length > 0) return expanded;
            }
            const installed = _installedOpsOf(model);
            return installed.length ? installed : selectableOps(model);
        }

        function _setDraft(model, ops) {
            const next = expandRequiredOps(model, ops);
            state.s_modelOpDraftByModel = {
                ...(state.s_modelOpDraftByModel || {}),
                [model.id]: next,
            };
        }

        // ── Resolve helpers around install/uninstall ─────────────────────────
        // The engine this manager view targets — every dep resolution (footprint,
        // partial bar, install set) must scope to it so an engine-split model (LTX
        // bf16-local / GGUF-Pod) never counts the OTHER engine's transformer. On a
        // Pod that's the bug: the bf16 (41GB, absent) inflated the denominator to
        // 85.8GB and the missing-dep made the card read PARTIALLY INSTALLED. (MPI-163)
        const _engine = () => (remoteEngineClient.isRemote() ? 'remote' : 'local');

        // Deps to fetch for the drafted op set (commonDeps + drafted ops), scoped to
        // the current engine (adds localDeps OR remoteDeps, never both).
        function _draftDepIds(model) {
            return resolveDeps(model, _draftFor(model), null, _engine());
        }

        // Per-op uninstall dep set: the removed ops' deps MINUS any dep still used
        // by an op that REMAINS installed-or-drafted (incl. commonDeps, which any
        // remaining op keeps alive). Intra-model subtraction — the backend's
        // shared-dep guard only protects across OTHER models, so we must not hand it
        // a dep a sibling op of THIS model still needs. (MPI-122)
        function _opUninstallDepIds(model, removedOps, keptOps) {
            const removed = resolveDeps(model, removedOps);
            const keep = new Set(resolveDeps(model, keptOps)); // includes commonDeps
            return removed.filter(id => !keep.has(id));
        }

        // ── Install / Update / Uninstall actions ─────────────────────────────
        async function _install(model) {
            // Engine-scoped via _draftDepIds: a model with engine-split weights
            // (LTX-2.3 bf16-local / GGUF-remote) installs only the current engine's
            // transformer + nodes, never both (41GB of dead weight otherwise). The
            // resolver adds localDeps/remoteDeps by engine; shared deps always in.
            // (MPI-163 — engine-aware resolution, replaces the old post-filter)
            const dependencies = _draftDepIds(model).map(id => DEPS[id]).filter(Boolean);
            if (!dependencies.length) return;
            await downloadService.start(model.id, dependencies);
            renderList();
        }

        // Whole-model uninstall (no toggle change, or flat model).
        function _confirmWholeUninstall(model) {
            const deps = resolveFullUniverse(model).map(id => DEPS[id]).filter(Boolean);
            _showConfirm(
                `Uninstall ${model.name}?\n• Files shared with other installed models will be kept.`,
                async (deleteFiles) => {
                    await downloadService.uninstall(model.id, deps, deleteFiles);
                },
            );
        }

        // Update: apply the draft against the installed set. Adds install; removals
        // require confirm. Mixed → confirm (for the removal) then add.
        async function _applyUpdate(model) {
            const installed = new Set(_installedOpsOf(model));
            const draft = new Set(_draftFor(model));
            const added = [...draft].filter(op => !installed.has(op));
            const removed = [...installed].filter(op => !draft.has(op));

            const doInstall = async () => {
                if (!added.length) return;
                // Install resolves the FULL draft (downloader dedupes already-present
                // deps; the resumable layer skips complete files).
                await _install(model);
            };

            if (removed.length === 0) {
                await doInstall();
                return;
            }

            // Removal present → confirm. On OK: uninstall removed ops' unique deps,
            // then install any added ops.
            const keptOps = [...draft]; // what stays after the update
            const removeDeps = _opUninstallDepIds(model, removed, keptOps)
                .map(id => DEPS[id]).filter(Boolean);
            const removedLabels = removed.map(op => (getCommand(op) || {}).label || op).join(', ');
            const addedLabels = added.map(op => (getCommand(op) || {}).label || op).join(', ');
            const lines = [`Remove ${removedLabels} from ${model.name}?`];
            if (addedLabels) lines.push(`Also installs: ${addedLabels}.`);
            lines.push('• Files shared with other operations or models are kept.');
            _showConfirm(lines.join('\n'), async (deleteFiles) => {
                if (removeDeps.length) {
                    await downloadService.uninstall(model.id, removeDeps, deleteFiles);
                }
                await doInstall();
            });
        }

        // ── Re-sync wrapper ────────────────────────────────────────────────
        async function awaitReSync() {
            refreshBtn.el.setAttribute('loading', 'true');
            await reSyncInstalledModels();
            renderList();
            refreshBtn.el.removeAttribute('loading');
        }

        // ── Partial-progress measured against the DRAFT deps ─────────────────
        // The bar tracks how much of what the user will install is already on disk,
        // so a deliberately-omitted op never reads as partial. (MPI-122)
        function _computePartial(model) {
            const depStatus = getModelDepStatus(model.id);
            if (!depStatus) return { hasPartialProgress: false };
            const deps = _draftDepIds(model).map(id => DEPS[id]).filter(Boolean);
            let installedDeps = 0, downloaded = 0, total = 0;
            for (const dep of deps) {
                const st = depStatus.get(dep.id);
                if (_depIsInstalled(st)) { downloaded += _parseSizeToBytes(dep.size); installedDeps += 1; }
                else if (st?.partialBytes) { downloaded += st.partialBytes; }
                total += _parseSizeToBytes(dep.size);
            }
            const allInstalled = installedDeps === deps.length;
            if (total > 0 && !allInstalled) {
                return {
                    hasPartialProgress: true,
                    progress: Math.min(total > 0 ? downloaded / total : 0, 0.99),
                    downloadedBytes: downloaded,
                    totalBytes: total,
                };
            }
            return { hasPartialProgress: false };
        }

        // ── Toggle row ───────────────────────────────────────────────────────
        // Renders the base toggle (iff bundled ops) + one toggle per selectable op.
        // Toggling mutates the draft with cascade rules then re-renders the list so
        // size/partial/button all reflect the new draft. `frozen` disables the row
        // during an active download.
        function _buildToggleRow(model, { frozen }) {
            const ops = selectableOps(model);
            if (ops.length === 0) return null; // flat model → no toggles

            const draft = new Set(_draftFor(model));
            const showBase = _hasBaseToggle(model);

            // The row IS the toggle grid — no header label (the toggle text is
            // self-explanatory and the user has no concept of "operations" yet).
            // Flex-wrap so future models stack toggles (max ~3 per row via CSS).
            const row = ce('div', { className: 'mpi-model-manager__ops-row' });
            const btnRow = row;

            const toggles = [];

            // Commit the current draft set and re-render. force — the draft mutation
            // IS the change; rebuild unconditionally so size/partial/button update.
            const commit = () => { _setDraft(model, [...draft]); renderList({ force: true }); };

            if (showBase) {
                const baseInst = MpiButton.mount(ce('div'), {
                    // icon-button mode reads `label`, not `text`.
                    label: 'Base model', icon: 'layers', variant: 'secondary', size: 'sm',
                    toggleable: true, active: draft.size > 0, disabled: frozen,
                });
                baseInst.on('toggle', ({ active }) => {
                    if (active) {
                        // Base on alone = commonDeps only (bundled ops become usable).
                        // No op auto-selected; user adds ops explicitly.
                    } else {
                        // Base off → cascade every op off (nothing can exist without common).
                        draft.clear();
                    }
                    commit();
                });
                toggles.push({ key: BASE, inst: baseInst });
                btnRow.appendChild(baseInst.el);
            }

            ops.forEach(op => {
                const cmd = getCommand(op) || {};
                const inst = MpiButton.mount(ce('div'), {
                    // icon-button mode reads `label`, not `text`.
                    label: cmd.label || op,
                    icon: cmd.icon || undefined,
                    variant: 'secondary', size: 'sm',
                    toggleable: true, active: draft.has(op), disabled: frozen,
                });
                inst.on('toggle', ({ active }) => {
                    if (active) {
                        draft.add(op);
                        // Pull in required ops (e.g. extend needs i2v).
                        for (const req of expandRequiredOps(model, [op])) draft.add(req);
                    } else {
                        draft.delete(op);
                        // Cascade off anything that required this op.
                        for (const dep of dependentsOfOp(model, op)) draft.delete(dep);
                        // No-base models: blocking the last op is NOT required — the
                        // user uninstalls everything via the Uninstall button. But a
                        // zero-draft on a fresh (nothing installed) no-base model would
                        // disable Install; allow it — button just disables.
                    }
                    commit();
                });
                toggles.push({ key: op, inst });
                btnRow.appendChild(inst.el);
            });

            _opToggles.set(model.id, toggles);
            return row;
        }

        // ── Card builder (unified install/uninstall path) ────────────────────
        function _buildCard(model) {
            const cardWrap = ce('div', { className: 'mpi-model-manager__card' });

            const job = state.downloadJobs.find(j => j.modelId === model.id);
            const downloadState = job ? job.status : 'idle';
            const isActiveDownload = ['downloading', 'paused', 'installing'].includes(downloadState);

            // Sizes: drafted footprint (what install fetches) for op-keyed models,
            // else the engine-scoped universe — a Pod must show the GGUF footprint,
            // not bf16+GGUF (the 85.8GB-vs-real bug). (MPI-163)
            const sizeDepIds = selectableOps(model).length ? _draftDepIds(model) : resolveFullUniverse(model, null, _engine());
            const sizeBytes = _sizeOf(sizeDepIds);
            const vram = _vramOf(resolveFullUniverse(model, null, _engine()));
            const sizeText = sizeBytes > 0 ? formatBytes(sizeBytes) : '';
            const vramText = vram > 0 ? `${vram}GB VRAM` : '';

            // Install state machine.
            const installedOps = _installedOpsOf(model);
            const hasOps = selectableOps(model).length > 0;
            const draft = _draftFor(model);
            const draftDiffersFromInstalled = hasOps && (
                installedOps.length !== draft.length
                || installedOps.some(op => !draft.includes(op))
            );
            const anyInstalled = model.installed === true || installedOps.length > 0;

            // Partial progress (idle only).
            let partial = { hasPartialProgress: false };
            if (downloadState === 'idle') partial = _computePartial(model);

            const progress = job ? job.progress : (partial.progress || 0);
            const speed = job ? job.speed : '';
            const downloadedBytes = job ? job.downloadedBytes : (partial.downloadedBytes || 0);
            const totalBytes = job ? job.totalBytes : (partial.totalBytes || 0);
            // IMPORTANT: never coerce the card to the 'partial' DOWNLOAD state — that
            // makes MpiInstalledDisplay render Resume/Cancel buttons, but a partial
            // op-selectable model has no paused job to resume/cancel (the dead-button
            // bug). The partial PROGRESS BAR is driven separately by hasPartialProgress;
            // the action button stays Install/Update/Uninstall. (MPI-122)
            const displayState = downloadState;
            const showPartialBar = partial.hasPartialProgress && !isActiveDownload;

            // Button label: Install (nothing installed) / Update (changes) / Uninstall.
            const showInstalled = anyInstalled;
            const uninstallLabel = draftDiffersFromInstalled ? 'Update' : 'Uninstall';

            const card = MpiInstalledDisplay.mount(cardWrap, {
                title: model.name,
                meta: sizeText,
                text: model.description || '',
                image: model.image || '',
                video: model.video || '',
                mediaRatio: model.mediaRatio || '',
                icon: showInstalled ? 'info' : 'warning',
                iconText: vramText,
                installed: showInstalled,
                canUninstall: showInstalled,
                uninstallLabel,
                deleteLabel: 'Install',
                downloadState: displayState,
                progress,
                hasPartialProgress: showPartialBar,
                speed,
                downloadedBytes,
                totalBytes,
                indeterminate: job ? !!job.indeterminate : false,
                phase: job ? (job.phase || 'preparing') : 'preparing',
                isRemote: _isRemote,
            });

            // Toggle row lives INSIDE the card, between the badge and the action
            // button (card.el.opsSlot is a static slot the card never rebuilds).
            // Op-keyed models only; frozen during an active download.
            const toggleRow = _buildToggleRow(model, { frozen: isActiveDownload });
            if (toggleRow && card.el.opsSlot) {
                card.el.opsSlot.appendChild(toggleRow);
                card.el.opsSlot.style.display = '';
            }

            if (isActiveDownload) {
                const pauseCb = () => downloadService.pause(model.id);
                const resumeCb = () => downloadService.resume(model.id);
                const cancelCb = () => downloadService.cancel(model.id);
                card.on('pause', pauseCb);
                card.on('resume', resumeCb);
                card.on('cancel', cancelCb);
                _cardHandlers.set(model.id, { pause: pauseCb, resume: resumeCb, cancel: cancelCb });
            } else if (showInstalled) {
                // Installed → button is Update (apply draft) or Uninstall (whole model).
                card.on('uninstall', () => {
                    if (draftDiffersFromInstalled) _applyUpdate(model);
                    else _confirmWholeUninstall(model);
                });
            } else {
                // Not installed → Install the drafted ops.
                card.on('delete', () => { _install(model); });
            }

            _cardInstances.set(model.id, { wrapper: cardWrap, display: card });
            return cardWrap;
        }

        // ── Teardown ─────────────────────────────────────────────────────────
        function _destroyAllCards() {
            for (const { display } of _cardInstances.values()) display?.el?.destroy?.();
            _cardInstances.clear();
            for (const toggles of _opToggles.values()) {
                toggles.forEach(({ inst }) => inst?.el?.destroy?.());
            }
            _opToggles.clear();
        }

        // ── Render signature (MPI-124) ─────────────────────────────────────
        // A string fingerprint of everything _buildCard renders for the whole
        // list. renderList() short-circuits when it is unchanged so an incidental
        // re-sync (every models:checked fires state:changed even when the installed
        // SET did not move) no longer tears down + rebuilds every card → no flash.
        // Mirrors the MpiQueuePanel signature-diff pattern. Anything that genuinely
        // changes the visible output (section, installed ops, draft, job state,
        // partial bar) is in the sig, so a real change still forces one full rebuild.
        let _lastSig = null;
        function _listSignature() {
            return MODELS.map(model => {
                const installedOps = _installedOpsOf(model);
                const isInst = model.installed === true || installedOps.length > 0;
                const draft = selectableOps(model).length ? _draftFor(model) : [];
                const job = state.downloadJobs.find(j => j.modelId === model.id);
                const jobSig = job
                    ? `${job.status}:${job.indeterminate ? 1 : 0}:${job.phase || ''}`
                    : 'idle';
                // Partial bar only matters when idle; round progress so byte-level
                // ticks don't churn the sig (active download patches in place anyway).
                let partSig = '0';
                if (!job) {
                    const p = _computePartial(model);
                    partSig = p.hasPartialProgress ? `1:${Math.round((p.progress || 0) * 100)}` : '0';
                }
                return `${model.id}|${isInst ? 1 : 0}|${[...installedOps].sort().join(',')}|${[...draft].sort().join(',')}|${jobSig}|${partSig}`;
            }).join('||');
        }

        // ── Render card list ───────────────────────────────────────────────
        // force=true bypasses the signature guard — used by the toggle commit()
        // path, where the draft change IS the sig change but we still want an
        // unconditional rebuild even if a future field makes the sigs collide.
        function renderList({ force = false } = {}) {
            const sig = _listSignature();
            if (!force && sig === _lastSig) return; // no visible change → skip the flash
            _lastSig = sig;
            _destroyAllCards();
            qsa('.mpi-model-manager__card', bodySlot).forEach(c => c.remove());
            qsa('.mpi-model-manager__section-header', bodySlot).forEach(h => h.remove());
            qsa('.mpi-model-manager__empty', bodySlot).forEach(e => e.remove());

            // A model is "installed" for sectioning when its installed flag is set OR
            // at least one of its ops is installed (op-keyed partial installs).
            const isInstalled = m => m.installed === true || _installedOpsOf(m).length > 0;
            const installed = MODELS.filter(isInstalled);
            const uninstalled = MODELS.filter(m => !isInstalled(m));

            if (installed.length > 0) {
                bodySlot.appendChild(ce('div', { className: 'mpi-model-manager__section-header' },
                    [document.createTextNode('Installed Models')]));
                installed.forEach(model => bodySlot.appendChild(_buildCard(model)));
            }

            if (uninstalled.length === 0 && installed.length > 0) {
                bodySlot.appendChild(ce('div', { className: 'mpi-model-manager__empty' },
                    [ce('span', { textContent: 'No models available to install' })]));
                return;
            }
            if (uninstalled.length === 0 && installed.length === 0) {
                bodySlot.appendChild(ce('div', { className: 'mpi-model-manager__empty' },
                    [ce('span', { textContent: 'No models available' })]));
                return;
            }
            uninstalled.forEach(model => bodySlot.appendChild(_buildCard(model)));
        }

        // ── State subscriptions ──────────────────────────────────────────────
        _unsubs.push(Events.on('state:changed', ({ key }) => {
            if (key === 's_installedModelIds') renderList();
        }));

        // Remote (cloud) connection toggles the Pause button visibility on any
        // active download card — force a rebuild so the buttons update live when the
        // user connects/disconnects mid-download. (MPI-140)
        _unsubs.push(Events.on('remote:connection', ({ connected = false } = {}) => {
            if (!!connected === _isRemote) return;
            _isRemote = !!connected;
            renderList({ force: true });
        }));

        // ── Download event subscriptions ─────────────────────────────────────
        _unsubs.push(Events.on('download:progress', ({ modelId, progress, speed, downloadedBytes, totalBytes, indeterminate, phase }) => {
            const card = _cardInstances.get(modelId);
            if (!card) return;
            card.display.el.setProgress({ progress, speed, downloadedBytes, totalBytes, indeterminate, phase });
        }));

        // download:started rebuilds the whole list so the card shows the toggle row
        // (frozen) + downloading state with fresh pause/cancel handlers.
        _unsubs.push(Events.on('download:started', () => { renderList(); }));

        _unsubs.push(Events.on('download:paused', ({ modelId, progress, speed, downloadedBytes, totalBytes }) => {
            const card = _cardInstances.get(modelId);
            if (card) {
                card.display.el.setProgress({ progress, speed, downloadedBytes, totalBytes });
                card.display.el.setDownloadState('paused');
            }
        }));

        _unsubs.push(Events.on('download:resumed', ({ modelId, progress, speed, downloadedBytes, totalBytes }) => {
            const card = _cardInstances.get(modelId);
            if (card) {
                card.display.el.setProgress({ progress, speed, downloadedBytes, totalBytes });
                card.display.el.setDownloadState('downloading');
            }
        }));

        _unsubs.push(Events.on('download:installing', ({ modelId }) => {
            const card = _cardInstances.get(modelId);
            if (card) card.display.el.setDownloadState('installing');
        }));

        _unsubs.push(Events.on('download:cancelled', ({ modelId }) => {
            const card = _cardInstances.get(modelId);
            if (card) card.display.el.setDownloadState('cancelled');
            awaitReSync();
        }));

        _unsubs.push(Events.on('download:complete', async ({ modelId }) => {
            const card = _cardInstances.get(modelId);
            if (card) card.display.el.setDownloadState('complete');
            awaitReSync();
        }));

        _unsubs.push(Events.on('download:uninstalled', ({ modelId, removed = [], keptUniversal = [], keptShared = [], keptModelFiles = [], keptPipInstalls = [] }) => {
            const modelName = MODELS.find(m => m.id === modelId)?.name || modelId;
            const keptTotal = keptUniversal.length + keptShared.length + keptModelFiles.length + keptPipInstalls.length;
            if (removed.length > 0 && keptTotal === 0) {
                Events.emit('ui:success', { title: 'Uninstalled', message: `${modelName} updated.` });
            } else if (removed.length > 0) {
                Events.emit('ui:info', { title: 'Uninstalled', message: `${modelName} updated (some shared files kept).` });
            } else if (keptModelFiles.length > 0) {
                Events.emit('ui:info', { title: 'Files kept', message: `${modelName} — model files kept on disk; still installed.` });
            } else {
                Events.emit('ui:info', { title: 'Nothing to remove', message: `${modelName} — all files are shared with other models or required by the engine.` });
            }
        }));

        _unsubs.push(Events.on('download:failed', () => { awaitReSync(); }));

        // ── Open hook — MpiSlideOver calls this each time the panel opens ──────
        el.onOpen = () => { awaitReSync(); };

        // ── Initial render ─────────────────────────────────────────────────
        renderList();

        // ── Cleanup ────────────────────────────────────────────────────────
        el.destroy = () => {
            _unsubs.forEach(fn => fn());
            _destroyAllCards();
            _confirmDialog?.el?.destroy?.();
        };
    },
});
