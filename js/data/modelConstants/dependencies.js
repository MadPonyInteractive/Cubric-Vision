// ── Shared Dependencies ───────────────────────────────────────────────────────
// Defined once, referenced by id in model dependency lists to avoid repetition.
// *********
// IMPORTANT:
// 1 - If you need to change a URL, you have to set the SHA256 back to null.
// 2 - When adding universal workflow dependencies, they need to be installed with the engine
//     Set installOnEngine: true for those.
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
    // all 4 paths (dedup automatic). Full research: docs/builder/research/pid-upscaler.md.
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
    // Upscale Models --------------------------------------------------------
    '4x-NMKD-Siax': {
        id: '4x-NMKD-Siax',
        name: '4x NMKD-Siax 200k',
        filename: 'upscale_models/4x_NMKD-Siax_200k.pth',
        url: 'https://models.cubric.studio/vision/models/upscale_models/4x_NMKD-Siax_200k.pth',
        size: '67MB',
        sha256: '560424d9f68625713fc47e9e7289a98aabe1d744e1cd6a9ae5a35e9957fd127e',
        installOnEngine: true,
    },
    '4x-AnimeSharp': {
        id: '4x-AnimeSharp',
        name: '4x-AnimeSharp',
        filename: 'upscale_models/4x-AnimeSharp.pth',
        url: 'https://models.cubric.studio/vision/models/upscale_models/4x-AnimeSharp.pth',
        size: '65MB',
        sha256: 'e7a7de2dafd7331c1992862bbbcd9e9712a9f9f8e6303f0aaa59b4341d359bab',
        installOnEngine: true,
    },
    // LTX-2.3 (MPI-127) ------------------------------------------------------
    // Ship deps = exactly what LTX_i2v_t2v_template.json references (workflow
    // scan 2026-06-25), NOT the broader mpi-ci install set (which pulls extra
    // weights for deferred branches: head-swap, pose, lipdub). Base files come
    // from stable upstreams tonight (Kijai/Lightricks/valiantcat); self-hosting
    // them to MPI HF is a post-release follow-up card. sha256 = null until
    // mpic-compute-dep-hashes is run.
    // bf16-local / GGUF-Pod TRANSFORMER SPLIT (2026-06-29, live Pod A/B proven).
    // The transformer is the ONLY weight that differs by engine; everything else
    // (VAE, CLIP, LoRAs, nodes) is shared.
    //  - LOCAL gets bf16 (best per-step speed at high res; no aimdo cold tax locally).
    //  - POD/REMOTE gets Q8_0 GGUF (sidesteps the ~5-min aimdo cold tax — the whole
    //    point; loads via city96 `UnetLoaderGGUF` from the `unet/` folder, NOT
    //    diffusion_models/).
    // Which engine gets which is declared STRUCTURALLY on the model (MPI-163,
    // consolidated MPI-165): models.js lists bf16 in `engines.local.extraDeps`, the
    // GGUF (+ the ComfyUI-GGUF node that loads it) in `engines.remote.extraDeps`. The
    // resolver adds the engine-correct list at resolution time, so download + status
    // gate + prompt box all derive the right set automatically — no per-dep `engine`
    // tag for any consumer to forget.
    'ltx23-transformer-bf16': {
        id: 'ltx23-transformer-bf16',
        name: 'LTX-2.3 22B Distilled Transformer (bf16, local)',
        origin: 'Kijai/LTX2.3_comfy',
        filename: 'diffusion_models/ltx-2.3-22b-distilled-1.1_transformer_only_bf16.safetensors',
        url: 'https://models.cubric.studio/vision/models/diffusion_models/ltx-2.3-22b-distilled-1.1_transformer_only_bf16.safetensors',
        size: '41GB',
        sha256: 'cf9c5aafda70d495ff7c9bd3d591899b3cefe679a1a2458feee4c5b6ff9db249',
    },
    // Q8_0 GGUF (remote/Pod). Re-hosted to cubric R2 (bucket cubric-models →
    // models.cubric.studio) 2026-06-30, off HF-direct (HF-direct stalled at the
    // end of the download on a Pod). Source kept Unsloth (22.8GB). Verified
    // size-match on R2 (22755540000 bytes). sha256 unchanged (same file).
    'ltx23-transformer-gguf': {
        id: 'ltx23-transformer-gguf',
        name: 'LTX-2.3 22B Distilled Transformer (Q8_0 GGUF, Pod)',
        origin: 'unsloth/LTX-2.3-GGUF',
        filename: 'unet/ltx-2.3-22b-distilled-1.1-Q8_0.gguf',
        url: 'https://models.cubric.studio/vision/models/unet/ltx-2.3-22b-distilled-1.1-Q8_0.gguf',
        size: '22.8GB',
        sha256: '813fd61eecf3df2ef5ac5a942d226ee7e44b6cec68ed803549aefaa410cd397e',
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
        installOnEngine: true,
    },
    'ComfyUI-PainterI2Vadvanced': {
        id: 'ComfyUI-PainterI2Vadvanced',
        name: 'ComfyUI-PainterI2Vadvanced',
        type: 'custom_nodes',
        filename: 'ComfyUI-PainterI2Vadvanced',
        url: 'https://github.com/princepainter/ComfyUI-PainterI2Vadvanced/archive/refs/heads/main.zip',
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
        installOnEngine: true,
    },
    'ComfyUI-Impact-Pack': {
        id: 'ComfyUI-Impact-Pack',
        name: 'ComfyUI Impact Pack',
        type: 'custom_nodes',
        filename: 'comfyui-impact-pack',
        url: lockUrl('ComfyUI-Impact-Pack'),
        installRequirements: true,
        size: '5MB',
        installOnEngine: true,
    },
    'comfyui-kjnodes': {
        id: 'comfyui-kjnodes',
        name: 'ComfyUI KJNodes',
        type: 'custom_nodes',
        filename: 'comfyui-kjnodes',
        url: lockUrl('comfyui-kjnodes'),
        installRequirements: true,
        installOnEngine: true,
        size: '28MB',
    },
    // GGUF quantized-transformer loader. KJNodes' GGUFLoaderKJ is a thin wrapper
    // that imports city96's loader at runtime (gguf_sd_loader) AND city96 registers
    // the `unet_gguf` folder category → required for any GGUF transformer (LTX-2.3
    // Q8_0 etc.). requirements.txt pins `gguf>=0.13.0` + sentencepiece/protobuf →
    // installRequirements: true (without `gguf` the node import fails).
    // NO installOnEngine: this is LTX-2.3-MODEL-specific (lives in the ltx-23
    // dependencies[] array), NOT a universal-workflow dep — installs when the LTX
    // model is installed, same as ComfyUI-PainterI2Vadvanced for Wan I2V.
    'ComfyUI-GGUF': {
        id: 'ComfyUI-GGUF',
        name: 'ComfyUI GGUF',
        type: 'custom_nodes',
        filename: 'ComfyUI-GGUF',
        url: lockUrl('ComfyUI-GGUF'),
        installRequirements: true,
        size: '500KB',
    },
    'ComfyUI-UltimateSDUpscale': {
        id: 'ComfyUI-UltimateSDUpscale',
        name: 'ComfyUI Ultimate SD Upscale',
        type: 'custom_nodes',
        filename: 'comfyui_ultimatesdupscale',
        url: lockUrl('ComfyUI-UltimateSDUpscale'),
        installRequirements: false,
        size: '940KB',
        installOnEngine: true,
    },
    'ComfyUI-Frame-Interpolation': {
        id: 'ComfyUI-Frame-Interpolation',
        name: 'ComfyUI Impact Subpack',
        type: 'custom_nodes',
        filename: 'comfyui-frame-interpolation',
        url: lockUrl('ComfyUI-Frame-Interpolation'),
        installRequirements: true,
        installRequirementsCommand: 'python install.py',
        size: '37.4MB',
        installOnEngine: true,
    },
    'ComfyUI-Impact-Subpack': {
        id: 'ComfyUI-Impact-Subpack',
        name: 'ComfyUI Impact Subpack',
        type: 'custom_nodes',
        filename: 'ComfyUI-Impact-Subpack',
        url: lockUrl('ComfyUI-Impact-Subpack'),
        installRequirements: true,
        size: '172KB',
        installOnEngine: true,
    },
    'face-yolov8n': {
        id: 'face-yolov8n',
        name: 'face_yolov8n.pt',
        filename: 'ultralytics/bbox/face_yolov8n.pt',
        url: 'https://models.cubric.studio/vision/models/ultralytics/bbox/face_yolov8n.pt',
        size: '5.9MB',
        sha256: '70b640f8f60b1cf0dcc72f30caf3da9495eb2fb6509da48c53374ad6806e6a9c',
        installOnEngine: true,
    },
    'hand-yolov8n': {
        id: 'hand-yolov8n',
        name: 'hand_yolov8n.pt',
        filename: 'ultralytics/bbox/hand_yolov8n.pt',
        url: 'https://models.cubric.studio/vision/models/ultralytics/bbox/hand_yolov8n.pt',
        size: '5.9MB',
        sha256: '3991202eb69e9ddcb3b9ba80cdeb41e734ffaf844403d6c9f47d515cd88c6f29',
        installOnEngine: true,
    },
    'person-yolov8n-seg': {
        id: 'person-yolov8n-seg',
        name: 'person_yolov8n-seg.pt',
        filename: 'ultralytics/bbox/person_yolov8n-seg.pt',
        url: 'https://models.cubric.studio/vision/models/ultralytics/bbox/person_yolov8n-seg.pt',
        size: '6.9MB',
        sha256: '38fc8aaae97cb6e70be4ec44770005b26ed473471362afcda62a0037d7ccf432',
        installOnEngine: true,
    },
    'sam-vit-b': {
        id: 'sam-vit-b',
        name: 'SAM ViT-B',
        filename: 'sams/sam_vit_b_01ec64.pth',
        url: 'https://models.cubric.studio/vision/models/sams/sam_vit_b_01ec64.pth',
        size: '367MB',
        sha256: 'ec2df62732614e57411cdcf32a23ffdf28910380d03139ee0f4fcbe91eb8c912',
        installOnEngine: true,
    },
};
