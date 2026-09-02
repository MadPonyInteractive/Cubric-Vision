# Validation Record — {Model Name} {Version}

Copy to `docs/recipes/research/{model-id}/validation.md`. This is what Fabio
reads before Stage 2 rendering and the `draft → validated` flip. An agent fills
it and reports; an agent NEVER sets `validated`.

## Stage 1 — autonomous text-only loop (agent)

- **Recipe / mode:** {model-id} / {t2v | i2v}
- **Enhancer model (ladder rung):** {e.g. dolphin3-abliterated — rung 1}
- **Judge model:** {e.g. gemma4:e4b}
- **Runs per tier:** {3}
- **Date:** {YYYY-MM-DD}

### Final tally

| Tier | Passed | Notes |
|---|---|---|
| bare | {3/3} | |
| medium | {3/3} | |
| directed | {3/3} | |
| overlong | {3/3} | |

**Done means every tier passed every run.** 2/3 is a failing tier.

### Final output per tier

Paste the winning prompt for each tier — this is what Fabio renders in Stage 2.

- **bare:** {…}
- **medium:** {…}
- **directed:** {…}
- **overlong:** {…}

### Iterations

| Round | Symptom | Rule changed | Result |
|---|---|---|---|
| 1 | {e.g. subject drifted on bare} | {rule} | {pass/fail} |

### Ladder movements

| From → To | Why | Rule the smaller model could not hold |
|---|---|---|
| {rung 1 → rung 2} | {…} | {…} |

If no escalation was needed, say so — "held at rung 1" is a valuable finding.

## Stage 2 — real-model render (Fabio)

- **Target service / model version:** {e.g. Krea 2 Large}
- **Target settings:** {resolution, aspect, steps, …}
- **Seed:** {fixed — identical across recipe vs. naive runs}
- **Output references:** {links/paths to renders}

### Naive-baseline comparison

Same raw input + enhancer model + target settings + **seed**; only the system
instruction differs (recipe `systemPrompt` vs. a plain "enhance this prompt").
Where the recipe is measurably better (or not): {…}

## Known limitations

- {confirmed model limitation — documented, not a recipe bug}

## Verdict (proposal only)

- [ ] Every tier passed every Stage 1 run, or remaining failures are documented
  model limitations.
- [ ] `systemPrompt` is self-contained and copy-paste testable.
- [ ] Recipe parses through `RecipeSchema` as `draft`, with `wordBudget` set.
- **Proposed to Fabio:** {ready for Stage 2 | still draft — why}
- **Fabio's decision:** {left blank — Fabio fills this}
