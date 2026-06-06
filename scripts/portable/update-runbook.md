# Portable Update Runbook

This directory is reserved for portable update helpers, extracted update
payloads, and rollback data.

The MPI-8 updater skeleton is intentionally conservative. Root update scripts
validate inputs and print the portable paths they would use, but they do not
replace or delete app-owned files yet.

Always preserve:

- engine/
- models/
- user-data/
- <documents>/Cubric Studio/Projects/
