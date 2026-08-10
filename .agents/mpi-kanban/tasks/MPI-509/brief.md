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

## Third sighting, 2026-08-10 (MPI-483's Pod session)

Cost another Pod leg. A driver script sent `dependencies: ["wan-22-i2v-high"]` - bare id
STRINGS rather than dep objects. `_filterDepsForEngine` filters on `d.id`, which is
`undefined` for a string, so the set emptied and the response was:

```
{"id":"wan-22","modelId":"wan-22","status":"complete","totalBytes":0,"downloadedBytes":0,"deps":[]}
```

2.5 minutes of a live Pod were spent watching a volume that was never going to change. This
is the same defect from a third input shape (id-string, wrong-tier dep object, wrong-engine
dep object), which is the argument for option 1: **422 naming the dropped ids and the
engine**. A shape error and an engine mismatch both land here, and only the response can
tell the caller which.

Note for whoever fixes it: the 422 must distinguish "you sent N deps, all N were dropped"
from "you sent 0 deps", because a 0-dep POST is how a caller asks for nothing and that is
not an error.
