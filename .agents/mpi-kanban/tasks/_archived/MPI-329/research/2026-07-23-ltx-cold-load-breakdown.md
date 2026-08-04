# MPI-329 - cold-load breakdown, LTX 2.3 High on a 4090 Pod (2026-07-23)

Pod `5sn0x7l1my2rvz`, image `v0.17.0-dev-cu130` (ComfyUI 0.28), RTX 4090 24GB,
AMD Ryzen 9 7950X, 56.8GiB RAM. Model already hot-store staged to CONTAINER DISK
(42.0GB), so none of this is network-volume I/O.

## Timeline (container log)

| time | event | cumulative |
|---|---|---|
| 17:11:43 | `got prompt` | 0s |
| 17:11:46 | VAE load, `quantization metadata version 1`, MixedPrecisionOps | +3s |
| 17:11:51 | CLIP/text encoder load starts (`device: cuda:0, offload: cpu, current: cpu`) | +8s |
| 17:12:41 | `Sampling with sigmas`, `Requested to load LTXAV` | +58s |
| 17:12:42 | `Model LTXAV prepared for dynamic VRAM loading. 40050MB Staged. 3544 patches` | +59s |
| 17:12:46 | stage 1 `0/1 Model Initializing...` | +63s |
| 17:13:25 | stage 1 done: `1/1 [00:39<00:00, 39.72s/it]` | +102s |
| 17:13:26 | **LTXAV re-prepared, 40050MB staged AGAIN** (stage boundary) | +103s |
| 17:13:28 | stage 2 `0/7` | +105s |
| 17:14:17 | `1/3 [00:05<00:17, 8.81s/it]` then `2/3 ... 2.54s/it` | +154s |
| 17:14:19 | `3/3 [00:07<00:00, 2.54s/it]`; AudioVAE 693.46MB; VideoVAE 1384MB staged | +156s |
| 17:14:23 | `Prompt executed in 159.93 seconds` | 160s |

## The finding

**Actual sampling is fast: 2.54 s/it.** The 2m40s is dominated by load/prep, not compute:

- **~50s = text-encoder load alone** (17:11:51 -> 17:12:41). Biggest single line item, and
  it has nothing to do with weight streaming or the volume.
- **39.72s "first step"** = dynamic-VRAM load amortised into stage 1's single step.
- **A SECOND full 40050MB prepare at the stage boundary** (17:13:26) - the model is
  re-prepared per stage, not once per gen.

So optimising volume I/O would move none of this - the weights were already on local disk.
The cost is text-encoder load plus per-stage VRAM preparation.

## Caveat - this run is the MPI-197 worst case

LTX 2.3 **High** is bf16 and cannot fit 24GB, so aimdo streams 40GB against a 24GB card;
`models.js` says the Balanced tier exists precisely to kill this ("bf16-never-fits ->
48s@10s / 116s@20s stage boundary"). A Balanced-tier run on the same Pod would separate
"MPI-329 cold load" from "MPI-197 bf16 thrash". Do that before sizing any fix.

Local comparison for scale (different model, same session): Krea2 + style filter on a
4060 Ti local engine = 37s cold / 23s warm.


## Krea2 cold-vs-warm - the cleanest comparison (same session)

| engine | GPU | cold | warm | cold-load penalty |
|---|---|---|---|---|
| RunPod Pod (`v0.17.0-dev-cu130`, ComfyUI 0.28) | RTX 4090 24GB | **1m02s** | **8s** | **54s** |
| Local portable (ComfyUI 0.28) | RTX 4060 Ti 16GB | 37s | 23s | 14s |

Same model (Krea2), same operation (t2i), both cold from a stopped engine.

> **CORRECTION (user caught this): the two rows are NOT the same experiment.** Pod disk
> usage stayed at 42GB/84% throughout the Krea2 runs - i.e. LTX was still the staged model
> and **Krea2 was never hot-store staged**, so it read from the NETWORK VOLUME. Cause:
> `HOT_STORE_MIN_GB = 20` in `js/services/commandExecutor.js` filters the stage list to
> weights >= 20GB, and Krea2's largest file (`krea2-raw-transformer`) is **13.49GB** - it is
> never even requested. So the Pod row includes ~13.5GB of network-volume reads while the
> local row reads a local SSD. Volume I/O is a live candidate for the gap after all - the
> opposite of what the LTX section concludes for LTX.

- **Warm, the Pod is ~3x the local box** - correct and expected for 4090 vs 4060 Ti.
- **Cold, the Pod is 1.7x SLOWER than the weaker machine**, because its load penalty is
  54s against the local 14s: roughly **4x the cold-load overhead on faster hardware**.

This rules out "big model" and "slow GPU" as explanations. It does NOT rule out volume I/O
for Krea2 (see the correction above) - only for LTX, whose 42GB really was on container disk.

**The finding that matters most from this session:** `HOT_STORE_MIN_GB = 20` means our
most-used image model never benefits from the hot store. Lowering it is not free though -
`CONTAINER_DISK_GB` is 50 and LTX High alone takes 42GB, so staging Krea2 evicts LTX and we
thrash on every model switch. Size the threshold and the container disk together, and
measure a staged-Krea2 cold run before assuming it helps.

Also verified in the same session: LTX warm = 1m27s vs cold 2m40s (73s saved), so warm runs
are still load-dominated - caching what the cold run pays for does not get either model near
its sampling cost.


## THE DECISIVE RUN - staging is not the lever

Third LTX gen of the session, after a Krea2 gen ran in between.

- LTX's 42GB transformer was **still staged on container disk** (Pod disk sat at 42GB/84%
  all session and never evicted - Krea2 is below the 20GB threshold, so it never staged and
  never displaced LTX).
- Krea2 running in between evicted LTX from **VRAM**, but not from disk.
- Result: `LOADING MODEL · 1/3 · 100% · 1:57` - ~2 minutes to start generating with **zero
  network-volume reads**, on a Pod up 20+ minutes with ComfyUI already running.

### What this eliminates

| suspect | verdict |
|---|---|
| network-volume I/O | **out** - bytes were local |
| download path | **out** - nothing fetched |
| cold boot / ComfyUI startup | **out** - third gen on a warm Pod |
| hot-store not staging the model | **out** - it WAS staged |

What is left: **weight load from disk into VRAM, plus the dynamic-VRAM prep** - and it costs
~2 minutes regardless of whether the source is a network volume or local NVMe.

### Session run table (mind the resolution)

| run | resolution | state | total |
|---|---|---|---|
| `i2v_ms_001` | 512x960 | fully cold | 2m40s |
| `i2v_ms_002` | 512x960 | warm | 1m27s |
| `i2v_ms_003` | **1216x704** | VRAM-evicted, disk-staged | 3m07s |

Run 3 is at ~1.74x the pixels of runs 1-2 - it is NOT a regression against 2m40s. Load was
~1:57 of its 3m07s, leaving ~70s of sampling for the bigger frame.

### Consequence for the fix

The earlier idea of lowering `HOT_STORE_MIN_GB` so Krea2 also stages is **largely
disproven** - a disk-resident model still pays ~2 minutes. Staging changes where bytes come
from; it does not change the cost that dominates. Target the VRAM load path and the
per-stage `Model ... prepared for dynamic VRAM loading` re-prep instead.


## THE ROOT PATTERN: it is a model-SWITCH cost

Head Swap (Qwen-Edit), same Pod, same session - the worst case measured:

| phase | time |
|---|---|
| `got prompt` (17:33:41) -> inference start (17:35:56) | **135s** |
| inference, 4 steps (17:35:56 -> 17:36:01) | **5s** |
| `Prompt executed in` | **140.12s** |

**96% load** - but note the tier: this run used **Hyper** (~13% of time), so the ~5s
inference is a Hyper figure, not Qwen-Edit's baseline. On Quality the split reads closer to
75/25. The **135s load is absolute and tier-independent**, which sharpens the point: the
faster the tier a user picks, the more completely load dominates, so Hyper buys almost
nothing on a Pod. Step trace: `1/4 [01:37<04:51, 97.32s/it]`, then 1.28 / 1.56 / 1.42 s/it -
the 97s "step" is load amortised; real sampling is ~6s. This is a ~13GB-class model.

### Same model = fast. Different model = ~2 minutes.

| gen | preceded by | load |
|---|---|---|
| Krea2 (2nd) | **same model** | ~2s (8s total) |
| LTX (3rd) | Krea2 | ~117s |
| Head Swap / Qwen | LTX | ~135s |

So the cost is **switching**, not cold start, not volume I/O (staging to local disk changed
nothing), not model size (13GB behaves like 42GB).

13GB at even 1GB/s would be ~13s. 135s is an order of magnitude beyond byte movement, so
the suspect is the aimdo dynamic-VRAM path - `prepared for dynamic VRAM loading`,
`patches attached`, `Force pre-loaded N weights` - not I/O.

Supporting oddity: `Model WanVAE prepared for dynamic VRAM loading. 241MB Staged.` printed
**three times in two seconds** for one 241MB model. If prepare runs per REFERENCE rather
than per model, that is a contributor worth measuring.

### Product consequence

The Pod amortises acceptably on long video jobs (2 min against minutes of sampling) and is
near-useless for quick image edits, which is most app usage. A user alternating two models
pays the full toll on every generation. User's words: "this is making RunPod useless."

### Suggested next step

Instrument or bisect the gap between `got prompt` and step 1 on a model switch. Specifically
compare aimdo dynamic-VRAM loading against a plain full-load path for a model that fits VRAM
outright (Qwen-Edit at ~13GB fits a 24GB card with room) - if the dynamic path is being used
where a straight load would do, that is the fix.
