/**
 * flowsRegistry.js — Source of truth for Flows (outcome flows, MPI-256).
 *
 * A Flow is an outcome-oriented workflow surfaced behind the dev-gated Flow Library
 * overlay: pick a flow → open its overlay → collect inputs → Run → the job enters
 * the EXISTING generation queue and lands as a normal gallery card.
 *
 * Unlike modelRegistry, this registry is READ-ONLY over install state — flows own no
 * install-sync machinery (no syncModelInstalled, no remoteEngineClient); they READ
 * caches the model sync already populates. Do not cargo-cult the sync side here.
 *
 * Availability has TWO inputs (MPI-304):
 *   - `requiredModels` → `state.s_installedModelIds` (already isModelUsable-filtered, MPI-122)
 *   - `requiredDeps`   → the per-dep status cache, keyed `flow:<id>` (modelRegistry.js)
 * Both gate the SAME badge and the SAME Run guard — a missing dep blocks exactly like a
 * missing model, and surfaces as one extra row in the slide-over's required list.
 *
 * Flow count is tiny (dev-gated until ≥4 flows exist), so the descriptor array lives
 * inline here rather than in a separate flowConstants/ file. Split it out only if the
 * array grows large enough to warrant it.
 *
 * @typedef {Object} FlowDef
 * @property {string}   id             - Unique identifier
 * @property {string}   title          - Display name (card + slide-over)
 * @property {string}   preview        - 4/5 still (webp) under comfy_workflows/display/. Drives the
 *                                       Flow Library tile and the slide-over thumb, and doubles as
 *                                       the hero's poster + fallback. docs/playbooks/add-flow/06.
 * @property {string}   [video]        - WIDE (8:5 or 16:9) autoplaying loop under the same folder —
 *                                       the HERO on the flow's first slide only. Unlike a ModelDef's
 *                                       `video`, this never turns the tile into a video tile: the
 *                                       tile stays the 4/5 still. Omit and the hero shows `preview`.
 * @property {string}   description    - Slide-over copy
 * @property {string[]} requiredModels - MODEL ids (NOT dep ids); drives the availability badge
 * @property {string[]} [requiredDeps] - DEP ids (dependencies.js facade) this flow needs on top
 *                                       of its models — flow-only weights/nodes that no model
 *                                       requires. Filed in the dep file for their KIND, never
 *                                       folded into a model's list (that taxes every user of
 *                                       that model). MPI-304.
 * @property {string[]} [requiredPlugins] - PLUGIN ids (pluginsRegistry.js) this flow needs
 *                                       (MPI-580). Their deps fold into this flow's dep set,
 *                                       so they gate the same badge, the same Run guard and
 *                                       the same install button — a plugin has no install
 *                                       state of its own to check. Declared when a flow
 *                                       ADOPTS a capability that also stands alone, e.g. the
 *                                       Video face detailer adopting the LTX Video upscaler.
 * @property {string}   operation      - Universal-op key (commandRegistry.js)
 * @property {string}   workflow       - ComfyUI workflow filename (universal_workflows.js)
 * @property {FlowStepField[]} [fields] - Run-slide fields, rendered BY THE FRAME. THE SAME `fields`
 *                                       a step declares (MPI-572) — declaring them here places them
 *                                       on the run slide, declaring them on a step places them on
 *                                       that step, and nothing else differs: one vocabulary, one
 *                                       renderer, one payload law. An id reaches the op as a
 *                                       top-level input (`positive`, `negative`), EXCEPT an id
 *                                       prefixed `Input_`, which names a graph node and is routed
 *                                       into `injectionParams` instead. So
 *                                       `{ id: 'positive', type: 'text', rows: 3 }` is the whole of
 *                                       what a prompt-collecting component used to be. A FlowDef is
 *                                       DATA (MPI-572), which is what makes it expressible as a
 *                                       third-party manifest — but declaring a field does NOT mean
 *                                       there is no component. Every declared field MOUNTS AN APP
 *                                       PRIMITIVE (MPI-582); the declaration chooses which one, it
 *                                       does not replace it. See FlowStepField below.
 * @property {Object}   inputSchema    - What the flow collects → injected into the workflow
 * @property {FlowStep[]} [steps]       - Declared MIDDLE steps of the flow's carousel (MPI-306).
 *                                       Step 0 (inputs) and the last step (run) are IMPLICIT —
 *                                       the frame renders them from inputSchema + the flow's
 *                                       fields. Omit or `[]` for a 2-step carousel. A flow writes
 *                                       NO layout code: MpiBaseFlow renders every declared step.
 *
 * @typedef {Object} FlowStep
 * @property {string}  kind    - STEP_KINDS registry key (MpiBaseFlow/stepKinds.js), e.g. 'box'.
 *                               A new gizmo = one component + one registry line. The FRAME-NATIVE
 *                               kinds (FRAME_KINDS, same file) are the exception: `fields` has no
 *                               component, no gizmo and NO `role` — its declared `fields` ARE the
 *                               work, stacked where the canvas would be, and its values live in
 *                               the FLOW-level store so one prompt can be edited on the step and
 *                               on the run slide as a single value (MPI-504). The one-row cap does
 *                               not apply to it: that cap exists because the row is a modifier on
 *                               a canvas, and this step has no canvas.
 * @property {string}  role    - The MEDIA ROLE this step operates on ('image1', 'image2'…) —
 *                               the same vocabulary the op's mediaInputs uses, so a box for
 *                               `image1` reaches `Input_Box` with no new mapping.
 * @property {string}  title   - Shown above the canvas.
 * @property {string}  [hint]  - Guidance shown below the canvas (and below any fields row).
 * @property {string}  [tickerLabel] - Short label for the step ticker; falls back to `title`.
 * @property {string}  [param] - Bind this step's GIZMO value to an injection param (MPI-572).
 *                               The flow says WHICH role feeds WHICH node (that is flow
 *                               knowledge); the KIND supplies the shape the graph wants
 *                               (`stepValueToParam`, stepKinds.js). Omit and the step reports
 *                               into `stepValues` only. A gizmo with nothing to report sends
 *                               nothing, leaving the node on its baked default.
 * @property {number}  [ratio] - Aspect lock for the gizmo (UI-only; the graph's width/height
 *                               are independent). Omit for a free box.
 * @property {FlowStepField[]} [fields] - ONE row of controls between canvas and hint, rendered
 *                               BY THE FRAME so every gizmo's controls match for free. HARD CAP:
 *                               one row, no nesting/panels/accordions — a gizmo wanting more
 *                               means the step should SPLIT.
 *
 * @typedef {Object} FlowStepField
 *
 * EVERY TYPE BELOW MOUNTS AN APP PRIMITIVE (`js/utils/declaredFields.js`, MPI-582).
 * `type` names a component, it does not replace one:
 *   select -> MpiDropdown · radio -> MpiRadioGroup · button -> MpiButton ·
 *   toggle -> MpiCheckbox · number, text -> MpiInput · slider -> MpiProgressBar
 * So a consumer block sizes these into its layout and NEVER restates their fill,
 * border, hover, focus or disabled treatment. A control this vocabulary cannot
 * express is a NEW PRIMITIVE plus a new `type` here — never a bare input, in a Flow
 * or anywhere else. See `.claude/rules/components.md` § Every UI element is a
 * component.
 *
 * @property {string}  id      - Key the value lands under, and it is the SAME key wherever the
 *                               field was declared: `id: 'positive'` reaches the op as `positive`,
 *                               `Input_*` reaches it inside `injectionParams`. A step's fields are
 *                               additionally mirrored under that step's role in `stepValues`,
 *                               which is the shape Reuse restores from.
 * @property {'select'|'radio'|'button'|'toggle'|'number'|'slider'|'text'} type
 * @property {string}  [label]
 * @property {Array<{v:string|number, label:string, info?:string, note?:string}>} [options] -
 *                               For `select` / `radio`. `radio` emits the option's ORIGINAL `v`,
 *                               so a numeric graph param stays a number. `info` is a status-bar
 *                               hover; `note` is the always-visible line under the group — a
 *                               tier's cost has to be legible without hunting for it.
 * @property {number}  [columns] - For `radio`: render as an N-column grid.
 * @property {number}  [min]   - For `number` / `slider`. ENFORCED, not decorative:
 *                               the value is clamped before it reaches the graph.
 * @property {number}  [max]   - For `number` / `slider`.
 * @property {number}  [step]  - For `number` / `slider`.
 * @property {string}  [icon]  - For `button`: an `js/utils/icons.js` key, rendered to the LEFT of
 *                               the label. The button itself is an MpiButton in the app's
 *                               primary variant — never restyle it from a consumer block.
 * @property {number}  [rows]  - For `text`. `> 1` renders a textarea (the prompt case).
 * @property {string}  [placeholder] - For `text`.
 * @property {*}       [default]
 * @property {'enhance'} [action] - Makes a `button` an ACTION rather than a value (MPI-504). It
 *                               runs `op` on the `from` field's text and writes the result into
 *                               the `to` field. ONE declaration carries all three behaviours —
 *                               Enhance fills `to`, editing `from` CLEARS `to`, and the button
 *                               reports which of those is true (heat = not enhanced) — so
 *                               they cannot disagree. Two more consequences fall out of it: an
 *                               empty `to` at Run sends `from` RAW (there is no silent
 *                               enhancement), and the action's own id never reaches the op.
 *                               Declare the pair on BOTH surfaces to get the run slide's
 *                               condensed form; the value is shared either way.
 * @property {string}  [op]    - For `action: 'enhance'`: the universal-op key to run. It must be
 *                               an `outputKind: 'text'` op — it reports through `onText` and
 *                               lands no history item. An unregistered key warns and no-ops.
 * @property {string}  [from]  - For `action: 'enhance'`: id of the field supplying the text.
 * @property {string}  [to]    - For `action: 'enhance'`: id of the field the result is written
 *                               into. Enhance is its ONLY writer besides the user.
 * @property {string}  [model] - For `action: 'enhance'`: optional model id for the run. Omit for
 *                               an op whose weights are a dep rather than a ModelDef.
 */

'use strict';

import { state } from '../state.js';
import { DEPS } from './modelConstants/dependencies.js';
import { getPlugin } from './pluginsRegistry.js';

/**
 * The download-queue / dep-status key for a flow's own deps. Namespaced so it can
 * never collide with a model id, and so every consumer that sees a job id can tell
 * flow-owned deps from model-owned ones. MPI-304.
 * @param {string} flowId
 * @returns {string}
 */
export function flowDepKey(flowId) {
    return `flow:${flowId}`;
}

/** @type {FlowDef[]} */
export const FLOWS = [
    // First flow (MPI-299): 2-image head swap. Takes a TARGET image (body/scene kept)
    // and a SOURCE image (head taken), each with an optional box marking the head
    // region, and swaps one onto the other.
    //
    // First flow to use requiredDeps (MPI-304): it needs qwen-edit's weights PLUS a
    // head-swap LoRA no model requires. That LoRA is declared here, not folded into
    // qwen-edit — folding it would push 1.2GB onto every Qwen user for one flow.
    //
    // `comfyui-inpaint-cropandstitch` is declared here for the same reason: the graph
    // calls InpaintCropImproved -> InpaintStitchImproved, and NOTHING on the qwen-edit
    // path declared the pack. It only ever installed because the Krea2 cards happened
    // to list it, so a qwen-edit-only install would fail ComfyUI class validation at
    // dispatch. Krea2 no longer uses those classes (b3f9a018 dropped its masked-crop
    // path), so that listing was removed and this flow is now the sole declarer.
    //
    // FIXED-PROMPT flow: the graph has NO Input_Positive/Input_Negative (both baked),
    // so inputSchema declares no `positive` and the op sets promptRequired:false.
    // Boxes are injectionParams (box1/box2 → headSwapInjector), NOT media slots.
    {
        id: 'head-swap',
        title: 'Head Swap',
        // Both cut from ONE real run of this flow. The two plates are pixel-identical
        // outside the head, so the hero's wipe holds the whole scene steady and only
        // the head changes; the tile is that same wipe frozen where the seam bisects
        // the face, which is what makes a STILL read as a swap at tile size.
        preview: 'flow-head-swap.webp',
        video: 'flow-head-swap.mp4',
        description: 'Swap a head from one image onto another. Upload the image you want to keep, the image with the head you want, mark each head, and run.',
        requiredModels: ['qwen-edit'],
        requiredDeps: ['qwen-lora-headswap', 'comfyui-inpaint-cropandstitch'],
        operation: 'flowHeadSwap',
        workflow: 'flow_head_swap.json',
        mediaType: 'image',
        inputSchema: {
            media: [
                // `labels` are index-aligned with roles. Slot copy is the APP's to
                // name — without this the frame falls back to "Image 1 / Image 2",
                // which says nothing about which image plays which part.
                {
                    type: 'image', mode: 'upto', max: 2,
                    roles: ['image1', 'image2'],
                    labels: ['Original', 'Face Reference'],
                },
            ],
        },
        // The two boxes look identical but MEAN different things, so their copy
        // carries the whole distinction: step 1 marks WHERE the head goes (mask),
        // step 2 marks WHICH head to take (crop). ratio 1 because the pipeline
        // crops a square — a non-square selection would clip the result.
        steps: [
            {
                // `param` binds this step's box to the graph (MPI-572). WHICH role
                // feeds WHICH node is flow knowledge, so the flow declares it —
                // image1's box masks the head being replaced (→ Input_Box, Mpi Box
                // Mask), image2's crops the head being taken (→ Input_Box_2, Mpi Box
                // Crop). This is what MpiFlowHeadSwap.getInputs() used to do in JS.
                //
                // `overflow: 'allow'` (MPI-325) lets the square leave the frame. A
                // head at the edge otherwise forces the box to GROW until it
                // swallows the neighbour, which is how the MPI-324 validation run
                // swapped the wrong face. Safe on THIS slot with no graph change:
                // Mpi Box Mask is full-frame and clips, and Inpaint Crop re-squares
                // the region itself. Never pad image1 — that would grow the
                // delivered picture.
                kind: 'box', role: 'image1', param: 'box1', ratio: 1, overflow: 'allow',
                tickerLabel: 'Target head',
                title: 'Mark where the new head goes',
                hint: 'Box the head you want replaced. Include the hair and jaw.',
            },
            {
                // Same overflow, but this slot is CROPPED, so the graph has to put
                // the overhang back: node 89 Mpi Box Crop carries `pad: true`. Turn
                // one off and the other is wrong — an unpadded overhang reaches the
                // encoder as a squashed reference head.
                kind: 'box', role: 'image2', param: 'box2', ratio: 1, overflow: 'allow',
                tickerLabel: 'Reference head',
                title: 'Mark which head to take',
                hint: 'Box the head to use. A close-up portrait works best.',
            },
        ],
        // The flow's ONE knob, declared (MPI-572) — this plus the two step `param`
        // bindings above is the whole of what MpiFlowHeadSwap.js used to be, so the
        // component is gone and this descriptor is now data a manifest could carry.
        //
        // Input_Tier is 1-indexed to match the graph's MpiAnySwitch. `note` is the
        // always-visible cost, `info` the hover gloss.
        //
        // Cost is a RELATIVE percentage and NEVER absolute seconds — a baked ETA is
        // a lie on every GPU but the one it was measured on, while the ratio is a
        // property of the pipeline. Measured 2026-07-18 (386 s / 100 s / 51 s); the
        // ratio is NOT derivable from step count, because Quality runs without the
        // speed LoRA. The label must say TIME — "13%" alone reads as 13% quality.
        // NO seed UI, ever (existing-flows/head-swap.md); no prompt, both baked.
        fields: [
            {
                id: 'Input_Tier', type: 'radio', label: 'Speed', columns: 3, default: 1,
                options: [
                    { v: 1, label: 'Quality', note: 'baseline',
                      info: 'Baseline time. Full sampling — best edge blending and skin match.' },
                    { v: 2, label: 'Turbo', note: '~25% of time',
                      info: '~25% of the time. Half the steps; softer detail in hair.' },
                    { v: 3, label: 'Hyper', note: '~13% of time',
                      info: '~13% of the time. Fewest steps — for checking framing, not final work.' },
                ],
            },
        ],
    },
    // MPI-520 — the first Flow authored with no component at all. Its three controls
    // are DECLARED (MPI-531), so the whole descriptor is data a third-party manifest
    // could carry. Do not reach for a component to gain a knob; add the field type.
    //
    // Runs on the already-installed LTX 2.3 checkpoint — no ModelDef, no dep entry.
    // `ltx-23-balanced` specifically: the bench-proven graph bakes the int8
    // transformer (UNETLoader → ...int8_convrot.safetensors), so the High card's
    // bf16 weight would not satisfy it. One tier, one workflow file — revisit if the
    // Flow Library ever leaves the dev gate with only the High card installed.
    {
        id: 'ltx-extend',
        title: 'Extend Video',
        // Both cut from a real extend run and its kept source (2.334s in, 4.042s out —
        // verified as the same shot by PSNR before building on it). What this flow
        // changes is LENGTH, so the hero plays the RESULT straight through under a
        // progress rail: the source's 57.7% in `--ink-3`, a mark where it ended, and
        // the rail running past it in `--accent-heat` — the added seconds are the
        // payload, so they are the only thing wearing the accent. The tile is that
        // rail complete, over the walk it bought.
        preview: 'flow-ltx-extend.webp',
        video: 'flow-ltx-extend.mp4',
        description: 'Continue a video past its last frame. Drop a clip, describe what happens next, and LTX 2.3 generates the new seconds — with matching audio — onto the end of it.',
        requiredModels: ['ltx-23-balanced'],
        operation: 'flowLtxExtend',
        workflow: 'flow_ltx_extend.json',
        mediaType: 'video',
        inputSchema: {
            media: [
                { type: 'video', mode: 'upto', max: 1, roles: ['video1'], labels: ['Video to extend'] },
            ],
        },
        // No middle steps: nothing here is marked on the clip itself, so the flow is
        // a 2-step carousel (supply → run).
        steps: [],
        // Declared fields — rendered by MpiBaseFlow on the run slide (that is what
        // declaring them HERE rather than on a step means), each value reaching the op
        // under its own id. `positive`/`negative` are read by submitFlowGeneration;
        // `Input_Duration` is an injection param, so it is named for the graph node
        // it writes.
        fields: [
            {
                id: 'positive', type: 'text', rows: 3, label: 'What happens next',
                placeholder: 'Describe the new seconds — action, camera, sound…',
            },
            {
                id: 'negative', type: 'text', rows: 2, label: 'Avoid',
                // The bench-proven negative, kept as the default because it is what
                // the approved runs used — an empty box here is a different graph.
                default: 'letterbox, black bars, cinematic bars, pillarbox, border, vignette, blurry, low quality, still frame, frames, watermark, overlay, titles, unrealistic, plastic, fake, out-of-focus, low-detail, slow motion',
            },
            {
                // Seconds of NEW video, snapped to whole latent frames by the graph
                // (MpiMath `floor((a*b+0.5)/8)*8/b` off the source's own fps). A
                // slider because it is a bounded coarse choice, not a typed number.
                id: 'Input_Duration', type: 'slider', label: 'Seconds to add',
                min: 1, max: 10, step: 1, default: 4,
            },
        ],
    },
    // MPI-536 — the foley twin of ltx-extend. Same tier, same all-declared shape,
    // OPPOSITE resolution decision: this graph's Input_Width/Input_Height were deleted
    // because they fed only the encode and never the delivered pixels (Output_Video
    // takes its images off the raw source), so the output always matches the input and
    // there is nothing to expose. Do not copy extend's width/height plan across.
    //
    // Unlike extend this one DOES add a weight: ltx23-lora-foley, on `ltx-23-balanced`
    // only (see models.js). The graph bakes the int8 transformer, so that tier is the
    // only one that can run it.
    //
    // v1 IS FOLEY ONLY. The same file carries a voice mode — Input_Audio#106 fed a real
    // path, the speech terms dropped from the negative, Foley_Lora#100 set to None — and
    // it has never been run. The two are mutually exclusive settings, so shipping them
    // as two toggles would present untested configuration as a composable feature.
    {
        id: 'ltx-foley',
        title: 'Add Foley',
        // Both cut from a real run of this flow (prompt: footsteps on gravel coming
        // from the right and leaving to the left). The hero cannot be a before/after
        // — this flow returns the SAME pixels — so it plays the picture untouched
        // while the waveform of the generated foley draws itself in sync.
        preview: 'flow-ltx-foley.webp',
        video: 'flow-ltx-foley.mp4',
        description: 'Give a silent clip a soundtrack. Drop a video, describe what it should sound like, and LTX 2.3 generates matching foley across the whole clip — the picture comes back untouched.',
        requiredModels: ['ltx-23-balanced'],
        operation: 'flowLtxFoley',
        workflow: 'flow_ltx_foley.json',
        mediaType: 'video',
        inputSchema: {
            media: [
                { type: 'video', mode: 'upto', max: 1, roles: ['video1'], labels: ['Video to score'] },
            ],
        },
        // Nothing is MARKED on the clip, but the user still has to see it: step 0
        // loads media at thumbnail size, so a `preview` step is the first point at
        // which they can judge the take they are about to score — and the prompts
        // belong with it, written while watching the thing being described.
        // 3-step carousel (supply → describe → run).
        //
        // Two fields, and deliberately no third: no duration (whole-clip by
        // construction), no resolution, no seed (_buildParams fills Input_Seed per
        // run), no audio-influence knob (Audio_Influence#110 only reaches the
        // sampler through the voice-mode branch, so surfacing it here would be a
        // dead control).
        steps: [
            {
                kind: 'preview', role: 'video1',
                tickerLabel: 'Describe',
                title: 'Describe what it should sound like',
                fields: [
                    {
                        id: 'positive', type: 'text', rows: 3, label: 'What it should sound like',
                        placeholder: 'Describe the sounds — footsteps, room tone, traffic, wind…',
                    },
                    {
                        id: 'negative', type: 'text', rows: 2, label: 'Avoid',
                        // The bench-proven negative verbatim. Its speech/music terms are what
                        // keep foley from drifting into score or narration, and it only bites
                        // at all because the guider runs at cfg 3.0 — at cfg 1 core CFGGuider
                        // sets uncond_pred = None and this string is inert.
                        default: 'music, melody, song, singing, vocals, score, soundtrack, beat, instrumental backing, narration, tinny, thin, harsh, clipped, distorted, low bitrate, static, noise, room tone',
                    },
                ],
            },
        ],
    },
];

/** @returns {FlowDef[]} All flow descriptors. */
export function listFlows() {
    return FLOWS.slice();
}

/**
 * @param {string} id
 * @returns {FlowDef|null}
 */
export function getFlowById(id) {
    return FLOWS.find(a => a.id === id) || null;
}

// ── Flow dep-status cache (populated by syncModelInstalled, modelRegistry.js) ──
// Map of flowId → Map of depId → installed:boolean. Flows run NO sync of their own —
// the model sync stats their deps in the same /comfy/models/check payload (that route
// is id-agnostic: it takes {id, deps} and stats filenames, never touching MODELS) and
// hands the slice back here. Empty until the first sync lands: a flow with
// requiredDeps therefore reads NOT-installed until proven present, which fails
// CLOSED (a badge that says "get it" is recoverable; a Run that dies inside ComfyUI
// with "lora not found" is not). MPI-304.
const _flowDepStatusCache = new Map();

/**
 * Record a sync's per-dep result for one flow. Called by syncModelInstalled only.
 * @param {string} flowId
 * @param {Map<string, boolean>} depMap - depId → installed
 */
export function setFlowDepStatus(flowId, depMap) {
    _flowDepStatusCache.set(flowId, depMap);
}

/**
 * @param {string} flowId
 * @returns {Map<string, boolean>|null}
 */
export function getFlowDepStatus(flowId) {
    return _flowDepStatusCache.get(flowId) ?? null;
}

/**
 * Every flow's requiredDeps, resolved to dep objects, keyed by flowDepKey(). The
 * shape /comfy/models/check wants — used by the sync payload AND by the backend
 * uninstall guards to learn which deps a flow still needs. Unknown dep ids are
 * dropped (filter(Boolean)) exactly as the model resolver does.
 * @returns {Array<{id: string, flowId: string, deps: Object[]}>}
 */
/**
 * Every dep id a flow needs on top of its models: its own `requiredDeps`, plus the
 * deps of every plugin it declares in `requiredPlugins` (MPI-580).
 *
 * A required plugin folds into the flow's dep set rather than gaining a gate of its
 * own, because a plugin has no install state to check — its deps ARE its install
 * state (pluginsRegistry.js). Folding therefore reuses the whole MPI-304 machinery:
 * the same badge, the same Run guard, the same install button. Without it a Flow
 * installs and runs with its plugin absent, and fails deep inside ComfyUI.
 *
 * @param {FlowDef} flow
 * @returns {string[]} dep ids, de-duplicated
 */
function flowDepIds(flow) {
    const out = new Set(flow?.requiredDeps || []);
    for (const pluginId of (flow?.requiredPlugins || [])) {
        for (const depId of (getPlugin(pluginId)?.requiredDeps || [])) out.add(depId);
    }
    return [...out];
}

export function flowDepUniverse() {
    return FLOWS
        .map(a => ({ id: flowDepKey(a.id), flowId: a.id, depIds: flowDepIds(a) }))
        .filter(a => a.depIds.length)
        .map(a => ({
            id: a.id,
            flowId: a.flowId,
            deps: a.depIds.map(depId => DEPS[depId]).filter(Boolean),
        }));
}

/**
 * Resolved dep objects for ONE flow's requiredDeps (install-side; the flow twin of
 * getModelDependencies). Feeds downloadService.start(flowDepKey(id), deps).
 * @param {FlowDef|string} flowOrId
 * @returns {Object[]}
 */
export function getFlowDependencies(flowOrId) {
    const flow = typeof flowOrId === 'string' ? getFlowById(flowOrId) : flowOrId;
    if (!flow) return [];
    return flowDepIds(flow).map(depId => DEPS[depId]).filter(Boolean);
}

/**
 * Availability = every requiredModel id installed AND every requiredDep present.
 *
 * requiredModels are MODEL ids; s_installedModelIds is already partial-aware
 * (populated via isModelUsable, modelRegistry.js) so ≥1-op-installed models count.
 * requiredDeps are DEP ids (MPI-304) — flow-only weights/nodes no model requires;
 * their disk status comes from the flow dep-status cache above. Both gate the same
 * badge and the same Run guard: the user cannot open a flow until it has BOTH.
 *
 * `missing` stays MODEL ids only — every existing caller treats it as such
 * (flowService's toast, MpiFlowLibrary's _installMissing → getModelDependencies).
 * Missing deps ride alongside in `missingDeps`; `available` accounts for both.
 *
 * @param {FlowDef|string} flowOrId
 * @returns {{available: boolean, missing: string[], missingDeps: string[]}}
 */
export function flowAvailability(flowOrId) {
    const flow = typeof flowOrId === 'string' ? getFlowById(flowOrId) : flowOrId;
    if (!flow) return { available: false, missing: [], missingDeps: [] };
    const installed = state.s_installedModelIds || [];
    const missing = (flow.requiredModels || []).filter(id => !installed.includes(id));
    const depStatus = _flowDepStatusCache.get(flow.id);
    const missingDeps = flowDepIds(flow).filter(id => depStatus?.get(id) !== true);
    return { available: missing.length === 0 && missingDeps.length === 0, missing, missingDeps };
}
