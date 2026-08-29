# MPI-655 Checklist

- [x] Reproduce the stranding before touching code —
      `tests/partial-install-strands-weights.test.cjs`, real functions against a
      throwaway engine/models root, with a negative control on an empty tree.
- [x] Fix in the UI layer only — detail-footer `else` branch renders a secondary
      **Remove files** from `st.partial.hasPartialProgress`, routed to the
      existing `_confirmWholeUninstall`. Zero lines in `routes/downloadManager.js`.
- [x] Verify: `npm test` 776/776, eslint clean, and proven in a sandboxed
      `app:isolated` instance (`removed 2, kept 4 universal, 0 shared`).
- [ ] Fabio confirms the footer surface in the running app — the card is
      `validating` on this, since the proof is a UI/UX judgement.

_Reconstructed 2026-08-29 during MPI-656 planning: the card reached `doing`
without this file, which board validation rejects. Items reflect the shipped
commit `cf28a816` and the verification this session confirmed independently._
