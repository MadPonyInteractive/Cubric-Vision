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

- [x] The same licence block on `MpiBaseFlow`'s step 0, over the same licence set. Landed as
      the extraction, not a copy: `flowInstallKeys` / `flowLicences` / `buildLicenceRows` now
      live in **`js/utils/flowLicences.js`**, which both surfaces import. `MpiFlowLibrary`
      lost ~45 lines and renders byte-identically; `MpiBaseFlow` gained an import and a block
      under the explainer. Precedent for a util that mounts Primitives:
      `js/utils/declaredFields.js`, extracted from this same component by MPI-580.
      - `flowInstallKeys` moved WITH the licence helpers on purpose — the queue key IS the
        licence key, and that identity is the module's whole subject. `MpiFlowLibrary` still
        uses it for install / cancel / progress, now as an import.
      - The block is **unconditional** here, unlike the Library's chip: acceptance is a
        pre-install question and by step 0 the weights are on disk. What matters post-install
        is that the agreement, the attribution and the report channel stay reachable.
      - **No `LICENCE` heading on step 0** (Fabio, 2026-09-01), unlike either drawer. A drawer
        is a spec sheet and a field heading belongs there; step 0 is prose the user reads once
        to learn what the flow does, so the attribution reads as its last line instead of a
        form field bolted underneath. The obligation is to DISPLAY the attribution where the
        model is presented (H3 §III.3.a), not to head it, and `Read the licence` still provides
        the copy §III.1 asks for.
      - ONE CSS rule, `.mpi-base-flow__licence { margin-top: var(--s-5) }` — step 0's right
        column is a plain block whose children space themselves by their own bottom margins,
        and an appended field has none. Everything else is inherited `mpi-detail__licence*`.
- [x] **The chip's test was too narrow for H3** — folded in on Fabio's call, 2026-09-01, from
      his question "is the same thing going to happen with MiniMax on Extend Video?"
      `_needsLicenceProof` keyed on `verify`, which is a HUGGING FACE access grant. **H3 has
      no `verify`** — MiniMax do not gate the weights, only the RIGHT to use them. So the
      Extend Video tile would have read `Get models` and delivered a Feishu form: the same
      ambush the chip exists to stop, arriving through the door the first test did not watch.
      Acknowledgement #1 is *"I am outside the excluded territories, or I hold my own
      authorization"*, and the EU / UK / KR / USA are excluded — that is most of our users,
      Fabio included, and it is an errand off-app exactly like klein-9b's.
      - `_needsLicenceProof` → **`_licenceErrands(flow)`**, returning the outstanding
        descriptors rather than a boolean, on `verify || territory`. The footer needs to know
        WHICH kind is outstanding, and a second pass over all of them would name one the user
        has already run (klein-9b filed, H3 not).
      - Footer wording follows the promise: `Verify licence` (a probe we actually run) /
        **`Review licence`** (a territory bar has nothing to verify — the dialog is where the
        terms and MiniMax's authorization route live) / `Install models`.
      - The ungated majority is unaffected, and a test asserts it: neither field → no chip.
      - Asserted against `minimax-h3`, which is COMMITTED at HEAD (`licences.js:243`), not
        MPI-664's uncommitted tree. Checked with `git show HEAD:` before writing it.
- [x] Ownership: `MpiBaseFlow.js` (+ `.css`) TAKEN from MPI-664, not negotiated — no live
      claim exists (every `state/sessions` record is `closed`; the only `claimed` write is
      MPI-591 on `ComfyUi-MpiNodes/h3.py`) and both files were CLEAN in the working tree, so
      there was nothing of 664's to clobber. Recorded as message
      `1347861f-c088-4c68-95f5-892b9f15448e`, claim `e73b575d-b1b7-4020-ad65-4aa0c40de5fb`.
      Release on this card's close-out.

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
