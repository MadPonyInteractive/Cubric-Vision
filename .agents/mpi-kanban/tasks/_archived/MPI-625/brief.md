# MPI-625 Brief

`tests/orphan-sweep.test.cjs` failed on the dev machine while staying green on CI.

**Root cause — the test, not the product.** `process.env.CUBRIC_MODELS_ROOT = <temp>`
only moves the DEFAULT models root. Every on-disk answer routed through
`comfy.localModelsCheck` prefers `getCustomRoot()` (routes/shared.js), which reads
`base_path:` out of `<ENGINE_ROOT>/extra_model_paths.yaml` — the real `G:/CubricModels`.
So the assertion depended on which models the developer happened to have installed.
`boogu-edit-balanced` is genuinely installed there, so it legitimately defended the shared
`boogu-qwen3vl-8b-clip` encoder and the "orphan should be swept" assertion failed.

The sweep itself behaved correctly and no user was ever affected. CI was hermetic
(no yaml -> `getCustomRoot()` returns null), so the release gate was never lying.

Second, quieter cost: test 2 (`refuses a dep an installed model still wants`) passed
LOCALLY off the real disk rather than off its fixture, so it proved nothing on this
machine.

**Fix.** `tests/helpers/sandbox-roots.cjs` pins `CUBRIC_ENGINE_ROOT` as well, so there is
no yaml to read and every answer comes from the temp root. Four other tests carried the
same half-sandbox and were converted. `tests/sandbox-roots-hygiene.test.cjs` fails any
test file that assigns `CUBRIC_MODELS_ROOT` without pinning the engine root.

**Rejected:** a `--require` preload wired into `npm test`. Env inherits from the parent,
so all parallel test processes shared ONE models root; cross-talk broke `orphan-sweep`
and `smoke-free-space` (3 failures). Reverted. The reasoning is recorded in the hygiene
test's header so it is not retried.
