// ── Model Dependencies (transformers / checkpoints) ───────────────────────────
// Split out of dependencies.js (which re-exports these as part of DEPS).
// ONLY the picked generative models: checkpoints + diffusion_models transformers.
// Their support weights (VAE, text_encoders/CLIP, upscalers, detectors, SAM, RIFE)
// live in assetDeps.js; LoRAs in loraDeps.js; custom_nodes in nodesDeps.js.
// IMPORTANT: if you need to change a URL, you have to set the SHA256 back to null.

export const modelDeps = {
    // Image checkpoints
    // MPI-430 — these nine shipped with a bare community-merge FILENAME as their `origin`,
    // which made them invisible to MPI-429's CivitAI sweep (it selected on origin naming
    // CivitAI). Resolved 2026-08-03 and rewritten as `<creator>/<model> (CivitAI <id>)`;
    // the upstream filename stays in the comment because it is what identified them.
    // NONE of the six source models carries a licence badge, so all rest on CivitAI's
    // Service-scoped default grant — the redistribution decision in MPI-430 item 3.
    // Only `wan-22-t2v-*` matched upstream BY HASH; the other seven share the upstream
    // filename and size but not the sha256, so our copies are not byte-identical and the
    // provenance below is by filename + creator, not by hash. Terms per model:
    // docs/models/community-merges-licences.md.
    'sdxl-realistic': {
        id: 'sdxl-realistic',
        name: 'SDXL Realistic',
        // upstream file: Juggernaut_XL
        origin: 'KandooAI/Juggernaut XL (CivitAI 133005)',
        credit: { author: 'KandooAI', work: 'Juggernaut XL', url: 'https://civitai.com/models/133005' },
        filename: 'checkpoints/SDXL_Realistic.safetensors',
        url: 'https://models.cubric.studio/vision/models/checkpoints/SDXL_Realistic.safetensors',
        mirrorUrl: 'https://huggingface.co/Mad-Pony-Interactive/cubric-studio/resolve/main/SDXL_Realistic.safetensors',
        size: '6.62GB',
        sha256: '4bb646ca44e460bfc121fbcd8b7a65ae2b7a85f89c9e9ffe4d078db6e488d5ff'
    },
    'sdxl-nsfw': {
        id: 'sdxl-nsfw',
        name: 'SDXL NSFW',
        // upstream file: lustify_7 — same creator as krea2-raw-transformer-nsfw
        origin: 'coyotte/LUSTIFY! [NSFW checkpoint] (CivitAI 573152)',
        // allowNoCredit is TRUE here, so this block is deliberate, not required — same
        // choice as the Krea 2 weight from the same creator.
        credit: { author: 'coyotte', work: 'LUSTIFY! (SDXL)', url: 'https://civitai.com/models/573152' },
        filename: 'checkpoints/SDXL_NSFW.safetensors',
        url: 'https://models.cubric.studio/vision/models/checkpoints/SDXL_NSFW.safetensors',
        mirrorUrl: 'https://huggingface.co/Mad-Pony-Interactive/cubric-studio/resolve/main/SDXL_NSFW.safetensors',
        size: '6.46GB',
        sha256: '4073cbe470446d0f1806e82d560d14af5b813ec1091b26ad7a69f8162f4a7ac1'
    },
    'ill-anime': {
        id: 'ill-anime',
        name: 'ILL Anime',
        // upstream file: animemix_v80. WITHHOLDS the `Image` flag — see the licence doc.
        origin: 'koronen/animemix (CivitAI 933065)',
        credit: { author: 'koronen', work: 'animemix', url: 'https://civitai.com/models/933065' },
        filename: 'checkpoints/ILL_Anime.safetensors',
        url: 'https://models.cubric.studio/vision/models/checkpoints/ILL_Anime.safetensors',
        mirrorUrl: 'https://huggingface.co/Mad-Pony-Interactive/cubric-studio/resolve/main/ILL_Anime.safetensors',
        size: '6.46GB',
        sha256: 'f548b5b4953c3ba71f9769c98005b95a41a7f8e0b666a509bb938cedf70347fd'
    },
    'ill-anime-beauty': {
        id: 'ill-anime-beauty',
        name: 'ILL Anime Beauty',
        // upstream file: ramthrustsNSFWPINK_alchemyMix176 — that version is no longer
        // listed on the model page (the surviving ones are 3.9GB; ours is 6.46GB).
        origin: "RAMTHRUST/RAMTHRUST'S-NSFW-PINK-ALCHEMY-ANIMA (CivitAI 2578175)",
        credit: { author: 'RAMTHRUST', work: "RAMTHRUST'S-NSFW-PINK", url: 'https://civitai.com/models/2578175' },
        filename: 'checkpoints/ILL_Anime_Beauty.safetensors',
        url: 'https://models.cubric.studio/vision/models/checkpoints/ILL_Anime_Beauty.safetensors',
        mirrorUrl: 'https://huggingface.co/Mad-Pony-Interactive/cubric-studio/resolve/main/ILL_Anime_Beauty.safetensors',
        size: '6.46GB',
        sha256: 'bbebe76d8fcc488b630d6dd74d111bb170b5d5c82a43fca0d99cd8e263766318'
    },
    'pony-mix': {
        id: 'pony-mix',
        name: 'PONY Mix',
        // upstream file: animergemeij_v30VAE. WITHHOLDS the `Image` flag — see the licence doc.
        origin: 'reijlita/ANImergeMEij (CivitAI 734527)',
        credit: { author: 'reijlita', work: 'ANImergeMEij', url: 'https://civitai.com/models/734527' },
        filename: 'checkpoints/PONY_Mix.safetensors',
        url: 'https://models.cubric.studio/vision/models/checkpoints/PONY_Mix.safetensors',
        mirrorUrl: 'https://huggingface.co/Mad-Pony-Interactive/cubric-studio/resolve/main/PONY_Mix.safetensors',
        size: '6.62GB',
        sha256: '455ea6628d79546bb63147758522706f8a6592ade65f847da0aec8968bf29a4b'
    },
    // Video Models
    'wan-22-t2v-high': {
        id: 'wan-22-t2v-high',
        name: 'Wan 2.2 t2v',
        // upstream file: smoothMixWan2214BI2V_t2vHighV30 (T2V High v3.0) — matched upstream BY HASH
        origin: 'DigitalPastel/Smooth Mix Wan 2.2 14B (CivitAI 1995784)',
        credit: { author: 'DigitalPastel', work: 'Smooth Mix Wan 2.2 14B', url: 'https://civitai.com/models/1995784' },
        filename: 'diffusion_models/Wan_22_t2v_High.safetensors',
        url: 'https://models.cubric.studio/vision/models/diffusion_models/Wan_22_t2v_High.safetensors',
        mirrorUrl: 'https://huggingface.co/Mad-Pony-Interactive/cubric-studio/resolve/main/Wan_22_t2v_High.safetensors',
        size: '13.55GB',
        sha256: '8032b4906fb1b4dffa407d5a5f5d663b9e0c403caed5bd3a02705b7577f2c870'
    },
    'wan-22-t2v-low': {
        id: 'wan-22-t2v-low',
        name: 'Wan 2.2 t2v',
        // upstream file: smoothMixWan2214BI2V_t2vLowV30 (T2V Low v3.0) — matched upstream BY HASH
        origin: 'DigitalPastel/Smooth Mix Wan 2.2 14B (CivitAI 1995784)',
        credit: { author: 'DigitalPastel', work: 'Smooth Mix Wan 2.2 14B', url: 'https://civitai.com/models/1995784' },
        filename: 'diffusion_models/Wan_22_t2v_Low.safetensors',
        url: 'https://models.cubric.studio/vision/models/diffusion_models/Wan_22_t2v_Low.safetensors',
        mirrorUrl: 'https://huggingface.co/Mad-Pony-Interactive/cubric-studio/resolve/main/Wan_22_t2v_Low.safetensors',
        size: '13.55GB',
        sha256: 'e7bd6fc48159f57476d7a9d98f6fada2fd52c7070f4ba496c10610f5e399e38f'
    },
    'wan-22-i2v-high': {
        id: 'wan-22-i2v-high',
        name: 'Wan 2.2 i2v',
        // OUR OWN MERGE (user, 2026-08-03) — which is why the sha256 does not match any
        // CivitAI file. The `smoothMixWan2214BI2V_i2vV20High` filename it shipped under is
        // the merge INPUT's name, not this file's provenance (upstream 1f40184e ≠ ours).
        origin: 'Mad Pony Interactive (custom i2v merge)',
        filename: 'diffusion_models/Wan_22_i2v_High.safetensors',
        url: 'https://models.cubric.studio/vision/models/diffusion_models/Wan_22_i2v_High.safetensors',
        mirrorUrl: 'https://huggingface.co/Mad-Pony-Interactive/cubric-studio/resolve/main/Wan_22_i2v_High.safetensors',
        size: '13.32GB',
        sha256: '9620a680d91c88b4d3416f15013b37a1ff7bb96f71480d606c77aa8c6c2748b0'
    },
    'wan-22-i2v-low': {
        id: 'wan-22-i2v-low',
        name: 'Wan 2.2 i2v',
        // OUR OWN MERGE (user, 2026-08-03) — see wan-22-i2v-high. Upstream 5de2d526 ≠ ours.
        origin: 'Mad Pony Interactive (custom i2v merge)',
        filename: 'diffusion_models/Wan_22_i2v_Low.safetensors',
        url: 'https://models.cubric.studio/vision/models/diffusion_models/Wan_22_i2v_Low.safetensors',
        mirrorUrl: 'https://huggingface.co/Mad-Pony-Interactive/cubric-studio/resolve/main/Wan_22_i2v_Low.safetensors',
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
        mirrorUrl: 'https://huggingface.co/Comfy-Org/Wan_2.2_ComfyUI_Repackaged/resolve/main/split_files/diffusion_models/wan2.2_ti2v_5B_fp16.safetensors',
        size: '9.31GB',
        sha256: '456f901338bd9eadbded3828b819109a9b68e8a525ca5cf8d0049a69fcfeca1e'
    },
    // Chroma Flash diffusion (Flux-family image model). MPI-217.
    'chroma1-hd-flash': {
        id: 'chroma1-hd-flash',
        name: 'Chroma1-HD-Flash',
        origin: 'lodestone-rock/Chroma (HD Flash)',
        // Chroma is Apache-2.0, so attribution is not a licence gate — this credit is
        // deliberate (user, 2026-08-03). MpiAbout renders every dep with a credit block.
        credit: { author: 'Lodestone Rock', work: 'Chroma', url: 'https://huggingface.co/lodestones/Chroma' },
        filename: 'diffusion_models/Chroma1-HD-Flash.safetensors',
        url: 'https://models.cubric.studio/vision/models/diffusion_models/Chroma1-HD-Flash.safetensors',
        mirrorUrl: 'https://huggingface.co/lodestones/Chroma1-Flash/resolve/main/Chroma1-HD-Flash.safetensors',
        size: '17GB',
        sha256: '2c0c7d908d04418a48b453c293237a9826d54472cf0ba76e28697d1309d1021b'
    },
    // Chroma Hyper — low-tier sibling of Chroma Flash (int8, Danrisi mix + Hyper/Turbo
    // distill). Same op shape + support stack as Flash; only this diffusion weight differs.
    'chroma1-hd-hyper': {
        id: 'chroma1-hd-hyper',
        name: 'Chroma1-HD-Hyper',
        origin: 'lodestone-rock/Chroma (HD DanrisiMix Hyper-Flash-Turbo int8)',
        // Same deliberate credit as Flash. Danrisi (the mix) already renders via
        // chroma-style-lenovo — one credit block per dep, and the author list is deduped.
        credit: { author: 'Lodestone Rock', work: 'Chroma', url: 'https://huggingface.co/lodestones/Chroma' },
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
        mirrorUrl: 'https://huggingface.co/Comfy-Org/PixelDiT/resolve/main/diffusion_models/pid_flux1_1024_to_4096_4step_bf16.safetensors',
        size: '2.72GB',
        sha256: '17c282ed387edad7bfdd3189c5a17363d73e3d60b5e841dfded81c3b76e211ee'
    },
    'pid-sdxl': {
        id: 'pid-sdxl',
        name: 'PiD SDXL (1024→4096)',
        origin: 'Comfy-Org/PixelDiT',
        filename: 'diffusion_models/pid_sdxl_1024_to_4096_4step_bf16.safetensors',
        url: 'https://models.cubric.studio/vision/models/diffusion_models/pid_sdxl_1024_to_4096_4step_bf16.safetensors',
        mirrorUrl: 'https://huggingface.co/Comfy-Org/PixelDiT/resolve/main/diffusion_models/pid_sdxl_1024_to_4096_4step_bf16.safetensors',
        size: '2.72GB',
        sha256: 'c8dd35d7d548a312f61f298d79c6f6a7731fc71031400533f91dbfb2c8a9cb02'
    },
    'pid-sd3': {
        id: 'pid-sd3',
        name: 'PiD SD3 (1024→4096)',
        origin: 'Comfy-Org/PixelDiT',
        filename: 'diffusion_models/pid_sd3_1024_to_4096_4step_bf16.safetensors',
        url: 'https://models.cubric.studio/vision/models/diffusion_models/pid_sd3_1024_to_4096_4step_bf16.safetensors',
        mirrorUrl: 'https://huggingface.co/Comfy-Org/PixelDiT/resolve/main/diffusion_models/pid_sd3_1024_to_4096_4step_bf16.safetensors',
        size: '2.72GB',
        sha256: 'f544e4b7cd414b0e3cae6c506f8b04560c2118fb9b9fcc39302b81c56377e271'
    },
    'pid-qwenimage': {
        id: 'pid-qwenimage',
        name: 'PiD Qwen-Image (1024→4096)',
        origin: 'Comfy-Org/PixelDiT',
        filename: 'diffusion_models/pid_qwenimage_1024_to_4096_4step_bf16.safetensors',
        url: 'https://models.cubric.studio/vision/models/diffusion_models/pid_qwenimage_1024_to_4096_4step_bf16.safetensors',
        mirrorUrl: 'https://huggingface.co/Comfy-Org/PixelDiT/resolve/main/diffusion_models/pid_qwenimage_1024_to_4096_4step_bf16.safetensors',
        size: '2.72GB',
        sha256: 'efa24eada8c414251410e786de96001b26d09701c3fe799a9f2eb0d7d3b8cf2d'
    },
    // ── Krea2 transformers (MPI-242, collapsed MPI-316) ────────────────────────
    // Flux-lineage in ARCHITECTURE ONLY — the conditioning + VAE stack is Qwen
    // (reuses vae-qwen-image + qwen3vl-abliterated-clip in assetDeps.js; vae-flux-ae is
    // the WRONG dep). We ship the SFW and NSFW RAW transformers as two INDEPENDENT
    // models — a user can install BOTH (unlike LTX's mutually-exclusive arch variants).
    // Each is its own ModelDef; the two share every other dep. Quant variants are native
    // in comfy 0.27 — see docs/models/krea2/int8-quant.md.
    //
    // The two TURBO transformers were DELETED in MPI-316: krea2-lora-accelerator (a
    // turbo-distill SVD delta extracted FROM Raw, ~0.87GB) reconstructs Turbo on top of
    // these Raw weights at strength 1.0, so the fast tier is a runtime toggle instead of
    // a second ~12GB download. That dropped ~24.5GB of shipped weights and collapsed the
    // Krea2 library from 4 cards to 2.
    //
    // Raw (un-distilled) Krea2 also has a WORKING cfg, so it drives the identity-edit
    // LoRA (cfg 1 starves the edit conditioning) — see docs/models/krea2/README.md
    // "Krea2 as an EDITOR". int8_convrot quant (native NVIDIA RTX Turing+).
    'krea2-raw-transformer': {
        id: 'krea2-raw-transformer',
        name: 'Krea2 Raw Transformer (int8_convrot)',
        origin: 'Comfy-Org/Krea-2',
        filename: 'diffusion_models/krea2_raw_int8_convrot.safetensors',
        url: 'https://models.cubric.studio/vision/models/diffusion_models/krea2_raw_int8_convrot.safetensors',
        mirrorUrl: 'https://huggingface.co/Comfy-Org/Krea-2/resolve/main/diffusion_models/krea2_raw_int8_convrot.safetensors',
        size: '13.49GB',
        sha256: '5585a4a38c4bcfb6fde2d480a4aa6edf7f665721ebde56d30662c35a45f5fa5c',
    },
    // NSFW variant — Lustify v10 KREA-Raw, int8_convrot quant.
    // NOT a Comfy-Org weight: it is coyotte's LUSTIFY (CivitAI 573152), resolved by
    // SHA256 2026-08-03 (MPI-429 licence sweep). The old `origin: Comfy-Org/Krea-2`
    // was wrong and hid whose work this is. Flags: Image + RentCivit, no licence
    // badge, allowNoCredit true (attribution not required — we credit anyway).
    'krea2-raw-transformer-nsfw': {
        id: 'krea2-raw-transformer-nsfw',
        name: 'Krea2 Raw Transformer NSFW (int8_convrot)',
        origin: 'coyotte/LUSTIFY (CivitAI 573152)',
        filename: 'diffusion_models/lustify-v10-krea-raw-int8_convrot.safetensors',
        url: 'https://models.cubric.studio/vision/models/diffusion_models/lustify-v10-krea-raw-int8_convrot.safetensors',
        size: '13.15GB',
        sha256: 'f165d4db2a4c9a8ce67f88851216ec41ee64ed508f0755de9d4dcd03175bc865',
        // R2-ONLY until 2026-08-10 (MPI-430). This was re-hosted to our HF repo by the
        // MPI-429 sweep and the user DELETED it there: LUSTIFY V10 is in coyotte's paid
        // early-access window until 2026-08-10, and a public HF copy is a public
        // redistribution of it in a way our own R2 (gated behind the app) is not. Without
        // `noMirror` the generic prefix rewrite hands a blocked user an HF URL that 404s —
        // measured 404 on 2026-08-03, the only one of the 31 re-hosted deps that fails.
        // AFTER 2026-08-10, when coyotte opens the download: re-upload it and DELETE this
        // flag, so the dep gets its second route back.
        noMirror: true,
        credit: {
            author: 'coyotte',
            work: 'LUSTIFY! V10 (Krea 2)',
            url: 'https://civitai.com/models/573152',
        },
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
        mirrorUrl: 'https://huggingface.co/Comfy-Org/Boogu-Image/resolve/main/diffusion_models/boogu_image_edit_bf16.safetensors',
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
        mirrorUrl: 'https://huggingface.co/Comfy-Org/Boogu-Image/resolve/main/diffusion_models/boogu_image_edit_turbo_int8_convrot.safetensors',
        size: '11.37GB',
        sha256: 'c242eca52f1388102e1fd8644945875a09ea3e85f5e944c42114c6a72328e440',
    },
    // ── Qwen-Image-Edit-2511 transformer (MPI-300) ─────────────────────────────
    // Instruction image editor, latest gen (2025-12-22). ONE int8 transformer serves
    // ALL THREE tiers — tiers differ only by which Lightning LoRA the graph's
    // MpiAnySwitch picks (Input_Tier injected at runtime by the qwenTier radio), so
    // this ships as ONE ModelDef (not a per-tier card split like Boogu). fp8mixed +
    // bf16 tested & REJECTED (MPI-300 weight A/B). 20,499,083,824 bytes = 19.10 binary
    // GiB — UNDER the 20GB hot-store gate; size:'19GB' keeps it there (do NOT write a
    // 20/20.5 SI label — it would round over the binary gate).
    'qwen-edit-transformer': {
        id: 'qwen-edit-transformer',
        name: 'Qwen Image Edit 2511 Transformer (int8_convrot)',
        origin: 'Comfy-Org/Qwen-Image-Edit-2511',
        filename: 'diffusion_models/qwen_image_edit_2511_int8_convrot.safetensors',
        url: 'https://models.cubric.studio/vision/models/diffusion_models/qwen_image_edit_2511_int8_convrot.safetensors',
        mirrorUrl: 'https://huggingface.co/Comfy-Org/Qwen-Image-Edit_ComfyUI/resolve/main/split_files/diffusion_models/qwen_image_edit_2511_int8_convrot.safetensors',
        size: '19GB',
        sha256: '11b5af5ac601821d73930c84846c9a158e67177356daf927ce1c8d10f3963829',
    },
    // ── FLUX.2 Klein 4B transformer (MPI-354) ──────────────────────────────────
    // Apache-2.0, 4B. The FASTEST image model we ship. ONE checkpoint, ONE tier: the
    // DISTILLED weight, int8_convrot quantized. There is no accelerator LoRA and no
    // Input_Tier split — that was reversed 2026-07-27 after live step measurement:
    // distilled at cfg 1.0 / 4 steps beats the base+turbo pair it replaced, so the
    // base checkpoint and klein-lora-turbo were both dropped rather than shipped.
    //
    // CONSEQUENCE FOR THE ModelDef: negativePrompt must be FALSE. The negative is
    // bit-identical at cfg 1.0 (max diff 0) and was only ever live at the base's
    // cfg ~5; distilled runs at cfg 1.0 only, so the field must not render.
    //
    // Verified genuine distilled, not a mislabelled base: header metadata records the
    // quant source as flux-2-klein-4b.safetensors via OTUNetLoaderW8A8
    // (outlier_method=convrot), and the dtype split is 80 I8 / 80 U8 / 80 F32 / 69 BF16
    // = the documented distilled 80/69 split (base quantizes 70/79). Native
    // `comfy_quant` markers, so stock UNETLoader loads it with no custom node dep.
    //
    // Support weights: qwen3-4b-clip + vae-flux2 (assetDeps), klein-lora-outpaint +
    // klein-lora-refcontrol-depth + klein-lora-nsfw + 8 klein-style-* (loraDeps).
    // NOTHING was reusable — the FLUX.2 TE/VAE are distinct weights from every
    // Qwen-* and FLUX.1 dep we already host.
    'klein-4b-transformer': {
        id: 'klein-4b-transformer',
        name: 'FLUX.2 Klein 4B Transformer (distilled, int8_convrot)',
        origin: 'wraps/FLUX.2-klein-4B-INT8-ConvRot-ComfyUI (distilled, int8_convrot quant)',
        filename: 'diffusion_models/flux-2-klein-4b-int8-convrot.safetensors',
        url: 'https://models.cubric.studio/vision/models/diffusion_models/flux-2-klein-4b-int8-convrot.safetensors',
        mirrorUrl: 'https://huggingface.co/wraps/FLUX.2-klein-4B-INT8-ConvRot-ComfyUI/resolve/main/flux-2-klein-4b-int8-convrot.safetensors',
        size: '4.07GB',
        sha256: 'ac629fa69e0700ae689bce6b694ac0fc90ba5c24de15bd6c47195ad0c16fe90e',
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
        mirrorUrl: 'https://huggingface.co/Kijai/LTX2.3_comfy/resolve/main/diffusion_models/ltx-2.3-22b-distilled-1.1_transformer_only_bf16.safetensors',
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
        mirrorUrl: 'https://huggingface.co/Kijai/LTX2.3_comfy/resolve/main/diffusion_models/ltx-2.3-22b-distilled-1.1_transformer_only_fp8_scaled.safetensors',
        size: '25.2GB',
        sha256: '0a1d7aac2b338e8ec7e832149f1dcf11c9323272482b1cca0673d229702370f0',
    },
    'ltx23-transformer-mxfp8': {
        id: 'ltx23-transformer-mxfp8',
        name: 'LTX-2.3 22B Distilled Transformer (mxfp8_block32)',
        origin: 'Kijai/LTX2.3_comfy',
        filename: 'diffusion_models/ltx-2.3-22b-distilled-1.1_transformer_only_mxfp8_block32.safetensors',
        url: 'https://models.cubric.studio/vision/models/diffusion_models/ltx-2.3-22b-distilled-1.1_transformer_only_mxfp8_block32.safetensors',
        mirrorUrl: 'https://huggingface.co/Kijai/LTX2.3_comfy/resolve/main/diffusion_models/ltx-2.3-22b-distilled-1.1_transformer_only_mxfp8_block32.safetensors',
        size: '24.1GB',
        sha256: 'b7a945ff24d65ad22c6977787c2e594e74df226e35f1f9dedb64be8fdbd6ffd8',
    },
    // ── MiniMax H3 transformers (MPI-452) ──────────────────────────────────────
    // NOT ON R2, AND THAT IS DELIBERATE — do not "fix" it by re-hosting. The
    // MiniMax H3 Community License Agreement (2026-08-02) grants rights only in the
    // "Applicable Territory" (worldwide EXCLUDING the EU, UK, USA and South Korea) and
    // its trigger covers "reproducing, modifying, distributing". Pointing the dep at
    // Comfy-Org's own repo kills the redistribution claim outright — it is the clearest
    // and most enforceable clause, and the one thing we can remove for free. The user
    // half is MPI-451's licence gate (js/data/modelConstants/licences.js, keyed
    // 'minimax-h3'), which binds each user before the download starts.
    // `_mirrorUrlsFor` only rewrites URLs under the R2 path prefix, so a huggingface.co
    // url yields no mirrors on its own — no `noMirror` flag needed here.
    // Full licence reasoning: .agents/mpi-kanban/tasks/MPI-449/research.md § 0.
    'minimax-h3-fl2va-transformer': {
        id: 'minimax-h3-fl2va-transformer',
        name: 'MiniMax H3 fl2va Transformer (pruned, int8_convrot)',
        origin: 'Comfy-Org/MiniMax-H3 (pruned + int8_convrot quant by Comfy Org)',
        filename: 'diffusion_models/minimax_h3_fl2va_pruned_int8_convrot.safetensors',
        url: 'https://huggingface.co/Comfy-Org/MiniMax-H3/resolve/main/diffusion_models/minimax_h3_fl2va_pruned_int8_convrot.safetensors',
        // PRUNED, not the 34.04GB unpruned sibling. Of the three arguments for unpruned
        // only download size survived measurement: speed died (the sign flips between
        // canvases, both deltas inside run-to-run noise) and resident memory died
        // (ComfyUI streams per layer). The one real difference is TEMPORAL — unpruned is
        // slightly more expressive — and it was only ever seen at 56 frames, so it is not
        // proven to persist on long clips. MPI-449 § 6a.
        size: '20.97GB',
        sha256: 'e889202c41dafb67b10d67b97f0d8541508036a6090af23425a5c2615d03c47a',
        credit: {
            author: 'MiniMax',
            work: 'MiniMax-H3',
            url: 'https://huggingface.co/MiniMaxAI/MiniMax-H3',
        },
    },
};
