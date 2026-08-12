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
 */

import { enqueueGeneration } from '../services/generationService.js';
import { getModelById, isOperationInstalled } from '../data/modelRegistry.js';
import { getCommandMediaInputs } from '../data/commandRegistry.js';
import { state } from '../state.js';
import { clientLogger } from '../services/clientLogger.js';

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

    const config = {
        operation,
        model,
        positive,
        negative,
        mediaItems: [],
        injectionParams,
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
        // t2i controls its own ratio, so the injected size gives the card its shape
        // up front. 0/0 would leave the box to adopt an input thumb that a text op
        // does not have.
        width: injectionParams.Width || 0,
        height: injectionParams.Height || 0,
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
        if (job.capability !== 'generation.submit') {
            _fail(job.jobId, 'UNSUPPORTED_CAPABILITY', `Unknown capability "${job.capability}".`);
            return;
        }
        clientLogger.info('connector', `Agent job ${job.jobId}: ${job.input?.modelId} / ${job.input?.operation}`);
        try {
            _submitGeneration(job.jobId, job.input);
        } catch (err) {
            clientLogger.error('connector', `Agent job ${job.jobId} threw`, err);
            _fail(job.jobId, 'RUNTIME_ERROR', err?.message || 'Submit threw.');
        }
    });

    // EventSource reconnects on its own; log once so a permanently dead relay is
    // findable in app.log rather than silently absent.
    _source.addEventListener('error', () => {
        clientLogger.info('connector', 'Agent job stream dropped — reconnecting.');
    });
}
