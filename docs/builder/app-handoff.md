# App Handoff — the boundary to the app pipeline

> **Scope boundary.** This playbook STOPS at "verified dep list + tuned workflow
> JSON". Wiring those into the Cubric Vision app is the app's job and lives in the
> app repo. This file is just the boundary + pointers — not the procedure.

## What the Pod session hands off

1. **The tuned workflow JSON** (with `Input_*`/`Output_*` nodes, MPI nodes only, no
   rgthree).
2. **A verified dep list** — for each weight: `{ name, url, directory, sha256? }`.
   Trust filename + size, not the repo name (mirror filenames have been wrong before).
3. **Tuned settings** captured in [research/](research/) (strengths, tiers, prompt
   contract).

## Where it goes in the app (pointers — read these in Cubric-Vision)

| Step | Where |
|---|---|
| Model + dep definitions | `js/data/modelConstants/` (incl. `dependencies.js`) |
| Op-selectable model shape (commonDeps + operations, per-op install) | memory `Op-selectable models` (MPI-122); chokepoint `resolveModelDeps` |
| Compute missing SHA256 hashes | skill `mpic-compute-dep-hashes` |
| Usable-model gate for pickers | `isModelUsable` |
| Workflow → app API file generation | memory `Workflow generation system` (orchestrator + per-family scripts; an `generate_ltx.py` is planned for the LTX 4-file split) |
| LTX recipe for the prompt app | `Cubric-Prompt/src/main/recipes/{model-id}.recipe.ts` — see [../models/ltx/prompt-contract.md](../models/ltx/prompt-contract.md) |

## Rule of thumb

If a question is "how do I get the weight downloaded and the workflow tuned" → it's
in THIS playbook. If it's "how does the app know about this model / install it /
inject it into ComfyUI" → it's app-side; follow the pointers above and the app's
`.claude/rules/comfy_engine.md` + `comfy_injection.md`.
