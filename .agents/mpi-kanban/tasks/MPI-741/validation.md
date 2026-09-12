# MPI-741 validation

Docs-only card. No code, so no test run applies.

## Evidence

- `docs/proprietary-models-research/04-architecture-and-billing.md` gains §6.5 (line 438), placed
  between §6.4 and §7, plus one open question and six sources. `git diff --stat`: 47 insertions.
- `docs/proprietary-models-research/README.md`: the 04 row in the file table names §6.5. One line changed.
- Line endings preserved (LF in, LF out, asserted by the edit script before writing).

## What the section records

The recipe-validated enhancer model (`huihui_ai/gemma-4-abliterated:12b`) has no serverless host.
DeepInfra dedicated deployments can host it but bill us per GPU-hour, and a user's own key cannot
reach our deployment. Featherless carries abliterated Gemma 4 12B builds on the user's own
subscription, but not the huihui build. Marked possible, not rejected, and only relevant if the
credit system (Option B) is chosen. That framing is the user's, 2026-09-12.

## Not verified

Cold start of a scale-to-zero deployment, DeepInfra's acceptable-use policy, Featherless's resale
terms. All three are listed as open questions in the doc.
