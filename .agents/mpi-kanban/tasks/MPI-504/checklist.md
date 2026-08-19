# MPI-504 — checklist

Build detail in [plan.md](plan.md); prompt payload in [prompts.md](prompts.md).

## Written with no GPU (this session)

- [x] Card re-scoped to v1: prompt only, image input deferred to v2
- [x] Sheet template parametrised into four styles, gendered words neutralised
- [x] Character-only enhancer system prompt drafted for node `420`
- [x] Group-by-group strip list for `krea2_t2i_template.json`
- [x] Head-removal branch specced (SAM3 text → left-half intersect → grow → Klein inpaint)

## Measured with an engine but no generation (session 2)

- [x] Enhancer regression: four inputs, the checks in prompts.md §2, on bench 8188 — the drafted
      recipe FAILED (2 of 4 returned the example inside the instruction), revised to **v3** over
      three arms → research/enhancer-regression-2026-08-19.md
- [x] `use_default_template` A/B on `58 TextGenerate` — byte-identical, flag is inert, keep `true`
- [x] Two `RegexReplace` scrub nodes designed and verified offline on all four real v3 outputs
      (negation gone 4/4, rear view kept 4/4, trailing full stop gone 4/4) — now part of the build
- [ ] Re-run the regression against the built graph once the scrub nodes are in it, to confirm
      the whole chain end to end rather than the recipe alone

## Bench — needs the GPU (Fabio, `raw/` is user-owned)

- [~] Copy + seven-group strip RAN, then FAILED review: that list deletes the conditioning
      (`Edit` builds it) and the resolution (`Images` holds W/H). Invalid file removed; the
      corrected keep-list is in plan.md § What must survive the strip
- [ ] **Fabio strips the graph in the bench editor** — t2i only, Prompt Enhancement group out
- [x] **`qwen3vl_4b_prompt_enhancer.json`** — built by Fabio, then patched: v4 recipe in,
      two `RegexReplace` scrub nodes added, `Input_enhance_prompt` `MpiIfElse` deleted.
      Verified offline; patterns proven against the four real v4 outputs
- [x] Made the enhancer UNIVERSAL — recipe + both scrub patterns injectable at run time
      (`Input_System_Prompt`, `Input_Scrub_Negation.regex_pattern`, `Input_Tidy.regex_pattern`),
      `MpiClearVram` added after `TextGenerate` per `image_descriptor.json`
- [x] Live-proven on the bench: defaults match the offline scrub prediction byte for byte
      4/4 (Python `re` == JS), and an injected translator recipe returned French
- [ ] At `/mpi-add-flow`: decide whether the op is a universal `promptEnhance` (the
      `getUniversalWorkflow('imageDescribe')` shape) rather than sheet-specific
- [ ] Wire the four templates + `MpiAnySwitch` on `Input_Style`, and the `[CHARACTER PROMPT]`
      `StringReplace` fed by `Input_Positive` — the prompt box, verbatim, no in-graph enhancer
- [ ] Point a `PreviewAny` titled `Output_prompt` at the ASSEMBLED sheet prompt (MPI-242 contract)
- [ ] First sheet at 8:5 2k — layout intact, one continuous backdrop, same character ×3
- [ ] Gate #1: neutral-pronoun A/B against Fabio's original wording, same seed
- [ ] Head branch: face detect → `ImpactSEGSOrderedFilter` area ascending take 1 → bbox grown
      upward → head mask → grow 24 @ 2k. Confirm `face_yolov8n` sees the small face at 1k
- [ ] Klein removal A/B — baked prompt vs the no-prompt remove op + crop/stitch
- [ ] All four styles return their medium and keep the pupil catch-light
- [ ] 10/10 stress test: ten generations, varied pose and light, next to a second character

## App wiring — after the graph proves out

- [ ] `/mpi-add-flow` from the top: `FlowDef`, the op in 4 files, `sync-raw-workflows.mjs`,
      `validate-injection-rules.mjs`, live run
- [ ] Second op for the PROMPT REVIEW step (`outputKind: 'text'`, the Describe Image shape) —
      returns the enhanced character description into the prompt box for the user to edit
- [ ] Decide the `krea2-nsfw`-only install case
