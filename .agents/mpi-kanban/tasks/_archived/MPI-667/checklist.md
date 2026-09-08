# MPI-667 - checklist

- [x] Offer every CPU flavor on the download-mode create spec instead of the single `cpu3c`.
      `CPU_FLAVORS = ['cpu3c','cpu3g','cpu5c','cpu5g']`; a refused CPU create walks it.
- [x] Correct the reconnect comment that asserts CPU capacity is always available.
- [x] Prove the spec change lands: `tests/pod-cpu-flavors.test.cjs`, 3/3 against the real
      route module. 36/36 across the five neighbouring pod/remote suites.
- [x] Live: the walk ran end to end in the user's own app (18:38:01-03Z), four attempts
      ~550ms apart, each http 500.
- [x] Say the right thing when it fails: download mode no longer tells the user to "pick
      another card" on a Pod that has no card to pick.

## Outcome

The Pod did not create because RunPod had NO CPU capacity in EU-RO-1 - confirmed in the
console with the volume attached: not one card selectable. External supply. A 5090 on the
same volume connected minutes later, which is the workaround the copy now names.

Full write-up, including the sized-flavor-id detour and its revert (8ae312c7), in
validation.md.
