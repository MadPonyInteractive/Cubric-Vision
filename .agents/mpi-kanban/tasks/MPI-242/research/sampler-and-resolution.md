# Krea2 — samplers, shift, and the resolution question

Research date: 2026-07-09. Companion to `style-loras.md`.

## 1. Where CFG 0.0 / mu 1.15 came from

First-party: [`krea-ai/krea-2`](https://github.com/krea-ai/krea-2) README, Krea's own
reference inference code (NOT ComfyUI):

- **Turbo:** `--steps 8 --cfg 0.0 --mu 1.15` — "Distilled for few-step sampling — run with
  8 steps and CFG disabled"
- **Raw:** `--steps 52 --cfg 3.5` — "use the full sampler with classifier-free guidance"

**No conflict with the Comfy workflow.** Two different harnesses:

| | Krea reference impl | ComfyUI |
|---|---|---|
| CFG disabled | `cfg 0.0` | `cfg 1.0` (skips the negative pass) |
| flow shift | `mu 1.15` | a shift NODE (`ModelSamplingAuraFlow` / `ModelSamplingSD3`) |

`cfg 1` in Comfy IS `cfg 0.0` in Krea's sampler — same thing, different convention. The
`mu` value has **no KSampler slot**; it needs a separate shift node.

**⚠ OPEN — our graph has NO shift node.** Nodes are: UNETLoader, CLIPLoader, VAELoader,
LoraLoaderModelOnly, CLIPTextEncode, ConditioningZeroOut, EmptyLatentImage, KSampler,
VAEDecode. Nothing sets shift. So either (a) Comfy bakes the right shift into the Krea2
model sampling internally, or (b) the official workflow silently runs at default shift and
Krea's `mu 1.15` is left on the table. **Test before assuming.** If (b), adding a shift
node is a cheap quality win.

## 2. Sampler — the community has moved past `euler`

Our workflow (from the official Comfy template): `euler / simple / 8 steps / cfg 1 / denoise 1`.
That is the safe baseline and it works. But convergent community reporting says better exists.

| Source | Turbo recommendation |
|---|---|
| stablediffusiontutorials | `er_sde` / `simple` / 8 steps / cfg 0 |
| Civitai `krea2_simple_v1` (via search snippet) | **stage 1:** `res_2s` / `beta` / 6 steps · **stage 2:** `deis_3m` / `bong_tangent` / 2 steps @ denoise 0.2 |
| same | non-realistic (anime/concept): `euler` / `sgm_uniform` holds up fine |
| same | `euler` / `beta` / 12 steps ≈ as good as res_2s/beta/6, "different results, personal preference" |

`res_2s`, `bong_tangent`, `deis_3m` come from **RES4LYF**
([ClownsharkBatwing/RES4LYF](https://github.com/ClownsharkBatwing/RES4LYF)) — a custom node
pack. `er_sde` is **core ComfyUI** (no custom node).

Key insight: `res_2s` is a 2nd-order sampler — 6 steps of res_2s ≈ 12 euler steps of work.
So "6 steps" is not cheaper than 8 euler steps; it's roughly 1.5× the compute.

### Cost of adopting RES4LYF

RES4LYF = a new `type: 'custom_nodes'` dep, pinned in `dev_configs/node_lock.json`, on BOTH
engines, plus a possible Pod image rebuild if it ships `requirements.txt`
(`installRequirements: true` ⇒ baked). See playbook §4 + `.claude/rules/comfy_engine.md` §2.5c.
**That is a real cost for a first implementation.**

### Recommendation

**Ship v1 on `er_sde` / `simple` (core, zero new deps).** It is the one non-euler sampler
that two sources name for Turbo and it needs no custom node. A/B it against `euler/simple`
live before committing. Defer RES4LYF + the two-stage `res_2s`→`deis_3m` refiner to a
**follow-up card** — that is a multiStage workflow, a different shape, and it drags a
custom-node dep in. Do not conflate it with getting Krea2 shipped.

Also worth knowing: [Auryg/Krea-2-Two-Stage-Sampler](https://github.com/Auryg/Krea-2-Two-Stage-Sampler)
exists — "sigma-locked" two-stage (run RAW for N steps, hand off to Turbo-LoRA at the
correct sigma) + a dual resolution selector. Relevant to the *non-turbo* phase-2 work, not now.

## 3. Resolution — ResolutionSelector vs our FLUX_RATIOS

`ResolutionSelector` is **core ComfyUI** (`comfy_extras/nodes_resolution.py`, v0.25.0). It is
NOT a table. It is a formula:

```python
total_pixels = megapixels * 1024 * 1024
scale  = sqrt(total_pixels / (w_ratio * h_ratio))
width  = round(w_ratio * scale / multiple) * multiple
height = round(h_ratio * scale / multiple) * multiple
```

Our node's widgets: `['3:4 (Portrait Standard)', 1, 8]` → aspect `3:4`, `megapixels=1.0`,
`multiple=8`.

Its 8 fixed aspect ratios: `1:1, 2:3, 3:2, 3:4, 4:3, 9:16, 16:9, 21:9`.

### Computed comparison @ 1.0 MP, multiple=8

| ratio | our FLUX table | ResolutionSelector | verdict |
|---|---|---|---|
| 1:1 | 1024×1024 (1.00MP) | 1024×1024 | **identical** |
| 3:4 | 896×1152 (0.98MP) | 888×1184 | differs (~1%) |
| 4:3 | 1152×896 (0.98MP) | 1184×888 | differs |
| 9:16 | 768×1344 (0.98MP) | 768×1368 | differs |
| 16:9 | 1344×768 (0.98MP) | 1368×768 | differs |
| 4:5 | 896×1088 (0.93MP) | — | **selector has no 4:5** |
| 5:8 | 768×1280 (0.94MP) | — | **selector has no 5:8** |
| 5:4 | 1088×896 | — | **no 5:4** |
| 8:5 | 1280×768 | — | **no 8:5** |
| 2:3 / 3:2 / 21:9 | — | 840×1256 / 1256×840 / 1568×672 | **we have no 2:3, 3:2, 21:9** |

### Verdict: DELETE the ResolutionSelector. Reuse `FLUX_RATIOS` as-is.

Reasons:

1. **The app already owns resolution.** Our ratio control injects `width`/`height` straight
   into `EmptyLatentImage`. A ResolutionSelector in the graph is a second, competing source
   of truth — exactly the kind of duplicate the playbook warns about. The node exists in the
   official template because a standalone Comfy user has no app UI. We do.
2. **The two tables are ~1% apart and both ~1.0MP.** There is no quality argument for the
   selector's numbers. Both are divisible by 8; ours are mostly divisible by 32/64 (nicer for
   the VAE), the selector's `1184`/`1368` are not (`1368 = 8×171`, odd multiplier).
3. **Our table is strictly richer** in the ratios that matter for image work (4:5, 5:8, 5:4,
   8:5 — the print/social ratios). The selector's unique offerings are 2:3, 3:2, 21:9.
4. **`FLUX_RATIOS` is orientation-mode**, which is the right UI for an image model. Per
   playbook §6 + MPI-174, a new `type` declares `ratios` on the ModelDef, and `ratios` WITHOUT
   `qualityTiers` ⇒ orientation mode. So Krea2 gets the portrait/landscape toggle for free.

**Caveat worth testing:** Turbo is documented as native **1024→2048** (2K capable), whereas
Raw is "up to 1024". Our FLUX table is a 1.0MP table. If Turbo genuinely shines at 2K we may
want a `qualityTiers` set (`['1k','2k']`) rather than plain orientation mode — that is the
one open resolution question. Cheap to test: run 1024×1024 vs 2048×2048 and look.

**Do NOT** literally reuse the `flux` type's hardcoded table by setting `type: 'flux'` —
Krea2 needs its own `type`, and per MPI-174 a new type declares `ratios` on its ModelDef.
Copy the FLUX_RATIOS *values* into the Krea2 ModelDef; don't alias the type.

## 4. CustomCombo — how it actually works (matters for injection)

`CustomCombo` is **core ComfyUI v0.25.0**. Node 42 widgets:

```
['krea2_warmpastel',  # selected value
 3,                   # <- COUNT of options? or selected index? (3 = index of warmpastel)
 'krea2_coolblue', 'krea2_darkbrush', 'krea2_plasmoid', 'krea2_warmpastel',
 '']                  # trailing empty slot
```

Outputs: `STRING` (the selected value) and `INDEX` (int).

**Our workflow does NOT use the STRING output** — it is unconnected. It uses `INDEX` → a
subgraph `Select Per-Line Text by Index` (id `460e1a4e-…`), which holds a `RegexExtract`
node whose widget is a **newline-joined list of trigger phrases**:

```
Teal watercolor illustration style
Monochrome ink wash style
Ethereal shimmering light style
Muted minimalist sketch style
```

and a `StringReplace` that builds the regex `^(?:[^\n]*\n){index}([^\n]*)(?:\n|$)` to pluck
line N. So: **combo index → Nth line of a hardcoded phrase list → appended to prompt.**

That is a clever pure-Comfy lookup table, but for OUR app it is the wrong seam:

- The LoRA **filename** is a separate hardcoded thing (node 70 `LoraLoaderModelOnly`,
  `krea2_warmpastel.safetensors`) that must stay in lockstep with the combo index. Two lists,
  one index, silent drift. It is already broken — combo lists 4 dead names, loader defaults
  to a dead file.
- The app must inject **two coupled values** from one dropdown selection.

### Proposed seam (needs your node titles)

Let the app inject **two strings directly**, kill the index indirection + the subgraph:

| app injects | into node | node title |
|---|---|---|
| `krea2_darkbrush.safetensors` | `LoraLoaderModelOnly.lora_name` | `Input_Style_Lora` |
| `monochrome ink wash style` | the trigger `StringConcatenate.string_b` | `Input_Style_Trigger` |
| `0.8` (slider) | `LoraLoaderModelOnly.strength_model` | (same node, `strength_model`) |
| `true/false` | the `Enable LoRA?` boolean | `Input_Style_Enabled` |

Then the 9-entry style table lives **once**, in `js/data/` app-side, as
`{id, label, file, trigger, strength}`. No subgraph, no regex, no index drift, and the
dropdown can carry pretty labels ("Dark Brush") independent of filenames.

This also sidesteps the `MpiAnySwitch` 1-indexed / max-entries problem entirely — we never
inject a `select` int, we inject strings.

### Injection-rule check — DONE, and there is a real gap

`comfyController.js:1113` `targets` (verified, not assumed):

```js
['value','text','int','float','boolean','string',
 'ckpt_name','model_name','unet_name','image','mask','picks',
 'lora_name','strength_model','strength_clip',
 'denoise','seed','noise_seed','video','audio','latent','select']
```

Three findings:

1. **`lora_name` + `strength_model` are present** — but `_inject` loops the whole array and
   writes **every** matching input on the node, not the first. `LoraLoaderModelOnly` has BOTH.
   So injecting a bare string there sets `strength_model` to the filename too. This is exactly
   why MPI-219 added the object special-case at `comfyController.js:1141`: pass
   `{lora_name, strength_model, strength_clip}` as ONE object against ONE node title and it
   assigns each field correctly. **Use that existing object form for the style LoRA.** Do not
   invent a new path.
2. **`StringConcatenate` uses `string_a` / `string_b` — NEITHER is in `targets`.** The plain
   `'string'` entry does not match `string_b`. So the trigger phrase **cannot be injected
   today.** Two options:
   - (a) add `'string_a'`/`'string_b'` to `targets` (a one-line widening, low risk); or
   - (b) **preferred:** don't use `StringConcatenate` for the trigger. Feed the trigger from a
     `PrimitiveStringMultiline` titled `Input_Style_Trigger` (input name `value`, already in
     `targets`) into the concat's `string_b`. Zero core changes.
3. `'select'` is already present (added in MPI-182 for MpiAnySwitch) — so a `CustomCombo`'s
   int input would inject fine, if we went that route. We are not.

## 5. Prompt enhancement — user decision (2026-07-09)

User tested Comfy's `TextGenerate` enhancer: it "adds so much detail that it deviates from
the original idea"; a simple prompt tracked intent better. **Cut the whole enhancement
branch from the app workflow** (nodes 58/59/60/63/66 + `PreviewAny` 62). Cubric Prompt is
the app's answer to enhancement; the in-graph LLM is redundant and off-brand.

This also dissolves the "enhancer makes long prompts / style LoRA wants short prompts"
tension noted in `style-loras.md`. Good.

## Sources

- https://github.com/krea-ai/krea-2 (first-party: steps/cfg/mu)
- `G:\ComfyUi\ComfyUI\comfy_extras\nodes_resolution.py` (ResolutionSelector formula, read locally)
- https://www.stablediffusiontutorials.com/2026/06/krea2-base-turbo.html (er_sde/simple; Turbo 1024–2048, Raw ≤1024)
- https://civitai.com/models/2749367/... (res_2s/beta/6 → deis_3m/bong_tangent/2 @0.2; **UK-blocked, read via search snippet only**)
- https://github.com/ClownsharkBatwing/RES4LYF
- https://github.com/Auryg/Krea-2-Two-Stage-Sampler (sigma-locked RAW→Turbo handoff; phase-2 relevance)
