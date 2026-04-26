/**
 * MpiToolOptionsRaw — Organism: tool-options panel for Raw image adjustments.
 *
 * Mounted by MpiGroupHistoryBlock into #right-top-slot when active tool = 'raw'.
 * CSS preview via rawPreview.js (instant). Debounced Sharp preview for dehaze +
 * per-color calibration. Apply = full-res Sharp bake → new history entry.
 *
 * Props:
 * @param {object} viewer - MpiCanvasViewer instance
 *
 * Emits:
 *   'apply' { item } — full-res bake complete, item shaped for appendToHistory
 */

import { ComponentFactory } from '../../factory.js';
import { MpiProgressBar } from '../../Primitives/MpiProgressBar/MpiProgressBar.js';
import { MpiButton } from '../../Primitives/MpiButton/MpiButton.js';
import { MpiRadioGroup } from '../../Primitives/MpiRadioGroup/MpiRadioGroup.js';
import { qs } from '../../../utils/dom.js';
import { buildCSSFilter } from '../../../utils/rawPreview.js';
import { clientLogger } from '../../../services/clientLogger.js';
import { state } from '../../../state.js';

// ── Param definitions ────────────────────────────────────────────────────────

const SECTIONS = [
    {
        id: 'light',
        title: 'Light',
        params: [
            { key: 'exposure', label: 'Exposure', min: -300, max: 300, step: 1, default: 0, suffix: '' },
            { key: 'shadows',  label: 'Shadows',  min: -100, max: 100, step: 1, default: 0, suffix: '' },
            // 'curve' is handled by canvas editor — not a slider param
        ],
    },
    {
        id: 'color',
        title: 'Color',
        params: [
            // whiteBalance handled by radio group — not a slider param
            { key: 'saturation',   label: 'Saturation',    min: -100, max: 100, step: 1, default: 0, suffix: '' },
            { key: 'dehaze',       label: 'Dehaze',         min: -100, max: 100, step: 1, default: 0, suffix: '', debounced: true },
        ],
    },
    {
        id: 'detail',
        title: 'Detail',
        params: [
            { key: 'sharpening',     label: 'Sharpening',      min: 0, max: 100, step: 1, default: 0, suffix: '', debounced: true },
            { key: 'noiseReduction', label: 'Noise Reduction',  min: 0, max: 100, step: 1, default: 0, suffix: '' },
            { key: 'grain',          label: 'Grain',            min: 0, max: 100, step: 1, default: 0, suffix: '', debounced: true },
        ],
    },
    {
        id: 'calibration',
        title: 'Calibration',
        collapsible: true,
        params: [
            { key: 'hueR', label: 'Hue R',   min: -180, max: 180, step: 1, default: 0, debounced: true },
            { key: 'hueG', label: 'Hue G',   min: -180, max: 180, step: 1, default: 0, debounced: true },
            { key: 'hueB', label: 'Hue B',   min: -180, max: 180, step: 1, default: 0, debounced: true },
            { key: 'satR', label: 'Sat R',   min: -100, max: 100, step: 1, default: 0, debounced: true },
            { key: 'satG', label: 'Sat G',   min: -100, max: 100, step: 1, default: 0, debounced: true },
            { key: 'satY', label: 'Sat Y',   min: -100, max: 100, step: 1, default: 0, debounced: true },
        ],
    },
];

// Build flat default values map (include non-slider params)
const DEFAULT_VALUES = { curve: 0, whiteBalance: 0 };
SECTIONS.forEach(s => s.params.forEach(p => { DEFAULT_VALUES[p.key] = p.default; }));

// Exposure stored internally as -300..+300 (×0.01 = EV stops)
function _evFromInternal(v) { return v / 100; }

// ── Helpers ──────────────────────────────────────────────────────────────────

function _debounce(fn, ms) {
    let t = null;
    return (...args) => {
        clearTimeout(t);
        t = setTimeout(() => fn(...args), ms);
    };
}

function _isBipolar(p) {
    return p.min < 0;
}

// ── Template ─────────────────────────────────────────────────────────────────

function _buildTemplate() {
    const sections = SECTIONS.map(s => {
        const collapsibleClass = s.collapsible ? ' mpi-tool-options-raw__section--collapsible mpi-tool-options-raw__section--collapsed' : '';
        const params = s.params.map(p => `
            <div class="mpi-tool-options-raw__param" data-param="${p.key}">
                <div class="mpi-tool-options-raw__param-label">
                    <span>${p.label}</span>
                    <span class="mpi-tool-options-raw__param-value" data-value="${p.key}">0</span>
                </div>
                <div class="mpi-tool-options-raw__param-slider" id="slider-${p.key}"></div>
            </div>
        `).join('');

        const wbRow = s.id === 'color' ? `
            <div class="mpi-tool-options-raw__param">
                <div class="mpi-tool-options-raw__param-label">
                    <span>White Balance</span>
                    <span class="mpi-tool-options-raw__param-value" data-value="whiteBalance"></span>
                </div>
                <div class="mpi-tool-options-raw__param-slider" id="wb-radio-slot"></div>
            </div>
        ` : '';

        const curveCanvas = s.id === 'light' ? `
            <div class="mpi-tool-options-raw__param">
                <div class="mpi-tool-options-raw__param-label">
                    <span>Point Curve</span>
                </div>
                <canvas class="mpi-tool-options-raw__curve-canvas" id="curve-canvas" width="160" height="160"></canvas>
            </div>
        ` : '';

        const body = `<div class="mpi-tool-options-raw__section-body">${wbRow}${params}${curveCanvas}</div>`;

        return `
            <div class="mpi-tool-options-raw__section${collapsibleClass}" data-section="${s.id}">
                <div class="mpi-tool-options-raw__section-title">${s.title}</div>
                ${body}
            </div>
        `;
    }).join('');

    return `
        <div class="mpi-tool-options-raw">
            ${sections}
            <div class="mpi-tool-options-raw__actions" id="raw-actions-slot"></div>
        </div>
    `;
}

// ── Component ─────────────────────────────────────────────────────────────────

export const MpiToolOptionsRaw = ComponentFactory.create({
    name: 'MpiToolOptionsRaw',
    css: ['js/components/Organisms/MpiToolOptionsRaw/MpiToolOptionsRaw.css'],

    template: _buildTemplate,

    setup: (el, props, emit) => {
        const { viewer } = props;
        const _children = [];
        const _sliders = {};   // key → MpiProgressBar instance
        const _values = { ...DEFAULT_VALUES };
        let _applying = false;

        // ── Curve canvas editor ───────────────────────────────────────────────
        let _curvePoint = { x: 0.5, y: 0.5 };

        function _drawCurve() {
            const canvas = el.querySelector('#curve-canvas');
            if (!canvas) return;
            const ctx = canvas.getContext('2d');
            // Use CSS size as logical coordinate space (DPR scaling applied at init)
            const dpr = window.devicePixelRatio || 1;
            const W = canvas.width / dpr;
            const H = canvas.height / dpr;

            ctx.clearRect(0, 0, W, H);

            // Background
            ctx.fillStyle = getComputedStyle(document.documentElement).getPropertyValue('--surface-2').trim() || '#1a1a1a';
            ctx.fillRect(0, 0, W, H);

            // Grid lines (4×4)
            ctx.strokeStyle = 'rgba(255,255,255,0.08)';
            ctx.lineWidth = 1;
            for (let i = 1; i < 4; i++) {
                const x = (W / 4) * i;
                const y = (H / 4) * i;
                ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, H); ctx.stroke();
                ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(W, y); ctx.stroke();
            }

            // Diagonal reference (identity line)
            ctx.strokeStyle = 'rgba(255,255,255,0.18)';
            ctx.lineWidth = 1;
            ctx.setLineDash([4, 4]);
            ctx.beginPath(); ctx.moveTo(0, H); ctx.lineTo(W, 0); ctx.stroke();
            ctx.setLineDash([]);

            // Natural cubic spline through 3 points in normalised [0,1] space:
            //   p0=(0,0), p1=ctrl, p2=(1,1)
            // Natural BC: second derivative = 0 at endpoints → tangents m0=m2=0
            // For 3 knots the tridiagonal system solves to:
            //   m1 = 3 * ( (y2-y1)/h1 / (h0+h1) - (y1-y0)/h0 / (h0+h1) ) * h0*h1
            // Simplified exact formula (Thomas algorithm, 1 interior knot):
            //   2*(h0+h1)*m1 = 3*( (y2-y1)/h1*h0 + (y1-y0)/h0*h1 ) — NO, use:
            // Standard result: m1 = 3*( (y2-y1)/h1 - (y1-y0)/h0 ) / (h0+h1) * h0*h1/(h0+h1)...
            // Cleanest form — natural spline 3-point exact solution:
            //   [2h0, h0 ] [m0]   [3(y1-y0)]
            //   [h0, 2(h0+h1), h1] [m1] = [3((y2-y1)/h1*h0 + (y1-y0)/h0*h1)] * correction
            //   [h1, 2h1] [m2]   [3(y2-y1)]
            // With natural BC m0=m2=0, interior row reduces to:
            //   2*(h0+h1)*m1 = 3*( (y2-y1)/h1 - (y1-y0)/h0 ) * (h0+h1) ...
            // Correct closed form for natural spline, 3 knots:
            //   m1 = 3/2 * ( (y2-y1)/h1 - (y1-y0)/h0 ) / (h0+h1) * (h0*h1)
            // Actually simplest verified form:
            const y0 = 0, y1 = _curvePoint.y, y2 = 1;
            const x0 = 0, x1 = _curvePoint.x, x2 = 1;
            const h0 = x1 - x0;
            const h1 = x2 - x1;

            // Catmull-Rom: endpoint tangents = adjacent chord, interior = avg of chords
            // Monotone when chords same sign → no oscillation ever
            const s0 = (h0 > 0) ? (y1 - y0) / h0 : 0;
            const s1 = (h1 > 0) ? (y2 - y1) / h1 : 0;
            const m0 = s0;
            const m2 = s1;
            // Interior: harmonic-mean weighted avg — Catmull-Rom standard
            const m1 = (h0 + h1 > 0) ? (s0 * h1 + s1 * h0) / (h0 + h1) : 1;

            // Evaluate spline at normalised x, return normalised y
            function _splineY(nx) {
                if (nx <= x1 && h0 > 0) {
                    const u = (nx - x0) / h0;
                    // Hermite basis
                    return (2*u*u*u - 3*u*u + 1)*y0 + (u*u*u - 2*u*u + u)*h0*m0
                         + (-2*u*u*u + 3*u*u)*y1 + (u*u*u - u*u)*h0*m1;
                } else if (h1 > 0) {
                    const u = (nx - x1) / h1;
                    return (2*u*u*u - 3*u*u + 1)*y1 + (u*u*u - 2*u*u + u)*h1*m1
                         + (-2*u*u*u + 3*u*u)*y2 + (u*u*u - u*u)*h1*m2;
                }
                return nx; // fallback: identity
            }

            // Sample curve at high resolution
            const STEPS = 240;
            const pts = [];
            for (let i = 0; i <= STEPS; i++) {
                const nx = i / STEPS;
                const raw = _splineY(nx);
                pts.push({ nx, raw, ny: Math.max(0, Math.min(1, raw)) });
            }

            // Draw curve — when output at boundary (0 or 1), draw flat along edge
            ctx.strokeStyle = '#ffffff';
            ctx.lineWidth = 1;
            ctx.beginPath();
            const EPS = 0.001;
            for (let i = 0; i <= STEPS; i++) {
                const { nx, ny } = pts[i];
                const px = nx * W;
                const py = (1 - ny) * H;
                if (i === 0) { ctx.moveTo(px, py); continue; }
                const prevNy = pts[i - 1].ny;
                const atBottom = ny < EPS && prevNy < EPS;
                const atTop    = ny > 1 - EPS && prevNy > 1 - EPS;
                // If both points on same edge, lineTo draws the flat clip line
                ctx.lineTo(px, py);
            }
            ctx.stroke();

            // Control point dot
            const dotX = x1 * W;
            const dotY = (1 - y1) * H;
            ctx.fillStyle = '#ffffff';
            ctx.beginPath();
            ctx.arc(dotX, dotY, 5, 0, Math.PI * 2);
            ctx.fill();
        }

        function _initCurveDrag() {
            const canvas = el.querySelector('#curve-canvas');
            if (!canvas) return;

            let _dragging = false;

            canvas.addEventListener('mousedown', (e) => {
                _dragging = true;
                e.preventDefault();
            });

            const onMove = (e) => {
                if (!_dragging) return;
                const rect = canvas.getBoundingClientRect();
                const nx = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
                const ny = Math.max(0, Math.min(1, 1 - (e.clientY - rect.top) / rect.height));
                _curvePoint = { x: nx, y: ny };
                _values.curve = Math.round((_curvePoint.y - 0.5) * 200);
                _applyPreview(_values, 'curve');
                _drawCurve();
            };

            const onUp = () => { _dragging = false; };

            document.addEventListener('mousemove', onMove);
            document.addEventListener('mouseup', onUp);

            // Store cleanup
            _curveDragCleanup = () => {
                document.removeEventListener('mousemove', onMove);
                document.removeEventListener('mouseup', onUp);
            };
        }

        let _curveDragCleanup = null;

        // ── Collapsible sections ──────────────────────────────────────────────
        el.querySelectorAll('.mpi-tool-options-raw__section--collapsible .mpi-tool-options-raw__section-title')
            .forEach(titleEl => {
                titleEl.addEventListener('click', () => {
                    titleEl.closest('.mpi-tool-options-raw__section')
                        .classList.toggle('mpi-tool-options-raw__section--collapsed');
                });
            });

        // ── Debounced Sharp preview ───────────────────────────────────────────
        const _sharpPreview = _debounce(async (values) => {
            const entry = viewer.el.getCurrentEntry?.();
            if (!entry?.filePath) return;
            try {
                const res = await fetch('/api/image/adjust', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        imagePath: entry.filePath,
                        folderPath: state.currentProject?.folderPath,
                        params: _normalizeParams(values),
                        preview: true,
                    }),
                });
                const data = await res.json();
                if (data.previewBase64) {
                    viewer.el.setPreviewSrc?.(data.previewBase64);
                }
            } catch (err) {
                clientLogger.error('raw', 'Sharp preview failed', err);
            }
        }, 300);

        // Keys that always need Sharp preview (no CSS approximation)
        const _SHARP_ONLY_KEYS = new Set();

        // ── CSS preview (instant) ─────────────────────────────────────────────
        function _applyPreview(values, triggerKey) {
            const imgEl = viewer.el.getImageEl?.();
            if (imgEl) {
                imgEl.style.filter = buildCSSFilter(values);
            }
            // Debounced-only params and Sharp-only keys fire server preview
            const def = SECTIONS.flatMap(s => s.params).find(p => p.key === triggerKey);
            if (def?.debounced || _SHARP_ONLY_KEYS.has(triggerKey)) {
                _sharpPreview(values);
            }
        }

        // ── Normalize params for API (exposure = EV stops) ────────────────────
        function _normalizeParams(values) {
            return {
                ...values,
                exposure: _evFromInternal(values.exposure),
            };
        }

        // ── Mount sliders ─────────────────────────────────────────────────────
        SECTIONS.forEach(section => {
            section.params.forEach(p => {
                const slot = qs(`#slider-${p.key}`, el);
                if (!slot) return;

                const bipolar = _isBipolar(p);
                const bar = MpiProgressBar.mount(document.createElement('div'), {
                    min: p.min,
                    max: p.max,
                    step: p.step,
                    value: p.default,
                    bipolar,
                    interactive: true,
                    handle: true,
                    wheel: true,
                    suffix: p.suffix || '',
                });
                slot.appendChild(bar.el);
                _sliders[p.key] = bar;
                _children.push(bar);

                bar.on('input', ({ value }) => {
                    _values[p.key] = value;
                    const valEl = qs(`[data-value="${p.key}"]`, el);
                    if (valEl) valEl.textContent = value;
                    _applyPreview(_values, p.key);
                });
            });
        });

        // ── White Balance radio ───────────────────────────────────────────────
        const wbSlot = qs('#wb-radio-slot', el);
        const wbRadio = MpiRadioGroup.mount(document.createElement('div'), {
            name: 'white-balance',
            value: 'As shot',
            options: [
                { label: 'As shot', value: 'As shot', info: 'No white balance correction' },
                { label: 'Auto',    value: 'Auto',    info: 'Compute grey-world white balance' },
            ],
        });
        wbSlot.appendChild(wbRadio.el);
        _children.push(wbRadio);

        const _wbValueEl = () => qs('[data-value="whiteBalance"]', el);

        // Grey-world auto WB: client-side pixel sampling on <img> or <canvas>
        async function _applyAutoWB() {
            const elRef = viewer.el.getImageEl?.();
            if (!elRef) return;

            // Resolve the drawable source: <img>, <canvas> inside wrapper, or elRef itself
            let srcEl = elRef;
            if (elRef.tagName !== 'IMG' && elRef.tagName !== 'CANVAS') {
                srcEl = elRef.querySelector('canvas') || elRef.querySelector('img');
            }
            if (!srcEl) return;

            let W, H;
            if (srcEl.tagName === 'IMG') {
                if (!srcEl.complete || !srcEl.naturalWidth) {
                    await new Promise((resolve, reject) => { srcEl.onload = resolve; srcEl.onerror = reject; });
                }
                W = srcEl.naturalWidth;
                H = srcEl.naturalHeight;
            } else {
                W = srcEl.width;
                H = srcEl.height;
            }
            if (!W || !H) return;

            const offscreen = document.createElement('canvas');
            offscreen.width = W;
            offscreen.height = H;
            const ctx = offscreen.getContext('2d');
            ctx.drawImage(srcEl, 0, 0, W, H);

            let data;
            try { data = ctx.getImageData(0, 0, W, H); }
            catch { clientLogger.error('raw', 'Auto WB: canvas tainted'); return; }

            const px = data.data;
            let sumR = 0, sumG = 0, sumB = 0, count = 0;
            for (let i = 0; i < px.length; i += 16) {
                sumR += px[i]; sumG += px[i + 1]; sumB += px[i + 2]; count++;
            }

            const avgR = sumR / count, avgG = sumG / count, avgB = sumB / count;
            const avgGrey = (avgR + avgG + avgB) / 3;
            const scaleR = avgGrey / avgR, scaleG = avgGrey / avgG, scaleB = avgGrey / avgB;

            for (let i = 0; i < px.length; i += 4) {
                px[i]     = Math.min(255, px[i]     * scaleR);
                px[i + 1] = Math.min(255, px[i + 1] * scaleG);
                px[i + 2] = Math.min(255, px[i + 2] * scaleB);
            }
            ctx.putImageData(data, 0, 0);

            // For <img>: swap src. For canvas viewer: load corrected image via setPreviewSrc.
            const correctedDataUrl = offscreen.toDataURL('image/jpeg', 0.92);
            if (srcEl.tagName === 'IMG') {
                if (!srcEl.dataset.originalSrc) srcEl.dataset.originalSrc = srcEl.src;
                srcEl.src = correctedDataUrl;
            } else {
                viewer.el.setPreviewSrc?.(correctedDataUrl);
            }

            const wbVal = Math.round((scaleR - scaleB) * 50);
            _values.whiteBalance = wbVal;
            const ve = _wbValueEl(); if (ve) ve.textContent = wbVal;
        }

        wbRadio.on('select', async ({ value }) => {
            if (value === 'As shot') {
                _values.whiteBalance = 0;
                const ve = _wbValueEl(); if (ve) ve.textContent = '';
                // Restore original src for <img> elements
                const elRef = viewer.el.getImageEl?.();
                if (elRef?.tagName === 'IMG' && elRef.dataset.originalSrc) {
                    elRef.src = elRef.dataset.originalSrc;
                    delete elRef.dataset.originalSrc;
                } else if (elRef?.tagName !== 'IMG') {
                    // For canvas viewer: reload current entry to restore original
                    const entry = viewer.el.getCurrentEntry?.();
                    if (entry) viewer.el.loadEntry?.(entry, undefined);
                }
                _applyPreview(_values, 'whiteBalance');
                return;
            }
            try {
                await _applyAutoWB();
            } catch (err) {
                clientLogger.error('raw', 'Auto WB failed', err);
            }
        });

        // ── Init curve canvas ─────────────────────────────────────────────────
        // Scale canvas buffer to devicePixelRatio for crisp rendering
        (function _initCanvas() {
            const canvas = el.querySelector('#curve-canvas');
            if (!canvas) return;
            const dpr = window.devicePixelRatio || 1;
            const cssW = canvas.offsetWidth || 160;
            const cssH = canvas.offsetHeight || 160;
            canvas.width = cssW * dpr;
            canvas.height = cssH * dpr;
            canvas.getContext('2d').scale(dpr, dpr);
        })();
        _drawCurve();
        _initCurveDrag();

        // ── Actions ───────────────────────────────────────────────────────────
        const actionsSlot = qs('#raw-actions-slot', el);

        const resetBtn = MpiButton.mount(document.createElement('div'), {
            label: 'Reset', variant: 'ghost', size: 'sm',
            info: 'Reset all adjustments to default',
        });
        actionsSlot.appendChild(resetBtn.el);
        _children.push(resetBtn);

        const applyBtn = MpiButton.mount(document.createElement('div'), {
            icon: 'check', label: 'Apply', variant: 'primary', size: 'sm',
            info: 'Bake adjustments as new history entry',
        });
        actionsSlot.appendChild(applyBtn.el);
        _children.push(applyBtn);

        resetBtn.on('click', () => el.reset());

        applyBtn.on('click', async () => {
            if (_applying) return;
            const entry = viewer.el.getCurrentEntry?.();
            if (!entry?.filePath) return;
            _applying = true;
            applyBtn.el.setAttribute('disabled', '');
            try {
                const res = await fetch('/api/image/adjust', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        imagePath: entry.filePath,
                        folderPath: state.currentProject?.folderPath,
                        params: _normalizeParams(_values),
                        preview: false,
                        groupId: entry.groupId,
                        itemId: entry.id,
                    }),
                });
                const data = await res.json();
                if (data.success && data.item) {
                    el.reset();
                    emit('apply', { item: data.item });
                } else {
                    clientLogger.error('raw', 'Apply failed', data);
                }
            } catch (err) {
                clientLogger.error('raw', 'Apply request failed', err);
            } finally {
                _applying = false;
                applyBtn.el.removeAttribute('disabled');
            }
        });

        // ── Public API ────────────────────────────────────────────────────────
        el.reset = () => {
            Object.assign(_values, DEFAULT_VALUES);
            SECTIONS.forEach(s => s.params.forEach(p => {
                _sliders[p.key]?.el.setValueQuiet?.(p.default);
                const valEl = qs(`[data-value="${p.key}"]`, el);
                if (valEl) valEl.textContent = p.default;
            }));
            // Reset WB radio silently (setValue fires 'select' → zeroes _values.whiteBalance)
            _values.whiteBalance = 0;
            wbRadio.el.setValue('As shot');
            const wbVe = _wbValueEl(); if (wbVe) wbVe.textContent = '';
            _curvePoint = { x: 0.5, y: 0.5 };
            _drawCurve();
            const imgEl = viewer.el.getImageEl?.();
            if (imgEl) imgEl.style.filter = '';
        };

        el.destroy = () => {
            _curveDragCleanup?.();
            const imgEl = viewer.el.getImageEl?.();
            if (imgEl) imgEl.style.filter = '';
            _children.forEach(c => c.destroy?.());
        };
    },
});
