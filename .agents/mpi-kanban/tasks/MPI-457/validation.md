# MPI-457 Validation

## Verified — ran, output seen

**Unit** — `node tests/engine-in-place-upgrade.test.cjs` passes, and it is a real
contract, not a smoke check. It pins the changed-line set against ComfyUI's own
`requirements.txt` at both tags (the four lines that moved on `0.29.2 → 0.30.0`), that an
unchanged unpinned `torch` line is **not** a change, that a *disappearing* line produces no
pip work, that comments / blanks / `-r` / `--flag` lines are not specs, and that every
engine-owned package routes to the full reinstall — including the underscore spelling
(`nvidia_cudnn_cu13`), because pip treats `_` and `-` as the same distribution. Near-misses
(`torchsde`, `torchdiffeq`) must NOT trip it, and do not.

**Full suite** — `npm test`: **482 pass, 0 fail**.

**Lint** — `npx eslint routes/engine.js scripts/engine-floor-check.mjs tests/engine-in-place-upgrade.test.cjs`: clean.

**Floor check, against a LIVE engine** — `node scripts/engine-floor-check.mjs` on the
running 0.30.0 app engine (`48188`):

```
engine http://127.0.0.1:48188 · 1877 class_types registered
workflows 33 · class_types used 171 · missing 0
```

All three branches proven, each by its own run:

| case | result |
|---|---|
| real state today | **exit 0**, 171/171 register |
| a probe workflow carrying a bogus `class_type` (written, run, removed) | **exit 1**, names the class_type and the workflow using it |
| engine unreachable (`--url http://127.0.0.1:59999`) | **exit 1**, says start the engine at the NEW pin first |

The failure branch first came back as **exit 127**, not 1 — undici's keep-alive teardown
aborts the process on Windows (`UV_HANDLE_CLOSING` assertion), which would have turned a
release gate's verdict into noise. Rewritten on stdlib `http.get` with `connection: close`,
the same reason `workflow-to-api.mjs` and `resolve-comfy-node.mjs` avoid `fetch`.

## NOT verified — say so plainly

**Acceptance #5 (a real end-to-end upgrade on a real machine) has NOT run.** The user's
engine was mid-generation (LTX in `queue_running`) for the whole session, and the in-place
path calls `stopComfyUI()` before touching git or pip. Scheduled with the user: run it when
the engine is free.

The pass, when it runs:

1. `git -C <engine>/ComfyUI_windows_portable/ComfyUI checkout v0.29.2` and write `0.29.2`
   into `<engine>/.mpi_engine_version` — a real user on the previous version.
2. `POST /engine/upgrade` on `:3000`.
3. Assert from `logs/app.log` (category `engine`) that it took the **in-place** path — no
   `_runEngineDownload`, no 7z, no node re-extract.
4. Assert `.mpi_engine_version` reads `0.30.0` and `comfyui_version.py` agrees.
5. Assert `custom_nodes/ComfyUI-MpiNodes` is **still a symlink** to
   `c:/AI/Mpi/ComfyUi-MpiNodes` — the wipe replaces it with a plain clone, silently.
6. Boot the engine and run `node scripts/engine-floor-check.mjs` — expect 0 missing.

It ends where it started, and the pip step is a near no-op (the packages are already at the
0.30.0 pins), so it exercises the sequence without changing the machine's end state.

**Also unexercised:** the deprecated-node signal (`_findDeprecatedNode`) and the
engine-owned-package signal have no live case on this machine — nothing is deprecated and
`0.30.0` moves no torch line. Both are unit-covered for the decision, not for the wipe that
follows.

## Acceptance, item by item

| # | state |
|---|---|
| 1 in-place by default (`fetch --tags` + checkout pinned sha + pip only changed core packages + restamp) | **done** — `_upgradeEngineInPlace()` |
| 2 the wipe survives and is reached BY A DECISION | **done** — `_fullReinstallReason()` + the automatic fallback on any in-place throw; `mode: 'full'` / `'in-place'` force either side |
| 3 deprecation DETECTED, not guessed | **done** — a folder carrying our `.mpi_node_commit` marker whose name left the registry. The marker is what keeps a user's hand-dropped node from wiping the engine |
| 4 the in-place path never destroys a symlinked custom node | **code-correct, unproven live** — it never removes a node folder; step 5 above is the proof |
| 5 a real user upgraded end to end on a real machine | **NOT RUN** — see above |
| 6 a skill encodes the sequence proved on 0.29.2 → 0.30.0 | **done** — `/mpi-bump-engine` extended (no second skill, per MPI-468) + `docs/playbooks/bump-engine/02-local-upgrade.md` |
| 7 the floor check is EMPIRICAL | **done** — `scripts/engine-floor-check.mjs`, run against a live engine, all three branches proven |
| 8 the skill checks the target has a portable release asset | **done** — already gate 1 / STEP 0 of the skill (`gh api .../releases/tags/v<ver>`), restated in `02-local-upgrade.md` step 1 with the v0.30.1/v0.30.2 evidence |
