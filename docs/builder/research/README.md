# Builder-Pod research — Pod-perf & cold-start only

**Read the relevant file before re-testing anything.** These are concluded findings,
not open questions.

This folder now holds **only Pod/infra research** — the perf and cold-start
investigations tied to the RunPod engine, not to any one model. **Per-model authoring
& tuning research moved to `docs/models/<model>/`** (MPI reorg 2026-07-12).

| File | Holds |
|---|---|
| [pod-perf-investigation.md](pod-perf-investigation.md) | **Why the cloud 4090 isn't faster than a local 4060 Ti.** cu130 = the fault-in fix (MPI-187, ~10×). Read before proposing any torch/cu130 bump. |
| [quant-and-coldstart-investigation.md](quant-and-coldstart-investigation.md) | **Quant transformer + cold-start sweep.** GGUF Q8_0 bypasses aimdo's staging tax; quant candidate ranking; the aimdo mechanism. Read before any quant/cold-start work. |

## Per-model research moved → `docs/models/<model>/`

| Model | Home |
|---|---|
| LTX-2.3 (tiers, workflow authoring, model-set, LoRA strength law, prompt contract, tested LoRAs, audio, black-bars, lora-merge, strategy) | [../../models/ltx/](../../models/ltx/) |
| Wan 2.2 (tiers, two-stage sigmas) | [../../models/wan/](../../models/wan/) |
| Krea2 (samplers, conditioning, styles, resolution, injection, preview, int8-quant) | [../../models/krea2/](../../models/krea2/) |
| NVIDIA PiD upscaler | [../../models/pid/](../../models/pid/) |

## Live task log (NOT here — still on the card)

The blow-by-blow test queue, in-flight state, template node inventory, and held
reminders stay in the MPI-4 task spec (it's a *task* log, this is *findings*):

`Cubric-Vision/.agents/mpi-kanban/tasks/MPI-4/research/ltx-integration-spec.md`

When a finding there concludes and stops being task-specific, graduate it into the
right `docs/models/<model>/` file and leave a pointer.
