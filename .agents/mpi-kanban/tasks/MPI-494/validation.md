# MPI-494 — validation

Change under test: one url in `cubric-vision-pod/Dockerfile`'s prebake `RUN`,
`huggingface.co/marduk191/rife` → `models.cubric.studio/.../rife/rife47.pth`.
The sha256 assertion on that line was NOT changed.

## 1. The premise is real (the reason the card exists)

`curl -sI https://huggingface.co/marduk191/rife/resolve/main/rife47.pth`
→ `302` to `us.aws.cdn.hf.co/xet-bridge-us`, with `X-Xet-Hash` present.
The "plain non-Xet repo" carve-out is false. CONFIRMED.

## 2. The new url serves the bytes the sha already asserts — three ways

| source | sha256 |
|---|---|
| Dockerfile line (unchanged) | `6a8a825a…be63` |
| Cubric-Vision `assetDeps.js` `rife47` | `6a8a825a…be63` |
| R2 object, downloaded and hashed | `6a8a825a…be63` |
| HF's own `X-Linked-ETag` on the old url | `6a8a825a…be63` |

The HF header agreeing is the useful one: it is HF asserting the R2 copy is the
same file, from the other side of the swap. A crossed url/sha — the failure the
comment block explicitly warns about — is ruled out.

Size agrees too: `Content-Length: 21344827` = `assetDeps.js` `bytes: 21344827`.

## 3. The `dl()` contract runs against the new url

`aria2c` is not installed locally and the Docker daemon was down (deliberately
not started — a live RunPod smoke matrix was running in another session), so
aria2's ranged multi-connection fetch was reproduced with curl:

- `Range: bytes=0-1048575` → `206`, `Content-Range: … /21344827`
- `Range: bytes=10000000-10001023` → `206` (mid-file, what `-s16` issues)
- 16 parallel segments, reassembled → **21344827 bytes**, and the Dockerfile's
  own check `echo "<sha>  <file>" | sha256sum -c -` → `OK`

That is the exact assertion the build makes, passing against the new url. R2
serving ranged 206 at multiple offsets is the property HF's Xet CDN
intermittently refuses, which is the whole point of the move.

## 4. Blast radius

- Diff is 3 hunks, 23+/7- in one file. Line endings unchanged (454/454 CRLF,
  no mixed endings, no whole-file normalization).
- `grep` for `huggingface`/`hf.co` in the Dockerfile → comment prose only, zero
  fetch urls. "ALL SIX weights pull from R2" is now literally true.
- Cubric-Vision: repo-wide grep for the stale claim → 0 hits.

## NOT done — the honest gap

**No image build was run.** A full CUDA image build is a CI action measured in
hours and GBs, and Docker was intentionally left down. What protects this is
that the Dockerfile verifies `sha256sum -c` inline: a wrong url fails the BUILD
loudly, by design — there is no silent-corruption path left open. The next
`cubric-vision-pod-image.yml` dispatch confirms it for free.

**`cubric-vision-pod/README.md`** carried the same false claim; ownership was
extended by the user and it is fixed too (mpi-ci 5ca7487). No known survivor.
