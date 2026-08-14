# MPI-560 — Community Flows: the 1.5 authoring shape and the 1.6 package format

Umbrella created by the consolidation sweep, 2026-08-14. Two `todo` cards, one format:
**a Flow written today must be expressible by a third-party manifest tomorrow.** Each card
already names the other — MPI-531 calls 532 its sibling, MPI-532 calls 531 its
prerequisite.

**The member cards stay on the board.** Nothing was closed, merged or deleted to make
this. Close a member when the phase covering it lands, and say so in its card. If the
members turn out to be the better unit, delete this umbrella instead.

## Members

| Card | What it is |
|---|---|
| MPI-531 | Package-ready Flows for 1.5 — author every built-in Flow in a shape a third-party manifest can express. **1.5 RELEASE BLOCKER** |
| MPI-532 | Community flow packages — third-party Flows as data-only folders dropped into `user_flows/`. **Targets 1.6** |

## Current State

Both `idea`. Nothing built. 1.5 ships built-in MPI Flows, NOT packages — the third-party
format is deliberately deferred to 1.6, and that split is a decision, not an oversight.

**MPI-531 item 4 is already blocking other work.** MPI-552 (the LTX 2.3 v2v Flow trio)
names it as the single shared blocker: `FlowStepField` is `select | button | toggle` only,
so authoring any of those three Flows today means writing a new JS `uiComponent` — exactly
the debt this umbrella exists to stop accruing. That makes the field-types half of MPI-531
the highest-priority item on the whole Flow track, ahead of anything in MPI-532.

## Why one card and not two

They are one format decided twice. `uiComponent` names a JS component, so a third party can
never have one — every Flow authored with a new component in 1.5 is a Flow that must be
ported in 1.6. MPI-531 is not preparation for MPI-532, it is MPI-532's format being paid
for a release early, where it is cheap. Planning them apart is how the port surface grows
between the two.

The port surface is currently **ONE component**: after MPI-332 (under MPI-529) rips
image-regen / sdxl-4k / video-stitch and `MpiFlowImageRegen` with them, only
`MpiFlowHeadSwap` survives. Keep it at one.

Sequencing outside this umbrella: MPI-529 (Flow Library v2) rips the test flows first —
phase 1 here assumes that has happened or is happening.

## Phase 1: Field types (MPI-531 item 1) — do this first, it is unblocking

Extend `FlowStepField` (`MpiBaseFlow/stepKinds.js` + the `FlowDef` typedef in
`js/data/flowsRegistry.js`) with slider / number / text. Today `fields` is one row of
`select | button | toggle`, which cannot express ImageRegen-class controls. **This work is
needed for 1.5's Flows regardless of the package format**, and MPI-552 is waiting on it.

Scope it to the field types those Flows actually need. Do not build the whole manifest here.

## Phase 2: The rest of the 1.5 authoring shape (MPI-531 items 2–4)

`steps[].image` — a per-step intro image alongside the existing title / hint / tickerLabel,
rendered by `MpiBaseFlow`. The ONLY new `FlowDef` field in the whole design; resist adding
a second.

Then author 1.5's Flows declaratively via steps + fields, no new `uiComponent`, and port
`MpiFlowHeadSwap` to declarative steps once its controls are expressible. Retiring
`uiComponent` as a field belongs to 1.6, not here.

**Acceptance, checkable per Flow:** the `FlowDef` is fully expressible as a third-party
manifest — no JS component, `requiredModels`/`requiredDeps` are catalogue ids only, and
every media node carries an `Input_*` / `Output_*` title.

## Phase 3: The 1.6 package format (MPI-532)

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

Three things the card settled that must not be re-litigated:

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

Deprecation UX depends on the tombstone ledger (MPI-533, deliberately not a member of this
umbrella — it is model-registry infrastructure, not Flow format): an installed Flow ALWAYS
shows, disabled, with the reason named. Silence reads as a broken app.

The 1.7+ GitHub registry idea is explicitly NOT this card. Advertising only, never a
payment rail.

## Verification

Phase 1: MPI-552's three LTX Flows can declare their controls with no new JS component.
Phase 2: every 1.5 Flow passes the acceptance check above, and the port surface is still
one component or zero. Phase 3: an MPI Flow republished as a data-only `user_flows/` package
loads, validates and runs on a restart with no registry edit.

## Parallel Batch

Phases are strictly ordered — phase 3's manifest schema is only knowable once phase 2's
`FlowDef` is final. Within phase 3, the loader / validator / docs split cleanly and could
run as a batch. Derive ownership from each member's `files.json` at dispatch time, not from
this list.

## Plan Drift

(none yet)
