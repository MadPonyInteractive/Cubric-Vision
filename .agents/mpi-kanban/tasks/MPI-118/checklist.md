# MPI-118 Checklist

## Engine bump (DONE)
- [x] `node_lock.json` core v0.19.3 → v0.25.1 (eca4757), frontend 1.45.15 / templates 0.10.0
- [x] App engine bump validated live on Windows (t2i, t2v, frame-interp, UW mask+detail)
- [x] RES4LYF removed (unused; Builder-image-only)
- [x] Upgrade-flow hardening: getCustomRoot() before engine wipe (YAML preserved); PYTHONUTF8=1 spawn

## Pod image (v0.5.0)
- [x] Engine v0.25.1 baked into cu124 + cu128 images via lock (mpi-ci be03b86)
- [x] cu124/cpu (CI) + cu128 (local) pushed + public; 5a pull-verify + 5b boot smoke pass
- [x] App POD_IMAGE_VERSION → v0.5.0 (remoteProxy.js 8c1ec47)

## Validating
- [ ] **VALIDATING:** live Pod verify — fresh Pod boots v0.5.0 image, engine v0.25.1 runs a real gen, `/health` wrapper_version 0.2.11
