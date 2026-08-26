# Voice library — the character + performance clip library the TTS/VC flows select from

## Current State

**Project mode:** `scalable-foundation`.

> **Session 20 note (2026-08-26) — THE LIBRARY IS COMPLETE AT 60. Supersedes everything below.**
> `elderly_high.py` ran; its three candidates measured 118.2 / 129.7 / 98.3 Hz. Fabio approved
> the two in-band ones — **`elderly_male_3` (TTS seed 9201, via the `deep_male_4` throat) and
> `elderly_male_4` (seed 9202, via `standard_male_2`)**. `3e` at 98.3 Hz was dropped as under
> the band, consistent with the earlier 110.3 Hz verdict of "too low, muffled". The four old
> rejects (seed 9001, `_3a`, `_3b`, seed 9002) plus `3e` were moved — **not deleted** — to
> `%LOCALAPPDATA%/cubric-vision/mpi622/rejected_v2/`. Verified: **12 categories × 5 = 60 wav,
> every one with its sidecar.** Audition page `eld-final.html`; builder `prep_eld_final.py`.
>
> **THE BENCH'S IDLE 4 GB IS SOLVED, AND IT WAS OURS.** `ComfyUI_Fill-ChatterBox` keeps models
> in `_MODEL_CACHE`, a plain **module-level dict** (`chatterbox_node.py:53`) that is never
> registered with ComfyUI's `model_management` — so `POST /free` returns 200 having found
> nothing to evict, which is exactly the symptom Fabio reported. Measured: boot is clean
> (+160 MiB, all node imports ≤3.9 s), and the 4.06 GB appears only *after* a run with
> `keep_model_loaded: true`. **The shipped Flow is SAFE** — `comfy_workflows/flow_voice_changer.json`
> and its raw twin both set `keep_model_loaded: false`, and `false` is the node's own default.
> Only our bench scripts passed `true`; `vc_test.py` and `elderly_tts.py` are now `False`.
> Read `torch_vram_total` out of `/system_stats` to see the retention — `nvidia-smi` alone
> cannot attribute it, because WDDM reports no per-process VRAM on this machine.
>
> **THE KYUTAI CORPUS IS OUT OF THE BUNDLE AND THE LIBRARY IS IN** (commits `12174bc1`,
> `beabe98f`). The 60 curated opus were removed and `manifest.voices` emptied, then refilled by
> a new **`ingest.py --from-dir`** local-import mode: trim → level → measure → opus, category
> from the `.txt` sidecar, register from the MEASURED f0. **12/12 `check_manifest.mjs`, 8/8
> `voice-library.test.cjs`, bundle 3.46 MB, spread R1:22 R2:10 R3:13 R4:5 R5:10.**
>
> **TWO PENDING ITEMS WERE WRONG ABOUT THE CODE.** (1) "Move the sustained-energy trim into
> `ingest.py`, librosa's `trim(top_db=35)` is the thing it replaces" — `ingest.py` had **no
> trim at all**; it was added, not moved. (2) "Import lib_v2 **through** `ingest.py`" — that
> script is a kyutai HuggingFace *downloader* end to end (`fetch_voice_ids`, `--ids-file`
> filtering against the corpus listing), with no local path. A new mode had to be written.
>
> **R1's FLOOR WENT 90 → 70 Hz** in all three mirrors (`ingest.py`, `js/data/voiceLibrary.js`,
> `research/pitch_tools.py`), on Fabio's call. Six VoiceDesign voices measure 79.2–89.4 Hz —
> four of them the whole `narrator_trailer` category, which is *meant* to be that deep — and at
> 90 they were unclassifiable, so the first import silently shipped **54, not 60**. An R0 band
> was the alternative and was rejected: no R0 performance grid exists, so those six would ship
> unable to do emotions. The two hardcoded 90s left in message paths now read `REGISTERS[0][1]`.
>
> **STILL OPEN: `voices[].licence` is `null` on all 60.** `VOICEDESIGN_LICENCE` in `ingest.py`
> carries a TODO — Fabio to confirm what licence a Qwen3-TTS VoiceDesign *output* carries. Not
> guessed, because MiniMax H3 proved a model licence can bind Outputs and restrict territory.
> Also now dead: `ingest.py`'s whole download/curate half, and `voices/curated.txt`, whose header
> still claims "the ~60 voices that SHIP".
>
> **NOT OURS, pre-existing at HEAD:** `tests/orphan-sweep.test.cjs` "collects a dep no installed
> model wants" fails. Its import graph (`downloadManager` → `dependencies` → `models`) contains
> no file this card touched.
>
> **A SEVENTH METRIC LOST TO THE EAR.** Fabio heard "huge pitch oscillations" in the three VC
> intermediates and called the three finals fine; a smoothed-f0 wobble measure ranked the
> intermediates *no worse than* the finals, and flagged his own two recordings as the wobbliest
> files in the set. It did settle the one question that mattered — the three library targets
> are not outliers, so no shipped voice needs re-rolling — but it could not see what he heard.
> The intermediates are throwaway anyway: trimmed to 2 s as a TTS reference, they never ship.

> **Session 19 note (2026-08-26) — PAUSED MID-GENERATION, supersedes everything below.**
> **THE EAR GATE IS PASSED. 11 of 12 categories are approved.** Fabio's convention was
> misread by session 18: *he only names what he dislikes, silence means fine.* So the "seven
> unjudged" were never unjudged — they passed. **Approved 8** (library v1 takes stand):
> `deep_male` `standard_male` `young_male` `narrator_trailer` `standard_female`
> `young_female` `cartoon_critter` `villain_menacing`.
>
> **matrix-v2 fixed 3 of the 4 rejects** — `child` (v2 and v3 both fine, seed 7311 bad),
> `elderly_female` and `mature_female` (both `v2_correlates`, both seeds). Those three
> categories need their `v2_correlates` / `v2_lower` wording swapped into `PERSONAS` before
> their five are generated. **`elderly_male` is the one category the model never solved** —
> it starts old and slides young mid-clip.
>
> **JITTER IS RETIRED AS AN AGE METRIC.** It read 2.7–3.4% across Fabio's real 85-year-old,
> his 75-year-old, and a model clip he called "sounds 25". It also predicted age wording
> would not work, and his ear then fixed three categories with wording alone. Fourth time a
> number lost to the ear on this card.
>
> **FABIO RECORDED `elderly_male` HIMSELF** — `recording_011.wav` (he calls it 70–80) and
> `recording_015.wav` (80–90, "trouble speaking because he's so old"), trimmed and levelled
> to −20 dBFS `rms_active` in `%LOCALAPPDATA%/cubric-vision/mpi622/takes_lvl/`.
> **015 measures 215.6 Hz — that is R3, not R1**, and it is not a defect: male f0 *rises* in
> old age as the folds atrophy. `elderly_male` therefore spans two registers; 011 → R1 grid,
> 015 → R3 grid.
>
> **PAUSED 2026-08-26: Fabio needed the GPU for another session.** The 32-voice run for the
> approved 8 stopped after 5. `deep_male_2..5` is COMPLETE; `standard_male_2` is partial.
> Output dir `%LOCALAPPDATA%/cubric-vision/mpi622/lib_v2/`. **Resume by dropping `deep_male`
> from `--only`** (seeds are deterministic, so re-running `standard_male_2` reproduces the
> same file — harmless):
> `library_personas.py <lib_v2> 4 --start 1 --only standard_male,young_male,narrator_trailer,standard_female,young_female,cartoon_critter,villain_menacing`
>
> **Two root fixes landed in `research/library_personas.py` first, both real:** `ci` took its
> value from the *filtered* persona list, so `--only` shifted every category's seed block
> onto another category's; and `VILLAIN_VARIANTS` was defined but never read, so the villain
> category would have shipped one direction five times.
>
> **STILL OPEN: the VC variation test**, Fabio's own suggestion — his take as VC source onto
> approved targets, to get five distinct old men rather than one man pitch-shifted five ways.
> The question it has to answer first: Chatterbox VC takes prosody from the source and
> **timbre from the target**, and rasp/thin-reedy throat are timbre — so does 85 survive the
> transfer, or come back 40 with an old man's rhythm? If age dies, the answer is VoiceDesign
> old-man attempts as targets first, then his take for delivery.

> **Session 18 LATE note (2026-08-26) — THIS SUPERSEDES THE SESSION 18 NOTE BELOW.**
> **THE KYUTAI CORPUS IS REJECTED IN FULL.** Fabio auditioned all 60: *"I think 99% of this
> voice library is garbage... none of it is usable."* Accents unintelligible, mic quality poor,
> the cartoon a bad impersonation, and R4/R5 one voice each. The curation could not have caught
> it — `voiced_frac`/`snr_proxy` measure SIGNAL, not SPEECH, and the deciding attribute
> (accent) is the one field the design forbids inferring. Detail in `validation.md`.
>
> **SOURCE IS NOW Qwen3-TTS VoiceDesign** — a promotion of `brief.md` § Sourcing's own "long
> game", not a pivot. **TAXONOMY APPROVED: 12 categories x 5 = 60**, category 12 renamed
> **Villain / menacing** (the only mixed-gender one). Robot AND creature/monster are both
> POST-FX, not TTS, and need no library slot.
>
> **THE NEXT ACTION IS FABIO'S EAR, on two pages already built** (paths in the handoff):
> `library-v1.html` — 12 voices, one per category, **7 still unjudged**
> (`deep_male`, `standard_male`, `young_male`, `narrator_trailer`, `standard_female`,
> `young_female`, `cartoon_critter`); and `matrix-v2.html` — 4 failing categories x 3 wordings
> x 2 seeds, v1 kept as the control.
>
> **Only APPROVED categories get their remaining four generated.** That ear-first gate is the
> correction for the corpus failure and it is Fabio's own suggestion — do not generate 60
> voices before it.
>
> Matrix result in one line: **pitch responds to wording (child fixed: 509.8 → 326.8 Hz, low-end
> body back from 0.0% to 16.6%), age does NOT** (jitter 2.29–4.42% across every wording).

> **Session 18 note (2026-08-26) — READ THIS FIRST, it supersedes the session 17 note below.**
> **The curation pass is DONE and the real import has run: 60 voices ship**, selected from all
> 227 usable of the 228 CC0 kyutai donations. 12/12 contract checks, 737/737, byte-identical on
> re-run, 3.05 MB. The 12 emotion clips are untouched and still verified in the manifest.
>
> **THE HEADLINE FINDING IS A SOURCING GAP, NOT A SELECTION ONE.** Measured across all 227:
> **R1 131 · R2 62 · R3 17 · R4 1 · R5 1 · below 90 Hz 15.** The corpus is overwhelmingly
> low-male. R4 is ONE voice (`Aon` 263.2 Hz) and R5 is ONE (`Glenn` 365.9 Hz), so **"register
> spread across R1–R5" is not achievable from this source at any selection strategy.** R3/R4/R5
> were taken WHOLE; R1 and R2 were quota'd down so the bundle corrects the corpus bias rather
> than reproducing it (R1 58% of corpus → 43% of bundle; R3 7% → 28%).
>
> **Two decisions are open and both are Fabio's** (neither blocks Phase 3):
> (1) **15 voices sit below R1's 90 Hz floor** (60.7–89.4 Hz) and the `brief.md` § 2 band table
> has no home for them — extend R1's floor, add an R0, or leave them out? They were EXCLUDED
> rather than silently filed under R1, because that is what the old code did and it would now
> fail contract check 4. (2) **R4/R5 have one voice each** — child and cartoon character voices
> effectively do not exist here.
>
> **`kind: "both"` on all 60 is NOT the defect the session-17 handoff suspected.** A real human
> clip genuinely serves both the direct-TTS and the VC-target route, so the filter is inert
> because the corpus is *uniform*, not because the import is wrong. Nothing was invented from
> measurements — same rule that keeps `accent` null.
>
> **Two defects were found and root-fixed, neither reported by anything.** The import hardcoded
> `performanceClips: []`, so the NEXT import of any kind would have silently deleted all twelve
> authored Phase 2 clips and left a well-formed manifest behind. And my own f0-quartile
> spreading was a stride (`by_f0[i::4]`), not a quartile — the opposite of spreading, and it made
> `curated.txt` claim a rationale the code never applied. Detail in `validation.md`.
>
> **Next: Phase 3 auditions.** Do NOT re-open the emotion grid; all 12 cells are accepted.

> **Session 17 note (2026-08-25) — READ THIS FIRST, it supersedes the session 16 note below.**
> The Parallel Batch is DONE (import pipeline + `MpiVoicePicker`, both verified independently
> of their worker reports) and **Phase 2's 12 clips are AUTHORED**. Nothing on this card is
> blocked and nothing is waiting on Fabio except two listening calls and the `register`
> wording in brief.md § 2.
>
> **The single next action is Fabio's ear, on two named asks** (control + axis both named,
> level-matched set at `scratchpad/phase2_clips_lvl/`): (1) do the six R1 clips read as their
> labels, and (2) do `perf_R1_neutral` (94.7 Hz) and `perf_R1_angry` (167.3 Hz) sound like the
> SAME PERSON. Ask 2 exists because of a new measurement: emotion-driven pitch lift is
> **register-asymmetric ~2:1** — R1 lifts +9.9/+11.6 st for angry/cheerful where R3 lifts only
> +4.8/+4.4 st from identical prompt grammar. If one R1 character ever sounds like two people
> across the emotion set, that asymmetry is the cause and R1 is where it shows first.
>
> ~~After that: a CURATION pass before the full 228 import~~ — **DONE, see the session 18 note
> above.** The kind filter being inert turned out not to be an import defect.
>
> **Do NOT "repair" the angry and cheerful clips** because they measure out of band. The pitch
> lift IS the emotion; `register` names the performer's baseline. The proof the persona prompt
> worked is that all eight low-arousal cells landed in band.

> **Session 16 note (2026-08-25).** Phase 0 RESOLVED on option 1, D1/D2 answered, Phase 1
> SHIPPED (737/737, eslint clean), and the overdue voice-changer guidance rewrite is done.
> Three of my own hypotheses died on the way and all three are recorded as wrong in
> `validation.md` rather than dropped -- VC-corrupts-phonemes, the pitch-direction rule, and
> voiced-density. **The one thing that now BLOCKS Phase 2 is an accent decision**: VC
> overwrites the target's accent with the source's, so whoever records the performance clips
> sets the accent of every `character` voice in the library. Next work is the Parallel Batch
> (import pipeline + `MpiVoicePicker`), which Phase 1 already unblocks. **The accent decision
> landed before the handoff closed: the clip grid is AUTHORED with VoiceDesign, not recorded,
> so Phase 2 is unblocked too.**

The approved design is `brief.md` in this folder and it is the source of truth. Do not
re-derive it, and do not re-run the listening tests — they are done and recorded in
`../MPI-607/validation.md` (2026-08-25 entries).

What is already true:

- **Flow A (`voice-changer`) ships and works** — `js/data/flowsRegistry.js` ~line 1186,
  operation `flowVoiceChanger`, graph `comfy_workflows/flow_voice_changer.json`, deps
  `chatterbox-vc-s3gen` + `chatterbox-vc-conds` + `ComfyUI_Fill-ChatterBox`. Its second
  media slot is already labelled **"Target voice"** and today takes an upload. The library
  adds a picker beside that slot; it does not replace the upload path.
- **Emotion needs performance clips.** Text cannot select emotion (measured: wrong emotion
  at exaggeration 1.0, no emotion at 0.5). Locked params: `cfg_weight` 0.3 always,
  exaggeration 0.5 for dictation and 1.2 for a VC source.
- **Pitch is what leaks, identity is not.** Two performers 0.47 apart drove one character to
  outputs 93 Hz apart and still read as one actor. This is why `register` / `median_f0` /
  `f0_p10_p90` are stored as data.
- **The QA gate is two numbers.** Cosine (`../MPI-607/research/speaker_similarity.py`) AND
  median-f0 delta (`librosa.pyin`). Cosine alone is disqualified — CAMPPlus is
  pitch-invariant by construction and scored 0.92 on a clip a listener placed 20 years off.

App-side facts checked 2026-08-25, so no one re-discovers them:

- **Deps are single files with a `sha256`.** There is no archive/extract dep type, so a
  228-file library cannot ship through the download manager without inventing one.
- **`comfy_workflows/display/` is the existing convention** for shipped media a registry
  points at (`flow-head-swap.webp` / `.mp4`), and `copyAppTree` in
  `scripts/build-portable.mjs` copies the app tree wholesale, so in-repo assets ship for
  free on all three platforms.
- ~~**No audio component exists yet**~~ — **WRONG, corrected 2026-08-25.** `MpiAudioRecorder`
  (Compound, MPI-573) already records the mic, encodes WAV and plays a review clip, and
  `MpiLevelMeter` (Primitive) already exists. Both belong to MPI-573/MPI-607 — the picker
  reuses their patterns and must not edit either. The picker itself is still new UI, built to
  `.claude/rules/components.md`.
- Chatterbox weight deps are `targetPath` and **must stay that way** (the pack computes
  `<ComfyUI>/models/chatterbox/` from its own `__file__`). Same class as RIFE, MPI-222.

### Decisions front-loaded (scalable-foundation) — ANSWERED by Fabio 2026-08-25

- **D1 — where the bundle lives. DECIDED: in-repo.** Fabio, 2026-08-25: *"that's a good
  place to place the voices, we can go with your recommendation."* Recommendation was **in-repo**, `voices/` beside
  `comfy_workflows/display/`, one `manifest.json` plus opus clips. ~60 voices x (sample +
  up to 2 auditions) at ~24 KB each is roughly **5 MB**; all 228 would be ~16 MB. The
  alternative is inventing an archive dep type for a few megabytes, which is a new download
  path, a new extract step and a new GC case for no measurable gain. User-supplied voices go
  to `userData`, never into the bundle — that split is durable and unaffected by D1.
- **D2 — how many voices ship. DECIDED: ~60 curated.** Fabio, 2026-08-25: *"60 voices is
  fine. If anything is missing later on, we can work on it"* — so the count is a starting
  point, not a cap, and the import pipeline must stay re-runnable to add more.
  Recommendation was **curating ~60** of the 228 CC0 kyutai voices for
  v1, chosen for register spread and clip quality, rather than shipping all 228 unaudited. A
  picker of 228 unlabelled voices is worse product than 60 good ones, and every voice costs
  audition-generation time in Phase 4.

**Both are answered. Phase 1 is unblocked.**

## Completed

- [x] **Phase 0 - RESOLVED ON OPTION 1** (2026-08-25). Offline formant-preserving shift passes
      both gates: no artefacts ride through VC, and emotion survives (+12, +19 and -12).
      Options 2 and 3 and the escape hatch are all unnecessary. Two hypotheses of mine died on
      the way and both are recorded as wrong in `validation.md` rather than quietly dropped.
- [x] **D1 and D2 answered** by Fabio - in-repo `voices/`, ~60 curated (a starting point, not
      a cap).
- [x] **Phase 1 - the voice record and its loader** (2026-08-25). `js/data/voiceLibrary.js` +
      `tests/voice-library.test.cjs`. 8/8 green, full suite 737/737, eslint clean.
- [x] **PARALLEL BATCH - both tasks landed** (2026-08-25, session 17). Import pipeline
      (`scripts/voice-library/ingest.py` + a 10-voice `voices/` bundle) and `MpiVoicePicker`
      (Compound + dev-gallery mount). Verified independently of the worker reports: lint
      clean, 737/737, 10/10 manifest contract checks, idempotence by SHA. **Each worker had
      one real defect its own report did not name** - a per-click component leak in the
      picker, and a 48 kHz Opus encode escalated as a size decision on a false premise. Both
      fixed at the root; detail in `validation.md`.
- [x] **PHASE 2 - 12/12 clips authored** (2026-08-25, session 17). `research/phase2_perf_clips.py`
      under the GPU lease. Verify half (a) passes: all eight low-arousal cells land inside
      their declared register band. Half (b) - six distinguishable emotions through VC - is
      Fabio's ear and is NOT done.

- [x] **CURATION PASS + FULL IMPORT** (2026-08-26, session 18). All 227 usable voices measured
      (`ingest.py --measure-only`), gates set FROM the observed distribution rather than before
      it, **60 selected** (R1 26 / R2 15 / R3 17 / R4 1 / R5 1) and imported. `voices/curated.txt`
      is the audit trail: every selection with its reason, every rejection with the gate it
      failed. New `scripts/voice-library/check_manifest.mjs` — 12 contract checks against the
      REAL loader — 12/12, plus 737/737 and a byte-identical re-run. Bundle 3.05 MB.
      **R4/R5 have one voice each in the entire corpus**; that is a sourcing gap, not a
      selection one, and it is Fabio's call.

- [x] **CORPUS REJECTED, SOURCE CHANGED, TAXONOMY APPROVED** (2026-08-26, session 18). All 60
      curated kyutai voices rejected by ear. Source is now Qwen3-TTS VoiceDesign; 12-category
      taxonomy approved; category 12 renamed Villain / menacing. Library v1 (12 voices, one per
      category) and a 24-clip age/pitch matrix both generated and level-matched.
      `research/library_personas.py` + `research/age_pitch_matrix.py`.

## Remaining Work

## Phase 0: Where R3–R5 emotional performances come from — BLOCKS all clip authoring

**A live voice changer is NOT the answer, and this is settled — do not re-propose it.**
Fabio, 2026-08-25: *"It's not good for emotion performances... there's no voice changer that
can do a good emotional performance because it just messes up the pitch. That's something
I've always struggled with."* This is consistent with everything measured on MPI-607:
emotion is carried largely by pitch movement, so a transform that mangles pitch destroys the
exact signal a performance clip exists to supply.

**Fabio's constraint, stated by him and load-bearing:** *"The only emotional performance I
can do is with my own voice."* So R1 (90–130 Hz) is authorable in-house and every register
above it needs a source. That source is this phase's whole job. Ranked by cost:

1. **Offline formant-preserving pitch shift of a natural take.** Fundamentally different from
   a live changer: it operates on an already-emotional recording rather than on the voice
   producing it, so the emotional contour is shifted intact instead of being fought in real
   time. Cheapest by far, and it is the only option that keeps authoring in-house.
2. **A permissively-licensed emotional speech corpus.** The existing research on this card
   covers corpora for IDENTITY (VCTK, GLOBE, kyutai) and does **not** cover emotional
   performance sets — that is a genuine research gap. Licences here are the trap: several of
   the well-known emotional datasets are non-commercial or research-only.
3. **Commissioned performers.** Real cost and real licensing; the fallback if 1 and 2 fail.

- [ ] Test option 1 first. Take one of Fabio's natural angry takes, pitch-shift it offline
      (+7 and +12 semitones, formant-preserving) into R3/R4, and use each as the performance
      clip driving TTS -> VC into a matched-register character.
      **Verify:** Fabio's ear on two questions, since they fail differently — (a) does the
      shifted clip still read as genuinely angry, and (b) does the shift leave chipmunk or
      formant artefacts that ride through the VC stage? Either failure sends this to option
      2. **Phase verify mode: `user-ux`.**
- [ ] Only if option 1 fails: research permissively-licensed emotional speech corpora, with
      the licence verdict per source stated up front. File it beside the existing
      `../MPI-607/research/voice-library-*.md` set.
      **Verify:** at least one corpus with a commercial-use licence covering redistribution
      of derived clips, or an explicit finding that none exists — which promotes option 3.

**The escape hatch, so this phase cannot deadlock the card: ship R1 only for v1.** Character
voices are limited to the low-male register Fabio can perform natively, and every other voice
ships as `narration` kind — which needs no performance clips at all, is already proven
excellent ("for my tutorials it will be excellent"), and is the larger use case anyway. R3–R5
character voices then become their own card. Take this route rather than blocking the library
on a performer-sourcing problem.

## Phase 1: The voice record and its loader

No forward dependency on any clip existing — this phase ships the schema and the reader,
validated against a hand-written fixture of three voices.

- [ ] Define the manifest schema and write `js/data/voiceLibrary.js`: load `voices/manifest.json`,
      expose `listVoices()` / `getVoice(id)` / `listPerformanceClips(register)`, filter by
      `kind`, and resolve clip paths. Fields per `brief.md` § 3. Document props in
      `js/components/types.js` if any component-facing type is introduced.
      **Verify:** `node --test` unit test over a 3-voice fixture manifest — every field
      round-trips, an unknown `register` is rejected rather than silently accepted, and
      `kind: 'both'` appears in both `narration` and `character` filters.

## Parallel Batch: Import pipeline and picker UI

Both depend only on the Phase 1 schema and touch disjoint trees. Run through
`mpi-execute-parallel`.

- [ ] **Import + measurement pipeline.** A node/python script that ingests the kyutai CC0
      voices, measures `median_f0` and `f0_p10_p90` per clip with `librosa.pyin`, assigns
      `register` from the R1–R5 table, transcodes to opus, and emits `manifest.json`. Must be
      re-runnable and idempotent. Ownership: `scripts/voice-library/**`, `voices/**`.
      Briefings: `dos_and_donts`. **Verify:** run it over 10 sample voices — the manifest
      validates against the Phase 1 loader, and the measured `median_f0` for the known clips
      matches the figures already recorded in `../MPI-607/validation.md` (`e0_neutral`
      225.2 Hz, `A3_REF` 125.7 Hz) within 2 Hz.
- [ ] **Voice picker component.** `MpiVoicePicker` via `ComponentFactory.create()` — voice
      list with filters (kind, register, gender, age, accent), audition playback, and the
      register-mismatch **warning** (never a block) when a user's own sample sits far in pitch
      from the available performance clips. Registers its CSS in `js/shell/preloadStyles.js`,
      documents props in `js/components/types.js`, BEM throughout, `on()`/`off()` only, and a
      `destroy()` that clears every listener and any audio element. Ownership:
      `js/components/Compounds/MpiVoicePicker/MpiVoicePicker.js`,
      `js/components/Compounds/MpiVoicePicker/MpiVoicePicker.css`,
      `js/shell/preloadStyles.js`, `js/components/types.js`. Briefings: `components`,
      `dos_and_donts`, `events`. **Verify:** mounts in the dev component gallery against the
      Phase 1 fixture, filters narrow the list, audition plays, the mismatch warning appears
      for a deliberately far pitch and the voice stays selectable. **Phase verify mode:
      `user-ux`.**

## Phase 2: Author the performance clips

Gated on Phase 0. R1 + R3 x six emotions = 12 clips, which proves the grid against one male
and one female character before R2/R4/R5 cost anything.

**SOURCE DECIDED 2026-08-25: authored offline with Qwen3-TTS VoiceDesign, NOT recorded by
Fabio.** The VoiceDesign clips out-perform his own takes on Angry, and he is not a native
English speaker — and since VC overwrites the target's accent with the source's, recording the
grid himself would stamp a non-native accent onto every `character` voice in the library.
VoiceDesign's uncontrollable American prior, a CLOSED-NEGATIVE finding on MPI-607, is what
supplies the consistent neutral house accent this needs. The Phase 0 shifter stays as a REPAIR
step for a take that lands off-register.

- [ ] Author 12 performance clips (`Flat · Neutral · Angry · Sad · Cheerful · Whisper` at
      R1 90–130 Hz and R3 190–260 Hz) with VoiceDesign. Measure each and store
      it in the manifest.
      **Verify:** each clip's measured `median_f0` sits inside its declared register band,
      and driving one R1 character through all six produces six distinguishable emotions —
      Fabio's ear, since the 2026-08-25 result proved a labelled emotion is not necessarily
      the delivered one. **Phase verify mode: `user-ux`.**

## Phase 3: Auditions generated through the shipping route

- [ ] Generate `audition_narration.opus` (direct TTS, exag 0.5 / cfg 0.3) and
      `audition_character.opus` (TTS(neutral perf clip, exag 1.2 / cfg 0.3) -> VC) for every
      shipped voice, batched on the bench under the GPU lease. A `kind: 'both'` voice gets
      both. **Verify:** every manifest entry's audition files exist and are non-empty; spot
      check by ear that a `character` audition does NOT sound like its raw sample (it must
      not — that mismatch is the whole reason auditions are generated) while a `narration`
      audition does. **Phase verify mode: `user-ux`.**

## Phase 4: Wire the library into the flows

- [ ] Add the picker to `voice-changer`'s "Target voice" slot beside the existing upload, and
      expose the emotion set for `character` voices only. `narration` voices show no emotion
      control. Follow `docs/playbooks/add-flow/` for any descriptor change; do NOT add
      `ComfyUI-MpiNodes` to `requiredDeps`.
      **Verify:** a full run in an isolated app instance (`npm run app:isolated`) — pick a
      library voice, run the flow, and a real gallery card lands. Then `npm test` green and
      the desktop suite green. **Phase verify mode: `user-ux`.**

## Plan Drift

- **2026-08-25 (session 17) -- the batch's picker ownership named paths this repo does not
  use.** The plan said `js/components/voicePicker.js` + `styles/components/voice-picker.css`.
  Components live at `js/components/<Tier>/<Name>/<Name>.{js,css}` (four tiers: Primitives,
  Compounds, Organisms, Blocks) and `styles/` holds only `01_base.css`, `markdown.css` and
  `shell/`. Corrected to `js/components/Compounds/MpiVoicePicker/MpiVoicePicker.{js,css}`.
  Compound is the right tier: the picker composes MpiDropdown / MpiInput / MpiButton rather
  than being a leaf control.
- **2026-08-25 (session 17) -- "no audio component exists yet" was already false when
  written.** `MpiAudioRecorder` (MPI-573) and `MpiLevelMeter` are both shipped. Corrected in
  `## Current State`.
- **2026-08-25 (session 17) -- the source clips are real audio, checked before dispatch.**
  `kyutai/tts-voices/voice-donations/` holds 10 s 24 kHz `.wav` files (`0a67.wav`, plus
  `_enhanced.wav` denoised twins) beside kyutai-specific `.safetensors` embeddings that are
  irrelevant to Chatterbox. Public repo, no HF token. **There is no ffmpeg on this machine**,
  but `G:/ComfyUi/python_embeded/python.exe` carries `soundfile` 0.14.0 / libsndfile 1.2.2
  with `OGG/OPUS` write and `librosa` 1.0.0, so the opus transcode needs no ffmpeg.
- **2026-08-25 -- the semitone figures in Phase 0 were wrong.** Phase 0 said "+7 and +12
  semitones ... into R3/R4". From Fabio's natural take (`recording_003.wav`, median 101.5 Hz)
  the arithmetic does not reach: +7 lands on **150.3 Hz (R2)** and +12 on **201.8 Hz (R3)**.
  R4 needs **+19** (305.9 Hz). Measured, not estimated -- `research/pitch_tools.py measure`.
  The test now runs +7 / +12 / +19 and pairs each with a character clip in the register it
  actually lands in, since performer pitch leaks hard and a mismatched pair would measure
  the mismatch instead of the shift.
- **2026-08-25 -- there is no angry take of Fabio's on disk, so Phase 0 splits in two.**
  The plan assumed "one of Fabio's natural angry takes" exists. The only natural recordings
  are `recording_003/004/005.wav` (101.5 / 182.9 / 127.9 Hz) and none is recorded as
  emotional; the two expressive ones (`high_pitch_exp_fabio` 230.5 Hz, `high_pittch_fabio`
  316.7 Hz) are PUSHED takes, which score 0.38-0.42 against his own natural voice and are
  ruled out by guidance rule 1. Question (b) -- do artefacts ride through VC -- needs no
  emotion and runs now against a +0 control. Question (a) -- does anger survive the shift --
  waits on one angry line recorded at his natural pitch.
- **2026-08-25 -- the shifter is Praat, not librosa.** `librosa.effects.pitch_shift` and
  `torchaudio.functional.pitch_shift` are resample-based: they drag the formants along and
  manufacture the exact chipmunk artefact this phase exists to rule out, so either one would
  have failed the test by construction rather than on the merits. `praat-parselmouth` was
  installed on the bench (`G:/ComfyUi/python_embeded`, 0.4.7) and its "Change gender" with
  `formant_shift_ratio 1.0` moves the pitch median while leaving the formants alone.

## Verification

**Verify mode:** `user-ux`

Almost every phase ends in a judgement only Fabio's ear can make, which is the standing
lesson of this whole line of work: the CAMPPlus cosine agreed with the pipeline at every
step while disagreeing with the listener. Phase 1 alone is `auto` (a unit test over a
fixture). Per-phase modes are marked inline above.

End to end: from a clean profile, a user picks a library character voice, records or uploads
a performance, chooses an emotion, runs the flow, and gets a gallery card whose voice is
consistent with the audition they auditioned — and picking a different emotion for the same
character still sounds like the same actor.

## Preservation Notes

- The 2026-08-25 findings in `../MPI-607/validation.md` are the evidence base for every
  decision here. At close-out, fold the durable ones into a subsystem doc — a
  `docs/voice-library.md` routed from `docs/README.md` — because they are codebase facts
  now, not session notes. **Do not create a gotchas dump file.**
- [x] **DONE 2026-08-25** - `docs/playbooks/add-flow/existing-flows/voice-changer.md` rule 3
  rewritten with the mechanism and the measured numbers, plus a new "what comes from you, and
  what comes from the target" table carrying the MPI-622 accent result. Open since 2026-08-24.
- The flow's own `description` in `flowsRegistry.js` promises Chatterbox "swaps the voice
  itself". Measured behaviour is a blend. That copy needs honest wording before this ships.
- Register the new component's CSS in `js/shell/preloadStyles.js` and its props in
  `js/components/types.js` — both are easy to forget and both are enforced.
