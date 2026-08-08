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

## Dry Run

To preview without writing: `python scripts/computeDepHashes.py --dry-run`
