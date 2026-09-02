---
name: create-enhancer-recipe
description: Author, test and iterate a per-target-model prompt recipe for the Cubric Vision Enhancer. Use when adding support for a new target model (Krea, Veo, Seedance, Kling, Wan, LTX, SDXL, Flux, …), refreshing one for a new model version, or revising an existing draft recipe — the research → draft → autonomous test loop that produces a proven draft recipe plus traceable evidence. Triggers: "add a recipe for X", "support model X in the enhancer", "create an enhancer recipe", "revise the X recipe", "$create-enhancer-recipe".
---

# create-enhancer-recipe

The executable procedure. The reasoning behind every step lives in
[`docs/recipes/playbook/`](../../../docs/recipes/playbook/README.md) — read it
once; this skill is the step-by-step you follow each time. The recipe schema is
[`js/data/recipes/registry.js`](../../../js/data/recipes/registry.js) (source of
truth, never restated here).

**Input:** a target model name + version. **Output:** a `draft` recipe at
`js/data/recipes/{model-id}.recipe.js` that has **passed the Stage 1 loop**,
plus evidence at `docs/recipes/research/{model-id}/`.

## Hard rules

- **Never set `status: 'validated'`.** You author drafts and report scores. Only
  Fabio flips it, after seeing real-model output.
- **Never render.** Stage 1 is text-only. Generating images/video is Stage 2 and
  it is Fabio's, and it only happens after Stage 1 passes cleanly.
- **Version-pinned, provenance-preserving.** Exact version, research date, 3–6
  sources with tier + access date, claim-to-source notes.
- **Paraphrase, preserve citations.** Never copy substantial third-party prompt
  examples into a shipped recipe.
- **Stay in your lane.** `docs/recipes/research/**`, one
  `js/data/recipes/{model-id}.recipe.js`, and `registry.js`. Not
  the enhance path, not the connector, not dependencies.

## Phase 0 — The vendor's prompting skill → the specification

Full detail: [playbook 08](../../../docs/recipes/playbook/08-vendor-prompt-skills.md).
**This runs before web search.** A recipe's `systemPrompt` *is* a prompting
skill; the ones that already exist for the target model are the closest thing to
a spec you will get, and for some models they are how every serious user writes
a prompt at all.

1. **The vendor's own repo, including dotfolders.** List the tree rather than
   guessing a path — MiniMax's H3 skill lives at `.claude/skills/`, there is no
   root `skills/` folder, and looking for one found nothing for four sessions:
   ```bash
   gh api repos/<org>/<repo>/git/trees/main?recursive=1 --jq '.tree[].path'
   ```
2. **The community ecosystem, by stars.** Not optional for models that have one:
   Seedance's top prompting skill carries 3,315★.
   ```bash
   gh api "search/repositories?q=<model>+skill&per_page=10" \
     --jq '.items[] | "\(.full_name) — ★\(.stargazers_count)"'
   ```
3. **Diff a vendor skill's references against the model card's `docs/`** before
   reading both — on H3 they were byte-identical, and knowing that is what
   stopped a duplicated read.
4. Record in `sources.md` what was found, what was adopted, and what was
   rejected **with a reason**. "I could not find one" is a finding; "there isn't
   one" is a claim that needs the search behind it.

## Phase 1 — Research → `sources.md` + `research.md`

Full detail: [playbook 01](../../../docs/recipes/playbook/01-research.md).

1. **Web search always runs**, even when notes already exist — for an existing
   recipe the job is to confirm or contradict each current claim. 3–6 sources,
   official docs first. Record tier + access date + URL in `sources.md`.
2. **NotebookLM if a notebook exists** (Fabio curates, you query):
   ```bash
   notebooklm list --json
   notebooklm ask -n <notebook-id> "<question>" --json
   ```
   Always `-n <id>`; **never `notebooklm use`**. No notebook is **not** a
   blocker — note it and continue on web search.
3. Answer the 7 questions into `research.md` with claim-to-source notes.
   **Question 1 must yield a number** — the word budget is machine-checked.
4. **Any finding that is a list of words gets MEASURED, not read.** Two
   vocabulary sets authored from documentation and intuition both measured at
   ~zero against 209 real prompts, so counting is not optional. **The raw prompt
   corpus is NOT in this repo** — it is a gitignored Civitai scrape that stayed
   in Cubric-Prompt (Fabio, 2026-09-02), and the scraper has not been ported.
   The measured *conclusions* did travel: per-term percentages for `pony`,
   `illustrious` and the candid register are in
   `docs/recipes/research/{model-id}/`. A NEW vocabulary claim therefore needs a
   corpus scraped fresh — count on a *split* corpus with *whole-word* matching,
   and record the split per kept term.

## Phase 2 — Draft → `{model-id}.recipe.js`

Full detail: [playbook 02](../../../docs/recipes/playbook/02-draft.md).

1. Map findings to the recipe shape (`validateRecipe()` in `registry.js` is the
   spec). One `modelId`, a `modes` map. **Set `wordBudget`** — without it the
   condense job cannot be checked.
2. Write the self-contained `systemPrompt`. It must state **all four jobs**
   (expand / rearrange / condense / infer intent), the element order, the budget
   as a number, and an absolute output-format rule as its last line.
3. Register in `registry.js` (in a parallel batch, the orchestrator owns that
   edit — report your `{model-id}` + export name instead), then run
   `npm test`. There is no Zod here: `validateRecipe()` replaced it, so a
   malformed recipe **fails at test time, not at import**. Skipping the tests
   means shipping it broken.
4. **Leave `styleVocabulary` off.** A register (`cinematic`/`general`/`candid`)
   is cross-cutting, not a fifth job, and it is proven on `krea-2` only. Adding
   it is a separate, corpus-measured pass:
   [playbook 06](../../../docs/recipes/playbook/06-registers.md).

## Phase 3 — Stage 1, the autonomous loop

Full detail: [playbook 03](../../../docs/recipes/playbook/03-test-loop.md).
**Run this yourself, to completion, without asking.**

```bash
npm run recipe:test -- <recipe-id> --engine dolphin3-abliterated --judge gemma-3-12b --runs 3
```

1. Run all four tiers × 3 runs. The harness applies the deterministic checks and
   an LLM judge, and exits non-zero on any failure.
2. On a failure, change **the rule that caused it** (the playbook's §3.4 table
   maps symptom → fix), re-run just that tier (`--tier <name>`), then a full
   sweep to confirm.
3. **Done = every tier passes every run.** 2/3 is a failing tier, not a pass.
4. Model too weak to follow a clearly-stated rule? Climb
   [playbook 05](../../../docs/recipes/playbook/05-model-ladder.md) — small
   uncensored rungs first, a VRAM bump only as a recorded finding.
5. Write `validation.md` ([template](references/validation-record.md)): models
   used, run tally, final prompt per tier, every iteration and why, known
   limitations.

## Phase 4 — Hand over, then stop

Present the four final prompts + `validation.md` to Fabio for Stage 2 rendering
([playbook 04](../../../docs/recipes/playbook/04-promote.md)). **Stop there.**
The `draft → validated` flip is his.

## Done

The evidence files exist and are traceable, `npm test` validates the recipe as
`draft`,
Stage 1 is green on every tier across every run, and `validation.md` is ready
for review.
