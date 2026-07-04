# Pod vs Local Perf — the 40GB re-faults at EVERY stage (cold AND warm); the fix is to keep it resident through the stage transition

> ## ✅ RESOLVED 2026-07-04 (MPI-187) — cu130 IS THE FIX. ~10× fault-in collapse. READ THIS FIRST; EVERYTHING BELOW IS SUPERSEDED HISTORY.
>
> **The LTX Pod slowness was the CUDA TOOLKIT GENERATION, not aimdo, not VRAM, not disk, not the torch version.** Live-proven on RunPod's official `runpod/comfyui:cuda13.0` image (RTX 5090, torch **2.10.0+cu130**, CUDA **13.0**, driver **580.159**, py3.12), running the **SAME comfy-aimdo 0.4.10 + ComfyUI 0.26** we ship:
>
> | metric | old Pod (cu126/cu128, torch 2.8–2.11) | **cu130** |
> |---|---|---|
> | stage-1 fault-in (40GB LTXAV) | **108–127 s** | **~11 s** |
> | full t2v | ~90–110 s | **49.5 s** |
> | full i2v + continue (multi-stage) | ~4–5 min | **74 s** |
> | per-stage re-fault | ~34–58 s | **~12–26 s** |
>
> **Why the whole investigation below missed it:** it declared victory by ELIMINATION over the axes it could measure (VRAM, RAM, disk, torch-minor) and wrote off cu130 on the WRONG axis — cu130's *cuBLAS GEMM compute* gains are Blackwell-only, so "cu130 = zero benefit, do not do." **It never tested the cu130 *fault-hook / UVM* path.** That path is the entire fix. Sharpened: it is NOT the torch version (torch 2.11+cu126 moved the fault-in 0%; torch **2.10**+cu130 — a LOWER minor — collapsed it 10×). It is the **+cu130 build / CUDA-13 toolkit / driver-580 UVM fault path**.
>
> **Consequences (all carded):** (1) **Rebuild the product Pod image on a single cu130 base** — collapse the cu124/cu128 two-profile split into ONE cu130 image (4090 Ada sm_89 + 5090 Blackwell sm_120 both run cu130; coverage loss is negligible — live-checked the RunPod deploy list). MPI-189. (2) `allowedCudaVersions:["13.0"]` driver-floor guard is a HARD PREREQ (a cu130 image crashes on <r580 hosts). MPI-188. (3) The GGUF-on-Pod transformer (MPI-168) existed ONLY to dodge the cold tax — with the tax now ~11s, **revert the Pod to bf16** (better quality, kills the MPI-185 dequant OOM). MPI-190. (4) warm-on-connect (old MPI-157) is now moot — the cold tax it hid is ~11s.
>
> **Everything from the next line down is the pre-cu130 investigation.** It is CORRECT history (the eliminations were real) but its conclusion ("cu130 off the table", "torch is the only lever", "Fix #3 pin-resident is the only hope") is WRONG — kept for the reasoning trail, not for action. Do NOT re-run the dead-ends it lists; do NOT trust its "do not cu130" verdict.
>
> ---

> **★ GGUF-ERA DATAPOINT (2026-07-03, 24GB 4090 Pod, v0.11.0-cu124 / ComfyUI v0.27, MPI-185 / MPI-148 verify).**
> This is the FIRST perf datapoint on the shipped **Q8_0 GGUF** LTX path (MPI-168) — everything below is the OLD 40GB bf16 era. Timeline (app.log): 21:16:08 Pod create → 21:26:55 first history (~11min boot + ~40GB LTX weight load from network volume) → 21:39:03 OOM. So the "LTX ~8 min click→about-to-generate" the user saw was mostly **boot + weight-load**, not gen. Comparators same session: **Wan 5B ~2 min gen**; user **LOCAL Wan ~20s + ~1min warm**. Cloud 4090 still far slower than local — consistent with the standing "cloud 4090 not faster than local 4060Ti" finding; open suspects unchanged (aimdo overhead + host P-State throttle). NOTE the LTX gen itself never completed here (OOM'd in GGUF dequant — see MPI-185), so this is a boot/load datapoint, not a warm-gen number for the GGUF path. A clean GGUF warm-gen number still needs a 32GB 5090 (cu128) run.
>
> **★ CORRECTED RESOLUTION (live-proven 2026-06-28, RTX 5090 Pod — supersedes the
> earlier "warm-resident = 36s" claim, which was a MISLABEL). READ THIS FIRST.**
>
> The earlier banner said warm gens stay fast (36-45s) because the 40GB stays resident.
> **That was wrong.** Re-tested live on a 5090 Pod (v0.10.3-cu124, ComfyUI 0.26, aimdo)
> with airtight timing: aimdo **re-faults the 40GB LTXAV transformer at EVERY stage of
> EVERY gen** — cold and warm alike. The `Requested to load LTXAV` + `Model LTXAV
> prepared for dynamic VRAM loading. 40050MB Staged` lines print on stage-1 AND stage-2
> of every single gen, even when the model was resident in VRAM seconds earlier
> (status bar showed VRAM 25.5/32GB resident, yet stage-2 still re-staged). So there is
> **no free warm gen** — there is a per-STAGE re-fault you pay each time.
>
> **What the old "45s warm" number actually was:** the **stage-2 / continue part ALONE**
> of a multi-stage gen — measured `Prompt executed in 44.78s`, of which **~34s is the
> first sampler step = the stage-2 re-fault of the 40GB**, and only ~10s is real sampler
> work. It was never a full warm gen. Corrected measured numbers:
>
> | what | wall time | breakdown |
> |---|---|---|
> | **1st gen, cold (i2v 5s/1K)** | **~5:45** | one-time-ish per session (also a per-stage fault) |
> | **single-shot t2v 1s/1K, "warm"** | **~90s (1:28-1:31)** | stage-1 + ~40s transition re-fault + stage-2 |
> | stage-2 / continue part ALONE | **44.78s** | ~34s = re-fault (first sampler step) + ~10s sampler+upscaler |
> | full multi-stage card (preview+continue) | **1:15** | ~30s preview + ~46s continue |
>
> **The lever is the per-stage re-fault, NOT a one-time cold tax.** ~34-40s of every
> stage-2 is reloading a model that was already in VRAM. Kill the stage-transition
> re-fault → the continue part drops from ~45s to ~11s. (Node 58 is NOT the cause —
> removing it made it WORSE, see below. The cause is aimdo evicting the model between
> ComfyUI subgraphs.)
>
> **PRODUCT REFRAME (user's call, 2026-06-28):** the multi-stage split is a FEATURE,
> not just a cost. Stage-1 preview (~30s) shows motion cheaply → user picks the best of
> several previews → pays the ~46s continue ONLY on the keeper. Sell it as
> iterate-cheap-commit-once. This makes the per-stage cost a deliberate gate, not waste.
>
> **THE COLD-LOAD ROOT CAUSE (still true, just no longer the headline):** RunPod
> containers cap `RLIMIT_MEMLOCK` at **8MB** (hard, set at container launch, NOT raisable
> via RunPod's REST `/pods` API — no `dockerArgs`/ulimit field; GraphQL `dockerArgs` is
> entrypoint-args not docker-flags; open RunPod feature req #338 = unsupported). aimdo
> pins host memory to stage the 40GB; the 8MB cap throttles pinning to ~1 GB/s, AND the
> per-page fault MECHANISM itself is slow regardless of pinning. Local has 26GB pinnable
> (no cap) → cold ~28s. Proven by direct A/B: same model+engine+aimdo, local stage-1
> fault 28s vs Pod 108s — ONLY the memlock differs. (Upstream ComfyUI issue #14345 = same
> LTX-2.3 regression since the aimdo bump in 0.24, multiple users.)
>
> **FLAGS THAT DON'T FIX IT (both tested live, DEAD — do NOT re-try):**
> `--disable-async-offload` (made it worse, sync stalls) and `--disable-pinned-memory`
> (no change — proves the per-page fault mechanism, not pinning speed, is the cost).
> No ComfyUI flag fixes the cold fault. Downgrading to 0.25.1 does NOT help either:
> 0.25.1 ALSO ships aimdo 0.4.10 + comfy-kitchen (verified from its boot log) → same cap
> behavior on a Pod. The fast-0.25.1 memory was LOCAL (no cap), not a version effect.
>
> **fp8 transformer = REJECTED for quality (2026-06-28):** Kijai fp8_input_scaled_v3
> (~23-25GB) loads ~half the time AND fits 32GB cards, but produces visible eyes/teeth
> degradation across seeds in this workflow (faces are the product's core). bf16 stays.
> (mxfp8 = Blackwell-only native; emulated/slow on Ada — not a cross-card option.)
>
> **→ THE TWO REAL LEVERS (both keep bf16 quality + 0.26, neither a blocker):**
>
> 1. **FORCED WARM-UP / cold-prime on connect** (hides the one-time cold tax): after a
>    Pod connects + ComfyUI is ready, fire a throwaway gen in the background and
>    **interrupt it the moment the stage-1 sampler emits its first step** (we already get
>    that signal via the `comfy:step` SSE). That faults the 40GB into VRAM (paying the
>    cold tax invisibly) without wasting time finishing a full gen → the user's first
>    real gen starts already-warm. Cleaner than running a whole throwaway gen.
>    (User's framing: "let it reach the first sampler and stop, then it's warm.") This is
>    MPI-157 OPT 1, refined. App-side, no rebuild.
>
> 2. **PIN THE 40GB RESIDENT THROUGH THE STAGE TRANSITION** (the bigger win, untested):
>    stage-2 re-faults the 40GB even though stage-1 just had it resident — ~34s of every
>    continue is that re-fault. On cards with VRAM headroom (5090=32GB, model≈25.5GB → it
>    fits with room) we want aimdo to NOT evict between stage-1 and stage-2. This is an
>    aimdo/ComfyUI residency hint, **gated to big cards only** (24GB cards genuinely can't
>    hold it through both stages → keep the evict there). This is NOT the node-58 path
>    (that's disproven below); it's preventing the eviction aimdo does on its own.
>    Drop the continue from ~45s → ~11s where it fits. NEEDS LIVE TEST + a per-card VRAM
>    floor.
>
> **~~3. Remove `MpiClearVram` node 58~~ — DISPROVEN LIVE 2026-06-28 (5090 Pod), do NOT
> re-try.** The hypothesis was BACKWARDS. Bypassed node 58 (rewired stage-1-latent
> consumers 104+126 from `["58",0]` → `["52",0]`, orphaning 58) and ran a warm t2v
> 1s/1K single-shot gen: **119s vs ~90s with node 58 IN (2.6× the bad-step time, ~1.3×
> the full gen — SLOWER either way)**. The first stage-2 sampler step took **69 s/it**
> (vs ~34 s/it with node 58 IN). Root cause: aimdo re-stages the 40GB at stage-2
> *regardless* of node 58 (`40050MB Staged, 0 patches` printed even when 58 was orphaned).
> What node 58 (`unload_all_models()`) actually does is **cleanly evict stage-1's VRAM so
> the stage-2 fault lands on a clean slate**; without it the stage-2 fault thrashes
> against stage-1's still-resident pages → 69s/it. So node 58 is **load-bearing for
> SPEED**, not the cause of the transition pause. Note this is in tension with lever 2
> (pin-resident): node 58 helps because it gives a CLEAN re-fault; lever 2 would avoid the
> re-fault entirely. They are different mechanisms — lever 2 must be tested with node 58
> still in place. Wan's 3 MpiClearVram nodes serve the same protective role.
> **Keep node 58. The LTX_t2v.json edit was reverted (clean against HEAD).**
>
> **DEAD ENDS (do NOT re-investigate — all proven this arc):** bigger VRAM card (96GB
> still cold-faulted), torch bump (2.8→2.11 no change), disk/network-volume (read_bytes=0),
> the two pinning flags above, fp8 (quality), downgrade (0.25.1 has aimdo too), raising
> memlock (no RunPod API), AND removing MpiClearVram node 58 (2.6× SLOWER, it is
> load-bearing for speed — see above). The ONLY remaining lever is warm-on-connect; the
> cold fault itself is acceptable as a one-time tax.
>
> ---
>
> **ROOT CAUSE (live-proven 2026-06-27):** the cloud 4090 loses to the local
> 4060Ti on LTX-2.3 ENTIRELY because of the per-stage **aimdo dynamic-VRAM
> fault-in of the 40GB LTXAV transformer**, NOT compute. Live per-phase split on a
> cold Pod LTX gen (`Prompt executed in 250.34s`):
>
> | Phase | Pod 4090 | Local 4060Ti | who wins |
> |---|---|---|---|
> | Stage-1 fault-in (40GB → VRAM) | **108.19 s** | 34 s | local 3.2× |
> | Stage-1 sampler (7 steps) | 1.45 s/it (~10s) | 4.6 s/it (~32s) | **Pod 3×** |
> | Stage-2 fault-in (40GB → VRAM) | **58.66 s** | 28 s | local 2× |
> | Stage-2 sampler (3 steps) | 1.3 it/s (~6s) | 2 s/it (~6s) | Pod |
>
> The two fault-ins = **167s of the 250s gen (~67%)**. The Pod SAMPLER is FASTER
> than local — compute was never the problem. WHY the fault-in is slow: the 40GB
> model does NOT fit resident in 24GB VRAM → aimdo faults it in per stage; and the
> Pod's RAM is too small to fully cache it (live: 23GB used of 46GB RAM, VRAM pinned
> 23.1/24) → fault pages partly stream from the **1.0 GB/s network volume**
> (measured by `dd`, 42GB in 42s) instead of from RAM. 40GB / 1 GB/s ≈ 40s floor,
 stacked with VRAM-ceiling evict-thrash → 108s.
>
> **LOCAL SPEC (verified, do not re-ask): 64GB DDR5 @ 4000 MT/s, ~20GB baseline →
> ~43GB available; model on an NVMe SSD (C:, PCIe). Python 3.13.12 / torch 2.12.0 /
> CUDA 13.0.** Pod free RAM (~43-46GB) ≈ local's ~43GB — RAM size is NOT it.
>
> **CORRECTION — it is NOT transfer/disk/bus bandwidth either (measured 2026-06-27):**
> On a Pod 4090 the host→VRAM copy is FULL SPEED: **pinned 25.7 GB/s, pageable 19.5
> GB/s, PCIe Gen4 x16.** 40GB at 25.7 GB/s = **~1.6 seconds.** The fault-in took
> **108 seconds — 65× longer than the raw transfer.** So the 108s is NOT memcpy, NOT
> the 1.0 GB/s volume (the model is already "Staged" to RAM before init prints), NOT
> PCIe. It is **aimdo's page-fault-in MECHANISM overhead** — aimdo hooks CUDA
> (`cuda-detour.c`) and faults weights page-by-page on first access; the cost is the
> per-page fault-handler / UVM bookkeeping, not the bytes. **This is stack-version-
> sensitive:** the CUDA driver's UVM/fault path + torch's allocator changed cu126→
> cu130 / torch 2.8→2.12, so local (torch 2.12 / cu130 / py3.13) faults far faster
> than the Pod (torch 2.8 / cu126 / py3.11). This is the ONE axis the cu130 deep-
> research never covered — it cleared cuBLAS GEMM *compute* gains (Blackwell-only),
> NOT the fault-hook path. The earlier "1 GB/s volume" explanation in this doc is
> SUPERSEDED by this measurement.
>
> **FIX — Fix #1 (bigger VRAM) is now DEAD-TESTED. ONLY Fix #2 (torch stack) remains:**
> 1. ~~**Don't fault at all — model resident in VRAM (48GB card)**~~ **— DISPROVEN
>    LIVE 2026-06-27 on an RTX PRO 6000 Blackwell (96GB VRAM, 283GB RAM, torch
>    2.8+cu128, sm_120).** With the 40GB model fitting VRAM 2× over and RAM caching
>    it 7× over, the stage-1 fault-in was **`Model Initialization complete! 119.34
>    s/it`** — IDENTICAL to (slightly WORSE than) the 24GB 4090's 108s. Total
>    `Prompt executed in 195.51 seconds`. Throwing unlimited VRAM+RAM at it changed
>    NOTHING → the fault-in is NOT memory-bound, NOT VRAM-fit. It is the aimdo
>    per-page fault-handler MECHANISM on torch 2.8, full stop. This eliminates the
>    LAST memory variable (VRAM size) by brute force. **Do NOT spin a big card to
>    fix this — proven not to work.**
> 2. **Bump torch 2.8 → 2.12 on the Pod, KEEP cu126 (NO cu130, NO driver-floor cost):**
>    the fault-in is the aimdo page-fault MECHANISM, which is torch-version-sensitive
>    (proven: 96GB VRAM didn't help → not memory; the only stack diff vs local is
>    torch 2.8 vs 2.12). **KEY FINDING 2026-06-27: `torch-2.12.1+cu126-cp311` EXISTS
>    on the PyTorch index** (verified — also 2.9.1/2.10.0/2.11.0 +cu126). So we can
>    take the torch-2.12 framework fix (allocator / UVM-fault path) **on the cu126
>    wheel**, keeping the wide ~r560 driver floor. **The cu130 r580-floor tradeoff the
>    deep-research agonized over is SIDESTEPPED** — local's speed comes from torch
>    2.12's framework, NOT cu130 the toolkit (the cu130 cuBLAS gains were Blackwell-
>    only / Ada-neutral anyway). This is the JUSTIFIED torch-bump test by ELIMINATION
>    (bus/disk/RAM/VRAM/compute all cleared), NOT the cuBLAS-GEMM angle. **Measure the
>    fault-in gain FIRST** on a throwaway torch-2.12+cu126 venv + a fault-in micro-
>    benchmark on a CHEAP Pod (a 24GB card is plenty — VRAM size is irrelevant, proven
>    above) BEFORE any image rebuild.
> (Dropped: "more RAM" — equal RAM still wins. Dropped: "faster disk / pre-warm
>  volume" — the host→VRAM copy is 25.7 GB/s, the volume read is not the bottleneck;
>  the 108s is fault-handler overhead, not bytes moved.)
>
> The mechanism is aimdo's PAGE-FAULT-IN overhead (per-page fault-handler / UVM
> bookkeeping), NOT bytes moved — proven by: host→VRAM = 25.7 GB/s pinned / PCIe
> Gen4 x16 → 40GB would copy in ~1.6s, but the fault-in took 108s (65×). It is
> stack-version-sensitive (CUDA UVM + torch allocator changed cu126→cu130 / torch
> 2.8→2.12), which is why local (torch 2.12/cu130) faults 3× faster.
>
> RULED OUT (do NOT re-try): cu130 cuBLAS GEMM *compute* (Blackwell-only — but the
> cu130 *fault-hook* path was NEVER tested, that's fix #2); host throttle (165
> TFLOPS/P0); aimdo-disable (OOM, twice); fp8 (identical already); torch-broad-
> compute (SDXL on the Pod is FAST, 2s vs local 12s); Triton/PatchTritonVAE (not in
> the workflow); transfer/disk/PCIe bandwidth (25.7 GB/s, Gen4 x16 — NOT the cause);
> **VRAM size / model-resident (DISPROVEN 2026-06-27 on a 96GB RTX PRO 6000 — fault-in
> still 119s, see below).** Deep-research (108-agent) + live-tested 2026-06-27.

## FIX #1 DISPROVEN — 96GB RTX PRO 6000 test (2026-06-27)

The "bigger VRAM so the model is resident and aimdo never faults" fix was tested
live on the biggest card available and **failed**.

| | RTX PRO 6000 Blackwell | 24GB 4090 (baseline) |
|---|---|---|
| VRAM | **97887 MiB (~96GB)** | 24GB |
| System RAM | **283GB (2148GB reported free)** | ~57GB |
| driver / torch / CUDA | 580.159.04 / **2.8.0+cu128** / 12.8, sm_120 | r580 / 2.8.0+cu126 / 12.6 |
| Stage-1 fault-in | **119.34 s** | 108.19 s |
| Total gen | **195.51 s** (`Prompt executed`) | 250.34 s |

The 40GB model fits VRAM **2× over** and RAM caches it **7× over** — yet the
stage-1 fault-in was **119s, identical-to-slightly-WORSE than the 24GB card's
108s.** Live status bar confirmed it: VRAM climbed **slowly** (35.9 → 40 → 44GB
over 2+ minutes) instead of slamming resident in ~1.6s (which 96GB + 25.7 GB/s
PCIe could trivially do). That slow climb IS the per-page fault-in — visible to
the eye, memory-headroom-independent.

**Conclusion: the fault-in is NOT memory-bound on any axis.** VRAM size was the
last untested memory variable; 96GB killed it. The cost is purely aimdo's
per-page fault-handler / UVM bookkeeping on **torch 2.8** (this Pod was torch
2.8+cu128 — same 2.8 as the slow cu124/cu126 image, just a different CUDA
toolkit + Blackwell arch). The CUDA toolkit + arch differences (cu126→cu128,
Ada→Blackwell) did NOT speed the fault — consistent with the cause being the
**torch 2.8 → 2.12** framework jump (the allocator / UVM-fault path), NOT the
CUDA toolkit version. **Fix #2 is now the only remaining lever, proven by full
elimination.**

> NOTE this Pod was the **cu128** image profile (Blackwell), our first live run of
> it — distinct from the cu124/cu126 profile we'd been testing. Both are torch
> **2.8**; the only profile diffs are the torch CUDA wheel (cu126 vs cu128) + the
> sage build arch. Sage ran ON for sm_120 (intended, MPI-145). None of that
> touches the fault-in path — the 119s confirms the fault cost is torch-2.8-bound,
> toolkit/arch-independent.

## FIX #2 BUILD — v0.10.4 images (torch 2.8 → 2.11), built + pushed 2026-06-28

Both Pod image profiles rebuilt with the torch bump to test the fault-in fix.
**torch 2.12 was NOT usable: torchaudio 2.12 is not published on any cu12x
channel (cu126/cu128 torchaudio both top out at 2.11.0).** So pinned the highest
COMPLETE trio = **torch 2.11.0** (3 minors past the 2.8 aimdo floor — exercises
the new allocator / UVM-fault path):

| Tag | torch / cuda | sage | pushed |
|---|---|---|---|
| `v0.10.4-cu124` | **2.11.0+cu126** / 12.6 | OK (sm_86;sm_89) | ✅ publicly resolvable |
| `v0.10.4-cu128` | **2.11.0+cu128** / 12.8 | OK (sm_120) | ✅ (Blackwell) |

Both keep their existing driver floors (cu126 ~r560, cu128 ~r570) — NO cu130, NO
r580 cost. `v0.10.3` retained for rollback. mpi-ci commits: `65e112b` (initial
2.12.1 attempt) → `d1e8643` (cu124 → 2.11.0, torchaudio fix) → `69402e8` (cu128 →
2.11.0). UNPUSHED to git (user-gated); Docker images ARE pushed to GHCR.

**THE TEST (next Pod boot — answers two questions at once):**
1. **Does aimdo 0.4.10's compiled hook layer LOAD under torch 2.11's ABI?** Boot
   log must show `comfy-aimdo inited` + `DynamicVRAM support detected and enabled`.
   If it shows `Falling back to legacy ModelPatcher` → aimdo broke on 2.11 →
   revert to 2.8 (the bump is then blocked until a newer aimdo).
2. **IF aimdo loads:** run an LTX gen, read the stage-1 fault-in (`Model
   Initialization complete! Xs/it`). Baseline = **108s (torch 2.8)**. If 2.11
   faults in **< ~60s** → Fix #2 PROVEN, the torch framework was the lever.
   Compare to local's torch-2.12 ~34s — 2.11 may land between.

**IF 2.11 doesn't fault as fast as local's 2.12:** the next step is torch 2.12 on
a cu128 base — but the FULL 2.12 trio still needs torchaudio 2.12 to publish, OR
drop torchaudio (check if the LTX pipeline actually imports it; the LTX audio VAE
is ComfyUI's own, not torchaudio). Prove 2.11 first — it's already built.

## FIX #2 RESULT — torch 2.11 did NOT fix the fault-in (live, L4, 2026-06-28)

Deployed `v0.10.4-cu124` (torch **2.11.0**+cu126) on an L4 (24GB VRAM, 62GB RAM —
RAM-matched to local's 64GB, VRAM-matched to the baseline class). Clean isolation:
same ComfyUI 0.26.0 / aimdo 0.4.10, ONLY torch changed (2.8 → 2.11).

**Question 1 — does aimdo load on 2.11? YES.** Boot log: `cuda-funchooks.c …
aimdo_setup_hooks: hooks successfully installed` + `comfy-aimdo inited for GPU:
NVIDIA L4` + `DynamicVRAM support detected and enabled`. No legacy fallback. The
compiled-hook ABI concern was unfounded — aimdo 0.4.10 runs clean on torch 2.11.

**Question 2 — did it speed the fault-in? NO.**

| torch | GPU | stage-1 fault-in |
|---|---|---|
| 2.8 | 4090 24GB | 108 s |
| 2.8 | RTX PRO 6000 96GB | 119 s |
| **2.11** | **L4 24GB** | **126.17 s** |
| 2.12 (local) | 4060 Ti 16GB | ~34 s |

`Requested to load LTXAV` 09:36:29 → `Model Initialization complete! 126.17s/it`
09:38:46 = **~127s** — SAME ballpark as torch 2.8 (108/119), if anything slightly
worse (L4 is a weaker card, but fault-in isn't compute-bound, so that shouldn't
matter). **The torch 2.8 → 2.11 jump moved the fault-in by ~0%.**

**CONCLUSION: the torch framework version (2.8→2.11) is NOT the lever.** Three
minors gained nothing. For 2.12 to then produce a 127s→34s (≈4×) cliff in ONE
more minor is implausible — so the "just bump torch" theory is now WEAK, not
proven. The Pod stack (2.11/cu126/py3.11) still faults ~3.7× slower than local
(2.12/cu130/py3.13), but we've now ruled out the torch-version axis as the
explanation.

### What's left — the axis we NEVER controlled: model source disk
Local faults from a **local NVMe SSD** (C:, PCIe). The Pod faults from a **1 GB/s
network volume** (`/workspace`). Even though aimdo prints "Staged" (implying RAM),
the per-page fault handler may still touch the backing store on first access —
and on the Pod that backing store is the slow network volume, on local it's NVMe.
This is the ONE big environmental difference never isolated:
- bus/PCIe — cleared (25.7 GB/s)
- VRAM size — cleared (96GB = same 119s)
- RAM size — cleared (62GB L4 RAM-matched, still 127s)
- torch version — cleared NOW (2.8→2.11 = no change)
- compute — cleared (sampler faster on Pod)
- **model-source disk (NVMe vs 1GB/s network volume) — NEVER tested.**

NEXT TEST (free, no rebuild): on a Pod, copy the LTX model set from the network
volume to **local container disk** (or `/dev/shm` tmpfs if it fits) and re-run —
if the fault-in drops toward local's ~34s, the network volume was the cause and
the fix is "stage models on fast local disk, not the network volume." Other
remaining (smaller) suspects: cu130 toolkit specifically, py3.13, or a Linux-vs-
Windows aimdo UVM path difference. But disk-source is the biggest uncontrolled
variable — test it first.

> torch 2.11 images (`v0.10.4`) are harmless to keep (aimdo works, no regression)
> but offer NO perf win over `v0.10.3` (2.8). Don't bother shipping v0.10.4 as a
> perf upgrade — it isn't one. Keep v0.10.3 as the shipped tag unless another
> reason to move.

## DISK = DEFINITIVELY CLEARED — `read_bytes: 0` during the entire fault-in (2026-06-28)

The last uncontrolled axis (model-source disk: Pod's 1 GB/s network volume vs
local NVMe) was tested DIRECTLY by watching the ComfyUI process's I/O counters
(`/proc/<main.py PID>/io`) during a live LTX gen's fault-in on the L4 Pod:

| counter | meaning | observed during fault-in |
|---|---|---|
| `read_bytes` | bytes from the **physical block device** (disk / network volume) | **0 — flat, never moved** |
| `rchar` | bytes via read() syscalls (served from **RAM page cache**) | climbing ~0.5–1 GB/s |

**`read_bytes` stayed at 0 for the WHOLE init.** The fault-in reads ZERO bytes
from disk — the model is already in the OS page cache (RAM), and every fault page
is served from RAM, not the volume. **This conclusively clears disk / the network
volume / volume-age/fragmentation** — the slow phase never touches storage. (Also
explains why the earlier `dd` 1 GB/s sequential number was a red herring: the
fault never reads the disk at all, sequentially or randomly.)

**What `rchar` reveals is the real bottleneck:** the fault-in pulls pages
RAM→process at only **~0.5–1 GB/s effective**, despite raw RAM/PCIe bandwidth
being 25+ GB/s. That ~25× gap IS the per-page fault-handler cost — syscall +
page-table walk + UVM bookkeeping per 4KB page, serialized. 40GB at ~0.5–1 GB/s ≈
40–80s, matching the measured 55–127s fault phases. **The cost is pure
fault-mechanism overhead moving cached bytes, NOT I/O.**

### FINAL elimination — every external axis is now ruled out by direct measurement
bandwidth (25.7 GB/s) · VRAM size (96GB = same) · RAM size (62GB matched = same) ·
compute (sampler faster on Pod) · torch version (2.8→2.11 = no change) · **disk /
network volume (`read_bytes`=0 — never read)**. The ONLY remaining difference
between local (34s) and Pod (127s) is the **per-page fault-handler efficiency of
the environment itself** (Linux/py3.11/cu126/driver vs Windows/py3.13/cu130/driver)
— not movable by a torch pin, a bigger card, or a faster disk.

### → The real lever is ARCHITECTURAL, not environmental: stop re-faulting (Fix #3)
Since the fault cost is intrinsic per-page overhead and the 40GB LTXAV is
(re)faulted at EACH stage boundary, the win is to **fault it ONCE and keep it
resident across stage-1 → stage-2** so the second 55–60s fault never happens.
aimdo stays ON. This is the only lever left that we control — environmental
fault-path efficiency is not something the image can change.

### ☠️ `--vram-headroom` DISPROVEN on the Pod GGUF path (2026-07-04, 24GB 4090 Pod) — does NOT fix the MPI-185 OOM. DO NOT RE-TRY.

**The local "proof" was on bf16 and did not transfer.** `--vram-headroom=1` was baked into
start.sh (≤24GB gate), published to R2 stable, and live-run on a real 24GB 4090 Pod against the
actual Q8 GGUF path. Boot log confirmed it applied (`[cubric] VRAM: 24GB-tier default
--vram-headroom=1 … detected 23GiB`; `start_sha256` matched the published manifest; ComfyUI parsed
the flag and booted clean). **It OOM'd anyway, with numbers identical to the no-flag run:**
```
LTXVNormalizingSampler failed: torch.OutOfMemoryError
Currently allocated : 22.58 GiB   (no-flag run was 22.53)
Requested           : 576.00 MiB
Device limit        : 23.64 GiB
Free (CUDA)         : 4.81 MiB
```
The flag was **inert** — aimdo still filled VRAM to the same ~22.6 GiB ceiling; the +576MB
`dequantize_blocks_BF16` spike still had no room. VRAM plateaued at 23.6/24 and RAM climbed
(offload was happening) right up to the OOM — so aimdo WAS offloading, just not leaving the
dequant its headroom.

**WHY it doesn't transfer (the mechanism gap):** `--vram-headroom` reserves headroom against
**aimdo's own managed staging/inference working set**. Local proved exactly that — on **bf16**,
headroom 4 capped the aimdo-managed inference peak 14→11GB. But the GGUF OOM is a **raw `torch`
allocation inside a custom node** (`ComfyUI-GGUF/dequant.py:62`, `int16→int32→float32` upcast)
that fires DURING the forward pass, AFTER aimdo has already staged the transformer to the
watermark. aimdo's "keep N GB free" fences its own pool, not a third-party node's transient
upcast on top of it. So headroom is structurally the wrong knob for THIS OOM — bf16 (no dequant)
was never the failing path, and capping it proved nothing about the GGUF one. **The handoff's
own caveat ("local proved the flag MECHANISM only … local CANNOT reproduce the GGUF dequant
spike") turned out to be the decisive fact.**

**STILL LIVE on 24GB → escalate to the real levers (plan.md ranked fixes 2-4):** the OOM is
GGUF-dequant-specific and at stage-1 sample time (`LTXVNormalizingSampler` = `Stage1_Bypass`),
so the fix must attack the dequant working set, not aimdo headroom. Order of shots:
1. **Lower res/tier on 24GB** — fewer latent tokens = smaller working set when the dequant fires.
   May just document "24GB caps at tier X" (cheap, quality-preserving within the cap).
2. **Smaller quant on the 24GB tier** — Q6_K (17.8GB) / UD-Q5_K_M (18.2GB) leave real headroom so
   the +576MB fits. Cost: per-tier workflow/dep split (engine rule is single GGUF today) + a
   face-quality A/B (Q8 was near-lossless; Q6/Q5 unproven on LTX faces).
3. **bf16 (non-GGUF) transformer on 24GB** — no dequant at all, but re-enters the 40GB aimdo
   cold-fault tax (the reason GGUF was chosen). Regressive; last resort.
Do NOT chase more aimdo flags for this — `--vram-headroom`/`--reserve-vram` reserve against the
wrong allocator. `--vram-headroom` is baked in start.sh right now (≤24GB) doing nothing useful;
**revert it or repoint it to whichever real fix wins** (next session, needs another R2 push).

### Fix #3 — the FLAG SURFACE (probed live 2026-06-28, RTX PRO 4000, v0.10.3)
`python /opt/ComfyUI/main.py --help` under aimdo exposes these dynamic-VRAM knobs:

| flag | help text (verbatim) | use for Fix #3 |
|---|---|---|
| `--highvram` | "By default models will be unloaded to CPU memory after being used. This option **keeps them in GPU memory**." | THE direct "don't re-fault" knob — but ☠️ OOMs on 24GB (40GB model > VRAM). SAFE only where the model FITS (48GB+). |
| `--reserve-vram N` | "Set the amount of vram in **GB** you want to reserve for use by your **OS/other software**." | OS carve-out; blunter |
| `--vram-headroom N` | "Set the amount of vram in **GB** for **DynamicVRAM to maintain as extra headroom above default**. ComfyUI will try and keep this much VRAM completely free." | ☠️ **DISPROVEN for the GGUF-dequant OOM** (Pod-tested 2026-07-04, OOM'd unchanged — reserves aimdo's pool, not the custom-node dequant alloc). See disproof section above. |
| `--cache-ram [GB]` | "Use RAM pressure caching with the specified headroom" | RAM-side cache; the current default |
| `--cache-none` | "Reduced RAM/VRAM usage at the expense of executing…" | OPPOSITE — don't use |
| `--fast-disk` | "Prefer disk-backed dynamic loading and offload over instead of keeping models in vram when it can." | OPPOSITE (more offload) — don't use |
| `--async-offload [N]` | N streams | offload tuning |

**KEY REALISATION — the untested winning path:** the re-fault exists because
aimdo's DEFAULT *unloads models to CPU after use*. `--highvram` stops that unload
("keeps them in GPU memory") = NO re-fault. On 24GB it OOMs (40GB doesn't fit, the
gotcha proved this twice). BUT on a **48GB+ card where the 40GB model FITS**,
`--highvram` was **NEVER tested** — the 96GB PRO 6000 run used aimdo's DEFAULT
(which page-faults even with room → 119s). The untried combination is **big card
(model fits) + `--highvram` (force resident, skip the unload/re-fault)**. That is
the single most promising un-run experiment.

### NEXT-SESSION TEST PLAN (Fix #3)
Test in this order, all start.sh `VRAM_MODE` / `CUBRIC_VRAM_MODE` edits (R2 push +
restart-comfy OR Pod env override — NO rebuild):
1. **24GB card + `--reserve-vram` / `--cache-ram <GB>` tuning** — can the 2nd-stage
   re-fault be reduced without OOM? Cheapest, but modest ceiling (1st fault stays).
2. **48GB+ card + `--highvram`** — THE shot. If the 40GB model fits VRAM AND we
   force it resident, both faults should vanish (or collapse to one initial load).
   This is the ONE combination never run. Watch RAM/VRAM for OOM; if it survives,
   read the fault-in (should be ~seconds, not 119s). (Note: if it OOMs even at
   48GB because the FULL 3-stage resident set > VRAM, this is dead too — but the
   per-STAGE 40GB does fit 48GB, so worth the shot.)
3. Get the FULL untruncated help for `--vram-headroom` + `--reserve-vram` defaults
   first: `main.py --help 2>&1 | grep -A3 -iE "reserve-vram|vram-headroom|cache-ram|highvram"`.

### OPEN ALTERNATIVE HYPOTHESIS (user instinct 2026-06-28) — workflow, not infra
User increasingly suspects **the WORKFLOW itself behaves differently across cards**
(not a pure infra/fault issue). Worth a clean test next session: run a DIFFERENT
video model (**Wan** — being installed to the volume now) on the same Pod. If Wan
faults/loads FAST where LTX is slow → the problem is **LTX-workflow-specific**
(its multi-stage 40GB re-stage pattern), not the Pod/card/aimdo generally → the
fix is in the LTX graph (fewer stages, smaller transformer, or node-level
`prioritize()`), NOT the image. If Wan is ALSO slow → it's the broad
multi-stage-on-cloud pattern. This SPLITS the tree and may redirect the whole
investigation. Run it.

## The observation

Same LTX-2.3 t2v workflow, byte-identical ComfyUI 0.26.0 + comfy-aimdo 0.4.10 +
SDPA (sage gated off on Ada sm_89, MPI-145), warm gen:

| Machine | GPU | torch / CUDA | warm gen |
|---|---|---|---|
| Local (app engine) | RTX 4060 Ti 16GB | **2.12.0+cu130 / CUDA 13.0** | **1:14** |
| Cloud Pod | RTX 4090 24GB | **2.8.0+cu126 / CUDA 12.6** | **1:41** |
| Cloud Pod | RTX A4500 20GB | 2.8.0+cu126 / 12.6 | 5:51 (cold), warm untested |

A 4090 should be ~2-3× a 4060 Ti on raw compute. It was SLOWER. Cold-gen on the
Pod (4:34 / 5:51) is mostly one-time aimdo model-staging tax — warm is the real
comparison.

## CONCLUDED — the torch 2.8+cu126 → 2.12+cu130 bump is NOT the fix (do not do it)

Deep research (verified, primary NVIDIA sources):

1. **CUDA 13.0 cuBLAS gains are Blackwell-ONLY** (3-0). NVIDIA's own notes: the L3
   non-GEMM kernel improvements (SYRK/HERK/TRMM/SYMM, FP32/CF32) are "on NVIDIA
   Blackwell GPUs." Ada sm_89 gets **zero** fp16/bf16 GEMM or attention speedup
   from cu130. LTX diffusion is fp16/bf16 GEMM+attention → no benefit.
2. **Driver-floor cost is real and worse than the cu124-label framing** (3-0):
   cu130 needs a **hard r580 floor** (≥580.65.06 Linux; Update 3 ≥580.126.20);
   cu126 runs as low as ~r525-560. Bumping to cu130 would **exclude every host
   below r580** = directly kills Option A's wide-coverage purpose (the A4500 ran
   on r550 — a cu130 image would have REFUSED it).
3. No confirmed Ada-specific torch-2.8 regression survived adversarial verification
   (sglang cu124→cu126 Ada regression, SDPA MATH-upcast, fp16-accum — all refuted
   0-3). The version gap alone does not explain a ~35% wall-time penalty.

**→ A cu130 bump = all cost (lose hosts), zero benefit (no Ada speedup). Off the
table. Don't re-research this; the answer is documented here.**

## LIVE TEST SESSION 2026-06-27 (4090 Pod) — B CLEARED, A FAILED (OOM)

Both suspects were tested live on a fresh 4090 Pod. Clean measurement table
(all sampling-only — the card/toast timer excludes cold model-load, MPI-147):

| Machine | GPU | warm | cold |
|---|---|---|---|
| Local (app engine) | 4060 Ti 16GB | **1:31** | 2:18 |
| Cloud Pod | 4090 24GB | **2:09** | 2:49 |

The ~38% gap (4090 LOSING to a 4060 Ti) is REAL and reproducible.

### B (host throttle) = CLEARED. Hardware is fine.
Probed during a gen: **bf16 8k matmul = 165 TFLOPS** (full 4090 spec), **P0**
under load (not the idle P8 RunPod telemetry showed), **Graphics/SM 2520–3105
MHz** (full Ada boost), **mem 10501 MHz**, **450W** power limit, **zero throttle
reasons**. The card delivers full compute WHEN FED. But `nvidia-smi dmon` showed
**SM util 1–15%** across the whole gen with **VRAM pinned 93%** and the
**framebuffer climbing mid-gen** — the GPU is STARVING, not throttling. CPU 0–10%,
sys RAM not pegged → host is not the bottleneck. → Throttle ruled out. The
starvation pointed at aimdo's dynamic fault-in stalling the SM (suspect A).

### A (aimdo overhead) = TESTED, FAILED — disabling aimdo OOM-KILLS the Pod.
Hypothesis was: LTX fits 24GB, so aimdo's stage/evict is wasted overhead; disable
it and the model stays resident → faster. **WRONG, and it was already documented
(builder/02-image-and-rebuild.md, MPI-146).** `--disable-dynamic-vram` (R2-pushed via start.sh, gated
VRAM_GIB≥22) made ComfyUI load LTX-2.3's **full 3-stage** weight set RESIDENT with
the offload spec on CPU → it streamed **~57GB into a Pod with ~57GB RAM** → the
status bar sat at `LOADING MODEL 0%` for 2:54+, RAM hit 98%, then the **container
was OOM-KILLED mid-gen** ("remote engine disconnected — the Pod may have run out
of memory and restarted"). This is the SAME failure as MPI-146's 5090 `--lowvram`
OOM. **aimdo's dynamic fault-in is LOAD-BEARING — it is what PREVENTS this OOM,
not wasted overhead.** The "LTX peaks ~18GB so it fits" framing was wrong: one
STAGE fits VRAM, but the full pipeline's resident RAM footprint does not.

`--highvram`/`--gpu-only` would be even MORE aggressive (everything on GPU) → same
or worse OOM. Do not try them either. **`--disable-dynamic-vram` is reverted;
start.sh default is back to `VRAM_MODE=""` (aimdo manages). Never disable aimdo to
chase perf again — it's now failed live TWICE (MPI-146 + this).**

## fp8 lead = KILLED. Both engines run the IDENTICAL model set (BF16 transformer).
Verified 2026-06-27 from the live local workflow graph + local app.log. The
local 4060Ti loads the EXACT same files the Pod does:
- transformer `ltx-2.3-22b-distilled-1.1_transformer_only_bf16.safetensors` (**BF16**, 22B), weight_dtype `default`
- CLIP1 `gemma-3-12b-it-heretic-fp8-comfy.safetensors` (already fp8), CLIP2 `ltx-2.3_text_projection_bf16`
- VAE `LTX23_video_vae_bf16` + `LTX23_audio_vae_bf16` (bf16)

So format is NOT the gap — the heavy transformer is BF16 on BOTH sides; the
encoder is ALREADY fp8 on both. There is no fp8 transformer to switch to in this
workflow. **Do not chase fp8.** (An fp8 transformer build, if one exists upstream,
is a SPECULATIVE future optimization for BOTH engines, not an explanation of the
local-vs-Pod gap.)

Worse for every offload/VRAM theory: local app.log confirms the 4060Ti runs
`comfy-aimdo inited ... (VRAM: 16379 MB)` + `DynamicVRAM support detected and
enabled` + `offload device: cpu` — i.e. the **16GB local card offloads MORE** of
the 22B BF16 transformer than the 24GB Pod does, **and still wins (1:31 vs 2:09).**
The card doing the MOST offloading is the FASTEST. That definitively kills suspect
A (aimdo/offload overhead) from a second direction.

## CONCLUSION — every cheap lever is exhausted; the only remaining axis is torch
After live testing, the two engines are byte-identical on every measurable axis:
same model files, same ComfyUI 0.26, same aimdo 0.4.10 + DynamicVRAM ON, same SDPA
(sage gated off on Ada both sides), same BF16 transformer, same CPU-offload. RULED
OUT live: host throttle (165 TFLOPS/P0), aimdo-off (OOM), fp8 (identical already).
RULED OUT by deep-research: cu130 cuBLAS GEMM gains (Blackwell-only).

**The ONE remaining difference is the torch/CUDA stack: Pod torch 2.8.0+cu126 vs
local torch 2.12.0+cu130.** The deep-research dead-end verdict was specifically
about cu130's *cuBLAS GEMM* gains being Blackwell-only — it did NOT clear the
**torch 2.8 → 2.12** jump itself (4 minor PyTorch releases: SDPA kernel selection,
inductor/compile, CUDA-graph capture, the caching allocator all changed across
2.8→2.9→2.10→2.11→2.12, independent of the CUDA toolkit version). The earlier
research conflated "cu126→cu130" (toolkit, Ada-neutral) with "torch 2.8→2.12"
(framework, possibly NOT neutral). That axis is the live re-open.

### NEXT (open) — isolate the torch version, do NOT bump cu blindly
The clean experiment is to raise ONLY torch on the Pod and re-time, WITHOUT taking
cu130's driver-floor cost. Options, in order of cheapness:
1. **Measure first, don't rebuild:** on a Pod, `pip install torch==2.12 ...` into a
   throwaway venv ISN'T trivial (cu/driver floor), so instead profile WHERE the
   Pod's 2:09 goes vs local's 1:31 — per-stage step timing from the stdout tqdm
   (we already parse it, MPI-147). If the Pod is slower PER STEP uniformly → it's
   the kernel/framework (torch). If it's slower only at stage boundaries →
   load/offload/PCIe. This localizes the cost for free before any image work.
2. Can a torch 2.9–2.12 wheel install on the cu126 base WITHOUT moving to cu130's
   r580 floor? torch 2.12+cu126 wheels may exist (cu126 is still supported in
   newer torch). If so → bump torch only, keep the wide driver coverage, re-time.
3. Only if 1+2 point hard at torch AND a cu126-compatible 2.12 wheel doesn't
   exist, reconsider the cu128/cu130 base trade (coverage loss vs the measured
   gain) — with NUMBERS this time, not the assumption that cu130 = no gain.

Do NOT reopen: aimdo-disable (OOM, twice), fp8 (identical), or a blind cu130 bump
(coverage cost). The next move is a per-step profile to localize the cost, THEN a
torch-only bump test if step-time is the culprit.

## KEY PIVOT 2026-06-27 — the Pod is NOT generically slow; it is LTX-SPECIFIC
User datapoint: an **SDXL image gen = ~2s on a 5090 Pod vs ~12s on the local 4060Ti
— the Pod WINS ~6×.** So the cloud GPU + torch stack is FINE for image diffusion;
the slowness is specific to the LTX VIDEO path. This DEMOTES every "torch is broadly
slower" theory — torch 2.8 is not globally slow (SDXL proves it), so if torch is
involved it's via an LTX-specific kernel, not a blanket regression. New frame: find
what in the LTX graph behaves differently on the Pod stack.

### Triton / PatchTritonVAE = CHECKED + DISMISSED (do NOT chase — agents were right)
Local app.log shows `KJNodes: PatchTritonVAE could not be imported ... No module
named 'triton'` (triton is flaky/absent on Windows; present on the Linux Pod). This
LOOKS like a local/Pod divergence, but the 4 SHIPPED LTX workflows
(`comfy_workflows/LTX_{t2v,i2v}{,_stage2}.json`) were grepped: they use
`VAELoaderKJ` + `VAEDecode` + `LTXVAudioVAEDecode/Encode` and contain **ZERO**
`PatchTritonVAE`/triton references. The failing node is never in the graph → its
import failure changes nothing → it CANNOT be the gap. Prior agents correctly said
"ignore it." Recorded here so it is not re-chased.

### Surviving LTX-specific suspects (ranked)
1. **LTX sampler / DiT forward (per-step compute)** — most of the 2:09 is sampling;
   an LTX-specific attention/forward kernel that's slower on torch 2.8 than 2.12
   would be both LTX-specific AND stack-sensitive, consistent with SDXL-fast.
2. **LTX VAE decode** (`VAELoaderKJ` / `LTXVAudioVAEDecode` — video VAE, tiling +
   temporal, heavy) — could differ by stack.
3. **The distilled 22B transformer run path.**
4. ~~Triton/PatchTritonVAE~~ — DEAD (not in graph, above).
5. ~~gemma CLIP~~ — unlikely (one-time text encode, ~constant cost; does not scale
   with the per-step 2:09 gap).

### Tests that DO probe this (an SDXL/image test does NOT — it's the control, already done)
- **Per-node timing, one LTX gen each side (free, decisive):** ComfyUI logs per-node
  execution time. Compare local vs Pod per-node for the LTX graph; the dominant node
  (sampler vs VAE-decode) names the culprit. No rebuild.
- **Wan video on the Pod (secondary):** Wan uses a different VAE/node set. Wan fast →
  slowness is LTX-node-specific; Wan also slow → video-class-broad. Splits the tree.
- **NOT useful:** re-running SDXL/image gens. SDXL never touches the LTX video path,
  so it cannot confirm or deny any LTX theory — it is the (already-collected) control
  showing the Pod stack is fine for images.

## ROOT CAUSE FOUND 2026-06-27 — it's INTER-STAGE MODEL STAGING, not per-step compute
Per-step sampler rate is FAST on BOTH sides (live tqdm): Pod main LTX sampler =
**~2.96 it/s (~0.34 s/it)**, local = ~4.57 s/it — i.e. the Pod's per-step DiT compute
is actually FASTER. **The wall-clock is NOT in the sampler steps.** It is in the gaps
BETWEEN stages, where aimdo (re)stages each stage's model:
```
Requested to load LTXAV
Model LTXAV prepared for dynamic VRAM loading. 40050MB Staged. 1440 patches attached.
```
LTX-2.3 is multi-stage (text-encoder LTXAVTEModel_ ~15GB → stage-1 transformer LTXAV
~40GB → stage-2 LTXAV ~40GB → VideoVAE/AudioVAE). The **40GB LTXAV transformer is
(re)STAGED at EACH stage boundary** — in the local cold LTX log it appears 3× with
~38s + ~39s wall-clock BETWEEN the staging events (16:36:29 → 16:37:07 → 16:37:46),
while the sampler bars in between are quick. SDXL is fast because it's ONE small
(~5GB) model, ONE stage, no re-staging. This is why:
- per-step is fast both sides (compute was never the issue);
- total is slow (staging dominates the wall-clock);
- it's LTX-specific (SDXL doesn't re-stage a 40GB model 3×);
- disabling aimdo OOM'd (materializing 40GB × stages resident > RAM) — aimdo's
  staging is the SYMPTOM's mechanism but also the OOM SAFETY; the fix is to stop the
  RE-staging, not to disable aimdo.

### The narrowing question (needs Pod WARM log)
Local does the same re-staging on COLD (the +38s events are in local's 132s cold
gen) yet local WARM = 1:31 vs Pod WARM = 2:09. So warm runs must SKIP some staging
(model kept resident/cached). The remaining question: **what does the Pod re-stage
on a WARM gen that local keeps cached?** Likely a cache-retention difference —
wrapper.py:202-211 DROPPED `--cache-lru` (MPI-142) to fall back to v0.26's
pressure-aware `--cache-ram` default "matching local"; verify the Pod actually keeps
the 40GB LTXAV resident across stages on warm the way local does.

### NEXT — capture & compare the WARM staging logs (free, no rebuild)
1. On the Pod, run TWO consecutive LTX gens; capture the `Requested to load` /
   `Model … prepared for dynamic VRAM loading … Staged` lines + timestamps for the
   SECOND (warm) gen.
2. Compare to a local WARM LTX gen's same lines (app.log).
3. If the Pod re-stages LTXAV (40GB) on warm where local keeps it cached → the fix is
   cache retention (keep the stage models resident between/across gens), NOT a torch
   bump and NOT aimdo-off. Tune via `--cache-ram`/`--reserve-vram`/cache count —
   aimdo stays ON (no OOM). If both re-stage identically on warm → the per-STAGING
   cost itself is slower on the Pod (PCIe / host-mem bandwidth / torch-2.8 staging
   path) → measure staging seconds per 40GB event, Pod vs local.
Do NOT bump torch or disable aimdo before this log comparison localizes the cost.
