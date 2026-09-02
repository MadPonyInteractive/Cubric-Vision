import { ComponentFactory } from '../../factory.js';
import { MpiOverlay } from '../../Primitives/MpiOverlay/MpiOverlay.js';
import { MpiButton } from '../../Primitives/MpiButton/MpiButton.js';
import { MpiRadioGroup } from '../../Primitives/MpiRadioGroup/MpiRadioGroup.js';
import { MpiMediaPicker } from '../../Compounds/MpiMediaPicker/MpiMediaPicker.js';
import { MpiModelSettings } from '../../Compounds/MpiModelSettings/MpiModelSettings.js';
import { MpiCompareView } from '../../Compounds/MpiCompareView/MpiCompareView.js';
import { MpiVideoViewer } from '../MpiVideoViewer/MpiVideoViewer.js';
import { MpiVideoControlBar } from '../../Compounds/MpiVideoControlBar/MpiVideoControlBar.js';
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
import { getStepKind, stepValueToParam, stepValueToMedia, isFrameKind } from './stepKinds.js';
import { enqueueGeneration, findMissingMediaSlot } from '../../../services/generationService.js';
import { getCommand } from '../../../data/commandRegistry.js';
import { flowModelSlots, flowModelIds, setFlowModel } from '../../../data/flowsRegistry.js';
import { disambiguatedName } from '../../../data/modelRegistry.js';
import { MpiDropdown } from '../../Primitives/MpiDropdown/MpiDropdown.js';
import { buildField, mapDeclaredValue, isInjectionParam, disabledFieldIds, hiddenFieldIds } from '../../../utils/declaredFields.js';
import { buildLicenceRows } from '../../../utils/flowLicences.js';

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
 * docs/playbooks/add-flow/ui/carousel-frame/composition.md.
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
 * (docs/playbooks/add-flow/ui/carousel-frame/fields.md).
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
 * Written AS THE USER WORKS, not only at Run — see `_persistInputs`. It used to be
 * written at dispatch alone, which meant nothing entered before the first Generate
 * survived being destroyed on navigation (MPI-606 bug 1).
 *
 * Props: { flow: FlowDef, initialInputs?: Object }.
 */

/**
 * Returns the declared media groups from the flow's inputSchema, or [] for media-free flows.
 * @param {import('../../../data/flowsRegistry.js').FlowDef} [flow]
 * @returns {Array<{type:string,mode:string,max:number,roles:string[],voiceLibrary?:Array<string|null>}>}
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
 * An MpiButton the caller places itself. `mount()` REPLACES its container's
 * innerHTML, and every button here lands in a tree that already has siblings —
 * the arrows are absolutely positioned inside the stage, the ticks sit in a flex
 * row the ticker rebuilds, the slot clear sits over an image. So mount into a
 * throwaway div and hand back the real `<button>` to place.
 *
 * Returning the element (not the instance) is what lets the ids survive:
 * `#flow-prev` / `#flow-next` / `#flow-back` must stay on something a
 * `document.querySelector(...).click()` actually activates — three desktop specs
 * drive the carousel that way, and a click on a mount HOST div does nothing.
 */
function _mountButton(props, children = '') {
    return MpiButton.mount(ce('div'), props, children).el;
}

export const MpiBaseFlow = ComponentFactory.create({
    name: 'MpiBaseFlow',
    css: ['js/components/Organisms/MpiBaseFlow/MpiBaseFlow.css'],

    template: (props) => `
        <div class="mpi-base-flow">
            <div class="mpi-base-flow__topbar">
                <div class="mpi-base-flow__topbar-left" id="flow-topbar-left">
                    <span class="mpi-base-flow__topbar-sep"></span>
                    <span class="mpi-base-flow__flow-name">${props.flow?.title || 'Flow'}</span>
                </div>
                <nav class="mpi-base-flow__ticker" id="flow-ticker" aria-label="Steps"></nav>
                <div class="mpi-base-flow__topbar-right"></div>
            </div>
            <div class="mpi-base-flow__stage" id="flow-stage">
                <div class="mpi-base-flow__slides" id="flow-slides"></div>
            </div>
        </div>`,

    setup: (el, props, emit) => {
        const flow = props.flow;
        const _unsubs = [];

        // ── main-area overlay frame (spares the status bar; queue rides above) ──
        // No X: the topbar's FLOWS button is the only exit, and it returns to the
        // Library. The overlay's X dropped the user into the gallery instead, which
        // read as a bug every time (MPI-638 follow-up). Escape still closes — that
        // path runs through `ui:close-all-popups`, not the button.
        const overlay = MpiOverlay.mount(document.createElement('div'), {
            closable: false, mountTarget: 'main-area',
        });
        overlay.el.appendToContainer(el);
        // Re-emit the overlay's close OUTWARD so the shell can destroy this instance
        // (MPI-345). A flow closed but not destroyed keeps every listener this setup
        // registered — including the global `generation.run` hotkey below — so the
        // next Ctrl+Enter in the main workspace fired the closed flow's Run alongside
        // the PromptBox's, queueing a phantom generation from its persisted inputs.
        // Fires ONCE per close: MpiOverlay.hide() emits inside its `_isHiding` guard,
        // so the `el.close()` re-entry here can't loop back through it.
        //
        // `_suspending` is the ONE case that must not reach the shell: the Tab ring
        // parks this flow to visit the gallery and comes back to it (MPI-611), so the
        // outward emit — and the destroy it triggers — is suppressed for that hide only.
        let _suspending = false;
        overlay.on('close', () => { el.close(); if (!_suspending) emit('close', {}); });

        const tickerEl = qs('#flow-ticker', el);
        const slidesEl = qs('#flow-slides', el);

        /**
         * Stop SPACE from activating a navigation button.
         *
         * Nobody wrote a spacebar handler — the browser did. Every piece of nav
         * chrome here is a real `<button>` that keeps focus after a click, and Space
         * on a focused button is NATIVE activation, so a click on the forward arrow
         * turned the next space press into another step (MPI-606 bug 2). Fabio was
         * holding it expecting pan.
         *
         * Swallowed at the nav chrome ONLY, never globally: the media slots' own
         * `Enter || ' '` handlers are a real affordance and must keep working. Enter
         * still activates these buttons, so keyboard navigation is intact.
         * @param {HTMLElement} btn
         */
        const _killSpace = (btn) => {
            _unsubs.push(on(btn, 'keydown', (e) => {
                if (e.key === ' ' || e.code === 'Space') e.preventDefault();
            }));
        };

        // ── Chrome buttons ──────────────────────────────────────────────────────
        // Mounted rather than written into the template: every UI element is a
        // component (.claude/rules/components.md). The ids move onto the mounted
        // `<button>` itself, so `#flow-prev` / `#flow-next` / `#flow-back` keep
        // working for the specs and for `qs()` below.
        const backBtn = _mountButton({
            icon: 'back', label: 'Flows', size: 'sm', variant: 'ghost',
            extraClasses: 'mpi-base-flow__back',
        });
        backBtn.id = 'flow-back';
        _killSpace(backBtn);
        qs('#flow-topbar-left', el).prepend(backBtn);

        const _arrow = (dir, glyph, aria) => {
            const btn = _mountButton({
                text: glyph, variant: 'ghost',
                extraClasses: `mpi-base-flow__arrow mpi-base-flow__arrow--${dir}`,
            });
            btn.id = `flow-${dir}`;
            btn.setAttribute('aria-label', aria);
            _killSpace(btn);
            return btn;
        };
        // The same single angle quotes the template drew, as literals rather than
        // `&#8249;` / `&#8250;` — an entity reads as a hardcoded hex colour to the linter.
        const prevBtn = _arrow('prev', '‹', 'Previous step');
        const nextBtn = _arrow('next', '›', 'Next step');
        qs('#flow-stage', el).prepend(prevBtn, nextBtn);

        const mediaGroupDefs = _getMediaGroups(flow);
        const _allSteps = _getSteps(flow);

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

        /**
         * WHICH STORE each declared field id lives in. Built once, from the
         * declarations, so a write can reach every store that claims the id.
         *
         *   `_flowStoreIds`   — ids held in `_fieldValues`: the flow's own `fields`,
         *                       plus any FRAME-kind step (stepKinds.js § FRAME_KINDS),
         *                       which has no role and seeds into the flow store by design.
         *   `_stepRolesById`  — id → the roles of the GIZMO steps declaring it, whose
         *                       values live in `_stepValues[role].fields`.
         *
         * An id declared on BOTH surfaces used to be TWO stores holding two values,
         * and `_collectInputs` applies the flow store LAST. A fresh open hid it
         * (`_seedField` returns undefined with no default and no persisted root, so
         * the key is absent), but after one run `s_flowInputs` carries the id at the
         * payload root, the flow-level copy seeds from it, and from then on the value
         * edited on the STEP was overwritten at collection by the stale run-slide one
         * — wrong output, no error, second run onward (MPI-606 bug 6). Declaring a
         * prompt on a draw step AND on the run slide is a thing flows want, so the
         * stores are unified rather than the declaration forbidden.
         */
        const _flowStoreIds = new Set(_fields.map(f => f.id));
        /** @type {Map<string, string[]>} */
        const _stepRolesById = new Map();
        (flow.steps || []).forEach((step) => {
            (Array.isArray(step?.fields) ? step.fields : []).forEach((f) => {
                if (!f?.id) return;
                if (isFrameKind(step.kind) || !step.role) { _flowStoreIds.add(f.id); return; }
                const roles = _stepRolesById.get(f.id) || [];
                roles.push(step.role);
                _stepRolesById.set(f.id, roles);
            });
        });

        /** Live step-kind instances, keyed by step index — destroyed on rebuild. */
        const _stepInstances = new Map();
        // stepIdx -> { el, step } for hints that depend on the gizmo's mode, so the
        // Auto/Manual switch can repaint guidance without rebuilding the slide.
        const _stepHints = new Map();

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
        /**
         * The last completed result of THIS flow, carried across the instance
         * (MPI-587) — `state.s_flowResults[flow.id]`, written by `_persistResult`.
         *
         * The INSTANCE cannot hold it: shell.js destroys the MpiBaseFlow on every
         * `flow:open` and on close (MPI-345, and that destroy is correct). The inputs
         * already travelled in session state (`s_flowInputs`), the result did not, so
         * a reopened flow showed its restored inputs beside an empty frame and a
         * finished run read as lost. This is deliberately the inputs' twin.
         * @type {?{items:Array<Object>, mode:?string, status:string, pending:boolean}}
         */
        const _seededResult = state.s_flowResults?.[flow.id] || null;
        let _hasPending = !!_seededResult?.pending;
        /**
         * The last completed result, held so it survives step navigation AND the
         * flow being closed and reopened.
         *
         * `_hasPending` (the "Saved to your gallery" note) already outlived a slide
         * rebuild, but the IMAGE did not — _teardownSlide() drops the DOM and nulls
         * the pane refs, and nothing kept the items to repaint from, so the pane came
         * back claiming a save with nothing on screen. Seeded from `_seededResult`,
         * which is what carries it past the instance as well (MPI-587).
         * @type {Array<Object>|null}
         */
        let _lastResults = _seededResult?.items || null;
        /** Last status-line copy, replayed when the run slide is rebuilt. */
        let _statusText = _seededResult?.status || '';
        let _runBtn = null;
        let _resultMediaEl = null;
        let _resultEmptyEl = null;
        let _resultFrameEl = null;
        /**
         * The shared before/after surface, live only while a declaring flow is
         * showing a comparable result (MPI-585). Held so the empty-state copy, the
         * frame's pan/zoom and the slide teardown can all see that the pane is in
         * compare mode rather than empty.
         * @type {?Object}
         */
        let _compareView = null;
        let _compareHost = null;
        /**
         * The REAL video player for a video result (MPI-585 option B) — the same
         * MpiVideoViewer + MpiVideoControlBar pair the History workspace runs, not a
         * bare `<video controls>`. The bar is deliberately not owned by the viewer
         * (see MpiVideoViewer's header), which is the whole reason this surface can
         * borrow it: the viewer fills the frame, the bar spans the pane below it.
         * @type {?Object}
         */
        let _videoViewer = null;
        let _videoBar = null;
        let _playerHost = null;
        let _barHost = null;
        /** The pane (frame + bar + note) — the bar mounts here, under the frame. */
        let _resultPaneEl = null;
        /**
         * Which surface the single result is on: 'compare' | 'player' | 'plain'.
         * Held with the item so the toggle can rebuild the other one.
         */
        let _resultMode = 'plain';
        /** @type {?{it: Object, path: string}} */
        let _resultSingle = null;
        let _surfaceToggle = null;
        /**
         * The surface the user last CHOSE with the toggle. Persisted beside
         * `_lastResults` (MPI-587) — a restored result comes back on the surface the
         * user picked for it, not on the flow's default.
         * @type {?'compare'|'player'}
         */
        let _preferredResultMode = _seededResult?.mode || null;
        /** Pan/zoom state for the result pane — the shared MpiCanvas view model. */
        const _resultView = new ViewManager();
        let _statusEl = null;
        let _pendingNote = null;
        let _gaugeEl = null;

        // A remembered result names a file that can be GONE by the time the flow is
        // reopened — the item deleted from the gallery, the media cleaned, another
        // project loaded. Probe it ONCE, here, instead of wiring an `error` handler
        // into all three result surfaces (plain / compare / player), two of which
        // swallow it: `/project-file` already 404s a missing file. Same fallback
        // discipline as `_mountCompare` — fall back to the empty pane, never paint a
        // dead src. The pane is not built yet at mount (the flow opens on step 0), so
        // this has resolved long before the run slide replays anything.
        if (_seededResult) {
            const probePath = _lastResults?.[0]?.filePath || _lastResults?.[0]?.url;
            if (!probePath) _forgetResult();
            else {
                fetch(resolveMediaUrl(probePath), { method: 'HEAD' })
                    .then(res => { if (!res.ok) _forgetResult(); })
                    .catch(() => _forgetResult());
            }
        }

        /**
         * The middle steps that CURRENTLY apply.
         *
         * A STEP may carry the same `hiddenWhen` clause a field does (MPI-664). When it
         * fires the step is not merely empty — it is not in the flow at all: the ticker
         * never lists it, `›` never lands on it, and the numbering closes up behind it.
         * Music Maker's Instrumental toggle takes the whole Lyrics stage off the flow
         * (Fabio, 2026-09-02), because a stage whose every field is hidden still renders
         * its title, its hint and an empty body — a step that exists to say nothing.
         *
         * Evaluated LIVE rather than captured, because the toggle that decides it is a
         * field on an earlier step. `hiddenFieldIds` is reused verbatim on a synthetic
         * one-field list so a step clause and a field clause can never drift into two
         * dialects of the same word.
         *
         * A skipped step KEEPS ITS VALUES, exactly as a hidden field does — so the graph
         * re-checks the real condition rather than trusting the step to be gone.
         */
        function _visibleSteps() {
            return _allSteps.filter(s => !s.hiddenWhen || !hiddenFieldIds(
                [{ id: s.tickerLabel || 'step', hiddenWhen: s.hiddenWhen }],
                _fieldValues, flowModelIds(flow),
            ).size);
        }

        /** Total steps = implicit inputs + the middle steps in play + implicit run. */
        const _stepCount = () => _visibleSteps().length + 2;
        const _lastIndex = () => _stepCount() - 1;

        /**
         * The media item a middle step operates on, resolved by ROLE — the same
         * vocabulary the op's mediaInputs uses, so a step needs no new mapping.
         * @param {string} role
         * @returns {Object|null}
         */
        function _mediaForRole(role) {
            for (const entry of _mediaGroups) {
                // `it?.role`, NOT `it.role` — `items` is SPARSE BY CONTRACT (a cleared
                // slot is `delete`d rather than spliced, so later images keep their
                // role), and `Array.prototype.find` is one of the few iterators that
                // does NOT skip holes: it calls back with `undefined`.
                //
                // Without the guard, clearing a filled slot and then stepping forward
                // threw here, INSIDE `_renderSlide` and before `slidesEl.innerHTML = ''`
                // — so the old slide stayed on screen while `_current` had already
                // advanced. It read as "the step is skipped": the first press appeared
                // to do nothing and the second jumped to Generate, which builds no gizmo
                // and never reaches this function. Uncaught TypeError, so nothing
                // reached `clientLogger` and `app.log` showed a clean run (MPI-620).
                const hit = entry.items.find(it => it?.role === role);
                if (hit) return hit;
            }
            return null;
        }

        // ── Ticker ──────────────────────────────────────────────────────────────
        /** Labels: 01 Inputs · 02 <declared title> · … · NN Generate. */
        function _tickerLabels() {
            return [
                'Inputs',
                ..._visibleSteps().map((s, i) => s.tickerLabel || s.title || `Step ${i + 1}`),
                'Generate',
            ];
        }

        function _buildTicker() {
            tickerEl.innerHTML = '';
            _tickerLabels().forEach((label, i) => {
                const btn = _mountButton({
                    variant: 'ghost', size: 'sm', extraClasses: 'mpi-base-flow__tick',
                });
                const num = ce('span', { className: 'mpi-base-flow__tick-num' });
                num.textContent = String(i + 1).padStart(2, '0');
                const text = ce('span');
                text.textContent = label;
                btn.appendChild(num);
                btn.appendChild(text);
                // The ticker NAVIGATES. A row that indicates but refuses clicks reads
                // as disabled, not informational (carousel-frame/composition.md).
                _unsubs.push(on(btn, 'click', () => _goTo(i)));
                _killSpace(btn);
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

        /**
         * Re-fit the flow to its CURRENT step set (MPI-664).
         *
         * A step-level `hiddenWhen` can take a whole stage out of the flow while the
         * user is standing in it, so the ticker has to be rebuilt and `_current` pulled
         * back inside — otherwise the numbering keeps counting a stage that is gone and
         * the last one becomes unreachable.
         *
         * Guarded on the COUNT because this runs on every field write: rebuilding the
         * ticker on each keystroke of a prompt box would tear down the live slide and
         * drop focus mid-word.
         */
        function _resyncSteps() {
            if (tickerEl.children.length === _stepCount()) return;
            _buildTicker();
            _current = Math.min(_current, _lastIndex());
            _renderSlide();
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
                    // A FILLED AUDIO SLOT IS A PLAYER, NOT A FILENAME (MPI-622).
                    //
                    // It used to print `_mediaName(item.url)`, and every flow input is stored
                    // content-addressed, so that name is a sha256 — "dc6ac18b7ee7b4a712…"
                    // told the user nothing about what was in the slot, least of all which
                    // library voice they had just chosen. Audio was the last media type with
                    // no way to confirm its own content.
                    //
                    // Hover plays, exactly as a filled VIDEO slot does, and for the same
                    // reason: click already means "reopen the picker and swap this", so
                    // playback cannot have the click. Muted is deliberately NOT set — an
                    // audio preview that makes no sound is not a preview.
                    const icon = ce('span', { className: 'mpi-base-flow__slot-icon' });
                    icon.innerHTML = renderIcon('play', 'lg');
                    slot.appendChild(icon);

                    const audio = ce('audio', {
                        className: 'mpi-base-flow__slot-audio',
                        src: resolveMediaUrl(item.url),
                        preload: 'metadata',
                        loop: true,
                    });
                    slot.appendChild(audio);
                    unsubs.push(on(slot, 'mouseenter', () => {
                        icon.innerHTML = renderIcon('pause', 'lg');
                        audio.play().catch(() => { icon.innerHTML = renderIcon('play', 'lg'); });
                    }));
                    unsubs.push(on(slot, 'mouseleave', () => {
                        audio.pause();
                        audio.currentTime = 0;
                        icon.innerHTML = renderIcon('play', 'lg');
                    }));
                }
                const clear = _mountButton({
                    icon: 'close', size: 'sm', variant: 'ghost', info: 'Remove',
                    extraClasses: 'mpi-base-flow__slot-clear',
                });
                unsubs.push(on(clear, 'click', (e) => {
                    e.stopPropagation();
                    // Clear THIS slot only — never splice, or every later image would
                    // shift up a slot and silently change role (and meaning).
                    delete entry.items[idx];
                    const freedRole = group.roles[idx];
                    // A removed image invalidates the DRAWING bound to that role — the
                    // strokes were placed over the image that just left — but NOT the
                    // step's declared FIELD values. Those are the user's own prompt and
                    // canvas size, which have nothing to do with the upload, and dropping
                    // the whole record silently threw away typed text (MPI-620).
                    if (freedRole && _stepValues[freedRole]) {
                        const { fields } = _stepValues[freedRole];
                        if (fields) _stepValues[freedRole] = { fields };
                        else delete _stepValues[freedRole];
                    }
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
                // The slot's own type, not a hardcoded 'image' — an audio slot showing a
                // picture frame was the first thing that made audio feel like a bolt-on.
                icon.innerHTML = renderIcon(
                    group.type === 'video' ? 'video' : group.type === 'audio' ? 'audio' : 'image',
                    'lg',
                );
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
                // The voice library as a third source, opted into PER SLOT and
                // index-aligned with `roles`/`labels` exactly as they are. Voice Changer
                // declares [null, 'character']: the library belongs on "Target voice" and
                // must not appear on "Your performance", where a stock voice is not the
                // thing the user performed. Undeclared → undefined → no voice card.
                voiceRoute: entry.group.voiceLibrary?.[idx] ?? null,
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
         * Every field this flow declares, flow-level and step-level together.
         *
         * The constraint painter walks THIS, not `_fields`. A cross-field rule is
         * declared where the control is, and MiniMax Music declares its Instrumental
         * toggle and the three fields it hides on `fields` STEPS — walking only the
         * flow's own fields would evaluate the rule against a set the toggle is not
         * in, and hide nothing (MPI-664).
         * @type {Array<Object>}
         */
        const _allDecls = [
            ...(_fields || []),
            ...(flow.steps || []).flatMap(st => st?.fields || []),
        ].filter(f => f?.id);

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

        /**
         * Push a value into a mounted text field, so a programmatic write shows.
         *
         * Through `MpiInput.setValue`, on the Primitive's ROOT — not the raw
         * `<textarea>`, and not the mount host. `.mpi-base-flow__field-text` is the
         * HOST div (`declaredFields.js` § text), so the earlier `host.value = text`
         * set an expando on a div and vanished: no error, no log, no repaint. The
         * enhanced phrase never appeared and the enhance button greyed out anyway,
         * because the VALUE was always right — only this write was lost (MPI-504).
         * Same reach as `_paintEnhance` uses for MpiButton, one layer down.
         */
        function _writeFieldValue(id, text) {
            const wrap = _liveFields.get(id);
            if (!wrap) return;
            qs('.mpi-input', wrap)?.setValue?.(text);
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
        /**
         * Every field an enhance declaration writes into.
         *
         * `to` is ONE id, or a MARKER → id map when the enhancer's answer is several
         * blocks (MPI-664). Music Maker asks for three — mood, vocal and arrangement —
         * because one 12-row box holding all three read as nothing at all: *"as much as
         * I read it, I still don't know what it is or how to use it"* (Fabio,
         * 2026-09-02). Three labelled boxes filling at once is the same text saying what
         * it is, and it is what makes the button's effect visible.
         */
        const _enhanceTargets = d => (typeof d.to === 'string' ? [d.to] : Object.values(d.to || {}));

        function _paintEnhance() {
            _enhanceDecls.forEach((d) => {
                const wrap = _liveFields.get(d.id);
                if (!wrap) return;
                const btn = qs('.mpi-base-flow__field-button', wrap);
                if (!btn) return;
                const busy = _enhancing === d.id;
                // ANY empty target is stale: a half-filled set is not enhanced, and the
                // button is the only place that can say so on a surface (the run slide)
                // where none of the boxes are shown.
                const stale = _enhanceTargets(d).some(id => !String(_fieldValues[id] || '').trim());
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
        /** Write one enhanced value into the store AND every live copy of its box. */
        function _setEnhanced(id, v) {
            _fieldValues[id] = v;
            _writeFieldValue(id, v);
        }

        /**
         * Land the enhancer's answer in the declaration's target(s).
         *
         * ONE target takes the whole string. SEVERAL take one MARKED BLOCK each: the
         * recipe answers `[MOOD] … [VOCAL] … [ARRANGEMENT] …` on a single line — the
         * graph's `StringReplace` flattens it and that is deliberate, the blocks are
         * delimited by their markers and never by newlines — so each box claims the run
         * of text from its own marker to whichever marker comes next.
         *
         * An UNMARKED answer is NOT an error, and must not land as three empty boxes. A
         * model that ignored the format still wrote usable prose, so it all goes into
         * the first box where the user can see it and move it. That is also the shape
         * the graph already tolerates on the caption side.
         *
         * @param {Object} d     the enhance field declaration
         * @param {string} text  the op's answer, trimmed
         */
        function _writeEnhanced(d, text) {
            if (typeof d.to === 'string') { _setEnhanced(d.to, text); return; }
            const blocks = Object.entries(d.to || {}).map(([marker, id]) => [
                id,
                (text.match(new RegExp(`\\[${marker}\\]([\\s\\S]*?)(?=\\[[A-Z_]+\\]|$)`, 'i'))?.[1] || '').trim(),
            ]);
            if (!blocks.length) return;
            if (blocks.every(([, v]) => !v)) { _setEnhanced(blocks[0][0], text); return; }
            blocks.forEach(([id, v]) => _setEnhanced(id, v));
        }

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
                    injectionParams: {
                        // The declaration's OWN params (MPI-664). The enhancer op is
                        // deliberately reusable — its recipe and both scrub patterns are
                        // meant to be injected by the caller, and commandRegistry's own
                        // comment has said so since MPI-504 — but until now no route
                        // existed: a second flow got Character Sheet's baked "You are a
                        // character designer" whatever it asked for. One object on the
                        // declaration, spread here, IS that route.
                        ...(d.injectionParams || {}),
                        // The seed is spread LAST, so a declaration cannot reach it. It is
                        // DRIVEN, never a user field, and never stored: the loop is
                        // Enhance → Generate → Enhance, and a fixed seed returns the same
                        // phrase on every press. What the sidecar keeps is the enhanced
                        // TEXT, which is why storing the seed as well was considered and
                        // rejected.
                        Input_Seed: Math.floor(Math.random() * 2 ** 31),
                    },
                },
                {
                    // A text op never fires onComplete — GenerationCallbacks.onText.
                    onText: (text) => {
                        const out = String(text || '').trim();
                        if (out) _writeEnhanced(d, out);
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
                if (d.from !== id) return;
                _enhanceTargets(d).forEach((t) => {
                    if (!_fieldValues[t]) return;
                    _setEnhanced(t, '');
                });
            });
            _paintEnhance();
        }

        /**
         * Write ONE declared field into EVERY store that declares its id
         * (`_flowStoreIds` / `_stepRolesById` above). Both onChange surfaces route
         * through here, so a shared id can never hold two values that disagree.
         * @param {string} id
         * @param {*} val
         */
        function _writeDeclaredField(id, val) {
            if (_flowStoreIds.has(id)) _setFlowField(id, val);
            (_stepRolesById.get(id) || []).forEach((role) => {
                const prev = _stepValues[role] || {};
                _stepValues[role] = {
                    ...prev,
                    fields: { ...(prev.fields || {}), [id]: val },
                };
            });
            _touchInputs();
        }

        /** onChange for a flow-level field: an `action` runs, everything else stores. */
        /**
         * Grey the toggles the CURRENT VALUES forbid (MPI-663).
         *
         * Stems is the first flow whose toggles constrain each other — one stem must
         * stay on, and Combine means nothing until two are. The rule itself is declared
         * (`group`/`minActive`, `enabledWhen`) and evaluated in `disabledFieldIds`; this
         * only paints the answer, through the primitive's own `setDisabled`, exactly as
         * `_paintEnhance` does for the enhance button.
         *
         * Values are never rewritten here. A disabled control keeps what it holds and
         * comes back live the moment the constraint clears.
         *
         * MPI-664 adds HIDING on the same pass. Where disabling reaches the primitive's
         * own `setDisabled` — and so lands on a toggle and nothing else — hiding is on
         * the wrapper this map already holds, so it works for any field type. Same law
         * as disabling: the VALUE survives, so the graph re-checks the condition rather
         * than trusting what is on screen.
         */
        function _paintFieldConstraints() {
            const disabled = disabledFieldIds(_allDecls, _fieldValues);
            // MPI-591: the picked model can hide a field too, so the pick is read on
            // every paint rather than captured once — `setFlowModel` writes to a session
            // Map and the dropdown repaints this after changing it.
            const hidden = hiddenFieldIds(_allDecls, _fieldValues, flowModelIds(flow));
            _allDecls.forEach((f) => {
                const wrap = _liveFields.get(f.id);
                if (!wrap) return;
                qs('.mpi-base-flow__field-toggle-btn', wrap)?.setDisabled?.(disabled.has(f.id));
                wrap.hidden = hidden.has(f.id);
            });
        }

        function _onFlowField(f, val) {
            if (f.action === 'enhance') { _runEnhance(f); return; }
            _writeDeclaredField(f.id, val);
            _paintFieldConstraints();
            // A field may gate a whole STEP, not just its neighbours (MPI-664).
            _resyncSteps();
        }

        // The `settings` action and its `_openSettings()` lived here (MPI-504) and were
        // removed by MPI-608, which moved the control to a per-phase cogwheel in the Flow
        // Library's detail slide-over. MPI-613 brings it back to this frame — per phase,
        // which is what MPI-504's single flow-level button could not express.
        //
        // Why the run slide and not the slide-over: LoRA choice is a COMPARE decision, not
        // a set-up one. You run, you look at the result, you want the same prompt with a
        // different LoRA. From the slide-over that costs close flow → reopen Library →
        // slide-over → cogwheel → back → reopen flow → run, with the result and the control
        // that changes it at opposite ends of the app.
        //
        // MPI-638 brought the MODEL DROPDOWN here for the same reason and put it in the
        // same row, so a slot's two controls — which model, and that model's LoRAs — are
        // one press apart from the Generate button that uses them. The cogwheel is now
        // ONLY here: it was duplicated into the Library drawer (MPI-608) and this slide
        // (MPI-613) at once, and the drawer no longer opens for an installed flow at all.
        let _loraSettings = null;
        let _modelBtns = [];
        // The host the model row is painted into. Stable for the life of the slide, so a
        // pick can repaint the row WITHOUT `_renderSlide()` — that tears down and replays
        // the result pane, the compare view and the video player to change one dropdown.
        let _modelRowHost = null;

        function _destroyModelBtns() {
            _modelBtns.forEach(inst => inst?.el?.destroy?.());
            _modelBtns = [];
        }

        /**
         * The run slide's MODEL ROW — one line per declared model slot, each carrying the
         * two controls that slot owns:
         *
         *     [ FLUX.2 Klein 9B   ▾ ][⚙]
         *
         * Driven off the flow's DECLARED slots, so it is generic: every flow gets it with
         * no FlowDef, graph or per-flow change. Written for the two-slot flows of
         * MPI-608/610; none is left (MPI-628 took the character sheet's second slot when
         * its head removal stopped being a model pass), so today every caller renders
         * exactly one line. The loop is still the contract — do not collapse it.
         *
         * WHAT EACH HALF DOES, and when it appears:
         *
         * - **The dropdown** appears when the slot has more than one INSTALLED candidate.
         *   With exactly one there is no choice to offer, and a one-option dropdown claims
         *   a choice that is not there — so that case renders the model's NAME as plain
         *   text instead. Filtering to installed is not cosmetic: `flowModelIds` lets a
         *   pick win even when its candidate is NOT on disk (MPI-599, deliberately, because
         *   that is how a user says "download that one instead"), so an unfiltered picker
         *   here would let someone flip an open flow to unavailable and meet a toast at
         *   Generate. The Library drawer keeps asking the OTHER question — which one do I
         *   download — and keeps offering everything.
         *
         * - **The cogwheel** appears when the slot declared `loras: true`, and opens that
         *   slot's running model's own six-slot rack. The same LoRA is the same LoRA
         *   whether the flow or the prompt box runs it (MPI-504) — deliberate, not an
         *   oversight.
         *
         * THE SLOT LABEL IS A DISAMBIGUATOR, NOT A NAME (MPI-638). It is rendered only when
         * the flow declares more than one slot; with one slot the dropdown already says
         * which model this is, and a caption above it would be a word invented for no
         * reader. Fabio, 2026-08-28: "render model" and "edit model" "are not names that
         * are sustainable because we might have 'pinpaint model' or 'remove model' ... it
         * would die, or it would introduce complexity". No shipped flow declares two slots,
         * so that wording is gone from the app with no descriptor edit at all — and the day
         * a two-slot flow ships, the label returns where it has something real to separate.
         *
         * The `MpiModelSettings` overlay is mounted HERE rather than reached through
         * `ui:open-model-settings`. That event is listened for by exactly two components,
         * MpiGalleryBlock and MpiGroupHistoryBlock, and both are workspace Blocks — a flow
         * opened from the landing page has neither on screen, so the emit would land
         * nowhere at all: no panel, no error, no log. Owning the instance also stops a
         * Block's listener opening a SECOND panel when a flow runs over one.
         */
        function _paintModelSlots() {
            if (!_modelRowHost) return;
            _destroyModelBtns();
            _modelRowHost.innerHTML = '';

            const slots = flowModelSlots(flow);
            const resolved = flowModelIds(flow);
            const installed = state.s_installedModelIds || [];
            // A rack edits settings that live on the PROJECT, and a flow cannot run without
            // one either — generationService bails on a null currentProject — so there is
            // nothing meaningful to open until one is. The DROPDOWN needs no project; only
            // the cogwheel is gated.
            const canRack = !!state.currentProject;
            const multi = slots.length > 1;

            slots.forEach((slot, i) => {
                const choices = slot.models.filter(id => installed.includes(id));
                const showPick = choices.length > 1;
                const showCog = slot.loras && canRack;
                if (!showPick && !showCog) return;

                // The id this slot will actually run. `resolved[i]` normally, but it can
                // name an UNINSTALLED candidate when the user picked one in the Library
                // and has not downloaded it yet — this row only ever offers what is on
                // disk, so fall back to the first installed candidate rather than seeding
                // the dropdown with a value none of its options carry.
                const runningId = choices.includes(resolved[i]) ? resolved[i] : choices[0];
                if (!runningId) return;
                const name = disambiguatedName(runningId, slot.models);

                const field = ce('div', { className: 'mpi-base-flow__model-slot' });
                if (multi) {
                    const cap = ce('span', { className: 'mpi-base-flow__field-label' });
                    cap.textContent = slot.label;
                    field.appendChild(cap);
                }
                const pick = ce('div', { className: 'mpi-base-flow__model-pick' });
                field.appendChild(pick);

                if (showPick) {
                    const host = ce('div');
                    pick.appendChild(host);
                    const dd = MpiDropdown.mount(host, {
                        options: choices.map(id => ({
                            value: id,
                            label: disambiguatedName(id, slot.models),
                        })),
                        value: runningId,
                    });
                    dd.on('change', ({ value }) => {
                        setFlowModel(flow.id, value);
                        // Repaint the ROW, not the slide: the cogwheel beside this dropdown
                        // addresses the model that is running, so it has to follow the pick.
                        // Everything else on this slide (params, racks, the payload) is read
                        // at Run through the same session Map, so nothing else needs telling.
                        _paintModelSlots();
                        // Except the fields — MPI-591 gave `hiddenWhen` a model rule, so a
                        // field can belong to one candidate and not another.
                        _paintFieldConstraints();
                    });
                    _modelBtns.push(dd);
                } else {
                    const label = ce('span', { className: 'mpi-base-flow__model-name' });
                    label.textContent = name;
                    pick.appendChild(label);
                }

                if (showCog) {
                    const cogHost = ce('div');
                    pick.appendChild(cogHost);
                    const cog = MpiButton.mount(cogHost, {
                        icon: 'settings',
                        size: 'sm',
                        info: `LoRAs for ${name} — the same rack this model uses everywhere`,
                        extraClasses: 'mpi-base-flow__model-cog',
                    });
                    cog.el.setAttribute('aria-label', `LoRAs for ${name}`);
                    cog.on('click', () => {
                        // Mounted on first use: a flow with no racks never pays for it.
                        if (!_loraSettings) {
                            _loraSettings = MpiModelSettings.mount(document.createElement('div'));
                        }
                        _loraSettings.el.open({ modelId: runningId });
                    });
                    _modelBtns.push(cog);
                }

                _modelRowHost.appendChild(field);
            });
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
            // Paint the constraints on the FIRST render too, not only after a change:
            // a flow reopened from Reuse can mount straight into a constrained state
            // (one stem selected, so that toggle is already locked). MPI-663.
            _paintFieldConstraints();
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

            // A `blankOnly` field only means something while the step has NO source
            // media, so it is disabled once a slot is filled rather than left live and
            // inert. The gizmo already refuses the change internally; without this the
            // refusal was invisible and the control moved while nothing happened, which
            // is the failure mode Fabio has now rejected twice (MPI-620).
            const hasMedia = !!_mediaForRole(step.role);

            const row = ce('div', { className: 'mpi-base-flow__fields' });
            fields.forEach((f) => {
                const node = _buildField(
                    f.blankOnly && hasMedia ? { ...f, disabled: true } : f,
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
                    // ONE choke point for every media mutation — a drop, a pick, a
                    // slot cleared all reach `onDirty`. Persisted immediately rather
                    // than trailed: these are rare, and losing a dropped photo to
                    // navigation is the bug this exists to close (MPI-606 bug 1).
                    left.appendChild(_buildSlot(entry, i, () => {
                        _persistInputs();
                        _renderSlide();
                    }, unsubs));
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

            // MPI-666 phase 2 — the licence, where an INSTALLED flow can still reach it.
            // MPI-638's `_pick` skips the Flow Library drawer for an available flow inside a
            // project, so the drawer's licence block (phase 1) is unreachable from the one
            // surface a user lives in: the licence text, the required attribution, and — for
            // MiniMax H3 (MPI-591) and minimax-music (MPI-664) — the misuse-report channel
            // H3 §V.5 obliges us to keep accessible. Step 0 already paints title, hero and
            // description, which is the Model Library drawer's own argument for where a
            // licence belongs: where a user comes to read what a thing is.
            //
            // Unconditional, unlike the Library's chip: acceptance is a pre-install question,
            // and by step 0 the weights are on disk. What matters here is that the agreement
            // and its channels stay reachable, not whether proof is outstanding.
            const licenceRows = buildLicenceRows(flow, unsubs);
            if (licenceRows.length) {
                // MpiModelManager's `mpi-detail__*` block deliberately — this IS the Model
                // Library's licence block, and preloadStyles.js loads that stylesheet
                // app-wide. Only the spacing is ours (`mpi-base-flow__licence`), because
                // step 0's column separates its children by their own bottom margins.
                //
                // NO "LICENCE" LABEL, unlike either drawer (Fabio, 2026-09-01). A drawer is a
                // spec sheet, so a field heading belongs there; step 0 is prose the user reads
                // once to learn what the flow does, and the attribution reads as the last line
                // of it rather than as a form field bolted underneath. The obligation is to
                // DISPLAY the attribution where the model is presented (H3 §III.3.a), not to
                // head it — and `Read the licence` still provides the copy §III.1 asks for.
                const field = ce('div', { className: 'mpi-detail__field mpi-base-flow__licence' });
                licenceRows.forEach(row => field.appendChild(row));
                right.appendChild(field);
            }

            split.appendChild(left);
            split.appendChild(divider);
            split.appendChild(right);
            return split;
        }

        /**
         * A step's guidance, as LINES rather than one block of prose.
         *
         * `hint` accepts three shapes, and the first two are what every existing flow
         * already uses:
         *   - a string        → one paragraph, exactly as before
         *   - an array        → one paragraph each, so guidance can BREATHE
         *   - an object       → `{ base, <variant> }`, where the variant key is the
         *                       gizmo's reported `mode`. `base` always shows; the
         *                       matching variant is appended.
         *
         * The object form exists because a two-mode gizmo was telling the user about
         * both modes at once: Object Stamp's place step explained Manual's redraw
         * trade-off while sitting in Auto, where none of it applies (Fabio,
         * 2026-08-27). One centred wall of text that half-contradicts what is on
         * screen is worse than no hint.
         *
         * @param {Object} step
         * @param {Object|null} value the step's reported value, for the variant key
         * @returns {string[]}
         */
        function _hintLines(step, value) {
            const h = step?.hint;
            if (!h) return [];
            if (typeof h === 'string') return [h];
            if (Array.isArray(h)) return h.filter(Boolean);
            const asLines = (v) => (Array.isArray(v) ? v : v ? [v] : []);
            // An unknown/absent mode still renders `base`, so a gizmo that reports no
            // mode yet is never left with a blank panel.
            return [...asLines(h.base), ...asLines(h[value?.mode])].filter(Boolean);
        }

        /**
         * Repaint a hint block in place. `textContent` per paragraph — the lines are
         * flow-authored copy, never markup.
         * @param {HTMLElement} el
         * @param {Object} step
         * @param {Object|null} value
         */
        function _paintHint(el, step, value) {
            el.innerHTML = '';
            _hintLines(step, value).forEach((line) => {
                const para = ce('p', { className: 'mpi-base-flow__work-hint-line' });
                para.textContent = line;
                el.appendChild(para);
            });
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
                const declared = Array.isArray(step.fields) ? step.fields : [];
                const build = (list) => {
                    const s = _buildFlowFields(list, unsubs);
                    s.classList.add('mpi-base-flow__fields--work');
                    return s;
                };
                // TWO COLUMNS, opt-in per FIELD (MPI-664). A canvas step already splits
                // its slide with `fieldsSide` — fields beside the picture — and this is
                // the same seam for a step that has no picture: the exact controls on the
                // left, the prose on the right. Music Maker's song stage puts style,
                // tempo and the toggles against the brief box, and its lyrics stage puts
                // the voice roster against the lyrics (Fabio, 2026-09-02).
                //
                // Declared on the FIELD rather than as a step-level `columns: [[…],[…]]`
                // so the order stays one readable list and a field can move sides with
                // one word. No `col: 'left'` — left is what a field is unless it says
                // otherwise, and an explicit default would just be a second way to
                // spell nothing.
                const right = declared.filter(f => f?.col === 'right');
                if (right.length) {
                    work.classList.add('mpi-base-flow__work--split');
                    const split = ce('div', {
                        className: 'mpi-base-flow__work-split mpi-base-flow__work-split--fields',
                    });
                    split.appendChild(build(declared.filter(f => f?.col !== 'right')));
                    split.appendChild(build(right));
                    work.appendChild(split);
                } else {
                    work.appendChild(build(declared));
                }
                if (step.hint) {
                    const hint = ce('div', { className: 'mpi-base-flow__work-hint' });
                    _paintHint(hint, step, _stepValues[step.role]);
                    work.appendChild(hint);
                }
                _paintEnhance();
                return work;
            }

            const media = _mediaForRole(step.role);
            const canvas = ce('div', { className: 'mpi-base-flow__canvas' });

            // A step that CREATES its picture needs no source (MPI-620): a blank-canvas
            // paint step is the whole of the flow's input, so demanding an upload first
            // would make the flow unusable rather than guide the user. Every other kind
            // DERIVES from the media and genuinely cannot mount without it.
            if (!media && !step.composite) {
                // No media for this role yet — say so plainly and send them back.
                const empty = ce('p', { className: 'mpi-base-flow__canvas-empty' });
                empty.textContent = 'Add the image for this step on the first step.';
                canvas.appendChild(empty);
            } else {
                const Kind = getStepKind(step.kind);
                const host = ce('div');
                canvas.appendChild(host);

                const inst = Kind.mount(host, {
                    media,
                    // A SECOND media role, declared (MPI-596). A step gets exactly one
                    // media today — the one matching its own `role` — which is right up
                    // until a gizmo's whole job is putting one image into another: Object
                    // Stamp's stage 2 draws on the scene and places the OBJECT, and a step
                    // bound to `image1` could not see `image2` at all.
                    //
                    // Mirrors the existing `mediaRole`, which already routes a kind's
                    // OUTPUT to another role — this is the same idea pointing inward, so
                    // the pair reads symmetrically and stays declarable by a manifest.
                    source: step.sourceRole ? _mediaForRole(step.sourceRole) : null,
                    // …and the VALUE that role's own step reported, which is the other
                    // half of the same seam (MPI-596). `source` above resolves from
                    // `_mediaGroups` — the user's own inputs — so it can only ever be the
                    // picture as UPLOADED. When an earlier step derives a new picture from
                    // it, that file is made at Run and never enters the map, so a later
                    // step reading `source` alone would preview the wrong pixels: Object
                    // Stamp's stage 3 would place the UNCUT object.
                    //
                    // Handing over the value instead of the file is deliberate. The
                    // producing step's value is small, already persisted for Reuse, and
                    // re-derivable — so the consumer re-runs the SAME compose function the
                    // producer draws with, and the two cannot disagree. Persisting a
                    // derived file to hand over instead would re-cut an already-cut
                    // picture on every Reuse.
                    //
                    // Freshness is free: `_renderSlide` tears the slide down and rebuilds
                    // it on every navigation, so going back to fix the cut and returning
                    // re-reads this.
                    sourceValue: step.sourceRole ? (_stepValues[step.sourceRole] || null) : null,
                    step,
                    value: _stepValues[step.role] || null,
                    onChange: (val) => {
                        // Preserve frame-owned fields across gizmo reports.
                        const prev = _stepValues[step.role] || {};
                        _stepValues[step.role] = { ...prev, ...val };
                        // A mode-keyed hint follows the gizmo's mode. Guarded on an
                        // actual CHANGE because this fires on every drag frame.
                        if (prev.mode !== _stepValues[step.role].mode) {
                            const h = _stepHints.get(stepIdx);
                            if (h) _paintHint(h.el, h.step, _stepValues[step.role]);
                        }
                        _touchInputs();
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
                    // Through the fan-out writer, not straight into this step's own
                    // store: an id this step shares with the run slide must be ONE
                    // value (MPI-606 bug 6).
                    _writeDeclaredField(fieldId, val);
                    // Let the gizmo react if it cares (e.g. a ratio lock).
                    _stepInstances.get(stepIdx)?.el?.onField?.(fieldId, val);
                },
                unsubs,
            );

            // WHERE THE FIELDS GO, and it decides how big the canvas can be (MPI-620).
            //
            // Default: under the canvas, which is right when the fields are a couple of
            // short controls MODIFYING what is on screen. But a step whose fields are
            // part of the WORK — a prompt box and a canvas-size picker, which together
            // eat ~150px of the same vertical the drawing needs — leaves a canvas too
            // small to draw a figure in (Fabio, 2026-08-26).
            //
            // `fieldsSide` moves them into a stacked column beside the canvas instead.
            // OPT-IN rather than the new default: this is the frame every gizmo step in
            // every flow renders through, and three shipped steps are laid out for the
            // stacked form. A step that wants the room asks for it.
            if (step.fieldsSide && fieldsRow) {
                fieldsRow.classList.add(
                    'mpi-base-flow__fields--stacked', 'mpi-base-flow__fields--side',
                );
                work.classList.add('mpi-base-flow__work--split');
                const split = ce('div', { className: 'mpi-base-flow__work-split' });
                split.appendChild(fieldsRow);
                split.appendChild(canvas);
                work.appendChild(split);
            } else {
                work.appendChild(canvas);
                if (fieldsRow) work.appendChild(fieldsRow);
            }

            // A MODE-DEPENDENT hint has to repaint when the gizmo's mode changes, and
            // the gizmo owns that control (Object Stamp's Auto/Manual radio lives inside
            // MpiStepPlace, not in the frame's declared fields). So the block is kept on
            // the slide and the onChange above repaints it — a full `_renderSlide` would
            // tear down the live canvas mid-gesture.
            if (step.hint) {
                const hint = ce('div', { className: 'mpi-base-flow__work-hint' });
                _paintHint(hint, step, _stepValues[step.role]);
                _stepHints.set(stepIdx, { el: hint, step });
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

            // Model slot(s) — the dropdown and its LoRA cogwheel — beside the output and
            // above Run (MPI-613, MPI-638). The host is stable so a pick repaints only the
            // row; it stays in the tree even when the flow declares no model slot, because
            // an empty div costs nothing and a conditional append would need the same
            // branch again on every repaint.
            _modelRowHost = ce('div', { className: 'mpi-base-flow__models' });
            contentSlot.appendChild(_modelRowHost);
            _paintModelSlots();

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
            _resultPaneEl = pane;
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
            // Before the refs are nulled — the teardowns need the frame to strip
            // their modifier classes, and both the compare canvas and the video
            // viewer hold RAF loops that must stop.
            _teardownResultSurfaces();
            // Run-slide only, and the slide is rebuilt on every navigation — without this
            // each visit leaks another set of dropdown + cogwheel instances. The overlay
            // itself is NOT dropped here: it survives slide changes and dies with the flow.
            _destroyModelBtns();
            _modelRowHost = null;
            _runBtn = null; _resultMediaEl = null; _statusEl = null;
            _pendingNote = null; _gaugeEl = null;
            _resultFrameEl = null; _resultPaneEl = null;
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
                slide.appendChild(_buildStepSlide(_visibleSteps()[idx], idx, unsubs));
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
        /**
         * True when a middle step CREATES the picture rather than editing one
         * (`composite`, `_deriveRunMedia` above). Such a step fills its role at RUN
         * time — after the slide the gate below guards — so an empty slot at the
         * step-0 boundary is not yet a missing input. Scribble is the case and the
         * reason this exists: its slot reads "Drawing (optional)" and a blank canvas
         * plus one stroke derives `image1`, even though `flowScribble` declares that
         * slot required. Gating on the slot alone would refuse the flow's whole point.
         */
        const _stepDerivesOwnMedia = (flow.steps || []).some(s => s?.composite);

        /**
         * Step 0 is where every media slot lives, so leaving it with a required slot
         * empty means the run is already doomed — and until MPI-644 the refusal landed
         * at Generate, several slides later, with nothing said in between.
         *
         * The predicate is `findMissingMediaSlot` itself, not a copy: the enqueue and
         * dispatch guards ask the same question, and three answers that can disagree is
         * how a gate starts refusing a run the queue would have accepted. That also
         * inherits its per-media-TYPE matching (MPI-466) — one image satisfies every
         * image slot — which is deliberate and must not be tightened here.
         *
         * The copy is generic by request (Fabio, 2026-08-28). The type-naming version in
         * `_warnMissingMediaSlot` is untouched: it still serves the PromptBox, where one
         * op with one slot makes naming the media type the useful thing to say.
         *
         * @returns {boolean} true when the advance was refused
         */
        function _refuseAdvanceWithoutInputs() {
            if (_stepDerivesOwnMedia) return false;
            // The same shape `_collectInputs` builds, and only that: a navigation check
            // must not run the field/param collection, which seeds and maps as it goes.
            const mediaItems = _mediaGroups.flatMap(entry => entry.items.filter(Boolean));
            if (!findMissingMediaSlot(flow.operation, mediaItems)) return false;
            // sound:false — a refused click must not ring (matches _warnMissingMediaSlot).
            Events.emit('ui:warning', { message: 'You need to add inputs to this flow.', sound: false });
            return true;
        }

        function _goTo(i) {
            const next = Math.max(0, Math.min(i, _lastIndex()));
            if (next === _current) return;
            // Every forward route out of step 0 funnels through here — the arrows, the
            // ticker's direct jumps and the step hotkeys — so one gate covers all three.
            // Backward navigation is never gated: a user returning to fix the inputs is
            // exactly what the toast just asked them to do.
            if (_current === 0 && next > 0 && _refuseAdvanceWithoutInputs()) return;
            _current = next;
            _renderSlide();
        }

        // Arrows, the ticker AND the arrow keys are the navigation. The keys were
        // deliberately absent until Fabio asked for them (MPI-606 bug 3); the two
        // reasons that comment gave were real work, and both are now done:
        //
        //  - the registry ids exist (`flow.step.back` / `flow.step.forward`,
        //    hotkeyRegistry.js § Flow) and are bound below through `Hotkeys`, never a
        //    raw window keydown;
        //  - they cannot fight a field: both are `allowWhileTyping: false` and
        //    ArrowLeft/Right are in the manager's `isTextEditKey` list, so a focused
        //    text field keeps them and the caret moves instead of the step. A gizmo
        //    drag is pointer-driven and never sees them.
        //
        // THE ARROWS ALWAYS NAVIGATE. They are not gated on the result surfaces, and
        // a gate was tried and removed: `hotkeyManager._mapKey` keys handlers by
        // TYPE+KEY rather than by id, so `video.frame.*` and `compare.frame.*` fire on
        // the same press, and yielding to them looked like the careful thing. It cost
        // the user the last step — a REPLAYED image result mounts `_compareView`
        // (MPI-587), which is non-null but binds no hotkey at all (MpiCompareView only
        // binds when a side is VIDEO), so ArrowLeft did nothing on the Generate slide.
        //
        // No gate is needed, because the collision is mostly not one. Result surfaces
        // live on the run slide only, so a middle step has no rival. On the run slide
        // ArrowRight is already a navigation no-op (`_goTo` clamps at the last index),
        // so a video keeps forward frame-stepping; ArrowLeft goes back a step, which is
        // what was asked for. The losing handler is harmless either way — the video
        // bar's own `_canDrive()` sees the slide it lives on already torn down.
        _unsubs.push(on(prevBtn, 'click', () => _goTo(_current - 1)));
        _unsubs.push(on(nextBtn, 'click', () => _goTo(_current + 1)));

        // The step hotkeys are bound per SHOW, not for the instance lifetime — see
        // _bindKeys near el.open (MPI-611).

        // ── Result painting ─────────────────────────────────────────────────────
        /** Show the empty-state copy only while the pane holds nothing. */
        function _syncResultEmpty() {
            // Hidden while a run is in flight too: between Generate and the first
            // latent the pane holds no media yet, and leaving the copy up would put
            // "Your result appears here." under the scanline — the frame claiming
            // nothing is happening while it sweeps.
            // `|| _compareView || _videoViewer` — a declared comparison paints on a
            // CANVAS and a video result paints in its own viewer, neither into the
            // media layer, so testing that layer alone put "Your result appears
            // here." on top of the result the user is looking at.
            if (_resultEmptyEl) {
                _resultEmptyEl.hidden =
                    !!_resultMediaEl?.firstChild || !!_compareView || !!_videoViewer || _running;
            }
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
            // A re-run's first latent arrives while the PREVIOUS run's comparison or
            // video player is still up; without this it would paint underneath one.
            _teardownResultSurfaces();
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
         * Remember the current result in session state, so it survives the flow being
         * closed and reopened (MPI-587).
         *
         * Four callers, and they are the complete set — every path that changes what
         * the flow should come back to:
         *   1. `_showResults`'s remember branch — a finished run AND the error/cancel
         *      clear (`_showResults([])`), which is the same branch;
         *   2. the surface toggle, so the chosen surface comes back with the result;
         *   3. the reset at the top of `_run` — the one path that drops the result
         *      WITHOUT repainting, so it cannot ride on (1);
         *   4. `_forgetResult`, when the mount probe finds the file gone.
         * It reads the component vars rather than taking arguments, so no caller can
         * persist a snapshot that disagrees with what is on screen.
         */
        function _persistResult() {
            const items = (_lastResults || []).filter(Boolean);
            const snap = items.length
                ? { items, mode: _preferredResultMode, status: _statusText, pending: _hasPending }
                : null;
            state.s_flowResults = { ...state.s_flowResults, [flow.id]: snap };
        }

        /** Forget the remembered result — its file is gone. Repaints if the pane is live. */
        function _forgetResult() {
            _lastResults = null;
            _hasPending = false;
            _statusText = '';
            _persistResult();
            if (!_resultMediaEl) return;
            _showResults(null, { remember: false });
            _paintPending();
            if (_statusEl) _statusEl.textContent = '';
        }

        /**
         * Paint ALL final results (multi-output flows produce N items — MPI-259).
         *
         * @param {Object|Array<Object>} items
         * @param {{remember?: boolean}} [opts] remember:false replays what is already
         *   stored (a slide rebuild) rather than recording a new result.
         */
        function _showResults(items, { remember = true } = {}) {
            if (remember) {
                // Normalised to an array so the persisted snapshot has ONE shape —
                // `onComplete` hands a single item for a one-output flow.
                _lastResults = items == null ? null : (Array.isArray(items) ? items : [items]);
                _persistResult();
            }
            if (!_resultMediaEl) return;
            const list = (Array.isArray(items) ? items : [items]).filter(Boolean);
            const withPath = list.map(it => ({ it, path: it?.filePath || it?.url })).filter(x => x.path);
            // Always clear first: the pane may still hold a live-latent preview whose
            // blob: URL is revoked the moment the gen ends. Leaving it in the DOM logs
            // a GET blob:… ERR_FILE_NOT_FOUND.
            _teardownResultSurfaces();
            _resultMediaEl.innerHTML = '';
            // The run is over — the sweep now lives on the frame, so clearing the
            // media layer no longer takes it with it. Guarded on _running: a slide
            // REBUILD replays the last result through here, and mid-run that would
            // disarm a sweep the run still owns (_setRunning is the only arming
            // authority now).
            if (!_running) _setScanline(false);
            if (!withPath.length) { _syncResultEmpty(); return; }
            // ONE result gets a real surface — a comparison, or the video player.
            // N outputs keep the plain elements: there is no single "after" a reveal
            // bar could show, and N players would be N decoders and N control bars.
            if (withPath.length === 1) {
                const { it, path } = withPath[0];
                _showSingleResult(it, path, _defaultResultMode(it));
                return;
            }
            _paintPlainResults(withPath);
            _syncResultEmpty();
        }

        /** A result item that should play rather than be shown as a still. */
        function _isVideoResult(it) {
            return it?.type === 'video' || it?.mediaType === 'video';
        }

        /**
         * Is this result AUDIO? Voice Changer is the first flow whose whole output is
         * a sound file, and before MPI-622 there was no branch for it — audio fell to
         * the `<img>` in `_paintPlainResults` and the pane showed a broken-image icon
         * over a file that was perfectly fine.
         * @param {Object} it
         */
        function _isAudioResult(it) {
            return it?.type === 'audio' || it?.mediaType === 'audio';
        }

        /**
         * Which surface a single result opens on.
         *
         * A declared comparison wins — that is the point of declaring it, and the
         * player is one click away. Otherwise a video gets the real player and an
         * image the plain element. An explicit toggle beats both, but only while it
         * is still POSSIBLE: the same pane replays across slide rebuilds and later
         * runs, and a remembered 'player' must not be handed an image.
         * @returns {'compare'|'player'|'plain'}
         */
        function _defaultResultMode(it) {
            const canCompare = !!(flow.result?.compare && _compareBefore());
            const canPlay = _isVideoResult(it);
            if (_preferredResultMode === 'player' && canPlay) return 'player';
            if (_preferredResultMode === 'compare' && canCompare) return 'compare';
            if (canCompare) return 'compare';
            return canPlay ? 'player' : 'plain';
        }

        /**
         * Put the single result on one surface, and offer the other one when both
         * are available. Re-entrant: the toggle and the compare-load fallback both
         * call it, and every call tears the previous surface down first.
         *
         * @param {Object} it     the result item
         * @param {string} path   its filePath/url
         * @param {'compare'|'player'|'plain'} mode
         */
        function _showSingleResult(it, path, mode) {
            _teardownResultSurfaces();
            _resultMediaEl.innerHTML = '';
            _resultSingle = { it, path };
            if (mode === 'compare' && _mountCompare(it)) {
                _resultMode = 'compare';
            } else if (mode === 'player' && _mountPlayer(it, path)) {
                _resultMode = 'player';
            } else {
                _paintPlainResults([{ it, path }]);
                _resultMode = 'plain';
            }
            _mountSurfaceToggle(it);
            _syncResultEmpty();
        }

        /**
         * The default result painting — one plain element per output.
         * @param {Array<{it:Object, path:string}>} withPath
         */
        function _paintPlainResults(withPath) {
            for (const { it, path } of withPath) {
                const url = resolveMediaUrl(path);
                if (_isAudioResult(it)) {
                    _resultMediaEl.appendChild(ce('audio', {
                        className: 'mpi-base-flow__result-audio',
                        src: url,
                        controls: true,
                    }));
                    // A player has no natural pixels for ViewManager to fit, so it is
                    // pinned at identity and the media layer centres it in CSS. Skipping
                    // this would leave the PREVIOUS result's zoom/pan on the transform.
                    // ponytail: identity instead of its own frame surface (what compare
                    // and the video player get). Wheel-zoom therefore still reaches the
                    // control — harmless, but give audio a real surface if that bites.
                    _resultView.scale = 1;
                    _resultView.offsetX = 0;
                    _resultView.offsetY = 0;
                    _applyResultTransform();
                    continue;
                }
                const isVideo = _isVideoResult(it);
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
        }

        /**
         * The BEFORE half of a declared comparison: the live media item filling the
         * slot whose role the flow named in `result.compare`.
         *
         * Read off the live slots rather than the run snapshot, so the pair on screen
         * is the pair the run actually used even after a slide rebuild reseeded them.
         * @returns {?Object}
         */
        function _compareBefore() {
            const role = flow.result?.compare;
            if (!role) return null;
            for (const { items } of _mediaGroups) {
                const hit = items.find(m => m && m.role === role);
                if (hit) return hit;
            }
            return null;
        }

        /**
         * Mount the shared compare surface over the result frame.
         *
         * The frame's own wheel-zoom and drag-pan need no disabling: every handler in
         * `_bindResultView` returns early on an empty `_resultMediaEl`, and compare
         * leaves it empty. MpiCanvas brings its own ViewManager, so the pane keeps
         * zoom and pan — they just come from the canvas, which is also what keeps the
         * reveal-bar drag from fighting a second pan implementation.
         *
         * @param {Object} resultItem the AFTER half
         * @returns {boolean} false when the flow declares no comparison or the before
         *   media is gone (reuse across a restart, a run with no input) — the caller
         *   then paints the plain element.
         */
        function _mountCompare(resultItem) {
            const before = _compareBefore();
            if (!before || !_resultFrameEl) return false;

            _compareHost = ce('div', { className: 'mpi-base-flow__result-compare' });
            _resultFrameEl.appendChild(_compareHost);
            _resultFrameEl.classList.add('mpi-base-flow__result-frame--compare');
            _compareView = MpiCompareView.mount(_compareHost);

            const host = _compareHost;
            _compareView.el.open(before, resultItem).then((ok) => {
                // A pair that will not decode must not leave a blank frame where the
                // result was — fall back to the surface the result would have had on
                // its own. Guarded on identity: the load is async and the slide may
                // already have been rebuilt.
                if (ok || _compareHost !== host || !_resultMediaEl) return;
                const path = resultItem?.filePath || resultItem?.url;
                _showSingleResult(resultItem, path, _isVideoResult(resultItem) ? 'player' : 'plain');
            });
            return true;
        }

        /**
         * Mount the REAL video player over the result frame — MpiVideoViewer in the
         * frame, MpiVideoControlBar spanning the pane below it, wired the same two
         * lines MpiGroupHistoryBlock uses. A bare `<video controls>` gave the native
         * chrome: no frame stepping, no loop button, no frame-accurate seek.
         *
         * `showTrim: true` because MpiTrimBar IS the seek bar — track, playhead and
         * in/out handles are one component, so `showTrim: false` would take the seek
         * bar with it.
         *
         * Same frame contract as compare: the media layer stays empty, which is what
         * leaves every `_bindResultView` handler inert, and the viewer brings its own
         * zoom/pan.
         *
         * @param {Object} it   the result item
         * @param {string} path its filePath/url
         * @returns {boolean} false when there is nothing to load — the caller then
         *   paints the plain element.
         */
        function _mountPlayer(it, path) {
            const url = resolveMediaUrl(path);
            if (!url || !_resultFrameEl || !_resultPaneEl) return false;
            const fps = it?.fps || 24;

            _playerHost = ce('div', { className: 'mpi-base-flow__result-player' });
            _resultFrameEl.appendChild(_playerHost);
            _resultFrameEl.classList.add('mpi-base-flow__result-frame--player');
            _videoViewer = MpiVideoViewer.mount(_playerHost, { fps });

            // The bar goes under the SPLIT, spanning the slide — not inside the result
            // column. Its fixed chrome (transport + time + volume + fullscreen) is
            // ~740px on its own, so in a ~520px column the flexible part, the seek
            // bar, was squeezed to exactly 0px wide.
            _barHost = ce('div', { className: 'mpi-base-flow__result-bar' });
            (_resultFrameEl.closest('.mpi-base-flow__slide') || _resultPaneEl).appendChild(_barHost);
            _videoBar = MpiVideoControlBar.mount(_barHost, { fps, showTrim: true });
            _videoViewer.el.attachControlBar(_videoBar);

            _videoViewer.el.loadVideo(url, {
                fps,
                duration:   it?.duration,
                frameCount: it?.frameCount,
                hasAudio:   it?.hasAudio,
            });
            return true;
        }

        /**
         * The compare/player switch — mounted only when BOTH surfaces exist for this
         * result, i.e. the flow declares a comparison AND the result is a video. One
         * surface is live at a time: two decoding video pairs behind one frame is
         * four videos for a picture nobody is looking at.
         * @param {Object} it the result item
         */
        function _mountSurfaceToggle(it) {
            if (!_resultFrameEl) return;
            const canCompare = !!(flow.result?.compare && _compareBefore());
            if (!canCompare || !_isVideoResult(it)) return;

            const host = ce('div', { className: 'mpi-base-flow__result-toggle' });
            _resultFrameEl.appendChild(host);
            const showingCompare = _resultMode === 'compare';
            _surfaceToggle = MpiButton.mount(host, {
                icon:  showingCompare ? 'play' : 'compare',
                label: showingCompare ? 'Player' : 'Compare',
                size:  'sm',
                info:  showingCompare
                    ? 'Play the result on its own'
                    : 'Compare the result against your source',
            });
            _surfaceToggle.on('click', () => {
                const single = _resultSingle;
                if (!single) return;
                // Remembered so a slide rebuild replays the surface the user chose,
                // the same way _lastResults replays the result itself — and persisted
                // with it, so a reopened flow comes back on that surface too.
                _preferredResultMode = _resultMode === 'compare' ? 'player' : 'compare';
                _showSingleResult(single.it, single.path, _preferredResultMode);
                _persistResult();
            });
        }

        /** Drop the compare surface and hand the frame back to the media layer. */
        function _teardownCompare() {
            if (_compareView) {
                _compareView.el.destroy();
                _compareView = null;
            }
            _compareHost?.remove();
            _compareHost = null;
            _resultFrameEl?.classList.remove('mpi-base-flow__result-frame--compare');
        }

        /** Drop the video player and its control bar. */
        function _teardownPlayer() {
            // Viewer first: its destroy detaches the bar's surface (and with it the
            // bar's video hotkeys) before the bar itself goes.
            _videoViewer?.destroy?.();
            _videoViewer = null;
            _videoBar?.destroy?.();
            _videoBar = null;
            _playerHost?.remove();
            _playerHost = null;
            _barHost?.remove();
            _barHost = null;
            _resultFrameEl?.classList.remove('mpi-base-flow__result-frame--player');
        }

        /** Drop every result surface — the state `_showResults` starts from. */
        function _teardownResultSurfaces() {
            _teardownCompare();
            _teardownPlayer();
            _surfaceToggle?.destroy?.();
            _surfaceToggle = null;
            _resultMode = 'plain';
            _resultSingle = null;
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
            // Flow-level last. An id declared on BOTH surfaces is written to both
            // stores by `_writeDeclaredField`, so this order no longer decides
            // anything for a shared id — the two hold the same value. Before that it
            // did, and silently: the run slide's stale copy overwrote what the user
            // edited on the step, from the second run onward (MPI-606 bug 6).
            Object.entries(_fieldValues).forEach(_sort);

            // A step that declares `param` binds its GIZMO's value to an injection
            // param (MPI-572). The flow says which role feeds which node — that is
            // flow knowledge and stays declared — while the kind supplies the shape
            // the graph wants. Together they replace the one job a `uiComponent`
            // could do that a FlowDef could not say: `getInputs({ stepValues })`.
            // A null is OMITTED, so an unmarked step leaves the node on its baked
            // default, exactly as the old translation did.
            //
            // `param` is EITHER a string (one value, the common case) OR a map of the
            // kind's named outputs to param names, for a kind that feeds more than one
            // node — `place` returns `{ region, mode }` and Object Stamp declares
            // `param: { region: 'box1', mode: 'Input_Mode' }` (MPI-596). A null entry
            // is omitted either way, so an unmarked step leaves the node on its baked
            // default. A map naming a key the kind does not return is a no-op rather
            // than an error: the kind owns its shape, the flow owns the node names, and
            // neither can be validated against the other from here.
            (flow.steps || []).forEach((step) => {
                if (!step?.param || !step.role) return;
                const v = stepValueToParam(step.kind, _stepValues[step.role]);
                if (v === null || v === undefined) return;
                if (typeof step.param === 'string') {
                    declaredParams[step.param] = v;
                    return;
                }
                for (const [key, name] of Object.entries(step.param)) {
                    if (v[key] === null || v[key] === undefined) continue;
                    declaredParams[name] = v[key];
                }
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

            // A DERIVED param is computed from another field and never shown (MPI-607).
            // Text to Speech's arm selector is the case: the user picks a language and
            // the multilingual boolean follows, so the one state the pair could
            // disagree in — English words coming out of a non-English pick — cannot be
            // reached. Deliberately NOT a predicate language: read `from`, compare to
            // `equals`, send `then` or `else`, the same "one shape, one meaning" call
            // MPI-620 made when it rejected `showWhen` for `blankOnly`.
            (flow.derived || []).forEach((d) => {
                if (!d?.id || !d.from) return;
                const src = _fieldValues[d.from] ?? _decls.get(d.from)?.default;
                const out = String(src) === String(d.equals) ? d.then : d.else;
                if (isInjectionParam(d.id)) declaredParams[d.id] = out; else declared[d.id] = out;
            });

            // The emotion pair rides along in `declared` deliberately. Stripping it as
            // UI-only was tried and reverted: `_persistInputs` collects through THIS
            // function, so a stripped field is a field Reuse cannot restore — the user
            // would reopen a card and find Emotion back at None. They are plain run
            // inputs the op has no mapping for, which costs nothing.

            return {
                ...(mediaItems.length ? { mediaItems } : {}),
                ...(Object.keys(_stepValues).length ? { stepValues: { ..._stepValues } } : {}),
                ...declared,
                ...(Object.keys(declaredParams).length
                    ? { injectionParams: { ...declaredParams } }
                    : {}),
            };
        }

        // ── Session persistence ─────────────────────────────────────────────────
        // `state.s_flowInputs[flow.id]` is SESSION SCRATCH: what the user was doing,
        // so reopening the flow puts it back. It used to be written in exactly ONE
        // place — inside `_run` — so anything dropped or typed BEFORE Generate died
        // with the closure the shell destroys on navigation (MPI-345). Drop a photo,
        // visit the gallery, come back: gone (MPI-606 bug 1).
        //
        // NOT the same thing as `flowInputs` on the sidecar, which stays frozen at
        // Run so a mid-run edit cannot corrupt what Reuse restores
        // (`03-storage-and-reuse.md` § "Snapshot at Run, never at completion"). Keep
        // them separate — persisting THIS one live does not touch that rule.
        /** @type {?number} */
        let _persistTimer = null;

        /**
         * Persist the input snapshot. Top-level replace — `s_flowInputs` is a Proxy
         * key and mutating the sub-object would not fire `state:changed`.
         * @param {Object} [inputs]  a snapshot already collected by the caller
         */
        function _persistInputs(inputs) {
            if (_persistTimer) { clearTimeout(_persistTimer); _persistTimer = null; }
            state.s_flowInputs = {
                ...state.s_flowInputs,
                [flow.id]: inputs || _collectInputs(),
            };
        }

        /**
         * Persist SOON. A gizmo reports on every pointer move and a text field on
         * every keystroke; each write replaces a top-level Proxy key and fires
         * `state:changed` app-wide, so the frequent paths trail it instead of
         * hammering it. Flushed in `destroy()`, which is the path that matters —
         * navigation destroys this instance.
         */
        function _touchInputs() {
            if (_persistTimer) clearTimeout(_persistTimer);
            _persistTimer = setTimeout(() => { _persistTimer = null; _persistInputs(); }, 300);
        }

        /**
         * Derive the media the RUN uses, where a step kind changes the picture
         * rather than a widget (`stepValueToMedia`, MPI-594 — the outpaint crop
         * is the first). The derived file is placed in the same preview-asset
         * store a dropped file goes to, so it dedupes and Cleanup GCs it.
         *
         * Returns null when a derivation was needed and FAILED. That aborts the
         * run: falling back to the original would generate from an un-padded
         * image, which comes back looking like the model ignored the request.
         *
         * A step may declare `mediaRole` to deliver its file to a DIFFERENT role
         * than the one it operates on (MPI-567). `crop` does not want that — a
         * padded picture replaces the picture it padded — but `paint` does: the
         * user draws on the photo and the graph wants BOTH, so the layer lands in
         * its own slot and the photo survives beside it. Still declaration-only,
         * so it stays manifest-expressible.
         *
         * @param {Array<Object>} mediaItems
         * @returns {Promise<Array<Object>|null>}
         */
        async function _deriveRunMedia(mediaItems) {
            const steps = (flow.steps || []).filter(s => s?.kind && s.role);
            if (!steps.length) return mediaItems;

            let out = mediaItems;
            for (const step of steps) {
                const media = out.find(m => m?.role === step.role) || null;
                // The other half of the same rule as `_buildStepSlide` above, and the
                // half that is easy to miss: a step that CREATES its picture must still
                // reach the deriver with no source, or the drawing never becomes media
                // and the run goes out with nothing in the slot (MPI-620).
                if (!media && !step.composite) continue;
                // The SOURCE role's media, read out of `out` rather than `_mediaGroups`:
                // a kind that derives its picture from a second role wants that role as
                // the run will see it, which is an EARLIER step's derived file whenever
                // one exists. Object Stamp's stage 3 stamps the object stage 2 cut, and
                // gets it because this loop walks the steps in flow order (MPI-596).
                const source = step.sourceRole
                    ? out.find(m => m?.role === step.sourceRole) || null
                    : null;
                const file = await stepValueToMedia(step.kind, _stepValues[step.role], media, step, source);
                if (!file) continue;   // this kind derives nothing, or nothing changed
                const project = state.currentProject;
                const url = project ? await _placePreviewAsset(file, 'image', project) : null;
                if (!url) return null;
                const dest = step.mediaRole || step.role;
                const target = out.find(m => m?.role === dest);
                out = target
                    ? out.map(m => (m === target ? { ...m, url, source: 'flow-derived' } : m))
                    : [...out, {
                        url,
                        mediaType: media?.mediaType || 'image',
                        source: 'flow-derived',
                        role: dest,
                    }];
            }
            return out;
        }

        const _run = async () => {
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

            // `promptRequired` is HONOURED HERE (MPI-606 bug 5). The flag has been
            // declared on fifteen-odd ops since the registry was written and read by
            // NOTHING — so Fabio ran Scribble to Object with an empty prompt and got
            // a shape invented from the ControlNet hint alone, even though its op
            // declares it. The guard above is not this one: it fires only when there
            // is NEITHER media NOR a prompt, so a photo with no prompt sailed through.
            //
            // SCOPE, chosen deliberately: the FLOW FRAME ONLY. Every Flow declares
            // its prompt as a field with id `positive`, so one check covers all of
            // them. The honest-but-wider option was `enqueueGeneration`, beside its
            // missing-media and missing-mask siblings — rejected because it would
            // also start refusing `i2i` / `inpaint` / `edit` / `promptEnhance` runs
            // that ship today, which is a behaviour change on surfaces nobody
            // reported and no test covers. The flag therefore stays inert on the
            // eleven non-flow ops that declare it; that residual is on the card.
            if (getCommand(flow.operation)?.promptRequired && !hasPrompt) {
                Events.emit('ui:warning', {
                    message: `${flow.title} needs a prompt before it can run.`,
                });
                return;
            }

            // Persist the input snapshot so Reuse/reopen restores media + controls.
            // Also written live as the user works — see `_persistInputs`.
            _persistInputs(inputs);

            _setRunning(true);
            _hasPending = false;
            // Drop the previous result NOW: navigating away mid-run would otherwise
            // replay the last image over the top of the run in progress. Persisted
            // too, so CLOSING mid-run does not bring the superseded result back
            // (MPI-587) — this path never reaches `_showResults`.
            _lastResults = null;
            _persistResult();
            _paintPending();
            _setGauge(0);
            _setStatus('Generating…');
            _myTempId = null;

            // A step kind may have to REDRAW the input before anything samples it
            // (the outpaint crop). Derived here, never in `inputs`: the snapshot
            // above is what Reuse restores, and it must stay the user's own image
            // plus the rect that produced this one.
            let runMediaItems;
            try {
                runMediaItems = await _deriveRunMedia(mediaItems);
            } catch (err) {
                clientLogger.error('MpiBaseFlow', `step media derivation failed: ${err?.message || err}`);
                runMediaItems = null;
            }
            if (!runMediaItems) {
                _setRunning(false);
                _setStatus('');
                Events.emit('ui:warning', {
                    message: `${flow.title} could not prepare its image — nothing was generated.`,
                });
                return;
            }

            const res = submitFlowGeneration(flow, { ...inputs, runMediaItems }, {
                onComplete: ({ item, items } = {}) => {
                    _setRunning(false);
                    _myTempId = null;
                    _setGauge(100);
                    // Already in the gallery — the run path commits on completion.
                    _setStatus('Done — saved to your gallery.');
                    // Set BEFORE the paint: on THIS path `_showResults` is what
                    // persists the result (MPI-587), and the note belongs in that
                    // snapshot. Nothing in the paint path reads the flag.
                    _hasPending = true;
                    _showResults(items || item);
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

        // Ctrl+Enter runs the OPEN flow, not the PromptBox behind it — bound per
        // SHOW, see _bindKeys near el.open (MPI-611).

        // ── Back to Library = close this overlay, reopen the Flow Library ────────
        _unsubs.push(on(qs('#flow-back', el), 'click', () => {
            el.close();
            Events.emit('flows:open');
        }));

        // ── Open / close ─────────────────────────────────────────────────────────
        // Closing with an unapplied result does NOT prompt (decided 2026-07-18):
        // with no Discard, a re-run overwrites and closing drops — nothing unique
        // is destroyed, so a confirm would guard a non-decision.
        //
        // HOTKEYS ARE PER-SHOW (MPI-611). A SUSPENDED flow — hidden by the Tab ring
        // but deliberately NOT destroyed — keeps every listener this setup registered.
        // Instance-lifetime binds would leave ArrowLeft/Right stepping an invisible
        // carousel and Ctrl+Enter queueing a phantom flow run from the gallery: exactly
        // the MPI-345 bug, in the shape a hidden-but-alive flow brings back.
        let _keyBinds = [];
        const _bindKeys = () => {
            if (_keyBinds.length) return;
            _keyBinds = [
                Hotkeys.bind('flow.step.back', () => _goTo(_current - 1)),
                Hotkeys.bind('flow.step.forward', () => _goTo(_current + 1)),
                Hotkeys.bind('generation.run', _run),
            ];
        };
        const _unbindKeys = () => { _keyBinds.forEach(fn => fn?.()); _keyBinds = []; };
        _unsubs.push(_unbindKeys);

        el.open  = () => { overlay.el.show(); _bindKeys(); };
        el.close = () => { _unbindKeys(); overlay.el.hide(); };
        el.onOpen = el.open;

        // Suspend = hide WITHOUT the outward `close`, so the shell keeps this instance
        // alive (MPI-611). The Tab ring parks the flow here on its way to the gallery
        // and re-shows it with el.open(); the DOM, the collected inputs, the current
        // step and an in-flight run all survive, because nothing was torn down. A real
        // close still destroys — only the outward emit is suppressed.
        el.suspend = () => {
            if (_suspending) return;
            _suspending = true;
            el.close();
            _suspending = false;
        };

        el.destroy = () => {
            // Flush a trailing persist before the closure dies — this IS the
            // navigation path (the shell destroys the flow on every `flow:open` and
            // on close, MPI-345), so a keystroke inside the last 300ms would
            // otherwise be the one thing the reopen could not restore.
            if (_persistTimer) _persistInputs();
            _teardownSlide();
            _previewPlayer.stop();
            _unsubs.forEach(fn => fn?.());
            // _teardownSlide already dropped the buttons; the overlay outlives them.
            _loraSettings?.el?.destroy?.();
            _loraSettings = null;
            overlay?.el?.destroy?.();
        };

        // ── Boot ────────────────────────────────────────────────────────────────
        _buildTicker();
        _renderSlide();
    },
});
