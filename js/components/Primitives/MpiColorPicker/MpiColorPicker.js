import { ComponentFactory } from '../../factory.js';
import { Events } from '../../../events.js';
import { on, qs } from '../../../utils/dom.js';

const HEX_RE = /^#?([a-f0-9]{6})$/i;

const clampChannel = (value) => {
    const n = Number(value);
    if (!Number.isFinite(n)) return 0;
    return Math.max(0, Math.min(255, Math.round(n)));
};

const rgbToHex = ({ r, g, b }) => `#${[r, g, b]
    .map(v => clampChannel(v).toString(16).padStart(2, '0'))
    .join('')}`;

const hexToRgb = (value, fallback = { r: 0, g: 0, b: 0 }) => {
    const match = String(value || '').trim().match(HEX_RE);
    if (!match) return { ...fallback };
    const hex = match[1].toLowerCase();
    return {
        r: parseInt(hex.slice(0, 2), 16),
        g: parseInt(hex.slice(2, 4), 16),
        b: parseInt(hex.slice(4, 6), 16),
    };
};

const clampUnit = value => Math.max(0, Math.min(1, Number(value) || 0));
const clampHue = value => {
    const n = Number(value);
    if (!Number.isFinite(n)) return 0;
    return ((n % 360) + 360) % 360;
};

const rgbString = ({ r, g, b }) => `rgb(${clampChannel(r)} ${clampChannel(g)} ${clampChannel(b)})`;

const rgbToHsv = ({ r, g, b }) => {
    const nr = clampChannel(r) / 255;
    const ng = clampChannel(g) / 255;
    const nb = clampChannel(b) / 255;
    const max = Math.max(nr, ng, nb);
    const min = Math.min(nr, ng, nb);
    const delta = max - min;
    let h = 0;

    if (delta) {
        if (max === nr) h = 60 * (((ng - nb) / delta) % 6);
        else if (max === ng) h = 60 * (((nb - nr) / delta) + 2);
        else h = 60 * (((nr - ng) / delta) + 4);
    }

    return {
        h: clampHue(h),
        s: max === 0 ? 0 : delta / max,
        v: max,
    };
};

const hsvToRgb = ({ h, s, v }) => {
    const hue = clampHue(h);
    const sat = clampUnit(s);
    const val = clampUnit(v);
    const c = val * sat;
    const x = c * (1 - Math.abs(((hue / 60) % 2) - 1));
    const m = val - c;
    let rp = 0;
    let gp = 0;
    let bp = 0;

    if (hue < 60) [rp, gp, bp] = [c, x, 0];
    else if (hue < 120) [rp, gp, bp] = [x, c, 0];
    else if (hue < 180) [rp, gp, bp] = [0, c, x];
    else if (hue < 240) [rp, gp, bp] = [0, x, c];
    else if (hue < 300) [rp, gp, bp] = [x, 0, c];
    else [rp, gp, bp] = [c, 0, x];

    return {
        r: clampChannel((rp + m) * 255),
        g: clampChannel((gp + m) * 255),
        b: clampChannel((bp + m) * 255),
    };
};

/**
 * MpiColorPicker — HSV visual color picker primitive with RGB / hex inputs.
 *
 * Props:
 * @param {string|{r:number,g:number,b:number}} [value='#000000']
 * @param {string} [info]
 *
 * Emits:
 * 'change' { r, g, b, hex }
 */
export const MpiColorPicker = ComponentFactory.create({
    name: 'MpiColorPicker',
    css: ['js/components/Primitives/MpiColorPicker/MpiColorPicker.css'],

    template: (props) => {
        const rgb = typeof props.value === 'object'
            ? {
                r: clampChannel(props.value.r),
                g: clampChannel(props.value.g),
                b: clampChannel(props.value.b),
            }
            // eslint-disable-next-line mpi/no-hardcoded-hex-color -- color picker default value
            : hexToRgb(props.value || '#000000');
        const hex = rgbToHex(rgb);
        const info = props.info ? `data-info="${props.info}"` : '';

        return `
            <div class="mpi-color-picker" ${info}>
                <button type="button" class="mpi-color-picker__trigger">
                    <span class="mpi-color-picker__swatch" style="background:${rgbString(rgb)}"></span>
                    <span class="mpi-color-picker__hex">${hex}</span>
                </button>
            </div>
        `;
    },

    setup: (el, props, emit) => {
        const trigger = qs('.mpi-color-picker__trigger', el);
        const swatch = qs('.mpi-color-picker__swatch', el);
        const hexLabel = qs('.mpi-color-picker__hex', el);
        const _unsubs = [];
        let popup = null;
        let observer = null;
        let rgb = typeof props.value === 'object'
            ? {
                r: clampChannel(props.value.r),
                g: clampChannel(props.value.g),
                b: clampChannel(props.value.b),
            }
            // eslint-disable-next-line mpi/no-hardcoded-hex-color -- color picker default value
            : hexToRgb(props.value || '#000000');
        let hsv = rgbToHsv(rgb);

        const currentPayload = () => ({ ...rgb, hex: rgbToHex(rgb) });

        const syncTrigger = () => {
            swatch.style.background = rgbString(rgb);
            hexLabel.textContent = rgbToHex(rgb);
        };

        const syncPopup = () => {
            if (!popup) return;
            qs('[data-channel="r"]', popup).value = String(rgb.r);
            qs('[data-channel="g"]', popup).value = String(rgb.g);
            qs('[data-channel="b"]', popup).value = String(rgb.b);
            qs('[data-role="hex"]', popup).value = rgbToHex(rgb);
            qs('.mpi-color-picker__preview', popup).style.background = rgbString(rgb);
            qs('.mpi-color-picker__saturation', popup).style.backgroundColor = `hsl(${hsv.h} 100% 50%)`;
            const satHandle = qs('.mpi-color-picker__saturation-handle', popup);
            satHandle.style.left = `${hsv.s * 100}%`;
            satHandle.style.top = `${(1 - hsv.v) * 100}%`;
            satHandle.style.background = rgbString(rgb);
            qs('.mpi-color-picker__hue-handle', popup).style.left = `${(hsv.h / 360) * 100}%`;
        };

        const emitChange = () => emit('change', currentPayload());

        const setRgb = (next, shouldEmit = true) => {
            rgb = {
                r: clampChannel(next.r),
                g: clampChannel(next.g),
                b: clampChannel(next.b),
            };
            hsv = rgbToHsv(rgb);
            syncTrigger();
            syncPopup();
            if (shouldEmit) emitChange();
        };

        const setHsv = (next, shouldEmit = true) => {
            hsv = {
                h: clampHue(next.h ?? hsv.h),
                s: clampUnit(next.s ?? hsv.s),
                v: clampUnit(next.v ?? hsv.v),
            };
            rgb = hsvToRgb(hsv);
            syncTrigger();
            syncPopup();
            if (shouldEmit) emitChange();
        };

        const positionPopup = () => {
            if (!popup) return;
            const rect = trigger.getBoundingClientRect();
            popup.style.top = `${rect.bottom + 8}px`;
            popup.style.left = `${rect.left}px`;
            requestAnimationFrame(() => {
                const popupRect = popup.getBoundingClientRect();
                const overflow = popupRect.right - window.innerWidth + 8;
                if (overflow > 0) popup.style.left = `${Math.max(8, rect.left - overflow)}px`;
            });
        };

        const closePopup = () => {
            if (!popup) return;
            popup.remove();
            popup = null;
        };

        const openPopup = () => {
            if (popup) {
                closePopup();
                return;
            }
            Events.emit('ui:close-all-popups');
            popup = document.createElement('div');
            popup.className = 'mpi-color-picker__popup mpi-popup is-active';
            popup.innerHTML = `
                <div class="mpi-color-picker__preview"></div>
                <div class="mpi-color-picker__saturation" data-role="saturation" tabindex="0" aria-label="Color saturation and brightness">
                    <span class="mpi-color-picker__saturation-shade mpi-color-picker__saturation-shade--white"></span>
                    <span class="mpi-color-picker__saturation-shade mpi-color-picker__saturation-shade--black"></span>
                    <span class="mpi-color-picker__saturation-handle"></span>
                </div>
                <div class="mpi-color-picker__hue" data-role="hue" tabindex="0" aria-label="Color hue">
                    <span class="mpi-color-picker__hue-handle"></span>
                </div>
                <div class="mpi-color-picker__grid">
                    <label class="mpi-color-picker__field">R<input type="number" min="0" max="255" step="1" data-channel="r"></label>
                    <label class="mpi-color-picker__field">G<input type="number" min="0" max="255" step="1" data-channel="g"></label>
                    <label class="mpi-color-picker__field">B<input type="number" min="0" max="255" step="1" data-channel="b"></label>
                </div>
                <label class="mpi-color-picker__field mpi-color-picker__field--hex">HEX<input type="text" data-role="hex" spellcheck="false"></label>
            `;
            document.body.appendChild(popup);
            syncPopup();
            positionPopup();

            const updateSaturationFromPointer = (e) => {
                const field = qs('[data-role="saturation"]', popup);
                const rect = field.getBoundingClientRect();
                setHsv({
                    s: (e.clientX - rect.left) / rect.width,
                    v: 1 - ((e.clientY - rect.top) / rect.height),
                });
            };

            const updateHueFromPointer = (e) => {
                const slider = qs('[data-role="hue"]', popup);
                const rect = slider.getBoundingClientRect();
                setHsv({ h: ((e.clientX - rect.left) / rect.width) * 360 });
            };

            const bindDrag = (selector, updater) => {
                const target = qs(selector, popup);
                _unsubs.push(on(target, 'pointerdown', (e) => {
                    e.preventDefault();
                    target.setPointerCapture?.(e.pointerId);
                    updater(e);

                    const move = moveEvent => updater(moveEvent);
                    const up = (upEvent) => {
                        target.releasePointerCapture?.(upEvent.pointerId);
                        target.removeEventListener('pointermove', move);
                        target.removeEventListener('pointerup', up);
                        target.removeEventListener('pointercancel', up);
                    };

                    target.addEventListener('pointermove', move);
                    target.addEventListener('pointerup', up);
                    target.addEventListener('pointercancel', up);
                }));
            };

            bindDrag('[data-role="saturation"]', updateSaturationFromPointer);
            bindDrag('[data-role="hue"]', updateHueFromPointer);

            _unsubs.push(on(qs('[data-role="saturation"]', popup), 'keydown', (e) => {
                const step = e.shiftKey ? 0.1 : 0.02;
                if (!['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(e.key)) return;
                e.preventDefault();
                setHsv({
                    s: hsv.s + (e.key === 'ArrowRight' ? step : e.key === 'ArrowLeft' ? -step : 0),
                    v: hsv.v + (e.key === 'ArrowUp' ? step : e.key === 'ArrowDown' ? -step : 0),
                });
            }));

            _unsubs.push(on(qs('[data-role="hue"]', popup), 'keydown', (e) => {
                const step = e.shiftKey ? 15 : 3;
                if (!['ArrowLeft', 'ArrowRight'].includes(e.key)) return;
                e.preventDefault();
                setHsv({ h: hsv.h + (e.key === 'ArrowRight' ? step : -step) });
            }));

            _unsubs.push(on(popup, 'input', (e) => {
                const input = e.target.closest('input');
                if (!input) return;
                if (input.dataset.channel) {
                    setRgb({
                        ...rgb,
                        [input.dataset.channel]: input.value,
                    });
                    return;
                }
                if (input.dataset.role === 'hex' && HEX_RE.test(input.value.trim())) {
                    setRgb(hexToRgb(input.value, rgb));
                }
            }));

            _unsubs.push(on(popup, 'change', (e) => {
                const input = e.target.closest('input');
                if (!input) return;
                if (input.dataset.role === 'hex') {
                    setRgb(hexToRgb(input.value, rgb));
                } else if (input.dataset.channel) {
                    setRgb({
                        ...rgb,
                        [input.dataset.channel]: input.value,
                    });
                }
            }));
        };

        _unsubs.push(on(trigger, 'click', (e) => {
            e.stopPropagation();
            openPopup();
        }));
        _unsubs.push(on(document, 'click', (e) => {
            if (!popup) return;
            if (el.contains(e.target) || popup.contains(e.target)) return;
            closePopup();
        }));
        _unsubs.push(on(window, 'resize', positionPopup, { passive: true }));
        _unsubs.push(Events.on('ui:close-all-popups', closePopup));

        observer = new MutationObserver(() => {
            if (!document.contains(el)) el.destroy?.();
        });
        observer.observe(document.body, { childList: true, subtree: true });

        el.getRGB = () => ({ ...rgb });
        el.setRGB = (r, g, b) => setRgb({ r, g, b });
        el.setHex = (hex) => setRgb(hexToRgb(hex, rgb));
        el.getHex = () => rgbToHex(rgb);

        el.destroy = () => {
            closePopup();
            observer?.disconnect();
            _unsubs.forEach(fn => fn?.());
        };
    },
});
