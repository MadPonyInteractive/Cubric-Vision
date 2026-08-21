# MPI-598 — FLUX.2 Klein 9B: model + turbo LoRA + turbo settings

Created 2026-08-21, out of the MPI-357 close-out. MPI-357 built the licence gate this
model needs and deliberately stopped short of the model itself.

## Run the playbook

`/mpi-add-model` — it enforces `docs/playbooks/add-model/` (README hub + 01–06). Model
research lives in `docs/models/klein/` (README + removal + refcontrol + licences).

## What is already done, and must not be rebuilt

| Piece | Where | State |
|---|---|---|
| Licence gate + HF proof | `js/data/modelConstants/licences.js`, `routes/licences.js`, `MpiLicenceGate` | Shipped MPI-357, keyed to `klein-9b` — arms itself when the ModelDef lands |
| Bundled FLUX NCL copy + Attribution Notice | `licences/flux2-klein-9b/` | Shipped MPI-357 |
| Turbo plumbing in the graph | `comfy_workflows/klein_t2i.json` | Built — see below |
| 4B ModelDef to pattern against | `js/data/modelConstants/models.js` (`klein-4b`) | Live |

## The turbo half, precisely

`klein_t2i.json` already carries **`Input_is_Turbo`** — node 52, an `MpiSimpleBoolean`.
It is not decorative: it drives

- **node 203** (`MpiMath`, titled *steps*)
- **node 204** (`MpiMath`, titled *cfg*)
- `MpiIfElse` **57 / 212 / 222**, and `MpiMath` **417 / 418 / 437 / 439**

So the branch is built and parameterised. What is missing is not graph work:

1. **The LoRA itself.** No klein turbo dep exists — the klein deps today are
   `klein-lora-nsfw`, `klein-lora-outpaint`, `klein-lora-refcontrol-depth` and the style
   set. Source it, hash it, stage it to R2 like any other weight.
   **4B's LoRAs will not work — 4B and 9B LoRA dims differ.**
2. **The two number sets.** steps + cfg for turbo ON and for turbo OFF. Bench it on the
   standalone install (port 8188); do not copy krea2's or H3's numbers.
3. **The app switch.** `klein-4b` has `capabilities.turboToggle: false`. Decide for 9B —
   but read the next section first, because that `false` is a measured decision, not an
   oversight.

## 4B's turbo LoRA was DROPPED on purpose — do not "restore" it

`js/data/modelConstants/modelDeps.js` (~line 338, the Klein 4B transformer block) records
it plainly: 4B ships **one** checkpoint, the **distilled** int8_convrot weight, with no
accelerator LoRA and no `Input_Tier` split. The base + turbo pair was **reversed on
2026-07-27 after live step measurement** — distilled at **cfg 1.0 / 4 steps beats
base+turbo**, so both the base checkpoint and `klein-lora-turbo` were dropped rather than
shipped. `negativePrompt: false` on 4B falls out of the same fact: the negative is
bit-identical at cfg 1.0 (max diff 0) and was only ever live at the base's cfg ~5.

**What that means for 9B:** "add the turbo LoRA" is the right instinct but not a
foregone conclusion — the identical experiment on 4B came back the other way. So the
order is **measure, then wire**:

1. Establish which 9B weight we ship — distilled or base. If distilled, it may already be
   at its fast operating point and the LoRA may buy nothing, exactly as on 4B.
2. Bench base+turbo against the distilled weight at its own cfg/steps.
3. Only if turbo wins does the LoRA become a dep, `turboToggle: true`, and a per-run
   toggle — and then check whether `negativePrompt` must go false for the same cfg-1
   reason 4B did.

Recording the losing result is as valuable as the winning one; 4B's is why that comment
exists.

**Precedent for a turbo dep being REQUIRED, not optional:** `krea2-lora-accelerator` and
`minimax-h3-turbo-lora` are both mandatory deps of their models, because turbo is a
*per-run toggle* — the weight has to be on disk before the user can flip it. Same shape
here unless the bench says otherwise.

## Why it is gated, not ready

Fabio, 2026-08-21: another session is bench-testing **4B** as an edit model, and the
product intent is a Flow offering **4B or 9B as a user choice**, traded on speed vs
licence. Wiring 9B before that bench lands is guessing which one wins. Card stays `idea`
until that call is made.

## The changelog entry belongs to THIS card, not MPI-357

MPI-357's gate shipped with **no model carrying a `verify` descriptor**, so no user can
perceive it — H3's dialog is byte-identical to before, and `releaseNotes.js` (1.3.0, line
~144) already describes the licence gate as it exists for them. No entry was owed at
close-out. The moment Klein 9B lands, the proof step becomes visible for the first time
and `docs/releases/UNRELEASED.md` owes a line: a gated model now asks you to request
access at the licensor and paste a Hugging Face token before the download unlocks.

## Licence, in one line

FLUX Non-Commercial Licence v2.1. **Outputs are commercially usable** (§2.d); the bar is on
using the MODEL. Redistribution is permitted under §3, which is why we may host the weights
at all — and why the user still proves their own Hugging Face grant through the MPI-357
gate before our R2 serves them.
