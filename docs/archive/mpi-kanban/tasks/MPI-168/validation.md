# MPI-168 Validation

Model tiers (L/B/H) + computed VRAM↔RAM trade table. Validated 2026-07-01.

## Phase A — footprint formula
- `node footprint.js` self-check PASS — reproduces the 4060/LTX anchor (16GB VRAM → raw 44GB RAM).

## Phase B — registry fields
- `sizeTier` + `modelFamily` on ModelDef + 7 entries; live `tradeTable` on real deps verified.

## Phase C — models-page UI
- Live-verified on the real box (user screenshots): 3-button L/B/H filter (text + toggle + highlight),
  per-card tier badge (no disk-size collision), "Disk: NN GB" label, computed hover trade table
  (rows from `footprint.js tradeTable()`), popup vertical flip + horizontal clamp.

## Phase D — prompt-box L/B/H marker
- Node-verified: letter appears only when 2+ installed models share `modelFamily`; lone card = no letter.

## Phase E — end-to-end (local + Pod)
- **Local:** confirmed via screenshots on the RTX 4060 Ti 16GB box.
- **Remote (Pod):** GPU highlight follows the live Pod's VRAM (RTX 5090 → 32GB), suppressed while
  connecting; node-verified 4 states (local / connecting / connected-Pod / unknown-vram).
- **Pod generation PROVEN:** multiple LTX gens completed on a live RTX 5090 Pod using the shipped
  balanced-LTX path (fp4_mixed shared clip + merged LoRA + Q8-GGUF transformer). User confirmed
  "this is done, it works."

## LTX clip pivot (this session's detour, gen-proven)
- Q4 GGUF Gemma clip DROPPED — OOM'd + ComfyUI key errors on the Pod (wrong Gemma lineage; the base
  Google GGUF is not the LTX-tuned variant ComfyUI-LTX expects). Shipped `gemma_3_12B_it_fp4_mixed`
  as a SINGLE SHARED clip (not engine-split; only the transformer splits bf16/GGUF).
- `generate_ltx.py` clip-swap reverted → unet-only; 8 workflows regenerated + audited (single fp4
  clip in all, correct unet per flavour, no dangling refs).
- fp4 uploaded to R2 (9447702218 B, matches local); deps + resolver verified per engine; lint clean.

## Out of scope / follow-up (not blocking)
- RAM-fit sanity check at 60GB (Pod always gave 92GB) — user testing an RTX PRO 4500 proxy separately.
- LTX Low/High tier cards — future separate cards; system + balanced card ship now.
