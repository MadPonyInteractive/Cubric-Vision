// ── LoRA Dependencies ─────────────────────────────────────────────────────────
// Split out of dependencies.js (which re-exports these as part of DEPS).
// Everything under loras/ — Wan-5B turbo, Krea2 (filter-bypass, depth-control,
// 10 style LoRAs), LTX-2.3 baked LoRAs. IMPORTANT: to change a URL, set sha256
// back to null.

export const loraDeps = {
    'wan22-5b-turbo-lora': {
        id: 'wan22-5b-turbo-lora',
        name: 'Wan 2.2 5B Turbo (4-step)',
        origin: 'Kijai/WanVideo_comfy — LoRAs/Wan22-Turbo (quanhaol distill)',
        // Lives in its own lora subfolder (MPI-178): loras/wan-2.2-5b/. R2 mirrors.
        filename: 'loras/wan-2.2-5b/Wan22_TI2V_5B_Turbo_lora_rank_64_fp16.safetensors',
        url: 'https://models.cubric.studio/vision/models/loras/wan-2.2-5b/Wan22_TI2V_5B_Turbo_lora_rank_64_fp16.safetensors',
        size: '317MB',
        sha256: '0ace5244e3d1256f884662c261b017249796cf5b95f05d5ed93cc02a478967b8'
    },
    // Content-filter-bypass LoRA (always-on Input_Bypass_Filter_Lora node). A tiny
    // 12-float projector nudge. Dep of BOTH models (it's negligible); the generator bakes
    // strength 1.0 on SFW (the fp8_scaled weight is filtered) and 0.0 on NSFW (self-unfiltered).
    'krea2-lora-filterbypass': {
        id: 'krea2-lora-filterbypass',
        name: 'Krea2 Filter Bypass LoRA',
        origin: 'Krea-2 filter bypass',
        filename: 'loras/krea-2/extra/krea2filterbypass3.safetensors',
        url: 'https://models.cubric.studio/vision/models/loras/krea-2/extra/krea2filterbypass3.safetensors',
        size: '160B',
        sha256: 'ec5901a2d0b8f4e4e1e7e62fe4567566f0837799f7a413b03a06f72f47934dda',
    },
    // Identity-edit LoRA (MPI-282) — the instruct-edit path for Krea2. Baked into the
    // edit workflow (dual conditioning: in-context VAE source tokens + Qwen3-VL grounding
    // via the comfyui-krea2edit node pack). A DEP OF ALL FOUR Krea2 cards — the graph is
    // universal (t2i/i2i/edit switched at runtime), so every tier can invoke edit. v1.1
    // r128 (SVD rank-reduced): near-full quality, best texture + least noise of the set.
    'krea2-lora-identity-edit': {
        id: 'krea2-lora-identity-edit',
        name: 'Krea2 Identity Edit LoRA (v1.1 r128)',
        origin: 'conradlocke/krea2-identity-edit',
        filename: 'loras/krea-2/edit/krea2_identity_edit_v1_1_r128.safetensors',
        url: 'https://models.cubric.studio/vision/models/loras/krea-2/edit/krea2_identity_edit_v1_1_r128.safetensors',
        size: '0.91GB',
        sha256: null,
    },
    // Baked LoRA — loaded by the workflow, not user slots. Travels with the model.
    // Subfoldered under loras/krea-2/; ComfyUI lists them BACKSLASHED
    // (`krea-2\style\...`) — rides the MPI-229 heal.
    'krea2-lora-depth-control': {
        id: 'krea2-lora-depth-control',
        name: 'Krea2 Depth ControlNet LoRA',
        origin: 'Patil/Krea-2-depth-controlnet',
        filename: 'loras/krea-2/control/depth-control-lora.safetensors',
        url: 'https://models.cubric.studio/vision/models/loras/krea-2/control/depth-control-lora.safetensors',
        size: '822MB',
        sha256: 'fb80547ed79b47c1e3fea7bb9d36297e3917b2115fab6700ca1501350f9f483c',
    },
    // The 9 style LoRAs are MUTUALLY EXCLUSIVE at runtime: an MpiMath gate zeroes 8
    // of 9, and MpiLoraModel.apply_lora returns early at strength_model==0 (never
    // loads the file). footprint.js sums all 9 anyway (+3.50GB over-count) — MEASURED
    // to change no row of the VRAM table (floor is MIN_FLOOR-clamped). Do NOT
    // special-case footprint.js. Model-only (528 tensors, all `transformer.` prefix,
    // rank 32 F32) ⇒ loraStrengths: ['model'].
    'krea2-style-darkbrush': {
        id: 'krea2-style-darkbrush',
        name: 'Krea2 Style — Dark Brush',
        origin: 'Comfy-Org/Krea-2',
        filename: 'loras/krea-2/style/krea2_darkbrush.safetensors',
        url: 'https://models.cubric.studio/vision/models/loras/krea-2/style/krea2_darkbrush.safetensors',
        size: '448MB',
        sha256: 'f47c4316dd93af66e0518c93b582f459571d4925b519133770c73a52cd5db7c6',
    },
    'krea2-style-dotmatrix': {
        id: 'krea2-style-dotmatrix',
        name: 'Krea2 Style — Dot Matrix',
        origin: 'Comfy-Org/Krea-2',
        filename: 'loras/krea-2/style/krea2_dotmatrix.safetensors',
        url: 'https://models.cubric.studio/vision/models/loras/krea-2/style/krea2_dotmatrix.safetensors',
        size: '448MB',
        sha256: '805aa30d863347222485b9d3ce81642dbc70a73cebc95ab57219d98b878fceec',
    },
    'krea2-style-kidsdrawing': {
        id: 'krea2-style-kidsdrawing',
        name: 'Krea2 Style — Kids Drawing',
        origin: 'Comfy-Org/Krea-2',
        filename: 'loras/krea-2/style/krea2_kidsdrawing.safetensors',
        url: 'https://models.cubric.studio/vision/models/loras/krea-2/style/krea2_kidsdrawing.safetensors',
        size: '448MB',
        sha256: '8c1d45d204aeb4e34a7d9e16a7d473917592ba0048b03f4e03e037e3578ca500',
    },
    'krea2-style-neondrip': {
        id: 'krea2-style-neondrip',
        name: 'Krea2 Style — Neon Drip',
        origin: 'Comfy-Org/Krea-2',
        filename: 'loras/krea-2/style/krea2_neondrip.safetensors',
        url: 'https://models.cubric.studio/vision/models/loras/krea-2/style/krea2_neondrip.safetensors',
        size: '448MB',
        sha256: 'a779c14435949eabae9ce0bface4320cad6672ef3547e8489107e3498d65e871',
    },
    'krea2-style-rainywindow': {
        id: 'krea2-style-rainywindow',
        name: 'Krea2 Style — Rainy Window',
        origin: 'Comfy-Org/Krea-2',
        filename: 'loras/krea-2/style/krea2_rainywindow.safetensors',
        url: 'https://models.cubric.studio/vision/models/loras/krea-2/style/krea2_rainywindow.safetensors',
        size: '448MB',
        sha256: '7063a6f15ec6112ad3c06d79097b2a30a3ea7d9072821cb36021010d55989fe5',
    },
    'krea2-style-retroanime': {
        id: 'krea2-style-retroanime',
        name: 'Krea2 Style — Retro Anime',
        origin: 'Comfy-Org/Krea-2',
        filename: 'loras/krea-2/style/krea2_retroanime.safetensors',
        url: 'https://models.cubric.studio/vision/models/loras/krea-2/style/krea2_retroanime.safetensors',
        size: '448MB',
        sha256: 'ca42107783d9e517c5d62cb9a9db9ab2ba4887d90e9dad97a9d1a7fe6ff14c56',
    },
    'krea2-style-softwatercolor': {
        id: 'krea2-style-softwatercolor',
        name: 'Krea2 Style — Soft Water Color',
        origin: 'Comfy-Org/Krea-2',
        filename: 'loras/krea-2/style/krea2_softwatercolor.safetensors',
        url: 'https://models.cubric.studio/vision/models/loras/krea-2/style/krea2_softwatercolor.safetensors',
        size: '448MB',
        sha256: '3805e8655f19fbcac116542685e3f78f3a642e8fbfb857b5352bb32a4b3d445a',
    },
    'krea2-style-sunsetblur': {
        id: 'krea2-style-sunsetblur',
        name: 'Krea2 Style — Sunset Blur',
        origin: 'Comfy-Org/Krea-2',
        filename: 'loras/krea-2/style/krea2_sunsetblur.safetensors',
        url: 'https://models.cubric.studio/vision/models/loras/krea-2/style/krea2_sunsetblur.safetensors',
        size: '448MB',
        sha256: '194abdd531ca190d32799f26ab5bab634aa5ba3f07b7a60ffb282657db8bf3a0',
    },
    'krea2-style-vintagetarot': {
        id: 'krea2-style-vintagetarot',
        name: 'Krea2 Style — Vintage Tarot',
        origin: 'Comfy-Org/Krea-2',
        filename: 'loras/krea-2/style/krea2_vintagetarot.safetensors',
        url: 'https://models.cubric.studio/vision/models/loras/krea-2/style/krea2_vintagetarot.safetensors',
        size: '448MB',
        sha256: '8cca96c56658fb3ac5269f9ef2245bd07cbf1b7a189f517c8763470bb1385f9f',
    },
    'krea2-style-midjourney': {
        id: 'krea2-style-midjourney',
        name: 'Krea2 Style — MidJourney',
        origin: 'Comfy-Org/Krea-2',
        filename: 'loras/krea-2/style/KREA_MIDJ_1.safetensors',
        url: 'https://models.cubric.studio/vision/models/loras/krea-2/style/KREA_MIDJ_1.safetensors',
        size: '218MB',
        sha256: 'ad4a9f0b4d61ba77c5783b51fe3a2b637f8245144c1ce5e6a3fcd8225fd7df8a',
    },
    // Baked LoRAs — loaded by the workflow (not user slots), travel with the
    // model. First Cubric model whose LoRAs are NOT merged into the base.
    // filename uses forward slashes (path.join normalizes on disk); the workflow
    // bakes the same LTX2.3/ subfolder path. See [[project-lora-path-separator]].
    // Merged baked LoRA (MPI-168) — soft-enhance + abliterated + detailer merged
    // into ONE file, replacing the old standalone Soft Enhance LoRA. Loaded by the
    // 'Merged Loras' MpiLoraModelClip node in the template.
    'ltx23-lora-merged': {
        id: 'ltx23-lora-merged',
        name: 'LTX-2.3 Soft+Abliterated+Detailer Merged LoRA (baked)',
        origin: 'Mad-Pony-Interactive/cubric-studio',
        filename: 'loras/ltx-2.3/LTX23_softenhance_abliterated_detailer_merged.safetensors',
        url: 'https://models.cubric.studio/vision/models/loras/ltx-2.3/LTX23_softenhance_abliterated_detailer_merged.safetensors',
        size: '3.87GB',
        sha256: '3c5f9a7ffb75db2f32f26a9636c24695c8a8b926fa83d73a45f069ff65399444',
    },
    'ltx23-lora-transition': {
        id: 'ltx23-lora-transition',
        name: 'LTX-2.3 Transition LoRA (baked — i2v motion/lipsync enabler)',
        origin: 'Mad-Pony-Interactive/cubric-studio',
        filename: 'loras/ltx-2.3/ltx2.3-transition.safetensors',
        url: 'https://models.cubric.studio/vision/models/loras/ltx-2.3/ltx2.3-transition.safetensors',
        size: '372MB',
        sha256: 'ba420d6fefafced8e317e2d6ff951b312b52f534377d016b491877a00b830d33',
    },
    'ltx23-lora-talkvid': {
        id: 'ltx23-lora-talkvid',
        name: 'LTX-2.3 ID LoRA TalkVid-3K (baked — voice-ID)',
        origin: 'Mad-Pony-Interactive/cubric-studio',
        filename: 'loras/ltx-2.3/id-lora-talkvid/ltx-2.3-id-lora-talkvid-3k.safetensors',
        url: 'https://models.cubric.studio/vision/models/loras/ltx-2.3/id-lora-talkvid/ltx-2.3-id-lora-talkvid-3k.safetensors',
        size: '1.1GB',
        sha256: 'e5af73441743b4852f228b03e444888dff3da80d2666033af2367ab7bda6d8b9',
    },
};
