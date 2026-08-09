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


## 2026-08-09 21:00-21:30Z - live Pod session: wrapper 0.2.44 SHIPPED, the disk check INCONCLUSIVE

**Wrapper 0.2.44 is live on the dev channel and boots.** `./publish-runtime.sh dev`
published it (manifest `wrapper_version: 0.2.44`, sha
`85ef00e1a172577a4d00aedee52ba22796a22cb17934997e888b5e5803b32d83`), and six CPU Pods
created during this session all reported `wrapperVersion: 0.2.44` from
`/remote/comfy/status`. **Consequence for the release: `mpi-release`'s manifest-diff stop
will now report dev `0.2.44` vs stable `0.2.40`, and the answer is still PROMOTE.**

**The measurement itself did not settle.** Two runs of the same experiment disagree, so
this card does NOT close:

| leg | .part age | app-reported downloaded | volume attributes to the .part | reads as |
|---|---|---|---|---|
| H | 14.1s | 3.44 GB (24.1%) | **13.61 GB** (95% of declared) | apparent |
| I | 7.6s | 1.23 GB (8.6%) | **0.00 GB** | neither |

Both used the same 14.31 GB R2/aria2 dep on a clean throwaway volume, and both forced a
fresh `du` by invalidating the wrapper's cache. They cannot both be right, so the honest
verdict is **inconclusive** - and a 95%-of-declared reading is emphatically not something
to close a card on in either direction.

### Why the app-side route cannot answer this question

`/remote/pod/disk` is the wrong instrument, for three compounding reasons found the hard
way:

1. **`/wrapper/disk` caches `du` for 60s** (`_DISK_TTL_SEC`) and is invalidated only by an
   install COMPLETING or a delete (`_disk_cache_invalidate`, two call sites) - never by an
   install starting. So no sample taken during a download is fresh unless something else
   is deleted at that instant. Every early sample in this session read the pre-install
   number and looked like a flat zero delta.
2. **The app's `downloadedBytes` lags the wrapper.** At the 250-460 MB/s this Pod pulled
   from R2, a few seconds of lag is gigabytes, so it cannot adjudicate real-vs-apparent.
3. **R2 is fast enough that the file finishes before an interrupt lands.** A Pod delete
   takes several seconds to take effect and the download keeps running throughout: a
   2.15 GB dep reached 99.96% and a 14.31 GB one went from 29% at kill to 59% and then
   ~98% *after* `delete-active` returned `{deleted: true}`.

### The instrument that WOULD answer it, and why it was not reachable

`GET /wrapper/ls` already returns **both accountings for the same file at the same
instant**: `top_level[].size_bytes` is `du -s --block-size=1` (allocated blocks) and
`models_files[].size_bytes` is `os.path.getsize` (apparent). The wrapper's own comment at
that route says the two totals "legitimately differ while a sparse `.part` file is on the
volume" - which is exactly the quantity this card is about. One call, no timing games, no
reliance on any byte counter.

**No app route surfaces it**, and it cannot be called directly from this machine: egress
to `https://<podId>-8889.proxy.runpod.net` fails outright (curl exit code 000) while the
app reaches it fine from the server process. **So the concrete next step for this card is
a small app route proxying `/wrapper/ls`** (or extending `/remote/pod/disk` with the
`top_level` breakdown). After that the check is a single request against any Pod with a
partial download.

### A finding that may undercut the card's premise, and must be resolved first

Leg I saw **0.00 GB on the volume for a `.part` the app said was 1.23 GB downloaded**, and
the huggingface path behaves the same way: during the 24.55 GB `h3-qwen3vl-32b-clip`
install the volume held **49,664 bytes** with 1.27 GB fetched, then jumped to the full
26.37 GB when it completed. If a download in flight is staged OFF the volume and moved
across on completion, then for those paths there is no partial `.part` on the volume to
inflate `du` at all - and the card's model of the bug needs re-checking before its fix can
be called right. Leg H contradicts this, which is precisely why the `/wrapper/ls`
comparison is needed rather than more inference.

### Standing decision, unchanged

The full-disk phrase stays OUT of the `UNRELEASED.md` wake-up-install bullet. The Pod
check did not pass, so the bullet must not lean on it as its trustworthy counterexample.


## 2026-08-09 22:00Z - the instrument now exists: `GET /remote/pod/ls`

Built at Fabio's go-ahead, so the next attempt at this card is ONE request instead of a
Pod session. `routes/remotePodLifecycle.js` gained a read-only passthrough of the
wrapper's `/wrapper/ls`, plus a pure `compareVolumeAccounting()` that does the comparison
the card actually needs:

- `blockBytes` - `du -s --block-size=1` for the directory holding MODELS_DIR (allocated
  blocks; the same accounting `/wrapper/disk` and the volume quota use);
- `apparentBytes` - the sum of `os.path.getsize` over the model files;
- **`phantomBytes` = apparent - blocks** - what the pre-fix `du -sb` would have invented;
- `countedDir` + `approximate`, because `models_files` walks MODELS_DIR while blocks are
  reported per top-level dir, so the block figure is usually its ancestor's and can
  include siblings. Named rather than hidden.

Both halves come from ONE response at ONE instant, which is the entire point: the reason
this card is still open is that the app-side route cannot be sampled honestly while a
download runs.

**Read `phantomBytes` while a big aria2 install is in flight.** A large positive value
means sparse `.part` files are on the volume and the old accounting inflated usage by
that much - the bug is real and the fix removes it. A value near zero means the
filesystem allocated the whole declared length up front, in which case `du -sb` and
`du -s --block-size=1` agree on RunPod volumes and **this card's premise does not hold**,
which is the possibility leg I raised and the reason it was not closed.

Verified: `tests/volume-accounting-gap.test.cjs`, 6 cases, mutation-checked. The
sibling-prefix case is a proven negative control - reverting the separator in
`startsWith(`${p}/`)` fails it. It was first written with the prefix the other way round
and the mutation showed it was guarding nothing, so it was rewritten to `/workspace/model`
vs `/workspace/models` and only then did the mutation fail it. A failed `du`
(`size_bytes: null`) returns null rather than counting as zero blocks, which would have
fabricated a phantom equal to the whole apparent total.
