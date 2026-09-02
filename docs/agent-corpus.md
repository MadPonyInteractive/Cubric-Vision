# Agent corpus format

The shape the in-app agent reads. Settled once here because two cards port into
it — **Cubric-Vision MPI-677** (gap 3) and **Cubric-Prompt MPI-35** (phase 4) —
and porting into a shape the agent cannot read is the expensive mistake.

Written 2026-09-02 from MPI-35's proposal. **Nothing ports until Fabio agrees
it.**

## The one rule

**Two corpora, one retrieval path, and every artefact has exactly one author.**

- *Model knowledge* — the 12 recipes, the vendor prompting rules, the footprint
  curves.
- *App knowledge* — RunPod setup, what each operation does, where the gallery
  is.

The agent **reads** these. It never calls a black box that answers on their
behalf.

## Decision 1 — one artefact, two faces; the brief is RENDERED

A recipe already carries both faces in one object:

| Face | Fields | Consumer |
|---|---|---|
| **instruction** | `systemPrompt` | the PromptBox Enhance button injects it into the LLM call |
| **readable brief** | `structureOrder`, `vocabulary`, `wordBudget`, `lengthNorm`, `dos`, `donts`, `examplePrompts`, `notes`, `negativeHandling`, `forbiddenPatterns` | the agent reads it in conversation |

So **one artefact serves both — render the brief from the data.** Never author a
second document describing a recipe: a hand-written brief drifts from the recipe
it describes, and nothing fails when it does.

`renderRecipeBrief(recipe, mode)` → markdown, deterministic, data only. It is a
formatter, not a source.

The same rule applies to app knowledge: if a fact is already in a data file
(`modelRegistry.js`, `footprint.js`), the corpus entry renders it rather than
restating it.

## Decision 2 — where the recipes land, and in what module shape

```
js/data/recipes/<id>.recipe.js   # one per model, 12 of them
js/data/recipes/registry.js      # RECIPE_REGISTRY + RECIPE_ALIASES + FALLBACK_RECIPE_ID + resolveRecipe()
js/data/recipes/styles.js        # composeSystemPrompt() — the register axis
js/data/recipes/brief.js         # renderRecipeBrief()
```

Plain objects, no classes, no build step — the same idiom as
`js/data/modelConstants/`. **Dual-loadable under both `import` (browser) and
`require` (Node tests), exactly as `resolveModelDeps.js` already is**, because
`tests/*.test.cjs` must read them and `npm test` is `node --test`.

`styles.js` ports even though the register axis is deferred to v1.1:
`composeSystemPrompt()` returns `systemPrompt` unchanged for the 11 recipes with
no `styleVocabulary`, but `krea-2` has one, so dropping the module silently
changes that recipe's shipped prompt.

## Decision 3 — Zod does not survive, and this is what replaces it

Cubric-Prompt validates every recipe with `RecipeSchema.parse()` at module load.
Vision has no Zod and should not gain a dependency for this.

Replacement: **`validateRecipe(recipe)` in `registry.js`** — a plain shape check
(required fields present, `modes` non-empty, `wordBudget.min < max`, every
`forbiddenPatterns` entry a compilable regex), asserted across the whole registry
by one `tests/recipe-registry.test.cjs`.

That moves validation from **module load** to **test time**. State it plainly:
a malformed recipe shipped without running tests will now fail at use rather
than at import. The alternative — adding Zod — buys a fail-fast that `npm test`
already provides for a repo whose data layer is deliberately dependency-free.

## Decision 4 — the retrieval path

One function, one entry shape, both corpora:

```js
listCorpus() -> [{ id, kind: 'model' | 'app', title, tags: string[], text() }]
```

- `kind: 'model'` entries are generated per recipe x mode; `text()` calls
  `renderRecipeBrief()`.
- `kind: 'app'` entries read markdown from `docs/agent/*.md`; `text()` returns
  the file.
- `text()` is lazy so listing the corpus is cheap and the agent pulls only what
  it selects.

The documentation website stays the fallback the agent can point at when no
entry matches — a link, never a fetch.

## Decision 5 — what does NOT port

- **Zod schemas and the TypeScript types** — replaced per decision 3.
- **`src/shared/cubric-api.ts`'s `RecipeModeKey`** — that union exists twice in
  Prompt only because its renderer cannot import from main. Vision has no such
  boundary; one definition.
- **The `draft` → `validated` flip stays human-only.** All 12 recipes port as
  `draft`. An agent may run the Stage 1 harness and report; it never sets
  `validated` and never renders. This is not a Prompt convention being carried
  over out of habit — it is the reason the recipe set is trustworthy.

## Verify

- [ ] Fabio has agreed this format (MPI-677 gap 3).
- [ ] The format is written down **here only**, and both cards reference this
      path rather than restating it.
- [ ] After the port: every recipe id and every alias key Vision sends
      (`models.js` `enhanceRecipe ?? type`) resolves to the intended recipe, and
      no key falls through to `FALLBACK_RECIPE_ID` unintentionally. This is the
      resolution audit `Cubric-Prompt/src/main/recipes/registry.test.ts` already
      encodes — port the test, not just the data. `pony`, `ill-anime` and
      `ill-anime-beauty` are the three keys MPI-25 flagged as needing an explicit
      `enhanceRecipe`.
