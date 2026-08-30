# MiniMax Music 3 — capability research

Verified 2026-08-30 against the ComfyUI tutorial, the HuggingFace model card, MiniMax's own launch
blog, the MiniMax platform API docs, the SimpleTuner quickstart and the HF adapter listing.
Sources at the bottom. **Read this before searching again — none of it needs redoing.**

## The model

8B "Global LLM" (Qwen3-derived, long-range structure) + 0.6B "Local LLM" (frame-level acoustic
detail) -> 8-layer RVQ (one semantic codebook of 16,384, seven acoustic of 1,024) -> flow-matching
DiT (2.4B) + Flow-VAE + vocoder. Output **32 kHz 16-bit stereo**, up to **~5 minutes**.

Hard limits: 5,000-token prompt cap, 9,000 acoustic frames, CUDA-only, non-streaming.

## Inputs

Two text fields, and the split matters:

1. **Caption** — three labelled blocks:
   - *Global Metadata* — genre, BPM, key, scale, emotional progression, listening scenario,
     production profile
   - *Vocal Details* — gender, timbre, performance style, harmonies, vocal effects
   - *Arrangement* — primary/secondary instruments, groove, bass, percussion, textures, spatial FX
2. **Lyrics** — with section tags. The official set:
   `[Intro] [Verse] [Pre-Chorus] [Chorus] [Post-Chorus] [Bridge] [Instrumental] [Solo] [Outro]`

Prompt-length guidance found in the wild: **80–200 words is the sweet spot**. Below ~80 the model
fills with defaults; past ~200 it starts weighing conflicting signals and drops details. The stock
ComfyUI template caption is well past 200 words — worth measuring against, not copying.

Section tags are described by MiniMax as generative control, **not** a symbolic guarantee. The
model will not honour them strictly.

## What it can and cannot do

| Asked | Answer |
|---|---|
| **Solo instruments** | Yes, as *arrangement*, not as a task. `[Solo]` / `[Instrumental]` tags plus Arrangement prose; the model card claims real playing techniques (slides, legato, glissando). No single-instrument or one-shot mode — a cello line arrives inside a mix. |
| **Sound effects** | **No.** Music only. Nothing in the model card, the launch blog, the ComfyUI docs or the API mentions SFX or foley. Use MMAudio / Stable Audio Open / AudioX for that. |
| **Instrumental / score** | Yes — but the toggle is **hosted-API only** (`is_instrumental`). The local ComfyUI path has no such flag. Locally: empty Lyrics **and** an explicit "instrumental, no vocals" in the caption, or the model sneaks in humming and vocoder pads. |
| **Extend an existing song** | **Not natively, not locally.** No audio input on any core node. The hosted API's nearest thing is a separate `music-cover` model taking `audio_url` + `cover_feature_id` — a cover of a reference, not a continuation. Third-party "extend with Music 3.0" sites do their own stitching. |
| **Stems** | The model cannot. Post-process instead — that is **MPI-663**. |

## Hosted API surface (for reference — Vision runs local)

Models `music-3.0` and `music-cover`. Params: `prompt`, `lyrics`, `is_instrumental`,
`lyrics_optimizer` (generate a song without supplying lyrics), `audio_url`, `cover_feature_id`,
`audio_setting`, `output_format`. Several of these have no local equivalent; `is_instrumental` and
`lyrics_optimizer` are the two worth emulating in the Flow's own logic.

## LoRA

**Trainable today.** SimpleTuner ships a MiniMax Music quickstart: LoRA / LyCORIS / full-rank, on
the DiT *or* the Qwen3 AR LM, with `lora_format: "comfyui"` export. 24 GB minimum, 48 GB+
comfortable, `lora_rank: 64` baseline, `int8-quanto` to fit. LM training needs pre-computed RVQ
codes rather than raw audio, and validation audio is disabled while training the LM.

HuggingFace lists ~22 adapters and ~18 finetunes. Named ones: `terminusresearch/minimax-music3-
lm-lora-fiona-crapple`, `terminusresearch/minimax-music3-training-tournament-round1`,
`terminusresearch/minimax-music3-identity-tournament`, `bghira/minimax-music-suno-reggae-rank128-v2`.

**Assessment: nothing production-grade yet.** These are training-tournament experiments, and
community sentiment is lukewarm. A style-LoRA system for music is a real future option, not a
near-term one.

Do **not** confuse these with `MiniMaxAI/MiniMax-H3-Turbo-Lora` — that is the video model.

## Untested quality leads

1. **The text encoder is still INT8 on the bench.** The user rejected the INT8 *DiT* on quality and
   moved to fp16, but the graph still loads
   `minimax_music3_text_encoder_pruned_int8_convrot.safetensors`. Variants: bf16 **18.5 GB**,
   pruned **16.7 GB**, pruned-int8 **9.2 GB**. Quantising the text encoder degrades prompt
   adherence, which is exactly what a caption-driven Flow depends on. **Likely the largest
   untested knob** — measure before designing around the model's current obedience.
2. **fp32 DiT exists** (9.8 GB, vs the 4.9 GB fp16 in use).

Other file sizes for reference: VAE 217 MB, INT8 DiT 2.5 GB.

## Prior art for the caption problem

`npx skills add MiniMax-AI/MiniMax-Music3 --skill music-caption-rewriter`

MiniMax's own agent skill. Brief -> full 3-block structured caption. Genre router maps cues to one
of **18 style families**; the agent selects up to three references with distinct roles —
Foundation, Modifier, Arrangement — then synthesises an original caption around the brief. Output
as text, JSON or JSONL. This is the direct precedent for approach (b) in `../brief.md`, and the
18-family router is a ready-made answer to "what goes in the style dropdown".

## Sources

- https://docs.comfy.org/tutorials/audio/minimax/minimax-music-3
- https://huggingface.co/MiniMaxAI/MiniMax-Music3
- https://www.minimax.io/blog/minimax-music-3-0-next-generation-open-weights-production-ready-versatile-music-model
- https://platform.minimax.io/docs/guides/music-generation
- https://blog.comfy.org/p/minimax-music-3-state-of-the-art
- https://comfyui-wiki.com/en/news/2026-08-13-minimax-music3
- https://docs.simpletuner.io/quickstart/MINIMAX_MUSIC/
- https://github.com/MiniMax-AI/MiniMax-Music3/blob/main/skills/README.md
