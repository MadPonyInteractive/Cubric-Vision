# MPI-443 - validation

Evidence required before this card closes:

- Full npm run test:desktop output showing the three new specs passing alongside the 8 pre-existing ones.
- Both negative controls run LIVE, each showing the expected assertion failing by name and passing again after the sabotage is reverted. A spec that cannot fail is vacuous.
- Port 3000 must be free for the run: server.js hardcodes it, so a desktop run started while the app is already open silently tests against the ALREADY-RUNNING server instead of the one the spec launched.
