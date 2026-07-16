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
    // Krea2 identity-edit nodes (MPI-282) — Krea2EditModelPatch (in-context source
    // latent as frame=1 RoPE tokens) + Krea2EditGroundedEncode (Qwen3-VL image-grounded
    // instruction). Single __init__.py, imports only torch/einops/comfy — NO
    // requirements.txt ⇒ installRequirements:false (rides the volume, not the Pod bake).
    'comfyui-krea2edit': {
        id: 'comfyui-krea2edit',
        name: 'ComfyUI Krea2 Edit',
        type: 'custom_nodes',
        filename: 'comfyui-krea2edit',
        url: lockUrl('comfyui-krea2edit'),
        installRequirements: false,
        size: '11KB',
    },
    // Inpaint Crop & Stitch (MPI-282) — InpaintCropImproved (✂️ Inpaint Crop) crops the
    // masked region to a fixed working size, InpaintStitchImproved (✂️ Inpaint Stitch)
    // pastes it back. Drives the Krea2 mask-edit crop path. Pure-python (torch/numpy/
    // opencv, all already present) — NO requirements.txt ⇒ installRequirements:false
    // (rides the volume, no Pod rebuild). Dep of ALL 4 Krea2 cards: the shared t2i graph
    // references both classes, and ComfyUI validates every node class before MpiIfElse
    // picks a branch — so even a plain t2i run needs them.
    'comfyui-inpaint-cropandstitch': {
        id: 'comfyui-inpaint-cropandstitch',
        name: 'ComfyUI Inpaint Crop and Stitch',
        type: 'custom_nodes',
        filename: 'comfyui-inpaint-cropandstitch',
        url: lockUrl('comfyui-inpaint-cropandstitch'),
        installRequirements: false,
        size: '200KB',
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
};
