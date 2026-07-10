# LTX-2.3 Quant + Cold-Start Investigation (2026-06-29)

> Multi-agent research sweep. Goal: kill the ~5-min cold-start tax and the ~1:15
> warm-gen time, and find a quantized transformer to replace the 40GB Kijai bf16
> `ltx-2.3-22b-distilled-1.1_transformer_only_bf16.safetensors` at the closest
> quality. Target GPU = RTX 5090 (Blackwell sm_120, 32GB).
>
> **Status: research only — NOTHING below is live-tested on a Pod yet.** The
> headline finding is strong on source/architecture grounds but needs ONE live
> A/B before it's truth. This file is for the brainstorm session that follows.
>
> Read [pod-perf-investigation.md](pod-perf-investigation.md) first for the prior
> arc (every infra fix that already died). This file BUILDS ON it and CORRECTS
> one mechanism detail (see §1).

---

## ★ LIVE LOCAL RESULTS (2026-06-29, RTX 4060 Ti 16GB, app engine) — read first

First real A/B of **Unsloth Q8_0 GGUF vs the 40GB bf16**, local app engine, t2v 1s.
The per-step dequant tax (predicted in the TL;DR) is REAL and **resolution-dependent**:

| Resolution | bf16 | GGUF Q8_0 | Δ | verdict |
|---|---|---|---|---|
| 832×448 (low-ish) | — | — | **GGUF ~10s FASTER**, no visible quality diff | GGUF wins |
| 704×1280 (high) | **94s** | **160s** | **GGUF +66s (~70% SLOWER)** | GGUF loses |

- **Quality:** Q8_0 = **no noticeable difference** vs bf16 at 832×448. (Confirms fp8-reject ≠ Q8-reject — the user explicitly disliked fp8 eyes/teeth; Q8 holds.) High-res quality A/B still pending but expected fine (Q8 is the near-lossless tier).
- **Speed crossover:** GGUF's per-layer dequant runs EVERY sampler step. Low res = few latent tokens = cheap steps = dequant overhead < smaller-load benefit → net win. High res (≈4× the tokens at 704×1280) = the per-step dequant compounds → +66s. The crossover sits between the two test points.
- **Loader choice (user, locked):** ship **city96 `UnetLoaderGGUF`**, NOT the KJ `GGUFLoaderKJ` wrapper. No visible behavior diff between them; city96 is simpler (no settings we'd touch — we change none) AND fails LOUDLY (node absent if uninstalled) vs the KJ wrapper which renders-then-errors (looks like a path bug — the exact trap that cost a debug session). Attention stays the engine-global setting; no per-node override needed.

### ⚠️ The local numbers do NOT decide it — the Pod does
GGUF's WHOLE point is the **cloud cold-start tax** (aimdo memlock re-fault, ~100-160s/stage on a Pod) — which **does not exist locally** (no 8MB memlock cap). So locally GGUF shows ONLY its downside (per-step dequant), never its upside. The deciding test is on a **5090 Pod**: same 704×1280 t2v, bf16 vs GGUF, compare TOTAL wall time INCLUDING cold-start.

---

## ★★ LIVE POD RESULTS (2026-06-29, RTX 5090 Pod, 832×448 t2v 1s) — THE DECIDER ✅ GGUF WINS

Ran the cross-model real-workflow stress test on a live 5090 Pod (id `cmo7hcsplqn1ek`). **GGUF wins outright for Pod — ship it.**

| Model (Pod) | Cold (first load, from disk) | Warm (RAM-resident) |
|---|---|---|
| **LTX-2.3 GGUF Q8_0** | **4:29** (269s) | **22–25s** |
| **Wan 2.2** | 2:11 | **9–14s** |

**The headline:** the cold tax is a **ONE-TIME per-model-per-Pod-boot** event, NOT per-gen. After each model's first load, every subsequent gen — **same-model OR cross-model jump** — runs warm (LTX 22–25s, Wan 9–14s). Sequence proven live: LTX cold 4:29 → LTX warm 25s → Wan cold 2:11 → Wan warm 9s → **back to LTX 22s** (NOT re-cold) → LTX 25s → **back to Wan 13–14s** (NOT re-cold).

**Two predictions in the TL;DR / §3 were FALSIFIED — corrected here:**

1. **`Staged` line DOES appear under GGUF** (predicted absent). Live: `Model LTXVTEModel_ prepared for dynamic VRAM loading. 15180MB Staged.` GGUF does NOT fully skip aimdo's dynamic-VRAM staging. BUT it stages the **Q8 payload (~15GB)**, not the bf16 **40050MB** — ~⅓ the bytes. The mechanism claim ("GGUF never enrolls in the VBAR fault path") is **partly wrong**; the practical win survives anyway because…
2. **…the cold tax isn't really an aimdo-staging cost — it's a disk→RAM cost paid once.** Why warm stays cheap across model jumps despite VRAM evicting to 0.8GB: the GGUF weights stay **resident in system RAM** (RAM bar climbed 40→47→55GB across the test and held). Reload is **RAM→VRAM (fast PCIe)**, not disk→VRAM (the 4:29 cold path). bf16 never got this — 40GB doesn't stay cleanly in the RAM cache + aimdo re-faults from disk per stage. GGUF's 15GB does → warm forever after first load.

**Verdict (locked):** GGUF wins on Pod. Cold tax → once-per-boot. After that, 9–25s regardless of model-hopping = product-grade. **Only remaining GGUF cost = the per-step dequant tax at high res LOCALLY** (94s→160s at 704×1280, see local table) → keep the **bf16-local / GGUF-Pod split** plan. Pod side is now proven; local keeps bf16 for high-res.

> Note: Pod test ran at 832×448 (the 704×1280 high-res Pod A/B vs bf16 was not run — but the cross-model warm behavior is resolution-independent and is the decider for the split, so the call holds). Quality held at 832×448; matches local.

### ⚠️ THE WARM-WIN HAS A RAM FLOOR (~90GB) — found 2026-06-30 on a 60GB Pod

The 22–25s warm numbers above were on a **~90GB-RAM** 5090 Pod. Re-tested on a **60GB-RAM** 5090 (same DC, EU-RO-1) and the warm win **collapsed**: 3s@2K gens ran **2:14 / 1:40 / 6:02 / 8:13** — the cold tax effectively RETURNED on a "warm" Pod.

**Mechanism:** the warm-cheap behavior depends on the weights staying **resident in system RAM** (RAM→VRAM reload, not disk→VRAM). The LTX working set is:

| Component | Size |
|---|---|
| Gemma-3-12b heretic text encoder (fp8_scaled) | **~14.5GB** |
| Q8_0 GGUF transformer | ~15GB |
| Video VAE + Audio VAE + text projection | ~4GB |
| ComfyUI + torch + CUDA + OS | ~8–12GB |
| **Working set** | **~40–45GB** |

On a 90GB box that all stays RAM-cached → warm. On a 60GB box there's ~15GB headroom → the cache **thrashes**, weights re-fault from disk → warm degrades toward cold. aimdo also offloads the 14.5GB Gemma encoder to CPU/RAM between gens (`CLIP/text encoder model load … offload device: cpu` in the logs), so Gemma + transformer contend for the same tight RAM.

**The working set is at the QUALITY FLOOR — it can't shrink:** fp4 Gemma "hurts" + full Gemma "over-influences" (model-set.md), and the transformer can't go below Q8 (fp8 rejected for eyes/teeth). So both halves are pinned by quality decisions already made. **No quant lever remains** without quality loss.

→ **Consequence:** GGUF's warm-win is **RAM-conditional, not universal.** Effective floor ≈ **90GB system RAM** for good LTX warm perf. Below that, expect cold-class times every gen. Product implication: the Pod pick must consider RAM, not just VRAM — see **MPI-160** (RunPod exposes only the cheapest-available RAM via `lowestPrice`; the higher-RAM host of the same GPU exists in the same DC but is intermittently surfaced). **Untested future lever:** a **Gemma GGUF** (Q6/Q5, ~9–10GB) — GGUF quant ≠ the rejected fp4 (int+per-block-scale preserves distribution, same reason Q8 transformer beat fp8); could drop the working set under the 60GB ceiling IF prompt-adherence holds. Separate A/B, not yet run.

### Dual-engine concurrency: the bf16/GGUF pick is PER-GEN, keyed on the gen's engine target

bf16-local / GGUF-Pod is a **hard engine rule** (user-locked 2026-06-30): local ALWAYS bf16, Pod ALWAYS GGUF; not a user-facing choice. The app enforces it **per generation**, not on global connection state — because a user can run LOCAL (forceLocal) gens *concurrently* with REMOTE (Pod) gens. The workflow-file pick (`commandExecutor` `_toGgufFilename`, gated on `payload.forceLocal !== true && remoteEngineClient.isRemote()`) and the engine pick (`getEngine(payload.forceLocal)`) read the SAME per-gen `forceLocal` signal, so a concurrent local-bf16 gen and a Pod-GGUF gen each get the correct (engine, workflow, weights) triple. The download split (bf16 `engine:'local'`, GGUF `engine:'remote'`) makes it bulletproof at the disk level: GGUF isn't on the local disk, bf16 isn't on the Pod, so a wrong-engine leak can't load even if a stale workflow names the wrong file. (A bf16-on-Pod leak DID happen live 2026-06-30 — a mid-session workflow regen flipped `LTX_t2v.json` from GGUF→bf16 while the running app hadn't reloaded the `_gguf` redirect → Pod got the 40GB bf16 = `40050MB Staged` = 8-min gens. Fixed by the swap + the download split once shipped.)

---

## TL;DR — the one big finding

**Switching the transformer to a GGUF quant (Q8_0) does not just shrink the cold
tax — it STRUCTURALLY BYPASSES the mechanism that causes it.** The ~108-127s
per-stage staging tax is an artifact of `comfy-aimdo`'s loader (VBAR + safetensors
mmap → pinned copy), throttled by RunPod's 8MB memlock cap. **GGUF models never
enroll in that loader** — they use ComfyUI's legacy `ModelPatcher` + their own
mmap + per-layer just-in-time dequant. So the `Requested to load LTXAV … 40050MB
Staged` line should not even appear with GGUF, and there is no per-stage re-fault.
> **⚠️ FALSIFIED on the Pod (2026-06-29) — see ★★ LIVE POD RESULTS above.** The
> `Staged` line DOES appear under GGUF (`15180MB Staged`), so GGUF does not fully
> skip the staging path. The real reason warm gens stay cheap is that the ~15GB Q8
> weights stay **resident in system RAM** → reload is RAM→VRAM, not disk→VRAM. The
> practical win (cold tax = once per boot) holds; this mechanism sentence does not.

The catch: GGUF moves the cost from **load time** to **per-step inference**
(per-layer dequant runs every forward pass). Whether the net wall-clock wins is
**UNPROVEN** — one disputed report claims GGUF is ~4× slower per step than fp8 on
a 5090; other evidence says the dequant is cheap PyTorch ops on-GPU. **This is the
single live test to run** (§5).

Quality: **fp8 was rejected (eyes/teeth) — but that does NOT predict Q8_0.** They
are different quant strategies (fp8 = reduced-precision float; Q8_0 = int8 +
per-block fp16 scale). Q8_0 preserves the weight distribution better and is the
"nearly lossless" tier. **No public LTX-2.3 GGUF face-quality data exists** → we'd
be first-movers; must A/B ourselves.

---

## §1 — MECHANISM CORRECTION (read before trusting the old doc)

The prior doc framed the cold tax as "aimdo per-page **UVM** fault handler / 4KB
page-table walk." **From the comfy-aimdo source, that's mislabeled.** aimdo does
**NOT** use hardware UVM / `cudaMallocManaged`. It uses:

- **CUDA VMM API** (`cuMemAddressReserve` → `cuMemCreate` → `cuMemMap`, the
  "three_stooges" call group) — a *software* residency tracker. The "fault" is a
  software concept: ComfyUI explicitly calls `vbar_fault(offset,size)` per layer;
  aimdo maps VRAM in **32MB** granules (not 4KB hardware pages).
- Weights live in CPU memory registered via `cuMemHostRegister` (pinned), copied
  to VRAM on fault via `cuMemcpyHtoDAsync` in 64MiB windows.

**Why the Pod is slow (now pinned to source):** RunPod's **8MB `RLIMIT_MEMLOCK`
cap makes `cuMemHostRegister` FAIL** → aimdo cannot keep the host weight buffer
pinned → it falls back to re-reading the safetensors **mmap from disk and copying
through PAGEABLE host memory every stage**. Pageable copies on a loaded host run
~0.5-1 GB/s → 40GB ≈ 40-80s **per stage**, re-paid at each stage boundary. That
matches the measured 108/119/127s. The 8MB memlock cap is the true root — exactly
as the repo suspected, but the mechanism is "can't pin → re-stage from disk
pageable," not "slow 4KB UVM faults."

Corollary: if it WERE efficient CUDA UVM, 40GB would fault in ~9s (1.1M pages/s
plateau). It's ~12× slower than that ceiling → confirms it's the
mmap+pageable-copy path, not UVM. (Hooks installed: 6 driver alloc/free fns —
`cuMemAlloc_v2`, `cuMemFree_v2`, `cuMemAllocAsync(_ptsz)`, `cuMemFreeAsync(_ptsz)`
— via funchook on Linux / Detours on Windows. Source: `Comfy-Org/comfy-aimdo`.)

**Why GGUF escapes it:** `GGUFModelPatcher(ModelPatcher)` ≠ `ModelPatcherDynamic`.
aimdo only enrolls `ModelPatcherDynamic` models in the VBAR system. GGUF therefore
never touches the pin-fails-restage path AND never depends on the memlock cap
(its mmap is file-backed, not `cuMemHostRegister`-pinned). Confirmed by the aimdo
integration PR author: *"This work does not have any GGUF integration and GGUF
will not see any benefits yet"* (ComfyUI PR #11845), ComfyUI issue #13953, and
draft PR city96/ComfyUI-GGUF #427 (which would ADD aimdo to GGUF — currently
unmerged, so GGUF stays on the legacy path = the path we want).

---

## §2 — Quant candidates to replace the 40GB bf16 transformer

Ranked closest-to-bf16-quality first. All are the **distilled-1.1 22B** (must
match — older/non-distilled LTX GGUFs exist and are wrong). fp8 is excluded
(team rejected it).

| Rank | Format | File / Repo | Size | Loader | Quality vs bf16 | Notes |
|---|---|---|---|---|---|---|
| **1** | **GGUF Q8_0** | `LTX-2.3-22B-distilled-1.1-Q8_0.gguf` — [QuantStack](https://huggingface.co/QuantStack/LTX-2.3-GGUF) **25.5GB** / [Unsloth](https://huggingface.co/unsloth/LTX-2.3-GGUF) **22.8GB** | `UnetLoaderGGUF` | "nearly lossless" tier (~90-95% FP16 in general lit; **no LTX face data**) | **Prime candidate.** Fits 5090 (32GB). Bypasses aimdo. fp8-reject ≠ Q8-reject. Size gap QuantStack vs Unsloth unexplained — A/B both. |
| 2 | GGUF Q6_K | QuantStack 21GB / Unsloth 17.8GB | `UnetLoaderGGUF` | ~85-90% (general lit) | Fallback if Q8 faces hold but want smaller/faster. |
| 3 | GGUF UD-Q5_K_M | [Unsloth](https://huggingface.co/unsloth/LTX-2.3-GGUF) 18.2GB | `UnetLoaderGGUF` | Dynamic 2.0 (key layers upcast) — *may* beat std Q6 | Unproven on video DiT (Dynamic 2.0 benchmarks are LLM-only). |
| 4 | **NVFP4 (official)** | [Lightricks/LTX-2.3-nvfp4](https://huggingface.co/Lightricks/LTX-2.3-nvfp4) ~21.7GB | built-in LTXVideo | **QAD** (quant-aware distillation = baked-in, holds quality better than post-hoc) — BUT community reports "noticeable drop vs fp8" on fine detail | **5090-native ~2.4× faster IN COMFY** — but **cu130-gated** (without cu130 it's 2× *slower* than fp8) + **distilled "coming soon"** (only `dev` now). See §4. |
| 5 | MXFP8 block-32 (Kijai) | `…_mxfp8_block32.safetensors` ~25GB | KJNodes `LTXVideoModelLoader` | Block scaling > flat fp8 dynamic range; no face data | Alternate fp8 calibration; no cu130 needed; fallback if Q8 AND NVFP4 fail. Still goes through aimdo (safetensors). |

**Dead / skip:**
- **Nunchaku / SVDQuant (INT4 ~11GB)** — does NOT support LTX or ANY video DiT
  (FLUX/Qwen/SANA/PixArt only; LTX request #768 marked inactive, no PR). Not an
  option now. (If it ever lands, it'd bypass aimdo like GGUF — worth re-checking
  later.)
- **HLWQ/PolarQuant Q5 (15GB, "0.9986 cosine sim")** — underlying paper
  (arXiv 2603.29078) **withdrawn by author 2026-04-20**; no ComfyUI path. Skip.
- **INT8 mixed (Winnougan ~29GB)** — Ampere-targeted, no 5090 benefit, barely
  smaller. Skip.
  > ⚠ **This verdict is scoped to LTX on Blackwell (RTX 5090), the target of this doc.**
  > It is NOT a general "int8 is dead" finding. Blackwell has native fp8/mxfp8 tensor
  > cores, so fp8 already saturates the pipeline and int8 buys nothing. On **Ampere**
  > (no native fp8), int8 IMMA is the *faster* path — a 3090 bench shows Krea2
  > `int8_convrot` at **1.92×** `fp8_scaled`. Same fact, opposite conclusion, different
  > silicon. See [krea2-int8-quant.md](krea2-int8-quant.md) before citing this line to
  > dismiss an int8 proposal for another model or GPU generation.

---

## §3 — Does smaller = faster cold? (the thesis)

**For GGUF: the question is MOOT — there's no aimdo fault to scale down. GGUF
removes the tax, doesn't shrink it.** (§1.)

**For a smaller *safetensors* (e.g. MXFP8, NVFP4 dev):** yes, roughly linear —
the pin-fails-restage copy is proportional to bytes, so 25GB ≈ 0.6× the 40GB
staging time. (Empirically corroborated: the rejected fp8 ~23-25GB loaded in
"~half the time" — proves proportional staging; it died on quality, not speed.)
So MXFP8/NVFP4 would cut the cold tax ~35-40% but **keep** the mechanism (and the
per-stage re-fault). GGUF is categorically better for cold than any safetensors
quant.

Net: **the cold-start win is the GGUF route's biggest prize, and it's a
mechanism-level win, not a proportional one.**

---

## §4 — The cu130 re-opening (NVFP4 only)

The prior doc killed cu130 because its cuBLAS *compute* gains are Blackwell-only
and it costs the r580 driver floor — **true for the bf16 path.** But **NVFP4 needs
cu130** to hit its native Blackwell FP4 tensor cores (without it, 2× *slower* than
fp8). The 5090 IS Blackwell sm_120. So **for an NVFP4 route specifically**, the
cu130 trade flips: you'd pay the r580 floor to unlock a real ~2.4×-in-Comfy speed
win + native 4-bit. This is a genuine fork, not a re-tread — but it's gated behind
(a) NVFP4 face quality passing (currently reported *worse* than fp8 on detail) and
(b) the distilled NVFP4 shipping (only `dev` exists now). **Lower priority than
GGUF** — more moving parts, quality risk, driver-floor cost. Park unless GGUF
fails.

---

## §4b — Cold-start levers that KEEP bf16 (orthogonal to quant — apply even if GGUF wins or fails)

These came out of the cold-start lane and stand on their own. Ranked by leverage.

1. **UPSTREAM FIX — monitor, it supersedes everything.** ComfyUI issue **#14345**
   (LTX speed regression) + aimdo issue **#30** ("LTX 2.3 Memory Changed in 2nd
   Step") are BOTH OPEN and BOTH assigned to **`rattus128`** (the aimdo subsystem
   lead). No fix merged as of 2026-06-29. If a fix lands there, it fixes the bf16
   path for free — check these before doing any image work. (aimdo issue #70,
   opened today, re: `FILE_FLAG_SEQUENTIAL_SCAN` page-cache discard, is Windows-
   only → Linux Pod unaffected, but shows the file-cache path is in active flux.)

2. **Forced LTX warm-up on connect (MPI-157 Opt 1) — app-side, no rebuild, top
   bf16 lever.** Fire a throwaway LTX gen on connect, interrupt at stage-1 step-1
   SSE → faults the 40GB in invisibly → user's first real gen starts warm. MUST be
   the LTX workflow itself (SDXL warm-up already proven useless — different VBAR).
   Open risk: does aimdo evict on interrupt before the real gen queues? (issue
   #13139 "models always unloaded" suggests it might.) Quick live test settles it.

3. **`--highvram` on a 48GB+ card (L40S/A6000) — the single untested combo.**
   `--highvram` = "keeps models in GPU memory" (verbatim help). The 96GB run used
   aimdo's DEFAULT (still evicts between subgraphs) — `--highvram` + ≥48GB headroom
   was NEVER run. Would kill the stage-2 re-fault (~46s→~11s continue). Caveat: the
   node-58 disproof showed aimdo re-stages even without node 58 → eviction may be
   subgraph-structural, so `--highvram` might not override it. Flag-only test
   (`VRAM_MODE=--highvram`, R2 push, no rebuild). Watch OOM (encoder+transformer+VAE).

4. **`prioritize()` custom node between stages — free ~1hr test.** aimdo exposes
   `prioritize()` = "reset offload watermark to no-offloading." A custom node after
   stage-1 could pin LTXAV resident → skip the stage-2 re-fault WITHOUT a big card.
   Same structural-vs-priority caveat as #3 (node-58 disproof). Low-med confidence,
   cheap to try.

5. **`setcap cap_ipc_lock` Dockerfile route — REOPENS the "memlock dead" item.**
   The repo killed "raise memlock" because RunPod's REST/GraphQL API has no ulimit
   field. But the **Dockerfile** route is different: `setcap cap_ipc_lock=+ep
   /usr/bin/python3` — IF RunPod grants IPC_LOCK in the container bounding set.
   **FREE 2-min check first:** on a Pod run `cat /proc/self/status | grep Cap` →
   decode CapBnd for `cap_ipc_lock` (bit 14). If present → one-line Dockerfile
   change might restore local's ~28s fault (the doc's own A/B says "ONLY memlock
   differs"). TENSION: `--disable-pinned-memory` showed no change, which argues
   memlock isn't the lever — unreconciled. The free check costs nothing; resolve
   the tension before any rebuild. (Note: if GGUF wins, this is moot — GGUF doesn't
   pin host buffers at all.)

---

## §5 — THE live test (cheapest decisive validation, no rebuild)

On an existing 5090 Pod:
1. Install/update `ComfyUI-GGUF` + `ComfyUI-LTXVideo` + `ComfyUI-KJNodes` to
   **post-Jan-2026** (PR #399 — adds LTX-2 GGUF metadata config). **Stale nodes =
   silent corrupt/noisy output that looks like a quality bug but isn't** — verify
   versions first.
2. Download **Unsloth Q8_0 (22.8GB)** + **QuantStack Q8_0 (25.5GB)** to the Pod.
3. Swap the bf16 `Input_…` transformer loader for `UnetLoaderGGUF` in the LTX
   workflow (VAE + gemma encoder stay safetensors).
4. Run TWO consecutive gens. Capture:
   - **Cold staging**: does `Requested to load LTXAV … Staged` appear at all?
     (Expectation: NO — confirms aimdo bypass.) Time first-gen wall clock.
   - **Per-step tqdm**: measure the per-layer dequant overhead. Is warm gen still
     ≤ ~90s for 1s/1K t2v? Or does dequant blow it past the bf16 1:15?
   - **Faces**: same prompt/seed as a known bf16 result with a face → eyes/teeth
     A/B. This is the quality gate fp8 failed.
5. **Decision:** GGUF wins if staging vanishes AND warm wall-clock is competitive
   AND faces hold. If per-step dequant makes total wall-clock worse → GGUF trades
   one bottleneck for a worse one → fall back to (a) MXFP8 block-32, or (b) the
   bf16 warm-prime-on-connect lever (MPI-157 Opt 1, orthogonal, still valid).

---

## §6 — Confidence + open unknowns

| Claim | Confidence | Basis |
|---|---|---|
| GGUF bypasses aimdo's staging/re-fault mechanism | **95%** | PR #11845 author statement + issue #13953 + #427; `GGUFModelPatcher`≠`ModelPatcherDynamic` |
| Cold tax root = memlock-cap → pin-fails → restage-from-disk-pageable | **90%** | comfy-aimdo source (`cuMemHostRegister`, pageable fallback); ~12× off UVM ceiling |
| GGUF cold "load" is seconds not 100s | **90%** | mmap architecture + multiple "loads instantly" reports |
| Q8_0 distilled-1.1 exists, fits 5090, faces *may* hold (fp8≠Q8) | **85% exists / unknown faces** | QuantStack+Unsloth repos confirmed; **zero public LTX face data** |
| GGUF per-step inference is slower than bf16 — net win unproven | **the** open risk | one disputed "4× vs fp8" report; dequant is on-GPU PyTorch ops (cheap-ish) — **must measure** |
| NVFP4 native-fast on 5090 but cu130-gated + quality-risk + distilled-pending | **80%** | PyTorch/Comfy Blackwell blogs; HF discussion quality reports |
| Nunchaku LTX = does not exist | **95%** | nunchaku supported-model list; req #768 inactive |

**Biggest unknown:** GGUF per-step dequant cost on the Pod. Everything hinges on
§5's warm wall-clock number. **Do not commit to GGUF without it.**

---

## Sources (key)
- comfy-aimdo source: github.com/Comfy-Org/comfy-aimdo · ComfyUI PR #11845 (GGUF-not-integrated statement) · issue #13953 · #14481
- city96/ComfyUI-GGUF (ops.py/dequant.py/loader.py) · PR #399 (LTX-2 support) · draft PR #427 (GGUF+aimdo)
- Quant repos: QuantStack/LTX-2.3-GGUF · unsloth/LTX-2.3-GGUF · Lightricks/LTX-2.3-nvfp4 · silveroxides/LTX-2.3-Quants
- Blackwell FP4: pytorch.org/blog faster-diffusion-blackwell · blog.comfy.org new-comfyui-optimizations-for-nvidia
- UVM/VMM lit: SC'21 UVM analysis · NVIDIA "Maximizing Unified Memory Performance" (5.4 vs 10.9 GB/s) · AMD MI300A arXiv 2508.12743
- Nunchaku: nunchaku-ai/nunchaku · ComfyUI-nunchaku #768
