# MPI-697 Checklist

- [x] Anchor both file-path patterns on their interpreter
- [x] Scope the exemption lookahead to the current command segment
- [x] Leave the two URL patterns broad, and write down why
- [x] Update the `## gpu_command_patterns` prose in `.local.md`
- [x] 29-case table green against patterns parsed from the real file
- [x] Guard still armed after the edit (`configured_patterns` returns 4, not `[]`)
