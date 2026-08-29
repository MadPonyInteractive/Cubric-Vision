# MPI-605 checklist

## Blocker cleared (2026-08-29)

- [x] Core moved past 0.31.0 — `dev_configs/node_lock.json` → `comfyui.core.tag` = **v0.34.0**;
      the `G:\ComfyUi` bench reads 0.34.2.
- [x] `ModelAttentionBackend` present — `comfy_extras/nodes_model_advanced.py:369`. Enum is
      `pytorch attention` | `comfy kitchen attention`, the latter mapping to the registered
      backend `comfy_kitchen_int8`. Second mode is gated on
      `COMFY_KITCHEN_INT8_ATTENTION_IS_AVAILABLE`.
- [x] **Install cost is zero.** `comfy-kitchen==0.2.31` is line 25 of ComfyUI's own
      `requirements.txt` — a prebuilt wheel, already resolved by every engine install. No nvcc,
      no source build, no per-shape JIT. That is what kills all four Sage rejections at once
      (MPI-50, MPI-189, MPI-145, and the Windows embedded-py3.13 2x-slower tax).
- [x] `comfy_kitchen.int8_attention_is_available()` → **True** on the RTX 4060 Ti, sm_89
      (`torch 2.12.0+cu130`). Gate is SM75+ (`sage_attention.py:_NATIVE_MINIMUM_CAPABILITY`).
      sm_89 is the exact arch where `--use-sage-attention` crashed LTX-2.3 in MPI-145.
- [x] Per-graph, not a launch flag — `set_model_optimized_attention` writes
      `model_options["transformer_options"]["optimized_attention_override"]`
      (`comfy/model_patcher.py:694`), and `clone()` deep-copies `model_options`
      (`model_patcher.py:453`), so the override survives the whole LoRA chain.

## LTX measurement (2026-08-29, Fabio, live)

Engine: the **app local engine on 48188**, not the `G:\ComfyUi` bench. LTX 2.3, image-to-video,
**704x1260**. `n=1` per cell unless noted.

| Clip | Config | Cold | Warm |
|---|---|---|---|
| 2s | comfy kitchen | 128 | 92 |
| 2s | pytorch | 127 | 99, then 94 (different seed) |
| 5s | comfy kitchen | 165 | **142**, 139 (3rd run) |
| 5s | pytorch | 184 | **159** |

- **2s is a null result.** 92 vs 94 sits inside the baseline's own 99→94 spread.
- **5s is a real win: ~1.13x end-to-end** (159 → ~140 warm, 17-19s saved; cold and warm agree
  to within half a percentage point, which is the corroboration a single cell does not give).
- The delta is **duration-driven**, as predicted: attention work grows ~O(tokens²) while the
  INT8 quantize tax grows ~O(tokens), so the ratio improves with clip length. This is the
  reason the 2s run showed nothing, and the reason a LoRA-heavy graph will show a *smaller*
  percentage (LoRA cost is weight patching and memory bandwidth, not attention — it grows the
  denominator only).

### Why LTX only sees ~13% — root cause, not a guess

comfy-kitchen ships **two** INT8 paths. The fast one hoists K/V quantization out of the
per-call loop via `AttentionTensorContainer`
(`comfy/ldm/modules/attention.py:190`, inherited by an override at `model_patcher.py:692`).

```
grep -rln "AttentionTensorContainer" comfy/ldm/
  → comfy/ldm/minimax/model.py      (only hit)
  → nothing in comfy/ldm/lightricks/
```

LTX therefore takes the **slow** path: Q/K/V re-quantized on every attention call, every
block, every step. It pays the INT8 tax and skips the INT8 discount. ~13% is the floor for
LTX, not the ceiling for the backend.

- [x] Quality — visible but slight degradation at 2s (Fabio, eyeball). Confirms the backend
      genuinely engaged; a null run would look identical. Consistent with the card's INT8
      premise: `ltx_i2v_t2v_int8.json` already ships, so this weight stack has accepted that
      floor already.

## Which models can even see this node (2026-08-29)

The override only reaches a model whose attention call sites pass `transformer_options`
through — `wrap_attn` (`comfy/ldm/modules/attention.py:181-192`) reads the override out of
those kwargs and nowhere else. Measured by call site:

| Module | Honours the node | Kitchen's fast path |
|---|---|---|
| `comfy/ldm/minimax/` (H3) | yes | **yes** — only module in core building `AttentionTensorContainer` |
| `comfy/ldm/lightricks/` (LTX) | yes (7 sites incl. the guide-mask helper) | no |
| `comfy/ldm/wan/` (WAN) | yes — 7 override-capable sites | no |
| `comfy/ldm/audio/` | yes — 3 sites | no |
| **`comfy/ldm/minimax_music/`** | **NO — the node is a silent no-op** | n/a |
| `comfy/ldm/ace/`, `comfy/ldm/mmaudio/` | no override-capable sites | n/a |

**MiniMax Music will not respond to this node.** `minimax_music/ar.py:71` and
`minimax_music/dit.py:88` call `optimized_attention_for_device(...)` and then invoke the
returned function **without** `transformer_options`, so `wrap_attn` never sees the override.
`optimized_attention_for_device` (`attention.py:902`) also short-circuits to `attention_pytorch`
outright when `small_input=True`, which `ar.py` passes. Adding the node to a music graph will
queue, run, report success and change nothing. Do not bench it expecting a delta; it needs an
upstream change to thread `transformer_options`, which is a core PR, not our call.

## Safe on hardware that cannot run it

`patch()` (`nodes_model_advanced.py:388-398`) resolves the backend by name and falls back to
PyTorch attention with a logged warning when it is unregistered, and `VALIDATE_INPUTS` always
returns True. So a shipped graph carrying `comfy kitchen attention` degrades cleanly on a
pre-SM75 card or an AMD device without matrix cores — it does not fail the graph. That is what
makes it shippable in a template at all.

## Fabio's export, 2026-08-29 — SYNCED

`comfy_workflows/raw/ltx_i2v_t2v_template.json` is modified in the working tree. Diff is
220 nodes before and after, because the export **replaced** a node rather than inserting one:

- removed: id 367, `MpiReroute` titled **`Model_Connect`**
- added: id 641, `ModelAttentionBackend`, widget `comfy kitchen attention`, `1106 → 641 → 1107`

`generate_ltx.py` does **not** reference `Model_Connect` — the `_select_loader()` repointing
from MPI-165 is historical; the generator now stamps one `UNET_LOADER_TITLE` node's
`unet_name`/`weight_dtype` per tier. So the tier split does not break. But `Model_Connect` is
the documented insertion anchor in two live docs
(`docs/models/ltx/workflow-authoring.md:23`, `docs/builder/05-author-and-test.md:59`:
"insert AFTER `Model_Connect` reroute ... `UNETLoader → Model_Connect →
MpiVideoSamplingPreview → rest`"), and it is still present in both shipped twins.
**Resolved: the reroute was dead weight and stays deleted.** Fabio, 2026-08-29 — it was
created for an approach where two loaders both connected into it, and that approach is gone.
Both docs were corrected to the real chain rather than the reroute being reinstated.

Synced with `COMFY_URL=http://127.0.0.1:48188 node scripts/sync-raw-workflows.mjs`
(git-driven; commits raw by pathspec, stages generated). Injection rules pass; both tiers
rebuilt. Verified in each runtime file:

| File | `ModelAttentionBackend` | `Model_Connect` |
|---|---|---|
| `comfy_workflows/ltx_i2v_t2v.json` | node 641, `comfy kitchen attention` | absent |
| `comfy_workflows/ltx_i2v_t2v_int8.json` | node 641, `comfy kitchen attention` | absent |

Final chain: `UNETLoader (4) → ModelAttentionBackend (641) → MpiVideoSamplingPreview (366)`.

## Still open

- [ ] One repeat of the **5s pytorch** cell at a new paired seed — kitchen is n=3 (142/139),
      the baseline is still n=1 (159).
- [ ] Quality A/B **at 5s**, same seed both configs, on a face or fine texture. Longer clip =
      more accumulated approximation than the 2s look.
- [ ] Longest clip LTX will actually do. If the curve keeps climbing (2s ≈ 0%, 5s ≈ 13%), the
      product answer changes from "nice" to "ship it on".
- [ ] **H3** — the only model in core wired for the container path, and the only non-distilled
      video model in the fleet. Expected to beat LTX's 13% on the same node.
- [ ] Node placement in a shipped graph: functionally identical anywhere in the chain, but it
      belongs **last, immediately before the sampler/guider** — from the head of the chain,
      toggling it invalidates every downstream node and re-applies the LoRAs (a 10GB Sulfor
      re-patch measured as if it were attention, `tool_benchmark_comfy_graph_changes` trap 2).
- [ ] If it lands: workflow-authoring change, one node per template, per model, opt-in —
      `docs/workflow-authoring/` — then a smoke run (`/mpi-bump-engine`), since it touches
      every graph it enters.
