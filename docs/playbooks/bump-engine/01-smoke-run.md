# 01 — The smoke run

> Gate 8 of [README.md](README.md). Executes a minimal generation for **every op** on a
> RunPod GPU Pod, off a network volume that owns every weight. Run it only after gate 7 has
> asserted the Pod reports the new engine version.

```bash
node scripts/smoke-workflows.mjs --plan     # resolve + print the matrix, spend nothing
node scripts/smoke-workflows.mjs            # the real run
```

Requires the app running on `:3000` (`CUBRIC_PORT` if moved) and a RunPod API key in
Settings. The runner drives the app's own routes — `/runpod/gpu-availability`, the volume
CRUD at `routes/runpodRemote.js`, `/remote/*` — so it writes no new API code and exercises
the same path users hit.

## What it does

1. **Resolve the smoke set** from the registry (never a hardcoded list — see below).
2. **Ensure a volume** in `EU-RO-1`, sized from the resolved set. Creates one if absent.
3. **CPU Pod install.** Download-mode Pod, no GPU, pennies. Installs every model in the set
   onto the volume and waits.
4. **Verify the installs** before renting a GPU. A missing weight found at sampling time has
   already cost the expensive half of the run.
5. **Rent the first available preferred GPU** and connect.
6. **Execute every op minimally.**
7. **Report**, then **prompt** on the volume — keep or delete.

## The smoke set — resolved, never hardcoded

Two reductions, both derived from the registry at run time:

- **Dedupe by `class_type` set.** A core bump breaks a *node*; two workflows with an
  identical node set are one test. This is what collapses the five SDXL-family models to
  one, and Chroma / Boogu / LTX / Krea2 to one each. It is sound against the MPI-465 class
  precisely because a broken node breaks both siblings identically.
- **Lowest `sizeTier` per family.** Cheapest member of each group wins.

**Recompute; do not cache these numbers.** As of 2026-08-07 the set resolves to 12 graphs /
~312 GB, dropping to ~281 GB once two in-flight changes land (Wan t2v deprecation, LTX at
int8). Any number written into a doc will be wrong within days — `--plan` prints the live one.

**The execution unit is the OP, not the workflow file.** `klein-4b` alone drives 7 ops
through one graph, branch-selected by `opInject` / `Input_wf_type`. A bump can break one
branch while the others pass, so ~35 ops are executed, not 12 files.

### What the dedupe gives up — state it, do not hide it

Weights that never load: `sdxl-realistic`, `sdxl-nsfw`, `ill-anime`, `pony-mix`,
`chroma1-hd-flash`, `krea2-raw-transformer`, `boogu-edit-transformer-high`,
`ltx23-transformer-bf16`. The residual risk is a break that depends on the weight *format*
under the same loader node. Small, real, and named — not full coverage dressed up as full
coverage.

## The per-op budget

Minimization is **generic, by node title** — walk the graph for `Input_Width`,
`Input_Height`, `Input_Steps`, `Input_Frames` and clamp. This is the same title convention
the injector uses, so it survives graph edits. **Never write a per-graph override table**;
it rots the moment a workflow changes.

| knob | value |
|---|---|
| steps | 1 |
| resolution | smallest **legal** size for the graph — target 128×128, raised to the nearest size the graph's divisibility rules accept |
| frames | fewest legal — target 1s at the lowest fps the graph allows |
| seed | fixed |

Video graphs have dimension and frame-count divisibility rules (LTX and Wan both do), so
128×128 is a target, not a promise. The runner resolves the smallest legal value per graph
and prints what it chose — a budget that silently got weaker is a gate that silently stopped
gating.

## Infrastructure — decided, with reasons

| | value | why |
|---|---|---|
| Datacenter | `EU-RO-1` | Network volumes are DC-locked: a GPU Pod can only mount a volume in its own DC. Create it elsewhere and the cheap cards are unreachable |
| GPU order | **L4 → RTX 3090 → RTX 4090**, first available | Measured availability. An L4 runs every workflow we ship; a 4090 is the reliable fallback. RTX 2000 Ada is skipped — 16 GB and rarely available |
| System RAM | assert ≥48 GB | Weights spill to RAM on a 24 GB card (`footprint.js`). Effectively every EU-RO-1 card has ~54 GB, so this is a guard, not a filter |
| Volume | **separate** from the dev volume | Container disk mirrors volume size ([../../runpod-remote-engine.md:242](../../runpod-remote-engine.md)), so growing the dev volume would make every ordinary dev Pod provision a matching disk |

## What green prints

One line, always all three counts:

```
PASS 33 · SKIP 2 (missing weights: minimax-h3/i2v_ms, wan-22/i2v_ms) · FAIL 0
```

Rules the output must obey:

- **A skip is never folded into the pass count.** This is the whole reason the card exists.
- Any `FAIL` → non-zero exit. `mpi-release` reads that.
- The chosen per-op budget is printed, so a run that got weaker is visible.
- The evidence file records the engine version the Pod actually reported, not the one that
  was requested.

## Scoping a run with `--models` — legitimate, but say so

`--models a,b` is a real option and the cost of the full matrix is real.

**A scoped run still COVERS its family.** The dedupe premise does not care who picked the
member: same workflow file → same `class_type` set → a broken node breaks every sibling
identically. `--models sdxl-realistic` reports `covers sdxl-nsfw, ill-anime-beauty,
ill-anime, pony-mix` exactly as the full run does. What it leaves unproven is the other
**families** — Chroma, Krea2, LTX, Wan, Qwen — not its own siblings.

**The evidence file records that gap.** Without it, `--models klein-4b` writes
`7 pass · 0 fail`, indistinguishable from the full 34-op matrix. `evidence.scope` carries
`modelsRun`, `covers`, `unproven` and `modelsInRegistry`, and `--plan` prints the gap before
anything is rented:

```
    9.0 GB  sdxl-realistic   tier=low  ops=5  covers sdxl-nsfw, ill-anime-beauty, ill-anime, pony-mix
  models 1 · ops 5 · weights 9.0 GB · volume 50 GB

  SCOPED RUN — 14 of 19 models are in no family this
  run touches, so nothing here proves them:
    chroma-flash, chroma-hyper, krea2, krea2-nsfw, …
```

`npm run release:check` **reports** that coverage and does not gate on it — scoping is the
releaser's call. An evidence file from before scope recording is called out as unable to say
what it left out. (`--models` also crashed in `printPlan` before this, so the flag never ran
at all.)

## Cost, and the volume prompt

The runner ends by asking whether to delete the volume, and prints both sides so the answer
is informed rather than a bare y/n:

- **Keep:** ~$20/month at the current size.
- **Delete:** ~281 GB re-downloaded on a CPU Pod next bump — hours of wall-clock, pennies of
  compute.

Bump cadence is every 2–4 weeks, so neither answer is obviously right; it is the user's call
each time.

## Limits — repeat them in the evidence

- **Pod-green is not Windows-green.** Different OS, python, torch and CUDA. Gate 5 in
  [README.md](README.md) is the local half and is not optional.
- The dedupe skips the 8 weights listed above.
- The runner proves a graph *runs*. It does not judge output quality — a bump that silently
  degrades an image passes this gate.

## What the first live run cost — read before changing the install leg

The runner's infrastructure half was written against the routes and never executed until
2026-08-08. Five faults surfaced in one session; all are fixed and guarded, and each is here
because the guard is the only thing keeping it fixed.

| fault | how it presented | the rule now |
|---|---|---|
| No CPU download Pod was created | the log said "installing on a CPU Pod" while `isRemoteActive()` was false — the installs would have landed on the **developer's local disk**, ~300 GB | create the `__cpu__` Pod first, then assert `/remote/mode` is active **before** the first install POST |
| Probe image injected as a local path | `MpiLoadImageFromPath` runs `os.path.isfile` **on the Pod**; every op with a required image would self-gate to "no media" and read as a broken model | upload via `/remote/upload/media`, inject the Pod-absolute path |
| All models POSTed at once | 63 concurrent installs starved a `cpu3c` Pod into 524-ing **every** route including `/health`; the SSE died every 90s, the fill flat-lined near 97 GB, and the app's counters froze at 82.9 GB | install **one model at a time**, drained before the next — the same shape the model manager ships (MPI-184) |
| `/runpod/volumes` returns a bare array | destructuring `{volumes, networkVolumes}` off it yielded an empty list, so a **new 350 GB volume was created on every run** — three existed before it was caught | read the array; refuse to guess between same-named volumes and take `--volume <id>` |
| Install POSTed inside the wrapper's 404 window | a cold `-cpu` Pod answers `/health` before `/wrapper/models/install` exists; all 12 LTX deps died in 0.2s while later models were fine | one retry round per model before the hard fail |

Two habits behind all five: **the response shape of a route is one `curl` away — never infer
it**, and **a Pod that reports `RUNNING` proves nothing about its wrapper.** The frozen
progress counters are the trap worth remembering: they are SSE-fed, so a dead reporter is
indistinguishable from a stalled download unless you look at the Pod itself.

## The second live run — four more, three of them in the GPU leg (2026-08-08)

The install leg finally ran. These came out of it, and the last two were found by **reading
the GPU half before renting anything** — it had still never executed at that point.

| fault | how it presented | the rule now |
|---|---|---|
| Preflight compares the estimate to volume TOTAL, never FREE | `weights 300.5 GB · volume 350 GB` printed clean, then the fill died at **model 9 of 12** with `[Errno 28] No space left on device` after ~40 minutes and two rented Pods | check measured FREE bytes against the remaining requirement, with headroom, and refuse to rent otherwise. The estimate itself is guesswork — see MPI-482 |
| GPU Pod created with no watchdog | a bare `/remote/pod/create` + a hard 20-minute `waitReady`; `die()` is `process.exit(1)` and deletes **nothing**, so a dead host cost 20 idle minutes and then **LEAKED A RENTED GPU**, billing until a human noticed | route it through `createPodWithRetry`, exactly like the CPU Pod. 2 attempts, not 3 — each attempt is billed GPU time |
| `pickGpu` matched names by SUBSTRING | `'L4'` also matches **L40** and **L40S**, `'RTX 3090'` also matches **3090 Ti** — a pricier card rented silently. L4 sorting first in RunPod's array is luck, not logic | exact match on `displayName` |
| `pickGpu`'s stock guard could NEVER fire | `g.stockStatus == null \|\| ...` — the payload has **no `stockStatus` field at all**, so the guard was always true and stock was never checked | use `lowestPrice` being non-null, measured as the real signal: MI300X reports nulls; L4/3090/4090 reported 55/30/31 |

**EU-RO-1 flakiness is the datacenter, not the image — stop re-diagnosing it.** Five CPU
Pods across two sessions reported `RUNNING` with a container that never started. Proven by
three consecutive attempts on the *same* image, channel and volume where the third came up:
an image or runtime fault cannot succeed on the third identical try. **Budget 2-3 wasted Pod
boots (~5 min each) before the fill starts.** That is normal here, not a fault to debug, and
the boot watchdog exists to absorb it — it fired twice unattended and was right both times.

**A guard armed on a field that does not exist is worse than no guard**, because it reads as
coverage. Two of the four above are that shape. When you write a guard against a remote
payload, `curl` the payload and confirm the field is actually in it.

Related: the hero's GPU label comes from `cfg.gpuType` in Settings, not from the connected
Pod, so a Pod created outside Settings (this runner) makes the status bar claim the last GPU
you picked. Cosmetic, and only reachable from here.
