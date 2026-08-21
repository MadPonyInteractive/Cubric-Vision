# MPI-443 - plan

Approved plan: C:/Users/Fabio/.claude/plans/just-today-i-found-federated-summit.md

1. tests/desktop/launch.js - shared launchApp(testInfo) returning app, window, consoleErrors, pageErrors.
2. tests/desktop/popup-contract.spec.js - primitive contract, reproduces the 8184709b probe.
3. tests/desktop/model-settings-popup.spec.js - the real shipped surface, plus the MPI-356 storm guard.
4. tests/desktop/workspace-sweep.spec.js - breadth over the surfaces the user rarely visits.
5. Release gate in .claude/skills/mpi-version-bump/SKILL.md step 6, note in mpi-release/SKILL.md gate 1.
6. Follow-up card for the CI workflow (blocked on the @cubric/connector file dependency).
