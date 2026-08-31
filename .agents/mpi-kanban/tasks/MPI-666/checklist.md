# MPI-666 — checklist

Scope is ONE file: `js/components/Compounds/LandingPages/MpiFlowLibrary/MpiFlowLibrary.js`.
No CSS — `mpi-detail__licence*` lives in `MpiModelManager.css`, which `preloadStyles.js`
loads app-wide, so the Flow drawer already has the rules. No descriptor change: every
affordance is already data on the `LicenceDescriptor`.

## The open call, settled

**Does the Flow drawer show every gated licence, or only name that one exists?**
→ **Every one, as the same block, looped.** Reasons, in order:

- It is the SMALLER diff. A "one or more licences apply" note needs new copy, new
  pluralisation and a route to the actual terms; the loop is the model drawer's block with
  an `.forEach` around it and no new vocabulary.
- N = 1 on every flow shipped today (scribble / scribble-object / object-stamp → `klein-9b`;
  minimax-music → `flow:minimax-music`), so the common case renders EXACTLY like the model
  drawer, which is the layout Fabio already signed off.
- A note that names a licence without linking it is the same dead end this card exists to
  close — "Read the licence" is the affordance, not the word "licence".

## Work

- [x] `_flowLicences(flow)` — distinct descriptors over `_installKeys(flow)` (resolved model
      ids + `flowDepKey`). `getModelLicence` already answers for a `flow:` key (MPI-664 put
      `flow:minimax-music` in `MODEL_LICENCES`), so no special-casing. Dedupe by descriptor
      `id`, not by key — H3 ships as two ModelDefs under one agreement.
- [x] `_needsLicenceProof(flow)` — any of those with `verify` and not `hasAcceptedLicence`.
- [x] Tile chip: "Licence required" replaces "Get models" when that is true. Unavailable
      flows only — a Ready flow's weights are on disk, so its gate was already passed.
- [x] Drawer: a `Licence` field, one `mpi-detail__licence` block per descriptor
      (name + `poweredBy` + Read / Request authorization / Report links).
- [x] Footer button reads "Verify licence" when proof is outstanding, matching the Model
      Library's wording for the same promise.
- [ ] **BLOCKED, filed not taken** — refused-gate outcome. The fix is NOT in this file:
      `start()` resolves `undefined` on refusal AND on success (it returns `_installChain`,
      which ends `.then(settle, settle)`), so the two outcomes are literally the same value
      and no call site can tell them apart. One line in `downloadService.js:105`
      (`if (!accepted) return false;`) makes it distinguishable — and that file is on
      **MPI-500's** `files.json`, in `doing`. Filed as message
      `b7e04c19-3f52-4a86-9d13-2c8f610b4e37`; the reasoning is also a comment at
      `_installMissing` so nobody re-derives it. Every other caller awaits and discards, so
      the change is safe whenever 500 takes it.
- [x] `tests/flow-licence-surface.test.cjs` — 4 tests, all passing. Two halves: the data
      contract the closure helpers stand on (the three verify flows resolve exactly one
      gated model; `flowDepKey('minimax-music')` resolves its descriptor; every descriptor
      carries the URLs behind the links the drawer draws), and an anchoring half over the
      component source. Proved it bites: all five anchoring regexes fail against
      `git show HEAD:…/MpiFlowLibrary.js`.

## Verified

- `node --test tests/flow-licence-surface.test.cjs` → 4 pass, 0 fail.
- `node --check` on the component → clean. `npx eslint` on it → no output, exit 0.
- No CSS written: `mpi-detail__licence*` is defined in `MpiModelManager.css`, which
  `preloadStyles.js:54` loads app-wide, so the Flow drawer already had the rules.

## NOT yet verified

The rendered surface has not been seen in a running app — the chip text, the drawer block
and the button wording are asserted in source, not in pixels. Reload the Flow Library and
look at **Scribble**: the tile should read "Licence required", and its drawer should carry a
Licence field naming the FLUX Non-Commercial License v2.1 with a "Read the licence" link.

## Out of scope

- `licences.js`, `MpiAbout.js` — MPI-664 owns both, still in `doing`.
- The stale `klein-9b` comment in `licences.js` the brief noticed. Same reason.
- MPI-358's `credit`/attribution sweep. Different field, different surface.
