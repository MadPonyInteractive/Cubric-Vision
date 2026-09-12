# MPI-729 — a back chip to the Gallery in the Flow Library header

- [ ] Mount an `MpiButton` (`icon: 'back'`, `label: 'Gallery'`, `size: 'sm'`,
      `variant: 'ghost'`) into `.mpi-flow-library__head`, prepended ABOVE the title —
      the same Primitive and props `MpiBaseFlow` uses for its own `← Flows` chip
      (`MpiBaseFlow.js:274`), so the two ends of the breadcrumb match.
- [ ] Show it ONLY when `state.currentPage === PAGE_GALLERY` — the same gate the detail
      panel's Open button already derives as `canOpen` (`MpiFlowLibrary.js:484`).
      Landing keeps the overlay X as its only exit.
- [ ] **The gate is per-OPEN, not per-mount.** `shell.js:487` mounts this component once
      and reuses the instance for every `flows:open`, so a visibility decision made in
      `setup` is frozen at whatever page the FIRST open happened on. Re-derive it in
      `el.open()`.
- [ ] Click = `el.close()`. Hiding the overlay already restores the gallery underneath;
      no `navigate()`, which would tear that down and rebuild it for nothing (the same
      reasoning `_flipWorkspace` records at `navigation.js:110`).
- [ ] Teardown like the existing `closeBtn`: `.el.destroy?.()` in `el.destroy`.
- [ ] CSS: `__head` stays a plain block; the chip takes a bottom margin. Title and sub
      do not move, in either entry context.
- [ ] Verify in a running app (`npm run app:isolated`, never `:3000`): from a Flow →
      `← Flows` → chip is top-left and returns to the gallery; from Landing → no chip,
      X still the only exit; Escape still closes in both.
