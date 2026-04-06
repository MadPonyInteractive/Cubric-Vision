import { ComponentFactory } from '../../factory.js';
import { MpiInput } from '../../Primitives/MpiInput/MpiInput.js';
import { MpiButton } from '../../Primitives/MpiButton/MpiButton.js';

/**
 * MpiPromptBox — Advanced Prompt Input Block
 *
 * Props:
 * @param {string} [value=''] - Initial positive prompt value
 * @param {string} [negativeValue=''] - Initial negative prompt value
 * @param {boolean} [includeNegative=false] - Whether to show the negative prompt toggle
 * @param {any|any[]} [LeftA] - Single or list of component instances for the left area
 * @param {any|any[]} [rightA] - Single or list of component instances for the right area
 */
export const MpiPromptBox = ComponentFactory.create({
    name: 'MpiPromptBox',
    css: ['js/components/Compounds/MpiPromptBox/MpiPromptBox.css'],

    template: (props) => {
        const hasBottom = props.LeftA || props.rightA || props.includeNegative;
        const separator = hasBottom ? '<div class="mpi-prompt-box__separator"></div>' : '';

        return `
            <div class="mpi-prompt-box">
                <!-- Expansion Lock Toggle - Sitting on top border -->
                <div class="mpi-prompt-box__lock-container" id="expand-lock-slot"></div>

                <div class="mpi-prompt-box__prompts">
                    <div id="textarea-slot" class="mpi-prompt-box__main-textarea"></div>
                    <div class="mpi-prompt-box__copy-wrapper" id="copy-btn-slot"></div>
                </div>

                ${separator}

                ${hasBottom ? `
                <div class="mpi-prompt-box__bottom">
                    <div class="mpi-prompt-box__area mpi-prompt-box__area--left" id="bottom-left-slot"></div>
                    <div class="mpi-prompt-box__area mpi-prompt-box__area--center" id="bottom-center-slot"></div>
                    <div class="mpi-prompt-box__area mpi-prompt-box__area--right" id="bottom-right-slot"></div>
                </div>
                ` : ''}
            </div>
        `;
    },

    setup: (el, props, emit) => {
        let isExpansionLocked = true;
        let isNegativeMode = false;
        let positiveValue = props.value || '';
        let negativeValue = props.negativeValue || '';

        // 1. Mount Main Textarea
        const mainInput = MpiInput.mount(el.querySelector('#textarea-slot'), {
            type: 'textarea',
            placeholder: 'Type your prompt...',
            value: positiveValue
        });

        const textareaEl = mainInput.el.querySelector('textarea');

        // Expansion logic
        const updateHeight = () => {
            if (isExpansionLocked) {
                textareaEl.style.height = '3.5rem';
                return;
            }
            textareaEl.style.height = 'auto';
            const height = Math.min(Math.max(textareaEl.scrollHeight, 56), 224); // ~3.5rem min, ~14rem max
            textareaEl.style.height = (height) + 'px';
        };

        textareaEl.addEventListener('input', () => {
            updateHeight();
            if (isNegativeMode) negativeValue = textareaEl.value;
            else positiveValue = textareaEl.value;
            emit('input', { positive: positiveValue, negative: negativeValue, activeMode: isNegativeMode ? 'negative' : 'positive' });
        });

        // Sync initial height
        setTimeout(updateHeight, 0);

        // 2. Expansion Lock Toggle (Center Top)
        MpiButton.mount(el.querySelector('#expand-lock-slot'), {
            icon: 'chevronDown',
            iconActive: 'chevronUp',
            info: 'Toggle Expanding Height',
            size: 'sm',
            variant: 'ghost',
            toggleable: true,
            active: !isExpansionLocked // It's "expandable" by default
        }).on('click', (data) => {
            isExpansionLocked = !data.active;
            updateHeight();
        });

        // 3. Copy Button (Bottom Right)
        MpiButton.mount(el.querySelector('#copy-btn-slot'), {
            icon: 'copy',
            variant: 'ghost',
            size: 'sm',
            info: 'Copy current Text to Clipboard'
        }).on('click', () => {
            const textToCopy = textareaEl.value;
            navigator.clipboard.writeText(textToCopy);
            emit('copy', { text: textToCopy });
        });

        // 4. Bottom Areas (Prop-based)
        const mountArea = (slotId, content) => {
            const container = el.querySelector(`#${slotId}`);
            if (!container || !content) return;
            const items = Array.isArray(content) ? content : [content];
            items.forEach(item => {
                if (item && item.el) container.appendChild(item.el);
                else if (typeof item === 'string') container.innerHTML += item;
            });
        };

        mountArea('bottom-left-slot', props.LeftA);
        mountArea('bottom-right-slot', props.rightA);

        // 5. Mode Switch (Center Area) - Initialized in Positive mode (check)
        if (props.includeNegative) {
            MpiButton.mount(el.querySelector('#bottom-center-slot'), {
                icon: 'check',
                iconActive: 'negative',
                info: 'Switch between Positive and Negative Prompt',
                size: 'sm',
                variant: 'primary',
                toggleable: true,
                active: isNegativeMode
            }).on('click', (data) => {
                isNegativeMode = data.active;

                // Switch content
                textareaEl.value = isNegativeMode ? negativeValue : positiveValue;
                textareaEl.placeholder = isNegativeMode ? 'Type negative prompt...' : 'Type your prompt...';

                // Update height for new content
                updateHeight();

                emit('mode-change', { mode: isNegativeMode ? 'negative' : 'positive' });
            });
        }
    }
});
