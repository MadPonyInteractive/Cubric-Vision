# Research & Synthesis Worksheet — {Model Name} {Version}

Copy to `docs/recipes/research/{model-id}/research.md`. Part A captures the
NotebookLM research (Phase 1); Part B maps it to the recipe schema (Phase 2).
Repeat Part A/B per mode for a dual-mode model.

- **Model version:** {exact version}   **Mode(s):** {t2v | i2v | both}
- **Research date:** {YYYY-MM-DD}   **Sources:** see `sources.md`

---

## Part A — Research (the 7 standard questions)

Keep each answer's source pin so conflicts are visible in synthesis.

1. **Output format & length** — prose / keyword-list / structured-tags /
   timeline? Typical length? → {answer} [src #]
2. **Structural order** — exact element sequence the sources recommend.
   → {answer} [src #]
3. **Vocabulary** — words/phrases the model responds well to (camera, motion,
   lighting, style). → {answer} [src #]
4. **Mistakes & failure modes** — do's and don'ts. → {answer} [src #]
5. **Negative prompts** — supported? what goes there vs. main prompt?
   → {answer} [src #]
6. **What's unique** — does unusually well / poorly vs. a generic model.
   → {answer} [src #]
7. **Example prompts** — 2–3 verbatim from sources (simple scenes).
   → {answer} [src #]

**Optional follow-ups** (rich sources): i2v vs t2v differences; token-ordering
effects; resolution / aspect / duration constraints. → {answers}

### Conflicts & unknowns

- {conflict between src #X and src #Y, and how it was resolved — default to the
  more restrictive, flag for Phase 3}
- {unknown the sources don't answer — must be tested in Phase 3}

---

## Part B — Synthesis (map to RecipeSchema)

Field reference is `js/data/recipes/registry.js`. Fill, then transcribe into
`js/data/recipes/{model-id}.recipe.js`.

**Recipe-level**

| Field | Value |
|---|---|
| `modelId` | {kebab slug, e.g. kling-3.0} |
| `family` | {e.g. kling} |
| `displayName` | {e.g. Kling 3.0} |
| `status` | `draft` |
| `notes` | {conflicts, caveats, model-specific facts} |
| `modes` | {t2v / i2v / both} |

**Per mode** (repeat per mode)

| Field | Value |
|---|---|
| `outputFormat` | {prose / keyword-list / structured-tags / timeline} |
| `lengthNorm` | {e.g. 80–120 words} |
| `structureOrder` | {ordered list} |
| `vocabulary` | {domain → terms} |
| `dos` | {5–8 concrete} |
| `donts` | {5–8 concrete} |
| `negativeHandling` | {none / inline-positive / separate-field} |
| `examplePrompts` | {2–3 short, paraphrased; include the park baseline} |
| `systemPrompt` | {drafted in §2.2 — self-contained} |
| `acceptsMedia` (i2v) | {[] or any of image/audio/video} |
| `multiScene` (i2v) | {true/false} |

### Readiness verdict

- [ ] All 7 questions answered with source pins.
- [ ] Conflicts resolved or flagged for Phase 3.
- [ ] Every schema field can be filled (or the gap is a documented Phase-3 test).
- **Verdict:** {ready to author draft | needs more research — what's missing}
