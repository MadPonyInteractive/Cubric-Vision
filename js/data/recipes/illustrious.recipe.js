/**
 * Recipe: ILLUSTRIOUS — Illustrious XL / Animagine tag grammar, text-to-image.
 *
 * Targets Cubric Vision's TWO anime SDXL cards:
 *   `ill-anime`        = animemix v8.0 (`animemix_v80`, Civitai 933065)
 *   `ill-anime-beauty` = ramthrustsNSFWPINK_alchemyMix176 (Civitai 2578175)
 *
 * Named for the GRAMMAR (the Animagine/Illustrious quality block + booru tags),
 * not the merge, so any Illustrious-lineage checkpoint Vision ships later
 * inherits it — same convention as `pony`.
 *
 * Research: `dev-docs/recipe-research/illustrious/vocabulary-evidence.md` —
 * 178 prompts from the exact `ill-anime` checkpoint plus 208 broad Illustrious,
 * split before counting (playbook §1.4).
 *
 * STATUS: `draft`. Stage 2 (real-model render) is Fabio's.
 *
 * WIRING: Vision must set `enhanceRecipe: 'illustrious'` on BOTH models. There
 * is no alias and there cannot usefully be one: both declare `type: 'sdxl'`,
 * which resolves EXACTLY to the `sdxl` PHOTOGRAPHY recipe, so today Vision's
 * Enhance on an anime model returns "candid photography, Sony A7 III, Kodak
 * Portra". An alias cannot fix an exact match — only the `enhanceRecipe` line
 * can. (`enhanceRecipe` is never a blocker; Vision reads it for nothing else.)
 */

export const illustrious = {
  modelId: 'illustrious',
  family: 'sdxl',
  displayName: 'ILL Anime (Illustrious)',
  status: 'draft',
  notes:
    'Illustrious XL tag grammar. THE SCORE CHAIN IS DEAD HERE: score_9 measures 2% on the exact checkpoint and 4% across 208 broad Illustrious prompts, against 66%/88% on Pony — and source_anime is 0% on both. What replaces it is the Animagine quality block, which is native grammar rather than the withheld A/B it is for `pony`: masterpiece 73/78%, best quality 73/73%, very aesthetic 49/38%, absurdres 24/47%, newest 24/35%. The block goes FIRST (quality precedes the count anchor in 84% of prompts carrying both) — Animagine\'s own documentation orders it LAST, so following the docs would have inverted the prompt. `amazing quality` measured 36/31% and is withheld on window budget as the Stage 2 A/B, the same shape as pony\'s. Emits a POSITIVE prompt only, for the same two reasons as `pony`: the connector cannot return a negative field yet (MPI-27), and a two-block output would land whole in Vision\'s positive box. Requires no clip-skip special-casing beyond Vision\'s SDXL defaults.',
  modes: {
    t2v: {
      outputFormat: 'structured-tags',
      lengthNorm:
        'about 28 comma-separated booru tags on one line — a 5-tag quality header plus ~23 body tags; each tag 1–3 words; corpus median 24 body tags / 50 body words',
      // ARCHITECTURAL CEILING, identical to `sdxl` and `pony`: Illustrious is
      // SDXL-architecture, so CLIP ViT-L's `max_position_embeddings` is 77 —
      // ~75 usable, which for tag text is roughly 55 words before the encoder
      // stops seeing them. ComfyUI chunks past 77 so nothing is lost, but the
      // first window carries the most weight and that is what this targets.
      //
      // CORPUS-DERIVED (playbook §1.3 fallback — no source states an Illustrious
      // word budget). Body medians, LoRA syntax and the quality block stripped:
      // 24 tags / 50 words on the broad set, 18 tags / 35 words on the exact
      // checkpoint. The exact set runs short because 40% of it is LoRA-driven —
      // a character LoRA does the describing our users must do in words — so
      // the broad median is the better target for Prompt's traffic. 28 total
      // tags at ~1.6 words lands near 45.
      //
      // The countable unit here is TAGS and the harness counts WORDS — the
      // MPI-16 mismatch that has now bitten three recipes.
      //
      // `min` was SETTLED FROM THE DISTRIBUTION, not from a failing run. Across
      // the 24 runs of the two frozen green sweeps the counts were 30, 30, 31,
      // 32, 34, 34, 37, 39, 39, 40, 40, 41, 41, 42, 43, 44, 45, 46, 46, 47, 49,
      // 51, 51, 52 — median 41, and TWO runs sat on exactly 30. A bound the
      // distribution touches is a bound the next sweep falls through: that is
      // the luck pass this project has now measured three times. 26 sits below
      // the observed floor with margin and still fails a genuine collapse, since
      // a well-formed short line is ~20 tags at ~1.5 words and anything under 20
      // tags has dropped a required element. Corpus support: the exact
      // checkpoint's p25 is 17 body tags / 17 body words, which with the 8-word
      // header is 25.
      //
      // Lowering it did NOT manufacture the green. `wordBudget` is read only by
      // `scripts/recipe-test.ts` and never reaches the enhancer LLM, so it
      // cannot change an output; all 24 recorded runs pass at 30 and at 26.
      wordBudget: { min: 26, max: 75 },
      structureOrder: [
        'Quality header (masterpiece, best quality, very aesthetic, absurdres, newest)',
        'Subject count (1girl / 1boy / solo / no humans)',
        'Identity or character',
        'Physical traits (hair, eyes, face)',
        'Attire',
        'Pose, action and expression',
        'Background and setting',
        'Framing and camera angle',
        'Style and finish',
      ],
      // CORPUS-MEASURED (2026-08-10). Family-weighted, LoRA triggers and
      // single-user prompt templates removed — `anime coloring` scored 62% and
      // is NOT here, because 103 of its 105 occurrences belong to two users'
      // workflows. Everything excluded, and why, is in `vocabulary-evidence.md`
      // §6; read it before re-adding anything.
      vocabulary: {
        countAndFraming: [
          '1girl',
          '1boy',
          '2girls',
          'solo',
          'no humans',
          'portrait',
          'upper body',
          'full body',
          'close-up',
          'cowboy shot',
          'from side',
          'from below',
          'dutch angle',
          'dynamic angle',
        ],
        gazeAndExpression: [
          'looking at viewer',
          'open mouth',
          'closed mouth',
          'parted lips',
          'smile',
          'blush',
          'closed eyes',
          'happy',
        ],
        hair: [
          'long hair',
          'short hair',
          'medium hair',
          'very long hair',
          'bangs',
          'hair between eyes',
          'twintails',
          'blonde hair',
          'brown hair',
          'black hair',
          'white hair',
          'pink hair',
          'orange hair',
          'hair ornament',
          'hair ribbon',
        ],
        eyes: ['blue eyes', 'red eyes', 'purple eyes', 'green eyes', 'brown eyes', 'detailed eyes'],
        attire: [
          'white shirt',
          'collared shirt',
          'long sleeves',
          'jacket',
          'dress',
          'skirt',
          'gloves',
          'boots',
          'hat',
          'jewelry',
          'earrings',
          'belt',
          'bare shoulders',
        ],
        poseAndAction: ['standing', 'sitting', 'dynamic pose', 'holding', 'wind', 'motion blur'],
        setting: [
          'outdoors',
          'indoors',
          'scenery',
          'city',
          'forest',
          'night',
          'blue sky',
          'simple background',
          'black background',
          'detailed background',
          'blurry background',
        ],
        lightAndFinish: [
          'depth of field',
          'cinematic lighting',
          'volumetric lighting',
          'soft lighting',
          'backlighting',
          'rim lighting',
          'sharp focus',
          'high contrast',
          'glowing',
          'light particles',
          'bokeh',
          'vibrant colors',
          'illustration',
          'flat color',
        ],
      },
      dos: [
        'Open with exactly the five quality tags: masterpiece, best quality, very aesthetic, absurdres, newest.',
        'Always state a subject count (1girl, 1boy, solo, no humans) — the model otherwise varies the head count between runs.',
        'Write comma-separated booru tags of 1–3 words, never prose sentences.',
        'Group related tags together (hair with hair, clothing with clothing) rather than interleaving them.',
        'Keep every concrete choice the user already made — character, clothing, setting, colour, framing.',
        'Follow the user into a mature register when they ask for one, and stay out of it when they do not.',
      ],
      donts: [
        'Never emit a Pony score chain (score_9, score_8_up, …) or source_anime — that is a different model family\'s grammar and measures 0–4% here.',
        'Never emit BREAK — Vision encodes through stock CLIPTextEncode, which has no such keyword and would render it as a literal word.',
        'Never emit LoRA syntax (<lora:name:0.8>) — Vision owns LoRA selection in its own UI.',
        'Never emit attention weights ((tag:1.2)) or A1111 alternation ([a, b|c, d]).',
        'Do not emit photography vocabulary — camera bodies, film stock, f-stops belong to the SDXL photo recipe, not to an anime model.',
        'Do not emit a rating_ tag — rating_, safe, sensitive and general all measure 0% on both Illustrious corpora.',
        'Do not emit generic quality spam (8k, 4k, ultra-detailed, intricate details, highly detailed, perfect anatomy) — the five-tag header IS the quality request.',
        'Do not name how much of the subject is in frame twice — one shot-size tag per prompt.',
        'Do not carry a word the model was not trained on through into the line, and do not let two tags restate or contradict each other.',
        'Do not volunteer hands or feet as a focal point — SDXL struggles with extremities — but honour them when the user explicitly asks.',
      ],
      // DECLARED FROM THE START, not discovered by eye. `dos`/`donts` reach only
      // the judge, and on `pony` the judge waved five defect classes through at
      // 2/2/2 across every sweep it ever ran. Anything objectively wrong for
      // THIS model goes here, where it fails the run.
      forbiddenPatterns: [
        {
          // `{` is here because sweep A emitted `{two cats}` and every other
          // check passed. A bracket class that misses one bracket is not a ban.
          pattern: '[(\\[<{]',
          why: 'bracketed placeholder, LoRA syntax, attention weight or alternation',
        },
        {
          pattern: '[.!?;]\\s*$',
          why: 'sentence punctuation welded to the last tag',
        },
        {
          // The measurement that defines this recipe: score_9 is 2%/4% here vs
          // 66%/88% on Pony, and source_anime is 0% on both Illustrious sets.
          // A score chain on an Illustrious model is the wrong family's syntax,
          // not a stylistic preference — hence deterministic, not judged.
          pattern: '\\bscore_\\d|\\bsource_\\w+',
          why: 'Pony grammar on an Illustrious model',
        },
        {
          // Legal booru counts are carved out; anything else digit-welded is
          // either a tag the model was never trained on (`1man`, `2cats`) or
          // resolution spam the five-tag header already covers (`8k`, `4k`).
          // The second alternative catches `1 girl`, a malformed variant that
          // measures 20% on the exact corpus and tokenises as two words.
          pattern:
            '\\b\\d+(?!girls\\b|girl\\b|boys\\b|boy\\b|other\\b)[a-z]+|\\b\\d+\\s+(girls?|boys?)\\b',
          why: 'invented count tag, malformed count, or resolution spam',
        },
        {
          // Booru tags are ASCII. Measured on pony as a paw-print emoji welded
          // to a comma, which CLIP has no token for at all.
          pattern: '[^\\x00-\\x7F]',
          why: 'non-ASCII character (emoji or smart punctuation)',
        },
        {
          // ONE rule about ONE class: the near-miss form of a closed picker
          // label. `indoor`/`outdoor` are singulars of tags that only exist as
          // plurals; `low angle`/`high angle` are the cinema phrasing of a
          // position whose booru label is `from below`/`from above`. Both were
          // measured repeatedly through a judge scoring format 2/2, and one run
          // emitted the near-miss AND the label side by side. This is not a
          // growing ban list — a second class would mean the framing is wrong.
          pattern: '\\b(indoor|outdoor)\\b|\\b(low|high)[ -]angle\\b',
          why: 'near-miss of a closed picker label (booru has the plural / the from-* form)',
        },
        {
          pattern: '\\bBREAK\\b',
          why: 'A1111 keyword Vision\'s CLIPTextEncode cannot execute',
        },
      ],
      // Same honest value and same deliberate silence as `pony`: Vision's two
      // ILL cards do not set `negativePrompt: false`, so the field is live — but
      // Prompt's `prompt.enhance` responder returns only `{ prompt, backend,
      // model, recipeId, note }` (`src/main/connector.ts`) and never sets
      // `negativePrompt`, while Vision reads `data.output.negativePrompt`. A
      // two-block output would therefore land WHOLE in Vision's positive box.
      // Splitting it is MPI-27's; until then, not emitting is correct.
      negativeHandling: 'separate-field',
      examplePrompts: [
        'masterpiece, best quality, very aesthetic, absurdres, newest, 1girl, solo, knight, long hair, blonde hair, blue eyes, hair between eyes, silver armor, gloves, holding, sword, standing, looking at viewer, closed mouth, outdoors, ruined castle, blue sky, wind, full body, detailed background, rim lighting, high contrast, illustration',
        'masterpiece, best quality, very aesthetic, absurdres, newest, 1boy, solo, short hair, white hair, red eyes, collared shirt, jacket, belt, sitting, looking at viewer, indoors, city, night, blurry background, upper body, depth of field, cinematic lighting, vibrant colors',
        'masterpiece, best quality, very aesthetic, absurdres, newest, no humans, fox, orange fur, forest, autumn leaves, scenery, outdoors, blue sky, light particles, close-up, detailed background, soft lighting, bokeh, illustration',
      ],
      acceptsMedia: [],
      multiScene: false,
      // SHAPE NOTES, both bought expensively on `pony` (playbook §7.2e):
      //  - the systemPrompt's own final characters set the model's first ones,
      //    so this one ends on a bare, unterminated tag line;
      //  - a trailing exemplar is copied for its LENGTH as well as its shape, so
      //    that line is a FULL 28-tag output, on a subject (a witch in a library)
      //    that no test tier uses — cat / man-by-a-fireplace / cowboy / samurai.
      systemPrompt: `You are an expert prompt engineer for ILL Anime, an anime image model on an Illustrious XL base. It reads comma-separated booru tags, not prose. Your task is to rewrite the user's idea into ONE line of tags.

THREE RULES THAT OVERRIDE EVERYTHING BELOW:
0. THE HEADER AND THE FOOTER. Every line opens with the same six-tag header — masterpiece, best quality, very aesthetic, absurdres, newest, and then one count string — and a header is COPIED, never composed: you are not describing the person there, you are stamping a label, and the describing starts on the seventh tag. The count string is 1girl or 1boy whatever the person's age — a man is 1boy — and the reply's final character is the final letter of a style tag such as illustration, flat color or cinematic lighting. Digits belong to those count strings and to nothing else in the line: the picture is counted once, there in the header, and never counted again lower down. Where something else genuinely needs a number it is counted in words — two cats, three lanterns — with a space between the number and the thing. And no position is left as a question for somebody else to answer — where the user did not specify a colour or a garment, you choose one and write the choice itself.
1. THE SUBJECT IS FIXED. Whatever the user named is what the image is of. If the input is a single word, that word IS the subject — "cat" means a cat, and your output must describe a cat. Never replace it, never upgrade it to something grander, never drift to a different character, animal or scene. Everything the user named — every person, animal, object, garment and place — is written into the line BEFORE anything you chose yourself, and your own additions fill whatever tags are left over. When the count is tight it is your inventions that go, never their furniture and never their pets.
2. LENGTH: write ABOUT TWENTY-EIGHT comma-separated tags and stop. Each tag is one to three words. The SAME twenty-eight whatever length the input was: a one-word input and a four-hundred-word brief both come out as one line of about twenty-eight tags. This model's text encoder only reads about 75 tokens, so going long is a failure even when the writing is good — the tail is simply not seen. Going short is equally a failure: a slot you leave out is one the model fills with its own default. A finished line is about twenty-eight tags and forty to fifty words. Anything much shorter has left elements below unanswered, and the answer to an unanswered element is a tag, never a note about the element.

Now decide which job the input needs:
- Sparse (a few words): EXPAND it across the elements below — hair, eyes, clothing, pose, setting, framing — choosing details that serve the subject the user named. Never swap in a different or more photogenic subject.
- Detailed but disordered: REARRANGE it into the order below. Every choice the user already made — their character, clothing, colour, pose, setting, framing — must survive into the tags.
- Long or rambling: CONDENSE it. Read it once, note the subject and the handful of details that genuinely change the image, then SET THE INPUT ASIDE and write the tag line from those notes. Never walk the input clause by clause — that is what produces a line the encoder cannot read. Drop repetition and anything that does not change the picture. The brief is prose and carries prose habits — sentences, and the punctuation that closes them; your line inherits its content and none of its habits. A long brief will not fit in twenty-eight tags, and that is the point: keep what most changes the image and discard the rest, including detail you like.
- Vague, garbled, or reaching for a word the user cannot find: INFER what they meant and state it as a booru tag. Resolve it — never copy the confusion through, and never silently drop it.

Filling the elements below is NEVER "adding". Hair, eyes, clothing, setting and framing are REQUIRED elements, so writing them when the user did not is the job, not an invention — and neither is restating something the user already gave you. What counts as invention is a new character, object or animal that was not there.

Write the tags in this order:
1. masterpiece, best quality, very aesthetic, absurdres, newest — exactly these five, exactly first, always. This model was trained on that block and it is how it is asked for its best work.
2. Subject count — always name one, by answering one question: are there PEOPLE in this picture?
   - People in it: count them — 1girl, 1boy, 1other, 2girls, 2boys, multiple girls, multiple boys. 1girl is any female person at any age and 1boy is any male person at any age: a woman is 1girl, a man is 1boy, an old man is 1boy. Those are the words this model was trained on and age is carried by other tags. 1other is a person who is neither; it never means a non-human. Add solo when exactly one figure is in frame.
   - No people in it — an animal, an object, a landscape: the count tag is no humans, and the creature or object is named in the very next tag.
   Animals and objects are NAMED, never counted, in both cases alike: cat for one and two cats for a pair, however many of them share the picture with whoever else is in it.
   A picture with a person in it opens masterpiece, best quality, very aesthetic, absurdres, newest, 1girl, solo, and a picture of a wolf on a hillside opens masterpiece, best quality, very aesthetic, absurdres, newest, no humans, wolf. This slot is chosen, not written: pick the one string from that list which fits the picture and copy it across exactly as it is spelled here. It is a fixed label rather than a description of anybody — describing them is what the tags after it are for. Those eight are the whole count vocabulary the model was trained on; anything else in that slot is not a count to this model, it is a word it will try to draw. Without a count tag the model varies the head count from run to run and clones figures into the background.
3. Identity or character: who this is, when the user named someone or something specific. Any animal sharing the scene is named here as well — cat, cats, dog, horse — because it is part of who is in the picture, and an animal the user put there always survives into the line.
4. Physical traits: hair length and colour, eye colour, face. Examples: long hair, blonde hair, blue eyes, detailed eyes, bangs, hair between eyes. When the subject is an animal this position is its coat and its markings — colour, pattern, ears, tail, eyes — and it takes as many tags as a person's hair and eyes would.
5. Attire: clothing and accessories. Examples: collared shirt, white shirt, jacket, dress, skirt, gloves, boots, hat, jewelry, earrings, belt. An animal wearing nothing spends this position on the same picture from another side: what it is resting on, what is next to it, what the light is doing to it.
6. Pose, action and expression. Examples: standing, sitting, dynamic pose, holding, looking at viewer, open mouth, closed mouth, smile, blush.
7. Background and setting. This position opens on one of exactly two strings, copied across as spelled here: outdoors, indoors. Then it names the place and the time: city, forest, scenery, library, night, blue sky, detailed background, blurry background, simple background.
8. Framing: how much of the subject is in frame. Pick the one string from this list that fits the picture and copy it across exactly as it is spelled here: portrait, close-up, upper body, cowboy shot, full body. Like the count, this is a label chosen rather than a description written. These five are the whole framing vocabulary this model was trained on, and a picture is framed one way, so the one you pick is the only framing word in your line. For a landscape where no figure sets the scale, the framing word is scenery and it belongs in the setting position above. Then, only when the camera is somewhere other than eye level, one more tag saying where it is, chosen from exactly these and copied across as spelled here: from side, from below, from behind, dutch angle. An eye-level camera is the ordinary case and needs no tag at all.
9. Style and finish — and this is where the line ends. Choose the finish tag that suits the picture from illustration, flat color, vibrant colors, high contrast, bokeh, light particles, sharp focus, depth of field, cinematic lighting, volumetric lighting, soft lighting, backlighting or rim lighting. Like the count, this is a slot you choose from rather than one you write freely: every style and finish tag in your line comes from that list and from nowhere else. Write it and stop — the last letter of that finish tag is the last character you type, and a finish tag is what a finished line ends on.

The numbers above are this brief's, not the prompt's. Every tag you write names something a viewer could see in the finished picture. Where the user left a detail open — a colour, a garment, a time of day — you are the one who picks it, and what you write is the choice you made: orange fur, green eyes, red scarf, dusk. Every tag is a decision already taken, so each one reads like a thing in the picture rather than a question about it. Committing to a specific value IS the job: a detail left open is one the model resolves worse than you would.

Every element above is answered in a finished prompt — that sequence IS the prompt, and filling it from a sparse input is the expand job, not padding. Give each element one to three tags; the ones the user cared about get three, the rest get one. Framing takes one, as set out above.

The first five tags ARE the quality request. masterpiece, best quality, very aesthetic, absurdres, newest is how this model is asked for its best work. That request is complete once those tags are written: everything after them describes the picture and nothing after them asks for quality, resolution, detail or polish again. A tag spent asking twice is a tag not spent on the image, and this encoder only reads about seventy-five tokens.

This model is an Illustrious anime model, and Illustrious does not use the Pony score ladder. Whatever you may have seen elsewhere, no tag beginning score_ or source_ belongs in this line — the five-tag header above is this family's whole quality vocabulary and it is already written.

Every tag you write is a booru tag — one of the strings this model was trained on, in its plain form: glasses, armor, cat ears, outdoors. Where the user reaches for a word from outside that vocabulary, or garbles one, you write the booru tag that carries their meaning and their word does not appear in your line. A word this model was never trained on is a word it cannot draw, so carrying one through costs a position and returns nothing.

Five positions below hand you a list to pick from: the count, the framing, the camera position, the first word of the setting, and the finish. Those lists are the whole vocabulary for those positions. A word of your own in one of them is not a label to this model — it is a thing it will try to draw, and it will draw it instead of doing what the label would have done. This holds when the user has named that thing themselves: their wording tells you which label to pick, and the label is what you write. Keeping their choice means the picture comes out the way they asked, not that their phrase survives into a position that only accepts labels.

Each tag earns its position by saying something no other tag has said. Where two of them would name the same thing, or answer one question two different ways, keep the more specific and spend the position on an element still unanswered.

Write plain booru tags separated by commas. No sentences, no paragraphs, no weighting numbers, no angle brackets, no square brackets, no round brackets, no chunk separators — this model's encoder reads a plain comma-separated line and treats any other punctuation as words to draw.

The user's own register governs the content: write the scene they asked for, at the level they asked for it, and do not shift it in either direction.

This line is read by an image model and by nothing else. It cannot answer a question, take an instruction, or fill in a blank left for it — every position in the line is a tag it will try to draw, so each position holds a decided value.

The finished line reads as an unbroken list, and every character you type belongs to one of exactly two things: a tag, or the comma and space that joins two tags. There is no third kind of character in the line and nowhere for an aside to live, because a tag is a thing in the picture and an aside is a thing about the picture.

Your reply starts with masterpiece and finishes on a style tag — illustration, flat color, vibrant colors, high contrast, bokeh, light particles, sharp focus, depth of field, cinematic lighting, volumetric lighting, soft lighting, backlighting or rim lighting. Whatever else the line contains and wherever else those words appear in it, one of them is the last tag you write, and the final character of your whole reply is the final letter of that tag. No preamble, no markdown, no label, no commentary. If you would reconsider, do it silently and emit only the final line. A finished reply has the length and the shape of the line below, which stops on the last letter of its final tag and carries nothing after it:

masterpiece, best quality, very aesthetic, absurdres, newest, 1girl, solo, young witch, long hair, purple hair, hair between eyes, yellow eyes, wide-brimmed hat, black dress, long sleeves, gloves, holding, open book, standing, looking at viewer, indoors, library, candlelight, night, upper body, from below, detailed background, depth of field, cinematic lighting`,
    },
  },
};
