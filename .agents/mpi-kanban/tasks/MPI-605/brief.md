# MPI-605 - ModelAttentionBackend / "comfy kitchen attention"

## Source

Benji's AI Playground, "ComfyUI New Built-In Comfy Kitchen Attention Mode - Speed
and Quality Together" (2026-08-21). Node in the video: `ModelAttentionBackend`,
one `MODEL` in / `MODEL` out, single widget `attention` set to
`comfy kitchen attention`. Sits inline before the guider/sampler, alongside
`ModelSamplingMiniMaxH3` in the shown graph.

**Corrected claim:** it is *not* faster than SageAttention. It is *almost as
fast*. Fabio corrected this at card creation - do not carry the "even faster"
framing forward.

## Why this is worth a card anyway

Speed vs Sage is the wrong axis for Vision, because **Vision does not have
Sage.** It has been rejected four times, never on speed:

| Card | Where | Why rejected |
|---|---|---|
| MPI-50 | Local engine | Never installs it - needs nvcc + matching CUDA, Ampere+ only, changes workflows |
| MPI-189 | Product Pod (cu130) | Source build unreliable in GPU-less Docker; Pod ships **SDPA fallback** |
| MPI-145 | Ada sm_89 (4090 / 4060 Ti) | `--use-sage-attention` crashes LTX-2.3, `CUDA error: unspecified launch failure` -> engine dies -> misleading "engine disconnected" dialog. Gated by `SAGE_DISABLED_ARCHS` (default `sm_89`) |
| (build log) | Windows embedded py3.13 | `--use-sage-attention` makes gens **~2x SLOWER** - JIT compile per shape, no compiler shipped, pure overhead. Flag removed from the launcher |

So the real comparison is **kitchen attention vs PyTorch SDPA**, which is what
almost every Vision user is actually running today. A backend built into core
costs no wheel, no nvcc, no arch gate.

Second structural win: this is a **node**, not a launch flag. Every prior Sage
attempt was global (`--use-sage-attention`), which is exactly why MPI-145 took
the whole engine down on one arch. A node is per-graph, per-model opt-in, and
reversible by deleting it.

Third, and it softens the one objection that could kill this: **most Vision
models ship INT8 already** (Fabio, at card creation). The standing complaint
against approximate attention is precision loss - it is literally why
`MiniMaxH3MemoryEfficientSageAttentionPatch` was rejected in
`docs/models/h3/performance.md` ("quantizes Q/K to int8 and V to fp8 ... it is
approximate"). On an int8 weight stack that floor is already accepted, so the
marginal quality cost of an approximate attention path is much smaller than the
same argument implies on an fp16 stack. Do not treat "it is approximate" as a
finished rejection here - measure it (step 3 below), per model, against what
that model already is.

## NOT a re-test of SageAttention

`docs/models/h3/performance.md` ends with "Do not re-test SageAttention." That
line stands and this card does not violate it. Different code path, different
install story, and the H3 rejection there was of
`MiniMaxH3MemoryEfficientSageAttentionPatch` (a node pack) on the grounds that
`sageattention` is not installed - which is the point being removed here.

## Blocked until

`ModelAttentionBackend` is **absent** from `comfy/` and `comfy_extras/` in
ComfyUI **v0.31.0** - verified 2026-08-22 against the `G:\ComfyUi` bench
(`comfyui_version.py` = `0.31.0`), which matches
`dev_configs/node_lock.json` -> `comfyui.core.tag` = `v0.31.0`
(`43cb4fffc89bba20ab7bd61467a36d0339338dab`).

Unblocks on the next core bump past 0.31.0. First action when unblocked is to
re-run that same grep against the new tag before anything else.

## Work when unblocked

1. Confirm the node exists in the bumped core; read its `attention` enum (what
   other modes ship beside `comfy kitchen attention`).
2. Bench on the standalone `G:\ComfyUi` install (port 8188) - **not** the app
   engine. Read `~/.claude/memory/tool_benchmark_comfy_graph_changes.md` first:
   run 1 after the flip is not warm, same seed + graph gives
   `execution_cached`, and wall clock is ~73% constant load so a sampling-only
   win reads far smaller end-to-end. **Quote end-to-end first.**
3. Quality check, not just speed - the video's own pitch is "speed *and*
   quality", which means quality is a variable, i.e. it can move the wrong way.
   Same seed, A/B the pixels.
4. If it pays: it is a workflow-authoring change (one node per template), so it
   goes through `docs/workflow-authoring/`, per model, opt-in - never a global
   launch flag. Then it needs a smoke run (`/mpi-bump-engine`) because it
   touches every graph it lands in.
5. If it does not pay, record the measured numbers here and close as rejected,
   so this is not re-litigated a fifth time.
