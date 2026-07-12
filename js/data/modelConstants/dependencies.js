// ── Shared Dependencies ───────────────────────────────────────────────────────
// Defined once, referenced by id in model dependency lists to avoid repetition.
// *********
// IMPORTANT:
// 1 - If you need to change a URL, you have to set the SHA256 back to null.
// 2 - Universal engine WEIGHTS (upscalers, detector/SAM models) install with the engine
//     and are never GC'd with a model. Set engineAsset: true for those. (Custom nodes are
//     NOT engineAsset — their bake/volume split is driven by installRequirements; see #3.)
// 3 - Custom-node URLs are VERSION-LOCKED (MPI-117). They are NOT hardcoded here —
//     they are derived from dev_configs/node_lock.json via lockUrl(). To bump a node,
//     edit that lock file, NOT this file. The RunPod Pod image consumes the same lock.
// *********

import nodeLock from '../../../dev_configs/node_lock.json' with { type: 'json' };

// Resolve a locked custom-node id to its concrete download URL by `source`.
// registry   -> Comfy Registry CDN zip
// git-tag    -> GitHub tag archive
// git-commit -> GitHub commit archive (immutable)
export function lockUrl(id) {
    const e = nodeLock.nodes[id];
    if (!e) throw new Error(`[node_lock] no entry for "${id}"`);
    switch (e.source) {
        case 'registry':
            return `https://cdn.comfy.org/${e.publisher}/${e.node}/${e.version}/node.zip`;
        case 'git-tag':
            return `https://github.com/${e.repo}/archive/refs/tags/${e.tag}.zip`;
        case 'git-commit':
            return `https://github.com/${e.repo}/archive/${e.commit}.zip`;
        default:
            throw new Error(`[node_lock] unknown source "${e.source}" for "${id}"`);
    }
}

export const DEPS = {
    // Models
    'sdxl-realistic': {
        id: 'sdxl-realistic',
        name: 'SDXL Realistic',
        origin: 'Juggernaut_XL',
        filename: 'checkpoints/SDXL_Realistic.safetensors',
        url: 'https://models.cubric.studio/vision/models/checkpoints/SDXL_Realistic.safetensors',
        size: '6.62GB',
        sha256: '4bb646ca44e460bfc121fbcd8b7a65ae2b7a85f89c9e9ffe4d078db6e488d5ff'
    },
    'sdxl-nsfw': {
        id: 'sdxl-nsfw',
        name: 'SDXL NSFW',
        origin: 'lustify_7',
        filename: 'checkpoints/SDXL_NSFW.safetensors',
        url: 'https://models.cubric.studio/vision/models/checkpoints/SDXL_NSFW.safetensors',
        size: '6.46GB',
        sha256: '4073cbe470446d0f1806e82d560d14af5b813ec1091b26ad7a69f8162f4a7ac1'
    },
    'ill-anime': {
        id: 'ill-anime',
        name: 'ILL Anime',
        origin: 'animemix_v80',
        filename: 'checkpoints/ILL_Anime.safetensors',
        url: 'https://models.cubric.studio/vision/models/checkpoints/ILL_Anime.safetensors',
        size: '6.46GB',
        sha256: 'f548b5b4953c3ba71f9769c98005b95a41a7f8e0b666a509bb938cedf70347fd'
    },
    'ill-anime-beauty': {
        id: 'ill-anime-beauty',
        name: 'ILL Anime Beauty',
        origin: 'ramthrustsNSFWPINK_alchemyMix176',
        filename: 'checkpoints/ILL_Anime_Beauty.safetensors',
        url: 'https://models.cubric.studio/vision/models/checkpoints/ILL_Anime_Beauty.safetensors',
        size: '6.46GB',
        sha256: 'bbebe76d8fcc488b630d6dd74d111bb170b5d5c82a43fca0d99cd8e263766318'
    },
    'pony-mix': {
        id: 'pony-mix',
        name: 'PONY Mix',
        origin: 'animergemeij_v30VAE',
        filename: 'checkpoints/PONY_Mix.safetensors',
        url: 'https://models.cubric.studio/vision/models/checkpoints/PONY_Mix.safetensors',
        size: '6.62GB',
        sha256: '455ea6628d79546bb63147758522706f8a6592ade65f847da0aec8968bf29a4b'
    },
    // Video Models
    'wan-22-t2v-high': {
        id: 'wan-22-t2v-high',
        name: 'Wan 2.2 t2v',
        origin: 'smoothMixWan2214BI2V_t2vHighV30',
        filename: 'diffusion_models/Wan_22_t2v_High.safetensors',
        url: 'https://models.cubric.studio/vision/models/diffusion_models/Wan_22_t2v_High.safetensors',
        size: '13.55GB',
        sha256: '8032b4906fb1b4dffa407d5a5f5d663b9e0c403caed5bd3a02705b7577f2c870'
    },
    'wan-22-t2v-low': {
        id: 'wan-22-t2v-low',
        name: 'Wan 2.2 t2v',
        origin: 'smoothMixWan2214BI2V_t2vLowV30',
        filename: 'diffusion_models/Wan_22_t2v_Low.safetensors',
        url: 'https://models.cubric.studio/vision/models/diffusion_models/Wan_22_t2v_Low.safetensors',
        size: '13.55GB',
        sha256: 'e7bd6fc48159f57476d7a9d98f6fada2fd52c7070f4ba496c10610f5e399e38f'
    },
    'wan-22-i2v-high': {
        id: 'wan-22-i2v-high',
        name: 'Wan 2.2 i2v',
        origin: 'smoothMixWan2214BI2V_i2vV20High',
        filename: 'diffusion_models/Wan_22_i2v_High.safetensors',
        url: 'https://models.cubric.studio/vision/models/diffusion_models/Wan_22_i2v_High.safetensors',
        size: '13.32GB',
        sha256: '9620a680d91c88b4d3416f15013b37a1ff7bb96f71480d606c77aa8c6c2748b0'
    },
    'wan-22-i2v-low': {
        id: 'wan-22-i2v-low',
        name: 'Wan 2.2 i2v',
        origin: 'smoothMixWan2214BI2V_i2vV20Low',
        filename: 'diffusion_models/Wan_22_i2v_Low.safetensors',
        url: 'https://models.cubric.studio/vision/models/diffusion_models/Wan_22_i2v_Low.safetensors',
        size: '13.32GB',
        sha256: '51036c7ca9616b93eb3e990aa14686338f52f6a1da80acd6769d200a31e0068f'
    },
    // Wan 2.2 TI2V-5B (combined t2v+i2v single transformer — LTX-shape flat deps)
    'wan22-5b-model': {
        id: 'wan22-5b-model',
        name: 'Wan 2.2 5B',
        origin: 'Wan-AI/Wan2.2-TI2V-5B',
        filename: 'diffusion_models/wan2.2_ti2v_5B_fp16.safetensors',
        url: 'https://models.cubric.studio/vision/models/diffusion_models/wan2.2_ti2v_5B_fp16.safetensors',
        size: '9.31GB',
        sha256: '456f901338bd9eadbded3828b819109a9b68e8a525ca5cf8d0049a69fcfeca1e'
    },
    // Chroma Flash diffusion (Flux-family image model). MPI-217.
    'chroma1-hd-flash': {
        id: 'chroma1-hd-flash',
        name: 'Chroma1-HD-Flash',
        origin: 'lodestone-rock/Chroma (HD Flash)',
        filename: 'diffusion_models/Chroma1-HD-Flash.safetensors',
        url: 'https://models.cubric.studio/vision/models/diffusion_models/Chroma1-HD-Flash.safetensors',
        size: '17GB',
        sha256: '2c0c7d908d04418a48b453c293237a9826d54472cf0ba76e28697d1309d1021b'
    },
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
    // VAE
    'wan2.2_vae': {
        id: 'wan2.2_vae',
        name: 'wan2.2_vae',
        origin: 'Wan-AI/Wan2.2-TI2V-5B',
        filename: 'vae/wan2.2_vae.safetensors',
        url: 'https://models.cubric.studio/vision/models/vae/wan2.2_vae.safetensors',
        size: '1.31GB',
        sha256: 'e40321bd36b9709991dae2530eb4ac303dd168276980d3e9bc4b6e2b75fed156'
    },
    'wan_2.1_vae': {
        id: 'wan_2.1_vae',
        name: 'wan_2.1_vae',
        filename: 'vae/wan_2.1_vae.safetensors',
        url: 'https://models.cubric.studio/vision/models/vae/wan_2.1_vae.safetensors',
        size: '254MB',
        sha256: '2fc39d31359a4b0a64f55876d8ff7fa8d780956ae2cb13463b0223e15148976b'
    },
    // ── NVIDIA PiD upscaler (MPI-182) ──────────────────────────────────────────
    // One model, 4 VAE-locked checkpoints selected at runtime via Input_Type.
    // Compat = VAE latent space, not model name. gemma_2_2b_it_elm is SHARED by
    // all 4 paths (dedup automatic). Full research: docs/models/pid/upscaler.md.
    'pid-flux1': {
        id: 'pid-flux1',
        name: 'PiD Flux1 (1024→4096)',
        origin: 'Comfy-Org/PixelDiT',
        filename: 'diffusion_models/pid_flux1_1024_to_4096_4step_bf16.safetensors',
        url: 'https://models.cubric.studio/vision/models/diffusion_models/pid_flux1_1024_to_4096_4step_bf16.safetensors',
        size: '2.72GB',
        sha256: '17c282ed387edad7bfdd3189c5a17363d73e3d60b5e841dfded81c3b76e211ee'
    },
    'pid-sdxl': {
        id: 'pid-sdxl',
        name: 'PiD SDXL (1024→4096)',
        origin: 'Comfy-Org/PixelDiT',
        filename: 'diffusion_models/pid_sdxl_1024_to_4096_4step_bf16.safetensors',
        url: 'https://models.cubric.studio/vision/models/diffusion_models/pid_sdxl_1024_to_4096_4step_bf16.safetensors',
        size: '2.72GB',
        sha256: 'c8dd35d7d548a312f61f298d79c6f6a7731fc71031400533f91dbfb2c8a9cb02'
    },
    'pid-sd3': {
        id: 'pid-sd3',
        name: 'PiD SD3 (1024→4096)',
        origin: 'Comfy-Org/PixelDiT',
        filename: 'diffusion_models/pid_sd3_1024_to_4096_4step_bf16.safetensors',
        url: 'https://models.cubric.studio/vision/models/diffusion_models/pid_sd3_1024_to_4096_4step_bf16.safetensors',
        size: '2.72GB',
        sha256: 'f544e4b7cd414b0e3cae6c506f8b04560c2118fb9b9fcc39302b81c56377e271'
    },
    'pid-qwenimage': {
        id: 'pid-qwenimage',
        name: 'PiD Qwen-Image (1024→4096)',
        origin: 'Comfy-Org/PixelDiT',
        filename: 'diffusion_models/pid_qwenimage_1024_to_4096_4step_bf16.safetensors',
        url: 'https://models.cubric.studio/vision/models/diffusion_models/pid_qwenimage_1024_to_4096_4step_bf16.safetensors',
        size: '2.72GB',
        sha256: 'efa24eada8c414251410e786de96001b26d09701c3fe799a9f2eb0d7d3b8cf2d'
    },
    // VAEs are SHARED resources — named by the weight, NOT by PiD. ae.safetensors
    // backs Flux/Chroma/Z-Image/+; qwen_image_vae backs Qwen-Image/Edit/+. Future
    // models reference these ids directly → automatic dedup.
    'vae-flux-ae': {
        id: 'vae-flux-ae',
        name: 'Flux VAE (ae)',
        origin: 'Comfy-Org (flux ae)',
        filename: 'vae/ae.safetensors',
        url: 'https://models.cubric.studio/vision/models/vae/ae.safetensors',
        size: '335MB',
        sha256: 'afc8e28272cd15db3919bacdb6918ce9c1ed22e96cb12c4d5ed0fba823529e38'
    },
    'vae-sdxl': {
        id: 'vae-sdxl',
        name: 'SDXL VAE',
        origin: 'stabilityai/sdxl-vae',
        filename: 'vae/sdxl_vae.safetensors',
        url: 'https://models.cubric.studio/vision/models/vae/sdxl_vae.safetensors',
        size: '335MB',
        sha256: '63aeecb90ff7bc1c115395962d3e803571385b61938377bc7089b36e81e92e2e'
    },
    'vae-sd3': {
        id: 'vae-sd3',
        name: 'SD3 VAE',
        origin: 'nvidia/PiD (sd3_vae)',
        filename: 'vae/sd3_vae.safetensors',
        url: 'https://models.cubric.studio/vision/models/vae/sd3_vae.safetensors',
        size: '168MB',
        sha256: 'f9b67a279283625caee39d61eacb5324243848477b4eb535355eaaa8423d4e09'
    },
    'vae-qwen-image': {
        id: 'vae-qwen-image',
        name: 'Qwen-Image VAE',
        origin: 'Comfy-Org/Qwen-Image_ComfyUI',
        filename: 'vae/qwen_image_vae.safetensors',
        url: 'https://models.cubric.studio/vision/models/vae/qwen_image_vae.safetensors',
        size: '254MB',
        sha256: 'a70580f0213e67967ee9c95f05bb400e8fb08307e017a924bf3441223e023d1f'
    },
    // ── Krea2 (MPI-242) ──────────────────────────────────────────────────────
    // Flux-lineage in ARCHITECTURE ONLY — the conditioning + VAE stack is Qwen.
    // Reuses `vae-qwen-image` above (zero upload). `vae-flux-ae` is the WRONG dep.
    // Turbo ships first; Raw (52-step) is phase 2. Quant variants (int8_convrot /
    // mxfp8 / nvfp4) exist and are native in comfy 0.27 — see
    // docs/models/krea2/int8-quant.md. We ship the SFW fp8_scaled transformer
    // and the NSFW int8_convrot transformer (Coyote's Lustify v10 KREA-Turbo) as two
    // INDEPENDENT models — a user can install BOTH (unlike LTX's mutually-exclusive arch
    // variants). Each is its own ModelDef; the two share every other dep.
    'krea2-turbo-transformer': {
        id: 'krea2-turbo-transformer',
        name: 'Krea2 Turbo Transformer (fp8_scaled)',
        origin: 'Comfy-Org/Krea-2',
        filename: 'diffusion_models/krea2_turbo_fp8_scaled.safetensors',
        url: 'https://models.cubric.studio/vision/models/diffusion_models/krea2_turbo_fp8_scaled.safetensors',
        size: '12.24GB',
        sha256: 'eb4dd8c612cfd10f64f25b057e6e6bbcb5737c94a7372177e456dbf7579502f1',
    },
    // NSFW variant — Lustify v10 KREA-Turbo, int8_convrot quant. INT8 tensor-core path
    // is native in our ComfyUI (0.27). Runs on any NVIDIA RTX (Turing+); see the NSFW
    // ModelDef description for the end-user GPU note. Same size class as the SFW weight.
    'krea2-turbo-transformer-nsfw': {
        id: 'krea2-turbo-transformer-nsfw',
        name: 'Krea2 Turbo Transformer NSFW (int8_convrot)',
        origin: 'Comfy-Org/Krea-2',
        filename: 'diffusion_models/lustify-v10-krea-turbo-int8_convrot.safetensors',
        url: 'https://models.cubric.studio/vision/models/diffusion_models/lustify-v10-krea-turbo-int8_convrot.safetensors',
        size: '12.25GB',
        sha256: '0505412ed2ac568286c4bf43f8ace93f9f5a6dd7a607f47f1912a68767e6900d',
    },
    'krea2-qwen3vl-clip': {
        id: 'krea2-qwen3vl-clip',
        name: 'Krea2 Text Encoder (Qwen3-VL-4B fp8_scaled)',
        origin: 'Comfy-Org/Krea-2',
        // Qwen3-VL-4B (hidden 2560). NOT qwen_2.5_vl_7b (hidden 3584) — different model.
        filename: 'text_encoders/qwen3vl_4b_fp8_scaled.safetensors',
        url: 'https://models.cubric.studio/vision/models/text_encoders/qwen3vl_4b_fp8_scaled.safetensors',
        size: '4.88GB',
        sha256: '54bd5144df0bbc25dd6ccadfcb826b521445a1b06ae5a42570bdd2974ca87094',
    },
    // Baked LoRAs — loaded by the workflow, not user slots. They travel with the
    // model (same pattern as LTX's 3 + Wan-5B's 1). Subfoldered under loras/krea-2/;
    // ComfyUI lists them BACKSLASHED (`krea-2\style\...`) — rides the MPI-229 heal.
    'krea2-lora-depth-control': {
        id: 'krea2-lora-depth-control',
        name: 'Krea2 Depth ControlNet LoRA',
        origin: 'Patil/Krea-2-depth-controlnet',
        filename: 'loras/krea-2/control/depth-control-lora.safetensors',
        url: 'https://models.cubric.studio/vision/models/loras/krea-2/control/depth-control-lora.safetensors',
        size: '822MB',
        sha256: 'fb80547ed79b47c1e3fea7bb9d36297e3917b2115fab6700ca1501350f9f483c',
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
    // ── Boogu-Image-Edit (MPI-257) ────────────────────────────────────────────
    // Unified 10B image edit, Apache-2.0. Native ComfyUI (comfy_extras/nodes_boogu.py
    // — TextEncodeBooguEdit, no baked node). Three quality TIERS ship as three sibling
    // ModelDefs (modelFamily 'Boogu-Image-Edit'), one transformer each; same graph,
    // Input_Tier baked per file. CLIP = Qwen3-VL-8B (distinct from krea2's 4B),
    // VAE = shared vae-flux-ae (zero upload). bf16 is 19.17 binary GB — UNDER the 20GB
    // hot-store gate, stays on the volume.
    'boogu-edit-transformer-high': {
        id: 'boogu-edit-transformer-high',
        name: 'Boogu Image Edit Transformer (bf16, High)',
        origin: 'Boogu/Boogu-Image-0.1-Edit',
        filename: 'diffusion_models/boogu_image_edit_bf16.safetensors',
        url: 'https://models.cubric.studio/vision/models/diffusion_models/boogu_image_edit_bf16.safetensors',
        size: '20.59GB',
        sha256: '6374c9d1f4faa17d0204df6d20f777ed348bc1ac22f778e46ac79d554c67e3b1',
    },
    'boogu-edit-transformer-balanced': {
        id: 'boogu-edit-transformer-balanced',
        name: 'Boogu Image Edit Transformer (fp8_scaled, Balanced)',
        origin: 'Boogu/Boogu-Image-0.1-Edit-fp8',
        filename: 'diffusion_models/boogu_image_edit_fp8_scaled.safetensors',
        url: 'https://models.cubric.studio/vision/models/diffusion_models/boogu_image_edit_fp8_scaled.safetensors',
        size: '10.31GB',
        sha256: '1b9da944fdde5fdee4bbae874da68682bf9787e59fc90a473664547e342f8575',
    },
    'boogu-edit-transformer-low': {
        id: 'boogu-edit-transformer-low',
        name: 'Boogu Image Edit Transformer (turbo int8_convrot, Low)',
        origin: 'Boogu/Boogu-Image-0.1-Edit-Turbo',
        filename: 'diffusion_models/boogu_image_edit_turbo_int8_convrot.safetensors',
        url: 'https://models.cubric.studio/vision/models/diffusion_models/boogu_image_edit_turbo_int8_convrot.safetensors',
        size: '11.37GB',
        sha256: 'c242eca52f1388102e1fd8644945875a09ea3e85f5e944c42114c6a72328e440',
    },
    // Qwen3-VL-8B fp8_scaled (hidden 4096) — Boogu's text encoder, `type: 'boogu'` in
    // the CLIPLoader. Distinct weight from krea2-qwen3vl-clip (4B). Shared by all three
    // Boogu tiers.
    'boogu-qwen3vl-8b-clip': {
        id: 'boogu-qwen3vl-8b-clip',
        name: 'Boogu Text Encoder (Qwen3-VL-8B fp8_scaled)',
        origin: 'Boogu/Boogu-Image-0.1-Edit',
        filename: 'text_encoders/qwen3vl_8b_fp8_scaled.safetensors',
        url: 'https://models.cubric.studio/vision/models/text_encoders/qwen3vl_8b_fp8_scaled.safetensors',
        size: '10.59GB',
        sha256: '4ba424cf62e51392e4d1a39933e803706f4e823c1065f36aaf149c6453f66bcd',
    },
    'pid-gemma': {
        id: 'pid-gemma',
        name: 'PiD Gemma text encoder',
        origin: 'Comfy-Org/PixelDiT',
        filename: 'text_encoders/gemma_2_2b_it_elm_bf16.safetensors',
        url: 'https://models.cubric.studio/vision/models/text_encoders/gemma_2_2b_it_elm_bf16.safetensors',
        size: '5.23GB',
        sha256: 'e7ae59c203c392db4aa4e27783e924ec3225eb563392260cf747e1130ffcdb88'
    },
    // CLIP
    'umt5_xxl_fp8_e4m3fn_scaled': {
        id: 'umt5_xxl_fp8_e4m3fn_scaled',
        name: 'umt5_xxl_fp8_e4m3fn_scaled',
        filename: 'text_encoders/umt5_xxl_fp8_e4m3fn_scaled.safetensors',
        url: 'https://models.cubric.studio/vision/models/text_encoders/umt5_xxl_fp8_e4m3fn_scaled.safetensors',
        size: '6.27GB',
        sha256: 'c3355d30191f1f066b26d93fba017ae9809dce6c627dda5f6a66eaa651204f68'
    },
    // Chroma T5 text encoder (shared Flux-family t5xxl fp16). MPI-217.
    't5xxl-fp16': {
        id: 't5xxl-fp16',
        name: 't5xxl_fp16',
        filename: 'text_encoders/t5xxl_fp16.safetensors',
        url: 'https://models.cubric.studio/vision/models/text_encoders/t5xxl_fp16.safetensors',
        size: '9.2GB',
        sha256: '6e480b09fae049a72d2a8c5fbccb8d3e92febeb233bbe9dfe7256958a9167635'
    },
    // Upscale Models --------------------------------------------------------
    '4x-NMKD-Siax': {
        id: '4x-NMKD-Siax',
        name: '4x NMKD-Siax 200k',
        filename: 'upscale_models/4x_NMKD-Siax_200k.pth',
        url: 'https://models.cubric.studio/vision/models/upscale_models/4x_NMKD-Siax_200k.pth',
        size: '67MB',
        sha256: '560424d9f68625713fc47e9e7289a98aabe1d744e1cd6a9ae5a35e9957fd127e',
        engineAsset: true,
    },
    '4x-AnimeSharp': {
        id: '4x-AnimeSharp',
        name: '4x-AnimeSharp',
        filename: 'upscale_models/4x-AnimeSharp.pth',
        url: 'https://models.cubric.studio/vision/models/upscale_models/4x-AnimeSharp.pth',
        size: '65MB',
        sha256: 'e7a7de2dafd7331c1992862bbbcd9e9712a9f9f8e6303f0aaa59b4341d359bab',
        engineAsset: true,
    },
    // LTX-2.3 (MPI-127) ------------------------------------------------------
    // Ship deps = exactly what LTX_i2v_t2v_template.json references (workflow
    // scan 2026-06-25), NOT the broader mpi-ci install set (which pulls extra
    // weights for deferred branches: head-swap, pose, lipdub). Base files come
    // from stable upstreams tonight (Kijai/Lightricks/valiantcat); self-hosting
    // them to MPI HF is a post-release follow-up card. sha256 = null until
    // mpic-compute-dep-hashes is run.
    // LTX-2.3 transformer — bf16, SHARED across both engines (MPI-190: engine split
    // reverted, GGUF removed). cu130 collapsed the aimdo cold-fault tax that the Q8_0
    // GGUF transformer existed to dodge, and bf16 also removes the ComfyUI-GGUF dequant
    // upcast spike that OOM'd LTX i2v on the 24GB 4090. Loads via UNETLoader from
    // diffusion_models/. One transformer, one dep, both engines.
    'ltx23-transformer-bf16': {
        id: 'ltx23-transformer-bf16',
        name: 'LTX-2.3 22B Distilled Transformer (bf16)',
        origin: 'Kijai/LTX2.3_comfy',
        filename: 'diffusion_models/ltx-2.3-22b-distilled-1.1_transformer_only_bf16.safetensors',
        url: 'https://models.cubric.studio/vision/models/diffusion_models/ltx-2.3-22b-distilled-1.1_transformer_only_bf16.safetensors',
        size: '41GB',
        sha256: 'cf9c5aafda70d495ff7c9bd3d591899b3cefe679a1a2458feee4c5b6ff9db249',
    },
    // MPI-200 balanced tier — arch-gated transformers. fp8_scaled = Ada/Ampere/
    // Turing (weight-only fp8, dequant to bf16 matmul, loads anywhere); mxfp8_block32
    // = Blackwell native tensor path (weight_dtype=mxfp8, our v0.27+cu130 stack).
    // Kijai comfy-format ONLY — the official Lightricks fp8 repo is broken. Selected
    // per machine by the `variants.arch` resolver axis; only ONE installs per GPU.
    'ltx23-transformer-fp8': {
        id: 'ltx23-transformer-fp8',
        name: 'LTX-2.3 22B Distilled Transformer (fp8_scaled)',
        origin: 'Kijai/LTX2.3_comfy',
        filename: 'diffusion_models/ltx-2.3-22b-distilled-1.1_transformer_only_fp8_scaled.safetensors',
        url: 'https://models.cubric.studio/vision/models/diffusion_models/ltx-2.3-22b-distilled-1.1_transformer_only_fp8_scaled.safetensors',
        size: '25.2GB',
        sha256: '0a1d7aac2b338e8ec7e832149f1dcf11c9323272482b1cca0673d229702370f0',
    },
    'ltx23-transformer-mxfp8': {
        id: 'ltx23-transformer-mxfp8',
        name: 'LTX-2.3 22B Distilled Transformer (mxfp8_block32)',
        origin: 'Kijai/LTX2.3_comfy',
        filename: 'diffusion_models/ltx-2.3-22b-distilled-1.1_transformer_only_mxfp8_block32.safetensors',
        url: 'https://models.cubric.studio/vision/models/diffusion_models/ltx-2.3-22b-distilled-1.1_transformer_only_mxfp8_block32.safetensors',
        size: '24.1GB',
        sha256: 'b7a945ff24d65ad22c6977787c2e594e74df226e35f1f9dedb64be8fdbd6ffd8',
    },
    'ltx23-video-vae': {
        id: 'ltx23-video-vae',
        name: 'LTX-2.3 Video VAE (bf16)',
        origin: 'Kijai/LTX2.3_comfy',
        filename: 'vae/LTX23_video_vae_bf16.safetensors',
        url: 'https://models.cubric.studio/vision/models/vae/LTX23_video_vae_bf16.safetensors',
        size: '1.45GB',
        sha256: '01ea62d09bc139f95c5dee7b5c062ad6a3e6cd8be910a1983ac02e7eb5b8ee3b',
    },
    'ltx23-audio-vae': {
        id: 'ltx23-audio-vae',
        name: 'LTX-2.3 Audio VAE (bf16)',
        origin: 'Kijai/LTX2.3_comfy',
        filename: 'vae/LTX23_audio_vae_bf16.safetensors',
        url: 'https://models.cubric.studio/vision/models/vae/LTX23_audio_vae_bf16.safetensors',
        size: '370MB',
        sha256: '5bc10fa4adecf99dda132d916e23048cbd56797702c5fa50eb5d2079048a38c3',
    },
    'ltx23-text-projection': {
        id: 'ltx23-text-projection',
        name: 'LTX-2.3 Text Projection (bf16)',
        origin: 'Kijai/LTX2.3_comfy',
        filename: 'text_encoders/ltx-2.3_text_projection_bf16.safetensors',
        url: 'https://models.cubric.studio/vision/models/text_encoders/ltx-2.3_text_projection_bf16.safetensors',
        size: '2.31GB',
        sha256: '911d59bb4cb7708179c9a0045ea0fe41212ecfb77aed3a02702b7c0a8274911f',
    },
    // Gemma fp4_mixed CLIP — SHARED across every engine and tier (local + Pod, low
    // + balanced). NOT engine-split: the Q4 GGUF Gemma was dropped (it OOM'd a
    // 32GB/90GB Pod + threw key errors — the GGUF Gemma isn't ComfyUI-compatible),
    // and fp4_mixed is the recommended path (minor quality trade). One clip loader
    // in the template, one dep here. (MPI-168)
    'ltx23-gemma-clip': {
        id: 'ltx23-gemma-clip',
        name: 'Gemma 3 12B fp4_mixed (LTX CLIP)',
        origin: 'Mad-Pony-Interactive/cubric-studio',
        filename: 'text_encoders/gemma_3_12B_it_fp4_mixed.safetensors',
        url: 'https://models.cubric.studio/vision/models/text_encoders/gemma_3_12B_it_fp4_mixed.safetensors',
        size: '9.45GB',
        sha256: 'aaca463d11e6d8d2a4bdb0d6299214c15ef78a3f73e0ef8113d5a9d0219b3f6d',
    },
    'ltx23-spatial-upscaler': {
        id: 'ltx23-spatial-upscaler',
        name: 'LTX-2.3 Spatial Upscaler x2 (stage-2)',
        origin: 'Lightricks/LTX-2.3',
        filename: 'latent_upscale_models/ltx-2.3-spatial-upscaler-x2-1.1.safetensors',
        url: 'https://models.cubric.studio/vision/models/latent_upscale_models/ltx-2.3-spatial-upscaler-x2-1.1.safetensors',
        size: '1.5GB',
        sha256: '5f416311fa8172b65af67530758964708d29a317b830d689a51143b7f91913ed',
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
    // Nodes -----------------------------------------------------------------
    'ComfyUI-LTXVideo': {
        id: 'ComfyUI-LTXVideo',
        name: 'ComfyUI-LTXVideo',
        type: 'custom_nodes',
        filename: 'ComfyUI-LTXVideo',
        url: lockUrl('ComfyUI-LTXVideo'),
        installRequirements: true,
        // Its requirements.txt has an UNPINNED `kornia`, which resolves to 0.8.3 —
        // that release removed `kornia.geometry.transform.pyramid.pad`, so the node
        // import fails (`cannot import name 'pad'`) and LTXVNormalizingSampler et al
        // never register → "Node 'Stage1_Bypass' not found" at gen time. Pin 0.8.2.
        // See [[project-ltxvideo-kornia-pad]].
        pipPins: ['kornia==0.8.2'],
        size: '70MB',
    },
    'ComfyUI-MpiNodes': {
        id: 'ComfyUI-MpiNodes',
        name: 'ComfyUI-MpiNodes',
        type: 'custom_nodes',
        filename: 'ComfyUI-MpiNodes',
        url: lockUrl('ComfyUI-MpiNodes'),
        installRequirements: false,
        size: '1.76MB',
    },
    'ComfyUI-PainterI2Vadvanced': {
        id: 'ComfyUI-PainterI2Vadvanced',
        name: 'ComfyUI-PainterI2Vadvanced',
        type: 'custom_nodes',
        filename: 'ComfyUI-PainterI2Vadvanced',
        url: lockUrl('ComfyUI-PainterI2Vadvanced'),
        installRequirements: false,
        size: '144KB',
    },
    'ComfyUI-VideoHelperSuite': {
        id: 'ComfyUI-VideoHelperSuite',
        name: 'ComfyUI-VideoHelperSuite',
        type: 'custom_nodes',
        filename: 'comfyui-videohelpersuite',
        url: lockUrl('ComfyUI-VideoHelperSuite'),
        installRequirements: false,
        size: '806KB',
    },
    'ComfyUI-Impact-Pack': {
        id: 'ComfyUI-Impact-Pack',
        name: 'ComfyUI Impact Pack',
        type: 'custom_nodes',
        filename: 'comfyui-impact-pack',
        url: lockUrl('ComfyUI-Impact-Pack'),
        installRequirements: true,
        // requirements.txt is UNPINNED (numpy, scipy, transformers, opencv-python-headless,
        // scikit-image, matplotlib, …) → a --upgrade install can major-bump a SHARED package
        // engine-wide (MPI-217 class). Pin the drift-risky ones to the live proven-good set
        // (captured from a working local engine, MPI-222). pipPins run AFTER reqs (corrective).
        pipPins: [
            'numpy==2.5.1', 'opencv-python-headless==5.0.0.93', 'scipy==1.18.0',
            'scikit-image==0.26.0', 'transformers==5.13.0', 'matplotlib==3.11.0',
        ],
        size: '5MB',
    },
    'comfyui-kjnodes': {
        id: 'comfyui-kjnodes',
        name: 'ComfyUI KJNodes',
        type: 'custom_nodes',
        filename: 'comfyui-kjnodes',
        url: lockUrl('comfyui-kjnodes'),
        installRequirements: true,
        // Unpinned reqs (pillow, color-matcher, matplotlib, mss, opencv-python-headless).
        // Live proven-good pins (MPI-222). Shared pins match the other nodes' set.
        pipPins: [
            'pillow==12.3.0', 'matplotlib==3.11.0', 'opencv-python-headless==5.0.0.93',
            'color-matcher==0.6.0', 'mss==10.2.0',
        ],
        size: '28MB',
    },
    // MPI-190: ComfyUI-GGUF removed. It existed only to load the Q8_0 GGUF LTX
    // transformer, which is deleted (bf16 now runs on both engines). It is NOT in any
    // model's dependencies[], so the app never installs it. The node still ships in the
    // Pod image (node_lock.json) because KJNodes' GGUFLoaderKJ hard-imports city96's
    // gguf_sd_loader at load — dropping it from the Pod needs a KJNodes-load check
    // first, so that cleanup is a separate Pod-rebuild task.
    'ComfyUI-UltimateSDUpscale': {
        id: 'ComfyUI-UltimateSDUpscale',
        name: 'ComfyUI Ultimate SD Upscale',
        type: 'custom_nodes',
        filename: 'comfyui_ultimatesdupscale',
        url: lockUrl('ComfyUI-UltimateSDUpscale'),
        installRequirements: false,
        size: '940KB',
    },
    'ComfyUI-Frame-Interpolation': {
        id: 'ComfyUI-Frame-Interpolation',
        name: 'ComfyUI Impact Subpack',
        type: 'custom_nodes',
        filename: 'comfyui-frame-interpolation',
        url: lockUrl('ComfyUI-Frame-Interpolation'),
        installRequirements: true,
        installRequirementsCommand: 'python install.py',
        // install.py resolves requirements-*.txt (numpy, kornia, scipy, Pillow, opencv-
        // contrib, torch-family). torch/torchvision/einops/tqdm are engine-managed/baked
        // and opencv-contrib is redundant with the headless build already present — pin
        // only the drift-risky shared libs to the live set (MPI-222). pipPins run AFTER.
        pipPins: ['numpy==2.5.1', 'kornia==0.8.2', 'scipy==1.18.0', 'pillow==12.3.0'],
        size: '37.4MB',
    },
    // RIFE 4.7 weight for ComfyUI-Frame-Interpolation (MPI-222). The node HARD-CODES
    // its scan dir to <node>/ckpts/rife/ (vfi_utils config.yaml + MODEL_TYPE) and does
    // NOT read extra_model_paths.yaml, so this weight can't live in mpi_models/ like
    // the other engine assets — it MUST land inside the node folder. `targetPath` pins
    // it there. Without this, the weight was an untracked lazy GitHub fetch on first
    // node execution (fragile: stalls/fails if GH is down) AND was silently deleted by
    // the node-drift pre-wipe. As a tracked engineAsset it now boot-installs when
    // missing + self-heals (node re-clone wipes it → this dep re-installs it). Source =
    // R2 (the same proven copy the Pod bakes from marduk191/rife). sha verified.
    'rife47': {
        id: 'rife47',
        name: 'RIFE 4.7',
        filename: 'rife47.pth',
        targetPath: 'custom_nodes/comfyui-frame-interpolation/ckpts/rife',
        url: 'https://models.cubric.studio/vision/models/frame_interpolation/rife/rife47.pth',
        size: '20.4MB',
        sha256: '6a8a825ab2750558bdd20dcced386fd82b7222c7ba58c11d3b611d9c44f1be63',
        engineAsset: true,
    },
    'ComfyUI-Impact-Subpack': {
        id: 'ComfyUI-Impact-Subpack',
        name: 'ComfyUI Impact Subpack',
        type: 'custom_nodes',
        filename: 'ComfyUI-Impact-Subpack',
        url: lockUrl('ComfyUI-Impact-Subpack'),
        installRequirements: true,
        // Unpinned reqs (matplotlib, ultralytics>=8.3.162, numpy, opencv-python-headless,
        // dill). Live proven-good pins (MPI-222). ultralytics floats a minor — pin exact.
        pipPins: [
            'matplotlib==3.11.0', 'ultralytics==8.4.78', 'numpy==2.5.1',
            'opencv-python-headless==5.0.0.93', 'dill==0.4.1',
        ],
        size: '172KB',
    },
    // RES4LYF (ClownShark sampler family + ReChromaPatcher). Used by Chroma. All
    // custom_nodes are now universal (MPI-222) — installs with the engine and never
    // GC'd with a model; baked into the Pod image because it has pip requirements.
    // requirements.txt: opencv-python, matplotlib, pywavelets, numpy>=1.26.4.
    // Those are UNPINNED — with --upgrade, install pulls newest across the WHOLE
    // engine (MPI-217 bit this: opencv-python 4.13→5.0 major + numpy 2.5.0→2.5.1).
    // Pin to the proven-good set (live-verified Chroma gen on 5.0.0/2.5.1) so a
    // future install / engine reinstall can't drift the shared env. Same guard as
    // ComfyUI-LTXVideo's kornia pin. pipPins run AFTER requirements (corrective).
    'RES4LYF': {
        id: 'RES4LYF',
        name: 'RES4LYF',
        type: 'custom_nodes',
        filename: 'RES4LYF',
        url: lockUrl('RES4LYF'),
        installRequirements: true,
        pipPins: ['opencv-python==5.0.0.93', 'numpy==2.5.1'],
        size: '15MB',
    },
    // Krea2 depth-ControlNet loader/encoder/apply (MPI-242). Code-only — the repo is
    // just `__init__.py` + `nodes.py`, NO requirements.txt ⇒ installRequirements:false
    // ⇒ volume-installed on the Pod at connect, NO image rebuild.
    // NOTE: its three node CLASSES must exist for EVERY Krea2 t2i run, not just
    // pose-reference — ComfyUI validates the whole graph before the MpiIfElse picks a
    // branch. This dep is mandatory, not optional.
    'ComfyUI-Krea2-ControlNet': {
        id: 'ComfyUI-Krea2-ControlNet',
        name: 'ComfyUI Krea2 ControlNet',
        type: 'custom_nodes',
        filename: 'ComfyUI-Krea2-ControlNet',
        url: lockUrl('ComfyUI-Krea2-ControlNet'),
        installRequirements: false,
        size: '52KB',
    },
    // Preprocessors (DepthAnythingV2Preprocessor via AIO_Preprocessor) for the Krea2
    // depth ControlNet (MPI-242). HAS a requirements.txt ⇒ installRequirements:true
    // ⇒ BAKED into the Pod image (needs POD_IMAGE_VERSION bump + rebuild).
    //
    // ⚠ FIRST baked node whose requirements.txt lists bare `torch` + `torchvision`
    // (no version constraint). The node does NOT need a different torch — our
    // 2.12.0+cu130 satisfies it. The danger is OUR flag: the default installer runs
    // `pip install -r requirements.txt --upgrade`, and `--upgrade` on an unconstrained
    // name resolves from PyPI, which has no `+cu130` wheels. Empirically verified:
    //   pip install --dry-run --upgrade torch      → "Would install torch-2.13.0"  ✗
    //   pip install --dry-run -r requirements.txt  → "torch ... (2.12.0+cu130)" satisfied ✓
    // Losing +cu130 destroys the ~10x cold fault-in fix (MPI-187).
    //
    // So: override the install with a NON-upgrade pip run. `installRequirementsCommand`
    // replaces the default pip path entirely and runs inside the node folder.
    // (pipPins can NOT fix this — `pip install torch==2.12.0+cu130` has no
    // --index-url here and those wheels aren't on PyPI, so the pin would FAIL and
    // abort the whole node install.) The Dockerfile solves the same hazard for
    // ComfyUI's own unpinned `torch` by re-pinning the cu130 trio afterwards.
    //
    // Remaining unpinned shared libs are corrected by pipPins AFTER the install.
    // Also pulls mediapipe (absent today), fvcore, omegaconf, onnxruntime-gpu.
    'comfyui_controlnet_aux': {
        id: 'comfyui_controlnet_aux',
        name: 'ComfyUI ControlNet Aux (preprocessors)',
        type: 'custom_nodes',
        filename: 'comfyui_controlnet_aux',
        url: lockUrl('comfyui_controlnet_aux'),
        installRequirements: true,
        installRequirementsCommand: 'python -m pip install -r requirements.txt --no-warn-script-location',
        pipPins: [
            'numpy==2.5.1', 'opencv-python==5.0.0.93', 'pillow==12.3.0',
            'scipy==1.18.0', 'scikit-image==0.26.0', 'einops==0.8.2',
        ],
        size: '42.7MB',
    },
    'face-yolov8n': {
        id: 'face-yolov8n',
        name: 'face_yolov8n.pt',
        filename: 'ultralytics/bbox/face_yolov8n.pt',
        url: 'https://models.cubric.studio/vision/models/ultralytics/bbox/face_yolov8n.pt',
        size: '5.9MB',
        sha256: '70b640f8f60b1cf0dcc72f30caf3da9495eb2fb6509da48c53374ad6806e6a9c',
        engineAsset: true,
    },
    'hand-yolov8n': {
        id: 'hand-yolov8n',
        name: 'hand_yolov8n.pt',
        filename: 'ultralytics/bbox/hand_yolov8n.pt',
        url: 'https://models.cubric.studio/vision/models/ultralytics/bbox/hand_yolov8n.pt',
        size: '5.9MB',
        sha256: '3991202eb69e9ddcb3b9ba80cdeb41e734ffaf844403d6c9f47d515cd88c6f29',
        engineAsset: true,
    },
    'person-yolov8n-seg': {
        id: 'person-yolov8n-seg',
        name: 'person_yolov8n-seg.pt',
        filename: 'ultralytics/bbox/person_yolov8n-seg.pt',
        url: 'https://models.cubric.studio/vision/models/ultralytics/bbox/person_yolov8n-seg.pt',
        size: '6.9MB',
        sha256: '38fc8aaae97cb6e70be4ec44770005b26ed473471362afcda62a0037d7ccf432',
        engineAsset: true,
    },
    'sam-vit-b': {
        id: 'sam-vit-b',
        name: 'SAM ViT-B',
        filename: 'sams/sam_vit_b_01ec64.pth',
        url: 'https://models.cubric.studio/vision/models/sams/sam_vit_b_01ec64.pth',
        size: '367MB',
        sha256: 'ec2df62732614e57411cdcf32a23ffdf28910380d03139ee0f4fcbe91eb8c912',
        engineAsset: true,
    },
};
