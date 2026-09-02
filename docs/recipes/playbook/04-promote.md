# 4 — Stage 2: render, then promote

Stage 1 proves the recipe produces **well-formed** prompts. Only the real target
model proves they produce **good output**. This stage is Fabio's; an agent
prepares it and stops.

**Entry condition:** every tier passed every run in Stage 1
([03-test-loop.md](03-test-loop.md)). A recipe that is merely "mostly passing"
does not reach here — rendering is the expensive half, and a recipe that is
inconsistent in text will be inconsistent in pixels.

---

## 4.1 What the agent hands over

- The four final prompts, one per tier, ready to paste.
- `validation.md` — engine + judge models, run tally, the iterations made and
  why, known limitations.
- Any conflict from research that the loop settled empirically, and how.

## 4.2 What Fabio does

Run each prompt on the real target model, at fixed settings, and look for:

- **Coherence** — does the model render a scene that holds together?
- **Fidelity to intent** — is it what the original input asked for, especially
  on `directed` (the technical choices) and `bare` (the subject)?
- **Better than naive** — the controlled comparison below.

**Controlled comparison (mandatory).** Hold the raw input, the enhancer
engine/model, the target-model settings, and the **seed** constant. Change only
the system instruction: recipe vs. a plain "enhance this prompt". If the recipe
output is not visibly better, the recipe has not earned promotion — that
comparison is the entire product claim.

## 4.3 The flip

**`draft → validated` is human-only.** An agent may run every check in this
playbook and report pass; it must **never** set `status: 'validated'` itself.
This is enforced socially, not by the compiler — do not test it.

A recipe is promotable when:

- All four tiers passed all runs in Stage 1.
- Stage 2 rendering is coherent and beats the naive baseline.
- `validation.md` records both, including the settings and seed used.
- Remaining failures are documented in `notes` as confirmed model limitations,
  not left implicit.

Fabio edits `status`, commits, done. Everything else in the recipe stays as the
loop left it.

## 4.4 Revising an existing recipe

Every recipe authored before this playbook existed is `draft` and was written
without the loop. Revising one is the same run with Phase 1 shortened:

1. **Research** — web search only, to confirm or contradict what the recipe
   already claims. Mark stale claims explicitly; do not inherit them.
2. **Draft** — add `wordBudget` (older recipes predate it), then check the
   `systemPrompt` states all four jobs. Most old recipes state one.
3. **Stage 1** — run the loop. This is the step that has never been done.
4. **Stage 2** — as above.

A revision that changes the `systemPrompt` resets any prior sign-off: back to
`draft` until Stage 2 runs again.
