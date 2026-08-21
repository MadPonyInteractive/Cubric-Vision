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
- [x] **Residual — ACCEPT the drift. Settled on evidence 2026-08-20, no recipe change.** The
      contradicting phrase was rendered at three seeds and its rear panel is indistinguishable
      from its own portrait: the two colours the recipe confuses (`dark brown` / `black`) are the
      two that look the same, so the drift is real in the text and invisible in the image.
      Caveat kept: every contradiction v4.2 has produced is dark-brown → black in 16 samples; a
      `red` → `black` one WOULD show and this verdict would not cover it
- [x] **The rear clause MOVES THE RENDERED PANEL — 3 of 3** (2026-08-20). Fed the enhancer's
      own v4.2 output (`red hair long and wavy … the red wavy hair hangs loose at the back`) at
      1k-quality: the rear panel comes back a copper braid at every seed, matching its portrait.
      The 8-of-8 rear colour measured in TEXT carries through to pixels
- [x] **Re-run against the BUILT graph — DONE 2026-08-20**, and it found the reason the item
      mattered: `qwen3vl_4b_prompt_enhancer.json` was carrying the **pre-v4.1 recipe** (3885
      chars against prompts.md's 4239), missing both v4.x hair edits. Nothing injects the
      recipe — `_runEnhance` sends only `Input_Seed` — so the BAKED text is what the Enhance
      button runs, and users were getting v3-era phrasing. Re-synced from prompts.md (raw
      `796060bf`). The regression then ran through the shipped file, 4 inputs × 2 seeds:
      **positive-phrasing-only 8 of 8** (the scrub nodes carry it live; the recipe alone has
      never once managed it), 45-90 words 8 of 8, rear colour 8 of 8, colour AND texture 5 of 8,
      contradiction 2 of 8 — every number replicating the recipe-only measurements

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
- [x] **Head branch open questions — BOTH ANSWERED 2026-08-20.** A full stovepipe top hat IS
      covered: three seeds on a frock-coated undertaker at 1k-turbo, head and hat gone together,
      collar and waistcoat intact, and the 2.6× crop cleared the crown with room. The crop never
      reached a neighbouring panel in any run. **But a third question nobody had asked turned out
      to be the real one — see the 2K headless A/B below: the DETECTOR picks the wrong head**
      **Only the bbox-AS-MASK is RETIRED** (Fabio 2026-08-19): a
      face-only mask fails on a hatted character (measured on the cowboy-movie work), hair over
      clothing needs a precise hair mask, and a box stamped on the head makes the inpaint model
      destroy and reinvent the clothing detail inside it. Must degrade to hair+face when the
      character has no hat
- [x] **Klein removal A/B — RUN, and the "no prompt" half is DISPROVED. Do not retry it**
      (2026-08-20). 2×2 of prompt × steps, three seeds, hat character at 1k-turbo. Swapping
      `712` to the outpaint LoRA's instance prompt `"Fill the green spaces according to the
      image"` makes the model **paint a whole new head back**, green plate still showing, at
      BOTH 2 and 4 steps, 3 of 3 seeds. `docs/models/klein/removal.md` is right for generic
      object removal and does not transfer here: the surround is a person with a collar, so
      "fill according to the image" reads as *reconstruct the head*. The shipped sentence is
      the only thing saying BACKDROP. `712` keeps its text, `704` keeps `steps: 2` (4 was
      indistinguishable). Full table in validation.md
- [x] **All four styles return their medium and keep the catch-light — 2026-08-20.** One
      character (a copper-braided ranger), each style at its shipping rig, two seeds each:
      Photoreal 2k-quality (pores, film-real), 3D 2k-turbo (subsurface skin, groomed hair),
      Anime 2k-turbo (cel line art), Cartoon 2k-turbo (bold outlines, flat fills). Catch-light
      present in all eight. **Incidental and load-bearing: the LAYOUT MIRRORS** — 3 of the 4
      styles at seed 820001 put the portrait on the LEFT and both bodies on the right, and 3D
      then came back un-mirrored at seed 820002. The template's "right half … portrait" is a
      preference the model takes or leaves, so no rule may assume panel ORDER
- [x] **10/10 stress test — RUN 2026-08-21 AND PASSED** on the scope Fabio set (prove the branch
      never picks the BACK OF THE HEAD, not the brief's "ten poses ten lights"; this flow emits one
      fixed thing). Ten characters, ten seeds, all four recipes at 2k-quality: the back of the head
      was never picked, and the far-left figure faced camera 10 of 10. The single removal failure
      was the EMPTY-DETECTION case, not a mispick.
- [x] **Head branch REDESIGNED and VERIFIED 2026-08-21, session 12** — the stress test's one
      failure drove it. Stage 1 deleted (`745`/`746` face_yolov8n, `747`/`773` SEGS filters,
      `748`, `749`/`751` MpiMaskSquareBbox, `750` MpiMath — 8 nodes); `774 MpiMath` (`a // 4`
      off `743 Get_W`) now drives `752 MpiBox` to a fixed left-25% region, `744 Get_H` gives the
      height, and the crop/paste-back sit at 0,0. `754` vocabulary is `head, hat`.
      > **NOT via `SAM3_Detect.bboxes`, and do not re-try it on the tooltip's word.** That input
      > is a detector PROMPT, not a region restriction — with text conditioning the dedicated box
      > path is skipped (`nodes_sam3.py:192`) and the boxes are concatenated onto the text
      > embeddings (`detector.py:436-450`). It would have biased the pick, not confined it.
      >
      > 4 bench runs, 4 of 4, portrait and rear figure intact in all: the cartoon zero-face case
      > that previously destroyed a portrait passes; the mail coif that `hair, face, hat` destroyed
      > survives; a waist-length braid is removed cleanly (closing the open long-hair question);
      > 2k verified. Offline: byte-exact round trip, pos/size unmoved, 48188 schema check,
      > `validate-injection-rules` clean, `npm test` 657/657. Detail in `validation.md` § session 12.
- [ ] Run `sync-raw-workflows.mjs` — blocked only by Fabio's staged `comfy_workflows/flow_outpaint.json`
      (its guard refuses while any generated workflow is uncommitted). The direct converter produced
      the runtime API in the meantime; for a non-template workflow that is the same output.

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
- [x] **The 2K headless A/B — RAN, and it was TWO faults wearing one symptom** (2026-08-20).
      Fixed seed at both arms, three seeds. **Fault 1, the PICK, is fixed and shipped.**
      `747`'s area-ascending "smallest face = the front body's head" inverts whenever the rear
      figure's head is turned enough for `face_yolov8n` to see a face — its box is SMALLER than
      the true frontal one, so the sheet comes back with the REAR view decapitated (measured at
      seed `504504`: head box origin x=559 at 2K against x=20 at 1K). Replaced with **rule B**
      (Fabio's call): `747` area DESCENDING take_start 1 drops the portrait, new node `773`
      takes the highest CONFIDENCE of what remains. Both halves are intrinsic — the template
      does prescribe the portrait's half, and `face_yolov8n` IS a frontal-face detector.
      "Leftmost" was considered and killed by evidence: 3 of the 4 styles mirror the layout.
      Raw `1e6ba5cc`; verified live at 2K, `504504` moved rear → front, `8958563981589` stayed
      correct. **Fault 2, the FILL, is still open** — see the mask-edge item below.
- [x] **The FILL ghost — FIXED and shipped** (2026-08-20, `49d9fc37`). It was TWO REMNANTS, not
      a bad fill. (1) `718.mask_expand_pixels` 6 → **40**: the SAM3 union left a rim of head
      outside `threshold 0.5`, so the green plate never destroyed it and the model repainted the
      head it could still see. (2) `754` SAM3 vocabulary `"hair, face, hat"` → **`"hair, face,
      hat, neck"`** — there was no NECK in it, so on an open collar the neck survived as skin in
      the collar. Verified at BOTH rigs against matched controls: 2k-quality scavenger 3 of 3
      clean, 1k-turbo hatted undertaker 3 of 3 clean, collar and shoulders intact in all six;
      the control produced zero clean sheets. **Dead ends, do not re-derive:** `mask_blend_pixels`
      32→4 and `mask_hipass_filter` 0.1→0.9 (both WORSE — binarising sharpens the ghost, which is
      what ruled out the feather), pass-2 denoise 0.25/0.15 (no change, which is what proved it a
      remnant), `expand: 56` (works, wastes headroom)
- [x] **The Enhance dead-box — FIXED** (2026-08-20, session 9). `MpiInput` gained `el.setValue`,
      the write API it had never had while the driven Primitives all do; `_writeFieldValue` calls it
      instead of setting `.value` on the mount host div. Guarded by
      `tests/desktop/flow-enhance-writes-textarea.spec.js`, MUTATION-TESTED red against the old
      line. Fixes the empty phrase box AND clear-on-edit in one change.
- [x] **Toggles are icon+label MpiButtons** (2026-08-20, session 9). The `toggle` TYPE changed, so
      there is one on/off vocabulary; icon optional (tick fallback); no caption above. Turbo →
      `bolt`, Headless front body → `eraser`. Guarded by
      `tests/desktop/flow-toggle-is-a-button.spec.js`, mutation-tested red with `onChange` cut.
- [x] **The LoRA panel — DONE** (2026-08-20, session 9). Fabio's correction: open the app's WHOLE
      Model Settings panel, not lift its rack. `settingsModel: 'krea2'` + an `action: 'settings'`
      button; the flow emits `ui:open-model-settings` and the owning Block opens its overlay (BOTH
      Blocks wired — each mounts its own). No new field type, no `lora` type, no extraction.
      **Plus the half that made it real:** a flow injected NO LoRAs at all, so `loraModelId` now
      crosses flowService → the `runCommand` whitelist → `Lora_N` → `Input_Lora_N`. Guarded by
      `tests/flow-lora-rack.test.cjs` (6 assertions on the chain + the twin Blocks) and
      `tests/desktop/flow-lora-button.spec.js` (the button emits with the right model id).
      Portable record: `docs/playbooks/add-flow/ui/lora-rack.md`. "A new route for flow LoRAs" was
      NOT built — unnecessary under the shared-model-settings reading; see plan.md.
- [x] **LANDED — `f28825ee`, 33 files. Do NOT re-do this.** The commit that was blocked is in.
      The blocker was cleared at the root rather than bypassed: the five bare `<button>`s in
      `MpiBaseFlow.js` (back link, both carousel arrows, ticker tick, slot clear) are now ghost
      `MpiButton`s, mounted rather than written into the `template:` string, with the ids moved
      onto the mounted `<button>` so `#flow-prev` / `#flow-next` still answer a spec's `.click()`.
      Their CSS shrank to geometry + typography; the four deliberate overrides are scoped past
      the Primitive's selectors instead of relying on stylesheet load order. The hook PASSED —
      no `--no-verify`. Verified: eslint 0 warnings on all 10 committed js files at
      `--max-warnings=0`, npm test 646/646, test:desktop 21/21, release:check, plus a pixel probe
      on a real renderer (all four read back as `BUTTON`, back icon 12px, tick lowercase at
      weight 400, disabled arrow `opacity: 0` with no grayscale filter). File claim `62a1b83a`
      is released. `js/data/modelConstants/models.js` was correctly left out — still another
      session's uncommitted work.
- [x] **Graphics** — `/mpi-flow-graphics` (playbook 06); `flow-character-sheet.webp` (129 KB,
      896×1120) + `flow-character-sheet.mp4` (672 KB, 1280×800, 4.96 s), and the `video` field
      the FlowDef never had. Both cut from Fabio's own sheets in `MPI-504 sheet verify` — 001
      (photoreal) for the tile, 001 + 003 + 007 for the hero; 005 was rejected for a ghost-head
      artifact on its front body.
      > **PAIRED WITH MPI-584 (Fabio, 2026-08-20).** One session covered BOTH flows' art — this
      > card's, and MPI-584's `flow-ltx-upscale.webp` + `.mp4`. The throwaway project
      > `MPI-504 sheet verify` in Fabio's real Projects folder is KEPT ON PURPOSE as graphics
      > source (two proof sheets) — do not delete it.
      >
      > THE TILE IS A RECOMPOSITION, not a crop, and that is forced: the sheet is 8:5 with three
      > panels, so a 4/5 `cover` keeps the portrait alone and the flow becomes indistinguishable
      > from a model preview. The shipped tile is the portrait with both body views as a left
      > rail, each rail cell given the body panel's own aspect so nothing floats in grey (the
      > first attempt, portrait over a row of two bodies, did float — visible in the live grid).
      >
      > THE HERO HAS NO BEFORE/AFTER because nothing is transformed — the flow CREATES. It
      > teaches the LAYOUT instead: the three panels fade in one at a time over the studio grey,
      > then whole sheets crossfade so the grid holds while the character changes, and it starts
      > and ends on bare grey so the loop point is invisible. New device row in playbook 06.
      >
      > LIVE-VERIFIED on my own isolated instance: both assets 200 with exact byte counts, and
      > the hero `paused:false` `muted` `loop` with `currentTime` rising at a measured 444 px
      > wide — a real visible mount, not the hidden-overlay false pass the playbook warns about.
- [ ] Decide the `krea2-nsfw`-only install case
