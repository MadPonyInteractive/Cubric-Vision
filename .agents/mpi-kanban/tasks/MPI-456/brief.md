# MPI-456 Brief

## Why the twins exist (the root cause, already proved)

Two independent forcing paths, both found and fixed under MPI-449 on 2026-08-06:

1. **`ExecutionBlocker` travels DOWNSTREAM ONLY.** A gate placed *after* a sampler has
   already paid for that sampler. Blocking never stopped upstream work.
2. **An `OUTPUT_NODE` is ALWAYS executed.** ComfyUI seeds the run from every output node
   and walks back, so an output node drags its whole upstream chain along regardless of
   any gate.

Lazy inputs are the only mechanism that prevents upstream execution. Both fixes are
shipped and pinned (`dev_configs/node_lock.json` -> `fd9bdca`, committed `5e9661e6`):

- `MpiBlocker` input made lazy — commit `42b1540`, live-proved
- `MpiSaveLatent.enabled` lazy gate — commit `fd9bdca`, live-proved against a
  cache-busted seed (see `MPI-449/research.md` § 7)

Full write-up: `docs/workflow-authoring/mpi-nodes.md` § "Blocking a branch does NOT stop
the work feeding it".

## What is actually different in each twin (MEASURED 2026-08-06, not assumed)

### LTX — six files, pure duplication

| pair | nodes |
|---|---|
| `ltx_i2v.json` / `ltx_i2v_stage2.json` | 119 vs 119 |
| `ltx_i2v_fp8` / `_stage2` | 119 vs 119 |
| `ltx_i2v_mxfp8` / `_stage2` | 119 vs 119 |
| `ltx_t2v` / `_stage2` | 119 vs 119 |
| `ltx_t2v_fp8` / `_stage2` | 119 vs 119 |
| `ltx_t2v_mxfp8` / `_stage2` | 119 vs 119 |

A full node-by-node diff of `ltx_i2v` vs `ltx_i2v_stage2` returns **exactly one
differing node**:

```
node 71  MpiBoolean  Input_Is_Continue
  base  : {"boolean": false}
  stage2: {"boolean": true}
```

That is it. Six files exist to bake one boolean. The app already injects by node title,
so **injecting `Input_Is_Continue` deletes all six** — no lazy-gate work needed for LTX
at all. This half is nearly free.

### WAN — two files, a deleted node

| pair | nodes |
|---|---|
| `wan22_i2v.json` / `wan22_i2v_stage2.json` | 68 vs 67 |
| `wan22_t2v.json` / `wan22_t2v_stage2.json` | 55 vs 54 |

The missing node in each is **`Stage1_Bypass` (`SamplerCustom`)** — physically deleted
because no gate could stop it from running. This is the half that actually needed the
lazy fix, and now has it.

## Why the app currently needs the twins

Stage 2 is resolved by a **`_stage2` filename swap**, not by injection —
`commandIsMultiStage()` in `js/services/commandExecutor.js`, with related handling in
`routes/comfy.js`. Removing the files without removing/narrowing that swap leaves a dead
path that will silently fail to find a workflow. Treat the swap as part of this card, not
as follow-up.

## Order of work (LTX first — it is the cheap half)

1. **LTX**: inject `Input_Is_Continue`, delete the six `_stage2` files, remove the swap
   for LTX ops. No graph edits needed.
2. **WAN**: restore `Stage1_Bypass` into the base graph behind a lazy gate, delete the two
   `_stage2` files.
3. **Remove or narrow** the `_stage2` filename-swap path once nothing depends on it.

## Traps

- **Test THROUGH THE APP, not the browser.** The browser prunes muted/bypassed nodes from
  the submitted prompt; the app submits every node and can only inject params. Same graph,
  different reachable set — this is exactly how the original WAN bug was missed.
  [[tool_verify_through_the_app]]
- **Sweep every consumer of the shared primitive.** `MpiBlocker` is also used by
  `klein_t2i.json` and `qwen_edit.json` (3 nodes). Their upstreams are pure and cheap
  (`MpiLoadImageFromPath`, `MpiIfElse`, `MpiAnySwitch`) so the lazy pin should be a no-op
  for them, but that is reasoned, not tested. Cover them.
- **Workflow JSON is the user's to edit** for repo files: deliver a `raw/` node list and
  run `node scripts/sync-raw-workflows.mjs`. Do not hand-edit the runtime twins.
  [[feedback_user_edits_raw_workflows_agent_syncs]]
- **Dual-engine**: fix the LOCAL and REMOTE paths together, never one.

## Payoff beyond the cleanup

Eight fewer files to keep in sync, and it directly shrinks [[MPI-455]]'s six-file LTX
sweep — do this first if both are live. `MpiSaveLatent` / `MpiLoadLatent` also handle
packed AV latents, which may simplify LTX's dual-latent (`Input_Video_Latent` +
`Input_Audio_Latent`) staging; worth checking, not in scope by default.
