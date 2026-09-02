# Test corpus — moved into the harness

The fixed test inputs now live in **[`scripts/recipe-test.mjs`](../../../../scripts/recipe-test.mjs)**
as the `TIERS` array, so the harness and the documentation cannot drift apart.
Do not maintain a second copy here.

There are **four tiers**, one per job a recipe must do
([playbook 02 §2.3](../../../../docs/recipes/playbook/02-draft.md)):

| Tier | Proves |
|---|---|
| `bare` | Expand — a one-word input becomes a full prompt without the subject drifting |
| `medium` | Restructure — plain English into the model's element order |
| `directed` | Rearrange + infer intent — technical choices survive, garbled phrasing gets resolved |
| `overlong` | Condense — into format and budget, keeping the specific detail |

Run them:

```bash
npm run recipe:test -- <recipe-id> --engine dolphin3-abliterated --judge gemma-3-12b --runs 3
```

(This replaces the earlier five-case corpus, whose cases tested the same axes
less sharply and were not executable. The `directed` tier is the addition that
matters: it carries deliberately garbled input, which is what exposes whether a
recipe infers user intent or just copies confusion through.)

**i2v modes:** prepend a one-line note describing the user-provided media each
tier assumes (e.g. "input image is a still of the park path"), since i2v prompts
reference media the text-only tiers do not have. Record the assumption in the
validation record.
