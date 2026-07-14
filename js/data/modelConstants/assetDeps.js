// ── Support-Weight Dependencies ───────────────────────────────────────────────
// Split out of modelDeps.js (dependencies.js re-exports these as part of DEPS).
// Everything a model DEPENDS on but is not itself the picked model: VAEs,
// text_encoders / CLIP, latent + image upscalers, background-removal, and the
// universal engine-asset weights (detectors, SAM, RIFE). IMPORTANT:
// 1 - If you need to change a URL, you have to set the SHA256 back to null.
// 2 - engineAsset:true = installs with the engine, never GC'd with a model
//     (upscalers, detector/SAM models, RIFE, birefnet). NOTE: the model-specific
//     vae/clip weights below are NOT engineAsset — they GC with their model.

export const assetDeps = {
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
    // Text encoders / CLIP -------------------------------------------------
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
    // Latent / image upscalers ---------------------------------------------
    'ltx23-spatial-upscaler': {
        id: 'ltx23-spatial-upscaler',
        name: 'LTX-2.3 Spatial Upscaler x2 (stage-2)',
        origin: 'Lightricks/LTX-2.3',
        filename: 'latent_upscale_models/ltx-2.3-spatial-upscaler-x2-1.1.safetensors',
        url: 'https://models.cubric.studio/vision/models/latent_upscale_models/ltx-2.3-spatial-upscaler-x2-1.1.safetensors',
        size: '1.5GB',
        sha256: '5f416311fa8172b65af67530758964708d29a317b830d689a51143b7f91913ed',
    },
    // Upscale Models (engine assets) ---------------------------------------
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
        size: '444MB',
        sha256: '9ab37426bf4de0567af6b5d21b16151357149139362e6e8992021b8ce356a154',
        engineAsset: true,
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
        size: '20.4MB',
        sha256: '6a8a825ab2750558bdd20dcced386fd82b7222c7ba58c11d3b611d9c44f1be63',
        engineAsset: true,
    },
    // Detectors + SAM (engine assets) --------------------------------------
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
