# MPI-504 — checklist

Build detail in [plan.md](plan.md); prompt payload in [prompts.md](prompts.md).

## Written with no GPU (this session)

- [x] Card re-scoped to v1: prompt only, image input deferred to v2
- [x] Sheet template parametrised into four styles, gendered words neutralised
- [x] Character-only enhancer system prompt drafted for node `420`
- [x] Group-by-group strip list for `krea2_t2i_template.json`
- [x] Head-removal branch specced (SAM3 text → left-half intersect → grow → Klein inpaint)

## Bench — needs the GPU (Fabio, `raw/` is user-owned)

- [ ] Copy `krea2_t2i_template.json` → `flow_character_sheet.json`, delete the seven groups,
      split `Styles`, collapse the dead branch switches
- [ ] Wire the four templates + `MpiAnySwitch` on `Input_Style`, and the `[CHARACTER PROMPT]`
      `StringReplace` off the enhancer output
- [ ] Swap node `420`'s system prompt for the character-only recipe
- [ ] Enhancer regression: three inputs, five checks each (prompts.md §2) — **text only, this
      one needs no GPU beyond a running engine**
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
- [ ] Decide the `krea2-nsfw`-only install case
