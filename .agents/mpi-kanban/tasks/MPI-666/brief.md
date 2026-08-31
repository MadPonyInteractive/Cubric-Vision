# MPI-666 — Flows are blind to licence gates

Found 2026-08-31 while closing MPI-664's licence work. Not speculative: **three shipped flows
already hit it**, and MPI-591 is about to make it worse.

## What is wrong

`MpiFlowLibrary.js` has **zero** licence awareness — no `getModelLicence` import, no licence row
in its detail drawer, no chip on the tile. The Model Library has all three:

| Affordance | `MpiModelManager` | `MpiFlowLibrary` |
|---|---|---|
| "Licence required" chip instead of "Install" (`_needsLicenceProof`, ~:739) | ✅ | ❌ |
| Licence name + `poweredBy` in the detail drawer (~:944) | ✅ | ❌ |
| Read the licence / Request authorization / Report misuse links (~:963) | ✅ | ❌ |

The gate itself is NOT bypassed — `downloadService.start()` is the chokepoint and it fires for a
flow key exactly as for a model id. This is not a hole in consent. It is an **ambush plus a dead
end**.

## The dead end, precisely

`start()` on a refused gate returns `undefined`: no job is created, no `download:started` is
emitted. `MpiFlowLibrary._installMissing()` ignores the return value, and `_installProgress()`
counts jobs. So the tile silently returns to "Install" with no toast, no state, no explanation.
Click again, same dialog. Fabio's read was right — the user "can't even do anything", and nothing
tells them why.

## Who hits it today

`klein-9b` is the app's ONLY `verify` licence: it needs an HF token **and** an access grant the
user must obtain on Black Forest Labs' own model page. Three shipped flows require it:

- `scribble`
- `scribble-object`
- `object-stamp`

From the Model Library those tiles say **"Licence required"** — the whole point of that chip, per
its own comment: *"Install … promises a download and delivers a legal wall plus a trip to Hugging
Face."* From the Flow Library they say "Install".

## Why MPI-591 makes it sharper

MPI-591 (`doing`) puts **MiniMax H3** behind Extend Video. H3 is the app's only
**territory-restricted** licence — the EU, UK, Korea and the USA are excluded, so Fabio's own
machine is inside the bar. The "Request authorization" link that unblocks it lives in the gate
dialog and in the Model Library drawer. A Flow-only user has neither.

## Shape of the fix (not decided)

The affordances are already built and descriptor-driven; the Flow surface just does not consume
them. Likely the whole job is:

1. A licence row in the Flow detail drawer — the same block, over the union of a flow's gated
   `requiredModels` plus its own `flowDepKey` entry. A flow can carry MORE than one licence, which
   the model drawer never has to handle.
2. The "Licence required" chip on the flow tile when any of those needs proof.
3. Give a refused gate an outcome. `start()` returning `undefined` is currently indistinguishable
   from success at the call site.

**Open:** does the Flow drawer show the licence of every gated model it pulls, or only name that
one exists? Two licences in one drawer may want a different layout than the model drawer's one row.

## Related, not duplicates

- **MPI-357** (done) built the gate + `verify`. This card consumes it from a second surface.
- **MPI-358** (todo) is the `credit`/attribution sweep — a different field and a different surface
  (`MpiAbout`). MPI-664 settled that attribution for a Flow's weights lands on the About page,
  precisely because a Flow user may never open the Model Library. **Same reasoning, and it is what
  led here:** if attribution cannot rely on the Model Library, neither can consent.

## Noticed while looking

`licences.js` carries a stale comment on the `klein-9b` key: *"No ModelDef yet — MPI-357 ships the
GATE, not the model."* MPI-598 landed the ModelDef; `klein-9b` is in `MODELS` now. Pre-existing,
one comment, not touched.
