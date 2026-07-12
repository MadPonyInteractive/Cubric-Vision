# MPI-148 Checklist

- [x] App: bump dev_configs/node_lock.json comfyui block -> v0.27.0/bb131be9, frontend 1.45.20, templates 0.11.1 (DONE)
- [x] Pod: sync copy mpi-ci/cubric-vision-pod/node_lock.json; commit+push mpi-ci (bc649a7) (DONE)
- [x] App-side pin: routes/remotePodLifecycle.js POD_IMAGE_VERSION(_CPU) -> v0.11.0 (commit 54a62ce, local) (DONE)
- [x] Build v0.11.0: cpu (CI) + cu128 + cu124 (local) all built, verified, PUSHED, pull-verified PUBLIC (DONE)
- [x] cpu boot smoke: /health 200, wrapper_version 0.2.23 (PASS)
- [x] FIX: weight-prebake HF-Xet 403 -> R2 (Dockerfile, commit 1911aef); proven on cu124 rebuild (0x403) (DONE)
- [x] Guidance: 01-environments.md (G:/CubricModels) + runpod-troubleshooting (403 trap) + pod README + memory (71da6a9) (DONE)
- [ ] LIVE (USER): redeploy fresh Pod on v0.11.0; verify app.log image line + /health; gen smoke LTX-2.3 + Wan 5B + PiD on v0.27
- [ ] App portable engine swap to v0.27 (gitignored, out-of-repo, separate) [USER]
- [ ] Builder image bump -> split to MPI-183 (deferred) [USER when needed]
