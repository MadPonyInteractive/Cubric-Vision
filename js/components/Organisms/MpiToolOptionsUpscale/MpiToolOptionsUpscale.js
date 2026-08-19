/**
 * MpiToolOptionsUpscale — Organism: tool-options panel for Image / Video Upscale.
 *
 * Model dropdown on top (with "None" entry that runs the workflow without an
 * upscale model via the `Upscale_Using_Model` boolean), Upscale Factor radio
 * group below, Run button. Selections persist to
 * `toolSettings.{imageUpscale|videoUpscale}` per kind.
 *
 * PLUGIN ENTRIES (MPI-580). A plugin may contribute an ENTRY to this dropdown by
 * declaring `upscale: { kinds, label, fields }` (js/data/pluginsRegistry.js) — it
 * is not a second dropdown, and not a model. A plugin entry carries the plugin's
 * dep key (`plugin:<id>`) as its value, which is what tells this panel and the
 * dispatch router that the selection is not an upscale-model filename. Selecting
 * one reveals the plugin's own declared controls and hides Upscale Factor, which
 * a plugin's graph owns rather than obeys.
 *
 * Props:
 * @param {object} viewer - MpiCanvasViewer or MpiVideoViewer instance
 * @param {'image'|'video'} [kind='video'] - Determines persistence key + workflow op
 *
 * Emits:
 *   'apply' { factor: number, model: string, pluginId?: string, values?: object }
 *     — user pressed Run. `model === ''` means "no upscale model" (None).
 *     `pluginId` is set only for a plugin entry, and `values` are its declared
 *     controls' UI values, UNMAPPED — a `mapTo` range is applied by the dispatcher
 *     at payload time, exactly as the flow frame does it.
 */

import { ComponentFactory } from '../../factory.js';
import { MpiDropdown } from '../../Primitives/MpiDropdown/MpiDropdown.js';
import { MpiRadioGroup } from '../../Primitives/MpiRadioGroup/MpiRadioGroup.js';
import { MpiButton } from '../../Primitives/MpiButton/MpiButton.js';
import { state } from '../../../state.js';
import { Events } from '../../../events.js';
import { getToolSettings } from '../../../data/projectModel.js';
import { loadAll as loadAssets } from '../../../services/assetService.js';
import { qs } from '../../../utils/dom.js';
import { buildField } from '../../../utils/declaredFields.js';
import {
    upscalePluginsFor, upscalePluginOption, pluginFromDepKey,
} from '../../../data/pluginsRegistry.js';

const FACTOR_OPTIONS = [
    { label: 'x1.5', value: 'x1.5' },
    { label: 'x2',   value: 'x2'   },
    { label: 'x3',   value: 'x3'   },
    { label: 'x4',   value: 'x4'   },
];
const FACTOR_VALUES = new Set(FACTOR_OPTIONS.map(o => o.value));

const NONE_OPTION = { label: 'None', value: '' };

const DEFAULTS = Object.freeze({
    factor: 'x2',
    model:  '',
    pluginValues: {},
});

function coerceSettings(raw) {
    return {
        factor: FACTOR_VALUES.has(raw.factor) ? raw.factor : DEFAULTS.factor,
        model:  typeof raw.model === 'string' ? raw.model : DEFAULTS.model,
        // Keyed by plugin id, so two contributing plugins cannot overwrite each
        // other's controls when the user switches between them.
        pluginValues: (raw.pluginValues && typeof raw.pluginValues === 'object')
            ? raw.pluginValues : {},
    };
}

export const MpiToolOptionsUpscale = ComponentFactory.create({
    name: 'MpiToolOptionsUpscale',
    css: ['js/components/Organisms/MpiToolOptionsUpscale/MpiToolOptionsUpscale.css'],

    template: () => `
        <div class="mpi-tool-options-upscale">
            <div class="mpi-tool-options-upscale__section">
                <div class="mpi-tool-options-upscale__section-label">Upscale Model</div>
                <div class="mpi-tool-options-upscale__row" id="model-slot"></div>
            </div>
            <div class="mpi-tool-options-upscale__section" id="plugin-section" hidden>
                <div class="mpi-tool-options-upscale__section-label" id="plugin-label"></div>
                <div class="mpi-tool-options-upscale__fields" id="plugin-slot"></div>
            </div>
            <div class="mpi-tool-options-upscale__section" id="factor-section">
                <div class="mpi-tool-options-upscale__section-label">Upscale Factor</div>
                <div class="mpi-tool-options-upscale__row" id="factor-slot"></div>
            </div>
            <div class="mpi-tool-options-upscale__row" id="actions-slot"></div>
        </div>
    `,

    setup: (el, props, emit) => {
        const { viewer } = props;
        const kind = props.kind === 'image' ? 'image' : 'video';
        const toolKey = kind === 'image' ? 'imageUpscale' : 'videoUpscale';

        if (kind === 'video') viewer.el.enterUpscaleMode?.();

        const _initial = coerceSettings(
            getToolSettings(state.currentProject || {}, toolKey, DEFAULTS)
        );
        let _factor = _initial.factor;
        let _model  = _initial.model;
        const _pluginValues = { ..._initial.pluginValues };

        const _persistTimers = new Map();
        const persist = (key, value) => {
            clearTimeout(_persistTimers.get(key));
            _persistTimers.set(key, setTimeout(() => {
                Events.emit('settings:tool:update', { toolKey, key, value });
                _persistTimers.delete(key);
            }, 200));
        };

        // ── Plugin controls (MPI-580) ───────────────────────────────────────
        // Only installed plugins contributing to THIS kind. Not installed = absent,
        // matching the describeAction gate: a control that fails deep inside ComfyUI
        // with a missing weight is the worse outcome.
        const _plugins = upscalePluginsFor(kind);
        const pluginSection = qs('#plugin-section', el);
        const pluginLabel   = qs('#plugin-label', el);
        const pluginSlot    = qs('#plugin-slot', el);
        const factorSection = qs('#factor-section', el);
        let _fieldUnsubs = [];

        const _teardownFields = () => {
            _fieldUnsubs.forEach(fn => { try { fn(); } catch { /* teardown is best-effort */ } });
            _fieldUnsubs = [];
            pluginSlot.innerHTML = '';
        };

        /** Show the selected plugin's declared controls, or nothing at all. */
        const _renderPluginFields = () => {
            _teardownFields();
            const plugin = pluginFromDepKey(_model);
            // A plugin's graph owns its own scale, so Upscale Factor is not sent and
            // must not be shown — a control that changes nothing is a lie.
            factorSection.hidden = !!plugin;
            pluginSection.hidden = !plugin;
            if (!plugin) return;

            const fields = plugin.upscale?.fields || [];
            pluginLabel.textContent = plugin.upscale?.label || plugin.title;
            const vals = _pluginValues[plugin.id] || (_pluginValues[plugin.id] = {});
            fields.forEach((f) => {
                if (vals[f.id] === undefined && f.default !== undefined) vals[f.id] = f.default;
                const node = buildField(
                    f,
                    vals[f.id] ?? f.default,
                    (val) => {
                        vals[f.id] = val;
                        persist('pluginValues', { ..._pluginValues });
                    },
                    _fieldUnsubs,
                    { block: 'mpi-tool-options-upscale', namespace: `upscale-${kind}-${plugin.id}` },
                );
                if (node) pluginSlot.appendChild(node);
            });
            // Seeded defaults are values the user never touched but the run will use,
            // so they persist like any other — same law as the flow frame's seeding.
            persist('pluginValues', { ..._pluginValues });
        };

        // ── Model dropdown ──────────────────────────────────────────────────
        const modelSlot = qs('#model-slot', el);
        let modelDd = null;

        const _mountModelDd = () => {
            modelSlot.innerHTML = '';
            const pluginOpts = _plugins.map(upscalePluginOption);
            const modelOpts = (state.upscaleModels || []).map(f => ({ label: f, value: f }));
            const opts = [NONE_OPTION, ...pluginOpts, ...modelOpts];
            // Default: persisted value if still valid, else first real model, else None.
            let initial;
            if (_model === '' || opts.some(o => o.value === _model)) {
                initial = _model;
            } else {
                initial = modelOpts[0]?.value ?? '';
            }
            modelDd = MpiDropdown.mount(modelSlot, {
                options: opts,
                value: initial,
                direction: 'down',
                info: 'Upscale model (None = no model)',
            });
            if (initial !== _model) {
                _model = initial;
                persist('model', _model);
            }
            modelDd.on('change', ({ value }) => {
                _model = value;
                persist('model', _model);
                _renderPluginFields();
            });
            _renderPluginFields();
        };

        if (state.upscaleModels?.length) _mountModelDd();
        else loadAssets().then(() => _mountModelDd());

        // ── Factor radio group ──────────────────────────────────────────────
        const factorRadio = MpiRadioGroup.mount(document.createElement('div'), {
            options: FACTOR_OPTIONS,
            value:   _factor,
            name:    `upscale-factor-${kind}`,
            info:    'Upscale factor',
        });
        qs('#factor-slot', el).appendChild(factorRadio.el);
        factorRadio.on('select', ({ value }) => {
            _factor = value;
            persist('factor', _factor);
        });

        // ── Run ─────────────────────────────────────────────────────────────
        const runBtn = MpiButton.mount(document.createElement('div'), {
            icon: 'upscaler', label: 'Upscale', size: 'sm', variant: 'primary',
            info: kind === 'image' ? 'Run image upscale' : 'Run video upscale',
        });
        qs('#actions-slot', el).appendChild(runBtn.el);
        runBtn.on('click', () => {
            const factor = parseFloat(_factor.replace('x', '')) || 2;
            const plugin = pluginFromDepKey(_model);
            emit('apply', {
                factor,
                model: _model,
                ...(plugin ? {
                    pluginId: plugin.id,
                    values: { ...(_pluginValues[plugin.id] || {}) },
                } : {}),
            });
        });

        el.destroy = () => {
            if (kind === 'video') viewer.el.exitUpscaleMode?.();
            _persistTimers.forEach(t => clearTimeout(t));
            _persistTimers.clear();
            _teardownFields();
            factorRadio.destroy?.();
            modelDd?.destroy?.();
            runBtn.destroy?.();
        };
    },
});
