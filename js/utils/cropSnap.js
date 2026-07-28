/**
 * cropSnap.js — snap crop edges to the source image bounds (MPI-383).
 *
 * The crop rect may leave the image now, which makes it easy to stop 1–2px
 * short of an edge by accident and ship a hairline border. Snapping removes
 * that: an edge within `tol` image-px of an image bound lands exactly on it.
 *
 * Pure maths, no canvas — the caller converts its screen-px tolerance to
 * image px (tol = px / view.scale) and applies the returned rect.
 */

/** Nearest target within `tol`, else `value` unchanged. */
export function snapValue(value, targets, tol) {
    let best = value;
    let bestD = tol;
    for (const t of targets) {
        const d = Math.abs(value - t);
        if (d < bestD) { bestD = d; best = t; }
    }
    return best;
}

/** Which rect edges each handle moves. Absent axis = that axis doesn't move. */
export const HANDLE_EDGES = Object.freeze({
    tl: { x: 'min', y: 'min' },
    tr: { x: 'max', y: 'min' },
    bl: { x: 'min', y: 'max' },
    br: { x: 'max', y: 'max' },
    t:  { y: 'min' },
    b:  { y: 'max' },
    l:  { x: 'min' },
    r:  { x: 'max' },
});

/**
 * FREE mode: snap only the edges the active handle moves, each to the near or
 * far image bound. The opposite edge is an anchor and must not drift.
 *
 * @param {{x:number,y:number,w:number,h:number}} rect
 * @param {string} handle - 'tl'|'tr'|'bl'|'br'|'t'|'b'|'l'|'r'
 * @param {number} imgW
 * @param {number} imgH
 * @param {number} tol - snap radius in image px
 */
export function snapFreeRect(rect, handle, imgW, imgH, tol) {
    const edges = HANDLE_EDGES[handle];
    if (!edges) return rect;

    let { x, y, w, h } = rect;

    if (edges.x === 'min') { const nx = snapValue(x, [0, imgW], tol); w += x - nx; x = nx; }
    if (edges.x === 'max') { w = snapValue(x + w, [0, imgW], tol) - x; }
    if (edges.y === 'min') { const ny = snapValue(y, [0, imgH], tol); h += y - ny; y = ny; }
    if (edges.y === 'max') { h = snapValue(y + h, [0, imgH], tol) - y; }

    return { x, y, w, h };
}

/**
 * Moving the whole box: snap it flush to an image edge, or centred on the
 * image. Size never changes here.
 */
export function snapBodyRect(rect, imgW, imgH, tol) {
    const { w, h } = rect;
    return {
        x: snapValue(rect.x, [0, imgW - w, (imgW - w) / 2], tol),
        y: snapValue(rect.y, [0, imgH - h, (imgH - h) / 2], tol),
        w,
        h,
    };
}

/**
 * Ratio-locked mode: the ratio is the invariant, so snapping adjusts the
 * SCALE instead of an edge. Every moving edge proposes the width that would
 * land it on an image bound; the smallest correction inside `tol` wins.
 *
 * Geometry matches CropManager's anchor/sign model: sign > 0 means the rect
 * grows right/down from the anchor, sign < 0 left/up, sign 0 means it grows
 * both ways from a centred anchor (shift-from-centre and the edge handles).
 *
 * @returns {number} the width to use — unchanged when nothing is in range
 */
export function snapRatioWidth(w, { anchorX, anchorY, signX, signY, ratio, imgW, imgH, tol }) {
    const h = w / ratio;
    let best = w;
    let bestD = Infinity;

    const consider = (candW, distance) => {
        if (!(candW > 0) || distance > tol || distance >= bestD) return;
        bestD = distance;
        best = candW;
    };

    for (const t of [0, imgW]) {
        if (signX > 0)      consider(t - anchorX,        Math.abs((anchorX + w) - t));
        else if (signX < 0) consider(anchorX - t,        Math.abs((anchorX - w) - t));
        else                consider(2 * Math.abs(t - anchorX), Math.abs(Math.abs(t - anchorX) - w / 2));
    }

    for (const t of [0, imgH]) {
        let candH = null;
        let d = Infinity;
        if (signY > 0)      { candH = t - anchorY;        d = Math.abs((anchorY + h) - t); }
        else if (signY < 0) { candH = anchorY - t;        d = Math.abs((anchorY - h) - t); }
        else                { candH = 2 * Math.abs(t - anchorY); d = Math.abs(Math.abs(t - anchorY) - h / 2); }
        if (candH != null) consider(candH * ratio, d);
    }

    return best;
}
