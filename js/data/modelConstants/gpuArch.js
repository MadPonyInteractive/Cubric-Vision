/**
 * gpuArch.js — Pure GPU-name → architecture-token classifier (MPI-200).
 *
 * The SINGLE source of truth for the `arch` runtime-variant token consumed by the
 * dep/workflow resolver (`resolveModelDeps.js` § variant axis). Browser-safe and
 * dependency-free so BOTH sides use the same logic with no drift:
 *   - server: platformEngine.js classifies the local nvidia-smi name (→ /system/gpu-info)
 *   - client: the RunPod pod's `gpuType` id string (a full GPU name, e.g.
 *             "NVIDIA GeForce RTX 5090") is classified for the remote engine.
 *
 * Tokens:
 *   'blackwell' — RTX 50-series (sm_120) + datacenter B-series. Native mxfp8 path.
 *   'modern'    — RTX 20/30/40-series + Ada/Ampere/Turing datacenter. Weight-only
 *                 fp8 path (also loads mxfp8 but dequants, so it takes fp8_scaled).
 *   'legacy'    — GTX 16xx/10xx and older / pre-Turing datacenter.
 *   null        — no recognizable NVIDIA name → no arch-gated variant.
 */

/**
 * @param {string|null} gpuName  Raw GPU model name (nvidia-smi name or RunPod gpuType id).
 * @param {string|null} [cudaVersion]  Driver CUDA (tiebreaker when the name is unknown).
 * @returns {'blackwell'|'modern'|'legacy'|null}
 */
export function gpuArch(gpuName, cudaVersion = null) {
    const name = (gpuName || '').toLowerCase();
    if (!name) return null;

    // GeForce consumer cards: "rtx 5090", "rtx 4060", "gtx 1080".
    const geforce = name.match(/\b(?:rtx|gtx)\s*(\d{3,4})/);
    if (geforce) {
        const model = parseInt(geforce[1], 10);
        if (model >= 5000 && model < 6000) return 'blackwell';   // RTX 50xx
        if (model >= 2000) return 'modern';                       // RTX 20/30/40xx
        if (model >= 1600) return 'modern';                       // GTX 16xx (Turing, fp8-capable enough)
        return 'legacy';                                          // GTX 10xx and older
    }

    // Datacenter / pro cards. Blackwell B-series (B100/B200/GB200) first.
    if (/\b(b\d{3}|gb\d{3})\b/.test(name) || /\bblackwell\b/.test(name)) return 'blackwell';
    if (/\b(a\d{2,3}|h\d{2,3}|l\d{2,3}|t4|t40|rtx a\d{3,4}|ada|hopper|ampere|turing)\b/.test(name)) return 'modern';
    if (/\b(tesla [pvk]\d|quadro [pmk]\d|kepler|maxwell|pascal)/.test(name)) return 'legacy';

    // Name unrecognized: fall back on driver CUDA. Modern arches ship CUDA 12+.
    if (cudaVersion) {
        const [maj] = String(cudaVersion).split('.').map((n) => parseInt(n, 10));
        if (maj >= 12) return 'modern';
        if (maj < 11) return 'legacy';
    }
    return 'modern'; // safe default (Comfy-Org's own default targets 20-series+)
}
