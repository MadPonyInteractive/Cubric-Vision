'use strict';
// MPI-244 — guard the BAKED-vs-VOLUME custom_node classification on the remote path.
//
// remoteModels._isImageResident(dep) decides whether a custom_node lives in the Pod
// IMAGE (baked, installRequirements:true → /opt/ComfyUI/custom_nodes, skip volume
// install) or on the /workspace VOLUME (code-only, installRequirements:false → send
// to the wrapper). It parses dependencies.js source and splits it into per-dep
// blocks. Two regressions this locks out:
//
//   1. Block-bleed: if a block runs past its own `},` into the NEXT dep's leading
//      COMMENTS, a comment that merely mentions "installRequirements:true" (e.g.
//      comfyui_controlnet_aux's "⇒ installRequirements:true ⇒ BAKED" doc) falsely
//      flags the PRECEDING code-only node (ComfyUI-Krea2-ControlNet) as baked. The
//      app then skips its volume install → the node is MISSING on the Pod → Krea2
//      fails ComfyUI node validation. (The block must be cut at its own `},`.)
//
//   2. The baked node itself (comfyui_controlnet_aux) MUST classify baked, or the
//      download path sends it to the wrapper for a `requirements_only` re-run, which
//      cd's into a /workspace folder that does not exist on a baked node →
//      "[Errno 2] No such file or directory" → whole install fails.
const assert = require('assert');
const remoteModels = require('../routes/remoteModels');

const node = (filename) => ({ id: filename, filename, type: 'custom_nodes' });

// Baked (installRequirements:true) → image-resident.
assert.strictEqual(remoteModels._isImageResident(node('comfyui_controlnet_aux')), true,
    'comfyui_controlnet_aux has requirements.txt (installRequirements:true) → must be baked/image-resident');
assert.strictEqual(remoteModels._isImageResident(node('ComfyUI-LTXVideo')), true,
    'ComfyUI-LTXVideo is a pip-req baked node → image-resident');
assert.strictEqual(remoteModels._isImageResident(node('RES4LYF')), true,
    'RES4LYF is a pip-req baked node → image-resident');

// Code-only (installRequirements:false) → volume, NOT baked. This is the block-bleed guard.
assert.strictEqual(remoteModels._isImageResident(node('ComfyUI-Krea2-ControlNet')), false,
    'ComfyUI-Krea2-ControlNet is code-only (installRequirements:false) → volume, NOT baked ' +
    '(regression: a comment-bleed from the next dep block wrongly flagged it baked)');
assert.strictEqual(remoteModels._isImageResident(node('ComfyUI-MpiNodes')), false,
    'ComfyUI-MpiNodes is code-only → volume, NOT baked');

// A non-custom_node dep is never image-resident by node rules.
assert.strictEqual(remoteModels._isImageResident({ id: 'x', filename: 'vae/ae.safetensors', type: 'vae' }), false,
    'a weight dep is not an image-resident custom_node');

console.log('image-resident-classification: all assertions passed');
