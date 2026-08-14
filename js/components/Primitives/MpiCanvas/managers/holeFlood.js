/**
 * holeFlood — the enclosed-region flood, for BOTH layers (MPI-431 mask, MPI-566 paint).
 *
 * ONE MODULE, TWO DESTINATIONS — the `distanceField.js` arrangement, and for the same
 * reason. This started life inside `MaskManager.fillHoles()`; the moment the paint
 * layer needed a Fill button, a second copy would have been the shared-primitive
 * regression the root-cause rule bans. The flood is pure — typed array in, typed array
 * out, no `document` — which is also what makes the geometry testable in node
 * (`tests/mask-hole-flood.test.cjs`), the way `distanceField.js` is.
 *
 * It returns the REGION, not a finished layer: white where the hole is, transparent
 * everywhere else. Each caller then composites it in its own terms — the mask draws it
 * on as coverage, the paint layer fills it in the current colour and draws the original
 * back on top. That split is the whole difference between the two destinations, exactly
 * as it is for Adjust, where only the FILL differs.
 *
 * Reads ALPHA, binarised at `alphaT` (128 by default) — the same cut the distance field
 * applies, and NOT luminance: a black stroke is painted, not background.
 */

/** Alpha at or above this counts as SHAPE; below it is background the flood may enter. */
export const HOLE_ALPHA_T = 128;

/**
 * Every ENCLOSED region of `rgba`, as a region bitmap plus the box it lives in.
 *
 * The background is flooded INWARD from the border; whatever the flood never reaches is
 * enclosed, and that is the definition of a hole — no contour tracing. Iterative on an
 * explicit typed-array stack, because a 4096² layer would blow recursion many times over.
 *
 * NOT a dilate by r then an erode by r. That morphological close would reuse the
 * distance field for free, but it only shuts holes smaller than r and it rounds the
 * outline; "fill holes" means EVERY enclosed hole, outline untouched.
 *
 * ## Two passes, because the hole has an antialiased rim
 *
 * Punching a hole leaves alpha ramping 255→0 over a pixel or two, and pass 1's threshold
 * classifies the ramp's inner half as shape — so a region covering only the sub-threshold
 * pixels leaves a semi-transparent ring exactly where the hole was, plainly visible at the
 * mask overlay's 70% opacity (reported 2026-08-03). ComfyUI's own mask editor leaves the
 * same seam: it is a property of threshold-then-fill, not of this implementation. Pass 2
 * fixes it at the definition rather than by post-blurring — seed from the hole interiors
 * and expand into any neighbour that is neither `outside` nor **already fully opaque**.
 *
 * The `=== 255` wall must not be relaxed to a threshold: solid shape stops the flood, so
 * it can never escape a hole and reach the shape's OUTER rim, whose antialiasing is left
 * exactly as it was. Fill removes the hole seam and does not harden the outline.
 *
 * ## Bounded to the ink, and PADDED
 *
 * The box is the bounding box of every pixel with ANY alpha, padded by 1 and clamped —
 * and the flood is seeded from THAT border rather than the canvas border. Sound because
 * everything outside the box is transparent and connected to the box's own transparent
 * ring, so the seeds are equivalent; and necessary because the paint layer runs at 4096²,
 * where a full-canvas flood is 16.7M pixels and ~170 MB of transient typed arrays per
 * press (MPI-445 measured a full-canvas pass over this same layer as a freeze). The mask
 * gets the same reduction for free.
 *
 * The pad is load-bearing, not tidiness: an unpadded box whose edge is ink seeds nothing,
 * every interior region reads as enclosed, and Fill floods the entire layer.
 *
 * @param {Uint8ClampedArray|Uint8Array} rgba source pixels, 4 bytes per pixel
 * @param {number} w
 * @param {number} h
 * @param {number} [alphaT] the SHAPE cut
 * @returns {{data: Uint8ClampedArray, box: {x:number,y:number,w:number,h:number}}|null}
 *   null when there is no hole to fill — an empty layer, or a shape with no enclosure
 */
export function holeFlood(rgba, w, h, alphaT = HOLE_ALPHA_T) {
    let x0 = w, y0 = h, x1 = -1, y1 = -1;
    for (let y = 0; y < h; y++) {
        const row = y * w;
        for (let x = 0; x < w; x++) {
            if (!rgba[(row + x) * 4 + 3]) continue;
            if (x < x0) x0 = x;
            if (x > x1) x1 = x;
            if (y < y0) y0 = y;
            y1 = y;
        }
    }
    if (x1 < 0) return null;                       // nothing painted at all

    x0 = Math.max(0, x0 - 1);
    y0 = Math.max(0, y0 - 1);
    x1 = Math.min(w - 1, x1 + 1);
    y1 = Math.min(h - 1, y1 + 1);
    const box = { x: x0, y: y0, w: x1 - x0 + 1, h: y1 - y0 + 1 };

    const bw = box.w;
    const bh = box.h;
    const n = bw * bh;

    // Alpha only, copied once into box coords. Both passes index it O(1); deriving the
    // full-canvas offset per read instead costs a divide inside the two hottest loops,
    // and a whole RGBA copy costs four times the memory for three channels nothing reads.
    const alpha = new Uint8Array(n);
    for (let row = 0; row < bh; row++) {
        let src = ((y0 + row) * w + x0) * 4 + 3;
        let dst = row * bw;
        for (let col = 0; col < bw; col++, src += 4) alpha[dst + col] = rgba[src];
    }

    // ── Pass 1 — the background, flooded in from the box border ─────────────────
    const outside = new Uint8Array(n);
    const stack = new Int32Array(n);
    let sp = 0;
    const push = (i) => {
        if (outside[i] || alpha[i] >= alphaT) return;
        outside[i] = 1;
        stack[sp++] = i;
    };
    for (let x = 0; x < bw; x++) { push(x); push((bh - 1) * bw + x); }
    for (let y = 0; y < bh; y++) { push(y * bw); push(y * bw + bw - 1); }
    while (sp > 0) {
        const i = stack[--sp];
        const x = i % bw;
        if (x > 0)      push(i - 1);
        if (x < bw - 1) push(i + 1);
        if (i >= bw)    push(i - bw);
        if (i < n - bw) push(i + bw);
    }

    // ── Pass 2 — the holes AND their antialiased rims ──────────────────────────
    const fill = new Uint8Array(n);
    sp = 0;
    for (let i = 0; i < n; i++) {
        if (!outside[i] && alpha[i] < alphaT) { fill[i] = 1; stack[sp++] = i; }
    }
    if (!sp) return null;                          // solid shape, no enclosure
    const spread = (i) => {
        if (fill[i] || outside[i] || alpha[i] === 255) return;
        fill[i] = 1;
        stack[sp++] = i;
    };
    while (sp > 0) {
        const i = stack[--sp];
        const x = i % bw;
        if (x > 0)      spread(i - 1);
        if (x < bw - 1) spread(i + 1);
        if (i >= bw)    spread(i - bw);
        if (i < n - bw) spread(i + bw);
    }

    // The region as opaque white. A pixel already at alpha 255 cannot be in `fill`
    // (pass 2 walls on it and pass 1's seeds are sub-threshold), so there is nothing
    // to skip here — the wall is what keeps the write off the outer rim.
    const data = new Uint8ClampedArray(n * 4);
    for (let i = 0; i < n; i++) {
        if (!fill[i]) continue;
        const p = i * 4;
        data[p] = data[p + 1] = data[p + 2] = data[p + 3] = 255;
    }
    return { data, box };
}

/**
 * The region as a box-sized canvas, ready to `drawImage` at `box.x, box.y`.
 *
 * Both callers need this and both need it as a CANVAS rather than raw pixels, because
 * `putImageData` ignores compositing: writing the region straight into the destination
 * would blank every pixel inside the box that is not hole. `drawImage` of an opaque-white
 * region is the composite each caller then builds on.
 *
 * The one impure function here, kept out of `holeFlood()` itself so the flood stays
 * testable in node with no DOM.
 *
 * @param {{data: Uint8ClampedArray, box: {x:number,y:number,w:number,h:number}}} region
 * @returns {HTMLCanvasElement}
 */
export function regionCanvas(region) {
    const c = document.createElement('canvas');
    c.width = region.box.w;
    c.height = region.box.h;
    c.getContext('2d').putImageData(new ImageData(region.data, region.box.w, region.box.h), 0, 0);
    return c;
}
