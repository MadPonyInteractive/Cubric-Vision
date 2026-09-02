/**
 * Recipe test harness (Stage 1) — run one recipe's test tiers through a REAL LLM
 * and report, per tier: the rewritten prompt, deterministic checks, and an LLM
 * judge verdict.
 *
 *   npm run recipe:test -- <recipeId> [options]
 *   node scripts/recipe-test.mjs <recipeId> [options]
 *
 *   --mode t2v|i2v|r2v  recipe mode (default t2v)
 *   --backend B         where the ENHANCER runs: ollama (default) | comfy | deepinfra
 *   --engine <id|name>  the enhancer LLM: a registry id, a raw Ollama name, or
 *                       (with --backend comfy) a CLIPLoader clip_name
 *   --clip-type T       CLIPLoader.type for --backend comfy (default krea2)
 *   --judge  <id|name>  the grading LLM (ALWAYS pass gemma-3-12b — see below)
 *   --runs N            repeat every tier N times — the CONSISTENCY gate (default 1)
 *   --tier <name>       run one tier only (see TIERS below)
 *
 * THE JUDGE ALWAYS RUNS ON OLLAMA, whatever --backend says. Only the enhancer
 * moves. Two reasons: the instrument must not change while the thing being
 * measured does (otherwise a ladder comparison measures both at once), and a 4B
 * judge fabricates violations — so never leave the judge on the registry
 * default, which is a 4B. See docs/recipes/playbook/05-model-ladder.md. Ollama
 * must be reachable for every run, including a cloud one.
 *
 * Exits 1 if any tier fails any run, so it can gate a loop. Never pipe it
 * through `tee`: the pipeline reports tee's exit code, so a FAILING sweep looks
 * like exit 0.
 *
 * This is a runner, not an auto-iterator: it tells the agent WHAT broke, the
 * agent decides what to change in the recipe. Stage 1 is text-only — nothing
 * here renders an image, and nothing here may flip a recipe to `validated`.
 * See docs/recipes/playbook/.
 *
 * Ported from Cubric-Prompt `scripts/recipe-test.ts` (MPI-35 phase 4) as plain
 * ESM, matching Vision's other `scripts/*.mjs`: no TypeScript pipeline, no
 * vite-node, no build step. The recipes it reads are the ported ones in
 * `js/data/recipes/`, not a copy. The backends live in `./recipe-engines.mjs`.
 */
import { getRecipe } from '../js/data/recipes/registry.js';
import {
    avoidedTerms,
    composeSystemPrompt,
    styleTerms,
    DEFAULT_STYLE,
} from '../js/data/recipes/styles.js';
import {
    ComfyUIEngine,
    DeepInfraEngine,
    OllamaEngine,
    getModel,
    DEFAULT_MODEL_ID,
} from './recipe-engines.mjs';

/**
 * Two families of tier.
 *
 * The four JOB tiers (Fabio, 2026-07-27) test the four jobs a recipe must do —
 * expand, rearrange, condense, infer intent. Every recipe faces the same inputs
 * so results are comparable across models. `directed` is deliberately garbled
 * ("shooting on a Thufpik eye skin detail") — that IS the "user can't describe
 * what he means" case. They all run on the DEFAULT style.
 *
 * The four REGISTER tiers (MPI-19) test the style axis instead. They exist
 * because every job tier rewards art direction, so a recipe that cannot produce
 * a candid photograph still passes a full job sweep — which is exactly what
 * happened, and is why Fabio's 2026-07-28 render grid came back uniformly
 * composed and colour-graded.
 *
 * A tier with no `style` runs on `general`. Register tiers are skipped
 * automatically for a recipe that has not authored `styleVocabulary`.
 */
const TIERS = [
    {
        name: 'bare',
        job: 'EXPAND a near-empty input into a full, model-shaped prompt without inventing a different subject.',
        input: 'cat',
    },
    {
        name: 'medium',
        job: "RESTRUCTURE a plain-English scene into the target model's element order, adding craft detail (light, lens, texture) that serves the stated mood.",
        input:
            'A man sitting on a rocking chair with two cats at his feet by the fireplace in a warm environment, cosy warm atmosphere',
    },
    {
        name: 'directed',
        job: 'REARRANGE an input that already carries technical direction, keep every technical choice the user made, and INFER what the garbled part was reaching for.',
        input:
            'Close-up shot of a cowboy wearing a hat and shooting on a Thufpik eye skin detail, pores, anamorphic lens, low-angle shot taken on a cinema camera',
    },
    {
        name: 'overlong',
        job: "CONDENSE an over-budget, rambling input into the target model's format and length, keeping the high-signal detail and dropping the rest.",
        input:
            'I want a really epic and beautiful cinematic shot of a lone samurai warrior, he is standing at the edge of a cliff, and the cliff overlooks a huge valley that is full of cherry blossom trees in full bloom, and the petals are blowing everywhere in the wind, thousands of them, and the sky is that kind of orange purple sunset colour with big dramatic clouds, maybe some birds flying in the distance, and the samurai is wearing very detailed traditional armour with lacquered plates and silk cords, deep red and black, and he has a katana that he is holding pointed down at his side, and his long hair is blowing in the wind too, and there is a torn banner on a pole behind him flapping, and the mood should be melancholy but also heroic, like the end of an era, and I want it to look like it was shot on film with anamorphic lenses and beautiful bokeh, very shallow depth of field, maybe some lens flare from the sun, and the camera should be low angle looking up at him to make him look powerful and small at the same time against the huge sky, extremely detailed, 8k, masterpiece quality, trending on artstation, and also make the armour look worn and battle damaged with scratches and dents and dried mud, and his face should show he is tired but determined, with a scar over one eye, and I was also thinking maybe there could be a ruined temple or a shrine gate somewhere in the middle distance, half swallowed by the trees, with moss on the stone and some of the roof tiles fallen in, and honestly I keep going back and forth on whether there should be rain or not, probably not rain but maybe the air is a bit hazy or misty down in the valley so you get those layers of depth receding away, and there could be a few crows on the branches near him, and I want his hands to look real, weathered, with old scars on the knuckles, and the silk cords on the armour should be slightly frayed at the ends from years of wear, and the whole thing should feel like the very last quiet moment before something terrible happens, that kind of held breath feeling, and the colour grade should lean warm in the highlights and cool in the shadows the way old film stock does',
    },
    {
        name: 'candid-explicit',
        style: 'candid',
        job: 'Obey a register the user NAMED. Expand the scene as usual, but every element must be answered the way an ordinary phone snapshot answers it — never decorate a produced photograph with candid words.',
        input: 'candid photo of my kitchen table this morning',
    },
    {
        // THE OBSERVED FAILURE. Sparse input + a mandated element list is what drove
        // the model back to lighting design and colour grading on 2026-07-28.
        name: 'candid-bare',
        style: 'candid',
        job: 'Hold the candid register on a SPARSE input, where there is nothing to expand from except the register itself. Falling back to art direction is the failure this tier exists to catch.',
        input: 'two friends at a pool party',
    },
    {
        name: 'cinematic',
        style: 'cinematic',
        job: 'Push a sparse input all the way into film-frame art direction — deliberate light, deliberate framing, a grade that carries mood.',
        input: 'a lone samurai at the edge of a cliff',
    },
    {
        name: 'general',
        style: 'general',
        job: "Hold the MIDDLE register: a good photographer's shot. Neither movie-grade theatre nor an amateur snapshot — the failure here is drifting to either edge.",
        input: 'a woman drinking coffee by a window',
    },
];

const FILLER =
    /^\s*(here('s| is| are)|sure|certainly|okay|of course|absolutely|i've|i have|below is|this is|prompt:|enhanced prompt:|optimized prompt:)/i;

/** A label on its own line — small models like to append "Output only:" and then
 *  restate the prompt as keywords. Observed on rung 1, and the leading-filler
 *  regex alone does not see it because it lands mid-output. */
const LABEL_LINE = /^\s*(output|prompt|note|explanation|answer)\b[^\n]{0,20}:\s*$/im;

/** Reasoning leaked into the MIDDLE of an output (MPI-25). An sdxl run emitted a
 *  valid prompt, then "Wait, let me refine the slot structure…" and enumerated
 *  the slots as commentary — 460 words. `FILLER` only inspects the start and
 *  `LABEL_LINE` only matches a handful of nouns, so the sole check that caught it
 *  was the word budget — and six of eight recipes had no budget at the time,
 *  meaning this would have passed clean on any of them.
 *
 *  Anchored to punctuation or phrases a finished prompt does not contain, so a
 *  prompt that legitimately says "she waits at the door" is not a false hit. */
const REASONING =
    /(\bwait,|\bactually,|\blet me (refine|reconsider|re-?check|try|look)|\bself-correction|\bon second thought|\blet'?s (re-?verify|re-?check|look at)|\bhold on\b)/i;

/** The recipe's own slot numbering leaking INTO the prompt (MPI-25). An sdxl run
 *  emitted "…, curious.\n5. close up, 6. sun-dappled garden, 7. golden hour…" —
 *  the element numbers from the systemPrompt reproduced as literal text SDXL
 *  would tokenise. It passed every other check (39 words, no preamble, no
 *  reasoning) and the judge scored it a pass, so nothing caught it.
 *
 *  Anchored to line start or a preceding comma so it only fires on a list
 *  MARKER: "unrealistic dream:1.4", "f/2.8", "shot on 35mm" and "bad hands 5"
 *  all lack the digit-period-space shape. */
const LIST_MARKER = /(^|\n|,\s*)\d{1,2}\.\s/;

const words = (s) => s.trim().split(/\s+/).filter(Boolean).length;
const norm = (s) => s.trim().toLowerCase().replace(/\s+/g, ' ');

const styleOf = (t) => t.style ?? DEFAULT_STYLE;

/** Whole-word, case-insensitive. Substring matching would score "clean" inside
 *  "cleaning" and, worse, fail a leak check on a word that merely contains a
 *  banned one. */
function hasTerm(out, term) {
    return new RegExp(`\\b${term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'i').test(out);
}

/** Objective checks — no model opinion involved. */
function runChecks(tier, input, out, mode, style, isRegisterTier) {
    const n = words(out);
    const checks = [
        { name: 'non-empty', ok: out.trim().length > 0, detail: `${n} words` },
        {
            name: 'no preamble/wrapper',
            ok:
                !FILLER.test(out) &&
                !out.includes('```') &&
                !LABEL_LINE.test(out) &&
                !/^["']/.test(out.trim()),
            detail: out.trim().slice(0, 48).replace(/\n/g, ' '),
        },
        {
            name: 'not an echo',
            ok: norm(out) !== norm(input),
            detail: 'output differs from input',
        },
        {
            name: 'no reasoning',
            ok: !REASONING.test(out),
            detail: REASONING.exec(out)?.[0] ?? 'no self-correction or commentary',
        },
        {
            name: 'no list markers',
            ok: !LIST_MARKER.test(out),
            detail: LIST_MARKER.exec(out)?.[0].trim() ?? 'no numbered slots in the output',
        },
    ];

    if (mode.wordBudget) {
        const { min, max } = mode.wordBudget;
        checks.push({
            name: 'word budget',
            ok: n >= min && n <= max,
            detail: `${n} (want ${min}-${max})`,
        });
    }

    // Deterministic bans (ModeRecipe.forbiddenPatterns). The judge grades `donts`
    // as prose and waves objective breaches through: pony measured 12/12 ALL PASS
    // at 2/2/2 with placeholder slots and a leaked quality word in the outputs.
    for (const { pattern, why } of mode.forbiddenPatterns ?? []) {
        const hit = new RegExp(pattern, 'i').exec(out);
        checks.push({
            name: `forbidden: ${why}`,
            ok: !hit,
            detail: hit ? `FOUND: ${hit[0]}` : 'absent',
        });
    }

    // The condense job is the one length rule a budget alone can't prove.
    if (tier === 'overlong') {
        checks.push({
            name: 'condensed',
            ok: words(out) < words(input),
            detail: `${words(input)} -> ${n} words`,
        });
    }

    // MPI-19 register checks. Both are free of model opinion, which is the point:
    // "it still looks cinematic" was an argument until it became a word count.
    //
    // REGISTER TIERS ONLY. The job tiers carry the user's own direction, and the
    // `overlong` input is explicitly cinematic ("anamorphic", "lens flare",
    // "colour grade"): demanding two GENERAL terms from it pits the register
    // check against the recipe's first rule, preserve every choice the user made.
    // Measured — `overlong` failed exactly that way at 1 general term while the
    // judge scored it 2/2/2.
    if (mode.styleVocabulary && isRegisterTier) {
        const hit = styleTerms(mode, style).filter((t) => hasTerm(out, t));
        checks.push({
            name: 'register vocabulary',
            ok: hit.length >= 2,
            detail: hit.length ? `${hit.length}: ${hit.join(', ')}` : 'none of the style terms',
        });

        // The inverted half. This single check would have caught every image in the
        // 2026-07-28 render grid: the prompts all said "candid" AND "illuminated by
        // shimmering reflections … a rich palette of deep blues".
        const avoided = avoidedTerms(mode, style);
        if (avoided.length) {
            const leaked = avoided.filter((t) => hasTerm(out, t));
            checks.push({
                name: 'no cross-register leak',
                ok: leaked.length === 0,
                detail: leaked.length
                    ? `LEAKED: ${leaked.join(', ')}`
                    : `0 of ${avoided.length} banned`,
            });
        }
    }
    return checks;
}

/**
 * The register the judge grades against (MPI-19). Deliberately NOT a fifth
 * score: it is folded into `format` so the verdict JSON keeps its shape. The
 * candid lens carries the sharpest clause, because the observed failure was a
 * prompt that used the word "candid" and art-directed anyway.
 */
const STYLE_LENS = {
    cinematic:
        'REGISTER: this prompt must read as a frame from a film — motivated directional light, deliberate framing, a grade that carries mood. Penalise it if it reads like an ordinary snapshot.',
    general:
        'REGISTER: this prompt must read as a good photograph — neither a movie still nor a phone snap. Penalise theatrical art direction AND amateur-snapshot artifacts equally; the failure is drifting to either edge.',
    // The carve-out in the middle paragraph is not padding. Without it a 12B judge
    // fails every candid run for "overusing descriptive language (authentic,
    // unpolished)" — it reads the register vocabulary itself as art direction and
    // penalises the recipe for doing exactly what the corpus says candid prompts
    // do. Measured: 0/6 before, and every deterministic check passing underneath.
    candid: `REGISTER: this prompt must read as a snapshot nobody produced. It must still cover every element, but with the answers an ordinary camera in an ordinary moment gives.

THE REGISTER WORDS ARE THE JOB, NOT A FAULT. "candid", "amateur", "snapshot", "casual", "spontaneous", "lo-fi", "authentic", "imperfect", "unpolished", "uneven", "everyday", a named device ("smartphone", "selfie"), and named capture artifacts ("overexposed", "grain", "motion blur") are REQUIRED here. Real candid prompts are built out of exactly these words. Never penalise their presence and never call them art direction, however many of them appear.

WHAT IS ART DIRECTION, and what you must penalise: light that was designed or motivated rather than simply found; composition described as deliberate, balanced, considered or framed; a colour grade or a "rich palette"; posing and staging; and writerly flourishes that admire the image ("every detail feels intentional", "a perfect summer afternoon", "the simple beauty of", "a backyard oasis"). Penalise those EVEN IF the prompt also says "candid" — saying candid and then art-directing is the specific failure being tested.`,
};

function judgePrompt(mode, tier, out, style) {
    return `You are grading ONE rewritten prompt. Be strict and terse.

TARGET MODEL EXPECTS
- Output format: ${mode.outputFormat}
- MUST come first: ${mode.structureOrder[0]}
- Must all be covered somewhere, in any order that reads naturally: ${mode.structureOrder.slice(1).join('; ')}
- Must do: ${mode.dos.join(' | ')}
- Must never: ${mode.donts.join(' | ')}

THE JOB FOR THIS CASE
${tier.job}

${mode.styleVocabulary ? STYLE_LENS[style] : ''}

ORIGINAL USER INPUT
${tier.input}

REWRITTEN PROMPT
${out}

Score each 0 (bad), 1 (acceptable), 2 (good):
- intent: the user's subject and every choice they made survived, and anything vague was resolved sensibly. Judge this against THE JOB above: when the job is to expand a sparse input, adding setting, lighting, style and texture around the user's subject is CORRECT and must not be penalised. Only changing or replacing the subject, dropping a choice the user made, or contradicting them is an intent failure.
- structure: the SUBJECT is named in the opening words, every listed element is covered somewhere, and each subject is grouped with its own attributes rather than scattered. The element order is a recommended flow, NOT a rigid sequence — do not penalise natural prose that weaves elements together, only a prompt that buries the subject or omits an element.
- format: matches the output format, breaks none of the "must never" rules, and sits in the REGISTER described above. IGNORE LENGTH ENTIRELY — word count is measured exactly elsewhere and is none of your business. Never mention or penalise how long the prompt is.

Reply with ONLY this JSON, nothing else. Replace every placeholder with your own
verdict — copying this line back verbatim is not a grade:
{"intent":<0-2>,"structure":<0-2>,"format":<0-2>,"verdict":"<pass|fail>","why":"<your one-sentence reason>"}`;
}

function parseVerdict(raw) {
    const m = raw.match(/\{[\s\S]*\}/);
    if (!m) return undefined;
    try {
        return JSON.parse(m[0]);
    } catch {
        return undefined;
    }
}

function arg(flag) {
    const i = process.argv.indexOf(flag);
    return i === -1 ? undefined : process.argv[i + 1];
}

/** A registry id resolves to its Ollama name; anything else is used verbatim
 *  (ladder rungs are tried before they earn a registry entry). */
function resolveModel(idOrName) {
    return getModel(idOrName)?.ollamaName ?? idOrName;
}

/** The encoder the shipped enhancer graph loads, so the default rung IS the
 *  button's rung (MPI-35 Phase 3 escalates from here). */
const DEFAULT_CLIP_NAME = 'qwen3vl_4b_abliterated_fp8_scaled.safetensors';

/**
 * The enhancer model name for the chosen backend. A registry id resolves per
 * backend; anything else is verbatim, because a ladder rung is tried long before
 * it earns a registry entry.
 */
function resolveEnhancerModel(backend, requested) {
    if (backend === 'comfy') return requested ?? DEFAULT_CLIP_NAME;
    const idOrName = requested ?? DEFAULT_MODEL_ID;
    const entry = getModel(idOrName);
    if (!entry) return idOrName;
    const name = backend === 'deepinfra' ? entry.deepInfraId : entry.ollamaName;
    if (!name) {
        console.error(`Model "${entry.name}" has no ${backend} variant.`);
        process.exit(2);
    }
    return name;
}

function makeEnhancerEngine(backend, clipType) {
    if (backend === 'comfy') {
        return new ComfyUIEngine(undefined, clipType ? { clipType } : {});
    }
    if (backend === 'deepinfra') return new DeepInfraEngine();
    return new OllamaEngine();
}

async function main() {
    // `npm run recipe:test -- <id>` already eats the separator, but a hand-typed
    // `node scripts/recipe-test.mjs -- <id>` (muscle memory from the vite-node
    // original) would otherwise print usage and exit 2.
    const positional = process.argv.slice(2).filter((a) => a !== '--');
    const recipeId = positional[0];
    if (!recipeId || recipeId.startsWith('--')) {
        console.error(
            'usage: npm run recipe:test -- <recipeId> [--engine X] [--judge gemma-3-12b] [--runs N] [--tier T]',
        );
        process.exit(2);
    }
    const recipe = getRecipe(recipeId);
    if (!recipe) {
        console.error(`No recipe "${recipeId}".`);
        process.exit(2);
    }
    const modeKey = arg('--mode') ?? 't2v';
    const mode = recipe.modes[modeKey];
    if (!mode) {
        console.error(`Recipe "${recipeId}" has no "${modeKey}" mode.`);
        process.exit(2);
    }

    const backend = arg('--backend') ?? 'ollama';
    if (!['ollama', 'comfy', 'deepinfra'].includes(backend)) {
        console.error(`Unknown --backend "${backend}" (ollama | comfy | deepinfra).`);
        process.exit(2);
    }
    const engineModel = resolveEnhancerModel(backend, arg('--engine'));
    const judgeModel = resolveModel(arg('--judge') ?? DEFAULT_MODEL_ID);
    const runs = Number(arg('--runs') ?? 1);
    const only = arg('--tier');
    // A recipe without `styleVocabulary` has no register to test — running the
    // register tiers on it would fail four tiers for not having opted in yet.
    const eligible = mode.styleVocabulary
        ? TIERS
        : TIERS.filter((t) => styleOf(t) === DEFAULT_STYLE);
    const tiers = only ? eligible.filter((t) => t.name === only) : eligible;
    if (!tiers.length) {
        console.error(
            `No tier "${only}" for this recipe. Eligible: ${eligible.map((t) => t.name).join(', ')}`,
        );
        process.exit(2);
    }

    // The judge is Ollama on every backend, so Ollama is always required.
    const judge = new OllamaEngine();
    if (!(await judge.isRunning())) {
        console.error('Ollama is not reachable at http://localhost:11434 (it runs the judge).');
        process.exit(2);
    }

    const clipType = arg('--clip-type');
    const engine = makeEnhancerEngine(backend, clipType);
    if (backend === 'comfy') {
        if (!(await engine.isRunning())) {
            console.error('ComfyUI is not reachable (set CUBRIC_COMFY_URL to override :48188).');
            process.exit(2);
        }
        const installed = await engine.listClipNames();
        if (!installed.includes(engineModel)) {
            console.error(`No clip_name "${engineModel}". Installed:\n  ${installed.join('\n  ')}`);
            process.exit(2);
        }
        // The prompt is hand-rolled ChatML, which only a Qwen-family encoder reads
        // as a template — a Gemma checkpoint tokenizes the `<|im_start|>` markers
        // as literal text and the system prompt silently stops being a system
        // prompt. Loud, because a voided sweep still prints PASS/FAIL either way.
        if (!/qwen/i.test(engineModel)) {
            console.warn(
                `WARNING: "${engineModel}" is not a Qwen encoder. The harness sends ChatML,\n` +
                    '         which a non-Qwen tokenizer reads as literal text — the system prompt\n' +
                    '         (the recipe) will not be applied. Treat this sweep as void.\n',
            );
        }
    } else if (backend === 'deepinfra' && !(await new DeepInfraEngine().isReady())) {
        console.error('DeepInfra is not reachable, or DEEPINFRA_API_KEY is missing/invalid.');
        process.exit(2);
    }

    console.log(`recipe : ${recipe.displayName} (${recipe.modelId} / ${modeKey}, ${recipe.status})`);
    console.log(
        `engine : ${engineModel} [${backend}${backend === 'comfy' ? `/${clipType ?? 'krea2'}` : ''}]` +
            `   judge: ${judgeModel} [ollama]   runs: ${runs}\n`,
    );

    const tally = [];

    for (const tier of tiers) {
        let passed = 0;
        const style = styleOf(tier);
        const isRegisterTier = tier.style !== undefined;
        for (let run = 1; run <= runs; run++) {
            const { text } = await engine.complete(tier.input, {
                model: engineModel,
                system: composeSystemPrompt(mode, style),
            });
            const out = text.trim();
            const checks = runChecks(tier.name, tier.input, out, mode, style, isRegisterTier);
            const checksOk = checks.every((c) => c.ok);

            // Never judge an empty output: asked to grade nothing, the judge invents
            // a glowing verdict (observed scoring 2/2/2 on a blank prompt).
            const v = out
                ? parseVerdict(
                      (await judge.complete(judgePrompt(mode, tier, out, style), { model: judgeModel }))
                          .text,
                  )
                : undefined;
            const judgeOk =
                v !== undefined && v.verdict === 'pass' && v.intent > 0 && v.structure > 0 && v.format > 0;
            if (checksOk && judgeOk) passed++;

            console.log(
                `--- ${tier.name} [${style}] (run ${run}/${runs}) ${checksOk && judgeOk ? 'PASS' : 'FAIL'}`,
            );
            console.log(out);
            console.log(checks.map((c) => `  [${c.ok ? 'ok' : 'XX'}] ${c.name}: ${c.detail}`).join('\n'));
            console.log(
                v
                    ? `  [${judgeOk ? 'ok' : 'XX'}] judge: intent=${v.intent} structure=${v.structure} format=${v.format} — ${v.why}`
                    : `  [XX] judge: ${out ? 'unparseable verdict' : 'skipped (empty output)'}`,
            );
            console.log();
        }
        tally.push({ tier: `${tier.name} [${style}]`, passed });
    }

    console.log('=== summary ===');
    for (const t of tally) console.log(`${t.tier.padEnd(9)} ${t.passed}/${runs}`);
    const allPass = tally.every((t) => t.passed === runs);
    console.log(allPass ? '\nALL PASS' : '\nFAILURES — fix the rule that caused them, re-run.');
    await releaseVram();
    process.exit(allPass ? 0 : 1);
}

/**
 * Release VRAM on EVERY exit path, not just success. This matters more than it
 * looks: the family runs one model at a time by agreement — Vision releases
 * before an enhance and vice versa — so weights left resident after an aborted
 * run silently break that guarantee. Measured cost of getting it wrong: a video
 * generation that normally takes <10s ran >3 minutes without finishing while an
 * idle LLM held VRAM alongside it.
 */
async function releaseVram() {
    try {
        await new OllamaEngine().releaseOwnModels();
    } catch {
        // Never mask the real error with a cleanup failure.
    }
}

for (const sig of ['SIGINT', 'SIGTERM', 'SIGHUP']) {
    process.on(sig, () => {
        void releaseVram().then(() => process.exit(130));
    });
}

void main().catch(async (err) => {
    // Most likely cause in practice: Ollama was stopped mid-run to free VRAM for
    // another app. Say so plainly instead of dumping an undici socket trace.
    console.error(`\nRun aborted: ${err.message}`);
    console.error('If Ollama was stopped or restarted mid-run, start it and re-run.');
    await releaseVram();
    process.exit(2);
});
