import { ComponentFactory } from '../../factory.js';
import { MpiModal } from '../../Primitives/MpiModal/MpiModal.js';
import { MpiButton } from '../../Primitives/MpiButton/MpiButton.js';
import { qs } from '../../../utils/dom.js';

/**
 * MpiOpHelpDialog — "How to prompt this operation" guide (Compound)
 *
 * A read-only modal opened by the "?" beside the op strip in the PromptBox
 * parameters popup (MPI-360). It renders whatever `getOpHelp(op, model)` hands
 * it: a title, prose paragraphs, optional media, and prompt examples with the
 * common mistake marked.
 *
 * MpiModal owns the backdrop, the portal, the Overlays queue entry and therefore
 * Escape — this compound adds only content and the X. There is no confirm path
 * and no state: opening it can never change a generation.
 *
 * Singleton usage (one instance per PromptBox, reused across ops):
 *   const help = MpiOpHelpDialog.mount(document.createElement('div'));
 *   help.el.open(getOpHelp(activeOperation, model));
 *   help.el.show();
 *
 * Props: none (content arrives via open()).
 *
 * Instance methods (on instance.el):
 *   open({ title, body, examples, media }) — set content before showing
 *   show() / hide()                        — delegate to MpiModal
 *
 * Emits: nothing. Closing is the only interaction.
 */

// ponytail: media is treated as "a GIF that compresses better" — autoplay, loop,
// muted, no controls. A narrated explainer with a scrub bar is a different ask.
const VIDEO_EXT = /\.(mp4|webm|mov|m4v)$/i;

export const MpiOpHelpDialog = ComponentFactory.create({
    name: 'MpiOpHelpDialog',
    css: ['js/components/Compounds/MpiOpHelpDialog/MpiOpHelpDialog.css'],

    template: () => `
        <div class="mpi-op-help" role="dialog" aria-modal="true" aria-labelledby="op-help-title">
            <div class="mpi-op-help__header">
                <div class="mpi-op-help__heading">
                    <div class="mpi-op-help__kicker">How to prompt</div>
                    <div class="mpi-op-help__title" id="op-help-title"></div>
                </div>
                <div class="mpi-op-help__close" id="op-help-close"></div>
            </div>
            <div class="mpi-op-help__body" id="op-help-body"></div>
        </div>
    `,

    setup: (el) => {
        const modal = MpiModal.mount(document.createElement('div'), {
            width: 'min(520px, 92vw)',
            backdropClose: true,
        });
        modal.el.appendChild(el);
        el.show = () => modal.el.show();
        el.hide = () => modal.el.hide();

        const titleEl = qs('#op-help-title', el);
        const bodySlot = qs('#op-help-body', el);

        const closeBtn = MpiButton.mount(qs('#op-help-close', el), {
            icon: 'close', variant: 'ghost', size: 'sm',
            info: 'Close',
        });
        closeBtn.on('click', () => el.hide());

        // ── Media — extension picks the element; GIFs animate in <img> unaided ──
        const _mediaNode = (src) => {
            if (VIDEO_EXT.test(src)) {
                const video = document.createElement('video');
                video.className = 'mpi-op-help__media';
                video.src = src;
                video.autoplay = true;
                video.loop = true;
                video.muted = true;
                video.playsInline = true;
                // A missing/undecodable file would otherwise leave a black box.
                video.addEventListener('error', () => video.remove());
                return video;
            }
            const img = document.createElement('img');
            img.className = 'mpi-op-help__media';
            img.src = src;
            img.alt = '';
            // Drop the node rather than render the browser's broken-image glyph:
            // help media is authored by hand and a typo must degrade to text-only.
            img.addEventListener('error', () => img.remove());
            return img;
        };

        // ── open — rebuild content (idempotent across repeated calls) ──────────
        el.open = ({ title, body, examples, media } = {}) => {
            titleEl.textContent = title || '';
            bodySlot.replaceChildren();

            (media || []).forEach((src) => bodySlot.appendChild(_mediaNode(src)));

            (body || []).forEach((text) => {
                const p = document.createElement('p');
                p.className = 'mpi-op-help__para';
                p.textContent = text;
                bodySlot.appendChild(p);
            });

            const list = (examples || []);
            if (!list.length) return;

            const heading = document.createElement('div');
            heading.className = 'mpi-op-help__section-title';
            heading.textContent = 'Examples';
            bodySlot.appendChild(heading);

            list.forEach(({ prompt, note, bad }) => {
                const row = document.createElement('div');
                row.className = `mpi-op-help__example${bad ? ' mpi-op-help__example--bad' : ''}`;

                const code = document.createElement('code');
                code.className = 'mpi-op-help__prompt';
                // An empty prompt is a real, recommended answer on the erase ops —
                // it needs a visible token or the row reads as a rendering bug.
                code.textContent = prompt ? `"${prompt}"` : '(empty prompt)';
                row.appendChild(code);

                if (note) {
                    const desc = document.createElement('span');
                    desc.className = 'mpi-op-help__note';
                    desc.textContent = note;
                    row.appendChild(desc);
                }
                bodySlot.appendChild(row);
            });
        };

        el.destroy = () => {
            closeBtn.destroy?.();
            modal.el.hide?.();
            modal.el.destroy?.();
        };
    },
});
