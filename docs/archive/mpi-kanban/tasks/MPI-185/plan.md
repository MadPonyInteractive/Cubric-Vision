# MPI-185 Plan — LTX-2.3 i2v OOM on 24GB Pod (GGUF BF16 dequant spike)

Branch: RunPod · Found: 2026-07-03, live v0.27 verify (v0.11.0-cu124, RunPod 24GB 4090).

## Root cause (PINNED — not a repro hunt)

Pod-side traceback (RunPod console):
```
torch.OutOfMemoryError: device limit 23.64 GiB, allocated 22.53 GiB, requested +576 MiB, CUDA free 22.81 MiB
File .../custom_nodes/ComfyUI-GGUF/dequant.py, line 62, in dequantize_blocks_BF16
  return (blocks.view(torch.int16).to(torch.int32) << 16).view(torch.float32)
```
- Pod LTX always runs the **Q8_0 GGUF** transformer (hard engine rule, `dependencies.js:305` `ltx23-transformer-gguf` + `models.js:310` `engines.remote.workflowSuffix:'_gguf'`). NOT VRAM-gated — every Pod card (24GB or 32GB) gets GGUF.
- The Q8 transformer partial-loads under `--lowvram` to ~22GB (`loaded partially; 21758 MB usable, 21736.71 MB loaded`). At sample time `dequantize_blocks_BF16` upcasts a block int16→int32→float32 = a transient wider-dtype materialization (+576MB) → tips a 24GB card sitting at 22.53/23.64 GiB → OOM → "unloading all loaded models".
- **Mechanism ≠ the aimdo cold-fault tax** documented in `pod-perf-investigation.md` (that's the OLD 40GB bf16 path). This is a NEW failure mode: GGUF dequant has no headroom on 24GB.

## NOT a v0.27 regression

Wan 5B + PiD gen'd clean on the SAME v0.27 Pod → the core bump is sound. The GGUF path is untouched by the v0.26→v0.27 bump. The 24GB 4090 already ships `--lowvram` (MPI-144) from a PRIOR LTX OOM → 24GB is the known-marginal edge, and the dequant spike is a new tip-over on top of an already-tight config.

## The decisive test (32GB decides it)

Research target for the GGUF path = **5090 (32GB)** (`quant-and-coldstart-investigation.md §2`). A 32GB card leaves ~7GB+ over the ~22GB partial-load → the +576MB dequant spike fits with room. **Test:** run LTX-2.3 i2v on a 32GB 5090 Pod (Blackwell → **cu128** image, `podImageForCard`). Two birds: also first gen-verify of the v0.11.0-**cu128** image (was verify-PASS, not gen-verified).
- Clean → confirms the OOM is 24GB-headroom-inherent, not v0.27. **Unblocks MPI-148 → done.** MPI-185 stays open as 24GB-tier hardening.
- OOM on 32GB too → escalate to option (d) below; MPI-148 stays blocked.

## Ranked fixes for the 24GB tier (only if 24GB must be supported)

All are start.sh `VRAM_MODE`/`CUBRIC_VRAM_MODE` edits (R2 push + restart-comfy, NO rebuild) unless noted. Live Pod ops are USER-only.

1. **`--reserve-vram N` / `--vram-headroom N`** — reserve dequant headroom so the partial-load leaves room for the +576MB spike. Cheapest 24GB lever. Get full `--help` text for defaults first (`main.py --help | grep -iE 'reserve-vram|vram-headroom'`). Risk: reserving too much shrinks the transformer's usable VRAM → more offload → slower or a different OOM.
2. **Res/tier ceiling** — log the exact i2v tier + resolution (`i2v_ms` = medium-smooth?). Retry a lower tier/res to find the 24GB ceiling. Fewer latent tokens = smaller working set at dequant. May just document "24GB caps at tier X".
3. **Smaller quant on the 24GB tier** — Q6_K (17.8GB Unsloth) or UD-Q5_K_M (18.2GB) leaves more headroom. Cost: quality drop (Q8 was picked as near-lossless; Q6/Q5 unproven on LTX faces) + a per-tier workflow/dep split (engine rule is currently single GGUF file). Bigger change.
4. **Non-GGUF BF16 transformer on 24GB** — skips dequant entirely but re-enters the 40GB aimdo cold-fault tax (the whole reason GGUF was chosen). Regressive; last resort.

Do NOT chase: disabling aimdo (OOM'd twice, `pod-perf-investigation.md`), bigger VRAM to "fit resident" (disproven 96GB), torch bump (2.8→2.11 no fault-in change).

## Sub-issues (split off if they diverge — lower severity)

- **(2) TAESD preview = None on Pod:** `could not find models/vae_approx/None` — preview VAE resolves to literal 'None'. Cross-ref `project_ltx_preview_cannot_use_taesd` (LTX packed latent can't use taesd). Confirm Pod `--preview-method`/vae_approx wiring. Noisy, cosmetic.
- **(3) Perf: cloud 4090 slow** — datapoint folded into `pod-perf-investigation.md` (this session). Mostly boot+40GB-load, not gen.
- **(4) App gallery blob 404 flood** — `blob:http://127.0.0.1:3000/<uuid>` ERR_FILE_NOT_FOUND rendering gallery (95 assets). Revoke race / blob outliving asset. Separate renderer bug; grep `createObjectURL`/`revokeObjectURL` in gallery/history render path.

## Verify mode

`user-ux` — the decisive test is a live Pod gen only the user can run (Pod ops are user-only). Agent prepares; user live-verifies.
