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
- [x] `voices` field type — a new branch in `buildField`, the roster itself (tier 2). Composes
      MpiInput + MpiDropdown + MpiButton, no new Primitive. Serialises through `mapDeclaredValue`
      (`serialiseVoices`), so the agent connector shares the widget's path. 819/819, lint clean.
      **DOM half still unproven in the app** — no FlowDef declares it yet, same caveat as
      `hiddenWhen` and `format: 'duration'`; all three close together on the live run
- [ ] `@` picker extracted from `MpiPromptBox` onto `MpiInput` (tier 3, purely additive on tier 2).
      `matchRefTagQuery` is reusable verbatim; only the DOM/keyboard/insert needs extracting

## Deps and licence (GAP — not in the original plan)

- [x] Flow shape settled against the playbook: no-model, media-free, `mediaType: 'audio'`, no
      uiComponent. Does NOT need `/mpi-add-model` — the Voice Changer "flow with deps" precedent
- [x] Three `assetDeps.js` entries — `minimax-music3-dit` (4.58GB), `minimax-music3-text-encoder`
      (8.57GB), `vae-minimax-music3-dav` (206.66MB), all from `Comfy-Org/MiniMax-Music-3`.
      **13.34GB total, not 14.33GB** — the plan's figures were HuggingFace's DECIMAL display and
      every consumer here parses `size` as 1024-based. Measured by `--sizes`, never typed
- [x] `sha256` for each (`/mpic-compute-dep-hashes`) — 3/3 written from HF `X-Linked-ETag`
- [ ] `requiredDeps` on the FlowDef lists exactly those three
- [x] Licence entry in `licences.js` — `MINIMAX_MUSIC3`, keyed **`flow:minimax-music`**, not a model
      id: the Flow Library installs flow deps under `flowDepKey(id)` and `downloadService.start()`
      keys the gate on whatever it is handed, so gating a no-model flow cost ZERO code. NO territory
      bar (unlike H3), and §1 obliges a bundled copy — `licences/minimax-music3/{LICENSE,NOTICE}.txt`
      (7,373 bytes, byte-identical to HF). The field is `poweredBy`, not `attribution`
- [x] **Fabio's call: WHERE the attribution shows — the About page.** Settled 2026-08-31, and it
      settles the Model Library drawer out too: a user can install and run this whole flow from the
      Flow Library and never open the Model Library, so `poweredBy` there would be the WRONG surface,
      not merely a missing one. The `credit` block on the three deps is what discharges §3.1 —
      MpiAbout derives Credits from DEPS, reachable however the weights arrived. `poweredBy` kept as
      a record. MpiAbout's intro copy corrected: it said "Style and control models" over a list that
      already held Chroma, Juggernaut, MiniMax-H3 and other base checkpoints

## Graph

- [ ] `flow_minimax_music.json` authored from the bench workflow
- [ ] Style/tempo/vocal switch banks + `StringConcatenate` assembly of the 3 blocks
- [ ] Instrumental arm writes the instrumental clause AND names the lead melodic instrument
- [ ] `Input_Duration` seconds → frames (`MpiMath`, LTX Extend pattern)
- [ ] `Input_Low_Vram` wired to the tiled/plain VAE decode switch already on the bench
- [ ] ~~LoRA nodes present~~ but NO rack declared — the bench graph has NO LoRA nodes at all
      (verified 2026-08-31, 15 nodes). Nothing to carry over; see `plan.md` § LoRA
- [ ] Selector titles pinned in `tests/inject-params-titles.test.cjs`

## Enhancer recipe

- [ ] 🔴 **BLOCKER (GAP 3): the `enhance` action cannot carry a recipe.** `_runEnhance` passes only
      `Input_Seed`; the action declares only `op`/`from`/`to`/`model`. The baked recipe is Character
      Sheet's ("You are a character designer"), so Enhance on this flow would write a wardrobe noun
      phrase. Fix = let the action declare `injectionParams`, merged over the driven seed. FOURTH
      frame addition on this card, THIRD touching MpiBaseFlow
- [x] 🔴 **DECISION (GAP 4) SETTLED: the GRAPH assembles the caption** (option B). Fabio,
      2026-08-31. The LLM writes the three PROSE blocks only; the graph writes the headings, Basic
      Attributes, the instrumental clause and the roster string around them. So the scrubs assert the
      prose blocks are present, NOT that "the three headings survived" — that wording in `plan.md`
      § The enhancer recipe predates the decision
- [ ] Music caption recipe written for `Input_System_Prompt`
- [ ] `Input_Scrub_Negation` / `Input_Tidy` patterns assert the 3 PROSE BLOCKS survived (not the
      headings — the graph writes those now, GAP 4 option B)
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
