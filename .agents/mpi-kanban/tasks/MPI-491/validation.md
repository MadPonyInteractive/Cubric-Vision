# MPI-491 — validation

## Baseline (peer, live download Pod, 2026-08-08)

`/comfy/downloads/status` sampled every 15s for 2 min, dep `h3-qwen3vl-32b-clip`,
aria2c `-x 16 -s 128 -k 1M`:

| t(s) | 15 | 30 | 45 | 60 | 75 | 90 | 105 | 120 |
|---|---|---|---|---|---|---|---|---|
| MB/s | 0.42 | 3.77 | 0.63 | 3.29 | 0.63 | 0.56 | 3.01 | 0.98 |

**Mean 1.66 MB/s.** Bursts ~3.8, collapses ~0.5 — a token bucket, not a slow link. A
single long-interval sample reads 3.3 MB/s, i.e. 2x optimistic, because it lands
mid-burst. ~62 GB remaining = ~10 hours.

## The mechanism is not bandwidth — measured 2026-08-08

`curl -sL` single-stream, same file, from the UK **home** connection:

```
downloaded=605254808B  speed=43576673 B/s      # 43.6 MB/s, whole 577MB VAE in ~14s
```

The 302 lands on `https://us.aws.cdn.hf.co/xet-bridge-us/...X-Xet-Cas-U...` — the Xet
bridge. **The disadvantaged home line beat the datacenter Pod 26x**, which rules out
link speed and points at HF's request-count limiter (~3000 resolver requests / 5 min,
anonymous, shared per IP) being burned by ranged multi-connection GETs.

## The changed code path, exercised for real (off-Pod, no credentials)

`_download_httpx` and `_drop_sparse_part` lifted verbatim out of `wrapper.py` and run
against the real HF url. Harness kept at
`<scratchpad>/hfprobe/run.py` (throwaway — it reads wrapper.py, it does not copy it).

```
ARM B  bytes=605254808  seconds=14.8  40.8 MB/s  progress_ticks=578
sha256 8e505d95dd1561d47abd43d4238fd40d9bb1ae9e147ed0a4cba778d76ae4db48
expect 8e505d95dd1561d47abd43d4238fd40d9bb1ae9e147ed0a4cba778d76ae4db48
SHA256: PASS

RESUME from 242101923 -> 605254808 in 9.0s (OK)
resumed sha256: PASS
```

- **40.8 MB/s** vs the 1.66 MB/s baseline — **~25x**.
- **SHA256 matches** `assetDeps.js` `vae-minimax-h3-audio` exactly.
- **578 progress ticks** — the app's bar moves; the SSE numerator is fed.
- **Range resume from 40% finishes to the same size AND the same correct hash** — the
  resume contract survives the transport change.

## `_drop_sparse_part` — 6/6

Monkeypatched `os.stat`, so the arithmetic and the threshold are covered on a machine
that has no `st_blocks`:

```
sparse (0 blocks)        -> dropped
sparse (512B of 1000)    -> dropped
contiguous (1024B/1000)  -> KEPT      <- the one that matters: no 21GB restart
empty part               -> no-op
no st_blocks (Windows)   -> left alone
missing file             -> no raise
```

## Blast radius — every dep classified, not just the reported one

121 deps carry a url:

| transport | count | what |
|---|---|---|
| httpx (new) | **6** | 4x MiniMax H3, `h3-qwen3vl-32b-clip`, `controlnet-union-flux` |
| aria2 (R2) | 101 | unchanged, still ~533 MB/s |
| aria2 (github) | 14 | unchanged |

`R2 misrouted to httpx: 0`. A false positive here would have cut R2 from 533 MB/s to
single-stream, so this is the check that mattered most.

## Shipped

`publish-runtime.sh dev` — wrapper **0.2.42** live at
`https://pod.cubric.studio/vision/dev/wrapper.py`, manifest
`wrapper_sha256 b3c5195d5204e5caab57a41f73942e3cf8c9a07163b3f1ed2a74c5594fe2d1be`.
Dev channel only; released users still boot `stable`.

## OPEN — the one leg not done

**Not yet run on a Pod.** The Pod's own IP may sit deeper in HF's penalty box than a
home line, so the 40.8 MB/s figure is the mechanism's proof, not the Pod's number.

It is blocked on credentials, not effort: creating a Pod needs the RunPod key, and a
key inside an agent instance arms `_sweepOrphanPods`, which reaps other sessions' live
Pods **by name** — that is what killed `fkbqtzs8htgvtw` mid-fill earlier the same day
(MPI-485). So this leg must run from the app that legitimately owns the account.

Close it by: connect a `__cpu__` Pod on volume `aghcuvg7nl` (EU-RO-1) from the real
app, confirm `[cubric-bootstrap] installed fetched wrapper.py` and `/health` reporting
**0.2.42**, install `vae-minimax-h3-audio`, and sample `/comfy/downloads/status`
**every 15s**. Pass = sustained >= 30 MB/s and the sha256 verify green.
Then `publish-runtime.sh promote`. Never before.

---

# POD RUN — 2026-08-08. The hypothesis was WRONG.

Run from the user's own app on :3000 at his explicit instruction (the only instance
that may hold the RunPod key). Pod `k9ig0ikjr9f6s0`, `__cpu__`, volume `aghcuvg7nl`,
EU-RO-1. `/remote/comfy/status` reported **`wrapperVersion: "0.2.42"`**, and the
published file carries the dispatch at line 2087 — so single-stream is what ran.

Target: **MiniMax H3 only** — it is the sole family whose weights come exclusively
from HF, so it is the only clean test. Dep `h3-qwen3vl-32b-clip`, 24.55GB.

| # | where | transport | conns | MB/s |
|---|---|---|---|---|
| 1 | Pod | aria2c | 16 | **1.66** (peer baseline) |
| 2 | Pod | httpx (0.2.42) | 1 | **1.74** |
| 3 | home | curl | 1 | **41.0** |
| 4 | Pod | aria2c, **R2** control (`sdxl-realistic`, 6.6GB) | 16 | **297** |

Row 2 sampled at 15s: 0.56 / 3.08 / 0.63 / 0.49 / 3.15 / 0.84 / 3.43 — the same
token-bucket shape as the aria2 baseline, mean 1.74.

**Connection count is not the cause.** 1 connection and 16 connections land within
5% of each other on the Pod. Row 3 is the *same URL* as rows 1-2 from a UK home
line at 24x the Pod's rate, and row 4 proves the Pod's NIC and route are healthy
(297 MB/s in the same minute). The throttle is specific to
**`us.aws.cdn.hf.co/xet-bridge-us` -> RunPod EU-RO-1**, and it is a per-IP TOTAL
cap, not a per-connection or request-count one.

Correction to the original diagnosis: the resolver request-count story explained the
burst shape but not the facts. It predicted single-stream would win; it lost.
`--lowest-speed-limit=1M` churn is real but was never the primary cause.

Also disproved: `Dockerfile:348`'s claim that `marduk191/rife` is "a plain non-Xet
repo". Every HF path now 302s to `xet-bridge-us`, that one included — so there is no
non-Xet HF route left to fall back to.

`hf-mirror.com` — unreachable from here, `http=000` on both repos. Dead lever.

## What the shipped change is still worth

Neutral-to-positive, and it stays: on the Pod it is a wash (1.74 vs 1.66), locally it
is 25x, and it removes the reconnect spiral where 16 connections all sit under
`--lowest-speed-limit=1M` and get killed every 30s. It is not the fix for the Pod.
**Do not promote to stable on this evidence alone** — it is unproven as a *win*
anywhere a user actually downloads from.

## Levers left, ranked

1. **`hf_xet` native.** The only untested one, and the mechanism now favours it for a
   NEW reason: the bridge is a compatibility shim for dumb clients (curl/aria2/httpx).
   A native Xet client asks CAS for reconstruction metadata and pulls xorbs from
   **presigned S3**, i.e. a different origin — which row 4 shows this Pod can saturate.
   Cost: pip install in `start-cpu.sh` (floated, no rebuild) + `_download_hf`.
2. **Stage H3 to R2 for our OWN Pod.** Row 4 says it would run at ~297 MB/s. Blocked
   only by the licence posture, and Fabio holds an authorization granted 2026-08-05
   (`C:/AI/Mpi/_private/minimax-h3-licence/`). His call, not mine.
3. **Install H3 on the LOCAL engine.** 74GB at ~41 MB/s is ~30 min and works today.
   Does not help a Pod smoke run.
4. **Different datacenter.** The volume is DC-locked to EU-RO-1; needs a new volume.

## Side effects of this run

- Pod `k9ig0ikjr9f6s0` LEFT RUNNING as the test bed (cpu3c, pennies/hr). Delete when done.
- `sdxl-realistic` (6.6GB) is now installed on the volume — it was the R2 control and
  completed before I could cancel. Real model, harmless, but it was not there before.
- The `h3-qwen3vl-32b-clip` partial advanced 10.56GB -> ~11.0GB, then cancelled.
- `_drop_sparse_part` did NOT fire on that partial. Either the volume's filesystem does
  not report holes via `st_blocks`, or aria2's part was contiguous. Untested either way
  — if hf_xet or any resume path is built on this volume, settle it first.

---

# SOLVED — hf_xet native, Pod `9d0dndbxd2xsh4`, wrapper 0.2.43, 2026-08-08

Lever 1 from the list above. Same dep, same volume, same Pod class, third transport.

## `h3-qwen3vl-32b-clip` (24.55GB), sampled at 15s

| t | bytes | MB/s |
|---|---|---|
| 15 | 3,149,979,518 | (baseline) |
| 30 | 7,160,352,768 | 267 |
| 45 | 14,830,002,176 | **511** |
| 60 | 22,945,329,152 | **541** |
| 75 | 26,363,476,151 | 228 (finished) |

**24.55GB in ~75 seconds, peak 541 MB/s.** Against the 1.66 MB/s aria2 baseline that is
**~320x**. Job `status: complete` — which means the wrapper's own sha256 finalize passed;
it errors otherwise.

## `minimax-h3-ref2va-transformer` (20.97GB)

550 / 561 / 117 MB/s — **whole file in ~60s**, and it threw away the 20.23GB partial to do
it (the Xet path re-downloads into a stage dir and `os.replace`s over `part`). Discarding
96.5% of a file and still finishing 350x faster is the right trade at these speeds.

## Volume truth after the run

```
INSTALLED minimax-h3-fl2va-transformer
INSTALLED minimax-h3-ref2va-transformer
INSTALLED h3-qwen3vl-32b-clip
INSTALLED vae-minimax-h3-video
INSTALLED vae-minimax-h3-audio
```

**The entire MiniMax H3 family is on the volume** — ~46GB, about 2.5 minutes of transfer,
against a projected 10 hours. MPI-467's Gate E blocker is cleared.

## Off-Pod pre-flight (before publishing)

`_download_hf` lifted verbatim and run locally, `<scratchpad>/hfprobe/run_xet.py`:

```
R2 url -> None (must be None)          # falls through, does not raise
XET  bytes=605,254,808  15.6s  38.7 MB/s  progress_ticks=16
     part exists=True  stage cleaned=True
sha256: PASS
```

## What shipped

`cubric-vision-pod` wrapper **0.2.43** on the **dev** channel:

- `wrapper.py` — `_download_hf` (subprocess `hf_hub_download`, stage dir at
  `<part>.hfstage` on the same filesystem, 1s progress poll of the largest file under the
  stage, kill on cancel). Dispatch order `_download_hf` -> `_download_httpx` ->
  (non-HF only) `_download_aria2`; `None`/raise both fall through.
- `_is_hf_url` keeps HF out of aria2 — at 1.66 vs 1.74 aria2 is the worse fallback, and
  `--lowest-speed-limit=1M` culls all 16 connections every 30s under a 1.7 MB/s cap.
- `_drop_sparse_part` guards `_download_httpx` for every caller.
- `start-cpu.sh` — guarded, non-fatal `pip install huggingface_hub`. It goes here because
  `start-cpu.sh` IS floated and `bootstrap.sh` is baked; `publish-runtime.sh` ships code,
  not packages.
- `wrapper/requirements.txt` — `huggingface_hub` added so the next image build bakes it.
- `HF_XET_CHUNK_CACHE_SIZE_BYTES=0` (container disk, MPI-483); `HF_XET_HIGH_PERFORMANCE`
  deliberately unset (wants >=64GB RAM).

## Still open

- **Not promoted to stable.** Dev-channel only. Promote after a second clean run.
- **The GPU image is untested on this path.** It already carries `huggingface-hub==1.26.0`
  and `hf-xet==1.6.0` via `python_deps.txt`, so `_download_hf` should engage with no pip
  step — but that is inference, not a measurement. Verify on the next GPU Pod.
- **`_drop_sparse_part` never fired**, on either run. Its unit test passes but no
  production sparse part has exercised it; the Xet path now bypasses partials entirely, so
  it only matters on the httpx fallback.
- Pod `9d0dndbxd2xsh4` LEFT RUNNING (cpu3c). Delete when the fill is done.
- `sdxl-realistic` (6.6GB) was added to the volume as the R2 control and completed before
  it could be cancelled. Real model, harmless, but it was not there before.
