# HANDOFF — MPI-353 inpaint/removal evaluation (2026-07-26)

Session ended for a break. User is running full-model Qwen-Edit and will return with results.

## The actual goal

Vision has **no object removal**. Krea2 already outpaints well (user's words), so extending
edges is NOT the gap. The gap is **removing things** — tattoos, watermarks, unwanted objects —
plus mask-driven inpaint. Repo grep for `outpaint` = zero hits; nothing exists yet.

Reference point the user gave: they previously used **Flux.1 Fill + `removal_timestep_alpha-2-1740`
LoRA via Nunchaku** — paint an area, *no prompt*, clean removal. That is the bar. Flux.1 Fill dev
is **non-commercial**, which is why it is out.

## HARD CONSTRAINT — read before touching anything

**DO NOT start MpiNodes work.** The user has instructions for node development they have not
given yet. They said explicitly: *"Do not try the nodes before talking to me."* The colour-fix
node (below) is the obvious next build and it is **blocked pending those instructions**.

## What was proven on the bench (ComfyUI 0.28.0, G:\ComfyUi)

### Path A — Klein 4B, WORKS

All weights downloaded and placed in `G:\CubricModels`, visible to the bench, Apache-2.0:

| File | Size | Location |
|---|---|---|
| `flux-2-klein-4b.safetensors` (distilled) | 7.75 GB | `diffusion_models/` |
| `flux-2-klein-base-4b.safetensors` (base) | 7.75 GB | `diffusion_models/` |
| `qwen_3_4b.safetensors` (text encoder) | 8.04 GB | `text_encoders/` |
| `flux2-vae.safetensors` | 0.34 GB | `vae/` |
| `flux2-klein-4b-outpaint.safetensors` | 0.076 GB | `loras/flux2-klein/` |

Verified working: **object removal**, masked replacement, outpaint, t2i.
The LoRA is the **comfy-converted** file (`diffusion_model.*` prefix, rank 16) — all 68 target
keys bind, zero missing. The plain diffusers file does NOT work in ComfyUI.

**Mechanism:** green-screen. Paint region pure `#00FF00`, prompt
`"Fill the green spaces according to the image."` + what should be there. `EmptyImage(color=65280)`
+ `ImageCompositeMasked`. No custom node pack needed — all builtin.

### Measured findings (do not re-derive)

| Config | Time | Fill detail (lap-var) | Colour drift |
|---|---|---|---|
| **Distilled 8st cfg 1.0** | **20s** | **19.6** | 10.60 |
| Base 28st cfg 4.0 | 92s | 14.6 | 12.10 |
| Base 50st cfg 4.0 | 154s | 16.0 | 11.88 |

- **Base LOSES on every axis.** Slower, less detail, drifts more. It is *over-guided* at cfg 4.0
  (same pathology as `docs/models/krea2/editing.md` § cfg — "more steps made it worse"). 50 steps
  bought +15 lap-var over 28 = noise. **Base is closed. So is the turbo-LoRA idea** — both Klein
  checkpoints are identical size (7,751,105,712 bytes), so extracting `distilled − base` as a LoRA
  would cost MORE disk (7.75 + 0.5) than shipping distilled alone. Not the Krea2 situation.
- **Negative prompt is DEAD at cfg 1.0** — bit-identical output, max diff 0, empty vs loud negative.
  Use `ConditioningZeroOut` on the distilled path. It DOES work on base at cfg 4.0 (60% px changed).
- **LoRA strength barely matters for removal** (0.0/0.6/0.9/1.1/1.4/1.8 all removed cleanly;
  strength 0.0 = no LoRA at all scored BEST detail, 699). Reason: for inpaint the green region is
  fully surrounded by real content, so it is a normal edit task. **But the LoRA is MANDATORY for
  outpaint** — without it, 95% of the extended bands stay pure green (verified).
- **Crop-and-stitch beats flat composite 6x on seams** (gradient 14.56 → 2.44), costs 4s.
  `InpaintCropImproved` → sample → `InpaintStitchImproved`, `mask_blend_pixels=32`, `expand=8`.

### The open blocker — colour drift

Fill is plausible and **texture survives**, but its colour statistics drift from the surrounding
pixels. Measured on the user's tattoo test: **+5.8 R, −3.2 G, −11.4 B**. Invisible on forest floor,
obvious on skin. User independently spotted it ("it changed the colour of the skin").

- **NOT a VAE bug** — pure encode/decode round-trip drifts −0.4 levels (clean). Ruled out.
- **NOT fixable by steps/cfg** — base drifts as much or more. Model-inherent: nothing ties fill
  statistics to surrounding pixels.
- **kjnodes `ColorMatch` makes it WORSE** — 10.60 → 15.09 (mkl/mvgd) → 20.66 (hm). Root cause:
  its reference crop **still contains the object being removed** (tattoo `[148.7,132.0,118.9]` vs
  real skin `[183.6,167.4,156.2]`), so it drags the fill toward the tattoo. Structurally wrong tool
  for removal; no parameter fixes it. **User predicted this from experience — they were right.**
- **Ring-only mean shift FIXES it: 10.60 → 0.93 (11x).** Correct the filled region against the
  surrounding skin ring only, feathered. `mean` beats `mean+std` (0.93 vs 3.46) — rescaling variance
  fights Klein's texture, which is the good part. Prototype: `ring_match.py` (scratchpad), pure numpy.
  **No stock ComfyUI node does this.** → would be an MpiNodes node, BLOCKED per above.

### Path B — Qwen-Edit 2511 + removal LoRA, UNRESOLVED

Three **Apache-2.0** removal LoRAs on the model we already ship (zero new base download):

| LoRA | DL/likes | Interaction |
|---|---|---|
| [prithivMLmods/Qwen-Image-Edit-2511-Object-Remover](https://huggingface.co/prithivMLmods/Qwen-Image-Edit-2511-Object-Remover) | 6235/68 | plain text: `"Remove the necklace and goggles"` |
| [prithivMLmods/QIE-2511-Object-Remover-v2](https://huggingface.co/prithivMLmods/QIE-2511-Object-Remover-v2) | 3555/21 | **red highlight** + `"Remove the red highlighted object from the scene."` |
| [starsfriday/Qwen-Image-Edit-Remover-General-LoRA](https://huggingface.co/starsfriday/Qwen-Image-Edit-Remover-General-LoRA) | 446/17 | text only, no mask |

v2's red-highlight mechanism is **our green-screen plumbing unchanged** — same graph, different
colour constant. None downloaded yet (user said research only).

**User's test:** Qwen 4-step Lightning = 66s cold, **destroyed skin texture** (plastic chest/shoulder).
Full-model run was in flight at session end, user estimate ~380–400s.

**The comparison so far is UNFAIR** — Klein ran 8 steps, Qwen ran 4. The **8-step Lightning LoRA is
ALREADY on disk**: `G:\CubricModels\loras\qwen\Qwen-Image-Edit-2511-Lightning-8steps-V1.0-bf16.safetensors`.
Community reports say 8-step notably beats 4-step on texture. **This is the cheapest next test —
zero download.**

Also found, untested: skin-texture LoRAs ([tlennon-ie/qwen-edit-skin](https://huggingface.co/tlennon-ie/qwen-edit-skin))
explicitly targeting "pores and tonal variation instead of airbrushed plastic". Stacking
removal + skin + lightning is 3 LoRAs deep — composition may break (cf. `project_krea2_edit_style_lora_conflict`).

**Note:** removal LoRAs change *what* gets removed and how precisely. They will **not** fix
Lightning's texture loss. If 8-step is still plastic, no removal LoRA saves Path B.

## Resume here — cheapest first

1. **Qwen 8-step Lightning** on the tattoo image. LoRA already on disk. Directly tests the user's
   texture complaint. Compare against Klein's numbers above.
2. **Read the user's full-model Qwen result** (they are bringing it). Establishes texture ceiling
   and true time cost.
3. Only if 1 or 2 gives acceptable texture: download the removal LoRAs (~100–400 MB) and test.
4. **Ask the user for the MpiNodes instructions** before any node work on the ring-colour fix.

## Scratchpad artifacts (session-scoped, will vanish)

`C:\Users\Fabio\AppData\Local\Temp\claude\c--AI-Mpi-Cubric-Vision\cfa5976d-fb38-481c-9784-adc7b1c784b1\scratchpad\`

- `build_klein.py` — graph builder (t2i / outpaint / inpaint / **inpaint_cropstitch** ← the good one)
- `run.py` — queue an API graph on :8188, wait, report timing + outputs
- `api_to_ui.py` — API → LiteGraph converter (UI-loadable). Round-trip verified **pixel-identical**.
- `ring_match.py` — the colour-fix prototype (numpy, no ComfyUI)

**Saved to the bench (survives):** `G:\ComfyUi\ComfyUI\user\default\workflows\klein_removal_cropstitch.json`
— the verified good graph, loadable in the UI. Layout is mechanical (depth-ordered columns).

If `build_klein.py` is gone, rebuild from this doc: the recipe is green plate + composite +
VAEEncode + ReferenceLatent + Flux2Scheduler/CFGGuider/SamplerCustomAdvanced, wrapped in
InpaintCropImproved/InpaintStitchImproved.

## Decision framing for the user

Klein removal **works today** and is **fast** (20s, texture intact) but costs **+16.2 GB** and needs
the colour-fix node. Qwen costs **zero new download** but so far is slower *and* plastic at 4 steps.
The user's own framing: *"it's always good to have models that do the same thing, because some are
stronger than others in specific things."* Klein's distinctive advantage is speed; Qwen's is that
it is already shipped and purpose-built for editing.
