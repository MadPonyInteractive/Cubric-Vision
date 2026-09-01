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

## Phase 2 — the POST-INSTALL route (folded in, Fabio 2026-09-01)

Found by Fabio testing phase 1: "If I open up scribble, it just opens up the flow. It doesn't
give me the slide over because it's already installed." Filed here rather than as MPI-667 on
his call — same defect, second half.

**The precise fact** (`_pick`, MPI-638): the drawer is skipped when the flow is available
**and** `state.currentPage === PAGE_GALLERY`. So inside a project an installed flow goes
straight to its frame and the licence block never renders. From the **Landing** page it still
opens (disabled Open + toast), so the route is not gone — it is inconsistent, and it is absent
from exactly the surface a user lives in.

What is lost inside a project, by descriptor:

| | klein-9b (scribble, scribble-object, object-stamp) | H3 (MPI-591, Extend Video) |
|---|---|---|
| Fields | `poweredBy` only — no `territory`, no `report` | `poweredBy` + `territory` + `report` |
| Lost | licence text, attribution | those **plus** the misuse-report channel and "Request authorization" |

H3 is why this cannot wait for MPI-591 to ship: §V.5 obliges us to keep a reporting mechanism
*reasonably accessible*, and "go back to Landing" is a weak reading of that. `flow:minimax-music`
(MPI-664) carries `report` too. Land this BEFORE 591, or H3 ships with its report channel
reachable from one page only.

- [ ] The same licence block on `MpiBaseFlow`'s step 0, over the same `_flowLicences` set.
      Step 0 already paints title, hero and description — which is the model drawer's own
      argument for where a licence belongs: *"where a user already comes to read what a model
      is."* Extracting `_flowLicences` / the render out of the `MpiFlowLibrary` closure so both
      surfaces share one implementation is the likely shape; two copies would drift into one
      surface attributing and the other not.
- [ ] Check `MpiBaseFlow` ownership before editing — it is on MPI-664's `files.json`.

## Verified

- `node --test tests/flow-licence-surface.test.cjs` → 4 pass, 0 fail.
- `node --check` on the component → clean. `npx eslint` on it → no output, exit 0.
- No CSS written: `mpi-detail__licence*` is defined in `MpiModelManager.css`, which
  `preloadStyles.js:54` loads app-wide, so the Flow drawer already had the rules.

## Seen in a running app (2026-08-31, isolated instance :55693)

Own profile + EMPTY models root (`%TEMP%\cubric-666\`), so every flow read as uninstalled.
Engine stamp seeded AFTER boot (`.mpi_engine_version` = 0.34.0 + a stub `python.exe`) purely to
clear `engineGate.hasNoEngine`, which blocks `flows:open` outright — seeding post-boot means the
UW dep repair never armed, so nothing downloaded.

- Grid: `0 ready · 13 need models`. **Draw It In**, **Scribble**, **Object Stamp** →
  `LICENCE REQUIRED`. Every other flow → `GET MODELS`.
- Scribble drawer: `LICENCE / FLUX Non-Commercial License v2.1 / Licensed by Black Forest Labs
  Inc. under the FLUX Non-Commercial License / Read the licence`. Footer: `VERIFY LICENCE`.
- No Report or Request-authorization link, correctly — `FLUX2_KLEIN_9B` declares neither.

## CI went red on the first push, and it was this card's test

`876b4361` turned master red; its parent `86281686` was green, so it was mine.
`a flow-only dep key resolves its licence exactly as a model id does` asserted
`flow:minimax-music`, which exists ONLY in MPI-664's **uncommitted** `licences.js`. Green
locally against the dirty tree, absent on CI. Rewritten as a sweep over whatever `flow:` keys
are present (shape + readable licence), asserting no named key and NOT that the flow is
shipped — `minimax-music`'s FlowDef has not landed either, so a shipped-flow check would fail
on Fabio's tree. Proved in BOTH states: dirty tree (1 flow key) and a detached worktree at
HEAD (0 flow keys), 4/4 passing in each.

## Out of scope

- `licences.js`, `MpiAbout.js` — MPI-664 owns both, still in `doing`.
- The stale `klein-9b` comment in `licences.js` the brief noticed. Same reason.
- MPI-358's `credit`/attribution sweep. Different field, different surface.
