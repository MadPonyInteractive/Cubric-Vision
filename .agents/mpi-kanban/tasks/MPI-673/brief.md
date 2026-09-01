# MPI-673 — A failed curated-deps pass is silent

Member of **MPI-672**. Read `tasks/MPI-672/plan.md` first — it carries the reproduction and
the release path.

## The defect

`routes/comfy.js` `/comfy/start` runs `ensureCuratedPythonDeps()` (the one pip pass that
installs `dev_configs/python_deps.txt`). On failure it logs and **starts the engine anyway**:

```js
let depsWarning = null;
try { await ensureCuratedPythonDeps(); }
catch (err) {
    depsWarning = `curated python deps FAILED: ${err.message}`;
    logger.error('comfy', `${depsWarning} — starting anyway, custom nodes may fail to import`);
}
...
res.json({ success: true, ...(depsWarning ? { depsWarning } : {}) });
```

**Starting anyway is correct and should stay** — refusing to boot over a transient offline
pip would be a worse regression, and the comment in the file says so.

What is wrong is that the signal is dropped on the floor. `grep -rn "depsWarning" js/`
returns **nothing**: the backend puts it on the wire and no frontend reads it. Identical at
v1.4.2 and master HEAD `75d92e4c`. So the engine reports `success: true`, the UI shows a
normal ready engine, and the user learns about it only as a raw ComfyUI class error at the
end of a generation attempt — which reads as a broken app, not a broken dependency install.

## What "done" looks like

- The `depsWarning` returned by `/comfy/start` reaches the user. Not a toast that scrolls
  away — the engine came up degraded and every generation will fail.
- A generation attempted against a warned engine does not die with a raw
  `Node '<title>' not found`; it says the dependency install failed and points at the repair.
- Wire the retry to the existing repair rather than inventing one — a failed pass stamps no
  marker (`curatedDepsMarkerPath()`), so the next `/comfy/start` retries it for free. Consider
  whether "retry" is simply stop+start.
- Do NOT make a failed pass abort the start. Read the MPI-459 comment above
  `ensureCuratedPythonDeps` before touching that path.

## Verify

`D:\tmp\cu126-repro` reproduces the broken engine on demand (see the umbrella). To force the
failure path itself, point pip at an unreachable index or delete `dev_configs/python_deps.txt`
from an isolated app copy — the latter throws
`curated python deps missing at ... — the build is incomplete`.

**Never take the user's app — `npm run app:isolated`, own profile AND port.**

## Files (expected — confirm before claiming)

- `routes/comfy.js` — the `depsWarning` return (already present, do not remove)
- `js/services/comfyController.js` — the `/comfy/start` caller
- whichever surface renders the engine state to the user
