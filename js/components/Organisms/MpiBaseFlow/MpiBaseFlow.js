import { ComponentFactory } from '../../factory.js';
import { MpiOverlay } from '../../Primitives/MpiOverlay/MpiOverlay.js';
import { MpiButton } from '../../Primitives/MpiButton/MpiButton.js';
import { MpiRadioGroup } from '../../Primitives/MpiRadioGroup/MpiRadioGroup.js';
import { MpiMediaPicker } from '../../Compounds/MpiMediaPicker/MpiMediaPicker.js';
import { Events } from '../../../events.js';
import { state, AUTO_PIXEL_THRESHOLD } from '../../../state.js';
import { ViewManager } from '../../Primitives/MpiCanvas/managers/ViewManager.js';
import { submitFlowGeneration } from '../../../services/flowService.js';
import { clientLogger } from '../../../services/clientLogger.js';
import { activeGenerations } from '../../../services/activeGenerations.js';
import { createPreviewClipPlayer } from '../../../services/previewClipPlayer.js';
import { Hotkeys } from '../../../managers/hotkeyManager.js';
import { resolveMediaUrl } from '../../../utils/mediaActions.js';
import { qs, ce, on } from '../../../utils/dom.js';
import { renderIcon } from '/js/utils/icons.js';
import { getStepKind, stepValueToParam, isFrameKind } from './stepKinds.js';
import { enqueueGeneration } from '../../../services/generationService.js';
import { getCommand } from '../../../data/commandRegistry.js';
import { buildField, mapDeclaredValue, isInjectionParam } from '../../../utils/declaredFields.js';

/**
 * MpiBaseFlow — THE flow frame: a step carousel (MPI-306 Phase 1).
 *
 * COMPOSITION, not inheritance (the MpiCompareOverlay/MpiModelManager precedent):
 * setup mounts a `main-area` MpiOverlay (covers #tool-container + #prompt-box-mount,
 * spares the sticky #shell-info-bar so the status bar + queue stay live).
 *
 * ── The shape ────────────────────────────────────────────────────────────────
 * Two zones split by a centre divider, but ONLY on the first and last step. That
 * absence is the signal: divided = you are supplying or reviewing; undivided =
 * you are working. Full design record + rationale:
 * docs/playbooks/add-flow/ui/carousel-frame.md § The approved composition.
 *
 *   STEP 0 (implicit)   media slots (left)  │  what this flow does (right)
 *   STEPS 1..N          declared middle steps — bounded centred canvas, no divider
 *   LAST STEP (implicit) controls + Generate │ result
 *
 * Step 0 and the last step are IMPLICIT — the frame renders them from the flow's
 * `inputSchema` and its controls. A flow with no middle steps declares `steps: []`
 * and gets a 2-step flow.
 *
 * ── Steps are DATA ───────────────────────────────────────────────────────────
 * A flow declares `steps: [{ kind, role, title, hint, fields? }]` and writes NO
 * layout code. `kind` is a key into STEP_KINDS (stepKinds.js); each kind takes
 * `{ media, value, onChange, step }` and reports a value. The frame collects
 * `{ [role]: value }` into `stepValues` and merges it into the Run inputs. The
 * frame never learns what a gizmo does — that is what keeps a new gizmo to one
 * component + one registry line.
 *
 * A step may also DECLARE where its value goes: `param: 'box1'` binds the gizmo's
 * value to that injection param (MPI-572). Which role feeds which node stays flow
 * knowledge — the flow says it — while the SHAPE the graph wants belongs to the
 * kind (`stepValueToParam`, stepKinds.js). That pair is what replaced the flow
 * component's `getInputs({ stepValues })`, and with it the last thing in a FlowDef
 * that a third-party manifest could not express.
 *
 * A step is NEVER invalid: every kind supplies a usable default, so the forward
 * arrow is never blocked. Required-because-the-flow-walks-you-there, not
 * required-because-Run-is-gated.
 *
 * DECLARED FIELDS (MPI-531/MPI-572): `fields: [...]` is the ONE control surface,
 * and where it is declared is the ONLY thing that varies:
 *   - on a STEP  → ONE row between canvas and hint, rendered BY THE FRAME (not the
 *     gizmo) so every gizmo's controls match for free. Hard cap: one row, no
 *     nesting/panels/accordions. A gizmo wanting more means the step should SPLIT.
 *   - on the FLOW → stacked on the run slide.
 * One vocabulary, one renderer (`_buildField`), one seeding path (`_seedField`),
 * one payload law (`Input_*` → injectionParams, everything else top-level). This
 * used to be two surfaces — a flow-level `controls` beside a step's `fields` — and
 * the split cost three bugs the day foley's prompts moved from one to the other:
 * step fields never reached the payload, defaults were never seeded, and Reuse read
 * only `stepValues`. Do not reintroduce a second name for this concept.
 *
 * It is what lets a Flow ship with no JS component at all — a component being
 * precisely the thing a third-party Flow can never have
 * (docs/playbooks/add-flow/ui/carousel-frame.md).
 *
 * ── Results save themselves ──────────────────────────────────────────────────
 * A finished result is committed by the run path and the pane simply SAYS SO
 * ("Saved to your gallery"). Hold-until-Apply was built (MPI-306 Phase 3) and
 * REMOVED after the UX pass: a commit step the user never wanted to skip is
 * friction, not safety. Do not reintroduce an Apply button without a concrete
 * case for NOT saving a result — the machinery is in git (`bcbe161f`), and
 * `deferCommit` still exists on startGeneration for a caller that needs it.
 *
 * State: seeds from and writes `state.s_flowInputs[flowId]` (top-level replace) so
 * inputs survive close→reopen AND the Overlays.reset() force-close on navigation.
 *
 * Props: { flow: FlowDef, initialInputs?: Object }.
 */

/**
 * Returns the declared media groups from the flow's inputSchema, or [] for media-free flows.
 * @param {import('../../../data/flowsRegistry.js').FlowDef} [flow]
 * @returns {Array<{type:string,mode:string,max:number,roles:string[]}>}
 */
function _getMediaGroups(flow) {
    const schema = flow?.inputSchema;
    if (!schema || !Array.isArray(schema.media) || schema.media.length === 0) return [];
    return schema.media;
}

/**
 * The flow's declared middle steps, dropping any whose `kind` is not registered
 * (an unknown kind is an authoring bug — skip it rather than break the flow).
 * @param {import('../../../data/flowsRegistry.js').FlowDef} [flow]
 * @returns {Array<Object>}
 */
function _getSteps(flow) {
    const steps = Array.isArray(flow?.steps) ? flow.steps : [];
    return steps.filter((s) => {
        if (getStepKind(s?.kind) || isFrameKind(s?.kind)) return true;
        clientLogger.warn('MpiBaseFlow', `unknown step kind "${s?.kind}" — skipping`);
        return false;
    });
}

/**
 * Human label for a media slot.
 *
 * A flow SHOULD declare `labels: ['Original', 'Face Reference']` on its media
 * group — a slot's name is flow copy, not something the frame can invent. The
 * fallbacks exist so a flow that declares nothing still renders sanely: a
 * descriptive role reads through, otherwise a numbered noun.
 *
 * The label survives filling: the image replaces the BOX, not the label, so the
 * user can still tell which slot is which once all of them hold an image.
 *
 * @param {{type:string,roles:string[],labels?:string[]}} group
 * @param {number} idx
 * @returns {string}
 */
function _slotLabel(group, idx) {
    const declared = group.labels?.[idx];
    if (typeof declared === 'string' && declared.trim()) return declared;

    const role = group.roles?.[idx];
    if (typeof role === 'string' && !/^(image|video|audio)\d*$/i.test(role)) {
        return role.replace(/[_-]+/g, ' ');
    }
    const noun = group.type === 'image' ? 'Image' : group.type === 'video' ? 'Video' : 'Audio';
    return `${noun} ${idx + 1}`;
}

/**
 * Build the accept attribute value for a file input.
 * @param {string} type
 * @returns {string}
 */
/**
 * Display name for a media URL, extension dropped.
 *
 * A slot URL is a `/project-file?path=<urlencoded absolute path>` form, so
 * splitting it on slashes yields the ENCODED query tail rather than a filename.
 * Decode the `path` parameter first.
 */
function _mediaName(url) {
    const raw = String(url || '');
    const q = raw.indexOf('path=');
    const p = q === -1 ? raw : decodeURIComponent(raw.slice(q + 5).split('&')[0]);
    return (p.split(/[/\\]/).pop() || '').replace(/\.[^.\s]+$/, '');
}

export const MpiBaseFlow = ComponentFactory.create({
    name: 'MpiBaseFlow',
    css: ['js/components/Organisms/MpiBaseFlow/MpiBaseFlow.css'],

    template: (props) => `
        <div class="mpi-base-flow">
            <div class="mpi-base-flow__topbar">
                <div class="mpi-base-flow__topbar-left">
                    <button class="mpi-base-flow__back" id="flow-back" type="button">
                        ${renderIcon('back', 'sm')}<span>Flows</span>
                    </button>
                    <span class="mpi-base-flow__topbar-sep"></span>
                    <span class="mpi-base-flow__flow-name">${props.flow?.title || 'Flow'}</span>
                </div>
                <nav class="mpi-base-flow__ticker" id="flow-ticker" aria-label="Steps"></nav>
                <div class="mpi-base-flow__topbar-right"></div>
            </div>
            <div class="mpi-base-flow__stage" id="flow-stage">
                <button class="mpi-base-flow__arrow mpi-base-flow__arrow--prev" id="flow-prev"
                        type="button" aria-label="Previous step">&#8249;</button>
                <button class="mpi-base-flow__arrow mpi-base-flow__arrow--next" id="flow-next"
                        type="button" aria-label="Next step">&#8250;</button>
                <div class="mpi-base-flow__slides" id="flow-slides"></div>
            </div>
        </div>`,

    setup: (el, props, emit) => {
        const flow = props.flow;
        const _unsubs = [];

        // ── main-area overlay frame (spares the status bar; queue rides above) ──
        const overlay = MpiOverlay.mount(document.createElement('div'), {
            closable: true, mountTarget: 'main-area',
        });
        overlay.el.appendToContainer(el);
        // Re-emit the overlay's close OUTWARD so the shell can destroy this instance
        // (MPI-345). A flow closed but not destroyed keeps every listener this setup
        // registered — including the global `generation.run` hotkey below — so the
        // next Ctrl+Enter in the main workspace fired the closed flow's Run alongside
        // the PromptBox's, queueing a phantom generation from its persisted inputs.
        // Fires ONCE per close: MpiOverlay.hide() emits inside its `_isHiding` guard,
        // so the `el.close()` re-entry here can't loop back through it.
        overlay.on('close', () => { el.close(); emit('close', {}); });

        const tickerEl = qs('#flow-ticker', el);
        const slidesEl = qs('#flow-slides', el);
        const prevBtn = qs('#flow-prev', el);
        const nextBtn = qs('#flow-next', el);

        const mediaGroupDefs = _getMediaGroups(flow);
        const middleSteps = _getSteps(flow);

        // Seed from persisted session inputs (survives reopen + navigation reset).
        const seeded = state.s_flowInputs?.[flow.id] || props.initialInputs || {};

        // ── Model ───────────────────────────────────────────────────────────────
        /**
         * One entry per declared media group. `items` is SPARSE and indexed BY SLOT
         * — a hole means that slot is empty, which is legal (the user may fill slot 2
         * first). Never pack it: an item's role is its slot's role.
         * @type {Array<{group:Object, items:Array}>}
         */
        const _mediaGroups = mediaGroupDefs.map((group) => {
            const items = [];
            if (Array.isArray(seeded.mediaItems)) {
                // Restore each item to the slot its OWN role names, so a saved run
                // with only the second slot filled comes back that way. Falls back to
                // positional order for older snapshots that carry no role.
                const forType = seeded.mediaItems.filter(m => m.mediaType === group.type);
                let next = 0;
                for (const m of forType) {
                    const byRole = group.roles.indexOf(m.role);
                    const idx = byRole >= 0 ? byRole : next;
                    if (idx >= group.max) continue;
                    items[idx] = { ...m, role: group.roles[idx] };
                    next = Math.max(next, idx + 1);
                }
            }
            return { group, items };
        });

        /** Reported step values, keyed by the step's media role. @type {Object} */
        const _stepValues = { ...(seeded.stepValues || {}) };

        /**
         * Flow-level declared fields (MPI-531) — the SAME `fields` a step declares,
         * just placed on the run slide instead of a step. Each value lands as a
         * TOP-LEVEL run input under the field's own id — `{ id: 'positive' }` →
         * `inputs.positive`. That is what lets a Flow collect a prompt or a seed with
         * NO JS component, which is the whole point: a component is a thing a
         * third-party Flow can never have.
         * @type {Array<Object>}
         */
        const _fields = Array.isArray(flow.fields) ? flow.fields : [];

        /**
         * Seed ONE declared field, wherever it was declared. `_buildField` only
         * WRITES a value when the user changes it, so a field left untouched would
         * reach the op as nothing at all and the run would silently use the graph's
         * baked default — that is how a bench-proven negative prompt goes missing on
         * the one run nobody edited.
         *
         * Sources, most specific first:
         *   1. `persisted` — the step-scoped value, when the field lives on a step.
         *   2. The payload ROOT (`Input_*` → injectionParams, else top level), which
         *      is where `_collectInputs` promotes every field regardless of where it
         *      was declared. This is also what makes an OLDER card reusable across a
         *      field moving between the flow and a step: reading the step scope alone
         *      made every foley card made before that move reopen with an EMPTY
         *      prompt — silent data loss the user hits through Reuse, not here.
         *   3. The declared `default`.
         *
         * @param {Object} f  a FlowStepField
         * @param {*} [persisted]  step-scoped persisted value, if any
         * @returns {*} the value to seed, or undefined to seed nothing
         */
        function _seedField(f, persisted) {
            if (f.type === 'button') return undefined;  // an action, not a value
            const root = /^input_/i.test(f.id) ? seeded.injectionParams?.[f.id] : seeded[f.id];
            return persisted ?? root ?? f.default;
        }

        /**
         * Live flow-level field values. Seeded at SETUP, not at render: a run with
         * untouched fields must still send their defaults, and the run slide is
         * rebuilt on every navigation.
         * @type {Object}
         */
        const _fieldValues = {};
        _fields.forEach((f) => {
            const v = _seedField(f);
            if (v !== undefined) _fieldValues[f.id] = v;
        });

        // A `fields` step has no role, so its values belong to the FLOW store, not
        // a role-keyed step scope — see stepKinds.js § FRAME_KINDS. Seeding them
        // here rather than in the role loop below is what makes one prompt edited
        // on the step and on the run slide a SINGLE value.
        (flow.steps || []).forEach((step) => {
            if (!isFrameKind(step?.kind) || !Array.isArray(step.fields)) return;
            step.fields.forEach((f) => {
                const v = _seedField(f);
                if (v !== undefined) _fieldValues[f.id] = v;
            });
        });

        // A STEP's fields seed through the same helper — one path, so a fix to one
        // placement can never miss the other.
        (flow.steps || []).forEach((step) => {
            if (!step?.role || !Array.isArray(step.fields)) return;
            step.fields.forEach((f) => {
                const v = _seedField(f, seeded.stepValues?.[step.role]?.fields?.[f.id]);
                if (v === undefined) return;
                const prev = _stepValues[step.role] || {};
                _stepValues[step.role] = {
                    ...prev,
                    fields: { ...(prev.fields || {}), [f.id]: v },
                };
            });
        });

        /** Live step-kind instances, keyed by step index — destroyed on rebuild. */
        const _stepInstances = new Map();

        /** Per-slide listener unsubs, keyed by slide index. */
        const _slideUnsubs = new Map();

        let _current = 0;
        let _running = false;
        let _myTempId = null;
        /**
         * Latent playback (MPI-571). This pane used to paint every frame the bus
         * handed it, the instant it arrived — so a burst previewer replayed the
         * whole clip at burst speed on EVERY sampler step and then froze on a
         * still until the next one. The shared player paces it at the rate the
         * clip announced and loops instead of freezing.
         *
         * It does NOT own the frames: `ownsFrames` stays false so a frame this
         * pane drops can never be one another surface is still looping. A flow
         * run mounts no gallery placeholder (MPI-306), so in practice nothing
         * else holds these — but the default is the safe one.
         */
        const _previewPlayer = createPreviewClipPlayer({
            paint: (url) => _paintResult(url, { blurring: true }),
        });
        let _hasPending = false;
        /**
         * The last completed result, held so it survives step navigation.
         *
         * `_hasPending` (the "Saved to your gallery" note) already outlived a slide
         * rebuild, but the IMAGE did not — _teardownSlide() drops the DOM and nulls
         * the pane refs, and nothing kept the items to repaint from, so the pane came
         * back claiming a save with nothing on screen. Component-scoped ON PURPOSE:
         * it lives until the flow closes and is deliberately not persisted to state.
         * @type {Array<Object>|null}
         */
        let _lastResults = null;
        /** Last status-line copy, replayed when the run slide is rebuilt. */
        let _statusText = '';
        let _runBtn = null;
        let _resultMediaEl = null;
        let _resultEmptyEl = null;
        let _resultFrameEl = null;
        /** Pan/zoom state for the result pane — the shared MpiCanvas view model. */
        const _resultView = new ViewManager();
        let _statusEl = null;
        let _pendingNote = null;
        let _gaugeEl = null;

        /** Total steps = implicit inputs + declared middle steps + implicit run. */
        const _stepCount = () => middleSteps.length + 2;
        const _lastIndex = () => _stepCount() - 1;

        /**
         * The media item a middle step operates on, resolved by ROLE — the same
         * vocabulary the op's mediaInputs uses, so a step needs no new mapping.
         * @param {string} role
         * @returns {Object|null}
         */
        function _mediaForRole(role) {
            for (const entry of _mediaGroups) {
                const hit = entry.items.find(it => it.role === role);
                if (hit) return hit;
            }
            return null;
        }

        // ── Ticker ──────────────────────────────────────────────────────────────
        /** Labels: 01 Inputs · 02 <declared title> · … · NN Generate. */
        function _tickerLabels() {
            return [
                'Inputs',
                ...middleSteps.map((s, i) => s.tickerLabel || s.title || `Step ${i + 1}`),
                'Generate',
            ];
        }

        function _buildTicker() {
            tickerEl.innerHTML = '';
            _tickerLabels().forEach((label, i) => {
                const btn = ce('button', { className: 'mpi-base-flow__tick', type: 'button' });
                const num = ce('span', { className: 'mpi-base-flow__tick-num' });
                num.textContent = String(i + 1).padStart(2, '0');
                const text = ce('span');
                text.textContent = label;
                btn.appendChild(num);
                btn.appendChild(text);
                // The ticker NAVIGATES. A row that indicates but refuses clicks reads
                // as disabled, not informational (carousel-frame.md).
                _unsubs.push(on(btn, 'click', () => _goTo(i)));
                tickerEl.appendChild(btn);
            });
        }

        function _syncChrome() {
            const last = _lastIndex();
            prevBtn.disabled = _current === 0;
            nextBtn.disabled = _current === last;
            Array.from(tickerEl.children).forEach((tick, i) => {
                const st = i === _current ? 'active' : (i < _current ? 'done' : 'todo');
                tick.setAttribute('data-state', st);
                tick.setAttribute('aria-current', i === _current ? 'step' : 'false');
            });
        }

        // ── Slot rendering ──────────────────────────────────────────────────────
        /**
         * Render one media slot. THE SLOT IS A PLACEHOLDER, NOT A CONTAINER:
         * empty = bordered box + icon; FILLED = the image IS the box (width/height
         * auto, no background, border hugging the image at ITS OWN aspect). No
         * crop, no letterbox padding. This is the rule most likely to be got wrong.
         *
         * @param {{group:Object, items:Array}} entry
         * @param {number} idx  slot index within the group
         * @param {Function} onDirty  re-render callback
         * @param {Array<Function>} unsubs  collector for this slide's listeners
         * @returns {HTMLElement}
         */
        function _buildSlot(entry, idx, onDirty, unsubs) {
            const { group, items } = entry;
            const item = items[idx] || null;

            const unit = ce('div', { className: 'mpi-base-flow__slot-unit' });
            const labelEl = ce('span', { className: 'mpi-base-flow__slot-label' });
            labelEl.textContent = _slotLabel(group, idx);
            unit.appendChild(labelEl);

            const slot = ce('div', {
                className: `mpi-base-flow__slot${item ? ' mpi-base-flow__slot--filled' : ''}`,
            });
            slot.setAttribute('tabindex', '0');
            slot.setAttribute('role', 'button');

            if (item) {
                if (group.type === 'image') {
                    slot.appendChild(ce('img', {
                        src: resolveMediaUrl(item.url),
                        alt: _slotLabel(group, idx),
                    }));
                } else if (group.type === 'video') {
                    // A filled video slot used to be a FILENAME, so the user could not
                    // see what they had picked. It loops silently instead — the clip is
                    // the only honest confirmation that the right take is in the slot.
                    slot.appendChild(ce('video', {
                        className: 'mpi-base-flow__slot-video',
                        src: resolveMediaUrl(item.url),
                        muted: true, loop: true, autoplay: true, playsInline: true,
                    }));
                } else {
                    const name = ce('span', { className: 'mpi-base-flow__slot-name' });
                    name.textContent = _mediaName(item.url);
                    slot.appendChild(name);
                }
                const clear = ce('button', {
                    className: 'mpi-base-flow__slot-clear', type: 'button', title: 'Remove',
                });
                clear.innerHTML = renderIcon('close', 'xs');
                unsubs.push(on(clear, 'click', (e) => {
                    e.stopPropagation();
                    // Clear THIS slot only — never splice, or every later image would
                    // shift up a slot and silently change role (and meaning).
                    delete entry.items[idx];
                    const freedRole = group.roles[idx];
                    // A removed image invalidates the step bound to that role.
                    if (freedRole) delete _stepValues[freedRole];
                    onDirty();
                }));
                slot.appendChild(clear);

                // A filled slot is still a picker button: clicking it reopens the
                // gallery to swap the take. Without this the only way to change a
                // slot was to clear it first, which reads as "destroy to edit".
                unsubs.push(on(slot, 'click', () => _openMediaPicker(entry, idx, onDirty)));
                unsubs.push(on(slot, 'keydown', (e) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                        e.preventDefault();
                        _openMediaPicker(entry, idx, onDirty);
                    }
                }));
            } else {
                const icon = ce('span', { className: 'mpi-base-flow__slot-icon' });
                icon.innerHTML = renderIcon('image', 'lg');
                const hint = ce('span', { className: 'mpi-base-flow__slot-hint' });
                hint.textContent = `Choose ${group.type}`;
                slot.appendChild(icon);
                slot.appendChild(hint);

                // ONE function: open the library. The slot used to be two targets in
                // one box — the box itself opened a file dialog, a Browse button
                // opened the picker — so the same click meant different things by a
                // few pixels. The picker now owns BOTH sources (its upload card is
                // the filesystem), so the box has exactly one job.
                unsubs.push(on(slot, 'click', () => _openMediaPicker(entry, idx, onDirty)));
                unsubs.push(on(slot, 'keydown', (e) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                        e.preventDefault();
                        _openMediaPicker(entry, idx, onDirty);
                    }
                }));
                unsubs.push(on(slot, 'dragover', (e) => {
                    e.preventDefault();
                    slot.classList.add('mpi-base-flow__slot--dragover');
                }));
                unsubs.push(on(slot, 'dragleave', () => {
                    slot.classList.remove('mpi-base-flow__slot--dragover');
                }));
                unsubs.push(on(slot, 'drop', async (e) => {
                    e.preventDefault();
                    slot.classList.remove('mpi-base-flow__slot--dragover');
                    const files = Array.from(e.dataTransfer?.files || [])
                        .filter(f => f.type.startsWith(group.type + '/'));
                    await _handleFiles(entry, idx, files, onDirty);
                }));
            }

            unit.appendChild(slot);
            return unit;
        }

        /**
         * Open the project-media picker for one slot and fill it with the pick.
         *
         * No _placePreviewAsset here, deliberately: picked media is ALREADY in the
         * project and already on disk, so there is nothing to hash, copy or place —
         * the slot just takes its path. `source: 'flow-project'` distinguishes it
         * from an imported file ('flow-upload') for anything later reading the
         * persisted input snapshot.
         *
         * @param {Object} entry     the media group entry owning this slot
         * @param {number} idx       slot index within the group
         * @param {Function} onDirty re-render callback
         */
        function _openMediaPicker(entry, idx, onDirty) {
            const picker = MpiMediaPicker.mount(document.createElement('div'), {
                mediaType: entry.group.type,
                onPick: ({ filePath }) => {
                    entry.items[idx] = {
                        url: filePath,
                        mediaType: entry.group.type,
                        source: 'flow-project',
                        role: entry.group.roles[idx],
                    };
                    onDirty();
                },
                // The picker's second source. It routes into the SAME _handleFiles as
                // the slot's own input, so an imported file is placed, hashed and
                // deduped identically no matter which surface the user reached it from.
                onImport: (files) => {
                    _handleFiles(entry, idx, files, onDirty).catch((err) => {
                        clientLogger.error('MpiBaseFlow', `flow media import failed: ${err?.message || err}`);
                    });
                },
            });
            // onDirty rebuilds the slide, which destroys this slide's listeners —
            // the picker portals to document.body so it survives that, and tears
            // itself down on hide rather than riding the slide's unsubs.
            picker.el.addEventListener('pick', () => picker.el.destroy?.());
            picker.el.addEventListener('cancel', () => picker.el.destroy?.());
            picker.el.show();
        }

        /**
         * Place one dropped file into the project's content-addressed preview-assets
         * store and return its /project-file URL (or null on failure). Mirrors the
         * server's placeContentAsset (dedup by sha256); no gallery card is created.
         * @param {File} file
         * @param {string} mediaType  'image'|'video'|'audio'
         * @param {{folderPath:string,id:string}} project
         * @returns {Promise<string|null>}
         */
        async function _placePreviewAsset(file, mediaType, project) {
            try {
                const dataUrl = await new Promise((resolve, reject) => {
                    const r = new FileReader();
                    r.onload = () => resolve(/** @type {string} */ (r.result));
                    r.onerror = reject;
                    r.readAsDataURL(file);
                });
                const ext = '.' + (file.name.split('.').pop()
                    || (mediaType === 'image' ? 'png' : mediaType === 'video' ? 'mp4' : 'wav'));
                const res = await fetch(
                    `/project-media/${project.id}/place-preview-asset?folderPath=${encodeURIComponent(project.folderPath)}`,
                    {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ dataUrl, ext }),
                    },
                );
                if (!res.ok) throw new Error(`place failed: ${res.status}`);
                const data = await res.json();
                return data?.success ? data.filePath : null;
            } catch (e) {
                clientLogger.warn('MpiBaseFlow', 'preview-asset place failed', e);
                return null;
            }
        }

        /**
         * Upload one or more files into a media group, starting AT a given slot.
         *
         * SLOTS ARE ADDRESSABLE, NOT A PACKED LIST. Dropping into "Face Reference"
         * while "Original" is empty must fill Face Reference — the user picks the
         * slot, and whichever image they happened to find first is their business.
         * Filling by `items.length` (the old behaviour) silently promoted a drop on
         * slot 2 into slot 1, which for Head Swap meant the reference image became
         * the target and the swap ran backwards.
         *
         * A gap is therefore legal: `items` is sparse, indexed BY SLOT, and each
         * item's role is its slot's role — never its position in a packed array.
         *
         * @param {{group,items}} entry
         * @param {number} startIdx  slot index the user dropped on
         * @param {File[]} files
         * @param {Function} onDirty
         */
        async function _handleFiles(entry, startIdx, files, onDirty) {
            const { group } = entry;
            if (files.length === 0) return;

            // Multi-file drop fills THIS slot then any later free ones; it never
            // walks backwards over slots the user deliberately left empty.
            //
            // startIdx is always a target even when OCCUPIED: the user aimed at that
            // slot (dropped on it, or reopened the picker from it), so replacing what
            // is there is the intent. Skipping it would silently divert the file to a
            // later slot — or drop it entirely on a single-slot Flow like foley.
            const targets = [];
            for (let i = startIdx; i < group.max && targets.length < files.length; i++) {
                if (i === startIdx || !entry.items[i]) targets.push(i);
            }
            if (files.length > targets.length) {
                clientLogger.warn('MpiBaseFlow', `dropped ${files.length} ${group.type}(s) but only ${targets.length} slot(s) free from slot ${startIdx} — ignoring extras`);
                files = files.slice(0, targets.length);
            }

            const project = state.currentProject;
            if (!project?.folderPath || !project?.id) {
                Events.emit('ui:warning', { message: 'Open a project first.' });
                return;
            }

            for (let i = 0; i < files.length; i++) {
                // Flow inputs go into the content-addressed preview-assets store (MPI-227),
                // NOT the visible gallery — keeps the gallery clean while persisting the
                // file durably so a later Reuse can resolve it. Deduped by content hash.
                const placedUrl = await _placePreviewAsset(files[i], group.type, project);
                if (!placedUrl) {
                    Events.emit('ui:warning', { message: `Could not add ${group.type} file.` });
                    continue;
                }
                const slotIdx = targets[i];
                entry.items[slotIdx] = {
                    url: placedUrl,
                    mediaType: group.type,
                    source: 'flow-upload',
                    role: group.roles[slotIdx],
                };
            }
            onDirty();
        }

        // ── Declared fields (frame-rendered) ───────────────────────
        // `buildField` lives in js/utils/declaredFields.js (MPI-580) because a plugin
        // contributing controls to the History Upscale dropdown speaks this same
        // vocabulary, and the same capabilities are being duplicated as Flows. One
        // renderer, or the two surfaces drift the way MPI-572's two surfaces did.
        // `block` defaults to this component's, so nothing here restyles.
        const _buildField = (f, cur, onChange, unsubs) =>
            buildField(f, cur, onChange, unsubs, { namespace: flow.id });

        // ── Enhance: a declared ACTION on a button field (MPI-504) ─────────────
        /**
         * Every enhance action this flow declares, wherever it was declared. One
         * declaration carries all three behaviours — it fills `to`, editing `from`
         * clears `to`, and the button reports which of those is true — so the three
         * can never disagree the way three separate flags would.
         * @type {Array<Object>}
         */
        const _enhanceDecls = [
            ...(_fields || []),
            ...(flow.steps || []).flatMap(st => st?.fields || []),
        ].filter(f => f?.action === 'enhance' && f.from && f.to);

        /**
         * Field wrappers currently in the DOM, keyed by field id. Cleared on every
         * slide rebuild. A field declared on two surfaces (the prompt step AND the
         * run slide) is one VALUE but two nodes over the flow's life — only the
         * mounted one is in here, which is exactly what "write it back where the
         * user can see it" needs.
         * @type {Map<string, HTMLElement>}
         */
        const _liveFields = new Map();

        /** Field id of the enhance in flight, or null. */
        let _enhancing = null;

        /** Push a value into a mounted text field, so a programmatic write shows. */
        function _writeFieldValue(id, text) {
            const wrap = _liveFields.get(id);
            if (!wrap) return;
            const inp = qs('.mpi-base-flow__field-text', wrap);
            if (inp) inp.value = text;
        }

        /**
         * Repaint every mounted enhance button. STALE means "the current prompt is
         * not enhanced" — on the run slide the enhanced prompt is NOT SHOWN, so the
         * button is the only place that can be said (plan.md § The prompt UI, rule
         * 3). Same signal on both surfaces: one thing, learned once.
         *
         * The button is an MpiButton, so its state is the primitive's own API and
         * its own variants — no bespoke `--stale` class, no restated colours.
         */
        function _paintEnhance() {
            _enhanceDecls.forEach((d) => {
                const wrap = _liveFields.get(d.id);
                if (!wrap) return;
                const btn = qs('.mpi-base-flow__field-button', wrap);
                if (!btn) return;
                const busy = _enhancing === d.id;
                const stale = !String(_fieldValues[d.to] || '').trim();
                // Heat while the prompt is NOT enhanced: that is the actionable
                // state, so it is the loud one, and it is the same pink as Generate.
                // Surface once it is enhanced — the work is done, the button is no
                // longer the point. Both hover on BACKGROUND, like the rest of the
                // app; only one variant class is ever present at a time, which
                // matters because `--secondary` is declared after `--primary`.
                btn.classList.toggle('mpi-btn--primary', stale);
                btn.classList.toggle('mpi-btn--secondary', !stale);
                btn.setDisabled?.(!!_enhancing);
                btn.setLabel?.(busy ? 'Enhancing…' : (d.label || 'Enhance'));
            });
        }

        /**
         * Run the declared enhancer op on `from` and write its text into `to`.
         *
         * A TEXT op (`outputKind: 'text'`), so it ends with no history item and
         * reports through `onText` — the same path Describe Image uses. Enhance is
         * the ONLY writer of `to`: Generate never enhances on its own, and an
         * untouched `to` means the raw prompt is what runs (see `_collectInputs`).
         *
         * @param {Object} d  the enhance field declaration
         */
        function _runEnhance(d) {
            if (_enhancing) return;
            const source = String(_fieldValues[d.from] || '').trim();
            if (!source) {
                Events.emit('ui:warning', { message: 'Write a prompt first, then Enhance.' });
                return;
            }
            // The op is a separate registration from the flow's own; a flow shipped
            // ahead of it would otherwise fail deep inside the queue.
            if (!getCommand(d.op)) {
                clientLogger.warn('MpiBaseFlow', `enhance field "${d.id}" names unregistered op "${d.op}"`);
                Events.emit('ui:warning', { message: 'The prompt enhancer is not available in this build.' });
                return;
            }
            const done = () => { _enhancing = null; _paintEnhance(); };
            _enhancing = d.id;
            _paintEnhance();
            enqueueGeneration(
                {
                    operation: d.op,
                    model: { id: d.model || null, mediaType: 'image' },
                    positive: source,
                    negative: '',
                    // The enhancer seed is DRIVEN, never a user field, and never
                    // stored: step 3's loop is Enhance → Generate → Enhance, and a
                    // fixed seed returns the same phrase on every press. What the
                    // sidecar keeps is the enhanced TEXT, which is why storing the
                    // seed as well was considered and rejected.
                    injectionParams: { Input_Seed: Math.floor(Math.random() * 2 ** 31) },
                },
                {
                    // A text op never fires onComplete — GenerationCallbacks.onText.
                    onText: (text) => {
                        const out = String(text || '').trim();
                        if (out) {
                            _fieldValues[d.to] = out;
                            _writeFieldValue(d.to, out);
                        }
                        done();
                    },
                    onError: (err) => {
                        done();
                        clientLogger.error('MpiBaseFlow', 'prompt enhance failed', err);
                    },
                    onCancel: done,
                },
                { scope: 'gallery' },
            );
        }

        /**
         * Write one FLOW-level field value. Used by the run slide and by a `fields`
         * step alike — that shared store is what makes the prompt a single value
         * edited from two places.
         */
        function _setFlowField(id, val) {
            _fieldValues[id] = val;
            // Editing the source prompt DISCARDS the enhancement: the enhanced text
            // was written for the old wording, so keeping it would generate from a
            // description the user just changed. Visible immediately where the
            // enhanced box is shown; signalled by the button where it is not.
            _enhanceDecls.forEach((d) => {
                if (d.from !== id || !_fieldValues[d.to]) return;
                _fieldValues[d.to] = '';
                _writeFieldValue(d.to, '');
            });
            _paintEnhance();
        }

        /** onChange for a flow-level field: an `action` runs, everything else stores. */
        function _onFlowField(f, val) {
            if (f.action === 'enhance') { _runEnhance(f); return; }
            _setFlowField(f.id, val);
        }

        /**
         * Render flow-level declared fields as a stacked column. Both surfaces that
         * carry them use this — the run slide's control column and a `fields` step —
         * so they cannot drift into two dialects.
         *
         * @param {Array<Object>} fields
         * @param {Array<Function>} unsubs
         * @returns {HTMLElement}
         */
        function _buildFlowFields(fields, unsubs) {
            const stack = ce('div', {
                className: 'mpi-base-flow__fields mpi-base-flow__fields--stacked',
            });
            fields.forEach((f) => {
                const node = _buildField(
                    f,
                    _fieldValues[f.id] ?? f.default,
                    (val) => _onFlowField(f, val),
                    unsubs,
                );
                if (!node) return;
                _liveFields.set(f.id, node);
                stack.appendChild(node);
            });
            return stack;
        }

        /**
         * Render a step's declared `fields` as a single row between canvas and hint.
         * THE FRAME renders this, not the gizmo, so every gizmo's controls match for
         * free. Values ride in the step's reported value under `fields`.
         *
         * Hard cap: one row. No nesting, no panels, no accordions — a gizmo wanting
         * more is telling you the step should split in two.
         *
         * @param {Object} step
         * @param {Object} value  the step's current reported value
         * @param {Function} onFieldChange (fieldId, val) => void
         * @param {Array<Function>} unsubs
         * @returns {HTMLElement|null}
         */
        function _buildFieldsRow(step, value, onFieldChange, unsubs) {
            const fields = Array.isArray(step.fields) ? step.fields : [];
            if (!fields.length) return null;

            const row = ce('div', { className: 'mpi-base-flow__fields' });
            fields.forEach((f) => {
                const node = _buildField(
                    f,
                    value?.fields?.[f.id] ?? f.default,
                    (val) => onFieldChange(f.id, val),
                    unsubs,
                );
                if (node) row.appendChild(node);
            });
            return row;
        }

        // ── Slide builders ──────────────────────────────────────────────────────
        /** STEP 0 — media slots (left) + what this flow does (right). Divided. */
        function _buildInputsSlide(unsubs) {
            const split = ce('div', { className: 'mpi-base-flow__split' });

            const left = ce('div', { className: 'mpi-base-flow__col-left' });
            if (_mediaGroups.length === 0) {
                const none = ce('p', { className: 'mpi-base-flow__no-inputs' });
                none.textContent = 'This flow needs no input media.';
                left.appendChild(none);
            }
            _mediaGroups.forEach((entry) => {
                for (let i = 0; i < entry.group.max; i++) {
                    left.appendChild(_buildSlot(entry, i, () => _renderSlide(), unsubs));
                }
            });

            const divider = ce('div', { className: 'mpi-base-flow__divider' });

            const right = ce('div', { className: 'mpi-base-flow__col-right' });
            const title = ce('h1', { className: 'mpi-base-flow__flow-title' });
            title.textContent = flow.title || 'Flow';
            right.appendChild(title);
            if (flow.preview) {
                const frame = ce('div', { className: 'mpi-base-flow__example' });
                // Same path the Flow Library uses for these descriptor fields.
                const still = ce('img', {
                    src: `comfy_workflows/display/${flow.preview}`, alt: '', loading: 'lazy',
                });
                // A flow's HERO is the wide autoplaying loop (`video`), NOT the 4/5 still the
                // tile shows — the still is only its poster and its fallback. The tile stays an
                // image either way (MpiFlowLibrary passes media:'image'), so a flow declaring
                // `video` does NOT become a video tile the way a ModelDef would.
                if (flow.video) {
                    const clip = ce('video', {
                        src: `comfy_workflows/display/${flow.video}`,
                        poster: `comfy_workflows/display/${flow.preview}`,
                    });
                    // Properties, not attributes — `muted` set as an attribute does not
                    // reliably satisfy the autoplay policy (same reason MpiTileSheet does this).
                    clip.muted = true; clip.loop = true; clip.playsInline = true;
                    clip.autoplay = true; clip.preload = 'auto';
                    // The explicit play() is what MpiModelManager's detail thumb does too —
                    // the autoplay attribute alone is not reliable once the element is
                    // appended after load. Rejection is fine to swallow: the poster shows.
                    unsubs.push(on(clip, 'loadedmetadata', () => { clip.play().catch(() => {}); }));
                    // A missing or broken clip must not leave a black box where the hero is.
                    unsubs.push(on(clip, 'error', () => {
                        clip.remove();
                        frame.appendChild(still);
                    }));
                    frame.appendChild(clip);
                } else {
                    frame.appendChild(still);
                }
                right.appendChild(frame);
            }
            const explainer = ce('div', { className: 'mpi-base-flow__explainer' });
            const p = ce('p');
            p.textContent = flow.description || '';
            explainer.appendChild(p);
            right.appendChild(explainer);

            split.appendChild(left);
            split.appendChild(divider);
            split.appendChild(right);
            return split;
        }

        /**
         * MIDDLE STEP — bounded centred canvas, title above, optional fields row,
         * guidance below. NO divider, NO annotation column: undivided = working.
         */
        function _buildStepSlide(step, stepIdx, unsubs) {
            const work = ce('div', { className: 'mpi-base-flow__work' });

            const title = ce('h2', { className: 'mpi-base-flow__work-title' });
            title.textContent = step.title || '';
            work.appendChild(title);

            // A FRAME-NATIVE step (stepKinds.js § FRAME_KINDS) has no gizmo and no
            // media role — its declared fields ARE the work, stacked where the
            // canvas would be. Returning early keeps the media guard below from
            // demanding an image a prompt-only flow never had a slot for.
            if (isFrameKind(step.kind)) {
                const stack = _buildFlowFields(
                    Array.isArray(step.fields) ? step.fields : [], unsubs,
                );
                stack.classList.add('mpi-base-flow__fields--work');
                work.appendChild(stack);
                if (step.hint) {
                    const hint = ce('p', { className: 'mpi-base-flow__work-hint' });
                    hint.textContent = step.hint;
                    work.appendChild(hint);
                }
                _paintEnhance();
                return work;
            }

            const media = _mediaForRole(step.role);
            const canvas = ce('div', { className: 'mpi-base-flow__canvas' });

            if (!media) {
                // No media for this role yet — say so plainly and send them back.
                const empty = ce('p', { className: 'mpi-base-flow__canvas-empty' });
                empty.textContent = 'Add the image for this step on the first step.';
                canvas.appendChild(empty);
                work.appendChild(canvas);
            } else {
                const Kind = getStepKind(step.kind);
                const host = ce('div');
                canvas.appendChild(host);
                work.appendChild(canvas);

                const inst = Kind.mount(host, {
                    media,
                    step,
                    value: _stepValues[step.role] || null,
                    onChange: (val) => {
                        // Preserve frame-owned fields across gizmo reports.
                        const prev = _stepValues[step.role] || {};
                        _stepValues[step.role] = { ...prev, ...val };
                    },
                });
                _stepInstances.set(stepIdx, inst);
            }

            // Fields are FRAME-OWNED and declaration-driven: they render whenever
            // the step declares them, with or without a live gizmo. Building them
            // inside the media branch would make a frame-level contract depend on
            // a gizmo's existence.
            const fieldsRow = _buildFieldsRow(
                step,
                _stepValues[step.role],
                (fieldId, val) => {
                    const prev = _stepValues[step.role] || {};
                    _stepValues[step.role] = {
                        ...prev,
                        fields: { ...(prev.fields || {}), [fieldId]: val },
                    };
                    // Let the gizmo react if it cares (e.g. a ratio lock).
                    _stepInstances.get(stepIdx)?.el?.onField?.(fieldId, val);
                },
                unsubs,
            );
            if (fieldsRow) work.appendChild(fieldsRow);

            if (step.hint) {
                const hint = ce('p', { className: 'mpi-base-flow__work-hint' });
                hint.textContent = step.hint;
                work.appendChild(hint);
            }
            return work;
        }

        /** LAST STEP — controls + Generate (left) │ result (right). Divided. */
        function _buildRunSlide(unsubs) {
            const split = ce('div', { className: 'mpi-base-flow__split' });

            const left = ce('div', { className: 'mpi-base-flow__col-left' });
            const controls = ce('div', { className: 'mpi-base-flow__controls' });

            // Per-flow controls (composition) mount here — the flow's own knobs.
            const contentSlot = ce('div', { className: 'mpi-base-flow__content' });
            controls.appendChild(contentSlot);

            // Flow-level declared fields (MPI-531) — stacked, because this column is
            // 236px of vertical stack, not the step row's one-row cap.
            if (_fields.length) {
                contentSlot.appendChild(_buildFlowFields(_fields, unsubs));
                _paintEnhance();
            }

            const genWrap = ce('div', { className: 'mpi-base-flow__gen' });
            const runHost = ce('div');
            genWrap.appendChild(runHost);
            _gaugeEl = ce('div', { className: 'mpi-base-flow__gauge' });
            _gaugeEl.appendChild(ce('span'));
            genWrap.appendChild(_gaugeEl);
            _statusEl = ce('div', { className: 'mpi-base-flow__status' });
            genWrap.appendChild(_statusEl);
            controls.appendChild(genWrap);
            left.appendChild(controls);

            const divider = ce('div', { className: 'mpi-base-flow__divider' });

            const right = ce('div', { className: 'mpi-base-flow__col-right' });
            const pane = ce('div', { className: 'mpi-base-flow__result' });
            const frame = ce('div', { className: 'mpi-base-flow__result-frame' });
            _resultFrameEl = frame;
            _resultMediaEl = ce('div', { className: 'mpi-base-flow__result-media' });
            frame.appendChild(_resultMediaEl);
            _bindResultView(frame, unsubs);
            // Empty-state copy: an unexplained blank frame reads as broken.
            _resultEmptyEl = ce('div', { className: 'mpi-base-flow__result-empty' });
            // The line break needs `white-space: pre-line` on the class (plain
            // textContent newlines collapse like any HTML whitespace). No spaces
            // around the \n, or they render as indentation on the second line.
            _resultEmptyEl.textContent = 'Your result appears here.';
            frame.appendChild(_resultEmptyEl);
            pane.appendChild(frame);

            // A finished result is ALREADY in the gallery — this reports that, it is
            // not an action. Apply was built (MPI-306 Phase 3) and removed after the
            // UX pass: a commit step the user never wanted to skip is pure friction.
            _pendingNote = ce('span', { className: 'mpi-base-flow__pending' });
            _pendingNote.textContent = 'Saved to your gallery';
            _pendingNote.hidden = true;
            pane.appendChild(_pendingNote);

            right.appendChild(pane);

            split.appendChild(left);
            split.appendChild(divider);
            split.appendChild(right);

            // Mount children AFTER the tree exists (mount() replaces innerHTML).
            _runBtn = MpiButton.mount(runHost, { text: 'Generate', variant: 'primary', size: 'md' });
            _runBtn.on('click', () => { if (_running) _cancel(); else _run(); });

            unsubs.push(() => { _runBtn?.el?.destroy?.(); });

            _syncRunUi();
            _paintPending();
            // Replay the last result: navigating away and back rebuilds this slide
            // from scratch, and without this the pane came back empty while the
            // "Saved to your gallery" note still showed — claiming a result the user
            // could no longer see. remember:false so replaying is not itself
            // recorded as a new result.
            if (_lastResults) _showResults(_lastResults, { remember: false });
            // The status line is rebuilt too, so restore its copy from the last
            // known state rather than re-deriving it (which would turn an
            // "Applied…" line back into "Done…" on the next navigation).
            if (_statusEl && _statusText) _statusEl.textContent = _statusText;
            return split;
        }

        // ── Slide switching ─────────────────────────────────────────────────────
        /** Tear down the live slide (gizmos + listeners) before building the next. */
        function _teardownSlide() {
            _stepInstances.forEach(inst => inst?.el?.destroy?.());
            _stepInstances.clear();
            _slideUnsubs.forEach(list => list.forEach(fn => fn?.()));
            _slideUnsubs.clear();
            // Field nodes die with the slide; the VALUES live on in _fieldValues.
            // Keeping the map would leave `_writeFieldValue` writing into detached
            // nodes — a cleared enhancement that silently never cleared.
            _liveFields.clear();
            // These live on the run slide only; drop the stale references.
            _runBtn = null; _resultMediaEl = null; _statusEl = null;
            _pendingNote = null; _gaugeEl = null;
            _resultFrameEl = null;
        }

        /** Build and show the current step. One slide is live at a time. */
        function _renderSlide() {
            _teardownSlide();
            const unsubs = [];
            _slideUnsubs.set(_current, unsubs);

            const slide = ce('div', { className: 'mpi-base-flow__slide' });
            if (_current === 0) {
                slide.appendChild(_buildInputsSlide(unsubs));
            } else if (_current === _lastIndex()) {
                slide.appendChild(_buildRunSlide(unsubs));
            } else {
                const idx = _current - 1;
                slide.appendChild(_buildStepSlide(middleSteps[idx], idx, unsubs));
            }

            slidesEl.innerHTML = '';
            slidesEl.appendChild(slide);
            // Next frame → the opacity transition actually runs.
            requestAnimationFrame(() => slide.setAttribute('data-active', 'true'));
            _syncChrome();
        }

        /**
         * Navigate. MID-RUN NAVIGATION IS ALLOWED — the run keeps going; blocking
         * the arrows during a full-quality run is a cage.
         * @param {number} i
         */
        function _goTo(i) {
            const next = Math.max(0, Math.min(i, _lastIndex()));
            if (next === _current) return;
            _current = next;
            _renderSlide();
        }

        // Arrows + the ticker are the navigation. No arrow-key hotkey: it would
        // need new hotkeyRegistry ids AND would fight the box gizmo's drag on a
        // middle step. Add it only if the flow proves it wants one.
        _unsubs.push(on(prevBtn, 'click', () => _goTo(_current - 1)));
        _unsubs.push(on(nextBtn, 'click', () => _goTo(_current + 1)));

        // ── Result painting ─────────────────────────────────────────────────────
        /** Show the empty-state copy only while the pane holds nothing. */
        function _syncResultEmpty() {
            // Hidden while a run is in flight too: between Generate and the first
            // latent the pane holds no media yet, and leaving the copy up would put
            // "Your result appears here." under the scanline — the frame claiming
            // nothing is happening while it sweeps.
            if (_resultEmptyEl) _resultEmptyEl.hidden = !!_resultMediaEl?.firstChild || _running;
        }

        // ── Result zoom / pan ───────────────────────────────────────────────────
        // NOT a new interaction — the same ViewManager model History, the video
        // viewer and the masked preview already use, adopted on one more surface so
        // a result can be evaluated close up.
        //
        // THE VIEW RESETS ON EVERY NEW IMAGE, deliberately. A latent here is often a
        // localized crop while the final is a different resolution, so carrying a
        // zoom across them would land the user somewhere meaningless.

        /**
         * Fit once the media has real dimensions. A cached image can be `complete`
         * before the load handler is attached, in which case `load` never fires and
         * the image would render unscaled at natural size, overflowing the frame.
         * @param {HTMLImageElement|HTMLVideoElement} media
         */
        function _fitWhenReady(media) {
            const isVideo = media.tagName === 'VIDEO';
            const ready = isVideo ? media.readyState >= 1 : (media.complete && media.naturalWidth);
            if (ready) { _fitResultView(); return; }
            on(media, isVideo ? 'loadedmetadata' : 'load', _fitResultView);
        }

        /** Fit the current media to the frame and paint the transform. */
        function _fitResultView() {
            const media = _resultMediaEl?.firstElementChild;
            if (!media || !_resultFrameEl) return;
            const rect = _resultFrameEl.getBoundingClientRect();
            const w = media.naturalWidth || media.videoWidth || media.clientWidth;
            const h = media.naturalHeight || media.videoHeight || media.clientHeight;
            if (!rect.width || !rect.height || !w || !h) return;
            _resultView.isManagedView = true;
            _resultView.refit(rect.width, rect.height, w, h);
            _applyResultTransform();
        }

        function _applyResultTransform() {
            if (!_resultMediaEl) return;
            _resultMediaEl.style.transform = _resultView.getCSSTransform();
            _resultMediaEl.dataset.zoomMode =
                (_resultView.scale || 1) >= AUTO_PIXEL_THRESHOLD ? 'pixel' : 'smooth';
        }

        /** Wire wheel-zoom-at-cursor, drag-pan and dblclick-to-fit onto the frame. */
        function _bindResultView(frame, unsubs) {
            unsubs.push(on(frame, 'wheel', (e) => {
                if (!_resultMediaEl?.firstChild) return;
                e.preventDefault();
                const rect = frame.getBoundingClientRect();
                const mx = e.clientX - rect.left;
                const my = e.clientY - rect.top;
                const delta = e.deltaY < 0 ? 1.1 : 1 / 1.1;
                const next = Math.min(_resultView.maxScale,
                    Math.max(_resultView.minScale, _resultView.scale * delta));
                _resultView.offsetX = mx - (mx - _resultView.offsetX) * (next / _resultView.scale);
                _resultView.offsetY = my - (my - _resultView.offsetY) * (next / _resultView.scale);
                _resultView.scale = next;
                _resultView.isManagedView = false;
                _applyResultTransform();
            }, { passive: false }));

            let panning = false, startX = 0, startY = 0;
            unsubs.push(on(frame, 'mousedown', (e) => {
                if (e.button !== 0 && e.button !== 1) return;
                if (!_resultMediaEl?.firstChild) return;
                // Suppress the browser's native image drag: without it the pane
                // hands the user a drag ghost offering to drop the image somewhere
                // else, which is not a thing this pane does.
                e.preventDefault();
                panning = true;
                startX = e.clientX - _resultView.offsetX;
                startY = e.clientY - _resultView.offsetY;
                frame.style.cursor = 'move';
            }));
            // Belt and braces for the ghost — `draggable` is an attribute the
            // preventDefault above cannot reach on images added later.
            unsubs.push(on(frame, 'dragstart', (e) => e.preventDefault()));

            // Also on the window: a pan that leaves the frame should keep tracking
            // the cursor rather than freezing at the edge.
            unsubs.push(on(window, 'mousemove', (e) => {
                if (!panning) return;
                _resultView.offsetX = e.clientX - startX;
                _resultView.offsetY = e.clientY - startY;
                _resultView.isManagedView = false;
                _applyResultTransform();
            }));
            const endPan = () => { if (panning) { panning = false; frame.style.cursor = ''; } };
            // Listen on the WINDOW, not the frame: releasing outside the frame
            // otherwise never ends the pan, so the next mouse-over the pane
            // resumed dragging and the user had to click to break out of it.
            // mouseleave is deliberately NOT an end — dragging out and back is
            // normal panning, and ending there is what made the pane feel sticky.
            unsubs.push(on(window, 'mouseup', endPan));
            unsubs.push(on(window, 'blur', endPan));
            // Double-click restores fit — the same escape hatch MpiCanvas gives.
            unsubs.push(on(frame, 'dblclick', _fitResultView));

            const ro = new ResizeObserver(() => {
                if (_resultView.isManagedView) _fitResultView();
            });
            ro.observe(frame);
            unsubs.push(() => ro.disconnect());
        }

        /**
         * Show/hide the sweeping frost line. It sits on the FRAME (outside the
         * transformed media layer) so zooming does not drag it around.
         * @param {boolean} show
         */
        function _setScanline(show) {
            if (!_resultFrameEl) return;
            let line = qs('.mpi-base-flow__scanline', _resultFrameEl);
            if (show && !line) {
                line = ce('span', { className: 'mpi-base-flow__scanline' });
                _resultFrameEl.appendChild(line);
            } else if (!show && line) {
                line.remove();
            }
        }

        /** Paint a single URL (a live latent preview) into the result pane. */
        function _paintResult(url, { blurring = false } = {}) {
            if (!url || !_resultMediaEl) return;
            _resultMediaEl.innerHTML = '';
            const img = ce('img', { src: url, alt: 'result', draggable: false });
            // Live latents carry a light blur — honest about a half-computed image,
            // where a spinner over blank space is not. Kept subtle on purpose: at a
            // heavy radius a late, genuinely detailed latent is hidden behind the
            // same fog as the first noisy one, which is the opposite of informative.
            if (blurring) img.classList.add('mpi-base-flow__result-latent');
            _resultMediaEl.appendChild(img);
            _fitWhenReady(img);
            // The scanline lives on the FRAME, not the transformed media layer —
            // inside it, the sweep would zoom and pan along with the image instead
            // of tracking the viewport.
            _setScanline(true);
            _syncResultEmpty();
        }

        /**
         * Paint ALL final results (multi-output flows produce N items — MPI-259).
         *
         * @param {Object|Array<Object>} items
         * @param {{remember?: boolean}} [opts] remember:false replays what is already
         *   stored (a slide rebuild) rather than recording a new result.
         */
        function _showResults(items, { remember = true } = {}) {
            if (remember) _lastResults = items == null ? null : items;
            if (!_resultMediaEl) return;
            const list = (Array.isArray(items) ? items : [items]).filter(Boolean);
            const withPath = list.map(it => ({ it, path: it?.filePath || it?.url })).filter(x => x.path);
            // Always clear first: the pane may still hold a live-latent preview whose
            // blob: URL is revoked the moment the gen ends. Leaving it in the DOM logs
            // a GET blob:… ERR_FILE_NOT_FOUND.
            _resultMediaEl.innerHTML = '';
            // The run is over — the sweep now lives on the frame, so clearing the
            // media layer no longer takes it with it. Guarded on _running: a slide
            // REBUILD replays the last result through here, and mid-run that would
            // disarm a sweep the run still owns (_setRunning is the only arming
            // authority now).
            if (!_running) _setScanline(false);
            if (!withPath.length) { _syncResultEmpty(); return; }
            for (const { it, path } of withPath) {
                const url = resolveMediaUrl(path);
                const isVideo = it?.type === 'video' || it?.mediaType === 'video';
                // NOT muted: a Flow whose whole output is the audio (foley) played
                // silent until the user found the speaker button. `muted` is normally
                // the autoplay-policy guard, but this element never autoplays — the
                // user presses play — so it was guarding nothing and costing the
                // result. Do not re-add it without an `autoplay` to justify it.
                const media = isVideo
                    ? ce('video', { src: url, controls: true, loop: true })
                    : ce('img', { src: url, alt: 'result', draggable: false });
                // Fit the FINAL image once it has dimensions — a latent's view never
                // carries over (different crop, different resolution).
                _resultMediaEl.appendChild(media);
                _fitWhenReady(media);
            }
            _syncResultEmpty();
        }

        /**
         * Set the status line, remembering it so a slide rebuild can replay it.
         * @param {string} text
         */
        function _setStatus(text) {
            _statusText = text;
            if (_statusEl) _statusEl.textContent = text;
        }

        /** Show/hide the "Saved to your gallery" note. */
        function _paintPending() {
            if (_pendingNote) _pendingNote.hidden = !_hasPending;
        }

        /**
         * Generate → Cancel (during a run) → Generate again. THE COPY CHANGE IS THE
         * STATE SIGNAL — no spinner.
         */
        function _syncRunUi() {
            if (!_runBtn) return;
            const label = _running ? 'Cancel' : (_hasPending ? 'Generate again' : 'Generate');
            // MpiButton has no setText — its label is a span in the template.
            const textEl = qs('.mpi-btn__text', _runBtn.el);
            if (textEl) textEl.textContent = label;
            _runBtn.el.classList.toggle('mpi-base-flow__run--cancel', _running);
        }

        function _setGauge(pct) {
            const bar = _gaugeEl?.firstElementChild;
            if (bar) bar.style.width = `${Math.max(0, Math.min(100, pct))}%`;
        }

        // Live latents (MPI-271): resolve the frame to its generation by server-truth
        // promptId, and paint when it's OUR running job (tempId match). The run's clip
        // state rides along with EVERY frame (MPI-535) — re-read per frame, never
        // latched, because the marker that declares a run "clip" fires exactly once
        // and this pane may not have been mounted when it landed.
        _unsubs.push(Events.on('preview:frame', ({ promptId, url }) => {
            if (!_myTempId || !url) return;
            const entry = activeGenerations.byPromptId(promptId);
            if (entry?.tempId !== _myTempId) return;
            _previewPlayer.push(url, activeGenerations.getPreviewClip(entry.id));
        }));

        // A new sampler stage = a fresh preview window, so stages don't concatenate
        // into one growing loop. MPI-167.
        _unsubs.push(Events.on('generation:preview-reset', ({ id, clip }) => {
            if (!_myTempId) return;
            if (activeGenerations.get(id)?.tempId !== _myTempId) return;
            _previewPlayer.reset(clip);
        }));

        // ── Run ─────────────────────────────────────────────────────────────────
        function _setRunning(isRunning) {
            _running = isRunning;
            // The single choke point every end path (complete / error / cancel) goes
            // through, so stopping playback needs no separate call in each of them.
            // Without it the loop keeps repainting blobs the finished gen revoked.
            if (!isRunning) _previewPlayer.stop();
            // Arm the sweep the INSTANT the run starts, not on the first latent.
            // _paintResult also arms it, but the first latent can be tens of seconds
            // out (model load, VAE encode) and until then the slide showed nothing
            // moving while the status bar did — the frame reading as hung.
            // Every reset path (complete / error / cancel) routes through here, so
            // disarming needs no separate call.
            _setScanline(isRunning);
            _syncResultEmpty();
            _syncRunUi();
        }

        /** Collect the inputs the flow will run with. */
        function _collectInputs() {
            // filter(Boolean) — `items` is sparse (an empty slot is a hole), and a
            // hole must never reach the op as an undefined media item.
            const mediaItems = _mediaGroups.flatMap(entry => entry.items.filter(Boolean));
            // A declared field keyed `Input_*` names a GRAPH NODE, so it is an
            // injection param, not a run input — that prefix is the app-wide
            // injection naming law, not flow knowledge the frame should not hold.
            // Everything else (`positive`, `negative`) is a run input by its own id.
            const declared = {};
            const declaredParams = {};
            // A field may declare `mapTo` — a hidden range the UI never shows
            // (MPI-580). The stored value is always the DECLARED one, so a restored
            // control seeds correctly; the mapping is applied once, here.
            const _decls = new Map();
            [...(_fields || []), ...(flow.steps || []).flatMap(st => st?.fields || [])]
                .forEach(f => { if (f?.id) _decls.set(f.id, f); });
            const _sort = ([k, v]) => {
                const mapped = mapDeclaredValue(_decls.get(k) || {}, v);
                if (isInjectionParam(k)) declaredParams[k] = mapped; else declared[k] = mapped;
            };
            // A STEP's fields obey the same law as the flow's own — one vocabulary,
            // one renderer, so one destination. Without this a prompt authored on a
            // middle step reaches the op only nested inside `stepValues`, where the
            // op does not look, and the run silently uses the graph's baked default.
            // `stepValues` still carries them too: it is the persisted shape Reuse
            // restores from, so it stays raw and role-keyed.
            Object.values(_stepValues).forEach((v) => {
                Object.entries(v?.fields || {}).forEach(_sort);
            });
            // Flow-level last: a flow declaring the same id in both places means the
            // run slide's value is the one the user saw immediately before pressing
            // Generate.
            Object.entries(_fieldValues).forEach(_sort);

            // A step that declares `param` binds its GIZMO's value to an injection
            // param (MPI-572). The flow says which role feeds which node — that is
            // flow knowledge and stays declared — while the kind supplies the shape
            // the graph wants. Together they replace the one job a `uiComponent`
            // could do that a FlowDef could not say: `getInputs({ stepValues })`.
            // A null is OMITTED, so an unmarked step leaves the node on its baked
            // default, exactly as the old translation did.
            (flow.steps || []).forEach((step) => {
                if (!step?.param || !step.role) return;
                const v = stepValueToParam(step.kind, _stepValues[step.role]);
                if (v !== null) declaredParams[step.param] = v;
            });

            // No Enhance pressed → the RAW prompt is what runs. There is no silent
            // enhancement (plan.md § The prompt UI, rule 2), and the fallback is
            // derived from the enhance declaration rather than declared a second
            // time, so the pair can never be wired one-way.
            _enhanceDecls.forEach((d) => {
                const bin = isInjectionParam(d.to) ? declaredParams : declared;
                if (String(bin[d.to] || '').trim()) return;
                const src = isInjectionParam(d.from) ? declaredParams[d.from] : declared[d.from];
                if (String(src || '').trim()) bin[d.to] = src;
            });
            // A button is an ACTION, not a value — a click must not reach the op as
            // `enhance: true`.
            _decls.forEach((f, id) => {
                if (f?.type !== 'button') return;
                delete declared[id];
                delete declaredParams[id];
            });

            return {
                ...(mediaItems.length ? { mediaItems } : {}),
                ...(Object.keys(_stepValues).length ? { stepValues: { ..._stepValues } } : {}),
                ...declared,
                ...(Object.keys(declaredParams).length
                    ? { injectionParams: { ...declaredParams } }
                    : {}),
            };
        }

        const _run = () => {
            if (_running) return;

            const inputs = _collectInputs();
            const mediaItems = inputs.mediaItems || [];

            // Empty-run guard: a flow that declares media slots but has NONE filled
            // and no prompt has nothing to run — every branch self-gates → zero
            // outputs → a silent "no output returned". Media-free flows skip this.
            const hasPrompt = typeof inputs.positive === 'string' && inputs.positive.trim() !== '';
            if (_mediaGroups.length > 0 && mediaItems.length === 0 && !hasPrompt) {
                Events.emit('ui:warning', {
                    message: `${flow.title} needs at least one input before it can run.`,
                });
                return;
            }

            // Persist the input snapshot so Reuse/reopen restores media + controls.
            state.s_flowInputs = { ...state.s_flowInputs, [flow.id]: inputs };

            _setRunning(true);
            _hasPending = false;
            // Drop the previous result NOW: navigating away mid-run would otherwise
            // replay the last image over the top of the run in progress.
            _lastResults = null;
            _paintPending();
            _setGauge(0);
            _setStatus('Generating…');
            _myTempId = null;

            const res = submitFlowGeneration(flow, inputs, {
                onComplete: ({ item, items } = {}) => {
                    _setRunning(false);
                    _myTempId = null;
                    _setGauge(100);
                    // Already in the gallery — the run path commits on completion.
                    _setStatus('Done — saved to your gallery.');
                    _showResults(items || item);
                    _hasPending = true;
                    _paintPending();
                    _syncRunUi();
                },
                onError: () => {
                    _setRunning(false);
                    _myTempId = null;
                    _setGauge(0);
                    _showResults([]);   // drop the now-revoked live-latent preview
                    _setStatus('Generation failed.');
                },
                onCancel: () => {
                    _setRunning(false);
                    _myTempId = null;
                    _setGauge(0);
                    _showResults([]);   // drop the now-revoked live-latent preview
                    _setStatus('Cancelled.');
                },
            });
            // Guard aborted before enqueue (missing model / no media) → reset immediately.
            if (!res) { _setRunning(false); _setStatus(''); return; }
            _myTempId = res.tempId || null;
            // MPI-271: seed from the last-held latent so a pane opened mid-gen (or
            // during a frame gap) shows the current latent immediately, not blank.
            if (_myTempId) {
                const entry = activeGenerations.list().find(e => e.tempId === _myTempId);
                const last = entry && activeGenerations.getLastPreview(entry.id);
                if (last?.url) _paintResult(last.url, { blurring: true });
            }
        };

        /**
         * Cancel the in-flight run. No toast — a user action is self-evident.
         * activeGenerations.cancel() owns the whole path (exec.cancel → end →
         * generation:cancelled); the submit's onCancel resets this pane.
         */
        function _cancel() {
            if (!_running || !_myTempId) return;
            const entry = activeGenerations.list().find(e => e.tempId === _myTempId);
            if (entry) activeGenerations.cancel(entry.id);
        }

        // Ctrl+Enter runs the OPEN flow, not the PromptBox behind it.
        _unsubs.push(Hotkeys.bind('generation.run', _run));

        // ── Back to Library = close this overlay, reopen the Flow Library ────────
        _unsubs.push(on(qs('#flow-back', el), 'click', () => {
            el.close();
            Events.emit('flows:open');
        }));

        // ── Open / close ─────────────────────────────────────────────────────────
        // Closing with an unapplied result does NOT prompt (decided 2026-07-18):
        // with no Discard, a re-run overwrites and closing drops — nothing unique
        // is destroyed, so a confirm would guard a non-decision.
        el.open = () => { overlay.el.show(); };
        el.close = () => { overlay.el.hide(); };
        el.onOpen = el.open;

        el.destroy = () => {
            _teardownSlide();
            _previewPlayer.stop();
            _unsubs.forEach(fn => fn?.());
            overlay?.el?.destroy?.();
        };

        // ── Boot ────────────────────────────────────────────────────────────────
        _buildTicker();
        _renderSlide();
    },
});
