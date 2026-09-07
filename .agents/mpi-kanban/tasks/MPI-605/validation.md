# MPI-605 validation — comfy kitchen attention

**Closed 2026-09-07** (Fabio: the backend is implemented, the card should have closed).

## What shipped

| Evidence | Where |
|---|---|
| LTX takes `ModelAttentionBackend` on `comfy kitchen attention` | `52beb732` — node 641 in `comfy_workflows/ltx_i2v_t2v.json` and `ltx_i2v_t2v_int8.json`, chain `UNETLoader (4) → ModelAttentionBackend (641) → MpiVideoSamplingPreview (366)` |
| The dead `Model_Connect` reroute removed, both docs corrected to the real chain | `52beb732` (`docs/models/ltx/workflow-authoring.md`, `docs/builder/05-author-and-test.md`) |
| Card file claim + checklist landed | `a2f906d1` |
| Third backend (PlagueKind H3 SLA Attention) evaluated and REJECTED — Triton is engine-owned and cannot enter the curated pip set, and its Triton-free path needs comfy-kitchen ≥0.2.32 while core 0.34.0 hard-pins 0.2.31 | `0acf9175`, written into `docs/models/h3/performance.md` |
| Sync | `COMFY_URL=http://127.0.0.1:48188 node scripts/sync-raw-workflows.mjs` — injection rules pass, both tiers rebuilt, runtime diff is exactly the intended node swap |

## Measured (Fabio, live, app engine 48188)

LTX 2.3 i2v 704x1260: 5s warm 159s pytorch → ~140s kitchen, **~1.13x**, cold and warm
agreeing to within half a point. 2s is a null result (92 vs 94, inside the baseline's own
99→94 spread). Root cause of the modest LTX gain found and recorded: only
`comfy/ldm/minimax/` builds `AttentionTensorContainer`, so LTX takes the slow path —
per-call Q/K/V requantisation, paying the INT8 tax without the INT8 discount.

Degrades cleanly where the backend is unavailable: `patch()` falls back to PyTorch
attention with a logged warning and `VALIDATE_INPUTS` always returns True, which is what
makes it shippable in a template at all.

## Not done, and deliberately not blocking

The open checklist items are bench measurements, not product work: one repeat of the 5s
pytorch cell at a paired seed, a 5s quality A/B, and the longest-clip curve. The **H3**
line is a different card and it shipped — MPI-662 put kitchen attention on the H3 turbo
path (`4eda8c6b`). MiniMax Music cannot see the node at all (`minimax_music/ar.py:71`,
`dit.py:88` never thread `transformer_options`); that is recorded on the checklist so no
one benches it expecting a delta.
