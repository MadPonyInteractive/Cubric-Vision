/**
 * distanceField.js
 * The morphology primitive behind Grow / Shrink / Edge (MPI-441), and the one
 * MPI-436 points at the paint layer.
 *
 * REPLACES `MaskManager._morph()`'s blur-and-threshold. That was elegant — one
 * Gaussian serves both directions, because a blurred step edge is the ramp Φ(d/r),
 * so cutting at Φ(-1) lands one sigma out and Φ(+1) one sigma in — and the elegance
 * was the bug. A blur is an AVERAGE; a dilation is a MAXIMUM. Blur a 15px arm at
 * sigma 50 and its peak alpha drops under the cut, so the arm thins away while the
 * torso grows, and mass bleeds across the gap between limb and torso and fills it.
 * One averaging pass cannot be both a max and a min filter, so the design is
 * replaced rather than retuned and both alpha thresholds go with it.
 *
 * What replaces it is a SIGNED SQUARED EUCLIDEAN DISTANCE FIELD, exact at any
 * radius — no chord error (stamping a disc at N offsets), no chamfered corners (a
 * separable max over a square structuring element).
 *
 * The field is radius-INDEPENDENT, which is what makes it cheap: the pristine mask
 * does not change during a slider drag, so it is built ONCE on tool entry and every
 * frame is a range test over it. Moving the slider costs one pass, not one transform.
 *
 * Everything stays in SQUARED integer distances on purpose. `d > r` and
 * `d² >= r² + 1` are the same statement when both are integers, so dilate and erode
 * are both INCLUSIVE range tests and no epsilon is needed to keep erode strict —
 * see `rangeFor()`. Max d² at the 1536 working size is 1536²+1536² ≈ 4.7M, well
 * inside Float32's exact-integer range (16.7M).
 */

/** Stand-in for "no seed found". Finite, not Infinity: `edt1d` subtracts two of
 *  these, and Infinity − Infinity is NaN while 1e20 − 1e20 is 0. */
const NO_SEED = 1e20;

/**
 * Felzenszwalb & Huttenlocher's 1-D squared-distance transform: the lower envelope
 * of the parabolas rooted at each sample. O(n), exact.
 * @param {Float64Array} f input costs, length n
 * @param {Float64Array} d output squared distances, length n
 * @param {Int32Array} v scratch: parabola locations
 * @param {Float64Array} z scratch: envelope boundaries, length n+1
 * @param {number} n
 */
function edt1d(f, d, v, z, n) {
    let k = 0;
    v[0] = 0;
    z[0] = -NO_SEED;
    z[1] = NO_SEED;

    for (let q = 1; q < n; q++) {
        let s = ((f[q] + q * q) - (f[v[k]] + v[k] * v[k])) / (2 * q - 2 * v[k]);
        while (s <= z[k]) {
            k--;
            s = ((f[q] + q * q) - (f[v[k]] + v[k] * v[k])) / (2 * q - 2 * v[k]);
        }
        k++;
        v[k] = q;
        z[k] = s;
        z[k + 1] = NO_SEED;
    }

    k = 0;
    for (let q = 0; q < n; q++) {
        while (z[k + 1] < q) k++;
        const dq = q - v[k];
        d[q] = dq * dq + f[v[k]];
    }
}

/**
 * In-place 2-D transform: `out` arrives holding 0 at every seed and NO_SEED
 * elsewhere, and leaves holding the squared distance to the nearest seed.
 * Separable — columns, then rows.
 */
function edt2d(out, w, h, f, d, v, z) {
    for (let x = 0; x < w; x++) {
        for (let y = 0; y < h; y++) f[y] = out[y * w + x];
        edt1d(f, d, v, z, h);
        for (let y = 0; y < h; y++) out[y * w + x] = d[y];
    }
    for (let y = 0; y < h; y++) {
        const row = y * w;
        for (let x = 0; x < w; x++) f[x] = out[row + x];
        edt1d(f, d, v, z, w);
        for (let x = 0; x < w; x++) out[row + x] = d[x];
    }
}

/**
 * Build the signed squared-distance field of an RGBA layer, read off its ALPHA.
 *
 * Sign convention: OUTSIDE the shape the value is +(distance to the nearest shape
 * pixel)², INSIDE it is −(distance to the nearest background pixel)². So the value
 * increases monotonically outward through the boundary and every morphological
 * operation is a range test on one number.
 *
 * Outside the canvas counts as BACKGROUND, which is what the blur did (it pulled
 * transparency in from beyond the edge), so a mask running off the frame still
 * erodes from that border instead of being treated as infinitely wide.
 *
 * @param {Uint8ClampedArray|Uint8Array} rgba source pixels, 4 bytes per pixel
 * @param {number} w
 * @param {number} h
 * @param {number} [alphaT] alpha at or above this counts as shape. 128 matches
 *   `fillHoles()`: an antialiased rim is a boundary, not solid content.
 * @returns {Float32Array} length w*h
 */
export function signedSquaredDistanceField(rgba, w, h, alphaT = 128) {
    const n = w * h;
    const outside = new Float32Array(n);
    const inside = new Float32Array(n);

    for (let i = 0; i < n; i++) {
        if (rgba[i * 4 + 3] >= alphaT) {
            outside[i] = 0;
            inside[i] = NO_SEED;
        } else {
            outside[i] = NO_SEED;
            inside[i] = 0;
        }
    }

    const m = Math.max(w, h);
    const f = new Float64Array(m);
    const d = new Float64Array(m);
    const v = new Int32Array(m);
    const z = new Float64Array(m + 1);

    edt2d(outside, w, h, f, d, v, z);
    edt2d(inside, w, h, f, d, v, z);

    // Merge into the signed field. The border clamp is the virtual background one
    // cell beyond each edge: a pixel at x is (x+1) from the column at x = -1.
    const field = outside;
    for (let y = 0; y < h; y++) {
        const dTop = (y + 1) * (y + 1);
        const dBot = (h - y) * (h - y);
        for (let x = 0; x < w; x++) {
            const i = y * w + x;
            if (field[i] !== 0) continue; // background pixel: keep +outside distance
            const border = Math.min(dTop, dBot, (x + 1) * (x + 1), (w - x) * (w - x));
            field[i] = -Math.min(inside[i], border);
        }
    }
    return field;
}

/**
 * The inclusive range `[lo, hi]` over the field that expresses one Adjust reading.
 * All three are the SAME test, which is the point — grow, shrink and both halves of
 * an edge band were one call to `_morph()` and are one call to this.
 *
 * - grow r  → everything within r of the shape: `field <= r²`.
 * - shrink e → shape pixels whose nearest background is FARTHER than e. Integers, so
 *   `d > e` is `d² >= e²+1`, hence `field <= −(e²+1)` — inclusive, no epsilon.
 * - edge band → `dilate(outward)` minus `erode(inward)`, and the complement of that
 *   erode is exactly `field >= −inward²`. One range, not two passes with
 *   `destination-out` between them.
 *
 * @param {{grow?:number, outward?:number, inward?:number, edge?:boolean}} opts
 *   radii in layer px, integers
 * @returns {{lo:number, hi:number}|null} null when the request is a no-op
 */
export function rangeFor({ grow = 0, outward = 0, inward = 0, edge = false } = {}) {
    if (edge) {
        const o = Math.round(Math.abs(outward));
        const i = Math.round(Math.abs(inward));
        if (!o && !i) return null;
        return { lo: -(i * i), hi: o * o };
    }
    const r = Math.round(grow);
    if (!r) return null;
    if (r > 0) return { lo: -Infinity, hi: r * r };
    return { lo: -Infinity, hi: -(r * r + 1) };
}

/**
 * Paint the pixels whose field value falls in `[lo, hi]` as opaque white, the rest
 * as transparent. `out32` is a Uint32Array view of an ImageData buffer; 0xFFFFFFFF
 * is white-opaque in either byte order because all four bytes are 255.
 * @param {Float32Array} field
 * @param {Uint32Array} out32
 * @param {number} lo
 * @param {number} hi
 */
export function writeRange(field, out32, lo, hi) {
    for (let i = 0; i < field.length; i++) {
        const d = field[i];
        out32[i] = (d >= lo && d <= hi) ? 0xFFFFFFFF : 0;
    }
}
