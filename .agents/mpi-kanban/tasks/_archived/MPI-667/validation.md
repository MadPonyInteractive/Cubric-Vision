# MPI-667 — validation

## What the refusal actually was

RunPod had **no CPU capacity to sell in EU-RO-1** on 2026-08-31. Confirmed by the user in the
RunPod console: `Deploy a Pod → CPU`, network volume attached (region locked to EU-RO-1), and
**not one card could be selected**. External supply, not an app defect.

## What shipped anyway, and why it still earns its keep

The spec named `cpuFlavorIds: ['cpu3c']` and nothing else, so ONE flavor going quiet took the
whole download-mode feature down with no second attempt. That is a real single point of
failure independent of today's outage.

- `CPU_FLAVORS = ['cpu3c', 'cpu3g', 'cpu5c', 'cpu5g']`; a refused CPU create walks the list.
  `cpu3c` stays first — cheapest, and the only id proven to create (2026-07-29, pods
  `5guftel67o99u4` / `omi9588i0gymlu`).
- The GPU path keeps its single attempt: out-of-stock there is the shell's retry / DC-steering
  signal, and the card is the user's choice, not ours to substitute.
- The reconnect path's comment claiming "CPU capacity is effectively always available" is
  corrected. Today disproved it.
- Download mode's refusal copy no longer says *"that GPU is out of stock — pick another card"*.
  There is no card to pick on a Pod with no GPU. It now names CPU scarcity and points at a
  GPU in the same DC, since the volume is DC-locked and mounts identically either way.

## Evidence

- `tests/pod-cpu-flavors.test.cjs` — 3/3, against the real route module with `client.createPod`
  stubbed at the shared singleton, so the spec under test is the one the route builds: the walk
  covers every flavor, stops on the first success, and never leaks onto the GPU path.
- 36/36 across `download-mode-pod-guards`, `orphan-sweep-remote`, `pod-volume-disk`,
  `runpod-remote-hardening`, `pod-self-heal-dead`.
- **Live**, user's app, 2026-08-31T18:38:01–03Z: the walk ran end to end, four attempts
  ~550ms apart, each `http 500`. Mechanism verified in the real app; the Pod did not create
  because there was nothing to create it on.
- Live control: a 5090 in the same DC on the same volume connected fine minutes later.

## The wrong turn, kept on the record

Between those two, one commit read the refusal as a bad flavor id and switched to sized ids
(`cpu3c-2-4`), reasoning that the console showed the CPU grid **available and priced** while the
app was refused. The premise was false: RunPod renders that grid with live pricing even when
nothing is deployable, so a priced card is not an available one — only clicking it settles that,
and the user was the one who could see it. Reverted in `8ae312c7`; it had also demoted the one
proven id to fifth, which would have fired four unproven requests before the known-good one when
capacity returns. The lesson is in `docs/runpod-troubleshooting.md`: read the console by
selectability, not by price.

## Not closed by this card

- **Auto-retry in download mode is unproven.** A stock refusal with `autoRetry` on hands off to
  the background wait (`_handoffToWait`), and `_isPickedGpuInStock` returns `true` for `__cpu__`
  unconditionally — so the wait may never see a reason to stop and never retry meaningfully. Not
  hit today (the hint path ran instead) and not investigated. Worth its own card if a user in
  download mode ever reports a silent forever-wait.
- **Push held.** `.husky/pre-push` refuses master while its last run is red — run
  `33420864054`, MPI-666's `licence-gate.test.cjs`. That test passes in this working tree on a
  peer's uncommitted `licences.js` edits, so it clears on their commit, not on anything here.

## User confirmation, 2026-08-31 (post-close)

The user reports CPU Pods still will not create, **and that they cannot create one from
RunPod's own console either**. That is the independent check this card could not make for
itself: the refusal reproduces outside the app, so the cause is RunPod capacity, not
Cubric Vision. The CPU_FLAVORS walk shipped here removes a real single point of failure
regardless, but it cannot manufacture capacity and was never expected to.

