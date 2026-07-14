// ── Shared Dependencies (facade) ──────────────────────────────────────────────
// Defined once, referenced by id in model dependency lists to avoid repetition.
// This file is now a FACADE — the entries were split by kind into four siblings:
//   modelDeps.js — the picked models (checkpoints + diffusion_models transformers)
//   assetDeps.js — support weights (vae, text_encoders/clip, upscalers, sam, rife…)
//   loraDeps.js  — everything under loras/ (Krea2 styles, LTX baked, Wan turbo, …)
//   nodesDeps.js — custom_nodes entries + lockUrl() + node_lock.json
// DEPS re-merges all four so every existing importer keeps working unchanged.
//
// IMPORTANT (applies wherever you edit the entries themselves):
// 1 - If you need to change a URL, you have to set the SHA256 back to null.
// 2 - Universal engine WEIGHTS (upscalers, detector/SAM models) install with the
//     engine and are never GC'd with a model. Set engineAsset: true for those.
//     (Custom nodes are NOT engineAsset — their bake/volume split is driven by
//     installRequirements; see nodesDeps.js.)
// 3 - Custom-node URLs are VERSION-LOCKED (MPI-117). They are NOT hardcoded —
//     they are derived from dev_configs/node_lock.json via lockUrl(). To bump a
//     node, edit that lock file, NOT nodesDeps.js. The RunPod Pod image consumes
//     the same lock.

import { modelDeps } from './modelDeps.js';
import { assetDeps } from './assetDeps.js';
import { loraDeps } from './loraDeps.js';
import { nodesDeps, lockUrl } from './nodesDeps.js';

export { lockUrl };

export const DEPS = {
    ...modelDeps,
    ...assetDeps,
    ...loraDeps,
    ...nodesDeps,
};
