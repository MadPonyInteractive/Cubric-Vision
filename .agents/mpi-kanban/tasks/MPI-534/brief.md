# MPI-534 — Replace ill-anime / pony-mix (RentCivit-only licences)

Picked up 2026-08-16 at the user's request, deliberately re-opening the
2026-08-03 "keep and ship as-is" decision recorded in
`docs/models/community-merges-licences.md` § The `Image` flag.

## THE CRITICAL CONSTRAINT — our SDXL weights are OUR merges

**A downloaded checkpoint CANNOT be dropped in as-is.** (User, 2026-08-16;
confirmed in the graphs.) Our SDXL checkpoints are upstream models merged with TWO
LoRAs, and the workflow's sampler settings depend on that merge.

> **Evidence scope (claim-auditor, 2026-08-16).** `Model Merger.json` is an authoring
> scratchpad: its SDXL chain is **bypassed** (`mode: 4`, nodes 1/2/3/5) and the only
> active circuit is a Wan 2.2 i2v merge. It wires ONE checkpoint,
> `animergemeij_v30VAE` → `PONY_Mix`. "All five SDXL weights carry DMD2" is a sound
> INFERENCE from the shared template plus the 7-step/CFG-1.5/`lcm` sampler — not a
> directly evidenced fact. The hash proof covers the DMD2 file's identity only.

The recipe is `comfy_workflows/scripts/Model Merger.json` (a LiteGraph authoring
file, run on the bench in CPU mode):

```
CheckpointLoaderSimple  PONY\animergemeij_v30VAE.safetensors
  -> LoraLoaderModelOnly  sdxl\spo_sdxl_10ep_4k-data_lora_webui.safetensors  @ 0.4
  -> LoraLoaderModelOnly  sdxl\dmd2_sdxl_4step_lora.safetensors              @ 0.7
  -> CheckpointSave       checkpoints/PONY_Mix
```

- **SPO** — aesthetic-preference LoRA, strength **0.4**
- **DMD2** — few-step distillation LoRA, strength **0.7** (load-bearing)

`sdxl_t2i_template.json` KSampler runs **7 steps, CFG 1.5, `lcm` / `simple`**
(hi-res pass: 3 steps, CFG 1.5, denoise 0.4). Those settings ONLY work because
DMD2 is baked into the checkpoint. A stock upstream checkpoint at 7 steps /
CFG 1.5 / lcm returns garbage.

The same two `LoraLoaderModelOnly` nodes sit in `sdxl_t2i_template.json`
(ids 1560/1561) **bypassed** (`mode: 4`) — left in place as documentation of the
recipe. The API export strips bypassed nodes, so both runtime files contain
**zero** `LoraLoaderModelOnly` (verified: grep count 0 in `t2i_pony_mix.json`
and `t2i_ill_anime.json`). The six `MpiLoraModelClip` nodes in the runtime are
the USER's style-LoRA slots, unrelated. Neither SPO nor DMD2 is a declared dep —
they exist only on the bench, and only at merge time.

**Consequence:** this card needs a BENCH MERGE SESSION, not just a data edit.
The merge is also why none of our three hashes match anything upstream.

## Blast radius — the app-side edit is small (AFTER the merge exists)

| File | What |
|---|---|
| `js/data/modelConstants/modelDeps.js` :48 `ill-anime`, :75 `pony-mix` | url/mirror/sha256/bytes + `credit` block |
| `js/data/modelConstants/models.js` :240, :307 | ModelDef — `dependencies[0]` is the licence-bearing entry |
| `comfy_workflows/scripts/workflow_generation/generate_sdxl.py` :28-29 | `MODEL_VARIANTS` → baked `ckpt_name` |
| `dev_configs/smoke-evidence.json` | recorded smoke ids |

All five SDXL runtimes bake from ONE master template; `generate_sdxl.py` swaps
only `ckpt_name` by `_meta.title == "Checkpoint"`. ModelDef, the five ops,
`opInject`, ControlNet-Union and the LoRA rack are untouched. Plus: upload the
merged weight to R2 + HF, and re-run smoke for the changed ops.

## Licence research — HF (2026-08-16, no VPN needed)

The user's instinct was right: **HF licences differ from the CivitAI flags.**

### The distinction that matters: output rights vs derivative-model rights

`RentCivit`-only (our current problem) restricts **what the user may do with the
generated image** — the thing that bites our users.

**FAIPL-1.0-SD** (Illustrious, NoobAI) restricts **derivative MODELS**, and
explicitly does NOT restrict output. Onoma's model card:

> "Uploading / Generation Policy: We do not restrict any upload or spread of the
> generation results, as we do not own any rights regard to generated materials."

Its Monetization Prohibition covers *"close-sourced fine-tuned / merged model"*.
**That clause reaches us directly** — our shipped weight IS a merged model, and
we do not publish the recipe. See Open Questions.

### Candidates

| Repo | Licence | Single-file? | Size | sha256 | Verdict |
|---|---|---|---|---|---|
| `AstraliteHeart/pony-diffusion-v6` | **creativeml-openrail-m** | yes `v6.safetensors` | 6.94GB | `67ab2fd8ec439a89b3fedb15cc65f54336af163c7eb5e4f2acc98f090a29b0b3` | **CHOSEN for Pony** — author's own repo, output-commercial OK, hash-resolvable, permits closed derivatives |
| `Laxhar/noobai-XL-1.1` | FAIPL-1.0-SD | yes | — | — | **CHOSEN for Illustrious** — tuned anime merge, output unrestricted |
| `OnomaAIResearch/Illustrious-xl-early-release-v0` | FAIPL-1.0-SD | yes (v0.1 + GUIDED) | 6.94GB | `3e15ba00…` / `e3d12d0f…` | Fallback — canonical base, plainer output |
| `purplesmartai/pony-v7-base` | pony-license | yes | — | — | **REJECTED** — bars use in *"an inference service or application"*. Vision IS an application. WORSE than what we ship |
| `John6666/*-illustrious-*` | FAIPL-1.0-SD | **NO — diffusers only** | — | — | Needs conversion; graph uses `CheckpointLoaderSimple` |
| `LyliaEngine/Pony_Diffusion_V6_XL` (cdla-permissive-2.0), `votepurchase/ponyDiffusionV6XL` (mit) | re-uploader tag | — | — | — | **DO NOT TRUST** — third-party re-uploads; the tag has no authority over the author's terms |

### Hash check
No collision between our three hosted copies and any candidate — consistent with
ours being merges. (Ours: `f548b5b4…`, `bbebe76d…`, `455ea662…`.)

### CivitAI half — NOT done
`curl civitai.com` → HTTP 000 / exit 43 on four attempts; unreachable from this
shell regardless of VPN (same egress class as `freedevproject.org`, which also
failed — the FAIPL text was therefore read from Onoma's model card, not the
canonical licence URL). The 2026-08-03 flags remain **unre-verified**.

## Decisions (user, 2026-08-16)

- **Pony** → `AstraliteHeart/pony-diffusion-v6` (OpenRAIL-M)
- **Illustrious** → `Laxhar/noobai-XL-1.1` (FAIPL)
- **ill-anime-beauty** → **LEAVE ALONE.** It grants the `Image` flag, so users can
  already sell its output. Whether its uploader honoured his own upstream terms is
  his responsibility, not ours. Out of scope; do not re-open under this card.

## Open questions

1. **FAIPL vs our closed merge.** NoobAI is FAIPL: derivatives must be openly
   published with the merge recipe. Our shipped weight would be a FAIPL derivative
   merged with SPO+DMD2. Either publish the recipe (it is already in
   `Model Merger.json` and now in this brief — a low cost), or pick an
   OpenRAIL-M/permissive Illustrious merge instead. **Needs the user's call before
   the merge session.**
2. **SPO and DMD2 licences** — not yet checked. They are baked into every SDXL
   weight we ship, so their terms flow into the result. Check before merging.
3. Whether the DMD2 strength (0.7) transfers cleanly to these different bases, or
   needs re-tuning per checkpoint on the bench.


---

# !! DMD2 IS NON-COMMERCIAL — BIGGER THAN THIS CARD (2026-08-16)

Found while checking open question 2. **Hash-proven, not inferred.**

`dmd2_sdxl_4step_lora.safetensors` is baked at strength 0.7 into EVERY SDXL
checkpoint we ship. Its source is **`tianweiy/DMD2`, licensed `cc-by-nc-4.0`
— NON-COMMERCIAL**.

Proof (2026-08-16):

| | value |
|---|---|
| local `G:/CubricModels/loras/sdxl/dmd2_sdxl_4step_lora.safetensors` | 787,359,616 bytes |
| HF `tianweiy/DMD2` same filename | 787,359,616 bytes |
| local sha256 | `a374289e9446d7f14d2037c4b3770756b7b52c292142a691377c3c755010a1bb` |
| HF LFS oid | `a374289e9446d7f14d2037c4b3770756b7b52c292142a691377c3c755010a1bb` |

Byte-for-byte identical. This is the strongest class of evidence the licence doc
recognises (a real hash match), unlike the filename+creator provenance behind the
rest of the community-merge table.

## Why this outranks MPI-534 as scoped

MPI-534 was opened because TWO checkpoints (`ill-anime`, `pony-mix`) withhold the
CivitAI `Image` flag. But DMD2 is merged into the SDXL weights we ship — on the
evidence-scope caveat above, inferred for all five — including
`sdxl-realistic` and `sdxl-nsfw`, which the 2026-08-03 table marked as GRANTING
`Image` and therefore fine.

So swapping the two bases for cleanly-licensed ones does NOT clear the
commercial-use problem: the replacement gets merged with the same NC LoRA and
inherits `cc-by-nc-4.0` all over again. **Fixing MPI-534 without fixing this
produces a weight that is still non-commercial while LOOKING resolved** — the worst
outcome, because the licence doc would then record it as clean.

SPO (`spo_sdxl_10ep_4k-data_lora_webui.safetensors`) is **apache-2.0** — fine, no
action. Verified via `SPO-Diffusion-Models/SPO-SDXL_4k-p_10ep_LoRA`.

## What needs deciding (USER — do not act unilaterally)

1. Is a merged checkpoint a "derivative" of a LoRA merged into it? For a
   weight-space merge at strength 0.7 the LoRA's parameters are mathematically
   present in the result, so the conservative reading is yes.
2. If yes, options: drop DMD2 and re-tune the sampler (it is what makes 7-step /
   CFG 1.5 / lcm work, so this is a real quality/speed cost), find a
   commercially-licensed few-step distillation (LCM / Lightning / Turbo under a
   permissive licence), or seek permission from the DMD2 authors.
3. Scope call: this is arguably its own card — it touches the SDXL family (inferred:
   all five), not just the two MPI-534 names.

**Nothing has been changed in the app. No merge has been run. Recorded only.**
