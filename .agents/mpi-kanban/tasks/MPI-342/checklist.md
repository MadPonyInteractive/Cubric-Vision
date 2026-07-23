# MPI-342 Checklist

Derived from `plan.md`. Detail/evidence for every item lives in `validation.md`.

- [x] Phase 1 - Pin edits (4 sites, one pass) - auto-verified 2026-07-23
- [x] Phase 2 - CI dev image build, both legs green (runs 29998306717 cu130 + cpu)
- [x] Phase 3 - MPI-341's four checks
  - [x] 3.1 smoke layer passes on the clean dev build
  - [x] 3.2 unpin-kornia proof that the gate BITES (run 30028617382 RED at smoke layer, LTXVideo IMPORT FAILED)
  - [x] 3.3 `+cu130` trio + `/opt/constraints.txt` in the FINAL image
  - [x] 3.4 one LTX gen on the dev Pod
- [x] Phase 4 - MPI-340 build-gated dev-tag leg (both GPU + CPU proven live)
- [x] Phase 5 - workflow sweep on ComfyUI 0.28 (gap stated: standalone Qwen-Edit, Wan 2.2)
