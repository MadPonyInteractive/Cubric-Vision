import { ComponentFactory } from '../../factory.js';
import { resolveMediaUrl } from '../../../utils/mediaActions.js';

/**
 * MpiStepPreview — the `preview` step kind.
 *
 * A STEP KIND, not an app component: it knows the media it was handed and
 * nothing else. It never learns which flow hosts it, never touches the
 * workflow, never talks to an injector (carousel-frame/steps.md § Steps are DATA).
 *
 * Contract (every step kind implements it):
 *   props  { media, value, onChange, step }
 *   el.getValue() → the reported value
 *
 * WHY IT REPORTS NOTHING. Every other kind is a gizmo the user manipulates;
 * this one is a LOOK. Step 0 is for loading and shows a thumbnail too small to
 * judge — so a flow whose input is a video had no point at which the user could
 * actually see what they were about to process. That is the gap this fills, and
 * seeing is the whole job: `getValue()` returns the value it was given, so the
 * step contributes nothing to the run and cannot invalidate it.
 *
 * A step is never invalid (same doc), which holds here for free.
 *
 * Video autoplays muted and loops: this is a silent glance at framing and
 * motion, not playback — and an autoplaying element MUST be muted or the
 * browser's autoplay policy blocks it outright. (The RESULT player is a
 * different case and is deliberately unmuted.)
 *
 * Props:
 * @param {{url:string, mediaType:string}} media - The slot's media.
 * @param {*} [value] - Passed straight back by getValue(); this kind reports nothing.
 */
export const MpiStepPreview = ComponentFactory.create({
    name: 'MpiStepPreview',
    css: ['js/components/Organisms/MpiStepPreview/MpiStepPreview.css'],

    template: () => `<div class="mpi-step-preview"></div>`,

    setup: (el, props) => {
        const media = props.media || null;
        const url = media?.url ? resolveMediaUrl(media.url) : '';

        if (url) {
            const isVideo = (media.mediaType || media.type) === 'video';
            const node = document.createElement(isVideo ? 'video' : 'img');
            node.className = 'mpi-step-preview__media';
            node.src = url;
            if (isVideo) {
                node.controls = true;
                node.loop = true;
                node.muted = true;      // required for autoplay to be allowed
                node.autoplay = true;
                node.playsInline = true;
            } else {
                node.alt = '';
                node.draggable = false;
            }
            el.appendChild(node);
        }

        // Reports nothing — a look, not a gizmo. Hands back whatever it was given
        // so the frame's value plumbing is untouched by this kind existing.
        el.getValue = () => props.value ?? null;
    },
});
