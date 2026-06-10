# Registry Audit Notes

Date: 2026-06-10

Observed during release bump audit:

- `js/core/operationRegistry.js` has `imageUpscale` but is missing active commands `t2v_ms`, `i2v_ms`, `resize`, and `resizeVideo`.
- `operation_registry.json` is missing `imageUpscale`, `resize`, and `resizeVideo`, and should be checked again after adding `t2v_ms`/`i2v_ms`.
- `js/data/modelConstants/models.js` uses `t2v_ms` and `i2v_ms` for WAN 2.2.
- `js/data/modelConstants/universal_workflows.js` defines `imageUpscale`, `resize`, and `resizeVideo` as universal workflows.
- `routes/projects.js` creates projects at `schemaVersion: 1`; `js/data/projectModel.js` creates `schemaVersion: 2`.
- `scripts/pre_release_test.py` still searches `appVersion.js` for `COMFY_VERSION`.
- `scripts/build-portable.mjs` uses `package.json` version for artifact names and manifests, but does not enforce parity with `APP_VERSION`.
