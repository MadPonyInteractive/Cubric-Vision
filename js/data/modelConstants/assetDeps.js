// ── Support-Weight Dependencies ───────────────────────────────────────────────
// Split out of modelDeps.js (dependencies.js re-exports these as part of DEPS).
// Everything a model DEPENDS on but is not itself the picked model: VAEs,
// text_encoders / CLIP, latent + image upscalers, background-removal, and the
// universal engine-asset weights (detectors, SAM, RIFE). IMPORTANT:
// 1 - If you need to change a URL, you have to set the SHA256 back to null.
// 2 - engineAsset:true = installs with the engine, never GC'd with a model
//     (upscalers, detector/SAM models, RIFE, birefnet). NOTE: the model-specific
//     vae/clip weights below are NOT engineAsset — they GC with their model.
// 3 - bakedOnPod:true = this engineAsset is ALREADY inside the Pod Docker image
//     (the `dl` block in mpi-ci/cubric-vision-pod/Dockerfile). Remote skips it
//     instead of re-downloading it onto the volume. `targetPath` weights (RIFE)
//     need no flag — they are baked inside a node folder and `_isImageResident`
//     already reports them present. An engineAsset with NEITHER flag is installed
//     onto the Pod volume at connect (MPI-380).
//     ** ADDING AN engineAsset? ** Do NOT add bakedOnPod unless you are also
//     editing that Dockerfile in the same breath. The flag means "the image has
//     it"; a wrong flag makes the weight unreachable on remote and the failure is
//     a 503 mid-generation on a billed Pod, not a build error. Unflagged is the
//     safe default — it costs a volume download, never a broken engine.

export const assetDeps = {
    // VAE
    'wan2.2_vae': {
        id: 'wan2.2_vae',
        name: 'wan2.2_vae',
        origin: 'Wan-AI/Wan2.2-TI2V-5B',
        filename: 'vae/wan2.2_vae.safetensors',
        url: 'https://models.cubric.studio/vision/models/vae/wan2.2_vae.safetensors',
        mirrorUrl: 'https://huggingface.co/Comfy-Org/Wan_2.2_ComfyUI_Repackaged/resolve/main/split_files/vae/wan2.2_vae.safetensors',
        size: '1.31GB',
        bytes: 1409400960,
        sha256: 'e40321bd36b9709991dae2530eb4ac303dd168276980d3e9bc4b6e2b75fed156'
    },
    'wan_2.1_vae': {
        id: 'wan_2.1_vae',
        name: 'wan_2.1_vae',
        filename: 'vae/wan_2.1_vae.safetensors',
        url: 'https://models.cubric.studio/vision/models/vae/wan_2.1_vae.safetensors',
        mirrorUrl: 'https://huggingface.co/Comfy-Org/Wan_2.1_ComfyUI_repackaged/resolve/main/split_files/vae/wan_2.1_vae.safetensors',
        size: '242.06MB',
        bytes: 253815318,
        sha256: '2fc39d31359a4b0a64f55876d8ff7fa8d780956ae2cb13463b0223e15148976b'
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
        mirrorUrl: 'https://huggingface.co/lodestones/Chroma/resolve/main/ae.safetensors',
        size: '319.77MB',
        bytes: 335304388,
        sha256: 'afc8e28272cd15db3919bacdb6918ce9c1ed22e96cb12c4d5ed0fba823529e38'
    },
    // FLUX.2 VAE — a DIFFERENT weight from `vae-flux-ae` (FLUX.1's ae.safetensors).
    // Backs Klein 4B and any future FLUX.2 card. Named by the weight, like the rest.
    'vae-flux2': {
        id: 'vae-flux2',
        name: 'FLUX.2 VAE',
        origin: 'FLUX.2 stack (flux2-vae)',
        filename: 'vae/flux2-vae.safetensors',
        url: 'https://models.cubric.studio/vision/models/vae/flux2-vae.safetensors',
        mirrorUrl: 'https://huggingface.co/Comfy-Org/flux2-dev/resolve/main/split_files/vae/flux2-vae.safetensors',
        size: '320.64MB',
        bytes: 336213556,
        sha256: 'd64f3a68e1cc4f9f4e29b6e0da38a0204fe9a49f2d4053f0ec1fa1ca02f9c4b5'
    },
    'vae-sdxl': {
        id: 'vae-sdxl',
        name: 'SDXL VAE',
        origin: 'stabilityai/sdxl-vae',
        filename: 'vae/sdxl_vae.safetensors',
        url: 'https://models.cubric.studio/vision/models/vae/sdxl_vae.safetensors',
        mirrorUrl: 'https://huggingface.co/stabilityai/sdxl-vae/resolve/main/sdxl_vae.safetensors',
        size: '319.14MB',
        bytes: 334641164,
        sha256: '63aeecb90ff7bc1c115395962d3e803571385b61938377bc7089b36e81e92e2e'
    },
    'vae-sd3': {
        id: 'vae-sd3',
        name: 'SD3 VAE',
        origin: 'nvidia/PiD (sd3_vae)',
        filename: 'vae/sd3_vae.safetensors',
        url: 'https://models.cubric.studio/vision/models/vae/sd3_vae.safetensors',
        mirrorUrl: 'https://huggingface.co/silveroxides/SD3-PonyCLIP-forfun/resolve/main/vae/diffusion_pytorch_model.safetensors',
        size: '159.9MB',
        bytes: 167666654,
        sha256: 'f9b67a279283625caee39d61eacb5324243848477b4eb535355eaaa8423d4e09'
    },
    'vae-qwen-image': {
        id: 'vae-qwen-image',
        name: 'Qwen-Image VAE',
        origin: 'Comfy-Org/Qwen-Image_ComfyUI',
        filename: 'vae/qwen_image_vae.safetensors',
        url: 'https://models.cubric.studio/vision/models/vae/qwen_image_vae.safetensors',
        mirrorUrl: 'https://huggingface.co/Comfy-Org/Krea-2/resolve/main/vae/qwen_image_vae.safetensors',
        size: '242.05MB',
        bytes: 253806246,
        sha256: 'a70580f0213e67967ee9c95f05bb400e8fb08307e017a924bf3441223e023d1f'
    },
    'ltx23-video-vae': {
        id: 'ltx23-video-vae',
        name: 'LTX-2.3 Video VAE (bf16)',
        origin: 'Kijai/LTX2.3_comfy',
        filename: 'vae/LTX23_video_vae_bf16.safetensors',
        url: 'https://models.cubric.studio/vision/models/vae/LTX23_video_vae_bf16.safetensors',
        mirrorUrl: 'https://huggingface.co/Kijai/LTX2.3_comfy/resolve/main/vae/LTX23_video_vae_bf16.safetensors',
        size: '1.35GB',
        bytes: 1452258578,
        sha256: '01ea62d09bc139f95c5dee7b5c062ad6a3e6cd8be910a1983ac02e7eb5b8ee3b',
    },
    'ltx23-audio-vae': {
        id: 'ltx23-audio-vae',
        name: 'LTX-2.3 Audio VAE (bf16)',
        origin: 'Kijai/LTX2.3_comfy',
        filename: 'vae/LTX23_audio_vae_bf16.safetensors',
        url: 'https://models.cubric.studio/vision/models/vae/LTX23_audio_vae_bf16.safetensors',
        mirrorUrl: 'https://huggingface.co/Kijai/LTX2.3_comfy/resolve/main/vae/LTX23_audio_vae_bf16.safetensors',
        size: '347.95MB',
        bytes: 364855188,
        sha256: '5bc10fa4adecf99dda132d916e23048cbd56797702c5fa50eb5d2079048a38c3',
    },
    // ── Tiny TAEHV preview decoders (MPI-508) ───────────────────────────────
    // Both live in `vae/`, NOT `vae_approx/`, and that is deliberate: a VAELoader NODE
    // reads them, not core's previewer, and VAELoader reads the `vae` folder key.
    // Neither is an engineAsset — they belong to specific models, so a model-keyed
    // install reaches them and GC with the last owner is correct. The `vae_approx`
    // decoders further down are the other kind: core-read, model-agnostic, engine-owned.
    // Full split: docs/preview-bus.md § "The second kind of decoder".
    //
    // comfy/sd.py:868 recognises a TAEHV from `decoder.22.bias`, so a plain VAELoader
    // produces the right object for both.
    //
    // LTX: `LTX2SamplingPreviewOverride` branches on
    // `vae.first_stage_model.__class__.__name__ == 'TAEHV'` — fed the full video VAE it
    // silently falls back to latent_rgb_factors (the blocky preview we shipped until
    // now), fed this it decodes real frames.
    'ltx23-preview-taehv': {
        id: 'ltx23-preview-taehv',
        name: 'LTX-2.3 Preview Decoder (TAEHV)',
        origin: 'madebyollin/taehv (Apache-2.0)',
        filename: 'vae/taeltx2_3.safetensors',
        url: 'https://models.cubric.studio/vision/models/vae/taeltx2_3.safetensors',
        mirrorUrl: 'https://github.com/madebyollin/taehv/raw/main/safetensors/taeltx2_3.safetensors',
        size: '22.44MB',
        bytes: 23531296,
        sha256: 'f0773b4e3e57318e6aa4dd4a35e1d16213a5f160fbc0376163f06888bbcbe246',
    },
    // H3: core cannot preview H3 AT ALL — MiniMaxH3Video/MiniMaxH3AV name no
    // `taesd_decoder_name`, `taeh3` is absent from latent_preview.VIDEO_TAES, and core's
    // TAESD could not load it anyway (its Decoder hardcodes width 64; this is 256). Our
    // own `MpiVideoSamplingPreview` decodes with it and streams frames on the standard
    // binary preview channel. Because core never touches the file, the #13366 corruption
    // trap further down cannot reach it.
    // Must be madebyollin's, NOT Kijai/MiniMax-H3-TAE: Kijai's is a 2D decoder-only TAE
    // with no temporal layers, so it yields one image per LATENT frame and previews play
    // ~4x fast. Kijai's own README says as much and points here.
    'taeh3-decoder': {
        id: 'taeh3-decoder',
        name: 'MiniMax H3 Preview Decoder (TAEHV)',
        origin: 'madebyollin/taehv (Apache-2.0)',
        filename: 'vae/taeh3.safetensors',
        url: 'https://models.cubric.studio/vision/models/vae/taeh3.safetensors',
        mirrorUrl: 'https://github.com/madebyollin/taehv/raw/main/safetensors/taeh3.safetensors',
        size: '21.66MB',
        bytes: 22709752,
        sha256: '4fd022bfcab08772fe0536b17ea1a3bbb5625be11e397868d1c5d891863d4c13',
    },
    // Text encoders / CLIP -------------------------------------------------
    // `krea2-qwen3vl-clip` (stock Qwen3-VL-4B fp8_scaled) was REMOVED 2026-07-19: the
    // Krea2 cards moved to qwen3vl-abliterated-clip below and the R2 object was deleted,
    // so the entry was an orphan whose url 404s. Do not re-add the split weight — the
    // abliterated twin serves both the Krea2 cards and the image-describer plugin.
    // Abliterated twin of the stock Qwen3-VL-4B — same architecture, refusal behaviour
    // removed. SHARED: the image-describer PLUGIN (js/data/pluginsRegistry.js) AND all
    // four Krea2 cards, which moved off the stock encoder 2026-07-19 after an A/B showed
    // no cost — locked seed, 5/6 constraints honoured by both on an adversarial
    // instruction-following prompt, and no sanitisation on a disinhibition probe.
    // NOTE the switch bought simplicity + ~4.88GB, NOT censorship relief: the refusals
    // seen in-app came from the enhancer LLM downstream of Generate Text, never the CLIP.
    'qwen3vl-abliterated-clip': {
        id: 'qwen3vl-abliterated-clip',
        name: 'Image Describer Encoder (Qwen3-VL-4B abliterated fp8_scaled)',
        origin: 'huihui-ai/Huihui-Qwen3-VL-4B-Instruct-abliterated',
        filename: 'text_encoders/qwen3vl_4b_abliterated_fp8_scaled.safetensors',
        url: 'https://models.cubric.studio/vision/models/text_encoders/qwen3vl_4b_abliterated_fp8_scaled.safetensors',
        size: '4.88GB',
        bytes: 5242481504,
        sha256: '45fe15d359fbc6fe8773f24cebc34acedf5696d96d41a0c9a3039611ece3b866',
    },
    // Qwen3-VL-8B fp8_scaled (hidden 4096) — Boogu's text encoder, `type: 'boogu'` in
    // the CLIPLoader. Distinct weight from the Qwen3-VL-4B encoders above. Shared by all three
    // Boogu tiers.
    'boogu-qwen3vl-8b-clip': {
        id: 'boogu-qwen3vl-8b-clip',
        name: 'Boogu Text Encoder (Qwen3-VL-8B fp8_scaled)',
        origin: 'Boogu/Boogu-Image-0.1-Edit',
        filename: 'text_encoders/qwen3vl_8b_fp8_scaled.safetensors',
        url: 'https://models.cubric.studio/vision/models/text_encoders/qwen3vl_8b_fp8_scaled.safetensors',
        mirrorUrl: 'https://huggingface.co/Comfy-Org/Ideogram-4/resolve/main/text_encoders/qwen3vl_8b_fp8_scaled.safetensors',
        size: '9.86GB',
        bytes: 10588637512,
        sha256: '4ba424cf62e51392e4d1a39933e803706f4e823c1065f36aaf149c6453f66bcd',
    },
    // Qwen-Image-Edit-2511 text encoder (MPI-300). Qwen2.5-VL-7B (hidden 3584) — NOT
    // the boogu Qwen3-VL-8B nor the krea2 Qwen3-VL-4B. Full-precision TE tested &
    // REJECTED (hallucinates + stretches anatomy); fp8_scaled is the only good TE.
    'qwen-edit-qwen25vl-7b-clip': {
        id: 'qwen-edit-qwen25vl-7b-clip',
        name: 'Qwen Image Edit Text Encoder (Qwen2.5-VL-7B fp8_scaled)',
        origin: 'Comfy-Org/Qwen-Image_ComfyUI',
        filename: 'text_encoders/qwen_2.5_vl_7b_fp8_scaled.safetensors',
        url: 'https://models.cubric.studio/vision/models/text_encoders/qwen_2.5_vl_7b_fp8_scaled.safetensors',
        mirrorUrl: 'https://huggingface.co/Comfy-Org/Qwen-Image_ComfyUI/resolve/main/split_files/text_encoders/qwen_2.5_vl_7b_fp8_scaled.safetensors',
        size: '8.74GB',
        bytes: 9384670680,
        sha256: 'cb5636d852a0ea6a9075ab1bef496c0db7aef13c02350571e388aea959c5c0b4',
    },
    // FLUX.2 text encoder — Qwen3-4B, TEXT-ONLY (CLIPLoader `type: flux2`). NOT any of
    // the Qwen3-VL / Qwen2.5-VL encoders above: different weight, different repo, no
    // vision tower. Checked 2026-07-26 — nothing hosted matched, so Klein hosts it new.
    // Named by the weight: the rest of the FLUX.2 family reuses this id.
    'qwen3-4b-clip': {
        id: 'qwen3-4b-clip',
        name: 'FLUX.2 Text Encoder (Qwen3-4B)',
        origin: 'FLUX.2 stack (qwen_3_4b)',
        filename: 'text_encoders/qwen_3_4b.safetensors',
        url: 'https://models.cubric.studio/vision/models/text_encoders/qwen_3_4b.safetensors',
        mirrorUrl: 'https://huggingface.co/Comfy-Org/z_image_turbo/resolve/main/split_files/text_encoders/qwen_3_4b.safetensors',
        size: '7.49GB',
        bytes: 8044982048,
        sha256: '6c671498573ac2f7a5501502ccce8d2b08ea6ca2f661c458e708f36b36edfc5a',
    },
    // Klein 9B's text encoder (MPI-598). A BRAND-NEW dep — nothing we host could be
    // promoted, and the near-miss candidates are the trap here: `qwen3-4b-clip` above is
    // Qwen3-**4B** (a different parameter count, Klein 4B's encoder) and
    // `boogu-qwen3vl-8b-clip` is Qwen3-**VL**-8B, a vision-language model loaded at type
    // `boogu`. Klein 9B wants text-only Qwen3-8B at CLIPLoader type `flux2`. This roughly
    // DOUBLES 9B's encoder footprint against 4B — the 8B encoder is a second ~8.8GB
    // resident, though ComfyUI encodes then unloads, so peak is not the sum.
    // Same filename lie as the 9B transformer: header read 2026-08-22 is
    // `{"format": "int8_tensorwise"}` with a SCALAR `weight_scale`, not ConvRot.
    'qwen3-8b-clip': {
        id: 'qwen3-8b-clip',
        name: 'FLUX.2 Klein 9B Text Encoder (Qwen3-8B, int8 tensorwise)',
        origin: 'Winnougan/Klein9b-Distilled-Base-INT8-Convrot (qwen_3_8b_int8_convrot)',
        filename: 'text_encoders/qwen_3_8b_int8_convrot.safetensors',
        url: 'https://models.cubric.studio/vision/models/text_encoders/qwen_3_8b_int8_convrot.safetensors',
        mirrorUrl: 'https://huggingface.co/Winnougan/Klein9b-Distilled-Base-INT8-Convrot/resolve/main/qwen_3_8b_int8_convrot.safetensors',
        size: '8.79GB',
        bytes: 9435828164,
        sha256: '531c547aedd19e119a6089ab3614cb871af40160763a0b3d51719ff1ec8db9af',
    },
    'pid-gemma': {
        id: 'pid-gemma',
        name: 'PiD Gemma text encoder',
        origin: 'Comfy-Org/PixelDiT',
        filename: 'text_encoders/gemma_2_2b_it_elm_bf16.safetensors',
        url: 'https://models.cubric.studio/vision/models/text_encoders/gemma_2_2b_it_elm_bf16.safetensors',
        mirrorUrl: 'https://huggingface.co/Comfy-Org/PixelDiT/resolve/main/text_encoders/gemma_2_2b_it_elm_bf16.safetensors',
        size: '4.87GB',
        bytes: 5232958571,
        sha256: 'e7ae59c203c392db4aa4e27783e924ec3225eb563392260cf747e1130ffcdb88'
    },
    'umt5_xxl_fp8_e4m3fn_scaled': {
        id: 'umt5_xxl_fp8_e4m3fn_scaled',
        name: 'umt5_xxl_fp8_e4m3fn_scaled',
        filename: 'text_encoders/umt5_xxl_fp8_e4m3fn_scaled.safetensors',
        url: 'https://models.cubric.studio/vision/models/text_encoders/umt5_xxl_fp8_e4m3fn_scaled.safetensors',
        mirrorUrl: 'https://huggingface.co/Comfy-Org/Wan_2.1_ComfyUI_repackaged/resolve/main/split_files/text_encoders/umt5_xxl_fp8_e4m3fn_scaled.safetensors',
        size: '6.27GB',
        bytes: 6735906897,
        sha256: 'c3355d30191f1f066b26d93fba017ae9809dce6c627dda5f6a66eaa651204f68'
    },
    // Chroma T5 text encoder (shared Flux-family t5xxl fp16). MPI-217.
    't5xxl-fp16': {
        id: 't5xxl-fp16',
        name: 't5xxl_fp16',
        filename: 'text_encoders/t5xxl_fp16.safetensors',
        url: 'https://models.cubric.studio/vision/models/text_encoders/t5xxl_fp16.safetensors',
        mirrorUrl: 'https://huggingface.co/lodestones/stable-diffusion-3-medium/resolve/main/text_encoders/t5xxl_fp16.safetensors',
        size: '9.12GB',
        bytes: 9787841024,
        sha256: '6e480b09fae049a72d2a8c5fbccb8d3e92febeb233bbe9dfe7256958a9167635'
    },
    'ltx23-text-projection': {
        id: 'ltx23-text-projection',
        name: 'LTX-2.3 Text Projection (bf16)',
        origin: 'Kijai/LTX2.3_comfy',
        filename: 'text_encoders/ltx-2.3_text_projection_bf16.safetensors',
        url: 'https://models.cubric.studio/vision/models/text_encoders/ltx-2.3_text_projection_bf16.safetensors',
        mirrorUrl: 'https://huggingface.co/Kijai/LTX2.3_comfy/resolve/main/text_encoders/ltx-2.3_text_projection_bf16.safetensors',
        size: '2.15GB',
        bytes: 2312149072,
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
        mirrorUrl: 'https://huggingface.co/Comfy-Org/ltx-2/resolve/main/split_files/text_encoders/gemma_3_12B_it_fp4_mixed.safetensors',
        size: '8.8GB',
        bytes: 9447702218,
        sha256: 'aaca463d11e6d8d2a4bdb0d6299214c15ef78a3f73e0ef8113d5a9d0219b3f6d',
    },
    // Latent / image upscalers ---------------------------------------------
    'ltx23-spatial-upscaler': {
        id: 'ltx23-spatial-upscaler',
        name: 'LTX-2.3 Spatial Upscaler x2 (stage-2)',
        origin: 'Lightricks/LTX-2.3',
        filename: 'latent_upscale_models/ltx-2.3-spatial-upscaler-x2-1.1.safetensors',
        url: 'https://models.cubric.studio/vision/models/latent_upscale_models/ltx-2.3-spatial-upscaler-x2-1.1.safetensors',
        mirrorUrl: 'https://huggingface.co/Lightricks/LTX-2.3/resolve/main/ltx-2.3-spatial-upscaler-x2-1.1.safetensors',
        size: '949.62MB',
        bytes: 995743560,
        sha256: '5f416311fa8172b65af67530758964708d29a317b830d689a51143b7f91913ed',
    },
    // Upscale Models (engine assets) ---------------------------------------
    '4x-NMKD-Siax': {
        id: '4x-NMKD-Siax',
        name: '4x NMKD-Siax 200k',
        filename: 'upscale_models/4x_NMKD-Siax_200k.pth',
        url: 'https://models.cubric.studio/vision/models/upscale_models/4x_NMKD-Siax_200k.pth',
        mirrorUrl: 'https://huggingface.co/uwg/upscaler/resolve/main/ESRGAN/4x_NMKD-Siax_200k.pth',
        size: '63.86MB',
        bytes: 66957746,
        sha256: '560424d9f68625713fc47e9e7289a98aabe1d744e1cd6a9ae5a35e9957fd127e',
        engineAsset: true,
        bakedOnPod: true,
    },
    '4x-AnimeSharp': {
        id: '4x-AnimeSharp',
        name: '4x-AnimeSharp',
        filename: 'upscale_models/4x-AnimeSharp.pth',
        url: 'https://models.cubric.studio/vision/models/upscale_models/4x-AnimeSharp.pth',
        size: '63.91MB',
        bytes: 67010245,
        sha256: 'e7a7de2dafd7331c1992862bbbcd9e9712a9f9f8e6303f0aaa59b4341d359bab',
        engineAsset: true,
        bakedOnPod: true,
    },
    // Background removal (MPI-260) ------------------------------------------
    // BiRefNet (MIT) for the History "Remove Background" universal op. Loaded by
    // ComfyUI's NATIVE LoadBackgroundRemovalModel node (core since v0.27.0), which
    // scans models/background_removal/. engineAsset → installs with the engine +
    // image-resident on the Pod. Self-hosted on R2 (models.cubric.studio) so the
    // Pod bake pulls from R2 not HF (see project_pod_weight_source_r2). Source =
    // Comfy-Org/BiRefNet (MIT). sha256 verified against the R2 object.
    'birefnet': {
        id: 'birefnet',
        name: 'BiRefNet Background Removal',
        origin: 'Comfy-Org/BiRefNet',
        filename: 'background_removal/birefnet.safetensors',
        url: 'https://models.cubric.studio/vision/models/background_removal/birefnet.safetensors',
        mirrorUrl: 'https://huggingface.co/Comfy-Org/BiRefNet/resolve/main/background_removal/birefnet.safetensors',
        size: '423.88MB',
        bytes: 444473596,
        sha256: '9ab37426bf4de0567af6b5d21b16151357149139362e6e8992021b8ce356a154',
        engineAsset: true,
        bakedOnPod: true,
    },
    // Frame interpolation weight (engine asset) ----------------------------
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
        size: '20.36MB',
        bytes: 21344827,
        sha256: '6a8a825ab2750558bdd20dcced386fd82b7222c7ba58c11d3b611d9c44f1be63',
        engineAsset: true,
    },
    // Detectors + SAM (engine assets) --------------------------------------
    'face-yolov8n': {
        id: 'face-yolov8n',
        name: 'face_yolov8n.pt',
        filename: 'ultralytics/bbox/face_yolov8n.pt',
        url: 'https://models.cubric.studio/vision/models/ultralytics/bbox/face_yolov8n.pt',
        mirrorUrl: 'https://huggingface.co/Bingsu/adetailer/resolve/main/face_yolov8n.pt',
        size: '5.94MB',
        bytes: 6230011,
        sha256: '70b640f8f60b1cf0dcc72f30caf3da9495eb2fb6509da48c53374ad6806e6a9c',
        engineAsset: true,
        bakedOnPod: true,
    },
    'hand-yolov8n': {
        id: 'hand-yolov8n',
        name: 'hand_yolov8n.pt',
        filename: 'ultralytics/bbox/hand_yolov8n.pt',
        url: 'https://models.cubric.studio/vision/models/ultralytics/bbox/hand_yolov8n.pt',
        mirrorUrl: 'https://huggingface.co/Bingsu/adetailer/resolve/main/hand_yolov8n.pt',
        size: '5.95MB',
        bytes: 6237883,
        sha256: '3991202eb69e9ddcb3b9ba80cdeb41e734ffaf844403d6c9f47d515cd88c6f29',
        engineAsset: true,
    },
    'person-yolov8n-seg': {
        id: 'person-yolov8n-seg',
        name: 'person_yolov8n-seg.pt',
        filename: 'ultralytics/bbox/person_yolov8n-seg.pt',
        url: 'https://models.cubric.studio/vision/models/ultralytics/bbox/person_yolov8n-seg.pt',
        mirrorUrl: 'https://huggingface.co/Bingsu/adetailer/resolve/main/person_yolov8n-seg.pt',
        size: '6.46MB',
        bytes: 6777003,
        sha256: '38fc8aaae97cb6e70be4ec44770005b26ed473471362afcda62a0037d7ccf432',
        engineAsset: true,
    },
    'sam-vit-b': {
        id: 'sam-vit-b',
        name: 'SAM ViT-B',
        filename: 'sams/sam_vit_b_01ec64.pth',
        url: 'https://models.cubric.studio/vision/models/sams/sam_vit_b_01ec64.pth',
        mirrorUrl: 'https://huggingface.co/ybelkada/segment-anything/resolve/main/checkpoints/sam_vit_b_01ec64.pth',
        size: '357.67MB',
        bytes: 375042383,
        sha256: 'ec2df62732614e57411cdcf32a23ffdf28910380d03139ee0f4fcbe91eb8c912',
        engineAsset: true,
        bakedOnPod: true,
    },
    // SAM3 (MPI-380) — the click-point mask engine. Core ComfyUI 0.28 model, no
    // custom node: loads through CheckpointLoaderSimple, which also builds its own
    // CLIP via comfy/text_encoders/sam3_clip.py. Lives BESIDE sam-vit-b rather than
    // replacing it — SAM 1 still refines the YOLO segment branch, whose Impact
    // SAM_MODEL slot SAM3 cannot fill. Licence: SAM License (Meta), commercially
    // clear (no non-commercial / MAU / revenue clause).
    'sam3-multiplex': {
        id: 'sam3-multiplex',
        name: 'SAM 3.1 Multiplex',
        filename: 'checkpoints/sam3.1_multiplex_fp16.safetensors',
        url: 'https://models.cubric.studio/vision/models/checkpoints/sam3.1_multiplex_fp16.safetensors',
        mirrorUrl: 'https://huggingface.co/Comfy-Org/sam3.1/resolve/main/checkpoints/sam3.1_multiplex_fp16.safetensors',
        size: '1.63GB',
        bytes: 1745546848,
        sha256: '9ba99c92703c2e8b4f47de2d34a539bb8e18923049e238b780d70dbe6368eb03',
        engineAsset: true,
    },
    // SDXL depth-ControlNet (depth op). Shared by all 5 SDXL-family
    // models; per-model dep (GC'd when the last SDXL model uninstalls) — NOT an
    // engineAsset. controlnet/ path is mapped in extra_model_paths.yaml.
    'controlnet-union-sdxl': {
        id: 'controlnet-union-sdxl',
        name: 'ControlNet Union ProMax SDXL',
        filename: 'controlnet/ControlNet-Union-ProMax-SDXL.safetensors',
        url: 'https://models.cubric.studio/vision/models/controlnet/ControlNet-Union-ProMax-SDXL.safetensors',
        mirrorUrl: 'https://huggingface.co/xinsir/controlnet-union-sdxl-1.0/resolve/main/diffusion_pytorch_model_promax.safetensors',
        size: '2.34GB',
        bytes: 2513342408,
        sha256: '9fae2e50cb431bfcbe05822b59ec2228df545ef27f711dea8949e9f4ed9f7cdc',
    },
    // Chroma's depth op (MPI-365). Chroma is a pruned FLUX.1-schnell derivative, so a
    // FLUX ControlNet applies to it directly: its forward pass adds control residuals the
    // same way FLUX's does (comfy/ldm/chroma/model.py), it shares the FLUX 16-channel
    // latent format, and this checkpoint's x_embedder is [3072, 64] — exactly Chroma's
    // hardcoded in_channels. There is NO Chroma-native ControlNet or depth LoRA; Klein's
    // refcontrol LoRA and Krea2's control-LoRA are both model-specific and do not port.
    //
    // *** THE ONLY NON-PERMISSIVE WEIGHT IN THE APP — DO NOT MIRROR IT TO R2. ***
    // Licence is flux-1-dev-non-commercial, and BFL's own commercial terms still forbid
    // "distributing ... to third parties via any means", so rehosting is barred at any
    // price. We therefore link the ORIGIN repo and let the user pull from it, which is
    // what ComfyUI/Invoke/Fooocus do — we never redistribute. Consequences: this dep has
    // NO mirror fallback (_mirrorUrlsFor swaps origin but preserves pathname, and the HF
    // path has no R2 twin), and the sha256 below is the ONLY guard against an upstream
    // re-upload, since the bytes are not ours. Every FLUX ControlNet inherits these
    // terms — there is no permissive alternative, as no ControlNet exists for the
    // Apache-2.0 FLUX.1-schnell.
    //
    // No SetUnionControlNetType needed: Union Pro 2.0 dropped the mode embedding, so the
    // node is a silent no-op (comfy/ldm/flux/controlnet.py gates on that embedder).
    // Measured ceiling on Chroma: strength past ~0.5 produces artefacts.
    'controlnet-union-flux': {
        id: 'controlnet-union-flux',
        name: 'ControlNet Union Pro 2.0 (FLUX)',
        origin: 'Shakker-Labs/FLUX.1-dev-ControlNet-Union-Pro-2.0',
        filename: 'controlnet/FLUX.1-dev-ControlNet-Union-Pro-2.0.safetensors',
        url: 'https://huggingface.co/Shakker-Labs/FLUX.1-dev-ControlNet-Union-Pro-2.0/resolve/main/diffusion_pytorch_model.safetensors',
        size: '3.99GB',
        bytes: 4281779224,
        sha256: '9d03f63f36206bab2f36aed5cfedc8693c2881397534e9d5f9ae9a0a41362517',
    },
    // ── TAESD live-preview decoders (MPI-420) ────────────────────────────────
    // ComfyUI runs with `--preview-method taesd` (routes/comfy.js, and the .bat
    // patch in routes/engine.js). The previewer looks for a file in vae_approx/
    // whose name STARTS WITH the latent format's taesd_decoder_name; with no
    // match it logs a warning and silently falls back to Latent2RGB — the blocky
    // colour-blob preview. It is a fallback, not a failure, which is why this
    // went unnoticed: previews existed, they were just bad.
    //
    // Two gaps this closes:
    //   1. Windows gets vae_approx/ free inside the ComfyUI portable archive.
    //      macOS/Linux provision via uv/comfy-cli, which git-clones ComfyUI, and
    //      a clone does NOT carry those weights — so EVERY preview on those
    //      platforms was latent2rgb (seen on the macOS 1.3.0 run, MPI-370).
    //   2. The portable bundle only ships taesd/taesdxl/taesd3/taef1. FLUX.2
    //      (taef2) and Wan 2.2 (lighttaew2_2) are newer than the bundle, so
    //      Klein and Wan previews were blobs on EVERY platform, Windows included.
    //
    // Only the decoders our own models actually name are here, and ONLY the ones
    // that are safe to install: SDXL family → taesdxl, Chroma → taef1, FLUX.2
    // Klein → taef2. Krea 2 and Qwen are NOT Flux-latent (both are `Wan21`, see
    // comfy/supported_models.py) — their decoder is `lighttaew2_1`, which we
    // deliberately do NOT ship; the block at the end of this file says why.
    // LTX names no decoder in ComfyUI 0.29.2, and SD1.5/SD3 are skipped — we ship
    // no model on either. The `vae_approx` folder key needs no yamlHelper edit:
    // it derives from the first path segment of `filename`.
    'taesdxl-decoder': {
        id: 'taesdxl-decoder',
        name: 'TAESD preview decoder (SDXL)',
        filename: 'vae_approx/taesdxl_decoder.safetensors',
        url: 'https://models.cubric.studio/vision/models/vae_approx/taesdxl_decoder.safetensors',
        size: '2.34MB',
        bytes: 2450590,
        sha256: 'ae5256b046b01d577279ed93a55bbb1fb2689e55aa14cfc0f7f841e0160202a5',
        engineAsset: true,
        bakedOnPod: true,
        // The upstream madebyollin repos ship a single diffusers-format file, not
        // this split decoder — there is no HF URL serving these bytes, so the
        // generic prefix rewrite would only 404 (same shape as MPI-433).
        noMirror: true,
    },
    'taef1-decoder': {
        id: 'taef1-decoder',
        name: 'TAESD preview decoder (FLUX.1)',
        filename: 'vae_approx/taef1_decoder.safetensors',
        url: 'https://models.cubric.studio/vision/models/vae_approx/taef1_decoder.safetensors',
        size: '2.35MB',
        bytes: 2464414,
        sha256: 'bb41500b646d5b8b592b7f3ca5d20d888c3075e209d178d99af609cd7e02a1d4',
        engineAsset: true,
        bakedOnPod: true,
        noMirror: true,
    },
    // Derived, not re-hosted: madebyollin/taef2 ships ONE combined file
    // (taef2.safetensors, sha 701d31c0…) holding encoder + decoder in diffusers
    // key order. ComfyUI's TAESD calls load_state_dict STRICTLY on the decoder
    // half alone, so the file was converted with madebyollin's own index shift
    // (decoder.layers.N → N+1) and proved by strict-loading it into
    // TAESD(latent_channels=128) and decoding. MIT licence. Not in the Pod image.
    'taef2-decoder': {
        id: 'taef2-decoder',
        name: 'TAESD preview decoder (FLUX.2)',
        origin: 'madebyollin/taef2',
        filename: 'vae_approx/taef2_decoder.safetensors',
        url: 'https://models.cubric.studio/vision/models/vae_approx/taef2_decoder.safetensors',
        size: '5.11MB',
        bytes: 5360500,
        sha256: '1280d56190f5e741d087db768cfde3f353bf59b857c0f809f9d3dc6ea9c603d6',
        engineAsset: true,
        noMirror: true,
    },
    // *** DO NOT ADD THE `lighttaew*` DECODERS. *** They are the Wan21/Wan22/Qwen
    // family (which is Krea 2, Qwen Image, Qwen Image Edit AND Wan 2.2 — see the
    // table in docs/preview-bus.md), and they take ComfyUI's VIDEO_TAES branch,
    // which loads the file as a WHOLE VAE rather than a decoder-only state dict.
    // ComfyUI issue #13366 — "TAESD preview corrupts midsampling latent if
    // lighttaew2_1 is present" — means that with the file installed AND taesd
    // previews on (we force them globally), the previewer corrupts the REAL
    // generation latent: degraded OUTPUT, not just a bad preview. Re-checked
    // 2026-08-05: issue #13366 still OPEN, fix PR #13383 still UNMERGED, both
    // untouched since April. So the trade is a harmless mediocre preview for
    // corrupted generations, and we keep the mediocre preview.
    // Full reasoning: docs/models/krea2/preview-taesd.md. The bytes are staged on
    // R2 at vision/models/vae_approx/lighttaew2_2.safetensors (sha
    // 10124099e0c9864db4e6bcd0f09d822282753e553d344fcf2748cf50140ba16a) ready for
    // the day that PR merges into our engine version — adding the dep back is then
    // the whole job. Until then this comment is the dep.

    // ── MiniMax H3 support weights (MPI-452) ───────────────────────────────────
    // Publisher-hosted for the licence reason spelled out on
    // `minimax-h3-fl2va-transformer` in modelDeps.js — NOT on R2, deliberately.
    //
    // ONE EXCEPTION: `vae-minimax-h3-video-int8` below is R2-primary (MPI-517). Not a
    // softening of the licence position — a supply decision that outranked it. Its only
    // publisher is a repo named "experimental", and these deps generate no mirrors
    // (`_mirrorUrlsFor` only rewrites URLs under the R2 prefix), so a delete or a silent
    // re-export would break every new H3 install with nothing to fall back to. Do NOT
    // generalise it to the transformers or the encoder: those have a stable publisher
    // (Comfy-Org, 6M downloads) and the §III argument still governs them.
    //
    // SHARED with the ref2va model (minimax-h3-ref2va): the second DiT is a different
    // transformer but takes the SAME encoder and the SAME two VAEs, which is why these
    // are resource-named rather than scoped to the fl2va card.
    //
    // H3 emits video AND stereo audio from one sampler pass, so it needs TWO VAEs —
    // the packed NestedTensor latent is decoded by both (VAEDecode + VAEDecodeAudio).
    // That is not a duplicate: dropping either loses half the output.
    'h3-qwen3vl-32b-clip': {
        id: 'h3-qwen3vl-32b-clip',
        name: 'Qwen3-VL 32B text encoder for MiniMax H3 (uncensored, int8_convrot)',
        origin: 'ethanfel/Qwen3-VL-32B-Ultra-Heretic-H3-ComfyUI-INT8-ConvRot',
        filename: 'text_encoders/qwen3vl_32b_h3_ultra_uncensored_heretic_int8_convrot.safetensors',
        url: 'https://huggingface.co/ethanfel/Qwen3-VL-32B-Ultra-Heretic-H3-ComfyUI-INT8-ConvRot/resolve/main/qwen3vl_32b_h3_ultra_uncensored_heretic_int8_convrot.safetensors',
        // int8, NOT int4. The 14.95GB int4 encoder was rejected with evidence in
        // MPI-449 § 4/§ 5. Comfy-Org's own stock encoder is 27.14GB, so this is not the
        // large option — it is the same size class, already trimmed of the Qwen3-VL
        // language layers H3 never reads.
        size: '24.55GB',
        bytes: 26363476151,
        sha256: 'd84547412144b7c50a6ec77437a889b869d3ace88da77ef1775d3d2a4901c192',
    },
    // SUPERSEDED by `vae-minimax-h3-video-int8` (MPI-517) and referenced by NO model.
    //
    // KEPT ANYWAY, ON PURPOSE. `_orphanedDepIds` (routes/downloadManager.js) walks
    // `Object.keys(DEPS)` and resolves each `filename`; a file on disk whose filename is
    // absent from every DEPS entry is invisible to the sweep, permanently. Deleting this
    // entry would strand 4.85GB on the disk of every user who installed H3 before the
    // swap. Present-but-unreferenced is exactly the orphan definition the sweep tests
    // for, so leaving it here is what RECLAIMS the bytes on the next uninstall sweep.
    // Same rule as docs/playbooks/add-model § "Removing or re-tiering a model".
    //
    // Delete only once no plausible installed base still holds the fp16 file.
    'vae-minimax-h3-video': {
        id: 'vae-minimax-h3-video',
        name: 'MiniMax H3 Video VAE (fp16, superseded)',
        origin: 'Comfy-Org/MiniMax-H3',
        filename: 'vae/minimax_h3_video_vae_fp16.safetensors',
        url: 'https://huggingface.co/Comfy-Org/MiniMax-H3/resolve/main/vae/minimax_h3_video_vae_fp16.safetensors',
        size: '4.85GB',
        bytes: 5207808496,
        sha256: '7c1f131492e7eddacaac9069a61b81bdd39de5cc96561e677c5eab1cdce5e522',
    },
    // REQUIRES ComfyUI core >= v0.31.0 — PR #15334 `Support int8_convrot VAE for
    // MiniMax-H3` (merged 2026-08-06, commit bbda8364) is what teaches core to read this
    // format. On v0.30.x it does not load. If the engine pin in dev_configs/node_lock.json
    // ever goes BACK below 0.31, this dep has to go back to the fp16 entry above.
    //
    // Measured on the bench 2026-08-10 (core v0.31.0): faster than fp16 with no quality
    // loss, which is why it is the default rather than a low-tier-only option. The local
    // file Fabio validated was hashed and matches this HF object byte for byte.
    'vae-minimax-h3-video-int8': {
        id: 'vae-minimax-h3-video-int8',
        name: 'MiniMax H3 Video VAE (int8_convrot)',
        origin: 'Kijai/MiniMax-H3-experimental',
        filename: 'vae/minimax_h3_video_vae_int8_convrot.safetensors',
        // R2-primary, publisher as mirror — the inverse of every other H3 dep. Rationale
        // in the section header above and in MPI-517: the publisher repo is 5 days old and
        // named "experimental", so it is the supply risk, not the fallback.
        url: 'https://models.cubric.studio/vision/models/vae/minimax_h3_video_vae_int8_convrot.safetensors',
        mirrorUrl: 'https://huggingface.co/Kijai/MiniMax-H3-experimental/resolve/main/minimax_h3_video_vae_int8_convrot.safetensors',
        size: '2.95GB',
        bytes: 3171670912,
        sha256: '9bb2d96f218c76babd85e0611b85ca8fb330a90546c01a0005e8a58a59593410',
    },
    'vae-minimax-h3-audio': {
        id: 'vae-minimax-h3-audio',
        name: 'MiniMax H3 Audio VAE (fp32)',
        origin: 'Comfy-Org/MiniMax-H3',
        filename: 'vae/minimax_h3_audio_vae_fp32.safetensors',
        url: 'https://huggingface.co/Comfy-Org/MiniMax-H3/resolve/main/vae/minimax_h3_audio_vae_fp32.safetensors',
        size: '577.22MB',
        bytes: 605254808,
        sha256: '8e505d95dd1561d47abd43d4238fd40d9bb1ae9e147ed0a4cba778d76ae4db48',
    },
};
