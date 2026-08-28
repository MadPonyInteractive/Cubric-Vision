# MPI-642 checklist

- [x] `scripts/mutate-check.mjs` — one file, one replacement, one command, restore in `finally` verified byte-identical.
- [x] Absent target -> exit 2 and a loud message (never a verdict).
- [x] `--from-file` / `--to-file` for text Git Bash would mangle; `--to` omitted deletes.
- [x] `--self-check` proves BOTH verdicts and both restores on a temp file.
- [x] Proven on a real mutation: deleting `line-height: normal` kills the MPI-641 spec, file restored clean.
- [x] `docs/testing.md` — traps 4 and 5, plus the script wired into the existing mutation paragraph.
- [x] `npm test` 773 pass; `npx eslint scripts/mutate-check.mjs` clean.
- [ ] NOT actioned: `docs/testing.md` is 289 lines vs the 200 budget (was already 256). Flagged with `ui/carousel-frame.md` for Fabio's own pass.
