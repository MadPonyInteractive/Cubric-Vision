# MPI-522 — validation

**Closed as OVERTAKEN on 2026-08-30. Both defects were fixed on 2026-08-11 by `07b8e8b2` —
`fix(MPI-542): green CI - a machine-specific path, and a check that was inert on Windows`.**
The fix landed under MPI-542's id, which is why `python scripts/overtaken-cards.py` reports 0
candidates for this card: it keys on the card id appearing in a commit, and this one never did.

## Evidence

**Defect (1) — the guard was inert on Windows.** `07b8e8b2` replaced the `pathExists`
(`fs.access`) resolution in `assertNoDanglingSymlinks` with `stat()`. The commit body records
the root cause this card said was unknown: on Windows `access` SUCCEEDS on a dangling reparse
point, because `GetFileAttributesW` reports the link's own attributes when it cannot resolve
the target — so every broken link read as fine. `stat()` follows the link and throws ENOENT.
The commit records it was measured both ways against a real dangling junction.

**Defect (2) — the test reported a pass while testing nothing.** The same commit replaced the
EPERM skip path with a **junction** fallback (`fs.symlinkSync(target, name, 'junction')`) —
the same reparse point, no privilege required — so the test runs on a dev box instead of
skipping. The commit records it was mutation-checked: restoring the access-based check fails
it locally.

**Re-verified on this box, 2026-08-30** (this box still cannot create symlinks — a fresh
`fs.symlinkSync` probe returns `EPERM`, so the junction path is the one that ran):

```
node --test tests/portable-win-layout.test.cjs
✔ a dangling symlink anywhere in the staged tree fails the build (11.5821ms)
ℹ tests 8   ℹ pass 8   ℹ fail 0   ℹ skipped 0
```

`skipped 0` is the point: the false green is gone, and the assertion the card was filed about
(`assert.rejects(..., /dangling symlink/)`) executed for real.

## Not re-checked, and why it does not need to be

The card's "needs a Windows box that CAN create symlinks to reproduce" budget is void — the
junction reproduces the bug exactly without the privilege, which is what made the fix possible
on this hardware in the first place.

The shipped-artifact check in the card's own text (linux tar.gz 0 symlinks, windows zip 0,
macOS zip 31 symlinks and 0 dangling) was a 1.4.0 measurement and is not re-run here; the card
already recorded that no shipped bytes were affected.

## Release gate

This clears one of the two members of **MPI-527** (Release artifacts that lie), which is a
Gate A row on **MPI-595** (2.0 release readiness). **MPI-523 is the remaining member.**
