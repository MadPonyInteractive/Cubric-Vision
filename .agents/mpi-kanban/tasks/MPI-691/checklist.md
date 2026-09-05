# MPI-691 Checklist

- [x] `_remoteDepSpecs` map so an outstanding dep can be re-issued whole
- [x] `_recoverOrphanedRemoteInstalls()` — ask `remoteActiveInstallIds()`, re-enqueue orphans
- [x] Chain it onto the reconcile in `_onRemoteStreamClosed`
- [x] `_remoteReissueRounds` bound → `_failOutstandingRemoteDeps` after `REMOTE_REISSUE_LIMIT`
- [x] Reset the counter on any real SSE event
- [x] New test: orphan re-issue, then terminal failure after the limit
- [x] `npm run lint` + `npm test`
