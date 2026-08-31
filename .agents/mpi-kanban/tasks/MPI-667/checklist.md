# MPI-667 - checklist

- [x] Offer every CPU flavor on the download-mode create spec instead of the single `cpu3c`.
      `CPU_FLAVORS = ['cpu3c','cpu3g','cpu5c','cpu5g']`; a refused CPU create walks it.
- [x] Correct the reconnect comment that asserts CPU capacity is always available.
- [x] Prove the spec change lands: `tests/pod-cpu-flavors.test.cjs`, 3/3 pass against the
      real route module (walks the list, stops on first success, GPU path still one attempt).
      36/36 also pass across the five neighbouring pod/remote suites.
- [ ] Live: Connect with "No GPU - download only" in EU-RO-1 and get a podId.
      NEEDS THE USER - the app must be restarted to load the new route code, and driving
      the user's own session is banned.

## Not done here

Push is HELD. `.husky/pre-push` refuses master while its last run is red, and the red is
run 33420864054 (MPI-666, `licence-gate.test.cjs`: "a flow-only dep key resolves its licence
exactly as a model id does"). That test PASSES in this working tree - the fix is in a peer's
uncommitted edits to `js/data/modelConstants/licences.js` and friends - so master goes green
on their commit, not on anything this card can do. `--no-verify` is not ours to take: this
card is not the fix for that run.
