# MPI-622 Validation

Evidence base for this card starts at `../MPI-607/validation.md` from `2026-08-25` onward.
Everything below is new.

---

### 2026-08-25 — Phase 0: the offline shifter works, and it exposed that TTS ignores the clip's register

**Option 1 of Phase 0 is built and half-measured.** A live voice changer is settled as not
the answer (it fights pitch while the voice is being produced). An offline shift is a
different mechanism — it operates on an already-emotional recording, so the contour moves
intact — and that is what this tested.

#### The shifter

`research/pitch_tools.py`, `praat-parselmouth` 0.4.7 installed on the bench
(`G:/ComfyUi/python_embeded`). Praat **"Change gender"** with `formant_shift_ratio 1.0`
moves the pitch median and leaves the formants where they are.

**`librosa.effects.pitch_shift` and `torchaudio.functional.pitch_shift` were both rejected
and neither was a close call** — they are resample-based, so they drag the formants along
and manufacture the exact chipmunk artefact this phase exists to rule out. Either one would
have failed the test by construction rather than on the merits.

Validated against figures already recorded on MPI-607, so the tool is not grading its own
homework: `A3_REF` **125.7 Hz** (exact match) and `e0_neutral` **223.9** vs the recorded
225.2 — inside the card's own 2 Hz gate.

| shift | median f0 | register | duration |
|---|---|---|---|
| `recording_003.wav` (source) | 101.5 | R1 | 13.26 s |
| +7 st | 150.3 | R2 | 13.26 s |
| +12 st | 201.8 | R3 | 13.26 s |
| +19 st | 305.9 | R4 | 13.26 s |

Duration untouched to the centisecond, and every shift lands inside its target band.

#### 🔴 The plan's semitone figures were wrong

Phase 0 said "+7 and +12 ... into R3/R4". From a 101.5 Hz source the arithmetic does not
reach: **+7 lands on R2 and +12 on R3. R4 needs +19.** Recorded in `plan.md` § Plan Drift.

#### 🔴 There is no angry take of Fabio's on disk — Phase 0 splits in two

The plan assumed "one of Fabio's natural angry takes" exists. It does not. The only natural
recordings are `recording_003/004/005.wav` (101.5 / 182.9 / 127.9 Hz), none recorded as
emotional. The two expressive ones are **pushed** takes — `high_pitch_exp_fabio` 230.5 Hz
and `high_pittch_fabio` 316.7 Hz — and a pushed take scores 0.38–0.42 against his own
natural voice (MPI-607, 2026-08-25), so guidance rule 1 rules them out as sources.

So the phase's two questions are now answered separately:

- **(b) do artefacts ride through VC?** Needs no emotion. Run below, awaiting his ear.
- **(a) does anger survive the shift?** Blocked on one angry line at his natural pitch.

#### The (b) run

`research/phase0_shift_pipeline.py`, bench :8188 under the GPU lease. Three runs, each
TTS(text, `audio_prompt`=shifted clip, exag 1.2, cfg 0.3) -> VC(matched-register character),
both stages saved. **A +0 control is included and is load-bearing** — without it there is no
way to tell a shift artefact from one the pipeline always makes.

15–18 s each, `execution_cached` empty on the TTS and VC nodes in all three.

Staged blind at `C:/Users/Fabio/Desktop/MPI622_pitch/` as A/B/C with the raw shifts in
`open_me_last/`. Key: `research/phase0_answer_key.md`.

#### 🔴 A performance clip's register is NOT the output's register

Measured on all three runs, and it was not predicted by anything on either card:
**Chatterbox TTS at exaggeration 1.2 lands 74–85 Hz above its reference clip.**

| reference | its f0 | TTS out | rise |
|---|---|---|---|
| `recording_003` | 101.5 | 186.1 | +84.6 Hz |
| `rec003_plus7` | 150.3 | 226.5 | +76.2 Hz |
| `rec003_plus12` | 201.8 | 275.7 | +73.9 Hz |

The rise is roughly constant in Hz, not in semitones, which means it compresses as the
reference climbs (+9.2 st at R1, down to +5.4 st at R3). Consequence for `brief.md` § 2:
the R1–R5 grid describes **where the clip sits, not where the line comes out**, so a
"matched register" pairing has to be chosen against the TTS output, not against the clip.

#### The VC stage closes the pitch gap by wildly different amounts

| run | perf clip | TTS -> char gap | VC closed | % | VC out vs char |
|---|---|---|---|---|---|
| B control | +0 | 6.8 st | 4.6 st | 68% | +2.2 st |
| C | +7 | 8.5 st | 6.5 st | 77% | +2.0 st |
| A | +12 | 4.0 st | 0.35 st | **9%** | **+3.7 st** |

Cosine to the intended character: **0.93 / 0.81 / 0.84** — all above the 0.80 gate, all
"same speaker, confidently". Run A scores 0.84 while sitting 3.7 semitones above the voice
it is supposed to be. **That is the disqualified-cosine problem again, and this time the
pitch half of the gate is what caught it** — the first live demonstration that the two-number
gate from `brief.md` § 5 earns its keep.

**Status: (b) PASSED — see the next entry.**

---

### 2026-08-25 — ✅ QUESTION (b) PASSES. The shift survives VC. And two things came out of it.

Fabio, cold, on A/B/C: *"the three samples do not have any issues like the one you
mentioned."* **No chipmunk, no formant damage, no metallic texture — in the +12 run, the +7
run or the control.** An offline formant-preserving shift is therefore a usable source of
performance clips as far as artefacts are concerned, and the shifter can be trusted at least
to +12 semitones.

That is Phase 0 option 1's expensive half answered, and it did not need option 2 or 3.

#### 🔴 Flow A's output loudness is not controlled — this ships TODAY

Fabio, unprompted: *"C is very loud though."* He is right and it is not the shift's fault.
Measured through the whole chain (`research/pitch_tools.py level`, RMS over active speech —
EBU R128 is unusable here, its gating blocks report the −70 dB silence floor on anything
under ~10 s):

| stage | RMS | note |
|---|---|---|
| `recording_003` → +7 → +12 → +19 | −27.1 / −27.3 / −26.8 / −26.2 | **the shift changes level by under 1 dB** |
| TTS out, all three | −13.8 / −13.9 / −14.4, peak **0.0 dBFS** | TTS normalises hard to a fixed loud level, ignoring its reference |
| VC out A / B / C | −18.2 / −16.8 / **−14.3** | VC drags level partway toward the CHARACTER's level |

C's character was the loudest of the three, so C's VC only came down **0.4 dB** where B came
down 3.0 and A came down 4.2. The A→C spread is **3.9 dB**, well past the ~1 dB threshold of
noticing, and C sits on **0.0 dBFS peak**.

So the same flow, run with two different target voices, returns audibly different loudness
and can land on the clipping ceiling. **This is a Flow A defect, not a library one** — Flow A
ships today and has no output normalisation. Two consequences:

1. Flow A needs output loudness normalisation (or at minimum a peak ceiling). Not carded yet.
2. **Every listening test from here must be level-matched before it is played.** A louder
   clip wins almost any question a listener is asked, so this one nearly cost a false result.
   `pitch_tools.py norm` exists for it now.

#### 🔴 The "do not push" objection was MINE and it was wrong

I wrote that Fabio's expressive takes were ruled out as performance clips by guidance rule 1
("perform, but do not push"). He pushed back: *"I can change my voice quite a bit. I've done
some role play and done very different characters."*

He is right and I over-applied the rule. Two separate things were conflated:

- **Rule 1 is about `exaggeration`, the TTS parameter** — 1.2 holds identity at 0.79–0.87,
  1.5 drops to 0.70, 2.0 to 0.61. That is a knob, not a description of anyone's voice.
- **The 0.38–0.42 figure** (his pushed take vs his own natural takes) matters **in Flow A**,
  where the product's promise is converting *him*, so a take that does not encode as him
  starts the conversion from a distorted x-vector.

**Neither applies to a performance clip.** In this role the clip is a TTS `audio_prompt` and
nothing is trying to sound like Fabio. The card's own measured asymmetry — performer identity
barely leaks, performer PITCH leaks hard — says the clip only has to carry emotion and sit in
a register. A take of his that encodes as "a different speaker" is *irrelevant* here, and may
even be an advantage.

The one real risk is strain texture (fry, breathiness, wobble) riding through — which is the
same question the shift just passed, so it is testable rather than assumable.

**If a performed take is as good, the shift is not needed at all** and R3/R4 become natively
authorable. `research/phase0_performed_vs_shifted.py` decides it head to head, and the
registers line up almost exactly, which makes it controlled rather than two separate tests:

| register | performed | shifted |
|---|---|---|
| R3 | `high_pitch_exp_fabio` 230.5 Hz | +12 → 201.8 Hz |
| R4 | `high_pittch_fabio` 316.7 Hz | +19 → 305.9 Hz (**11 Hz apart**) |

#### D1 and D2 answered

- **D1 → in-repo `voices/`.** *"That's a good place to place the voices, we can go with your
  recommendation."*
- **D2 → ~60 curated.** *"60 voices is fine. If anything is missing later on, we can work on
  it."* The count is a starting point, not a cap — so the import pipeline must stay
  re-runnable, which it was already specified to be.

**Phase 1 is unblocked.**

**Still open on Phase 0:** question (a) — does anger survive — see the next entry.

---

### 2026-08-25 — 🔴 THE PHASE 0 PREMISE IS WRONG. He performs angry in R4 unaided.

Phase 0 was written on Fabio's own statement, *"the only emotional performance I can do is
with my own voice"*, read as R1 at ~100 Hz. He then supplied three angry takes:

| take | median f0 | register | duration | voiced | chain |
|---|---|---|---|---|---|
| `recording_008` | 136.3 | R2 | 13.62 s | 32.3% | **denoised** |
| `recording_009` | 166.8 | R2 | 8.76 s | 21.4% | **denoised** |
| `recording_010` | **274.1** | **R4** | 7.08 s | 40.2% | raw |

**`recording_010` is an angry performance natively in R4** (260–340 Hz). None of these is at
his natural 101.5 Hz — anger itself carries him up, which matches the earlier note that *"when
he was angry he was pitched up a little bit, which is natural"*.

So the question Phase 0 exists to answer has changed shape. It was "where do R3–R5
performances come from, since he can only do R1". It is now **"which registers can he not
reach, and does the shift only need to cover those?"** He has demonstrated R2 and R4 angry.
R3 sits between two he can hit. The real gap is **R5 (340 Hz+)**, and possibly sustained R3
female.

That makes the shift a **fallback for the top of the grid**, not the foundation of it — a
much smaller dependency, and one the escape hatch already covers.

#### 🔴 The 1.5 Hz "controlled pair" was not controlled — Fabio caught it

`recording_008` shifted +12 lands on 277.3 Hz, **1.5 Hz from `recording_010`'s 274.1** —
same speaker, same emotion, same register, one shifted and one performed. It looked like the
cleanest possible test.

Fabio, unprompted: *"Recording 8 and 9 pass through my AI Noise Cancellation Filter.
Recording 10 is straight out of the microphone."*

**So the pair varies two things at once** — denoised-and-shifted vs raw-and-performed — and
any difference heard across it could be either. Comparing them would have produced a
confident wrong answer about the shift, on a card whose entire history is confident wrong
answers from measurements that agreed with each other.

`research/phase0c_angry.py` is therefore split into two chains, each clean within itself:

- **denoised chain**, all from 008: `+0` 136.3 / `+12` 277.3 / `+19` 399.0 (R5)
- **raw chain**, all from 010: `+0` 274.1 / `−12` 141.9 — also the first **downward** shift
  tested; every shift before this went up.

A properly controlled performed-vs-shifted answer still needs one more take: **an angry line
at his natural pitch, recorded RAW** (filter off).

#### A clipping bug in the shifter, surfaced by the same clip

`recording_008` peaks at 0.0 dBFS, and Change gender resynthesises to a slightly higher peak,
so the save clipped — 9 samples at +12, **49 at +19** — reported only as a Praat warning that
is easy to scroll past. `pitch_tools.shift` now attenuates to −6 dBFS *before* the shift.
Costs nothing, since `normalize` sets final loudness afterwards anyway. Re-shifted clean:
peaks −5.6 and −5.1 dBFS.

#### Phase 0b (performed vs shifted, neutral content) ran but is now the lesser test

Four runs, same character / text / seed, level-matched to −16.0 dB rms_active and staged at
`C:/Users/Fabio/Desktop/MPI622_perf_vs_shift/`. Key: `research/phase0b_answer_key.md`.

One number stands out without any listening: **the performed R3 arm's TTS stage ran 18.56 s
for a line the other three deliver in 6.2–8.0 s**, at 18.6% voiced. `high_pitch_exp_fabio`
is 32.6% voiced — a reference that is mostly not-speech gives the TTS stage little to lock
onto. The R4 performed arm did not do it (6.60 s, 69.4% voiced), so this is not "performed
clips break TTS". **The candidate authoring rule is voiced DENSITY, not performed-vs-shifted**,
and it would apply to both. n=1; the angry takes will test it further (008 is 32.3% voiced,
009 only 21.4%).

---

### 2026-08-25 — ✅ QUESTION (a) PASSES, and register turns out not to be independent of emotion

Fabio on D–H: ***"they all have a hint of anger."*** Including the shifted members of both
chains. Nothing lost its emotion across a +12, a +19 or a −12 shift.

His reservation is about **intensity, not survival**: *"it reads as upset, not extremely
angry... I guess my performance was more of a villain... Or maybe my performance was just
poor. I'm not an angry person."* So the ceiling on this test was the source performance, not
the transform. **That is question (a) answered: an offline formant-preserving shift carries
emotion through, and it carries through exactly as much as was in the clip.**

Combined with (b), **Phase 0 option 1 is validated** and options 2 (licensed emotional
corpora) and 3 (commissioned performers) are not needed. Neither is the escape hatch.

#### 🔴 REGISTER AND EMOTION ARE NOT ORTHOGONAL. `brief.md` § 2 assumes they are.

Fabio: ***"if I am angry, it's never gonna be my natural pitch. It's always gonna be
elevated because I am angry. I am emotional, right?"***

He is right, and his own takes measure it:

| take | median f0 | vs his natural 101.5 Hz |
|---|---|---|
| `recording_003` natural | 101.5 | — |
| `recording_008` angry | 136.3 | **+5.0 st** |
| `recording_009` angry | 166.8 | **+8.6 st** |
| `recording_010` angry | 274.1 | **+17.2 st** |

**Emotion moves pitch, so the grid's rows and columns are not independent.** The design in
`brief.md` § 2 is "registers × emotions", 6 emotions per register, as if a performer could
supply "R1 angry" and "R1 cheerful" at the same pitch. For a real performer **"R1 angry" may
not exist at all** — anger pushes you out of R1 by definition.

This does not break the design, but it changes what a cell means. Two readings, and the
choice is a product decision, not a measurement:

1. **Register = where the clip sits.** Honest to the recording, but then the grid is sparse
   and lopsided — the angry row lives higher than the flat row for every performer, and
   "R1 × Angry" is simply empty.
2. **Register = where the character sits, and the clip is shifted to meet it.** The grid
   stays full, and this is exactly what the shifter is for — it is now validated for both
   directions and out to at least ±19 semitones. Anger recorded wherever it naturally lands
   gets moved to the register the character needs.

**Reading 2 is the recommendation** and it makes the shifter load-bearing rather than a
fallback: not a way to reach registers Fabio cannot perform, but the thing that makes a
rectangular grid possible at all from performances that are inherently not rectangular.

#### The emotion set should match what a performer can deliver

Fabio: *"I'm not an angry person 😅 But I can do psychopathic characters and stuff like manic
characters. I'm good at that anyway."*

`brief.md` § 2 lists `Flat · Neutral · Angry · Sad · Cheerful · Whisper`. Those are generic
TTS-vendor emotion labels. For a **character** library, `Menacing` / `Manic` may be both more
useful to a user and more reliably authorable — a performer who can deliver them beats a
label nobody can perform convincingly. Not changed unilaterally; `brief.md` is the approved
design and this is a proposal.

#### 🔴 A rhotic defect in the output — "twain" for "train"

Fabio on F: *"F has a more sassy voice. But not a black woman, modern black woman sassy
voice, more like a white woman from 1935 sassy voice. Funny thing is that most of her R's are
missing. She doesn't say train, she says twain."*

An /r/ → /w/ substitution, not non-rhoticity (non-rhotic English drops post-vocalic R as in
"car", and leaves the /tr/ cluster alone). This is worth chasing because a shipped library
voice that cannot say its R's is unusable, and the fix depends entirely on which stage
introduces it.

Isolation staged at `C:/Users/Fabio/Desktop/MPI622_the_R_thing/`, level-matched, no GPU spent:

| file | what it decides if the defect is present |
|---|---|
| `1_the_character_itself.wav` | the raw `lib_f_midage_narration` clip — a **library curation** problem, drop the voice |
| `2_F_before_VC.flac` | the TTS stage — a **TTS** problem, and it would affect Flow B generally |
| `3_F_after_VC.flac` | clean until here means **VC** introduced it — the most serious of the three |

Open question worth his ear: whether the defect is in **all five** of D–H or only F. All five
share the character clip, so "only F" points at the performance clip and "all five" points at
the character.

#### My listening instruction was bad, and that is on me

I asked "does it still read as angry" across D/F/H without naming what would count as a
difference, so the question could not be failed or passed. Fabio: *"What did you expect me to
compare on D, F, and H?"* Fair. The comparison that was wanted: **F is the unshifted control
of that chain, H is the same clip shifted +12 and D the same clip shifted +19 — does the
anger weaken as the shift grows?** Say the axis and name the control next time.

#### My request for another take was also malformed

I asked for "an angry line at your natural pitch". Pitch was never the variable — **the
recording chain is**. What is needed is one angry take with the **noise-cancellation filter
OFF**, at whatever pitch anger takes him to, so a raw shifted clip can be compared against a
raw performed one without the denoiser sitting in the middle.

---

### 2026-08-25 — ~~THE VC STAGE CORRUPTS PHONEMES~~ — **WRONG, see the 0e entry below**

> **This entry's conclusion is retracted.** The R is present; it is the ACCENT. VC attenuates
> consonant articulation slightly but corrupts nothing, and Flow A is not defective. The
> isolation steps below are still accurate — only the diagnosis drawn from them was not.

Fabio ran the three-file isolation: ***"Number three still has it, the twain. Number one and
number two don't."*** And: ***"it was only F."***

| stage | R's intact? |
|---|---|
| `lib_f_midage_narration.wav` — the character clip itself | ✅ clean |
| `TTS_angry_R2_plus0` — the TTS stage, before VC | ✅ clean |
| `VC_angry_R2_plus0` — after VC | ❌ **"twain" for "train"** |

**`FL_ChatterboxVC` introduces an /r/ → /w/ substitution that neither of its inputs has.**
This is categorically different from the "lands halfway" behaviour already recorded on
MPI-607: that is the model under-converting, this is the model *corrupting*. It affects
**Flow A, which ships today**, and it would affect Flow B.

Not non-rhoticity — a non-rhotic accent drops post-vocalic R ("car") and leaves the /tr/
cluster alone. This is the Elmer Fudd substitution, in an initial cluster.

#### It hit exactly one of five runs, and that one is not arbitrary

| run | TTS source f0 | character | direction VC had to move pitch |
|---|---|---|---|
| D `+19` | 383.2 | 218.8 | down |
| E performed | 290.4 | 218.8 | down |
| **F `+0`** | **206.5** | 218.8 | **UP** ← the broken one |
| G `−12` | 229.2 | 218.8 | down |
| H `+12` | 365.9 | 218.8 | down |

**F is the only arm whose source sat BELOW the target voice's pitch.** Hypothesis: VC damages
consonants when it has to *raise* pitch to reach the target. That would hand guidance rule 3
("meet the target's pitch") the mechanism it currently lacks, plus an asymmetry it does not
currently state — **under the target would be worse than over it**.

`research/phase0d_vc_rhotic.py` tests it by deleting the TTS stage as a variable: every arm
feeds VC the **same** TTS output, pitch-shifted to a different distance from the same
character. `plus0` is left deliberately unshifted so the shifter cannot be blamed for the
known result.

| arm | source f0 | vs character |
|---|---|---|
| `plus0` | 206.5 | −1.0 st (known broken, unshifted reference) |
| `minus4` | 173.7 | −4.0 st |
| `plus2` | 242.8 | +1.8 st |
| `plus4` | 267.8 | +3.5 st |
| `plus7` | 314.9 | +6.3 st |

#### 🟢 Sarcasm resolves the register/emotion problem better than either option I offered

Fabio: *"angry can also have a natural tone, but with a hint of sarcasm. That's usually me
when I'm angry at people... That's a natural tone without exaggeration, but I'm angry."*
Then the load-bearing half: ***"But if in a case like that the user wouldn't ask for angry,
it would ask for a natural tone."***

**The emotion labels are DELIVERIES the user selects, not the performer's internal state.**
That reframes the whole orthogonality problem recorded above:

- "Angry" as a selectable label means the loud, elevated, obvious delivery. It living higher
  in pitch than "Flat" is not a defect in the grid — **that is what angry sounds like.**
- A low-pitched angry delivery is not "R1 × Angry". It is a **different label**, and it has
  no cell in `brief.md` § 2's set at all.

So the earlier claim that "R1 × Angry is empty" was right about the fact and wrong about the
conclusion. The cell is empty because that delivery has its own name, not because the grid is
broken.

**Refined proposal, replacing readings 1 and 2 from the previous entry:**

1. **`register` names the PERFORMER'S BASELINE, not the clip's measured pitch.** A clip for
   (R1, Angry) is recorded by an R1 performer and will measure higher than R1 — that is
   expected and correct. `median_f0` and `f0_p10_p90` are already stored per clip, so nothing
   in the record changes; only the definition of `register` needs pinning down, and it needs
   pinning down anyway.
2. **Add `Sarcastic` (or `Dry`) to the emotion set.** It is the low-register expressive
   delivery the current set has no slot for, Fabio can perform it natively, and by his own
   account it is how anger usually actually sounds in conversation.

This also demotes the shifter again — the grid does not need it to stay rectangular, so it
returns to being what Phase 0 validated it as: a way to reach registers a given performer
cannot cover. Both entries above overstated its role in opposite directions; this is the
settled reading.

---

### 2026-08-25 — 🔴 THE PITCH-DIRECTION HYPOTHESIS IS DEAD, and the sample is synthetic

Fabio on the sweep: ***"Every single one has a 'twain' word instead of 'train'."*** All five
arms, at −4.0, −1.0, +1.8, +3.5 and +6.3 semitones from the target. **So it does not track the
direction VC has to move pitch, and the previous entry's hypothesis is wrong.** Guidance rule
3 gains no mechanism from this.

He also noted file 2 is the mildest: *"still a little bit of twain, but the R is almost there,
and it's only the twain word. The rest seems natural."* Only that one word. Not "most of her
R's" after all — which matters, see below.

#### What the pattern actually shows

Every broken clip on this card descends from **one** TTS output (Phase 0c's F run). Phase 0d
fed that same output to VC at five different pitch distances and all five broke; Phase 0c fed
VC five *different* TTS outputs and only F broke. **The defect follows the TTS source, not the
character and not the pitch relationship** — and shifting the TTS output afterwards cannot
repair it, because by then the /r/ is already whatever it is.

Which means it was in that TTS output the whole time, even though it sounded clean. A human
listener repairs a weak /r/ from context. VC's decoder does not.

#### 🟢 Where the sample comes from — Fabio asked, and the answer reframes it

*"Where does this sample come from anyway? Its originality? If it comes from a child saying
this, then it makes sense."*

Not a child, and not a person. **`lib_f_midage_narration.wav` is synthetic** — generated
offline by Qwen3-TTS VoiceDesign from Fabio's own prompt
(`../MPI-607/research/design_voices.py`):

> *"Adult female, forties, **refined British accent**, low-mid pitch, unhurried tempo, rich
> timbre, calm narration."*

And he described it cold, before knowing any of this, as *"a white woman from 1935 sassy
voice"*. **That register is exactly where labiodental /r/ lives** — the [ʋ] of upper-class
early-20th-century British speech, which sounds like /w/ to nearly everyone else. The model
was asked for refined British and may have delivered the period-accurate article.

Two things are braided together in what he heard, and only one is a defect:

1. **Missing post-vocalic R's** (water, sailor, heart, clear) — **not a defect.** That is
   non-rhoticity, and it is correct for the accent that was prompted.
2. **"twain" for "train"** — /r/ → /w/ in a stop-onset cluster. Either the voice's own
   labiodental /r/, or VC damage. Still open.

#### 🔴 A voice's sample can hide the very quirk that defines it

The whole library set shares one fixed text (`LIB_TEXT` in `design_voices.py`):

> *"The old lighthouse had stood at the edge of the cliff for nearly two hundred years, and
> every sailor who passed it knew the story by heart. On a clear night you could see its beam
> sweeping across the water."*

Every R in it is post-vocalic — dropped correctly by a British voice, so nothing sounds wrong
— or buried mid-word. **There is no stop+/r/ onset cluster anywhere in it. It never says
"train".** So this voice's sample could never have exposed the behaviour, and a picker would
have sold it on a clip that hides it.

**This is a library-design requirement, independent of how the R question resolves:** the
sample and audition text must be **phonetically comprehensive** — stop+/r/ and stop+/l/
onsets, fricatives, sibilants, final stops. `brief.md` § 3 already requires auditions be
generated through the shipping route; this adds that the *text* must exercise the phonemes,
or the audition is decorative. A pangram-style sentence, not a pretty one.

`research/phase0e_whose_r.py` settles the remaining half with two arms: direct TTS from the
character clip with **no VC in the graph at all** (if that says "twain", the voice owns it),
and the same broken source VC'd into a non-British male character (if "twain" survives into
a gravel senior male, VC is carrying or creating it).

#### 🟢 The emotion-set proposals are WITHDRAWN — Fabio's argument is better

*"Sarcastic and dry, there is no point in doing those. We already have natural, I guess, or
deadbeat, or something like that. Robotic, like a monotone kind of thing. They all end up
being the same kind of thing."*

He is right: `Flat`, `Neutral`, robotic, monotone, dry and sarcastic all collapse into one
low-affect delivery, and `brief.md` § 2 already has two cells for it. Adding more would be
splitting one thing into five names. **Proposal withdrawn.**

*"Manic would be happy and angry at the same time. It would be great if we could mix emotions,
but that's not something the system we have offers... We can't realistically have a bunch of
cover-all emotions. There are too many emotions to cover."*

Also right, and it closes the taxonomy question for good: **do not chase an emotion
taxonomy.** The six in `brief.md` § 2 stand as-is.

But his own complaint has an answer already in the approved design, and it is worth stating
because it is a genuine argument FOR that design rather than a consolation: **a performance
clip is the one representation that CAN carry a mixed emotion.** No slider set expresses
happy-and-angry-at-once, but a performer doing manic produces it in a single take, and the
clip carries it whole. The library does not need emotion mixing — it needs the right clip.
Adding `Manic` later therefore costs one clip per register, exactly as `brief.md` § 2 already
says, and needs nothing from the model.

---

### 2026-08-25 — ✅ RESOLVED: there is no defect. It is the accent — and that answers an open MPI-607 gate.

Fabio on the three-file decider:

> *"Number one does have an R in train. No, 2 doesn't eat up the R completely, but it eats it
> up a little bit... It says it's a British woman. It's not a British woman... Sounds like a
> woman from New York in 1930. It does have the R there. It is just because of the accent
> that she's using. It feels like the R is almost gone, but when you repeat the train word
> several times, you can identify an R in there. Same thing with number three: it's a man with
> the same accent, an 1930s accent from New York... I'm getting that from the old Al Capone
> gangster movies."*

**Case closed. The R is there.** Heavily coarticulated by the accent, to the point of sounding
absent on one pass, but present on repeat listening. **Nothing is corrupting phonemes, the
character voice is not defective, and Flow A is not broken.** The previous entry's headline is
retracted in place.

**That is the second hypothesis of mine to die today** — first the pitch-direction one, then
this. Both were built on a real observation and both over-read it. The pattern in both: a
strong claim ("VC corrupts phonemes", "hits Flow A, which ships today") from a single listener
remark, before the control that would have cheaply falsified it. The control here cost 27
seconds of GPU.

#### What IS real, and it is smaller

**VC attenuates consonant articulation.** File 1 (direct TTS, no VC in the graph) has a
clearer R than file 2 (the same voice through VC). Mild, and consistent with everything else
on the card — VC softens, it does not break. Worth one line of guidance, not a card.

#### 🟢 ANSWERS AN OPEN MPI-607 GATE: accent survives VC, and it comes from the SOURCE

`MPI-607/checklist.md` carries an unticked item: *"Does the accent SURVIVE the VC stage?
(pipeline ends in VC, so an accent stripped at stage 2 is unshippable)"* — listed as gating
Flow B.

**Answered here, for free.** Files 2 and 3 share one source but target two utterly different
characters — a mid-age female at 218.8 Hz and a senior gravel male at 125.7 Hz. Fabio heard
**the same 1930s New York accent in both**. So:

- the accent **survives** VC (Flow B's gate opens), and
- it comes from the **SOURCE**, and the target character does **not** override it.

That sharpens MPI-607's "VC preserves accent, mannerism, rhythm" from a general statement into
a demonstrated one, at phoneme level, across a cross-gender target pair.

**Library consequence:** for a `character` voice, the accent the user hears is the
**performance clip's**, not the character's. So `accent` in the voice record describes the
voice as heard on the DIRECT route, and a `character`-route audition may not match it. The
picker must not promise an accent the VC route will not deliver.

#### 🔴 VoiceDesign's accent prior struck again — and it makes one manifest field untrustworthy

The prompt asked for a *"refined British accent"*. It produced, in Fabio's words, an Al Capone
gangster-movie New Yorker. That is MPI-607's already-recorded finding reappearing: *"Accent
via VoiceDesign — CLOSED NEGATIVE after 22 generations; American prior, not controllable."*
Confirmed again here, and this time it is visible on a voice that has been used as a reference
throughout this card while being labelled British in every table.

**Requirement for the import pipeline (Parallel Batch):** `accent` **cannot be taken from the
generation prompt or the source corpus metadata.** It has to be labelled from the clip itself.
Unlike `register` / `median_f0` / `f0_p10_p90`, there is no cheap measurement for it — so
either it is a human labelling pass, or the field ships empty rather than wrong. **A wrong
accent label is worse than a missing one**, because the picker's whole job is to let a user
choose a voice without auditioning all sixty.

#### Still worth one answer

Answered in the next entry, and it is the stronger claim.

---

### 2026-08-25 — 🔴 VC REPLACES THE TARGET'S ACCENT. The character's own accent does not survive.

Fabio on file 1 — direct TTS from the character clip, **no VC anywhere in the graph**:

> *"That file does not have an accent. It's just got a normal American accent, I guess, a
> modern one."*

So the character voice, cloned directly, is neutral modern American. And files 2 and 3 — the
same character through VC, and a completely different character through VC — both came out as
1930s New York. **The accent is not the character's. It arrives with the VC stage.**

| clip | route | accent heard |
|---|---|---|
| 1 | TTS from the character, **no VC** | modern American, neutral |
| 2 | same character, **through VC** | 1930s New York |
| 3 | gravel senior male, **through VC** | 1930s New York |

Files 2 and 3 share one thing only: the VC **source**. So the source's accent is imposed on
the output and the target's is **overwritten**, not blended. This is the earlier entry's
conclusion confirmed against a target whose own accent had been measured directly — the
version recorded there assumed the character was the 1930s voice, which was wrong.

Fabio also closed the R question completely: *"this type of accent, the New York Italian
mobster accent, they sometimes eat up the R's anyway, so on that kind of accent I think it's
normal."* Nothing left to explain.

#### Identity does not leak. ACCENT does. Those are different channels.

MPI-607 measured that character consistency HOLDS across performers — two performance clips
0.47 apart drove one character and Fabio still heard one actor. That still stands, and it is
not in tension with this: **timbre/x-vector identity comes from the target, articulation and
prosody come from the source.** VC transplants the voice and keeps the speech.

#### 🔴 CONSEQUENCE FOR PHASE 2, and it is the biggest one on this card

**Whoever records the performance clips sets the accent of every `character` voice in the
library.** A character voice is only ever heard through the VC route, so its own accent — the
thing a user picks it for — is never delivered. Sixty voices with sixty accent labels would
all speak in the accent of the performance clip grid.

Three consequences, in order of how much they cost:

1. **The `accent` field is meaningless for `kind: 'character'`.** It describes the direct
   route only. Either hide it in the picker for character voices, or label it as what it is.
   This upgrades the earlier "the picker must not promise an accent the VC route will not
   deliver" from an inference to a measured requirement.
2. **The clip grid needs an accent decision before authoring starts.** If Fabio records all of
   R1–R5, every character in the library inherits his articulation. That may be entirely fine
   for v1 — it is one consistent house accent, and Flow A users hear their OWN accent anyway
   because they are the source. But it is a decision, not an accident, and it is much cheaper
   to make now than after 12–30 clips exist.
3. **It is also an opportunity.** Accent could become a real axis of the grid — the same
   emotion recorded by performers with different accents — which would give the library
   something a per-voice `accent` label was never going to deliver on the character route.
   Strictly a later card; noted so the option is not closed off by how Phase 2 is filed.

#### 🟢 And it makes Flow A's copy honest

Flow A's promise is "your laugh, your breath, your timing, in someone else's voice". The user
IS the source there, so their accent surviving is the feature, not a bug. This measurement is
the evidence for that copy — and simultaneously the evidence that the *character's* accent is
not on offer. Both belong in the guidance rewrite already pending on
`docs/playbooks/add-flow/existing-flows/voice-changer.md`.
