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

## Still open — needs ears, needs Fabio

1. ~~Quality of the SFX and one-shots.~~ **Answered above.**
2. Instrumental music head-to-head against MiniMax (`stable_audio_3_medium`, downloaded, unrun).
3. Vocals — the docs do not mention them, so MiniMax keeps that half unless it surprises us.
4. New, from 1 being this good: does the reprompter add anything over a hand-written prompt?
   `Enable_Reprompt` gates it, so this is one toggle and two runs.

## ⚠️ Licence, before ANY product wiring

Comfy-Org lists the repo as `other`, pointing at Stability's own LICENSE.md. Per
[[project_model_licences_can_be_territory_restricted]] the bar can cover **outputs**, not just
weights. Fine for a bench. Not safe to assume for shipping — read it whole, as the MiniMax
weights licence was (MPI-664 GAP 2).

## Reproduce

Scripts used are throwaway, but the graph is eight nodes and the settings are copied from the
template's own KSampler widgets: `steps 8, cfg 1.0, lcm, simple, denoise 1.0`,
`EmptyLatentAudio(seconds, batch_size 1)`, `CLIPLoader(t5gemma_b_b_ul2.safetensors,
type=stable_audio)`. POST to `:8188/prompt`, poll `/history/<id>`, pull the file from
`/view?filename=…&type=output` rather than hunting the output directory.
