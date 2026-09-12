import { ComponentFactory } from '../../../factory.js';
import { MpiInput } from '../../../Primitives/MpiInput/MpiInput.js';
import { MpiButton } from '../../../Primitives/MpiButton/MpiButton.js';
import { MpiDropdown } from '../../../Primitives/MpiDropdown/MpiDropdown.js';
import { secretsClient } from '../../../../core/secretsClient.js';
import { clientLogger } from '../../../../services/clientLogger.js';
import { pluginAvailability } from '../../../../data/pluginsRegistry.js';
import {
    backendPreference,
    setBackendPreference,
    enhancerModelPreference,
    setEnhancerModelPreference,
    enhancerModels,
    priceLabel,
} from '../../../../services/llmService.js';
import { qs } from '../../../../utils/dom.js';

/**
 * MpiLlmSettings — the Language Models section of the Remote panel.
 *
 * THE SECTION IS ABOUT THE LANGUAGE MODEL, NOT ABOUT ONE BUTTON (Fabio,
 * 2026-09-12). An earlier draft was written entirely around prompt enhancement
 * and read as if that were the only job. It is not: an LLM already writes image
 * descriptions here too, and the agent is a third job arriving later. So the
 * section is per-JOB — one row each — and the copy talks about the models rather
 * than about Enhance.
 *
 * THE CHOICE IS WHERE THE WORK RUNS, NOT WHICH ANSWER IS BETTER. His two cases
 * are the spec: generating on a RunPod pod, enhance locally because the card is
 * idle; generating locally, push it to the cloud so it costs no VRAM. Every entry
 * is labelled with what it COSTS, and the model choice sits UNDER the backend.
 *
 * THE JOBS, and what each can honestly offer today:
 *   - **Enhancement** — all three backends. Live.
 *   - **Descriptions** — ComfyUI only, and that is a MEASURED limit rather than a
 *     missing feature: `MODEL_REGISTRY` (`services/llmEngines.mjs`) is four models
 *     and every one is TEXT-ONLY, so neither DeepInfra nor Ollama has anything
 *     that can look at an image. The row says so instead of offering a choice
 *     that would break "Describe image". **MPI-737 owns growing it**, by putting
 *     a vision-capable entry in the registry and routing `imageDescribe` through
 *     the chosen backend.
 *   - **Agent** — MPI-677 step 5. Not built; the section is shaped to take it as
 *     a third row without being rearranged.
 *
 * WHAT IS DELIBERATELY NOT HERE: any notion of an "uncensored model" (MPI-728 —
 * a LoRA the user downloads makes any model uncensored, so it was never a fact
 * about the model card), and any implication that an abliterated build is the
 * stronger instrument (it is the enhancer OF RECORD and it dropped the user's own
 * subject 6 runs in 10 where both shipped models dropped none).
 */

/** The plugin whose deps ARE the local enhancer/describer weight. */
const ENHANCER_PLUGIN_ID = 'image-describer';

/**
 * `mpi-dropdown--stacked` puts each option's meta on its OWN line with no
 * ellipsis cap. Without it the cost labels — the entire reason these entries read
 * as a placement choice — truncate to "CLOUD W…" and "NO VRAM…" in the panel's
 * width, which is the MPI-620 defect MpiDropdown's own comment warns about.
 */
const STACKED = 'mpi-dropdown--stacked';

/**
 * THREE ENTRIES AND NO "AUTOMATIC" (Fabio, 2026-09-12): the RunPod section has no
 * automatic entry, so neither does this, and with nothing picked it is ComfyUI
 * (`backendPreference()`). An entry that cannot run yet stays LISTED but greyed
 * rather than vanishing — DeepInfra until a key is saved, ComfyUI until its plugin
 * is installed — because the list is also how a user learns what exists.
 */
const BACKENDS = [
    { value: 'deepinfra', label: 'DeepInfra (cloud)', meta: 'No VRAM, needs a key' },
    { value: 'ollama',    label: 'Ollama (local)',    meta: 'A second runtime, its own VRAM' },
    { value: 'comfy',     label: 'ComfyUI (local)',   meta: 'Reuses the engine already running' },
];

export const MpiLlmSettings = ComponentFactory.create({
    name: 'MpiLlmSettings',
    css: ['js/components/Compounds/LandingPages/MpiLlmSettings/MpiLlmSettings.css'],

    template: () => `
                <div class="mpi-settings__section">
                    <h3 class="mpi-settings__section-title">Language Models</h3>
                    <span class="mpi-settings__hint">Cubric uses a language model for the writing jobs around a generation — rewriting a short idea into a full prompt, and describing an image you hand it. Each job below chooses which machine runs it. You always see the result before it is used.</span>

                    <div class="mpi-settings__subgroup">
                        <span class="mpi-settings__subgroup-title">Account</span>
                        <span class="mpi-settings__hint">Only needed for the cloud backend. The key is stored by the desktop app and is never readable back — clear it and save a new one to change it.</span>
                        <div class="mpi-settings__signup">
                            <div class="mpi-settings__signup-copy">
                                <span class="mpi-settings__signup-kicker">New to DeepInfra?</span>
                                <span class="mpi-settings__signup-text">Create an account, then make an API key in your DeepInfra dashboard and paste it below. What you run is billed to your DeepInfra account.</span>
                            </div>
                            <a class="mpi-settings__signup-link" href="https://deepinfra.com/dash" target="_blank" rel="noopener noreferrer">Open DeepInfra dashboard</a>
                        </div>
                        <div class="mpi-settings__form-group">
                            <label class="mpi-settings__field-label">DeepInfra API key</label>
                            <div class="mpi-settings__folder-row">
                                <div id="mpiSettingsLlmKeySlot" class="mpi-settings__folder-input"></div>
                                <div id="mpiSettingsLlmKeySaveSlot"></div>
                                <div id="mpiSettingsLlmKeyClearSlot"></div>
                            </div>
                            <span class="mpi-settings__hint" id="mpiSettingsLlmKeyStatus"></span>
                        </div>
                    </div>

                    <div class="mpi-settings__subgroup">
                        <span class="mpi-settings__subgroup-title">Where each job runs</span>
                        <span class="mpi-settings__hint">This is about which machine does the work, not which answer is better. Generating on a RunPod pod? Run these locally — your own card is idle. Generating locally? Push them to the cloud and keep the VRAM for the picture.</span>

                        <div class="mpi-settings__form-group">
                            <label class="mpi-settings__field-label">Prompt enhancement</label>
                            <div id="mpiSettingsLlmEnhanceBackendSlot"></div>
                            <span class="mpi-settings__hint" id="mpiSettingsLlmEnhanceBackendNote"></span>
                        </div>

                        <div class="mpi-settings__form-group" id="mpiSettingsLlmEnhanceModelGroup">
                            <label class="mpi-settings__field-label">Enhancement model</label>
                            <div id="mpiSettingsLlmEnhanceModelSlot"></div>
                        </div>
                        <span class="mpi-settings__hint" id="mpiSettingsLlmEnhanceModelNote"></span>

                        <div class="mpi-settings__form-group">
                            <label class="mpi-settings__field-label">Image descriptions</label>
                            <div id="mpiSettingsLlmDescribeBackendSlot"></div>
                            <span class="mpi-settings__hint" id="mpiSettingsLlmDescribeNote"></span>
                        </div>
                    </div>

                    <div class="mpi-settings__subgroup">
                        <span class="mpi-settings__subgroup-title">Before you choose</span>
                        <span class="mpi-settings__hint">A hosted provider will refuse or quietly sanitise material that a local uncensored build will shape for you. If that matters for what you are making, run these locally — it is the only place an uncensored model exists.</span>
                        <span class="mpi-settings__hint">Uncensored is not a synonym for better. Measured over 30 runs, the uncensored 12B dropped the subject the user actually asked for in 6 runs out of 10, writing a man holding a leash attached to nothing; both shipped models kept it every time. Pick it because you need what it will write, not because it sounds stronger.</span>
                    </div>
                </div>`,

    setup: (el) => {
        let _models = [];
        let _hasKey = false;
        const _insts = [];

        el.onOpen = () => { _init(el); };
        _init(el);

        /** Every control is re-read from scratch on each open — no cached view state. */
        async function _init(root) {
            _destroyControls();
            _renderKeyField(root);
            _renderDescribe(root);
            _models = await enhancerModels();
            // Key status FIRST: the backend dropdown greys DeepInfra on it.
            await _refreshKeyStatus(root);
            _renderBackend(root);
        }

        function _destroyControls() {
            _insts.forEach(i => i?.el?.destroy?.());
            _insts.length = 0;
        }

        // ── The DeepInfra key (write-only; the field is cleared after save) ──
        // `MpiRunpodSettings`'s shape verbatim: disabled with a "Desktop app only"
        // placeholder in a browser, never read back, and no state.js key — the
        // renderer must not be able to hold the value even in memory.
        function _renderKeyField(root) {
            const keySlot = qs('#mpiSettingsLlmKeySlot', root);
            const saveSlot = qs('#mpiSettingsLlmKeySaveSlot', root);
            const clearSlot = qs('#mpiSettingsLlmKeyClearSlot', root);
            if (!keySlot || !saveSlot || !clearSlot) return;
            keySlot.innerHTML = '';
            saveSlot.innerHTML = '';
            clearSlot.innerHTML = '';

            const available = secretsClient.isAvailable();
            // A FORMAT HINT, not an instruction — the RunPod field's `rpa_...` is the
            // house shape, and it tells the user what they are looking for in their
            // account rather than restating the button beside it.
            const keyInst = MpiInput.mount(keySlot, {
                type: 'password',
                placeholder: available ? 'di_...' : 'Desktop app only',
                disabled: !available,
            });
            _insts.push(keyInst);

            const saveInst = MpiButton.mount(saveSlot, { text: 'Save', variant: 'secondary', size: 'sm' });
            saveInst.on('click', async () => {
                const field = qs('.mpi-input__field', keyInst.el);
                const key = (field?.value || '').trim();
                if (!key) return;
                const res = await secretsClient.setDeepInfraKey(key);
                if (field) field.value = '';
                if (!res?.ok) {
                    _setKeyStatus(root, 'Failed to save the DeepInfra key.');
                    return;
                }
                // Prices come back only once a key is saved, so the list is re-read.
                _models = await enhancerModels();
                await _refreshKeyStatus(root);
                _renderBackend(root);
            });
            _insts.push(saveInst);

            const clearInst = MpiButton.mount(clearSlot, { text: 'Clear', variant: 'secondary', size: 'sm' });
            clearInst.on('click', async () => {
                await secretsClient.clearDeepInfraKey();
                await _refreshKeyStatus(root);
                _renderBackend(root);
            });
            _insts.push(clearInst);
        }

        function _setKeyStatus(root, text) {
            const node = qs('#mpiSettingsLlmKeyStatus', root);
            if (node) node.textContent = text;
        }

        /** Paints the status line and records `_hasKey`, which gates the DeepInfra entry. */
        async function _refreshKeyStatus(root) {
            _hasKey = false;
            if (!secretsClient.isAvailable()) {
                _setKeyStatus(root, 'Saving a key requires the desktop app.');
                return;
            }
            try {
                _hasKey = !!(await secretsClient.hasDeepInfraKey());
                _setKeyStatus(root, _hasKey
                    ? 'API key is saved.'
                    : 'No API key saved — the cloud backend is unavailable until one is.');
            } catch (err) {
                clientLogger.warn('settings', '[MpiLlmSettings] key presence check failed', err);
                _setKeyStatus(root, 'Could not read the key status.');
            }
        }

        /**
         * The ONE gate on ComfyUI, and it is a download rather than a model: the
         * graphs load their own encoder, so what decides is whether that weight is
         * on disk. Same dep, same question, for both jobs.
         */
        function _comfyInstalled() {
            return pluginAvailability(ENHANCER_PLUGIN_ID).installed;
        }

        // ── Prompt enhancement ──────────────────────────────────────────────
        function _renderBackend(root) {
            const slot = qs('#mpiSettingsLlmEnhanceBackendSlot', root);
            if (!slot) return;
            slot.innerHTML = '';

            const options = BACKENDS.map((b) => {
                if (b.value === 'deepinfra' && !_hasKey) return { ...b, disabled: true, meta: 'Save an API key above first' };
                if (b.value === 'comfy' && !_comfyInstalled()) return { ...b, disabled: true, meta: 'Install the Image Describer plugin' };
                return b;
            });

            const current = backendPreference();
            const inst = MpiDropdown.mount(slot, {
                options,
                value: current,
                extraClasses: STACKED,
            });
            inst.on('change', ({ value }) => {
                setBackendPreference(value);
                _paintBackendNote(root, value);
                _renderModel(root, value);
            });
            _insts.push(inst);

            _paintBackendNote(root, current);
            _renderModel(root, current);
        }

        function _paintBackendNote(root, backend) {
            const node = qs('#mpiSettingsLlmEnhanceBackendNote', root);
            if (!node) return;
            const NOTES = {
                deepinfra: 'Runs off your machine entirely. Needs the key above, and your prompt leaves this computer.',
                ollama: 'Runs on your own card in a second runtime, so it holds VRAM alongside a local generation. Ollama must be installed and running.',
                comfy: 'Runs in the ComfyUI engine this app already started, and loads one text encoder of its own. Offered on every model.',
            };
            // A backend picked while it could run and unavailable since (the key
            // cleared, the plugin removed) stays selected. Swapping it would turn the
            // user's pick into a quiet substitution, so the line says what is missing.
            const MISSING = {
                deepinfra: !_hasKey && 'Needs an API key, and none is saved. Save one above, or pick another backend.',
                comfy: !_comfyInstalled() && 'Needs the Image Describer plugin, which is not installed. Install it, or pick another backend.',
            };
            node.textContent = MISSING[backend] || NOTES[backend];
        }

        // ── The enhancement model, UNDER the chosen backend ──────────────────
        function _renderModel(root, backend) {
            const group = qs('#mpiSettingsLlmEnhanceModelGroup', root);
            const slot = qs('#mpiSettingsLlmEnhanceModelSlot', root);
            const note = qs('#mpiSettingsLlmEnhanceModelNote', root);
            if (!group || !slot) return;
            slot.innerHTML = '';

            // ComfyUI runs one graph with one baked weight, so there is nothing to
            // choose. The LABEL hides with the control: a field label with no field
            // under it is what the first draft shipped.
            const servable = _models.filter(m => (backend === 'deepinfra' ? m.deepinfra : m.ollama));
            const reason = backend === 'comfy'
                ? 'ComfyUI runs one enhancer — the weight its graph loads — so there is nothing to pick.'
                : !servable.length
                    ? 'The model list is unavailable — enhancement will use the default.'
                    : '';

            if (reason) {
                group.hidden = true;
                if (note) { note.textContent = reason; note.hidden = false; }
                return;
            }

            group.hidden = false;
            // The cloud bills per token, so its note says how many an enhance takes:
            // the recipe system prompts measure ~450 to ~3,400 tokens (MPI-728).
            const billed = backend === 'deepinfra';
            if (note) {
                note.textContent = billed ? 'Billed to your DeepInfra account. One enhance uses about 500 to 4,000 tokens.' : '';
                note.hidden = !billed;
            }
            const options = [
                { value: '', label: 'Default', meta: 'What the app ships with' },
                ...servable.map(m => ({
                    value: m.id,
                    label: m.name,
                    info: m.description,
                    // No price when the fetch failed: none beats a stale one.
                    ...(billed && m.price && { meta: priceLabel(m.price) }),
                })),
            ];
            // A model pinned under the OTHER backend is not servable here. Show the
            // default rather than a value this dropdown cannot honour; the pin itself
            // is left alone, so switching back restores it.
            const pinned = enhancerModelPreference();
            const value = servable.some(m => m.id === pinned) ? pinned : '';

            const inst = MpiDropdown.mount(slot, {
                options,
                value,
                placeholder: 'Default',
                extraClasses: STACKED,
            });
            inst.on('change', ({ value: id }) => setEnhancerModelPreference(id || null));
            _insts.push(inst);
        }

        // ── Image descriptions (MPI-737 grows this) ─────────────────────────
        // ONE real option today, and the dropdown is shown rather than hidden so the
        // section reads as what it is: a list of jobs, each with a placement. The
        // limit is measured, not missing plumbing — every model in the registry is
        // text-only, so no hosted or Ollama backend can look at an image at all.
        function _renderDescribe(root) {
            const slot = qs('#mpiSettingsLlmDescribeBackendSlot', root);
            const note = qs('#mpiSettingsLlmDescribeNote', root);
            if (!slot) return;
            slot.innerHTML = '';

            const installed = _comfyInstalled();
            const inst = MpiDropdown.mount(slot, {
                options: [{
                    value: 'comfy',
                    label: 'ComfyUI (local)',
                    meta: installed ? 'Reuses the engine already running' : 'Install the Image Describer plugin',
                    disabled: !installed,
                }],
                value: 'comfy',
                placeholder: 'ComfyUI (local)',
                extraClasses: STACKED,
            });
            _insts.push(inst);

            if (note) {
                note.textContent = installed
                    ? 'Only ComfyUI can do this today — describing an image needs a model that can see one, and neither cloud nor Ollama carries one yet.'
                    : 'Needs the Image Describer plugin. Describing an image needs a model that can see one, and only the local ComfyUI graph carries it.';
            }
        }

        el.destroy = () => {
            _destroyControls();
            el.onOpen = null;
        };
    },
});
