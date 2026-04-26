/**
 * MpiToolOptionsRaw — Organism: tool-options panel for Raw image adjustments.
 *
 * Mounted by MpiGroupHistoryBlock into #right-top-slot when active tool = 'raw'.
 * GPU preview via RawGpuPipeline (instant, rAF-throttled). No server round-trips
 * during interaction. Apply = full-res GPU bake → POST /api/image/bake → new history entry.
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
import { clientLogger } from '../../../services/clientLogger.js';
import { state } from '../../../state.js';
import { RawGpuPipeline } from '../../../utils/rawGpuPipeline.js';

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
            { key: 'dehaze',       label: 'Dehaze',         min: -100, max: 100, step: 1, default: 0, suffix: '' },
        ],
    },
    {
        id: 'detail',
        title: 'Detail',
        params: [
            { key: 'sharpening',     label: 'Sharpening',      min: 0, max: 100, step: 1, default: 0, suffix: '' },
            { key: 'noiseReduction', label: 'Noise Reduction',  min: 0, max: 100, step: 1, default: 0, suffix: '' },
            { key: 'grain',          label: 'Grain',            min: 0, max: 100, step: 1, default: 0, suffix: '' },
        ],
    },
    {
        id: 'calibration',
        title: 'Calibration',
        collapsible: true,
        params: [
            { key: 'hueR', label: 'Hue R',   min: -180, max: 180, step: 1, default: 0 },
            { key: 'hueG', label: 'Hue G',   min: -180, max: 180, step: 1, default: 0 },
            { key: 'hueB', label: 'Hue B',   min: -180, max: 180, step: 1, default: 0 },
            { key: 'satR', label: 'Sat R',   min: -100, max: 100, step: 1, default: 0 },
            { key: 'satG', label: 'Sat G',   min: -100, max: 100, step: 1, default: 0 },
            { key: 'satY', label: 'Sat Y',   min: -100, max: 100, step: 1, default: 0 },
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
        const _pipeline = new RawGpuPipeline();

        // ── Curve canvas editor ───────────────────────────────────────────────
        let _curvePoint = { x: 0.5, y: 0.5 };
        let _histogram = null; // Float32Array(256) normalized 0..1

        function _computeHistogram() {
            const imgEl = viewer.el?.img;
            if (!imgEl?.naturalWidth) { _histogram = null; return; }
            const SAMPLE = 256;
            const off = document.createElement('canvas');
            off.width = SAMPLE; off.height = SAMPLE;
            const octx = off.getContext('2d');
            try { octx.drawImage(imgEl, 0, 0, SAMPLE, SAMPLE); }
            catch { _histogram = null; return; }
            let data;
            try { data = octx.getImageData(0, 0, SAMPLE, SAMPLE).data; }
            catch { _histogram = null; return; }
            const bins = new Uint32Array(256);
            for (let i = 0; i < data.length; i += 4) {
                const lum = (data[i] * 0.2126 + data[i + 1] * 0.7152 + data[i + 2] * 0.0722) | 0;
                bins[Math.min(255, lum)]++;
            }
            let max = 0;
            for (let i = 0; i < 256; i++) if (bins[i] > max) max = bins[i];
            const out = new Float32Array(256);
            // Log scale to flatten spikes
            const lmax = Math.log(1 + max);
            if (lmax > 0) for (let i = 0; i < 256; i++) out[i] = Math.log(1 + bins[i]) / lmax;
            _histogram = out;
        }

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

            // Histogram fill (behind grid)
            if (_histogram) {
                ctx.fillStyle = 'rgba(255,255,255,0.18)';
                ctx.beginPath();
                ctx.moveTo(0, H);
                for (let i = 0; i < 256; i++) {
                    const x = (i / 255) * W;
                    const y = H - _histogram[i] * H;
                    ctx.lineTo(x, y);
                }
                ctx.lineTo(W, H);
                ctx.closePath();
                ctx.fill();
            }

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

            const _splineY = _makeSplineY(_curvePoint);

            // Sample curve at high resolution
            const STEPS = 240;
            const pts = [];
            for (let i = 0; i <= STEPS; i++) {
                const nx = i / STEPS;
                const raw = _splineY(nx);
                pts.push({ nx, raw, ny: Math.max(0, Math.min(1, raw)) });
            }

            ctx.strokeStyle = '#ffffff';
            ctx.lineWidth = 1;
            ctx.beginPath();
            for (let i = 0; i <= STEPS; i++) {
                const { nx, ny } = pts[i];
                const px = nx * W;
                const py = (1 - ny) * H;
                if (i === 0) ctx.moveTo(px, py);
                else ctx.lineTo(px, py);
            }
            ctx.stroke();

            // Endpoint dots (hollow) — black point bottom-left, white point top-right
            ctx.strokeStyle = '#ffffff';
            ctx.lineWidth = 1.5;
            ctx.beginPath(); ctx.arc(0,     H, 4, 0, Math.PI * 2); ctx.stroke();
            ctx.beginPath(); ctx.arc(W,     0, 4, 0, Math.PI * 2); ctx.stroke();

            // Control point dot (filled)
            const dotX = _curvePoint.x * W;
            const dotY = (1 - _curvePoint.y) * H;
            ctx.fillStyle = '#ffffff';
            ctx.beginPath();
            ctx.arc(dotX, dotY, 5, 0, Math.PI * 2);
            ctx.fill();
        }

        function _makeSplineY(cp) {
            const y0 = 0, y1 = cp.y, y2 = 1;
            const x0 = 0, x1 = cp.x, x2 = 1;
            const h0 = x1 - x0;
            const h1 = x2 - x1;
            const s0 = h0 > 0 ? (y1 - y0) / h0 : 0;
            const s1 = h1 > 0 ? (y2 - y1) / h1 : 0;
            const m0 = s0, m2 = s1;
            const m1 = (h0 + h1 > 0) ? (s0 * h1 + s1 * h0) / (h0 + h1) : 1;
            return (nx) => {
                if (nx <= x1 && h0 > 0) {
                    const u = (nx - x0) / h0;
                    return (2*u*u*u - 3*u*u + 1)*y0 + (u*u*u - 2*u*u + u)*h0*m0
                         + (-2*u*u*u + 3*u*u)*y1 + (u*u*u - u*u)*h0*m1;
                } else if (h1 > 0) {
                    const u = (nx - x1) / h1;
                    return (2*u*u*u - 3*u*u + 1)*y1 + (u*u*u - 2*u*u + u)*h1*m1
                         + (-2*u*u*u + 3*u*u)*y2 + (u*u*u - u*u)*h1*m2;
                }
                return nx;
            };
        }

        function _pushCurveLUT() {
            const lut = _buildLUT(_makeSplineY(_curvePoint));
            _pipeline.setParams({ curveLUT: { rgb: lut } });
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
                _pushCurveLUT();
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

        // ── GPU pipeline mount ────────────────────────────────────────────────
        async function _mountPipeline() {
            const imgEl = viewer.el.img;
            if (!imgEl?.naturalWidth) return;
            await _pipeline.mount(imgEl, (bitmap) => {
                viewer.el.setProcessedImage(bitmap);
            });
            _pipeline.setParams(_buildPipelineParams(_values));
            _computeHistogram();
            _drawCurve();
        }

        // Map internal _values → pipeline param keys
        function _buildPipelineParams(v) {
            return {
                exposure:      _evFromInternal(v.exposure ?? 0),
                shadows:       (v.shadows ?? 0) / 100,
                saturation:    v.saturation ?? 0,
                sharpening:    (v.sharpening ?? 0) / 100 * 3,       // 0–100 → 0–3
                sharpenRadius: 1.5,
                sharpenThresh: 0.05,
                noiseReduction:(v.noiseReduction ?? 0) / 100 * 20,  // 0–100 → 0–20
                nrThreshold:   30,
                grain:         (v.grain ?? 0) / 100,
                grainSize:     1.0,
                grainColor:    0,
                grainLumBias:  0.5,
                grainMode:     0,
                dehaze:        (v.dehaze ?? 0) / 100,                // -100..100 → -1..1
            };
        }

        // ── GPU preview (instant, rAF-throttled by pipeline) ─────────────────
        function _applyPreview() {
            _pipeline.setParams(_buildPipelineParams(_values));
        }

        // ── LUT helpers (curve canvas → pipeline) ────────────────────────────
        function _buildLUT(splineY) {
            const lut = new Float32Array(256);
            for (let i = 0; i < 256; i++) {
                lut[i] = Math.max(0, Math.min(1, splineY(i / 255)));
            }
            return lut;
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
                    _applyPreview();
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

            // Re-mount pipeline against WB-corrected offscreen canvas (direct, no PNG roundtrip).
            // Pipeline reads naturalWidth/naturalHeight — provide via shim object.
            const canvasSrc = Object.assign(offscreen, { naturalWidth: W, naturalHeight: H });
            await _pipeline.mount(canvasSrc, (bitmap) => { viewer.el.setProcessedImage(bitmap); });
            _pipeline.setParams(_buildPipelineParams(_values));

            const wbVal = Math.round((scaleR - scaleB) * 50);
            _values.whiteBalance = wbVal;
            const ve = _wbValueEl(); if (ve) ve.textContent = wbVal;
        }

        wbRadio.on('select', async ({ value }) => {
            if (value === 'As shot') {
                _values.whiteBalance = 0;
                const ve = _wbValueEl(); if (ve) ve.textContent = '';
                // Re-mount on original image to drop WB correction
                await _mountPipeline();
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

        // Mount pipeline once image is ready; remount on every entry switch
        const _offEntryLoaded = viewer.on('entry-loaded', () => _mountPipeline());
        // Cover case where entry-loaded fired before this component mounted.
        if (viewer.el.img?.naturalWidth) _mountPipeline();

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
                const blob = await _pipeline.renderFullRes();
                const form = new FormData();
                form.append('image', blob, 'bake.png');
                form.append('imagePath', entry.filePath);
                form.append('folderPath', state.currentProject?.folderPath ?? '');
                form.append('groupId', entry.groupId ?? '');
                form.append('itemId', entry.id ?? '');
                const res = await fetch('/api/image/bake', { method: 'POST', body: form });
                const data = await res.json();
                if (data.success && data.item) {
                    el.reset();
                    emit('apply', { item: data.item });
                } else {
                    clientLogger.error('raw', 'Bake failed', data);
                }
            } catch (err) {
                clientLogger.error('raw', 'Bake request failed', err);
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
            _mountPipeline();
        };

        el.destroy = () => {
            _offEntryLoaded?.();
            _curveDragCleanup?.();
            _pipeline.destroy();
            viewer.el.clearProcessedImage?.();
            _children.forEach(c => c.destroy?.());
        };
    },
});
