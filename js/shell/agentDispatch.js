/**
 * agentDispatch.js — renderer end of the agent generation relay (MPI-546).
 *
 * Dispatch lives here, in the renderer, and cannot move: `generationService`
 * imports `MpiToast` and `PromptBoxControls`, `commandExecutor` pulls `state`,
 * `Events` and `downloadService`. So an agent's `POST /connector/generate` is
 * relayed to this listener over an always-on SSE stream, dispatched through the
 * normal queue, and its outcome POSTed back.
 *
 * This module is the DISPOSABLE half of MPI-546 — the HTTP route is the contract.
 * Keep it dumb: one job in, one result out. Anything richer (media staging, job
 * status, cancellation) belongs server-side in `routes/connector.js`, where it
 * survives dispatch ever being extracted out of the renderer.
 *
 * It is a THIRD producer into the generation queue, after the Gallery/History
 * blocks and `flowService` — and like flowService it goes THROUGH
 * `enqueueGeneration`, never around it, so the dispatch guards and the lane/store
 * contract hold exactly as they do for a Cue press.
 *
 * MPI-592 adds a second capability, `project.open`, for the same reason dispatch
 * is here: `openProject` reconciles and hydrates through the renderer's state.
 * A submit runs in `state.currentProject` and nothing server-side can change it,
 * so without this an agent that created a project generated into the PREVIOUS
 * one — successfully, with `ok: true`, into the wrong gallery.
 */

import { enqueueGeneration, findMissingMediaSlot } from '../services/generationService.js';
import { submitFlowGeneration } from '../services/flowService.js';
import { openProject } from '../services/projectService.js';
import { navigate, PAGE_GALLERY } from '../router.js';
import { getModelById, isOperationInstalled } from '../data/modelRegistry.js';
import { getFlowById, flowAvailability } from '../data/flowsRegistry.js';
import { resolveFlowFieldValues, flowDeclaredFields } from '../utils/declaredFields.js';
import { getCommandMediaInputs } from '../data/commandRegistry.js';
import { getSharedSettings } from '../data/projectModel.js';
import { getModelRatios } from '../utils/ratios.js';
import { state } from '../state.js';
import { clientLogger } from '../services/clientLogger.js';

/**
 * The generation's size, resolved from the project's SAVED ratio — the same state
 * the PromptBox shows and Reuse restores.
 *
 * This is INJECTED, not just used to size the card. The workflow bakes its own
 * `Input_Width`/`Input_Height` (krea2 t2i ships 768x1344 authoring residue), and the
 * injector only overrides them when `injectionParams` carries Width/Height. The
 * PromptBox always resolves the ratio before dispatch; an agent submit sends no
 * injectionParams, so without this every agent generation silently ignored the
 * project's ratio and came out at the workflow default — five 9:16 images in a
 * project set to 1:1, with nothing in the sidecar to explain why.
 *
 * The mismatched placeholder padding was the visible half of that; the wrong output
 * size was the real half.
 *
 * Returns 0/0 when no ratio is saved, which leaves the baked default in place and
 * tells the grid to adopt the finished aspect — the honest answer, not a guess.
 */
function _plannedSize(model, injectionParams = {}) {
    if (injectionParams.Width && injectionParams.Height) {
        return { width: injectionParams.Width, height: injectionParams.Height };
    }
    const shared = getSharedSettings(state.currentProject, model.mediaType || 'image');
    const sel = shared?.ratioSelector;
    if (!sel) return { width: 0, height: 0 };
    // qualityTier is SHARED state, not per-model (projectModel.js § getModelSettings).
    // A `qualityTier` key does appear inside modelSettings[id] on real projects — it
    // is leftover, and reading it there would silently size off a stale tier.
    const list = getModelRatios(model.type, sel.orientation, sel.qualityTier) || [];
    const match = list.find(r => r.label === sel.selectedRatio);
    return { width: match?.w || 0, height: match?.h || 0 };
}

let _source = null;
/** Job ids already reported — the "one result out" half of the contract. */
const _settled = new Set();

/** POST a job's outcome back. Late/duplicate reports are dropped here and no-op'd server-side. */
async function _report(jobId, payload) {
    if (_settled.has(jobId)) return;
    _settled.add(jobId);
    try {
        await fetch(`/connector/jobs/${jobId}/result`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload),
        });
    } catch (err) {
        clientLogger.error('connector', `Failed to report job ${jobId}`, err);
    }
}

const _fail = (jobId, code, message) => _report(jobId, { ok: false, error: { code, message } });

/**
 * Run one `generation.submit` job. Every exit path reports exactly once — an
 * unreported job leaves the caller's HTTP request hanging until the route's
 * timeout, which reads as a dead app.
 */
function _submitGeneration(jobId, input = {}) {
    // A Flow is an OPERATION with no model (`model.id: null`), so it can never
    // arrive as a modelId and needs its own resolution. One capability either way:
    // the caller asks for a generation, and `flowId` is what says which kind.
    if (input.flowId) return _submitFlow(jobId, input);

    const { modelId, operation, positive = '', negative = '', injectionParams = {} } = input;

    if (!state.currentProject) {
        return _fail(jobId, 'NO_PROJECT', 'No project is open in Vision. Open one first.');
    }

    const model = getModelById(modelId);
    if (!model) {
        return _fail(jobId, 'UNKNOWN_MODEL', `No model with id "${modelId}".`);
    }

    // Covers BOTH halves in one call: the op must be in supportedOps and its
    // weights must be on disk for the effective engine. Checked here so the agent
    // gets a named reason — commandExecutor's own net bails with a toast it cannot see.
    if (!isOperationInstalled(model, operation)) {
        return _fail(jobId, 'OP_UNAVAILABLE',
            `"${operation}" is not available on ${model.name || modelId} — unsupported, or its weights are not installed.`);
    }

    // v1 is text-only. Reject a media op by name rather than letting the enqueue
    // guard cancel it, which would report a bare "rejected" the agent can't act on.
    const needsMedia = getCommandMediaInputs(operation).filter(slot => slot.required !== false);
    if (needsMedia.length) {
        return _fail(jobId, 'MEDIA_UNSUPPORTED',
            `"${operation}" needs ${needsMedia.map(s => s.mediaType).join(' + ')} input, which this endpoint cannot supply yet.`);
    }

    // Resolve BEFORE building the config — the size is injected into the graph, not
    // just used to draw the card, so both must agree by construction.
    const { width, height } = _plannedSize(model, injectionParams);

    const config = {
        operation,
        model,
        positive,
        negative,
        mediaItems: [],
        injectionParams: (width && height)
            ? { Width: width, Height: height, ...injectionParams }
            : injectionParams,
    };

    // A gallery gen MUST carry a tempId + placeholderGroup or the run is invisible
    // until it finishes: MpiGalleryBlock draws in-progress cards from the
    // activeGenerations entry's `placeholderGroup`, and live latents route by
    // tempId (preview:frame -> activeGenerations.byPromptId -> entry.tempId).
    // Without them an agent submit ran for its full duration behind an empty
    // gallery, then the card appeared at the end — the Cue panel was the only
    // sign anything was happening. Same shape the Cue path builds; `Generating...`
    // is the name the grid renders while `isGenerating` is true.
    const tempId = crypto.randomUUID();
    const placeholderGroup = {
        id: tempId,
        type: model.mediaType || 'image',
        name: 'Generating...',
        history: [],
        selectedIndex: 0,
        width,
        height,
        isGenerating: true,
    };

    const queued = enqueueGeneration(config, {
        onComplete: ({ item, group }) => _report(jobId, {
            ok: true,
            output: {
                itemId: item?.id,
                groupId: group?.id,
                type: item?.type,
                filePath: item?.filePath,
                seed: item?.seed,
                pixelDimensions: item?.pixelDimensions,
                generationMs: item?.generationMs,
            },
        }),
        // An `outputKind: 'text'` op produces a caption and no item (MPI-310).
        onText: (text) => _report(jobId, { ok: true, output: { text } }),
        onError: () => _fail(jobId, 'RUNTIME_ERROR',
            'The generation failed. See the app log for the cause.'),
        onCancel: () => _fail(jobId, 'CANCELLED',
            'The generation was cancelled or produced no output.'),
    }, { scope: 'gallery', tempId, placeholderGroup });

    // A guard inside enqueueGeneration rejects by returning null — it fires
    // onCancel on its way out, so the report is already in flight. Belt and braces
    // for a future guard that returns null silently.
    if (!queued) {
        return _fail(jobId, 'REJECTED', 'Vision rejected the job before it entered the queue.');
    }
    return null;
}

/**
 * Run one `generation.submit` job that named a `flowId`.
 *
 * The declared-field vocabulary is read through `resolveFlowFieldValues`, the same
 * module the flow frame renders from — routing each id by the `Input_` law, applying
 * any hidden `mapTo`, and computing `derived` after the caller's overrides. Reading
 * it any other way here would be a second implementation of the dialect, which is
 * exactly what `declaredFields.js` exists to prevent (MPI-580).
 *
 * MEDIA IS BY REFERENCE, never bytes. The caller stages its own file through
 * `POST /project-media/:id/place-preview-asset` (which takes a plain absolute
 * path) and passes back the `/project-file?path=…` url it returns, so an agent's
 * audio lands in the same content-addressed store a dropped file does.
 */
function _submitFlow(jobId, input = {}) {
    const { flowId, fields = {}, media = [] } = input;

    if (!state.currentProject) {
        return _fail(jobId, 'NO_PROJECT', 'No project is open in Vision. Open one first.');
    }

    const flow = getFlowById(flowId);
    if (!flow) {
        return _fail(jobId, 'UNKNOWN_FLOW', `No flow with id "${flowId}".`);
    }

    // submitFlowGeneration pre-flights this itself, but it reports through a TOAST
    // and returns a bare null — an agent sees neither. Ask the same question here
    // so the weights that are missing come back BY NAME.
    const availability = flowAvailability(flow);
    if (!availability.available) {
        const absent = [...(availability.missing || []), ...(availability.missingDeps || [])];
        return _fail(jobId, 'OP_UNAVAILABLE',
            `${flow.title} is not installed — missing: ${absent.join(', ') || 'required files'}.`);
    }

    // The op owns the slot vocabulary (`key` + `mediaType`); the caller names a
    // role. Resolving through the op rather than trusting a caller-sent mediaType
    // is what keeps a wav from being announced as an image and failing in the graph.
    const slots = getCommandMediaInputs(flow.operation);
    const mediaItems = [];
    for (const m of (Array.isArray(media) ? media : [])) {
        const slot = slots.find(s => s.key === m?.role);
        if (!slot) {
            return _fail(jobId, 'BAD_REQUEST',
                `"${flow.operation}" has no media role "${m?.role}". Roles: ${slots.map(s => s.key).join(', ') || 'none'}.`);
        }
        if (!m.url) {
            return _fail(jobId, 'BAD_REQUEST', `Media role "${m.role}" has no url.`);
        }
        mediaItems.push({ url: m.url, mediaType: slot.mediaType, role: slot.key, source: 'flow-agent' });
    }

    // The SHARED predicate, not a copy — three guards answering "is a required slot
    // empty?" must never be able to disagree (generationService § findMissingMediaSlot).
    // Text to Speech is the case that matters: its `audio1` is required because the
    // graph's MpiLoadAudio carries `block_if_empty`, and without this the run comes
    // back a SUCCESS with no output.
    const missingSlot = findMissingMediaSlot(flow.operation, mediaItems);
    if (missingSlot) {
        return _fail(jobId, 'MEDIA_REQUIRED',
            `${flow.title} needs ${missingSlot.mediaType} in its "${missingSlot.key}" slot.`);
    }

    const { inputs, injectionParams, unknown } = resolveFlowFieldValues(flow, fields);
    if (unknown.length) {
        const known = flowDeclaredFields(flow).map(f => f.id).join(', ');
        return _fail(jobId, 'BAD_REQUEST',
            `${flow.title} declares no field ${unknown.map(k => `"${k}"`).join(', ')}. Fields: ${known || 'none'}.`);
    }

    const queued = submitFlowGeneration(flow, {
        ...inputs,
        mediaItems,
        ...(Object.keys(injectionParams).length ? { injectionParams } : {}),
    }, {
        onComplete: ({ item, group }) => _report(jobId, {
            ok: true,
            output: {
                itemId: item?.id,
                groupId: group?.id,
                type: item?.type,
                filePath: item?.filePath,
                seed: item?.seed,
                pixelDimensions: item?.pixelDimensions,
                generationMs: item?.generationMs,
            },
        }),
        onText: (text) => _report(jobId, { ok: true, output: { text } }),
        onError: () => _fail(jobId, 'RUNTIME_ERROR',
            'The generation failed. See the app log for the cause.'),
        onCancel: () => _fail(jobId, 'CANCELLED',
            'The generation was cancelled or produced no output.'),
    });

    if (!queued) {
        return _fail(jobId, 'REJECTED', 'Vision rejected the job before it entered the queue.');
    }
    return null;
}

/**
 * Run one `project.open` job — the same pair of calls every project row in
 * `projectUI.js` makes, because opening a project IS `openProject` + navigate.
 * `openProject` needs only `folderPath`; it migrates, reconciles and hydrates the
 * record itself, so a stale or partial one from the caller cannot get in.
 *
 * No guard against switching mid-generation: the landing rows have none either,
 * and inventing one here would make the agent path stricter than the click.
 */
async function _openProject(jobId, input = {}) {
    const { folderPath } = input;
    if (!folderPath) {
        return _fail(jobId, 'BAD_REQUEST', 'No folderPath given.');
    }
    try {
        await openProject({ folderPath });
    } catch (err) {
        return _fail(jobId, 'NO_SUCH_PROJECT',
            `Could not open "${folderPath}": ${err?.message || 'unknown error'}.`);
    }
    navigate(PAGE_GALLERY);
    return _report(jobId, {
        ok: true,
        output: {
            folderPath: state.currentProject?.folderPath,
            name: state.currentProject?.name,
            groupCount: state.currentProject?.itemGroups?.length ?? 0,
        },
    });
}

/** Capability name → handler. The relay carries nothing else. */
const _HANDLERS = {
    'generation.submit': _submitGeneration,
    'project.open': _openProject,
};

/**
 * Subscribe to the relay. Idempotent, and safe in the browser dev build — a
 * failed EventSource just retries; nothing else in the app depends on it.
 */
export function initAgentDispatch() {
    if (_source) return;

    _source = new EventSource('/connector/jobs/stream');

    _source.addEventListener('job', (evt) => {
        let job;
        try {
            job = JSON.parse(evt.data);
        } catch (err) {
            clientLogger.error('connector', 'Malformed agent job frame', err);
            return;
        }
        const handler = _HANDLERS[job.capability];
        if (!handler) {
            _fail(job.jobId, 'UNSUPPORTED_CAPABILITY', `Unknown capability "${job.capability}".`);
            return;
        }
        clientLogger.info('connector', `Agent job ${job.jobId}: ${job.capability}`);
        // Through a promise so an async handler's rejection reports too — a bare
        // try/catch only sees a synchronous throw, and an unreported job hangs the
        // caller until the route's timeout.
        Promise.resolve().then(() => handler(job.jobId, job.input)).catch((err) => {
            clientLogger.error('connector', `Agent job ${job.jobId} threw`, err);
            _fail(job.jobId, 'RUNTIME_ERROR', err?.message || 'The job threw.');
        });
    });

    // EventSource reconnects on its own; log once so a permanently dead relay is
    // findable in app.log rather than silently absent.
    _source.addEventListener('error', () => {
        clientLogger.info('connector', 'Agent job stream dropped — reconnecting.');
    });
}
