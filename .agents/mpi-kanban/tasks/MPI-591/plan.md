# MPI-591 — Plan: Extend Video takes MiniMax H3, and the user picks which

Written 2026-08-31 after Fabio brought in `kat3ri/ComfyUI-MiniMax-H3-Extend`. Two files feed
this plan and neither should be re-searched: `brief.md` (the H3 seam physics — every rule there
fails SILENTLY) and `research/minimax-h3-extend-nodepack.md` (the pack, and what changed).

## The card is UNBLOCKED — that is the headline

`task.json` still says "cannot start until `/mpi-bump-engine` lands a core that has both".
**It already did.** `node_lock.json` pins core `v0.34.0`, and `MiniMaxH3AddGuide` (PR 15439) and
the per-stream `audio_denoise_mask` (PR 15375) are both in that tag — read off the tagged files,
not the changelog. The bench (`G:\ComfyUi`, 0.34.2) has the same. Nothing here waits on anything.

## The decision: first-party masked prefix. The pack is a bench ORACLE, not a dependency.

| route | mechanism | verdict |
|---|---|---|
| **masked prefix** (`brief.md`) | encoded tail written into the target latent's prefix, protected by the nested AV noise mask | **ship this** |
| **the pack** | context keyframes → model regenerates the head → trim | bench-only |

The pack monkey-patches `comfy.ldm.minimax.model.PackedLayout.__init__` and
`comfy.model_base.MiniMaxH3.extra_conds` at import time. We pin core and bump it; a patched
internal that drifts does not raise, it renders a plausible clip that is quietly wrong. Both
patches fix **keyframe** bugs, and the masked-prefix route uses no keyframes — so neither applies
to it. ~80 lines in `ComfyUi-MpiNodes` against a 19th third-party pack that rewrites core.

The pack still earns its keep on the bench: it is the fork's real implementation, so running its
example against ours on the same clip and seed is the only cheap way to check a seam that
otherwise cannot be proven wrong by looking at it.

## Scope: v1 is prompt-only. Refs are a follow-up card.

The pack ships two example workflows and the difference is one input and one weight:

- **Text-to-Video-Extend** → `fl2va` transformer → our **`minimax-h3`** card. Prompt describes the
  new seconds. This is the LTX extend the flow already does, on the other model.
- **Ref-to-Video-Extend** → `ref2va` transformer → our **`minimax-h3-ref2va`** card, plus ref
  images that pin a subject/voice **across the seam**. A second **20.97GB** download, a second
  graph, and its own UI (image slots that only exist for one candidate).

v1 = `minimax-h3` only, so the slot reads `['ltx-23-balanced', 'minimax-h3']` and the flow's input
surface does not change at all. Ref-extend is a real feature and it gets its own card — it is
squarely the LoRA-free character-consistency bet (consistent character, no training),
which is exactly why it should not be smuggled in as a checkbox on this one.

## The one new thing: a Flow whose picked model selects a different WORKFLOW FILE

This is the part that outlives the card, and it is the same finding `task.json` already made.
`modelParams` swaps params inside ONE graph; LTX extend and H3 extend share no nodes.

Today (`js/services/commandExecutor.js:1457`):

```js
const universal = getUniversalWorkflow(payload.operation);   // op → one filename
```

and `getUniversalWorkflow` (`js/data/modelRegistry.js:405`) is `UNIVERSAL_WORKFLOWS[key]?.workflow`.

**Proposed contract — keep resolution where it already lives:**

```js
// universal_workflows.js
flowLtxExtend: {
    workflow: 'flow_ltx_extend.json',            // the recommended candidate, models[0]
    byModel: { 'minimax-h3': 'flow_h3_extend.json' },
},
```

```js
// modelRegistry.js
export function getUniversalWorkflow(key, modelIds = []) {
    const def = UNIVERSAL_WORKFLOWS[key];
    if (!def) return null;
    for (const id of modelIds) if (def.byModel?.[id]) return def.byModel[id];
    return def.workflow ?? null;
}
```

The executor passes `payload.generationSettings?.flowModelIds`, which flow payloads have carried
since MPI-620 (`flowService.js:122`) — so nothing new has to be threaded through, and every
existing caller keeps working on the one-argument form.

Rejected: putting a resolved `workflowFile` straight on the payload from `flowService`. It is
fewer lines and it opens a second route into workflow resolution that bypasses the registry — the
next flow with a two-graph slot would not know which one to copy.

`filePrefix` stays `flowExtendVideo` and the op stays `flowLtxExtend`. **Do not rename the op** —
`operationRegistry.js` + `commandRegistry.js` + the sidecars of every clip already extended read
that key, and MPI-533 (tombstone ledger) is still a `todo`.

## Phases

Each phase has one gate. Do not start the next until its gate is green.

### 1 — Bench: prove the seam (no app, no repo edits)

On `G:\ComfyUi` (0.34.2), with **our** weights: `minimax_h3_video_vae_int8_convrot`,
`minimax_h3_audio_vae_fp32`, the H3 Qwen3-VL encoder. **`minimax_h3_fl2va_*` is NOT on the bench**
(`G:\CubricModels\diffusion_models` has `ref2va` only) — that download is the first thing this
phase needs, ~21GB.

1. Install the pack into the bench `custom_nodes/` **only**, run its Text-to-Video-Extend example
   verbatim on a known clip. That is the oracle take.
2. Build the masked-prefix graph by hand: `MpiH3Length` for the `17k+5` grid, encode the whole
   context run in ONE VAE call, snap the context DOWN onto the grid before slicing the tail
   (trap 1), use a context length divisible by 3 so both clocks line up — **39 / 90 / 141**
   (trap 2), take the audio prefix from the sampled latent not a re-encode, drop guides inside the
   preserved head (trap 3).
3. Same source clip, same seed, both routes. Compare the seam.

> **Gate:** a masked-prefix extend whose seam is at least as clean as the pack's, judged by Fabio.
> A seam that only *looks* fine on one clip is not a pass — run a static shot and a moving one.

Also settle here, cheaply, the thing the ref card will need: does masked prefix + stock
`MiniMaxH3ReferenceToVideo` work with no patch? The context arrives as latent data rather than as a
keyframe, so `extra_conds`' overwrite should never fire. Record the answer either way.

### 2 — The node in `ComfyUi-MpiNodes`

`/mpi-nodes-sync` owns this — the sibling repo's procedures do not load in a Vision session, read
them and follow inline. ~80 lines beside the existing `MpiH3Length` / `MpiH3References` in `h3.py`:
encode tail, snap to grid, write the prefix, build the two-stream mask, drop conflicting guides.
Written from `brief.md`'s rules, **not ported** — `ethanfel/ComfyUI-MiniMaxH3-Contex-Loop` is
GPL-3.0 and MpiNodes has no `LICENSE` file (`brief.md` says so, and it still has none).

Read `MiniMaxH3EncodeAVPatched` first: encoding the prior clip to an AV latent is needed on every
route including ours, and it is the one piece of the pack with no dependency on either patch.

> **Gate:** committed → pushed → `node_lock.json` `ComfyUI-MpiNodes.commit` bumped off
> `5e07043`. A node that is not pinned did not ship.

### 3 — The workflow file

Bench graph → `comfy_workflows/raw/flow_h3_extend.json` → API export → `flow_h3_extend.json`.
`Input_*` / `Output_*` titles per `docs/workflow-authoring/`; agents never hand-edit the JSON —
this is a bench re-export. Titles must at minimum cover `Input_Video`, `Input_Positive`,
`Input_Seed`, `Input_Duration`, `Output_Video`, so the existing collected fields land unchanged.

**H3 has no negative input** (`models.js` `minimax-h3`: `negativePrompt: false` — the conditioning
comes out of a single Qwen3-VL encode). The flow's `negative` field is bench-proven for LTX and
must not silently vanish on the H3 arm — decide with Fabio whether it hides on that candidate
(needs `hiddenWhen`, which MPI-664 is adding anyway) or stays and is documented as ignored.

> **Gate:** `tests/inject-params-titles.test.cjs` extended to pin the new file's titles, green.

### 4 — Wire the pick

Four edits, all small:

| file | edit |
|---|---|
| `js/data/modelConstants/universal_workflows.js` | `byModel` on `flowLtxExtend` |
| `js/data/modelRegistry.js` | `getUniversalWorkflow(key, modelIds)` |
| `js/services/commandExecutor.js` | pass `payload.generationSettings?.flowModelIds` |
| `js/data/flowsRegistry.js` | `requiredModels: [{ label: 'Model', models: ['ltx-23-balanced', 'minimax-h3'] }]` |

`models[0]` is the recommended candidate and the picker stars it — LTX stays first, because it is
what every existing extend ran on. No `modelParams` arm is needed: the two candidates differ by
graph, not by a loader widget inside one graph. Check `tests/flow-model-choice.test.cjs` tolerates
a slot with no `modelParams` — if it does not, that is a test change, not a `modelParams` stub.

H3's licence consent gate (MPI-451, keyed by licence id in `licences.js`) already covers this: an
H3-only user who accepted during an fl2va install gets no second dialog.

> **Gate:** `tests/flow-model-choice.test.cjs` + the inject test green, `node --check` clean.

### 5 — Verify (`docs/playbooks/add-flow/05-verify.md`)

Isolated app on its OWN port and profile (`npm run app:isolated`) — never `:3000`. Pick LTX, run:
unchanged. Pick H3, run: a real clip. Reopen the flow: the pick is session-only by design
(`setFlowModel`), so it does **not** restore — confirm that reads as intended and not as a bug.
Reuse Prompt on an H3 extend must come back on H3 (`flowModelIds` on the sidecar, MPI-620).

> **Gate:** Fabio watches one H3 extend end to end. The live-run gate is his, always.

### 6 — Docs

`docs/playbooks/add-flow/existing-flows/ltx-extend.md` gains the second candidate and the
`byModel` contract; `any-of-models.md` gains "a slot may pick a different GRAPH, not just
different params" — that is the portable half and it belongs there, not on the flow's own page.
Ask before editing `.claude/rules/`.

## Not in v1

- **Ref-to-video extend** — its own card, see § Scope.
- **`minimax-h3-ref2va` as a third candidate** — same thing.
- **The pack in `node_lock.json`** — bench-only. If Phase 1 fails and the pack becomes the route,
  pin `source: git-commit` at `d175f0a`, **not** `registry` (the registry copy is v1.0.0 from
  2026-08-11, 19 days behind `main`), and open an issue asking for a `LICENSE` file.
- **Width/height on the flow** — still MPI-520's open half, still deferred, unchanged by this card.

## Open — needs Fabio

1. **The negative box on the H3 arm** (Phase 3): hide it, or keep it and document that H3 ignores
   it? Hiding is honest but needs `hiddenWhen`; keeping it re-creates exactly the MPI-475 bug
   ("the user typed a stop that never reached the model, and nothing said so").
2. **Is a ~21GB fl2va download acceptable to spend on Phase 1**, before anything is proven? The
   bench has `ref2va` but not `fl2va`, and the prompt-only route needs the latter.
