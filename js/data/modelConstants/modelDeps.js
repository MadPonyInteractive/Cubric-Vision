// ── Model Dependencies (transformers / checkpoints) ───────────────────────────
// Split out of dependencies.js (which re-exports these as part of DEPS).
// ONLY the picked generative models: checkpoints + diffusion_models transformers.
// Their support weights (VAE, text_encoders/CLIP, upscalers, detectors, SAM, RIFE)
// live in assetDeps.js; LoRAs in loraDeps.js; custom_nodes in nodesDeps.js.
// IMPORTANT: if you need to change a URL, you have to set the SHA256 back to null.

export const modelDeps = {
    // Image checkpoints
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
    // Chroma Hyper — low-tier sibling of Chroma Flash (int8, Danrisi mix + Hyper/Turbo
    // distill). Same op shape + support stack as Flash; only this diffusion weight differs.
    'chroma1-hd-hyper': {
        id: 'chroma1-hd-hyper',
        name: 'Chroma1-HD-Hyper',
        origin: 'lodestone-rock/Chroma (HD DanrisiMix Hyper-Flash-Turbo int8)',
        filename: 'diffusion_models/Chroma1-HD-DanrisiMix-Hyper-Flash-Turbo-int8-convrot-simple.safetensors',
        url: 'https://models.cubric.studio/vision/models/diffusion_models/Chroma1-HD-DanrisiMix-Hyper-Flash-Turbo-int8-convrot-simple.safetensors',
        size: '9.2GB',
        sha256: 'fbc7172b2fc9e483832d5781ef5cfe75a432c5de832b42e7fa53b24fb22547dc'
    },
    // ── NVIDIA PiD upscaler transformers (MPI-182) ─────────────────────────────
    // One model, 4 VAE-locked checkpoints selected at runtime via Input_Type.
    // Compat = VAE latent space, not model name. Their shared gemma text encoder +
    // sd3/qwen/flux VAEs live in assetDeps.js (dedup automatic). Full research:
    // docs/models/pid/upscaler.md.
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
    // ── Krea2 transformers (MPI-242) ───────────────────────────────────────────
    // Flux-lineage in ARCHITECTURE ONLY — the conditioning + VAE stack is Qwen
    // (reuses vae-qwen-image + krea2-qwen3vl-clip in assetDeps.js; vae-flux-ae is
    // the WRONG dep). We ship the SFW fp8_scaled transformer and the NSFW int8_convrot
    // transformer (Coyote's Lustify v10 KREA-Turbo) as two INDEPENDENT models — a user
    // can install BOTH (unlike LTX's mutually-exclusive arch variants). Each is its own
    // ModelDef; the two share every other dep. Quant variants are native in comfy 0.27 —
    // see docs/models/krea2/int8-quant.md.
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
    // ── Krea2 RAW transformers (MPI-282) — the HIGH edit tier ───────────────────
    // Raw (un-distilled) Krea2 has a WORKING cfg, so it drives the identity-edit LoRA
    // (Balanced/Turbo at cfg 1 starves the edit conditioning). Ships as the High tier
    // of the 4-card Krea2 set; int8_convrot quant (native NVIDIA RTX Turing+). See
    // docs/models/krea2/README.md "Krea2 as an EDITOR".
    'krea2-raw-transformer': {
        id: 'krea2-raw-transformer',
        name: 'Krea2 Raw Transformer (int8_convrot)',
        origin: 'Comfy-Org/Krea-2',
        filename: 'diffusion_models/krea2_raw_int8_convrot.safetensors',
        url: 'https://models.cubric.studio/vision/models/diffusion_models/krea2_raw_int8_convrot.safetensors',
        size: '13.49GB',
        sha256: '5585a4a38c4bcfb6fde2d480a4aa6edf7f665721ebde56d30662c35a45f5fa5c',
    },
    // NSFW variant — Lustify v10 KREA-Raw, int8_convrot quant.
    'krea2-raw-transformer-nsfw': {
        id: 'krea2-raw-transformer-nsfw',
        name: 'Krea2 Raw Transformer NSFW (int8_convrot)',
        origin: 'Comfy-Org/Krea-2',
        filename: 'diffusion_models/lustify-v10-krea-raw-int8_convrot.safetensors',
        url: 'https://models.cubric.studio/vision/models/diffusion_models/lustify-v10-krea-raw-int8_convrot.safetensors',
        size: '13.15GB',
        sha256: 'f165d4db2a4c9a8ce67f88851216ec41ee64ed508f0755de9d4dcd03175bc865',
    },
    // ── Boogu-Image-Edit transformers (MPI-257) ────────────────────────────────
    // Unified 10B image edit, Apache-2.0. Native ComfyUI (comfy_extras/nodes_boogu.py
    // — TextEncodeBooguEdit, no baked node). Three quality TIERS ship as three sibling
    // ModelDefs (modelFamily 'Boogu-Image-Edit'), one transformer each; same graph,
    // Input_Tier baked per file. CLIP = Qwen3-VL-8B (boogu-qwen3vl-8b-clip in assetDeps),
    // VAE = shared vae-flux-ae. bf16 is 19.17 binary GB — UNDER the 20GB hot-store gate,
    // stays on the volume.
    'boogu-edit-transformer-high': {
        id: 'boogu-edit-transformer-high',
        name: 'Boogu Image Edit Transformer (bf16, High)',
        origin: 'Boogu/Boogu-Image-0.1-Edit',
        filename: 'diffusion_models/boogu_image_edit_bf16.safetensors',
        url: 'https://models.cubric.studio/vision/models/diffusion_models/boogu_image_edit_bf16.safetensors',
        size: '20.59GB',
        sha256: '6374c9d1f4faa17d0204df6d20f777ed348bc1ac22f778e46ac79d554c67e3b1',
    },
    // Balanced = turbo int8_convrot (was 'low'). fp8_scaled dropped — dark on Blackwell
    // (sm_120), MPI-266. int8 is Blackwell-safe + faster + higher quality on all NVIDIA.
    'boogu-edit-transformer-balanced': {
        id: 'boogu-edit-transformer-balanced',
        name: 'Boogu Image Edit Transformer (turbo int8_convrot, Balanced)',
        origin: 'Boogu/Boogu-Image-0.1-Edit-Turbo',
        filename: 'diffusion_models/boogu_image_edit_turbo_int8_convrot.safetensors',
        url: 'https://models.cubric.studio/vision/models/diffusion_models/boogu_image_edit_turbo_int8_convrot.safetensors',
        size: '11.37GB',
        sha256: 'c242eca52f1388102e1fd8644945875a09ea3e85f5e944c42114c6a72328e440',
    },
    // ── LTX-2.3 transformers (MPI-127) ─────────────────────────────────────────
    // Ship deps = exactly what LTX_i2v_t2v_template.json references (workflow scan
    // 2026-06-25). Support weights (video/audio VAE, gemma clip, text projection,
    // spatial upscaler) live in assetDeps.js; baked LoRAs in loraDeps.js.
    // bf16 transformer — SHARED across both engines (MPI-190: engine split reverted,
    // GGUF removed). cu130 collapsed the aimdo cold-fault tax that the Q8_0 GGUF
    // transformer existed to dodge, and bf16 also removes the ComfyUI-GGUF dequant
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
};
