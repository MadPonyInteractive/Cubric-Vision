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
    expandRequiredOps, dependentsOfOp, archVariantOptions, variantDepsOf, dedupeStable,
} from '../../../../data/modelConstants/resolveModelDeps.js';
import { getCommand } from '../../../../data/commandRegistry.js';
import { downloadService } from '../../../../services/downloadService.js';
import { remoteEngineClient } from '../../../../services/remoteEngineClient.js';
import { qs, qsa, ce, on } from '../../../../utils/dom.js';
import { formatBytes } from '../../../../utils/formatBytes.js';
import { MpiPopup } from '../../../Primitives/MpiPopup/MpiPopup.js';
import { tradeTable } from '../../../../data/modelConstants/footprint.js';

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
            <div class="mpi-model-manager__filter" id="filter-slot"></div>
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

        // ── Size-tier UI (MPI-168) ───────────────────────────────────────────
        // Full-word labels + the active filter set (multi-select L/B/H toggles;
        // empty set = show all). The computed VRAM↔RAM hover table highlights the
        // row nearest the ACTIVE GPU's VRAM:
        //   - local  → this box's VRAM, fetched once from /system/stats (_userVramGb)
        //   - remote → the connected Pod's VRAM, carried on the remote:connection
        //     event (_remoteVramGb), same source the status-bar memory monitor uses.
        // While remote is still 'connecting' (phase set), the Pod isn't live yet, so
        // the highlight is suppressed until it resolves.
        const TIER_WORD = { low: 'Low', balanced: 'Balanced', high: 'High' };
        const TIER_ORDER = ['low', 'balanced', 'high'];
        const _filterActive = new Set();      // subset of TIER_ORDER; empty = all
        const _tierFilterBtns = new Map();    // Map<tier, MpiButton inst>
        let _userVramGb = null;               // local box VRAM (GB); from /system/stats
        let _remoteVramGb = null;             // connected Pod VRAM (GB); from remote:connection
        let _remotePhase = null;              // 'connecting' etc. while not yet live; null = live

        // The GPU VRAM the trade table should highlight against, or null to suppress
        // the highlight (no hardware known, or a Pod that's still connecting).
        const _activeVramGb = () => {
            if (_isRemote) return _remotePhase ? null : _remoteVramGb; // live Pod only
            return _userVramGb;
        };
        // Tier badge + hover popup instances per model, torn down on re-render.
        //   Map<modelId, { badgeEl, popup, unsub }>
        const _tierBadges = new Map();

        // Per-modelId card instance tracking so download:progress events can update a
        // single card in-place instead of re-rendering the whole list.
        //   Map<modelId, { wrapper, display }>
        const _cardInstances = new Map();
        //   Map<modelId, { pause, resume, cancel }>
        const _cardHandlers = new Map();
        // Op-toggle MpiButton instances per model, torn down on re-render/destroy.
        //   Map<modelId, Array<{ key, inst }>>  (key 'base' for the base toggle)
        const _opToggles = new Map();
        // MPI-209: arch-toggle MpiButton instances per model (GPU-arch weight
        // picker), torn down with the cards.  Map<modelId, Array<{ token, inst }>>
        const _archToggles = new Map();

        // ── Base-toggle pseudo-key ───────────────────────────────────────────
        const BASE = 'base';

        // ── Refresh button ───────────────────────────────────────────────────
        const refreshBtn = MpiButton.mount(refreshSlot, {
            icon: 'refresh', variant: 'ghost', size: 'md',
            info: 'Refresh model state from disk',
        });
        _unsubs.push(on(refreshBtn.el, 'click', () => { awaitReSync(); }));

        // ── Size-tier filter bar (MPI-168) ───────────────────────────────────
        // 3 multi-select toggles (Low/Balanced/High). No ALL button — all-off
        // shows everything. Toggling rebuilds the list (force — the filter change
        // IS the sig change). The matching-hardware toggle is highlighted via a
        // CSS modifier in renderList(), so build is pure here.
        const filterSlot = qs('.mpi-model-manager__filter', el);
        TIER_ORDER.forEach(tier => {
            // Plain TEXT button (no icon — L/B/H words speak for themselves). Note:
            // MpiButton's built-in toggle fires ONLY in icon mode, so a text button
            // gets no 'toggle' event and no active flip. We own the toggle here via
            // setActive + a click handler (setActive works in both modes). (MPI-168)
            const inst = MpiButton.mount(ce('div'), {
                text: TIER_WORD[tier], variant: 'secondary', size: 'sm',
            });
            inst.el.classList.add('mpi-model-manager__filter-btn');
            inst.on('click', () => {
                const next = !_filterActive.has(tier);
                if (next) _filterActive.add(tier); else _filterActive.delete(tier);
                inst.el.setActive(next);
                renderList({ force: true });
            });
            _tierFilterBtns.set(tier, inst);
            filterSlot.appendChild(inst.el);
        });

        // ── Computed VRAM↔RAM hover table (MPI-168) ──────────────────────────
        // Reuses MpiPopup (portals to body, won't clip in the slide-over). Rows
        // come from footprint.js tradeTable() — the real curve, never hardcoded.
        // The row nearest the ACTIVE GPU (local box OR connected Pod) is flagged via
        // _activeVramGb(); engine + VRAM both follow the active engine so a Pod sees
        // the GGUF curve highlighted against the Pod's VRAM.
        function _tradeTableHtml(model) {
            const activeVram = _activeVramGb();
            // Trade table is a footprint estimate for THIS machine's GPU → live arch.
            const { rows, totalWeights, vramFloor } = tradeTable(model, _engine(), activeVram, { arch: remoteEngineClient.archSync(_engine()) });
            const body = rows.map(r => `
                <tr class="mpi-trade-table__row${r.isUserRow ? ' mpi-trade-table__row--user' : ''}">
                    <td class="mpi-trade-table__cell">${r.vram}GB${r.isFloor ? ' <span class="mpi-trade-table__floor">min</span>' : ''}</td>
                    <td class="mpi-trade-table__cell">${r.ram === 0 ? '—' : `~${r.ram}GB`}</td>
                </tr>`).join('');
            const gpuLabel = _isRemote ? 'Pod GPU' : 'Your GPU';
            const userNote = (activeVram != null)
                ? `<p class="mpi-trade-table__note">${gpuLabel}: ~${Math.round(activeVram)}GB VRAM.</p>` : '';
            return `
                <div class="mpi-trade-table">
                    <div class="mpi-trade-table__title">${model.name} — memory need</div>
                    <table class="mpi-trade-table__grid">
                        <thead><tr><th class="mpi-trade-table__head">VRAM</th><th class="mpi-trade-table__head">+ System RAM</th></tr></thead>
                        <tbody>${body}</tbody>
                    </table>
                    ${userNote}
                    <p class="mpi-trade-table__note mpi-trade-table__note--floor">
                        ${Math.round(totalWeights)}GB of weights · min ${Math.round(vramFloor)}GB VRAM.
                        Estimated model need; excludes OS usage (~10–20GB).
                    </p>
                </div>`;
        }

        // Builds + appends the tier badge to a card wrapper, wires a hover MpiPopup.
        function _buildTierBadge(model, cardWrap) {
            const tier = model.sizeTier || 'balanced';
            const badgeEl = ce('span', {
                className: `mpi-model-manager__tier-badge mpi-model-manager__tier-badge--${tier}`,
                textContent: TIER_WORD[tier] || tier,
            });
            cardWrap.appendChild(badgeEl);

            // Popup mounted lazily on first hover so the table isn't computed for
            // every card up-front; one instance per badge, reused while open.
            let popup = null;
            const open = () => {
                if (!popup) {
                    popup = MpiPopup.mount(ce('div'), {
                        variant: 'glass', position: 'top', triggerEl: badgeEl,
                    });
                    qs('.mpi-popup__content', popup.el).innerHTML = _tradeTableHtml(model);
                }
                popup.el.classList.add('is-active');
            };
            const close = () => { popup?.el.classList.remove('is-active'); };
            const unsubEnter = on(badgeEl, 'mouseenter', open);
            const unsubLeave = on(badgeEl, 'mouseleave', close);
            const unsub = () => {
                unsubEnter(); unsubLeave();
                popup?.el?.destroy?.();
                popup?.el?.remove?.();
            };
            _tierBadges.set(model.id, { badgeEl, unsub });
        }

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
                { arch: remoteEngineClient.archSync(engine) },  // MPI-200: current-arch weight required
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

        // ── Arch toggle draft (MPI-209) ──────────────────────────────────────
        // A separate axis from ops: the user picks which GPU-arch weight(s) to
        // install via a toggle row (like ops). Install/uninstall/size resolve the
        // SELECTED SET of arch tokens, not the live-GPU scalar — so a CPU download-pod
        // (no live GPU) installs the weight the user actually wants, and keeping both
        // GPUs' weights is just both toggles on. LIVE-machine status checks
        // (_installedOpsOf, _computePartial) still read the live arch — those answer
        // "is THIS GPU's weight on disk", unchanged.
        const _hasArch = model => archVariantOptions(model).length > 0;
        const _archTokensOf = model => archVariantOptions(model).map(o => o.token);

        // The user's arch-token draft for a model. Persisted in
        // state.s_modelArchDraftByModel. A saved draft (validated against the
        // still-declared tokens) wins; else the smart default (live GPU → saved
        // RunPod gpuType → []). Non-arch models return [].
        function _archDraftFor(model) {
            if (!_hasArch(model)) return [];
            const tokens = _archTokensOf(model);
            const saved = state.s_modelArchDraftByModel?.[model.id];
            if (Array.isArray(saved)) {
                const valid = saved.filter(t => tokens.includes(t));
                if (valid.length) return valid;
            }
            return remoteEngineClient.defaultArchTokens(tokens, _engine());
        }

        function _setArchDraft(model, archTokens) {
            state.s_modelArchDraftByModel = {
                ...(state.s_modelArchDraftByModel || {}),
                [model.id]: archTokens.filter(t => _archTokensOf(model).includes(t)),
            };
        }

        // Which declared arch weights are on disk for this model (any engine's copy
        // counts as "installed for that arch" — the weight file is engine-agnostic).
        // Drives the arch-aware Update/Uninstall label + which toggles read installed.
        function _installedArchOf(model) {
            if (!_hasArch(model)) return [];
            const depStatus = getModelDepStatus(model.id);
            if (!depStatus) return [];
            const on = id => _depIsInstalled(depStatus.get(id));
            return _archTokensOf(model).filter(token => {
                const deps = variantDepsOf(model, { arch: token });
                return deps.length > 0 && deps.every(on);
            });
        }

        // Are the model's NON-arch common deps all on disk? (MPI-216) An arch weight
        // being present is NOT enough to call an arch-variant model "installed": a
        // user who uninstalled the sibling tier and lost the shared Gemma/VAE/LoRAs
        // must see PARTIALLY INSTALLED, not a green INSTALLED that hides the loss.
        // Common deps = the drafted universe MINUS every arch variant. Gate the
        // "arch weight present" installed-signal on this so the arch clause (which
        // exists only for the CPU-pod null-arch section-sort, MPI-209) can't alone
        // flip a model with missing common deps to installed.
        function _commonDepsOnDisk(model) {
            if (!_hasArch(model)) return true; // non-arch models: arch clause never fires
            const depStatus = getModelDepStatus(model.id);
            if (!depStatus) return false;
            const archIds = new Set();
            for (const t of _archTokensOf(model)) {
                for (const id of variantDepsOf(model, { arch: t })) archIds.add(id);
            }
            const common = _draftDepIds(model).filter(id => !archIds.has(id));
            return common.length > 0 && common.every(id => _depIsInstalled(depStatus.get(id)));
        }

        // Resolve a dep list for a model UNIONed across its selected arch tokens.
        // `resolveFn(archToken)` runs the resolver once per token ({ arch: token });
        // a non-arch model runs it once with a null token (the resolver ignores the
        // absent axis). Deduped so shared VAE/clip/LoRA appear once.
        function _unionArch(model, resolveFn) {
            const tokens = _hasArch(model) ? _archDraftFor(model) : [null];
            const use = tokens.length ? tokens : [null]; // draft empty → union-protection pass
            const ids = [];
            for (const t of use) ids.push(...resolveFn(t));
            return dedupeStable(ids);
        }

        // Deps to fetch for the drafted op set (commonDeps + drafted ops), scoped to
        // the current engine (adds engines.local OR engines.remote extraDeps, never
        // both) and UNIONed across the selected arch tokens (MPI-209).
        function _draftDepIds(model) {
            return _unionArch(model, arch =>
                resolveDeps(model, _draftFor(model), null, _engine(), { arch }));
        }

        // Per-op uninstall dep set: the removed ops' deps MINUS any dep still used
        // by an op that REMAINS installed-or-drafted (incl. commonDeps, which any
        // remaining op keeps alive). Intra-model subtraction — the backend's
        // shared-dep guard only protects across OTHER models, so we must not hand it
        // a dep a sibling op of THIS model still needs. (MPI-122)
        function _opUninstallDepIds(model, removedOps, keptOps) {
            // Engine-scoped + arch-union both sides (MPI-165 / MPI-209): subtract within
            // the CURRENT engine's + selected-arch universe, never the other engine's
            // or an unselected arch's weight.
            const removed = _unionArch(model, arch => resolveDeps(model, removedOps, null, _engine(), { arch }));
            const keep = new Set(_unionArch(model, arch => resolveDeps(model, keptOps, null, _engine(), { arch }))); // includes commonDeps
            return removed.filter(id => !keep.has(id));
        }

        // ── Install / Update / Uninstall actions ─────────────────────────────
        async function _install(model) {
            // Engine-scoped via _draftDepIds: a model with engine-split weights
            // (LTX-2.3 bf16-local / GGUF-remote) installs only the current engine's
            // transformer + nodes, never both (41GB of dead weight otherwise). The
            // resolver adds engines[engine].extraDeps; shared deps always in.
            // (MPI-163 — engine-aware resolution, replaces the old post-filter)
            const dependencies = _draftDepIds(model).map(id => DEPS[id]).filter(Boolean);
            if (!dependencies.length) return;
            await downloadService.start(model.id, dependencies);
            renderList();
        }

        // Whole-model uninstall (no toggle change, or flat model). Engine-scoped:
        // resolve only the CURRENT engine's universe so an engine-split model (LTX
        // bf16-local / GGUF-Pod) deletes the engine that's actually installed, not the
        // other engine's transformer (which lives on the other machine and isn't on
        // this disk anyway). The backend shared-dep guard still protects cross-MODEL
        // files. (MPI-165)
        function _confirmWholeUninstall(model) {
            const deps = _unionArch(model, arch => resolveFullUniverse(model, null, _engine(), { arch }))
                .map(id => DEPS[id]).filter(Boolean);
            _showConfirm(
                `Uninstall ${model.name}?\n• Files shared with other installed models will be kept.`,
                async (deleteFiles) => {
                    await downloadService.uninstall(model.id, deps, deleteFiles);
                },
            );
        }

        // MPI-207: remove the now-unused OTHER-arch weight (opt-in disk reclaim).
        // Deletes only that arch's variant deps — the shared VAE/LoRA/base deps and
        // this GPU's weight (if installed) are untouched, and the backend shared-dep
        // guard still protects files used by other models. Keeping-both stays the
        // default; this is the deliberate, out-of-install-pressure cleanup path.
        // Deps to delete when an installed arch is toggled OFF (MPI-209): that arch's
        // variant deps MINUS anything a KEPT arch or op still needs. Arch transformers
        // are unique per token, so this is normally just that one weight; the subtract
        // guards the general case (a future shared variant dep). Replaces MPI-207's
        // standalone "remove old weight" button — the toggle now owns removal too.
        function _archUninstallDepIds(model, removedArch, keptArch) {
            const removed = [];
            for (const t of removedArch) removed.push(...variantDepsOf(model, { arch: t }));
            // Kept = the kept ops' universe (any selected arch) + kept arch weights.
            const keep = new Set(_unionArch(model, arch => resolveDeps(model, _draftFor(model), null, _engine(), { arch })));
            for (const t of keptArch) for (const id of variantDepsOf(model, { arch: t })) keep.add(id);
            return dedupeStable(removed).filter(id => !keep.has(id));
        }

        // Update: apply the op + arch draft against what's on disk. Adds install;
        // removals (op OR arch) require confirm. The install path (_draftDepIds)
        // already unions the selected arch tokens, so a newly-toggled-on arch installs
        // for free; here we only compute what to DELETE.
        async function _applyUpdate(model) {
            const installedOps = new Set(_installedOpsOf(model));
            const draftOps = new Set(_draftFor(model));
            const addedOps = [...draftOps].filter(op => !installedOps.has(op));
            const removedOps = [...installedOps].filter(op => !draftOps.has(op));

            const installedArch = new Set(_installedArchOf(model));
            const draftArch = new Set(_archDraftFor(model));
            const addedArch = [...draftArch].filter(t => !installedArch.has(t));
            const removedArch = [...installedArch].filter(t => !draftArch.has(t));

            const doInstall = async () => {
                if (!addedOps.length && !addedArch.length) return;
                // Install resolves the FULL draft (ops ∪ selected arch); the downloader
                // dedupes already-present deps and the resumable layer skips complete files.
                await _install(model);
            };

            if (removedOps.length === 0 && removedArch.length === 0) {
                await doInstall();
                return;
            }

            // Removal present → confirm. On OK: uninstall removed ops' + removed archs'
            // unique deps, then install any added ops/archs.
            const keptOps = [...draftOps];
            const keptArch = [...draftArch];
            const removeDeps = dedupeStable([
                ..._opUninstallDepIds(model, removedOps, keptOps),
                ..._archUninstallDepIds(model, removedArch, keptArch),
            ]).map(id => DEPS[id]).filter(Boolean);

            const removedOpLabels = removedOps.map(op => (getCommand(op) || {}).label || op);
            const removedArchLabels = removedArch.map(t =>
                (archVariantOptions(model).find(o => o.token === t)?.label) || t);
            const removedLabels = [...removedOpLabels, ...removedArchLabels].join(', ');
            const addedOpLabels = addedOps.map(op => (getCommand(op) || {}).label || op);
            const addedArchLabels = addedArch.map(t =>
                (archVariantOptions(model).find(o => o.token === t)?.label) || t);
            const addedLabels = [...addedOpLabels, ...addedArchLabels].join(', ');

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
            // MPI-179: sync the engine mirror BEFORE resolving dep universes.
            // On a No-GPU download Pod nothing runs the ComfyUIController
            // connect that normally refreshes it, so isRemote() read a stale
            // false and every engine-scoped resolve here (check payload,
            // footprint, partial bar, install set) used the LOCAL universe.
            await remoteEngineClient.refresh();
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

        // ── Arch toggle row (MPI-209) ────────────────────────────────────────
        // One toggle per declared GPU-arch weight (Blackwell / Ada+older). Labels
        // come from the card (archVariantOptions), so this stays generic for future
        // models/tiers. Toggling mutates the arch draft + re-renders so size/button
        // reflect the new selection. Keeping both weights = both toggles on. Turning
        // an installed arch OFF then hitting Update uninstalls just that weight — the
        // toggle owns both install AND the MPI-207 "remove old weight" affordance.
        function _buildArchRow(model, { frozen }) {
            const opts = archVariantOptions(model);
            if (opts.length === 0) return null;

            const draft = new Set(_archDraftFor(model));
            const row = ce('div', { className: 'mpi-model-manager__ops-row' });
            const toggles = [];

            opts.forEach(({ token, label, size }) => {
                const inst = MpiButton.mount(ce('div'), {
                    label: size ? `${label} · ${size}` : label,
                    icon: 'gpu',
                    variant: 'secondary', size: 'sm',
                    toggleable: true, active: draft.has(token), disabled: frozen,
                });
                inst.on('toggle', ({ active }) => {
                    if (active) draft.add(token); else draft.delete(token);
                    _setArchDraft(model, [...draft]);
                    renderList({ force: true });
                });
                toggles.push({ token, inst });
                row.appendChild(inst.el);
            });

            _archToggles.set(model.id, toggles);
            return row;
        }

        // ── Card builder (unified install/uninstall path) ────────────────────
        function _buildCard(model) {
            const cardWrap = ce('div', { className: 'mpi-model-manager__card' });

            const job = state.downloadJobs.find(j => j.modelId === model.id);
            const downloadState = job ? job.status : 'idle';
            // 'queued' (MPI-184 serial install queue) counts as active: the card shows
            // the QUEUED badge + Cancel and freezes op toggles, same as a live download.
            const isActiveDownload = ['downloading', 'paused', 'installing', 'queued'].includes(downloadState);

            // Sizes: drafted footprint (what install fetches) for op-keyed models,
            // else the engine-scoped universe — a Pod must show the GGUF footprint,
            // not bf16+GGUF (the 85.8GB-vs-real bug). (MPI-163)
            const sizeDepIds = selectableOps(model).length
                ? _draftDepIds(model)
                : _unionArch(model, arch => resolveFullUniverse(model, null, _engine(), { arch }));
            const sizeBytes = _sizeOf(sizeDepIds);
            const sizeText = sizeBytes > 0 ? `Disk: ${formatBytes(sizeBytes)}` : '';
            // Disk size moved from the header meta (which now collides with the tier
            // badge top-right) into the info row. The old per-dep VRAM number is
            // dropped — the tier badge + computed hover table own memory info now. (MPI-168)

            // Install state machine.
            const installedOps = _installedOpsOf(model);
            const hasOps = selectableOps(model).length > 0;
            const draft = _draftFor(model);
            const opDraftDiffers = hasOps && (
                installedOps.length !== draft.length
                || installedOps.some(op => !draft.includes(op))
            );
            // MPI-209: an arch model is also "changed" when the arch draft ≠ the arch
            // weights on disk (toggled a new arch on → Update installs it; toggled an
            // installed arch off → Update uninstalls just that weight). Only counts
            // once ≥1 arch is on disk — a fresh (nothing installed) model just Installs.
            const installedArch = _installedArchOf(model);
            const archDraft = _archDraftFor(model);
            const archDraftDiffers = _hasArch(model) && installedArch.length > 0 && (
                installedArch.length !== archDraft.length
                || installedArch.some(t => !archDraft.includes(t))
            );
            const draftDiffersFromInstalled = opDraftDiffers || archDraftDiffers;
            // MPI-216: an arch weight on disk only counts as "installed" when the
            // model's common deps (Gemma/VAE/LoRAs) are ALSO present — otherwise a tier
            // whose shared deps were deleted (by uninstalling the sibling tier) would
            // still read INSTALLED and hide the loss. installedOps already encodes this
            // on a known-arch machine; the arch clause needs the explicit common gate
            // for the CPU-pod null-arch path (MPI-209) where installedOps reads empty.
            const anyInstalled = model.installed === true || installedOps.length > 0
                || (installedArch.length > 0 && _commonDepsOnDisk(model));

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
            // MPI-209: the arch toggle row (below) now owns arch selection, so there's
            // no "Install for your GPU" special label — the user's toggle choice IS the
            // arch to install, and the generate-time guard is the net if the live GPU's
            // weight is missing at gen time. (Supersedes MPI-207's install-label branch.)
            const showInstalled = anyInstalled;
            const uninstallLabel = draftDiffersFromInstalled ? 'Update' : 'Uninstall';
            const installLabel = 'Install';

            const card = MpiInstalledDisplay.mount(cardWrap, {
                title: model.name,
                meta: '', // disk size moved to the info row (header meta would collide with the tier badge)
                text: model.description || '',
                image: model.image || '',
                video: model.video || '',
                mediaRatio: model.mediaRatio || '',
                icon: showInstalled ? 'info' : 'warning',
                iconText: sizeText,
                installed: showInstalled,
                canUninstall: showInstalled,
                uninstallLabel,
                deleteLabel: installLabel,
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

            // Size-tier badge (MPI-168) — sibling of the card in the wrapper, NOT
            // an extension of the info-row span. Hover → computed trade table.
            _buildTierBadge(model, cardWrap);

            // Toggle rows live INSIDE the card, between the badge and the action
            // button (card.el.opsSlot is a static slot the card never rebuilds).
            // Op-keyed models get the op row; arch-variant models get the arch row
            // (MPI-209). A model may have both. Frozen during an active download.
            const toggleRow = _buildToggleRow(model, { frozen: isActiveDownload });
            if (toggleRow && card.el.opsSlot) {
                card.el.opsSlot.appendChild(toggleRow);
                card.el.opsSlot.style.display = '';
            }
            const archRow = _buildArchRow(model, { frozen: isActiveDownload });
            if (archRow && card.el.opsSlot) {
                card.el.opsSlot.appendChild(archRow);
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
            for (const toggles of _archToggles.values()) {
                toggles.forEach(({ inst }) => inst?.el?.destroy?.());
            }
            _archToggles.clear();
            for (const { unsub } of _tierBadges.values()) unsub?.();
            _tierBadges.clear();
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
                // MPI-209: arch draft + installed-arch in the sig so an arch toggle
                // (or an arch weight landing on disk) forces a rebuild → Disk size,
                // Update/Uninstall label, and toggle-active states all repaint.
                const archDraft = _hasArch(model) ? [..._archDraftFor(model)].sort().join(',') : '';
                const archInst = _hasArch(model) ? [..._installedArchOf(model)].sort().join(',') : '';
                return `${model.id}|${isInst ? 1 : 0}|${[...installedOps].sort().join(',')}|${[...draft].sort().join(',')}|${archDraft}|${archInst}|${jobSig}|${partSig}`;
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

            // Size-tier filter (MPI-168): keep models whose sizeTier is in the
            // active set. Empty set → show all. Untagged models default 'balanced'.
            const tierOf = m => m.sizeTier || 'balanced';
            const passesFilter = m => _filterActive.size === 0 || _filterActive.has(tierOf(m));
            const visible = MODELS.filter(passesFilter);

            // A model is "installed" for sectioning when its installed flag is set OR
            // at least one op is installed (op-keyed partial installs) OR an arch
            // weight AND the common deps are on disk. The arch clause matches the card's
            // `anyInstalled` (MPI-209): on a CPU pod (no live GPU → null arch)
            // _installedOpsOf unions both variant weights and reads empty, so an
            // arch-variant model that IS installed for one GPU would wrongly sink to the
            // uninstalled section. MPI-216: the common-deps gate keeps a tier whose
            // shared deps were deleted (sibling-tier uninstall) out of the installed
            // section — arch-weight-alone is not "installed".
            const isInstalled = m => m.installed === true
                || _installedOpsOf(m).length > 0
                || (_installedArchOf(m).length > 0 && _commonDepsOnDisk(m));
            const installed = visible.filter(isInstalled);
            const uninstalled = visible.filter(m => !isInstalled(m));

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

        // Remote (cloud) connection drives two things here: the Pause-button
        // visibility on active download cards (MPI-140) and the trade-table GPU
        // highlight (MPI-168). The event carries the Pod's VRAM/RAM (GB) + phase —
        // the same payload the status-bar memory monitor consumes. Re-render when ANY
        // of connected / phase / vramGb moves (not just connected), so the highlight
        // switches local↔Pod the moment a Pod goes live or drops.
        _unsubs.push(Events.on('remote:connection', ({ connected = false, phase = null, vramGb = null } = {}) => {
            const nextRemote = !!connected;
            const nextPhase = phase || null;
            const nextVram = Number.isFinite(Number(vramGb)) && Number(vramGb) > 0 ? Number(vramGb) : null;
            if (nextRemote === _isRemote && nextPhase === _remotePhase && nextVram === _remoteVramGb) return;
            _isRemote = nextRemote;
            _remotePhase = nextPhase;
            _remoteVramGb = nextVram;
            renderList({ force: true });
            // MPI-179: the remoteEngineClient mirror refreshes async on this same
            // event; the render above may still have read the old engine. Re-sync
            // the dep-status universe + repaint once the mirror has settled.
            awaitReSync();
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

        // ── Hardware read (MPI-168) ──────────────────────────────────────────
        // One-shot /system/stats → cache VRAM/RAM (GB) for the trade-table user-row
        // highlight. No state lift (one consumer). Re-render once it lands so any
        // open card shows the highlight. vram.total/ram.total are BYTES.
        let _hwFetched = false;
        async function _fetchHardwareOnce() {
            if (_hwFetched) return;
            _hwFetched = true;
            try {
                const r = await fetch('/system/stats');
                const data = await r.json();
                const GB = 1024 ** 3;
                if (data?.vram?.total > 0) _userVramGb = data.vram.total / GB;
                renderList({ force: true }); // refresh table user-row highlight
            } catch { /* highlight just stays off — table still computes */ }
        }

        // ── Open hook — MpiSlideOver calls this each time the panel opens ──────
        el.onOpen = () => { awaitReSync(); _fetchHardwareOnce(); };

        // ── Initial render ─────────────────────────────────────────────────
        renderList();

        // ── Cleanup ────────────────────────────────────────────────────────
        el.destroy = () => {
            _unsubs.forEach(fn => fn());
            _destroyAllCards();
            for (const inst of _tierFilterBtns.values()) inst?.el?.destroy?.();
            _tierFilterBtns.clear();
            _confirmDialog?.el?.destroy?.();
        };
    },
});
