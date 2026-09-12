/**
 * agentCorpus.mjs — the retrieval path the in-app agent reads from.
 *
 * One function, one entry shape, both corpora (`docs/agent-corpus.md`, decision 4):
 *
 *   listCorpus() -> [{ id, kind: 'model' | 'app', title, tags: string[], text() }]
 *
 * - `kind: 'model'` entries are generated per recipe x mode; `text()` renders through
 *   `renderRecipeBrief()`, so a recipe and its brief can never drift.
 * - `kind: 'app'` entries are the markdown in `docs/agent/`; `text()` reads the file.
 * - `text()` is LAZY on both. Listing the corpus is a `readdirSync` and some string
 *   building; the agent pays for content only on what it selects.
 *
 * SERVER-SIDE ON PURPOSE. `js/` is browser code with no `fs`, and the app half of the
 * corpus is files on disk. `js/data/recipes/*` is plain ESM with no I/O, so importing
 * it from here costs nothing and keeps the recipes a single source.
 *
 * `docs` is not in APP_COPY_EXCLUDES (`scripts/build-portable.mjs`), so `docs/agent/*.md`
 * ships in the portable build.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { RECIPE_REGISTRY } from '../js/data/recipes/registry.js';
import { renderRecipeBrief } from '../js/data/recipes/brief.js';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
export const AGENT_DOCS_DIR = path.join(ROOT, 'docs', 'agent');

// ponytail: a doc's title and tags come from its FILENAME, not from its content or a
// front-matter block. Reading every file to build a listing is the one thing this
// function is supposed to avoid, and a parser for metadata nothing writes yet is
// speculative. Name the file well; add front matter when a doc needs a title a
// filename cannot carry.
const titleFromFilename = (base) =>
    base.replace(/[-_]+/g, ' ').replace(/^./, (c) => c.toUpperCase());

function modelEntries() {
    return RECIPE_REGISTRY.flatMap((recipe) =>
        Object.keys(recipe.modes ?? {}).map((mode) => ({
            id: `${recipe.modelId}:${mode}`,
            kind: 'model',
            title: `${recipe.displayName} — ${mode}`,
            tags: [recipe.modelId, recipe.family, mode, recipe.modes[mode].outputFormat, recipe.status]
                .filter(Boolean),
            text: () => renderRecipeBrief(recipe, mode),
        })),
    );
}

function appEntries() {
    let files;
    try {
        files = fs.readdirSync(AGENT_DOCS_DIR);
    } catch {
        return [];   // no docs/agent yet — the model half is still a corpus
    }
    return files
        .filter((f) => f.toLowerCase().endsWith('.md'))
        .sort()
        .map((file) => {
            const base = file.replace(/\.md$/i, '');
            return {
                id: `app:${base}`,
                kind: 'app',
                title: titleFromFilename(base),
                tags: ['app', ...base.split(/[-_]+/).filter(Boolean)],
                text: () => fs.readFileSync(path.join(AGENT_DOCS_DIR, file), 'utf8'),
            };
        });
}

/** Every corpus entry, model briefs first. `text()` is unread until called. */
export function listCorpus() {
    return [...modelEntries(), ...appEntries()];
}
