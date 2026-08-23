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
import { getFlowById, flowAvailability, flowModelParams, flowLoraPhases } from '../data/flowsRegistry.js';
import { state } from '../state.js';
import { Events } from '../events.js';

/**
 * Queue a generation for a Flow.
 *
 * @param {import('../data/flowsRegistry.js').FlowDef|string} flowOrId
 * @param {Object} inputs - Collected by MpiBaseFlow from the FlowDef. Media are passed by
 *                          reference (content-addressed store paths), never base64.
 * @param {Object} [callbacks] - onComplete/onError/onCancel, forwarded to enqueueGeneration.
 * @returns {{queueJobId: string}|null} enqueue result, or null if the guard aborted.
 */
export function submitFlowGeneration(flowOrId, inputs = {}, callbacks = {}) {
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
    const { available, missing, missingDeps } = flowAvailability(flow);
    if (!available) {
        const what = !missing.length ? 'extra files'
            : missing.length === 1 && !missingDeps.length ? 'a model'
                : 'models';
        Events.emit('ui:warning', {
            message: `${flow.title} needs ${what} installed first — open it in Flows to install.`,
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
    const mediaItems = Array.isArray(runMediaItems) ? runMediaItems
        : Array.isArray(snapshot.mediaItems) ? snapshot.mediaItems : [];
    const config = {
        operation: flow.operation,
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
    };

    // No gallery placeholder (MPI-306): a flow run is not pending in the gallery
    // because it will not land there unless the user applies it. The flow's own
    // result pane is where the run is visible — live latents reach it by tempId
    // (preview:frame → activeGenerations.byPromptId, MPI-271).
    const tempId = crypto.randomUUID();

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

    const res = enqueueGeneration(config, callbacks, opts);
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
 * so the freshly-mounted MpiBaseFlow reads the restored inputs on mount. If a required
 * model is missing, routes to the Flow Library overlay (to install) instead of a broken flow.
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

    const { available } = flowAvailability(flow);
    if (!available) {
        // Missing a required model — send the user to the Library to install it,
        // rather than opening a flow that can't run.
        Events.emit('ui:warning', {
            message: `${flow.title} needs its model installed — opening Flows.`,
        });
        Events.emit('flows:open');
        return true;
    }

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
    setTimeout(() => Events.emit('flow:open', { flowId }), 0);
    return true;
}
