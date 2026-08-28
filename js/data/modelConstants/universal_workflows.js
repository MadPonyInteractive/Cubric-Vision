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
    flowLtxExtend: {
        workflow: 'flow_ltx_extend.json',
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
