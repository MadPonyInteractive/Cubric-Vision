import { ComponentFactory } from '../../factory.js';
import { MpiInput } from '../../Primitives/MpiInput/MpiInput.js';
import { MpiDropdown } from '../../Primitives/MpiDropdown/MpiDropdown.js';
import { MpiProgressBar } from '../../Primitives/MpiProgressBar/MpiProgressBar.js';
import { MpiButton } from '../../Primitives/MpiButton/MpiButton.js';
import { qs } from '../../../utils/dom.js';
import { SHOT_ANGLES, SHOT_SIZES, VIDEO_MOVEMENTS, VIDEO_SPEEDS } from '../../../utils/promptOptions.js';

/** @typedef {{ description:string, angle:string, size:string, movement:string, speed:string, duration:number }} MpiVideoSceneItem */

/**
 * MpiVideoScene — Video Scene / Shot Configuration Compound
 *
 * A dynamic list of shot cards. Each card configures one cinematic shot with
 * description text, angle, size, movement, speed, and duration controls.
 * Scenes can be added and removed at runtime.
 *
 * Props:
 * @param {MpiVideoSceneItem[]} [scenes=[]]   - Initial scene list
 * @param {string[]} [angles]                 - Override angle options
 * @param {string[]} [sizes]                  - Override size options
 * @param {string[]} [movements]              - Override movement options
 * @param {string[]} [speeds]                 - Override speed options
 *
 * Emits:
 * 'change' { scenes: MpiVideoSceneItem[] } — emitted on every field change or add/remove
 */
export const MpiVideoScene = ComponentFactory.create({
    name: 'MpiVideoScene',
    css: ['js/components/Compounds/MpiVideoScene/MpiVideoScene.css'],

    template: () => `
        <div class="mpi-video-scene">
            <div class="mpi-video-scene__list" id="vscene-list"></div>
            <div class="mpi-video-scene__footer" id="vscene-footer"></div>
        </div>
    `,

    setup: (el, props, emit) => {
        const scenes = (props.scenes || []).map(s => ({ ...s }));

        const ANGLES    = props.angles    || SHOT_ANGLES;
        const SIZES     = props.sizes     || SHOT_SIZES;
        const MOVEMENTS = props.movements || VIDEO_MOVEMENTS;
        const SPEEDS    = props.speeds    || VIDEO_SPEEDS;

        const listEl   = qs('#vscene-list', el);
        const footerEl = qs('#vscene-footer', el);

        /**
         * (Re)renders all scene cards into the list container.
         * Called on init and after every add/remove.
         */
        const renderScenes = () => {
            listEl.innerHTML = '';

            if (scenes.length === 0) {
                listEl.innerHTML = '<p class="mpi-video-scene__empty">No shots added yet.</p>';
                return;
            }

            scenes.forEach((scene, i) => {
                const card = document.createElement('div');
                card.className = 'mpi-video-scene__card';
                card.innerHTML = `
                    <div class="mpi-video-scene__card-header">
                        <span class="mpi-video-scene__card-num">Shot ${i + 1}</span>
                        <div id="vscene-remove-${i}"></div>
                    </div>
                    <div class="mpi-video-scene__card-body">
                        <div class="mpi-video-scene__desc" id="vscene-desc-${i}"></div>
                        <div class="mpi-video-scene__selects">
                            <div class="mpi-video-scene__select-row">
                                <span class="mpi-video-scene__field-label">Angle</span>
                                <div id="vscene-angle-${i}"></div>
                            </div>
                            <div class="mpi-video-scene__select-row">
                                <span class="mpi-video-scene__field-label">Size</span>
                                <div id="vscene-size-${i}"></div>
                            </div>
                            <div class="mpi-video-scene__select-row">
                                <span class="mpi-video-scene__field-label">Movement</span>
                                <div id="vscene-movement-${i}"></div>
                            </div>
                            <div class="mpi-video-scene__select-row">
                                <span class="mpi-video-scene__field-label">Speed</span>
                                <div id="vscene-speed-${i}"></div>
                            </div>
                        </div>
                        <div class="mpi-video-scene__duration" id="vscene-duration-${i}"></div>
                    </div>
                `;
                listEl.appendChild(card);

                // Remove button
                MpiButton.mount(qs(`#vscene-remove-${i}`, card), {
                    icon:    'close',
                    size:    'sm',
                    variant: 'ghost',
                    info:    'Remove this shot'
                }).on('click', () => {
                    scenes.splice(i, 1);
                    renderScenes();
                    emit('change', { scenes: scenes.map(s => ({ ...s })) });
                });

                // Description input
                const descInst = MpiInput.mount(qs(`#vscene-desc-${i}`, card), {
                    type:        'text',
                    placeholder: 'Shot description...',
                    value:       scene.description || '',
                    info:        'Brief description of this shot'
                });
                qs('input', descInst.el).addEventListener('input', (e) => {
                    scenes[i].description = e.target.value;
                    emit('change', { scenes: scenes.map(s => ({ ...s })) });
                });

                // Dropdowns
                const mountDropdown = (slotId, key, options, current) => {
                    const dd = MpiDropdown.mount(qs(`#${slotId}`, card), {
                        options,
                        value:       current || '',
                        placeholder: 'None',
                        direction:   'down'
                    });
                    dd.on('change', ({ value }) => {
                        scenes[i][key] = value === 'None' ? '' : value;
                        emit('change', { scenes: scenes.map(s => ({ ...s })) });
                    });
                };

                mountDropdown(`vscene-angle-${i}`,    'angle',    ANGLES,    scene.angle);
                mountDropdown(`vscene-size-${i}`,     'size',     SIZES,     scene.size);
                mountDropdown(`vscene-movement-${i}`, 'movement', MOVEMENTS, scene.movement);
                mountDropdown(`vscene-speed-${i}`,    'speed',    SPEEDS,    scene.speed);

                // Duration slider (1–30 seconds)
                const dur = MpiProgressBar.mount(qs(`#vscene-duration-${i}`, card), {
                    min:         1,
                    max:         30,
                    step:        1,
                    value:       scene.duration || 5,
                    prefix:      'Duration: ',
                    suffix:      's',
                    info:        'Shot duration: {value}s',
                    interactive: true,
                    wheel:       true
                });
                dur.on('change', ({ value }) => {
                    scenes[i].duration = value;
                    emit('change', { scenes: scenes.map(s => ({ ...s })) });
                });
            });
        };

        // "Add Shot" button in footer
        MpiButton.mount(footerEl, {
            icon:    'plus',
            label:   'Add Shot',
            variant: 'outline',
            size:    'sm'
        }).on('click', () => {
            scenes.push({ description: '', angle: '', size: '', movement: '', speed: '', duration: 5 });
            renderScenes();
            emit('change', { scenes: scenes.map(s => ({ ...s })) });
        });

        renderScenes();
    }
});
