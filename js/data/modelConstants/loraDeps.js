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
        mirrorUrl: 'https://huggingface.co/Kijai/WanVideo_comfy/resolve/main/LoRAs/Wan22-Turbo/Wan22_TI2V_5B_Turbo_lora_rank_64_fp16.safetensors',
        size: '316.95MB',
        bytes: 332348584,
        sha256: '0ace5244e3d1256f884662c261b017249796cf5b95f05d5ed93cc02a478967b8'
    },
    // H3 turbo distill (MPI-505, weight swapped MPI-508) — the ONLY step-distill lever we
    // ship for H3, the only non-distilled video model in the fleet (25 steps; LTX 8,
    // WAN 2.2 6, WAN 5B 4). 25 -> 6 steps, 105s -> 87.8s measured on one clip. OPT-IN:
    // quality sits slightly below the 25-step path, so the toggle is off by default.
    // Strength is VALUE-gated (MpiMath 0.75/0.2 into BOTH strength_model and strength_clip)
    // — MpiLoraModelClip only short-circuits when both are 0, so since MPI-550 put the
    // non-turbo branch on 0.2 the short-circuit NEVER fires for H3: this weight now loads
    // on both paths, and uninstalling it breaks non-turbo too. The clip half is a no-op either way:
    // this is a pure diffusion_model LoRA (416 tensors, zero text-encoder keys), gated on
    // both strengths purely so the short-circuit still fires. Subfoldered under
    // loras/minimax-h3/; ComfyUI lists it BACKSLASHED (`minimax-h3\...`) — rides the
    // MPI-229 heal, same as the krea-2 subfolders.
    'minimax-h3-turbo-lora': {
        id: 'minimax-h3-turbo-lora',
        name: 'MiniMax H3 Turbo LoRA (6-step distill)',
        // SWAPPED 2026-08-09 (MPI-508). The first weight we shipped here — drbaph's
        // larryvrh v4_step600_ema — was measured at close to NO-LoRA timing: it cut the
        // step count and gave the wall clock back. lightx2v's is a real speed-up. Its
        // strengths are not comparable to the old one's: the safetensors metadata says
        // `peft alpha/r=0.125 baked into lora_B`, so 0.75 here is a tuned value, not a
        // reduction from 1.0. At 1.0 the AUDIO degrades badly (audio breaks before the
        // picture does on H3), and at 4 steps — what it was distilled for — audio is
        // unusable. 6 steps is the floor. Apache-2.0 upstream, so no licences.js record.
        origin: 'lightx2v/Minimax-h3-Turbo (Apache-2.0), ComfyUI conversion by Kijai/MiniMax-H3_comfy',
        filename: 'loras/minimax-h3/minimax_h3_fl2v_lightx2v_turbo_4step_v0.1_comfy.safetensors',
        url: 'https://models.cubric.studio/vision/models/loras/minimax-h3/minimax_h3_fl2v_lightx2v_turbo_4step_v0.1_comfy.safetensors',
        mirrorUrl: 'https://huggingface.co/Kijai/MiniMax-H3_comfy/resolve/main/loras/minimax_h3_fl2v_lightx2v_turbo_4step_v0.1_comfy.safetensors',
        size: '1.82GB',
        bytes: 1956171984,
        sha256: 'fc9b6500f0331fe925b004738baaa31bd34104741c8bf9334816f9ac3005c8c1',
    },
    // Content-filter-bypass LoRA (always-on Input_Bypass_Filter_Lora node). A tiny
    // 12-float projector nudge. Dep of BOTH models (it's negligible); the generator bakes
    // strength 1.0 on SFW (the fp8_scaled weight is filtered) and 0.0 on NSFW (self-unfiltered).
    'krea2-lora-filterbypass': {
        id: 'krea2-lora-filterbypass',
        name: 'Krea2 Filter Bypass LoRA',
        // S1LV3RC01N / CivitAI 2728234, resolved by SHA256 2026-08-03 (MPI-429 sweep).
        // allowNoCredit is FALSE — attribution is a licence obligation here, not a
        // courtesy, and this dep shipped without it from v1.1.0. MpiAbout builds its
        // Credits list from every dep carrying a `credit` block, so this is the fix.
        origin: 'S1LV3RC01N/Krea2FilterBypass (CivitAI 2728234)',
        filename: 'loras/krea-2/extra/krea2filterbypass3.safetensors',
        url: 'https://models.cubric.studio/vision/models/loras/krea-2/extra/krea2filterbypass3.safetensors',
        size: '160B',
        bytes: 160,
        sha256: 'ec5901a2d0b8f4e4e1e7e62fe4567566f0837799f7a413b03a06f72f47934dda',
        credit: {
            author: 'S1LV3RC01N',
            work: 'Krea2FilterBypass',
            url: 'https://civitai.com/models/2728234',
        },
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
        mirrorUrl: 'https://huggingface.co/conradlocke/krea2-identity-edit/resolve/main/krea2_identity_edit_v1_2_r128.safetensors',
        size: '871.81MB',
        bytes: 914159744,
        sha256: 'f53db0bb4b081d638f196865cbc9f055379704fafb788336784fc1ccde18d825',
    },
    // Accelerator LoRA (MPI-316) — this is TURBO, extracted as an SVD delta FROM Raw.
    // Its safetensors metadata says base_model krea/Krea-2-Raw -> target_model
    // krea/Krea-2-Turbo (extraction_method svd_lowrank_weight_delta), so
    // Raw + this @1.0 RECONSTRUCTS Turbo. That is why it replaces the two Turbo
    // transformers outright: 4 Krea2 cards collapse to 2, ~24.5GB less to host and
    // download, and every card gains BOTH tiers instead of one.
    // Gated by the `Accelerator Lora` node's MpiMath (`0.0 if a == 1 else 1.0`) off
    // Input_Tier: tier 1 (High/raw) = 0.0 -> apply_lora short-circuits and never loads
    // the file; tier 2 (Balanced) = 1.0. Baked at authoring, NOT injected — the node
    // title is deliberately un-prefixed (no `Input_`), like the identity-edit loader.
    // r128 over r64: 93.6% vs 86.8% captured SVD energy, and the user A/B'd it as
    // visibly better. Measured 12+6 steps @ 36s vs Turbo's 8+4 @ 36s — same wall-clock,
    // 50% more steps. Evidence: .agents/mpi-kanban/tasks/MPI-316/research/.
    'krea2-lora-accelerator': {
        id: 'krea2-lora-accelerator',
        name: 'Krea2 Accelerator LoRA (Turbo distill r128)',
        origin: 'TheDivergentAI/krea2-turbo-distill-lora',
        filename: 'loras/krea-2/extra/krea2_turbo_distill_r128.safetensors',
        url: 'https://models.cubric.studio/vision/models/loras/krea-2/extra/krea2_turbo_distill_r128.safetensors',
        mirrorUrl: 'https://huggingface.co/TheDivergentAI/krea2-turbo-distill-lora/resolve/main/krea2_turbo_distill_r128.safetensors',
        size: '893.54MB',
        bytes: 936944890,
        sha256: '0cd8b6a756456229b340d2382f30f91bd8540f9cdee4fb95edb897daf08f8c6f',
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
        mirrorUrl: 'https://huggingface.co/Patil/Krea-2-depth-controlnet/resolve/main/depth-control-lora.safetensors',
        size: '822.06MB',
        bytes: 861995928,
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
        mirrorUrl: 'https://huggingface.co/Comfy-Org/Krea-2/resolve/main/loras/krea2_darkbrush.safetensors',
        size: '447.55MB',
        bytes: 469291992,
        sha256: 'f47c4316dd93af66e0518c93b582f459571d4925b519133770c73a52cd5db7c6',
    },
    'krea2-style-dotmatrix': {
        id: 'krea2-style-dotmatrix',
        name: 'Krea2 Style — Dot Matrix',
        origin: 'Comfy-Org/Krea-2',
        filename: 'loras/krea-2/style/krea2_dotmatrix.safetensors',
        url: 'https://models.cubric.studio/vision/models/loras/krea-2/style/krea2_dotmatrix.safetensors',
        mirrorUrl: 'https://huggingface.co/Comfy-Org/Krea-2/resolve/main/loras/krea2_dotmatrix.safetensors',
        size: '447.55MB',
        bytes: 469291992,
        sha256: '805aa30d863347222485b9d3ce81642dbc70a73cebc95ab57219d98b878fceec',
    },
    'krea2-style-kidsdrawing': {
        id: 'krea2-style-kidsdrawing',
        name: 'Krea2 Style — Kids Drawing',
        origin: 'Comfy-Org/Krea-2',
        filename: 'loras/krea-2/style/krea2_kidsdrawing.safetensors',
        url: 'https://models.cubric.studio/vision/models/loras/krea-2/style/krea2_kidsdrawing.safetensors',
        mirrorUrl: 'https://huggingface.co/Comfy-Org/Krea-2/resolve/main/loras/krea2_kidsdrawing.safetensors',
        size: '447.55MB',
        bytes: 469291992,
        sha256: '8c1d45d204aeb4e34a7d9e16a7d473917592ba0048b03f4e03e037e3578ca500',
    },
    'krea2-style-neondrip': {
        id: 'krea2-style-neondrip',
        name: 'Krea2 Style — Neon Drip',
        origin: 'Comfy-Org/Krea-2',
        filename: 'loras/krea-2/style/krea2_neondrip.safetensors',
        url: 'https://models.cubric.studio/vision/models/loras/krea-2/style/krea2_neondrip.safetensors',
        mirrorUrl: 'https://huggingface.co/Comfy-Org/Krea-2/resolve/main/loras/krea2_neondrip.safetensors',
        size: '447.55MB',
        bytes: 469291992,
        sha256: 'a779c14435949eabae9ce0bface4320cad6672ef3547e8489107e3498d65e871',
    },
    'krea2-style-rainywindow': {
        id: 'krea2-style-rainywindow',
        name: 'Krea2 Style — Rainy Window',
        origin: 'Comfy-Org/Krea-2',
        filename: 'loras/krea-2/style/krea2_rainywindow.safetensors',
        url: 'https://models.cubric.studio/vision/models/loras/krea-2/style/krea2_rainywindow.safetensors',
        mirrorUrl: 'https://huggingface.co/Comfy-Org/Krea-2/resolve/main/loras/krea2_rainywindow.safetensors',
        size: '447.55MB',
        bytes: 469291992,
        sha256: '7063a6f15ec6112ad3c06d79097b2a30a3ea7d9072821cb36021010d55989fe5',
    },
    'krea2-style-retroanime': {
        id: 'krea2-style-retroanime',
        name: 'Krea2 Style — Retro Anime',
        origin: 'Comfy-Org/Krea-2',
        filename: 'loras/krea-2/style/krea2_retroanime.safetensors',
        url: 'https://models.cubric.studio/vision/models/loras/krea-2/style/krea2_retroanime.safetensors',
        mirrorUrl: 'https://huggingface.co/Comfy-Org/Krea-2/resolve/main/loras/krea2_retroanime.safetensors',
        size: '447.55MB',
        bytes: 469291992,
        sha256: 'ca42107783d9e517c5d62cb9a9db9ab2ba4887d90e9dad97a9d1a7fe6ff14c56',
    },
    'krea2-style-softwatercolor': {
        id: 'krea2-style-softwatercolor',
        name: 'Krea2 Style — Soft Water Color',
        origin: 'Comfy-Org/Krea-2',
        filename: 'loras/krea-2/style/krea2_softwatercolor.safetensors',
        url: 'https://models.cubric.studio/vision/models/loras/krea-2/style/krea2_softwatercolor.safetensors',
        mirrorUrl: 'https://huggingface.co/Comfy-Org/Krea-2/resolve/main/loras/krea2_softwatercolor.safetensors',
        size: '447.55MB',
        bytes: 469291992,
        sha256: '3805e8655f19fbcac116542685e3f78f3a642e8fbfb857b5352bb32a4b3d445a',
    },
    'krea2-style-sunsetblur': {
        id: 'krea2-style-sunsetblur',
        name: 'Krea2 Style — Sunset Blur',
        origin: 'Comfy-Org/Krea-2',
        filename: 'loras/krea-2/style/krea2_sunsetblur.safetensors',
        url: 'https://models.cubric.studio/vision/models/loras/krea-2/style/krea2_sunsetblur.safetensors',
        mirrorUrl: 'https://huggingface.co/Comfy-Org/Krea-2/resolve/main/loras/krea2_sunsetblur.safetensors',
        size: '447.55MB',
        bytes: 469291992,
        sha256: '194abdd531ca190d32799f26ab5bab634aa5ba3f07b7a60ffb282657db8bf3a0',
    },
    'krea2-style-vintagetarot': {
        id: 'krea2-style-vintagetarot',
        name: 'Krea2 Style — Vintage Tarot',
        origin: 'Comfy-Org/Krea-2',
        filename: 'loras/krea-2/style/krea2_vintagetarot.safetensors',
        url: 'https://models.cubric.studio/vision/models/loras/krea-2/style/krea2_vintagetarot.safetensors',
        mirrorUrl: 'https://huggingface.co/Comfy-Org/Krea-2/resolve/main/loras/krea2_vintagetarot.safetensors',
        size: '447.55MB',
        bytes: 469291992,
        sha256: '8cca96c56658fb3ac5269f9ef2245bd07cbf1b7a189f517c8763470bb1385f9f',
    },
    'krea2-style-midjourney': {
        id: 'krea2-style-midjourney',
        name: 'Krea2 Style — MidJourney',
        origin: 'Comfy-Org/Krea-2',
        filename: 'loras/krea-2/style/KREA_MIDJ_1.safetensors',
        url: 'https://models.cubric.studio/vision/models/loras/krea-2/style/KREA_MIDJ_1.safetensors',
        size: '218MB',
        bytes: 228587776,
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
        mirrorUrl: 'https://huggingface.co/lightx2v/Qwen-Image-Edit-2511-Lightning/resolve/main/Qwen-Image-Edit-2511-Lightning-4steps-V1.0-bf16.safetensors',
        size: '810.25MB',
        bytes: 849608296,
        sha256: '22226e8d05d354bb356627d428809f5afd7819399b077238a2b70a82883a904f',
    },
    'qwen-edit-lightning-8step': {
        id: 'qwen-edit-lightning-8step',
        name: 'Qwen Image Edit 2511 Lightning 8-step (Turbo)',
        origin: 'lightx2v/Qwen-Image-Edit-2511-Lightning',
        filename: 'loras/qwen/Qwen-Image-Edit-2511-Lightning-8steps-V1.0-bf16.safetensors',
        url: 'https://models.cubric.studio/vision/models/loras/qwen/Qwen-Image-Edit-2511-Lightning-8steps-V1.0-bf16.safetensors',
        mirrorUrl: 'https://huggingface.co/lightx2v/Qwen-Image-Edit-2511-Lightning/resolve/main/Qwen-Image-Edit-2511-Lightning-8steps-V1.0-bf16.safetensors',
        size: '810.25MB',
        bytes: 849608296,
        sha256: 'a9e81a58a78f260f67b337a6f615e8fa4cd3bc79847c77b7d61a581b789b1ba8',
    },
    // Style LoRAs (7) — user-selectable style rack (Krea2 style-system: MpiMath a==N
    // Input_Style_Selector → MpiStyleLoras slot N, strength default 0.80). Subfolder
    // loras/qwen/styles/. Index-aligned with styleLoraLabels on the ModelDef.
    'qwen-edit-style-illustration': {
        id: 'qwen-edit-style-illustration',
        name: 'Qwen Edit Style — Illustration',
        origin: 'CivArchive/2235007',
        filename: 'loras/qwen/styles/Illustration_style.safetensors',
        url: 'https://models.cubric.studio/vision/models/loras/qwen/styles/Illustration_style.safetensors',
        size: '562.72MB',
        bytes: 590058824,
        sha256: '7b64be03fd3bf0a4aa7465b3942fb4bb68c252d1a514c2047094f9f2df3e58cd',
    },
    'qwen-edit-style-anime3d': {
        id: 'qwen-edit-style-anime3d',
        name: 'Qwen Edit Style — Anime 3D',
        origin: 'CivArchive/2373282',
        filename: 'loras/qwen/styles/Qwen-Anime-V2.safetensors',
        url: 'https://models.cubric.studio/vision/models/loras/qwen/styles/Qwen-Anime-V2.safetensors',
        size: '405.27MB',
        bytes: 424960008,
        sha256: '4c4cf33fc51d2f94c7e7d878a2989be3d69a321efd770d54ac42d9b49e23a799',
    },
    'qwen-edit-style-anime2d': {
        id: 'qwen-edit-style-anime2d',
        name: 'Qwen Edit Style — Anime 2D',
        origin: 'CivArchive/2483865',
        filename: 'loras/qwen/styles/animal_style.safetensors',
        url: 'https://models.cubric.studio/vision/models/loras/qwen/styles/animal_style.safetensors',
        size: '225.18MB',
        bytes: 236117040,
        sha256: '1d25fdcff7cd2da1a8daafa5ab9dc077d15ff56b9f029ab332b1b4e13d753b03',
    },
    'qwen-edit-style-zankuro': {
        id: 'qwen-edit-style-zankuro',
        name: 'Qwen Edit Style — Anime Zankuro',
        origin: 'CivArchive/2132600',
        filename: 'loras/qwen/styles/zankuro-style-v1.safetensors',
        url: 'https://models.cubric.studio/vision/models/loras/qwen/styles/zankuro-style-v1.safetensors',
        size: '225.18MB',
        bytes: 236117032,
        sha256: 'a3580f7af2c11d2c9a8867c32807b13284e7c84dde66fddcb29daef0fbdf1fc2',
    },
    // Flow-only LoRA (MPI-299 Head Swap) — required by the Flow via FlowDef.requiredDeps,
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
        origin: 'Alissonerdx/BFS-Best-Face-Swap (MIT) — bfs_head_v5_2511_merged_version_rank_32_fp32',
        // rank 32 / fp32, 1.2GB. SETTLED 2026-07-18 — do not re-run this A/B.
        // The rank-16/fp16 build (307MB, the only smaller one HuggingFace publishes)
        // LOST in two generations. Note what was NOT tested: that file is a quarter
        // the size, and only half of that is precision — the other half is RANK. A
        // rank-32 fp16 (~600MB) would be the real precision-only comparison, but no
        // such file exists officially and merging one ourselves is not worth it while
        // this one works. So the finding is "rank-16 fp16 lost", NOT "fp16 lost".
        filename: 'loras/qwen/bfs_head_v5_2511_merged_version_rank_32_fp32.safetensors',
        url: 'https://models.cubric.studio/vision/models/loras/qwen/bfs_head_v5_2511_merged_version_rank_32_fp32.safetensors',
        size: '1.12GB',
        bytes: 1206402600,
        // Verified by ROUND TRIP 2026-07-19: downloaded from the URL above and hashed
        // the served bytes (1,206,402,600 B, identical to local). This field verifies
        // the DOWNLOAD, so hashing the local file alone would not have earned it.
        sha256: '0a137e61245781412421f5dee5db4ccac28b6c9952c042d1123a84609107cd10',
        // MPI-429 — provenance recovered 2026-08-03 and CONFIRMED BY HASH: the blob at
        // Alissonerdx/BFS-Best-Face-Swap carries oid 0a137e61…, identical to the sha256
        // above, under the same filename. Licence MIT. It was the only dep in the
        // catalogue with no `origin`, which is exactly why the 968-repo sweep could not
        // place it — that author was never a candidate. Byte-identical upstream, so it
        // needs no re-host, only this second route.
        mirrorUrl: 'https://huggingface.co/Alissonerdx/BFS-Best-Face-Swap/resolve/main/bfs_head_v5_2511_merged_version_rank_32_fp32.safetensors',
    },
    'qwen-edit-style-3d': {
        id: 'qwen-edit-style-3d',
        name: 'Qwen Edit Style — 3D',
        origin: 'CivArchive/2483967',
        filename: 'loras/qwen/styles/style_3d.safetensors',
        url: 'https://models.cubric.studio/vision/models/loras/qwen/styles/style_3d.safetensors',
        size: '337.68MB',
        bytes: 354082312,
        sha256: '87cee29c91abe22a657fd958d98d0dbd9fe0a43941bea1fec3aa6be0535ed5bb',
    },
    'qwen-edit-style-caricature': {
        id: 'qwen-edit-style-caricature',
        name: 'Qwen Edit Style — Caricature',
        origin: 'CivArchive/2427075',
        filename: 'loras/qwen/styles/qwen-edit-2509-caricature_v1.1.safetensors',
        url: 'https://models.cubric.studio/vision/models/loras/qwen/styles/qwen-edit-2509-caricature_v1.1.safetensors',
        size: '562.72MB',
        bytes: 590058888,
        sha256: '60db309510817bfc86e23b570589b9b3d6aedc626e35632b32f54d2cc5b9cf3d',
    },
    'qwen-edit-style-snapshot': {
        id: 'qwen-edit-style-snapshot',
        name: 'Qwen Edit Style — SnapShot',
        origin: 'CivArchive/2681332',
        filename: 'loras/qwen/styles/Amateur_snapshot.safetensors',
        url: 'https://models.cubric.studio/vision/models/loras/qwen/styles/Amateur_snapshot.safetensors',
        size: '141.33MB',
        bytes: 148192992,
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
        size: '3.6GB',
        bytes: 3869749848,
        sha256: '3c5f9a7ffb75db2f32f26a9636c24695c8a8b926fa83d73a45f069ff65399444',
    },
    'ltx23-lora-transition': {
        id: 'ltx23-lora-transition',
        name: 'LTX-2.3 Transition LoRA (baked — i2v motion/lipsync enabler)',
        origin: 'Mad-Pony-Interactive/cubric-studio',
        filename: 'loras/ltx-2.3/ltx2.3-transition.safetensors',
        url: 'https://models.cubric.studio/vision/models/loras/ltx-2.3/ltx2.3-transition.safetensors',
        size: '372.15MB',
        bytes: 390229424,
        sha256: 'ba420d6fefafced8e317e2d6ff951b312b52f534377d016b491877a00b830d33',
    },
    'ltx23-lora-talkvid': {
        id: 'ltx23-lora-talkvid',
        name: 'LTX-2.3 ID LoRA TalkVid-3K (baked — voice-ID)',
        origin: 'Mad-Pony-Interactive/cubric-studio',
        filename: 'loras/ltx-2.3/id-lora-talkvid/ltx-2.3-id-lora-talkvid-3k.safetensors',
        url: 'https://models.cubric.studio/vision/models/loras/ltx-2.3/id-lora-talkvid/ltx-2.3-id-lora-talkvid-3k.safetensors',
        mirrorUrl: 'https://huggingface.co/Comfy-Org/ltx-2.3/resolve/main/split_files/loras/ltx-2.3-id-lora-talkvid-3k.safetensors',
        size: '1.08GB',
        bytes: 1157884304,
        sha256: 'e5af73441743b4852f228b03e444888dff3da80d2666033af2367ab7bda6d8b9',
    },
    // Foley V2A LoRA (MPI-536) — baked by the ltx-foley FLOW's graph, not by the
    // shipped t2v/i2v ones, which is why it sits on `ltx-23-balanced` ONLY: that
    // graph's UNETLoader bakes the int8 transformer, so the High card cannot run
    // the Flow and would download 216MB it can never use.
    // NO mirrorUrl, deliberately: the only upstream copy is
    // Lightricks/LTX-2.3-22b-LoRA-Foley-V2A, which is a GATED repo (401 +
    // X-Error-Code: GatedRepo for an anonymous fetch), so a mirror entry would
    // fail every failover it was added for. Comfy-Org's split_files/loras does not
    // carry this file, and FuzzPuppy/LTX-2.3-Foley-LoRA is a DIFFERENT community
    // train (ltx-2.3-foley-400-steps.safetensors) — not a mirror of these bytes.
    'ltx23-lora-foley': {
        id: 'ltx23-lora-foley',
        name: 'LTX-2.3 Foley V2A LoRA (baked — video-to-audio)',
        origin: 'Mad-Pony-Interactive/cubric-studio',
        filename: 'loras/ltx-2.3/ltx-2.3-22b-lora-foley-v2a-1.0.safetensors',
        url: 'https://models.cubric.studio/vision/models/loras/ltx-2.3/ltx-2.3-22b-lora-foley-v2a-1.0.safetensors',
        size: '216.21MB',
        bytes: 226709270,
        sha256: '1bc16020f3937f1dc4957b24c713bc04ec550d6502db8c3e1dd822c412e1fb85',
    },
    // Klein turbo/accelerator LoRA — DROPPED 2026-07-27, deliberately not a dep.
    // klein-4b-transformer ships the DISTILLED checkpoint (see modelDeps.js), which is
    // already a cfg 1.0 / 4-step weight, so the base+turbo two-tier pair this entry
    // existed for no longer has a base leg to accelerate. Its node survives in the
    // template BYPASSED and severed (nothing consumes it) purely so the two-tier wiring
    // is recoverable if Klein 9B ever lands — do NOT re-add the dep on the strength of
    // that node alone. 786MB nobody loads; the weight is never uploaded to R2.
    // Klein outpaint LoRA (MPI-354) — BAKED at 1.1 in every Klein graph (LoraLoaderModelOnly,
    // not a user slot). Mandatory for outpaint, harmless-to-helpful on inpaint/removal.
    // MUST be the comfy-converted file (`diffusion_model.*` prefix, rank 16, all 68 target
    // keys bind) — the plain diffusers weight silently binds nothing in ComfyUI.
    'klein-lora-outpaint': {
        id: 'klein-lora-outpaint',
        name: 'FLUX.2 Klein Outpaint LoRA (baked)',
        origin: 'fal (FLUX.2 Klein outpaint, comfy-converted)',
        filename: 'loras/flux2-klein/flux2-klein-4b-outpaint.safetensors',
        url: 'https://models.cubric.studio/vision/models/loras/flux2-klein/flux2-klein-4b-outpaint.safetensors',
        size: '72.52MB',
        bytes: 76038936,
        sha256: 'b8a5142b40f2e24aa1f5cfd0710323188836f49ea70b15b5f85b1e364316bc5b',
    },
    // Klein depth refcontrol LoRA (MPI-354) — BAKED on the depth branch (node 143,
    // LoraLoaderModelOnly -> CFGGuider), not a user slot. This is what makes the depth
    // op a depth op; without it the depth map is just an ordinary reference image.
    // GOTCHA (cost most of a day, do not re-derive): a depth map is a GRAYSCALE image
    // fed in as a ReferenceLatent, and at cfg 1.0 there is no classifier-free guidance
    // to amplify the text — so a short prompt LOSES to the reference and the output
    // inherits the reference's greyness. The template fixes this with a literal
    // 'refcontrol, color' prefix on StringConcatenate#133. It is a BIAS, not a clamp:
    // 'a black and white photo of...' still correctly yields B&W. Do NOT "tidy" that
    // prefix away — `refcontrol` is also the LoRA's own recorded training tag
    // (ss_tag_frequency `1_refcontrol`), so dropping it likely weakens the LoRA too.
    // Trained with ostris ai-toolkit 0.7.20, 6000 steps / 7 epochs, 160 keys already in
    // comfy format (`diffusion_model.*.lora_A/B`), ss_base_model_version flux2_klein_4b.
    // BASE-AUTHORED, CONFIRMED — CivitAI records this version's baseModel as
    // "Flux.2 Klein 4B-base" while we ship the DISTILLED checkpoint. It demonstrably
    // works on distilled once the prompt carries the prefix above, but that was never
    // isolated against a base run, so if depth quality ever looks off this mismatch is
    // the first suspect, not the graph.
    // Licence resolved by SHA256 2026-07-27: civitai.com/models/2657241 (thedeoxen,
    // "RefControl FLUX.2 Klein 4B – Reference Depth LoRA" v1.0) — allowCommercialUse
    // {Image,RentCivit,Rent,Sell}, allowNoCredit true, allowDerivatives true. The most
    // permissive of the 11 community weights Klein ships; no credit obligation.
    'klein-lora-refcontrol-depth': {
        id: 'klein-lora-refcontrol-depth',
        name: 'FLUX.2 Klein 4B Depth RefControl LoRA (baked)',
        origin: 'FLUX.2 Klein refcontrol (depth)',
        filename: 'loras/flux2-klein/flux2_klein_4b_refcontrol_depth.safetensors',
        url: 'https://models.cubric.studio/vision/models/loras/flux2-klein/flux2_klein_4b_refcontrol_depth.safetensors',
        size: '88.15MB',
        bytes: 92426784,
        sha256: '65ec4c71fa7538b2201481928609a5836773f0dc06a4041b2d28abd05826c401',
    },
    // Klein NSFW LoRA (MPI-354) — BAKED, and PROMPT-GATED, not user-facing: node 38
    // (`NSFW LoRA`, LoraLoaderModelOnly) takes its strength from an MpiMath
    // `1.0 if a else 0.0` fed by an MpiTextContains keyword scan of Input_Positive.
    // No control, no capability, no ModelDef entry — a clean prompt leaves strength at
    // 0.0 and MpiLoraModel/LoraLoaderModelOnly never touches the file. Licence checked
    // 2026-07-26: civitai.com/models/2458332, allowCommercialUse {Image,RentCivit,Rent,Sell}.
    'klein-lora-nsfw': {
        id: 'klein-lora-nsfw',
        name: 'FLUX.2 Klein 4B NSFW LoRA (prompt-gated)',
        origin: 'CivitAI 2458332 (Party Time, v2.0_klein4B)',
        filename: 'loras/flux2-klein/NSFW_party_time_v2.0_klein4b.safetensors',
        url: 'https://models.cubric.studio/vision/models/loras/flux2-klein/NSFW_party_time_v2.0_klein4b.safetensors',
        size: '180.01MB',
        bytes: 188756968,
        sha256: '0c4aea1ba041985d2d7e6ce655b865e0fe22ea37575b3310c4619ad57dc80a00',
    },
    // ── Klein 9B baked LoRAs (MPI-598) ─────────────────────────────────────────
    // The 9B twins of the two entries above. 4B and 9B LoRAs are NOT interchangeable —
    // the rank dims differ (lora_A [.,4096] on 9B vs [.,3072] on 4B), which is also the
    // proof each file really is 9B. Both keep the SAME key prefix as their 4B twin
    // (`diffusion_model.*` for depth, `transformer.*` for NSFW), so neither needs the
    // comfy-conversion step the outpaint LoRA did.
    // Hashes verified three ways 2026-08-22: local sha256, the HF `lfs.oid` from
    // `POST /api/models/{repo}/paths-info/main`, and MPI-598's research file. Read the
    // oid, never a `resolve/` ETag — that is a CDN etag and makes a good download look
    // corrupt.
    // NOTE there is NO 9B outpaint LoRA. The 4B one is deprecated under MPI-603 and must
    // not be deleted or stripped here — it has a shipped second consumer in the Character
    // Sheet flow (flow_character_sheet.json #708).
    'klein-9b-lora-refcontrol-depth': {
        id: 'klein-9b-lora-refcontrol-depth',
        name: 'FLUX.2 Klein 9B Depth RefControl LoRA (baked)',
        origin: 'thedeoxen/refcontrol-FLUX.2-klein-9B-reference-depth-lora (Apache-2.0)',
        filename: 'loras/flux2-klein/flux2_klein_9b_refcontrol_depth.safetensors',
        url: 'https://models.cubric.studio/vision/models/loras/flux2-klein/flux2_klein_9b_refcontrol_depth.safetensors',
        mirrorUrl: 'https://huggingface.co/thedeoxen/refcontrol-FLUX.2-klein-9B-reference-depth-lora/resolve/main/flux2_klein_9b_refcontrol_depth.safetensors',
        size: '158.03MB',
        bytes: 165704480,
        sha256: 'd627631d39a6a7c7b2951b029a1a0c72b40809b27d4049b708129e1832c9bb8d',
    },
    // Same creator as the 4B depth LoRA (CivitAI 2657241, already cleared in
    // docs/models/klein/licences.md) but published to Hugging Face under Apache-2.0 —
    // so this one needs no VPN and carries no credit obligation.
    // The NSFW twin below is CivitAI-only (model 2458332, version 3028788, creator
    // `whoforscuba`, licence badge NONE — cleared on creator flags alone, the identical
    // posture to the 4B weight we already ship). CivitAI region-blocks the UK, so it has
    // no mirrorUrl, exactly like its 4B twin; Fabio pulled it over the VPN 2026-08-22.
    'klein-9b-lora-nsfw': {
        id: 'klein-9b-lora-nsfw',
        name: 'FLUX.2 Klein 9B NSFW LoRA (prompt-gated)',
        origin: 'CivitAI 2458332 v3028788 (Party Time, v2.0_klein9b)',
        filename: 'loras/flux2-klein/NSFW_party_time_v2.0_klein9b.safetensors',
        url: 'https://models.cubric.studio/vision/models/loras/flux2-klein/NSFW_party_time_v2.0_klein9b.safetensors',
        size: '304.02MB',
        bytes: 318784864,
        sha256: 'cc369cda4370cde8244e5934ac7323b9d39f0797d729c1931c8c0621692ce91c',
    },
    // ── Klein style LoRAs (MPI-354) ────────────────────────────────────────────
    // 8 style LoRAs behind Input_Style_Selector 1..8 (index 0 = No Style, model passes through).
    // Same runtime shape as the Krea2 rack above: MUTUALLY EXCLUSIVE, an MpiMath
    // `b if a == N else 0.0` zeroes the other 7 and MpiLoraModel.apply_lora returns
    // early at strength 0 (never loads the file). Do NOT special-case footprint.js.
    // Subfoldered under loras/flux2-klein/styles/ — ComfyUI lists them BACKSLASHED
    // (`flux2-klein\styles\...`, verified against the bench graph) — rides the MPI-229 heal.
    // Index alignment is the contract: dep ↔ styleLoraLabels[i] ↔ styleLoraImages[i]
    // ↔ the MpiMath gate `a == i` ↔ the MpiPromptList `styles` trigger line.
    // LICENCES verified 2026-07-26 by SHA256 against the CivitAI API (Klein 4B's
    // Apache-2.0 does not extend to community LoRAs). Five carry the `Image` right
    // (may sell generated output); anime (2227157), chibi (400063) and doodle (2593550)
    // do not — but CivitAI's flags and License badge are MODEL-level, and all three are
    // multi-base bundles whose restrictive label belongs to a Flux-dev/other leg we do
    // not ship. All eight ship (user call). Credit-requiring LoRAs are attributed in the
    // app's About section; the cross-model sweep for those is MPI-358.
    // Table + method: docs/models/klein/README.md § LoRA licences.
    'klein-style-muppets': {
        id: 'klein-style-muppets',
        name: 'Klein Style — Muppets',
        origin: 'CivitAI (FLUX.2 Klein 4B Muppet Show style)',
        filename: 'loras/flux2-klein/styles/flux2-klein-4b-lora-muppetshow-style.safetensors',
        url: 'https://models.cubric.studio/vision/models/loras/flux2-klein/styles/flux2-klein-4b-lora-muppetshow-style.safetensors',
        size: '88.15MB',
        bytes: 92426832,
        sha256: 'd75818b477b4e852eeb862d03e92bcf61ef72326f8e7f0de1bebda38596fab7a',
    },
    'klein-style-cartoon': {
        id: 'klein-style-cartoon',
        name: 'Klein Style — Cartoon',
        origin: 'CivitAI (FLUX.2 Klein 4B Fluxtoon style)',
        filename: 'loras/flux2-klein/styles/flux2-klein-4b-lora-Fluxtoon-Style.safetensors',
        url: 'https://models.cubric.studio/vision/models/loras/flux2-klein/styles/flux2-klein-4b-lora-Fluxtoon-Style.safetensors',
        size: '88.15MB',
        bytes: 92426824,
        sha256: 'fd308c80f8801626bc0eb53f778ded7f5ae162c7c6b334f82a263ac5033d1354',
    },
    'klein-style-jojo': {
        id: 'klein-style-jojo',
        name: 'Klein Style — Jojo',
        origin: 'CivitAI (FLUX.2 Klein 4B Jojoso style)',
        filename: 'loras/flux2-klein/styles/flux2-klein-4b-lora-Jojoso-Style_000002000.safetensors',
        url: 'https://models.cubric.studio/vision/models/loras/flux2-klein/styles/flux2-klein-4b-lora-Jojoso-Style_000002000.safetensors',
        size: '88.15MB',
        bytes: 92426808,
        sha256: 'dd021028b403a3760776b04e2e9c3e23551cc9fdce939e2d49c6e31d5f3d860d',
    },
    // The ONE weight we ship whose creator requires attribution — CivitAI
    // `allowNoCredit: false` (verified by SHA256 2026-07-27). The `credit` block below is
    // not decoration: MpiAbout renders a Credits list from every dep that carries one, so
    // the obligation is discharged by the data, not by someone remembering to hand-edit a
    // template. Add a `credit` to any future dep whose creator asks for it (MPI-358).
    'klein-style-anime': {
        id: 'klein-style-anime',
        name: 'Klein Style — Anime',
        origin: 'CivitAI (Anime new mecha, klein4b)',
        filename: 'loras/flux2-klein/styles/Anime_new_mecha_klein4b.safetensors',
        url: 'https://models.cubric.studio/vision/models/loras/flux2-klein/styles/Anime_new_mecha_klein4b.safetensors',
        size: '88.14MB',
        bytes: 92426264,
        sha256: '2ca647f74ca265fa3e1c22084b78006662bf0c38cf70418b1e798b25971147a0',
        credit: {
            author: 'n_Arno',
            work: 'New Mecha style',
            url: 'https://civitai.com/models/2227157',
        },
    },
    'klein-style-chibi': {
        id: 'klein-style-chibi',
        name: 'Klein Style — Chibi',
        origin: 'CivitAI (Roblox chibi doll, klein4b)',
        filename: 'loras/flux2-klein/styles/robloxchibidoll_lora_klein4b_000002200.safetensors',
        url: 'https://models.cubric.studio/vision/models/loras/flux2-klein/styles/robloxchibidoll_lora_klein4b_000002200.safetensors',
        size: '88.14MB',
        bytes: 92426632,
        sha256: 'e809c8257a5f58eee14d3ab55a0f8f8b81a41f33eb1f5a3eb79f964cdcc6b7de',
    },
    'klein-style-doodle': {
        id: 'klein-style-doodle',
        name: 'Klein Style — Doodle',
        origin: 'CivitAI (klein4b doodle v1)',
        filename: 'loras/flux2-klein/styles/klein4b-doodle_v1.safetensors',
        url: 'https://models.cubric.studio/vision/models/loras/flux2-klein/styles/klein4b-doodle_v1.safetensors',
        size: '22.05MB',
        bytes: 23122832,
        sha256: '5ad2d907fcaee23ae2f7b2a9bb125774cb3013d57b0a966fd050271825bdba67',
    },
    'klein-style-vintage': {
        id: 'klein-style-vintage',
        name: 'Klein Style — Vintage',
        origin: 'CivitAI (vintage photo, klein4b)',
        filename: 'loras/flux2-klein/styles/vintage_photo.safetensors',
        url: 'https://models.cubric.studio/vision/models/loras/flux2-klein/styles/vintage_photo.safetensors',
        size: '88.15MB',
        bytes: 92427896,
        sha256: '727ade732ac509d6cd2de73b21458973878bd8057851c70bd3aec0b337934c1b',
    },
    'klein-style-aesthetic': {
        id: 'klein-style-aesthetic',
        name: 'Klein Style — Aesthetic',
        origin: 'CivitAI (Flux Klein 4B Art)',
        filename: 'loras/flux2-klein/styles/Flux-Klein-4B-Art_10.safetensors',
        url: 'https://models.cubric.studio/vision/models/loras/flux2-klein/styles/Flux-Klein-4B-Art_10.safetensors',
        size: '183.78MB',
        bytes: 192702824,
        sha256: '7243d2664fa35beff2cc43e3e4073d98dfaef1ed16f8a462f3a7a6547c8cf98b',
    },
    // ── Klein 9B style LoRAs (MPI-598) ─────────────────────────────────────────
    // SEVEN styles, not eight, and NOT a 9B rebuild of the 4B rack. Only three are the
    // same creator's 9B build of the weight 4B ships — anime, chibi and doodle, each
    // hash-verified by its 4B sibling in the same repo being byte-identical to ours.
    // Muppets and JoJo have NO 9B weight in existence: searched CivArchive's full
    // 1,179-record Klein-9B catalogue, Hugging Face, and CivitAI's own API. The other
    // three are substitutes by DIFFERENT creators, so their label says what the weight
    // actually does — 'Comic' is a pulp/vintage comic LoRA, not JoJo, and 'Cartoon' is
    // Disney mid-century, not Fluxtoon. Naming them after the 4B slot they fill would be
    // a lie the picker tells the user.
    //
    // Index alignment is the same contract as 4B: dep ↔ styleLoraLabels[i] ↔
    // styleLoraImages[i] ↔ the trigger line ↔ the Nth lora slot walking the bank chain.
    // Both halves are BAKED per size by generate_klein.py from the one template, so a
    // slot and its trigger cannot drift apart without failing the build.
    //
    // LICENCES verified 2026-08-22 against the CivitAI API (flags) and the model page
    // (badge), the method in docs/models/klein/licences.md. ALL SEVEN grant `Image` — the
    // flag that decides it for us, since Vision is local and the user owns the output.
    // That is a cleaner set than 4B's, where chibi and doodle withhold it and ship on a
    // decision. Two require attribution and carry a `credit` block below; MpiAbout renders
    // the Credits list from those, so the obligation is discharged in data.
    // Research, hashes and download provenance:
    // .agents/mpi-kanban/tasks/MPI-598/research/klein9b-style-loras.md
    'klein-9b-style-storybook': {
        id: 'klein-9b-style-storybook',
        name: 'Klein 9B Style — Storybook',
        origin: 'CivitAI 2001580 (Disney Mid-Century Animation, Klein9B)',
        filename: 'loras/flux2-klein/styles/DisneyMidCenturyKlein9b.safetensors',
        url: 'https://models.cubric.studio/vision/models/loras/flux2-klein/styles/DisneyMidCenturyKlein9b.safetensors',
        mirrorUrl: 'https://huggingface.co/Mad-Pony-Interactive/cubric-studio/resolve/main/DisneyMidCenturyKlein9b.safetensors',
        size: '79.03MB',
        bytes: 82866728,
        sha256: '6a34fc3fc973a0cf052f3fd215cc916a804acf7c3456113429e10b636abd1a90',
        // allowNoCredit: false — attribution is obligatory, same mechanism as the 4B
        // anime LoRA. It also withholds allowDerivatives, which costs us nothing: we
        // ship it as-is and never merge it.
        credit: {
            author: 'ArsMachina',
            work: 'Disney Mid-Century Animation',
            url: 'https://civitai.com/models/2001580',
        },
    },
    'klein-9b-style-comic': {
        id: 'klein-9b-style-comic',
        name: 'Klein 9B Style — Comic',
        origin: 'CivitAI 2413450 (Retro comic PULPKHOR, Klein9B)',
        filename: 'loras/flux2-klein/styles/PULPKHOR.safetensors',
        url: 'https://models.cubric.studio/vision/models/loras/flux2-klein/styles/PULPKHOR.safetensors',
        mirrorUrl: 'https://huggingface.co/Mad-Pony-Interactive/cubric-studio/resolve/main/PULPKHOR.safetensors',
        size: '79.03MB',
        bytes: 82866728,
        sha256: '52f4a77c051ad349a71bc6174983f0bdc25e10a19fecc82e6a874b578953705e',
    },
    // The 9B twin of `klein-style-anime` — same creator, same CivitAI model page (2227157),
    // so the SAME licence and the SAME credit obligation apply. Model-level flags do not
    // vary by version; the page carries an Apache-2.0 badge and allowNoCredit: false.
    'klein-9b-style-anime': {
        id: 'klein-9b-style-anime',
        name: 'Klein 9B Style — Anime',
        origin: 'CivitAI 2227157 (New Mecha style, Flux2_klein_9B_V0.1)',
        filename: 'loras/flux2-klein/styles/New_Mecha_Klein9B.safetensors',
        url: 'https://models.cubric.studio/vision/models/loras/flux2-klein/styles/New_Mecha_Klein9B.safetensors',
        mirrorUrl: 'https://huggingface.co/Mad-Pony-Interactive/cubric-studio/resolve/main/New_Mecha_Klein9B.safetensors',
        size: '158.03MB',
        bytes: 165703960,
        sha256: 'da507ff8b28be59d74d65c5898b4d65d7fe3bb4a58ddf0ec847fa3a68f5375ba',
        credit: {
            author: 'n_Arno',
            work: 'New Mecha style',
            url: 'https://civitai.com/models/2227157',
        },
    },
    // OVERFITTED by its creator's own warning: recommended 0.7-0.95, "body horror" above.
    // The rack applies ONE global strength_model to whichever slot is selected, so this is
    // the style most likely to want the Stylization slider pulled down.
    'klein-9b-style-chibi': {
        id: 'klein-9b-style-chibi',
        name: 'Klein 9B Style — Chibi',
        origin: 'CivitAI 400063 (Roblox Chibi Doll bundle, klein9b-v1.0)',
        filename: 'loras/flux2-klein/styles/robloxchibidoll_lora_klein9b.safetensors',
        url: 'https://models.cubric.studio/vision/models/loras/flux2-klein/styles/robloxchibidoll_lora_klein9b.safetensors',
        mirrorUrl: 'https://huggingface.co/Mad-Pony-Interactive/cubric-studio/resolve/main/robloxchibidoll_lora_klein9b.safetensors',
        size: '158.03MB',
        bytes: 165704264,
        sha256: '478a610ba6061da7b554f5df5c33b8750a9178dfe9825e14c68c2b97f82baaa2',
    },
    // The creator ships TWO 9B versions at identical size (v1 and v2). v1 is wired; v2 is
    // on the authoring bench as the A/B alternate. Swapping means the dep filename, the
    // sha256 and the baked graph string all move together.
    'klein-9b-style-doodle': {
        id: 'klein-9b-style-doodle',
        name: 'Klein 9B Style — Doodle',
        origin: 'CivitAI 2593550 (Elusarca\'s Scribbly Doodle, V1 - Klein 9B)',
        filename: 'loras/flux2-klein/styles/klein9b-doodle_v1.safetensors',
        url: 'https://models.cubric.studio/vision/models/loras/flux2-klein/styles/klein9b-doodle_v1.safetensors',
        mirrorUrl: 'https://huggingface.co/Mad-Pony-Interactive/cubric-studio/resolve/main/klein9b-doodle_v1.safetensors',
        size: '39.53MB',
        bytes: 41448432,
        sha256: '45c82f5e593f77e1cb56a5de539834ab11ae46361ccc1be6869eaae940a9ee6f',
    },
    // RENAMED from the upstream `Vintage.safetensors` — a name that generic could not be
    // baked into a graph string and a dep filename permanently. Same bytes. NOTE the era
    // differs from 4B's vintage slot: this is 1960s-80s, 4B's is 1920s, which is why the
    // trigger text differs rather than being copied across.
    'klein-9b-style-vintage': {
        id: 'klein-9b-style-vintage',
        name: 'Klein 9B Style — Vintage',
        origin: 'CivitAI 2608763 (Real Vintage Photo, Flux9B)',
        filename: 'loras/flux2-klein/styles/Real_Vintage_Photo_klein9b.safetensors',
        url: 'https://models.cubric.studio/vision/models/loras/flux2-klein/styles/Real_Vintage_Photo_klein9b.safetensors',
        mirrorUrl: 'https://huggingface.co/Mad-Pony-Interactive/cubric-studio/resolve/main/Real_Vintage_Photo_klein9b.safetensors',
        size: '667.95MB',
        bytes: 700395928,
        sha256: '7ec32ba728ee4b42fb68074e8da5f8d965813c2ff3f17186141257a265d32d92',
    },
    'klein-9b-style-watercolour': {
        id: 'klein-9b-style-watercolour',
        name: 'Klein 9B Style — Watercolour',
        origin: 'CivitAI 2600302 (Amano Watercolor Sketch Style, Klein 9B)',
        filename: 'loras/flux2-klein/styles/amano_flux_02.safetensors',
        url: 'https://models.cubric.studio/vision/models/loras/flux2-klein/styles/amano_flux_02.safetensors',
        mirrorUrl: 'https://huggingface.co/Mad-Pony-Interactive/cubric-studio/resolve/main/amano_flux_02.safetensors',
        size: '260.05MB',
        bytes: 272684752,
        sha256: 'ea12b579b3c461438e644085d1c723c7ea9ce93e03eb4436c302ddc47b4ce875',
    },
    // ── Chroma style LoRAs (MPI-365) ───────────────────────────────────────────
    // Four styles on ONE MpiStyleLoras bank, index-aligned with the graph's trigger
    // lines and with styleLoraLabels/styleLoraImages on both Chroma cards. Model-only
    // (loraStrengths: ['model']) — the MpiLoraModel node has no clip input. Shared by
    // Chroma Flash and Chroma Hyper: the rack lives in the master template both tiers
    // are baked from, so neither card may carry a subset.
    //
    // Licences verified 2026-08-02 — table, method and reasoning in
    // docs/models/chroma/licences.md. A FIFTH style (Absolute CINEMA) was wired and then
    // DROPPED: its creator withheld `Image`, so a user could not sell what they generated
    // with it. It is gone from the graph too (rack renumbered) — do not re-add it.
    //
    // REMAINING GATE: the R2 upload (~955MB). The sha256 values below are of the LOCAL
    // files on the authoring bench — correct, but every URL 404s until that upload lands,
    // which is why Chroma is un-installable right now.
    'chroma-style-bwsketch': {
        id: 'chroma-style-bwsketch',
        name: 'Chroma Style — B&W Sketch',
        // Apache-2.0 on the model page, which is what licenses this and not the
        // RentCivit-only permission flags — see docs/models/chroma/licences.md.
        // Apache-2.0 §4 requires attribution, so the credit block is obligatory here.
        origin: 'CivitAI (Chroma - Complex Chaotic B&W Stuff v2.0, Apache-2.0)',
        filename: 'loras/chroma/styles/Complex_Chaotic_BW_Stuff.safetensors',
        url: 'https://models.cubric.studio/vision/models/loras/chroma/styles/Complex_Chaotic_BW_Stuff.safetensors',
        size: '213.83MB',
        bytes: 224216168,
        sha256: '69b5226e7ce7f31b11db8a2279edbd26f6623fe7ce7b49050f5a2159f037cb91',
        credit: {
            author: 'TijuanaSlumlord',
            work: 'Chroma - Complex Chaotic B&W Stuff',
            url: 'https://civitai.com/models/1978782',
        },
    },
    'chroma-style-lenovo': {
        id: 'chroma-style-lenovo',
        name: 'Chroma Style — Lenovo',
        // No licence on the model page, so the permission flags ARE the terms here —
        // and they grant Image/Rent/Sell. `allowDerivatives: false`: we ship it as-is
        // and never merge it, so that costs us nothing.
        origin: 'CivitAI (Lenovo UltraReal, v1.0 Chroma)',
        filename: 'loras/chroma/styles/lenovo_chroma.safetensors',
        url: 'https://models.cubric.studio/vision/models/loras/chroma/styles/lenovo_chroma.safetensors',
        size: '106.93MB',
        bytes: 112125552,
        sha256: 'df934b1a366206daa3b5dcfef7c84efd9e75ca19d00867d7fe24fa2bb233fdc9',
        credit: {
            author: 'Danrisi',
            work: 'Lenovo UltraReal',
            url: 'https://civitai.com/models/1662740',
        },
    },
    'chroma-style-brushwork': {
        id: 'chroma-style-brushwork',
        name: 'Chroma Style — Brushwork',
        // Apache-2.0 on the model page, same creator and same reasoning as bwsketch.
        origin: 'CivitAI (Chroma - Fine Tactile Brushwork v2.0, Apache-2.0)',
        filename: 'loras/chroma/styles/Fine_Tactile_Brushwork.safetensors',
        url: 'https://models.cubric.studio/vision/models/loras/chroma/styles/Fine_Tactile_Brushwork.safetensors',
        size: '213.83MB',
        bytes: 224216080,
        sha256: '7b594e78fb929a6dc6cc6a3dd94f87ba1489ae2774afd38d6514bf3476be307e',
        credit: {
            author: 'TijuanaSlumlord',
            work: 'Chroma - Fine Tactile Brushwork',
            url: 'https://civitai.com/models/1916402',
        },
    },
    'chroma-style-anime': {
        id: 'chroma-style-anime',
        // The one Chroma style whose creator waived attribution (`allowNoCredit: true`),
        // so it carries no `credit` block — that absence is verified, not an oversight.
        name: 'Chroma Style — Anime',
        origin: 'CivitAI (Illustrious Anime Collection, Chroma-Anime V3)',
        filename: 'loras/chroma/styles/Chroma-Anime-v3.safetensors',
        url: 'https://models.cubric.studio/vision/models/loras/chroma/styles/Chroma-Anime-v3.safetensors',
        size: '427.78MB',
        bytes: 448564344,
        sha256: 'd1c5756064bdbc6738bf24e6152c011b8ddaf0b93585963c381c3216318900fb',
    },
};
