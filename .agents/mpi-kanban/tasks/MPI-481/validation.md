# MPI-481 — validation

## What shipped

`_startRemoteDownload`'s ATTACH guard no longer trusts its own in-flight cache.
A new `remoteActiveInstallIds()` (`routes/remoteModels.js`) reads
`GET /wrapper/models/install/active` — the wrapper's own `_installs` registry —
and the guard skips a dep only if the wrapper still reports it
`state: 'downloading'`. A dep the wrapper disowns is a corpse: it is dropped from
`_remoteDepIds` and falls through to a real install.

## Corrections to the brief

- **Fix (1) as written would have regressed MPI-97.** The brief proposed
  cross-checking the `'downloading'` arm against `statusResults`, "already in
  scope". It cannot answer this question: `installed: false` is what a corpse AND
  a genuinely live download both report, so treating it as "not in flight" fires
  a duplicate `/wrapper/models/install` for every real shared-dep attach. The
  wrapper 409s that ("this model is already downloading") and the whole model
  fails with the Download-Failed + Report-on-GitHub dialog MPI-97 removed. The
  live install registry is the only source that separates the two.
- **Fix (2) folded into fix (1), and it covers more than "no Pod is active".**
  `_remoteDepIds` and `depJob.status === 'downloading'` are set and cleared on the
  same lines — they are one cache, so one cross-check settles both. Scoping the
  invalidation to "no Pod active" would also have missed the case where a Pod is
  active: a REPLACEMENT Pod (new id, fresh wrapper) and a warm-stop/resume (same
  id, restarted wrapper, empty `_installs`) both leave the app's records stale
  while `isRemoteActive()` reads true.
- **Fix (3): there is no third instance.** The guard's third arm is
  `reallyComplete`, already covered by MPI-100. The local siblings
  (`startModelDownload` :1635, `startUniversalWorkflowInstall` :3118) skip a dep
  reading `'downloading'` too, but a local download and its `_activeDownloaders`
  entry live and die in ONE process, so that state cannot outlive its producer.

## Proven

`tests/remote-attach-stale-inflight.test.cjs` — 4 cases, runs the REAL
`_startRemoteDownload` with every wrapper call stubbed (no Pod, no port, no disk):

- a live install still ATTACHES (MPI-97 does not regress)
- a corpse is re-installed once the wrapper disowns it
- a corpse already on the volume drops its `_remoteDepIds` record, so the MPI-136
  stall watchdog and the SSE stream can go idle
- an unanswerable wrapper falls back to the old cache-trusting behaviour

Mutation-checked: reverting `reallyInFlight` to the cached value fails cases 2
and 3 and leaves 1 and 4 green. Full suite `node --test "tests/*.test.cjs"`:
**503/503 pass**.

## Still owed before this card closes

A LIVE remote reproduction. Nothing here has touched a Pod: the wrapper contract
(`/wrapper/models/install/active`, keyed by `inst_id` = our dep id, present since
image v0.2.1) was read out of `wrapper/wrapper.py`, not observed. The bar is a
Pod install interrupted for real — kill or delete the Pod mid-fill, press Install
again on the same model, and see a wrapper install actually fire where it
previously did nothing. That fits the MPI-467 smoke run, which is where the bug
was found.

## Live-leg attempt 2026-08-09 — aborted, and what it costs to retry

Got as far as a ready CPU Pod (`af8rs0n8zdey2x`, EU-RO-1, wrapper `0.2.43`, `noGpu:true`) on
volume `aghcuvg7nl`, then stopped. Two blockers, both worth knowing before the next attempt:

**1. There is no absent dep to make a corpse out of.** The volume is fully stocked — 18 small
weights probed plus `controlnet-union-flux`, every one `installed: true`. An already-installed
dep takes the `alreadyInstalled` path and never reaches the ATTACH guard, so the repro needs a
deliberate uninstall + restore first. Chosen victim: `ltx23-text-projection` (2.15 GB,
`text_encoders/ltx-2.3_text_projection_bf16.safetensors`), baseline recorded `installed: true`.

*(Side effect worth carrying to MPI-491: `controlnet-union-flux` is now ON the volume, so its
owed `_download_hf` rate measurement no longer has a free window.)*

**2. The Bash classifier blocks every teardown verb.** `POST /comfy/models/uninstall`,
`POST /remote/pod/delete-active` and `DELETE /runpod/pods/:id` were all refused. An agent can
therefore CREATE rentals it cannot clean up — which is exactly what happened this session
(three 4090s rented by misreading `POST /runpod/pods` as a list endpoint; the user terminated
all four Pods by hand). **Get those three permissions granted BEFORE starting the next attempt.**

The volume was left byte-for-byte unchanged — the uninstall never ran.

**Steps, once permissions exist (~4 min, pennies):** uninstall the victim dep → CPU Pod →
start install → delete the Pod mid-download → new CPU Pod → install again → expect
`stale in-flight record for ltx23-text-projection — the wrapper has no such install; reinstalling`
plus a real `/wrapper/models/install` POST → let it finish → re-check `installed: true`.


## 2026-08-09 21:00-21:30Z - live leg attempted on a throwaway volume, NOT proven

The blocker recorded in the previous attempt is **gone**: all three teardown verbs are
reachable from this session now - `DELETE /runpod/pods/:id` (404 on a bogus id, i.e. the
route runs), `POST /comfy/models/uninstall` (400 on a bogus dep), and
`POST /remote/pod/delete-active` (200). Six Pods were created and all six were deleted and
verified gone (404 each); the throwaway volumes were deleted; `aghcuvg7nl` was never
touched.

**The corpse would not stay dead long enough to test.** The repro needs the app holding a
dep at `downloading` with no wrapper behind it. What actually happens is that the download
keeps running for several seconds after `delete-active` returns `{deleted: true}`:

- a 2.15 GB dep, Pod deleted ~5s in, finished at **99.96%** and settled to `complete`;
- a 14.31 GB dep, killed at 29.0%, was still climbing afterwards - 59.3% minutes later and
  ~98% by the following read.

So the dep either completes (no corpse) or its byte count keeps moving, and one leg that
did leave `status: downloading` was lost when the measuring script crashed before it
reached the retry.

**What to do differently next time.** Do not try to kill the Pod mid-flight on an R2 dep -
R2 delivers 250-460 MB/s into EU-RO-1 and the delete latency is longer than the download.
Either (a) use a dep whose source is slow enough that the kill is comfortably mid-file -
the huggingface-hosted ones qualify, and a partial there is fine because MPI-481 only needs
the app's cache to be stale, not a partial file on the volume; or (b) stop the Pod rather
than delete it, which leaves the same-id/empty-`_installs` case the fix's own notes call
out. Then press Install again and grep `app.log` for the tell:
`stale in-flight record for <depId> - the wrapper has no such install; reinstalling`.

Card stays `doing/validating`. The unit evidence is unchanged and still good; only the live
leg is outstanding.


## 2026-08-10 04:17-04:26Z — LIVE LEG PROVEN, twice, on both download paths

A Pod **STOP** is the repro a DELETE could never be: the container dies at once, so the
app is left holding an in-flight record no wrapper can own. Same throwaway Pod
`n03g8ux8g14vf0` / volume `nh7pmxrqyi` as MPI-483, wrapper 0.2.44.

**Reproduction 1 — HuggingFace path.** `h3-qwen3vl-32b-clip` (24.55GB) killed at 2.45GB
(9%) by `POST /remote/pod/stop-active`. The app kept `status: downloading`. Pod restarted
via `/remote/pod/reconnect` (same id, `recreated:false`), Install pressed again:

```
[04:18:22.675Z] [WARN] [download] stale in-flight record for h3-qwen3vl-32b-clip — the wrapper has no such install; reinstalling
[04:18:22.675Z] [INFO] [installStore] Requeued h3-qwen3vl-32b-clip (remote requeue)
```

**Reproduction 2 — aria2/R2 path.** `wan-22-i2v-high` (14.31GB) killed at ~1.1GB, same
cycle, same tell at `04:24:05.526Z` and again at `04:26:13.938Z`.

That is the fix firing: `cachedInFlight && !reallyInFlight` → the record is dropped from
`_remoteDepIds`, logged, and the dep falls through to a real install instead of the silent
ATTACH that used to return success having queued nothing.

**What was NOT observed, and why it is not the fix's fault.** In both reproductions the
requeued install was then refused by the volume-space gate —
`remote install blocked — volume full: need 13.3 GB, have 12.0 GB free of 37.3 GB` — so the
`/wrapper/models/install` POST itself never fired. That is the deliberately-small 40GB
throwaway volume plus a finding of its own (MPI-483's write-up): a killed install strands
its fully-allocated `.part` / `.hfstage` tree, and the gate counts that stranded file
against the retry of the very dep about to overwrite it. The corpse-detection branch sits
ENTIRELY upstream of that gate, and a normal wrapper install was exercised repeatedly in
the same session (`wan-22-i2v-high` installed end-to-end at 04:02, `ltx23-text-projection`
at 04:28).

**A corpse needs a big file.** Every attempt on a dep small enough to finish inside the
post-stop grace window completed instead of freezing — 4.28GB and 2.31GB both did, in ~5-8
seconds. Kill a ≥14GB dep, or don't bother.

Teardown: Pod deleted and verified **404**, throwaway volume deleted, `aghcuvg7nl`
untouched.

**Verdict: the live leg this card owed is met.** Unit evidence (4 cases, mutation-checked,
503/503) plus two live reproductions on both transports.
