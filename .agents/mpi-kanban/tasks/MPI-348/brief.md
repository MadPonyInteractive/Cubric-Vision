# MPI-348 — Krea2 swap workflows (face / head / character)

**Working mode:** the user authors in the ComfyUI node graph; the agent supplies semantics,
topology, and measured regimes so nothing is re-derived at the bench. **Workflow proven in the
graph FIRST, App only afterwards** — never debug app plumbing and graph behaviour at once.
Ideas that surface mid-authoring become their own cards rather than growing this one.

Target: **v1.3 = the Apps release.**

> **Agent: read this whole file before assisting.** Everything below is verified against the
> shipped graph, the v1.2.2 node source, or the user's bench measurements. Do not re-derive.

---

## 1. What the v1.2 WEIGHTS give you for free

We have shipped `krea2_identity_edit_v1_2_r128.safetensors` since 2026-07-09. Its changelog
lists as **trained-in capabilities**: head / face swap (and eye / person replacement),
inpainting, outpainting, try-on, better person removal, character reference sheets (both
using one as reference AND creating one), better face likeness on restaged subjects, and
high-resolution adaptation from a 1024 pass.

Head/face/eye/person swap is trained on stablellama's MIT
`change_eye_face_head_person` dataset.

⇒ **Test the no-rig path first.** Prompt + references may already do a head swap with no
mask, no crop, no stitch. It costs one generation to find out and it could delete a whole rig.

## 2. `Krea2EditModelPatch` (node ids `306` two-ref, `408` one-ref)

Pinned at v1.2.2 (`223a9383`, MPI-346). Required: `model`, `source_latent`. Optional:

| input | semantics |
|---|---|
| `source_latent_b` | 2nd reference -> RoPE frame=2. **Training order: scene first, subject second.** |
| `vae` + `source_image` / `source_image_b` | Pixel-space path: crop/resize in PIXELS, VAE-encode internally, cached per target res. **Overrides `source_latent`.** Kills blur from resolution mismatch. NOT WIRED YET. |
| `fit_mode` (`fit` default / `crop (legacy)`) | Ref geometry. **Only bites when BOTH `vae` and `source_image` are connected** — otherwise it prints `WARNING: fit_mode='fit' has NO EFFECT` and takes the latent path. |
| `ref_boost` / `ref_boost_a` | Reference-fidelity dial. Additive attention-logit bias, `math.log(b)`, on target->ref attention. `ref_boost` = LAST ref, `ref_boost_a` = FIRST ref. 1.0 = off. |
| `ref_boost_mask` | Region of the LAST reference to boost. Inert while that ref's boost == 1.0. |

The node prints `[krea2edit] nodes v<version> loaded` at import — use it to confirm the pin.

### `ref_boost` — the two-regime rule (user-measured 2026-07-25)

- **Single reference: `ref_boost` 4 HELPS.** Real character-consistency gain.
- **Two references (two characters): it INVERTS.** Actively destroys consistency.

Why, from `_ref_attn_bias`: `boosts = [ref_boost_a]*(n-1) + [ref_boost]`, so `ref_boost` hits
the last ref only — but the bias **rows are `rows0:`, i.e. EVERY target token**. Character A's
tokens are dragged toward ref 2 exactly as hard as B's. No target-side gating exists, so this
is structural, not a tuning miss. Two-ref wants `ref_boost` near 1.0.

⇒ **Face/head swap should be built single-ref wherever possible.** Multi-character
composition routes to Qwen-Edit (strongest at COMBINING images), not to Krea2 boost.

### `ref_boost_mask` — exact semantics, and what it is NOT

**It is NOT an inpaint mask.** It masks reference *columns*, never target *rows* — it cannot
localize an edit in the output and cannot stop the model reframing or zooming.

What it does: restricts `ref_boost` to a region of the reference, e.g. the face. This is the
appearance half of a face-identity lock. Gotchas:

- **Last ref only** (`i == nsrc - 1`). `ref_boost_a` / the first ref cannot be masked at all.
  ⇒ the face image must be in **slot 2**.
- **Dead unless that ref's boost != 1.0.**
- **Hard threshold `> 0.5`** — no feathering; soft brush edges snap binary.
- **`boost_mask[:1]`** — first mask in the batch only.
- **Resized to the ref's token grid** (`mode="area"`, latent / patch). Sub-token detail is
  gone. Fine for a face, useless for a hairline.

## 3. `Krea2EditGroundedEncode` (node ids `299` positive, `300` negative)

Encodes the instruction TOGETHER with the reference image through Qwen3-VL — the SEMANTIC
path. Appearance comes from the VAE source tokens in the ModelPatch; these are different
channels and pairing them is the point.

- **`system_prompt`** (new in v1.2): overrides the system turn of the chat template. Empty =
  training default (`Describe the image by detailing the color, shape, size, texture,
  quantity, text, spatial relationships of the objects and background:`). Steers what the VLM
  emphasises when reading the reference — e.g. facial structure over scene description.
  **Off-distribution by construction** (the LoRA trained with the default), so A/B it.
- **Set it on BOTH `299` and `300`, or neither.** Training's unconditional used the default
  system turn; diverging pos/neg system turns skews CFG in a way that is not the edit you
  asked for.
- **`grounding_px`: 1024 beats 768** (user-measured on v1.2; v1.1's trained range was 384-768,
  v1.2 added the high-res adaptation pass). **The runtime JSON still bakes 768** — change it in
  the rewiring pass. If you get duplicated or split compositions, this is the first dial to drop.
- Do NOT confuse this with the graph's prompt ENHANCER (`TextGenerate`, its own hand-built chat
  scaffold, `docs/models/krea2/injection.md` § Prompt enhancement). Different node, nasty
  history — it once leaked its own rules into rendered images.

### The face-identity combo

Auto-detect the face, then feed BOTH channels at once: the mask to `ref_boost_mask`
(appearance) and a facial-structure `system_prompt` (semantics). Remember the mask needs
`ref_boost != 1.0` and binds slot 2.

## 4. Graph topology — pose + character + scene ALREADY compose

Model chain in `comfy_workflows/krea2_t2i_<sfw|nsfw>.json`:

```
LoRA rack (139 Input_Lora_6)
  -> 207  MpiIfElse  Input_depth_reference   [true: 203 Krea2ControlApply | false: 139]
  -> 265  LoraLoaderModelOnly  krea2_identity_edit_v1_2_r128
  -> 306 / 408  Krea2EditModelPatch          (407 picks 2-ref vs 1-ref off 403)
  -> 303  MpiIfElse  edit                    [true: 407 | false: 207]  boolean = 285 Input_Is_Edit
```

Depth control is **upstream** of the identity-edit LoRA, not on a rival branch. So
`Input_depth_reference: true` **plus** `Input_Is_Edit: true` = depth-controlled identity edit:
pose via the ControlNet channel, character + scene in the two ref slots. **Three inputs, two
mechanisms, no graph surgery.**

Unreachable from the PromptBox only because `poseReference` and `krea2Edit` are separate
`supportedOps` entries, so the op picker forces a choice. **An App injects params directly and
is not bound by that** — which is exactly why these belong in Apps.

### THE GATE — untested, decides the shape of every 3-input app

That chain stacks **two LoRAs** on one model: depth-control and identity-edit. **Style LoRAs
are already proven NOT to compose with the identity-edit LoRA** — the rack was tried and
reverted for degrading edits, which is why the edit op ships `components: []`. Depth control
is also a LoRA and the pair has never been run.

**Run this before designing anything around it.** If they fight, fall back to two passes
(pose-controlled base, then identity edit on top) — costs a generation, keeps the product.

### Useful node ids

| id | what |
|---|---|
| `285` | `Input_Is_Edit` (MpiSimpleBoolean, bakes FALSE) |
| `207` | `Input_depth_reference` gate -> `203` Krea2ControlApply / `204` control LoRA / `205` control image encode |
| `265` | identity-edit LoRA loader |
| `299` / `300` | GroundedEncode positive / negative |
| `306` / `408` | ModelPatch two-ref / one-ref |
| `370` / `405` | the IMAGE sources feeding GroundedEncode — **these are what `vae` + `source_image` should be wired from** |
| `303` / `407` | edit gate / two-ref-vs-one-ref gate |

## 5. Resolution — multiples of 16, not 8

VAE ÷8 (`qwen_image_vae` spacial_compression) x DiT patchify ÷2 (`patch=2`,
`comfy/ldm/krea2/model.py:183`) = **÷16 in pixels**. Verified against the bench at ComfyUI
0.28.0, same version we ship.

÷8-but-not-÷16 always lands on an ODD latent dimension, and `model.py:239` pads it via
`pad_to_patch_size(x, (2,2))` with the default `padding_mode="circular"` — the pad row/column
is content **wrapped in from the opposite edge**, generated, then cropped back. It runs; one
edge is subtly contaminated. All nine `FLUX_RATIOS` values are ÷16-clean.

The krea2edit node is ÷16 internally too: `_fit_encode_image`'s AR-mismatch branch snaps to
`//16*16` to match the trainer's `_fit_prep` byte-for-byte, because a different ref latent size
means a different centered offset and a visible margin seam. Its own `pad_to_patch_size` calls
pass `padding_mode="replicate"` instead of inheriting circular.

Full detail: `docs/models/krea2/resolution.md`.

## 6. Masking approach — composite vs crop-stitch

Krea2 already shipped a masked-edit path and it was **removed**: `b3f9a018` (2026-07-16),
"masked edits gave inconsistent results". Symptom was a visible mask-shaped tone patch. The
removed config was already feathered (`mask_blend_pixels: 32`,
`context_from_mask_extend_factor: 1.2`, crop resized to 1024²) — **so feathering was never the
missing piece**; the offset is region-wide and feathering only softens the boundary.

Causes, likely order: context starvation (1.2x margin -> the model white-balances to the crop,
not the scene); double lanczos resample (crop -> 1024 -> back); VAE round-trip on the pasted
region only.

| path | use when |
|---|---|
| `ImageCompositeMasked` | source ~1-1.5MP. Full-frame generation, native res, no resample, no zoom, minimal setup. Removes causes 1 and 2. Prior art: `remove_background.json` node `9`. |
| `InpaintCropImproved` -> `InpaintStitchImproved` | 4K/8K source with a small edit region — the only way to keep definition. That is **MPI-347**, a different app. Prior art: `app_head_swap.json` nodes `21` -> `6`. |

If a tone patch survives compositing, round-trip the DESTINATION through `VAEEncode` ->
`VAEDecode` so both sides carry identical VAE error.

Note v1.2 lists inpainting as trained-in, so the model side may be better than when
`b3f9a018` gave up. Re-test rather than inheriting the verdict.

## 7. Model routing (already in `models.js` card descriptions)

- **Krea2** — references described in natural language. Identity, scene placement, pose.
- **Qwen-Edit** — refer to images BY NUMBER. Strongest at COMBINING images; weak on
  single-image instruction edits. Where multi-character composition goes.
- **Boogu Image Edit** — fallback for what Krea2's edit path won't do.

## 8. Candidate workflows for this track

1. **No-rig head/face swap** — prompt + refs, v1.2 trained capability. Cheapest, test first.
2. **Face-identity lock** — `ref_boost` + face `ref_boost_mask` (slot 2) + facial-structure
   `system_prompt` on both encode nodes.
3. **Character swap / restage** — single-ref regime, `ref_boost` ~4.
4. **Character sheet creator** — the keystone. Single-ref, v1.2 trained both directions. User's
   best-performing layout from past tests: one square image with face SIDE profile, face FRONT
   profile, and a FULL BODY view. Should offer options (view/scene count, single-square vs
   separate images) since a sheet also serves users who DO want to train a LoRA.
5. **Pose + character + scene** — blocked on the two-LoRA gate in §4.

## Related

MPI-346 (node bump to v1.2.2, doing) · MPI-347 (high-res localized-edit App) ·
MPI-259 (Apps v2) · MPI-325 (Head Swap box padding) · MPI-332 (rip deprecated test apps)
