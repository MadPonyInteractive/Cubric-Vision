// ── Shared Dependencies ───────────────────────────────────────────────────────
// Defined once, referenced by id in model dependency lists to avoid repetition.
// *********
// IMPORTANT: If you need to change a URL, you have to set the SHA256 back to null. 
// *********

export const DEPS = {
    // Models
    'sdxl-realistic': {
        id: 'sdxl-realistic',
        name: 'SDXL Realistic',
        type: 'checkpoint',
        origin: 'lustify_7',
        filename: 'checkpoints/SDXL/SDXL_Realistic.safetensors',
        url: 'https://huggingface.co/MadPonyInteractive/CubricModels/resolve/main/SDXL_Realistic.safetensors',
        size: '6.94GB',
        vram: '8GB',
        sha256: 'd234c60d67cedfe69433e3934a459707c2cf43b30232d3db2becd10371d2220f'
    },
    'ill-anime': {
        id: 'ill-anime',
        name: 'ILL Anime',
        type: 'checkpoint',
        origin: 'animemix_v80',
        filename: 'checkpoints/ILL/ILL_Anime.safetensors',
        url: 'https://huggingface.co/MadPonyInteractive/CubricModels/resolve/main/ILL_Anime.safetensors',
        size: '6.8GB',
        vram: '8GB',
        sha256: '357f63d2784cf0da28f44f14babaca854ccd8fe2581f196df1fc39cbfa053ac8'
    },
    'ill-anime-beauty': {
        id: 'ill-anime-beauty',
        name: 'ILL Anime Beauty',
        type: 'checkpoint',
        origin: 'ramthrustsNSFWPINK_alchemyMix176',
        filename: 'checkpoints/ILL/ILL_Anime_Beauty.safetensors',
        url: 'https://huggingface.co/MadPonyInteractive/CubricModels/resolve/main/ILL_Anime_Beauty.safetensors',
        size: '6.8GB',
        vram: '8GB',
        sha256: '097cd879e878485c0bff4c82435ec9a06c65294fc8776b31873aacad8ddf21aa'
    },
    'pony-mix': {
        id: 'pony-mix',
        name: 'PONY Mix',
        type: 'checkpoint',
        origin: 'animergemeij_v30VAE',
        filename: 'checkpoints/PONY/PONY_Mix.safetensors',
        url: 'https://huggingface.co/MadPonyInteractive/CubricModels/resolve/main/PONY_Mix.safetensors',
        size: '6.8GB',
        vram: '8GB',
        sha256: '8d3ee679f82bcf7918ae7011d123b38ac718afd33a17e246e9b68b717255c3a9'
    },
    // Video Models
    'wan-22-t2v-high': {
        id: 'wan-22-t2v-high',
        name: 'Wan 2.2 t2v',
        type: 'checkpoint',
        origin: 'smoothMixWan2214BI2V_t2vHighV30',
        filename: 'diffusion_models/Wan_22_t2v_High.safetensors',
        url: 'https://huggingface.co/MadPonyInteractive/CubricModels/resolve/main/Wan_22_i2v_High.safetensors',
        size: '21GB',
        vram: '12GB',
        sha256: '1f40184ebd858b179d71fdcfa9c1ebc5cb79fa7ae90474c5ba44ce8abe5e9bc3'
    },
    'wan-22-t2v-low': {
        id: 'wan-22-t2v-low',
        name: 'Wan 2.2 t2v',
        type: 'checkpoint',
        origin: 'smoothMixWan2214BI2V_t2vLowV30',
        filename: 'diffusion_models/Wan_22_t2v_Low.safetensors',
        url: 'https://huggingface.co/MadPonyInteractive/CubricModels/resolve/main/Wan_22_i2v_Low.safetensors',
        size: '21GB',
        vram: '12GB',
        sha256: '5de2d526f4349834c36f06972f610997edfcbc896cdc4211362daea6b643b125'
    },
    'wan-22-i2v-high': {
        id: 'wan-22-i2v-high',
        name: 'Wan 2.2 i2v',
        type: 'checkpoint',
        origin: 'smoothMixWan2214BI2V_i2vV20High',
        filename: 'diffusion_models/Wan_22_i2v_High.safetensors',
        url: 'https://huggingface.co/MadPonyInteractive/CubricModels/resolve/main/Wan_22_t2v_High.safetensors',
        size: '15GB',
        vram: '12GB',
        sha256: '8032b4906fb1b4dffa407d5a5f5d663b9e0c403caed5bd3a02705b7577f2c870'
    },
    'wan-22-i2v-low': {
        id: 'wan-22-i2v-low',
        name: 'Wan 2.2 i2v',
        type: 'checkpoint',
        origin: 'smoothMixWan2214BI2V_i2vV20Low',
        filename: 'diffusion_models/Wan_22_i2v_Low.safetensors',
        url: 'https://huggingface.co/MadPonyInteractive/CubricModels/resolve/main/Wan_22_t2v_Low.safetensors',
        size: '15GB',
        vram: '12GB',
        sha256: 'e7bd6fc48159f57476d7a9d98f6fada2fd52c7070f4ba496c10610f5e399e38f'
    },
    // VAE
    'wan_2.1_vae': {
        id: 'wan_2.1_vae',
        name: 'wan_2.1_vae',
        type: 'vae',
        filename: 'vae/wan_2.1_vae.safetensors',
        url: 'https://huggingface.co/Comfy-Org/Wan_2.1_ComfyUI_repackaged/resolve/main/split_files/vae/wan_2.1_vae.safetensors',
        size: '254MB',
        sha256: '2fc39d31359a4b0a64f55876d8ff7fa8d780956ae2cb13463b0223e15148976b'
    },
    // CLIP
    'umt5_xxl_fp8_e4m3fn_scaled': {
        id: 'umt5_xxl_fp8_e4m3fn_scaled',
        name: 'umt5_xxl_fp8_e4m3fn_scaled',
        type: 'text_encoders',
        filename: 'vae/umt5_xxl_fp8_e4m3fn_scaled.safetensors',
        url: 'https://huggingface.co/Comfy-Org/Wan_2.1_ComfyUI_repackaged/resolve/main/split_files/text_encoders/umt5_xxl_fp8_e4m3fn_scaled.safetensors',
        size: '6.27GB',
        sha256: 'c3355d30191f1f066b26d93fba017ae9809dce6c627dda5f6a66eaa651204f68'
    },
    // Upscale Models
    '4x-NMKD-Siax': {
        id: '4x-NMKD-Siax',
        name: '4x NMKD-Siax 200k',
        type: 'upscale_model',
        filename: 'upscale_models/4x_NMKD-Siax_200k.pth',
        url: 'https://huggingface.co/uwg/upscaler/resolve/main/ESRGAN/4x_NMKD-Siax_200k.pth',
        size: '67MB',
        sha256: '560424d9f68625713fc47e9e7289a98aabe1d744e1cd6a9ae5a35e9957fd127e'
    },
    '4x-AnimeSharp': {
        id: '4x-AnimeSharp',
        name: '4x-AnimeSharp',
        type: 'upscale_model',
        filename: 'upscale_models/4x-AnimeSharp.pth',
        url: 'https://huggingface.co/Kim2091/AnimeSharp/resolve/main/4x-AnimeSharp.pth',
        size: '65MB',
        sha256: 'e7a7de2dafd7331c1992862bbbcd9e9712a9f9f8e6303f0aaa59b4341d359bab'
    },
    // Nodes
    'ComfyUI-MpiNodes': {
        id: 'ComfyUI-MpiNodes',
        name: 'ComfyUI-MpiNodes',
        type: 'custom_nodes',
        filename: 'ComfyUI-MpiNodes',
        url: 'https://github.com/MadPonyInteractive/ComfyUi-MpiNodes/archive/refs/heads/main.zip',
        installRequirements: false,
        size: '1.76MB',
        sha256: '4d1fe25b692db4a446d4efe80ff9d3c0f94248619ff6668026098414f8f21f1f',
    },
    'ComfyUI-PainterI2Vadvanced': {
        id: 'ComfyUI-PainterI2Vadvanced',
        name: 'ComfyUI-PainterI2Vadvanced',
        type: 'custom_nodes',
        filename: 'ComfyUI-PainterI2Vadvanced',
        url: 'https://github.com/princepainter/ComfyUI-PainterI2Vadvanced/archive/refs/heads/main.zip',
        installRequirements: false,
        size: '144KB',
        sha256: '6bbd78b55c2c83b79e51e43b400df2221ad69df2e9c7d8e739aec419595af031',
    },
    'ComfyUI-VideoHelperSuite': {
        id: 'ComfyUI-VideoHelperSuite',
        name: 'ComfyUI-VideoHelperSuite',
        type: 'custom_nodes',
        filename: 'comfyui-videohelpersuite',
        url: 'https://github.com/Kosinkadink/ComfyUI-VideoHelperSuite/archive/refs/heads/main.zip',
        installRequirements: false,
        size: '806KB',
        sha256: 'ca6e1b414dbc07373d4d293d07b2c2cfb947223554a28bc6d92d13d0cf6fc88a',
    },
    'ComfyUI-Impact-Pack': {
        id: 'ComfyUI-Impact-Pack',
        name: 'ComfyUI Impact Pack',
        type: 'custom_nodes',
        filename: 'comfyui-impact-pack',
        url: 'https://github.com/ltdrdata/ComfyUI-Impact-Pack/archive/refs/heads/Main.zip',
        installRequirements: true,
        size: '5MB',
        sha256: 'c74bc45c9c656157b051a8200d69b3694edb16b2e6d2b6783c41f1a18244e50c',
    },
    'comfyui-kjnodes': {
        id: 'comfyui-kjnodes',
        name: 'ComfyUI KJNodes',
        type: 'custom_nodes',
        filename: 'comfyui-kjnodes',
        url: 'https://github.com/kijai/ComfyUI-KJNodes/archive/refs/heads/main.zip',
        installRequirements: true,
        size: '28MB',
        sha256: 'b41f9da2732e33f9075bc944bb7f048a81e5408bf6807e98129501a2b23ab458',
    },
    'ComfyUI-UltimateSDUpscale': {
        id: 'ComfyUI-UltimateSDUpscale',
        name: 'ComfyUI Ultimate SD Upscale',
        type: 'custom_nodes',
        filename: 'comfyui_ultimatesdupscale',
        url: 'https://github.com/ssitu/ComfyUI_UltimateSDUpscale/archive/refs/heads/main.zip',
        installRequirements: false,
        size: '940KB',
        sha256: 'fc597d8c67f96a1c0fef990b71716a0cbd88c8f9f2e7af4fdc3cc9e84db48286',
    },
    'ComfyUI-Frame-Interpolation': {
        id: 'ComfyUI-Frame-Interpolation',
        name: 'ComfyUI Impact Subpack',
        type: 'custom_nodes',
        filename: 'comfyui-frame-interpolation',
        url: 'https://github.com/Fannovel16/ComfyUI-Frame-Interpolation/archive/refs/heads/main.zip',
        installRequirements: true,
        installRequirementsCommand: 'python install.py',
        size: '37.4MB',
        sha256: 'de2758d79bee7c50ea8f3c4a25fe0d1320514cf84bcc3e8ceb9875a99ce718e1',
    },
    'ComfyUI-Impact-Subpack': {
        id: 'ComfyUI-Impact-Subpack',
        name: 'ComfyUI Impact Subpack',
        type: 'custom_nodes',
        filename: 'ComfyUI-Impact-Subpack',
        url: 'https://github.com/ltdrdata/ComfyUI-Impact-Subpack/archive/refs/heads/main.zip',
        installRequirements: true,
        size: '172KB',
        sha256: '0a43a609a72e7b2eda02ca49d8dd7fc921f214e4ac32ab028d3cb8470e8a8091',
    },
    'face-yolov8n': {
        id: 'face-yolov8n',
        name: 'face_yolov8n.pt',
        type: 'ultralytics',
        filename: 'ultralytics/bbox/face_yolov8n.pt',
        url: 'https://huggingface.co/Bingsu/adetailer/resolve/main/face_yolov8n.pt',
        size: '5.9MB',
        sha256: '70b640f8f60b1cf0dcc72f30caf3da9495eb2fb6509da48c53374ad6806e6a9c'
    },
    'hand-yolov8n': {
        id: 'hand-yolov8n',
        name: 'hand_yolov8n.pt',
        type: 'ultralytics',
        filename: 'ultralytics/bbox/hand_yolov8n.pt',
        url: 'https://huggingface.co/Bingsu/adetailer/resolve/main/hand_yolov8n.pt',
        size: '5.9MB',
        sha256: '3991202eb69e9ddcb3b9ba80cdeb41e734ffaf844403d6c9f47d515cd88c6f29'
    },
    'person-yolov8n-seg': {
        id: 'person-yolov8n-seg',
        name: 'person_yolov8n-seg.pt',
        type: 'ultralytics',
        filename: 'ultralytics/bbox/person_yolov8n-seg.pt',
        url: 'https://huggingface.co/Bingsu/adetailer/resolve/main/person_yolov8n-seg.pt',
        size: '6.9MB',
        sha256: '38fc8aaae97cb6e70be4ec44770005b26ed473471362afcda62a0037d7ccf432'
    },
    'sam-vit-b': {
        id: 'sam-vit-b',
        name: 'SAM ViT-B',
        type: 'sams',
        filename: 'sams/sam_vit_b_01ec64.pth',
        url: 'https://huggingface.co/datasets/Gourieff/ReActor/resolve/main/models/sams/sam_vit_b_01ec64.pth',
        size: '367MB',
        sha256: 'ec2df62732614e57411cdcf32a23ffdf28910380d03139ee0f4fcbe91eb8c912'
    },
};