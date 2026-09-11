/**
 * MpiLoraRack — the LoRAs the current model is running, at the top of the
 * PromptBox settings popup (MPI-724).
 *
 * READ-ONLY over the SET, live over the VALUES. It shows one row per FILLED LoRA
 * slot — name, strength(s), bypass — and can never add, remove or re-point a
 * LoRA. That stays in MpiModelSettings, reached from the model card, because
 * MPI-356 settled that anything picking a FILE belongs there and only knobs
 * belong in this popup. Nothing filled → the rack renders nothing at all: no
 * label, no placeholder, zero height.
 *
 * It writes `project.modelSettings[modelId].loras` in exactly the shape
 * MpiModelSettings._autoSave() writes, and the two live-sync each other through
 * `settings:model:update` — one value, two views.
 *
 * Usage:
 *   const rack = MpiLoraRack.mount(slotEl, { modelId: model?.id ?? null });
 *   rack.on('resized', () => positionPopup());   // row count changed
 *   rack.el.setModel(nextModelId);               // model switched
 *   rack.el.refresh();                           // popup re-opened
 *
 * Props:
 * @param {string|null} [modelId]
 *
 * Instance methods (on instance.el):
 *   setModel(modelId|null) — re-read and re-render for that model
 *   refresh()              — re-read and re-render for the current model
 *
 * Emits:
 *   'resized' {} — the rendered row count changed, so the host should re-measure
 */

import { ComponentFactory } from '../../factory.js';
import { MpiBadge } from '../../Primitives/MpiBadge/MpiBadge.js';
import { Events } from '../../../events.js';
import { state } from '../../../state.js';
import { getModelSettings } from '../../../data/projectModel.js';
import { getModelById } from '../../../data/modelRegistry.js';
import {
    buildStrengthsRow,
    buildBypassBtn,
    applyBypass,
    baseName,
    isMissing,
} from '../MpiModelSettings/loraSlotParts.js';

const BEM = 'mpi-lora-rack';
const BYPASSED_CLASS = `${BEM}__row--bypassed`;

/**
 * The groups to render, as `[stageKey, label, slots]`. A flat model yields one
 * group under the plain `LORAS` label; a staged model (Wan) yields one per stage
 * IN THE MODEL'S DECLARED ORDER — HIGH NOISE then LOW NOISE — so the rack and the
 * overlay read top-to-bottom the same way.
 *
 * A stage the model no longer declares is dropped rather than guessed at: the
 * saved value outlives a model definition change, and a header with no injection
 * target behind it would be a lie.
 */
function _groupsOf(model, loras) {
    if (!loras) return [];
    if (Array.isArray(loras)) return [['', 'LORAS', loras]];
    return (model?.loraStages ?? [])
        .filter(stage => Array.isArray(loras[stage.key]))
        .map(stage => [stage.key, `${stage.label} LORAS`, loras[stage.key]]);
}

/** Which slots are filled, and where — `stageKey:index:name`, in render order. */
function _signatureOf(model, loras) {
    return _groupsOf(model, loras)
        .flatMap(([key, , slots]) => slots.map((s, i) => (s?.name ? `${key}:${i}:${s.name}` : '')))
        .filter(Boolean)
        .join('|');
}

export const MpiLoraRack = ComponentFactory.create({
    name: 'MpiLoraRack',
    css: ['js/components/Compounds/MpiLoraRack/MpiLoraRack.css'],

    template: () => `<div class="mpi-lora-rack" hidden></div>`,

    setup: (el, props, emit) => {
        let _modelId = props.modelId ?? null;
        /** The whole saved value — every slot, filled or not — mutated and re-emitted. */
        let _loras = null;
        /** Filled-slot signature of what is currently rendered. */
        let _signature = '';
        /** Rendered row count, so 'resized' only fires when the host must re-measure. */
        let _rowCount = 0;
        /** Live control handles, keyed `${stageKey}:${index}` — see _applyIncoming. */
        const _handles = new Map();
        /** True during this rack's OWN emit, so the listener skips its own echo. */
        let _selfWrite = false;
        /**
         * The model whose value this rack has written but not yet seen land in
         * `state.currentProject`. projectService debounces that write ~300ms, so for
         * that window the event stream is AHEAD of the project — and a re-read
         * inside it would put the user's own number back to what it was. Measured
         * 2026-09-11: emit LoRAs, open the cog immediately, and the rack came up
         * empty because the project had not caught up yet.
         */
        let _dirtyFor = null;
        const _unsubs = [];

        // ── Read ──────────────────────────────────────────────────────────────

        function _model() {
            return _modelId ? getModelById(_modelId) : null;
        }

        function _readLoras() {
            if (!_modelId || !state.currentProject) return null;
            const saved = getModelSettings(state.currentProject, _modelId).loras;
            // A private copy: the overlay holds its own `_loraSlots` and both write
            // the same key, so sharing an object reference would let one surface
            // mutate the other's idea of what it last saved.
            return saved ? structuredClone(saved) : null;
        }

        // ── Write ─────────────────────────────────────────────────────────────

        // The same event, key and shape MpiModelSettings._autoSave() emits — that
        // identity is what lets the overlay apply this without re-deriving anything.
        // Note it does NOT emit upscaleModel: the rack does not own that value, and
        // echoing a stale copy of it back would be how the two surfaces drift.
        function _save() {
            if (!_modelId || !_loras) return;
            _selfWrite = true;
            _dirtyFor = _modelId;
            try {
                Events.emit('settings:model:update', { modelId: _modelId, key: 'loras', value: _loras });
            } finally {
                _selfWrite = false;
            }
        }

        /**
         * Point the rack at a model and re-read — unless what it holds is newer than
         * the project. See `_dirtyFor`: between this rack's write and projectService's
         * flush, the project still carries the OLD value, and `_refreshOpSlot` runs on
         * every op change, so an op picked right after a strength edit would re-read
         * that old value and silently revert the number on screen.
         */
        function _adopt(modelId) {
            const sameModel = modelId === _modelId;
            _modelId = modelId;
            const fromProject = _readLoras();
            const held = sameModel && _dirtyFor === modelId && _loras;
            const flushLanded = !held || JSON.stringify(fromProject) === JSON.stringify(_loras);
            if (flushLanded) {
                _loras = fromProject;
                _dirtyFor = null;
            }
            _render();
        }

        // ── Render ────────────────────────────────────────────────────────────

        function _buildRow(slot, stageKey, index, kinds, available) {
            const row = document.createElement('div');
            row.className = [
                `${BEM}__row`,
                slot.bypass ? BYPASSED_CLASS : '',
            ].filter(Boolean).join(' ');

            // The name is a label, not a control: no picker, no click, nothing to
            // select. `title` carries the full stored path, which is the only place
            // a subfoldered LoRA's folder is still visible here.
            const nameHost = document.createElement('div');
            nameHost.className = `${BEM}__name`;
            const badge = MpiBadge.mount(nameHost, { label: '', variant: 'secondary', pill: true });
            // textContent, not the label prop: a filename is user data and the
            // Primitive interpolates its label straight into the template string.
            badge.el.textContent = baseName(slot.name).replace(/\.(safetensors|ckpt|pt|bin)$/i, '');
            // An empty availableLoras list means the scan has not run, not that every
            // file is gone — flagging the lot red on a cold popup would be a lie.
            const missing = available.length > 0 && isMissing(slot.name, available);
            row.title = missing
                ? `${slot.name} — file missing, fix it in LoRA & Upscale`
                : slot.name;
            if (missing) row.classList.add(`${BEM}__row--missing`);

            const strengths = buildStrengthsRow(
                slot, kinds,
                (value) => { slot.strengthModel = value; _save(); },
                (value) => { slot.strengthClip = value; _save(); },
                BEM,
            );

            const bypassBtn = buildBypassBtn(slot.bypass, (next) => {
                slot.bypass = next;
                row.classList.toggle(BYPASSED_CLASS, next);
                _save();
            }, BEM);

            _handles.set(`${stageKey}:${index}`, { row, bypassBtn, slot, ...strengths });

            row.appendChild(nameHost);
            row.appendChild(strengths.el);
            row.appendChild(bypassBtn);
            return row;
        }

        function _render() {
            _handles.clear();
            el.innerHTML = '';

            const model = _model();
            const kinds = model?.loraStrengths ?? ['model', 'clip'];
            const available = state.availableLoras ?? [];
            const groups = _groupsOf(model, _loras);
            let rows = 0;

            for (const [stageKey, label, slots] of groups) {
                const filled = slots
                    .map((slot, index) => ({ slot, index }))
                    // The ORIGINAL index travels with the slot: a write has to land
                    // back in its own position, never in a compacted one.
                    .filter(({ slot }) => Boolean(slot?.name));
                if (!filled.length) continue;   // a stage with nothing in it gets no header

                const header = document.createElement('p');
                header.className = `${BEM}__label`;
                header.textContent = label;
                el.appendChild(header);

                for (const { slot, index } of filled) {
                    el.appendChild(_buildRow(slot, stageKey, index, kinds, available));
                    rows++;
                }
            }

            // Nothing filled → nothing at all. `hidden` rather than an empty div so
            // the popup's own flex gap does not leave a band where the rack isn't.
            el.hidden = rows === 0;

            _signature = _signatureOf(model, _loras);
            if (rows !== _rowCount) {
                _rowCount = rows;
                emit('resized', {});
            }
        }

        // ── Live sync from MpiModelSettings ───────────────────────────────────
        // The overlay CAN change the filled set (pick or clear a LoRA), so a changed
        // signature means a rebuild — rows appear or vanish and the label with them.
        // An unchanged signature is a value edit, applied in place: rebuilding would
        // steal focus from a half-typed strength in this very rack.
        _unsubs.push(Events.on('settings:model:update', ({ modelId, key, value }) => {
            if (_selfWrite || key !== 'loras') return;
            if (!_modelId || modelId !== _modelId || !value) return;
            if (_signatureOf(_model(), value) !== _signature) {
                _loras = structuredClone(value);
                _render();
                return;
            }
            _applyIncoming(value);
        }));

        function _applyIncoming(value) {
            for (const [stageKey, , slots] of _groupsOf(_model(), value)) {
                slots.forEach((incoming, index) => {
                    const handles = _handles.get(`${stageKey}:${index}`);
                    if (!handles || !incoming) return;
                    const { slot } = handles;

                    if (incoming.strengthModel !== slot.strengthModel) {
                        slot.strengthModel = incoming.strengthModel;
                        handles.modelInput?.el.setValue(incoming.strengthModel);
                    }
                    if (incoming.strengthClip !== slot.strengthClip) {
                        slot.strengthClip = incoming.strengthClip;
                        handles.clipInput?.el.setValue(incoming.strengthClip);
                    }
                    if (Boolean(incoming.bypass) !== Boolean(slot.bypass)) {
                        slot.bypass = Boolean(incoming.bypass);
                        applyBypass(handles.bypassBtn, handles.row, slot.bypass, BYPASSED_CLASS);
                    }
                });
            }
        }

        // ── Public API ────────────────────────────────────────────────────────

        el.setModel = (modelId) => _adopt(modelId ?? null);

        // For the host to call after something wrote `loras` STRAIGHT into the
        // project without emitting — Reuse Prompt does exactly that
        // (projectService.applyPromptReuseSettings), and reaches this through
        // el.refreshControls → _refreshOpSlot → setModel. Not called on popup open:
        // the sync listener below is subscribed whether the popup is shown or not,
        // so an overlay edit made while it was shut has already arrived, and a read
        // there would land inside the debounce window described at `_dirtyFor`.
        el.refresh = () => _adopt(_modelId);

        el.destroy = () => {
            _unsubs.forEach(fn => fn?.());
            _unsubs.length = 0;
            _handles.clear();
        };

        // No `state:changed` subscription anywhere in here, deliberately: this
        // rack's own write reaches state.currentProject ~300ms later (projectService
        // debounces), and a listener on that re-enters on its own echo. The overlay
        // needed a `_rescanning` flag for exactly that loop (MPI-356). Refreshes come
        // from setModel/refresh and from the sync listener above, which is filtered.
        el.refresh();
    },
});
