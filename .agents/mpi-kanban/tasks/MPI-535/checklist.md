# MPI-535 Checklist

- [x] Clip state recorded on the generation entry (activeGenerations), cleared with the gen
- [x] Marker payload {length, rate} carried through commandExecutor -> generationService -> bus
- [x] Gallery card re-reads clip state per frame instead of latching it
- [x] Playback paced by the announced rate (H3 24, LTX 16), ring sized by the announced length
- [x] Verified: 6/6 headless lifecycle tests + a real-renderer playback probe (validation.md)
- [x] npm test 552/552, eslint clean on every changed file
- [x] docs/preview-bus.md records the contract
- [x] Fabio reran H3 i2v on the fixed renderer: latents loop at clip speed. Confirmed 2026-08-11.
