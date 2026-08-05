# MPI-440 Validation

Umbrella card. It has no test of its own — it closes when its members close, and
**every member was validated in the app by the user**, each with its own
`validation.md`. This file records that and points at them.

| Member | Shipped | Evidence |
|---|---|---|
| MPI-426 — a detection preview stays a preview | 2026-08-04 | commit `f64fc75e`, `tasks/MPI-426/validation.md` |
| MPI-441 — Grow/Shrink/Edge stop rounding the mask off (`_morph` deleted, exact distance field) | 2026-08-04 | `tasks/MPI-441/validation.md` |
| MPI-436 — Adjust for the paint layer (grow / shrink / edge band over RGBA) | 2026-08-04 | commit `e3cab0f5`, `tasks/MPI-436/validation.md` |
| MPI-421 — auto-mask run cost + feedback (`ImpactSEGSPicker` deleted) | 2026-08-04 | commit `1028b958`, `tasks/MPI-421/validation.md` |
| MPI-445 — paint Adjust no longer stalls at 4096 | 2026-08-04 | `tasks/MPI-445/` |
| MPI-439 — convert mask to paint / paint to mask | 2026-08-04 | commit `e2ee039d` |
| MPI-435 — ten procedural alpha brushes on the one shared dab | 2026-08-05 | commit `fb0cf4c4`, plus `df40e6f5` (preset list opens down) |

MPI-435 was the last member; `e6229bd3` recorded it. The card then sat in `doing`
with nothing left in it, which is why **MPI-450 Gate D** closes it.

What the umbrella set out to prove — that the paint layer got the frame from MPI-424
but not the parity — is answered: Adjust, the alpha brushes and the shape gizmo now
run on both mounts off one engine each, the two layers exchange content in both
directions, and the detection preview honours the preview contract.

The user-facing result is in `docs/releases/UNRELEASED.md` (the mask-toolkit and
Paint bullets); the subsystem detail is in `docs/masking-tools.md`,
`docs/masking-adjust.md` and `docs/painting.md`.
