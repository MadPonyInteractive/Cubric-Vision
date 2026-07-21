# MPI-228 Validation

**Closed: could not reproduce.**

## Repro attempt (2026-07-08, user-driven)

Ran the exact reported sequence on the `new tests` project: back-to-back
multi-stage previews (WAN 2.2 Smooth then LTX 2.3 B, both "Preview Initial
Stage" on). The LTX preview card painted **its own** preview video (dog +
red dress), NOT the prior WAN preview's video (three boys jumping). No
wrong-item paint observed. Renderer console clean, no errors.

If the bug were still live, the top-left LTX preview card would have shown the
WAN "three boys jumping" video. It did not.

## Conclusion

Bug no longer reproduces. Most likely fixed incidentally by one of the
post-carding fixes on the same store/queue/paint surface:

- MPI-234 — post-cancel UI writes must reconcile from store (killed two
  post-cancel stompers: gallery `setGroups` wiping placeholder; statusBar
  latch stuck idle).
- MPI-226 — Stop-during-loop double-fire guard + `persistGroups` save-loss
  retry.
- MPI-227 — content-addressed permanent preview-assets store.

No code change made for MPI-228 — investigation only, closed as can't-repro.
If it resurfaces, open a fresh card with new console capture.
