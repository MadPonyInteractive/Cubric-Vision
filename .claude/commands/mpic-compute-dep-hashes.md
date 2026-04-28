Compute missing SHA256 hashes for HuggingFace dependencies in `js/data/modelConstants/dependencies.js`.

## Steps

1. Run: `python scripts/computeDepHashes.py` (or `python3` on Linux)
   - If Python is not in PATH, use the full path: `C:/Users/Fabio/AppData/Local/Programs/Python/Python312/python.exe`
2. The script will:
   - Find all HuggingFace URLs with `sha256: null`
   - Compute SHA256 hashes via HTTP HEAD (ETag) or streaming download
   - Write the hashes back to `js/data/modelConstants/dependencies.js`
3. Verify: `git diff js/data/modelConstants/dependencies.js` to confirm changes

## Dry Run

To preview without writing: `python scripts/computeDepHashes.py --dry-run`
