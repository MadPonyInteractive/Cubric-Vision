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
 * @property {Array<string|{label: string, models: string[]}>} requiredModels - MODEL ids (NOT dep
 *                                       ids); drives the availability badge. Each entry is a SLOT
 *                                       — one ROLE the graph plays a model in. The object form
 *                                       makes that role choosable: `models` are interchangeable
 *                                       candidates for it, the flow runs on whichever one resolves,
 *                                       and the badge is satisfied by any of them (MPI-590,
 *                                       generalised to N slots x N candidates in MPI-599). A plain
 *                                       string is the one-candidate shorthand, which is most flows.
 *                                       `models[0]` is the RECOMMENDED candidate — declaration
 *                                       order is preference order, and the picker stars it.
 *                                       A flow may declare SEVERAL choosable slots; the scribble
 *                                       flow picks an SDXL checkpoint for its render phase and an
 *                                       edit model for its blend phase, independently.
 *                                       Resolve the list through `flowModelIds()` — never read the
 *                                       raw array, or a slot reaches a consumer as an object.
 * @property {Object<string, Object>} [modelParams] - Per-MODEL injection params, merged into the
 *                                       run's `injectionParams` for whichever candidate of each
 *                                       slot is running (MPI-590). This is what makes the picker
 *                                       REAL: without it the choice changes the badge and nothing
 *                                       else, because the graph's loader is baked. Every resolved
 *                                       slot contributes, so a two-slot flow injects both phases'
 *                                       models from one merge. Keys are ordinary injection keys,
 *                                       so `Title.widget` addressing works. Flow-local on purpose
 *                                       — the two Krea2 cards differ by a transformer file and a
 *                                       bypass strength, and that is knowledge about THIS graph,
 *                                       not a registry concept.
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
 * A `requiredModels` SLOT may carry `loras: true` — see `flowLoraPhases()`. That slot's
 * running model then contributes its USER LoRA RACK to the graph's
 * `Input_Lora_Phase<N>_<i>` nodes, where N is the slot's 1-based position, and the slide-over
 * shows a cogwheel opening that model's Model Settings panel. It is NOT a model selection —
 * a flow still dispatches as an operation with `model.id: null`, and this never reaches
 * model resolution or workflow lookup.
 *
 * OPT-IN, and it must stay that way: `flow_ltx_extend` and `flow_ltx_foley` both carry
 * `Input_Lora_1..6` nodes while deliberately declaring no rack, so filling every slot whose
 * graph HAS the nodes would silently start injecting the user's LTX LoRAs into two shipped
 * flows. The rack is the model's OWN settings, shared with its ordinary generations — the
 * same LoRA is the same LoRA whether the flow or the prompt box runs it. Flat-slot models
 * only; a `loraStages` model warns and is skipped rather than injected in the wrong shape.
 *
 * This replaced a single `settingsModel` string (MPI-504 → MPI-608). One string could name
 * only one rack, so a flow choosing a model PER PHASE could never fill both of them.
 * @property {'image'|'video'|'audio'} mediaType - What the flow PRODUCES. Decides the gallery
 *                                       card, the save path and the group type. `'audio'` became
 *                                       legal in MPI-573, for the music / TTS / voice-clone flows
 *                                       — such a flow's graph names its SaveAudio node
 *                                       `Output_Audio`, the same title a video's soundtrack uses,
 *                                       and the declared mediaType is what tells the two apart.
 * @property {Object}   inputSchema    - What the flow collects → injected into the workflow
 * @property {{compare?: string}} [result] - How the RESULT is presented. `compare` names the media
 *                                       ROLE holding the BEFORE — the frame then shows the result
 *                                       on the shared before/after surface (MpiCompareView) with a
 *                                       draggable reveal bar instead of a plain element (MPI-585).
 *                                       Declare it on any flow that IMPROVES media the user
 *                                       supplied; one declaration covers video and image alike.
 *                                       OMIT when a comparison would say nothing — a flow that
 *                                       returns the same pixels (foley) or whose output is not the
 *                                       same footage (an extend is LONGER than its source). The
 *                                       frame falls back to the plain element on its own when the
 *                                       named media is gone or the run produced several outputs.
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
 * @property {string}  [mediaRole] - Where a STEP_MEDIA kind's derived FILE lands, when that
 *                               is not the role it operates on (MPI-567). Omit and the file
 *                               REPLACES the step's own media, which is what `crop` wants — a
 *                               padded picture supersedes the picture it padded. `paint`
 *                               wants the opposite: the user draws on the photo and the graph
 *                               needs BOTH, so the layer is declared into its own slot and
 *                               the frame APPENDS it. The named role must be one the op's
 *                               `mediaInputs` declares, or the file reaches no node.
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
 *   toggle -> MpiButton (icon mode, toggleable) · number, text -> MpiInput ·
 *   slider -> MpiProgressBar
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
 * @property {string}  [icon]  - For `button` and `toggle`: an `js/utils/icons.js` key, rendered to
 *                               the LEFT of the label. The button itself is an MpiButton in the
 *                               app's primary variant — never restyle it from a consumer block.
 *                               OPTIONAL on a `toggle`, which falls back to a tick; a `toggle`
 *                               shows its label on its own face either way, so neither type ever
 *                               gets a caption printed above it.
 * @property {number}  [rows]  - For `text`. `> 1` renders a textarea (the prompt case).
 * @property {string}  [placeholder] - For `text`.
 * @property {*}       [default]
 * @property {'enhance'} [action] - Makes a `button` an ACTION rather than a value
 *                               (MPI-504). An action's own id never reaches the op, and it stores
 *                               nothing.
 *                               A `settings` action existed here and is GONE (MPI-608): it opened
 *                               the rack for the flow's single `settingsModel`, which cannot
 *                               express a flow with a model per phase. The cogwheel beside each
 *                               model selector in the slide-over replaces it — same panel, same
 *                               `ui:open-model-settings` event, addressed per phase.
 *                               `enhance`
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
        // The BEFORE is `image1`, the plate being kept — NOT `image2`, which only
        // donates a head and shares no framing with the output. Outside the head the
        // two plates are pixel-identical (the same property the hero's wipe is built
        // on), so the reveal bar crosses one steady scene and only the head changes,
        // which is the clearest possible read of what this flow did (MPI-585).
        result: { compare: 'image1' },
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
        // Nothing is MARKED on the clip, but the user still has to see it: step 0
        // loads media at thumbnail size, so a `preview` step is the first point at
        // which they can judge the take they are about to continue — and the prompts
        // belong with it, written while watching the last seconds they are describing
        // past. 3-step carousel (supply → describe → run).
        //
        // A step's fields reach the op exactly as a flow-level one does (MpiBaseFlow
        // `_collectInputs` folds `stepValues[role].fields` into the same `declared` /
        // `injectionParams` bins), so this is a placement change, not a payload one.
        steps: [
            {
                kind: 'preview', role: 'video1',
                tickerLabel: 'Describe',
                title: 'Describe what happens next',
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
                ],
            },
        ],
        // Declared fields — rendered by MpiBaseFlow on the run slide (that is what
        // declaring them HERE rather than on a step means), each value reaching the op
        // under its own id. `Input_Duration` is an injection param, so it is named for
        // the graph node it writes.
        fields: [
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
    // MPI-584 — the FLOW half of the LTX Video upscaler. The capability ships TWICE
    // on purpose (memory `project_flows_are_the_beginner_surface`): MPI-579 shipped it
    // as a PLUGIN entry in the History video Upscale dropdown, and this is the same
    // capability behind the Flow Library, so a beginner never has to leave it.
    //
    // NOTHING HERE IS NEW WORK. The op (`ltxVideoUpscale`, universal, injector
    // `ltxSigmas`), the graph (`ltx_video_upscale.json`, 29 nodes, audio pass-through
    // proven) and both registry mappings were built and verified by MPI-579 — this
    // descriptor is the only file the second surface needed. The three fields below are
    // the plugin's `upscale.fields` VERBATIM, which is what keeps the two surfaces from
    // drifting apart: change one, change the other.
    //
    // Same line as ltx-foley / ltx-extend: `requiredModels: ['ltx-23-balanced']` and NO
    // requiredDeps. It owns no weight — every one the graph loads is that tier's, and the
    // spatial upscaler is already in both LTX tiers' `dependencies`. Balanced specifically
    // because the graph bakes the int8 transformer.
    //
    // NO frame or resolution cap, and that is a decision rather than an oversight: the
    // graph has no knob to cap (its only Input_* nodes are the ones below), so a cap means
    // a new node plus a control — a card of its own. Measured cost is 12752 MB at 25
    // frames and 14721 MB at 73 on a 16380 MB card (MPI-579 validation Phase 5), so the
    // ceiling is real and grows with length. Until a cap exists the description is what
    // warns the user, because an OOM lands minutes deep.
    {
        id: 'ltx-upscale',
        title: 'Upscale Video',
        preview: 'flow-ltx-upscale.webp',
        video: 'flow-ltx-upscale.mp4',
        description: 'Double a video’s resolution and rebuild its detail. Drop a clip and LTX 2.3 re-renders it at 2x — the audio comes through untouched. Short clips first: cost grows with length, and a long one can exhaust the GPU.',
        requiredModels: ['ltx-23-balanced'],
        operation: 'ltxVideoUpscale',
        workflow: 'ltx_video_upscale.json',
        mediaType: 'video',
        inputSchema: {
            media: [
                // Role MATCHES the op's `mediaInputs` key (`inputVideo`), NOT the `video1`
                // its sibling flows use — that op predates them and is shared with the
                // plugin, so the flow bends to the op.
                { type: 'video', mode: 'upto', max: 1, roles: ['inputVideo'], labels: ['Video to upscale'] },
            ],
        },
        // An upscale IMPROVES media the user supplied, so the result is worth seeing
        // against its source (MPI-585). The role names which input is the BEFORE; the
        // shared surface handles the rest, video and image alike.
        result: { compare: 'inputVideo' },
        // Run-slide fields, no middle step. Unlike extend and foley the prompt here is
        // OPTIONAL and secondary (an upscale is a fidelity job), so there is nothing the
        // user has to watch the clip to write.
        //
        // Both ranges are MPI-568's, measured and closed by Fabio 2026-08-19. The user
        // sees 0–1 on both and the mapping is hidden — his words: "The mapping should be
        // occulted from the user, as per usual."
        fields: [
            {
                id: 'positive', type: 'text', rows: 3, label: 'Prompt', default: '',
                placeholder: 'Optional — describe the shot to steer the detail',
                // EMPTY by default, and load-bearing. MPI-568's most expensive finding:
                // the bench's own default prompt ("natural skin texture, freckles, sharp
                // eyes") was ordering the artifact every downstream dial had been built to
                // remove — the model rendered those freckles as MOLES on flat cheek skin.
                // A suggestion belongs in the placeholder, never in the value.
            },
            {
                id: 'Input_Denoise', type: 'slider', label: 'Denoise',
                min: 0, max: 1, step: 0.01, default: 0.5,
                // -> start sigma 0.50–0.85; UI 0.5 lands on 0.675, Fabio's default. The
                // whole four-value schedule is derived from this one number by
                // ltxSigmasInjector, not by the graph.
                mapTo: [0.50, 0.85],
                note: 'Higher reconstructs more detail and drifts further from the source.',
            },
            {
                id: 'Input_Prompt_Strength', type: 'slider', label: 'Prompt strength',
                min: 0, max: 1, step: 0.01, default: 0,
                // -> cfg 1–3. Defaults to the NO-GUIDANCE end on purpose. Fabio,
                // overruling a plan recommendation of 3: "Most upscaling jobs do not want
                // too much change anyway." Steering is opt-in; the measurement bounds the
                // range, not the default. Do not re-argue it.
                mapTo: [1, 3],
                note: 'Only has an effect once you write a prompt.',
            },
        ],
    },

    // MPI-504 — the Character Sheet. A description in, a three-panel video-reference
    // sheet out: a large 3/4 close-up, full body front and full body back, in the
    // layout a video model reads best. v1 takes a PROMPT AND NOTHING ELSE — the
    // reference-photo path is deferred whole to v2, because Head Swap already covers
    // "make it look like this person" as a second pass on the finished sheet.
    //
    // The FRONT BODY IS HEADLESS on purpose, and it is a MASK op, not a prompt: SAM3
    // text-selects hair+face+hat as one union, the box is squared and grown, and Klein
    // 4B inpaints the head away. On a wide shot the model otherwise sources the face
    // from the tiny blurry full-body figure; remove that head and it has exactly one
    // place to take a face from. Toggleable, on by default.
    //
    // NO requiredDeps. Every weight and node this graph needs is either a MODEL dep of
    // krea2/klein-4b (RES4LYF, Impact-Pack, inpaint-cropandstitch, MpiNodes) or an
    // engine-installed universal — `getUniversalWorkflowDepIds()` (routes/shared.js)
    // returns EVERY `type:'custom_nodes'` dep plus EVERY `engineAsset`, so
    // face-yolov8n, sam3-multiplex and Impact-Subpack all install with the engine and
    // belong to no model. Declaring face-yolov8n here (as plan.md first proposed, by
    // analogy with head-swap's LoRA) would be wrong twice: the analogy fails because a
    // LoRA is neither of those things, and an undeclared dep-status cache reads
    // NOT-installed until the first sync, so the flow would show unavailable on open
    // for a weight the engine already guarantees.
    // MPI-567. Two phases, two models, and the user picks BOTH (Fabio, 2026-08-22):
    // SDXL renders the drawing as an object through the shipped ControlNet-Union
    // branch, then a LanPaint inpaint over a user-placed box blends it into the photo.
    // Bench-proven end to end; the blend route and its seam fix are written up in
    // ../blending-into-a-photo.md and tasks/MPI-567/research/lanpaint/verdict.md.
    {
        // RENAMED 2026-08-23 (Fabio): "Scribble to Object" -> "Draw It In". "Object" was
        // the broken word — he had been drawing characters, and the old title read as a
        // promise the flow does not make. DISPLAY ONLY: `id`, `operation: 'flowScribObj'`
        // and `workflow: 'flow_draw_it_in.json'` all deliberately stay, because
        // cards already in users' galleries carry the `FLOWSCRIBOBJ_` prefix and their
        // sidecars' `flowId`, so renaming the id breaks reuse on every existing item.
        // The preview filenames DID move, and that was free exactly once: the assets do
        // not exist yet (`/mpi-flow-graphics` has not run), and 06 names them for the
        // flow by hand rather than deriving them from the id.
        id: 'scribble-object',
        title: 'Draw It In',
        // Both assets EXIST in `comfy_workflows/display/` as of 2026-08-23 — check
        // before touching either name. `7c883d67` declared this pair before the art
        // was made, the tile fetched it and 404'd, and because
        // `tests/desktop/flows-tab-ring.spec.js` asserts `consoleErrors` is empty in
        // three places, that held master's CI RED for a day and eight pushes. Both
        // fields are optional and every consumer guards them (`MpiFlowLibrary.js` ~333,
        // `MpiTileSheet.js` ~137), so the correct state while art is missing is ABSENT,
        // never a name written ahead of the file.
        //
        // Built from run 015 of Fabio's own live session: the source photo, the
        // drawing he painted, and what the flow returned. The tile is the hero's seam
        // frozen at x=250 of 896 so the drawing leads and the red dress emerges past
        // it; being portrait, it also carries the feet and contact shadow that the
        // hero's 8:5 band has to cut (the figure is 652px tall and no 8:5 band off a
        // 896-wide plate is taller than 560).
        preview: 'flow-draw-it-in.webp',
        video: 'flow-draw-it-in.mp4',
        description: 'Draw what you want on top of your own photo, describe it, and the flow renders it — a person, an animal, an object — and blends it into the scene, matching the light and casting a shadow on the ground.',
        // TWO choosable slots, resolved independently (any-of-models.md). The render
        // phase samples an SDXL checkpoint; the blend phase runs a Klein edit model.
        // Every SDXL-family card already declares controlTypes scribble + canny behind
        // the ONE ControlNet-Union loader this graph drives, so all five are genuine
        // candidates — the choice is a style choice, which is exactly what the user
        // should be making. `models[0]` is the recommendation: SDXL Realistic is the
        // base the flow was proven on, and **Klein 9B** blends better — session 7 judged
        // it better by eye on all five plates, and with the feather it matches 4B's seam
        // numbers rather than trading them away. It costs ~1.9x the time (30s vs 16s) and
        // a larger text encoder; 4B stays as the cheaper arm. Fabio's call, 2026-08-22.
        //
        // The two Klein cards are BOTH named "FLUX.2 Klein", so the picker appends their
        // tier letter (9B = B, 4B = L). That is the picker's job, not this list's — see
        // MpiFlowLibrary `_label`.
        requiredModels: [
            {
                label: 'Render model',
                models: ['sdxl-realistic', 'sdxl-nsfw', 'ill-anime-beauty', 'ill-anime', 'pony-mix'],
                // PHASE 1 — fills `Input_Lora_Phase1_1..6` (MpiLoraModelClip, model AND clip)
                // on the SDXL render chain. This is also the answer to the style problem the
                // flow shipped with: the object came back in its own style rather than the
                // photo's, widening the box so the model could infer one was TRIED and
                // failed, and a user-picked style LoRA declares it instead of inferring it.
                loras: true,
            },
            {
                label: 'Blend model',
                models: ['klein-9b', 'klein-4b'],
                // PHASE 2 — fills `Input_Lora_Phase2_1..6` (MpiLoraModel, model only, which
                // is what klein_t2i ships). Keyed by PHASE and not by family on purpose: this
                // slot swaps klein-4b for klein-9b and the graph is never retitled.
                loras: true,
            },
        ],
        // The graph is baked SDXL Realistic + Klein 4B, so every arm names its own
        // weights explicitly — a set reads as a set, and the arm that DOES match the
        // bake (sdxl-realistic, klein-4b) catches a re-export quietly moving a default.
        // Note the recommendation and the bake deliberately disagree on the blend slot:
        // 9B is recommended, 4B is what the graph loads standing alone at the bench.
        //
        // THE CLIP ARM IS NOT OPTIONAL TRIM. Klein 9B needs
        // `qwen_3_8b_int8_convrot` and 4B needs `qwen_3_4b`; pairing 9B with 4B's
        // encoder dies with a shape error that reads as a LanPaint bug and is not one
        // (MPI-600). So the text encoder moves WITH the checkpoint or the 9B arm is
        // broken on arrival.
        //
        // `Input_Edit_Clip.clip_name` uses the dotted `Title.widget` form (MPI-359)
        // while the other two are plain, and that asymmetry is load-bearing rather
        // than untidy: `ckpt_name` and `unet_name` are on `comfyController._inject`'s
        // spray list and `clip_name` is NOT, so a plain `Input_Edit_Clip` would match
        // the node and silently write nothing.
        modelParams: {
            'sdxl-realistic':   { 'Input_Base_Model': 'SDXL_Realistic.safetensors' },
            'sdxl-nsfw':        { 'Input_Base_Model': 'SDXL_NSFW.safetensors' },
            'ill-anime-beauty': { 'Input_Base_Model': 'ILL_Anime_Beauty.safetensors' },
            'ill-anime':        { 'Input_Base_Model': 'ILL_Anime.safetensors' },
            'pony-mix':         { 'Input_Base_Model': 'PONY_Mix.safetensors' },
            'klein-4b': {
                'Input_Edit_Model': 'flux-2-klein-4b-int8-convrot.safetensors',
                'Input_Edit_Clip.clip_name': 'qwen_3_4b.safetensors',
            },
            'klein-9b': {
                'Input_Edit_Model': 'flux-2-klein-9b-int8-convrot.safetensors',
                'Input_Edit_Clip.clip_name': 'qwen_3_8b_int8_convrot.safetensors',
            },
        },
        operation: 'flowScribObj',
        workflow: 'flow_draw_it_in.json',
        mediaType: 'image',
        inputSchema: {
            // ONLY `media` is read here. A `positive: 'string'` key sat in this object
            // and did NOTHING — the frame reads `inputSchema.media` and nothing else,
            // and a prompt reaches the run by being a declared FIELD whose id is
            // `positive` (MpiBaseFlow `_collectInputs`). It read as a wired prompt, the
            // flow shipped with no prompt box at all, and the first live run rendered a
            // blob into something nobody asked for because the model had only the
            // ControlNet hint to go on (MPI-567, 2026-08-23). Declare prompts BELOW.
            //
            // ONE user slot. `image2` (Input_Paint) is the op's second slot but is
            // never offered here: the paint step DERIVES that file, there is nothing
            // to upload into it, and a visible empty slot would invite a wrong one.
            media: [
                {
                    type: 'image', mode: 'upto', max: 1,
                    roles: ['image1'],
                    labels: ['Photo'],
                },
            ],
        },
        // The BEFORE is the user's own photo, and the flow's whole claim is that only
        // the drawn region changed — so the reveal bar crosses a steady scene.
        result: { compare: 'image1' },
        steps: [
            {
                // `mediaRole` sends the derived layer to `image2` instead of replacing
                // `image1`: the graph wants the photo AND the drawing (paint-gizmo.md).
                // Omit it and the drawing would eat the photo.
                kind: 'paint', role: 'image1', mediaRole: 'image2',
                tickerLabel: 'Draw it',
                title: 'Draw what you want to add',
                // THE PROMPT BELONGS BESIDE THE DRAWING, and it is not optional
                // (Fabio, 2026-08-23). A human reads a blob as the thing they had in
                // their head; the model reads it as a silhouette, and a girl and a boy
                // share one. Ask while the drawing is on screen — an unlabelled shape
                // is exactly what the user cannot describe from the next step.
                //
                // DECLARED HERE AND NOWHERE ELSE. Restating it in the flow's own
                // `fields` so it is also editable on the run slide is the obvious next
                // thought, and it SILENTLY DROPS EDITS from the second run onward.
                // The two surfaces are two different stores: a gizmo step's fields are
                // role-keyed in `_stepValues[role].fields`, while flow fields live in
                // `_fieldValues`, and `_collectInputs` applies the flow store LAST.
                // On a fresh open that is harmless — `_seedField` returns undefined for
                // a flow-level field with no default and no persisted root, so the key
                // is absent and cannot overwrite. But after one run `s_flowInputs`
                // carries `positive` at the payload root, the flow-level copy seeds
                // from it, and thereafter editing the prompt HERE is overwritten at
                // collection by the stale run-slide value. Wrong picture, no error.
                //
                // The character-sheet flow really does declare its prompt twice, and
                // that is not a counter-example: its prompt step is `kind: 'fields'`, a
                // FRAME kind with no role, whose values are seeded into the FLOW store
                // on purpose (stepKinds.js § FRAME_KINDS) — one store, so one value.
                // A gizmo step cannot borrow that. Unifying the two stores is frame
                // work and belongs to MPI-606, not to a FlowDef.
                //
                // Cost of the single surface: changing a word before `Generate Again`
                // means clicking "Draw it" in the ticker. One click, and correct.
                fields: [
                    {
                        id: 'positive', type: 'text', rows: 2, label: 'What did you draw?',
                        placeholder: 'An old lady riding the tiger, a stone bench, a red umbrella…',
                    },
                ],
                // The ~80-96px floor is measured, not a guess: below it the render
                // has too little ink to read and invents the object's detail.
                hint: 'Draw roughly where and how big it should be, then say what it is — the drawing gives the shape, the words give the subject. Keep it at least ~96px tall.',
            },
            {
                // The blend region. `param: 'box1'` -> `Input_Box` through the box
                // injector (an MpiBox carries four widgets, which the generic title
                // injector would match and silently not write). No `ratio`: this box
                // wraps an object AND the ground its shadow falls on, which is not
                // square. `overflow: 'allow'` because both consumers clip — MpiBoxMask
                // clamps to the image and the crop takes the clamped mask — and a
                // subject near an edge otherwise cannot be given room below it.
                kind: 'box', role: 'image1', param: 'box1', overflow: 'allow',
                tickerLabel: 'Blend area',
                title: 'Box the area to blend',
                // Asks for ROOM, never light direction — the model reads the scene's
                // own light, and telling it where the light is makes it worse
                // (blending-into-a-photo.md). The seam warning is scene-dependent on
                // purpose: a plain background is where a tonal step is visible.
                hint: 'Include the object plus room on the ground for its shadow. Keep it tight — everything inside gets re-rendered, and on a plain background (sky, water, a flat wall) a big box can leave a visible edge.',
            },
        ],
        fields: [
            {
                // 1 = scribble, 2 = canny, matching the graph's MpiAnySwitch banks.
                // The copy says TONAL, never "structured": a user with clean line art
                // who reads "structured" as "neat" picks canny and gets their own ink
                // back as an outline, because canny sees a drawn stroke's TWO edges.
                id: 'Input_Control_Net', type: 'radio', label: 'Drawing type',
                columns: 2, default: 1,
                options: [
                    { v: 1, label: 'Line drawing', note: 'flat lines',
                      info: 'For flat line art. Thins each stroke to a centreline, so the model renders a form rather than tracing your ink.' },
                    { v: 2, label: 'Shaded sketch', note: 'tonal',
                      info: 'For a shaded pencil drawing with hatching. Carries interior structure — folds, a motif on a shirt — that the line arm flattens.' },
                ],
            },
            {
                // MANDATORY, and a correctness requirement rather than a convenience.
                //
                // THE MAPPING IS THE APP'S, NOT THIS FLOW'S (Fabio, 2026-08-23). The graph
                // now matches `t2i_sdxl_realistic` node for node — MpiFloat(1) ->
                // MpiNormalizeValue(0-1 -> 0-0.5) -> ControlNetApplyAdvanced(end_percent
                // 0.569) — which is what all eight other ControlNet workflows in the repo
                // do. It shipped mapping 0-1 -> 0-1 at end_percent 1 instead, so the slider
                // reached DOUBLE the app's maximum strength and held it to the final
                // denoise step. Fabio hit it immediately: "every time I go over a 50 I
                // start getting these lines that look like poop." `promptControlDefaults`
                // states the rule outright — the remap exists "because past ~0.5 those
                // ControlNets artefact" — and holding the steer to the last step is what
                // turns a stroke into a ridge rather than merely a stiff render.
                // `default: 1` is `PROMPT_CONTROL_DEFAULTS.controlStrength`, so this knob
                // now reads the same at the same number everywhere in the app.
                //
                // HISTORICAL, measured at the OLD mapping — the numbers below are RAW
                // strength at end_percent 1, so they do NOT convert to slider positions
                // now: 0.30-0.60 correct; 0.80 rendered the INK AS CLOTHING, a drawn
                // neckline becoming a real V-neck seam; 1.00 put the drawn lines through
                // as straps. The finding that OUTLIVES the remap is the shape of the
                // failure: a drawing's SHAPE survives far below the strength at which its
                // LINES start being rendered as objects. Where the band sits under the new
                // mapping is UNMEASURED — re-sweep before quoting a number here.
                //
                // RE-SWEPT UNDER THE NEW MAPPING, 2026-08-23 (Fabio, live). Three points:
                // **0.5** did not follow the drawing at all — he had to force the subject
                // through the prompt; **0.65** overshot, putting the doodle itself through
                // in one generation, which is the same ink-as-edges failure the historical
                // 0.80 entry above describes; **0.60 is the shipped value**, his call
                // between them. `end_percent` stays 0.569 and the slider stays 0-1.
                //
                // AND HERE IS WHY 0.5 IS THE HOUSE NUMBER, which matters more than the
                // band: it is the minimum safe ceiling across EVERY control type an SDXL
                // card offers. Not just scribble and canny — **openpose and depth**, and
                // those two are what set the floor ("passing 50 starts giving a lot of
                // issues on open pose and depth"). A t2i workflow puts all of them behind
                // one slider, so its ceiling must satisfy the weakest.
                //
                // THIS FLOW MAY EXCEED IT BECAUSE ITS GRAPH CANNOT REACH THEM: it
                // hard-wires two banks, `hed/pidi/scribble/ted` and
                // `canny/lineart/anime_lineart/mlsd`, behind the two-option radio above,
                // and carries no pose or depth preprocessor at all. It is not an exemption
                // from the rule — the constraint the rule encodes does not apply here.
                // `flow-model-choice.test.cjs` carries this as a NAMED exception with that
                // reasoning. Add to that list, never widen the assertion, and the bar for
                // joining it is proving your graph cannot drive openpose or depth either.
                id: 'Input_Control_strength', type: 'slider', label: 'Follow the drawing',
                min: 0, max: 1, step: 0.05, default: 1,
                note: 'Turn it down if your strokes come through as real edges — a drawn line rendering as a seam means the drawing is being followed too literally.',
            },
        ],
    },
    {
        id: 'character-sheet',
        title: 'Character Sheet',
        preview: 'flow-character-sheet.webp',
        video: 'flow-character-sheet.mp4',
        description: 'Describe a character and get a reference sheet back: a large three-quarter portrait, plus full-body front and back views, on a plain grey studio backdrop. Built to be fed to a video model, so the front body comes back headless — that leaves the portrait as the only place a face can come from.',
        // A CHOOSABLE SLOT (MPI-590): the sheet samples Krea 2, and the SFW and NSFW cards
        // are the SAME architecture with a different bake — so a user holding either one
        // can run it, and is never asked for a second 12.25GB download of the other. Both
        // candidates stay listed so a user who has NEITHER picks which one downloads
        // instead of silently getting the first; `flowModelIds` resolves it, and
        // `modelParams` below is what makes the pick reach the graph.
        //
        // NOT `modelFamily` — MPI-316 removed that field from both krea2 cards on purpose:
        // it drives the H/B/L tier letter, and these two are CONTENT variants, not tiers.
        //
        // TWO CHOOSABLE SLOTS (MPI-610), the same shape scribble-to-object ships: the sheet
        // is generated by Krea 2 and then its head is REMOVED by a Klein edit pass, and
        // those are two different models doing two different jobs. Nothing moved off Krea 2
        // — the second slot is the inpaint phase that was already on Klein, hardcoded to 4B.
        requiredModels: [
            // `loras: true` — the graph carries a user LoRA rack, so the user's own LoRAs
            // ride along: the LoRA carries identity, the sheet carries the layout, and
            // someone who has already trained a character describes only the wardrobe and
            // face on top (Fabio, MPI-504). Declared on the SLOT rather than as a
            // flow-level `settingsModel`, so the rack follows whichever member of the
            // any-of set is running — the NSFW arm opens the NSFW rack (MPI-590) — and so a
            // flow with more than one model phase can give each of them one (MPI-608).
            { label: 'Render model', models: ['krea2', 'krea2-nsfw'], loras: true },
            // PHASE 2 — the head removal. `models[0]` is the recommendation, and unlike
            // scribble-to-object (which recommends 9B) this one recommends 4B: 4B is what
            // the graph bakes and what every sheet has ever been judged on, and 9B has
            // never been run on this flow at all. Re-order once someone has.
            //
            // The 9B arm only became wireable in MPI-603: the branch used to bake
            // `flux2-klein-4b-outpaint` at 1.1, there is no 9B twin and none will ever
            // exist, and LanPaint replaced the workaround that LoRA existed for.
            { label: 'Blend model', models: ['klein-4b', 'klein-9b'], loras: true },
        ],
        // What differs between the arms, as injection params. The graph is the SFW +
        // Klein 4B one, so those arms restate their own baked values — cheap, and it keeps
        // each pair readable as a pair instead of "the default plus an override".
        //
        // `Input_Bypass_Filter_Lora` is not optional trim: the NSFW twin workflow bakes
        // that strength at 0 (krea2_t2i_nsfw.json node 245), so leaving it at 1 runs the
        // lustify transformer with the SFW bypass still applied.
        //
        // THE CLIP ARM IS NOT OPTIONAL TRIM EITHER. Klein 9B needs `qwen_3_8b_int8_convrot`
        // and 4B needs `qwen_3_4b`; pairing 9B with 4B's encoder dies with a shape error
        // that reads as a LanPaint bug and is not one (MPI-600). The text encoder moves
        // WITH the checkpoint or the 9B arm is broken on arrival.
        //
        // `Input_Edit_Clip.clip_name` uses the dotted `Title.widget` form (MPI-359) while
        // the model keys are plain, and that asymmetry is load-bearing rather than untidy:
        // `unet_name` is on `comfyController._inject`'s spray list and `clip_name` is NOT,
        // so a plain `Input_Edit_Clip` would match the node and silently write nothing.
        modelParams: {
            'krea2': {
                'Input_Base_Model': 'krea2_raw_int8_convrot.safetensors',
                'Input_Bypass_Filter_Lora.strength_model': 1,
            },
            'krea2-nsfw': {
                'Input_Base_Model': 'lustify-v10-krea-raw-int8_convrot.safetensors',
                'Input_Bypass_Filter_Lora.strength_model': 0,
            },
            'klein-4b': {
                'Input_Edit_Model': 'flux-2-klein-4b-int8-convrot.safetensors',
                'Input_Edit_Clip.clip_name': 'qwen_3_4b.safetensors',
            },
            'klein-9b': {
                'Input_Edit_Model': 'flux-2-klein-9b-int8-convrot.safetensors',
                'Input_Edit_Clip.clip_name': 'qwen_3_8b_int8_convrot.safetensors',
            },
        },
        operation: 'flowCharacterSheet',
        workflow: 'flow_character_sheet.json',
        mediaType: 'image',
        // No `inputSchema` at all: this flow collects no media, so step 0 renders its
        // own "This flow needs no input media." beside the hero. No `result.compare`
        // either — there is no BEFORE to reveal against.
        //
        // The refine step. Media-less, so `kind: 'fields'` (FRAME_KINDS) — its fields
        // ARE the work, stacked where a canvas would be. No `role`, so its values live
        // in the FLOW-level store, which is what makes the prompt ONE value edited from
        // here and from the run slide.
        steps: [
            {
                kind: 'fields',
                tickerLabel: 'Describe',
                title: 'Describe your character',
                hint: 'Enhance rewrites your description into the phrase the sheet is generated from. Edit it freely — whatever is in the lower box is what runs. Leave it empty and your own words run raw.',
                fields: [
                    {
                        id: 'positive', type: 'text', rows: 3, label: 'Your character',
                        placeholder: 'Who they are, wardrobe, age, hair, eyes, scars and marks…',
                    },
                    {
                        id: 'enhance', type: 'button', label: 'Enhance', icon: 'enhance',
                        action: 'enhance', op: 'promptEnhance',
                        from: 'positive', to: 'Input_Positive',
                    },
                    {
                        // The enhanced phrase, shown ONLY here. It is the product as much
                        // as the picture is: an asset is a PAIR of image plus a phrase
                        // reused word for word, and a phrase the user cannot see is a
                        // phrase they cannot repair. `Input_*`, so it reaches the graph's
                        // MpiText#112 as an injection param — which beats the top-level
                        // `positive` because _buildParams assigns injectionParams LAST.
                        id: 'Input_Positive', type: 'text', rows: 10,
                        label: 'The character phrase',
                        placeholder: 'Press Enhance, or write the full phrase yourself.',
                    },
                ],
            },
        ],
        // The run slide carries the SAME prompt pair minus the enhanced box (declaring
        // the pair on both surfaces is what gives the condensed form), then the knobs.
        // Rule 3 of the decided UI lives here: with the enhanced text hidden, the
        // button's heat is the only thing that can say "this prompt is not enhanced".
        fields: [
            {
                id: 'positive', type: 'text', rows: 3, label: 'Your character',
                placeholder: 'Who they are, wardrobe, age, hair, eyes, scars and marks…',
            },
            {
                id: 'enhance', type: 'button', label: 'Enhance', icon: 'enhance',
                action: 'enhance', op: 'promptEnhance',
                from: 'positive', to: 'Input_Positive',
            },
            {
                // Four sheet templates behind one MpiAnySwitch, 1-indexed like
                // head-swap's Input_Tier — but a `select`, because these are four
                // equal LOOKS rather than a cost ladder worth spending a radio row on.
                // The dropdown emits the option's original `v`, so the int reaches
                // MpiAnySwitch as a number and not as "1".
                //
                // The templates differ in five marked spans and NOTHING else, and every
                // one of them keeps the pupil catch-light: without it the face is dead
                // and no video model can act with it. None of them names a lens, a grain
                // or a grade — the sheet stays boring on purpose, or the character
                // carries that look into every scene it is ever used in.
                id: 'Input_Recipe', type: 'select', label: 'Style', default: 1,
                options: [
                    { v: 1, label: 'Photoreal',
                      info: 'Photographed as a real actor — visible pores, natural hair, 85mm.' },
                    { v: 2, label: '3D animation',
                      info: 'Hero character for a feature animation — subsurface skin, groomed hair.' },
                    { v: 3, label: 'Anime',
                      info: 'Key character for an animated feature — crisp line art, flat cel shading.' },
                    { v: 4, label: 'Cartoon',
                      info: 'Hero character for an animated series — bold outlines, flat colour fills.' },
                ],
            },
            {
                // The output size, 1-indexed into the graph's TWO `MpiAnySwitch` banks
                // (`Width_Select` / `Height_Select`, both selected by `Input_Quality`).
                // A declared field emits exactly ONE value into ONE param and `mapTo` is
                // a linear range map, so a resolution can never be one field driving a
                // width node and a height node — the switch bank is the answer, and it
                // is the pattern `Input_Recipe` already uses three nodes away. The banks
                // carry `any_1..any_5` rather than a boolean because MPI-586's Prop Sheet
                // needs FOUR arms off this same shape.
                //
                // Both values are TRUE 8:5 and ÷32-clean — 1280×800 is `FLUX_RATIOS`' 8:5
                // row (corrected this card) and 1792×1120 is `KREA2_RATIOS['2k']`'s, which
                // was exact all along. Krea2's time scales LINEARLY in pixels
                // (`docs/models/krea2/resolution.md`), so 1.96× the pixels is ~2× the wait,
                // not the 4× an attention-cost intuition predicts.
                //
                // 1K is the default: three panels across 1280 is ~426 px of face each —
                // enough to judge the sheet, cheap enough to iterate. 2K is for the keeper.
                id: 'Input_Quality', type: 'radio', label: 'Quality', columns: 2, default: 1,
                options: [
                    { v: 1, label: '1K', note: '1280 × 800',
                      info: 'Baseline. ~426 px per panel — enough to judge pose, wardrobe and face before committing.' },
                    { v: 2, label: '2K', note: '1792 × 1120 · ~2× time',
                      info: '~2× the time for 1.96× the pixels — ~597 px per panel. For the sheet you are keeping.' },
                ],
            },
            {
                // A `toggle` is an icon+label MpiButton (MPI-504), so `icon` is what it
                // shows when there is no room to read the caption. Optional — omit it
                // and the type falls back to a tick.
                id: 'Input_is_Turbo', type: 'toggle', label: 'Turbo', icon: 'bolt',
                default: false,
                // The krea2 accelerator LoRA. OFF by default: a sheet is a keystone
                // asset every later shot inherits, so it is the wrong place to trade
                // fidelity for speed.
            },
            {
                id: 'Input_Remove_Head', type: 'toggle', label: 'Headless front body',
                icon: 'eraser', default: true,
                // ON by default — it is the whole reason this layout works as a video
                // reference. Off is for inspecting the sheet the model actually drew.
            },
            // The `loras` action button that used to sit here is GONE (MPI-608). It opened
            // the rack for the flow's one `settingsModel`, which cannot express a flow with
            // a model per phase. The cogwheel beside each model selector in the slide-over
            // replaces it — same panel, same event, but addressed per phase and visible
            // where the model it belongs to is chosen.
        ],
    },

    // MPI-594 — OUTPAINT. One image in, the same picture back inside a bigger frame.
    //
    // The graph is a Krea 2 EDIT that fills flat colour, and it never learns a rect:
    // the `crop` step composes source + black bars into a single file and that file
    // is what `Input_Image` loads (stepKinds.js § STEP_MEDIA). So there is no mask,
    // no fill input and no box param here — deliberately, and the same reason the
    // History crop tool has no auto-mask (docs/crop.md § The rect is not confined to
    // the image): prompting an edit model to fill "the black area" beats handing it a
    // painted mask.
    //
    // NO PROMPT. `Input_Positive` is baked ("fill the back areas with the rest of the
    // image"), which is the whole instruction — describing new content is a different
    // feature, not an outpaint.
    //
    // NO `result.compare`. The output is a DIFFERENT SHAPE from the input, so a wipe
    // between them compares two framings rather than two versions of one picture. The
    // honest before/after here is the black the step already showed.
    {
        id: 'outpaint',
        title: 'Outpaint',
        preview: 'flow-outpaint.webp',
        video: 'flow-outpaint.mp4',
        description: 'Extend an image past its edges. Choose the shape you want, drag the frame out '
            + 'over the sides you want filled, and Krea 2 paints the new area in. Works best in SMALL '
            + 'steps — a narrow strip on one or two sides comes back seamless, while a big extension '
            + 'leaves the model inventing most of the picture and it shows. To go a long way, run it '
            + 'twice on the result rather than once on the original.',
        // A CHOOSABLE SLOT (MPI-590 mechanism, MPI-594 second user): the two Krea 2 cards
        // are the same architecture with a different bake, and both ship `krea2Edit` plus
        // the identity-edit LoRA this graph loads — so a user holding either one can
        // outpaint, and is never asked for a second 12.25GB download. Both stay listed so a
        // user who has neither picks which one the Install button downloads.
        requiredModels: [{ label: 'Base model', models: ['krea2', 'krea2-nsfw'] }],
        // What differs between the arms, as injection params. The graph is the SFW one,
        // so `krea2` restates its own baked values — cheap, and it keeps the pair readable
        // as a pair rather than "the default plus an override".
        //
        // `Input_Bypass_Filter_Lora.strength_model` is not optional trim: the NSFW twin
        // graph bakes that strength at 0 (`krea2_t2i_nsfw.json` node 245), so leaving it
        // at 1 runs the lustify transformer with the SFW bypass still applied.
        //
        // The UNETLoader was UNTITLED in Fabio's export — titled `Input_Base_Model` in the
        // raw graph 2026-08-21 so the pick has a node to land on. Without the title the
        // dropdown would change the badge and nothing else, which is the exact failure
        // any-of exists to avoid.
        modelParams: {
            'krea2': {
                'Input_Base_Model': 'krea2_raw_int8_convrot.safetensors',
                'Input_Bypass_Filter_Lora.strength_model': 1,
            },
            'krea2-nsfw': {
                'Input_Base_Model': 'lustify-v10-krea-raw-int8_convrot.safetensors',
                'Input_Bypass_Filter_Lora.strength_model': 0,
            },
        },
        operation: 'flowOutpaint',
        workflow: 'flow_outpaint.json',
        mediaType: 'image',
        inputSchema: {
            media: [
                { type: 'image', mode: 'upto', max: 1, roles: ['image1'], labels: ['Image'] },
            ],
        },
        steps: [
            {
                // No `param`: this gizmo's value changes the PICTURE, not a widget —
                // it binds through STEP_MEDIA instead (stepKinds.js).
                kind: 'crop', role: 'image1',
                tickerLabel: 'Frame',
                title: 'Choose the frame you want',
                hint: 'Pick a shape, then drag the frame past the edges — black is what gets painted '
                    + 'in. Keep it modest: small extensions come back seamless.',
            },
        ],
        fields: [
            {
                // Baked `true` in the graph, and kept as the default: an outpaint fills
                // flat colour next to real pixels it can copy from, which is the case
                // the accelerator LoRA costs least on. Off for a keeper.
                id: 'Input_is_Turbo', type: 'toggle', label: 'Turbo', icon: 'bolt',
                default: true,
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

// ── Model slots (MPI-590, generalised MPI-599) ────────────────────────────────
//
// The user's picks, flowId → model ids, at most one per slot. SESSION-ONLY,
// deliberately: a pick that outlived the app would silently run a later sheet on the
// NSFW bake because of a click made days ago — the whole reason option 1 (treat the
// NSFW card as satisfying the SFW one) was rejected.
//
// One ARRAY per flow, not one id: a flow may have SEVERAL choosable slots (the
// scribble flow picks an SDXL checkpoint for its render phase AND an edit model for
// its blend phase), and a single-id store made the second pick overwrite the first.
// The picked id names its own slot — a model appears in one role, never two — so
// nothing has to carry a slot index around.
const _modelChoice = new Map();

/**
 * `requiredModels` as SLOTS: every entry normalised to `{ label, models }`.
 *
 * A slot is one ROLE the flow's graph plays a model in — "Image model", "Edit model" —
 * and its `models` are the interchangeable candidates for that role. A plain string
 * entry is the one-candidate shorthand, which is most flows.
 *
 * `models[0]` is the RECOMMENDED candidate: declaration order is preference order, and
 * it is what an empty install resolves to. The bare-array form MPI-590 shipped is still
 * accepted — it predates labels and reads as the generic "Model" slot.
 *
 * @param {FlowDef} flow
 * @returns {{label: string, models: string[]}[]}
 */
export function flowModelSlots(flow) {
    return (flow?.requiredModels || []).map((entry) => {
        if (typeof entry === 'string') return { label: 'Model', models: [entry], loras: false };
        if (Array.isArray(entry)) return { label: 'Model', models: entry, loras: false };
        return {
            label: entry.label || 'Model',
            models: entry.models || [],
            // OPT-IN, and it must stay opt-in (MPI-608). `flow_ltx_extend` and
            // `flow_ltx_foley` both carry `Input_Lora_1..6` nodes and deliberately declare
            // no rack, so filling every slot that HAS the nodes would silently start
            // injecting the user's LTX LoRAs into two shipped flows.
            loras: entry.loras === true,
        };
    });
}

/**
 * ONE resolved model id per slot — the id that actually runs, and the id every
 * consumer (badge, install keys, required-models list, install progress) must use.
 *
 * Order: the user's pick for this slot, else the first installed candidate, else the
 * recommended one (so a user with NONE of them installed is offered a real default to
 * install rather than an empty row).
 *
 * The pick wins even when it is NOT installed, and that is the point (MPI-599): the
 * picker is how a user chooses what to DOWNLOAD, so a pick that only counted once the
 * weight was on disk could never express "install that one instead". The cost is that
 * picking an uninstalled candidate while another is installed flips the flow to
 * unavailable until it downloads — correct (they asked for it), session-only, and one
 * click back.
 *
 * @param {FlowDef|string} flowOrId
 * @returns {string[]}
 */
export function flowModelIds(flowOrId) {
    const flow = typeof flowOrId === 'string' ? getFlowById(flowOrId) : flowOrId;
    if (!flow) return [];
    const installed = state.s_installedModelIds || [];
    const picks = _modelChoice.get(flow.id) || [];
    return flowModelSlots(flow).map(({ models }) =>
        models.find(id => picks.includes(id))
        || models.find(id => installed.includes(id))
        || models[0]);
}

/**
 * Every slot the user actually gets a say in — more than one candidate — as
 * `{ label, models, recommended }`, in declaration order, for the slide-over to mount
 * one dropdown per entry.
 *
 * Candidates are listed whether or not they are installed (MPI-599). Offering only what
 * is on disk meant a user with NOTHING installed silently got `models[0]`: the flow
 * downloaded the safe default and never mentioned there had been a choice.
 *
 * @param {FlowDef|string} flowOrId
 * @returns {{label: string, models: string[], recommended: string}[]}
 */
export function flowModelChoices(flowOrId) {
    const flow = typeof flowOrId === 'string' ? getFlowById(flowOrId) : flowOrId;
    if (!flow) return [];
    // `index` is the slot's position in `requiredModels`, kept because filtering loses it
    // and the PHASE number is that original index — a cogwheel or a rack keyed off the
    // filtered index would address the wrong phase the moment a single-candidate slot
    // sits before a multi-candidate one (MPI-608).
    return flowModelSlots(flow)
        .map((slot, index) => ({ ...slot, index }))
        .filter(slot => slot.models.length > 1)
        .map(slot => ({ ...slot, recommended: slot.models[0] }));
}

/**
 * Every model phase that carries a USER LoRA RACK, as `{ phase, modelId }`.
 *
 * `phase` is 1-based and matches the graph's `Input_Lora_Phase<N>_<i>` titles; `modelId`
 * is the id that will actually run in that slot, resolved through the any-of set by
 * `flowModelIds` so the rack follows the picked member (MPI-590) rather than whichever
 * id the descriptor happens to list first.
 *
 * This replaced the single `settingsModel` string (MPI-504). One string could only ever
 * name one rack, so a flow choosing a model PER PHASE — scribble-to-object picks an SDXL
 * render model AND a Klein blend model — could never fill both. Keyed by phase and not by
 * model family on purpose: an any-of slot swaps klein-4b for klein-9b without the graph
 * being retitled.
 *
 * @param {FlowDef|string} flowOrId
 * @returns {{phase: number, modelId: string}[]}
 */
export function flowLoraPhases(flowOrId) {
    const flow = typeof flowOrId === 'string' ? getFlowById(flowOrId) : flowOrId;
    if (!flow) return [];
    const resolved = flowModelIds(flow);
    return flowModelSlots(flow)
        .map((slot, i) => ({ phase: i + 1, modelId: resolved[i], loras: slot.loras }))
        .filter(entry => entry.loras && entry.modelId)
        .map(({ phase, modelId }) => ({ phase, modelId }));
}

/**
 * Record the user's pick for this session. Ignored unless the id is a candidate in one
 * of the flow's slots — nothing else can be picked, and a stale id would otherwise
 * shadow the resolution order forever. Replaces any earlier pick in the SAME slot and
 * leaves the other slots' picks alone.
 * @param {string} flowId
 * @param {string} modelId
 */
export function setFlowModel(flowId, modelId) {
    const flow = getFlowById(flowId);
    if (!flow) return;
    const slot = flowModelSlots(flow).find(s => s.models.includes(modelId));
    if (!slot) return;
    const kept = (_modelChoice.get(flowId) || []).filter(id => !slot.models.includes(id));
    _modelChoice.set(flowId, [...kept, modelId]);
}

/**
 * The injection params the RESOLVED models contribute — what makes a pick reach the
 * graph instead of only the badge (MPI-590). Empty for every flow that declares no
 * `modelParams`, which is every flow but Character Sheet.
 * @param {FlowDef|string} flowOrId
 * @returns {Object}
 */
export function flowModelParams(flowOrId) {
    const flow = typeof flowOrId === 'string' ? getFlowById(flowOrId) : flowOrId;
    if (!flow?.modelParams) return {};
    return Object.assign({}, ...flowModelIds(flow).map(id => flow.modelParams[id] || {}));
}

/**
 * Availability = every requiredModel SLOT satisfied AND every requiredDep present.
 *
 * requiredModels are MODEL ids; s_installedModelIds is already partial-aware
 * (populated via isModelUsable, modelRegistry.js) so ≥1-op-installed models count.
 * A slot is an ANY-OF SET (MPI-590), and `flowModelIds` already resolves each slot to
 * an installed member when it has one — so filtering its output IS the any-of test,
 * and `missing` still names ONE id per unsatisfied slot, which is what the install
 * callers need.
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
    const missing = flowModelIds(flow).filter(id => !installed.includes(id));
    const depStatus = _flowDepStatusCache.get(flow.id);
    const missingDeps = flowDepIds(flow).filter(id => depStatus?.get(id) !== true);
    return { available: missing.length === 0 && missingDeps.length === 0, missing, missingDeps };
}
