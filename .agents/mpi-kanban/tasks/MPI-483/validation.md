# MPI-483 — validation

**State: both bugs fixed and unit-verified. Bug 1's wrapper half needs one Pod to confirm
live — it changes a number that only a real network volume produces.**

## Bug 1 — the disk-full gate counted APPARENT bytes

`GET /wrapper/disk` ran `du -sb`. `-b` is `--apparent-size --block-size=1`, so it summed
declared file **lengths**. The comment sitting directly above the call said the opposite —

> `# -s summary, -b bytes (apparent-size off — real disk blocks, matches quota).`

— which is why the bug survived a route that has been rewritten twice (MPI-169, MPI-398).
That comment is now replaced with the mechanism and the measurement, and says *do not
restore `-b`*.

Sparseness, not preallocation (the download section's own note records that MPI-95
mislabelled it): aria2 writes `-s 128` segments at scattered offsets with
`--file-allocation=none`, so a `.part` file's length snaps to ~the full total the instant
any late segment writes near EOF while its allocated blocks are only what has arrived.

| source | reading |
|---|---|
| wrapper `du -sb` (apparent) | 307.65 GB |
| RunPod console (real blocks) | 259 GB |
| phantom | **48.65 GB** |

Fixed at **both** `du` call sites, not just the reported one:

| site | change |
|---|---|
| `wrapper.py` `/wrapper/disk` | `du -sb` -> `du -s --block-size=1` (allocated blocks) |
| `wrapper.py` `/wrapper/ls` (a) per-top-level-dir | same, so the breakdown adds up to the gate's number |

`/wrapper/ls` (b) — the flat file walk — deliberately stays on `os.path.getsize`
(apparent). It is matched against **declared dep sizes** for orphan detection, not against
the quota, so the two totals legitimately differ while a sparse `.part` is on the volume.
That is now written down at the call site rather than left to be rediscovered.

### Blast radius swept

`_remoteVolumeUsedBytes()` -> `remoteVolumeFreeBytes()` (`routes/remotePodLifecycle.js`)
-> the remote install gate at `routes/downloadManager.js:2335`, and the Settings volume
bar via `GET /remote/pod/disk`. All three read the same corrected number; none needed a
code change, which is the point — the fix belongs at the source, not at each consumer.

The LOCAL twin (`_freeDiskBytes`, `downloadManager.js:1671`) uses statfs and was never
affected. `_hot_free_bytes()` uses `shutil.disk_usage` on the container disk and is
likewise correct — its docstring already explains why statvfs is right there and wrong for
the volume quota.

`WRAPPER_VERSION` 0.2.43 -> **0.2.44**, with the changelog entry added to the app-side
version log in `routes/remotePodLifecycle.js`. **Not** raised to the app's `WRAPPER_VERSION`
pin (still `0.2.41`): an older wrapper answers the same route with the same shape, just
with the inflated number, so rejecting it would be wrong.

## Bug 2 — the smoke preflight never checked FREE space

`scripts/smoke-workflows.mjs` printed `weights 300.5 GB · volume 350 GB` and compared its
estimate to the volume's configured **SIZE**. It never asked what was free and never asked
what the volume already held.

New pure, exported `volumeFitVerdict({usedBytes, totalBytes, setBytes, headroomBytes})`,
called immediately after the CPU download Pod comes up and **before the first install** —
the earliest moment free space is knowable at all, because RunPod's API exposes only the
configured size and the wrapper's `du` is the only live source. `abort()` deletes the live
Pod on its way out, so a refusal costs the CPU Pod's few minutes instead of a 40-minute
fill.

Units were the trap and are handled explicitly: dep sizes are **1024-based** (`sizeToGb`,
and all 107 regenerated as GiB by MPI-482), RunPod volume sizes are **base-10 GB**. Mixing
them is a ~7% error in the direction that passes a gate it should fail.

The plan line was also reworded — `volume 350 GB` now reads *"new volume would be 350 GB"*,
because that number is the size `ensureVolume` would create at, and it was being read as a
fit check.

### One correction made mid-implementation, recorded because it inverted a design choice

The gate first demanded `VOLUME_HEADROOM_GB` (40 GB) of free space on top of the
remaining weights. That is the constant that rounds **up the size of a volume being
created**, and reusing it as a required free margin made the gate refuse a from-empty fill
that genuinely fits: 300.5 GiB = 322.7 GB, +5% = 338.9, +40 = 378.9 > 350. The test caught
it. The gate now uses a separate `FIT_MARGIN_GB = 5`.

**Be precise about what this gate would have done on 2026-08-08: nothing.** A 350 GB volume
does hold the 322.7 GB set, so with honest numbers it passes and the run proceeds. That
day's false disk-full was **bug 1**, the wrapper counting apparent bytes. What bug 2's fix
stops is the class the runner was blind to entirely — a volume that genuinely cannot take
the remainder, discovered before renting instead of after. The brief's line that it
"passed cleanly against a volume that could not fit the set" does not survive the
arithmetic; the volume could fit it.

## Verified

`node --test tests/smoke-free-space.test.cjs` — 7 asserts, all green:

- empty 350 GB volume, real set -> **proceeds** (the case a too-strict margin wrongly refused);
- **NEGATIVE CONTROL** — same set, 330 GB volume -> refused;
- mostly-filled volume (259 GB down) -> proceeds, only the 63.7 GB remainder counted;
- the set outgrew the volume (400 GB set, 250 GB free) -> refused, `Refusing to rent`;
- nearly-full volume whose remainder still fits -> proceeds (a resume must not be blocked);
- volume holding MORE than the set weighs -> `stillNeeded` 0 but still refused on the
  margin, and the line flags it rather than reading as "0 needed";
- missing telemetry (null used / null total / zero total) -> `ok: true, unknown: true`,
  never blocks a run that would have worked.

The flag semantics themselves are proven locally, which is worth having because the old
comment asserted the opposite of the truth and nobody checked. A 1-byte file:

```
$ du -sb tiny.bin              -> 1        (apparent: the declared length)
$ du -s --block-size=1 tiny.bin -> 1024    (allocated: what the filesystem gave it)
```

That settles which flag means what. It does **not** settle the volume behaviour — a
sparse `.part` on a RunPod network volume is the case that matters, and NTFS does not
produce one without an explicit sparse flag, so that half is the Pod check below.

`python -c "import ast; ast.parse(...)"` on `wrapper.py` — syntax OK.
`npx eslint scripts/smoke-workflows.mjs tests/smoke-free-space.test.cjs
routes/remotePodLifecycle.js` — clean.

`npm test` — 530 tests, **529 pass, 1 fail**. The failure is
`tests/output-prompt-capture.test.cjs`, which is **not this card's**: commit `0b15f342`
(MPI-505, H3 turbo) changed `stagesFor` to floor the total at 1 so H3 can pass a -1 delta
for its single-pass run, which breaks that file's pinned assertion that a garbage negative
delta must not corrupt a real count (`stagesFor('t2i_sdxl_realistic.json','single',-5)`
was 2, is now 1). Reported, not touched — it is a judgement call on MPI-505's contract, not
a defect in this diff. Every other file is green.

## Not proven yet

**The wrapper half needs one Pod.** `du -s --block-size=1` vs `du -sb` only differ on a
real filesystem with sparse files; nothing local reproduces a RunPod network volume with a
part-finished aria2 download. The check is cheap and belongs in MPI-450 Gate B's
throwaway-Pod session (which already pairs MPI-480 #3 and MPI-481):

1. `publish-runtime.sh dev`, restart the Pod so 0.2.44 boots.
2. Start any multi-GB install and let it reach a partial `.part`.
3. `GET /wrapper/disk` must now track RunPod's console figure, not run ~19% ahead of it.

Until that runs, this card stays `doing/validating`.
