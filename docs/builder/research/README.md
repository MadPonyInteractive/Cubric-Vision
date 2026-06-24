# Research — locked decisions & measured data

**Read the relevant file before re-testing anything.** These are concluded findings,
not open questions. They graduated here from the live MPI-4 task log so they survive
the card and don't get re-discovered.

| File | Holds |
|---|---|
| [ltx-2.3-tiers.md](ltx-2.3-tiers.md) | Resolution tiers, timing, the /64 size rule, motion-vs-resolution dial. Drives `LTX_RATIOS`. |
| [lora-strength-law.md](lora-strength-law.md) | Distilled-LoRA strength law (0.3–0.7, sweet spot 0.5); model-only; **+ CAPABILITY-LoRA VERDICTS (VBVR + Singularity DROPPED; ship base + prompt-contract)**. |
| [tested-loras-versions.md](tested-loras-versions.md) | **Exact LoRA versions + base tested** → re-test baseline when a NEW version appears. Don't re-litigate from zero. |
| [model-set.md](model-set.md) | The base weights + LoRAs (roles, sizes, status), merge-vs-switch delivery, mirroring TODO. |
| [prompt-contract.md](prompt-contract.md) | The LTX prompt SHAPE (front-loaded anchor + ordered steps) + audio rule → Cubric-Prompt recipe. |
| [strategy.md](strategy.md) | LTX>WAN moat, NSFW capability gap, future NSFW-motion-LoRA epic, release framing. |

## Live task log (NOT here — still on the card)

The blow-by-blow test queue, in-flight state, template node inventory, and held
reminders stay in the MPI-4 task spec (it's a *task* log, this is *findings*):

`Cubric-Vision/.agents/mpi-kanban/tasks/MPI-4/research/ltx-integration-spec.md`

When a finding there concludes and stops being task-specific, graduate it into one
of the files above and leave a pointer.

## Adding a new model's research

When onboarding a different model/workflow, add a sibling set here (e.g.
`research/<model>-tiers.md`, `<model>-lora-notes.md`) and a row in this table. Same
rule: concluded findings live here; the live test log stays on its task card.
