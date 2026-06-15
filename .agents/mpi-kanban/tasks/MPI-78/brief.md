# MPI-78 Brief

Allow running a Pod with NO network volume (no data center selected). The image is already downloaded; only model downloads would be missing. Viable for a single-model user.

**NOT BLOCKED (2026-06-15):** the prior dependency — the model-download speed-up (aria2c) — is already built into the current Pod images. No rebuild gate; this is now app-side work only (UI to provision a no-volume Secure Cloud Pod + run downloads to ephemeral container storage). Independent of the MPI-81 rebuild batch.

Still Secure Cloud. (Created 2026-06-14, another session — workspace files were left uncreated; backfilled 2026-06-15.)
