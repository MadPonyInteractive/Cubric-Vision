# MPI-4 — LTX 2.3 video model integration

> **SESSION HELPER / CONTINUE CARD.** This card drives the LTX-2.3 work. The
> sequencing lock ("post-release only") is LIFTED — v1.0.0 shipped (2026-06-10),
> we're post-release. Read this whole file to resume in a fresh session.

## Session note (2026-06-21) — PARKED mid-deconstruction

Started deconstructing the NerdyRodent monolith into per-op app workflows. Two
decisions LOCKED this session before parking:

1. **i2v/t2v ship as SEPARATE files, NOT one boolean-switched workflow.** Reason:
   app maps op→workflow file 1:1 (`model.workflows[op]`, `supportedOps`), and
   Comfy `/prompt` has no runtime node-bypass, so a single boolean-branched file
   still executes both branches' graph. Two files = zero new app plumbing, matches
   WAN. Confirmed against `commandRegistry.js` (`t2v`/`i2v`/`_ms` ops) + `models.js`
   (WAN i2v/t2v each declare one workflow per op).
2. **LTX is multi-stage `_ms`** → 4 files total: `LTX23_i2v.json` +
   `LTX23_i2v_stage2.json` + `LTX23_t2v.json` + `LTX23_t2v_stage2.json`. Every
   NEW app-read/write node carries `Input_*`/`Output_*` prefix (Tier-1 reserved
   titles stay bare — `Preview_Only`, `SaveLatent`, `LoadLatent`, `Seed`,
   `Positive`, `Negative`, `Duration`, `Motion_Intensity`, `Start_Frame`,
   `End_Frame`, `Lora_*`, `Output`, `Output_Video`, `Output_Audio`, `Preview`).
   `allowsBranchingContinue = false` (no per-stage LoRA variance) → Finish-only.

**Why parked:** the manual ComfyUI steps to derive the `_stage2` API file (bypass
stage-1 KSampler, set `Is_Continue`, re-export) are error-prone and forgettable.
Pivoted to building a **workflow-generation orchestrator** first (separate effort,
own card if it grows) so stage-2 derivation is mechanical. Once that exists, come
back here and author the 4 LTX files through it. The rgthree strip (item 2 below)
is still the gate before app integration.

## Where we are (as of 2026-06-19)

LTX-2.3 (NerdyRodent) ComfyUI video workflow is being **authored + validated on the
RunPod Builder Pod + the local rig**, not yet integrated into the app. This session
locked the **model precision decisions** and got the Builder image + scripts to a
clean, reproducible state. The big remaining piece is **stripping the workflow down
to app-compatible nodes** (remove rgthree, replace with vanilla + MpiNodes), then the
actual **app integration** per the original scope (bottom of this file).

### Done this session
- Builder image **`v0.1.6-cu130`** built + pushed (GHCR digest `sha256:e08c4f41…`).
  Template `2brluktxb4` → user bumping to v0.1.6. Validated on a real RTX 3090 (drv 580).
- Builder fixes: Jupyter terminal+upload, example.png seed, KJNodes load-after-boot,
  rgthree added, **kornia==0.8.2 pin** (LTXVideo `pad` import — kornia 0.8.3 removed it).
- **Model precision LOCKED** (post A/B on 3090 + local RTX 4060 Ti 16GB):
  - diffusion = **full bf16 ONLY** (fp8 rejected "quality is crap"; mxfp8 Blackwell-only)
  - gemma = **fp8_scaled ONLY** for video AND audio (fp4 degrades, full over-influences)
  - abliterated LoRA = the **heretic** variant (node wanted it; script had wrong name)
  - min spec: **16GB+ VRAM + ~32GB+ system RAM** (full bf16 runs via RAM offload)
  - timings: 5090 ~20-30s / 3090·4090 ~60s / 4060Ti ~175s per 2s video
- Local authoring rig (G:\ComfyUi) has the COMPLETE final model set + all nodes +
  kornia 0.8.2; the full workflow runs locally.
- `install_nodes.sh` + `install_models_ltx23.sh` trimmed to the final ~68GB set,
  committed to **mpi-ci main** (`2324adc`, on top of `83e2964`).
- Workflow JSON saved by the user (the authored `LTX-2.3_nerdyRodent.json`).

### NOT done yet (next sessions)
1. **Test the remaining workflow branches** — face-swap (BFS LoRAs) + ControlNet
   (IC-LoRA union). Validate BEFORE stripping (a node removed might be load-bearing for
   an untested branch). User does this locally first; remote only when speed is needed.
2. **rgthree strip** (the big one) — replace rgthree's Power Lora Loader + Set/Get
   virtual reroutes + on/off switches with **vanilla ComfyUI + MpiNodes**, so the app
   workflow has ZERO rgthree dependency (rgthree is Builder-authoring-only, never an app
   dep). Big workflow, full evaluation needed. Claude can do/assist the strip from the
   saved JSON — work on the NORMAL export (not API export); node positions may shift,
   that's fine (user follows the wires). One swap at a time, keep links valid,
   verify-able chunks.
3. **App integration** (the ORIGINAL MPI-4 scope, still valid — see bottom).

## Files to read first (fresh session)
- This brief.
- Memory (`C:\Users\Fabio\.claude\projects\c--AI-Mpi-Cubric-Vision\memory\`):
  - `project_ltx23_model_precision_choice.md` — ALL A/B findings, timings, min spec,
    final keep-set + WHY. **Read before touching the model list.**
  - `project_ltxvideo_kornia_pad.md` — the kornia==0.8.2 fix + the two wrong fixes
    never to repeat.
  - `project_builder_image_flow.md` — Builder image (v0.1.6, thin-base cu130, Jupyter,
    pkill-cascade warning, KJNodes stale-boot, example.png).
  - `project_builder_install_scripts.md` — canonical script location + update procedure.
- Scripts (canonical, in the SEPARATE mpi-ci repo):
  - `c:\AI\Mpi\mpi-ci\cubric-vision-builder\install_nodes.sh`
  - `c:\AI\Mpi\mpi-ci\cubric-vision-builder\install_models_ltx23.sh`
  - `c:\AI\Mpi\mpi-ci\cubric-vision-builder\README.md`
- App injection contract: `.claude/rules/comfy_injection.md` § "Multi-stage video workflows".
- Saved workflow JSON: `LTX-2.3_nerdyRodent.json` (user has it locally; needed for the strip).

## Related cards
- **MPI-117** (doing) — node version-lock for local + RunPod installs. ANOTHER agent is
  on this (RunPod branch only). The Builder's per-node pins (RES4LYF SHA, kornia 0.8.2,
  rgthree) feed into 117's lock design. Coordinate; don't double-edit install scripts.
- **MPI-118** — app ComfyUI bump to v0.25.1 (the core the Builder already pins).

## Constraints (carry forward)
- Live Pod create/delete/deploy = **USER-only**; image build/push is fine for Claude.
- All RunPod work lands on the **RunPod branch** (Cubric-Vision), never master. The
  Builder scripts live in the **mpi-ci** repo (separate; commit by explicit pathspec).
- Builder = cu130, product Pod = cu128 — CUDA differing is fine (workflows port by
  ComfyUI+node version, not CUDA).
- Next Pod: **80GB volume** is enough for the ~68GB final set (user: no separate network
  volume, to avoid data-center lock-in; terminate-on-delete). **Enable Global
  Networking = OFF** (pod-to-pod feature, not needed for a single authoring Builder).

---

## Original scope (still valid — the app-integration target)

Register LTX 2.3 as a video model once `comfy_workflows/LTX23_t2v.json` (+
`LTX23_t2v_stage2.json`) and `LTX23_i2v.json` (+ `LTX23_i2v_stage2.json`) exist.

> **GENERATE these 4 files via the workflow-generation system — do NOT hand-author
> the stage-2 siblings.** (Built 2026-06-21 for WAN; see
> `comfy_workflows/scripts/workflow_generation/README.md`.) The system already turns a
> stage-1 API export into stage-1 + derived stage-2 mechanically (bypass the
> `Stage1_Bypass` node, flip `Is_Continue`), title-keyed, never by node ID.
> **LTX task for the agent:** add a `generate_ltx.py` handler (model it on
> `generate_wan.py`) that converts the user's LTX template(s) into the 4 files, then
> register `("LTX23_", "ltx")` in `registry.py`. Decide whether LTX's stage-2 is the
> same single-sampler bypass (reuse the WAN splice) or a different graph (encode a new
> `SLOT_TO_INPUT` table + assert on surprise). Verify the handler output against ONE
> hand-authored stage-2 (semantic node-set + per-node `inputs`/`_meta` equality) before
> trusting it — that byte-equivalence check is how WAN was proven. See the README's
> "Adding a new model family" section for the full checklist.

- Two-file multi-stage contract: stage-1 file contains
  `Preview_Only` + `SaveLatent` + `Preview` + `Output`; stage-2 sibling is **derived
  by the generator** (was: hand-authored by bypassing the stage-1 KSampler in ComfyUI
  and Save (API)). See `.claude/rules/comfy_injection.md` § "Multi-stage video workflows".
- Standard flat LoRA shape (not staged WAN-style). stage-2 LoRAs don't vary the result
  for LTX → set `commands[op].allowsBranchingContinue = false` so preview cards expose
  only Discard + Finish (no Continue). Finish replaces the preview with the final video
  via `replaceItemId`.
- When LTX-class image models are added (future, lower-grade-GPU image ops), they get
  the same treatment: two-file `_ms` workflow, Finish-only preview card.
- New nodes must obey the two-tier naming law (Input_*/Output_* for non-Tier-1) — see
  memory `feedback_comfy_node_naming_law`.

(Originally deferred from the WAN dual-model + 12 LoRAs plan; sequencing lock 2026-05-21
"post-release only" is now LIFTED — v1.0.0 public release shipped 2026-06-10.)
