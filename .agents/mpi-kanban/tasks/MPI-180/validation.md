# MPI-180 Validation

## Verified (automated, 2026-07-02)
- eslint clean; extraction desktop spec still green.
- Logic: selected gpuType force-appended to options when the availability filter drops it (label = displayName, meta = Unavailable right now · selected card). CPU sentinel + empty selection unaffected.

## Needs live confirm
- Re-open Settings while connected on a card whose stock reads unavailable -> dropdown face shows the card instead of Select GPU...

## Live verification (user, 2026-07-02)
- Connected, generated, disconnected on a real Pod (RTX 2000 Ada, EU-RO-1) through the extracted component.
- Both disconnect paths verified: terminate (keep Pod) and delete Pod.
- MPI-180 dropdown fix confirmed working live.
