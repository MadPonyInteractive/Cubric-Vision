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

## Acceptance #5 — RAN, on the real machine, 2026-08-07

Engine put back to `v0.29.2` + stamp (`/engine/version-check` → `needsUpgrade: true`), then
`POST /engine/upgrade`. Driven through a throwaway harness on `:3999` mounting the router,
because the app's Express server on `:3000` had been started before the fix and does not
hot-reload — POSTing there would have run the *old* wipe.

**Result: in place, 0.29.2 → 0.30.0, ~3 seconds, no download.**

```
[engine] Upgrading engine in place to 0.30.0
[git checkout] HEAD is now at b1693ecb ComfyUI v0.30.0
[engine] In-place upgrade pip set: comfyui-workflow-templates==0.11.27 comfy-kitchen==0.2.26 comfy-aimdo==0.4.11
[engine] In-place upgrade landed 0.30.0; version stamp written
```

| check | result |
|---|---|
| `.mpi_engine_version` | `0.30.0` |
| `comfyui_version.py` | `0.30.0` |
| `HEAD` | `b1693ecba9f5…` — **exactly** `node_lock` `comfyui.core.commit` |
| **MpiNodes symlink (#4)** | `Junction -> C:\AI\Mpi\ComfyUi-MpiNodes` — **survived** |
| `update/` + `.bat` launchers | intact — nothing wiped |
| downloads | none |
| floor check | `1877 class_types · 171/171 · 0 missing` → exit 0 |

### Three defects it found that no unit test could reach

1. **`_findDeprecatedNode` false positive — it wiped an 11 GB engine.** A leftover
   `ComfyUI-MpiNodes.stale-aaa1d2d9.disabled` carried a real `.mpi_node_commit` marker and
   matched no registry id. ComfyUI **skips** `.disabled` folders, so it was never imported.
   Fixed: ask whether ComfyUI would load the folder before treating it as evidence.
2. **The wipe never stopped ComfyUI.** Pre-existing. A running engine holds its working
   directory, so `rmdir` returns EBUSY — but node's recursive delete walks children
   *concurrently*, so `update/` and every `.bat` were already gone when it aborted. Result
   was a half-deleted engine. Fixed: `stopComfyUI()` first, then `fs.rm` with retries.
3. **[MPI-471] The curated-deps marker outlived its site-packages.** Shipped bug, not from
   this card: the marker at `ENGINE_ROOT` survived a wipe that removed the portable
   containing `site-packages`, so `/comfy/start` skipped the install and five node packs
   IMPORT FAILED — 17 `class_type`s gone, silently. Found because the floor check ran on a
   freshly reinstalled engine and reported 17 missing.

Defect 2 destroyed `update/` and the `.bat`s on this machine; the fallback reinstall it
triggered restored them, and the MpiNodes symlink (which that wipe replaced with a plain
clone, exactly as documented) was restored by hand as a junction before the final pass.

**A note on what "in-place" was NOT proven against:** the pip step was a no-op here
(`Requirement already satisfied` ×3) because the packages were already at the 0.30.0 pins.
A bump that genuinely *moves* a pin has not been exercised. Also unexercised live: the
engine-owned-package signal (`0.30.0` moves no torch line) — unit-covered only.

**One incidental finding, worth knowing before the next bump:** the freshly extracted
portable's ComfyUI is a **shallow** clone carrying a single tag. `git fetch --tags origin`
was enough to reach the pinned sha here, but a shallow repo that cannot reach it would fail
the checkout — which routes to the wipe, i.e. it degrades safely.

## Acceptance, item by item

| # | state |
|---|---|
| 1 in-place by default (`fetch --tags` + checkout pinned sha + pip only changed core packages + restamp) | **done** — `_upgradeEngineInPlace()` |
| 2 the wipe survives and is reached BY A DECISION | **done** — `_fullReinstallReason()` + the automatic fallback on any in-place throw; `mode: 'full'` / `'in-place'` force either side |
| 3 deprecation DETECTED, not guessed | **done** — a folder carrying our `.mpi_node_commit` marker whose name left the registry. The marker is what keeps a user's hand-dropped node from wiping the engine |
| 4 the in-place path never destroys a symlinked custom node | **done, proven live** — junction survived the upgrade intact |
| 5 a real user upgraded end to end on a real machine | **done** — 0.29.2 → 0.30.0 in place, floor check 171/171 |
| 6 a skill encodes the sequence proved on 0.29.2 → 0.30.0 | **done** — `/mpi-bump-engine` extended (no second skill, per MPI-468) + `docs/playbooks/bump-engine/02-local-upgrade.md` |
| 7 the floor check is EMPIRICAL | **done** — `scripts/engine-floor-check.mjs`, run against a live engine, all three branches proven |
| 8 the skill checks the target has a portable release asset | **done** — already gate 1 / STEP 0 of the skill (`gh api .../releases/tags/v<ver>`), restated in `02-local-upgrade.md` step 1 with the v0.30.1/v0.30.2 evidence |
