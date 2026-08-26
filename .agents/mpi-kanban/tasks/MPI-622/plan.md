# Voice library — the character + performance clip library the TTS/VC flows select from

## Current State

**Project mode:** `scalable-foundation`.

> **Session 23 note (2026-08-26) — PHASE 4 IS BUILT AND VERIFIED EXCEPT FOR ONE RUN.**
> The voice library is wired into `voice-changer`'s "Target voice" slot as a third source
> inside the existing media-picker overlay, opted in per slot by
> `voiceLibrary: [null, 'character']` on the flow's media group. A picked voice is fetched,
> decoded to WAV and routed through `_handleFiles`, so it lands as an ordinary
> content-addressed project asset and needs no injection plumbing.
>
> **Three product questions closed with Fabio this session.** (1) EMOTION belongs to the TTS
> flow, not here — and VC does not add emotion, it preserves the source delivery while
> swapping timbre, so the emotion set is picked at the TTS stage as a performance clip and
> carried through. The VC mount passes `emotions: false`. (2) ALL FOUR FILTERS ARE GONE, and
> so are the kind/gender/age badges. (3) The sections are divided into eight DEMOGRAPHIC
> GROUPS, and the group is ORDERING only — it holds whole sections and never flattens them,
> because two sections under one heading are two different voices.
>
> **Fabio then drove it and named five things — all five are fixed and measured** (see the
> "Phase 4 round 2" block below). The big one was NOT a UI item: `generateRandomSeed()`
> returned seeds ~23,000x larger than `FL_ChatterboxVC` accepts, so **Voice Changer had never
> completed a single generation from the app**. He guessed it was a stale app needing a
> restart; it was not, and it was not caused by this card's wiring either.
>
> **THE ONE THING NOT DONE: the flow has still never been RUN successfully.** The seed fix
> should unblock it. That is the phase's `user-ux` gate and only Fabio can close it.
>
> **Next action:** Fabio opens Voice Changer, records or uploads a performance, picks a
> library voice as the target, and runs it. Watch for the British-accent question carried
> over from session 22.

> **Session 22 note (2026-08-26) — PHASE 3 FAILED ITS EAR GATE. The library is not 60
> distinct voices and will not be made into them.** Supersedes the session 21 note below on
> every point about audition quality; the generation mechanics it records are still accurate.
>
> **Fabio's verdict, on headphones, raw samples AND auditions:** within every section the
> voices are one person talking slightly differently — *"every single section of 5 samples is
> like the same person just talking slightly differently"*, against ElevenLabs where
> voice-to-voice difference is "ginormous". Named collapses: cartoon critters 2≈4 and 1≈5 in
> raw; `child_1`≈`child_2`; `elderly_male_3`≈`elderly_male_4`; `mature_female_1`≈
> `mature_female_2` in character audition. He named the elderly males as the ONE partial
> exception — *"my two voices are a bit different from the other elderly males, but that's
> about it."*
>
> **RETIRED on his call: `cartoon_critter_2`, `cartoon_critter_5`, `elderly_male_3`.** 60 → 57.
> **Do NOT backfill to 60** — *"let's not try to keep it at 60 samples, otherwise we're never
> gonna leave this place. Qwen has those limited voices, and the rest is history."* Chasing
> within-section distinctness is CLOSED: the ceiling is Qwen's, not the pipeline's.
>
> **THE PRODUCT FRAMING CHANGES: a section is ONE VOICE with N VARIATIONS, not N voices.**
> Fabio, verbatim: *"for users, we should say 'variation of the same voice' instead of
> 'different voice' because it's not really a different voice."* The grouping key is the
> **SECTION** — the twelve `tags[0]` categories exactly as the review page presented them
> (cartoon_critter, child, deep_male, elderly_female, elderly_male, mature_female,
> narrator_trailer, standard_female, standard_male, villain_menacing, young_female,
> young_male). **NOT register.** He corrected an earlier misreading of "R section" explicitly:
> *"Forget about the R sections... It's by type of voice, not by R section."* Registers still
> drive clip selection; they are not a user-facing grouping.
>
> **THE CHARACTER AUDITIONS WERE FLATTENED BY THE GENERATOR, NOT ONLY BY THE VOICES — and
> that defect is ours.** `research/phase3_auditions.py` line 177 runs the TTS half ONCE PER
> REGISTER and reuses that single clip as the VC source for every voice in it ("one VC source
> per register (5 runs, not 60)"). All five cartoon critters are R5, so their five character
> auditions are the SAME performance — same timing, same breath — with only timbre nudged.
> Same for deep_male and narrator_trailer (all R1) and young_male (all R3). Fabio heard it
> exactly: *"auditions just make the variations merge into one voice."* Raw voices he CAN
> tell apart still collapse in character audition, which is what proves the route is at
> fault and not just the corpus. The 60-job saving bought this.
>
> **The residual, separate and still open:** narration auditions drift into a British accent
> inconsistently ("probably seed lottery" — his read, and it matches: `accent` is null on all
> 60 by design, so Chatterbox invents one per seed). Two children carry it. Not what broke
> this phase; do not conflate.

> **Session 21 note (2026-08-26) — PHASE 3 IS GENERATED AND INSTALLED. Only Fabio's ear is
> outstanding.** Supersedes the session 20 note below.
>
> **120 AUDITIONS SHIPPED, 60/60 voices carry BOTH, zero failures.** 125 bench jobs, not
> 185: the character route's TTS half is identical for every voice in a register (fixed
> text, fixed neutral clip, fixed seed), so TTS ran **5×** and VC **60×**. Inputs are the
> SHIPPED opus decoded to wav, not the pre-encode `lib_v2` wavs — an audition made from an
> artifact the user never hears is an audition of the wrong thing. `voices/audition/` is
> 2.05 MB; bundle **6.14 MB**. **13/13 + 8/8.**
>
> **Audition line, locked and recorded in the manifest as `auditionText`:** *"Just show me
> the whole chart, and I'll tell you which part to fix."* Short (~3.5 s) because a picker
> plays it inline and 120 sample-length reads would add 6 MB, and deliberately NOT the
> sample text — the two clips sit side by side and the point is to hear the route differ.
>
> **THE PERFORMANCE GRID WENT 12 → 30 CLIPS (R2/R4/R5 authored).** It started as three
> neutral-only clips; `check_manifest.mjs` check 9 refused that and was right — it asserts
> every register PRESENT carries all six emotions, so a neutral-only R5 would have put a
> voice in the picker offering emotions it cannot perform. 18 is the smallest set that does
> not break the invariant, and it closes the previously-pending R2/R4/R5 grids item.
>
> **The calibration target is the MEAN f0 OF THE VOICES A GRID DRIVES, not the band
> midpoint** — derived from the two shipped ear-approved grids, which already do exactly
> that (R1 1.34 st off its 22 voices' mean, R3 0.22 st off its 13). Band-midpoint targeting
> would have put R2 nine semitones from the voices it drives. Applied per REGISTER so every
> emotion's pitch delta survives: R2 −3.59 st, R4 −2.86, R5 +0.60.
>
> **TWO WRONG TURNS, BOTH RECORDED RATHER THAN QUIETLY FIXED.** (1) A re-roll was the wrong
> tool and this card already said so — all three seeds of the child persona measured R5
> (363–408 Hz) against a 260–340 band, and `phase2_perf_clips.py` states outright that a
> clip off baseline is REPAIRED with `pitch_tools.py shift`, not re-rolled. (2) Relabelling
> R4↔R5 by measured f0 looked free — it is what `register_of()` does everywhere else — but
> it would have left a cartoon read driving every child audition. Rejected.
>
> **check_manifest.mjs HAD TWO BLIND SPOTS and they were about to matter.** Check 11
> (orphans) and the size gate both enumerated `voices/` and `performance/` BY HAND, so the
> new `audition/` subdir would have shipped **uncounted** — a size gate reporting green on
> a bundle it was not measuring. Both walk recursively now. New check 12 is Phase 3's own
> verify step (every voice has both auditions, on disk, non-empty); the budget moved 5 → 8
> MB with the arithmetic written in, not nudged until green.
>
> **THE CLASSIFIER, NOT THE SETTINGS.** Several launches were refused by the auto mode
> classifier while `Bash(python:*)` sat in `permissions.allow` the whole time — those are
> two different layers. Fabio added an `autoMode.allow` block to
> `.claude/settings.local.json` (with `"$defaults"`, so it inherits rather than replaces)
> and it took effect **live, no restart**. An agent cannot make that edit itself: editing
> your own permission file is refused, correctly.
>
> **Bench killed by verified PID after the run** (`Get-Process -Id … Path -like G:\ComfyUi*`
> before `Stop-Process` — never by name pattern), 8188 down, GPU lease free, and the user's
> app on :3000 confirmed untouched.
>
> **`ingest.py` WOULD HAVE WIPED ALL 120 AUDITIONS and it is now fixed.** `build_voice_entry`
> hardcodes `audition_narration` / `audition_character` to `None`, and the writer replaced
> `manifest["voices"]` wholesale — so the next `--from-dir` run of any kind, for any reason,
> would have silently deleted every audition reference and left a well-formed 60-voice
> manifest behind. **Exactly the `performanceClips: []` defect from session 18, in the same
> file, found by reading rather than by anything reporting it.** The manifest is now read
> before the loop and prior auditions are carried forward by voice id. Proven end to end, not
> by inspection: sentinels injected into two voices survived a real full re-import, an
> untouched voice stayed null, the 12 perf clips stayed intact, and all 60 opus were reused
> (`scratchpad/check_audition_carry.py`, restores in a `finally`). 12/12 + 8/8 after.
>
> **`ingest.py` needs `G:\ComfyUi\python_embeded\python.exe`** — the box's default python has
> no librosa. CPU-only, no GPU involved.
>
> **THE AUDITION PLAN, COSTED. 128 bench jobs, not 183.** The character route's TTS half is
> identical for every voice in a register (fixed text, fixed neutral clip, fixed seed), so
> TTS runs **5×** (one per register) and VC **60×**; plus 60 narration TTS and 3 new neutral
> perf clips. **R2 / R4 / R5 need those neutral clips** — 25 of the 60 voices live there and
> the grid is R1+R3 only, and source pitch LEAKS through VC (measured: two performers drove
> one character 93 Hz apart), so driving a 394 Hz critter off the 94.7 Hz R1 neutral would
> make its audition misrepresent the voice. Three clips, **not** the full six-emotion grids.
>
> **THE AUDITION TEXT IS SHORT, AND THAT IS A SIZE DECISION AS WELL AS A UX ONE.** Samples
> average **50 KB** (the long `LIB_TEXT` read), not the 24 KB D1 assumed. 120 auditions at
> sample length = +6.0 MB → a **9.5 MB** bundle; at ~4 s they are ~17 KB → **~5.5 MB**.
> Either way **`check_manifest.mjs` check 12 asserts `< 5 MB` and will fail** — its threshold
> must move when the auditions land, with the new number written down rather than nudged.
>
> Manifest `note` healed (it still claimed `voices[]` was empty) and four stale session-17
> checklist items closed.
>
> **Next: Fabio's GPU lease** — bench 8188 is down, restart is his call. Then generate.

> **Session 20 note (2026-08-26) — THE LIBRARY IS COMPLETE AT 60.**
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
> **CLOSING DELTA (same session, after the import).** `voices/LICENCE.md` +
> `Cubric-Vision-Voice-Licence-1.0` now carry Fabio's terms: **clips proprietary, user output
> commercial-OK, no royalty, no territory limit** — he added "it doesn't have to be strict, if
> it's revoked I don't care". The dead kyutai half of `ingest.py` is deleted (**766 → 367
> lines**) along with `voices/curated.txt`. `brief.md` § Sourcing and the clip-grid gate are
> rewritten to match what shipped. `--from-dir` now **only re-encodes when the source is newer**
> — the opus encoder is not byte-stable, so every import used to rewrite all 60 binaries
> (~3.5 MB of git churn); a second import now reports 60 reused and leaves `git status voices/`
> empty. **HISTORY WAS DELIBERATELY NOT REWRITTEN**: the kyutai opus remain in git objects
> (20 commits, master only, 2.81 MB) and Fabio's call was "if it's in history, it's in history"
> — they cannot reach a user because builds package the working tree.
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

## Phase 3.5: The library says what it is — DONE 2026-08-26

Added after Phase 3 failed its ear gate. Deletion only: no bench job, no GPU lease, no
generated clip. Every item verified below.

- [x] **Retire the four voices Fabio's ear rejected** — `cartoon_critter_2`,
      `cartoon_critter_5`, `elderly_male_3` (indistinguishable from a sibling),
      `villain_menacing_3` (does not read as a villain). 60 → 56, and **no backfill**: the
      ceiling is Qwen's limited voice set, not the pipeline's.
- [x] **Split the villains into four sections of one.** They were never variations — five
      separate DIRECTION briefs, which is why gender surfaced here and nowhere else.
      `villain_monster_1` (large monster creature, null/null), `villain_male_1` (male/adult),
      `villain_female_1` (female/adult), `villain_young_1` (male/**young** — Fabio's ear over
      the sidecar's "Adult"). Gender comes from the generation-time DIRECTION line, never from
      f0: a pitch split would have put `villain_menacing_3` and `_5` on the wrong side.
- [x] **Delete all 60 character auditions and the field that named them.** Bundle 6.14 →
      **4.90 MB**. Rationale in `## Current State`; the short form is that VC's delivery comes
      from the user's own recording, so no pre-generated clip can preview it.
- [x] **The library is SECTIONS OF VARIATIONS.** `section` + `variation` on every voice,
      `listSections()` on the loader, display names composed from section + variation
      (never the file stem — retiring `cartoon_critter_2` renumbers the survivors).
- [x] **`check_manifest.mjs`**: check 12 rewritten to narration-only plus a guard that no
      voice still carries `audition_character`; new check 14 asserts sections partition the
      library, variations are dense 1..N, and a lone voice is never labelled "Variation 1".
- [x] **Test fixture re-cased to snake_case** — the deferred Phase 4 item, done here since the
      fixture had to change anyway. Plus coverage for `listSections` and `assetUrl`.
- [x] **Fixed a shipped bug the restructure exposed:** the picker passed manifest-relative
      paths straight to `new Audio()`, so every audition resolved against the PAGE and 404'd.
      Proven live — the bare path returns 404, `assetUrl` returns 200. It was invisible because
      the gallery fixture leaves every audition null, so playback was never exercised.

**Verified 2026-08-26:** 14/14 contract checks; `npm test` 741/741; eslint clean; and a live
probe of the real component against the real manifest in a browser — 15 sections, 56 cards,
correct labels, both routes building the right URL (`/voices/<id>.opus` for character,
`/voices/audition/<id>_narration.opus` for narration). Two rendering bugs found by LOOKING at
it, not by a test: a sticky section header covering its own first card, and a register badge
reading "Cartoon / Critter" on a Child variation. Both fixed.

**Left for Fabio, deliberately not changed:** the `kind` badge reads "both" on all 56 rows
(every voice is `kind: 'both'`, so it carries no information), and the register filter
dropdown still offers R1–R5 — which is the grouping he asked to drop as user-facing. Both are
picker chrome that Phase 4 should settle with the route in hand.

## Phase 4: Wire the library into the flows

- [x] **DONE 2026-08-26.** The picker is a THIRD SOURCE inside the existing `MpiMediaPicker`
      overlay on `voice-changer`'s "Target voice" slot, beside Upload and Record — not a
      second button next to the slot, because the slot's "exactly one job" was a deliberate
      repair and a rival button would undo it. Opted in per SLOT by one index-aligned array
      on the media group, `voiceLibrary: [null, 'character']`, which carries the opt-in AND
      the route in one field. Slot 0 ("Your performance") gets no voice card by design.
      Descriptor change is one additive field; `ComfyUI-MpiNodes` NOT added to `requiredDeps`.
- [x] **EMOTION IS ANSWERED, and it is NOT audition-only — it belongs to the TTS flow.**
      Fabio, 2026-08-26: in the TTS flow emotion is a real final-stage dropdown. The
      mechanism, corrected in the same exchange: **VC does not ADD emotion.** The dropdown
      picks a PERFORMANCE CLIP, TTS speaks the text with that clip's delivery, and VC then
      swaps the voice while carrying that delivery through. Voice Changer has no TTS stage,
      so the user's own recording already carries the emotion and the control would act on
      nothing. New prop `emotions` (default true); the VC mount passes `false`. The `select`
      payload omits `emotion` whenever the control did not show — reporting a choice the user
      was never offered would be inventing one.
- [x] **BOTH PICKER-CHROME QUESTIONS ANSWERED — the filters are GONE, all four of them.**
      Fabio: *"we don't have that many voices to even think of filters at this point. I think
      if they're properly organised, that's more than enough."* On the kind badge: *"I don't
      even know what badge you're talking about"* — which is the answer, since it read "both"
      on all 56 rows. Gender and age badges went too: the group heading now says both.
- [x] **THE SECTIONS ARE DIVIDED INTO DEMOGRAPHIC GROUPS** — `VOICE_GROUPS` + `listGroups()`
      in `js/data/voiceLibrary.js`, 8 groups over the shipped 15 sections. Fabio picked
      option **A**: the demographic is ORDERING, holding whole sections. Option B (the
      demographic REPLACES the section, flattening its voices) was rejected because Standard
      Female and Mature Female both land in "Mature female" and are NOT one voice — B would
      re-make the claim his ear rejected in Phase 3. `adult` and `mature` share one group;
      children are not split by sex; `Character` catches the three sections with no gender
      and no age. Silence on where those three go was taken as agreement, per his convention.
- [x] Mounted with `route: 'character'` — PROVEN live, not assumed: `window.Audio` was
      monkey-patched in the running app and the play button built `/voices/elderly_female_2.opus`
      (the raw sample), which serves 200.
- [x] Selecting a voice routes through `_handleFiles`. It is fetched, **decoded to WAV**, and
      handed to `onImport` as a File — see the drift note below for why `.opus` could not be
      passed through. Landed on disk as
      `Media/.preview-assets/f3cbd0077649…beca788.wav`, `RIFF…WAVE`, 1,005,612 bytes
      (≈10.5 s at 48 kHz mono), which is exactly what an upload produces.

**Verified 2026-08-26:** `npm test` 745/745, `npm run test:desktop` 29/29, eslint clean, plus
a live probe of the REAL flow in an isolated instance — slot 0 offers Upload + Record only,
slot 1 offers Upload + Record + Voice library, the library renders 8 groups / 15 sections /
56 cards with 0 filter dropdowns and 0 badges, the detail panel shows no emotion control, and
confirming a voice fills the Target voice slot with a content-addressed WAV.

### Phase 4 round 2 — Fabio's UI pass, 2026-08-26

He drove it and named five things. All five are done and measured live.

- [x] **THE SEED BUG — HE ASKED IF A RESTART WOULD FIX IT. IT WOULD NOT.**
      `FL_ChatterboxVC failed: ValueError: Seed must be between 0 and 2**32 - 1`.
      `comfyController.generateRandomSeed()` returned up to **1e14** — roughly 23,000x the
      node's ceiling — so the odds of a run landing in range were about 1 in 23,000. **Voice
      Changer had never been able to complete a single generation from the app**, with any
      target voice, on any machine. Nothing to do with MPI-622's wiring. Capped at 2^32-1,
      which is the widest range EVERY node accepts; core samplers take 64-bit seeds and were
      simply never the ones to object. Guarded by `tests/seed-uint32-range.test.cjs`, which
      also pins the graph wiring so the cap cannot stop protecting this flow silently.
      **This is MPI-607's file territory** — its session is stale (heartbeat 2026-08-23) and
      the fix was blocking this card's own gate.
- [x] **The library was letterboxed, and had two scrollbars.** Both had one cause: the panel
      was `position: absolute; inset: 0` over the grid, so it could only ever be as tall as
      the grid behind it — one row, in an empty project — and BOTH the panel wrapper and the
      picker's own `max-height: 360px` list were scroll containers. Now the panel is IN FLOW
      (the grid and its filter tabs hide), and the picker's list is the only scroller.
      Measured: panel 518px, list 400px, exactly one scrolling element.
- [x] **Clicking a row plays it.** The 32px play icon was the only way to hear anything, which
      made the list's primary action a tiny target. Card click now selects AND plays; the icon
      is a state indicator that no longer needs its own handler. **Switching rows stops the
      previous one** — measured `play A → pause A, play B` — and re-clicking the playing row
      stops it.
- [x] **The confirm button is a pinned footer, always visible.** The old detail PANEL appeared
      on selection, carried a redundant copy of the voice name, and moved the button around.
      Footer renders always; the button is disabled until something is selected. Emotion sits
      above it, hidden rather than unmounted so the button never jumps.
- [x] **A filled AUDIO slot is a player, not a filename.** It printed `_mediaName(item.url)`,
      and every flow input is content-addressed, so that was always a sha256 —
      `dc6ac18b7ee7b4a712…` told the user nothing, least of all which library voice they had
      picked. Now: play icon, hover plays (unmuted — a silent audio preview is not one), leave
      resets, click still reopens the picker. `_mediaName` was orphaned by this and removed.
      The EMPTY slot also stopped showing a picture-frame icon for audio and video.

**Verified round 2:** `npm test` 747/747, `npm run test:desktop` 29/29, eslint clean, plus a
live probe measuring every claim above rather than eyeballing it.

**STILL NOT VERIFIED — the phase's actual gate:** a full generation. The flow has never been
RUN successfully by anyone, because of the seed bug above. Fabio must open Voice Changer,
record a performance, pick a library voice and press Generate. That run is also the first
chance to test the open question from session 22: whether VC sometimes produces a British
accent and whether re-pressing Generate re-rolls it. His ear wins there.

## Plan Drift

- **2026-08-26 (session 23) -- `.opus` could not be handed to the Flow slot, and passing it
  through would have failed the way `.webm` already did once.** `opus` is present in exactly
  ONE of the five extension lists that classify a file as audio (`routes/projects.js:90`); it
  is missing from `js/utils/file.js` AUDIO_EXTS and from three more lists in
  `routes/projects.js` (:1008, :2765, :2843). That is the same trap that made
  `MpiAudioRecorder` re-mux its WebM rather than store it. So a picked voice is fetched and
  DECODED TO WAV before it reaches `_handleFiles`, reusing that recorder's own `_toWavFile`
  (now exported as `toWavFile`) — a library pick and a recording therefore reach the graph as
  the same kind of file. The alternative, adding `opus` to four lists, is a change to shared
  media classification for one feature's benefit and would still leave ComfyUI's loaders to
  argue with.
- **2026-08-26 (session 23) -- an unknown `age` now THROWS, because it was a silent
  misfiling.** `listGroups` places a section by its declared gender+age, and an age matching
  no group falls into `Character`. `null` is legitimate there (Cartoon Critter, Narrator /
  Trailer, Villain Monster) — but a MISSPELLED age falls the same way, which would put a deep
  male voice under "Character" where nobody looks, with the manifest still reading correctly.
  With the filters gone the groups ARE the navigation, so a misfiled section is an unreachable
  voice. This is the same reasoning as the existing register/kind throws. The Phase-1 test
  fixture was already carrying `age: 'midage'`, a value the shipped manifest never had, and
  the gallery fixture was carrying `age: 'young adult'` — both would now throw, and both were
  corrected. **The bug this catches was live in the repo before it was written.**
- **2026-08-26 (session 22) -- "60 distinct voices" was never true, and the ear gate is what
  found it.** The whole plan is written around a library of 60 voices. It is 12 sections of
  4-5 VARIATIONS, and Fabio's ear says so on raw samples, not just on auditions. Three voices
  retired (`cartoon_critter_2`, `cartoon_critter_5`, `elderly_male_3`); 57 remain and there is
  no backfill. Everything downstream that counts voices, labels a voice, or promises
  distinctness is now wrong and is repaired in Phase 3.5 below. **This is the owner revising
  his own earlier approval on new evidence -- it is NOT the settled "library contents" call
  the session-21 handoff fenced off.** The reason he approved the sections earlier is
  recorded too and is worth keeping: `child_1` and `child_2` differ in MANNER, which reads as
  two voices until you listen for timbre.
- **2026-08-26 (session 22) -- the per-register VC-source reuse is a defect, not an
  optimisation.** Recorded in `## Current State` above. The rule it broke: an audition exists
  to show what a voice sounds like, so anything shared across voices inside one belongs to
  none of them. A shared TTS source hands every voice in a register one performer's delivery
  and leaves timbre as the only difference -- which is precisely the difference that turned
  out to be too small to hear. Any regeneration must give each SECTION its own source, and
  seeds must differ across sections or five R1 sections merge the same way.

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
