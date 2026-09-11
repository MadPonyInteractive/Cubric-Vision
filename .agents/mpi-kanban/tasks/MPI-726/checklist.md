# MPI-726 — checklist

Follow-up to [MPI-725]. Fabio removed the debug `Preview as Text` node and re-exported
`comfy_workflows/raw/krea2_t2i_template.json`, and asked for the second flagged item fixed.

- [ ] Re-convert against the app engine on **48188**, validate, bake both runtime files.
- [ ] Confirm the ONLY graph delta vs MPI-725 is the dropped debug node — `Output_prompt`
      (the other `PreviewAny`, id 242, which the app reads for the enhanced prompt) must
      survive.
- [ ] Correct `generate_krea2.py`: its docstring branch map and the `_INJECTED_INPUT_DEFAULTS`
      comment both call `Input_wf_type` 5 unused / "deliberately dead". `models.js:685` maps
      `inpaint: { Input_wf_type: 5 }`, and MPI-725 put the whole inpainting rework on that
      branch. Comment-only change — no behaviour.
