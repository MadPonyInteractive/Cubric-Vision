/**
 * Recipe: PONY — Pony Diffusion V6 XL tag grammar, text-to-image.
 *
 * Targets Cubric Vision's `pony-mix` = **ANImergeMEij v3.0+VAE**
 * (`animergemeij_v30VAE`, Civitai 734527), an anime merge on a Pony V6 XL base.
 * The recipe is named for the GRAMMAR (`score_*` / `source_*` + booru tags),
 * not the merge, so any Pony-lineage checkpoint Vision ships later inherits it.
 *
 * Research: `dev-docs/recipe-research/pony/{sources.md,research.md}` and
 * `vocabulary-evidence.md` — the measured half, 32 prompts from this exact
 * checkpoint + 209 from base Pony, split before counting (playbook §1.4).
 *
 * STATUS: `draft`. Stage 2 (real-model render) is Fabio's.
 *
 * WIRING: Vision must set `enhanceRecipe: 'pony'` on `pony-mix`. There is no
 * alias, and the model declares `type: 'sdxl'` — so until that one line lands,
 * Vision's Enhance on an anime merge runs the `sdxl` PHOTOGRAPHY recipe and
 * returns "candid photography, Sony A7 III, Kodak Portra" with no score chain.
 */

export const pony = {
  modelId: 'pony',
  family: 'sdxl',
  displayName: 'PONY Mix',
  status: 'draft',
  notes:
    'Pony V6 XL tag grammar on an anime merge (ANImergeMEij v3.0+VAE). THREE score tags, not six: the official six-tag chain appears in 0 of 32 real prompts on this checkpoint (30% on base Pony), and score_6_up falls 47% -> 3%. Matches the merge author\'s own published line: "score_9, score_8_up, score_7_up, source_anime". Emits a POSITIVE prompt ONLY — the model does have a live negative field (Vision\'s ModelDef defaults negativePrompt to true), and the author\'s baseline for it is the fixed ladder "score_1, score_2, score_3, score_4, score_5, score_6", but a constant needs no LLM to write it and Prompt\'s connector cannot currently return one (see the negativeHandling note below). Requires clip skip 2 in the workflow — Vision\'s job, not the prompt\'s. The Illustrious/Animagine quality block (masterpiece, best quality, very aesthetic, absurdres) measures MUCH higher here than on base Pony (+17 to +29) and is deliberately WITHHELD pending a Stage 2 A/B — it costs 4-6 tags of a 77-token window and only pixels can price it.',
  modes: {
    t2v: {
      outputFormat: 'structured-tags',
      lengthNorm:
        'about 24 comma-separated booru tags on one line; each tag 1–3 words; corpus median 24 tags / 33 words',
      // ARCHITECTURAL CEILING, inherited from SDXL exactly as in `sdxl.recipe.ts`:
      // CLIP ViT-L's `max_position_embeddings` is 77, so ~75 usable, which for
      // tag text is roughly 55 words before the encoder stops seeing them.
      // ComfyUI chunks past 77 so nothing is lost, but the first window carries
      // the most weight and that is what this targets.
      //
      // The range itself is CORPUS-DERIVED, not documented — no source states a
      // Pony word budget, so playbook §1.3's fallback applied (derive from real
      // examples, say so). Measured: median 33 words / 24 comma segments on the
      // 32 checkpoint-exact prompts, 41 / 25 on the 209 base-Pony ones. Both
      // medians land on ~24 tags, which is the stable figure across the split;
      // the word counts differ more because tag length varies. p90 (129 / 94)
      // is inflated by LoRA-stuffed prompts and is not a target.
      //
      // WATCH IN STAGE 1: the countable unit here is TAGS and the harness counts
      // WORDS. That mismatch is the MPI-16 bug class that has now bitten two
      // recipes (ltx-2.3 six-vs-seven, flux-2 four-vs-five). 24 tags averaging
      // ~1.6 words lands near 38 — comfortably inside — but a terse run writing
      // 12 one-word tags lands at ~19 and fails `min`. If that shows up, settle
      // it with the distribution across runs, not from the failing run.
      wordBudget: { min: 25, max: 75 },
      structureOrder: [
        'Score chain (score_9, score_8_up, score_7_up)',
        'Source tag (source_anime)',
        'Subject count (1girl / 1boy / 2girls / solo)',
        'Identity or character',
        'Physical traits (hair, eyes, face)',
        'Attire',
        'Pose, action and expression',
        'Background and setting',
        'Framing and camera angle',
        'Style and finish',
      ],
      // CORPUS-MEASURED (2026-08-09) from 32 prompts on this exact checkpoint
      // plus 209 base-Pony prompts. Whole-tag matching; single-user prompt
      // families dropped as noise rather than vocabulary. Everything excluded,
      // and why, is recorded in `vocabulary-evidence.md` §7 — read it before
      // re-adding anything, especially the Animagine quality block.
      vocabulary: {
        countAndFraming: [
          '1girl',
          '1boy',
          '2girls',
          'solo',
          'portrait',
          'upper body',
          'full body',
          'half-length portrait',
          'side view',
          'head focus',
        ],
        gazeAndExpression: [
          'looking at viewer',
          'looking up',
          'smile',
          'open mouth',
          'blush',
          'happy',
          'determined',
          'seductive look',
        ],
        hair: [
          'long hair',
          'short hair',
          'twintails',
          'ponytail',
          'double bun',
          'bangs',
          'white hair',
          'black hair',
          'pink hair',
          'blue hair',
        ],
        eyes: ['blue eyes', 'green eyes', 'brown eyes', 'detailed eyes', 'glowing eyes'],
        attire: [
          'white shirt',
          'jacket',
          'hoodie',
          'yukata',
          'kimono',
          'school uniform',
          'japanese clothes',
          'jewelry',
          'necklace',
          'earrings',
          'boots',
          'bow',
        ],
        poseAndAction: [
          'standing',
          'dynamic pose',
          'posing',
          'holding',
          'action-pose',
          'dancing',
        ],
        setting: [
          'outdoors',
          'indoors',
          'night',
          'sunset',
          'evening',
          'blue sky',
          'forest',
          'black background',
          'detailed background',
          'blurry background',
        ],
        lightAndFinish: [
          'cinematic lighting',
          'volumetric lighting',
          'depth of field',
          'neon glow',
          'vibrant',
          'pastel',
          'high contrast',
          'illustration',
          'realistic',
          'chibi',
        ],
        // Merge-specific and genuinely unusual: era tags are near-absent on base
        // Pony and real on this checkpoint (`1990s`, `2000s` in the corpus).
        era: ['1990s', '2000s', 'newest'],
      },
      dos: [
        'Lead with exactly three score tags: score_9, score_8_up, score_7_up.',
        'Always include source_anime — it is the strongest measured marker of this checkpoint (56% vs 13% on base Pony).',
        'Always state a subject count (1girl, 1boy, 2girls, solo) — the model otherwise varies the head count between runs.',
        'Write comma-separated booru tags of 1–3 words, never prose sentences.',
        'Group related tags together (hair with hair, clothing with clothing) rather than interleaving them.',
        'Keep every concrete choice the user already made — character, clothing, setting, colour, framing.',
        'Follow the user into a mature register when they ask for one, and stay out of it when they do not.',
      ],
      donts: [
        'Never emit BREAK or <break> — Vision encodes through stock CLIPTextEncode, which has no such keyword and would render it as a literal word.',
        'Never emit LoRA syntax (<lora:name:0.8>) — Vision owns LoRA selection in its own UI.',
        'Never emit A1111 alternation syntax ([a, b|c, d]).',
        'Do not emit photography vocabulary — camera bodies, film stock, f-stops belong to the SDXL photo recipe, not to an anime merge.',
        'Do not emit a rating_ tag unless the user asked for that register, and never rating_explicit unrequested.',
        'Do not emit source_pony, source_furry or source_cartoon — all three measure 0% on this checkpoint and source_pony drags output toward MLP-style art.',
        'Do not emit generic quality spam (8k, ultra-detailed, intricate details, highly detailed, perfect anatomy).',
        'Do not volunteer hands or feet as a focal point — SDXL struggles with extremities — but honour them when the user explicitly asks.',
      ],
      // MEASURED, not guessed: every one of these was read out of a sweep that
      // the harness scored ALL PASS with the judge at 2/2/2. They are in
      // `donts` as well, which is precisely the point — the judge waved all
      // four through, repeatedly, so prose alone cannot hold them.
      forbiddenPatterns: [
        {
          pattern: '[(\\[<]',
          why: 'bracketed placeholder or note',
        },
        {
          pattern: '[.!?;]\\s*$',
          why: 'sentence punctuation welded to the last tag',
        },
        {
          pattern: '\\b(masterpiece|absurdres|very aesthetic|highres|best quality)\\b',
          why: 'withheld Animagine quality block (a leak invalidates the Stage 2 A/B)',
        },
        {
          // Legal booru counts (1girl/1boy/1other/2girls/2boys) and the era tags
          // (1990s, 2000s) are carved out; anything else digit-welded is a tag
          // the model was never trained on — `1man`, `2cats`.
          pattern: '\\b\\d+(?!girls\\b|girl\\b|boys\\b|boy\\b|other\\b|s\\b|d\\b)[a-z]+',
          why: 'invented count tag (a number welded to a noun)',
        },
        {
          // Booru tags are ASCII. Measured once as a paw-print emoji welded to
          // a comma, which CLIP has no token for at all.
          pattern: '[^\\x00-\\x7F]',
          why: 'non-ASCII character (emoji or smart punctuation)',
        },
        {
          pattern: '\\bBREAK\\b|<lora:',
          why: 'A1111 syntax Vision\'s CLIPTextEncode cannot execute',
        },
      ],
      // The MODEL supports a negative field (Vision's `pony-mix` does not set
      // `negativePrompt: false`, and the ModelDef contract defaults it to true),
      // so this is the honest value. The recipe still emits POSITIVE ONLY, for
      // two reasons:
      //
      //  1. The author's baseline negative is a CONSTANT — "score_1, score_2,
      //     score_3, score_4, score_5, score_6". A string that is identical on
      //     every run does not need an LLM to produce it; it belongs in Vision's
      //     negative-prompt default.
      //  2. Prompt's `prompt.enhance` responder returns only `{ prompt, backend,
      //     model, recipeId, note }` (`src/main/connector.ts`) and never sets
      //     `negativePrompt`, though Vision reads `data.output.negativePrompt`
      //     (`js/shell/connectorOps.js`). So a two-block output lands WHOLE in
      //     Vision's positive box — which for this recipe would put score_1..6,
      //     an explicit request for the worst quality band, into the positive
      //     prompt. `sdxl` has the same defect today with milder consequences.
      //     Fixing the split is MPI-27's; until then, not emitting is correct.
      negativeHandling: 'separate-field',
      examplePrompts: [
        'score_9, score_8_up, score_7_up, source_anime, 1girl, solo, magical-girl, long hair, pink hair, blue eyes, victorian dress, jewelry, posing, dynamic pose, looking at viewer, smile, outdoors, night, lantern light, detailed background, portrait, vibrant, illustration, 1990s',
        'score_9, score_8_up, score_7_up, source_anime, 1boy, solo, short hair, white hair, green eyes, hoodie, jacket, boots, standing, holding, determined, outdoors, forest, evening, blurry background, full body, depth of field, cinematic lighting, illustration',
        'score_9, score_8_up, score_7_up, source_anime, 1girl, solo, twintails, black hair, brown eyes, school uniform, bow, sitting, open mouth, happy, indoors, classroom, blue sky, upper body, looking at viewer, pastel, high contrast, illustration',
      ],
      acceptsMedia: [],
      multiScene: false,
      // STOPPING RULE with both bounds named ("starts with score_9, ends at the
      // last tag"), deliberately NOT a list of prohibitions. `sdxl` learned this
      // the expensive way: an enumerated ban list produced the banned output
      // verbatim in sweep B, and only `wordBudget` caught it. MPI-19's law —
      // never illustrate a prohibition with the sentence it prohibits.
      systemPrompt: `You are an expert prompt engineer for PONY Mix, an anime image model on a Pony Diffusion V6 XL base. It reads comma-separated booru tags, not prose. Your task is to rewrite the user's idea into ONE line of tags.

THREE RULES THAT OVERRIDE EVERYTHING BELOW:
0. THE HEADER AND THE FOOTER. Every line opens with the same five-tag header — score_9, score_8_up, score_7_up, source_anime, and then one count string — and a header is COPIED, never composed: you are not describing the person there, you are stamping a label, and the describing starts on the sixth tag. The count string is 1girl or 1boy whatever the person's age — a man is 1boy — and the reply's final character is the final letter of a style tag such as illustration, realistic or cinematic lighting. Digits belong to those count strings and to nothing else in the line: the picture is counted once, there in the header, and never counted again lower down. Where something else genuinely needs a number it is counted in words — two cats, three lanterns — with a space between the number and the thing. And no position is left as a question for somebody else to answer — where the user did not specify a colour or a garment, you choose one and write the choice itself.
1. THE SUBJECT IS FIXED. Whatever the user named is what the image is of. If the input is a single word, that word IS the subject — "cat" means a cat, and your output must describe a cat. Never replace it, never upgrade it to something grander, never drift to a different character, animal or scene. Everything the user named — every person, animal, object, garment and place — is written into the line BEFORE anything you chose yourself, and your own additions fill whatever tags are left over. When the count is tight it is your inventions that go, never their furniture and never their pets.
2. LENGTH: write ABOUT TWENTY-FOUR comma-separated tags and stop. Each tag is one to three words. The SAME twenty-four whatever length the input was: a one-word input and a four-hundred-word brief both come out as one line of about twenty-four tags. This model's text encoder only reads about 75 tokens, so going long is a failure even when the writing is good — the tail is simply not seen. Going short is equally a failure: a slot you leave out is one the model fills with its own default. A finished line is about twenty-four tags and thirty to forty words. Anything much shorter has left elements below unanswered, and the answer to an unanswered element is a tag, never a note about the element.

Now decide which job the input needs:
- Sparse (a few words): EXPAND it across the elements below — hair, eyes, clothing, pose, setting, framing — choosing details that serve the subject the user named. Never swap in a different or more photogenic subject.
- Detailed but disordered: REARRANGE it into the order below. Every choice the user already made — their character, clothing, colour, pose, setting, framing — must survive into the tags.
- Long or rambling: CONDENSE it. Read it once, note the subject and the handful of details that genuinely change the image, then SET THE INPUT ASIDE and write the tag line from those notes. Never walk the input clause by clause — that is what produces a line the encoder cannot read. Drop repetition and anything that does not change the picture. The brief is prose and carries prose habits — sentences, and the punctuation that closes them; your line inherits its content and none of its habits. A long brief will not fit in twenty-four tags, and that is the point: keep what most changes the image and discard the rest, including detail you like.
- Vague, garbled, or reaching for a word the user cannot find: INFER what they meant and state it as a booru tag. Resolve it — never copy the confusion through, and never silently drop it.

Filling the elements below is NEVER "adding". Hair, eyes, clothing, setting and framing are REQUIRED elements, so writing them when the user did not is the job, not an invention — and neither is restating something the user already gave you. What counts as invention is a new character, object or animal that was not there.

Write the tags in this order:
1. score_9, score_8_up, score_7_up — exactly these three, exactly first, always. Not more of the ladder, not fewer.
2. source_anime — always.
3. Subject count — always name one, by answering one question: are there PEOPLE in this picture?
   - People in it: count them — 1girl, 1boy, 1other, 2girls, 2boys, multiple girls, multiple boys. 1girl is any female person at any age and 1boy is any male person at any age: a woman is 1girl, a man is 1boy, an old man is 1boy. Those are the words this model was trained on and age is carried by other tags. 1other is a person who is neither; it never means a non-human. Add solo when exactly one figure is in frame.
   - No people in it — an animal, an object, a landscape: the count tag is no humans, and the creature or object is named in the very next tag.
   Animals and objects are NAMED, never counted, in both cases alike: cat for one and two cats for a pair, however many of them share the picture with whoever else is in it.
   A picture with a person in it opens score_9, score_8_up, score_7_up, source_anime, 1girl, solo, and a picture of a wolf on a hillside opens score_9, score_8_up, score_7_up, source_anime, no humans, wolf. This slot is chosen, not written: pick the one string from that list which fits the picture and copy it across exactly as it is spelled here. It is a fixed label rather than a description of anybody — describing them is what the tags after it are for. Those eight are the whole count vocabulary the model was trained on; anything else in that slot is not a count to this model, it is a word it will try to draw. Without a count tag the model varies the head count from run to run and clones figures into the background.
4. Identity or character: who this is, when the user named someone or something specific. Any animal sharing the scene is named here as well — cat, cats, dog, horse — because it is part of who is in the picture, and an animal the user put there always survives into the line.
5. Physical traits: hair length and colour, eye colour, face. Examples: long hair, pink hair, blue eyes, detailed eyes, bangs, twintails.
6. Attire: clothing and accessories. Examples: school uniform, hoodie, kimono, jacket, jewelry, necklace, boots.
7. Pose, action and expression. Examples: standing, sitting, dynamic pose, holding, looking at viewer, smile, open mouth, determined.
8. Background and setting. Examples: outdoors, indoors, forest, night, sunset, blue sky, black background, detailed background, blurry background.
9. Framing and camera angle. Examples: portrait, upper body, full body, half-length portrait, side view.
10. Style and finish — and this is where the line ends. Choose the finish tag that suits the picture from illustration, realistic, chibi, vibrant, pastel, high contrast, cinematic lighting, volumetric lighting, depth of field. Like the count, this is a slot you choose from rather than one you write freely: every style and finish tag in your line comes from that list and from nowhere else. Write it and stop — the last letter of that finish tag is the last character you type, and a finish tag is what a finished line ends on.

The numbers above are this brief's, not the prompt's. Every tag you write names something a viewer could see in the finished picture. Where the user left a detail open — a colour, a garment, a time of day — you are the one who picks it, and what you write is the choice you made: orange fur, green eyes, red scarf, dusk. Every tag is a decision already taken, so each one reads like a thing in the picture rather than a question about it. Committing to a specific value IS the job: a detail left open is one the model resolves worse than you would.

Every element above is answered in a finished prompt — that sequence IS the prompt, and filling it from a sparse input is the expand job, not padding. Give each element one to three tags; the ones the user cared about get three, the rest get one.

The first four tags ARE the quality request. score_9, score_8_up, score_7_up is how this model is asked for its best work, and source_anime is how it is asked for this style. That request is complete once those tags are written: everything after them describes the picture and nothing after them asks for quality, resolution, detail or polish again. A tag spent asking twice is a tag not spent on the image, and this encoder only reads about seventy-five tokens.

Use the plain booru form of a tag when one exists — glasses rather than spectacles, armor rather than armour, cat ears rather than kitty ears. These are the strings the model was trained on; a synonym is a different point in its vocabulary and lands somewhere softer.

Write plain booru tags separated by commas. No sentences, no paragraphs, no weighting numbers, no angle brackets, no square brackets, no chunk separators — this model's encoder reads a plain comma-separated line and treats any other punctuation as words to draw.

The user's own register governs the content: write the scene they asked for, at the level they asked for it, and do not shift it in either direction.

This line is read by an image model and by nothing else. It cannot answer a question, take an instruction, or fill in a blank left for it — every position in the line is a tag it will try to draw, so each position holds a decided value.

The finished line reads as an unbroken list, and every character you type belongs to one of exactly two things: a tag, or the comma and space that joins two tags. There is no third kind of character in the line and nowhere for an aside to live, because a tag is a thing in the picture and an aside is a thing about the picture.

Your reply starts with score_9 and finishes on a style tag — illustration, realistic, chibi, vibrant, pastel, high contrast, cinematic lighting, volumetric lighting or depth of field. Whatever else the line contains and wherever else those words appear in it, one of them is the last tag you write, and the final character of your whole reply is the final letter of that tag. No preamble, no markdown, no label, no commentary. If you would reconsider, do it silently and emit only the final line. A finished reply has the length and the shape of the line below, which stops on the last letter of its final tag and carries nothing after it:

score_9, score_8_up, score_7_up, source_anime, 1girl, solo, twintails, black hair, brown eyes, school uniform, bow, sitting, open mouth, happy, indoors, classroom, blue sky, upper body, looking at viewer, pastel, high contrast, illustration`,
    },
  },
};
