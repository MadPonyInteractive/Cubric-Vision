# MPI-122 Investigation Summary

Three read-only investigations covered the registry contract, Models-panel UX, and local/remote download lifecycle.

Decisions:

- Canonical model id: `wan-22`; split ids become runtime aliases.
- Registry: `dependencies` for always-required files plus `operationDependencies` for meaningful selectable operation payloads.
- One pure resolver produces stable, deduplicated dependency snapshots.
- Existing dependency jobs, refcounts, markers, and SSE remain model-level.
- Runtime separates capability (`supportedOps`) from availability (`installedOps`).
- Intentional operation omission is not a partial install.
- Fresh installs default all selectors on; active-job selection metadata survives status recovery; restart ambiguity falls back to all selected.
- Uninstall remains whole-model and resolves the complete dependency universe.
- Initial selectors apply to Wan T2V/I2V only; the mechanism is generic for future models.

Primary risks:

- Flat-dependency consumers silently producing false install/partial states.
- Force-local checks requiring unselected operation files.
- Repeated starts double-counting totals/refcounts.
- Backend local uninstall trusting renderer-only `MODELS[].installed`.
- Remote/local status divergence.
- Static `supportedOps` exposing unavailable operations.
- Split-id persistence and historical lookup failures.
