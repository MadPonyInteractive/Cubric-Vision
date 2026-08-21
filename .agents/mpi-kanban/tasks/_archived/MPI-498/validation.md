# MPI-498 - validation

## What was claimed

Six `MpiScaledDimensions` nodes in two shipped graphs omit the required `upscale_method`
input, so ComfyUI rejects them, drops every output downstream, and the op still returns
media - reading as a clean success.

## Evidence (all offline, no Pod - the live GPU matrix held it for the whole session)

1. **The input is genuinely absent, and was absent in what SHIPPED.**
   `git show HEAD:comfy_workflows/nvidia_pid.json` - nodes 1609/1618/1619/1623 carry
   `{size, side, image}` only. Same for `flow_sdxl_4k.json` 1603/1615. `raw/` twins carry
   `widgets_values: [size, side]` - two entries for three widgets.

2. **A default does not rescue a missing key.** ComfyUI `execution.py:901-913` tests
   `if x not in inputs` and appends `required_input_missing` BEFORE any default is read.
   `upscale_method`'s default IS `lanczos`, in `INPUT_TYPES` and in the Python signature;
   neither is reached because the node never executes.

3. **Why a dropped node still returned an image - the part the card could not reconcile.**
   `MpiLoadImageFromPath` subclasses `PreviewImage` and sets `OUTPUT_NODE = True`
   (`ComfyUi-MpiNodes/img.py:380`), so the INPUT LOADER is itself an output node with no
   upstream dependencies. Reachability computed from the shipped graphs:

   ```
   nvidia_pid.json    1580 PreviewImage          <- 1609/1618/1619/1623  INVALID, dropped
                      1626 MpiLoadImageFromPath  <- nothing              VALID -> good output
   flow_sdxl_4k.json  1608 / 1624 / 1626 PreviewImage <- 1603/1615       INVALID, all dropped
                      1678 / 1680 MpiLoadImageFromPath                   VALID -> good outputs
   ```

   One good output is all `validate_prompt` needs, so ComfyUI answered 200 + prompt_id +
   node_errors and executed ONLY the loader branch. The "image PiD returned on both
   matrices" was the loader echoing the INPUT image back as its in-graph preview. Four
   seconds, nothing sampled.

4. **The fix, and a falsifiable check.** `upscale_method: lanczos` added to all six API
   nodes and their raw twins. An AST sweep reading every `Mpi*` class's required
   `INPUT_TYPES` keys and diffing them against every `Mpi*` node in every
   `comfy_workflows/*.json`:

   ```
   against HEAD           6 nodes flagged  (exactly the six)
   against working tree   0
   ```

   Mutation-checked - the sweep was run against `git show HEAD:` copies in a scratch dir
   and did flag them, so the clean result is not a silent no-op.

## Severity, corrected

The card opened with "impact unconfirmed" and hypothesised a wrong-resolution fallback.
Both were wrong: the op produced NOTHING. A v1.3.0/v1.3.1 user running PiD got their
source image echoed back with no error - the MPI-495 `node_errors` guard is not in that
tag (`2e045187` is not an ancestor of `v1.3.1`).

## Not done here, and who holds it

- **GPU re-run of `nvidia-pid/pid`** - MPI-467's, accepted in message
  `29d60d5f-6c0a-4f78-b8ca-59348f957356`: the next full matrix covers `nvidia-pid` and the
  evidence file needs a clean full run anyway. PASS at a real generation time rather than
  4s is itself the proof this fix landed.
- **Gate 8 (the root fix)** - MPI-467's, first item on their handoff, with the trap that
  ~120 `Mpi*` nodes build `INPUT_TYPES` programmatically so it must EXECUTE them, never
  parse source.
- **`flow_sdxl_4k` needs no GPU confirmation** - MPI-332 rips it. Its two nodes are patched
  and the static sweep is clean.

Closed on local evidence with the RunPod leftover carried by the umbrella - the standing
pattern for a card whose only remainder is a Pod check.

## Later finding: PiD has NEVER worked in a shipped release

Established at close-out, after the section above was written. `dev_configs/node_lock.json`
at every release tag, checked against `ba9e156` (the commit that made `upscale_method`
required, 2026-07-16):

```
v1.1.0  tagged 2026-07-22  MpiNodes aaa1d2d9  contains ba9e156? YES -> broken
v1.2.0  tagged 2026-07-24  MpiNodes aaa1d2d9  YES -> broken
v1.3.0  tagged 2026-08-01  MpiNodes 69a43336  YES -> broken
v1.3.1  tagged 2026-08-02  MpiNodes 69a43336  YES -> broken
```

PiD's own release blurb was written into `RELEASE_NOTES['1.1.0']` at the 1.1.0 bump
(`41c59093`, 2026-07-09) and 1.1.0 was tagged 2026-07-22 - six days AFTER the input became
required. The feature was already broken on the day it was announced. It has produced a
generated image in no released build; every user who ran it got their source image back.

This raises the changelog wording from "fixed a regression" to "fixed a feature that never
worked", and widens the affected range from 1.3.x to every release since 1.1.0. The card
body and the close-out commit both say 1.3.0/1.3.1 - that understates it; this section is
the correction.
