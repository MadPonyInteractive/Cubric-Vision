/**
 * MpiModelSettings — Per-model/tool settings overlay (Compound)
 *
 * Shows LoRA slot pickers + upscale model selector when opened with a modelId.
 * Shows only upscale model selector when opened with a toolKey.
 * All changes auto-save on selection — no Save/Cancel buttons.
 * Escape key closes via the global OverlayManager handler.
 *
 * Usage (model context):
 *   const overlay = MpiModelSettings.mount(document.createElement('div'));
 *   overlay.el.open({ modelId: 'sdxl-realistic' });
 *
 * Usage (tool context):
 *   overlay.el.open({ toolKey: 'videoUpscale' });
 *
 * Props: none required at mount time.
 *
 * Instance methods (on instance.el):
 *   open({ modelId?, toolKey? }) — populate from state and show overlay
 *
 * Emits:
 *   'saved' {} — a change was auto-saved to disk
 *   'close' {} — overlay dismissed
 */

import { ComponentFactory } from '../../factory.js';
import { MpiOverlay } from '../../Primitives/MpiOverlay/MpiOverlay.js';
import { MpiDropdown } from '../../Primitives/MpiDropdown/MpiDropdown.js';
import { MpiTreePicker } from '../../Primitives/MpiTreePicker/MpiTreePicker.js';
import { MpiFolderDrop } from '../../Primitives/MpiFolderDrop/MpiFolderDrop.js';
import { MpiInput } from '../../Primitives/MpiInput/MpiInput.js';
import { renderIcon } from '../../../utils/icons.js';
import { qs, on } from '../../../utils/dom.js';
import { Events } from '../../../events.js';
import { state } from '../../../state.js';
import {
    getModelSettings,
    getToolSettings,
} from '../../../data/projectModel.js';
import { getModelById } from '../../../data/modelRegistry.js';
import { DEPS } from '../../../data/modelConstants/dependencies.js';
import { loadAll as loadAssets } from '../../../services/assetService.js';
import { clientLogger } from '../../../services/clientLogger.js';

const LORA_COUNT = 6;

/**
 * Filter a flat file list (from /comfy/list-files recursive walk) to files
 * belonging to a given model type.
 *
 * Convention: subfolders under `loras/` and `upscale_models/` are named after
 * model.type (e.g. `loras/sdxl/foo.safetensors`, `upscale_models/wan/bar.pth`).
 * Files at the root (no subfolder in path) are universal (e.g. SIAX) and
 * always included.
 */
function _filterByType(files, modelType) {
    if (!modelType || !files?.length) return files || [];
    const prefix = `${modelType}/`;
    // Root-level files are universal (e.g. SIAX). Typed subfolder files are
    // scoped to the matching model.type.
    return files.filter(f => {
        const norm = f.replace(/\\/g, '/');
        return !norm.includes('/') || norm.startsWith(prefix);
    });
}

function _loraOptions(availableLoras) {
    return [
        { label: '— None —', value: '' },
        ...(availableLoras || []).map(f => ({ label: f, value: f })),
    ];
}

/** Convert a dep ID to its filename, for matching against dropdown option values. */
function _depToFilename(depId) {
    const filename = DEPS[depId]?.filename;
    return filename ? filename.split('/').pop() : null;
}

/** Reverse-lookup: filename → dep ID. Returns dep ID or null. */
function _filenameToDep(filename) {
    if (!filename) return null;
    for (const [depId, dep] of Object.entries(DEPS)) {
        if (dep.filename?.split('/').pop() === filename) return depId;
    }
    return null;
}

function _upscaleOptions(upscaleModels) {
    return (upscaleModels || []).map(f => ({ label: f, value: f }));
}

/**
 * Build the strength-inputs row for one LoRA slot. `kinds` is the model's
 * loraStrengths array (e.g. ['model'], ['clip'], or ['model','clip']) — only the
 * listed knobs render. onModel/onClip fire on change. Returns the row element.
 */
function _buildStrengthsRow(slot, kinds, onModel, onClip) {
    const strengthsEl = document.createElement('div');
    strengthsEl.className = 'mpi-model-settings__lora-strengths';

    if (kinds.includes('model')) {
        const modelLabel = document.createElement('label');
        modelLabel.className = 'mpi-model-settings__strength-label';
        modelLabel.textContent = 'Model';
        const modelInput = MpiInput.mount(document.createElement('div'), {
            type: 'number', size: 'sm', value: slot.strengthModel,
            min: -2, max: 2, step: 0.05, decimals: 2,
        });
        modelInput.on('change', ({ value }) => onModel(value));
        strengthsEl.appendChild(modelLabel);
        strengthsEl.appendChild(modelInput.el);
    }

    if (kinds.includes('clip')) {
        const clipLabel = document.createElement('label');
        clipLabel.className = 'mpi-model-settings__strength-label';
        clipLabel.textContent = 'Clip';
        const clipInput = MpiInput.mount(document.createElement('div'), {
            type: 'number', size: 'sm', value: slot.strengthClip,
            min: -2, max: 2, step: 0.05, decimals: 2,
        });
        clipInput.on('change', ({ value }) => onClip(value));
        strengthsEl.appendChild(clipLabel);
        strengthsEl.appendChild(clipInput.el);
    }

    return strengthsEl;
}

/**
 * Build the per-slot bypass toggle button. Pressed = neutralise this LoRA at
 * generation (inject strength 0) without changing its saved name/values — the
 * slot's controls grey out (CSS, via the --bypassed class) but stay readable.
 * `bypassed` sets the initial pressed state; `onToggle(next)` fires with the new
 * boolean. (MPI-223)
 */
function _buildBypassBtn(bypassed, onToggle) {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'mpi-model-settings__lora-bypass';
    btn.title = 'Bypass this LoRA (inject at zero strength)';
    btn.setAttribute('aria-pressed', String(Boolean(bypassed)));
    btn.innerHTML = renderIcon('negative', 'sm');
    on(btn, 'click', () => {
        const next = btn.getAttribute('aria-pressed') !== 'true';
        btn.setAttribute('aria-pressed', String(next));
        onToggle(next);
    });
    return btn;
}

const _baseName = (f) => String(f || '').replace(/\\/g, '/').split('/').pop();
/** Separator-agnostic full-path key (forward slash, lowercased). */
const _pathKey = (f) => String(f || '').replace(/\\/g, '/').toLowerCase();

/**
 * Resolve a saved model name to a list entry. Returns { value, healed, ambiguous }:
 *  - exact full-path match (separator-agnostic) → that entry, healed:false.
 *  - exact path gone but ONE same-basename file exists (e.g. the LoRA's subfolder
 *    was removed and the file now sits at root) → heal to it, healed:true.
 *  - MULTIPLE same-basename files (genuinely different files) → ambiguous:true,
 *    value unchanged (caller keeps it red so the user re-picks).
 *  - nothing matches → value unchanged, neither healed nor ambiguous (missing).
 */
function _resolveInfo(value, available) {
    if (!value) return { value, healed: false, ambiguous: false };
    const list = available || [];
    const want = _pathKey(value);
    const exact = list.find(f => _pathKey(f) === want);
    if (exact) return { value: exact, healed: false, ambiguous: false };
    const base = _baseName(value).toLowerCase();
    const byName = list.filter(f => _baseName(f).toLowerCase() === base);
    if (byName.length === 1) return { value: byName[0], healed: true, ambiguous: false };
    if (byName.length > 1) return { value, healed: false, ambiguous: true };
    return { value, healed: false, ambiguous: false };
}

/** Back-compat: resolve to the list string (exact or unique-basename heal). */
function _resolveToList(value, available) {
    return _resolveInfo(value, available).value;
}

/**
 * True when `value` is set but cannot be resolved to a loadable list entry —
 * either nothing matches OR the basename is ambiguous (multiple folders, we won't
 * guess). A unique-basename heal counts as PRESENT (not missing).
 */
function _isMissing(value, available) {
    if (!value) return false;
    const info = _resolveInfo(value, available);
    if (info.ambiguous) return true;          // multiple same-name files → can't resolve
    if (info.healed) return false;            // unique basename heal → loadable
    // Neither healed nor ambiguous: present only if an exact entry exists.
    return !(available || []).some(f => _pathKey(f) === _pathKey(value));
}

/**
 * If `value` is missing from `options`, append a synthetic disabled option so the
 * dropdown can still show what is selected-but-gone, labeled "<name> (missing)".
 * Returns the (possibly extended) options array.
 */
function _withMissingOption(options, value) {
    if (!value || options.some(o => o.value === value)) return options;
    return [...options, { label: `${_baseName(value)} (missing)`, value, disabled: true }];
}

export const MpiModelSettings = ComponentFactory.create({
    name: 'MpiModelSettings',
    css: ['js/components/Compounds/MpiModelSettings/MpiModelSettings.css'],

    template: () => `
        <div class="mpi-model-settings">
            <div class="mpi-model-settings__header">
                <div class="mpi-model-settings__icon">${renderIcon('settings', 'xl')}</div>
                <h2 class="mpi-model-settings__title">Model Settings</h2>
                <p class="mpi-model-settings__text">Setup your custom upscale model and loras here.</p>
            </div>
            <div class="mpi-model-settings__separator"></div>
            <div class="mpi-model-settings__upscale">
                <p class="mpi-model-settings__section-title">Upscale Model</p>
                <div class="mpi-model-settings__upscale-slot"></div>
                <div class="mpi-model-settings__drop-zones" data-drop="upscale_models"></div>
            </div>
            <div class="mpi-model-settings__loras" data-section="loras">
                <p class="mpi-model-settings__section-title">LoRA Slots</p>
                <div class="mpi-model-settings__lora-list"></div>
                <div class="mpi-model-settings__drop-zones" data-drop="loras"></div>
            </div>
        </div>
    `,

    setup: (el, _props, emit) => {
        // ── Internal state (declared first — referenced by the subscriptions below) ─
        /** @type {{ modelId?: string, toolKey?: string } | null} */
        let _context = null;
        /** True while the overlay is shown — gates live re-render on asset changes. */
        let _isOpen = false;
        const _unsubs = [];

        // ── MpiOverlay base ───────────────────────────────────────────────────
        const overlay = MpiOverlay.mount(document.createElement('div'), { closable: true });
        overlay.el.appendToContainer(el);
        overlay.on('close', () => { _isOpen = false; emit('close', {}); });

        // Live re-render: if the LoRA/upscale lists change while the picker is open
        // (e.g. user removes an extra folder, or a drag-drop import lands), rebuild
        // the dropdowns so the missing/red flags and options stay current without a
        // close-reopen.
        _unsubs.push(Events.on('state:changed', ({ key }) => {
            if (!_isOpen || !_context) return;
            if (key === 'availableLoras' || key === 'upscaleModels') el.open(_context);
        }));

        /** Per-slot LoRA tracking (mutated by input events); array or staged object */
        let _loraSlots = [];

        /** Currently selected upscale value (tracked from change event) */
        let _upscaleValue = '';

        /** Mounted MpiFolderDrop instances, torn down on each re-render / close */
        let _dropInstances = [];
        /** Monotonic render token — guards against overlapping async drop-zone
         *  renders (el.open can fire again via the state:changed live-rerender
         *  while a previous _renderDropZones fetch is still pending → duplicates). */
        let _dropRenderToken = 0;

        function _clearDropZones() {
            _dropInstances.forEach(inst => inst?.el?.destroy?.());
            _dropInstances = [];
            // Bump the token so any in-flight _renderDropZones bails before appending.
            _dropRenderToken++;
        }

        /**
         * Render one MpiFolderDrop per configured folder for a bucket into its
         * [data-drop] container, sourced from /comfy/model-folders so paths match
         * the import route's allow-list. On import, refresh asset lists + re-mount
         * the dropdowns so the new file is selectable immediately.
         */
        async function _renderDropZones(bucket) {
            const host = qs(`[data-drop="${bucket}"]`, el);
            if (!host) return;
            const token = _dropRenderToken;
            let folders = [];
            try {
                const res = await fetch(`/comfy/model-folders?bucket=${bucket}`);
                const data = await res.json();
                folders = data.success ? (data.folders || []) : [];
            } catch (err) {
                clientLogger.error('model-settings', 'model-folders fetch failed', err);
                return;
            }
            // A newer render (or a clear) started while we awaited — abandon this one
            // so we never append a stale/duplicate set.
            if (token !== _dropRenderToken) return;

            // Clear AFTER the await (not before) so a stale in-flight render can't
            // wipe a fresh one's content.
            host.innerHTML = '';
            const title = document.createElement('p');
            title.className = 'mpi-model-settings__drop-title';
            title.textContent = `Drop ${bucket === 'loras' ? 'LoRA' : 'upscale'} models into a folder:`;
            host.appendChild(title);

            folders.forEach(({ path: folderPath, primary }) => {
                const inst = MpiFolderDrop.mount(document.createElement('div'), {
                    folderPath,
                    bucket,
                    primary,
                    onImport: async (filename) => {
                        Events.emit('ui:success', { message: `Imported ${filename}.` });
                        // loadAssets() reassigns state.availableLoras/upscaleModels →
                        // state:changed → the live-rerender subscription rebuilds the
                        // dropdowns (new file present, red flag cleared). No explicit
                        // el.open() needed here.
                        await loadAssets();
                    },
                });
                host.appendChild(inst.el);
                _dropInstances.push(inst);
            });
        }

        // ── Auto-save helper ──────────────────────────────────────────────────

        function _autoSave() {
            if (!_context) return;
            try {
                const modelUpscaleValue = _filenameToDep(_upscaleValue) || _upscaleValue || null;
                const toolUpscaleValue = _upscaleValue || null;
                if (_context.modelId) {
                    Events.emit('settings:model:update', { modelId: _context.modelId, key: 'loras', value: _loraSlots });
                    Events.emit('settings:model:update', { modelId: _context.modelId, key: 'upscaleModel', value: modelUpscaleValue });
                } else if (_context.toolKey) {
                    Events.emit('settings:tool:update', { toolKey: _context.toolKey, key: 'upscaleModel', value: toolUpscaleValue });
                }
                emit('saved', {});
            } catch (err) {
                clientLogger.error('model-settings', 'Failed to emit model settings update', err);
                Events.emit('ui:error', { message: 'Failed to save settings. Please try again.' });
            }
        }

        // ── Upscale dropdown ──────────────────────────────────────────────────

        function _mountUpscaleDropdown(currentValue, modelType) {
            const slot = qs('.mpi-model-settings__upscale-slot', el);
            slot.innerHTML = '';

            const filtered = _filterByType(state.upscaleModels, modelType);
            // SIAX is always installed with the engine → guaranteed fallback.
            const siaxFile = _depToFilename('4x-NMKD-Siax');
            // A saved upscaler that's gone (folder removed) is flagged red so the
            // user sees it's missing; selection stays on the saved value so the
            // dropdown reflects intent. Generation falls back to the default +
            // warns (see commandExecutor _resolveUpscaleParam) — upscale never
            // hard-blocks the way LoRAs do.
            const missing = _isMissing(currentValue, filtered);
            const resolved = missing
                ? currentValue
                : (_resolveToList(currentValue, filtered)
                    || (filtered.includes(siaxFile) ? siaxFile : (filtered[0] || '')));

            _upscaleValue = resolved;

            const dd = MpiDropdown.mount(slot, {
                options: _withMissingOption(_upscaleOptions(filtered), missing ? _upscaleValue : ''),
                value: _upscaleValue,
                extraClasses: missing ? 'mpi-dropdown--missing' : '',
            });

            dd.on('change', ({ value }) => {
                _upscaleValue = value;
                qs('.mpi-model-settings__upscale-slot .mpi-dropdown', el)?.classList.toggle('mpi-dropdown--missing', _isMissing(value, filtered));
                _autoSave();
            });
            // Note: a healed/relocated upscale path is NOT auto-persisted here —
            // _mountUpscaleDropdown runs before the LoRA slots in el.open, so calling
            // _autoSave now would write a stale _loraSlots. The dropdown shows the
            // healed value, and injection (_resolveUpscaleParam) heals at generation;
            // the stored value persists on the next explicit change.
        }

        // ── LoRA slots ────────────────────────────────────────────────────────

        function _mountLoraSlots(slots, modelType, kinds = ['model', 'clip']) {
            const list = qs('.mpi-model-settings__lora-list', el);
            list.innerHTML = '';

            // Normalise to exactly LORA_COUNT slots
            _loraSlots = Array.from({ length: LORA_COUNT }, (_, i) => {
                const s = slots[i] ?? {};
                return {
                    name: s.name || null,
                    strengthModel: s.strengthModel ?? 1.0,
                    strengthClip: s.strengthClip ?? 1.0,
                    bypass: s.bypass ?? false,
                };
            });

            const loraOpts = _loraOptions(state.availableLoras);
            let _healedAny = false;

            _loraSlots.forEach((slot, i) => {
                const slotEl = document.createElement('div');
                slotEl.className = [
                    'mpi-model-settings__lora-slot',
                    !slot.name ? 'mpi-model-settings__lora-slot--empty' : '',
                    slot.bypass ? 'mpi-model-settings__lora-slot--bypassed' : '',
                ].filter(Boolean).join(' ');

                const dropHost = document.createElement('div');
                dropHost.className = 'mpi-model-settings__lora-dropdown';

                const strengthsEl = _buildStrengthsRow(
                    slot, kinds,
                    (value) => { _loraSlots[i].strengthModel = value; _autoSave(); },
                    (value) => { _loraSlots[i].strengthClip = value; _autoSave(); },
                );

                const bypassBtn = _buildBypassBtn(slot.bypass, (next) => {
                    _loraSlots[i].bypass = next;
                    slotEl.classList.toggle('mpi-model-settings__lora-slot--bypassed', next);
                    _autoSave();
                });

                slotEl.appendChild(dropHost);
                slotEl.appendChild(strengthsEl);
                slotEl.appendChild(bypassBtn);
                list.appendChild(slotEl);

                const info = _resolveInfo(slot.name, state.availableLoras);
                const missing = _isMissing(slot.name, state.availableLoras);
                // Heal a moved/separator-mismatched saved value to the exact list
                // string (unique basename or separator diff) and persist it so the
                // stored path tracks the file's new location. Ambiguous/missing
                // values are left as-is (shown red) for the user to re-pick.
                if (info.value !== slot.name && (info.healed || (!missing && !info.ambiguous))) {
                    _loraSlots[i].name = info.value;
                    _healedAny = true;
                }
                const dd = MpiTreePicker.mount(dropHost, {
                    options: _withMissingOption(loraOpts, missing ? slot.name : ''),
                    value: missing ? (slot.name || '') : (_loraSlots[i].name || ''),
                    placeholder: `Slot ${i + 1} — None`,
                    searchPlaceholder: 'Search LoRAs…',
                    stripExtension: true,
                    extraClasses: missing ? 'mpi-tree-picker--missing' : '',
                });

                dd.on('change', ({ value }) => {
                    _loraSlots[i].name = value || null;
                    slotEl.classList.toggle('mpi-model-settings__lora-slot--empty', !value);
                    qs('.mpi-tree-picker', dropHost)?.classList.toggle('mpi-tree-picker--missing', _isMissing(value, state.availableLoras));
                    _autoSave();
                });
            });

            // Persist any healed paths once (path tracked the file's new location).
            if (_healedAny) _autoSave();
        }

        // ── Public open() method ──────────────────────────────────────────────

        function _normaliseLoraSlots(slots) {
            return Array.from({ length: LORA_COUNT }, (_, i) => {
                const s = slots?.[i] ?? {};
                return {
                    name: s.name || null,
                    strengthModel: s.strengthModel ?? 1.0,
                    strengthClip: s.strengthClip ?? 1.0,
                    bypass: s.bypass ?? false,
                };
            });
        }

        function _mountStagedLoraSlots(slots, modelType, loraStages, kinds = ['model', 'clip']) {
            const list = qs('.mpi-model-settings__lora-list', el);
            list.innerHTML = '';

            _loraSlots = Object.fromEntries(
                loraStages.map(stage => [stage.key, _normaliseLoraSlots(slots?.[stage.key])])
            );

            const loraOpts = _loraOptions(state.availableLoras);
            let _healedAny = false;

            loraStages.forEach(stage => {
                const header = document.createElement('div');
                header.className = 'mpi-model-settings__lora-stage-header';
                header.textContent = stage.label;
                list.appendChild(header);

                _loraSlots[stage.key].forEach((slot, i) => {
                    const slotEl = document.createElement('div');
                    slotEl.className = [
                        'mpi-model-settings__lora-slot',
                        !slot.name ? 'mpi-model-settings__lora-slot--empty' : '',
                        slot.bypass ? 'mpi-model-settings__lora-slot--bypassed' : '',
                    ].filter(Boolean).join(' ');

                    const dropHost = document.createElement('div');
                    dropHost.className = 'mpi-model-settings__lora-dropdown';

                    const strengthsEl = _buildStrengthsRow(
                        slot, kinds,
                        (value) => { _loraSlots[stage.key][i].strengthModel = value; _autoSave(); },
                        (value) => { _loraSlots[stage.key][i].strengthClip = value; _autoSave(); },
                    );

                    const bypassBtn = _buildBypassBtn(slot.bypass, (next) => {
                        _loraSlots[stage.key][i].bypass = next;
                        slotEl.classList.toggle('mpi-model-settings__lora-slot--bypassed', next);
                        _autoSave();
                    });

                    slotEl.appendChild(dropHost);
                    slotEl.appendChild(strengthsEl);
                    slotEl.appendChild(bypassBtn);
                    list.appendChild(slotEl);

                    const info = _resolveInfo(slot.name, state.availableLoras);
                    const missing = _isMissing(slot.name, state.availableLoras);
                    if (info.value !== slot.name && (info.healed || (!missing && !info.ambiguous))) {
                        _loraSlots[stage.key][i].name = info.value;
                        _healedAny = true;
                    }
                    const dd = MpiTreePicker.mount(dropHost, {
                        options: _withMissingOption(loraOpts, missing ? slot.name : ''),
                        value: missing ? (slot.name || '') : (_loraSlots[stage.key][i].name || ''),
                        placeholder: `${stage.label} ${i + 1} - None`,
                        searchPlaceholder: 'Search LoRAs…',
                        stripExtension: true,
                        extraClasses: missing ? 'mpi-tree-picker--missing' : '',
                    });

                    dd.on('change', ({ value }) => {
                        _loraSlots[stage.key][i].name = value || null;
                        slotEl.classList.toggle('mpi-model-settings__lora-slot--empty', !value);
                        qs('.mpi-tree-picker', dropHost)?.classList.toggle('mpi-tree-picker--missing', _isMissing(value, state.availableLoras));
                        _autoSave();
                    });
                });
            });

            // Persist any healed paths once.
            if (_healedAny) _autoSave();
        }

        el.open = async (ctx = {}) => {
            if (!state.currentProject) {
                clientLogger.error('model-settings', 'MpiModelSettings.open() called with no active project');
                return;
            }
            if (!ctx.modelId && !ctx.toolKey) {
                clientLogger.error('model-settings', 'MpiModelSettings.open() requires modelId or toolKey');
                return;
            }

            // Rescan asset lists on every open. Files can land on disk outside the
            // app (File Explorer copy, a new subfolder) with no state:changed to
            // trigger a refresh — an open-time rescan is the only chance to pick
            // them up. loadAssets() reassigns the state keys → state:changed →
            // the live-rerender subscription rebuilds the dropdowns.
            await loadAssets();

            _context = ctx;

            if (ctx.modelId) {
                Events.emit('settings:model:select', { modelId: ctx.modelId });
            } else if (ctx.toolKey) {
                Events.emit('settings:tool:select', { toolKey: ctx.toolKey });
            }

            const lorasSection = qs('[data-section="loras"]', el);

            if (ctx.modelId) {
                const settings = getModelSettings(state.currentProject, ctx.modelId);
                const model = getModelById(ctx.modelId);
                const modelType = model?.type ?? null;
                const loraStages = model?.loraStages ?? null;
                // Which strength knobs to surface; default both. Wan is model-only.
                const loraKinds = model?.loraStrengths ?? ['model', 'clip'];
                // Resolve saved dep ID → filename; fallback to model default → filename → SIAX
                const savedFile = _depToFilename(settings.upscaleModel) || settings.upscaleModel;
                const modelDefaultFile = _depToFilename(model?.defaultUpscale);
                const siaxFile = _depToFilename('4x-NMKD-Siax');
                const defaultUpscale = savedFile || modelDefaultFile || siaxFile;
                _mountUpscaleDropdown(defaultUpscale, modelType);
                el.classList.toggle('mpi-model-settings--staged-lora', Boolean(loraStages?.length));
                if (loraStages?.length) {
                    _mountStagedLoraSlots(settings.loras, modelType, loraStages, loraKinds);
                } else {
                    _mountLoraSlots(settings.loras, modelType, loraKinds);
                }
                lorasSection.style.display = '';
                _clearDropZones();
                _renderDropZones('loras');
                _renderDropZones('upscale_models');
            } else {
                const settings = getToolSettings(state.currentProject, ctx.toolKey);
                // Tool context has no model type → no filter, show all upscalers.
                _mountUpscaleDropdown(_depToFilename(settings.upscaleModel) || settings.upscaleModel || _depToFilename('4x-NMKD-Siax'), null);
                el.classList.remove('mpi-model-settings--staged-lora');
                lorasSection.style.display = 'none';
                _clearDropZones();
                _renderDropZones('upscale_models');
            }

            overlay.el.show();
            _isOpen = true;
        };

        // ── Cleanup ───────────────────────────────────────────────────────────
        el.destroy = () => {
            _isOpen = false;
            _clearDropZones();
            _unsubs.forEach(fn => fn?.());
        };
    },
});
