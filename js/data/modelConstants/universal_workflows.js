// ── Universal Workflows (not model-tied) ──────────────────────────────────────
// Available regardless of which model is active.
// Keys must match commandRegistry entries marked universal: true.
//
// Dependencies for universal workflows are the universal DEPS set (dependencies.js):
// every type:'custom_nodes' node + every engineAsset:true weight (MPI-222). They are
// installed automatically with the engine and are never tracked per-workflow.

/**
 * @typedef {Object} UniversalWorkflowDef
 * @property {string} workflow - Workflow filename in comfy_workflows/
 * @property {Record<string, string>} [byModel] - MPI-591. For a Flow whose picked model selects
 *   a DIFFERENT GRAPH rather than different params inside one. Keyed by model id; a run whose
 *   `flowModelIds` names one of these gets that file, and anything else falls through to
 *   `workflow`. Reach for `modelParams` (flowsRegistry) FIRST — it swaps widgets inside one
 *   graph and is the right answer whenever the candidates share a node set. This is only for
 *   candidates that do not.
 */

/** @type {Record<string, UniversalWorkflowDef>} */
export const UNIVERSAL_WORKFLOWS = {
    interpolate: {
        workflow: 'video_interpolate.json',
    },
    videoUpscale: {
        workflow: 'video_upscale.json',
    },
    imageUpscale: {
        workflow: 'image_upscale.json',
    },
    // MPI-579. Universal by wiring, but its weights belong to the LTX 2.3 Balanced
    // stack, not the universal DEPS set — the plugin's availability gate owns that.
    ltxVideoUpscale: {
        workflow: 'ltx_video_upscale.json',
    },
    removeBackground: {
        workflow: 'remove_background.json',
    },
    autoMaskImg: {
        workflow: 'img_auto_mask.json',
    },
    // Text-only (caption) workflow: returns a string via Output_prompt and saves no
    // file, so its op declares `outputKind: 'text'` (MPI-310). Runs through the normal
    // generation queue like any other op — the MPI-308 note that it bypasses the queue
    // is obsolete.
    imageDescribe: {
        workflow: 'image_descriptor.json',
    },
    resize: {
        workflow: 'resize.json',
    },
    resizeVideo: {
        workflow: 'resize_video.json',
    },
    flowHeadSwap: {
        workflow: 'flow_head_swap.json',
    },
    // MPI-591 — the first op whose graph is chosen by the model. Extending a clip on
    // LTX 2.3 and on MiniMax H3 are different node sets end to end (LTXVAudioVideoMask +
    // LTXVConcatAVLatent + LTXVSeparateAVLatent against an H3 nested AV latent +
    // MiniMaxH3AddGuide), so no widget swap inside one file could express it.
    // `workflow` stays the LTX graph because `requiredModels[0]` is `ltx-23-balanced` —
    // the candidate every existing extend ran on, and the one the picker stars.
    flowLtxExtend: {
        workflow: 'flow_ltx_extend.json',
        byModel: {
            // ref2va, NOT 'minimax-h3' (which is the fl2va DiT). The card's original text said
            // 'minimax-h3' because v1 was meant to be fl2va; Phase 1 ran on ref2va instead and
            // Phase 3 BAKED it — the graph's UNETLoader takes
            // minimax_h3_ref2va_pruned_int8_convrot and its turbo LoRA is the ref2v-trained
            // one, both supplied only by this model's dep set. Naming the fl2va id would gate
            // on a 19.53GB weight the graph never loads and then fail value_not_in_list.
            'minimax-h3-ref2va': 'flow_h3_extend.json',
        },
    },
    flowLtxFoley: {
        workflow: 'flow_ltx_foley.json',
    },
    // MPI-594 — Krea 2 edit. The image it loads is ALREADY padded by the app, so the
    // graph has no rect, no mask and no fill colour of its own.
    flowOutpaint: {
        workflow: 'flow_outpaint.json',
    },
    // MPI-567, rebuilt Klein-only in MPI-621 — the drawing is composited onto the
    // user's photo, a crop sized FROM the drawing is taken around it, Klein 9B edits
    // that crop, and the user's box is stitched back. One model, one pass; the SDXL
    // render, the background removal and the flat paste are gone. The model is a
    // declared slot, so this op adds no download of its own.
    flowScribObj: {
        workflow: 'flow_draw_it_in.json',
    },
    // MPI-620 — Scribble. Pruned from the SDXL t2i template rather than the Draw It In
    // graph: two control arms only (scribble + canny), so it carries no openpose or depth
    // preprocessor. Sizing is derived, not injected — `GetImageSize` reads the scaled
    // input and drives `EmptyLatentImage`, so the drawing's own dimensions are the output's.
    flowScribble: {
        workflow: 'flow_scribble.json',
    },
    // MPI-596 - Object Stamp. Draw It In's graph with the scribble swapped for a real
    // object, plus a second reference arm and a second crop of the CLEAN scene to the
    // same region (law 7 - matched framing is what stops the doll's-house failure).
    // ONE file serves both modes: three MpiAnySwitch nodes on Input_Mode pick the crop
    // source, reference 2 and the baked instruction. The model is a declared slot, so
    // this op adds no download of its own.
    flowObjectStamp: {
        workflow: 'flow_object_stamp.json',
    },
    // MPI-607 — Chatterbox voice conversion. Five nodes, no model loader: two
    // MpiLoadAudio paths into FL_ChatterboxVC, out through a native SaveAudio.
    flowVoiceChanger: {
        workflow: 'flow_voice_changer.json',
    },
    // MPI-607 — DramaBox. Eighteen nodes: a DiT + audio-VAE + 4-bit Gemma stack, two
    // samplers behind an MpiAnyChecker fork (with and without a voice reference), and
    // an MpiClearVram either side of the decode.
    flowDramaBox: {
        workflow: 'flow_drama_box.json',
    },
    // MPI-607 — Chatterbox TTS, optionally chained into VC. Twelve nodes: two TTS
    // nodes (English and multilingual) behind Input_Is_Multilingual, then a second
    // MpiIfElse that routes through FL_ChatterboxVC only when a target voice is given.
    flowChatterBox: {
        workflow: 'flow_chatter_box.json',
    },
    // MPI-663 — Stems. Seven nodes, no model loader: an MpiLoadAudio path into
    // AudioSeparation (Hybrid Demucs v3), out through four SaveAudioAdvanced saves.
    flowStems: {
        workflow: 'flow_stems.json',
    },
    // MPI-664 — MiniMax Music 3. Forty-six nodes: the bench graph's DiT + text encoder
    // + audio VAE, plus 31 string nodes that assemble the structured caption around the
    // enhancer's three prose blocks.
    flowTextToMusic: {
        workflow: 'flow_minimax_music.json',
    },
    // MPI-504 — Krea2 t2i, plus a SAM3 + Klein 4B pass that removes the head from the
    // front body panel. Both run on models the flow declares in `requiredModels`, so
    // this op adds no download of its own beyond the `face-yolov8n` dep.
    flowCharacterSheet: {
        workflow: 'flow_character_sheet.json',
    },
    // MPI-504 — text-only, like imageDescribe. Its encoder weight is
    // `qwen3vl-abliterated-clip`, already shipped for krea2 and the image-describer
    // plugin, so this op adds no download of its own.
    promptEnhance: {
        workflow: 'qwen3vl_4b_prompt_enhancer.json',
    },
};
