/**
 * flowService.js — Run path for Flows (MPI-256).
 *
 * A Flow is a second producer into the generation queue: it builds a config from
 * its descriptor + collected inputs and hands it to enqueueGeneration() exactly like
 * the History block's universal tool ops (model:{id:null}, no getNextGeneration).
 *
 * The one thing the universal path does NOT do on its own is a MODEL guard — universal
 * ops resolve their weights at dispatch and would fail deep in the engine if a required
 * model isn't installed. So submitFlowGeneration pre-flights flowAvailability and aborts
 * with a toast BEFORE anything enters the queue.
 */

'use strict';

import { enqueueGeneration } from './generationService.js';
import { getFlowById, flowAvailability, flowModelParams, flowLoraPhases, flowModelIds } from '../data/flowsRegistry.js';
import { getModelById } from '../data/modelRegistry.js';
import { state } from '../state.js';
import { Events } from '../events.js';

/**
 * Queue a generation for a Flow.
 *
 * @param {import('../data/flowsRegistry.js').FlowDef|string} flowOrId
 * @param {Object} inputs - Collected by MpiBaseFlow from the FlowDef. Media are passed by
 *                          reference (content-addressed store paths), never base64.
 * @param {Object} [callbacks] - onComplete/onError/onCancel, forwarded to enqueueGeneration.
 * @param {{operation?: string, tempId?: string}} [_leg] - INTERNAL, set only by the chain
 *        below when this call IS the second leg. Never passed by a caller.
 * @returns {{queueJobId: string}|null} enqueue result, or null if the guard aborted.
 */
/**
 * What is actually absent, for a toast that names it. MPI-304: a flow can require deps
 * no model owns (a baked LoRA, a node pack), so always saying "models" read as
 * "needs models installed" while the Library showed every model Ready.
 * @param {{missing: string[], missingDeps: string[]}} availability
 * @returns {string}
 */
function _missingLabel({ missing, missingDeps }) {
    if (!missing.length) return 'extra files';
    return missing.length === 1 && !missingDeps.length ? 'a model' : 'models';
}

/**
 * TWO-LEG FLOWS (MPI-623). A flow declaring `chain: { operation }` runs as TWO ordinary
 * jobs: leg 1, then leg 2 dispatched from leg 1's completion. The queue runs jobs in
 * order and each leg is one prompt, so both honour the lane-settle invariants MPI-463/461
 * protect — this is deliberately NOT a two-prompt job inside commandExecutor's lane
 * machinery, which is the expensive version of the same thing.
 *
 * WHY two prompts rather than one graph: ComfyUI never evicts what the CURRENT prompt
 * produced (`comfy_execution/caching.py`, and no caller passes `free_active=True`). The
 * 3D Scene bake's second stage spikes to ~43 GB on its own, so it needs the machine
 * otherwise empty — and only a NEW prompt bumps the cache generation that frees the
 * first stage. Nothing flows between the legs at runtime: leg 2 addresses leg 1's output
 * by name, which is known before either starts.
 *
 * The CALLER sees ONE completion, on leg 2 — the flow is not done until the second half
 * is. Leg 1's own card still lands when leg 1 finishes; the run path commits it, not this
 * callback. If leg 2 cannot enqueue (its model guard aborts), leg 1's completion is
 * forwarded instead, so the pane reports done rather than hanging on a job that never ran.
 *
 * `submitLeg2` is passed in rather than closed over so this branch is reachable from a
 * test — importing flowService is cheap, but reaching `enqueueGeneration` is not.
 *
 * @param {import('../data/flowsRegistry.js').FlowDef} flow
 * @param {Object} callbacks - the CALLER's callbacks.
 * @param {function():(Object|null)} submitLeg2 - dispatches the second leg.
 * @returns {Object} callbacks to hand enqueueGeneration for leg 1.
 */
export function chainCallbacks(flow, callbacks, submitLeg2) {
    if (!flow.chain?.operation) return callbacks;
    return {
        ...callbacks,
        onComplete: (result) => {
            if (!submitLeg2()) callbacks.onComplete?.(result);
        },
    };
}

export function submitFlowGeneration(flowOrId, inputs = {}, callbacks = {}, _leg = {}) {
    const flow = typeof flowOrId === 'string' ? getFlowById(flowOrId) : flowOrId;
    if (!flow) {
        Events.emit('ui:warning', { message: 'That flow could not be found.' });
        return null;
    }

    // Pre-flight MODEL + DEP guard — universal ops have none of their own. MPI-304:
    // a flow can also require deps no model owns (a baked LoRA, a node pack); those
    // block exactly like a missing model, so name whichever is actually absent rather
    // than always saying "models" (with models present and only a dep missing, the old
    // copy read "needs models installed" while the library showed every model Ready).
    const availability = flowAvailability(flow);
    if (!availability.available) {
        Events.emit('ui:warning', {
            message: `${flow.title} needs ${_missingLabel(availability)} installed first — open it in Flows to install.`,
        });
        return null;
    }

    // Build config from the descriptor + inputs. Positive/negative stay empty unless
    // the flow declares them.
    //
    // A flow still runs with `model.id: null` — it is an OPERATION, not a model, and
    // that null is what keeps `getModelSettings` (keyed by model id) out of the path.
    // A `requiredModels` slot marked `loras: true` is the deliberate exception: it says
    // "this phase of my graph carries a user LoRA rack, and the running model's settings
    // are what fill it".
    //
    // This reverses the "RUN CLEAN, no project LoRAs" rule that stood here — Fabio's
    // call on MPI-504: a user who already has a character LoRA should be able to load
    // it and describe only the wardrobe and face on top. The LoRA carries identity, the
    // sheet carries the layout. It stays OPT-IN per SLOT, so every flow that declares
    // nothing still runs exactly as clean as before — which two shipped LTX flows rely
    // on, since both carry Input_Lora nodes they deliberately never fill (MPI-608).
    //
    // WHAT RUNS vs WHAT REUSE RESTORES — they are not always the same media (MPI-594).
    // A step kind may redraw the input before the graph sees it (the outpaint crop
    // composes source + black bars into one file). That derived file is a RUN detail:
    // the snapshot has to keep the user's own image plus the rect, or a reuse would
    // outpaint an already-outpainted picture. So `runMediaItems` is stripped here and
    // never reaches `flowInputs`.
    const { runMediaItems, ...snapshot } = inputs;
    // ponytail: the chained leg takes NO media. Its graph reads what leg 1 wrote to
    // disk, addressed by name (`Input_Name`), so re-sending the source image would only
    // stage a file nothing loads. One rule, no per-flow knob — a chained leg that DID
    // want media would be a different feature.
    const mediaItems = _leg.operation ? []
        : Array.isArray(runMediaItems) ? runMediaItems
        : Array.isArray(snapshot.mediaItems) ? snapshot.mediaItems : [];
    const config = {
        // The op picks the GRAPH (universal_workflows.js). A two-leg flow declares one
        // op per leg, which is why the chain needs no second `workflow` field on FlowDef.
        operation: _leg.operation || flow.operation,
        model: { id: null, mediaType: flow.mediaType || 'image' },
        positive: inputs.positive || '',
        negative: inputs.negative || '',
        mediaItems,
        // MPI-590: the params that identify WHICH member of an any-of set is running go
        // in FIRST, so a collected field of the same name still wins. Empty `{}` for every
        // flow that declares no `modelParams`. This is the hop that makes the picker real
        // — the same hop `loraModelId` was missing in MPI-504, where the panel saved real
        // slots and the image came back identical.
        injectionParams: { ...flowModelParams(flow), ...(inputs.injectionParams || {}) },
        // Which model's LoRA rack fills which PHASE of this flow's graph — one
        // `{ phase, modelId }` per `requiredModels` slot that declared `loras: true`, and
        // `[]` for every flow that declared none. NOT a model selection: it never reaches
        // model resolution or workflow lookup, which stay driven by `operation`. Each id is
        // resolved through its any-of set so the rack follows the member actually running
        // (MPI-590), not the id the descriptor happens to list first.
        //
        // Was a single `loraModelId` string (MPI-504). One string named one rack, so a flow
        // picking a model PER PHASE could fill neither correctly (MPI-608).
        loraPhases: flowLoraPhases(flow),
        // Additive, threaded to the sidecar save path (Phase 2 item 4) so Reuse can
        // reopen this Flow with its inputs restored.
        flowId: flow.id,
        flowInputs: snapshot,
        // WHICH model ran in each slot, one id per `requiredModels` slot in declaration
        // order (MPI-620). A flow card carries `modelId: null` by design, so without this
        // nothing on disk says whether Scribble rendered on klein-9b or klein-4b. The tier
        // WAS recoverable from `injectionParams.Input_Edit_Model`, but only by mapping
        // weight FILENAMES back to model ids — which breaks the day a weight is re-exported.
        // Rides in `generationSettings` (generationService), not as a new item field: that
        // blob is already the sidecar's free-form run snapshot, so this needs no route,
        // projectModel or migration change.
        flowModelIds: flowModelIds(flow),
    };

    // No gallery placeholder (MPI-306): a flow run is not pending in the gallery
    // because it will not land there unless the user applies it. The flow's own
    // result pane is where the run is visible — live latents reach it by tempId
    // (preview:frame → activeGenerations.byPromptId, MPI-271).
    // The chained leg REUSES leg 1's tempId. MpiBaseFlow holds exactly one `_myTempId`
    // per run and matches live latents and Cancel through it, so a fresh id on leg 2
    // would leave the pane unable to cancel or preview the second half. The two legs are
    // sequential — leg 1 has ended before leg 2 enqueues — so nothing shares it at once.
    const tempId = _leg.tempId || crypto.randomUUID();

    // NO getNextGeneration — arming the loop would re-fire flow gens. forceLocal only
    // when the user has explicitly pinned the local engine (mirrors state.engineOverride).
    //
    // Results commit on completion (MPI-306 Phase 3 was built, then REMOVED after
    // the UX pass — an Apply step the user never wanted to skip is friction). Still
    // NO gallery placeholder: the flow's own result pane shows the run, so a second
    // in-progress card in the gallery behind the overlay is noise. The real card
    // lands on completion.
    const opts = {
        scope: 'gallery',
        tempId,
    };
    if (state.engineOverride === 'local') opts.forceLocal = true;

    // Leg 2 never chains again — one chain, two legs.
    const legCallbacks = _leg.operation ? callbacks : chainCallbacks(flow, callbacks,
        () => submitFlowGeneration(flow, inputs, callbacks, { operation: flow.chain.operation, tempId }));

    const res = enqueueGeneration(config, legCallbacks, opts);
    // Return the tempId so the caller (MpiBaseFlow) can match this job's live latent
    // previews (preview:frame → activeGenerations.byPromptId → entry.tempId; MPI-271).
    return res ? { ...res, tempId } : null;
}

/**
 * Reuse routing for Flow cards (MPI-256 Phase 5). A flow gen's sidecar carries
 * `flowId` + `flowInputs`; Reuse on such a card must reopen the APP with those inputs
 * restored, NOT fill the PromptBox. Both Gallery + History reuse entry points call
 * this at the TOP of their reuse path and `return` when it handles the item.
 *
 * Seeds `state.s_flowInputs[flowId]` (top-level replace) BEFORE emitting `flow:open`,
 * so the freshly-mounted MpiBaseFlow reads the restored inputs on mount.
 *
 * REUSE ALWAYS OPENS THE FLOW, whatever is installed (MPI-620, Fabio's call). It used to
 * refuse on `!flowAvailability().available` and bounce the user to the Flow Library — so
 * the flow never mounted and the saved `flowInputs` were never restored. For Scribble
 * those inputs ARE the user's drawing, and a missing weight cost them the picture. A model
 * that is gone is a SUBSTITUTION, not a failure: `flowModelIds` already resolves a card
 * made on klein-9b to klein-4b when only 4B is installed. So the outcome is a toast over
 * the open flow (see `_reuseModelToast`) and the user installs and presses Generate
 * instead of redrawing.
 *
 * @param {Object} item - The reused history item (payload.item).
 * @returns {boolean} true if the item was a flow card and was handled.
 */
export function openFlowFromReuse(item) {
    // ponytail: `appId`/`appInputs` are the pre-rename key names (MPI-256 shipped
    // dev-gated only, so this is local dev data — never a released user's). The Flow
    // ids themselves did NOT change, so getFlowById resolves an old card unchanged.
    // Drop both fallbacks after the next release.
    const flowId = item?.flowId ?? item?.appId;
    if (!flowId) return false;
    const flow = getFlowById(flowId);
    if (!flow) return false; // unknown flow id → let normal reuse handle it

    // Restore the saved inputs, then open the flow. Seed first — MpiBaseFlow reads
    // s_flowInputs[flowId] on mount.
    const savedInputs = item.flowInputs ?? item.appInputs;
    if (savedInputs && typeof savedInputs === 'object') {
        state.s_flowInputs = { ...state.s_flowInputs, [flowId]: savedInputs };
    }
    // Defer the open by a tick: Reuse is triggered from a context menu / reuse
    // dialog whose teardown fires a bare `ui:close-all-popups` AFTER this returns —
    // which the Flow overlay (MpiOverlay) obeys and would immediately hide. Emitting
    // on the next tick lets that close settle first, so the flow actually opens.
    // The toast goes in the SAME tick, after the open, so it lands over the flow.
    setTimeout(() => {
        Events.emit('flow:open', { flowId });
        _reuseModelToast(flow, item);
    }, 0);
    return true;
}

/**
 * Tell the user what will actually run, once the reused flow is open (MPI-620).
 *
 * Two cases, and only two — silence otherwise, because the common reuse runs exactly
 * what the card ran:
 *  - nothing installed for a slot → DANGER toast. The flow stays open with the inputs
 *    intact, so this is "install it and press Generate", not a dead end.
 *  - a different candidate resolves than the one recorded → WARNING toast naming both
 *    tiers. Needs `generationSettings.flowModelIds`, which flow gens have carried since
 *    MPI-620; a card saved before that says nothing, so it gets no toast rather than a
 *    guess made from weight filenames.
 *
 * @param {import('../data/flowsRegistry.js').FlowDef} flow
 * @param {Object} item
 */
function _reuseModelToast(flow, item) {
    const availability = flowAvailability(flow);
    if (!availability.available) {
        Events.emit('ui:danger', {
            message: `${flow.title} needs ${_missingLabel(availability)} installed — install from Flows, then press Generate. Your inputs are kept.`,
        });
        return;
    }
    const ran = item.generationSettings?.flowModelIds;
    if (!Array.isArray(ran)) return;
    const swapped = flowModelIds(flow)
        .map((id, i) => ({ id, was: ran[i] }))
        .filter(slot => slot.was && slot.was !== slot.id);
    if (!swapped.length) return;
    const names = swapped
        .map(slot => `${_modelName(slot.id)} instead of ${_modelName(slot.was)}`)
        .join(', ');
    Events.emit('ui:warning', {
        message: `${flow.title} will run on ${names} — the model this was made with isn't installed.`,
    });
}

/** Display name for a model id, falling back to the id itself for an unknown one. */
function _modelName(id) {
    return getModelById(id)?.name || id;
}
