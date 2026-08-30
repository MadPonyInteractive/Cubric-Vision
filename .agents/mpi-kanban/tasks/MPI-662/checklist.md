# MPI-662 - checklist

- [x] Scrub the author's test scene out of both raw templates (canvas, duration, prompt, seed)
- [x] Sync raw -> API template -> runtime for both H3 workflows (against 48188, the app engine)
- [x] Assert the runtime diff is ONLY the LoRA filename + ModelAttentionBackend
- [x] Upload the v1.0 LoRA to R2, verify byte size (440,873,704 on R2, HTTP 200, length matches)
- [x] Swap the dep in loraDeps.js (filename, size, bytes, sha256, url, mirrorUrl)
- [x] Update docs/models/h3/turbo.md
- [x] Release note in docs/releases/UNRELEASED.md
- [x] Non-turbo strength stays 0.2. The 8x I derived from baked_scale was WRONG: measured
      ||B@A||_F over 208 module pairs gives median 4.75x with a 0.74-19.9x spread, so no
      conversion factor exists and 0.025 was never the equal-effect value. 0.2 is MPI-550s
      bench-tuned number and stands. OPEN, not blocking: the 25-step path has not been
      re-judged on this weight - one non-turbo run closes it.
- [ ] DECISION (user): whether to delete the v0.1 weight from R2 (breaks older releases)

## Verified

- `ModelAttentionBackend` IS in the pinned engine: `/object_info` on 48188 (core v0.34.0)
  returns it with `attention: ["pytorch attention", "comfy kitchen attention"]`. MPI-605's
  "BLOCKED, absent from v0.31.0" no longer holds - the 0.34.0 pin unblocked it.
- Attention node is on the TURBO branch in both graphs: `UNETLoader -> ModelAttentionBackend
  -> MiniMaxH3SigmaShift -> MpiIfElse.true`, gate boolean = `Input_is_Turbo`. Non-turbo keeps
  `UNETLoader -> EasyCache -> MpiIfElse.false`, untouched.
- Runtime API diff is exactly 3 changes per file: the new node, the SigmaShift model rewire,
  the LoRA filename. No scene pollution reached the runtimes.
- Baked `lora_name` in both runtimes resolves to the dep filename (backslash form, heals).
- `node --test` on dep-path-agreement, resolve-model-deps, lora-path-separator-heal,
  lora-injection-routing: 13 pass, 0 fail.

## Known consequence, NOT fixed here

The v0.1 file is stranded on the disk of every existing H3 user. `_orphanedDepIds`
(`routes/downloadManager.js:301`) iterates `Object.keys(DEPS)` and resolves each id's CURRENT
`filename`, so a weight swap under a retained dep id leaves the old file named by nothing and
therefore swept by nothing. Same shape as MPI-508's swap. 1.82GB per user. Worth its own card;
deliberately not bolted on here, because a second notion of "orphan" is how MPI-310 destroyed
5.24GB of user weights.

## Second leg - ref2va takes its own turbo LoRA (2026-08-30, after a full test session)

- [x] Adopt `minimax_h3_ref2v_lightx2v_turbo_4step_v0.1_resized_avg_rank_20_bf16` on ref2va
      at strength 1.0 (r2va `MpiMath` #453 -> `1.0 if a else 0.2`). fl2va untouched.
- [x] New dep id `minimax-h3-ref2va-turbo-lora` - the two cards no longer share one LoRA
- [x] models.js: ref2va dependency swapped, three stale "shared / both DiTs" comments fixed
- [x] Footprint comment corrected from "SAME 53.15GB" - computed from DEPS, the sets are
      48.03GB (fl2va) and 47.91GB (ref2va), 28.09GB shared, 67.85GB with both installed
- [x] R2 upload verified: 306,731,560 bytes, HTTP 200, Content-Length matches
- [x] Synced; runtime diff is exactly the two intended changes
- [x] Tests: 14 pass, 0 fail (incl. shared-dep-uninstall-direction, which the un-sharing touches)

### Findings worth keeping

- **Clip length reversed the verdict.** Every ~1s A/B said the ref2v weight was worse. At
  real duration it won on both cinematic look and audio adherence. H3's trained window is
  124-362 frames (~5.2-15.1s); ~1s is ~22 frames. Judge nothing on H3 below the window.
- **Magnitude predicted the opposite of the result, three times.** Measured ||B@A||_F puts
  this weight at 0.12x the fl2v v1.0 at equal strength; it was called starved, and it won.
  Do not reason about LoRA strength from `baked_scale` or from norms.
- The fl2v v1.0 adoption earlier the same day was judged on shorter clips than this one.
  Not re-judged. If a release is being cut, that is the run to repeat first.
