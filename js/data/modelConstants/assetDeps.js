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
    // LTX: read by our own `MpiVideoSamplingPreview`, same as H3 below. KJNodes'
    // `LTX2SamplingPreviewOverride` read it until MPI-575, where it turned out to
    // announce its clip length in LATENT frames while a TAEHV streams 8x that many.
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
    // The H3 two-pass shape's upscaler: stage 1 samples at half-res, this lifts the VIDEO
    // half of the packed AV latent (LTXVSeparateAVLatent -> here -> LTXVConcatAVLatent),
    // then a 3-step refine rebuilds detail at full res. Dep of BOTH H3 models.
    //
    // Why it matters beyond speed: 2K (1472x2560) completed in 14:01 on a 16GB card
    // through this path — a canvas that OOMs single-pass on a 5090. That is the argument
    // for two-pass being the default rather than an option.
    //
    // bf16, NOT the fp16 sibling in the same repo — the bench graph loads bf16 and the two
    // are near-identical in size, so a swap would be silent. Apache-2.0 (stated in the model
    // card body, absent from the HF metadata), so no licences.js record. The card credits
    // the LTX 2.3 Spatial Upscaler above and Ttl/ComfyUi_NNLatentUpscale as architectural
    // references; the weights are the author's own.
    'minimax-h3-latent-upscaler': {
        id: 'minimax-h3-latent-upscaler',
        name: 'MiniMax H3 Latent Upscaler 3D',
        origin: 'LBH-123-AI/Minimax_h3_latent_Upscaler (Apache-2.0)',
        filename: 'latent_upscale_models/minimax_h3_latent_upscaler_3d_bf16.safetensors',
        url: 'https://models.cubric.studio/vision/models/latent_upscale_models/minimax_h3_latent_upscaler_3d_bf16.safetensors',
        mirrorUrl: 'https://huggingface.co/LBH-123-AI/Minimax_h3_latent_Upscaler/resolve/main/minimax_h3_latent_upscaler_3d_bf16.safetensors',
        size: '658.61MB',
        bytes: 690592992,
        sha256: '4f57821f5837f32f7142b67d815606dbd7550f194e5c769f7d6c3f83b146a5e6',
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
        // MPI-607: the Pod image really does bake this one — cubric-vision-pod/Dockerfile
        // `dl "$RIFE_DIR" rife47.pth …`. It used to be reported image-resident merely for
        // HAVING `targetPath`, which was true by coincidence while RIFE was the only
        // targetPath dep. Now that the chatterbox weights share the field and are NOT in
        // the image, `_isImageResident` demands this flag explicitly, so it has to be
        // stated here rather than inferred. Do not remove it without also un-baking the
        // weight from the Dockerfile.
        bakedOnPod: true,
    },
    // Chatterbox TTS + VC weights (MPI-607) --------------------------------
    // SAME SHAPE AS RIFE ABOVE, same reason. ComfyUI_Fill-ChatterBox resolves its weights
    // with `get_chatterbox_models_dir()`, which computes `<ComfyUI>/models/chatterbox/`
    // from `__file__` and never touches folder_paths — so extra_model_paths.yaml is
    // invisible to it and these cannot live in mpi_models/. `targetPath` pins them where
    // the pack looks; `filename` is the bare basename, as the resolver requires.
    //
    // The stake is higher than RIFE's 20MB: each loader ends in
    // `download_chatterbox_models(...)`, which hf_hub_downloads any file it does not find.
    // Get the path wrong and the pack silently pulls 4.25GB from HuggingFace outside the
    // download manager — no progress UI, no sha check, no GC, and it re-pulls on every
    // engine reinstall. Getting it right costs nothing: the pack's own
    // `if not local_path.exists()` sees our files and prints "Using cached".
    //
    // NOT engineAsset — unlike RIFE these are a MODEL's weights, not universal engine
    // furniture, so they install with the Chatterbox model and GC with it. Install,
    // status-check and uninstall all take the same engine-anchored `targetPath` branch
    // (downloadManager.js), so nothing about that depends on the engineAsset flag.
    //
    // HF-primary URL, no R2 copy yet — the same call MiniMax H3 and the FLUX ControlNet
    // already ship with. `noMirror: true` on each entry is therefore a STATEMENT, not an
    // oversight: check-dep-urls.mjs would otherwise report seven "no second origin" deps
    // and they would read as forgotten. Mirroring 4.25GB to R2 is a separate, VPN-off job
    // (the VPN throttles R2 ~15x, MPI-354) — do it and these become url=R2 + mirrorUrl=HF
    // like their neighbours, and the flags come off.
    // ponytail: HF-primary until a measured failure justifies the upload.
    //
    // `conds.pt` is BYTE-IDENTICAL in both folders (sha 6552d705…) — one upstream file
    // that the pack expects to find beside each model. 107KB, so it is duplicated rather
    // than shared; do not try to dedupe it into one dep, the two loaders read two paths.
    'chatterbox-ve': {
        id: 'chatterbox-ve',
        name: 'Chatterbox voice encoder',
        origin: 'ResembleAI/chatterbox',
        filename: 've.safetensors',
        targetPath: 'models/chatterbox/chatterbox',
        url: 'https://huggingface.co/ResembleAI/chatterbox/resolve/main/ve.safetensors',
        size: '5.43MB',
        bytes: 5695784,
        sha256: 'f0921cab452fa278bc25cd23ffd59d36f816d7dc5181dd1bef9751a7fb61f63c',
        noMirror: true,
    },
    'chatterbox-t3': {
        id: 'chatterbox-t3',
        name: 'Chatterbox T3 (text-to-token)',
        origin: 'ResembleAI/chatterbox',
        filename: 't3_cfg.safetensors',
        targetPath: 'models/chatterbox/chatterbox',
        url: 'https://huggingface.co/ResembleAI/chatterbox/resolve/main/t3_cfg.safetensors',
        size: '1.98GB',
        bytes: 2129653744,
        sha256: '914cb1696f47527fe8852ca8f1fe1fa63cb34f76f9c715e84e067b744dd0da81',
        noMirror: true,
    },
    'chatterbox-s3gen': {
        id: 'chatterbox-s3gen',
        name: 'Chatterbox S3Gen (token-to-audio)',
        origin: 'ResembleAI/chatterbox',
        filename: 's3gen.safetensors',
        targetPath: 'models/chatterbox/chatterbox',
        url: 'https://huggingface.co/ResembleAI/chatterbox/resolve/main/s3gen.safetensors',
        size: '1007.54MB',
        bytes: 1056484620,
        sha256: '2b78103c654207393955e4900aac14a12de8ef25f4b09424f1ef91941f161d4e',
        noMirror: true,
    },
    'chatterbox-tokenizer': {
        id: 'chatterbox-tokenizer',
        name: 'Chatterbox tokenizer',
        origin: 'ResembleAI/chatterbox',
        filename: 'tokenizer.json',
        targetPath: 'models/chatterbox/chatterbox',
        url: 'https://huggingface.co/ResembleAI/chatterbox/resolve/main/tokenizer.json',
        size: '24.87KB',
        bytes: 25470,
        sha256: 'd71e3a44eabb1784df9a68e9f95b251ecbf1a7af6a9f50835856b2ca9d8c14a5',
        noMirror: true,
    },
    'chatterbox-conds': {
        id: 'chatterbox-conds',
        name: 'Chatterbox default conditionals',
        origin: 'ResembleAI/chatterbox',
        filename: 'conds.pt',
        targetPath: 'models/chatterbox/chatterbox',
        url: 'https://huggingface.co/ResembleAI/chatterbox/resolve/main/conds.pt',
        size: '104.86KB',
        bytes: 107374,
        sha256: '6552d70568833628ba019c6b03459e77fe71ca197d5c560cef9411bee9d87f4e',
        noMirror: true,
    },
    // Voice conversion. `s3gen.pt` is NOT a copy of `s3gen.safetensors` above — different
    // bytes, different serialisation, and vc.py's VC_MODEL_FILES demands the `.pt`.
    'chatterbox-vc-s3gen': {
        id: 'chatterbox-vc-s3gen',
        name: 'Chatterbox VC S3Gen',
        origin: 'ResembleAI/chatterbox',
        filename: 's3gen.pt',
        targetPath: 'models/chatterbox/chatterbox_vc',
        url: 'https://huggingface.co/ResembleAI/chatterbox/resolve/main/s3gen.pt',
        size: '1008.19MB',
        bytes: 1057165844,
        sha256: '9b9ff07e60b20c136e2b1b3d7563a24604e8d2c4c267888d1ee929dd0151d2a3',
        noMirror: true,
    },
    'chatterbox-vc-conds': {
        id: 'chatterbox-vc-conds',
        name: 'Chatterbox VC conditionals',
        origin: 'ResembleAI/chatterbox',
        filename: 'conds.pt',
        targetPath: 'models/chatterbox/chatterbox_vc',
        url: 'https://huggingface.co/ResembleAI/chatterbox/resolve/main/conds.pt',
        size: '104.86KB',
        bytes: 107374,
        sha256: '6552d70568833628ba019c6b03459e77fe71ca197d5c560cef9411bee9d87f4e',
        noMirror: true,
    },
    // Chatterbox MULTILINGUAL (MPI-607) — the 23-language arm ------------------
    // ONE model, not one per language. `t3_mtl23ls_v2` is "multilingual, 23
    // languages" in a single checkpoint, so shipping all 23 costs exactly what
    // shipping one would and there is no list to trim. Six files, 2.99GB, into the
    // pack's own `chatterbox_multilingual/` — same `targetPath` reasoning as the
    // English set above: ComfyUI_Fill-ChatterBox computes its directory from
    // `__file__` and never reads extra_model_paths.yaml, and the loader ends in
    // `download_chatterbox_models(...)`, which hf_hub_downloads anything it does not
    // find — outside the download manager, no progress, no sha, no GC, re-pulled on
    // every engine reinstall.
    //
    // `s3gen.pt` and `conds.pt` are BYTE-IDENTICAL to their chatterbox_vc twins
    // (sha 9b9ff07e… and 6552d705…) and are deliberately NOT deduped, for the reason
    // already recorded against conds.pt: the pack expects each model to find its own
    // copy beside it, and the two loaders read two paths. It costs a duplicated 1GB
    // for s3gen; a symlink or a shared dep would be a silent breakage the first time
    // a user installs one flow without the other.
    //
    // `ve.pt` here is NOT `chatterbox-ve` above — that one is `ve.safetensors`,
    // 5695784 bytes; this is `ve.pt`, 5698626. Different files, similar size, easy
    // to mistake for a duplicate.
    'chatterbox-mtl-t3': {
        id: 'chatterbox-mtl-t3',
        name: 'Chatterbox multilingual T3 (23 languages)',
        origin: 'ResembleAI/chatterbox',
        filename: 't3_mtl23ls_v2.safetensors',
        targetPath: 'models/chatterbox/chatterbox_multilingual',
        url: 'https://huggingface.co/ResembleAI/chatterbox/resolve/main/t3_mtl23ls_v2.safetensors',
        size: '2GB',
        bytes: 2143989752,
        sha256: 'b1237586127ce98e7800a68e49938eb5092846862aabcb6e17b2fda7889a6c75',
        noMirror: true,
    },
    'chatterbox-mtl-s3gen': {
        id: 'chatterbox-mtl-s3gen',
        name: 'Chatterbox multilingual S3Gen',
        origin: 'ResembleAI/chatterbox',
        filename: 's3gen.pt',
        targetPath: 'models/chatterbox/chatterbox_multilingual',
        url: 'https://huggingface.co/ResembleAI/chatterbox/resolve/main/s3gen.pt',
        size: '1008.19MB',
        bytes: 1057165844,
        sha256: '9b9ff07e60b20c136e2b1b3d7563a24604e8d2c4c267888d1ee929dd0151d2a3',
        noMirror: true,
    },
    'chatterbox-mtl-ve': {
        id: 'chatterbox-mtl-ve',
        name: 'Chatterbox multilingual voice encoder',
        origin: 'ResembleAI/chatterbox',
        filename: 've.pt',
        targetPath: 'models/chatterbox/chatterbox_multilingual',
        url: 'https://huggingface.co/ResembleAI/chatterbox/resolve/main/ve.pt',
        size: '5.43MB',
        bytes: 5698626,
        sha256: '4b16d836bc598509860f6fa068165a8bb5e9ac84f05582dfcf278a5a372879f1',
        noMirror: true,
    },
    'chatterbox-mtl-grapheme': {
        id: 'chatterbox-mtl-grapheme',
        name: 'Chatterbox multilingual grapheme map',
        origin: 'ResembleAI/chatterbox',
        filename: 'grapheme_mtl_merged_expanded_v1.json',
        targetPath: 'models/chatterbox/chatterbox_multilingual',
        url: 'https://huggingface.co/ResembleAI/chatterbox/resolve/main/grapheme_mtl_merged_expanded_v1.json',
        size: '68.35KB',
        bytes: 69989,
        sha256: '69632f47220a788a52ce2661d096453c5655e9bf25289d89a8d832c46ee07dbf',
        noMirror: true,
    },
    'chatterbox-mtl-cangjie': {
        id: 'chatterbox-mtl-cangjie',
        name: 'Chatterbox Cangjie map (Chinese)',
        origin: 'ResembleAI/chatterbox',
        filename: 'Cangjie5_TC.json',
        targetPath: 'models/chatterbox/chatterbox_multilingual',
        url: 'https://huggingface.co/ResembleAI/chatterbox/resolve/main/Cangjie5_TC.json',
        size: '1.83MB',
        bytes: 1920163,
        sha256: '7073fd9de919443ae88e0bd2449917a65fe54898a4413ed1edcc4b67f28bce8c',
        noMirror: true,
    },
    'chatterbox-mtl-conds': {
        id: 'chatterbox-mtl-conds',
        name: 'Chatterbox multilingual conditionals',
        origin: 'ResembleAI/chatterbox',
        filename: 'conds.pt',
        targetPath: 'models/chatterbox/chatterbox_multilingual',
        url: 'https://huggingface.co/ResembleAI/chatterbox/resolve/main/conds.pt',
        size: '104.86KB',
        bytes: 107374,
        sha256: '6552d70568833628ba019c6b03459e77fe71ca197d5c560cef9411bee9d87f4e',
        noMirror: true,
    },
    // DramaBox weights (MPI-607) -------------------------------------------
    // 15.23GB across 16 entries, and the shape is the OPPOSITE of the Chatterbox
    // block above. ComfyUI-MelodramaBox resolves every weight through
    // `folder_paths.get_folder_paths("diffusion_models" | "vae" | "text_encoders")`
    // (dramabox_nodes/config.py), which DOES read extra_model_paths.yaml — so these
    // are ordinary mpi_models/ deps with a plain `filename`, and `targetPath` would
    // be wrong here. Do not copy the Chatterbox reasoning across: that pack computes
    // its directory from its own __file__ and cannot see the yaml, which is the only
    // reason its weights are pinned into the engine tree.
    //
    // HF-primary with `noMirror: true`, the same call the Chatterbox block makes and
    // for the same reason: check-dep-urls.mjs would otherwise report 16 "no second
    // origin" deps that read as forgotten. Mirroring 15.23GB to R2 is a separate
    // VPN-off job (the VPN throttles R2 ~15x, MPI-354).
    // ponytail: HF-primary until a measured failure justifies the upload.
    //
    // THE TEXT ENCODER IS FOURTEEN ENTRIES BECAUSE A DEP IS ONE FILE. There is no
    // snapshot/folder dep type, and `from_pretrained` on the directory needs the
    // config, the index, both shards and the whole tokenizer/processor set — so the
    // HF snapshot is enumerated file by file. Only `.gitattributes` and the `.cache/`
    // directory are left out; nothing loads them. The ids keep each file's EXTENSION
    // (`…-tokenizer-json` vs `…-tokenizer-model`) because stripping it collides two
    // pairs — chat_template.jinja/.json and tokenizer.json/.model.
    //
    // The 4-bit unsloth snapshot is deliberate, not a size compromise: it is what
    // upstream's own inference path loads. `google/gemma-3-12b-it` is bf16 (~24GB)
    // AND gated behind Google's licence, so it needs HF auth the download manager
    // does not have. The nf4 quantisation is why bitsandbytes is a hard requirement,
    // and why Apple Silicon is unverified (MPI-249).
    'dramabox-dit': {
        id: 'dramabox-dit',
        name: 'DramaBox audio DiT',
        origin: 'ResembleAI/Dramabox',
        filename: 'diffusion_models/dramabox-dit-v1.safetensors',
        url: 'https://huggingface.co/ResembleAI/Dramabox/resolve/main/dramabox-dit-v1.safetensors',
        size: '6.12GB',
        bytes: 6575225528,
        sha256: '01a626525d935e8c9fb0efe124334d1e4970aeda82215d2e14ca9fe904b5c25d',
        noMirror: true,
    },
    'dramabox-audio-components': {
        id: 'dramabox-audio-components',
        name: 'DramaBox audio components (VAE + vocoder)',
        origin: 'ResembleAI/Dramabox',
        filename: 'vae/dramabox-audio-components.safetensors',
        url: 'https://huggingface.co/ResembleAI/Dramabox/resolve/main/dramabox-audio-components.safetensors',
        size: '1.81GB',
        bytes: 1942831020,
        sha256: '73d50dd3e913fd1d2511a09e4a2225f60f2ede43ef629764e6d4a389422bf7d1',
        noMirror: true,
    },
    'dramabox-gemma-added-tokens-json': {
        id: 'dramabox-gemma-added-tokens-json',
        name: 'Gemma-3-12B 4-bit — added_tokens.json',
        origin: 'unsloth/gemma-3-12b-it-bnb-4bit',
        filename: 'text_encoders/gemma-3-12b-it-bnb-4bit/added_tokens.json',
        url: 'https://huggingface.co/unsloth/gemma-3-12b-it-bnb-4bit/resolve/main/added_tokens.json',
        size: '35B',
        bytes: 35,
        sha256: '50b2f405ba56a26d4913fd772089992252d7f942123cc0a034d96424221ba946',
        noMirror: true,
    },
    'dramabox-gemma-chat-template-jinja': {
        id: 'dramabox-gemma-chat-template-jinja',
        name: 'Gemma-3-12B 4-bit — chat_template.jinja',
        origin: 'unsloth/gemma-3-12b-it-bnb-4bit',
        filename: 'text_encoders/gemma-3-12b-it-bnb-4bit/chat_template.jinja',
        url: 'https://huggingface.co/unsloth/gemma-3-12b-it-bnb-4bit/resolve/main/chat_template.jinja',
        size: '1.50KB',
        bytes: 1532,
        sha256: '7de1c58e208eda46e9c7f86397df37ec49883aeece39fb961e0a6b24088dd3c4',
        noMirror: true,
    },
    'dramabox-gemma-chat-template-json': {
        id: 'dramabox-gemma-chat-template-json',
        name: 'Gemma-3-12B 4-bit — chat_template.json',
        origin: 'unsloth/gemma-3-12b-it-bnb-4bit',
        filename: 'text_encoders/gemma-3-12b-it-bnb-4bit/chat_template.json',
        url: 'https://huggingface.co/unsloth/gemma-3-12b-it-bnb-4bit/resolve/main/chat_template.json',
        size: '1.58KB',
        bytes: 1615,
        sha256: 'fe16baf728db49457cde32802cd7efc0ac8a7a9877dbe22fe3322b2d9dc6ccd9',
        noMirror: true,
    },
    'dramabox-gemma-config-json': {
        id: 'dramabox-gemma-config-json',
        name: 'Gemma-3-12B 4-bit — config.json',
        origin: 'unsloth/gemma-3-12b-it-bnb-4bit',
        filename: 'text_encoders/gemma-3-12b-it-bnb-4bit/config.json',
        url: 'https://huggingface.co/unsloth/gemma-3-12b-it-bnb-4bit/resolve/main/config.json',
        size: '2.18KB',
        bytes: 2236,
        sha256: '095a1c2aeb3dc83f16643964c5dd7d109e002d80e45f54559009d610723c158c',
        noMirror: true,
    },
    'dramabox-gemma-generation-config-json': {
        id: 'dramabox-gemma-generation-config-json',
        name: 'Gemma-3-12B 4-bit — generation_config.json',
        origin: 'unsloth/gemma-3-12b-it-bnb-4bit',
        filename: 'text_encoders/gemma-3-12b-it-bnb-4bit/generation_config.json',
        url: 'https://huggingface.co/unsloth/gemma-3-12b-it-bnb-4bit/resolve/main/generation_config.json',
        size: '210B',
        bytes: 210,
        sha256: '031fdd1faee68cf7e0cafd12203a08f51f86abd82877a401fc8dafad7b2f7b5c',
        noMirror: true,
    },
    'dramabox-gemma-model-00001-of-00002-safetensors': {
        id: 'dramabox-gemma-model-00001-of-00002-safetensors',
        name: 'Gemma-3-12B 4-bit — model-00001-of-00002.safetensors',
        origin: 'unsloth/gemma-3-12b-it-bnb-4bit',
        filename: 'text_encoders/gemma-3-12b-it-bnb-4bit/model-00001-of-00002.safetensors',
        url: 'https://huggingface.co/unsloth/gemma-3-12b-it-bnb-4bit/resolve/main/model-00001-of-00002.safetensors',
        size: '4.65GB',
        bytes: 4992269027,
        sha256: '5578abd3c27241a31f21c13220f44a427b99f1c36564ac587670f3be990d4ffc',
        noMirror: true,
    },
    'dramabox-gemma-model-00002-of-00002-safetensors': {
        id: 'dramabox-gemma-model-00002-of-00002-safetensors',
        name: 'Gemma-3-12B 4-bit — model-00002-of-00002.safetensors',
        origin: 'unsloth/gemma-3-12b-it-bnb-4bit',
        filename: 'text_encoders/gemma-3-12b-it-bnb-4bit/model-00002-of-00002.safetensors',
        url: 'https://huggingface.co/unsloth/gemma-3-12b-it-bnb-4bit/resolve/main/model-00002-of-00002.safetensors',
        size: '2.61GB',
        bytes: 2806556175,
        sha256: '790314e959098fdf65825d475a12c794cacbdffe6097f72a1d25c5720d3625c3',
        noMirror: true,
    },
    'dramabox-gemma-model-safetensors-index-json': {
        id: 'dramabox-gemma-model-safetensors-index-json',
        name: 'Gemma-3-12B 4-bit — model.safetensors.index.json',
        origin: 'unsloth/gemma-3-12b-it-bnb-4bit',
        filename: 'text_encoders/gemma-3-12b-it-bnb-4bit/model.safetensors.index.json',
        url: 'https://huggingface.co/unsloth/gemma-3-12b-it-bnb-4bit/resolve/main/model.safetensors.index.json',
        size: '387.25KB',
        bytes: 396548,
        sha256: 'a6fe6d7c94fa568e90b4bf20c68fa85a842198f228aff1bedaa34970c605d593',
        noMirror: true,
    },
    'dramabox-gemma-preprocessor-config-json': {
        id: 'dramabox-gemma-preprocessor-config-json',
        name: 'Gemma-3-12B 4-bit — preprocessor_config.json',
        origin: 'unsloth/gemma-3-12b-it-bnb-4bit',
        filename: 'text_encoders/gemma-3-12b-it-bnb-4bit/preprocessor_config.json',
        url: 'https://huggingface.co/unsloth/gemma-3-12b-it-bnb-4bit/resolve/main/preprocessor_config.json',
        size: '570B',
        bytes: 570,
        sha256: 'f688d6bb20c5017601c4011de7ca656da8485b540b05013efdaf986c0fcc918d',
        noMirror: true,
    },
    'dramabox-gemma-processor-config-json': {
        id: 'dramabox-gemma-processor-config-json',
        name: 'Gemma-3-12B 4-bit — processor_config.json',
        origin: 'unsloth/gemma-3-12b-it-bnb-4bit',
        filename: 'text_encoders/gemma-3-12b-it-bnb-4bit/processor_config.json',
        url: 'https://huggingface.co/unsloth/gemma-3-12b-it-bnb-4bit/resolve/main/processor_config.json',
        size: '70B',
        bytes: 70,
        sha256: '3ffd5f11778dc73e2b69b3c00535e4121e1badf7018136263cd17b5b34fbaa53',
        noMirror: true,
    },
    'dramabox-gemma-special-tokens-map-json': {
        id: 'dramabox-gemma-special-tokens-map-json',
        name: 'Gemma-3-12B 4-bit — special_tokens_map.json',
        origin: 'unsloth/gemma-3-12b-it-bnb-4bit',
        filename: 'text_encoders/gemma-3-12b-it-bnb-4bit/special_tokens_map.json',
        url: 'https://huggingface.co/unsloth/gemma-3-12b-it-bnb-4bit/resolve/main/special_tokens_map.json',
        size: '670B',
        bytes: 670,
        sha256: '45a857d8a2495d0be30a5d2d6de03278195eb028b6e0b8efc248bfa697d65f05',
        noMirror: true,
    },
    'dramabox-gemma-tokenizer-json': {
        id: 'dramabox-gemma-tokenizer-json',
        name: 'Gemma-3-12B 4-bit — tokenizer.json',
        origin: 'unsloth/gemma-3-12b-it-bnb-4bit',
        filename: 'text_encoders/gemma-3-12b-it-bnb-4bit/tokenizer.json',
        url: 'https://huggingface.co/unsloth/gemma-3-12b-it-bnb-4bit/resolve/main/tokenizer.json',
        size: '31.84MB',
        bytes: 33384568,
        sha256: '4667f2089529e8e7657cfb6d1c19910ae71ff5f28aa7ab2ff2763330affad795',
        noMirror: true,
    },
    'dramabox-gemma-tokenizer-model': {
        id: 'dramabox-gemma-tokenizer-model',
        name: 'Gemma-3-12B 4-bit — tokenizer.model',
        origin: 'unsloth/gemma-3-12b-it-bnb-4bit',
        filename: 'text_encoders/gemma-3-12b-it-bnb-4bit/tokenizer.model',
        url: 'https://huggingface.co/unsloth/gemma-3-12b-it-bnb-4bit/resolve/main/tokenizer.model',
        size: '4.47MB',
        bytes: 4689074,
        sha256: '1299c11d7cf632ef3b4e11937501358ada021bbdf7c47638d13c0ee982f2e79c',
        noMirror: true,
    },
    'dramabox-gemma-tokenizer-config-json': {
        id: 'dramabox-gemma-tokenizer-config-json',
        name: 'Gemma-3-12B 4-bit — tokenizer_config.json',
        origin: 'unsloth/gemma-3-12b-it-bnb-4bit',
        filename: 'text_encoders/gemma-3-12b-it-bnb-4bit/tokenizer_config.json',
        url: 'https://huggingface.co/unsloth/gemma-3-12b-it-bnb-4bit/resolve/main/tokenizer_config.json',
        size: '1.10MB',
        bytes: 1158492,
        sha256: '8925eabb556c1897ca1bed405f0612e735a56afcd4d77e76eb90fd771e706f9c',
        noMirror: true,
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
    // TWO EXCEPTIONS are R2-primary, and they are exceptions of DIFFERENT KINDS. Neither
    // one softens the licence position; read which is which before citing either as
    // precedent.
    //
    //   1. `vae-minimax-h3-video-int8` (MPI-517) — the licence argument APPLIES and was
    //      OUTRANKED by supply risk. Its only publisher is a repo named "experimental",
    //      and a publisher-hosted dep generates no mirrors (`_mirrorUrlsFor` only rewrites
    //      URLs under the R2 prefix), so a delete or a silent re-export would break every
    //      new H3 install with nothing to fall back to.
    //   2. `h3-qwen3vl-32b-clip-nvfp4` (MPI-698, and `h3-qwen3vl-32b-clip` before it,
    //      MPI-653) — the licence argument does not REACH it, so there was nothing to
    //      outrank. The encoder is Alibaba's Qwen3-VL-32B-Instruct trimmed to the layers
    //      H3 reads and quantised: apache-2.0 down the whole chain, and carrying no
    //      MiniMax weights, parameters, operational patterns or Outputs. That makes it
    //      neither a §I.11 Model Derivative nor §I.10 Materials (which is MiniMax H3 *as
    //      made available by MiniMax* — this never was). H3-*shaped* is not
    //      H3-*derived*. Chain walked in MPI-653's brief.
    //
    //      MPI-698 MOVED THIS FILE INTO Comfy-Org/MiniMax-H3, WHOSE REPO CARD DECLARES
    //      THE MINIMAX CLA (`license: other`, `license_name:
    //      minimax-h3-community-license-agreement`). That blanket label does NOT reach
    //      this file and the verdict above is unchanged, because the label is a repo
    //      property and the licence question is about what the WEIGHTS ARE. Comfy-Org's
    //      own README names the source — "converted from
    //      https://huggingface.co/cybermotaz/Qwen3-VL-32B-Instruct-NVFP4" — and that repo
    //      declares `license_name: qwen` pointing at Qwen/Qwen3-VL-32B-Instruct/LICENSE,
    //      which is apache-2.0. Alibaba's model does not become MiniMax's by being
    //      repackaged into a repo that mostly holds MiniMax transformers. Chain
    //      re-walked 2026-09-05: Qwen3-VL-32B-Instruct (apache-2.0) -> cybermotaz NVFP4
    //      (points at that same LICENSE) -> Comfy-Org ComfyUI repackage.
    //
    // Do NOT generalise either one to the TRANSFORMERS — and specifically, do not read
    // exception 2 as "files from Comfy-Org/MiniMax-H3 can go on R2". They cannot. The
    // transformers in that same repo are MiniMax's own weights from a stable publisher
    // (Comfy-Org, 6M downloads) and §III redistribution still governs them — that is the
    // position recorded on `minimax-h3-fl2va-transformer`. What travels here is the
    // chain-walk, never the hostname.
    //
    // SHARED with the ref2va model (minimax-h3-ref2va): the second DiT is a different
    // transformer but takes the SAME encoder and the SAME two VAEs, which is why these
    // are resource-named rather than scoped to the fl2va card.
    //
    // H3 emits video AND stereo audio from one sampler pass, so it needs TWO VAEs —
    // the packed NestedTensor latent is decoded by both (VAEDecode + VAEDecodeAudio).
    // That is not a duplicate: dropping either loses half the output.
    'h3-qwen3vl-32b-clip-nvfp4': {
        id: 'h3-qwen3vl-32b-clip-nvfp4',
        name: 'Qwen3-VL 32B text encoder for MiniMax H3 (nvfp4_awq)',
        origin: 'Comfy-Org/MiniMax-H3 text_encoders/qwen3vl_32b_minimax_h3_nvfp4_awq.safetensors (Apache-2.0 via Qwen/Qwen3-VL-32B-Instruct)',
        filename: 'text_encoders/qwen3vl_32b_minimax_h3_nvfp4_awq.safetensors',
        // WHY THIS REPLACED THE 24.55GB int8_convrot BUILD (MPI-698). H3 stages the text
        // encoder BESIDE the transformer — ~45GB resident at peak on the int8 pair, at
        // ANY resolution, because it is weight staging and not activations. That is what
        // SIGKILLed a 54GB L4 Pod on `minimax-h3/t2v_ms` at 128px (`code -9`, the Linux
        // OOM killer) while the same op passed on an 80GB box. 24.55 -> 14.61GB takes the
        // pair to ~35GB and puts a 54GB box back in range. Windows never showed it: the
        // pagefile absorbs the overshoot, a Pod has no swap.
        //
        // NOT BLACKWELL-GATED, despite the `nvfp4` name — Comfy-Org's own README says so
        // outright ("This nvfp4 text encoder does not require Blackwell GPU to use"), and
        // the smoke matrix runs Ada (L4) and Ampere hosts. Do not add a GPU-generation
        // gate on the strength of the filename.
        //
        // UNCENSORED, AND THE "HERETIC" LINEAGE TURNED OUT NOT TO BE LOAD-BEARING. The
        // build this replaces was ethanfel's Ultra-Heretic abliteration, carried for one
        // reason: uncensored output. Fabio A/B'd the two on 2026-09-05 across uncensored
        // and deliberately hard prompts and got IDENTICAL results, so the stock Qwen3-VL
        // build is already uncensored in this role. Consistent with what the encoder does
        // here — H3 reads the trimmed embedding layers as a conditioner, not the
        // instruction-tuned refusal behaviour that abliteration targets. Evidence is the
        // A/B, not this reasoning: re-run it before assuming a FUTURE encoder swap is
        // equally free.
        //
        // R2-primary — exception 2 in the section header above, and read the Comfy-Org
        // repo-label caveat there before citing this as precedent for anything else in
        // that repo.
        //
        // The explicit `mirrorUrl` is LOAD-BEARING, not decoration: `_mirrorUrlsFor`
        // short-circuits on it (downloadManager.js:1156) and returns it as the ONLY
        // alternate, which suppresses the generic /vision/models/ -> our-HF rewrite. So
        // this dep implies NO second re-host into Mad-Pony-Interactive/cubric-studio;
        // failover goes straight back to Comfy-Org. Byte-identical upstream, verified
        // 2026-09-05: HF's `lfs.oid` for that path IS the sha256 below.
        url: 'https://models.cubric.studio/vision/models/text_encoders/qwen3vl_32b_minimax_h3_nvfp4_awq.safetensors',
        mirrorUrl: 'https://huggingface.co/Comfy-Org/MiniMax-H3/resolve/main/text_encoders/qwen3vl_32b_minimax_h3_nvfp4_awq.safetensors',
        // Apache-2.0 attribution (§4). No repo in the chain ships a LICENSE or NOTICE
        // file, so §4(c) does not bite — what remains is naming the authors, which
        // MpiAbout renders from this block. Not a gated model: no `licences/` folder and
        // no consent gate.
        credit: {
            author: 'Qwen (Alibaba) — NVFP4 quant by cybermotaz, ComfyUI repackage by Comfy-Org',
            work: 'Qwen3-VL-32B-Instruct (nvfp4_awq)',
            url: 'https://huggingface.co/cybermotaz/Qwen3-VL-32B-Instruct-NVFP4',
        },
        size: '14.61GB',
        bytes: 15687142551,
        sha256: '35a88d51044231fe332301d7a62aa81e3f2cba62febeb446e2c1e3e0ef76f2c6',
    },
    // SUPERSEDED by `h3-qwen3vl-32b-clip-nvfp4` (MPI-698) and referenced by NO model.
    //
    // KEPT ANYWAY, ON PURPOSE — the same orphan-sweep rule spelled out on
    // `vae-minimax-h3-video` below. `_orphanedDepIds` (routes/downloadManager.js) walks
    // `Object.keys(DEPS)` and resolves each `filename`; a file on disk whose filename is
    // absent from every DEPS entry is invisible to the sweep, permanently. Deleting this
    // entry would strand 24.55GB on the disk of every user who installed H3 before the
    // swap — the single largest orphan the catalogue has ever had. Present-but-
    // unreferenced is exactly the orphan definition the sweep tests for, so leaving it
    // here is what RECLAIMS the bytes on the next uninstall sweep.
    //
    // Both URLs stay live and correct on purpose: `release:deps` HEADs every URL in DEPS,
    // and the R2 object is NOT to be deleted while this entry stands (an R2 delete needs
    // Fabio's approval in any case).
    //
    // Delete only once no plausible installed base still holds the int8_convrot file.
    'h3-qwen3vl-32b-clip': {
        id: 'h3-qwen3vl-32b-clip',
        name: 'Qwen3-VL 32B text encoder for MiniMax H3 (uncensored, int8_convrot, superseded)',
        origin: 'ethanfel/Qwen3-VL-32B-Ultra-Heretic-H3-ComfyUI-INT8-ConvRot (Apache-2.0)',
        filename: 'text_encoders/qwen3vl_32b_h3_ultra_uncensored_heretic_int8_convrot.safetensors',
        url: 'https://models.cubric.studio/vision/models/text_encoders/qwen3vl_32b_h3_ultra_uncensored_heretic_int8_convrot.safetensors',
        mirrorUrl: 'https://huggingface.co/ethanfel/Qwen3-VL-32B-Ultra-Heretic-H3-ComfyUI-INT8-ConvRot/resolve/main/qwen3vl_32b_h3_ultra_uncensored_heretic_int8_convrot.safetensors',
        credit: {
            author: 'ethanfel',
            work: 'Qwen3-VL-32B-Ultra-Heretic-H3-ComfyUI-INT8-ConvRot',
            url: 'https://huggingface.co/ethanfel/Qwen3-VL-32B-Ultra-Heretic-H3-ComfyUI-INT8-ConvRot',
        },
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

    // ── MiniMax Music 3 support weights (MPI-664) ────────────────────────
    // The text-to-music Flow's ENTIRE weight set — DiT, text encoder, VAE. They live here
    // rather than in modelDeps.js because Music 3 ships as a FLOW WITH DEPS and has no
    // ModelDef at all (the Voice Changer precedent, flowsRegistry.js § voice-changer): a
    // ModelDef would force dead fields and an entry in the model picker, and nothing about
    // a music generator belongs in an image/video picker.
    //
    // LICENCE — the MiniMax-Music3 Community License, read in full 2026-08-31 and bundled
    // at `licences/minimax-music3/`. It is NOT H3's agreement and three differences bite:
    //
    //   1. NO TERRITORY BAR. The Applicable-Territory restriction that makes H3 painful is
    //      simply absent, so the descriptor carries no `territory` block.
    //   2. REDISTRIBUTION IS GRANTED OUTRIGHT — "distribute, sublicense, and/or provide
    //      copies of the Software". So an R2 re-host is PERMITTED here. That is the exact
    //      inverse of the H3 weights above, where the publisher URL is a licence POSITION
    //      and R2 is closed forever. These three are HF-primary only because the 14.33GB
    //      upload has not been done yet, which is why they carry NO `noMirror` flag:
    //      check-dep-urls.mjs reporting "no second origin" is correct and actionable, not
    //      a false positive to silence.
    //   3. §3.1 obliges us to display the name "MiniMax-Music3" PROMINENTLY on the UI of a
    //      commercial product. `credit` below is what discharges any of that today —
    //      MpiAbout derives its Credits list straight from DEPS, so these entries put the
    //      name on the About page with no wiring. The descriptor's `poweredBy` renders in
    //      the Model Library detail drawer keyed by model id, and this flow has no model
    //      card, so that field has NO surface. Open call, see licences.js § MINIMAX_MUSIC3.
    //
    // THE int8 TEXT ENCODER IS THE ONLY SHIPPABLE ONE. `pruned_bf16` (16.71GB) stages
    // 15.9GB onto a 16GB card and runs ~9x slower — downloaded, tested, abandoned. The
    // bench card and the target user card are both 16GB, so a better-sounding bf16 result
    // would be unshippable anyway. Do not "upgrade" this entry; MPI-664 plan § The voice
    // roster carries the measurements.
    'minimax-music3-dit': {
        id: 'minimax-music3-dit',
        name: 'MiniMax Music 3 DiT (fp16)',
        origin: 'Comfy-Org/MiniMax-Music-3',
        filename: 'diffusion_models/minimax_music3_dit_fp16.safetensors',
        url: 'https://huggingface.co/Comfy-Org/MiniMax-Music-3/resolve/main/diffusion_models/minimax_music3_dit_fp16.safetensors',
        size: '4.58GB',
        bytes: 4914197682,
        sha256: '45494a2b6b69af115902ff28eaf54118d19067aa54da01000f3e3efce7ba0e34',
        // §3.1 — attribution is a licence obligation here, not a courtesy. MpiAbout groups
        // by author, so all three entries naming the same work render ONE row.
        credit: {
            author: 'MiniMax',
            work: 'MiniMax-Music3',
            url: 'https://huggingface.co/MiniMaxAI/MiniMax-Music3',
        },
    },
    'minimax-music3-text-encoder': {
        id: 'minimax-music3-text-encoder',
        name: 'MiniMax Music 3 text encoder (pruned, int8_convrot)',
        origin: 'Comfy-Org/MiniMax-Music-3',
        filename: 'text_encoders/minimax_music3_text_encoder_pruned_int8_convrot.safetensors',
        url: 'https://huggingface.co/Comfy-Org/MiniMax-Music-3/resolve/main/text_encoders/minimax_music3_text_encoder_pruned_int8_convrot.safetensors',
        size: '8.57GB',
        bytes: 9196611886,
        sha256: '010b7416d2336a08c711bc22ee65849c9623069ddb7d89bec011a75699e52014',
        credit: {
            author: 'MiniMax',
            work: 'MiniMax-Music3',
            url: 'https://huggingface.co/MiniMaxAI/MiniMax-Music3',
        },
    },
    // DAV = the Descript Audio Codec VAE Music 3 decodes through. Tiny beside the other
    // two, and the graph cannot run without it.
    'vae-minimax-music3-dav': {
        id: 'vae-minimax-music3-dav',
        name: 'MiniMax Music 3 DAV VAE',
        origin: 'Comfy-Org/MiniMax-Music-3',
        filename: 'vae/minimax_music3_dav.safetensors',
        url: 'https://huggingface.co/Comfy-Org/MiniMax-Music-3/resolve/main/vae/minimax_music3_dav.safetensors',
        size: '206.66MB',
        bytes: 216696128,
        sha256: '2a32155b769be01445fcc2a8663b910fc9e1751e18dc1c3ec528064512d9ef0c',
        credit: {
            author: 'MiniMax',
            work: 'MiniMax-Music3',
            url: 'https://huggingface.co/MiniMaxAI/MiniMax-Music3',
        },
    },
};
