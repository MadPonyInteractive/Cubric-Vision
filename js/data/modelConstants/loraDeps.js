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
    // universal (t2i/i2i/edit switched at runtime), so every tier can invoke edit. v1.2
    // r128 (SVD rank-reduced): near-full quality, best texture + least noise of the set.
    // v1.2 over v1.1: better edit adherence (v1.1 leaked source garment through) at equal
    // or better face likeness — A/B'd on scene-in-slot-1 / subject-in-slot-2 (the trained
    // order per the krea2edit node's own tooltip).
    'krea2-lora-identity-edit': {
        id: 'krea2-lora-identity-edit',
        name: 'Krea2 Identity Edit LoRA (v1.2 r128)',
        origin: 'conradlocke/krea2-identity-edit',
        filename: 'loras/krea-2/edit/krea2_identity_edit_v1_2_r128.safetensors',
        url: 'https://models.cubric.studio/vision/models/loras/krea-2/edit/krea2_identity_edit_v1_2_r128.safetensors',
        size: '0.91GB',
        sha256: 'f53db0bb4b081d638f196865cbc9f055379704fafb788336784fc1ccde18d825',
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
    // ── Qwen-Image-Edit-2511 LoRAs (MPI-300) ───────────────────────────────────
    // Two BAKED Lightning accelerator LoRAs (loaded by the graph's two 'Accelerator
    // LoRA' LoraLoaderModelOnly nodes — MODEL-only, strength 1.0). Both install with
    // the model; the Input_Tier switch picks which one applies (Turbo=8-step,
    // Hyper=4-step; Quality tier applies neither). Filename subfolder loras/qwen/ (the
    // graph bakes qwen\...\ — forward slashes here, path.join normalizes on disk).
    'qwen-edit-lightning-4step': {
        id: 'qwen-edit-lightning-4step',
        name: 'Qwen Image Edit 2511 Lightning 4-step (Hyper)',
        origin: 'lightx2v/Qwen-Image-Edit-2511-Lightning',
        filename: 'loras/qwen/Qwen-Image-Edit-2511-Lightning-4steps-V1.0-bf16.safetensors',
        url: 'https://models.cubric.studio/vision/models/loras/qwen/Qwen-Image-Edit-2511-Lightning-4steps-V1.0-bf16.safetensors',
        size: '810MB',
        sha256: '22226e8d05d354bb356627d428809f5afd7819399b077238a2b70a82883a904f',
    },
    'qwen-edit-lightning-8step': {
        id: 'qwen-edit-lightning-8step',
        name: 'Qwen Image Edit 2511 Lightning 8-step (Turbo)',
        origin: 'lightx2v/Qwen-Image-Edit-2511-Lightning',
        filename: 'loras/qwen/Qwen-Image-Edit-2511-Lightning-8steps-V1.0-bf16.safetensors',
        url: 'https://models.cubric.studio/vision/models/loras/qwen/Qwen-Image-Edit-2511-Lightning-8steps-V1.0-bf16.safetensors',
        size: '810MB',
        sha256: 'a9e81a58a78f260f67b337a6f615e8fa4cd3bc79847c77b7d61a581b789b1ba8',
    },
    // Style LoRAs (7) — user-selectable style rack (Krea2 style-system: MpiMath a==N
    // gate → Input_style_lora_N → Input_Stylization strength, default 0.80). Subfolder
    // loras/qwen/styles/. Index-aligned with styleLoraLabels on the ModelDef.
    'qwen-edit-style-illustration': {
        id: 'qwen-edit-style-illustration',
        name: 'Qwen Edit Style — Illustration',
        origin: 'CivArchive/2235007',
        filename: 'loras/qwen/styles/Illustration_style.safetensors',
        url: 'https://models.cubric.studio/vision/models/loras/qwen/styles/Illustration_style.safetensors',
        size: '590MB',
        sha256: '7b64be03fd3bf0a4aa7465b3942fb4bb68c252d1a514c2047094f9f2df3e58cd',
    },
    'qwen-edit-style-anime3d': {
        id: 'qwen-edit-style-anime3d',
        name: 'Qwen Edit Style — Anime 3D',
        origin: 'CivArchive/2373282',
        filename: 'loras/qwen/styles/Qwen-Anime-V2.safetensors',
        url: 'https://models.cubric.studio/vision/models/loras/qwen/styles/Qwen-Anime-V2.safetensors',
        size: '425MB',
        sha256: '4c4cf33fc51d2f94c7e7d878a2989be3d69a321efd770d54ac42d9b49e23a799',
    },
    'qwen-edit-style-anime2d': {
        id: 'qwen-edit-style-anime2d',
        name: 'Qwen Edit Style — Anime 2D',
        origin: 'CivArchive/2483865',
        filename: 'loras/qwen/styles/animal_style.safetensors',
        url: 'https://models.cubric.studio/vision/models/loras/qwen/styles/animal_style.safetensors',
        size: '236MB',
        sha256: '1d25fdcff7cd2da1a8daafa5ab9dc077d15ff56b9f029ab332b1b4e13d753b03',
    },
    'qwen-edit-style-zankuro': {
        id: 'qwen-edit-style-zankuro',
        name: 'Qwen Edit Style — Anime Zankuro',
        origin: 'CivArchive/2132600',
        filename: 'loras/qwen/styles/zankuro-style-v1.safetensors',
        url: 'https://models.cubric.studio/vision/models/loras/qwen/styles/zankuro-style-v1.safetensors',
        size: '236MB',
        sha256: 'a3580f7af2c11d2c9a8867c32807b13284e7c84dde66fddcb29daef0fbdf1fc2',
    },
    // App-only LoRA (MPI-299 Head Swap) — required by the app via AppDef.requiredDeps,
    // NOT by the qwen-edit model. Folding it into the model would push 1.2GB onto every
    // Qwen user for one app (MPI-304). Filed here because it IS a LoRA — deps are filed
    // by KIND, never by owner.
    //
    // PRECISION SETTLED (2026-07-18) — see the entry's own comment. Changing it later
    // means swapping filename/url/size/sha256 here AND re-exporting the workflow (node
    // 109 LoraLoaderModelOnly names the file); the two must match or the graph fails to
    // resolve the LoRA at run time. Nothing else references it.
    //
    // `url` IS LIVE (uploaded + round-trip verified 2026-07-19), so remote runs and
    // installs on other machines now work.
    'qwen-lora-headswap': {
        id: 'qwen-lora-headswap',
        name: 'Qwen Edit — Head Swap',
        // rank 32 / fp32, 1.2GB. SETTLED 2026-07-18 — do not re-run this A/B.
        // The rank-16/fp16 build (307MB, the only smaller one HuggingFace publishes)
        // LOST in two generations. Note what was NOT tested: that file is a quarter
        // the size, and only half of that is precision — the other half is RANK. A
        // rank-32 fp16 (~600MB) would be the real precision-only comparison, but no
        // such file exists officially and merging one ourselves is not worth it while
        // this one works. So the finding is "rank-16 fp16 lost", NOT "fp16 lost".
        filename: 'loras/qwen/bfs_head_v5_2511_merged_version_rank_32_fp32.safetensors',
        url: 'https://models.cubric.studio/vision/models/loras/qwen/bfs_head_v5_2511_merged_version_rank_32_fp32.safetensors',
        size: '1.2GB',
        // Verified by ROUND TRIP 2026-07-19: downloaded from the URL above and hashed
        // the served bytes (1,206,402,600 B, identical to local). This field verifies
        // the DOWNLOAD, so hashing the local file alone would not have earned it.
        sha256: '0a137e61245781412421f5dee5db4ccac28b6c9952c042d1123a84609107cd10',
    },
    'qwen-edit-style-3d': {
        id: 'qwen-edit-style-3d',
        name: 'Qwen Edit Style — 3D',
        origin: 'CivArchive/2483967',
        filename: 'loras/qwen/styles/style_3d.safetensors',
        url: 'https://models.cubric.studio/vision/models/loras/qwen/styles/style_3d.safetensors',
        size: '354MB',
        sha256: '87cee29c91abe22a657fd958d98d0dbd9fe0a43941bea1fec3aa6be0535ed5bb',
    },
    'qwen-edit-style-caricature': {
        id: 'qwen-edit-style-caricature',
        name: 'Qwen Edit Style — Caricature',
        origin: 'CivArchive/2427075',
        filename: 'loras/qwen/styles/qwen-edit-2509-caricature_v1.1.safetensors',
        url: 'https://models.cubric.studio/vision/models/loras/qwen/styles/qwen-edit-2509-caricature_v1.1.safetensors',
        size: '590MB',
        sha256: '60db309510817bfc86e23b570589b9b3d6aedc626e35632b32f54d2cc5b9cf3d',
    },
    'qwen-edit-style-snapshot': {
        id: 'qwen-edit-style-snapshot',
        name: 'Qwen Edit Style — SnapShot',
        origin: 'CivArchive/2681332',
        filename: 'loras/qwen/styles/Amateur_snapshot.safetensors',
        url: 'https://models.cubric.studio/vision/models/loras/qwen/styles/Amateur_snapshot.safetensors',
        size: '148MB',
        sha256: '1590201e0a45305c1fa00deb6ebdf33dbb4df5a9de388283911eb0c5b2c35cb5',
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
