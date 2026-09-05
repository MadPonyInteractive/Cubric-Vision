# MPI-698 — H3 text encoder: int8_convrot (24.55 GiB) → nvfp4_awq (14.61 GiB)

## Why

H3 stages the text encoder **beside** the transformer, so the int8 pair sat at ~45 GB
resident at peak — at any resolution, because it is weight staging and not activations.
That SIGKILLed a 54 GB L4 Pod on `minimax-h3/t2v_ms` at 128px/1s (`code -9`, the Linux OOM
killer, found in the RunPod console's Container log) while the same op passed on an 80 GB
box in 21s. `i2v_ms` passed on that same L4 (124s) off the same graph and the same weights,
so the box was sitting right on the edge rather than failing on anything t2v-specific.

14.61 GiB takes the pair to ~35 GB, which puts a 54 GB box back in range. Windows never
showed this at all: the pagefile absorbs the overshoot, a Pod has no swap.

The 80 GB `minRamGb` floor raised in the previous session is the *mitigation*. This is the
fix.

## The file

`Comfy-Org/MiniMax-H3` → `text_encoders/qwen3vl_32b_minimax_h3_nvfp4_awq.safetensors`

| | |
|---|---|
| bytes | 15,687,142,551 (14.61 GiB / 15.69 GB) |
| sha256 | `35a88d51044231fe332301d7a62aa81e3f2cba62febeb446e2c1e3e0ef76f2c6` |
| verified | local `certutil` hash **equals** HF's `lfs.oid` for that path → byte-identical upstream, so the publisher is a legitimate `mirrorUrl` |

## `nvfp4` and Blackwell — a COMPUTE gate, not a LOAD gate

Comfy-Org's README says "This nvfp4 text encoder does not require Blackwell GPU to use."
True, but read the mechanism before relying on it — the reputation that nvfp4 is
Blackwell-only is basically correct everywhere else, and cybermotaz's own repo is tagged
`blackwell` / `cuda13`.

Verified in the engine source, not inferred (`G:/ComfyUi/ComfyUI/comfy/`, 2026-09-05):

- `model_management.supports_nvfp4_compute()` returns False unless
  `torch.cuda.get_device_properties().major >= 10` — i.e. **Blackwell sm_100+**. L4 is Ada
  (major 8) → False. RTX 5090 is major 12 → True.
- `ops.pick_operations()` does not refuse on False. It adds `"nvfp4"` to `disabled` and
  logs `Native ops: … , emulated ops: nvfp4`.
- `disabled` reaches `_load_quantized_module`, where `if module.quant_format in
  disabled_formats: module._full_precision_mm = True` (`ops.py:1153`). The packed 4-bit
  weight stays resident and is upcast per matmul.

**So the RAM saving survives on non-Blackwell hardware — you pay speed, not memory.** That
is exactly what this card needs, since the whole point is resident bytes.

**Consequence for the L4 smoke: expect it SLOWER than the 21s RTX 5090 run, and do not read
that as a regression.** The 5090 takes the native path, the L4 emulates. The question the
L4 run answers is whether it OOMs, not how fast it is. `emulated ops: nvfp4` in the Pod's
ComfyUI log is the confirmation it took the fallback path.

## Uncensored — the "Heretic" lineage was not load-bearing

The build this replaces is `ethanfel/Qwen3-VL-32B-Ultra-Heretic-H3-ComfyUI-INT8-ConvRot`,
carried for exactly one reason: uncensored output. Fabio A/B'd the two on 2026-09-05 across
uncensored and deliberately hard prompts and got **identical results**.

Consistent with what the encoder does here — H3 reads the trimmed embedding layers as a
conditioner, not the instruction-tuned refusal behaviour abliteration targets, so there was
plausibly never anything for "Heretic" to remove in this role. **But the evidence is the
A/B, not that reasoning.** Re-run the A/B before assuming a future encoder swap is equally
free.

## Licence — the chain-walk, and the trap in it

MPI-653 put the old encoder on R2 on the ground that the MiniMax CLA "does not REACH it":
the weights are Alibaba's Qwen3-VL-32B-Instruct, apache-2.0 down the chain, holding no
MiniMax weights, parameters, operational patterns or Outputs. Neither a §I.11 Model
Derivative nor §I.10 Materials. H3-*shaped* is not H3-*derived*.

**The trap: this file lives in `Comfy-Org/MiniMax-H3`, whose repo card declares the MiniMax
CLA** (`license: other`, `license_name: minimax-h3-community-license-agreement`). Taken at
face value that reads as blocking an R2 re-host, and it is the same repo the transformers
come from — the ones `assetDeps.js` explicitly says must stay publisher-hosted.

It does not block it, because the label is a repo property and the question is what the
weights ARE. Chain re-walked 2026-09-05 from Comfy-Org's own README ("converted from
https://huggingface.co/cybermotaz/Qwen3-VL-32B-Instruct-NVFP4"):

| repo | declares |
|---|---|
| `Qwen/Qwen3-VL-32B-Instruct` | `apache-2.0` |
| `cybermotaz/Qwen3-VL-32B-Instruct-NVFP4` | `license_name: qwen`, `license_link` → that same Qwen LICENSE |
| `Comfy-Org/MiniMax-H3` | blanket `minimax-h3-community-license-agreement` over a repo that mostly holds MiniMax transformers |

Alibaba's model does not become MiniMax's by being repackaged into a MiniMax-labelled repo.

**What travels from this decision is the chain-walk, never the hostname.** It is emphatically
not a precedent for "files from Comfy-Org/MiniMax-H3 can go on R2" — the transformers in
that same repo are MiniMax's own weights and §III still governs them. Written into the
`assetDeps.js` section header in those terms because that is exactly how the next reader
will get it wrong.

## Shape of the change

New dep id `h3-qwen3vl-32b-clip-nvfp4`; the old `h3-qwen3vl-32b-clip` entry is **kept,
unreferenced**. That is deliberate and it is the same rule as `vae-minimax-h3-video`:
`_orphanedDepIds` walks `Object.keys(DEPS)` and resolves each `filename`, so a file on disk
whose filename is in no DEPS entry is invisible to the sweep forever. Deleting the entry
would strand 24.55 GB on every existing H3 user's disk — the largest orphan the catalogue
would ever have had. Present-but-unreferenced is what RECLAIMS it on the next uninstall
sweep.

Both of the old entry's URLs stay live: `release:deps` HEADs every URL in DEPS, and the old
R2 object is not to be deleted while that entry stands (an R2 delete needs Fabio's approval
regardless).

## Ownership — read before editing

`comfy_workflows/` is **NOT this card's**. Fabio re-points `clip_name` in the graphs himself
and has an agent syncing them (his instruction, 2026-09-05). This card touched no workflow
JSON and not `generate_h3.py`.

**Consequence, and it is a real one:** between the two halves landing, the shipped graphs
still name `qwen3vl_32b_h3_ultra_uncensored_heretic_int8_convrot.safetensors` while the
installer now fetches `qwen3vl_32b_minimax_h3_nvfp4_awq.safetensors`. On a fresh install
that is a CLIPLoader failure. **Both halves must be committed before the L4 smoke runs**, or
the run measures the mismatch instead of the encoder.

CI catches this **for the Flow only, and that is the trap.** `tests/flow-model-choice.test.cjs`
("the Extend Video pick selects the GRAPH, not just params", MPI-591) walks every
`Input_*`-bearing Flow arm and asserts each `unet_name`/`lora_name`/`vae_name`/`clip_name`
basename is supplied by a dependency of that model. With the dep swapped and the graphs not,
it fails exactly as designed — 901/902, one red, measured 2026-09-05.

But it iterates **Flow** graphs. `minimax_h3_fl2va.json` and `minimax_h3_r2va.json` are model
workflows and no test walks them the same way: `scripts/verify-workflow.mjs` judges a graph
against a live engine's `object_info` (what is on disk right now), not against `DEPS`, and
reports notes rather than failures unless `--strict`. So **the Flow will shout and the two
model graphs will not** — a miss on either of those two is silent until a generation runs.
Worth extending that assertion to model workflows; not this card.
