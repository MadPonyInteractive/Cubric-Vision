# MPI-664 Checklist

Design settled 2026-08-30 (hybrid). See `plan.md` for the full field surface and the reasoning.

## Design

- [x] Caption approach chosen — **hybrid**: dropdowns write the deterministic blocks, the LLM writes prose only
- [x] "Where does an LLM run" answered — Vision already ships one (`promptEnhance` op, universal, caller-injects its recipe). Not blocked on Cubric Prompt
- [x] Style taxonomy sourced — MiniMax's own 18 families, from the skill's `genre-router.md`
- [x] Caption schema captured — 3 headings, 11 sub-labels, 250–450 words
- [x] Licence position settled — take the schema and taxonomy, never MiniMax's template prose
- [ ] Field surface reviewed by Fabio (`plan.md` § The five-step field surface)
- [x] **Bench test: does MiniMax honour per-section voice stated in the caption? — PASSED** 2026-08-31.
      Gated the whole roster. Caveat: the choir bleeds into the solo material, so the copy must say
      *steer*, never *assign*
- [x] Bigger text encoder ruled OUT — `pruned_bf16` (16.71 GB) stages 15.9 GB onto a 16 GB card and
      runs ~9× slower; unshippable on the target card regardless of quality. Do not retry

## Frame work (new, portable)

- [x] `hiddenWhen` clause in `declaredFields.js` + `_paintFieldConstraints` — extends the MPI-663 constraint path
- [x] `format: 'duration'` on `slider` — seconds rendered as "1 minute 2 seconds"
- [x] Both promoted into `docs/playbooks/add-flow/ui/carousel-frame/fields.md`
- [ ] The painter's DOM half proven in the app — unit-verified only until a FlowDef declares a rule
- [ ] `voices` field type — a new branch in `_buildField`, the roster itself (tier 2)
- [ ] `@` picker extracted from `MpiPromptBox` onto `MpiInput` (tier 3, purely additive on tier 2).
      `matchRefTagQuery` is reusable verbatim; only the DOM/keyboard/insert needs extracting

## Graph

- [ ] `flow_minimax_music.json` authored from the bench workflow
- [ ] Style/tempo/vocal switch banks + `StringConcatenate` assembly of the 3 blocks
- [ ] Instrumental arm writes the instrumental clause AND names the lead melodic instrument
- [ ] `Input_Duration` seconds → frames (`MpiMath`, LTX Extend pattern)
- [ ] `Input_Low_Vram` wired to the tiled/plain VAE decode switch already on the bench
- [ ] LoRA nodes present but NO rack declared (see `plan.md` § LoRA)
- [ ] Selector titles pinned in `tests/inject-params-titles.test.cjs`

## Enhancer recipe

- [ ] Music caption recipe written for `Input_System_Prompt`
- [ ] `Input_Scrub_Negation` / `Input_Tidy` patterns assert the 3 headings survived
- [ ] `max_length` raised past 512 — 250–450 words does not fit the baked default
- [ ] Measured: does Qwen3-VL-4B hold the format? If not, escalate per `plan.md` § If the 4B cannot hold format

## Flow

- [ ] `FlowDef` restructured into the five steps (Song / Voices / Lyrics / Style / Run)
- [ ] `FlowDef` + op registered in the 4 files
- [ ] Roster markers STRIPPED at dispatch — they build the caption's Vocal Details, the lyrics reach
      the model clean (`<Choir>` is not in MiniMax's tag set)
- [ ] `Input_Duration` labelled as a CAP, not a length — the model derives actual seconds from lyrics
- [ ] Preview graphics (`/mpi-flow-graphics`)
- [ ] `docs/playbooks/add-flow/existing-flows/minimax-music.md`
- [ ] Live run verified in the user's own app

## Deferred (recorded, not v1)

- [ ] Lyrics generator — user writes their own; revisit only if a lyrics model earns it
- [ ] Saved custom styles as reusable chips
- [ ] Music style-LoRA system
