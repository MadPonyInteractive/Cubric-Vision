# MPI-494 — Dockerfile RIFE prebake pulled from HF on a claim that had gone false

## The claim, and why it was false

`cubric-vision-pod/Dockerfile` prebakes six lazy node weights so a fresh Pod
never makes a runtime HuggingFace call. Five came from R2. RIFE alone stayed on
`huggingface.co/marduk191/rife`, on a written carve-out:

> RIFE stays on HF (marduk191/rife is a plain non-Xet repo, never 403s).

Measured 2026-08-08, that exact url:

```
HTTP/1.1 302 Found
Location: https://us.aws.cdn.hf.co/xet-bridge-us/69979edbc633a08f9cf815b8/33ad745d...
X-Xet-Hash: 33ad745d525a38f860cb8c221dcb1a958b34200878963ad43a4195eff83601b9
X-Linked-ETag: "6a8a825ab2750558bdd20dcced386fd82b7222c7ba58c11d3b611d9c44f1be63"
```

It 302s to the Xet bridge and carries an `X-Xet-Hash` like everything else. HF
migrated the whole site, not a list of repos — so "plain non-Xet repo" was a
fact with an expiry date, and nothing was watching it. MPI-148 is on record that
this CDN 403s ranged aria2 (`-x16 -s16`) NON-DETERMINISTICALLY and takes the
whole `docker build` down mid-layer when it does. The build was carrying that
flake with its justification already gone.

## Fix shape — R2, not the Xet-native route

The card offered two shapes. R2 won on a fact that made it nearly free:
**the app already pulls RIFE from R2.** `assetDeps.js` `rife47` has used
`https://models.cubric.studio/vision/models/frame_interpolation/rife/rife47.pth`
since MPI-222, and its sha is the **same** `6a8a825a…be63` the Dockerfile
already asserted. The object was staged, the licence has no redistribution bar,
so the fix is a url swap with the sha untouched — no upload, no publish.

The Xet-native route (`huggingface_hub`, MPI-491) was rejected here: it would add
a pip layer to the build for a weight that has a perfectly good R2 copy. That
route exists for MiniMax H3, which is HF-primary *only* because its licence
forbids an R2 copy. Nothing about RIFE is like that.

Also corrected: the block said "The 4 non-RIFE weights" when there are five
(birefnet was added later and the count was never updated) — the same
comment-drift failure mode as the claim itself. It now reads "ALL SIX".

## Standing lesson written into the comment

A repo being non-Xet TODAY is not a durable reason to stay on HF. Any weight
added to that block goes to R2 unless a licence bars the copy.

## Leftover, NOT owned by this card

`cubric-vision-pod/README.md:390-398` repeats BOTH stale facts — "bakes 5 model
weights", "The 4 non-RIFE weights", and "RIFE stays on HF (`marduk191/rife`,
plain non-Xet repo)". This session's ownership was the Dockerfile only, so it
was left untouched and reported instead. Cubric-Vision itself is clean
(`docs/runpod-troubleshooting.md` was corrected in 9be9dfc3, and a repo-wide
grep for the claim returns nothing).
