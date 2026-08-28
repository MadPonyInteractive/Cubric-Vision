// ── Custom-node Dependencies ──────────────────────────────────────────────────
// Split out of dependencies.js (which re-exports these as part of DEPS).
// Custom-node URLs are VERSION-LOCKED (MPI-117): NOT hardcoded — derived from
// dev_configs/node_lock.json via lockUrl(). To bump a node, edit that lock file,
// NOT this file. The RunPod Pod image consumes the same lock. Custom nodes are
// NOT engineAsset — their bake/volume split is driven by installRequirements.

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

export const nodesDeps = {
    // Nodes -----------------------------------------------------------------
    'ComfyUI-LTXVideo': {
        id: 'ComfyUI-LTXVideo',
        name: 'ComfyUI-LTXVideo',
        type: 'custom_nodes',
        filename: 'ComfyUI-LTXVideo',
        url: lockUrl('ComfyUI-LTXVideo'),
        installRequirements: true,
        // `kornia` 0.8.3 removed `kornia.geometry.transform.pyramid.pad`, so the node
        // import fails (`cannot import name 'pad'`) and LTXVNormalizingSampler et al
        // never register → "Node 'Stage1_Bypass' not found" at gen time. `kornia==0.8.2`
        // is a pin in dev_configs/python_deps.in for exactly this reason (MPI-413 moved
        // it there). See [[project-ltxvideo-kornia-pad]].
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
        // scikit-image, matplotlib, …). Nothing resolves it any more (MPI-413): both engines
        // install the curated dev_configs/python_deps.in set, which pins every one of those.
        size: '5MB',
    },
    'comfyui-kjnodes': {
        id: 'comfyui-kjnodes',
        name: 'ComfyUI KJNodes',
        type: 'custom_nodes',
        filename: 'comfyui-kjnodes',
        url: lockUrl('comfyui-kjnodes'),
        installRequirements: true,
        // Unpinned reqs (pillow, color-matcher, matplotlib, mss, opencv-python-headless)
        // — all pinned in the curated dev_configs/python_deps.in set.
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
        // This entry carried `installRequirementsCommand: 'python install.py'` until
        // MPI-646 deleted it as dead data — since MPI-413 neither engine resolves a
        // pack's requirements, so nothing ever ran it. install.py was also the thing
        // that NAMED requirements-no-cupy.txt; `scripts/compile-node-deps.mjs` names
        // that file itself now (its REQUIREMENTS_FILE map), so the drift check still
        // reads this pack's declared deps.
        //
        // The shared libs it declares — numpy, kornia, scipy, Pillow, opencv-contrib —
        // are pinned in the curated dev_configs/python_deps.in set, opencv as the single
        // contrib+headless build. torch/torchvision/einops/tqdm are engine-managed or
        // baked. cupy is dropped on purpose; python_deps.in carries the measurement.
        size: '37.4MB',
    },
    'ComfyUI-Impact-Subpack': {
        id: 'ComfyUI-Impact-Subpack',
        name: 'ComfyUI Impact Subpack',
        type: 'custom_nodes',
        filename: 'ComfyUI-Impact-Subpack',
        url: lockUrl('ComfyUI-Impact-Subpack'),
        installRequirements: true,
        // Unpinned reqs (matplotlib, ultralytics>=8.3.162, numpy, opencv-python-headless,
        // dill) — all pinned exactly in the curated dev_configs/python_deps.in set,
        // ultralytics included (it floats a minor upstream).
        size: '172KB',
    },
    // RES4LYF (ClownShark sampler family + ReChromaPatcher). Used by Chroma. All
    // custom_nodes are now universal (MPI-222) — installs with the engine and never
    // GC'd with a model; baked into the Pod image because it has pip requirements.
    // requirements.txt: opencv-python, matplotlib, pywavelets, numpy>=1.26.4. Those
    // are UNPINNED, which is what bit MPI-217 (opencv-python 4.13→5.0 major + numpy
    // 2.5.0→2.5.1) back when each pack resolved its own reqs. The curated
    // dev_configs/python_deps.in set pins them now, and only ONE opencv build lands.
    'RES4LYF': {
        id: 'RES4LYF',
        name: 'RES4LYF',
        type: 'custom_nodes',
        filename: 'RES4LYF',
        url: lockUrl('RES4LYF'),
        installRequirements: true,
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
    // Krea2 identity-edit nodes (MPI-282) — Krea2EditModelPatch (in-context source
    // latent as frame=1 RoPE tokens) + Krea2EditGroundedEncode (Qwen3-VL image-grounded
    // instruction). Single __init__.py, imports only torch/einops/comfy — NO
    // requirements.txt ⇒ installRequirements:false (rides the volume, not the Pod bake).
    // Pinned at v1.2.2 (MPI-346) — matches the v1.2 weights we already ship. Adds the
    // pixel-space source path (vae + source_image), fit_mode, ref_boost/ref_boost_mask,
    // and the ComfyUI ref_latents wrapper-arg tolerance that ComfyUI 0.29 will require.
    'comfyui-krea2edit': {
        id: 'comfyui-krea2edit',
        name: 'ComfyUI Krea2 Edit',
        type: 'custom_nodes',
        filename: 'comfyui-krea2edit',
        url: lockUrl('comfyui-krea2edit'),
        installRequirements: false,
        size: '45KB',
    },
    // Inpaint Crop & Stitch (MPI-282) — InpaintCropImproved (✂️ Inpaint Crop) crops the
    // masked region to a fixed working size, InpaintStitchImproved (✂️ Inpaint Stitch)
    // pastes it back. Pure-python (torch/numpy/opencv, all already present) — NO
    // requirements.txt ⇒ installRequirements:false (rides the volume, no Pod rebuild).
    // SOLE CONSUMER = the Head Swap Flow (`flow_head_swap.json`), declared on the Flow's
    // `requiredDeps` in flowsRegistry.js. It used to be listed on the Krea2 cards for
    // their masked-crop edit path; `b3f9a018` removed that path from the Krea2 graphs
    // and the listing outlived it, which is what kept the pack installing for Head Swap
    // (whose own declaration was missing). Both sides fixed — do not re-add it to a
    // model card unless that model's graph actually references the classes.
    'comfyui-inpaint-cropandstitch': {
        id: 'comfyui-inpaint-cropandstitch',
        name: 'ComfyUI Inpaint Crop and Stitch',
        type: 'custom_nodes',
        filename: 'comfyui-inpaint-cropandstitch',
        url: lockUrl('comfyui-inpaint-cropandstitch'),
        installRequirements: false,
        size: '200KB',
    },
    // LanPaint (MPI-598) — `LanPaint_KSampler` + `SetLatentNoiseMask` give Klein REAL
    // mask-conditioned sampling. It replaced the fake-inpaint workaround the Klein graph
    // used to carry (regenerate the whole crop via InpaintCrop → sample → InpaintStitch),
    // which is why the template lost ~78 nodes: duplicated per-branch sampler chains
    // collapsed into one. Proven on Klein 4B DISTILLED — the checkpoint we actually ship —
    // so the README's distillation caveat did not bite.
    // Declared on Klein 4B AND 9B, and expected to spread: any model adopting mask-
    // conditioned inpainting lists it. `comfyui-inpaint-cropandstitch` STAYS — the graph
    // still uses one InpaintCropImproved/StitchImproved pair.
    //
    // GPL-3.0, pinned UPSTREAM at tag v2.1.0, deliberately NOT forked and NOT vendored.
    // Vendoring would relicence a first-party repo permanently; a fork earns its keep only
    // when we need to change the code. The bench copy was verified identical to this exact
    // commit (git blob SHA-1 on pyproject.toml + __init__.py) before pinning, so the pin is
    // the thing that was proven, not a near-neighbour.
    //
    // SIZE IS THE WHOLE REPO, and it is nearly all `examples/` (177MB of media against
    // ~200KB of actual code). LanPaint IS on the Comfy registry as scraed/LanPaint 2.1.0,
    // whose MANIFEST.in excludes `examples/` — but `source: 'registry'` is UNREACHABLE in
    // this app today: _runCustomNodeInstall scans for a GitHub-shaped `<name>-<branch>/`
    // folder and `continue`s on any directory with no dash, so a flat registry node.zip
    // fails as "extracted folder not found". Fixing that is its own card, not this one.
    'LanPaint': {
        id: 'LanPaint',
        name: 'LanPaint',
        type: 'custom_nodes',
        filename: 'LanPaint',
        url: lockUrl('LanPaint'),
        installRequirements: false,
        size: '186MB',
    },
    // Preprocessors (DepthAnythingV2Preprocessor via AIO_Preprocessor) for the Krea2
    // depth ControlNet (MPI-242). HAS a requirements.txt ⇒ installRequirements:true
    // ⇒ BAKED into the Pod image (needs POD_IMAGE_VERSION bump + rebuild).
    //
    // Its requirements.txt lists bare `torch` + `torchvision` (no version constraint),
    // which WAS a live hazard: the default installer ran `pip install -r
    // requirements.txt --upgrade`, and `--upgrade` on an unconstrained name resolves
    // from PyPI, which ships no `+cu130` wheels — and losing +cu130 destroys the ~10x
    // cold fault-in fix (MPI-187). Empirically verified at the time:
    //   pip install --dry-run --upgrade torch      → "Would install torch-2.13.0"  ✗
    //   pip install --dry-run -r requirements.txt  → "torch ... (2.12.0+cu130)" satisfied ✓
    //
    // This entry carried an `installRequirementsCommand` override to dodge that flag.
    // MPI-413 then removed the per-node requirements step from BOTH engines, so nothing
    // resolves this file at all any more, and MPI-646 deleted the override as dead
    // data. The Dockerfile still re-pins the cu130 trio after ComfyUI's own unpinned
    // `torch`, which is where the hazard actually lives now.
    //
    // Its unpinned shared libs are pinned in the curated dev_configs/python_deps.in
    // set, mediapipe/fvcore/omegaconf/onnxruntime-gpu included.
    'comfyui_controlnet_aux': {
        id: 'comfyui_controlnet_aux',
        name: 'ComfyUI ControlNet Aux (preprocessors)',
        type: 'custom_nodes',
        filename: 'comfyui_controlnet_aux',
        url: lockUrl('comfyui_controlnet_aux'),
        installRequirements: true,
        size: '42.7MB',
    },
    // Chatterbox TTS + voice conversion (MPI-607). VENDORS its own `local_chatterbox`
    // copy of Resemble's chatterbox package, so there is NO `chatterbox-tts` PyPI dep —
    // only the leaf libraries in its requirements.txt. HAS a requirements.txt ⇒
    // installRequirements:true ⇒ BAKED into the Pod image.
    //
    // ⚠ TWO traps this entry does NOT solve on its own — both are handled elsewhere and
    // both fail SILENTLY if you drop them:
    //
    // 1. WEIGHTS IGNORE extra_model_paths.yaml. `get_chatterbox_models_dir()` computes
    //    `<ComfyUI>/models/chatterbox/` from `__file__` and never touches folder_paths,
    //    exactly like RIFE/VFI (MPI-222). Its loaders then hf_hub_download anything
    //    missing — an untracked fetch outside the download manager. The five `chatterbox-*`
    //    deps in assetDeps.js pin the files there via `targetPath`, which makes the pack's
    //    own `if not local_path.exists()` skip the download. Move those weights into
    //    mpi_models and the pack silently re-downloads 4.25GB from HuggingFace.
    //
    // 2. PERTH WATERMARKING IS OPT-IN AND FAILS SILENTLY. requirements.txt has
    //    `resemble-perth` COMMENTED OUT, and tts.py/vc.py/mtl_tts.py each wrap
    //    `import perth` in try/except → `PERTH_AVAILABLE = False`, one warning line to
    //    stdout, and every generation ships UNMARKED. EU AI Act Art. 50 has been in force
    //    since 2026-08-02 and Vision is the provider, so `resemble-perth` is a REQUIRED
    //    entry in dev_configs/python_deps.in, not an optional one.
    'ComfyUI_Fill-ChatterBox': {
        id: 'ComfyUI_Fill-ChatterBox',
        name: 'ComfyUI Fill-ChatterBox (TTS + voice conversion)',
        type: 'custom_nodes',
        filename: 'ComfyUI_Fill-ChatterBox',
        url: lockUrl('ComfyUI_Fill-ChatterBox'),
        installRequirements: true,
        // Its unpinned shared libs (numpy, transformers, diffusers, safetensors) all come
        // from the curated dev_configs/python_deps.in set, like every other baked node.
        size: '2.6MB',
    },

    // MPI-607. A FORK, and the pin is ours: MadPonyInteractive/ComfyUI-MelodramaBox.
    // The registry release (comfyui-melodramabox 2.1.0) names
    // github.com/doggeddalle/ComfyUI-MelodramaBox as its source and that URL 404s, so
    // there is no upstream to send a patch to and no commit for lockUrl() to pin. The
    // fork carries three fixes the published zip does not have, each marked MPI-607 in
    // place and described in the repo's NOTICE: the shared text-encoder root is honoured
    // (otherwise ~8GB of Gemma-3 is re-downloaded over a copy already on disk), the
    // documented .gguf DiT path is actually selectable, and the unload node stops being
    // served from cache - it exists only for its side effect, so a cached run silently
    // did nothing and surfaced as an OOM further down the graph.
    //
    // NEITHER path resolves this pack's requirements.txt (MPI-413) - its four uncovered
    // lines (accelerate, sentencepiece, gguf-connector, bitsandbytes) are declared in
    // dev_configs/python_deps.in instead, which is the one set both engines install.
    // torchaudio is deliberately absent from it: the torch family is engine-owned and
    // never ours to move, on either path.
    'ComfyUI-MelodramaBox': {
        id: 'ComfyUI-MelodramaBox',
        name: 'ComfyUI MelodramaBox (DramaBox TTS)',
        type: 'custom_nodes',
        filename: 'ComfyUI-MelodramaBox',
        url: lockUrl('ComfyUI-MelodramaBox'),
        installRequirements: true,
        size: '0.3MB',
    },
};
