# MPI-647 — checklist

- [ ] **Confirm the writer and the window.** `js/shell.js:1538` registers the ONLY
      `models:checked → state.s_installedModelIds` writer, and it registers synchronously
      inside `_initDataRegistries()` (boot step 7, line 230) — so it is always in place
      before the spec's `window.evaluate` runs. The exposed window is the deferred tick in
      `openFlowFromReuse` (`flowService.js`): the open + `_reuseModelToast` run in a
      `setTimeout(…, 0)`, and the spec waits 80ms for them. Any refresh resolving in that
      gap replaces the stub before `flowAvailability` reads it.
- [ ] **Make the stub authoritative, not lucky.** A listener registered after shell's fires
      after shell's (`Events._listeners` is a `Set`, insertion-ordered, emitted
      synchronously), so re-applying the stub on every `models:checked` restores it inside
      the same emit — before any deferred reader can see the backend value. Unsubscribe at
      the end of the evaluate so the page is left as found.
- [ ] **Reproduce the CI condition deterministically.** Not achievable by waiting: the
      models ARE installed on this machine, so the boot refresh never lands empty here.
      Provoke it instead — emit `models:checked` with an empty set inside the 80ms window,
      which is exactly what a CI runner with nothing installed does. Must fail case 4
      (`legacyCard`) without the fix and pass with it.
- [ ] **Do NOT widen the 80ms sleep.** Named on the card: it moves the flake, it does not
      remove it.
- [ ] **Run the desktop spec** (Playwright/Electron — `npm test` cannot see it).
