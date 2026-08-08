Compute missing SHA256 hashes for dependencies in the four SPLIT dep files
(`js/data/modelConstants/{modelDeps,assetDeps,loraDeps,nodesDeps}.js`).

NOT `dependencies.js` - that is a FACADE that only spreads the four siblings, so its own
`export const DEPS = {...}` block holds ZERO literal entries. Scanning it finds nothing and
reports "All deps already have SHA256 hashes" (MPI-316).

## Steps

1. Run: `python scripts/computeDepHashes.py` (or `python3` on Linux)
   - If Python is not in PATH, use the full path: `C:/Users/Fabio/AppData/Local/Programs/Python/Python312/python.exe`
2. The script will:
   - Find every dep with `sha256: null` - HuggingFace AND R2 (`models.cubric.studio`)
   - HF: hash from the remote (HEAD `X-Linked-ETag`, else streaming download)
   - R2: hash the LOCAL master copy under `CUBRIC_MODELS_ROOT` (default `g:/cubricmodels`),
     because R2's ETag is multipart-MD5 and useless for sha256
   - Write the hashes back into whichever split file each dep lives in
3. Verify: `git diff js/data/modelConstants/` to confirm changes

## Sizes (`--sizes`) - a separate pass, run it after any upload

`python scripts/computeDepHashes.py --sizes`

HEADs every file-backed dep, writes the measured byte count as `bytes:`, and REGENERATES the
`size:` string from it. **Never type either by hand.** Unlike the hash pass it touches EVERY dep,
not just the ones with a null field, because the point is that no `size` was ever measured.

- HF deps read `X-Linked-Size` off the 302 - **not** that response's `Content-Length`, which is
  the ~1 KB redirect body. Read the wrong one and a 20 GB transformer measures 1072 bytes.
- R2 deps read `Content-Length` from the object, falling back to a local `stat` under
  `CUBRIC_MODELS_ROOT` if the HEAD fails.
- `custom_nodes` are SKIPPED - their `url` is a `lockUrl()` git repo, not a file, so there is no
  Content-Length to read. Those 14 `size` strings stay hand-written.
- Re-running writes nothing. A non-empty diff means a file on the host changed.

Measured 2026-08-08 (MPI-482): the hand-typed strings totalled 498.9 GB against a true 478.2 GB -
**4.1% OVER**, because the common mistake is copying HuggingFace's decimal-GB display into a field
every consumer parses as 1024-based. `size` is what `footprint.js`, the smoke runner's volume
preflight and `modelJob.totalBytes` actually read, so regenerating it is what corrects them.

Full context: `docs/playbooks/add-model/02-dependencies-r2.md` § "Fill sizes".

## Dry Run

To preview without writing: `python scripts/computeDepHashes.py --dry-run`
(works with `--sizes` too)
