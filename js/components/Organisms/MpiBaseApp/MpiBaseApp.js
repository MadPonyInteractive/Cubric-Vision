import { ComponentFactory } from '../../factory.js';
import { MpiOverlay } from '../../Primitives/MpiOverlay/MpiOverlay.js';
import { MpiButton } from '../../Primitives/MpiButton/MpiButton.js';
import { Events } from '../../../events.js';
import { state, AUTO_PIXEL_THRESHOLD } from '../../../state.js';
import { ViewManager } from '../../Primitives/MpiCanvas/managers/ViewManager.js';
import { submitAppGeneration } from '../../../services/appService.js';
import { clientLogger } from '../../../services/clientLogger.js';
import { activeGenerations } from '../../../services/activeGenerations.js';
import { Hotkeys } from '../../../managers/hotkeyManager.js';
import { resolveMediaUrl } from '../../../utils/mediaActions.js';
import { qs, ce, on } from '../../../utils/dom.js';
import { renderIcon } from '/js/utils/icons.js';
import { getStepKind } from './stepKinds.js';

/**
 * MpiBaseApp — THE app frame: a step carousel (MPI-306 Phase 1).
 *
 * COMPOSITION, not inheritance (the MpiCompareOverlay/MpiModelManager precedent):
 * setup mounts a `main-area` MpiOverlay (covers #tool-container + #prompt-box-mount,
 * spares the sticky #shell-info-bar so the status bar + queue stay live).
 *
 * ── The shape ────────────────────────────────────────────────────────────────
 * Two zones split by a centre divider, but ONLY on the first and last step. That
 * absence is the signal: divided = you are supplying or reviewing; undivided =
 * you are working. Full design record + rationale:
 * docs/playbooks/add-app/ui/carousel-frame.md § The approved composition.
 *
 *   STEP 0 (implicit)   media slots (left)  │  what this app does (right)
 *   STEPS 1..N          declared middle steps — bounded centred canvas, no divider
 *   LAST STEP (implicit) controls + Generate │ result + Apply
 *
 * Step 0 and the last step are IMPLICIT — the frame renders them from the app's
 * `inputSchema` and its controls. An app with no middle steps declares `steps: []`
 * and gets a 2-step flow.
 *
 * ── Steps are DATA ───────────────────────────────────────────────────────────
 * An app declares `steps: [{ kind, role, title, hint, fields? }]` and writes NO
 * layout code. `kind` is a key into STEP_KINDS (stepKinds.js); each kind takes
 * `{ media, value, onChange, step }` and reports a value. The frame collects
 * `{ [role]: value }` into `stepValues` and merges it into the Run inputs. The
 * frame never learns what a gizmo does — that is what keeps a new gizmo to one
 * component + one registry line.
 *
 * Those step values are also HANDED TO the app's controls component
 * (`getInputs({ stepValues })`), because turning a role into a graph param is
 * app knowledge: Head Swap knows image1's box masks and image2's box crops, and
 * the frame must not.
 *
 * A step is NEVER invalid: every kind supplies a usable default, so the forward
 * arrow is never blocked. Required-because-the-flow-walks-you-there, not
 * required-because-Run-is-gated.
 *
 * DECLARED FIELDS: a step may declare `fields: [...]` — ONE row between canvas
 * and hint, rendered BY THE FRAME (not the gizmo) so every gizmo's controls match
 * for free. Hard cap: one row, no nesting/panels/accordions. A gizmo wanting more
 * means the step should SPLIT.
 *
 * ── What this phase does NOT do ──────────────────────────────────────────────
 * The RUN PATH is untouched (Phase 3): submitAppGeneration still commits at
 * ENQUEUE time with scope:'gallery', so a card appears in the gallery before the
 * run finishes and APPLY IS INERT. The pane renders "Not saved yet" + Apply so
 * the shape is right; wiring it is deliberately a separate diff.
 *
 * State: seeds from and writes `state.s_appInputs[appId]` (top-level replace) so
 * inputs survive close→reopen AND the Overlays.reset() force-close on navigation.
 *
 * Props: { app: AppDef, uiComponent: Blueprint|null, initialInputs?: Object }.
 */

/**
 * Returns the declared media groups from the app's inputSchema, or [] for media-free apps.
 * @param {import('../../../data/appsRegistry.js').AppDef} [app]
 * @returns {Array<{type:string,mode:string,max:number,roles:string[]}>}
 */
function _getMediaGroups(app) {
    const schema = app?.inputSchema;
    if (!schema || !Array.isArray(schema.media) || schema.media.length === 0) return [];
    return schema.media;
}

/**
 * The app's declared middle steps, dropping any whose `kind` is not registered
 * (an unknown kind is an authoring bug — skip it rather than break the flow).
 * @param {import('../../../data/appsRegistry.js').AppDef} [app]
 * @returns {Array<Object>}
 */
function _getSteps(app) {
    const steps = Array.isArray(app?.steps) ? app.steps : [];
    return steps.filter((s) => {
        if (getStepKind(s?.kind)) return true;
        clientLogger.warn('MpiBaseApp', `unknown step kind "${s?.kind}" — skipping`);
        return false;
    });
}

/**
 * Human label for a media slot.
 *
 * An app SHOULD declare `labels: ['Original', 'Face Reference']` on its media
 * group — a slot's name is app copy, not something the frame can invent. The
 * fallbacks exist so an app that declares nothing still renders sanely: a
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
function _acceptFor(type) {
    if (type === 'image') return 'image/*';
    if (type === 'video') return 'video/*';
    return 'audio/*';
}

export const MpiBaseApp = ComponentFactory.create({
    name: 'MpiBaseApp',
    css: ['js/components/Organisms/MpiBaseApp/MpiBaseApp.css'],

    template: (props) => `
        <div class="mpi-base-app">
            <div class="mpi-base-app__topbar">
                <div class="mpi-base-app__topbar-left">
                    <button class="mpi-base-app__back" id="app-back" type="button">
                        ${renderIcon('back', 'sm')}<span>Apps</span>
                    </button>
                    <span class="mpi-base-app__topbar-sep"></span>
                    <span class="mpi-base-app__app-name">${props.app?.title || 'App'}</span>
                </div>
                <nav class="mpi-base-app__ticker" id="app-ticker" aria-label="Steps"></nav>
                <div class="mpi-base-app__topbar-right"></div>
            </div>
            <div class="mpi-base-app__stage" id="app-stage">
                <button class="mpi-base-app__arrow mpi-base-app__arrow--prev" id="app-prev"
                        type="button" aria-label="Previous step">&#8249;</button>
                <button class="mpi-base-app__arrow mpi-base-app__arrow--next" id="app-next"
                        type="button" aria-label="Next step">&#8250;</button>
                <div class="mpi-base-app__slides" id="app-slides"></div>
            </div>
        </div>`,

    setup: (el, props) => {
        const app = props.app;
        const _unsubs = [];

        // ── main-area overlay frame (spares the status bar; queue rides above) ──
        const overlay = MpiOverlay.mount(document.createElement('div'), {
            closable: true, mountTarget: 'main-area',
        });
        overlay.el.appendToContainer(el);
        overlay.on('close', () => { el.close(); });

        const tickerEl = qs('#app-ticker', el);
        const slidesEl = qs('#app-slides', el);
        const prevBtn = qs('#app-prev', el);
        const nextBtn = qs('#app-next', el);

        const mediaGroupDefs = _getMediaGroups(app);
        const middleSteps = _getSteps(app);

        // Seed from persisted session inputs (survives reopen + navigation reset).
        const seeded = state.s_appInputs?.[app.id] || props.initialInputs || {};

        // ── Model ───────────────────────────────────────────────────────────────
        /**
         * One entry per declared media group. Items are the filled slots.
         * @type {Array<{group:Object, items:Array}>}
         */
        const _mediaGroups = mediaGroupDefs.map((group) => {
            const items = [];
            if (Array.isArray(seeded.mediaItems)) {
                const forType = seeded.mediaItems.filter(m => m.mediaType === group.type);
                for (let i = 0; i < Math.min(forType.length, group.max); i++) {
                    items.push({ ...forType[i], role: group.roles[i] });
                }
            }
            return { group, items };
        });

        /** Reported step values, keyed by the step's media role. @type {Object} */
        const _stepValues = { ...(seeded.stepValues || {}) };

        /** Live step-kind instances, keyed by step index — destroyed on rebuild. */
        const _stepInstances = new Map();

        /** Per-slide listener unsubs, keyed by slide index. */
        const _slideUnsubs = new Map();

        let _current = 0;
        let _running = false;
        let _myTempId = null;
        let _hasPending = false;
        let _perApp = null;
        let _runBtn = null;
        let _resultMediaEl = null;
        let _resultEmptyEl = null;
        let _resultFrameEl = null;
        /** Pan/zoom state for the result pane — the shared MpiCanvas view model. */
        const _resultView = new ViewManager();
        let _statusEl = null;
        let _applyRow = null;
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
                const btn = ce('button', { className: 'mpi-base-app__tick', type: 'button' });
                const num = ce('span', { className: 'mpi-base-app__tick-num' });
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

            const unit = ce('div', { className: 'mpi-base-app__slot-unit' });
            const labelEl = ce('span', { className: 'mpi-base-app__slot-label' });
            labelEl.textContent = _slotLabel(group, idx);
            unit.appendChild(labelEl);

            const slot = ce('div', {
                className: `mpi-base-app__slot${item ? ' mpi-base-app__slot--filled' : ''}`,
            });
            slot.setAttribute('tabindex', '0');
            slot.setAttribute('role', 'button');

            if (item) {
                if (group.type === 'image') {
                    slot.appendChild(ce('img', {
                        src: resolveMediaUrl(item.url),
                        alt: _slotLabel(group, idx),
                    }));
                } else {
                    const name = ce('span', { className: 'mpi-base-app__slot-name' });
                    name.textContent = item.url.split(/[/\\]/).pop() || item.url;
                    slot.appendChild(name);
                }
                const clear = ce('button', {
                    className: 'mpi-base-app__slot-clear', type: 'button', title: 'Remove',
                });
                clear.innerHTML = renderIcon('close', 'xs');
                unsubs.push(on(clear, 'click', (e) => {
                    e.stopPropagation();
                    entry.items.splice(idx, 1);
                    entry.items.forEach((it, i) => { it.role = group.roles[i]; });
                    // A removed image invalidates any step bound to that role.
                    const freedRole = group.roles[entry.items.length];
                    if (freedRole) delete _stepValues[freedRole];
                    onDirty();
                }));
                slot.appendChild(clear);
            } else {
                const icon = ce('span', { className: 'mpi-base-app__slot-icon' });
                icon.innerHTML = renderIcon('image', 'lg');
                const hint = ce('span', { className: 'mpi-base-app__slot-hint' });
                hint.textContent = `Drop ${group.type} here`;
                slot.appendChild(icon);
                slot.appendChild(hint);

                const fileInput = ce('input', {
                    type: 'file', accept: _acceptFor(group.type), hidden: true, multiple: true,
                });
                slot.appendChild(fileInput);

                unsubs.push(on(slot, 'click', () => fileInput.click()));
                unsubs.push(on(slot, 'keydown', (e) => {
                    if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); fileInput.click(); }
                }));
                unsubs.push(on(fileInput, 'change', async () => {
                    const files = Array.from(fileInput.files || []);
                    fileInput.value = '';
                    await _handleFiles(entry, files, onDirty);
                }));
                unsubs.push(on(slot, 'dragover', (e) => {
                    e.preventDefault();
                    slot.classList.add('mpi-base-app__slot--dragover');
                }));
                unsubs.push(on(slot, 'dragleave', () => {
                    slot.classList.remove('mpi-base-app__slot--dragover');
                }));
                unsubs.push(on(slot, 'drop', async (e) => {
                    e.preventDefault();
                    slot.classList.remove('mpi-base-app__slot--dragover');
                    const files = Array.from(e.dataTransfer?.files || [])
                        .filter(f => f.type.startsWith(group.type + '/'));
                    await _handleFiles(entry, files, onDirty);
                }));
            }

            unit.appendChild(slot);
            return unit;
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
                clientLogger.warn('MpiBaseApp', 'preview-asset place failed', e);
                return null;
            }
        }

        /**
         * Upload one or more files into a media group, up to its cap.
         * @param {{group,items}} entry
         * @param {File[]} files
         * @param {Function} onDirty
         */
        async function _handleFiles(entry, files, onDirty) {
            const { group } = entry;
            const available = group.max - entry.items.length;
            if (files.length === 0) return;
            if (files.length > available) {
                clientLogger.warn('MpiBaseApp', `dropped ${files.length} ${group.type}(s) but only ${available} slot(s) free — ignoring extras`);
                files = files.slice(0, available);
            }

            const project = state.currentProject;
            if (!project?.folderPath || !project?.id) {
                Events.emit('ui:warning', { message: 'Open a project first.' });
                return;
            }

            for (const file of files) {
                // App inputs go into the content-addressed preview-assets store (MPI-227),
                // NOT the visible gallery — keeps the gallery clean while persisting the
                // file durably so a later Reuse can resolve it. Deduped by content hash.
                const placedUrl = await _placePreviewAsset(file, group.type, project);
                if (!placedUrl) {
                    Events.emit('ui:warning', { message: `Could not add ${group.type} file.` });
                    continue;
                }
                const idx = entry.items.length;
                entry.items.push({
                    url: placedUrl,
                    mediaType: group.type,
                    source: 'app-upload',
                    role: group.roles[idx],
                });
            }
            onDirty();
        }

        // ── Declared fields (ONE row, frame-rendered) ───────────────────────────
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

            const row = ce('div', { className: 'mpi-base-app__fields' });
            fields.forEach((f) => {
                const wrap = ce('label', { className: 'mpi-base-app__field' });
                if (f.label && f.type !== 'button') {
                    const lbl = ce('span', { className: 'mpi-base-app__field-label' });
                    lbl.textContent = f.label;
                    wrap.appendChild(lbl);
                }

                if (f.type === 'select') {
                    const sel = ce('select', { className: 'mpi-base-app__field-select' });
                    (f.options || []).forEach((o) => {
                        const opt = ce('option', { value: String(o.v) });
                        opt.textContent = o.label ?? String(o.v);
                        sel.appendChild(opt);
                    });
                    const cur = value?.fields?.[f.id] ?? f.default;
                    if (cur != null) sel.value = String(cur);
                    unsubs.push(on(sel, 'change', () => onFieldChange(f.id, sel.value)));
                    wrap.appendChild(sel);
                } else if (f.type === 'button') {
                    const btn = ce('button', {
                        className: 'mpi-base-app__field-button', type: 'button',
                    });
                    btn.textContent = f.label || f.id;
                    unsubs.push(on(btn, 'click', () => onFieldChange(f.id, true)));
                    wrap.appendChild(btn);
                } else if (f.type === 'toggle') {
                    const box = ce('input', { type: 'checkbox', className: 'mpi-base-app__field-toggle' });
                    box.checked = Boolean(value?.fields?.[f.id] ?? f.default);
                    unsubs.push(on(box, 'change', () => onFieldChange(f.id, box.checked)));
                    wrap.appendChild(box);
                } else {
                    clientLogger.warn('MpiBaseApp', `unknown field type "${f.type}" — skipping`);
                    return;
                }
                row.appendChild(wrap);
            });
            return row;
        }

        // ── Slide builders ──────────────────────────────────────────────────────
        /** STEP 0 — media slots (left) + what this app does (right). Divided. */
        function _buildInputsSlide(unsubs) {
            const split = ce('div', { className: 'mpi-base-app__split' });

            const left = ce('div', { className: 'mpi-base-app__col-left' });
            if (_mediaGroups.length === 0) {
                const none = ce('p', { className: 'mpi-base-app__no-inputs' });
                none.textContent = 'This app needs no input media.';
                left.appendChild(none);
            }
            _mediaGroups.forEach((entry) => {
                for (let i = 0; i < entry.group.max; i++) {
                    left.appendChild(_buildSlot(entry, i, () => _renderSlide(), unsubs));
                }
            });

            const divider = ce('div', { className: 'mpi-base-app__divider' });

            const right = ce('div', { className: 'mpi-base-app__col-right' });
            const title = ce('h1', { className: 'mpi-base-app__app-title' });
            title.textContent = app.title || 'App';
            right.appendChild(title);
            if (app.preview) {
                const frame = ce('div', { className: 'mpi-base-app__example' });
                // Same path the App Library uses for this descriptor field.
                frame.appendChild(ce('img', {
                    src: `comfy_workflows/display/${app.preview}`, alt: '', loading: 'lazy',
                }));
                right.appendChild(frame);
            }
            const explainer = ce('div', { className: 'mpi-base-app__explainer' });
            const p = ce('p');
            p.textContent = app.description || '';
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
            const work = ce('div', { className: 'mpi-base-app__work' });

            const title = ce('h2', { className: 'mpi-base-app__work-title' });
            title.textContent = step.title || '';
            work.appendChild(title);

            const media = _mediaForRole(step.role);
            const canvas = ce('div', { className: 'mpi-base-app__canvas' });

            if (!media) {
                // No media for this role yet — say so plainly and send them back.
                const empty = ce('p', { className: 'mpi-base-app__canvas-empty' });
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
                const hint = ce('p', { className: 'mpi-base-app__work-hint' });
                hint.textContent = step.hint;
                work.appendChild(hint);
            }
            return work;
        }

        /** LAST STEP — controls + Generate (left) │ result + Apply (right). Divided. */
        function _buildRunSlide(unsubs) {
            const split = ce('div', { className: 'mpi-base-app__split' });

            const left = ce('div', { className: 'mpi-base-app__col-left' });
            const controls = ce('div', { className: 'mpi-base-app__controls' });

            // Per-app controls (composition) mount here — the app's own knobs.
            const contentSlot = ce('div', { className: 'mpi-base-app__content' });
            controls.appendChild(contentSlot);

            const genWrap = ce('div', { className: 'mpi-base-app__gen' });
            const runHost = ce('div');
            genWrap.appendChild(runHost);
            _gaugeEl = ce('div', { className: 'mpi-base-app__gauge' });
            _gaugeEl.appendChild(ce('span'));
            genWrap.appendChild(_gaugeEl);
            _statusEl = ce('div', { className: 'mpi-base-app__status' });
            genWrap.appendChild(_statusEl);
            controls.appendChild(genWrap);
            left.appendChild(controls);

            const divider = ce('div', { className: 'mpi-base-app__divider' });

            const right = ce('div', { className: 'mpi-base-app__col-right' });
            const pane = ce('div', { className: 'mpi-base-app__result' });
            const frame = ce('div', { className: 'mpi-base-app__result-frame' });
            _resultFrameEl = frame;
            _resultMediaEl = ce('div', { className: 'mpi-base-app__result-media' });
            frame.appendChild(_resultMediaEl);
            _bindResultView(frame, unsubs);
            // Empty-state copy that also teaches the commit: an unexplained blank
            // frame gives the user no reason to expect Apply to matter.
            _resultEmptyEl = ce('div', { className: 'mpi-base-app__result-empty' });
            _resultEmptyEl.textContent = 'Your result appears here. Nothing is saved until you apply it.';
            frame.appendChild(_resultEmptyEl);
            pane.appendChild(frame);

            // Apply is rendered but INERT until Phase 3 wires the run path.
            _applyRow = ce('div', { className: 'mpi-base-app__result-actions' });
            _applyRow.hidden = true;
            const applyHost = ce('div');
            _applyRow.appendChild(applyHost);
            pane.appendChild(_applyRow);

            _pendingNote = ce('span', { className: 'mpi-base-app__pending' });
            _pendingNote.textContent = 'Not saved yet';
            _pendingNote.hidden = true;
            pane.appendChild(_pendingNote);

            right.appendChild(pane);

            split.appendChild(left);
            split.appendChild(divider);
            split.appendChild(right);

            // Mount children AFTER the tree exists (mount() replaces innerHTML).
            _runBtn = MpiButton.mount(runHost, { text: 'Generate', variant: 'primary', size: 'md' });
            _runBtn.on('click', () => { if (_running) _cancel(); else _run(); });

            const applyBtn = MpiButton.mount(applyHost, { text: 'Apply', variant: 'primary', size: 'sm' });
            applyBtn.on('click', _apply);
            unsubs.push(() => { _runBtn?.el?.destroy?.(); applyBtn?.el?.destroy?.(); });

            if (props.uiComponent) {
                _perApp = props.uiComponent.mount(contentSlot, { initialInputs: seeded });
                unsubs.push(() => { _perApp?.el?.destroy?.(); _perApp = null; });
            }

            _syncRunUi();
            _paintPending();
            return split;
        }

        // ── Slide switching ─────────────────────────────────────────────────────
        /** Tear down the live slide (gizmos + listeners) before building the next. */
        function _teardownSlide() {
            _stepInstances.forEach(inst => inst?.el?.destroy?.());
            _stepInstances.clear();
            _slideUnsubs.forEach(list => list.forEach(fn => fn?.()));
            _slideUnsubs.clear();
            // These live on the run slide only; drop the stale references.
            _runBtn = null; _resultMediaEl = null; _statusEl = null;
            _applyRow = null; _pendingNote = null; _gaugeEl = null;
            _resultFrameEl = null;
        }

        /** Build and show the current step. One slide is live at a time. */
        function _renderSlide() {
            _teardownSlide();
            const unsubs = [];
            _slideUnsubs.set(_current, unsubs);

            const slide = ce('div', { className: 'mpi-base-app__slide' });
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
            if (_resultEmptyEl) _resultEmptyEl.hidden = !!_resultMediaEl?.firstChild;
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
                panning = true;
                startX = e.clientX - _resultView.offsetX;
                startY = e.clientY - _resultView.offsetY;
                frame.style.cursor = 'move';
            }));
            unsubs.push(on(frame, 'mousemove', (e) => {
                if (!panning) return;
                _resultView.offsetX = e.clientX - startX;
                _resultView.offsetY = e.clientY - startY;
                _resultView.isManagedView = false;
                _applyResultTransform();
            }));
            const endPan = () => { if (panning) { panning = false; frame.style.cursor = ''; } };
            unsubs.push(on(frame, 'mouseup', endPan));
            unsubs.push(on(frame, 'mouseleave', endPan));
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
            let line = qs('.mpi-base-app__scanline', _resultFrameEl);
            if (show && !line) {
                line = ce('span', { className: 'mpi-base-app__scanline' });
                _resultFrameEl.appendChild(line);
            } else if (!show && line) {
                line.remove();
            }
        }

        /** Paint a single URL (a live latent preview) into the result pane. */
        function _paintResult(url, { blurring = false } = {}) {
            if (!url || !_resultMediaEl) return;
            _resultMediaEl.innerHTML = '';
            const img = ce('img', { src: url, alt: 'result' });
            // Live latents carry a light blur — honest about a half-computed image,
            // where a spinner over blank space is not. Kept subtle on purpose: at a
            // heavy radius a late, genuinely detailed latent is hidden behind the
            // same fog as the first noisy one, which is the opposite of informative.
            if (blurring) img.classList.add('mpi-base-app__result-latent');
            _resultMediaEl.appendChild(img);
            _fitWhenReady(img);
            // The scanline lives on the FRAME, not the transformed media layer —
            // inside it, the sweep would zoom and pan along with the image instead
            // of tracking the viewport.
            _setScanline(true);
            _syncResultEmpty();
        }

        /** Paint ALL final results (multi-output apps produce N items — MPI-259). */
        function _showResults(items) {
            if (!_resultMediaEl) return;
            const list = (Array.isArray(items) ? items : [items]).filter(Boolean);
            const withPath = list.map(it => ({ it, path: it?.filePath || it?.url })).filter(x => x.path);
            // Always clear first: the pane may still hold a live-latent preview whose
            // blob: URL is revoked the moment the gen ends. Leaving it in the DOM logs
            // a GET blob:… ERR_FILE_NOT_FOUND.
            _resultMediaEl.innerHTML = '';
            // The run is over — the sweep now lives on the frame, so clearing the
            // media layer no longer takes it with it.
            _setScanline(false);
            if (!withPath.length) { _syncResultEmpty(); return; }
            for (const { it, path } of withPath) {
                const url = resolveMediaUrl(path);
                const isVideo = it?.type === 'video' || it?.mediaType === 'video';
                const media = isVideo
                    ? ce('video', { src: url, controls: true, muted: true, loop: true })
                    : ce('img', { src: url, alt: 'result' });
                // Fit the FINAL image once it has dimensions — a latent's view never
                // carries over (different crop, different resolution).
                _resultMediaEl.appendChild(media);
                _fitWhenReady(media);
            }
            _syncResultEmpty();
        }

        /** Show/hide the Apply row + "Not saved yet" note. */
        function _paintPending() {
            if (_applyRow) _applyRow.hidden = !_hasPending;
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
            _runBtn.el.classList.toggle('mpi-base-app__run--cancel', _running);
        }

        function _setGauge(pct) {
            const bar = _gaugeEl?.firstElementChild;
            if (bar) bar.style.width = `${Math.max(0, Math.min(100, pct))}%`;
        }

        // Live latents (MPI-271): resolve the frame to its generation by server-truth
        // promptId, and paint when it's OUR running job (tempId match).
        _unsubs.push(Events.on('preview:frame', ({ promptId, url }) => {
            if (!_myTempId || !url) return;
            const entry = activeGenerations.byPromptId(promptId);
            if (entry?.tempId === _myTempId) _paintResult(url, { blurring: true });
        }));

        // ── Run ─────────────────────────────────────────────────────────────────
        function _setRunning(isRunning) {
            _running = isRunning;
            _syncRunUi();
        }

        /** Collect the inputs the app will run with. */
        function _collectInputs() {
            const mediaItems = _mediaGroups.flatMap(entry => entry.items);
            // The controls component is handed the collected step values so it can
            // translate them into ITS graph's params (Head Swap: box→Input_Box).
            // That translation is APP knowledge — which role feeds which node is
            // exactly what the frame must never learn — so the frame passes the
            // raw role-keyed values through and the app owns the mapping.
            const extra = _perApp?.el?.getInputs?.({ stepValues: { ..._stepValues } }) || {};
            return {
                ...(mediaItems.length ? { mediaItems } : {}),
                ...(Object.keys(_stepValues).length ? { stepValues: { ..._stepValues } } : {}),
                ...extra,
            };
        }

        const _run = () => {
            if (_running) return;

            const inputs = _collectInputs();
            const mediaItems = inputs.mediaItems || [];

            // Empty-run guard: an app that declares media slots but has NONE filled
            // and no prompt has nothing to run — every branch self-gates → zero
            // outputs → a silent "no output returned". Media-free apps skip this.
            const hasPrompt = typeof inputs.positive === 'string' && inputs.positive.trim() !== '';
            if (_mediaGroups.length > 0 && mediaItems.length === 0 && !hasPrompt) {
                Events.emit('ui:warning', {
                    message: `${app.title} needs at least one input before it can run.`,
                });
                return;
            }

            // Persist the input snapshot so Reuse/reopen restores media + controls.
            state.s_appInputs = { ...state.s_appInputs, [app.id]: inputs };

            _setRunning(true);
            _hasPending = false;
            _paintPending();
            _setGauge(0);
            if (_statusEl) _statusEl.textContent = 'Generating…';
            _myTempId = null;

            const res = submitAppGeneration(app, inputs, {
                onComplete: ({ item, items } = {}) => {
                    _setRunning(false);
                    _myTempId = null;
                    _setGauge(100);
                    // PHASE 3 will hold this in-app until Apply. Today the queue path
                    // has ALREADY committed it at enqueue time.
                    if (_statusEl) _statusEl.textContent = 'Done — added to your gallery.';
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
                    if (_statusEl) _statusEl.textContent = 'Generation failed.';
                },
                onCancel: () => {
                    _setRunning(false);
                    _myTempId = null;
                    _setGauge(0);
                    _showResults([]);   // drop the now-revoked live-latent preview
                    if (_statusEl) _statusEl.textContent = 'Cancelled.';
                },
            });
            // Guard aborted before enqueue (missing model / no media) → reset immediately.
            if (!res) { _setRunning(false); if (_statusEl) _statusEl.textContent = ''; return; }
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

        /**
         * Apply — commit the pending result to the project + gallery.
         * INERT UNTIL PHASE 3: the run path still commits at ENQUEUE time
         * (submitAppGeneration's scope:'gallery' + placeholderGroup), so the result
         * is already in the gallery by now and there is nothing left to commit.
         * The affordance ships with the frame; wiring it is a separate diff.
         */
        function _apply() {
            _hasPending = false;
            _paintPending();
            _syncRunUi();
            if (_statusEl) _statusEl.textContent = 'Applied — added to your gallery.';
        }

        // Ctrl+Enter runs the OPEN app, not the PromptBox behind it.
        _unsubs.push(Hotkeys.bind('generation.run', _run));

        // ── Back to Library = close this overlay, reopen the App Library ────────
        _unsubs.push(on(qs('#app-back', el), 'click', () => {
            el.close();
            Events.emit('apps:open');
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
            _unsubs.forEach(fn => fn?.());
            overlay?.el?.destroy?.();
        };

        // ── Boot ────────────────────────────────────────────────────────────────
        _buildTicker();
        _renderSlide();
    },
});
