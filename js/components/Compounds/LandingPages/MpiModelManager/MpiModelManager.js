import { ComponentFactory } from '../../../factory.js';
import { MpiOverlay } from '../../../Primitives/MpiOverlay/MpiOverlay.js';
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
import { mountPodDiskBar } from '../../../../services/podDiskBar.js';
import { qs, qsa, ce, on } from '../../../../utils/dom.js';
import { renderIcon } from '/js/utils/icons.js';
import { formatBytes } from '../../../../utils/formatBytes.js';
import { tradeTable } from '../../../../data/modelConstants/footprint.js';

/**
 * MpiModelManager — the Model Library (MPI-215).
 *
 * Self-hosts a full-page MpiOverlay (body mode) styled as a dark contact-sheet:
 * a grid of LEAN tiles (preview thumb + name + inline install state), split into
 * Installed / Available sections, each with an Image sub-grid (4:5) then a Video
 * sub-grid (16:9) so rows align. Media (Image/Video) + Size (L/B/H) + live search
 * filters compose. Clicking a tile opens a right-drawer DETAIL panel (an absolute
 * child of the overlay, so it stacks above it) carrying the full per-model
 * controls: description, Operations toggles, GPU-weight arch toggles, VRAM→RAM
 * trade table, disk footprint, and Install / Update / Uninstall.
 *
 * This component still owns ALL model-list logic — refresh, install,
 * pause/resume/cancel, uninstall, op toggles (MPI-122), arch toggles
 * (MPI-200/209), engine-split correctness (MPI-163), size-tier trade table
 * (MPI-168), partial-progress, and download:* subscriptions. MPI-215 rewrote only
 * the RENDER layer (lean tiles + detail drawer replacing the old
 * MpiInstalledDisplay cards); the logic below is preserved.
 *
 * Lifecycle: el.open() shows the overlay + re-syncs installed state; the overlay
 * X / Escape / ui:close-all-popups hides it. el.destroy() tears everything down.
 */
export const MpiModelManager = ComponentFactory.create({
    name: 'MpiModelManager',
    css: ['js/components/Compounds/LandingPages/MpiModelManager/MpiModelManager.css'],

    template: () => `
        <div class="mpi-model-library">
            <div class="mpi-model-library__head">
                <h1 class="mpi-model-library__title">Model Library</h1>
                <p class="mpi-model-library__sub" id="lib-sub"></p>
                <div class="mpi-model-library__disk" id="lib-disk-slot"></div>
                <div class="mpi-model-library__filters">
                    <div class="mpi-model-library__filter-group">
                        <span class="mpi-model-library__filter-label">Media</span>
                        <div id="media-filter-slot" style="display:flex;gap:var(--s-3);"></div>
                    </div>
                    <span class="mpi-model-library__filter-sep"></span>
                    <div class="mpi-model-library__filter-group">
                        <span class="mpi-model-library__filter-label">Size</span>
                        <div id="size-filter-slot" style="display:flex;gap:var(--s-3);"></div>
                    </div>
                    <label class="mpi-model-library__search">
                        ${renderIcon('search', 'sm')}
                        <input type="text" id="lib-search" placeholder="Search models…" autocomplete="off">
                    </label>
                    <div class="mpi-model-library__refresh" id="refresh-btn-slot"></div>
                </div>
            </div>
            <div class="mpi-model-library__body" id="body-slot"></div>

            <div class="mpi-model-library__scrim" id="detail-scrim"></div>
            <aside class="mpi-detail" id="detail-panel">
                <div class="mpi-detail__head">
                    <h2 class="mpi-detail__head-title">Model</h2>
                    <button class="mpi-detail__close" id="detail-close" type="button" aria-label="Close">${renderIcon('close', 'md')}</button>
                </div>
                <div class="mpi-detail__body" id="detail-body"></div>
                <div class="mpi-detail__actions" id="detail-actions"></div>
            </aside>
        </div>`,

    setup: (el) => {
        const bodySlot = qs('#body-slot', el);
        const refreshSlot = qs('#refresh-btn-slot', el);
        const subEl = qs('#lib-sub', el);
        const searchInput = qs('#lib-search', el);

        const _unsubs = [];

        // MPI-237: connected-Pod disk-usage bar, under the "N installed" sub-line and
        // over the filters — so the user can manage disk while browsing/installing.
        // The shared helper polls /remote/pod/disk and hides itself until a Pod
        // reports usage (volume OR ephemeral). Torn down in el.destroy().
        const _podDiskBar = mountPodDiskBar(qs('#lib-disk-slot', el));

        // ── Self-hosted overlay (body mode covers status bar too) ─────────────
        // MpiModelManager is now the Library surface; it mounts itself inside an
        // MpiOverlay(body). shell.js just mounts this component + calls el.open().
        const overlay = MpiOverlay.mount(document.createElement('div'), {
            closable: true, mountTarget: 'body',
        });
        overlay.el.appendToContainer(el);
        // Overlay X / Escape / ui:close-all-popups → the whole Library goes away.
        // Close the detail drawer too so a reopen starts clean.
        overlay.on('close', () => { _closeDetail(); });

        // ── Media filter (Image / Video) — reads model.mediaType directly ─────
        const _mediaActive = new Set();   // 'image' | 'video'; empty = all

        // ── Live search query (name / dropdownMeta) ───────────────────────────
        let _searchQuery = '';

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
        let _userVramGb = null;               // local box VRAM (GB); from /system/stats
        let _remoteVramGb = null;             // connected Pod VRAM (GB); from remote:connection
        let _remotePhase = null;              // 'connecting' etc. while not yet live; null = live

        // The GPU VRAM the trade table should highlight against, or null to suppress
        // the highlight (no hardware known, or a Pod that's still connecting).
        const _activeVramGb = () => {
            if (_isRemote) return _remotePhase ? null : _remoteVramGb; // live Pod only
            return _userVramGb;
        };
        // Per-modelId TILE tracking so download:progress events can patch a single
        // tile's inline state row in-place instead of re-rendering the whole grid.
        //   Map<modelId, { tile, stateEl }>
        const _tileInstances = new Map();
        // Op-toggle MpiButton instances (in the OPEN detail panel only), torn down
        // when the panel closes/reopens.  Array<{ key, inst }>  (key 'base' = base)
        let _detailOpToggles = [];
        // MPI-209: arch-toggle MpiButton instances (open detail panel only).
        //   Array<{ token, inst }>
        let _detailArchToggles = [];
        // Action MpiButton instances in the open detail panel footer.
        let _detailActionBtns = [];
        // The model whose detail panel is currently open (null = closed).
        let _activeDetail = null;

        // ── Base-toggle pseudo-key ───────────────────────────────────────────
        const BASE = 'base';

        // ── Refresh button ───────────────────────────────────────────────────
        const refreshBtn = MpiButton.mount(refreshSlot, {
            icon: 'refresh', variant: 'ghost', size: 'md',
            info: 'Refresh model state from disk',
        });
        _unsubs.push(on(refreshBtn.el, 'click', () => { awaitReSync(); }));

        // ── Filter tags (Media + Size) ───────────────────────────────────────
        // Lightweight text toggles with aria-selected + a heat dot (matches the
        // mockup). Multi-select per group; empty group = show all. Media reads
        // model.mediaType (MPI-215); Size is the MPI-168 tier filter. A tag click
        // flips membership in its Set and force-rebuilds the grid (the filter change
        // IS the sig change).
        const _mkTag = (label, isActive, onToggle) => {
            const btn = ce('button', {
                className: 'mpi-model-library__tag',
                type: 'button',
                textContent: label,
            });
            btn.setAttribute('aria-selected', isActive ? 'true' : 'false');
            _unsubs.push(on(btn, 'click', () => {
                const next = btn.getAttribute('aria-selected') !== 'true';
                btn.setAttribute('aria-selected', next ? 'true' : 'false');
                onToggle(next);
                renderList({ force: true });
            }));
            return btn;
        };

        const mediaFilterSlot = qs('#media-filter-slot', el);
        [['image', 'Image'], ['video', 'Video']].forEach(([value, label]) => {
            mediaFilterSlot.appendChild(_mkTag(label, false, on => {
                if (on) _mediaActive.add(value); else _mediaActive.delete(value);
            }));
        });

        const sizeFilterSlot = qs('#size-filter-slot', el);
        TIER_ORDER.forEach(tier => {
            sizeFilterSlot.appendChild(_mkTag(TIER_WORD[tier], false, on => {
                if (on) _filterActive.add(tier); else _filterActive.delete(tier);
            }));
        });

        // Live search — filters on name / dropdownMeta, case-insensitive.
        _unsubs.push(on(searchInput, 'input', () => {
            _searchQuery = (searchInput.value || '').trim().toLowerCase();
            renderList({ force: true });
        }));

        // ── Computed VRAM↔RAM trade table (MPI-168) — inline in the detail panel ──
        // Rows come from footprint.js tradeTable() — the real curve, never hardcoded.
        // The row nearest the ACTIVE GPU (local box OR connected Pod) is flagged via
        // _activeVramGb(); engine + VRAM both follow the active engine so a Pod sees
        // its own curve highlighted against the Pod's VRAM. Rendered inline in the
        // detail drawer (there's room now — no hover popup) for every model — small
        // image models just floor at MIN_FLOOR and resolve in a row or two.
        function _tradeTableHtml(model) {
            const activeVram = _activeVramGb();
            const { rows, totalWeights, vramFloor } = tradeTable(model, _engine(), activeVram, { arch: remoteEngineClient.archSync(_engine()) });
            const body = rows.map(r => `
                <tr class="${r.isUserRow ? 'is-user' : ''}">
                    <td>${r.vram}GB${r.isFloor ? ' <span class="mpi-detail__vram-floor">min</span>' : ''}</td>
                    <td>${r.ram === 0 ? '—' : `~${r.ram}GB`}</td>
                </tr>`).join('');
            const gpuLabel = _isRemote ? 'Pod GPU' : 'Your GPU';
            const gpuNote = (activeVram != null) ? `${gpuLabel} ~${Math.round(activeVram)}GB` : '';
            return `
                <div class="mpi-detail__field">
                    <span class="mpi-detail__field-label">Memory need${gpuNote ? ` · ${gpuNote}` : ''}</span>
                    <table class="mpi-detail__vram">
                        <thead><tr><th>VRAM</th><th>+ System RAM</th></tr></thead>
                        <tbody>${body}</tbody>
                    </table>
                    <p class="mpi-detail__vram-note">
                        ${Math.round(totalWeights)}GB of weights · min ${Math.round(vramFloor)}GB VRAM.
                        Estimated model need; excludes OS usage (~10–20GB).
                    </p>
                </div>`;
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
            // start() synchronously emits download:started → the download:started handler
            // patches this tile + flips the open detail footer to Cancel. No renderList()
            // here — a full rebuild was the third start-of-download flash. The model stays
            // in its section until it completes (which re-syncs + sig-guarded renders).
            await downloadService.start(model.id, dependencies);
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

        // ── Derived install/download state for a model (tile + detail share it) ──
        // The exact state machine the old card used, extracted so both the lean tile
        // and the detail panel read one source of truth. Nothing here mutates DOM.
        function _modelState(model) {
            const job = state.downloadJobs.find(j => j.modelId === model.id);
            const downloadState = job ? job.status : 'idle';
            // 'queued' (MPI-184 serial install queue) counts as active.
            const isActiveDownload = ['downloading', 'paused', 'installing', 'queued'].includes(downloadState);
            // A terminal 'complete' job lingers in state.downloadJobs until the async
            // reSyncInstalledModels() (fired on download:complete) flips model.installed.
            // In that window the footer/tile computed NOT active + NOT installed → the
            // Install button/chip reappeared (worst on a fast ephemeral-pod install where
            // started→complete collapses before re-sync lands). Treat that lingering job
            // as still-busy so the card holds its download UI (Cancel + progress bar)
            // instead of flashing Install — but ONLY until installed flips (anyInstalled
            // is checked first in both branch chains, so Uninstall wins the moment
            // re-sync lands). No new label — same Cancel/progress the download showed.
            // (MPI-241)
            const isBusy = isActiveDownload || (!!job && downloadState === 'complete');

            // Sizes: drafted footprint (op-keyed) else the engine-scoped universe — a
            // Pod must show the current-engine footprint, not bf16+GGUF (MPI-163).
            const sizeDepIds = selectableOps(model).length
                ? _draftDepIds(model)
                : _unionArch(model, arch => resolveFullUniverse(model, null, _engine(), { arch }));
            const sizeBytes = _sizeOf(sizeDepIds);

            const installedOps = _installedOpsOf(model);
            const hasOps = selectableOps(model).length > 0;
            const draft = _draftFor(model);
            const opDraftDiffers = hasOps && (
                installedOps.length !== draft.length
                || installedOps.some(op => !draft.includes(op))
            );
            // MPI-209: arch draft ≠ arch-on-disk also counts as "changed" (Update
            // installs/uninstalls the toggled weight). Only once ≥1 arch is on disk.
            const installedArch = _installedArchOf(model);
            const archDraft = _archDraftFor(model);
            const archDraftDiffers = _hasArch(model) && installedArch.length > 0 && (
                installedArch.length !== archDraft.length
                || installedArch.some(t => !archDraft.includes(t))
            );
            const draftDiffersFromInstalled = opDraftDiffers || archDraftDiffers;
            // MPI-216: arch-weight-on-disk only counts as installed when common deps
            // are ALSO present (see _buildCard history).
            const anyInstalled = model.installed === true || installedOps.length > 0
                || (installedArch.length > 0 && _commonDepsOnDisk(model));

            // Partial progress (idle only).
            let partial = { hasPartialProgress: false };
            if (downloadState === 'idle') partial = _computePartial(model);

            return {
                job, downloadState, isActiveDownload, isBusy, sizeBytes,
                installedOps, installedArch, draftDiffersFromInstalled, anyInstalled, partial,
            };
        }

        // ── Lean tile ─────────────────────────────────────────────────────────
        // Preview thumb (image still / hover-play video) + name + category·tier +
        // media badge + a FIXED-HEIGHT inline state row (chip OR live progress bar).
        // A recently-installed heat dot rides absolute on the thumb. Click → detail.
        function _tileState(st) {
            // anyInstalled first (MPI-241): once re-sync flips installed, show the chip
            // even if a terminal 'complete' job still lingers in state.downloadJobs.
            if (st.anyInstalled) return `<span class="mpi-tile__chip mpi-tile__chip--installed">Installed</span>`;
            // isBusy holds the progress UI through the whole download AND the brief
            // post-'complete' window before re-sync lands, so the Install chip never
            // flashes back on a fast ephemeral-pod install (MPI-241).
            if (st.isBusy || (st.job && st.downloadState === 'downloading')) {
                // Indeterminate "Verifying…" sweep once all bytes are down and the
                // manager flips phase (MPI-140/164). Otherwise a determinate bar,
                // clamped to 100 — job.progress can momentarily exceed 1.0 on a mixed
                // install (most deps on-disk + one real download over-counting).
                if (st.job?.phase === 'verifying') {
                    return `<div class="mpi-tile__prog mpi-tile__prog--indeterminate"><div class="mpi-tile__prog-bar"><span></span></div><span class="mpi-tile__prog-pct">Verifying…</span></div>`;
                }
                const pct = Math.min(Math.round((st.job?.progress || 0) * 100), 100);
                return `<div class="mpi-tile__prog"><div class="mpi-tile__prog-bar"><span style="width:${pct}%"></span></div><span class="mpi-tile__prog-pct">${pct}%</span></div>`;
            }
            if (st.partial.hasPartialProgress) {
                const pct = Math.min(Math.round((st.partial.progress || 0) * 100), 100);
                return `<div class="mpi-tile__prog"><div class="mpi-tile__prog-bar"><span style="width:${pct}%"></span></div><span class="mpi-tile__prog-pct">${pct}%</span></div>`;
            }
            return `<span class="mpi-tile__chip mpi-tile__chip--available">Install</span>`;
        }

        function _mediaBadgeHtml(model) {
            return model.mediaType === 'video'
                ? `<span class="mpi-tile__badge mpi-tile__badge--video">${renderIcon('video', 'sm')}Video</span>`
                : `<span class="mpi-tile__badge">${renderIcon('image', 'sm')}Image</span>`;
        }

        function _buildTile(model) {
            const st = _modelState(model);
            const isVideo = model.mediaType === 'video';
            const tile = ce('button', {
                className: `mpi-tile mpi-tile--${isVideo ? 'video' : 'image'}`,
                type: 'button',
            });

            // Thumb — image still or hover-play muted video; placeholder gradient
            // when no preview asset is declared.
            const thumb = ce('div', { className: 'mpi-tile__thumb' });
            if (isVideo && model.video) {
                const vid = ce('video', {
                    src: `comfy_workflows/display/${model.video}`,
                    className: 'mpi-tile__thumb-media',
                });
                vid.muted = true; vid.loop = true; vid.playsInline = true; vid.preload = 'metadata';
                _unsubs.push(on(vid, 'error', () => { thumb.classList.add('mpi-tile__thumb--placeholder'); vid.remove(); }));
                _unsubs.push(on(tile, 'mouseenter', () => { vid.play().catch(() => {}); }));
                _unsubs.push(on(tile, 'mouseleave', () => { vid.pause(); try { vid.currentTime = 0; } catch (_) { /* noop */ } }));
                thumb.appendChild(vid);
            } else if (!isVideo && model.image) {
                const img = ce('img', {
                    src: `comfy_workflows/display/${model.image}`,
                    className: 'mpi-tile__thumb-media',
                    loading: 'lazy',
                });
                _unsubs.push(on(img, 'error', () => { thumb.classList.add('mpi-tile__thumb--placeholder'); img.remove(); }));
                thumb.appendChild(img);
            } else {
                thumb.classList.add('mpi-tile__thumb--placeholder');
            }
            // Recently-installed heat dot (MPI-215) — the model's `justInstalled`
            // transient flag rides absolute on the thumb so it never shifts the tile.
            if (model.justInstalled) thumb.appendChild(ce('div', { className: 'mpi-tile__new' }));
            // Featured star badge (rides absolute on the thumb, like the heat dot).
            if (model.featured) {
                const star = ce('div', { className: 'mpi-tile__featured', title: 'Featured' });
                star.innerHTML = renderIcon('sparkle', 'sm');
                thumb.appendChild(star);
            }
            tile.appendChild(thumb);

            const tier = model.sizeTier || 'balanced';
            const stateEl = ce('div', { className: 'mpi-tile__state' });
            stateEl.innerHTML = _tileState(st);
            const body = ce('div', { className: 'mpi-tile__body' });
            const top = ce('div', { className: 'mpi-tile__top' });
            const nameCol = ce('div');
            nameCol.appendChild(ce('div', { className: 'mpi-tile__name', textContent: model.name }));
            nameCol.appendChild(ce('div', {
                className: 'mpi-tile__meta',
                textContent: `${model.dropdownMeta || ''}${model.dropdownMeta ? ' · ' : ''}${TIER_WORD[tier] || tier}`,
            }));
            top.appendChild(nameCol);
            const badge = ce('div');
            badge.innerHTML = _mediaBadgeHtml(model);
            top.appendChild(badge.firstElementChild);
            body.appendChild(top);
            body.appendChild(stateEl);
            tile.appendChild(body);

            _unsubs.push(on(tile, 'click', () => openDetail(model)));
            _tileInstances.set(model.id, { tile, stateEl });
            return tile;
        }

        // ── Detail-panel toggle rows (ops + arch) ─────────────────────────────
        // Same logic as the old in-card rows; they build into the passed host and
        // register their instances in the detail toggle arrays so the panel can tear
        // them down on close. Toggling mutates the draft + re-renders (which repaints
        // the tile state) then re-renders the OPEN panel so size/actions stay live.
        function _buildToggleRow(model, host, { frozen }) {
            const ops = selectableOps(model);
            if (ops.length === 0) return;

            const draft = new Set(_draftFor(model));
            const showBase = _hasBaseToggle(model);
            const commit = () => { _setDraft(model, [...draft]); _refreshAfterDraft(model); };

            if (showBase) {
                const baseInst = MpiButton.mount(ce('div'), {
                    label: 'Base model', icon: 'layers', variant: 'secondary', size: 'sm',
                    toggleable: true, active: draft.size > 0, disabled: frozen,
                });
                baseInst.on('toggle', ({ active }) => {
                    if (!active) draft.clear(); // base off → cascade every op off
                    commit();
                });
                _detailOpToggles.push({ key: BASE, inst: baseInst });
                host.appendChild(baseInst.el);
            }

            ops.forEach(op => {
                const cmd = getCommand(op) || {};
                const inst = MpiButton.mount(ce('div'), {
                    label: cmd.label || op,
                    icon: cmd.icon || undefined,
                    variant: 'secondary', size: 'sm',
                    toggleable: true, active: draft.has(op), disabled: frozen,
                });
                inst.on('toggle', ({ active }) => {
                    if (active) {
                        draft.add(op);
                        for (const req of expandRequiredOps(model, [op])) draft.add(req);
                    } else {
                        draft.delete(op);
                        for (const dep of dependentsOfOp(model, op)) draft.delete(dep);
                    }
                    commit();
                });
                _detailOpToggles.push({ key: op, inst });
                host.appendChild(inst.el);
            });
        }

        // MPI-209: one toggle per declared GPU-arch weight; labels from the card.
        function _buildArchRow(model, host, { frozen }) {
            const opts = archVariantOptions(model);
            if (opts.length === 0) return;

            const draft = new Set(_archDraftFor(model));
            opts.forEach(({ token, label, size }) => {
                const inst = MpiButton.mount(ce('div'), {
                    label: size ? `${label} · ${size}` : label,
                    icon: 'gpu', variant: 'secondary', size: 'sm',
                    toggleable: true, active: draft.has(token), disabled: frozen,
                });
                inst.on('toggle', ({ active }) => {
                    if (active) draft.add(token); else draft.delete(token);
                    _setArchDraft(model, [...draft]);
                    _refreshAfterDraft(model);
                });
                _detailArchToggles.push({ token, inst });
                host.appendChild(inst.el);
            });
        }

        // A draft toggle changed: repaint the grid (tile state / sectioning) AND
        // rebuild the open detail panel so Disk size + Install/Update label follow.
        function _refreshAfterDraft(model) {
            renderList({ force: true });
            if (_activeDetail && _activeDetail.id === model.id) openDetail(model);
        }

        // ── Detail drawer ─────────────────────────────────────────────────────
        const scrim = qs('#detail-scrim', el);
        const detailPanel = qs('#detail-panel', el);
        const detailBody = qs('#detail-body', el);
        const detailActions = qs('#detail-actions', el);

        function _destroyDetailToggles() {
            _detailOpToggles.forEach(({ inst }) => inst?.el?.destroy?.());
            _detailOpToggles = [];
            _detailArchToggles.forEach(({ inst }) => inst?.el?.destroy?.());
            _detailArchToggles = [];
            _detailActionBtns.forEach(inst => inst?.el?.destroy?.());
            _detailActionBtns = [];
        }

        function openDetail(model) {
            _destroyDetailToggles();
            _activeDetail = model;
            const st = _modelState(model);
            const isVideo = model.mediaType === 'video';
            const tier = model.sizeTier || 'balanced';

            // Static markup (thumb, title, description) via innerHTML; toggle rows +
            // VRAM table + action buttons are mounted as real components below.
            detailBody.innerHTML = `
                <div class="mpi-detail__thumb mpi-detail__thumb--${isVideo ? 'video' : 'image'} mpi-detail__thumb--placeholder" id="detail-thumb"></div>
                <div class="mpi-detail__titlerow">
                    <div>
                        <div class="mpi-detail__name">${model.name}</div>
                        <div class="mpi-detail__cat">${model.dropdownMeta || ''}${model.dropdownMeta ? ' · ' : ''}${TIER_WORD[tier] || tier} tier</div>
                    </div>
                    <span class="mpi-detail__pill mpi-detail__pill--${isVideo ? 'video' : 'image'}">${isVideo ? 'Video' : 'Image'}</span>
                </div>
                ${model.description ? `<p class="mpi-detail__desc">${model.description}</p>` : ''}
                <div class="mpi-detail__field" id="detail-ops" style="display:none;">
                    <span class="mpi-detail__field-label">Operations</span>
                    <div class="mpi-detail__toggle-row" id="detail-ops-row"></div>
                </div>
                <div class="mpi-detail__field" id="detail-arch" style="display:none;">
                    <span class="mpi-detail__field-label">GPU weight</span>
                    <div class="mpi-detail__toggle-row" id="detail-arch-row"></div>
                </div>
                <div id="detail-vram"></div>
                <div class="mpi-detail__field">
                    <div class="mpi-detail__disk-row">
                        <span class="mpi-detail__field-label" style="margin:0">Disk</span>
                        <span class="mpi-detail__disk-val">${st.sizeBytes > 0 ? formatBytes(st.sizeBytes) : '—'}</span>
                    </div>
                </div>`;

            // Real preview in the drawer thumb. Unlike the lean tiles (uniform
            // cover-crop, hover-play), the drawer is the "judge this model" view:
            // the video AUTOPLAYS (muted/loop) so the user sees real motion + quality
            // without hovering, and both image + video size to their TRUE aspect (no
            // crop) — the box adopts the asset's real dimensions once it loads.
            const thumb = qs('#detail-thumb', detailBody);
            if (isVideo && model.video) {
                const vid = ce('video', { src: `comfy_workflows/display/${model.video}`, className: 'mpi-detail__thumb-media' });
                vid.muted = true; vid.loop = true; vid.playsInline = true; vid.autoplay = true; vid.preload = 'auto';
                _unsubs.push(on(vid, 'error', () => { vid.remove(); thumb.classList.add('mpi-detail__thumb--placeholder'); }));
                _unsubs.push(on(vid, 'loadedmetadata', () => {
                    if (vid.videoWidth && vid.videoHeight) thumb.style.aspectRatio = `${vid.videoWidth} / ${vid.videoHeight}`;
                    vid.play().catch(() => {});
                }));
                // Click → native fullscreen playback so the user can judge quality at
                // full size. Native API (one line) over a bespoke lightbox; Escape
                // exits. In fullscreen show native controls + unmute; restore on exit.
                thumb.classList.add('mpi-detail__thumb--play');
                _unsubs.push(on(thumb, 'click', () => {
                    if (vid.requestFullscreen) {
                        vid.controls = true; vid.muted = false;
                        vid.requestFullscreen()
                            .then(() => vid.play().catch(() => {}))   // always playing in fullscreen; the click's native toggle can leave it paused
                            .catch(() => { vid.controls = false; vid.muted = true; });
                    }
                }));
                // fullscreenchange is a document-level event; restore muted/no-controls
                // on exit. Registered per-open; _destroyDetailToggles + close won't leak
                // it (collected in _unsubs, torn down on el.destroy).
                _unsubs.push(on(document, 'fullscreenchange', () => {
                    if (!document.fullscreenElement) { vid.controls = false; vid.muted = true; }
                }));
                thumb.classList.remove('mpi-detail__thumb--placeholder');
                thumb.appendChild(vid);
            } else if (!isVideo && model.image) {
                const img = ce('img', { src: `comfy_workflows/display/${model.image}`, className: 'mpi-detail__thumb-media' });
                _unsubs.push(on(img, 'load', () => {
                    if (img.naturalWidth && img.naturalHeight) thumb.style.aspectRatio = `${img.naturalWidth} / ${img.naturalHeight}`;
                }));
                _unsubs.push(on(img, 'error', () => { img.remove(); thumb.classList.add('mpi-detail__thumb--placeholder'); }));
                thumb.classList.remove('mpi-detail__thumb--placeholder');
                thumb.appendChild(img);
            }

            // Operation toggles (MPI-122).
            if (selectableOps(model).length) {
                qs('#detail-ops', detailBody).style.display = '';
                _buildToggleRow(model, qs('#detail-ops-row', detailBody), { frozen: st.isActiveDownload });
            }
            // GPU-weight arch toggles (MPI-200/209) — arch-variant models only.
            if (_hasArch(model)) {
                qs('#detail-arch', detailBody).style.display = '';
                _buildArchRow(model, qs('#detail-arch-row', detailBody), { frozen: st.isActiveDownload });
            }
            // VRAM→RAM trade table (MPI-168) — all models. Image models (SDXL etc.)
            // are small so the curve floors at MIN_FLOOR (8GB) and resolves in a row
            // or two, but the memory need is still worth showing.
            qs('#detail-vram', detailBody).innerHTML = _tradeTableHtml(model);

            // Footer actions — the exact install/update/uninstall wiring from _buildCard.
            // anyInstalled is checked BEFORE isBusy so a lingering terminal 'complete'
            // job never keeps Cancel up once re-sync flips installed (MPI-241).
            detailActions.innerHTML = '';
            if (st.anyInstalled) {
                const label = st.draftDiffersFromInstalled ? 'Update' : 'Uninstall';
                const primary = MpiButton.mount(ce('div'), { text: label, variant: 'secondary', size: 'md' });
                primary.on('click', () => {
                    if (st.draftDiffersFromInstalled) _applyUpdate(model);
                    else _confirmWholeUninstall(model);
                });
                detailActions.appendChild(primary.el); _detailActionBtns.push(primary);
            } else if (st.isBusy) {
                if (st.downloadState === 'downloading' && !_isRemote) {
                    const pause = MpiButton.mount(ce('div'), { text: 'Pause', variant: 'secondary', size: 'md' });
                    pause.on('click', () => downloadService.pause(model.id));
                    detailActions.appendChild(pause.el); _detailActionBtns.push(pause);
                } else if (st.downloadState === 'paused') {
                    const resume = MpiButton.mount(ce('div'), { text: 'Resume', variant: 'primary', size: 'md' });
                    resume.on('click', () => downloadService.resume(model.id));
                    detailActions.appendChild(resume.el); _detailActionBtns.push(resume);
                }
                const cancel = MpiButton.mount(ce('div'), { text: 'Cancel', variant: 'ghost', size: 'md' });
                cancel.on('click', () => downloadService.cancel(model.id));
                detailActions.appendChild(cancel.el); _detailActionBtns.push(cancel);
            } else {
                const install = MpiButton.mount(ce('div'), { text: 'Install', variant: 'primary', size: 'md' });
                install.on('click', () => { _install(model); });
                detailActions.appendChild(install.el); _detailActionBtns.push(install);
            }

            scrim.classList.add('is-open');
            detailPanel.classList.add('is-open');
        }

        function _closeDetail() {
            scrim.classList.remove('is-open');
            detailPanel.classList.remove('is-open');
            _activeDetail = null;
            _destroyDetailToggles();
        }
        _unsubs.push(on(scrim, 'click', _closeDetail));
        _unsubs.push(on(qs('#detail-close', el), 'click', _closeDetail));
        // Escape closes the drawer first (leaving the overlay open); the overlay's
        // own Escape handling still closes the whole Library when the drawer is shut.
        _unsubs.push(on(detailPanel, 'keydown', () => {})); // no-op host for focus
        _unsubs.push(Events.on('ui:close-all-popups', () => { _closeDetail(); }));

        // ── Teardown of grid tiles ─────────────────────────────────────────────
        function _destroyAllCards() {
            _tileInstances.clear();
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
                // justInstalled drives the heat dot; include so it appears/clears.
                const neu = model.justInstalled ? 'n' : '';
                return `${model.id}|${isInst ? 1 : 0}|${[...installedOps].sort().join(',')}|${[...draft].sort().join(',')}|${archDraft}|${archInst}|${jobSig}|${partSig}|${neu}`;
            }).join('||')
                // MPI-215: filter/search state is part of the visible output — a filter
                // change with no per-model change must still force a rebuild.
                + `##media:${[..._mediaActive].sort().join(',')}##size:${[..._filterActive].sort().join(',')}##q:${_searchQuery}`;
        }

        // ── Section sub-block (one media type, one aspect ratio) ──────────────
        // Renders a media sub-header (icon + count) then a contact-sheet grid of
        // lean tiles — all one aspect ratio so rows align (no ragged holes).
        function _mediaBlock(list, media) {
            // Featured models sort first within each sub-grid (stable — Array.sort in
            // modern V8 is stable, so non-featured keep their declared order).
            const items = list.filter(m => m.mediaType === media)
                .sort((a, b) => (b.featured ? 1 : 0) - (a.featured ? 1 : 0));
            if (!items.length) return;
            const head = ce('div', {
                className: `mpi-model-library__media-head${media === 'video' ? ' mpi-model-library__media-head--video' : ''}`,
            });
            head.innerHTML = `${renderIcon(media, 'sm')}<span>${media === 'video' ? 'Video' : 'Image'}</span><span class="mpi-model-library__media-head-n">${items.length}</span>`;
            bodySlot.appendChild(head);
            const sheet = ce('div', { className: 'mpi-model-library__sheet' });
            items.forEach(model => sheet.appendChild(_buildTile(model)));
            bodySlot.appendChild(sheet);
        }

        // A full section (Installed / Available): header + Image sub-grid + Video
        // sub-grid. The media filter narrows which sub-grids appear.
        function _section(label, list) {
            if (!list.length) return;
            const header = ce('div', { className: 'mpi-model-library__section' });
            header.innerHTML = `<span>${label}</span><span class="mpi-model-library__section-n">${list.length}</span>`;
            bodySlot.appendChild(header);
            if (_mediaActive.size === 0 || _mediaActive.has('image')) _mediaBlock(list, 'image');
            if (_mediaActive.size === 0 || _mediaActive.has('video')) _mediaBlock(list, 'video');
        }

        // ── Render the contact sheet ────────────────────────────────────────
        // force=true bypasses the signature guard — used by the draft-toggle path,
        // where the change IS the sig change but we still want an unconditional rebuild.
        function renderList({ force = false } = {}) {
            const sig = _listSignature();
            if (!force && sig === _lastSig) return; // no visible change → skip the flash
            _lastSig = sig;
            _destroyAllCards();
            bodySlot.innerHTML = '';

            // Filters compose: Size (MPI-168, sizeTier), Media (MPI-215, mediaType),
            // and live search over name / dropdownMeta. Empty group = show all.
            const tierOf = m => m.sizeTier || 'balanced';
            const passesSize = m => _filterActive.size === 0 || _filterActive.has(tierOf(m));
            const passesMedia = m => _mediaActive.size === 0 || _mediaActive.has(m.mediaType);
            const passesSearch = m => _searchQuery === ''
                || (m.name || '').toLowerCase().includes(_searchQuery)
                || (m.dropdownMeta || '').toLowerCase().includes(_searchQuery);
            const visible = MODELS.filter(m => passesSize(m) && passesMedia(m) && passesSearch(m));

            // A model is "installed" for sectioning when its installed flag is set OR
            // at least one op is installed OR an arch weight AND its common deps are on
            // disk (MPI-209/216 — see _modelState for the full rationale).
            const isInstalled = m => m.installed === true
                || _installedOpsOf(m).length > 0
                || (_installedArchOf(m).length > 0 && _commonDepsOnDisk(m));
            const installed = visible.filter(isInstalled);
            const available = visible.filter(m => !isInstalled(m));

            // Live count line in the head.
            const totalInstalled = MODELS.filter(isInstalled).length;
            subEl.innerHTML = `<span class="mpi-model-library__count">${totalInstalled} installed</span> · ${MODELS.length - totalInstalled} available — install a pack and its files fetch automatically.`;

            if (!visible.length) {
                bodySlot.appendChild(ce('div', {
                    className: 'mpi-model-library__empty',
                    textContent: 'No models match — clear filters or search.',
                }));
                return;
            }

            _section('Installed', installed);
            _section('Available', available);

            // Keep an open detail panel coherent after a full rebuild (install state
            // moved, engine switched, re-sync landed). Guard: openDetail must not be
            // reached from a draft-toggle path here (that path owns its own refresh).
            if (_activeDetail) {
                const fresh = MODELS.find(m => m.id === _activeDetail.id);
                if (fresh) openDetail(fresh);
            }
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
        // Patch just the tile's inline state row in-place (no full rebuild) so a
        // live download's progress bar ticks without flashing the whole grid. The
        // state is recomputed from the live download job. If the model's detail
        // panel is open, rebuild it too so its footer/progress stay in sync.
        function _patchTile(modelId, { rebuildDetail = true } = {}) {
            const tileRef = _tileInstances.get(modelId);
            const model = MODELS.find(m => m.id === modelId);
            if (tileRef && model) tileRef.stateEl.innerHTML = _tileState(_modelState(model));
            // Only rebuild the open slide-over on real STATE transitions (pause /
            // resume / install-phase) — those flip the footer buttons. A byte-level
            // progress tick changes nothing visible in the panel, so rebuilding it
            // ~1×/sec just tore down + re-created the thumb <img>/<video> and remount
            // components → the panel flashed and reflowed. (Progress passes false.)
            if (rebuildDetail && _activeDetail && _activeDetail.id === modelId && model) openDetail(model);
        }

        _unsubs.push(Events.on('download:progress', ({ modelId }) => { _patchTile(modelId, { rebuildDetail: false }); }));

        // download:started — patch ONLY the started model's tile (progress bar) + flip
        // its open detail footer to Cancel. The model's tile already exists (the grid
        // rendered when the Library opened) and an install doesn't move it between
        // sections until it completes, so a full renderList() here just tore down and
        // rebuilt every card = the start-of-download flash. (fired twice — client-side
        // in downloadService.start() + the backend SSE echo — so a full rebuild also ran
        // twice.) A section move (available → installed) is handled by the sig-guarded
        // renderList() on download:complete.
        _unsubs.push(Events.on('download:started', ({ modelId }) => { _patchTile(modelId); }));

        _unsubs.push(Events.on('download:paused', ({ modelId }) => { _patchTile(modelId); }));
        _unsubs.push(Events.on('download:resumed', ({ modelId }) => { _patchTile(modelId); }));
        _unsubs.push(Events.on('download:installing', ({ modelId }) => { _patchTile(modelId); }));

        _unsubs.push(Events.on('download:cancelled', () => { awaitReSync(); }));
        _unsubs.push(Events.on('download:complete', async () => { awaitReSync(); }));

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

        // ── Open / close the Library overlay ──────────────────────────────────
        // shell.js mounts this component once and calls el.open() on models:open.
        // Showing the overlay re-syncs installed state + hardware (like the old
        // MpiSlideOver onOpen hook did). el.onOpen kept as an alias for parity.
        el.open = () => {
            overlay.el.show();
            awaitReSync();
            _fetchHardwareOnce();
        };
        el.close = () => { overlay.el.hide(); };
        el.onOpen = el.open;

        // ── Initial render ─────────────────────────────────────────────────
        renderList();

        // ── Cleanup ────────────────────────────────────────────────────────
        el.destroy = () => {
            _unsubs.forEach(fn => fn());
            _podDiskBar?.destroy?.(); // MPI-237
            _destroyAllCards();
            _destroyDetailToggles();
            _confirmDialog?.el?.destroy?.();
            overlay?.el?.destroy?.();
        };
    },
});
