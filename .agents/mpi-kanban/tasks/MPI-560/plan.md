# MPI-560 — The Flow track: one umbrella

Merged 2026-08-16 at Fabio's request. Three overlapping Flow umbrellas existed —
MPI-529 (Flow Library v2), MPI-552 (the LTX v2v trio) and MPI-560 (community Flows).
They were one track split three ways: every one of them ends up editing
`js/data/flowsRegistry.js`, and every one of them was gated on the same `FlowStepField`
work. **MPI-529 and MPI-552 are deleted; this card is the only Flow umbrella.**

**The member cards stay on the board.** Nothing was closed or merged to make this. Close a
member when the phase covering it lands, and say so in its card.

## Members

| Card | What it is | Phase |
|---|---|---|
| MPI-332 | Rip the 3 deprecated test flows (image-regen, sdxl-4k, video-stitch) — keep Head Swap | 1 |
| MPI-531 | Package-ready Flows for 1.5 — the authoring shape. **1.5 RELEASE BLOCKER** | 2 (partly landed) |
| MPI-536 | LTX 2.3 foley Flow — **shipped, `validating`** | 3 |
| MPI-520 | LTX 2.3 v2v extend Flow — **shipped, `validating`** | 3 |
| MPI-538 | LTX 2.3 lipsync Flow | 3 |
| MPI-259 | Flows v2 — install / multi-model / reuse paths, UI design pass, 2nd flow | 4 |
| MPI-532 | Community flow packages — data-only folders in `user_flows/`. **Targets 1.6** | 5 |

Adjacent, deliberately NOT members: **MPI-455** (end-frame conditioning — op-side wiring on
the shipped `ltx_i2v.json`, not a Flow) and **MPI-533** (the tombstone ledger phase 5's
deprecation UX depends on — model-registry infrastructure, not Flow format).

## The one idea holding all of it together

`uiComponent` names a JS component, so a third party can never have one. Every Flow
authored with a new component is a Flow that must be ported later. So the authoring shape
is not preparation for the package format — **it is the package format, paid for a release
early, where it is cheap.** Keep the port surface at ONE component (`MpiFlowHeadSwap`),
which is what it becomes once phase 1 rips `MpiFlowImageRegen` with the three test flows.

Naming history when reading old prose: July text says "App"; everything shipped has been
"Flow" since `985faa09`.

## Phase 1: The rip (MPI-332)

Delete the three descriptors and everything only they touch — descriptors in
`js/data/flowsRegistry.js`, the workflow JSONs, `MpiFlowImageRegen`. Delete-only: the
frame, the carousel, Head Swap and the reuse routing all stay.

Grep each removed flow id across `js/` and `comfy_workflows/` before declaring done — a
descriptor removed while a workflow JSON or a reuse entry still names it is a half-rip.
Head Swap (MPI-299) is flow #1 of the real product and becomes the fixture everything
later is built against.

The Flow Library is dev-gated, so this is not user-visible and gates no release.

## Phase 2: The 1.5 authoring shape (MPI-531)

**Item 1 has LANDED** and needed more than the card said: field types alone unblock
nothing, because `fields` render on middle steps only and the run slide's controls came
solely from `props.uiComponent`. So slider / number / text shipped together with
`FlowDef.controls` — declared run-slide controls, `Input_*` ids routed into
`injectionParams`.

Still open:

- `steps[].image` — a per-step intro image alongside title / hint / tickerLabel, rendered
  by `MpiBaseFlow`. The ONLY new `FlowDef` field in the whole design; resist a second.
- Author 1.5's Flows declaratively via steps + fields. No new `uiComponent`.
- Port `MpiFlowHeadSwap` to declarative steps once its controls are expressible. Retiring
  the `uiComponent` field itself belongs to phase 5.

**Acceptance, checkable per Flow:** the `FlowDef` is fully expressible as a third-party
manifest — no JS component, `requiredModels`/`requiredDeps` are catalogue ids only, and
every media node carries an `Input_*` / `Output_*` title.

## Phase 3: The LTX 2.3 v2v trio (MPI-536, MPI-520, MPI-538)

All three ship as **Flows, not model ops** — no `ModelDef`, no `supportedOps`, no dep
entries; they run on the already-wired LTX 2.3 checkpoint (memory
`project_ltx_workflows_land_as_flows`). Route is `/mpi-add-flow`, never `/mpi-add-model`.
Shared injection contract, settled by MPI-537 phase 4: `Input_Video`, `Input_Audio`,
`Input_Positive`, `Input_Negative`, `Input_Seed`, `Output_Video`.

**Extend (MPI-520) and foley (MPI-536) have shipped** — both `validating`, both waiting
only on the user's live generation. Order changed from the original plan on a fact it did
not have: foley and lipsync each need a weight that is not a dep yet
(`ltx-2.3-22b-lora-foley-v2a-1.0`, `ltx-2.3-22b-ic-lora-lipdub-0.9`), so both are gated on
an R2 stage plus a `dependencies.js` entry. Extend needed no new weight, so it went first
and proved a Flow can ship with no JS component.

**Lipsync (MPI-538) is what's left.** Copy
`docs/playbooks/add-flow/existing-flows/ltx-extend.md` rather than re-deriving the shape.
Its injection contract is already correct, so it is mostly descriptor plus media I/O. Two
inherited facts:

1. **The weight prereq is real work and a mirror may not exist.** `ltx23-lora-foley` is the
   first LTX dep with **no `mirrorUrl`** — the only upstream copy
   (`Lightricks/LTX-2.3-22b-LoRA-Foley-V2A`) is GATED, `401` + `X-Error-Code: GatedRepo`
   anonymously. Check whether `Lightricks/LTX-2.3-22b-IC-LoRA-DubIt` is gated the same way
   before planning one.
2. **A Flow's weight goes on the tier that can run it, not on the family.** Foley's LoRA
   sits on `ltx-23-balanced` only, because the graph bakes the int8 transformer.

The foley-vs-voice mode decision is settled: **v1 ships foley only**; voice mode has never
been run. Lipsync inherits no guess.

## Phase 4: Flows v2 (MPI-259)

The deferred v1 paths — the Install button end to end, a flow whose required model is NOT
installed, flows declaring MULTIPLE required models, the reuse matrix. **This is why the
rip comes first:** those paths were written against the three flows phase 1 deletes, so
running them earlier means proving them on fixtures about to leave the repo.

Order inside the card is its own, but install-a-flow comes first — a badge and install
routing for a flow with a missing model is the path with the most unknowns, and multi-model
plus the reuse matrix sit on top of it. Overlay UI design pass and the 2nd flow follow.
New flows discovered along the way get their own cards (see MPI-530, the
character-consistency track).

## Phase 5: The 1.6 package format (MPI-532)

A folder dropped into `user_flows/` — restart and it appears. Manifest JSON + workflow JSON
+ optional images. No Python, no pip, no custom node repos.

The insight that makes it cheap: the op a Flow registers across four files
(`commandRegistry.js`, `universal_workflows.js`, `operationRegistry.js`,
`operation_registry.json`) is PURE DATA — `mediaInputs` is an array of
`{key, mediaType, title, required}`. So a user Flow's op is built from its manifest at load
time and no registry file is ever edited. Ids from `user_flows/` are namespaced `user:<id>`
against collision.

Scope: the loader; the manifest schema; a load-time validator; developer docs; a generated
node lockfile; and MPI republishing one of its own Flows as a package to prove the path.

Three things already settled — do not re-litigate:

- **The validator is developer experience, not security.** A scan of all 14 bundled node
  packs found no URL/HTTP/download classes, so a workflow JSON has no phone-home vector
  today — re-run that scan whenever a pack is adopted. It exists because the injector
  SILENTLY SKIPS an `Input_*` title with no matching node, so a broken flow otherwise fails
  as a mystery.
- **Do not fork or vendor the 14 node packs.** `js/data/modelConstants/nodesDeps.js` already
  pins every pack by repo + tag/commit — GENERATE a lockfile and installer from it. Same
  list feeds the validator allowlist.
- **Vocabulary:** "plugin" already means capability model here. Third-party packages are
  **Flows**. Never "flow plugins".

Deprecation UX depends on MPI-533's tombstone ledger: an installed Flow ALWAYS shows,
disabled, with the reason named. Silence reads as a broken app. The 1.7+ GitHub registry
idea is explicitly NOT this card — advertising only, never a payment rail.

## Verification

- Phase 1: app boots, Flow Library lists Head Swap only, no grep hit survives for the three
  removed ids.
- Phase 2: every 1.5 Flow passes the acceptance check above, port surface still one
  component or zero.
- Phase 3: per member, the `/mpi-add-flow` playbook's own gates (`docs/playbooks/add-flow/`).
  A real generation is the only proof that counts.
- Phase 4: user-visible UX, needs the app.
- Phase 5: an MPI Flow republished as a data-only `user_flows/` package loads, validates and
  runs on a restart with no registry edit.

Spin your own app (`npm run app:isolated`), never the user's `:3000`.

## Parallel Batch

Phases are ordered: 1 before 4 (fixtures), 2 before 3 (the `uiComponent` debt), 2 before 5
(the manifest schema is only knowable once `FlowDef` is final). Within phase 3, MPI-538 is
alone now. Within phase 5, loader / validator / docs split cleanly and could run as a batch.
Derive ownership from each member's `files.json` at dispatch time, not from this list.

## Plan Drift

**2026-08-16 — merged.** MPI-529 and MPI-552 deleted into this card; their phase order,
drift notes and settled decisions are folded in above. No member card was closed or altered
in scope by the merge.
