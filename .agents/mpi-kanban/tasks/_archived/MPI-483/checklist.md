# MPI-483 Checklist

- [x] Bug 1 - `/wrapper/disk` reports real allocated blocks, not apparent size
- [x] Bug 1 - sweep every `du -sb` call site and the false comments that hid it
- [x] Bug 2 - smoke preflight refuses to rent unless MEASURED free bytes cover the remaining requirement
- [x] Tests green with a proven negative control (7 asserts, `tests/smoke-free-space.test.cjs`)
- [ ] Wrapper half verified on a Pod (pair with Gate B's throwaway-Pod session)
