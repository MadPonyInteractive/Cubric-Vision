# Stable Audio 3 — bench facts, measured 2026-09-03

Read before planning the Stable Audio card. Everything here was measured or read off the
bench, not sourced from a model card. **Nothing here is a quality judgement** — no one has
listened yet.

## There is nothing to build. The bench already has it.

ComfyUI core supports Stable Audio 3 natively — **no custom nodes**. `G:\ComfyUi\ComfyUI\
blueprints\` ships two ready workflows:

- `Audio Generation (Stable Audio 3 Medium).json` — distilled: 8 steps, cfg 1, `lcm`/`simple`
- `Audio Generation (Stable Audio 3 Medium Base).json` — 50 steps, cfg 7

Both are one subgraph (`8b66c757-…`). All 11 node types verified present on the live bench
via `/object_info`, and `CLIPLoader` carries the `stable_audio` type.

## What the template contains, before anything runs

| Thing | Why it matters |
|---|---|
| **Category selector** — `Music` · `Instrument` · `SFX` · `One-shot` | the capability Vision lacks ENTIRELY. Read out of the graph's `CustomCombo`, not a doc |
| **`duration` FLOAT**, default 150 | MiniMax has no such control at all (MPI-664 § 3) |
| **A built-in reprompter** — `TextGenerate` on Qwen3.5-2B, with Stability's own per-category system prompts embedded in a `JsonExtractString` node | their recipe, directly comparable to ours. Optional: `Enable_Reprompt` boolean gates it |

## Weights — on disk, sha256-verified, 2026-09-03

All from `Comfy-Org` (not gated), URLs baked into the blueprints themselves. **On C:, not G:**
— G: was down to 30 GB. Both dirs are already mapped in the bench's `extra_model_paths.yaml`
under `comfyui_external`, so no config change was needed and no restart was needed either
(ComfyUI rescans on `/object_info`).

| File | Size | Path |
|---|---|---|
| `stable_audio_3_medium.safetensors` | 9.22 GB | `C:/AI/checkpoints/` |
| `stable_audio_3_small_sfx.safetensors` | 2.27 GB | `C:/AI/checkpoints/` |
| `qwen3.5_2b_bf16.safetensors` | 4.55 GB | `C:/AI/text_encoders/` |
| `t5gemma_b_b_ul2.safetensors` | 1.19 GB | `C:/AI/text_encoders/` |

Hashes appended to each directory's existing `SHA256SUMS`. NOT pulled: the two `_base`
variants and `small_music` — 9.22 GB each for a quality ceiling worth chasing only if the
distilled arm gets close.

⚠️ **A truncated download exits 0.** The Qwen file arrived 2.91 GB of 4.55 GB and curl's
non-zero status was swallowed by a `| tail -2` pipe — the sha256 check is the only thing that
caught it. Verify every weight against the `lfs.sha256` the HF API exposes; never trust the
exit code, and never trust it through a pipe.

## 🟢 IT RUNS — smoke, 2026-09-03, Fabio's GPU under the mpi-kanban lease

Minimal SFX arm, reprompter deliberately out of the path (hand-written prompt is the cleaner
control): checkpoint → t5gemma CLIP → two encodes → KSampler(8, cfg 1, lcm/simple) →
`VAEDecodeAudio` → `SaveAudio`. 44.1 kHz stereo FLAC.

## 🔴 THE DURATION PARAMETER IS REAL, AND IT IS EXACT

Measured off the decoded file with `ffprobe`, never trusted from the request:

| asked | got | delta | mean | peak | gen time |
|---|---|---|---|---|---|
| 1.5 s | 1.486 s | −14 ms | −40.6 dB | −7.7 dB | 4.0 s |
| 10.0 s | 10.031 s | +31 ms | −29.6 dB | 0.0 dB | 6.0 s |
| 25.0 s | 25.078 s | +78 ms | −27.8 dB | 0.0 dB | 2.0 s |

**Within ~80 ms across a 16× range.** Set against MPI-664 § 3, where MiniMax's AR decides its
own length, the caption cannot steer it, and the cut-off is a guillotine that only ever
shortens — this is a categorical difference, not a better number.

The 1.5 s case is a **one-shot**: a single dry stick hit, mean −40.6 dB against a −7.7 dB peak,
which is the right shape for one transient in near-silence. Vision cannot produce this today
by any route.

Generation is **2–6 s per clip**, so a head-to-head costs almost nothing in GPU time.

## 🟢 QUESTION 1 IS ANSWERED — Fabio, 2026-09-04, on the first three clips

*"The three clips you showed me sound really good."* Door slam at 10 s, the 1.5 s dry stick
one-shot, rain with two thunder rolls at 25 s — all from `small_sfx`, hand-written prompts,
**no reprompter in the path**, 8 steps, first seed, no iteration.

That closes the highest-priority question this bench existed to ask: **SFX and one-shots are
good enough on the first try**, and they are a capability Vision has no route to today. It also
means the reprompter is an upgrade to evaluate rather than a dependency to make the thing work.

## 🟢 THE EVAL IS DONE — Fabio, 2026-09-05, all four modes in the bench

*"This model is good, and the audio quality is really good as well. I tried everything.
Instrumental, effects, one-shot, and music: it's very good."*

**THE PRODUCT CONCLUSION, his words: *"We can use it for everything else but sung songs."***
Stable Audio 3 takes SFX, one-shots, instruments and instrumental music; MiniMax keeps the one
thing Stable Audio does not claim — **vocals**. That is a split by capability, not a replacement,
and SFX/one-shots are a NEW capability rather than a better version of an existing one.

His timings, 60 s of music on an idle card:

| | |
|---|---|
| warm (models resident, seed changed only) | **7 s** |
| cold (after unloading) | **17 s**, peak **~11 GB** |

**That 11 GB is the co-residency this note predicted, and it confirms it numerically:**
qwen3.5 4.55 + t5gemma 1.19 + audio ~4.6 (fp16) = **10.34 GB of weights**, before activations,
because their subgraph carries NO unload node. ~10 s of the cold run is just loading them.

## 🟢 THE TWO LEVERS ARE MEASURED, 2026-09-05 — and only ONE of them pays

Four arms on the bench, reprompter ON, peak polled off `/system_stats` at 200 ms. Runner:
`../bench/stable_audio_vram.mjs`. Full table and reasoning: **`../../MPI-694/brief.md`**.

1. 🟢 **`MpiClearVram` between `TextGenerate` and the audio stage is the whole win** —
   **12.35 GB → 6.4 GB (−5.9 GB, −48%) for +0.7 s.** Their graph has no unload of any kind;
   ours does (`qwen3vl_4b_prompt_enhancer.json` node 13). `passthrough` is `*`/`forceInput`, so
   it takes the generated string, frees, passes it on. Put it on the `TextGenerate → encoder`
   edge and it stays inside `ComfySwitchNode`'s lazy branch. **Ship it.**
2. 🔴 **`VAEDecodeAudioTiled` does NOT pay, and this reverses what this note predicted.** Once
   the unload is in, chunking saves nothing on peak (6.35 vs 6.19–6.44 GB, inside the noise) and
   costs **+15 s at 60 s, reproduced three times**; at 190 s it is −0.44 GB for +4.2 s. Chunking
   *alone* peaks at **12.16 GB**, which is the proof: **the decode was never what pinned the
   card — the resident 4.55 GB reprompter was.** Stability's 6.49 → 5.14 GB figure is real but
   it is measured against everything else still resident. Keep tiled decode as a long-duration /
   small-card fallback, not the default.

`Enable_Reprompt` is worth knowing about too: their `ComfySwitchNode` declares `on_true`/`on_false`
as `lazy: true`, so with it off `TextGenerate` never runs and the 4.55 GB is never allocated at
all. Every clip judged good so far was made with it OFF.

## 🔴 DO NOT DOWNLOAD `medium_base`. It is not the quality ceiling.

Its own card: *"the base (pre-trained) model intended for fine-tuning"*, and it says to use Medium
instead for generation. Stability's write-up is blunter — the adversarially post-trained model does
*"8 inference steps while producing better outputs than the 50-step base model"*, because
post-training exists to *"reduce the number of inference steps while improving fidelity and prompt
adherence"*. Distillation smoothed the output; the adversarial stage put the sharpness back and
past it.

So Base is worth its 9.22 GB **only if we fine-tune or train a LoRA on it** — never to hear whether
it sounds better. Sources: the two HF cards plus
`artintech.substack.com/p/stable-audio-3-explained-in-5-figures` (Jordi Pons).

## What the weights actually cost

Read off the safetensors header, not a model card: **2,305,495,793 params, 997 tensors, ALL F32**.
So the 9.22 GB file is **~4.6 GB resident at fp16** — the DiT (`model`) is 1.45B and the VAE
(`pretransform`) 0.85B, which is why public write-ups say "1.4B": they count the DiT alone.
`medium_base` is byte-identical, so its weights cost exactly the same. Stability publish ~6.5 GB at
120 s for Medium, which agrees with a bench run measured at +5,149 MiB for 10 s at cfg 7.

## Still open

1. ~~Quality of the SFX and one-shots.~~ **Answered — good, first try, no reprompter.**
2. ~~Instrumental music.~~ **Answered — "very good".** A direct A/B against MiniMax on one brief is
   still worth doing before deciding which engine owns instrumental music.
3. Vocals stay MiniMax's. Not contested.
4. Does the reprompter beat a hand-written prompt? Still untested, and now less urgent.

## 🟢 THE LICENCE GATE IS CLEARED, 2026-09-05 — read whole, and it is a build/ship split

Both agreements read end to end, plus both policies they incorporate by reference. **The full
findings and the five shipping obligations live in `../../MPI-694/brief.md` § GATE 1 — read
that, not a re-derivation.** The three answers this note was waiting on:

- 🟢 **Both weights are in scope.** Stability's Core Models page names **Stable Audio 3.0 Small**
  and **Stable Audio 3.0 Medium** explicitly.
- 🟢 **The bar does NOT reach Outputs**, contrary to what
  [[project_model_licences_can_be_territory_restricted]] warned to check for. Stability §IV(c)(iii)
  and Gemma §3.3 both hand outputs to the user, and there is no territory clause in either.
  The Stability AUP still governs how an output may be *used*.
- 🟢 **Gemma applies, confirmed not assumed** — **T5Gemma is named in the Gemma Appendix**, so
  `t5gemma_b_b_ul2` is squarely inside §3.2.

🔴 **Nothing here blocks the build. Five things block a RELEASE:** register with Stability
(mandatory for commercial use at *any* revenue), one `Notice` file carrying both verbatim
strings, both licence copies bundled, a "Powered by Stability AI" string in the UI, and one
enforceable Gemma §3.2 clause in our own terms. Details in the MPI-694 brief.

## Reproduce

Scripts used are throwaway, but the graph is eight nodes and the settings are copied from the
template's own KSampler widgets: `steps 8, cfg 1.0, lcm, simple, denoise 1.0`,
`EmptyLatentAudio(seconds, batch_size 1)`, `CLIPLoader(t5gemma_b_b_ul2.safetensors,
type=stable_audio)`. POST to `:8188/prompt`, poll `/history/<id>`, pull the file from
`/view?filename=…&type=output` rather than hunting the output directory.
