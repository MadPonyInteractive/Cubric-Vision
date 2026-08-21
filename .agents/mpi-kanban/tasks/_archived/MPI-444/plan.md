# MPI-444 - plan

Split out of MPI-443, which deliberately did NOT ship a CI workflow.

1. Decide the @cubric/connector resolution with the user - this gates everything else.
2. Add .github/workflows/tests.yml on windows-latest: checkout, setup-node with npm cache, npm ci, npm test, npm run test:desktop.
3. Upload test-results/ on failure.
4. Prove a red suite actually fails the workflow on a throwaway branch.
5. Decide whether build-portable.yml should depend on it.
