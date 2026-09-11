# MPI-726 — validation

## The re-export is exactly one node smaller, and it is the right one

Converted against 48188, then diffed the new API output against the MPI-725 template
(node-for-node, inputs included):

```
nodes: 140 -> 139
only in OLD:   716:PreviewAny[Preview as Text]
only in NEW:   (none)
inputs changed on shared nodes: (none)
```

So the debug readout is gone and nothing else moved — no re-routing, no widget drift from
the round trip through the editor. The other `PreviewAny` survives, which is the one that
had to: `242:PreviewAny[Output_prompt]`, `source <- 241:MpiIfElse[Input_enhance_prompt]`.
That is the node the app reads the enhanced prompt back from, so losing it would have taken
`Output_prompt` with it.

`validate-injection-rules` → `All 3 file(s) conform`. `verify-workflow` against 48188 → both
runtime files 139 nodes, 0 missing-required, 0 dangling; the only note is the NSFW weight not
being installed on this engine, as before. `node --test` on the nine injection tests → 56
pass, 0 fail.

## The generator comments

Fixed in `generate_krea2.py`, comments only — no code path touched:

- The branch map said `5 UNUSED` with *"Slot 5 is deliberately dead — edit takes an optional
  Input_Mask, so there is no separate inpaint branch."* Both halves are false:
  `models.js:685` maps `inpaint: { Input_wf_type: 5 }`, node `674` (`Input_wf_type == 5`)
  predates MPI-725, and MPI-725 put the grounded-edit conditioning AND the LanPaint route on
  that branch. Replaced with the live description, plus the reason the wrong comment kept
  looking right: slot 5 IS dead on Chroma and Klein, and this is the one map that differs
  from theirs.
- `_bake_wf_type`'s failure message listed `1 / 2 / 3 / 4 / 6 / 7` — it is the error a
  developer reads when the whole model is broken, so the missing 5 was the worst place for it.
- Two op counts that were wrong for the same reason: "all six ops now build from one source"
  and "ALL SIX ops — t2i / i2i / depth / edit / detail / upscale". `supportedOps` has seven.
- The module docstring's one-line summary and its "ONE universal graph serves…" sentence
  both omitted inpaint.

**Proved the edit did not change what the generator emits:** md5'd both runtime files,
cleared only krea2's entry from the untracked `.state.json` (so orchestrate could not skip
it), re-ran `orchestrate.py`, then `md5sum -c` → both `OK`. Byte-identical output from the
edited file.

## Not touched

`comfy_workflows/qwen3vl_4b_prompt_enhancer.json` and its `raw/` twin — still MPI-664's
(claim `62da4764`), still the reason `sync-raw-workflows.mjs` cannot run.
