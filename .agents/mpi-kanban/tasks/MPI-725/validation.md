# MPI-725 — validation

## What ran

- Converted against the **app engine on 48188**, not the 8188 bench:
  `COMFY_URL=http://127.0.0.1:48188 node scripts/workflow-to-api.mjs comfy_workflows/raw/krea2_t2i_template.json`
  → exit 0, no stderr, 140 nodes (was 130).
- `node scripts/validate-injection-rules.mjs` on the converted template **and** both baked
  runtime files → `All 3 file(s) conform to the injection rules.`
- `python orchestrate.py` → rebuilt only `krea2_t2i_template.json` (hash-gated; the other 11
  templates reported `[skip] unchanged`). Both outputs `[OK] ... (140 nodes, 10 style LoRAs)`,
  so the style-rack coherence assert passed.
- The scrubber caught the full authoring scene: `Input_Positive 'remove the arm' → ''`,
  `Input_Seed 976866873950 → 0`, `Input_Image 'C:\Users\Fabio\Downloads\beautiful-cyborg-…jpg' → ''`,
  `Input_Mask 's' → ''`, `Input_wf_type 5 → 1`, `Input_is_Turbo True → False`.
- `COMFY_URL=http://127.0.0.1:48188 node scripts/verify-workflow.mjs` on both runtime files →
  0 missing-required inputs, 0 dangling links. The one reported item is
  `lustify-v10-krea-raw-int8_convrot.safetensors` not installed on this engine — the NSFW
  weight, expected.
- `node --test` on the nine injection/workflow tests → **56 pass, 0 fail**.

## What actually changed, read off the API diff (not the 5k-line LiteGraph churn)

**Inpaint (`inpaint`, `Input_wf_type` 5)** — the gate at node `564` widened from
`wf_type == 4` to `wf_type == 4 OR wf_type == 5` (new `698:MpiBooleanCompare`). That gate
drives `294/302/303`, i.e. whether conditioning comes from `Krea2EditGroundedEncode` +
`Krea2EditModelPatch` or from plain `CLIPTextEncode`. So inpaint now runs the grounded edit
path — the source image is encoded as reference. That is the quality jump AND the cost.
`LanPaint_KSampler` itself is untouched; only its step/cfg feeds moved, **down**:
`669` `'8 if a else 15'` → `'6 if a else 12'`, `671` `'1.0 if a else 2.0'` → `'1.0 if a else 1.5'`.
So the extra time is the grounded encode, not more sampling.

**Prompt rewriting, new `705:MpiAnySwitch10` keyed on `Input_wf_type`** — branches 1/2/3/6/7
pass `Input_Positive` through untouched. Branch 4 (`krea2Edit`) gets
`"You are a helpful assistant specialized in image editing. "` prefixed. Branch 5 (`inpaint`)
goes through `713:MpiIfElse` on `710:MpiTextContains(words='remove')`: containing "remove" →
`StringReplace` swaps the word for `"You are a helpful assistant specialized in image
inpainting, completely remove from the image: "`, otherwise prefixed with `"…, add to the
image: "`. It feeds BOTH the plain path (`241.false`) and the enhancer path (`422` → `423` →
`241.true`), so the prefix is not lost when Enhance is on.

**Image to Image (`Input_wf_type` 2)** — `526:MpiCrop` (pure center crop to
`Input_Width`×`Input_Height`, `divisible_by 16`, no scaling — confirmed in
`ComfyUi-MpiNodes/img.py:575`) is gone. `217:VAEEncode` now reads
`694:ResizeImageMaskNode` (`scale dimensions`, lanczos, `crop: center`), still fed by
`Input_Width`/`Input_Height`. The node's own tooltip: *"'center' crops to maintain aspect
ratio"* — so the picture is SCALED to target first and only the aspect-ratio excess is
trimmed, where before a raw patch was cut out of the full-size original. Width/height still
come from the same two nodes, so `imageSizedOps` in `models.js` is unaffected — i2i stays out
of it and the ratio picker stays correct.

## Engine and pin — nothing to bump

Every class type new to this graph already ships: `ResizeImageMaskNode`
(`comfy_extras.nodes_post_processing`), `StringConcatenate` / `StringReplace`
(`comfy_extras.nodes_string`), `PreviewAny` (`comfy_extras.nodes_preview_any`) are core on the
pinned `v0.34.0`; `MpiTextContains` is present in the pinned `ComfyUI-MpiNodes` commit
`1de35a3` (`logic.py`). No `node_lock.json` change, no new dependency.

## Flagged, not fixed

1. **`716:PreviewAny` ships in both runtime files with no consumers** — an authoring debug
   readout of the rewritten prompt. Harmless but it is a live output node in a shipped graph.
   Removing it means re-exporting from the bench, which is Fabio's `raw/`, not ours.
2. **`generate_krea2.py`'s branch map says "5 UNUSED" and "Slot 5 is deliberately dead"**
   (docstring + the comment above `_INJECTED_INPUT_DEFAULTS`). `models.js:685` maps
   `inpaint: { Input_wf_type: 5 }`, and node `674` (`== 5`) predates this change — so the
   comment was already stale before MPI-725 and is now actively misleading, since branch 5 is
   where the whole inpainting rework lives. Pre-existing drift, left alone per the
   surgical-changes rule.

## Not touched

`comfy_workflows/qwen3vl_4b_prompt_enhancer.json` and its `raw/` twin — MPI-664's, file claim
`62da4764`. They are also why `scripts/sync-raw-workflows.mjs` could not be used: it aborts on
any uncommitted generated workflow. The krea2 leg ran as that script's own steps, by hand.
