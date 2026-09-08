# MPI-607 Checklist

- [ ] Implementation
- [x] Step 2b - Qwen VoiceDesign -> Chatterbox clone chain runs end to end (PASSED - Fabio heard it, clones are spot-on)
- [x] Step 2b' - Qwen3-TTS VoiceDesign runs locally on the bench in an isolated transformers-4 runtime; option B core gate passed (quality awaiting Fabio's listen)
- [x] Step 2b' RESOLVED - Qwen NOT shipped; Chatterbox + self-authored library is the route
- [x] Accent via VoiceDesign - CLOSED NEGATIVE after 22 generations; American prior, not controllable
- [ ] Does a GENUINELY accented reference survive Chatterbox? (all tests so far used accent-free refs)
- [x] Multilingual clone durations RESOLVED - same cause as the trailing noise, not a separate defect.
      Warm, multilingual costs ~1s over base (8.0s vs 7.1s); the 18-21s runs are exactly the ones that
      fail to stop and decode to the cap. The cold measurement that suggested otherwise was model LOAD
- [x] Emotion transfer - WORKS at cfg_weight 0.3 (node default 0.5 suppresses it)
- [ ] Library size decider - does emotional TEXT on a NEUTRAL voice work at cfg 0.3? (mpi607_emotion3)
- [x] Speaker-similarity QA gate built (research/speaker_similarity.py, CAMPPlus cosine)
- [x] Identity holds across emotions IF acoustic lines frozen - voice-dependent, gate every variant
- [x] VC pipeline PASSES at exaggeration 1.2 - architecture settled: ~60 neutral + ~5 performance clips
- [ ] Library taxonomy - ~60 voices, gender x age x type, tags not folders (brainstorm, not started)
- [ ] Author the performance clips - the quality lever; iterate until each drives strong emotion
- [ ] Step 3 SHIP CHATTERBOX - unblocked all day, needs nothing above settled
  - [x] Gate 1a - node pack pinned (ComfyUI_Fill-ChatterBox @ 596850bc, installRequirements true)
  - [x] Gate 1b - python deps: 6 declared leaves + resemble-perth added, lock regenerated, --check clean
  - [x] Gate 1c - 7 weight deps as targetPath (the RIFE mechanism), sha256 + byte counts verified against HF
  - [x] Gate 1d - yamlHelper skips targetPath deps (killed 8 junk folder keys incl. the pre-existing rife47.pth)
  - [x] Gate 1e - import coverage: every module the shipped TTS+VC path imports is in the curated set
  - [x] Gate 2 FLOW A - Voice Changer BUILT: graph (5 nodes) + op in 4 files + FlowDef, 1.057GB, requiredDeps x3. npm test 728/728
  - [~] Gate 2 FLOW A verify - GRAPH proven live on the bench (12.1s, execution_cached [], real flac out). APP path (install button -> gallery card -> save path -> group type) still unrun; Fabio listens
  - [ ] Gate 2 FLOW A - user guidance copy, 4 rules: perform don't push / pick a target unlike you / meet its pitch / hold that pitch steady
  - [ ] Gate 2 FLOW A - copy should SELL the passthrough: your laugh, breath and timing in someone else's voice (Flow B cannot do this)
  - [x] Gate 2 FLOW A - install RAN from the app: 1.0GB landed byte-exact. Found+fixed a REAL bug - _localModelsCheck ignored dep.targetPath, so the weights read not-installed forever (stuck 100% bar). npm test 729/729
  - [x] REMOTE twin FIXED (Fabio approved): _isImageResident now needs targetPath AND bakedOnPod; rife47 carries the flag. Chatterbox reports MISSING on remote = fails closed. Logic + full-registry sweep, no Pod rented
  - [ ] Flow A on REMOTE still unsupported: the wrapper cannot install a targetPath weight, and FL_ChatterboxVC is not in the Pod image. Decide later: bake, or teach the wrapper a targetPath destination
  - [ ] Gate 2 FLOW A - UI: record button (MPI-573 recorder) + voice selector from the library + custom-voice library item. NOT designed yet
  - [~] Gate 2 FLOW B - Text to Speech. **GRAPH SHAPE PROVEN ON THE BENCH 2026-08-27, 4/4 quadrants.**
        Shape approved by Fabio: TWO independent axes (accent picks the MODEL, emotion picks the
        REFERENCE and whether VC runs) = four routes, fanned out in the GRAPH as MpiAnySwitch banks
        off two MpiInts. Zero app code for the fan-out. `research/flow_b_graph_probe.py`.
        Proven, not assumed: the switch is LAZY (a straight read runs with an EMPTY perf-clip loader
        and `block_if_empty` armed, and it does not fire); `*` links into AUDIO and FLOAT inputs; and
        all four outputs are DISTINCT (4/4 sha256, envelope r 0.07-0.48) - which is the check that
        matters, since a lost selector silently pins every run to any_1 and still succeeds.
        Performance clips are NOT a blocker any more: 30 shipped by MPI-622.
        STILL TO DO: op in 4 files, FlowDef, the app-side perf-clip resolver, the raw/ LiteGraph file,
        and the multilingual dep entries.
  - [~] Gate 2 FLOW B - **the axis is LANGUAGE, not accent** (Fabio, 2026-08-27). Multilingual runs for
        any language that is NOT English and is NOT an accent creator: Portuguese text through the BASE
        model is unusable ("an English person trying to speak Portuguese very badly"), through
        multilingual-with-Portuguese it is real Brazilian Portuguese. Accent-on-English was measured and
        does NOT dependably work - true, but it was the wrong question and nearly deleted a model the
        product needs. **`language` is a COMBO and REFUSES a link** (`received_type(STRING) mismatch
        input_type([...23])`), so the literal is BAKED one arm per SHIPPED language and the app injects
        only the selector INT. Latin-script languages need no extra deps; ja/he/ru/zh each need their
        tokenizer dep (pykakasi / dicta_onnx / russian_text_stresser / spacy_pkuseg), none in the lock.
        TWO THINGS STILL NEED FABIO: which languages ship, and whether the 3.2GB multilingual set is
        bundled or an optional install (his own parked question - `requiredDeps` cannot express optional).
  - [ ] 🔴 Gate 2 FLOW B - **the node's language labels are upstream's and at least one LIES.**
        `Portuguese (pt)` reads as European Portuguese and delivers **Brazilian** (Fabio, by ear:
        "very different ... only because of the accent"). Bare ISO 639-1 codes carry no variant, so
        `Spanish (es)`, `Chinese (zh)`, `Norwegian (no)` and even the default `English (en)` are
        unverified on the same grounds. EVERY shipped language gets its variant confirmed BY EAR and
        the label names what was heard ("Portuguese (Brazil)"). Unconfirmed = does not ship, or ships
        claiming no variant. Same rule MPI-622 set for `accent`: a wrong label is worse than a missing
        one. Costs nothing - the combo refuses a link, so each language is a hand-added arm anyway
  - [ ] 🔴 Gate 2 FLOW B - **the emotion recipe is NOT validated on the multilingual model.** exag 1.2 /
        cfg 0.3 is a BASE-model finding; only `repetition_penalty` 1.5 was measured on multilingual, and
        min_p/top_p/temperature are node defaults held fixed. Warning sign already logged: q4 ran
        multilingual + an angry clip at 1.2/0.3 and Fabio heard no emotion. Sweep exag x cfg on a real
        non-English line before wiring the op - do NOT carry the base numbers across, that is the exact
        error that produced q3's missing accent
  - [x] Perth marking APPLIED - proven on this flow's own output: watermark 1.0 vs 0.0 on the source control
- [x] Turbo - NOT SHIPPED. Reason is REDUNDANCY, not weakness: VC passes laughs/coughs/shushes through natively, so the tags win nothing, and a tuned baseline would need a node patch. NOT measured fairly - the node hides exaggeration + cfg_weight and runs both at 0.0
- [x] VC passes NON-VERBAL sound through (cough, shush) - Flow A exclusive, Flow B structurally cannot
- [x] Pitch: matching the target helps (confirmed); pitch DRIFT within a take drifts the output
- [x] Accent IS a runtime parameter (multilingual `language` selector) - library needs no accent axis
- [x] Accent SURVIVES VC - and comes from the SOURCE, not the target. One source into two cross-gender targets (218.8Hz female, 125.7Hz gravel male) gave the SAME accent. Flow B gate opens. Evidence: MPI-622/validation.md 2026-08-25 phase0e
- [x] **Multilingual trailing noise SOLVED - `repetition_penalty` 2.0 is the cause. SHIP 1.5** (fallback 1.2).
      24 warm runs, 6 seeds x 4 configs: 3/6 overshoot at the default (4.97 / 11.18 / 11.97s against a 3.90s
      base), two with tails 2.65x and 3.05x flatter than their own body and ~0 voiced frames = hiss. 0/12
      failures at 1.5 or 1.2. Bake it in the graph, not a user control. Flow B's ACCENT path is unblocked.
      `research/mtl_repetition_sweep.py`; detail + the two measurement traps in validation.md 2026-08-27
