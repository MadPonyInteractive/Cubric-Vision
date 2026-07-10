# MPI-242 — validation

## Thread 0 — docs restructure (2026-07-10) — VERIFIED, auto

Verify mode: `auto` (docs-only, no runtime surface).

| check | result |
|---|---|
| `wc -l docs/krea2/*.md` — every file ≤200 | ✅ 55 / 85 / 94 / 102 / 116 / 119 (571 total) |
| `grep -rn 'krea2\.md' --include=*.md .` — no stale refs | ✅ zero hits |
| `docs/krea2.md` deleted, no stub | ✅ absent |
| all 12 intra-folder markdown links resolve | ✅ 12/12 |
| `docs/README.md` routes into `krea2/` | ✅ 6 rows (L59–64) |
| content survived the move — 18 hard-won facts spot-checked | ✅ 18/18 present |
| stale 2K "open question" removed, live verdict present | ✅ both |

`docs/krea2.md` was **untracked** (`git rm` failed with `did not match any files`), so the
split shows in git as 6 new files + a `docs/README.md` edit, not as a rename.

Content was **moved verbatim**, with three deliberate deltas the user approved or the handoff
required:

1. **The 2K open question is resolved.** Old text: *"If it materially improves at 2K, prefer
   `qualityTiers`… Cheap to test; untested."* Replaced by the live verdict (1024×2048 = 61.04 s
   @ 2.00 MP vs 896×1152 = 28.36 s @ 0.98 MP ⇒ **linear in pixels**), the two ÷16-clean 9-entry
   ratio tables, the `ratios.js:274` early-return note (Chroma needs no gating), and the
   `QUALITY_LABELS` `'1k'` gap. User instruction: *"remove that open question. The question has
   been answered."*
2. **NAG-does-not-work was added** to `conditioning-and-control.md`. It was recorded in the
   handoff traps but never existed in `krea2.md`. It is the reason thread 1 exists.
3. **The `Stylization` slider section was added** to `style-loras.md` (handoff
   `split_plan` explicitly directs this), carrying the naming rationale and the still-open
   trigger-scaling question.

## Thread 1 — negative-prompt gate

Not started.

## Thread 2 — app wiring

Not started.
