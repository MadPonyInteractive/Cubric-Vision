# MPI-498 - PiD + SDXL-4K never generated

UMBRELLA: MPI-467 (the 1.4 smoke umbrella). Found live 2026-08-08 by the node_errors guard the MPI-495 session suggested, on its FIRST run - the op had 'PASSED' the previous matrix at 4s/1-out.

THE DEFECT. MpiScaledDimensions declares upscale_method as a REQUIRED input (enum lanczos/bicubic/bilinear/nearest-exact/area, default lanczos, ComfyUi-MpiNodes img.py:219). The shipped graphs never supply it:
  comfy_workflows/nvidia_pid.json  - nodes 1609, 1618, 1619, 1623 (sizes 1024, 1024, 2048, 4096)
  comfy_workflows/flow_sdxl_4k.json - nodes 1603, 1615
Each supplies image/size/side only. ComfyUI rejects the node, DROPS whatever output depends on it, and executes the rest of the graph - so the op returns media and reads as a clean success. Smoke evidence for the failing run:
  FAIL nvidia-pid/pid - partial validation: MpiScaledDimensions.upscale_method (x4)

IT IS NOT THE PIN BUMP, AND IT IS LIVE IN THE RELEASED APP. upscale_method became required in ba9e156 on 2026-07-16, which is an ancestor of ALL THREE pins:
  69a43336 (2026-07-27) - SHIPS IN v1.3.0 AND v1.3.1        -> has it
  a6e5d5e0 (the pre-bump pin)                                -> has it
  43a976fd (current, MPI-467)                                -> has it
So every 1.3.0/1.3.1 user running PiD has had its scaled-dimension branches dead for three weeks. The first write of this finding blamed the MPI-467 pin bump; that was WRONG and is recorded here so nobody re-derives it.

FIX 1 (immediate, product change - NOT taken without the user's go). Add "upscale_method": "lanczos" to all six nodes. lanczos is the node's OWN default, so this restores the intended behaviour rather than choosing new behaviour. Verify by re-running nvidia-pid/pid and flow_sdxl_4k and confirming no partial validation.

FIX 2 (the ROOT fix, and the one that matters). Gate 8 in scripts/smoke-workflows.mjs checks that every Mpi* class_type EXISTS at the pinned commit. It does not check that the graph supplies the node's REQUIRED INPUTS. That gap is why this survived two releases and two GPU matrices: class existence was never the failing condition. Extend gate 8 to diff each Mpi* node's required inputs against INPUT_TYPES at the pinned commit - it reproduces this OFFLINE, FREE, on --plan, exactly as the class check already reproduces a missing class.

WIDER SWEEP OWED before closing: this was found for ONE node on ONE op because that op happened to be in the smoke set. Every Mpi* node in every shipped graph needs the same required-input check - fix 2 IS that sweep, which is why it is the root fix and not a nice-to-have.

SEVERITY SETTLED 2026-08-08, OFFLINE, NO POD. Supersedes this card's earlier 'impact unconfirmed' AND
its 'wrong resolution' hypothesis - both were wrong. The op produced NOTHING.

WHY A DROPPED NODE STILL RETURNED AN IMAGE. MpiLoadImageFromPath subclasses PreviewImage and sets
OUTPUT_NODE = True (ComfyUi-MpiNodes img.py:380), so the INPUT LOADER is itself an output node.
ComfyUI validates per output node and accepts the prompt as soon as ONE survives (execution.py
validate_prompt). Reachability, computed from the shipped graphs:
  nvidia_pid.json   1580 PreviewImage           <- 1609/1618/1619/1623  INVALID, dropped
                    1626 MpiLoadImageFromPath    <- nothing              VALID -> good output
  flow_sdxl_4k.json 1608 / 1624 / 1626 PreviewImage <- 1603/1615        INVALID, all three dropped
                    1678 / 1680 MpiLoadImageFromPath                     VALID -> good outputs
So ComfyUI answered 200 + prompt_id + node_errors, queued the prompt, and executed ONLY the loader
branch. The 'image PiD returned on both matrices' was the loader echoing the INPUT image back as its
in-graph preview - never a generation. That is why it took 4s. A released 1.3.0/1.3.1 user running PiD
got their source image back unchanged. The MPI-495 node_errors guard is NOT in 1.3.1, so nothing
warned them.

A DEFAULT DOES NOT RESCUE A MISSING KEY. upscale_method's default IS lanczos, in INPUT_TYPES and in the
Python signature (compute(self, image, size, side, upscale_method='lanczos')). Neither is ever consulted:
execution.py:901 tests `if x not in inputs` and appends required_input_missing BEFORE any default is
read, and the node never executes. Key present-but-unset -> lanczos; key ABSENT from the JSON -> node
invalid. That is also why the fix changes no behaviour - it writes the value the node would have used.

ROOT CAUSE (not the converter, not the app, not the pin bump). Timeline:
  2026-07-03 05:08  raw NVIDIA_PID authored - node had 2 widgets - widgets_values [size, side]
  2026-07-16 21:58  ba9e156 adds upscale_method as a 3rd REQUIRED widget
  2026-07-17 10:42  26e59031 syncs 18 raw files incl. nvidia_pid.json - content unchanged
  2026-07-17 10:54  ab9caa71 'add required block_if_empty to all MpiLoad* nodes' - THE SAME BUG CLASS,
                    hand-patched 12 minutes later on different nodes, with no sweep for others
  2026-08-07 06:01  78d56890 (MPI-466) adds workflow-to-api.mjs's missing-required self-check
scripts/workflow-to-api.mjs emitted a CORRECT graph for the schema that existed when it ran. The hole is
that a node-pack change adding a required input does not force a re-export of the graphs already frozen
on disk, and nothing checks shipped graphs against the pinned node schema. Re-running the converter
today would refuse (raw has 2 positional values for 3 widgets -> vi >= vals.length -> break ->
self-check throws), but only if someone re-runs it.

NOT A COUNTEREXAMPLE - the ComfyUI editor. Opening the graph at 127.0.0.1:48188 shows upscale_method
lanczos on every node. The litegraph frontend materializes a missing widget from the node's default at
load and writes all three back on save (engine/.../user/default/workflows/nvidia_pid.json, gitignored,
is such a save). The editor can never tell you what was SERIALIZED. Three copies not opened in a current
editor all held 2 values: repo raw @ HEAD, G:/ComfyUi/.../NVIDIA_PID.json (2026-07-03),
G:/ComfyUi/_workflow_backup_pre_v0.29.2/NVIDIA_PID.json (2026-08-01).

FIX 1 DONE 2026-08-08. upscale_method: lanczos (the node's own default) on all six API nodes AND their
raw twins - raw matters because the converter consumes widgets_values positionally, so leaving raw short
means the next re-export drops the input again:
  comfy_workflows/nvidia_pid.json        1609 1618 1619 1623
  comfy_workflows/flow_sdxl_4k.json      1603 1615
  comfy_workflows/raw/nvidia_pid.json    widgets_values 3rd slot x4
  comfy_workflows/raw/flow_sdxl_4k.json  widgets_values 3rd slot x2
VERIFIED by an AST sweep of every Mpi* class's required inputs against every shipped API graph: 6 nodes
flagged against HEAD, 0 against the working tree. GPU re-run still owed (Pod held by the live matrix) -
expect nvidia-pid/pid to go from 4s/1-media to a real generation time.

FIX 2 IS MPI-467's, NOT THIS CARD's. Gate 8 lives in scripts/smoke-workflows.mjs, owned by MPI-467 with
a live matrix running from it. Messaged rather than edited. One extra finding for whoever takes it:
~120 Mpi* nodes across the shipped graphs build INPUT_TYPES PROGRAMMATICALLY (MpiAnySwitch,
MpiAnySwitch10, MpiPacker, MpiClearVram, MpiSimpleBoolean, MpiBoolean), so a static parse of the pinned
source sees no required-input literal for any of them. Gate 8 must EXECUTE INPUT_TYPES at the pinned
commit, or read /object_info, not parse source - otherwise the sweep silently skips the majority of
first-party nodes.

NO CHANGELOG LINE YET - waiting on the GPU re-run.
