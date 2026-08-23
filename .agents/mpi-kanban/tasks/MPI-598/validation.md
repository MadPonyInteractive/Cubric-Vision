# MPI-598 Validation — Klein 9B

## Pod smoke — PASS 7 · SKIP 0 · FAIL 0 (2026-08-22)

The card's last open acceptance line ("a real generation per supported op") is closed.
Run with Fabio present, on his go.

```
node scripts/smoke-workflows.mjs --models klein-9b --volume 88oys2kpie --keep-volume
```

Wrapped in `gpu_lease.py run --` (GPU 0 free at launch). Exit code 0 — any FAIL forces
non-zero, so the exit is itself part of the evidence.

| op | secs | media | was |
|---|---|---|---|
| `t2i` | 8 | 1 | already proven in-app |
| `i2i` | 8 | 2 | **UNPROVEN → PASS** |
| `control` | 21 | 2 | **UNPROVEN → PASS** |
| `kleinEdit` | 17 | 2 | already proven in-app |
| `inpaint` | 17 | 2 | already proven in-app (LanPaint path) |
| `detail` | 4 | 1 | **UNPROVEN → PASS** |
| `upscale` | 9 | 2 | **UNPROVEN → PASS** |

Recorded in `dev_configs/smoke-evidence.json` at `2026-08-22T22:58:19.413Z`:
`engine {want: 0.31.0, got: 0.31.0, proven: true}`, GPU `L4`, volume `88oys2kpie` (80 GB).
Gate 7 fired — the Pod manifest's `comfyui_ref` matched the `node_lock` pin, so the run
proves WHAT it smoked. Transcript `dev_configs/smoke-run.txt` (154 lines), backed up
outside the repo the moment the run went green.

`scope.modelsRun: [klein-9b]`, `covers: [klein-4b]` — so 4B's graph rides along on the
identical class_type set. `unproven: 19` of 21 models, deliberately: this was a scoped run.

## Offline gates, all green before anything was rented

- preflight — all 7 ops resolve a graph, a branch and a budget
- pod lock + `python_deps` in sync with v0.31.0 (after the sync below)
- gate 8 — every `Mpi*` class_type exists at MpiNodes `38b3a27a`
- gate 9 — **45 shipped graphs sweep clean**, every `Mpi*` node supplies its required
  inputs. Gate 9 sweeps EVERY shipped graph including the flows, so the Character Sheet
  flow is covered here too. (45 = every `.json` at the root of `comfy_workflows/`,
  excluding `raw/` and `scripts/`.)

  **READ THIS BEFORE CHECKING THE TRANSCRIPT — it does NOT corroborate the line above,
  and that is expected.** `dev_configs/smoke-run.txt:122` says
  `required inputs: NOT CHECKED — local MpiNodes is at 3e455e88, node_lock pins 38b3a27a`.
  The claim-auditor read exactly that and returned FALSE on this bullet at close-out.

  What actually happened: gate 9 refuses to answer unless the local `ComfyUi-MpiNodes`
  checkout equals the `node_lock` pin, so it was run in its OWN
  `--plan --models klein-9b` invocation with that repo detached at `38b3a27a`, and the
  sibling was then restored to `main` (`3e455e8`) before the paid run. Its stdout:

  ```
  required inputs: 45 shipped graphs sweep clean — every Mpi* node supplies its
  required inputs ✓ (via http://127.0.0.1:8188, MpiNodes 38b3a27a)
  ```

  `_transcribe` opens `smoke-run.txt` with mode `'w'` on the first log line, so the LIVE
  run truncated that plan transcript — and by then `main` was restored, hence `NOT
  CHECKED`. This is the trap this playbook already documents twice; the recovery it
  prescribes is to restore the content from the run's stdout and say the per-line tee
  timestamps are gone while the content is intact, which is what the block above is.

  **The durable artifact is missing, not the check.** To re-earn it cheaply: detach the
  sibling at the pin, run `--plan`, commit that transcript, restore `main`. Not done here
  because it would truncate the GREEN matrix transcript being committed alongside this,
  and that one cannot be regenerated without renting a GPU.

## Two findings the run surfaced

**1. The Pod lock was behind, and it blocked the run.** `checkPodLock()` refused with
`🛑 POD LOCK IS BEHIND — ComfyUI-MpiNodes, LanPaint`. Cause: `cfe81061` (this card) added
LanPaint to `dev_configs/node_lock.json` and moved the MpiNodes pin, while
`mpi-ci/cubric-vision-pod/node_lock.json` was last synced `ce9bcc0` (2026-08-10).

**No image rebuild was needed and none was done.** Both drifted nodes carry
`installRequirements: false`, and the Dockerfile bakes ONLY `installRequirements: true`
entries — all 7 of those are byte-identical on both sides, and `python_deps.txt` was
already in sync. Code-only nodes install onto the /workspace volume at connect from the
APP's pin (MPI-222); `start.sh` states it directly: *"A MpiNodes commit bump in node_lock
therefore triggers a normal volume reinstall … with NO image rebuild."* Fix was to sync
the lock file into the pod repo. The green run then installed LanPaint onto the volume
and `inpaint` passed, which confirms the reasoning end to end.

**2. `checkPodLock()` over-reports.** It compares the two lock files wholesale and flags
any commit difference, without the baked/volume discriminator MPI-222 introduced. So it
will demand a Pod image rebuild for every future code-only node bump that needs none.
Not fixed here — that is the smoke runner's gate, not this card. Reported to Fabio.

## Limits carried forward

- **Pod-green is not Windows-green** — different OS, python, torch, CUDA. The local
  portable half is playbook gate 5 and is not covered by this.
- The run proves the graphs RUN; it does not judge output quality. At 1 step / 128px
  nothing here says a 9B image looks right — Fabio's own in-app t2i/inpaint/kleinEdit
  runs at 896x1088 are the quality evidence.
- 19 of 21 models are in no family this run touched. The previous full 35-op matrix
  (2026-08-10, green on the same engine) is preserved in commit `21d61f69`, not in the
  current evidence file.
