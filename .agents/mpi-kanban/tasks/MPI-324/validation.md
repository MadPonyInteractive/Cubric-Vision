# MPI-324 — RunPod validation sweep (1.2.0 release gate)

ONE warm Pod, one persistent volume, four validations. Detailed per-card checks live in
each card's own `validation.md` — this file is the **session order + cross-card gotchas +
results table**. Do not duplicate the sub-card checklists here; open them as you go.

Golden rule for every card here: **local-engine pass proves NOTHING about the remote path**
(memory `feedback_runpod_not_local_engine_proof`). Everything below has passed locally; none
has run on a Pod.

## Pre-flight (before connecting)

- [ ] Branch `1.2.0`, tree clean. `dev_configs/node_lock.json` MpiNodes pin = `aaa1d2d…` (done
      this session — was `ba9e156`). This is the box-node fix for Head Swap (MPI-309).
- [ ] R2 has every 1.2.0 weight (all four cards report their deps uploaded + SHA-verified).

## Phase 0 — connect + kick the heavy downloads (do first, let them stream)

1. Connect a Pod.
2. **MPI-309 gate — verify the Pod picked up the new MpiNodes commit.** The wrapper reinstalls a
   volume node when the locked commit changes (cubric-vision-pod/start.sh). Confirm the Pod's
   MpiNodes is at `aaa1d2d`, not `ba9e156`. Fast proof: open the Head Swap app and enqueue — if
   ComfyUI no longer rejects `app_head_swap.json` with unknown-node-type (`MpiBox` etc.), the
   commit landed. If it still rejects, the wrapper did NOT reinstall — stop and diagnose before
   anything else (this is the whole point of the lock bump).
3. **Trigger the two heaviest fetches now** so they stream while you test the light cards:
   - MPI-300 Qwen-Edit transformer (~19GB + TE + LoRAs) — NOT prebaked.
   - MPI-310 Image Describer weight (5.24GB) — NOT baked, on-demand by design.

## Order of validation (lightest-dependency first, 5GB-refetch risk last)

### Phase A — Head Swap (MPI-299 / MPI-306) — the MPI-309 proof
Its box nodes are the only new thing; LoRA is a smaller fetch than Qwen.
- Load loads (Phase 0 step 2 already half-proved it), then **run a real remote head swap**:
  target head box + reference head box → generate → correct swap comes back.
- Confirm the tier radio routes on the Pod (Quality ≠ Hyper step count — the local tier bug was
  `331c3ca5`; verify it holds remotely).
- See MPI-306 validation.md § Phase 2/3. NOTE the local Phase 3 hold-until-Apply gap is a
  SEPARATE local test — not part of this Pod run.

### Phase B — Krea2 masked edit (MPI-282)
Krea2 raw is prebaked in the image; only the accelerator LoRA + 2 edit node packs install on the
volume on-demand. Full checklist: MPI-282 validation.md § PENDING. The remote-specific risks:
- [ ] `comfyui-inpaint-cropandstitch` + `comfyui-krea2edit` auto-install on the volume.
- [ ] `krea2-lora-accelerator` (NEW dep from the MPI-316 collapse) resolves — a missing LoRA is
      the classic silent-degrade. Its `lora_name` bakes with a backslash subfolder path but the
      Pod is Linux; existing subfoldered LoRAs ship this way and work — confirm, don't assume.
- [ ] Turbo-ON renders at **tier 2 (8+3 steps)**, not the baked quality chain — tier is INJECTED,
      failure is SILENT. Watch the ComfyUI console step count.
- [ ] Masked identity edit: crop/stitch, no color seam. Empty mask → whole-image edit.
- [ ] Optional: clear the stale unreferenced `krea2_t2i_balanced_*` / `_high_*` / `krea2_turbo_*`
      runtime files if they linger on the volume from an earlier sync.

### Phase C — Qwen-Edit 2511 (MPI-300)
Transformer should be down from Phase 0 by now. Full checklist: MPI-300 task.json § REMAINING.
- [ ] Tier radio 1/2/3 each routes BOTH model path and step count off one `Input_Tier`.
- [ ] 2-image combine (its strength — character/face/garment into another image).
- [ ] **3-chip path (`Input_Image_3`) end-to-end — UNTESTED anywhere.** This is the one genuinely
      unproven surface, not just remote-unproven. Attach a 3rd image, confirm it injects + gates.
- [ ] Style rack renders remotely (7 gates / 7 triggers / 8 labels). Refs BY NUMBER in prompt.

### Phase D — Image Describer plugin (MPI-310) — LAST, uninstall is destructive-adjacent
Full checklist: MPI-310 validation.md. Weight fetched on-demand in Phase 0.
- [ ] Plugins row renders in Model Library; describe from a gallery card AND a history item →
      caption lands in prompt box positive; negative-mode flip works.
- [ ] **Inverse GC check FIRST** (cheap): uninstall an unrelated model → describer row STILL reads
      Installed (the whole reason the plugin entity + exclusive-dep guard exists).
- [ ] **Uninstall the describer LAST of the whole session** — it frees 5.24GB and re-install is a
      5GB refetch. Confirm 5.24GB actually freed and row flips to Install.

## Results

| Card | Remote result | Moves to | Notes |
|---|---|---|---|
| MPI-309 (node_lock) | ⬜ Pod loaded aaa1d2d? | done on pass | box nodes resolve |
| Head Swap MPI-299/306 | ⬜ | see cards | local Phase 3 still separate |
| MPI-282 Krea2 edit | ⬜ | done on pass | accel LoRA + tier-2 the risks |
| MPI-300 Qwen-Edit | ⬜ | done on pass | 3-chip is the untested surface |
| MPI-310 Describer | ⬜ | done on pass | uninstall LAST |

Fill each row live. A card moves to `done` ONLY on its own remote pass; a partial or a silent
degrade keeps it in `doing`. If the session runs long, `/mpi-handoff` and resume from this table.

## Out of scope
- **MPI-198** — Linux/mac LOCAL engine path, deferred by the user. Not a RunPod concern.
- **Head Swap Phase 3 (hold-until-Apply)** — a LOCAL generation test, no Pod needed.
