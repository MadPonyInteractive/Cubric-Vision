# MPI-509 - brief

Surfaced by MPI-450's throwaway-Pod session on 2026-08-09. Full reasoning is on the card;
this file holds the reproduction and the decision the fix has to make.

## Reproduce in one call

```bash
curl -s -X POST -H "Content-Type: application/json" \
  -d '{"modelId":"ltx-23","dependencies":["ltx23-text-projection"]}' \
  http://127.0.0.1:3000/comfy/models/download/start
```

Dep IDs as STRINGS instead of dep OBJECTS. Answer:

```json
{"success":true,"job":{"id":"ltx-23","status":"downloading","totalBytes":0,"deps":[]}}
```

`deps: []` and the job settles to `complete` at 0/0. Nothing was installed and nothing said so.
The second shape is a real dep object for a dep that belongs to a DIFFERENT tier of the same
family (`ltx23-transformer-int8` against `ltx-23`), which the remote universe legitimately
excludes - same silent outcome.

## The decision

`_filterDepsForEngine` is right to drop those deps; MPI-163/179 added it deliberately and
MPI-276 G13 gave the uninstall route the same guard. What is wrong is treating "the filter
emptied a non-empty request" as a no-op success. That is a caller error and should read as one.

Options, in the order they should be considered:

1. **422 with the dropped ids and the engine** - most useful, and it cannot regress a working
   client because a correct request never empties.
2. **Warn + error the job** - cheaper, still diagnosable, but the caller still gets a 200.
3. Log only - rejected: it is what happens today in effect, and two Pod legs were lost anyway.

## Blast radius to sweep in one pass

- `routes/downloadManager.js` remote branch (`_startRemoteDownload`) **and** the local branch -
  both filter, both have the hole.
- `POST /comfy/models/uninstall` - same filter (MPI-276 G13), so it can report success having
  deleted nothing.
- `scripts/smoke-workflows.mjs` - a first-class caller that is not the renderer.
