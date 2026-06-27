# MPI-103 Plan

Sequence (wrapper → app → image → verify). Wrapper + app land in lockstep with a
WRAPPER_VERSION bump so the app's new push route only talks to a wrapper that has
the endpoint.

1. Wrapper code (mpi-ci `cubric-vision-pod/wrapper/wrapper.py`) → verify: local
   syntax/lint; endpoint shape matches the existing `/wrapper/restart-comfy` guard.
2. App routes + UI (Cubric-Vision) → verify: `/proxy/idle-timeout` forwards with
   Bearer; Settings input editable while connected; change → POST + toast; hint
   rewritten; `idle_timeout_s` read back from /health.
3. Image build (mpi-ci dispatch, cu124/cu128/cpu) → verify: tags pushed + public;
   WRAPPER_VERSION reported by `/health` matches the app's expected version.
4. F8 live verify on the new image (items a/b/c) → verify: RunPod console shows
   STOPPED at the configured timeout; live-changed value honored without recreate.

USER-gated: image build dispatch is authorized when the user says go; live Pod
ops (connect/verify) are USER-driven, Claude observes.
