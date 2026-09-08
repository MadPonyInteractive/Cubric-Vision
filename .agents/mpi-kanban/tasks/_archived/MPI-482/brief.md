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

---

## Outcome 2026-08-08 - measured, and the premise came back inverted

Shipped in two commits: `0ac94728` (the `--sizes` pass) and `af829e0f` (the 107
regenerated entries + the playbook section).

**Every file-backed dep now carries `bytes:`, a measured integer from a HEAD**, and its
`size:` string is regenerated from that. 107 of 121 deps; the other 14 are `custom_nodes`
whose `url` is a `lockUrl()` git repo, so there is no Content-Length to read and their
strings stay hand-written. That limit is stated in the script docstring and the playbook,
not hidden.

### The numbers say the opposite of what this card assumed

| | |
|---|---|
| typed strings, all 107 | **498.9 GB** |
| measured truth | **478.2 GB** |
| drift | **-20.7 GB, i.e. the typed values were 4.1% OVER** |

The direction is consistent - every large transformer is ~4.5% high - which points at
HuggingFace's decimal-GB display being copied into a field every consumer parses as
1024-based. Worst single entry: `ltx23-spatial-upscaler`, 1.5 GB declared against 0.93 GB
real.

**So this cannot explain the MPI-467 overrun.** If 95 deps declared 195.7 GB and their
true bytes are *below* that, a volume reporting 259 GB of blocks is a measurement problem
on the volume side. That is MPI-483 (`du -sb` counts APPARENT bytes, inflated by aria2
preallocation) - already carded, and now the only live candidate.

### Both "proof" entries failed

- **`krea2-lora-filterbypass` really is 160 bytes.** Fetched it: a valid safetensors file
  holding one F32 `[1,12]` tensor, `diffusion_model.txtfusion.projector.diff`. The
  declared value was correct all along.
- **`h3-qwen3vl-32b-clip` is declared once**, at 26.36 GB (measured 24.55). There is no
  28.3 GB anywhere in the tree, in any file, for any dep. Nothing reads that file at a
  second size.

The card was still worth doing - 4% fleet-wide and 60% on one dep are real - but it was
carded on two examples that do not hold, and the fix does not close the gap it was
created to close.

### Two script bugs had to go first (both pre-existing, both silent)

- **Entry bodies were regex-matched**, with a pattern that ends at the first NESTED
  object's closing brace. `sdxl-realistic` truncated 264 chars in, inside its
  `credit: { ... }` block and before its `url:` line, so it read as url-less and was
  dropped. **Nine deps** - the seven CivitAI merges plus `chroma1-hd-flash`/`-hyper` -
  were invisible to the sha256 pass for as long as that pass has existed. Bodies are now
  brace-counted (strings and comments skipped). Verified against the registry loaded in
  node: 107/107, no misses, no extras.
- **`Path.write_text` uses `newline=None`**, so on Windows it rewrites every LF as CRLF.
  `loraDeps.js` is LF and the other three are CRLF, so touching one field in loraDeps.js
  would have rewritten all 604 lines. Per-file newline is now detected on read, restored
  on write - confirmed after the run: loraDeps still 647 LF / 0 CRLF.

### Evidence

- `--sizes` re-run is **byte-identical** (`0 entries rewritten (107 already correct)`,
  `cmp` clean on loraDeps.js). Idempotent, so the values are measured and not re-guessed.
- `npm test` 508/508. eslint clean on all four dep files.
- Offline recompute of the full remote/cuda weight union: 92 weight deps, 401.7 GB from
  the size strings and 401.7 GB from `bytes` - they agree, and no weight dep lacks `bytes`.
- Worst size-string rounding error against its own `bytes` is 0.316% (`qwen-lora-headswap`,
  a small file where two decimals is coarse).

### Deliberately NOT done

**No consumer was changed.** `footprint.js`, the smoke runner's preflight, and
`modelJob.totalBytes` on both engine paths all read `size` through `_parseSizeToBytes`,
so regenerating that string corrects every one of them with no code change. Nothing reads
`bytes` yet; it is the provenance marker and the value of record. Migrating consumers to
it would mean editing `routes/`, which needs a server restart to verify - and that restart
would have killed the live MPI-467 fill.
