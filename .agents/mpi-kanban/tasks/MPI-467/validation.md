# MPI-467 Validation

## Verified — ran, output seen

**Playbook** — `docs/playbooks/bump-engine/` (README 133 lines + `01-smoke-run.md` 117),
both under the 200-line budget, routed from `docs/README.md` and `docs/playbooks/README.md`.
`docs/versioning.md` § COMFY_VERSION healed: it claimed no playbook existed and pointed at
MPI-457's brief.

**Runner self-check** — `node scripts/smoke-workflows.mjs --self-check` PASSES, with
negative controls that fail on sabotage:

```
self-check OK (Input_Width=128, Input_Steps=1, Input_Frames=5)
```

Asserts: 1024→128 snaps to a legal multiple; steps→1; a 4n+1 frame count (121) stays 4n+1
(→5) instead of becoming an illegal value; the minimizer does NOT touch a branch selector
(`Input_wf_type`) and never rewrites a link tuple; `injectByTitle` returns **false** on an
unmatched title (silent-skip is the documented add-model trap).

**Plan pass** — `--plan` resolves the live registry with zero spend:

```
models 11 · ops 34 · weights 279.5 GB · volume 320 GB
budget: 1 step · 128px target · 1 frame(s) · seed 42
```

Dedupe by `class_type` set collapses SDXL 5→1, Chroma 2→1, Boogu 2→1, LTX 2→1, Krea2 2→1.
Names the 8 weights it does not load. Ops (34) > files (12) because `klein-4b` alone drives
7 branches through one graph.

**Release gate** — `scripts/release-health-check.mjs` `checkSmokeEvidence()`, wired into
`npm run release:check`. **Fires on master's real state today**, not a synthetic case:

```
Engine pin moved 0.29.2 -> 0.30.0 since v1.3.0. No dev_configs/smoke-evidence.json
```

All four branches proven by probe files (each written, run, then removed):

| evidence | result |
|---|---|
| version matches pin, 0 fails, fresh | **passes** |
| produced against 0.29.2, 2 fails | fails, both reasons reported |
| right version, timestamp older than the pin change | fails as STALE |
| absent | fails |

The stale branch matters most: a green file from a *previous* bump carrying the right
version would otherwise pass every other check.

## NOT verified — say so plainly

- **Live GPU survey did not run.** The app was not up on `:3000` (`HTTP=000`), so
  `/runpod/gpu-availability` was never probed. The GPU-ordering code path
  (L4 → RTX 3090 → RTX 4090) is therefore **unexercised**.
- **The whole live half is unproven**: volume create, CPU-Pod install, the version assert,
  and every `runOp` dispatch. Structured against the real routes, never executed.
- Phase 5 (the proving run) is scheduled with the user — ~281 GB fill plus a GPU hour.

## Suite state — GREEN (478/478)

Mid-session this read 476/478. Both failures were a peer session's uncommitted work, not
this card's — this card touched no `js/` or `routes/` file at all — and both are now
resolved by their `8cde2e9c` (MPI-470, Wan t2v deprecation):

1. `uninstall-guards.test.cjs` — needed an op-grouped model with ≥2 ops. `wan-22` was the
   only one and lost `t2v_ms`. Fixed properly by them: the test now takes the real card and
   re-adds the lost op group as an explicit synthetic fixture, with a comment saying why
   (the guard is what must not regress, and the next multi-op model must find it working).
2. `lane-settle-on-bail.test.cjs` — their `commandExecutor.js` diff had removed the
   `_prepareWorkflowInputs` try/catch and with it a `_failBail(err)` call. Resolved; the
   file carries 11 `_failBail` references again.

Recorded because it shaped this card's numbers: the Wan deprecation is now **committed**,
so the 279.5 GB / 34-op figure above is measured against committed code, not a dirty tree.
