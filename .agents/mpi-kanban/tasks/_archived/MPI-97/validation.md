# MPI-97 Validation

App-side only, no image rebuild. Card stays `doing` / `validating` until USER live-verifies on a real remote Pod — no Pod in this session.

## Acceptance

1. **No collision dialog.** Queue I2V while T2V's shared deps (`umt5_xxl_fp8_e4m3fn_scaled`, `wan_2.1_vae`) are mid-install → both cards complete; NO "Download Failed" + Report-on-GitHub dialog; app.log shows NO second `/wrapper/models/install` for the in-flight dep ("already downloading" line absent).
2. **Shared cancel safe.** Cancel one of two models sharing an in-flight dep → the other keeps installing; the shared dep is not wrapper-cancelled (refCount ≥ 1 remains).
3. **SSE recover.** Force/observe `remote install SSE closed` mid-install → card recovers to a terminal state (complete or real failure), never a permanent 100% hang.
4. **3+ parallel.** Queue three models incl. a deps-sharing pair → all reach correct final installed state.

5. **Uninstall keeps files when unchecked (remote).** Uninstall a model with "delete files from disk" UNCHECKED → the model's weights STAY on the Pod volume (model is NOT dragged to PARTIALLY INSTALLED); a subsequent re-install is near-instant. Repeat with the box CHECKED → bytes removed from the volume. (Folded-in bug: remote branch was ignoring `deleteFiles` and always deleting; cost a user ~30GB.)

## Notes

- Wrapper `.part` orphan cleanup (MPI-81 #9) is OUT of scope — wrapper-side, future image. Record as follow-up, do not rebuild image.
- Phase 5 (deleteFiles) folded in from an agent handoff message (remote-uninstall bug, same file + same `project_remote_route_branch_audit` family). App-side only, no image change.
