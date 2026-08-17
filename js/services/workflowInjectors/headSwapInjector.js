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
 * docs/playbooks/add-flow/ui/box-gizmo.md):
 *   - x/y are TOP-LEFT, in absolute SOURCE pixels of the image that slot loaded.
 *     They MAY BE NEGATIVE (MPI-325): a step declaring `overflow: 'allow'` lets the
 *     box hang off an edge so a square can sit tight on an edge-adjacent head.
 *   - Out-of-bounds still CLAMPS to the intersection in `clamp_box`. Whether that
 *     costs anything is the CONSUMER's business, and it is now declared in the graph
 *     rather than guessed here: a mask wants the clip, and `Mpi Box Crop`'s `pad`
 *     input puts back what the intersection dropped.
 *
 * This injector therefore does NOT clamp. It used to, mirroring a gizmo constraint
 * that no longer exists — and a mirror of a deleted constraint is worse than none,
 * because it silently rewrites a legal negative origin to 0 and moves the box.
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
 * Round a box to integer widget values. The origin passes through with its SIGN
 * intact — see the header for why nothing is clamped here. Only the size is
 * guarded, because a zero or negative extent is not a region under any reading.
 */
function _intBox(box) {
    return {
        x: _int(box.x) ?? 0,
        y: _int(box.y) ?? 0,
        width: Math.max(1, _int(box.width) ?? 1),
        height: Math.max(1, _int(box.height) ?? 1),
    };
}

/**
 * Mutates (and returns) the workflow with each supplied box written to its node.
 *
 * @param {Record<string, any>} workflow
 * @param {Object} params
 * @param {{x:number,y:number,width:number,height:number}} [params.box1]
 * @param {{x:number,y:number,width:number,height:number}} [params.box2]
 * @returns {Record<string, any>}
 */
export function injectHeadSwap(workflow, params = {}) {
    for (const [key, title] of Object.entries(BOX_TITLES)) {
        const box = params[key];
        // A box is optional per image: no box → leave the node's baked default.
        if (!box || typeof box !== 'object') continue;
        const values = _intBox(box);
        // Absent node is NOT an error (a single-image run has no Input_Box_2 to fill,
        // and the suffix convention allows a graph to carry fewer boxes than slots).
        for (const node of _nodesByTitle(workflow, title)) {
            Object.assign(node.inputs, values);
        }
    }
    return workflow;
}
