# MPI-553 — Upscalers leave the model picker, as plugins

Umbrella created by the project-refresh consolidation sweep, 2026-08-13. Three `todo`
cards with a hard ordering already written into their own descriptions.

**The member cards stay on the board.** Nothing was closed, merged or deleted to make
this. Close a member when the phase covering it lands, and say so in its card. If the
members turn out to be the better unit, delete this umbrella instead.

## Members

| Card | What it is |
|---|---|
| MPI-506 | SeedVR2 as three plugins (3B / 7B / 7B Sharp) feeding the video upscale dropdown — **and the mechanism that lets a plugin contribute a dropdown entry** |
| MPI-507 | Move NVIDIA PiD out of the model picker into the image upscale dropdown, as four plugins |
| MPI-515 | 1.5 BLOCKER — remove the nvidia-pid `ModelDef` once the PiD plugins ship |

## Current State

MPI-506 is `planned` and owns the mechanism. MPI-507 and MPI-515 are both `blocked`, each
on the card above it. Fabio owns the SeedVR2 workflow rewrite; the app side is ours.

## Why one card and not three

One product decision, taken by Fabio on 2026-08-09, generated all three: *a weight that
only upscales and generates nothing has no business in the model picker.* The dropdown
mechanism is built once in MPI-506 and reused unchanged by MPI-507 — building it twice is
the failure this umbrella exists to prevent. MPI-515 is not separate work at all; it is
the second half of MPI-507, deliberately deferred to 1.5 because a removal cannot land
before its replacement exists.

## Phase 1: The mechanism

MPI-506. A plugin contributes a dropdown entry; three SeedVR2 plugins prove it. Design the
contribution point for **both** dropdowns from the start — video here, image in phase 2 —
or phase 2 pays to generalise it.

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

(none yet)
