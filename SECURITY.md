# Security Policy

## Supported Versions

Cubric Vision is preparing for its first public release. Until a stable public
release exists, security fixes target the current `master` branch.

## Reporting A Vulnerability

Do not open a public issue with exploit details, private tokens, credentials,
or user data.

Use GitHub private vulnerability reporting if it is enabled for this repository.
If private reporting is not available, open a minimal public issue asking for a
private contact path and include no sensitive details.

## Secrets And Local Files

Never commit API tokens, Hugging Face tokens, local model-upload scripts,
private keys, `.env` values, or user project data. The repo history was cleaned
before public release; keep it clean.

## Portable Artifacts

Portable artifacts contain readable source and dependencies. Treat artifact
distribution as a release-channel decision, not a source-code secrecy boundary.
