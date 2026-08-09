# Validation — MPI-503

**Verified:**

- `python scripts/overtaken-cards.py --selftest` → `selftest ok`. Five asserts, and the
  two that matter are negative controls: `MPI-4` must NOT match `chore(MPI-450): …` and
  `MPI-45` must NOT match `feat(MPI-456): …`. A plain substring search fails both, and it
  did — the first run of this check during the 2026-08-09 audit reported MPI-4 as
  overtaken by every MPI-45x commit. The word boundary is the whole logic.
- `python scripts/overtaken-cards.py` → `0 candidate(s)`, which is the correct answer now
  that MPI-456 and MPI-488 are closed. It reported MPI-456 before that closure, which is
  how the card was found.

**Deliberately not built:** no hook, no test file, no board write. The script reads
`board.json` and `git log` and prints. A mention is not proof that a card is done, so a
human reads the commit and the user says yes — same discipline as every other close-out
step.
