/**
 * headSwapInjector.js — box injection for the Head Swap app (MPI-299).
 *
 * The generic title injector writes ONE value into the first matching widget name
 * (`value`/`text`/`int`/…, comfyController._inject). An `MpiBox` node carries FOUR
 * (`x`/`y`/`width`/`height`), none of which are in that target list — so a plain
 * `Input_Box` param would match the node and silently write nothing. Hence this
 * injector: it is the only way a box reaches the graph.
 *
 * Box coordinate contract (verified against the authored MpiNodes — full write-up in
 * docs/playbooks/add-app/ui/box-gizmo.md):
 *   - x/y are TOP-LEFT, in absolute SOURCE pixels of the image that slot loaded.
 *   - Out-of-bounds CLAMPS to the intersection; it does NOT pad. A box hanging off
 *     the edge therefore yields a smaller, non-square crop — a distorted reference
 *     head the user reads as a model failure. The gizmo constrains to bounds, and we
 *     clamp again here so a bad param can never reach the graph.
 *
 * Suffix convention: one box per image slot, suffix matching the image
 * (Input_Box ↔ Input_Image, Input_Box_2 ↔ Input_Image_2). Unsuffixed IS slot 1.
 * A box whose node is absent is skipped — the graph keeps its baked default.
 */

'use strict';

const BOX_TITLES = Object.freeze({
    box1: 'input_box',
    box2: 'input_box_2',
});

/**
 * The ONLY params this injector consumes. commandExecutor deletes exactly these
 * from the generic param map after running us — everything else this op sends
 * (Input_Tier) must survive to the generic title injector.
 *
 * MPI-306: this list did not exist and the executor deleted EVERY injectionParams
 * key, so Head Swap's Input_Tier was swallowed and node 95 kept its baked 3
 * (Hyper). Quality and Hyper ran identically because both ran Hyper.
 */
export const HEAD_SWAP_CONSUMES = Object.freeze(Object.keys(BOX_TITLES));

function _nodesByTitle(workflow, title) {
    return Object.values(workflow || {}).filter(node =>
        node?._meta?.title?.toLowerCase() === title
    );
}

function _int(value) {
    const n = Number(value);
    return Number.isFinite(n) ? Math.round(n) : null;
}

/**
 * Clamp a box to the image it belongs to, preserving the top-left anchor.
 * Mirrors the gizmo's own constraint so a stale/hand-built param cannot produce
 * the silent non-square crop described above. Without known image dimensions we
 * only enforce non-negative origin + positive size.
 */
function _clampBox(box) {
    const x = Math.max(0, _int(box.x) ?? 0);
    const y = Math.max(0, _int(box.y) ?? 0);
    let width = Math.max(1, _int(box.width) ?? 1);
    let height = Math.max(1, _int(box.height) ?? 1);
    const imgW = _int(box.imageWidth);
    const imgH = _int(box.imageHeight);
    if (imgW && imgW > 0) width = Math.max(1, Math.min(width, imgW - Math.min(x, imgW - 1)));
    if (imgH && imgH > 0) height = Math.max(1, Math.min(height, imgH - Math.min(y, imgH - 1)));
    return { x, y, width, height };
}

/**
 * Mutates (and returns) the workflow with each supplied box written to its node.
 *
 * @param {Record<string, any>} workflow
 * @param {Object} params
 * @param {{x:number,y:number,width:number,height:number,imageWidth?:number,imageHeight?:number}} [params.box1]
 * @param {{x:number,y:number,width:number,height:number,imageWidth?:number,imageHeight?:number}} [params.box2]
 * @returns {Record<string, any>}
 */
export function injectHeadSwap(workflow, params = {}) {
    for (const [key, title] of Object.entries(BOX_TITLES)) {
        const box = params[key];
        // A box is optional per image: no box → leave the node's baked default.
        if (!box || typeof box !== 'object') continue;
        const values = _clampBox(box);
        // Absent node is NOT an error (a single-image run has no Input_Box_2 to fill,
        // and the suffix convention allows a graph to carry fewer boxes than slots).
        for (const node of _nodesByTitle(workflow, title)) {
            Object.assign(node.inputs, values);
        }
    }
    return workflow;
}
