# MPI-518 - H3 w4a8: investigate first

Investigation card. Nothing is decided, including whether we ship these at all.

## The question

Fabio ran one generation on the fl2va w4a8 build and **did not see much speed difference**.
The download is 8.4GB smaller and it fits a 16GB card far better, but if throughput and
quality are both unchanged-or-worse, "smaller download" may not be worth a second entry in
the model library. Measure, then decide where (if anywhere) it lands - the Model Library
quality tier is the likely home.

## Blocked on

1. The 1.4 release - that owns the focus.
2. GPU availability - a Cubric-Prompt agent is using it.
3. Core >= v0.31.0 (PR #15308 `Support asym w4a8_int`, commit `344b4398`). The 1.4 engine
   bump delivers this; check `dev_configs/node_lock.json` before starting.

## The weights (HF API, verified 2026-08-10)

`Kijai/MiniMax-H3-experimental`, at the REPO ROOT - no `diffusion_models/` prefix:

| file | bytes | sha256 |
|---|---|---|
| `minimax_h3_fl2va_pruned_w4a8_mixed.safetensors` | 12540858008 | `01aa7b92c007c599890461c325f9b7e3c96fb06c36f242f95b62f7f20e538dec` |
| `minimax_h3_ref2va_pruned_w4a8_mixed.safetensors` | 11770657048 | `de2c6c29c4ee702b45e48e40daae3834aeee58ab681c732d9152589a87c89910` |

Current shipped DiTs are 20970379616 bytes each. The fl2va w4a8 file is already on disk at
`G:/CubricModels/diffusion_models/`.

## Measuring it without fooling yourself

- **Same seed, same prompt.** H3 is deterministic on a fixed seed, so the noise floor is
  zero and any difference is signal. Two different seeds cannot answer this.
- **Change only the transformer.** Two other things moved on 2026-08-10 - core 0.30.2 ->
  0.31.0 (worth roughly 2x on its own) and the video VAE swap (MPI-517). Neither is the DiT.
- **Record peak VRAM and step time**, not just stills. If the speed really is flat, VRAM
  headroom on a 16GB card is the only remaining argument.

## Already settled - do not re-litigate

If it ships, it goes R2-primary with the publisher as `mirrorUrl`, same as
`vae-minimax-h3-video-int8` (MPI-517) and for the same supply reason. ~24GB of upload at the
mandated 3MB/s cap is over two hours, so start it early. The licence position on Kijai's
re-quants was weighed and accepted by Fabio on 2026-08-10.

Also in that repo, unexamined: `loras/minimax_h3_ref_lora_rank_256_bf16.safetensors`
(2577687536). We already ship a turbo distill; whether these are related is unknown.
