# MPI-66 Checklist

- [x] Diagnose 391 MB windows bundle (ruled out CRLF hashing)
- [x] Find root cause: baseline filename mismatch (windows-x64 vs win32-x64)
- [x] Rename baseline + document CI-matrix naming rule
- [x] release:check passes
- [ ] Confirm minimal windows delta on first post-1.0.0 build (1.0.1)
