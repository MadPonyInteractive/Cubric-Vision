# MPI-93 Checklist

- [x] F8 - Crash-watchdog backstop live verify. SUPERSEDED by MPI-103 (2026-06-16):
      the wrapper idle-watchdog is being rebuilt there (live-updatable timeout +
      new image), so verifying the old watchdog now was moot. F8 (a) box-OFF
      warm-stop, (b) simulated-crash self-stop, and the new (c) live-update-honored
      checks are carried into MPI-103's checklist/validation against the NEW image.

> M4 (cancel mid-gen), M5 (big T2V on 64GB+), A3 (OOM toast), G5 (volume-delete-
> with-attached-Pod) were verified earlier this session. F8 was the only item left
> on this checklist; with it moved to MPI-103, MPI-93 is closed.
