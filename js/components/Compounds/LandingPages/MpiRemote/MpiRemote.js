import { ComponentFactory } from '../../../factory.js';
import { MpiLlmSettings } from '../MpiLlmSettings/MpiLlmSettings.js';
import { MpiRunpodSettings } from '../MpiRunpodSettings/MpiRunpodSettings.js';
import { qs } from '../../../../utils/dom.js';

/**
 * MpiRemote — the "Remote" slide-over: the two sections that are about somebody
 * else's computer.
 *
 * Fabio, 2026-09-12: Settings had grown to a thousand lines of local machine
 * concerns — folders, reuse, the microphone, updates — with the RunPod engine
 * bolted on the end and the language models about to be bolted on beside it.
 * Neither belongs there, so both MOVED here rather than being duplicated: each
 * section now lives in exactly one panel.
 *
 * It owns no controls of its own. Both children are Compounds mounted once, with
 * `onOpen` forwarded so they re-read on every open — the same contract
 * `MpiSettings` has with `MpiRunpodSettings` since MPI-177, which is why the move
 * is pure relocation and neither child changed.
 *
 * Section chrome (`.mpi-settings__*`) still comes from `MpiSettings.css`, which
 * `preloadStyles.js` loads app-wide; both children already depended on that
 * before the move, so nothing about it is new here.
 *
 * Trigger via:
 *   Events.emit('slide-over:open', { title: 'Remote', component: MpiRemote })
 */
export const MpiRemote = ComponentFactory.create({
    name: 'MpiRemote',
    css: ['js/components/Compounds/LandingPages/MpiRemote/MpiRemote.css'],

    template: () => `
        <div class="mpi-settings mpi-remote">
            <div class="mpi-settings__content">
                <div id="mpiRemoteLlmMount"></div>
                <div id="mpiRemoteRunpodMount"></div>
            </div>
        </div>`,

    setup: (el) => {
        const _llmInst = MpiLlmSettings.mount(qs('#mpiRemoteLlmMount', el), {});
        const _runpodInst = MpiRunpodSettings.mount(qs('#mpiRemoteRunpodMount', el), {});

        // Called by MpiSlideOver each time the panel opens.
        el.onOpen = () => {
            _llmInst?.el?.onOpen?.();
            _runpodInst?.el?.onOpen?.();
        };

        el.destroy = () => {
            _llmInst?.destroy?.();
            _runpodInst?.destroy?.();
            el.onOpen = null;
        };
    },
});
