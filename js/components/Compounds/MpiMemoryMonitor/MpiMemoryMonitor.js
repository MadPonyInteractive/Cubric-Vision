import { ComponentFactory } from '../../factory.js';
import { MpiButton } from '../../Primitives/MpiButton/MpiButton.js';
import { MpiProgressBar } from '../../Primitives/MpiProgressBar/MpiProgressBar.js';
import { ce } from '/js/utils/dom.js';
import { Hotkeys } from '/js/managers/hotkeyManager.js';

/**
 * MpiMemoryMonitor — Compound: MpiProgressBar (×2) + MpiButton (unload).
 *
 * Displays live VRAM + RAM usage bars using the MpiProgressBar primitive
 * with the 'vram' and 'ram' variants defined in MpiProgressBar.css.
 * Polls /system/stats on a configurable interval.
 *
 * Props:
 * @param {number}  [pollInterval=2000] - Stats fetch interval in ms
 * @param {string}  [info]              - Info bar text for the unload button
 *
 * Instance methods (on instance.el):
 *   startPolling()     — begin/resume polling
 *   stopPolling()      — pause polling
 *   showStatus(text)   — briefly show a status badge (called by shell after release)
 *
 * Emits:
 *   'release' { deep: boolean } — unload button clicked; shell calls the API
 */
export const MpiMemoryMonitor = ComponentFactory.create({
    name: 'MpiMemoryMonitor',
    css: ['js/components/Compounds/MpiMemoryMonitor/MpiMemoryMonitor.css'],

    template: () => `<div class="mpi-mem-monitor"></div>`,

    setup: (el, props, emit) => {
        const pollInterval = props.pollInterval ?? 2000;

        // ── Layout structure ─────────────────────────────────────────────────
        const barsEl    = ce('div', { className: 'mpi-mem-monitor__bars' });
        const actionsEl = ce('div', { className: 'mpi-mem-monitor__actions' });
        el.appendChild(barsEl);
        el.appendChild(actionsEl);

        // ── Helper: build one monitor row (label + MpiProgressBar + value) ───
        /**
         * @param {'vram'|'ram'} type
         * @param {string} label
         * @returns {{ barInstance: Object, valueEl: HTMLElement }}
         */
        const _buildRow = (type, label) => {
            const row     = ce('div', { className: `mpi-mem-monitor__item` });
            const labelEl = ce('span', { className: 'mpi-mem-monitor__label', textContent: label });
            const barWrap = ce('div', { className: 'mpi-mem-monitor__bar-wrap' });
            const valueEl = ce('span', { className: 'mpi-mem-monitor__value', textContent: '0 / 0 GB' });

            row.append(labelEl, barWrap, valueEl);
            barsEl.appendChild(row);

            // Mount MpiProgressBar in static mode using the BEM variant from MpiProgressBar.css
            const barInstance = MpiProgressBar.mount(barWrap, {
                min: 0,
                max: 100,
                value: 0,
                variant: type,       // 'vram' or 'ram' — maps to .mpi-progress--vram / --ram
                interactive: false,
            });

            return { barInstance, valueEl };
        };

        const { barInstance: vramBar, valueEl: vramValue } = _buildRow('vram', 'VRAM');
        const { barInstance: ramBar,  valueEl: ramValue  } = _buildRow('ram',  'RAM');

        // ── Status badge ─────────────────────────────────────────────────────
        const statusBadge = ce('div', { className: 'mpi-mem-monitor__status hide' });

        // ── Unload button ────────────────────────────────────────────────────
        const buttonWrap = ce('div', { className: 'mpi-mem-monitor__btn-wrap' });
        buttonWrap.appendChild(statusBadge);
        actionsEl.appendChild(buttonWrap);

        const unloadBtn = MpiButton.mount(buttonWrap, {
            icon: 'unload',
            size: 'md',
            info: props.info ?? 'Release VRAM — F5 standard · Ctrl+F5 deep clean',
        });

        // ── Ctrl-held visual (signals deep clean mode) ───────────────────────
        let _ctrlHeld = false;
        let _statusTimer = null;

        const _onKeydown = (e) => {
            if (e.key === 'Control') {
                _ctrlHeld = true;
                unloadBtn.el.classList.add('mpi-mem-monitor__btn--ctrl');
            }
        };
        const _onKeyup = (e) => {
            if (e.key === 'Control') {
                _ctrlHeld = false;
                unloadBtn.el.classList.remove('mpi-mem-monitor__btn--ctrl');
            }
        };

        const _unsubKeydown = Hotkeys.register('control', _onKeydown);
        const _unsubKeyup   = Hotkeys.registerKeyup('control', _onKeyup);

        unloadBtn.on('click', () => emit('release', { deep: _ctrlHeld }));

        // ── Public status API ────────────────────────────────────────────────
        /**
         * Show a temporary status badge message and disable the button.
         * @param {string} text
         */
        el.showStatus = (text) => {
            clearTimeout(_statusTimer);
            statusBadge.textContent = text;
            statusBadge.classList.remove('hide');
            unloadBtn.el.setAttribute('disabled', '');
            _statusTimer = setTimeout(() => {
                statusBadge.classList.add('hide');
                unloadBtn.el.removeAttribute('disabled');
            }, 2500);
        };

        // ── Helpers: update a MpiProgressBar instance imperatively ───────────
        /**
         * Sets the fill width and warning class on a static MpiProgressBar.
         * We directly update the hidden <input> value and dispatch 'input'
         * so the primitive's own updateVisuals() moves the track fill.
         * @param {Object} barInst - MpiProgressBar instance
         * @param {number} percent - 0–100
         */
        const _setBarValue = (barInst, percent) => {
            const input = barInst.el.querySelector('.mpi-progress__input');
            if (!input) return;
            input.value = percent;
            input.dispatchEvent(new Event('input'));
            barInst.el.classList.toggle('mpi-progress--warning', percent > 85);
        };

        // ── Polling ──────────────────────────────────────────────────────────
        let _pollTimer = null;

        const _updateStats = async () => {
            try {
                const res  = await fetch('/system/stats');
                const data = await res.json();
                if (!data.success) return;

                const ramGB      = (data.ram.used  / (1024 ** 3)).toFixed(1);
                const totalRamGB = (data.ram.total / (1024 ** 3)).toFixed(0);
                ramValue.textContent = `${ramGB} / ${totalRamGB} GB`;
                _setBarValue(ramBar, data.ram.percent);

                const vramGB      = (data.vram.used  / (1024 ** 3)).toFixed(1);
                const totalVramGB = (data.vram.total / (1024 ** 3)).toFixed(0);
                vramValue.textContent = `${vramGB} / ${totalVramGB} GB`;
                _setBarValue(vramBar, data.vram.percent);
            } catch {
                // Silently ignore — network may not be ready on boot
            }
        };

        /** Begin (or restart) polling. */
        el.startPolling = () => {
            el.stopPolling();
            _updateStats();
            _pollTimer = setInterval(_updateStats, pollInterval);
        };

        /** Pause polling. */
        el.stopPolling = () => {
            if (_pollTimer !== null) {
                clearInterval(_pollTimer);
                _pollTimer = null;
            }
        };

        // Cleanup when element is permanently removed from the DOM
        const _observer = new MutationObserver(() => {
            if (!document.contains(el)) {
                el.stopPolling();
                _unsubKeydown();
                _unsubKeyup();
                clearTimeout(_statusTimer);
                _observer.disconnect();
            }
        });
        _observer.observe(document.body, { childList: true, subtree: true });

        // Auto-start polling on mount
        el.startPolling();
    },
});
