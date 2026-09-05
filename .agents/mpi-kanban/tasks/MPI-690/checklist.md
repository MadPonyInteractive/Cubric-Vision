# MPI-690 Checklist

- [x] `remotePodLifecycle.js`: `CPU_DOWNLOAD_VCPUS` + `spec.vcpuCount` on the `noGpu` branch
- [x] `downloadManager.js`: `REMOTE_DOWNLOAD_CONCURRENCY` + install queue + pump
- [x] Queue-aware: `_teardownRemoteEventStreamIfIdle`, `_onRemoteStreamClosed`, `_failOutstandingRemoteDeps`, stall watchdog
- [x] `tests/pod-cpu-flavors.test.cjs`: assert the CPU spec carries a vCPU count
- [x] New test: remote install fan-out is capped and refills on settle
- [x] `npm run lint` + `npm test`
- [ ] Live: resumed smoke matrix passes 60.6 GB with no `exit code 137`
