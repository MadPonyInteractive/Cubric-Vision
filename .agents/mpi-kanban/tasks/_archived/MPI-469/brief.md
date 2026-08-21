# MPI-469 — remote uninstall reports files it never deleted

## Read first

- `docs/download-manager.md` § **Uninstall pipeline** and § **The orphan sweep**.
- `.claude/rules/comfy_engine.md` § Engine Split — this is another instance of it.
- `routes/downloadManager.js`, `POST /comfy/models/uninstall`: the REMOTE delete loop
  (the `if (remoteModels.isRemoteActive())` branch) versus the LOCAL loop below it.
- `routes/remoteModels.js` → `remoteUninstallDep`, which already returns the answer.

## The bug

The remote delete loop pushes a dep into `removed[]` unless the wrapper answered
`unsupported`:

```js
const out = await remoteModels.remoteUninstallDep(dep);
if (out && out.status === 'unsupported') anyUnsupported = true;
else removed.push({ depId: dep.id, depName: dep.name || dep.id });
```

`remoteUninstallDep` documents and returns **`'deleted' | 'not_found' | 'unsupported'`**.
`not_found` — the file was never on the volume — falls into the `else` and is reported as
removed. The information needed to tell the two apart is already in hand and thrown away.

**This is the LOCAL branch's MPI-276 bug, never mirrored.** That fix reads, in the local
loop, right above the delete:

> `// MPI-276: only report a dep in removed[] when a delete ACTUALLY ran. The custom-node
> zip-path bug meant the old loop hit a non-existent path, deleted nothing, yet still
> pushed to removed[] and logged a lie. A missing path now lands in
> keptModelFiles(reason:'already-absent').`

The local branch gates on `fs.pathExists`; the remote branch has the wrapper's `not_found`
and ignores it. Same lie, same shape, one engine.

## Measured

MPI-464's Pod run, 2026-08-07 (`tasks/MPI-464/validation.md` step 4). Uninstalling
`nvidia-pid` from a volume that held exactly ONE of its deps:

```
removed: pid-flux1,pid-sdxl,pid-sd3,pid-qwenimage,vae-flux-ae,vae-sdxl,vae-sd3,pid-gemma
[download] remote uninstall nvidia-pid: removed 8, …
```

Eight reported, **one** (`vae-sd3`) actually on the volume and actually deleted. The
model read 3/11 installed before the run, so seven of those eight files did not exist.

## Blast radius

`removed[]` is not log-only — it rides the response AND the `download:uninstalled`
broadcast, and the renderer consumes it in
`MpiModelManager.js` (the `Events.on('download:uninstalled', …)` handler, ~:1475). Check
what it drives there (counts, toast copy, freed-space messaging) before deciding the fix
shape; the log line is the least of it.

## Shape of the fix

Mirror the local branch, do not invent a second rule: report `removed[]` only on
`status === 'deleted'`, and route `not_found` to `keptModelFiles` with
`reason: 'already-absent'` — the exact bucket and reason string the local branch uses, so
the two engines stay readable as twins. `unsupported` keeps its current meaning.

Watch the `anyUnsupported && removed.length === 0` early-return: once `not_found` stops
inflating `removed`, an uninstall of a model with nothing on the volume against an OLD
Pod image could newly satisfy that condition. Decide deliberately whether that is right
(it probably is — nothing was deleted and the image genuinely cannot) rather than
discovering it as a regression.

## Testing

`tests/orphan-sweep-remote.test.cjs` shows the pattern for exercising the remote path with
the wrapper stubbed on the required `remoteModels` module — no Pod, no network. A
route-level test needs the same stub plus `isRemoteActive`. A CPU download-mode Pod is
enough for a live check if one is wanted ([[tool_cpu_pod_verifies_wrapper_paths]] /
`MPI-464` validation) — this path touches no GPU.

## Concurrency note

`board.json`, `.agents/mpi-kanban/events.jsonl` and this tree are edited by peer sessions
live. Re-`git status` immediately before committing and commit only your own paths. Card
events go to `tasks/MPI-469/events.jsonl` **and** `.agents/mpi-kanban/events.jsonl` — NOT
`board.json`'s embedded `events` array (`.claude/rules/kanban.md` rule 6).
