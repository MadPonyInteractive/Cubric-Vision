# [shared] Workflow authoring entry — raw→API sync + validation gate

> How a proven ComfyUI graph enters the repo. Same procedure for models and apps.

**Author & prove the graph in the LOCAL ComfyUI FIRST** — the fast iteration bench.
Only once it produces good output there do you export it and start app wiring. The
in-app engine run is the SECOND gate, not the first.

**Getting the graph into the repo — the raw→API sync (MPI-272 tooling).** Do NOT
hand-convert or hand-edit the API JSON.

- Export the LiteGraph graph, drop it in `comfy_workflows/raw/` (a `_template.json`
  suffix routes it to a generator source; a bare `<Name>.json` becomes a direct
  runtime file — the app case).
- Run `node scripts/sync-raw-workflows.mjs` (converts git-changed raw) or `--all`
  (reconverts every raw source). **Requires a running ComfyUI** (`COMFY_URL` overrides
  `http://127.0.0.1:8188`).
- It commits the raw source, converts to API via the live `/object_info`, **gates on
  `validate-injection-rules.mjs`** (STOPS + names the node on a title/capture/seed/
  integrity violation — fix in the ComfyUI graph and re-export, never hand-patch the
  API), runs `orchestrate.py`, and leaves the generated output **staged** for `/mpi-end`.
- `raw/` is USER-OWNED — tooling reads it, never writes it.

**Playbook overrides (divergences live inline in each playbook):**
- **Model** — the converter-staleness trap (`--all` after any converter change) and
  `_template` vs bare-name routing: [../add-model/01-workflow-split.md](../add-model/01-workflow-split.md) § 0a.
- **App** — filenames route through a case-insensitive middleware
  (`routes/workflowStatic.js`), so the all-lowercase law does NOT apply to app
  workflows: [../add-app/01-descriptor-and-ops.md](../add-app/01-descriptor-and-ops.md).
