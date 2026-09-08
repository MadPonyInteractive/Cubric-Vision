# MPI-680 - checklist

- [x] Confirm the nine primaries are healthy (HEAD 200, content-length == dep `bytes`)
- [x] Derive each mirror path from the REAL `_mirrorUrlsFor`, never hand-typed
- [x] Per dep: pull from R2, verify sha256 against the dep entry, upload to the mirrored HF path, delete the local stage
- [x] Verify each pushed `lfs.sha256` equals the dep's `sha256` - 9/9 OK
- [x] `npm run release:deps` exits 0, `All 290 URLs reachable`, no Klein dep in the single-route list
