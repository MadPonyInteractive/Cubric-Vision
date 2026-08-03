/**
 * brushDab.js — the shared brush primitive (MPI-375).
 *
 * ONE dab, and the spacing that turns a pair of mouse samples into a continuous
 * stroke. This is the whole of "one brush engine, two destinations": `MaskManager`
 * stamps into its two binary alpha layers, `PaintManager` stamps into one RGBA
 * layer, and neither owns the geometry. A full BrushEngine class was rejected
 * (MPI-375 planning) — it would have rewritten a working shared primitive and
 * every call site in InputController, MpiCanvas and the undo wiring to deliver
 * exactly what these two functions deliver.
 *
 * MPI-435 (the alpha brush pack) parameterises `stampDab` and nothing else. If a
 * later change finds itself editing two dab implementations, the extraction has
 * regressed — repair it here rather than forking.
 *
 * Coordinates and radii are in the DESTINATION canvas' own pixels. Callers scale
 * first: mask layers live at the downscaled `MASK_MAX_EDGE` working size, the
 * paint layer at image-native size, and neither scale belongs in here.
 */

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
 * hundreds a per-pixel walk would.
 */
const DAB_SPACING = 0.25;

/**
 * Stamp one dab. Save/restore so a composite op or fill never leaks back to the
 * caller's context state — these contexts are long-lived layer buffers, and a
 * leaked `destination-out` erases the next thing drawn on them.
 *
 * @param {CanvasRenderingContext2D} ctx
 * @param {number} x - destination-canvas px
 * @param {number} y - destination-canvas px
 * @param {number} r - radius in destination-canvas px
 * @param {GlobalCompositeOperation} op - 'source-over' to lay down, 'destination-out' to erase
 * @param {string} [fillStyle] - ignored by 'destination-out', which only needs coverage
 */
export function stampDab(ctx, x, y, r, op, fillStyle) {
    ctx.save();
    ctx.globalCompositeOperation = op;
    if (fillStyle) ctx.fillStyle = fillStyle;
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fill();
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
 */
export function strokeDabs(from, to, r, stamp) {
    if (from) {
        const dx = to.x - from.x;
        const dy = to.y - from.y;
        const dist = Math.hypot(dx, dy);
        // Floor at 0.5px: a zero or negative step would not terminate, and a
        // sub-pixel brush cannot leave a visible gap anyway.
        const step = Math.max(0.5, r * DAB_SPACING);
        const n = Math.floor(dist / step);
        for (let i = 1; i < n; i++) {
            const t = (i * step) / dist;
            stamp(from.x + dx * t, from.y + dy * t);
        }
    }
    stamp(to.x, to.y);
}
