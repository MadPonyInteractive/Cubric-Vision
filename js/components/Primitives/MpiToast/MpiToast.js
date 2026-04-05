import { ComponentFactory } from '../../factory.js';

/**
 * MpiToast — Brief floating notifications.
 * 
 * Props:
 * @param {string} message - Notification text
 * @param {'info'|'success'|'warning'|'danger'} [variant='info'] - Visual style
 * @param {number} [duration=3000] - Lifespan in ms (set to 0 for persistent)
 */
export const MpiToast = ComponentFactory.create({
    name: 'MpiToast',
    css: ['js/components/Primitives/MpiToast/MpiToast.css'],

    template: (props) => {
        const variant = props.variant || 'info';
        const message = props.message || '';

        // Icon mapping (hardcoded for simplicity since it's a primitive)
        const icons = {
            info: 'info-circle',
            success: 'check-circle',
            warning: 'exclamation-triangle',
            danger: 'exclamation-circle'
        };

        return `<div class="mpi-toast mpi-toast--${variant}">
            <div class="mpi-toast__icon"></div>
            <div class="mpi-toast__content">
                <p class="mpi-toast__msg">${message}</p>
            </div>
            <button class="mpi-toast__close" aria-label="Close">&times;</button>
            <div class="mpi-toast__progress"></div>
        </div>`;
    },

    setup: (el, props, emit) => {
        const closeBtn = el.querySelector('.mpi-toast__close');
        const progress = el.querySelector('.mpi-toast__progress');
        const duration = props.duration !== undefined ? props.duration : 3000;

        const dismiss = () => {
            el.classList.remove('mpi-toast--open');
            el.classList.add('mpi-toast--closing');
            el.addEventListener('transitionend', () => {
                emit('close');
            }, { once: true });
        };

        closeBtn.onclick = dismiss;

        if (duration > 0) {
            // Animate progress bar if duration > 0
            if (progress) {
                progress.style.transition = `width ${duration}ms linear`;
                requestAnimationFrame(() => {
                    progress.style.width = '0%';
                });
            }

            setTimeout(() => {
                dismiss();
            }, duration);
        }

        // Add intro animation
        el.classList.add('mpi-toast--open');
    }
});
