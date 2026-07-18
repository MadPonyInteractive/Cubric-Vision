import { ComponentFactory } from '../../factory.js';
import { MpiRadioGroup } from '../../Primitives/MpiRadioGroup/MpiRadioGroup.js';
import { qs } from '../../../utils/dom.js';

/**
 * MpiAppHeadSwap — controls for the Head Swap app (MPI-306 Phase 2).
 *
 * CONTROLS ONLY (composition): MpiBaseApp owns the frame, the two media slots,
 * both box steps, Run, and the result pane. This component renders the ONE knob
 * this app has — the speed/quality tier — and owns the translation from the
 * frame's role-keyed step values into this graph's injection params.
 *
 * ── Why the box translation lives HERE ───────────────────────────────────────
 * The frame collects `{ [role]: { box } }` and knows nothing about what a gizmo
 * means; the injector wants `box1`/`box2`. Which ROLE feeds which NODE is app
 * knowledge — image1's box masks the head that gets replaced (Input_Box →
 * Mpi Box Mask), image2's box crops the head to take (Input_Box_2 → Mpi Box
 * Crop). Teaching the frame that mapping would make every future app's roles a
 * frame concern, so `getInputs({ stepValues })` hands them over and this
 * component does the naming.
 *
 * COORDS PASS THROUGH UNCONVERTED. MpiStepBox already reports absolute TOP-LEFT
 * SOURCE PIXELS clamped to the image, which is exactly what `Mpi Box` consumes
 * (box-gizmo.md § Coord contract). The only change made below is the key rename
 * w/h → width/height, which is what headSwapInjector's widget names are. Adding
 * any arithmetic here would be the centre-anchor bug the mpi_box system exists
 * to avoid.
 *
 * NO PROMPT (both baked in the graph) and NO SEED UI, ever — see
 * docs/playbooks/add-app/existing-apps/head-swap.md.
 */

/** Input_Tier is 1-indexed; matches the graph's MpiAnySwitch + the Qwen radio. */
const TIERS = Object.freeze({ QUALITY: 1, TURBO: 2, HYPER: 3 });

/**
 * Tier options. Cost is a RELATIVE percentage, NEVER absolute seconds — a baked
 * ETA is a lie on every GPU but the one it was measured on, while the ratio is a
 * property of the pipeline. Measured 2026-07-18 (386 s / 100 s / 51 s); note the
 * ratio is NOT derivable from step count, because Quality runs without the speed
 * LoRA (carousel-frame.md § Tier cost is RELATIVE).
 *
 * The label must say TIME — "13%" alone reads as 13% quality.
 */
const TIER_OPTIONS = [
    { label: 'Quality', value: String(TIERS.QUALITY), info: 'Baseline time. Full sampling — best edge blending and skin match.' },
    { label: 'Turbo',   value: String(TIERS.TURBO),   info: '~25% of the time. Half the steps; softer detail in hair.' },
    { label: 'Hyper',   value: String(TIERS.HYPER),   info: '~13% of the time. Fewest steps — for checking framing, not final work.' },
];

/** Cost labels shown under the radio, index-aligned with TIER_OPTIONS. */
const TIER_COST = Object.freeze({
    [TIERS.QUALITY]: 'baseline',
    [TIERS.TURBO]: '~25% of time',
    [TIERS.HYPER]: '~13% of time',
});

/**
 * One step value → the injector's box param. Renames w/h to the MpiBox widget
 * names and carries the source dimensions so the injector can re-clamp.
 * @param {{box?:{x:number,y:number,w:number,h:number}}|null} stepValue
 * @returns {{x:number,y:number,width:number,height:number}|null}
 */
function _toBoxParam(stepValue) {
    const box = stepValue?.box;
    if (!box) return null;
    return { x: box.x, y: box.y, width: box.w, height: box.h };
}

export const MpiAppHeadSwap = ComponentFactory.create({
    name: 'MpiAppHeadSwap',
    css: ['js/components/Organisms/MpiAppHeadSwap/MpiAppHeadSwap.css'],

    template: () => `
        <div class="mpi-app-head-swap">
            <span class="mpi-app-head-swap__label">Speed</span>
            <div id="head-swap-tier"></div>
            <span class="mpi-app-head-swap__cost" id="head-swap-cost"></span>
        </div>`,

    setup: (el, props) => {
        const seeded = Number(props.initialInputs?.injectionParams?.Input_Tier);
        const allowed = Object.values(TIERS);
        let _tier = allowed.includes(seeded) ? seeded : TIERS.QUALITY;

        const costEl = qs('#head-swap-cost', el);
        const _paintCost = () => { costEl.textContent = TIER_COST[_tier] || ''; };
        _paintCost();

        const radio = MpiRadioGroup.mount(qs('#head-swap-tier', el), {
            options: TIER_OPTIONS,
            value: String(_tier),
            name: 'headSwapTier',
            size: 'sm',
            columns: 3,
        });
        radio.on('select', ({ value }) => {
            const v = Number(value);
            if (!allowed.includes(v)) return;
            _tier = v;
            _paintCost();
        });

        /**
         * @param {{stepValues?: Object}} [ctx] - Collected by the frame, keyed by
         *   media role. Absent when nothing was collected.
         * @returns {Object} inputs merged into the Run config by MpiBaseApp.
         */
        el.getInputs = (ctx = {}) => {
            const steps = ctx.stepValues || {};
            const box1 = _toBoxParam(steps.image1);
            const box2 = _toBoxParam(steps.image2);
            return {
                injectionParams: {
                    Input_Tier: _tier,
                    // A box is OPTIONAL per image: omitted → the injector skips it
                    // and the node keeps its baked default (box-gizmo.md).
                    ...(box1 ? { box1 } : {}),
                    ...(box2 ? { box2 } : {}),
                },
            };
        };

        el.destroy = () => { radio?.el?.destroy?.(); };
    },
});
