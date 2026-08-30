# MPI-662 - checklist

- [x] Scrub the author's test scene out of both raw templates (canvas, duration, prompt, seed)
- [x] Sync raw -> API template -> runtime for both H3 workflows (against 48188, the app engine)
- [x] Assert the runtime diff is ONLY the LoRA filename + ModelAttentionBackend
- [x] Upload the v1.0 LoRA to R2, verify byte size (440,873,704 on R2, HTTP 200, length matches)
- [x] Swap the dep in loraDeps.js (filename, size, bytes, sha256, url, mirrorUrl)
- [x] Update docs/models/h3/turbo.md
- [x] Release note in docs/releases/UNRELEASED.md
- [ ] DECISION (user): non-turbo strength - 0.2 is 8x its old effective value on this weight
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
