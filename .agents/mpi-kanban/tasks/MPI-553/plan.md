# MPI-553 — Upscalers leave the model picker, as plugins

Umbrella created by the project-refresh consolidation sweep, 2026-08-13. Three `todo`
cards with a hard ordering already written into their own descriptions.

**The member cards stay on the board.** Nothing was closed, merged or deleted to make
this. Close a member when the phase covering it lands, and say so in its card. If the
members turn out to be the better unit, delete this umbrella instead.

## Members

| Card | What it is |
|---|---|
| ~~MPI-506~~ | ~~SeedVR2 as three plugins~~ — **CLOSED WITHOUT DELIVERING THE MECHANISM.** SeedVR2 was dropped 2026-08-16 and the three plugins that were to prove the mechanism went with it |
| **MPI-580** | **Phase 1 — the mechanism, on a card of its own.** A plugin contributes an entry to the *existing* upscale dropdown, contributes its own controls, and can be required by a Flow / share deps with a model |
| **MPI-579** | **Phase 1b — the first consumer and the proof.** LTX Video upscaler as a plugin. Blocked on MPI-580 |
| MPI-507 | Move NVIDIA PiD out of the model picker into the image upscale dropdown, as four plugins |
| MPI-515 | 1.5 BLOCKER — remove the nvidia-pid `ModelDef` once the PiD plugins ship |
| MPI-557 | *Second consumer, not a member.* Video face detailer adopts the LTX upscaler, so the plugin is a Flow requirement |

## Current State

**2026-08-19: PHASE 1 WAS A HOLE. It is now MPI-580, with MPI-579 as its consumer.**
MPI-506 is `done`/`complete`, but it closed when SeedVR2 was dropped, and the mechanism it
owned was never built. Verified in the code, not inferred:
`js/data/pluginsRegistry.js` holds exactly one plugin (`image-describer`) and its
`PluginDef` is `{id, title, description, requiredDeps, operation}` — no slot, no dropdown
field, no contribution point; `js/components/Organisms/MpiToolOptionsUpscale/` builds its
list from `None` plus loaded assets and knows nothing about plugins. **So MPI-507 has been
`blocked` on a card that closed without unblocking it.**

The umbrella's own rule still holds and is now doing real work: design the contribution
point for **both** kinds in MPI-580, or MPI-507 pays to generalise it — which is exactly
the "build it twice" failure this umbrella exists to prevent, and it nearly happened
silently.

## Why one card and not three

One product decision, taken by Fabio on 2026-08-09, generated all three: *a weight that
only upscales and generates nothing has no business in the model picker.* The dropdown
mechanism is built once in MPI-580 and reused unchanged by MPI-507 — building it twice is
the failure this umbrella exists to prevent. MPI-515 is not separate work at all; it is
the second half of MPI-507, deliberately deferred to 1.5 because a removal cannot land
before its replacement exists.

## Phase 1: The mechanism — MPI-580

**On its own card, deliberately.** The mechanism used to ride on MPI-506 alongside the
SeedVR2 product; the product was dropped and the mechanism died with it. Nothing about a
model choice can invalidate MPI-580, so nothing about a model choice can kill it.

**The dropdown already exists.** `MpiToolOptionsUpscale` in the History workspace, shared
by the image and video tools through its `kind` prop, listing `None` plus loaded assets.
Phase 1 does not build a dropdown — it builds the point at which a plugin contributes an
**entry** to it, for **both** kinds at once, or phase 2 pays to generalise it.

Three extensions, not one. A plugin must be able to contribute an **entry**; a selected
entry must contribute its own **controls** (LTX: a prompt box and two sliders, both
displaying 0–1 with the mapping hidden — PiD needs the same, its op already declares
`pidVariant` / `pidResolution` / `denoise`); and a plugin must be **requirable by a Flow**
and able to **share deps with a `ModelDef`**. The last one is already half-true in the
data — `ltx23-spatial-upscaler` sits in both LTX tiers' `dependencies` — so the work is
making the entity say what the data already does, and settling the GC question that
follows.

## Phase 1b: The first consumer — MPI-579

The **LTX Video upscaler** plugin, off MPI-568's finished bench. It proves phase 1 by
consuming it, and it is the thing the user actually sees. Blocked on MPI-580.

## Phase 2: PiD migrates

MPI-507. Four PiD plugins into the History image Upscale dropdown, reusing phase 1's
mechanism unchanged. PiD already carries the deprecation badge from 1.4 (MPI-514), so the
user-facing story is consistent the moment this lands.

## Phase 3: The removal

MPI-515, on 1.5. The `ModelDef` leaves `js/data/models.js` and the Model Library.

**HARD RULE, carried from the card:** do **NOT** delete the `pid-*` / `vae-*` /
`pid-gemma` entries from the dep files. `_orphanedDepIds` in
`routes/downloadManager.js` walks `DEPS` and can only reclaim a weight whose entry still
exists — delete the entry and the weight is stranded on every existing user's disk
forever. MPI-470 and MPI-466 both kept theirs. The procedure is
`docs/playbooks/add-model/README.md` § "Removing or re-tiering a model".

## Verification

Phase 1 and 2 are user-visible UI, so they need a real app — spin your own
(`npm run app:isolated`), never the user's `:3000`. Install a plugin, confirm it appears
in the right dropdown, and confirm an uninstalled one does not. Phase 3 additionally needs
the orphan sweep proven: install PiD on the old build, upgrade, confirm the weight is
reclaimable rather than stranded.

## Parallel Batch

None. Each phase consumes the previous phase's code by construction, and all three reach
the same install/registry surface.

## Plan Drift

- **2026-08-19 — phase 1 was a hole.** MPI-506 closed `complete` when SeedVR2 was
  dropped (2026-08-16), taking with it the three plugins that were to prove the
  dropdown mechanism. The mechanism was never built, so MPI-507 sat `blocked` on a
  closed card. Replaced by MPI-579 (LTX Video upscaler), which inherits the
  mechanism and widens it: a plugin must now contribute CONTROLS (prompt box + two
  sliders), not just a dropdown label.
- **2026-08-19 — the mechanism moved to its own card, MPI-580.** Fabio raised the
  split and the MPI-506 history settles it: a mechanism attached to a product dies
  when the product is dropped. MPI-579 keeps the LTX upscaler and becomes phase 1b,
  blocked on MPI-580. Also corrected: the upscale dropdown ALREADY EXISTS in the
  History workspace — no phase here builds one, they add entries to it. And MPI-557
  joins as a second consumer: the Video face detailer adopts the LTX upscaler, so a
  Flow requiring a plugin became a phase-1 requirement rather than a later idea.
