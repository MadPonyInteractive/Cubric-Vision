# MPI-494 — checklist

- [x] Confirm the stale claim — `marduk191/rife` 302s to `xet-bridge-us`, `X-Xet-Hash` present
- [x] Pick the fix shape — R2 (object already staged, sha already matches, no licence bar); Xet-native route rejected, it would add a pip layer for a weight that has an R2 copy
- [x] Swap the RIFE prebake url in `cubric-vision-pod/Dockerfile`
- [x] Correct the comment block that asserted the false claim, and the stale "4 non-RIFE" count (really five; now "ALL SIX")
- [x] Verify the new url serves the same bytes — four-way sha agreement incl. HF's own `X-Linked-ETag`
- [x] Prove the `dl()` contract: ranged 206 at two offsets + 16-segment reassembly + `sha256sum -c` → OK
- [x] url+sha in lockstep with Cubric-Vision `assetDeps.js`
- [x] Commit in `mpi-ci` (git -C), release the file claim
- [ ] NOT DONE — no image build run (Docker deliberately down, smoke matrix live); next CI dispatch confirms
- [ ] NOT OWNED — `cubric-vision-pod/README.md:390-398` repeats the false claim + "5 weights"/"4 non-RIFE"
