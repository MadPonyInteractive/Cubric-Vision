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

Caption length: **250–450 English words.** This is MiniMax's OWN figure, from the Output Contract
in their `music-caption-rewriter` skill (verified 2026-08-30 against the source).

> **CORRECTED 2026-08-30.** This section previously said *"80–200 words is the sweet spot"*, sourced
> from third-hand community guidance. It is wrong and it was load-bearing — a caption written to 200
> words is roughly half of what MiniMax specify. Their own 1,000 bundled reference captions all sit in
> the 250–450 band. Do not reinstate the lower figure.

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

## The caption SCHEMA (verified from the skill's own templates, 2026-08-30)

Three top-level headings, this exact order, with the sub-labels the reference captions actually use.
This is an interface fact — conform to it exactly.

| Heading | Sub-labels |
|---|---|
| `Global Metadata` | Basic Attributes · Global Emotional Progression · Application Scenarios & Imagery · Sonics & Production Profile |
| `Vocal Details` | Vocal Gender & Timbre · Vocal Style · Harmony/Backing Vocals · Vocal FX |
| `Arrangement` | Instrument Lifecycle Description (Primary/Secondary Layering) · Groove & Foundation Progression · Embellishments, Textures & Spatial FX |

MiniMax's own rules worth copying verbatim into any recipe we write:

- **Instrumental** — state that the piece is instrumental **and name the instrument or texture
  carrying the lead melodic role**. Naming the lead is what stops the model filling the vocal hole
  with humming or a vocoder pad. Their validation list carries *"an instrumental request remains
  instrumental"* and *"never silently reverse ... an instrumental requirement"*, so they hit the same
  failure.
- **Do not fabricate** an exact BPM, key, vocal gender or production technique when a broader
  description will do.
- Section tags are **local** directives — a tag may change its own section's arrangement without
  replacing the song's global genre.
- Prefer concrete musical changes over decorative prose; a readable energy arc, not an equipment list.

## The 18 style families (MiniMax's own taxonomy)

From `references/genre-router.md`. Each carries positive cues and a disambiguation rule against its
nearest neighbour. **This is the style dropdown.**

`east-asian-modern` · `east-asian-ballad-heritage` · `modern-rnb-neo-soul` · `soul-blues-gospel` ·
`cinematic-pop-ballad` · `cinematic-orchestral-epic` · `electronic-synth-ambient-pop` ·
`jazz-swing-big-band` · `traditional-vocal-stage` · `hip-hop-rap` · `metal-heavy-rock` ·
`pop-alternative-rock` · `contemporary-folk-acoustic` · `roots-traditional-global` ·
`general-pop-ballad` · `dance-pop-disco-funk` · `club-edm-house-trance` · `country-americana`

Beneath them: **645 distinct sub-styles across 1,000 template files** (`alternative-metal-nu-metal`,
`acoustic-folk-mandopop-ballad`, `reggae-roots-reggae`). Too many for a picker — use them as
placeholder examples and let the rewriter route free text.

`general-pop-ballad` is explicitly the **fallback** family, for mood-only briefs.

**Reggae is in-distribution.** `roots-traditional-global` names reggae in its own positive cues and
there is a `templates/reggae-roots-reggae_0001.txt`. So `bghira/minimax-music-suno-reggae-rank128-v2`
is chasing a particular reggae *character*, not filling a capability gap — do not read the existence
of a genre LoRA as evidence the base model lacks that genre.

## LICENCE: take the schema, never the prose

`MiniMax-AI/MiniMax-Music3` has **no `LICENSE` file** and GitHub's licence API returns `None`
(checked 2026-08-30). Default is all rights reserved. **Do not ship MiniMax's template prose inside
Cubric Vision.**

Their own skill says the same thing independently: *"Do not copy sentences, distinctive phrases, or a
template's complete structure. Synthesize a new caption around the user's brief."*

The schema, the 18 family names and the routing rules are interface facts and are fine to conform to.
The 1,000 caption files are not ours to redistribute.

## `TextGenerate` — what it actually takes (source-verified)

Read from `G:\ComfyUi\ComfyUI\comfy_extras\nodes_textgen.py`, 2026-08-30. Correcting a research
claim that arrived via web search:

- It takes **`io.Clip.Input("clip")`** — a CLIP object from `CLIPLoader`, reading `text_encoders/`.
  It does **NOT** take a path under `models/LLM/`; there is no `LLM` entry in `folder_paths.py`. The
  string `"LLM"` appears only as a **search alias** in the node schema.
- Consequence: a candidate rewriter model must be loadable by `CLIPLoader` as one of its declared
  types **and** implement `.generate()`. That is a much narrower door than "any Qwen3", and it rules
  out GGUF and sharded checkpoints. Swapping in a bigger LLM is not a drop-in.
- `CLIPLoader`'s type list includes **`minimax`** — MiniMax Music 3's own encoder loads through the
  same node Vision's rewriter uses (as `krea2`).
- Optional `image` / `video` / `audio` inputs exist, plus a `thinking` boolean.
- **`max_length` defaults to 512** (max 32768). A 250–450 word caption does not fit that. Vision's
  `qwen3vl_4b_prompt_enhancer.json` bakes 512 on its untitled `TextGenerate` node, so raising it for
  music means titling that node `Input_*` first.

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
