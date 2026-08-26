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
not on offer. Both are now written into
`docs/playbooks/add-flow/existing-flows/voice-changer.md` (rule 3 plus a new channel table).

---

### 2026-08-25 — ✅ DECIDED: the performance clips are AUTHORED, not recorded. Phase 2 unblocks.

The accent decision, answered by Fabio the moment it was put to him:

> *"I've heard better performances than my own from the clips that we have or created with
> Voice Design, especially for Angry. Not to mention, my accent is not great. I'm not English
> native."*

**The R1–R5 × emotion grid is authored offline with Qwen3-TTS VoiceDesign, not recorded by
Fabio.** Two independent reasons, and either alone would decide it:

1. **Quality.** The VoiceDesign clips out-perform his own takes, most clearly on Angry — the
   emotion he had already said is not his strength (*"I'm not an angry person"*).
2. **Accent.** He is not a native English speaker, and VC overwrites the target's accent with
   the source's. So recording the grid himself would stamp a non-native accent onto **every
   `character` voice in the library**, whatever each voice's own accent label said.

This is the same authoring route the character clips already came from — offline, Apache-2.0,
and never an app dependency, so it does not touch "Qwen3-TTS is never shipped".

#### 🟢 The inversion: a CLOSED-NEGATIVE finding turns into the thing that makes this work

MPI-607 closed accent-via-VoiceDesign as NEGATIVE after 22 generations: *"American prior, not
controllable."* That was a defeat when the goal was to author voices with **chosen** accents.

Here the goal is the opposite — one consistent house accent across the whole clip grid — and an
uncontrollable prior delivers exactly that, for free. The direct-route control measured it
plainly: neutral modern American, no accent to speak of. **That is the correct default for a
character library**, and it is what the grid now inherits.

So the finding does not need reversing, only re-reading. It stays NEGATIVE for accent
*selection* and is an asset for accent *consistency*.

#### What this changes, and what it does not

- **Phase 2 is UNBLOCKED.** No recording sessions, no performer sourcing, no licensing
  exposure. The grid is authorable entirely in-house today.
- **Phase 0's shifter is not obsolete — it demotes to a repair step.** It is validated to
  ±19 semitones with no artefacts and with emotion intact, so when a VoiceDesign take lands
  off its target register it gets moved rather than re-rolled. It is no longer the *source* of
  any register.
- **Fabio's own recordings stay useful as controls**, which is what they were used for all
  session. They are not library material.
- **Emotion labels still need judging by ear, per clip.** MPI-607 already measured that
  VoiceDesign's delivered emotion is approximate (*"B is not really sad, it's a sad-angry kind
  of thing"*), and this session added a labelled-angry clip that read as "upset". Phase 2's
  verify mode is already `user-ux` for exactly this reason — do not trust the prompt's label.
- **The two-number QA gate still applies** to every authored clip: cosine AND median-f0 delta.

---

### 2026-08-25 — Phase 2: the 12 clips are authored, and emotion moves pitch TWICE as far in R1 as in R3

`research/phase2_perf_clips.py`, run under the GPU lease against Qwen3-TTS VoiceDesign in
the `_qwen_tts_rt` venv (transformers 4.57.3, torch 2.12.0+cu130, CUDA). **12/12 generated,
no failures**, ~20 s each, 24 kHz. One shared text across the whole grid so emotion is the
only axis — and built phonetically comprehensive on purpose, because VC takes articulation
from the SOURCE, so every `character` voice in the library inherits these clips' consonants.

#### Measured grid

| clip | median f0 | p10–p90 | reads as | vs its own neutral |
|---|---|---|---|---|
| `perf_R1_neutral` | **94.7** | 78.7–110.2 | R1 ✅ | — |
| `perf_R1_flat` | **104.5** | 84.3–123.5 | R1 ✅ | +1.7 st |
| `perf_R1_sad` | **98.0** | 67.3–114.6 | R1 ✅ | +0.6 st |
| `perf_R1_whisper` | **100.9** | 61.6–120.0 | R1 ✅ | +1.1 st |
| `perf_R1_angry` | **167.3** | 119.3–217.6 | R2 | **+9.9 st** |
| `perf_R1_cheerful` | **185.1** | 152.1–217.6 | R2 | **+11.6 st** |
| `perf_R3_neutral` | **211.4** | 164.9–275.7 | R3 ✅ | — |
| `perf_R3_flat` | **226.5** | 178.8–285.9 | R3 ✅ | +1.2 st |
| `perf_R3_sad` | **221.4** | 72.3–248.5 | R3 ✅ | +0.8 st |
| `perf_R3_whisper` | **222.6** | 207.7–251.4 | R3 ✅ | +0.9 st |
| `perf_R3_angry` | **278.1** | 241.4–381.0 | R4 | **+4.8 st** |
| `perf_R3_cheerful` | **272.5** | 233.2–381.0 | R4 | **+4.4 st** |

#### 🟢 The baselines are CORRECT — do not "repair" the two high cells

A later session reading the `register` column above will be tempted to shift `angry` and
`cheerful` back down into their declared bands. **That would destroy the emotion, because the
pitch lift IS the anger.** `register` names the PERFORMER'S BASELINE, never the clip's f0 —
already documented in `js/data/voiceLibrary.js`'s header and in brief.md § 2, and this grid is
what it was documenting. The proof the persona prompt worked is that **every low-arousal cell
(flat / neutral / sad / whisper) lands inside its declared band on both registers** — 94.7–104.5
in R1 90–130, and 211.4–226.5 in R3 190–260. Eight of eight. The persona held; the emotion moved.

The Phase 0 shifter stays a repair step for a take whose BASELINE is wrong — a "low male"
prompt that delivered a woman — not for emotion-driven lift.

#### 🔴 NEW, and not predicted: the lift is register-ASYMMETRIC, roughly 2:1

R1 lifts **+9.9 / +11.6 st** for angry / cheerful. R3 lifts only **+4.8 / +4.4 st** for the same
two directions, from the same prompt grammar. Low male has far more headroom above its baseline
and VoiceDesign uses it; high female is already near the top of its comfortable range.

Why it matters, and why it is a listening question rather than a settled one: this card measured
that **performer pitch leaks hard** — two clips 0.47 apart drove one character to outputs 93 Hz
apart, and Fabio still heard **one actor** (brief.md finding 4). The R1 grid's internal spread is
94.7 → 167.3 Hz = **72.6 Hz**, comparable to that 93 Hz precedent, so the precedent predicts it
holds. But it is close enough to the edge that it must be heard, not assumed. **If one R1
character sounds like two different people across the six emotions, this asymmetry is the cause
and R1 is where it will show first.**

#### Loudness: 7.4 dB spread, normalised to 2.9 dB, and the residual is structural

Raw `rms_active` ran −18.4 (R3 angry) to −25.8 (R1 whisper) = **7.4 dB**, far past the ~1 dB
threshold of noticing and exactly the confound that nearly decided a result by loudness alone on
this card. `pitch_tools.py norm` brought it to −16.0…−18.9 = **2.9 dB**. The residual is the
−1.0 dBFS peak ceiling clamping high-crest clips before their RMS reaches target, not a tool
failure — and it lands the *right* way round: R1 angry is now the QUIETEST cell (−18.7) and
whisper among the loudest (−16.0), so loudness is no longer helping the high-arousal reads.
Level-matched set is the one to audition; originals kept beside it.

#### One anomaly logged, NOT explained — do not write a rule on it

`perf_R3_sad` has p10 = **72.3 Hz** against a p90 of 248.5 — a floor an octave and a half below
its own median, where every other R3 cell sits at 165–242. Either genuine creak on a breathy sad
read, or a `pyin` octave error. It does not affect the median and the clip may be perfectly
usable. Flagged so the next session does not rediscover it as a bug; resolve it by ear, not by
theory. (`perf_R1_whisper`'s p10 of 61.6 is NOT an anomaly — a whisper has little voiced tone, so
pyin is unreliable there by construction.)

#### Still open on Phase 2

The verify has two halves and only the first is done. **Half (a) is answered**: measured f0 per
clip, baselines in band, recorded above. **Half (b) is not** — "driving one R1 character through
all six produces six distinguishable emotions" needs the Chatterbox VC route and Fabio's ear, and
its verify mode is `user-ux`. Do not trust the prompt's label: MPI-607 measured a "sad" clip as
"a sad-angry kind of thing", a labelled-angry clip read as "upset", and a "refined British" prompt
produced a 1930s New Yorker.

Clips: `scratchpad/phase2_clips/` (originals) and `scratchpad/phase2_clips_lvl/` (level-matched).
They are NOT yet in `voices/` — that tree was under an active write claim by the import-pipeline
worker while this ran.

---

### 2026-08-25 — The Parallel Batch: import pipeline + MpiVoicePicker, both landed

Two workers, disjoint trees, dispatched through `mpi-execute-parallel`. Both reported done;
both were then verified independently, and **each had one real defect the report did not
name**. Recording that here because the pattern is the point: a worker's report is evidence,
not truth.

#### What shipped

| | path | state |
|---|---|---|
| Import pipeline | `scripts/voice-library/ingest.py` | 10-voice sample imported, re-runnable |
| Bundle | `voices/manifest.json` + 10 `.opus` | 464 KB, `performanceClips: []` |
| Picker | `js/components/Compounds/MpiVoicePicker/{js,css}` | mounts in the dev gallery |
| Wiring | `preloadStyles.js`, `types.js`, `pages/components.js`, `tpl-components.html` | registered |

**Verified by me, not taken on report:** `npm run lint:components` exit 0; full suite
**737/737**; 10/10 manifest contract checks against the shipped Phase 1 loader; idempotence
proven by identical SHA (`8d179ac2f94c00f1…`) across a second run.

Calibration held, and it was checked against figures from an independent tool rather than
the pipeline's own: `e0_neutral` measured **223.9** vs the recorded 225.2 (1.3 Hz), and
`A3_REF` **125.7** vs 125.7 (0.0 Hz). Both inside the card's 2 Hz gate.

#### 🔴 Defect 1 — the picker leaked a component instance on every voice click

`_renderDetail()` set `detailEl.innerHTML = …`, wiping the `MpiRadioGroup` and `MpiButton`
it had mounted on the previous selection **without calling their `destroy()`**. Their
teardowns were pushed onto the component-wide `_unsubs`, so they only fired at
`el.destroy()` — meaning every voice a user clicked retained a dead component instance plus
its detached DOM subtree, held alive by the closure in `_unsubs`.

This is the exact rule CLAUDE.md states: *navigation MUST call `instance.destroy()` before
clearing a mounted Block (never `innerHTML = ''` alone)*. The worker's own report described
the accumulation as "intentional", which is what made it worth checking rather than
accepting.

Fixed at the root, not patched: the detail panel now owns its own lifecycle through a
separate `_detailUnsubs`, flushed at the top of every `_renderDetail()` — **before** the
early returns, since hiding the panel is a teardown too — and again in `el.destroy()`. The
filter dropdowns stay on `_unsubs`, because they mount once and live for the component.

#### 🔴 Defect 2 — the bundle was twice the size it needed to be, on a false premise

The pipeline resampled every clip to **48 kHz** before the Opus encode, and the worker
escalated the resulting size as a decision for Fabio, on the stated grounds that *"soundfile
does not expose a bitrate knob for Opus"*.

**That premise is wrong**: `soundfile.write` takes both `compression_level` and
`bitrate_mode`. Probed on one 10 s clip:

| encode | bytes | rate |
|---|---|---|
| 48 kHz, default | 77283 | 61.8 kbps |
| **24 kHz, default** | **40225** | **32.2 kbps** |
| 24 kHz, `compression_level=1.0` | 8132 | 6.5 kbps |

So the fix was not a bitrate knob at all — it was the sample rate. Opus accepts only
8/12/16/24/48 kHz; the `_enhanced` source clips are **32 kHz**, which is not one of them, so
*a* resample is unavoidable — but 48 kHz was the wrong target. 24 kHz is the rate the plain
kyutai clips already ship at and the rate the TTS/VC stack runs at, so nothing downstream
gained anything from the upsample. Changed to 24 kHz: **772 KB → 464 KB** for ten voices,
44 KB/voice.

`compression_level` was deliberately left alone. It binds, but the libsndfile default already
sits near 0.9, and 1.0 collapses to 6.5 kbps — which would wreck a clip whose entire job is
to carry a voice's identity.

**This dissolves the escalation rather than answering it.** At the decided ~60 curated voices
(D2) the bundle is **2.5 MB**, inside D1's 5 MB estimate. Even all 228 would be 9.6 MB. There
is no size decision for Fabio to make. The worker's 17 MB figure assumed all 228 at 48 kHz —
two wrong assumptions compounding, and D2 already ruled out the first.

#### 🟡 Curation findings for the full run — NOT bugs

The 10-voice sample is alphabetical, not curated, and it shows:

- **Register spread is poor**: 6×R1, 3×R2, 1×R3, and no R4 or R5 at all. D2 chose ~60
  *curated* voices specifically for register spread, so the full run needs a selection pass,
  not just `--max 60`.
- **Every voice is `kind: "both"`**, which makes the kind filter inert — all ten answer both
  the narration and character filters. A defensible import default, but a human pass has to
  split them or the picker's first filter does nothing.
- **`gender`, `age`, `language`, `style`, `tags` are all `null`.** Correct behaviour — the
  corpus does not carry them and guessing is banned by the same rule that bans guessing
  `accent` — but it means those filters are dead until the curation pass. 189 of the 228 IDs
  are readable names (`Antoine Vala`), which is a starting point for `gender`/`language` but
  is not evidence on its own.

#### Still open

- Full 228-voice run not done; only 10 imported. The pipeline handles it (`--force` re-does
  an existing bundle, which is what the 24 kHz change needed).
- Auditions are `null` pending Phase 3.
- The picker is not wired into any Flow — that is MPI-607/MPI-621 territory and those
  registries are held by a live peer session.

---

### 2026-08-26 — The level-matching tool WIDENED the gap it exists to close

Fabio on the R1 identity pair (ask 2): *"It could be the same person, yes. The thing is,
neutral is really close to the mic, and angry feels like it's down the street. Probably
because of volume changes or normalisation."*

**Identity: soft PASS.** He could not separate them as two people, which is what ask 2 asked.
The register-asymmetry worry — R1 lifting +9.9 st for angry — does not sink the R1 grid.

But "down the street" is a ROOM word, not a level word, so it had to be split before he judged
the six emotion labels, or the same confound would have contaminated ask 1 too.

#### The two hypotheses, and the cheap control that separated them

- **H1 level** — the norm pass left angry quieter.
- **H2 room** — VoiceDesign rendered a genuinely more distant acoustic space for the angry
  direction. Distance is carried by HF rolloff, not loudness, so it would SURVIVE level
  matching and would need a prompt fix rather than a gain fix.

`research/`-adjacent probe (`scratchpad/proximity_probe.py`), measuring HF/LF band ratio,
spectral centroid and crest factor:

| clip | HF/LF | centroid | crest |
|---|---|---|---|
| `perf_R1_neutral` | −3.6 dB | 2253 Hz | 17.0 dB |
| `perf_R1_angry` | −3.4 dB | 2370 Hz | 19.7 dB |
| **delta** | **+0.1 dB** | **+117 Hz** | +2.7 dB |

**H2 is dead.** A distant source loses highs; the angry clip loses none and is fractionally
brighter. There is no spectral distance cue. The impression was level.

#### 🔴 The finding that matters: `pitch_tools.py norm` under-levels high-crest clips

In the RAW clips, R1 angry and R1 neutral sat **1.5 dB** apart on `rms_active`. After the norm
pass they sat **2.0 dB** apart. The tool widened the gap.

Cause, and it is structural rather than a bug in the numbers: `norm` targets `rms_active` but
clamps at a −1.0 dBFS peak ceiling. A high-crest clip (angry: crest 19.7 dB, from hard
consonant transients) hits that ceiling before its RMS reaches target, so **the clip with the
loudest peaks ends up with the quietest body**. Across the twelve it left a 2.9 dB residual,
which I reported at the time as "structural, and it falls the safe way" — that reading was
half right. It is structural, but it is not safe: it bit on the exact comparison the constraint
"LEVEL-MATCH EVERY LISTENING TEST" exists to protect.

**Fix for any future listening set:** match `rms_active` exactly at a target low enough that no
clip needs limiting (−20 dBFS worked here — all six R1 clips landed with peaks between −2.3 and
−5.6 dBFS, nothing clipped, no ceiling engaged). Do not use a peak ceiling when the axis being
judged is anything other than loudness.

Matched set: `scratchpad/phase2_R1_matched/`.

#### Predicted for the emotion listen, from the same measurement

`perf_R1_sad` (centroid 3490 Hz) and `perf_R1_whisper` (3631 Hz) are far brighter than the
other four (2253–2418 Hz). Whisper is expected — it is noise energy, not voiced tone. **Sad
being up there means it came back breathy**, which is a delivery choice VoiceDesign made and
not one the prompt asked for. Flagged before the listen so it is a prediction rather than a
post-hoc explanation of whatever Fabio hears.

**ASK 2 ANSWERED 2026-08-26 - CLEAN PASS.** Fabio on the exactly level-matched R1 pair:
*"yeah, it's the same guy."* Identity survives a 72.6 Hz / +9.9 st emotion-driven lift within
one register. The register asymmetry is a property to RECORD, not a defect to fix - and the
first listen's "down the street" was entirely the peak-ceiling artefact above, since it
disappeared on an exact level match. Ask 1 (do the six read as their labels) is still open.

---

### 2026-08-26 — Ask 1: five of six emotions read correctly. FLAT is the one that failed.

Fabio, on the exactly level-matched R1 set: *"what is flat supposed to sound like? The other
ones are right."*

**PASS: angry, sad, cheerful, whisper, neutral.** VoiceDesign delivered the labelled emotion on
five of six — a better hit rate than MPI-607 saw, and it vindicates authoring the grid rather
than recording it.

A prediction made BEFORE the listen was half wrong and is recorded as such: `perf_R1_sad`
measured breathy (centroid 3490 Hz, up near whisper's 3631 against ~2250 for neutral) and I
flagged it might read as breathy-sad rather than heavy-sad. It read as sad. The breathiness is
real in the spectrum and simply did not cost the label.

#### FLAT FAILED, and the measurement says so independently of taste

The question *"what is it supposed to sound like"* is itself the finding: the cell did not read
as anything in particular. Flat is the one emotion DEFINED by absence of pitch movement, so it
is measurable — and it measures wrong.

| emotion | p10–p90 span |
|---|---|
| neutral | 5.8 st |
| cheerful | 6.2 st |
| **flat** | **6.6 st** |
| sad | 9.2 st |
| angry | 10.4 st |
| whisper | 11.5 st |

**Flat moves in pitch MORE than the natural conversational read.** It should be the narrowest
of the six by a clear margin; a true monotone is 1–3 st. What VoiceDesign produced is a mildly
bored delivery, not an affectless one — which is precisely why it does not sound like a
recognisable thing.

The original direction already contained *"even monotone delivery"* and *"deliberately
lifeless"*, and the model honoured neither. That is the standing rule again, one step worse:
the prompt LABEL is not trustworthy, and here the prompt CONTENT was not honoured either.

#### The fix, and the gate it must pass

`research/phase2_reroll_flat.py` — four wordings of the same instruction (the original kept as
a control, so the re-roll must be shown to BEAT it rather than merely differ), × R1 and R3.
**The gate is objective: accepted only if p10–p90 span ≤ 3.5 st, against the 5.8 st the neutral
cell reaches without trying.**

Judging this cell by ear ALONE is what let the bad take through: "flat" and "a bit dull" are
indistinguishable in isolation and separate only against the rest of the grid. Every other
emotion on this card is an ear call; flat is the one with a number attached, and the number
should be used.

#### What flat is FOR — the question came up because the answer lives only in brief.md

The soulless read: a robot, or a character losing their demeanour mid-scene. It is a CLIP and
never a bypass, so that routing it through VC keeps the actor identical across the
transformation — the beat where switching actor would hurt most. True robot voices are post-FX
(vocoder / ring-mod / formant shift) on any voice: a later card, not the TTS model's job.

**Worth surfacing in the picker UI.** If Fabio had to ask what the emotion means, a user
choosing between "Flat" and "Neutral" in a dropdown has no chance. That is a one-line
description per emotion in `MpiVoicePicker`, not a new mechanism.

---

### 2026-08-26 — 🔴 MY HYPOTHESIS WAS WRONG: the flat cell is SEED variance, not prompt wording

I claimed VoiceDesign "did not honour the prompt content" for `flat` and that naming the
constraint harder would fix it. **That is false, and it was falsified by the control I put in
the same run rather than by anything cleverer.**

`research/phase2_reroll_flat.py`, four wordings × two registers, R1 results:

| variant | span | |
|---|---|---|
| **`v0_original`** — *the exact wording of the rejected take* | **2.9 st** | ✅ only one under the 3.5 st gate |
| `v1_no_inflection` | 6.0 st | worse than neutral |
| `v2_emotionless` | 6.3 st | worse than neutral |
| `v3_dictation` | 7.0 st | worse than neutral |

The rejected take was v0's wording at **seed 2002** → 6.6 st. The same wording at **seed 3000**
→ **2.9 st**. Identical words, less than half the pitch movement. Meanwhile all three of my
"harder" phrasings landed *looser* than the natural conversational read (5.8 st) — the exact
opposite of their intent.

**The lever is the seed. The prompt was already correct.** Had I dropped the control and
shipped a reworded prompt, I would have reported a fix that was a coin-flip, and the reworded
prompt would have been actively worse on average. This is the card's own standing rule —
*run the cheap control before the strong claim* — earning its place a fourth time.

#### The measurement that matters for authoring: this cell is a LOTTERY, so gate it

Flat's span across five same-wording generations spans 2.9–7.0 st. That is not a prompt to be
perfected; it is a distribution to be sampled and filtered. Every other emotion on this grid
landed first try, so **flat is the one cell that needs generate-and-measure rather than
generate-and-listen** — and it is the one cell where a number can decide, because flat is
defined by absence of pitch movement.

Next step is therefore a seed sweep on the unchanged wording
(`research/phase2_flat_seedsweep.py`, 8 seeds × R1 and R3), keeping the narrowest span.

#### Two open problems the re-roll surfaced

- **R3 has no candidate.** All four wordings clustered 6.0–7.1 st against a 3.5 st gate —
  nothing to pick, and the best was one of the rewordings rather than v0. R3 may simply be a
  harder cell to flatten, or it may need more seeds. Unresolved; the sweep will say.
- **The R1 winner drifted below its band** — median 81.5 Hz, under R1's 90 Hz floor and 2.6 st
  below the neutral cell. Unlike angry/cheerful, `flat` is LOW-AROUSAL and should sit near the
  performer's baseline, so this is a wrong BASELINE, not correct emotion-driven lift — the one
  case where the Phase 0 shifter legitimately applies (validated ±19 st, no artefacts, emotion
  intact). Shift it up ~2.6 st rather than re-rolling, if the sweep produces nothing both
  narrow and in-band.

---

### 2026-08-26 — FLAT ACCEPTED. Phase 2 is 12/12, and Fabio defined the emotion better than the brief did

Fabio on the level-matched flat/neutral set: *"flat old sounds a bit, almost on the angry side.
It's got a bit too much emotion. That's why I asked 'what is flat supposed to be?' The new flat
sounds like the person is in shock, which is actually what flat is supposed to be, I think.
Like, it's soulless, in shock, or just empty or not paying attention. It's good."*

**All twelve cells now pass by ear.** The seed-sweep winners replace the rejected flat takes:
R1 seed 3600 (2.5 st span) and R3 seed 3300 (4.2 st).

#### 🟢 Use his words as the picker's description string

*"Soulless, in shock, or just empty — not paying attention."* That is clearer than brief.md's
"the soulless read (robot, or a character losing their demeanour mid-film)", and it comes from
the one person on this project who had to ask what the emotion meant. **If he had to ask, a
user choosing between "Flat" and "Neutral" in a dropdown has no chance** — so every emotion
needs a one-line description in `MpiVoicePicker`, and this is Flat's.

His diagnosis of the failed take is also the definition working in reverse: *"almost on the
angry side, too much emotion"* is exactly what a 6.6 st span predicts. Ear and measurement
agreed, independently, on both takes.

#### 🔴 The gate I set was calibrated on the wrong register

Second correction in this line of work, and this one is my instrument rather than my
hypothesis. The absolute ≤3.5 st gate came from R1's neutral (5.8 st) and was then applied to
R3 — whose neutral is naturally **8.9 st**, far wider. So the same absolute number was a much
harder test for R3, and it produced a false "R3 has no candidate at all".

Relative to each register's own neutral the two winners are equivalent:

| | neutral span | flat span | flat as % of neutral |
|---|---|---|---|
| R1 | 5.8 st | 2.5 st | 43% |
| R3 | 8.9 st | 4.2 st | 47% |

**The gate for any future emotion cell must be relative to that register's neutral, never an
absolute semitone count.** Registers differ in natural expressiveness and an absolute threshold
silently encodes one register's habits as the standard.

#### Flat sits BELOW its band, and that is correct — do not shift it

The sweep showed span and pitch are anti-correlated in R1: every narrow candidate is low
(2.5 st → 83.4 Hz, 2.9 → 81.5, 3.1 → 73.0) and every in-band one is wide (5.5 → 94.7,
7.4 → 98.6, 8.5 → 110.7). A monotone read sits at the bottom of the speaker's range. So R1
flat landing at 83.4 Hz, under R1's 90 Hz floor, is *caused by* being genuinely flat — the same
relationship as angry's upward lift, in the other direction.

**Not shifted, on the same rule that forbids shifting angry back down.** Identity already
survived a 72.6 Hz upward spread (ask 2); an 11 Hz downward drift is not a risk. The Phase 0
shifter stays reserved for a persona that came back as the wrong person, not for a cell that
correctly reflects its emotion.

#### Shipped

`voices/performance/` — 12 opus clips, 489 KB, 24 kHz (same rationale as the voice bundle).
`manifest.performanceClips` written and verified: the loader accepts all twelve, the R1 and R3
grids each return their six emotions, and an unknown register still throws.

Each clip carries `median_f0`, `f0_p10_p90`, `pitch_span_st`, `measured_register` and — for the
flat cells — the **seed**. The seed is real provenance here: flat's span ranged 2.5–8.5 st
across eight generations of identical wording, so the cell is a lottery and the winning ticket
number is worth keeping.

#### Two measurement artefacts recorded so nobody re-discovers them as bugs

- `perf_R3_sad` reports a **21.4 st** span, from the p10 = 72.3 Hz outlier logged earlier
  against a p90 of 248.5. Creak or a `pyin` octave error. **The audio is fine** — Fabio passed
  sad by ear — so this is the measurement misreading the clip, not the clip being wrong.
- **Whisper spans are meaningless in both directions** (R1 11.5 st, R3 3.3 st). A whisper has
  little voiced tone, so `pyin` has almost nothing to track. Do not rank whisper by span, and
  note that R3 whisper's 3.3 st would otherwise "beat" flat's 4.2 st and look like a defect.
