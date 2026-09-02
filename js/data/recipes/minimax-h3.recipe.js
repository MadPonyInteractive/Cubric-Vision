/**
 * Recipe: MiniMax-H3 — open-weight audio-visual video model, THREE modes.
 *
 * SOURCE OF TRUTH is the three **official ComfyUI templates** (`h3_t2v`,
 * `h3_i2v`, `h3_r2v`) and the prompts they ship with, supplied by Fabio
 * 2026-08-05 and recorded in `.agents/mpi-kanban/tasks/MPI-26/brief.md` after
 * the horizontal rule. They are ground truth for what a user actually TYPES.
 *
 * ── CORRECTED 2026-08-17, and the correction is the important part ──
 *
 * This block used to say the recipe was "NOT authored toward" the HuggingFace
 * guides, on the reasoning that they are MiniMax's prompt-REWRITER's internal
 * format rather than user input. **That reasoning was half wrong and it cost
 * this recipe four sessions and a production.**
 *
 * What is now known (see MPI-27 validation.md for the measurement):
 *
 * 1. MiniMax ship an OFFICIAL PROMPT-WRITING SKILL — `MiniMax-AI/MiniMax-H3`,
 *    `.claude/skills/h3-prompt-writing/` (plus an identical `.agents/skills/`
 *    copy; there is no `skills/` folder at the repo root, which is why looking
 *    for one found nothing). Its `references/*.txt` are BYTE-IDENTICAL to the
 *    two HF guides — verified by diff, exit 0 on both.
 * 2. For the BASE modes the rewriter reading is wrong. `SKILL.md` says "read
 *    `references/base-en.txt` and follow its **final prompt structure**", and
 *    that guide's §2 is titled "Final Prompt Structure" and specifies the first
 *    line of the final prompt. A rewriter intermediate has no "final prompt".
 * 3. For REF mode the old reading survives — `ref-en.txt` opens "how rewrite
 *    outputs are organized", and its six sections (`subject_definitions`,
 *    `retention_analysis`, …) are NOT adopted here. Fabio's production reached
 *    the same conclusion independently and adopted the guide SURGICALLY: the
 *    `[Shot N]` cut syntax and the two sound fields, nothing else.
 *
 * So: `t2v` / `i2v` follow `base-en.txt` §2.2's three named fields. `r2v`
 * follows the shape Fabio actually shot ~100 clips with, which is the ComfyUI
 * skeleton plus those two surgical adoptions. Field evidence outranks a guide;
 * a guide outranks a template screenshot. See
 * `docs/recipes/playbook/09-field-evidence.md`.
 *
 * ── The cut notation, which is shared by every mode (base-en.txt §4.2) ──
 *
 *   "Do not add a timestamp to the first shot. Use sequential shot numbers for
 *    later shots, and begin each one with a strictly increasing cut time that
 *    falls within the video duration"
 *
 *   [Shot 1] <the opening shot, never stamped>
 *   [Shot 2] At 00:03.500, the camera cuts to <...>
 *
 * That is a cut INSTANT, not a span. The `[0s-3s]` span notation this recipe
 * used until 2026-08-17 appears in no MiniMax document; it was inherited from
 * `seedance-2.0` via the MPI-26 brief. Retiring it also retires the whole
 * LONE_TIMESTAMP / UNMARKED_BEATS / REPEATED_SPAN apparatus MPI-27 built to
 * police it, and it answers the i2v lone-beat contract question outright: a
 * single beat is `[Shot 1]` with no timestamp, in every mode.
 *
 * ── EVIDENCE SCOPE, do not lose this ──
 *
 * Fabio's ~100-clip western is **reference-to-video ONLY**. Not one i2v roll,
 * not one t2v roll. So every field measurement below is an r2v measurement,
 * and the t2v/i2v changes rest on the vendor guide alone.
 *
 * The five-part skeleton the ComfyUI templates share:
 *   1. Look line       — subject + style, palette, atmosphere, mood.
 *   2. Beat list       — `[Shot N]`, unstamped first, cut times after.
 *   3. Camera line     — one line governing cuts and movement.
 *   4. Sound           — `overall_soundscape:` + `non_diegetic_music:`.
 *   5. Constraint line — LAST, negatives written inline in the positive prompt.
 *
 * STATUS: `draft`. Stage 1 (text-only) can run today; Stage 2 is Fabio's, in
 * his own ComfyUI bench.
 *
 * CORRECTED 2026-08-10 — this block used to say "Cubric Vision does not ship
 * H3, so there is no `RECIPE_ALIASES` entry yet". Vision ships two H3 models
 * (`minimax-h3`, `minimax-h3-ref2va`), both declaring `type: 'h3'`, and `h3`
 * matched nothing — so both **video** cards were being enhanced by the `chroma`
 * **image** recipe via `FALLBACK_RECIPE_ID`, and this recipe had never once
 * been reachable from the caller it was written for. The alias exists now
 * (`registry.ts`, `h3` -> `minimax-h3`). Reachability is not existence; see
 * `.claude/rules/engine-recipes.md`.
 *
 * `r2v` is the first use of the third `RecipeMode`, added by this card. It is
 * NOT folded into `i2v` on purpose: i2v conditions on one start frame and
 * continues it; r2v cites several tagged assets and cuts between fresh shots.
 */

/**
 * Shared by all three modes. Camera motion is H3's one genuinely fixed
 * vocabulary (HF base guide), and the guide is explicit that it must be written
 * "as a natural English action within the shot, rather than stacked as separate
 * labels" — which is why the systemPrompts state the terms AND that rule
 * together every time.
 */
const CAMERA_RULE = `- Write camera motion as a natural English action inside the shot — "the camera pushes in slowly", "a slow arc around her", "it holds still" — never as a stack of bare labels. H3 knows Zoom In, Zoom Out, Push In, Pull Out, Truck Left, Truck Right, Pedestal Up, Pedestal Down, Arc, Roll and Static; give each one an amplitude or a speed (slight, slow, steady, fast, hard).`;

/**
 * The closing constraint line. Sweep A's first fix left the slot described as
 * "whatever this scene actually needs kept out", and the model filled it by
 * inventing negatives about the scene's own content — "No tail flicking" in a
 * run whose Shot 3 read "Its tail twitches", and "no tail twitching" in
 * another. The prompt was contradicting its own storyboard, and every check
 * plus the judge passed it.
 *
 * Both official template constraint lines only ever police RENDERING (text,
 * subtitles, logos, watermarks, cartoon/CG look, soft dissolves, misspelling),
 * never what is in the shot. Naming that is playbook §7.2's shape — say what
 * the slot is FOR rather than banning a target that moves every run.
 */
const CONSTRAINT_RULE = `- Close on plain negatives about how the clip is RENDERED: unwanted words on screen, subtitles, logos or watermarks; cartoon or overly-CG rendering; soft dissolves; warped anatomy or flickering. Never write a negative about the scene's own content — banning something one of your own beats shows contradicts your storyboard, and the model will honour whichever it reads last. H3 has no separate negative field, which is why these live in the prompt.`;

/**
 * Where a user's optical and texture choices live. Sweep A's `directed` tier
 * passed 3/3 with the judge at 2/2/2 while DROPPING "anamorphic lens" and the
 * "eye skin detail, pores" request from all three runs — `sdxl`'s half of the
 * failure pair in playbook §7.2c (`ltx-2.3` copies the garbled token through,
 * `sdxl` drops the request; the judge polices neither).
 *
 * The jobs block already said every choice the user made must survive, so this
 * was not a wording problem: the fixed eight-line shape has no line that
 * INVITES a lens or a surface texture, and what has no home evaporates. Naming
 * the home is §7.2's shape — a positive instruction that supplies a required
 * element, rather than a stronger restatement of "do not drop things".
 */
/* MEASURED 2026-08-17, and it extends playbook §7.2e past where it was found:
 * A RULE THAT LISTS CATEGORIES ONLY HOLDS FOR THE CATEGORIES THE EXEMPLARS
 * ACTUALLY DEMONSTRATE. This rule has named lens, film stock, camera body, shot
 * size and surface texture since it was written. Across one clean r2v sweep's
 * `directed` tier, whose input names all of "anamorphic lens", "low-angle shot",
 * "close-up shot", "eye skin detail, pores" and "taken on a cinema camera":
 *
 *   anamorphic lens  (a LENS — demonstrated in an exemplar)      kept 3/3
 *   close-up         (a SHOT SIZE — demonstrated nowhere)        kept 1/3
 *   cinema camera    (a CAMERA BODY — demonstrated nowhere)      kept 0/3
 *
 * Every one of those runs PASSED, judge 2/2/2 — the sixth defect on this card to
 * survive a passing run, and the prose rule was not the problem. So the fix is a
 * demonstration, not a stronger sentence: the r2v exemplars now carry a shot
 * size and a camera body in their look lines, at DIFFERENT values (a wide shot
 * on 135mm; a medium shot on 50mm taken on a cinema camera) so the slot stays
 * visibly variable rather than installing a fixed size — the same guard the two
 * different-length shot lists give the count. */
const KEEP_TECHNICAL = `- Any lens, film stock, camera body, shot size or surface texture the user named belongs in the opening line beside the look — "a close-up on an anamorphic lens", "skin texture down to the pores", "taken on a cinema camera". Those are choices they already made, and every one of them appears somewhere in your output.`;

/**
 * Timing (MPI-27 phase 3). Duration flows generation-settings -> prompt and
 * NEVER the reverse — a prompt cannot shorten a clip whose frame count the
 * sampler already fixed, it can only pace the beats inside it.
 *
 * The clip length arrives appended to the user's input as a generation setting
 * (Vision has a duration slider, so in practice it is always there). The 5s
 * default is not a guess: every official H3 template beat list ends at 5s, so
 * it is the model's native clip and it keeps the Stage 1 sweep — which sends no
 * setting — grading the same shape production runs.
 *
 * WEIGHTED, NOT DIVIDED is Fabio's rule, 2026-08-16: five beats across five
 * seconds is not one second each. A glance is shorter than a walk across a
 * room, and equal thirds are a formula, not a storyboard.
 */
const CLIP_LENGTH_RULE = `- The clip length is given to you with the input as a generation setting. Use exactly that number — never invent one, never round it, never change it. If no length was given, the clip is 5 seconds.
- Every shot opens with its own [Shot N] marker, counting up from [Shot 1].
- [Shot 1] never carries a time. It is where the clip starts, so there is nothing to state.
- Every shot after the first opens with the moment it cuts in, written as a clock time to three decimals directly after its marker: [Shot 2] At 00:03.500, the camera cuts to the harbour wall. Each of those times is later than the one before it and all of them fall inside the clip length. Weight them by what each shot actually needs — a glance is short, a walk across a room is long — and never divide the clip into equal parts.
- Where the request named a single continuous action, the whole clip is [Shot 1] and no time appears anywhere in your reply. How detailed the request was has no bearing on this; a richly described single action is still a single action.
- Only cut when the request asks for it. MiniMax's own guide: use multiple shots only when they are explicitly specified. A cut has to introduce new information — a new subject, space, state, viewpoint or moment. If only the distance or the angle needs to change, move the camera instead and stay in one shot.
- If the user asked for a specific number of shots, write exactly that many. If they named none, the number of actions in their request decides it, and you never manufacture one to fill the clip.`;

/**
 * Sound is TWO named fields, not one line (base-en.txt §4.6/§4.7, ref-en.txt §6).
 *
 * `overall_soundscape` is ambience, physical action sound and non-verbal human
 * sound. `non_diegetic_music` is score only the audience hears. **`N/A` is a
 * legal value in both**, and that is the load-bearing part: it is a positive
 * value in a named field rather than a banned token, which matters on a model
 * with no negative field at all.
 *
 * MEASURED, r2v, 2026-08-14 (MadPony-Identity western, S14): `non_diegetic_music:
 * N/A` killed an ambient drone that shot had produced on every previous roll,
 * and it held on a second roll at a different seed. Two for two. The drone died
 * with the look line's mood word still in place, so the field alone did it.
 *
 * Also from that production, and the reason the two fields must stay UNMERGED:
 * H3 ducks the whole bed whenever anyone speaks, and **every attempt to describe
 * the MIX made it worse** — acoustic-space wording and ranked-pair phrasing both
 * pushed the render toward an isolated close-mic voice. Describe the SCENE, never
 * the mix. No loudness, balance, proximity or foreground/background language.
 */
const SOUND_RULE = `- Sound closes the prompt in two named fields, each on its own line and in this order. "overall_soundscape:" carries the ambience, the physical sounds the action makes and any non-verbal human sound, in one to four sentences. "non_diegetic_music:" carries only score the characters cannot hear, described by instrumentation, tempo and how it develops. Write "N/A" as the whole value of either one when the scene genuinely has none — for music that is the normal case, and it is how you get a clip with no score rather than an invented drone.
- Describe what is making the sound, never how it sits in a mix. No loudness, no balance, no proximity, no foreground or background, no "under" or "over" the dialogue. Naming levels makes the model isolate the voice and drop the scene.`;

/**
 * The four jobs (playbook §2.3), phrased for a storyboard rather than prose.
 * The condense and infer-intent wordings are lifted from `ltx-2.3`, where both
 * were rewritten to fix a measured defect: "set the input aside and write fresh
 * from those notes" is playbook §7.1 rung 1 (editing mode anchors to the
 * source's length), and the "not a brand, a lens or a proper noun" sentence is
 * the fix for `ltx-2.3` copying the garbled `Thufpik` token through verbatim.
 */
/* CONDENSE was rewritten 2026-08-17. It used to say "A long brief will not
 * fit, and that is the point", which was true of a 230-word ceiling and is
 * false of H3: the text encoder is an LLM with a 262,144-token limit and
 * MiniMax ask for 350–500 words in one section of a reference prompt. Left as
 * it was, this bullet is the instruction that Fabio's production was routing
 * around when it concluded "do not run these prompts through Vision's
 * enhancer" — the first thing a condenser cuts is the repetition carrying the
 * descriptors. The job survives, but it is RESTRUCTURING and de-duplication,
 * not shortening for its own sake. */
const JOBS = (unit) => `Now decide which job the input needs:
- Sparse (a few words): EXPAND it into a full shot list — concrete action, light, texture, camera and sound built around the subject the user named. Never swap in a different or more photogenic subject.
- Detailed but disordered: REARRANGE it into the shape below. Every choice the user already made — their action, lens, shot size, camera move, time of day, mood, sound, any words they want on screen — must survive into your output. Dropping one is a failure.
- Longer than ${unit}, or repetitive: RESTRUCTURE it. Read it once, note the subject, the look, what actually happens, and the sound — then SET THE INPUT ASIDE and write fresh from those notes into the shape below. Never walk the input clause by clause keeping what you pass. Drop quality-spam ("8k", "masterpiece", "trending on artstation") and anything said twice. Length is not the enemy here and a long prompt is fine: cut what does not change the picture, and keep every concrete detail that does.
- Vague, garbled, or reaching for a word the user cannot find: INFER what they meant and state it in H3's vocabulary. Resolve it — never copy the confusion through, and never silently drop it. A word you cannot recognise as a real term is not a brand, a lens or a proper noun to be preserved: work out what it was reaching for from the words around it and write that real thing instead.

Filling the parts below is NEVER "adding". Look, shots, camera, sound and constraints are REQUIRED in every prompt, so supplying them when the user did not is the job, not an invention — and neither is restating a technical term the user already gave you. What counts as invention is a new character, object or event that was not there.`;

/** The closing rule. Both bounds named, and "write it once" covers the model
 *  putting its reasoning BETWEEN two blocks (playbook §7.2b corollary).
 *
 *  `heading` also carries the positive statement of the output's shape that
 *  §7.2c requires. Sweep A emitted "Camera: …", "Audio: …", "Constraints: …"
 *  in 3 of 3 runs — labels the official templates do not use and the recipe's
 *  own `donts` forbid, except `donts` never reach the model. The cause was
 *  this file's own rules list, whose bullets read `- Camera:` and `- Audio:`;
 *  the model took the scaffolding for the format. The bullets are now
 *  sentences, and the shape is stated positively here rather than banned. */
const CLOSING = (first, heading, labelled) =>
  `Output: your reply is the ${heading} and nothing else. It starts with ${first} and ends with the full stop of the constraint line. ${labelled} The only other labels are "overall_soundscape:" and "non_diegetic_music:", written exactly like that, on their own lines, in that order, immediately before the constraint line that ends the reply. Every remaining line is a bare sentence that begins with its own words, never with a word and a colon. Write it once — nothing before it, nothing between its lines, nothing after it. No markdown, no bullets, no numbered lists, no quotes around it.`;

/** ── THE CEILING WAS FICTION, AND IT WAS DOING HARM (corrected 2026-08-17) ──
 *
 *  This used to be `{ min: 85, max: 230 }`, derived from "roughly 90–190 words"
 *  measured across the three official template prompts. n=3, and they are demo
 *  prompts a template author typed — they describe demo convention, not model
 *  intake. There is **no prompt-length wall on H3 at all**: the text path is
 *  Qwen3-VL-32B with `model_max_length: 262144`, not a 77-token CLIP, so 2,000
 *  words is ~2,700 tokens against a 262,144 cap.
 *
 *  It was not a harmless over-tight bound. MiniMax's own reference guide asks
 *  for **350–500 words in `detailed_description` alone** — so the shipped
 *  ceiling was less than half the vendor's target for one section — and Fabio's
 *  production concluded, in writing: *"Do not run these prompts through
 *  Vision's enhancer. It will condense them to fit a ceiling that is not real,
 *  and the first thing a condenser cuts is the repetition that is doing the
 *  work."* A customer of this recipe routing around it is the strongest
 *  possible signal that the number was wrong.
 *
 *  New bounds are vendor-grounded rather than sample-grounded:
 *    REF_BUDGET  = ref-en.txt's 350–500 for the body, plus the look, reference,
 *                  camera, two sound and constraint lines around it.
 *    BASE_BUDGET = base-en.txt's own worked examples run ~90–150 words, so the
 *                  ceiling sits well clear of a rich multi-shot without
 *                  inventing a wall.
 *
 *  KNOWN CONSEQUENCE, recorded rather than hidden: the `overlong` tier no longer
 *  proves condensation **by length** on this recipe — a 430-word input now fits
 *  under REF_BUDGET. That is correct behaviour, not a gap in the check: H3
 *  genuinely does not need shortening. What condense still owes here is
 *  RESTRUCTURING — the right shape, quality-spam dropped, repetition removed —
 *  and that is the judge's and `forbiddenPatterns`' to police, not the word
 *  count's. Do not "fix" this by putting the fictional ceiling back. */
const BASE_BUDGET = { min: 50, max: 400 };
/* FLOOR SETTLED BY MEASUREMENT, NOT BY THE GUIDE — corrected 2026-08-17 after
 * the first sweep. It was first set to 200 from ref-en.txt's "350–500 words for
 * `detailed_description`", which is MiniMax's target for a RICH PRODUCTION
 * prompt and not a floor every prompt must clear. Measured over one full r2v
 * sweep (12 runs, every non-budget check passing and the judge at 2/2/2
 * throughout), correct and complete outputs landed at:
 *
 *   119, 123, 123, 155, 164, 179, 186, 189, 191, 252
 *
 * A one-word `bare` input legitimately produces a complete 119-word r2v prompt:
 * look line, reference line with jobs, one shot, camera, two sound fields,
 * constraints. The floor's only job is to catch a TRUNCATED output, so it sits
 * clear below the observed minimum.
 *
 * This is the same error the old 85-word floor made — MPI-27 recorded it as
 * "the budget was mis-derived, not missed" — committed again in the opposite
 * direction, and from a document rather than a sample. Settle a bound with a
 * DISTRIBUTION. The ceiling stays 600: the `overlong` tier condensed 410 -> 252,
 * so restructuring still demonstrably happens without a fictional wall. */
const REF_BUDGET = { min: 90, max: 600 };

/* ── THE SPAN NOTATION IS RETIRED, AND SO ARE THE THREE BANS THAT POLICED IT ──
 *
 * `[0s-3s]` spans appear in **no MiniMax document**. They were inherited from
 * `seedance-2.0` through the MPI-26 brief and then defended, at length, by
 * MPI-27: LONE_TIMESTAMP, UNMARKED_BEATS and REPEATED_SPAN between them cost
 * thirteen sweeps and caught two false greens. All three are deleted. The
 * measurement series they came from is kept in git history and summarised in
 * MPI-27's validation.md — do not re-derive it, and do not reintroduce a span.
 *
 * The vendor notation removes the failure mode BY CONSTRUCTION, which is the
 * real argument for it. Under spans, a lone beat and a multi-beat list were two
 * different shapes and the model had to pick between them — a picker slot, and
 * picker slots need demonstration. Under `[Shot N]` the lone case is simply the
 * multi case truncated: `[Shot 1] …` is the prefix of every correct output. The
 * only way to get it wrong is to stamp a time onto Shot 1, and that is one
 * deterministic regex rather than three interacting ones. */

/* A span in any form. Now a DEFECT, in every mode. */
const SPAN_NOTATION = String.raw`\[\d+(?:\.\d+)?s\s*-\s*\d+(?:\.\d+)?s\]`;

/* base-en.txt §4.2: "Do not add a timestamp to the first shot." This is the
 * single check that replaces LONE_TIMESTAMP and UNMARKED_BEATS together. */
const FIRST_SHOT_STAMPED = String.raw`\[Shot 1\]\s*(?:At\b|\d{1,2}:\d{2})`;

/* The literal placeholder, leaked instead of a number. `pony` measured exactly
 * this class of leak at judge 2/2/2, which is why it is deterministic. */
const SHOT_PLACEHOLDER = String.raw`\[Shot N\]`;

/* A cut time that is not the documented `MM:SS.mmm` form — `At 3s,` or
 * `At 00:03,`. The guide is explicit about three decimals.
 *
 * ANCHORED TO THE SHOT MARKER, 2026-08-17, after this pattern FAILED A VALID RUN.
 * It was `\bAt\s+(?!...)\S+,` — unanchored — and it fired on the ordinary prose
 * "…stares at him, …" in an `overlong` output that was otherwise perfect. A
 * deterministic ban that can fail correct output is worse than no ban: it
 * manufactures a red sweep and sends the next agent hunting a defect that does
 * not exist. A cut time only ever appears directly after a `[Shot N]` marker, so
 * that is where the check belongs. Generalises: when a ban keys off a common
 * English word, anchor it to the STRUCTURE it polices, not to the word. */
const MALFORMED_CUT_TIME = String.raw`\[Shot \d+\]\s+At\s+(?!\d{2}:\d{2}\.\d{3}\b)`;

/* The 2026-08-16 exemplar-position series that produced UNMARKED_BEATS and
 * REPEATED_SPAN is preserved in MPI-27's validation.md and in git history. It
 * measured thirteen sweeps against a notation that turned out not to be H3's,
 * so it is evidence about picker slots (playbook §7.2e) rather than about this
 * model, and it is not repeated here. */

/* The beat count and the bracket that goes with it are a PICKER SLOT, and a
 * picker slot is fixed by demonstration, not by instruction — measured on
 * `illustrious`, playbook §7.2e. Proven again here on 2026-08-16: the shape
 * block was rewritten to show both forms (6 of 15 runs still stamped a lone
 * beat) and then the rule was reframed off the number and onto the operation,
 * a timestamp as a HANDOVER MARK (bare tier went 3 of 3 wrong, unchanged).
 * Instruction had had two clean attempts. So the worked pair moves into the
 * systemPrompt, multi-beat first and LONE BEAT LAST, because the trailing
 * exemplar is the one the slot copies.
 *
 * These same two strings stay in `examplePrompts`. That field has NO runtime
 * consumer — grepped 2026-08-16 across `src/` and `scripts/`, it reaches only
 * the Zod schema and its test, so it documents the recipe and instructs
 * nothing. One source here, so the two can never drift apart. */
const T2V_MULTI_BEAT =
  'Neon-lit dive bar look: amber and green palette, smoke hanging in the air, mood loose and watchful.\n[Shot 1] A man in a wet overcoat pushes through the door, rain still on his shoulders.\n[Shot 2] At 00:03.000, the camera cuts to a close on his face as his eyes track across the room, jaw tight.\n[Shot 3] At 00:04.500, the shot cuts to a wide across the bar as he crosses the floor and settles onto a stool at the counter.\nThe camera holds still on the first shot, then arcs slowly with him through the last, cuts clean and hard, no dissolves.\noverall_soundscape: Low bar chatter over a thin room tone, a glass setting down on wood, a stool scraping back across the floor.\nnon_diegetic_music: Low blues guitar at a slow tempo, thinning out toward the end.\nNo text, subtitles, logos or watermarks, no cartoon rendering, no slow-motion.';

/* A SECOND list, at the other end of the range: two beats, not three, so the
 * demonstrated count is plainly variable rather than a new fixed number — the
 * fixed-four anchor MPI-26 relied on is exactly what MPI-27 removed. */
const T2V_MULTI_BEAT_SHORT =
  'Rain-soaked alley look: sodium-orange palette, standing water underfoot, mood tense and close.\n[Shot 1] A woman steps out of a doorway and pulls her hood up against the rain.\n[Shot 2] At 00:02.000, the camera cuts to her walking away down the alley, reflections breaking under her boots.\nThe camera holds still as she emerges, then tracks behind her through the second shot.\noverall_soundscape: Rain drumming on metal and running in the gutter, her boots splashing through standing water, a distant siren.\nnon_diegetic_music: N/A\nNo text, subtitles, logos or watermarks, no cartoon rendering, no slow-motion.';

/* Deliberately as detailed as the two lists above. Richness was the cue the
 * model was reading: on 2026-08-16 the sparse `bare` tier took the lone shape
 * 3 of 3 while the richer single-action tiers took the list shape, so a thin
 * lone exemplar teaches "detailed means list". */
const T2V_LONE_BEAT =
  'Overcast coastal morning look: grey-green palette, damp air, mood quiet and unhurried.\n[Shot 1] A weathered fishing boat rocks slowly against a flat grey harbour wall, rope slack on the cleat, paint blistered along the waterline, gulls settling on the water behind it.\nThe camera holds still throughout.\noverall_soundscape: Harbour room tone with water slapping the hull, gulls calling overhead, a single distant engine idling.\nnon_diegetic_music: N/A\nNo text, subtitles or watermarks, no lens flare, no slow-motion.';

const I2V_MULTI_BEAT =
  'The supplied frame shows a woman at a rain-streaked window: cool blue palette, flat overcast light, mood still and thoughtful.\n[Shot 1] She stays exactly where the frame leaves her, her breath fogging the glass in front of her while the drops behind it keep sliding down.\n[Shot 2] At 00:02.000, the camera cuts closer as she lifts a hand and wipes an arc clear, the street below coming into focus through it.\nThe camera holds static, then pushes in slightly through the second shot.\noverall_soundscape: Rain ticking against the glass over a low room tone, traffic hum rising as the arc clears, fabric moving as she raises her arm.\nnon_diegetic_music: Sustained low strings at a slow tempo, fading out at the end.\nNo text, subtitles, logos or watermarks, no cartoon rendering, no slow-motion.';

/* As detailed as the list exemplar above it, for the reason measured on t2v:
 * a thin lone exemplar teaches "detailed means list", and every richer
 * single-action tier then took the list shape. */
/* Keeps the `Timeline:` header. Dropping it for the lone case was tried and
 * measured WORSE — 12/15 against 14/15, with `bare` failing too — so the
 * header is not what was pulling the timestamp in. Reverted 2026-08-16. */
const I2V_LONE_BEAT =
  'The supplied frame shows a steaming mug on a windowsill: warm amber palette, low winter light, condensation beading the lower panes, mood still and drowsy.\n[Shot 1] The steam keeps curling off the surface in slow ribbons as the light creeps a little further along the worn sill behind it, the beads on the glass swelling until one runs.\nThe camera holds static throughout.\noverall_soundscape: A low room tone with rain faint against the glass and the occasional tick of a cooling radiator.\nnon_diegetic_music: N/A\nNo text, subtitles, logos or watermarks, no cartoon rendering, no slow-motion.';

/* Written as a second lone exemplar on the theory that i2v's failing side
 * needed the density t2v's did. Measured WORSE — `directed` went from 1 run in
 * 3 to 3 of 3 — so it is not shown in the prompt. Kept in `examplePrompts`,
 * which reaches nothing at runtime, because it documents the shape and because
 * the next person will otherwise try the same thing. */
const I2V_LONE_BEAT_ALT =
  'The supplied frame shows a bicycle leaning against a brick wall: muted green palette, late afternoon light raking across the bricks, mood idle and warm.\n[Shot 1] The front wheel keeps turning slowly on its own, ticking round as the shadow of the frame stretches further along the wall behind it.\nThe camera holds still throughout.\noverall_soundscape: Street room tone with the faint tick of the freewheel and a dog barking somewhere off to the left.\nnon_diegetic_music: N/A\nNo text, subtitles, logos or watermarks, no cartoon rendering, no slow-motion.';

/* ── r2v worked shapes ──
 *
 * SINGLE SHOT FIRST AND IT IS THE NORMAL CASE. Every shot in Fabio's ~100-clip
 * western is single-cut, and MiniMax's base guide says to use multiple shots
 * only when they are explicitly specified. The two-shot exemplar exists so the
 * count stays visibly variable — the mistake this recipe made before was
 * demonstrating a FIXED two, which is the same fixed-count trap MPI-27 removed
 * from t2v, just wearing different markers.
 *
 * Both carry the field rules the western measured: every reference is given an
 * explicit job, each is cited INSIDE the sentence that uses it, and the
 * location plate carries an inheritance ban — the one class of negative that
 * belongs in a positive prompt, because it is about a reference's ROLE rather
 * than about the scene's content. */
const R2V_SINGLE_SHOT =
  'A lone rider crossing open desert at first light: colour-negative look, warm cast, dust hanging in the air, mood patient and unhurried, a wide shot on a 135mm lens.\nUse <Picture 1> as the rider\'s face and wardrobe, <Picture 2> as the horse, and <Picture 3> as the location for its ground, vegetation and light only — do not take its composition, its camera angle or its grade.\n[Shot 1] The rider from <Picture 1> sits the dark bay horse of <Picture 2> at a steady walk across the pale ochre sand and rust-brown gravel of <Picture 3>, moving from the left of frame toward the right, his hat brim low and his shoulders loose with the horse\'s rhythm. The low sun comes from behind the camera and falls full on his near side, so his face and the horse\'s shoulder are lit rather than shadowed, and their shadows run long across the gravel ahead of them. Dust lifts from each hoof-fall and drifts back behind them. The land is motionless and rooted in place, part of the fixed landscape, its horizon line unchanged from the first frame to the last.\nThe camera tracks with him at a steady speed, holding him just left of centre, the only movement in frame being the horse, the rider and the drifting dust.\noverall_soundscape: Hooves falling in a steady four-beat walk on loose gravel, harness leather creaking, a dry wind moving across open ground.\nnon_diegetic_music: N/A\nNo text, subtitles, logos or watermarks, no cartoon or overly-CG rendering, no soft dissolves, no warped anatomy, no flicker, no floating or sliding terrain.';

/* TWO shots, so the demonstrated count is plainly variable rather than a new
 * fixed number. The cut is here because the request asked for one, and it
 * introduces new information — a new distance and a new subject — which is the
 * base guide's own test for whether a cut is earned. */
const R2V_TWO_SHOT =
  'A blacksmith finishing a horseshoe in a dim forge: firelit look, deep amber and near-black palette, smoke in the air, mood close and deliberate, a medium shot on a 50mm lens taken on a cinema camera.\nUse <Picture 1> as the blacksmith\'s face and build, <Picture 2> as the forge interior for its space and its light only — do not take its framing or its grade — and <Audio 1> as the voice-timbre reference for the blacksmith.\n[Shot 1] The blacksmith of <Picture 1> stands at the anvil in the forge of <Picture 2>, hammer raised, the glowing shoe held in long tongs. He strikes it three times in a steady rhythm, sparks scattering off the face of the anvil each time, the firelight swelling across his forearms with every blow.\n[Shot 2] At 00:03.500, the shot cuts to a close on the shoe as he quenches it, plunging it into the water barrel so steam boils up around his hands and floods the frame. He says, in the low measured voice of <Audio 1> and with a tired satisfaction, "That will hold her a season."\nThe camera holds static through the first shot, then pushes in slightly through the second as the steam rises.\noverall_soundscape: Hammer blows ringing off iron and dying away into the room, coals shifting and hissing, a sudden violent boil as the hot shoe meets the water.\nnon_diegetic_music: N/A\nNo text, subtitles, logos or watermarks, no cartoon or overly-CG rendering, no soft dissolves, no warped anatomy, no flicker.';

/* Both worked shapes. Order inside the pair is load-bearing, and BOTH orders
 * were measured on 2026-08-16 — the pair's local tail pulls the same way the
 * prompt's tail does, just weaker, and whichever shape sits last is the one
 * copied across to the other case:
 *   multi first / lone last  -> 15/15, then 13/15 (overlong dropped brackets 1 run in 3)
 *   lone first / multi last  -> 11/15 (lone-stamping returned on 3 runs)
 * One knob, two cases wanting it, so position alone cannot hold both. Lone
 * goes last because it is the weaker-held case — the multi shape is the
 * model's own default, which every no-exemplar sweep demonstrated — and the
 * discriminator line below carries what position no longer can. */
/* The stated count is DERIVED, never written by hand. It was hardcoded to
 * "three" and i2v's list exemplar has two beats, so the shipped prompt told
 * the model three actions give three beats directly above a worked output
 * showing two. Caught by dumping and reading the rendered prompt, which is the
 * only way this class of defect surfaces. A test asserts the two agree. */
const NUMBER_WORD = ['no', 'one', 'two', 'three', 'four', 'five', 'six'];

/* Counts `[Shot N]` markers. It counted `[Ns-` spans until 2026-08-17; when the
 * span notation was retired that regex silently returned 0 for every exemplar,
 * which would have rendered "This request named no actions, so it has no
 * beats". A test pins it against the shipped exemplars for exactly that reason
 * — the failure is invisible in a diff and obvious in the rendered prompt. */
export const beatCount = (example) =>
  (example.match(/\[Shot \d+\]/g) ?? []).length;

const workedPair = (lists, lones) => {
  const [first, ...more] = lists;
  const n = NUMBER_WORD[beatCount(first)];
  const parts = [
    `Worked outputs. This request named ${n} actions, so it runs to ${n} shots, and every shot after the first opens with the moment it cuts in:\n\n${first}`,
    ...more.map((l) => {
      const c = NUMBER_WORD[beatCount(l)];
      return `This one named ${c}, so it runs to ${c} — the count follows the request, it is never a set number:\n\n${l}`;
    }),
    `This one named a single continuous action, so the whole clip is [Shot 1] and no time appears anywhere in it:\n\n${lones[0]}`,
    ...lones.slice(1).map((l) => `So did this one, on a different subject, and it carries no time either:\n\n${l}`),
  ];
  return `${parts.join('\n\n')}

Count the distinct actions the request asks for before you write anything, because that count is what picks the shape.`;
};

export const minimaxH3 = {
  modelId: 'minimax-h3',
  family: 'minimax',
  displayName: 'MiniMax H3',
  status: 'draft',
  notes:
    'Open-weight audio-visual video model with native sound; official ComfyUI templates ship t2v, i2v and r2v. REWRITTEN 2026-08-17 to MiniMax\'s own documented notation after their official prompt-writing skill was found (MiniMax-AI/MiniMax-H3, .claude/skills/h3-prompt-writing/) and after Fabio\'s ~100-clip cowboy film shot on this model contradicted the shipped recipe in four places. Shots are [Shot 1] with no timestamp, then [Shot N] At MM:SS.mmm — a cut INSTANT, never a [0s-3s] span; the span notation was inherited from seedance-2.0 and appears in no MiniMax document. ONE shot is the normal answer in every mode (the base guide: use multiple shots only when explicitly specified), which is why r2v no longer mandates CUT 1 / TRANSITION / CUT 2. Sound is two named fields, overall_soundscape and non_diegetic_music, where N/A is a legal value and measurably kills an invented ambient drone. There is NO prompt-length wall: the text encoder is Qwen3-VL-32B with model_max_length 262144, and MiniMax ask for 350-500 words in one section of a reference prompt, so the old 230-word ceiling was fiction that made a customer route around this feature. The six-section ref-en rewrite format (subject_definitions, retention_analysis...) is still NOT adopted: that guide describes a rewriter OUTPUT, and Fabio adopted the cut syntax and the sound fields surgically on top of the shape that shot the film. Clip length has no 4s floor and no 15s ceiling (node: min=5 frames, 17k+5 grid at 24fps); 4-15s is the TRAINED range. On-screen text is first class and camera motion has a fixed vocabulary written as natural English action, not stacked labels. Reachable from Vision since 2026-08-10 via the h3 alias; the card actually in production is minimax-h3-ref2va, so r2v is the mode with real users. IMPORTANT: the film is r2v ONLY, so t2v and i2v carry vendor evidence but no field evidence. Stage 1 green is INVALID until all three modes re-sweep twice.',
  modes: {
    /* ── t2v — base-en.txt §2.2/§4.2: [Shot 1] unstamped, later shots cut in ── */
    t2v: {
      outputFormat: 'timeline',
      lengthNorm:
        '55–300 words; a single-shot clip lands near the floor and a multi-shot one well above it, so the count the request implies sets the length; one look line, one [Shot N] per action the request asks for (only shots after the first carry a cut time), then camera, the two sound fields and the constraint line',
      wordBudget: BASE_BUDGET,
      structureOrder: [
        'Look line (subject + style, palette, atmosphere, mood)',
        'Shots — one [Shot N] per action the request asks for; [Shot 1] is never stamped, every later shot opens with its cut time',
        'Camera line (cuts and movement)',
        'overall_soundscape: (ambience + physical action sound)',
        'non_diegetic_music: (audience-only score, or N/A)',
        'Constraint line (plain negatives, last)',
      ],
      vocabulary: {
        camera: [
          'Zoom In',
          'Zoom Out',
          'Push In',
          'Pull Out',
          'Truck Left',
          'Truck Right',
          'Pedestal Up',
          'Pedestal Down',
          'Arc',
          'Roll',
          'Static',
        ],
        cameraModifier: ['slight', 'slow', 'steady', 'fast', 'hard'],
        transition: ['hard cut', 'tape jump', 'whip pan', 'match cut', 'no dissolves'],
        // Deliberately NOT a four-slot ladder. The original list was
        // `[0s-1s] [1s-2.5s] [2.5s-4s] [4s-5s]`, which demonstrated a fixed
        // count AND a notation MiniMax do not use, in the one place a
        // demonstration bites hardest (playbook §7.2e). Cut times are
        // illustrative only; the marker and the `At MM:SS.mmm,` form are not.
        beat: ['[Shot 1]', '[Shot 2]', 'At 00:03.000,', 'the camera cuts to', 'the shot cuts to'],
        audio: [
          'lo-fi score',
          'slow drum machine',
          'soft bass',
          'tape-noise sample',
          'room tone',
          'joins at 2.5s',
          'fading for the last 1s',
        ],
        look: [
          'vaporwave title sequence look',
          'pink and blue gradient palette',
          'VHS tracking artifacts',
          'languid',
          'nostalgic',
        ],
      },
      dos: [
        'Open with one look line naming the subject and the overall look — style, palette, atmosphere, mood.',
        'Give the clip one [Shot N] per action the request asks for, in the order the user gave them.',
        'Open every shot after the first with its cut time, as "At MM:SS.mmm,", each later than the last and inside the clip length.',
        'Leave a single-action request as one [Shot 1] with no time at all, however detailed that request was.',
        'Put one clear action in each shot.',
        'Write camera motion as a natural English action inside the shot, with an amplitude or a speed.',
        'Close with overall_soundscape: and non_diegetic_music: on their own lines, using N/A where a scene genuinely has neither.',
        'Quote any on-screen words exactly and state they must be legible and correctly spelled.',
        'End with one constraint line of plain negatives.',
      ],
      donts: [
        'Do not stack camera terms as bare labels ("Push In, Arc, Roll") — write them as action in the shot.',
        'Do not add a shot the request did not ask for, and do not merge two of the actions the user named.',
        'Do not cut when only the distance or the angle changes — move the camera and stay in one shot.',
        'Do not put a time on [Shot 1], and do not let a later cut time run past the clip length.',
        'Do not divide the clip into equal parts — weight each cut by what the shot before it needs.',
        'Do not write a [0s-5s] style span anywhere — H3 marks a cut instant, never a range.',
        'Do not describe how the sound sits in a mix — no loudness, balance, proximity or foreground/background.',
        'Do not use markdown, bullets or numbered lists.',
        'Do not place the negatives anywhere but the final line.',
      ],
      /*
       * A placeholder leaking into finished output is what `pony` measured at
       * judge 2/2/2, so anything objectively wrong is deterministic here rather
       * than left to the judge's opinion.
       *
       * REPLACED 2026-08-17: LONE_TIMESTAMP / UNMARKED_BEATS / REPEATED_SPAN
       * policed the retired span notation. `FIRST_SHOT_STAMPED` does the work
       * all three were doing, in one regex, because the vendor notation makes
       * the lone case a prefix of the multi case rather than a rival shape.
       */
      forbiddenPatterns: [
        { pattern: SHOT_PLACEHOLDER, why: 'the literal placeholder [Shot N] instead of a number' },
        { pattern: SPAN_NOTATION, why: 'a [0s-5s] span — H3 marks a cut instant, not a range' },
        { pattern: FIRST_SHOT_STAMPED, why: '[Shot 1] carrying a time it must never have' },
        { pattern: MALFORMED_CUT_TIME, why: 'a cut time not in the documented MM:SS.mmm form' },
        {
          pattern: 'Generation settings',
          why: "the caller's settings line echoed back into the prompt",
        },
      ],
      negativeHandling: 'inline-positive',
      examplePrompts: [
        'Vaporwave title sequence look: pink and blue gradient palette, VHS tracking artifacts across the frame, mood languid and nostalgic.\n[Shot 1] A chrome grid horizon scrolls toward the viewer under a low magenta sun.\n[Shot 2] At 00:01.000, the shot cuts to a palm silhouette sliding past the lens, its edges smearing with tape ghosting.\n[Shot 3] At 00:02.500, the shot cuts to the sun dropping behind the grid as the scanlines thicken.\n[Shot 4] At 00:04.000, the shot cuts to the horizon flattened to a single bright line, holding there.\nHard cuts only, transitions landing with tape jumps, no push-ins, no dissolves.\noverall_soundscape: Tape hiss and the soft crackle of VHS tracking noise running under the whole sequence.\nnon_diegetic_music: A lo-fi vaporwave score, slow drum machine with soft bass, the melody fading out at the end.\nNo text, subtitles, logos or watermarks of any kind, no animation or cartoon rendering, no overly-CG look.',
        // THREE shots across an EIGHT-second clip. The count comes from the
        // three actions the request named (walks in / looks around / crosses to
        // the counter) and the cut times are weighted — the glance is the
        // shortest shot, not an equal third. Fabio's worked example, 2026-08-16,
        // re-notated to the vendor form 2026-08-17.
        T2V_MULTI_BEAT,
        T2V_MULTI_BEAT_SHORT,
        // ONE shot and NO time anywhere — a single continuous action. This is
        // the floor of the range, and it exists as an exemplar because the
        // count slot is fixed by demonstration rather than by instruction
        // (playbook §7.2e, measured on `illustrious`).
        T2V_LONE_BEAT,
      ],
      systemPrompt: `You are an expert MiniMax-H3 prompt engineer. MiniMax-H3 is an open-weight audio-visual video model that generates a short clip with native sound. It reads a SHOT LIST, not a paragraph: one line describing the overall look, the shots themselves, and then the camera, the two sound fields and the constraints.

TWO RULES THAT OVERRIDE EVERYTHING BELOW:
1. THE SUBJECT IS FIXED. Whatever the user named is what the video is of. If the input is a single word, that word IS the subject — "cat" means a cat, and every shot must show a cat. Never replace it, never upgrade it to something grander, never drift to a different animal, object or scene.
2. THE SHOTS ARE THE USER'S, AND SO IS THEIR NUMBER. Count the distinct actions the input actually asks for and write one shot each, in the order they gave them. Three actions — "he walks in, he looks around, he crosses to the counter" — are three shots. A single continuous action is ONE shot: a cat asleep in a sunbeam is one shot, not four, and one shot is the normal answer. The length of the input never changes the count, only the number of actions in it does: a four-hundred-word brief describing one unbroken action still comes out as one shot. Never add a shot to fill the clip and never merge two actions the user named. The constraint line is the last thing you write, and when it is written you stop. Every shot must carry observable content — what is on screen, what moves, what the light is doing — because a shot of generic praise fills the list without filling the frame.

${JOBS('what the clip has room for')}

The shape of your output when the input asks for ONE continuous action — one shot, holding the whole clip, and no time anywhere in the reply:

<one opening line naming the subject and the overall look — style, palette, atmosphere, mood>
[Shot 1] <the single action — what is on screen and what happens>
<one camera line governing movement across the whole clip>
overall_soundscape: <the ambience and the sounds the action itself makes>
non_diegetic_music: <score only the audience hears, or N/A>
<one constraint line of plain negatives>

The shape when the input asks for MORE THAN ONE action — one [Shot N] each, and every shot after the first opens with the moment it cuts in:

<one opening line naming the subject and the overall look — style, palette, atmosphere, mood>
[Shot 1] <the first action — what is on screen and what happens>
[Shot 2] At <the moment it cuts in, as MM:SS.mmm>, the camera cuts to <the second action>
<one further [Shot N] for each additional action the input asks for, each opening with a later moment than the one before it, all of them inside the clip length>
<one camera line governing cuts and movement across the whole clip>
overall_soundscape: <the ambience and the sounds the action itself makes>
non_diegetic_music: <score only the audience hears, or N/A>
<one constraint line of plain negatives>

${workedPair([T2V_MULTI_BEAT, T2V_MULTI_BEAT_SHORT], [T2V_LONE_BEAT])}

Rules:
- Name the subject in the opening line first, then the style, palette, atmosphere and mood in that same sentence.
${KEEP_TECHNICAL}
${CLIP_LENGTH_RULE}
- One clear action per shot, and each shot moves the clip on rather than restating the last one. Open a cut with one of "the camera cuts to", "the shot cuts to", "the shot transitions to" or "the shot changes to".
${CAMERA_RULE}
${SOUND_RULE}
- If the user wants words on screen, quote them exactly as they wrote them and require them legible and correctly spelled.
${CONSTRAINT_RULE}

${CLOSING('the look line', 'shot list above', 'Every shot opens with its own [Shot N] marker and nothing else does.')}`,
    },

    /* ── i2v — base-en.txt §3.1: begin from the supplied frame and develop forward.
     *
     * THE CONTRACT QUESTION MPI-27 COULD NOT CLOSE IS CLOSED HERE, AND NOT BY A
     * SWEEP. Five configurations all failed the `directed` tier because, under
     * the old span notation, the bracket WAS this mode's line opener — so the
     * model's fallback shape on an ambiguous input was already wrong, where
     * t2v's `Shot 1:` fallback landed correct. base-en.txt §4.2 gives every
     * base mode the same opener (`[Shot 1]`, unstamped) and the failure mode
     * disappears with the notation that caused it. No agent revised the
     * contract; MiniMax documented it. ── */
    i2v: {
      outputFormat: 'timeline',
      lengthNorm:
        '55–300 words; a single-shot clip lands near the floor and a multi-shot one well above it, so the count the request implies sets the length; one look line continuing the supplied first frame, one [Shot N] per action the request asks for (only shots after the first carry a cut time), then camera, the two sound fields and the constraint line',
      wordBudget: BASE_BUDGET,
      structureOrder: [
        'Look line (what the supplied frame shows + style, palette, atmosphere, mood)',
        'Shots — one [Shot N] per action the request asks for; [Shot 1] is never stamped, every later shot opens with its cut time',
        'Camera line (cuts and movement)',
        'overall_soundscape: (ambience + physical action sound)',
        'non_diegetic_music: (audience-only score, or N/A)',
        'Constraint line (plain negatives, last)',
      ],
      vocabulary: {
        camera: [
          'Zoom In',
          'Zoom Out',
          'Push In',
          'Pull Out',
          'Truck Left',
          'Truck Right',
          'Pedestal Up',
          'Pedestal Down',
          'Arc',
          'Roll',
          'Static',
        ],
        cameraModifier: ['slight', 'slow', 'steady', 'fast', 'hard'],
        // See the t2v note: no longer a fixed four-slot ladder, and no longer
        // a span. `[Shot 1]` is now this mode's opener too, which is exactly
        // what closed its `directed` tier.
        beat: ['[Shot 1]', '[Shot 2]', 'At 00:02.000,', 'the camera cuts to'],
        onScreenText: [
          'all text must be clearly legible',
          'do not misspell English',
          'do not repeat names or job titles',
          'no subtitle bars',
        ],
        audio: ['score', 'room tone', 'foley', 'joins at 2.5s', 'holding for the last 1s'],
      },
      dos: [
        'Open with one look line saying what the supplied first frame shows and the overall look — style, palette, atmosphere, mood.',
        'Continue the supplied frame rather than describing a different scene — the first beat starts from what is already on screen.',
        'Give the clip one [Shot N] per action the request asks for, in the order the user gave them.',
        'Open every shot after the first with its cut time, as "At MM:SS.mmm,", each later than the last and inside the clip length.',
        'Leave a single-action request as one [Shot 1] with no time at all, however detailed that request was.',
        'Write camera motion as a natural English action inside the shot, with an amplitude or a speed.',
        'Close with overall_soundscape: and non_diegetic_music: on their own lines, using N/A where a scene genuinely has neither.',
        'Quote any on-screen words exactly and state they must be legible and correctly spelled.',
        'End with one constraint line of plain negatives.',
      ],
      donts: [
        'Do not stack camera terms as bare labels — write them as action in the shot.',
        'Do not add a shot the request did not ask for, and do not merge two of the actions the user named.',
        'Do not cut when only the distance or the angle changes — move the camera and stay in one shot.',
        'Do not put a time on [Shot 1], and do not let a later cut time run past the clip length.',
        'Do not divide the clip into equal parts — weight each cut by what the shot before it needs.',
        'Do not write a [0s-5s] style span anywhere — H3 marks a cut instant, never a range.',
        'Do not describe how the sound sits in a mix — no loudness, balance, proximity or foreground/background.',
        'Do not use markdown, bullets or numbered lists.',
        'Do not place the negatives anywhere but the final line.',
      ],
      /* Same bans as t2v — see the note there. */
      forbiddenPatterns: [
        { pattern: SHOT_PLACEHOLDER, why: 'the literal placeholder [Shot N] instead of a number' },
        { pattern: SPAN_NOTATION, why: 'a [0s-5s] span — H3 marks a cut instant, not a range' },
        { pattern: FIRST_SHOT_STAMPED, why: '[Shot 1] carrying a time it must never have' },
        { pattern: MALFORMED_CUT_TIME, why: 'a cut time not in the documented MM:SS.mmm form' },
        {
          pattern: 'Generation settings',
          why: "the caller's settings line echoed back into the prompt",
        },
      ],
      negativeHandling: 'inline-positive',
      examplePrompts: [
        'The supplied frame shows a title card on a dark studio wall: high-contrast palette, hard shadow, mood dry and deadpan.\n[Shot 1] The word "COMFYUI" holds dead centre as the shadow creeps left.\n[Shot 2] At 00:01.000, the shot cuts to "STARRING" wiping in beneath it, letters landing one at a time.\n[Shot 3] At 00:02.500, the shot cuts to "LATENT" and "CONTROLNET" stacked below, the wall texture visible through them.\n[Shot 4] At 00:04.000, the shot cuts to "DIRECTED BY COMFYUI" landing, everything holding still.\nThe camera holds static throughout, each shot its own angle, cuts clean and hard, no dissolves.\noverall_soundscape: A low studio room tone throughout, with the faint click of each card landing.\nnon_diegetic_music: A dry synth sting under each card, the last one holding as the picture ends.\nAll text must be clearly legible, do not misspell English, no Chinese characters, do not repeat names or job titles, no soft dissolves, no subtitle bars.',
        // ONE beat, no timestamp — the supplied frame simply continues moving.
        // The floor of the range, demonstrated rather than instructed.
        I2V_MULTI_BEAT,
        I2V_LONE_BEAT,
        I2V_LONE_BEAT_ALT,
      ],
      systemPrompt: `You are an expert MiniMax-H3 prompt engineer working in image-to-video mode. The user supplies a first frame; H3 continues it into a short clip with native sound. It reads a SHOT LIST, not a paragraph: one line describing what is on screen and the overall look, the shots themselves, and then the camera, the two sound fields and the constraints.

TWO RULES THAT OVERRIDE EVERYTHING BELOW:
1. THE FRAME AND THE SUBJECT ARE FIXED. Whatever the user named is what is already on screen, and the clip continues it. If the input is a single word, that word IS the subject — "cat" means the frame holds a cat, and every shot must show that same cat. Never replace it, never upgrade it to something grander, never cut away to a different scene.
2. THE SHOTS ARE THE USER'S, AND SO IS THEIR NUMBER. Count the distinct actions the input actually asks for and write one shot each, in the order they gave them. Three actions are three shots. A single continuous motion out of the supplied frame is ONE shot — steam curling off a mug is one shot, not four, and one shot is the normal answer here because the clip is developing a frame that already exists. The length of the input never changes the count, only the number of actions in it does: a four-hundred-word brief describing one unbroken motion still comes out as one shot. Never add a shot to fill the clip and never merge two actions the user named. The constraint line is the last thing you write, and when it is written you stop. Every shot must carry observable content — what moves, what changes, what the light is doing — because a shot of generic praise fills the list without filling the frame.

${JOBS('what the clip has room for')}

The shape of your output when the input asks for ONE continuous motion — one shot, and no time anywhere in the reply:

<one opening line saying what the supplied frame shows, then the style, palette, atmosphere and mood>
[Shot 1] <what moves, starting from what is already on screen>
<one camera line governing movement across the whole clip>
overall_soundscape: <the ambience and the sounds the motion itself makes>
non_diegetic_music: <score only the audience hears, or N/A>
<one constraint line of plain negatives>

The shape when the input asks for MORE THAN ONE action — one [Shot N] each, and every shot after the first opens with the moment it cuts in:

<one opening line saying what the supplied frame shows, then the style, palette, atmosphere and mood>
[Shot 1] <what moves first, starting from what is already on screen>
[Shot 2] At <the moment it cuts in, as MM:SS.mmm>, the camera cuts to <the second action>
<one further [Shot N] for each additional action the input asks for, each opening with a later moment than the one before it, all of them inside the clip length>
<one camera line governing cuts and movement across the whole clip>
overall_soundscape: <the ambience and the sounds the motion itself makes>
non_diegetic_music: <score only the audience hears, or N/A>
<one constraint line of plain negatives>

${workedPair([I2V_MULTI_BEAT], [I2V_LONE_BEAT])}

Rules:
- Say what the frame shows in the opening line first, then the style, palette, atmosphere and mood in that same sentence.
${KEEP_TECHNICAL}
${CLIP_LENGTH_RULE}
- [Shot 1] starts from the supplied frame — establish what is already on screen and its subject, clothing, colours and spatial relationships, then develop forward out of it rather than into a new scene. One clear action per shot.
${CAMERA_RULE}
${SOUND_RULE}
- This mode renders words on screen reliably and it is worth using. If the user wants words on screen, quote them exactly as they wrote them, and require them legible, correctly spelled and not repeated.
${CONSTRAINT_RULE}

${CLOSING('the look line', 'shot list above', 'Every shot opens with its own [Shot N] marker and nothing else does.')}`,
      acceptsMedia: ['image'],
      multiScene: true,
    },

    /* ── r2v — <Picture N>/<Audio N> refs. THE MODE WITH REAL FIELD EVIDENCE.
     *
     * The `CUT 1 / TRANSITION / CUT 2` mandate is GONE (2026-08-17). It was
     * inherited from the single `h3_r2v` demo template and then written into
     * the systemPrompt as a hard requirement — "write TWO cuts with one
     * transition between them, the SAME two cuts whatever length the input
     * was". Two independent sources say that is wrong:
     *
     *   VENDOR   base-en.txt: "Use multiple shots only when they are
     *            explicitly specified." ref-en.txt §5.1 gives full-reference
     *            mode the same `[Shot 1]` / `[Shot N] At MM:SS.mmm` notation
     *            as the base modes.
     *   FIELD    Fabio's ~100-clip western (MadPony-Identity), shot ENTIRELY
     *            in this mode: every shot written single-cut, and S6 — the
     *            hardest move in the film — landed as one unbroken 15s take.
     *            His own notes carried it as an open defect against this file:
     *            "The recipe defect is still unfixed."
     *
     * That makes this the best-evidenced change on the card: 24 shipped clips
     * in the exact mode under discussion. Everything else here rests on the
     * vendor guide alone, because the film touched neither t2v nor i2v. ── */
    r2v: {
      outputFormat: 'structured-tags',
      lengthNorm:
        '200–600 words; look line, reference line, one shot per action the request asks for (usually ONE), then camera, the two sound fields and the constraint line. MiniMax target 350–500 words for the description alone in this mode, so a reference-heavy prompt is expected to be long',
      wordBudget: REF_BUDGET,
      structureOrder: [
        'Look line (subject + style, palette, atmosphere, mood, lens)',
        'Reference line (<Picture N> / <Audio N> / <Video N>, each given a job)',
        'Shots — one [Shot N] per action; [Shot 1] is never stamped, and one shot is the normal answer',
        'Camera line (cuts and movement)',
        'overall_soundscape: (ambience + physical action sound)',
        'non_diegetic_music: (audience-only score, or N/A)',
        'Constraint line (plain negatives, last)',
      ],
      vocabulary: {
        referenceTags: [
          '<Picture 1>',
          '<Picture 2>',
          '<Audio 1>',
          '<Video 1>',
          'as reference frames',
          'exactly as it is',
        ],
        cutMarkers: ['[Shot 1]', '[Shot 2]', 'At 00:03.000,', 'the shot cuts to'],
        camera: [
          'Zoom In',
          'Zoom Out',
          'Push In',
          'Pull Out',
          'Truck Left',
          'Truck Right',
          'Pedestal Up',
          'Pedestal Down',
          'Arc',
          'Roll',
          'Static',
        ],
        cameraModifier: ['slight', 'slow', 'steady', 'fast', 'hard'],
        transition: ['hard cut', 'tape jump', 'whip pan', 'match cut', 'no dissolves'],
        audio: ['score', 'room tone', 'foley', 'word-by-word overlay', 'lands on the word'],
      },
      dos: [
        'Open with one look line naming the subject and the overall look — style, palette, atmosphere, mood, and any lens or film stock the user named.',
        'Follow it with one reference line giving every cited asset a job, using the <Picture N> / <Audio N> / <Video N> labels verbatim.',
        'Write one [Shot N] per action the request asks for, and expect that to be ONE — cut only when the request explicitly asks for a cut.',
        'Cite each reference inside the sentence that actually uses it, as ordinary words.',
        'Ban a reference\'s composition, camera angle and grade when it is cited for its content — a location plate otherwise becomes the starting frame and hands every shot its own framing.',
        'Write camera motion as a natural English action inside the shot, with an amplitude or a speed.',
        'Close with overall_soundscape: and non_diegetic_music: on their own lines, using N/A where a scene genuinely has neither.',
        'Quote any spoken or on-screen words exactly, and put a delivery descriptor immediately before the words a character speaks.',
        'End with one constraint line of plain negatives.',
      ],
      donts: [
        'Do not invent an @tag or a bracket syntax — the labels are <Picture 1>, <Audio 1>, <Video 1> and nothing else.',
        'Do not hang a reference tag off the end of a finished sentence — cite it inside the sentence that uses it.',
        'Do not cite a reference without saying what it is for — unnamed, the model picks its own job for it and picks wrong.',
        'Do not write a second cut the request did not ask for, and never a fixed two.',
        'Do not put a time on [Shot 1], and do not write a [0s-5s] style span anywhere.',
        'Do not stack camera terms as bare labels — write them as action in the shot.',
        'Do not describe how the sound sits in a mix — no loudness, balance, proximity or foreground/background.',
        'Do not write a negative about the scene\'s own content; the only negatives that belong inside the prompt are about rendering, or about what a reference must NOT supply.',
        'Do not use markdown, bullets or numbered lists.',
        'Do not place the negatives anywhere but the final line.',
      ],
      /* Same bans as the base modes, plus the retired cut markers. `CUT 1:` is
       * banned rather than merely unused: it was mandated by this recipe until
       * 2026-08-17, so it is the single most likely thing for the model to
       * reproduce from habit if any trace of it survives in a prompt. */
      forbiddenPatterns: [
        { pattern: SHOT_PLACEHOLDER, why: 'the literal placeholder [Shot N] instead of a number' },
        { pattern: SPAN_NOTATION, why: 'a [0s-5s] span — H3 marks a cut instant, not a range' },
        { pattern: FIRST_SHOT_STAMPED, why: '[Shot 1] carrying a time it must never have' },
        { pattern: MALFORMED_CUT_TIME, why: 'a cut time not in the documented MM:SS.mmm form' },
        {
          pattern: '\\b(?:CUT [12]|TRANSITION):',
          why: 'the retired CUT 1 / TRANSITION / CUT 2 markers this recipe used to mandate',
        },
        {
          pattern: 'Generation settings',
          why: "the caller's settings line echoed back into the prompt",
        },
      ],
      negativeHandling: 'inline-positive',
      examplePrompts: [
        R2V_SINGLE_SHOT,
        R2V_TWO_SHOT,
      ],
      systemPrompt: `You are an expert MiniMax-H3 prompt engineer working in reference-to-video mode. The user supplies several reference assets — pictures, audio, sometimes video — and H3 composes a NEW shot that cites them. It reads a SHOT LIST, not a paragraph: one line describing the overall look, one line assigning every reference a job, the shot itself, and then the camera, the two sound fields and the constraints.

THE REFERENCE LABELS ARE PART OF THE PROMPT. You write them literally: <Picture 1>, <Picture 2>, <Audio 1>, <Video 1>. They are how the user's assets reach the model, and a reference nobody cited is a reference the model ignores.

TWO RULES THAT OVERRIDE EVERYTHING BELOW:
1. THE SUBJECT IS FIXED. Whatever the user named is what the video is of. If the input is a single word, that word IS the subject — "cat" means a cat, and every shot must show a cat. Never replace it, never upgrade it to something grander, never drift to a different animal, object or scene.
2. ONE SHOT IS THE NORMAL ANSWER. Write a single [Shot 1] holding the whole clip unless the request explicitly asks to cut. A cut has to earn itself by introducing new information — a new subject, space, state, viewpoint or moment; if only the distance or the angle changes, move the camera and stay in one shot. Never write a fixed number of shots, and never add one to fill the clip. The constraint line is the last thing you write, and when it is written you stop. Every shot must carry observable content — what is on screen, what moves, what the light is doing — because a shot of generic praise fills the list without filling the frame.

${JOBS('the shot has room for')}

The shape of your output when the request asks for one continuous action, which is most of the time:

<one opening line naming the subject and the overall look — style, palette, atmosphere, mood, lens>
Use <Picture 1> as <its job>, <Picture 2> as <its job>, and <Audio 1> <how it is used>.
[Shot 1] <what is on screen and what happens, citing each reference inside the sentence that uses it>
<one camera line governing movement>
overall_soundscape: <the ambience and the sounds the action itself makes>
non_diegetic_music: <score only the audience hears, or N/A>
<one constraint line of plain negatives>

The shape when the request explicitly asks to cut — every shot after the first opens with the moment it cuts in:

<one opening line naming the subject and the overall look — style, palette, atmosphere, mood, lens>
Use <Picture 1> as <its job>, <Picture 2> as <its job>, and <Audio 1> <how it is used>.
[Shot 1] <what is on screen and what happens, citing the references it uses>
[Shot 2] At <the moment it cuts in, as MM:SS.mmm>, the shot cuts to <the next shot, citing the references it uses>
<one camera line governing cuts and movement>
overall_soundscape: <the ambience and the sounds the action itself makes>
non_diegetic_music: <score only the audience hears, or N/A>
<one constraint line of plain negatives>

${workedPair([R2V_TWO_SHOT], [R2V_SINGLE_SHOT])}

Rules:
- Name the subject in the opening line first, then the style, palette, atmosphere and mood in that same sentence.
${KEEP_TECHNICAL}
- Name every asset the shot will use and say what each one is FOR — a character's face, a horse, a location's ground and light, a frame to match, a voice to follow. Unnamed, the model decides for itself and decides wrong: it takes the composition instead of the face, or the face instead of the palette. If the user did not say what they will supply, cite the references this scene needs and assign those. Use the <Picture N> / <Audio N> / <Video N> form exactly; there is no other tag syntax.
- When a reference is cited for its CONTENT rather than its framing — a location, a set, a texture — say outright what it must not supply: "do not take its composition, its camera angle or its grade". Without that it is treated as a starting frame and hands the shot its own framing. This is the one negative that belongs inside the prompt besides the closing line, because it is about a reference's ROLE, not about the scene's content.
- Cite a reference as ordinary words in the sentence that uses it: "the rider from <Picture 1> sits the horse of <Picture 2>". A tag hung on the end of a finished sentence, or wrapped in brackets as a note to the reader, is not part of the shot and the model will not read it as one.
- Write the shot so every second of the clip has something in it. A state is not an action: if nothing is written to happen, the model invents motion to fill the time. Bound any sustained action with the moment it ends, and say what holds afterwards.
- After the shot, the camera line, the two sound fields and the constraints close the prompt in that order. All the camera direction belongs in the camera line; a second sentence about framing takes the sound's place and the clip comes back silent.
${CAMERA_RULE}
- A supplied <Audio N> can be kept unaltered and the model will sync a mouth to it. Where a character speaks, put the delivery in the words immediately before the line — "says, in the low measured voice of <Audio 1> and with a tired satisfaction" — and then quote the line exactly. The reference supplies who it sounds like; your words supply how they say it.
${SOUND_RULE}
${CONSTRAINT_RULE}

${CLOSING('the look line', 'shot list above', 'Every shot opens with its own [Shot N] marker and nothing else does.')}`,
      acceptsMedia: ['image', 'audio', 'video'],
      multiScene: true,
    },
  },
};
