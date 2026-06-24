# LTX-2.3 Model & LoRA Set

> The weights + LoRAs under evaluation/ship for the LTX-2.3 workflow, plus how they
> load and where they're mirrored. Live download URLs for the Builder Pod are in the
> install script + the parent README's EXTRAS block — this file is the *what & why*.

## Base weights (~68GB, in `install_models_ltx23.sh`)

NerdyRodent FINAL set, post-A/B:
- **Diffusion: full bf16 ONLY** (`ltx-2.3-22b-distilled-1.1_transformer_only_bf16`).
  fp8 dropped ("quality is crap on fp8"); mxfp8 = Blackwell-only → unusable on 3090/4090.
- **Encoder: heretic gemma fp8_scaled** (`anongecko/gemma-3-12b-it-heretic-fp8-comfy`,
  14.5GB) — video+audio. fp4 hurts, full over-influences.
- text projection, video + audio VAEs, spatial **+ temporal** upscalers, IC-LoRA
  union, SDPose, abliterated heretic LoRA, 2× BFS head-swap.
- Needs **16GB+ VRAM + ~32GB+ RAM** (full bf16 via offload).

## Capability LoRAs (all MODEL-ONLY — load via `MpiLoraModel`)

See [lora-strength-law.md](lora-strength-law.md) for the strength conclusions.
Default 0.5, sweep 0.3–0.7.

> **VERDICTS (2026-06-23):** capability LoRAs decided — see
> [lora-strength-law.md](lora-strength-law.md) and [tested-loras-versions.md](tested-loras-versions.md).
> **Ship = base + prompt-contract, NO capability LoRAs.** Table below = status.

| LoRA | Role | File | Size | Status |
|---|---|---|---|---|
| VBVR **I2V** (V4 Sulphur) | reasoning/sequencing for i2v | `LTX2.3_reasoning_Sulphur-2_I2V_V4` | 786MB | ❌ **DROPPED** — base follows prompts; marginal; Sulphur-base mismatch |
| VBVR **T2V** (V1) | reasoning/sequencing for t2v | `LTX2.3_Reasoning_V1` | 658MB | ❌ **DROPPED** — inconsistent across scenes |
| Singularity OmniCine V1 | anatomy + fast-motion + lip-sync, kills subtitles | civitai `3001143` | 2.5GB | ❌ **DROPPED** — degrades audio (no doc fix), ethnicity bias, +size/time |
| Enhancers **Soft** | autofocus/DoF + desaturated polish (Soft only, skip Crisp) | civitai `2849706` | 344MB | ✅ **KEEP — stage-1 LoRA loader, NO merge** @0.5-0.7 (1.0 hallucinates). Ships in a generic `Input_Lora_N` slot. |
| Transition | i2v↔i2v / FL transition, on/off toggle | valiantcat HF | — | ✅ **WORKS on FL** (smooth A→B morph); STAGE-1 only; toggle; short atomic morph primitive; delivery deferred to effect-system. |

- **VBVR is MODE-DEPENDENT** (not a version A/B): dev ships I2V=V4, T2V=V1. Load
  the one matching the op. Dev: VBVR is NOT a motion LoRA — "stacks with motion
  LoRAs" → VBVR + Singularity complement, stack both.
- ❌ Fight LoRA SKIPPED (civitai `2489766`) — fighting still bad; this model is weak
  at fight scenes, don't build fight ops on it.
- ❌ Gore/blood LoRA: NONE EXIST for 2.3 (confirmed gap) — train-own or prompt-via-heretic.
- Bonus to test: OmniNFT-RL LoRA (Kijai mirror) fixes audio/video desync + lip-sync
  — relevant to input-audio work. `huggingface.co/Kijai/LTX2.3_comfy`.

## Local LoRA folder convention

All LTX LoRAs nest under `C:/AI/loras/LTX2.3/` (rgthree "Auto Nest Subdirectories")
→ LoRA-name strings carry the `LTX2.3\` prefix (e.g.
`LTX2.3\LTX2.3_Reasoning_V1.safetensors`). Use prefixed names in template + dep
manifest. ⚠️ The NerdyRodent monolith still points at the old ROOT paths — repath
before reusing it.

## Delivery architecture — DECISION SUPERSEDED (2026-06-24: NO MERGES)

**Final: NO model merges. All kept LoRAs ship as STAGE-1 LoRA loaders** in the 6
generic `Input_Lora_N` (`MpiLoraModelClip`) slots in the LTX template. The reasoning
LoRAs (VBVR/Singularity) were all DROPPED, so the only survivor (Soft) is tiny and
fine as a normal stage-1 loader. Merging bought nothing once: (a) all LoRAs ship
stage-1-only (stage-2 = low-denoise upscaler, LoRA marginal there), and (b) the
template carries generic loader slots. Simpler ship, no merged-model artifact.

- **Heretic gemma** → still stays separate (text encoder, not a diffusion LoRA). Mirror it.

> Historical (2026-06-21, superseded): the original plan was to MERGE always-on
> quality LoRAs (VBVR/Singularity/Soft) into the diffusion weights to kill mirror-risk
> + runtime stacking. Moot now — those LoRAs are dropped or ship as plain loaders.

## ⚠️ Supply-chain / mirroring TODO

`anongecko/gemma-3-12b-it-heretic-ltx` is a small low-following HF repo — author
could delete it and our default encoder vanishes. **MIRROR the heretic encoder +
Singularity to our own repo before shipping as deps.** (anongecko verified this
session as the real heretic source.)

### 🚫 GATED dep — audio IC-LoRA (lipdub) — MUST re-host (2026-06-24)
`ltx-2.3-22b-ic-lora-lipdub-0.9.safetensors` (2.47GB) lives in **gated** HF repo
`Lightricks/LTX-2.3-22b-IC-LoRA-LipDub`. It's the dep for **Solution B** (audio ref-tokens
/ voice+ambient mix — see `audio-input.md`). The app **cannot auto-download a gated repo** for
users (needs per-user license click + a scoped HF token). So if Solution B ships, this LoRA
**must be re-hosted on a source the app can pull without a gate** — our own HF repo or the
Cubric CDN/R2 (`cubric-builds`).
- **Re-hosting IS PERMITTED.** License = **LTX-2 Community License** (`license_link`:
  github.com/Lightricks/LTX-2/blob/main/LICENSE). It allows reproducing + distributing copies /
  derivatives "in any medium," incl. SaaS hosting, **provided we**: (1) propagate the use-based
  restrictions + Attachment A use-policy as an enforceable clause to recipients, (2) ship a copy
  of the agreement + use policy with the file, (3) retain all copyright/attribution notices.
  Revenue threshold for a separate paid commercial license = **$10M/yr** (not a concern). Same
  license already governs the base LTX-2.3 weights we ship → consistent, no new obligation class.
- **Action when Solution B is greenlit for ship:** mirror this file to our HF/R2 alongside the
  license text + attribution, point the app dep URL there. Same playbook as the heretic/Singularity
  mirror above. (Local dev/testing pulls direct from the gated repo with a scoped token — fine.)
- **NOTE:** lipdub is a video-to-video re-dub LoRA — NOT used by Solution B (audio-only voice mix).
  It's the dep for the FUTURE **lipdub v2v op** (spec §0b pending). Re-host applies when that op ships.

### 🚫 THIRD-PARTY dep — ID-LoRA (audio-ref voice identity) — MUST re-host (2026-06-24)
The actual Solution-B model = **ID-LoRA** (`audio_ref_only_ic` strategy = what `LTXVSetAudioRefTokens`
does; no video guide; voice + appearance from text + ref-image + ref-audio). Two ungated AviadDahan repos
(file `lora_weights.safetensors`, ~1.1GB, rank 128):
- `AviadDahan/LTX-2.3-ID-LoRA-TalkVid-3K` (downloaded → `C:/AI/loras/LTX2.3/id-lora-talkvid/`)
- `AviadDahan/LTX-2.3-ID-LoRA-CelebVHQ-3K`
- Project: id-lora.github.io · paper arxiv 2603.10256 · `github.com/ID-LoRA/ID-LoRA`.
- **Re-host required before ship.** These are **third-party** repos (AviadDahan, not Lightricks-official) —
  a less-established author could delete them, same supply-chain risk as the heretic encoder + Singularity.
  **Rule (user, 2026-06-24): re-host anything NOT official / hosted by users not long in the business.**
  Mirror the chosen ID-LoRA to our HF/R2 before shipping it as a dep. Ungated so no license-click gate,
  but provenance risk stands. License: `other` (LTX-2 community-license family — base_model LTX-Video).
