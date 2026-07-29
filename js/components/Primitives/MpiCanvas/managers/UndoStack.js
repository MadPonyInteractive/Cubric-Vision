/**
 * UndoStack.js — bounded, layer-agnostic undo for canvas layers (MPI-376).
 *
 * WHY IT IS SHAPED THIS WAY
 *
 * A mask is two persistent bitmaps (manualCanvas + subtractCanvas); everything
 * else MaskManager holds is DERIVED by _recomposite(). So undo only ever has to
 * restore those two, and the MPI-371 layer-ORDER rule (auto picks union LAST)
 * cannot be broken by an undo: order lives in the compositor, not in what we
 * store. Restore the inputs, re-derive, done.
 *
 * Nothing here knows what a mask is. An entry is a list of rectangular pixel
 * patches over arbitrary 2D contexts, so MPI-375's RGBA paint layer plugs into
 * the same stack instead of growing a second one.
 *
 * SWAP, NOT BEFORE+AFTER. An entry stores ONE snapshot per layer — the pixels as
 * they were BEFORE the edit. Applying it writes that snapshot back and keeps what
 * it displaced as the new snapshot, so the same entry drives undo and redo and
 * costs half the memory of a before/after pair.
 *
 * MEMORY IS THE CONSTRAINT. A full 1536² layer is ~9.4MB, so a naive full-layer
 * snapshot per stroke would blow past 100MB in a dozen strokes. Strokes therefore
 * store only their DIRTY RECT: begin() parks a full copy in a reused scratch
 * buffer, commit(rect) keeps just the box the stroke touched. Layer-wide ops
 * (Clear, a bake, a grow) use record() and pay the full rect — they are rare.
 * A byte budget evicts the oldest entries, so depth is bounded by MEMORY rather
 * than by an arbitrary count: cheap strokes go deep, expensive bakes do not.
 */

/** ~96MB of retained pixels ≈ 10 full-layer 1536² ops, or hundreds of strokes. */
const DEFAULT_MAX_BYTES = 96 * 1024 * 1024;

/** @typedef {{ canvas: HTMLCanvasElement, ctx: CanvasRenderingContext2D }} UndoLayer */

/** Copy a rect out of a context into a detached canvas. */
function _copyRect(ctx, x, y, w, h) {
    const out = document.createElement('canvas');
    out.width = w;
    out.height = h;
    out.getContext('2d').drawImage(ctx.canvas, x, y, w, h, 0, 0, w, h);
    return out;
}

export class UndoStack {
    /** @param {number} [maxBytes] retained-pixel budget before the oldest entry is dropped */
    constructor(maxBytes = DEFAULT_MAX_BYTES) {
        this.maxBytes = maxBytes;
        /** @type {Array<{patches: Array<object>, bytes: number}>} */
        this._undo = [];
        /** @type {Array<{patches: Array<object>, bytes: number}>} */
        this._redo = [];
        this._bytes = 0;
        /** Open begin() capture: the layers plus their full-size scratch copies. */
        this._pending = null;
        /** Scratch canvases, reused across strokes so a paint session does not churn ~19MB per dab-run. */
        this._scratch = [];
        /** Byte cost of the most recently pushed entry — the measured number the card asks for. */
        this.lastEntryBytes = 0;
    }

    get depth()     { return this._undo.length; }
    get bytes()     { return this._bytes; }
    canUndo()       { return this._undo.length > 0; }
    canRedo()       { return this._redo.length > 0; }

    /**
     * Open a capture for an edit whose extent is not known yet (a brush stroke).
     * Parks a full copy of each layer in scratch; commit(rect) narrows it down.
     * @param {UndoLayer[]} layers
     */
    begin(layers) {
        this._pending = null;
        if (!layers?.length) return;
        this._pending = { layers, scratch: [] };
        layers.forEach((l, i) => {
            let s = this._scratch[i];
            if (!s) s = this._scratch[i] = document.createElement('canvas');
            if (s.width !== l.canvas.width || s.height !== l.canvas.height) {
                s.width = l.canvas.width;
                s.height = l.canvas.height;
            }
            const sctx = s.getContext('2d');
            sctx.clearRect(0, 0, s.width, s.height);
            sctx.drawImage(l.canvas, 0, 0);
            this._pending.scratch.push(s);
        });
    }

    /**
     * Close an open begin() and keep only `rect`. A null rect means the whole
     * layer. Pass the box the edit actually touched — that is the entire reason
     * a stroke costs kilobytes instead of 19MB.
     * @param {{x:number,y:number,w:number,h:number}|null} rect
     */
    commit(rect) {
        const p = this._pending;
        this._pending = null;
        if (!p) return;
        const patches = [];
        p.layers.forEach((l, i) => {
            const r = this._clamp(rect, l.canvas);
            if (!r) return;
            patches.push({
                ctx: l.ctx,
                x: r.x, y: r.y, w: r.w, h: r.h,
                snap: _copyRect(p.scratch[i].getContext('2d'), r.x, r.y, r.w, r.h),
            });
        });
        this._push(patches);
    }

    /** Drop an open begin() — the gesture produced no edit. */
    abort() { this._pending = null; }

    /**
     * The PRISTINE copy of layer `i` parked by the open begin(). MPI-382's
     * grow/shrink slider needs exactly this: every frame of the drag must derive
     * from the layer as it was at pointerdown, never from the frame before it, or
     * "grow 3" applied thirty times eats the mask. Null when no capture is open.
     * @returns {HTMLCanvasElement|null}
     */
    pendingLayer(i) { return this._pending?.scratch[i] || null; }

    /**
     * One-shot capture of the CURRENT pixels. Call immediately BEFORE a layer-wide
     * mutation (Clear, an Add/Subtract bake, a grow/shrink release).
     * @param {UndoLayer[]} layers
     * @param {{x:number,y:number,w:number,h:number}|null} [rect] null = whole layer
     */
    record(layers, rect = null) {
        if (!layers?.length) return;
        const patches = [];
        for (const l of layers) {
            const r = this._clamp(rect, l.canvas);
            if (!r) continue;
            patches.push({
                ctx: l.ctx,
                x: r.x, y: r.y, w: r.w, h: r.h,
                snap: _copyRect(l.ctx, r.x, r.y, r.w, r.h),
            });
        }
        this._push(patches);
    }

    /** @returns {boolean} true when something was undone */
    undo() {
        const entry = this._undo.pop();
        if (!entry) return false;
        this._apply(entry);
        this._redo.push(entry);
        return true;
    }

    /** @returns {boolean} true when something was redone */
    redo() {
        const entry = this._redo.pop();
        if (!entry) return false;
        this._apply(entry);
        this._undo.push(entry);
        return true;
    }

    /** Drop all history. Called on image load — undo must never cross two entries. */
    clear() {
        this._undo = [];
        this._redo = [];
        this._bytes = 0;
        this._pending = null;
        this.lastEntryBytes = 0;
    }

    /** Release scratch buffers too. Only for teardown. */
    destroy() {
        this.clear();
        for (const s of this._scratch) { s.width = 0; s.height = 0; }
        this._scratch = [];
    }

    // ── internals ────────────────────────────────────────────────────────────

    /**
     * Write each patch's snapshot back and keep what it displaced — that swap is
     * what lets one entry serve both directions.
     *
     * clearRect first is load-bearing: these layers are white-on-TRANSPARENT, and
     * a plain source-over drawImage cannot remove a pixel, so an undo of a stroke
     * would leave the stroke behind.
     */
    _apply(entry) {
        for (const p of entry.patches) {
            if (!p.ctx?.canvas) continue;
            const displaced = _copyRect(p.ctx, p.x, p.y, p.w, p.h);
            p.ctx.clearRect(p.x, p.y, p.w, p.h);
            p.ctx.drawImage(p.snap, p.x, p.y);
            p.snap = displaced;
        }
    }

    _push(patches) {
        if (!patches.length) return;
        const bytes = patches.reduce((n, p) => n + p.w * p.h * 4, 0);
        this._undo.push({ patches, bytes });
        this._bytes += bytes;
        this.lastEntryBytes = bytes;
        // A new edit invalidates the redo branch. Its bytes have to come OFF the
        // total: `_bytes` is the RETAINED set (undo + redo, since an undone entry
        // still holds its pixels), so dropping entries without crediting them
        // makes the budget drift upward and evict real history early.
        for (const e of this._redo) this._bytes -= e.bytes;
        this._redo = [];
        // Keep at least one entry however big it is — a budget that evicts the
        // only entry would mean a single full-layer op is silently un-undoable.
        while (this._bytes > this.maxBytes && this._undo.length > 1) {
            this._bytes -= this._undo.shift().bytes;
        }
    }

    /** Integer-align and clamp a rect to the canvas; null rect = whole canvas. */
    _clamp(rect, canvas) {
        const cw = canvas.width;
        const ch = canvas.height;
        if (!cw || !ch) return null;
        if (!rect) return { x: 0, y: 0, w: cw, h: ch };
        const x = Math.max(0, Math.floor(rect.x));
        const y = Math.max(0, Math.floor(rect.y));
        const w = Math.min(cw - x, Math.ceil(rect.x + rect.w) - x);
        const h = Math.min(ch - y, Math.ceil(rect.y + rect.h) - y);
        if (w <= 0 || h <= 0) return null;
        return { x, y, w, h };
    }
}
