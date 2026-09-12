# PiD is not deprecated — it stays as a model that brings its four upscale plugins

UMBRELLA: MPI-732. Read `tasks/MPI-732/plan.md` for the member list and phase order.
Also a member of the pre-existing upscaler umbrella **MPI-553**, whose plan.md holds
the mechanism → migration → removal ordering this card partly reverses.

## Current State

Project mode: **scalable-foundation**.

**Fabio's decision, 2026-09-12:** PiD is no longer being deprecated. It keeps its
`ModelDef` and its Model Library card. Installing PiD installs and activates **all
four** upscale plugins at once. The four stay individually installable from the
Upscale dropdown, so the per-path saving survives for anyone who only wants one.

This reverses the half of the plan that MPI-515 carries and narrows MPI-507; it does
not touch MPI-506 (the dropdown mechanism), which stays exactly as planned.

### The precedent Fabio named, and it holds

Krea2 + the image describer already work this way. The describer declares its 5.24GB
encoder in `requiredDeps`; Krea2 ships the same weight; installing Krea2 therefore
makes the describer available with no describer-specific install step. That is LAW 1
in `docs/plugins.md` — `requiredDeps` is what the plugin OWNS — and it needs no new
mechanism for PiD. `_pluginRequiredDepIds` already protects such deps
**unconditionally**, which `docs/plugins.md` is emphatic must stay that way (the
`fullyInstalled` gate that looks like the obvious cure is what destroyed 5.24GB of
Krea2's encoder in MPI-310).

### Where the cards stand today

| card | today | after this |
|---|---|---|
| MPI-506 | dropdown mechanism | unchanged |
| MPI-507 | PiD as four plugins, ModelDef leaves the picker | amended: **ModelDef stays**; installing it brings all four; dropdown keeps per-path install |
| MPI-514 | put a deprecation badge on PiD in 1.4 | the badge must come **off** — user-facing, shipped |
| MPI-515 | "2.0 BLOCKER - remove the nvidia-pid ModelDef" | **rejected** — there is nothing to remove |

MPI-515's stated reason was *"two ways to install the same 16GB of weights, which is
the whole reason for the split."* That objection is answered rather than ignored: with
shared `requiredDeps` there is one dep pool and one set of bytes on disk, and the two
surfaces are a convenience path (the Library card, everything) and a cheap path (the
dropdown, one variant). What must not happen is the Library card quietly becoming the
only path again — that would put the 16.48GB all-or-nothing install back, which is the
thing the split exists to kill.

## THE UNSOLVED PROBLEM — settle this before writing any code

Raised by Fabio, and it is the reason this card is `needs-decision` rather than
`planned`:

> if the user decides to uninstall one of the four plugins, PiD becomes uninstalled
> immediately.

He is right, and it is worse than an unimplemented case. A model's install status
derives from its deps being present. Remove one plugin's weights and PiD's dep set is
incomplete, so every op-availability surface reads PiD as not installed
(`deriveInstalledOps` → `installedOpsForContext` → `getAvailableCommands`).

**This is a partial-install state, and MPI-453 deliberately abolished them.**
`docs/generation-lifecycle.md`: *"every model is one install unit now"* and *"the
partial-install state is unreachable."* Four separately-removable plugins under one
ModelDef reintroduces exactly the state that card spent its life removing. That is not
a bug to patch at the crash site — it is a modelling decision, and CLAUDE.md cardinal
rule 4 applies: find the root cause or brief Fabio, never guard-clause it.

### What PiD is made of, because the options only make sense against this

From MPI-507's own measurements. Four upscale paths, each a 2.54GB bf16 transformer
plus its own VAE (0.17–0.34GB), and **one shared mandatory gemma text encoder at
5.23GB** that every path needs. Today it is all-or-nothing: **16.48GB** to use any
single path. As four plugins the SDXL path alone costs ~8.1GB (its transformer + VAE +
the shared encoder) and each additional path ~2.8GB.

Note what MPI-507 already established: `pluginRequiredDepIds()` keeps the shared encoder
alive **while any PiD plugin remains installed**. The encoder's survival is already
solved by the plugin mechanism and does not depend on the ModelDef existing.

### The question, concretely

The user installs PiD from the Library — all four paths land. Later they remove one
path from the Upscale dropdown to reclaim ~2.8GB. **What does the PiD tile in the Model
Library say now?** Today's machinery answers "not installed", because a model is
installed when its deps are all present, and one is now missing.

### Option (a) — PiD counts as installed while ANY path is present

`deriveInstalledOps` learns that this model's deps are not all-or-nothing: one path
present is enough.

- **What Fabio sees:** the tile stays "installed" after removing a path. Removing the
  last one flips it to "not installed".
- **Cost:** every surface that asks "is this installed" currently gets a yes/no that is
  uniform across all models. This adds the first model where the honest answer is
  "partly", which means the tile also has to say *which* paths, and the uninstall size
  estimate has to be computed from what is actually there.
- **The real objection:** MPI-453 removed partial installs deliberately —
  *"every model is one install unit now… the partial-install state is unreachable."*
  This puts it back for one model. That is not automatically wrong, but it has to be
  shown to be containable rather than the first crack.

### Option (b) — the ModelDef stops owning the path weights

The four paths belong to the plugins only. PiD's Library card becomes the button that
installs all four at once — a bundle, not a weight owner.

- **What Fabio sees:** the tile does not flip to "not installed" when a path is
  removed, because the model never owned that path. The dropdown simply stops offering
  that variant. Removing all four leaves the tile offering to install them again.
- **Cost:** "install PiD" stops meaning "this model is on disk" and starts meaning
  "give me all four paths". Whether the ModelDef mechanism even supports a model that
  owns no weights of its own is **the open technical question Phase 1 must answer** —
  if it does not, (b) needs a small mechanism change.
- **Why it may be the honest shape:** PiD generates nothing. Fabio's own words on
  MPI-507: *"it's a model that just upscales and doesn't generate anything."* A thing
  that is really four interchangeable upscalers behind one install button is described
  better by (b) than by (a).

### Recommendation

**(b)**, if Phase 1 finds the ModelDef mechanism can carry a weightless model without a
significant change. It needs no special case in the install predicate, leaves MPI-453's
"one install unit" rule intact for every model including this one, and the thing it
gives up — "installed" meaning the weights are present — is a meaning PiD never really
had, since the weights that matter are per-path. If Phase 1 finds (b) needs real
surgery to the ModelDef contract, (a) becomes the cheaper answer and the question turns
into how tightly the special case can be fenced.

There may be a third shape Phase 1 turns up. One it must NOT propose: dropping the
ModelDef entirely so PiD is only four dropdown plugins. Fabio ruled on that —
PiD keeps its Library card.

## HARD RULE, inherited from MPI-515 and non-negotiable

**Do NOT delete the `pid-*` / `vae-*` / `pid-gemma` entries from the dependency
files** under any resolution. `_orphanedDepIds` in `routes/downloadManager.js` walks
`DEPS` and can only reclaim a weight that still has an entry — delete it and the file
strands on existing users' disks forever, untracked, with nothing in the app able to
remove it. MPI-470 and MPI-466 both kept theirs.

## Completed

- [ ] Nothing yet.

## Remaining Work

## Phase 1: Settle the install-status model (research — no code)

- [ ] Trace how model install status is actually derived today — `deriveInstalledOps`
      in `resolveModelDeps.js`, `installedOpsForContext` and `firstInstalledOp` in
      `modelRegistry`, and `pluginAvailability()`'s `{installed, missing, missingModels}`
      — and write up, for each of (a) and (b), exactly which predicates change, which
      surfaces read them, and what a half-removed PiD then looks like in the Model
      Library, the op strip, the Upscale dropdown and `commandExecutor`'s hard net.
      Include the uninstall/GC side: what `_pluginRequiredDepIds` protects in each
      shape, and whether either shape can reproduce the MPI-310 circularity.
      **Verify:** written to `tasks/MPI-734/research/install-status.md`, and it names
      the file and function behind every claim. A resolution that cannot say what the
      Library tile shows after one plugin is removed is not finished.
- [ ] **Decision gate — put (a) vs (b) to Fabio with the tradeoffs from the writeup.**
      Do not proceed past this point on an agent's own judgement; it changes what
      "installed" means for a shipped model.
      **Verify:** Fabio's answer recorded in this plan under Plan Drift, with the date.

## Phase 2: Amend the board (no code)

- [ ] Rewrite MPI-507's description to the decided shape: ModelDef stays, installing it
      brings all four plugins, the dropdown keeps per-path install, and the chosen
      resolution from Phase 1 with its rationale. Note the dep-deletion ban on the card
      itself so it survives a handoff.
      **Verify:** `MPI-507/task.json` re-read and its description matches; the card
      still validates (`validate_board.py`).
- [ ] Close MPI-515 as `rejected` with a `validation.md` recording the decision, the
      date, and why the "two install paths" objection is answered rather than dropped.
      **Verify:** `validate_board.py` clean; MPI-515 in `done` with
      `maturity: rejected`.
- [ ] Update MPI-553's plan.md so its member list and ordering reflect that the removal
      phase is gone.
      **Verify:** re-read; the ordering it states matches the surviving cards.

## Phase 3: Remove the deprecation badge

- [ ] PiD carries a deprecation badge shipped in 1.4 (MPI-514). Remove it, along with
      any copy that tells the user PiD is going away.
      **Verify:** the Model Library tile in the running app shows no deprecation badge
      on PiD, and a grep for the deprecation copy returns nothing live.

## Phase 4: Implementation

- [ ] Implement the Phase 1 resolution. Scope cannot be written honestly until that
      decision exists — this phase is deliberately left to be filled in by the session
      that passes the decision gate, and `mpi-continue` should expand it then.
      **Verify:** to be defined with the phase. At minimum: install PiD from a clean
      state → all four paths appear in the Upscale dropdown; uninstall one → PiD's
      Library tile and every op surface report the state the decision says they should,
      with nothing reading as a broken install.

## Plan Drift

- None yet.

## Verification

**Verify mode:** user-ux

Phase 3 and Phase 4 both change what Fabio sees in the Model Library and the Upscale
dropdown, and the whole point of the card is which state a half-removed PiD presents.
That has to be looked at, not asserted.

## Preservation Notes

- `docs/plugins.md` will need the outcome — specifically whichever of LAW 1 or the
  availability section the resolution touches. It is a coherent single-subject doc;
  extend it, do not fork it.
- `docs/generation-lifecycle.md` § "An UNINSTALLED operation is undispatchable" states
  that the partial-install state is unreachable. **If the resolution makes it reachable
  again, that paragraph becomes false and must be corrected in the same pass** — a doc
  that contradicts the code is worse than no doc.
- MPI-533 (deprecation tombstone ledger) may be affected: PiD was going to be a
  tombstone and now is not. Check before closing this card.
