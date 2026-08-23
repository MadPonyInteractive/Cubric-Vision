/**
 * brushDab.js — the shared brush primitive (MPI-375) and its preset pack (MPI-435).
 *
 * ONE dab, and the spacing that turns a pair of mouse samples into a continuous
 * stroke. This is the whole of "one brush engine, two destinations": `MaskManager`
 * stamps into its two binary alpha layers, `PaintManager` stamps into one RGBA
 * layer, and neither owns the geometry. A full BrushEngine class was rejected
 * (MPI-375 planning) — it would have rewritten a working shared primitive and
 * every call site in InputController, MpiCanvas and the undo wiring to deliver
 * exactly what these two functions deliver.
 *
 * MPI-435 parameterised `stampDab` and nothing else, as its card required. If a
 * later change finds itself editing two dab implementations, the extraction has
 * regressed — repair it here rather than forking.
 *
 * Coordinates and radii are in the DESTINATION canvas' own pixels. Callers scale
 * first: mask layers live at the downscaled `MASK_MAX_EDGE` working size, the
 * paint layer at image-native size, and neither scale belongs in here.
 */

const TAU = Math.PI * 2;

/**
 * Preset defaults — the hard round brush, i.e. exactly what a dab was before
 * MPI-435. Every preset below is a DIFF against this, so an omitted knob is
 * provably neutral and the default path cannot drift as the table grows.
 *
 * Eight knobs, and each one is load-bearing for at least one preset; a knob no
 * preset moves is a knob that should not exist. Sub-dab radius is deliberately
 * NOT a ninth: it is derived as `r / sqrt(density)`, because more specks means
 * smaller specks and the total ink should hold roughly constant across the table.
 */
const BASE = {
    /** 0 = falloff all the way from the centre, 1 = no falloff (a hard arc). */
    hardness: 1,
    /** Short axis / long axis. 1 is round; a chisel is thin. */
    aspect: 1,
    /** Long-axis rotation in radians. */
    angle: 0,
    /** Radians of pseudo-random rotation per dab. Says nothing when aspect === 1. */
    angleJitter: 0,
    /** Sub-dabs per dab, each at `r / sqrt(density)`. */
    density: 1,
    /** Sub-dab offset from the dab centre, as a fraction of r. */
    scatter: 0,
    /** Per-dab alpha. Dabs overlap 75%, so below 1 a stroke BUILDS rather than stamps. */
    flow: 1,
    /**
     * Dab spacing as a fraction of the brush RADIUS.
     *
     * Before MPI-375 there was no spacing at all: `MaskManager.paint()` stamped one
     * arc per `mousemove` and nothing joined them, so any sample gap wider than the
     * brush left a hole in the stroke — 40 image-px at the default brush size, which
     * a normal fast flick clears easily on a zoomed-out large image. It read as a
     * skipping brush rather than as a missing feature, which is why it survived.
     *
     * A quarter radius overlaps consecutive dabs by 75% of their width: continuous at
     * any speed, and cheap — a 200px flick with a 20px radius costs 40 arcs, not the
     * hundreds a per-pixel walk would. A preset that scatters its ink spends MORE
     * spacing, not less, or the gaps it exists to open get filled straight back in.
     */
    spacing: 0.25,
};

/**
 * The ten presets, in menu order. Procedural PARAMETER SETS, not image stamps (user
 * decision, 2026-08-03): nothing to author, license, ship or load, and they resample
 * cleanly to any brush size, which a fixed-resolution PNG does not.
 *
 * `hard` is first and is the default because it IS the pre-MPI-435 brush — a user
 * who never opens the picker must get exactly what they had.
 *
 * An authored bitmap stamp stays possible and is NOT walled off: it becomes another
 * row here whose dab swaps `ctx.fill()` for a `drawImage()`, inside the same scatter,
 * spacing, flow and extent maths. Deliberately not built now.
 */
export const BRUSH_PRESETS = [
    { id: 'hard',     label: 'Hard Round' },
    { id: 'soft',     label: 'Soft Round',  hardness: 0.3 },
    { id: 'feather',  label: 'Feather',     hardness: 0,    flow: 0.4,  spacing: 0.15 },
    { id: 'air',      label: 'Airbrush',    hardness: 0,    flow: 0.12, spacing: 0.1 },
    { id: 'chisel',   label: 'Chisel',      hardness: 0.8,  aspect: 0.35, angle: -Math.PI / 4 },
    { id: 'callig',   label: 'Calligraphy', aspect: 0.18,   angle: Math.PI / 6, spacing: 0.12 },
    { id: 'spray',    label: 'Spray',       hardness: 0.35, flow: 0.45, spacing: 0.5,
        density: 8,  scatter: 1.3 },
    { id: 'charcoal', label: 'Charcoal',    hardness: 0.5,  flow: 0.7,  spacing: 0.3,
        density: 5,  scatter: 0.65, aspect: 0.75, angleJitter: Math.PI },
    { id: 'stipple',  label: 'Stipple',     flow: 0.85,     spacing: 0.8,
        density: 3,  scatter: 1.6 },
    { id: 'dry',      label: 'Dry Brush',   hardness: 0.85, flow: 0.3,  spacing: 0.35,
        density: 12, scatter: 0.85 },
];

export const DEFAULT_BRUSH_PRESET = 'hard';

const _resolved = new Map(BRUSH_PRESETS.map(p => [p.id, { ...BASE, ...p }]));

/**
 * Resolve a preset id to its full parameter set. An unknown or absent id falls back
 * to the hard round — the `preset` argument is optional at every call site, which is
 * what keeps `CompositeManager` (a hard cut, no picker) on exactly the old behaviour.
 * @param {string} [id]
 */
export function getPreset(id) {
    return _resolved.get(id) || _resolved.get(DEFAULT_BRUSH_PRESET);
}

/**
 * Pseudo-random in [0, 1), a pure hash of its inputs.
 *
 * 🔴 The scatter and angle jitter MUST be deterministic, not `Math.random()`. The
 * mask brush stamps THE SAME DAB TWICE — `destination-out` into `manual` and
 * `source-over` into `subtract`, and the reverse when erasing — and those two layers
 * are exact mirrors, which is the whole basis of `mask = manual AND NOT subtract`.
 * A random scatter would hand the two calls DIFFERENT geometry and leave residue no
 * eraser could ever remove. Hashing (x, y, i) also makes a repaint identical.
 */
function rand01(x, y, i) {
    const s = Math.sin(x * 127.1 + y * 311.7 + i * 74.7) * 43758.5453;
    return s - Math.floor(s);
}

/**
 * The furthest a dab of radius `r` reaches from its centre under this preset.
 *
 * Callers grow their undo dirty box with THIS, not with `r` (MPI-435's undo trap):
 * a scattered dab paints outside the nominal radius, and a box grown for `r` would
 * restore a rect smaller than the stroke and leave painted pixels behind. Returns
 * exactly `r` for the default preset, so nothing about the old undo changes.
 *
 * @param {number} r - radius in destination-canvas px
 * @param {string} [preset]
 */
export function dabExtent(r, preset) {
    const p = getPreset(preset);
    return r * (p.scatter + 1 / Math.sqrt(p.density));
}

/**
 * The same colour at alpha 0 — the far stop of a soft dab's falloff.
 *
 * 🔴 NOT the CSS keyword `transparent`. That is `rgba(0, 0, 0, 0)`, and Chromium
 * interpolates canvas gradient stops in NON-premultiplied space, so it drags the
 * colour through BLACK on the way out: measured 2026-08-05 on a soft red dab, the
 * rim read `[250,0,0,101] → [167,0,0,67] → [77,0,0,33]`. Red at the centre, muddy
 * dark red at the edge — a black halo on every soft paint stroke. Fading to the
 * colour's OWN zero-alpha form holds the hue flat and moves only alpha.
 *
 * The colour is normalised by round-tripping it through `ctx.fillStyle`, which is
 * what already knows every CSS form the callers use (`#e0446b` from the picker,
 * `rgba(255, 255, 255, 1)` from the mask).
 */
function fadeOut(ctx, color) {
    ctx.fillStyle = color;
    const norm = ctx.fillStyle;                     // '#rrggbb', or 'rgba(r, g, b, a)'
    if (typeof norm === 'string') {
        if (/^#[0-9a-f]{6}$/i.test(norm)) {
            const n = parseInt(norm.slice(1), 16);
            return `rgba(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}, 0)`;
        }
        const m = norm.match(/^rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)/);
        if (m) return `rgba(${m[1]}, ${m[2]}, ${m[3]}, 0)`;
    }
    return 'transparent';
}

/**
 * The fill for one sub-dab: a flat colour when hard, a radial falloff when soft.
 *
 * `destination-out` ignores colour and reads only alpha, so it erases through an
 * opaque-to-transparent ramp — which is what makes a soft ERASER soft.
 *
 * Built in the dab's LOCAL space (centred on 0,0) so the caller's rotate/scale
 * squashes the falloff along with the ellipse; a gradient built in canvas space
 * would stay circular and fight the aspect it is supposed to follow.
 */
function dabFill(ctx, r, op, fillStyle, hardness) {
    const base = op === 'destination-out'
        ? 'rgba(0, 0, 0, 1)'
        : (fillStyle || 'rgba(255, 255, 255, 1)');
    if (hardness >= 1) return base;
    const g = ctx.createRadialGradient(0, 0, r * hardness, 0, 0, r);
    g.addColorStop(0, base);
    g.addColorStop(1, fadeOut(ctx, base));
    return g;
}

/**
 * Stamp one dab. Save/restore so a composite op, alpha or fill never leaks back to
 * the caller's context state — these contexts are long-lived layer buffers, and a
 * leaked `destination-out` erases the next thing drawn on them.
 *
 * @param {CanvasRenderingContext2D} ctx
 * @param {number} x - destination-canvas px
 * @param {number} y - destination-canvas px
 * @param {number} r - radius in destination-canvas px
 * @param {GlobalCompositeOperation} op - 'source-over' to lay down, 'destination-out' to erase
 * @param {string} [fillStyle] - read for colour only; 'destination-out' needs coverage alone
 * @param {string} [preset] - a `BRUSH_PRESETS` id; absent means the hard round (MPI-435)
 */
export function stampDab(ctx, x, y, r, op, fillStyle, preset) {
    const p = getPreset(preset);
    // Floor at 0.5px: the sub-dabs of a dense preset on a small brush would otherwise
    // round away to nothing and the stroke would silently stop painting.
    const sub = Math.max(0.5, p.density > 1 ? r / Math.sqrt(p.density) : r);

    ctx.save();
    ctx.globalCompositeOperation = op;
    if (p.flow < 1) ctx.globalAlpha = p.flow;

    for (let i = 0; i < p.density; i++) {
        let cx = x;
        let cy = y;
        if (p.scatter > 0) {
            // sqrt on the radius, or the samples pile into the middle — a disc's area
            // grows with r², so a uniform radius is not a uniform spread.
            const a = rand01(x, y, i * 2) * TAU;
            const d = Math.sqrt(rand01(x, y, i * 2 + 1)) * r * p.scatter;
            cx += Math.cos(a) * d;
            cy += Math.sin(a) * d;
        }
        const rot = p.angle + (p.angleJitter
            ? (rand01(cx, cy, i + 91) - 0.5) * p.angleJitter
            : 0);

        ctx.save();
        // A CIRCLE in a squashed frame, not an ellipse in a square one: it is the only
        // way the radial falloff follows the aspect (see dabFill).
        ctx.translate(cx, cy);
        if (rot) ctx.rotate(rot);
        if (p.aspect !== 1) ctx.scale(1, p.aspect);
        ctx.fillStyle = dabFill(ctx, sub, op, fillStyle, p.hardness);
        ctx.beginPath();
        ctx.arc(0, 0, sub, 0, TAU);
        ctx.fill();
        ctx.restore();
    }

    ctx.restore();
}

/**
 * Walk the dabs from the previous sample to this one and hand each to `stamp`.
 *
 * `from` is null at the start of a stroke — a mousedown is a single dab, with no
 * previous point to interpolate from. The endpoint is ALWAYS stamped last so the
 * stroke ends exactly under the cursor rather than at the last whole step before
 * it; without that, a slow drag would trail the pointer by up to one spacing.
 *
 * The caller stamps, so it can hit several layers per dab (the mask brush writes
 * both `manual` and `subtract`) and grow its own dirty box as it goes — which is
 * what keeps undo's rect honest for an interpolated stroke.
 *
 * @param {{x:number,y:number}|null} from - previous sample, destination-canvas px
 * @param {{x:number,y:number}} to - current sample, destination-canvas px
 * @param {number} r - radius in destination-canvas px
 * @param {(x: number, y: number) => void} stamp
 * @param {string} [preset] - a `BRUSH_PRESETS` id; the preset owns the spacing (MPI-435)
 */
export function strokeDabs(from, to, r, stamp, preset) {
    if (from) {
        const dx = to.x - from.x;
        const dy = to.y - from.y;
        const dist = Math.hypot(dx, dy);
        // Floor at 0.5px: a zero or negative step would not terminate, and a
        // sub-pixel brush cannot leave a visible gap anyway.
        const step = Math.max(0.5, r * getPreset(preset).spacing);
        const n = Math.floor(dist / step);
        for (let i = 1; i < n; i++) {
            const t = (i * step) / dist;
            stamp(from.x + dx * t, from.y + dy * t);
        }
    }
    stamp(to.x, to.y);
}

/* ── The brush cursor ─────────────────────────────────────────────────────────
 *
 * The ring drawn UNDER the pointer, which is the only thing telling the user how
 * big the brush is and which tool is armed. It lives here for the same reason the
 * dab does: it is one indicator with two destinations (the History canvas and a
 * flow's `paint` step), and the header's rule above applies to it verbatim — if a
 * change finds itself editing two ring implementations, the extraction has
 * regressed.
 *
 * That is not hypothetical. `MpiStepPaint` shipped its own version — a solid 1px
 * white circle, identical for brush and eraser, with no centre dot — and Fabio
 * found it by eye: "the brush and the eraser have the same cursor display, which
 * is just a white circle" (MPI-567, 2026-08-23). The step had quietly reinvented a
 * worse copy of a ring that had already been debugged.
 */

/** `--accent-heat`. The paint ring, and the mask-point fill. */
export const BRUSH_CURSOR = 'oklch(0.76 0.17 355)';
/** `--surface-canvas` at 90%. The DARK half of every two-tone ring here. */
export const BRUSH_CURSOR_OUTLINE = 'oklch(0.16 0.02 350 / 0.9)';
/** `--accent-frost`. The erase ring — a tool change the user must see instantly. */
export const BRUSH_ERASER = 'oklch(0.78 0.14 220)';

/** Dash period. Equal halves, so an offset of one half tiles the ring completely. */
const RING_DASH = 4;

/**
 * Draw the brush cursor at a point, in the DESTINATION canvas' own pixels.
 *
 * Two passes, one accent and one dark, offset half a dash period so they
 * interleave. A single colour is invisible against a background of its own hue —
 * which is exactly how the eraser, drawn in `--surface-canvas`, vanished on black.
 * Equal halves plus a half-period offset is what makes the two passes tile; change
 * one and the other must follow or bare arcs open up.
 *
 * The centre dot is accent fill inside a dark ring, the same construction
 * `_drawMaskPoints` uses, so it survives a light background too.
 *
 * @param {CanvasRenderingContext2D} ctx
 * @param {number} x                       centre, canvas px
 * @param {number} y                       centre, canvas px
 * @param {number} r                       RADIUS, canvas px — callers scale, as with the dab
 * @param {{eraser?: boolean}} [opts]
 */
export function drawBrushRing(ctx, x, y, r, opts = {}) {
    const accent = opts.eraser ? BRUSH_ERASER : BRUSH_CURSOR;
    ctx.save();

    ctx.beginPath();
    ctx.arc(x, y, Math.max(1, r), 0, TAU);
    ctx.lineWidth = 1.5;
    ctx.setLineDash([RING_DASH, RING_DASH]);
    ctx.strokeStyle = accent;
    ctx.stroke();
    ctx.lineDashOffset = RING_DASH;
    ctx.strokeStyle = BRUSH_CURSOR_OUTLINE;
    ctx.stroke();

    // Both dash settings must reset before the dot, or it strokes dashed too.
    ctx.setLineDash([]);
    ctx.lineDashOffset = 0;
    ctx.beginPath();
    ctx.arc(x, y, 2, 0, TAU);
    ctx.fillStyle = accent;
    ctx.fill();
    ctx.lineWidth = 1;
    ctx.strokeStyle = BRUSH_CURSOR_OUTLINE;
    ctx.stroke();

    ctx.restore();
}
