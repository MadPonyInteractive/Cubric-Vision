# MPI-266 — Drop Boogu Edit fp8_scaled Balanced tier; collapse to 2 tiers

**Type:** bug fix via reverse add-model + tier re-slot. No version bump (model change).
**Verify mode:** user-ux (final call needs eyes on output; Ada engine + ideally a Blackwell run).

## Current State

Boogu Image Edit ships 3 sibling tier cards (`modelFamily: 'Boogu-Image-Edit'`):
- **high** — `boogu_image_edit_bf16.safetensors` (20.59GB) — Tier 1, 25/30-step, negatives.
- **balanced** — `boogu_image_edit_fp8_scaled.safetensors` (10.31GB) — Tier 2, 25-step. **← DARK on Blackwell, DROP.**
- **low** — `boogu_image_edit_turbo_int8_convrot.safetensors` (11.37GB) — Tier 3, 8-step turbo, cfg1, `negativePrompt:false`.

Template `boogu_edit_template.json` = ONE graph, 3 sampler chains selected by `Input_Tier` (MpiInt).
Generator `generate_boogu.py` bakes `unet_name` + `Input_Tier.int` per tier. Root cause: research/blackwell-fp8-dark-research.md.

## Target State

**2 tiers:**
- **high** — bf16 (unchanged).
- **balanced** — the int8_convrot weight, re-slotted from `low`. Keeps its turbo sampler chain (Tier-3 chain, 8-step cfg1, `negativePrompt:false`, `gen_speed` fast→balanced label).

fp8_scaled: card, dep, R2 weight, runtime JSON, progressStages key, template chain — all removed.

## Naming decision (bake in before editing)

**Primary (clean): rename int8 artifacts `low`→`balanced`** so `sizeTier: 'balanced'` matches the on-disk names:
- dep id `boogu-edit-transformer-low` → `boogu-edit-transformer-balanced` (fp8 one deleted first, so the id frees up)
- runtime JSON `boogu_edit_low.json` → `boogu_edit_balanced.json`
- generator output name + card `workflows.edit` + progressStages key follow.
The .safetensors filename (`boogu_image_edit_turbo_int8_convrot`) does NOT change — it's the real weight; only our tier LABELS move.

**Fallback (lazier, if rename churn bites):** keep int8 dep id + `boogu_edit_low.json` as-is, just point the re-slotted `balanced` card at them. `// ponytail:` comment the mismatch. Only if the rename hits a snag.

## Steps

1. **Template (USER)** → verify: user updates `boogu_edit_template.json` to drop the fp8 Tier-2 UNETLoader + its sampler chain, saves the canvas. Agent does NOT hand-edit JSON (hard rule). Agent waits for "saved", then re-reads. → verify: `Input_Tier` wiring still selects a valid chain for the int8 tier; only 2 chains remain.

2. **Generator `generate_boogu.py`** → drop the balanced (fp8) row from `MODEL_VARIANTS`; set the int8 row's output name to `boogu_edit_balanced.json` (primary naming). Keep bf16 row. → verify: `python generate_boogu.py` runs clean, emits exactly 2 files, prints correct (tier, unet_name).

3. **Regen + delete stale JSON** → run generator; delete `boogu_edit_low.json` (now superseded) and the old fp8 `boogu_edit_balanced.json` is overwritten by the int8 output. Confirm no orphan JSON. → verify: `ls comfy_workflows/boogu_edit_*.json` = high + balanced only; each parses; balanced's UNETLoader.unet_name == int8_convrot.

4. **dependencies.js** → delete `boogu-edit-transformer-balanced` (fp8) entry. Rename `boogu-edit-transformer-low` → `boogu-edit-transformer-balanced`, update `name`/`origin` strings (int8, Balanced). → verify: grep shows no `fp8_scaled`; one balanced dep pointing at int8_convrot.

5. **models.js** → delete the fp8 `boogu-edit-balanced` card. Re-slot the `boogu-edit-low` card: `id`→`boogu-edit-balanced`, `sizeTier: 'balanced'`, `image` webp, `gen_speed` label, `workflows.edit`→`boogu_edit_balanced.json`, `dependencies[0]`→ renamed dep. KEEP `negativePrompt:false` + turbo note (int8 is still cfg1 turbo). → verify: 2 boogu cards; no `fp8`/`low` refs; balanced deps resolve.

6. **progressStages.js** → drop `boogu_edit_low.json` key; balanced key now points at int8. **BUG FOLD-IN (user, live):** status bar showed "2" but the graph runs ONE tqdm bar (sampler only, no model-load bar surfaces — same as PiD). The MPI-257 count was flagged PROVISIONAL. Correct BOTH boogu keys `single:2`→`single:1`. → verify: exactly 2 boogu keys, both `single:1`; in-app status bar reads "1/1" not "· 2".

7. **Consumer sweep** → grep `fp8_scaled`, `boogu-edit-low`, `boogu_edit_low`, `transformer-balanced` across `js/`, `operation_registry.json`, docs. Fix stragglers. → verify: no dangling refs.

8. **Tests** → run `tests/inject-params-titles.test.cjs` + the boogu parse cross-ref. → verify: green.

9. **R2 DELETE (USER APPROVAL GATE)** → delete `vision/models/diffusion_models/boogu_image_edit_fp8_scaled.safetensors` from R2 (rclone). **STOP and ask before running.** int8 weight already on R2 — no upload needed. → verify: HTTP HEAD on fp8 URL = 404; int8 URL = 200.

10. **App verify (user-ux)** → launch Electron, local Ada engine: run an edit on High (bf16) and Balanced (int8). Both clean, not dark. Confirm dropdown shows 2 tiers. Ideally: one Blackwell run (Pod or the 4500 rig) confirming int8 Balanced is NOT dark. → verify: user eyes.

11. **Knowledge** → research doc already saved. Update card MPI-257 hook + MEMORY in-flight to note fp8 dropped. If the playbook lacks a "reverse/remove-model" note, add one (per hard rule: knowledge doesn't live only in chat).

## Risk: Medium

- Template edit is user-owned + hard-rule (no hand-edit) — coordination step, not a blocker.
- R2 delete is irreversible → hard approval gate (step 9). fp8 weight is re-uploadable from `G:\CubricModels` if ever needed, so deletion is safe-ish but still gated.
- int8 Balanced never A/B'd on Blackwell for the dark bug specifically — research says int8 is Blackwell-safe (universal int8 HW path, no fp8 scale bug), but step 10's Blackwell run is the real proof. If int8 ALSO darkens on Blackwell (unexpected), fall back to bf16-only + GGUF-Q8 investigation (new card).

## Verification (summary)
- `python generate_boogu.py` → 2 files, correct unets.
- grep: zero `fp8_scaled` / `boogu-edit-low` / `boogu_edit_low` refs.
- `tests/inject-params-titles.test.cjs` green.
- R2: fp8 URL 404, int8 URL 200.
- App: 2 tiers, both edit clean on Ada; Blackwell int8 not dark.
