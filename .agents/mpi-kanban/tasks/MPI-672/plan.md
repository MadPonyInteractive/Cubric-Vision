# MPI-672 — Issue #2: a silent curated-deps failure ships a broken engine, and the log can never reach us

Umbrella created 2026-09-01 from **[issue #2](https://github.com/MadPonyInteractive/Cubric-Vision/issues/2)**
— a clean `CubricVision-windows-x64-v1.4.2.zip` install, Krea2, prompt "a pixel watch",
`Node 'ClownsharKSampler' not found. The custom node may not be installed.`

**The member cards stay on the board.** Nothing is closed or merged to make this. Close a
member when the phase covering it lands.

## Members

| Card | What it is |
|---|---|
| MPI-673 | A failed curated-deps pass is **silent** — `/comfy/start` already returns `depsWarning` and no frontend reads it |
| MPI-674 | `deps-status` is **blind to import failure**, so the boot repair never fires and the state is permanent |
| MPI-675 | A reporter **can never send us a log** — the Report on GitHub button is dead in every release |

## Root cause — reproduced, not inferred

Built the reporter's exact stack in `D:\tmp\cu126-repro`: ComfyUI **v0.31.0** (v1.4.2's pin,
not master's v0.34.0) `nvidia_cu126` — the legacy portable a GTX 1080 selects via
`selectNvidiaBuild` (`routes/platformEngine.js:194`) — Python 3.12.10, torch 2.13.0+cu126,
v1.4.2's 14 node packs and v1.4.2's `python_deps.txt`.

| Run | Result |
|---|---|
| Curated deps installed | 1885 classes, **0 `IMPORT FAILED`**, all 51 Krea2 classes present. No repro. |
| `matplotlib` + `pywavelets` + `opencv-contrib-python-headless` removed | 1290 classes, **5 packs `IMPORT FAILED`** (RES4LYF, comfyui_controlnet_aux, Impact-Pack, Impact-Subpack, VideoHelperSuite), 5 Krea2 classes gone. **Exact repro.** |

Those three packages are exactly RES4LYF's `requirements.txt`, and the stock portable ships
none of them — they arrive only through `ensureCuratedPythonDeps()`.

POSTing v1.4.2's `krea2_t2i_sfw.json` to the broken engine returns, byte for byte, the
dialog in the issue:

```json
HTTP 400
{"error": {"type": "missing_node_type",
  "message": "Node 'ClownsharKSampler' not found. The custom node may not be installed.",
  "extra_info": {"node_id": "72", "class_type": "ClownsharKSampler_Beta",
                 "node_title": "ClownsharKSampler"}}}
```

`ClownsharKSampler_Beta` is the **first non-core node** in the Krea2 graph (index 6 of 122),
which is why it is the class named — it does not mean RES4LYF was the only casualty.
ComfyUI's `execution.py:1153` prints `_meta.title`, so the message names
`ClownsharKSampler` while the missing class is `ClownsharKSampler_Beta`.

### The chain

1. `ensureCuratedPythonDeps()` (`routes/shared.js`) did not complete on the reporter's machine.
2. `routes/comfy.js` catches that, logs, and **starts the engine anyway** — deliberate
   (refusing to boot over an offline pip would be worse), but with no user-visible signal.
   It even returns `depsWarning` to the caller, which nothing reads. → **MPI-673**
3. Five packs fail to import. The graph's first missing class raises the raw ComfyUI error.
4. **It never self-heals.** `checkUniversalWorkflowDepsStatus` checks folder presence +
   commit marker, so a present-but-broken pack reads as healthy and the boot repair at
   `js/shell.js:335` stays quiet. Restarting the app changes nothing. → **MPI-674**
5. And it can never be diagnosed: the only log-attaching path is dead. → **MPI-675**

### Ruled out (do not re-investigate)

Engine variant, Python/torch version, pip absence (26.2.1 ships in the portable), curated-deps
resolvability on 3.12 and 3.13 win_amd64 (`uv pip install --dry-run` clean on both; the real
install exits 0), node-pack download/extract, and the `<repo>-<ref>` archive-folder scan.

### Still open

**Why** the pip pass failed on that machine. A failed pass stamps no marker, so it retries on
every start — theirs is likely deterministic (proxy / AV / offline), not transient. Needs the
reporter's `%APPDATA%\Cubric Vision\logs\app.log`, which MPI-675 is what makes obtainable.
None of the three fixes depend on that answer.

## Current State

**2026-09-01 — investigation session, no code written.** The four cards exist, are committed
and pushed (`819a6f46`), and all sit in `todo`/`planned`. The root cause is reproduced and the
release path is checked; nothing in the app has been changed yet.

Next: **phase 1, MPI-675 first**, then MPI-673.

Two things the next session inherits and did not cause:

- **`.agents/mpi-kanban/events.jsonl` has 4 malformed uncommitted lines** (07:27–07:47 today,
  missing `schema`/`type`/`id`), plus 17 legacy ones under `MPI-666`. `validate_board.py` exits
  1 on them; none belong to this umbrella. They were left alone because they are another live
  session's working copy. They will bounce a close-out — fix or hand back to that session then.
- **A concurrent session's commit `54277eb4` swept this board's `board.json`** before the task
  folders were committed, so origin briefly carried card ids with no cards behind them. Already
  repaired by `819a6f46`; noted because the same race can recur — this tree runs peers.

## Phases

**Phase 1 — make the failure visible and reportable (MPI-675, then MPI-673).**
MPI-675 first: until a reporter can send a log, every future engine bug costs this same
investigation. Both are small and independent.

**Phase 2 — make it detectable and self-healing (MPI-674).**
Import-aware health check plus a repair the user can reach after boot. Largest of the three;
if it cannot land cleanly in the patch, ship phase 1 as 1.4.3 and carry this to the next.

**Phase 3 — release.** See below. Do not start until phases 1–2 are closed or explicitly cut.

## Release path — READ THIS BEFORE BRANCHING

All three defects are present at **v1.4.2 and on master HEAD `75d92e4c`, on the same lines**
(verified 2026-09-01), so this is a patch: **1.4.3**, and it must also land on master.

Facts measured on this tree, 2026-09-01:

- Maintenance branch **`1.4.2` exists LOCALLY ONLY** at `88fcda76` — origin carries
  `1.3.0`, `1.3.1`, `1.4.0`, `1.4.1` and **no `1.4.2`**. Push it before relying on it.
- `1.4.2` is 1 commit ahead of tag `v1.4.2` (`80e4521b`) — that is the baseline restamp
  cherry-pick, i.e. the branch is healthy.
- **master is 634 commits ahead of `1.4.2`.** Master is not the release base for a patch.

Per `project_release_model_github_only` (amended 2026-08-01): a bug against a shipped
version is fixed on that version's maintenance branch and released as the next patch digit.

**Recommended order — author on master, cherry-pick to `1.4.2`, cut 1.4.3 from the branch.**
Master is where the fix must ultimately live and where CI and the tests run. The three touch
points are small and byte-identical at both refs, so the cherry-picks should be clean despite
the 634-commit gap; if one conflicts, port by hand rather than merging master into the branch.

Then follow `/mpi-release` (bump the 3rd digit) — and mind its two documented traps: the
`v<ver>` tag is a BUILD TRIGGER that goes stale across `workflow_dispatch` rebuilds (verify
`git rev-parse 'v1.4.3^{}'` equals the SHA CI built before publishing), and cherry-pick the
`release-baselines/*.json` restamp onto the new branch afterwards.

## Reproduction harness

`D:\tmp\cu126-repro` (~10 GB) holds the built cu126 v0.31.0 engine, v1.4.2's configs under
`v142-config/`, and both boot logs (`comfy-boot.log` = healthy, `comfy-nodeps.log` = 5
`IMPORT FAILED`). Helper scripts that built it are in the originating session's scratchpad
(`install-nodes.mjs`, `check-classes.mjs`, `post-prompt.mjs`). Re-create with: extract the
portable, `pip install -r python_deps.txt --no-deps`, install the locked packs, boot, then
`check-classes.mjs <workflow> http://127.0.0.1:48199`. **Use it to prove MPI-674's detector
actually fires** — it is the only place the broken state exists on demand.

**MPI-674 owns the harness and owns deleting it** (user call, 2026-09-01). It is kept
precisely because MPI-674 needs it, so it is not garbage to be swept by a cleanup pass: leave
it alone until that card closes. MPI-674's own close-out is what checks whether anything else
still needs it and removes it if not.
