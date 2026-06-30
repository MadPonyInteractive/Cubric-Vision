import { ComponentFactory } from '../../factory.js';
import { MpiButton } from '../../Primitives/MpiButton/MpiButton.js';
import { MpiProgressBar } from '../../Primitives/MpiProgressBar/MpiProgressBar.js';
import { ce, qs } from '/js/utils/dom.js';
import { Hotkeys } from '/js/managers/hotkeyManager.js';
import { Events } from '/js/events.js';

/**
 * MpiMemoryMonitor — Compound: MpiProgressBar (×2) + MpiButton (unload).
 *
 * Displays live VRAM + RAM usage bars using the MpiProgressBar primitive
 * with the 'vram' and 'ram' variants defined in MpiProgressBar.css.
 * Polls local /system/stats by default, and switches to remote Pod telemetry
 * while RunPod is connected.
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
        const GB = 1024 ** 3;

        // ── Layout structure ─────────────────────────────────────────────────
        const barsEl    = ce('div', { className: 'mpi-mem-monitor__bars' });
        const actionsEl = ce('div', { className: 'mpi-mem-monitor__actions' });
        el.appendChild(barsEl);
        el.appendChild(actionsEl);

        // ── Helper: build one monitor row (label + MpiProgressBar + value) ───
        /**
         * @param {'vram'|'ram'} type
         * @param {string} label
         * @returns {{ rowEl: HTMLElement, barInstance: Object, valueEl: HTMLElement }}
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
                info: '',            // opt out of status-bar hover tooltip
            });

            return { rowEl: row, barInstance, valueEl };
        };

        const { rowEl: vramRow, barInstance: vramBar, valueEl: vramValue } = _buildRow('vram', 'VRAM');
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
            variant: 'ghost',
            info: props.info ?? 'Release VRAM — F5 · Ctrl+click or Ctrl+F5 for deep clean (VRAM + RAM)',
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

        const _unsubKeydown = Hotkeys.bind('memoryMonitor.ctrl.down', _onKeydown);
        const _unsubKeyup   = Hotkeys.bind('memoryMonitor.ctrl.up', _onKeyup);

        // Read the modifier off the click event itself — authoritative and
        // immune to _ctrlHeld desync (missed keydown on focus steal / DevTools).
        unloadBtn.on('click', ({ originalEvent }) => {
            const deep = !!(originalEvent && (originalEvent.ctrlKey || originalEvent.metaKey)) || _ctrlHeld;
            emit('release', { deep });
        });

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
            const input = qs('.mpi-progress__input', barInst.el);
            if (!input) return;
            input.value = percent;
            input.dispatchEvent(new Event('input'));
            barInst.el.classList.toggle('mpi-progress--warning', percent > 85);
        };

        // ── Polling ──────────────────────────────────────────────────────────
        let _pollTimer = null;
        let _remote = {
            connected: false,
            phase: null,
            vramTotal: null,
            ramTotal: null,
        };

        const _isRemoteLive = () => _remote.connected && !_remote.phase;
        const _numOrNull = (value) => {
            const n = Number(value);
            return Number.isFinite(n) ? n : null;
        };

        const _setUnavailable = (valueEl, barInst, text = '—') => {
            valueEl.textContent = text;
            _setBarValue(barInst, 0);
        };

        const _applyMetric = ({ total, used, percent, valueEl, barInst, fallbackText = '—' }) => {
            if (!(Number.isFinite(total) && total > 0)) {
                _setUnavailable(valueEl, barInst, fallbackText);
                return false;
            }
            const resolvedPercent = Number.isFinite(percent)
                ? percent
                : (Number.isFinite(used) ? ((used / total) * 100) : null);
            const resolvedUsed = Number.isFinite(used)
                ? used
                : (Number.isFinite(resolvedPercent) ? total * (resolvedPercent / 100) : null);
            if (!Number.isFinite(resolvedUsed) || !Number.isFinite(resolvedPercent)) {
                _setUnavailable(valueEl, barInst, fallbackText);
                return false;
            }
            valueEl.textContent = `${(resolvedUsed / GB).toFixed(1)} / ${(total / GB).toFixed(0)} GB`;
            _setBarValue(barInst, resolvedPercent);
            return true;
        };

        const _applyRemoteStats = (data) => {
            const hasRemoteVram = Number.isFinite(_remote.vramTotal) && _remote.vramTotal > 0;
            vramRow.hidden = !hasRemoteVram;
            barsEl.classList.toggle('mpi-mem-monitor__bars--vram-hidden', vramRow.hidden);

            const ramOk = _applyMetric({
                total: _remote.ramTotal,
                used: _numOrNull(data?.ram?.used),
                percent: _numOrNull(data?.ram?.percent),
                valueEl: ramValue,
                barInst: ramBar,
                fallbackText: 'Pod N/A',
            });

            if (!vramRow.hidden) {
                _applyMetric({
                    total: _remote.vramTotal,
                    used: _numOrNull(data?.vram?.used),
                    percent: _numOrNull(data?.vram?.percent),
                    valueEl: vramValue,
                    barInst: vramBar,
                    fallbackText: 'Pod N/A',
                });
            }

            if (!ramOk && vramRow.hidden) {
                _setUnavailable(ramValue, ramBar, 'Pod N/A');
            }
        };

        const _applyLocalStats = (data) => {
            const ramGB      = (data.ram.used  / GB).toFixed(1);
            const totalRamGB = (data.ram.total / GB).toFixed(0);
            ramValue.textContent = `${ramGB} / ${totalRamGB} GB`;
            _setBarValue(ramBar, data.ram.percent);

            const isAppleUnified = data.gpu?.vendor === 'apple' || data.vram?.memoryModel === 'unified';
            const hasDiscreteVram = data.vram?.available !== false && data.vram?.total > 0;
            vramRow.hidden = isAppleUnified && !hasDiscreteVram;
            barsEl.classList.toggle('mpi-mem-monitor__bars--vram-hidden', vramRow.hidden);
            if (!vramRow.hidden) {
                const vramGB      = (data.vram.used  / GB).toFixed(1);
                const totalVramGB = (data.vram.total / GB).toFixed(0);
                vramValue.textContent = `${vramGB} / ${totalVramGB} GB`;
                _setBarValue(vramBar, data.vram.percent);
            }
        };

        const _updateStats = async () => {
            try {
                const endpoint = _isRemoteLive() ? '/remote/pod/stats' : '/system/stats';
                const res  = await fetch(endpoint);
                const data = await res.json();
                if (_isRemoteLive()) {
                    if (!data.success) {
                        vramRow.hidden = !(Number.isFinite(_remote.vramTotal) && _remote.vramTotal > 0);
                        barsEl.classList.toggle('mpi-mem-monitor__bars--vram-hidden', vramRow.hidden);
                        _setUnavailable(ramValue, ramBar, 'Pod N/A');
                        if (!vramRow.hidden) _setUnavailable(vramValue, vramBar, 'Pod N/A');
                        return;
                    }
                    _applyRemoteStats(data);
                    return;
                }
                if (!data.success) return;
                _applyLocalStats(data);
            } catch {
                if (_isRemoteLive()) {
                    vramRow.hidden = !(Number.isFinite(_remote.vramTotal) && _remote.vramTotal > 0);
                    barsEl.classList.toggle('mpi-mem-monitor__bars--vram-hidden', vramRow.hidden);
                    _setUnavailable(ramValue, ramBar, 'Pod N/A');
                    if (!vramRow.hidden) _setUnavailable(vramValue, vramBar, 'Pod N/A');
                }
                // Silently ignore otherwise — network may not be ready on boot
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

        const _unsubRemote = Events.on('remote:connection', ({ connected = false, phase = null, vramGb = null, ramGb = null } = {}) => {
            _remote = {
                connected: !!connected,
                phase: phase || null,
                vramTotal: Number.isFinite(Number(vramGb)) && Number(vramGb) > 0 ? Number(vramGb) * GB : null,
                ramTotal: Number.isFinite(Number(ramGb)) && Number(ramGb) > 0 ? Number(ramGb) * GB : null,
            };
            _updateStats();
        });

        // Cleanup when element is permanently removed from the DOM
        const _observer = new MutationObserver(() => {
            if (!document.contains(el)) {
                el.stopPolling();
                _unsubKeydown();
                _unsubKeyup();
                _unsubRemote();
                clearTimeout(_statusTimer);
                _observer.disconnect();
            }
        });
        _observer.observe(document.body, { childList: true, subtree: true });

        // Auto-start polling on mount
        el.startPolling();
    },
});
