/**
 * brief.js — the READABLE face of a recipe, rendered from the recipe itself.
 *
 * A recipe carries two faces in one object (`docs/agent-corpus.md`, decision 1):
 * `systemPrompt` is the instruction face the enhancer injects, and the
 * structured fields are the brief face the agent reads in conversation. This
 * module renders the second from the first artefact.
 *
 * It is a FORMATTER, not a source. Never hand-write a second document
 * describing a recipe: it drifts from the recipe it describes and nothing fails
 * when it does.
 *
 * Deterministic, data only, no I/O — so it loads under both `import` and
 * `require`.
 */

const bullets = (items) => items.map((i) => `- ${i}`).join('\n');

/**
 * Render one recipe mode as markdown.
 *
 * @param {object} recipe   an entry from RECIPE_REGISTRY
 * @param {'t2v'|'i2v'|'r2v'} mode
 * @returns {string} markdown, or '' when the recipe does not declare that mode
 */
export function renderRecipeBrief(recipe, mode) {
    const m = recipe?.modes?.[mode];
    if (!m) return '';

    const out = [
        `# ${recipe.displayName} — ${mode}`,
        '',
        `- **id:** \`${recipe.modelId}\`  **family:** \`${recipe.family}\`  **status:** \`${recipe.status}\``,
        `- **output format:** ${m.outputFormat}`,
        `- **length:** ${m.lengthNorm}${m.wordBudget ? ` (checked: ${m.wordBudget.min}–${m.wordBudget.max} words)` : ''}`,
        `- **negatives:** ${m.negativeHandling}`,
    ];
    if (m.acceptsMedia?.length) out.push(`- **accepts media:** ${m.acceptsMedia.join(', ')}`);
    if (m.multiScene) out.push('- **multi-scene:** yes');
    if (recipe.notes) out.push('', '## Notes', '', recipe.notes);

    out.push('', '## Element order', '', bullets(m.structureOrder));

    out.push('', '## Vocabulary', '');
    for (const [domain, terms] of Object.entries(m.vocabulary)) {
        out.push(`- **${domain}:** ${terms.join(', ')}`);
    }

    if (m.styleVocabulary) {
        out.push('', '## Vocabulary by register', '');
        for (const [style, domains] of Object.entries(m.styleVocabulary)) {
            out.push(`### ${style}`, '');
            for (const [domain, terms] of Object.entries(domains ?? {})) {
                out.push(`- **${domain}:** ${terms.join(', ')}`);
            }
            out.push('');
        }
    }

    out.push('', '## Do', '', bullets(m.dos), '', '## Never', '', bullets(m.donts));

    if (m.forbiddenPatterns?.length) {
        out.push('', '## Forbidden patterns (checked deterministically)', '');
        for (const { pattern, why } of m.forbiddenPatterns) {
            out.push(`- \`${pattern}\` — ${why}`);
        }
    }

    out.push('', '## Examples', '');
    for (const example of m.examplePrompts) out.push('```text', example, '```', '');

    return out.join('\n').trimEnd() + '\n';
}

/** Every mode of every recipe, as `{ id, title, text }` brief entries. */
export function renderAllBriefs(registry) {
    const entries = [];
    for (const recipe of registry) {
        for (const mode of Object.keys(recipe.modes)) {
            entries.push({
                id: `${recipe.modelId}/${mode}`,
                title: `${recipe.displayName} — ${mode}`,
                text: renderRecipeBrief(recipe, mode),
            });
        }
    }
    return entries;
}
