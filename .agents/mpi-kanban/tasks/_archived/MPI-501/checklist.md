# MPI-501 Checklist

- [x] Drain-wait helper on the engine (`waitForIdleQueue`, engine-aware via `httpBase()`)
- [x] Generation gate refuses instead of restarting (`comfyController.js`)
- [x] Dev radial refuses fast (`navigation.js`)
- [x] Server-side universal-node install skips the restart loudly (`routes/remoteModels.js`)
- [x] Unit test drives the real helper (`tests/restart-drain-wait.test.cjs`)
- [ ] Live proof: a GPU leg with the app OPEN on the engine path
