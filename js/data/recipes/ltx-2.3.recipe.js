/**
 * Recipe: LTX 2.3 (text-to-video, native audio-visual joint generation).
 *
 * Synthesized from `dev-docs/recipe-research/ltx-2.3/research.md` (six-source
 * community deep-dive + official Lightricks docs + fal.ai guide). The base
 * systemPrompt is adapted from the proven LTX entry in
 * `dev-docs/enhancer_prompts.md`, refined by the research findings.
 *
 * STATUS: `draft` — NOT yet validated on the real LTX 2.3 model.
 * Promotion to `validated` runs through the MPI-6 playbook Phase 4
 * (hand-test on the target model by Fabio). Do not treat its output as
 * trusted until then.
 *
 * Key LTX 2.3 characteristics captured here:
 * - Native joint audio-visual generation (audio is a first-class prompt target).
 * - Six-Element Framework: Shot Establishment → Scene Setting → Action
 *   Progression → Character Definition → Camera Movement → Audio Integration.
 * - Negatives expressed as positive-direction guardrails in the main prose
 *   (`inline-positive`); no separate negative-prompt field.
 * - Formal cinematographic syntax (focal lengths, named camera moves) is
 *   interpreted as direct hardware instructions.
 *
 * VENDOR REWRITER READ, 2026-08-17 (MPI-27 step-0 survey). The shipped LTX
 * enhancer system prompts live in **`Lightricks/LTX-2`**, at
 * `packages/ltx-core/src/ltx_core/text_encoders/gemma/encoders/prompts/`, pulled
 * at HEAD via `gh api`. Four files: `gemma3_{t2v,i2v}_system_prompt.txt` and
 * `gemma4_{t2v,i2v}_system_prompt.txt`.
 *
 * ================================================================
 * WRONG VERSION READ — the merge below came from `gemma4_*`, which is
 * **LTX-2.5's** rewriter, not LTX-2.3's. UNRESOLVED (2026-08-17, MPI-27).
 * ================================================================
 * `base_encoder.py:84-90` selects the rewriter BY THE ENHANCER's `model_type`:
 * `gemma3` → `gemma3_*_system_prompt.txt`, `gemma4` → `gemma4_*`. And
 * `MODELS-LTX-2.3.md` names this model's text encoder as **Gemma 3**
 * (`google/gemma-3-12b-it-qat-q4_0-unquantized`), while
 * `encoder_configurator.py` states the split outright — line 112 "LTX-2.3 /
 * gemma3 checkpoints", line 118 "(LTX 2.5 / gemma4)". So LTX-2.3's own
 * rewriter is `gemma3_t2v_system_prompt.txt`, and the four rules below marked
 * [2.5-ONLY] came from the model Lightricks shipped AFTER this one.
 *
 * Three of the merged rules are CONTRADICTED by `gemma3_t2v`, not merely
 * unsupported by it:
 * - [2.5-ONLY] "roughly 150–220 words". `gemma3_*` states NO word target at
 *   all. So the budget move (340 → a 110–260 contract) took LTX-2.5's taste,
 *   and the watch item below — the overlong tier's worst run at 241 against a
 *   260 ceiling — is headroom measured against an imported bound.
 * - [2.5-ONLY] the closing AESTHETIC QUALITY pass ("richly saturated
 *   film-grade colour", "warm cinematic lighting"). `gemma3_*` demands the
 *   OPPOSITE register: "Restrained language: Avoid dramatic/exaggerated
 *   terms", "Colors: Use plain terms ('red dress'), not intensified ('vibrant
 *   blue')", "Lighting: Use neutral descriptions ('soft overhead light'), not
 *   harsh". Slot 7 currently instructs the exact language 2.3's rewriter bans.
 * - [2.5-ONLY] camera motion "always stated". `gemma3_*` says "Camera motion:
 *   DO NOT invent camera motion unless requested by the user"; `gemma4_*` says
 *   "Camera movement is expected and good". A direct reversal between the two.
 * - [2.5-ONLY] the collective-nouns reversal. `gemma3_*` gives no count
 *   guidance either way (it asks for gender/clothing/hair/expressions and "DO
 *   NOT invent unrequested characters"), so on 2.3 the reversal is
 *   unsupported rather than contradicted.
 *
 * CORROBORATED BY BOTH, so these stand whichever model is targeted: no "The
 * scene opens…" opener, one continuous unlabelled paragraph with no markdown,
 * a complete soundscape with dialogue quoted exactly, chronological flow.
 *
 * RESOLVED against `gemma3_*` on 2026-08-17 (Fabio). Three rules changed, and
 * the twice-green counter is RESET — the 30/30 measured a text merged from the
 * wrong model line and does not carry over.
 *
 * 1. BUDGET — the 150–220 instruction is gone and the contract widened to
 *    110–300 as a runaway guard. `gemma3_*` states no target, so the
 *    seven-sentence unit is the only length control with anything behind it.
 * 2. REGISTER — slot 7 no longer runs an aesthetic-quality pass. It closes on
 *    concrete secondary detail, and a restrained-language rule now applies to
 *    the whole caption per `gemma3_*` ("plain terms ('red dress'), not
 *    intensified"; "neutral descriptions ('soft overhead light'), not harsh").
 *    Backed by a `forbiddenPatterns` entry, because a register flip is exactly
 *    the change a judge waves through while the output keeps the old voice.
 * 3. CAMERA — Fabio's spec, which resolves the vendor conflict instead of
 *    picking a side, and it is neither `gemma3`'s rule nor the old one. The
 *    camera SENTENCE stays REQUIRED (so element 5 is not conditional and the
 *    MPI-16 conditional-vs-required collision never opens); the MOVE is the
 *    user's. No camera behaviour described → static. Behaviour described in
 *    plain words → translate it into the optical term, because "users usually
 *    ask for the camera motion; it's the technical details they don't know,
 *    like crane, dolly in, crash zoom" — so "the camera zooms really fast on
 *    the face" is a crash zoom. That is the recipe's own infer-intent job
 *    applied to the camera slot.
 *
 * REJECTS A VENDOR LINE, deliberately, and it must carry forward: `gemma4_*`
 * (LTX-2.5) says "Camera movement is expected and good", i.e. invent one when
 * the user did not ask. Fabio's spec overrides that. When an `ltx-2.5` recipe
 * is built from that file, this rejection applies there too.
 *
 * HELD BACK from `gemma3_*`, both deliberately, neither forgotten:
 * - the leading `Style: <style>, <rest of prompt>` prefix. It sits on the
 *   seven-sentence unit's boundary and that unit is a defect fix, and it
 *   overlaps MPI-19's deferred register axis. Least load-bearing of the four
 *   adoptions, so it is not worth muddying this sweep's attribution.
 * - "No timestamps or cuts unless explicitly requested". Nothing here emits
 *   either (no `CLIP_LENGTH_RULE`, no beat structure — the `beat` hits in this
 *   file are audio and acting beats), so a `forbiddenPatterns` entry would be a
 *   check for a failure never once observed.
 *
 * THE MANIFEST POINTED AT THE WRONG REPO. `sources.md` recorded
 * `Lightricks/LTX-Video` → `ltx_video/utils/prompt_enhance_utils.py` as this
 * recipe's vendor rewriter. That file is real, but it belongs to the **LTXV
 * 0.9.x line**, which the repo's own README retires: "LTX-2 is now the primary
 * home for LTX development". Its "Keep within 150 words" (stated twice) and its
 * 7-element order are therefore evidence about a DIFFERENT MODEL, and its
 * `text_encoder_max_tokens: int = 256` is a T5 limit that does not apply here.
 * Adopting them would have been a version error dressed as vendor authority.
 *
 * What the real vendor material says, and what changed here:
 * - Length is a CAPTION-STYLE target, not an encoder wall: LTX-2.3 encodes with
 *   **Gemma 3 12B** at `TOKENIZER_MAX_LENGTH = 1024`
 *   (`gemma_assets.py`) — roughly 750 words, so nothing in our range truncates.
 *   The vendor's own target is "roughly 150–220 words"; the budget follows the
 *   vendor's target rather than the old 150–300/340, because the model was
 *   trained on captions of that length. Same shape as `minimax-h3`: an LLM
 *   encoder means the ceiling is taste, so take the vendor's stated taste.
 * - The output is a TRAINING-CAPTION, and the vendor names the openers that
 *   break the style ("The scene opens…", "We see…", "There is…") and bans
 *   labels ("Audio:", "Visual:") outright. Both are now `forbiddenPatterns` —
 *   objectively checkable, so they do not belong to the judge.
 * - The framing TRIPLE is mandatory per shot: one shot type from a closed set,
 *   camera motion always stated (explicitly static if it does not move), and
 *   camera viewpoint. We required shot size and movement; viewpoint is new.
 * - REVERSED by the vendor: "use collective nouns, never exact counts" was a
 *   community-guide rule for LTXV 0.9. LTX-2.3's rewriter says the opposite —
 *   identify people specifically and "differentiate multiple people
 *   consistently". It also forbids inferring ethnicity, nationality, religion
 *   or culture, which we never stated.
 * - The seventh sentence changed job. `Guardrails (inline)` carried
 *   meta-instructions ("smooth gimbal stabilization", "stable exposure") that
 *   are not caption language at all; the vendor closes on an AESTHETIC QUALITY
 *   pass instead ("warm cinematic lighting", "richly saturated film-grade
 *   colour", "crisp high-resolution detail"). The seven-sentence unit — a real
 *   defect fix, see the wordBudget note — is unchanged; only what fills slot 7.
 * - i2v: the vendor ships an i2v rewriter too (same style plus first-frame
 *   grounding, "never contradict the image", single continuous take). This
 *   recipe is still t2v-only, so it is recorded in `sources.md` and left for
 *   the i2v mode work rather than half-built here.
 */

export const ltx23 = {
  modelId: 'ltx-2.3',
  family: 'ltx',
  displayName: 'LTX 2.3',
  status: 'draft',
  notes:
    'Native audio-visual joint model (Lightricks). Audio sync via temporal cues in prose. Portrait video (1080×1920) natively supported. No separate negative-prompt field — negatives expressed as positive-direction guardrails appended to prose. Output is a TRAINING-CAPTION, not an instruction. The text encoder is Gemma 3 12B at 1024 tokens (~750 words), so length is style, not a wall. CAVEAT: the "roughly 150–220 words" target this recipe was rebuilt around comes from Lightricks/LTX-2 gemma4_t2v_system_prompt.txt, which base_encoder.py selects for the gemma4 (LTX-2.5) enhancer — the real LTX-2.3 rewriter is gemma3_t2v_system_prompt.txt and it states no word target. Unresolved; see the header block. Open items for Phase 4: audio prose vs. field parameter, duration-scaling rule for clips < 5 s or > 20 s, Six-Element vs. 4K-Layered naming aliases, and the i2v mode the vendor ships a rewriter for.',
  modes: {
    t2v: {
      outputFormat: 'prose',
      lengthNorm: 'seven substantial sentences, ~200–275 words — the unit IS the control; LTX-2.3’s own rewriter states no word target, so the range is our measured taste',
      // RESEARCH-BACKED (MPI-25, 2026-08-05) from
      // `dev-docs/recipe-research/ltx-2.3/research.md`: 150–300 words / 4–8
      // sentences for a 10-second clip, scaling with duration.
      //
      // The recipe already carried a countable unit — 4–8 SENTENCES — which is
      // the handle wan-2.2 and sdxl each cost several iterations to discover
      // (a model cannot count words; it can notice finishing a sentence).
      // The systemPrompt therefore instructs SEVEN sentences, mid-range, rather
      // than restating the word count, and the contract absorbs the spread.
      //
      // SIX until the clean sweep (MPI-25, 2026-08-05), and the off-by-one was a
      // real defect rather than a tuning choice: `structureOrder` has SEVEN
      // entries — the six framework elements plus `Guardrails (inline)` — so a
      // six-sentence unit left the guardrail element with nowhere to live, and
      // it was simply absent from every output read. When it did appear it came
      // as an appended "**Guardrails:**" markdown block, i.e. the model looking
      // for the home the unit did not give it.
      //
      // Found via `bare` failing at 108 words against the 110 floor. Playbook
      // 7.1 says attack the operation, then the UNIT, and only then the number:
      // the unit was one short of the structure it serves, so the floor was left
      // alone. Lowering it would have turned the tier green and hidden the
      // missing element — 7.1's stated failure mode exactly.
      //
      // Floor set at 110, below the 150 research minimum on purpose: the `bare`
      // tier expands a single word, and both wan-2.2 and sdxl showed the sparse
      // case lands well under a video model's typical length. A short but
      // complete prompt is not a defect; junk output is, and 110 still catches
      // that.
      //
      // No corpus exists for LTX — `_corpus/` covers Chroma, Krea 2 and the
      // candid set only.
      //
      // CEILING: 340 -> 260 -> 300, and the last move is a RETRACTION.
      //
      // The 260 was set on 2026-08-17 from a "roughly 150–220 words" target
      // taken from `gemma4_t2v_system_prompt.txt` — which is **LTX-2.5's**
      // rewriter, not this model's (see the header block). LTX-2.3's own
      // rewriter, `gemma3_t2v_system_prompt.txt`, states **no word target at
      // all**, in either mode. So the number had nothing behind it for 2.3, and
      // it was crowded rather than respected: the overlong tier's two sweeps
      // maxed at 239 and 241 against 260, adjacent maxima 19 words under a
      // ceiling.
      //
      // There is no encoder wall either way (Gemma 3 at 1024 tokens, ~750
      // words), so per the playbook an LLM encoder means the ceiling is taste —
      // and with no vendor taste on record, the honest control is the one the
      // recipe already has: the SEVEN-SENTENCE unit. A model cannot count
      // words; it can notice finishing a sentence. The instruction therefore
      // states no word count at all now, and the contract is a RUNAWAY GUARD
      // rather than a target: 300 sits ~25% above the highest run ever measured
      // (241) so a junk or padded output still fails, while a legitimate
      // seven-sentence caption never brushes it. Do not read 300 as a length to
      // aim at — nothing aims at it.
      //
      // The 110 floor is untouched: it exists for the `bare` tier, not the norm.
      //
      // SWEEP C (14/15) then measured the cost of removing the number entirely:
      // the whole short-tier band dropped ~20 words (was 130–181, became
      // 109–141) and `directed` run 3 failed the FLOOR at 109. The ceiling was
      // fine — max 203 against 300 — so widening it was right; deleting the
      // low-end signal was not. Diagnosis before the fix, per playbook 7.1: the
      // failing output had all seven sentences, all seven elements, every user
      // technical term and a clean register, so the UNIT was not broken and this
      // is NOT the earlier 108-vs-110 case where the floor was masking a missing
      // element. The model was simply given no length signal at all and wrote
      // minimally.
      //
      // So the instruction carries a ONE-SIDED anchor again — "about 130 words
      // at the very least, seldom past 200" — set from OUR measured
      // full-substance runs, not from LTX-2.5. The playbook permits a
      // taste-chosen number on an LLM encoder; the defect was inheriting
      // another model's taste, not having a number. One-sided because only the
      // low end ever failed, and it names the wrong self-correction explicitly
      // ("never fix a short draft by adding an eighth sentence") because the
      // eighth sentence is the repair the model reaches for first.
      //
      // SWEEPS D (15/15) and E (13/15) then settled that the anchor alone is not
      // enough, and the floor is still not the thing to move. D passed with the
      // short-tier band at 110–154 — `bare` run 3 landing on 110 EXACTLY, zero
      // margin — and E failed twice on the floor alone (`bare` 97, `directed`
      // 109), judge 2/2/2 and every forbidden pattern absent on both. Across the
      // 24 short-tier runs of both sweeps the band is 97–154, centred ~126: the
      // model aims at the 130 anchor and undershoots, with a left tail crossing
      // 110 about one run in eight. That is playbook 7.1's distribution test, and
      // it says the instruction is weak, not that the bound is wrong.
      //
      // The failing outputs are the diagnosis. Both carried all seven sentences
      // and all seven elements — the unit and the element list still agree, so
      // 7.1's rung-2 corollary is already satisfied and there is no off-by-one
      // left to find. What differs is SENTENCE SUBSTANCE: the failing runs mean
      // ~14 words per sentence against ~18 on the passing ones, and the thin
      // sentences are the ones naming a single specific ("The camera tracks
      // slowly in to follow its predatory focus."). So rung 2 is applied one
      // level down — the countable unit becomes specifics PER SENTENCE, which
      // the model can perceive while writing, where a total word count is
      // tokenizer arithmetic it cannot. The anchor stays (deleting it cost ~20
      // words in sweep C) and the floor stays; only the substance clause changed,
      // one variable, and the matching `dos` line moved with it because
      // `dos`/`donts` are the grading contract.
      //
      // SWEEP F (15/15) confirmed the per-sentence unit: the short-tier band
      // moved 97–154 to 118–153, so the left tail cleared the floor by 8 instead
      // of failing it. SWEEP G then read 14/15 — and the failure was NOT length
      // (every run 112–214, in band) but the intensified-colour ban firing on
      // "the vibrant green leaves of a potted fern", with the judge scoring that
      // same run 2/2/2. That is the `pony` lesson paying out exactly as intended:
      // a register slip is what a judge waves through while grading everything
      // else full marks, which is why the entry is deterministic and not a `dont`.
      //
      // The cause was the fix above. Naming "a colour" as one of the specifics
      // every sentence must carry widens the surface for a colour word sixfold,
      // while the register rule demanding plain colour wording lives further down
      // the prompt — zero hits in the 30 runs before the edit, one in the 30
      // after. Playbook 7.2 says a ban leaves the slot empty and the model
      // refills it its own way, so the answer is not a longer ban list: it is to
      // CONSTRAIN THE VALUE where the slot is asked for ("a colour in plain
      // words"), which is the same shape as Fabio's camera resolution on this
      // card. The ban, the anchor and the floor are all untouched.
      //
      // Watch `overlong` from here: the density rule lifted it 162–203 to
      // 180–214 against the 300 ceiling, the same bleed §7.2b measured on
      // `wan-2.2`. Still ~30% clear, and the rule is deliberately unconditional
      // rather than scoped to a job, which is the shape that lesson endorses.
      //
      // SWEEP H (14/15) closed the last mechanism rung. The plain-colour fix
      // held — no intensifier in 15 runs — but `bare` run 1 came in at 108, the
      // floor again, with SEVEN sentences, every one carrying two or more
      // specifics and a plain register, judged 2/2/2. Nothing structural is left
      // to find: the unit is right, the element list agrees with it, the
      // substance rule is obeyed, and the output is simply short.
      //
      // The measurement that names the cause: across 36 short-tier runs on the
      // post-edit text the band centres at ~132 — within two words of the 130
      // the instruction states — with a spread of about ±22. The model is
      // hitting the anchor it was given, and the anchor was set too close to the
      // bound for its own spread to clear it. So the fix is `flux-2`'s aim-gap
      // run in the other direction: the STATED aim moves 130 -> 150 (and its
      // upper half 200 -> 220 so the sentence stays coherent), while the
      // CONTRACT stays at 110/300. Loosening the contract and loosening the
      // instruction are different acts, and this widens neither — it tightens
      // the instruction so the tail lands ~128 instead of ~110.
      //
      // The floor was never lowered, at any point in D through H. It has no
      // vendor source (gemma3_* states no word target) and playbook 7.1 would
      // permit moving it once mechanism is exhausted — but mechanism was not
      // exhausted while an untried rung remained, and each rung tried so far has
      // paid: the per-sentence unit lifted the minimum 97 -> 108 and the aim
      // gap is the last one the ladder offers.
      //
      // SWEEP I (14/15) settled the length question and isolated the last one.
      // The aim gap did exactly what it was meant to: the short-tier band moved
      // to 116-155 and no run has come near the floor since. LENGTH IS DONE.
      // What failed was the intensifier ban firing on "its vibrant green leaves"
      // — the SAME phrase, in the same `general` tier, on the same run index as
      // sweep G. A phrase that recurs verbatim across two sweeps is not a tail;
      // it is a construction the prompt is steering into, and the plain-colour
      // constraint could not catch it because GREEN IS PLAIN. The intensifier
      // was riding on top of a correct colour word.
      //
      // The register rule said "name a colour with the plain colour word and
      // stop there", and "stop there" is playbook 7.2's empty slot: the model
      // wants a more specific colour, is given no way to be one, and reaches for
      // intensity. The same failing output had already written "deep forest
      // green" and passed — it can do this, it just needed the route named. So
      // the rule now supplies it (name the SHADE) and names the bad pattern by
      // its SHAPE ("a word rating how strong, rich or striking the colour is")
      // rather than by an instance, per 7.2's second form. The ban list did not
      // grow.
      //
      // SWEEP J (14/15) proved that was still the wrong target, and the third
      // occurrence is what finally located the defect. "vibrant green" has now
      // appeared in sweeps G, I and J — every time in the `general` tier, every
      // time in the SEVENTH sentence, every time on a potted fern that appears
      // in none of the six sentences above it. Three identical failures in the
      // same slot are not a register tail; they are one rule misfiring, and no
      // amount of colour instruction was going to reach it. Placement was not
      // the cause either: RESTRAINED LANGUAGE sits immediately ABOVE the
      // override block, so it was never buried.
      //
      // THE CLOSING-DETAIL RULE CONTRADICTED ITSELF INSIDE ONE PARAGRAPH. It
      // offered "a background element" as one of three things to spend sentence
      // seven on, and then, two clauses later, said "never add an object, a
      // person or an event to it here". The model took the option it was
      // offered, introduced a fern, and — being in the closing slot, where a
      // model reaches to round the paragraph off — decorated it. That is
      // MPI-16's conditional-vs-required collision in a new form: not a
      // conditional colliding with a required element, but an OPTION LIST
      // colliding with a PROHIBITION in the same breath. Both halves read fine
      // in isolation, which is why it survived a rewrite that was looking
      // straight at this rule.
      //
      // And the `dos` line carried the identical phrase, so the judge was being
      // told a background-element close is a "Must do" while the deterministic
      // check failed it — which is exactly why every one of these runs scored
      // 2/2/2 on the way to failing. Both were fixed in the same edit: the slot
      // now binds to something ALREADY named, so nothing new can be introduced
      // for an intensifier to attach to. The shade rule from sweep I stays; it
      // is correct and cheap, it was simply never the thing that was firing.
      //
      // SWEEP K (13/15) confirmed the diagnosis and then caught the fix
      // repeating the bug it had just fixed. The intensifier is GONE — zero
      // colour hits in 15 runs, after three sweeps running — so binding slot 7
      // to an already-named thing was the right call. But `directed` fell to
      // 91/130/102 and the reason is visible in the output: sentence seven had
      // become "His hat's brim is stitched from thick, rugged hide", nine words,
      // where the invented-fern version ran to about twenty. The slot rule said
      // "the material or texture it is made of, OR a small movement it is still
      // making" — ONE detail — while the unconditional length rule demands TWO
      // per sentence. An option list undercutting an unconditional rule, which
      // is precisely the collision found one sweep earlier, re-introduced by its
      // own repair, in the same paragraph, within the hour. The slot now asks
      // for two details and says it carries the same weight as every other
      // sentence; `dos` moved with it. Worth generalising: after fixing a
      // slot-level rule, re-read it against the unconditional rules it sits
      // under, because a narrowed slot silently stops paying its share.
      //
      // SWEEPS L (15/15) and M (13/15) are the twice-green rule earning its
      // keep. Same text, no edit between them: L came in at 123-159 across the
      // short tiers, the widest floor margin the recipe has ever had, and M then
      // failed twice on the floor at 108 and 107. A single ALL PASS here would
      // have recorded a green that the very next sweep disproves. Both failing
      // outputs carry seven sentences, a slot 7 correctly bound to an
      // already-named thing with two details, and a clean register — every rule
      // asked for is present and the prose is simply compact.
      //
      // So the structural ladder is spent, and what is left is the one dial with
      // no source behind it. Across 24 short-tier runs at a stated aim of 150 the
      // band is 107-159, centred ~135: the model tracks the aim and undershoots
      // it by ~15 with a spread of ~±25, which puts the low tail through a 110
      // floor about one run in twelve. The aim is OURS — `lengthNorm` says so
      // outright, because `gemma3_*` states no word target — so it is the number
      // playbook 7.1 rung 3 permits moving, and it is a dial that demonstrably
      // moves: 130 -> 150 lifted the tail minimum from 97/108 to 107/123. It goes
      // to 175 (upper half 220 -> 250 to keep the sentence coherent).
      //
      // PHASE 9 (2026-08-18): 175 -> 200 (upper half 250 -> 275), Fabio's
      // call after phase 8 closed green with a floor margin of TWO words —
      // N+O's 24 short-tier runs banded 112-171 against the 110 floor, the
      // same near-a-bound condition that produced this recipe's own L->M luck
      // pass. He chose raising the aim over reopening the floor. Note the
      // dial is showing DIMINISHING RETURNS and this sweep measures whether
      // it still moves: 130 -> 150 (+20 aim) lifted the tail minimum 97 -> 107
      // (+10), 150 -> 175 (+25) lifted it 107 -> 112 (+5). If +25 more buys
      // only ~3, the aim is exhausted and the honest fix is the 110 floor,
      // which has no vendor source behind it. The ceiling is not at risk:
      // the model undershoots a stated cap by ~20 (239/241 measured against a
      // stated 260), so a stated 275 lands ~255 against a 300 contract.
      //
      // THE CONTRACT IS STILL UNTOUCHED, on purpose. 110/300 has not moved once
      // in D through M. Loosening the instruction and loosening the bound are
      // different acts and only one of them is being done here — the aim-gap
      // discipline `flux-2` records, which is also why the stated aim is allowed
      // to sit well above where the model actually lands.
      //
      // FLOOR 110 -> 100 (2026-08-18, phase 9, Fabio). Playbook 7.1 rung 3,
      // applied properly for the first time on this recipe: the number itself
      // is the thing with nothing behind it. `gemma3_*` states NO word target,
      // so 110 was never vendor-sourced — it was set by us in an earlier phase
      // and then defended through five sweeps of failures.
      //
      // WHY THE AIM WAS TRIED FIRST AND WHY IT FAILED. Phase 9 raised the
      // stated aim 175 -> 200 and swept twice: P 15/15, Q 14/15 (`directed`
      // run 3 at 109). Across P+Q's 24 short-tier runs the band is 109-171,
      // mean 134.5 — statistically the SAME as N+O's 112-171 at an aim of 175.
      // A +25 move on the aim bought +2.5 on the mean and moved the tail the
      // wrong way. At a stated aim of 200 the model lands at 134, undershooting
      // the number by 66; at a stated 130 it landed at ~132, dead on. The aim
      // saturated somewhere between 150 and 175 and is no longer a control.
      //
      // The comment above claiming the aim is "a dial that demonstrably moves"
      // is CONTRADICTED by that sample, and the credit was confounded: both
      // real lifts in the phase-8 ledger came from edits that added required
      // SUBSTANCE, each alone in its edit — per-sentence specifics (E->F) took
      // the minimum 97 -> 118, slot 7 carrying two details (K->L) took it
      // 91 -> 123. Neither aim move did anything comparable. Read with phase
      // 7's converse result (deleting the number entirely dropped the band ~20
      // words), the rule is: a stated length number is load-bearing at the
      // BOTTOM and saturates fast — it stops the model writing minimally, it
      // does not set where it lands. The countable unit sets that.
      //
      // WHY 100 AND NOT 105 OR 90. The floor has to fail thin output and pass
      // clean output, and this recipe now has both populations measured:
      //   real defects  — 91 (K: slot 7 narrowed to ONE detail) and 97 (E:
      //                   per-sentence thinness). Both were genuine bugs and
      //                   the floor SHOULD keep failing them.
      //   clean output  — 107, 108, 109, 112 ... all seven sentences, every
      //                   framework element, every user term, judge 2/2/2,
      //                   every forbiddenPattern absent. Q's 109 is the
      //                   clearest case: the judge called it "adhering to all
      //                   structural guidelines" while the bound failed it.
      // 100 sits in the gap: 3 words above the worst real defect, 7 below the
      // lowest clean run. 105 would leave the same 4-word margin that produced
      // this whole sequence; 90 would stop catching the two real defects.
      //
      // The CEILING is untouched at 300 and is not the constraint: 30 runs at
      // an aim of 200 maxed at 222.
      //
      // NOT CHANGED IN THIS EDIT, on purpose — one variable per sweep. The
      // stated aim stays at 200 even though the model undershoots it by 66,
      // which is `flux-2`'s aim-gap discipline and legitimate; whether to bring
      // it back down near where substance actually lands is a separate
      // question, and answering it in the same edit would make neither
      // attributable.
      wordBudget: { min: 100, max: 300 },
      structureOrder: [
        'Shot Establishment',
        'Scene Setting',
        'Action Progression',
        'Character Definition',
        'Camera Movement',
        'Audio Integration',
        'Closing detail (inline)',
      ],
      vocabulary: {
        camera: [
          '24mm',
          '35mm',
          '50mm',
          '85mm',
          '200mm',
          'slow dolly-in',
          'handheld jitter',
          'whip pan',
          'side tracking shot',
          'crane lift',
          'low-angle slow tracking shot',
          '180-degree shutter equivalent',
          'natural motion blur',
          'fast shutter',
          'macro shot',
          'establishing shot',
          // Closed shot-type set, exactly one per shot. CITATION CORRECTED
          // 2026-08-17: this came from `gemma4_t2v_system_prompt.txt` rule 4,
          // which is LTX-2.5's rewriter. `gemma3_*` (LTX-2.3's) mandates no
          // shot-type enum at all. KEPT anyway — it is our own discipline, it
          // is not contradicted, 2.3's own worked example uses one of these
          // terms ("In a medium close-up"), and `engine-recipes.md` forbids
          // putting a shot type in a banned list since every prompt must name
          // one. Only the authority claim was wrong, not the vocabulary.
          'extreme wide shot',
          'wide shot',
          'medium shot',
          'medium close-up',
          'close-up',
          'extreme close-up',
          // Viewpoint relative to subject — the third leg of the vendor's
          // framing triple, and the one this recipe never required.
          'front-facing',
          'back-facing',
          'side view',
          'over-the-shoulder',
          'top-down',
          'low-angle',
          'high-angle',
          'the camera remains static',
        ],
        motion: [
          'drifting',
          'pouring',
          'rising into frame',
          'swirling',
          'rippling',
          'on the heavy drum beat',
          'at the 4-second mark',
          'after a beat of silence',
          // The vendor's own chronological transitions (rule 6).
          'Initially',
          'A moment later',
          'Simultaneously',
        ],
        lighting: [
          'golden hour',
          'tungsten highlights',
          'cold neon glow',
          'high-contrast chiaroscuro',
          'harsh desert noon sunlight',
          'wet pavement',
          'dust motes',
          'volumetric fog',
          'rain reflections',
        ],
        style: [
          'noir',
          'cyberpunk',
          'documentary',
          'period drama',
          'anime',
          'VHS',
          'Fujifilm Provia 100F film texture',
          'claymation',
          'fashion editorial',
          'muted desaturation',
          'cyberpunk purple and teal contrast',
          'earthy ochre and deep moss green',
        ],
        acting: [
          'downward-cast eyes',
          'shoulders slumped forward',
          'a slight tremor in the hands',
          'clenched jaw',
          'fingers tighten',
        ],
      },
      // dos/donts ARE the grading contract — `judgePrompt()` renders them
      // verbatim as "Must do" / "Must never" and they reach the enhancer LLM
      // nowhere. They were rewritten in the SAME edit as the systemPrompt when
      // the vendor rewriter landed (MPI-27, 2026-08-17); a stale line here
      // instructs the judge to demand the shape the recipe just retired, fails
      // no deterministic check, and reads clean in review. See playbook 07 §7.3.
      dos: [
        'Write a single flowing prose paragraph structured as a mini-screenplay.',
        'Begin immediately with the action or a visual detail.',
        'Use present-tense verbs throughout (walks, turns, drifts).',
        'Describe only what is visible and audible — emotion as physical acting beats (jaw clenches, eyes cast downward).',
        'Name all three framing elements in prose: one shot type, the camera motion (explicitly static if it does not move), and the camera viewpoint relative to the subject.',
        'Translate the user plain-language camera description into the model optical term (a fast zoom onto a face is a crash zoom; rising over the trees is a crane lift).',
        'State the camera is static when the user described no camera behaviour at all.',
        'Specify focal lengths for optical precision.',
        'Write exactly seven sentences, each naming at least TWO concrete observable specifics (material, plainly worded colour, light quality, texture, movement, sound) — the sentence unit is the length control, and seven substantial sentences land around 200–275 words.',
        'Keep colour and light plainly worded ("a red dress", "soft overhead light") in the restrained register, making a colour more specific by naming its shade ("forest green", "slate grey") rather than by rating its strength.',
        'Describe the end-state of a subject after a camera move to anchor the model trajectory.',
        'Identify people specifically and describe visible physical attributes (build, hair, clothing), differentiating multiple people consistently.',
        'Include the full soundscape: environmental sound, foley, background music, and any dialogue quoted exactly.',
        'Use chronological transitions (initially, a moment later, simultaneously, as, then) to show real-time flow.',
        'Close on TWO concrete secondary details of something already named earlier in the prompt (its material or texture, plus a small continuing movement or its exact place in the frame) — never on a newly introduced object, and never on praise for the shot.',
        'Focus on one dominant scene priority per prompt.',
      ],
      donts: [
        'No keyword lists, bullet points, section headers, or labels such as "Audio:" or "Visual:".',
        'No scene-opening throat-clearing ("The scene opens", "We see", "There is").',
        'No abstract emotional labels (happy, sad, confused, angry) and no inferred intentions.',
        'No inferring ethnicity, nationality, religion or culture.',
        'No aesthetic fluff words (stunning, dynamic, hyper-realistic, epic).',
        'No intensified colour or lighting language (vibrant, richly saturated, film-grade, blinding) — the register is plain and understated.',
        'No invented camera movement — if the user described no camera behaviour, the camera is static.',
        'No multiple competing scene ideas in one prompt.',
        'No conflicting lighting sources in the same scene.',
        'No complex chaotic physics (rapid fighting, simultaneous collisions) — causes latent distortion.',
        'No legible text or logos — unreliable in this model version.',
      ],
      // Deterministic bans. The vendor names these outright, so they are
      // objectively wrong rather than a judgement call — and the judge has
      // waved this exact class through before: the "**Guardrails:**" markdown
      // block appeared in 2 of 15 runs of a sweep that read ALL PASS.
      // Anchored to structure (line start), never to a bare common word.
      forbiddenPatterns: [
        {
          pattern: '^\\s*[“"\']?(the (scene|video|shot) (opens|begins)|we see|there is|there are)\\b',
          why: 'scene-opening throat-clearing the vendor names as off-style',
        },
        {
          pattern: '(^|\\n)\\s*[*_]{0,2}(audio|visual|sound|guardrails|camera|lighting)[*_]{0,2}\\s*:',
          why: 'section label in a caption that must be one unlabelled paragraph',
        },
        {
          pattern: '\\b(richly saturated|film-?grade|vibrant|blinding)\\b',
          why: 'intensified colour/light language the vendor rewriter names as off-register',
        },
      ],
      negativeHandling: 'inline-positive',
      examplePrompts: [
        'A lone traveller crosses a scorching noon desert, boots pressing into sand with a soft crunch. The camera tracks steadily from behind and slightly to the side, following the rhythm of each step. A metal canteen swings at his waist catching the harsh sunlight. A mirage wavers on the distant horizon as he continues forward without slowing.',
        'Fog rolls over pine trees surrounding a mountain cabin at dawn. A slow rising camera move reveals the full treeline. Cool blue light filters through the branches and a quiet ambient wind drifts across the clearing. Contemplative cinematic tone.',
        'A luxury skincare bottle rests on a wet stone surface. A gentle push-in camera closes on the label as soft morning light catches the water droplets. Subtle background water movement. Premium beauty commercial mood, clean minimal background, no distracting elements.',
      ],
      // Two fixes from sweep A (MPI-25, 2026-08-05), both of which PASSED the
      // harness and the judge — they were found by reading the outputs.
      //
      // 1. The guardrails section used to be headed "Guardrails (append at end
      //    of prose, positive direction):" and the model duly appended
      //    "**Guardrails:** smooth gimbal stabilization, …" as a markdown block
      //    in 2 of 15 runs. A section header that describes an output position
      //    becomes an output label — the same root cause as sdxl's slot numbers
      //    reaching the prompt text. The guardrails are now stated as part of
      //    the prose, and the closing rule is a stopping rule with both bounds
      //    named rather than a list of formats to avoid.
      // 2. `directed` run 1 emitted "the extreme detail of Thufpik eye skin" —
      //    the deliberately garbled token copied through verbatim, which is the
      //    exact failure that tier exists to catch (playbook 03: a recipe passes
      //    when it RESOLVES the phrase, not when it copies it or drops it). The
      //    model was reading an unknown word as a proper noun worth preserving,
      //    so the infer-intent job now says so directly.
      systemPrompt: `You are an expert prompt engineer and cinematographer specializing in the LTX 2.3 Video Foundation Model by Lightricks. Your sole task is to take any user input — whether a sparse idea or an overloaded, chaotic description — and convert it into a perfectly structured, production-ready LTX 2.3 prompt.

Core objective: LTX 2.3 is a native joint audio-visual Diffusion Transformer model, and what it wants is a CAPTION of the finished video — the style its training captions were written in — not an instruction to a crew. It does not respond well to keyword lists, bullet points, or vague aesthetic words. It requires a single, flowing paragraph of descriptive prose written like a continuous scene from a screenplay. Everything you write must be observable: what is visible and what is audible, never what someone intends or feels.

RESTRAINED LANGUAGE, throughout: this model was trained on plainly-worded captions, so understated phrasing is what lands. Name a colour with the plain colour word — "a red dress", "grey stone", "brown hair". When a colour needs to be more specific than that, name the shade itself — "forest green", "rust red", "slate grey", "pale yellow" — because a shade is something an observer can point at. Never reach instead for a word rating how strong, rich or striking the colour is; that rates the colour rather than naming it. Name light by what it physically is — "soft overhead light", "low sun through a window", "a bare bulb overhead", "overcast midday". Use delicate modifiers for a subtle feature ("faint freckles"). Every adjective you write should be one an observer could verify by looking, at the scale the thing actually has.

TWO RULES THAT OVERRIDE EVERYTHING BELOW:
1. THE SUBJECT IS FIXED. Whatever the user named is what the video is of. If the input is a single word, that word IS the subject — "cat" means a cat, and your output must show a cat. Never replace it, never upgrade it to something grander, never drift to a different animal, object or scene.
2. LENGTH: write SEVEN sentences and stop at the seventh full stop — one for each of the six framework elements below, then a closing sentence of concrete secondary detail. The SAME seven sentences whatever length the input was: a one-word input and a four-hundred-word brief both come out as seven. An eighth means you kept too much. Every sentence names at least TWO concrete observable specifics — a material, a colour in plain words, a light quality, a texture, a movement, a sound — because a sentence carrying only one fills the count without filling the frame. Seven sentences carrying real substance run to about 200 words at the very least, and seldom past 275. If your draft is shorter than that, the sentences are thin, not efficient: go back into the seven you already have and name the material, the light, the texture and the sound you skipped. Never fix a short draft by adding an eighth sentence.

Now decide which job the input needs:
- Sparse (a few words): EXPAND it with concrete cinematography, lighting, character detail, sequential action and environmental audio into a complete narrative arc. Never swap in a different or more photogenic subject than the one the user named.
- Detailed but disordered: REARRANGE it into the six-element framework below. Every choice the user already made — their described action, lens, shot size, camera move, time of day, mood, sound — must survive into your output. Every technical term they wrote must still appear. Dropping one is a failure.
- Longer than seven sentences' worth: CONDENSE it. Focus on one dominant scene priority; remove conflicting events, chaotic physics and numerical over-constraints. Read it once, note the subject, the setting, the camera and the two or three beats that genuinely change the shot, then SET THE INPUT ASIDE and write fresh from those notes. Never walk the input clause by clause keeping what you pass. Drop quality-spam ("8k", "masterpiece", "trending on artstation") and every repetition. A long brief will not fit in seven sentences, and that is the point: keep what most changes the shot and discard the rest, including detail you like.
- Vague, garbled, or reaching for a word the user cannot find: INFER what they meant and state it in LTX's vocabulary. Resolve it — never copy the confusion through, and never silently drop it. A word you cannot recognise as a real term is not a brand, a lens or a proper noun to be preserved: work out what it was reaching for from the words around it and write that real thing instead, so only terms you understand reach your output.

Weaving the six elements below is NEVER "adding". Shot, setting, action, character, camera and audio are REQUIRED in every prompt, so supplying them when the user did not is the job, not an invention — and neither is restating a technical term the user already gave you. What counts as invention is a new character, object or event that was not there.

ONE CARVE-OUT to that, and it is the camera. The camera SENTENCE is required like the other five; the camera MOVE inside it is the user's. Writing "the camera remains static" satisfies the requirement in full. Manufacturing a dolly, crane or pan the user never implied does not — that is invention, exactly like adding a character.

The Six-Element Framework — weave these seamlessly into a single prose paragraph:
1. Shot Establishment: open on the action or a visual detail and name the framing while you do it. Exactly one shot type — extreme wide shot, wide shot, medium shot, medium close-up, close-up or extreme close-up — plus the camera's viewpoint relative to the subject (front-facing, back-facing, side view, over-the-shoulder, top-down, low-angle, high-angle). Write it as prose that describes the frame ("a medium shot frames the mechanic from a low angle as…"), never as a tag list ("medium shot, static camera —").
2. Scene Setting: describe high-fidelity textures (wet pavement, rough stone, worn fabric) and a single logical lighting condition — name the light actually in the scene (overcast midday, a bare bulb overhead, cold neon glow, low sun through a window). Reach for golden hour or chiaroscuro only when the user asked for that kind of treatment. Avoid conflicting light sources.
3. Action Progression: describe a clear physical action unfolding chronologically, in real time. Use concrete present-tense verbs and chronological transitions — "initially," "a moment later," "simultaneously," "as," "then" — to show cause-and-effect.
4. Character Definition: name each person specifically and keep them distinguishable if there is more than one. Describe what is visible — build, hair, clothing, posture, facial detail — and express emotion only as physical acting beats: "his jaw clenches," "her eyes cast downward," "shoulders slump," "fingers tighten." Never use abstract emotional labels, and never state ethnicity, nationality, religion or culture.
5. Camera Movement: always say what the camera does — this sentence is never omitted. But the MOVE is the user's, not yours. If they described no camera behaviour, the camera is STATIC: write "the camera remains static", which is a real answer and not a gap. If they did describe it, your job is to TRANSLATE their plain words into the model's optical term — "the camera zooms really fast onto his face" is a crash zoom to close-up, "the camera rises up over the trees" is a crane lift, "it moves in slowly" is a slow dolly-in, "it follows alongside her" is a side tracking shot. Users state the movement they want in everyday words; what they lack is the term for it, and supplying that term is the job. Use precise optical language (24mm, 85mm shallow depth of field, slow dolly-in, handheld tracking, crane lift, crash zoom), and describe the end-state of the subject after the camera move so the model can complete the trajectory. Never upgrade a static camera into a move because a move reads better.
6. Audio Integration: LTX 2.3 generates native audio, so the soundscape is not decoration. Cover environmental sound and foley (boots crunching on gravel, distant thunder, the hiss of rain) and any background music with its type and mood. For dialogue, quote it exactly, note the tone of voice, and break it with physical acting beats: He leans forward, "I can't." He sighs, looking away, "Not anymore."

Closing detail — this is the content of your seventh and final sentence, written as ordinary prose like every other sentence. Pick ONE thing you have already named in the six sentences above and give it TWO concrete secondary details, the same weight as every other sentence carries: the material or texture it is made of, and either a small movement it is still making or exactly where it sits in the frame. Keep it plain and observable, in the restrained register above. Describe the scene you already wrote — never introduce an object, a person or an event that was not already in it, and never spend this sentence on praise for the shot.

Output: your reply is ONE paragraph of plain prose. It starts on the action or a visual detail — never "The scene opens", "We see" or "There is" — and ends with the final full stop of that paragraph. One block of running text: no heading, no bullet points, no labels such as "Audio:" or "Visual:", nothing before it and nothing after it.`,
    },
  },
};
