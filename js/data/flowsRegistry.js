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
 * @property {boolean} [blankOnly] - STEP FIELDS ONLY. The field is DISABLED whenever that step's
 *                               media role is filled, because it only describes what to do when
 *                               there is no source picture. Scribble's canvas size is the case: it
 *                               sizes a BLANK canvas, and an uploaded drawing brings its own size,
 *                               so once a slot is filled the control has nothing to act on. Chosen
 *                               over a general `showWhen` expression (MPI-620) — one boolean with
 *                               one meaning, against a predicate language the frame would then own
 *                               forever. Honoured on `select` today; see `declaredFields.js`.
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
    // MPI-567, REBUILT KLEIN-ONLY 2026-08-25 (MPI-621). One model, one pass: the
    // drawing is composited onto the user's own photo, a crop is taken around it, Klein
    // 9B edits that crop, and the user's box is stitched back. The old architecture —
    // SDXL + ControlNet renders the drawing in isolation, rembg cuts it out, a flat
    // paste lands it in the photo, LanPaint blends the seam — is DELETED. It was six
    // locally-correct steps downstream of one unasked question, and by construction it
    // could never produce interaction: a paste is always on top. Fabio's own live test,
    // same scribble and same photo: the 55-node flow took 38s and left the man standing
    // apart touching nothing; ONE Klein 9B edit took 15s and put his hand on the
    // tiger's back and his leg BEHIND it. Evidence chain and both sizing measurements:
    // tasks/MPI-621/brief.md. Nothing is lost by dropping the SDXL arms — that half
    // becomes the Scribble flow (MPI-620).
    {
        // RENAMED 2026-08-23 (Fabio): "Scribble to Object" -> "Draw It In". "Object" was
        // the broken word — he had been drawing characters, and the old title read as a
        // promise the flow does not make. DISPLAY ONLY: `id`, `operation: 'flowScribObj'`
        // and `workflow: 'flow_draw_it_in.json'` all deliberately stay, because
        // cards already in users' galleries carry the `FLOWSCRIBOBJ_` prefix and their
        // sidecars' `flowId`, so renaming the id breaks reuse on every existing item.
        // The Klein-only rebuild changes none of that either — same op key, same file.
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
        // Built from run 015 of Fabio's own live session on the OLD route. The art still
        // holds — it shows a drawing becoming a figure in a photo, which is what the
        // flow still does — so the rebuild does not invalidate it.
        preview: 'flow-draw-it-in.webp',
        video: 'flow-draw-it-in.mp4',
        // Two sentences on purpose. The second is CRAFT guidance rather than a
        // description of the flow, and it lives here because `description` is the
        // only copy the inputs slide renders — `_buildInputsSlide` builds the
        // explainer as a single `<p>` off this field, and MpiBaseFlow.js is another
        // card's file. Fabio asked for it on the first stage specifically: the point
        // has to land BEFORE the drawing, not in the paint step's hint where the user
        // has already committed to a shape. The hero demonstrates exactly this
        // contrast — beat 1 is a filled blob, beat 2 a drawn outline.
        description: 'Draw what you want on top of your own photo, describe it, and the flow paints it into the scene — a person, an animal, an object — matching the light, casting a shadow on the ground, and letting whatever is already in front of it overlap its edges. The better you draw it, the more detail carries through: an outline with a pose and a tail gives the model far more to work with than a filled blob, and the less you have to fight the prompt to get what you meant.',
        // ONE slot now, where the old route picked a render model AND a blend model.
        //
        // 9B ONLY, and it is a CORRECTNESS call rather than a quality preference. Under
        // style load 4B LEFT THE USER'S OWN INK IN THE OUTPUT — the drawn leash and head
        // survived as a grey mechanical object while the tiger was corrupted into a
        // cartoon dog. 9B under the same load degraded gracefully: scribble gone,
        // composition intact. 4B follows the drawn shape more closely and integrates
        // worse, which is the same axis the deleted "Follow the drawing" slider rode,
        // reappearing as a model choice — and its failure mode is the worst one
        // available. Cost accepted: a 4B-only user now downloads 9B, offset by the SDXL
        // checkpoint this flow no longer needs at all.
        //
        // LoRA RACK ADDED 2026-08-26 (MPI-620), reversing the decision recorded here
        // before it. The rack is `Input_Lora_Phase1_1..6` (`MpiLoraModel`, model-only —
        // `klein-9b` declares `loraStrengths: ['model']` and there is no CLIP side),
        // spliced between `Input_Edit_Model` and the `CFGGuider`.
        //
        // WHAT THE OLD DECISION GOT RIGHT, AND IT IS STILL TRUE: a style LoRA restyles
        // the WHOLE photograph, not just the inserted subject, and a styled 9B run did
        // exactly that. That is a real hazard HERE in a way it is not on Scribble, which
        // has no photograph to protect. The rack is opt-in — a user who picks no LoRA
        // gets the previous behaviour byte for byte — so the hazard is now the user's to
        // choose rather than one the flow forbids on their behalf (Fabio's call: both
        // flows should benefit from the rack).
        //
        // Still true and NOT re-litigated by this: an SDXL, Pony or Flux1 character LoRA
        // will not load on Klein at all, so the rack cannot carry identity across.
        // Identity by REFERENCE IMAGE remains the route, and remains a later card.
        //
        // 9B ONLY, deliberately — see the paragraph above on 4B integrating worse. Adding
        // 4B was raised on 2026-08-26 and applies to SCRIBBLE, not here.
        requiredModels: [
            { label: 'Edit model', models: ['klein-9b'], loras: true },
        ],
        // The graph bakes exactly this pair, and the arm restates it anyway: a re-export
        // that quietly moves a default is caught here rather than in a live run.
        //
        // THE CLIP ARM IS NOT OPTIONAL TRIM. Klein 9B needs `qwen_3_8b_int8_convrot`;
        // pairing it with 4B's encoder dies with a shape error that reads as a sampler
        // bug and is not one (MPI-600). The text encoder moves WITH the checkpoint.
        //
        // `Input_Edit_Clip.clip_name` uses the dotted `Title.widget` form (MPI-359)
        // while `Input_Edit_Model` is plain, and that asymmetry is load-bearing rather
        // than untidy: `unet_name` is on `comfyController._inject`'s spray list and
        // `clip_name` is NOT, so a plain `Input_Edit_Clip` would match the node and
        // silently write nothing.
        modelParams: {
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
            // blob into something nobody asked for (MPI-567, 2026-08-23). Declare
            // prompts BELOW.
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
        // the boxed region changed — so the reveal bar crosses a steady scene.
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
                // NO SIZE FLOOR ANY MORE, and dropping it was measured rather than
                // assumed (MPI-621). The old "~96px tall" came from ControlNet: stage 1
                // upscaled a starved control hint, so a small drawing had too little ink
                // to read. There is no ControlNet here, and the crop is sized FROM the
                // drawing and normalised to ~1MP, so it manufactures the resolution — a
                // 75px scribble with 3px strokes rendered a grounded figure with contact
                // shading. What matters instead is that the strokes say where, how big
                // and what pose, which is what this copy now asks for.
                hint: 'Draw roughly where it goes, how big it is and what pose it holds, then say what it is — the drawing gives the placement, the words give the subject. It does not need to be large: the flow crops in around whatever you draw.',
            },
            {
                // The return region. `param: 'box1'` -> `Input_Box` through the box
                // injector (an MpiBox carries four widgets, which the generic title
                // injector would match and silently not write). No `ratio`: this box
                // wraps a subject AND the ground its shadow falls on, which is not
                // square. `overflow: 'allow'` because both consumers clip — MpiBoxMask
                // clamps to the image and the crop takes the clamped mask — and a
                // subject near an edge otherwise cannot be given room below it.
                kind: 'box', role: 'image1', param: 'box1', overflow: 'allow',
                tickerLabel: 'Blend area',
                title: 'Box the area to blend',
                // Asks for ROOM, never light direction — the model reads the scene's own
                // light, and telling it where the light is makes it worse
                // (blending-into-a-photo.md). MEASURED FLOOR (MPI-621): the model renders
                // the subject AROUND and BEYOND the drawing, not inside it, so a box
                // stitched at the drawn bbox cut a hard vertical line through the man's
                // torso; 1.6x the drawing was enough and 2.2x had margin. Shadow room is
                // ON TOP of that floor and is scene-dependent — a low sun casts a long
                // shadow — which is exactly why the user draws this and the graph does
                // not derive it.
                //
                // The "keep it tight" half has a SECOND reason now: the context crop is
                // sized from the drawing but can never be smaller than this box, so a
                // very large box under-anchors the render and the subject comes back
                // bigger than it was drawn.
                hint: 'Include the subject plus room on the ground for its shadow — it is rendered around your drawing, not inside it, so a box drawn tight to the strokes will slice it. Keep it close otherwise: everything inside gets re-rendered, and a very large box makes the subject come back bigger than you drew it.',
            },
        ],
        // NO `fields`. Both of the old ones were ControlNet knobs and the graph no
        // longer carries a ControlNet: "Drawing type" chose between the scribble and
        // canny preprocessor banks, and "Follow the drawing" set the control strength.
        // Their axis did not disappear, it became the model choice — see the 4B note
        // above. Do not reintroduce a strength slider here; there is nothing to steer.
    },
    {
        // MPI-620 — "Scribble". Draw on a blank canvas (or bring a drawing made
        // elsewhere) and SDXL renders it. This is the SDXL + ControlNet render half that
        // MPI-621 deleted from Draw It In when that flow was rebuilt Klein-only, rehoused
        // as a flow in its own right — it was always a general-purpose scribble-to-image
        // engine wearing a photo-insertion costume.
        //
        // The id is `scribble` and the op is `flowScribble`, deliberately NOT reusing
        // `scribble-object` / `flowScribObj`. Those still belong to Draw It In: the op key
        // was kept when that flow was renamed because its gallery cards carry the
        // `FLOWSCRIBOBJ_` prefix and their sidecars' `flowId`, so it can never be freed.
        id: 'scribble',
        title: 'Scribble',
        // The hero dissolves the drawing away in place — its white ground lifts first, so
        // the render appears behind the strokes, then the strokes lift too — and the TILE is
        // that mid-dissolve instant, a real frame of the clip rather than a separate
        // composition. So the poster never cuts to a different picture when the clip starts.
        // Plates are one real run: `imported_002.png`'s sha256 IS the `.preview-assets`
        // input both `kleinEdit_011` (anime) and `kleinEdit_012` (photoreal) ate.
        preview: 'flow-scribble.webp',
        video: 'flow-scribble.mp4',
        description: 'Draw something and let the model render it. Start from a blank canvas at the shape you want, or bring in a drawing you made elsewhere, then say what it is — the drawing gives the shapes and the composition, the words give the subject and the style. It does not have to be a good drawing: rough placement and a readable silhouette are enough for the model to build a finished image around.',
        // EDIT MODELS, NOT SDXL + ControlNet — Fabio's call on 2026-08-26 after a live
        // side-by-side on one drawing, and it retires SDXL scribble-to-image from the
        // product. A deliberate call, not drift: this card EXISTED to rehouse the SDXL
        // half MPI-621 deleted from Draw It In, and the comparison beat it.
        //
        // Same drawing, same prompt, only the model path differing: the SDXL arm rendered
        // the drawn strokes as physical white road barriers and put the sea on the wrong
        // side, because both ControlNet arms are monochrome LINE DETECTORS — Scribble and
        // Canny discard colour, so a blue fill contributes an outline indistinguishable
        // from a red terrain stroke and carries no "sea goes here" signal. Klein reads
        // actual RGB and placed it correctly on the first run.
        //
        // KREA 2 AND BOOGU WERE BOTH TRIED AND BOTH DROPPED, so do not re-add either
        // without a fresh sweep. Krea 2 rendered the drawn pink dashes as real pink road
        // paint and survived three prompt reframings — its `Krea2EditModelPatch` ships
        // `ref_boost 2`, which biases the whole reference against the instruction, i.e.
        // "keep what is in the picture", the exact opposite of what this flow asks for.
        // Boogu passed on the winning prefix but Klein beat it on both quality and speed
        // (14-27s against 38-39s), and Boogu would have forced a second sampler chain into
        // this graph behind a switch: a flow op resolves as a UNIVERSAL workflow — ONE
        // file, resolved before any model lookup — and Boogu is `ModelSamplingAuraFlow` +
        // `SamplerCustom` where Klein is `Flux2Scheduler` + `CFGGuider`.
        //
        // 9B FIRST because `models[0]` is the recommendation, matching Draw It In. Both
        // tiers are one architecture, so ONE graph drives them and `modelParams` below is
        // the only thing that differs.
        //
        // `loras: true` — CONFIRMED LIVE, not assumed. An Anime style LoRA at 1.00 drove
        // the entire look with the prompt saying nothing about style, and naming the style
        // in the prompt worked too. That measurement is also why this flow has no `style`
        // select: a LoRA already does it better than a dropdown would. It rides on the SLOT
        // rather than a flow-level `settingsModel` so the rack follows the card the user
        // picked.
        requiredModels: [
            {
                label: 'Edit model',
                models: ['klein-9b', 'klein-4b'],
                loras: true,
            },
        ],
        // What differs between the tiers, and it is the ONLY thing that does.
        //
        // THE CLIP ARM IS NOT OPTIONAL TRIM: 9B needs `qwen_3_8b_int8_convrot` and 4B
        // needs `qwen_3_4b`, and pairing 9B with 4B's encoder dies with a shape error that
        // reads as a model bug and is not one (MPI-600). The text encoder moves WITH the
        // checkpoint or the arm is broken on arrival.
        //
        // `Input_Edit_Clip.clip_name` uses the dotted `Title.widget` form (MPI-359) while
        // `Input_Edit_Model` is plain, and that asymmetry is load-bearing rather than
        // untidy: `unet_name` is on `comfyController._inject`'s spray list and `clip_name`
        // is NOT, so a plain `Input_Edit_Clip` would match the node and silently write
        // nothing.
        modelParams: {
            'klein-9b': {
                'Input_Edit_Model': 'flux-2-klein-9b-int8-convrot.safetensors',
                'Input_Edit_Clip.clip_name': 'qwen_3_8b_int8_convrot.safetensors',
            },
            'klein-4b': {
                'Input_Edit_Model': 'flux-2-klein-4b-int8-convrot.safetensors',
                'Input_Edit_Clip.clip_name': 'qwen_3_4b.safetensors',
            },
        },
        operation: 'flowScribble',
        workflow: 'flow_scribble.json',
        mediaType: 'image',
        inputSchema: {
            // ONE slot, and `mode: 'upto'` makes it genuinely optional (Fabio,
            // 2026-08-26): the user either draws on a blank canvas in the next step or
            // brings a drawing made in Photoshop. Whichever happens, the paint gizmo
            // hands the run a single composited image, so there is no second slot.
            media: [
                {
                    type: 'image', mode: 'upto', max: 1,
                    roles: ['image1'],
                    labels: ['Drawing (optional)'],
                },
            ],
        },
        // NO `result.compare`. The reveal bar wants a steady BEFORE the output can be
        // read against, and this flow has none: with no upload there is literally no
        // before, and with one the before is a line drawing and the after a finished
        // render, which share no pixels for the bar to travel across.
        steps: [
            {
                // `role: 'image1'` with NO `mediaRole` — the composite REPLACES the
                // drawing it was composited from, which is `crop`'s semantics rather than
                // the `paint` semantics Draw It In uses. That flow needs the photo AND the
                // drawing as two separate graph inputs so it can flatten them itself; this
                // graph has one image input and wants it already opaque.
                // `composite: true` — the run gets the FLATTENED picture (strokes over
                // the upload, or over flat white when there is none), not the bare RGBA
                // layer. This graph has ONE image input and reads its RGB as the
                // ControlNet hint, so a layer would arrive with undefined colour
                // wherever alpha is 0 (stepKinds.js § STEP_MEDIA).
                // `fieldsSide` — the prompt and the canvas-size picker sit in a column
                // BESIDE the drawing rather than under it. Someone drawing a whole figure
                // needs the canvas, and stacked those two controls cost ~150px of exactly
                // the vertical the drawing wants (Fabio, 2026-08-26).
                kind: 'paint', role: 'image1', composite: true, fieldsSide: true,
                tickerLabel: 'Draw it',
                title: 'Draw what you want',
                fields: [
                    {
                        // DECLARED HERE AND NOWHERE ELSE. Restating it in the flow's own
                        // `fields` so it is also editable on the run slide silently drops
                        // edits from the second run onward — a gizmo step's fields are
                        // role-keyed in `_stepValues[role].fields` while flow fields live
                        // in `_fieldValues`, and `_collectInputs` applies the flow store
                        // LAST. See the long note on Draw It In's prompt above.
                        id: 'positive', type: 'text', rows: 2, label: 'What is it?',
                        placeholder: 'A knight on a cliff at sunset, a red sports car, a treehouse…',
                    },
                    {
                        // THE CANVAS SIZE, and it is read by the GIZMO rather than sent to
                        // the graph — hence a bare id, not an `Input_` one. The graph
                        // derives its own dimensions (`GetImageSize` off the scaled input
                        // drives `EmptyLatentImage`), so this never becomes an injection
                        // param; it exists to seed the blank canvas the user draws on.
                        //
                        // Declared on THIS step on purpose. A step's own fields are seeded
                        // into `_stepValues[role].fields` at SETUP and handed to the gizmo
                        // as `props.value` AT MOUNT, which is the only place a value is
                        // readable before the gizmo's first report. A flow-level field
                        // would NOT be — mount props are `{ media, step, value, onChange }`
                        // and `_fieldValues` is not among them.
                        //
                        // The values are SDXL-native buckets. Off-bucket dimensions are
                        // what make an SDXL render go soft or grow a second head, and since
                        // the drawing's size becomes the output's size, picking here is
                        // picking the output resolution.
                        //
                        // It renders even when the user HAS uploaded a drawing, because
                        // the frame has no conditional-field support. That is answered with
                        // copy rather than a `showWhen` in the field vocabulary — a real
                        // feature with real blast radius for one control.
                        //
                        // `blankOnly` DISABLES it once the drawing slot is filled. It used
                        // to render live-but-inert in that case — the frame has no
                        // conditional-field support, and the cost was accepted with a note
                        // instead. Fabio hit it in a live run and rejected it on the same
                        // grounds he rejected the reshape guard: a control that moves and
                        // does nothing is worse than either real behaviour. Disabled, the
                        // note below reads as the REASON rather than as fine print.
                        id: 'canvasSize', type: 'select', label: 'Canvas size',
                        default: '1024x1024', blankOnly: true,
                        note: 'Sets the size of a blank canvas. A drawing you add keeps its own size.',
                        options: [
                            { v: '1024x1024', label: 'Square', info: '1024 x 1024' },
                            { v: '896x1152', label: 'Portrait', info: '896 x 1152' },
                            { v: '1152x896', label: 'Landscape', info: '1152 x 896' },
                            { v: '768x1344', label: 'Tall', info: '768 x 1344' },
                            { v: '1344x768', label: 'Wide', info: '1344 x 768' },
                        ],
                    },
                ],
                hint: 'Rough is fine — the drawing carries placement, scale and silhouette, and the words carry the rest. Colour matters: the model reads what you paint, so a blue patch reads as water and a green one as vegetation. Nothing you draw survives into the result, so scribble freely.',
            },
        ],
        // NO FLOW-LEVEL FIELDS. Both that lived here — the `Input_Control_Net` drawing-type
        // radio and the `Input_Control_strength` "Follow the drawing" slider — died with the
        // ControlNet when this flow moved to edit models. An edit model reads the drawing's
        // actual RGB rather than a preprocessed monochrome hint, so there is no arm to pick
        // and no strength to trade off; the only knob that ever mattered is the wording, and
        // that is the `positive` field on the paint step.
        //
        // The prompt PREFIX is baked in an `MpiText` node in the graph, not declared here,
        // so the user types only the subject. Settled live on 2026-08-26 after three
        // reframings, and the two things it must not lose are why it reads the way it does:
        // it says REPLACE rather than "change the drawing" (asking a model to *change* a
        // drawing licenses it to keep part of one — that is what left strokes in the
        // output), and it names NO output medium (an earlier version said "photorealistic
        // photograph", which would have made anime unreachable from a baked prefix).
        //
        //   Replace this sketch with a fully rendered image of the same scene. The sketch
        //   is a layout guide only: no drawn line, outline or patch of flat colour survives
        //   into the final image. The finished image shows
        //
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
        // ONE SLOT AGAIN (MPI-628). MPI-610 gave this flow a second choosable slot for the
        // head-removal phase, which was a Klein edit pass — a whole second checkpoint plus
        // its own CLIP and VAE, loaded mid-run to paint studio grey. The head mask already
        // existed, so the graph now SUBTRACTS the head from a BiRefNet subject matte and
        // composites the sheet onto a flat #808080 plate instead. No second model, no
        // sampler pass. BiRefNet and SAM3 are both `engineAsset: true` — they install with
        // the engine, so neither is a flow requirement and neither belongs here.
        requiredModels: [
            // `loras: true` — the graph carries a user LoRA rack, so the user's own LoRAs
            // ride along: the LoRA carries identity, the sheet carries the layout, and
            // someone who has already trained a character describes only the wardrobe and
            // face on top (Fabio, MPI-504). Declared on the SLOT rather than as a
            // flow-level `settingsModel`, so the rack follows whichever member of the
            // any-of set is running — the NSFW arm opens the NSFW rack (MPI-590) — and so a
            // flow with more than one model phase can give each of them one (MPI-608).
            { label: 'Render model', models: ['krea2', 'krea2-nsfw'], loras: true },
        ],
        // What differs between the arms, as injection params. The graph is the SFW one,
        // so that arm restates its own baked values — cheap, and it keeps each pair
        // readable as a pair instead of "the default plus an override".
        //
        // `Input_Bypass_Filter_Lora` is not optional trim: the NSFW twin workflow bakes
        // that strength at 0 (krea2_t2i_nsfw.json node 245), so leaving it at 1 runs the
        // lustify transformer with the SFW bypass still applied.
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
    // MPI-607 — Voice Changer, the FIRST audio-only flow: audio in, audio out, no
    // picture anywhere in the run. `mediaType: 'audio'` is what routes the graph's
    // `Output_Audio` to a real gallery card instead of a video's soundtrack
    // side-channel (MPI-573 built that half; this is its first consumer).
    //
    // NO MODEL, but nine-tenths of a gigabyte of weights — so `requiredModels: []`
    // with everything in `requiredDeps`, the head-swap shape. Chatterbox is a FLOW
    // WITH DEPS, deliberately not a ModelDef (which would force dead fields and an
    // entry in the model picker) and not a Plugin (which by its own definition is
    // not a tile in the Flow Library).
    //
    // Only the VC half is declared. The five TTS weight ids in assetDeps
    // (`chatterbox-ve` / `-t3` / `-s3gen` / `-tokenizer` / `-conds`, 4.25GB) belong
    // to Flow B and stay unowned until it lands — declaring them here would make
    // every Voice Changer user download a text-to-speech model they never run.
    //
    // THE WEIGHT DEPS ARE `targetPath` AND MUST STAY THAT WAY. The pack computes
    // `<ComfyUI>/models/chatterbox/` from its own `__file__` and never reads
    // extra_model_paths.yaml, so a weight filed under mpi_models/ is simply absent
    // and `hf_hub_download` fetches it again — outside the download manager, with no
    // progress, no sha check, no GC, on every engine reinstall. Same class as RIFE
    // (MPI-222).
    {
        id: 'voice-changer',
        title: 'Voice Changer',
        // Both drawn from ONE real run of this flow (MPI-622): the performance, the
        // target sample and the result, all off disk. The flow changes nothing you
        // can see and the hero is muted, so a before/after would be two identical
        // panels — the device animates the channel that changed instead. The
        // performance draws in frost, then a sweep re-colours it to the TARGET
        // lane's heat while the silhouette holds, because it measurably does hold:
        // envelope Pearson r = 0.867 between take and result, against -0.004 for
        // the target voice. Timing survives, timbre does not — which is the flow.
        // The tile is the same two takes stacked, YOU over THEM, since a 4/5 crop
        // of the hero would throw a whole lane away.
        preview: 'flow-voice-changer.webp',
        video: 'flow-voice-changer.mp4',
        description: 'Say it in someone else’s voice. Record yourself performing a line, pick the voice you want it in, and Chatterbox keeps every bit of your delivery — timing, breath, even a laugh or a cough — while swapping the voice itself.',
        requiredModels: [],
        // `ComfyUI-MpiNodes` is deliberately NOT declared, even though the graph runs
        // MpiLoadAudio and MpiInt. `requiredDeps` means "flow-only weights/nodes that
        // NO MODEL requires" — every model in the registry declares MpiNodes, so
        // listing it here does not describe this flow, and the cost is real: a flow's
        // deps are protected UNCONDITIONALLY in `_localSharedDepsMap` (a flow is
        // always "present", unlike a model), so declaring a dep the whole registry
        // shares pins it for every uninstall and breaks the MPI-258 B1 invariant that
        // a tier family with neither transformer installed stays deletable. It
        // reaches the engine anyway: `getUniversalWorkflowDepIds()` returns EVERY
        // `type: 'custom_nodes'` dep, and the boot gate installs and drift-repairs
        // that whole set independently of any model or flow.
        requiredDeps: [
            'chatterbox-vc-s3gen',          // 1008.20MB — the VC generator
            'chatterbox-vc-conds',          // 104.86KB — its conditionals
            // The one node pack that IS flow-only — no model declares it. Same
            // reasoning as head-swap declaring comfyui-inpaint-cropandstitch.
            'ComfyUI_Fill-ChatterBox',      // FL_ChatterboxVC
        ],
        operation: 'flowVoiceChanger',
        workflow: 'flow_voice_changer.json',
        mediaType: 'audio',
        inputSchema: {
            media: [
                // ONE group, two roles, index-aligned labels — the head-swap shape.
                // Which clip plays which part is the whole of this flow, so neither
                // slot can be left to the frame's "Audio 1 / Audio 2" fallback.
                {
                    type: 'audio', mode: 'upto', max: 2,
                    roles: ['audio1', 'audio2'],
                    labels: ['Your performance', 'Target voice'],
                    // The shipped voice library, offered as a third source inside the
                    // media picker on the "Target voice" slot only (MPI-622). Index-aligned
                    // with roles/labels, and `null` on slot 0 deliberately: "Your
                    // performance" is the one thing that has to be the user's own take, and
                    // a stock voice there would just convert one library voice into another.
                    // The value is the picker ROUTE, so the play button previews the raw
                    // sample — the actual file handed to `target_voice` — rather than a
                    // generated audition of a conversion that has not happened yet.
                    voiceLibrary: [null, 'character'],
                },
            ],
        },
        // No `result.compare`: the shared before/after surface is a draggable reveal
        // bar over two images, and there is nothing to reveal between two waveforms.
        //
        // No `fields` and no `steps` either. The seed is filled by `_buildParams`
        // from the run's own seed (the `Input_Seed` MpiInt convention), and the two
        // knobs FL_ChatterboxVC does expose — `use_cpu`, `keep_model_loaded` — are
        // engine plumbing, not choices a user should be making. What DOES decide the
        // result is how the performance is recorded, and that guidance is measured,
        // not tunable: perform but do not push; pick a target that sounds nothing
        // like you (similar voices make the conversion nearly inaudible, which is
        // what an "it did nothing" report usually is); meet the target's pitch; hold
        // that pitch steady, because drift within a take drifts the output. Rules 2
        // and 3 only look contradictory — distance in TIMBRE is what makes the
        // conversion audible, distance in PITCH is what you compensate for.
    },
    // MPI-596 — "Object Stamp". Take an object out of one photo and put it into
    // another. Draw It In's architecture with the scribble swapped for a real object:
    // the object is composited onto the user's scene, a crop is taken around it, Klein
    // 9B edits that crop, and the boxed region is stitched back.
    //
    // ONE GRAPH, TWO MODES, and the mode is a real fork in the wiring rather than a
    // prompt change. Three `MpiAnySwitch` nodes read `Input_Mode`:
    //   Auto   — reference 1 is the clean scene cropped to the region, reference 2 is
    //            the STAMPED COMPOSITE. The object keeps its own pixels, so identity is
    //            free and the model spends no words on it.
    //   Manual — reference 2 is the CLEAN OBJECT at full frame and nothing is stamped.
    //            Buys a viewpoint the object's source photo cannot give, and pays for it
    //            in exact identity: the model has no 3D model of that object and
    //            synthesises a generic one. A live run returned a beautifully lit pistol
    //            that was not the user's. Auto is the default for exactly this reason.
    //
    // TWO REFERENCES, NEVER THREE — the documented identity-mixing limit, and three is
    // what made the model draw two guns. Both baked prompts say "image two into the
    // scene of image one", so REFERENCE ORDER IS SEMANTIC: reference 1 is always the
    // scene, reference 2 always whatever carries the object.
    //
    // Both modes proven end to end on the bench 2026-08-27 (26.1s each on a 4060 Ti),
    // and the unified graph is pixel-identical to the two separate graphs it replaced.
    {
        id: 'object-stamp',
        title: 'Object Stamp',
        // NO `preview` / `video` — the art does not exist yet, and ABSENT is the correct
        // state while it is missing. Both fields are optional and every consumer guards
        // them (`MpiFlowLibrary.js` ~333, `MpiTileSheet.js` ~137). Draw It In declared
        // this pair before the files were made, the tile 404'd, and because
        // `tests/desktop/flows-tab-ring.spec.js` asserts `consoleErrors` is empty in
        // three places that held master's CI RED for a day and eight pushes. Run
        // `/mpi-flow-graphics` first, then add the names.
        description: 'Take an object out of one photo and put it into another — a mug on your desk, a lamp in your living room, a bag on a chair. The object keeps its own shape and markings, and the flow lights it with the scene it lands in, resting it on the surface it touches and giving it a shadow that matches the ones already there. You clean the object up first, then say where it goes.',
        // ONE slot, 9B only. 4B was tested and FAILED (Fabio, 2026-08-26) — the same
        // call Draw It In made, for the same reason: under load 4B follows the source
        // shape more closely and integrates worse.
        //
        // `loras: true` rides on the slot, so the rack follows the card the user picked.
        // The Draw It In hazard applies here in full: a style LoRA restyles the WHOLE
        // photograph, not just the inserted object. Opt-in, so it is the user's to
        // choose rather than one the flow forbids on their behalf.
        requiredModels: [
            { label: 'Edit model', models: ['klein-9b'], loras: true },
        ],
        // THE CLIP ARM IS NOT OPTIONAL TRIM. Klein 9B needs `qwen_3_8b_int8_convrot`;
        // pairing it with 4B's encoder dies with a shape error that reads as a sampler
        // bug and is not one (MPI-600). The text encoder moves WITH the checkpoint.
        //
        // `Input_Edit_Clip.clip_name` uses the dotted `Title.widget` form (MPI-359)
        // while `Input_Edit_Model` stays plain, and that asymmetry is load-bearing:
        // `unet_name` is on `comfyController._inject`'s spray list and `clip_name` is
        // NOT, so a plain `Input_Edit_Clip` would match the node and write nothing.
        modelParams: {
            'klein-9b': {
                'Input_Edit_Model': 'flux-2-klein-9b-int8-convrot.safetensors',
                'Input_Edit_Clip.clip_name': 'qwen_3_8b_int8_convrot.safetensors',
            },
        },
        operation: 'flowObjectStamp',
        workflow: 'flow_object_stamp.json',
        mediaType: 'image',
        inputSchema: {
            // TWO user slots, unlike Draw It In where `image2` is derived and never
            // offered. Here the object IS an upload — it is the whole point — and the
            // labels carry which image plays which part, because the frame otherwise
            // falls back to "Image 1 / Image 2".
            //
            // `image2` is then REWRITTEN twice on the way to the run: the `cutout` step
            // replaces it with the cleaned object, and in Auto the `place` step
            // overwrites that with the stamped layer via `mediaRole`.
            media: [
                {
                    type: 'image', mode: 'upto', max: 2,
                    roles: ['image1', 'image2'],
                    labels: ['Scene', 'Object'],
                },
            ],
        },
        // The BEFORE is the user's own scene, and the flow's whole claim is that only
        // the boxed region changed — so the reveal bar crosses a steady picture.
        result: { compare: 'image1' },
        // STEP ORDER IS LOAD-BEARING AND IT FAILS SILENTLY. `_deriveRunMedia` walks
        // these in DECLARATION order, and `place` stamps whatever sits in `sourceRole`
        // at the moment it runs. Declare `cutout` second and stage 3 stamps the UNCUT
        // object — background and all — and the run still completes and still returns a
        // picture. There is no error to catch this; only the order.
        steps: [
            {
                // Stage 2, on the OBJECT. No gizmo, so no `param` and no `mediaRole` —
                // it replaces its own role's file.
                //
                // SKIPPABLE BY CONSTRUCTION, with no flag: untouched, `composeCutObject`
                // returns null, the frame reads a null as "this kind changed nothing",
                // and `image2` reaches the run byte-identical instead of being
                // re-encoded through a canvas for nothing. So a PNG that arrived already
                // cut out costs nothing here.
                kind: 'cutout', role: 'image2',
                tickerLabel: 'Cut it out',
                title: 'Clean up the object',
                // The brush works with Remove Background OFF, which is not a detail: for
                // sources BiRefNet whiffs entirely it is the only way to cut. The two
                // mask layers are never flattened, so toggling the background off and on
                // preserves erasures.
                hint: [
                    'Remove the background, then erase whatever it left behind. Restore paints pixels back.',
                    'Already cut out on transparency? Skip this step.',
                ],
            },
            {
                // Stage 3, on the SCENE, placing the OBJECT — the one kind that reads two
                // roles. `sourceRole` names what it stamps; `mediaRole` sends the result
                // to `image2` rather than replacing the scene.
                //
                // In MANUAL this derives NOTHING: the clean object is already `image2`,
                // put there by the cutout stage, so deriving would hand the run a second
                // copy of a picture it has. Manual contributes only the region and the
                // mode.
                kind: 'place', role: 'image1', sourceRole: 'image2', mediaRole: 'image2',
                // An OBJECT `param`, not a string — this kind feeds two nodes. `region`
                // goes to `Input_Box` through the box injector (an MpiBox carries four
                // widgets the generic title injector would match and silently not
                // write), and `mode` to `Input_Mode`, the `MpiAnySwitch` selector that
                // picks the crop source, reference 2 and the baked instruction. Lose
                // `mode` and a Manual run silently gets Auto's wiring and still renders.
                param: { region: 'box1', mode: 'Input_Mode' },
                tickerLabel: 'Place it',
                title: 'Put it where you want it',
                // DECLARED HERE AND NOWHERE ELSE. Restating it in the flow's own `fields`
                // so it is also editable on the run slide SILENTLY DROPS EDITS from the
                // second run onward: a gizmo step's fields are role-keyed in
                // `_stepValues[role].fields` while flow fields live in `_fieldValues`,
                // and `_collectInputs` applies the flow store LAST (MPI-620).
                //
                // Optional and empty by default — unlike Draw It In, where the drawing is
                // a silhouette and the words are the only thing naming the subject. Here
                // the object names itself. This is the escape hatch for what the flow
                // cannot know and the user can see: pose in Manual, and scene-specific
                // lighting in either mode.
                fields: [
                    {
                        id: 'positive', type: 'text', rows: 2, label: 'Anything to add?',
                        // PLACEHOLDER COPY IS LOAD-BEARING — it is where the user learns
                        // the Manual move. Describing a pose is what buys the viewpoint.
                        // LIGHTING FIRST, because that is the half that works in BOTH modes:
                        // the field is live in Auto too (node 18 concatenates Input_Positive onto
                        // whichever instruction the switch picked), and scene-specific light is
                        // the one thing a baked prompt can never name. The POSE example is second
                        // and marked, because a pose only buys anything in Manual - in Auto the
                        // stamp already pins the viewpoint and asking for another fights it.
                        placeholder: 'e.g. "warm sunlight from the left window" - or, in Manual, "lying flat on its side, seen from above"',
                    },
                ],
                // Says what each mode COSTS, because the trade is not visible until the
                // result comes back. Auto is default; Manual is the escape hatch.
                // ALT-DRAG IS NAMED HERE BECAUSE NOTHING ELSE NAMES IT (Fabio, 2026-08-27).
                // The gesture is ALT + drag a HANDLE (`MpiStepPlace` mousedown: it needs a
                // `shape.hitTest` hit, so a bare ALT-drag on the canvas does nothing), and it
                // is AUTO-ONLY — Manual's box is a region, and swinging it would say the model
                // reads it at an angle, so ALT is ignored there. An undiscoverable gesture is
                // the same failure as an inert control: the user never finds it and the flow
                // looks like it cannot do the thing it can.
                // MODE-KEYED, because half of this used to be wrong wherever it was read:
                // the Manual redraw trade-off showed while the user sat in Auto, where
                // none of it applies, and ALT-rotate showed in Manual, which has no
                // rotation at all (Fabio, 2026-08-27). `base` is what is true in both.
                // NO `base`, because the two modes share almost nothing on screen: Auto
                // shows the OBJECT and Manual shows only a REGION. The old shared lines said
                // "drag the object where it should sit" in Manual, where there is no object
                // to drag, and told Auto to leave room on the ground for a shadow — which is
                // self-defeating, since Auto's box IS the object and growing it just makes
                // the object bigger. The shadow margin is not the user's job at all: the
                // graph grows the write-back ~30% off the box side (law 8, node 225).
                //
                // Kept SHORT on purpose. The mode radio already carries a tooltip explaining
                // what each mode does, so repeating it here is a wall the user scrolls past
                // (Fabio, 2026-08-27, twice).
                hint: {
                    auto: [
                        'Drag and scale the object to where it should sit.',
                        'ALT + drag a corner rotates it. Shift keeps its proportions.',
                    ],
                    manual: [
                        'The model only sees what is inside the box. Put it where the object should go, with a little room around it.',
                        'Describe the object and the angle you want in the box above.',
                    ],
                },
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
