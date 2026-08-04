# HANDOFF — MPI-354 Klein: base int8 decided, deps written (2026-07-26, session 2)

Supersedes the settings half of `HANDOFF-2026-07-26-klein-model-wiring.md`. That file's
"use the distilled checkpoint at cfg 1.0 / 8 steps" is **no longer the plan** — read this
one first, then that one only for the removal/edit mechanics it still owns.

## The decision (user, after a four-way bench A/B)

**Ship the BASE checkpoint, int8_convrot quantized, + a turbo LoRA for tier 2.**
One transformer, two tiers — the Krea2 raw+accelerator pattern (MPI-316), NOT a
per-tier card split.

Dropped: base bf16 (int8 equals it, 3.5 GB less), distilled bf16, distilled int8
(fast — ~5 s — but base's images are better). Klein is now the **fastest image model
we ship, faster than SDXL**.

Base config: **cfg 5.0, euler, 20 steps, ~35-40 s**. That is also the only config where
a negative prompt is live.

## DONE — code on disk, verified

Deps written with real sha256 (hashed off the local `G:\CubricModels` masters; the
playbook says hashes never wait for the upload). `node` import of `DEPS` resolves all
five; loader filenames match the bench graphs byte-for-byte.

| dep id | file | size | where |
|---|---|---|---|
| `klein-4b-transformer` | `diffusion_models/flux-2-klein-base-4b-int8-convrot.safetensors` | 4.26 GB | modelDeps.js |
| `qwen3-4b-clip` | `text_encoders/qwen_3_4b.safetensors` | 8.04 GB | assetDeps.js |
| `vae-flux2` | `vae/flux2-vae.safetensors` | 336 MB | assetDeps.js |
| `klein-lora-turbo` | `loras/flux2-klein/klein4b_turbo_r128.safetensors` | 786 MB | loraDeps.js |
| `klein-lora-outpaint` | `loras/flux2-klein/flux2-klein-4b-outpaint.safetensors` | 76 MB | loraDeps.js |

Total **13.5 GB** (was 16.2 with the bf16 distilled plan). No file is near the 20 GB
hot-store gate. **Dep reuse: NONE and closed** — Klein's TE is Qwen3-**4B text-only**
(`CLIPLoader type=flux2`); every Qwen encoder we host is a *VL* weight, and `vae-flux-ae`
is FLUX.**1**'s `ae.safetensors`.

Also done:
- `docs/models/klein/README.md` **healed**. It said "use the distilled one" and "base
  checkpoint is closed" — both now reversed, with the old measurements kept and reframed
  (that pass measured the FILL op at cfg 4.0; the reversal came from t2i at cfg 5.0, a
  config it never ran). Both results stand. Do not re-run the old sweep expecting the new answer.
- **9 style card images** converted and placed in `comfy_workflows/display/` —
  `klein-style-{none,muppets,cartoon,jojo,anime,chibi,doodle,vintage,aesthetic}.webp`,
  512x640 WebP, 29-68 KB. Ordered to the graph's Styles Mapping node (0=None … 8=Aesthetic).
  Source PNGs left in place at `G:\CubricModels\loras\flux2-klein\styles\`.
- **MPI-357 created** (todo/planned) — gated-model licence-verified install, so the
  non-commercial weights (Klein 9B, Flux.1 Fill dev, the FLUX.2 ControlNet Union) become
  reachable later. Does not block this card.

## The workflow contract — what the merged graph MUST expose

The user is authoring one merged graph. Injection facts, all verified in code this
session (do not re-derive):

1. **`Input_Tier`, not `Input_is_Turbo`.** Both shipped tier controls inject an **int**
   into a node titled `Input_Tier` — `qwenTier` radio → `{Input_Tier: v}`, `krea2Turbo`
   toggle → `{Input_Tier: on ? 2 : 1}` (`PromptBoxControls.js:1092`). **Nothing injects a
   boolean.** The user's `Input_is_Turbo` would silently keep its baked value. Fix is one
   node: title the injected node `Input_Tier` (MpiInt), derive the boolean with an MpiMath
   `True if a == 2 else False`. **Tier 1 = base (quality, cfg 5), tier 2 = turbo.**
2. **The turbo toggle is free.** The control id is `krea2Turbo` but it is gated on the
   *capability*, not the model (`MpiPromptBox.js:1352`), so `turboToggle: true` gives Klein
   the toggle, persistence and Reuse restore with no new control.
3. **Negative-prompt gating is ALSO free and already correct.** `_refreshNegToggle`
   (`MpiPromptBox.js:1399-1404`) hides the negative field whenever the turbo toggle is on,
   live, keyed off that control's emission. So "negative only when turbo is off" needs
   **no new code** — it falls out of `negativePrompt: true` + `turboToggle: true`. This is
   exactly the Krea2 behaviour (MPI-316 made it runtime-live when 4 cards collapsed to 2).
4. **Prompt enhancer works.** `promptEnhance` requires a TE whose CLIP implements
   `.generate()`; Qwen3-4B qualifies (T5/umT5 models CRASH the TextGenerate node). Node
   titles match case-insensitively at injection, so `Input_enhance_prompt` as authored is fine.
5. Style rack per Krea2: 8 x `MpiLoraModel` + `MpiPromptList` (title `styles`) +
   `Input_Style` (MpiInt) + `MpiMath` gates + `Input_Stylization`.

Resulting ModelDef capabilities:
`negativePrompt: true, styleLoras: true, promptEnhance: true, turboToggle: true`

## Assets on the bench (all downloaded + verified this session)

`G:\CubricModels\diffusion_models\`
- `flux-2-klein-base-4b-int8-convrot.safetensors` — **SHIPS**, sha `0d83fd1d…21163c`
- `flux-2-klein-4b-int8-convrot.safetensors` (distilled int8), `flux-2-klein-4b.safetensors`,
  `flux-2-klein-base-4b.safetensors` — **dropped**, ~19.6 GB, safe to delete on the user's word

`G:\CubricModels\loras\flux2-klein\` — `klein4b_turbo_r128` (ships), `flux2-klein-4b-outpaint`
(ships), `flux2-klein-4b-object-remove`, `flux2_klein_4b_refcontrol_depth`,
`KleinBase4B_ReplaceSubject`, plus NSFW LoRAs. `styles/` holds the 8 style LoRAs.

`G:\ComfyUi\ComfyUI\user\default\workflows\` — `klein_t2i_template` (user, in progress),
`klein_t2i`, `klein_edit_2ref`, `klein_edit_3ref`, `klein_removal_cropstitch`,
`klein_refcontrol_depth_4b` (fetched from the refcontrol repo; repoint its UNETLoader —
it asks for `flux-2-klein-base-4b-fp8`).

Style LoRA -> index mapping — **CONFIRMED against the user's `klein_t2i_template` graph,
all 8 `Input_style_lora_N` slots read directly**, each gated by an `MpiMath`
`b if a == N else 0.0` off `Input_Style`:

| N | style | LoRA file (under `loras/flux2-klein/styles/`) | card image |
|---|---|---|---|
| 0 | No Style | — (all gates zeroed) | `klein-style-none.webp` |
| 1 | Muppets | `flux2-klein-4b-lora-muppetshow-style.safetensors` | `klein-style-muppets.webp` |
| 2 | Cartoon | `flux2-klein-4b-lora-Fluxtoon-Style.safetensors` | `klein-style-cartoon.webp` |
| 3 | Jojo | `flux2-klein-4b-lora-Jojoso-Style_000002000.safetensors` | `klein-style-jojo.webp` |
| 4 | Anime | `Anime_new_mecha_klein4b.safetensors` | `klein-style-anime.webp` |
| 5 | Chibi | `robloxchibidoll_lora_klein4b_000002200.safetensors` | `klein-style-chibi.webp` |
| 6 | Doodle | `klein4b-doodle_v1.safetensors` | `klein-style-doodle.webp` |
| 7 | Vintage | `vintage_photo.safetensors` | `klein-style-vintage.webp` |
| 8 | Aesthetic | `Flux-Klein-4B-Art_10.safetensors` | `klein-style-aesthetic.webp` |

The graph also carries `Input_Positive` / `Input_Negative` (MpiString), an `MpiPromptList`
titled `styles` holding the 8 trigger lines, and an `MpiPromptProcessor` merging them —
the Krea2 rack shape exactly. **Index alignment is the whole contract**: `styleLoraLabels[i]`,
`styleLoraImages[i]`, the `MpiMath` gate `a == i` and the `MpiPromptList` line all have to
agree, and index 0 is the no-style baseline.

## SHIP GATES — do not upload to R2 until cleared

- **Every community LoRA's licence is unverified.** The turbo LoRA carries *no*
  safetensors metadata at all, so neither its licence nor its target checkpoint can be
  read from the file. The 8 style LoRAs are CivitAI weights. Klein 4B being Apache-2.0
  does **not** extend to third-party LoRAs. Batch this check — that is 9 files on the
  same gate, and a non-commercial one is an MPI-357 problem, not a shippable dep.
- R2 upload needs explicit user approval regardless (capability rule).

## NEXT — in order

1. User finishes + saves the merged graph to `comfy_workflows/raw/` (all-lowercase,
   `_template.json` suffix; Krea2's precedent is `krea2_t2i_template.json`).
2. `registry.py` HANDLERS prefix + `generate_klein.py` (model it on `generate_sdxl.py`,
   the simplest; look nodes up by `_meta.title`, NEVER by node id).
3. 8 style LoRA deps + `styleLoraLabels` / `styleLoraImages` arrays (images already exist).
4. `progressStages` — **count bars live, per mode, with the enhancer ON and OFF**
   (`commandExecutor.js:87` reads that param to size the run). Never guess.
5. ModelDef in `models.js` — low tier, capabilities above.
6. **Re-measure VRAM.** The ~13 GB figure that threatened the 8 GB tier was on bf16;
   the shipped weight is 3.5 GB smaller.
7. Licence sweep -> R2 upload (user approval) -> verify per `06-verify.md`.

## Open / not chased

- **Text encoder is now the biggest file** (8.04 GB > the 4.26 GB transformer). Comfy-Org's
  `z_image_turbo` repack hosts `qwen_3_4b_fp8_mixed` (5.63 GB) and `qwen_3_4b_fp4_mixed`
  (3.48 GB); fp4_mixed is a format we already ship (LTX Gemma). Untested — TE quantization
  surfaces as prompt-adherence drift, so A/B on a multi-constraint prompt.
- **Anatomy negatives** for base drafted but NOT measured. Klein's TE is an LLM, so
  CLIP-era keyword soup is out of distribution; use short plain phrases, and prove the
  negative is live (same seed, empty vs filled) before trusting it. Positive-side
  suppression measured better on this model (MPI-353: invented blemishes down 21%).
- `res_2s` sampler reportedly beats euler on anatomy (~2x compute/step). Untested here.
- **Structural control:** only ONE asset exists for Klein 4B — the Apache-2.0 refcontrol
  **depth** LoRA (downloaded). Canny/pose/lineart/normal exist for 9B only; the FLUX.2
  ControlNet-Union is flux-dev non-commercial. Both blocked behind MPI-357.
