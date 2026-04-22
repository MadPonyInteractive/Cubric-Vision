'use strict';

/**
 * progressAggregator.js — Aggregates ComfyUI workflow progress across all nodes.
 *
 * Pre-execution: build a weight map from workflow JSON once, before the prompt is sent.
 * Runtime: consume progress_state (preferred) or progress+executing (legacy fallback).
 * Output: monotonically-increasing 0–1 percent value.
 *
 * @module progressAggregator
 */

// ── Weight constants ──────────────────────────────────────────────────────────

const SAMPLER_REGEX = /sampler$/i;
const UPSCALE_WITH_MODEL_WEIGHT = 10;
const VHS_NODE_WEIGHT = 5;
const DEFAULT_SAMPLER_STEPS = 20;
const DEFAULT_NODE_WEIGHT = 0;

// UltimateSDUpscale dual-stream phase split (load/pre-pass vs upscale)
const ULTIMATE_PRE_PASS_FRACTION = 0.20;
const ULTIMATE_UPSCALE_FRACTION  = 0.80;

// Fallback detection: if no progress_state received within this many ms, use legacy path
const LEGACY_FALLBACK_MS = 2000;

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
            const steps  = parseInt(inputs.steps, 10) || DEFAULT_SAMPLER_STEPS;
            // Tile estimate: use dims if known, else fixed *4
            let tiles = 4;
            if (inputs.upscale_by && inputs.tile_width && inputs.tile_height) {
                // dims not reliably known pre-run; keep fixed fallback
            }
            weight = steps * tiles;
            kind   = 'ultimateSDUpscale';

        } else if (classType === 'ImageUpscaleWithModel') {
            weight = UPSCALE_WITH_MODEL_WEIGHT;
            kind   = 'imageUpscale';

        } else if (
            classType === 'VHS_LoadVideoPath' ||
            classType === 'VHS_VideoCombine'
        ) {
            weight = VHS_NODE_WEIGHT;
            kind   = 'vhs';

        } else if (
            classType === 'KSampler' ||
            classType === 'KSamplerAdvanced' ||
            classType === 'ClownsharKSampler' ||
            SAMPLER_REGEX.test(classType)
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

    // Per-node runtime state
    // fraction: 0.0 – 1.0 contribution within the node's own weight
    const nodeState = {};
    for (const id of Object.keys(nodes)) {
        nodeState[id] = { fraction: 0, finished: false };
    }

    let _percent     = 0;          // last emitted value (monotonic floor)
    let _useModern   = null;       // null = undecided; true = progress_state; false = legacy
    let _legacyTimer = null;
    let _legacyActiveNode = null;  // nodeId currently executing (legacy path)
    let _ultimateSawMaxChange = false; // dual-stream detection for UltimateSDUpscale

    // Compute raw aggregated fraction from nodeState
    function _compute() {
        let sum = 0;
        for (const [id, ns] of Object.entries(nodeState)) {
            const w = nodes[id]?.weight ?? DEFAULT_NODE_WEIGHT;
            sum += (ns.finished ? 1.0 : ns.fraction) * w;
        }
        return sum / totalWeight;
    }

    // Update _percent monotonically, clamp to [0,1]
    function _advance(raw) {
        const clamped = Math.min(1, Math.max(0, raw));
        if (clamped > _percent) _percent = clamped;
        return _percent;
    }

    // ── Modern path (progress_state) ─────────────────────────────────────────

    function onProgressState(msg) {
        if (_useModern === false) return; // locked to legacy
        _useModern = true;

        if (_legacyTimer) {
            clearTimeout(_legacyTimer);
            _legacyTimer = null;
        }

        // msg.data.nodes: { [nodeId]: { state: 'pending'|'running'|'finished', value, max } }
        const nodeData = msg?.data?.nodes;
        if (!nodeData) return;

        for (const [id, info] of Object.entries(nodeData)) {
            if (!nodeState[id]) continue; // unknown node
            if (info.state === 'finished') {
                nodeState[id].finished = true;
                nodeState[id].fraction = 1.0;
            } else if (info.state === 'running' && info.max > 0) {
                let frac = info.value / info.max;
                // UltimateSDUpscale reports per-tile progress that hits 1.0 mid-run.
                // Cap at 0.95 until node reports 'finished' to avoid premature 100%.
                const kind = nodes[id]?.kind;
                if (kind === 'ultimateSDUpscale') frac = Math.min(frac, 0.95);
                nodeState[id].fraction = frac;
            }
        }

        // Nodes absent from this message that were active (started or zero-progress single-pass)
        // are finished if any other node is now running. ComfyUI drops finished nodes.
        const anyRunning = Object.values(nodeData).some(i => i.state === 'running');
        if (anyRunning) {
            const runningIds = new Set(Object.keys(nodeData).filter(id => nodeData[id].state === 'running'));
            for (const [id, ns] of Object.entries(nodeState)) {
                if (!ns.finished && !runningIds.has(id)) {
                    // Mark finished only if this node has non-trivial weight (i.e. it matters)
                    // and either had progress or is a single-pass node (imageUpscale, vhs)
                    const kind = nodes[id]?.kind;
                    if (kind === 'imageUpscale' || kind === 'vhs' || ns.fraction > 0) {
                        ns.finished = true;
                        ns.fraction = 1.0;
                    }
                }
            }
        }

        _advance(_compute());
    }

    // ── Legacy path (executing + progress) ───────────────────────────────────

    function _startLegacyTimer() {
        if (_useModern !== null) return;
        _legacyTimer = setTimeout(() => {
            if (_useModern === null) _useModern = false;
        }, LEGACY_FALLBACK_MS);
    }

    function onProgress(msg) {
        if (_useModern === true) return; // locked to modern

        // Start the fallback timer on first progress event if undecided
        if (_useModern === null) {
            _useModern = false;
            if (_legacyTimer) { clearTimeout(_legacyTimer); _legacyTimer = null; }
        }

        const { value, max } = msg?.data || {};
        if (!max || max <= 0) return;

        const fraction = value / max;

        if (_legacyActiveNode && nodeState[_legacyActiveNode]) {
            const ns   = nodeState[_legacyActiveNode];
            const kind = nodes[_legacyActiveNode]?.kind;

            if (kind === 'ultimateSDUpscale') {
                // Dual-stream detection: if max changes mid-node, first stream done
                if (!ns._lastMax) {
                    ns._lastMax = max;
                } else if (max !== ns._lastMax && !_ultimateSawMaxChange) {
                    _ultimateSawMaxChange = true;
                    // First stream complete (pre-pass = 20%)
                    ns.fraction = ULTIMATE_PRE_PASS_FRACTION;
                }

                if (_ultimateSawMaxChange) {
                    // Second stream: map fraction into [0.20, 1.0]
                    ns.fraction = ULTIMATE_PRE_PASS_FRACTION + fraction * ULTIMATE_UPSCALE_FRACTION;
                } else {
                    // First stream: map into [0, 0.20]
                    ns.fraction = fraction * ULTIMATE_PRE_PASS_FRACTION;
                }
            } else {
                ns.fraction = fraction;
            }
        }

        _advance(_compute());
    }

    function onExecuting(msg) {
        if (_useModern === true) return;

        _startLegacyTimer();

        const nodeId = msg?.data?.node;

        if (nodeId === null) {
            // Execution complete signal — finish any still-active node
            if (_legacyActiveNode && nodeState[_legacyActiveNode]) {
                nodeState[_legacyActiveNode].finished  = true;
                nodeState[_legacyActiveNode].fraction  = 1.0;
            }
            _legacyActiveNode = null;
            return;
        }

        // Mark previously active node as finished
        if (_legacyActiveNode && _legacyActiveNode !== nodeId && nodeState[_legacyActiveNode]) {
            nodeState[_legacyActiveNode].finished = true;
            nodeState[_legacyActiveNode].fraction = 1.0;
            _ultimateSawMaxChange = false; // reset for next UltimateSDUpscale node
        }

        _legacyActiveNode = nodeId;
        _advance(_compute());
    }

    // ── Completion ────────────────────────────────────────────────────────────

    function onExecutionSuccess() {
        // Force all nodes to finished
        for (const ns of Object.values(nodeState)) {
            ns.finished = true;
            ns.fraction = 1.0;
        }
        _advance(1.0);
    }

    // ── Public API ────────────────────────────────────────────────────────────

    return {
        onProgressState,
        onProgress,
        onExecuting,
        onExecutionSuccess,
        percent() { return _percent; },
    };
}
