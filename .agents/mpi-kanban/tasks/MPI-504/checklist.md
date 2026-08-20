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
- [x] **v4.1 regression (session 4)** — the adopted F hair shape, four inputs × two seeds × three
      arms. The four v3 guarantees survive; category 4 did NOT land as prose (rear colour 2 of 8),
      a slot template fixed it (**v4.2**, 8 of 8) and is now the shipped recipe; **v4.3 disproved**
      (instruction example leaked, duplicate clauses) → research/enhancer-regression-2026-08-19.md
- [ ] Residual, Fabio's call: ~2 in 8 v4.2 outputs write `dark brown` in the main clause and
      `black` at the back. Accept the drift, or move the invariant out of the recipe — NOT more
      wording (v4.3 is the evidence)
- [ ] Generate a sheet from a v4.2 enhancer output — the 8-of-8 rear colour is measured in TEXT
      only; whether it moves the rendered rear panel is still open
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
- [x] **THE REAR-HAIR DEFECT WAS THE TEST RIG.** 2x2 grid, three seeds per cell, unanimous: turbo ON
      renders the rear hair wavy at BOTH 1k and 2k; turbo OFF renders it straight at BOTH. The
      2k-turbo cell is the control that settles it — same resolution as the fix, same defect as the
      rig. Resolution has no bearing on hair texture; the sampler path (8+3 steps cfg `1.0` vs 25+2
      cfg `2.0`) is the whole effect, and it reproduces at 1k so it is cheap to test (111s, not 328s)
- [x] **Seams at 2k-quality: ACCEPTED, not a defect** (Fabio) — the sheet splits into three plates
      with visible seams at 2k-quality where turbo keeps one continuous backdrop. The sheets still
      work as a reference, so the continuous-backdrop spec line is a preference here, not a gate
- [x] **Rig decision** (Fabio): realistic → **turbo OFF + 2k**; turbo → mainly the stylised styles;
      **both controls stay user-facing regardless** (low-VRAM users). Costs: 1k-turbo 33s ·
      2k-turbo 85s · 1k-quality ~105s · 2k-quality 328s
- [x] **Anime / cyberpunk style check — PASS at turbo, and it is the best sheet this card has made.**
      Nine runs, Recipe_Anime, three rigs x three seeds. 2k-turbo: crisp cel line art, continuous
      backdrop, every garment and gear item consistent across panels, circuit motif on the jacket
      back, hair straight black with pink ends in the REAR panel, catch-lights present — **and the
      turbo wave artefact does not appear at all**, so it is not universal. 2k-quality: sketchy line
      art AND **the rear panel put the hood up, hiding the hair** — a functional failure for a
      reference sheet. **Anime takes turbo ON** (Fabio). The ~105-word phrase overran the recipe's
      90-word ceiling with no failure, so length (open call #4) has a null result in its favour
- [x] **Turbo LOCKS the character, non-turbo VARIES it** (Fabio's observation, confirmed on this
      card's own runs): photoreal F wording at three seeds gives the SAME man under turbo and three
      visibly DIFFERENT men without it. So non-turbo is a **variation lever**, not merely a quality
      setting — it is how a user hunts for a face. This also partly explains the small between-arm
      deltas above: every wording arm ran under turbo, i.e. against a locked character
- [x] **Gate #1 PASSED 2026-08-19** — neutral-pronoun A/B against Fabio's original wording, one male
      character, 3 seeds at 1k-turbo + the shipping 2k-quality rig, 8 generations. Visually
      indistinguishable in all four cells; the `man`/`woman`-token fallback is NOT needed.
      Wording verified reaching the sampler per cell (8/8) via `673 Output_prompt`
- [x] **Head branch BUILT 2026-08-20** — the `Masking` group in `raw/flow_character_sheet.json` is
      filled, 14 nodes (`745`–`758`), nothing else in the file touched. `face_yolov8n` →
      `BboxDetectorSEGS` → `ImpactSEGSOrderedFilter` (area **ascending**, take 1 = the front body's
      head, never the big portrait) → the face box is **geometry only**, it sizes a scale-free crop
      (`MpiMaskSquareBbox` ×2 + one `MpiMath` `a * 4 // 5`, so the head box is 2.6× the face box at
      ANY `Input_Width`/`Input_Height`) → `SAM3_Detect` on `"hair, face, hat"` with
      `individual_masks: false` (**the union**; a hatless character just contributes no hat) →
      `SolidMask(0, W, H)` + `MaskComposite(add)` pastes it back full-size into `733 Set_inpaint
      mask`. No grow baked in — `690 GrowMaskWithBlur` and `721`/`718` already read it. The crop is
      `MpiBox` + `MpiBoxCrop`, because core `ImageCrop` is deprecated — caught by LOADING the graph
      in a browser, which every offline check had passed. Offline-verified, converts clean against
      live `/object_info`, loads clean in the editor; 631/631 tests
- [x] **Head branch RUNS — Fabio tested it live 2026-08-20**, 3-4 outputs, all succeeded, called
      ready to implement. He fixed one real bug in the process: with `Input_Remove_Head` OFF the
      branch ran anyway, because `688 PreviewImage` was UNMUTED and an output node is an execution
      ROOT (84-node upstream closure). Fix = `759 MpiBlocker` at the source + mute `688`. My 14
      nodes came back from his editor byte-identical in type/widgets/titles
- [ ] Head branch, remaining GPU questions (not blockers — it works): does the 2.6× crop ever reach
      a neighbouring panel on an unusual layout, and does the SAM3 union cover a tall hat
      **Only the bbox-AS-MASK is RETIRED** (Fabio 2026-08-19): a
      face-only mask fails on a hatted character (measured on the cowboy-movie work), hair over
      clothing needs a precise hair mask, and a box stamped on the head makes the inpaint model
      destroy and reinvent the clothing detail inside it. Must degrade to hair+face when the
      character has no hat
- [ ] Klein removal A/B — baked prompt vs the no-prompt remove op + crop/stitch
- [ ] All four styles return their medium and keep the pupil catch-light
- [ ] 10/10 stress test: ten generations, varied pose and light, next to a second character

## App wiring — after the graph proves out

- [x] **The prompt UI's FRAME half** (2026-08-20) — `kind: 'fields'` step + `action: 'enhance'`
      button field in `MpiBaseFlow`. No new component (a Flow carries no JS). All six of Fabio's
      rules verified in a running app; both prompts reach `flowInputs` and no seed is stored.
      Portable record: `docs/playbooks/add-flow/ui/prompt-enhance.md`
- [x] **Fabio's three button changes** (2026-08-20) — Enhance is an `MpiButton`, pink like
      Generate (measured identical: `255,126,182`), `enhance` icon left of the label, hovering to
      a new background; on the run slide it now sits directly UNDER the prompt box. `--accent-frost`
      is gone from the button. Screenshotted on all four run slides
- [x] **The enhancer OP** (2026-08-20) — `promptEnhance`, registered universal with
      `outputKind: 'text'` in the 4 files; graph converted, validated and RUN live.
- [x] **`Input_Seed` in the enhancer graph** (2026-08-20) — Option A: an `MpiInt` titled
      `Input_Seed` (node 14) linked into `3 TextGenerate`'s nested `sampling_mode.seed`
      (link 16). Fabio handed the raw/ edit over rather than doing it himself. Committed by
      `sync-raw-workflows.mjs` as `345bbdf8`; the API graph now reads
      `"sampling_mode.seed": ["14", 0]`. **Not yet proven LIVE** — see below.
- [x] **`/mpi-add-flow` — the wiring** (2026-08-20). `flowCharacterSheet` in the 4 files;
      `flow_character_sheet.json` converted (96 nodes off 146 raw) and validated; the
      `FlowDef` written with a `fields` refine step + the run slide, `Input_Recipe` as a
      4-option `select`. `npm test` 638/638, `release:check` passed, eslint clean.
- [x] **THE SEED IS PROVEN LIVE** (2026-08-20) — seeds 0/42/7777 on `a gunslinger` returned
      three distinct descriptions, and `execution_cached` covered nodes 5-10 but NOT
      `3 TextGenerate`, so the sampler re-ran because its seed input changed. Evidence in
      validation.md.
- [x] **The 1k/2k quality control — SHIPPED as the switch bank** (2026-08-20). One declared
      field cannot set two nodes, so the fan-out went in the GRAPH: `770 Input_Quality`
      (`MpiInt`) selects `771 Width_Select` + `772 Height_Select` (`MpiAnySwitch`), whose
      arms are `W_1k` 1280 / `W_2k` 1792 and `H_1k` 800 / `H_2k` 1120. Fabio's call —
      banks at `any_1..any_5` so MPI-586 gets four arms off the same shape. Zero app code.
      Portable record: `docs/playbooks/add-flow/ui/switch-bank-fields.md`. Commits
      `70dc98cb` (raw) + `96c5b410`.
- [x] **Live run — DONE** (2026-08-20, session 8). Own instance on 49251, project
      `MPI-504 sheet verify`. Flow READY, media-free step 0 renders, every declared field
      renders, both quality arms dispatch and land: `Input_Quality 1 -> 1280x800`,
      `2 -> 1792x1120`, verified off `/history` AND off the files on disk. Sheet correct at 1K
      (headless front, back, portrait with catch-light). Raw-prompt fallback proven — Enhance
      never pressed. Evidence + the one open observation (the 2K headless pass, confounded by
      seed) in validation.md.
- [ ] **The 2K headless A/B** — at 2K the front body came back with a pale head-shaped fill
      rather than a clean hollow collar, but the seeds differed, so resolution and seed are
      confounded. Needs one fixed-seed dispatch at both arms. Folds into the Klein removal A/B
      item above rather than standing alone.
- [ ] **Graphics** — `/mpi-flow-graphics` (playbook 06); `flow-character-sheet.webp` + hero.
- [ ] Decide the `krea2-nsfw`-only install case
