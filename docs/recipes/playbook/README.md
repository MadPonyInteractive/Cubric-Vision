# Recipe-creation playbook

How to author **and prove** a target-model recipe for the Enhancer. Run it once
per model. **The process is the asset** — model N+1 is "run this playbook", not
an ad-hoc scramble. It governs new models *and* the revision of every existing
draft recipe.

This folder is the durable home. The executable agent procedure is
[`create-enhancer-recipe`](../../../.agents/skills/create-enhancer-recipe/SKILL.md);
the enforceable rules are
[`.claude/rules/engine-recipes.md`](../../../.claude/rules/engine-recipes.md).
Neither depends on any kanban card surviving archival.

| # | File | What it covers |
|---|---|---|
| 1 | [01-research.md](01-research.md) | Web search first, NotebookLM to reinforce, corpus measurement, provenance |
| 2 | [02-draft.md](02-draft.md) | Schema mapping + writing a `systemPrompt` that does all four jobs |
| 3 | [03-test-loop.md](03-test-loop.md) | **Stage 1** — the autonomous text-only iteration loop |
| 4 | [04-promote.md](04-promote.md) | **Stage 2** — render on the real model, then Fabio's `validated` flip |
| 5 | [05-model-ladder.md](05-model-ladder.md) | Which enhancer LLM to test on, and when to escalate |
| 6 | [06-registers.md](06-registers.md) | The style axis — cinematic / general / candid, and its four extra tiers |
| 7 | [07-when-a-rule-wont-hold.md](07-when-a-rule-wont-hold.md) | *Reference, not a step* — the escalation ladders for a tier that keeps failing |
| 8 | [08-vendor-prompt-skills.md](08-vendor-prompt-skills.md) | **Read before step 1** — the vendor's own prompting skill, and the community ecosystem, as the primary source |
| 9 | [09-field-evidence.md](09-field-evidence.md) | **The return path** — folding a real production's findings back in, and what it invalidates |

---

## What a recipe must actually achieve

Four jobs, one `systemPrompt`. A recipe that only does the first is not done.

| Input | Required behaviour |
|---|---|
| Too small | **Expand** with high-signal detail that serves the stated subject |
| All over the place | **Rearrange** into the target model's element order |
| Too big | **Condense** to the model's format and budget — trim, don't pad |
| Vague / undescribable | **Infer the intent** and express it in terms the model understands |

The user should be able to type badly and still get a prompt the target model
reads well. That is the product claim; the recipe is where it is kept.

**A register is not a fifth job.** `cinematic` / `general` / `candid` is a
cross-cutting property: all four jobs still run, they just resolve into
different words. Optional per recipe — see [06-registers.md](06-registers.md).

---

## The loop

```
0  Skills       the VENDOR's prompting skill first, then the community's    -> the spec
1  Research     web search (always) + NotebookLM (when a notebook exists)   -> evidence
2  Draft        map to RecipeSchema, write the systemPrompt                 -> draft recipe
3  Stage 1      4 job tiers (+4 register tiers) x N runs, checks + judge    -> AGENT-AUTONOMOUS
   |              iterate the recipe until every tier passes every run
4  Stage 2      render the winning prompts on the REAL target model         -> FABIO
5  Promote      draft -> validated                                          -> FABIO ONLY
6  Field        a real production's findings come back and CONTRADICT it    -> re-open, re-sweep
```

**Stage 1 is text-only and fully autonomous** — no image or video is generated.
An agent runs it start to finish, iterating without asking. Stage 2 costs real
generation time, so it only ever runs on a recipe that is already **good and
consistent** in Stage 1. Do not skip ahead: a recipe that fails Stage 1 has
nothing worth rendering.

**Step 0 and step 6 were added 2026-08-17**, both from the same lesson. A
recipe's `systemPrompt` *is* a prompting skill, so the vendor's own skill — and
the community's, which for some models is a thousands-of-stars ecosystem — is
the nearest thing to a specification that exists ([08](08-vendor-prompt-skills.md)).
And the loop does not end at `validated`: when a real production finally shoots
with the model, its findings outrank every Stage 1 green and the recipe reopens
([09](09-field-evidence.md)). `minimax-h3` went through both — the vendor
published a prompt-writing skill that went unread for four sessions, and a
~100-clip production then contradicted the shipped recipe in four places.

---

## Inputs and outputs

- **Input:** a target model name + version (e.g. "Krea 2", "Kling 3.0").
- **Output:** `js/data/recipes/{model-id}.recipe.js` at `status: 'draft'`,
  registered in `registry.ts`, backed by evidence in
  `docs/recipes/research/{model-id}/`:

```
docs/recipes/research/{model-id}/
  sources.md      authority tier + access date per source
  research.md     findings, claim-to-source notes, conflicts
  validation.md   Stage 1 transcript + scores, then Stage 2 render notes
```

---

## Hard rules

- **Never set `status: 'validated'`.** Agents author drafts and report scores.
  Only Fabio flips it, after seeing real-model output. See [04-promote.md](04-promote.md).
- **Version-pinned.** Record the exact model version and research date. A new
  version reopens research; it does not inherit the old record.
- **Paraphrase, keep citations.** Never copy substantial third-party prompt
  examples into a shipped recipe.
- **Stay in your lane.** This work touches `docs/recipes/research/**`, one
  `js/data/recipes/{model-id}.recipe.js`, and `registry.ts`. Not
  `engine/index.ts`, not the connector, not dependencies.
