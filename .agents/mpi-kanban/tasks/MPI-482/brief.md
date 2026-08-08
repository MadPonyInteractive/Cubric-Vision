# MPI-482 — declared dependency sizes are estimates, not measurements

## The claim being made today

Every `DEPS` entry carries a hand-written `size` string (`"26.36GB"`, `"444MB"`). Nothing
ever measured them, and every space decision in the app reads them.

## Evidence (measured 2026-08-08 on volume `aghcuvg7nl`)

| fact | value |
|---|---|
| deps installed on the volume | 95 |
| their **declared** total | 195.7 GB |
| the volume's **real blocks** | 259 GB |
| declared total for the whole smoke set | 300.5 GB |
| what actually happened | died at model **9 of 12** on a 350 GB volume |

Two entries prove these are not measurements at all:

- **`h3-qwen3vl-32b-clip`** — declared **28.3 GB** under `minimax-h3` and **26.36 GB**
  under `minimax-h3-ref2va`. Same file. Two numbers.
- **`krea2-lora-filterbypass`** — declared **160 bytes**.

## Who reads them (all inherit the error)

- The smoke runner's volume preflight — how this surfaced.
- `footprint.js`.
- The download progress denominator: `modelJob.totalBytes` is summed from
  `_parseSizeToBytes` over these strings, on both engine paths. A wrong size is a wrong
  progress bar.
- Disk-full pre-checks, local and remote.

## The fix already has a home — do not build new tooling

`scripts/computeDepHashes.py` **already** walks every dep, issues an HTTP `HEAD` against
its URL, and writes results back into the split dep files
(`modelDeps` / `assetDeps` / `loraDeps` / `nodesDeps`). It does this today for `sha256`.

`Content-Length` — and HuggingFace's `X-Linked-Size` for LFS pointers — comes back in
**that same HEAD response** the ETag is read from. So this is a sibling pass in an
existing script, roughly:

1. Record true bytes per dep.
2. Keep a human-readable string only if the UI needs one, **derived** from the bytes
   rather than typed.
3. R2-hosted deps: the script already has a local-master-copy path for them
   (`LOCAL_ROOT`) because R2's ETag is multipart-MD5 — size can come from `stat` there,
   or from R2's own `Content-Length`, which is fine (only the *hash* is unusable).

## Do NOT hand-correct the two obvious ones

Fixing `krea2-lora-filterbypass` and the H3 clip leaves every other unmeasured entry
believed. The point is that none of them were measured. Measure all of them.

## Acceptance

- Every dep has a byte count that came from a HEAD (or a local `stat`), not a human.
- Re-running the script is a no-op — proving it is idempotent and the values are real.
- The smoke runner's plan total, recomputed, is within a few percent of what a full fill
  actually consumes.
