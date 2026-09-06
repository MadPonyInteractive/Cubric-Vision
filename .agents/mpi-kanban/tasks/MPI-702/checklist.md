# MPI-702 Checklist

## Record the mechanics

- [x] `docs/models/h3/vdn.md` written — licence posture, the pruned/curve adaln mechanism,
      the three `lora_mode` configs, the S-to-stage mapping, the OOM ceiling, the retention
      knobs, and the Windows VRAM-diagnosis recipe.
- [x] Pointer added from `docs/models/h3/README.md`.
- [x] Two corrections to the record captured in the doc, both with their evidence:
      bypass damage is specifically the **e-grid** adaln re-injection, not bypass itself;
      and "merge on pruned gives crushed darks" is contradicted by the 14:26-onward runs
      (adapter report drops 255 → 204 = the 51 adaln deltas, and those runs were judged
      good).
- [ ] Relabel the timing runs by deliverable rather than base pass, once Fabio confirms
      which timestamps map to which numbers. Deliberately NOT written into the doc yet —
      base-pass names make a 1920×1088 job look like a "1K" one.

## Open experiment — the retention lever

- [ ] Re-run the windowed refine at 1920×1088 (S=2040) with `branch_weights=stream` and
      `retain_buffers=off`. The OOM missed by 557 MiB while VDN held 2.15 GB of retained
      buffers plus branch weights on the same 16 GB card, so this may move the ceiling
      rather than confirm it.
- [ ] If the ceiling moves, the tier threshold moves with it — derive it from available
      VRAM at dispatch, never a baked-in resolution constant.

## Re-run the comparison — the 2026-09-06 set is confounded

- [x] Found it: `ApplyVDNH3Advanced` applies its own turbo adapter by default
      (`apply_turbo_adapter=True`, `turbo_strength=1.0`, 204 weights), and every H3 graph
      here already carries the turbo LoRA at `strength_model: 1`. The VDN arm therefore ran
      **double turbo** against a single-turbo control. Documented in `vdn.md` § TRAP.
- [ ] Re-run VDN vs turbo with `apply_turbo_adapter=False`, external turbo LoRA kept —
      one turbo per arm, VDN branch the only variable.
- [ ] Re-run the high-step tier question with no turbo on either side: pure VDN vs plain, at
      25 steps / `res_multistep` / `simple`. That is the config where VDN plausibly earns
      its place, and the one the confounded runs never actually tested.

## Gate

- [ ] Ship/no-ship on VDN. Nothing from 2026-09-06 decides it. If the clean re-runs show no
      benefit, this card closes as `rejected` and `vdn.md` stays as the record of why.
