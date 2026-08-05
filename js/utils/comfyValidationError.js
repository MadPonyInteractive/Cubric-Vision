/**
 * comfyValidationError.js — read the offending filename out of a ComfyUI
 * `/prompt` 400 (`prompt_outputs_failed_validation`).
 *
 * ComfyUI rejects a filename that is not on disk with `value_not_in_list`, and
 * the name lives in a DIFFERENT carrier per engine:
 *   - local:  the direct reply's `node_errors[id].errors[].extra_info.received_value`
 *   - remote: the Pod wrapper folds ComfyUI's TEXT into `detail.comfy_body`
 * The top-level `error.details` is `''` whenever any OTHER output node still
 * validated, so there is nothing to scrape there — which is exactly what made
 * these 400s reach the bug-reporter dialog unlabelled.
 *
 * MPI-229 did this for `lora_name`; MPI-453 generalised it to the loader inputs
 * that name a model WEIGHT, so an operation whose weights were never installed
 * names its missing file instead of asking the user to file a GitHub issue.
 *
 * @module utils/comfyValidationError
 */

/** Loader inputs that name a model weight file — the not-installed family. */
export const MODEL_FILE_INPUTS = Object.freeze(['unet_name', 'ckpt_name', 'vae_name', 'clip_name']);

/**
 * The file a `value_not_in_list` rejection names, from either carrier.
 * `carrier` is what identifies the ENGINE: `node_errors` only ever comes from a
 * direct (local) ComfyUI reply, the text form only from the Pod wrapper.
 *
 * @param {object|null|undefined} nodeErrors  `node_errors` from a local 400
 * @param {readonly string[]} inputNames      input names to accept (in priority order)
 * @param {string} [comfyText]                the remote `detail.comfy_body` (or the message)
 * @returns {{ name: string, input: string, carrier: 'node_errors'|'text' }|null}
 */
export function findRejectedFile(nodeErrors, inputNames, comfyText = '') {
    const wanted = new Set(inputNames);
    if (nodeErrors && typeof nodeErrors === 'object') {
        for (const node of Object.values(nodeErrors)) {
            for (const e of (node?.errors || [])) {
                if (e?.type !== 'value_not_in_list') continue;
                const input = e?.extra_info?.input_name;
                if (!wanted.has(input)) continue;
                const name = e.extra_info.received_value;
                if (typeof name === 'string' && name) return { name, input, carrier: 'node_errors' };
            }
        }
    }
    if (typeof comfyText === 'string' && comfyText) {
        for (const input of inputNames) {
            const m = new RegExp(`value not in list:\\s*${input}:\\s*'([^']+)'`, 'i').exec(comfyText);
            if (m) return { name: m[1], input, carrier: 'text' };
        }
    }
    return null;
}

/** Bare filename — ComfyUI echoes back whatever path the graph asked for. */
export function rejectedBasename(file) {
    return String(file || '').split(/[\\/]/).pop();
}
