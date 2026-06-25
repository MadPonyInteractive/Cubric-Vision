# MPI-134 — validation checklist

- [ ] Check if an ephemeral Pod on an RTX 3090 (lower-variability card) can connect.

## Context for whoever picks this up

All fixes are on disk + committed (single-owner auto-retry refactor, broadened
`_isStockRefusal` regex, hero-flash feed gate). Live-confirmed working on a **scarce
RTX 5090**: steady "waiting…"/Cancel, no flicker, no self-cancel, no error dialog, no
CONNECTING hero flash. In-stock lower-demand cards connect immediately (happy path OK).

**Only unverified path:** a scarce card actually *freeing mid-wait* → clean flip
waiting → connecting → ready. The RTX 5090 stayed refused the whole session (likely a
RunPod host going into maintenance while still listing capacity — the optimistic-flag
lie this retry was built around), so the win edge was never observed. It shares the same
connect flow the in-stock cards take successfully, so confidence is high — just unwitnessed.

The to-do above is a cheap proxy: confirm an ephemeral Pod on a calmer card (RTX 3090)
connects cleanly. If a high-demand card later sits in retry and then frees, that fully
closes the win-path gap → move card to done.
