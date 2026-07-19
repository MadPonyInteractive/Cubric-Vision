/**
 * describeAction.js — run the image captioner on one item and drop the result in
 * the prompt box (MPI-310).
 *
 * Lives here rather than in each block because the gallery grid and the history
 * list both need it and the logic is identical: gate on the plugin being
 * installed, queue a normal generation, write the caption into the prompt box.
 * The two blocks differ only in how they find the item, which is the caller's job.
 *
 * The caption lands in the prompt box (editable) rather than being stored on the
 * item, because the point is to give a human an accurate starting point to edit
 * toward a target — describe, adjust, generate.
 */

import { Events } from '../events.js';
import { enqueueGeneration } from '../services/generationService.js';
import { resolveMediaUrl } from './mediaActions.js';
import { pluginAvailability, getPlugin } from '../data/pluginsRegistry.js';
import { clientLogger } from '../services/clientLogger.js';

const PLUGIN_ID = 'image-describer';

/**
 * Queue a caption run for one history item.
 *
 * @param {{filePath?: string, type?: string}} item  The item to describe.
 * @param {Object}  [opts]
 * @param {Object}  [opts.group]   Owning group, when called from a group context.
 * @param {string}  [opts.scope]   'gallery' | 'groupHistory'.
 * @returns {boolean} true when a job was queued.
 */
export function describeItem(item, opts = {}) {
    if (!item?.filePath) {
        Events.emit('ui:warning', { message: 'No source image to describe.' });
        return false;
    }
    if (item.type === 'video') {
        // Video captioning needs a real frame written to disk first — the loader
        // node reads an OS path, not a blob. Out of scope for this card.
        Events.emit('ui:warning', { message: 'Describing video frames is not supported yet.' });
        return false;
    }

    // The encoder is a plugin weight the user installs deliberately. Point at the
    // place that can actually fix it rather than failing deep inside ComfyUI with
    // a "clip not found".
    if (!pluginAvailability(PLUGIN_ID).installed) {
        const title = getPlugin(PLUGIN_ID)?.title || 'Image Describer';
        Events.emit('ui:warning', {
            message: `${title} is not installed — add it from the Model Library (Plugins).`,
        });
        return false;
    }

    enqueueGeneration(
        {
            operation: 'imageDescribe',
            model: { id: null, mediaType: 'image' },
            positive: '',
            negative: '',
            mediaItems: [{ url: resolveMediaUrl(item.filePath), mediaType: 'image', source: opts.scope || 'gallery' }],
            injectionParams: {},
        },
        {
            // A text op never fires onComplete — see GenerationCallbacks.onText.
            onText: (caption) => {
                Events.emit('workspace:inject-prompts', { positive: caption });
                Events.emit('ui:success', { message: 'Description added to the prompt.' });
            },
            onError: (err) => {
                clientLogger.error('describe', 'image describe failed', err);
            },
        },
        opts.group
            ? { existingGroup: opts.group, scope: opts.scope || 'groupHistory', groupId: opts.group.id }
            : { scope: opts.scope || 'gallery' },
    );
    return true;
}
