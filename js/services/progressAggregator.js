'use strict';

/**
 * progressAggregator.js — Aggregates ComfyUI workflow progress across all nodes.
 *
 * Model (MPI-147): time-proportional weighted bar.
 *
 *   progress = Σ(nodeFraction × nodeWeight) / Σ(nodeWeight)
 *
 * The weight is what the node COSTS IN TIME, not a flat per-node count. In a real
 * LTX graph (148 nodes) ~140 are instant config/wiring; the time lives in the
 * sampler's denoise steps and a couple of decode/upscale ops. A flat node-count
 * bar makes the 7 sampler steps worth 1/148 ≈ 0.7% — invisible (the "hang at 7%
 * while all 7 steps run"). So samplers carry weight = their step count, real work
 * nodes carry a small fixed weight, and config nodes carry 0.
 *
 * Detection was the old bug: `/sampler$/i` mis-matched LTX helpers
 * (LTXVNormalizingSampler bypass, LTXVLatentUpsampler) and missed the real
 * denoiser (SamplerCustomAdvanced). Fixed below — match the KSampler family +
 * SamplerCustom(Advanced), exclude `*Select` config pickers.
 *
 * @module progressAggregator
 */

// ── Weight constants ──────────────────────────────────────────────────────────

const SAMPLER_REGEX = /KSampler/i;
const SAMPLER_SELECT_REGEX = /Select$/i;   // KSamplerSelect etc. — config, no steps
const UPSCALE_WITH_MODEL_WEIGHT = 8;
const VHS_NODE_WEIGHT = 4;
const DEFAULT_SAMPLER_STEPS = 20;
const DEFAULT_NODE_WEIGHT = 0;

// UltimateSDUpscale: steps × estimated tiles (dims unknown pre-run → fixed 4)
const ULTIMATE_TILE_ESTIMATE = 4;

// ── Weight map builder ────────────────────────────────────────────────────────

/**
 * Walks a workflow JSON and produces a static weight map.
 *
 * @param {Record<string, any>} workflow   ComfyUI workflow JSON (node-id → node def)
 * @returns {{ totalWeight: number, nodes: Record<string, { weight: number, kind: string }> }}
 */
export function buildWeightMap(workflow) {
    const nodes = {};
    let totalWeight = 0;

    for (const [id, node] of Object.entries(workflow)) {
        const classType = node.class_type || '';
        const inputs    = node.inputs    || {};
        let weight = DEFAULT_NODE_WEIGHT;
        let kind   = 'default';

        if (classType === 'UltimateSDUpscale') {
            const steps = parseInt(inputs.steps, 10) || DEFAULT_SAMPLER_STEPS;
            weight = steps * ULTIMATE_TILE_ESTIMATE;
            kind   = 'ultimateSDUpscale';

        } else if (classType === 'ImageUpscaleWithModel') {
            weight = UPSCALE_WITH_MODEL_WEIGHT;
            kind   = 'imageUpscale';

        } else if (classType === 'VHS_LoadVideoPath' || classType === 'VHS_VideoCombine') {
            weight = VHS_NODE_WEIGHT;
            kind   = 'vhs';

        } else if (
            classType === 'MaskDetailerPipe' ||
            classType === 'FaceDetailer' ||
            classType === 'DetailerForEach' ||
            classType === 'DetailerForEachDebug'
        ) {
            // One sampler pass per detected segment (detail area). Step-emitting;
            // the segment count comes at runtime from "# of Detected SEGS: N".
            weight = parseInt(inputs.steps, 10) || DEFAULT_SAMPLER_STEPS;
            kind   = 'detailer';

        } else if (
            !SAMPLER_SELECT_REGEX.test(classType) && (
                classType === 'KSampler' ||
                classType === 'KSamplerAdvanced' ||
                classType === 'SamplerCustom' ||
                classType === 'SamplerCustomAdvanced' ||
                classType === 'ClownsharKSampler' ||
                SAMPLER_REGEX.test(classType)
            )
        ) {
            weight = parseInt(inputs.steps, 10) || DEFAULT_SAMPLER_STEPS;
            kind   = 'sampler';
        }

        nodes[id] = { weight, kind };
        if (weight > 0) totalWeight += weight;
    }

    if (totalWeight === 0) totalWeight = 1; // prevent division by zero

    return { totalWeight, nodes };
}

// ── Aggregator factory ────────────────────────────────────────────────────────

/**
 * Creates a stateful aggregator for one workflow execution.
 *
 * @param {{ totalWeight: number, nodes: Record<string, { weight: number, kind: string }> }} weightMap
 * @returns {{
 *   onProgressState: (msg: object) => void,
 *   onProgress:      (msg: object) => void,
 *   onExecuting:     (msg: object) => void,
 *   onExecutionSuccess: () => void,
 *   percent: () => number
 * }}
 */
export function create(weightMap) {
    const { totalWeight, nodes } = weightMap;

    // Per-node fraction (0..1) within its own weight.
    const nodeState = {};
    for (const id of Object.keys(nodes)) nodeState[id] = { fraction: 0, finished: false };

    let _percent  = 0;   // last emitted value (monotonic floor)
    let _curNode  = null;

    // Only weighted nodes (samplers, upscale, vhs) move the bar — instant config
    // nodes have weight 0, so finishing them contributes nothing. That's the
    // point: the bar tracks time, and time = sampler steps + decode/upscale.
    function _compute() {
        let sum = 0;
        for (const [id, ns] of Object.entries(nodeState)) {
            const w = nodes[id]?.weight ?? DEFAULT_NODE_WEIGHT;
            if (w <= 0) continue;
            sum += (ns.finished ? 1.0 : ns.fraction) * w;
        }
        return sum / totalWeight;
    }

    function _advance() {
        const clamped = Math.min(1, Math.max(0, _compute()));
        if (clamped > _percent) _percent = clamped;  // monotonic
        return _percent;
    }

    function _finishNode(id) {
        if (id == null || !nodeState[id]) return;
        nodeState[id].finished = true;
        nodeState[id].fraction = 1.0;
    }

    function _setRunning(id, value, max) {
        if (id == null) return;
        // New node started → previous one done.
        if (_curNode && _curNode !== id) _finishNode(_curNode);
        _curNode = id;
        if (nodeState[id] && max > 0) {
            let frac = Math.min(1, value / max);
            // UltimateSDUpscale runs multiple tile-passes, each restarting steps
            // 0→max. Pass 1 filling to 1.0 would mark the node "done" and pin the
            // bar at ~100% with 3 passes left to go. Cap running fraction below 1.0
            // so only the engine's explicit `finished`/executing-next completes it.
            if (nodes[id]?.kind === 'ultimateSDUpscale') frac = Math.min(frac, 0.9);
            nodeState[id].fraction = frac;
        }
    }

    // ── Modern path (progress_state) ─────────────────────────────────────────
    // msg.data.nodes: { [id]: { state: 'pending'|'running'|'finished', value, max } }

    function onProgressState(msg) {
        const nodeData = msg?.data?.nodes;
        if (!nodeData) return;
        for (const [id, info] of Object.entries(nodeData)) {
            if (info.state === 'finished') _finishNode(id);
            else if (info.state === 'running') _setRunning(id, Number(info.value) || 0, Number(info.max) || 0);
        }
        _advance();
    }

    // ── Legacy path (executing + progress) ───────────────────────────────────

    function onProgress(msg) {
        const { node, value, max } = msg?.data || {};
        _setRunning(node != null ? node : _curNode, Number(value) || 0, Number(max) || 0);
        _advance();
    }

    function onExecuting(msg) {
        const nodeId = msg?.data?.node;
        if (nodeId == null) { _finishNode(_curNode); _curNode = null; return; }
        if (_curNode && _curNode !== nodeId) _finishNode(_curNode);
        _curNode = nodeId;
        _advance();
    }

    // ── Completion ────────────────────────────────────────────────────────────

    function onExecutionSuccess() {
        for (const ns of Object.values(nodeState)) { ns.finished = true; ns.fraction = 1.0; }
        _percent = 1.0;
    }

    return {
        onProgressState,
        onProgress,
        onExecuting,
        onExecutionSuccess,
        percent() { return _percent; },
    };
}
