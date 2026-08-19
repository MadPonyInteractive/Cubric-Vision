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
- [x] **Fabio stripped the graph in the bench editor** — `krea2_t2i_only.json`, 54 nodes, t2i
      only, Prompt Enhancement group out
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
- [x] Wired the four templates + `MpiAnySwitch` on **`Input_Recipe`** (renamed from
      `Input_Style`), and the `[CHARACTER PROMPT]` `StringReplace` fed by `Input_Positive`
      verbatim — nodes `666`-`672`, no in-graph enhancer. Verified offline: 62/62 nodes
      reachable, converter exit 0, substitution simulated ×4
- [x] `673 PreviewAny` titled `Output_prompt` points at the ASSEMBLED sheet prompt (MPI-242 contract)
- [x] First sheet generated — **1k + turbo, not 2k** (Fabio: placement is the test, quality is
      not, since the sheet feeds another model). 1280×768, seed 504504, 40s. Layout PASSES:
      two narrow bodies left (front + back), 3/4 portrait right, one continuous backdrop,
      wardrobe consistent, catch-light present. `Output_prompt` returned the ASSEMBLED prompt
      live (MPI-242 contract proven, not just converted)
- [~] **Rear-panel hair drifts** — A/B run. SYSTEMATIC, not seed luck (arm C: fresh seed, same
      wording, same brown wavy rear). Wording knob is real but partial (arm B: naming the colour
      in the rear clause moved brown → grey-streaked at the same seed; `straight` did nothing,
      texture stayed wavy). Colour responds, texture does not. Next: name colour AND texture in
      the TEMPLATE's global identity clause — RAN, NEGATIVE (arm D: no better than control).
      Settled: the knob is the character phrase's rear clause, so the fix is recipe payload and
      the template stays as written
- [x] **Hair named ONCE, in full** (Fabio's call) — RAN, **NEGATIVE**. Arm E put colour and texture
      in the MAIN clause with no repeat: rear sat `0.181` against the control's `0.182` at the same
      seed. Arm F then ran the untested cell (main clause in full AND arm B's rear repeat): `0.165`,
      i.e. the two repeating arms (B `0.161`, F `0.165`) are the only two that ever moved.
      **Fabio's "saying it twice confuses it" reading is disconfirmed** — repetition helps mildly.
      Reversing his call needs him, so nothing is adopted
- [x] **Rear-view texture IS a model limit** — wavy in every run, at every seed, under every
      wording, while the portrait renders it straight in the same frame. Four seeds, ~a dozen
      wordings. (Stated, withdrawn, re-established on arm K, withdrawn again when K failed to
      reproduce — both flips caused by n=1 at one seed. This version is the one to trust)
- [x] **Seed noise floor — Fabio's catch, and it invalidates the arm ranking.** Every arm was n=1
      at seed `504504`. F vs K over three fresh seeds: per-seed wins **2-2**, within-arm range
      (`-0.119…0.103`) an order of magnitude wider than the between-arm mean difference
      (`0.009` vs `0.014`). K's win is withdrawn; so is the whole G/I/K/L/M/N ranking. The metric
      also does not survive a seed change — composition shifts move the fixed sample boxes, and
      `F123123`'s portrait box landed on the red shirt (`0.289`), which is why its gap went negative
- [x] **The F shape DOES fix rear-panel colour, replicated at three seeds.** At `777001` control
      wording renders the rear brown, F wording renders it grey; same at `909090` and `123123`.
      **Seed `504504` is an unusually hard seed** and it is the only one the investigation ran on,
      which made a solved problem look unsolved for eleven arms
- [x] **Dead levers, do not retest:** the sheet template (arm D global clause AND arm G concrete
      panel-local clause, both no-ops), the negative prompt at 1k turbo (`72`/`162` are cfg `1.0`
      so `Input_Negative` is inert; only the quality path `311` at cfg `2.0` makes it live), and
      stronger texture words (`poker-straight` reads identically to `straight`)
- [ ] **Standing rule for this flow: one seed is a pilot, not a result.** Any wording verdict needs
      3-4 seeds compared per seed, visual verdict primary, numbers as support
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
